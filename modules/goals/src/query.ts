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
  requestHash,
  type GoalsCommandContextOptions,
} from "./command-support.js";
import { GuidanceCommands } from "./guidance-commands.js";
import { GoalsRepository } from "./repository.js";
import { GoalQueryFactsRepository } from "./query-facts-repository.js";
import { LegacyGoalCoverage } from "./legacy-coverage.js";

export const DEFAULT_GOAL_POLICY: GoalPolicy = {
  goal_mode: "preferred",
  required_capabilities: [],
  self_verification: true,
  cross_reviewers: 0,
  adversarial_reviewers: 0,
  human_approval: false,
  max_lease_seconds: 1800,
};

const GOAL_MODE_ORDER = { disabled: 0, preferred: 1, required: 2 } as const;

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
  listLegacyCoverage(boardId: string) { return new LegacyGoalCoverage(this.context).list(boardId); }
  listGoalRiskLinks(boardId: string) { return this.repository.listGoalRiskLinks(boardId); }
  listDependencies(boardId: string, goalId: string) { return this.facts.listDependencies(boardId, goalId); }
  listOpenGoalRisks(boardId: string, goalId: string) { return this.facts.listOpenGoalRisks(boardId, goalId); }
  activeReplacement(boardId: string, goalId: string) { return this.facts.activeReplacement(boardId, goalId); }

  getBoard(boardId: string): GoalsBoardRecord | null {
    return this.repository.getBoard(boardId);
  }

  policyBindingVersion(boardId: string, bindingId: string, mode: "legacy" | "semantic-v1"): { exists: boolean; version: string } {
    const current = this.repository.db.prepare("SELECT * FROM policy_bindings WHERE board_id = ? AND policy_binding_id = ?")
      .get(boardId, bindingId) as Record<string, unknown> | undefined;
    if (!current) return { exists: false, version: "absent" };
    // Old baselines include serialized policy_json verbatim, including whitespace.
    // Parsing it here would invalidate saved proposals even when no fact changed.
    const version = mode === "legacy" ? requestHash(current) : `semantic-v1:${requestHash(Object.fromEntries(
      Object.entries(current).filter(([key]) => !["created_at", "updated_at", "decided_at", "deactivated_at"].includes(key)),
    ))}`;
    return { exists: true, version };
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

  listContractRevisions(boardId: string) { return this.repository.listContractRevisions(boardId); }
  listLifecycleEvents(boardId: string) { return this.repository.listLifecycleEvents(boardId); }
  listCoverageRevisions(boardId: string) { return this.repository.listCoverageRevisions(boardId); }

  getRisk(boardId: string, riskId: string) {
    return this.repository.getRisk(boardId, riskId);
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
      risks: this.repository.listRisks(boardId),
      goal_risks: this.repository.listGoalRiskLinks(boardId),
      policy_bindings: this.repository.listActivePolicyBindings(boardId),
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
    const riskIds = new Set(
      snapshot.goal_risks
        .filter((link) => link.goal_id === goalId)
        .map((link) => link.risk_id),
    );
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
      risks: snapshot.risks.filter((risk) => riskIds.has(risk.risk_id)),
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

export function resolveGoalPolicy(
  bindings: readonly GoalPolicyBindingRecord[],
  strengthen?: Partial<GoalPolicy>,
): GoalPolicy {
  const resolved: GoalPolicy = { ...DEFAULT_GOAL_POLICY, required_capabilities: [] };
  for (const { policy } of bindings.filter((binding) => binding.scope === "project_default")) {
    if (policy.goal_mode != null) resolved.goal_mode = policy.goal_mode;
    if (policy.required_capabilities != null) {
      resolved.required_capabilities = unique(policy.required_capabilities).sort();
    }
    if (policy.self_verification != null) resolved.self_verification = policy.self_verification;
    if (policy.cross_reviewers != null) resolved.cross_reviewers = policy.cross_reviewers;
    if (policy.adversarial_reviewers != null) {
      resolved.adversarial_reviewers = policy.adversarial_reviewers;
    }
    if (policy.human_approval != null) resolved.human_approval = policy.human_approval;
    if (policy.max_lease_seconds != null) {
      resolved.max_lease_seconds = Math.max(1, policy.max_lease_seconds);
    }
  }
  const strengtheningPolicies = bindings
    .filter((binding) => binding.scope !== "project_default")
    .map((binding) => binding.policy);
  if (strengthen) strengtheningPolicies.push(strengthen);
  for (const policy of strengtheningPolicies) {
    if (policy.goal_mode && GOAL_MODE_ORDER[policy.goal_mode] > GOAL_MODE_ORDER[resolved.goal_mode]) {
      resolved.goal_mode = policy.goal_mode;
    }
    resolved.required_capabilities = unique([
      ...resolved.required_capabilities,
      ...(policy.required_capabilities ?? []),
    ]).sort();
    resolved.self_verification ||= policy.self_verification ?? false;
    resolved.cross_reviewers = Math.max(resolved.cross_reviewers, policy.cross_reviewers ?? 0);
    resolved.adversarial_reviewers = Math.max(
      resolved.adversarial_reviewers,
      policy.adversarial_reviewers ?? 0,
    );
    resolved.human_approval ||= policy.human_approval ?? false;
    if (policy.max_lease_seconds != null) {
      resolved.max_lease_seconds = Math.min(
        resolved.max_lease_seconds,
        Math.max(1, policy.max_lease_seconds),
      );
    }
  }
  return resolved;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
