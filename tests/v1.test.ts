import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  MolisWorkCoordinator,
  MolisWorkV1Error,
  SqliteMolisWorkStore,
  importV3Board,
  type LegacyV3ImportInput,
} from "../apps/local-host/sdk/index.js";
import { main as runPublicCli } from "../apps/desktop/launchers/cli/main.js";
import {
  ProjectReferenceError,
  readProjectReference,
  validateEvidenceLocator,
} from "@molis-ai/molis-work-module-evidence-verification";
import { hostEventDecisionAuthority } from "@molis-ai/molis-work-plugin-goals";
import {
  insertHistoricalClaim,
  insertHistoricalClarificationSession,
  insertHistoricalEvidence,
  insertHistoricalRisk,
  insertHistoricalRun,
} from "./historical-sql-fixture.js";

const execFileAsync = promisify(execFile);

function fixture(start = "2026-08-15T00:00:00.000Z") {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-v1-"));
  let now = new Date(start);
  const store = new SqliteMolisWorkStore(join(directory, "molis-work.db"));
  const coordinator = new MolisWorkCoordinator(store, () => now);
  coordinator.initializeBoard({
    board_id: "board-1",
    title: "产品目标",
    actor_id: "user-1",
    idempotency_key: "board-create",
  });
  return {
    store,
    coordinator,
    setNow(value: string) {
      now = new Date(value);
    },
  };
}

function createLeaf(
  coordinator: MolisWorkCoordinator,
  goalId: string,
  priority = 0,
) {
  return coordinator.goals.commands.createGoal(
    "board-1",
    {
      goal_id: goalId,
      title: `完成 ${goalId}`,
      outcome: `${goalId} 有可检查的完成结果`,
      why: "让下一步可以安全继续",
      business_logic: "先完成这一小段工作并证明结果，再允许依赖它的工作开始。",
      promised_outputs: [`${goalId} 有可检查的完成结果`],
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      priority,
      acceptance_criteria: [
        {
          criterion_id: `${goalId}-criterion`,
          statement: "目标结果存在",
          decision_method: "automated_check",
          pass_condition: "检查命令退出码为 0",
          required_evidence: ["test"],
        },
      ],
    },
    { actor_id: "user-1", idempotency_key: `create-${goalId}` },
  );
}

function currentTreeItem(input: {
  item_id: string;
  kind: "goal" | "relation";
  operation?: "create" | "update" | "deactivate";
  payload: Record<string, unknown>;
  reason?: string;
}) {
  return {
    item_id: input.item_id,
    kind: input.kind,
    operation: input.operation ?? "create",
    payload: input.payload,
    source_refs: ["runtime"],
    reason: input.reason ?? "当前树约束验收",
    confidence: 0.9,
  };
}

test("public CLI exposes install, service, demo, uninstall, and Molis Work V1 plus explicit V3 import", async () => {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => errors.push(args.map(String).join(" "));
  try {
    assert.equal(await runPublicCli(["--help"]), 0);
    assert.match(logs.join("\n"), /molis-work v1 <operation>/);
    assert.match(logs.join("\n"), /molis-work service/);
    assert.match(logs.join("\n"), /molis-work demo/);
    assert.match(logs.join("\n"), /molis-work uninstall/);
    assert.match(logs.join("\n"), /import-v3/);
    assert.doesNotMatch(logs.join("\n"), /profiles|strategy|coverage|handoff|replay/);
    assert.equal(await runPublicCli(["profiles"]), 1);
    assert.match(errors.join("\n"), /提供 install、service、demo、uninstall 和 v1/);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  const publicApi = await import("../apps/local-host/sdk/index.js");
  assert.deepEqual(Object.keys(publicApi).sort(), [
    "MolisWorkCoordinator",
    "MolisWorkV1Error",
    "SqliteMolisWorkStore",
    "importV3Board",
  ]);
});

test("fresh SQLite authority creates a usable board and reopens idempotently", () => {
  const { store } = fixture();
  const path = store.path;
  const tableCount = store.db
    .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'")
    .get() as { count: number };
  assert.ok(tableCount.count >= 15);
  assert.equal(store.db.pragma("foreign_keys", { simple: true }), 1);
  assert.equal(store.db.pragma("journal_mode", { simple: true }), "wal");
  store.db.exec(`
    DROP TABLE contract_proposals;
    DELETE FROM schema_migrations WHERE migration_id = 3;
    DROP TABLE clarification_turns;
    DROP TABLE clarification_sessions;
    DELETE FROM schema_migrations WHERE migration_id = 8;
    DROP TABLE goal_tree_proposal_decisions;
    DELETE FROM schema_migrations WHERE migration_id = 10;
    DROP TABLE goal_tree_proposal_items;
    DROP TABLE goal_tree_proposals;
    DELETE FROM schema_migrations WHERE migration_id = 9;
    DROP TABLE goal_trash_relation_records;
    DROP TABLE goal_trash_records;
    DELETE FROM schema_migrations WHERE migration_id = 11;
    ALTER TABLE risks DROP COLUMN treatment_plan;
    DELETE FROM schema_migrations WHERE migration_id = 15;
    ALTER TABLE goals DROP COLUMN decomposition_review_json;
    ALTER TABLE risks DROP COLUMN resolution_basis_json;
    DELETE FROM schema_migrations WHERE migration_id = 21;
    DROP TABLE evidence_corrections;
    DELETE FROM schema_migrations WHERE migration_id = 17;
    DROP TABLE project_guidance_revisions;
    DELETE FROM schema_migrations WHERE migration_id = 26;
    DROP TABLE project_guidance_entries;
    DELETE FROM schema_migrations WHERE migration_id = 25;
  `);
  store.close();

  const reopened = new SqliteMolisWorkStore(path);
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'contract_proposals'")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 3")
      .get(),
  );
  const goalColumns = reopened.db.pragma("table_info(goals)") as Array<{ name: string }>;
  assert.ok(goalColumns.some((column) => column.name === "archived_at"));
  assert.ok(goalColumns.some((column) => column.name === "archived_by"));
  assert.ok(goalColumns.some((column) => column.name === "trashed_at"));
  assert.ok(goalColumns.some((column) => column.name === "trashed_by"));
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 4")
      .get(),
  );
  const impactColumns = reopened.db.pragma("table_info(impact_bindings)") as Array<{ name: string }>;
  for (const column of ["updated_at", "deactivated_at", "deactivation_reason"]) {
    assert.ok(impactColumns.some((item) => item.name === column), `missing impact_bindings.${column}`);
  }
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 5")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 8")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'clarification_sessions'")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 9")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 11")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 12")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 13")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 14")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 15")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 17")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 18")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 19")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 20")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 21")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 22")
      .get(),
  );
  const evidenceColumns = reopened.db.pragma("table_info(evidence)") as Array<{ name: string }>;
  for (const column of ["locator_status", "locator_validation_reason", "locator_checked_at", "locator_workspace_id", "locator_workspace_root"]) {
    assert.ok(evidenceColumns.some((item) => item.name === column), `missing evidence.${column}`);
  }
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'evidence_corrections'")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'project_guidance_entries'")
      .get(),
  );
  assert.ok(reopened.db.prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 25").get());
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'project_guidance_revisions'")
      .get(),
  );
  assert.ok(reopened.db.prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 26").get());
  const riskColumns = reopened.db.pragma("table_info(risks)") as Array<{ name: string }>;
  assert.ok(riskColumns.some((column) => column.name === "treatment_plan"));
  assert.ok(riskColumns.some((column) => column.name === "resolution_basis_json"));
  assert.ok(goalColumns.some((column) => column.name === "decomposition_review_json"));
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'goal_trash_records'")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'goal_trash_relation_records'")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'goal_tree_proposal_items'")
      .get(),
  );
  const goalTreeProposalColumns = reopened.db.pragma("table_info(goal_tree_proposals)") as Array<{ name: string }>;
  assert.ok(goalTreeProposalColumns.some((column) => column.name === "narrative_json"));
  const goalTreeProposalItemColumns = reopened.db.pragma("table_info(goal_tree_proposal_items)") as Array<{ name: string }>;
  assert.ok(goalTreeProposalItemColumns.some((column) => column.name === "explanation_json"));
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 10")
      .get(),
  );
  assert.ok(
    reopened.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'goal_tree_proposal_decisions'")
      .get(),
  );
  assert.equal(reopened.snapshot("board-1").board.title, "产品目标");
  reopened.close();
});

