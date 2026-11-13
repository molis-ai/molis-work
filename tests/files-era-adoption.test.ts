import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { acquireStorageOwner } from "@molis-ai/molis-work-storage";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { adoptProjectDatabase, inspectProjectAdoption, processItemsNeverSynced, LocalProjectDatabase, MolisWorkLocalHost, molisWorkHostProjectReference, openProjectVersionStores,
  projectActionAvailability, retireFilesConsents, runHomeUpgrade } from "@molis-ai/molis-work-app-local-host";
import { materialsActions, MATERIALS_PROVIDER_ID, SYSTEM_MATERIALS_SOURCE, type MaterialsCaptureResult, type MaterialsPinnedResult } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { person } from "./fixtures/home-runtime.js";
import { serveTestHost } from "./fixtures/test-home.js";

// The Files retirement's M3 gate (specs/batch-06-shared-tools/current-version-adoption.md): a Home the Files-era build itself made
// (tests/fixtures/files-era-home, generated at 54a12642c by its generate.mjs) is adopted by the current code project by project. Every
// fixed version reads back byte for byte, every Files line, output and default binding moves to the materials source, Coding's earlier
// materials and the reading position are carried, the person's consents stay exactly as they were, and the materials service itself
// reads the adopted lines as its own while the retired identity no longer names any of them.
// BSH-07 / WMD-04: the adopted process items read back under system.materials; the old Files identity is refused by the forged/old
// signature case in system-materials-source.test.ts, and Diff/Text Stats' default sources name the platform materials ports.

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures/files-era-home");
const FILES = { id: "io.molis.work.files", signature: "official-files-binding" };
const SYSTEM = { id: MATERIALS_PROVIDER_ID, signature: SYSTEM_MATERIALS_SOURCE.signature };
const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

interface Manifest {
  readonly projects: readonly { project_id: string; display_name: string; database: string }[];
  readonly revoked_consent: string;
  readonly stores: readonly { path: string; payload: string; sha256: string }[];
  readonly files: readonly { path: string; payload: string; sha256: string }[];
}
const manifest = JSON.parse(readFileSync(join(FIXTURE, "manifest.json"), "utf8")) as Manifest;

/**
 * Each kept library and file back at its own path; a payload that does not match its digest is a damaged fixture, not a finding. The
 * project folders the generating Home used sat beside it and are recorded under a fixed name (generate.mjs); they come back at `folders`.
 */
function restore(home: string, folders: string): void {
  for (const entry of manifest.stores) {
    const stored = readFileSync(join(FIXTURE, entry.payload), "utf8");
    assert.equal(sha256(stored), entry.sha256, `${entry.payload} is the generated dump`);
    const sql = stored.replaceAll("'/files-era/", `'${folders}/`);
    mkdirSync(dirname(join(home, entry.path)), { recursive: true, mode: 0o700 });
    const db = new DatabaseSync(join(home, entry.path), { defensive: false });
    try { db.exec(sql); } finally { db.close(); }
  }
  for (const entry of manifest.files) {
    assert.equal(sha256(readFileSync(join(FIXTURE, entry.payload))), entry.sha256);
    copyFileSync(join(FIXTURE, entry.payload), join(home, entry.path));
  }
}

