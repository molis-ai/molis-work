import assert from "node:assert/strict";
import fs from "node:fs";
import { existsSync, lstatSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { createHomeSnapshot, prologueMemoryBackend, recoverHomeRestore, restoreHomeSnapshot } from "@molis-ai/molis-work-app-local-host";
import { inspectMolisWorkProjectCatalogSnapshot } from "@molis-ai/molis-work-app-desktop";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { MemoryService, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { acquireStorageOwner, acquireStorageOwnerForRecovery, backupSnapshotSqlite, HOME_RESTORE_JOURNAL, isSnapshotSqlite, openMemoryLedger } from "@molis-ai/molis-work-storage";
import { restoreCli, restoreFixture } from "./fixtures/home-restore.js";
import { currentMemoryOptions } from "./fixtures/current-memory.js";
import { homeBusinessTree, homeStorageTree } from "./fixtures/home-storage-files.js";

const caller: MemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "indexed-home", consumer: "ui", person: true,
  current_scene: "coding", purpose: "management" };

const originalState = (home: string) => Object.fromEntries(Object.entries(homeBusinessTree(home)).map(([path, value]) => {
  const node = lstatSync(join(home, path));
  return [path, { ...(node.isDirectory() ? { mode: value.mode } : value), ino: node.ino }];
}));

const ordinaryLibraries = ["memory/memory.db", "knowledge/knowledge.db"] as const;
const assertOrdinarySidecarsAbsent = (home: string) => {
  for (const file of ordinaryLibraries) for (const suffix of ["-wal", "-shm"])
    assert.equal(existsSync(join(home, file) + suffix), false);
};
/** Build a standalone initial state for these closed synthetic libraries before the full source fence; retain every row/schema and original mode. */
async function prepareStandaloneOrdinaryFixture(f: Awaited<ReturnType<typeof restoreFixture>>) {
  for (const [index, file] of ordinaryLibraries.entries()) {
    const source = join(f.home, file), prepared = join(f.directory, `standalone-ordinary-${index}.sqlite`);
    const backup = await backupSnapshotSqlite(source, prepared);
    fs.chmodSync(prepared, backup.mode);
    for (const suffix of ["-journal", "-wal", "-shm"]) rmSync(source + suffix, { force: true });
    fs.renameSync(prepared, source);
  }
}

async function open(home: string) {
  const root = join(home, "agent-runtime"), owner = acquireStorageOwner(root);
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: root, storageOwner: owner,
    memory: currentMemoryOptions({ appId: "io.molis.work", scopesFor: () => [{ scope: "user", owner: LOCAL_PERSON_ACTOR_ID }] }),
    modelConfiguration: async () => { throw new Error("Indexed Home maintenance cannot call a model"); } });
  const ledger = openMemoryLedger({ homeDirectory: home, storageOwner: owner });
  const service = new MemoryService({ ledger, backend: prologueMemoryBackend(async () => adapter.memory!) });
  return { service, close: async () => { ledger.close(); try { await adapter.close(); } finally { owner.release(); } } };
}

async function seed(home: string) {
  const env = await open(home);
  try {
    const saved = await env.service.write({ ...caller, operation_id: "indexed-formal" }, { scope: "personal", text: "Keep the formal indexed memory", kind: "preference" });
    const survivor = await env.service.write({ ...caller, operation_id: "indexed-survivor" }, { scope: "personal", text: "Keep a second independent formal memory", kind: "preference" });
    const proposed = await env.service.propose({ ...caller, operation_id: "indexed-candidate" }, { scope: "personal", text: "Keep the pending indexed candidate",
      kind: "preference", basis: "inferred", why: "An independent candidate", from: "gate" });
    assert.ok(saved.memory); assert.ok(survivor.memory); assert.ok(proposed.candidate_id);
    return { memory: saved.memory.memory_id, survivor: survivor.memory.memory_id, candidate: proposed.candidate_id };
  } finally { await env.close(); }
}

