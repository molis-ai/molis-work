import assert from "node:assert/strict";
import { chmodSync, cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { LocalProjectDatabase, PROJECT_DATABASE_BASELINE } from "@molis-ai/molis-work-app-local-host";
import { sameActionSourceIdentity } from "@molis-ai/molis-work-contracts/platform/actions";
import { writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import { acquireStorageOwner, describeSqliteSchema, homeSqlitePath, listSqliteObjects, openKnowledgeCards } from "@molis-ai/molis-work-storage";
import { cardFor } from "@molis-ai/molis-work-service-knowledge";
import { maintainCodingKnowledge } from "./fixtures/coding-knowledge-maintenance.mjs";

const mainV11 = readFileSync(new URL("./fixtures/project-database-schema-v11.sql", import.meta.url), "utf8");
const memoryV11 = readFileSync(new URL("./fixtures/project-database-schema-memory-v11.sql", import.meta.url), "utf8");
const projectId = "same-business-project", at = "2026-10-01T00:00:00.000Z";
function withDatabase<T>(file: string, run: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(file); try { return run(db); } finally { db.close(); }
}
function facts(file: string) {
  return withDatabase(file, db => ({ version: db.prepare("PRAGMA user_version").get()!.user_version,
    schema: describeSqliteSchema(db), objects: listSqliteObjects(db),
    rows: Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
      .map(row => {
        const statement = db.prepare(`SELECT * FROM "${String(row.name).replaceAll('"', '""')}"`);
        statement.setReadBigInts(true); // Preserve SQLite int64 values, including FTS internal row IDs.
        return [String(row.name), statement.all()];
      })),
  }));
}
function fixture(t: test.TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "project-data-maintenance-"))), home = join(root, "offline-copy");
  mkdirSync(home); t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(home, "selected-project.db");
  withDatabase(file, db => {
    db.exec(mainV11);
    db.prepare("INSERT INTO project_root(rowid,project_id,created_at) VALUES(7,?,?)").run(projectId, at);
    db.prepare("INSERT INTO events(event_id,project_id,actor_id,type,object_type,object_id,reason,payload_json,at) VALUES('kept-event',?,'original-actor','original-event','original-object','kept','original','{}',?)").run(projectId, at);
    db.exec("PRAGMA user_version = 11; PRAGMA wal_checkpoint(TRUNCATE)");
  });
  return { root, home, file, input: { home, projectDatabase: file, projectIdentity: true } };
}
function rootOf(file: string) {
  return withDatabase(file, db => ({ ...db.prepare("SELECT rowid, * FROM project_root").get() }));
}
function oldKnowledge(home: string) {
  const cards = openKnowledgeCards({ homeDirectory: home });
  const original = { ...cardFor(projectId, { subject: { kind: "note", id: "original" }, source_key: "original-source", provider_id: "original-provider", plugin_id: "original-plugin", plugin_title: "Original", revision: "original-revision", title: "Original", summary: "Original summary", content: "Original text", content_policy: "context", updated_at: null, open: null }),
    state: "ready" as const, brief: "Kept machine words", keywords: ["Kept human words"], edited: ["keywords" as const], organized_revision: "original-revision" };
  cards.put(original); cards.close();
  const file = homeSqlitePath(home, "knowledge");
  withDatabase(file, db => { db.exec("PRAGMA user_version = 3; PRAGMA wal_checkpoint(TRUNCATE)"); });
  return { file, original };
}

