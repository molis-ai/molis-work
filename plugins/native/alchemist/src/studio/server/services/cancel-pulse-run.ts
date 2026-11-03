import { alchemistStateErrors } from "../../errors.js";
import { z } from "zod";
import type { PulseRun } from "../../domain/discovery/pulse.js";
import type { SqliteDatabase } from "../db/open-database.js";
import type { SqlitePulseRepository } from "../db/pulse-repository.js";
import type { SqliteJobRunner } from "../jobs/sqlite-job-runner.js";
import { DISCOVERY_PULSE_JOB } from "./start-pulse-run.js";

const inputSchema = z.object({ pulseRunId: z.string().min(1), periodStart: z.string().min(1), actorId: z.string().min(1).optional() }).strict();

/**
 * Stops a Pulse by its job (W5-01-ALC-RES11): the job's own cancel and the run's `cancelled` status are one transaction; then the
 * running execution is aborted. Nothing else is written, now or when a source answers late (RES07).
 */
export function createCancelPulseRunService(dependencies: {
  database: SqliteDatabase;
  jobs: SqliteJobRunner;
  pulse: SqlitePulseRepository;
  now(): string;
  onCancel?(jobId: string): void;
}) {
  return (jobId: string): PulseRun => {
    const cancelled = dependencies.database.transaction(() => {
      const job = dependencies.jobs.get(jobId);
      const input = job?.kind === DISCOVERY_PULSE_JOB ? inputSchema.safeParse(job.input) : undefined;
      const run = input?.success ? dependencies.pulse.runs.getRun(input.data.pulseRunId) : undefined;
      if (!run || run.jobId !== jobId) throw alchemistStateErrors.run_not_found("没有找到这次市场脉搏。");
      try {
        dependencies.jobs.cancel(jobId);
      } catch {
        throw alchemistStateErrors.run_not_cancellable("这次市场脉搏已经结束，不能再停止。");
      }
      return dependencies.pulse.runs.updateRun(run.id, { status: "cancelled", now: dependencies.now() });
    })();
    dependencies.onCancel?.(jobId);
    return cancelled;
  };
}

export type CancelPulseRun = ReturnType<typeof createCancelPulseRunService>;