test("MEM-40: production indexed two-kind storage reopens and snapshots a standalone authenticated database", async t => {
  const f = await restoreFixture(t), ids = await seed(f.home), db = join(f.root, "records.sqlite");
  assert.equal(existsSync(db), true);
  assert.equal(existsSync(join(f.root, "records", "io.molis.work~memories")), false);
  assert.equal(existsSync(join(f.root, "records", "io.molis.work~memory-candidates")), false);
  const env = await open(f.home);
  const nativePrepare = DatabaseSync.prototype.prepare, observed: string[] = [];
  const reads = t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) {
    if (/SELECT id,envelope FROM records WHERE kind=\? AND id IN \(\?(?:,\?)+\)/u.test(sql)) observed.push(sql);
    return nativePrepare.call(this, sql);
  });
  try {
    const listed = (await env.service.list(caller)).items;
    assert.ok(listed.some(item => item.memory_id === ids.memory)); assert.ok(listed.some(item => item.memory_id === ids.survivor));
    assert.ok((await env.service.candidates(caller)).some(item => item.candidate_id === ids.candidate));
    assert.ok(observed.length > 0, "a multi-id canonical capture/refresh proves the production observation port, beyond single-record reads");
  } finally { reads.mock.restore(); await env.close(); }
  await prepareStandaloneOrdinaryFixture(f);
  const before = homeBusinessTree(f.home);
  assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created");
  assert.deepEqual(homeBusinessTree(f.home), before);
  const manifest = JSON.parse(readFileSync(join(f.snapshot, "manifest.json"), "utf8"));
  const entry = manifest.stores.flatMap((store: { entries: Array<{ path: string; payload_path?: string; sqlite?: unknown }> }) => store.entries)
    .find((one: { path: string }) => one.path === "agent-runtime/records.sqlite");
  assert.ok(entry?.sqlite); assert.equal(typeof entry.payload_path, "string");
  const archived = readFileSync(join(f.snapshot, entry.payload_path));
  assert.equal(archived[18], 1); assert.equal(archived[19], 1);
  for (const suffix of ["-journal", "-wal", "-shm"]) assert.equal(existsSync(join(f.snapshot, entry.payload_path + suffix)), false);
});

test("MEM-40: indexed snapshot rejects exact sidecars and WAL headers without changing any source material", async t => {
  const f = await restoreFixture(t); await seed(f.home);
  const db = join(f.root, "records.sqlite"), original = readFileSync(db);
  for (const suffix of ["-journal", "-wal", "-shm", "wal-header"]) await t.test(suffix, async () => {
    assertOrdinarySidecarsAbsent(f.home);
    if (suffix === "wal-header") { const wal = Buffer.from(original); wal[18] = 2; wal[19] = 2; writeFileSync(db, wal); }
    else writeFileSync(db + suffix, "opaque exact sidecar", { mode: 0o600 });
    const before = homeBusinessTree(f.home), files = readdirSync(f.root).sort();
    try {
      await assert.rejects(createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot }),
        suffix === "wal-header" ? { code: "host.home_snapshot.invalid" } : { code: "host.home_snapshot.unknown_data" });
      assert.deepEqual(homeBusinessTree(f.home), before); assert.deepEqual(readdirSync(f.root).sort(), files);
      assertOrdinarySidecarsAbsent(f.home);
      assert.equal(existsSync(f.snapshot), false);
    } finally {
      writeFileSync(db, original);
      if (suffix !== "wal-header") rmSync(db + suffix);
    }
  });
});

test("MEM-40: public standalone backup rechecks a source changed after file-only preflight", async t => {
  const f = await restoreFixture(t); await seed(f.home);
  const db = join(f.root, "records.sqlite"), destination = join(f.directory, "standalone-recheck.sqlite");
  assert.equal(isSnapshotSqlite(db, true), true);
  const wal = Buffer.from(readFileSync(db)); wal[18] = 2; wal[19] = 2; writeFileSync(db, wal);
  assertOrdinarySidecarsAbsent(f.home);
  const before = originalState(f.home);
  await assert.rejects(backupSnapshotSqlite(db, destination, { standalone: true }), { code: "actions.input_invalid" });
  assert.deepEqual(originalState(f.home), before); assert.equal(existsSync(destination), false);
  assertOrdinarySidecarsAbsent(f.home);
  for (const suffix of ["-journal", "-wal", "-shm"]) assert.equal(existsSync(db + suffix), false);
});

