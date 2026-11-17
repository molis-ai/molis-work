import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";

const definition: ActionDefinition = { capability_id: "fixture.review.write", version: 1, operation: "command", action: {
  title: "Write", description: "Write the selected text", kind: "operation", scope: "project", audiences: ["agent"], permissions: ["fixture:write"], subject_kinds: [],
  input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
} };
const caller: ActionCallContext = { actor_id: "agent", project_id: "p", audience: "agent", permissions: ["fixture:write"] };
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };

test("APR-07/08: a review pins the original registration, provider and scope without invoking or rediscovering", async () => {
  const service = new ActionService(); let writes = 0;
  const register = () => service.registerProvider({ provider: { provider_id: "original", project_id: "p", kind: "plugin", title: "Original" },
    definitions: [definition], handlers: [{ ...definition, handle: () => { writes++; return null; } }] });
  const remove = register(), offered = service.discover(caller)[0]!;
  const control = service.prepareReview(caller, offered, { text: "fixed" });
  const unrelated = service.registerProvider({ provider: { provider_id: "unrelated", project_id: "p", kind: "plugin", title: "Other" },
    definitions: [{ ...definition, capability_id: "fixture.other.write" }], handlers: [{ ...definition, capability_id: "fixture.other.write", handle: () => null }] });
  control.assertCurrent(); unrelated(); control.assertCurrent();
  assert.throws(() => service.prepareReview(caller, { ...offered, provider: { ...offered.provider, provider_id: "forged" } }, { text: "fixed" }));
  assert.throws(() => service.prepareReview({ ...caller, project_id: "other" }, offered, { text: "fixed" }));
  assert.throws(() => service.prepareReview(caller, offered, { text: 12 }));
  remove(); const removeReplacement = register();
  assert.throws(control.assertCurrent, { code: "actions.provider_changed" });
  await assert.rejects(control.beforeEffect(), { code: "actions.provider_changed" });
  assert.equal(writes, 0); removeReplacement();
});

test("APR-08: the same registration guard rejects revocation during asynchronous Host policy checking", async () => {
  const entered = gate(), resume = gate(); let granted = true, writes = 0;
  const service = new ActionService(undefined, { beforeEffect: async () => { entered.release(); await resume.promise; } });
  const remove = service.registerProvider({ provider: { provider_id: "owner", project_id: "p", kind: "plugin", title: "Owner" }, definitions: [definition],
    handlers: [{ ...definition, handle: () => { writes++; return null; } }] });
  const context = { ...caller, assert_authority_current: () => assert.ok(granted, "original grant revoked") };
  const control = service.prepareReview(context, service.discover(context)[0]!, { text: "fixed" });
  const checking = control.beforeEffect(); await entered.promise; granted = false; resume.release();
  await assert.rejects(checking, /original grant revoked/); assert.equal(writes, 0); remove();
});
