import type { HostMethodCapability as MethodCapability, LocalHostProjectClient, AsyncApplicationMethods } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { GoalTreeApplicationApi } from "./goal-tree-contract.js";

export const goalTreeCapabilities = {
  submitGoalTreeProposal: {
    capability_id: "io.molis.work.goals.submit-goal-tree-proposal", version: 1, operation: "command",
  } as MethodCapability<GoalTreeApplicationApi["submitGoalTreeProposal"]>,
  listGoalTreeProposals: {
    capability_id: "io.molis.work.goals.list-goal-tree-proposals", version: 1, operation: "query",
  } as MethodCapability<GoalTreeApplicationApi["listGoalTreeProposals"]>,
  checkGoalTreeProposal: {
    capability_id: "io.molis.work.goals.check-goal-tree-proposal", version: 1, operation: "command",
  } as MethodCapability<GoalTreeApplicationApi["checkGoalTreeProposal"]>,
  decideGoalTreeProposal: {
    capability_id: "io.molis.work.goals.decide-goal-tree-proposal", version: 1, operation: "command", host_only: true,
  } as MethodCapability<GoalTreeApplicationApi["decideGoalTreeProposal"]>,
};

export function createGoalProposalClients(client: LocalHostProjectClient): {
  goalTree: AsyncApplicationMethods<GoalTreeApplicationApi>;
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
