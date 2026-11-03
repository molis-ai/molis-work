import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { retainActionAuthority, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionReference, type ActionUserAction } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import { openTestHome } from "./fixtures/test-home.js";

/**
 * R7 (PG-029, PG-030, BL-374): `user_action` comes from the entry and nowhere else, and a handler finds its own action without naming
 * its provider. Each refusal test asserts that the target's handler did not run.
 */

const command = (capability_id: string): ActionDefinition => ({ capability_id, version: 1, operation: "command", action: {
  title: capability_id, description: "R7 fixture", kind: "operation", scope: "project", scheduling: "concurrent", audiences: ["user"], permissions: [], subject_kinds: [],
  input_schema: { type: "object" } } });
const OUTER = command("r7.outer"), TARGET = command("r7.target");
const person: ActionCallContext = { actor_id: "person", audience: "user", project_id: "p", permissions: [] };
const fromPage: ActionUserAction = { source: "web", conversation_ref: "web:p", message_ref: "web:request:1" };

/** One provider with the outer action and its target; the outer action calls the target with whatever `nested` makes of its caller. */
function fixture(nested: (caller: ActionExecutionContext) => ActionCallContext) {
  const service = new ActionService(), targetSaw: (ActionUserAction | undefined)[] = [], outerSaw: ActionExecutionContext[] = [];
  service.registerProvider({ provider: { provider_id: "owner", title: "Owner", kind: "system", project_id: "p" }, definitions: [OUTER, TARGET], handlers: [
    { ...OUTER, handle: async caller => { outerSaw.push(caller); return service.invoke(nested(caller), { ...TARGET, provider_id: "owner" }, {}); } },
    { ...TARGET, handle: async caller => { targetSaw.push(caller.user_action); return null; } }] });
  return { service, targetSaw, outerSaw, run: (caller: ActionCallContext) => service.invoke(caller, { ...OUTER, provider_id: "owner" }, {}) };
}

test("RAC-180 S-58 a call made inside a running handler that writes its own user_action is refused before its handler runs", async () => {
  const forged = fixture(caller => ({ ...caller, user_action: { ...fromPage, message_ref: "web:request:forged" } }));
  await assert.rejects(forged.run({ ...person, user_action: fromPage }), { code: "kernel.user_action_untrusted" });
  assert.deepEqual(forged.targetSaw, []);
  // A handler whose caller had none cannot give one either: no entry gave the person's operation to this call.
  const added = fixture(caller => ({ ...caller, user_action: fromPage }));
  await assert.rejects(added.run(person), { code: "kernel.user_action_untrusted" });
  assert.deepEqual(added.targetSaw, []);
  for (const extra of [{ untrusted: "forged" }, { untrusted: undefined }, { [Symbol("untrusted")]: true }]) {
    const extended = fixture(caller => ({ ...caller, user_action: { ...fromPage, ...extra } }));
    await assert.rejects(extended.run({ ...person, user_action: fromPage }), { code: "kernel.user_action_untrusted" });
    assert.deepEqual(extended.targetSaw, [], "unknown provenance fields must be refused before the target runs");
  }
});

test("RAC-180 S-58 a nested call carries the handler's own user_action, or none", async () => {
  const inherited = fixture(caller => ({ ...caller, user_action: caller.user_action ? { ...caller.user_action } : undefined }));
  await inherited.run({ ...person, user_action: fromPage });
  assert.deepEqual(inherited.targetSaw, [fromPage]);
  const explicit = { ...fromPage, whole_confirmation_prompted: undefined, prompted_subject_id: undefined };
  const filled = fixture(caller => ({ ...caller, user_action: { ...caller.user_action!, whole_confirmation_prompted: undefined, prompted_subject_id: undefined } }));
  await filled.run({ ...person, user_action: fromPage });
  assert.deepEqual(filled.targetSaw, [explicit]);
  const omitted = fixture(caller => ({ ...caller, user_action: { source: caller.user_action!.source,
    conversation_ref: caller.user_action!.conversation_ref, message_ref: caller.user_action!.message_ref } }));
  await omitted.run({ ...person, user_action: explicit });
  assert.deepEqual(omitted.targetSaw, [fromPage]);
  const dropped = fixture(({ user_action: _dropped, ...caller }) => caller);
  await dropped.run({ ...person, user_action: fromPage });
  assert.deepEqual(dropped.targetSaw, [undefined]);
});