test("MEM-40-I2: snapshot close failure never publishes or changes its source and retains cleanup of the original read-only connection", async t => {
  const f = await restoreFixture(t); await seed(f.home);
  await prepareStandaloneOrdinaryFixture(f);
  const before = originalState(f.home), prepare = DatabaseSync.prototype.prepare, nativeClose = DatabaseSync.prototype.close;
  const inspected = new Set<DatabaseSync>(); let stagedFile: string | undefined;
  const observed = t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) {
    const statement = prepare.call(this, sql);
    if (sql === "SELECT DISTINCT kind FROM records ORDER BY kind") {
      const file = String(prepare.call(this, "PRAGMA database_list").all().find(row => row.name === "main")?.file);
      assert.equal(file.startsWith(f.home + "/"), false); assert.ok(file.endsWith("/data/agent-runtime/records.sqlite"));
      stagedFile = file; inspected.add(this);
    }
    return statement;
  });
  const faulty = t.mock.method(DatabaseSync.prototype, "close", function(this: DatabaseSync) {
    if (inspected.has(this)) throw new Error("injected before native close of the private snapshot copy");
    return nativeClose.call(this);
  });
  let failure: (Error & { close(): Promise<void> }) | undefined;
  try {
    try { await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot }); assert.fail("snapshot must not report success"); }
    catch (error) {
      assert.ok(error instanceof Error && "code" in error && error.code === "STORAGE_RECONCILE_REQUIRED");
      assert.equal(typeof Object.getOwnPropertyDescriptor(error, "close")?.value, "function");
      assert.equal(Object.getOwnPropertyDescriptor(error, "close")?.enumerable, false);
      failure = error as Error & { close(): Promise<void> };
    }
    assert.equal(inspected.size, 1); const connection = [...inspected][0]!; assert.equal(connection.isOpen, true);
    assert.equal(existsSync(f.snapshot), false); assert.ok(stagedFile); assert.equal(existsSync(stagedFile), false);
    assert.deepEqual(originalState(f.home), before);
    const owner = acquireStorageOwner(f.root); owner.release();
    faulty.mock.restore(); observed.mock.restore(); await failure.close(); await failure.close();
    assert.equal(connection.isOpen, false); assert.deepEqual(originalState(f.home), before);
  } finally {
    faulty.mock.restore(); observed.mock.restore();
    for (const connection of inspected) if (connection.isOpen) nativeClose.call(connection);
    await failure?.close();
  }
});

test("MEM-40: restore saves opaque indexed targets and resets only their exact sidecars before reopening both kinds", async t => {
  const f = await restoreFixture(t), ids = await seed(f.home);
  assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created");
  const archive = homeStorageTree(f.snapshot), db = join(f.root, "records.sqlite");
  writeFileSync(db, "opaque damaged target, never open this as an archive");
  for (const suffix of ["-journal", "-wal", "-shm"]) writeFileSync(db + suffix, "opaque original " + suffix, { mode: 0o600 });
  assert.equal((await restoreHomeSnapshot({ homeDirectory: f.home, source: f.snapshot, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot })).status, "restored");
  assert.deepEqual(homeStorageTree(f.snapshot), archive);
  for (const suffix of ["-journal", "-wal", "-shm"]) assert.equal(existsSync(db + suffix), false);
  const env = await open(f.home);
  try {
    assert.ok((await env.service.list(caller)).items.some(item => item.memory_id === ids.memory));
    assert.ok((await env.service.candidates(caller)).some(item => item.candidate_id === ids.candidate));
  } finally { await env.close(); }
});

