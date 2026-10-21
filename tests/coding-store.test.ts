import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import {
  CODING_PROJECT_DATABASE,
  CodingSessionStore,
  toDirectoryEntries,
} from "@molis-ai/molis-work-plugin-coding";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { memoryPluginDatabase } from "./fixtures/plugin-database.js";

/**
 * C3 的数据层：存储跑在平台借出的项目库上（`PluginDatabase`），读同步、写一律先过 `beforeEffect()`。
 * 单元用例用只依赖合同类型的内存库；"真的重开"那一条走宿主真实的服务与文件库。
 */

const BOARD = "board-a";

/** 一个只含 Coding 表的内存库（`coding_*` 外键指向项目根行），和它上面的存储。 */
function open() {
  const database = memoryPluginDatabase(CODING_PROJECT_DATABASE.schema, [BOARD]);
  return { database, store: new CodingSessionStore(database) };
}

test("会话落库并在真正重开数据库之后完整保留", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coding-store-"));
  const path = join(directory, "project.db");
  try {
    seedDemoBoard(path);
    const first = new LocalProjectDatabase(path);
    const store = codingSessions(first);
    await store.create(noEffect, {
      project_id: DEMO_PROJECT_ID,
      session_id: "s1",
      title: "修好 runtime 连接提示",
      runtime_id: "prologue",
      goal_id: "g1",
      at: "2026-09-19T14:00:00Z",
    });
    await store.setState(noEffect, DEMO_PROJECT_ID, "s1", "waiting-approval", "2026-09-19T15:00:00Z");
    first.close();

    // 换一个连接重开，模拟关掉再打开产品
    const second = new LocalProjectDatabase(path);
    const reopened = codingSessions(second).get(DEMO_PROJECT_ID, "s1");
    assert.equal(reopened.title, "修好 runtime 连接提示");
    assert.equal(reopened.state, "waiting-approval");
    assert.equal(reopened.goal_id, "g1");
    assert.equal(reopened.updated_at, "2026-09-19T15:00:00Z");
    assert.equal(reopened.created_at, "2026-09-19T14:00:00Z");
    second.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("关联 Goal 可加可撤，撤掉之后会话还在", async () => {
  const { database, store } = open();
  await store.create(noEffect, { project_id: BOARD, session_id: "s1", title: "无目标", runtime_id: "cli", at: "2026-09-19T14:00:00Z" });
  assert.equal(store.get(BOARD, "s1").goal_id, null);
  assert.equal((await store.setGoal(noEffect, BOARD, "s1", "g9", "2026-09-19T14:10:00Z")).goal_id, "g9");
  assert.equal((await store.setGoal(noEffect, BOARD, "s1", null, "2026-09-19T14:20:00Z")).goal_id, null);
  assert.equal(store.list(BOARD).length, 1, "撤掉关联不等于删掉会话");
  database.close();
});

test("CDSTORE-01/CDSTORE-02: 同一个会话 id 不会被悄悄覆盖", async () => {
  const { database, store } = open();
  const input = { project_id: BOARD, session_id: "s1", title: "第一次", runtime_id: "cli", at: "2026-09-19T14:00:00Z" };
  await store.create(noEffect, input);
  await assert.rejects(store.create(noEffect, { ...input, title: "第二次" }),
    (error: unknown) => error instanceof ActionError && error.code === "coding.session_duplicate" && error.kind === "invalid" && error.message === "会话已存在：s1");
  assert.equal(store.get(BOARD, "s1").title, "第一次");
  database.close();
});

test("归档会话从活动目录移出，直接读取仍保留原执行引用", async () => {
  const { database, store } = open();
  await store.create(noEffect, { project_id: BOARD, session_id: "s1", title: "旧会话", runtime_id: "prologue", at: "2026-09-19T14:00:00Z" });
  await store.setRuntimeSession(noEffect, BOARD, "s1", "runtime-s1", "2026-09-19T15:00:00Z");
  assert.equal((await store.archive(noEffect, BOARD, "s1", "2026-09-19T16:00:00Z")).archived, true);
  assert.equal(store.list(BOARD).length, 0);
  assert.equal(store.get(BOARD, "s1").runtime_session_id, "runtime-s1");
  await assert.rejects(store.archive(noEffect, BOARD, "s1", "2026-09-19T17:00:00Z"), /已归档/);
  await assert.rejects(store.archive(noEffect, BOARD, "s1", "2026-09-19T17:00:00Z"), { code: "coding.session_unknown", message: "会话已归档", kind: "invalid" });
  assert.equal(store.get(BOARD, "s1").runtime_session_id, "runtime-s1");
  database.close();
});

test("Goal 标题在读的时候解析；解析不到就退回 id，会话不会消失", async () => {
  const { database, store } = open();
  await store.create(noEffect, { project_id: BOARD, session_id: "s1", title: "有目标", runtime_id: "cli", goal_id: "g1", at: "2026-09-19T14:00:00Z" });
  await store.create(noEffect, { project_id: BOARD, session_id: "s2", title: "目标没了", runtime_id: "cli", goal_id: "gone", at: "2026-09-19T13:00:00Z" });

  const entries = toDirectoryEntries(store.list(BOARD), (goalId) =>
    goalId === "g1" ? "让首次使用不再卡住" : undefined);
  assert.equal(entries.find((entry) => entry.session_id === "s1")?.goal_title, "让首次使用不再卡住");
  assert.equal(entries.find((entry) => entry.session_id === "s2")?.goal_title, "gone");
  assert.equal(entries.length, 2);
  database.close();
});
