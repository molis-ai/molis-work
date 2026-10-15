import { alchemistStateErrors } from "../../errors.js";
import { z } from "zod";
import type { LensRun } from "../../domain/research/lens.js";
import type { SqliteDatabase } from "../db/open-database.js";
import type { SqliteResearchRepository } from "../db/research-repository.js";
import type { SqliteJobRunner } from "../jobs/sqlite-job-runner.js";
import { RESEARCH_LENS_JOB } from "./start-lens-run.js";

const inputSchema = z.object({ lensRunId: z.string().min(1), planId: z.string().min(1), actorId: z.string().min(1).optional() }).strict();

export function createCancelLensRunService(dependencies: {
  database: SqliteDatabase;
  jobs: SqliteJobRunner;
  research: SqliteResearchRepository;
  now(): string;
  onCancel?(jobId: string): void;
}) {
  return (jobId: string): LensRun => {
    const cancelled = dependencies.database.transaction(() => {
      const job = dependencies.jobs.get(jobId);
      if (!job || job.kind !== RESEARCH_LENS_JOB) throw alchemistStateErrors.lens_run_not_found("alchemist.lens_run_not_found");
      const input = inputSchema.safeParse(job.input);
      if (!input.success) throw alchemistStateErrors.lens_run_not_found("alchemist.lens_run_not_found");
      const run = dependencies.research.getRun(input.data.lensRunId);
      if (!run) throw alchemistStateErrors.lens_run_not_found("alchemist.lens_run_not_found");
      try {
        dependencies.jobs.cancel(jobId);
      } catch {
        throw alchemistStateErrors.lens_run_not_cancellable("alchemist.lens_run_not_cancellable");
      }
      return dependencies.research.updateRun(run.id, {
        status: "cancelled",
        stage: run.stage,
        now: dependencies.now(),
      });
    })();
    dependencies.onCancel?.(jobId);
    return cancelled;
  };
}

export type CancelLensRun = ReturnType<typeof createCancelLensRunService>;
