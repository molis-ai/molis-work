import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ActionError, bindActionClient, retainActionAuthority, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionProviderRegistration, type ActionReference,
  type ActionSceneBinding, type ActionSceneDefinition } from "@molis-ai/molis-work-contracts/platform/actions";

const caller: ActionCallContext = { actor_id: "owner", project_id: "project", audience: "user", permissions: ["fixture:write", "fixture:consume", "fixture:configure"] };
const empty = { type: "object", additionalProperties: false };
const effect: ActionDefinition = { capability_id: "fixture.tail.effect", version: 1, operation: "command", action: {
  title: "Commit", description: "A real dispatcher effect", kind: "operation", scope: "project", audiences: ["user"], permissions: ["fixture:write"],
  subject_kinds: [], input_schema: empty, output_schema: { type: "integer" },
} };

test("W3-09-AUTH-02 async validators remain valid but the final synchronous authority check rejects a Promise", async () => {
  let writes = 0, final = false, authority = 0, permissions = 0;
  const service = new ActionService(undefined, { beforeEffect: async () => { await Promise.resolve(); final = true; } });
  const dispose = service.registerProvider({ provider: { provider_id: "effects", title: "Effects", kind: "system" }, definitions: [effect],
    handlers: [{ ...effect, handle: async context => { await context.beforeEffect(); return ++writes; } }] });
  const asyncCaller: ActionCallContext = { ...caller,
    validate_authority: async () => { await Promise.resolve(); authority++; },
    validate_permissions: async () => { await Promise.resolve(); permissions++; },
    assert_authority_current: () => undefined,
  };
  try {
    assert.equal(await service.invoke(asyncCaller, effect, {}), 1);
    assert.equal(authority, 2); assert.equal(permissions, 1);
    final = false;
    // A Promise-returning function is assignable to a TS void callback; the runtime must still reject it.
    await assert.rejects(service.invoke({ ...asyncCaller, assert_authority_current: () => final ? Promise.reject(new Error("Queued asynchronous tail")) : undefined }, effect, {}),
      { code: "actions.async_required" });
    final = false;
    await assert.rejects(bindActionClient(service, () => asyncCaller).invoke(effect, {}, {
      beforeEffect: async () => {}, assert_authority_current: async () => {},
    }), { code: "actions.async_required" }, "a control callback cannot hide an asynchronous final check");
    const retained = retainActionAuthority({ ...asyncCaller, assert_authority_current: async () => {} }, { ...effect, provider_id: "effects" });
    assert.throws(() => retained.assert_authority_current?.(), { code: "actions.async_required" });
    assert.equal(writes, 1);
  } finally { dispose(); }
});

for (const throughControl of [false, true]) test(`W3-09-AUTH-03 ${throughControl ? "bind/control" : "retained authority"} keeps the original parent's registration after the child's final await`, async () => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const child = { ...effect, capability_id: "fixture.tail.child" };
  let held = true, writes = 0;
  const service = new ActionService(undefined, { beforeEffect: async (_caller, target) => {
    if (held && target.capability_id === child.capability_id) { entered.resolve(); await release.promise; }
  } });
  const removeChild = service.registerProvider({ provider: { provider_id: "child", title: "Child", kind: "system" }, definitions: [child],
    handlers: [{ ...child, handle: async context => { await context.beforeEffect(); return ++writes; } }] });
  const registration: ActionProviderRegistration = { provider: { provider_id: "origin", title: "Origin", kind: "system" }, definitions: [effect], handlers: [{ ...effect,
    handle: (context: ActionExecutionContext) => throughControl
      ? bindActionClient(service, () => caller).invoke(child, {}, context)
      : service.invoke(retainActionAuthority(context, { ...effect, provider_id: "origin" }, context.beforeEffect), child, {}),
  }] };
  let removeOrigin = service.registerProvider(registration);
  try {
    const pending = service.invoke(caller, effect, {}), rejected = assert.rejects(pending, { code: "actions.provider_changed" });
    await Promise.race([entered.promise, pending.then(() => { throw new Error("Child settled before its final policy wait"); })]);
    removeOrigin(); removeOrigin = service.registerProvider(registration);
    held = false; release.resolve(); await rejected;
    assert.equal(writes, 0);
    assert.equal(await service.invoke(caller, effect, {}), 1);
  } finally { held = false; release.resolve(); removeOrigin(); removeChild(); }
});

const judgment: ActionDefinition = { ...effect, capability_id: "fixture.tail.judgment", action: { ...effect.action, kind: "judgment" } };
const scene: ActionSceneDefinition = { scene_id: "fixture.tail.consume", version: 1, title: "Consume a judgment", description: "Store only a currently authorized judgment",
  trigger: "fixture event", scope: "project", subject_kinds: [], input_schema: empty, result_schema: { type: "integer" },
  permissions: ["fixture:consume"], configuration_permissions: ["fixture:configure"] };
const binding: ActionSceneBinding = { binding_id: "slot", scene_id: scene.scene_id, scene_version: 1, project_id: "project", enabled: true, title: "Actual slot",
  function: { ...judgment, provider_id: "judgments" }, revision: "1" };

