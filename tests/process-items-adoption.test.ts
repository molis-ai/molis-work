import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { acquireStorageOwner } from "@molis-ai/molis-work-storage";
import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { adoptProjectDatabase, captureProcessItemsRecovery, inspectProjectAdoption, LocalProjectDatabase, verifyProcessItemsRecovery } from "@molis-ai/molis-work-app-local-host";
import { FILE_SNAPSHOT_TYPE, FILE_TEXT_SELECTION_TYPE, FILES_COLLECTION_TYPE } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

// BSH-14-F, BSH-06 (specs/batch-06-shared-tools/current-version-adoption.md「同版本存储实施」, spec.md「项目库 v2 同版本采用与交接」): the
// explicit adoption program moves exactly the retired Files producer's process items, outputs and default bindings to the platform's
// materials source and the process-item triggers to the adopted journal, in one transaction with a backup first; an ordinary open never
// does it, and anything it cannot prove leaves the library byte for byte as it was.
const FILES = { id: "io.molis.work.files", signature: "official-files-binding" };
const SYSTEM = { id: "system.materials", signature: "molis-work:system.materials" };
type Db = ReturnType<typeof openTestSqlite>;

async function home(t: test.TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "molis-adoption-"));
  const owner = acquireStorageOwner(join(directory, "agent-runtime"));
  t.after(async () => { owner.release(); await rm(directory, { recursive: true, force: true }); });
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: directory, storageOwner: owner });
  const project = await catalog.createProject({ display_name: "采用", actor_id: "user" });
  catalog.close();
  const path = isAbsolute(project.database_path) ? project.database_path : join(directory, project.database_path);
  // The catalog creates the library at the current baseline; make sure the file exists with it before shaping old states.
  new LocalProjectDatabase(path).close();
  return { directory, owner, projectId: project.project_id, path, backups: join(directory, "adoption-backups") };
}

