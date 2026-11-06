import assert from "node:assert/strict";
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { inspectMolisWorkProjectCatalogSnapshot, openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createHomeSnapshot, restoreHomeSnapshot } from "@molis-ai/molis-work-app-local-host";
import { personalStorageSpace, assertExistingHomeKeyReference, createEvidenceContentStore, createLazyFileSecretStore, inspectEvidenceContentSnapshot, inspectSealedSecretsSnapshot, inspectSnapshotSqlite, inspectMemoryLedger, openMemoryLedger, LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import { restoreFixture } from "./fixtures/home-restore.js";
import { homeStorageTree, homeBusinessTree } from "./fixtures/home-storage-files.js";
import { captureSqliteError, smallSnapshotHome } from "./fixtures/home-snapshot-small.js";

test("RAC-2915: the actual current Catalog, including its context ledger, passes zero-write archive inspection", { timeout: 30_000 }, async t => {
  const f = await restoreFixture(t), catalog = await openMolisWorkProjectCatalog({ homeDirectory: f.home });
  try { await catalog.createProject({ display_name: "Archived actual project", actor_id: "catalog-inspection-person" }); }
  finally { catalog.close(); }
  await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot });
  const source = join(f.snapshot, "data", "projects", "catalog.db"), bytes = readFileSync(source), siblings = readdirSync(join(f.snapshot, "data", "projects"));
  const inspected = inspectSnapshotSqlite(source, { inspect: inspectMolisWorkProjectCatalogSnapshot });
  assert.equal(inspected.owner_versions.owner, "molis-work-project-catalog-v1");
  assert.equal(inspected.integrity_check, "ok");
  assert.throws(() => inspectSnapshotSqlite(source, {
    inspect: inspectMolisWorkProjectCatalogSnapshot, requireSpace: true,
    space: personalStorageSpace("https://auth.example.test", "work", "different-account"),
  }), /空间归属与 Home 不同/u, "a complete, authentic catalog of a different space must still be refused");
  assert.deepEqual(readFileSync(source), bytes); assert.deepEqual(readdirSync(join(f.snapshot, "data", "projects")), siblings);
  for (const [name, sql] of [
    ["missing-ledger", "DROP TABLE context_edges"],
    ["changed-ledger", "ALTER TABLE context_edges ADD COLUMN unrelated TEXT"],
    ["unexpected-table", "CREATE TABLE unrelated_owner (id TEXT)"],
    ["missing-sync-trigger", "DROP TRIGGER projects_sync_events"],
    ["changed-sync-trigger", "DROP TRIGGER projects_sync_events; CREATE TRIGGER projects_sync_events AFTER INSERT ON project_events BEGIN SELECT 1; END"],
    ["unsolicited-trigger", "CREATE TRIGGER unowned_trigger AFTER DELETE ON projects BEGIN SELECT 1; END"],
  ] as const) {
    const malformed = join(f.directory, name + ".db"); copyFileSync(source, malformed);
    const storage = openTestSqlite(malformed);
    try { storage.exec(sql); } finally { storage.close(); }
    const original = readFileSync(malformed);
    assert.throws(() => inspectSnapshotSqlite(malformed, { inspect: inspectMolisWorkProjectCatalogSnapshot }), { code: "catalog.database_invalid" }, name);
    assert.deepEqual(readFileSync(malformed), original, name + " refuses without altering the input");
  }
});

test("RAC-2915: archived evidence authenticates through the owner's recovery overlay and original master without the live vault", { timeout: 30_000 }, async t => {
  const f = await restoreFixture(t), root = join(f.home, "feed", "evidence");
  const content = createEvidenceContentStore({ rootDirectory: root, secretStore: createLazyFileSecretStore(f.home) });
  const text = "Original evidence recovered by the actual owner", ref = content.write(text).contentRef, digest = ref.split("/").at(-1)!;
  writeFileSync(join(root, "blobs", digest.slice(0, 2), digest + ".blob"), "damaged historical body");
  assert.equal(content.write(text).contentRef, ref); assert.equal(content.read(ref), text);
  await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot });
  const feed = join(f.snapshot, "data", "feed"), vault = readFileSync(join(feed, "secrets.json"), "utf8");
  const reference = inspectSealedSecretsSnapshot(f.home, vault).key_reference;
  assert.ok(reference); assert.equal(reference.location, "home:feed/secrets.key");
  const keyPath = join(f.home, "feed", "secrets.key"), key = readFileSync(keyPath);
  rmSync(join(f.home, "feed", "secrets.json"));
  const before = readdirSync(join(f.home, "feed")).sort();
  assert.deepEqual(inspectEvidenceContentSnapshot(f.home, feed, vault), { contents: 1 });
  assertExistingHomeKeyReference(f.home, reference);
  assert.throws(() => assertExistingHomeKeyReference(f.home, { ...reference, location: "home:outside-owner.key" }));
  assert.throws(() => assertExistingHomeKeyReference(f.home, { ...reference, sha256: "0".repeat(64) }));
  const current = join(feed, "evidence-recovered-v2", "blobs", digest.slice(0, 2), digest + ".blob"), bytes = readFileSync(current);
  writeFileSync(current, "damaged current body");
  assert.throws(() => inspectEvidenceContentSnapshot(f.home, feed, vault), { code: "storage.evidence_snapshot.invalid" });
  writeFileSync(current, bytes);
  writeFileSync(keyPath, Buffer.alloc(32, 173).toString("base64"));
  try { assert.throws(() => inspectEvidenceContentSnapshot(f.home, feed, vault), { code: "storage.evidence_snapshot.invalid" }); }
  finally { writeFileSync(keyPath, key); }
  assert.deepEqual(inspectEvidenceContentSnapshot(f.home, feed, vault), { contents: 1 });
  assert.deepEqual(readdirSync(join(f.home, "feed")).sort(), before); assert.deepEqual(readFileSync(keyPath), key);
  assert.deepEqual(readFileSync(current), bytes);
});

