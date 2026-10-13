import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ActionError, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * `authorship: "session"` is enforced where an action is dispatched, so a call that a wrapper makes on a client's behalf
 * (an offer the Home runs, a workflow step) meets the same rule as the client's own call.
 */
const provider = { provider_id: "authorship-fixture", title: "作者检查", kind: "system" as const };
const shape = { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false };
const base: ActionDefinition["action"] = { title: "t", description: "d", kind: "operation", scope: "project",
  audiences: ["user", "workflow", "mcp", "agent"], permissions: [], subject_kinds: ["text"], input_schema: shape };
const recorded: ActionDefinition = { capability_id: "fixture.recorded.write", version: 1, operation: "command", action: { ...base, authorship: "session" } };
const plain: ActionDefinition = { capability_id: "fixture.plain.write", version: 1, operation: "command", action: base };
const wrapper: ActionDefinition = { capability_id: "fixture.wrapper.run", version: 1, operation: "command",
  action: { ...base, input_schema: { type: "object", properties: { text: { type: "string" }, target: { type: "string" } }, required: ["text", "target"], additionalProperties: false } } };

function fixture() {
  const service = new ActionService();
  const writes: string[] = [];
  service.registerProvider({ provider: { ...provider, project_id: "project-one" }, definitions: [recorded, plain, wrapper], handlers: [
    { ...recorded, handle: (caller, input) => { writes.push(`recorded:${caller.audit_actor_id ?? caller.actor_id}:${(input as { text: string }).text}`); return { ok: true }; } },
    { ...plain, handle: (caller, input) => { writes.push(`plain:${caller.actor_id}:${(input as { text: string }).text}`); return { ok: true }; } },
    // A wrapper keeps the caller's context and only changes who it says is asking, the way the workflows plugin does.
    { ...wrapper, handle: async (caller, input) => {
      const { text, target } = input as { text: string; target: string };
      return service.invoke({ ...caller, audience: "workflow" }, target === "recorded" ? recorded : plain, { text });
    } },
  ] });
  return { service, writes };
}

const runtime = (extra: Partial<ActionCallContext> = {}): ActionCallContext => ({ actor_id: "runtime:codex", project_id: "project-one", audience: "mcp", permissions: [], ...extra });
const refused = (error: unknown) => error instanceof ActionError && error.code === "mcp.runtime_identity_missing" && /稳定 Session/.test(error.message);

test("a context that says its Runtime has no stable Session is refused by an action that declares authorship, directly and nested", async () => {
  const { service, writes } = fixture();
  const sessionless = runtime({ runtime_session_missing: true });
  await assert.rejects(service.invoke(sessionless, recorded, { text: "direct" }), refused);
  await assert.rejects(service.invoke(sessionless, wrapper, { text: "wrapped", target: "recorded" }), refused);
  assert.deepEqual(writes, [], "neither call reached the handler");
});

test("only the declaration is refused: other actions, and a Session-bound or non-Runtime caller, run as before", async () => {
  const { service, writes } = fixture();
  const sessionless = runtime({ runtime_session_missing: true });
  await service.invoke(sessionless, plain, { text: "plain" });
  await service.invoke(sessionless, wrapper, { text: "wrapped-plain", target: "plain" });
  const bound = runtime({ audit_actor_id: "runtime:codex:s1", actor_kind: "runtime", runtime_session_id: "s1" });
  await service.invoke(bound, recorded, { text: "bound" });
  await service.invoke(bound, wrapper, { text: "bound-wrapped", target: "recorded" });
  await service.invoke({ actor_id: "person", project_id: "project-one", audience: "user", permissions: [] }, recorded, { text: "person" });
  assert.deepEqual(writes, ["plain:runtime:codex:plain", "plain:runtime:codex:wrapped-plain", "recorded:runtime:codex:s1:bound",
    "recorded:runtime:codex:s1:bound-wrapped", "recorded:person:person"]);
});
