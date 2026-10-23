import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, bindActionClient, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type RetainedActionAuthority } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { deferred } from "./fixtures/home-runtime.js";

const action: ActionDefinition = { capability_id: "probe.accept", version: 1, operation: "command", action: {
  title: "Accept", description: "Capture accepted authority", kind: "operation", scope: "home", audiences: ["user"], permissions: [], subject_kinds: [],
  input_schema: { type: "object" }, output_schema: { type: "null" }, scheduling: "concurrent",
} };
const caller: ActionCallContext = { actor_id: "owner", audience: "user", project_id: null, permissions: [] };

test("S-18 RAC-50 RAC-51 accepted authority outlives its transport, while the original handler expires and revocation still refuses", async () => {
  const service = new ActionService(), abort = new AbortController();
  let execution!: ActionExecutionContext, retained!: RetainedActionAuthority, allowed = true, captures = 0;
  const check = () => { if (!allowed) throw new ActionError("actions.forbidden", "revoked"); };
  const dispose = service.registerProvider({ provider: { provider_id: "probe", title: "Probe", kind: "system" }, definitions: [action],
    handlers: [{ ...action, availability: context => { context.assert_authority_current?.(); return { available: true }; },
      handle: context => { execution = context; retained = context.retainBackgroundAuthority!(); return null; } }] });
  // SYS-15-B1: availability reads use the accepted background authority after the HTTP request has ended.
  await service.invoke({ ...caller, signal: abort.signal, assert_authority_current: () => { abort.signal.throwIfAborted(); check(); },
    retain_background_authority: () => { captures++; return Object.assign(async () => check(), { assertCurrent: check }); } }, action, {});
  abort.abort(); await retained();
  await assert.rejects(execution.beforeEffect(), { code: "actions.expired" });
  assert.throws(() => execution.retainBackgroundAuthority!(), { code: "actions.expired" }); assert.equal(captures, 1);
  assert.equal(execution.retain_background_authority, undefined, "raw entry authority is never given to the handler");
  allowed = false; assert.throws(() => retained.assertCurrent(), { code: "actions.forbidden" });
  allowed = true; dispose(); await assert.rejects(retained(), { code: "actions.provider_changed" });
});

test("S-18 RAC-51 no separate transport authority keeps original cancellation", async () => {
  const service = new ActionService(), abort = new AbortController(); let retained!: RetainedActionAuthority;
  const dispose = service.registerProvider({ provider: { provider_id: "probe", title: "Probe", kind: "system" }, definitions: [action],
    handlers: [{ ...action, handle: context => { retained = context.retainBackgroundAuthority!(); return null; } }] });
  try { await service.invoke({ ...caller, signal: abort.signal }, action, {}); abort.abort(); await assert.rejects(retained(), { name: "AbortError" }); }
  finally { dispose(); }
});

test("S-18 RAC-50 a nested bound call preserves parent authority instead of replacing it with its own user grants", async () => {
  const service = new ActionService(), child = { ...action, capability_id: "probe.child" }; let retained!: RetainedActionAuthority;
  let parentAllowed = true, childAllowed = true;
  const parentCheck = () => { if (!parentAllowed) throw new ActionError("actions.forbidden", "parent revoked"); };
  const bound = bindActionClient(service, () => ({ ...caller, assert_authority_current: () => { if (!childAllowed) throw new ActionError("actions.forbidden", "child revoked"); } }));
  const dispose = service.registerProvider({ provider: { provider_id: "probe", title: "Probe", kind: "system" }, definitions: [action, child], handlers: [
    { ...action, handle: context => bound.invoke(child, {}, context) },
    { ...child, handle: context => { retained = context.retainBackgroundAuthority!(); return null; } },
  ] });
  try {
    await service.invoke({ ...caller, retain_background_authority: () => Object.assign(async () => parentCheck(), { assertCurrent: parentCheck }) }, action, {});
    await retained(); parentAllowed = false; await assert.rejects(retained(), /parent revoked/u);
    parentAllowed = true; childAllowed = false; await assert.rejects(retained(), /child revoked/u);
  } finally { dispose(); }
});

