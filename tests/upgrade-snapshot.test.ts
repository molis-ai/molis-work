// UPG1-02, UPG1-09: the upgrade snapshot and its restore (specs/upgrade-continuity/upgrade-chain-design.md §2.2 steps 2 and 3, §5).
// Every baseline here is a test baseline; no real store changes version. The refusals themselves are in
// tests/security-invariants-upgrade-snapshot.test.ts.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, closeSync, lstatSync, mkdirSync, openSync, readFileSync, statfsSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import {
  acquireStorageOwner,
  assertUpgradeDiskSpace,
  captureUpgradeSnapshot,
  openSqliteConnection,
  pruneUpgradeSnapshots,
  restoreUpgradeSnapshot,
  runSqliteUpgrade,
  verifyUpgradeSnapshot,
  type SqliteBaseline,
  type UpgradeSnapshotUnit,
} from "@molis-ai/molis-work-storage";
import { capture, inChild, notesOf, onStore, openNode, present, runFiles, seedStore, sha256, sidecarsOf, STORE, upgradeHome, V1, versionOf } from "./fixtures/upgrade-snapshot-home.js";

const V2 = "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL, tag TEXT NOT NULL DEFAULT '');";
const addTag = "ALTER TABLE notes ADD COLUMN tag TEXT NOT NULL DEFAULT ''";
const withAddTag: SqliteBaseline = { version: 2, schema: V2, upgrades: [{ from: 1, sql: addTag }] };

/** Each way a run ends without the new version in place, with the reason it reports. */
const FAILING: Readonly<Record<string, SqliteBaseline>> = {
  step_failed: { version: 2, schema: V2, upgrades: [{ from: 1, run: db => { db.exec(addTag); throw new Error("step body"); } }] },
  verify_failed: { version: 2, schema: V2, upgrades: [{ from: 1, sql: addTag, verify: () => { throw new Error("owner check"); } }] },
  structure: { version: 2, schema: V2, upgrades: [{ from: 1, sql: "ALTER TABLE notes ADD COLUMN other TEXT" }] },
  foreign_keys: {
    version: 2,
    schema: `${V1} CREATE TABLE refs (note TEXT REFERENCES notes(id));`,
    // Foreign keys off, as a rebuild has them, so the orphan gets as far as the check before commit on either driver's default.
    upgrades: [{ from: 1, rebuilds_tables: true, sql: "CREATE TABLE refs (note TEXT REFERENCES notes(id)); INSERT INTO refs VALUES ('missing');" }],
  },
  rows_reduced: { version: 2, schema: V2, upgrades: [{ from: 1, sql: `${addTag}; DELETE FROM notes WHERE id = '1'` }] },
  // The step commits on its own: this part cannot be rolled back, so only the restore can undo it.
  transaction_ended: { version: 2, schema: V2, upgrades: [{ from: 1, sql: `${addTag}; UPDATE notes SET body = 'rewritten'; COMMIT;` }] },
};
const DRIVERS = { "node:sqlite": openNode, "better-sqlite3": (path: string) => openSqliteConnection(path, { fileMustExist: true, timeout: 0 }) } as const;
const failed = (reason: string) => (error: Error & { code?: string; details?: { reason?: string } }) =>
  error.code === "storage.upgrade_failed" && error.details?.reason === reason;

test("UPG1-02: every failed upgrade is put back byte for byte, whatever the journal mode and the driver", async t => {
  for (const [driver, open] of Object.entries(DRIVERS)) for (const journal of ["WAL", "DELETE"] as const) for (const [reason, baseline] of Object.entries(FAILING)) {
    await t.test(`${driver} ${journal} ${reason}`, t => {
      const { file, unit } = upgradeHome(t, { journal });
      const entry = captureUpgradeSnapshot(unit, open), notes = notesOf(file);
      assert.equal(sha256(file), entry.sha256, "the checkpointed file is the baseline");
      const db = open(file);
      try { assert.throws(() => runSqliteUpgrade(db, file, baseline), failed(reason)); }
      finally { db.close(); }
      restoreUpgradeSnapshot(unit);
      assert.equal(sha256(file), entry.sha256);
      assert.deepEqual(sidecarsOf(file), []);
      assert.equal(versionOf(file), 1);
      assert.deepEqual(notesOf(file), notes);
    });
  }
});

