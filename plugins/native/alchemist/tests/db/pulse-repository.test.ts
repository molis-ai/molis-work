// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "../../src/studio/server/db/migrate.js";
import { openDatabase, type SqliteDatabase } from "../../src/studio/server/db/open-database.js";
import { SqlitePulseRepository } from "../../src/studio/server/db/pulse-repository.js";
import { seedResearchIdea } from "./helpers/seed-research-idea.js";
import { createTempDatabase, type TempDatabase } from "./helpers/temp-database.js";

let database: SqliteDatabase | undefined;
let temporary: TempDatabase | undefined;

afterEach(() => {
  database?.close();
  temporary?.cleanup();
  database = undefined;
  temporary = undefined;
});

describe("SQLite Pulse repository", () => {
  it("persists source settings and a resumable run", () => {
    const repository = setup();
    expect(repository.listSourceSettings().map((item) => item.sourceId)).toEqual([
      "toolify",
      "watcha",
      "github",
    ]);
    repository.updateSourceSetting("watcha", false, "2026-07-31T10:01:00.000Z");
    expect(repository.listSourceSettings().find((item) => item.sourceId === "watcha")?.enabled).toBe(false);

    seedJob(database as SqliteDatabase, "job-pulse-01");
    const run = repository.createRun({
      id: "pulse-run-01",
      workspaceId: "workspace-local",
      status: "queued",
      stage: "planning",
      sourceIds: ["toolify", "github"],
      runtimeLabel: "真实公开来源 · 规则综合",
      jobId: "job-pulse-01",
      now: "2026-07-31T10:02:00.000Z",
    });

    expect(repository.getRun(run.id)).toEqual(run);
  });

  it("round-trips source fetches, signals, report, and opportunity relationships idempotently", () => {
    const repository = setup();
    seedJob(database as SqliteDatabase, "job-pulse-01");
    repository.createRun({
      id: "pulse-run-01",
      workspaceId: "workspace-local",
      status: "running",
      stage: "collecting",
      sourceIds: ["toolify", "watcha"],
      runtimeLabel: "真实公开来源 · 规则综合",
      jobId: "job-pulse-01",
      now: "2026-07-31T10:02:00.000Z",
    });
    const result = {
      sourceId: "toolify" as const,
      status: "completed" as const,
      requestUrl: "https://www.toolify.ai/Best-trending-AI-Tools",
      fetchedAt: "2026-07-31T10:03:00.000Z",
      httpStatus: 200,
      contentHash: "sha256:toolify",
      signals: [
        {
          id: "signal-01",
          sourceId: "toolify" as const,
          title: "Workflow Artifact Builder",
          url: "https://example.com/workflow",
          summary: "从对话转向直接交付可编辑成果。",
          observedAt: "2026-07-31T10:03:00.000Z",
          categories: ["productivity"],
          nativeMetrics: [
            {
              name: "monthly_visits",
              label: "Toolify 估算月访问",
              value: 120000,
              unit: "visits" as const,
              observedAt: "2026-07-31T10:03:00.000Z",
              definition: "Toolify 页面展示的第三方估算值",
            },
          ],
          supports: ["目录内注意力变化"],
          cannotProve: ["真实采用", "收入"],
        },
      ],
    };
    repository.saveSourceCollection("pulse-run-01", "fetch-01", result);
    repository.saveSourceCollection("pulse-run-01", "fetch-unused", result);
    repository.saveReport({
      report: {
        id: "pulse-report-01",
        runId: "pulse-run-01",
        revision: 1,
        status: "partial",
        title: "市场供给脉搏 · 2026-07-31",
        summary: "带交付物的窄工作流正在增多。",
        periodStart: "2026-07-24T00:00:00.000Z",
        periodEnd: "2026-07-31T10:04:00.000Z",
        runtimeLabel: "真实公开来源 · 规则综合",
        successfulSourceIds: ["toolify"],
        failedSourceIds: ["watcha"],
        coverageGaps: ["观猹抓取失败"],
        findings: [
          {
            id: "finding-01",
            title: "交付物导向产品增多",
            fact: "观察到多个产品直接生成可编辑成果。",
            whyItMatters: "用户价值从回答迁移到完成任务。",
            demandInference: "可能存在缩短交付路径的需求，尚待验证。",
            counterSignals: ["可能只是模型同质化"],
            unknowns: ["重复使用是否成立"],
            sourceSignalIds: ["signal-01"],
          },
        ],
        createdAt: "2026-07-31T10:04:00.000Z",
      },
      opportunities: [
        {
          id: "opportunity-01",
          reportId: "pulse-report-01",
          title: "为窄工作流交付可编辑成果",
          highlight: "不止回答问题，而是交付下一步可直接使用的东西。",
          rationale: "近期供给重复出现这一机制。",
          demandInference: "可能减少任务切换与返工，尚待验证。",
          counterSignals: ["大模型原生能力可能快速覆盖"],
          unknowns: ["谁会持续付费"],
          sourceSignalIds: ["signal-01"],
          status: "new",
          createdAt: "2026-07-31T10:04:00.000Z",
        },
      ],
    });
    repository.saveReport({
      report: repository.getReport("pulse-report-01") as NonNullable<
        ReturnType<SqlitePulseRepository["getReport"]>
      >,
      opportunities: repository.listOpportunities("pulse-report-01"),
    });

    expect(repository.listSourceCollections("pulse-run-01")).toHaveLength(1);
    expect(repository.getReport("pulse-report-01")).toMatchObject({
      findings: [{ sourceSignalIds: ["signal-01"] }],
    });
    expect(repository.listOpportunities("pulse-report-01")).toMatchObject([
      { id: "opportunity-01", sourceSignalIds: ["signal-01"], status: "new" },
    ]);
  });

  it("keeps a repeated external signal as a separate snapshot in each Pulse run", () => {
    const repository = setup();
    for (const index of [1, 2]) {
      seedJob(database as SqliteDatabase, `job-pulse-0${index}`);
      repository.createRun({
        id: `pulse-run-0${index}`,
        workspaceId: "workspace-local",
        status: "running",
        stage: "collecting",
        sourceIds: ["github"],
        runtimeLabel: "真实公开来源 · 规则综合",
        jobId: `job-pulse-0${index}`,
        now: `2026-07-31T10:0${index}:00.000Z`,
      });
      repository.saveSourceCollection(`pulse-run-0${index}`, `fetch-0${index}`, {
        sourceId: "github",
        status: "completed",
        requestUrl: "https://api.github.com/search/repositories",
        fetchedAt: `2026-07-31T10:0${index}:30.000Z`,
        signals: [
          {
            id: "github:repeated-repository",
            sourceId: "github",
            title: "Repeated Repository",
            url: "https://github.com/example/repeated-repository",
            summary: "同一个公开产品可以连续出现在多期市场脉搏里。",
            observedAt: `2026-07-31T10:0${index}:30.000Z`,
            categories: ["agent"],
            nativeMetrics: [],
            supports: ["供给持续出现"],
            cannotProve: ["需求"],
          },
        ],
      });
    }

    const first = repository.listSignals("pulse-run-01");
    const second = repository.listSignals("pulse-run-02");
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0]?.id).not.toBe(first[0]?.id);
    expect(second[0]?.url).toBe(first[0]?.url);
  });
});

function setup(): SqlitePulseRepository {
  temporary = createTempDatabase();
  database = openDatabase(temporary.path);
  migrate(database);
  seedResearchIdea(database);
  const repository = new SqlitePulseRepository(database);
  repository.ensureDefaultSourceSettings("2026-07-31T10:00:00.000Z");
  return repository;
}

function seedJob(db: SqliteDatabase, id: string): void {
  const now = "2026-07-31T10:02:00.000Z";
  db.prepare(
    `INSERT INTO jobs
     (id, kind, status, input_json, lease_owner, lease_expires_at, attempt,
      checkpoint_json, error_code, created_at, updated_at)
     VALUES (?, 'discovery.pulse', 'queued', '{}', NULL, NULL, 0, NULL, NULL, ?, ?)`,
  ).run(id, now, now);
}
