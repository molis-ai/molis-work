// UPG1-03, UPG1-04, UPG1-05, UPG1-08, UPG1-17: the upgrade process (specs/upgrade-continuity/upgrade-chain-design.md §2.2, §3.3, §5.2, §6, §7).
// Every baseline here is a test baseline. The refusals themselves are in tests/security-invariants-home-upgrade.test.ts; the entries that
// take the lock are in tests/home-upgrade-entries.test.ts.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statfsSync, truncateSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";
import { acquireUpgradedHomeOwner, ensureHomeUpgraded, runHomeUpgrade, type HomeUpgradeDescriptor } from "@molis-ai/molis-work-app-local-host";
import { acquireStorageOwner, openBaselineHomeSqlite, personalStorageSpace, type SqliteBaseline } from "@molis-ai/molis-work-storage";
import {
  ADD_TAG, BASELINE_V2, failingBaseline, ledgerFile, ledgerOf, notesDescriptor, notesOf, onStore, openNode, present, relativeStore, seedStore, sha256, stampFile, storePath, unitOf, upgradeTestHome, useDescriptors, V1, V2, versionOf,
} from "./fixtures/home-upgrade-home.js";

const CRASH = fileURLToPath(new URL("./fixtures/home-upgrade-crash.mjs", import.meta.url));

/** The refusal a business open of this store gets. */
const openRefusal = (home: string, name: string, baseline: SqliteBaseline = BASELINE_V2) => {
  try { openBaselineHomeSqlite(home, name, baseline).close(); return undefined; }
  catch (error) { return (error as { code?: string }).code; }
};

test("UPG1-03: three stores, the second fails: the other two are upgraded, the second is put back and refused on its own", t => {
  const { home } = upgradeTestHome(t);
  const files = ["first", "second", "third"].map(name => seedStore(home, name));
  const second = sha256(files[1]!), notes = notesOf(files[1]!);
  useDescriptors(t, notesDescriptor("first"), notesDescriptor("second", { baseline: failingBaseline("secret text from a row") }), notesDescriptor("third"));
  const report = runHomeUpgrade(home);
  assert.deepEqual(report.units.map(unit => [unit.relative_path, unit.state]), [["first/first.db", "committed"], ["second/second.db", "failed"], ["third/third.db", "committed"]]);
  assert.deepEqual(unitOf(home, "second")?.error, { code: "storage.upgrade_failed", reason: "step_failed" });
  assert.equal(versionOf(files[0]!), 2);
  assert.equal(versionOf(files[2]!), 2);
  assert.equal(sha256(files[1]!), second, "byte for byte what it was before the first write");
  assert.deepEqual(notesOf(files[1]!), notes);
  assert.equal(present(stampFile(home)), false, "a failed store leaves no stamp");
  assert.ok(!readFileSync(ledgerFile(home), "utf8").includes("secret text"), "the record keeps the code and the reason, never what a step said");

  const owner = acquireUpgradedHomeOwner(home);
  try {
    assert.equal(openRefusal(home, "first"), undefined);
    assert.equal(openRefusal(home, "third"), undefined);
    assert.equal(openRefusal(home, "second"), "storage.upgrade_failed", "the holder of the lock knows what happened to it");
  } finally { owner.release(); }
  assert.equal(openRefusal(home, "second"), "storage.upgrade_pending", "without the lock only the classification speaks, and nothing listens");
});