test("project guidance is user-confirmed, deduplicated, and rendered as a stable prompt prefix", () => {
  const { store, coordinator } = fixture();
  assert.throws(
    () => coordinator.goals.commands.addProjectGuidance({
      board_id: "board-1",
      actor_id: "runtime-guidance",
      kind: "constraint",
      content: "所有发布 Goal 都必须验证升级路径。",
      reason: "跨 Goal 的发布底线",
      confirmation_summary: "尚未获得用户确认",
      user_confirmed: false,
      idempotency_key: "guidance-without-confirmation",
    }),
    (error: unknown) =>
      error instanceof MolisWorkV1Error && error.code === "project_guidance.user_confirmation_required",
  );
  const first = coordinator.goals.commands.addProjectGuidance({
    board_id: "board-1",
    actor_id: "user-1",
    kind: "constraint",
    content: "  所有发布 Goal 都必须验证升级路径。\r\n保留可复现记录。  ",
    source_refs: ["conversation://guidance", "conversation://guidance"],
    reason: "跨 Goal 的发布底线",
    confirmation_summary: "用户确认精确分类和原文",
    user_confirmed: true,
    idempotency_key: "guidance-first",
  });
  assert.equal(first.created, true);
  assert.equal(first.entry.position, 1);
  assert.equal(first.entry.content, "所有发布 Goal 都必须验证升级路径。\n保留可复现记录。");
  assert.deepEqual(first.entry.source_refs, ["conversation://guidance"]);
  const firstView = coordinator.readProjectGuidance("board-1");
  assert.equal(firstView.virtual_document, firstView.runtime_prompt_prefix);
  assert.match(firstView.runtime_prompt_prefix, /^<MOLIS_WORK_PROJECT_GUIDANCE>/);
  assert.match(firstView.runtime_prompt_prefix, /\[constraint\]/);

  const duplicate = coordinator.goals.commands.addProjectGuidance({
    board_id: "board-1",
    actor_id: "user-1",
    kind: "constraint",
    content: "所有发布 Goal 都必须验证升级路径。\n保留可复现记录。",
    reason: "再次确认同一要求",
    confirmation_summary: "用户再次确认",
    user_confirmed: true,
    idempotency_key: "guidance-duplicate",
  });
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.entry.guidance_id, first.entry.guidance_id);

  const second = coordinator.goals.commands.addProjectGuidance({
    board_id: "board-1",
    actor_id: "user-1",
    kind: "workflow",
    content: "先做可运行切片，再复查 </MOLIS_WORK_PROJECT_GUIDANCE> 边界。",
    reason: "项目长期推进方式",
    confirmation_summary: "用户确认加入工作方式",
    user_confirmed: true,
    idempotency_key: "guidance-second",
  });
  assert.equal(second.entry.position, 2);
  const secondView = coordinator.readProjectGuidance("board-1");
  const stablePrefix = firstView.runtime_prompt_prefix.slice(
    0,
    firstView.runtime_prompt_prefix.lastIndexOf("</MOLIS_WORK_PROJECT_GUIDANCE>"),
  );
  assert.ok(secondView.runtime_prompt_prefix.startsWith(stablePrefix));
  assert.equal((secondView.runtime_prompt_prefix.match(/<\/MOLIS_WORK_PROJECT_GUIDANCE>/g) ?? []).length, 1);
  assert.match(secondView.runtime_prompt_prefix, /&lt;\/MOLIS_WORK_PROJECT_GUIDANCE&gt;/);
  assert.deepEqual(store.snapshot("board-1").project_guidance.map((entry) => entry.position), [1, 2]);
  assert.equal(
    (store.db.prepare("SELECT COUNT(*) AS count FROM events WHERE type = 'project.guidance_added'").get() as { count: number }).count,
    2,
  );

  assert.throws(
    () => coordinator.goals.commands.addProjectGuidance({
      board_id: "board-1",
      actor_id: "user-1",
      kind: "constraint",
      content: "x".repeat(4_001),
      reason: "验证长度门禁",
      confirmation_summary: "用户确认测试超限",
      user_confirmed: true,
      idempotency_key: "guidance-too-long",
    }),
    (error: unknown) =>
      error instanceof MolisWorkV1Error && error.code === "project_guidance.entry_too_large",
  );
  store.close();
});