test("RAC-180 S-58 work a handler left behind after it returned cannot write a user_action either", async () => {
  const service = new ActionService(), targetSaw: unknown[] = [];
  let later!: Promise<unknown>;
  const returned = Promise.withResolvers<void>();
  service.registerProvider({ provider: { provider_id: "owner", title: "Owner", kind: "system", project_id: "p" }, definitions: [OUTER, TARGET], handlers: [
    // A timer the handler sets runs after it returned, still as its work.
    { ...OUTER, handle: async () => { later = returned.promise.then(() => service.invoke({ ...person, user_action: fromPage }, { ...TARGET, provider_id: "owner" }, {})); return null; } },
    { ...TARGET, handle: async () => { targetSaw.push(true); return null; } }] });
  await service.invoke(person, { ...OUTER, provider_id: "owner" }, {});
  returned.resolve();
  await assert.rejects(later, { code: "kernel.user_action_untrusted" });
  assert.deepEqual(targetSaw, []);
  // The same call from an entry, outside every handler, is the entry's to make.
  await service.invoke({ ...person, user_action: fromPage }, { ...TARGET, provider_id: "owner" }, {});
  assert.deepEqual(targetSaw, [true]);
});

test("RAC-181 the dispatcher tells a handler its own action, with the provider it resolved, and the plugin cannot edit it", async () => {
  const run = fixture(caller => caller);
  await run.run(person);
  const own = run.outerSaw[0]!.current_action!;
  assert.deepEqual(own, { capability_id: OUTER.capability_id, version: 1, provider_id: "owner" });
  assert.equal(Object.isFrozen(own), true);
});

test("RAC-182 retainActionAuthority finds the running action's provider; another action without one is refused", async () => {
  const asked: ActionReference[] = [];
  const service = new ActionService();
  let retained!: ActionCallContext, refused: unknown;
  service.registerProvider({ provider: { provider_id: "owner", title: "Owner", kind: "system", project_id: "p" }, definitions: [OUTER], handlers: [
    { ...OUTER, handle: async caller => {
      retained = retainActionAuthority(caller, OUTER);
      try { retainActionAuthority(caller, TARGET); } catch (error) { refused = error; }
      await retained.validate_authority!({ ...OUTER, provider_id: "owner" });
      return null;
    } }] });
  await service.invoke({ ...person, validate_authority: reference => { asked.push({ capability_id: reference.capability_id, version: reference.version, provider_id: reference.provider_id }); } },
    { ...OUTER, provider_id: "owner" }, {});
  assert.equal((refused as { code?: string }).code, "actions.reference_invalid");
  assert.ok(asked.length > 0);
  for (const reference of asked) assert.deepEqual(reference, { capability_id: OUTER.capability_id, version: 1, provider_id: "owner" }, "every check names the exact running action");
});

test("RAC-182 a context without authority checks still rejects another action without a provider", () => {
  const caller = { ...person, current_action: { capability_id: OUTER.capability_id, version: 1, provider_id: "owner" } };
  assert.throws(() => retainActionAuthority(caller, TARGET), { code: "actions.reference_invalid" });
  assert.equal(retainActionAuthority(caller, OUTER), caller);
  assert.equal(retainActionAuthority(caller, { ...TARGET, provider_id: "owner" }), caller);
});

test("RAC-183 BL-374 a guard retained over the running action without its provider passes a grant per exact action (as an MCP client's is)", async () => {
  const service = new ActionService();
  let guard!: () => Promise<void>;
  service.registerProvider({ provider: { provider_id: "owner", title: "Owner", kind: "system", project_id: "p" }, definitions: [OUTER], handlers: [
    { ...OUTER, handle: async caller => { guard = caller.retainAuthority!([OUTER]); return null; } }] });
  // Like `assertMcpActionAuthority`: the grant names capability, version and provider, and a reference with no provider matches none.
  const exact = (reference?: ActionReference) => {
    if (reference && reference.provider_id !== "owner") throw Object.assign(new Error("revoked"), { code: "mcp.action_revoked" });
  };
  await service.invoke({ ...person, validate_authority: exact, assert_authority_current: exact }, { ...OUTER, provider_id: "owner" }, {});
  await guard();
});

