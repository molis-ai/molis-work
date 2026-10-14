import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, type ActionDefinition, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";

const action: ActionDefinition = { capability_id: "fixture.deferred", version: 1, operation: "command", action: {
  title: "Deferred", description: "Retained registration", kind: "operation", scope: "project", audiences: ["user"], permissions: [], subject_kinds: [],
  input_schema: { type: "object" }, output_schema: { type: "null" }, execution: { cost: "none", timeout_ms: 1000 },
} };
const caller = { actor_id: "owner", audience: "user" as const, project_id: "a", permissions: [] };

test("PAS-10: retained background authority outlives the start handler but rejects replacement, cancellation and revocation", async () => {
  const service = new ActionService();let guard!: () => Promise<void>, execution!: ActionExecutionContext;
  const register = () => service.registerProvider({ provider: { provider_id: "owner", title: "Owner", kind: "system", project_id: "a" }, definitions: [action],
    handlers: [{ ...action, handle: context => { execution = context;guard = context.retainAuthority!([{ ...action, provider_id: "owner" }]);return null; } }] });
  let dispose = register();let allowed = true;
  const signal = new AbortController();
  try {
    await service.invoke({ ...caller, signal: signal.signal, validate_authority: () => { if (!allowed) throw new ActionError("actions.revoked", "Revoked"); } }, action, {});
    assert.equal(execution.signal?.aborted, true, "the start action's execution lifetime ended");
    await assert.rejects(execution.beforeEffect(), { code: "actions.expired" });
    await guard();
    allowed = false;await assert.rejects(guard(), { code: "actions.revoked" });allowed = true;
    dispose();dispose = register();await assert.rejects(guard(), { code: "actions.provider_changed" });
    await service.invoke({ ...caller, signal: signal.signal }, action, {});
    signal.abort();await assert.rejects(guard(), { name: "AbortError" });
    assert.throws(() => execution.retainAuthority!([action]), { code: "actions.expired" });
  } finally { dispose(); }
});

test("PAS-10: retained authority refuses a provider replaced while authorization is awaiting", async () => {
  const service = new ActionService();let guard!: () => Promise<void>;
  const register = () => service.registerProvider({ provider: { provider_id: "owner", title: "Owner", kind: "system", project_id: "a" }, definitions: [action],
    handlers: [{ ...action, handle: context => { guard = context.retainAuthority!([action]);return null; } }] });
  let dispose = register();const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();let hold = false;
  try {
    await service.invoke({ ...caller, validate_authority: async () => { if (hold) { entered.resolve();await release.promise; } } }, action, {});
    hold = true;const checking = guard();const rejected = assert.rejects(checking, { code: "actions.provider_changed" });
    await entered.promise;dispose();dispose = register();release.resolve();await rejected;
  } finally { release.resolve();dispose(); }
});

test("PAS-10: retaining another project's or provider's action never grants authority", async () => {
  const service = new ActionService();
  const other = { ...action, capability_id: "fixture.private" };
  service.registerProvider({ provider: { provider_id: "foreign", title: "Foreign", kind: "system", project_id: "b" }, definitions: [other], handlers: [{ ...other, handle: () => null }] });
  service.registerProvider({ provider: { provider_id: "owner", title: "Owner", kind: "system", project_id: "a" }, definitions: [action], handlers: [{ ...action, handle: context => {
    assert.throws(() => context.retainAuthority!([other]), { code: "actions.forbidden" });
    assert.throws(() => context.retainAuthority!([{ ...action, provider_id: "forged" }]), { code: "actions.forbidden" });
    return null;
  } }] });
  await service.invoke(caller, action, {});
});
