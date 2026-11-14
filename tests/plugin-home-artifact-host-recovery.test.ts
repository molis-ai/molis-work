import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { acquireUpgradedHomeOwner, createHomeSnapshot, homeUpgradeDescriptors, LocalProjectDatabase, molisWorkHostProjectReference, MolisWorkLocalHost, PLATFORM_PLUGIN_REGISTRATIONS, pluginSyncNamespace, restoreHomeSnapshot, runHomeUpgrade, runV1Cli, upgradeFingerprint } from "@molis-ai/molis-work-app-local-host";
import { inspectMolisWorkProjectCatalogSnapshot, openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import { DATASET_DATABASE, datasetActions } from "@molis-ai/molis-work-plugin-dataset";
import { formManifest } from "@molis-ai/molis-work-plugin-form";
import type { FormRecord } from "@molis-ai/molis-work-plugin-form/contract";
import { isLocalHostHttpError } from "@molis-ai/molis-work-test-kit/local-host-http";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { bindDatabaseSpace, ensureStorageSpace, homeSqlitePath, openSqliteConnection, sqliteErrorName } from "@molis-ai/molis-work-storage";
import { smallSnapshotHome } from "./fixtures/home-snapshot-small.js";
import { ADD_TAG, BASELINE_V2, homeIdentityOf, ledgerFile, ledgerOf, notesDescriptor, raiseProjectBaseline, REAL_PROJECT_VERSION, relativeStore, seedStore, stampFile, useDescriptors, versionOf, writeLedger } from "./fixtures/home-upgrade-home.js";
import { registerProbe } from "./fixtures/plugin-home-artifact-probe.js";
import { runRollbackPair } from "./fixtures/plugin-home-rollback-pair.js";
import { openTestHome, serveTestHost } from "./fixtures/test-home.js";

/** The Host reads its real registry; this fixture enables the candidate declaration without changing any shipped action. */
function optInCandidate(t: TestContext): void {
  const entries = PLATFORM_PLUGIN_REGISTRATIONS as PluginRegistration[];
  const index = entries.findIndex(entry => entry.project_plugin_id === "dataset"), original = entries[index]!;
  const { manifest } = original, home = manifest.databases!.home!;
  entries[index] = { ...original, manifest: { ...manifest, databases: { ...manifest.databases, home: { ...home,
    project_rows: { ...home.project_rows!, artifact_join: { table: "datasets", id_column: "id", version_column: "version",
      artifact_id_column: "artifact_id", artifact_version_column: "artifact_version", write_columns: ["updated_at"], pending_column: "publication_pending_json" } },
  } } } };
  t.after(() => { entries[index] = original; });
}

async function interruptProjectWrite(t: TestContext, file: string, mode = "host"): Promise<void> {
  const entry = fileURLToPath(new URL("./fixtures/plugin-home-rollback-child.mjs", import.meta.url));
  const child = spawn(process.execPath, [entry, file, "2", "owner", mode], { stdio: ["ignore", "pipe", "inherit"] });
  const exited = once(child, "exit");
  try {
    const ready = once(child.stdout, "data", { signal: t.signal }).then(args => String(args[0]));
    assert.match(await Promise.race([ready, exited.then(() => "early exit")]), /^staged/u);
    assert.ok(child.kill("SIGKILL"));
    assert.equal((await exited)[1], "SIGKILL");
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await exited;
  }
}

test("BSH-03 · the real Home owner recovers before its upgrade stamp and offline backup or restore refuses unresolved sidecars", { timeout: 30_000 }, async t => {
  const f = await smallSnapshotHome(t);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: f.home });
  const project = await catalog.createProject({ display_name: "Recovery fixture", actor_id: "fixture" });
  catalog.close();
  runHomeUpgrade(f.home);
  const stampPath = join(f.home, "upgrade", "state.json"), stamp = readFileSync(stampPath);
  const clean = join(f.area, "before-interruption");
  assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: clean })).status, "created");
  optInCandidate(t);

  const file = project.database_path, journal = file + "-journal";
  await interruptProjectWrite(t, file);
  const original = readFileSync(file), child = readFileSync(journal);
  assert.equal(child[0], 0xd9);
  await assert.rejects(createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot }), { code: "host.home_snapshot.changed" });
  assert.equal(existsSync(f.snapshot), false);

  const catalogPath = join(f.home, "projects", "catalog.db"), catalogBytes = readFileSync(catalogPath);
  writeFileSync(catalogPath, "opaque destination");
  await assert.rejects(restoreHomeSnapshot({ homeDirectory: f.home, source: clean, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot }), { code: "actions.conflict" });
  assert.equal(readFileSync(catalogPath, "utf8"), "opaque destination");
  writeFileSync(catalogPath, catalogBytes);
  assert.deepEqual(readFileSync(file), original);
  assert.deepEqual(readFileSync(journal), child);
  assert.deepEqual(readFileSync(stampPath), stamp);

  acquireUpgradedHomeOwner(f.home).release();
  assert.equal(existsSync(journal), false);
  assert.deepEqual(readFileSync(stampPath), stamp, "the same valid stamp was used only after native recovery");
  const db = openSqliteConnection(file, { fileMustExist: true, readonly: true });
  try { assert.equal(db.prepare("SELECT event_id FROM events WHERE event_id='n12-uncommitted'").get(), undefined); }
  finally { db.close(); }
  assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created");
  const writer = openSqliteConnection(file, { fileMustExist: true });
  try {
    writer.exec("PRAGMA synchronous=EXTRA");
    writer.prepare(`INSERT INTO events (event_id, project_id, actor_id, type, object_type, object_id, reason, payload_json, at)
      VALUES ('n12-after-snapshot', ?, 'fixture', 'test.write', 'test', 'n12', 'fixture', '{}', '2026-11-09T00:00:00Z')`).run(project.project_id);
  } finally { writer.close(); }
  assert.equal((await restoreHomeSnapshot({ homeDirectory: f.home, source: f.snapshot, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot })).status, "restored");
  const restored = openSqliteConnection(file, { fileMustExist: true, readonly: true });
  try { assert.equal(restored.prepare("SELECT event_id FROM events WHERE event_id LIKE 'n12-%'").get(), undefined); }
  finally { restored.close(); }
});

