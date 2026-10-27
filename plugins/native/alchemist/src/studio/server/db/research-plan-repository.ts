import type {
  LensCompatibilityKey,
  MvpScopeVersion,
  ResearchPlan,
} from "../../domain/research/lens.js";
import type { SqliteDatabase } from "./open-database.js";
import { keyFromRow } from "./research-key.js";

interface MvpScopeRow {
  id: string;
  idea_id: string;
  version: number;
  idea_version: number;
  in_scope_json: string;
  out_of_scope_json: string;
  platform_assumptions_json: string;
  integration_assumptions_json: string;
  created_at: string;
}

interface PlanRow {
  id: string;
  idea_id: string;
  idea_version: number;
  mvp_scope_version: number | null;
  lens: LensCompatibilityKey["lens"];
  scope_summary: string;
  model_policy: ResearchPlan["modelPolicy"];
  model_id: string;
  runtime_label: string;
  estimated_min_minutes: number;
  estimated_max_minutes: number;
  budget_kind: ResearchPlan["budget"]["kind"];
  budget_limit: number;
  budget_currency: string | null;
  applied_playbook_rule_ids_json: string;
  reuse_json: string | null;
  created_at: string;
}

/** What a research is asked to cover: the MVP scope of an idea version and the plans made for it. */
export class SqliteResearchPlanRepository {
  constructor(private readonly database: SqliteDatabase) {}

  ensureMvpScope(input: {
    id: string;
    ideaId: string;
    ideaVersion: number;
    actorId: string;
    inScope: readonly string[];
    outOfScope: readonly string[];
    platformAssumptions?: readonly string[];
    integrationAssumptions?: readonly string[];
    now: string;
  }): MvpScopeVersion {
    const existing = this.database
      .prepare("SELECT * FROM mvp_scope_versions WHERE idea_id = ? AND idea_version = ?")
      .get(input.ideaId, input.ideaVersion) as MvpScopeRow | undefined;
    if (existing) return mapMvpScope(existing);
    this.database
      .prepare(
        `INSERT INTO mvp_scope_versions
         (id, idea_id, version, idea_version, actor_id, in_scope_json, out_of_scope_json,
          platform_assumptions_json, integration_assumptions_json, created_at)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.ideaId,
        input.ideaVersion,
        input.actorId,
        JSON.stringify(input.inScope),
        JSON.stringify(input.outOfScope),
        JSON.stringify(input.platformAssumptions ?? []),
        JSON.stringify(input.integrationAssumptions ?? []),
        input.now,
      );
    return this.requireMvpScope(input.ideaId, 1);
  }

  getMvpScopeForIdeaVersion(ideaId: string, ideaVersion: number): MvpScopeVersion | undefined {
    const row = this.database
      .prepare("SELECT * FROM mvp_scope_versions WHERE idea_id = ? AND idea_version = ?")
      .get(ideaId, ideaVersion) as MvpScopeRow | undefined;
    return row ? mapMvpScope(row) : undefined;
  }

  createPlan(plan: ResearchPlan): ResearchPlan {
    this.database
      .prepare(
        `INSERT INTO research_plans
         (id, idea_id, idea_version, mvp_scope_version, lens, scope_summary, model_policy,
          model_id, runtime_label, estimated_min_minutes, estimated_max_minutes,
          budget_kind, budget_limit, budget_currency, applied_playbook_rule_ids_json, created_at, reuse_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        plan.id,
        plan.key.ideaId,
        plan.key.ideaVersion,
        plan.key.mvpScopeVersion ?? null,
        plan.key.lens,
        plan.scopeSummary,
        plan.modelPolicy,
        plan.modelId,
        plan.runtimeLabel,
        plan.estimatedDuration.minMinutes,
        plan.estimatedDuration.maxMinutes,
        plan.budget.kind,
        plan.budget.limit,
        plan.budget.kind === "money" ? plan.budget.currency : null,
        JSON.stringify(plan.appliedPlaybookRuleIds),
        plan.createdAt,
        plan.reuse ? JSON.stringify(plan.reuse) : null,
      );
    return plan;
  }

  getPlan(id: string): ResearchPlan | undefined {
    const row = this.database.prepare("SELECT * FROM research_plans WHERE id = ?").get(id) as
      | PlanRow
      | undefined;
    return row ? mapPlan(row) : undefined;
  }

  getLatestPlan(key: LensCompatibilityKey): ResearchPlan | undefined {
    const row = this.database
      .prepare(
        `SELECT * FROM research_plans
         WHERE idea_id = ? AND idea_version = ? AND lens = ?
           AND ((mvp_scope_version IS NULL AND ? IS NULL) OR mvp_scope_version = ?)
         ORDER BY created_at DESC, id DESC LIMIT 1`,
      )
      .get(key.ideaId, key.ideaVersion, key.lens, key.mvpScopeVersion ?? null, key.mvpScopeVersion ?? null) as
      | PlanRow
      | undefined;
    return row ? mapPlan(row) : undefined;
  }

  private requireMvpScope(ideaId: string, version: number): MvpScopeVersion {
    const row = this.database
      .prepare("SELECT * FROM mvp_scope_versions WHERE idea_id = ? AND version = ?")
      .get(ideaId, version) as MvpScopeRow | undefined;
    if (!row) throw new Error("alchemist.mvp_scope_not_found");
    return mapMvpScope(row);
  }
}

function mapMvpScope(row: MvpScopeRow): MvpScopeVersion {
  return {
    id: row.id,
    ideaId: row.idea_id,
    version: row.version,
    ideaVersion: row.idea_version,
    inScope: JSON.parse(row.in_scope_json) as string[],
    outOfScope: JSON.parse(row.out_of_scope_json) as string[],
    platformAssumptions: JSON.parse(row.platform_assumptions_json) as string[],
    integrationAssumptions: JSON.parse(row.integration_assumptions_json) as string[],
    createdAt: row.created_at,
  };
}

function mapPlan(row: PlanRow): ResearchPlan {
  const budget =
    row.budget_kind === "money"
      ? { kind: "money" as const, limit: row.budget_limit, currency: row.budget_currency ?? "USD" }
      : { kind: row.budget_kind, limit: row.budget_limit };
  return {
    id: row.id,
    key: keyFromRow(row),
    scopeSummary: row.scope_summary,
    modelPolicy: row.model_policy,
    modelId: row.model_id,
    runtimeLabel: row.runtime_label,
    estimatedDuration: {
      minMinutes: row.estimated_min_minutes,
      maxMinutes: row.estimated_max_minutes,
    },
    budget,
    appliedPlaybookRuleIds: JSON.parse(row.applied_playbook_rule_ids_json) as string[],
    ...(row.reuse_json ? { reuse: JSON.parse(row.reuse_json) as NonNullable<ResearchPlan["reuse"]> } : {}),
    createdAt: row.created_at,
  };
}