test("W3-09-AUTH-03 a bound child uses its own caller's exact grant while control retains only the real parent's authority", async () => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let held = false, parentGranted = true, writes = 0;
  const parent = { ...effect, capability_id: "fixture.tail.parent", action: { ...effect.action, permissions: ["fixture:parent"] } };
  const child = { ...effect, capability_id: "fixture.tail.bound-child", action: { ...effect.action, permissions: ["fixture:child"] } };
  const service = new ActionService(undefined, { beforeEffect: async (_caller, target) => {
    if (held && target.capability_id === child.capability_id) { entered.resolve(); await release.promise; }
  } });
  const principal = (actor: string, action: ActionDefinition, provider: string, active: () => boolean): ActionCallContext => {
    const reference = { capability_id: action.capability_id, version: action.version, provider_id: provider };
    const check = (target?: ActionReference, permissions: readonly string[] = []) => {
      if (!active()) throw new ActionError("fixture.parent_revoked", "The original parent's grant was revoked");
      if (target && (target.capability_id !== reference.capability_id || target.version !== reference.version || target.provider_id !== reference.provider_id)) {
        throw new ActionError("actions.forbidden", "This caller has no grant for another caller's target");
      }
      if (!permissions.every(permission => action.action.permissions.includes(permission))) throw new ActionError("actions.forbidden", "This caller has no other permissions");
    };
    return { ...caller, actor_id: actor, permissions: action.action.permissions, allowed_actions: [reference],
      validate_authority: async target => { await Promise.resolve(); check(target); },
      validate_permissions: async permissions => { await Promise.resolve(); check(undefined, permissions); }, assert_authority_current: check,
    };
  };
  const parentCaller = principal("parent", parent, "parent", () => parentGranted);
  const childCaller = principal("child", child, "child", () => true);
  const removeChild = service.registerProvider({ provider: { provider_id: "child", title: "Child", kind: "system" }, definitions: [child],
    handlers: [{ ...child, handle: async context => { await context.beforeEffect(); return ++writes; } }] });
  const removeParent = service.registerProvider({ provider: { provider_id: "parent", title: "Parent", kind: "system" }, definitions: [parent],
    handlers: [{ ...parent, handle: context => bindActionClient(service, () => childCaller).invoke(child, {}, context) }] });
  try {
    assert.equal(await service.invoke(parentCaller, parent, {}), 1, "neither caller needs the other caller's exact grant or permissions");
    held = true;
    const pending = service.invoke(parentCaller, parent, {}), rejected = assert.rejects(pending, { code: "fixture.parent_revoked" });
    await Promise.race([entered.promise, pending.then(() => { throw new Error("Bound child settled before its final wait"); })]);
    parentGranted = false; held = false; release.resolve(); await rejected;
    assert.equal(writes, 1, "the authorized child cannot borrow its own grant to keep the revoked parent alive");
    parentGranted = true;
    assert.equal(await service.invoke(parentCaller, parent, {}), 2);
  } finally { held = false; release.resolve(); removeParent(); removeChild(); }
});

function sceneFixture(fail = false) {
  const service = new ActionService(), bindings = new Map<string, ActionSceneBinding>();
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const state = { granted: true, permissionsGranted: true, configureGranted: true, returned: false, held: false, consumed: 0, failures: 0, writes: 0 };
  const assertPermissions = (permissions: readonly string[] = []) => {
    if ((!state.permissionsGranted && permissions.includes("fixture:consume")) || (!state.configureGranted && permissions.includes("fixture:configure"))) {
      throw new ActionError("fixture.permission_revoked", "Consumer permission revoked");
    }
  };
  const current: ActionCallContext = { ...caller,
    validate_authority: async () => { await Promise.resolve(); if (!state.granted) throw new ActionError("fixture.revoked", "Judgment grant revoked"); },
    validate_permissions: async permissions => { await Promise.resolve(); assertPermissions(permissions); },
    assert_authority_current: (target, permissions) => {
      if (target?.capability_id === judgment.capability_id && !state.granted) throw new ActionError("fixture.revoked", "Judgment grant revoked");
      assertPermissions(permissions);
    },
  };
  const removeJudgment = service.registerProvider({ provider: { provider_id: "judgments", title: "Judgments", kind: "system" }, definitions: [judgment],
    handlers: [{ ...judgment, handle: () => { state.returned = true; if (fail) throw new Error("Original judgment failed"); return 1; } }] });
  const removeScene = service.registerProvider({ provider: { provider_id: "consumer", title: "Consumer", kind: "system" }, definitions: [], handlers: [], scenes: [scene],
    scene_handlers: [{ ...scene, targets: () => [{ binding_id: "slot", title: "Actual slot", revision: bindings.get("slot")?.revision ?? null }],
      bindings: async () => { if (state.held && state.returned) { entered.resolve(); await release.promise; } return [...bindings.values()]; },
      bind: (_context, value) => { state.writes++; bindings.set(value.binding_id, value); },
      consume: () => ++state.consumed, failed: () => ++state.failures,
    }] });
  return { service, bindings, entered, release, state, current, close: () => { release.resolve(); removeScene(); removeJudgment(); } };
}

