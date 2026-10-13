import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { CodingSessionStore, CODING_ACTIVE_STATES, listCodingBackgroundSessions } from "@molis-ai/molis-work-plugin-coding";
import { listFeedMaterialContentRefs } from "@molis-ai/molis-work-module-feed";
import { listListenerRunReceipts, saveListenerRun } from "@molis-ai/molis-work-service-listener-host";
import { LocalSqliteStorage } from "@molis-ai/molis-work-storage";

// specs/repository-anti-corruption W2-06: a table is read and written only by the package that creates it
// (scripts/gates/table-owners.mjs). The host used to run SQL on four tables it does not own; these are the owners' own
// answers it asks now. The host-side tests (tests/coding-background-tasks.test.ts, tests/feed-local-history-delete.test.ts,
// tests/uninstall-catalog.test.ts, tests/im-local-project.test.ts) cover the callers.

async function withProject(prefix: string, run: (store: LocalProjectDatabase, directory: string) => void | Promise<void>): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  const store = (() => { const path = join(directory, "project.db"); seedDemoBoard(path); return new LocalProjectDatabase(path); })();
  try { await run(store, directory); } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
}

test("seeding the demo project makes V1 the active Goal through the Goals command, so the journal records the move", async () => {
  await withProject("owner-readers-demo-", (store) => {
    assert.equal(store.goalsQuery.getBoard(DEMO_PROJECT_ID)?.active_goal_id, "V1");
    const moves = store.db.prepare("SELECT object_id, reason FROM events WHERE project_id = ? AND type = 'board.active_goal_changed'").all(DEMO_PROJECT_ID) as Array<{ object_id: string; reason: string }>;
    assert.deepEqual(moves.map((move) => move.object_id), ["V1"]);
    assert.ok(moves[0]!.reason.length > 0);
  });
});

test("Coding lists the sessions that are active or hold the person's open steps, and tolerates a column it cannot parse", async () => {
  await withProject("owner-readers-coding-", (store) => {
    const coding = new CodingSessionStore(store.db);
    const add = (id: string, state: string, at: string) => {
      coding.create({ project_id: DEMO_PROJECT_ID, session_id: id, title: `session ${id}`, runtime_id: "prologue", at });
      coding.setState(DEMO_PROJECT_ID, id, state as never, at);
    };
    add("idle", "idle", "2026-10-01T10:00:00.000Z");
    add("running", "running", "2026-10-01T11:00:00.000Z");
    add("done-with-steps", "done", "2026-10-01T12:00:00.000Z");
    add("done-subtask-only", "done", "2026-10-01T12:30:00.000Z");
    add("archived", "running", "2026-10-01T13:00:00.000Z");
    add("bad-json", "queued", "2026-10-01T14:00:00.000Z");
    coding.setSteps(DEMO_PROJECT_ID, "done-with-steps", { mine: 2, subtasks: 0, unowned: 0 });
    coding.setSteps(DEMO_PROJECT_ID, "done-subtask-only", { mine: 0, subtasks: 3, unowned: 0 });
    coding.setBackground(DEMO_PROJECT_ID, "running", [{ task_id: "t1", summary: "dev server", started_at_ms: 1 }]);
    coding.archive(DEMO_PROJECT_ID, "archived", "2026-10-01T13:30:00.000Z");
    store.db.prepare("UPDATE coding_sessions SET steps_json = 'not json', background_json = '{' WHERE session_id = 'bad-json'").run();

    const sessions = listCodingBackgroundSessions(store.db);
    assert.deepEqual(sessions.map((session) => [session.session_id, session.state, session.active]), [
      ["bad-json", "queued", true],
      ["done-with-steps", "done", false],
      ["running", "running", true],
    ], "newest first; an idle session, an archived one and one whose only open steps belong to subtasks are not listed");
    assert.deepEqual(sessions[1]!.steps, { mine: 2, subtasks: 0, unowned: 0 });
    assert.deepEqual(sessions[2]!.commands, [{ task_id: "t1", summary: "dev server", started_at_ms: 1 }]);
    assert.equal(sessions[0]!.steps, undefined, "a step record that does not parse is absent, not a guess");
    assert.equal(sessions[0]!.commands, undefined);
    assert.ok(CODING_ACTIVE_STATES.includes("running") && !(CODING_ACTIVE_STATES as readonly string[]).includes("done"));
  });
});

