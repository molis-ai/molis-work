import type { Clock, IdFactory } from "../../domain/kernel/identity.js";
import type { LensKind, LensRun } from "../../domain/research/lens.js";
import type { SqliteDatabase } from "../db/open-database.js";
import type { SqliteResearchRepository } from "../db/research-repository.js";
import type { SqliteJobRunner } from "../jobs/sqlite-job-runner.js";

export const RESEARCH_LENS_JOB = "research.lens.v1";

export interface ResearchLensJobInput {
  lensRunId: string;
  planId: string;
}

export class StartLensRunError extends Error {
  readonly name = "StartLensRunError";
  constructor(readonly code: "RESEARCH_PLAN_NOT_FOUND" | "RESEARCH_PLAN_MISMATCH" | "LENS_RUN_EXISTS") {
    super(code);
  }
}

interface Dependencies {
  database: SqliteDatabase;
  clock: Clock;
  idFactory: IdFactory;
  jobs: SqliteJobRunner;
  research: SqliteResearchRepository;
}

export function createStartLensRunService(dependencies: Dependencies) {
  return (input: { ideaId: string; lens: LensKind; planId: string }): LensRun => {
    const plan = dependencies.research.getPlan(input.planId);
    if (!plan) throw new StartLensRunError("RESEARCH_PLAN_NOT_FOUND");
    if (plan.key.ideaId !== input.ideaId || plan.key.lens !== input.lens) {
      throw new StartLensRunError("RESEARCH_PLAN_MISMATCH");
    }
    const now = dependencies.clock.now();
    return dependencies.database.transaction(() => {
      if (dependencies.research.getRunForPlan(plan.id)) throw new StartLensRunError("LENS_RUN_EXISTS");
      const runId = dependencies.idFactory.next("lens_run");
      const job = dependencies.jobs.enqueue({
        kind: RESEARCH_LENS_JOB,
        payload: { lensRunId: runId, planId: plan.id } satisfies ResearchLensJobInput,
      });
      return dependencies.research.createRun({
        id: runId,
        planId: plan.id,
        key: plan.key,
        status: "queued",
        stage: "planning",
        runtimeLabel: plan.runtimeLabel,
        jobId: job.id,
        now,
      });
    }).immediate();
  };
}

export type StartLensRun = ReturnType<typeof createStartLensRunService>;