function standaloneArchive(t: TestContext) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "molis-restore-sqlite-reader-")));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, "archive.db");
  const database = openTestSqlite(file);
  try {
    database.pragma("user_version = 3");
    database.exec("CREATE TABLE saved (id TEXT PRIMARY KEY, body TEXT); INSERT INTO saved VALUES ('original', 'saved owner content')");
  } finally { database.close(); }
  return { directory, file };
}

test("RAC-2915: the restore SQLite reader classifies actual invalid archives without writing", async t => {
  for (const kind of ["not-a-database", "foreign-key-schema"] as const) await t.test(kind, t => {
    const f = standaloneArchive(t);
    if (kind === "not-a-database") writeFileSync(f.file, "this is not a SQLite archive");
    else {
      const database = openTestSqlite(f.file);
      try { database.exec("CREATE TABLE parent (id TEXT); CREATE TABLE child (parent_id TEXT REFERENCES parent(id))"); }
      finally { database.close(); }
    }
    const before = homeStorageTree(f.directory);
    assert.throws(() => inspectSnapshotSqlite(f.file), error => {
      assert.ok(error instanceof ActionError);
      assert.equal(error.code, "actions.input_invalid");
      assert.equal(error.kind, "invalid");
      return true;
    });
    assert.deepEqual(homeStorageTree(f.directory), before, "no archive bytes, modes, times or sidecar files are changed");
  });
});

test("RAC-2915: the restore SQLite reader detects an actual source-path replacement as conflict", t => {
  const f = standaloneArchive(t), replacement = join(f.directory, "replacement.db");
  copyFileSync(f.file, replacement);
  let expected: ReturnType<typeof homeStorageTree> | undefined;
  assert.throws(() => inspectSnapshotSqlite(f.file, { inspect() {
    renameSync(f.file, join(f.directory, "original.db"));
    renameSync(replacement, f.file);
    expected = homeStorageTree(f.directory);
    return {};
  } }), error => {
    assert.ok(error instanceof ActionError);
    assert.equal(error.code, "actions.conflict");
    assert.equal(error.kind, "conflict");
    return true;
  });
  assert.ok(expected);
  assert.deepEqual(homeStorageTree(f.directory), expected, "the reader adds no effects after the fixture's replacement");
});

test("RAC-2915: the restore SQLite reader preserves original version, I/O, busy and cancellation errors", async t => {
  const damaged = standaloneArchive(t);
  writeFileSync(damaged.file, "not a SQLite archive");
  const source = openTestSqlite(damaged.file);
  let nativeError: Error;
  try { nativeError = captureSqliteError(() => source.pragma("user_version"), "SQLITE_NOTADB"); }
  finally { source.close(); }
  for (const kind of ["version", "missing-file", "busy", "cancelled"] as const) await t.test(kind, t => {
    const f = standaloneArchive(t);
    if (kind === "missing-file") rmSync(f.file);
    const before = homeStorageTree(f.directory);
    if (kind === "version") assert.throws(() => inspectSnapshotSqlite(f.file, { version: 2 }), { code: "storage.schema_version_mismatch" });
    if (kind === "missing-file") assert.throws(() => inspectSnapshotSqlite(f.file), { code: "ENOENT" });
    if (kind === "busy") {
      const locker = openTestSqlite(f.file);
      try {
        locker.exec("BEGIN EXCLUSIVE");
        assert.throws(() => inspectSnapshotSqlite(f.file), error => {
          assert.ok(error instanceof Error && "code" in error);
          assert.equal(Object.getPrototypeOf(error), Object.getPrototypeOf(nativeError));
          assert.equal(error.code, "SQLITE_BUSY");
          assert.equal(error instanceof ActionError, false);
          return true;
        });
      } finally { locker.exec("ROLLBACK"); locker.close(); }
    }
    if (kind === "cancelled") {
      const abort = new AbortController();
      const reason = nativeError;
      assert.throws(() => inspectSnapshotSqlite(f.file, { signal: abort.signal, inspect() {
        abort.abort(reason);
        throw reason;
      } }), error => error === reason);
    }
    assert.deepEqual(homeStorageTree(f.directory), before);
  });
});

