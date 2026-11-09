import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  HomePluginDatabaseDeclaration, PluginArtifactPublishInput, PluginArtifactWriter, PluginInstanceRecord, PluginProjectRowTransaction, PluginStartContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { projectDatabasePath, writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import { datasetActions, datasetManifest } from "@molis-ai/molis-work-plugin-dataset";
import { assertPluginActionCurrent, runInPluginAction } from "@molis-ai/molis-work-plugin-runtime";
import {
  acquireStorageOwner, assertStorageOwner, bindDatabaseSpace, ensureStorageSpace, homeSqlitePath, openSqliteConnection, snapshotFileStat,
} from "@molis-ai/molis-work-storage";
import { artifactRootStore } from "../apps/local-host/dist/plugin-artifact-row-library.js";
import { artifactRowReplication } from "../apps/local-host/dist/plugin-artifact-row-sql.js";
import { withArtifactRootStore } from "../apps/local-host/dist/plugin-artifact-row-transaction.js";
import { pluginDatabaseClient } from "../apps/local-host/dist/plugin-database-client.js";
import { projectArtifactRoot } from "../apps/local-host/dist/plugin-project-rows.js";
import { pluginSyncDatabaseDeclaration, pluginSyncNamespace, pluginSyncTriggers } from "../apps/local-host/dist/plugin-sync-database.js";
import { createPluginArtifactOperations } from "../modules/artifacts/dist/plugin-operations.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";

const projectId = "n12-project", id = "dataset-a", otherId = "dataset-b", at = "2026-11-09T18:00:00Z", otherAt = "2026-11-09T18:00:01Z";
const permissions = ["storage:private", "dataset:read", "dataset:write", "artifact:read", "artifact:write"];
const definition = { ...datasetActions.promote, action: { ...datasetActions.promote.action, scheduling: "concurrent" as const } };

function withRoot(schema: (sql: string) => string): HomePluginDatabaseDeclaration {
  const base = datasetManifest.databases!.home!;
  return { ...base, schema: schema(base.schema), project_rows: { ...base.project_rows!, artifact_join: {
    table: "datasets", id_column: "id", version_column: "version", artifact_id_column: "artifact_id", artifact_version_column: "artifact_version",
    write_columns: ["updated_at"], pending_column: "publication_pending_json",
  } } };
}

function fixture(t: TestContext, schema: (sql: string) => string = sql => sql) {
  const home = mkdtempSync(join(realpathSync(tmpdir()), "molis-n12-row-"));
  const lock = join(home, "agent-runtime"), owner = acquireStorageOwner(lock);
  const space = ensureStorageSpace(home), file = projectDatabasePath(join(home, "projects"), projectId);
  mkdirSync(dirname(file), { recursive: true });
  const project = new LocalProjectDatabase(file, { journalMode: "delete" });
  writeProjectRoot(project.db, projectId, at);
  const declaration = withRoot(schema);
  const manifest = { ...datasetManifest, databases: { home: declaration } };
  const full = pluginSyncDatabaseDeclaration(manifest, declaration), libraryPath = homeSqlitePath(home, full.store_name);
  mkdirSync(dirname(libraryPath));
  const library = openSqliteConnection(libraryPath);
  t.after(() => { library.close(); project.close(); owner.release(); rmSync(home, { recursive: true, force: true }); });
  library.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=EXTRA; PRAGMA user_version=${full.version}; ${full.schema}`);
  bindDatabaseSpace(library, space);
  const insert = library.prepare("INSERT INTO datasets (id, project_id, title, description, status, columns_json, rows_json, created_at, updated_at, version) VALUES (?, ?, ?, '', 'editing', '[]', '[]', ?, ?, 1)");
  insert.run(id, projectId, "Owned", at, at);
  insert.run(otherId, "other-project", "Other", otherAt, otherAt);
  const root = projectArtifactRoot(declaration, manifest.plugin_id)!;
  const roots = artifactRootStore({ db: project.db, path: file, journal: { project_id: projectId, actor_id: "home-user", writer: project } }, {
    home, path: libraryPath, storeName: full.store_name, identity: snapshotFileStat(libraryPath), version: full.version,
    root, readPermission: full.read_permission, writePermission: full.write_permission,
    triggers: pluginSyncTriggers(library, full, manifest, declaration.schema), replication: artifactRowReplication(manifest, declaration, root.declaration.table),
  }, projectId)!;
  const deployment = manifest.entrypoints[0]!;
  const install: PluginInstanceRecord = { install_id: "n12-install", installation_generation: "first", plugin_id: manifest.plugin_id,
    version: manifest.version, publisher_id: manifest.publisher.publisher_id, publisher_signature: manifest.publisher.signature, manifest_digest: "fixture",
    deployment: deployment.deployment, selected_entrypoint: deployment.entrypoint, grants: [...permissions], execution: "host", publisher_trust: "host",
    state: "running", recovery_count: 0, last_error_code: null, installed_at: at, updated_at: at, uninstalled_at: null, retain_private_data: false };
  const context: PluginStartContext = { install_id: install.install_id, installation_generation: install.installation_generation, plugin_id: manifest.plugin_id,
    version: manifest.version, deployment: install.deployment, grants: install.grants, requireGrant(permission) {
      if (!install.grants.includes(permission)) throw new ActionError("actions.forbidden", "revoked fixture grant");
    } };
  const ports = { db: project.db, appendEvent: project.appendEvent.bind(project), eventCursor: project.eventCursor.bind(project) };
  const artifacts = new ArtifactsModule(ports), process = new ProcessItemsModule(ports);
  const { client, writer } = createPluginArtifactOperations({ api: artifacts, process, manifest, project_id: projectId, actor_id: "home-user",
    authorize: context.requireGrant, assertCallerCurrent: () => assertPluginActionCurrent(context), assertInput: assertActionInput });
  const ordinary = pluginDatabaseClient({ reader: library, writer: library, inTransaction: () => library.inTransaction }, full, context.requireGrant, context, () => false);
  const services = withArtifactRootStore(ordinary, client, writer, roots, { context, projectId, assertActive: () => {}, assertOwner: () => assertStorageOwner(lock, owner),
    assertProject: async () => {}, record: () => install });
  const source = () => library.prepare("SELECT id, project_id, artifact_id, artifact_version, version FROM datasets ORDER BY id").all();
  const sync = pluginSyncNamespace(manifest, manifest.sync!.collections[0]!.id);
  const homeChanges = () => library.prepare<[], { n: number }>(`SELECT count(*) AS n FROM ${sync}_replica_changes`).get()!.n;
  const projectChanges = () => project.db.prepare<[], { n: number }>("SELECT count(*) AS n FROM artifacts_replica_changes").get()!.n;
  const abort = new AbortController();
  const caller: ActionExecutionContext = { actor_id: "original-author", audit_actor_id: "different-audit-actor", project_id: projectId,
    audience: "user", permissions, beforeEffect: async () => {}, signal: abort.signal };
  const run = <T>(write: () => T, overrides: Partial<ActionExecutionContext> = {}) => runInPluginAction({ install_id: context.install_id,
    installation_generation: context.installation_generation, definition, caller: { ...caller, ...overrides } }, write);
  const put = (name: string, subject = id, revision = 1): PluginArtifactPublishInput => ({ artifact_id: name, version: 1,
    artifact_type_id: manifest.artifacts.produces[0]!.artifact_type_id, schema_version: 1, content: { kind: "inline", payload: { name } },
    ...pinnedArtifact(name, { kind: "dataset", id: subject }, String(revision)) });
  return { database: services.database, artifacts: services.artifacts, source, homeChanges, projectChanges, project, run, put, abort, install,
    version: (name: string) => artifacts.query.latestArtifactVersion(projectId, name), library };
}

test("BSH-02 and BSH-03 · a Home row, new artifact, event and replication commit together with original author", async t => {
  const f = fixture(t), changes = f.homeChanges(), replicated = f.projectChanges(), cursor = f.project.eventCursor(projectId);
  let savedRow: PluginProjectRowTransaction | undefined, savedWriter: PluginArtifactWriter | undefined;
  let refused = 0;
  const result = await f.run(() => f.database.transactionProjectRow!(id, row => {
    savedRow = row;
    assert.equal(row.read()?.version, 1);
    assert.throws(() => f.artifacts.publish(f.put("ordinary-publish")), { code: "actions.forbidden" });
    const published = f.artifacts.join!(row, writer => { savedWriter = writer; return writer.publish(f.put("real-pin")); });
    published.artifact.artifact_id = "forged-result";
    assert.throws(() => savedWriter!.head("real-pin"), { code: "actions.forbidden" });
    assert.equal(row.compareAndSet(1, { updated_at: at }), true);
    return Object.defineProperty({ ok: true }, "then", { get() {
      refused++;
      assert.throws(() => f.artifacts.publish(f.put("then-publish")), { code: "actions.forbidden" });
      assert.throws(() => row.read(), { code: "actions.forbidden" });
      assert.throws(() => f.artifacts.join!(row, () => assert.fail("escaped handle")), { code: "actions.forbidden" });
      return undefined;
    } });
  }));
  assert.deepEqual(result, { ok: true });
  assert.equal(refused, 1);
  assert.equal(f.version("real-pin")?.created_by, "original-author");
  assert.equal(f.version("ordinary-publish"), null);
  assert.equal(f.version("then-publish"), null);
  assert.deepEqual(f.source(), [
    { id, project_id: projectId, artifact_id: "real-pin", artifact_version: 1, version: 2 },
    { id: otherId, project_id: "other-project", artifact_id: "", artifact_version: 0, version: 1 },
  ]);
  assert.equal(f.homeChanges(), changes + 1);
  assert.equal(f.projectChanges(), replicated + 2);
  assert.equal(f.project.eventCursor(projectId), cursor + 1);
  assert.throws(() => savedRow!.read(), { code: "actions.forbidden" });
  assert.throws(() => f.artifacts.join!(savedRow!, () => {}), { code: "actions.forbidden" });
});

test("BSH-02 and BSH-03 · a swallowed CAS failure, async join and last-moment cancellation roll back both owners", async t => {
  const f = fixture(t), initial = f.source(), changes = f.homeChanges(), replicated = f.projectChanges(), cursor = f.project.eventCursor(projectId);
  const clean = (name: string) => {
    assert.deepEqual(f.source(), initial);
    assert.equal(f.homeChanges(), changes);
    assert.equal(f.projectChanges(), replicated);
    assert.equal(f.project.eventCursor(projectId), cursor);
    assert.equal(f.version(name), null);
  };
  await assert.rejects(f.run(() => f.database.transaction(async () => {}, tx => f.artifacts.join!(tx, writer => writer.publish(f.put("ordinary-home"))))), { code: "actions.forbidden" });
  clean("ordinary-home");
  await assert.rejects(f.run(() => f.database.transactionProjectRow!(otherId, row => {
    assert.equal(row.read(), null);
    f.artifacts.join!(row, writer => writer.publish(f.put("foreign-row", otherId)));
    assert.equal(row.compareAndSet(1, {}), false);
  })), { code: "actions.conflict" });
  clean("foreign-row");
  await assert.rejects(f.run(() => f.database.transactionProjectRow!(id, row => {
    assert.throws(() => f.artifacts.join!(row, async writer => writer.publish(f.put("async-pin"))), { code: "actions.async_required" });
    assert.equal(row.compareAndSet(1, {}), true);
  })), { code: "actions.conflict" });
  clean("async-pin");
  await assert.rejects(f.run(() => f.database.transactionProjectRow!(id, row => {
    f.artifacts.join!(row, writer => Object.defineProperty({}, "then", { get() {
      assert.throws(() => writer.publish(f.put("late-writer")), { code: "actions.forbidden" });
      return undefined;
    } }));
    return Object.defineProperty({}, "then", { get() {
      assert.throws(() => f.artifacts.join!(row, writer => writer.publish(f.put("late-row"))), { code: "actions.forbidden" });
      return undefined;
    } });
  })), { code: "actions.conflict" });
  clean("late-writer");
  clean("late-row");
  await assert.rejects(f.run(() => f.database.transactionProjectRow!(id, row => {
    f.artifacts.join!(row, writer => writer.publish(f.put("uncloneable")));
    assert.equal(row.compareAndSet(1, {}), true);
    return () => {};
  })), { name: "DataCloneError" });
  clean("uncloneable");
  await assert.rejects(f.run(() => f.database.transactionProjectRow!(id, row => {
    f.artifacts.join!(row, writer => writer.publish(f.put("cancel-pin")));
    assert.equal(row.compareAndSet(1, {}), true);
    f.abort.abort();
  })), { name: "AbortError" });
  clean("cancel-pin");
});

test("BSH-02 · beforeEffect belongs to the trusted action and a replaced installation never opens the join", async t => {
  const f = fixture(t), initial = f.source();
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const result = f.run(() => f.database.transactionProjectRow!(id, () => assert.fail("revoked before the transaction")), {
    beforeEffect: async () => { entered.resolve(); await release.promise; },
  });
  await entered.promise;
  f.install.installation_generation = "replacement";
  release.resolve();
  await assert.rejects(result, { code: "actions.forbidden" });
  assert.deepEqual(f.source(), initial);
});

test("BSH-02 · a declared collation or unique conflict cannot write or delete a different root row", async t => {
  const f = fixture(t, sql => sql
    .replace("id TEXT PRIMARY KEY", "id TEXT PRIMARY KEY COLLATE NOCASE")
    .replace("project_id TEXT NOT NULL DEFAULT ''", "project_id TEXT NOT NULL DEFAULT '' COLLATE NOCASE")
    .replace("updated_at TEXT NOT NULL", "updated_at TEXT NOT NULL UNIQUE ON CONFLICT REPLACE"));
  f.library.prepare("UPDATE datasets SET project_id=? WHERE id=?").run(projectId.toUpperCase(), id);
  const state = () => [f.source(), f.homeChanges(), f.projectChanges(), f.project.eventCursor(projectId)];
  const wrongCase = state();
  await assert.rejects(f.run(() => f.database.transactionProjectRow!(id, row => {
    assert.equal(row.read(), null);
    f.artifacts.join!(row, writer => writer.publish(f.put("wrong-case")));
    assert.equal(row.compareAndSet(1, {}), false);
  })), { code: "actions.conflict" });
  assert.deepEqual(state(), wrongCase);
  assert.equal(f.version("wrong-case"), null);

  f.library.prepare("UPDATE datasets SET project_id=?, id=? WHERE id=?").run(projectId, id.toUpperCase(), id);
  const wrongIdCase = state();
  await assert.rejects(f.run(() => f.database.transactionProjectRow!(id, row => {
    assert.equal(row.read(), null);
    f.artifacts.join!(row, writer => writer.publish(f.put("wrong-id-case")));
    assert.equal(row.compareAndSet(1, {}), false);
  })), { code: "actions.conflict" });
  assert.deepEqual(state(), wrongIdCase);
  assert.equal(f.version("wrong-id-case"), null);

  f.library.prepare("UPDATE datasets SET id=? WHERE id=?").run(id, id.toUpperCase());
  const conflict = state();
  await assert.rejects(f.run(() => f.database.transactionProjectRow!(id, row => {
    assert.equal(row.read()?.version, 1);
    f.artifacts.join!(row, writer => writer.publish(f.put("replace-conflict")));
    row.compareAndSet(1, { updated_at: otherAt });
  })), /UNIQUE constraint failed/u);
  assert.deepEqual(state(), conflict);
  assert.equal(f.version("replace-conflict"), null);
});

test("BSH-02 · the owner declaration permits foreign keys to the immutable ID and refuses mutable foreign-key targets", () => {
  const checked = (reference: string) => withRoot(sql => sql + `CREATE TABLE history (source TEXT REFERENCES DATASETS(${reference}) ON UPDATE CASCADE);`);
  assert.ok(projectArtifactRoot(checked("id"), datasetManifest.plugin_id));
  const mutable = withRoot(sql => sql.replace("artifact_id TEXT NOT NULL", "artifact_id TEXT UNIQUE NOT NULL")
    + "CREATE TABLE history (source TEXT REFERENCES DATASETS(ARTIFACT_ID) ON UPDATE CASCADE);");
  assert.throws(() => projectArtifactRoot(mutable, datasetManifest.plugin_id), { code: "plugin.declaration_invalid" });
});
