import { Buffer } from "node:buffer";
import { createFileSecretStore } from "@molis-ai/molis-work-storage";
import type { ImportFile } from "@molis-ai/molis-work-plugin-cognia";
import { withConnectorConnections } from "./connector-connection-store.js";
import { resolveUsableGmailAccessToken } from "./gmail-oauth.js";
import { cogniaActions } from "@molis-ai/molis-work-plugin-cognia";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ContextSource, ContextSourceKind } from "./context-onboarding-store.js";

const KINDS: ContextSourceKind[] = ["files", "directory", "browser", "gmail", "chat"];
export function contextSources(value: unknown): ContextSource[] {
  if (!Array.isArray(value) || value.length > 5) throw new Error("来源清单无效");
  const seen = new Set<string>();
  return value.map((raw: unknown) => {
    if (!raw || typeof raw !== "object") throw new Error("来源无效");
    const source = raw as Record<string, unknown>;
    if (!KINDS.includes(source.kind as ContextSourceKind) || seen.has(String(source.kind))) throw new Error("来源类型无效或重复");
    seen.add(String(source.kind));
    const result: ContextSource = { kind: source.kind as ContextSourceKind, selected: source.selected === true };
    for (const key of ["path", "text", "url", "connection_id"] as const) {
      if (source[key] !== undefined) {
        if (typeof source[key] !== "string" || (source[key] as string).length > (key === "text" ? 100_000 : 4096)) throw new Error("来源范围过长或无效");
        result[key] = source[key] as string;
      }
    }
    if (result.url) { const url = new URL(result.url); if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("请输入有效的网页网址"); }
    if (source.files !== undefined) {
      if (!Array.isArray(source.files) || source.files.length > 50) throw new Error("每次最多选择 50 份文本文件");
      let bytes = 0;
      result.files = source.files.map((file: unknown) => {
        if (!file || typeof file !== "object" || !("path" in file) || !("data" in file) || typeof file.path !== "string" || typeof file.data !== "string") throw new Error("文件内容无效");
        bytes += Buffer.byteLength(file.data); if (bytes > 8_000_000) throw new Error("文件总大小超过 6 MB，请减少选择");
        if (!/\.(?:md|markdown|txt|csv|json|html?)$/iu.test(file.path)) throw new Error("请使用 Markdown、文本、CSV、JSON 或保存的网页文件");
        // HTML is imported as inert text; no scripts or remote requests are executed.
        const path = /\.(?:html?|csv|json)$/iu.test(file.path) ? file.path + ".txt" : file.path;
        return { path, data: file.data };
      });
    }
    if (result.kind === "gmail") result.days = source.days === 7 ? 7 : 30;
    return result;
  });
}
export async function readContextSource(home: string, source: ContextSource, actions?: BoundActionClient): Promise<{ name: string; locator: string; files: ImportFile[] }> {
  if (source.kind === "directory" && !source.files?.length) {
    if (!source.path?.trim()) throw new Error("请先选择要读取的目录");
    if (!actions) throw new Error("本机目录读取需要 Home 动作服务");
    const scanned = await actions.invoke(cogniaActions.scan, { path: source.path.trim() });
    return { ...scanned, files: scanned.files.filter(file => /\.(?:md|markdown|txt|csv|json)$/iu.test(file.path) || file.reason) };
  }
  if (source.kind === "browser") {
    if (!source.text?.trim()) throw new Error("请粘贴要整理的网页正文");
    return { name: "浏览器内容", locator: "upload", files: [{ path: "网页内容.md", data: Buffer.from(`# 网页内容\n\n${source.url ? `原网址：${source.url}\n\n` : ""}${source.text}`).toString("base64") }] };
  }
  if (source.kind === "gmail") return readOnboardingGmail(home, source);
  if (!source.files?.length) throw new Error(source.kind === "chat" ? "请选择导出的聊天文本文件" : "请选择要整理的文件");
  return { name: source.kind === "chat" ? "聊天记录导出" : "本地文件", locator: "upload", files: source.files };
}

interface GmailPart { mimeType?: string; filename?: string; body?: { data?: string }; parts?: GmailPart[]; headers?: { name: string; value: string }[] }
function messageText(part: GmailPart, depth = 0): string {
  if (depth > 12 || part.filename) return "";
  if (part.parts?.length) {
    const text = part.parts.map(p => messageText(p, depth + 1)).filter(Boolean);
    return part.mimeType === "multipart/alternative" ? text[0] ?? "" : text.join("\n\n");
  }
  if (!part.body?.data || !["text/plain", "text/html"].includes(part.mimeType ?? "")) return "";
  const decoded = Buffer.from(part.body.data, "base64url").toString("utf8");
  return part.mimeType === "text/html" ? decoded.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu, "").replace(/<[^>]+>/gu, " ").replace(/&nbsp;/gu, " ").replace(/&amp;/gu, "&").replace(/&lt;/gu, "<").replace(/&gt;/gu, ">") : decoded;
}
export async function readOnboardingGmail(home: string, source: ContextSource, fetcher: typeof fetch = fetch): Promise<{ name: string; locator: string; files: ImportFile[] }> {
  if (!source.connection_id) throw new Error("请先连接 Google，或跳过 Gmail");
  const connection = withConnectorConnections(home, store => store.require(source.connection_id!, "gmail"));
  if (connection.disconnected_at || !connection.credential_ref) throw new Error("Gmail 已断开，请重新连接");
  const resolved = await resolveUsableGmailAccessToken({ tokenRefs: { access: connection.credential_ref, refresh: connection.refresh_ref ?? "", expiresAt: connection.expires_ref ?? "" } });
  const token = resolved.ok ? resolved.accessToken : connection.auth_method === "token" ? createFileSecretStore().get(connection.credential_ref) : null;
  if (!token) throw new Error("Google 授权已失效，请重新连接");
  const get = async (suffix: string): Promise<Record<string, unknown>> => {
    const response = await fetcher("https://gmail.googleapis.com/gmail/v1/users/me/" + suffix, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000), redirect: "error" });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Gmail 无读取权限，请重新连接 Google" : `Gmail 暂时无法读取（${response.status}），请重试`);
    const text = await response.text(); if (text.length > 4_000_000) throw new Error("邮件内容过大，请缩小范围");
    return JSON.parse(text) as Record<string, unknown>;
  };
  const query = `newer_than:${source.days === 7 ? 7 : 30}d -in:spam -in:trash`;
  const listed = await get(`messages?maxResults=20&q=${encodeURIComponent(query)}`);
  const messages = Array.isArray(listed.messages) ? listed.messages.slice(0, 20) : [];
  const files: ImportFile[] = [];
  for (const item of messages) {
    if (!item || typeof item.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/u.test(item.id)) continue;
    const mail = await get(`messages/${encodeURIComponent(item.id)}?format=full`);
    const payload = mail.payload as GmailPart | undefined;
    if (!payload) continue;
    const header = (name: string) => payload.headers?.find(h => h.name.toLowerCase() === name)?.value ?? "";
    const body = messageText(payload).trim();
    if (!body) { files.push({ path: `${item.id}.md`, reason: "没有可读取的邮件正文，附件未读取" }); continue; }
    const origin = `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(connection.account_label ?? "")}#all/${item.id}`;
    files.push({ path: `${item.id}.md`, data: Buffer.from(`# ${header("subject") || "无主题邮件"}\n\n发件人：${header("from")}\n时间：${header("date")}\n原邮件：${origin}\n\n${body}`).toString("base64") });
  }
  return { name: `Gmail · ${connection.account_label ?? connection.display_name}`, locator: "upload", files };
}
