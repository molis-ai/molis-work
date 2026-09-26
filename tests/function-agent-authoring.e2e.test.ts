import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { PluginRuntime, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { definePlugin } from "../packages/plugin-sdk/src/index.js";
import { bindActionClient, type ActionDefinition, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { DEMO_BOARD_ID, LocalMcpServer, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { withFunctionsService, type FunctionsHostOptions } from "../apps/local-host/src/functions-host.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { functionAuthoringActions, functionContextActions, functionsActions, publishedFunctionAction } from "@molis-ai/molis-work-module-functions";
import { createMcpActionGrant, hostActionToolName } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";

test("Agent authoring discovers runtime capabilities, preserves exact references, and MCP recommendations require a separate authorized business call", { timeout: 120_000 }, async t => {
  let onEvaluate: (() => Promise<void>) | undefined;
  let evaluated = 0;
  const functions: FunctionsHostOptions = { env: { TYPESAFE_API_KEY: "fixture-only" }, provider: {
    async evaluate(_key, record) { evaluated++; await onEvaluate?.(); return { primitive: "noul", noul: .9, choice: null,
      score: null, legend: null, probabilities: {}, confidence: null, model: record.model }; },
  } };
  const browser = await openGoalBrowser(t, "seeded", undefined, null, undefined, functions); if (!browser) return;
  const { localHost, store, projectId, homeDirectory, command, sessionId, evaluate, waitFor, click, navigate, reloadPage, origin } = browser;
  assert.ok(localHost); assert.ok(projectId);
  const reference = molisWorkHostProjectReference({ databasePath: browser.databasePath, boardId: DEMO_BOARD_ID, projectId });
  store.db.exec("CREATE TABLE fixture_agent_notes (id TEXT PRIMARY KEY, content TEXT NOT NULL, state TEXT NOT NULL)");
  store.db.prepare("INSERT INTO fixture_agent_notes VALUES ('note-1', '原插件笔记', 'new')").run();
  const note = () => store.db.prepare("SELECT content,state FROM fixture_agent_notes WHERE id = 'note-1'").get() as { content: string; state: string };
  const read: ActionDefinition = { capability_id: `Unknown.Notes:${randomUUID()}`, version: 1, operation: "query", action: {
    title: "读取原插件笔记", description: "读取原笔记正文和状态", kind: "query", scope: "project", audiences: ["user", "agent", "mcp"], permissions: ["notes:read"], subject_kinds: [],
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    output_schema: { type: "object", properties: { content: { type: "string" }, state: { type: "string" } }, required: ["content", "state"] },
  } };
  const write: ActionDefinition = { ...read, capability_id: `Unknown.Save:${randomUUID()}`, version: 2, operation: "command", action: { ...read.action,
    title: "保存原插件笔记状态", kind: "operation", subject_kinds: ["agent_note"], permissions: ["notes:write"],
    input_schema: { type: "object", properties: { state: { enum: ["reviewed", "later"] } }, required: ["state"], additionalProperties: false },
  } };
  const privateAction = { ...read, capability_id: "unknown.user-only", action: { ...read.action, audiences: ["user" as const] } };
  const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.agent-notes", version: "1.0.0", name: "原插件笔记",
    kind: "app", publisher: { publisher_id: "example", signature: "agent-notes" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: ["notes:read", "notes:write"].map(permission => ({ permission, required: false, reason: "访问原笔记" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [read, write, privateAction] },
    async start() { return { kind: "app", actions: [{ ...read, handle: () => note() }, { ...privateAction, handle: () => note() }, { ...write, handle: (_caller, input) => {
      store.db.prepare("UPDATE fixture_agent_notes SET state = ? WHERE id = 'note-1'").run((input as { state: string }).state); return note();
    } }] }; } });
  const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(store.db), undefined, { actions: { registry: localHost.actionRegistry(reference), project_id: projectId } });
  const install = runtime.install({ definition: plugin, deployment: "local", grants: ["notes:read", "notes:write"] }).install;
  await runtime.start(install.install_id);
  const ref = (definition: ActionDefinition) => ({ capability_id: definition.capability_id, version: definition.version, provider_id: install.install_id });
  const draft = withFunctionsService(homeDirectory, service => service.create({ primitive: "noul", name: "给 Agent 推荐原笔记动作", function_key: "agent_notes" }), functions);
  const record = () => withFunctionsService(homeDirectory, service => service.get(draft.id), functions);
  const history = () => withFunctionsService(homeDirectory, service => service.listJudgments().filter(row => row.function_key === draft.function_key), functions);
  const fill = async (selector: string, value: string) => evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const saved = () => waitFor("document.querySelector('[data-functions-save-status]')?.textContent === '已保存'");
  const captures = new URL("../.impeccable/review/function-agent/", import.meta.url);
  let external: LocalMcpServer | undefined;
  const owner: ActionCallContext = { actor_id: "owner", project_id: projectId, audience: "user", permissions: ["notes:read", "notes:write", "functions:manage", "functions:invoke"] };
  const actions = bindActionClient(localHost.actionClient(reference), () => owner);
  try {
    const catalog = (await actions.invoke(functionContextActions.catalog, {})).catalog;
    assert.deepEqual(catalog.behaviors.find(row => row.action_ref?.capability_id === write.capability_id)?.action_ref, ref(write));
    assert.equal(catalog.behaviors.some(row => row.action_ref?.capability_id === privateAction.capability_id), false);
    await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await navigate(() => command("Page.navigate", { url: origin + "/capabilities/rules?project=" + projectId + "&rule=" + draft.id }, sessionId));
    await waitFor("!!document.querySelector('[data-functions-destination=\"agent.mcp\"]')");
    await click('[data-functions-destination="agent.mcp"]'); await saved();
    await click('[data-functions-step="fn"]');
    await fill('[data-functions-instructions]', "笔记需要保存时推荐保存能力，否则只返回判断");
    await fill('[data-noul-true]', "需要保存笔记"); await fill('[data-noul-false]', "无需保存");
    await fill('[data-map-key="true"]', JSON.stringify(ref(write))); await saved();
    assert.deepEqual(record().action_map, { true: ref(write) }); assert.deepEqual(record().scene_map, {});
    assert.equal(await evaluate("document.querySelector('[data-map-key=false]').selectedOptions[0].textContent"), "只返回判断");
    await runtime.stop(install.install_id); await reloadPage();
    await waitFor(`document.querySelector('[data-map-key=true]')?.value === ${JSON.stringify(JSON.stringify(ref(write)))}`); await click('[data-functions-step="fn"]');
    assert.equal(await evaluate("document.querySelector('[data-map-key=true]').selectedOptions[0].disabled"), true);
    await fill('[data-functions-instructions]', "笔记需要保存时推荐原保存能力"); await saved();
    assert.deepEqual(record().action_map, { true: ref(write) }, "missing source survives saving and reopening original storage");
    await runtime.start(install.install_id); await reloadPage();
    await waitFor(`document.querySelector('[data-map-key=true]')?.value === ${JSON.stringify(JSON.stringify(ref(write)))}`); await click('[data-functions-step="fn"]');
    assert.equal(await evaluate("document.querySelector('[data-map-key=true]').selectedOptions[0].disabled"), false);
    await mkdir(captures, { recursive: true });
    await evaluate("document.querySelector('[data-functions-map-panel]').scrollIntoView({block:'center'})");
    const desktop = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(new URL("recommendations-desktop.png", captures), Buffer.from(desktop.data, "base64"));
    await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }, sessionId);
    await fill('[data-map-key="true"]', ""); await saved(); assert.deepEqual(record().action_map, {});
    await fill('[data-map-key="true"]', JSON.stringify(ref(write))); await saved();
    assert.deepEqual(record().action_map, { true: ref(write) });
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    await evaluate("document.querySelector('[data-functions-map-panel]').scrollIntoView({block:'center'})");
    const narrow = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(new URL("recommendations-narrow.png", captures), Buffer.from(narrow.data, "base64"));
    await click('[data-functions-step="use"]'); await fill('[data-functions-preview-input]', note().content); await click('[data-functions-preview]');
    await waitFor("document.querySelector('[data-functions-publish]')?.disabled === false"); await click('[data-functions-publish]');
    await waitFor("document.querySelector('[data-functions-editor-status]')?.textContent === 'v1'");
    const published = record(), judgment = publishedFunctionAction(published);
    assert.deepEqual(judgment.action.required_actions, [ref(write)]);
    const caller: ActionCallContext = { actor_id: "runtime:agent-notes", project_id: projectId, audience: "mcp", permissions: [] };
    const views = await localHost.inspectActions(caller, reference);
    const grant = async (definition: ActionDefinition, enabled = true) => {
      const view = views.find(row => row.capability_id === definition.capability_id && row.version === definition.version)!;
      assert.ok(view);
      await writeMcpActionGrant(homeDirectory, createMcpActionGrant(caller.actor_id, view.action.scope === "home" ? null : projectId, view, enabled));
    };
    await grant(judgment); await grant(read); await grant(functionsActions.invoke);
    external = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", { projectId, boardId: DEMO_BOARD_ID, databasePath: browser.databasePath, webBaseUrl: origin },
      { homeDirectory: homeDirectory, runtimeContext: { runtime_id: "agent-notes", stable_work_context_id: null, host_declares_stable: false } }, localHost);
    let request = 0;
    const call = (definition: ActionDefinition, input: unknown) => external!.handleMessage({ id: ++request, method: "tools/call", params: { name: hostActionToolName(definition), arguments: input } }) as Promise<any>;
    const result = async (definition: ActionDefinition, input: unknown) => {
      const reply = await call(definition, input); assert.equal(reply.result.isError, false, JSON.stringify(reply)); return reply.result.structuredContent;
    };
    assert.equal((await call(judgment, { content: "No target grant" })).result.isError, true);
    assert.equal((await call(functionsActions.invoke, { function_key: published.function_key, input: "No target grant" })).result.isError, true);
    assert.equal(history().length, 0); assert.equal(note().state, "new");
    await grant(write);
    const recommendation = await result(judgment, { content: (await result(read, {})).content });
    assert.deepEqual(recommendation.recommended_actions, [ref(write)]);
    assert.deepEqual(history()[0]?.recommended_actions, [ref(write)]);
    assert.equal(note().state, "new", "judgment must not fill arguments or execute the recommended business action");
    assert.equal((await result(write, { state: "reviewed" })).state, "reviewed"); assert.equal(note().state, "reviewed");
    assert.deepEqual((await result(functionsActions.invoke, { function_key: published.function_key, input: note().content })).recommended_actions, [ref(write)]);
    const count = history().length;
    onEvaluate = () => grant(write, false);
    const revoked = await call(judgment, { content: "Revoke during model evaluation" });
    assert.equal(revoked.result.isError, true); assert.match(JSON.stringify(revoked), /revoked|forbidden|unavailable/);
    assert.equal(history().length, count, "revocation must prevent recording or returning a stale authorized recommendation");
    assert.equal(note().state, "reviewed"); onEvaluate = undefined;
    await grant(write);
    onEvaluate = () => runtime.stop(install.install_id).then(() => undefined);
    assert.equal((await call(functionsActions.invoke, { function_key: published.function_key, input: "Unload during model evaluation" })).result.isError, true);
    assert.equal(history().length, count); onEvaluate = undefined;
    await runtime.start(install.install_id);
    assert.deepEqual(record().action_map, { true: ref(write) });
    assert.deepEqual((await result(judgment, { content: "Restarted source" })).recommended_actions, [ref(write)]);
    const other = (await actions.invoke(functionAuthoringActions.create, { primitive: "noul" })).function;
    const patch = { scene_id: "agent.mcp", instructions: "Choose", criteria: { true_description: "Yes", false_description: "No" }, action_map: { true: { ...ref(write), version: 1 } } };
    await actions.invoke(functionAuthoringActions.update, { id: other.id, patch });
    await actions.invoke(functionAuthoringActions.preview, { id: other.id, input: "Example" });
    const evaluatedBefore = evaluated;
    await assert.rejects(actions.invoke(functionAuthoringActions.publish, { id: other.id }), { code: "actions.recommendation_missing" });
    await actions.invoke(functionAuthoringActions.update, { id: other.id, patch: { action_map: { true: { ...ref(write), provider_id: "replacement" } } } });
    await assert.rejects(actions.invoke(functionAuthoringActions.publish, { id: other.id }), { code: "actions.recommendation_missing" });
    await actions.invoke(functionAuthoringActions.update, { id: other.id, patch: { subject_kinds: ["different-object"], action_map: { true: ref(write) } } });
    await assert.rejects(actions.invoke(functionAuthoringActions.publish, { id: other.id }), { code: "actions.recommendation_incompatible" });
    assert.equal(evaluated, evaluatedBefore);
    assert.equal((await actions.invoke(functionAuthoringActions.get, { id: other.id })).function.status, "draft");
    const choice = (await actions.invoke(functionAuthoringActions.create, { primitive: "choice", name: "Agent 选项" })).function;
    await actions.invoke(functionAuthoringActions.update, { id: choice.id, patch: { scene_id: "agent.mcp", criteria: [
      { key: "molis_work_v1_legacy_tool", description: "原结果保留" }, { key: "skip", description: "无需动作" },
    ] } });
    await navigate(() => command("Page.navigate", { url: origin + "/capabilities/rules?project=" + projectId + "&rule=" + choice.id }, sessionId));
    await waitFor("!!document.querySelector('[data-map-key=molis_work_v1_legacy_tool]')");
    await click('[data-functions-step="fn"]');
    assert.equal(await evaluate("document.querySelector('[data-map-key=molis_work_v1_legacy_tool]').value"), "", "old result names are not guessed into action references");
    await evaluate("document.querySelector('[data-functions-palette-details]').open = true");
    const choiceKey = catalog.behaviors.find(row => row.action_ref?.capability_id === write.capability_id)!.behavior_id;
    await click(`[data-palette-add="${choiceKey}"]`); await saved();
    const choiceRecord = () => withFunctionsService(homeDirectory, service => service.get(choice.id), functions);
    assert.deepEqual(choiceRecord().action_map, { [choiceKey]: ref(write) });
    await fill(`[data-map-key="${choiceKey}"]`, ""); await saved();
    await fill('[data-choice-description]', "修改原判断条件"); await saved();
    assert.deepEqual(choiceRecord().action_map, {}, "editing a criterion cannot restore a recommendation the user cleared");
    await fill(`[data-map-key="${choiceKey}"]`, JSON.stringify(ref(read))); await saved();
    assert.deepEqual(choiceRecord().action_map, { [choiceKey]: ref(read) }, "selection stores the actual target, independent of the choice key");

  } finally { onEvaluate = undefined; await external?.close(); await runtime.stop(install.install_id); }
});
