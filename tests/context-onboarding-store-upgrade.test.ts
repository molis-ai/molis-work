import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { runSqliteUpgrade } from "@molis-ai/molis-work-storage";
import { CONTEXT_ONBOARDING_BASELINE, withContextJourneys } from "@molis-ai/molis-work-app-local-host";

// D5 (specs/plugin-equal-standing/contract-design.md §2.5, user 2026-11-17): the onboarding journeys' library goes 1 → 2. A version-1 library
// with a round half done (drafted, not adopted) and one whose adoption failed (drafts ticked) upgrades to the platform's shape, keeping what the
// person kept; any shape version 1 never had refuses the step and leaves the library as it was.

const HALF = "11111111-1111-4111-8111-111111111111", FAILED = "22222222-2222-4222-8222-222222222222";
const TODO_BATCH = { batch_id: "batch-1", revision: 3, candidates: [{ candidate_id: "c-1", kind: "request", title: "Reply to Ana", selected: true }], notes: [], reference_only: [] };
const timing = { ms: 1200, calls: 1 };

function v1Home(rows: Record<string, unknown>[]): string {
  const home = mkdtempSync(join(tmpdir(), "molis-onboarding-v1-"));
  mkdirSync(join(home, "context-onboarding"));
  const db = new DatabaseSync(join(home, "context-onboarding", "context-onboarding.db"));
  db.exec("CREATE TABLE journeys (id TEXT PRIMARY KEY, body TEXT NOT NULL, updated_at TEXT NOT NULL); PRAGMA user_version = 1;");
  for (const row of rows) db.prepare("INSERT INTO journeys VALUES (?, ?, ?)").run(String(row.id), JSON.stringify(row), "2026-11-10T00:00:00.000Z");
  db.close();
  return home;
}
const upgrade = (home: string) => {
  const db = new DatabaseSync(join(home, "context-onboarding", "context-onboarding.db"));
  try { return runSqliteUpgrade(db, "context-onboarding", CONTEXT_ONBOARDING_BASELINE); } finally { db.close(); }
};
const version = (home: string) => {
  const db = new DatabaseSync(join(home, "context-onboarding", "context-onboarding.db"));
  try { return (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version; } finally { db.close(); }
};

const halfDone = { id: HALF, phase: "review", project_id: null, sources: [{ kind: "custom", selected: true, references: [{ label: "S1", title: "Notes", documents: undefined }] }],
  summary: { title: "Launch", body: "…", references: [] }, adoption: undefined, document_id: null,
  todo: { status: "ready", key: "k1", batches: [TODO_BATCH], total: 1, error: null, timing } };
const adoptionFailed = { id: FAILED, phase: "failed", project_id: "p-1",
  sources: [{ kind: "custom", selected: true, references: [{ label: "S1", title: "Notes", documents: ["doc-a", "doc-b"] }] }],
  summary: { title: "Launch", body: "…", references: [] }, adoption: { title: "Launch", body: "…", blank: false, todo_selected: ["c-1"] }, document_id: "doc-summary",
  todo: { status: "ready", key: "k1", batches: [TODO_BATCH], total: 1, error: null, timing } };

test("D5: a version-1 journey half done and one whose adoption failed upgrade to version 2, keeping the ticked drafts and the documents kept", t => {
  const home = v1Home([halfDone, adoptionFailed]);
  t.after(() => rmSync(home, { recursive: true, force: true }));
  assert.deepEqual(upgrade(home), { from: 1, to: 2 });
  const [half, failed] = withContextJourneys(home, store => [store.get(HALF), store.get(FAILED)]);
  assert.equal(version(home), 2);
  const drafts = { plugin_id: "io.molis.work.todo", surface: "todo", status: "ready", key: "k1", batches: [{ batch_id: "batch-1", snapshot: null }], total: 1, error: null, timing };
  assert.deepEqual(half.drafts, drafts, "Todo's own batch is not the platform's shape: its id stays, read again when shown");
  assert.equal(Object.hasOwn(half, "todo"), false);
  assert.equal(half.summary_open, null);
  assert.deepEqual(failed.drafts, drafts);
  assert.deepEqual(failed.adoption?.keep, ["c-1"], "what the person ticked before adopting is kept, so a retry still keeps those drafts");
  assert.equal(Object.hasOwn(failed.adoption!, "todo_selected"), false);
  assert.deepEqual(failed.summary_open, { surface: "pages", id: "doc-summary", title: "Launch" });
  assert.deepEqual(failed.sources[0]!.references![0]!.parts, [
    { subject: { kind: "pages_document", id: "doc-a" }, open: { surface: "pages", id: "doc-a", title: "Notes" } },
    { subject: { kind: "pages_document", id: "doc-b" }, open: { surface: "pages", id: "doc-b", title: "Notes" } },
  ], "a material already kept is not kept again on retry");
});

test("D5: a shape version 1 never had refuses the upgrade, and the library stays at version 1", t => {
  const home = v1Home([halfDone, { ...adoptionFailed, adoption: { ...adoptionFailed.adoption, todo_selected: "c-1" } }]);
  t.after(() => rmSync(home, { recursive: true, force: true }));
  assert.throws(() => upgrade(home), (error: Error) => /22222222-2222-4222-8222-222222222222 的 勾选的待办 不是第 1 版的形状/u.test(String((error.cause as Error | undefined)?.message)));
  assert.equal(version(home), 1);
});