test("selected offline main project 11 becomes the exact baseline 12 with one persistent identity and all original rows kept", async t => {
  const f = fixture(t), before = facts(f.file), rootBefore = rootOf(f.file);
  const other = join(f.home, "unselected-project.db"); cpSync(f.file, other); const untouched = readFileSync(other);
  assert.throws(() => new LocalProjectDatabase(f.file), { code: "storage.schema_version_mismatch" });
  assert.deepEqual(facts(f.file), before);
  const listed = await maintainCodingKnowledge("list", f.input);
  assert.deepEqual(listed.stores, [{ kind: "project", from: 11, to: 12 }]); assert.deepEqual(facts(f.file), before);
  const backupDirectory = join(f.root, "before-adoption");
  assert.deepEqual((await maintainCodingKnowledge("apply", { ...f.input, backupDirectory })).completed, ["project"]);
  const after = facts(f.file), current = rootOf(f.file);
  assert.equal(after.version, 12); assert.equal(current.rowid, 7); assert.equal(current.project_id, rootBefore.project_id); assert.equal(current.created_at, rootBefore.created_at);
  assert.equal(typeof current.data_instance_id, "string"); assert.ok(String(current.data_instance_id).trim());
  assert.deepEqual({ ...after.rows, project_root: undefined }, { ...before.rows, project_root: undefined });
  assert.deepEqual(facts(join(backupDirectory, "project.sqlite")), before);
  const expected = new DatabaseSync(":memory:");
  try {
    expected.exec(PROJECT_DATABASE_BASELINE.schema);
    assert.deepEqual(after.schema.tables.project_root, describeSqliteSchema(expected).tables.project_root);
  } finally { expected.close(); }
  withDatabase(f.file, db => {
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.throws(() => db.exec("UPDATE project_root SET data_instance_id = NULL"));
    assert.throws(() => db.exec("UPDATE project_root SET data_instance_id = ' '"));
    assert.throws(() => db.exec("INSERT INTO project_root(project_id,created_at) VALUES('other','now')"));
  });
  const reopened = new LocalProjectDatabase(f.file, { existingOnly: true }); reopened.close();
  assert.deepEqual((await maintainCodingKnowledge("apply", f.input)).completed, []); assert.deepEqual(rootOf(f.file), current);
  assert.deepEqual(readFileSync(other), untouched, "unselected sibling database is never written");
});

test("project commit followed by Knowledge failure keeps the durable identity, preserves old Knowledge and retries only the pending store", async t => {
  const f = fixture(t), knowledge = oldKnowledge(f.home), originalProject = facts(f.file), beforeKnowledge = facts(knowledge.file);
  const prepare = DatabaseSync.prototype.prepare; let injected = false;
  const fault = t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, ...args: Parameters<typeof prepare>) {
    if (!injected && String(args[0]).startsWith("UPDATE knowledge_cards SET body")) { injected = true; throw new Error("injected-knowledge-write-failure"); }
    return Reflect.apply(prepare, this, args);
  });
  const backupDirectory = join(f.root, "partial-backup");
  const outcome = await maintainCodingKnowledge("apply", { ...f.input, knowledge: true, backupDirectory }).then(() => undefined, error => error);
  fault.mock.restore();
  assert.equal(injected, true); assert.ok(outcome instanceof Error); assert.deepEqual(outcome.completed, ["project"]);
  const committed = rootOf(f.file); assert.ok(committed.data_instance_id); assert.equal(facts(f.file).version, 12);
  assert.deepEqual(facts(knowledge.file), beforeKnowledge); assert.deepEqual(facts(join(backupDirectory, "project.sqlite")), originalProject);
  assert.deepEqual(facts(join(backupDirectory, "knowledge.sqlite")), beforeKnowledge);
  assert.throws(() => openKnowledgeCards({ homeDirectory: f.home }), { code: "storage.schema_version_mismatch" });
  assert.deepEqual((await maintainCodingKnowledge("apply", { ...f.input, knowledge: true, backupDirectory: join(f.root, "retry-backup") })).completed, ["knowledge"]);
  assert.deepEqual(rootOf(f.file), committed); assert.equal(facts(knowledge.file).version, 4);
  const current = openKnowledgeCards({ homeDirectory: f.home });
  try { assert.deepEqual(current.get(projectId, { kind: "note", id: "original" }), { ...knowledge.original, retention: { source_identity: null, restoration_operation_id: null } }); }
  finally { current.close(); }
});

