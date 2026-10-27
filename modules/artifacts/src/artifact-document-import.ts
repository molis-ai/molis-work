import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { ArtifactsApplicationApi, ArtifactJsonValue } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { ARTIFACT_PRODUCER } from "./artifact-provider.js";
import { artifactVersionPath } from "./artifact-browser.js";

import { DOCUMENT_ARTIFACT_TYPE } from "./artifact-document-type.js";
import { ARTIFACT_ORIGINAL_INLINE_MAX_BYTES, type StoredArtifactOriginal } from "./artifact-original-store.js";
export { DOCUMENT_ARTIFACT_TYPE } from "./artifact-document-type.js";
/**
 * The most text one version keeps as its `content` (what agents, search and previews read). It bounds the record, not the import:
 * a longer text that comes with its original is cut here with a warning and kept whole in the original (onboarding limits,
 * 2026-10-22); a text import without an original is still refused over it.
 */
export const DOCUMENT_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const EXTERNAL_DOCUMENT_SOURCES = ["notion", "feishu", "lark", "google-docs"] as const;
export type ExternalDocumentSource = typeof EXTERNAL_DOCUMENT_SOURCES[number];

export interface ImportedArtifactDocument {
  source: ExternalDocumentSource | "file";
  source_id: string;
  source_url: string | null;
  connection_id?: string;
  title: string;
  content: string;
  /**
   * `file`: any other file, kept as its original bytes (A3). Its `content` is the text the Host read out of it (PDF, DOCX:
   * specs/project-knowledge PMAT-14), or empty when it reads none.
   */
  format: "markdown" | "text" | "file";
  warnings: string[];
  original_html?: string;
  original_file?: ArtifactOriginalFile;
}

/**
 * An imported file's original: its bytes inline up to `ARTIFACT_ORIGINAL_INLINE_MAX_BYTES`, or, bigger, kept in the 成果库's
 * store and named by digest and size (original-store.ts). Two current shapes chosen by size, not an old and a new one.
 */
export type ArtifactOriginalFile = { filename: string; mime: string; data_base64: string }
  | { filename: string; mime: string; sha256: string; size_bytes: number };

/**
 * The file the person gave the Host for this import (`ActionCallContext.original_file`), as the Host reads it: never business input.
 * `store` keeps it in the 成果库's store, for one over the inline size.
 */
export interface OfferedOriginal {
  size_bytes: number;
  read(): Promise<Buffer>;
  store(): Promise<StoredArtifactOriginal>;
}

/**
 * What the document import refuses, every code `artifacts.document.<reason>`. The kind is the sort of failure, and the Host's edge turns it into
 * the status (SDK `actionHttpStatus`): what is wrong with the request or the document is `invalid` (400, also for the files that were 415
 * and the documents that were 422), and a document over its size is `too_large` (413). The Host's reading of a connected service raises
 * the rest of the family (`artifactImportErrors` in apps/local-host/src/artifact-document-import.ts).
 */
export const documentErrors = defineErrorCodes("artifacts.document", {
  source_invalid: "invalid",
  content_invalid: "invalid",
  filename_invalid: "invalid",
  input_invalid: "invalid",
  /** The original file's snapshot is not a safe name, a media type or valid base64. (Over its size the same code is `too_large`, below.) */
  original_invalid: "invalid",
  /** An `original_file` without its bytes, where the Host was given no file for this import (or not by the person, for the 成果库). */
  original_not_offered: "invalid",
  empty: "invalid",
  binary: "invalid",
  too_large: "too_large",
});

export interface ArtifactDocumentImportPorts {
  projectId: string;
  /** Who imports (a person, a workflow, an Agent, an MCP client): the producer, kept as the version's `created_by`. */
  actorId: string;
  /** Who the snapshot belongs to: the Home's person, whoever imported it. The same source then has one line of snapshots. */
  ownerActorId: string;
  routePrefix: string;
  artifacts: ArtifactsApplicationApi;
  readExternal(input: { source: ExternalDocumentSource; url: string; connection_id?: string }): Promise<ImportedArtifactDocument>;
  readHtml(html: string): { title: string; content: string } | Promise<{ title: string; content: string }>;
  /** The text of a file kept as its original (PDF, DOCX), read by the Host's extraction; null for a kind it does not read. */
  readFileText?(file: { filename: string; bytes: Buffer }): Promise<{ text: string; warnings: string[]; model_required?: ModelRequired } | null>;
  /** The file the Host was given for this import, when an `original_file` comes without its bytes. */
  offered?: OfferedOriginal;
  signal?: AbortSignal;
  now?: () => string;
  /** Trusted Host checks cancellation/revocation again after external reads and before writes. */
  beforeSave?: () => void | Promise<void>;
}

/** A transcription that needs the local speech model first (specs/project-knowledge PMAT-48); its size when the helper said it. */
export interface ModelRequired { approximate_bytes: number | null }

