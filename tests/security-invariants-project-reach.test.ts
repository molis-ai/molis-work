import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test, { type TestContext } from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LOCAL_PERSON_ACTOR_ID, type ActionAudience, type ActionCallContext, type ActionDefinition, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PROJECT_REACH_PERMISSION } from "@molis-ai/molis-work-plugin-runtime";
import { callAs, callerPlugin, issuedCaller, registerProbe } from "./fixtures/plugin-callers.js";
import { openTestHome, type TestHome, type TestProject } from "./fixtures/test-home.js";

/**
 * S-70 (PG-014): the projects a Home-level action may read across come from the Host alone. The Host puts `readable_project_ids` in the
 * context of an action that declares `project_reach: "person"`, for the local person's own call, to an installation that holds
 * `projects:reach`; it is the projects in the catalog right now in which the plugin is shown, worked out again at every call. A plugin
 * never decides it from the audience, and nothing it is given (input, a forged context, another call's) widens it.
 */

const PROBE = "reachprobe", KEEPS = "io.molis.work.example.reachprobe";
type Behavior = (context: PluginStartContext, caller: ActionExecutionContext) => Promise<unknown>;

/** A Home plugin whose `list` declares `project_reach` and answers what the Host put in its context; `plain` declares nothing; `outer` calls `list`. */
function reachProbe(options: { consumes?: readonly string[] } = {}) {
  const action = (suffix: string, reach: boolean): ActionDefinition => ({ capability_id: `${PROBE}.${suffix}`, version: 1, operation: "query", action: {
    title: suffix, description: "A project reach probe", kind: "query", scope: "home", audiences: ["user", "agent", "mcp", "workflow", "plugin"], permissions: ["storage:private"], subject_kinds: [],
    input_schema: { type: "object" }, output_schema: { type: "object" }, ...(reach ? { project_reach: "person" as const } : {}) } });
  const actions = { list: action("list", true), plain: action("plain", false), outer: action("outer", false) };
  const contexts: PluginStartContext[] = [], seen: ActionExecutionContext[] = [], behavior: Record<string, Behavior> = {};
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: KEEPS, version: "1.0.0", name: PROBE, kind: "app",
    publisher: { publisher_id: "example", signature: "project-reach-probe" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: "storage:private", required: true, reason: "Keep what a call returned" },
      { permission: PROJECT_REACH_PERMISSION, required: false, reason: "See the person's projects" }],
    capabilities: { provides: [], consumes: [...(options.consumes ?? [])] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: Object.values(actions),
  }, async start(context) {
    contexts.push(context);
    return { kind: "app", actions: Object.values(actions).map(each => ({ ...each, async handle(caller) {
      const suffix = each.capability_id.slice(PROBE.length + 1);
      if (each === actions.list) seen.push(caller);
      return behavior[suffix] ? behavior[suffix](context, caller) : { readable: caller.readable_project_ids ?? null };
    } })) };
  } };
  return { id: KEEPS, actions, contexts, seen, behavior, definition };
}
type ReachProbe = ReturnType<typeof reachProbe>;

async function setup(t: TestContext, probe: ReachProbe, extra: readonly PluginDefinition[] = [], host: NonNullable<NonNullable<Parameters<typeof openTestHome>[1]>["host"]> = {}) {
  const home = await openTestHome(t, { catalogPolicy: false, host: { ...host, pluginFixtures: { home: [probe.definition, ...extra] } } });
  const platform = await home.host.homePlugins!.ready();
  /** Grants are what the person confirmed: `projects:reach` is optional in the Manifest, so a fresh installation holds none. */
  const grant = async (granted: boolean) => {
    const install = home.host.homePlugins!.installation(probe.id)!;
    await platform.runtime.stop(install.install_id);
    platform.runtime.grant(install.install_id, granted ? ["storage:private", PROJECT_REACH_PERMISSION] : ["storage:private"]);
    await platform.supervisor.restart(probe.id);
  };
  const as = (audience: ActionAudience, extraFields: Partial<ActionCallContext> = {}): ActionCallContext =>
    ({ actor_id: audience === "user" ? LOCAL_PERSON_ACTOR_ID : `runtime:${audience}`, audience, project_id: null, permissions: ["storage:private"], ...extraFields });
  const call = async (definition: ActionDefinition, caller: ActionCallContext, input: unknown = {}) => (await home.host.homeActionClient().invoke(caller, definition, input)) as { readable: string[] | null };
  return { home, platform, grant, as, call };
}
const hide = (home: TestHome, project: TestProject, plugin: string) => home.web.delete(`/api/settings/projects/${encodeURIComponent(project.project_id)}/plugins`, { plugin_id: plugin });
const unhide = (home: TestHome, project: TestProject, plugin: string) => home.web.post(`/api/settings/projects/${encodeURIComponent(project.project_id)}/plugins`, { plugin_id: plugin });
const sorted = (ids: readonly string[] | null) => [...(ids ?? [])].sort();

