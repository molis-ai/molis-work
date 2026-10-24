import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  HOST_EVENT_SOURCE, HOST_REVIEW_SETTLED_EVENT, HOST_WORKSPACE_CHANGED_EVENT,
  type PluginAppContribution, type PluginDefinition, type PluginEventDeliveryContext, type PluginEventDeliveryFailure, type PluginEventRecord,
  type PluginEventSubscribeDeclaration, type PluginHostServices, type PluginManifest, type PluginPermissionDeclaration,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  createPluginPlatform, DEMO_PROJECT_ID, LocalProjectDatabase, observeReviewSettlements, reviewSettlementForwarder, seedDemoBoard, type AgentWritePlaces,
} from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { currentPluginAction, PluginHostEvents, type PluginHostEventsLifecycle, SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { deferred } from "./fixtures/home-runtime.js";
import { pluginActions } from "./fixtures/plugin-actions.js";

// S-54: a host event (X-6) goes only to the installation it is addressed to — for `host.review.settled@1`, the one that asked for
// the review — or, for a broadcast such as `host.workspace.changed@1`, to each installation of the project that holds the type's
// permission, declared and granted; and only while that very activation runs, is enabled and subscribes in its current Manifest.
// It is not stored, never starts a plugin, is never replayed, and runs outside any action as the subscriber itself.

const A = "io.molis.work.example.hostasker", B = "io.molis.work.example.hostbystander", C = "io.molis.work.example.hostdeaf";
const W = "io.molis.work.example.hostwatcher", V = "io.molis.work.example.hostviewer", R = "io.molis.work.example.hostreader";
const SETTLED: PluginEventSubscribeDeclaration = { event_type_id: HOST_REVIEW_SETTLED_EVENT, type_version: 1 };
const CHANGED: PluginEventSubscribeDeclaration = { event_type_id: HOST_WORKSPACE_CHANGED_EVENT, type_version: 1 };
const READ: PluginPermissionDeclaration = { permission: "workspace:read", required: false, reason: "工作区变了就重读" };
const OWNER: ActionCallContext = { actor_id: "owner", project_id: DEMO_PROJECT_ID, audience: "user", permissions: [] };

function manifestFor(pluginId: string, subscribes: PluginEventSubscribeDeclaration[], actions: ActionDefinition[] = [],
  permissions: PluginPermissionDeclaration[] = []): PluginManifest {
  return { schema_version: 2, host_api_version: 2, plugin_id: pluginId, version: "1.0.0", name: pluginId, kind: "app",
    publisher: { publisher_id: "molis", signature: `probe-${pluginId.split(".").at(-1)}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions, capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    events: { publishes: [{ event_type_id: `${pluginId}.noted`, type_version: 1 }], subscribes }, actions, upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] } };
}

/**
 * A plugin that records what it hears. Each start is one activation; its `stop` ends it, as the Host withdraws the caller an
 * activation asked with (PG-009), so an authority taken from it stops holding once it stops, is disabled or reinstalled.
 */
function probe(pluginId: string, subscribes: PluginEventSubscribeDeclaration[], permissions: PluginPermissionDeclaration[] = []) {
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
    /** Set by a test: what the plugin's stop hook waits for before it returns. */
    stopping: undefined as Promise<unknown> | undefined,
  };
  // It publishes an event of its own, so it holds the event client a plugin publishes through (X6-03).
  const definition: PluginDefinition = { manifest: manifestFor(pluginId, subscribes, [settleNow], permissions),
    event_types: [{ event_type_id: `${pluginId}.noted`, type_version: 1, validate: (payload: unknown) => payload }], async start(context) {
    state.starts += 1; state.activation = { live: true }; state.services = context.services;
    return { kind: "app" as const, views: [], actions: [{ ...settleNow, handle: (_caller: ActionCallContext, input: unknown) => { state.inside?.((input as { review_id: string }).review_id); return true; } }],
      // A plugin that subscribes to nothing may not hand over a handler at all (`plugin.contribution_unredeemed`).
      ...subscribes.length === 0 ? {} : { onEvent: async (record: PluginEventRecord, eventContext: PluginEventDeliveryContext) => {
        state.heard.push({ record, context: eventContext, action: currentPluginAction() });
        await state.handle?.(record, eventContext);
      } } };
  }, async stop() { state.activation.live = false; await state.stopping; } };
  return { definition, settleNow, state, heard: () => state.heard.map(item => item.record) };
}

/** A plugin that rereads a workspace when it changes: it subscribes to `host.workspace.changed@1` and declares `workspace:read`. */
const watcher = (pluginId: string) => probe(pluginId, [CHANGED], [READ]);

/**
 * The project platform the Host builds, a review queue, and the settlement forwarder the Host wires between them. `extra` are
 * started with the three probes every test has, each as a bundled plugin, so it holds every permission it declares.
 */
async function platform(t: TestContext, extra: ReturnType<typeof probe>[] = [], places?: AgentWritePlaces) {
  const home = mkdtempSync(join(tmpdir(), "host-events-")), file = join(home, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), actions = pluginActions(store, DEMO_PROJECT_ID), privateStorage = new SqlitePluginPrivateStorage(store.db);
  const ports = { db: store.db, appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent(event),
    eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const running = createPluginPlatform({ actions, project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, journal: store,
    artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports), ui: new UiHost(),
    privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest), home: null });
  const queue = new AgentReviewQueue(), forwarder = reviewSettlementForwarder(running.hostEvents);
  forwarder.update(listener => observeReviewSettlements(queue, DEMO_PROJECT_ID, listener, places));
  const failures: PluginEventDeliveryFailure[] = [];
  running.hostEvents.observeFailures(failure => failures.push(failure));
  t.after(async () => {
    forwarder.stop();
    try {
      await running.closeCoordination();
      for (const instance of running.runtime.list()) if (instance.state === "running") await running.runtime.stop(instance.install_id);
    } finally { store.close(); rmSync(home, { recursive: true, force: true }); }
  });
  const asker = probe(A, [SETTLED]), bystander = probe(B, [SETTLED]), deaf = probe(C, []), all = [asker, bystander, deaf, ...extra];
  const report = await running.start(all.map(item => ({ definition: item.definition, bundled: true })));
  assert.deepEqual(report.running.toSorted(), all.map(item => item.definition.manifest.plugin_id).toSorted(), JSON.stringify(report));
  const installOf = (pluginId: string) => running.runtime.list().find(install => install.plugin_id === pluginId)!;
  let counter = 0;
  /** A plugin operation `who` asks for now, still waiting for a person. */
  const request = (who: ReturnType<typeof probe>, projectId = DEMO_PROJECT_ID, expiresAt: string | null = null) => {
    const reviewId = `review-${++counter}`, pluginId = who.definition.manifest.plugin_id, asked = who.state.activation;
    queue.request({ review_id: reviewId, run: null, project_id: projectId, plugin_id: pluginId, kind: "tool-operation",
      operation: { kind: "git-operation", operation_id: `operation-${counter}`, workspace_id: "w" },
      document: { kind: "tool-operation", tool: "git-commit", summary: "提交暂存区", fields: [] }, requested_at: "2026-10-22T00:00:00Z", expires_at: expiresAt },
    { plugin_id: pluginId, install_id: installOf(pluginId).install_id, holds: () => asked.live });
    return reviewId;
  };
  /** A plugin operation `who` asks for now, approved by a person and handed to its execution owner. */
  const ask = (who: ReturnType<typeof probe>, projectId = DEMO_PROJECT_ID) => {
    const reviewId = request(who, projectId);
    queue.decide({ review_id: reviewId, decision: "approve", actor_id: "owner" });
    queue.consumeApproval(reviewId);
    return reviewId;
  };
  const settled = async () => { await running.hostEvents.drain(); };
  return { running, queue, asker, bystander, deaf, request, ask, settled, failures, installOf, client: actions.client, db: store.db };
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

test("X6-05 S-54 a crashing installation gets nothing queued for it, even while its own stop hook is still running", async t => {
  const { running, queue, asker, ask, settled, failures, installOf } = await platform(t);
  // The first handler holds the queue, the second waits behind it; then the installation crashes.
  const entered = deferred(), stopHook = deferred();
  asker.state.handle = async (_record, context) => { entered.resolve(); await new Promise(resolve => context.signal.addEventListener("abort", resolve)); };
  const first = ask(asker), second = ask(asker);
  queue.settle(first, { ok: true });
  queue.settle(second, { ok: true });
  await entered.promise;
  asker.state.handle = undefined;
  // A crash stops the executor first and only then forgets the contribution, so the plugin's stop hook runs while the
  // installation still reads as running: the second must not reach it then.
  asker.state.stopping = stopHook.promise;
  const crashed = running.runtime.reportCrash(installOf(A).install_id);
  try {
    await settled();
    assert.deepEqual(asker.heard().map(record => record.correlation_id), [first], "queued before the crash, dropped at dispatch");
    assert.equal(failures.at(-1)?.code, "plugin.subscriber_revoked");
  } finally { stopHook.resolve(); }
  assert.equal((await crashed).install.state, "crashed");
});

test("X6-06 S-54 an Agent's own change sends no settlement to anyone, and a review restored from history sends nothing at all", async t => {
  const watching = watcher(W);
  const { queue, asker, bystander, deaf, settled } = await platform(t, [watching], places({ "run-1": "/repo" }));
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
  await placed();
  await settled();
  // The restored ones ran in an earlier process, before anything running now started: no workspace change to announce either.
  for (const item of [asker, bystander, deaf]) assert.deepEqual(item.heard(), [], item.definition.manifest.plugin_id);
  assert.deepEqual(watching.heard().map(record => record.payload), [{ workspace_id: "w", cause: "agent-change" }], "only the Agent's own change, as a workspace change (BL-366)");
});

/** An Agent's write is placed after the settlement returns: let that finish before the host events drain. */
const placed = () => new Promise(resolve => setImmediate(resolve));

/** The places an Agent's write is matched against: each round's frozen directory, and the project's one workspace `w` at `/repo`. */
function places(rounds: Record<string, string>, gate?: Promise<unknown>): AgentWritePlaces {
  return {
    async runDirectory(run) { await gate; return rounds[run.run_id] ?? null; },
    async workspaces() { return [{ workspace_id: "w", canonical_path: "/repo", realpath_verified: true, display_name: "repo" },
      { workspace_id: "w-docs", canonical_path: "/repo/docs", realpath_verified: true, display_name: "docs" }]; },
  };
}

test("RAC-331 BL-366 S-54 an Agent's approved write is announced to the workspace it landed in, whatever its outcome; one that never ran, another project's, or one outside every workspace is not", async t => {
  const watching = watcher(W);
  const { queue, asker, bystander, deaf, settled } = await platform(t, [watching], places({ "run-1": "/repo", "run-2": "/elsewhere" }));
  let counter = 0;
  const agent = (document: Parameters<AgentReviewQueue["request"]>[0]["document"], options: { run?: string; project?: string } = {}) => {
    const reviewId = `agent-${++counter}`;
    queue.request({ review_id: reviewId, run: { run_id: options.run ?? "run-1", session_id: "s-1" }, project_id: options.project ?? DEMO_PROJECT_ID, plugin_id: A,
      kind: document.kind, document, requested_at: "2026-10-23T00:00:00Z", expires_at: null });
    return reviewId;
  };
  const approve = (reviewId: string) => { queue.decide({ review_id: reviewId, decision: "approve", actor_id: "owner" }); queue.consumeApproval(reviewId); return reviewId; };
  const edit = (extra: object = {}) => ({ kind: "text-edit" as const, target_path: "a.ts", exists: true, before_text: "a", after_text: "b", ...extra });
  const command = { kind: "command" as const, command: "npm", args: ["test"], cwd: ".", timeout_ms: 30000, env_allowlist: ["PATH"] };
  const heard = () => watching.heard().map(record => record.payload);

  queue.settle(approve(agent(edit())), { ok: true });
  queue.settle(approve(agent(command)), { ok: false, error: "失败" });
  queue.uncertain(approve(agent(command)), "结果未确认");
  // A subtask's root inside the project names the deepest workspace that holds it; an integration names its target.
  queue.settle(approve(agent(edit({ workspace_path: "/repo/docs/guide" }), { run: "run-2" })), { ok: true });
  queue.settle(approve(agent({ kind: "git-integration", source: { session_id: "s-1", run_id: "run-3", subagent_id: "sub", branch: "b", base_commit: "c", directory: "/elsewhere" },
    target_directory: "/repo", files: [] }, { run: "run-3" })), { ok: true });
  await placed(); await settled();
  // Each write is placed on its own, so they may arrive in any order.
  assert.deepEqual(heard().map(payload => JSON.stringify(payload)).toSorted(), [
    { workspace_id: "w", cause: "agent-change" }, { workspace_id: "w", cause: "agent-change" }, { workspace_id: "w", cause: "agent-change" },
    { workspace_id: "w", cause: "agent-change" }, { workspace_id: "w-docs", cause: "agent-change" },
  ].map(payload => JSON.stringify(payload)));

  // Refusals: rejected (never ran), another project's, a round whose directory is outside every workspace, a subtask's own worktree,
  // a round that is gone, and kinds that write no directory. (A review with no round is refused when asked: the queue needs one.)
  const rejected = agent(edit());
  queue.decide({ review_id: rejected, decision: "reject", actor_id: "owner" });
  queue.settle(approve(agent(edit(), { project: "another-project" })), { ok: true });
  queue.settle(approve(agent(edit(), { run: "run-2" })), { ok: true });
  queue.settle(approve(agent(edit({ workspace_path: "/tmp/subtask" }))), { ok: true });
  queue.settle(approve(agent(edit(), { run: "run-gone" })), { ok: true });
  queue.settle(approve(agent({ kind: "tool-operation", tool: "open", summary: "打开", fields: [] })), { ok: true });
  queue.settle(approve(agent({ kind: "mcp", server: "s", tool: "t", arguments_json: "{}" })), { ok: true });
  await placed(); await settled();
  assert.equal(heard().length, 5, JSON.stringify(heard()));
  // The payload names the workspace and the cause only; nobody is addressed a settlement for an Agent's write.
  for (const item of [asker, bystander, deaf]) assert.deepEqual(item.heard(), [], item.definition.manifest.plugin_id);
});

test("RAC-331 BL-366 S-54 an Agent's write still being placed when the Host stops forwarding is not announced", async t => {
  const watching = watcher(W);
  let open!: () => void;
  const gate = new Promise<void>(resolve => { open = resolve; });
  const { queue, settled, running } = await platform(t, [watching], places({ "run-1": "/repo" }, gate));
  const forwarder = reviewSettlementForwarder(running.hostEvents);
  forwarder.update(listener => observeReviewSettlements(queue, DEMO_PROJECT_ID, listener, places({ "run-1": "/repo" }, gate)));
  queue.request({ review_id: "late", run: { run_id: "run-1", session_id: "s-1" }, project_id: DEMO_PROJECT_ID, plugin_id: A, kind: "text-edit",
    document: { kind: "text-edit", target_path: "a.ts", exists: true, before_text: "a", after_text: "b" }, requested_at: "2026-10-23T00:00:00Z", expires_at: null });
  queue.decide({ review_id: "late", decision: "approve", actor_id: "owner" });
  queue.consumeApproval("late");
  queue.settle("late", { ok: true });
  forwarder.stop();
  open();
  await placed(); await settled();
  // The helper's own forwarder still runs: it alone announces the write, once.
  assert.deepEqual(watching.heard().map(record => record.payload), [{ workspace_id: "w", cause: "agent-change" }]);
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

test("X6-05 S-54 a workspace change is not kept for a stopped, disabled or reinstalled subscriber, and never starts one", async t => {
  const watching = watcher(W);
  const { running, queue, asker, ask, settled, installOf } = await platform(t, [watching]);
  const install = () => installOf(W).install_id;
  // Stopped.
  await running.runtime.stop(install());
  const starts = watching.state.starts;
  queue.settle(ask(asker), { ok: true });
  await settled();
  assert.equal(watching.state.starts, starts, "never started for a broadcast");
  await running.runtime.start(install());
  await settled();
  assert.deepEqual(watching.heard(), [], "nor replayed once it runs again");
  // Disabled.
  running.supervisor.revoke(W);
  queue.settle(ask(asker), { ok: true });
  await settled();
  await running.supervisor.enable(W);
  await settled();
  assert.deepEqual(watching.heard(), [], "enabling again replays nothing");
  // Queued, then reinstalled before dispatch: the first handler holds the queue, the second waits behind it.
  const entered = deferred(), release = deferred();
  watching.state.handle = async () => { entered.resolve(); await release.promise; };
  queue.settle(ask(asker), { ok: true });
  queue.settle(ask(asker), { ok: true });
  await entered.promise;
  watching.state.handle = undefined;
  await running.runtime.stop(install());
  await running.runtime.uninstall(install());
  running.runtime.install({ definition: watching.definition, deployment: "local", grants: [], bundled: true });
  await running.runtime.start(install());
  release.resolve();
  await settled();
  assert.equal(watching.heard().length, 1, "the second was queued for the installation before the reinstall");
});

test("X6-08 S-54 a workspace change goes only to a subscriber that holds workspace:read, declared and granted", async t => {
  const watching = watcher(W), switchedOff = watcher(V);
  const { running, queue, asker, ask, settled, installOf } = await platform(t, [watching, switchedOff]);
  // The person switched the optional permission off: still declared, no longer granted.
  const off = installOf(V).install_id;
  await running.runtime.stop(off);
  running.runtime.grant(off, []);
  await running.runtime.start(off);
  assert.deepEqual(installOf(V).grants, []);
  queue.settle(ask(asker), { ok: true });
  await settled();
  assert.deepEqual(watching.heard().map(record => record.event_type_id), [HOST_WORKSPACE_CHANGED_EVENT]);
  assert.deepEqual(switchedOff.heard(), [], "declared but not granted");
});

test("X6-08 S-54 a workspace change queued while its subscriber held workspace:read is dropped at dispatch once the grant or the declaration is gone", async () => {
  // A running installation whose grants and current Manifest the test changes between queueing and dispatch: a real one cannot
  // change its grants while it runs (`state_invalid`), but the delivery must not rely on that.
  const subscriber = { grants: [READ.permission], permissions: [READ], heard: [] as string[] };
  let hold: { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> } | undefined;
  const contribution: PluginAppContribution = { kind: "app", async onEvent(record) {
    subscriber.heard.push(record.event_id);
    const held = hold;
    hold = undefined;
    if (held) { held.entered.resolve(); await held.release.promise; }
  } };
  const manifest = manifestFor(W, [CHANGED]);
  const lifecycle: PluginHostEventsLifecycle = {
    manifest: () => ({ ...manifest, permissions: subscriber.permissions }),
    contract: () => ({ plugin_id: W, publishes: new Map(), subscribes: [{ ...CHANGED, from_plugin_ids: new Set<string>() }] }),
    generation: () => 1,
    installation: () => ({ install_id: "install-w", installation_generation: "generation-1", version: "1.0.0", running: true, grants: subscriber.grants }),
    enabledPluginIds: () => [W],
    ensureStarted: async () => undefined,
    contribution: () => contribution,
  };
  let counter = 0;
  const events = new PluginHostEvents({ projectId: DEMO_PROJECT_ID, lifecycle, createId: () => `event-${++counter}` });
  const send = () => events.broadcast({ event_type_id: HOST_WORKSPACE_CHANGED_EVENT, type_version: 1, payload: { workspace_id: "w", cause: "plugin-operation" } });
  const withdrawnWhileQueued = async (withdraw: () => void) => {
    const held = hold = { entered: deferred(), release: deferred() }, before = subscriber.heard.length;
    assert.equal(send(), 1);
    await held.entered.promise;
    assert.equal(send(), 1, "queued behind the first while it still holds the permission");
    withdraw();
    held.release.resolve();
    await events.drain();
    assert.equal(subscriber.heard.length, before + 1, "the second is dropped at dispatch");
  };
  await withdrawnWhileQueued(() => { subscriber.grants = []; });
  assert.equal(send(), 0, "nothing is queued while the grant is gone");
  subscriber.grants = [READ.permission];
  await withdrawnWhileQueued(() => { subscriber.permissions = []; });
  assert.equal(send(), 0, "nor while the current Manifest no longer declares it");
  assert.equal(subscriber.heard.length, 2, "in each round only the event dispatched before the withdrawal");
});

test("X6-09 S-54 a workspace change reaches no installation that does not subscribe to it, and none for another project's write", async t => {
  const watching = watcher(W), reader = probe(R, [SETTLED], [READ]);
  const { queue, asker, bystander, deaf, ask, settled } = await platform(t, [watching, reader]);
  queue.settle(ask(asker, "another-project"), { ok: true });
  await settled();
  assert.deepEqual(watching.heard(), [], "another project's write is not this project's to announce");
  queue.settle(ask(bystander), { ok: true });
  await settled();
  assert.equal(watching.heard().length, 1);
  assert.deepEqual(reader.heard(), [], "holds workspace:read, but subscribes only to settlements of its own reviews");
  assert.deepEqual(bystander.heard().map(record => record.event_type_id), [HOST_REVIEW_SETTLED_EVENT], "the asker hears its own settlement only");
  assert.deepEqual(asker.heard(), []);
  assert.deepEqual(deaf.heard(), []);
});

test("X6-10 S-54 a workspace change names only the workspace and the cause: no review, operation, outcome, asker or correlation", async t => {
  const first = watcher(W), second = watcher(V);
  const { running, queue, asker, ask, settled, installOf, db } = await platform(t, [first, second]);
  const reviewId = ask(asker);
  queue.settle(reviewId, { ok: false, error: "失败" });
  await settled();
  const [mine, theirs] = [first, second].map(item => { assert.equal(item.heard().length, 1); return item.heard()[0]!; });
  for (const record of [mine!, theirs!]) {
    assert.equal(record.event_type_id, HOST_WORKSPACE_CHANGED_EVENT);
    assert.deepEqual(Object.keys(record.payload as object).toSorted(), ["cause", "workspace_id"]);
    assert.deepEqual(record.payload, { workspace_id: "w", cause: "plugin-operation" });
    assert.equal(record.correlation_id, null, "a review id would say which review it was");
    assert.equal(record.source_plugin_id, HOST_EVENT_SOURCE);
    assert.equal(record.source_install_id, HOST_EVENT_SOURCE);
    assert.equal(record.sequence, 0, "not in the event log");
    for (const secret of [reviewId, reviewId.replace("review-", "operation-"), A, "failed", "失败"]) {
      assert.equal(JSON.stringify(record).includes(secret), false, secret);
    }
  }
  assert.notEqual(mine!.event_id, theirs!.event_id, "each installation gets a delivery of its own");
  const heard = first.state.heard[0]!;
  assert.equal(heard.context.install_id, installOf(W).install_id);
  assert.equal(heard.context.actor_id, `plugin:${W}`, "as the subscriber itself");
  assert.equal(heard.action, undefined, "outside every action");
  assert.deepEqual(running.events.log(DEMO_PROJECT_ID).filter(record => record.event_type_id.startsWith("host.")), []);
  assert.deepEqual(db.prepare("SELECT event_id FROM plugin_events WHERE event_type_id LIKE 'host.%'").all(), []);
});

test("X6-11 S-54 the type table fixes how a host event is sent: a settlement is never broadcast, a workspace change never addressed", async t => {
  const { running, installOf } = await platform(t);
  const events = running.hostEvents;
  assert.throws(() => events.broadcast({ event_type_id: HOST_REVIEW_SETTLED_EVENT, type_version: 1, payload: {} }),
    { code: "plugin.event_type_invalid", message: /宿主事件 host\.review\.settled@1 只发给指定的安装，不能广播/ });
  assert.throws(() => events.notify({ plugin_id: A, install_id: installOf(A).install_id }, { event_type_id: HOST_WORKSPACE_CHANGED_EVENT, type_version: 1, payload: {} }),
    { code: "plugin.event_type_invalid", message: /宿主事件 host\.workspace\.changed@1 是广播，不能定向发给一个安装/ });
  assert.throws(() => events.broadcast({ event_type_id: "host.workspace.other", type_version: 1, payload: {} }),
    { code: "plugin.event_type_invalid", message: /宿主没有事件 host\.workspace\.other@1/ });
  assert.throws(() => events.broadcast({ event_type_id: HOST_WORKSPACE_CHANGED_EVENT, type_version: 2, payload: {} }),
    { code: "plugin.event_type_invalid", message: /宿主没有事件 host\.workspace\.changed@2/ });
});

test("X6-12 S-54 every settled workspace operation is announced, whatever its outcome and whether its asker still runs; one that never ran is not", async t => {
  const watching = watcher(W);
  const { running, queue, asker, request, ask, settled, installOf } = await platform(t, [watching]);
  queue.settle(ask(asker), { ok: true });
  queue.settle(ask(asker), { ok: false, error: "失败" });
  queue.uncertain(ask(asker), "结果未确认");
  await settled();
  assert.equal(watching.heard().length, 3, "a failed or unknown operation may have written part of its change");
  assert.equal(asker.heard().length, 3, "and the asker hears each of its own settlements");
  // Rejected, withdrawn or expired: decided without running, so never settled.
  const rejected = request(asker), cancelled = request(asker), expired = request(asker, DEMO_PROJECT_ID, "2000-01-01T00:00:00Z");
  queue.decide({ review_id: rejected, decision: "reject", actor_id: "owner" });
  queue.cancel(cancelled, "已撤回");
  assert.equal(queue.receipt(expired)?.status, "expired");
  for (const reviewId of [rejected, cancelled, expired]) assert.throws(() => queue.settle(reviewId, { ok: true }), { message: /没有消费过批准的操作不能记录执行结果/ });
  await settled();
  assert.equal(watching.heard().length, 3);
  // The asker stopped after asking: the operation ran all the same, so the others still hear of it, and the asker does not.
  const afterStop = ask(asker);
  await running.runtime.stop(installOf(A).install_id);
  queue.settle(afterStop, { ok: true });
  await settled();
  assert.equal(watching.heard().length, 4);
  assert.equal(asker.heard().length, 3);
});

test("X6-13 S-54 a Manifest that subscribes to a workspace change must declare workspace:read", () => {
  const parse = (subscribes: PluginEventSubscribeDeclaration[], permissions: PluginPermissionDeclaration[]) =>
    parsePluginManifest({ ...manifestFor(A, [], [], permissions), events: { publishes: [], subscribes } } as PluginManifest);
  assert.doesNotThrow(() => parse([CHANGED], [READ]));
  assert.doesNotThrow(() => parse([CHANGED], [{ ...READ, required: true }]));
  for (const permissions of [[], [{ ...READ, permission: "workspace:write" }]]) {
    assert.throws(() => parse([CHANGED], permissions), { code: "plugin.declaration_invalid", message: /订阅宿主事件 host\.workspace\.changed@1 要声明权限 workspace:read/ });
  }
  assert.doesNotThrow(() => parse([SETTLED], []), "an addressed host event asks for no permission of its own");
});
