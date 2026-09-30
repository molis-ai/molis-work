import { ActionError, type ActionAudience, type ActionDefinition, type ActionHandlerBinding, type ActionCallContext } from "./actions.js";
import { ACTION_SUBJECT_SCHEMA, type ActionSubject } from "./action-subjects.js";
import { SEARCH_OPEN_TARGET_SCHEMA, searchRevisionOf, type SearchOpenTarget } from "./search-sources.js";

/**
 * How a plugin shows its files in the side panel (specs/side-panel §3.3, D11). The plugin keeps its own store; the
 * panel lists a source's entries and previews one through these declared actions, with the person's own authority.
 * A source that declares no content action is previewed through the plugin's subject reader (`<plugin>.subject.read`).
 * A plugin turned off leaves the directory, and its files leave the panel with it.
 */
export const FILE_ENTRIES_INPUT_TYPE = "molis.files.entries.window.v1";
export const FILE_ENTRIES_OUTPUT_TYPE = "molis.files.entries.page.v1";
export const FILE_CONTENT_INPUT_TYPE = "molis.files.content.request.v1";
export const FILE_CONTENT_OUTPUT_TYPE = "molis.files.content.v1";
export const FILE_ENTRIES_PAGE_LIMIT = 500;
/** One preview at most; larger files are shown as too large with the way to open them in their plugin. */
export const FILE_CONTENT_MAX_BYTES = 8 * 1024 * 1024;

export interface FileSourceKind { kind: string; title: string; surface: string }
export interface FileSourceDeclaration { readonly kinds: readonly FileSourceKind[]; readonly role: "entries" | "content" }

export interface FileEntriesInput { cursor: string | null; limit: number }
export interface FileEntry {
  subject: ActionSubject;
  /** Owner's version token; it changes whenever the file's content or name changes. */
  revision: string;
  /** The name the person knows the file by. */
  title: string;
  /** Where it sits, for grouping (folders, a document's collection); empty at the top. */
  folder: string[];
  /** IANA media type; the panel previews text, Markdown, images and PDF, and names the rest. */
  media_type: string;
  size: number | null;
  updated_at: string | null;
  open: SearchOpenTarget | null;
}
export interface FileEntriesPage { entries: FileEntry[]; next_cursor: string | null; collection_revision: string }

export interface FileContentInput { subject: ActionSubject }
export interface FileContent {
  subject: ActionSubject;
  revision: string;
  title: string;
  media_type: string;
  encoding: "utf8" | "base64";
  data: string;
  /** The preview is the start of a longer file. */
  truncated: boolean;
}

/** Side panel sources are for the person unless the owner widens them; a source never reaches beyond the owner's reads. */
export const FILE_SOURCE_AUDIENCES: readonly ActionAudience[] = ["user"];

const id = { type: "string", minLength: 1 };
const nullableText = { type: ["string", "null"] };
const mediaType = { type: "string", minLength: 3, maxLength: 200, pattern: "^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$" };
const open = { anyOf: [{ type: "null" }, SEARCH_OPEN_TARGET_SCHEMA] };
export const FILE_ENTRIES_INPUT_SCHEMA = { type: "object", properties: { cursor: nullableText, limit: { type: "integer", minimum: 1, maximum: FILE_ENTRIES_PAGE_LIMIT } },
  required: ["cursor", "limit"], additionalProperties: false };
export const FILE_ENTRY_SCHEMA = { type: "object", properties: {
  subject: ACTION_SUBJECT_SCHEMA, revision: { ...id, maxLength: 200 }, title: { type: "string", minLength: 1, maxLength: 1000 },
  folder: { type: "array", maxItems: 32, items: { type: "string", minLength: 1, maxLength: 255 } }, media_type: mediaType,
  size: { type: ["integer", "null"], minimum: 0 }, updated_at: nullableText, open,
}, required: ["subject", "revision", "title", "folder", "media_type", "size", "updated_at", "open"], additionalProperties: false };
export const FILE_ENTRIES_OUTPUT_SCHEMA = { type: "object", properties: { entries: { type: "array", maxItems: FILE_ENTRIES_PAGE_LIMIT, items: FILE_ENTRY_SCHEMA },
  next_cursor: nullableText, collection_revision: { ...id, maxLength: 200 } }, required: ["entries", "next_cursor", "collection_revision"], additionalProperties: false };
