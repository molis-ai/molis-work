import { projectPluginRevision } from "@molis-ai/molis-work-test-kit/local-host-http";
// BCC-08 / BCC-09: a plugin a project took out is refused by routes and actions there, works again the very next call after it is added
// back, and a Home plugin outside the build gets the same reach treatment. The cached brief/contextual click after revoke is in
// contextual-interaction.test.ts; the old brief link's prepare/read/write refusal is the BCC-09 remaining case.
import assert from "node:assert/strict";
import test from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalMcpServer, projectActionAvailability, availableProjectPluginIds } from "@molis-ai/molis-work-app-local-host";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import type { ActionCallContext, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { todoActions } from "@molis-ai/molis-work-plugin-todo";
import { FEED_PLUGIN_ID } from "@molis-ai/molis-work-plugin-feed";
import { openTestHome, type TestHome, type TestProject } from "./fixtures/test-home.js";
import { grantHomeProbe, homeProbe } from "./fixtures/home-runtime.js";

/**
 * S-72 (PG-013): a plugin a partition does not have (never added, or taken out) is out of reach there, for the action directory, MCP, the
 * Agent and the workflow engine alike (they all ask `projectActionAvailability`) and for the plugin's routes under the project's path. The one list they
 * share is `projectReachablePlugins`; every test here asserts a refusal, and that the owner's handler never ran. Since batch 108 no built-in
 * plugin is personal (Todo, Issues, Cognia, Images and Jelly run per partition), so "hiding" one is taking it out of the project.
 */

const clientId = "runtime:hidden-personal";
const entry = (projectPluginId: string) => {
  const found = BUILTIN_PLUGIN_CATALOG.find(candidate => candidate.project_plugin_id === projectPluginId);
  assert.ok(found, projectPluginId);
  return found;
};
const view = (projectPluginId: string): Pick<ActionView, "provider"> => {
  const pluginId = entry(projectPluginId).manifest.plugin_id;
  return { provider: { provider_id: pluginId, plugin_id: pluginId, title: projectPluginId, kind: "plugin" } };
};
// Shelf is a platform part (44B): no catalog entry, the same id in every project.
const SHELF_VIEW: Pick<ActionView, "provider"> = { provider: { provider_id: "system.shelf", plugin_id: "system.shelf", title: "shelf", kind: "plugin" } };
const callerIn = (projectId: string | null): ActionCallContext => ({ actor_id: "web-user", project_id: projectId, audience: "user", permissions: [] });
const projectPlugins = (projectId: string) => `/api/settings/projects/${encodeURIComponent(projectId)}/plugins`;
const hide = async (home: TestHome, project: TestProject, plugin: string) => home.web.delete(projectPlugins(project.project_id), { plugin_id: plugin, expected_revision: await projectPluginRevision(home.web, project.project_id) });
const unhide = async (home: TestHome, project: TestProject, plugin: string) => home.web.post(projectPlugins(project.project_id), { plugin_id: plugin, expected_revision: await projectPluginRevision(home.web, project.project_id) });
const formList = (project: TestProject) => `/projects/${encodeURIComponent(project.project_id)}/api/plugins/io.molis.work.form/forms`;
const todoItems = (project: TestProject) => `/projects/${encodeURIComponent(project.project_id)}/api/plugins/io.molis.work.todo/items`;

function mcpFor(home: TestHome, project: TestProject) {
  return new LocalMcpServer(home.host.configurePersonalPlanning(home.home, withMolisWorkProjectCatalog), "runtime", { projectId: project.project_id, databasePath: project.database_path, webBaseUrl: home.origin },
    { homeDirectory: home.home, webBaseUrl: home.origin, runtimeContext: { runtime_id: "hidden-personal", stable_work_context_id: "hidden-personal-session", host_declares_stable: true } }, home.host, home.origin);
}
async function toolNames(mcp: LocalMcpServer): Promise<string[]> {
  const listed = (await mcp.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }))?.result as { tools: Array<{ name: string }> };
  return listed.tools.map(tool => tool.name);
}
const todoListTool = `molis_work_v1_action_${todoActions.list.capability_id}__v1`;
const callsOf = (home: TestHome, capabilityId: string) => home.host.callLog!.recent(200).filter(row => row.capability_id === capabilityId);

