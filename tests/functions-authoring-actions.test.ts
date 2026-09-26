import { createMcpActionGrant } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bindActionClient, type ActionCallContext, type ActionSceneDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { suggestedAuthoringBehaviors, type FunctionRecord, type TypeSafeProvider } from "@molis-ai/molis-work-contracts/modules/functions";
import { LocalMcpServer, MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { functionAuthoringActions as authoring, functionContextActions, publishedFunctionAction, openFunctionsStore } from "@molis-ai/molis-work-module-functions";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { functionsActionProvider } from "@molis-ai/molis-work-module-functions";
import { withFunctionsService, withFunctionsServiceAsync } from "../apps/local-host/src/functions-host.js";

const owner: ActionCallContext = { actor_id: "owner", project_id: null, audience: "user", permissions: ["functions:manage", "functions:invoke"] };

test("a draft changed during asynchronous publication validation cannot publish unchecked edits", async () => {
  const home = await mkdtemp(join(tmpdir(), "rule-publication-race-"));
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const released = new Promise<void>(resolve => { release = resolve; });
  const options = { env: { TYPESAFE_API_KEY: "fixture-only" }, provider: {
    async evaluate(_key, record) { return { primitive: record.primitive, noul: .8, choice: null, score: null, legend: null, probabilities: {}, confidence: null, model: record.model }; },
  } satisfies TypeSafeProvider };
  const service = new ActionService();
  service.registerProvider(functionsActionProvider({ read: operation => withFunctionsService(home, operation, options),
    run: operation => withFunctionsServiceAsync(home, operation, options), credentialAvailable: () => true,
    validatePublication: async () => { enter(); await released; },
  }));
  const actions = bindActionClient(service, () => owner);
  try {
    const { function: draft } = await actions.invoke(authoring.create, { primitive: "noul" });
    await actions.invoke(authoring.update, { id: draft.id, patch: { instructions: "Original", criteria: { true_description: "Yes", false_description: "No" } } });
    await actions.invoke(authoring.preview, { id: draft.id, input: "Sample" });
    const publication = actions.invoke(authoring.publish, { id: draft.id });
    const rejected = assert.rejects(publication, { code: "functions.conflict" });
    await entered;
    // Object restrictions do not change the model preview, but do change scene compatibility.
    await actions.invoke(authoring.update, { id: draft.id, patch: { subject_kinds: ["unchecked-new-kind"] } });
    release(); await rejected;
    const retained = (await actions.invoke(authoring.get, { id: draft.id })).function;
    assert.equal(retained.status, "draft"); assert.deepEqual(retained.subject_kinds, ["unchecked-new-kind"]);
  } finally { release(); await rm(home, { recursive: true, force: true }); }
});

test("publication checks live scene contracts and retains drafts after missing, unavailable, ambiguous or incompatible targets", async () => {
  const home = await mkdtemp(join(tmpdir(), "rule-publication-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, functions: { env: { TYPESAFE_API_KEY: "fixture-only" }, provider: {
    async evaluate(_key, record) { return { primitive: "noul", noul: .9, choice: null, score: null, legend: null, probabilities: {}, confidence: null, model: record.model }; },
  } } });
  const actions = bindActionClient(host.homeActionClient(), () => owner);
  const scene: ActionSceneDefinition = { scene_id: "example.review", version: 1, title: "Review", description: "Review original notes", trigger: "Note submitted",
    scope: "home", permissions: [], subject_kinds: ["note"], result_type: "molis.behavior-recommendation.v1",
    input_schema: { type: "object", properties: { content: { type: "string", minLength: 1, maxLength: 8000 } }, required: ["content"], additionalProperties: false },
    result_schema: { type: "object", properties: { suggested_behavior_ids: { type: "array", items: { enum: ["ack", "later"] } } }, required: ["suggested_behavior_ids"] } };
  let available = true;
  const register = (definition: ActionSceneDefinition, providerId = "example.review") => host.actionRegistry().registerProvider({ provider: { provider_id: providerId, title: "Review", kind: "system" },
    definitions: [], handlers: [], scenes: [definition], scene_handlers: [{ ...definition, bindings: () => [], bind: () => {}, consume: () => ({}) }],
    availability: () => available ? { available: true } : { available: false, code: "example.offline", reason: "Review unavailable" },
  });
  try {
    const { function: draft } = await actions.invoke(authoring.create, { primitive: "noul", name: "Review" });
    await actions.invoke(authoring.update, { id: draft.id, patch: { instructions: "Review", scene_id: scene.scene_id, subject_kinds: ["wrong"],
      criteria: { true_description: "Accept", false_description: "Later" }, scene_map: { true: "ack", false: "later" } } });
    await actions.invoke(authoring.preview, { id: draft.id, input: "Original note" });
    await assert.rejects(actions.invoke(authoring.publish, { id: draft.id }), { code: "actions.scene_missing" });
    const remove = register(scene);
    await assert.rejects(actions.invoke(authoring.publish, { id: draft.id }), { code: "actions.scene_incompatible" });
    await actions.invoke(authoring.update, { id: draft.id, patch: { subject_kinds: ["note"] } });
    await actions.invoke(authoring.preview, { id: draft.id, input: "Original note" });
    available = false;
    await assert.rejects(actions.invoke(authoring.publish, { id: draft.id }), { code: "example.offline" });
    available = true;
    const removeSecond = register({ ...scene, version: 2, recommendation_labels: { ack: "Version two approval", later: "Version two deferral" } });
    await assert.rejects(actions.invoke(authoring.publish, { id: draft.id }), { code: "actions.scene_ambiguous" });
    const catalog = (await actions.invoke(functionContextActions.catalog, {})).catalog;
    assert.deepEqual(suggestedAuthoringBehaviors(catalog, scene.scene_id, ["note"]), [], "old ID-only selection must not guess among versions");
    assert.equal(suggestedAuthoringBehaviors(catalog, scene.scene_id, ["note"], { scene_version: 2, provider_id: "example.review" })[0]?.title, "Version two approval");
    const { function: pinned } = await actions.invoke(authoring.create, { primitive: "noul", name: "Pinned version" });
    await assert.rejects(actions.invoke(authoring.update, { id: pinned.id, patch: { scene_id: scene.scene_id, scene_version: 2 } }), { code: "functions.invalid" });
    await actions.invoke(authoring.update, { id: pinned.id, patch: { instructions: "Review", scene_id: scene.scene_id, scene_version: 2, scene_provider_id: "wrong-provider",
      subject_kinds: ["note"], criteria: { true_description: "Accept", false_description: "Later" }, scene_map: { true: "ack", false: "later" } } });
    await actions.invoke(authoring.preview, { id: pinned.id, input: "Original note" });
    await assert.rejects(actions.invoke(authoring.publish, { id: pinned.id }), { code: "actions.scene_missing" });
    await actions.invoke(authoring.update, { id: pinned.id, patch: { scene_provider_id: "example.review" } });
    const exact = (await actions.invoke(authoring.publish, { id: pinned.id })).function;
    assert.equal(exact.scene_version, 2); assert.equal(exact.scene_provider_id, "example.review");
    assert.deepEqual(publishedFunctionAction(exact).action.result_scene, { scene_id: scene.scene_id, version: 2, provider_id: "example.review" });
    let compatible = await host.sceneClient().discoverScenes(owner, publishedFunctionAction(exact));
    assert.equal(compatible.find(row => row.definition.version === 1)?.compatible, false);
    assert.equal(compatible.find(row => row.definition.version === 2)?.compatible, true);
    await assert.rejects(host.sceneClient().bind(owner, { binding_id: "wrong-version", scene_id: scene.scene_id, scene_version: 1, project_id: null,
      title: "Wrong version", function: { ...publishedFunctionAction(exact), provider_id: "system.functions" }, enabled: true }), { code: "actions.scene_incompatible" });
    removeSecond();
    const removeReplacement = register({ ...scene, version: 2 }, "replacement-provider");
    compatible = await host.sceneClient().discoverScenes(owner, publishedFunctionAction(exact));
    assert.equal(compatible.find(row => row.definition.version === 2)?.compatible, false, "a matching schema does not redirect an authored provider reference");
    const standalone = await actions.invoke(publishedFunctionAction(exact), { content: "Still callable without its consumer" });
    assert.equal(standalone.status, "ok");
    removeReplacement();
    await actions.invoke(authoring.update, { id: draft.id, patch: { scene_map: { true: "not-accepted", false: "later" } } });
    await actions.invoke(authoring.preview, { id: draft.id, input: "Original note" });
    await assert.rejects(actions.invoke(authoring.publish, { id: draft.id }), { code: "actions.scene_incompatible" });
    const retained = (await actions.invoke(authoring.get, { id: draft.id })).function;
    assert.equal(retained.status, "draft"); assert.equal(retained.scene_map.true, "not-accepted");
    await actions.invoke(authoring.update, { id: draft.id, patch: { scene_map: { true: "ack", false: "later" } } });
    const published = (await actions.invoke(authoring.publish, { id: draft.id })).function;
    assert.equal(published.status, "published");
    assert.equal(published.scene_version, 1); assert.equal(published.scene_provider_id, "example.review", "legacy draft pins the sole validated scene during publication");
    remove();
    assert.equal((await actions.invoke(authoring.publish, { id: draft.id })).function.id, published.id, "repeated publication does not mutate the immutable version");
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("system rule authoring shares the real Host across HTTP and internal calls, preserves data on restart and enforces grants", async () => {
  const home = await mkdtemp(join(tmpdir(), "rule-authoring-"));
  const calls: string[] = [];
  const provider: TypeSafeProvider = { async evaluate(_key, record, input) {
    calls.push(input);
    return { primitive: record.primitive, choice: record.primitive === "choice" ? "yes" : null,
      noul: record.primitive === "noul" ? .8 : null, score: record.primitive === "score" ? 1 : null,
      legend: record.primitive === "score" ? ["low", "high"] : null, probabilities: {}, confidence: null, model: "jev-1.13.0" };
  } };
  const functions = { env: { TYPESAFE_API_KEY: "test-only-not-a-real-key" }, provider };
  let host = new MolisWorkLocalHost({ homeDirectory: home, functions });
  const controlToken = "system-rule-authoring-control-token";
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`;
    const http = async (path: string, body?: unknown, status = 200) => {
      const response = await fetch(origin + path, { method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body),
        headers: { origin, "content-type": "application/json", "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": crypto.randomUUID() } });
      const payload = await response.json(); assert.equal(response.status, status, JSON.stringify(payload)); return payload as { function: FunctionRecord; code?: string };
    };
    const client = host.homeActionClient(), actions = bindActionClient(client, () => owner);
    await assert.rejects(client.invoke({ ...owner, permissions: ["functions:invoke"] }, authoring.create, {}), { code: "actions.forbidden" });
    await assert.rejects(client.invoke(owner, authoring.create, { primitive: "bogus" }), { code: "actions.input_invalid" });
    const published: FunctionRecord[] = [];
    for (const primitive of ["choice", "noul", "score"] as const) {
      // The legacy URL is only a thin spelling alias, including mutation paths.
      const draft = (await http("/api/plugins/functions", { primitive, function_key: `auth_${primitive}`, name: `Rule ${primitive}` })).function;
      assert.equal((await actions.invoke(authoring.get, { id: draft.id })).function.function_key, draft.function_key);
      const criteria = primitive === "choice" ? [{ key: "yes", description: "yes" }, { key: "no", description: "no" }]
        : primitive === "score" ? ["low", "high"] : { true_description: "yes", false_description: "no" };
      const updated = (await actions.invoke(authoring.update, { id: draft.id, updated_at: draft.updated_at, patch: { instructions: "Check the input", criteria } })).function;
      await http(`/api/functions/${draft.id}`, { updated_at: draft.updated_at, name: "stale" }, 409);
      await assert.rejects(client.invoke({ ...owner, permissions: ["functions:manage"] }, authoring.preview, { id: draft.id, input: "denied" }), { code: "actions.forbidden" });
      const preview = (await http(`/api/functions/${draft.id}/preview`, { input: `preview-${primitive}`, updated_at: updated.updated_at })).function;
      assert.equal(preview.last_preview?.primitive, primitive, "HTTP preview must use the Host-injected provider");
      const live = (await http(`/api/functions/${draft.id}/publish`, { updated_at: preview.updated_at })).function;
      published.push(live);
      assert.equal(live.status, "published");
      assert.ok((await client.discover(owner)).some(row => row.capability_id === publishedFunctionAction(live).capability_id && row.version === live.version));
      await actions.invoke(publishedFunctionAction(live), { content: `invoke-${primitive}` });
      await http(`/api/functions/${live.id}/delete`, {}, 400);
    }
    assert.deepEqual(calls, ["preview-choice", "invoke-choice", "preview-noul", "invoke-noul", "preview-score", "invoke-score"]);
    const draft = (await actions.invoke(authoring.create, { name: "Samples" })).function;
    const sampled = (await actions.invoke(authoring.addSample, { id: draft.id, input: "example" })).function;
    assert.equal(sampled.samples[0]?.input, "example");
    assert.equal((await actions.invoke(authoring.removeSample, { id: draft.id, sample_id: sampled.samples[0]!.id })).function.samples.length, 0);
    await actions.invoke(authoring.delete, { id: draft.id });
    await assert.rejects(actions.invoke(authoring.get, { id: draft.id }), { code: "functions.not_found" });
    assert.deepEqual(host.status().projects, [], "authoring does not create an artificial project");
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await host.close();
    host = new MolisWorkLocalHost({ homeDirectory: home, functions });
    const reopened = bindActionClient(host.homeActionClient(), () => owner);
    for (const live of published) assert.deepEqual((await reopened.invoke(authoring.get, { id: live.id })).function, live);
    const store = openFunctionsStore(home);
    try { assert.equal(store.listJudgments().filter(row => row.function_key.startsWith("auth_")).length, 3); } finally { store.close(); }
    const invokeView = (await host.inspectActions({ actor_id: "runtime:codex", project_id: null, audience: "mcp", permissions: [] }))
      .find(view => view.capability_id === "functions.invoke")!;
    await writeMcpActionGrant(home, createMcpActionGrant("runtime:codex", null, invokeView, true));
    for (const projectId of ["client-project-a", "client-project-b"]) {
      const mcp = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", {
        projectId, boardId: projectId, databasePath: join(home, `${projectId}.sqlite`), webBaseUrl: origin,
      }, { homeDirectory: home, runtimeContext: { runtime_id: "codex", stable_work_context_id: projectId, host_declares_stable: true } }, host);
      try {
        const result = JSON.parse(await mcp.callTool("molis_work_v1_functions_invoke", { function_key: published[0]!.function_key, input: projectId }));
        assert.equal(result.data.choice, "yes");
      } finally { await mcp.close(); }
    }
    const history = openFunctionsStore(home);
    try {
      assert.deepEqual(history.listJudgments().filter(row => row.subject.board_id).map(row => row.subject.board_id).sort(), ["client-project-a", "client-project-b"]);
    } finally { history.close(); }
  } finally {
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    await host.close(); await rm(home, { recursive: true, force: true });
  }
});

test("cancelling a registered trial forwards cancellation and does not persist a preview", async () => {
  const home = await mkdtemp(join(tmpdir(), "rule-trial-cancel-"));
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const provider: TypeSafeProvider = { async evaluate(_key, _record, _input, signal) {
    assert.ok(signal); entered();
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  } };
  const host = new MolisWorkLocalHost({ homeDirectory: home, functions: { env: { TYPESAFE_API_KEY: "fixture" }, provider } });
  try {
    const actions = bindActionClient(host.homeActionClient(), () => owner);
    const draft = (await actions.invoke(authoring.create, { primitive: "noul" })).function;
    await actions.invoke(authoring.update, { id: draft.id, patch: { instructions: "Decide", criteria: { true_description: "yes", false_description: "no" } } });
    const controller = new AbortController();
    const pending = host.homeActionClient().invoke({ ...owner, signal: controller.signal }, authoring.preview, { id: draft.id, input: "cancel" });
    const rejected = assert.rejects(pending, { name: "AbortError" });
    await started; controller.abort(); await rejected;
    assert.equal((await actions.invoke(authoring.get, { id: draft.id })).function.last_preview, null);
    let finish!: () => void, enterLate!: () => void;
    const lateStarted = new Promise<void>(resolve => { enterLate = resolve; });
    provider.evaluate = async () => {
      enterLate(); await new Promise<void>(resolve => { finish = resolve; });
      return { primitive: "noul", choice: null, noul: .8, score: null, legend: null, probabilities: {}, confidence: null, model: "jev-1.13.0" };
    };
    const lateController = new AbortController();
    const late = host.homeActionClient().invoke({ ...owner, signal: lateController.signal }, authoring.preview, { id: draft.id, input: "late result" });
    const lateRejected = assert.rejects(late, { name: "AbortError" });
    await lateStarted; lateController.abort(); finish(); await lateRejected;
    assert.equal((await actions.invoke(authoring.get, { id: draft.id })).function.last_preview, null, "a provider ignoring cancellation cannot persist a late result");
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});