test("RAC-2912: Memory owner reads complete current preferences including committed WAL without touching source bytes or sidecars", async t => {
  const f = await restoreFixture(t), ledger = openMemoryLedger({ homeDirectory: f.home });
  try {
    const personal = { ...ledger.prefs(LOCAL_PERSON_ACTOR_ID, "personal")!, auto: true };
    const project = { ...ledger.prefs(LOCAL_PERSON_ACTOR_ID, "project-default")!, auto: false };
    ledger.savePrefs(LOCAL_PERSON_ACTOR_ID, "personal", personal);
    ledger.savePrefs(LOCAL_PERSON_ACTOR_ID, "project-default", project);
    assert.ok(lstatSync(join(f.home, "memory", "memory.db-wal")).size > 0);
    const before = homeStorageTree(f.home);
    assert.deepEqual(inspectMemoryLedger({ homeDirectory: f.home, actorId: LOCAL_PERSON_ACTOR_ID }), {
      state: "complete", personal, project_default: project,
    });
    assert.deepEqual(homeStorageTree(f.home), before);
  } finally { ledger.close(); }
});

test("RAC-2912: missing Memory is only absent, while wrong version, structure, corruption and incomplete prefs refuse without repairs", async t => {
  const area = realpathSync(mkdtempSync(join(tmpdir(), "molis-memory-owner-inspection-")));
  t.after(() => rmSync(area, { recursive: true, force: true }));
  const before = homeStorageTree(area);
  assert.deepEqual(inspectMemoryLedger({ homeDirectory: area, actorId: LOCAL_PERSON_ACTOR_ID }), { state: "absent" });
  assert.deepEqual(homeStorageTree(area), before);
  for (const kind of ["version", "shape", "corruption", "personal", "project-default"] as const) await t.test(kind, async t => {
    const f = await restoreFixture(t), file = join(f.home, "memory", "memory.db");
    if (kind === "corruption") writeFileSync(file, "damaged existing owner data");
    else {
      const db = openTestSqlite(file);
      try {
        if (kind === "version") db.pragma("user_version = 9");
        else if (kind === "shape") db.exec("DROP TABLE memory_candidates");
        else db.prepare("UPDATE memory_prefs SET body='{}' WHERE actor_id=? AND key=?").run(LOCAL_PERSON_ACTOR_ID, kind);
      } finally { db.close(); }
    }
    const original = homeStorageTree(f.home);
    assert.throws(() => inspectMemoryLedger({ homeDirectory: f.home, actorId: LOCAL_PERSON_ACTOR_ID }));
    assert.deepEqual(homeStorageTree(f.home), original);
  });
});

test("RAC-2912: Memory inspection refuses a real temporary parent inside its source before creating any stage", async t => {
  for (const alias of [false, true]) await t.test(String(alias), async t => {
    const f = await restoreFixture(t), previous = process.env.TMPDIR;
    const parent = alias ? join(f.directory, "temporary-parent-alias") : join(f.home, "memory");
    if (alias) symlinkSync(f.home, parent, "dir");
    const before = homeStorageTree(f.home);
    try {
      process.env.TMPDIR = parent;
      assert.throws(() => inspectMemoryLedger({ homeDirectory: f.home, actorId: LOCAL_PERSON_ACTOR_ID }), { code: "storage.memory.invalid" });
      assert.deepEqual(homeStorageTree(f.home), before);
    } finally { if (previous === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = previous; }
  });
});

test("RAC-2912 RAC-2913: restore never creates inspection or fresh Memory stages inside the original Home or archive", async t => {
  for (const [complete, boundary] of [[false, "home"], [false, "archive"], [false, "alias"], [true, "home"], [true, "archive"], [true, "source"]] as const) await t.test(String(complete) + boundary, async t => {
    const f = complete ? await restoreFixture(t) : await smallSnapshotHome(t);
    await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot });
    const alias = join(f.home, "..", "temporary-parent-alias");
    if (boundary === "alias") symlinkSync(f.home, alias, "dir");
    const parent = boundary === "home" ? f.home : boundary === "archive" ? f.snapshot : boundary === "source" ? join(f.snapshot, "data") : alias;
    const previous = process.env.TMPDIR, home = homeBusinessTree(f.home), archive = homeStorageTree(f.snapshot);
    try {
      process.env.TMPDIR = parent;
      await assert.rejects(restoreHomeSnapshot({ homeDirectory: f.home, source: f.snapshot, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot }), error => {
        assert.ok(error instanceof ActionError);
        assert.ok(error.code === "host.home_restore.invalid" || error.code === "storage.memory.invalid", error.code);
        return true;
      });
      assert.deepEqual(homeBusinessTree(f.home), home);
      assert.deepEqual(homeStorageTree(f.snapshot), archive);
    } finally { if (previous === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = previous; }
  });
});
