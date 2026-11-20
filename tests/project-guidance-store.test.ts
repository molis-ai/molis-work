import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AddProjectGuidanceInput, UpdateProjectGuidanceInput } from "@molis-ai/molis-work-contracts/modules/project-guidance";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { createProjectGuidance, writeProjectRoot, type ProjectGuidance } from "@molis-ai/molis-work-module-projects";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";
import { LocalSqliteJournal } from "@molis-ai/molis-work-storage";

// A project's guidance over the platform's store (batch 44: these two cases were Goals' in tests/v1.test.ts and keep their assertions).
// The writes still carry the project and the actor beside the input, as the Goals commands took them; the store takes them apart.

function fixture() {
  const store = new LocalProjectDatabase(join(mkdtempSync(join(tmpdir(), "molis-work-project-guidance-")), "molis-work.db"));
  writeProjectRoot(store.db, "board-1", "2026-08-15T00:00:00.000Z");
  const guidance = createProjectGuidance({ db: store.db, journal: new LocalSqliteJournal(store.db), now: () => new Date("2026-08-15T00:00:00.000Z"),
    requestHash: value => createHash("sha256").update(canonicalJsonText(value)!).digest("hex") });
  return { store, guidance };
}

type Scoped<Input> = Input & { project_id: string; actor_id: string };
function addGuidance(guidance: ProjectGuidance, { project_id, actor_id, ...input }: Scoped<AddProjectGuidanceInput>) {
  return guidance.add(project_id, actor_id, input);
}
function updateGuidance(guidance: ProjectGuidance, { project_id, actor_id, ...input }: Scoped<UpdateProjectGuidanceInput>) {
  return guidance.update(project_id, actor_id, input);
}