/** A project plugin whose page route runs its own action, which records what the dispatcher told it and calls a target through the directory. */
function routeProbe() {
  const id = "io.molis.work.example.r7route", contexts: PluginStartContext[] = [], seen: (ActionUserAction | undefined)[] = [];
  const action: ActionDefinition<{ reference?: ActionReference }, unknown> = { capability_id: "r7route.run", version: 1, operation: "command", action: {
    title: "Record the person's operation", description: "R7 route probe", kind: "operation", scope: "project", scheduling: "concurrent",
    audiences: ["user"], permissions: ["storage:private"], subject_kinds: [],
    input_schema: { type: "object", properties: { reference: { type: "object" } }, additionalProperties: false } } };
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name: "r7route", kind: "app",
    publisher: { publisher_id: "example", signature: "r7-route" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: "storage:private", required: true, reason: "Run its own action" },
      { permission: "actions:delegate", required: true, reason: "Call a target as the person" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [action],
    routes: [{ route_id: "run", method: "POST", path: "/run", permission: "storage:private" }],
  }, async start(context) {
    contexts.push(context);
    return { kind: "app", actions: [{ ...action, async handle(caller, input) {
      seen.push(caller.user_action);
      return input.reference ? context.services!.actions!.directory!.invoke(input.reference, {}) : null;
    } }], routes: [bindPluginActionRoute(context, action, request => ({ reference: (request.body as { reference?: ActionReference }).reference }), "run")] };
  } };
  return { id, definition, seen };
}

test("RAC-184 S-58 a page route gives the plugin's own action user_action with source web, one message per request; a delegated target sees the same", async t => {
  const probe = routeProbe();
  const s = await openTestHome(t, { catalogPolicy: false, host: { pluginFixtures: { project: [probe.definition] } } });
  const project = await s.createProject("Trusted user action", []);
  const target = { ...command("r7.delegated"), action: { ...command("r7.delegated").action, audiences: ["user", "workflow"] as const } } as ActionDefinition;
  const targetSaw: (ActionUserAction | undefined)[] = [];
  t.after(s.host.actionRegistry(project.reference).registerProvider({ provider: { provider_id: "r7-targets", title: "R7 targets", kind: "system" },
    definitions: [target], handlers: [{ ...target, handle: async caller => { targetSaw.push(caller.user_action); return "done"; } }] }));
  const post = (body: unknown) => fetch(`${s.origin}/projects/${project.project_id}/api/plugins/${probe.id}/run`, { method: "POST",
    headers: { origin: s.origin, "content-type": "application/json", "x-molis-work-control-token": s.controlToken, "x-molis-work-idempotency-key": randomUUID() },
    body: JSON.stringify(body) });
  for (const body of [{}, {}]) { const response = await post(body); assert.equal(response.status, 200, await response.clone().text()); }
  assert.equal(probe.seen.length, 2);
  for (const given of probe.seen) {
    assert.equal(given?.source, "web");
    assert.equal(given?.conversation_ref, `web:${project.project_id}`);
    assert.match(given?.message_ref ?? "", /^web:[0-9a-f-]{36}$/u);
  }
  assert.notEqual(probe.seen[0]!.message_ref, probe.seen[1]!.message_ref, "each request is its own message");
  // The route ignores the body's provenance and runs the action with the protected entry's operation.
  const forged = await post({ user_action: { source: "management", conversation_ref: "x", message_ref: "y" } });
  assert.equal(forged.status, 200, await forged.clone().text());
  assert.equal(probe.seen.length, 3);
  assert.equal(probe.seen[2]?.source, "web");
  assert.equal(probe.seen[2]?.conversation_ref, `web:${project.project_id}`);
  assert.match(probe.seen[2]?.message_ref ?? "", /^web:[0-9a-f-]{36}$/u);
  const delegated = await post({ reference: { capability_id: target.capability_id, version: 1 } });
  assert.equal(delegated.status, 200, await delegated.clone().text());
  assert.deepEqual(targetSaw, [probe.seen[3]], "the delegated target is the same operation of the same person");
});
