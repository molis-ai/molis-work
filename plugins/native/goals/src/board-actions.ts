import { ActionError, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { GoalsCommandApi } from "@molis-ai/molis-work-contracts/modules/goals";
import { goalAction, goalActor } from "./action-contract.js";
import { text, identifier, count, boolean, object } from "./event-action-schemas.js";
import type { InitializeBoardOutput } from "./board-entry-capabilities.js";

/** What board initialization needs from the Goals owner. */
export interface GoalsBoardPorts {
  initializeBoard: GoalsCommandApi["initializeBoard"];
}
function management<I, O>(definition: ActionDefinition<I, O>): ActionDefinition<I, O> {
  return { ...definition, action: { ...definition.action, audiences: ["user"] } };
}
function requireManagement(caller: ActionCallContext): void {
  if (caller.audience !== "user" || caller.actor_kind !== "user" || !caller.actor_id.trim()
    || caller.user_action?.source !== "management" || !caller.user_action.conversation_ref.trim() || !caller.user_action.message_ref.trim()) {
    throw new ActionError("goals.management_required", "初始化仅供可信本地管理入口使用");
  }
}
export const goalsBoardActions = {
  initialize: management(goalAction<{ title: string; idempotency_key: string }, InitializeBoardOutput>("goals.board.initialize", "初始化目标资料库",
    "在当前可信管理上下文中为本项目初始化尚不存在的目标资料库；不创建项目目录绑定，不覆盖已有资料库，重试保留原请求键", "command",
    object({ title: identifier, idempotency_key: identifier }), object({ project_id: text, replayed: boolean, observed_event_cursor: count }))),
} as const;
export function createGoalsBoardActionHandlers(projectId: string, ports: GoalsBoardPorts): ActionHandlerBinding[] {
  const protect = (binding: ActionHandlerBinding): ActionHandlerBinding => ({ ...binding,
    availability(caller) { try { requireManagement(caller); return { available: true }; }
      catch (error) { if (error instanceof ActionError) return { available: false, code: error.code, reason: error.message }; throw error; } },
    handle(caller, input) { requireManagement(caller); return binding.handle(caller, input); } });
  return [
    protect({ ...goalsBoardActions.initialize, handle: (caller, input) => ports.initializeBoard({
      ...input as { title: string; idempotency_key: string }, project_id: projectId, actor_id: goalActor(caller).actor_id }) }),
  ];
}
