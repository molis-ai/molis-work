/** One-time document reads. Credentials never leave the selected provider's API origin. */
export type ExternalDocumentSource = "notion" | "feishu" | "lark" | "google-docs";

export interface ExternalDocument {
  source: ExternalDocumentSource;
  source_id: string;
  source_url: string;
  title: string;
  content: string;
  format: "markdown" | "text";
  warnings: string[];
}

export type ExternalDocumentImportErrorCode =
  | "invalid_url" | "needs_auth" | "permission_denied" | "not_found"
  | "rate_limited" | "network" | "timeout" | "provider" | "too_large"
  | "incomplete_content" | "empty_content" | "unsupported_document";

export class ExternalDocumentImportError extends Error {
  readonly status: number;
  constructor(readonly code: ExternalDocumentImportErrorCode, message: string) {
    super(message);
    this.name = "ExternalDocumentImportError";
    this.status = ({
      invalid_url: 400, needs_auth: 401, permission_denied: 403, not_found: 404,
      rate_limited: 429, network: 502, timeout: 504, provider: 502, too_large: 413,
      incomplete_content: 422, empty_content: 422, unsupported_document: 422,
    } satisfies Record<ExternalDocumentImportErrorCode, number>)[code];
  }
}

const MAX_BYTES = 2 * 1024 * 1024;
const DEADLINE_MS = 30_000;
const NOTION_VERSION = "2026-03-11";
const RESOURCE_ID = /^[A-Za-z0-9_-]{10,128}$/u;
const NOTION_ID = /(?:^|-)([a-f\d]{32}|[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})$/iu;