/** Turn a current library back into the layout every project had before adoption: the original journal triggers, no adopted journal. */
function toOriginalLayout(db: Db): void {
  const triggers = db.prepare("SELECT name, sql FROM sqlite_schema WHERE type='trigger' AND name LIKE 'process_items_sync_%'").all() as { name: string; sql: string }[];
  assert.equal(triggers.length, 6);
  for (const { name, sql } of triggers) { db.exec(`DROP TRIGGER ${name}`); db.exec(sql.replaceAll("process_items_adopted_replica_", "process_items_replica_")); }
  for (const { name } of db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'process_items_adopted_replica_%'").all() as { name: string }[]) db.exec(`DROP TABLE ${name}`);
}

/** The stored body, its digest and size exactly as the owner records them (a valid fixed version, not a placeholder). */
const content = (payload: { text: string }) => { const json = JSON.stringify(payload); return [json, `sha256:${createHash("sha256").update(json).digest("hex")}`, Buffer.byteLength(json)] as const; };

function item(db: Db, projectId: string, id: string, producer: { id: string; signature: string }, versions: { type: string; schema?: number; plugin_version?: string }[]): void {
  db.prepare("INSERT INTO process_items(artifact_id,project_id,owner_actor_id,producer_plugin_id,producer_binding_signature,created_at) VALUES (?,?,?,?,?,?)")
    .run(id, projectId, "user", producer.id, producer.signature, "2026-11-01T00:00:00Z");
  versions.forEach((version, index) => db.prepare(`INSERT INTO process_item_versions(artifact_id,version,artifact_type_id,schema_version,producer_plugin_version,content_kind,payload_json,
    content_digest,size_bytes,scope,availability,lifecycle_state,supersedes_version,created_by,created_at) VALUES (?,?,?,?,?,'inline',?,?,?,'personal','available','active',?,'user',?)`)
    .run(id, index + 1, version.type, version.schema ?? 1, version.plugin_version ?? "0.9.0", ...content({ text: `${id}@${index + 1}` }),
      index ? index : null, `2026-11-0${index + 1}T00:00:00Z`));
}

/** One project as the Files era left it: three Files lines (one fixed twice), its outputs, Diff's default binding, and another producer's line. */
function filesEra(db: Db, projectId: string): void {
  item(db, projectId, "files-collection", FILES, [{ type: FILES_COLLECTION_TYPE }]);
  item(db, projectId, "files-snapshot", FILES, [{ type: FILE_SNAPSHOT_TYPE }, { type: FILE_SNAPSHOT_TYPE, plugin_version: "0.9.1" }]);
  item(db, projectId, "files-selection", FILES, [{ type: FILE_TEXT_SELECTION_TYPE }]);
  item(db, projectId, "other-line", { id: "io.molis.work.text-stats", signature: "official-text-stats-binding" }, [{ type: "text-stats.report.v1" }]);
  const output = db.prepare("INSERT INTO plugin_port_outputs(project_id,plugin_id,port,artifact_id,version,invalidated_reason,scope_key,updated_at) VALUES (?,?,?,?,?,?,?,?)");
  output.run(projectId, FILES.id, "before", "files-snapshot", 1, null, projectId, "2026-11-01T00:00:00Z");
  output.run(projectId, FILES.id, "after", "files-snapshot", 2, "浏览的文件夹换了", projectId, "2026-11-02T00:00:00Z");
  db.prepare("INSERT INTO plugin_port_bindings(project_id,target_plugin_id,target_port,source_plugin_id,source_port,origin,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(projectId, "io.molis.work.diff", "before", FILES.id, "before", "default", "2026-11-01T00:00:00Z", "2026-11-01T00:00:00Z");
  db.prepare("INSERT INTO plugin_port_artifact_bindings(project_id,target_plugin_id,target_port,artifact_id,version,actor_id,created_at) VALUES (?,?,?,?,?,?,?)")
    .run(projectId, "io.molis.work.diff", "after", "files-snapshot", 1, "user", "2026-11-01T00:00:00Z");
}

const rows = (db: Db, sql: string, ...params: unknown[]) => db.prepare(sql).all(...params);
const journal = (db: Db, prefix: string) => Object.fromEntries(["changes", "heads", "outbox", "conflicts", "resolutions", "state"]
  .map(table => [table, rows(db, `SELECT * FROM ${prefix}_replica_${table} ORDER BY 1`)]));

test("BSH-14-F an original library is adopted once: lines, outputs and default bindings move with their history, the journal switches, and the old journal stays", async t => {
  const h = await home(t);
  let db = openTestSqlite(h.path);
  toOriginalLayout(db); filesEra(db, h.projectId);
  const versionsBefore = rows(db, "SELECT * FROM process_item_versions ORDER BY artifact_id, version");
  const originalJournal = journal(db, "process_items");
  assert.ok((originalJournal.changes as unknown[]).length >= 4, "the original journal recorded the Files-era writes");
  db.close();
  // An ordinary open refuses the old layout; it never repairs it in place.
  assert.throws(() => new LocalProjectDatabase(h.path), /结构与当前完整基线不符|SQLITE_BASELINE_TRIGGER_MISMATCH/u);
  const unsent = /process item change\(s\) not yet uploaded from the original journal/u;
  const inspected = inspectProjectAdoption(h.path);
  assert.deepEqual({ ...inspected, refused: [] }, { layout: "original", items: 3, versions: 4, outputs: 2, bindings: 1, refused: [] });
  assert.match(inspected.refused.join("\n"), unsent, "lines the original journal never sent are unsettled");
  // BSH-14-D: those lines are adopted only once a recovery file of this Home keeps them.
  const before = await readFile(h.path);
  const unkept = adoptProjectDatabase({ home: h.directory, owner: h.owner, projectId: h.projectId, backupDirectory: h.backups });
  assert.equal(unkept.state, "refused");
  assert.match(unkept.refused.join("\n"), unsent);
  assert.ok((await readFile(h.path)).equals(before), "without a recovery file the library is unchanged");
  const capture = captureProcessItemsRecovery({ home: h.directory, owner: h.owner, cutoverId: "cutover-0123456789abcdef" });
  assert.deepEqual(capture.projects, [h.projectId]);
  assert.equal(capture.path, join(await realpath(h.directory), "sync", "process-items-recovery", `${capture.captureId}.jsonl`));
  assert.equal((await stat(capture.path!)).mode & 0o777, 0o600, "the recovery file is private to this account");
  assert.ok((await readFile(h.path)).equals(before), "capturing reads the library and changes nothing");

  const report = adoptProjectDatabase({ home: h.directory, owner: h.owner, projectId: h.projectId, backupDirectory: h.backups, recovery: capture.captureId! });
  assert.equal(report.state, "adopted");
  assert.deepEqual({ ...report, backup: undefined }, { project_id: h.projectId, layout: "original", state: "adopted", items: 3, versions: 4, outputs: 2, bindings: 1, refused: [], backup: undefined });
  assert.ok(report.backup && existsSync(report.backup), "a backup is taken before the first change");
  const backup = openTestSqlite(report.backup!);
  assert.equal((backup.prepare("SELECT COUNT(*) AS n FROM process_items WHERE producer_plugin_id=?").get(FILES.id) as { n: number }).n, 3, "the backup is the library before adoption");
  backup.close();

  db = openTestSqlite(h.path);
  assert.deepEqual(rows(db, "SELECT artifact_id, producer_plugin_id, producer_binding_signature FROM process_items ORDER BY artifact_id"), [
    { artifact_id: "files-collection", producer_plugin_id: SYSTEM.id, producer_binding_signature: SYSTEM.signature },
    { artifact_id: "files-selection", producer_plugin_id: SYSTEM.id, producer_binding_signature: SYSTEM.signature },
    { artifact_id: "files-snapshot", producer_plugin_id: SYSTEM.id, producer_binding_signature: SYSTEM.signature },
    { artifact_id: "other-line", producer_plugin_id: "io.molis.work.text-stats", producer_binding_signature: "official-text-stats-binding" },
  ]);
  assert.deepEqual(rows(db, "SELECT * FROM process_item_versions ORDER BY artifact_id, version"), versionsBefore, "every version keeps what it recorded, its producing version included");
  assert.deepEqual(rows(db, "SELECT plugin_id, port, artifact_id, version, invalidated_reason, scope_key, updated_at FROM plugin_port_outputs ORDER BY port"), [
    { plugin_id: SYSTEM.id, port: "after", artifact_id: "files-snapshot", version: 2, invalidated_reason: "浏览的文件夹换了", scope_key: h.projectId, updated_at: "2026-11-02T00:00:00Z" },
    { plugin_id: SYSTEM.id, port: "before", artifact_id: "files-snapshot", version: 1, invalidated_reason: null, scope_key: h.projectId, updated_at: "2026-11-01T00:00:00Z" },
  ]);
  assert.deepEqual(rows(db, "SELECT target_plugin_id, target_port, source_plugin_id, source_port, origin FROM plugin_port_bindings"),
    [{ target_plugin_id: "io.molis.work.diff", target_port: "before", source_plugin_id: SYSTEM.id, source_port: "before", origin: "default" }]);
  assert.equal(rows(db, "SELECT * FROM plugin_port_artifact_bindings").length, 1, "a fixed version input names no source and stays");
  assert.deepEqual(journal(db, "process_items"), originalJournal, "the original journal is kept as it was, as recovery evidence");
  const adopted = journal(db, "process_items_adopted");
  assert.deepEqual([adopted.changes, adopted.heads, adopted.outbox, adopted.conflicts], [[], [], [], []], "the adopted journal starts empty: the move is no new business write");
  assert.equal((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 2);
  // Later writes mark the adopted journal only.
  db.prepare("UPDATE process_item_versions SET lifecycle_state='archived', archived_at='2026-11-03T00:00:00Z', archived_by='user' WHERE artifact_id='files-selection'").run();
  assert.deepEqual(rows(db, "SELECT key FROM process_items_adopted_replica_changes"), [{ key: JSON.stringify([h.projectId, "process_item", "files-selection"]) }]);
  assert.deepEqual(journal(db, "process_items"), originalJournal);
  db.close();
  assert.equal(verifyProcessItemsRecovery({ home: h.directory, captureId: capture.captureId! }).projects.length, 1, "the recovery file still matches after adoption");
  // The library now opens normally, and adopting again changes nothing and takes no backup.
  new LocalProjectDatabase(h.path).close();
  assert.equal(adoptProjectDatabase({ home: h.directory, owner: h.owner, projectId: h.projectId, backupDirectory: h.backups }).state, "current");
  assert.equal((await readdir(h.backups)).length, 1);
});

test("BSH-14-F/BSH-06 what adoption cannot prove refuses the whole project and leaves the library byte for byte as it was", async t => {
  const cases: Array<[string, (db: Db, projectId: string) => void, RegExp]> = [
    ["a binding chosen by hand", (db, p) => db.prepare("UPDATE plugin_port_bindings SET origin='user' WHERE project_id=?").run(p), /chosen by hand/u],
    ["a Files line with a version of another type", (db, p) => item(db, p, "files-foreign", FILES, [{ type: FILE_SNAPSHOT_TYPE }, { type: "files.unknown.v1" }]), /files\.unknown\.v1@1 is not a type/u],
    ["an output the system source already holds", (db, p) => db.prepare("INSERT INTO plugin_port_outputs(project_id,plugin_id,port,updated_at) VALUES (?,?,?,?)").run(p, SYSTEM.id, "before", "2026-11-05T00:00:00Z"), /already holds this port/u],
    ["a Files output that hands on another producer's line", (db, p) => db.prepare("UPDATE plugin_port_outputs SET artifact_id='other-line' WHERE port='before' AND project_id=?").run(p), /other-line is not a Files process item/u],
    ["a frozen upload in the original journal", db => db.prepare("INSERT INTO process_items_replica_outbox(key,through_seq,operation) VALUES (?,?,?)").run("[\"k\"]", 1, "{}"), /frozen process item upload/u],
    ["the same plugin id under another signature", (db, p) => item(db, p, "imposter", { id: FILES.id, signature: "someone-else" }, [{ type: FILE_SNAPSHOT_TYPE }]), /another signature/u],
  ];
  for (const [name, change, refusal] of cases) {
    const h = await home(t);
    const db = openTestSqlite(h.path);
    toOriginalLayout(db); filesEra(db, h.projectId); change(db, h.projectId);
    db.close();
    const before = await readFile(h.path);
    const report = adoptProjectDatabase({ home: h.directory, owner: h.owner, projectId: h.projectId, backupDirectory: h.backups });
    assert.equal(report.state, "refused", name);
    assert.match(report.refused.join("\n"), refusal, name);
    assert.ok((await readFile(h.path)).equals(before), `${name}: the library is unchanged`);
    assert.equal(existsSync(h.backups), false, `${name}: no backup is taken for a refusal`);
  }
});

test("BSH-14-F a mixed layout is refused, and a library upgraded from 1 moves its lines without marking the adopted journal", async t => {
  const mixed = await home(t);
  let db = openTestSqlite(mixed.path);
  toOriginalLayout(db);
  db.exec("CREATE TABLE process_items_adopted_replica_state(id INTEGER PRIMARY KEY, device TEXT, applying INTEGER NOT NULL DEFAULT 0)");
  db.close();
  const untouched = await readFile(mixed.path);
  assert.throws(() => adoptProjectDatabase({ home: mixed.directory, owner: mixed.owner, projectId: mixed.projectId, backupDirectory: mixed.backups }), /既不是采用前的项目库，也不是现行项目库/u);
  assert.ok((await readFile(mixed.path)).equals(untouched));

  // The 1 → 2 step lands on the current layout (user 2026-11-12); its Files lines are still the old producer's until adoption moves them.
  const upgraded = await home(t);
  db = openTestSqlite(upgraded.path);
  filesEra(db, upgraded.projectId);
  db.exec("DELETE FROM process_items_adopted_replica_changes");
  db.close();
  assert.equal(inspectProjectAdoption(upgraded.path).layout, "current");
  const report = adoptProjectDatabase({ home: upgraded.directory, owner: upgraded.owner, projectId: upgraded.projectId, backupDirectory: upgraded.backups });
  assert.equal(report.state, "adopted");
  db = openTestSqlite(upgraded.path);
  assert.deepEqual(rows(db, "SELECT * FROM process_items_adopted_replica_changes"), [], "the owner's applying flag keeps the move out of the journal");
  assert.deepEqual(rows(db, "SELECT applying FROM process_items_adopted_replica_state"), [{ applying: 0 }]);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM process_items WHERE producer_plugin_id=?").get(FILES.id) as { n: number }).n, 0);
  db.close();
});

test("BSH-14-F adoption needs the Home's own storage owner and a project of that Home", async t => {
  const h = await home(t);
  assert.throws(() => adoptProjectDatabase({ home: h.directory, owner: h.owner, projectId: "project-not-here", backupDirectory: h.backups }), /没有项目/u);
  const other = await mkdtemp(join(tmpdir(), "molis-adoption-other-"));
  t.after(() => rm(other, { recursive: true, force: true }));
  const stranger = acquireStorageOwner(join(other, "agent-runtime"));
  t.after(() => stranger.release());
  assert.throws(() => adoptProjectDatabase({ home: h.directory, owner: stranger, projectId: h.projectId, backupDirectory: h.backups }));
});

test("BSH-14-D a recovery file keeps the original journal and each line's graph; a changed journal or file, or a foreign Home, is refused", async t => {
  const h = await home(t);
  let db = openTestSqlite(h.path);
  toOriginalLayout(db); filesEra(db, h.projectId);
  const key = JSON.stringify([h.projectId, "process_item", "files-snapshot"]);
  db.prepare("INSERT INTO process_items_replica_outbox(key,through_seq,operation) VALUES (?,?,?)").run(key, 1, JSON.stringify({ operationId: "device:1", key, base: 0, value: null }));
  db.close();
  const capture = captureProcessItemsRecovery({ home: h.directory, owner: h.owner, cutoverId: "cutover-0123456789abcdef" });
  const recovery = verifyProcessItemsRecovery({ home: h.directory, captureId: capture.captureId! });
  assert.equal(recovery.header.cutoverId, "cutover-0123456789abcdef");
  const [project] = recovery.projects;
  assert.ok(project && project.layout === "original");
  assert.deepEqual(project.outbox.map(row => row.key), [key], "the frozen upload is kept exactly as stored");
  assert.deepEqual(project.graphs.map(row => row.key), [...new Set([...project.changes.map(row => row.key), key])].sort(), "every unsettled key has its graph");
  const snapshot = project.graphs.find(row => row.key === key)!.graph as { identity: { producer_plugin_id: string }; versions: unknown[] };
  assert.equal(snapshot.identity.producer_plugin_id, FILES.id, "the graph is the line as this Home held it, before any conversion");
  assert.equal(snapshot.versions.length, 2);

  // An altered file is not a recovery file.
  const text = await readFile(capture.path!, "utf8");
  await writeFile(capture.path!, text.replace("files-snapshot@1", "files-snapshot@9"));
  assert.throws(() => verifyProcessItemsRecovery({ home: h.directory, captureId: capture.captureId! }), /不完整或已改动/u);
  await writeFile(capture.path!, text);
  assert.ok(verifyProcessItemsRecovery({ home: h.directory, captureId: capture.captureId! }));

  // A journal that changed after the capture is no longer what it kept: adoption refuses it and changes nothing.
  db = openTestSqlite(h.path);
  db.prepare("INSERT INTO process_items_replica_changes(key) VALUES (?)").run(key);
  db.close();
  assert.throws(() => verifyProcessItemsRecovery({ home: h.directory, captureId: capture.captureId! }), /原过程项日志在保全后变了/u);
  const before = await readFile(h.path);
  assert.throws(() => adoptProjectDatabase({ home: h.directory, owner: h.owner, projectId: h.projectId, backupDirectory: h.backups, recovery: capture.captureId! }), /原过程项日志在保全后变了/u);
  assert.ok((await readFile(h.path)).equals(before));

  // Another Home cannot use it, and a capture id that is not one is refused before any path is built.
  const other = await home(t);
  assert.throws(() => verifyProcessItemsRecovery({ home: other.directory, captureId: capture.captureId! }), /找不到这份过程项恢复件/u);
  assert.throws(() => verifyProcessItemsRecovery({ home: h.directory, captureId: "../../etc" }), /恢复件编号无效/u);
  // A Home with nothing unsettled captures nothing and writes no file.
  const clean = captureProcessItemsRecovery({ home: other.directory, owner: other.owner, cutoverId: "cutover-0123456789abcdef" });
  assert.deepEqual(clean, { captureId: null, path: null, projects: [] });
  assert.equal(existsSync(join(other.directory, "sync")), false, "and creates no sync store either");
});

