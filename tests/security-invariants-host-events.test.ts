import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  HOST_EVENT_SOURCE, HOST_REVIEW_SETTLED_EVENT,
  type PluginDefinition, type PluginEventDeliveryContext, type PluginEventDeliveryFailure, type PluginEventRecord,
  type PluginEventSubscribeDeclaration, type PluginHostServices, type PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  createPluginPlatform, DEMO_PROJECT_ID, LocalProjectDatabase, observeReviewSettlements, reviewSettlementForwarder, seedDemoBoard,
} from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { currentPluginAction, SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { deferred } from "./fixtures/home-runtime.js";
import { pluginActions } from "./fixtures/plugin-actions.js";

// S-54: a host event (X-6) goes only to the installation it is addressed to — for `host.review.settled@1`, the one that asked for
// the review — and only while that very activation runs, is enabled and subscribes in its current Manifest. It is not stored,
// never starts a plugin, is never replayed, and runs outside any action as the subscriber itself.

const A = "io.molis.work.example.hostasker", B = "io.molis.work.example.hostbystander", C = "io.molis.work.example.hostdeaf";
const SETTLED: PluginEventSubscribeDeclaration = { event_type_id: HOST_REVIEW_SETTLED_EVENT, type_version: 1 };
const OWNER: ActionCallContext = { actor_id: "owner", project_id: DEMO_PROJECT_ID, audience: "user", permissions: [] };

function manifestFor(pluginId: string, subscribes: PluginEventSubscribeDeclaration[], actions: ActionDefinition[] = []): PluginManifest {
  return { schema_version: 2, host_api_version: 2, plugin_id: pluginId, version: "1.0.0", name: pluginId, kind: "app",
    publisher: { publisher_id: "molis", signature: `probe-${pluginId.split(".").at(-1)}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    events: { publishes: [{ event_type_id: `${pluginId}.noted`, type_version: 1 }], subscribes }, actions, upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] } };
}

/**
 * A plugin that records what it hears. Each start is one activation; its `stop` ends it, as the Host withdraws the caller an
 * activation asked with (PG-009), so an authority taken from it stops holding once it stops, is disabled or reinstalled.
 */
function probe(pluginId: string, subscribes: PluginEventSubscribeDeclaration[]) {
  const settleNow: ActionDefinition<{ review_id: string }, boolean> = { capability_id: `${pluginId}.settle-now`, version: 1, operation: "command",
    action: { scope: "project", audiences: ["user"], permissions: [], subject_kinds: [], title: "结算一项审查", description: "结算一项审查",
      kind: "operation", input_schema: { type: "object", additionalProperties: false, required: ["review_id"], properties: { review_id: { type: "string" } } },
      output_schema: { type: "boolean" } } };
  const state = {
    heard: [] as { record: PluginEventRecord; context: PluginEventDeliveryContext; action: unknown }[],
    starts: 0, activation: { live: false }, services: undefined as PluginHostServices | undefined,
    /** Set by a test: what `onEvent` does after it records the event. */
    handle: undefined as ((record: PluginEventRecord, context: PluginEventDeliveryContext) => Promise<void> | void) | undefined,
    /** Set by a test: what the plugin's own action does inside the action. */
    inside: undefined as ((reviewId: string) => void) | undefined,
  };
  // It publishes an event of its own, so it holds the event client a plugin publishes through (X6-03).
  const definition: PluginDefinition = { manifest: manifestFor(pluginId, subscribes, [settleNow]),
    event_types: [{ event_type_id: `${pluginId}.noted`, type_version: 1, validate: (payload: unknown) => payload }], async start(context) {
    state.starts += 1; state.activation = { live: true }; state.services = context.services;
    return { kind: "app" as const, views: [], actions: [{ ...settleNow, handle: (_caller: ActionCallContext, input: unknown) => { state.inside?.((input as { review_id: string }).review_id); return true; } }],
      // A plugin that subscribes to nothing may not hand over a handler at all (`plugin.contribution_unredeemed`).
      ...subscribes.length === 0 ? {} : { onEvent: async (record: PluginEventRecord, eventContext: PluginEventDeliveryContext) => {
        state.heard.push({ record, context: eventContext, action: currentPluginAction() });
        await state.handle?.(record, eventContext);
      } } };
  }, async stop() { state.activation.live = false; } };
  return { definition, settleNow, state, heard: () => state.heard.map(item => item.record) };
}

/** The project platform the Host builds, a review queue, and the settlement forwarder the Host wires between them. */
async function platform(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "host-events-")), file = join(home, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), actions = pluginActions(store, DEMO_PROJECT_ID), privateStorage = new SqlitePluginPrivateStorage(store.db);
  const ports = { db: store.db, appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent(event),
    eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const running = createPluginPlatform({ actions, project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, journal: store,
    artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports), ui: new UiHost(),
    privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest), home: null });
  const queue = new AgentReviewQueue(), forwarder = reviewSettlementForwarder(running.hostEvents);
  forwarder.update(listener => observeReviewSettlements(queue, DEMO_PROJECT_ID, listener));
  const failures: PluginEventDeliveryFailure[] = [];
  running.hostEvents.observeFailures(failure => failures.push(failure));
  t.after(async () => {
    forwarder.stop();
    try {
      await running.closeCoordination();
      for (const instance of running.runtime.list()) if (instance.state === "running") await running.runtime.stop(instance.install_id);
    } finally { store.close(); rmSync(home, { recursive: true, force: true }); }
  });
  const asker = probe(A, [SETTLED]), bystander = probe(B, [SETTLED]), deaf = probe(C, []);
  const report = await running.start([asker, bystander, deaf].map(item => ({ definition: item.definition, bundled: true })));
  assert.deepEqual(report.running.toSorted(), [A, B, C].toSorted(), JSON.stringify(report));
  const installOf = (pluginId: string) => running.runtime.list().find(install => install.plugin_id === pluginId)!;
  let counter = 0;
  /** A plugin operation `who` asks for now, approved by a person and handed to its execution owner. */
  const ask = (who: ReturnType<typeof probe>, projectId = DEMO_PROJECT_ID) => {
    const reviewId = `review-${++counter}`, pluginId = who.definition.manifest.plugin_id, asked = who.state.activation;
    queue.request({ review_id: reviewId, run: null, project_id: projectId, plugin_id: pluginId, kind: "tool-operation",
      operation: { kind: "git-operation", operation_id: `operation-${counter}`, workspace_id: "w" },
      document: { kind: "tool-operation", tool: "git-commit", summary: "提交暂存区", fields: [] }, requested_at: "2026-10-22T00:00:00Z", expires_at: null },
    { plugin_id: pluginId, install_id: installOf(pluginId).install_id, holds: () => asked.live });
    queue.decide({ review_id: reviewId, decision: "approve", actor_id: "owner" });
    queue.consumeApproval(reviewId);
    return reviewId;
  };
  const settled = async () => { await running.hostEvents.drain(); };
  return { running, queue, asker, bystander, deaf, ask, settled, failures, installOf, client: actions.client, db: store.db };
}

test("X6-01 S-54 a settled review goes only to the installation that asked for it, never to another subscriber or another project", async t => {
  const { running, queue, asker, bystander, ask, settled, installOf, db } = await platform(t);
  for (const outcome of ["succeeded", "failed", "unknown"] as const) {
    const reviewId = ask(asker);
    if (outcome === "unknown") queue.uncertain(reviewId, "结果未确认");
    else queue.settle(reviewId, outcome === "succeeded" ? { ok: true } : { ok: false, error: "失败" });
    await settled();
    const record = asker.heard().at(-1)!;
    assert.deepEqual(record.payload, { review_id: reviewId, kind: "git-operation", operation_id: reviewId.replace("review-", "operation-"), workspace_id: "w", outcome });
    assert.equal(record.event_type_id, HOST_REVIEW_SETTLED_EVENT);
    assert.equal(record.source_plugin_id, HOST_EVENT_SOURCE);
    assert.equal(record.source_install_id, HOST_EVENT_SOURCE);
    assert.equal(record.correlation_id, reviewId);
    assert.equal(record.sequence, 0, "not in the event log");
    assert.equal(asker.state.heard.at(-1)!.context.install_id, installOf(A).install_id);
  }
  assert.equal(asker.heard().length, 3);
  assert.deepEqual(bystander.heard(), [], "a plugin that subscribes to the same type hears nothing of a review it did not ask for");
  // The bystander's own review reaches it, and not the asker.
  const own = ask(bystander);
  queue.settle(own, { ok: true });
  await settled();
  assert.deepEqual(bystander.heard().map(record => record.correlation_id), [own]);
  assert.equal(asker.heard().length, 3);
  // A review of another project is not this project's to send.
  queue.settle(ask(asker, "another-project"), { ok: true });
  await settled();
  assert.equal(asker.heard().length, 3);
  assert.deepEqual(running.events.log(DEMO_PROJECT_ID).filter(record => record.event_type_id.startsWith("host.")), [], "host events are not in the event log");
  assert.deepEqual(db.prepare("SELECT event_id FROM plugin_events WHERE event_type_id LIKE 'host.%'").all(), [], "nor in the project's library");
});

test("X6-02 S-54 an installation that does not subscribe gets nothing, and a stopped subscriber is not started for one", async t => {
  const { running, queue, asker, deaf, ask, settled, installOf } = await platform(t);
  queue.settle(ask(deaf), { ok: true });
  await settled();
  assert.deepEqual(deaf.heard(), [], "asked for the review, but its Manifest does not subscribe");
  assert.equal(running.hostEvents.notify({ plugin_id: C, install_id: installOf(C).install_id },
    { event_type_id: HOST_REVIEW_SETTLED_EVENT, type_version: 1, payload: {} }), false);
  await running.runtime.stop(installOf(A).install_id);
  const starts = asker.state.starts;
  assert.equal(running.hostEvents.notify({ plugin_id: A, install_id: installOf(A).install_id },
    { event_type_id: HOST_REVIEW_SETTLED_EVENT, type_version: 1, payload: {} }), false, "not running: dropped, not kept");
  await settled();
  assert.equal(asker.state.starts, starts, "never started for a host event");
  assert.notEqual(installOf(A).state, "running");
  assert.deepEqual(asker.heard(), []);
});

test("X6-03 S-54 a plugin cannot publish a host event, and its services offer no way to send one", async t => {
  const { asker } = await platform(t);
  const events = asker.state.services!.events!;
  assert.throws(() => events.publish({ event_type_id: HOST_REVIEW_SETTLED_EVENT, type_version: 1, payload: {} }), { code: "plugin.event_type_reserved" });
  assert.equal("notify" in events, false, "the plugin's event client only publishes its own events");
  assert.equal(Reflect.get(events, "notify"), undefined);
  assert.equal(Object.keys(asker.state.services!).some(key => /host.?events/i.test(key)), false, "no host-event service is handed to a plugin");
});

test("X6-04 S-54 a Manifest subscribes to a host event by type and version only, and only to one the Host publishes", () => {
  const parse = (subscribes: unknown[]) => parsePluginManifest({ ...manifestFor(A, []), events: { publishes: [], subscribes } } as PluginManifest);
  assert.doesNotThrow(() => parse([SETTLED]));
  assert.throws(() => parse([{ ...SETTLED, from_plugin_ids: [B] }]), { code: "plugin.declaration_invalid", message: /订阅宿主事件 host\.review\.settled 不写来源插件/ });
  assert.throws(() => parse([{ ...SETTLED, from_plugin_ids: [] }]), { code: "plugin.declaration_invalid", message: /不写来源插件/ });
  assert.throws(() => parse([{ event_type_id: "host.review.other", type_version: 1 }]), { code: "plugin.declaration_invalid", message: /宿主没有事件 host\.review\.other@1/ });
  assert.throws(() => parse([{ ...SETTLED, type_version: 2 }]), { code: "plugin.declaration_invalid", message: /宿主没有事件 host\.review\.settled@2/ });
  assert.throws(() => parse([{ event_type_id: "molis.anything", type_version: 1 }]), { code: "plugin.declaration_invalid", message: /宿主没有事件 molis\.anything@1/ });
  assert.throws(() => parse([{ event_type_id: `${B}.changed`, type_version: 1 }]), { code: "plugin.declaration_invalid", message: /必须显式限定来源插件/ },
    "another plugin's event still names its source");
});

test("X6-05 S-54 a reinstalled, disabled, stopped or restarted installation gets nothing asked for or queued before", async t => {
  const { running, queue, asker, ask, settled, failures, installOf } = await platform(t);
  const install = () => installOf(A).install_id;
  // Reinstalled: the installation id stays, the activation that asked is gone.
  const beforeReinstall = ask(asker);
  await running.runtime.stop(install());
  await running.runtime.uninstall(install());
  running.runtime.install({ definition: asker.definition, deployment: "local", grants: [], bundled: true });
  await running.runtime.start(install());
  queue.settle(beforeReinstall, { ok: true });
  await settled();
  assert.deepEqual(asker.heard(), [], "the new installation does not hear what the old one asked for");
  // Disabled.
  const beforeDisable = ask(asker);
  running.supervisor.revoke(A);
  queue.settle(beforeDisable, { ok: true });
  await settled();
  assert.deepEqual(asker.heard(), []);
  await running.supervisor.enable(A);
  await settled();
  assert.deepEqual(asker.heard(), [], "enabling again replays nothing");
  // Stopped after queued: the first handler holds the queue, the second waits; stopping aborts the first and drops the second.
  const entered = deferred(), release = deferred();
  asker.state.handle = async (_record, context) => { entered.resolve(); await Promise.race([release.promise, new Promise(resolve => context.signal.addEventListener("abort", resolve))]); };
  const first = ask(asker), second = ask(asker);
  queue.settle(first, { ok: true });
  queue.settle(second, { ok: true });
  await entered.promise;
  assert.deepEqual(asker.heard().map(record => record.correlation_id), [first], "the second is queued behind the first");
  const handlerContext = asker.state.heard.at(-1)!.context;
  await running.runtime.stop(install());
  release.resolve();
  await settled();
  assert.equal(handlerContext.signal.aborted, true, "stopping aborts the running handler");
  assert.throws(() => handlerContext.beforeEffect(), { code: "plugin.event_delivery_revoked" });
  assert.deepEqual(asker.heard().map(record => record.correlation_id), [first], "queued before the stop, dropped at dispatch");
  assert.equal(failures.at(-1)?.code, "plugin.subscriber_revoked");
  // Restarted after queued: the same installation runs again, but not the activation the event was queued for.
  await running.runtime.start(install());
  const held = deferred(), letGo = deferred();
  asker.state.handle = async () => { held.resolve(); await letGo.promise; };
  const third = ask(asker), fourth = ask(asker);
  queue.settle(third, { ok: true });
  queue.settle(fourth, { ok: true });
  await held.promise;
  asker.state.handle = undefined;
  await running.runtime.stop(install());
  await running.runtime.start(install());
  letGo.resolve();
  await settled();
  assert.deepEqual(asker.heard().map(record => record.correlation_id), [first, third], "the fourth was queued for an activation that is gone");
  // An address that is not the running installation is refused outright.
  assert.equal(running.hostEvents.notify({ plugin_id: A, install_id: "another-install" }, { event_type_id: HOST_REVIEW_SETTLED_EVENT, type_version: 1, payload: {} }), false);
});

test("X6-06 S-54 an Agent's own change and a review restored from history send nothing to anyone", async t => {
  const { queue, asker, bystander, deaf, settled } = await platform(t);
  queue.request({ review_id: "agent-own", run: { run_id: "run-1", session_id: "s-1" }, project_id: DEMO_PROJECT_ID, plugin_id: A, kind: "command",
    document: { kind: "command", command: "npm", args: ["test"], cwd: ".", timeout_ms: 30000, env_allowlist: ["PATH"] }, requested_at: "2026-10-22T00:00:00Z", expires_at: null });
  queue.decide({ review_id: "agent-own", decision: "approve", actor_id: "owner" });
  queue.consumeApproval("agent-own");
  queue.settle("agent-own", { ok: true });
  const restored = { review_id: "restored", run: null, project_id: DEMO_PROJECT_ID, plugin_id: A, kind: "tool-operation" as const,
    operation: { kind: "git-operation" as const, operation_id: "operation-restored", workspace_id: "w" },
    document: { kind: "tool-operation" as const, tool: "git-commit", summary: "提交暂存区", fields: [] }, requested_at: "2026-10-22T00:00:00Z", expires_at: null };
  queue.restoreDecision(restored, { status: "approved", decided_by: "owner", decided_at: "2026-10-22T00:00:00Z", note: null });
  queue.settle("restored", { ok: true }, { restored: true });
  queue.restoreDecision({ ...restored, review_id: "restored-later" }, { status: "approved", decided_by: "owner", decided_at: "2026-10-22T00:00:00Z", note: null });
  queue.uncertain("restored-later", "重启后才确认");
  await settled();
  for (const item of [asker, bystander, deaf]) assert.deepEqual(item.heard(), [], item.definition.manifest.plugin_id);
});

test("X6-07 S-54 a settlement inside an action is delivered outside it, as the subscriber itself; a failing handler changes nothing", async t => {
  const { queue, asker, ask, settled, failures, installOf, client } = await platform(t);
  const reviewId = ask(asker);
  let receipt: unknown;
  asker.state.inside = id => { receipt = queue.settle(id, { ok: true }); };
  asker.state.handle = () => { throw new Error("the subscriber failed"); };
  assert.equal(await client.invoke(OWNER, asker.settleNow, { review_id: reviewId }), true, "the settling action is not affected");
  await settled();
  assert.equal((receipt as { effect_settled?: boolean }).effect_settled, true, "the settlement stands");
  const heard = asker.state.heard.at(-1)!;
  assert.equal(heard.action, undefined, "the handler runs outside every action");
  assert.equal(heard.context.actor_id, `plugin:${A}`, "as the subscriber, not the person who approved or the caller who settled");
  assert.equal(heard.context.install_id, installOf(A).install_id);
  assert.equal(heard.context.project_id, DEMO_PROJECT_ID);
  assert.equal(failures.at(-1)?.code, "plugin.subscriber_handler_failed");
  assert.equal(failures.at(-1)?.source_plugin_id, HOST_EVENT_SOURCE);
  // Not retried.
  await settled();
  assert.equal(asker.heard().length, 1);
});
