import type { ActionDefinition } from "../platform/actions.js";

/** References only: canonical bodies remain with their existing Session owner. */
export interface MemoryLearningRequest { session_id: string; run_id: string }
export interface MemoryLearningTaskRequest extends MemoryLearningRequest { task_key: string }
export interface MemoryLearningResult { outcome: "completed" | "skipped" }
export interface MemoryLearningEnqueued { outcome: "queued" | "skipped"; task_key: string | null }
export type MemoryLearningOwnedSource = Readonly<{ event_id: string; version: string; session_id: string }>;

const ref = { type: "string", minLength: 1, maxLength: 200 };
const taskRef = { type: "string", minLength: 1, maxLength: 2000 };
const request = { type: "object", properties: { session_id: ref, run_id: ref }, required: ["session_id", "run_id"], additionalProperties: false };
const task = { ...request, properties: { ...request.properties, task_key: taskRef }, required: ["session_id", "run_id", "task_key"] };
const result = { type: "object", properties: { outcome: { enum: ["completed", "skipped"] } }, required: ["outcome"], additionalProperties: false };
const command = { scope: "project", kind: "operation", effect: "write", audiences: ["plugin"], permissions: [], subject_kinds: [], scheduling: "concurrent", execution: { cost: "metered" } } as const;

/** Admission, current source owner invocation, and formation share the original memory.learn runner. */
export const memoryLearningActions = {
  enqueue: { capability_id: "memory.learning.enqueue", version: 1, operation: "command", action: { ...command,
    title: "接纳已完成工作的记忆学习", description: "只接纳本安装已完成 Run 的完整本人原件引用，持久排队不代表已经提炼。", input_schema: request,
    output_schema: { type: "object", properties: { outcome: { enum: ["queued", "skipped"] }, task_key: { anyOf: [taskRef, { type: "null" }] } }, required: ["outcome", "task_key"], additionalProperties: false } } } as ActionDefinition<MemoryLearningRequest, MemoryLearningEnqueued>,
  run: { capability_id: "memory.learning.run", version: 1, operation: "command", action: { ...command,
    title: "在当前来源主人中运行记忆学习", description: "持有当前来源的同步业务检查，等待原形成与记账完成。", input_schema: task, output_schema: result } } as ActionDefinition<MemoryLearningTaskRequest, MemoryLearningResult>,
  form: { capability_id: "memory.learning.form", version: 1, operation: "command", action: { ...command,
    title: "形成已接纳工作的记忆", description: "仅在当前来源主人尚未返回的调用中，沿原 SDK 形成与晋升链执行。", input_schema: task, output_schema: result } } as ActionDefinition<MemoryLearningTaskRequest, MemoryLearningResult>,
};
