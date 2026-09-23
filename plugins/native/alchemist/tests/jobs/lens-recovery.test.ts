// @vitest-environment node

import { expect, it } from "vitest";
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
import {
  FixtureResearchRuntimeAdapter,
  type LensExecutionCheckpoint,
} from "../../src/studio/server/runtime/fixture-research-runtime.js";
import { createStartLensRunService } from "../../src/studio/server/services/start-lens-run.js";
import { seedResearchIdea } from "../db/helpers/seed-research-idea.js";
import { createTempDatabase } from "../db/helpers/temp-database.js";

it("resumes a Lens from its last safe evidence checkpoint after process restart", async () => {
  const temporary = createTempDatabase();
  let database = openDatabase(temporary.path);
  try {
    migrate(database);
    seedResearchIdea(database);
    const clock = new MutableClock("2026-07-31T10:00:00.000Z");
    let sequence = 0;
    const idFactory = { next: (prefix: string) => `${prefix}-recovery-${++sequence}` };
    let research = new SqliteResearchRepository(database);
    research.createPlan({
      id: "plan-market",
      key: marketLensCompatibilityKey("idea-01", 1),
      scopeSummary: "验证需求与竞争",
      appliedPlaybookRuleIds: [],
      modelPolicy: "auto",
      modelId: "fixture-research-v1",
      runtimeLabel: "演示运行时",
      estimatedDuration: { minMinutes: 1, maxMinutes: 2 },
      budget: { kind: "calls", limit: 8 },
      createdAt: clock.now(),
    });
    const before = new SqliteJobRunner(database, {
      workerId: "worker-before",
      clock,
      idFactory,
      leaseMs: 1_000,
    });
    const run = createStartLensRunService({ database, clock, idFactory, jobs: before, research })({
      ideaId: "idea-01",
      lens: "market_space",
      planId: "plan-market",
    });
    expect(before.claimNext()?.id).toBe(run.jobId);
    const ideaVersion = new SqliteIdeaRepository(database).getVersion("idea-01", 1);
    const plan = research.getPlan("plan-market");
    if (!ideaVersion || !plan) throw new Error("TEST_FIXTURE_INCOMPLETE");
    const executionRuntime = new FixtureResearchRuntimeAdapter();
    const evidence = await executionRuntime.collect({ plan, ideaVersion, idFactory, now: clock.now() });
    const checkpoint: LensExecutionCheckpoint = { stage: "collecting_complete", evidence };
    before.saveCheckpoint(run.jobId, checkpoint, {
      type: "stage_completed",
      payload: { stage: "collecting" },
    });
    research.updateRun(run.id, { status: "running", stage: "cross_checking", now: clock.now() });

    database.close();
    clock.set("2026-07-31T10:00:02.000Z");
    database = openDatabase(temporary.path);
    migrate(database);
    research = new SqliteResearchRepository(database);
    const after = new SqliteJobRunner(database, {
      workerId: "worker-after",
      clock,
      idFactory,
      leaseMs: 1_000,
    });
    expect(after.recoverExpired()).toBe(1);
    const worker = new LocalWorker(
      after,
      createJobHandlers({
        explorations: new SqliteExplorationRepository(database),
        runtime: new FixtureAiRuntimeAdapter(),
        idFactory,
        clock,
        research: {
          repository: research,
          ideas: new SqliteIdeaRepository(database),
          runtime: executionRuntime,
        },
      }),
    );

    await worker.runNext();

    expect(research.getRun(run.id)?.status).toBe("completed");
    expect(
      research.listEvidence(research.getLatestReport(marketLensCompatibilityKey("idea-01", 1))?.id ?? ""),
    ).toHaveLength(evidence.length);
    expect(after.listEvents(run.jobId).filter((event) => event.type === "stage_completed")).toHaveLength(3);
  } finally {
    database.close();
    temporary.cleanup();
  }
});

class MutableClock {
  constructor(private value: string) {}
  now() {
    return this.value;
  }
  set(value: string) {
    this.value = value;
  }
}