function fail(code: ExternalDocumentImportErrorCode, message: string): never {
  throw new ExternalDocumentImportError(code, message);
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isHost(host: string, base: string): boolean {
  return host === base || host.endsWith(`.${base}`);
}

function documentReference(input: { source: ExternalDocumentSource; url: string }) {
  let url: URL;
  try {
    if (typeof input.url !== "string" || input.url.length > 2048) throw new Error();
    url = new URL(input.url.trim());
  } catch {
    return fail("invalid_url", "请输入完整的文档 HTTPS 链接。");
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    return fail("invalid_url", "文档链接必须使用 HTTPS，且不能包含账号、密码或自定义端口。");
  }
  const host = url.hostname.toLowerCase();
  const path = url.pathname.replace(/\/$/u, "");
  let id = "";
  let wiki = false;
  switch (input.source) {
    case "notion": {
      if (isHost(host, "notion.so") || isHost(host, "notion.site")) {
        const matched = NOTION_ID.exec(path.split("/").at(-1) ?? "");
        if (matched) {
          const compact = matched[1]!.replaceAll("-", "").toLowerCase();
          id = `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
        }
      }
      break;
    }
    case "feishu":
    case "lark": {
      const validHost = input.source === "feishu"
        ? isHost(host, "feishu.cn") : isHost(host, "larksuite.com") || isHost(host, "larkoffice.com");
      const matched = /^\/(docx|wiki)\/([A-Za-z0-9_-]{10,128})$/u.exec(path);
      if (validHost && matched) {
        id = matched[2]!;
        wiki = matched[1] === "wiki";
      }
      break;
    }
    case "google-docs": {
      const matched = /^\/document\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{10,128})(?:\/(?:edit|view|preview|copy))?$/u.exec(path);
      if (host === "docs.google.com" && matched) id = matched[1]!;
      break;
    }
  }
  if (!id) fail("invalid_url", "链接与所选数据源不匹配，或不是支持的文档。请使用 Notion 页面、飞书/Lark 新版文档或 Google Docs 链接。");
  // Sharing parameters can contain sensitive tokens. Keep only the document location.
  url.search = "";
  url.hash = "";
  return { id, wiki, sourceUrl: url.toString() };
}

function createReader(fetchImpl: typeof fetch, signal: AbortSignal) {
  async function text(url: string, init: RequestInit = {}): Promise<string> {
    try {
      const response = await fetchImpl(url, { ...init, redirect: "error", signal });
      if (response.status === 401) fail("needs_auth", "连接凭据已失效，请到设置重新连接数据源。");
      if (response.status === 403) fail("permission_denied", "当前连接没有读取该文档的权限。请检查只读权限，并将文档共享给连接的应用。");
      if (response.status === 404) fail("not_found", "找不到该文档，或当前连接无权读取。请检查链接和文档共享设置。");
      if (response.status === 429) fail("rate_limited", "数据源请求过于频繁，请稍后重试。");
      if (!response.ok) fail("provider", "数据源暂时无法提供文档，请稍后重试。");
      if (Number(response.headers.get("content-length")) > MAX_BYTES) {
        await response.body?.cancel();
        fail("too_large", "文档超过 2 MB 导入上限，请拆分后导入。");
      }
      if (!response.body) return "";
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let size = 0;
      let result = "";
      try {
        while (true) {
          signal.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES) {
            await reader.cancel();
            fail("too_large", "文档超过 2 MB 导入上限，请拆分后导入。");
          }
          result += decoder.decode(value, { stream: true });
        }
        return result + decoder.decode();
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      if (error instanceof ExternalDocumentImportError) throw error;
      if (signal.aborted) fail("timeout", "读取文档超时，请稍后重试。");
      fail("network", "读取文档失败，请检查网络后重试。");
    }
  }
  async function json(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const content = await text(url, init);
    let value: unknown;
    try { value = JSON.parse(content); }
    catch { fail("provider", "数据源没有返回有效文档数据，请稍后重试。"); }
    const result = record(value);
    if (typeof result.code === "number" && result.code !== 0) {
      if ([99991661, 99991663, 99991664, 99991668].includes(result.code)) {
        fail("needs_auth", "连接凭据已失效，请到设置重新连接数据源。");
      }
      if ([99991672, 99991679, 1770032, 131006].includes(result.code)) {
        fail("permission_denied", "应用没有读取该文档或知识库的权限。请检查开放平台的文档只读权限及文档共享设置。");
      }
      if ([1770002, 131005].includes(result.code)) fail("not_found", "找不到该文档，或应用无权读取。请检查文档链接及共享设置。");
      fail("provider", "数据源拒绝读取文档，请检查应用权限、文档共享设置后重试。");
    }
    return result;
  }
  return { text, json };
}

type Reader = ReturnType<typeof createReader>;

async function notionDocument(id: string, token: string, reader: Reader) {
  const headers = { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION };
  const page = await reader.json(`https://api.notion.com/v1/pages/${id}`, { headers });
  if (page.object !== "page" || page.archived === true || page.in_trash === true) {
    fail("not_found", "Notion 页面不存在或已移入回收站。");
  }
  const data = await reader.json(`https://api.notion.com/v1/pages/${id}/markdown`, { headers });
  if (data.object !== "page_markdown" || typeof data.markdown !== "string"
    || typeof data.truncated !== "boolean" || !Array.isArray(data.unknown_block_ids)) fail("provider", "Notion 没有返回有效页面正文。");
  if (data.truncated === true || (Array.isArray(data.unknown_block_ids) && data.unknown_block_ids.length > 0)) {
    fail("incomplete_content", "Notion 返回的正文不完整，可能包含无权读取的子页面或超过读取上限。请修复共享权限或拆分文档后重试。");
  }
  const titleProperty = Object.values(record(page.properties)).map(record).find((item) => item.type === "title");
  const title = Array.isArray(titleProperty?.title)
    ? titleProperty.title.map((item) => string(record(item).plain_text) || string(record(record(item).text).content)).join("").trim() : "";
  return {
    title: title || "Notion 文档",
    content: data.markdown,
    format: "markdown" as const,
    warnings: ["导入为当前正文快照；评论、权限、子页面和附件文件不会一并导入。", ...(/<unknown\b/u.test(data.markdown)
      ? ["Notion 正文含暂不支持的块；原位置保留占位标记，请在原文核对。"] : [])],
  };
}

async function feishuDocument(source: "feishu" | "lark", reference: ReturnType<typeof documentReference>, token: string, reader: Reader) {
  const separator = token.indexOf(":");
  const cli = source === "feishu" && token === "lark-cli";
  if (!cli && (separator < 1 || !token.slice(separator + 1).trim())) fail("needs_auth", "请在设置中以 app_id:app_secret 格式连接该数据源的自建应用。");
  const origin = source === "feishu" ? "https://open.feishu.cn" : "https://open.larksuite.com";
  const auth = cli ? null : await reader.json(`${origin}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ app_id: token.slice(0, separator).trim(), app_secret: token.slice(separator + 1).trim() }),
  });
  const accessToken = cli ? token : string(auth?.tenant_access_token);
  if (!accessToken) fail("needs_auth", "应用凭据无法换取访问令牌，请检查所选数据源和应用凭据。");
  const headers = { Authorization: `Bearer ${accessToken}` };
  let id = reference.id;
  if (reference.wiki) {
    const result = await reader.json(`${origin}/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(id)}`, { headers });
    const node = record(record(result.data).node);
    if (node.obj_type !== "docx") fail("unsupported_document", "该知识库节点不是新版文档，暂不支持直接导入。请导出为 Markdown、文本或 HTML 后导入。");
    id = string(node.obj_token);
    if (!RESOURCE_ID.test(id)) fail("provider", "知识库没有返回有效的文档标识。");
  }
  const page = await reader.json(`${origin}/open-apis/docx/v1/documents/${id}`, { headers });
  const document = record(record(page.data).document);
  if (string(document.document_id) !== id) fail("provider", "数据源没有返回有效的文档信息。");
  const body = await reader.json(`${origin}/open-apis/docx/v1/documents/${id}/raw_content`, { headers });
  if (typeof record(body.data).content !== "string") fail("provider", "数据源没有返回有效的文档正文。");
  return {
    source_id: id,
    title: string(document.title).trim() || (source === "feishu" ? "飞书文档" : "Lark 文档"),
    content: string(record(body.data).content),
    format: "text" as const,
    warnings: ["导入为纯文本快照；原文的排版、图片、附件、评论及嵌入内容不会一并导入。"],
  };
}

async function googleDocument(id: string, token: string, reader: Reader) {
  const headers = { Authorization: `Bearer ${token}` };
  const page = await reader.json(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType,capabilities(canDownload)&supportsAllDrives=true`, { headers });
  if (page.id !== id || page.mimeType !== "application/vnd.google-apps.document") fail("unsupported_document", "此链接不是 Google Docs 文档。请导出为 Markdown、文本或 HTML 后导入。");
  if (record(page.capabilities).canDownload === false) fail("permission_denied", "文档所有者禁止下载该文档，无法导入正文。");
  const content = await reader.text(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text%2Fplain`, { headers });
  return {
    title: string(page.name).trim() || "Google 文档", content, format: "text" as const,
    warnings: ["导入为纯文本快照；原文的排版、图片、附件和评论不会一并导入。Google Drive 连接需具备 drive.readonly 或 drive.file 读取权限。"],
  };
}

export async function readExternalDocument(
  input: { source: ExternalDocumentSource; url: string },
  ports: { token: string; fetch?: typeof fetch },
): Promise<ExternalDocument> {
  const reference = documentReference(input);
  const token = ports.token?.trim();
  if (!token) fail("needs_auth", "请先在设置中连接所选数据源。");
  const fetchImpl = ports.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) fail("network", "当前环境无法读取在线文档。");
  const reader = createReader(fetchImpl, AbortSignal.timeout(DEADLINE_MS));
  const content = input.source === "notion" ? await notionDocument(reference.id, token, reader)
    : input.source === "google-docs" ? await googleDocument(reference.id, token, reader)
      : await feishuDocument(input.source, reference, token, reader);
  if (!content.content.trim()) fail("empty_content", "文档没有可导入的正文。请确认文档内容和当前应用的读取权限。");
  return { source: input.source, source_id: reference.id, source_url: reference.sourceUrl, ...content };
}
