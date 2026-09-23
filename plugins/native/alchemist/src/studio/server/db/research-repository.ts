import type { RunStage, RunStatus } from "../../domain/kernel/run.js";
import type {
  LensCompatibilityKey,
  LensRun,
  MvpScopeVersion,
  ResearchPlan,
} from "../../domain/research/lens.js";
import type { Claim, Evidence, LensReport } from "../../domain/research/report.js";
import type { SqliteDatabase } from "./open-database.js";

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
  created_at: string;
}

interface RunRow {
  id: string;
  plan_id: string;
  idea_id: string;
  idea_version: number;
  mvp_scope_version: number | null;
  lens: LensCompatibilityKey["lens"];
  status: RunStatus;
  stage: RunStage;
  runtime_label: string;
  job_id: string;
  error_code: string | null;
  created_at: string;
  updated_at: string;
}

interface ReportRow {
  id: string;
  run_id: string;
  revision: number;
  idea_id: string;
  idea_version: number;
  mvp_scope_version: number | null;
  lens: LensCompatibilityKey["lens"];
  status: LensReport["status"];
  runtime_label: string;
  summary: string;
  created_at: string;
}

interface ClaimRow {
  id: string;
  label: string;
  status: Claim["status"];
  conclusion: string;
  rationale: string;
  unknowns_json: string;
  change_conditions_json: string;
}

interface EvidenceRow {
  id: string;
  source_id: string;
  source_type: Evidence["sourceType"];
  title: string;
  url: string;
  excerpt: string;
  captured_at: string;
  content_hash: string;
}

export class SqliteResearchRepository {
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
          budget_kind, budget_limit, budget_currency, applied_playbook_rule_ids_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

