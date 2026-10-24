import { ActionError, type ActionCallContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { GoalsCommandApi } from "@molis-ai/molis-work-contracts/modules/goals";
import { goalActor } from "./action-contract.js";
import { goalEntryActions } from "@molis-ai/molis-work-contracts/modules/goal-actions";
export type { InitializeBoardOutput } from "@molis-ai/molis-work-contracts/modules/goal-actions";

/** What board initialization needs from the Goals owner. */
export interface GoalsBoardPorts {
  initializeBoard: GoalsCommandApi["initializeBoard"];
}
function requireManagement(caller: ActionCallContext): void {
  if (caller.audience !== "user" || caller.actor_kind !== "user" || !caller.actor_id.trim()
    || caller.user_action?.source !== "management" || !caller.user_action.conversation_ref.trim() || !caller.user_action.message_ref.trim()) {
    throw new ActionError("goals.management_required", "初始化仅供可信本地管理入口使用");
  }
}
export const goalsBoardActions = {
  initialize: goalEntryActions.initialize,
} as const;
export function createGoalsBoardActionHandlers(projectId: string, ports: GoalsBoardPorts): ActionHandlerBinding[] {
  const protect = (binding: ActionHandlerBinding): ActionHandlerBinding => ({ ...binding,
    availability(caller) { try { requireManagement(caller); return { available: true }; }
      catch (error) { if (error instanceof ActionError) return { available: false, code: error.code, reason: error.message }; throw error; } },
    handle(caller, input) { requireManagement(caller); return binding.handle(caller, input); } });
  return [
    protect({ ...goalsBoardActions.initialize, handle: (caller, input) => ports.initializeBoard({
      ...input as { idempotency_key: string }, project_id: projectId, actor_id: goalActor(caller).actor_id }) }),
  ];
}
