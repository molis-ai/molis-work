import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { GoalProjectApplication, LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkV1Error } from "@molis-ai/molis-work-plugin-goals";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-02-create-"));
  const store = new LocalProjectDatabase(join(directory, "project.db"));
  const app = new GoalProjectApplication(store);
  app.initializeBoard({ board_id: "board", title: "创建", actor_id: "user-1", idempotency_key: "init" });
  return { directory, store, app };
}

test("createIntent writes requirements and relations in one retryable operation", () => {
  const data = fixture();
  try {
    const parent = data.app.goalEvents.createIntent({
      board_id: "board", title: "父目标", outcome: "父结果", actor_id: "web-user", actor_kind: "user",
      idempotency_key: "parent", source_kind: "web",
    });
    const before = data.store.snapshot("board");
    data.store.db.exec("CREATE TRIGGER fail_rel BEFORE INSERT ON goal_relations BEGIN SELECT RAISE(ABORT,'rel_fail'); END");
    assert.throws(() => data.app.goalEvents.createIntent({
      board_id: "board", title: "子目标", outcome: "子结果", why: "原因", business_logic: "逻辑",
      priority: 70, parent_goal_id: parent.goal.goal_id, requirements: [{ statement: "可核对" }],
      actor_id: "web-user", actor_kind: "user", idempotency_key: "child", source_kind: "web",
    }), /rel_fail/);
    assert.deepEqual(data.store.snapshot("board").goals.map((goal) => goal.goal_id).sort(), before.goals.map((goal) => goal.goal_id).sort());
    data.store.db.exec("DROP TRIGGER fail_rel");
    const child = data.app.goalEvents.createIntent({
      board_id: "board", title: "子目标", outcome: "子结果", why: "原因", business_logic: "逻辑",
      priority: 70, parent_goal_id: parent.goal.goal_id, requirements: [{ statement: "可核对" }],
      actor_id: "web-user", actor_kind: "user", idempotency_key: "child", source_kind: "web",
    });
    const replay = data.app.goalEvents.createIntent({
      board_id: "board", title: "子目标", outcome: "子结果", why: "原因", business_logic: "逻辑",
      priority: 70, parent_goal_id: parent.goal.goal_id, requirements: [{ statement: "可核对" }],
      actor_id: "web-user", actor_kind: "user", idempotency_key: "child", source_kind: "web",
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.goal.goal_id, child.goal.goal_id);
    for (const field of ["definition_state", "decomposition_state", "fulfillment_state"]) {
      assert.equal(Object.hasOwn(child.goal, field), false);
      assert.equal(Object.hasOwn(replay.goal, field), false);
    }
    const finalCursor = Number(data.store.db.prepare("SELECT MAX(seq) AS n FROM events WHERE board_id=?").get("board")?.n);
    assert.equal(child.observed_event_cursor, finalCursor);
    assert.equal(replay.observed_event_cursor, child.observed_event_cursor);
    const state = data.app.goalEvents.readState("board", child.goal.goal_id);
    assert.equal(state.intent.source_kind, "web");
    assert.equal(state.agreement.outcome, "子结果");
    assert.deepEqual(state.requirements.map((item) => item.statement), ["可核对"]);
    assert.equal(state.can_record, true);
    const list = data.app.goalEvents.listGoals({ board_id: "board" });
    assert.ok(list.goals.some((item) => item.goal_id === child.goal.goal_id && item.can_record));
  } finally {
    data.store.close();
    rmSync(data.directory, { recursive: true, force: true });
  }
});

test("user can revise a createIntent requirement; runtime cannot relax it without a cited decision", () => {
  const data = fixture();
  try {
    const created = data.app.goalEvents.createIntent({
      board_id: "board", title: "付款与收据", outcome: "真实完成付款且可以读到收据",
      actor_id: "web-user", actor_kind: "user", idempotency_key: "child", source_kind: "web",
      requirements: [{ statement: "真实付款成功" }],
    });
    const before = data.app.goalEvents.readState("board", created.goal.goal_id);
    const target = before.requirements[0];
    assert.ok(target);
    assert.equal(target.origin.kind, "create_input");
    assert.equal(target.statement, "真实付款成功");
    const versions = {
      expected_config_version: before.config.version,
      expected_agreement_version: before.agreement.version,
    };
    assert.throws(
      () => data.app.goalEvents.setAgreement({
        board_id: "board", goal_id: created.goal.goal_id, actor_id: "runtime-1", actor_kind: "runtime",
        idempotency_key: "runtime-revise-created", ...versions,
        revise_requirements: [{ requirement_id: target.requirement_id, statement: "Runtime 自行放宽原文" }],
      }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "event_agreement.unauthorized_change",
    );
    const blocked = data.app.goalEvents.readState("board", created.goal.goal_id);
    assert.equal(blocked.requirements[0]?.statement, "真实付款成功");
    assert.equal(blocked.requirements[0]?.origin.kind, "create_input");
    assert.equal(blocked.agreement.version, before.agreement.version);
    data.app.goalEvents.setAgreement({
      board_id: "board", goal_id: created.goal.goal_id, actor_id: "web-user", actor_kind: "user",
      idempotency_key: "user-revise-created", ...versions,
      revise_requirements: [{ requirement_id: target.requirement_id, statement: "用户核对真实付款后可以打开收据" }],
    });
    const revised = data.app.goalEvents.readState("board", created.goal.goal_id);
    assert.equal(revised.requirements[0]?.requirement_id, target.requirement_id);
    assert.equal(revised.requirements[0]?.statement, "用户核对真实付款后可以打开收据");
    assert.equal(revised.requirements[0]?.origin.kind, "create_input");
    assert.ok(data.app.goalEvents.listEvents("board", created.goal.goal_id, { limit: 20 }).events
      .some((event) => event.kind === "system" && event.payload.operation === "intent_created"));
  } finally {
    data.store.close();
    rmSync(data.directory, { recursive: true, force: true });
  }
});

test("listGoals continues from saved sort keys after the cursor goal changes", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-02-page-"));
  const store = new LocalProjectDatabase(join(directory, "project.db"));
  try {
    const app = new GoalProjectApplication(store, () => new Date("2026-09-10T00:00:00.000Z"));
    app.initializeBoard({ board_id: "board", title: "分页", actor_id: "page-user", idempotency_key: "init" });
    for (const goal_id of ["PAGE-A", "PAGE-B", "PAGE-C", "PAGE-D"]) {
      app.goalEvents.createIntent({
        board_id: "board", goal_id, title: goal_id, actor_id: "page-user", actor_kind: "user",
        idempotency_key: `page-create-${goal_id}`,
      });
    }
    const first = app.goalEvents.listGoals({ board_id: "board", limit: 2 });
    assert.deepEqual(first.goals.map((item) => item.goal_id), ["PAGE-A", "PAGE-B"]);
    assert.equal(first.goals[0].updated_at, first.goals[1].updated_at);
    assert.deepEqual(
      app.goalEvents.listGoals({ board_id: "board", limit: 2, after_cursor: first.next_cursor ?? undefined })
        .goals.map((item) => item.goal_id),
      ["PAGE-C", "PAGE-D"],
    );
    const later = new GoalProjectApplication(store, () => new Date("2026-09-10T01:00:00.000Z"));
    const current = app.goalEvents.readState("board", "PAGE-B");
    later.goalEvents.setAgreement({
      board_id: "board", goal_id: "PAGE-B", actor_id: "page-user", actor_kind: "user",
      outcome: "用户修改已翻过的目标",
      expected_config_version: current.config.version,
      expected_agreement_version: current.agreement.version,
      idempotency_key: "page-anchor-change",
    });
    assert.deepEqual(
      later.goalEvents.listGoals({ board_id: "board", limit: 2, after_cursor: first.next_cursor ?? undefined })
        .goals.map((item) => item.goal_id),
      ["PAGE-C", "PAGE-D"],
    );
    later.goals.lifecycle.setTrashed("board", {
      goal_id: "PAGE-B", trashed: true, reason: "移入可恢复回收站验证已有分页",
    }, { actor_id: "page-user", idempotency_key: "page-anchor-trash" });
    assert.deepEqual(
      later.goalEvents.listGoals({ board_id: "board", limit: 2, after_cursor: first.next_cursor ?? undefined })
        .goals.map((item) => item.goal_id),
      ["PAGE-C", "PAGE-D"],
    );
    const before = store.snapshot("board");
    for (const after_cursor of ["not-a-cursor", "not-a-date|PAGE-B", "2026-09-10T00:00:00.000Z|"]) {
      assert.throws(
        () => later.goalEvents.listGoals({ board_id: "board", limit: 2, after_cursor }),
        /游标|cursor|invalid/i,
      );
    }
    assert.throws(
      () => later.goalEvents.listGoals({ board_id: "board", work_status: "not-a-work-status" as "open" }),
      /状态|status|invalid/i,
    );
    assert.deepEqual(store.snapshot("board"), before);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