test("UPG1-02: a step that writes COMMIT; BEGIN keeps its first half past the rollback, so a failure is restored whatever its reason says", async t => {
  // `transaction_ended` cannot see this: a transaction is open again when the run looks. The check that fails then rolls back only the second half.
  const committing = `${addTag}; COMMIT; BEGIN;`;
  const cases: Readonly<Record<string, SqliteBaseline>> = {
    verify_failed: { version: 2, schema: V2, upgrades: [{ from: 1, sql: committing, verify: () => { throw new Error("owner check"); } }] },
    step_failed: { version: 2, schema: V2, upgrades: [{ from: 1, sql: committing, run: () => { throw new Error("step body"); } }] },
    rows_reduced: { version: 2, schema: V2, upgrades: [{ from: 1, sql: `${committing} DELETE FROM notes WHERE id = '1';` }] },
    structure: { version: 2, schema: "CREATE TABLE notes (id TEXT PRIMARY KEY);", upgrades: [{ from: 1, sql: committing }] },
  };
  for (const [driver, open] of Object.entries(DRIVERS)) for (const journal of ["WAL", "DELETE"] as const) for (const [reason, baseline] of Object.entries(cases)) {
    await t.test(`${driver} ${journal} ${reason}`, t => {
      const { file, unit } = upgradeHome(t, { journal });
      const entry = captureUpgradeSnapshot(unit, open), notes = notesOf(file);
      const db = open(file);
      try { assert.throws(() => runSqliteUpgrade(db, file, baseline), failed(reason)); }
      finally { db.close(); }
      // The state nothing else can undo: still version 1, so reading the version alone says "not upgraded", and the column is already there.
      assert.equal(versionOf(file), 1);
      assert.ok(onStore(file, db => db.prepare("SELECT 1 FROM pragma_table_info('notes') WHERE name = 'tag'").get()), "the first half is committed");
      assert.notEqual(sha256(file), entry.sha256);
      restoreUpgradeSnapshot(unit);
      assert.equal(sha256(file), entry.sha256);
      assert.equal(onStore(file, db => db.prepare("SELECT 1 FROM pragma_table_info('notes') WHERE name = 'tag'").get()), undefined);
      assert.deepEqual(notesOf(file), notes);
    });
  }
});

test("UPG1-02: an async step's COMMIT before its first await keeps its first half too, and a closed connection stops the rest", async t => {
  for (const [driver, open] of Object.entries(DRIVERS)) for (const journal of ["WAL", "DELETE"] as const) {
    await t.test(`${driver} ${journal}`, async t => {
      const { file, unit } = upgradeHome(t, { journal });
      const entry = captureUpgradeSnapshot(unit, open), notes = notesOf(file);
      let lateWrite: unknown = "not reached";
      const baseline: SqliteBaseline = { version: 2, schema: V2, upgrades: [{ from: 1, run: async db => {
        db.exec(`${addTag}; COMMIT;`);
        await null;
        try { db.exec("UPDATE notes SET body = 'after the first await'"); lateWrite = "landed"; }
        catch (error) { lateWrite = error; }
      } }] };
      const db = open(file);
      assert.throws(() => runSqliteUpgrade(db, file, baseline), failed("step_failed"));
      // Nothing is awaited from here until the restore is done (the note on restoreUpgradeSnapshot).
      db.close();
      assert.equal(versionOf(file), 1);
      assert.ok(onStore(file, db => db.prepare("SELECT 1 FROM pragma_table_info('notes') WHERE name = 'tag'").get()), "the first half is committed");
      assert.notEqual(sha256(file), entry.sha256);
      restoreUpgradeSnapshot(unit);
      assert.equal(sha256(file), entry.sha256);
      await new Promise(resolve => setImmediate(resolve));
      assert.ok(lateWrite instanceof Error, "the rest of the step found the connection closed");
      assert.equal(sha256(file), entry.sha256);
      assert.deepEqual(notesOf(file), notes);
    });
  }
});

