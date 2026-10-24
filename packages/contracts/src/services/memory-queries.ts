import type { ActionDefinition } from "../platform/actions.js";
import type { MemoryItem, MemoryKind, MemoryFormalKind, MemoryScope, MemorySource, MemoryState } from "./memory.js";
import type { AgentMemoryMeta, AgentMemoryPage } from "./agent-host-memory.js";

/** Host-only Run read control. The selector belongs to the Memory owner, never a plugin or model input. */
export interface MemoryRunReference {
  readonly scope: "user" | "project" | "character";
  readonly owner: string;
  readonly memory_id: string;
  readonly version: number;
}
export interface MemoryRunReadResult {
  readonly mode: "run-expansion";
  readonly receipt_id: string;
  readonly outcome: "queued" | "none" | "unavailable" | "failed" | "timeout" | "cancelled";
  readonly error_code?: string;
  readonly queued: readonly { readonly memory_id: string; readonly version: number }[];
  readonly omitted: readonly { readonly memory_id: string; readonly version: number }[];
  readonly tokens: number;
  readonly basis: "provider-reported" | "conservative-estimate";
  readonly remaining_tokens: number;
}
export interface MemoryRunReadControl {
  read(select: (scopes: readonly Pick<MemoryRunReference, "scope" | "owner">[]) => Promise<readonly MemoryRunReference[]>, signal?: AbortSignal): Promise<MemoryRunReadResult>;
}

export interface MemoryListRequest {
  scope?: MemoryScope | "all";
  kinds?: MemoryKind[];
  sources?: MemorySource[];
  states?: MemoryState[];
  query?: string;
}

export interface MemoryListResponse {
  items: MemoryItem[];
  /** Management counts are null when this caller did not query them; null never means zero. */
  counts: { personal: number; project: number; auto_this_week: number | null; pending: number | null };
}

/** Management displays all declared kinds; write and formation retain their narrower product contract. */
export type MemoryManagementKind = MemoryFormalKind;
export interface MemoryManagementItem extends Omit<MemoryItem, "kind"> {
  /** Canonical selected-set target; never a grant. */
  owner: string;
  kind: MemoryManagementKind;
  classification: NonNullable<AgentMemoryMeta["classification"]> | null;
  expired: boolean;
}
export interface MemoryPageFilter {
  scenes?: string[];
  kinds?: MemoryManagementKind[];
  lifecycles?: string[];
  states?: MemoryState[];
  sources?: MemorySource[];
  expired?: boolean;
  unclassified?: boolean;
}
export interface MemoryPageRequest {
  scope?: MemoryScope;
  character_id?: string;
  filter?: MemoryPageFilter;
  query?: string;
  limit?: number;
  cursor?: string;
}
export interface MemoryPageResponse extends Omit<AgentMemoryPage, "items"> { items: MemoryManagementItem[] }

const text = { type: "string" };
const runMemoryRefSchema = { type: "object", properties: { memory_id: text, version: { type: "integer", minimum: 1 } }, required: ["memory_id", "version"], additionalProperties: false };
export const runMemoryReadSchema = { type: "object", properties: { mode: { const: "run-expansion" }, receipt_id: text,
  outcome: { enum: ["queued", "none", "unavailable", "failed", "timeout", "cancelled"] }, error_code: text,
  queued: { type: "array", items: runMemoryRefSchema }, omitted: { type: "array", items: runMemoryRefSchema },
  tokens: { type: "number", minimum: 0 }, basis: { enum: ["provider-reported", "conservative-estimate"] }, remaining_tokens: { type: "number", minimum: 0 } },
  required: ["mode", "receipt_id", "outcome", "queued", "omitted", "tokens", "basis", "remaining_tokens"], additionalProperties: false };
const identifiers = { type: "array", maxItems: 20, items: { type: "string", minLength: 1, maxLength: 200 } };
const measured = { anyOf: [{ type: "integer", minimum: 0 }, { const: "unknown" }] };
const cost = { type: "object", properties: { directory_entries: measured, directory_enumerations: measured,
  directory_traversal: { enum: ["full", "bounded", "unknown"] }, metadata_reads: measured, body_reads: measured },
  required: ["directory_entries", "directory_enumerations", "directory_traversal", "metadata_reads", "body_reads"], additionalProperties: false };
const classification = { type: "object", properties: { scenes: { type: "array", items: text }, lifecycle: text,
  extra: { type: "object", additionalProperties: { type: "array", items: text } } }, required: ["scenes", "lifecycle"], additionalProperties: false };
const ownerProperties = { scope: { enum: ["personal", "project", "character"] }, character_id: { type: "string", minLength: 1, maxLength: 200 } };
const filterProperties = { states: { type: "array", maxItems: 3, items: { enum: ["active", "paused", "disabled"] } },
  expired: { type: "boolean" }, unclassified: { type: "boolean" } };
const continuationProperties = { query: { type: "string", maxLength: 400 }, limit: { type: "integer", minimum: 1, maximum: 100 },
  cursor: { type: "string", minLength: 1, maxLength: 65536 } };
const pageProperties = { cursor: text, exhausted: { type: "boolean" }, stopped: { enum: ["end", "limit", "scan-limit", "unknown"] },
  total: { anyOf: [{ type: "object", properties: { kind: { const: "exact" }, value: { type: "integer", minimum: 0 } }, required: ["kind", "value"], additionalProperties: false },
    { type: "object", properties: { kind: { const: "unknown" } }, required: ["kind"], additionalProperties: false }] }, scanned: measured, cost };

/** Built at the existing memory Action owner; reuse the formal item schema without broadening write outputs. */
export function memoryPageAction(item: { properties: Record<string, unknown>; required: string[] }, permission: string, writeKinds: readonly string[], sources: readonly string[]): ActionDefinition<MemoryPageRequest, MemoryPageResponse> {
  const kinds = { enum: [...writeKinds, "habit", "project-decision"] };
  return { capability_id: "memory.page", version: 2, operation: "query", action: {
    scope: "home", subject_kinds: [], kind: "query", effect: "read", plugin: false, scheduling: "concurrent", audiences: ["user"], permissions: [permission],
    title: "分批查看记忆", description: "按当前管理权限分批查看记忆及真实分类、状态和期限；未查完不推算总数。",
    input_schema: { type: "object", properties: {
      ...ownerProperties,
      filter: { type: "object", properties: { scenes: identifiers, kinds: { type: "array", maxItems: 6, items: kinds }, lifecycles: identifiers,
        ...filterProperties, sources: { type: "array", maxItems: 6, items: { enum: [...sources] } } }, additionalProperties: false },
      ...continuationProperties,
    }, additionalProperties: false },
    output_schema: { type: "object", properties: {
      items: { type: "array", maxItems: 100, items: { type: "object", properties: { ...item.properties, owner: { type: "string", minLength: 1 }, kind: kinds,
        classification: { anyOf: [{ type: "null" }, classification] }, expired: { type: "boolean" } },
        required: [...item.required, "owner", "classification", "expired"], additionalProperties: false } },
      ...pageProperties,
    }, required: ["items", "exhausted", "stopped", "total", "scanned", "cost"], additionalProperties: false },
  } };
}
