import { Buffer } from "node:buffer";
import { createFileSecretStore } from "@molis-ai/molis-work-storage";
import { withConnectorConnections } from "./connector-connection-store.js";
import { resolveUsableGmailAccessToken } from "./gmail-oauth.js";
import type { ContextSource, ContextSourceKind, ImportFile, ContextFileMetadata } from "./context-onboarding-store.js";

export const CONTEXT_DIRECTORY_KINDS = ["downloads", "documents", "desktop", "custom"] as const;
const KINDS: ContextSourceKind[] = ["files", "directory", ...CONTEXT_DIRECTORY_KINDS, "browser", "gmail", "chat"];
export const isContextDirectory = (kind: ContextSourceKind) => CONTEXT_DIRECTORY_KINDS.some(id => id === kind);
export const supportedContextFile = (path: string) => /\.(?:md|markdown|txt|csv|json|html?|pdf|docx)$/iu.test(path);
function relativePath(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 4096 || /[\\\u0000-\u001f]/u.test(value)
    || value.split("/").some(part => !part || part === ".." || part.startsWith(".") || ["node_modules", "vendor", "dist", "build"].includes(part))) throw new Error("文件范围无效");
  return value;
}
export function includedContextFiles(source: ContextSource): ContextFileMetadata[] {
  return (source.metadata?.files ?? []).filter(file => !(source.excluded ?? []).some(path => file.path === path || file.path.startsWith(path + "/")));
}
export function contextSources(value: unknown): ContextSource[] {
  if (!Array.isArray(value) || value.length > KINDS.length) throw new Error("来源清单无效");
  const seen = new Set<string>(); let totalBytes = 0, totalFiles = 0;
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
    if (source.days !== undefined) {
      if (![0, 7, 30, 90].includes(Number(source.days))) throw new Error("时间范围无效");
      result.days = Number(source.days) as ContextSource["days"];
    }
    if (result.kind === "gmail") result.days = source.days === 7 ? 7 : 30;
    if (source.metadata !== undefined) {
      const metadata = source.metadata as Record<string, unknown>;
      if (!metadata || !Array.isArray(metadata.files) || metadata.files.length > 200) throw new Error("文件预览无效");
      const paths = new Set<string>();
      result.metadata = { files: metadata.files.map((file: ContextFileMetadata) => {
        const path = relativePath(file?.path);
        if (paths.has(path) || !supportedContextFile(path) || !Number.isSafeInteger(file.size) || file.size < 0 || !Number.isSafeInteger(file.modified_ms) || file.modified_ms < 0 || typeof file.identity !== "string" || file.identity.length > 200) throw new Error("文件元数据无效");
        paths.add(path); return { path, size: file.size, modified_ms: file.modified_ms, identity: file.identity };
      }), skipped: Number.isSafeInteger(metadata.skipped) && Number(metadata.skipped) >= 0 ? Number(metadata.skipped) : 0, truncated: metadata.truncated === true };
    }
    if (source.excluded !== undefined) {
      if (!Array.isArray(source.excluded) || source.excluded.length > 400) throw new Error("排除范围无效");
      result.excluded = [...new Set(source.excluded.map(relativePath))];
    }
    if (source.files !== undefined) {
      if (!Array.isArray(source.files) || source.files.length > 50) throw new Error("每次最多选择 50 份文件");
      const paths = new Set<string>();
      result.files = source.files.map((file: ImportFile) => {
        const path = relativePath(file?.path);
        if (paths.has(path) || !supportedContextFile(path)) throw new Error("文件类型无效或重复");
        paths.add(path);
        if ((isContextDirectory(result.kind) || result.metadata) && !includedContextFiles(result).some(f => f.path === path)) throw new Error("文件不在本次预览选定范围内");
        if (typeof file.reason === "string" && file.reason.length <= 600 && file.data === undefined) return { path, reason: file.reason };
        if (typeof file.data !== "string" || file.data.length > 8_000_000 || file.data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(file.data)) throw new Error("文件内容无效");
        if (result.selected) { totalFiles++; totalBytes += Buffer.from(file.data, "base64").length; }
        if (totalFiles > 50 || totalBytes > 6_000_000) throw new Error("本次最多 50 份文件、总大小 6 MB，请缩小选择");
        return { path, data: file.data };
      });
    }
    return result;
  });
}
export async function readContextSource(home: string, source: ContextSource): Promise<{ name: string; locator: string; files: ImportFile[] }> {
  if (source.kind === "browser") {
    if (!source.text?.trim()) throw new Error("请粘贴要整理的网页正文");
    return { name: "浏览器内容", locator: "upload", files: [{ path: "网页内容.md", data: Buffer.from(`# 网页内容\n\n${source.url ? `原网址：${source.url}\n\n` : ""}${source.text}`).toString("base64") }] };
  }
  if (source.kind === "gmail") return readOnboardingGmail(home, source);
  if (!source.files?.length) throw new Error(isContextDirectory(source.kind) ? "请返回预览，在应用中读取已选文件" : "请选择要整理的文件");
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
