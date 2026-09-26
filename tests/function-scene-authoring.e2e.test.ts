import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { PluginRuntime, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { definePlugin } from "../packages/plugin-sdk/src/index.js";
import { sceneConfigurationActions, ActionError, bindActionClient, type ActionDefinition, type ActionSceneDefinition, type ActionSceneBinding, type ActionSceneHandlerBinding, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { DEMO_BOARD_ID, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { withFunctionsService, type FunctionsHostOptions } from "../apps/local-host/src/functions-host.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { functionContextActions, publishedFunctionAction } from "@molis-ai/molis-work-module-functions";
import { createActionMcpPorts, actionMcpToolName, handleMcpMessage } from "@molis-ai/molis-work-app-mcp";
import { authorizeMcpActions } from "../apps/local-host/src/mcp-action-client.js";
import { createMcpActionGrant } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";

test("unknown registered scenes can be authored in the real editor, retain missing references, and report actual plugin-owned usages", { timeout: 120_000 }, async t => {
  const inputs: string[] = [];
  const functions: FunctionsHostOptions = { env: { TYPESAFE_API_KEY: "fixture-only" }, provider: {
    async evaluate(_key, record, input) { inputs.push(input); return { primitive: "noul", noul: 0.9, choice: null,
      score: null, legend: null, probabilities: {}, confidence: null, model: record.model }; },
  } };
  const browser = await openGoalBrowser(t, "seeded", undefined, null, undefined, functions); if (!browser) return;
  const { localHost, store, projectId, homeDirectory, command, sessionId, evaluate, waitFor, click, navigate, reloadPage, origin } = browser;
  assert.ok(localHost); assert.ok(projectId);
  const reference = molisWorkHostProjectReference({ databasePath: browser.databasePath, boardId: DEMO_BOARD_ID, projectId });
  const sceneId = `Notes.Review:${randomUUID()}`;
  const caller: ActionCallContext = { actor_id: "web-user", project_id: projectId, audience: "user", permissions: ["notes:read", "notes:write", "functions:invoke"] };
  store.db.exec("CREATE TABLE fixture_review_notes (id TEXT PRIMARY KEY, content TEXT NOT NULL, state TEXT NOT NULL); CREATE TABLE fixture_review_bindings (id TEXT PRIMARY KEY, value TEXT NOT NULL, revision TEXT NOT NULL)");
  store.db.prepare("INSERT INTO fixture_review_notes VALUES ('note-1', '真实插件待审笔记', 'new')").run();
  const read: ActionDefinition = { capability_id: "unknown.review.notes", version: 1, operation: "query", action: { title: "查看笔记",
    description: "读取原笔记", kind: "query", scope: "project", audiences: ["user", "mcp"], permissions: ["notes:read"], subject_kinds: ["review_note"],
    input_schema: { type: "object", properties: {}, additionalProperties: false }, output_schema: { type: "object", properties: { content: { type: "string" }, state: { type: "string" } }, required: ["content", "state"] } } };
  const write: ActionDefinition = { ...read, capability_id: "unknown.review.write", operation: "command", action: { ...read.action,
    title: "保存审核状态", kind: "operation", permissions: ["notes:write"],
    input_schema: { type: "object", properties: { state: { enum: ["ack", "later"] } }, required: ["state"], additionalProperties: false } } };
  const scene: ActionSceneDefinition = { scene_id: sceneId, version: 1, title: "笔记审核", description: "根据原笔记更新本插件的审核状态", trigger: "笔记提交审核",
    scope: "project", subject_kinds: ["review_note"], permissions: ["notes:read", "notes:write"], configuration_permissions: ["notes:write"],
    input_schema: { type: "object", properties: { content: { type: "string", minLength: 1, maxLength: 8000 } }, required: ["content"], additionalProperties: false },
    event_schema: { type: "object", properties: { note_id: { type: "string" } }, required: ["note_id"], additionalProperties: false },
    result_type: "molis.behavior-recommendation.v1", recommendation_labels: { ack: "通过审核", later: "稍后审核" },
    result_schema: { type: "object", properties: { status: { enum: ["ok", "needs_review"] }, suggested_behavior_ids: { type: "array", items: { enum: ["ack", "later"] } } }, required: ["status", "suggested_behavior_ids"] } };
  const other = { ...scene, scene_id: sceneId + ".other", title: "另一种审核", recommendation_labels: { ack: "另一个场景的同名选项", later: "另一个稍后" } };
  const nextVersion = { ...scene, version: 2, recommendation_labels: { ack: "第二版审核通过", later: "第二版稍后" } };
  const storageKey = (definition: ActionSceneDefinition) => definition.scene_id + ":" + definition.version;
  const note = () => store.db.prepare("SELECT content,state FROM fixture_review_notes WHERE id = 'note-1'").get() as { content: string; state: string };
  const current = (definition: ActionSceneDefinition) => {
    const row = store.db.prepare("SELECT value,revision FROM fixture_review_bindings WHERE id = ?").get(storageKey(definition)) as { value: string; revision: string } | undefined;
    return row ? { ...JSON.parse(row.value), revision: row.revision } as ActionSceneBinding : null;
  };
  let onTargets: (() => Promise<void>) | undefined;
  const handler = (definition: ActionSceneDefinition): ActionSceneHandlerBinding => ({ ...definition,
    targets: async () => { await onTargets?.(); return [{ binding_id: "notes-review", title: "原笔记审核规则", href: "/projects/" + projectId + "/", revision: current(definition)?.revision ?? null }]; },
    bindings: () => { const binding = current(definition); return binding ? [binding] : []; },
    bind: (_caller, binding, options) => {
      assert.ok(options, "the real authoring editor must use optimistic configuration");
      const result = options.expected_revision === null
        ? store.db.prepare("INSERT INTO fixture_review_bindings VALUES (?,?,?) ON CONFLICT(id) DO NOTHING").run(storageKey(definition), JSON.stringify(binding), randomUUID())
        : store.db.prepare("UPDATE fixture_review_bindings SET value = ?, revision = ? WHERE id = ? AND revision = ?").run(JSON.stringify(binding), randomUUID(), storageKey(definition), options.expected_revision);
      if (result.changes !== 1) throw new ActionError("fixture.conflict", "原配置已变化");
    },
    prepare: (_caller, event) => { assert.equal((event as { note_id: string }).note_id, "note-1"); return { input: { content: note().content } }; },
    consume: async (context, _input, result) => {
      const outcome = result as { status: string; suggested_behavior_ids: string[] };
      assert.equal(outcome.status, "ok"); assert.equal(definition.scene_id, sceneId);
      return localHost.actionClient(reference).invoke(context, write, { state: outcome.suggested_behavior_ids[0]! });
    },
  });
  const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.review-scenes", version: "1.0.0", name: "笔记审核",
    kind: "app", publisher: { publisher_id: "example", signature: "review-scenes" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: ["notes:read", "notes:write"].map(permission => ({ permission, required: false, reason: "读写原笔记审核" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [read, write], action_scenes: [scene, nextVersion, other] },
    async start() { return { kind: "app", actions: [{ ...read, handle: () => note() }, { ...write, handle: (_caller, value) => {
      store.db.prepare("UPDATE fixture_review_notes SET state = ? WHERE id = 'note-1'").run((value as { state: string }).state); return note();
    } }], action_scenes: [handler(scene), handler(nextVersion), handler(other)] }; } });
  const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(store.db), undefined, { actions: { registry: localHost.actionRegistry(reference), project_id: projectId } });
  const install = runtime.install({ definition: plugin, deployment: "local", grants: ["notes:read", "notes:write"] }).install;
  await runtime.start(install.install_id);
  const draft = withFunctionsService(homeDirectory, service => service.create({ primitive: "noul", name: "审核新笔记", function_key: "review_note" }), functions);
  const record = () => withFunctionsService(homeDirectory, service => service.get(draft.id), functions);
  const fill = async (selector: string, value: string) => evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const saved = () => waitFor("document.querySelector('[data-functions-save-status]')?.textContent === '已保存'");
  const captures = new URL("../.impeccable/review/function-scenes/", import.meta.url);
  try {
    await mkdir(captures, { recursive: true });
    await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate(() => command("Page.navigate", { url: origin + "/capabilities/rules?project=" + projectId + "&rule=" + draft.id }, sessionId));
    await waitFor(`!!document.querySelector('[data-functions-destination="${sceneId}"]')`);
    await click(`[data-functions-destination="${sceneId}"][data-scene-version="2"]`);
    await saved(); assert.equal(record().scene_version, 2); assert.equal(record().scene_provider_id, install.install_id);
    await click('[data-functions-step="fn"]');
    assert.equal(await evaluate("document.querySelector('[data-map-key=true] option[value=ack]').textContent"), "第二版审核通过");
    await click('[data-functions-step="look"]');
    await click(`[data-functions-destination="${sceneId}"][data-scene-version="1"]`);
    await saved(); assert.equal(record().scene_id, sceneId);
    assert.equal(record().scene_version, 1); assert.equal(record().scene_provider_id, install.install_id);
    assert.equal(await evaluate("document.querySelectorAll('[data-functions-destination].is-current').length"), 1);
    const versions = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(new URL("version-selection.png", captures), Buffer.from(versions.data, "base64"));
    await evaluate("document.querySelector('[data-functions-subject-details]').open = true");
    await click('[data-functions-source="review_note"]');
    await saved(); assert.deepEqual(record().subject_kinds, ["review_note"]);
    await click('[data-functions-step="fn"]');
    await fill('[data-functions-instructions]', "按原文审核");
    await fill('[data-noul-true]', "笔记符合要求"); await fill('[data-noul-false]', "需要补充信息");
    await fill('[data-map-key="true"]', "ack"); await fill('[data-map-key="false"]', "later");
    await saved();
    assert.equal(await evaluate("document.querySelector('[data-map-key=true]').selectedOptions[0].textContent"), "通过审核", "same symbolic output in another scene cannot override this consumer's label");
    assert.deepEqual(record().scene_map, { true: "ack", false: "later" });
    await runtime.stop(install.install_id); await reloadPage();
    await waitFor(`document.querySelector('[data-functions-destination="${sceneId}"]')?.disabled === true`);
    await click('[data-functions-step="fn"]');
    await fill('[data-functions-instructions]', "按原文审核，保留失效配置"); await saved();
    assert.equal(record().scene_id, sceneId); assert.deepEqual(record().scene_map, { true: "ack", false: "later" });
    assert.equal(record().scene_version, 1); assert.equal(record().scene_provider_id, install.install_id, "unavailable references survive unrelated edits");
    const missing = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(new URL("missing-scene.png", captures), Buffer.from(missing.data, "base64"));
    await runtime.start(install.install_id); await reloadPage();
    await waitFor(`document.querySelector('[data-functions-destination="${sceneId}"]')?.disabled === false`);
    await click('[data-functions-step="use"]');
    await fill('[data-functions-preview-input]', "真实插件待审笔记"); await click('[data-functions-preview]');
    await waitFor("document.querySelector('[data-functions-publish]')?.disabled === false");
    await click('[data-functions-publish]');
    await waitFor("document.querySelector('[data-functions-editor-status]')?.textContent === 'v1'");
    const published = record(); assert.equal(published.status, "published");
    assert.equal(published.scene_version, 1); assert.equal(published.scene_provider_id, install.install_id);
    const enableButton = `[data-functions-scene-id="${sceneId}"][data-functions-scene-version="1"][data-functions-scene-bind="on"]`;
    const disableButton = `[data-functions-scene-id="${sceneId}"][data-functions-scene-version="1"][data-functions-scene-bind="off"]`;
    await waitFor(`!!document.querySelector('${enableButton}') && !document.querySelector('${enableButton}').disabled`);
    assert.equal(current(scene), null, "discovery does not create a plugin configuration");
    await click(enableButton);
    await waitFor(`!!document.querySelector('${disableButton}')`);
    const binding = current(scene)!;
    assert.equal(binding.function.provider_id, "system.functions"); assert.equal(binding.function.version, published.version);
    const scenes = localHost.sceneClient(reference);
    assert.deepEqual(await scenes.runScene(caller, scene, binding.binding_id, { note_id: "note-1" }), { content: "真实插件待审笔记", state: "ack" });
    assert.equal(note().state, "ack"); assert.equal(inputs.at(-1), "真实插件待审笔记");
    const manager = { ...caller, permissions: [...caller.permissions, "functions:manage"] };
    const actions = localHost.actionClient(reference);
    assert.equal((await bindActionClient(actions, () => manager).invoke(functionContextActions.catalog, {})).catalog.destinations.find(row => row.destination_id === sceneId)?.title, "笔记审核");
    await assert.rejects(actions.invoke(caller, functionContextActions.catalog, {}), { code: "actions.forbidden" });
    await assert.rejects(actions.invoke(manager, functionContextActions.catalog, { project_id: "foreign" } as never), { code: "actions.input_invalid" });
    assert.deepEqual((await bindActionClient(localHost.homeActionClient(), () => ({ ...manager, project_id: null })).invoke(functionContextActions.usages, { id: published.id })).usages, [], "global context must not borrow this project's usages");
    const mcpCaller: ActionCallContext = { actor_id: "runtime:scene-author", project_id: projectId, audience: "mcp", permissions: [] };
    const views = await localHost.inspectActions(mcpCaller, reference);
    for (const definition of [functionContextActions.catalog, functionContextActions.usages, functionContextActions.targets, functionContextActions.configure, ...Object.values(sceneConfigurationActions(scene)), publishedFunctionAction(published), read, write]) {
      const view = views.find(row => row.capability_id === definition.capability_id)!;
      await writeMcpActionGrant(homeDirectory, createMcpActionGrant(mcpCaller.actor_id, view.action.scope === "home" ? null : projectId, view, true));
    }
    const mcpQuery = async <I, O>(definition: ActionDefinition<I, O>, args: I): Promise<O> => {
      const auth = await authorizeMcpActions(localHost, mcpCaller, homeDirectory, reference);
      const ports = createActionMcpPorts({ service: auth.service, context: () => auth.context, serverInfo: { name: "scene-authoring", version: "1" } });
      const response = await handleMcpMessage({ id: 1, method: "tools/call", params: { name: actionMcpToolName(definition), arguments: args } }, ports);
      const result = response!.result as { isError: boolean; content: { text: string }[] };
      assert.equal(result.isError, false, JSON.stringify(response));
      return JSON.parse(result.content[0]!.text);
    };
    assert.equal((await mcpQuery(functionContextActions.catalog, {})).catalog.destinations.find(row => row.destination_id === sceneId)?.availability?.available, true);
    const mcpUsage = (await mcpQuery(functionContextActions.usages, { id: published.id })).usages[0];
    assert.ok(mcpUsage && "binding_id" in mcpUsage); assert.equal(mcpUsage.binding_id, binding.binding_id);
    const target = (await mcpQuery(functionContextActions.targets, { id: published.id })).targets.find(row => row.scene_id === sceneId)!;
    assert.equal(target.binding?.revision, binding.revision);
    const configure = { id: published.id, scene_id: sceneId, scene_version: target.scene_version, provider_id: target.provider_id,
      binding_id: target.binding_id, expected_revision: target.revision, enabled: false };
    assert.deepEqual(await mcpQuery(functionContextActions.configure, configure), { ok: true });
    assert.equal(current(scene)?.enabled, false, "MCP changes the original plugin-owned configuration");
    await reloadPage();
    await waitFor(`!!document.querySelector('${enableButton}')`);
    await click('[data-functions-step="use"]');
    await waitFor(`!!document.querySelector('${enableButton}') && !document.querySelector('${enableButton}').disabled`);
    await click(enableButton); await waitFor(`!!document.querySelector('${disableButton}')`);
    assert.equal(current(scene)?.enabled, true, "the web editor observes MCP changes and re-enables the same owner record");
    const authorized = await authorizeMcpActions(localHost, mcpCaller, homeDirectory, reference);
    let targetReads = 0;
    onTargets = async () => {
      if (++targetReads === 2) await writeMcpActionGrant(homeDirectory,
        createMcpActionGrant(mcpCaller.actor_id, projectId, views.find(row => row.capability_id === sceneConfigurationActions(scene).disable.capability_id)!, false));
    };
    const beforeRevocation = current(scene)!;
    await assert.rejects(authorized.service.invoke(authorized.context, functionContextActions.configure,
      { ...configure, expected_revision: beforeRevocation.revision, enabled: false }), { code: "mcp.action_revoked" });
    onTargets = undefined;
    assert.equal(current(scene)?.enabled, true, "a write grant revoked after discovery prevents disabling the original binding");
    assert.equal(current(scene)?.revision, beforeRevocation.revision);

    const revokedTarget = (await mcpQuery(functionContextActions.targets, { id: published.id })).targets.find(row => row.scene_id === sceneId)!;
    assert.equal(revokedTarget.configuration_availability.available, false, "the exact disabled grant is reflected even while other actions retain the same named permission");
    assert.equal(record().scene_id, sceneId, "revocation must preserve the original author's reference");
    await reloadPage(); await waitFor("document.querySelector('[data-functions-usages]')?.textContent.includes('原笔记审核规则')");
    await click('[data-functions-step="use"]');
    assert.equal(await evaluate("document.querySelector('[data-functions-usages] a')?.getAttribute('href')"), binding.href);
    assert.equal(await evaluate("document.querySelector('[data-functions-usages]').textContent.includes('已启用')"), true);
    await evaluate("document.querySelector('[data-functions-usages]').scrollIntoView({block:'center'})");
    await waitFor("document.getAnimations().every(animation => animation.playState !== 'running')");
    const bound = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(new URL("real-usage.png", captures), Buffer.from(bound.data, "base64"));
    await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }, sessionId);
    await click(disableButton); await waitFor(`!!document.querySelector('${enableButton}')`);
    assert.equal(current(scene)?.enabled, false, "narrow-screen controls change the original binding");
    await click(enableButton); await waitFor(`!!document.querySelector('${disableButton}')`);
    assert.equal(current(scene)?.enabled, true);
    await evaluate("document.querySelector('[data-functions-usages]').scrollIntoView({block:'center'})");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true, "usage links must fit the narrow system panel");
    const narrow = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(new URL("real-usage-narrow.png", captures), Buffer.from(narrow.data, "base64"));
    await click('[data-functions-step="look"]');
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    assert.equal(await evaluate("document.querySelector('[data-functions-destination].is-current')?.dataset.sceneVersion"), "1");
    const narrowVersions = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(new URL("version-selection-narrow.png", captures), Buffer.from(narrowVersions.data, "base64"));
    await runtime.stop(install.install_id); await runtime.start(install.install_id);
    assert.equal((await scenes.usages(caller)).find(use => use.binding_id === binding.binding_id)?.function.provider_id, "system.functions");
    assert.equal(record().scene_version, 1); assert.equal(record().scene_provider_id, install.install_id);
  } finally { await runtime.stop(install.install_id); }
});