test("RAC-580 S-72 a plugin the project took out is reached only through a plugin the project has that embeds it", () => {
  const goals = entry("goals"), todo = entry("todo");
  const embedding = { ...goals, project_plugin_id: "embedding", manifest: { ...goals.manifest, plugin_id: "io.example.embedding",
    ui: { ...goals.manifest.ui, embedded_plugins: [todo.manifest.plugin_id] } } };
  // Without Todo (the person took it out) and with nothing that embeds it: out of reach.
  assert.deepEqual([...availableProjectPluginIds(["goals"], [goals, todo])], ["goals"]);
  // With Todo: reached.
  assert.deepEqual([...availableProjectPluginIds(["goals", "todo"], [goals, todo])].sort(), ["goals", "todo"]);
  // Since batch 108 no built-in is personal, so a plugin the project has brings in what it embeds whether or not the project added it
  // itself: the route embedding exists for (today only Coding embeds Git and Diff, and Git embeds Diff).
  assert.deepEqual([...availableProjectPluginIds(["embedding"], [embedding, todo])].sort(), ["embedding", "todo"]);
  // The embedding plugin taken out too: the embedded one goes with it.
  assert.deepEqual([...availableProjectPluginIds([], [embedding, todo])], []);
});

test("RAC-580 S-72 Shelf, a platform part, stays in reach whatever the project took out; the reach list holds no name of it", async t => {
  const home = await openTestHome(t, { catalogPolicy: false });
  const project = await home.createProject("Platform part", ["goals", "todo"]);
  await hide(home, project, "todo");
  const plugins = await home.host.configurePersonalPlanning(home.home, withMolisWorkProjectCatalog)({ homeDirectory: home.home }, catalog =>
    catalog.projectPluginMembership(project.project_id).plugins);
  assert.ok(!plugins.includes("todo"), "what the person took out is no longer the project's");
  assert.ok(!plugins.includes("shelf"), "Shelf is no project plugin, so the list never names it");
  const availability = projectActionAvailability(home.host.configurePersonalPlanning(home.home, withMolisWorkProjectCatalog), home.home);
  assert.deepEqual(await availability(callerIn(project.project_id), SHELF_VIEW), { available: true });
  assert.equal((await availability(callerIn(project.project_id), view("todo"))).available, false);
});

// S-34: a platform part has no lifecycle. Whatever spelling reaches it — the platform path the pages use, or a project's — turning it off,
// on, restarting, retrying, upgrading, releasing or removing it is not there, and it keeps answering afterwards.
test("S-34 Shelf, a platform part, refuses every lifecycle operation and keeps answering", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Keeps Shelf");
  const settings = await home.web.get<unknown>("/api/platform/shelf/settings");
  for (const operation of ["disable", "enable", "restart", "retry", "upgrade", "release-quarantine", "uninstall"]) {
    await assert.rejects(home.web.post(`/api/platform/shelf/${operation}`, {}), { status: 404, code: "actions.missing" }, operation);
    await assert.rejects(home.web.post(`/projects/${encodeURIComponent(project.project_id)}/api/platform/shelf/${operation}`, {}), { status: 404 }, `${operation} under a project`);
  }
  assert.deepEqual(await home.web.get<unknown>("/api/platform/shelf/settings"), settings, "Shelf still answers, as before");
});

