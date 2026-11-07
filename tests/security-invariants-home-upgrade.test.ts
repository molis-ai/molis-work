// S-upgrade-lock-only, S-upgrade-too-new-untouched, S-upgrade-ledger-verified (docs/system/security-invariants/): the design's provisional
// S-141, S-142, S-144 (specs/upgrade-continuity/upgrade-chain-design.md §10). Each test asserts the refusal, and that the refused thing changed nothing.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createDesktopUninstallService, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import {
  acquireUpgradedHomeOwner, catalogManagementProject, heldInstalls, MolisWorkWebServiceManager, runHomeUpgrade, runV1Cli, RuntimeIntegrationService,
} from "@molis-ai/molis-work-app-local-host";
import { acquireStorageOwner, openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import { storageOwnerProcesses } from "./fixtures/home-storage-owner.js";
import {
  BASELINE_V2, catalogAtBaseline, catalogDescriptor, catalogHome, failingBaseline, ledgerFile, ledgerOf, notesDescriptor, onStore, openNode, present, relativeStore, seedStore, sha256, stampFile, unitOf, upgradeTestHome, useDescriptors, versionOf, writeLedger, type LedgerOnDisk,
} from "./fixtures/home-upgrade-home.js";

const CLOSED_PORT = "http://127.0.0.1:9";

async function withPeer<T>(t: TestContext, lock: string, use: () => Promise<T> | T): Promise<T> {
  const peer = await storageOwnerProcesses(t).start(lock);
  try { assert.equal((await peer.request("acquire")).state, "held"); return await use(); }
  finally { await peer.stop(); }
}

const uninstallInspect = (home: string, area: string) => createDesktopUninstallService({ homeDirectory: home,
  runtimeIntegrationService: new RuntimeIntegrationService({ homeDirectory: home, userHomeDirectory: area,
    runtimeExecutables: { codex: null, "claude-code": null, opencode: null, "pi-agent": null, "grok-build": null } }),
  webServiceManager: new MolisWorkWebServiceManager({ homeDirectory: home, userHomeDirectory: area, platform: "linux" }) }).prepare();

test("S-upgrade-lock-only: another process holds the lock: `runHomeUpgrade` is refused, every store unchanged, no `upgrade/`", async t => {
  const { home, lock } = upgradeTestHome(t), files = ["alpha", "beta"].map(name => seedStore(home, name)), before = files.map(sha256);
  useDescriptors(t, notesDescriptor("alpha"), notesDescriptor("beta"));
  await withPeer(t, lock, () => {
    assert.throws(() => runHomeUpgrade(home), { code: "storage.owner.busy" });
    assert.throws(() => acquireUpgradedHomeOwner(home), { code: "storage.upgrade_in_progress" });
  });
  assert.deepEqual(files.map(sha256), before);
  assert.equal(present(join(home, "upgrade")), false);
});

test("S-upgrade-lock-only: this process holding the lock itself: a plain busy, and its stores are not opened", t => {
  const { home, lock } = upgradeTestHome(t), file = seedStore(home, "notes");
  let opened = 0;
  useDescriptors(t, notesDescriptor("notes", { open: path => { opened += 1; return openNode(path); } }));
  const owner = acquireStorageOwner(lock);
  try { assert.throws(() => acquireUpgradedHomeOwner(home), { code: "storage.owner.busy" }); }
  finally { owner.release(); }
  assert.equal(opened, 0);
  assert.equal(versionOf(file), 1);
  assert.equal(present(join(home, "upgrade")), false);
});

test("S-upgrade-lock-only: entries that upgrade report `storage.upgrade_in_progress` while held; their files stay as they were", async t => {
  const f = await catalogHome(t), before = sha256(f.catalog);
  catalogAtBaseline(t); useDescriptors(t, catalogDescriptor());
  await withPeer(t, f.lock, async () => {
    await assert.rejects(runV1Cli(["snapshot", "--db", f.project.database_path, "--json", JSON.stringify({ project_id: f.project.project_id })], { homeDirectory: f.home, actionServiceUrl: CLOSED_PORT }), { code: "storage.upgrade_in_progress" });
    await assert.rejects(withMolisWorkProjectCatalog({ homeDirectory: f.home }, async () => 0), { code: "storage.upgrade_in_progress" });
  });
  assert.equal(sha256(f.catalog), before);
  assert.equal(present(join(f.home, "upgrade")), false);
});

test("S-upgrade-lock-only: readers with no lock read or refuse, write nothing, and leave the stamp where it is", async t => {
  const f = await catalogHome(t);
  useDescriptors(t, catalogDescriptor({ baseline: { version: 1, schema: "", upgrades: [] } }));
  assert.equal(runHomeUpgrade(f.home).stamped, true);
  const stamp = readFileSync(stampFile(f.home));
  // The catalog is at 1, and from here the baseline it is read by is 2: to these readers it is one version older.
  catalogAtBaseline(t);
  const before = sha256(f.catalog);
  assert.throws(() => catalogManagementProject(f.home, f.project.database_path), { code: "storage.upgrade_pending" });
  assert.equal(heldInstalls(f.home).length, 0);
  assert.equal((await uninstallInspect(f.home, f.area)).status, "no_change", "the preview reads the catalog and finds no conflict");
  assert.equal(sha256(f.catalog), before);
  assert.deepEqual(readFileSync(stampFile(f.home)), stamp, "a reader with no lock has no listener, so the stamp stays");
  acquireStorageOwner(f.lock).release();
});

test("S-upgrade-lock-only: opening an older store with no lock held refuses and leaves the stamp", t => {
  const { home, lock } = upgradeTestHome(t), file = seedStore(home, "notes");
  useDescriptors(t, notesDescriptor("notes"));
  assert.equal(runHomeUpgrade(home).stamped, true);
  onStore(file, db => db.exec("PRAGMA user_version = 1"));
  assert.throws(() => openBaselineHomeSqlite(home, "notes", BASELINE_V2), { code: "storage.upgrade_pending" });
  assert.equal(present(stampFile(home)), true);
  acquireStorageOwner(lock).release();
  assert.equal(present(stampFile(home)), true, "taking and giving back the lock by hand does not start a listener either");
});

test("S-upgrade-too-new-untouched: a store one version ahead is refused on every path and its file is not touched", async t => {
  const { home, lock } = upgradeTestHome(t), file = seedStore(home, "notes", { version: 3 }), before = sha256(file);
  useDescriptors(t, notesDescriptor("notes"));
  const report = runHomeUpgrade(home);
  assert.equal(unitOf(home, "notes")?.state ?? report.units[0]?.state, "too_new");
  assert.equal(sha256(file), before);
  assert.equal(report.stamped, false);
  assert.throws(() => openBaselineHomeSqlite(home, "notes", BASELINE_V2), { code: "storage.store_too_new" });
  assert.equal(sha256(file), before);
  const owner = acquireUpgradedHomeOwner(home);
  try { assert.throws(() => openBaselineHomeSqlite(home, "notes", BASELINE_V2), { code: "storage.store_too_new" }); }
  finally { owner.release(); }
  assert.equal(sha256(file), before);
  assert.equal(existsSync(`${file}-wal`), false);
  acquireStorageOwner(lock).release();
});

test("S-upgrade-too-new-untouched: a too-new store is never snapshotted", t => {
  const { home } = upgradeTestHome(t), file = seedStore(home, "notes", { version: 3 });
  useDescriptors(t, notesDescriptor("notes"));
  runHomeUpgrade(home);
  const run = ledgerOf(home).run_id;
  assert.equal(present(join(home, "upgrade", run, relativeStore("notes"))), false);
  assert.equal(versionOf(file), 3);
});

/** A round stopped in the middle of putting a store back. A forged record steers this unit if anything: following it overwrites the row added here. */
function interruptedHome(t: TestContext) {
  const f = upgradeTestHome(t), file = seedStore(f.home, "notes");
  useDescriptors(t, notesDescriptor("notes", { baseline: failingBaseline() }));
  runHomeUpgrade(f.home);
  const ledger = ledgerOf(f.home);
  ledger.units[0]!.state = "restoring";
  ledger.units[0]!.error = null;
  writeLedger(f.home, ledger);
  onStore(file, db => db.exec("INSERT INTO notes (id, body) VALUES ('after', 'written since')"));
  return { ...f, file, ledger, sha: sha256(file) };
}

const unitOutcome = (report: ReturnType<typeof runHomeUpgrade>) => ({ state: report.units[0]?.state, reason: report.units[0]?.error?.reason });

const assertRefusedUntouched = (f: ReturnType<typeof interruptedHome>, outside?: string) => {
  assert.throws(() => runHomeUpgrade(f.home), (error: Error & { code?: string; details?: { reason?: string } }) => {
    assert.equal(error.code, "storage.upgrade_failed");
    assert.equal(error.details?.reason, "ledger_invalid");
    return true;
  });
  assert.equal(sha256(f.file), f.sha, "not put back");
  if (outside) assert.equal(readFileSync(outside, "utf8"), "a file outside the Home");
};

test("S-upgrade-ledger-verified: the record as it was written is followed, so the refusals below are about the forgery", t => {
  const f = interruptedHome(t);
  runHomeUpgrade(f.home);
  assert.notEqual(sha256(f.file), f.sha);
  assert.equal(versionOf(f.file), 1);
});

test("S-upgrade-ledger-verified: a record from another Home is refused and not followed", t => {
  const f = interruptedHome(t);
  writeLedger(f.home, { ...f.ledger, home_identity: "b".repeat(64) });
  assertRefusedUntouched(f);
});

test("S-upgrade-ledger-verified: a record whose `relative_path` leaves the Home, is absolute, or names no store is refused", async t => {
  await t.test("up and out", t => {
    const f = interruptedHome(t), outside = join(f.outside, "x"); writeFileSync(outside, "a file outside the Home");
    writeLedger(f.home, { ...f.ledger, units: [{ ...f.ledger.units[0]!, relative_path: "../outside/x" }] });
    assertRefusedUntouched(f, outside);
  });
  await t.test("absolute", t => {
    const f = interruptedHome(t), outside = join(f.outside, "x"); writeFileSync(outside, "a file outside the Home");
    writeLedger(f.home, { ...f.ledger, units: [{ ...f.ledger.units[0]!, relative_path: outside }] });
    assertRefusedUntouched(f, outside);
  });
  await t.test("no such store", t => {
    const f = interruptedHome(t);
    writeLedger(f.home, { ...f.ledger, units: [{ ...f.ledger.units[0]!, relative_path: "other/other.db" }] });
    assertRefusedUntouched(f);
  });
});

test("S-upgrade-ledger-verified: a unit's `to` that is not what this program would upgrade to is refused", t => {
  const f = interruptedHome(t);
  writeLedger(f.home, { ...f.ledger, units: [{ ...f.ledger.units[0]!, to: 3 }] });
  assertRefusedUntouched(f);
});

test("S-upgrade-ledger-verified: a record that cannot be read, or with a state or field it should not have, is refused", async t => {
  const forged: readonly [string, (ledger: LedgerOnDisk) => unknown][] = [
    ["a state nobody writes", ledger => ({ ...ledger, units: [{ ...ledger.units[0]!, state: "done" }] })],
    ["a unit twice", ledger => ({ ...ledger, units: [ledger.units[0]!, ledger.units[0]!] })],
    ["a run id with a path in it", ledger => ({ ...ledger, run_id: "../../outside" })],
    ["another schema version", ledger => ({ ...ledger, schema_version: 99 })],
  ];
  for (const [name, change] of forged) await t.test(name, t => {
    const f = interruptedHome(t);
    writeFileSync(ledgerFile(f.home), JSON.stringify(change(f.ledger)), { mode: 0o600 });
    assertRefusedUntouched(f);
  });
  await t.test("not JSON", t => {
    const f = interruptedHome(t);
    writeFileSync(ledgerFile(f.home), "{broken");
    assertRefusedUntouched(f);
  });
});

test("S-upgrade-ledger-verified: a link at `upgrade/` is not followed, and the refused call gives the lock back", t => {
  const f = upgradeTestHome(t), file = seedStore(f.home, "notes"), before = sha256(file);
  const elsewhere = join(f.outside, "elsewhere");
  mkdirSync(elsewhere);
  symlinkSync(elsewhere, join(f.home, "upgrade"));
  useDescriptors(t, notesDescriptor("notes"));
  assert.throws(() => runHomeUpgrade(f.home), { code: "storage.upgrade_failed" });
  assert.throws(() => acquireUpgradedHomeOwner(f.home), { code: "storage.upgrade_failed" });
  assert.equal(sha256(file), before);
  assert.equal(existsSync(join(elsewhere, "ledger.json")), false);
  acquireStorageOwner(f.lock).release();
});

test("S-upgrade-ledger-verified: a record pointing at a snapshot that is not there changes nothing, says so, and does not try again", t => {
  const f = interruptedHome(t);
  rmSync(join(f.home, "upgrade", f.ledger.run_id), { recursive: true });
  assert.deepEqual(unitOutcome(runHomeUpgrade(f.home)), { state: "failed", reason: "snapshot_invalid" });
  assert.equal(sha256(f.file), f.sha);
  runHomeUpgrade(f.home);
  assert.equal(sha256(f.file), f.sha);
  assert.equal(unitOf(f.home, "notes")?.state, "failed");
});
