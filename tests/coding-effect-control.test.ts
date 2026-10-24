import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalHost, LocalProjectDatabase, createPluginPlatform, homeStores, seedDemoBoard, DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { ActionError, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, registerAgentHostCapabilities } from "@molis-ai/molis-work-service-agent-host";
import { createCodingPlugin, codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";
import type { AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";

// W2-18-CODING-EFFECT-01: production action/route, Host capability bridge, SDK read and both owner stores.
for (const output of ["report", "changeset", "plan"] as const) for (const stop of ["cancel", "revoke", "replace"] as const)
  test(`Coding ${output} has no late commit after ${stop} during a real SDK read${output === "plan" ? " (W5-01-CODING-18: the plan row of the session library too)" : ""}`, { timeout: 30_000 }, async t => {
    const home = await mkdtemp(join(tmpdir(), "coding-effect-")); await seedConfiguredModels(home, [{ provider_id: "fixture", model_id: "fixture" }]); seedDemoBoard(join(home, "project.db")); const store = new LocalProjectDatabase(join(home, "project.db"));
    const sessions = codingSessions(store), reviews = new AgentReviewQueue(), agentHost = new AgentHost({ reviews });
    const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.coding-effect-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: reviews,
      modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" }); agentHost.register(adapter);
    const local = new LocalHost<null>({ runtimeFactory: { open: () => null, close: () => {} } }), reference = { project_id: DEMO_PROJECT_ID, storage_key: join(home, "project.db") };
    registerAgentHostCapabilities({ register: (definition, handler) => local.registerAction(definition, handler) }, {
      agentHost: () => agentHost, projectId: () => DEMO_PROJECT_ID, authority: () => ({ manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [home] }),
    });
    // The plugin's actions and the Agent Host's are one directory, as in the product: the agent actions registered above are what Coding calls.
    const registry = local.actionRegistry(reference), client = { ...local.actionClient(reference), ...local.syncActionClient(reference) };
    local.registerAction(projectSettingsCapabilities.workspaces, () => [{ workspace_id: "work", canonical_path: home, display_name: "Fixture", realpath_verified: true }]);
    const privateStorage = new SqlitePluginPrivateStorage(store.db), artifacts = new ArtifactsModule({ db: store.db, homeOwner: "web-user", appendEvent: event => store.appendEvent(event), eventCursor: id => store.eventCursor(id) });
    const processItems = new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: id => store.eventCursor(id) });
    const target = output === "report" ? "coding.reports.save" : output === "changeset" ? "coding.changesets.save" : "coding.plans.save";
    const completed = Promise.withResolvers<void>(); let production: ActionHandlerBinding | undefined, unregisterProduction: (() => void) | undefined;
    let releaseRead = () => {};
    const register = registry.registerProvider.bind(registry);
    t.mock.method(registry, "registerProvider", registration => {
      let captured = false;
      const unregister = register({ ...registration, handlers: registration.handlers?.map(binding => {
        if (binding.capability_id !== target) return binding;
        captured = true; production ??= binding;
        return { ...binding, handle: async (caller, input) => { try { return await binding.handle(caller, input); } finally { completed.resolve(); } } };
      }) });
      if (captured) unregisterProduction ??= unregister;
      return unregister;
    });
    const platform = createPluginPlatform({ project_id: DEMO_PROJECT_ID, actor_id: "web-user", db: store.db, artifacts, processItems, ui: new UiHost(), home: { directory: home, completeText: () => undefined, stores: homeStores() },
      actions: { registry, client, project_id: DEMO_PROJECT_ID }, capabilities: local.client(reference), privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest) });
    await platform.start([{ definition: createCodingPlugin(), grants: ["search:read", "goals:read", "goals:write", "artifact:read", "artifact:write", "knowledge:read", "model:read", "storage:private", "workspace:read", "review:git-worktree", "review:git-integration"] }]);
    t.after(async () => { releaseRead(); await platform.closeCoordination(); for (const id of platform.supervisor.enabledPluginIds()) { const active = platform.supervisor.state(id); platform.supervisor.revoke(id); if (active?.install_id) await platform.runtime.stop(active.install_id); }
      await local.close(); await adapter.close(); store.close(); await rm(home, { recursive: true, force: true }); });
    t.mock.method(globalThis, "fetch", async () => cogniaModelResponse(JSON.stringify({ title: "Fixture plan", steps: [{ title: "Read fixture", acceptance: "Keep source" }], blockers: "", change_reason: "" })));
    const router = platform.router(), path = "/api/plugins/io.molis.work.coding/sessions/app";
    await sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "app", title: "Fixture", runtime_id: "prologue", at: new Date().toISOString() });
    const started = await router.dispatch({ method: "POST", pathname: path + "/runs", actor_id: "web-user", body: { task: "Plan the fixture", intent: "plan", workspace_id: "work", provider_id: "fixture", model_id: "fixture" } });
    assert.equal(started?.status, 200, JSON.stringify(started?.body)); const run = (started!.body as { run: { ref: AgentRunRef } }).run.ref;
    await new Promise<void>((resolve, reject) => { let off = () => {}; const timer = setTimeout(() => reject(new Error("SDK planning did not finish")), 10_000);
      off = adapter.observe(run, view => { if (!["completed", "failed"].includes(view.phase)) return; clearTimeout(timer); queueMicrotask(() => off()); assert.equal(view.phase, "completed"); resolve(); }); });
    for (const deadline = Date.now() + 5_000; sessions.get(DEMO_PROJECT_ID, "app").state !== "done";) {
      if (Date.now() >= deadline) throw new Error("the accepted planning follow did not finish"); await new Promise(resolve => setTimeout(resolve, 20));
    }
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), read = adapter.read.bind(adapter); let holding = true, valid = true;
    releaseRead = () => { holding = false; release.resolve(); };
    t.mock.method(adapter, "read", async (...args) => { const result = await read(...args); if (holding) { entered.resolve(); await release.promise; } return result; });
    const controller = new AbortController(), assert_current = () => { controller.signal.throwIfAborted(); if (!valid) throw new ActionError("actions.forbidden", "original invocation revoked"); };
    const before = sessions.plan(DEMO_PROJECT_ID, "app"), route = output === "plan" ? path + "/plan" : path + `/runs/${run.run_id}/${output}`;
    const pending = router.dispatch({ method: "POST", pathname: route, actor_id: "web-user", body: output === "plan" ? { run_id: run.run_id, expected_revision: 0 } : {},
      execution: { signal: controller.signal, beforeEffect: async () => { assert_current(); }, assert_authority_current: assert_current } });
    try {
      await entered.promise;
      if (stop === "cancel") controller.abort(); else if (stop === "revoke") valid = false;
      else {
        assert.ok(production); assert.ok(unregisterProduction);
        const definition = (await client.discover({ actor_id: "web-user", project_id: DEMO_PROJECT_ID, audience: "user", permissions: ["artifact:read", "artifact:write", "storage:private"] })).find(row => row.capability_id === target);
        assert.ok(definition); unregisterProduction();
        registry.registerProvider({ provider: { provider_id: platform.supervisor.state("io.molis.work.coding")!.install_id!, plugin_install_id: platform.supervisor.state("io.molis.work.coding")!.install_id!, title: "Replacement", kind: "plugin", project_id: DEMO_PROJECT_ID },
          definitions: [definition], handlers: [{ ...production, handle: () => ({}) }] });
      }
    } finally { releaseRead(); }
    const result = await pending; await completed.promise;
    assert.ok(result && result.status >= 400, JSON.stringify(result)); assert.deepEqual(sessions.plan(DEMO_PROJECT_ID, "app"), before);
    assert.equal(store.db.prepare("SELECT count(*) AS count FROM library_artifact_versions").get()!.count, 0);
    assert.equal(store.db.prepare("SELECT count(*) AS count FROM process_item_versions").get()!.count, 0);
  });