test("RAC-580 S-72 the availability both the action directory and discovery use refuses a plugin the project took out, only in that project", async t => {
  const home = await openTestHome(t, { catalogPolicy: false });
  const hiding = await home.createProject("Hides Todo", ["goals", "todo"]), showing = await home.createProject("Shows Todo", ["goals", "todo"]);
  await hide(home, hiding, "todo");
  const availability = projectActionAvailability(home.host.configurePersonalPlanning(home.home, withMolisWorkProjectCatalog), home.home);
  const refused = { available: false, code: "actions.plugin_disabled", reason: "此项目未启用该插件" };
  const states = async (caller: ActionCallContext, plugin: string) => {
    const discovery = await availability.snapshotForDiscovery(caller);
    return { live: await availability(caller, view(plugin)), snapshot: discovery(caller, view(plugin)) };
  };
  assert.deepEqual(await states(callerIn(hiding.project_id), "todo"), { live: refused, snapshot: refused });
  assert.deepEqual(await states(callerIn(showing.project_id), "todo"), { live: { available: true }, snapshot: { available: true } });
  // Shelf is a platform part: there is no project plugin of that name to take out, and it is reached whatever was taken out.
  await assert.rejects(hide(home, hiding, "shelf"), { status: 400, code: "catalog.plugin_not_found" });
  const shelfDiscovery = await availability.snapshotForDiscovery(callerIn(hiding.project_id));
  assert.deepEqual({ live: await availability(callerIn(hiding.project_id), SHELF_VIEW), snapshot: shelfDiscovery(callerIn(hiding.project_id), SHELF_VIEW) },
    { live: { available: true }, snapshot: { available: true } });
  // A plugin the catalog does not know (a runtime-installed one) is not this list's to decide.
  const unknown = { provider: { provider_id: "io.example.unknown", plugin_id: "io.example.unknown", title: "Unknown", kind: "plugin" as const } };
  assert.deepEqual(await availability(callerIn(hiding.project_id), unknown), { available: true });
  // No project, or a project that no longer exists: no built-in plugin is reached there, Todo no more than Goals (batch 108: none is personal).
  for (const caller of [callerIn(null), callerIn("deleted-project")]) {
    assert.deepEqual(await states(caller, "todo"), { live: refused, snapshot: refused });
    assert.deepEqual(await states(caller, "goals"), { live: refused, snapshot: refused });
  }
});

test("PG094-HOME-02 S-72 only a genuine Home Runtime provider bypasses the project list, consistently for live and discovery", async t => {
  const home = await openTestHome(t, { catalogPolicy: false });
  const project = await home.createProject("Installed Feed");
  // Feed is a project plugin whose Home half provides actions: the only kind of provider the bypass is for.
  await unhide(home, project, "feed");
  assert.equal(await home.host.configurePersonalPlanning(home.home, withMolisWorkProjectCatalog)({ homeDirectory: home.home }, catalog =>
    catalog.projectPluginMembership(project.project_id).plugins.includes("feed")), true);
  const homeCaller = callerIn(null);
  // Feed's Home actions are for its own project half (audience `plugin`), so no person's discovery lists them: the provider is written
  // the way the Runtime stamps it, from the Home installation the Host actually runs.
  await home.host.homePlugins!.ready();
  const installed = home.host.homePlugins!.installation(FEED_PLUGIN_ID);
  assert.equal(installed?.state, "running", "the provider comes from the actual Home Runtime installation");
  const action: Pick<ActionView, "provider"> = { provider: { provider_id: FEED_PLUGIN_ID, plugin_id: FEED_PLUGIN_ID, plugin_install_id: installed!.install_id, title: "Feed", kind: "plugin" } };
  const availability = projectActionAvailability(home.host.configurePersonalPlanning(home.home, withMolisWorkProjectCatalog), home.home);
  const check = async (caller: ActionCallContext, candidate: Pick<ActionView, "provider">, available: boolean) => {
    assert.equal((await availability(caller, candidate)).available, available);
    const snapshot = await availability.snapshotForDiscovery(caller);
    assert.equal(snapshot(caller, candidate).available, available);
  };
  await check(homeCaller, action, true);
  await check(callerIn(project.project_id), action, true);
  for (const projectId of ["deleted-project", "standalone-project"]) {
    await check(callerIn(projectId), action, false);
  }
  for (const provider of [
    { ...action.provider, plugin_install_id: undefined },
    { ...action.provider, plugin_install_id: "" },
    { ...action.provider, project_id: project.project_id },
    { ...action.provider, kind: "system" as const },
  ]) await check(homeCaller, { provider }, false);
  const deletedSnapshot = await availability.snapshotForDiscovery(callerIn("deleted-project"));
  assert.equal(deletedSnapshot(homeCaller, action).available, false, "a snapshot keeps its original project boundary");
});

