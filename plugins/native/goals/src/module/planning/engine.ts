import type { AddGoalRelationInput } from "../../contract/goals.js";
import type {
  GoalChangeImpact,
  GoalRecord,
  GoalRelationRecord,
  GoalsPlanningApi,
  PlanningGraphIssue,
  PlanningProposalItem,
  PlanningRelationChange,
} from "../../contract/goals.js";

import { GoalsCommandContext } from "../command-support.js";
import {
  analyzeGoalChangeImpact,
  projectPlanningRelations,
  validatePlanningGraph,
  validatePlanningProposalGraph,
  type PlanningWorkStatus,
} from "./goal-graph.js";
type GraphRelation = Pick<
  GoalRelationRecord,
  "relation_id" | "from_goal_id" | "to_goal_id" | "type" | "state"
>;

export class GoalsPlanningEngine implements GoalsPlanningApi {
  constructor(private readonly context: GoalsCommandContext) {}

  validateRelationAddition(projectId: string, input: AddGoalRelationInput): Pick<PlanningGraphIssue, "code" | "message"> | null {
    this.context.requireGoalsLibrary(projectId);
    const projectedId = "projected:new-relation";
    const issue = this.validateGraph(this.context.repository.listGoals(projectId),
      this.projectRelations(this.context.repository.listRelations(projectId), [{
        action: "add", relation_id: projectedId, from_goal_id: input.from_goal_id,
        to_goal_id: input.to_goal_id, type: input.type, reason: input.reason,
      }])).find(candidate => candidate.relation_ids.includes(projectedId));
    return issue ? { code: issue.code, message: issue.message } : null;
  }

  proposalGraphIssues(projectId: string, items: readonly PlanningProposalItem[]): PlanningGraphIssue[] {
    this.context.requireGoalsLibrary(projectId);
    const goals = this.context.repository.listGoals(projectId), relations = this.context.repository.listRelations(projectId);
    const existing = new Set(validatePlanningGraph(goals, relations).map(issue => `${issue.code}:${issue.path.join("\u0000")}`));
    return validatePlanningProposalGraph(goals, relations, items)
      .filter(issue => !existing.has(`${issue.code}:${issue.path.join("\u0000")}`));
  }

  wouldCreatePartOfCycle(projectId: string, fromGoalId: string, toGoalId: string): boolean {
    const projectedId = "projected:part-of-cycle-check";
    return validatePlanningGraph(this.context.repository.listGoals(projectId), projectPlanningRelations(
      this.context.repository.listRelations(projectId), [{ action: "add", relation_id: projectedId,
        from_goal_id: fromGoalId, to_goal_id: toGoalId, type: "part_of" }],
    )).some(issue => issue.code === "goals.planning.part_of_cycle" && issue.relation_ids.includes(projectedId));
  }

  analyzeChange(projectId: string, changedGoalIds: readonly string[]): GoalChangeImpact {
    this.context.requireGoalsLibrary(projectId);
    for (const goalId of changedGoalIds) this.context.requireGoal(projectId, goalId);
    return analyzeGoalChangeImpact(
      this.context.repository.listGoals(projectId),
      this.context.repository.listRelations(projectId),
      changedGoalIds,
      this.currentWork(projectId),
    );
  }

  validateBoardGraph(projectId: string): {
    issues: PlanningGraphIssue[];
    observed_event_cursor: number;
  } {
    this.context.requireGoalsLibrary(projectId);
    return {
      issues: validatePlanningGraph(
        this.context.repository.listGoals(projectId),
        this.context.repository.listRelations(projectId),
      ),
      observed_event_cursor: this.context.repository.eventCursor(projectId),
    };
  }

  projectRelations(
    relations: readonly GraphRelation[],
    changes: readonly PlanningRelationChange[] = [],
  ): GraphRelation[] {
    return projectPlanningRelations(relations, changes);
  }

  validateGraph(
    goals: readonly Pick<GoalRecord, "goal_id" | "trashed_at">[],
    relations: readonly GraphRelation[],
  ): PlanningGraphIssue[] {
    return validatePlanningGraph(goals, relations);
  }

  private currentWork(projectId: string): Map<string, PlanningWorkStatus> {
    const rows = this.context.repository.db.prepare(
      "SELECT goal_id, work_status FROM goal_event_work_status WHERE project_id = ?",
    ).all(projectId) as Array<{ goal_id: string; work_status: string }>;
    return new Map(rows.map((row) => [row.goal_id, row.work_status as PlanningWorkStatus]));
  }
}
