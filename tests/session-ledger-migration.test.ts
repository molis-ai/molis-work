import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { MolisWorkSessionRegistry } from "@molis-ai/molis-work-module-private-work-context";

const scope = { kind: "personal", id: "private-work-context" } as const;
const readAccess = { actor_id: "test-reader", scope };

async function legacyFixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-session-ledger-"));
  const homeDirectory = path.join(directory, "home");
  const registry = await openWorkSessionRegistry({ homeDirectory });
  const session = registry.createSession({ runtime_id: "codex", actor_id: "user", user_confirmed: true });
  const databasePath = registry.databasePath;
  registry.close();
  const db = new Database(databasePath);
  db.prepare("UPDATE session_meta SET value = '3' WHERE key = 'schema_version'").run();
  db.prepare("UPDATE sessions SET project_id = 'project-now', current_goal_id = 'same-goal', workspace_id = 'workspace-now' WHERE session_id = ?")
    .run(session.session_id);
  const insert = db.prepare("INSERT INTO session_goal_links VALUES (?, ?, ?, ?, ?, ?, ?)");
  insert.run("link-old", session.session_id, "old-goal", "history", "old-user", "2026-08-01T00:00:00Z", "2026-08-02T00:00:00Z");
  insert.run("link-unknown-end", session.session_id, "other-goal", "history", "other-user", "2026-08-03T00:00:00Z", null);
  insert.run("link-current", session.session_id, "same-goal", "current", "current-user", "2026-08-04T00:00:00Z", null);
  db.close();
  return { directory, homeDirectory, databasePath, sessionId: session.session_id };
}

test("v3 Session associations migrate without guessing historic Projects and survive real reopen", async () => {
  const fixture = await legacyFixture();
  try {
    let registry = await openWorkSessionRegistry({ homeDirectory: fixture.homeDirectory });
    try {
      const value = registry.get(fixture.sessionId);
      assert.equal(value.project_id, "project-now");
      assert.equal(value.current_goal_id, "same-goal");
      assert.equal(value.workspace_id, "workspace-now");
      assert.deepEqual(registry.goalHistory(fixture.sessionId), [
        { link_id: "link-current", session_id: fixture.sessionId, goal_id: "same-goal", relation: "current", linked_by: "current-user", created_at: "2026-08-04T00:00:00Z", ended_at: null },
        { link_id: "link-unknown-end", session_id: fixture.sessionId, goal_id: "other-goal", relation: "history", linked_by: "other-user", created_at: "2026-08-03T00:00:00Z", ended_at: null },
        { link_id: "link-old", session_id: fixture.sessionId, goal_id: "old-goal", relation: "history", linked_by: "old-user", created_at: "2026-08-01T00:00:00Z", ended_at: "2026-08-02T00:00:00Z" },
      ]);
    } finally { registry.close(); }
    registry = await openWorkSessionRegistry({ homeDirectory: fixture.homeDirectory });
    try {
      assert.equal(registry.goalHistory(fixture.sessionId).length, 3);
      registry.updateAssociations({ session_id: fixture.sessionId, actor_id: "moving-user", user_confirmed: true,
        project_id: "project-next", current_goal_id: "same-goal", workspace_id: null });
      assert.equal(registry.list({ project_id: "project-now" }).length, 0);
      assert.equal(registry.list({ project_id: "project-next" })[0]?.session_id, fixture.sessionId);
      assert.equal(registry.goalHistory(fixture.sessionId).length, 4, "同名 Goal 在不同 Project 是不同引用");
      assert.equal(registry.goalHistory(fixture.sessionId)[0]?.linked_by, "moving-user");
    } finally { registry.close(); }
    const db = new Database(fixture.databasePath);
    try {
      assert.deepEqual(db.prepare("SELECT project_id, current_goal_id, workspace_id FROM sessions").get(),
        { project_id: null, current_goal_id: null, workspace_id: null });
      assert.deepEqual(db.prepare("SELECT * FROM session_goal_links").all(), []);
      const ledger = createContextLedger(db, { authorize: () => true });
      assert.equal(ledger.query.history(readAccess, "link-old")[0]?.target.project_id, null);
      assert.equal(ledger.query.history(readAccess, "link-current")[0]?.target.project_id, "project-now");
      assert.equal(ledger.query.list(readAccess, { type: "work.goal" })[0]?.target.project_id, "project-next");
    } finally { db.close(); }
  } finally { await rm(fixture.directory, { recursive: true, force: true }); }
});

