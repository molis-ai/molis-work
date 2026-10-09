import type {
  GoalsQueryApi,
  ProjectGuidanceView,
} from "@molis-ai/molis-work-contracts/modules/goals";

import type { GoalContractView } from "./goal-entry-contract.js";
import type { GoalPolicy, GoalRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalTreeProposalRecord } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";

export interface GoalReadApplicationPorts {
  now(): Date;

  goalTreeProposals(projectId: string, rootGoalId: string): GoalTreeProposalRecord[];
}

/** Compose Goal facts with the Goal tree proposals about it. Current work status is event-owned. */
export class GoalReadApplication {
  constructor(
    private readonly goals: GoalsQueryApi,
    private readonly ports: GoalReadApplicationPorts,
  ) {}

  readProjectGuidance(projectId: string): ProjectGuidanceView {
    return this.goals.readProjectGuidance(projectId);
  }

  listTrashedGoals(projectId: string): GoalRecord[] {
    return this.goals.listTrashedGoals(projectId);
  }

  listPolicyHistory(projectId: string) { return this.goals.listPolicyHistory(projectId); }
  listWorkEventGoalLinks(projectId: string) { return this.goals.listWorkEventGoalLinks(projectId); }

  getResolvedGoalPolicy(input: { project_id: string; goal_id: string }): GoalPolicy {
    return this.goals.resolvePolicy(input.project_id, input.goal_id);
  }

  getGoal(projectId: string, goalId: string): GoalRecord {
    return this.goals.readGoal(projectId, goalId).goal;
  }

  readGoalContract(projectId: string, goalId: string): GoalContractView {
    const goalFacts = this.goals.readGoal(projectId, goalId);
    return {
      board: goalFacts.board,
      observed_event_cursor: goalFacts.observed_event_cursor,
      goal_path: goalFacts.goal_path,
      goal: goalFacts.goal,
      parent_contract_coverage: goalFacts.parent_contract_coverage,
      relations: goalFacts.relations,
      resolved_policy: goalFacts.resolved_policy,
      goal_tree_proposals: this.ports.goalTreeProposals(projectId, goalId),
      project_guidance: goalFacts.project_guidance,
    };
  }
}
