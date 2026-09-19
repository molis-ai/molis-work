import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  CodingSessionStore,
  CodingStoreError,
  toDirectoryEntries,
} from "@molis-ai/molis-work-plugin-coding";

/** C3 的数据层：真实 SQLite，含一次真的重开。 */

const BOARD = "board-a";

function open(path: string) {
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE IF NOT EXISTS boards (board_id TEXT PRIMARY KEY)");
  db.prepare("INSERT OR IGNORE INTO boards (board_id) VALUES (?)").run(BOARD);
  return db;
}

test("会话落库并在真正重开数据库之后完整保留", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coding-store-"));
  const path = join(directory, "project.db");
  try {
    const first = open(path);
    const store = new CodingSessionStore(first);
    store.create({
      board_id: BOARD,
      session_id: "s1",
      title: "修好 runtime 连接提示",
      runtime_id: "prologue",
      goal_id: "g1",
      at: "2026-09-19T14:00:00Z",
    });
    store.setState(BOARD, "s1", "waiting-approval", "2026-09-19T15:00:00Z");
    first.close();

    // 换一个连接重开，模拟关掉再打开产品
    const second = open(path);
    const reopened = new CodingSessionStore(second).get(BOARD, "s1");
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
  const directory = await mkdtemp(join(tmpdir(), "coding-store-"));
  try {
    const db = open(join(directory, "project.db"));
    const store = new CodingSessionStore(db);
    store.create({ board_id: BOARD, session_id: "s1", title: "无目标", runtime_id: "cli", at: "2026-09-19T14:00:00Z" });
    assert.equal(store.get(BOARD, "s1").goal_id, null);
    assert.equal(store.setGoal(BOARD, "s1", "g9", "2026-09-19T14:10:00Z").goal_id, "g9");
    assert.equal(store.setGoal(BOARD, "s1", null, "2026-09-19T14:20:00Z").goal_id, null);
    assert.equal(store.list(BOARD).length, 1, "撤掉关联不等于删掉会话");
    db.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("同一个会话 id 不会被悄悄覆盖", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coding-store-"));
  try {
    const db = open(join(directory, "project.db"));
    const store = new CodingSessionStore(db);
    const input = { board_id: BOARD, session_id: "s1", title: "第一次", runtime_id: "cli", at: "2026-09-19T14:00:00Z" };
    store.create(input);
    assert.throws(() => store.create({ ...input, title: "第二次" }),
      (error: unknown) => error instanceof CodingStoreError && error.code === "coding.session_duplicate");
    assert.equal(store.get(BOARD, "s1").title, "第一次");
    db.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Goal 标题在读的时候解析；解析不到就退回 id，会话不会消失", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coding-store-"));
  try {
    const db = open(join(directory, "project.db"));
    const store = new CodingSessionStore(db);
    store.create({ board_id: BOARD, session_id: "s1", title: "有目标", runtime_id: "cli", goal_id: "g1", at: "2026-09-19T14:00:00Z" });
    store.create({ board_id: BOARD, session_id: "s2", title: "目标没了", runtime_id: "cli", goal_id: "gone", at: "2026-09-19T13:00:00Z" });

    const entries = toDirectoryEntries(store.list(BOARD), (goalId) =>
      goalId === "g1" ? "让首次使用不再卡住" : undefined);
    assert.equal(entries.find((entry) => entry.session_id === "s1")?.goal_title, "让首次使用不再卡住");
    assert.equal(entries.find((entry) => entry.session_id === "s2")?.goal_title, "gone");
    assert.equal(entries.length, 2);
    db.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
