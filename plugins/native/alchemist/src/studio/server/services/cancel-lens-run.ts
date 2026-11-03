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
      if (!job || job.kind !== RESEARCH_LENS_JOB) throw alchemistStateErrors.run_not_found("没有找到这次研究。");
      const input = inputSchema.safeParse(job.input);
      if (!input.success) throw alchemistStateErrors.run_not_found("没有找到这次研究。");
      const run = dependencies.research.runs.getRun(input.data.lensRunId);
      if (!run) throw alchemistStateErrors.run_not_found("没有找到这次研究。");
      try {
        dependencies.jobs.cancel(jobId);
      } catch {
        throw alchemistStateErrors.run_not_cancellable("这次研究已经结束，不能再取消。");
      }
      return dependencies.research.runs.updateRun(run.id, {
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