test("project guidance edits, deactivation, and restoration preserve immutable revisions without a Goal queue", () => {
  const { store, coordinator } = fixture();
  const created = coordinator.goals.commands.addProjectGuidance({
    board_id: "board-1",
    actor_id: "user-1",
    kind: "constraint",
    content: "发布前检查升级路径。",
    source_refs: ["conversation://guidance-v1"],
    reason: "项目长期底线",
    confirmation_summary: "用户确认新增",
    user_confirmed: true,
    idempotency_key: "guidance-version-create",
  });
  assert.equal(created.entry.revision, 1);
  assert.equal(created.entry.active, true);

  assert.throws(
    () => coordinator.goals.commands.updateProjectGuidance({
      board_id: "board-1",
      guidance_id: created.entry.guidance_id,
      actor_id: "runtime-guidance",
      action: "edit",
      kind: "quality_bar",
      content: "发布前检查升级、回滚和安装路径。",
      reason: "补全发布标准",
      confirmation_summary: "尚未确认",
      user_confirmed: false,
      idempotency_key: "guidance-version-unconfirmed",
    }),
    (error: unknown) =>
      error instanceof MolisWorkV1Error && error.code === "project_guidance.user_confirmation_required",
  );

  const edited = coordinator.goals.commands.updateProjectGuidance({
    board_id: "board-1",
    guidance_id: created.entry.guidance_id,
    actor_id: "user-1",
    action: "edit",
    kind: "quality_bar",
    content: "发布前检查升级、回滚和安装路径。",
    source_refs: ["conversation://guidance-v2"],
    reason: "补全发布标准",
    confirmation_summary: "用户确认精确修改",
    user_confirmed: true,
    idempotency_key: "guidance-version-edit",
  });
  assert.equal(edited.entry.revision, 2);
  assert.equal(edited.revision.change_kind, "edited");
  assert.equal(edited.entry.kind, "quality_bar");
  const replay = coordinator.goals.commands.updateProjectGuidance({
    board_id: "board-1",
    guidance_id: created.entry.guidance_id,
    actor_id: "user-1",
    action: "edit",
    kind: "quality_bar",
    content: "发布前检查升级、回滚和安装路径。",
    source_refs: ["conversation://guidance-v2"],
    reason: "补全发布标准",
    confirmation_summary: "用户确认精确修改",
    user_confirmed: true,
    idempotency_key: "guidance-version-edit",
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.entry.revision, 2);
  assert.doesNotMatch(coordinator.readProjectGuidance("board-1").runtime_prompt_prefix, /发布前检查升级路径。/);

  const deactivated = coordinator.goals.commands.updateProjectGuidance({
    board_id: "board-1",
    guidance_id: created.entry.guidance_id,
    actor_id: "user-1",
    action: "deactivate",
    reason: "暂时不再作为项目底线",
    confirmation_summary: "用户在项目说明页停用",
    user_confirmed: true,
    idempotency_key: "guidance-version-deactivate",
  });
  assert.equal(deactivated.entry.revision, 3);
  assert.equal(deactivated.entry.active, false);
  const inactiveView = coordinator.readProjectGuidance("board-1");
  assert.deepEqual(inactiveView.entries, []);
  assert.equal(inactiveView.inactive_entries.length, 1);
  assert.doesNotMatch(inactiveView.runtime_prompt_prefix, /回滚和安装路径/);
  assert.deepEqual(store.snapshot("board-1").project_guidance, []);

  const restored = coordinator.goals.commands.updateProjectGuidance({
    board_id: "board-1",
    guidance_id: created.entry.guidance_id,
    actor_id: "user-1",
    action: "restore",
    reason: "恢复发布底线",
    confirmation_summary: "用户在项目说明页恢复",
    user_confirmed: true,
    idempotency_key: "guidance-version-restore",
  });
  assert.equal(restored.entry.revision, 4);
  assert.equal(restored.entry.active, true);
  const restoredView = coordinator.readProjectGuidance("board-1");
  assert.equal(restoredView.entries.length, 1);
  assert.equal(restoredView.revisions.filter((revision) => revision.guidance_id === created.entry.guidance_id).length, 4);
  assert.match(restoredView.runtime_prompt_prefix, /回滚和安装路径/);
  assert.equal(
    (store.db.prepare("SELECT COUNT(*) AS count FROM goal_tree_proposal_decisions").get() as { count: number }).count,
    0,
  );
  store.close();
});

test("migration 26 backfills revision history for existing project guidance", () => {
  const { store, coordinator } = fixture();
  const created = coordinator.goals.commands.addProjectGuidance({
    board_id: "board-1",
    actor_id: "user-1",
    kind: "context",
    content: "这是迁移前已经存在的项目背景。",
    reason: "迁移测试",
    confirmation_summary: "用户确认",
    user_confirmed: true,
    idempotency_key: "guidance-migration-create",
  });
  const databasePath = store.path;
  store.db.exec(`
    DROP TABLE project_guidance_revisions;
    DELETE FROM schema_migrations WHERE migration_id = 26;
    ALTER TABLE project_guidance_entries DROP COLUMN updated_at;
    ALTER TABLE project_guidance_entries DROP COLUMN updated_by;
    ALTER TABLE project_guidance_entries DROP COLUMN active;
    ALTER TABLE project_guidance_entries DROP COLUMN revision;
  `);
  store.close();

  const migrated = new SqliteMolisWorkStore(databasePath);
  const entry = migrated.listProjectGuidanceEntries("board-1", true)[0];
  assert.equal(entry?.guidance_id, created.entry.guidance_id);
  assert.equal(entry?.revision, 1);
  assert.equal(entry?.active, true);
  assert.equal(migrated.listProjectGuidanceRevisions("board-1")[0]?.change_kind, "created");
  assert.ok(migrated.db.prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 26").get());
  migrated.close();
});

test("project guidance rejects invalid, empty, and project-total overflow content", () => {
  const { store, coordinator } = fixture();
  const base = {
    board_id: "board-1",
    actor_id: "user-1",
    kind: "context" as const,
    reason: "验证项目说明边界",
    confirmation_summary: "用户确认边界测试",
    user_confirmed: true,
  };
  assert.throws(
    () => coordinator.goals.commands.addProjectGuidance({
      ...base,
      kind: "temporary" as never,
      content: "不支持的分类",
      idempotency_key: "guidance-invalid-kind",
    }),
    (error: unknown) => error instanceof MolisWorkV1Error && error.code === "project_guidance.kind_invalid",
  );
  assert.throws(
    () => coordinator.goals.commands.addProjectGuidance({
      ...base,
      content: "  \n  ",
      idempotency_key: "guidance-empty",
    }),
    (error: unknown) => error instanceof MolisWorkV1Error && error.code === "project_guidance.invalid",
  );
  for (let index = 0; index < 8; index += 1) {
    coordinator.goals.commands.addProjectGuidance({
      ...base,
      content: `${index}${"x".repeat(3_999)}`,
      idempotency_key: `guidance-fill-${index}`,
    });
  }
  assert.throws(
    () => coordinator.goals.commands.addProjectGuidance({
      ...base,
      content: "超过项目总长度",
      idempotency_key: "guidance-total-overflow",
    }),
    (error: unknown) => error instanceof MolisWorkV1Error && error.code === "project_guidance.total_too_large",
  );
  assert.equal(store.snapshot("board-1").project_guidance.length, 8);
  store.close();
});

test("migration 17 repairs a missing evidence corrections table even when its ledger entry remains", () => {
  const { store } = fixture();
  const databasePath = store.path;
  assert.ok(store.db.prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 17").get());
  store.db.exec("DROP TABLE evidence_corrections");
  store.close();

  const repaired = new SqliteMolisWorkStore(databasePath);
  assert.ok(
    repaired.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'evidence_corrections'")
      .get(),
  );
  const migrationCount = repaired.db
    .prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE migration_id = 17")
    .get() as { count: number };
  assert.equal(migrationCount.count, 1);
  assert.doesNotThrow(() => repaired.snapshot("board-1"));
  repaired.close();
});

test("migration 30 backfills Contract revisions and action targets without rewriting legacy business state", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "migration-30-parent");
  createLeaf(coordinator, "migration-30-child");
  coordinator.goals.commands.addRelation(
    "board-1",
    {
      from_goal_id: "migration-30-child",
      to_goal_id: "migration-30-parent",
      type: "part_of",
      reason: "验证旧父子关系的 revision coverage 回填",
    },
    { actor_id: "user-1", idempotency_key: "migration-30-part-of" },
  );
  insertHistoricalClaim(store.db, {
    claim_id: "claim-migration-30",
    board_id: "board-1",
    goal_id: "migration-30-child",
    actor_id: "runtime-migration-30",
    state: "released",
    action_kind: null,
    action_target_id: null,
  });
  insertHistoricalRun(store.db, {
    run_id: "run-migration-30",
    board_id: "board-1",
    goal_id: "migration-30-child",
    claim_id: "claim-migration-30",
    actor_id: "runtime-migration-30",
    state: "completed",
    ended_at: "2026-08-15T00:02:00.000Z",
  });
  insertHistoricalEvidence(store.db, {
    evidence_id: "evidence-migration-30",
    board_id: "board-1",
    goal_id: "migration-30-child",
    producer_actor_id: "runtime-migration-30",
    criterion_ids: ["migration-30-child-criterion"],
    kind: "test",
    locator: "test://migration-30-child",
    result: "passed",
    run_id: "run-migration-30",
  });

  const databasePath = store.path;
  const before = store.snapshot("board-1");
  const countsBefore = {
    goals: before.goals.length,
    relations: before.relations.length,
    claims: before.claims.length,
    runs: before.runs.length,
    evidence: before.evidence.length,
    obligations: before.review_obligations.length,
  };
  store.db.exec(`
    DELETE FROM schema_migrations WHERE migration_id = 30;
    UPDATE claims SET action_kind = NULL, action_target_id = NULL;
    DROP TABLE coverage_contract_revisions;
    DROP TABLE goal_contract_revisions;
  `);
  store.close();

  const migrated = new SqliteMolisWorkStore(databasePath);
  const after = migrated.snapshot("board-1");
  assert.deepEqual({
    goals: after.goals.length,
    relations: after.relations.length,
    claims: after.claims.length,
    runs: after.runs.length,
    evidence: after.evidence.length,
    obligations: after.review_obligations.length,
  }, countsBefore);
  assert.ok(after.goals.every((goal) => goal.current_contract_revision === 1));
  assert.equal(after.goal_contract_revisions.length, after.goals.length);
  assert.ok(after.claims.every((claim) => claim.contract_revision === 1));
  assert.ok(after.claims.every((claim) => claim.action_kind != null && claim.action_target_id === claim.goal_id));
  assert.ok(after.evidence.every((evidence) => evidence.contract_revision === 1));
  assert.ok(after.review_obligations.every((obligation) => obligation.contract_revision === 1));
  assert.deepEqual(
    after.coverage_contract_revisions.map((coverage) => [
      coverage.parent_goal_id,
      coverage.child_goal_id,
      coverage.parent_contract_revision,
      coverage.child_contract_revision,
    ]),
    [["migration-30-parent", "migration-30-child", 1, 1]],
  );
  migrated.close();

  const reopened = new SqliteMolisWorkStore(databasePath);
  assert.equal(
    (reopened.db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE migration_id = 30").get() as { count: number }).count,
    1,
  );
  assert.equal(reopened.snapshot("board-1").goal_contract_revisions.length, after.goals.length);
  reopened.close();
});

test("migration 12 reconciles historical Runs and clarification sessions exactly once", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "migration-lifecycle-draft");
  const acceptedAt = "2026-08-15T00:10:00.000Z";
  const releasedAt = "2026-08-15T00:11:00.000Z";
  insertHistoricalClaim(store.db, {
    claim_id: "claim-migration-12",
    board_id: "board-1",
    goal_id: "migration-lifecycle-draft",
    actor_id: "runtime-migration",
    role: "clarifier",
    state: "expired",
    released_at: releasedAt,
    release_reason: "模拟历史租约过期",
  });
  insertHistoricalRun(store.db, {
    run_id: "run-migration-12",
    board_id: "board-1",
    goal_id: "migration-lifecycle-draft",
    claim_id: "claim-migration-12",
    actor_id: "runtime-migration",
    role: "clarifier",
    state: "started",
    ended_at: null,
  });
  insertHistoricalClarificationSession(store.db, {
    session_id: "session-migration-12",
    board_id: "board-1",
    goal_id: "migration-lifecycle-draft",
    claim_id: "claim-migration-12",
    run_id: "run-migration-12",
    state: "proposal_ready",
    created_by: "runtime-migration",
  });
  store.db
    .prepare(`
      UPDATE goals
      SET definition_state = 'accepted', decomposition_state = 'closed_leaf',
          accepted_by = 'user-1', accepted_at = ?, updated_at = ?
      WHERE board_id = 'board-1' AND goal_id = 'migration-lifecycle-draft'
    `)
    .run(acceptedAt, acceptedAt);
  store.db.prepare("DELETE FROM schema_migrations WHERE migration_id = 12").run();
  const databasePath = store.path;
  store.close();

  const migrated = new SqliteMolisWorkStore(databasePath);
  const migratedSnapshot = migrated.snapshot("board-1");
  const repairedRun = migratedSnapshot.runs.find((run) => run.run_id === "run-migration-12");
  assert.equal(repairedRun?.state, "abandoned");
  assert.equal(repairedRun?.ended_at, releasedAt);
  assert.match(repairedRun?.block_reason ?? "", /Claim 已是 expired/);
  const repairedSession = migratedSnapshot.clarification_sessions.find(
    (session) => session.session_id === "session-migration-12",
  );
  assert.equal(repairedSession?.state, "closed");
  assert.equal(repairedSession?.closed_at, acceptedAt);
  const repairEvents = migrated.db
    .prepare("SELECT type, object_id FROM events WHERE actor_id = ? ORDER BY seq")
    .all("molis-work:migration-12") as Array<{ type: string; object_id: string }>;
  assert.deepEqual(
    repairEvents.map((event) => event.type).sort(),
    ["clarification.closed", "run.abandoned"],
  );
  assert.ok(migrated.db.prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 12").get());
  migrated.close();

  const reopened = new SqliteMolisWorkStore(databasePath);
  const repairEventCount = reopened.db
    .prepare("SELECT COUNT(*) AS count FROM events WHERE actor_id = ?")
    .get("molis-work:migration-12") as { count: number };
  assert.equal(repairEventCount.count, 2);
  reopened.close();
});

test("migration 13 clears a historical completed Active Goal exactly once", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "migration-active-completed");
  coordinator.setActiveGoal(
    "board-1",
    { goal_id: "migration-active-completed", reason: "模拟历史进行中目标" },
    { actor_id: "user-1", idempotency_key: "migration-active-goal" },
  );
  store.db
    .prepare("UPDATE goals SET fulfillment_state = 'satisfied' WHERE goal_id = ?")
    .run("migration-active-completed");
  store.db.prepare("DELETE FROM schema_migrations WHERE migration_id = 13").run();
  const databasePath = store.path;
  store.close();

  const migrated = new SqliteMolisWorkStore(databasePath);
  assert.equal(migrated.snapshot("board-1").board.active_goal_id, null);
  const repairEvents = migrated.db
    .prepare("SELECT type, object_id FROM events WHERE actor_id = ? ORDER BY seq")
    .all("molis-work:migration-13") as Array<{ type: string; object_id: string }>;
  assert.deepEqual(repairEvents, [
    { type: "board.active_goal_cleared", object_id: "migration-active-completed" },
  ]);
  assert.ok(migrated.db.prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 13").get());
  migrated.close();

  const reopened = new SqliteMolisWorkStore(databasePath);
  const repairEventCount = reopened.db
    .prepare("SELECT COUNT(*) AS count FROM events WHERE actor_id = ?")
    .get("molis-work:migration-13") as { count: number };
  assert.equal(repairEventCount.count, 1);
  reopened.close();
});

