import assert from "node:assert/strict";
import test from "node:test";
import { ActionService, currentCallId, markCallRecorded, newCallId, recordedCallId, shortCallId, withCallId, withCallIdSync } from "@molis-ai/molis-work-kernel";
import { ActionError, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";

type Effects = NonNullable<ConstructorParameters<typeof ActionService>[1]>;
type Settled = NonNullable<Effects["settled"]>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const provider = { provider_id: "fixture", title: "Fixture", kind: "system" as const };
const caller: ActionCallContext = { actor_id: "alice", project_id: "project-one", audience: "user", permissions: ["items:write"] };
const add: ActionDefinition<number, number> = { capability_id: "fixture.items.add", version: 1, operation: "command",
  action: { title: "Add item", description: "Adds an item", kind: "operation", scope: "project", audiences: ["user"], permissions: ["items:write"],
    subject_kinds: [], input_schema: { type: "integer" }, output_schema: { type: "integer" } } };
const variant = (capability_id: string, change: Partial<ActionDefinition<number, number>["action"]> = {}): ActionDefinition<number, number> =>
  ({ ...add, capability_id, action: { ...add.action, ...change } });

interface Row { call_id: string; actor_id: string; capability_id: string; provider_id?: string; operation: string; title: string; provider_title: string;
  ok: boolean; code?: string; refused?: true; path?: string }
/** What a host's `settled` hook is told, kept in order. */
function settlements() {
  const rows: Row[] = [];
  const settled: Settled = (context, action, outcome) => {
    rows.push({ call_id: context.call_id, actor_id: context.actor_id, capability_id: action.capability_id, provider_id: action.provider_id, operation: action.operation,
      title: action.title, provider_title: action.provider_title, ok: outcome.ok, ...(outcome.ok ? {} : { code: outcome.code, ...(outcome.refused ? { refused: outcome.refused } : {}) }),
      ...(action.path ? { path: action.path } : {}) });
  };
  return { rows, settled };
}

test("a handler sees the call id the host assigned, a call nested in it shares the id, and an explicit id is kept", async () => {
  const seen: Array<string | undefined> = [];
  const nested = variant("fixture.items.nested");
  const service = new ActionService();
  service.registerProvider({ provider, definitions: [add, nested], handlers: [
    { ...add, handle: (execution, input) => { seen.push(execution.call_id); return input; } },
    { ...nested, handle: async (execution, input) => { seen.push(execution.call_id); await service.invoke(execution, add, input); return input; } },
  ] });
  await service.invoke(caller, add, 1);
  await service.invoke(caller, nested, 2);
  await service.invoke({ ...caller, call_id: "call-from-the-host" }, add, 3);
  assert.match(seen[0]!, UUID);
  assert.match(seen[1]!, UUID);
  assert.notEqual(seen[0], seen[1], "two operations do not share an id");
  assert.equal(seen[2], seen[1], "a call made while handling one belongs to the same operation");
  assert.equal(seen[3], "call-from-the-host");
  assert.equal(caller.call_id, undefined, "the caller's own context is never changed");
});

test("every refusal before a handler runs is settled once, with the id, and marked as not executed", async () => {
  const { rows, settled } = settlements();
  const limited = variant("fixture.items.limited", { execution: { max_calls_per_minute: 1 } }), held = variant("fixture.items.held");
  let handled = 0;
  const service = new ActionService(undefined, { settled, admit: (_context, reference) => {
    if (reference.capability_id === held.capability_id) throw new ActionError("fixture.held", "held by the host's policy");
  } });
  service.registerProvider({ provider, definitions: [add, limited, held], handlers: [add, limited, held].map(definition => ({ ...definition, handle: (_context: unknown, input: unknown) => { handled++; return input; } })) });
  await service.invoke(caller, limited, 1);
  assert.deepEqual(rows.map(row => [row.capability_id, row.ok]), [[limited.capability_id, true]]);

  const refusals: Array<[string, () => Promise<unknown>]> = [
    ["actions.missing", () => service.invoke(caller, { capability_id: "fixture.items.nowhere", version: 1 }, 1)],
    ["actions.provider_changed", () => service.invoke(caller, { ...add, provider_id: "someone-else" }, 1)],
    ["actions.forbidden", () => service.invoke({ ...caller, permissions: [] }, add, 1)],
    ["actions.input_invalid", () => service.invoke(caller, add, "not an integer" as never)],
    ["actions.rate_limited", () => service.invoke(caller, limited, 2)],
    ["fixture.held", () => service.invoke(caller, held, 1)],
    ["actions.unauthenticated", () => service.invoke({ ...caller, actor_id: "" }, add, 1)],
  ];
  for (const [code, call] of refusals) {
    const before = rows.length;
    await assert.rejects(call(), { code });
    assert.equal(rows.length, before + 1, `${code} is settled exactly once`);
    const row = rows.at(-1)!;
    assert.match(row.call_id, UUID);
    assert.deepEqual([row.ok, row.code, row.refused], [false, code, true], `${code} never reached a handler`);
  }
  assert.equal(handled, 1, "only the first, allowed call ran a handler");
  assert.equal(new Set(rows.map(row => row.call_id)).size, rows.length, "each operation has its own id");
});

test("a handler that fails is settled once and is not a refusal, whichever way it fails", async () => {
  const { rows, settled } = settlements();
  const service = new ActionService(undefined, { settled });
  const asynchronous = variant("fixture.items.async"), throws = variant("fixture.items.throws"), synchronous = variant("fixture.items.sync");
  const lateAsync = variant("fixture.items.late-async"), lateSync = variant("fixture.items.late-sync");
  service.registerProvider({ provider, definitions: [asynchronous, throws, synchronous, lateAsync, lateSync], handlers: [
    { ...asynchronous, handle: async () => { throw new ActionError("fixture.async_failed", "rejected"); } },
    { ...throws, handle: () => { throw new ActionError("fixture.throw_failed", "thrown"); } },
    { ...synchronous, execution: "sync", handle: () => { throw new ActionError("fixture.sync_failed", "thrown while synchronous"); } },
    // These two have already done their work when the result turns out not to match the contract.
    { ...lateAsync, handle: async () => "not an integer" },
    { ...lateSync, execution: "sync", handle: () => "not an integer" },
  ] });
  await assert.rejects(service.invoke(caller, asynchronous, 1), { code: "fixture.async_failed" });
  await assert.rejects(service.invoke(caller, throws, 1), { code: "fixture.throw_failed" });
  await assert.rejects(service.invoke(caller, synchronous, 1), { code: "fixture.sync_failed" });
  assert.throws(() => service.invokeSync(caller, synchronous, 1), { code: "fixture.sync_failed" });
  await assert.rejects(service.invoke(caller, lateAsync, 1), { code: "actions.output_invalid_after_effect" });
  await assert.rejects(service.invoke(caller, lateSync, 1), { code: "actions.output_invalid_after_effect" });
  assert.throws(() => service.invokeSync(caller, lateSync, 1), { code: "actions.output_invalid_after_effect" });
  assert.deepEqual(rows.map(row => [row.code, row.refused]), [["fixture.async_failed", undefined], ["fixture.throw_failed", undefined],
    ["fixture.sync_failed", undefined], ["fixture.sync_failed", undefined], ["actions.output_invalid_after_effect", undefined],
    ["actions.output_invalid_after_effect", undefined], ["actions.output_invalid_after_effect", undefined]]);
});

test("a finished call is settled once with who, what and how it ended, and the caller's id", async () => {
  const { rows, settled } = settlements();
  const service = new ActionService(undefined, { settled });
  service.registerProvider({ provider, definitions: [add], handlers: [{ ...add, handle: (_context, input) => input }] });
  await service.invoke({ ...caller, call_id: "operation-1" }, add, 7);
  assert.deepEqual(rows, [{ call_id: "operation-1", actor_id: "alice", capability_id: add.capability_id, provider_id: "fixture", operation: "command",
    title: "Add item", provider_title: "Fixture", ok: true }]);
});

test("an id that exists only for another project is described by the caller's reference, never by the other project's definition", async () => {
  const { rows, settled } = settlements();
  const service = new ActionService(undefined, { settled });
  const secret = variant("fixture.items.secret", { title: "Title only project two may see" });
  service.registerProvider({ provider: { ...provider, provider_id: "elsewhere", title: "Provider of project two", project_id: "project-two" }, definitions: [secret],
    handlers: [{ ...secret, handle: (_context, input) => input }] });
  await assert.rejects(service.invoke(caller, secret, 1), { code: "actions.scope_mismatch" });
  await assert.rejects(service.invoke(caller, { capability_id: "fixture.items.never-registered", version: 1 }, 1), { code: "actions.missing" });
  assert.deepEqual(rows.map(row => [row.capability_id, row.operation, row.title, row.provider_title, row.refused]), [
    [secret.capability_id, "unknown", secret.capability_id, "", true],
    ["fixture.items.never-registered", "unknown", "fixture.items.never-registered", "", true],
  ]);
  assert.doesNotMatch(JSON.stringify(rows), /project two/u);
});

test("the settlement runs inside the call's scope, so the operation that opened the id sees that a row was kept", async () => {
  const service = new ActionService(undefined, { settled: () => markCallRecorded() });
  service.registerProvider({ provider, definitions: [add], handlers: [{ ...add, handle: (_context, input) => input }] });
  const request = newCallId();
  await withCallId(request, async () => {
    assert.equal(recordedCallId(), undefined, "nothing has been recorded yet");
    await service.invoke(caller, add, 1);
    assert.equal(recordedCallId(), request, "a call made in the request takes the request's id and marks it");
  });
  await withCallId(request, async () => {
    await service.invoke({ ...caller, call_id: newCallId() }, add, 1);
    assert.equal(recordedCallId(), undefined, "a call with an id of its own marks its own scope, not the request's");
  });
});

test("an operation's id ends with the operation: what a handler leaves behind sees no id, and its next call gets a new one", async () => {
  const seen: { outer?: string; timer?: string | null; probe?: string } = {};
  let release!: () => void;
  const done = new Promise<void>(resolve => { release = resolve; });
  const leave = variant("fixture.items.leave"), probe = variant("fixture.items.probe");
  const service = new ActionService();
  service.registerProvider({ provider, definitions: [leave, probe], handlers: [
    { ...leave, handle: (execution, input) => {
      seen.outer = execution.call_id;
      setTimeout(() => { seen.timer = currentCallId() ?? null; service.invoke(caller, probe, 1).then(release, release); }, 0);
      return input;
    } },
    { ...probe, handle: (execution, input) => { seen.probe = execution.call_id; return input; } },
  ] });
  await service.invoke(caller, leave, 1);
  await done;
  assert.match(seen.outer!, UUID);
  assert.equal(seen.timer, null, "the scope was closed by the time the timer fired");
  assert.match(seen.probe!, UUID);
  assert.notEqual(seen.probe, seen.outer);
});

test("a synchronous call is settled too; the asynchronous admit hook is not run for it, and its own entry check is settled when it refuses", () => {
  const { rows, settled } = settlements();
  let admitted = 0;
  const service = new ActionService(undefined, { settled, admit: () => { admitted++; } });
  const sync = variant("fixture.items.sync-add", { audiences: ["plugin"] });
  service.registerProvider({ provider, definitions: [sync], handlers: [{ ...sync, execution: "sync", handle: (_context, input) => input }] });
  const plugin: ActionCallContext = { ...caller, audience: "plugin" };
  assert.equal(service.invokeSync(plugin, sync, 4), 4);
  assert.equal(admitted, 0, "the host's hook is asynchronous and cannot run inside a transaction");
  assert.throws(() => service.invokeSync(plugin, sync, 5, () => { throw new ActionError("fixture.entry_refused", "the entry refuses"); }), { code: "fixture.entry_refused" });
  assert.throws(() => service.invokeSync({ ...plugin, validate_authority: async () => undefined }, sync, 6), { code: "actions.async_required" });
  assert.throws(() => service.invokeSync(plugin, sync, "x" as never), { code: "actions.input_invalid" });
  assert.deepEqual(rows.map(row => [row.capability_id, row.ok, row.code, row.refused]), [[sync.capability_id, true, undefined, undefined],
    [sync.capability_id, false, "fixture.entry_refused", true], [sync.capability_id, false, "actions.async_required", true], [sync.capability_id, false, "actions.input_invalid", true]]);
  assert.equal(new Set(rows.map(row => row.call_id)).size, rows.length);
});

test("a settlement hook that throws never changes the call", async () => {
  const service = new ActionService(undefined, { settled: () => { throw new Error("the record could not be written"); } });
  service.registerProvider({ provider, definitions: [add], handlers: [{ ...add, handle: (_context, input) => input }] });
  assert.equal(await service.invoke(caller, add, 3), 3);
  await assert.rejects(service.invoke(caller, add, "x" as never), { code: "actions.input_invalid" });
});

test("a call scope is reused for its own id, nested for another, and closed when its operation ends", async () => {
  assert.equal(currentCallId(), undefined);
  const first = newCallId(), second = newCallId();
  assert.match(first, UUID);
  assert.notEqual(first, second);
  assert.equal(shortCallId(first), first.slice(0, 8));
  const result = await withCallId(first, async () => {
    assert.equal(currentCallId(), first);
    assert.equal(recordedCallId(), undefined);
    await withCallId(first, async () => { markCallRecorded(); });
    assert.equal(recordedCallId(), first, "the same id is one scope, so the outer sees what the inner recorded");
    await withCallId(second, async () => {
      assert.equal(currentCallId(), second);
      assert.equal(recordedCallId(), undefined, "another id is its own scope");
      markCallRecorded();
      assert.equal(recordedCallId(), second);
    });
    assert.equal(currentCallId(), first);
    return withCallIdSync(second, () => currentCallId());
  });
  assert.equal(result, second);
  assert.equal(currentCallId(), undefined, "nothing outlives the operation");
  assert.equal(recordedCallId(), undefined);
  markCallRecorded();
  assert.equal(recordedCallId(), undefined, "outside an operation there is nothing to mark");
  await assert.rejects(withCallId(first, async () => { throw new Error("boom"); }), /boom/u);
  assert.equal(currentCallId(), undefined, "a failed operation ends too");
});
