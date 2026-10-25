import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginHostServices, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { captureHostLog, DEMO_PROJECT_ID, LocalProjectDatabase, PluginHostExecutor, seedDemoBoard, type HostLogEntry } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { inertAfterStop, PluginRuntime, StoppedServiceCalls, type StoppedServiceCall } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { PENDING, within } from "./fixtures/stopped-calls.js";

/*
 * BL-411 (specs/BACKLOG.md): code a plugin leaves running after its activation stopped (a timer, a watcher) calls the services it
 * was given, outside any call. Those calls do nothing: a refused synchronous call returns undefined and a refused asynchronous one
 * never settles, so nothing reaches the Home's process; the executor counts them and logs the first of each method. A call made
 * while the activation ran, one from its own `stop` hook, and one made inside an action whose handler still runs, is answered as
 * before. The Home side is PG061-05 in tests/plugin-ui-invalidate.test.ts and DUAL-13 in tests/dual-instance-lifecycle.test.ts.
 */

/** Runs `run` from a timer, the way a plugin's leftover code does; what it returns is handed back as it is (a promise is not awaited). */
const fromTimer = <T extends object>(run: () => T) => new Promise<T>((resolve, reject) => {
  setTimeout(() => { try { resolve(run()); } catch (error) { reject(error); } }, 0);
});
const instanceOf = (context: PluginStartContext) => ({ install_id: context.install_id, installation_generation: context.installation_generation });

/**
 * A project plugin with one view and one command; its `stop` hook calls both services and keeps what they said. The command's
 * handler notes which start it belongs to, then answers with `on.touch` when a test set one.
 */