/** An explicit import creates a personal snapshot of the person; no scheduler or source write-back. */
export async function importArtifactDocument(input: Record<string, unknown>, ports: ArtifactDocumentImportPorts) {
  const source = input.source;
  let document: ImportedArtifactDocument;
  // Said to whoever imports, never kept in the snapshot: once the model is there the same file imports again with its text.
  let modelRequired: ModelRequired | undefined;
  const readFileText = ports.readFileText && (async (file: { filename: string; bytes: Buffer }) => {
    const read = await ports.readFileText!(file);
    modelRequired = read?.model_required;
    return read;
  });
  const told = () => modelRequired ? { model_required: modelRequired } : {};
  ports.signal?.throwIfAborted();
  if (source === "file") document = await readFileDocument(input, { readHtml: ports.readHtml, ...readFileText ? { readFileText } : {}, ...ports.offered ? { offered: ports.offered } : {} });
  else if (EXTERNAL_DOCUMENT_SOURCES.includes(source as ExternalDocumentSource)) {
    const url = requiredString(input.url, "请输入文档链接", 4096);
    const connection_id = input.connection_id === undefined ? undefined : requiredString(input.connection_id, "请选择有效连接", 100);
    document = await ports.readExternal({ source: source as ExternalDocumentSource, url, ...(connection_id ? { connection_id } : {}) });
  } else throw documentErrors.source_invalid("请选择支持的文档来源");

  if (document.format !== "file" && !document.content.trim()) throw documentErrors.empty("没有读到可导入的正文；请检查文档内容与访问权限");
  if (Buffer.byteLength(document.content, "utf8") > DOCUMENT_IMPORT_MAX_BYTES) {
    throw documentErrors.too_large("文档正文超过 2 MB，请拆分后导入");
  }
  await ports.beforeSave?.();
  ports.signal?.throwIfAborted();
  // Project-scoped identity: the same source can be independently imported into two projects.
  const artifactId = `document-${digest(JSON.stringify([ports.projectId, document.source, document.source_id]))}`;
  const latest = ports.artifacts.query.latestArtifactVersion(ports.projectId, artifactId);
  const payload = JSON.parse(JSON.stringify(document)) as ArtifactJsonValue;
  const previous = latest?.payload;
  const sameContent = previous && typeof previous === "object" && !Array.isArray(previous)
    && Object.entries(document).every(([key, value]) => key === "source_url" || isDeepStrictEqual(previous[key], value));
  if (latest && sameContent && latest.lifecycle_state === "active" && latest.availability === "available") {
    return { artifact_id: artifactId, version: latest.version, title: latest.title, reused: true,
      url: ports.routePrefix + artifactVersionPath(latest), warnings: document.warnings, ...told() };
  }
  const result = ports.artifacts.commands.registerVersion({
    project_id: ports.projectId, actor_id: ports.actorId, owner_actor_id: ports.ownerActorId, artifact_id: artifactId,
    version: (latest?.version ?? 0) + 1,
    artifact_type_id: DOCUMENT_ARTIFACT_TYPE, schema_version: 1,
    producer: ARTIFACT_PRODUCER,
    content: { kind: "inline", payload },
    metadata: { source: document.source, source_id: document.source_id, source_url: document.source_url,
      title: document.title, imported_at: (ports.now ?? (() => new Date().toISOString()))(), ...(document.connection_id ? { connection_id: document.connection_id } : {}) },
    scope: "personal", supersedes_version: latest?.version ?? null,
    // An imported document keeps its file name and the type of the text it was read into (artifact-positioning A1).
    origin: { kind: "imported", file_name: source === "file" ? String(input.filename) : document.title },
    title: document.title, media_type: document.format === "file" ? document.original_file!.mime
      : document.format === "text" ? "text/plain" : "text/markdown",
  });
  return { artifact_id: artifactId, version: result.artifact.version, title: result.artifact.title, reused: false,
    url: ports.routePrefix + artifactVersionPath(result.artifact), warnings: document.warnings, ...told() };
}