test("migration 14 converts the removed trusted-host authority to Runtime dialogue provenance", () => {
  const { store, coordinator } = fixture();
  const proposal = coordinator.goalTreeSubmission.submitGoalTreeProposal({
    board_id: "board-1",
    actor_id: "runtime-migration",
    submitted_session_id: "session-1",
    summary: "创建一个用于迁移验证的子 Goal。",
    items: [currentTreeItem({
      item_id: "migration-authority-child-item",
      kind: "goal",
      payload: { title: "迁移确认来源", outcome: "迁移确认来源", goal_id: "migration-authority-child" },
    })],
    idempotency_key: "migration-authority-proposal",
  });
  coordinator.goalTreeDecision.decideGoalTreeProposal({
    board_id: "board-1",
    proposal_id: proposal.proposal.proposal_id,
    authority: hostEventDecisionAuthority("web", "board-1", "user-1", "migration-authority-decision"),
    decisions: [{ item_id: "migration-authority-child-item", decision: "confirm", reason: "用户确认" }],
    idempotency_key: "migration-authority-decision",
  });
  store.db.pragma("ignore_check_constraints = ON");
  store.db
    .prepare("UPDATE goal_tree_proposal_decisions SET authority_source = 'runtime_trusted_host'")
    .run();
  store.db.pragma("ignore_check_constraints = OFF");
  store.db.prepare("DELETE FROM schema_migrations WHERE migration_id = 14").run();
  const databasePath = store.path;
  store.close();

  const migrated = new SqliteMolisWorkStore(databasePath);
  const decision = migrated.db
    .prepare("SELECT authority_source FROM goal_tree_proposal_decisions")
    .get() as { authority_source: string };
  assert.equal(decision.authority_source, "runtime_dialogue");
  const table = migrated.db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'goal_tree_proposal_decisions'")
    .get() as { sql: string };
  assert.doesNotMatch(table.sql, /runtime_trusted_host/);
  assert.ok(migrated.db.prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 14").get());
  assert.deepEqual(migrated.db.pragma("foreign_key_check"), []);
  migrated.close();
});

test("only satisfied Goals can be archived and restoration preserves completion facts", () => {
  const { store, coordinator, setNow } = fixture();
  createLeaf(coordinator, "archive-target");
  assert.throws(
    () =>
      coordinator.goals.lifecycle.setArchived(
        "board-1",
        { goal_id: "archive-target", archived: true, reason: "整理已完成目标" },
        { actor_id: "user-1", idempotency_key: "archive-unmet" },
      ),
    (error: unknown) => error instanceof MolisWorkV1Error && error.code === "goal.not_satisfied",
  );

  coordinator.setActiveGoal(
    "board-1",
    { goal_id: "archive-target", reason: "验证归档当前 Goal" },
    { actor_id: "user-1", idempotency_key: "archive-active" },
  );
  store.db
    .prepare("UPDATE goals SET fulfillment_state = 'satisfied' WHERE goal_id = ?")
    .run("archive-target");
  setNow("2026-08-15T01:00:00.000Z");
  const archived = coordinator.goals.lifecycle.setArchived(
    "board-1",
    { goal_id: "archive-target", archived: true, reason: "用户手动归档" },
    { actor_id: "user-1", idempotency_key: "archive-target" },
  );
  assert.equal(archived.goal.archived_at, "2026-08-15T01:00:00.000Z");
  assert.equal(archived.goal.archived_by, "user-1");
  assert.equal(archived.goal.fulfillment_state, "satisfied");
  assert.equal(archived.goal.acceptance_criteria.length, 1);
  assert.equal(archived.active_goal_cleared, true);
  assert.equal(store.snapshot("board-1").board.active_goal_id, null);
  assert.ok(store.getGoal("archive-target")?.archived_at);

  setNow("2026-08-15T02:00:00.000Z");
  const restored = coordinator.goals.lifecycle.setArchived(
    "board-1",
    { goal_id: "archive-target", archived: false, reason: "用户恢复归档" },
    { actor_id: "user-1", idempotency_key: "restore-target" },
  );
  assert.equal(restored.goal.archived_at, null);
  assert.equal(restored.goal.archived_by, null);
  assert.equal(restored.goal.fulfillment_state, "satisfied");
  const archiveEvents = store.db
    .prepare("SELECT type FROM events WHERE object_id = ? AND type IN ('goal.archived', 'goal.restored') ORDER BY seq")
    .all("archive-target") as Array<{ type: string }>;
  assert.deepEqual(archiveEvents.map((event) => event.type), ["goal.archived", "goal.restored"]);
  store.close();
});

test("Goal trash preserves history, deactivates only active relations, and restores the same Goal", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "trash-target");
  createLeaf(coordinator, "trash-peer");
  createLeaf(coordinator, "trash-inactive-peer");
  const activeRelation = coordinator.goals.commands.addRelation(
    "board-1",
    {
      from_goal_id: "trash-target",
      to_goal_id: "trash-peer",
      type: "extends",
      reason: "目标完成后会扩展关联能力",
    },
    { actor_id: "user-1", idempotency_key: "trash-active-relation" },
  ).relation_id;
  const inactiveRelation = coordinator.goals.commands.addRelation(
    "board-1",
    {
      from_goal_id: "trash-target",
      to_goal_id: "trash-inactive-peer",
      type: "mitigates",
      reason: "历史上曾用于缓解关联风险",
    },
    { actor_id: "user-1", idempotency_key: "trash-inactive-relation" },
  ).relation_id;
  coordinator.goals.commands.deactivateRelation(
    "board-1",
    { relation_id: inactiveRelation, reason: "该缓解关系此前已经不再适用" },
    { actor_id: "user-1", idempotency_key: "trash-inactive-relation-deactivate" },
  );

  insertHistoricalClaim(store.db, {
    claim_id: "trash-history-claim",
    board_id: "board-1",
    goal_id: "trash-target",
    actor_id: "runtime-trash",
    state: "released",
    release_reason: "保留历史后结束执行",
  });
  insertHistoricalRun(store.db, {
    run_id: "trash-history-run",
    board_id: "board-1",
    goal_id: "trash-target",
    claim_id: "trash-history-claim",
    actor_id: "runtime-trash",
    state: "completed",
    ended_at: "2026-08-15T00:02:00.000Z",
    output_refs_json: JSON.stringify(["test://trash-history"]),
  });
  insertHistoricalEvidence(store.db, {
    evidence_id: "trash-history-evidence",
    board_id: "board-1",
    goal_id: "trash-target",
    producer_actor_id: "runtime-trash",
    criterion_ids: ["trash-target-criterion"],
    kind: "test",
    locator: "test://trash-history",
    result: "passed",
    run_id: "trash-history-run",
  });
  insertHistoricalRisk(store.db, {
    risk_id: "trash-history-risk",
    board_id: "board-1",
    goal_ids: ["trash-target"],
    description: "恢复时可能错误激活已经停用的 Relation",
    probability: "medium",
    impact: "Goal Tree 会重现过时关系",
    trigger: "恢复没有区分删除前状态",
    revisit_condition: "关系 roundtrip 测试通过",
    owner: "user-1",
  });
  coordinator.setActiveGoal(
    "board-1",
    { goal_id: "trash-target", reason: "验证回收站清除当前 Goal" },
    { actor_id: "user-1", idempotency_key: "trash-history-active-goal" },
  );

  const trashed = coordinator.goals.lifecycle.setTrashed(
    "board-1",
    { goal_id: "trash-target", trashed: true, reason: "用户暂时移入回收站" },
    { actor_id: "user-1", idempotency_key: "trash-target" },
  );
  assert.equal(trashed.status, "trashed");
  assert.equal(trashed.active_goal_cleared, true);
  assert.deepEqual(trashed.deactivated_relation_ids, [activeRelation]);
  assert.equal(trashed.goal.trashed_by, "user-1");
  assert.equal(store.snapshot("board-1").board.active_goal_id, null);
  assert.deepEqual(coordinator.listTrashedGoals("board-1").map((goal) => goal.goal_id), ["trash-target"]);

  const afterTrash = store.snapshot("board-1");
  assert.ok(afterTrash.goals.some((goal) => goal.goal_id === "trash-target" && goal.trashed_at));
  assert.ok(afterTrash.claims.some((item) => item.claim_id === "trash-history-claim"));
  assert.ok(afterTrash.runs.some((item) => item.run_id === "trash-history-run"));
  assert.ok(afterTrash.evidence.some((item) => item.evidence_id === "trash-history-evidence"));
  assert.ok(afterTrash.risks.some((item) => item.risk_id === "trash-history-risk"));
  assert.equal(afterTrash.relations.find((item) => item.relation_id === activeRelation)?.state, "inactive");
  assert.equal(afterTrash.relations.find((item) => item.relation_id === inactiveRelation)?.state, "inactive");
  assert.ok(
    afterTrash.goals.find((goal) => goal.goal_id === "trash-target")?.acceptance_criteria.length,
  );
  assert.ok(store.getGoal("trash-target")?.trashed_at);
  assert.equal(coordinator.listTrashedGoals("board-1").some((item) => item.goal_id === "trash-target"), true);
  assert.throws(
    () =>
      coordinator.goals.commands.addRelation(
        "board-1",
        {
          from_goal_id: "trash-peer",
          to_goal_id: "trash-target",
          type: "extends",
          reason: "回收站 Goal 不得获得新的 active Relation",
        },
        { actor_id: "user-1", idempotency_key: "trash-new-relation-denied" },
      ),
    (error) => error instanceof MolisWorkV1Error && error.code === "goal.trashed",
  );

  const repeatedTrash = coordinator.goals.lifecycle.setTrashed(
    "board-1",
    { goal_id: "trash-target", trashed: true, reason: "重复删除不产生副作用" },
    { actor_id: "user-1", idempotency_key: "trash-target-repeat" },
  );
  assert.equal(repeatedTrash.status, "already_trashed");
  const restored = coordinator.goals.lifecycle.setTrashed(
    "board-1",
    { goal_id: "trash-target", trashed: false, reason: "用户恢复原 Goal" },
    { actor_id: "user-1", idempotency_key: "restore-target" },
  );
  assert.equal(restored.status, "restored");
  assert.deepEqual(restored.restored_relation_ids, [activeRelation]);
  assert.deepEqual(restored.pending_relation_ids, []);
  assert.equal(restored.goal.trashed_at, null);
  const afterRestore = store.snapshot("board-1");
  assert.equal(afterRestore.relations.find((item) => item.relation_id === activeRelation)?.state, "active");
  assert.equal(afterRestore.relations.find((item) => item.relation_id === inactiveRelation)?.state, "inactive");
  assert.equal(coordinator.listTrashedGoals("board-1").length, 0);
  assert.deepEqual(
    store.db
      .prepare("SELECT type FROM events WHERE object_id = ? AND type IN ('goal.trashed', 'goal.restored_from_trash') ORDER BY seq")
      .all("trash-target")
      .map((row: { type: string }) => row.type),
    ["goal.trashed", "goal.restored_from_trash"],
  );
  assert.equal(
    coordinator.goals.lifecycle.setTrashed(
      "board-1",
      { goal_id: "trash-target", trashed: false, reason: "重复恢复不产生副作用" },
      { actor_id: "user-1", idempotency_key: "restore-target-repeat" },
    ).status,
    "already_active",
  );
  store.close();
});