type Row = Record<string, unknown>;
function read<T>(path: string, work: (rows: (sql: string, ...params: (string | number)[]) => Row[]) => T): T {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return work((sql, ...params) => db.prepare(sql).all(...params).map(row => ({ ...row }))); } finally { db.close(); }
}
const library = (path: string) => read(path, rows => ({
  items: rows("SELECT artifact_id, owner_actor_id, producer_plugin_id, producer_binding_signature FROM process_items ORDER BY artifact_id"),
  versions: rows("SELECT * FROM process_item_versions ORDER BY artifact_id, version"),
  outputs: rows("SELECT plugin_id, port, artifact_id, version, invalidated_reason FROM plugin_port_outputs ORDER BY plugin_id, port"),
  bindings: rows("SELECT target_plugin_id, target_port, source_plugin_id, source_port, origin FROM plugin_port_bindings ORDER BY target_plugin_id, target_port"),
  values: rows("SELECT install_id, item_key, item_value FROM plugin_private_values ORDER BY install_id, item_key"),
  pending: rows("SELECT DISTINCT key FROM process_items_replica_changes ORDER BY key").map(row => row.key),
  installs: rows("SELECT install_id, json_extract(record_json, '$.plugin_id') AS plugin_id, json_extract(record_json, '$.state') AS state, json_extract(record_json, '$.retain_private_data') AS retain FROM plugin_runtime_installs ORDER BY install_id"),
  cursors: rows("SELECT subscriber_plugin_id, source_plugin_id, event_type_id FROM plugin_event_cursors ORDER BY subscriber_plugin_id, source_plugin_id, event_type_id"),
}));
const membership = (home: string) => read(join(home, "projects/catalog.db"), rows => ({
  active: rows("SELECT project_id, plugin_id FROM project_plugins ORDER BY project_id, plugin_id"),
  portable: rows("SELECT project_id, plugin_id FROM project_portable_plugins ORDER BY project_id, plugin_id"),
  removed: rows("SELECT project_id, actor_id, json_extract(payload_json, '$.plugin_id') AS plugin_id FROM project_events WHERE type = 'project.plugin_removed' ORDER BY project_id"),
}));
const consents = (home: string) => read(join(home, "plugin-runtime/plugin-runtime.db"), rows => rows("SELECT * FROM plugin_consents ORDER BY consent_id"));
const install = (state: ReturnType<typeof library>, pluginId: string) => state.installs.find(row => row.plugin_id === pluginId)!.install_id as string;

