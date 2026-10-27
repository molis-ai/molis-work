import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ActionError, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding,
  type ActionProvider, type ActionReference, type RetainedActionAuthority } from "@molis-ai/molis-work-contracts/platform/actions";

const caller: ActionCallContext = { actor_id: "owner", audience: "user", project_id: "a", permissions: [] };
const provider: ActionProvider = { provider_id: "source", title: "Source", kind: "system", project_id: "a" };
function action(id: string, operation: "query" | "command", timeout?: number): ActionDefinition {
  return { capability_id: `fixture.${id}`, version: 1, operation, action: { title: id, description: id,
    kind: operation === "query" ? "query" : "operation", scope: "home", audiences: ["user"], permissions: [], subject_kinds: [],
    input_schema: { type: "object" }, output_schema: { type: "null" },
    execution: { cost: "none", ...(timeout === undefined ? {} : { timeout_ms: timeout }) } } };
}
const read = action("read", "query"), write = action("write", "command"), inspect = action("capture", "query");
function publish(service: ActionService, owner: ActionProvider, definition: ActionDefinition, handle: ActionHandlerBinding["handle"], sync = true) {
  return service.registerProvider({ provider: owner, definitions: [definition],
    handlers: [{ ...definition, ...(sync ? { execution: "sync" as const } : {}), handle }] });
}
async function capture(t: TestContext, service: ActionService, references: readonly ActionReference[] = [read], context = caller, unchanged = true): Promise<RetainedActionAuthority> {
  const entered = Promise.withResolvers<RetainedActionAuthority>(), release = Promise.withResolvers<void>();
  const definition = { ...inspect, capability_id: `${inspect.capability_id}_${randomUUID().replaceAll("-", "_")}` };
  const dispose = publish(service, { provider_id: "inspector", title: "Inspector", kind: "system" }, definition, async execution => {
    entered.resolve(execution.retainAuthority!(references, unchanged ? { providerCommands: "unchanged" } : undefined));
    await release.promise; return null;
  }, false);
  const settled = service.invoke(context, definition, {}).catch(error => { entered.reject(error); });
  t.after(async () => { release.resolve(); await settled; dispose(); });
  return entered.promise;
}
const conflict = { code: "actions.conflict" };

test("MEM-BIND-FENCE-03/04: split registrations share actual sync command starts; queries and pre-handler refusals leave capture valid", async t => {
  const service = new ActionService(); let fail = false, starts = 0;
  const readers = publish(service, provider, read, () => null);
  const writers = publish(service, provider, write, () => { starts++; if (fail) throw new Error("write failed"); return null; });
  try {
    const first = await capture(t, service), ordinary = await capture(t, service, [read], caller, false);
    service.invokeSync(caller, read, {}); first.assertCurrent();
    assert.throws(() => service.invokeSync(caller, write, null), { code: "actions.input_invalid" });
    first.assertCurrent(); assert.equal(starts, 0);
    service.invokeSync(caller, write, {});
    assert.throws(() => first.assertCurrent(), conflict); await assert.rejects(first(), conflict);
    ordinary.assertCurrent(); await ordinary();
    const second = await capture(t, service); fail = true;
    assert.throws(() => service.invokeSync(caller, write, {}), /write failed/u);
    assert.throws(() => second.assertCurrent(), conflict);
    (await capture(t, service)).assertCurrent(); assert.equal(starts, 2);
  } finally { writers(); readers(); }
});

