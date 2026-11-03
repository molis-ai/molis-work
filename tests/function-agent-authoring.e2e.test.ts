import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { PluginRuntime, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { definePlugin } from "@molis-ai/molis-work-plugin-sdk";
import { bindActionClient, type ActionDefinition, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalMcpServer, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { withFunctionsService, type FunctionsHostOptions } from "../apps/local-host/dist/judgment-rules-host.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { functionAuthoringActions, functionContextActions, functionsActions, publishedFunctionAction } from "@molis-ai/molis-work-module-judgment-rules";
import { createMcpActionGrant } from "../apps/local-host/dist/mcp-action-grants.js";
import { molisWorkActionToolName } from "@molis-ai/molis-work-app-mcp";
import { writeMcpActionGrant } from "../apps/local-host/dist/mcp-settings-store.js";
import { grantMcpActions, revokeMcpAction } from "@molis-ai/molis-work-test-kit/local-host-http";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

// RAC-2846 / RA4-04: the real Host serves the unchanged editor behavior from the renamed implementation paths.
test("Agent authoring discovers runtime capabilities, preserves exact references, and MCP recommendations require a separate authorized business call", { timeout: 120_000 }, async t => {
  let onEvaluate: (() => Promise<void>) | undefined;
  let evaluated = 0;
  const functions: FunctionsHostOptions = { env: { TYPESAFE_API_KEY: "fixture-only" }, provider: {
    async evaluate(_key, record) { evaluated++; await onEvaluate?.(); return { primitive: "noul", noul: .9, choice: null,
      score: null, legend: null, probabilities: {}, confidence: null, model: record.model }; },
  } };
  const browser = await openGoalBrowser(t, "seeded", undefined, null, functions); if (!browser) return;
  const { localHost, store, projectId, homeDirectory, command, sessionId, evaluate, waitFor, click, navigate, reloadPage, origin, web } = browser;
  assert.ok(localHost); assert.ok(projectId);
  const reference = molisWorkHostProjectReference({ databasePath: browser.databasePath, projectId });
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
  const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(store.db), undefined, { hostIds: ISOLATED_HOST_IDS, actions: { registry: localHost.actionRegistry(reference), project_id: projectId } });
  const install = runtime.install({ trust: { level: "unsigned" }, definition: plugin, deployment: "local", grants: ["notes:read", "notes:write"] }).install;
  await runtime.start(install.install_id);
  const ref = (definition: ActionDefinition) => ({ capability_id: definition.capability_id, version: definition.version, provider_id: install.install_id });
  const draft = withFunctionsService(homeDirectory, service => service.create({ primitive: "noul", name: "给 Agent 推荐原笔记动作", function_key: "agent_notes" }), functions);
  const record = () => withFunctionsService(homeDirectory, service => service.get(draft.id), functions);
  const history = () => withFunctionsService(homeDirectory, service => service.listJudgments().filter(row => row.function_key === draft.function_key), functions);
  const fill = async (selector: string, value: string) => evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const saved = () => waitFor("document.querySelector('[data-functions-save-status]')?.textContent === '已保存'");
  const captures = reviewEvidenceUrl("function-agent/");
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
    const viewOf = (definition: ActionDefinition) => {
      const view = views.find(row => row.capability_id === definition.capability_id && row.version === definition.version)!;
      assert.ok(view);
      return view;
    };
    // Grants go through the access settings, as a person makes them; the Host checks each one against what the client can really use.
    const grant = (...definitions: ActionDefinition[]) => grantMcpActions(web, { clientId: caller.actor_id, projectId, actions: definitions.map(viewOf) });
    const revoke = (definition: ActionDefinition) => {
      const view = viewOf(definition);
      return revokeMcpAction(web, { clientId: caller.actor_id, projectId: view.action.scope === "home" ? null : projectId,
        action: { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id } });
    };
    // The one grant the access settings cannot make: they list a Home action's dependencies from the Home, where this project's action is not
    // offered, so the Home-level judgment that recommends it is refused (`mcp.grant_requires`) even with that action granted in this project,
    // although it runs here once it is. It is saved the way the route would save it; everything else is granted through the route.
    await grant(write);
    await assert.rejects(grant(judgment), { status: 400, code: "mcp.grant_requires" });
    await revoke(write);
    await writeMcpActionGrant(homeDirectory, createMcpActionGrant(caller.actor_id, null, viewOf(judgment), true));
    await grant(read, functionsActions.invoke);
    external = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", { projectId, databasePath: browser.databasePath, webBaseUrl: origin },
      { homeDirectory: homeDirectory, runtimeContext: { runtime_id: "agent-notes", stable_work_context_id: null, host_declares_stable: false } }, localHost);
    let request = 0;
    const call = (definition: ActionDefinition, input: unknown) => external!.handleMessage({ id: ++request, method: "tools/call", params: { name: molisWorkActionToolName(definition), arguments: input } }) as Promise<any>;
    const result = async (definition: ActionDefinition, input: unknown) => {
      const reply = await call(definition, input); assert.equal(reply.result.isError, false, JSON.stringify(reply)); return reply.result.structuredContent;
    };
    const noTarget = await call(judgment, { content: "No target grant" });
    // The tool is called by its name, so the Host decides and answers with its own code (W3-09-2; docs/mcp.md).
    assert.equal(noTarget.result.isError, true); assert.equal(JSON.parse(noTarget.result.content[0].text).code, "actions.forbidden", "the recommendation target is not granted, so the judgment is not offered");
    const noTargetInvoke = await call(functionsActions.invoke, { function_key: published.function_key, input: "No target grant" });
    assert.equal(noTargetInvoke.result.isError, true); assert.match(JSON.stringify(noTargetInvoke), /actions\.recommendation_missing/);
    assert.equal(history().length, 0); assert.equal(note().state, "new");
    await grant(write);
    const recommendation = await result(judgment, { content: (await result(read, {})).content });
    assert.deepEqual(recommendation.recommended_actions, [ref(write)]);
    assert.deepEqual(history()[0]?.recommended_actions, [ref(write)]);
    assert.equal(note().state, "new", "judgment must not fill arguments or execute the recommended business action");
    assert.equal((await result(write, { state: "reviewed" })).state, "reviewed"); assert.equal(note().state, "reviewed");
    assert.deepEqual((await result(functionsActions.invoke, { function_key: published.function_key, input: note().content })).recommended_actions, [ref(write)]);
    const count = history().length;
    onEvaluate = () => revoke(write).then(() => undefined);
    const revoked = await call(judgment, { content: "Revoke during model evaluation" });
    assert.equal(revoked.result.isError, true); assert.match(JSON.stringify(revoked), /mcp\.action_revoked/);
    assert.equal(history().length, count, "revocation must prevent recording or returning a stale authorized recommendation");
    assert.equal(note().state, "reviewed"); onEvaluate = undefined;
    await grant(write);
    onEvaluate = () => runtime.stop(install.install_id).then(() => undefined);
    const unloaded = await call(functionsActions.invoke, { function_key: published.function_key, input: "Unload during model evaluation" });
    assert.equal(unloaded.result.isError, true); assert.match(JSON.stringify(unloaded), /actions\.recommendation_missing/);
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
