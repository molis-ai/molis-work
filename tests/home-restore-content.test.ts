import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createHomeSnapshot, restoreHomeSnapshot, MolisWorkLocalHost, LocalProjectDatabase, molisWorkHostProjectReference, type HomeSnapshotManifest } from "@molis-ai/molis-work-app-local-host";
import { inspectMolisWorkProjectCatalogSnapshot, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { ensureStorageSpace, personalStorageSpace, inspectMemoryLedger, openMemoryLedger } from "@molis-ai/molis-work-storage";
import { smallSnapshotHome } from "./fixtures/home-snapshot-small.js";
import { homeBusinessTree } from "./fixtures/home-storage-files.js";
import { populatedSnapshotHome, snapshotSdk, snapshotMemoryCaller } from "./fixtures/home-snapshot-fixture.js";
import { assertSnapshotFact } from "./fixtures/home-snapshot-facts.js";
import { managementGoals } from "./goal-management-caller.js";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { readPluginRuntimeRecords } from "@molis-ai/molis-work-plugin-runtime";
import { restoreCli, restoreFixture } from "./fixtures/home-restore.js";

test("RAC-2914: actual restore CLI replaces later facts, retains original keys/modes and supports real Host continuation", { timeout: 30_000 }, async t => {
  const f = await restoreFixture(t), source = readFileSync(join(f.home, "plugin-files", "original.bin")), key = randomBytes(32);
  writeFileSync(join(f.root, "storage.key"), key, { mode: 0o640 });
  const inode = lstatSync(join(f.root, ".molis-runtime-owner.db")).ino, root = lstatSync(f.root).ino;
  const captured = await restoreCli(t, ["snapshot", "--home", f.home, "--to", f.snapshot, "--json"]);
  assert.equal(captured.code, 0, captured.stderr);
  writeFileSync(join(f.home, "plugin-files", "original.bin"), "later changed facts");
  writeFileSync(join(f.home, "plugin-files", "later.bin"), "later independent fact");
  const result = await restoreCli(t, ["restore", "--home", f.home, "--from", f.snapshot, "--json"]);
  assert.equal(result.code, 0, result.stderr); assert.equal(JSON.parse(result.stdout).status, "restored");
  assert.deepEqual(readFileSync(join(f.home, "plugin-files", "original.bin")), source);
  assert.equal(lstatSync(join(f.home, "plugin-files", "original.bin")).mode & 0o777, 0o640);
  assert.equal(lstatSync(join(f.home, "plugin-files", "later.bin"), { throwIfNoEntry: false }), undefined);
  assert.deepEqual(readFileSync(join(f.root, "storage.key")), key); assert.equal(lstatSync(join(f.root, "storage.key")).mode & 0o777, 0o640);
  assert.equal(lstatSync(join(f.root, ".molis-runtime-owner.db")).ino, inode); assert.equal(lstatSync(f.root).ino, root);
  const repeated = await restoreCli(t, ["restore", "--home", f.home, "--from", f.snapshot, "--json"]);
  assert.equal(repeated.code, 0, repeated.stderr); assert.equal(JSON.parse(repeated.stdout).status, "unchanged");
  const host = new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null }); await host.close();
});

test("RAC-2913 RAC-2914: actual empty snapshot initializes reviewed Memory only through external staging and survives normal Host reopen", async t => {
  const f = await smallSnapshotHome(t);
  const snapshot = await restoreCli(t, ["snapshot", "--home", f.home, "--to", f.snapshot, "--json"]);
  assert.equal(snapshot.code, 0, snapshot.stderr);
  const manifest = JSON.parse(readFileSync(join(f.snapshot, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.source_inventory.find((node: { path: string }) => node.path === "").children, ["agent-runtime"]);
  assert.equal(inspectMemoryLedger({ homeDirectory: f.home, actorId: LOCAL_PERSON_ACTOR_ID }).state, "absent");
  const restored = await restoreCli(t, ["restore", "--home", f.home, "--from", f.snapshot, "--json"]);
  assert.equal(restored.code, 0, restored.stderr); assert.equal(JSON.parse(restored.stdout).status, "restored");
  const prefs = inspectMemoryLedger({ homeDirectory: f.home, actorId: LOCAL_PERSON_ACTOR_ID });
  assert.equal(prefs.state, "complete");
  if (prefs.state === "complete") { assert.equal(prefs.personal.auto, false); assert.equal(prefs.project_default.auto, false); }
  const host = new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null });
  try {
    const withCatalog = host.configurePersonalPlanning(f.home, withMolisWorkProjectCatalog);
    const project = await withCatalog({ homeDirectory: f.home }, catalog => catalog.createProject({ display_name: "Restored fresh Home", actor_id: LOCAL_PERSON_ACTOR_ID }));
    assert.equal(project.display_name, "Restored fresh Home");
  } finally { await host.close(); }
});

