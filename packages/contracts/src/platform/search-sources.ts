import { ActionError, type ActionDefinition, type ActionHandlerBinding, type ActionCallContext } from "./actions.js";
import { ACTION_SUBJECT_SCHEMA, type ActionSubject } from "./action-subjects.js";

/**
 * How a plugin hands its searchable objects to the system search (specs/system-search §5.1).
 * The plugin keeps its own store and rules; search only calls these declared actions with the caller's authority.
 */
export const SEARCH_ENTRIES_INPUT_TYPE = "molis.search.entries.window.v1";
export const SEARCH_ENTRIES_OUTPUT_TYPE = "molis.search.entries.page.v1";
export const SEARCH_QUERY_INPUT_TYPE = "molis.search.query.request.v1";
export const SEARCH_QUERY_OUTPUT_TYPE = "molis.search.query.hits.v1";
export const SEARCH_ENTRIES_PAGE_LIMIT = 500;

/** Where the person opens an object: the Workbench plugin surface and the object's id inside it. */
export interface SearchOpenTarget { surface: string; id: string }
/** Static declaration read from the directory: which object kinds a source lists, and where each opens. */
export interface SearchSourceKind { kind: string; title: string; surface: string }
export interface SearchSourceDeclaration { readonly kinds: readonly SearchSourceKind[] }

export interface SearchEntriesInput { cursor: string | null; limit: number }
export interface SearchEntry {
  subject: ActionSubject;
  /** Owner's own version token; it changes whenever anything indexable of this object changes. Compared exactly. */
  revision: string;
  title: string;
  /** Plain text the owner allows to persist in the index; may be empty. */
  summary: string;
  updated_at: string | null;
  /**
   * `context`: search reads the object's content through the same provider's subject reader and indexes it.
   * `summary`: only title and summary are indexed; the content stays with its owner (encrypted or private).
   */
  content: "context" | "summary";
  open: SearchOpenTarget | null;
}
export interface SearchEntriesPage {
  entries: SearchEntry[];
  next_cursor: string | null;
  /** Changes whenever any entry of the collection is created, changed or removed. Fresh every call when unknown. */
  collection_revision: string;
}

/** Optional: content that must not be persisted is searched by its owner at query time. */
export interface SearchQueryInput { query: string; limit: number }
export interface SearchQueryHit {
  subject: ActionSubject;
  revision: string;
  title: string;
  snippet: string;
  updated_at: string | null;
  open: SearchOpenTarget | null;
}
export interface SearchQueryResult { hits: SearchQueryHit[] }

const token = { type: "string", minLength: 1, maxLength: 64, pattern: "^[a-zA-Z0-9_-]+$" };
const id = { type: "string", minLength: 1 };
const text = (maxLength: number) => ({ type: "string", maxLength });
const nullableText = { type: ["string", "null"] };
export const SEARCH_OPEN_TARGET_SCHEMA = { type: "object", properties: { surface: token, id }, required: ["surface", "id"], additionalProperties: false };
const open = { anyOf: [{ type: "null" }, SEARCH_OPEN_TARGET_SCHEMA] };
export const SEARCH_ENTRIES_INPUT_SCHEMA = { type: "object", properties: { cursor: nullableText, limit: { type: "integer", minimum: 1, maximum: SEARCH_ENTRIES_PAGE_LIMIT } },
  required: ["cursor", "limit"], additionalProperties: false };
export const SEARCH_ENTRY_SCHEMA = { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA, revision: { ...id, maxLength: 200 }, title: text(1000), summary: text(4000),
  updated_at: nullableText, content: { enum: ["context", "summary"] }, open }, required: ["subject", "revision", "title", "summary", "updated_at", "content", "open"], additionalProperties: false };
export const SEARCH_ENTRIES_OUTPUT_SCHEMA = { type: "object", properties: { entries: { type: "array", maxItems: SEARCH_ENTRIES_PAGE_LIMIT, items: SEARCH_ENTRY_SCHEMA },
  next_cursor: nullableText, collection_revision: { ...id, maxLength: 200 } }, required: ["entries", "next_cursor", "collection_revision"], additionalProperties: false };
