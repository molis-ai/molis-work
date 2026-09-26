import type { AddGoalRelationInput } from "@molis-ai/molis-work-contracts/modules/goals";
import { randomUUID } from "node:crypto";

import type {
  GoalChangeImpact,
  GoalEventAdoptedPlanningRequest,
  GoalRecord,
  GoalRelationRecord,
  GoalsPlanningApi,
  PlanningGraphIssue,
  PlanningMethodComposition,
  PlanningMethodPack,
  PlanningProposalItem,
  PlanningRelationChange,
  ResolvedPlanningEventAdoption,
  SaveProjectPlanningMethodInput,
} from "@molis-ai/molis-work-contracts/modules/goals";

import { GoalsCommandContext } from "../command-support.js";
import {
  analyzeGoalChangeImpact,
  projectPlanningRelations,
  validatePlanningGraph,
  validatePlanningProposalGraph,
  type PlanningWorkStatus,
} from "./goal-graph.js";
import { resolvePlanningEventAdoption } from "./event-adoption.js";
import {
  composePlanningMethodPacks,
  normalizePlanningMethodPack,
  resolvePlanningMethodPacks,
} from "./method-packs.js";

type GraphRelation = Pick<
  GoalRelationRecord,
  "relation_id" | "from_goal_id" | "to_goal_id" | "type" | "state"
>;

export class GoalsPlanningEngine implements GoalsPlanningApi {
  constructor(
    private readonly context: GoalsCommandContext,
    private readonly personalMethods: readonly PlanningMethodPack[] | (() => readonly PlanningMethodPack[]) = [],
  ) {}

  validateRelationAddition(boardId: string, input: AddGoalRelationInput): Pick<PlanningGraphIssue, "code" | "message"> | null {
    this.context.requireBoard(boardId);
    const projectedId = "projected:new-relation";
    const issue = this.validateGraph(this.context.repository.listGoals(boardId),
      this.projectRelations(this.context.repository.listRelations(boardId), [{
        action: "add", relation_id: projectedId, from_goal_id: input.from_goal_id,
        to_goal_id: input.to_goal_id, type: input.type, reason: input.reason,
      }])).find(candidate => candidate.relation_ids.includes(projectedId));
    return issue ? { code: issue.code, message: issue.message } : null;
  }

  private readPersonalMethods(): readonly PlanningMethodPack[] {
    return typeof this.personalMethods === "function" ? this.personalMethods() : this.personalMethods;
  }

  effectiveMethods(boardId: string): PlanningMethodPack[] {
    this.context.requireBoard(boardId);
    return resolvePlanningMethodPacks(
      this.readPersonalMethods(),
      this.context.repository.listPlanningMethodPacks(boardId),
    );
  }

  proposalGraphIssues(boardId: string, items: readonly PlanningProposalItem[]): PlanningGraphIssue[] {
    this.context.requireBoard(boardId);
    const goals = this.context.repository.listGoals(boardId), relations = this.context.repository.listRelations(boardId);
    const existing = new Set(validatePlanningGraph(goals, relations).map(issue => `${issue.code}:${issue.path.join("\u0000")}`));
    return validatePlanningProposalGraph(goals, relations, items)
      .filter(issue => !existing.has(`${issue.code}:${issue.path.join("\u0000")}`));
  }

  wouldCreatePartOfCycle(boardId: string, fromGoalId: string, toGoalId: string): boolean {
    const projectedId = "projected:part-of-cycle-check";
    return validatePlanningGraph(this.context.repository.listGoals(boardId), projectPlanningRelations(
      this.context.repository.listRelations(boardId), [{ action: "add", relation_id: projectedId,
        from_goal_id: fromGoalId, to_goal_id: toGoalId, type: "part_of" }],
    )).some(issue => issue.code === "planning.part_of_cycle" && issue.relation_ids.includes(projectedId));
  }

  projectComposition(boardId: string): PlanningMethodComposition {
    return composePlanningMethodPacks(
      this.effectiveMethods(boardId).filter((method) =>
        method.scope === "project" && method.enabled),
    );
  }

  resolveEventAdoption(
    boardId: string,
    requested: GoalEventAdoptedPlanningRequest[],
  ): ResolvedPlanningEventAdoption {
    this.context.requireBoard(boardId);
    const personal = this.readPersonalMethods();
    const project = this.context.repository.listPlanningMethodPacks(boardId);
    return resolvePlanningEventAdoption(
      requested,
      { effective: resolvePlanningMethodPacks(personal, project), personal, project },
      (code, message, details) => this.context.error(code, message, details),
    );
  }

  saveProjectMethod(input: SaveProjectPlanningMethodInput): {
    method: PlanningMethodPack;
    observed_event_cursor: number;
  } {
    this.context.requireBoard(input.board_id);
    if (input.user_confirmed !== true) {
      throw this.context.error(
        "planning.user_confirmation_required",
        "项目方法会改变后续 Goal 的拆分和依赖判断，必须由用户确认",
      );
    }
    const current = this.context.repository.listPlanningMethodPacks(input.board_id)
      .find((pack) => pack.method_id === input.method.method_id) ?? null;
    const at = this.context.now().toISOString();
    const method = normalizePlanningMethodPack(input.method, "project", current, at);
    return this.context.repository.immediate(() => {
      this.context.repository.putPlanningMethodPack(input.board_id, method);
      const cursor = this.context.repository.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "planning.method_saved",
        objectType: "planning_method",
        objectId: method.method_id,
        reason: `更新项目规划方法：${method.name}`,
        payload: {
          method_id: method.method_id,
          version: method.version,
          enabled: method.enabled,
        },
        at,
      });
      return { method, observed_event_cursor: cursor };
    });
  }

  analyzeChange(boardId: string, changedGoalIds: readonly string[]): GoalChangeImpact {
    this.context.requireBoard(boardId);
    for (const goalId of changedGoalIds) this.context.requireGoal(boardId, goalId);
    return analyzeGoalChangeImpact(
      this.context.repository.listGoals(boardId),
      this.context.repository.listRelations(boardId),
      changedGoalIds,
      this.currentWork(boardId),
    );
  }

  validateBoardGraph(boardId: string): {
    issues: PlanningGraphIssue[];
    observed_event_cursor: number;
  } {
    this.context.requireBoard(boardId);
    return {
      issues: validatePlanningGraph(
        this.context.repository.listGoals(boardId),
        this.context.repository.listRelations(boardId),
      ),
      observed_event_cursor: this.context.repository.eventCursor(boardId),
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

  private currentWork(boardId: string): Map<string, PlanningWorkStatus> {
    const rows = this.context.repository.db.prepare(
      "SELECT goal_id, work_status FROM goal_event_work_status WHERE board_id = ?",
    ).all(boardId) as Array<{ goal_id: string; work_status: string }>;
    return new Map(rows.map((row) => [row.goal_id, row.work_status as PlanningWorkStatus]));
  }
}
