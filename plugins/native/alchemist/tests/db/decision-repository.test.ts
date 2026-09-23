// @vitest-environment node

import { afterEach, expect, it } from "vitest";
import { createDecision } from "../../src/studio/domain/decision/decision.js";
import { buildLensCompatibilityKey, marketLensCompatibilityKey } from "../../src/studio/domain/research/lens.js";
import type { LensReport } from "../../src/studio/domain/research/report.js";
import { SqliteDecisionRepository } from "../../src/studio/server/db/decision-repository.js";
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

it("persists a frozen Decision and updates the Idea lifecycle atomically", () => {
  temporary = createTempDatabase();
  database = openDatabase(temporary.path);
  migrate(database);
  seedResearchIdea(database);
  const research = new SqliteResearchRepository(database);
  seedMinimalReport(database, research, marketReport());
  seedMinimalReport(database, research, costReport());
  const decision = createDecision({
    id: "decision-01",
    ideaId: "idea-01",
    ideaVersion: 1,
    mvpScopeVersion: 1,
    outcome: "hold",
    reason: "先验证付费意愿",
    revisitCondition: "出现 5 位愿意付费的访谈对象时回看",
    sourceKind: "direct",
    actorId: "actor-local",
    now: "2026-07-31T11:00:00.000Z",
    marketReport: marketReport(),
    costReport: costReport(),
  });

  const decisions = new SqliteDecisionRepository(database);
  decisions.create(decision);

  expect(decisions.get("decision-01")).toEqual(decision);
  expect(database.prepare("SELECT lifecycle FROM ideas WHERE id = 'idea-01'").get()).toEqual({
    lifecycle: "hold",
  });
});

function marketReport(): LensReport {
  return {
    id: "report-market",
    runId: "run-market",
    revision: 1,
    key: marketLensCompatibilityKey("idea-01", 1),
    status: "completed",
    runtimeLabel: "演示运行时",
    summary: "有条件成立",
    judgments: [],
    createdAt: "2026-07-31T10:30:00.000Z",
  };
}

function costReport(): LensReport {
  return {
    id: "report-cost",
    runId: "run-cost",
    revision: 1,
    key: buildLensCompatibilityKey("idea-01", 1, 1),
    status: "completed",
    runtimeLabel: "演示运行时",
    summary: "工作量可控",
    judgments: [],
    createdAt: "2026-07-31T10:31:00.000Z",
  };
}

function seedMinimalReport(
  db: SqliteDatabase,
  repository: SqliteResearchRepository,
  report: LensReport,
): void {
  if (report.key.lens === "build_cost") {
    repository.ensureMvpScope({
      id: "scope-01",
      ideaId: "idea-01",
      ideaVersion: 1,
      actorId: "actor-local",
      inScope: ["假设清单"],
      outOfScope: [],
      now: "2026-07-31T10:01:00.000Z",
    });
  }
  repository.createPlan({
    id: `plan-${report.key.lens}`,
    key: report.key,
    scopeSummary: "范围",
    appliedPlaybookRuleIds: [],
    modelPolicy: "auto",
    modelId: "fixture-research-v1",
    runtimeLabel: "演示运行时",
    estimatedDuration: { minMinutes: 1, maxMinutes: 2 },
    budget: { kind: "calls", limit: 8 },
    createdAt: "2026-07-31T10:02:00.000Z",
  });
  const jobId = `job-${report.key.lens}`;
  db.prepare(
    `INSERT INTO jobs
     (id, kind, status, input_json, lease_owner, lease_expires_at, attempt,
      checkpoint_json, error_code, created_at, updated_at)
     VALUES (?, 'research.lens', 'completed', '{}', NULL, NULL, 1, NULL, NULL, ?, ?)`,
  ).run(jobId, report.createdAt, report.createdAt);
  repository.createRun({
    id: report.runId,
    planId: `plan-${report.key.lens}`,
    key: report.key,
    status: "completed",
    stage: "synthesizing",
    runtimeLabel: report.runtimeLabel,
    jobId,
    now: report.createdAt,
  });
  repository.saveReport({ report, evidence: [] });
}