test("UPG1-03: under one fingerprint a failed store is not tried again; a new version is", t => {
  const { home } = upgradeTestHome(t);
  const file = seedStore(home, "second"), before = sha256(file);
  let opens = 0;
  const counted = (path: string) => { opens += 1; return openNode(path); };
  const stop = useDescriptors(t, notesDescriptor("second", { baseline: failingBaseline(), open: counted }));
  runHomeUpgrade(home);
  assert.equal(unitOf(home, "second")?.state, "failed");
  const recorded = readFileSync(ledgerFile(home), "utf8");
  opens = 0;
  assert.equal(runHomeUpgrade(home).units[0]?.state, "failed");
  assert.equal(opens, 0, "the versions are read again, but no writable connection is opened on it");
  assert.equal(readFileSync(ledgerFile(home), "utf8"), recorded, "nothing new to say");
  assert.equal(sha256(file), before);
  stop();
  useDescriptors(t, notesDescriptor("second", { baseline: { version: 3, schema: V2, upgrades: [{ from: 1, sql: ADD_TAG }, { from: 2, sql: "SELECT 1" }] } }));
  assert.equal(runHomeUpgrade(home).units[0]?.state, "committed", "a changed fingerprint gives it another go");
  assert.equal(versionOf(file), 3);
});

test("UPG1-03: a store that needs another one upgraded first is not tried when that one fails", t => {
  const { home } = upgradeTestHome(t);
  seedStore(home, "first");
  const dependent = seedStore(home, "dependent"), before = sha256(dependent);
  useDescriptors(t, notesDescriptor("first", { baseline: failingBaseline() }), notesDescriptor("dependent", { after: [relativeStore("first")] }));
  runHomeUpgrade(home);
  assert.deepEqual(unitOf(home, "dependent")?.error, { code: "storage.upgrade_failed", reason: "prerequisite_failed" });
  assert.equal(sha256(dependent), before);
});

test("UPG1-03: a failure after the commit is not put back: the version says it was upgraded", t => {
  const { home } = upgradeTestHome(t);
  const file = seedStore(home, "rebuilt");
  // The connection refuses to turn foreign keys back on after the commit, which is how the real run reports it.
  useDescriptors(t, notesDescriptor("rebuilt", {
    baseline: { version: 2, schema: V2, upgrades: [{ from: 1, sql: ADD_TAG, rebuilds_tables: true }] },
    open: path => {
      const db = openNode(path);
      let switches = 0;
      return new Proxy(db, { get(target, name) {
        if (name === "exec") return (sql: string) => { if (sql.startsWith("PRAGMA foreign_keys") && ++switches === 2) return undefined; return target.exec(sql); };
        const value = Reflect.get(target, name);
        return typeof value === "function" ? value.bind(target) : value;
      } });
    },
  }));
  runHomeUpgrade(home);
  assert.equal(unitOf(home, "rebuilt")?.state, "committed");
  assert.equal(versionOf(file), 2);
  assert.deepEqual(notesOf(file).map(row => row.tag), ["", ""], "not put back");
});

test("UPG1-03: not enough disk: this round touches nothing, records why, and the next start tries again", t => {
  const { home } = upgradeTestHome(t);
  const first = seedStore(home, "first"), second = seedStore(home, "second");
  const { bavail, bsize } = statfsSync(home);
  const size = readFileSync(first).length;
  truncateSync(first, bavail * bsize);
  const before = [sha256(second)];
  useDescriptors(t, notesDescriptor("first"), notesDescriptor("second"));
  runHomeUpgrade(home);
  for (const name of ["first", "second"]) assert.deepEqual(unitOf(home, name)?.error?.code, "storage.upgrade_no_space");
  assert.deepEqual([sha256(second)], before);
  assert.deepEqual(readdirSync(join(home, "upgrade")).sort(), ["ledger.json"], "no snapshot was taken");
  const owner = acquireUpgradedHomeOwner(home);
  try { assert.equal(openRefusal(home, "second"), "storage.upgrade_no_space"); }
  finally { owner.release(); }
  truncateSync(first, size);
  assert.deepEqual(runHomeUpgrade(home).units.map(unit => unit.state), ["committed", "committed"], "no version change was needed for the retry");
});