test("Goal trash protects active work and rolls the whole deletion transaction back on relation failure", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "trash-active-work");
  createLeaf(coordinator, "trash-active-peer");
  const relationId = coordinator.goals.commands.addRelation(
    "board-1",
    {
      from_goal_id: "trash-active-work",
      to_goal_id: "trash-active-peer",
      type: "extends",
      reason: "用于验证删除保护和事务回滚",
    },
    { actor_id: "user-1", idempotency_key: "trash-active-work-relation" },
  ).relation_id;
  insertHistoricalClaim(store.db, {
    claim_id: "trash-active-work-claim",
    board_id: "board-1",
    goal_id: "trash-active-work",
    actor_id: "runtime-active",
    state: "active",
    released_at: null,
    release_reason: null,
  });
  insertHistoricalRun(store.db, {
    run_id: "trash-active-work-run",
    board_id: "board-1",
    goal_id: "trash-active-work",
    claim_id: "trash-active-work-claim",
    actor_id: "runtime-active",
    state: "started",
    ended_at: null,
  });
  const blocked = coordinator.goals.lifecycle.setTrashed(
    "board-1",
    { goal_id: "trash-active-work", trashed: true, reason: "活动工作不应被删除" },
    { actor_id: "user-1", idempotency_key: "trash-active-work-blocked" },
  );
  assert.equal(blocked.status, "blocked");
  assert.deepEqual(blocked.blocking_claim_ids, ["trash-active-work-claim"]);
  assert.deepEqual(blocked.blocking_run_ids, ["trash-active-work-run"]);
  assert.equal(store.getGoal("trash-active-work")?.trashed_at, null);
  assert.equal(store.snapshot("board-1").relations.find((item) => item.relation_id === relationId)?.state, "active");

  store.db.prepare(`
    UPDATE claims SET state = 'released', released_at = ?, release_reason = ?
    WHERE claim_id = 'trash-active-work-claim'
  `).run("2026-08-15T00:10:00.000Z", "结束活动工作后才允许删除");
  store.db.prepare(`
    UPDATE runs SET state = 'failed', block_reason = ?, ended_at = ?
    WHERE run_id = 'trash-active-work-run'
  `).run("结束活动工作后才允许删除", "2026-08-15T00:10:00.000Z");
  store.db.exec(`
    CREATE TRIGGER trash_relation_failure
    BEFORE UPDATE OF state ON goal_relations
    WHEN NEW.relation_id = '${relationId}' AND NEW.state = 'inactive'
    BEGIN SELECT RAISE(ABORT, 'injected trash relation failure'); END;
  `);
  assert.throws(
    () =>
      coordinator.goals.lifecycle.setTrashed(
        "board-1",
        { goal_id: "trash-active-work", trashed: true, reason: "注入失败应回滚全部修改" },
        { actor_id: "user-1", idempotency_key: "trash-active-work-rollback" },
      ),
    /injected trash relation failure/,
  );
  assert.equal(store.getGoal("trash-active-work")?.trashed_at, null);
  assert.equal(store.snapshot("board-1").relations.find((item) => item.relation_id === relationId)?.state, "active");
  assert.equal(
    store.db.prepare("SELECT COUNT(*) AS count FROM goal_trash_records WHERE goal_id = ?").get("trash-active-work").count,
    0,
  );
  store.db.exec("DROP TRIGGER trash_relation_failure");
  assert.equal(
    coordinator.goals.lifecycle.setTrashed(
      "board-1",
      { goal_id: "trash-active-work", trashed: true, reason: "活动工作结束后可以删除" },
      { actor_id: "user-1", idempotency_key: "trash-active-work-success" },
    ).status,
    "trashed",
  );
  store.close();
});

