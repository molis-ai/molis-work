import type {
  GoalsQueryApi,
  ProjectGuidanceView,
} from "@molis-ai/molis-work-contracts/modules/goals";

import type { BoardSnapshot, GoalContractView } from "./goal-entry-contract.js";
import type { GoalPolicy, GoalRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalTreeProposalRecord } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { ExecutionClaimRecord as ClaimRecord, ExecutionRunRecord as RunRecord } from "@molis-ai/molis-work-contracts/modules/execution";

export interface GoalReadApplicationPorts {
  now(): Date;
  snapshot(boardId: string): BoardSnapshot;

  goalTreeProposals(boardId: string, rootGoalId: string): GoalTreeProposalRecord[];
}

/** Compose Goal facts with historical owner records. Current work status is event-owned. */
export class GoalReadApplication {
  constructor(
    private readonly goals: GoalsQueryApi,
    private readonly ports: GoalReadApplicationPorts,
  ) {}

  readProjectGuidance(boardId: string): ProjectGuidanceView {
    return this.goals.readProjectGuidance(boardId);
  }

  listTrashedGoals(boardId: string): GoalRecord[] {
    return this.goals.listTrashedGoals(boardId);
  }

  listPolicyHistory(boardId: string) { return this.goals.listPolicyHistory(boardId); }
  listLegacyCoverage(boardId: string) { return this.goals.listLegacyCoverage(boardId); }
  listGoalRiskLinks(boardId: string) { return this.goals.listGoalRiskLinks(boardId); }

  getResolvedGoalPolicy(input: { board_id: string; goal_id: string }): GoalPolicy {
    return this.goals.resolvePolicy(input.board_id, input.goal_id);
  }

  getGoal(boardId: string, goalId: string): GoalRecord {
    return this.goals.readGoal(boardId, goalId).goal;
  }

  readGoalContract(boardId: string, goalId: string): GoalContractView {
    const goalFacts = this.goals.readGoal(boardId, goalId);
    const snapshot = this.ports.snapshot(boardId);
    const { claims, runs } = projectGoalLifecycle(snapshot, goalId);
    const clarificationSessions = snapshot.clarification_sessions.filter((item) => item.goal_id === goalId);
    const clarificationSessionIds = new Set(clarificationSessions.map((item) => item.session_id));
    return {
      board: goalFacts.board,
      observed_event_cursor: goalFacts.observed_event_cursor,
      goal_path: goalFacts.goal_path,
      goal: goalFacts.goal,
      parent_contract_coverage: goalFacts.parent_contract_coverage,
      relations: goalFacts.relations,
      impacts: snapshot.impacts.filter((item) => item.goal_id === goalId),
      risks: goalFacts.risks,
      resolved_policy: goalFacts.resolved_policy,
      claims,
      runs,
      evidence: snapshot.evidence.filter((item) => item.goal_id === goalId),
      evidence_corrections: snapshot.evidence_corrections.filter((item) => item.goal_id === goalId),
      review_obligations: snapshot.review_obligations.filter((item) => item.goal_id === goalId),
      reviews: snapshot.reviews.filter((item) => item.goal_id === goalId),
      candidates: snapshot.candidates.filter((item) =>
        item.discovered_in_run_id != null && runs.some((run) => run.run_id === item.discovered_in_run_id),
      ),
      contract_proposals: snapshot.contract_proposals.filter((item) => item.goal_id === goalId),
      rewires: snapshot.rewires.filter((item) =>
        (item.proposal.relations ?? []).some((relation) => {
          const fromGoalId = String(relation.from_goal_id ?? "");
          const toGoalId = String(relation.to_goal_id ?? "");
          return fromGoalId === goalId || toGoalId === goalId;
        }),
      ),
      clarification_sessions: clarificationSessions,
      clarification_turns: snapshot.clarification_turns.filter((item) =>
        clarificationSessionIds.has(item.session_id),
      ),
      goal_tree_proposals: this.ports.goalTreeProposals(boardId, goalId),
      project_guidance: goalFacts.project_guidance,
    };
  }
}

export function projectGoalLifecycle(
  snapshot: Pick<BoardSnapshot, "claims" | "runs">,
  goalId: string,
): { claims: ClaimRecord[]; runs: RunRecord[] } {
  return {
    claims: snapshot.claims.filter((item) => item.goal_id === goalId),
    runs: snapshot.runs.filter((item) => item.goal_id === goalId),
  };
}