test("RAC-581 S-72 the project's MCP lists no tool of a plugin the project took out, and calling it is refused before the owner's handler runs", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Hides Todo", ["todo"]);
  await home.grant(clientId, project.project_id, [todoActions.list]);
  const mcp = mcpFor(home, project); t.after(() => mcp.close());
  assert.ok((await toolNames(mcp)).includes(todoListTool), "the grant is real: the tool is listed while the project has Todo");
  await hide(home, project, "todo");
  assert.ok(!(await toolNames(mcp)).includes(todoListTool));
  const result = (await mcp.handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: todoListTool, arguments: {} } }))?.result as { isError: boolean; content: Array<{ text: string }> };
  assert.equal(result.isError, true);
  assert.equal(JSON.parse(result.content[0]!.text).code, "actions.plugin_disabled");
  assert.equal(callsOf(home, todoActions.list.capability_id).filter(row => row.ok).length, 0, "the refused call never ran the owner's handler");
  // The typed port the Agent and the workflow engine use asks the same availability.
  await assert.rejects(home.host.actionClient(project.reference).invoke({ ...callerIn(project.project_id), permissions: todoActions.list.action.permissions }, todoActions.list, {}),
    { code: "actions.plugin_disabled" });
  assert.equal(callsOf(home, todoActions.list.capability_id).filter(row => row.ok).length, 0);
});

test("RAC-582 S-72 and RAC-583 the routes of a plugin the project took out refuse at once and work again as soon as it is added back; another project is not touched", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), hiding = await home.createProject("Hides Todo", ["todo"]), showing = await home.createProject("Shows Todo", ["todo"]);
  const created = await home.web.post<{ item: { id: string } }>(todoItems(hiding), { title: "项目里的待办" });
  assert.ok(created.item.id);
  await hide(home, hiding, "todo");
  await assert.rejects(home.web.get(todoItems(hiding)), { status: 403, code: "actions.plugin_disabled" });
  await assert.rejects(home.web.post(todoItems(hiding), { title: "隐藏后不得写入" }), { status: 403, code: "actions.plugin_disabled" });
  // A project that still has it is as before.
  await home.web.get(todoItems(showing));
  // Nothing is cached: added back, the very next call works; taken out again, the very next call is refused.
  await unhide(home, hiding, "todo");
  await home.web.get(todoItems(hiding));
  await hide(home, hiding, "todo");
  await assert.rejects(home.web.get(todoItems(hiding)), { status: 403, code: "actions.plugin_disabled" });
  await unhide(home, hiding, "todo");
  const listed = await home.web.get<{ counts: { all: number } }>(todoItems(hiding));
  assert.equal(listed.counts.all, 1, "the owner's facts were never touched while it was out");
});

// Since batch 107 Form runs per partition: a project adds it, and one that takes it out refuses its routes from the same list the actions read.
test("RAC-582 S-72 a per-partition plugin's routes (Form) are refused in the project that took it out, from the same list the actions read, and work in one that did not", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), hiding = await home.createProject("Hides Form", ["form"]), showing = await home.createProject("Shows Form", ["form"]);
  await home.web.get(formList(hiding));
  await hide(home, hiding, "form");
  await assert.rejects(home.web.get(formList(hiding)), { status: 403, code: "actions.plugin_disabled" });
  await assert.rejects(home.web.post(formList(hiding), { title: "隐藏后不得写入" }), { status: 403, code: "actions.plugin_disabled" });
  await home.web.get(formList(showing));
  await unhide(home, hiding, "form");
  await home.web.get(formList(hiding));
});

