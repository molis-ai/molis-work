import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, linkSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { acquireUpgradedHomeOwner, createHomeSnapshot, LocalProjectDatabase, PLATFORM_PLUGIN_REGISTRATIONS, restoreHomeSnapshot, runHomeUpgrade } from "@molis-ai/molis-work-app-local-host";
import { inspectMolisWorkProjectCatalogSnapshot, openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import { DATASET_DATABASE } from "@molis-ai/molis-work-plugin-dataset";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { bindDatabaseSpace, ensureStorageSpace, homeSqlitePath, openSqliteConnection } from "@molis-ai/molis-work-storage";
import { smallSnapshotHome } from "./fixtures/home-snapshot-small.js";

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
    const current = new LocalProjectDatabase(file);
    try {
      assert.equal(current.db.pragma("journal_mode", { simple: true }), "delete");
      assert.equal(current.db.pragma("synchronous", { simple: true }), 3);
      assert.equal(current.db.prepare<[], { project_id: string }>("SELECT project_id FROM project_root").get()?.project_id, selected.project_id);
    } finally { current.close(); }
  } finally { owner.release(); }
});
