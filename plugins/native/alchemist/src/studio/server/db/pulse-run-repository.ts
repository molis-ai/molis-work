import type { PulseSourceId } from "../../domain/discovery/source.js";
import type { PulseRun } from "../../domain/discovery/pulse.js";
import type { RunStage, RunStatus } from "../../domain/kernel/run.js";
import type { SqliteDatabase } from "./open-database.js";

interface PulseRunRow {
  id: string;
  workspace_id: string;
  status: RunStatus;
  stage: RunStage;
  source_ids_json: string;
  runtime_label: string;
  job_id: string;
  error_code: string | null;
  created_at: string;
  updated_at: string;
}

/** The pulse runs: `pulse_runs`. */
export class SqlitePulseRunRepository {
  constructor(private readonly database: SqliteDatabase) {}

  createRun(input: Omit<PulseRun, "createdAt" | "updatedAt"> & { now: string }): PulseRun {
    this.database
      .prepare(
        `INSERT INTO pulse_runs
         (id, workspace_id, status, stage, source_ids_json, runtime_label, job_id, error_code,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.workspaceId,
        input.status,
        input.stage,
        JSON.stringify(input.sourceIds),
        input.runtimeLabel,
        input.jobId,
        input.errorCode ?? null,
        input.now,
        input.now,
      );
    return this.requireRun(input.id);
  }

  getRun(id: string): PulseRun | undefined {
    const row = this.database.prepare("SELECT * FROM pulse_runs WHERE id = ?").get(id) as
      | PulseRunRow
      | undefined;
    return row ? mapRun(row) : undefined;
  }

  getLatestRun(): PulseRun | undefined {
    const row = this.database
      .prepare("SELECT * FROM pulse_runs ORDER BY created_at DESC, id DESC LIMIT 1")
      .get() as PulseRunRow | undefined;
    return row ? mapRun(row) : undefined;
  }

  updateRun(
    id: string,
    update: { status?: RunStatus; stage?: RunStage; errorCode?: string; now: string },
  ): PulseRun {
    const current = this.requireRun(id);
    this.database
      .prepare("UPDATE pulse_runs SET status = ?, stage = ?, error_code = ?, updated_at = ? WHERE id = ?")
      .run(
        update.status ?? current.status,
        update.stage ?? current.stage,
        update.errorCode ?? current.errorCode ?? null,
        update.now,
        id,
      );
    return this.requireRun(id);
  }

  private requireRun(id: string): PulseRun {
    const run = this.getRun(id);
    if (!run) throw new Error("alchemist.pulse_run_not_found");
    return run;
  }
}

function mapRun(row: PulseRunRow): PulseRun {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    status: row.status,
    stage: row.stage,
    sourceIds: JSON.parse(row.source_ids_json) as PulseSourceId[],
    runtimeLabel: row.runtime_label,
    jobId: row.job_id,
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