test("UPG1-04: a store newer than this build is read for its version only, recorded, and refused on its own", t => {
  const { home } = upgradeTestHome(t);
  const newer = seedStore(home, "newer", { version: 3 }), other = seedStore(home, "other");
  const before = sha256(newer);
  useDescriptors(t, notesDescriptor("newer"), notesDescriptor("other"));
  assert.deepEqual(runHomeUpgrade(home).units.map(unit => [unit.relative_path, unit.state]), [["newer/newer.db", "too_new"], ["other/other.db", "committed"]]);
  assert.equal(sha256(newer), before);
  assert.equal(present(`${newer}-wal`) || present(`${newer}-shm`), false, "a closed store gets no side files either");
  assert.equal(versionOf(other), 2);
  assert.equal(present(stampFile(home)), false);
  assert.equal(openRefusal(home, "newer"), "storage.store_too_new");
  assert.equal(openRefusal(home, "other"), undefined);
});

test("UPG1-08: a matching stamp opens nothing: the store could be anything", t => {
  const { home } = upgradeTestHome(t);
  const file = seedStore(home, "notes");
  let opens = 0, lists = 0;
  useDescriptors(t, notesDescriptor("notes", { open: path => { opens += 1; return openNode(path); }, paths: () => { lists += 1; return [relativeStore("notes")]; } }));
  assert.equal(runHomeUpgrade(home).stamped, true);
  const stamp = JSON.parse(readFileSync(stampFile(home), "utf8")) as Record<string, unknown>;
  assert.deepEqual(Object.keys(stamp).sort(), ["completed_at", "fingerprint", "home_identity", "schema_version"]);
  opens = 0; lists = 0;
  writeFileSync(file, "this is no database: reading it would fail");
  assert.deepEqual(runHomeUpgrade(home), { ran: false, stamped: false, units: [] });
  assert.deepEqual([opens, lists], [0, 0], "not a single connection, nor a listing");
});

test("UPG1-08: a new fingerprint scans, and with every store current only writes the stamp", t => {
  const { home } = upgradeTestHome(t);
  seedStore(home, "notes", { version: 2, schema: V2 });
  const stop = useDescriptors(t, notesDescriptor("notes"));
  assert.equal(runHomeUpgrade(home).stamped, true);
  assert.equal(present(ledgerFile(home)), false, "nothing to record");
  const first = readFileSync(stampFile(home), "utf8");
  stop();
  seedStore(home, "more", { version: 2, schema: V2 });
  useDescriptors(t, notesDescriptor("notes"), notesDescriptor("more"));
  assert.equal(runHomeUpgrade(home).stamped, true);
  assert.notEqual(readFileSync(stampFile(home), "utf8"), first);
});

test("UPG1-08: no stamp while anything is not current; an empty Home keeps no upgrade directory at all", t => {
  const { home } = upgradeTestHome(t);
  useDescriptors(t, notesDescriptor("notes"));
  assert.equal(runHomeUpgrade(home).stamped, false);
  assert.equal(present(join(home, "upgrade")), false, "preflightMemoryHome would call a Home with only this a damaged one");
  seedStore(home, "notes", { version: 3 });
  assert.equal(runHomeUpgrade(home).stamped, false);
  assert.equal(present(stampFile(home)), false);
});

test("UPG1-08: with nothing registered a Home is never touched", t => {
  const { home } = upgradeTestHome(t);
  assert.deepEqual(runHomeUpgrade(home), { ran: false, stamped: false, units: [] });
  assert.equal(present(join(home, "upgrade")), false);
});

test("UPG1-08: a store put back by hand: the lock's holder refuses the open and drops the stamp, and the next start upgrades it", t => {
  const { home } = upgradeTestHome(t);
  const file = seedStore(home, "notes"), oldCopy = `${file}.old`;
  copyFileSync(file, oldCopy);
  useDescriptors(t, notesDescriptor("notes"));
  runHomeUpgrade(home);
  const firstRun = ledgerOf(home).run_id;
  assert.equal(present(stampFile(home)), true);
  copyFileSync(oldCopy, file);

  assert.equal(openRefusal(home, "notes"), "storage.upgrade_pending");
  assert.equal(present(stampFile(home)), true, "a process without the lock has no listener and writes nothing");

  // The stamp still matches, so taking the lock upgrades nothing: this is the case the signal exists for.
  const owner = acquireUpgradedHomeOwner(home);
  try {
    assert.equal(versionOf(file), 1);
    assert.equal(openRefusal(home, "notes"), "storage.upgrade_pending");
    assert.equal(present(stampFile(home)), false, "the holder drops it");
    openBaselineHomeSqlite(home, "unrelated", { version: 1, schema: V1 }).close();
  } finally { owner.release(); }

  const report = runHomeUpgrade(home);
  assert.equal(report.stamped, true);
  assert.equal(versionOf(file), 2);
  assert.notEqual(ledgerOf(home).run_id, firstRun, "another run, so the first run's snapshot of the same file is not in its way");
  assert.deepEqual(readdirSync(join(home, "upgrade")).filter(name => !name.endsWith(".json")), [ledgerOf(home).run_id], "the successful upgrade removes the earlier snapshots");
});