async function readFileDocument(input: Record<string, unknown>, ports: Pick<ArtifactDocumentImportPorts, "readHtml" | "readFileText" | "offered">): Promise<ImportedArtifactDocument> {
  const filename = requiredString(input.filename, "请选择一个文档文件", 255);
  if (/[\\/\u0000-\u001f]/u.test(filename)) throw documentErrors.filename_invalid("文件名无效");
  const extension = filename.toLowerCase().match(/\.(md|markdown|txt|html|htm)$/u)?.[1];
  // Any other file is kept as it is: its original bytes and media type, no text read out of it (A3).
  if (!extension) {
    const { original, bytes } = await originalFileOf(input.original_file, ports.offered);
    // The Host reads the text of what it can (PDF, DOCX); the original stays the snapshot, and its text is what agents find and read.
    // A file too big to hold in memory (over 2 GB) is still kept whole in the store; only its text is not read.
    const held = ports.readFileText ? await bytes().catch(error => {
      if ((error as { code?: unknown } | null)?.code === "ERR_FS_FILE_TOO_LARGE") return null;
      throw error;
    }) : null;
    const read = held ? await ports.readFileText!({ filename, bytes: held }) ?? null : null;
    const unread = ports.readFileText !== undefined && held === null;
    const text = read ? withinImportSize(read.text.trim()) : null;
    return { source: "file", source_id: input.source_id === undefined ? `${filename}:${"sha256" in original ? original.sha256 : digest(original.data_base64)}` : requiredString(input.source_id, "文档来源标识无效", 512),
      source_url: null, title: input.title == null || input.title === "" ? filename.replace(/\.[^.]+$/u, "") || filename : requiredString(input.title, "文档标题无效", 500),
      content: text?.text ?? "", format: "file", warnings: [...unread ? ["文件超过 2 GB，没有读取正文；原件完整保存。"] : [], ...read?.warnings ?? [], ...text?.cut ? ["正文超过 2 MB，只保留了开头部分；原件完整保存。"] : []], original_file: original };
  }
  if (typeof input.content !== "string") throw documentErrors.content_invalid("文件必须是 UTF-8 文本");
  const whole = input.content.replace(/^\uFEFF/u, "");
  // A longer text is taken when its original keeps it whole; the version's text is then its beginning (onboarding limits, 2026-10-22).
  if (Buffer.byteLength(whole, "utf8") > DOCUMENT_IMPORT_MAX_BYTES && input.original_file === undefined) throw documentErrors.too_large("文件超过 2 MB，请拆分后导入");
  const { text: original, cut } = withinImportSize(whole);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(original)) throw documentErrors.binary("文件包含二进制内容，请使用 UTF-8 文本导出");
  const html = extension === "html" || extension === "htm";
  const extracted = html ? await ports.readHtml(original) : null;
  const title = input.title == null || input.title === "" ? extracted?.title || filename.replace(/\.[^.]+$/u, "")
    : requiredString(input.title, "文档标题无效", 500);
  const originalFile = input.original_file === undefined ? undefined : (await originalFileOf(input.original_file, ports.offered)).original;
  return {
    source: "file",
    // A filename is not a durable remote document ID. Different files with the same name remain separate snapshots.
    source_id: input.source_id === undefined ? `${filename}:${digest(original)}` : requiredString(input.source_id, "文档来源标识无效", 512),
    source_url: null, title,
    content: extracted?.content ?? original,
    format: extension === "txt" ? "text" : "markdown",
    warnings: [...html ? ["HTML 已提取为文本快照，复杂排版、图片和附件未导入；原始 HTML 保存在版本数据中。"] : [],
      ...cut ? ["正文超过 2 MB，只保留了开头部分；原件完整保存。"] : []],
    ...(html ? { original_html: original } : {}),
    ...(originalFile ? { original_file: originalFile } : {}),
  };
}

/**
 * The original of an imported file: a safe name and a media type, with either its bytes (valid base64, at most the inline size) or,
 * without them, the file the Host was given for this import. That one stays inline up to the same size and is kept in the store above
 * it, so a version's shape follows only from the original's size.
 */
async function originalFileOf(value: unknown, offered: OfferedOriginal | undefined): Promise<{ original: ArtifactOriginalFile; bytes: () => Promise<Buffer> }> {
  const file = value as Record<string, unknown> | null | undefined;
  if (!file || typeof file !== "object") throw documentErrors.original_invalid("原文件快照无效");
  const name = requiredString(file.filename, "原文件名无效", 255);
  if (/[\\/\u0000-\u001f]/u.test(name)) throw documentErrors.original_invalid("原文件名无效");
  const mime = requiredString(file.mime, "原文件类型无效", 128).toLowerCase();
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u.test(mime)) throw documentErrors.original_invalid("原文件类型无效");
  const data = file.data_base64;
  if (data === undefined) {
    if (!offered) throw documentErrors.original_not_offered("没有收到原文件：请随导入一起交给宿主，或附上原文件内容");
    if (offered.size_bytes <= ARTIFACT_ORIGINAL_INLINE_MAX_BYTES) {
      const bytes = await offered.read();
      return { original: { filename: name, mime, data_base64: bytes.toString("base64") }, bytes: async () => bytes };
    }
    return { original: { filename: name, mime, ...await offered.store() }, bytes: () => offered.read() };
  }
  if (typeof data !== "string" || data.length > 8_000_000 || data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(data)
    || Buffer.from(data, "base64").toString("base64") !== data || Buffer.from(data, "base64").length > ARTIFACT_ORIGINAL_INLINE_MAX_BYTES) {
    throw new ActionError("artifacts.document.original_invalid", "原文件必须为有效的 base64，最大 6 MB；更大的原文件请随导入交给宿主", { kind: "too_large" });
  }
  return { original: { filename: name, mime, data_base64: data }, bytes: async () => Buffer.from(data, "base64") };
}

/** Text read out of an original, cut at the import's size at a character boundary. */
function withinImportSize(text: string): { text: string; cut: boolean } {
  if (Buffer.byteLength(text, "utf8") <= DOCUMENT_IMPORT_MAX_BYTES) return { text, cut: false };
  return { text: Buffer.from(text, "utf8").subarray(0, DOCUMENT_IMPORT_MAX_BYTES).toString("utf8").replace(/\uFFFD+$/u, ""), cut: true };
}

function requiredString(value: unknown, message: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw documentErrors.input_invalid(message);
  return value.trim();
}

function digest(text: string): string { return createHash("sha256").update(text).digest("hex"); }