test("BSH-01 · the real owner refuses a nonzero pending library before starting U1", async t => {
  const f = await smallSnapshotHome(t);
  const space = ensureStorageSpace(f.home), file = homeSqlitePath(f.home, DATASET_DATABASE.store_name);
  mkdirSync(dirname(file));
  const db = openSqliteConnection(file);
  try {
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA user_version=${DATASET_DATABASE.version}; ${DATASET_DATABASE.schema}`);
    bindDatabaseSpace(db, space);
    db.prepare(`INSERT INTO datasets (id, project_id, title, description, status, columns_json, rows_json, created_at, updated_at, version, publication_pending_json)
      VALUES ('awaiting-author', '', 'Pending pin', '', 'draft', '[]', '[]', ?, ?, 2, '{"version":1}')`).run("2026-11-09", "2026-11-09");
  } finally { db.close(); }
  const before = readFileSync(file);
  const stamp = await f.file("upgrade/state.json", "deliberately invalid U1 state");
  optInCandidate(t);
  const refusal = { code: "actions.conflict", details: { library: "dataset", pending_ids: ["awaiting-author"] } };
  assert.throws(() => acquireUpgradedHomeOwner(f.home), refusal);
  assert.throws(() => runHomeUpgrade(f.home), refusal);
  assert.equal(readFileSync(stamp, "utf8"), "deliberately invalid U1 state");
  assert.deepEqual(readFileSync(file), before);
  const external = join(f.area, "outside-shm"), sentinel = Buffer.alloc(32_768, 0x51);
  writeFileSync(external, sentinel);
  linkSync(external, file + "-shm");
  assert.throws(() => runHomeUpgrade(f.home), { code: "actions.input_invalid" });
  assert.deepEqual(readFileSync(external), sentinel);
});

test("BSH-03 · a registered project recovers the WAL mode change; staging stays in WAL and linked SQLite files are refused", { timeout: 20_000 }, async t => {
  const f = await smallSnapshotHome(t);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: f.home });
  const selected = await catalog.createProject({ display_name: "Mode recovery fixture", actor_id: "fixture" });
  catalog.close();
  optInCandidate(t);
  const file = selected.database_path, journal = file + "-journal";
  await interruptProjectWrite(t, file, "wal-transition");
  assert.deepEqual([...readFileSync(file).subarray(18, 20)], [2, 2]);
  assert.equal(existsSync(file + "-wal"), false);
  assert.equal(existsSync(file + "-shm"), false);
  assert.equal(readFileSync(journal)[0], 0);

  const owner = acquireUpgradedHomeOwner(f.home);
  try {
    assert.equal(existsSync(journal), false);
    assert.deepEqual([...readFileSync(file).subarray(18, 20)], [2, 2], "native replay returned to the prior mode");
    const external = join(f.area, "outside-file"), backup = file + ".owned";
    const sentinel = Buffer.alloc(32_768, 0x51);
    writeFileSync(external, sentinel);
    renameSync(file, backup);
    try {
      for (const suffix of ["", "-wal", "-shm"]) {
        if (suffix && !existsSync(file)) renameSync(backup, file);
        linkSync(external, file + suffix);
        try { assert.throws(() => new LocalProjectDatabase(file), { code: "actions.input_invalid" }); }
        finally { rmSync(file + suffix); }
        assert.deepEqual(readFileSync(external), sentinel);
      }
    } finally { if (existsSync(backup)) renameSync(backup, file); }
    const staging = join(f.home, "projects", ".deleting-fixture", "molis-work.db");
    mkdirSync(dirname(staging));
    const first = new LocalProjectDatabase(staging);
    try { writeProjectRoot(first.db, "unregistered", "2026-11-09T00:00:00Z"); } finally { first.close(); }
    const again = new LocalProjectDatabase(staging);
    try { assert.equal(again.db.pragma("journal_mode", { simple: true }), "wal"); } finally { again.close(); }
    const current = new LocalProjectDatabase(file, { homeStorage: { home: f.home, owner } });
    try {
      assert.equal(current.db.pragma("journal_mode", { simple: true }), "delete");
      assert.equal(current.db.pragma("synchronous", { simple: true }), 3);
      assert.equal(current.db.prepare<[], { project_id: string }>("SELECT project_id FROM project_root").get()?.project_id, selected.project_id);
    } finally { current.close(); }
  } finally { owner.release(); }
});

test("BSH-03 · a Goals CLI snapshot cannot switch a project belonging to another Home's lease", async t => {
  const source = await smallSnapshotHome(t), target = await smallSnapshotHome(t);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: target.home });
  const project = await catalog.createProject({ display_name: "Other Home", actor_id: "fixture" });
  catalog.close();
  const file = project.database_path, projectId = project.project_id;
  const modes = () => [...readFileSync(file).subarray(18, 20)];
  assert.deepEqual(modes(), [2, 2]);
  optInCandidate(t);
  const sourceOwner = acquireUpgradedHomeOwner(source.home);
  const targetOwner = acquireUpgradedHomeOwner(target.home);
  try {
    const output = t.mock.method(console, "log", () => {});
    assert.equal(await runV1Cli(["snapshot", "--db", file, "--json", JSON.stringify({ project_id: projectId })],
      { homeDirectory: source.home, actionServiceUrl: process.env.MOLIS_WORK_WEB_URL }), 0);
    assert.match(String(output.mock.calls[0]?.arguments[0]), new RegExp(projectId, "u"));
    assert.deepEqual(modes(), [2, 2], "the independent CLI kept the other Home's WAL mode");
  } finally { targetOwner.release(); sourceOwner.release(); }
  const host = new MolisWorkLocalHost({ homeDirectory: target.home, completeText: null });
  try {
    const reference = molisWorkHostProjectReference({ databasePath: file, projectId });
    await host.withProject(reference, ({ store }) => {
      assert.equal(store.db.pragma("journal_mode", { simple: true }), "delete");
      assert.equal(store.db.pragma("synchronous", { simple: true }), 3);
    });
  } finally { await host.close(); }
  const standalone = new LocalProjectDatabase(file, { existingOnly: true });
  try { assert.equal(standalone.db.pragma("journal_mode", { simple: true }), "delete"); }
  finally { standalone.close(); }
});

test("BSH-03 · U1 refuses a linked project SHM before the first SQLite read of an upgradable database", async t => {
  const f = await smallSnapshotHome(t);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: f.home });
  const project = await catalog.createProject({ display_name: "First read fixture", actor_id: "fixture" });
  catalog.close();
  optInCandidate(t);
  raiseProjectBaseline(t);
  const file = project.database_path, shm = file + "-shm", external = join(f.area, "external-shm");
  rmSync(stampFile(f.home), { force: true });
  const state = ledgerFile(f.home), ledger = existsSync(state) ? readFileSync(state) : undefined;
  const bytes = readFileSync(file), sentinel = Buffer.alloc(36_864, 0x51);
  assert.deepEqual([...bytes.subarray(18, 20)], [2, 2]);
  writeFileSync(external, sentinel);
  linkSync(external, shm);
  try {
    let refusal: unknown;
    try { runHomeUpgrade(f.home); } catch (error) { refusal = error; }
    assert.equal(statSync(external).size, sentinel.length, "the native SQLite reader must not truncate the external SHM");
    assert.ok(readFileSync(external).equals(sentinel));
    assert.ok(readFileSync(file).equals(bytes));
    assert.equal((refusal as { code?: string } | undefined)?.code, "actions.input_invalid");
    assert.deepEqual(existsSync(state) ? readFileSync(state) : undefined, ledger);
    assert.equal(existsSync(stampFile(f.home)), false);
  } finally { rmSync(shm, { force: true }); }
  runHomeUpgrade(f.home);
  assert.equal(versionOf(file), REAL_PROJECT_VERSION + 1);
});

test("BSH-03 · an interrupted unregistered staging WAL open remains with the provisioning owner", { timeout: 20_000 }, async t => {
  const f = await smallSnapshotHome(t);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: f.home });
  const project = await catalog.createProject({ display_name: "Registered project", actor_id: "fixture" });
  catalog.close();
  optInCandidate(t);
  const stage = join(f.home, "projects", ".staging-interrupted", "molis-work.db"), journal = stage + "-journal";
  mkdirSync(dirname(stage));
  await interruptProjectWrite(t, stage, "wal-provision");
  assert.equal(statSync(stage).size, 0);
  assert.equal(statSync(journal).size, 512);
  const original = readFileSync(journal);
  const host = new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null });
  try {
    const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
    await host.withProject(reference, ({ store }) => {
      assert.equal(store.db.pragma("journal_mode", { simple: true }), "delete");
    });
    assert.equal(statSync(stage).size, 0);
    assert.deepEqual(readFileSync(journal), original);
  } finally { await host.close(); }
});

test("BSH-03 · Host startup rolls back a live pair before resuming the same unfinished U1 round", { timeout: 30_000 }, async t => {
  const manifest = registerProbe(t, () => ({ ok: true }), () => {}, sql => sql);
  const home = await openTestHome(t);
  const selected = await home.createProject("Paired recovery fixture", ["dataset"]);
  const person = await home.host.localPersonContext(selected.reference), actions = home.host.actionClient(selected.reference);
  const draft = await actions.invoke(person, datasetActions.create, { title: "Kept draft" }) as { dataset: { id: string; version: number } };
  assert.equal(draft.dataset.version, 1);
  await home.close();
  await home.host.close();

  const file = selected.database_path, libraryFile = homeSqlitePath(home.home, "dataset");
  const addPadding = (path: string, replication: string) => {
    const db = openSqliteConnection(path, { fileMustExist: true });
    try {
      assert.equal(db.pragma("journal_mode", { simple: true }), "delete");
      db.exec("PRAGMA synchronous=EXTRA; CREATE TABLE padding (id INTEGER PRIMARY KEY, payload BLOB NOT NULL); INSERT INTO padding VALUES (1, zeroblob(32768));");
      return db.prepare(`SELECT count(*) AS n FROM ${replication}`).get()?.n;
    } finally { db.close(); }
  };
  const collection = pluginSyncNamespace(manifest, manifest.sync!.collections[0]!.id) + "_replica_changes";
  const projectChanges = addPadding(file, "artifacts_replica_changes"), homeChanges = addPadding(libraryFile, collection);
  const notes = seedStore(home.home, "notes");
  const marker = await runRollbackPair(t, { file, libraryFile }, true, draft.dataset.id);
  assert.ok(marker);
  let upgradeRan = false;
  useDescriptors(t, notesDescriptor("notes", { baseline: { ...BASELINE_V2, upgrades: [{ from: 1, run(db) {
    assert.equal(existsSync(marker), false);
    assert.equal(existsSync(file + "-journal"), false);
    assert.equal(existsSync(libraryFile + "-journal"), false);
    db.exec(ADD_TAG);
    upgradeRan = true;
  } }] } }));
  const run = "n12-unfinished-round";
  mkdirSync(join(home.home, "upgrade"), { recursive: true });
  writeLedger(home.home, { schema_version: 1, home_identity: homeIdentityOf(home.home), run_id: run, from: null,
    to: upgradeFingerprint(homeUpgradeDescriptors()), started_at: "2026-11-09T00:00:00Z",
    units: [{ kind: "sqlite", owner: "tests/notes", relative_path: relativeStore("notes"), from: 1, to: 2, group: null, state: "planned", error: null }] });
  const reopened = new MolisWorkLocalHost({ homeDirectory: home.home, completeText: null });
  try {
    reopened.configurePersonalPlanning(home.home, reopened.ensureWebCatalog(home.home, openMolisWorkProjectCatalog).withCatalog);
    assert.equal(upgradeRan, true);
    assert.equal(versionOf(notes), 2);
    assert.equal(ledgerOf(home.home).run_id, run);
    assert.equal(ledgerOf(home.home).units[0]?.state, "committed");
    const reopenedPerson = await reopened.localPersonContext(selected.reference);
    const unchanged = await reopened.actionClient(selected.reference).invoke(reopenedPerson, datasetActions.get, { id: draft.dataset.id });
    assert.deepEqual(unchanged, draft);
    await reopened.withProject(selected.reference, ({ store, artifacts }) => {
      assert.equal(artifacts.query.latestArtifactVersion(selected.project_id, "n12-uncommitted"), null);
      assert.equal(store.db.prepare("SELECT 1 FROM events WHERE object_id='n12-uncommitted'").get(), undefined);
      assert.equal(store.db.prepare<[], { n: number }>("SELECT count(*) AS n FROM artifacts_replica_changes").get()?.n, projectChanges);
    });
  } finally { await reopened.close(); }
  const library = openSqliteConnection(libraryFile, { readonly: true });
  try { assert.equal(library.prepare(`SELECT count(*) AS n FROM ${collection}`).get()?.n, homeChanges); }
  finally { library.close(); }
});

async function whileSqliteLocked(t: TestContext, file: string, readTable: string, check: () => Promise<void>): Promise<void> {
  // A separate process owns the OS lock. No business row is written merely to obtain a RESERVED lock.
  const hold = `
    import { once } from "node:events";
    import { DatabaseSync } from "node:sqlite";
    const [file, table] = process.argv.slice(1);
    const db = new DatabaseSync(file, { readOnly: Boolean(table) });
    try {
      db.exec(table ? "BEGIN" : "BEGIN IMMEDIATE");
      if (table) db.prepare("SELECT count(*) FROM " + table).get();
      process.stdout.write("locked\\n");
      process.stdin.resume();
      await once(process.stdin, "end");
    } finally {
      if (db.isTransaction) db.exec("ROLLBACK");
      db.close();
    }
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", hold, file, readTable], { stdio: ["pipe", "pipe", "inherit"] });
  const exited = once(child, "close");
  try {
    const ready = once(child.stdout, "data", { signal: t.signal }).then(([data]) => String(data));
    assert.equal(await Promise.race([ready, exited.then(() => "early exit")]), "locked\n");
    await check();
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.stdin.end();
    assert.deepEqual(await exited, [0, null]);
  }
}

test("BSH-03 · cold Host opens the registered pair and retries the same pin after real SQLite locks clear", { timeout: 30_000 }, async t => {
  const home = mkdtempSync(join(tmpdir(), "molis-n12-locked-pair-"));
  let host: MolisWorkLocalHost | undefined, server: Awaited<ReturnType<typeof serveTestHost>> | undefined;
  t.after(async () => {
    try { await server?.close(); }
    finally { try { await host?.close(); } finally { rmSync(home, { recursive: true, force: true }); } }
  });
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await (async () => {
    try {
      const project = await catalog.createProject({ display_name: "Busy fixed version", actor_id: "fixture" });
      catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "form", actor_id: "fixture" });
      return project;
    } finally { catalog.close(); }
  })();
  const file = realpathSync(project.database_path), libraryFile = homeSqlitePath(home, "form");
  assert.deepEqual([...readFileSync(file).subarray(18, 20)], [2, 2], "the registered project starts in WAL");
  assert.equal(existsSync(libraryFile), false, "the registered Form library is still unopened");

  const started = performance.now();
  host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  server = await serveTestHost(null, { home, host });
  const listeningMs = performance.now() - started;
  assert.equal(host.status().projects.some(row => row.project_id === project.project_id), false);
  const route = `/projects/${project.project_id}/api/plugins/io.molis.work.form/forms`;
  const first = performance.now(), { form } = await server.web.post<{ form: FormRecord }>(route, { title: "Lock fixture" });
  const firstActionMs = performance.now() - first;
  assert.equal(form.version, 1);
  assert.deepEqual([...readFileSync(file).subarray(18, 20)], [1, 1]);
  assert.deepEqual([...readFileSync(libraryFile).subarray(18, 20)], [1, 1]);

  const sync = pluginSyncNamespace(formManifest, formManifest.sync!.collections[0]!.id) + "_replica_changes";
  const artifactId = "form-" + form.id, pinPath = `${route}/${form.id}/promote`;
  const facts = () => {
    const main = openSqliteConnection(file, { readonly: true });
    try {
      const library = openSqliteConnection(libraryFile, { readonly: true });
      try {
        return {
          form: library.prepare("SELECT version, artifact_id, artifact_version, publication_pending_json FROM forms WHERE id=? AND project_id=?").get(form.id, project.project_id),
          versions: main.prepare< [string], { version: number }>("SELECT version FROM library_artifact_versions WHERE artifact_id=? ORDER BY version").all(artifactId).map(row => row.version),
          events: main.prepare("SELECT object_id FROM events WHERE object_id GLOB ? ORDER BY seq").all(artifactId + "@*"),
          projectChanges: main.prepare<[], { n: number }>("SELECT count(*) AS n FROM artifacts_replica_changes").get()!.n,
          homeChanges: library.prepare<[], { n: number }>(`SELECT count(*) AS n FROM ${sync}`).get()!.n,
        };
      } finally { library.close(); }
    } finally { main.close(); }
  };

  const blocked: { statement: string; ms: number }[] = [], exec = DatabaseSync.prototype.exec;
  t.mock.method(DatabaseSync.prototype, "exec", function (this: DatabaseSync, sql: string) {
    const start = performance.now();
    try { return exec.call(this, sql); }
    catch (error) {
      if (sqliteErrorName(error) === "SQLITE_BUSY" && this.location() === file) blocked.push({ statement: sql, ms: performance.now() - start });
      throw error;
    }
  });
  const cases = [
    { side: "project reader", path: file, table: "project_root", statement: "COMMIT" },
    { side: "Home reader", path: libraryFile, table: "forms", statement: "COMMIT" },
    { side: "project writer", path: file, table: "", statement: "BEGIN IMMEDIATE" },
    { side: "Home writer", path: libraryFile, table: "", statement: "BEGIN IMMEDIATE" },
  ];
  t.diagnostic(JSON.stringify({ listeningMs, firstActionMs }));
  for (const [index, lock] of cases.entries()) {
    const old = facts(), input = { expected_version: form.version + index };
    assert.deepEqual(old.versions, Array.from({ length: index }, (_, version) => version + 1));
    let failureMs = 0;
    await whileSqliteLocked(t, lock.path, lock.table, async () => {
      const requested = performance.now();
      await assert.rejects(server!.web.post(pinPath, input), error => isLocalHostHttpError(error) && /database is locked/u.test(error.message));
      failureMs = performance.now() - requested;
      assert.deepEqual(facts(), old, lock.side + " leaves both databases unchanged");
      assert.equal(existsSync(file + "-journal"), false);
      assert.equal(existsSync(libraryFile + "-journal"), false);
    });
    assert.equal(blocked.length, index + 1);
    const observed = blocked[index]!;
    assert.equal(observed.statement, lock.statement);
    const resumed = performance.now();
    const { artifact } = await server.web.post<{ artifact: { artifact_id: string; version: number } }>(pinPath, input);
    const retryMs = performance.now() - resumed;
    assert.deepEqual(artifact, { artifact_id: artifactId, version: index + 1 });
    const settled = facts();
    assert.deepEqual(settled.versions, [...old.versions, index + 1]);
    assert.deepEqual(settled.form, { version: input.expected_version + 1, artifact_id: artifactId, artifact_version: index + 1, publication_pending_json: null });
    assert.deepEqual(settled.events, [...old.events, { object_id: artifactId + "@" + (index + 1) }]);
    assert.ok(settled.projectChanges > old.projectChanges);
    assert.equal(settled.homeChanges, old.homeChanges + 1);
    t.diagnostic(JSON.stringify({ lock: lock.side, ...observed, failureMs, retryMs }));
  }
});
