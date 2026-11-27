import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, type ActionExecutionContext, type ActionDefinition, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { createPluginModelConfigurationClient, PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { createActionDefinition } from "@molis-ai/molis-work-plugin-sdk";
import { jellyManifest } from "@molis-ai/molis-work-plugin-jelly";
import { deferred } from "./fixtures/home-runtime.js";

// A plugin with a model choice: its settings read and save, and a model call that is not a settings action (Jelly was this until batch 112-2).
const empty = { type: "object", properties: {}, additionalProperties: false } as const;
const probe = (capability_id: string, kind: "query" | "command", permissions: string[]) => createActionDefinition<Record<string, never>, unknown>(capability_id, kind,
  { title: capability_id, description: capability_id, scope: "home", audiences: ["user"], permissions, subject_kinds: [], input_schema: empty, output_schema: { type: "object" } }, 1);
const probeActions = { modelSettings: probe("probe.model.settings", "query", ["probe:settings"]), saveModelSettings: probe("probe.model.configure", "command", ["probe:settings"]),
  modelPlan: probe("probe.plan.generate", "command", ["probe:read", "model:invoke"]) };
const PROBE_MODEL_CONFIGURATION = { preference: { store_name: "probe", file_name: "preferences.json" }, custom_provider: { provider_id: "probe-text", display_name: "探针模型" },
  actions: { read: { capability_id: "probe.model.settings", version: 1 }, save: { capability_id: "probe.model.configure", version: 1 } } };

async function fixture() {
  let active = true, writes = 0, reads = 0;
  const grants = new Set(["storage:private", "model:invoke", "probe:settings", "probe:read"]);
  const view = { configured: false, providers: [], connections: [], source: "none" as const };
  let operation: () => unknown = () => undefined, registration!: ActionProviderRegistration;
  const actions = [probeActions.modelSettings, probeActions.saveModelSettings, probeActions.modelPlan];
  // A Home plugin's Manifest with only these three actions and no library, read groups or sync of its own.
  const { summary_text: _summary, settings_entries: _preferences, databases: _databases, sync: _sync, ...home } = jellyManifest;
  const manifest = { ...home, plugin_id: `com.example.config${crypto.randomUUID().replaceAll("-", "")}`, ui: { contributions: [] }, routes: [], actions, read_groups: undefined,
    permissions: [...grants].map(permission => ({ permission, required: permission === "storage:private", reason: permission })) };
  const definition = { manifest, async start() { return { kind: "app" as const, actions: actions.map(action => ({ ...action, handle: () => operation() })) }; } };
  const runtime = new PluginRuntime(undefined, undefined, { hostIds: new Set([manifest.plugin_id]), actions: { registry: { registerProvider(value) { registration = value; return () => {}; } } } });
  // This fixture Host ships the Home-level definition (Jelly's manifest): only the Host's own build runs in the Home.
  const installed = runtime.install({ trust: { level: "host" }, definition, deployment: "local", grants: [...grants] }).install;
  await runtime.start(installed.install_id);
  const client = createPluginModelConfigurationClient(manifest, PROBE_MODEL_CONFIGURATION,
    { selection: () => ({ provider_id: "chosen", model_id: "model" }), read: () => { reads++; return view; }, save: () => { writes++; return view; } },
    { install_id: installed.install_id, installation_generation: installed.installation_generation, assertActive() { if (!active) throw new ActionError("actions.provider_stopped", "stopped"); },
      requireGrant(permission) { if (!grants.has(permission)) throw new ActionError("actions.plugin_permission", "revoked"); } });
  const caller: ActionExecutionContext = { actor_id: "person", project_id: null, audience: "user", permissions: ["probe:settings"], beforeEffect: async () => {} };
  const run = <T>(fn: () => T, action: ActionDefinition = probeActions.saveModelSettings, control = caller): T => {
    operation = fn;
    const handler = registration.handlers.find(item => item.capability_id === action.capability_id)!;
    return handler.handle(control, {}) as T;
  };
  return { client, manifest, grants, caller, run, view, installId: installed.install_id, generation: installed.installation_generation, stop: () => { active = false; }, writes: () => writes, reads: () => reads };

}

test("W5-01-JMC-03 settings-only callers can repair configuration without the installation model grant", async () => {
  const f = await fixture(); f.grants.delete("model:invoke");
  assert.deepEqual(await f.run(() => f.client.save({ provider_id: "chosen", model_id: "model" })), f.view);
  assert.deepEqual(await f.run(() => f.client.read(), probeActions.modelSettings), f.view);
  assert.throws(() => f.client.selection(), { code: "actions.plugin_permission" });
  assert.equal(f.writes(), 1); assert.equal(f.reads(), 1);
});

test("W5-01-JMC-02 configuration rejects outside, foreign, plan-only and wrong settings action calls", async () => {
  const f = await fixture();
  await assert.rejects(f.client.save({}), { code: "plugin.model_configuration_action_required" });
  const other = await fixture();
  await assert.rejects(f.run(() => other.client.save({})), { code: "plugin.model_configuration_action_required" });
  await assert.rejects(f.run(() => f.client.save({}), probeActions.modelPlan), { code: "plugin.model_configuration_action_required" });
  await assert.rejects(f.run(() => f.client.save({}), probeActions.modelSettings), { code: "plugin.model_configuration_action_required" });
  await assert.rejects(f.run(() => f.client.save({}), probeActions.saveModelSettings, { ...f.caller, permissions: ["model:invoke"] }), { code: "actions.forbidden" });
  assert.equal(f.writes(), 0);
});

test("W5-01-JMC-02 stop, storage revocation and caller expiration during beforeEffect never reach the configuration owner", async () => {
  for (const change of ["stop", "storage", "caller"] as const) {
    const f = await fixture(), entered = deferred(), release = deferred(); let expired = false;
    const caller = { ...f.caller, beforeEffect: async () => { entered.resolve(); await release.promise; },
      assert_authority_current: () => { if (expired) throw new ActionError("actions.expired", "expired"); } };
    const result = f.run(() => f.client.save({}), probeActions.saveModelSettings, caller);
    await entered.promise;
    if (change === "stop") f.stop(); else if (change === "storage") f.grants.delete("storage:private"); else expired = true;
    release.resolve(); await assert.rejects(result); assert.equal(f.writes(), 0);
  }
});

test("W5-01-JMC-03 configuration copies input before yielding and refuses expired inherited scope", async () => {
  const f = await fixture(), entered = deferred(), release = deferred(); let saved: unknown;
  const client = createPluginModelConfigurationClient(f.manifest, PROBE_MODEL_CONFIGURATION,
    { selection: () => undefined, read: () => f.view, save: input => { saved = input; return f.view; } },
    { install_id: f.installId, installation_generation: f.generation, assertActive() {}, requireGrant() {} });
  const input = { provider_id: "original", model_id: "model" };
  const result = f.run(() => client.save(input), probeActions.saveModelSettings,
    { ...f.caller, beforeEffect: async () => { entered.resolve(); await release.promise; } });
  await entered.promise; input.provider_id = "changed"; release.resolve(); await result;
  assert.deepEqual(saved, { provider_id: "original", model_id: "model" });
  await assert.rejects(f.run(() => new Promise((resolve, reject) => setImmediate(() => { client.save({}).then(resolve, reject); })),
    probeActions.saveModelSettings, { ...f.caller, beforeEffect: async () => { throw new ActionError("actions.expired", "expired"); } }), { code: "actions.expired" });
});
