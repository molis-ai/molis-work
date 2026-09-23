// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { marketLensCompatibilityKey } from "../../src/studio/domain/research/lens.js";
import { SqliteExplorationRepository } from "../../src/studio/server/db/exploration-repository.js";
import { SqliteIdeaRepository } from "../../src/studio/server/db/idea-repository.js";
import { migrate } from "../../src/studio/server/db/migrate.js";
import { openDatabase, type SqliteDatabase } from "../../src/studio/server/db/open-database.js";
import { SqliteResearchRepository } from "../../src/studio/server/db/research-repository.js";
import { createJobHandlers } from "../../src/studio/server/jobs/job-handlers.js";
import { LocalWorker } from "../../src/studio/server/jobs/local-worker.js";
import { SqliteJobRunner } from "../../src/studio/server/jobs/sqlite-job-runner.js";
import { FixtureAiRuntimeAdapter } from "../../src/studio/server/runtime/fixture-ai-runtime.js";
import { FixtureResearchRuntimeAdapter } from "../../src/studio/server/runtime/fixture-research-runtime.js";
import { createStartLensRunService } from "../../src/studio/server/services/start-lens-run.js";
import { seedResearchIdea } from "../db/helpers/seed-research-idea.js";
import { createTempDatabase, type TempDatabase } from "../db/helpers/temp-database.js";

let database: SqliteDatabase | undefined;
let temporary: TempDatabase | undefined;

afterEach(() => {
  database?.close();
  temporary?.cleanup();
});

describe("Lens worker", () => {
  it("advances through four persisted milestones and saves a validated report", async () => {
    const fixture = setup();
    const run = fixture.startLensRun({
      ideaId: "idea-01",
      lens: "market_space",
      planId: "plan-market",
    });

    await fixture.worker.runNext();

    expect(fixture.research.getRun(run.id)).toMatchObject({
      status: "completed",
      stage: "synthesizing",
    });
    expect(fixture.research.getLatestReport(marketLensCompatibilityKey("idea-01", 1))).toMatchObject({
      status: "completed",
      runtimeLabel: "演示运行时",
      judgments: [
        { label: "需求强度" },
        { label: "付出意愿" },
        { label: "竞争压力" },
        { label: "切入缝隙" },
        { label: "触达与时机" },
      ],
    });
    expect(
      fixture.jobs
        .listEvents(run.jobId)
        .filter((event) => event.type === "stage_completed")
        .map((event) => event.payload),
    ).toEqual([
      { stage: "planning" },
      { stage: "collecting" },
      { stage: "cross_checking" },
      { stage: "synthesizing" },
    ]);
  });

  it("stops at the confirmed one-call ceiling and saves an honest partial report", async () => {
    const fixture = setup(1);
    const run = fixture.startLensRun({
      ideaId: "idea-01",
      lens: "market_space",
      planId: "plan-market",
    });

    await fixture.worker.runNext();

    expect(fixture.runtime.collect).toHaveBeenCalledTimes(1);
    expect(fixture.runtime.crossCheck).not.toHaveBeenCalled();
    expect(fixture.runtime.synthesize).not.toHaveBeenCalled();
    const report = fixture.research.getLatestReport(marketLensCompatibilityKey("idea-01", 1));
    expect(report).toMatchObject({
      status: "partial",
      summary: expect.stringContaining("严格调用上限为 1"),
    });
    expect(report?.judgments.every((claim) => claim.status === "unknown")).toBe(true);
    expect(fixture.research.getRun(run.id)?.status).toBe("partial");
  });

  it("uses exactly two calls when the ceiling is two", async () => {
    const fixture = setup(2);
    fixture.startLensRun({ ideaId: "idea-01", lens: "market_space", planId: "plan-market" });

    await fixture.worker.runNext();

    expect(fixture.runtime.collect).toHaveBeenCalledTimes(1);
    expect(fixture.runtime.crossCheck).toHaveBeenCalledTimes(1);
    expect(fixture.runtime.synthesize).not.toHaveBeenCalled();
    expect(fixture.research.getLatestReport(marketLensCompatibilityKey("idea-01", 1))).toMatchObject({
      status: "partial",
      summary: expect.stringContaining("严格调用上限为 2"),
    });
  });
});

function setup(budgetLimit = 8) {
  temporary = createTempDatabase();
  database = openDatabase(temporary.path);
  migrate(database);
  seedResearchIdea(database);
  const now = "2026-07-31T10:00:00.000Z";
  let sequence = 0;
  const idFactory = { next: (prefix: string) => `${prefix}-lens-${++sequence}` };
  const clock = { now: () => now };
  const research = new SqliteResearchRepository(database);
  research.createPlan({
    id: "plan-market",
    key: marketLensCompatibilityKey("idea-01", 1),
    scopeSummary: "验证需求与竞争",
    appliedPlaybookRuleIds: [],
    modelPolicy: "auto",
    modelId: "fixture-research-v1",
    runtimeLabel: "演示运行时",
    estimatedDuration: { minMinutes: 1, maxMinutes: 2 },
    budget: { kind: "calls", limit: budgetLimit },
    createdAt: now,
  });
  const jobs = new SqliteJobRunner(database, { workerId: "lens-worker", clock, idFactory });
  const ideas = new SqliteIdeaRepository(database);
  const executionRuntime = new FixtureResearchRuntimeAdapter();
  const runtime = {
    collect: vi.spyOn(executionRuntime, "collect"),
    crossCheck: vi.spyOn(executionRuntime, "crossCheck"),
    synthesize: vi.spyOn(executionRuntime, "synthesize"),
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
        ideas,
        runtime,
      },
    }),
  );
  return {
    research,
    jobs,
    worker,
    runtime,
    startLensRun: createStartLensRunService({ database, clock, idFactory, jobs, research }),
  };
}
