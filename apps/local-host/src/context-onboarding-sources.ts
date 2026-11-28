import { codeRootFile, contextFileSkip } from "@molis-ai/molis-work-contracts/services/materials";
import { connectorAccountControl } from "./connector-oauth-targets.js";
import { Buffer } from "node:buffer";
import { withConnectorConnections } from "./connector-connection-store.js";
import { resolveApiConnection } from "./connector-access.js";
import { withConnectorRequest } from "./connector-lifecycle.js";
import type { ContextJourney, ContextSource, ContextSourceKind, ImportFile, ContextFileMetadata } from "./context-onboarding-store.js";
import { isStagedDigest } from "./context-onboarding-staging.js";
import { builtinMailboxDrivers, mailboxDriver } from "./builtin-drivers.js";

const CONTEXT_DIRECTORY_KINDS = ["downloads", "documents", "desktop", "custom"] as const;
const KINDS: ContextSourceKind[] = ["files", "directory", ...CONTEXT_DIRECTORY_KINDS, "browser", "mail", "chat", "sessions"];
const isContextDirectory = (kind: ContextSourceKind) => CONTEXT_DIRECTORY_KINDS.some(id => id === kind);
/** A file onboarding takes in: the page's own rule (`contextFileSkip`), checked again here; explicit file picks may stage secret-like files so `prepareContextDocument` can hold them for the person's 3-way choice (`C2`, `S-onboarding-secret-hold`). */
const supportedContextFile = (path: string, allowSecretName = false) => {
  const skip = contextFileSkip(path);
  return skip === null || (allowSecretName && skip === "secret");
};
/**
 * The folder this round may hand to a plugin that takes a code folder: the person's own chosen folder (`custom`, never Downloads,
 * Documents or Desktop), still selected, read from its path, with a build or package file at its top (ONB-44). Null when there is none.
 */
export function codeRoot(journey: Pick<ContextJourney, "sources">): string | null {
  const source = journey.sources.find(s => s.kind === "custom" && s.selected && s.path);
  return source?.path && source.metadata?.files.some(file => codeRootFile(file.path)) ? source.path : null;
}
function relativePath(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 4096 || /[\\\u0000-\u001f]/u.test(value)
    || value.split("/").some(part => !part || part === "." || part === "..")) throw new Error("文件范围无效");
  return value;
}
/** A file's place in its source, as the person chose it: a relative path of a kind onboarding reads or holds for secret review. */
export function contextFilePath(value: unknown): string {
  const path = relativePath(value);
  if (!supportedContextFile(path, true)) throw new Error("文件类型无效");
  return path;
}
export function includedContextFiles(source: ContextSource): ContextFileMetadata[] {
  return (source.metadata?.files ?? []).filter(file => !(source.excluded ?? []).some(path => file.path === path || file.path.startsWith(path + "/")));
}
/**
 * The person's sources for a round, checked for shape. There is no count or size limit (user 2026-10-22): files are uploaded one by
 * one into the journey's staging and named here by digest; reading queues them and says how far it is.
 */