test("UPG1-09: a real write killed before the journal's flush does not stop the snapshot, and its change is not in the baseline", async t => {
  for (const [driver, open] of Object.entries(DRIVERS)) await t.test(driver, t => {
    const { file, unit } = upgradeHome(t, { journal: "DELETE" }), before = sha256(file), notes = notesOf(file);
    dieHolding(file, `db.exec("BEGIN; UPDATE notes SET body = 'never committed';");`);
    assert.equal(readFileSync(`${file}-journal`)[0], 0, "the kill left a journal SQLite does not take as hot");
    assert.equal(sha256(file), before, "the store itself was not written");
    const entry = captureUpgradeSnapshot(unit, open);
    assert.equal(entry.sha256, before);
    assert.deepEqual(sidecarsOf(file), []);
    assert.deepEqual(notesOf(file), notes);
  });
});

test("UPG1-09: a journal SQLite ignores, left by a write killed before the flush, does not stop the snapshot", async t => {
  for (const [name, journal] of [["empty", ""], ["header not flushed yet", Buffer.alloc(4096)]] as const) {
    await t.test(name, t => {
      const { file, unit } = upgradeHome(t, { journal: "DELETE" }), before = sha256(file);
      writeFileSync(`${file}-journal`, journal);
      assert.equal(capture(unit).sha256, before);
      assert.deepEqual(sidecarsOf(file), []);
    });
  }
});

test("UPG1-02: the snapshot records what the design asks of it, and a clean upgrade leaves it alone", t => {
  const { file, unit, run } = upgradeHome(t);
  chmodSync(file, 0o640);
  const entry = capture(unit), { snapshot } = runFiles(run);
  assert.equal(entry.path, STORE);
  assert.equal(entry.mode, 0o640);
  assert.equal(entry.size, readFileSync(file).length);
  assert.equal(entry.sqlite!.user_version, 1);
  assert.match(entry.sqlite!.schema_sha256, /^[0-9a-f]{64}$/);
  assert.equal(sha256(snapshot), entry.sha256);
  assert.deepEqual(verifyUpgradeSnapshot(unit), entry);

  const db = new DatabaseSync(file);
  try { assert.deepEqual(runSqliteUpgrade(db, file, withAddTag), { from: 1, to: 2 }); } finally { db.close(); }
  assert.equal(versionOf(file), 2);
  assert.equal(sha256(snapshot), entry.sha256);
  assert.deepEqual(verifyUpgradeSnapshot(unit), entry, "the snapshot outlives a successful upgrade (§5.4)");

  restoreUpgradeSnapshot(unit);
  assert.equal(versionOf(file), 1);
  assert.equal(lstatSync(file).mode & 0o777, 0o640, "the store gets its own mode back");
});

test("UPG1-02: capturing again keeps the baseline: the same file is a no-op, a changed one is refused and the snapshot stays", t => {
  const { file, unit, run } = upgradeHome(t);
  const entry = capture(unit), { snapshot, manifest } = runFiles(run), before = readFileSync(manifest);
  assert.deepEqual(capture(unit), entry);
  assert.deepEqual(readFileSync(manifest), before);
  onStore(file, db => db.exec("INSERT INTO notes VALUES ('3', 'c')"));
  assert.throws(() => capture(unit), failed("snapshot_exists"));
  assert.equal(sha256(snapshot), entry.sha256);
});

test("UPG1-02: each store of a run has its own snapshot, and restoring one leaves the others alone", t => {
  const { home, unit, file } = upgradeHome(t);
  const other = "other/other.db", otherFile = join(home, other);
  seedStore(otherFile);
  const first = capture(unit), second = capture({ ...unit, relativePath: other });
  onStore(file, db => db.exec("DELETE FROM notes"));
  onStore(otherFile, db => db.exec("DROP TABLE notes"));
  restoreUpgradeSnapshot({ ...unit, relativePath: other });
  assert.equal(sha256(otherFile), second.sha256);
  assert.notEqual(sha256(file), first.sha256);
  restoreUpgradeSnapshot(unit);
  assert.equal(sha256(file), first.sha256);
});