test("MEM-40: registered Builder SDK material shares standalone guards and restores without extending main-root forgetting", async t => {
  const f = await restoreFixture(t), ids = await seed(f.home);
  const builderRoot = join(f.home, "plugin-builder", "project", "runs", "build"), db = join(builderRoot, "records.sqlite");
  const openBuilder = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: builderRoot,
    memory: currentMemoryOptions({ appId: "io.molis.work", scopesFor: () => [{ scope: "user", owner: LOCAL_PERSON_ACTOR_ID }] }),
    modelConfiguration: async () => { throw new Error("Builder material maintenance cannot call a model"); } });

  // Prepare nonempty material through the public adapter at the already-registered nested SDK root.
  // Matching the main selected text makes an accidental cross-root purge observable.
  const builder = await openBuilder(); let builderId: string;
  try {
    const saved = await builder.memory!.withCaller(caller).write({ scope: "user", owner: LOCAL_PERSON_ACTOR_ID,
      text: "Keep the formal indexed memory", origin: "test" });
    builderId = saved.memory_id;
    assert.equal((await builder.memory!.withCaller(caller).list("user", LOCAL_PERSON_ACTOR_ID))[0]?.memory_id, builderId);
  } finally { await builder.close(); }

  // Reject each malformed Builder source before any ordinary library capture, with no warmup.
  const original = readFileSync(db);
  for (const suffix of ["-journal", "-wal", "-shm", "wal-header"]) await t.test("unprepared source " + suffix, async () => {
    assertOrdinarySidecarsAbsent(f.home);
    if (suffix === "wal-header") { const wal = Buffer.from(original); wal[18] = 2; wal[19] = 2; writeFileSync(db, wal); }
    else writeFileSync(db + suffix, "opaque Builder source " + suffix, { mode: 0o600 });
    const before = originalState(f.home);
    try {
      await assert.rejects(createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot }),
        suffix === "wal-header" ? { code: "host.home_snapshot.invalid" } : { code: "host.home_snapshot.unknown_data" });
      assert.deepEqual(originalState(f.home), before); assertOrdinarySidecarsAbsent(f.home);
      assert.equal(existsSync(f.snapshot), false);
    } finally {
      if (suffix === "wal-header") writeFileSync(db, original);
      else rmSync(db + suffix);
    }
  });

  // Only the positive capture starts from explicitly constructed standalone ordinary fixture libraries.
  await prepareStandaloneOrdinaryFixture(f);
  const source = originalState(f.home);
  assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created");
  assert.deepEqual(originalState(f.home), source);
  const archive = homeStorageTree(f.snapshot), manifest = JSON.parse(readFileSync(join(f.snapshot, "manifest.json"), "utf8"));
  const archived = manifest.stores.flatMap((store: { entries: Array<{ path: string; payload_path?: string; sqlite?: unknown }> }) => store.entries)
    .find((entry: { path: string }) => entry.path === "plugin-builder/project/runs/build/records.sqlite");
  assert.ok(archived?.sqlite); assert.equal(typeof archived.payload_path, "string");
  const archivedBytes = readFileSync(join(f.snapshot, archived.payload_path));
  assert.equal(archivedBytes[18], 1); assert.equal(archivedBytes[19], 1);

  // Forget only the selected main-root item after capture; the unselected main item and Builder material remain eligible.
  const main = await open(f.home);
  try { await main.service.change({ ...caller, operation_id: "forget-main-before-builder-restore" }, { action: "remove", memory_id: ids.memory }); }
  finally { await main.close(); }
  const preserved = [f.root, builderRoot].map(root => ({ root, key: readFileSync(join(root, "storage.key")),
    keyIno: lstatSync(join(root, "storage.key")).ino, ownerIno: lstatSync(join(root, ".molis-runtime-owner.db")).ino }));
  const opaque = ["", "-journal", "-wal", "-shm"].map(suffix => {
    const path = db + suffix, bytes = Buffer.from("opaque Builder target " + (suffix || "database"));
    writeFileSync(path, bytes, { mode: 0o600 });
    const node = lstatSync(path);
    return { path, bytes, ino: node.ino, mode: node.mode & 0o777, mtime: node.mtimeMs };
  });

  // The real publisher saves opaque originals, replaces the database and resets just its three exact sidecars.
  const restored = await restoreHomeSnapshot({ homeDirectory: f.home, source: f.snapshot, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot });
  assert.equal(restored.status, "restored"); assert.ok(restored.originals_directory);
  const originalFiles = readdirSync(join(restored.originals_directory, "originals")).map(name => join(restored.originals_directory!, "originals", name))
    .filter(path => lstatSync(path).isFile());
  for (const expected of opaque) {
    const matches = originalFiles.filter(path => readFileSync(path).equals(expected.bytes));
    assert.equal(matches.length, 1, "each opaque original must be retained exactly once");
    const node = lstatSync(matches[0]!);
    assert.equal(node.ino, expected.ino); assert.equal(node.mode & 0o777, expected.mode); assert.equal(node.mtimeMs, expected.mtime);
  }
  for (const suffix of ["-journal", "-wal", "-shm"]) assert.equal(existsSync(db + suffix), false);
  for (const saved of preserved) {
    assert.deepEqual(readFileSync(join(saved.root, "storage.key")), saved.key);
    assert.equal(lstatSync(join(saved.root, "storage.key")).ino, saved.keyIno);
    assert.equal(lstatSync(join(saved.root, ".molis-runtime-owner.db")).ino, saved.ownerIno);
  }
  assert.deepEqual(homeStorageTree(f.snapshot), archive);

  // Reopen both actual roots through public consumers; main forgetting never grants Builder deletion rights.
  const reopenedBuilder = await openBuilder();
  try {
    const listed = await reopenedBuilder.memory!.withCaller(caller).list("user", LOCAL_PERSON_ACTOR_ID);
    assert.equal(listed.length, 1); assert.equal(listed[0]?.memory_id, builderId!);
    assert.equal(listed[0]?.text, "Keep the formal indexed memory");
  } finally { await reopenedBuilder.close(); }
  const reopenedMain = await open(f.home);
  try {
    const listed = (await reopenedMain.service.list(caller)).items;
    assert.equal(listed.some(item => item.memory_id === ids.memory), false);
    assert.ok(listed.some(item => item.memory_id === ids.survivor));
    assert.ok((await reopenedMain.service.candidates(caller)).some(item => item.candidate_id === ids.candidate));
  } finally { await reopenedMain.close(); }
  assert.deepEqual(homeStorageTree(f.snapshot), archive);
});

