import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";
import { createHomeSnapshot, openPartitionPluginLibrary, partitionPluginScope, recoverHomeRestore, type HomeSnapshotManifest } from "@molis-ai/molis-work-app-local-host";
import { inspectMolisWorkProjectCatalogSnapshot, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { installIdentity } from "@molis-ai/molis-work-plugin-runtime";
import { todoManifest } from "@molis-ai/molis-work-plugin-todo";
import { acquireStorageOwner, HOME_RESTORE_JOURNAL, initializeMemoryForgetting } from "@molis-ai/molis-work-storage";
import { restoreCli, restoreFixture } from "./fixtures/home-restore.js";
import { inspectMemoryLedger } from "@molis-ai/molis-work-storage";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { smallSnapshotHome } from "./fixtures/home-snapshot-small.js";
import { homeBusinessTree, homeStorageTree } from "./fixtures/home-storage-files.js";

function directoryIdentity(path: string) {
  const info = lstatSync(path); assert.equal(info.isDirectory(), true);
  return { kind: "directory", dev: info.dev, ino: info.ino, mode: info.mode & 0o777, size: info.size, mtime_ms: info.mtimeMs, ctime_ms: info.ctimeMs };
}

test("S-12 RAC-2915 RAC-2918 RAC-2917: recovery refuses foreign or unsafe journal authority without writes; a prepared empty control rolls back", { timeout: 30_000 }, async t => {
  const f = await smallSnapshotHome(t), runtime = join(f.home, "agent-runtime"), owner = acquireStorageOwner(runtime); owner.release();
  await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot });
  const manifest: HomeSnapshotManifest = JSON.parse(readFileSync(join(f.snapshot, "manifest.json"), "utf8"));
  const homeIdentity = directoryIdentity(f.home), runtimeIdentity = directoryIdentity(runtime), operation = randomUUID();
  const work = join(f.area, `.molis-home-restore-${homeIdentity.dev}-${homeIdentity.ino}-${operation}`);
  mkdirSync(work, { mode: 0o700 }); mkdirSync(join(work, "originals"), { mode: 0o700 }); mkdirSync(join(work, "failed"), { mode: 0o700 });
  const base = { schema_version: 1, space_digest: manifest.space_digest, product_version: manifest.product_version, home_directory: f.home, operation_id: operation,
    originals_directory: work, phase: "prepared", home_identity: homeIdentity, runtime_identity: runtimeIdentity,
    work_identity: directoryIdentity(work), home_mode: homeIdentity.mode, originals: [], files: [], preserved: [], dependencies: [],
    directories: [{ path: "agent-runtime", mode: runtimeIdentity.mode, original: runtimeIdentity }] };
  const marker = join(runtime, HOME_RESTORE_JOURNAL), outside = join(f.area, "outside-original.txt");
  writeFileSync(outside, "outside Home remains untouched", { mode: 0o640 });
  const recover = () => recoverHomeRestore({ homeDirectory: f.home, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot });
  const incoming = (path: string) => ({ path, mode: 0o600, size: 1, sha256: "0".repeat(64) });
  const mutations: Array<[string, (input: typeof base) => void]> = [
    // The unified version start (#1837) made 1 the only journal version; there is no older one, so below and above it are both refused.
    ["journal version below the first", value => { value.schema_version = 0; }],
    ["future journal version", value => { value.schema_version = 2; }],
    ["another Home", value => { value.home_directory = f.area; }],
    ["foreign originals directory", value => { value.originals_directory = f.area; }],
    ["different operation directory", value => { value.operation_id = randomUUID(); }],
    ["replaced Home inode", value => { value.home_identity.ino += 1; }],
    ["replaced runtime inode", value => { value.runtime_identity.ino += 1; }],
    ["replaced originals inode", value => { value.work_identity.ino += 1; }],
    ["nonprivate originals declaration", value => { value.work_identity.mode = 0o755; }],
    ["unknown phase", value => { value.phase = "unknown-phase"; }],
    ["extra authority field", value => { Object.assign(value, { allow_fresh: true }); }],
    ["extra directory field", value => { Object.assign(value.directories[0], { kind: "directory" }); }],
    ["parent path escape", value => { Object.assign(value, { files: [incoming("../outside-original.txt")] }); }],
    ["original key replacement", value => { Object.assign(value, { files: [incoming("agent-runtime/storage.key")] }); }],
    ["ownership inode replacement", value => { Object.assign(value, { files: [incoming("agent-runtime/.molis-runtime-owner.db")] }); }],
    ["moving the held runtime parent", value => { Object.assign(value, { originals: [{ path: "agent-runtime", identity: runtimeIdentity }] }); }],
    ["unregistered business root", value => { Object.assign(value, { directories: [...value.directories, { path: "not-registered", mode: 0o700 }], files: [incoming("not-registered/file")] }); }],
  ];
  for (const [name, mutate] of mutations) await t.test(name, async () => {
    const input: typeof base = structuredClone(base); mutate(input);
    writeFileSync(marker, JSON.stringify(input), { mode: 0o600 });
    const before = homeBusinessTree(f.home), materials = homeStorageTree(work), area = readdirSync(f.area).sort();
    await assert.rejects(recover(), { code: "host.home_restore.invalid" });
    assert.equal(isDeepStrictEqual(homeBusinessTree(f.home), before), true, "rejected journal cannot change business state or clear its barrier");
    assert.deepEqual(homeStorageTree(work), materials, "rejected authority cannot move originals or failed material");
    assert.deepEqual(readdirSync(f.area).sort(), area); assert.equal(readFileSync(outside, "utf8"), "outside Home remains untouched");
  });
  await t.test("actual originals directory is no longer private", async () => {
    writeFileSync(marker, JSON.stringify(base), { mode: 0o600 }); chmodSync(work, 0o755);
    const before = homeBusinessTree(f.home), materials = homeStorageTree(work);
    try {
      await assert.rejects(recover(), { code: "host.home_restore.invalid" });
      assert.equal(isDeepStrictEqual(homeBusinessTree(f.home), before), true); assert.deepEqual(homeStorageTree(work), materials);
    } finally { chmodSync(work, 0o700); }
  });
  await t.test("valid prepared empty operation can roll back without a Memory adoption bypass", async () => {
    // This is only an aborted operation before any business write, not successful snapshot restoration.
    writeFileSync(marker, JSON.stringify(base), { mode: 0o600 });
    const before = homeBusinessTree(f.home); delete before["agent-runtime/" + HOME_RESTORE_JOURNAL];
    const result = await recover();
    assert.equal(result.status, "rolled_back"); assert.equal(result.originals_directory, work);
    assert.equal(isDeepStrictEqual(homeBusinessTree(f.home), before), true);
    assert.equal((await recover()).status, "no_recovery");
    assert.equal(readFileSync(outside, "utf8"), "outside Home remains untouched");
  });
});

