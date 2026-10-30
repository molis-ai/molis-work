import type { LensCompatibilityKey } from "../../domain/research/lens.js";
import type { Claim, Evidence, LensReport } from "../../domain/research/report.js";
import type { SqliteDatabase } from "./open-database.js";
import { keyFromRow } from "./research-key.js";
import type { SqliteResearchRunRepository } from "./research-run-repository.js";

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

/** What a run found: its report, the claims in it and the evidence behind them. Saving a report also moves the run on. */
export class SqliteResearchReportRepository {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly runs: SqliteResearchRunRepository,
  ) {}

  saveReport(input: { report: LensReport; evidence: readonly Evidence[] }): LensReport {
    const existing = this.getReport(input.report.id);
    if (existing) {
      if (existing.runId !== input.report.runId) throw new Error("alchemist.lens_report_conflict");
      this.runs.updateRun(input.report.runId, {
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
      this.runs.updateRun(input.report.runId, {
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
