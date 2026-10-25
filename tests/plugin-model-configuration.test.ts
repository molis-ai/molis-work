import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, type ActionExecutionContext, type ActionDefinition, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { createPluginModelConfigurationClient, PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { jellyManifest, jellyServiceActions, jellyActions, JELLY_MODEL_CONFIGURATION } from "@molis-ai/molis-work-plugin-jelly";
import { deferred } from "./fixtures/home-runtime.js";

async function fixture() {
  let active = true, writes = 0, reads = 0;
  const grants = new Set(["storage:private", "model:invoke", "jelly:settings", "jelly:read"]);
  const view = { configured: false, providers: [], connections: [], source: "none" as const };
  let operation: () => unknown = () => undefined, registration!: ActionProviderRegistration;
  const actions = [jellyServiceActions.modelSettings, jellyServiceActions.saveModelSettings, jellyActions.modelPlan];
  const manifest = { ...jellyManifest, plugin_id: `io.molis.work.example.config${crypto.randomUUID().replaceAll("-", "")}`, ui: { contributions: [] }, routes: [], actions };
  const definition = { manifest, async start() { return { kind: "app" as const, actions: actions.map(action => ({ ...action, handle: () => operation() })) }; } };
  const runtime = new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS, actions: { registry: { registerProvider(value) { registration = value; return () => {}; } } } });
  const installed = runtime.install({ trust: { level: "unsigned" }, definition, deployment: "local", grants: [...grants] }).install;
  await runtime.start(installed.install_id);
  const client = createPluginModelConfigurationClient(jellyManifest, JELLY_MODEL_CONFIGURATION,
    { selection: () => ({ provider_id: "chosen", model_id: "model" }), read: () => { reads++; return view; }, save: () => { writes++; return view; } },
    { install_id: installed.install_id, installation_generation: installed.installation_generation, assertActive() { if (!active) throw new ActionError("actions.provider_stopped", "stopped"); },
      requireGrant(permission) { if (!grants.has(permission)) throw new ActionError("actions.plugin_permission", "revoked"); } });
  const caller: ActionExecutionContext = { actor_id: "person", project_id: null, audience: "user", permissions: ["jelly:settings"], beforeEffect: async () => {} };
  const run = <T>(fn: () => T, action: ActionDefinition = jellyServiceActions.saveModelSettings, control = caller): T => {
    operation = fn;
    const handler = registration.handlers.find(item => item.capability_id === action.capability_id)!;
    return handler.handle(control, {}) as T;
  };
  return { client, grants, caller, run, view, installId: installed.install_id, generation: installed.installation_generation, stop: () => { active = false; }, writes: () => writes, reads: () => reads };

}

test("W5-01-JMC-03 settings-only callers can repair configuration without the installation model grant", async () => {
  const f = await fixture(); f.grants.delete("model:invoke");
  assert.deepEqual(await f.run(() => f.client.save({ provider_id: "chosen", model_id: "model" })), f.view);
  assert.deepEqual(await f.run(() => f.client.read(), jellyServiceActions.modelSettings), f.view);
  assert.throws(() => f.client.selection(), { code: "actions.plugin_permission" });
  assert.equal(f.writes(), 1); assert.equal(f.reads(), 1);
});

test("W5-01-JMC-02 configuration rejects outside, foreign, plan-only and wrong settings action calls", async () => {
  const f = await fixture();
  await assert.rejects(f.client.save({}), { code: "plugin.model_configuration_action_required" });
  const other = await fixture();
  await assert.rejects(f.run(() => other.client.save({})), { code: "plugin.model_configuration_action_required" });
  await assert.rejects(f.run(() => f.client.save({}), jellyActions.modelPlan as never), { code: "plugin.model_configuration_action_required" });
  await assert.rejects(f.run(() => f.client.save({}), jellyServiceActions.modelSettings), { code: "plugin.model_configuration_action_required" });
  await assert.rejects(f.run(() => f.client.save({}), jellyServiceActions.saveModelSettings, { ...f.caller, permissions: ["model:invoke"] }), { code: "actions.forbidden" });
  assert.equal(f.writes(), 0);
});

test("W5-01-JMC-02 stop, storage revocation and caller expiration during beforeEffect never reach the configuration owner", async () => {
  for (const change of ["stop", "storage", "caller"] as const) {
    const f = await fixture(), entered = deferred(), release = deferred(); let expired = false;
    const caller = { ...f.caller, beforeEffect: async () => { entered.resolve(); await release.promise; },
      assert_authority_current: () => { if (expired) throw new ActionError("actions.expired", "expired"); } };
    const result = f.run(() => f.client.save({}), jellyServiceActions.saveModelSettings, caller);
    await entered.promise;
    if (change === "stop") f.stop(); else if (change === "storage") f.grants.delete("storage:private"); else expired = true;
    release.resolve(); await assert.rejects(result); assert.equal(f.writes(), 0);
  }
});

test("W5-01-JMC-03 configuration copies input before yielding and refuses expired inherited scope", async () => {
  const f = await fixture(), entered = deferred(), release = deferred(); let saved: unknown;
  const client = createPluginModelConfigurationClient(jellyManifest, JELLY_MODEL_CONFIGURATION,
    { selection: () => undefined, read: () => f.view, save: input => { saved = input; return f.view; } },
    { install_id: f.installId, installation_generation: f.generation, assertActive() {}, requireGrant() {} });
  const input = { provider_id: "original", model_id: "model" };
  const result = f.run(() => client.save(input), jellyServiceActions.saveModelSettings,
    { ...f.caller, beforeEffect: async () => { entered.resolve(); await release.promise; } });
  await entered.promise; input.provider_id = "changed"; release.resolve(); await result;
  assert.deepEqual(saved, { provider_id: "original", model_id: "model" });
  await assert.rejects(f.run(() => new Promise((resolve, reject) => setImmediate(() => { client.save({}).then(resolve, reject); })),
    jellyServiceActions.saveModelSettings, { ...f.caller, beforeEffect: async () => { throw new ActionError("actions.expired", "expired"); } }), { code: "actions.expired" });
});