/** A business directory and child with non-default sample modes, set exactly so the result does not depend on umask (BL-tests-umask). */
function archivedChild(missing: string) {
  mkdirSync(missing); chmodSync(missing, 0o750);
  writeFileSync(join(missing, "archived.bin"), "archived child"); chmodSync(join(missing, "archived.bin"), 0o640);
}

/** Rollback restores the actual original inodes and file metadata; directory mtime records the real remove/rename operations. */
function retainedOriginalState(home: string) {
  return Object.fromEntries(Object.entries(homeBusinessTree(home)).map(([path, value]) => {
    const stat = lstatSync(join(home, path));
    return [path, { ...(stat.isDirectory() ? { mode: value.mode } : value), ino: stat.ino }];
  }));
}

async function faultRestore(t: import("node:test").TestContext, home: string, archive: string, fault: string) {
  const child = spawn(process.execPath, [fileURLToPath(new URL("./fixtures/home-restore-fault.mjs", import.meta.url)), home, archive, fault], { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  const ended = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject); child.once("close", (code, signal) => resolve({ code, signal }));
  });
  const stop = () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); };
  t.signal.addEventListener("abort", stop, { once: true });
  t.after(async () => { stop(); await ended; t.signal.removeEventListener("abort", stop); });
  return { ...await ended, stdout, stderr };
}

