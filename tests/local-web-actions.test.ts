import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { LOCAL_OWNER_PERMISSIONS } from "@molis-ai/molis-work-app-local-host";
import {
  LocalProjectDatabase, MolisWorkLocalHost, createLocalFeedApplication, createLocalFeedSourceService, molisWorkHostProjectReference, resolveWebControlToken, seedDemoBoard,
} from "@molis-ai/molis-work-app-local-host";
import { feedItemActions, feedManifest } from "@molis-ai/molis-work-plugin-feed";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { SqlitePluginRuntimeRepository, PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { TODO_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/todo";
import { CHARACTER_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/characters";
import { definePlugin, defineSubjectContextAction, subjectContext } from "@molis-ai/molis-work-plugin-sdk";
import { COGNIA_PLUGIN_ID } from "@molis-ai/molis-work-plugin-cognia";
import { todoManifest } from "@molis-ai/molis-work-plugin-todo";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { bindLocalWebActions, localWebActionContext } from "../apps/local-host/dist/local-web-actions.js";
import { HOME_ACTION_PERMISSIONS } from "../apps/local-host/dist/home-actions.js";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

test("real Home HTTP and capability library use installed plugin grants without a Host permission list", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "home-local-grants-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "未知插件权限", actor_id: "owner" }));
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  const token = resolveWebControlToken({ homeDirectory: home });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  const definition = defineSubjectContextAction("newcomer.notes.context", "newcomer-note", "新插件事项", ["newcomer:read"]);
  let reads = 0;
  const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.newcomer", version: "1.0.0", name: "新插件事项",
    kind: "app", publisher: { publisher_id: "example", signature: "example-newcomer" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: "newcomer:read", required: false, reason: "读取这份原始材料" }], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [definition] },
    async start() { return { kind: "app", actions: [{ ...definition, handle: (_caller, input) => {
      reads++; return subjectContext({ subject: { kind: "newcomer-note", id: (input as { subject_id: string }).subject_id }, revision: "1", title: "原始插件标题", content: "来自插件 owner 的真实正文", goal_ids: [] });
    } }] }; } });
  let runtime: PluginRuntime | undefined, installId: string | undefined;
  let stopImposter: (() => void) | undefined;
  try {
    const repository = await host.withProject(reference, projectRuntime => new SqlitePluginRuntimeRepository(projectRuntime.store.db));
    runtime = new PluginRuntime(repository, undefined, { actions: { registry: host.actionRegistry(reference), project_id: reference.project_id } });
    installId = runtime.install({ trust: { level: "unsigned" }, definition: plugin, deployment: "local", grants: [] }).install.install_id;
    await runtime.start(installId);
    const imposter = { ...definition, capability_id: "ungranted.same-permission" };
    stopImposter = host.actionRegistry(reference).registerProvider({ provider: { provider_id: "no-installation-grant", plugin_id: "io.molis.work.example.ungranted", title: "No grant", kind: "plugin" },
      definitions: [imposter], handlers: [{ ...imposter, handle: () => { throw new Error("cannot borrow another installation's permission"); } }] });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    // The person's own call context is built per call from the installation's current grants, as the Workbench's routes do.
    const read = async (projectReference = reference) => host.actionClient(projectReference).invoke(
      await localWebActionContext(host, projectReference, HOME_ACTION_PERMISSIONS), definition, { subject_id: "note-42" }) as { content: string };
    await assert.rejects(read(), { code: "actions.forbidden" }); assert.equal(reads, 0, "declaration alone confers no grant");
    await runtime.stop(installId);
    runtime.grant(installId, ["newcomer:read"]);
    // Grant changes revoke the old contribution; activation republishes the same original installation.
    await runtime.start(installId);
    assert.equal((await read()).content, "来自插件 owner 的真实正文");
    assert.equal(reads, 1, "the granted installation's reader runs once for the person's call");
    const directory = await (await fetch(`${origin}/capabilities/library?project=${project.project_id}&action=${definition.capability_id}&version=1`)).text();
    assert.ok(directory.includes("原始插件标题") === false, "capability metadata does not execute the object reader");
    assert.ok(directory.includes("新插件事项")); assert.ok(directory.includes(definition.capability_id)); assert.ok(!directory.includes(imposter.capability_id));
    const local = await localWebActionContext(host, reference, LOCAL_OWNER_PERMISSIONS);
    assert.equal(local.locale, undefined, "a context no page asked for names no language: the handler keeps its own default (VUX-40)");
    await assert.rejects(host.actionClient(reference).invoke(local, imposter, { subject_id: "note" }), { code: "actions.forbidden" });
    await assert.rejects(host.actionClient(reference).invoke({ actor_id: "external-client", project_id: project.project_id, audience: "mcp", permissions: [] }, definition, { subject_id: "note" }), { code: "actions.forbidden" });
    const foreign = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "其他项目", actor_id: "owner" }));
    await assert.rejects(read(molisWorkHostProjectReference({ databasePath: foreign.database_path, projectId: foreign.project_id })));
    assert.equal(reads, 1, "another project never reaches this installation's reader");
    await runtime.stop(installId);
    runtime.grant(installId, []); await runtime.start(installId);
    await assert.rejects(async () => local.validate_authority!({ ...definition, provider_id: installId }), { code: "actions.forbidden" });
    await assert.rejects(read(), { code: "actions.forbidden" }); assert.equal(reads, 1);
    const revoked = await (await fetch(`${origin}/capabilities/library?project=${project.project_id}&action=${definition.capability_id}&version=1`)).text();
    assert.ok(revoked.includes("引用的能力或版本已不可访问"));
    await runtime.stop(installId); await runtime.uninstall(installId);
    const previousId = installId;
    const replacementPlugin = definePlugin({ ...plugin, manifest: { ...plugin.manifest, plugin_id: "io.molis.work.example.newcomer-replacement" } });
    installId = runtime.install({ trust: { level: "unsigned" }, definition: replacementPlugin, deployment: "local", grants: ["newcomer:read"] }).install.install_id;
    await runtime.start(installId);
    assert.notEqual(installId, previousId);
    await assert.rejects(async () => local.validate_authority!(definition), { code: "actions.forbidden" });
    assert.equal((await read()).content, "来自插件 owner 的真实正文");
  } finally {
    stopImposter?.();
    if (runtime && installId && runtime.get(installId).state === "running") await runtime.stop(installId);
    if (server.listening) { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
    await host.close(); await rm(home, { recursive: true, force: true });
  }
});