test("project guidance is user-confirmed, deduplicated, and rendered as a stable prompt prefix", () => {
  const { store, guidance } = fixture();
  assert.throws(
    () => addGuidance(guidance, {
      project_id: "board-1",
      actor_id: "runtime-guidance",
      kind: "constraint",
      content: "所有发布 Goal 都必须验证升级路径。",
      reason: "跨 Goal 的发布底线",
      confirmation_summary: "尚未获得用户确认",
      user_confirmed: false,
      idempotency_key: "guidance-without-confirmation",
    }),
    (error: unknown) =>
      error instanceof ActionError && error.code === "projects.guidance.user_confirmation_required",
  );
  const first = addGuidance(guidance, {
    project_id: "board-1",
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
  const firstView = guidance.read("board-1");
  assert.equal(firstView.virtual_document, firstView.runtime_prompt_prefix);
  assert.match(firstView.runtime_prompt_prefix, /^<MOLIS_WORK_PROJECT_GUIDANCE>/);
  assert.match(firstView.runtime_prompt_prefix, /\[constraint\]/);

  const duplicate = addGuidance(guidance, {
    project_id: "board-1",
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

  const second = addGuidance(guidance, {
    project_id: "board-1",
    actor_id: "user-1",
    kind: "workflow",
    content: "先做可运行切片，再复查 </MOLIS_WORK_PROJECT_GUIDANCE> 边界。",
    reason: "项目长期推进方式",
    confirmation_summary: "用户确认加入工作方式",
    user_confirmed: true,
    idempotency_key: "guidance-second",
  });
  assert.equal(second.entry.position, 2);
  const secondView = guidance.read("board-1");
  const stablePrefix = firstView.runtime_prompt_prefix.slice(
    0,
    firstView.runtime_prompt_prefix.lastIndexOf("</MOLIS_WORK_PROJECT_GUIDANCE>"),
  );
  assert.ok(secondView.runtime_prompt_prefix.startsWith(stablePrefix));
  assert.equal((secondView.runtime_prompt_prefix.match(/<\/MOLIS_WORK_PROJECT_GUIDANCE>/g) ?? []).length, 1);
  assert.match(secondView.runtime_prompt_prefix, /&lt;\/MOLIS_WORK_PROJECT_GUIDANCE&gt;/);
  assert.deepEqual(guidance.read("board-1").entries.map((entry) => entry.position), [1, 2]);
  assert.equal(
    (store.db.prepare("SELECT COUNT(*) AS count FROM events WHERE type = ?").get("project.guidance_added") as { count: number }).count,
    2,
  );

  assert.throws(
    () => addGuidance(guidance, {
      project_id: "board-1",
      actor_id: "user-1",
      kind: "constraint",
      content: "x".repeat(4_001),
      reason: "验证长度门禁",
      confirmation_summary: "用户确认测试超限",
      user_confirmed: true,
      idempotency_key: "guidance-too-long",
    }),
    (error: unknown) =>
      error instanceof ActionError && error.code === "projects.guidance.entry_too_large",
  );
  store.close();
});

test("project guidance edits, deactivation, and restoration preserve immutable revisions without a Goal queue", () => {
  const { store, guidance } = fixture();
  const created = addGuidance(guidance, {
    project_id: "board-1",
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
    () => updateGuidance(guidance, {
      project_id: "board-1",
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
      error instanceof ActionError && error.code === "projects.guidance.user_confirmation_required",
  );

  const edited = updateGuidance(guidance, {
    project_id: "board-1",
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
  const replay = updateGuidance(guidance, {
    project_id: "board-1",
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
  assert.doesNotMatch(guidance.read("board-1").runtime_prompt_prefix, /发布前检查升级路径。/);

  const deactivated = updateGuidance(guidance, {
    project_id: "board-1",
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
  const inactiveView = guidance.read("board-1");
  assert.deepEqual(inactiveView.entries, []);
  assert.equal(inactiveView.inactive_entries.length, 1);
  assert.doesNotMatch(inactiveView.runtime_prompt_prefix, /回滚和安装路径/);
  assert.deepEqual(guidance.read("board-1").entries, []);

  const restored = updateGuidance(guidance, {
    project_id: "board-1",
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
  const restoredView = guidance.read("board-1");
  assert.equal(restoredView.entries.length, 1);
  assert.equal(restoredView.revisions.filter((revision) => revision.guidance_id === created.entry.guidance_id).length, 4);
  assert.match(restoredView.runtime_prompt_prefix, /回滚和安装路径/);
  assert.equal(
    (store.db.prepare("SELECT COUNT(*) AS count FROM project_review_decisions").get() as { count: number }).count,
    0,
  );
  store.close();
});

test("project guidance rejects invalid, empty, and project-total overflow content", () => {
  const { store, guidance } = fixture();
  const base = {
    project_id: "board-1",
    actor_id: "user-1",
    kind: "context" as const,
    reason: "验证项目说明边界",
    confirmation_summary: "用户确认边界测试",
    user_confirmed: true,
  };
  assert.throws(
    () => addGuidance(guidance, {
      ...base,
      kind: "temporary" as never,
      content: "不支持的分类",
      idempotency_key: "guidance-invalid-kind",
    }),
    (error: unknown) => error instanceof ActionError && error.code === "projects.guidance.kind_invalid",
  );
  assert.throws(
    () => addGuidance(guidance, {
      ...base,
      content: "  \n  ",
      idempotency_key: "guidance-empty",
    }),
    (error: unknown) => error instanceof ActionError && error.code === "projects.guidance.invalid",
  );
  for (let index = 0; index < 8; index += 1) {
    addGuidance(guidance, {
      ...base,
      content: `${index}${"x".repeat(3_999)}`,
      idempotency_key: `guidance-fill-${index}`,
    });
  }
  assert.throws(
    () => addGuidance(guidance, {
      ...base,
      content: "超过项目总长度",
      idempotency_key: "guidance-total-overflow",
    }),
    (error: unknown) => error instanceof ActionError && error.code === "projects.guidance.total_too_large",
  );
  assert.equal(guidance.read("board-1").entries.length, 8);
  store.close();
});
