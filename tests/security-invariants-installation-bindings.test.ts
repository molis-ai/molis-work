import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { captureHostLog, HomePluginHost, ProjectDeletionService, withConnectorConnections, type HostLogEntry } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { pluginBindingScope } from "@molis-ai/molis-work-service-connector-host";
import { ownerFilesProbe, ownerFilesProject } from "./fixtures/plugin-owner-files.js";

// S-71 (docs/system/SECURITY-INVARIANTS.md; s57-connections-extension §4.2, BL-596): the accounts a plugin was bound to are the person's
// authorization for an installation. The installation's slots (`plugin-installation:<id>`, shared by every place the same identity is
// installed) and its record bindings under every project go with the LAST installation of that identity: asked of `heldInstalls`, the
// one reading of the Home's installations, where a place that keeps only private data no longer counts, a Home that cannot be read
// all the way through keeps the bindings, and a binding no installation holds goes when a project is deleted. A first install of an
// identity nobody has installed takes the bindings left over first (a Home that still cannot be read refuses it).

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
  /** Installs without starting: what the Runtime says of the install itself. */
  const attempt = (index: number) => open(index).platform.runtime.install({ trust: { level: "unsigned" }, definition: probe.withoutFiles(), deployment: "local", grants: probe.permissions });
  /** The Runtime's records of the plugin in one project: what a refused install left there. */
  const records = (index: number) => open(index).platform.runtime.list().filter(record => record.plugin_id === probe.id);
  return { home, projects, probe, other, install, attempt, uninstall, bind, bound, account, records, closeProject, connection };
}

/**
 * A Home that still cannot be read refuses the install with the platform's code, and tells the person to mend the library: retrying is
 * refused the same way until it can be read (BL-596 review, #1311 comment 6408434114).
 */
const refusedUnreadable = (run: () => unknown, message?: string) => assert.throws(run, (error: { code?: string; message?: string }) => {
  assert.equal(error.code, "plugin.executor_failed");
  assert.match(error.message ?? "", /读不了.*修好/u);
  assert.doesNotMatch(error.message ?? "", /重试/u, "a retry is refused the same way: the message names what to mend instead");
  return true;
}, message);

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

test("S-71 RAC-866 an identity no place has installed starts again without the bindings a Home that could not be read let it keep; a Home that still cannot be read refuses the install; a slot another place holds stays", { timeout: 240_000 }, async t => {
  const w = await world(t, 4), id = await w.install(0);
  const slot = pluginBindingScope({ install_id: id }), record = pluginBindingScope({ install_id: id, project_id: w.projects[2]!.project_id, record_key: "src-1" });
  const bindBoth = () => { w.bind(w.probe.id, slot, "account"); w.bind(w.probe.id, record, "feed"); };
  const both = () => [w.bound(w.probe.id, slot, "account"), w.bound(w.probe.id, record, "feed")];
  // The record binding sits under project 2, which never installs it, so no uninstall elsewhere takes it as a project's own.
  // Project 3's library is away for a moment: whether it installs this plugin cannot be told, so nothing is taken from anyone.
  const library = w.projects[3]!.database_path;
  const unreadable = async <T>(run: () => Promise<T> | T): Promise<T> => { renameSync(library, library + ".away"); try { return await run(); } finally { renameSync(library + ".away", library); } };

  bindBoth();
  await unreadable(() => w.uninstall(0, id, false));
  assert.deepEqual(both(), [true, true], "the last uninstall kept the bindings: the Home could not be read");
  // A first install in another place: nobody has the identity installed, so what was kept goes before it starts.
  await unreadable(async () => refusedUnreadable(() => w.attempt(1), "a Home that still cannot be read refuses the install rather than guess"));
  assert.deepEqual(both(), [true, true], "the refused install took nothing");
  assert.deepEqual(w.records(1), [], "the refused first install left no installation in that project");
  assert.equal(await w.install(1), id);
  assert.deepEqual(both(), [false, false], "the new installation starts with no account of the old one's");

  // The same for a reinstall in the place that uninstalled it.
  bindBoth();
  await unreadable(() => w.uninstall(1, id, false));
  assert.deepEqual(both(), [true, true]);
  await unreadable(async () => refusedUnreadable(() => w.attempt(1)));
  assert.deepEqual(both(), [true, true]);
  assert.deepEqual(w.records(1).map(record => record.state), ["uninstalled"], "the refused reinstall left the uninstalled row as it was");
  assert.equal(await w.install(1), id);
  assert.deepEqual(both(), [false, false], "a reinstall binds again, whether or not the Home could be read at the uninstall");

  // While a place has the identity installed, its slots are that place's: another place installing it takes nothing.
  bindBoth();
  assert.equal(await w.install(2), id);
  assert.deepEqual(both(), [true, true], "project 1 still has it installed");
  assert.equal(w.account()?.connection_id, w.connection.connection_id, "the account itself stays");
});

