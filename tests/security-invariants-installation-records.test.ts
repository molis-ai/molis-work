import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { DEMO_PROJECT_ID, HomePluginHost, readOriginalFile, registerOriginalFile, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginBindingScope } from "@molis-ai/molis-work-service-connector-host";
import { ownerFilesProbe, ownerFilesProject } from "./fixtures/plugin-owner-files.js";

/**
 * BL-356: what the Host keeps in the Home beside an installation's data (the original files it registered, S-45, and the accounts bound to
 * its records, S-71) goes when the data goes, for that installation in that project (or its Home-level activation), on both paths where the
 * data goes: an uninstall that keeps nothing, and a reinstall where the person drops what an uninstall kept. Nothing of another project
 * (whose id is a prefix of this one's), another installation or the shared installation slot is touched.
 */
function rows(t: test.TestContext) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "installation-records-")));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const file = join(home, "chosen.txt");
  writeFileSync(file, "the person's file");
  const bearer = "fixture-bearer-value-bl356";
  const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "GitHub", token: bearer }));
  type Original = { plugin_id: string; install_id: string; project_id: string | null; record_key: string };
  const original = (key: Original) => registerOriginalFile(home, key, file, async () => {});
  const readable = async (key: Original) => readOriginalFile(home, key, {}).then(() => true, (error: { code?: string }) => {
    assert.equal(error.code, "material.original.not_registered"); return false;
  });
  const bind = (pluginId: string, scope: string, slot: string) =>
    withConnectorConnections(home, store => store.bind({ scopeId: scope, pluginId, slotId: slot, serviceId: "github", connectionId: connection.connection_id }));
  const bound = (pluginId: string, scope: string, slot: string) => withConnectorConnections(home, store => store.binding(scope, pluginId, slot)) !== null;
  return { home, original, readable, bind, bound };
}

test("S-45 S-71 RAC-472 a project's installation that drops its data takes its original files and record accounts there with it, and nothing of another project, installation or the installation slot", { timeout: 60_000 }, async t => {
  const r = rows(t), probe = ownerFilesProbe("recordsproject", "project"), other = ownerFilesProbe("recordsother", "project");
  const project = ownerFilesProject(r.home, probe);
  t.after(() => project.close());
  const runtime = project.platform.runtime, definition = probe.withoutFiles();
  const install = (discard = false) => runtime.install({ trust: { level: "unsigned" }, definition: { ...definition }, deployment: "local", ...(discard ? { discard_kept_data: true } : {}) }).install;
  const install_id = install().install_id, otherInstall = runtime.install({ trust: { level: "unsigned" }, definition: other.withoutFiles(), deployment: "local" }).install.install_id;
  const neighbour = DEMO_PROJECT_ID + "0";
  const mine = { plugin_id: probe.id, install_id, project_id: DEMO_PROJECT_ID, record_key: "doc" };
  const kept = [{ ...mine, project_id: neighbour }, { ...mine, project_id: null }, { plugin_id: other.id, install_id: otherInstall, project_id: DEMO_PROJECT_ID, record_key: "doc" }];
  const record = pluginBindingScope({ install_id, project_id: DEMO_PROJECT_ID, record_key: "src-1" });
  const keptBindings: Array<[string, string, string]> = [[probe.id, pluginBindingScope({ install_id, project_id: neighbour, record_key: "src-1" }), "feed"],
    [probe.id, pluginBindingScope({ install_id }), "account"], [other.id, pluginBindingScope({ install_id: otherInstall, project_id: DEMO_PROJECT_ID, record_key: "src-1" }), "feed"]];
  const seed = async () => { await r.original(mine); r.bind(probe.id, record, "feed"); };
  for (const key of kept) await r.original(key);
  for (const [pluginId, scope, slot] of keptBindings) r.bind(pluginId, scope, slot);
  const othersUntouched = async (when: string) => {
    for (const key of kept) assert.equal(await r.readable(key), true, `${when}: ${JSON.stringify(key)}`);
    for (const [pluginId, scope, slot] of keptBindings) assert.equal(r.bound(pluginId, scope, slot), true, `${when}: ${scope}`);
  };

  await seed();
  await runtime.uninstall(install_id, { retain_private_data: true });
  assert.equal(await r.readable(mine), true, "an uninstall that keeps the data keeps what lies beside it");
  assert.equal(r.bound(probe.id, record, "feed"), true);
  assert.equal(install(true).install_id, install_id, "the same installation id comes back");
  assert.equal(await r.readable(mine), false, "dropping the kept data on reinstall drops the original file's registration");
  assert.equal(r.bound(probe.id, record, "feed"), false, "and the account bound to its record here");
  await othersUntouched("after the discarding reinstall");

  await seed();
  await runtime.uninstall(install_id, { retain_private_data: false });
  assert.equal(await r.readable(mine), false, "an uninstall that keeps nothing takes the registration");
  assert.equal(r.bound(probe.id, record, "feed"), false, "and the record's account");
  install();
  assert.equal(await r.readable(mine), false, "a reinstall under the same id reads none of it back");
  await othersUntouched("after the uninstall that kept nothing");
});

test("S-45 RAC-473 a Home installation that drops its data takes its Home-level original files with it, and no project's", { timeout: 60_000 }, async t => {
  const r = rows(t), probe = ownerFilesProbe("recordshome", "home"), actions = new ActionService();
  const host = new HomePluginHost({ home: r.home, actorId: LOCAL_PERSON_ACTOR_ID, registry: actions, client: actions, entries: [], fixtures: [] });
  t.after(() => host.close());
  const runtime = (await host.ready()).runtime, definition = probe.withoutFiles();
  const install = (discard = false) => runtime.install({ trust: { level: "unsigned" }, definition: { ...definition }, deployment: "local", ...(discard ? { discard_kept_data: true } : {}) }).install;
  const install_id = install().install_id;
  const mine = { plugin_id: probe.id, install_id, project_id: null, record_key: "doc" }, project = { ...mine, project_id: DEMO_PROJECT_ID };
  await r.original(project);

  await r.original(mine);
  await runtime.uninstall(install_id, { retain_private_data: true });
  assert.equal(await r.readable(mine), true, "an uninstall that keeps the data keeps the registration");
  install(true);
  assert.equal(await r.readable(mine), false, "dropping the kept data on reinstall drops it");

  await r.original(mine);
  await runtime.uninstall(install_id, { retain_private_data: false });
  assert.equal(await r.readable(mine), false, "an uninstall that keeps nothing drops it");
  install();
  assert.equal(await r.readable(mine), false, "a reinstall under the same id reads none of it back");
  // The same installation id in a project is that project's instance: its registrations go with its own uninstall or the project.
  assert.equal(await r.readable(project), true);
});