/** The existing close notification runs after resource release and is awaited before the Host drops its closing entry. */
function closingBarrier() {
  const entered = Promise.withResolvers<void>(), resume = Promise.withResolvers<void>();
  let projectId: string | undefined;
  return { entered: entered.promise, release: () => resume.resolve(), hold: (project: TestProject) => { projectId = project.project_id; },
    async onRuntimeClose(reference: { project_id: string }) {
      if (reference.project_id === projectId) { entered.resolve(); await resume.promise; }
    } };
}

test("RAC-590-CLOSE-01 S-70 a closing project with its catalog row still present is excluded by a real Home action; unopened and newly created projects remain readable", { timeout: 60_000 }, async t => {
  const barrier = closingBarrier();
  let deleting: Promise<unknown> | undefined;
  t.after(async () => { barrier.release(); await deleting; });
  const probe = reachProbe(), s = await setup(t, probe, [], { onRuntimeClose: barrier.onRuntimeClose });
  await s.grant(true);
  const closing = await s.home.createProject("Closing"), other = await s.home.createProject("Other"), unopened = await s.home.createProject("Not opened");
  const database = await s.home.host.withProject(closing.reference, runtime => runtime.store.db);
  await s.home.host.withProject(other.reference, () => undefined);
  assert.equal(s.home.host.projects().some(project => project.project_id === unopened.project_id), false);
  const caller = s.as("user"), readable = async () => (await s.call(probe.actions.list, caller)).readable!;
  const before = await readable();
  for (const project of [closing, other, unopened]) assert.ok(before.includes(project.project_id));
  barrier.hold(closing);
  deleting = s.home.web.post(`/api/settings/projects/${closing.project_id}/delete`, { delete_confirmed: true, idempotency_key: "reach-closing-project" });
  await Promise.race([barrier.entered, deleting.then(() => assert.fail("deletion completed before the resource-release barrier"))]);
  assert.equal(s.home.host.projects().find(project => project.project_id === closing.project_id)?.state, "closing");
  assert.throws(() => database.prepare("SELECT 1"), /database.*(?:not open|closed)/iu, "the project's resources were actually released");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: s.home.home });
  try { assert.ok(catalog.listProjects().some(project => project.project_id === closing.project_id), "the real catalog row still exists"); } finally { catalog.close(); }
  assert.equal(existsSync(closing.database_path), true);
  const during = await readable();
  assert.equal(during.includes(closing.project_id), false, "closing is excluded before the catalog removes the row");
  for (const project of [other, unopened]) assert.ok(during.includes(project.project_id));
  const created = await s.home.createProject("Created while another project closes");
  const afterCreate = await readable();
  assert.ok(afterCreate.includes(created.project_id));
  assert.equal(afterCreate.includes(closing.project_id), false);
  assert.equal(s.home.host.projects().some(project => project.project_id === unopened.project_id), false, "reading reach never opens a catalog-only project");
  barrier.release();
  const result = await deleting as { deletion: { cleanup_state: string } };
  assert.equal(result.deletion.cleanup_state, "complete");
  const after = await openMolisWorkProjectCatalog({ homeDirectory: s.home.home });
  try { assert.equal(after.listProjects().some(project => project.project_id === closing.project_id), false); } finally { after.close(); }
  assert.equal(existsSync(closing.database_path), false);
});

