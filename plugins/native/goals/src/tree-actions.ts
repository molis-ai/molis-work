import { ActionError, type ActionCallContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { GoalTreeApplicationApi } from "./goal-tree-contract.js";
import { ATTENTION_WRITE_PERMISSION, goalActor, usingServices } from "./action-contract.js";
import { goalEntryActions } from "@molis-ai/molis-work-contracts/modules/goal-actions";

type Input<Key extends keyof GoalTreeApplicationApi> = Omit<Parameters<GoalTreeApplicationApi[Key]>[0],
  "project_id" | "actor_id" | "submitted_session_id" | "runtime_actor_id" | "authority">;
export const goalsTreeActions = {
  treeSubmit: usingServices(goalEntryActions.treeSubmit, [ATTENTION_WRITE_PERMISSION]),
  treeRead: goalEntryActions.treeRead,
  treeCheck: goalEntryActions.treeCheck,
  treeDecide: usingServices(goalEntryActions.treeDecide, [ATTENTION_WRITE_PERMISSION]),
} as const;

function authority(caller: ActionCallContext) {
  const p = caller.user_action;
  if (caller.audience !== "user" || caller.actor_kind !== "user" || !caller.actor_id.trim()
    || !p?.conversation_ref.trim() || !p.message_ref.trim() || !["web", "management"].includes(p.source)) {
    throw new ActionError("goals.goal_tree_proposal.untrusted_actor", "结构审批需要受保护入口提供真实用户及操作出处；模型自报确认无效");
  }
  return { actor_id: caller.actor_id, actor_kind: "user" as const, authority_source: p.source as "web" | "management",
    conversation_ref: p.conversation_ref, message_ref: p.message_ref,
    whole_confirmation_prompted: p.whole_confirmation_prompted,
    prompted_proposal_id: p.prompted_subject_id };
}
export function createGoalsTreeActionHandlers(tree: GoalTreeApplicationApi, projectId: string): ActionHandlerBinding[] {
  return [
    { ...goalsTreeActions.treeSubmit, handle: (caller, input) => tree.submitGoalTreeProposal({ ...input as Input<"submitGoalTreeProposal">,
      project_id: projectId, actor_id: goalActor(caller).actor_id, submitted_session_id: caller.runtime_session_id }) },
    { ...goalsTreeActions.treeRead, handle: (_caller, input) => tree.listGoalTreeProposals({ ...input as Input<"listGoalTreeProposals">, project_id: projectId }) },
    { ...goalsTreeActions.treeCheck, handle: (caller, input) => tree.checkGoalTreeProposal({ ...input as Input<"checkGoalTreeProposal">,
      project_id: projectId, actor_id: goalActor(caller).actor_id }) },
    { ...goalsTreeActions.treeDecide, availability(caller) {
      try { authority(caller); return { available: true }; }
      catch (error) { if (error instanceof ActionError) return { available: false, code: error.code, reason: error.message }; throw error; }
    }, handle: (caller, input) => tree.decideGoalTreeProposal({ ...input as Input<"decideGoalTreeProposal">,
      project_id: projectId, authority: authority(caller), runtime_actor_id: caller.audit_actor_id }) },
  ];
}