for (const failed of [false, true]) test(`MEM-BIND-FENCE-02: async ${failed ? "failure" : "success"} stays active to raw completion and never revives an old capture`, async t => {
  const service = new ActionService(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let writes = 0;
  const readers = publish(service, provider, read, () => null);
  const writers = publish(service, provider, write, async () => { writes++; entered.resolve(); await release.promise; if (failed) throw new Error("after write"); return null; }, false);
  try {
    const before = await capture(t, service), ordinary = await capture(t, service, [read], caller, false);
    const running = service.invoke(caller, write, {}), completed = failed ? assert.rejects(running, /after write/u) : running;
    await entered.promise;
    assert.equal(writes, 1); assert.throws(() => before.assertCurrent(), conflict);
    await assert.rejects(capture(t, service), conflict); ordinary.assertCurrent(); await ordinary();
    release.resolve(); await completed;
    assert.throws(() => before.assertCurrent(), conflict); (await capture(t, service)).assertCurrent();
  } finally { release.resolve(); writers(); readers(); }
});

for (const mode of ["cancel", "timeout", "invalid-sync"] as const) test(`MEM-BIND-FENCE-02/03: ${mode} ends only the caller's wait; disposal and re-registration cannot hide a still-running handler`, async t => {
  if (mode === "timeout") t.mock.timers.enable({ apis: ["setTimeout"] });
  const service = new ActionService(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), rawDone = Promise.withResolvers<void>();
  const controller = new AbortController(), command = action("late", "command", mode === "timeout" ? 10 : 1000);
  let readers = publish(service, provider, read, () => null);
  let writers = publish(service, provider, command, async () => { entered.resolve(); try { await release.promise; return null; } finally { rawDone.resolve(); } }, mode === "invalid-sync");
  try {
    const old = await capture(t, service);
    if (mode === "invalid-sync") assert.throws(() => service.invokeSync(caller, command, {}), { code: "actions.async_required" });
    else {
      const rejected = assert.rejects(service.invoke({ ...caller, signal: controller.signal }, command, {}),
        mode === "cancel" ? { name: "AbortError" } : { code: "actions.timeout" });
      await entered.promise;
      if (mode === "cancel") controller.abort();
      else t.mock.timers.tick(10);
      await rejected;
    }
    await entered.promise;
    await assert.rejects(capture(t, service), conflict);
    writers(); readers();
    readers = publish(service, provider, read, () => null);
    writers = publish(service, provider, command, () => null);
    assert.throws(() => old.assertCurrent(), { code: "actions.provider_changed" });
    await assert.rejects(capture(t, service), conflict, "the new registration shares the old raw handler's activity");
    release.resolve(); await rawDone.promise;
    // The public rejected call no longer waits for the raw handler; let its attached completion observer run.
    await new Promise<void>(resolve => setImmediate(resolve));
    (await capture(t, service)).assertCurrent();
    writers(); readers();
    readers = publish(service, provider, read, () => null);
    writers = publish(service, provider, command, () => null);
    (await capture(t, service)).assertCurrent();
  } finally { release.resolve(); writers(); readers(); }
});

for (const firstDone of ["parent", "child"] as const) test(`MEM-BIND-FENCE-03: nested commands sharing call_id stay independent when ${firstDone} finishes first`, async t => {
  const service = new ActionService(), childEntered = Promise.withResolvers<void>(), parentRelease = Promise.withResolvers<void>(), childRelease = Promise.withResolvers<void>();
  const child = action("child", "command"); let childRun!: Promise<unknown>; const ids: string[] = [];
  const readers = publish(service, provider, read, () => null);
  const children = publish(service, provider, child, async context => { ids.push(context.call_id!); childEntered.resolve(); await childRelease.promise; return null; }, false);
  const parents = publish(service, provider, write, async context => {
    ids.push(context.call_id!); childRun = service.invoke(context, child, {}); await childEntered.promise; await parentRelease.promise; return null;
  }, false);
  try {
    const old = await capture(t, service), parent = service.invoke(caller, write, {});
    await childEntered.promise;
    assert.equal(ids.length, 2); assert.equal(ids[0], ids[1]);
    await assert.rejects(capture(t, service), conflict);
    if (firstDone === "parent") { parentRelease.resolve(); await parent; }
    else { childRelease.resolve(); await childRun; }
    await assert.rejects(capture(t, service), conflict, "the other real handler remains active");
    parentRelease.resolve(); childRelease.resolve(); await parent; await childRun;
    assert.throws(() => old.assertCurrent(), conflict); (await capture(t, service)).assertCurrent();
  } finally { parentRelease.resolve(); childRelease.resolve(); parents(); children(); readers(); }
});

test("MEM-BIND-FENCE-03: trusted Home provider activity crosses caller projects; project providers and other provider ids stay isolated", async t => {
  const service = new ActionService(), b = { ...caller, project_id: "b" }, homeRead = action("home_read", "query"), homeWrite = action("home_write", "command");
  const home = { provider_id: "home", title: "Home", kind: "system" as const };
  const disposers = [publish(service, provider, read, () => null), publish(service, provider, write, () => null),
    publish(service, { ...provider, project_id: "b" }, read, () => null), publish(service, { ...provider, project_id: "b" }, write, () => null),
    publish(service, home, homeRead, () => null), publish(service, home, homeWrite, () => null)];
  try {
    const aGuard = await capture(t, service), bGuard = await capture(t, service, [read], b), homeGuard = await capture(t, service, [homeRead]);
    service.invokeSync(b, write, {}); aGuard.assertCurrent(); homeGuard.assertCurrent(); assert.throws(() => bGuard.assertCurrent(), conflict);
    service.invokeSync(b, homeWrite, {}); aGuard.assertCurrent(); assert.throws(() => homeGuard.assertCurrent(), conflict);
    await assert.rejects(capture(t, service, [{ ...read, provider_id: "forged" }]), { code: "actions.forbidden" });
  } finally { for (const dispose of disposers) dispose(); }
});

for (const callback of ["authority", "availability"] as const) test(`MEM-BIND-FENCE-03: a later source's ${callback} callback cannot change an earlier source after its final check`, async t => {
  const service = new ActionService(), later = action("later", "query"); let armed = false;
  const interleave = () => { if (armed) { armed = false; service.invokeSync(caller, write, {}); } };
  const readers = publish(service, provider, read, () => null), writers = publish(service, provider, write, () => null);
  const others = service.registerProvider({ provider: { ...provider, provider_id: "other" }, definitions: [later],
    handlers: [{ ...later, execution: "sync", handle: () => null, availability: () => { if (callback === "availability") interleave(); return { available: true }; } }] });
  const context = { ...caller, assert_authority_current: (reference?: ActionReference) => {
    if (callback === "authority" && reference?.capability_id === later.capability_id) interleave();
  } };
  try {
    const guard = await capture(t, service, [read, later], context); armed = true;
    assert.throws(() => guard.assertCurrent(), conflict); assert.equal(armed, false);
    assert.throws(() => guard.assertCurrent(), conflict);
  } finally { others(); writers(); readers(); }
});

test("MEM-BIND-FENCE-04: an unchanged provider does not waive revocation, availability, registration or cancellation", async t => {
  const service = new ActionService(); let available = true, authorized = true;
  const register = () => service.registerProvider({ provider, definitions: [read], handlers: [{ ...read, execution: "sync", handle: () => null,
    availability: () => available ? { available: true } : { available: false, code: "actions.unavailable", reason: "Stopped" } }] });
  let dispose = register(); const controller = new AbortController();
  const context = { ...caller, signal: controller.signal, assert_authority_current: () => { if (!authorized) throw new ActionError("actions.revoked", "Revoked"); } };
  try {
    const guard = await capture(t, service, [read], context); authorized = false;
    assert.throws(() => guard.assertCurrent(), { code: "actions.revoked" }); await assert.rejects(guard(), { code: "actions.revoked" });
    authorized = true; available = false; assert.throws(() => guard.assertCurrent(), { code: "actions.unavailable" });
    available = true; guard.assertCurrent(); controller.abort(); assert.throws(() => guard.assertCurrent(), { name: "AbortError" });
    const replaced = await capture(t, service); dispose(); dispose = register(); assert.throws(() => replaced.assertCurrent(), { code: "actions.provider_changed" });
  } finally { dispose(); }
});

for (const change of ["cancel", "timeout", "replace-origin", "replace-earlier-source"] as const) test(`MEM-BIND-FENCE-04: final availability ${change} is refused after every external callback`, async t => {
  if (change === "timeout") t.mock.timers.enable({ apis: ["setTimeout"] });
  const service = new ActionService(), controller = new AbortController(), release = Promise.withResolvers<void>(), ready = Promise.withResolvers<RetainedActionAuthority>();
  const origin = action("origin", "query", change === "timeout" ? 10 : 1000), later = action("last_source", "query"); let armed = false;
  const originProvider = { provider_id: "origin", title: "Origin", kind: "system" as const };
  let readers = publish(service, provider, read, () => null), origins: () => void;
  const last = service.registerProvider({ provider: { ...provider, provider_id: "other" }, definitions: [later],
    handlers: [{ ...later, execution: "sync", handle: () => null, availability: () => {
      if (armed) {
        armed = false;
        if (change === "cancel") controller.abort();
        else if (change === "timeout") t.mock.timers.tick(10);
        else if (change === "replace-origin") { origins(); origins = publish(service, originProvider, origin, () => null); }
        else { readers(); readers = publish(service, provider, read, () => null); }
      }
      return { available: true };
    } }] });
  origins = publish(service, originProvider, origin, async context => {
    ready.resolve(context.retainAuthority!([read, later], { providerCommands: "unchanged" })); await release.promise; return null;
  }, false);
  const done = service.invoke({ ...caller, signal: controller.signal }, origin, {}).catch(error => error);
  try {
    const guard = await ready.promise; armed = true;
    assert.throws(() => guard.assertCurrent(), change === "cancel" ? { name: "AbortError" }
      : { code: change === "timeout" ? "actions.timeout" : "actions.provider_changed" });
    assert.equal(armed, false);
    if (change === "timeout") assert.equal(controller.signal.aborted, false, "the originating execution lifetime is distinct from the entry signal");
  } finally { release.resolve(); await done; origins(); readers(); last(); }
});

test("MEM-BIND-FENCE-04: opt-in ends with its origin handler while default retained authority keeps its existing lifetime", async () => {
  const service = new ActionService(); let strict!: RetainedActionAuthority, ordinary!: RetainedActionAuthority;
  const readers = publish(service, provider, read, () => null);
  const origin = publish(service, { provider_id: "origin", title: "Origin", kind: "system" }, inspect, context => {
    strict = context.retainAuthority!([read], { providerCommands: "unchanged" }); ordinary = context.retainAuthority!([read]); return null;
  });
  try {
    service.invokeSync(caller, inspect, {});
    assert.throws(() => strict.assertCurrent(), { code: "actions.expired" }); ordinary.assertCurrent(); await ordinary();
  } finally { origin(); readers(); }
});
