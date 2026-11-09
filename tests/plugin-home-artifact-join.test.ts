import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginArtifactClient, PluginArtifactPublishInput, PluginArtifactWriter, PluginDatabase,
  PluginProjectRowTransaction } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginSyncNamespace } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { homeSqlitePath, openSqliteConnection } from "@molis-ai/molis-work-storage";
import { pinnedArtifact } from "./fixtures/artifacts.js";
import { openTestHome } from "./fixtures/test-home.js";
import { probeAction, registerProbe } from "./fixtures/plugin-home-artifact-probe.js";

const id = "dataset-a", otherId = "dataset-b", at = "2026-11-09T18:00:00Z", otherAt = "2026-11-09T18:00:01Z";
const isolationSchema = (sql: string) => sql
  .replace("id TEXT PRIMARY KEY", "id TEXT PRIMARY KEY COLLATE NOCASE")
  .replace("project_id TEXT NOT NULL DEFAULT ''", "project_id TEXT NOT NULL DEFAULT '' COLLATE NOCASE")
  .replace("updated_at TEXT NOT NULL", "updated_at TEXT NOT NULL UNIQUE ON CONFLICT REPLACE")
  + "CREATE TABLE history (source TEXT REFERENCES DATASETS(ID) ON UPDATE CASCADE);";

async function fixture(t: TestContext) {
  let body: (() => unknown) | undefined;
  let services: { database: PluginDatabase; artifacts: PluginArtifactClient } | undefined;
  let insideAction = false;
  const manifest = registerProbe(t, async () => {
    assert.ok(body);
    insideAction = true;
    try { return await body(); } finally { insideAction = false; }
  }, context => {
    const { database, artifacts } = context.services ?? {};
    assert.ok(database?.transactionProjectRow && artifacts?.join);
    services = { database, artifacts };
  }, isolationSchema);
  const home = await openTestHome(t);
  const selected = await home.createProject("Artifact row fixture"), projectId = selected.project_id;
  const person = await home.host.localPersonContext(selected.reference);
  assert.ok(services);
  const project = await home.host.withProject(selected.reference, runtime => runtime.store);
  const library = openSqliteConnection(homeSqlitePath(home.home, "dataset"), { fileMustExist: true });
  t.after(() => library.close());
  const insert = library.prepare("INSERT INTO datasets (id, project_id, title, description, status, columns_json, rows_json, created_at, updated_at, version) VALUES (?, ?, ?, '', 'draft', '[]', '[]', ?, ?, 1)");
  insert.run(id, projectId, "Owned", at, at);
  insert.run(otherId, "other-project", "Other", otherAt, otherAt);

  const ports = { db: project.db, appendEvent: project.appendEvent.bind(project), eventCursor: project.eventCursor.bind(project) };
  const artifacts = new ArtifactsModule(ports);
  const source = () => library.prepare("SELECT id, project_id, artifact_id, artifact_version, version FROM datasets ORDER BY id").all();
  const sync = pluginSyncNamespace(manifest, manifest.sync!.collections[0]!.id);
  const homeChanges = () => library.prepare<[], { n: number }>(`SELECT count(*) AS n FROM ${sync}_replica_changes`).get()!.n;
  const projectChanges = () => project.db.prepare<[], { n: number }>("SELECT count(*) AS n FROM artifacts_replica_changes").get()!.n;
  const abort = new AbortController();
  const actions = home.host.actionClient(selected.reference);
  const run = <T>(write: () => T, duringBeforeEffect?: () => Promise<void>) => {
    body = write;
    const caller: ActionCallContext = { ...person, actor_id: "original-author", audit_actor_id: "different-audit-actor", signal: abort.signal,
      ...(duringBeforeEffect ? { validate_authority: async reference => {
        await person.validate_authority?.(reference);
        if (insideAction) await duringBeforeEffect();
      } } : {}),
    };
    return actions.invoke(caller, probeAction, {}) as Promise<Awaited<T>>;
  };
  const put = (name: string, subject = id, revision = 1): PluginArtifactPublishInput => ({ artifact_id: name, version: 1,
    artifact_type_id: manifest.artifacts.produces[0]!.artifact_type_id, schema_version: 1, content: { kind: "inline", payload: { name } },
    ...pinnedArtifact(name, { kind: "dataset", id: subject }, String(revision)) });
  const replaceInstallation = () => {
    const installs = new SqlitePluginRuntimeRepository(project.db);
    const install = installs.list().find(record => record.plugin_id === manifest.plugin_id);
    assert.ok(install);
    installs.save({ ...install, installation_generation: "replacement" });
  };
  return { ...services, source, homeChanges, projectChanges, project, projectId, run, put, abort, replaceInstallation,
    version: (name: string) => artifacts.query.latestArtifactVersion(projectId, name), library };
}

test("BSH-02 and BSH-03 · a Home row, new artifact, event and replication commit together with original author", async t => {
  const f = await fixture(t), { projectId } = f, changes = f.homeChanges(), replicated = f.projectChanges(), cursor = f.project.eventCursor(projectId);
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
  await assert.rejects(f.run(() => f.database.transactionProjectRow!(id, row => {
    assert.throws(() => f.artifacts.join!(row, writer => writer.publish(f.put("real-pin"))), { code: "actions.conflict" });
    return { ok: true };
  })), { code: "actions.conflict" });
  assert.equal(f.homeChanges(), changes + 1);
  assert.equal(f.projectChanges(), replicated + 2);
  assert.equal(f.project.eventCursor(projectId), cursor + 1);
});

test("BSH-02 and BSH-03 · a swallowed CAS failure, async join and last-moment cancellation roll back both owners", async t => {
  const f = await fixture(t), { projectId } = f, initial = f.source(), changes = f.homeChanges(), replicated = f.projectChanges(), cursor = f.project.eventCursor(projectId);
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
  const f = await fixture(t), initial = f.source();
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const result = f.run(() => f.database.transactionProjectRow!(id, () => assert.fail("revoked before the transaction")), async () => {
    entered.resolve();
    await release.promise;
  });
  const refused = assert.rejects(result, { code: "actions.forbidden" });
  try {
    await Promise.race([entered.promise, refused.then(() => assert.fail("the original action never reached its write gate"))]);
    f.replaceInstallation();
  } finally { release.resolve(); }
  await refused;
  assert.deepEqual(f.source(), initial);
});

test("BSH-02 · a declared collation or unique conflict cannot write or delete a different root row", async t => {
  const f = await fixture(t), { projectId } = f;
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