test("RAC-2916: a real file publication failure rolls back original business bytes, retains originals and releases the same owner", async t => {
  const f = await restoreFixture(t);
  const missing = join(f.home, "plugin-files", "missing");
  archivedChild(missing);
  await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot });
  rmSync(missing, { recursive: true });
  writeFileSync(join(f.home, "plugin-files", "original.bin"), "later state retained on failed restore");
  const before = retainedOriginalState(f.home);
  const result = await faultRestore(t, f.home, f.snapshot, "write-failure");
  assert.equal(result.code, 1, result.stderr); assert.match(result.stderr, /host\.home_restore\.rolled_back/u);
  assert.deepEqual(retainedOriginalState(f.home), before);
  assert.ok(readdirSync(f.directory).some(name => name.startsWith(".molis-home-restore-")));
  const recovered = await restoreCli(t, ["restore", "--home", f.home, "--recover", "--json"]);
  assert.equal(recovered.code, 0, recovered.stderr); assert.equal(JSON.parse(recovered.stdout).status, "no_recovery");
});

test("RAC-2916 RAC-2917: real prepared/partial/committed interruption and clear failure resume the same journal without default regeneration", async t => {
  for (const fault of ["prepared-kill", "partial-kill", "committed-kill", "clear-failure"]) await t.test(fault, async t => {
    const f = await restoreFixture(t);
    const missing = join(f.home, "plugin-files", "missing");
    archivedChild(missing);
    await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot });
    rmSync(missing, { recursive: true });
    const original = readFileSync(join(f.home, "plugin-files", "original.bin"));
    const memory = inspectMemoryLedger({ homeDirectory: f.home, actorId: LOCAL_PERSON_ACTOR_ID });
    writeFileSync(join(f.home, "plugin-files", "original.bin"), "later nonempty original");
    const before = retainedOriginalState(f.home), marker = join(f.root, HOME_RESTORE_JOURNAL);
    const result = await faultRestore(t, f.home, f.snapshot, fault);
    if (fault.endsWith("kill")) assert.equal(result.signal, "SIGKILL", result.stderr);
    else { assert.equal(result.code, 1); assert.match(result.stderr, /host\.home_restore\.published_unconfirmed/u); }
    const journal = JSON.parse(readFileSync(marker, "utf8"));
    assert.equal(journal.phase, fault === "prepared-kill" ? "prepared" : fault === "partial-kill" ? "publishing" : "committed");
    assert.ok(journal.files.some((file: { path: string }) => file.path === "memory/memory.db"));
    const recovered = await restoreCli(t, ["restore", "--home", f.home, "--recover", "--json"]);
    assert.equal(recovered.code, 0, recovered.stderr);
    const committed = journal.phase === "committed";
    assert.equal(JSON.parse(recovered.stdout).status, committed ? "finished" : "rolled_back");
    if (committed) {
      assert.deepEqual(readFileSync(join(f.home, "plugin-files", "original.bin")), original);
      assert.equal(readFileSync(join(missing, "archived.bin"), "utf8"), "archived child");
      assert.equal(lstatSync(missing).mode & 0o777, 0o750);
      assert.equal(lstatSync(join(missing, "archived.bin")).mode & 0o777, 0o640);
      assert.deepEqual(inspectMemoryLedger({ homeDirectory: f.home, actorId: LOCAL_PERSON_ACTOR_ID }), memory);
    }
    else assert.deepEqual(retainedOriginalState(f.home), before);
    assert.equal(lstatSync(marker, { throwIfNoEntry: false }), undefined);
    const after = retainedOriginalState(f.home), again = await restoreCli(t, ["restore", "--home", f.home, "--recover", "--json"]);
    assert.equal(again.code, 0, again.stderr); assert.equal(JSON.parse(again.stdout).status, "no_recovery"); assert.deepEqual(retainedOriginalState(f.home), after);
  });
});

