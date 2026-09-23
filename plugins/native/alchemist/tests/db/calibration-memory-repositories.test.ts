// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import type { ActionProposal, Annotation } from "../../src/studio/domain/calibration/calibration.js";
import type { PlaybookRule, TasteRule } from "../../src/studio/domain/memory/rules.js";
import { SqliteActivityRepository } from "../../src/studio/server/db/activity-repository.js";
import { SqliteCalibrationRepository } from "../../src/studio/server/db/calibration-repository.js";
import { SqliteMemoryRepository } from "../../src/studio/server/db/memory-repository.js";
import { migrate } from "../../src/studio/server/db/migrate.js";
import { openDatabase, type SqliteDatabase } from "../../src/studio/server/db/open-database.js";
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

describe("calibration and Memory repositories", () => {
  it("round-trips a precise Annotation and an idempotent Action Proposal", () => {
    setup();
    const repository = new SqliteCalibrationRepository(database as SqliteDatabase);
    const annotation: Annotation = {
      id: "annotation-01",
      workspaceId: "workspace-local",
      actorId: "actor-local",
      target: {
        kind: "lens_report",
        objectId: "report-01",
        revision: 1,
        blockId: "claim-demand",
      },
      quotedSnapshot: "付出意愿仍然较弱。",
      comment: "持续的人力投入也应该算正向信号。",
      status: "open",
      createdAt: "2026-07-31T10:10:00.000Z",
    };
    repository.createAnnotation(annotation);
    expect(repository.listAnnotations(annotation.target)).toEqual([annotation]);

    const proposal: ActionProposal = {
      id: "proposal-01",
      workspaceId: "workspace-local",
      actorId: "actor-local",
      source: { kind: "annotation", id: annotation.id },
      action: "create_playbook_rule",
      target: annotation.target,
      summary: "校准付出意愿方法",
      diff: [{ field: "证据口径", before: "直接采购", after: "采购或持续人工投入" }],
      versionImpact: "影响后续研究",
      costImpact: "不立即产生调用",
      memoryImpact: "创建 Playbook Rule",
      status: "pending",
      createdAt: "2026-07-31T10:11:00.000Z",
    };
    repository.createProposal(proposal, { methodChange: "检查持续人工投入" });
    repository.markProposalApplied(proposal.id, "2026-07-31T10:12:00.000Z");
    expect(repository.getProposal(proposal.id)).toMatchObject({
      proposal: { status: "applied", appliedAt: "2026-07-31T10:12:00.000Z" },
      payload: { methodChange: "检查持续人工投入" },
    });
    expect(() => repository.markProposalApplied(proposal.id, "2026-07-31T10:13:00.000Z")).toThrowError(
      "ACTION_PROPOSAL_NOT_PENDING",
    );
  });

  it("keeps Taste and Playbook separate and records their applications", () => {
    setup();
    const repository = new SqliteMemoryRepository(database as SqliteDatabase);
    const now = "2026-07-31T10:20:00.000Z";
    const taste: TasteRule = {
      id: "taste-01",
      workspaceId: "workspace-local",
      actorId: "actor-local",
      version: 1,
      title: "偏好低运维",
      statement: "优先纯软件、低运维产品",
      appliesTo: "所有方向探索",
      exceptions: ["明确的高价值硬件机会"],
      source: { kind: "direct", id: "settings" },
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    const playbook: PlaybookRule = {
      id: "playbook-01",
      workspaceId: "workspace-local",
      actorId: "actor-local",
      version: 1,
      originalFeedback: "人工投入也能体现付出意愿",
      methodChange: "检查持续时间、人力和替代成本",
      positiveExamples: ["每周人工整理三小时"],
      negativeExamples: ["一次点赞"],
      scope: { kind: "direction", directionId: "direction-01" },
      source: { kind: "annotation", id: "annotation-01" },
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    repository.createTasteRule(taste);
    repository.createPlaybookRule(playbook);

    expect(repository.listTasteRules("workspace-local")).toEqual([taste]);
    expect(repository.listPlaybookRules("workspace-local")).toEqual([playbook]);
    expect(
      repository.listApplicablePlaybookRules({
        workspaceId: "workspace-local",
        reportId: "report-other",
        directionId: "direction-01",
      }),
    ).toEqual([playbook]);

    seedResearchPlan(database as SqliteDatabase);
    repository.recordPlaybookApplication({
      id: "application-01",
      ruleId: playbook.id,
      planId: "plan-01",
      appliedAt: "2026-07-31T10:21:00.000Z",
    });
    expect(repository.listApplications(playbook.id)).toEqual([
      {
        id: "application-01",
        ruleId: playbook.id,
        planId: "plan-01",
        appliedAt: "2026-07-31T10:21:00.000Z",
      },
    ]);
  });

  it("lists only durable activity and never invents browsing events", () => {
    setup();
    const repository = new SqliteActivityRepository(database as SqliteDatabase);
    repository.create({
      id: "activity-01",
      workspaceId: "workspace-local",
      kind: "memory.playbook_created",
      targetKind: "playbook_rule",
      targetId: "playbook-01",
      payload: { scope: "direction" },
      createdAt: "2026-07-31T10:30:00.000Z",
    });
    expect(repository.list("workspace-local")).toEqual([
      {
        id: "activity-01",
        workspaceId: "workspace-local",
        kind: "memory.playbook_created",
        targetKind: "playbook_rule",
        targetId: "playbook-01",
        payload: { scope: "direction" },
        createdAt: "2026-07-31T10:30:00.000Z",
      },
    ]);
  });
});

function setup(): void {
  temporary = createTempDatabase();
  database = openDatabase(temporary.path);
  migrate(database);
  seedResearchIdea(database);
}

function seedResearchPlan(db: SqliteDatabase): void {
  db.prepare(
    `INSERT INTO research_plans
     (id, idea_id, idea_version, mvp_scope_version, lens, scope_summary, model_policy,
      model_id, runtime_label, estimated_min_minutes, estimated_max_minutes,
      budget_kind, budget_limit, budget_currency, created_at)
     VALUES ('plan-01', 'idea-01', 1, NULL, 'market_space', '验证市场空间', 'auto',
      'fixture-research-v1', '演示运行时', 1, 2, 'calls', 4, NULL, '2026-07-31T10:20:00.000Z')`,
  ).run();
}
