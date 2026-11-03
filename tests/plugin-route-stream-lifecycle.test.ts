import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
// RAC-24: finished, failed and cancelled dispatches release their instance watcher.
import assert from "node:assert/strict";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PluginRouteRouter, PluginRuntime, PluginSupervisor, type InstanceWatchTimers } from "@molis-ai/molis-work-plugin-runtime";
import { deferred } from "./fixtures/home-runtime.js";
import { streamProbe } from "./fixtures/plugin-stream.js";

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
    let captured: PluginRouteRequest | undefined, stopped = 0;
    probe.behavior.route = async request => {
      captured = request; entered.resolve();
      try { await release.promise; if (outcome === "throw") throw new Error("handler failed"); return { status: 200, body: "done" }; }
      finally { finished.resolve(); }
    };
    const result = router.dispatch({ method: "POST", pathname: `/api/plugins/${probe.id}/direct`, actor_id: "person",
      execution: { signal: abort.signal, beforeEffect: async () => { abort.signal.throwIfAborted(); } }, emit: () => {},
      stopped: () => { stopped++; abort.abort(new ActionError("actions.cancelled", "stopped")); } });
    const expected = outcome === "success" ? result : assert.rejects(result, outcome === "throw" ? /handler failed/ : { code: "actions.cancelled" });
    await entered.promise; assert.equal(pending.size, 1);
    for (const tick of pending.values()) tick();
    assert.equal(pending.size, 1, "an active instance keeps its watch");
    if (outcome === "cancel") abort.abort(new ActionError("actions.cancelled", "cancelled"));
    else if (outcome === "stop") {
      await runtime.stop(supervisor.state(probe.id)!.install_id!);
      for (const tick of [...pending.values()]) tick();
      assert.equal(stopped, 1);
      assert.throws(() => captured!.emit!({ stage: "late", progress: 1 }), { code: "actions.cancelled" });
    } else release.resolve();
    const answer = await expected;
    if (outcome === "success") assert.deepEqual(answer, { status: 200, body: "done" });
    assert.equal(pending.size, 0, `${outcome} released the timer before a late handler returns`);
    release.resolve(); await finished.promise;
    if (outcome === "stop") await supervisor.restart(probe.id);
  }
});