test("S-18 RAC-52 final synchronous authority and environment checks survive an asynchronous retained guard", async () => {
  const entered = deferred(), release = deferred(); let allowed = true, hold = false, retained!: RetainedActionAuthority, environment = true;
  const service = new ActionService(undefined, { assertCurrent: () => { if (!environment) throw new ActionError("actions.host_closed", "closed"); } });
  const check = () => { if (!allowed) throw new ActionError("actions.forbidden", "late revocation"); };
  const dispose = service.registerProvider({ provider: { provider_id: "probe", title: "Probe", kind: "system" }, definitions: [action],
    handlers: [{ ...action, handle: context => { retained = context.retainBackgroundAuthority!(); return null; } }] });
  try {
    await service.invoke({ ...caller, retain_background_authority: () => Object.assign(async () => { if (hold) { entered.resolve(); await release.promise; } }, { assertCurrent: check }) }, action, {});
    hold = true; const rejected = assert.rejects(retained(), /late revocation/u); await entered.promise; allowed = false; release.resolve(); await rejected;
    allowed = true; environment = false; assert.throws(() => retained.assertCurrent(), { code: "actions.host_closed" });
  } finally { release.resolve(); dispose(); }
});

test("W5-01-ALC-RES03 additional background permissions are a subset and remain revocable after the handler", async () => {
  const service = new ActionService(); let retained!: RetainedActionAuthority, allowed = true;
  const dispose = service.registerProvider({ provider: { provider_id: "probe", title: "Probe", kind: "system" }, definitions: [action],
    handlers: [{ ...action, handle: context => { retained = context.retainBackgroundAuthority!(["probe:generate"]); return null; } }] });
  try {
    await assert.rejects(service.invoke(caller, action, {}), { code: "actions.forbidden" });
    const assertCurrent = (_reference?: unknown, required?: readonly string[]) => {
      if (!allowed && required?.includes("probe:generate")) throw new ActionError("actions.forbidden", "generation revoked");
    };
    await service.invoke({ ...caller, permissions: ["probe:generate"], assert_authority_current: assertCurrent,
      validate_permissions: async required => assertCurrent(undefined, required) }, action, {});
    await retained(); allowed = false;
    assert.throws(retained.assertCurrent, /generation revoked/u); await assert.rejects(retained(), /generation revoked/u);
  } finally { dispose(); }
});

test("W5-01-ALC-RES03 nested child permissions stay with the child while the parent authority remains required", async () => {
  const service = new ActionService(), child = { ...action, capability_id: "probe.child-extra" }; let retained!: RetainedActionAuthority;
  let parentAllowed = true, childAllowed = true;
  const parentCheck = () => { if (!parentAllowed) throw new Error("parent revoked"); };
  const bound = bindActionClient(service, () => ({ ...caller, permissions: ["child:generate"],
    assert_authority_current: (_ref, required) => { if (!childAllowed && required?.includes("child:generate")) throw new Error("child revoked"); } }));
  const dispose = service.registerProvider({ provider: { provider_id: "probe", title: "Probe", kind: "system" }, definitions: [action, child], handlers: [
    { ...action, handle: context => bound.invoke(child, {}, context) },
    { ...child, handle: context => { retained = context.retainBackgroundAuthority!(["child:generate"]); return null; } },
  ] });
  try {
    await service.invoke({ ...caller, retain_background_authority: (_refs, extra) => {
      assert.deepEqual(extra, [], "child permissions are not asserted against the parent identity");
      return Object.assign(async () => parentCheck(), { assertCurrent: parentCheck });
    } }, action, {});
    await retained(); childAllowed = false; await assert.rejects(retained(), /child revoked/u);
    childAllowed = true; parentAllowed = false; await assert.rejects(retained(), /parent revoked/u);
  } finally { dispose(); }
});