// GOLDEN-REPLAY adoption branch: scripts/replay-golden-homes.mjs runs adoptProjectDatabase for every library that still has
// something to move, then retireFilesConsents. This exercises the same order directly, including the already-current no-op after adoption.
test("BSH-14-F/M3 a Home the Files-era build made is adopted project by project and read back whole: versions, moves, carried values, consents, and the materials service reads every line", { timeout: 120_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "files-era-adoption-"));
  // One cleanup, last opened first closed, and the Home removed only after the Host let go of it.
  const cleanup: (() => unknown)[] = [() => rm(root, { recursive: true, force: true })];
  t.after(async () => { for (const step of cleanup.reverse()) await step(); });
  const home = join(root, "home"), folders = join(await realpath(root), "folders");
  mkdirSync(home, { mode: 0o700 });
  restore(home, folders);
  // The first project's output folder as the person left it: the note after its second edit.
  mkdirSync(join(folders, "folder-0"), { recursive: true });
  const text = "中文🙂\nsecond\n";
  await writeFile(join(folders, "folder-0", "note.txt"), text);
  const [first, second] = manifest.projects;
  assert.ok(first && second);
  const pathOf = (project: { database: string }) => join(home, project.database);
  const before = new Map(manifest.projects.map(project => [project.project_id, library(pathOf(project))]));
  const consentsBefore = consents(home), membershipBefore = membership(home);

  // What the old build left: every Files type, with history, handed on and bound by default, and nothing that ever synced.
  const a = before.get(first.project_id)!, b = before.get(second.project_id)!;
  assert.deepEqual(a.versions.map(row => [row.artifact_id, row.version, row.artifact_type_id]), [
    ["io.molis.work.files:after", 1, "files.snapshot.v1"], ["io.molis.work.files:before", 1, "files.snapshot.v1"], ["io.molis.work.files:before", 2, "files.snapshot.v1"],
    ["io.molis.work.files:files", 1, "files.collection.v1"], ["io.molis.work.files:files", 2, "files.collection.v1"], ["io.molis.work.files:selection", 1, "files.text-selection.v1"],
  ]);
  assert.ok(a.items.every(row => row.producer_plugin_id === FILES.id && row.producer_binding_signature === FILES.signature && row.owner_actor_id === "web-user"));
  assert.deepEqual(b.items.map(row => row.artifact_id), ["io.molis.work.files:before", "io.molis.work.files:files"]);
  assert.deepEqual(b.outputs.filter(row => row.artifact_id === null).map(row => row.port), ["after", "selection"], "a port Files withdrew is kept, and moves, with its reason");
  const filesBindings = (state: ReturnType<typeof library>) => state.bindings.filter(row => row.source_plugin_id === FILES.id).map(row => `${row.target_plugin_id}.${row.target_port}<-${row.source_port}`);
  assert.deepEqual(filesBindings(a), ["io.molis.work.diff.after<-after", "io.molis.work.diff.before<-before", "io.molis.work.text-stats.text<-before"]);
  assert.ok(a.pending.length > 0 && b.pending.length > 0, "the original journals still hold the Files-era writes");
  const revoked = consentsBefore.find(row => row.consent_id === manifest.revoked_consent)!;
  assert.deepEqual([revoked.plugin_id, revoked.subject, revoked.revoked_at === null], ["io.molis.work.diff", "before<-io.molis.work.files:before@official-files-binding", false],
    "the person took Diff's agreement to the Files before port back");
  assert.equal(consentsBefore.filter(row => row.plugin_id === FILES.id).length, 0, "Files itself held no agreements; its sources were named in Diff's and Text Stats'");
  // Its leftovers: an official install in each library and the event cursors it held as a subscriber. This build shipped Files inside
  // Coding, so no project's catalog membership names it (a Home that added it on its own is covered in process-items-adoption).
  for (const state of [a, b]) assert.deepEqual(state.installs.filter(row => row.plugin_id === FILES.id).map(row => row.state), ["installed"]);
  const filesCursors = (state: ReturnType<typeof library>) => state.cursors.filter(row => row.subscriber_plugin_id === FILES.id).length;
  assert.ok(filesCursors(a) + filesCursors(b) > 0, "Files subscribed to events it will never read again");
  const filesMembers = (rows: Row[]) => rows.filter(row => row.plugin_id === "files").map(row => row.project_id).sort();
  assert.deepEqual([filesMembers(membershipBefore.active), filesMembers(membershipBefore.portable)], [[], []]);

  // The new build's Host upgrades what this Home's stores hold before any adoption step runs, as it does when it starts (the catalog
  // went from 2 to 3 after this Home was made); adoption itself then needs the current catalog. An old-layout project library is not the
  // second version its 2→3 step was written for, so that step rolls back on structure and only that project waits, its plugins' tables
  // behind it (user 2026-11-13, current-version-adoption.md).
  const libraries = manifest.projects.map(project => project.database);
  const upgrade = runHomeUpgrade(home), failed = upgrade.units.filter(unit => unit.state === "failed");
  assert.deepEqual(failed.filter(unit => unit.kind === "sqlite").map(unit => [unit.relative_path, unit.from, unit.error?.reason]).sort(),
    libraries.map(file => [file, 2, "structure"]).sort(), JSON.stringify(upgrade.units));
  assert.ok(failed.filter(unit => unit.kind !== "sqlite").every(unit => unit.kind === "plugin_tables" && unit.error?.reason === "prerequisite_failed"
    && libraries.includes(unit.relative_path.slice(0, unit.relative_path.lastIndexOf("#")))), JSON.stringify(failed));
  const waitingTables = failed.filter(unit => unit.kind === "plugin_tables").map(unit => unit.relative_path).sort();
  const owner = acquireStorageOwner(join(home, "agent-runtime"));
  try {
    // Each project on its own: an old-layout library of a Home that never synced, whose unsent lines are carried, nothing refused.
    for (const project of manifest.projects) {
      const state = before.get(project.project_id)!, files = state.items.length;
      const inspected = inspectProjectAdoption(pathOf(project), { failures: [], neverSynced: processItemsNeverSynced(home) });
      const values = project === first ? 2 : 0;
      assert.deepEqual({ ...inspected }, { layout: "original", items: files, versions: state.versions.length, outputs: state.outputs.filter(row => row.plugin_id === FILES.id).length,
        bindings: filesBindings(state).length, private_values: values, positions: 1, installs: 1, cursors: filesCursors(state), carried: state.pending.length, refused: [], unsettled: [] }, project.display_name);
      // Before the Home step nothing is taken back: a project still waits.
      if (project === first) assert.deepEqual(retireFilesConsents({ home, owner, at: "2026-11-12T00:00:00.000Z" }).revoked, 0);
      const report = adoptProjectDatabase({ home, owner, projectId: project.project_id, backupDirectory: join(root, "backups") });
      assert.deepEqual([report.state, report.refused, report.carried], ["adopted", [], state.pending.length], `${project.display_name}: adopted, its never-sent lines carried`);
    }
    // Every project adopted: the Home step finds nothing waiting and, Files having held no agreement or membership of its own, takes
    // nothing back.
    assert.deepEqual(retireFilesConsents({ home, owner, at: "2026-11-12T00:00:00.000Z" }), { waiting: [], revoked: 0, memberships: 0 });
    for (const project of manifest.projects) {
      assert.equal(adoptProjectDatabase({ home, owner, projectId: project.project_id, backupDirectory: join(root, "backups") }).state, "current", `${project.display_name}: nothing left to adopt`);
    }
  } finally { owner.release(); }
  // The next start finds each adopted library at this build's version and brings the plugin tables that waited behind it up with it.
  const restarted = runHomeUpgrade(home);
  assert.deepEqual(restarted.units.filter(unit => unit.kind === "plugin_tables" && unit.state === "committed").map(unit => unit.relative_path).sort(), waitingTables);
  assert.ok(restarted.stamped && restarted.units.every(unit => unit.state === "committed"), JSON.stringify(restarted.units));
  assert.deepEqual(membership(home), membershipBefore, "the catalog is as it was");
  assert.deepEqual(consents(home), consentsBefore, "the person's agreements are exactly as they were: the one taken back keeps its time, the rest stay current");

  for (const project of manifest.projects) {
    const was = before.get(project.project_id)!, now = library(pathOf(project));
    assert.deepEqual(now.versions, was.versions, `${project.display_name}: every fixed version reads back byte for byte`);
    assert.deepEqual(now.items, was.items.map(row => ({ ...row, producer_plugin_id: SYSTEM.id, producer_binding_signature: SYSTEM.signature })), "each line is the materials source's, its owner kept");
    assert.deepEqual(now.outputs, was.outputs.map(row => row.plugin_id === FILES.id ? { ...row, plugin_id: SYSTEM.id } : row).sort((x, y) => `${x.plugin_id}.${x.port}` < `${y.plugin_id}.${y.port}` ? -1 : 1));
    assert.deepEqual(now.bindings, was.bindings.map(row => row.source_plugin_id === FILES.id ? { ...row, source_plugin_id: SYSTEM.id } : row), "default bindings now name the materials source; Coding's and Git's stay");
    assert.deepEqual(now.installs, was.installs.map(row => row.plugin_id === FILES.id ? { ...row, state: "uninstalled", retain: 1 } : row), "the Files install is uninstalled as an uninstall records it; every other install stays");
    assert.deepEqual(now.cursors, was.cursors.filter(row => row.subscriber_plugin_id !== FILES.id), "Files' event cursors are gone, everyone else's stay");
    assert.deepEqual(now.values.filter(row => row.install_id === install(was, FILES.id)), was.values.filter(row => row.install_id === install(was, FILES.id)), "its private values are kept for the deletion step");
    assert.ok(![...now.items, ...now.outputs, ...now.bindings].some(row => Object.values(row).includes(FILES.id)), "the retired identity names no line, output or binding");
    const adopted = read(pathOf(project), rows => rows("SELECT key FROM process_items_adopted_replica_changes ORDER BY seq").map(row => row.key));
    assert.deepEqual([...adopted].sort(), was.pending, "the never-sent lines are unsent on the adopted journal, once each");
    const position = now.values.find(row => row.install_id === MATERIALS_PROVIDER_ID && row.item_key === "reading-position");
    assert.equal(position?.item_value, was.values.find(row => row.install_id === install(was, FILES.id) && row.item_key === "reading-position")!.item_value, "the reading position is the project's in the materials service");
  }

  // Coding's draft and queued rounds in the earlier shape, converted by Coding: an `artifact` piece was a 成果 version picked from
  // knowledge (process items never were), so it is now that exact fixed version; the Goal is kept as recorded.
  const coding = install(a, "io.molis.work.coding"), after = library(pathOf(first));
  const value = (key: string) => JSON.parse(after.values.find(row => row.install_id === coding && row.item_key === key)!.item_value as string);
  const materials = value("materials:files-era-session");
  assert.equal(materials.length, 2);
  assert.deepEqual(materials[1], { recorded: { kind: "goal", id: "goal-files-era" }, title: "一个目标" });
  assert.deepEqual(materials[0].ref.pin, { mode: "fixed", version: { artifact_id: "io.molis.work.files:before", version: 1 } });
  assert.deepEqual(value("queued:files-era-session").body.materials, [materials[0]]);

  // The adopted library opens as current, and the materials service itself reads each adopted snapshot and selection as its own.
  new LocalProjectDatabase(pathOf(first)).close();
  // The Host as the web surface starts it on this Home (tests/fixtures/test-home.ts): its catalog, folders and action availability.
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null,
    workspacesFor: projectId => withCatalog({ homeDirectory: home }, catalog => catalog.listWorkspaceDirectory(projectId)),
    actionAvailability: projectActionAvailability((settings, operation) => withCatalog(settings, operation), home) });
  const withCatalog = host.configurePersonalPlanning(home, host.ensureWebCatalog(home, openMolisWorkProjectCatalog).withCatalog);
  const served = await serveTestHost(null, { home, host });
  cleanup.push(() => host.close(), () => served.close());
  const reference = molisWorkHostProjectReference({ databasePath: pathOf(first), projectId: first.project_id });
  const fixed = a.versions.filter(row => row.artifact_type_id !== "files.collection.v1").map(row => ({ artifact_id: row.artifact_id as string, version: row.version as number }));
  const pinned = await host.actionClient(reference).invoke(person(["workspace:read"], first.project_id), materialsActions.pinned, { versions: fixed }) as MaterialsPinnedResult;
  assert.deepEqual(pinned.items.map(item => [item.version.artifact_id, item.version.version, item.title]), fixed.map(version => [version.artifact_id, version.version, "note.txt"]),
    "every adopted snapshot and selection is the materials service's own to read");

  // The next publish: the person fixes the note again through the materials service; the before line Diff reads moves on under the
  // materials source, and the write is recorded once on the adopted journal after the carried lines.
  const workspace = read(join(home, "projects/catalog.db"), rows => rows("SELECT workspace_id FROM workspaces WHERE canonical_path=?", join(folders, "folder-0")))[0]!.workspace_id as string;
  assert.equal((await fetch(`${served.origin}/projects/${first.project_id}/`, { headers: { origin: served.origin, "x-molis-work-control-token": served.controlToken } })).status, 200);
  const captured = await host.actionClient(reference).invoke(person(["artifact:read", "artifact:write", "storage:private", "workspace:read"], first.project_id), materialsActions.capture,
    { workspace_id: workspace, path: ["note.txt"], fingerprint: sha256(text), port: "before" }) as MaterialsCaptureResult;
  const next = captured.ref.pin.mode === "snapshot" ? captured.ref.pin.version : assert.fail("a snapshot");
  const published = library(pathOf(first));
  assert.deepEqual(published.outputs.find(row => row.port === "before"), { plugin_id: SYSTEM.id, port: "before", artifact_id: next.artifact_id, version: next.version, invalidated_reason: null });
  assert.deepEqual(published.items.find(row => row.artifact_id === next.artifact_id), { artifact_id: next.artifact_id, owner_actor_id: "web-user", producer_plugin_id: SYSTEM.id, producer_binding_signature: SYSTEM.signature });
  assert.deepEqual(published.versions.filter(row => !(row.artifact_id === next.artifact_id && row.version === next.version)), a.versions.filter(row => !(row.artifact_id === next.artifact_id && row.version === next.version)),
    "the fixed versions from before are untouched");
  const journalNow = read(pathOf(first), rows => rows("SELECT key FROM process_items_adopted_replica_changes ORDER BY seq").map(row => row.key));
  assert.equal(journalNow.at(-1), JSON.stringify([first.project_id, "process_item", next.artifact_id]), "the new write is on the adopted journal");

  const secondLibrary = new LocalProjectDatabase(pathOf(second));
  cleanup.push(() => secondLibrary.close());
  const collection = openProjectVersionStores(secondLibrary).processItems.query.getArtifactVersion(second.project_id, { artifact_id: "io.molis.work.files:files", version: 1 });
  assert.deepEqual([collection?.producer_plugin_id, collection?.producer_binding_signature], [SYSTEM.id, SYSTEM.signature], "the folder collection is the materials source's too");
});
