import type { ContractDescriptor } from "../platform/package.js";
import type { ActionDefinition, ActionSubject } from "../platform/actions.js";
import { ACTION_SUBJECT_SCHEMA, SEARCH_OPEN_TARGET_SCHEMA, type SearchOpenTarget } from "../platform/actions.js";
import { FRAGMENT_ANY_OBJECT, defineFragmentOffersAction, type FragmentActionOffer, type FragmentOfferChoice, type FragmentOffersInput } from "../platform/action-fragments.js";

export const servicesSearchContract = {
  contractId: "io.molis.work.service.search.v1",
  kind: "service",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/horizontal/search.md",
} as const satisfies ContractDescriptor;

export const SEARCH_PROVIDER_ID = "system.search";
export const SEARCH_READ_PERMISSION = "search:read";
export const SEARCH_MANAGE_PERMISSION = "search:manage";
export const SEARCH_PERMISSIONS = [SEARCH_READ_PERMISSION, SEARCH_MANAGE_PERMISSION] as const;

/** `all` is the caller's project plus personal content; a caller without a project only has personal content. */
export type SearchScope = "project" | "personal" | "all";
export interface SearchQueryRequest {
  query: string;
  scope?: SearchScope;
  kinds?: string[];
  plugins?: string[];
  cursor?: string | null;
  limit?: number;
}
export type SearchHitField = "title" | "summary" | "content";
export interface SearchHit {
  /** Opaque and stable for one object of one source; pass it back to `search.open`. */
  hit_id: string;
  subject: ActionSubject;
  /** null for personal (Home-scoped) content. */
  project_id: string | null;
  plugin_id: string;
  plugin_title: string;
  source: { capability_id: string; version: number; provider_id: string };
  title: string;
  snippet: string;
  /** [start, end) offsets of matched text inside `snippet`. */
  highlights: Array<[number, number]>;
  revision: string;
  updated_at: string | null;
  open: SearchOpenTarget | null;
  /** First match inside the original field, for placing the reader at the hit. */
  locator: { field: SearchHitField; offset: number; length: number; text: string };
}
export type SearchSourceState = "ready" | "indexing" | "stale" | "failed" | "unavailable" | "disabled";
export interface SearchSourceStatus {
  plugin_id: string;
  title: string;
  scope: "project" | "personal";
  state: SearchSourceState;
  reason: string | null;
  indexed_at: string | null;
  entries: number;
}
/** complete: every source is current; partial: results are valid but some source failed, is stale or still indexing; indexing: nothing indexed yet. */
export type SearchQueryStatus = "complete" | "partial" | "indexing" | "empty_scope";
export interface SearchQueryResponse {
  status: SearchQueryStatus;
  hits: SearchHit[];
  next_cursor: string | null;
  sources: SearchSourceStatus[];
}
export interface SearchOpenRequest { hit_id: string }
export type SearchOpenResponse =
  | { state: "ok"; hit_id: string; subject: ActionSubject; open: SearchOpenTarget | null; title: string; revision: string }
  | { state: "missing"; hit_id: string; reason: string }
  | { state: "unavailable"; hit_id: string; reason: string };
export interface SearchStatusResponse { sources: SearchSourceStatus[] }
export interface SearchRebuildRequest { scope?: SearchScope }
export interface SearchRebuildResponse { cleared: number; sources: SearchSourceStatus[] }

const text = { type: "string" };
const nullableText = { type: ["string", "null"] };
const token = { type: "string", minLength: 1, maxLength: 64, pattern: "^[a-zA-Z0-9_.:-]+$" };
const scope = { enum: ["project", "personal", "all"] };
const sourceStatus = { type: "object", properties: { plugin_id: text, title: text, scope: { enum: ["project", "personal"] },
  state: { enum: ["ready", "indexing", "stale", "failed", "unavailable", "disabled"] }, reason: nullableText, indexed_at: nullableText, entries: { type: "integer", minimum: 0 } },
  required: ["plugin_id", "title", "scope", "state", "reason", "indexed_at", "entries"], additionalProperties: false };