test("failed Session Ledger migration rolls back links, scalars and schema version together", async () => {
  const fixture = await legacyFixture();
  try {
    await assert.rejects(MolisWorkSessionRegistry.open({ homeDirectory: fixture.homeDirectory, createLedger: (db) => {
      const ledger = createContextLedger(db, { authorize: () => true });
      let writes = 0;
      return { query: ledger.query, commands: { ...ledger.commands, put: (access, input) => {
        if (++writes === 2) throw new Error("injected migration failure");
        return ledger.commands.put(access, input);
      } } };
    } }), /injected migration failure/);
    const db = new Database(fixture.databasePath);
    try {
      assert.deepEqual(db.prepare("SELECT value FROM session_meta WHERE key = 'schema_version'").get(), { value: "3" });
      assert.deepEqual(db.prepare("SELECT project_id, current_goal_id, workspace_id FROM sessions").get(),
        { project_id: "project-now", current_goal_id: "same-goal", workspace_id: "workspace-now" });
      assert.equal(db.prepare("SELECT * FROM session_goal_links").all().length, 3);
      assert.deepEqual(db.prepare("SELECT * FROM context_edges").all(), []);
    } finally { db.close(); }
    const retried = await openWorkSessionRegistry({ homeDirectory: fixture.homeDirectory });
    try { assert.equal(retried.goalHistory(fixture.sessionId).length, 3); } finally { retried.close(); }
  } finally { await rm(fixture.directory, { recursive: true, force: true }); }
});

test("Session association changes roll back all edges if one Ledger write fails", async () => {
  const fixture = await legacyFixture();
  let fail = false;
  try {
    const registry = await MolisWorkSessionRegistry.open({ homeDirectory: fixture.homeDirectory, createLedger: (db) => {
      const ledger = createContextLedger(db, { authorize: () => true });
      return { query: ledger.query, commands: { ...ledger.commands, put: (access, input) => {
        if (fail && input.type === "work.project") throw new Error("project edge failure");
        return ledger.commands.put(access, input);
      } } };
    } });
    try {
      const before = registry.get(fixture.sessionId);
      const history = registry.goalHistory(fixture.sessionId);
      fail = true;
      assert.throws(() => registry.updateAssociations({ session_id: fixture.sessionId, actor_id: "user", user_confirmed: true,
        project_id: "project-next", current_goal_id: "next-goal", workspace_id: "next-workspace", workspace_path: "/tmp/next-workspace" }), /project edge failure/);
      assert.deepEqual(registry.get(fixture.sessionId), before);
      assert.deepEqual(registry.goalHistory(fixture.sessionId), history);
    } finally { registry.close(); }
  } finally { await rm(fixture.directory, { recursive: true, force: true }); }
});

test("inconsistent v3 current Goal is rejected without erasing either legacy fact", async () => {
  const fixture = await legacyFixture();
  try {
    let db = new Database(fixture.databasePath);
    db.prepare("UPDATE sessions SET current_goal_id = 'conflicting-goal'").run();
    db.close();
    await assert.rejects(openWorkSessionRegistry({ homeDirectory: fixture.homeDirectory }), /当前 Goal 与历史关联不一致/);
    db = new Database(fixture.databasePath);
    try {
      assert.deepEqual(db.prepare("SELECT current_goal_id FROM sessions").get(), { current_goal_id: "conflicting-goal" });
      assert.equal(db.prepare("SELECT * FROM session_goal_links").all().length, 3);
      assert.deepEqual(db.prepare("SELECT * FROM context_edges").all(), []);
    } finally { db.close(); }
  } finally { await rm(fixture.directory, { recursive: true, force: true }); }
});

test("v1 schema upgrade rolls back too when Ledger construction fails", async () => {
  const fixture = await legacyFixture();
  try {
    let db = new Database(fixture.databasePath);
    db.exec("DROP TABLE session_events; DROP TABLE session_handoffs; UPDATE session_meta SET value = '1' WHERE key = 'schema_version';");
    db.close();
    await assert.rejects(MolisWorkSessionRegistry.open({ homeDirectory: fixture.homeDirectory,
      createLedger: () => { throw new Error("ledger unavailable"); },
    }), /ledger unavailable/);
    db = new Database(fixture.databasePath);
    try {
      assert.deepEqual(db.prepare("SELECT value FROM session_meta WHERE key = 'schema_version'").get(), { value: "1" });
      assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name IN ('session_events', 'session_handoffs')").all().length, 0);
      assert.equal(db.prepare("SELECT * FROM session_goal_links").all().length, 3);
    } finally { db.close(); }
    const retry = await openWorkSessionRegistry({ homeDirectory: fixture.homeDirectory });
    try { assert.equal(retry.get(fixture.sessionId).current_goal_id, "same-goal"); } finally { retry.close(); }
  } finally { await rm(fixture.directory, { recursive: true, force: true }); }
});
