import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, resolveWebControlToken } from "@molis-ai/molis-work-app-local-host";
import { SqlitePluginRuntimeRepository, PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { definePlugin, defineSubjectContextAction, subjectContext } from "../packages/plugin-sdk/src/index.js";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { localWebActionContext } from "../apps/local-host/dist/local-web-actions.js";
import { HOME_TALK_PERMISSIONS } from "../apps/local-host/src/home-talk-actions.js";

test("real Home HTTP and capability library use installed plugin grants without a Host permission list", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "home-local-grants-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "未知插件权限", actor_id: "owner" }));
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  const token = resolveWebControlToken({ homeDirectory: home });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  const definition = defineSubjectContextAction("newcomer.notes.context", "newcomer-note", "新插件事项", ["newcomer:read"]);
  let reads = 0;
  const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.newcomer", version: "1.0.0", name: "新插件事项",
    kind: "app", publisher: { publisher_id: "example", signature: "example-newcomer" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: "newcomer:read", required: false, reason: "读取这份原始材料" }], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [definition] },
    async start() { return { kind: "app", actions: [{ ...definition, handle: (_caller, input) => {
      reads++; return subjectContext({ subject: { kind: "newcomer-note", id: (input as { subject_id: string }).subject_id }, revision: "1", title: "原始插件标题", content: "来自插件 owner 的真实正文", goal_ids: [], session_id: null });
    } }] }; } });
  let runtime: PluginRuntime | undefined, installId: string | undefined;
  let stopImposter: (() => void) | undefined;
  try {
    const repository = await host.withProject(reference, projectRuntime => new SqlitePluginRuntimeRepository(projectRuntime.store.db));
    runtime = new PluginRuntime(repository, undefined, { actions: { registry: host.actionRegistry(reference), project_id: reference.project_id } });
    installId = runtime.install({ definition: plugin, deployment: "local", grants: [] }).install.install_id;
    await runtime.start(installId);
    const imposter = { ...definition, capability_id: "ungranted.same-permission" };
    stopImposter = host.actionRegistry(reference).registerProvider({ provider: { provider_id: "no-installation-grant", plugin_id: "io.molis.work.example.ungranted", title: "No grant", kind: "plugin" },
      definitions: [imposter], handlers: [{ ...imposter, handle: () => { throw new Error("cannot borrow another installation's permission"); } }] });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const request = (authorized = true, projectId = project.project_id) => fetch(`${origin}/projects/${projectId}/api/home/talk/prepare`, { method: "POST", headers: {
      "content-type": "application/json", origin, ...(authorized ? { "x-molis-work-control-token": token } : {}), "x-molis-work-idempotency-key": randomUUID(),
    }, body: JSON.stringify({ subject: { kind: "newcomer-note", id: "note-42" } }) });
    assert.equal((await request(false)).status, 403); assert.equal(reads, 0);
    assert.notEqual((await request()).status, 200); assert.equal(reads, 0, "declaration alone confers no grant");
    await runtime.stop(installId);
    runtime.grant(installId, ["newcomer:read"]);
    // Grant changes revoke the old contribution; activation republishes the same original installation.
    await runtime.start(installId);
    const prepared = await request(); assert.equal(prepared.status, 200, await prepared.clone().text());
    const body = await prepared.json();
    assert.equal(body.context.content, "来自插件 owner 的真实正文"); assert.equal(body.reader.provider_id, installId); assert.equal(body.selected_session_id, null);
    assert.equal(reads, 2, "Home revalidates original context after Session lookup");
    const directory = await (await fetch(`${origin}/capabilities/library?project=${project.project_id}&action=${definition.capability_id}&version=1`)).text();
    assert.ok(directory.includes("原始插件标题") === false, "capability metadata does not execute the object reader");
    assert.ok(directory.includes("新插件事项")); assert.ok(directory.includes(definition.capability_id)); assert.ok(!directory.includes(imposter.capability_id));
    const local = await localWebActionContext(host, reference, HOME_TALK_PERMISSIONS);
    await assert.rejects(host.actionClient(reference).invoke(local, imposter, { subject_id: "note" }), { code: "actions.forbidden" });
    await assert.rejects(host.actionClient(reference).invoke({ actor_id: "external-client", project_id: project.project_id, audience: "mcp", permissions: [] }, definition, { subject_id: "note" }), { code: "actions.forbidden" });
    const foreign = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "其他项目", actor_id: "owner" }));
    assert.notEqual((await request(true, foreign.project_id)).status, 200);
    await runtime.stop(installId);
    runtime.grant(installId, []); await runtime.start(installId);
    await assert.rejects(async () => local.validate_authority!({ ...definition, provider_id: installId }), { code: "actions.forbidden" });
    assert.notEqual((await request()).status, 200); assert.equal(reads, 2);
    const revoked = await (await fetch(`${origin}/capabilities/library?project=${project.project_id}&action=${definition.capability_id}&version=1`)).text();
    assert.ok(revoked.includes("引用的能力或版本已不可访问"));
    await runtime.stop(installId); await runtime.uninstall(installId);
    const previousId = installId;
    const replacementPlugin = definePlugin({ ...plugin, manifest: { ...plugin.manifest, plugin_id: "io.molis.work.example.newcomer-replacement" } });
    installId = runtime.install({ definition: replacementPlugin, deployment: "local", grants: ["newcomer:read"] }).install.install_id;
    await runtime.start(installId);
    assert.notEqual(installId, previousId);
    await assert.rejects(async () => local.validate_authority!(definition), { code: "actions.forbidden" });
    const replacement = await request(); assert.equal(replacement.status, 200, await replacement.clone().text());
    assert.equal((await replacement.json()).reader.provider_id, installId);
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
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
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
  const installed = runtime.install({ definition: plugin, deployment: "local", grants: [...scene.permissions, ...scene.configuration_permissions] }).install;
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
