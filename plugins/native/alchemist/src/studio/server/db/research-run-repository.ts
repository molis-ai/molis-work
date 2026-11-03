import type { RunStage, RunStatus } from "../../domain/kernel/run.js";
import type { LensCompatibilityKey, LensRun } from "../../domain/research/lens.js";
import type { SqliteDatabase } from "./open-database.js";
import { keyFromRow } from "./research-key.js";

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

/** The lens runs of a plan: `lens_runs`. */
export class SqliteResearchRunRepository {
  constructor(private readonly database: SqliteDatabase) {}

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

  private requireRun(id: string): LensRun {
    const run = this.getRun(id);
    if (!run) throw new Error("alchemist.lens_run_not_found");
    return run;
  }
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
