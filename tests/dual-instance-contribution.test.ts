import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { defineAction, definePlugin } from "@molis-ai/molis-work-plugin-sdk";
import { MemoryPluginRuntimeRepository, PluginRuntime, type RedemptionScope } from "@molis-ai/molis-work-plugin-runtime";
import { FILE_SNAPSHOT_SCHEMA_VERSION, FILE_SNAPSHOT_TYPE } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { ActionError, type ActionCallContext, type ActionSceneDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginAppContribution, PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * S0-2b-1 (specs/dual-instance-plugins): a Plugin that runs both in the Home and in a project starts once in each, and each
 * half redeems only its own part of the one Manifest. Which redemption a start owes is the Host's word (`redemption`), never
 * the Plugin's; without it every declared item is owed, as before. What a half returns is still checked against the Manifest
 * in full, and ports and events still reach only project instances.
 */

const PLUGIN = "io.molis.work.example.dual";
const PROJECT = "project-one";
const home: ActionCallContext = { actor_id: "alice", audience: "user", permissions: [] };
const inProject: ActionCallContext = { ...home, project_id: PROJECT };
const empty = { type: "object", additionalProperties: false };

function read(name: string, scope: "home" | "project") {
  return defineAction<Record<string, never>, { from: string }>({
    capability_id: `${PLUGIN}.${name}`, version: 1, operation: "query",
    action: { title: name, description: `读 ${name}`, kind: "query", scope, audiences: ["user"], permissions: [], subject_kinds: ["text"],
      input_schema: empty, output_schema: { type: "object", properties: { from: { type: "string" } }, required: ["from"] } },
  }, () => ({ from: name }));
}
const homeRead = read("home-read", "home");
const projectRead = read("project-read", "project");
const scene: ActionSceneDefinition = { scene_id: `${PLUGIN}.arrived`, version: 1, title: "材料到达", description: "处理新材料",
  trigger: "material-arrived", scope: "project", subject_kinds: ["text"], input_schema: empty, result_schema: empty, permissions: [] };
const sceneHandler = { scene_id: scene.scene_id, version: 1, bindings: () => [], bind: () => {}, consume: () => ({}) };
const route = (route_id: string) => ({ route_id, handle: () => ({ status: 200, body: { route_id } }) });
const subscribes = [{ event_type_id: "io.molis.work.files.refreshed", type_version: 1, from_plugin_ids: ["io.molis.work.files"] }];
const inputs = [{ port: "snapshot", artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION, optional: true }];

function manifest(extra: Partial<PluginManifest> = {}): PluginManifest {
  return { schema_version: 2, host_api_version: 2, plugin_id: PLUGIN, version: "1.0.0", name: "双实例示例", kind: "app",
    publisher: { publisher_id: "molis", signature: "dual-example" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    actions: [homeRead.definition, projectRead.definition], action_scenes: [scene],
    routes: [{ route_id: "home-page", method: "GET", path: "/home" }, { route_id: "project-page", method: "GET", path: "/project" }],
    ...extra };
}
function plugin(contribution: Omit<PluginAppContribution, "kind">, extra?: Partial<PluginManifest>): PluginDefinition {
  return definePlugin({ manifest: manifest(extra), async start() { return { kind: "app", ...contribution }; } });
}
/** The Home half: the Home action and route. The project half: the project action, the scene and the project route. */
const homeHalf = () => plugin({ actions: [homeRead.handler], routes: [route("home-page")] });
const projectHalf = () => plugin({ actions: [projectRead.handler], action_scenes: [sceneHandler], routes: [route("project-page")] });

function runtime(service: ActionService, redemption?: (definition: PluginDefinition) => RedemptionScope, projectId?: string) {
  return new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { ...(redemption ? { redemption } : {}),
    actions: { registry: service, ...(projectId ? { project_id: projectId } : {}), providerId: () => PLUGIN } });
}
async function start(target: PluginRuntime, definition: PluginDefinition) {
  const grants = definition.manifest.permissions.map(declared => declared.permission);
  const installed = target.install({ trust: { level: "unsigned" }, definition, deployment: "local", grants }).install;
  await target.start(installed.install_id);
  return target.get(installed.install_id);
}
const unredeemed = (...fragments: string[]) => (error: unknown) => error instanceof ActionError
  && error.code === "plugin.contribution_unredeemed" && fragments.every(fragment => error.message.includes(fragment));

test("DUAL-04: a partial half starts with its own actions and routes; the same half without the Host's word is refused", async () => {
  const service = new ActionService();
  await assert.rejects(start(runtime(service), homeHalf()),
    unredeemed(`声明的能力 ${projectRead.definition.capability_id}@1 没有兑现`, `声明的消费场景 ${scene.scene_id}@1 没有兑现`, "声明的路由 project-page 没有兑现"));
  assert.deepEqual(service.discover(home), []);

  const record = await start(runtime(service, () => ({ partial: true, outside_project: true })), homeHalf());
  assert.equal(record.state, "running");
  // Only what the half delivers is registered: the other half's action is not offered from here.
  assert.deepEqual(service.discover(home).map(d => d.capability_id), [homeRead.definition.capability_id]);
  assert.deepEqual(await service.invoke(home, homeRead.definition, {}), { from: "home-read" });
  await assert.rejects(service.invoke(inProject, projectRead.definition, {}), (e: ActionError) => e.code === "actions.missing");
});

test("DUAL-04: under partial a handler, scene or route the Manifest does not declare is still refused", async () => {
  const undeclared = read("undeclared", "home");
  for (const [name, contribution, fragment] of [
    ["action", { actions: [homeRead.handler, undeclared.handler] }, `能力 ${undeclared.definition.capability_id}@1 未声明、重复或缺少处理器`],
    ["duplicate action", { actions: [homeRead.handler, homeRead.handler] }, `能力 ${homeRead.definition.capability_id}@1 未声明、重复或缺少处理器`],
    ["scene", { action_scenes: [{ ...sceneHandler, scene_id: `${PLUGIN}.other` }] }, `消费场景 ${PLUGIN}.other@1 未声明`],
    ["route", { routes: [route("home-page"), route("elsewhere")] }, "路由 elsewhere 没有在 Manifest 里声明"],
    ["event handler", { onEvent: () => {} }, "提供了 onEvent 但 Manifest 没有声明任何订阅"],
  ] as const) {
    const service = new ActionService();
    await assert.rejects(start(runtime(service, () => ({ partial: true, outside_project: true })), plugin(contribution)), unredeemed(fragment), name);
    assert.deepEqual(service.discover(home), [], name);
  }
});

test("DUAL-04: the scope is per definition; a plugin the Host does not name still redeems every declared item", async () => {
  const service = new ActionService();
  const half = homeHalf();
  const target = runtime(service, definition => definition === half ? { partial: true, outside_project: true } : {});
  assert.equal((await start(target, half)).state, "running");
  const other = definePlugin({ manifest: { ...manifest(), plugin_id: `${PLUGIN}-other`, actions: [], action_scenes: [] },
    async start() { return { kind: "app", routes: [route("home-page")] }; } });
  await assert.rejects(start(target, other), unredeemed("声明的路由 project-page 没有兑现"));
  // A full redemption registers every declared action, in Manifest order, as before.
  const fullService = new ActionService();
  const full = await start(runtime(fullService), plugin({ actions: [projectRead.handler, homeRead.handler],
    action_scenes: [sceneHandler], routes: [route("project-page"), route("home-page")] }));
  assert.equal(full.state, "running");
  assert.deepEqual(fullService.discover(inProject).map(d => d.capability_id), [homeRead.definition.capability_id, projectRead.definition.capability_id]);
});

test("DUAL-04: ports and events reach only project instances, so a partial half inside a project still answers them", async () => {
  const declared = { permissions: [{ permission: "artifact:read", required: true, reason: "读取绑定的上游产出" }],
    events: { publishes: [], subscribes }, ports: { inputs, outputs: [] },
    artifacts: { produces: [], consumes: [{ artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION }] } };
  const silent = () => plugin({ actions: [projectRead.handler] }, declared);
  await assert.rejects(start(runtime(new ActionService(), () => ({ partial: true }), PROJECT), silent()),
    unredeemed("声明了事件订阅但没有提供 onEvent", "声明了输入端口但没有提供 onUpstreamReady"));
  // Whether a half is outside any project is the Runtime's own project, not the Host's word: in a project the half still owes them.
  await assert.rejects(start(runtime(new ActionService(), () => ({ partial: true, outside_project: true }), PROJECT), silent()),
    unredeemed("声明了事件订阅但没有提供 onEvent", "声明了输入端口但没有提供 onUpstreamReady"));
  const answering = plugin({ actions: [projectRead.handler], onEvent: () => {}, onUpstreamReady: () => {} }, declared);
  assert.equal((await start(runtime(new ActionService(), () => ({ partial: true }), PROJECT), answering)).state, "running");
  // No project's ports or events reach a Home half, so it need not answer them.
  const homeOnly = plugin({ actions: [homeRead.handler] }, declared);
  assert.equal((await start(runtime(new ActionService(), () => ({ partial: true, outside_project: true })), homeOnly)).state, "running");
  // `outside_project` alone releases nothing: without `partial` every declared item is owed.
  await assert.rejects(start(runtime(new ActionService(), () => ({ outside_project: true })), homeOnly), unredeemed("声明了事件订阅但没有提供 onEvent"));
});

test("DUAL-01, DUAL-02 (Runtime level): two halves run side by side under the plugin's id; one action id in both is refused", async () => {
  const service = new ActionService();
  const homeRuntime = runtime(service, () => ({ partial: true, outside_project: true }));
  const projectRuntime = runtime(service, () => ({ partial: true }), PROJECT);
  const homeRecord = await start(homeRuntime, homeHalf());
  const projectRecord = await start(projectRuntime, projectHalf());
  assert.equal(homeRecord.install_id, projectRecord.install_id);
  assert.notEqual(homeRecord.installation_generation, projectRecord.installation_generation);
  const offered = service.discover(inProject);
  assert.deepEqual(offered.map(d => [d.capability_id, d.provider.provider_id, d.provider.project_id ?? null]).sort(), [
    [homeRead.definition.capability_id, PLUGIN, null],
    [projectRead.definition.capability_id, PLUGIN, PROJECT],
  ]);
  assert.deepEqual(await service.invoke(inProject, projectRead.definition, {}), { from: "project-read" });
  assert.deepEqual(await service.invoke(inProject, homeRead.definition, {}), { from: "home-read" });

  // A second project instance offering the Home half's action collides with it instead of silently replacing it.
  const overlapping = runtime(service, () => ({ partial: true }), "project-two");
  await assert.rejects(start(overlapping, plugin({ actions: [homeRead.handler, projectRead.handler] })), unredeemed("Capability 已注册"));
  assert.deepEqual(await service.invoke(inProject, homeRead.definition, {}), { from: "home-read" });
});
