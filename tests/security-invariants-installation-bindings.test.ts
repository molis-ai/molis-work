import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { captureHostLog, ProjectDeletionService, withConnectorConnections, type HostLogEntry } from "@molis-ai/molis-work-app-local-host";
import { pluginBindingScope } from "@molis-ai/molis-work-service-connector-host";
import { ownerFilesProbe, ownerFilesProject } from "./fixtures/plugin-owner-files.js";

// S-71 (docs/system/SECURITY-INVARIANTS.md; s57-connections-extension §4.2, BL-596): the accounts a plugin was bound to are the person's
// authorization for an installation. The installation's slots (`plugin-installation:<id>`, shared by every place the same identity is
// installed) and its record bindings under every project go with the LAST installation of that identity: asked of `heldInstalls`, the
// one reading of the Home's installations, where a place that keeps only private data no longer counts, a Home that cannot be read
// all the way through keeps the bindings, and a binding no installation holds goes when a project is deleted.

const PROBE = "bindings", OTHER = "bindingsother";

/** A Home with a catalog of projects, the same plugin installed in as many of them as a test asks, and the accounts bound under it. */
async function world(t: TestContext, projectCount: number) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "installation-bindings-")));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const projects = [];
  for (let index = 0; index < projectCount; index += 1) projects.push(await catalog.createProject({ display_name: `项目 ${index}`, actor_id: "test-user" }));
  const probe = ownerFilesProbe(PROBE, "project"), other = ownerFilesProbe(OTHER, "project");
  const opened = new Map<string, ReturnType<typeof ownerFilesProject>>();
  const closed = new Set<string>();
  const closeProject = async (projectId: string) => { if (closed.has(projectId)) return; closed.add(projectId); await opened.get(projectId)?.close(); };
  t.after(async () => {
    for (const projectId of opened.keys()) await closeProject(projectId);
    catalog.close();
    rmSync(home, { recursive: true, force: true });
  });
  const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "GitHub", token: randomUUID() }));
  const open = (index: number) => {
    const project = projects[index]!;
    const rig = opened.get(project.project_id) ?? ownerFilesProject(home, probe, { file: project.database_path, projectId: project.project_id });
    opened.set(project.project_id, rig);
    return rig;
  };
  const install = async (index: number) => {
    const runtime = open(index).platform.runtime;
    const record = runtime.install({ trust: { level: "unsigned" }, definition: probe.withoutFiles(), deployment: "local", grants: probe.permissions }).install;
    await runtime.start(record.install_id);
    return record.install_id;
  };
  const uninstall = (index: number, installId: string, retain: boolean) => open(index).platform.runtime.uninstall(installId, { retain_private_data: retain });
  const bind = (pluginId: string, scope: string, slot: string) =>
    withConnectorConnections(home, store => store.bind({ scopeId: scope, pluginId, slotId: slot, serviceId: "github", connectionId: connection.connection_id }));
  const bound = (pluginId: string, scope: string, slot: string) => withConnectorConnections(home, store => store.binding(scope, pluginId, slot)) !== null;
  const account = () => withConnectorConnections(home, store => store.get(connection.connection_id));
  return { home, projects, probe, other, install, uninstall, bind, bound, account, closeProject, connection };
}

