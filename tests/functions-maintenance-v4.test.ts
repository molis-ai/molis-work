import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { applySqliteBaseline, describeSqliteBaseline, describeSqliteSchema, SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";
import { FUNCTIONS_STORE_BASELINE } from "@molis-ai/molis-work-module-functions";

// PG-032 P2 (S-90): the judgment ledger is keyed by the installation that recorded a judgment, so the Functions store goes from
// version 3 to 4. A version 3 store is refused on open; this rehearses the offline maintenance a real Home gets before the new build opens it.
const V3_SCHEMA = FUNCTIONS_STORE_BASELINE.schema.replace(",\n    install_id TEXT", "");
const maintenance = readFileSync(new URL("./fixtures/functions-maintenance-v4.sql", import.meta.url), "utf8");

function fixture(t: TestContext) {
  assert.notEqual(V3_SCHEMA, FUNCTIONS_STORE_BASELINE.schema, "the version 3 schema is the current one without install_id");
  const home = mkdtempSync(join(tmpdir(), "functions-maintenance-v4-")), file = join(home, "functions.db");
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const db = new DatabaseSync(file);
  db.exec(V3_SCHEMA); db.exec("PRAGMA user_version = 3");
  db.prepare(`INSERT INTO function_judgments (judgment_id, function_key, function_version, subject_kind, subject_id, project_id, scene_id, outcome, suggested_json, error_code, created_at)
    VALUES ('kept', 'rule-a', 2, 'feed_item', 'item-1', 'project-1', 'feed.capture', 'ok', '[]', NULL, '2026-10-01T00:00:00.000Z')`).run();
  db.close(); return { file };
}
const read = (file: string) => {
  const db = new DatabaseSync(file);
  try { return { version: db.prepare("PRAGMA user_version").get()!.user_version, schema: describeSqliteSchema(db), judgments: db.prepare("SELECT * FROM function_judgments").all().map(row => ({ ...row })) }; }
  finally { db.close(); }
};
function apply(file: string) {
  const db = new DatabaseSync(file);
  try { db.exec(maintenance); } finally { db.close(); }
}

test("PG-032 P2: a version 3 Functions store is refused untouched; the maintenance adds install_id, keeps every judgment and opens at version 4", t => {
  const { file } = fixture(t), original = read(file), bytes = readFileSync(file);
  const open = () => { const db = new DatabaseSync(file); try { applySqliteBaseline(db, file, FUNCTIONS_STORE_BASELINE); } finally { db.close(); } };
  assert.throws(open, error => error instanceof SqliteSchemaVersionError && error.found === 3 && error.expected === 4);
  assert.deepEqual(readFileSync(file), bytes, "the refusal writes nothing");
  apply(file); const after = read(file);
  assert.equal(after.version, 4);
  assert.deepEqual(after.schema, describeSqliteBaseline(FUNCTIONS_STORE_BASELINE), "the maintained store is exactly the current baseline");
  assert.deepEqual(after.judgments, original.judgments.map(row => ({ ...row, install_id: null })), "every judgment stays, recorded by the Host");
  open();
});

test("PG-032 P2: another version and a failing write roll back the entire Functions maintenance", t => {
  const { file } = fixture(t), original = read(file);
  for (const version of [0, 4]) {
    const db = new DatabaseSync(file); db.exec(`PRAGMA user_version = ${version}`); db.close();
    assert.throws(() => apply(file)); assert.deepEqual(read(file), { ...original, version });
  }
  // A write that fails: the column is already there while the version still says 3.
  const reset = new DatabaseSync(file);
  reset.exec("PRAGMA user_version = 3; ALTER TABLE function_judgments ADD COLUMN install_id TEXT"); reset.close();
  const before = read(file);
  assert.throws(() => apply(file), /duplicate column/);
  assert.deepEqual(read(file), before, "nothing changed, the version is still 3");
});