const hit = { type: "object", properties: { hit_id: { type: "string", minLength: 1 }, subject: ACTION_SUBJECT_SCHEMA, project_id: nullableText, plugin_id: text, plugin_title: text,
  source: { type: "object", properties: { capability_id: text, version: { type: "integer", minimum: 1 }, provider_id: text }, required: ["capability_id", "version", "provider_id"], additionalProperties: false },
  title: text, snippet: text, highlights: { type: "array", items: { type: "array", items: { type: "integer", minimum: 0 }, minItems: 2, maxItems: 2 } },
  revision: text, updated_at: nullableText, open: { anyOf: [{ type: "null" }, SEARCH_OPEN_TARGET_SCHEMA] },
  locator: { type: "object", properties: { field: { enum: ["title", "summary", "content"] }, offset: { type: "integer", minimum: 0 }, length: { type: "integer", minimum: 0 }, text },
    required: ["field", "offset", "length", "text"], additionalProperties: false } },
  required: ["hit_id", "subject", "project_id", "plugin_id", "plugin_title", "source", "title", "snippet", "highlights", "revision", "updated_at", "open", "locator"], additionalProperties: false };
const sources = { type: "array", items: sourceStatus };

const metadata = {
  kind: "query" as const, scope: "home" as const, scheduling: "concurrent" as const, subject_kinds: [] as string[],
  audiences: ["user", "agent", "workflow", "mcp", "plugin"] as ("user" | "agent" | "workflow" | "mcp" | "plugin")[],
};

/**
 * What search offers for a word selected anywhere (specs/archive/contextual-interaction §10 P2): where else it appears. The
 * workbench shows the result in its own search palette, so nothing is written and the person opens what they choose.
 */
export const SEARCH_FRAGMENT_CHOICES: readonly FragmentOfferChoice[] = [
  { offer_id: "find", title: "在项目里查找", intent: "understand", apply: "result", hint: "在本项目与个人资料里查找这个词还出现在哪里",
    action: { capability_id: "search.query", version: 1 }, granularities: ["word"] },
];

/** `search.query` input for a selected word; pure. */
export function prepareSearchFragmentOffers(input: FragmentOffersInput): FragmentActionOffer[] {
  const word = input.fragment.granularity === "word" ? (input.fragment.targets[0]?.text ?? "").trim() : "";
  if (!word || word.length > 40) return [];
  return [{ offer_id: "find", title: "在项目里查找", action: { capability_id: "search.query", version: 1, provider_id: SEARCH_PROVIDER_ID }, input: { query: word } }];
}

/** Registered once by the Host as `system.search`; every entry reaches them through the shared directory. */
export const searchActions = {
  fragmentOffers: defineFragmentOffersAction("search.fragment.offers", [FRAGMENT_ANY_OBJECT], "选中的词可以查找的地方", [SEARCH_READ_PERMISSION], SEARCH_FRAGMENT_CHOICES, "home"),
  query: { capability_id: "search.query", version: 1, operation: "query", action: { ...metadata, permissions: [SEARCH_READ_PERMISSION],
    title: "搜索内容", description: "在当前项目与个人范围里搜索已接入插件的真实内容，返回对象引用、所属插件、摘要与打开位置；只返回调用者当前可读取的来源。",
    input_schema: { type: "object", properties: { query: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S" }, scope,
      kinds: { type: "array", maxItems: 50, items: token }, plugins: { type: "array", maxItems: 50, items: token }, cursor: nullableText,
      limit: { type: "integer", minimum: 1, maximum: 50 } }, required: ["query"], additionalProperties: false },
    output_schema: { type: "object", properties: { status: { enum: ["complete", "partial", "indexing", "empty_scope"] }, hits: { type: "array", items: hit }, next_cursor: nullableText, sources },
      required: ["status", "hits", "next_cursor", "sources"], additionalProperties: false } } } as ActionDefinition<SearchQueryRequest, SearchQueryResponse>,
  open: { capability_id: "search.open", version: 1, operation: "query", action: { ...metadata, permissions: [SEARCH_READ_PERMISSION],
    title: "打开搜索结果", description: "按原提供方重新核对搜索结果的对象仍存在且可读，返回当前打开位置；对象已删除时说明并移出索引。不修改业务数据。",
    input_schema: { type: "object", properties: { hit_id: { type: "string", minLength: 1, maxLength: 2000 } }, required: ["hit_id"], additionalProperties: false },
    output_schema: { anyOf: [
      { type: "object", properties: { state: { const: "ok" }, hit_id: text, subject: ACTION_SUBJECT_SCHEMA, open: { anyOf: [{ type: "null" }, SEARCH_OPEN_TARGET_SCHEMA] }, title: text, revision: text },
        required: ["state", "hit_id", "subject", "open", "title", "revision"], additionalProperties: false },
      { type: "object", properties: { state: { enum: ["missing", "unavailable"] }, hit_id: text, reason: text }, required: ["state", "hit_id", "reason"], additionalProperties: false },
    ] } } } as ActionDefinition<SearchOpenRequest, SearchOpenResponse>,
  status: { capability_id: "search.status", version: 1, operation: "query", action: { ...metadata, permissions: [SEARCH_READ_PERMISSION],
    title: "搜索索引状态", description: "查看当前范围内各插件的索引状态：已就绪、首次索引中、读取失败或已停用。",
    input_schema: { type: "object", properties: { scope }, additionalProperties: false },
    output_schema: { type: "object", properties: { sources }, required: ["sources"], additionalProperties: false } } } as ActionDefinition<{ scope?: SearchScope }, SearchStatusResponse>,
  rebuild: { capability_id: "search.rebuild", version: 1, operation: "command", action: { ...metadata, kind: "operation" as const, effect: "write" as const, audiences: ["user"] as ("user")[],
    permissions: [SEARCH_MANAGE_PERMISSION], title: "重建搜索索引", description: "删除当前范围的搜索索引并按各插件原数据重新建立；不修改任何业务数据。",
    input_schema: { type: "object", properties: { scope }, additionalProperties: false },
    output_schema: { type: "object", properties: { cleared: { type: "integer", minimum: 0 }, sources }, required: ["cleared", "sources"], additionalProperties: false } } } as ActionDefinition<SearchRebuildRequest, SearchRebuildResponse>,
};