test("scene-only plugins obtain local-user discovery and configuration from their own installation grants", async () => {
  const home = await mkdtemp(join(tmpdir(), "scene-only-grants-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "仅消费场景", actor_id: "owner" }));
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  const scene = { scene_id: "scene-only.review", version: 1, title: "审核位置", description: "插件自有消费场景", trigger: "提交审核", scope: "project" as const,
    permissions: ["scene-only:read"], configuration_permissions: ["scene-only:configure"], subject_kinds: [],
    input_schema: { type: "object", properties: {} }, result_schema: { type: "object", properties: {} } };
  const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.scene-only", version: "1.0.0", name: "仅消费场景",
    kind: "app", publisher: { publisher_id: "example", signature: "scene-only" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [...scene.permissions, ...scene.configuration_permissions].map(permission => ({ permission, required: false, reason: "原消费场景授权" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [], action_scenes: [scene] },
    async start() { return { kind: "app", action_scenes: [{ ...scene,
      targets: () => [{ binding_id: "original-slot", title: "原审核位置", revision: null }], bindings: () => [], bind: () => {}, consume: () => ({}) }] }; } });
  const repository = await host.withProject(reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db));
  const runtime = new PluginRuntime(repository, undefined, { actions: { registry: host.actionRegistry(reference), project_id: reference.project_id } });
  const installed = runtime.install({ trust: { level: "unsigned" }, definition: plugin, deployment: "local", grants: [...scene.permissions, ...scene.configuration_permissions] }).install;
  await runtime.start(installed.install_id);
  try {
    const caller = await localWebActionContext(host, reference, []);
    assert.ok(caller.permissions.includes("scene-only:read")); assert.ok(caller.permissions.includes("scene-only:configure"));
    const target = (await host.sceneClient(reference).targets(caller)).find(value => value.scene_id === scene.scene_id)!;
    assert.equal(target.binding_id, "original-slot"); assert.equal(target.configuration_availability.available, true);
    repository.save({ ...runtime.get(installed.install_id), grants: [...scene.permissions] });
    const revoked = await localWebActionContext(host, reference, []);
    assert.ok(!revoked.permissions.includes("scene-only:configure"));
    assert.equal((await host.sceneClient(reference).targets(revoked)).find(value => value.scene_id === scene.scene_id)!.configuration_availability.available, false);
    await runtime.stop(installed.install_id);
    const stopped = await localWebActionContext(host, reference, []);
    assert.ok(!stopped.permissions.includes("scene-only:read"));
    assert.ok(!(await host.sceneClient(reference).targets(stopped)).some(value => value.scene_id === scene.scene_id));
  } finally { await runtime.stop(installed.install_id); await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("a Runtime plugin registered under its plugin_id gets its local-user grants from the installation its registration names, and a Host-assembled provider with the same id gets none", async () => {
  const home = await mkdtemp(join(tmpdir(), "shared-provider-id-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "同名提供方", actor_id: "owner" }));
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  const pluginId = "io.molis.work.example.shared-id";
  const shape = { scope: "project" as const, audiences: ["user" as const], permissions: ["shared:read"], subject_kinds: [], input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "string" } };
  const pluginRead: ActionDefinition<Record<string, never>, string> = { capability_id: "shared.plugin-read", version: 1, operation: "query", action: { ...shape, title: "插件读取", description: "插件自己的动作", kind: "query" } };
  const hostRead: ActionDefinition<Record<string, never>, string> = { capability_id: "shared.host-read", version: 1, operation: "query", action: { ...shape, title: "宿主读取", description: "宿主另外登记的、同名提供方的动作", kind: "query" } };
  const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: pluginId, version: "1.0.0", name: "同名提供方", kind: "app",
    publisher: { publisher_id: "example", signature: "shared-id" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: "shared:read", required: false, reason: "读取" }], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
    ui: { contributions: [] }, actions: [pluginRead] }, async start() { return { kind: "app", actions: [{ ...pluginRead, handle: () => "plugin" }] }; } });
  const repository = await host.withProject(reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db));
  // The Host's rule for a plugin that ships with it: the plugin id, where an installation id would otherwise be.
  const runtime = new PluginRuntime(repository, undefined, { actions: { registry: host.actionRegistry(reference), project_id: reference.project_id, providerId: record => record.plugin_id } });
  // What the Host assembles by hand for the same plugin (Shelf has such providers), under the same id and with no installation behind it.
  const withdrawHost = host.actionRegistry(reference).registerProvider({ provider: { provider_id: pluginId, plugin_id: pluginId, title: "宿主", kind: "plugin", project_id: reference.project_id },
    definitions: [hostRead], handlers: [{ ...hostRead, handle: () => "host" }] });
  const installId = runtime.install({ trust: { level: "unsigned" }, definition: plugin, deployment: "local", grants: ["shared:read"] }).install.install_id;
  await runtime.start(installId);
  try {
    const caller = await localWebActionContext(host, reference, []);
    const offered = (caller.allowed_actions ?? []).map(entry => `${entry.capability_id}@${entry.provider_id}`);
    assert.ok(offered.includes(`shared.plugin-read@${pluginId}`), "the plugin's action is accepted, under its plugin id");
    assert.ok(!offered.some(entry => entry.startsWith("shared.host-read")), "the Host-assembled provider borrows no installation just because its id is the plugin id");
    assert.ok(caller.permissions.includes("shared:read"));
    assert.equal(await host.actionClient(reference).invoke(caller, pluginRead, {}), "plugin");
    await assert.rejects(host.actionClient(reference).invoke(caller, hostRead, {}), { code: "actions.forbidden" });
    await assert.rejects(async () => caller.validate_authority!({ ...hostRead, provider_id: pluginId }), { code: "actions.forbidden" });
    await caller.validate_authority!({ ...pluginRead, provider_id: pluginId });
    await runtime.stop(installId);
    await assert.rejects(async () => caller.validate_authority!({ ...pluginRead, provider_id: pluginId }), { code: "actions.forbidden" });
    const stopped = (await localWebActionContext(host, reference, [])).allowed_actions ?? [];
    assert.ok(!stopped.some(entry => entry.capability_id === pluginRead.capability_id), "a stopped plugin's action is no longer the person's");
  } finally { withdrawHost(); await runtime.stop(installId).catch(() => undefined); await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("a scene-only plugin registered under its plugin_id obtains local-user discovery and configuration from the installation its registration names", async () => {
  const home = await mkdtemp(join(tmpdir(), "scene-only-plugin-id-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "仅消费场景", actor_id: "owner" }));
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  const scene = { scene_id: "scene-id.review", version: 1, title: "审核位置", description: "插件自有消费场景", trigger: "提交审核", scope: "project" as const,
    permissions: ["scene-id:read"], configuration_permissions: ["scene-id:configure"], subject_kinds: [],
    input_schema: { type: "object", properties: {} }, result_schema: { type: "object", properties: {} } };
  const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.scene-id", version: "1.0.0", name: "仅消费场景",
    kind: "app", publisher: { publisher_id: "example", signature: "scene-id" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [...scene.permissions, ...scene.configuration_permissions].map(permission => ({ permission, required: false, reason: "原消费场景授权" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [], action_scenes: [scene] },
    async start() { return { kind: "app", action_scenes: [{ ...scene,
      targets: () => [{ binding_id: "original-slot", title: "原审核位置", revision: null }], bindings: () => [], bind: () => {}, consume: () => ({}) }] }; } });
  const repository = await host.withProject(reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db));
  const runtime = new PluginRuntime(repository, undefined, { actions: { registry: host.actionRegistry(reference), project_id: reference.project_id, providerId: record => record.plugin_id } });
  const installed = runtime.install({ trust: { level: "unsigned" }, definition: plugin, deployment: "local", grants: [...scene.permissions, ...scene.configuration_permissions] }).install;
  await runtime.start(installed.install_id);
  try {
    const caller = await localWebActionContext(host, reference, []);
    assert.ok(caller.permissions.includes("scene-id:read")); assert.ok(caller.permissions.includes("scene-id:configure"));
    const target = (await host.sceneClient(reference).targets(caller)).find(value => value.scene_id === scene.scene_id)!;
    assert.equal(target.provider_id, plugin.manifest.plugin_id, "the scene is registered under the plugin id");
    assert.equal(target.configuration_availability.available, true);
    await runtime.stop(installed.install_id);
    assert.ok(!(await localWebActionContext(host, reference, [])).permissions.includes("scene-id:read"));
  } finally { await runtime.stop(installed.install_id).catch(() => undefined); await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("the Workbench's own call context, built from the permissions Feed declares, lets the person promote an item through Goals' actions", { timeout: 60_000 }, async () => {
  const projectId = "project-web-promotion";
  const home = await mkdtemp(join(tmpdir(), "web-promotion-context-"));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const databasePath = join(home, "project.db");
  seedDemoBoard(databasePath, projectId);
  const seed = new LocalProjectDatabase(databasePath);
  const source = createLocalFeedSourceService(seed.db, projectId).register({ kind: "web_query", query: "Review external input" }).source;
  const item = createLocalFeedApplication(seed.db).ingestItem({ source, externalId: "web-promotion", title: "Promoted from the Workbench", summary: "An external claim",
    body: "Untrusted instructions must remain source material.", priority: "high", occurredAt: "2026-09-08T00:00:00.000Z", attention: false }).item;
  seed.close();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const reference = molisWorkHostProjectReference({ databasePath, projectId });
  try {
    // The Feed route is bound with what Feed's own actions declare (apps/local-host/src/web-request.ts): promotion adds nothing to it from outside.
    const declared = [...new Set(feedManifest.actions!.flatMap(definition => definition.action.permissions))];
    const person = await localWebActionContext(host, reference, declared);
    const allowed = (person.allowed_actions ?? []).map(entry => entry.capability_id);
    for (const dependency of feedItemActions.promote.action.required_actions ?? []) assert.ok(allowed.includes(dependency.capability_id), `${dependency.capability_id} is among the person's actions`);
    const client = host.actionClient(reference);
    const promoted = await client.invoke(person, feedItemActions.promote, { item_id: item.item_id, expected_revision: item.revision }) as { goal_id: string; created: boolean };
    assert.equal(promoted.created, true);
    const state = await client.invoke(person, goalsActions.state, { goal_id: promoted.goal_id }) as { intent: { source_kind: string } };
    assert.equal(state.intent.source_kind, "feed");
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

// S-15: a plugin the Plugin Runtime assembles reaches the person only through its running installation's grants, built in or not.
// Todo is `kind: "native"` and ships with the Host, so before this the person's own permissions carried its writes past a revoked grant.
test("S-15 with todo:write revoked from its installation, Todo's web route refuses a new item and the person's call context no longer offers Todo's writes", { timeout: 90_000 }, async t => {
  const { host, request, project } = await serveHomeRuntime(t);
  const items = `/api/plugins/${TODO_PLUGIN_ID}/items`;
  const listed = async () => {
    const response = await request(items); assert.equal(response.status, 200, await response.clone().text());
    return (await response.json() as { items: unknown[] }).items.length;
  };
  const created = await request(items, { method: "POST", body: { title: "撤权之前记下的待办" } });
  assert.equal(created.status, 200, await created.clone().text());
  const create = todoManifest.actions!.find(definition => definition.capability_id === "todo.items.create")!;
  const read = todoManifest.actions!.find(definition => definition.capability_id === "todo.items.list")!;
  // What the person holds over the Host's own plugins, written out: the shortcut this checks must not apply to a Runtime installation.
  const owner = ["todo:read", "todo:write"];
  const granted = await localWebActionContext(host, undefined, owner);
  const offered = (granted.allowed_actions ?? []).find(entry => entry.capability_id === create.capability_id);
  assert.ok(offered, "the installation holds todo:write, so its write is the person's");
  await granted.validate_authority!({ ...create, provider_id: offered.provider_id });

  const platform = await host.homePlugins!.ready(), install = host.homePlugins!.installation(TODO_PLUGIN_ID)!;
  await platform.runtime.stop(install.install_id);
  platform.runtime.grant(install.install_id, install.grants.filter(permission => permission !== "todo:write"));
  assert.equal((await platform.supervisor.restart(TODO_PLUGIN_ID)).status, "running");

  const before = await listed();
  const refused = await request(items, { method: "POST", body: { title: "撤权之后不该记下的待办" } });
  const refusal = await refused.json() as { code: string };
  assert.deepEqual([refused.status, refusal.code], [403, "actions.forbidden"]);
  assert.equal(await listed(), before, "reading still works, and nothing was written");
  await assert.rejects(async () => granted.validate_authority!({ ...create, provider_id: offered.provider_id }), { code: "actions.forbidden" });
  const revoked = await localWebActionContext(host, undefined, owner);
  const allowed = (revoked.allowed_actions ?? []).map(entry => entry.capability_id);
  assert.ok(!allowed.includes(create.capability_id), "a revoked grant is not made up by the person's own permissions");
  assert.ok(allowed.includes(read.capability_id), "the read the installation still holds is offered");
  await assert.rejects(host.homeActionClient().invoke(revoked, create, { title: "经动作网关也记不下" }), { code: "actions.forbidden" });
  assert.equal(await listed(), before);

  // PG-007 stage 4 (RAC-338): over a provider the Host registers itself, the person holds only what is declared for that provider. The
  // person holds artifact:write over Characters; a Host provider that is not Characters and asks for it is neither offered nor reached.
  const { reference } = await project("宿主自己的提供方");
  let handled = 0;
  const hostWrite: ActionDefinition<Record<string, never>, string> = { capability_id: "hostowned.write", version: 1, operation: "query", action: { title: "宿主写入",
    description: "宿主自己登记、要成果写入权限的动作", kind: "query", scope: "project", audiences: ["user"], permissions: ["artifact:write"], subject_kinds: [],
    input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "string" } } };
  const withdraw = host.actionRegistry(reference).registerProvider({ provider: { provider_id: "host-owned", plugin_id: "io.molis.work.example.host-owned", title: "宿主", kind: "plugin", project_id: reference.project_id },
    definitions: [hostWrite], handlers: [{ ...hostWrite, handle: () => { handled += 1; return "host"; } }] });
  try {
    assert.ok(LOCAL_OWNER_PERMISSIONS.includes("artifact:write"), "the permission is one the person may carry");
    const person = await localWebActionContext(host, reference, LOCAL_OWNER_PERMISSIONS);
    const views = await host.actionClient(reference).discover(person);
    assert.ok(views.some(view => view.provider.provider_id === CHARACTER_PLUGIN_ID && view.action.permissions.includes("artifact:write")), "it is held over Characters");
    assert.ok(!(person.allowed_actions ?? []).some(entry => entry.provider_id === "host-owned"), "the other Host provider is not offered");
    await assert.rejects(person.validate_authority!({ ...hostWrite, provider_id: "host-owned" }), { code: "actions.forbidden" });
    await assert.rejects(host.actionClient(reference).invoke(person, hostWrite, {}), { code: "actions.forbidden" });
    assert.equal(handled, 0, "the handler never ran");
  } finally { withdraw(); }
});

// PG-007 stage 4 (RAC-339): moving the person's permissions onto each Host provider takes nothing away from a provider the Host
// registers today. Every Host-registered action whose permissions the person may carry is still offered, in a project and at Home.
test("RAC-339 every action a Host provider registers today is still the person's after the owner permissions move onto providers", { timeout: 90_000 }, async t => {
  const { host, project, request } = await serveHomeRuntime(t);
  const { reference } = await project("宿主提供方的全部动作");
  // RAC-339-REVIEW-01: the Assistant's HTTP composition conditionally folds thread actions into its rules provider.
  const prepared = await request("/api/assistant/works");
  assert.equal(prepared.status, 200, await prepared.clone().text());
  for (const scope of [reference, undefined]) {
    const base = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: scope?.project_id ?? null, audience: "user" as const, permissions: LOCAL_OWNER_PERMISSIONS };
    const hostOwned = (await host.inspectActions(base, scope)).filter(view => view.provider.plugin_install_id === undefined
      && (!view.provider.project_id || view.provider.project_id === scope?.project_id) && (view.action.scope === "home" || scope)
      && view.action.permissions.every(permission => LOCAL_OWNER_PERMISSIONS.includes(permission)));
    assert.ok(hostOwned.length > 10, "the Host's own providers are there to check");
    const offered = new Set(((await localWebActionContext(host, scope, LOCAL_OWNER_PERMISSIONS)).allowed_actions ?? []).map(entry => `${entry.provider_id} ${entry.capability_id}@${entry.version}`));
    const missing = hostOwned.map(view => `${view.provider.provider_id} ${view.capability_id}@${view.version}`).filter(key => !offered.has(key));
    assert.deepEqual(missing, [], scope ? "in a project" : "at Home");
  }
  const full = await localWebActionContext(host, reference, LOCAL_OWNER_PERMISSIONS);
  const withoutModel = await localWebActionContext(host, reference, LOCAL_OWNER_PERMISSIONS.filter(permission => permission !== "model:invoke"));
  const rule = full.allowed_actions!.find(entry => entry.capability_id === "assistant.rules.list");
  assert.ok(rule, "the conditionally registered rules are offered");
  assert.ok(withoutModel.allowed_actions!.some(entry => entry.capability_id === rule.capability_id));
  const listed = await host.actionClient(reference).invoke(withoutModel, rule, {}) as { rules: unknown[] };
  assert.ok(Array.isArray(listed.rules), "rules can still be read without a model permission");
  for (const [capability, input] of [
    ["assistant.threads.start", { target: { provider_id: "absent", subject_kind: "note", subject_id: "one", thread_id: "one" }, message_id: "one" }],
    ["assistant.threads.retry", { work_id: "absent", revision: 1 }],
  ] as const) {
    const action = full.allowed_actions!.find(entry => entry.capability_id === capability);
    assert.ok(action, `${capability} retains the model permission its definition requires`);
    assert.equal(action.provider_id, rule.provider_id, "threads and rules share their actual provider");
    await full.validate_authority!(action);
    assert.ok(!withoutModel.allowed_actions!.some(entry => entry.capability_id === capability));
    await assert.rejects(withoutModel.validate_authority!(action), { code: "actions.forbidden" });
    await assert.rejects(host.actionClient(reference).invoke(withoutModel, action, input), { code: "actions.forbidden" });
  }
});

test("RAC-339-REVIEW-02 external MCP providers hold only mcp:external and remain bounded by the route", { timeout: 90_000 }, async t => {
  const { host, project } = await serveHomeRuntime(t);
  const { reference } = await project("外部 MCP 提供方权限");
  for (const [providerId, scope] of [["system.connectors#mcp:review-connection", "home"], ["io.molis.work.example#mcp:review-server", "project"]] as const) {
    let handled = 0;
    const tool: ActionDefinition = { capability_id: `review.${scope}.mcp`, version: 1, operation: "query", action: {
      title: "外部工具", description: "提供方权限验证", kind: "query", scope, audiences: ["user"], permissions: ["mcp:external"], subject_kinds: [],
      input_schema: { type: "object", properties: {}, additionalProperties: false }, output_schema: { type: "boolean" },
    } };
    const extra = { ...tool, capability_id: `${tool.capability_id}.extra`, action: { ...tool.action, permissions: ["mcp:external", "artifact:write"] } };
    const registry = scope === "home" ? host.actionRegistry() : host.actionRegistry(reference);
    const withdraw = registry.registerProvider({ provider: { provider_id: providerId, title: "MCP", kind: scope === "home" ? "system" : "mcp",
      ...(scope === "project" ? { project_id: reference.project_id } : {}) }, definitions: [tool, extra],
      handlers: [tool, extra].map(definition => ({ ...definition, handle: () => { handled++; return true; } })) });
    try {
      const caller = await localWebActionContext(host, reference, ["mcp:external", "artifact:write"]);
      const ref = { ...tool, provider_id: providerId }, extraRef = { ...extra, provider_id: providerId };
      assert.ok(caller.allowed_actions!.some(entry => entry.capability_id === tool.capability_id && entry.provider_id === providerId));
      await caller.validate_authority!(ref);
      assert.equal(await host.actionClient(reference).invoke(caller, ref, {}), true);
      assert.ok(!caller.allowed_actions!.some(entry => entry.capability_id === extra.capability_id));
      await assert.rejects(caller.validate_authority!(extraRef), { code: "actions.forbidden" });
      await assert.rejects(host.actionClient(reference).invoke(caller, extraRef, {}), { code: "actions.forbidden" });
      const capped = await localWebActionContext(host, reference, ["artifact:write"]);
      assert.ok(!capped.allowed_actions!.some(entry => entry.capability_id === tool.capability_id));
      await assert.rejects(capped.validate_authority!(ref), { code: "actions.forbidden" });
      await assert.rejects(host.actionClient(reference).invoke(capped, ref, {}), { code: "actions.forbidden" });
      assert.equal(handled, 1, "only the authorized MCP tool invocation reached a handler");
    } finally { withdraw(); }
  }
});

// VUX-35: a bound client shares one authority snapshot across its calls. It is meant for one request: a grant revoked meanwhile is still
// refused by the same client, and a grant given afterwards is only seen by a client bound after it.
test("VUX-35 a bound client refuses a write revoked after it was bound, and a grant given later reaches only a client bound after it", { timeout: 90_000 }, async t => {
  const { host } = await serveHomeRuntime(t);
  const create = todoManifest.actions!.find(definition => definition.capability_id === "todo.items.create")!;
  const owner = ["todo:read", "todo:write"];
  const platform = await host.homePlugins!.ready(), install = host.homePlugins!.installation(TODO_PLUGIN_ID)!;
  const regrant = async (grants: readonly string[]) => {
    await platform.runtime.stop(install.install_id);
    platform.runtime.grant(install.install_id, [...grants]);
    assert.equal((await platform.supervisor.restart(TODO_PLUGIN_ID)).status, "running");
  };
  const granted = bindLocalWebActions(host, undefined, owner);
  await granted.invoke(create, { title: "绑定之后记下的待办" });
  const without = install.grants.filter(permission => permission !== "todo:write");
  await regrant(without);
  await assert.rejects(granted.invoke(create, { title: "撤权之后同一个客户端记不下" }), { code: "actions.forbidden" });

  const boundWhileRevoked = bindLocalWebActions(host, undefined, owner);
  await boundWhileRevoked.discover();
  await regrant([...without, "todo:write"]);
  await assert.rejects(boundWhileRevoked.invoke(create, { title: "授权之前绑定的客户端看不到新授权" }), { code: "actions.forbidden" });
  await bindLocalWebActions(host, undefined, owner).invoke(create, { title: "授权之后新绑定的客户端记得下" });
});

// S-51 (C8-1): the control a dispatch hands its bound client (whether the follow-up still counts) joins that client's checks, at the
// dispatcher's validation and at its last synchronous check, so a control that no longer counts stops the write before the handler.
test("S-51 a bound client passes its call's control on: a control refusing at beforeEffect or at its last check stops the write", { timeout: 90_000 }, async t => {
  const { host } = await serveHomeRuntime(t);
  const [create, list] = ["todo.items.create", "todo.items.list"].map(id => todoManifest.actions!.find(definition => definition.capability_id === id)!) as [ActionDefinition, ActionDefinition];
  const client = bindLocalWebActions(host, undefined, ["todo:read", "todo:write"]), gone = () => new ActionError("actions.cancelled", "这次跟进已经不算数");
  const total = async () => (await client.invoke(list, { all_projects: true }) as { counts: { all: number } }).counts.all, before = await total();
  await assert.rejects(client.invoke(create, { title: "control 在 beforeEffect 拒绝" }, { beforeEffect: async () => { throw gone(); } }), { code: "actions.cancelled" });
  await assert.rejects(client.invoke(create, { title: "control 在最后一次检查拒绝" }, { beforeEffect: async () => {}, assert_authority_current: () => { throw gone(); } }), { code: "actions.cancelled" });
  assert.equal(await total(), before, "neither write reached Todo");
  const made = await client.invoke(create, { title: "control 放行时记得下" }, { beforeEffect: async () => {}, assert_authority_current: () => {} }) as { item: { title: string } };
  assert.equal(made.item.title, "control 放行时记得下"); assert.equal(await total(), before + 1, "the same client writes once its control lets it");
});

// §4 o of privileges.md (PG-007): a Runtime route's own permission is the person's only as far as its installation holds it, whatever else
// the caller brings. Cognia's routes declare `cognia:read` themselves, so the router's gate is the one asked here.
test("S-15 with cognia:read revoked from its installation, Cognia's read route is refused while the plugin keeps running", { timeout: 90_000 }, async t => {
  const { host, request } = await serveHomeRuntime(t);
  const library = `/api/plugins/${COGNIA_PLUGIN_ID}/library`;
  const opened = await request(library); assert.equal(opened.status, 200, await opened.clone().text());
  const platform = await host.homePlugins!.ready(), install = host.homePlugins!.installation(COGNIA_PLUGIN_ID)!;
  await platform.runtime.stop(install.install_id);
  platform.runtime.grant(install.install_id, install.grants.filter(permission => permission !== "cognia:read"));
  assert.equal((await platform.supervisor.restart(COGNIA_PLUGIN_ID)).status, "running");
  const refused = await request(library);
  assert.deepEqual([refused.status, (await refused.json() as { code: string }).code], [403, "actions.forbidden"]);
});

// §10.29's reproduction for #744: Images is a Home plugin whose Manifest says `kind: "native"`. With `images:read` revoked, its jobs
// route is refused by the route's own gate (`actions.forbidden`), not first let through on the person's permissions and then refused
// by the provider (`actions.plugin_permission`); the read it still holds keeps working.
test("S-15 with images:read revoked from its installation, the Images jobs route is refused at the route layer", { timeout: 90_000 }, async t => {
  const { host, request, project } = await serveHomeRuntime(t);
  const plugin = "io.molis.work.images", { project_id } = await project("撤掉图片读取授权");
  const jobs = `/projects/${project_id}/api/plugins/${plugin}/jobs`;
  assert.deepEqual(await (await request(jobs)).json(), { jobs: [] });
  const platform = await host.homePlugins!.ready(), install = host.homePlugins!.installation(plugin)!;
  await platform.runtime.stop(install.install_id);
  platform.runtime.grant(install.install_id, install.grants.filter(permission => permission !== "images:read"));
  assert.equal((await platform.supervisor.restart(plugin)).status, "running");
  const refused = await request(jobs);
  assert.deepEqual([refused.status, (await refused.json() as { code: string }).code], [403, "actions.forbidden"]);
  assert.equal((await request(`/api/plugins/${plugin}/connections`)).status, 200, "the connections read it still holds keeps working");
});

// PG-008 (RAC-651): the routes that bound a hand-written client (the 成果库's owner previews, project references, the Shelf settings,
// project onboarding) now bind the person's client. The permissions a route names bound what it reaches of the Host's own providers;
// they add nothing to a Runtime plugin's installation, which the hand-written client let through to the provider on the person's word.
test("S-15 RAC-651 the permissions a route names reach a Runtime plugin's action only through its installation's grants", { timeout: 90_000 }, async t => {
  const { host, project } = await serveHomeRuntime(t);
  const { reference } = await project("路由写下的权限");
  const definition = defineSubjectContextAction("capped.notes.context", "capped-note", "路由上限", ["capped:read"]);
  let reads = 0;
  const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.capped", version: "1.0.0", name: "路由上限",
    kind: "app", publisher: { publisher_id: "example", signature: "example-capped" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: "capped:read", required: false, reason: "读取" }], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [definition] },
    async start() { return { kind: "app", actions: [{ ...definition, handle: (_caller, input) => {
      reads++; return subjectContext({ subject: { kind: "capped-note", id: (input as { subject_id: string }).subject_id }, revision: "1", title: "t", content: "正文", goal_ids: [] });
    } }] }; } });
  const repository = await host.withProject(reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db));
  const runtime = new PluginRuntime(repository, undefined, { actions: { registry: host.actionRegistry(reference), project_id: reference.project_id } });
  const installId = runtime.install({ trust: { level: "unsigned" }, definition: plugin, deployment: "local", grants: [] }).install.install_id;
  await runtime.start(installId);
  try {
    await assert.rejects(bindLocalWebActions(host, reference, ["capped:read"]).invoke(definition, { subject_id: "n" }), { code: "actions.forbidden" });
    assert.equal(reads, 0, "the route's own gate refused it; the provider never ran");
    await runtime.stop(installId);
    runtime.grant(installId, ["capped:read"]);
    await runtime.start(installId);
    assert.equal((await bindLocalWebActions(host, reference, ["capped:read"]).invoke(definition, { subject_id: "n" }) as { content: string }).content, "正文");
    assert.equal(reads, 1);
  } finally { if (runtime.get(installId).state === "running") await runtime.stop(installId); }
});
