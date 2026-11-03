import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { DEMO_PROJECT_ID, LocalProjectDatabase, createPluginPlatform, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { HOST_BUILD_TRUST, MemoryPluginRuntimeRepository, PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";

// PG-002 (specs/repository-anti-corruption/slices/pg002-plugin-permission-settings.md): the person's switch for one optional permission,
// `PluginRuntime.regrant`. The grants change only while no activation holds the old ones, so a running plugin is stopped, given the new
// grants and started again as one step; taking a permission away withdraws the live activation's authority at once and the new grants
// are saved before anything is stopped. These tests drive the Runtime itself and, for the in-flight call, a real platform.

const PLUGIN_ID = "io.molis.work.example.regrant";
const REQUIRED = { permission: "regrant:required", required: true, reason: "插件没有它就不能运行" } as const;
const OPTIONAL = { permission: "regrant:optional", required: false, reason: "缺它时插件只能做一部分事" } as const;
const OTHER = { permission: "regrant:other", required: false, reason: "另一项可选能力" } as const;
const CALLER_PERMISSIONS = [REQUIRED.permission, OPTIONAL.permission, OTHER.permission];

const USE_OPTIONAL: ActionDefinition<Record<string, never>, string> = {
  capability_id: "regrant.use-optional", version: 1, operation: "query",
  action: { title: "用可选权限", description: "只有拿到可选权限才可用", kind: "query", scope: "project", audiences: ["user"], permissions: [OPTIONAL.permission],
    subject_kinds: [], input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "string" } },
};

interface Probe { starts: string[][]; stops: number; failStart: boolean; failStop: boolean; action?: (context: { beforeEffect(): Promise<void> }) => Promise<string> }

function build(version: string, permissions: PluginManifest["permissions"], probe: Probe, withAction = true): PluginDefinition {
  const manifest: PluginManifest = {
    schema_version: 2, host_api_version: 2, plugin_id: PLUGIN_ID, version, name: "Regrant fixture", kind: "app",
    publisher: { publisher_id: "molis", signature: "regrant-fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions, capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: withAction ? [USE_OPTIONAL] : [],
  };
  return {
    manifest,
    async start(context) {
      probe.starts.push([...context.grants]);
      if (probe.failStart && probe.starts.length > 1) throw new Error("the second start fails");
      return { kind: "app", views: [], actions: withAction ? [{ ...USE_OPTIONAL, handle: (caller: { beforeEffect(): Promise<void> }) => probe.action ? probe.action(caller) : "used" }] : [] };
    },
    async stop() { probe.stops++; if (probe.failStop) throw new Error("stop fails"); },
  };
}

const newProbe = (): Probe => ({ starts: [], stops: 0, failStart: false, failStop: false });

/** A running plugin of the Host's build in a bare Runtime, the way a switch finds it. */
async function running(probe: Probe, permissions: PluginManifest["permissions"] = [REQUIRED, OPTIONAL, OTHER]) {
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { hostIds: ISOLATED_HOST_IDS });
  const installId = runtime.install({ definition: build("1.0.0", permissions, probe, false), deployment: "local", trust: { level: "host" } }).install.install_id;
  await runtime.start(installId);
  return { runtime, installId };
}

test("RAC-940 switching off an optional permission of a running plugin leaves the same installation running, started again on the new grants", async () => {
  const probe = newProbe(), { runtime, installId } = await running(probe);
  const before = runtime.get(installId);
  assert.deepEqual(probe.starts, [[OPTIONAL.permission, OTHER.permission, REQUIRED.permission]]);
  const receipt = await runtime.regrant(installId, OPTIONAL.permission, false);
  const after = runtime.get(installId);
  assert.deepEqual(after.grants, [OTHER.permission, REQUIRED.permission]);
  assert.equal(after.state, "running");
  assert.equal(after.install_id, before.install_id);
  assert.equal(after.installation_generation, before.installation_generation, "the same installation, so its private data stays attached");
  assert.equal(receipt.operation, "start");
  assert.equal(probe.stops, 1, "the old activation was stopped");
  assert.deepEqual(probe.starts.at(-1), [OTHER.permission, REQUIRED.permission], "the new activation holds a snapshot without the permission");
});

test("RAC-941 a required permission cannot be switched off and a permission the Manifest does not declare cannot be switched either way", async () => {
  const probe = newProbe(), { runtime, installId } = await running(probe);
  const held = [...runtime.get(installId).grants], stamp = runtime.get(installId).updated_at;
  for (const [permission, granted] of [[REQUIRED.permission, false], ["regrant:undeclared", true], ["regrant:undeclared", false], ["", true]] as const) {
    await assert.rejects(runtime.regrant(installId, permission, granted), (error: unknown) => (error as { code?: string }).code === "plugin.grant_denied", `${permission} ${granted}`);
  }
  assert.deepEqual(runtime.get(installId).grants, held, "the refused switch changed nothing");
  assert.equal(runtime.get(installId).updated_at, stamp);
  assert.equal(probe.stops, 0, "and stopped nothing");
  assert.equal(probe.starts.length, 1);
  assert.equal(runtime.get(installId).state, "running");
});

test("RAC-953 setting a permission to the value it has changes nothing: no restart, the same record", async () => {
  const probe = newProbe(), { runtime, installId } = await running(probe);
  const before = runtime.get(installId);
  const receipt = await runtime.regrant(installId, OPTIONAL.permission, true);
  assert.equal(receipt.replayed, true);
  assert.deepEqual(runtime.get(installId), before);
  assert.equal(probe.stops, 0);
  assert.equal(probe.starts.length, 1);
  await runtime.regrant(installId, OPTIONAL.permission, false);
  const off = runtime.get(installId);
  assert.equal((await runtime.regrant(installId, OPTIONAL.permission, false)).replayed, true, "off again is the same");
  assert.deepEqual(runtime.get(installId), off);
  assert.equal(probe.starts.length, 2);
});

test("RAC-944 switching a permission back on within the Manifest is held by the new activation; a stopped plugin only has its grants saved", async () => {
  const probe = newProbe(), { runtime, installId } = await running(probe);
  await runtime.regrant(installId, OPTIONAL.permission, false);
  await runtime.regrant(installId, OPTIONAL.permission, true);
  assert.deepEqual(runtime.get(installId).grants, [OPTIONAL.permission, OTHER.permission, REQUIRED.permission]);
  assert.deepEqual(probe.starts.at(-1), [OPTIONAL.permission, OTHER.permission, REQUIRED.permission]);
  assert.equal(runtime.get(installId).state, "running");

  await runtime.stop(installId);
  const stops = probe.stops, starts = probe.starts.length;
  const off = await runtime.regrant(installId, OTHER.permission, false);
  assert.equal(off.operation, "grant");
  assert.equal(runtime.get(installId).state, "disabled", "a stopped plugin stays stopped");
  assert.deepEqual(runtime.get(installId).grants, [OPTIONAL.permission, REQUIRED.permission]);
  await runtime.regrant(installId, OTHER.permission, true);
  assert.deepEqual(runtime.get(installId).grants, [OPTIONAL.permission, OTHER.permission, REQUIRED.permission]);
  assert.equal(probe.stops, stops, "nothing was stopped or started for a plugin that was not running");
  assert.equal(probe.starts.length, starts);
});

test("RAC-943 switching a permission off is kept even when the restart fails or the stop fails", async () => {
  const startFails = newProbe(), a = await running(startFails);
  startFails.failStart = true;
  await assert.rejects(a.runtime.regrant(a.installId, OPTIONAL.permission, false));
  assert.deepEqual(a.runtime.get(a.installId).grants, [OTHER.permission, REQUIRED.permission], "the permission stays off");
  assert.equal(a.runtime.get(a.installId).state, "crashed", "and the failed start is recorded");

  const stopFails = newProbe(), b = await running(stopFails);
  stopFails.failStop = true;
  await assert.rejects(b.runtime.regrant(b.installId, OPTIONAL.permission, false));
  assert.deepEqual(b.runtime.get(b.installId).grants, [OTHER.permission, REQUIRED.permission], "a stop that fails still leaves the permission off");
  assert.equal(b.runtime.get(b.installId).state, "crashed");

  const widen = newProbe(), c = await running(widen);
  await c.runtime.regrant(c.installId, OPTIONAL.permission, false);
  widen.failStop = true;
  await assert.rejects(c.runtime.regrant(c.installId, OPTIONAL.permission, true));
  assert.deepEqual(c.runtime.get(c.installId).grants, [OTHER.permission, REQUIRED.permission], "adding a permission is saved only after the old activation is gone, so a failed stop adds nothing");
});

test("RAC-954 a switch and a stop on the same installation queue on its lock and leave one consistent state", async () => {
  const probe = newProbe(), { runtime, installId } = await running(probe);
  const results = await Promise.allSettled([runtime.regrant(installId, OPTIONAL.permission, false), runtime.stop(installId), runtime.regrant(installId, OTHER.permission, false)]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "fulfilled");
  const record = runtime.get(installId);
  assert.deepEqual(record.grants.includes(OPTIONAL.permission), false, "the first switch landed");
  assert.equal(record.state === "disabled" || record.state === "running", true, `a settled state, not ${record.state}`);
  if (results[2].status === "fulfilled") assert.deepEqual(record.grants, [REQUIRED.permission]);
});

// A real platform, so the call is a real action call that the platform checks before each effect.
function hostProcess(directory: string) {
  const file = join(directory, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const actions = pluginActions(store, DEMO_PROJECT_ID);
  const platform = createPluginPlatform({
    actions, project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, journal: store,
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    ui: new UiHost(), home: null, privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
  });
  const installId = () => platform.runtime.list().find(record => record.plugin_id === PLUGIN_ID)!.install_id;
  const caller = { actor_id: "tester", project_id: DEMO_PROJECT_ID, audience: "user" as const, permissions: CALLER_PERMISSIONS };
  const availability = async () => (await actions.client.discover(caller)).find(row => row.capability_id === USE_OPTIONAL.capability_id)?.availability;
  return { store, platform, actions, caller, installId, availability };
}

test("RAC-942 a call under way when its permission is switched off is refused at its next effect and writes no business record; the others see it unavailable", async () => {
  const directory = mkdtempSync(join(tmpdir(), "regrant-inflight-"));
  const host = hostProcess(directory);
  const written: string[] = [], probe = newProbe();
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  probe.action = async context => { entered.resolve(); await release.promise; await context.beforeEffect(); written.push("business record"); return "used"; };
  try {
    const report = await host.platform.start([{ definition: build("1.0.0", [REQUIRED, OPTIONAL], probe), trust: HOST_BUILD_TRUST }]);
    assert.deepEqual(report.running, [PLUGIN_ID]);
    assert.deepEqual(await host.availability(), { available: true });
    const pending = host.actions.client.invoke(host.caller, USE_OPTIONAL, {});
    const refusal = assert.rejects(pending);
    await entered.promise;
    await host.platform.runtime.regrant(host.installId(), OPTIONAL.permission, false);
    assert.equal((await host.availability())?.available, false, "a new call sees the action unavailable");
    release.resolve();
    await refusal;
    assert.deepEqual(written, [], "the call that was under way wrote nothing");
    assert.deepEqual(host.platform.runtime.list().find(record => record.plugin_id === PLUGIN_ID)!.grants, [REQUIRED.permission]);
    assert.equal(host.platform.runtime.list().find(record => record.plugin_id === PLUGIN_ID)!.state, "running", "the plugin runs on, without the permission");
  } finally { release.resolve(); host.store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("RAC-945 a permission switched off through regrant stays off at the next start of the same build", async () => {
  const directory = mkdtempSync(join(tmpdir(), "regrant-restart-"));
  try {
    const first = hostProcess(directory);
    try {
      await first.platform.start([{ definition: build("1.0.0", [REQUIRED, OPTIONAL], newProbe()), trust: HOST_BUILD_TRUST }]);
      await first.platform.runtime.regrant(first.installId(), OPTIONAL.permission, false);
    } finally { first.store.close(); }
    const second = hostProcess(directory);
    try {
      const report = await second.platform.start([{ definition: build("1.0.0", [REQUIRED, OPTIONAL], newProbe()), trust: HOST_BUILD_TRUST }]);
      assert.deepEqual(report.running, [PLUGIN_ID]);
      assert.deepEqual(second.platform.runtime.get(second.installId()).grants, [REQUIRED.permission]);
      assert.equal((await second.availability())?.available, false);
    } finally { second.store.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