test("RAC-2916: failed rollback retains the actual original nodes and pending barrier until explicit recovery succeeds", async t => {
  const f = await restoreFixture(t);
  await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot });
  const later = "later state must survive rollback retry";
  writeFileSync(join(f.home, "plugin-files", "original.bin"), later);
  const result = await faultRestore(t, f.home, f.snapshot, "rollback-failure");
  assert.equal(result.code, 1); assert.match(result.stderr, /host\.home_restore\.recovery_required/u);
  const marker = join(f.root, HOME_RESTORE_JOURNAL), journal = JSON.parse(readFileSync(marker, "utf8"));
  assert.equal(journal.phase, "publishing"); assert.ok(readdirSync(join(journal.originals_directory, "originals")).length);
  const recovered = await restoreCli(t, ["restore", "--home", f.home, "--recover", "--json"]);
  assert.equal(recovered.code, 0, recovered.stderr); assert.equal(JSON.parse(recovered.stdout).status, "rolled_back");
  assert.equal(readFileSync(join(f.home, "plugin-files", "original.bin"), "utf8"), later);
  assert.equal(lstatSync(marker, { throwIfNoEntry: false }), undefined);
});

test("RAC-2913 RAC-2916: an interrupted generated Memory node is in the same journal and rolls back to the nonempty original target", async t => {
  const f = await smallSnapshotHome(t);
  await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot });
  // Current initialization persists independent forgetting facts before creating the ledger; retain that legal interrupted state.
  const owner = acquireStorageOwner(join(f.home, "agent-runtime"));
  try { initializeMemoryForgetting({ homeDirectory: f.home, storageOwner: owner, assertCurrent() {} }); }
  finally { owner.release(); }
  assert.equal(inspectMemoryLedger({ homeDirectory: f.home, actorId: LOCAL_PERSON_ACTOR_ID }).state, "absent");
  mkdirSync(join(f.home, "plugin-files")); writeFileSync(join(f.home, "plugin-files", "original.bin"), "later target content");
  const before = retainedOriginalState(f.home), result = await faultRestore(t, f.home, f.snapshot, "partial-kill");
  assert.equal(result.signal, "SIGKILL", result.stderr);
  const journal = JSON.parse(readFileSync(join(f.home, "agent-runtime", HOME_RESTORE_JOURNAL), "utf8"));
  assert.ok(journal.files.some((file: { path: string }) => file.path === "memory/memory.db"));
  const recovered = await restoreCli(t, ["restore", "--home", f.home, "--recover", "--json"]);
  assert.equal(recovered.code, 0, recovered.stderr); assert.equal(JSON.parse(recovered.stdout).status, "rolled_back");
  assert.deepEqual(retainedOriginalState(f.home), before);
  assert.equal(inspectMemoryLedger({ homeDirectory: f.home, actorId: LOCAL_PERSON_ACTOR_ID }).state, "absent");
});

test("RAC-2917: changed committed preferences remain untouched with their barrier and originals retained", async t => {
  const f = await restoreFixture(t);
  await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot });
  writeFileSync(join(f.home, "plugin-files", "original.bin"), "force actual publication");
  const result = await faultRestore(t, f.home, f.snapshot, "clear-failure");
  assert.equal(result.code, 1); assert.match(result.stderr, /published_unconfirmed/u);
  const marker = join(f.root, HOME_RESTORE_JOURNAL), markerBytes = readFileSync(marker);
  const current = inspectMemoryLedger({ homeDirectory: f.home, actorId: LOCAL_PERSON_ACTOR_ID });
  assert.equal(current.state, "complete"); assert.ok(current.state === "complete");
  const changed = { ...current.personal, task_recall: !current.personal.task_recall };
  const { DatabaseSync } = await import("node:sqlite"), db = new DatabaseSync(join(f.home, "memory", "memory.db"));
  try { db.prepare("UPDATE memory_prefs SET body=? WHERE actor_id=? AND key=?").run(JSON.stringify(changed), LOCAL_PERSON_ACTOR_ID, "personal"); }
  finally { db.close(); }
  const before = homeBusinessTree(f.home), recovery = await restoreCli(t, ["restore", "--home", f.home, "--recover", "--json"]);
  assert.equal(recovery.code, 1); assert.match(recovery.stderr, /host\.home_restore\.changed/u);
  assert.deepEqual(homeBusinessTree(f.home), before); assert.deepEqual(readFileSync(marker), markerBytes);
  const after = inspectMemoryLedger({ homeDirectory: f.home, actorId: LOCAL_PERSON_ACTOR_ID });
  assert.ok(after.state === "complete"); assert.deepEqual(after.personal, changed);
});