test("UPG1-08: the holder's listener ends with the lock and only hears its own Home", t => {
  const { area, home } = upgradeTestHome(t);
  const other = join(area, "other");
  mkdirSync(other, { mode: 0o700 });
  seedStore(home, "notes", { version: 2, schema: V2 });
  seedStore(other, "notes");
  useDescriptors(t, notesDescriptor("notes"));
  const owner = acquireUpgradedHomeOwner(home);
  assert.equal(present(stampFile(home)), true);
  assert.equal(openRefusal(other, "notes"), "storage.upgrade_pending");
  assert.equal(present(stampFile(home)), true, "another Home's store says nothing about this one");
  owner.release();
  writeFileSync(storePath(home, "notes"), "");
  seedStore(home, "notes");
  assert.equal(openRefusal(home, "notes"), "storage.upgrade_pending");
  assert.equal(present(stampFile(home)), true, "the lock is gone, so nothing listens");
});

test("UPG1-17: a Home store with its space table and a trigger upgrades, and nothing is written before the snapshot", t => {
  const { home } = upgradeTestHome(t);
  const trigger = "CREATE TRIGGER notes_touch AFTER UPDATE ON notes BEGIN SELECT 1; END;";
  const file = seedStore(home, "notes", { schema: `${V1} ${trigger}` });
  const before = sha256(file);
  useDescriptors(t, notesDescriptor("notes", { baseline: { version: 2, schema: `${V2} ${trigger}`, upgrades: [{ from: 1, sql: ADD_TAG }] } }));
  assert.equal(runHomeUpgrade(home).units[0]?.state, "committed");
  assert.equal(versionOf(file), 2);
  const run = ledgerOf(home).run_id;
  const manifest = JSON.parse(readFileSync(join(home, "upgrade", run, "manifest.json"), "utf8")) as { files: { sha256: string; sqlite: { user_version: number } }[] };
  assert.equal(manifest.files[0]!.sha256, before, "the snapshot is the file as it was found");
  assert.equal(manifest.files[0]!.sqlite.user_version, 1);
  assert.equal(onStore(file, db => db.prepare("SELECT count(*) AS n FROM molis_storage_space").get() as { n: number }).n, 1);
});

test("UPG1-17: a store bound to another space is recorded failed without touching the file or taking a snapshot", t => {
  const { home } = upgradeTestHome(t);
  const stranger = personalStorageSpace("https://auth.example", "work", "someone-else");
  const file = seedStore(home, "notes", { space: stranger }), before = sha256(file);
  seedStore(home, "mine");
  useDescriptors(t, notesDescriptor("notes"), notesDescriptor("mine"));
  runHomeUpgrade(home);
  assert.deepEqual(unitOf(home, "notes")?.error, { code: "storage.upgrade_failed", reason: "space_mismatch" });
  assert.equal(unitOf(home, "mine")?.state, "committed");
  assert.equal(sha256(file), before);
  const manifest = JSON.parse(readFileSync(join(home, "upgrade", ledgerOf(home).run_id, "manifest.json"), "utf8")) as { files: { path: string }[] };
  assert.deepEqual(manifest.files.map(entry => entry.path), [relativeStore("mine")]);
});

