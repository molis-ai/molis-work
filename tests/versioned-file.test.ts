// UPG1-06, UPG1-07: JSON files with a version in the upgrade process (upgrade-chain-design §2.6, §8.2). Temporary Homes only. What a too-new or
// damaged file refuses is in tests/security-invariants-versioned-file.test.ts.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { acquireUpgradedHomeOwner, runHomeUpgrade, type HomeUpgradeFileDescriptor } from "@molis-ai/molis-work-app-local-host";
import { readVersionedFile, SECRET_STORE_FILE, upgradeVersionedFileInPlace, type VersionedFile } from "@molis-ai/molis-work-storage";
import { ADD_TAG, ledgerOf, notesDescriptor, notesOf, seedStore, sha256, stampFile, upgradeTestHome, useDescriptors, V2, versionOf, writeLedger } from "./fixtures/home-upgrade-home.js";

interface Settings { readonly version: number; readonly name: string; readonly size?: number }

const SETTINGS: VersionedFile<Settings> = {
  version: 3, field: "version",
  upgrades: [
    { from: 1, transform: value => ({ ...(value as object), name: `${(value as Settings).name}!` }) },
    { from: 2, transform: value => ({ ...(value as object), size: (value as Settings).name.length }) },
  ],
  parse: value => { if (typeof (value as Settings).size !== "number") throw new Error("no size"); return value as Settings; },
};

