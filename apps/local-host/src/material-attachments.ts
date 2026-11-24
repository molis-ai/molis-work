import { createHash, randomUUID } from "node:crypto";
import { existsSync, renameSync, rmSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MaterialRef } from "@molis-ai/molis-work-contracts/platform/project-materials";
import {
  CONVERSATION_ATTACHMENT_LIMITS, CONVERSATION_ATTACHMENT_SUBJECT_KIND, type ConversationAttachment, type ConversationAttachmentContent,
  type ConversationAttachmentImageType, type ConversationAttachmentRequest, type ConversationAttachmentUploadRequest, type MaterialUpload,
} from "@molis-ai/molis-work-contracts/services/materials";
import { supportsMaterialExtension } from "@molis-ai/molis-work-plugin-sdk";
import { homeSqlitePath, openBaselineHomeSqlite, type HomeStoreDeclaration, type SqliteBaseline } from "@molis-ai/molis-work-storage";
import { extractHomeMaterial } from "./material-home.js";
import { readMaterialDocuments } from "./material-documents.js";
import { activationPartition } from "./activation-partition.js";

/**
 * Conversation attachments (platform capability audit 2026-11-14 §6): what the person brings into a conversation, kept by the
 * platform's material service so that the assistant, Coding and every other caller read it one way. One row per owner and content:
 * the caller's plugin installation, and its partition (a project, or `personal` for the personal space and a Home-level caller alike). The bytes are kept once by their sha256 in `blobs/`, never
 * changed, and dropped when no row names them any more. A document's text is read once, when it is attached, by the same readers
 * material import uses (PDF, Office, a picture's words, a recording's transcript, text).
 */
const ATTACHMENTS_BASELINE: SqliteBaseline = { version: /* @version database.conversation_attachments_baseline */ 1, schema: `
  CREATE TABLE attachments (
    plugin_id TEXT NOT NULL, install_id TEXT NOT NULL, project_id TEXT NOT NULL, sha256 TEXT NOT NULL,
    title TEXT NOT NULL, kind TEXT NOT NULL, media_type TEXT NOT NULL, byte_length INTEGER NOT NULL,
    text TEXT, text_meta TEXT, attached_at TEXT NOT NULL,
    PRIMARY KEY (plugin_id, install_id, project_id, sha256));
  CREATE INDEX attachments_by_content ON attachments (sha256);
` };
export const CONVERSATION_ATTACHMENTS_HOME_STORE: HomeStoreDeclaration = { path: "conversation-attachments", library: { baseline: ATTACHMENTS_BASELINE } };

/** Whose attachment it is: the caller's own installation, and its project, or null for the Home (kept in the personal space's rows). */
export interface AttachmentOwner { plugin_id: string; install_id: string; project_id: string | null }

export const attachmentErrors = defineErrorCodes("material.attachment", {
  invalid_name: "invalid",
  invalid_data: "invalid",
  unsupported: "invalid",
  too_large: "too_large",
  not_found: "not_found",
  not_image: "invalid",
  unreadable: "unavailable",
});

const SHA256 = /^[0-9a-f]{64}$/u;
const subjectId = (sha256: string) => `ca_${sha256}`;
const blobsOf = (home: string) => path.join(home, CONVERSATION_ATTACHMENTS_HOME_STORE.path, "blobs");
const ownerKey = (owner: AttachmentOwner) => [owner.plugin_id, owner.install_id, activationPartition(owner.project_id)] as const;

function withStore<T>(home: string, use: (db: ReturnType<typeof openBaselineHomeSqlite>) => T): T {
  const db = openBaselineHomeSqlite(home, CONVERSATION_ATTACHMENTS_HOME_STORE.path, ATTACHMENTS_BASELINE);
  try { return use(db); } finally { db.close(); }
}