test("an interrupted project transaction rolls back root, children and version before retry creates one identity", async t => {
  const f = fixture(t), before = facts(f.file), exec = DatabaseSync.prototype.exec; let injected = false;
  const fault = t.mock.method(DatabaseSync.prototype, "exec", function(this: DatabaseSync, ...args: Parameters<typeof exec>) {
    const result = Reflect.apply(exec, this, args);
    if (!injected && String(args[0]).includes("ALTER TABLE project_root_adopting RENAME")) { injected = true; throw new Error("injected-after-root-rebuild"); }
    return result;
  });
  const outcome = await maintainCodingKnowledge("apply", { ...f.input, backupDirectory: join(f.root, "rollback-backup") }).then(() => undefined, error => error);
  fault.mock.restore(); assert.equal(injected, true); assert.ok(outcome instanceof Error); assert.deepEqual(outcome.completed, []);
  assert.deepEqual(facts(f.file), before); assert.deepEqual(facts(join(f.root, "rollback-backup", "project.sqlite")), before);
  await maintainCodingKnowledge("apply", { ...f.input, backupDirectory: join(f.root, "successful-backup") });
  assert.ok(rootOf(f.file).data_instance_id); assert.equal(facts(f.file).version, 12);
});

test("full consistent restore keeps the instance while partial Knowledge import cannot replace an existing target instance", async t => {
  const f = fixture(t); oldKnowledge(f.home);
  await maintainCodingKnowledge("apply", { ...f.input, knowledge: true, backupDirectory: join(f.root, "before") });
  const identity = String(rootOf(f.file).data_instance_id), sourceIdentity = { kind: "project-data" as const, data_instance_id: identity };
  const sourceCards = openKnowledgeCards({ homeDirectory: f.home });
  try {
    sourceCards.put({ ...sourceCards.get(projectId, { kind: "note", id: "original" })!,
      adoption: { operation_id: "confirmed-original", actor_id: "original-user", source_revision: "original-revision", source_identity: sourceIdentity },
      retention: { source_identity: sourceIdentity, restoration_operation_id: null } });
  } finally { sourceCards.close(); }
  const full = join(f.root, "complete-snapshot"); cpSync(f.home, full, { recursive: true, filter: source => !basename(source).startsWith(".molis-runtime-owner.db") });
  const restored = join(f.root, "restored-copy"); cpSync(full, restored, { recursive: true });
  const restoredFile = join(restored, "selected-project.db");
  assert.deepEqual((await maintainCodingKnowledge("apply", { home: restored, projectDatabase: restoredFile, projectIdentity: true, knowledge: true })).completed, []);
  assert.equal(rootOf(restoredFile).data_instance_id, identity);
  assert.deepEqual(facts(homeSqlitePath(restored, "knowledge")), facts(homeSqlitePath(f.home, "knowledge")));
  const target = join(f.root, "existing-target"); mkdirSync(target); const targetFile = join(target, "selected-project.db");
  const live = new LocalProjectDatabase(targetFile); writeProjectRoot(live.db, projectId, at); live.close();
  const targetIdentity = rootOf(targetFile).data_instance_id; assert.notEqual(targetIdentity, identity);
  mkdirSync(join(target, "knowledge")); cpSync(homeSqlitePath(f.home, "knowledge"), homeSqlitePath(target, "knowledge"));
  assert.deepEqual((await maintainCodingKnowledge("apply", { home: target, projectDatabase: targetFile, projectIdentity: true, knowledge: true })).completed, []);
  assert.equal(rootOf(targetFile).data_instance_id, targetIdentity, "importing cards cannot copy their source instance into the target root");
  const imported = openKnowledgeCards({ homeDirectory: target });
  try {
    const adoption = imported.get(projectId, { kind: "note", id: "original" })!.adoption!;
    assert.deepEqual(adoption.source_identity, sourceIdentity, "the import preserves its true original identity");
    assert.equal(sameActionSourceIdentity(adoption.source_identity, { kind: "project-data", data_instance_id: String(targetIdentity) }), false);
  } finally { imported.close(); }
});

