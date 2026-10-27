import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MolisWorkLocalHost, molisWorkHostProjectReference, runningProjectPlatform } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createHomeShelfPlugin, createShelfPlugin, SHELF_PLUGIN_ID } from "@molis-ai/molis-work-plugin-shelf";
import { createHomeGoalsPlugin, createGoalsPlugin, GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";
import assert from "node:assert/strict";
import test from "node:test";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { ActionService } from "@molis-ai/molis-work-kernel";
import type { PluginAppContribution, PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { MemoryPluginRuntimeRepository, PluginRuntime, viewContributionId, type RedemptionScope } from "@molis-ai/molis-work-plugin-runtime";
import { dualPlugin } from "./fixtures/dual-plugin.js";

// DUAL-03 and DUAL-14 (specs/dual-instance-plugins/spec.md), with the route half of DUAL-09: the two halves of a dual-instance plugin
// together offer its one Manifest exactly once. The Runtime checks only that what a half offers is declared (P1: "declared and not
// offered" is relaxed for a marked half), so this test is where "nothing left out, nothing offered twice" holds: every action and
// consumption scene, route, view and the input and event handlers come from exactly one half. Each half starts
// the way its supervisor starts it, in its own Runtime with the redemption the Host gives it, the two sharing one action service.

/**
 * Every dual-instance plugin the Host ships, with its two halves. A catalog registration marked `runtime.dual_instance` that is not
 * here fails the first test, so a newly marked plugin is covered from the PR that marks it (Shelf from its S2).
 */
const SHIPPED: ReadonlyArray<{ readonly plugin_id: string; home(): PluginDefinition; project(): PluginDefinition }> = [
  { plugin_id: GOALS_PLUGIN_ID, home: createHomeGoalsPlugin, project: createGoalsPlugin },
  { plugin_id: SHELF_PLUGIN_ID, home: createHomeShelfPlugin, project: createShelfPlugin },
];

const PROJECT = "coverage-project";
type Shares = Record<"home" | "project", PluginAppContribution>;

async function started(definition: PluginDefinition, redemption: RedemptionScope, service: ActionService, projectId?: string): Promise<PluginAppContribution | string> {
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { hostIds: ISOLATED_HOST_IDS, redemption: () => redemption,
    actions: { registry: service, ...(projectId ? { project_id: projectId } : {}), providerId: () => definition.manifest.plugin_id } });
  const grants = definition.manifest.permissions.map(declared => declared.permission);
  try {
    const { install } = runtime.install({ definition, deployment: "local", trust: { level: "host" }, grants });
    await runtime.start(install.install_id);
    const contribution = runtime.contribution(install.install_id);
    return contribution?.kind === "app" ? contribution : "没有给出 app 贡献";
  } catch (error) { return error instanceof Error ? error.message : String(error); }
}

/** What the Manifest declares, by kind, against which half offers each. */
function declared(manifest: PluginManifest) {
  return {
    "动作": (manifest.actions ?? []).map(action => `${action.capability_id}@${action.version}`),
    "消费场景": (manifest.action_scenes ?? []).map(scene => `${scene.scene_id}@${scene.version}`),
    "路由": (manifest.routes ?? []).map(route => route.route_id),
    "视图": (manifest.ui.views ?? []).map(view => viewContributionId(manifest, view.view_id)),
    "输入端口处理器": manifest.ports?.inputs?.length ? ["onUpstreamReady"] : [],
    "事件处理器": manifest.events?.subscribes?.length ? ["onEvent"] : [],
  };
}
function offered(contribution: PluginAppContribution): Record<keyof ReturnType<typeof declared>, string[]> {
  return {
    "动作": (contribution.actions ?? []).map(action => `${action.capability_id}@${action.version}`),
    "消费场景": (contribution.action_scenes ?? []).map(scene => `${scene.scene_id}@${scene.version}`),
    "路由": (contribution.routes ?? []).map(route => route.route_id),
    "视图": (contribution.views ?? []).map(view => view.descriptor.contribution_id),
    "输入端口处理器": contribution.onUpstreamReady ? ["onUpstreamReady"] : [],
    "事件处理器": contribution.onEvent ? ["onEvent"] : [],
  };
}

/** Why the two halves do not offer their Manifest exactly once; empty when they do. */
async function coverage(home: PluginDefinition, project: PluginDefinition, actualHome?: PluginAppContribution, actualProject?: PluginAppContribution): Promise<string[]> {
  if (home.manifest !== project.manifest && JSON.stringify(home.manifest) !== JSON.stringify(project.manifest)) return ["两半的 Manifest 不同"];
  const service = new ActionService();
  if (actualHome) service.registerProvider({ provider: { provider_id: home.manifest.plugin_id, title: home.manifest.name, kind: "plugin" },
    definitions: (home.manifest.actions ?? []).filter(definition => actualHome.actions?.some(action => action.capability_id === definition.capability_id && action.version === definition.version)), handlers: actualHome.actions ?? [] });
  const halves = { home: actualHome ?? await started(home, { partial: true, outside_project: true }, service),
    project: actualProject ?? await started(project, { partial: true }, service, PROJECT) };
  const failed = (["home", "project"] as const).filter(half => typeof halves[half] === "string")
    .map(half => `${half === "home" ? "Home" : "项目"}一半没有起来：${halves[half] as string}`);
  if (failed.length) return failed;
  const shares = halves as Shares, byHalf = { home: offered(shares.home), project: offered(shares.project) };
  const problems: string[] = [];
  for (const [kind, items] of Object.entries(declared(home.manifest)) as Array<[keyof ReturnType<typeof declared>, string[]]>) {
    for (const item of items) {
      const by = (["home", "project"] as const).filter(half => byHalf[half][kind].includes(item));
      if (by.length === 0) problems.push(`${kind} ${item} 两半都没有提供`);
      if (by.length === 2) problems.push(`${kind} ${item} 两半都提供`);
    }
  }
  return problems;
}

/** A half that drops part of its share, the way a half that forgot an item would start. */
function without(definition: PluginDefinition, drop: (share: PluginAppContribution) => Partial<PluginAppContribution>): PluginDefinition {
  return { ...definition, async start(context) {
    const share = await definition.start(context);
    assert.equal(share.kind, "app");
    return { ...share, ...drop(share as PluginAppContribution) } as PluginAppContribution;
  } };
}

test("DUAL-03 DUAL-14 every dual-instance registration the Host ships is listed here, and its halves offer its Manifest exactly once", async t => {
  const marked = BUILTIN_PLUGIN_CATALOG.filter(entry => entry.runtime?.dual_instance === true).map(entry => entry.manifest.plugin_id).sort();
  assert.deepEqual(SHIPPED.map(entry => entry.plugin_id).sort(), marked, "a registration marked dual_instance needs its two halves listed in SHIPPED");
  const directory = await mkdtemp(join(tmpdir(), "dual-coverage-"));
  const project = await withMolisWorkProjectCatalog({ homeDirectory: directory }, catalog => catalog.createProject({ display_name: "Shipped dual coverage", actor_id: "owner" }));
  const host = new MolisWorkLocalHost({ homeDirectory: directory, completeText: null });
  t.after(async () => { await host.close(); await rm(directory, { recursive: true, force: true }); });
  const platform = await host.homePlugins!.ready();
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  await host.actionClient(reference).discover(await host.localPersonContext(reference));
  const projectPlatform = await host.withProject(reference, runtime => runningProjectPlatform(runtime.store, project.project_id));
  assert.ok(projectPlatform, "the real project Runtime started");
  for (const entry of SHIPPED) {
    const home = platform.supervisor.contribution(entry.plugin_id);
    const currentProject = projectPlatform.supervisor.contribution(entry.plugin_id);
    assert.ok(home?.kind === "app", entry.plugin_id + " Home half started");
    assert.ok(currentProject?.kind === "app", entry.plugin_id + " project half started");
    assert.deepEqual(await coverage(entry.home(), entry.project(), home, currentProject), [], entry.plugin_id);
  }
});

test("DUAL-03 DUAL-14 the fixture's halves offer every action, route, view and the input handler of its Manifest exactly once", async () => {
  const dual = dualPlugin();
  assert.deepEqual(await coverage(dual.home, dual.project), []);
  // The fixture exercises each kind the check reads, so an empty answer above is not an empty Manifest.
  const kinds = declared(dual.manifest);
  assert.equal(kinds["动作"].length, 4);
  assert.deepEqual([kinds["路由"].length, kinds["视图"].length, kinds["输入端口处理器"].length], [2, 1, 1]);
});

test("DUAL-03 DUAL-14 DUAL-09 an action, route or view left out by both halves, or offered by both, is found", async () => {
  const dual = dualPlugin(), homeAction = `${dual.actions.home.capability_id}@1`;
  const cases: Array<[string, PluginDefinition, PluginDefinition, RegExp]> = [
    ["an action neither half offers", without(dual.home, share => ({ actions: share.actions?.filter(action => action.capability_id !== dual.actions.homeReach.capability_id) })),
      dual.project, new RegExp(`^动作 ${dual.actions.homeReach.capability_id}@1 两半都没有提供$`, "u")],
    ["a route neither half offers", without(dual.home, () => ({ routes: [] })), dual.project, /^路由 home 两半都没有提供$/u],
    ["a view neither half offers", without(dual.home, () => ({ views: [] })), dual.project, new RegExp(`^视图 ${dual.view} 两半都没有提供$`, "u")],
    ["a view both halves offer", dual.home, dual.half("project", () => ({ views: [dual.stage] })), new RegExp(`^视图 ${dual.view} 两半都提供$`, "u")],
    ["a route both halves bind", dual.home, dual.half("project", () => ({ routes: [{ route_id: "home", handle: () => ({ status: 200, body: {} }) }] })),
      /^路由 home 两半都提供$/u],
  ];
  for (const [name, home, project, problem] of cases) {
    const problems = await coverage(home, project);
    assert.equal(problems.length, 1, `${name}: ${problems.join("; ")}`);
    assert.match(problems[0]!, problem, name);
  }
  // An action both halves offer never gets that far: the action service refuses the second registration of the Home half's action,
  // so the project half does not start (DUAL-02).
  const both = await coverage(dual.home, dual.half("project", all => ({ actions: [{ ...all.home, handle: () => ({ half: "project" as const, project_id: null }) }] })));
  assert.equal(both.length, 1, both.join("; "));
  assert.match(both[0]!, /^项目一半没有起来：.*已注册/u, homeAction);
  // A project half that drops the input handler is refused by the Runtime itself: in a project, ports are still owed.
  const portless = await coverage(dual.home, without(dual.project, () => ({ onUpstreamReady: undefined })));
  assert.match(portless.join("; "), /^项目一半没有起来：.*声明了输入端口但没有提供 onUpstreamReady/u);
});
