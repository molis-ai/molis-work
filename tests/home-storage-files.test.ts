import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { openMemoryLedger, readMemoryLedgerProfiles } from "@molis-ai/molis-work-storage";
import { assertHomeBusinessUnchanged, homeBusinessTree } from "./fixtures/home-storage-files.js";

function homeFor(t: TestContext) {
  const home = mkdtempSync("/private/tmp/molis-storage-observation-");
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

// Closing a raw descriptor for a live SQLite inode in its own process can release POSIX locks.
// Observe from another process so this test does not disturb the writer/readers being measured.
function snapshot(home: string): ReturnType<typeof homeBusinessTree> {
  const fixture = new URL("./fixtures/home-storage-files.ts", import.meta.url).href;
  return JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
    `const {homeBusinessTree}=await import(process.argv[1]);process.stdout.write(JSON.stringify(homeBusinessTree(process.argv[2])));`, fixture, home], { encoding: "utf8" }));
}

function databaseFor(t: TestContext) {
  const home = homeFor(t), directory = join(home, "memory"); mkdirSync(directory);
  const path = join(directory, "memory.db"), db = new DatabaseSync(path);
  db.exec("CREATE TABLE entries(value TEXT); INSERT INTO entries VALUES('original')"); db.close();
  return { home, directory, path };
}

test("public read-only Ledger profiles preserve business bytes and explicitly report newly created technical sidecars", t => {
  const home = homeFor(t), ledger = openMemoryLedger({ homeDirectory: home });
  ledger.savePrefs("synthetic-person", "personal", { auto: false } as Parameters<typeof ledger.savePrefs>[2]); ledger.close();
  const before = snapshot(home);
  assert.deepEqual(readMemoryLedgerProfiles({ homeDirectory: home }), [{ actor_id: "synthetic-person", key: "personal", prefs: { auto: false } }]);
  const after = snapshot(home);
  assert.deepEqual(after["memory/memory.db"], before["memory/memory.db"]);
  assert.equal(after["memory/memory.db-wal"].bytes, "");
  assert.deepEqual(assertHomeBusinessUnchanged(before, after, ["memory/memory.db"]), [
    { path: "memory/memory.db-shm", change: "created" }, { path: "memory/memory.db-wal", change: "created" },
  ]);
  assert.deepEqual(assertHomeBusinessUnchanged(after, before, ["memory/memory.db"]), [
    { path: "memory/memory.db-shm", change: "removed" }, { path: "memory/memory.db-wal", change: "removed" },
  ]);
});

test("real WAL readers may coordinate SHM but UPDATE and checkpoint remain observable business changes", t => {
  const { home, path } = databaseFor(t), writer = new DatabaseSync(path);
  writer.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; UPDATE entries SET value='checkpointed'; PRAGMA wal_checkpoint(TRUNCATE)");
  const held = new DatabaseSync(path, { readOnly: true }); held.exec("BEGIN");
  assert.equal(held.prepare("SELECT value FROM entries").get()?.value, "checkpointed");
  try {
    writer.exec("UPDATE entries SET value='committed-in-wal'");
    const before = snapshot(home), reader = new DatabaseSync(path, { readOnly: true });
    try { assert.equal(reader.prepare("SELECT value FROM entries").get()?.value, "committed-in-wal"); }
    finally { reader.close(); }
    const after = snapshot(home);
    assert.notEqual(after["memory/memory.db-shm"].bytes, before["memory/memory.db-shm"].bytes);
    assert.deepEqual(after["memory/memory.db-wal"], before["memory/memory.db-wal"]);
    assert.ok((after["memory/memory.db-wal"].bytes?.length ?? 0) > 0);
    assert.deepEqual(assertHomeBusinessUnchanged(before, after, ["memory/memory.db"]), [{ path: "memory/memory.db-shm", change: "coordination" }]);
    writer.exec("UPDATE entries SET value='business-change'");
    const changed = snapshot(home);
    assert.deepEqual(changed["memory/memory.db"], after["memory/memory.db"]);
    assert.notEqual(changed["memory/memory.db-wal"].bytes, after["memory/memory.db-wal"].bytes);
    assert.throws(() => assertHomeBusinessUnchanged(after, changed, ["memory/memory.db"]), assert.AssertionError);
    held.exec("ROLLBACK"); writer.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    const checkpointed = snapshot(home);
    assert.equal(checkpointed["memory/memory.db-wal"].bytes, "");
    assert.throws(() => assertHomeBusinessUnchanged(changed, checkpointed, ["memory/memory.db"]), assert.AssertionError);
  } finally { held.close(); writer.close(); }
});

