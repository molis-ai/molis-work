import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { acquireUpgradedHomeOwner, createHomeSnapshot, PLATFORM_PLUGIN_REGISTRATIONS, restoreHomeSnapshot, runHomeUpgrade } from "@molis-ai/molis-work-app-local-host";
import { inspectMolisWorkProjectCatalogSnapshot, openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { openSqliteConnection } from "@molis-ai/molis-work-storage";
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

async function interruptProjectWrite(t: TestContext, file: string): Promise<void> {
  const entry = fileURLToPath(new URL("./fixtures/plugin-home-rollback-child.mjs", import.meta.url));
  const child = spawn(process.execPath, [entry, file, "2", "owner", "host"], { stdio: ["ignore", "pipe", "inherit"] });
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
