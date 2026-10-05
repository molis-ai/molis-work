import type {
  GoalFactsView,
  GoalPolicy,
  GoalPolicyBindingRecord,
  GoalRecord,
  GoalRelationRecord,
  GoalsBoardRecord,
  GoalsQueryApi,
  GoalsQuerySnapshot,
  ProjectGuidanceView,
} from "@molis-ai/molis-work-contracts/modules/goals";

import {
  GoalsCommandContext,
  type GoalsCommandContextOptions,
} from "./command-support.js";
import { GuidanceCommands } from "./guidance-commands.js";
import { GoalsRepository } from "./repository.js";
import { GoalQueryFactsRepository } from "./query-facts-repository.js";

export const DEFAULT_GOAL_POLICY: GoalPolicy = { human_approval: false };

export class GoalsQueryService implements GoalsQueryApi {
  private readonly context: GoalsCommandContext;
  private readonly guidance: GuidanceCommands;
  private readonly facts: GoalQueryFactsRepository;

  constructor(
    readonly repository: GoalsRepository,
    options: GoalsCommandContextOptions = {},
  ) {
    this.context = new GoalsCommandContext(repository, options);
    this.guidance = new GuidanceCommands(this.context);
    this.facts = new GoalQueryFactsRepository(repository.db);
  }

  listBoardIds() { return this.facts.listBoardIds(); }

  listActivePolicyBindings(boardId: string, goalId?: string) { return this.repository.listActivePolicyBindings(boardId, goalId); }
  listPolicyHistory(boardId: string) { return this.facts.listPolicyHistory(boardId); }
  listWorkEventGoalLinks(boardId: string) { return this.facts.listWorkEventGoalLinks(boardId); }
  listDependencies(boardId: string, goalId: string) { return this.facts.listDependencies(boardId, goalId); }
  activeReplacement(boardId: string, goalId: string) { return this.facts.activeReplacement(boardId, goalId); }

  getBoard(boardId: string): GoalsBoardRecord | null {
    return this.repository.getBoard(boardId);
  }

  getGoal(boardId: string, goalId: string): GoalRecord | null {
    const goal = this.repository.getGoal(goalId);
    return goal?.board_id === boardId ? goal : null;
  }

  hasGoalIdentity(goalId: string): boolean {
    return this.repository.getGoal(goalId) !== null;
  }

  getRelation(boardId: string, relationId: string) {
    return this.repository.getRelation(boardId, relationId);
  }


  policyBindingState(boardId: string, bindingId: string): "active" | "replaced" | "withdrawn" | null {
    const row = this.repository.db.prepare("SELECT state FROM policy_bindings WHERE board_id = ? AND policy_binding_id = ?")
      .get(boardId, bindingId) as { state: "active" | "replaced" | "withdrawn" } | undefined;
    return row?.state ?? null;
  }

  criterionGoalId(criterionId: string): string | null {
    return this.repository.criterionGoalId(criterionId);
  }

  listGoals(
    boardId: string,
    options: { include_archived?: boolean; include_trashed?: boolean } = {},
  ): GoalRecord[] {
    this.context.requireBoard(boardId);
    const includeArchived = options.include_archived ?? true;
    const includeTrashed = options.include_trashed ?? true;
    return this.repository.listGoals(boardId).filter((goal) =>
      (includeArchived || goal.archived_at == null) &&
      (includeTrashed || goal.trashed_at == null)
    );
  }

  listRelations(boardId: string, goalId?: string): GoalRelationRecord[] {
    this.context.requireBoard(boardId);
    if (goalId != null) this.requireGoal(boardId, goalId);
    return this.repository.listRelations(boardId, goalId);
  }

  listTrashedGoals(boardId: string): GoalRecord[] {
    this.context.requireBoard(boardId);
    return this.repository.listTrashedGoals(boardId);
  }

