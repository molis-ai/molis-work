import { createHash } from "node:crypto";
import type { ArtifactsApplicationApi, ArtifactJsonValue } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { artifactsManifest } from "./manifest.js";
import { artifactVersionPath } from "./browser.js";

export const DOCUMENT_ARTIFACT_TYPE = "io.molis.work.document";
export const DOCUMENT_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const EXTERNAL_DOCUMENT_SOURCES = ["notion", "feishu", "lark", "google-docs"] as const;
export type ExternalDocumentSource = typeof EXTERNAL_DOCUMENT_SOURCES[number];

export interface ImportedArtifactDocument {
  source: ExternalDocumentSource | "file";
  source_id: string;
  source_url: string | null;
  title: string;
  content: string;
  format: "markdown" | "text";
  warnings: string[];
  original_html?: string;
}

export class ArtifactImportError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "ArtifactImportError";
  }
}

export interface ArtifactDocumentImportPorts {
  boardId: string;
  actorId: string;
  routePrefix: string;
  artifacts: ArtifactsApplicationApi;
  readExternal(input: { source: ExternalDocumentSource; url: string }): Promise<ImportedArtifactDocument>;
  readHtml(html: string): { title: string; content: string };
  now?: () => string;
}

/** An explicit import creates a personal snapshot; no scheduler or source write-back. */
export async function importArtifactDocument(input: Record<string, unknown>, ports: ArtifactDocumentImportPorts) {
  const source = input.source;
  let document: ImportedArtifactDocument;
  if (source === "file") document = readFileDocument(input, ports.readHtml);
  else if (EXTERNAL_DOCUMENT_SOURCES.includes(source as ExternalDocumentSource)) {
    const url = requiredString(input.url, "请输入文档链接", 4096);
    document = await ports.readExternal({ source: source as ExternalDocumentSource, url });
  } else throw new ArtifactImportError(400, "document.source_invalid", "请选择支持的文档来源");

  if (!document.content.trim()) throw new ArtifactImportError(422, "document.empty", "没有读到可导入的正文；请检查文档内容与访问权限");
  if (Buffer.byteLength(document.content, "utf8") > DOCUMENT_IMPORT_MAX_BYTES) {
    throw new ArtifactImportError(413, "document.too_large", "文档正文超过 2 MB，请拆分后导入");
  }
  // Project-scoped identity: the same source can be independently imported into two projects.
  const artifactId = `document-${digest(JSON.stringify([ports.boardId, document.source, document.source_id]))}`;
  const latest = ports.artifacts.query.latestArtifactVersion(ports.boardId, artifactId);
  const payload = JSON.parse(JSON.stringify(document)) as ArtifactJsonValue;
  const previous = latest?.payload;
  const sameContent = previous && typeof previous === "object" && !Array.isArray(previous)
    && Object.entries(document).every(([key, value]) => key === "source_url" || JSON.stringify(previous[key]) === JSON.stringify(value));
  if (latest && sameContent && latest.lifecycle_state === "active" && latest.availability === "available") {
    return { artifact_id: artifactId, version: latest.version, reused: true,
      url: ports.routePrefix + artifactVersionPath(latest), warnings: document.warnings };
  }
  const result = ports.artifacts.commands.registerVersion({
    board_id: ports.boardId, actor_id: ports.actorId, artifact_id: artifactId,
    version: (latest?.version ?? 0) + 1,
    artifact_type_id: DOCUMENT_ARTIFACT_TYPE, schema_version: 1,
    producer: { plugin_id: artifactsManifest.plugin_id, plugin_version: artifactsManifest.version,
      binding_signature: artifactsManifest.publisher.signature },
    content: { kind: "inline", payload },
    metadata: { source: document.source, source_id: document.source_id, source_url: document.source_url,
      title: document.title, imported_at: (ports.now ?? (() => new Date().toISOString()))() },
    scope: "personal", supersedes_version: latest?.version ?? null,
  });
  return { artifact_id: artifactId, version: result.artifact.version, reused: false,
    url: ports.routePrefix + artifactVersionPath(result.artifact), warnings: document.warnings };
}

function readFileDocument(input: Record<string, unknown>, readHtml: ArtifactDocumentImportPorts["readHtml"]): ImportedArtifactDocument {
  const filename = requiredString(input.filename, "请选择一个文档文件", 255);
  if (/[\\/\u0000-\u001f]/u.test(filename)) throw new ArtifactImportError(400, "document.filename_invalid", "文件名无效");
  const extension = filename.toLowerCase().match(/\.(md|markdown|txt|html|htm)$/u)?.[1];
  if (!extension) throw new ArtifactImportError(415, "document.file_unsupported", "支持 Markdown、TXT 和 HTML；请先在文档工具中导出这些格式");
  if (typeof input.content !== "string") throw new ArtifactImportError(400, "document.content_invalid", "文件必须是 UTF-8 文本");
  const original = input.content.replace(/^\uFEFF/u, "");
  if (Buffer.byteLength(original, "utf8") > DOCUMENT_IMPORT_MAX_BYTES) throw new ArtifactImportError(413, "document.too_large", "文件超过 2 MB，请拆分后导入");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(original)) throw new ArtifactImportError(415, "document.binary", "文件包含二进制内容，请使用 UTF-8 文本导出");
  const html = extension === "html" || extension === "htm";
  const extracted = html ? readHtml(original) : null;
  const title = input.title == null || input.title === "" ? extracted?.title || filename.replace(/\.[^.]+$/u, "")
    : requiredString(input.title, "文档标题无效", 500);
  return {
    source: "file",
    // A filename is not a durable remote document ID. Different files with the same name remain separate snapshots.
    source_id: `${filename}:${digest(original)}`,
    source_url: null, title,
    content: extracted?.content ?? original,
    format: extension === "txt" ? "text" : "markdown",
    warnings: html ? ["HTML 已提取为文本快照，复杂排版、图片和附件未导入；原始 HTML 保存在版本数据中。"] : [],
    ...(html ? { original_html: original } : {}),
  };
}

function requiredString(value: unknown, message: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new ArtifactImportError(400, "document.input_invalid", message);
  return value.trim();
}

function digest(text: string): string { return createHash("sha256").update(text).digest("hex"); }
