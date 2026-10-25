import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { DEMO_PROJECT_ID, HomePluginHost, readOriginalFile, registerOriginalFile, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginBindingScope } from "@molis-ai/molis-work-service-connector-host";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { ownerFilesProbe, ownerFilesProject } from "./fixtures/plugin-owner-files.js";

// BL-356, RAC-472/473: registrations and record bindings are authorization. Every uninstall drops the current installation's
// authorization in its activation scope, even when its private data is kept. Original files and accounts themselves stay.
function rows(t: test.TestContext) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "installation-records-")));
  let close: () => void | Promise<void> = () => {};
  t.after(async () => { try { await close(); } finally { rmSync(home, { recursive: true, force: true }); } });
  const file = join(home, "chosen.txt"), content = "the person's file";
  writeFileSync(file, content);
  const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "GitHub", token: randomUUID() }));
  type Original = { plugin_id: string; install_id: string; project_id: string | null; record_key: string };
  const original = (key: Original) => registerOriginalFile(home, key, file, async () => {});
  const readable = async (key: Original) => readOriginalFile(home, key, {}).then(() => true, (error: { code?: string }) => {
    assert.equal(error.code, "material.original.not_registered"); return false;
  });
  const bind = (pluginId: string, scope: string, slot: string) =>
    withConnectorConnections(home, store => store.bind({ scopeId: scope, pluginId, slotId: slot, serviceId: "github", connectionId: connection.connection_id }));
  const bound = (pluginId: string, scope: string, slot: string) => withConnectorConnections(home, store => store.binding(scope, pluginId, slot)) !== null;
  const contentsUnchanged = () => {
    assert.equal(readFileSync(file, "utf8"), content, "unregistering a file does not delete or alter the person's file");
    assert.deepEqual(withConnectorConnections(home, store => store.get(connection.connection_id)), connection, "the account and its credential remain");
  };
  return { home, original, readable, bind, bound, contentsUnchanged, closeBeforeRemove: (operation: () => void | Promise<void>) => { close = operation; } };
}

/** Fail the real owner's DELETE without changing its data or mocking a lifecycle hook. */
function failAuthorizationDelete(t: test.TestContext, home: string, point: "original" | "binding") {
  const file = homeSqlitePath(home, point === "original" ? "plugin-originals" : "connectors");
  const table = point === "original" ? "plugin_original_files" : "connector_bindings";
  const execute = (sql: string) => { const db = new DatabaseSync(file); try { db.exec(sql); } finally { db.close(); } };
  execute(`CREATE TRIGGER refuse_authorization_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, 'injected authorization deletion failure'); END`);
  let active = true;
  const release = () => { if (active && existsSync(file)) execute("DROP TRIGGER refuse_authorization_delete"); active = false; };
  t.after(release);
  return release;
}

