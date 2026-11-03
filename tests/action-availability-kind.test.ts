import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, bindActionClient, type ActionAvailability, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionService, CapabilityRegistry } from "@molis-ai/molis-work-kernel";
import { actionHttpStatus, bindOwnerPluginAction } from "@molis-ai/molis-work-plugin-sdk";

const action: ActionDefinition<Record<string, never>, null> = { capability_id: "example.availability.save", version: 1, operation: "command", action: {
  title: "Save", description: "A write guarded by its owner", kind: "operation", scope: "home", audiences: ["user"], permissions: [], subject_kinds: [],
  input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "null" },
} };
const caller: ActionCallContext = { actor_id: "owner", project_id: null, audience: "user", permissions: [] };
const unavailable: ActionAvailability = { available: false, code: "example.unavailable", reason: "当前环境不能发出成果", kind: "conflict" };
const rejected = (error: unknown) => {
  assert.ok(error instanceof ActionError);
  assert.deepEqual([error.code, error.message, error.kind, actionHttpStatus(error)], ["example.unavailable", "当前环境不能发出成果", "conflict", 409]);
  return true;
};

test("W3-02-G1-02 registry and action dispatch preserve availability kind and refuse before a business write", async () => {
  const registry = new CapabilityRegistry<ActionCallContext>();
  let writes = 0;
  registry.register(action, () => { writes++; return null; }, { availability: () => unavailable });
  await assert.rejects(registry.invoke(caller, action, {}), rejected);
  const service = new ActionService();
  let state: ActionAvailability = unavailable;
  service.registerProvider({ provider: { provider_id: "example", title: "Example", kind: "plugin" }, definitions: [action],
    handlers: [{ ...action, availability: () => state, handle: () => { writes++; return null; } }] });
  await assert.rejects(service.invoke(caller, action, {}), rejected);
  state = { available: false, code: "example.unclassified", reason: "尚未分类" };
  await assert.rejects(service.invoke(caller, action, {}), (error: unknown) => {
    assert.ok(error instanceof ActionError);
    assert.deepEqual([error.code, error.message, error.kind, actionHttpStatus(error)], ["example.unclassified", "尚未分类", undefined, 400]);
    return true;
  });
  assert.equal(writes, 0);
});

test("W3-02-G1-02 SDK owner binding preserves dependency and before-write availability kind", async () => {
  const service = new ActionService();
  let writes = 0;
  service.registerProvider({ provider: { provider_id: "example", title: "Example", kind: "plugin", plugin_install_id: "install" }, definitions: [action],
    handlers: [{ ...action, availability: () => unavailable, handle: () => { writes++; return null; } }] });
  const bound = bindActionClient(service, () => caller);
  const context: PluginStartContext = { actor_id: "owner", plugin_id: "io.molis.work.example.availability", install_id: "install", installation_generation: "1", version: "1.0.0",
    // The dependency answers unavailable through the plugin's own action client, as `services.actions.availability` asks the Host.
    deployment: "local", grants: [], requireGrant: () => undefined, services: { actions: { ...bound, availability: () => unavailable, invokeQuery: async () => null as never },
      ui: { register: () => undefined, unregister: () => undefined } } };
  const beforeDependency = bindOwnerPluginAction(context, action, () => { writes++; return null; }, [action]);
  await assert.rejects(Promise.resolve(beforeDependency.handle(caller, {})), rejected);
  const beforeWrite = bindOwnerPluginAction(context, action, () => { writes++; return null; });
  await assert.rejects(Promise.resolve(beforeWrite.handle(caller, {})), rejected);
  assert.equal(writes, 0);
});