test("RAC-2913: actual bin/releases, nested excluded configuration, omitted logs and business data cannot masquerade as fresh Memory", async t => {
  for (const path of ["bin", "releases", "config/installation.json", "logs", "plugin-files"]) await t.test(path, async t => {
    const f = await smallSnapshotHome(t);
    if (path.endsWith(".json")) { mkdirSync(join(f.home, "config")); writeFileSync(join(f.home, path), "{}", { mode: 0o600 }); }
    else mkdirSync(join(f.home, path));
    await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot });
    const manifest = JSON.parse(readFileSync(join(f.snapshot, "manifest.json"), "utf8"));
    assert.notEqual(manifest.source_inventory.find((node: { path: string }) => node.path === path)?.kind, "absent");
    const before = homeBusinessTree(f.home);
    await assert.rejects(restoreHomeSnapshot({ homeDirectory: f.home, source: f.snapshot, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot }), { code: "host.home_restore.invalid" });
    assert.deepEqual(homeBusinessTree(f.home), before);
    assert.deepEqual(readdirSync(f.area).sort(), ["home", "snapshot"]);
  });
});

test("RAC-2913: missing source facts refuse absent Memory but do not disqualify a complete current Memory archive", async t => {
  for (const complete of [false, true]) await t.test(String(complete), async t => {
    const f = complete ? await restoreFixture(t) : await smallSnapshotHome(t);
    await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot });
    const file = join(f.snapshot, "manifest.json"), manifest = JSON.parse(readFileSync(file, "utf8"));
    delete manifest.source_inventory; writeFileSync(file, JSON.stringify(manifest));
    const restore = () => restoreHomeSnapshot({ homeDirectory: f.home, source: f.snapshot, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot });
    if (complete) {
      const prefs = inspectMemoryLedger({ homeDirectory: f.home, actorId: LOCAL_PERSON_ACTOR_ID });
      assert.equal((await restore()).status, "restored");
      assert.deepEqual(inspectMemoryLedger({ homeDirectory: f.home, actorId: LOCAL_PERSON_ACTOR_ID }), prefs);
      assert.equal((await restore()).status, "unchanged");
    }
    else { const before = homeBusinessTree(f.home); await assert.rejects(restore(), { code: "host.home_restore.invalid" }); assert.deepEqual(homeBusinessTree(f.home), before); }
  });
});

test("RAC-2914: the built CLI restores populated project/Memory/plugin facts and original credentials, then actual owners reopen them", { timeout: 90_000 }, async t => {
  const f = await populatedSnapshotHome(t), project = f.projects[0]!;
  const ledger = openMemoryLedger({ homeDirectory: f.home });
  let prefs;
  try {
    prefs = { ...ledger.prefs(LOCAL_PERSON_ACTOR_ID, "personal")!, auto: false, task_recall: false };
    ledger.savePrefs(LOCAL_PERSON_ACTOR_ID, "personal", prefs);
  } finally { ledger.close(); }
  const installed = () => {
    const db = new LocalProjectDatabase(project.database_path);
    try { return readPluginRuntimeRecords(db.db).map(record => ({ install_id: record.install_id, plugin_id: record.plugin_id, version: record.version, publisher_signature: record.publisher_signature })).sort((a, b) => a.install_id.localeCompare(b.install_id)); }
    finally { db.close(); }
  };
  const originalInstalls = installed(); assert.ok(originalInstalls.length);
  const receipt = join(f.home, "config", "web-service.json");
  writeFileSync(receipt, "original machine-owned receipt", { mode: 0o600 });
  const keys = new Map([join(f.home, "feed", "secrets.key"), join(f.sdkRoot, "storage.key"), join(f.builderRoot, "storage.key")].map(file => [file, readFileSync(file)]));
  const lock = join(f.sdkRoot, ".molis-runtime-owner.db"), inode = lstatSync(lock).ino;
  const captured = await restoreCli(t, ["snapshot", "--home", f.home, "--to", f.snapshot, "--json"]);
  assert.equal(captured.code, 0, captured.stderr);
  await withMolisWorkProjectCatalog({ homeDirectory: f.home }, catalog => catalog.renameProject(project.project_id, "Later changed project", LOCAL_PERSON_ACTOR_ID, project.display_name));
  const later = openMemoryLedger({ homeDirectory: f.home });
  try { later.savePrefs(LOCAL_PERSON_ACTOR_ID, "personal", { ...prefs, task_recall: true }); } finally { later.close(); }
  const receiptBytes = readFileSync(receipt);
  writeFileSync(receipt, "later machine-owned receipt");
  mkdirSync(join(f.home, "cache"), { recursive: true }); writeFileSync(join(f.home, "cache", "later"), "derived content");
  const restored = await restoreCli(t, ["restore", "--home", f.home, "--from", f.snapshot, "--json"]);
  assert.equal(restored.code, 0, restored.stderr); assert.equal(JSON.parse(restored.stdout).status, "restored");
  assert.notDeepEqual(readFileSync(receipt), receiptBytes); assert.equal(readFileSync(receipt, "utf8"), "later machine-owned receipt");
  assert.equal(lstatSync(join(f.home, "cache"), { throwIfNoEntry: false }), undefined);
  for (const [file, bytes] of keys) assert.deepEqual(readFileSync(file), bytes);
  assert.equal(lstatSync(lock).ino, inode); assert.deepEqual(installed(), originalInstalls);
  for (const fact of f.facts) assertSnapshotFact(join(f.home, fact.file), fact);
  const memory = inspectMemoryLedger({ homeDirectory: f.home, actorId: LOCAL_PERSON_ACTOR_ID });
  assert.equal(memory.state, "complete"); if (memory.state === "complete") assert.deepEqual(memory.personal, prefs);
  const host = new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null });
  try {
    const withCatalog = host.configurePersonalPlanning(f.home, withMolisWorkProjectCatalog);
    await withCatalog({ homeDirectory: f.home }, catalog => { assert.equal(catalog.getProject(project.project_id).display_name, project.display_name); });
    const snapshot = await managementGoals(host.actionClient(molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path })), project.project_id).invoke(goalsActions.snapshot, {});
    assert.ok(snapshot.goals.some(goal => goal.goal_id === "snapshot-goal"));
  } finally { await host.close(); }
  const sdk = snapshotSdk(f.sdkRoot, "snapshot-person");
  try { assert.ok((await (await sdk).memory!.withCaller(snapshotMemoryCaller("snapshot-person")).list("user", "snapshot-person")).some(memory => memory.memory_id === f.memoryId)); }
  finally { await sdk.close(); }
});

