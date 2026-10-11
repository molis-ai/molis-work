import type { HostMethodCapability as MethodCapability, LocalHostProjectClient, AsyncApplicationMethods } from "@molis-ai/molis-work-contracts/platform/app-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { GoalTreeProposalDecisionAuthority } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { GoalTreeApplicationApi, GoalTreeEntryApi } from "./goal-tree-contract.js";
import { evidenceText, managementEvidence } from "./management-evidence.js";

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
 * The Host builds the authority of a structure decision taken at a management entry (the CLI, the management MCP, the typed
 * client): the person on this machine, origin management. The caller may point at the conversation the decision came from and
 * say the whole proposal was shown; who decides, and through which entry, is fixed here and refused when the caller names it
 * (repository-anti-corruption §9.5 #6).
 */
export function managementTreeAuthority(projectId: string, idempotencyKey: string, evidence?: unknown): GoalTreeProposalDecisionAuthority {
  const given = managementEvidence(evidence, "goal_tree_proposal.authority_source_invalid");
  return { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", authority_source: "management",
    conversation_ref: evidenceText(given.conversation_ref) ?? `management:${projectId}`,
    message_ref: evidenceText(given.message_ref) ?? `management-tree-decision:${idempotencyKey}`,
    ...(given.whole_confirmation_prompted === true ? { whole_confirmation_prompted: true } : {}),
    ...(evidenceText(given.prompted_proposal_id) ? { prompted_proposal_id: evidenceText(given.prompted_proposal_id) } : {}) };
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
