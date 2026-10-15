import { ActionError, type ActionDefinition, type ActionHandlerBinding, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantThreads } from "./assistant-threads.js";
import type { StartThreadReply } from "./assistant-thread-types.js";

const id = { type: "string", minLength: 1, maxLength: 160 };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const target = object({ provider_id: id, subject_kind: id, subject_id: id, thread_id: id });
const define = (name: string, title: string, input: ActionSchema, model = false, query = false): ActionDefinition => ({
  capability_id: `assistant.threads.${name}`, provider_id: "io.molis.work.assistant.rules", version: 1, operation: query ? "query" : "command",
  action: { title, description: title, kind: query ? "query" : "operation", effect: query ? "read" : "write", scope: "project", audiences: ["user"],
    scheduling: "concurrent", permissions: model ? ["model:invoke"] : [], subject_kinds: [], input_schema: input, output_schema: { type: ["object", "null"] },
    execution: { cost: model ? "metered" : "none", timeout_ms: 120000 } },
});
export const assistantThreadActions = {
  start: define("start", "请助理回复原评论", object({ target, message_id: id,
    draft: object({ text: { type: "string", maxLength: 100000 }, revision: id }) }, ["target", "message_id"]), true),
  status: define("status", "查看原评论的助理状态", object({ target }), false, true),
  retry: define("retry", "重试原评论的助理回复", object({ work_id: id, revision: { type: "integer", minimum: 1 } }), true),
  stop: define("stop", "停止原评论的助理回复", object({ work_id: id })),
};
export function assistantThreadRegistration(threads: AssistantThreads): { definitions: ActionDefinition[]; handlers: ActionHandlerBinding[] } {
  return { definitions: Object.values(assistantThreadActions), handlers: [
    { ...assistantThreadActions.start, handle: (caller, input) => threads.start(input as StartThreadReply, caller) },
    { ...assistantThreadActions.status, handle: (caller, input) => {
      if (!caller.project_id) throw new ActionError("actions.project_required", "请选择项目");
      return threads.list((input as { target: StartThreadReply["target"] }).target, caller.project_id);
    } },
    { ...assistantThreadActions.retry, handle: (caller, input) => { const value = input as { work_id: string; revision: number };return threads.retry(value.work_id, value.revision, caller); } },
    { ...assistantThreadActions.stop, handle: (caller, input) => threads.stop((input as { work_id: string }).work_id, caller) },
  ] };
}
