import type { HostMethodCapability as MethodCapability, LocalHostProjectClient, AsyncApplicationMethods } from "@molis-ai/molis-work-contracts/platform/app-host";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { GoalTreeProposalDecisionAuthority } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { GoalTreeApplicationApi, GoalTreeEntryApi } from "./goal-tree-contract.js";

export const goalTreeCapabilities = {
  /**
   * Management entries only (the CLI, the typed client), like the check below: the host records the person on this machine, so a
   * plugin that lists this under capabilities.consumes is refused. A Runtime submits through the `goals.tree.submit` action.
   */
  submitGoalTreeProposal: {
    capability_id: "io.molis.work.goals.submit-goal-tree-proposal", version: 1, operation: "command", host_only: true,
  } as MethodCapability<GoalTreeEntryApi["submitGoalTreeProposal"]>,
  listGoalTreeProposals: {
    capability_id: "io.molis.work.goals.list-goal-tree-proposals", version: 1, operation: "query",
  } as MethodCapability<GoalTreeApplicationApi["listGoalTreeProposals"]>,
  /**
   * Management entries only (the CLI, the typed client): the host records the person on this machine, so a plugin that lists this
   * under capabilities.consumes is refused and cannot be recorded as that person.
   */
  checkGoalTreeProposal: {
    capability_id: "io.molis.work.goals.check-goal-tree-proposal", version: 1, operation: "command", host_only: true,
  } as MethodCapability<GoalTreeEntryApi["checkGoalTreeProposal"]>,
  decideGoalTreeProposal: {
    capability_id: "io.molis.work.goals.decide-goal-tree-proposal", version: 1, operation: "command", host_only: true,
  } as MethodCapability<GoalTreeEntryApi["decideGoalTreeProposal"]>,
};

/**
 * The management entries (CLI, management MCP) decide as the person on this machine. The caller may point at the conversation
 * the decision came from and say the whole proposal was shown; who decides, and through which entry, is fixed here, refused when
 * the caller names it, and checked again by the host (repository-anti-corruption §9.5 #6).
 */
export function managementTreeAuthority(projectId: string, idempotencyKey: string, evidence?: unknown): GoalTreeProposalDecisionAuthority {
  const given = (evidence && typeof evidence === "object" ? evidence : {}) as Record<string, unknown>;
  if (["actor_id", "actor_kind", "authority_source"].some(field => Object.hasOwn(given, field))) {
    throw new ActionError("goal_tree_proposal.authority_source_invalid", "管理入口以本机这个人的身份决定，参数里不能带身份或出处");
  }
  const text = (value: unknown) => typeof value === "string" && value.trim() ? value : undefined;
  return { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", authority_source: "management",
    conversation_ref: text(given.conversation_ref) ?? `management:${projectId}`,
    message_ref: text(given.message_ref) ?? `management-tree-decision:${idempotencyKey}`,
    ...(given.whole_confirmation_prompted === true ? { whole_confirmation_prompted: true } : {}),
    ...(text(given.prompted_proposal_id) ? { prompted_proposal_id: text(given.prompted_proposal_id) } : {}) };
}

export function createGoalProposalClients(client: LocalHostProjectClient): {
  goalTree: AsyncApplicationMethods<GoalTreeEntryApi>;
} {
  return {
    goalTree: {
      submitGoalTreeProposal: (...input) => client.invoke(goalTreeCapabilities.submitGoalTreeProposal, input),
      listGoalTreeProposals: (...input) => client.invoke(goalTreeCapabilities.listGoalTreeProposals, input),
      checkGoalTreeProposal: (...input) => client.invoke(goalTreeCapabilities.checkGoalTreeProposal, input),
      decideGoalTreeProposal: (...input) => client.invoke(goalTreeCapabilities.decideGoalTreeProposal, input),
    },
  };
}
