import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { openMolisWorkProjectCatalog, openDesktopProjectDeletionRecoveryTarget } from "@molis-ai/molis-work-app-desktop";
import { CONNECTORS_BASELINE, openProjectDeletionRecoveryInspection, openProjectDeletionCatalogObservation, projectDeletedHooksFor, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { pluginBindingScope } from "@molis-ai/molis-work-service-connector-host";
import { homeSqlitePath, openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import { homeStorageTree } from "./fixtures/home-storage-files.js";

const current = { assertCurrent() {} }, pluginId = "io.test.maintenance", slotId = "records";
const scope = (project: string, install = "first") => pluginBindingScope({ install_id: install, project_id: project, record_key: "record" });
const selected = [scope("gone"), scope("gone", "second")];
const kept = [scope("gone-extra"), pluginBindingScope({ install_id: "first" })];
function homeFor(t: TestContext) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "molis-connector-maintenance-")));
  t.after(() => rmSync(home, { recursive: true, force: true })); return home;
}
function seed(home: string) {
  withConnectorConnections(home, store => {
    const account = store.saveCli({ serviceId: "synthetic", displayName: "synthetic", externalId: "synthetic", accountLabel: "synthetic" });
    for (const scopeId of [...selected, ...kept]) store.bind({ scopeId, pluginId, slotId, serviceId: "synthetic", connectionId: account.connection_id });
  });
}
function bindings(home: string) {
  return withConnectorConnections(home, store => ({ selected: selected.map(id => !!store.binding(id, pluginId, slotId)),
    kept: kept.map(id => !!store.binding(id, pluginId, slotId)), accounts: store.list().length }));
}
const intact = { selected: [true, true], kept: [true, true], accounts: 1 };

for (const controlled of [true, false]) test(`S-71 ${controlled ? "maintenance preserves project scope" : "direct cleanup sweeps unheld installations"} and preserves accounts`, async t => {
  const home = homeFor(t); seed(home);
  assert.equal(await projectDeletedHooksFor(home).clear("plugin-connections", "gone", undefined, controlled ? current : undefined), true);
  assert.deepEqual(bindings(home), { selected: [false, false], kept: controlled ? [true, true] : [false, false], accounts: 1 });
  assert.equal(existsSync(join(home, "feed")), false, "binding cleanup never creates or reads a secret store");
});

for (const redirect of ["database", "ancestor", "hardlink", "wal", "shm", "journal"] as const) {
  test(`S-71 maintenance refuses ${redirect} redirection without deleting source bindings`, async t => {
    const root = homeFor(t), source = join(root, "source"), target = join(root, "target");
    mkdirSync(source); mkdirSync(target); seed(source);
    const sourceDb = homeSqlitePath(source, "connectors"), targetDb = homeSqlitePath(target, "connectors");
    if (redirect === "ancestor") symlinkSync(join(source, "connectors"), join(target, "connectors"));
    else {
      mkdirSync(join(target, "connectors"));
      if (redirect === "database") symlinkSync(sourceDb, targetDb);
      else if (redirect === "hardlink") linkSync(sourceDb, targetDb);
      else { openBaselineHomeSqlite(target, "connectors", CONNECTORS_BASELINE).close(); symlinkSync(sourceDb, targetDb + "-" + redirect); }
    }
    const before = readFileSync(sourceDb);
    await assert.rejects(projectDeletedHooksFor(target).clear("plugin-connections", "gone", undefined, current), { code: "storage.maintenance_path" });
    assert.deepEqual(readFileSync(sourceDb), before); assert.deepEqual(bindings(source), intact);
  });
}