test("UPG1-17: a Home with no identity file yet upgrades a store with no binding, and a binding it cannot compare is refused", t => {
  const { home } = upgradeTestHome(t);
  const stranger = personalStorageSpace("https://auth.example", "work", "someone-else");
  const unbound = seedStore(home, "unbound", { space: null }), bound = seedStore(home, "bound", { space: stranger }), before = sha256(bound);
  useDescriptors(t, notesDescriptor("unbound"), notesDescriptor("bound"));
  assert.equal(present(join(home, "storage-space.json")), false);
  runHomeUpgrade(home);
  assert.equal(versionOf(unbound), 2);
  assert.equal(unitOf(home, "bound")?.error?.reason, "space_mismatch");
  assert.equal(sha256(bound), before);
  assert.equal(ledgerOf(home).home_identity, "unbound");
});

// ---- UPG1-05: kill -9 at every state switch ---------------------------------------------------------------------------------------

const crashDescriptors = (scenario: "ok" | "fail"): HomeUpgradeDescriptor[] => ["alpha", "beta"].map(name =>
  notesDescriptor(name, { baseline: scenario === "fail" && name === "beta" ? failingBaseline() : BASELINE_V2 }));

function crashHome(t: TestContext) {
  const { home } = upgradeTestHome(t);
  const alpha = seedStore(home, "alpha", { journal: "WAL" }), beta = seedStore(home, "beta");
  return { home, alpha, beta, betaBase: sha256(beta) };
}

const runChild = (home: string, scenario: string, mode: number | "trace") => {
  const result = spawnSync(process.execPath, [CRASH, home, scenario, String(mode)], { env: process.env, encoding: "utf8" });
  return { killed: result.signal === "SIGKILL", status: result.status, stdout: result.stdout, stderr: result.stderr };
};

/** Each store is a whole old or a whole new one, and a stamp means every store is new. */
function assertWhole(home: string, stores: readonly string[]): void {
  const versions = stores.map(versionOf);
  for (const [index, file] of stores.entries()) {
    const columns = onStore(file, db => (db.prepare("PRAGMA table_info(notes)").all() as { name: string }[]).map(column => column.name));
    assert.deepEqual(columns, versions[index] === 2 ? ["id", "body", "tag"] : ["id", "body"], `version ${versions[index]} has that version's shape`);
    assert.equal(notesOf(file).length, 2, "no row went missing");
  }
  if (present(stampFile(home))) assert.deepEqual(versions, stores.map(() => 2), "a stamp with an old store behind it is the one state that must never exist");
}

for (const scenario of ["ok", "fail"] as const) {
  test(`UPG1-05: killed at any file operation of a round (${scenario}), the next start finishes the job`, { timeout: 300_000 }, async t => {
    const traced = crashHome(t), traceRun = runChild(traced.home, scenario, "trace");
    assert.equal(traceRun.status, 0, traceRun.stderr);
    const operations = JSON.parse(traceRun.stdout) as string[];
    assert.ok(operations.some(name => name.startsWith("renameSync:.ledger.json")) && operations.some(name => name.startsWith("renameSync:.manifest.json")));
    assert.equal(operations.some(name => name.startsWith("renameSync:.state.json")), scenario === "ok");
    // The calls that change what the next start sees, and the one right after each rename. Each file operation of the snapshot and of the
    // restore has its own case in tests/upgrade-snapshot.test.ts.
    const worthKilling = (name: string) => /^(?:writeFileSync|renameSync|copyFileSync|rmSync):|^chmodSync:(?:ledger|state)\.json$/.test(name);

    for (let kill = 1; kill <= operations.length; kill += 1) {
      if (!worthKilling(operations[kill - 1]!)) continue;
      await t.test(`at ${kill}: ${operations[kill - 1]}`, t => {
        const { home, alpha, beta, betaBase } = crashHome(t);
        const child = runChild(home, scenario, kill);
        assert.ok(child.killed, `the child reached call ${kill}: ${child.stderr}`);
        assertWhole(home, [alpha, beta]);
        const stop = useDescriptors(t, ...crashDescriptors(scenario));
        runHomeUpgrade(home);
        stop();
        assertWhole(home, [alpha, beta]);
        assert.equal(versionOf(alpha), 2);
        if (scenario === "ok") {
          assert.equal(versionOf(beta), 2);
          assert.equal(present(stampFile(home)), true);
          assert.deepEqual(ledgerOf(home).units.map(unit => unit.state), ["committed", "committed"]);
        } else {
          assert.equal(sha256(beta), betaBase, "put back byte for byte");
          assert.equal(unitOf(home, "beta")?.state, "failed");
          assert.equal(present(stampFile(home)), false);
        }
      });
    }
  });
}

