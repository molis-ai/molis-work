import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { describeSqliteSchema, SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";

// ac-trust T1: the installation records of a project library gain the Host's evidence (`publisher_trust`); S9-0b (#1245): Inbox entries
// and Attention events gain an explicit owner. Both together make it version 10. A version 9 library is refused, never upgraded in place;
// the offline maintenance is `tests/fixtures/project-maintenance-v10.sql`, and these cases are its rehearsal.
const before = readFileSync(new URL("./fixtures/project-database-schema-v9.sql", import.meta.url), "utf8");
const maintenance = readFileSync(new URL("./fixtures/project-maintenance-v10.sql", import.meta.url), "utf8");
const target = readFileSync(new URL("./fixtures/project-database-schema-v10.sql", import.meta.url), "utf8");

const record = (installId: string, execution: string) => JSON.stringify({ install_id: installId, plugin_id: `example.${installId}`, execution, version: "1.0.0" });

function fixture(t: TestContext, execution: string[] = ["host", "sandbox"]) {
  const directory = mkdtempSync(join(tmpdir(), "project-maintenance-v10-")), file = join(directory, "project.db");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const db = new DatabaseSync(file); db.exec(before);
  db.exec("PRAGMA user_version = 9; INSERT INTO project_root VALUES ('project', '2026-10-24T00:00:00Z')");
  execution.forEach((kind, index) => db.prepare("INSERT INTO plugin_runtime_installs VALUES (?, ?)").run(`install-${index}`, record(`install-${index}`, kind)));
  db.prepare(`INSERT INTO inbox_entries (rowid, project_id, entry_id, subject_type, subject_id, reason, status, detail_json, revision, created_at, updated_at, completed_at)
    VALUES (41, 'project', 'entry-a', 'feed_item', 'item-1', 'manual', 'done', '{"note":"kept"}', 3, '2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z', '2026-10-02T00:00:00Z')`).run();
  db.prepare(`INSERT INTO attention_events (rowid, event_id, project_id, entry_id, type, subject_type, subject_id, at)
    VALUES (7, 'event-a', 'project', 'entry-a', 'created', 'feed_item', 'item-1', '2026-10-01T00:00:00Z')`).run();
  db.close(); return file;
}
const read = (file: string) => {
  const db = new DatabaseSync(file);
  try { return { version: db.prepare("PRAGMA user_version").get()!.user_version, installs: db.prepare("SELECT * FROM plugin_runtime_installs ORDER BY install_id").all().map(row => ({ ...row })),
    entries: db.prepare("SELECT rowid AS row_id, * FROM inbox_entries ORDER BY entry_id").all().map(row => ({ ...row })),
    events: db.prepare("SELECT rowid AS row_id, * FROM attention_events ORDER BY event_id").all().map(row => ({ ...row })),
    shape: describeSqliteSchema(db), maintenance: db.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%maintenance%' OR name LIKE '%\\_v10' ESCAPE '\\'").all().length }; }
  finally { db.close(); }
};
const apply = (file: string, sql = maintenance) => { const db = new DatabaseSync(file); try { db.exec(sql); } finally { db.close(); } };

test("RAC-397: a version 9 library is refused without being touched; the maintenance gives each record the evidence for its execution and leaves the rest as it was", t => {
  const file = fixture(t), original = read(file);
  assert.equal(original.version, 9);
  assert.throws(() => new LocalProjectDatabase(file), (error: unknown) => error instanceof SqliteSchemaVersionError && error.found === 9 && error.expected === 12);
  assert.deepEqual(read(file), original, "the refusal writes nothing");

  apply(file); const after = read(file);
  assert.equal(after.version, 10);
  assert.deepEqual(after.installs.map(row => [row.install_id, row.publisher_trust]), [["install-0", "host"], ["install-1", "unsigned"]],
    "code run in the Host is host, generated sandboxed code has no evidence");
  for (const row of after.installs) assert.equal(JSON.parse(row.record_json as string).publisher_trust, row.publisher_trust, "the record says what the column says");
  assert.deepEqual(after.installs.map(row => ({ ...JSON.parse(row.record_json as string), publisher_trust: undefined })),
    original.installs.map(row => ({ ...JSON.parse(row.record_json as string), publisher_trust: undefined })), "nothing else of a record changed");
  assert.equal(after.maintenance, 0, "nothing of the script's own stays");
  assert.deepEqual(after.entries, original.entries.map(row => ({ ...row, owner_plugin_id: null })),
    "ATTN-OWNER-07: an old Inbox entry keeps its rowid and every value, and its owner stays unassigned (null), never guessed");
  assert.deepEqual(after.events, original.events.map(row => ({ ...row, owner_plugin_id: null })),
    "ATTN-OWNER-07: an old Attention event keeps its rowid and every value, with a null owner");

  const fresh = new DatabaseSync(":memory:");
  try {
    fresh.exec(target);
    assert.deepEqual(after.shape, describeSqliteSchema(fresh), "table by table the same as the historical version 10 library");
  } finally { fresh.close(); }
  assert.throws(() => new LocalProjectDatabase(file), (error: unknown) => error instanceof SqliteSchemaVersionError && error.found === 10 && error.expected === 12);
  assert.deepEqual(read(file), after, "the current Runtime refuses the historical output without upgrading it");
});

test("RAC-397: the maintenance stops and changes nothing unless the library is version 9 and every record's execution is one it can name", t => {
  const wrong = fixture(t), original = read(wrong);
  const db = new DatabaseSync(wrong); db.exec("PRAGMA user_version = 8"); db.close();
  assert.throws(() => apply(wrong)); assert.deepEqual(read(wrong), { ...original, version: 8 });

  const unnamed = fixture(t, ["host", "elsewhere"]), kept = read(unnamed);
  assert.throws(() => apply(unnamed), /NOT NULL/u, "a record of neither execution is refused, not guessed");
  assert.deepEqual(read(unnamed), kept);

  const widened = fixture(t), before = new DatabaseSync(widened);
  before.exec("ALTER TABLE inbox_entries ADD COLUMN unexpected TEXT"); before.close();
  const widenedBefore = read(widened);
  assert.throws(() => apply(widened), /CHECK/u, "ATTN-OWNER-07: an Attention table with a column the v9 baseline lacks is refused, not copied without it");
  assert.deepEqual(read(widened), widenedBefore);

  const failing = fixture(t), unchanged = read(failing);
  const at = maintenance.lastIndexOf("COMMIT;");
  assert.throws(() => apply(failing, `${maintenance.slice(0, at)}INSERT INTO maintenance_v10_guard VALUES (0);\n${maintenance.slice(at)}`));
  assert.deepEqual(read(failing), unchanged, "a failure after the rebuild rolls the whole maintenance back");
});

test("RAC-397: a library that is already version 10 is refused by the maintenance", t => {
  const file = fixture(t); apply(file);
  assert.throws(() => apply(file));
  assert.equal(read(file).version, 10);
});