function stopProbe(name: string) {
  const id = `io.molis.work.example.${name}`, write = `${name}:write`;
  const on: { touch?: (services: PluginHostServices, activation: number) => string | Promise<string> } = {};
  const touch: ActionDefinition<Record<string, never>, string> = { capability_id: `${name}.touch`, version: 1, operation: "command",
    action: { title: "改动", description: "处理器跑过就记下是哪一次启动", kind: "operation", scope: "project", audiences: ["user"], permissions: [write],
      subject_kinds: [], input_schema: { type: "object", additionalProperties: false } } };
  const view = { contribution_id: `${id}.list`, plugin_id: id, kind: "embedded" as const, label: "列表", slots: [] };
  const contexts: PluginStartContext[] = [], ran: number[] = [], atStop: unknown[] = [];
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name, kind: "app",
    publisher: { publisher_id: "example", signature: `stopped-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: write, required: true, reason: "改动自己的内容" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
    ui: { contributions: [view.contribution_id], views: [{ view_id: "list", slot: "navigator", title: "列表" }] }, actions: [touch] },
  async start(context) {
    const activation = contexts.push(context);
    return { kind: "app", views: [{ descriptor: view, render: () => "<p>列表</p>" }],
      actions: [{ ...touch, async handle() { ran.push(activation); return on.touch ? on.touch(context.services!, activation) : "touched"; } }] };
  },
  async stop(context) {
    try { context.services!.ui.invalidate(); atStop.push("quiet"); } catch (error) { atStop.push(error); }
    atStop.push(await context.services!.actions!.invoke(touch, {}).then(() => "ran", (error: unknown) => error));
  } };
  return { id, touch, definition, contexts, ran, atStop, on };
}

/** A Runtime on the project executor, as the Host composes it for one project, with the pages it told to read again. */
function projectRig(t: TestContext, probe: ReturnType<typeof stopProbe>) {
  const directory = mkdtempSync(join(tmpdir(), "molis-stopped-services-")), file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), invalidated: string[] = [];
  const executor = new PluginHostExecutor({ actions: pluginActions(store, DEMO_PROJECT_ID), project_id: DEMO_PROJECT_ID, actor_id: "user",
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }), ui: new UiHost(), invalidateView: id => invalidated.push(id),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) });
  const runtime = new PluginRuntime(undefined, executor, { actions: pluginActions(store, DEMO_PROJECT_ID) });
  const installs: string[] = [];
  const install = () => {
    const installId = runtime.install({ trust: { level: "unsigned" }, definition: probe.definition, deployment: "local", grants: probe.definition.manifest.permissions.map(item => item.permission) }).install.install_id;
    installs.push(installId);
    return installId;
  };
  t.after(async () => {
    for (const installId of new Set(installs)) if (runtime.get(installId).state === "running") await runtime.stop(installId);
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return { executor, runtime, invalidated, install };
}

/** The `stopped_service_call` lines the Host writes while the test runs. */
function stoppedLog(t: TestContext) {
  const entries: HostLogEntry[] = [];
  t.after(captureHostLog(entries));
  return () => entries.filter(entry => entry.event === "stopped_service_call");
}

/** Rejections no one handled while the test runs: before BL-411, a leftover call's refusal was one, and it ended the process. */
function unhandled(t: TestContext) {
  const seen: unknown[] = [], note = (error: unknown) => { seen.push(error); };
  process.on("unhandledRejection", note);
  t.after(() => { process.off("unhandledRejection", note); });
  return seen;
}

test("BL411-01 after its activation stopped, a plugin's timer calls its services and nothing happens: no throw, no settlement, counted, logged once per method", { timeout: 60_000 }, async t => {
  const probe = stopProbe("stoppedone"), { executor, runtime, invalidated, install } = projectRig(t, probe), log = stoppedLog(t), crashes = unhandled(t);
  const installId = install();
  await runtime.start(installId);
  const context = probe.contexts[0]!, old = context.services!;
  await runtime.stop(installId);
  const moved = invalidated.length;
  const calls = await fromTimer(() => ({ first: old.ui.invalidate(), again: old.ui.invalidate(), invoked: old.actions!.invoke(probe.touch, {}) }));
  assert.equal(calls.first, undefined, "a refused synchronous call returns nothing and throws nothing");
  assert.equal(calls.again, undefined);
  assert.equal(await within(calls.invoked), PENDING, "a refused asynchronous call never settles");
  // The call a careless timer makes and drops: before BL-411 its refusal reached the process unhandled.
  await fromTimer(() => { void old.actions!.invoke(probe.touch, {}); return {}; });
  await new Promise(resolve => { setTimeout(resolve, 20); });
  assert.deepEqual(crashes, [], "nothing reaches the process");
  assert.equal(invalidated.length, moved, "the stopped activation's pages are not told to read again");
  assert.deepEqual(probe.ran, [], "its action's handler did not run");
  assert.equal(executor.stoppedServiceCalls(instanceOf(context)), 4, "every call is counted");
  assert.deepEqual(log().map(entry => [entry.level, entry.area, entry.fields]), [
    ["warn", "plugins", { plugin_id: probe.id, install_id: installId, service: "ui", method: "invalidate" }],
    ["warn", "plugins", { plugin_id: probe.id, install_id: installId, service: "actions", method: "invoke" }],
  ], "one line for the first call of each method, naming the plugin, the service and the method only");
});

test("BL411-02 calls made while the activation runs answer as before, also when they settle after it stopped", async () => {
  let stopped = false, release!: (value: string) => void, fail!: (error: Error) => void;
  const noted: StoppedServiceCall[] = [];
  class Store { readonly #value = "kept"; read() { return this.#value; } get size() { return 1; } }
  const services = inertAfterStop({
    store: new Store(), nested: { deep: { refuse(): string { throw new Error("refused"); } } }, list: [1, 2],
    later: () => new Promise<string>(resolve => { release = resolve; }), failing: () => new Promise<string>((_resolve, reject) => { fail = reject; }),
    rejecting: async (): Promise<string> => { throw new Error("rejected"); },
  }, () => stopped, call => { noted.push(call); });
  assert.throws(() => services.nested.deep.refuse(), /refused/, "a running activation's refusal is thrown to it");
  await assert.rejects(services.rejecting(), /rejected/, "and an asynchronous one rejects");
  assert.equal(services.store.read(), "kept", "a class's methods still run on their own instance");
  assert.equal(services.store.size, 1, "and its getters read through");
  assert.deepEqual(services.list, [1, 2]);
  assert.ok(Object.isFrozen(services) && Object.isFrozen(services.nested.deep));
  const late = services.later(), refusedLate = services.failing();
  stopped = true;
  release("late");
  fail(new Error("late refusal"));
  assert.equal(await late, "late", "a call made while running keeps its answer when it settles after the stop");
  await assert.rejects(refusedLate, /late refusal/, "and its refusal: it is not left waiting");
  assert.deepEqual(noted, [], "neither is a stopped activation's call");
  assert.equal(services.store.read(), "kept", "after the stop a call nothing refuses still answers");
  assert.equal(services.nested.deep.refuse(), undefined);
  assert.equal(await within(services.rejecting()), PENDING);
  assert.deepEqual(noted, [{ service: "nested.deep", method: "refuse" }, { service: "rejecting", method: "rejecting" }]);
  // The count is per instance: another generation of the same installation starts from nothing, and only a method's first call is told.
  const calls = new StoppedServiceCalls(), first = { install_id: "install-1", installation_generation: "one" }, second = { ...first, installation_generation: "two" };
  assert.deepEqual([calls.note(first, noted[0]!), calls.note(first, noted[0]!), calls.note(first, noted[1]!), calls.note(second, noted[0]!)], [true, false, true, true]);
  assert.deepEqual([calls.count(first), calls.count(second), calls.count({ ...first, install_id: "install-2" })], [3, 1, 0]);
});

test("BL411-03 inside its own stop hook a plugin is still told no, and the stop completes", { timeout: 60_000 }, async t => {
  const probe = stopProbe("stoppedhook"), { executor, runtime, install } = projectRig(t, probe);
  const installId = install();
  await runtime.start(installId);
  await runtime.stop(installId);
  assert.notEqual(runtime.get(installId).state, "running");
  assert.deepEqual(probe.atStop.map(said => (said as { code?: string }).code), ["ui_host.plugin_denied", "actions.forbidden"],
    "the hook hears the refusals, as it did before BL-411, so its cleanup can tell what it may no longer do");
  assert.equal(executor.stoppedServiceCalls(instanceOf(probe.contexts[0]!)), 0, "and they are not counted as calls after the stop");
});

test("BL411-06 once its activation stopped, a call made inside an action whose handler still runs hears the refusal, whichever activation's action it is; what an ended action left behind does nothing", { timeout: 60_000 }, async t => {
  const probe = stopProbe("stoppedopen"), { executor, runtime, invalidated, install } = projectRig(t, probe), log = stoppedLog(t), crashes = unhandled(t);
  const installId = install();
  await runtime.start(installId);
  const first = probe.contexts[0]!;
  // An action that returns at once and leaves a callback behind, carrying its scope.
  let fire!: () => void;
  const left: unknown[] = [];
  probe.on.touch = services => {
    void new Promise<void>(resolve => { fire = resolve; }).then(() => {
      const said: unknown = services.ui.invalidate();
      left.push(said === undefined ? "quiet" : said);
    });
    return "touched";
  };
  assert.equal(await first.services!.actions!.invoke(probe.touch, {}), "touched");
  // Two actions still running when the activation stops: each then calls a service of its own, one synchronous, one asynchronous.
  const steps = [(services: PluginHostServices) => { services.ui.invalidate(); return "invalidated"; },
    (services: PluginHostServices) => services.actions!.invoke(probe.touch, {})];
  let entered = 0, reached!: () => void, release!: () => void;
  const bothIn = new Promise<void>(resolve => { reached = resolve; }), released = new Promise<void>(resolve => { release = resolve; });
  probe.on.touch = async services => {
    const step = steps[entered]!;
    if (++entered === steps.length) reached();
    await released;
    return step(services);
  };
  const viaSync = first.services!.actions!.invoke(probe.touch, {}), viaAsync = first.services!.actions!.invoke(probe.touch, {});
  void viaSync.catch(() => undefined); void viaAsync.catch(() => undefined);
  await bothIn;
  await runtime.stop(installId);
  const moved = invalidated.length;
  release();
  await assert.rejects(viaSync, { code: "ui_host.plugin_denied" }, "the caller hears the refusal: no write that did nothing is reported as done");
  await assert.rejects(viaAsync, { code: "actions.forbidden" }, "and is not left waiting");

  // The restarted activation's action reaching for a handle of the earlier one hears the refusal too (tests/plugin-model-service.test.ts).
  await runtime.start(installId);
  const restarted = probe.contexts[1]!;
  probe.on.touch = () => { first.services!.ui.invalidate(); return "old handle"; };
  await assert.rejects(restarted.services!.actions!.invoke(probe.touch, {}), { code: "ui_host.plugin_denied" });
  probe.on.touch = () => first.services!.actions!.invoke(probe.touch, {});
  await assert.rejects(restarted.services!.actions!.invoke(probe.touch, {}), { code: "actions.forbidden" });

  fire();
  await new Promise(resolve => { setTimeout(resolve, 20); });
  assert.deepEqual(left, ["quiet"], "the callback the ended action left behind ran, and its refused call threw nothing");
  assert.equal(invalidated.length, moved, "no page was told to read again");
  assert.deepEqual(probe.ran, [1, 1, 1, 2, 2], "the handlers that ran; every call after the stop was refused before its handler");
  assert.deepEqual(crashes, []);
  assert.equal(executor.stoppedServiceCalls(instanceOf(first)), 1, "only the leftover is counted: every other refusal reached a caller");
  assert.deepEqual(log().map(entry => entry.fields), [{ plugin_id: probe.id, install_id: installId, service: "ui", method: "invalidate" }]);
});

test("BL411-05 S-18 after a restart or a reinstall the old activation's handles do nothing and never reach the new one", { timeout: 60_000 }, async t => {
  const probe = stopProbe("stoppedagain"), { executor, runtime, invalidated, install } = projectRig(t, probe), crashes = unhandled(t);
  const installId = install();
  await runtime.start(installId);
  const first = probe.contexts[0]!;
  await runtime.stop(installId);
  await runtime.start(installId);
  const restarted = probe.contexts[1]!;
  const moved = invalidated.length;
  const old = await fromTimer(() => ({ invalidated: first.services!.ui.invalidate(), invoked: first.services!.actions!.invoke(probe.touch, {}) }));
  assert.equal(old.invalidated, undefined);
  assert.equal(await within(old.invoked), PENDING);
  assert.equal(invalidated.length, moved, "the old handle does not move the running activation's pages");
  assert.deepEqual(probe.ran, [], "and its call does not reach the running activation's handler");
  // The running activation's own handles do both: the old ones were not quiet only because nothing was there to reach.
  const current = await fromTimer(() => ({ invalidated: restarted.services!.ui.invalidate(), invoked: restarted.services!.actions!.invoke(probe.touch, {}) }));
  assert.equal(current.invalidated, undefined);
  assert.equal(await current.invoked, "touched");
  assert.deepEqual([invalidated.length - moved, probe.ran], [1, [2]], "the running activation's pages and handler");

  await runtime.uninstall(installId);
  const reinstalled = install();
  await runtime.start(reinstalled);
  const fresh = probe.contexts.at(-1)!;
  assert.notEqual(fresh.installation_generation, first.installation_generation, "a reinstall is another instance");
  const before = invalidated.length;
  const stale = await fromTimer(() => ({ first: first.services!.actions!.invoke(probe.touch, {}), restarted: restarted.services!.actions!.invoke(probe.touch, {}),
    invalidated: restarted.services!.ui.invalidate() }));
  assert.deepEqual([await within(stale.first), await within(stale.restarted), stale.invalidated], [PENDING, PENDING, undefined]);
  assert.equal(invalidated.length, before, "neither earlier activation reaches the reinstalled one's pages");
  assert.deepEqual(probe.ran, [2], "nor its handler");
  assert.deepEqual(crashes, []);
  assert.equal(executor.stoppedServiceCalls(instanceOf(fresh)), 0, "the reinstalled instance has made no call after a stop");
  // A restart may keep the generation, when both activations are one instance and count together.
  const earlier = executor.stoppedServiceCalls(instanceOf(first))
    + (restarted.installation_generation === first.installation_generation ? 0 : executor.stoppedServiceCalls(instanceOf(restarted)));
  assert.equal(earlier, 5, "the earlier activations' calls are theirs");
});