export const FILE_CONTENT_INPUT_SCHEMA = { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA }, required: ["subject"], additionalProperties: false };
export const FILE_CONTENT_OUTPUT_SCHEMA = { type: "object", properties: {
  subject: ACTION_SUBJECT_SCHEMA, revision: { ...id, maxLength: 200 }, title: { type: "string", minLength: 1, maxLength: 1000 }, media_type: mediaType,
  encoding: { enum: ["utf8", "base64"] }, data: { type: "string", maxLength: Math.ceil(FILE_CONTENT_MAX_BYTES * 4 / 3) + 4 }, truncated: { type: "boolean" },
}, required: ["subject", "revision", "title", "media_type", "encoding", "data", "truncated"], additionalProperties: false };

const metadata = (kinds: readonly FileSourceKind[], title: string, permissions: readonly string[], scope: "home" | "project", audiences: readonly ActionAudience[], role: FileSourceDeclaration["role"]) => ({
  title, kind: "query" as const, scope, scheduling: "concurrent" as const, audiences: [...audiences],
  permissions: [...permissions], subject_kinds: kinds.map(entry => entry.kind), file_source: { kinds: kinds.map(entry => ({ ...entry })), role },
});

/** One declaration per source: which kinds of files it lists and where each opens. Discovery confers no authority. */
export function defineFileEntriesAction(capabilityId: string, kinds: readonly FileSourceKind[], title: string, permissions: readonly string[],
  scope: "home" | "project" = "project", audiences: readonly ActionAudience[] = FILE_SOURCE_AUDIENCES): ActionDefinition<FileEntriesInput, FileEntriesPage> {
  return { capability_id: capabilityId, version: 1, operation: "query", action: { ...metadata(kinds, title, permissions, scope, audiences, "entries"),
    description: `分页列出${title}里的文件，供侧栏的文件标签展示；不修改数据。`,
    input_type: FILE_ENTRIES_INPUT_TYPE, output_type: FILE_ENTRIES_OUTPUT_TYPE, input_schema: FILE_ENTRIES_INPUT_SCHEMA, output_schema: FILE_ENTRIES_OUTPUT_SCHEMA } };
}

/** Optional: the file itself for a preview, text or bytes, at most `FILE_CONTENT_MAX_BYTES`. */
export function defineFileContentAction(capabilityId: string, kinds: readonly FileSourceKind[], title: string, permissions: readonly string[],
  scope: "home" | "project" = "project", audiences: readonly ActionAudience[] = FILE_SOURCE_AUDIENCES): ActionDefinition<FileContentInput, FileContent> {
  return { capability_id: capabilityId, version: 1, operation: "query", action: { ...metadata(kinds, title, permissions, scope, audiences, "content"),
    description: `读取${title}里一个文件的内容，供侧栏预览；不修改数据。`,
    input_type: FILE_CONTENT_INPUT_TYPE, output_type: FILE_CONTENT_OUTPUT_TYPE, input_schema: FILE_CONTENT_INPUT_SCHEMA, output_schema: FILE_CONTENT_OUTPUT_SCHEMA } };
}

export function isFileEntriesSource(action: { input_type?: string; output_type?: string }): boolean {
  return action.input_type === FILE_ENTRIES_INPUT_TYPE && action.output_type === FILE_ENTRIES_OUTPUT_TYPE;
}
export function isFileContentSource(action: { input_type?: string; output_type?: string }): boolean {
  return action.input_type === FILE_CONTENT_INPUT_TYPE && action.output_type === FILE_CONTENT_OUTPUT_TYPE;
}

/** Page a complete, current list of files; stable order (kind, id) and a revision over every entry. */
export function fileEntriesPage(entries: readonly FileEntry[], input: FileEntriesInput): FileEntriesPage {
  const key = (entry: FileEntry) => `${entry.subject.kind}\u0000${entry.subject.id}`;
  const sorted = [...entries].sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
  for (let index = 1; index < sorted.length; index += 1) {
    if (key(sorted[index - 1]!) === key(sorted[index]!)) throw new ActionError("files.entry_duplicate", "文件条目身份重复");
  }
  const collection_revision = searchRevisionOf(sorted.map(entry => `${key(entry)}\u0000${entry.revision}`));
  const start = input.cursor === null ? 0 : sorted.findIndex(entry => key(entry) > input.cursor!);
  const from = start < 0 ? sorted.length : start;
  const page = sorted.slice(from, from + input.limit);
  const last = page.at(-1);
  return { entries: page, next_cursor: from + page.length < sorted.length && last ? key(last) : null, collection_revision };
}

