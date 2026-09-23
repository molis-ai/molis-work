// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import type { SourcePort, SupplySignal } from "../../src/studio/domain/discovery/source.js";
import { SqliteExplorationRepository } from "../../src/studio/server/db/exploration-repository.js";
import { migrate } from "../../src/studio/server/db/migrate.js";
import { openDatabase, type SqliteDatabase } from "../../src/studio/server/db/open-database.js";
import { SqlitePulseRepository } from "../../src/studio/server/db/pulse-repository.js";
import { createJobHandlers } from "../../src/studio/server/jobs/job-handlers.js";
import { LocalWorker } from "../../src/studio/server/jobs/local-worker.js";
import { SqliteJobRunner } from "../../src/studio/server/jobs/sqlite-job-runner.js";
import { FixtureAiRuntimeAdapter } from "../../src/studio/server/runtime/fixture-ai-runtime.js";
import { RuleBasedPulseSynthesizer } from "../../src/studio/server/runtime/pulse-synthesizer.js";
import { createStartPulseRunService } from "../../src/studio/server/services/start-pulse-run.js";
import { seedResearchIdea } from "../db/helpers/seed-research-idea.js";
import { createTempDatabase, type TempDatabase } from "../db/helpers/temp-database.js";

let database: SqliteDatabase | undefined;
let temporary: TempDatabase | undefined;

afterEach(() => {
  database?.close();
  temporary?.cleanup();
});

describe("Market Pulse worker", () => {
  it("keeps a source failure visible and still produces a traceable partial report", async () => {
    const fixture = setup([
      completedSource("watcha", "AI 照片文案成品", ["图像生成", "内容"]),
      completedSource("github", "agent-workflow-builder", ["ai-agents", "workflow"]),
      {
        sourceId: "toolify",
        collect: async () => ({
          sourceId: "toolify",
          status: "error",
          requestUrl: "https://www.toolify.ai/Best-trending-AI-Tools",
          fetchedAt: "2026-07-31T10:03:00.000Z",
          errorCode: "SOURCE_CHALLENGE",
          signals: [],
        }),
      },
    ]);
    const run = fixture.start();

    await fixture.worker.runNext();

    expect(fixture.pulse.getRun(run.id)).toMatchObject({ status: "partial", stage: "synthesizing" });
    expect(fixture.pulse.listSourceCollections(run.id)).toHaveLength(3);
    expect(fixture.pulse.listReports()[0]).toMatchObject({
      status: "partial",
      successfulSourceIds: ["watcha", "github"],
      failedSourceIds: ["toolify"],
    });
    const opportunities = fixture.pulse.listOpportunities(fixture.pulse.listReports()[0]?.id);
    expect(opportunities.length).toBeGreaterThan(0);
    expect(opportunities.every((item) => item.sourceSignalIds.length > 0)).toBe(true);
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
});

function setup(sources: readonly SourcePort[]) {
  temporary = createTempDatabase();
  database = openDatabase(temporary.path);
  migrate(database);
  seedResearchIdea(database);
  const now = "2026-07-31T10:00:00.000Z";
  let sequence = 0;
  const idFactory = { next: (prefix: string) => `${prefix}-pulse-${++sequence}` };
  const clock = { now: () => now };
  const pulse = new SqlitePulseRepository(database);
  pulse.ensureDefaultSourceSettings(now);
  const jobs = new SqliteJobRunner(database, { workerId: "pulse-worker", clock, idFactory });
  const worker = new LocalWorker(
    jobs,
    createJobHandlers({
      explorations: new SqliteExplorationRepository(database),
      runtime: new FixtureAiRuntimeAdapter(),
      idFactory,
      clock,
      pulse: { repository: pulse, sources, synthesizer: new RuleBasedPulseSynthesizer() },
    }),
  );
  return {
    pulse,
    jobs,
    worker,
    start: createStartPulseRunService({
      database,
      pulse,
      jobs,
      idFactory,
      clock,
      workspaceId: "workspace-local",
    }),
  };
}

function completedSource(sourceId: "watcha" | "github", title: string, categories: string[]): SourcePort {
  return {
    sourceId,
    collect: async () => ({
      sourceId,
      status: "completed",
      requestUrl: `https://${sourceId}.example/source`,
      fetchedAt: "2026-07-31T10:03:00.000Z",
      httpStatus: 200,
      contentHash: `sha256:${sourceId}`,
      signals: [signal(sourceId, title, categories)],
    }),
  };
}

function signal(sourceId: "watcha" | "github", title: string, categories: string[]): SupplySignal {
  return {
    id: `signal-${sourceId}`,
    sourceId,
    title,
    url: `https://${sourceId}.example/product`,
    summary: "直接交付可以继续编辑的工作成果。",
    observedAt: "2026-07-31T10:03:00.000Z",
    categories,
    nativeMetrics: [],
    supports: ["供给变化"],
    cannotProve: ["需求", "收入"],
  };
}