for (const name of ["memory/memory.db-journal", "memory/memory.db-unknown", "memory/unknown.db-shm", "memory/unknown.db-wal"]) {
  test(`unknown or journal file ${name} is never exempted by a sidecar suffix`, t => {
    const { home } = databaseFor(t), before = snapshot(home);
    writeFileSync(join(home, name), "");
    assert.throws(() => assertHomeBusinessUnchanged(before, snapshot(home), ["memory/memory.db"]), assert.AssertionError);
  });
}

test("a linked database ancestor cannot qualify for technical comparison", t => {
  const { home, directory } = databaseFor(t), before = snapshot(home), original = join(home, "original-memory");
  renameSync(directory, original); symlinkSync(original, directory);
  assert.throws(() => assertHomeBusinessUnchanged(before, snapshot(home), ["memory/memory.db"]), /linked ancestor/);
});

for (const suffix of ["", "-wal", "-shm"]) for (const kind of ["symlink", "hardlink"]) {
  test(`known database${suffix} ${kind} cannot qualify as a technical exception`, t => {
    const { home, path } = databaseFor(t), before = snapshot(home), target = path + suffix;
    const original = join(home, "original"); writeFileSync(original, suffix ? "" : readFileSync(path));
    if (!suffix) rmSync(path);
    if (kind === "symlink") symlinkSync(original, target); else linkSync(original, target);
    const after = snapshot(home);
    assert.throws(() => assertHomeBusinessUnchanged(before, after, ["memory/memory.db"]), /ordinary single-link file/);
  });
}

test("existing SHM permissions, DB metadata and unrelated directory timestamps remain strict", t => {
  const { home, path, directory } = databaseFor(t), shm = path + "-shm";
  writeFileSync(shm, "index", { mode: 0o600 }); mkdirSync(join(home, "other"));
  const before = snapshot(home);
  chmodSync(shm, 0o644);
  assert.throws(() => assertHomeBusinessUnchanged(before, snapshot(home), ["memory/memory.db"]), /permissions changed/);
  chmodSync(shm, 0o600);
  const stamp = statSync(path); utimesSync(path, stamp.atime, new Date(stamp.mtimeMs + 1000));
  assert.throws(() => assertHomeBusinessUnchanged(before, snapshot(home), ["memory/memory.db"]), assert.AssertionError);
  const dbUnchanged = snapshot(home), other = join(home, "other"), otherStamp = statSync(other);
  writeFileSync(path + "-wal", ""); utimesSync(other, otherStamp.atime, new Date(otherStamp.mtimeMs + 1000));
  assert.throws(() => assertHomeBusinessUnchanged(dbUnchanged, snapshot(home), ["memory/memory.db"]), assert.AssertionError);
  const noCreation = snapshot(home), directoryStamp = statSync(directory);
  utimesSync(directory, directoryStamp.atime, new Date(directoryStamp.mtimeMs + 1000));
  assert.throws(() => assertHomeBusinessUnchanged(noCreation, snapshot(home), ["memory/memory.db"]), assert.AssertionError);
});

test("empty WAL appearance is allowed only for an explicitly selected unchanged ordinary database", t => {
  const { home, path } = databaseFor(t), before = snapshot(home);
  writeFileSync(path + "-wal", "");
  const empty = snapshot(home);
  assert.deepEqual(assertHomeBusinessUnchanged(before, empty, ["memory/memory.db"]), [{ path: "memory/memory.db-wal", change: "created" }]);
  assert.throws(() => assertHomeBusinessUnchanged(before, empty, []), assert.AssertionError);
  writeFileSync(path + "-wal", "committed frame");
  assert.throws(() => assertHomeBusinessUnchanged(empty, snapshot(home), ["memory/memory.db"]), assert.AssertionError);
  assert.throws(() => assertHomeBusinessUnchanged(before, snapshot(home), ["memory/memory.db"]), assert.AssertionError);
});
