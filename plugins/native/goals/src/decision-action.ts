import { ActionError, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalEventTrustedAuthoritySources, type GoalEventDecisionResult, type GoalEventTrustedAuthority,
  type RecordGoalUserDecisionInput } from "@molis-ai/molis-work-contracts/modules/goals";
import { goalAction } from "./action-contract.js";
import { identifier, count, boolean, object, array, scope, change, effect, decision } from "./event-action-schemas.js";
import type { GoalEventApplication } from "./goal-event-application.js";

export type GoalDecisionActionInput = Omit<RecordGoalUserDecisionInput, "board_id" | "authority">;
const definition = goalAction<GoalDecisionActionInput, GoalEventDecisionResult>("goals.decisions.record", "记录用户决定",
  "保存用户本人通过受保护入口作出的决定；模型只能请求或引用决定。作者及操作出处由 Host 注入，仍核对原请求和当前承诺", "command",
  object({ goal_id: identifier, idempotency_key: identifier, request_id: identifier, selected_option_id: identifier,
    conclusion: identifier, accepts_requirements: boolean, effects: array({ ...effect, properties: { ...effect.properties as Record<string, unknown>, action: identifier } }), authorized_change: change,
    scope: { ...scope, required: [] } }, ["goal_id", "idempotency_key", "conclusion"]),
  object({ event_id: identifier, observed_event_cursor: count, replayed: boolean, recorded: { const: true }, decision }));

export const goalDecisionAction: ActionDefinition<GoalDecisionActionInput, GoalEventDecisionResult> = {
  ...definition, action: { ...definition.action, audiences: ["user"], permissions: ["goals:decide"] },
};

function authority(caller: ActionCallContext): GoalEventTrustedAuthority {
  const provenance = caller.user_action;
  if (caller.audience !== "user" || caller.actor_kind !== "user" || !caller.actor_id.trim()
    || !provenance?.conversation_ref.trim() || !provenance.message_ref.trim()) {
    throw new ActionError("event_decision.untrusted_actor", "用户决定需要受保护入口提供真实用户及操作出处");
  }
  if (!goalEventTrustedAuthoritySources.includes(provenance.source as GoalEventTrustedAuthority["authority_source"])) {
    throw new ActionError("event_decision.runtime_dialogue_not_user", "模型对话或自报确认不能替代受保护的用户操作");
  }
  return { actor_id: caller.actor_id, actor_kind: "user", authority_source: provenance.source as GoalEventTrustedAuthority["authority_source"],
    conversation_ref: provenance.conversation_ref, message_ref: provenance.message_ref };
}

export function createGoalDecisionActionHandler(events: GoalEventApplication, boardId: string): ActionHandlerBinding {
  return { ...goalDecisionAction,
    availability(caller) {
      try { authority(caller); return { available: true }; }
      catch (error) { if (error instanceof ActionError) return { available: false, code: error.code, reason: error.message }; throw error; }
    },
    handle: (caller, input) => events.recordTrustedDecision({ ...input as GoalDecisionActionInput, board_id: boardId, authority: authority(caller) }),
  };
}
