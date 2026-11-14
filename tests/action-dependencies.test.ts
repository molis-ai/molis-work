import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { LocalHost } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext, ActionDefinition, ActionReference, ActionSceneBinding, ActionSceneDefinition } from "@molis-ai/molis-work-contracts/platform/actions";

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

test("FI-7: a delegated caller's authority check that reads its original's availability is not a dependency cycle", () => {
  const service = new ActionService();
  const b = action("authority.b"), a = action("authority.a", [b]);
  // A plugin action's availability re-checks the caller's authority, and a delegated caller's authority is its original's: the original's
  // own availability, which reads the same dependency under the original's context.
  service.registerProvider({ provider, definitions: [a, b], handlers: [a, b].map(definition => ({ ...definition, handle: () => 1,
    availability: context => { context.assert_authority_current?.(); return { available: true }; } })) });
  const delegated: ActionCallContext = { ...caller, assert_authority_current: () => {
    const original = service.discover(caller).find(view => view.capability_id === a.capability_id)!.availability;
    if (!original.available) throw new Error((original as { code: string }).code);
  } };
  assert.deepEqual(service.discover(delegated).find(view => view.capability_id === a.capability_id)!.availability, { available: true });
});

test("Host propagates async dependency lifecycle by project, including revocation while a call is queued", async () => {
  const leaf = action("runtime.leaf"), middle = action("runtime.middle", [leaf]), other = action("runtime.other", [leaf]);
  const root = action("runtime.root", [middle, other]);
  const ref = (id: string) => ({ project_id: id, storage_key: `memory:${id}` });
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
      host.actionRegistry(ref(id)).registerProvider({ provider, definitions: [root, middle, other, leaf], handlers: [
        { ...root, handle: c => client.invoke(c, middle, {}) }, { ...middle, handle: c => client.invoke(c, leaf, {}) },
        { ...other, handle: c => client.invoke(c, leaf, {}) },
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

test("BCC-07 dependency projection preserves binding order, recurses per branch and reads judgment authority after bindings", async t => {
  const project = { project_id: caller.project_id!, storage_key: "memory:projection" };
  const scene: ActionSceneDefinition = { scene_id: "projection.slot", version: 1, title: "Slot", description: "Choose a score",
    trigger: "score-needed", scope: "project", subject_kinds: [], permissions: [], configuration_permissions: ["source:read"],
    input_schema: { type: "object", additionalProperties: false },
    result_schema: { type: "number" } };
  const root = action("projection.root");
  const entry: ActionDefinition = { ...root, action: { ...root.action, audiences: ["user", "mcp", "workflow"],
    required_scene: { scene_id: scene.scene_id, version: scene.version } } };
  const judgment = (name: string): ActionDefinition => {
    const definition = action(`projection.${name}`);
    return { ...definition, operation: "command", action: { ...definition.action, kind: "judgment" } };
  };
  const first = judgment("first"), second = judgment("second"), disabled = judgment("disabled");
  const denied = new Set<string>();
  const refusal = (name: string) => ({ available: false as const, code: "fixture.unavailable", reason: name });
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} },
    actionAvailability: (_caller, view) => denied.has(view.capability_id) ? refusal(view.capability_id) : { available: true } });
  t.after(() => host.close());
  const registry = host.actionRegistry(project), scenes = host.sceneClient(project), client = host.actionClient(project);
  const saved = new Map<string, ActionSceneBinding>();
  let executions = 0, withdrawn = false;
  let pauseBindings: (() => Promise<void>) | undefined, pauseTargets: (() => Promise<void>) | undefined;
  const registerScene = () => registry.registerProvider({ provider, definitions: [entry], handlers: [{ ...entry, handle: () => ++executions }], scenes: [scene],
    scene_handlers: [{ ...scene, bindings: async () => { await pauseBindings?.(); return [...saved.values()]; },
      targets: async () => {
        await pauseTargets?.();
        return [...saved.values()].map(value => ({ binding_id: value.binding_id, title: value.title, revision: value.revision ?? null }));
      },
      bind: (_caller, value) => { saved.set(value.binding_id, { ...value, revision: `rev-${value.binding_id}` }); },
      consume: () => { executions++; },
    }] });
  const stopScene = registerScene();
  const registerJudgments = (providerId: string, definitions: ActionDefinition[]) => registry.registerProvider({
    provider: { ...provider, provider_id: providerId }, definitions,
    handlers: definitions.map(definition => ({ ...definition, handle: () => ++executions,
      availability: () => withdrawn ? refusal("grant withdrawn") : { available: true } })),
  });
  let stopFirst = registerJudgments("original-judgment", [first]);
  registerJudgments("other-judgments", [second, disabled]);
  const bind = (fn: ActionDefinition, enabled: boolean) => scenes.bind(caller, {
    binding_id: fn.capability_id, scene_id: scene.scene_id, scene_version: scene.version, project_id: project.project_id,
    function: fn, enabled, title: fn.action.title,
  });
  await bind(disabled, true); await bind(disabled, false);
  await bind(first, true); await bind(second, true);
  const state = async () => (await client.discover(caller)).find(view => view.capability_id === entry.capability_id)!.availability;
  const order = (await scenes.usages(caller)).map(use => [use.binding_id, use.enabled]);
  assert.deepEqual(order, [[disabled.capability_id, false], [first.capability_id, true], [second.capability_id, true]]);
  denied.add(first.capability_id);
  assert.deepEqual(await state(), { available: true }, "the next enabled binding can answer");
  denied.add(second.capability_id);
  assert.deepEqual(await state(), refusal(first.capability_id), "the first enabled refusal wins in owner order");
  denied.clear();
  const narrow = { ...caller, allowed_actions: [entry] };
  const inspected = await host.inspectActions(narrow, project);
  assert.ok(inspected.some(row => row.capability_id === first.capability_id), "the wide inspection exposes metadata");
  const inspectedState = inspected.find(row => row.capability_id === entry.capability_id)!.availability;
  assert.equal(!inspectedState.available && inspectedState.code, "actions.binding_invalid", "metadata does not widen binding authority");
  const workflow = await client.discover({ ...caller, audience: "workflow" });
  const workflowState = workflow.find(row => row.capability_id === entry.capability_id)!.availability;
  assert.equal(!workflowState.available && workflowState.code, "actions.binding_invalid", "the user's judgment is unavailable to this audience");
  await bind(second, false);
  const original = structuredClone([...saved.values()]);

  const targets = () => scenes.targets(caller, { ...first, provider_id: "original-judgment" });
  assert.equal((await targets()).find(row => row.binding_id === first.capability_id)?.binding?.revision, `rev-${first.capability_id}`);
  const targetEntered = Promise.withResolvers<void>(), releaseTarget = Promise.withResolvers<void>();
  pauseTargets = () => { targetEntered.resolve(); return releaseTarget.promise; };
  const targetRead = targets();
  const rejectedTarget = assert.rejects(targetRead, { code: "actions.provider_changed" });
  try {
    await Promise.race([targetEntered.promise, targetRead.then(() => assert.fail("configuration did not wait for its owner"))]);
    stopScene(); registerScene();
  } finally { pauseTargets = undefined; releaseTarget.resolve(); }
  await rejectedTarget;
  assert.deepEqual([...saved.values()], original, "a reloaded target cannot replace the earlier scene or write to its owner");

  for (const mutation of ["grant", "provider"] as const) {
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    pauseBindings = () => { entered.resolve(); return release.promise; };
    const pending = state();
    try {
      await Promise.race([entered.promise, pending.then(() => assert.fail("discovery did not read a real binding"))]);
      if (mutation === "grant") withdrawn = true;
      else { stopFirst(); stopFirst = registerJudgments("replacement-judgment", [first]); }
    } finally { pauseBindings = undefined; release.resolve(); }
    const result = await pending;
    assert.equal(!result.available && result.code, mutation === "grant" ? "fixture.unavailable" : "actions.binding_invalid");
    assert.deepEqual([...saved.values()], original, "a rejected read leaves binding revisions and identities intact");
    withdrawn = false;
  }

  stopFirst();
  const cyclic = { ...first, action: { ...first.action, required_actions: [entry] } };
  registerJudgments("original-judgment", [cyclic]);
  const cycle = await state();
  assert.equal(!cycle.available && cycle.code, "actions.dependency_cycle", "the scene, its binding and a required action return to the same path");
  await assert.rejects(client.invoke(caller, entry, {}), { code: "actions.dependency_cycle" });
  assert.equal(executions, 0);
  assert.deepEqual([...saved.values()], original);
});

test("BCC-07 a dependency missing from the current caller directory differs from one with a new provider", async t => {
  const project = { project_id: caller.project_id!, storage_key: "memory:provider-change" };
  const dependency = action("projection.source"), root = action("projection.consumer", [{ ...dependency, provider_id: "original" }]);
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} },
    actionAvailability: async (_caller, view) => {
      if (view.capability_id === root.capability_id) await pause?.();
      return { available: true };
    } });
  t.after(() => host.close());
  let pause: (() => Promise<void>) | undefined;
  const registry = host.actionRegistry(project);
  let runs = 0;
  const register = (definition: ActionDefinition, id: string) => registry.registerProvider({
    provider: { ...provider, provider_id: id }, definitions: [definition], handlers: [{ ...definition, handle: () => ++runs }],
  });
  register(root, "consumer");
  for (const outcome of ["missing", "provider_changed"] as const) {
    const stop = register(dependency, "original");
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    pause = () => { entered.resolve(); return release.promise; };
    const pending = host.inspectActions(caller, project);
    let undo: (() => void) | undefined;
    try {
      await Promise.race([entered.promise, pending.then(() => assert.fail("metadata did not wait before reading dependencies"))]);
      stop();
      if (outcome === "provider_changed") undo = register(dependency, "replacement");
    } finally { release.resolve(); pause = undefined; }
    try {
      const state = (await pending).find(row => row.capability_id === root.capability_id)!.availability;
      assert.equal(!state.available && state.code, outcome === "missing" ? "actions.dependency_missing" : "actions.provider_changed");
    } finally { undo?.(); }
  }
  assert.equal(runs, 0);
});
