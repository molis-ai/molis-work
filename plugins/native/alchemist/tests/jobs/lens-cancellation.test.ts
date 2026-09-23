// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { marketLensCompatibilityKey } from "../../src/studio/domain/research/lens.js";
import { SqliteExplorationRepository } from "../../src/studio/server/db/exploration-repository.js";
import { SqliteIdeaRepository } from "../../src/studio/server/db/idea-repository.js";
import { migrate } from "../../src/studio/server/db/migrate.js";
import { openDatabase } from "../../src/studio/server/db/open-database.js";
import { SqliteResearchRepository } from "../../src/studio/server/db/research-repository.js";
import { createJobHandlers } from "../../src/studio/server/jobs/job-handlers.js";
import { LocalWorker } from "../../src/studio/server/jobs/local-worker.js";
import { SqliteJobRunner } from "../../src/studio/server/jobs/sqlite-job-runner.js";
import { FixtureAiRuntimeAdapter } from "../../src/studio/server/runtime/fixture-ai-runtime.js";
import { FixtureResearchRuntimeAdapter } from "../../src/studio/server/runtime/fixture-research-runtime.js";
import { createCancelLensRunService } from "../../src/studio/server/services/cancel-lens-run.js";
import { createStartLensRunService } from "../../src/studio/server/services/start-lens-run.js";
import { seedResearchIdea } from "../db/helpers/seed-research-idea.js";
import { createTempDatabase } from "../db/helpers/temp-database.js";

describe("Lens cancellation", () => {
  it("lets the in-flight call return but never starts the next provider call", async () => {
    const temp = createTempDatabase();
    const database = openDatabase(temp.path);
    try {
      migrate(database);
      seedResearchIdea(database);
      const now = "2026-07-31T10:00:00.000Z";
      const clock = { now: () => now };
      let sequence = 0;
      const idFactory = { next: (prefix: string) => `${prefix}-cancel-${++sequence}` };
      const research = new SqliteResearchRepository(database);
      research.createPlan({
        id: "plan-cancel",
        key: marketLensCompatibilityKey("idea-01", 1),
        scopeSummary: "验证市场空间",
        modelPolicy: "auto",
        modelId: "fixture-research-v1",
        runtimeLabel: "演示运行时",
        estimatedDuration: { minMinutes: 1, maxMinutes: 2 },
        budget: { kind: "calls", limit: 3 },
        appliedPlaybookRuleIds: [],
        createdAt: now,
      });
      const jobs = new SqliteJobRunner(database, { workerId: "cancel-worker", clock, idFactory });
      const fixtureRuntime = new FixtureResearchRuntimeAdapter();
      let releaseCollection: (() => void) | undefined;
      let collectionStarted: (() => void) | undefined;
      const started = new Promise<void>((resolve) => {
        collectionStarted = resolve;
      });
      const release = new Promise<void>((resolve) => {
        releaseCollection = resolve;
      });
      const runtime = {
        collect: vi.fn(async (...args: Parameters<FixtureResearchRuntimeAdapter["collect"]>) => {
          collectionStarted?.();
          await release;
          return fixtureRuntime.collect(...args);
        }),
        crossCheck: vi.spyOn(fixtureRuntime, "crossCheck"),
        synthesize: vi.spyOn(fixtureRuntime, "synthesize"),
      };
      const worker = new LocalWorker(
        jobs,
        createJobHandlers({
          explorations: new SqliteExplorationRepository(database),
          runtime: new FixtureAiRuntimeAdapter(),
          idFactory,
          clock,
          research: {
            repository: research,
            ideas: new SqliteIdeaRepository(database),
            runtime,
          },
        }),
      );
      const run = createStartLensRunService({ database, clock, idFactory, jobs, research })({
        ideaId: "idea-01",
        lens: "market_space",
        planId: "plan-cancel",
      });

      const running = worker.runNext();
      await started;
      createCancelLensRunService({ database, jobs, research, now: clock.now })(run.jobId);
      releaseCollection?.();
      await running;

      expect(runtime.collect).toHaveBeenCalledTimes(1);
      expect(runtime.crossCheck).not.toHaveBeenCalled();
      expect(runtime.synthesize).not.toHaveBeenCalled();
      expect(jobs.get(run.jobId)?.status).toBe("cancelled");
      expect(research.getRun(run.id)?.status).toBe("cancelled");
    } finally {
      database.close();
      temp.cleanup();
    }
  });
});