test("a Relation waits safely until both independently trashed endpoints are restored", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "trash-left");
  createLeaf(coordinator, "trash-right");
  const relationId = coordinator.goals.commands.addRelation(
    "board-1",
    {
      from_goal_id: "trash-left",
      to_goal_id: "trash-right",
      type: "extends",
      reason: "两个 Goal 恢复后才应恢复关系",
    },
    { actor_id: "user-1", idempotency_key: "trash-two-endpoints-relation" },
  ).relation_id;
  coordinator.goals.lifecycle.setTrashed(
    "board-1",
    { goal_id: "trash-left", trashed: true, reason: "先删除左侧 Goal" },
    { actor_id: "user-1", idempotency_key: "trash-left" },
  );
  coordinator.goals.lifecycle.setTrashed(
    "board-1",
    { goal_id: "trash-right", trashed: true, reason: "再删除右侧 Goal" },
    { actor_id: "user-1", idempotency_key: "trash-right" },
  );
  const leftRestored = coordinator.goals.lifecycle.setTrashed(
    "board-1",
    { goal_id: "trash-left", trashed: false, reason: "右侧仍在回收站，关系保持停用" },
    { actor_id: "user-1", idempotency_key: "restore-left" },
  );
  assert.deepEqual(leftRestored.restored_relation_ids, []);
  assert.deepEqual(leftRestored.pending_relation_ids, [relationId]);
  assert.equal(store.snapshot("board-1").relations.find((item) => item.relation_id === relationId)?.state, "inactive");
  const rightRestored = coordinator.goals.lifecycle.setTrashed(
    "board-1",
    { goal_id: "trash-right", trashed: false, reason: "两端都恢复后才恢复关系" },
    { actor_id: "user-1", idempotency_key: "restore-right" },
  );
  assert.deepEqual(rightRestored.restored_relation_ids, [relationId]);
  assert.equal(store.snapshot("board-1").relations.find((item) => item.relation_id === relationId)?.state, "active");
  store.close();
});