test("SSC-23 the default output directories are not in a Home snapshot, a symbolic link or a .sqlite file in them included, and a restore leaves them as they are", async t => {
  const f = await restoreFixture(t), output = join(f.home, "outputs", "project-kept");
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "notes.md"), "at capture");
  writeFileSync(join(output, "data.sqlite"), "not a database the snapshot opens");
  symlinkSync(f.directory, join(output, "outside"));
  assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created");
  const manifest = JSON.parse(readFileSync(join(f.snapshot, "manifest.json"), "utf8")) as HomeSnapshotManifest;
  assert.deepEqual(manifest.stores.find(store => store.path === "outputs")?.entries ?? [], []);
  assert.doesNotMatch(JSON.stringify(manifest), /notes\.md|data\.sqlite|project-kept/u);
  assert.equal(lstatSync(join(f.snapshot, "data", "outputs"), { throwIfNoEntry: false }), undefined);
  writeFileSync(join(output, "notes.md"), "after capture");
  assert.equal((await restoreHomeSnapshot({ homeDirectory: f.home, source: f.snapshot, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot })).status, "restored");
  assert.equal(readFileSync(join(output, "notes.md"), "utf8"), "after capture", "the restore did not touch the folder");
  assert.equal(readFileSync(join(output, "data.sqlite"), "utf8"), "not a database the snapshot opens");
  assert.equal(lstatSync(join(output, "outside")).isSymbolicLink(), true);
});

test("personal restore preserves device state and never exports other spaces or rebinds the same path to another account", async t => {
  const f = await restoreFixture(t), marker = join(f.home, "storage-space.json");
  const originalScope = readFileSync(marker);
  for (const path of ["spaces/another-account", "sync", "config"]) mkdirSync(join(f.home, path), { recursive: true });
  const preserved = ["spaces/another-account/secret-note", "sync/private-device-state", "config/native-session-token"];
  for (const path of preserved) writeFileSync(join(f.home, path), "at capture", { mode: 0o600 });
  await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot });
  const manifest = readFileSync(join(f.snapshot, "manifest.json"), "utf8");
  assert.doesNotMatch(manifest, /another-account|secret-note|private-device-state|at capture/);
  for (const path of preserved) {
    assert.equal(lstatSync(join(f.snapshot, "data", path), { throwIfNoEntry: false }), undefined);
    writeFileSync(join(f.home, path), "current device");
  }
  writeFileSync(join(f.home, "plugin-files/original.bin"), "later fact");
  const restore = () => restoreHomeSnapshot({ homeDirectory: f.home, source: f.snapshot, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot });
  rmSync(marker);
  ensureStorageSpace(f.home, personalStorageSpace("test-issuer", "test-app", "other-account"));
  await assert.rejects(restore(), { code: "host.home_restore.invalid" });
  assert.equal(readFileSync(join(f.home, "plugin-files/original.bin"), "utf8"), "later fact");
  writeFileSync(marker, originalScope, { mode: 0o600 });
  assert.equal((await restore()).status, "restored");
  for (const path of preserved) assert.equal(readFileSync(join(f.home, path), "utf8"), "current device");
  assert.deepEqual(readFileSync(marker), originalScope);
});
