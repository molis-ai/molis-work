import type { ActionDefinition } from "../platform/actions.js";
import type { AgentSessionRef } from "./agent-host.js";
import type { MemoryScope } from "./memory.js";

/** A business selector is navigation, never an execution identity or permission. */
export interface MemorySessionTarget {
  readonly kind: "coding" | "assistant";
  readonly id: string;
  readonly project_id: string | null;
}
/** Serializable projection of the binding checked by the protected Host entry. */
export interface MemorySessionBinding {
  readonly session: AgentSessionRef;
  readonly current_scene: "coding" | "assistant";
  readonly target: MemorySessionTarget;
}
export interface MemorySessionClearPreview { preview_id: string | null; memory_count: number; candidate_count: number }
export type MemorySessionClearItem = ({ kind: "memory"; memory_id: string } | { kind: "memory-candidate"; candidate_id: string }) & {
  outcome: "completed" | "already-absent" | "conflict" | "not-executed" | "unknown";
  forgetting: "accepted" | "not-accepted";
  cleanup: "complete" | "pending" | "needs-reconcile";
};
export interface MemorySessionClearResult { complete: boolean; items: MemorySessionClearItem[] }
export type MemorySessionPendingOperation = {
  kind: "session-clear"; operation_id: string; at: string; forgetting: "accepted" | "not-accepted" | "unknown";
} & ({ cleanup: "pending"; preview_id: string; target: MemorySessionTarget } | { cleanup: "needs-reconcile" });

/** App-internal body-free SDK bridge. These tuples are never an Action or browser input. */
export interface MemorySessionPurgeSelection {
  readonly session_ref: { readonly kind: "session"; readonly id: string; readonly revision: 1 };
  readonly operation_id: string;
}
export interface MemorySessionPurgeTarget<S extends string = MemoryScope> {
  readonly kind: "memory" | "memory-candidate";
  readonly id: string; readonly scope: S; readonly owner: string; readonly version: number;
  readonly operation_id: string; readonly selection: MemorySessionPurgeSelection;
}
export interface MemorySessionPurgePage<S extends string = MemoryScope> {
  readonly outcome: "completed" | "partial" | "cancelled";
  readonly items: readonly { readonly kind: "memory" | "memory-candidate"; readonly id: string; readonly scope: S; readonly owner: string;
    readonly version: number; readonly state: string; readonly session_ref?: MemorySessionPurgeSelection["session_ref"] }[];
  readonly issues: readonly { readonly code: string }[]; readonly exhausted: boolean; readonly cursor?: string;
}

const id = { type: "string", minLength: 1, maxLength: 200 } as const;
export const memorySessionTargetSchema = { type: "object", properties: { kind: { enum: ["coding", "assistant"] }, id,
  project_id: { anyOf: [id, { type: "null" }] } }, required: ["kind", "id", "project_id"], additionalProperties: false } as const;
const operation = { kind: { const: "session-clear" }, operation_id: id, at: { type: "string" }, forgetting: { enum: ["accepted", "not-accepted", "unknown"] } } as const;
export const memorySessionOperationSchemas = [
  { type: "object", properties: { ...operation, cleanup: { const: "pending" }, preview_id: id, target: memorySessionTargetSchema },
    required: ["kind", "operation_id", "at", "forgetting", "cleanup", "preview_id", "target"], additionalProperties: false },
  { type: "object", properties: { ...operation, cleanup: { const: "needs-reconcile" } }, required: ["kind", "operation_id", "at", "forgetting", "cleanup"], additionalProperties: false },
] as const;
const count = { type: "integer", minimum: 0 } as const;
const itemState = { outcome: { enum: ["completed", "already-absent", "conflict", "not-executed", "unknown"] },
  forgetting: { enum: ["accepted", "not-accepted"] }, cleanup: { enum: ["complete", "pending", "needs-reconcile"] } } as const;
const item = { oneOf: [
  { type: "object", properties: { kind: { const: "memory" }, memory_id: id, ...itemState }, required: ["kind", "memory_id", "outcome", "forgetting", "cleanup"], additionalProperties: false },
  { type: "object", properties: { kind: { const: "memory-candidate" }, candidate_id: id, ...itemState }, required: ["kind", "candidate_id", "outcome", "forgetting", "cleanup"], additionalProperties: false },
] } as const;
const base = { scope: "home", audiences: ["user"], permissions: ["memory:configure"], subject_kinds: [] } as const;

/** The protected Host context supplies the binding; neither action accepts a raw execution ref. */
export const memorySessionActions = {
  sessionClearPreview: { capability_id: "memory.session.clear.preview", version: /* @version action.memory.session.clear.preview */ 1, operation: "query", action: { ...base,
    title: "预览本会话记忆清除", description: "完整预览当前业务会话固定的正式记忆和候选，不删除对话。", kind: "query", effect: "read",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    output_schema: { oneOf: [
      { type: "object", properties: { preview_id: { type: "null" }, memory_count: { const: 0 }, candidate_count: { const: 0 } }, required: ["preview_id", "memory_count", "candidate_count"], additionalProperties: false },
      { type: "object", properties: { preview_id: id, memory_count: count, candidate_count: count }, required: ["preview_id", "memory_count", "candidate_count"],
        anyOf: [{ properties: { memory_count: { type: "integer", minimum: 1 } } }, { properties: { candidate_count: { type: "integer", minimum: 1 } } }], additionalProperties: false },
    ] } } } as ActionDefinition<Record<string, never>, MemorySessionClearPreview>,
  sessionClearApply: { capability_id: "memory.session.clear.apply", version: /* @version action.memory.session.clear.apply */ 1, operation: "command", action: { ...base,
    title: "只清除本会话记忆", description: "继续原固定清理计划；保留对话和未选长期记忆，逐项报告确定结果。", kind: "operation", effect: "irreversible",
    input_schema: { type: "object", properties: { preview_id: id }, required: ["preview_id"], additionalProperties: false },
    output_schema: { type: "object", properties: { complete: { type: "boolean" }, items: { type: "array", minItems: 1, items: item } },
      required: ["complete", "items"], additionalProperties: false } } } as ActionDefinition<{ preview_id: string }, MemorySessionClearResult>,
} as const;