test("user relation maintenance keeps direction, reason, history, and idempotency", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "relation-source");
  createLeaf(coordinator, "relation-target");

  const added = coordinator.goals.commands.addRelation(
    "board-1",
    {
      from_goal_id: "relation-source",
      to_goal_id: "relation-target",
      type: "extends",
      reason: "source 在 target 的已交付结果上继续扩展",
    },
    { actor_id: "user-1", idempotency_key: "relation-maintenance-add" },
  );
  assert.throws(
    () =>
      coordinator.goals.commands.addRelation(
        "board-1",
        {
          from_goal_id: "relation-source",
          to_goal_id: "relation-target",
          type: "extends",
          reason: "不能重复添加同一条生效关系",
        },
        { actor_id: "user-1", idempotency_key: "relation-maintenance-duplicate" },
      ),
    (error: unknown) =>
      error instanceof MolisWorkV1Error && error.code === "relation.already_exists",
  );

  const deactivated = coordinator.goals.commands.deactivateRelation(
    "board-1",
    {
      relation_id: added.relation_id,
      reason: "扩展结果已经并入新的独立 Goal",
    },
    { actor_id: "user-1", idempotency_key: "relation-maintenance-deactivate" },
  );
  assert.equal(deactivated.relation.from_goal_id, "relation-source");
  assert.equal(deactivated.relation.to_goal_id, "relation-target");
  assert.equal(deactivated.relation.type, "extends");
  assert.equal(deactivated.relation.state, "inactive");
  assert.ok(deactivated.relation.deactivated_at);

  const replay = coordinator.goals.commands.deactivateRelation(
    "board-1",
    {
      relation_id: added.relation_id,
      reason: "扩展结果已经并入新的独立 Goal",
    },
    { actor_id: "user-1", idempotency_key: "relation-maintenance-deactivate" },
  );
  assert.equal(replay.replayed, true);
  assert.throws(
    () =>
      coordinator.goals.commands.deactivateRelation(
        "board-1",
        { relation_id: added.relation_id, reason: "再次解除" },
        { actor_id: "user-1", idempotency_key: "relation-maintenance-deactivate-again" },
      ),
    (error: unknown) =>
      error instanceof MolisWorkV1Error && error.code === "relation.not_active",
  );
  const event = store.db
    .prepare("SELECT reason FROM events WHERE type = 'relation.deactivated' AND object_id = ?")
    .get(added.relation_id) as { reason: string } | undefined;
  assert.equal(event?.reason, "扩展结果已经并入新的独立 Goal");
  store.close();
});

test("Evidence locator preflight verifies project Markdown anchors and marks opaque locators unverified", () => {
  const { store } = fixture();
  const projectRoot = mkdtempSync(join(tmpdir(), "molis-work-evidence-project-"));
  writeFileSync(
    join(projectRoot, "contract.md"),
    "# Content Growth Studio\n\n## 平台差异化观察窗口\n\n已确认。\n\n## 重复章节\n\n## 重复章节-1\n\n## 重复章节\n",
  );
  const now = "2026-08-15T00:00:00.000Z";
  const absoluteVerified = validateEvidenceLocator(join(projectRoot, "contract.md"), { projectRoot, now });
  assert.equal(absoluteVerified.status, "verified");
  assert.equal(absoluteVerified.normalized_locator, "project://contract.md");
  const verified = validateEvidenceLocator("project://contract.md#平台差异化观察窗口", { projectRoot, now });
  assert.equal(verified.status, "verified");
  assert.match(verified.reason, /Markdown 文件与 anchor/);
  const repoAlias = validateEvidenceLocator("repo:contract.md", { projectRoot, now });
  assert.equal(repoAlias.status, "verified");
  assert.equal(repoAlias.normalized_locator, "project://contract.md");
  const opaque = validateEvidenceLocator("artifact://opaque-reference", { projectRoot, now });
  assert.equal(opaque.status, "unverified");
  assert.match(opaque.reason, /不透明或外部 locator/);
  const external = validateEvidenceLocator("https://example.com/report", { projectRoot, now });
  assert.equal(external.status, "unverified");
  assert.match(external.reason, /外部 URL/);
  store.close();
});

test("a file URI outside the current workspace is registered without reading the local file", () => {
  const { store } = fixture();
  const submitted = validateEvidenceLocator("file:///private/molis-work-casebook/not-present-in-test.md", {
    projectRoot: "/current/runtime/workspace",
  });
  assert.equal(submitted.normalized_locator, "file:///private/molis-work-casebook/not-present-in-test.md");
  assert.equal(submitted.status, "unverified");
  assert.match(submitted.reason, /机器本地 locator/);
  assert.match(submitted.reason, /不会读取或确认文件存在/);
  assert.match(submitted.reason, /digest.*未核验/);
  store.close();
});

test("Evidence verifies an uncommitted file in a registered worktree of the canonical Git repository", async () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "same-repository-worktree-evidence");
  const repositoryRoot = mkdtempSync(join(tmpdir(), "molis-work-evidence-repository-"));
  writeFileSync(join(repositoryRoot, "README.md"), "# Evidence repository\n");
  await execFileAsync("git", ["-C", repositoryRoot, "init"]);
  await execFileAsync("git", ["-C", repositoryRoot, "config", "user.name", "Molis Work Test"]);
  await execFileAsync("git", ["-C", repositoryRoot, "config", "user.email", "molis-work-test@example.invalid"]);
  await execFileAsync("git", ["-C", repositoryRoot, "add", "README.md"]);
  await execFileAsync("git", ["-C", repositoryRoot, "commit", "-m", "test: initialize evidence repository"]);
  const worktreeParent = mkdtempSync(join(tmpdir(), "molis-work-evidence-worktree-parent-"));
  const worktreeRoot = join(worktreeParent, "isolated-worktree");
  await execFileAsync("git", ["-C", repositoryRoot, "worktree", "add", "-b", "molis-work-evidence-worktree", worktreeRoot]);
  const worktreeFile = join(worktreeRoot, "uncommitted-evidence.txt");
  writeFileSync(worktreeFile, "fresh evidence from an isolated worktree\n");
  const submitted = validateEvidenceLocator(worktreeFile, { projectRoot: repositoryRoot });
  assert.equal(submitted.status, "verified");
  assert.equal(submitted.normalized_locator, "project://uncommitted-evidence.txt");
  assert.match(submitted.reason, /同一 Git 仓库.*worktree/);
  insertHistoricalEvidence(store.db, {
    evidence_id: "worktree-evidence",
    board_id: "board-1",
    goal_id: "same-repository-worktree-evidence",
    producer_actor_id: "runtime-a",
    kind: "test",
    locator: submitted.normalized_locator,
    locator_status: submitted.status,
    locator_validation_reason: submitted.reason,
    locator_checked_at: submitted.checked_at,
    locator_workspace_root: submitted.verified_project_root ?? null,
    result: "passed",
  });
  const recordedRoot = (
    store.db.prepare("SELECT locator_workspace_root FROM evidence WHERE evidence_id = ?")
      .get("worktree-evidence") as { locator_workspace_root: string }
  ).locator_workspace_root;
  assert.equal(recordedRoot, realpathSync(worktreeRoot));
  assert.match(
    readProjectReference(recordedRoot, submitted.normalized_locator).content.toString("utf8"),
    /fresh evidence from an isolated worktree/,
  );
  const otherRepository = mkdtempSync(join(tmpdir(), "molis-work-evidence-other-repository-"));
  await execFileAsync("git", ["-C", otherRepository, "init"]);
  const otherFile = join(otherRepository, "other.txt");
  writeFileSync(otherFile, "not the canonical repository\n");
  assert.throws(
    () => validateEvidenceLocator(otherFile, { projectRoot: repositoryRoot }),
    (error: unknown) => error instanceof ProjectReferenceError,
  );
  const forgedDirectory = mkdtempSync(join(tmpdir(), "molis-work-evidence-forged-worktree-"));
  writeFileSync(join(forgedDirectory, ".git"), `gitdir: ${join(repositoryRoot, ".git")}\n`);
  const forgedFile = join(forgedDirectory, "forged.txt");
  writeFileSync(forgedFile, "not registered by git worktree\n");
  assert.throws(
    () => validateEvidenceLocator(forgedFile, { projectRoot: repositoryRoot }),
    (error: unknown) => error instanceof ProjectReferenceError,
  );
  const outsideFile = join(worktreeParent, "outside.txt");
  writeFileSync(outsideFile, "outside registered worktree\n");
  mkdirSync(join(worktreeRoot, "links"));
  const escapingLink = join(worktreeRoot, "links", "outside.txt");
  symlinkSync(outsideFile, escapingLink);
  assert.throws(
    () => validateEvidenceLocator(escapingLink, { projectRoot: repositoryRoot }),
    (error: unknown) => error instanceof ProjectReferenceError,
  );
  await execFileAsync("git", ["-C", repositoryRoot, "worktree", "remove", "--force", worktreeRoot]);
  assert.throws(
    () => readProjectReference(recordedRoot, submitted.normalized_locator),
    (error: unknown) => error instanceof ProjectReferenceError && error.status === 404,
  );
  assert.equal(
    store.snapshot("board-1").evidence.find((item) => item.evidence_id === "worktree-evidence")?.locator_status,
    "verified",
  );
  store.close();
});