test("S-71 RAC-861 the installation slot and the record bindings stay while another place has the identity installed, and go with the last one", { timeout: 120_000 }, async t => {
  const w = await world(t, 2), id = await w.install(0);
  assert.equal(await w.install(1), id, "the same plugin and publisher is the same identity in every project");
  const otherId = id + "0";
  const slot = pluginBindingScope({ install_id: id }), recordA = pluginBindingScope({ install_id: id, project_id: w.projects[0]!.project_id, record_key: "src-1" });
  const recordB = pluginBindingScope({ install_id: id, project_id: w.projects[1]!.project_id, record_key: "src-1" });
  // An identity that only begins like this one, and another plugin's slot, are not this installation's.
  const neighbour = [pluginBindingScope({ install_id: otherId }), pluginBindingScope({ install_id: otherId, project_id: w.projects[0]!.project_id, record_key: "src-1" })];
  const mine: Array<[string, string, string]> = [[w.probe.id, slot, "account"], [w.probe.id, recordA, "feed"], [w.probe.id, recordB, "feed"]];
  const theirs: Array<[string, string, string]> = [[w.probe.id, neighbour[0]!, "account"], [w.probe.id, neighbour[1]!, "feed"], [w.other.id, pluginBindingScope({ install_id: "plugin-install-other" }), "account"]];
  for (const [pluginId, scope, binding] of [...mine, ...theirs]) w.bind(pluginId, scope, binding);
  const state = () => [...mine, ...theirs].map(([pluginId, scope, binding]) => w.bound(pluginId, scope, binding));

  await w.uninstall(0, id, false);
  assert.deepEqual(state(), [true, false, true, true, true, true], "project A took its own record binding; the slot and B's binding stay while B installs it");
  await w.uninstall(1, id, false);
  assert.deepEqual(state(), [false, false, false, true, true, true], "the last installation took the slot and its record bindings; nothing of the identity next to it");
  assert.equal(w.account()?.connection_id, w.connection.connection_id, "the account itself stays");
});

test("S-71 RAC-862 a place that keeps only private data does not hold the slot", { timeout: 120_000 }, async t => {
  const w = await world(t, 2), id = await w.install(0);
  await w.install(1);
  const slot = pluginBindingScope({ install_id: id });
  w.bind(w.probe.id, slot, "account");
  await w.uninstall(0, id, true);
  assert.equal(w.bound(w.probe.id, slot, "account"), true, "project B still has it installed");
  await w.uninstall(1, id, false);
  assert.equal(w.bound(w.probe.id, slot, "account"), false, "project A keeps its private data, but nothing of what the person authorized: a reinstall binds again");
});

test("S-71 RAC-863 a Home that cannot be read all the way through keeps the bindings, and says so", { timeout: 120_000 }, async t => {
  const w = await world(t, 3), id = await w.install(0);
  const slot = pluginBindingScope({ install_id: id });
  w.bind(w.probe.id, slot, "account");
  // Project 2's library is gone from disk: whether it installs this plugin cannot be told.
  rmSync(w.projects[2]!.database_path, { force: true });
  const entries: HostLogEntry[] = [], restore = captureHostLog(entries);
  try { await w.uninstall(0, id, false); } finally { restore(); }
  assert.equal(w.bound(w.probe.id, slot, "account"), true, "the slot is kept: a binding left is an unused row, one taken from an installation in use is not");
  assert.ok(entries.some(entry => entry.area === "connections" && entry.event === "installation_holders_unreadable"), JSON.stringify(entries));
});

test("S-71 RAC-864 deleting the last project that installs it takes the slot, and a binding no installation holds goes in the same pass", { timeout: 120_000 }, async t => {
  const w = await world(t, 2), id = await w.install(0);
  await w.install(1);
  const slot = pluginBindingScope({ install_id: id }), orphan = pluginBindingScope({ install_id: id + "0" });
  w.bind(w.probe.id, slot, "account");
  w.bind(w.probe.id, orphan, "account");
  const service = new ProjectDeletionService(withMolisWorkProjectCatalog, { isPanelAlive: () => false, releaseProject: async () => {} });
  const remove = async (index: number) => {
    const project = w.projects[index]!;
    await w.closeProject(project.project_id);
    const result = await service.deleteProject(w.home, { project_id: project.project_id, actor_id: "test-user", delete_confirmed: true, idempotency_key: `delete-${project.project_id}` });
    assert.equal(result.deletion.cleanup_state, "complete");
  };
  await remove(1);
  assert.deepEqual([w.bound(w.probe.id, slot, "account"), w.bound(w.probe.id, orphan, "account")], [true, false],
    "project A still installs it: its slot stays; the identity that begins like it is held by no one and goes");
  await remove(0);
  assert.equal(w.bound(w.probe.id, slot, "account"), false, "the last project that installed it is deleted");
  assert.equal(w.account()?.connection_id, w.connection.connection_id, "the account itself stays");
});
