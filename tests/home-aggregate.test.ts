import assert from "node:assert/strict";
import test from "node:test";
import { collectHomeAggregate, homeAggregatePorts, MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import type { HomeAggregatePorts } from "@molis-ai/molis-work-app-local-host";
import { ActionError, type ActionCallContext, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";

// T-319 (R-63, RAC-2437): a source that is not in the project's plugin manifest is not installed here and stays out of the Home;
// one that IS listed but unavailable (turned off, or refused by policy) is shown as an issue rather than silently skipped.
const TYPE = "io.molis.work.example.homeagg.v1";
const PLUGIN = "io.example.homeagg.plugin";
const reference = (projectId: string): LocalHostProjectReference => ({ project_id: projectId, storage_key: `/tmp/${projectId}` });
const context = (projectId: string): ActionCallContext => ({ actor_id: "owner", project_id: projectId, audience: "user", permissions: ["home:read", "homeagg:read"] });
const unavailableView = (projectId: string): ActionView => ({
  capability_id: "homeagg.running.read", version: 1, operation: "query",
  provider: { provider_id: "example.plugin", title: "Example", kind: "plugin", plugin_id: PLUGIN, project_id: projectId },
  availability: { available: false, code: "actions.plugin_disabled", reason: "策略拒绝了这个项目的读取" },
  action: { title: "运行中的工作", description: "首页聚合的只读查询", kind: "query", scope: "project", audiences: ["user"], permissions: ["homeagg:read"], subject_kinds: [],
    input_schema: { type: "object" }, output_schema: { type: "object" }, output_type: TYPE, home_aggregate: true },
});

test("RAC-2437 the Home reports a source listed in the project's plugin manifest as an issue, and skips one the manifest does not list", async () => {
  const a = reference("project-a"), b = reference("project-b");
  const ports: HomeAggregatePorts = {
    openProjects: () => [a, b],
    whileOpen: async (_reference, work) => work(),
    client: projectReference => ({ discover: async () => [unavailableView(projectReference.project_id)],
      invoke: async () => assert.fail("an unavailable source is never invoked") }),
    context: async projectReference => context(projectReference.project_id),
    // The manifest fact: A does not list the plugin, B does. Same provider, same refusal in both projects.
    projectPlugins: async projectReference => (pluginId: string) => projectReference.project_id === b.project_id && pluginId === PLUGIN,
  };
  const result = await collectHomeAggregate(ports, TYPE, {});
  assert.deepEqual(result.answers, []);
  assert.deepEqual(result.issues.map(issue => ({ project_id: issue.project_id, code: issue.code })), [{ project_id: b.project_id, code: "actions.plugin_disabled" }],
    "only the project that lists the plugin shows that its source is unavailable");
});

test("RAC-2437 a Host with no catalog refuses the manifest lookup, and the Home records that refusal as the project's issue", async () => {
  const bare = new MolisWorkLocalHost();
  try {
    await assert.rejects(bare.projectPluginReach("project-a"), { code: "host.catalog_unavailable" });
  } finally { await bare.close(); }
  const a = reference("project-a");
  const answering = { ...unavailableView(a.project_id), availability: { available: true } };
  const ports: HomeAggregatePorts = {
    openProjects: () => [a],
    whileOpen: async (_reference, work) => work(),
    client: () => ({ discover: async () => [answering], invoke: async () => ({ project: a.project_id }) }),
    context: async projectReference => context(projectReference.project_id),
    projectPlugins: async () => { throw new ActionError("host.catalog_unavailable", "项目目录尚未就绪，请稍后重试"); },
  };
  const result = await collectHomeAggregate(ports, TYPE, {});
  assert.deepEqual(result.answers.map(answer => ({ project: answer.project_id, output: answer.output })), [{ project: a.project_id, output: { project: a.project_id } }],
    "the failed lookup is reported, but it does not cost the answers other sources can still give");
  assert.deepEqual(result.issues.map(issue => ({ project_id: issue.project_id, source: issue.source, code: issue.code })),
    [{ project_id: a.project_id, source: null, code: "host.catalog_unavailable" }],
    "the refused lookup is what the person sees, not a silently empty Home");
});

test("RAC-2437 homeAggregatePorts wires the Host's own manifest lookup, which refuses when that Host has no catalog", async () => {
  const host = new MolisWorkLocalHost();
  try {
    await assert.rejects(homeAggregatePorts(host).projectPlugins(reference("project-a")), { code: "host.catalog_unavailable" },
      "the aggregate port must ask the Host, not answer an empty manifest by itself");
  } finally { await host.close(); }
});

test("RAC-2437 through a real catalog, the judgement resolves a Manifest id to the project's plugin key: listed-and-denied is shown, unlisted or non-plugin_disabled keeps main's behaviour", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const home = await mkdtemp(join(tmpdir(), "home-aggregate-catalog-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  host.configurePersonalPlanning(home, withCatalog);
  const create = (displayName: string) => withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: displayName, actor_id: "user" }));
  const listedProject = await create("启用 Feed 的项目"), bareProject = await create("没有 Feed 的项目");
  await withCatalog({ homeDirectory: home }, catalog => catalog.addProjectPlugin({ project_id: listedProject.project_id, plugin_id: "feed", actor_id: "user" }));
  const reference = (project: { project_id: string; database_path: string }) => molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const view = (code: string): ActionView => ({
    capability_id: "homeagg.catalog.read", version: 1, operation: "query",
    provider: { provider_id: "feed.home.aggregate", title: "Feed", kind: "plugin", plugin_id: "io.molis.work.feed", project_id: listedProject.project_id },
    availability: { available: false, code, reason: "策略拒绝了这个项目的读取" },
    action: { title: "运行中的工作", description: "首页聚合的只读查询", kind: "query", scope: "project", audiences: ["user"], permissions: ["homeagg:read"], subject_kinds: [],
      input_schema: { type: "object" }, output_schema: { type: "object" }, output_type: TYPE, home_aggregate: true },
  });
  const portsFor = (project: { project_id: string; database_path: string }, code: string): HomeAggregatePorts => ({
    openProjects: () => [reference(project)],
    whileOpen: async (_reference, work) => work(),
    client: () => ({ discover: async () => [view(code)], invoke: async () => assert.fail("an unavailable source is never invoked") }),
    context: async projectReference => context(projectReference.project_id),
    projectPlugins: projectReference => host.projectPluginReach(projectReference.project_id),
  });
  try {
    const denied = await collectHomeAggregate(portsFor(listedProject, "actions.plugin_disabled"), TYPE, {});
    assert.deepEqual(denied.issues.map(issue => issue.code), ["actions.plugin_disabled"], "the project lists Feed, so its policy refusal is shown");
    const unlisted = await collectHomeAggregate(portsFor(bareProject, "actions.plugin_disabled"), TYPE, {});
    assert.deepEqual(unlisted.issues, [], "a project that does not list Feed hears nothing about it being off");
    const serviceDown = await collectHomeAggregate(portsFor(bareProject, "actions.service_unavailable"), TYPE, {});
    assert.deepEqual(serviceDown.issues.map(issue => issue.code), ["actions.service_unavailable"], "a source that cannot answer is still shown, as on main");
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});