test("S-12 AP-05 committed restore recovery rejects orphan partition libraries and project databases missing projects/catalog.db", { timeout: 60_000 }, async t => {
  const f = await restoreFixture(t);
  const project = await withMolisWorkProjectCatalog({ homeDirectory: f.home }, async catalog => {
    const created = await catalog.createProject({ display_name: "恢复项目", actor_id: LOCAL_PERSON_ACTOR_ID });
    catalog.addProjectPlugin({ project_id: created.project_id, plugin_id: "todo", actor_id: LOCAL_PERSON_ACTOR_ID });
    return created;
  });
  const todoLib = openPartitionPluginLibrary(
    partitionPluginScope(f.home, project.project_id, todoManifest.plugin_id, installIdentity(todoManifest)),
    f.home,
    todoManifest.databases!.partition!,
  );
  todoLib.close();
  await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot });
  writeFileSync(join(f.home, "plugin-files", "original.bin"), "force actual publication");
  const fault = await faultRestore(t, f.home, f.snapshot, "clear-failure");
  assert.equal(fault.code, 1);
  assert.match(fault.stderr, /published_unconfirmed/u);

  const marker = join(f.root, HOME_RESTORE_JOURNAL);
  const committed = JSON.parse(readFileSync(marker, "utf8")) as {
    phase: string;
    directories: Array<{ path: string; mode: number; original?: unknown }>;
    files: Array<{ path: string; mode: number; size: number; sha256: string; sqlite?: unknown }>;
  };
  assert.equal(committed.phase, "committed");
  const todoPath = `projects/${project.project_id}/libraries/todo.db`;
  const todoEntry = committed.files.find(file => file.path === todoPath);
  assert.ok(todoEntry, "committed journal includes the project's partition library");

  // 1. Orphan partition library not listed in projects/catalog.db must be refused.
  const orphanDir = join(f.home, "projects", "orphan-proj");
  const orphanLibraries = join(orphanDir, "libraries");
  const orphanFile = join(orphanLibraries, "todo.db");
  mkdirSync(orphanDir, { mode: 0o700 });
  chmodSync(orphanDir, 0o700);
  mkdirSync(orphanLibraries, { mode: 0o700 });
  chmodSync(orphanLibraries, 0o700);
  copyFileSync(join(f.home, todoPath), orphanFile);
  chmodSync(orphanFile, todoEntry.mode);
  const withOrphan = structuredClone(committed);
  withOrphan.directories.push({ path: "projects/orphan-proj", mode: 0o700 }, { path: "projects/orphan-proj/libraries", mode: 0o700 });
  withOrphan.files.push({ ...todoEntry, path: "projects/orphan-proj/libraries/todo.db" });
  writeFileSync(marker, JSON.stringify(withOrphan), { mode: 0o600 });
  await assert.rejects(
    recoverHomeRestore({ homeDirectory: f.home, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot }),
    { code: "host.home_restore.changed" },
    "committed recovery refuses partition library whose partition is absent from projects/catalog.db",
  );
  rmSync(orphanDir, { recursive: true, force: true });

  // 2. Project DB / partition library without projects/catalog.db must be refused.
  const withoutCatalog = structuredClone(committed);
  withoutCatalog.files = withoutCatalog.files.filter(file => file.path !== "projects/catalog.db");
  writeFileSync(marker, JSON.stringify(withoutCatalog), { mode: 0o600 });
  await assert.rejects(
    recoverHomeRestore({ homeDirectory: f.home, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot }),
    { code: "host.home_restore.changed" },
    "committed recovery refuses project databases and partition libraries when projects/catalog.db is absent",
  );

  // Restore the original committed journal so clean recovery still succeeds.
  writeFileSync(marker, JSON.stringify(committed), { mode: 0o600 });
  const finished = await recoverHomeRestore({ homeDirectory: f.home, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot });
  assert.equal(finished.status, "finished");
});
