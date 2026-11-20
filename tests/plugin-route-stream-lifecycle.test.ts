import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
// RAC-24: finished, failed and cancelled dispatches release their instance watcher.
import assert from "node:assert/strict";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PluginRouteRouter, PluginRuntime, PluginSupervisor, type InstanceWatchTimers } from "@molis-ai/molis-work-plugin-runtime";
import { deferred } from "./fixtures/home-runtime.js";
import { streamProbe } from "./fixtures/plugin-stream.js";
import { PENDING, within } from "./fixtures/stopped-calls.js";

test("W5-01-STREAM-05 repeated success, throw, cancellation and stop release every instance watcher", async () => {
  const probe = streamProbe(), runtime = new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS }), supervisor = new PluginSupervisor(runtime);
  // This test exercises the Runtime router alone; it needs no Host action registry or business storage binding.
  const definition = { ...probe.definition, manifest: { ...probe.definition.manifest, actions: [],
    routes: probe.definition.manifest.routes!.filter(route => route.route_id === "direct") },
    start: async () => ({ kind: "app" as const, routes: [{ route_id: "direct", handle: (request: PluginRouteRequest) => probe.behavior.route(request) }] }) };
  const started = await supervisor.start([{ definition }]);
  assert.deepEqual(started.running, [probe.id], JSON.stringify(started.failed));
  const pending = new Map<number, () => void>(); let sequence = 0;
  const timers: InstanceWatchTimers = {
    setInterval(run, ms) { assert.equal(ms, 100); const id = ++sequence; pending.set(id, run); return id; },
    clearInterval(id) { assert.equal(typeof id, "number"); assert.equal(pending.delete(id as number), true); },
  };
  const router = new PluginRouteRouter(supervisor, [definition.manifest], { timers });
  for (let round = 0; round < 3; round++) for (const outcome of ["success", "throw", "cancel", "stop"] as const) {
    const entered = deferred(), release = deferred(), finished = deferred(), abort = new AbortController();
    let captured: PluginRouteRequest | undefined, stopped = 0, effects = 0;
    probe.behavior.route = async request => {
      captured = request; entered.resolve();
      try { await release.promise; if (outcome === "throw") throw new Error("handler failed"); await request.execution!.beforeEffect(); effects++; return { status: 200, body: "done" }; }
      finally { finished.resolve(); }
    };
    const result = router.dispatch({ method: "POST", pathname: `/api/plugins/${probe.id}/direct`, actor_id: "person",
      execution: { signal: abort.signal, beforeEffect: async () => { abort.signal.throwIfAborted(); } }, emit: () => {},
      stopped: () => { stopped++; abort.abort(new ActionError("actions.cancelled", "stopped")); } });
    const expected = outcome === "throw" ? assert.rejects(result, /handler failed/) : result;
    await entered.promise; assert.equal(pending.size, 1);
    for (const tick of pending.values()) tick();
    assert.equal(pending.size, 1, "an active instance keeps its watch");
    if (outcome === "cancel") abort.abort(new ActionError("actions.cancelled", "cancelled"));
    else if (outcome === "stop") {
      await runtime.stop(supervisor.state(probe.id)!.install_id!);
      for (const tick of [...pending.values()]) tick();
      assert.equal(stopped, 1);
    } else release.resolve();
    const answer = await expected;
    if (outcome === "success") assert.deepEqual(answer, { status: 200, body: "done" });
    if (outcome === "cancel" || outcome === "stop") {
      assert.deepEqual(answer, { status: 499, body: { error: outcome === "cancel" ? "cancelled" : "stopped", code: "actions.cancelled" } });
      await assert.rejects(captured!.execution!.beforeEffect(), { code: "actions.cancelled" });
      assert.throws(() => captured!.emit!({ stage: "late", progress: 1 }), { code: "actions.cancelled" });
    }
    assert.equal(pending.size, 0, `${outcome} released the timer before a late handler returns`);
    release.resolve(); await finished.promise;
    assert.equal(effects, outcome === "success" ? 1 : 0, `${outcome} cannot apply a late effect`);
    if (outcome === "stop") await supervisor.restart(probe.id);
  }
});