export function contextSources(value: unknown): ContextSource[] {
  if (!Array.isArray(value) || value.length > KINDS.length) throw new Error("来源清单无效");
  const seen = new Set<string>();
  return value.map((raw: unknown) => {
    if (!raw || typeof raw !== "object") throw new Error("来源无效");
    const source = raw as Record<string, unknown>;
    if (!KINDS.includes(source.kind as ContextSourceKind) || seen.has(String(source.kind))) throw new Error("来源类型无效或重复");
    seen.add(String(source.kind));
    const result: ContextSource = { kind: source.kind as ContextSourceKind, selected: source.selected === true };
    for (const key of ["path", "text", "url", "connection_id", "service_id"] as const) {
      if (source[key] !== undefined) {
        if (typeof source[key] !== "string" || (key !== "text" && (source[key] as string).length > 4096)) throw new Error("来源范围过长或无效");
        result[key] = source[key] as string;
      }
    }
    if (result.url) { const url = new URL(result.url); if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("请输入有效的网页网址"); }
    if (source.days !== undefined) {
      if (![0, 7, 30, 90].includes(Number(source.days))) throw new Error("时间范围无效");
      result.days = Number(source.days) as ContextSource["days"];
    }
    if (result.kind === "mail") result.days = source.days === 7 ? 7 : 30;
    if (source.metadata !== undefined) {
      const metadata = source.metadata as Record<string, unknown>;
      if (!metadata || !Array.isArray(metadata.files)) throw new Error("文件预览无效");
      const paths = new Set<string>();
      const rawReasons = metadata.skipped_reasons && typeof metadata.skipped_reasons === "object"
        ? metadata.skipped_reasons as Record<string, unknown>
        : null;
      const safeCount = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0 ? Number(n) : 0;
      const skippedReasons = rawReasons
        ? {
            ignored: safeCount(rawReasons.ignored),
            secret: safeCount(rawReasons.secret),
            unreadable: safeCount(rawReasons.unreadable),
            ...(rawReasons.time !== undefined ? { time: safeCount(rawReasons.time) } : {}),
          }
        : undefined;
      const ignoredRules = Array.isArray(metadata.ignored_rules)
        ? metadata.ignored_rules.filter((r): r is string => typeof r === "string" && r.length > 0 && r.length <= 120).slice(0, 32)
        : undefined;
      const allowSecret = result.kind === "files";
      result.metadata = {
        files: metadata.files.map((file: ContextFileMetadata) => {
          const path = relativePath(file?.path);
          if (paths.has(path) || !supportedContextFile(path, allowSecret) || !Number.isSafeInteger(file.size) || file.size < 0 || !Number.isSafeInteger(file.modified_ms) || file.modified_ms < 0 || typeof file.identity !== "string" || file.identity.length > 200) throw new Error("文件元数据无效");
          paths.add(path); return { path, size: file.size, modified_ms: file.modified_ms, identity: file.identity };
        }),
        skipped: safeCount(metadata.skipped),
        truncated: metadata.truncated === true,
        ...(metadata.cancelled === true ? { cancelled: true } : {}),
        ...(metadata.total_entries !== undefined ? { total_entries: safeCount(metadata.total_entries) } : {}),
        ...(skippedReasons ? { skipped_reasons: skippedReasons } : {}),
        ...(ignoredRules?.length ? { ignored_rules: ignoredRules } : {}),
      };
    }
    if (source.staged_digests !== undefined) {
      if (!source.staged_digests || typeof source.staged_digests !== "object" || Array.isArray(source.staged_digests)) throw new Error("文件暂存索引无效");
      const digests: Record<string, string> = {};
      for (const [rawPath, digest] of Object.entries(source.staged_digests as Record<string, unknown>)) {
        const path = relativePath(rawPath);
        if (!supportedContextFile(path, result.kind === "files") || !isStagedDigest(digest)) throw new Error("文件暂存索引无效");
        digests[path] = digest;
      }
      result.staged_digests = digests;
    }
    if (source.excluded !== undefined) {
      if (!Array.isArray(source.excluded)) throw new Error("排除范围无效");
      result.excluded = [...new Set(source.excluded.map(relativePath))];
    }
    if (source.files !== undefined) {
      if (!Array.isArray(source.files)) throw new Error("文件清单无效");
      const paths = new Set<string>();
      result.files = source.files.map((file: ImportFile) => {
        const path = relativePath(file?.path);
        if (paths.has(path) || !supportedContextFile(path, result.kind === "files")) throw new Error("文件类型无效或重复");
        paths.add(path);
        if ((isContextDirectory(result.kind) || result.metadata) && !includedContextFiles(result).some(f => f.path === path)) throw new Error("文件不在本次预览选定范围内");
        if (typeof file.reason === "string" && file.reason.length <= 600 && file.staged === undefined) return { path, reason: file.reason };
        // Only a digest of this journey's staging names a file; its bytes came through the upload route, never in the selection.
        if (!isStagedDigest(file.staged)) throw new Error("文件内容无效，请重新选择这份文件");
        return { path, staged: file.staged };
      });
    }
    return result;
  });
}
export async function readContextSource(home: string, source: ContextSource, signal?: AbortSignal): Promise<{ name: string; locator: string; files: ImportFile[] }> {
  signal?.throwIfAborted();
  if (source.kind === "browser") {
    if (!source.text?.trim()) throw new Error("请粘贴要整理的网页正文");
    return { name: "浏览器内容", locator: "upload", files: [{ path: "网页内容.md", bytes: Buffer.from(`# 网页内容\n\n${source.url ? `原网址：${source.url}\n\n` : ""}${source.text}`) }] };
  }
  if (source.kind === "mail") return readOnboardingMail(home, source, fetch, signal);
  // Read through the round's project, as its AI: the service passes the reader its own client (context-onboarding-sessions.ts).
  if (source.kind === "sessions") throw new Error("这里读不了外部会话");
  const derivedFiles = !source.files?.length && source.staged_digests && source.metadata
    ? includedContextFiles(source).flatMap(f => source.staged_digests?.[f.path] ? [{ path: f.path, staged: source.staged_digests[f.path]! }] : [])
    : undefined;
  const files = source.files?.length ? source.files : derivedFiles;
  if (!files?.length) throw new Error(isContextDirectory(source.kind) ? "请返回预览，在应用中读取已选文件" : "请选择要整理的文件");
  return { name: source.kind === "chat" ? "聊天记录导出" : "本地文件", locator: "upload", files };
}

