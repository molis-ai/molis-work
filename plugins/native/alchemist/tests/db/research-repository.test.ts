// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { buildLensCompatibilityKey, marketLensCompatibilityKey } from "../../src/studio/domain/research/lens.js";
import { migrate } from "../../src/studio/server/db/migrate.js";
import { openDatabase, type SqliteDatabase } from "../../src/studio/server/db/open-database.js";
import { SqliteResearchRepository } from "../../src/studio/server/db/research-repository.js";
import { seedResearchIdea } from "./helpers/seed-research-idea.js";
import { createTempDatabase, type TempDatabase } from "./helpers/temp-database.js";

let database: SqliteDatabase | undefined;
let temporary: TempDatabase | undefined;

afterEach(() => {
  database?.close();
  temporary?.cleanup();
});

describe("SQLite Research repository", () => {
  it("creates one initial MVP scope for an IdeaVersion", () => {
    const repository = setup();
    const first = repository.ensureMvpScope({
      id: "scope-01",
      ideaId: "idea-01",
      ideaVersion: 1,
      actorId: "actor-local",
      inScope: ["假设清单"],
      outOfScope: ["自动投放"],
      now: "2026-07-31T10:01:00.000Z",
    });
    const repeated = repository.ensureMvpScope({
      id: "scope-unused",
      ideaId: "idea-01",
      ideaVersion: 1,
      actorId: "actor-local",
      inScope: ["不应覆盖"],
      outOfScope: [],
      now: "2026-07-31T10:02:00.000Z",
    });

    expect(first).toEqual(repeated);
    expect(first).toMatchObject({ id: "scope-01", version: 1, ideaVersion: 1 });
  });

  it("round-trips plans, runs, Evidence and Claims with the exact compatibility key", () => {
    const repository = setup();
    repository.createPlan({
      id: "plan-market-01",
      key: marketLensCompatibilityKey("idea-01", 1),
      scopeSummary: "验证需求与竞争",
      appliedPlaybookRuleIds: [],
      modelPolicy: "auto",
      modelId: "fixture-research-v1",
      runtimeLabel: "演示运行时",
      estimatedDuration: { minMinutes: 1, maxMinutes: 2 },
      budget: { kind: "calls", limit: 8 },
      createdAt: "2026-07-31T10:01:00.000Z",
    });
    seedJob(database as SqliteDatabase, "job-market-01");
    repository.createRun({
      id: "run-market-01",
      planId: "plan-market-01",
      key: marketLensCompatibilityKey("idea-01", 1),
      status: "queued",
      stage: "planning",
      runtimeLabel: "演示运行时",
      jobId: "job-market-01",
      now: "2026-07-31T10:02:00.000Z",
    });

    repository.saveReport({
      report: {
        id: "report-market-01",
        runId: "run-market-01",
        revision: 1,
        key: marketLensCompatibilityKey("idea-01", 1),
        status: "completed",
        runtimeLabel: "演示运行时",
        summary: "需求存在，但切入需要更窄。",
        judgments: [
          {
            id: "claim-demand",
            label: "需求强度",
            status: "supported",
            conclusion: "用户正在付出时间处理这个问题。",
            rationale: "两个独立信号指向同一人工流程。",
            supportingEvidenceIds: ["evidence-01"],
            counterEvidenceIds: [],
            unknowns: ["是否愿意换工具"],
            changeConditions: ["目标用户没有重复使用场景"],
          },
        ],
        createdAt: "2026-07-31T10:05:00.000Z",
      },
      evidence: [
        {
          id: "evidence-01",
          sourceId: "fixture-user-signal",
          sourceType: "user_signal",
          title: "用户反复整理假设",
          url: "fixture://research/user-signal",
          excerpt: "每次验证都重新整理同一份假设表。",
          capturedAt: "2026-07-31T10:03:00.000Z",
          contentHash: "sha256:fixture-01",
        },
      ],
    });

    expect(repository.getLatestReport(marketLensCompatibilityKey("idea-01", 1))).toMatchObject({
      id: "report-market-01",
      judgments: [{ id: "claim-demand", supportingEvidenceIds: ["evidence-01"] }],
    });
    expect(repository.listEvidence("report-market-01")).toHaveLength(1);
    expect(repository.getLatestReport(buildLensCompatibilityKey("idea-01", 1, 1))).toBeUndefined();
  });
});

function setup(): SqliteResearchRepository {
  temporary = createTempDatabase();
  database = openDatabase(temporary.path);
  migrate(database);
  seedResearchIdea(database);
  return new SqliteResearchRepository(database);
}

function seedJob(db: SqliteDatabase, id: string): void {
  const now = "2026-07-31T10:02:00.000Z";
  db.prepare(
    `INSERT INTO jobs
     (id, kind, status, input_json, lease_owner, lease_expires_at, attempt,
      checkpoint_json, error_code, created_at, updated_at)
     VALUES (?, 'research.lens', 'queued', '{}', NULL, NULL, 0, NULL, NULL, ?, ?)`,
  ).run(id, now, now);
}
