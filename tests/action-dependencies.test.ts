import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import type { ActionCallContext, ActionDefinition, ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";

const caller: ActionCallContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: ["source:read"] };
const provider = { provider_id: "unknown.provider", title: "Unknown provider", kind: "plugin" as const };
const action = (id: string, dependencies: readonly ActionReference[] = []): ActionDefinition => ({ capability_id: id, version: 1, operation: "query",
  action: { title: id, description: "Read through declared dependencies", kind: "query", scope: "project", audiences: ["user", "mcp"],
    permissions: [], subject_kinds: [], input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "number" }, required_actions: dependencies } });

test("registered dependency graph enforces permissions, versions, source identity and lifecycle without changing consumer references", async () => {
  const service = new ActionService();
  const leaf = action("unknown.source");
  const secured = { ...leaf, action: { ...leaf.action, permissions: ["source:read"] } };
  const middle = action("unknown.middle", [{ ...leaf, provider_id: provider.provider_id }]);
  const root = action("unknown.root", [middle]);
  let reads = 0, connected = true;
  const start = (providerId = provider.provider_id, version = 1) => service.registerProvider({ provider: { ...provider, provider_id: providerId },
    definitions: [{ ...secured, version }], handlers: [{ ...secured, version, handle: () => { reads++; return 7; } }],
    availability: () => connected ? { available: true } : { available: false, code: "fixture.disconnected", reason: "Source disconnected" } });
  service.registerProvider({ provider: { ...provider, provider_id: "consumer" }, definitions: [root, middle], handlers: [
    { ...root, handle: c => service.invoke(c, middle, {}) }, { ...middle, handle: c => service.invoke(c, leaf, {}) },
  ] });
  const state = (context = caller) => service.discover(context).find(view => view.capability_id === root.capability_id)!.availability;
  assert.equal(state().available, false);
  await assert.rejects(service.invoke(caller, root, {}), { code: "actions.dependency_missing" });
  let stop = start();
  assert.equal(state().available, true); assert.equal(reads, 0, "discovery must not execute a handler");
  assert.equal(await service.invoke(caller, root, {}), 7); assert.equal(reads, 1);
  for (const denied of [{ ...caller, permissions: [] }, { ...caller, allowed_capability_ids: [root.capability_id, middle.capability_id] }]) {
    assert.equal(state(denied).available, false);
    await assert.rejects(service.invoke(denied, root, {}), { code: "actions.forbidden" });
  }
  connected = false;
  assert.deepEqual(state(), { available: false, code: "fixture.disconnected", reason: "Source disconnected" });
  await assert.rejects(service.invoke(caller, root, {}), { code: "fixture.disconnected" });
  connected = true; assert.equal(state().available, true);
  stop(); stop = start("replacement");
  await assert.rejects(service.invoke(caller, root, {}), { code: "actions.provider_changed" });
  stop(); stop = start(provider.provider_id, 2);
  await assert.rejects(service.invoke(caller, root, {}), { code: "actions.dependency_missing" });
  stop(); stop = start();
  assert.equal(await service.invoke(caller, root, {}), 7); assert.equal(reads, 2);
  stop(); assert.equal(state().available, false);
});

test("invalid dependency declarations fail activation and cycles fail discovery and execution without stack overflow", async () => {
  const service = new ActionService();
  const invalid = action("invalid", [{ capability_id: "", version: 0 }]);
  assert.throws(() => service.registerProvider({ provider, definitions: [invalid], handlers: [{ ...invalid, handle: () => 0 }] }), { code: "actions.definition_invalid" });
  const a = action("cycle.a", [{ capability_id: "cycle.b", version: 1 }]);
  const b = action("cycle.b", [a]);
  let calls = 0;
  const stop = service.registerProvider({ provider, definitions: [a, b], handlers: [a, b].map(definition => ({ ...definition, handle: () => ++calls })) });
  for (const view of service.discover(caller)) assert.equal((view.availability as { code: string }).code, "actions.dependency_cycle");
  await assert.rejects(service.invoke(caller, a, {}), { code: "actions.dependency_cycle" });
  assert.equal(calls, 0); stop();
  const recovered = action("cycle.a");
  service.registerProvider({ provider, definitions: [recovered], handlers: [{ ...recovered, handle: () => 1 }] });
  assert.equal(await service.invoke(caller, recovered, {}), 1, "checks cannot leave stale stack state");
});

test("Host propagates async dependency lifecycle by project, including revocation while a call is queued", async () => {
  const leaf = action("runtime.leaf"), middle = action("runtime.middle", [leaf]), root = action("runtime.root", [middle]);
  const ref = (id: string) => ({ project_id: id, board_id: id, storage_key: `memory:${id}` });
  const disabled = new Set<string>();
  let entered!: () => void, release!: () => void, reads = 0;
  const enteredCall = new Promise<void>(resolve => { entered = resolve; });
  const released = new Promise<void>(resolve => { release = resolve; });
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} },
    actionAvailability: async (context, view) => {
      await Promise.resolve();
      return view.capability_id === leaf.capability_id && disabled.has(context.project_id!)
        ? { available: false, code: "fixture.disabled", reason: "Plugin stopped" } : { available: true };
    },
  });
  try {
    for (const id of ["a", "b"]) {
      const client = host.actionClient(ref(id));
      host.actionRegistry(ref(id)).registerProvider({ provider, definitions: [root, middle, leaf], handlers: [
        { ...root, handle: c => client.invoke(c, middle, {}) }, { ...middle, handle: c => client.invoke(c, leaf, {}) },
        { ...leaf, handle: () => ++reads },
      ] });
    }
    const client = host.actionClient(ref("a"));
    assert.equal(await client.invoke(caller, root, {}), 1);
    const holding = host.withRuntime(ref("a"), async () => { entered(); await released; });
    await enteredCall;
    const queued = client.invoke(caller, root, {});
    const rejection = assert.rejects(queued, { code: "fixture.disabled" });
    disabled.add("a"); release(); await holding; await rejection;
    assert.equal((await client.discover(caller)).find(view => view.capability_id === root.capability_id)!.availability.available, false);
    assert.equal(reads, 1);
    assert.equal(await host.actionClient(ref("b")).invoke({ ...caller, project_id: "b" }, root, {}), 2);
    disabled.delete("a"); assert.equal(await client.invoke(caller, root, {}), 3);
  } finally { release?.(); await host.close(); }
});
