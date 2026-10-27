import type { ActionDefinition } from "../platform/actions.js";

/** Only stable references enter automatic learning; identity and grants come from the Host. */
export interface MemoryLearningEnqueueRequest {
  business_session_id: string;
  runtime_id: string;
  session_id: string;
  run_id: string;
}
export interface MemoryLearningSourceBinding {
  business_session_id: string;
  runtime_id: string;
  session_id: string;
  state: "active" | "pending" | "archived";
  lifecycle_operation_id: string | null;
}
const id = { type: "string", minLength: 1, maxLength: 200 };
const references = { business_session_id: id, runtime_id: id, session_id: id, run_id: id };
export const memoryLearningEnqueueAction: ActionDefinition<MemoryLearningEnqueueRequest, { status: "queued" | "existing" | "skipped" }> = {
  capability_id: "memory.learning.enqueue", version: 1, operation: "command",
  action: { title: "登记完成后的记忆形成", description: "仅登记本人新原件的运行引用，由现有持久队列重新核验来源和形成许可",
    scope: "project", subject_kinds: ["coding_session"], kind: "operation", effect: "write", scheduling: "concurrent", audiences: ["plugin"], permissions: ["memory:write"],
    input_schema: { type: "object", properties: references, required: Object.keys(references), additionalProperties: false },
    output_schema: { type: "object", properties: { status: { enum: ["queued", "existing", "skipped"] } }, required: ["status"], additionalProperties: false } },
};
/** Implemented by the original session owner; no conversation or Runtime body crosses this query. */
export const memoryLearningSourceAction: ActionDefinition<{ session_id: string }, MemoryLearningSourceBinding | null> = {
  capability_id: "memory.source.session.read", version: 1, operation: "query",
  action: { title: "读取记忆来源会话归属", description: "读取原业务会话与 Runtime 的绑定和当前生命周期，不返回正文",
    scope: "project", subject_kinds: ["coding_session"], kind: "query", effect: "read", audiences: ["user"], permissions: ["artifact:read"],
    input_schema: { type: "object", properties: { session_id: id }, required: ["session_id"], additionalProperties: false },
    output_schema: { oneOf: [{ type: "null" }, { type: "object", properties: { business_session_id: id, runtime_id: id, session_id: id,
      state: { enum: ["active", "pending", "archived"] }, lifecycle_operation_id: { type: ["string", "null"] } },
      required: ["business_session_id", "runtime_id", "session_id", "state", "lifecycle_operation_id"], additionalProperties: false }] } },
};