test("RAC-590-CLOSE-02 S-70 Todo all-projects reads exclude closing projects while live hidden state still changes on each call", { timeout: 60_000 }, async t => {
  const barrier = closingBarrier();
  let deleting: Promise<unknown> | undefined;
  t.after(async () => { barrier.release(); await deleting; });
  const home = await openTestHome(t, { host: { onRuntimeClose: barrier.onRuntimeClose } });
  const closing = await home.createProject("Closing Todo"), reads = await home.createProject("Reads"), hidden = await home.createProject("Visibility changes");
  const items = (project: TestProject) => `/projects/${project.project_id}/api/plugins/io.molis.work.todo/items`;
  for (const [project, title] of [[closing, "Closing item"], [reads, "Readable item"], [hidden, "Visibility item"]] as const) {
    await home.web.post(items(project), { title, placement: "project" });
  }
  const titles = async () => (await home.web.get<{ items: Array<{ title: string }> }>(`${items(reads)}?all=1&view=all`)).items.map(item => item.title).sort();
  assert.deepEqual(await titles(), ["Closing item", "Readable item", "Visibility item"]);
  barrier.hold(closing);
  deleting = home.web.post(`/api/settings/projects/${closing.project_id}/delete`, { delete_confirmed: true, idempotency_key: "reach-closing-todo" });
  await Promise.race([barrier.entered, deleting.then(() => assert.fail("deletion completed before the resource-release barrier"))]);
  assert.equal(home.host.projects().find(project => project.project_id === closing.project_id)?.state, "closing");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home.home });
  try { assert.ok(catalog.listProjects().some(project => project.project_id === closing.project_id)); } finally { catalog.close(); }
  assert.deepEqual(await titles(), ["Readable item", "Visibility item"]);
  await hide(home, hidden, "todo");
  assert.deepEqual(await titles(), ["Readable item"]);
  await unhide(home, hidden, "todo");
  assert.deepEqual(await titles(), ["Readable item", "Visibility item"]);
  barrier.release();
  const result = await deleting as { deletion: { cleanup_state: string } };
  assert.equal(result.deletion.cleanup_state, "complete");
  assert.deepEqual(await titles(), ["Readable item", "Visibility item"]);
});

test("RAC-590 S-70 the person's call to an action that declares project_reach gets the projects in the catalog now, worked out again at every call", async t => {
  const probe = reachProbe(), s = await setup(t, probe);
  await s.grant(true);
  const a = await s.home.createProject("A"), b = await s.home.createProject("B");
  const caller = s.as("user");
  const all = (await s.call(probe.actions.list, caller)).readable;
  assert.ok(all?.includes(a.project_id) && all.includes(b.project_id), JSON.stringify(all));
  // A project created after the first call is in the next one: nothing is kept between calls.
  const c = await s.home.createProject("C");
  assert.deepEqual(sorted((await s.call(probe.actions.list, caller)).readable), sorted([...all!, c.project_id]));
  // A project that no longer exists is not in it.
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: s.home.home });
  try { await catalog.deleteProject({ project_id: b.project_id, actor_id: "test", delete_confirmed: true, idempotency_key: "reach-delete-b" }); } finally { catalog.close(); }
  const afterDelete = (await s.call(probe.actions.list, caller)).readable;
  assert.ok(afterDelete?.includes(a.project_id) && afterDelete.includes(c.project_id) && !afterDelete.includes(b.project_id), JSON.stringify(afterDelete));
  // An action that does not declare it gets none, whatever the call.
  assert.equal((await s.call(probe.actions.plain, caller)).readable, null);
});

test("RAC-590 S-70 the Agent, MCP, workflow and plugin audiences get no list from the same action", async t => {
  const caller = callerPlugin("reachcaller", "home", { [PROJECT_REACH_PERMISSION]: false }), probe = reachProbe();
  const s = await setup(t, probe, [caller.definition]);
  await s.grant(true);
  await s.home.createProject("A");
  assert.ok((await s.call(probe.actions.list, s.as("user"))).readable!.length > 0, "the person's own call has it");
  // The workflow engine and the Assistant act under the person's own identity, so the audience alone is what refuses them.
  for (const audience of ["agent", "mcp", "workflow"] as const) {
    assert.equal((await s.call(probe.actions.list, s.as(audience, { actor_id: LOCAL_PERSON_ACTOR_ID }))).readable, null, audience);
  }
  const issued = await issuedCaller(registerProbe(s.home.host.actionRegistry(), "home"), caller);
  assert.equal((await s.call(probe.actions.list, callAs(issued, ["storage:private"]))).readable, null, "plugin");
  // Not the local person: a user-audience call of another actor gets none either.
  assert.equal((await s.call(probe.actions.list, s.as("user", { actor_id: "someone-else" }))).readable, null);
});