/** Recent mail through the mailbox driver: the Host holds the connection, refreshes its token once and checks it is unchanged around every request. */
export async function readOnboardingMail(home: string, source: ContextSource, fetcher: typeof fetch = fetch, outerSignal?: AbortSignal): Promise<{ name: string; locator: string; files: ImportFile[] }> {
  outerSignal?.throwIfAborted();
  const serviceId = source.service_id?.trim();
  const driver = serviceId ? mailboxDriver(serviceId) : builtinMailboxDrivers()[0];
  if (!driver) throw new Error(serviceId ? `找不到邮箱服务 ${serviceId}` : "当前没有可用的邮箱服务");
  if (!source.connection_id) throw new Error(`请先连接 ${driver.account_title}，或跳过 ${driver.title}`);
  const id = source.connection_id;
  return withConnectorRequest(home, id, outerSignal, async signal => {
    const control = connectorAccountControl(home, id, { signal });
    let access = await resolveApiConnection(home, id, control, driver.service);
    const connection = access.connection;
    const assertConnection = () => {
      signal.throwIfAborted();
      const latest = withConnectorConnections(home, store => store.require(id, driver.service), "required");
      if (!latest.enabled || latest.disconnected_at || latest.updated_at !== connection.updated_at) throw new Error(`${driver.title} 连接已改变，请重新执行`);
    };
    let refreshed = false;
    const get = async (url: string): Promise<Record<string, unknown>> => {
      if (!url.startsWith(driver.origin)) throw new Error(`${driver.title} 只能读取它声明的地址`);
      const dispatch = async () => {
        assertConnection();
        const response = await fetcher(url, {
          headers: { Authorization: `Bearer ${access.token}` }, signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]), redirect: "error" });
        assertConnection();
        return response;
      };
      let response = await dispatch();
      if (response.status === 401 && connection.auth_method === "oauth" && !refreshed) {
        refreshed = true; assertConnection();
        access = await resolveApiConnection(home, id, control, driver.service, true);
        assertConnection(); response = await dispatch();
      }
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? `${driver.title} 无读取权限，请重新连接 ${driver.account_title}` : `${driver.title} 暂时无法读取（${response.status}），请重试`);
      const text = await response.text(); assertConnection();
      if (text.length > 4_000_000) throw new Error("邮件内容过大，请缩小范围");
      return JSON.parse(text) as Record<string, unknown>;
    };
    const read = await driver.readRecent(get, { days: source.days === 7 ? 7 : 30, account: connection.account_label ?? "" });
    const files: ImportFile[] = read.map(file => file.text === undefined ? { path: file.path, reason: file.reason ?? "" } : { path: file.path, bytes: Buffer.from(file.text) });
    assertConnection();
    return { name: `${driver.title} · ${connection.account_label ?? connection.display_name}`, locator: "upload", files };
  });
}
