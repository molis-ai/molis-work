import assert from "node:assert/strict";
import test from "node:test";
import type { PluginDefinition, PluginRouteBinding, PluginRouteRequest, PluginRouteResponse } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-plugin-sdk";
import { PluginRuntime, inertAfterStop, type StoppedServiceCall } from "@molis-ai/molis-work-plugin-runtime";
import { PENDING, within } from "./fixtures/stopped-calls.js";

// BL-403: a route an activation offers is a call of its own, as an action is; when the activation is withdrawn the Runtime answers
// the request with 403 and ends the call, so what the handler calls afterwards does nothing (BL-411). BL-404: a route's coded
// failure is answered by its kind there and then, so a hand-written route needs no catch of its own.

const PLUGIN_ID = "io.molis.work.example.route-calls";

interface Probe {
  ping(): string | undefined;
}

/** One activation of the plugin below: a service that refuses once `end` says the activation is over, wrapped as the Host wraps its services. */
interface Activation {
  readonly probe: Probe;
  end(): void;
}

async function routesPlugin(declared: readonly string[], routes: (activation: Activation) => PluginRouteBinding[]) {
  const activations: Activation[] = [], noted: StoppedServiceCall[] = [], ends = new WeakMap<object, () => void>();
  const definition: PluginDefinition = {
    manifest: { schema_version: 2, host_api_version: 2, plugin_id: PLUGIN_ID, version: "1.0.0", name: "Route calls", kind: "app",
      publisher: { publisher_id: "example", signature: "example-route-calls" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
      routes: declared.map(route_id => ({ route_id, method: "POST" as const, path: `/${route_id}` })) },
    async start(context) {
      let over = false;
      const probe = inertAfterStop<Probe>({ ping() { if (over) throw new ActionError("actions.forbidden", "这个插件实例已停止"); return "pong"; } },
        () => over, call => { noted.push(call); });
      const activation: Activation = { probe, end: () => { over = true; } };
      activations.push(activation); ends.set(context, activation.end);
      return { kind: "app", routes: routes(activation) };
    },
    async stop(context) { ends.get(context)?.(); },
  };
  const runtime = new PluginRuntime(), { install } = runtime.install({ trust: { level: "unsigned" }, definition, deployment: "local", grants: [] });
  await runtime.start(install.install_id);
  const route = (route_id: string): PluginRouteBinding => {
    const offered = runtime.contribution(install.install_id);
    const binding = offered?.kind === "app" ? offered.routes?.find(candidate => candidate.route_id === route_id) : undefined;
    assert.ok(binding, `the running activation offers ${route_id}`);
    return binding;
  };
  return { runtime, installId: install.install_id, activations, noted, route };
}

const request = (route_id: string): PluginRouteRequest =>
  ({ method: "POST", pathname: `/api/plugins/${PLUGIN_ID}/${route_id}`, params: {}, query: {}, body: {}, actor_id: "owner" });

/** The answer a promise came to within a moment; fails when it is still waiting or failed. */
async function answered(promise: Promise<PluginRouteResponse>): Promise<PluginRouteResponse & { body: { code?: string } }> {
  const outcome = await within(promise);
  assert.notEqual(outcome, PENDING, "the request is answered, not left waiting");
  assert.ok(outcome && typeof outcome === "object" && "value" in outcome, "the request is answered, not failed");
  return outcome.value as PluginRouteResponse & { body: { code?: string } };
}

test("BL403-01 a hand-written route that waits is answered 403 once its activation stops, and what it calls afterwards does nothing", async () => {
  const entered = Promise.withResolvers<void>(), gate = Promise.withResolvers<void>(), later: unknown[] = [], failures: unknown[] = [];
  const heard = (error: unknown) => { failures.push(error); };
  process.on("unhandledRejection", heard); process.on("uncaughtException", heard);
  try {
    const plugin = await routesPlugin(["slow"], ({ probe }) => [{ route_id: "slow", async handle() {
      entered.resolve(); await gate.promise;
      later.push(probe.ping());
      return { status: 200, body: { done: true } };
    } }]);
    const pending = plugin.route("slow").handle(request("slow"));
    await entered.promise;
    await plugin.runtime.stop(plugin.installId);
    const answer = await answered(Promise.resolve(pending));
    assert.equal(answer.status, 403);
    assert.equal(answer.body.code, "actions.forbidden");
    gate.resolve();
    await new Promise(resolve => { setImmediate(resolve); });
    assert.deepEqual(later, [undefined], "the refused call made after the stop throws nothing");
    assert.deepEqual(plugin.noted, [{ service: "ping", method: "ping" }]);
    assert.deepEqual(failures, [], "nothing reaches the top of the process");
  } finally { process.off("unhandledRejection", heard); process.off("uncaughtException", heard); }
});

test("BL403-02 a route kept from a stopped, crashed or replaced activation is refused with 403 before its handler runs", async () => {
  let calls = 0;
  const plugin = await routesPlugin(["count"], () => [{ route_id: "count", handle() { calls += 1; return { status: 200, body: { calls } }; } }]);
  const first = plugin.route("count");
  assert.deepEqual(await first.handle(request("count")), { status: 200, body: { calls: 1 } });
  await plugin.runtime.stop(plugin.installId);
  const stopped = await answered(Promise.resolve(first.handle(request("count"))));
  assert.equal(stopped.status, 403);
  assert.equal(stopped.body.code, "actions.forbidden");
  await plugin.runtime.start(plugin.installId);
  const second = plugin.route("count");
  assert.notEqual(second, first);
  assert.equal((await first.handle(request("count"))).status, 403, "a new activation does not bring the old one's route back");
  assert.deepEqual(await second.handle(request("count")), { status: 200, body: { calls: 2 } });
  await plugin.runtime.reportCrash(plugin.installId);
  assert.equal((await second.handle(request("count"))).status, 403);
  assert.equal(calls, 2, "no refused request reached the handler");
});

test("BL403-03 inside an open route a refusal reaches the handler; after the route ended, outside every call, it does nothing", async () => {
  const fired = Promise.withResolvers<unknown>();
  const plugin = await routesPlugin(["ping", "later"], ({ probe }) => [
    { route_id: "ping", handle() { return { status: 200, body: { answer: probe.ping() } }; } },
    { route_id: "later", handle() { setTimeout(() => { fired.resolve(probe.ping()); }, 0); return { status: 200, body: {} }; } },
  ]);
  const activation = plugin.activations[0]!;
  assert.deepEqual(await plugin.route("ping").handle(request("ping")), { status: 200, body: { answer: "pong" } });
  // The activation's stop hook has returned while its routes are still offered: the moment a crash's stop leaves before the
  // Runtime withdraws them. A request then is a call still under way, and its caller hears the refusal.
  activation.end();
  const refused = await plugin.route("ping").handle(request("ping"));
  assert.equal(refused.status, 403);
  assert.equal((refused.body as { code: string }).code, "actions.forbidden");
  assert.deepEqual(plugin.noted, [], "a refusal the route's caller hears is not swallowed");
  assert.equal(activation.probe.ping(), undefined, "outside every call the refusal throws nothing");
  assert.equal((await plugin.route("later").handle(request("later"))).status, 200);
  assert.equal(await fired.promise, undefined, "a timer the route left runs after the route ended, outside every call");
  assert.equal(plugin.noted.length, 2);
});

const exampleErrors = defineErrorCodes("example", { gone: "not_found" });

test("BL404-01 a route's coded failure is answered by its kind, with its code and details, whichever class raised it", async () => {
  const plugin = await routesPlugin(["foreign", "declared"], () => [
    // A failure of a bundle that holds its own copy of the error class: read by its shape, as the Host's other exits read it.
    { route_id: "foreign", handle() { throw Object.assign(new Error("没有这一项"), { code: "example.thing_missing", kind: "not_found", details: { id: "a1" } }); } },
    { route_id: "declared", async handle() { await Promise.resolve(); throw exampleErrors.gone("已经删除", { id: "b2" }); } },
  ]);
  assert.deepEqual(await plugin.route("foreign").handle(request("foreign")),
    { status: 404, body: { error: "没有这一项", code: "example.thing_missing", details: { id: "a1" } } });
  assert.deepEqual(await plugin.route("declared").handle(request("declared")),
    { status: 404, body: { error: "已经删除", code: "example.gone", details: { id: "b2" } } });
});

test("BL404-02 a failure with no code of ours goes on to the Host, which answers it with its generic sentence", async () => {
  const bug = new Error("/Users/example/private 读取失败"), system = Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });
  const plugin = await routesPlugin(["bug", "system"], () => [
    { route_id: "bug", async handle() { throw bug; } },
    { route_id: "system", handle() { throw system; } },
  ]);
  await assert.rejects(Promise.resolve(plugin.route("bug").handle(request("bug"))), error => error === bug);
  await assert.rejects(Promise.resolve(plugin.route("system").handle(request("system"))), error => error === system);
});