for (const execution of ["native", "sandbox"] as const) {
  test(`S-45 S-71 RAC-472 a project's uninstall drops its authorizations regardless of retained private data (${execution})`, { timeout: 60_000 }, async t => {
    const r = rows(t), probe = ownerFilesProbe("recordsproject" + execution, "project"), other = ownerFilesProbe("recordsother" + execution, "project");
    if (execution === "sandbox") { probe.definition.execution = "sandbox"; other.definition.execution = "sandbox"; }
    const valuesOnStart: unknown[] = [], marker = "kept private record";
    probe.behavior.start = context => {
      const storage = context.services!.storage!, previous = storage.get("private-marker");
      valuesOnStart.push(previous);
      if (previous === null || previous === undefined) storage.set("private-marker", marker);
    };
    const project = ownerFilesProject(r.home, probe);
    r.closeBeforeRemove(() => project.close());
    const runtime = project.platform.runtime, definition = probe.withoutFiles();
    const install = async (discard = false) => {
      const record = runtime.install({ trust: { level: "unsigned" }, definition: { ...definition }, deployment: "local", grants: probe.permissions,
        ...(discard ? { discard_kept_data: true } : {}) }).install;
      await runtime.start(record.install_id); return record;
    };
    const install_id = (await install()).install_id;
    const otherInstall = runtime.install({ trust: { level: "unsigned" }, definition: other.withoutFiles(), deployment: "local", grants: other.permissions }).install.install_id;
    const mine = { plugin_id: probe.id, install_id, project_id: DEMO_PROJECT_ID, record_key: "doc" };
    const kept = [{ ...mine, project_id: DEMO_PROJECT_ID + "0" }, { ...mine, project_id: "x" + DEMO_PROJECT_ID }, { ...mine, project_id: null },
      { ...mine, install_id: install_id + "0" }, { plugin_id: other.id, install_id: otherInstall, project_id: DEMO_PROJECT_ID, record_key: "doc" }];
    const record = pluginBindingScope({ install_id, project_id: DEMO_PROJECT_ID, record_key: "src-1" });
    const keptBindings: Array<[string, string, string]> = [
      ...[DEMO_PROJECT_ID + "0", "x" + DEMO_PROJECT_ID].map(project_id => [probe.id, pluginBindingScope({ install_id, project_id, record_key: "src-1" }), "feed"] as [string, string, string]),
      [probe.id, pluginBindingScope({ install_id }), "account"], [probe.id, pluginBindingScope({ install_id: install_id + "0", project_id: DEMO_PROJECT_ID, record_key: "src-1" }), "feed"],
      [other.id, pluginBindingScope({ install_id: otherInstall, project_id: DEMO_PROJECT_ID, record_key: "src-1" }), "feed"],
    ];
    const seed = async () => { await r.original(mine); r.bind(probe.id, record, "feed"); };
    for (const key of kept) await r.original(key);
    for (const [pluginId, scope, slot] of keptBindings) r.bind(pluginId, scope, slot);
    const othersUntouched = async (when: string) => {
      for (const key of kept) assert.equal(await r.readable(key), true, `${when}: ${JSON.stringify(key)}`);
      for (const [pluginId, scope, slot] of keptBindings) assert.equal(r.bound(pluginId, scope, slot), true, `${when}: ${scope}`);
      r.contentsUnchanged();
    };
    const revoked = async (when: string) => {
      assert.equal(await r.readable(mine), false, `${when}: the old original-file grant is rejected`);
      assert.equal(r.bound(probe.id, record, "feed"), false, `${when}: the old record binding is gone`);
      await othersUntouched(when);
    };

    await seed();
    await runtime.uninstall(install_id, { retain_private_data: true });
    await revoked("after retaining uninstall");
    assert.equal((await install()).install_id, install_id);
    assert.equal(valuesOnStart.at(-1), marker, "the kept private KV still belongs to the reinstall");
    await revoked("after retaining reinstall without a new selection or binding");

    await runtime.uninstall(install_id, { retain_private_data: true });
    // Residual rows from an older build also exercise keptDataDiscarded independently of the corrected uninstall hook.
    await seed();
    assert.equal((await install(true)).install_id, install_id);
    await revoked("after discarding reinstall");

    await seed();
    await runtime.uninstall(install_id, { retain_private_data: false });
    await revoked("after non-retaining uninstall, before reinstall");
    await install();
    await revoked("after non-retaining reinstall");
  });

  test(`S-45 RAC-473 a Home uninstall drops only its original-file authorizations regardless of retained private data (${execution})`, { timeout: 60_000 }, async t => {
    const r = rows(t), probe = ownerFilesProbe("recordshome" + execution, "home"), other = ownerFilesProbe("otherhome" + execution, "home"), actions = new ActionService();
    if (execution === "sandbox") { probe.definition.execution = "sandbox"; other.definition.execution = "sandbox"; }
    const valuesOnStart: unknown[] = [], marker = "kept Home private record";
    probe.behavior.start = context => {
      const storage = context.services!.storage!, previous = storage.get("private-marker");
      valuesOnStart.push(previous);
      if (previous === null || previous === undefined) storage.set("private-marker", marker);
    };
    const host = new HomePluginHost({ home: r.home, actorId: LOCAL_PERSON_ACTOR_ID, registry: actions, client: actions, entries: [], fixtures: [] });
    r.closeBeforeRemove(() => host.close());
    const runtime = (await host.ready()).runtime, definition = probe.withoutFiles();
    const install = async (discard = false) => {
      const record = runtime.install({ trust: { level: "unsigned" }, definition: { ...definition }, deployment: "local", grants: probe.permissions,
        ...(discard ? { discard_kept_data: true } : {}) }).install;
      await runtime.start(record.install_id); return record;
    };
    const install_id = (await install()).install_id;
    const otherInstall = runtime.install({ trust: { level: "unsigned" }, definition: other.withoutFiles(), deployment: "local", grants: other.permissions }).install.install_id;
    const mine = { plugin_id: probe.id, install_id, project_id: null, record_key: "doc" };
    const kept = [{ ...mine, project_id: DEMO_PROJECT_ID }, { ...mine, project_id: DEMO_PROJECT_ID + "0" }, { ...mine, install_id: install_id + "0" },
      { ...mine, plugin_id: other.id, install_id: otherInstall }];
    const bindings: Array<[string, string, string]> = [
      [probe.id, pluginBindingScope({ install_id, project_id: DEMO_PROJECT_ID, record_key: "src-1" }), "feed"],
      [probe.id, pluginBindingScope({ install_id, project_id: DEMO_PROJECT_ID + "0", record_key: "src-1" }), "feed"],
      [probe.id, pluginBindingScope({ install_id }), "account"],
      [other.id, pluginBindingScope({ install_id: otherInstall }), "account"],
    ];
    for (const key of kept) await r.original(key);
    for (const [pluginId, scope, slot] of bindings) r.bind(pluginId, scope, slot);
    const revoked = async (when: string) => {
      assert.equal(await r.readable(mine), false, `${when}: the Home original-file grant is rejected`);
      for (const key of kept) assert.equal(await r.readable(key), true, `${when}: ${JSON.stringify(key)}`);
      for (const [pluginId, scope, slot] of bindings) assert.equal(r.bound(pluginId, scope, slot), true, `${when}: BL-596 keeps ${scope}`);
      r.contentsUnchanged();
    };

    await r.original(mine);
    await runtime.uninstall(install_id, { retain_private_data: true });
    await revoked("after retaining Home uninstall");
    await install();
    assert.equal(valuesOnStart.at(-1), marker, "Home private KV survives the retaining uninstall");
    await revoked("after retaining Home reinstall");

    await runtime.uninstall(install_id, { retain_private_data: true });
    await r.original(mine);
    await install(true);
    await revoked("after discarding Home reinstall");

    await r.original(mine);
    await runtime.uninstall(install_id, { retain_private_data: false });
    await revoked("after non-retaining Home uninstall");
    await install();
    await revoked("after non-retaining Home reinstall");
  });
}