test("W3-09-AUTH-03 enabling a binding rechecks its exact judgment after permission waits; disabling does not invent target authority", async () => {
  const f = sceneFixture(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  try {
    const context = { ...f.current, validate_permissions: async () => { entered.resolve(); await release.promise; } };
    const pending = f.service.bind(context, binding, { provider_id: "consumer", expected_revision: null });
    const rejected = assert.rejects(pending, { code: "fixture.revoked" });
    await Promise.race([entered.promise, pending.then(() => { throw new Error("Binding settled before permissions wait"); })]);
    f.state.granted = false; release.resolve(); await rejected;
    assert.equal(f.bindings.size, 0); assert.equal(f.state.writes, 0);
    f.state.granted = true;
    await f.service.bind(f.current, binding, { provider_id: "consumer", expected_revision: null });
    f.state.granted = false;
    const origin = { ...effect, capability_id: "fixture.tail.disable", action: { ...effect.action, permissions: ["fixture:configure"], output_schema: { type: "boolean" } } };
    let retained: ActionExecutionContext | undefined;
    const remove = f.service.registerProvider({ provider: { provider_id: "manager", title: "Manager", kind: "system" }, definitions: [origin], handlers: [{ ...origin,
      handle: async caller => {
        retained = retainActionAuthority(caller, { ...origin, provider_id: "manager" }, caller.beforeEffect);
        await f.service.bind(retained, { ...binding, enabled: false }, { provider_id: "consumer", expected_revision: "1", before_write: caller.beforeEffect });
        return true;
      },
    }] });
    try {
      const manager: ActionCallContext = { ...f.current, permissions: ["fixture:configure"], allowed_actions: [{ ...origin, provider_id: "manager" }],
        validate_authority: async target => { if (target.capability_id === judgment.capability_id) throw new ActionError("fixture.revoked", "No target grant"); } };
      assert.equal(await f.service.invoke(manager, origin, {}), true);
      assert.equal(f.bindings.get("slot")?.enabled, false);
      await assert.rejects(f.service.invoke(manager, judgment, {}), { code: "fixture.revoked" });
      const tail = retained?.assert_authority_current;
      assert.ok(tail);
      assert.throws(() => tail(), { code: "actions.expired" }, "a no-target check cannot revive the finished parent or create a new grant");
    } finally { remove(); }
  } finally { release.resolve(); f.close(); }
});

test("W3-09-AUTH-03 disabling a binding still checks its original configuration permissions without claiming function authority", async () => {
  const f = sceneFixture(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  try {
    await f.service.bind(f.current, binding);
    const before = structuredClone([...f.bindings.values()]);
    f.state.granted = false;
    const context: ActionCallContext = { ...f.current, permissions: ["fixture:configure"],
      validate_authority: () => { throw new Error("Disabling must not request the function's grant"); },
      validate_permissions: async permissions => { assert.deepEqual(permissions, ["fixture:configure"]); entered.resolve(); await release.promise; },
    };
    const pending = f.service.bind(context, { ...binding, enabled: false }, { provider_id: "consumer", expected_revision: "1" });
    const rejected = assert.rejects(pending, { code: "fixture.permission_revoked" });
    await Promise.race([entered.promise, pending.then(() => { throw new Error("Disable settled before its permission wait"); })]);
    f.state.configureGranted = false; release.resolve(); await rejected;
    assert.deepEqual([...f.bindings.values()], before); assert.equal(f.state.writes, 1);
    f.state.configureGranted = true;
    await f.service.bind(context, { ...binding, enabled: false }, { provider_id: "consumer", expected_revision: "1" });
    assert.equal(f.bindings.get("slot")?.enabled, false); assert.equal(f.state.writes, 2);
  } finally { release.resolve(); f.close(); }
});

for (const fail of [false, true]) for (const independentPermission of [false, true]) test(`W3-09-AUTH-03 scene ${fail ? "failure" : "success"} consumption rechecks ${independentPermission ? "its independent permissions" : "exact authority"} after its final bindings wait`, async () => {
  const f = sceneFixture(fail);
  try {
    await f.service.bind(f.current, binding);
    const before = structuredClone([...f.bindings.values()]);
    f.state.held = true;
    const pending = f.service.runScene(f.current, scene, "slot", {}), rejected = assert.rejects(pending, { code: independentPermission ? "fixture.permission_revoked" : "fixture.revoked" });
    await Promise.race([f.entered.promise, pending.then(() => { throw new Error("Scene settled before final binding wait"); })]);
    if (independentPermission) f.state.permissionsGranted = false; else f.state.granted = false;
    f.state.held = false; f.release.resolve(); await rejected;
    assert.deepEqual([...f.bindings.values()], before); assert.equal(f.state.writes, 1);
    assert.equal(f.state.consumed, 0); assert.equal(f.state.failures, 0);
    f.state.granted = true; f.state.permissionsGranted = true;
    assert.equal(await f.service.runScene(f.current, scene, "slot", {}), 1);
    assert.equal(f.state.consumed, fail ? 0 : 1); assert.equal(f.state.failures, fail ? 1 : 0);
  } finally { f.close(); }
});