  snapshot(boardId: string): GoalsQuerySnapshot {
    const board = this.repository.getBoard(boardId);
    if (!board) throw this.context.error("board.not_found", `Board 不存在: ${boardId}`);
    return {
      board,
      observed_event_cursor: this.repository.eventCursor(boardId),
      goals: this.repository.listGoals(boardId),
      relations: this.repository.listRelations(boardId),
      policy_bindings: this.repository.listActivePolicyBindings(boardId),
      // Packs saved before later fields existed are completed on the way out, as the planning engine does.
      planning_method_packs: this.repository.listPlanningMethodPacks(boardId),
      project_guidance: this.repository.listProjectGuidanceEntries(boardId),
    };
  }

  resolvePolicy(boardId: string, goalId: string, strengthen?: Partial<GoalPolicy>): GoalPolicy {
    this.context.requireBoard(boardId);
    this.requireGoal(boardId, goalId);
    return resolveGoalPolicy(this.repository.listActivePolicyBindings(boardId, goalId), strengthen);
  }

  readGoal(boardId: string, goalId: string): GoalFactsView {
    const snapshot = this.snapshot(boardId);
    const goal = snapshot.goals.find((candidate) => candidate.goal_id === goalId);
    if (!goal) throw this.context.error("goal.not_found", `找不到这个 Goal: ${goalId}`);
    const parentContractCoverage = snapshot.relations
      .filter((relation) =>
        relation.state === "active" &&
        relation.type === "part_of" &&
        relation.from_goal_id === goalId
      )
      .map((relation) => snapshot.goals.find((candidate) => candidate.goal_id === relation.to_goal_id))
      .filter((parent): parent is GoalRecord => parent != null)
      .map((parent) => {
        const coverage = parent.decomposition_review?.contract_coverage;
        return {
          parent_goal_id: parent.goal_id,
          parent_goal_title: parent.title,
          record_status: coverage == null ? "unrecorded" as const : "recorded" as const,
          promised_outputs: coverage?.promised_outputs.filter((entry) =>
            entry.child_outputs.some((reference) => reference.goal_id === goalId),
          ) ?? [],
          acceptance_criteria: coverage?.acceptance_criteria.filter((entry) =>
            entry.child_criteria.some((reference) => reference.goal_id === goalId),
          ) ?? [],
        };
      });
    return {
      board: snapshot.board,
      observed_event_cursor: snapshot.observed_event_cursor,
      goal_path: `/goals/${encodeURIComponent(goalId)}`,
      goal,
      parent_contract_coverage: parentContractCoverage,
      relations: snapshot.relations.filter((relation) =>
        relation.from_goal_id === goalId || relation.to_goal_id === goalId
      ),
      resolved_policy: resolveGoalPolicy(
        snapshot.policy_bindings.filter((binding) =>
          binding.goal_id == null || binding.goal_id === goalId
        ),
      ),
      project_guidance: snapshot.project_guidance,
    };
  }

  readProjectGuidance(boardId: string): ProjectGuidanceView {
    return this.guidance.read(boardId);
  }

  private requireGoal(boardId: string, goalId: string): GoalRecord {
    const goal = this.getGoal(boardId, goalId);
    if (!goal) throw this.context.error("goal.not_found", `找不到这个 Goal: ${goalId}`);
    return goal;
  }
}

/** The project default sets the rule; a Goal's own rules and `strengthen` can only add the user's acceptance. */
export function resolveGoalPolicy(
  bindings: readonly GoalPolicyBindingRecord[],
  strengthen?: Partial<GoalPolicy>,
): GoalPolicy {
  const resolved: GoalPolicy = { ...DEFAULT_GOAL_POLICY };
  for (const { policy } of bindings.filter((binding) => binding.scope === "project_default")) {
    if (policy.human_approval != null) resolved.human_approval = policy.human_approval;
  }
  const strengtheningPolicies = bindings
    .filter((binding) => binding.scope !== "project_default")
    .map((binding) => binding.policy);
  if (strengthen) strengtheningPolicies.push(strengthen);
  for (const policy of strengtheningPolicies) resolved.human_approval ||= policy.human_approval ?? false;
  return resolved;
}