for (const scope of ["project", "home"] as const) for (const execution of ["native", "sandbox"] as const) {
  const points: Array<"original" | "binding"> = scope === "project" ? ["original", "binding"] : ["original"];
  for (const point of points) test(`S-45 ${scope === "project" ? "S-71 RAC-472" : "RAC-473"} retaining reinstall refuses failed authorization deletion in the same and a new Runtime (${scope}, ${execution}, ${point})`, { timeout: 60_000 }, async t => {
    const r = rows(t), probe = ownerFilesProbe(`fault${scope}${execution}${point}`, scope);
    if (execution === "sandbox") probe.definition.execution = "sandbox";
    const valuesOnStart: unknown[] = [], marker = "private data survives authorization cleanup failures";
    probe.behavior.start = context => {
      const storage = context.services!.storage!, previous = storage.get("private-marker");
      valuesOnStart.push(previous);
      if (previous === null || previous === undefined) storage.set("private-marker", marker);
    };
    let project: ReturnType<typeof ownerFilesProject> | undefined, projectFile: string | undefined, host: HomePluginHost | undefined;
    const open = async () => {
      if (scope === "project") { project = ownerFilesProject(r.home, probe, projectFile ? { file: projectFile } : {}); projectFile = project.file; return project.platform.runtime; }
      const actions = new ActionService();
      host = new HomePluginHost({ home: r.home, actorId: LOCAL_PERSON_ACTOR_ID, registry: actions, client: actions, entries: [], fixtures: [] });
      return (await host.ready()).runtime;
    };
    const close = async () => { if (project) { await project.close(); project = undefined; } if (host) { await host.close(); host = undefined; } };
    r.closeBeforeRemove(close);
    let runtime = await open();
    const definition = probe.withoutFiles(), install = () => runtime.install({ trust: { level: "unsigned" }, definition: { ...definition }, deployment: "local", grants: probe.permissions }).install;
    const first = install(), install_id = first.install_id;
    await runtime.start(install_id);
    const mine = { plugin_id: probe.id, install_id, project_id: scope === "project" ? DEMO_PROJECT_ID : null, record_key: "doc" };
    const kept = { ...mine, project_id: DEMO_PROJECT_ID + "0" };
    await r.original(mine); await r.original(kept);
    const ownRecord = pluginBindingScope({ install_id, project_id: DEMO_PROJECT_ID, record_key: "doc" });
    if (scope === "project") r.bind(probe.id, ownRecord, "feed");
    const keptBindings = [pluginBindingScope({ install_id }), pluginBindingScope({ install_id, project_id: scope === "home" ? DEMO_PROJECT_ID : DEMO_PROJECT_ID + "0", record_key: "doc" })];
    for (const binding of keptBindings) r.bind(probe.id, binding, "account");
    const release = failAuthorizationDelete(t, r.home, point);
    await assert.rejects(() => runtime.uninstall(install_id, { retain_private_data: true }), /injected authorization deletion failure/);
    const removed = runtime.get(install_id);
    assert.equal(removed.state, "uninstalled"); assert.equal(removed.retain_private_data, true);
    assert.equal(await r.readable(mine), point === "original", "a binding failure follows a committed original-file revocation");
    if (scope === "project") assert.equal(r.bound(probe.id, ownRecord, "feed"), true, "the failed binding deletion leaves a real residual authorization");
    const refuses = () => {
      assert.throws(install, { code: "plugin.executor_failed" }, "cleanup must fail before publishing a new installation");
      assert.deepEqual(runtime.get(install_id), removed, "failure preserves the uninstalled row and its generation");
      assert.equal(runtime.contribution(install_id), null, "the failed reinstall exposes no contribution");
    };
    refuses();
    await close(); runtime = await open();
    assert.deepEqual(runtime.get(install_id), removed, "a new Runtime reads the same failed-uninstall state");
    refuses();
    release();
    const again = install();
    assert.equal(again.install_id, install_id); assert.notEqual(again.installation_generation, first.installation_generation);
    await runtime.start(install_id);
    assert.equal(valuesOnStart.at(-1), marker, "authorization cleanup and its retries never discard the private KV");
    assert.equal(await r.readable(mine), false, "the running reinstall cannot reuse the old file selection");
    if (scope === "project") assert.equal(r.bound(probe.id, ownRecord, "feed"), false, "the running reinstall has no old record binding");
    assert.equal(await r.readable(kept), true);
    for (const binding of keptBindings) assert.equal(r.bound(probe.id, binding, "account"), true, "shared slots and Home project bindings survive recovery");
    r.contentsUnchanged();
  });
}
