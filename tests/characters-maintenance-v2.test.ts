import { registerMaintenanceChecks } from "./fixtures/home-store-maintenance.mjs";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { describeSqliteBaseline, describeSqliteSchema, SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";
import { CHARACTERS_STORE_BASELINE, openCharacterRuns, openCharacters } from "@molis-ai/molis-work-module-characters";

// Sessions cleanup SC-2 (D3): Characters records its native runs itself, so its store goes from version 1 to 2. A version 1
// store is refused on open; this rehearses the offline maintenance a real Home gets before the new build opens it.
const V1_SCHEMA = `CREATE TABLE character_drafts (
  character_id TEXT PRIMARY KEY,
  owner_actor_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  record TEXT NOT NULL
);`;
const maintenance = readFileSync(new URL("./fixtures/characters-maintenance-v2.sql", import.meta.url), "utf8");
const draft = { character_id: "kept", owner_actor_id: "owner", revision: 3, state: "active", title: "Kept", instructions: "Keep my edits", host_tools: null,
  created_at: "2026-10-01T00:00:00.000Z", updated_at: "2026-10-02T00:00:00.000Z" };

function fixture(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "characters-maintenance-v2-")), directory = join(home, "characters"), file = join(directory, "characters.sqlite");
  t.after(() => rmSync(home, { recursive: true, force: true }));
  mkdirSync(directory);
  const db = new DatabaseSync(file);
  db.exec(V1_SCHEMA); db.exec("PRAGMA user_version = 1");
  db.prepare("INSERT INTO character_drafts VALUES (?, ?, ?, ?, ?)").run(draft.character_id, draft.owner_actor_id, draft.revision, draft.updated_at, JSON.stringify(draft));
  db.close(); return { home, file };
}
const read = (file: string) => {
  const db = new DatabaseSync(file);
  try { return { version: db.prepare("PRAGMA user_version").get()!.user_version, schema: describeSqliteSchema(db),
    drafts: db.prepare("SELECT * FROM character_drafts").all().map(row => ({ ...row })) }; }
  finally { db.close(); }
};
function apply(file: string) {
  const db = new DatabaseSync(file);
  try { registerMaintenanceChecks(db, "characters"); db.exec(maintenance); } finally { db.close(); }
}

test("SC-2: a version 1 Characters store is refused untouched; the maintenance adds the runs table, keeps every draft and opens at version 2", t => {
  const { home, file } = fixture(t), original = read(file), bytes = readFileSync(file);
  assert.throws(() => openCharacters(home, "owner"), error => error instanceof SqliteSchemaVersionError && error.found === 1 && error.expected === 2);
  assert.deepEqual(readFileSync(file), bytes, "the refusal writes nothing");
  apply(file); const after = read(file);
  assert.equal(after.version, 2);
  assert.deepEqual(after.schema, describeSqliteBaseline(CHARACTERS_STORE_BASELINE), "the maintained store is exactly the current baseline");
  assert.deepEqual(after.drafts, original.drafts);
  const opened = openCharacters(home, "owner");
  try { assert.deepEqual(opened.service.get("kept"), draft); } finally { opened.close(); }
  const runs = openCharacterRuns(home, "owner", "project");
  try { assert.deepEqual(runs.runs.list("kept"), [], "past runs are not carried over"); } finally { runs.close(); }
});

test("SC-2: another version and a failing write roll back the entire Characters maintenance", t => {
  const { file } = fixture(t), original = read(file);
  for (const version of [0, 2]) {
    const db = new DatabaseSync(file); db.exec(`PRAGMA user_version = ${version}`); db.close();
    assert.throws(() => apply(file)); assert.deepEqual(read(file), { ...original, version });
  }
  // A write that fails after the runs table is made: an index of that name already stands on the drafts.
  const reset = new DatabaseSync(file);
  reset.exec("PRAGMA user_version = 1; CREATE INDEX character_runs_by_character ON character_drafts (owner_actor_id)"); reset.close();
  assert.throws(() => apply(file), /maintenance schema mismatch/);
  const after = read(file);
  assert.equal(after.version, 1); assert.deepEqual(after.drafts, original.drafts);
  assert.deepEqual(Object.keys(after.schema.tables), ["character_drafts"], "the runs table made before the failure is rolled back");
});
