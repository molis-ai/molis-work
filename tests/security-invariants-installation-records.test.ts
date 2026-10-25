import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { DEMO_PROJECT_ID, HomePluginHost, readOriginalFile, registerOriginalFile, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginBindingScope } from "@molis-ai/molis-work-service-connector-host";
import { ownerFilesProbe, ownerFilesProject } from "./fixtures/plugin-owner-files.js";

// BL-356, RAC-472/473: registrations and record bindings are authorization. Every uninstall drops the current installation's
// authorization in its activation scope, even when its private data is kept. Original files and accounts themselves stay.
function rows(t: test.TestContext) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "installation-records-")));
  t.after(() => rmSync(home, { recursive: true, force: true }));
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
  return { home, original, readable, bind, bound, contentsUnchanged };
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
    t.after(() => project.close());
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
    t.after(() => host.close());
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
