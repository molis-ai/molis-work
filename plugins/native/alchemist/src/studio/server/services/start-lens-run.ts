import { alchemistStateErrors } from "../../errors.js";
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

interface Dependencies {
  database: SqliteDatabase;
  clock: Clock;
  idFactory: IdFactory;
  jobs: SqliteJobRunner;
  research: SqliteResearchRepository;
}

export function createStartLensRunService(dependencies: Dependencies) {
  return (input: { ideaId: string; lens: LensKind; planId: string }): LensRun => {
    const plan = dependencies.research.plans.getPlan(input.planId);
    if (!plan) throw alchemistStateErrors.research_plan_not_found("alchemist.research_plan_not_found");
    if (plan.key.ideaId !== input.ideaId || plan.key.lens !== input.lens) {
      throw alchemistStateErrors.research_plan_mismatch("alchemist.research_plan_mismatch");
    }
    const now = dependencies.clock.now();
    return dependencies.database.transaction(() => {
      if (dependencies.research.runs.getRunForPlan(plan.id)) throw alchemistStateErrors.lens_run_exists("alchemist.lens_run_exists");
      const runId = dependencies.idFactory.next("lens_run");
      const job = dependencies.jobs.enqueue({
        kind: RESEARCH_LENS_JOB,
        payload: { lensRunId: runId, planId: plan.id } satisfies ResearchLensJobInput,
      });
      return dependencies.research.runs.createRun({
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