test("Coding's reader writes nothing and creates nothing: a database that never held Coding throws, and a read-only handle works", async () => {
  await withProject("owner-readers-coding-readonly-", (store, directory) => {
    new CodingSessionStore(store.db).create({ project_id: DEMO_PROJECT_ID, session_id: "s1", title: "s1", runtime_id: "prologue", at: "2026-10-01T10:00:00.000Z" });
    store.db.prepare("UPDATE coding_sessions SET state = 'running' WHERE session_id = 's1'").run();
    const readOnly = new LocalSqliteStorage(join(directory, "project.db"), { readonly: true });
    try { assert.deepEqual(listCodingBackgroundSessions(readOnly.db).map((session) => session.session_id), ["s1"]); } finally { readOnly.close(); }
    const bare = new LocalSqliteStorage(join(directory, "bare.db"));
    try {
      assert.throws(() => listCodingBackgroundSessions(bare.db), /coding_sessions/);
      assert.equal(bare.db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'coding_sessions'").get(), undefined, "reading did not create the table");
    } finally { bare.close(); }
  });
});

test("Feed lists the evidence bodies its materials point at, and the Listener Host lists the receipts of its run ledger", async () => {
  await withProject("owner-readers-feed-", (store) => {
    const now = "2026-10-01T10:00:00.000Z";
    store.db.prepare(`INSERT INTO feed_items (project_id, item_id, kind, title, source_kind, source_label, origin_status, priority, disposition, source_created_at, source_updated_at, imported_at, updated_at)
      VALUES (?, 'item-1', 'article', 'T', 'rss', 'S', 'original', 'normal', 'inbox', ?, ?, ?, ?)`).run(DEMO_PROJECT_ID, now, now, now, now);
    const material = store.db.prepare(`INSERT INTO feed_materials (project_id, material_id, item_id, title, source_name, content_ref, imported_at, updated_at) VALUES (?, ?, 'item-1', 'M', 'S', ?, ?, ?)`);
    material.run(DEMO_PROJECT_ID, "m1", "ref/a", now, now);
    material.run(DEMO_PROJECT_ID, "m2", "ref/a", now, now);
    material.run(DEMO_PROJECT_ID, "m3", null, now, now);
    material.run(DEMO_PROJECT_ID, "m4", "ref/b", now, now);
    assert.deepEqual(listFeedMaterialContentRefs(store.db).sort(), ["ref/a", "ref/b"]);

    const run = (id: string, receipt: Record<string, unknown> | null) => saveListenerRun(store.db, {
      run_id: id, operation_id: `op-${id}`, project_id: DEMO_PROJECT_ID, source_id: "source-1", phase: "terminal", outcome: "completed",
      created_count: 0, deduped_count: 0, recovery_count: 0, empty: true, error_code: null, connector_receipt: receipt,
      started_at: now, completed_at: now, updated_at: now,
    });
    run("r1", { content_refs: ["ref/a"] });
    run("r2", null);
    run("r3", { content_refs: ["ref/c"] });
    assert.deepEqual(listListenerRunReceipts(store.db).map((receipt) => (receipt as { content_refs: string[] }).content_refs).sort(), [["ref/a"], ["ref/c"]]);

    // A receipt that cannot be read must not count as holding nothing: the caller proves "unreferenced" from this list.
    store.db.prepare("UPDATE feed_source_runs SET receipt_json = '{broken' WHERE run_id = 'r3'").run();
    assert.throws(() => listListenerRunReceipts(store.db), SyntaxError);
  });
});