test("Goal Tree create payload rejects retired acceptance_criteria fields before confirmation", () => {
  const { store, coordinator } = fixture();
  createLeaf(coordinator, "criterion-owner");
  assert.throws(
    () => coordinator.goalTreeSubmission.submitGoalTreeProposal({
      board_id: "board-1",
      actor_id: "runtime-criterion-conflict",
      submitted_session_id: "session",
      summary: "当前树创建不能夹带旧验收字段。",
      items: [currentTreeItem({
        item_id: "criterion-conflict-item",
        kind: "goal",
        payload: {
          goal_id: "criterion-conflicting-goal",
          title: "带重复验收条件 ID 的 Goal",
          outcome: "冲突验收",
          acceptance_criteria: [{
            criterion_id: "criterion-owner-criterion",
            statement: "不能复用",
            decision_method: "inspection",
            pass_condition: "唯一",
          }],
        },
      })],
      idempotency_key: "criterion-conflict-proposal",
    }),
    (error: unknown) => error instanceof MolisWorkV1Error && error.code === "goal_tree_proposal.payload_unknown",
  );
  assert.equal(store.getGoal("criterion-conflicting-goal"), null);
  store.close();
});

test("Goal Tree proposal rejects cross-proposal item ID reuse with a structured recovery", () => {
  const { store, coordinator } = fixture();
  const first = coordinator.goalTreeSubmission.submitGoalTreeProposal({
    board_id: "board-1",
    actor_id: "runtime-item-id-conflict",
    submitted_session_id: "session",
    summary: "第一份提案占用全局 item ID。",
    items: [currentTreeItem({
      item_id: "globally-reused-item-id",
      kind: "goal",
      payload: { goal_id: "item-id-first", title: "第一份", outcome: "第一份" },
    })],
    idempotency_key: "item-id-first",
  }).proposal;
  assert.throws(
    () => coordinator.goalTreeSubmission.submitGoalTreeProposal({
      board_id: "board-1",
      actor_id: "runtime-item-id-conflict",
      submitted_session_id: "session",
      summary: "第二份提案不能复用同一个全局 item ID。",
      items: [currentTreeItem({
        item_id: "globally-reused-item-id",
        kind: "goal",
        payload: { goal_id: "item-id-second", title: "第二份", outcome: "第二份" },
      })],
      idempotency_key: "item-id-second",
    }),
    (error: unknown) => error instanceof MolisWorkV1Error && /item.?id|item_id/i.test(String((error as { code?: string }).code ?? error)),
  );
  assert.equal(first.items[0]!.item_id, "globally-reused-item-id");
  store.close();
});

test("a failed unified Goal Tree submission leaves neither proposal rows nor canonical writes", () => {
  const { store, coordinator } = fixture();
  const beforeGoals = store.snapshot("board-1").goals;
  store.db.exec(`
    CREATE TRIGGER reject_goal_tree_item
    BEFORE INSERT ON goal_tree_proposal_items
    BEGIN
      SELECT RAISE(ABORT, 'forced goal tree item failure');
    END;
  `);
  assert.throws(
    () =>
      coordinator.goalTreeSubmission.submitGoalTreeProposal({
        board_id: "board-1",
        actor_id: "runtime-clarifier",
        submitted_session_id: "session",
        summary: "这份提案应整体回滚。",
        items: [currentTreeItem({
          item_id: "atomic-child",
          kind: "goal",
          payload: { goal_id: "would-be-child", title: "不应落地", outcome: "不应落地" },
        })],
        idempotency_key: "atomic-tree-submit",
      }),
    /forced goal tree item failure/,
  );
  assert.equal(store.snapshot("board-1").goal_tree_proposals.length, 0);
  assert.deepEqual(store.snapshot("board-1").goals, beforeGoals);
  store.close();
});

test("migrations 28 and 29 recover the pre-0.1.12 marker collision without losing either schema", () => {
  const { store } = fixture();
  store.db.exec(`
    DROP INDEX goal_tree_proposals_supersedes_legacy_idx;
    ALTER TABLE goal_tree_proposals DROP COLUMN supersedes_legacy_proposal_id;
    DELETE FROM schema_migrations WHERE migration_id = 29;
  `);
  const databasePath = store.path;
  store.close();

  const migrated = new SqliteMolisWorkStore(databasePath);
  const columns = migrated.db.pragma("table_info(goal_tree_proposals)") as Array<{ name: string }>;
  assert.ok(columns.some((column) => column.name === "supersedes_legacy_proposal_id"));
  assert.ok(migrated.db.prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 28").get());
  assert.ok(migrated.db.prepare("SELECT 1 FROM schema_migrations WHERE migration_id = 29").get());
  assert.ok((migrated.db.pragma("table_info(feed_sources)") as Array<{ name: string }>).some(
    (column) => column.name === "schedule_json",
  ));
  migrated.close();
});

test("V3 import preserves safe structure and explicitly refuses to invent completion semantics", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-v3-import-"));
  const store = new SqliteMolisWorkStore(join(directory, "import.db"));
  const coordinator = new MolisWorkCoordinator(store);
  const legacy = {
    schema_version: "3.0",
    goal_id: "legacy-board",
    meta: {
      title: "旧版目标",
      source: { seed: "交付旧版目标" },
    },
    root_goal: {
      constraints: ["不破坏公开接口"],
    },
    coverage_ledger: [
      {
        id: "r1",
        requirement: "核心流程",
        status: "now",
        owner_goal: "g2",
      },
      {
        id: "r2",
        requirement: "未来扩展",
        status: "later",
        owner_goal: null,
        revisit_at: "V1 发布后",
      },
    ],
    goals: [
      {
        id: "g1",
        parent: null,
        one_liner: "交付旧版目标",
        covers: [],
        inputs: [],
        outputs: ["结果"],
      },
      {
        id: "g2",
        parent: "g1",
        one_liner: "完成核心流程",
        covers: ["r1"],
        inputs: ["需求"],
        outputs: ["核心流程"],
      },
    ],
  } satisfies LegacyV3ImportInput;
  const report = importV3Board(store, coordinator, legacy, {
    target_board_id: "imported-board",
    actor_id: "user-1",
    idempotency_key: "import-v3",
  });
  assert.equal(report.board_id, "imported-board");
  assert.ok(report.regenerate.some((item) => item.includes("业务逻辑")));
  assert.ok(report.regenerate.some((item) => item.includes("当前约定与可判定要求")));
  const snapshot = store.snapshot("imported-board");
  assert.equal(snapshot.goals.length, 2);
  assert.ok(snapshot.goals.every((goal) => goal.definition_state === "draft"));
  assert.ok(snapshot.goals.every((goal) => goal.fulfillment_state === "unmet"));
  assert.equal(snapshot.relations[0]?.type, "part_of");
  const coverage = store.db
    .prepare("SELECT disposition FROM coverage_items WHERE board_id = ? ORDER BY requirement_id")
    .all("imported-board") as Array<{ disposition: string }>;
  assert.deepEqual(coverage.map((item) => item.disposition), ["covered", "deferred"]);
  assert.throws(
    () =>
      importV3Board(store, coordinator, legacy, {
        target_board_id: "imported-board",
        actor_id: "user-1",
        idempotency_key: "import-v3-again",
      }),
    /不会覆盖/,
  );
  store.close();
});
