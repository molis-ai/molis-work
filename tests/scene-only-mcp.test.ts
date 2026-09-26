import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalMcpServer, MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { PluginRuntime, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { ActionError, sceneConfigurationActions, type ActionDefinition, type ActionSceneBinding, type ActionSceneTarget } from "@molis-ai/molis-work-contracts/platform/actions";
import { definePlugin } from "../packages/plugin-sdk/src/index.js";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { hostActionToolName } from "../apps/local-host/src/mcp-action-grants.js";

test("scene-only plugin receives exact MCP configuration grants through existing settings and updates its original storage", { timeout: 90_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "scene-only-mcp-")), token = "scene-only-mcp-configuration-control-token";
  const project = await withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "场景管理", actor_id: "owner" }));
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  const db = await host.withProject(reference, runtime => runtime.store.db);
  db.exec("CREATE TABLE fixture_scene_configuration (id TEXT PRIMARY KEY, value TEXT NOT NULL, revision TEXT NOT NULL); CREATE TABLE fixture_scene_effect (value INTEGER NOT NULL)");
  db.prepare("INSERT INTO fixture_scene_effect VALUES (0)").run();
  const resultSchema = { type: "object", properties: { accepted: { type: "boolean" } }, required: ["accepted"], additionalProperties: false };
  const scene = { scene_id: `SceneOnly:${randomUUID()}`, version: 3, title: "只提供场景的插件", description: "审核后修改原数据", trigger: "原对象提交",
    scope: "project" as const, permissions: ["only:run"], configuration_permissions: ["only:configure"], subject_kinds: [],
    input_schema: { type: "object", properties: {}, additionalProperties: false }, result_schema: resultSchema };
  const judgment: ActionDefinition = { capability_id: "fixture.scene.judgment", version: 1, operation: "command", action: {
    title: "接受判断", description: "判断原始内容", kind: "judgment", scope: "project", audiences: ["user", "mcp"], permissions: ["judgment:run"], subject_kinds: [],
    input_schema: scene.input_schema, output_schema: resultSchema,
  } };
  const judgmentRef = { capability_id: judgment.capability_id, version: judgment.version, provider_id: "fixture.judgment" };
  const removeJudgment = host.actionRegistry(reference).registerProvider({ provider: { provider_id: judgmentRef.provider_id, title: "判断", kind: "system" },
    definitions: [judgment], handlers: [{ ...judgment, handle: () => ({ accepted: true }) }] });
  const current = () => {
    const row = db.prepare("SELECT value,revision FROM fixture_scene_configuration WHERE id = 'original-slot'").get() as { value: string; revision: string } | undefined;
    return row ? { ...JSON.parse(row.value), revision: row.revision } as ActionSceneBinding : null;
  };
  let onTargets: (() => Promise<void>) | undefined;
  const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.only-scene-mcp", version: "1.0.0", name: scene.title,
    kind: "app", publisher: { publisher_id: "example", signature: "only-scene-mcp" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [...scene.permissions, ...scene.configuration_permissions].map(permission => ({ permission, required: false, reason: "管理或运行原场景" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [], action_scenes: [scene] },
    async start() { return { kind: "app", action_scenes: [{ ...scene,
      targets: async () => { await onTargets?.(); return [{ binding_id: "original-slot", title: "原审核位置", revision: current()?.revision ?? null }]; },
      bindings: () => { const binding = current(); return binding ? [binding] : []; },
      bind: (_caller, binding, options) => {
        assert.ok(options);
        const result = options.expected_revision === null
          ? db.prepare("INSERT INTO fixture_scene_configuration VALUES ('original-slot',?,?) ON CONFLICT(id) DO NOTHING").run(JSON.stringify(binding), randomUUID())
          : db.prepare("UPDATE fixture_scene_configuration SET value = ?,revision = ? WHERE id = 'original-slot' AND revision = ?").run(JSON.stringify(binding), randomUUID(), options.expected_revision);
        if (result.changes !== 1) throw new ActionError("fixture.conflict", "原规则已变化");
      },
      consume: (_caller, _input, result) => {
        assert.deepEqual(result, { accepted: true });
        db.prepare("UPDATE fixture_scene_effect SET value = value + 1").run();
        return { saved: true };
      },
    }] }; } });
  const repository = new SqlitePluginRuntimeRepository(db);
  const runtime = new PluginRuntime(repository, undefined, { actions: { registry: host.actionRegistry(reference), project_id: project.project_id } });
  const installed = runtime.install({ definition: plugin, deployment: "local", grants: [...scene.permissions, ...scene.configuration_permissions] }).install;
  const caller = { actor_id: "owner", project_id: project.project_id, audience: "user" as const, permissions: ["only:run", "only:configure", "judgment:run"] };
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  let external: LocalMcpServer | undefined;
  try {
    await runtime.start(installed.install_id);
    const management = sceneConfigurationActions(scene);
    const actions = host.actionClient(reference), scenes = host.sceneClient(reference);
    const actionRef = (definition: ActionDefinition) => ({ capability_id: definition.capability_id, version: definition.version, provider_id: installed.install_id });
    const payload = () => ({ binding_id: "original-slot", expected_revision: current()?.revision ?? null, judgment: judgmentRef });
    assert.equal((await actions.discover(caller)).filter(view => view.provider.provider_id === installed.install_id).length, 3);
    await actions.invoke(caller, actionRef(management.enable), payload());
    assert.deepEqual(await scenes.runScene(caller, scene, "original-slot", {}), { saved: true });
    assert.equal((db.prepare("SELECT value FROM fixture_scene_effect").get() as { value: number }).value, 1);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`, endpoint = `${origin}/api/settings/mcp/actions`;
    const grant = async (definition: ActionDefinition, enabled = true, authorized = true) => {
      const response = await fetch(endpoint, { method: "POST", headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(),
        ...(authorized ? { "x-molis-work-control-token": token } : {}) }, body: JSON.stringify({ ...actionRef(definition), client_id: "runtime:scene-only", project_id: project.project_id, enabled }) });
      assert.equal(response.status, authorized ? 200 : 403, await response.clone().text());
    };
    const settings = await (await fetch(`${endpoint}?client_id=runtime:scene-only&project_id=${project.project_id}`)).json();
    assert.equal(settings.actions.filter((row: { provider: { provider_id: string } }) => row.provider.provider_id === installed.install_id).length, 3);
    await grant(management.targets, true, false);
    await grant(management.targets);
    external = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", { projectId: project.project_id, boardId: project.board_id,
      databasePath: project.database_path, webBaseUrl: origin }, { homeDirectory: home,
      runtimeContext: { runtime_id: "scene-only", stable_work_context_id: null, host_declares_stable: false } }, host);
    let request = 0;
    const call = async (definition: ActionDefinition, input: unknown) => external!.handleMessage({ id: ++request, method: "tools/call", params: { name: hostActionToolName(definition), arguments: input } }) as Promise<any>;
    const target = async () => {
      const reply = await call(management.targets, {}); assert.equal(reply.result.isError, false, JSON.stringify(reply));
      return reply.result.structuredContent.targets[0] as ActionSceneTarget;
    };
    assert.equal((await target()).configuration_availability.available, false, "query permission does not grant the separate disable action");
    assert.equal((await call(management.disable, payload())).result.isError, true);
    assert.equal(current()?.enabled, true);
    await grant(management.disable);
    repository.save({ ...runtime.get(installed.install_id), grants: ["only:configure"] });
    const manageable = await target();
    assert.equal(manageable.availability.available, false);
    assert.equal(manageable.configuration_availability.available, true, "no judgment or runtime grant is required to stop the original binding");
    assert.equal((await call(management.disable, payload())).result.isError, false);
    assert.equal(current()?.enabled, false); assert.deepEqual(current()?.function, judgmentRef);
    assert.equal((await call(management.enable, payload())).result.isError, true);
    await assert.rejects(scenes.runScene(caller, scene, "original-slot", {}));
    repository.save({ ...runtime.get(installed.install_id), grants: [...scene.permissions, ...scene.configuration_permissions] });
    await actions.invoke(caller, actionRef(management.enable), payload());
    const revision = current()!.revision;
    let reads = 0;
    onTargets = async () => { if (++reads === 2) await grant(management.disable, false); };
    const revoked = await call(management.disable, payload());
    assert.equal(revoked.result.isError, true); assert.match(JSON.stringify(revoked), /mcp.action_revoked/);
    assert.equal(current()?.enabled, true); assert.equal(current()?.revision, revision);
    onTargets = undefined;
    await grant(management.disable);
    await assert.rejects(actions.invoke({ ...caller, project_id: "foreign-project" }, actionRef(management.disable), payload()));
    await assert.rejects(actions.invoke(caller, { ...actionRef(management.disable), provider_id: "foreign-provider" }, payload()));
    await assert.rejects(actions.invoke(caller, actionRef(management.disable), { ...payload(), expected_revision: null }), { code: "actions.binding_changed" });
    assert.equal(current()?.revision, revision);
    await runtime.stop(installed.install_id);
    assert.equal((await actions.discover(caller)).some(view => view.provider.provider_id === installed.install_id), false);
    assert.equal((await call(management.disable, payload())).result.isError, true);
    assert.equal(current()?.revision, revision, "unloading removes generated actions, not original user configuration");
    await runtime.start(installed.install_id);
    assert.equal((await call(management.disable, payload())).result.isError, false);
    assert.equal(current()?.enabled, false);
    assert.equal((db.prepare("SELECT value FROM fixture_scene_effect").get() as { value: number }).value, 1, "management never invokes the judgment consumer");
  } finally {
    onTargets = undefined;
    await external?.close(); await runtime.stop(installed.install_id); removeJudgment();
    if (server.listening) { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
    await host.close(); await rm(home, { recursive: true, force: true });
  }
});
