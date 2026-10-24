import { ActionError, type ActionCallContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalEventTrustedAuthoritySources, type GoalEventTrustedAuthority } from "@molis-ai/molis-work-contracts/modules/goals";
import { goalEntryActions, type GoalDecisionActionInput } from "@molis-ai/molis-work-contracts/modules/goal-actions";
import type { GoalEventApplication } from "./goal-event-application.js";

export const goalDecisionAction = goalEntryActions.decide;

function authority(caller: ActionCallContext): GoalEventTrustedAuthority {
  const provenance = caller.user_action;
  if (caller.audience !== "user" || caller.actor_kind !== "user" || !caller.actor_id.trim()
    || !provenance?.conversation_ref.trim() || !provenance.message_ref.trim()) {
    throw new ActionError("goals.event_decision.untrusted_actor", "用户决定需要受保护入口提供真实用户及操作出处");
  }
  if (!goalEventTrustedAuthoritySources.includes(provenance.source as GoalEventTrustedAuthority["authority_source"])) {
    throw new ActionError("goals.event_decision.runtime_dialogue_not_user", "模型对话或自报确认不能替代受保护的用户操作");
  }
  return { actor_id: caller.actor_id, actor_kind: "user", authority_source: provenance.source as GoalEventTrustedAuthority["authority_source"],
    conversation_ref: provenance.conversation_ref, message_ref: provenance.message_ref };
}

export function createGoalDecisionActionHandler(events: GoalEventApplication, projectId: string): ActionHandlerBinding {
  return { ...goalDecisionAction,
    availability(caller) {
      try { authority(caller); return { available: true }; }
      catch (error) { if (error instanceof ActionError) return { available: false, code: error.code, reason: error.message }; throw error; }
    },
    handle: (caller, input) => events.recordTrustedDecision({ ...input as GoalDecisionActionInput, project_id: projectId, authority: authority(caller) }),
  };
}