  createRun(input: Omit<LensRun, "createdAt" | "updatedAt"> & { now: string }): LensRun {
    this.database
      .prepare(
        `INSERT INTO lens_runs
         (id, plan_id, idea_id, idea_version, mvp_scope_version, lens, status, stage,
          runtime_label, job_id, error_code, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.planId,
        input.key.ideaId,
        input.key.ideaVersion,
        input.key.mvpScopeVersion ?? null,
        input.key.lens,
        input.status,
        input.stage,
        input.runtimeLabel,
        input.jobId,
        input.errorCode ?? null,
        input.now,
        input.now,
      );
    return this.requireRun(input.id);
  }

  getRun(id: string): LensRun | undefined {
    const row = this.database.prepare("SELECT * FROM lens_runs WHERE id = ?").get(id) as RunRow | undefined;
    return row ? mapRun(row) : undefined;
  }

  getRunForPlan(planId: string): LensRun | undefined {
    const row = this.database
      .prepare("SELECT * FROM lens_runs WHERE plan_id = ? ORDER BY created_at LIMIT 1")
      .get(planId) as RunRow | undefined;
    return row ? mapRun(row) : undefined;
  }

  getLatestRun(key: LensCompatibilityKey): LensRun | undefined {
    const row = this.database
      .prepare(
        `SELECT * FROM lens_runs
         WHERE idea_id = ? AND idea_version = ? AND lens = ?
           AND ((mvp_scope_version IS NULL AND ? IS NULL) OR mvp_scope_version = ?)
         ORDER BY created_at DESC, id DESC LIMIT 1`,
      )
      .get(key.ideaId, key.ideaVersion, key.lens, key.mvpScopeVersion ?? null, key.mvpScopeVersion ?? null) as
      | RunRow
      | undefined;
    return row ? mapRun(row) : undefined;
  }

  updateRun(
    id: string,
    update: { status?: RunStatus; stage?: RunStage; errorCode?: string; now: string },
  ): LensRun {
    const current = this.requireRun(id);
    this.database
      .prepare(`UPDATE lens_runs SET status = ?, stage = ?, error_code = ?, updated_at = ? WHERE id = ?`)
      .run(
        update.status ?? current.status,
        update.stage ?? current.stage,
        update.errorCode ?? current.errorCode ?? null,
        update.now,
        id,
      );
    return this.requireRun(id);
  }

  saveReport(input: { report: LensReport; evidence: readonly Evidence[] }): LensReport {
    const existing = this.getReport(input.report.id);
    if (existing) {
      if (existing.runId !== input.report.runId) throw new Error("LENS_REPORT_CONFLICT");
      this.updateRun(input.report.runId, {
        status: existing.status,
        stage: "synthesizing",
        now: input.report.createdAt,
      });
      return existing;
    }
    return this.database.transaction(() => {
      for (const item of input.evidence) {
        this.database
          .prepare(
            `INSERT INTO evidence
             (id, run_id, source_id, source_type, title, url, excerpt, captured_at, content_hash)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            item.id,
            input.report.runId,
            item.sourceId,
            item.sourceType,
            item.title,
            item.url,
            item.excerpt,
            item.capturedAt,
            item.contentHash,
          );
      }
      this.database
        .prepare(
          `INSERT INTO lens_reports
           (id, run_id, revision, idea_id, idea_version, mvp_scope_version, lens, status,
            runtime_label, summary, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.report.id,
          input.report.runId,
          input.report.revision,
          input.report.key.ideaId,
          input.report.key.ideaVersion,
          input.report.key.mvpScopeVersion ?? null,
          input.report.key.lens,
          input.report.status,
          input.report.runtimeLabel,
          input.report.summary,
          input.report.createdAt,
        );
      input.report.judgments.forEach((claim, position) => {
        this.database
          .prepare(
            `INSERT INTO claims
             (id, report_id, position, label, status, conclusion, rationale,
              unknowns_json, change_conditions_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            claim.id,
            input.report.id,
            position,
            claim.label,
            claim.status,
            claim.conclusion,
            claim.rationale,
            JSON.stringify(claim.unknowns),
            JSON.stringify(claim.changeConditions),
          );
        for (const evidenceId of claim.supportingEvidenceIds) {
          this.linkClaimEvidence(claim.id, evidenceId, "support");
        }
        for (const evidenceId of claim.counterEvidenceIds) {
          this.linkClaimEvidence(claim.id, evidenceId, "counter");
        }
      });
      this.updateRun(input.report.runId, {
        status: input.report.status,
        stage: "synthesizing",
        now: input.report.createdAt,
      });
      return input.report;
    })();
  }

  getLatestReport(key: LensCompatibilityKey): LensReport | undefined {
    const row = this.database
      .prepare(
        `SELECT * FROM lens_reports
         WHERE idea_id = ? AND idea_version = ? AND lens = ?
           AND ((mvp_scope_version IS NULL AND ? IS NULL) OR mvp_scope_version = ?)
         ORDER BY created_at DESC, revision DESC LIMIT 1`,
      )
      .get(key.ideaId, key.ideaVersion, key.lens, key.mvpScopeVersion ?? null, key.mvpScopeVersion ?? null) as
      | ReportRow
      | undefined;
    return row ? this.mapReport(row) : undefined;
  }

  getReport(id: string): LensReport | undefined {
    const row = this.database.prepare("SELECT * FROM lens_reports WHERE id = ?").get(id) as
      | ReportRow
      | undefined;
    return row ? this.mapReport(row) : undefined;
  }

  listEvidence(reportId: string): Evidence[] {
    return (
      this.database
        .prepare(
          `SELECT evidence.* FROM evidence
           JOIN lens_reports ON lens_reports.run_id = evidence.run_id
           WHERE lens_reports.id = ? ORDER BY evidence.rowid`,
        )
        .all(reportId) as EvidenceRow[]
    ).map(mapEvidence);
  }

  private mapReport(row: ReportRow): LensReport {
    const claims = this.database
      .prepare("SELECT * FROM claims WHERE report_id = ? ORDER BY position")
      .all(row.id) as ClaimRow[];
    return {
      id: row.id,
      runId: row.run_id,
      revision: row.revision,
      key: keyFromRow(row),
      status: row.status,
      runtimeLabel: row.runtime_label,
      summary: row.summary,
      judgments: claims.map((claim) => ({
        id: claim.id,
        label: claim.label,
        status: claim.status,
        conclusion: claim.conclusion,
        rationale: claim.rationale,
        supportingEvidenceIds: this.evidenceIds(claim.id, "support"),
        counterEvidenceIds: this.evidenceIds(claim.id, "counter"),
        unknowns: JSON.parse(claim.unknowns_json) as string[],
        changeConditions: JSON.parse(claim.change_conditions_json) as string[],
      })),
      createdAt: row.created_at,
    };
  }

  private evidenceIds(claimId: string, relation: "support" | "counter"): string[] {
    return (
      this.database
        .prepare(
          "SELECT evidence_id FROM claim_evidence WHERE claim_id = ? AND relation = ? ORDER BY evidence_id",
        )
        .all(claimId, relation) as { evidence_id: string }[]
    ).map((row) => row.evidence_id);
  }

  private linkClaimEvidence(claimId: string, evidenceId: string, relation: "support" | "counter"): void {
    this.database
      .prepare("INSERT INTO claim_evidence (claim_id, evidence_id, relation) VALUES (?, ?, ?)")
      .run(claimId, evidenceId, relation);
  }

  private requireMvpScope(ideaId: string, version: number): MvpScopeVersion {
    const row = this.database
      .prepare("SELECT * FROM mvp_scope_versions WHERE idea_id = ? AND version = ?")
      .get(ideaId, version) as MvpScopeRow | undefined;
    if (!row) throw new Error("MVP_SCOPE_NOT_FOUND");
    return mapMvpScope(row);
  }

  private requireRun(id: string): LensRun {
    const run = this.getRun(id);
    if (!run) throw new Error("LENS_RUN_NOT_FOUND");
    return run;
  }
}

function keyFromRow(row: {
  idea_id: string;
  idea_version: number;
  mvp_scope_version: number | null;
  lens: LensCompatibilityKey["lens"];
}): LensCompatibilityKey {
  return {
    ideaId: row.idea_id,
    ideaVersion: row.idea_version,
    ...(row.mvp_scope_version === null ? {} : { mvpScopeVersion: row.mvp_scope_version }),
    lens: row.lens,
  };
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
    createdAt: row.created_at,
  };
}

function mapRun(row: RunRow): LensRun {
  return {
    id: row.id,
    planId: row.plan_id,
    key: keyFromRow(row),
    status: row.status,
    stage: row.stage,
    runtimeLabel: row.runtime_label,
    jobId: row.job_id,
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEvidence(row: EvidenceRow): Evidence {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceType: row.source_type,
    title: row.title,
    url: row.url,
    excerpt: row.excerpt,
    capturedAt: row.captured_at,
    contentHash: row.content_hash,
  };
}
