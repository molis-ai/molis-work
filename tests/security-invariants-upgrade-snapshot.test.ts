// The upgrade snapshot's two refusals (specs/upgrade-continuity/upgrade-chain-design.md §5, §10; docs/system/security-invariants/):
// S-upgrade-snapshot-confinement (the design's provisional S-143) and S-upgrade-restore-verified (its provisional S-145).
import assert from "node:assert/strict";
import { chmodSync, linkSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { captureUpgradeSnapshot, pruneUpgradeSnapshots, restoreUpgradeSnapshot, runSqliteUpgrade, verifyUpgradeSnapshot, type UpgradeSqliteConnection } from "@molis-ai/molis-work-storage";
import { capture, notesOf, onStore, openNode, present, runFiles, seedStore, sha256, sidecarsOf, STORE, upgradeHome, versionOf } from "./fixtures/upgrade-snapshot-home.js";

const failure = (reason: string, area?: string) => (error: Error & { code?: string; details?: { reason?: string } }) => {
  assert.equal(error.code, "storage.upgrade_failed", String(error));
  assert.equal(error.details?.reason, reason);
  // A file-system error's text names absolute paths; it stays on `cause`, which serializing leaves out.
  if (area !== undefined) assert.ok(!error.message.includes(area) && !JSON.stringify(error).includes(area), "a refusal shows no absolute path");
  return true;
};
/** An open that must not be reached: what these cases refuse has to be refused before SQLite can write through it. */
const neverOpened = (): UpgradeSqliteConnection => { throw new Error("a refused path must not be opened"); };
const changeStore = (file: string) => onStore(file, db => db.exec("INSERT INTO notes VALUES ('after', 'the snapshot')"));

test("S-upgrade-snapshot-confinement S-143: the directories are 0700 and the files 0600, whatever the store's mode", t => {
  const { home, file, unit, run } = upgradeHome(t);
  chmodSync(file, 0o644);
  mkdirSync(join(home, "upgrade"));
  chmodSync(join(home, "upgrade"), 0o755);
  const entry = capture(unit);
  assert.equal(lstatSync(join(home, "upgrade")).mode & 0o777, 0o700, "a directory found wider is tightened before anything goes into it");
  assert.equal(lstatSync(run).mode & 0o777, 0o700);
  assert.deepEqual(readdirSync(run).length, 2, "the snapshot and its manifest");
  for (const name of readdirSync(run)) assert.equal(lstatSync(join(run, name)).mode & 0o777, 0o600, name);
  assert.equal(entry.mode, 0o644, "the store's own mode is only written down");
});

test("S-upgrade-snapshot-confinement S-143: a path that leaves the Home is refused by capture and restore, and nothing outside changes", async t => {
  for (const written of ["../outside/store.db", "../../x", "notes/../../outside/store.db", "./notes/notes.db", "notes//notes.db", "notes/notes.db/", "", "absolute"]) {
    await t.test(written || "empty", t => {
      const { area, home, outside, unit } = upgradeHome(t);
      const store = join(outside, "store.db");
      seedStore(store);
      const before = sha256(store), refused = { ...unit, relativePath: written === "absolute" ? store : written };
      assert.throws(() => captureUpgradeSnapshot(refused, neverOpened), failure("invalid_path", area));
      assert.throws(() => restoreUpgradeSnapshot(refused), failure("invalid_path", area));
      assert.throws(() => verifyUpgradeSnapshot(refused), failure("invalid_path", area));
      assert.equal(sha256(store), before);
      assert.equal(present(join(home, "upgrade")), false, "no directory is made for a refused path");
    });
  }
  for (const runId of ["..", "../outside", "a/b", "", "run.1"]) {
    await t.test(`run id ${runId || "empty"}`, t => {
      const { home, outside, unit } = upgradeHome(t);
      assert.throws(() => captureUpgradeSnapshot({ ...unit, runId }, neverOpened), failure("invalid_path"));
      assert.deepEqual(readdirSync(outside), []);
      assert.equal(present(join(home, "upgrade")), false);
    });
  }
});

test("S-upgrade-snapshot-confinement S-143: a link on the way to the store or the snapshot is refused and never followed", async t => {
  const refusedBeforeOpen = (t: TestContext, plant: (f: ReturnType<typeof upgradeHome>, store: string) => void, relativePath = STORE) => {
    const f = upgradeHome(t), store = join(f.outside, "store.db");
    seedStore(store);
    const before = sha256(store);
    plant(f, store);
    assert.throws(() => captureUpgradeSnapshot({ ...f.unit, relativePath }, neverOpened), failure("invalid_path", f.area));
    assert.equal(sha256(store), before);
    return f;
  };
  await t.test("the store is a link", t => {
    const f = refusedBeforeOpen(t, ({ file }, store) => { rmSync(file); symlinkSync(store, file); });
    assert.throws(() => restoreUpgradeSnapshot(f.unit), failure("invalid_path", f.area));
    assert.equal(lstatSync(f.file).isSymbolicLink(), true, "the link is left as it was");
  });
  await t.test("a directory on the way is a link", t => {
    refusedBeforeOpen(t, ({ home, outside }) => symlinkSync(outside, join(home, "elsewhere")), "elsewhere/store.db");
  });
  await t.test("the store has a second hard link", t => {
    refusedBeforeOpen(t, ({ file, outside }) => linkSync(file, join(outside, "hard")));
  });
  for (const suffix of ["-wal", "-shm", "-journal"]) await t.test(`its ${suffix} is a link SQLite would write through`, t => {
    const f = refusedBeforeOpen(t, ({ file }, store) => symlinkSync(store, file + suffix));
    assert.equal(lstatSync(f.file + suffix).isSymbolicLink(), true);
  });
  await t.test("a directory that became a link, with no file left at the store's place, gets nothing restored through it", t => {
    const { area, home, outside, unit } = upgradeHome(t);
    const moved = { ...unit, relativePath: "moved/moved.db" };
    seedStore(join(home, moved.relativePath));
    capture(moved);
    rmSync(join(home, "moved"), { recursive: true });
    symlinkSync(outside, join(home, "moved"));
    assert.throws(() => restoreUpgradeSnapshot(moved), failure("invalid_path", area));
    assert.deepEqual(readdirSync(outside), []);
  });
  await t.test("upgrade/ is a link to outside the Home", t => {
    const { area, home, outside, unit } = upgradeHome(t);
    symlinkSync(outside, join(home, "upgrade"));
    assert.throws(() => capture(unit), failure("snapshot_write_failed", area));
    assert.deepEqual(readdirSync(outside), [], "nothing is written through it");
  });
  await t.test("the run directory is a link to outside the Home", t => {
    const { area, home, outside, unit } = upgradeHome(t);
    mkdirSync(join(home, "upgrade"), { mode: 0o700 });
    symlinkSync(outside, join(home, "upgrade", "run-1"));
    assert.throws(() => capture(unit), failure("snapshot_write_failed", area));
    assert.deepEqual(readdirSync(outside), []);
  });
});

test("S-upgrade-snapshot-confinement S-143: a path written into the manifest is never where anything goes", async t => {
  for (const written of ["../outside/store.db", "../../x", "elsewhere.db"]) await t.test(written, t => {
    const { area, home, outside, file, unit, run } = upgradeHome(t);
    const store = join(outside, "store.db");
    seedStore(store);
    capture(unit);
    const before = sha256(store), { manifest } = runFiles(run);
    changeStore(file);
    const changed = sha256(file);
    writeFileSync(manifest, readFileSync(manifest, "utf8").replace(JSON.stringify(STORE), JSON.stringify(written)));
    assert.throws(() => restoreUpgradeSnapshot(unit), failure("snapshot_invalid", area));
    assert.equal(sha256(file), changed, "the entry no longer names this store, so it is not restored");
    assert.equal(sha256(store), before);
    assert.equal(present(join(home, "elsewhere.db")), false);
  });
});

test("S-upgrade-snapshot-confinement S-143: keys stay out of the snapshot directory, and only the dependency is written down", t => {
  const { home, file, unit, run } = upgradeHome(t);
  const key = "test-only-key-value-".repeat(4), keyFile = join(home, "feed", "secrets.key");
  mkdirSync(join(home, "feed"));
  writeFileSync(keyFile, key, { mode: 0o600 });
  // Sealed contents are copied as they are: the store's own ciphertext is the baseline, not something this step opens.
  onStore(file, db => db.exec("INSERT INTO notes VALUES ('sealed', 'ciphertext-bytes')"));
  const dependency = { kind: "file-key" as const, location: "home:feed/secrets.key", sha256: sha256(keyFile) };
  const entry = captureUpgradeSnapshot(unit, openNode, [dependency]);
  assert.deepEqual(entry.keys, [dependency]);
  assert.deepEqual(verifyUpgradeSnapshot(unit).keys, [dependency]);
  assert.equal(sha256(runFiles(run).snapshot), entry.sha256);
  const needle = Buffer.from(key);
  for (const name of readdirSync(run)) assert.equal(readFileSync(join(run, name)).includes(needle), false, name);
  assert.ok(readFileSync(runFiles(run).snapshot).includes(Buffer.from("ciphertext-bytes")), "the contents went in untouched");
});

test("S-upgrade-snapshot-confinement S-143: without this Home's live lock nothing is opened, copied, put back or removed", async t => {
  await t.test("a released lock", t => {
    const { home, file, unit, owner, release, run } = upgradeHome(t);
    capture(unit);
    changeStore(file);
    const changed = sha256(file);
    release();
    const closed = (error: Error & { code?: string }) => error.code === "storage.owner.closed";
    assert.throws(() => captureUpgradeSnapshot(unit, neverOpened), closed);
    assert.throws(() => restoreUpgradeSnapshot(unit), closed);
    assert.throws(() => verifyUpgradeSnapshot(unit), closed);
    assert.throws(() => pruneUpgradeSnapshots(owner, home, "other"), closed);
    assert.equal(sha256(file), changed);
    assert.ok(present(run));
  });
  await t.test("another Home's lock", t => {
    const first = upgradeHome(t), second = upgradeHome(t);
    const borrowed = { ...first.unit, owner: second.owner };
    const invalid = (error: Error & { code?: string }) => error.code === "storage.owner.invalid";
    assert.throws(() => captureUpgradeSnapshot(borrowed, neverOpened), invalid);
    assert.throws(() => restoreUpgradeSnapshot(borrowed), invalid);
    assert.equal(present(first.run), false);
  });
});

test("S-upgrade-restore-verified S-145: a snapshot that does not match its hash is not restored, and the store stays exactly as it is", async t => {
  const tamper: Record<string, (files: ReturnType<typeof runFiles>, outside: string) => void> = {
    "one byte flipped": ({ snapshot }) => { const bytes = readFileSync(snapshot); bytes[bytes.length - 1]! ^= 0x01; writeFileSync(snapshot, bytes); },
    truncated: ({ snapshot }) => writeFileSync(snapshot, readFileSync(snapshot).subarray(0, 4096)),
    missing: ({ snapshot }) => rmSync(snapshot),
    "replaced by a link to the same bytes": ({ snapshot }, outside) => { const copy = join(outside, "copy"); writeFileSync(copy, readFileSync(snapshot)); rmSync(snapshot); symlinkSync(copy, snapshot); },
    "with a second hard link": ({ snapshot }, outside) => linkSync(snapshot, join(outside, "hard")),
    "the manifest's hash changed": ({ manifest }) => writeFileSync(manifest, readFileSync(manifest, "utf8").replace(/"sha256":"[0-9a-f]{64}"/, `"sha256":"${"0".repeat(64)}"`)),
    "the manifest's size changed": ({ manifest }) => writeFileSync(manifest, readFileSync(manifest, "utf8").replace(/"size":\d+/, '"size":1')),
    "the manifest is gone": ({ manifest }) => rmSync(manifest),
    "the manifest is not JSON": ({ manifest }) => writeFileSync(manifest, "not json"),
    "the manifest has a field nobody wrote": ({ manifest }) => writeFileSync(manifest, readFileSync(manifest, "utf8").replace('"run_id"', '"note":1,"run_id"')),
    "the manifest is for another run": ({ manifest }) => writeFileSync(manifest, readFileSync(manifest, "utf8").replace('"run-1"', '"run-2"')),
    "the manifest is a link": ({ manifest }, outside) => { const copy = join(outside, "manifest"); writeFileSync(copy, readFileSync(manifest)); rmSync(manifest); symlinkSync(copy, manifest); },
  };
  for (const [name, change] of Object.entries(tamper)) await t.test(name, t => {
    const { area, file, outside, unit, run } = upgradeHome(t);
    capture(unit);
    // The store as a failed upgrade left it: changed, with a WAL still beside it. Neither may move.
    changeStore(file);
    writeFileSync(`${file}-wal`, "a write-ahead log nobody may delete yet");
    const store = sha256(file), wal = sha256(`${file}-wal`);
    change(runFiles(run), outside);
    assert.throws(() => restoreUpgradeSnapshot(unit), failure("snapshot_invalid", area));
    assert.throws(() => verifyUpgradeSnapshot(unit), failure("snapshot_invalid", area));
    assert.equal(sha256(file), store);
    assert.equal(sha256(`${file}-wal`), wal);
    assert.equal(present(`${file}.upgrade-restore`), false);
  });
});

test("S-upgrade-restore-verified S-145: restoring removes a stale WAL first, because left there it reads back as the upgraded store", t => {
  const { area, file, unit, run } = upgradeHome(t);
  const entry = capture(unit), notes = notesOf(file);
  // A WAL with the upgrade committed in it, the one thing a restore can leave behind by mistake.
  const db = new DatabaseSync(file);
  db.exec("PRAGMA wal_autocheckpoint = 0");
  runSqliteUpgrade(db, file, { version: 2, schema: "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL, tag TEXT);", upgrades: [{ from: 1, sql: "ALTER TABLE notes ADD COLUMN tag TEXT; UPDATE notes SET tag = 'upgraded'" }] });
  const staleWal = readFileSync(`${file}-wal`);
  db.close();
  assert.equal(versionOf(file), 2);

  // The trap itself, on a copy: the baseline's bytes with that WAL beside them read as version 2, and integrity_check still says ok.
  const trap = join(area, "trap.db");
  writeFileSync(trap, readFileSync(runFiles(run).snapshot));
  writeFileSync(`${trap}-wal`, staleWal);
  const trapped = new DatabaseSync(trap);
  assert.equal((trapped.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 2);
  assert.equal((trapped.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  trapped.close();

  writeFileSync(`${file}-wal`, staleWal);
  restoreUpgradeSnapshot(unit);
  assert.deepEqual(sidecarsOf(file), []);
  assert.equal(sha256(file), entry.sha256);
  assert.equal(versionOf(file), 1, "the old version, not the upgraded one");
  assert.deepEqual(notesOf(file), notes);
});

test("S-upgrade-restore-verified S-145: side files are removed without following them, and what cannot be removed stops the restore before the store is replaced", async t => {
  await t.test("a side file that is a link", t => {
    const { file, outside, unit } = upgradeHome(t);
    const entry = capture(unit), kept = join(outside, "kept");
    writeFileSync(kept, "not ours");
    symlinkSync(kept, `${file}-wal`);
    restoreUpgradeSnapshot(unit);
    assert.equal(readFileSync(kept, "utf8"), "not ours");
    assert.deepEqual(sidecarsOf(file), []);
    assert.equal(sha256(file), entry.sha256);
  });
  await t.test("a side file that is a directory", t => {
    const { area, file, unit } = upgradeHome(t);
    capture(unit);
    changeStore(file);
    const changed = sha256(file);
    mkdirSync(`${file}-wal`);
    assert.throws(() => restoreUpgradeSnapshot(unit), failure("restore_failed", area));
    assert.equal(sha256(file), changed);
    rmSync(`${file}-wal`, { recursive: true });
    restoreUpgradeSnapshot(unit);
    assert.equal(versionOf(file), 1);
  });
});