for (const phase of ["preflight-inventory", "preflight-read", "publishing-ready", "publishing-purge", "committed"] as const)
test(`MEM-40-I2: ${phase} keeps the original owner and cleanup capability until native close is confirmed`, async t => {
  const f = await restoreFixture(t), ids = await seed(f.home);
  await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot });
  const env = await open(f.home);
  try { await env.service.change({ ...caller, operation_id: "forget-after-snapshot" }, { action: "remove", memory_id: ids.memory }); }
  finally { await env.close(); }
  writeFileSync(join(f.home, "plugin-files", "original.bin"), "current material must survive failed restore");
  const marker = join(f.root, HOME_RESTORE_JOURNAL), options = { homeDirectory: f.home, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot };
  const restore = () => restoreHomeSnapshot({ ...options, source: f.snapshot });
  const before = originalState(f.home), archive = homeStorageTree(f.snapshot);
  if (phase === "committed") {
    const unlink = fs.unlinkSync, fault = t.mock.method(fs, "unlinkSync", (path: fs.PathLike) => {
      if (String(path) === marker) throw Object.assign(new Error("injected barrier clear failure"), { code: "EIO" });
      return unlink(path);
    });
    syncBuiltinESMExports();
    try { await assert.rejects(restore(), { code: "host.home_restore.published_unconfirmed" }); }
    finally { fault.mock.restore(); syncBuiltinESMExports(); }
    assert.equal(JSON.parse(readFileSync(marker, "utf8")).phase, "committed");
  }
  const nativeClose = DatabaseSync.prototype.close, prepare = DatabaseSync.prototype.prepare, exec = DatabaseSync.prototype.exec;
  const retained = new Set<DatabaseSync>(), committed = new WeakSet<DatabaseSync>(); let matches = 0;
  const file = (database: DatabaseSync) => String(prepare.call(database, "PRAGMA database_list").all().find(row => row.name === "main")?.file);
  const journal = () => existsSync(marker) ? JSON.parse(readFileSync(marker, "utf8")) : undefined;
  const commitFault = t.mock.method(DatabaseSync.prototype, "exec", function(this: DatabaseSync, sql: string) {
    const result = exec.call(this, sql);
    if (sql === "COMMIT" && file(this) === join(f.root, "records.sqlite") && journal()?.phase === "publishing") committed.add(this);
    return result;
  });
  // Only the SDK's own indexed connection: Molis's generic snapshot inspection opens the same file through the same node:sqlite class
  // since the driver change (#1979), and its close is not what this invariant is about.
  const fromSdk = () => /@prologue[\\/]sdk[\\/]dist[\\/]/u.test(new Error().stack ?? "");
  const closeFault = t.mock.method(DatabaseSync.prototype, "close", function(this: DatabaseSync) {
    const actual = file(this), current = journal();
    const target = fromSdk() && (phase.startsWith("preflight") ? actual === join(f.snapshot, "data", "agent-runtime", "records.sqlite")
      : actual === join(f.root, "records.sqlite") && current?.phase === (phase === "committed" ? "committed" : "publishing")
        && (phase !== "publishing-purge" || committed.has(this)));
    if (retained.has(this) || target && ++matches >= (phase === "preflight-read" ? 2 : 1)) {
      retained.add(this); throw new Error("injected before actual indexed native close");
    }
    return nativeClose.call(this);
  });
  let failure: (Error & { close(): Promise<void> }) | undefined;
  try {
    try { await (phase === "committed" ? recoverHomeRestore(options) : restore()); assert.fail("close failure must reject the original operation"); }
    catch (error) {
      assert.ok(error instanceof Error && "code" in error && error.code === "host.home_restore.recovery_required");
      assert.equal(typeof Object.getOwnPropertyDescriptor(error, "close")?.value, "function");
      assert.equal(Object.getOwnPropertyDescriptor(error, "close")?.enumerable, false);
      failure = error as Error & { close(): Promise<void> };
    }
    assert.equal(retained.size, 1); const connection = [...retained][0]!; assert.equal(connection.isOpen, true);
    const pending = originalState(f.home), current = journal();
    assert.equal(current?.phase, phase.startsWith("preflight") ? undefined : phase === "committed" ? "committed" : "publishing");
    if (!current) assert.deepEqual(pending, before);
    const originals = current ? homeStorageTree(current.originals_directory) : undefined;
    assert.throws(() => acquireStorageOwnerForRecovery(f.root), { code: "storage.owner.busy" });
    await assert.rejects(restore(), { code: "storage.owner.busy" });
    const external = await restoreCli(t, ["restore", "--home", f.home, "--recover", "--json"]);
    assert.equal(external.code, 1); assert.match(external.stderr, /storage\.owner\.busy/u);
    const closing = failure.close(); assert.equal(failure.close(), closing);
    await assert.rejects(closing, error => error === failure);
    assert.equal(connection.isOpen, true); assert.deepEqual(originalState(f.home), pending);
    if (current) assert.deepEqual(homeStorageTree(current.originals_directory), originals);
    closeFault.mock.restore(); commitFault.mock.restore();
    await failure.close(); await failure.close(); assert.equal(connection.isOpen, false);
    const available = acquireStorageOwnerForRecovery(f.root); available.release();
    assert.deepEqual(originalState(f.home), pending, "resource cleanup never performs rollback, clears a journal or resumes the operation");
    const recovered = await recoverHomeRestore(options);
    assert.equal(recovered.status, phase.startsWith("preflight") ? "no_recovery" : phase === "committed" ? "finished" : "rolled_back");
    if (phase.startsWith("publishing")) assert.deepEqual(originalState(f.home), before);
    assert.deepEqual(homeStorageTree(f.snapshot), archive);
    await restore();
    const final = await open(f.home);
    try {
      assert.equal((await final.service.list(caller)).items.some(item => item.memory_id === ids.memory), false);
      assert.ok((await final.service.candidates(caller)).some(item => item.candidate_id === ids.candidate));
    } finally { await final.close(); }
  } finally {
    closeFault.mock.restore(); commitFault.mock.restore();
    for (const connection of retained) if (connection.isOpen) nativeClose.call(connection);
    await failure?.close();
  }
});
