import { z } from "zod";
import type { LensRun } from "../../domain/research/lens.js";
import type { SqliteDatabase } from "../db/open-database.js";
import type { SqliteResearchRepository } from "../db/research-repository.js";
import type { SqliteJobRunner } from "../jobs/sqlite-job-runner.js";
import { RESEARCH_LENS_JOB } from "./start-lens-run.js";

const inputSchema = z.object({ lensRunId: z.string().min(1), planId: z.string().min(1) }).strict();

export class CancelLensRunError extends Error {
  readonly name = "CancelLensRunError";
}

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
      if (!job || job.kind !== RESEARCH_LENS_JOB) throw new CancelLensRunError("LENS_RUN_NOT_FOUND");
      const input = inputSchema.safeParse(job.input);
      if (!input.success) throw new CancelLensRunError("LENS_RUN_NOT_FOUND");
      const run = dependencies.research.getRun(input.data.lensRunId);
      if (!run) throw new CancelLensRunError("LENS_RUN_NOT_FOUND");
      try {
        dependencies.jobs.cancel(jobId);
      } catch {
        throw new CancelLensRunError("LENS_RUN_NOT_CANCELLABLE");
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