test("RAC-590 S-70 an installation that holds no projects:reach gets no list, and loses it as soon as the grant is withdrawn", async t => {
  const probe = reachProbe(), s = await setup(t, probe);
  await s.home.createProject("A");
  assert.equal((await s.call(probe.actions.list, s.as("user"))).readable, null, "declared in the Manifest, never granted");
  await s.grant(true);
  assert.ok((await s.call(probe.actions.list, s.as("user"))).readable!.length > 0);
  await s.grant(false);
  assert.equal((await s.call(probe.actions.list, s.as("user"))).readable, null, "withdrawn");
});

test("RAC-593 S-70 nothing a plugin is handed widens the list: a forged field in the call, or in the input, is not the Host's", async t => {
  const probe = reachProbe(), s = await setup(t, probe);
  await s.grant(true);
  const a = await s.home.createProject("A");
  const forged = ["forged-project"];
  // A caller that carries the field in is not believed: the Host strips it and works out its own.
  assert.equal((await s.call(probe.actions.list, s.as("agent", { actor_id: LOCAL_PERSON_ACTOR_ID, readable_project_ids: forged }))).readable, null);
  const own = (await s.call(probe.actions.list, s.as("user", { readable_project_ids: forged }))).readable;
  assert.ok(own?.includes(a.project_id) && !own.includes("forged-project"), JSON.stringify(own));
  // What the person's page sends as input is business input: it never reaches the context.
  const withInput = (await s.call(probe.actions.list, s.as("agent", { actor_id: LOCAL_PERSON_ACTOR_ID }), { readable_project_ids: forged, all_projects: true })).readable;
  assert.equal(withInput, null);
});

test("RAC-593 S-70 the plugin's call to its own action carries the outer call's list: the person's has it, an Agent's does not", async t => {
  const probe = reachProbe(), s = await setup(t, probe);
  await s.grant(true);
  const a = await s.home.createProject("A");
  probe.behavior.outer = (context, caller) => context.services!.actions!.invoke(probe.actions.list, {}, caller) as Promise<unknown>;
  const byPerson = (await s.call(probe.actions.outer, s.as("user"))).readable;
  assert.ok(byPerson?.includes(a.project_id), JSON.stringify(byPerson));
  for (const audience of ["agent", "mcp", "workflow"] as const) assert.equal((await s.call(probe.actions.outer, s.as(audience, { actor_id: LOCAL_PERSON_ACTOR_ID }))).readable, null, audience);
});

test("RAC-590 RAC-592 S-70 a project that hides Todo is not in the list: its todos are not in the person's all-projects view and are not found by id, until it shows Todo again", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), a = await home.createProject("Reads"), b = await home.createProject("Hides Todo");
  const items = (project: TestProject) => `/projects/${encodeURIComponent(project.project_id)}/api/plugins/io.molis.work.todo/items`;
  type Listed = { items: Array<{ id: string; title: string; revision: number }> };
  const titles = async (query: string) => (await home.web.get<Listed>(`${items(a)}?${query}`)).items.map(item => item.title).sort();
  const made = await home.web.post<{ item: { id: string; revision: number } }>(items(b), { title: "B 项目里的事", placement: "project" });
  await home.web.post(items(a), { title: "A 项目里的事", placement: "project" });
  assert.deepEqual(await titles("all=1&view=all"), ["A 项目里的事", "B 项目里的事"]);
  assert.equal((await home.web.get<{ item: { title: string } }>(`${items(a)}/${made.item.id}`)).item.title, "B 项目里的事");
  await hide(home, b, "todo");
  assert.deepEqual(await titles("all=1&view=all"), ["A 项目里的事"]);
  await assert.rejects(home.web.get(`${items(a)}/${made.item.id}`), { status: 404, code: "todo.not_found" });
  await assert.rejects(home.web.post(`${items(a)}/${made.item.id}/status`, { status: "doing", expected_revision: made.item.revision }), { status: 404, code: "todo.not_found" });
  await assert.rejects(home.web.post(`${items(a)}/${made.item.id}`, { title: "越界改动", placement: "project", expected_revision: made.item.revision }), { status: 404, code: "todo.not_found" });
  // Shown again, it is there with nothing lost or changed.
  await unhide(home, b, "todo");
  assert.deepEqual(await titles("all=1&view=all"), ["A 项目里的事", "B 项目里的事"]);
  assert.equal((await home.web.get<{ item: { revision: number } }>(`${items(a)}/${made.item.id}`)).item.revision, made.item.revision);
});