/** A child that dies by SIGKILL with the transaction state `script` left behind. */
function dieHolding(file: string, script: string) {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { DatabaseSync } from "node:sqlite";
    const db = new DatabaseSync(${JSON.stringify(file)});
    ${script}
    process.kill(process.pid, "SIGKILL");
    await new Promise(() => {});`], { encoding: "utf8" });
  assert.equal(result.signal, "SIGKILL", result.stderr);
}

test("UPG1-09: a hot WAL left by kill -9 goes into the baseline, and its files are gone before the copy", async t => {
  for (const [driver, open] of Object.entries(DRIVERS)) await t.test(driver, t => {
    const { file, unit, run } = upgradeHome(t);
    dieHolding(file, `db.exec("PRAGMA wal_autocheckpoint = 0; INSERT INTO notes VALUES ('3', 'from the WAL');");`);
    assert.deepEqual(sidecarsOf(file), ["-wal", "-shm"], "the kill left a hot WAL");
    const before = sha256(file), entry = captureUpgradeSnapshot(unit, open);
    assert.deepEqual(sidecarsOf(file), []);
    assert.notEqual(entry.sha256, before, "the WAL's pages went into the main file");
    assert.equal(sha256(file), entry.sha256);
    const copy = join(run, "probe.db");
    writeFileSync(copy, readFileSync(runFiles(run).snapshot));
    assert.equal(notesOf(copy).length, 3, "the committed row is in the snapshot");
  });
});

test("UPG1-09: files a read-only open left behind are cleaned the same way", t => {
  const { file, unit } = upgradeHome(t);
  const reader = new DatabaseSync(file, { readOnly: true });
  reader.prepare("SELECT * FROM notes").all();
  reader.close();
  assert.deepEqual(sidecarsOf(file), ["-wal", "-shm"], "a read-only open leaves both behind (§1)");
  const entry = capture(unit);
  assert.deepEqual(sidecarsOf(file), []);
  assert.equal(sha256(file), entry.sha256);
});

test("UPG1-09: a hot rollback journal is recovered by the open, so the baseline has none of the killed write", t => {
  const { file, unit } = upgradeHome(t, { journal: "DELETE" });
  const notes = notesOf(file);
  dieHolding(file, `
    db.exec("PRAGMA cache_size = 1; BEGIN; CREATE TABLE bulk (body TEXT); UPDATE notes SET body = 'never committed';");
    const insert = db.prepare("INSERT INTO bulk VALUES (?)");
    for (let i = 0; i < 400; i += 1) insert.run("x".repeat(2000));`);
  assert.ok(present(`${file}-journal`), "the kill left a hot journal");
  const entry = capture(unit);
  assert.deepEqual(sidecarsOf(file), []);
  assert.equal(sha256(file), entry.sha256);
  assert.deepEqual(notesOf(file), notes);
});

test("UPG1-09: what the checkpoint cannot clear fails before any copy", async t => {
  await t.test("a stale journal SQLite does not take as hot", t => {
    const { file, unit, run } = upgradeHome(t);
    writeFileSync(`${file}-journal`, Buffer.alloc(4096));
    const before = sha256(file);
    assert.throws(() => capture(unit), failed("sidecars_remain"));
    assert.equal(sha256(file), before);
    assert.equal(present(run), false, "no snapshot, not even a directory for one");
  });
  await t.test("another connection reading the WAL", t => {
    const { file, unit, run } = upgradeHome(t);
    const writer = new DatabaseSync(file), reader = new DatabaseSync(file);
    t.after(() => { reader.close(); writer.close(); });
    reader.exec("BEGIN");
    reader.prepare("SELECT * FROM notes").all();
    writer.exec("INSERT INTO notes VALUES ('3', 'c')");
    assert.throws(() => capture(unit), failed("checkpoint_failed"));
    assert.equal(present(run), false);
  });
  await t.test("another connection merely open", t => {
    const { file, unit, run } = upgradeHome(t);
    const other = new DatabaseSync(file);
    t.after(() => other.close());
    other.prepare("SELECT * FROM notes").all();
    assert.throws(() => capture(unit), failed("sidecars_remain"));
    assert.equal(present(run), false);
  });
  await t.test("a file that is no SQLite store", t => {
    const { file, unit, run } = upgradeHome(t);
    writeFileSync(file, "not a database, and long enough to have a header to read");
    assert.throws(() => capture(unit), failed("checkpoint_failed"));
    assert.equal(readFileSync(file, "utf8"), "not a database, and long enough to have a header to read");
    assert.equal(present(run), false);
  });
});

/** Runs `operation` in a child killed before each file-system call in turn; `check` sees the Home right after the kill, holding the lock again. */
function killAtEveryCall(t: TestContext, prepare: (t: TestContext) => ReturnType<typeof upgradeHome>, operation: "capture" | "restore", check: (home: ReturnType<typeof upgradeHome>, unit: UpgradeSnapshotUnit) => void): number {
  for (let kill = 1; kill < 100; kill += 1) {
    const prepared = prepare(t);
    prepared.release();
    const run = inChild(prepared.home, operation, { kill });
    if (!run.killed) {
      assert.equal(run.status, 0, run.stderr);
      return kill - 1;
    }
    const owner = acquireStorageOwner(prepared.home);
    try { check(prepared, { ...prepared.unit, owner }); } finally { owner.release(); }
  }
  throw new Error("the operation never ran to its end");
}

test("§5.2 UPG1-02: restoring resumes from a kill -9 at any step, and the store is never torn", t => {
  // What a restore starts from: a failed upgrade's committed part, with a WAL still beside the file.
  let failedSha = "", baselineSha = "";
  const prepare = (t: TestContext) => {
    const home = upgradeHome(t);
    baselineSha = capture(home.unit).sha256;
    const db = new DatabaseSync(home.file);
    assert.throws(() => runSqliteUpgrade(db, home.file, FAILING.transaction_ended!));
    db.close();
    failedSha = sha256(home.file);
    assert.notEqual(failedSha, baselineSha);
    writeFileSync(`${home.file}-wal`, "a stale write-ahead log");
    return home;
  };
  const steps = killAtEveryCall(t, prepare, "restore", ({ file, run }, unit) => {
    assert.ok([failedSha, baselineSha].includes(sha256(file)), "the store is the failed one or the baseline, never in between");
    restoreUpgradeSnapshot(unit);
    assert.equal(sha256(file), baselineSha);
    assert.deepEqual(sidecarsOf(file), []);
    assert.equal(present(`${file}.upgrade-restore`), false, "no half-copied file stays behind");
    assert.equal(versionOf(file), 1);
    assert.equal(sha256(runFiles(run).snapshot), baselineSha);
  });
  assert.ok(steps >= 7, `restore made only ${steps} file-system calls`);
});

test("§2.2 step 3: taking the snapshot resumes from a kill -9 at any step", t => {
  const steps = killAtEveryCall(t, t => upgradeHome(t), "capture", ({ file, run }, unit) => {
    const entry = capture(unit);
    assert.equal(sha256(file), entry.sha256);
    assert.deepEqual(verifyUpgradeSnapshot(unit), entry);
    assert.equal(sha256(runFiles(run).snapshot), entry.sha256);
  });
  assert.ok(steps >= 8, `capture made only ${steps} file-system calls`);
});

test("§5.2: the order crash safety depends on: side files, flush, rename, flush the directory", t => {
  const restoring = upgradeHome(t);
  capture(restoring.unit);
  writeFileSync(`${restoring.file}-wal`, "a stale write-ahead log");
  restoring.release();
  const result = inChild(restoring.home, "restore", "trace");
  assert.equal(result.status, 0, result.stderr);
  const trace: string[] = JSON.parse(result.stdout);
  const at = (call: string) => { const index = trace.indexOf(call); assert.notEqual(index, -1, `${call} in ${trace}`); return index; };
  const temporary = "notes.db.upgrade-restore";
  const copy = trace.findIndex(call => call.startsWith("copyFileSync:"));
  assert.ok(at("rmSync:notes.db-wal") < copy, "side files go before anything is put in place");
  assert.ok(copy < at(`chmodSync:${temporary}`));
  assert.ok(at(`chmodSync:${temporary}`) < at(`fsyncSync:${temporary}`), "the mode is flushed with the file");
  assert.ok(at(`fsyncSync:${temporary}`) < at(`renameSync:${temporary}`), "the bytes are durable before they replace the store");
  assert.ok(at(`renameSync:${temporary}`) < at("fsyncSync:notes"), "the rename itself is flushed");

  const capturing = upgradeHome(t);
  capturing.release();
  const taken = inChild(capturing.home, "capture", "trace");
  assert.equal(taken.status, 0, taken.stderr);
  const steps: string[] = JSON.parse(taken.stdout);
  const flush = steps.findIndex(call => /^fsyncSync:[0-9a-f]{64}\.tmp$/.test(call)), rename = steps.findIndex(call => /^renameSync:[0-9a-f]{64}\.tmp$/.test(call));
  assert.ok(flush !== -1 && flush < rename, `the snapshot is durable before it is named: ${steps}`);
  assert.ok(steps.lastIndexOf("fsyncSync:run-1") > rename, "the directory is flushed after the rename");
});

test("§5.2: too little disk for this Home moves nothing and says so", async t => {
  const big = (file: string, size: number) => { closeSync(openSync(file, "w")); truncateSync(file, size); };
  const free = (home: string) => { const { bavail, bsize } = statfsSync(home); return bavail * bsize; };
  await t.test("the store does not fit twice", t => {
    const { home, file } = upgradeHome(t);
    mkdirSync(join(home, "large"));
    const size = Math.floor(free(home) / 2) + 2 ** 30;
    big(join(home, "large", "large.db"), size); // sparse: it takes no disk, and only its size is read
    const before = sha256(file);
    assert.throws(() => assertUpgradeDiskSpace(home, [STORE, "large/large.db"]), (error: Error & { code?: string; details?: { needed?: number } }) =>
      error.code === "storage.upgrade_no_space" && error.details?.needed !== undefined && error.details.needed > size);
    assert.equal(sha256(file), before);
    assert.equal(present(join(home, "upgrade")), false, "nothing is created");
  });
  await t.test("a WAL counts: its pages go into the file before the copy", t => {
    const { home, file } = upgradeHome(t);
    big(`${file}-wal`, Math.floor(free(home) / 2) + 2 ** 30);
    assert.throws(() => assertUpgradeDiskSpace(home, [STORE]), (error: Error & { code?: string }) => error.code === "storage.upgrade_no_space");
  });
  await t.test("enough room, or nothing to move", t => {
    const { home } = upgradeHome(t);
    assertUpgradeDiskSpace(home, [STORE, "not/there.db"]);
    assertUpgradeDiskSpace(home, []);
  });
});

test("§5.4: snapshots stay until the next successful upgrade, and older ones go without following anything", t => {
  const { home, file, outside, unit, owner } = upgradeHome(t);
  capture(unit);
  const later = { ...unit, runId: "run-2" }, latest = capture(later);
  writeFileSync(join(outside, "kept"), "not ours");
  symlinkSync(outside, join(home, "upgrade", "run-link"));
  writeFileSync(join(home, "upgrade", "ledger.json"), "{}");
  pruneUpgradeSnapshots({ owner, lockDirectory: home, home }, "run-2");
  assert.equal(present(join(home, "upgrade", "run-1")), false);
  assert.equal(present(join(home, "upgrade", "run-link")), false, "the link goes, not what it points at");
  assert.equal(readFileSync(join(outside, "kept"), "utf8"), "not ours");
  assert.equal(readFileSync(join(home, "upgrade", "ledger.json"), "utf8"), "{}", "only snapshot runs are this function's");
  assert.deepEqual(verifyUpgradeSnapshot(later), latest);
  assert.equal(sha256(file), latest.sha256);
});
