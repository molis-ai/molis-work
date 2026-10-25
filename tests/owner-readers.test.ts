import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { fromBetterSqlite, listFeedMaterialContentRefs } from "@molis-ai/molis-work-plugin-feed/store";
import { listListenerRunReceipts, saveListenerRun } from "@molis-ai/molis-work-plugin-feed/store";

// specs/repository-anti-corruption W2-06: a table is read and written only by the package that creates it
// (scripts/gates/table-owners.mjs). The host used to run SQL on four tables it does not own; these are the owners' own
// answers it asks now (Coding's list of background work is its own query now: tests/coding-background-tasks.test.ts). The host-side tests
// (tests/feed-local-history-delete.test.ts, tests/uninstall-catalog.test.ts, tests/im-local-project.test.ts) cover the callers.

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
    assert.deepEqual(listFeedMaterialContentRefs(fromBetterSqlite(store.db)).sort(), ["ref/a", "ref/b"]);

    const run = (id: string, receipt: Record<string, unknown> | null) => saveListenerRun(fromBetterSqlite(store.db), {
      run_id: id, operation_id: `op-${id}`, project_id: DEMO_PROJECT_ID, source_id: "source-1", phase: "terminal", outcome: "completed",
      created_count: 0, deduped_count: 0, recovery_count: 0, empty: true, error_code: null, connector_receipt: receipt,
      started_at: now, completed_at: now, updated_at: now,
    });
    run("r1", { content_refs: ["ref/a"] });
    run("r2", null);
    run("r3", { content_refs: ["ref/c"] });
    assert.deepEqual(listListenerRunReceipts(fromBetterSqlite(store.db)).map((receipt) => (receipt as { content_refs: string[] }).content_refs).sort(), [["ref/a"], ["ref/c"]]);

    // A receipt that cannot be read must not count as holding nothing: the caller proves "unreferenced" from this list.
    store.db.prepare("UPDATE feed_source_runs SET receipt_json = '{broken' WHERE run_id = 'r3'").run();
    assert.throws(() => listListenerRunReceipts(fromBetterSqlite(store.db)), SyntaxError);
  });
});