/** PNG, JPEG, GIF or WebP, by the bytes themselves: a name or a declared type says nothing. */
export function imageTypeOf(bytes: Uint8Array): ConversationAttachmentImageType | null {
  const head = Buffer.from(bytes.subarray(0, 12)).toString("latin1");
  if (head.startsWith("\x89PNG\r\n\x1a\n")) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (head.startsWith("GIF87a") || head.startsWith("GIF89a")) return "image/gif";
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** The upload's name and bytes, checked before anything is allocated beyond the transport bound. */
function decoded(upload: MaterialUpload): { name: string; bytes: Buffer } {
  const name = typeof upload?.file_name === "string" ? upload.file_name.trim() : "";
  if (!name || [...name].length > CONVERSATION_ATTACHMENT_LIMITS.title_chars || /[\\/\u0000-\u001f\u007f]/u.test(name) || name === "." || name === "..") throw attachmentErrors.invalid_name("文件名无效，不能包含路径");
  const encoded = upload.data_base64;
  if (typeof encoded !== "string" || !encoded || encoded.length > Math.ceil(CONVERSATION_ATTACHMENT_LIMITS.document_bytes / 3) * 4) throw attachmentErrors.too_large("文件超过 25 MB，请只带需要的部分");
  if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)) throw attachmentErrors.invalid_data("文件内容编码无效");
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.toString("base64") !== encoded) throw attachmentErrors.invalid_data("文件为空或编码无效");
  return { name, bytes };
}

/** A document's text, read by the platform's own readers, kept within the bound a round may carry. */
async function documentText(home: string, name: string, bytes: Buffer, signal: AbortSignal | undefined): Promise<{ text: string; meta: NonNullable<ConversationAttachment["text"]> }> {
  const extension = path.extname(name).toLowerCase();
  const max = CONVERSATION_ATTACHMENT_LIMITS.text_chars;
  if (extension === ".docx") {
    const batch = await readMaterialDocuments([{ file_name: name, bytes }], { ...(signal ? { signal } : {}) });
    const body = batch.documents.map(document => document.content).join("\n\n");
    const coverage = batch.documents[0]?.coverage ?? { status: "insufficient" as const, issues: batch.warnings };
    return { text: body.slice(0, max), meta: { chars: Math.min(body.length, max), truncated: body.length > max || coverage.truncated === true, pages: null, coverage: coverage.status, issues: [...coverage.issues, ...batch.warnings].slice(0, 20) } };
  }
  if (!supportsMaterialExtension(extension)) throw attachmentErrors.unsupported("这种文件还读不了：可以带图片、PDF、Word、文字或常见音视频");
  const read = await extractHomeMaterial(home, { file_name: name, bytes }, { ...(signal ? { signal } : {}), textFormat: "markdown", limits: { maxCharacters: max } });
  return { text: read.text, meta: { chars: read.text.length, truncated: read.coverage.truncated === true, pages: read.pages.length ? read.coverage.total_pages : null, coverage: read.coverage.status, issues: read.coverage.issues.slice(0, 20) } };
}