export const SEARCH_QUERY_INPUT_SCHEMA = { type: "object", properties: { query: { type: "string", minLength: 1, maxLength: 200 }, limit: { type: "integer", minimum: 1, maximum: 50 } },
  required: ["query", "limit"], additionalProperties: false };
export const SEARCH_QUERY_HIT_SCHEMA = { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA, revision: { ...id, maxLength: 200 }, title: text(1000), snippet: text(1000),
  updated_at: nullableText, open }, required: ["subject", "revision", "title", "snippet", "updated_at", "open"], additionalProperties: false };
export const SEARCH_QUERY_OUTPUT_SCHEMA = { type: "object", properties: { hits: { type: "array", maxItems: 50, items: SEARCH_QUERY_HIT_SCHEMA } }, required: ["hits"], additionalProperties: false };

const metadata = (kinds: readonly SearchSourceKind[], title: string, permissions: readonly string[], scope: "home" | "project") => ({
  title, kind: "query" as const, scope, scheduling: "concurrent" as const, audiences: ["user", "agent", "workflow", "mcp", "plugin"] as const,
  permissions: [...permissions], subject_kinds: kinds.map(entry => entry.kind), search_source: { kinds: kinds.map(entry => ({ ...entry })) },
});

/** One declaration per source: which kinds it lists and where they open. Discovery confers no authority. */
export function defineSearchEntriesAction(capabilityId: string, kinds: readonly SearchSourceKind[], title: string, permissions: readonly string[],
  scope: "home" | "project" = "project"): ActionDefinition<SearchEntriesInput, SearchEntriesPage> {
  return { capability_id: capabilityId, version: 1, operation: "query", action: { ...metadata(kinds, title, permissions, scope),
    description: `按版本分页列出${title}的全部可搜索条目，供系统搜索建立与更新索引；不修改数据。`,
    input_type: SEARCH_ENTRIES_INPUT_TYPE, output_type: SEARCH_ENTRIES_OUTPUT_TYPE, input_schema: SEARCH_ENTRIES_INPUT_SCHEMA, output_schema: SEARCH_ENTRIES_OUTPUT_SCHEMA } };
}

export function defineSearchQueryAction(capabilityId: string, kinds: readonly SearchSourceKind[], title: string, permissions: readonly string[],
  scope: "home" | "project" = "project"): ActionDefinition<SearchQueryInput, SearchQueryResult> {
  return { capability_id: capabilityId, version: 1, operation: "query", action: { ...metadata(kinds, title, permissions, scope),
    description: `在${title}的原数据中按需搜索；结果不写入系统索引。`,
    input_type: SEARCH_QUERY_INPUT_TYPE, output_type: SEARCH_QUERY_OUTPUT_TYPE, input_schema: SEARCH_QUERY_INPUT_SCHEMA, output_schema: SEARCH_QUERY_OUTPUT_SCHEMA } };
}

export function isSearchEntriesSource(action: { input_type?: string; output_type?: string }): boolean {
  return action.input_type === SEARCH_ENTRIES_INPUT_TYPE && action.output_type === SEARCH_ENTRIES_OUTPUT_TYPE;
}
export function isSearchQuerySource(action: { input_type?: string; output_type?: string }): boolean {
  return action.input_type === SEARCH_QUERY_INPUT_TYPE && action.output_type === SEARCH_QUERY_OUTPUT_TYPE;
}

/** Text a plain-text index may hold: control characters removed, whitespace folded, bounded. */
export function searchText(value: unknown, max = 4000): string {
  const raw = typeof value === "string" ? value : value == null ? "" : String(value);
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, max);
}

/** FNV-1a over a list of strings; the same list always gives the same token. Pure, for any runtime. */
export function searchRevisionOf(parts: readonly string[]): string {
  let hash = 0x811c9dc5;
  let second = 0x01000193;
  for (const part of parts) {
    for (let index = 0; index < part.length; index += 1) {
      const code = part.charCodeAt(index);
      hash = Math.imul(hash ^ code, 0x01000193) >>> 0;
      second = Math.imul(second ^ code, 0x5bd1e995) >>> 0;
    }
    hash = Math.imul(hash ^ 0x1f, 0x01000193) >>> 0;
    second = Math.imul(second ^ 0x1f, 0x5bd1e995) >>> 0;
  }
  return `${parts.length.toString(36)}-${hash.toString(36)}${second.toString(36)}`;
}

