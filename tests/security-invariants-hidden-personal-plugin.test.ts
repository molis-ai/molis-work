import assert from "node:assert/strict";
import test from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalMcpServer, projectActionAvailability, availableProjectPluginIds, shownProjectPlugins } from "@molis-ai/molis-work-app-local-host";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import type { ActionCallContext, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { todoActions } from "@molis-ai/molis-work-plugin-todo";
import { openTestHome, type TestHome, type TestProject } from "./fixtures/test-home.js";
import { grantHomeProbe, homeProbe } from "./fixtures/home-runtime.js";

/**
 * S-72 (PG-013): a personal plugin the person hid from a project is out of reach there, for the action directory, MCP, the Agent and the
 * workflow engine alike (they all ask `projectActionAvailability`) and for the plugin's routes under the project's path. The one list they
 * share is `projectReachablePlugins`; every test here asserts a refusal, and that the owner's handler never ran.
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
const callerIn = (projectId: string | null): ActionCallContext => ({ actor_id: "web-user", project_id: projectId, audience: "user", permissions: [] });
const projectPlugins = (projectId: string) => `/api/settings/projects/${encodeURIComponent(projectId)}/plugins`;
const hide = (home: TestHome, project: TestProject, plugin: string) => home.web.delete(projectPlugins(project.project_id), { plugin_id: plugin });
const unhide = (home: TestHome, project: TestProject, plugin: string) => home.web.post(projectPlugins(project.project_id), { plugin_id: plugin });
const formList = (project: TestProject) => `/projects/${encodeURIComponent(project.project_id)}/api/plugins/io.molis.work.form/forms`;
const todoItems = (project: TestProject) => `/projects/${encodeURIComponent(project.project_id)}/api/plugins/io.molis.work.todo/items`;

function mcpFor(home: TestHome, project: TestProject) {
  return new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", { projectId: project.project_id, databasePath: project.database_path, webBaseUrl: home.origin },
    { homeDirectory: home.home, webBaseUrl: home.origin, runtimeContext: { runtime_id: "hidden-personal", stable_work_context_id: "hidden-personal-session", host_declares_stable: true } }, home.host, home.origin);
}
async function toolNames(mcp: LocalMcpServer): Promise<string[]> {
  const listed = (await mcp.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }))?.result as { tools: Array<{ name: string }> };
  return listed.tools.map(tool => tool.name);
}
const todoListTool = `molis_work_v1_action_${todoActions.list.capability_id}__v1`;
const callsOf = (home: TestHome, capabilityId: string) => home.host.callLog!.recent(200).filter(row => row.capability_id === capabilityId);

test("RAC-580 S-72 a personal plugin the project hides is not reached through a plugin that embeds it; an embed brings in only what is not hidden", () => {
  const goals = entry("goals"), todo = entry("todo");
  const embedding = { ...goals, project_plugin_id: "embedding", manifest: { ...goals.manifest, plugin_id: "io.example.embedding",
    ui: { ...goals.manifest.ui, embedded_plugins: [todo.manifest.plugin_id] } } };
  const catalog = [embedding, todo];
  // Shown without Todo (the person hid it): the embed does not bring it back.
  assert.deepEqual([...availableProjectPluginIds(["embedding"], catalog)], ["embedding"]);
  // Shown with Todo: reached, by the embed or by being shown.
  assert.deepEqual([...availableProjectPluginIds(["embedding", "todo"], catalog)].sort(), ["embedding", "todo"]);
  // A project plugin that is only embedded (not personal) still comes in through the embed, which is the route embedding exists for.
  const embeddedProjectPlugin = { ...embedding, manifest: { ...embedding.manifest, ui: { ...embedding.manifest.ui, embedded_plugins: [goals.manifest.plugin_id] } } };
  assert.deepEqual([...availableProjectPluginIds(["embedding"], [embeddedProjectPlugin, goals])].sort(), ["embedding", "goals"]);
});

test("RAC-580 S-72 an always-on plugin stays in reach because the project's catalog never lists it as hidden (the Home's agreement); the reach list holds no name of it", async t => {
  const home = await openTestHome(t, { catalogPolicy: false });
  const project = await home.createProject("Always on", ["goals"]);
  await hide(home, project, "pages");
  const listed = await withMolisWorkProjectCatalog({ homeDirectory: home.home }, catalog => ({ enabled: catalog.listProjectPlugins(project.project_id), hidden: catalog.listHiddenPlugins(project.project_id) }));
  assert.deepEqual(listed.hidden, ["pages"], "what the person hid is listed, and a 常开 plugin is never among it");
  const shown = shownProjectPlugins(listed.enabled, listed.hidden);
  assert.ok(shown.includes("shelf") && !shown.includes("pages"));
  const availability = projectActionAvailability(withMolisWorkProjectCatalog, home.home);
  assert.deepEqual(await availability(callerIn(project.project_id), view("shelf")), { available: true });
  assert.equal((await availability(callerIn(project.project_id), view("pages"))).available, false);
});

test("RAC-580 S-72 the availability both the action directory and discovery use refuses a hidden personal plugin, only in the project that hid it", async t => {
  const home = await openTestHome(t, { catalogPolicy: false });
  const hiding = await home.createProject("Hides Pages", ["goals"]), showing = await home.createProject("Shows Pages", ["goals"]);
  await hide(home, hiding, "pages");
  const availability = projectActionAvailability(withMolisWorkProjectCatalog, home.home);
  const refused = { available: false, code: "actions.plugin_disabled", reason: "此项目未启用该插件" };
  const states = async (caller: ActionCallContext, plugin: string) => {
    const discovery = await availability.snapshotForDiscovery(caller);
    return { live: await availability(caller, view(plugin)), snapshot: discovery(caller, view(plugin)) };
  };
  assert.deepEqual(await states(callerIn(hiding.project_id), "pages"), { live: refused, snapshot: refused });
  assert.deepEqual(await states(callerIn(showing.project_id), "pages"), { live: { available: true }, snapshot: { available: true } });
  // Shelf is shown in every project whatever was hidden, and the person cannot hide it.
  await assert.rejects(hide(home, hiding, "shelf"), { status: 400, code: "catalog.plugin_always_on" });
  assert.deepEqual(await states(callerIn(hiding.project_id), "shelf"), { live: { available: true }, snapshot: { available: true } });
  // A plugin the catalog does not know (a runtime-installed one) is not this list's to decide.
  const unknown = { provider: { provider_id: "io.example.unknown", plugin_id: "io.example.unknown", title: "Unknown", kind: "plugin" as const } };
  assert.deepEqual(await availability(callerIn(hiding.project_id), unknown), { available: true });
  // No project, or a project that no longer exists: nothing is hidden, so a personal plugin is there; a project plugin still is not.
  for (const caller of [callerIn(null), callerIn("deleted-project")]) {
    assert.deepEqual(await states(caller, "pages"), { live: { available: true }, snapshot: { available: true } });
    assert.deepEqual(await states(caller, "goals"), { live: refused, snapshot: refused });
  }
});

test("RAC-581 S-72 the project's MCP lists no tool of a hidden personal plugin, and calling it is refused before the owner's handler runs", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Hides Todo");
  await home.grant(clientId, null, [todoActions.list]);
  const mcp = mcpFor(home, project); t.after(() => mcp.close());
  assert.ok((await toolNames(mcp)).includes(todoListTool), "the grant is real: the tool is listed while the project shows Todo");
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

test("RAC-582 S-72 and RAC-583 the hidden plugin's routes under the project refuse at once and work again as soon as it is shown; the Home path is not touched", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), hiding = await home.createProject("Hides Todo"), showing = await home.createProject("Shows Todo");
  const homePath = "/api/plugins/io.molis.work.todo/items";
  await home.web.get(todoItems(hiding));
  await hide(home, hiding, "todo");
  await assert.rejects(home.web.get(todoItems(hiding)), { status: 403, code: "actions.plugin_disabled" });
  await assert.rejects(home.web.post(todoItems(hiding), { title: "隐藏后不得写入" }), { status: 403, code: "actions.plugin_disabled" });
  // A project that did not hide it, and the Home's own path, are as before.
  await home.web.get(todoItems(showing));
  await home.web.get(homePath);
  const created = await home.web.post<{ item: { id: string } }>(homePath, { title: "本人的待办" });
  assert.ok(created.item.id);
  // Nothing is cached: shown again, the very next call works; hidden again, the very next call is refused.
  await unhide(home, hiding, "todo");
  await home.web.get(todoItems(hiding));
  await hide(home, hiding, "todo");
  await assert.rejects(home.web.get(todoItems(hiding)), { status: 403, code: "actions.plugin_disabled" });
  await unhide(home, hiding, "todo");
  const listed = await home.web.get<{ counts: { all: number } }>(todoItems(hiding));
  assert.equal(listed.counts.all, 1, "the owner's facts were never touched while it was hidden");
});

test("RAC-582 S-72 a project-level personal plugin's routes (Form) are refused in the project that hid it, from the same list the actions read, and work in one that did not", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), hiding = await home.createProject("Hides Form"), showing = await home.createProject("Shows Form");
  await home.web.get(formList(hiding));
  await hide(home, hiding, "form");
  await assert.rejects(home.web.get(formList(hiding)), { status: 403, code: "actions.plugin_disabled" });
  await assert.rejects(home.web.post(formList(hiding), { title: "隐藏后不得写入" }), { status: 403, code: "actions.plugin_disabled" });
  await home.web.get(formList(showing));
  await unhide(home, hiding, "form");
  await home.web.get(formList(hiding));
});

test("RAC-569 RAC-582 S-72 a personal Home plugin outside the build (named only by the Host's Home registration) is refused in the project that hid it, by its routes and its actions alike, and works in one that did not", { timeout: 60_000 }, async t => {
  const probe = homeProbe("outsidebuild");
  const home = await openTestHome(t, { host: { pluginFixtures: { home: [probe.definition] } } });
  await grantHomeProbe(home.host, probe);
  const hiding = await home.createProject("Hides the probe"), showing = await home.createProject("Shows the probe");
  const state = (project: TestProject) => `/projects/${encodeURIComponent(project.project_id)}/api/plugins/${probe.id}/state`;
  const probeView: Pick<ActionView, "provider"> = { provider: { provider_id: probe.id, plugin_id: probe.id, title: "probe", kind: "plugin" } };
  const availability = projectActionAvailability(withMolisWorkProjectCatalog, home.home);
  assert.equal((await home.web.get<{ project_id: string | null }>(state(hiding))).project_id, hiding.project_id, "shown until the project hides it");
  assert.deepEqual(probe.routed, [hiding.project_id]);
  assert.deepEqual(probe.seen.map(call => call.project_id), [hiding.project_id]);
  await hide(home, hiding, probe.id);
  await assert.rejects(home.web.get(state(hiding)), { status: 403, code: "actions.plugin_disabled" });
  assert.deepEqual(probe.routed, [hiding.project_id], "RAC-569: rejection precedes the route handler");
  assert.deepEqual(probe.seen.map(call => call.project_id), [hiding.project_id], "the hidden request never reached the action handler");
  assert.deepEqual(await availability(callerIn(hiding.project_id), probeView), { available: false, code: "actions.plugin_disabled", reason: "此项目未启用该插件" });
  assert.equal((await home.web.get<{ project_id: string | null }>(state(showing))).project_id, showing.project_id);
  assert.deepEqual(probe.routed, [hiding.project_id, showing.project_id]);
  assert.deepEqual(probe.seen.map(call => call.project_id), [hiding.project_id, showing.project_id]);
  assert.deepEqual(await availability(callerIn(showing.project_id), probeView), { available: true });
  await unhide(home, hiding, probe.id);
  assert.equal((await home.web.get<{ project_id: string | null }>(state(hiding))).project_id, hiding.project_id, "shown again, the very next call works");
  assert.deepEqual(probe.routed, [hiding.project_id, showing.project_id, hiding.project_id]);
  assert.deepEqual(probe.seen.map(call => call.project_id), [hiding.project_id, showing.project_id, hiding.project_id]);
});