export function bindFileEntriesHandler(definition: ActionDefinition<FileEntriesInput, FileEntriesPage>,
  list: (caller: ActionCallContext) => readonly FileEntry[] | Promise<readonly FileEntry[]>,
  availability?: ActionHandlerBinding["availability"]): ActionHandlerBinding {
  return { capability_id: definition.capability_id, version: definition.version, ...(availability ? { availability } : {}),
    handle: async (caller, input) => fileEntriesPage(await list(caller), input as FileEntriesInput) };
}

/** Text or bytes as a bounded preview: text is cut at the limit and marked, bytes over it are refused. */
export function fileContentOf(input: { subject: ActionSubject; revision: string; title: string; media_type: string; text?: string; bytes?: Uint8Array }): FileContent {
  if (input.text !== undefined) {
    const limit = Math.floor(FILE_CONTENT_MAX_BYTES / 3);
    return { subject: input.subject, revision: input.revision, title: input.title, media_type: input.media_type, encoding: "utf8",
      data: input.text.length > limit ? input.text.slice(0, limit) : input.text, truncated: input.text.length > limit };
  }
  const bytes = input.bytes ?? new Uint8Array();
  if (bytes.byteLength > FILE_CONTENT_MAX_BYTES) throw new ActionError("files.too_large", "文件太大，不能在侧栏预览");
  let binary = "";
  for (let index = 0; index < bytes.byteLength; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return { subject: input.subject, revision: input.revision, title: input.title, media_type: input.media_type, encoding: "base64", data: btoa(binary), truncated: false };
}

/** Manifest-level check shared by inspectActionDeclarations. Returns problems, never throws. */
export function fileSourceDeclarationProblems(key: string, action: Record<string, unknown>, operation: unknown, canonical: (value: unknown) => string): string[] {
  const entries = isFileEntriesSource(action as { input_type?: string; output_type?: string });
  const content = isFileContentSource(action as { input_type?: string; output_type?: string });
  const mentions = [FILE_ENTRIES_INPUT_TYPE, FILE_ENTRIES_OUTPUT_TYPE, FILE_CONTENT_INPUT_TYPE, FILE_CONTENT_OUTPUT_TYPE]
    .some(type => action.input_type === type || action.output_type === type);
  if (!mentions && action.file_source === undefined) return [];
  const declared = action.file_source as { kinds?: unknown; role?: unknown } | undefined;
  const kinds = declared?.kinds;
  const subjectKinds = Array.isArray(action.subject_kinds) ? action.subject_kinds as unknown[] : [];
  const kindsValid = Array.isArray(kinds) && kinds.length > 0 && kinds.every(entry => !!entry && typeof entry === "object"
    && typeof (entry as FileSourceKind).kind === "string" && subjectKinds.includes((entry as FileSourceKind).kind)
    && typeof (entry as FileSourceKind).title === "string" && (entry as FileSourceKind).title.trim().length > 0
    && typeof (entry as FileSourceKind).surface === "string" && /^[a-zA-Z0-9_-]{1,64}$/u.test((entry as FileSourceKind).surface))
    && new Set(kinds.map(entry => (entry as FileSourceKind).kind)).size === kinds.length && kinds.length === subjectKinds.length;
  const schemas = entries ? [FILE_ENTRIES_INPUT_SCHEMA, FILE_ENTRIES_OUTPUT_SCHEMA] : content ? [FILE_CONTENT_INPUT_SCHEMA, FILE_CONTENT_OUTPUT_SCHEMA] : null;
  const role = entries ? "entries" : content ? "content" : null;
  const openToUser = Array.isArray(action.audiences) && (action.audiences as unknown[]).includes("user");
  if (!schemas || declared?.role !== role || operation !== "query" || action.kind !== "query" || !["home", "project"].includes(String(action.scope))
    || !kindsValid || !openToUser || canonical(action.input_schema) !== canonical(schemas[0]) || canonical(action.output_schema) !== canonical(schemas[1])) {
    return [`能力 ${key} 没有兑现文件来源协议 v1：需要规范输入输出、查询类型、对本机用户开放、与角色一致的声明和对应文件种类的打开位置`];
  }
  return [];
}
