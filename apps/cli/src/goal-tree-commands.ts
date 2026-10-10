import type { AsyncApplicationMethods } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { GoalTreeEntryApi } from "@molis-ai/molis-work-plugin-goals";

/** Wire conversion only; the application retains validation and transaction ownership. */
export function createCliGoalTreeHandlers(application: GoalTreeEntryApi | AsyncApplicationMethods<GoalTreeEntryApi>) {
  return {
    "goal-tree-propose": async (input: Record<string, unknown>) =>
      application.submitGoalTreeProposal(input as unknown as Parameters<GoalTreeEntryApi["submitGoalTreeProposal"]>[0]),
    "goal-tree-read": async (input: Record<string, unknown>) =>
      application.listGoalTreeProposals(input as unknown as Parameters<GoalTreeEntryApi["listGoalTreeProposals"]>[0]),
    "goal-tree-check": async (input: Record<string, unknown>) =>
      application.checkGoalTreeProposal(input as unknown as Parameters<GoalTreeEntryApi["checkGoalTreeProposal"]>[0]),
    // The CLI decides as the person on this machine: the Host builds the authority from the conversation the payload points at and
    // refuses an identity in it.
    "goal-tree-decide": async (input: Record<string, unknown>) =>
      application.decideGoalTreeProposal(input as unknown as Parameters<GoalTreeEntryApi["decideGoalTreeProposal"]>[0]),
  };
}
