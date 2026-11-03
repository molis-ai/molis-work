import { acceptTestJob } from "../fixtures/job-authority.js";
// @vitest-environment node

import { expect, it } from "vitest";
import type { SourcePort } from "../../src/studio/domain/discovery/source.js";
import { SqliteExplorationRepository } from "../../src/studio/server/db/exploration-repository.js";
import { applyStudioBaseline } from "../../src/studio/server/db/schema.js";
import { openDatabase } from "../../src/studio/server/db/open-database.js";
import { SqlitePulseRepository } from "../../src/studio/server/db/pulse-repository.js";
import { createJobHandlers } from "../../src/studio/server/jobs/job-handlers.js";
import { LocalWorker } from "../../src/studio/server/jobs/local-worker.js";
import { SqliteJobRunner } from "../../src/studio/server/jobs/sqlite-job-runner.js";
import { FixtureAiRuntimeAdapter } from "../../src/studio/server/runtime/fixture-ai-runtime.js";
import { RuleBasedPulseSynthesizer } from "../../src/studio/server/runtime/pulse-synthesizer.js";
import { createStartPulseRunService } from "../../src/studio/server/services/start-pulse-run.js";
import { seedResearchIdea } from "../db/helpers/seed-research-idea.js";
import { createTempDatabase } from "../db/helpers/temp-database.js";

it("resumes Pulse after a collected source without fetching that source twice", async () => {
  const temporary = createTempDatabase();
  let database = openDatabase(temporary.path);
  try {
    applyStudioBaseline(database, ":memory:");
    seedResearchIdea(database);
    const clock = new MutableClock("2026-07-31T10:00:00.000Z");
    let sequence = 0;
    const idFactory = { next: (prefix: string) => `${prefix}-recovery-${++sequence}` };
    let pulse = new SqlitePulseRepository(database);
    pulse.sources.ensureDefaultSourceSettings(clock.now());
    const before = new SqliteJobRunner(database, {
      workerId: "pulse-before",
      clock,
      idFactory,
      leaseMs: 1_000,
    });
    const run = createStartPulseRunService({
      database,
      pulse,
      jobs: before,
      idFactory,
      clock,
      workspaceId: "workspace-local",
    })({ sourceIds: ["watcha", "github"] });
    expect(before.claim(run.jobId)?.id).toBe(run.jobId);
    pulse.sources.saveSourceCollection(run.id, "fetch-watcha", {
      sourceId: "watcha",
      status: "completed",
      requestUrl: "https://watcha.cn/api/v2/hot/products",
      fetchedAt: clock.now(),
      signals: [
        {
          id: "signal-watcha",
          sourceId: "watcha",
          title: "可编辑内容成品",
          url: "https://watcha.cn/products/example",
          summary: "直接交付成品。",
          observedAt: clock.now(),
          categories: ["内容"],
          nativeMetrics: [],
          supports: ["供给变化"],
          cannotProve: ["需求"],
        },
      ],
    });
    before.saveCheckpoint(run.jobId, { stage: "collecting", completedSourceIds: ["watcha"] });
    pulse.runs.updateRun(run.id, { status: "running", stage: "collecting", now: clock.now() });

    database.close();
    clock.set("2026-07-31T10:00:02.000Z");
    database = openDatabase(temporary.path);
    applyStudioBaseline(database, ":memory:");
    pulse = new SqlitePulseRepository(database);
    const after = new SqliteJobRunner(database, {
      workerId: "pulse-after",
      clock,
      idFactory,
      leaseMs: 1_000,
    });
    expect(after.get(run.jobId)?.status).toBe("running");
    let watchaCalls = 0;
    const sources: SourcePort[] = [
      {
        sourceId: "watcha",
        collect: async () => {
          watchaCalls += 1;
          throw new Error("already collected");
        },
      },
      {
        sourceId: "github",
        collect: async () => ({
          sourceId: "github",
          status: "completed",
          requestUrl: "https://api.github.com/search/repositories",
          fetchedAt: clock.now(),
          signals: [
            {
              id: "signal-github",
              sourceId: "github",
              title: "agent workflow",
              url: "https://github.com/example/workflow",
              summary: "构建 Agent 工作流。",
              observedAt: clock.now(),
              categories: ["workflow"],
              nativeMetrics: [],
              supports: ["供给变化"],
              cannotProve: ["需求"],
            },
          ],
        }),
      },
    ];
    const worker = new LocalWorker(
      after,
      createJobHandlers({
        explorations: new SqliteExplorationRepository(database),
        runtime: new FixtureAiRuntimeAdapter(),
        idFactory,
        clock,
        pulse: { repository: pulse, sources, synthesizer: new RuleBasedPulseSynthesizer() },
      }),
    );

    expect(await worker.runNext()).toBe(false);
    acceptTestJob(worker, run.jobId);
    await worker.runNext();

    expect(watchaCalls).toBe(0);
    expect(pulse.sources.listSourceCollections(run.id)).toHaveLength(2);
    expect(pulse.runs.getRun(run.id)?.status).toBe("completed");
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

for (const fail of [false, true]) it(`W5-01-ALC-RES03 W5-01-ALC-RES07: revoked Pulse late ${fail ? "failure" : "success"} never records a source or advances`, async () => {
  const temporary = createTempDatabase(), database = openDatabase(temporary.path);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  try {
    applyStudioBaseline(database, ":memory:"); seedResearchIdea(database);
    const clock = { now: () => new Date().toISOString() }, idFactory = { next: (prefix: string) => `${prefix}-${crypto.randomUUID()}` };
    const pulse = new SqlitePulseRepository(database); pulse.sources.ensureDefaultSourceSettings(clock.now());
    const jobs = new SqliteJobRunner(database, { workerId: "current-pulse", clock, idFactory });
    const run = createStartPulseRunService({ database, pulse, jobs, idFactory, clock, workspaceId: "workspace-local" })({ sourceIds: ["watcha", "github"] });
    let laterCalls = 0;
    const sources: SourcePort[] = [{ sourceId: "watcha", async collect() {
      entered.resolve(); await release.promise;
      if (fail) throw new Error("Source returned too late");
      return { sourceId: "watcha", status: "completed", requestUrl: "https://watcha.cn/api/v2/hot/products", fetchedAt: clock.now(), signals: [] };
    } }, { sourceId: "github", async collect() { laterCalls++; throw new Error("A revoked task cannot fetch another source"); } }];
    const worker = new LocalWorker(jobs, createJobHandlers({ explorations: new SqliteExplorationRepository(database), runtime: new FixtureAiRuntimeAdapter(),
      idFactory, clock, pulse: { repository: pulse, sources, synthesizer: new RuleBasedPulseSynthesizer() } }));
    const accepted = acceptTestJob(worker, run.jobId), work = worker.runNext();
    await entered.promise; accepted.revoke();
    const facts = () => ["jobs", "job_events", "pulse_runs", "source_fetches", "supply_signals", "pulse_reports", "activity_events"]
      .map(table => database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const before = facts(); release.resolve(); await work;
    expect(facts()).toEqual(before); expect(laterCalls).toBe(0);
  } finally { release.resolve(); database.close(); temporary.cleanup(); }
});