for (const shape of ["missing", "empty", "old-version", "unknown-structure"] as const) {
  test(`S-71 maintenance does not initialize or change permissions of ${shape} connectors storage`, async t => {
    const home = homeFor(t), path = homeSqlitePath(home, "connectors");
    if (shape !== "missing") {
      mkdirSync(join(home, "connectors"));
      if (shape === "empty") writeFileSync(path, "");
      else { const db = new DatabaseSync(path); db.exec(shape === "old-version" ? "PRAGMA user_version=1" : "PRAGMA user_version=2; CREATE TABLE unknown(value TEXT)"); db.close(); }
      chmodSync(path, 0o644);
    }
    const before = homeStorageTree(home);
    const clear = projectDeletedHooksFor(home).clear("plugin-connections", "gone", undefined, current);
    if (shape === "missing") assert.equal(await clear, true);
    else await assert.rejects(clear, { code: shape === "unknown-structure" ? "storage.schema_structure_mismatch" : "storage.schema_version_mismatch" });
    assert.deepEqual(homeStorageTree(home), before, "no creation, schema repair or chmod during controlled cleanup");
  });
}

test("S-71 maintenance rechecks authority after a real writer lock, preserving bindings until a newly authorized retry", async t => {
  const home = homeFor(t); seed(home);
  const path = homeSqlitePath(home, "connectors"), ready = join(home, "parent-entered"), revoked = join(home, "revoked");
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import {DatabaseSync} from 'node:sqlite';import {existsSync,writeFileSync} from 'node:fs';
    const [path,ready,revoked]=process.argv.slice(1),db=new DatabaseSync(path),sleep=ms=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);
    db.exec('BEGIN IMMEDIATE');process.stdout.write('held\\n');const deadline=Date.now()+5000;
    while(!existsSync(ready)){if(Date.now()>deadline)throw Error('parent did not enter');sleep(5);}
    sleep(40);writeFileSync(revoked,'revoked');sleep(180);db.exec('COMMIT');db.close();`, path, ready, revoked], { stdio: ["ignore", "pipe", "pipe"] });
  let diagnostics = ""; child.stderr!.on("data", data => { diagnostics += String(data); }); const finished = once(child, "exit");
  const denied = new Error("revoked while acquiring the original write lock");
  const exec = DatabaseSync.prototype.exec; let acquired = false;
  const interception = t.mock.method(DatabaseSync.prototype, "exec", function(this: DatabaseSync, sql: string) {
    if (sql === "BEGIN IMMEDIATE") writeFileSync(ready, "about to acquire the real lock");
    const result = exec.call(this, sql);
    if (sql === "BEGIN IMMEDIATE") acquired = true;
    return result;
  });
  try {
    await Promise.race([once(child.stdout!, "data"), finished.then(() => { throw new Error(diagnostics || "lock child exited early"); })]);
    await assert.rejects(projectDeletedHooksFor(home).clear("plugin-connections", "gone", undefined, { assertCurrent() {
      if (existsSync(revoked)) throw denied;
    } }), error => error === denied);
    assert.equal((await finished)[0], 0, diagnostics);
    assert.equal(acquired, true, "the refusal occurs after SQLite acquired the contended write lock");
  } finally { interception.mock.restore(); if (child.exitCode === null) { child.kill(); await finished; } }
  assert.deepEqual(bindings(home), intact);
  rmSync(revoked);
  await projectDeletedHooksFor(home).clear("plugin-connections", "gone", undefined, current);
  assert.deepEqual(bindings(home), { selected: [false, false], kept: [true, true], accounts: 1 });
});

test("S-71 maintenance rolls back the real binding DELETE when authority is lost before COMMIT", async t => {
  const home = homeFor(t); seed(home); let deleted = false;
  const prepare = DatabaseSync.prototype.prepare;
  const interception = t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) {
    const statement = prepare.call(this, sql);
    if (sql.startsWith("DELETE FROM connector_bindings")) {
      const run = statement.run.bind(statement);
      statement.run = (...args: unknown[]): ReturnType<typeof statement.run> => {
        const result = Reflect.apply(run, statement, args); deleted = true; return result;
      };
    }
    return statement;
  });
  const denied = new Error("revoked before commit");
  try {
    await assert.rejects(projectDeletedHooksFor(home).clear("plugin-connections", "gone", undefined, { assertCurrent() { if (deleted) throw denied; } }), error => error === denied);
  } finally { interception.mock.restore(); }
  assert.equal(deleted, true); assert.deepEqual(bindings(home), intact);
});


test("MEM-40 S-71 RAC-864: cold Catalog recovery clears only exact project records and never sweeps installation slots or initializes missing connectors", async t => {
  for (const populated of [true, false]) await t.test(populated ? "nonempty connectors" : "missing connectors", async t => {
    const home = homeFor(t), sourceHome = homeFor(t), projectId = `project-onboarding-${randomUUID()}`;
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    const sourceCatalog = await openMolisWorkProjectCatalog({ homeDirectory: sourceHome });
    const request = { project_id: projectId, actor_id: "test-user", delete_confirmed: true, idempotency_key: "source-deletion" };
    try {
      await catalog.createProject({ project_id: projectId, display_name: "恢复时精确清理", actor_id: request.actor_id });
      await sourceCatalog.createProject({ project_id: projectId, display_name: "原删除来源", actor_id: request.actor_id });
      const sourceReceipt = await sourceCatalog.deleteProject(request);
      assert.equal(sourceReceipt.deletion.cleanup_state, "complete");
      const exact = [scope(projectId), scope(projectId, "second")];
      const untouched = [scope(projectId + "-neighbour"), pluginBindingScope({ install_id: "first" }),
        pluginBindingScope({ install_id: "old-orphan" }), scope("old-unrelated-project", "old-orphan")];
      if (populated) withConnectorConnections(home, store => {
        const account = store.saveCli({ serviceId: "synthetic", displayName: "unchanged account", externalId: "synthetic", accountLabel: "synthetic" });
        for (const scopeId of [...exact, ...untouched]) store.bind({ scopeId, pluginId, slotId, serviceId: "synthetic", connectionId: account.connection_id });
      });
      const file = homeSqlitePath(home, "connectors");
      // Read-only observation cannot create the missing database or initialize a production store after cleanup.
      const read = () => {
        const db = new DatabaseSync(file, { readOnly: true });
        try { return { bindings: db.prepare("SELECT * FROM connector_bindings ORDER BY scope_id, plugin_id, slot_id").all(),
          accounts: db.prepare("SELECT * FROM connector_connections ORDER BY connection_id").all() }; }
        finally { db.close(); }
      };
      const before = populated ? read() : null;
      const observation = openProjectDeletionCatalogObservation({ homeDirectory: home, assertCurrent() {} });
      const source = await openProjectDeletionRecoveryInspection({ homeDirectory: sourceHome, assertCurrent() {} });
      const memory = projectDeletedHooksFor(home).owners().find(owner => owner.id === "memory")!;
      const marker = join(home, "recovery-targets.json");
      let checks = 0;
      let target: Awaited<ReturnType<typeof openDesktopProjectDeletionRecoveryTarget>> | undefined;
      try {
        target = await openDesktopProjectDeletionRecoveryTarget({ homeDirectory: home, source, groups: [], memory,
        assertCurrent() { checks++; }, async recordTargets(group) { writeFileSync(marker, JSON.stringify(group)); },
        catalogCommitted(change) { assert.deepEqual(observation.read(), change.after); } });
        const restored = await target.restore(sourceReceipt.deletion.deletion_id);
        assert.equal(restored.cleanup_state, "complete");
        assert.notEqual(restored.target_deletion_id, sourceReceipt.deletion.deletion_id);
        assert.equal(JSON.parse(readFileSync(marker, "utf8")).disposal.primary_target, restored.target_deletion_id);
        assert.ok(checks > 0, "the real cold-maintenance authority was exercised");
        assert.deepEqual(observation.read().projects, []);
        if (before) {
          const after = read();
          assert.deepEqual(after.bindings, before.bindings.filter(row => !exact.includes(String(row.scope_id))),
            "only this project's per_record rows go; installation slots, old orphans and prefix neighbours stay byte-for-field identical");
          assert.deepEqual(after.accounts, before.accounts, "no account is disabled, changed or removed");
        } else {
          assert.equal(existsSync(file), false);
          assert.equal(existsSync(join(home, "connectors")), false, "cold recovery must not create the absent connector directory");
        }
        assert.equal(existsSync(join(home, "feed")), false, "cold recovery never opens a secret store");
      } finally { await target?.close(); await source.close(); observation.close(); }
    } finally { catalog.close(); sourceCatalog.close(); }
  });
});