const place = (home: string, relative: string, value: unknown, mode = 0o600) => {
  const file = join(home, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
  chmodSync(file, mode);
  return file;
};

const descriptor = (pattern: string, overrides: Partial<HomeUpgradeFileDescriptor> = {}): HomeUpgradeFileDescriptor => ({ owner: "tests/files", pattern, file: SETTINGS, ...overrides });
const json = (file: string) => JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
const unitAt = (home: string, relative: string) => ledgerOf(home).units.find(unit => unit.relative_path === relative)!;

test("UPG1-06: a reader sees what the file is and converts nothing", t => {
  const { home } = upgradeTestHome(t);
  assert.deepEqual(readVersionedFile(SETTINGS, join(home, "none.json")), { status: "absent" });
  assert.deepEqual(readVersionedFile(SETTINGS, join(place(home, "in-the-way", ""), "none.json")), { status: "absent" }, "a file where its directory should be");
  const older = place(home, "older.json", { version: 2, name: "a" }), before = sha256(older);
  assert.deepEqual(readVersionedFile(SETTINGS, older), { status: "upgrade_pending", found: 2 });
  assert.equal(sha256(older), before);
  assert.deepEqual(readVersionedFile(SETTINGS, place(home, "newer.json", { version: 4 })), { status: "too_new", found: 4 });
  assert.deepEqual(readVersionedFile(SETTINGS, place(home, "bad.json", "{")), { status: "unreadable" });
  assert.deepEqual(readVersionedFile(SETTINGS, place(home, "bare.json", { name: "a" })), { status: "unreadable" });
  assert.deepEqual(readVersionedFile(SETTINGS, place(home, "refused.json", { version: 3, name: "a" })), { status: "unreadable" }, "the owner's parse refuses it");
  const current = place(home, "current.json", { version: 3, name: "a", size: 1 });
  assert.deepEqual(readVersionedFile(SETTINGS, current), { status: "current", value: { version: 3, name: "a", size: 1 } });
});

test("UPG1-06: the process takes a file through its steps and over the owner's parse, with its mode, and stamps", t => {
  const { home } = upgradeTestHome(t), file = place(home, "conf/settings.json", { version: 1, name: "a" }, 0o640);
  useDescriptors(t, descriptor("conf/settings.json"));
  const report = runHomeUpgrade(home);
  assert.deepEqual(json(file), { version: 3, name: "a!", size: 2 });
  assert.equal(statSync(file).mode & 0o777, 0o640);
  assert.equal(report.stamped, true);
  const unit = unitAt(home, "conf/settings.json");
  assert.deepEqual([unit.kind, unit.from, unit.to, unit.state], ["file", 1, 3, "committed"]);
});

test("UPG1-06: a step that throws, and a result the owner refuses: the file is back byte for byte, the record says which, and other units go on", async t => {
  for (const [name, broken, reason] of [
    ["a step that throws", { ...SETTINGS, upgrades: [SETTINGS.upgrades[0]!, { from: 2, transform: () => { throw new Error("the file's own words"); } }] }, "step_failed"],
    ["a result the owner refuses", { ...SETTINGS, upgrades: [SETTINGS.upgrades[0]!, { from: 2, transform: (value: unknown) => value }] }, "verify_failed"],
    ["a step left out", { ...SETTINGS, upgrades: [SETTINGS.upgrades[0]!] }, "missing_step"],
  ] as const) {
    await t.test(name, t => {
      const { home } = upgradeTestHome(t), file = place(home, "conf/settings.json", { version: 1, name: "a" }), other = place(home, "conf/other.json", { version: 1, name: "b" }), before = sha256(file);
      useDescriptors(t, descriptor("conf/settings.json", { file: broken }), descriptor("conf/other.json"));
      assert.equal(runHomeUpgrade(home).stamped, false);
      assert.equal(sha256(file), before);
      const unit = unitAt(home, "conf/settings.json");
      assert.deepEqual([unit.state, unit.error?.reason], ["failed", reason]);
      assert.equal(JSON.stringify(ledgerOf(home)).includes("the file's own words"), false);
      assert.equal(json(other).version, 3);
    });
  }
});

test("UPG1-06: a file too new stops nothing else and is not touched; a file that does not parse is this file's failure, and no stamp is written", t => {
  const { home } = upgradeTestHome(t), newer = place(home, "conf/newer.json", { version: 9 }), bad = place(home, "conf/bad.json", "{"), fine = place(home, "conf/fine.json", { version: 1, name: "c" });
  const newerBefore = sha256(newer), badBefore = sha256(bad);
  useDescriptors(t, descriptor("conf/newer.json"), descriptor("conf/bad.json"), descriptor("conf/fine.json"));
  const report = runHomeUpgrade(home);
  assert.equal(sha256(newer), newerBefore);
  assert.equal(sha256(bad), badBefore);
  assert.equal(json(fine).version, 3);
  assert.equal(report.stamped, false);
  assert.equal(existsSync(stampFile(home)), false);
  assert.equal(unitAt(home, "conf/newer.json").state, "too_new");
  assert.equal(unitAt(home, "conf/bad.json").error?.reason, "unreadable");
});

test("UPG1-06: interrupted: a file recorded `snapshotted` is judged by its own version when the process comes back", async t => {
  await t.test("already at the target: `committed`, no step run again", t => {
    const { home } = upgradeTestHome(t), file = place(home, "conf/settings.json", { version: 1, name: "a" });
    let steps = 0;
    const counted = { ...SETTINGS, upgrades: SETTINGS.upgrades.map(step => ({ ...step, transform: (value: unknown) => { steps += 1; return step.transform(value); } })) };
    useDescriptors(t, descriptor("conf/settings.json", { file: counted }));
    runHomeUpgrade(home);
    assert.equal(steps, 2);
    const after = sha256(file), ledger = ledgerOf(home);
    writeLedger(home, { ...ledger, units: ledger.units.map(unit => ({ ...unit, state: "snapshotted" })) });
    writeFileSync(stampFile(home), "");
    assert.equal(runHomeUpgrade(home).stamped, true);
    assert.equal(steps, 2);
    assert.equal(sha256(file), after);
    assert.equal(unitAt(home, "conf/settings.json").state, "committed");
  });
  await t.test("still at the start: the steps run and the same snapshot is kept", t => {
    const { home } = upgradeTestHome(t), original = { version: 1, name: "a" }, file = place(home, "conf/settings.json", original);
    useDescriptors(t, descriptor("conf/settings.json"));
    runHomeUpgrade(home);
    const ledger = ledgerOf(home);
    writeFileSync(file, JSON.stringify(original));
    chmodSync(file, 0o600);
    writeLedger(home, { ...ledger, units: ledger.units.map(unit => ({ ...unit, state: "snapshotted" })) });
    writeFileSync(stampFile(home), "");
    assert.equal(runHomeUpgrade(home).stamped, true);
    assert.deepEqual(json(file), { version: 3, name: "a!", size: 2 });
  });
});

test("UPG1-06: a file a person put back: the holder of the lock forgets its stamp when an owner reads it, and the next start upgrades it", t => {
  const { home } = upgradeTestHome(t), file = place(home, "conf/settings.json", { version: 1, name: "a" });
  useDescriptors(t, descriptor("conf/settings.json"));
  assert.equal(runHomeUpgrade(home).stamped, true);
  writeFileSync(file, JSON.stringify({ version: 1, name: "a" }));
  assert.equal(existsSync(stampFile(home)), true, "the stamp has not noticed");
  assert.deepEqual(readVersionedFile(SETTINGS, file, home), { status: "upgrade_pending", found: 1 });
  assert.equal(existsSync(stampFile(home)), true, "a reader with no lock writes nothing");
  const owner = acquireUpgradedHomeOwner(home);
  try {
    assert.equal(json(file).version, 1, "the stamp matched, so this start scanned nothing");
    assert.deepEqual(readVersionedFile(SETTINGS, file, home), { status: "upgrade_pending", found: 1 });
    assert.equal(existsSync(stampFile(home)), false, "the holder of the lock forgets it");
  } finally { owner.release(); }
  assert.equal(runHomeUpgrade(home).stamped, true);
  assert.equal(json(file).version, 3);
});

/** A fake store and one key: the old key can only read, the new one can only write. A plaintext never passes through the ledger or the snapshot. */
function fakeSecrets() {
  const sealed = new Map<string, string>([["model", "old:sk-test-value"]]);
  return {
    sealed,
    get: (ref: string) => { const value = sealed.get(ref); return value?.startsWith("old:") || value?.startsWith("new:") ? value.slice(4) : null; },
    put: (ref: string, plaintext: string) => { sealed.set(ref, `new:${plaintext}`); },
  };
}

test("UPG1-07: a secrets file and the store it seals are one group: they go up together, and everything still reads", t => {
  const { home } = upgradeTestHome(t), secrets = fakeSecrets();
  const map = place(home, "conf/sealed.json", { version: 1, entries: {} }), notes = seedStore(home, "notes");
  const reSeal = () => { const value = secrets.get("model")!; secrets.put("model", value); assert.equal(secrets.get("model"), value); };
  const file: VersionedFile = { version: 2, field: "version", upgrades: [{ from: 1, transform: value => { reSeal(); return value; } }], parse: value => value };
  useDescriptors(t, { owner: "tests/secrets", pattern: "conf/sealed.json", file, group: "sealed" },
    notesDescriptor("notes", { group: "sealed", baseline: { version: 2, schema: V2, upgrades: [{ from: 1, sql: ADD_TAG }] } }));
  assert.equal(runHomeUpgrade(home).stamped, true);
  assert.equal(json(map).version, 2);
  assert.equal(versionOf(notes), 2);
  assert.equal(secrets.get("model"), "sk-test-value");
  assert.equal(secrets.sealed.get("model"), "new:sk-test-value");
});

test("UPG1-07: the second of a group fails: the first goes back too, though it had finished, and no test key is in the snapshot", t => {
  const { home } = upgradeTestHome(t);
  const map = place(home, "conf/sealed.json", { version: 1, entries: { model: "sealed-bytes" } }), notes = seedStore(home, "notes"), mapBefore = sha256(map), notesBefore = sha256(notes);
  const file: VersionedFile = { version: 2, field: "version", upgrades: [{ from: 1, transform: value => value }], parse: value => value };
  useDescriptors(t, { owner: "tests/secrets", pattern: "conf/sealed.json", file, group: "sealed" },
    notesDescriptor("notes", { group: "sealed", baseline: { version: 2, schema: V2, upgrades: [{ from: 1, run: db => { db.exec(ADD_TAG); throw new Error("sk-test-value"); } }] } }));
  assert.equal(runHomeUpgrade(home).stamped, false);
  assert.equal(sha256(map), mapBefore);
  assert.equal(sha256(notes), notesBefore);
  assert.equal(unitAt(home, "conf/sealed.json").state, "failed");
  assert.equal(unitAt(home, "conf/sealed.json").error?.reason, "group_failed");
  assert.equal(unitAt(home, "notes/notes.db").state, "failed");
  const run = join(home, "upgrade", ledgerOf(home).run_id);
  for (const name of readdirSync(run)) assert.equal(readFileSync(join(run, name)).includes("sk-test-value"), false, name);
  assert.deepEqual(notesOf(notes).map(row => row.id), ["1", "2"]);
});

test("UPG1-07: the first of a group fails: the second is not tried, and one too new holds the group back as well", async t => {
  await t.test("the first fails", t => {
    const { home } = upgradeTestHome(t), map = place(home, "conf/sealed.json", { version: 1, entries: {} }), notes = seedStore(home, "notes"), before = sha256(notes);
    const file: VersionedFile = { version: 2, field: "version", upgrades: [{ from: 1, transform: () => { throw new Error("no"); } }], parse: value => value };
    let ran = 0;
    useDescriptors(t, { owner: "tests/secrets", pattern: "conf/sealed.json", file, group: "sealed" },
      notesDescriptor("notes", { group: "sealed", baseline: { version: 2, schema: V2, upgrades: [{ from: 1, run: db => { ran += 1; db.exec(ADD_TAG); } }] } }));
    runHomeUpgrade(home);
    assert.equal(ran, 0);
    assert.equal(sha256(notes), before);
    assert.equal(json(map).version, 1);
    assert.equal(unitAt(home, "notes/notes.db").error?.reason, "group_failed");
  });
  await t.test("one too new", t => {
    const { home } = upgradeTestHome(t), map = place(home, "conf/sealed.json", { version: 5, entries: {} }), notes = seedStore(home, "notes"), mapBefore = sha256(map), notesBefore = sha256(notes);
    const file: VersionedFile = { version: 2, field: "version", upgrades: [{ from: 1, transform: value => value }], parse: value => value };
    useDescriptors(t, { owner: "tests/secrets", pattern: "conf/sealed.json", file, group: "sealed" }, notesDescriptor("notes", { group: "sealed" }));
    runHomeUpgrade(home);
    assert.equal(sha256(map), mapBefore);
    assert.equal(sha256(notes), notesBefore);
    assert.equal(unitAt(home, "notes/notes.db").error?.reason, "group_failed");
  });
});

test("UPG1-07: killed half way back: the group finishes going back when the process returns", t => {
  const { home } = upgradeTestHome(t);
  const map = place(home, "conf/sealed.json", { version: 1, entries: {} }), notes = seedStore(home, "notes"), mapBefore = sha256(map);
  const file: VersionedFile = { version: 2, field: "version", upgrades: [{ from: 1, transform: value => value }], parse: value => value };
  useDescriptors(t, { owner: "tests/secrets", pattern: "conf/sealed.json", file, group: "sealed" },
    notesDescriptor("notes", { group: "sealed", baseline: { version: 2, schema: V2, upgrades: [{ from: 1, run: db => { db.exec(ADD_TAG); throw new Error("no"); } }] } }));
  runHomeUpgrade(home);
  // As if killed after the store's restore began and before the file's: the file is upgraded and the record still calls it finished.
  const ledger = ledgerOf(home);
  writeFileSync(map, JSON.stringify({ version: 2, entries: {} }));
  writeLedger(home, { ...ledger, units: ledger.units.map(unit => unit.relative_path === "conf/sealed.json" ? { ...unit, state: "committed", error: null }
    : { ...unit, state: "restoring" }) });
  runHomeUpgrade(home);
  assert.equal(sha256(map), mapBefore);
  assert.equal(unitAt(home, "conf/sealed.json").error?.reason, "group_failed");
  assert.equal(versionOf(notes), 1);
});

test("UPG1-07: the real secrets file's reading is what an upgraded one has to pass", () => {
  assert.equal(SECRET_STORE_FILE.parse({ version: 1, backend: "aes-gcm-file", entries: { a: "b" } }).entries.a, "b");
  assert.throws(() => SECRET_STORE_FILE.parse({ version: 1, backend: "plain", entries: {} }), /backend/);
  assert.throws(() => SECRET_STORE_FILE.parse({ version: 2, backend: "aes-gcm-file", entries: {} }), /not supported/);
});

test("UPG1-06: the installer's own files: same steps, nothing left beside them, and a failure leaves the bytes as they were", async t => {
  await t.test("older: upgraded, and `config/` holds nothing a Home snapshot would refuse as unregistered", t => {
    const { home } = upgradeTestHome(t), file = place(home, "config/installation.json", { version: 1, name: "a" }, 0o644);
    assert.equal(upgradeVersionedFileInPlace(SETTINGS, file), true);
    assert.deepEqual(json(file), { version: 3, name: "a!", size: 2 });
    assert.equal(statSync(file).mode & 0o777, 0o644);
    assert.deepEqual(readdirSync(dirname(file)), ["installation.json"]);
    assert.equal(upgradeVersionedFileInPlace(SETTINGS, file), false, "and the second read has nothing to do");
  });
  await t.test("anything else is left for the reader to judge", t => {
    const { home } = upgradeTestHome(t);
    for (const [name, value] of [["newer.json", { version: 9 }], ["bad.json", "{"], ["current.json", { version: 3, name: "a", size: 1 }]] as const) {
      const file = place(home, name, value), before = sha256(file);
      assert.equal(upgradeVersionedFileInPlace(SETTINGS, file), false, name);
      assert.equal(sha256(file), before, name);
    }
    assert.equal(upgradeVersionedFileInPlace(SETTINGS, join(home, "none.json")), false);
  });
  await t.test("a failure", t => {
    const { home } = upgradeTestHome(t), file = place(home, "config/installation.json", { version: 1, name: "a" }), before = sha256(file);
    assert.throws(() => upgradeVersionedFileInPlace({ ...SETTINGS, upgrades: [SETTINGS.upgrades[0]!] }, file), { code: "storage.upgrade_failed" });
    assert.equal(sha256(file), before);
    assert.deepEqual(readdirSync(dirname(file)), ["installation.json"]);
  });
});