test("BCC-08 RAC-569 RAC-582 S-72 a registered Home plugin outside the build requires explicit membership for both project routes and actions", { timeout: 60_000 }, async t => {
  const probe = homeProbe("outsidebuild");
  const home = await openTestHome(t, { host: { pluginFixtures: { home: [probe.definition] } } });
  await grantHomeProbe(home.host, probe);
  const hiding = await home.createProject("Hides the probe"), showing = await home.createProject("Shows the probe");
  const state = (project: TestProject) => `/projects/${encodeURIComponent(project.project_id)}/api/plugins/${probe.id}/state`;
  const save = (project: TestProject) => state(project).replace(/\/state$/u, "/save");
  const probeView: Pick<ActionView, "provider"> = { provider: { provider_id: probe.id, plugin_id: probe.id, title: "probe", kind: "plugin" } };
  const availability = projectActionAvailability(home.host.configurePersonalPlanning(home.home, withMolisWorkProjectCatalog), home.home);
  await assert.rejects(home.web.get(state(hiding)), { status: 403, code: "actions.plugin_disabled" });
  assert.equal((await availability(callerIn(hiding.project_id), probeView)).available, false);
  assert.deepEqual(probe.routed, []);
  await unhide(home, hiding, probe.id);
  await unhide(home, showing, probe.id);
  assert.equal((await home.web.get<{ project_id: string | null }>(state(hiding))).project_id, hiding.project_id);
  assert.deepEqual(probe.routed, [hiding.project_id]);
  assert.deepEqual(probe.seen.map(call => call.project_id), [hiding.project_id]);
  const client = home.host.actionClient(hiding.reference);
  const person = await home.host.localPersonContext(hiding.reference);
  const offered = (await client.discover(person)).find((action: ActionView) => action.capability_id === probe.save.capability_id);
  assert.ok(offered?.availability.available, "the live external installation offered the write");
  const reference = { ...probe.save, provider_id: offered.provider.provider_id };
  await hide(home, hiding, probe.id);
  await assert.rejects(home.web.get(state(hiding)), { status: 403, code: "actions.plugin_disabled" });
  await assert.rejects(home.web.post(save(hiding), { text: "hidden route" }), { status: 403, code: "actions.plugin_disabled" });
  await assert.rejects(client.invoke(person, reference, { text: "previously offered write" }), { code: "actions.plugin_disabled" });
  assert.deepEqual(probe.routed, [hiding.project_id], "RAC-569: rejection precedes the route handler");
  assert.deepEqual(probe.seen.map(call => call.project_id), [hiding.project_id], "the hidden request never reached the action handler");
  assert.deepEqual(await availability(callerIn(hiding.project_id), probeView), { available: false, code: "actions.plugin_disabled", reason: "此项目未启用该插件" });
  assert.equal((await home.web.get<{ project_id: string | null }>(state(showing))).project_id, showing.project_id);
  assert.deepEqual(probe.routed, [hiding.project_id, showing.project_id]);
  assert.deepEqual(probe.seen.map(call => call.project_id), [hiding.project_id, showing.project_id]);
  assert.deepEqual(await availability(callerIn(showing.project_id), probeView), { available: true });
  await unhide(home, hiding, probe.id);
  await grantHomeProbe(home.host, probe, probe.permissions.filter(permission => !probe.save.action.permissions.includes(permission)));
  await assert.rejects(client.invoke(person, reference, { text: "withdrawn grant" }), { code: "actions.forbidden" });
  assert.deepEqual(await home.web.get(state(hiding)), { project_id: hiding.project_id, value: null }, "the resumed route reads no writes from a hidden or revoked reference");
  assert.deepEqual(probe.routed, [hiding.project_id, showing.project_id, hiding.project_id]);
  assert.deepEqual(probe.seen.map(call => call.project_id), [hiding.project_id, showing.project_id, hiding.project_id]);
});