test("UPG1-05: killed between the commit and recording it: the next start records it and does not run the step again", t => {
  const { home, alpha } = crashHome(t);
  const traceHome = crashHome(t), operations = JSON.parse(runChild(traceHome.home, "ok", "trace").stdout) as string[];
  // The commit makes no file call of its own. After the snapshot's manifest come the record of `snapshotted`, the transaction, and the record of `committed`.
  const manifest = operations.findIndex(name => name.startsWith("renameSync:.manifest.json"));
  const firstRecord = operations.findIndex((name, index) => index > manifest && name.startsWith("writeFileSync:.ledger.json"));
  const secondRecord = operations.findIndex((name, index) => index > firstRecord && name.startsWith("writeFileSync:.ledger.json"));
  assert.ok(manifest > 0 && firstRecord > manifest && secondRecord > firstRecord);
  assert.ok(runChild(home, "ok", secondRecord + 1).killed);
  assert.equal(unitOf(home, "alpha")?.state, "snapshotted", "the record is behind the store");
  assert.equal(versionOf(alpha), 2, "the transaction had committed");
  onStore(alpha, db => db.exec("UPDATE notes SET tag = 'written after the commit' WHERE id = '1'"));
  let runs = 0;
  useDescriptors(t, notesDescriptor("alpha", { baseline: { version: 2, schema: V2, upgrades: [{ from: 1, run: () => { runs += 1; throw new Error("must not run"); } }] } }), notesDescriptor("beta"));
  runHomeUpgrade(home);
  assert.equal(runs, 0, "running it again would hit the duplicate column, and putting it back would undo the upgrade");
  assert.equal(unitOf(home, "alpha")?.state, "committed");
  assert.equal(notesOf(alpha)[0]?.tag, "written after the commit", "nothing was put back");
});

test("UPG1-05: killed inside the transaction: SQLite drops it, and the run starts over from the same snapshot", t => {
  const { home, alpha, beta, betaBase } = crashHome(t);
  assert.ok(runChild(home, "die-in-step", "0").killed);
  assert.equal(unitOf(home, "beta")?.state, "snapshotted");
  assert.equal(versionOf(alpha), 2);
  assert.equal(versionOf(beta), 1);
  const run = ledgerOf(home).run_id;
  useDescriptors(t, notesDescriptor("alpha"), notesDescriptor("beta"));
  runHomeUpgrade(home);
  assert.equal(ledgerOf(home).run_id, run, "the same round goes on");
  assert.equal(versionOf(beta), 2);
  const manifest = JSON.parse(readFileSync(join(home, "upgrade", run, "manifest.json"), "utf8")) as { files: { path: string; sha256: string }[] };
  assert.equal(manifest.files.find(entry => entry.path === relativeStore("beta"))?.sha256, betaBase);
});

test("UPG1-05: a resumed round holds the same lock rules: another holder stops it before it reads the record", t => {
  const { home } = crashHome(t);
  useDescriptors(t, notesDescriptor("alpha"), notesDescriptor("beta"));
  const owner = acquireStorageOwner(join(home, "agent-runtime"));
  try {
    assert.throws(() => runHomeUpgrade(home), { code: "storage.owner.busy" });
    assert.throws(() => ensureHomeUpgraded(dirname(home), owner), { code: "storage.owner.invalid" });
  } finally { owner.release(); }
});