async function stillMatches(target: string, bytes: Buffer, signal?: AbortSignal): Promise<boolean> {
  try { return (await readFile(target, { signal })).equals(bytes); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}

function attachmentOf(row: AttachmentRow): ConversationAttachment {
  const ref: MaterialRef = { subject: { kind: CONVERSATION_ATTACHMENT_SUBJECT_KIND, id: subjectId(row.sha256) }, pin: { mode: "current", read_revision: row.sha256 } };
  return { ref, title: row.title, kind: row.kind, media_type: row.media_type, byte_length: row.byte_length, ...(row.text_meta ? { text: JSON.parse(row.text_meta) as NonNullable<ConversationAttachment["text"]> } : {}) };
}
interface AttachmentRow { sha256: string; title: string; kind: "image" | "document"; media_type: string; byte_length: number; text: string | null; text_meta: string | null }
type AttachmentWrite = ConversationAttachmentUploadRequest & { beforeEffect?: () => void | Promise<void> };
/** Host-owned views can download an original once the caller's saved reference has been checked. */
export type AttachmentRead = Omit<ConversationAttachmentRequest, "as"> & { as: ConversationAttachmentRequest["as"] | "original" };
export type AttachmentReadResult = ConversationAttachmentContent & { original?: Uint8Array };
const attaching = new Map<string, Promise<ConversationAttachment>>();

/**
 * Keeps one file the person brought, for this owner. A picture (by its bytes) is kept as it is, up to 5 MB; any other file is read
 * for its text once, up to 25 MB. The same bytes attached again by the same owner are the same attachment, read again for nothing.
 * `beforeEffect` runs after the reading and right before the write: a cancelled or revoked call keeps nothing.
 */
export async function attachConversationFile(home: string, owner: AttachmentOwner, upload: MaterialUpload,
  options: AttachmentWrite = {}): Promise<ConversationAttachment> {
  const { name, bytes } = decoded(upload);
  const image = imageTypeOf(bytes);
  if (options.expected_kind === "image" && !image) throw attachmentErrors.not_image("请添加图片");
  if (image && bytes.length > CONVERSATION_ATTACHMENT_LIMITS.image_bytes) throw attachmentErrors.too_large("图片超过 5 MB，请压缩或截取需要的部分");
  options.signal?.throwIfAborted();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  // Concurrent offers of the same bytes by this owner share its first successful extraction. Each offer keeps its own authority.
  const key = JSON.stringify([home, ...ownerKey(owner), sha256]);
  const previous = attaching.get(key);
  const offer = (async () => {
    await previous?.catch(() => undefined);
    options.signal?.throwIfAborted();
    return publishAttachment(home, owner, { name, bytes, image, sha256 }, options);
  })();
  attaching.set(key, offer);
  try { return await offer; }
  finally { if (attaching.get(key) === offer) attaching.delete(key); }
}

async function publishAttachment(home: string, owner: AttachmentOwner,
  file: { name: string; bytes: Buffer; image: ConversationAttachmentImageType | null; sha256: string },
  options: AttachmentWrite): Promise<ConversationAttachment> {
  const { name, bytes, image, sha256 } = file;
  const directory = blobsOf(home), target = path.join(directory, sha256);
  const check = async () => { await options.beforeEffect?.(); options.signal?.throwIfAborted(); };
  const saved = ownedRow(home, owner, sha256);
  if (saved && await stillMatches(target, bytes, options.signal)) {
    await check();
    const current = ownedRow(home, owner, sha256);
    if (current && existsSync(target)) return attachmentOf(current);
  }
  const read = saved || image ? null : await documentText(home, name, bytes, options.signal);
  const row: AttachmentRow = saved ?? { sha256, title: name, kind: image ? "image" : "document", media_type: image ?? mediaTypeOf(name), byte_length: bytes.length,
    text: read?.text ?? null, text_meta: read ? JSON.stringify(read.meta) : null };
  const temporary = path.join(directory, `.${sha256}.${randomUUID()}`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await writeFile(temporary, bytes, { mode: 0o600, flag: "wx", signal: options.signal });
    await check();
    // A Home has one storage owner. Publish the blob and its row without yielding to another attach or forget.
    return withStore(home, db => {
      const known = ownedRow(home, owner, sha256, db);
      renameSync(temporary, target);
      try {
        if (known) return attachmentOf(known);
        db.prepare(`INSERT INTO attachments (plugin_id, install_id, project_id, sha256, title, kind, media_type, byte_length, text, text_meta, attached_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(...ownerKey(owner), sha256, row.title, row.kind, row.media_type, row.byte_length, row.text, row.text_meta, new Date().toISOString());
        return attachmentOf(row);
      } catch (error) {
        if (!db.prepare("SELECT 1 FROM attachments WHERE sha256 = ? LIMIT 1").get(sha256)) rmSync(target, { force: true });
        throw error;
      }
    });
  } finally { await rm(temporary, { force: true }); }
}

/** The digest a well-formed attachment reference names, or null. */
function digestOf(ref: MaterialRef): string | null {
  const sha256 = ref?.subject?.kind === CONVERSATION_ATTACHMENT_SUBJECT_KIND && typeof ref.subject.id === "string" ? ref.subject.id.slice(3) : "";
  return SHA256.test(sha256) && ref!.subject.id === subjectId(sha256) && ref!.pin?.mode === "current" && ref!.pin.read_revision === sha256 ? sha256 : null;
}

function ownedRow(home: string, owner: AttachmentOwner, sha256: string, db?: ReturnType<typeof openBaselineHomeSqlite>): AttachmentRow | undefined {
  const find = (store: ReturnType<typeof openBaselineHomeSqlite>) => store.prepare("SELECT sha256, title, kind, media_type, byte_length, text, text_meta FROM attachments WHERE plugin_id = ? AND install_id = ? AND project_id = ? AND sha256 = ?")
    .get(...ownerKey(owner), sha256) as AttachmentRow | undefined;
  if (db) return find(db);
  if (!existsSync(homeSqlitePath(home, CONVERSATION_ATTACHMENTS_HOME_STORE.path))) return undefined;
  return withStore(home, find);
}

/** Whether this owner still has the attachment, bytes included: what a page asks before it offers to show or send it again. */
export function holdsConversationAttachment(home: string, owner: AttachmentOwner, ref: MaterialRef): boolean {
  const sha256 = digestOf(ref);
  return !!sha256 && !!ownedRow(home, owner, sha256) && existsSync(path.join(blobsOf(home), sha256));
}

/** Another owner's, an unknown one, and a reference that is not an attachment are all `not_found`. */
export async function readConversationAttachment(home: string, owner: AttachmentOwner, ref: MaterialRef, request: AttachmentRead): Promise<AttachmentReadResult> {
  request.signal?.throwIfAborted();
  const sha256 = digestOf(ref);
  const row = sha256 ? ownedRow(home, owner, sha256) : undefined;
  if (!sha256 || !row) throw attachmentErrors.not_found("找不到这个附件");
  const attachment = attachmentOf(row);
  const blob = path.join(blobsOf(home), sha256);
  if (request.as === "text") {
    if (!existsSync(blob)) throw attachmentErrors.unreadable(`附件「${row.title}」读不到了，请重新添加`);
    return { attachment, ...(row.text !== null ? { text: row.text } : {}) };
  }
  if (request.as === "image" && row.kind !== "image") throw attachmentErrors.not_image(`「${row.title}」不是图片`);
  let bytes: Buffer;
  try { bytes = await readFile(blob, { signal: request.signal }); }
  catch { request.signal?.throwIfAborted(); throw attachmentErrors.unreadable(`附件「${row.title}」读不到了，请重新添加`); }
  request.signal?.throwIfAborted();
  if (!ownedRow(home, owner, sha256)) throw attachmentErrors.not_found("找不到这个附件");
  if (createHash("sha256").update(bytes).digest("hex") !== sha256) throw attachmentErrors.unreadable(`附件「${row.title}」已损坏，请重新添加`);
  return request.as === "original" ? { attachment, original: bytes } : { attachment, image: { media_type: row.media_type as ConversationAttachmentImageType, bytes } };
}

/** A deleted project's attachments, whoever attached them; bytes no other row names go with them. */
export async function forgetProjectAttachments(home: string, projectId: string): Promise<void> {
  if (!projectId) return;
  await forget(home, "project_id = ?", [projectId]);
}

/** One installation's attachments in one project (or the Home: null), when it is uninstalled or its data dropped. */
export async function forgetInstallationAttachments(home: string, pluginId: string, installId: string, projectId: string | null): Promise<void> {
  await forget(home, "plugin_id = ? AND install_id = ? AND project_id = ?", [pluginId, installId, activationPartition(projectId)]);
}

/** Some of one owner's attachments, by reference, once nothing of the owner names them any more; bytes no other row names go with them. */
export async function forgetOwnedAttachments(home: string, owner: AttachmentOwner, refs: readonly MaterialRef[]): Promise<void> {
  const digests = [...new Set(refs.map(digestOf).filter((sha): sha is string => sha !== null))];
  for (let at = 0; at < digests.length; at += 200) {
    const part = digests.slice(at, at + 200);
    await forget(home, `plugin_id = ? AND install_id = ? AND project_id = ? AND sha256 IN (${part.map(() => "?").join(", ")})`, [...ownerKey(owner), ...part]);
  }
}

async function forget(home: string, where: string, values: string[]): Promise<void> {
  if (!existsSync(homeSqlitePath(home, CONVERSATION_ATTACHMENTS_HOME_STORE.path))) return;
  withStore(home, db => {
    const shas = (db.prepare(`SELECT DISTINCT sha256 FROM attachments WHERE ${where}`).all(...values) as Array<{ sha256: string }>).map(row => row.sha256);
    db.prepare(`DELETE FROM attachments WHERE ${where}`).run(...values);
    const named = db.prepare("SELECT 1 FROM attachments WHERE sha256 = ? LIMIT 1");
    for (const sha of shas) if (!named.get(sha)) rmSync(path.join(blobsOf(home), sha), { force: true });
  });
}

/** What a document is, by its name, for the person and for the record; its text is what the model reads. */
function mediaTypeOf(name: string): string {
  const types: Record<string, string> = { ".pdf": "application/pdf", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".md": "text/markdown", ".markdown": "text/markdown",
    ".txt": "text/plain", ".csv": "text/csv", ".json": "application/json", ".html": "text/html", ".htm": "text/html", ".log": "text/plain" };
  return types[path.extname(name).toLowerCase()] ?? "application/octet-stream";
}