// BL-964: the router and the withdrawal of an activation's routes ask one test for a streamed route (the Manifest's POST "ndjson").
// When the activation's contribution is withdrawn, a plain request still waiting is answered 403 at once, while a stream in progress
// is not cut short by that 403: the router's instance watch cancels it, and its late tail applies no effect.
test("W5-01-STREAM-06 withdrawing a contribution answers a waiting plain request 403 at once and cancels a stream in progress", async () => {
  const probe = streamProbe(), runtime = new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS }), supervisor = new PluginSupervisor(runtime);
  const plainEntered = deferred(), streamEntered = deferred(), release = deferred();
  let streamEffects = 0;
  const plain = async () => { plainEntered.resolve(); await release.promise; return { status: 200, body: "done" }; };
  const streamed = async (request: PluginRouteRequest) => {
    streamEntered.resolve(); await release.promise;
    await request.execution!.beforeEffect(); streamEffects++;
    return { status: 200, body: "done" };
  };
  const definition = { ...probe.definition, manifest: { ...probe.definition.manifest, actions: [],
    routes: probe.definition.manifest.routes!.filter(route => route.route_id === "json" || route.route_id === "direct") },
    start: async () => ({ kind: "app" as const, routes: [{ route_id: "json", handle: plain }, { route_id: "direct", handle: streamed }] }) };
  assert.deepEqual(definition.manifest.routes.map(route => [route.route_id, route.method, route.stream ?? null]), [["json", "POST", null], ["direct", "POST", "ndjson"]]);
  const started = await supervisor.start([{ definition }]);
  assert.deepEqual(started.running, [probe.id], JSON.stringify(started.failed));
  const ticks = new Map<number, () => void>(); let sequence = 0;
  const timers: InstanceWatchTimers = {
    setInterval(run) { const id = ++sequence; ticks.set(id, run); return id; },
    clearInterval(id) { ticks.delete(id as number); },
  };
  const router = new PluginRouteRouter(supervisor, [definition.manifest], { timers });
  const call = (route: string) => {
    const abort = new AbortController();
    let stopped = 0;
    const answer = router.dispatch({ method: "POST", pathname: `/api/plugins/${probe.id}/${route}`, actor_id: "person",
      execution: { signal: abort.signal, beforeEffect: async () => { abort.signal.throwIfAborted(); } }, emit: () => {},
      stopped: () => { stopped++; abort.abort(new ActionError("actions.cancelled", "stopped")); } });
    return { answer, stopped: () => stopped };
  };
  const plainCall = call("json"), streamCall = call("direct");
  await Promise.all([plainEntered.promise, streamEntered.promise]);
  assert.equal(ticks.size, 1, "only the stream is watched");

  await runtime.stop(supervisor.state(probe.id)!.install_id!);
  const refused = await within(plainCall.answer);
  assert.ok(refused !== PENDING && "value" in (refused as object), "the plain request is answered while its handler still waits");
  assert.deepEqual((refused as { value: unknown }).value, { status: 403, body: { error: "此插件实例已停止，请重新打开", code: "actions.forbidden" } });
  assert.equal(await within(streamCall.answer), PENDING, "the withdrawal does not answer the stream with 403");

  for (const tick of [...ticks.values()]) tick();
  assert.equal(streamCall.stopped(), 1, "the router's watch tells the stream its instance stopped");
  assert.deepEqual(await streamCall.answer, { status: 499, body: { error: "stopped", code: "actions.cancelled" } });
  assert.equal(ticks.size, 0, "the cancelled stream let go of its watch");
  release.resolve();
  await new Promise(resolve => { setImmediate(resolve); });
  assert.equal(streamEffects, 0, "the cancelled stream's late tail applies no effect");
  assert.equal(plainCall.stopped(), 0, "a plain request is not watched");
});
