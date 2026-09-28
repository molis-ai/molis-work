import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openPagesStore, releaseGenerationAttempt } from "@molis-ai/molis-work-plugin-pages";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";

const record = { request_id: "lease-1", project_id: "a", request_hash: "hash", status: "running" as const, document_id: null, inputs: [], instructions: "Keep", title: "Lease", error: null, updated_at: new Date().toISOString() };

test("a running generation from another process keeps its lease; an ended attempt of this process is taken over at once", t => {
  const home = mkdtempSync(join(tmpdir(), "pages-generation-lease-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const store = openPagesStore(home);
  try {
    const mine = store.beginGeneration(record);
    // Still in progress here: a second call is told it is still generating.
    assert.throws(() => store.beginGeneration(record), /仍在生成/);
    // This call ended without writing (cancelled or refused): the next call takes the request over.
    releaseGenerationAttempt(mine);
    const next = store.beginGeneration(record);
    assert.notEqual(next.updated_at, mine.updated_at);
    // An attempt this process never started (another process, or a restart) keeps the lease until it ages out.
    const foreign = new Date(Date.now() + 1000).toISOString();
    const db = openHomeSqliteDatabase(home, "pages");
    try { db.prepare("UPDATE page_generations SET updated_at = ?, record_json = json_set(record_json, '$.updated_at', ?) WHERE project_id = ? AND request_id = ?").run(foreign, foreign, "a", "lease-1"); }
    finally { db.close(); }
    assert.throws(() => store.beginGeneration(record), /仍在生成/);
    const aged = new Date(Date.now() - 181_000).toISOString();
    const again = openHomeSqliteDatabase(home, "pages");
    try { again.prepare("UPDATE page_generations SET updated_at = ?, record_json = json_set(record_json, '$.updated_at', ?) WHERE project_id = ? AND request_id = ?").run(aged, aged, "a", "lease-1"); }
    finally { again.close(); }
    assert.equal(store.beginGeneration(record).status, "running");
  } finally { store.close(); }
});