/* ---- Technical index port: implemented by packages/storage, used only by horizontal/search. No business meaning. ---- */

export interface SearchIndexSourceRecord {
  source_key: string;
  project_id: string | null;
  provider_id: string;
  capability_id: string;
  version: number;
  plugin_id: string;
  title: string;
  /** Collection revision of the last complete pass; null before the first one finishes. */
  collection_revision: string | null;
  state: "ready" | "indexing" | "failed";
  error: string | null;
  synced_at: number | null;
  checked_at: number | null;
}
export interface SearchIndexDocument {
  source_key: string;
  kind: string;
  object_id: string;
  project_id: string | null;
  revision: string;
  title: string;
  summary: string;
  content: string;
  updated_at: string | null;
  open: SearchOpenTarget | null;
  /** `context`: content came from the subject reader, so a caller must be able to read that kind to see it. */
  content_policy: "context" | "summary";
}
export interface SearchIndexMatch {
  source_key: string;
  kind: string;
  object_id: string;
  project_id: string | null;
  revision: string;
  title: string;
  updated_at: string | null;
  open: SearchOpenTarget | null;
  score: number;
  snippet: string;
  highlights: Array<[number, number]>;
  locator: { field: SearchHitField; offset: number; length: number; text: string };
}
/** Each source the caller may see, and the kinds whose reader-provided content it may see. */
export interface SearchIndexQuery {
  query: string;
  sources: readonly { source_key: string; readable_kinds: readonly string[] }[];
  kinds?: readonly string[];
  offset: number;
  limit: number;
}
export interface SearchIndexPort {
  sources(): SearchIndexSourceRecord[];
  source(sourceKey: string): SearchIndexSourceRecord | null;
  saveSource(record: SearchIndexSourceRecord): void;
  /** Removes the source and every document it indexed. */
  removeSource(sourceKey: string): number;
  removeProject(projectId: string): number;
  /** `${kind}\u0000${object_id}` → revision, for one source. */
  revisions(sourceKey: string): Map<string, string>;
  count(sourceKey: string): number;
  upsert(documents: readonly SearchIndexDocument[]): void;
  remove(sourceKey: string, keys: readonly { kind: string; object_id: string }[]): void;
  document(sourceKey: string, kind: string, objectId: string): SearchIndexDocument | null;
  search(query: SearchIndexQuery): { matches: SearchIndexMatch[]; total: number };
  clear(): number;
  close(): void;
}

/** Stable key of one source registration in one scope. */
export function searchSourceKey(input: { project_id: string | null; provider_id: string; capability_id: string; version: number }): string {
  return JSON.stringify([input.project_id ?? "", input.provider_id, input.capability_id, input.version]);
}