test("missing selection, running owner, old version, unknown structure and unsafe files refuse without changing another store", async t => {
  for (const kind of ["unselected", "missing", "owner", "version", "unknown", "third-party", "symlink", "hardlink", "readonly", "cancelled"] as const) await t.test(kind, async t => {
    const f = fixture(t), knowledge = oldKnowledge(f.home), knowledgeBefore = readFileSync(knowledge.file);
    let input: Record<string, unknown> = { ...f.input, knowledge: true, backupDirectory: join(f.root, "refused-backup") }, owner: ReturnType<typeof acquireStorageOwner> | undefined;
    if (kind === "unselected") input = { home: f.home, projectIdentity: true, knowledge: true, backupDirectory: join(f.root, "refused-backup") };
    if (kind === "missing") input.projectDatabase = join(f.home, "absent.db");
    if (kind === "owner") owner = acquireStorageOwner(join(f.home, "agent-runtime"));
    if (kind === "version") withDatabase(f.file, db => db.exec("PRAGMA user_version = 9"));
    if (kind === "unknown") withDatabase(f.file, db => db.exec("CREATE TRIGGER unknown_change AFTER UPDATE ON project_root BEGIN DELETE FROM events; END"));
    if (kind === "third-party") withDatabase(f.file, db => db.prepare("INSERT INTO plugin_project_databases VALUES('unknown.plugin','unknown-publisher','unknown-store',1,'[]',?)").run(at));
    if (kind === "symlink") { const alias = join(f.home, "alias.db"); symlinkSync(f.file, alias); input.projectDatabase = alias; }
    if (kind === "hardlink") linkSync(f.file, join(f.home, "alias.db"));
    if (kind === "readonly") chmodSync(f.file, 0o400);
    if (kind === "cancelled") { const signal = new AbortController(); signal.abort(); input.signal = signal.signal; }
    const before = readFileSync(f.file);
    try { await assert.rejects(maintainCodingKnowledge("apply", input)); } finally { owner?.release(); }
    assert.deepEqual(readFileSync(f.file), before); assert.deepEqual(readFileSync(knowledge.file), knowledgeBefore);
    if (kind !== "readonly") assert.equal(existsSync(join(f.root, "refused-backup")), false);
    assert.equal(existsSync(join(f.home, "absent.db")), false);
  });
});


// MEM-PROJECT-V12-02: the true old Memory 11 shape must fail at the format gate, before backups or selected-store writes.
test("the old Memory 11 structure is refused by normal opening and every selected maintenance before backup or another store changes", async t => {
  for (const mode of ["list", "apply"] as const) for (const selection of ["project", "coding", "both"] as const) await t.test(`${mode}: ${selection}`, async t => {
    const f = fixture(t), knowledge = oldKnowledge(f.home);
    const oldFile = join(f.home, "old-memory-11.db");
    withDatabase(oldFile, db => {
      db.exec("PRAGMA journal_mode = WAL");
      db.exec(memoryV11);
      db.prepare("INSERT INTO project_root(rowid,project_id,created_at,data_instance_id) VALUES(7,?,?,?)").run(projectId, at, "original-memory-instance");
      db.exec("PRAGMA user_version = 11; PRAGMA wal_checkpoint(TRUNCATE)");
    });
    const before = readFileSync(oldFile), knowledgeBefore = readFileSync(knowledge.file), siblingBefore = readFileSync(f.file);
    assert.throws(() => new LocalProjectDatabase(oldFile), { code: "storage.schema_version_mismatch" });
    assert.throws(() => new LocalProjectDatabase(oldFile, { existingOnly: true }), { code: "catalog.project_recovery_unsupported_schema" });
    const backupDirectory = join(f.root, "refused-old-memory-backup");
    const expectedCause = selection === "coding"
      ? "Finish the original project v8/v9/v10/v11 and project identity v12 maintenance first"
      : "Project original schema has unknown or altered objects";
    await assert.rejects(maintainCodingKnowledge(mode, { home: f.home, projectDatabase: oldFile,
      projectIdentity: selection !== "coding", ...(selection !== "project" ? { publisher: "official-coding-binding" } : {}), knowledge: true, backupDirectory }), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(error.cause instanceof Error);
      assert.equal(error.cause.message, expectedCause);
      return true;
    });
    assert.deepEqual(readFileSync(oldFile), before);
    assert.deepEqual(readFileSync(knowledge.file), knowledgeBefore);
    assert.deepEqual(readFileSync(f.file), siblingBefore);
    assert.equal(existsSync(backupDirectory), false);
  });
});
