import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import type { DatabaseSync, SQLInputValue, SQLOutputValue } from "node:sqlite";
import type {
  EvaluationHumanReview,
  EvaluationMetricsSummarizeInput,
  EvaluationRunListInput,
  EvaluationRunView,
  EvaluationSampleInput,
  EvaluationSampleListInput,
  EvaluationSamplePutOutput,
  EvaluationSampleView,
  EvaluationStage,
  EvaluationUnknownReason,
  EvaluationVerdict,
} from "@molis-ai/molis-work-contracts/services/evaluation";
import type { ObservationOutcome } from "@molis-ai/molis-work-contracts/services/observation";
import { homeSqlitePath, openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import { evaluationErrors } from "./errors.js";
import { EVALUATION_BASELINE, EVALUATION_STORE } from "./schema.js";

interface StoredSampleRow {
  readonly sample_id: string;
  readonly version: number;
  readonly purpose: string;
  readonly work_mode: string;
  readonly project_id: string | null;
  readonly frozen_digest: string;
  readonly spec_json: string;
  readonly hold_id: string | null;
  readonly held_record_count: number;
  readonly created_at: string;
}

interface StoredRunRow {
  readonly run_id: string;
  readonly sample_id: string;
  readonly sample_version: number;
  readonly sample_purpose: string;
  readonly work_mode: string;
  readonly project_id: string | null;
  readonly execution_kind: string;
  readonly automated_verdict: EvaluationVerdict;
  readonly effective_verdict: EvaluationVerdict;
  readonly verdict_source: "automated" | "human_review";
  readonly evaluated_at: string;
  readonly duration_ms: number;
  readonly outcome_counts: string;
  readonly run_json: string;
}

interface StoredReviewRow {
  readonly review_id: string;
  readonly run_id: string;
  readonly expectation_id: string | null;
  readonly reviewer_actor_id: string;
  readonly verdict: EvaluationVerdict;
  readonly stage: EvaluationStage | null;
  readonly rationale: string;
  readonly cited_record_ids: string;
  readonly created_at: string;
}

export interface StoredRunWithOutcomes {
  readonly view: EvaluationRunView;
  readonly outcomeCounts: Readonly<Partial<Record<ObservationOutcome, number>>>;
}

function rowsAs<T>(rows: readonly Record<string, SQLOutputValue>[]): T[] {
  return rows as T[];
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const record = value as Readonly<Record<string, unknown>>;
  const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export function frozenDigestOfSample(sample: EvaluationSampleInput): string {
  const payload = canonicalJson({
    sample_id: sample.sample_id,
    version: sample.version,
    title: sample.title,
    purpose: sample.purpose,
    work_mode: sample.work_mode,
    project_id: sample.project_id ?? null,
    case_ref: sample.case_ref ?? null,
    initial_intent: sample.initial_intent,
    query: sample.query,
    pinned_record_ids: sample.pinned_record_ids ?? null,
    window: sample.window ?? null,
    opportunity_basis: sample.opportunity_basis ?? null,
    baseline_conditions: sample.baseline_conditions ?? null,
    allowed_variations: sample.allowed_variations ?? [],
    expectations: sample.expectations,
  });
  return createHash("sha256").update(payload).digest("hex");
}

function sampleViewOf(row: StoredSampleRow): EvaluationSampleView {
  const spec = JSON.parse(row.spec_json) as EvaluationSampleInput;
  return {
    ...spec,
    frozen_digest: row.frozen_digest,
    hold_id: row.hold_id,
    held_record_count: Number(row.held_record_count),
    created_at: row.created_at,
  };
}

function reviewViewOf(row: StoredReviewRow): EvaluationHumanReview {
  return {
    review_id: row.review_id,
    run_id: row.run_id,
    expectation_id: row.expectation_id,
    reviewer_actor_id: row.reviewer_actor_id,
    verdict: row.verdict,
    ...(row.stage ? { stage: row.stage } : {}),
    rationale: row.rationale,
    cited_record_ids: JSON.parse(row.cited_record_ids) as readonly string[],
    created_at: row.created_at,
  };
}

export function applyReviewsToRun(base: EvaluationRunView, reviews: readonly EvaluationHumanReview[]): EvaluationRunView {
  if (reviews.length === 0) return { ...base, human_reviews: [] };
  const byExpectation = new Map<string, EvaluationHumanReview>();
  let latestRunReview: EvaluationHumanReview | undefined;
  for (const review of reviews) {
    if (review.expectation_id === null) latestRunReview = review;
    else byExpectation.set(review.expectation_id, review);
  }
  const expectationResults = base.expectation_results.map((item) => {
    const override = byExpectation.get(item.expectation_id);
    if (!override) return item;
    const unknownReasons: readonly EvaluationUnknownReason[] = override.verdict === "unknown"
      ? (item.unknown_reasons.length > 0 ? item.unknown_reasons : ["awaiting_human_review"])
      : [];
    return {
      ...item,
      effective_verdict: override.verdict,
      verdict_source: "human_review" as const,
      unknown_reasons: unknownReasons,
    };
  });
  const nonReviewRunUnknowns = base.unknown_reasons.filter((reason) => reason !== "awaiting_human_review");
  if (latestRunReview) {
    const failedStages = latestRunReview.verdict === "failed"
      ? Array.from(
          new Set([
            ...expectationResults.filter((r) => r.effective_verdict === "failed").map((r) => r.stage),
            ...(latestRunReview.stage ? [latestRunReview.stage] : base.failed_stages),
          ]),
        )
      : [];
    const expUnknowns = expectationResults.flatMap((r) => (r.effective_verdict === "unknown" ? r.unknown_reasons : []));
    const preservedUnknowns = Array.from(new Set<EvaluationUnknownReason>([...base.unknown_reasons, ...expUnknowns]));
    const unknownReasons: readonly EvaluationUnknownReason[] = latestRunReview.verdict === "unknown"
      ? (preservedUnknowns.length > 0 ? preservedUnknowns : ["awaiting_human_review"])
      : [];
    return {
      ...base,
      effective_verdict: latestRunReview.verdict,
      verdict_source: "human_review",
      failed_stages: failedStages,
      unknown_reasons: unknownReasons,
      expectation_results: expectationResults,
      human_reviews: reviews,
    };
  }
  const expUnknowns = expectationResults.flatMap((r) => (r.effective_verdict === "unknown" ? r.unknown_reasons : []));
  const mergedUnknowns = Array.from(new Set<EvaluationUnknownReason>([...nonReviewRunUnknowns, ...expUnknowns]));
  const failedStages = Array.from(new Set(expectationResults.filter((r) => r.effective_verdict === "failed").map((r) => r.stage)));
  const effectiveVerdict: EvaluationVerdict = failedStages.length > 0
    ? "failed"
    : mergedUnknowns.length > 0 || expectationResults.some((r) => r.effective_verdict === "unknown")
      ? "unknown"
      : "passed";
  return {
    ...base,
    effective_verdict: effectiveVerdict,
    verdict_source: "human_review",
    failed_stages: failedStages,
    unknown_reasons: mergedUnknowns,
    expectation_results: expectationResults,
    human_reviews: reviews,
  };
}

export function clearProjectEvaluationRows(db: DatabaseSync, projectId: string): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM evaluation_reviews WHERE run_id IN (SELECT run_id FROM evaluation_runs WHERE project_id = ?)").run(projectId);
    db.prepare("DELETE FROM evaluation_runs WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM evaluation_samples WHERE project_id = ?").run(projectId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function clearEvaluationProjectFile(home: string, projectId: string): void {
  if (!existsSync(homeSqlitePath(home, EVALUATION_STORE))) return;
  const db = openBaselineHomeSqlite(home, EVALUATION_STORE, EVALUATION_BASELINE);
  try {
    clearProjectEvaluationRows(db, projectId);
  } finally {
    db.close();
  }
}

export class EvaluationStore {
  private db: DatabaseSync | undefined;
  private closed = false;

  constructor(private readonly home: string) {}

  private open(): DatabaseSync {
    if (this.closed) throw evaluationErrors.store_unavailable("评测库已关闭");
    if (this.db) return this.db;
    try {
      this.db = openBaselineHomeSqlite(this.home, EVALUATION_STORE, EVALUATION_BASELINE);
      return this.db;
    } catch (error) {
      throw evaluationErrors.store_unavailable(error instanceof Error ? error.message : "评测库无法打开");
    }
  }

  assertSampleImmutable(input: EvaluationSampleInput): void {
    if (!this.db && !existsSync(homeSqlitePath(this.home, EVALUATION_STORE))) return;
    const db = this.open();
    const existing = rowsAs<Pick<StoredSampleRow, "frozen_digest">>(
      db.prepare("SELECT frozen_digest FROM evaluation_samples WHERE sample_id = ? AND version = ?").all(input.sample_id, input.version),
    )[0];
    if (existing && existing.frozen_digest !== frozenDigestOfSample(input)) {
      throw evaluationErrors.sample_version_immutable(`样本 ${input.sample_id}@${input.version} 已冻结，修改预期或条件须升版本号`);
    }
  }

  putSample(input: EvaluationSampleInput, hold: { readonly holdId: string | null; readonly heldCount: number }, now: string): EvaluationSamplePutOutput {
    const db = this.open();
    const digest = frozenDigestOfSample(input);
    const existing = rowsAs<StoredSampleRow>(
      db.prepare("SELECT * FROM evaluation_samples WHERE sample_id = ? AND version = ?").all(input.sample_id, input.version),
    )[0];
    if (existing) {
      if (existing.frozen_digest !== digest) {
        throw evaluationErrors.sample_version_immutable(`样本 ${input.sample_id}@${input.version} 已冻结，修改预期或条件须升版本号`);
      }
      if (hold.holdId !== null && (existing.hold_id !== hold.holdId || existing.held_record_count !== hold.heldCount)) {
        db.prepare("UPDATE evaluation_samples SET hold_id = ?, held_record_count = ? WHERE sample_id = ? AND version = ?")
          .run(hold.holdId, hold.heldCount, input.sample_id, input.version);
        const refreshed = rowsAs<StoredSampleRow>(
          db.prepare("SELECT * FROM evaluation_samples WHERE sample_id = ? AND version = ?").all(input.sample_id, input.version),
        )[0]!;
        return { sample: sampleViewOf(refreshed), created: false };
      }
      return { sample: sampleViewOf(existing), created: false };
    }
    db.prepare(
      `INSERT INTO evaluation_samples (
        sample_id, version, purpose, work_mode, project_id, frozen_digest, spec_json, hold_id, held_record_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.sample_id,
      input.version,
      input.purpose,
      input.work_mode,
      input.project_id ?? null,
      digest,
      JSON.stringify(input),
      hold.holdId,
      hold.heldCount,
      now,
    );
    const inserted = rowsAs<StoredSampleRow>(
      db.prepare("SELECT * FROM evaluation_samples WHERE sample_id = ? AND version = ?").all(input.sample_id, input.version),
    )[0]!;
    return { sample: sampleViewOf(inserted), created: true };
  }

  getSample(sampleId: string, version?: number): EvaluationSampleView | null {
    if (!this.db && !existsSync(homeSqlitePath(this.home, EVALUATION_STORE))) return null;
    const db = this.open();
    const row = version !== undefined
      ? rowsAs<StoredSampleRow>(db.prepare("SELECT * FROM evaluation_samples WHERE sample_id = ? AND version = ?").all(sampleId, version))[0]
      : rowsAs<StoredSampleRow>(db.prepare("SELECT * FROM evaluation_samples WHERE sample_id = ? ORDER BY version DESC LIMIT 1").all(sampleId))[0];
    return row ? sampleViewOf(row) : null;
  }

  listSamples(filter: EvaluationSampleListInput): readonly EvaluationSampleView[] {
    const db = this.open();
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    if (filter.project_id === null) clauses.push("project_id IS NULL");
    else if (typeof filter.project_id === "string") { clauses.push("project_id = ?"); params.push(filter.project_id); }
    if (filter.purpose) { clauses.push("purpose = ?"); params.push(filter.purpose); }
    if (filter.work_mode) { clauses.push("work_mode = ?"); params.push(filter.work_mode); }
    if (filter.sample_id) { clauses.push("sample_id = ?"); params.push(filter.sample_id); }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = rowsAs<StoredSampleRow>(
      db.prepare(`SELECT * FROM evaluation_samples ${where} ORDER BY sample_id ASC, version DESC`).all(...params),
    );
    if (filter.all_versions === true) return rows.map(sampleViewOf);
    const seen = new Set<string>();
    const latest: EvaluationSampleView[] = [];
    for (const row of rows) {
      if (seen.has(row.sample_id)) continue;
      seen.add(row.sample_id);
      latest.push(sampleViewOf(row));
    }
    return latest;
  }

  inspectSampleRemoval(sampleId: string, version?: number): { readonly versions: readonly number[]; readonly holdIds: readonly string[] } {
    if (!this.db && !existsSync(homeSqlitePath(this.home, EVALUATION_STORE))) {
      return { versions: [], holdIds: [] };
    }
    const db = this.open();
    const rows = version !== undefined
      ? rowsAs<StoredSampleRow>(db.prepare("SELECT * FROM evaluation_samples WHERE sample_id = ? AND version = ?").all(sampleId, version))
      : rowsAs<StoredSampleRow>(db.prepare("SELECT * FROM evaluation_samples WHERE sample_id = ? ORDER BY version ASC").all(sampleId));
    if (rows.length === 0) return { versions: [], holdIds: [] };
    const holdIds = Array.from(new Set(rows.flatMap((row) => (row.hold_id ? [row.hold_id] : []))));
    return { versions: rows.map((row) => Number(row.version)), holdIds };
  }

  removeSample(sampleId: string, version?: number): { readonly removedVersions: readonly number[]; readonly holdIds: readonly string[] } {
    const db = this.open();
    const rows = version !== undefined
      ? rowsAs<StoredSampleRow>(db.prepare("SELECT * FROM evaluation_samples WHERE sample_id = ? AND version = ?").all(sampleId, version))
      : rowsAs<StoredSampleRow>(db.prepare("SELECT * FROM evaluation_samples WHERE sample_id = ? ORDER BY version ASC").all(sampleId));
    if (rows.length === 0) return { removedVersions: [], holdIds: [] };
    if (version !== undefined) db.prepare("DELETE FROM evaluation_samples WHERE sample_id = ? AND version = ?").run(sampleId, version);
    else db.prepare("DELETE FROM evaluation_samples WHERE sample_id = ?").run(sampleId);
    const holdIds = Array.from(new Set(rows.flatMap((row) => (row.hold_id ? [row.hold_id] : []))));
    return { removedVersions: rows.map((row) => Number(row.version)), holdIds };
  }

  insertRun(run: EvaluationRunView, outcomeCounts: Readonly<Partial<Record<ObservationOutcome, number>>>): void {
    const db = this.open();
    db.prepare(
      `INSERT INTO evaluation_runs (
        run_id, sample_id, sample_version, sample_purpose, work_mode, project_id, execution_kind,
        automated_verdict, effective_verdict, verdict_source, evaluated_at, duration_ms, outcome_counts, run_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      run.run_id,
      run.sample_id,
      run.sample_version,
      run.sample_purpose,
      run.work_mode,
      run.project_id,
      run.execution_kind,
      run.automated_verdict,
      run.effective_verdict,
      run.verdict_source,
      run.evaluated_at,
      run.duration_ms,
      JSON.stringify(outcomeCounts),
      JSON.stringify(run),
    );
  }

  private loadReviewsByRunIds(db: DatabaseSync, runIds: readonly string[]): ReadonlyMap<string, readonly EvaluationHumanReview[]> {
    const grouped = new Map<string, EvaluationHumanReview[]>();
    const chunkSize = 400;
    for (let offset = 0; offset < runIds.length; offset += chunkSize) {
      const chunk = runIds.slice(offset, offset + chunkSize);
      const placeholders = chunk.map(() => "?").join(", ");
      const reviewRows = rowsAs<StoredReviewRow>(
        db.prepare(`SELECT * FROM evaluation_reviews WHERE run_id IN (${placeholders}) ORDER BY created_at ASC, rowid ASC`).all(...chunk),
      );
      for (const row of reviewRows) {
        const bucket = grouped.get(row.run_id);
        const view = reviewViewOf(row);
        if (bucket) bucket.push(view);
        else grouped.set(row.run_id, [view]);
      }
    }
    return grouped;
  }

  private hydrateRun(db: DatabaseSync, row: StoredRunRow): EvaluationRunView {
    const base = JSON.parse(row.run_json) as EvaluationRunView;
    const reviews = rowsAs<StoredReviewRow>(
      db.prepare("SELECT * FROM evaluation_reviews WHERE run_id = ? ORDER BY created_at ASC, rowid ASC").all(row.run_id),
    ).map(reviewViewOf);
    return applyReviewsToRun(base, reviews);
  }

  getRun(runId: string): EvaluationRunView | null {
    const db = this.open();
    const row = rowsAs<StoredRunRow>(db.prepare("SELECT * FROM evaluation_runs WHERE run_id = ?").all(runId))[0];
    return row ? this.hydrateRun(db, row) : null;
  }

  listRuns(filter: EvaluationRunListInput): readonly EvaluationRunView[] {
    const db = this.open();
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    if (filter.sample_id) { clauses.push("sample_id = ?"); params.push(filter.sample_id); }
    if (filter.project_id === null) clauses.push("project_id IS NULL");
    else if (typeof filter.project_id === "string") { clauses.push("project_id = ?"); params.push(filter.project_id); }
    if (filter.purpose) { clauses.push("sample_purpose = ?"); params.push(filter.purpose); }
    if (filter.execution_kind) { clauses.push("execution_kind = ?"); params.push(filter.execution_kind); }
    if (filter.verdict) { clauses.push("effective_verdict = ?"); params.push(filter.verdict); }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = filter.limit ?? 50;
    const rows = rowsAs<StoredRunRow>(
      db.prepare(`SELECT * FROM evaluation_runs ${where} ORDER BY evaluated_at DESC, rowid DESC LIMIT ?`).all(...params, limit),
    );
    const reviewsByRun = this.loadReviewsByRunIds(db, rows.map((row) => row.run_id));
    return rows.map((row) => applyReviewsToRun(JSON.parse(row.run_json) as EvaluationRunView, reviewsByRun.get(row.run_id) ?? []));
  }

  queryRunsForMetrics(filter: EvaluationMetricsSummarizeInput): {
    readonly runs: readonly StoredRunWithOutcomes[];
    readonly sampleCount: number;
  } {
    const db = this.open();
    const clauses = ["sample_purpose = ?"];
    const params: SQLInputValue[] = [filter.purpose];
    if (filter.project_id === null) clauses.push("project_id IS NULL");
    else if (typeof filter.project_id === "string") { clauses.push("project_id = ?"); params.push(filter.project_id); }
    if (filter.work_mode) { clauses.push("work_mode = ?"); params.push(filter.work_mode); }
    if (filter.execution_kind) { clauses.push("execution_kind = ?"); params.push(filter.execution_kind); }
    if (filter.since) { clauses.push("evaluated_at >= ?"); params.push(filter.since); }
    if (filter.until) { clauses.push("evaluated_at <= ?"); params.push(filter.until); }
    const rows = rowsAs<StoredRunRow>(
      db.prepare(`SELECT * FROM evaluation_runs WHERE ${clauses.join(" AND ")} ORDER BY evaluated_at ASC, rowid ASC`).all(...params),
    );
    const reviewsByRun = this.loadReviewsByRunIds(db, rows.map((row) => row.run_id));
    const runs = rows.map((row) => ({
      view: applyReviewsToRun(JSON.parse(row.run_json) as EvaluationRunView, reviewsByRun.get(row.run_id) ?? []),
      outcomeCounts: JSON.parse(row.outcome_counts) as Readonly<Partial<Record<ObservationOutcome, number>>>,
    }));
    const sampleClauses = ["purpose = ?"];
    const sampleParams: SQLInputValue[] = [filter.purpose];
    if (filter.project_id === null) sampleClauses.push("project_id IS NULL");
    else if (typeof filter.project_id === "string") { sampleClauses.push("project_id = ?"); sampleParams.push(filter.project_id); }
    if (filter.work_mode) { sampleClauses.push("work_mode = ?"); sampleParams.push(filter.work_mode); }
    const sampleRow = rowsAs<{ readonly total: number }>(
      db.prepare(`SELECT COUNT(DISTINCT sample_id) AS total FROM evaluation_samples WHERE ${sampleClauses.join(" AND ")}`).all(...sampleParams),
    )[0];
    return { runs, sampleCount: Number(sampleRow?.total ?? 0) };
  }

  appendReview(review: EvaluationHumanReview): EvaluationRunView {
    const db = this.open();
    const row = rowsAs<StoredRunRow>(db.prepare("SELECT * FROM evaluation_runs WHERE run_id = ?").all(review.run_id))[0];
    if (!row) throw evaluationErrors.not_found(`评测运行 ${review.run_id} 不存在`);
    const base = JSON.parse(row.run_json) as EvaluationRunView;
    if (review.expectation_id !== null && !base.expectation_results.some((exp) => exp.expectation_id === review.expectation_id)) {
      throw evaluationErrors.not_found(`评测运行 ${review.run_id} 中不存在预期 ${review.expectation_id}`);
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(
        `INSERT INTO evaluation_reviews (
          review_id, run_id, expectation_id, reviewer_actor_id, verdict, stage, rationale, cited_record_ids, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        review.review_id,
        review.run_id,
        review.expectation_id,
        review.reviewer_actor_id,
        review.verdict,
        review.stage ?? null,
        review.rationale,
        JSON.stringify(review.cited_record_ids),
        review.created_at,
      );
      const updated = this.hydrateRun(db, row);
      db.prepare("UPDATE evaluation_runs SET effective_verdict = ?, verdict_source = ? WHERE run_id = ?")
        .run(updated.effective_verdict, updated.verdict_source, review.run_id);
      db.exec("COMMIT");
      return updated;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  clearProject(projectId: string): void {
    if (!this.db && !existsSync(homeSqlitePath(this.home, EVALUATION_STORE))) return;
    clearProjectEvaluationRows(this.open(), projectId);
  }

  close(): void {
    this.closed = true;
    if (!this.db) return;
    this.db.close();
    this.db = undefined;
  }
}
