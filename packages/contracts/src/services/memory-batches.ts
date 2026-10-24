import type { ActionDefinition } from "../platform/actions.js";
import type { MemoryScope } from "./memory.js";

/** The complete fixed-selection preview/apply contract; the runtime owns execution and receipts. */
/** Explicit App selection bound; independent of query pagination. */
export const MEMORY_BATCH_MAX_ITEMS = 100;
export interface MemoryBatchItem { scope: MemoryScope; owner: string; memory_id: string; expected_version: number }
export interface MemoryBatchRequest { action: "disable" | "remove"; items: MemoryBatchItem[] }
export interface MemoryBatchPreview extends MemoryBatchRequest { preview_id: string; max_items: number }
export interface MemoryBatchResult {
  preview_id: string; action: MemoryBatchRequest["action"]; complete: boolean;
  items: Array<MemoryBatchItem & { outcome: "completed" | "conflict" | "refused" | "unknown" | "not-executed"; change_id?: string }>;
}

const text = { type: "string" };
const memoryId = { type: "string", minLength: 1, maxLength: 200 };
const scopeSchema = { enum: ["personal", "project", "character"] };
const writes = { scope: "home" as const, subject_kinds: [] as string[], kind: "operation" as const, effect: "write" as const };
const person = ["user"] as ("user")[];
const batchItemSchema = { type: "object", properties: { scope: scopeSchema, owner: { type: "string", minLength: 1, maxLength: 200 }, memory_id: memoryId,
  expected_version: { type: "integer", minimum: 1 } }, required: ["scope", "owner", "memory_id", "expected_version"], additionalProperties: false };
const batchProperties = { action: { enum: ["disable", "remove"] }, items: { type: "array", minItems: 1, maxItems: MEMORY_BATCH_MAX_ITEMS, items: batchItemSchema } };
const batchIdentity = { preview_id: { type: "string", minLength: 1, maxLength: 200 } };

export function memoryBatchActions(permission: string) {
  return {
  batchPreview: { capability_id: "memory.batch.preview", version: 1, operation: "command", action: { ...writes, audiences: person, permissions: [permission],
    title: "预览所选记忆的批量操作", description: "冻结本人选择的最多 100 条原身份和版本，逐项校验停用或遗忘；后来新增不进入。",
    input_schema: { type: "object", properties: batchProperties, required: ["action", "items"], additionalProperties: false },
    output_schema: { type: "object", properties: { ...batchProperties, ...batchIdentity, max_items: { type: "integer", minimum: 1, maximum: MEMORY_BATCH_MAX_ITEMS } },
      required: ["action", "items", "preview_id", "max_items"], additionalProperties: false } } } as ActionDefinition<MemoryBatchRequest, MemoryBatchPreview>,
  batchApply: { capability_id: "memory.batch.apply", version: 1, operation: "command", action: { ...writes, effect: "irreversible" as const, audiences: person, permissions: [permission],
    title: "执行原选集的批量操作", description: "按原预览逐项停用或完整遗忘；重核当前权限和版本，取消或未知停止后续。",
    input_schema: { type: "object", properties: batchIdentity, required: ["preview_id"], additionalProperties: false },
    output_schema: { type: "object", properties: { ...batchIdentity, action: batchProperties.action, complete: { type: "boolean" },
      items: { type: "array", maxItems: MEMORY_BATCH_MAX_ITEMS, items: { ...batchItemSchema,
        properties: { ...batchItemSchema.properties, outcome: { enum: ["completed", "conflict", "refused", "unknown", "not-executed"] }, change_id: text },
        required: [...batchItemSchema.required, "outcome"] } } }, required: ["preview_id", "action", "complete", "items"], additionalProperties: false } } } as ActionDefinition<{ preview_id: string }, MemoryBatchResult>,
  };
}