test("S-71 RAC-1700 the Home's own install takes the bindings a Home that could not be read let its last uninstall keep; while it still cannot be read the install is refused and says what to mend", { timeout: 120_000 }, async t => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "installation-bindings-home-")));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "项目", actor_id: "test-user" });
  const probe = ownerFilesProbe("bindingshome", "home"), definition: PluginDefinition = probe.withoutFiles(), actions = new ActionService();
  // BL-588: the unsigned in-process definition installed into the Home Host by hand is the test's own object, so the Host is told which.
  const host = new HomePluginHost({ home, actorId: LOCAL_PERSON_ACTOR_ID, registry: actions, client: actions, entries: [], fixtures: [], installed: new Set([definition]) });
  t.after(async () => { try { await host.close(); } finally { catalog.close(); rmSync(home, { recursive: true, force: true }); } });
  const runtime = (await host.ready()).runtime;
  const attempt = () => runtime.install({ trust: { level: "unsigned" }, definition, deployment: "local", grants: probe.permissions }).install;
  const id = attempt().install_id;
  await runtime.start(id);
  const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "GitHub", token: randomUUID() }));
  const slot = pluginBindingScope({ install_id: id }), record = pluginBindingScope({ install_id: id, project_id: project.project_id, record_key: "src-1" });
  const bindBoth = () => {
    for (const [scope, binding] of [[slot, "account"], [record, "feed"]] as const)
      withConnectorConnections(home, store => store.bind({ scopeId: scope, pluginId: probe.id, slotId: binding, serviceId: "github", connectionId: connection.connection_id }));
  };
  const both = () => [[slot, "account"], [record, "feed"]].map(([scope, binding]) => withConnectorConnections(home, store => store.binding(scope!, probe.id, binding!)) !== null);
  // The project's library is away for a moment: whether it installs this identity cannot be told, so nothing is taken from anyone.
  const library = project.database_path;
  const unreadable = async <T>(run: () => Promise<T> | T): Promise<T> => { renameSync(library, library + ".away"); try { return await run(); } finally { renameSync(library + ".away", library); } };

  bindBoth();
  await unreadable(() => runtime.uninstall(id, { retain_private_data: false }));
  assert.deepEqual(both(), [true, true], "the Home's last uninstall kept the bindings: the Home could not be read");
  await unreadable(async () => refusedUnreadable(attempt, "the Home executor refuses its own install rather than guess"));
  assert.deepEqual(both(), [true, true], "the refused install took nothing");
  assert.equal(runtime.get(id).state, "uninstalled", "the refused install left the Home's uninstalled row as it was");
  assert.equal(attempt().install_id, id);
  assert.deepEqual(both(), [false, false], "the Home's installation starts with no account of the old one's");
  assert.equal(withConnectorConnections(home, store => store.get(connection.connection_id))?.connection_id, connection.connection_id, "the account itself stays");
});