/**
 * Page a complete, current list of entries. Order is stable (kind, then id), the cursor is the last key given, and the
 * collection revision covers every entry's identity and revision, so a create, change or removal always changes it.
 */
export function searchEntriesPage(entries: readonly SearchEntry[], input: SearchEntriesInput): SearchEntriesPage {
  const key = (entry: SearchEntry) => `${entry.subject.kind}\u0000${entry.subject.id}`;
  const sorted = [...entries].sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
  for (let index = 1; index < sorted.length; index += 1) {
    if (key(sorted[index - 1]!) === key(sorted[index]!)) throw new ActionError("search.entry_duplicate", "搜索条目身份重复");
  }
  const collection_revision = searchRevisionOf(sorted.map(entry => `${key(entry)}\u0000${entry.revision}`));
  const start = input.cursor === null ? 0 : sorted.findIndex(entry => key(entry) > input.cursor!);
  const from = start < 0 ? sorted.length : start;
  const page = sorted.slice(from, from + input.limit);
  const last = page.at(-1);
  return { entries: page, next_cursor: from + page.length < sorted.length && last ? key(last) : null, collection_revision };
}

/** Bind a source's handler: the plugin supplies its current entries, the helper pages them. */
export function bindSearchEntriesHandler(definition: ActionDefinition<SearchEntriesInput, SearchEntriesPage>,
  list: (caller: ActionCallContext) => readonly SearchEntry[] | Promise<readonly SearchEntry[]>,
  availability?: ActionHandlerBinding["availability"]): ActionHandlerBinding {
  return { capability_id: definition.capability_id, version: definition.version, ...(availability ? { availability } : {}),
    handle: async (caller, input) => searchEntriesPage(await list(caller), input as SearchEntriesInput) };
}

/** Manifest-level check shared by inspectActionDeclarations. Returns problems, never throws. */
export function searchSourceDeclarationProblems(key: string, action: Record<string, unknown>, operation: unknown, canonical: (value: unknown) => string): string[] {
  const problems: string[] = [];
  const entries = isSearchEntriesSource(action as { input_type?: string; output_type?: string });
  const query = isSearchQuerySource(action as { input_type?: string; output_type?: string });
  const mentions = [SEARCH_ENTRIES_INPUT_TYPE, SEARCH_ENTRIES_OUTPUT_TYPE, SEARCH_QUERY_INPUT_TYPE, SEARCH_QUERY_OUTPUT_TYPE]
    .some(type => action.input_type === type || action.output_type === type);
  if (!mentions && action.search_source === undefined) return problems;
  const kinds = (action.search_source as { kinds?: unknown } | undefined)?.kinds;
  const subjectKinds = Array.isArray(action.subject_kinds) ? action.subject_kinds as unknown[] : [];
  const kindsValid = Array.isArray(kinds) && kinds.length > 0 && kinds.every(entry => !!entry && typeof entry === "object"
    && typeof (entry as SearchSourceKind).kind === "string" && subjectKinds.includes((entry as SearchSourceKind).kind)
    && typeof (entry as SearchSourceKind).title === "string" && (entry as SearchSourceKind).title.trim().length > 0
    && typeof (entry as SearchSourceKind).surface === "string" && /^[a-zA-Z0-9_-]{1,64}$/u.test((entry as SearchSourceKind).surface))
    && new Set(kinds.map(entry => (entry as SearchSourceKind).kind)).size === kinds.length && kinds.length === subjectKinds.length;
  const schemas = entries ? [SEARCH_ENTRIES_INPUT_SCHEMA, SEARCH_ENTRIES_OUTPUT_SCHEMA] : query ? [SEARCH_QUERY_INPUT_SCHEMA, SEARCH_QUERY_OUTPUT_SCHEMA] : null;
  if (!schemas || operation !== "query" || action.kind !== "query" || !["home", "project"].includes(String(action.scope)) || !kindsValid
    || canonical(action.input_schema) !== canonical(schemas[0]) || canonical(action.output_schema) !== canonical(schemas[1])) {
    problems.push(`能力 ${key} 没有兑现搜索来源协议 v1：需要规范输入输出、查询类型与对应对象种类的打开位置`);
  }
  return problems;
}
