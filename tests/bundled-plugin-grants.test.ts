import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { DEMO_PROJECT_ID, LocalProjectDatabase, createPluginPlatform, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { MemoryPluginRuntimeRepository, PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";

// A plugin that ships with the Host holds every permission its Manifest declares, "optional" ones included
// (user decision 2026-10-10, W3-06 Q2; docs/releases/POLICY.md section 7.8). "Optional" only says the plugin still works in part
// without the permission, and nothing in the product lets the person switch a built-in permission off one at a time.

const PLUGIN_ID = "io.molis.work.example.bundled-grants";
const REQUIRED = { permission: "grants:required", required: true, reason: "插件没有它就不能运行" } as const;
const OPTIONAL = { permission: "grants:optional", required: false, reason: "缺它时插件只能做一部分事" } as const;
const NEWER = { permission: "grants:newer", required: false, reason: "只有新构建声明的可选能力" } as const;
const CALLER_PERMISSIONS = [REQUIRED.permission, OPTIONAL.permission, NEWER.permission];

const USE_OPTIONAL: ActionDefinition<Record<string, never>, string> = {
  capability_id: "grants.use-optional", version: 1, operation: "query",
  action: { title: "用可选权限", description: "只有拿到可选权限才可用", kind: "query", scope: "project", audiences: ["user"], permissions: [OPTIONAL.permission],
    subject_kinds: [], input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "string" } },
};

function build(version: string, permissions: PluginManifest["permissions"]): PluginDefinition {
  const manifest: PluginManifest = {
    schema_version: 2, host_api_version: 2, plugin_id: PLUGIN_ID, version, name: "Bundled grants fixture", kind: "app",
    publisher: { publisher_id: "molis", signature: "bundled-grants-fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions, capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [USE_OPTIONAL],
  };
  return { manifest, async start() { return { kind: "app", views: [], actions: [{ ...USE_OPTIONAL, handle: () => "used" }] }; }, async stop() {} };
}

/** One Host process over the project database in `directory`: the platform the way a start builds it. */
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
  const grants = () => platform.runtime.list().find(record => record.plugin_id === PLUGIN_ID)!.grants;
  const installId = () => platform.runtime.list().find(record => record.plugin_id === PLUGIN_ID)!.install_id;
  /** Whether the action that needs the optional permission can be called, as the person's page would see it. */
  const availability = async () => (await actions.client.discover({ actor_id: "tester", project_id: DEMO_PROJECT_ID, audience: "user", permissions: CALLER_PERMISSIONS }))
    .find(row => row.capability_id === USE_OPTIONAL.capability_id)?.availability;
  return { store, platform, grants, installId, availability };
}

function withDirectory(run: (directory: string) => Promise<void>) {
  return async () => {
    const directory = mkdtempSync(join(tmpdir(), "bundled-grants-"));
    try { await run(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
  };
}

test("a bundled plugin is installed with every permission its Manifest declares, so an action that needs an optional one works; any other plugin gets only the required ones",
  withDirectory(async directory => {
    const bundled = hostProcess(directory);
    try {
      const report = await bundled.platform.start([{ definition: build("1.0.0", [REQUIRED, OPTIONAL]), bundled: true }]);
      assert.deepEqual(report.running, [PLUGIN_ID]);
      assert.deepEqual(bundled.grants(), [OPTIONAL.permission, REQUIRED.permission]);
      assert.deepEqual(await bundled.availability(), { available: true });
    } finally { bundled.store.close(); }

    mkdirSync(join(directory, "other"));
    const other = hostProcess(join(directory, "other"));
    try {
      const report = await other.platform.start([{ definition: build("1.0.0", [REQUIRED, OPTIONAL]) }]);
      assert.deepEqual(report.running, [PLUGIN_ID]);
      assert.deepEqual(other.grants(), [REQUIRED.permission], "a plugin the Host does not ship asks for its optional permissions in the market");
      assert.equal((await other.availability())?.available, false);
    } finally { other.store.close(); }
  }));

test("a start of the same build whose record holds fewer permissions completes them, and does not refuse to start as a silent grant change",
  withDirectory(async directory => {
    const first = hostProcess(directory);
    try {
      await first.platform.start([{ definition: build("1.0.0", [REQUIRED, OPTIONAL]) }]);
      assert.deepEqual(first.grants(), [REQUIRED.permission], "the record an earlier build left holds the required permission only");
    } finally { first.store.close(); }

    const second = hostProcess(directory);
    try {
      const report = await second.platform.start([{ definition: build("1.0.0", [REQUIRED, OPTIONAL]), bundled: true }]);
      assert.deepEqual(report.failed, [], "plugin_state_invalid would be the refusal of a changed grant by a repeated install");
      assert.deepEqual(report.running, [PLUGIN_ID]);
      assert.deepEqual(second.grants(), [OPTIONAL.permission, REQUIRED.permission]);
      assert.deepEqual(await second.availability(), { available: true });
    } finally { second.store.close(); }
  }));

test("following a newer build of a bundled plugin grants everything the new Manifest declares, and the install stays the same one",
  withDirectory(async directory => {
    const first = hostProcess(directory);
    let installId = "";
    try {
      await first.platform.start([{ definition: build("1.0.0", [REQUIRED, OPTIONAL]) }]);
      installId = first.installId();
      assert.deepEqual(first.grants(), [REQUIRED.permission]);
    } finally { first.store.close(); }

    const second = hostProcess(directory);
    try {
      const report = await second.platform.start([{ definition: build("1.1.0", [REQUIRED, OPTIONAL, NEWER]), bundled: true }]);
      assert.deepEqual(report.running, [PLUGIN_ID]);
      assert.equal(second.installId(), installId, "the same installation, so its private data stays attached");
      assert.deepEqual(second.grants(), [NEWER.permission, OPTIONAL.permission, REQUIRED.permission]);
      assert.deepEqual(await second.availability(), { available: true });
    } finally { second.store.close(); }
  }));

test("a bundled plugin whose permission the person narrowed with runtime.grant gets it back at the next start", withDirectory(async directory => {
  const first = hostProcess(directory);
  try {
    await first.platform.start([{ definition: build("1.0.0", [REQUIRED, OPTIONAL]), bundled: true }]);
    const installId = first.installId();
    await first.platform.runtime.stop(installId);
    first.platform.runtime.grant(installId, [REQUIRED.permission]);
    await first.platform.runtime.start(installId);
    assert.deepEqual(first.grants(), [REQUIRED.permission]);
    assert.equal((await first.availability())?.available, false, "while it is narrowed the action is unavailable");
  } finally { first.store.close(); }

  const second = hostProcess(directory);
  try {
    const report = await second.platform.start([{ definition: build("1.0.0", [REQUIRED, OPTIONAL]), bundled: true }]);
    assert.deepEqual(report.failed, []);
    assert.deepEqual(second.grants(), [OPTIONAL.permission, REQUIRED.permission]);
    assert.deepEqual(await second.availability(), { available: true });
  } finally { second.store.close(); }
}));

test("a permission a newer bundled build no longer declares is dropped, and the others stay granted", withDirectory(async directory => {
  const first = hostProcess(directory);
  try {
    await first.platform.start([{ definition: build("1.0.0", [REQUIRED, OPTIONAL, NEWER]), bundled: true }]);
    assert.deepEqual(first.grants(), [NEWER.permission, OPTIONAL.permission, REQUIRED.permission]);
  } finally { first.store.close(); }

  const second = hostProcess(directory);
  try {
    const report = await second.platform.start([{ definition: build("1.1.0", [REQUIRED, OPTIONAL]), bundled: true }]);
    assert.deepEqual(report.running, [PLUGIN_ID]);
    assert.deepEqual(second.grants(), [OPTIONAL.permission, REQUIRED.permission]);
  } finally { second.store.close(); }
}));

// The list a Supervisor entry names for itself is not looked at when the entry is bundled: a first install that honoured it would be a
// narrower record than the rule leaves, the next start would widen it (recordToFollow), and the start after that would meet a repeated
// install whose own list differs from the record and refuse it as a silent grant change (plugin_state_invalid).
test("a bundled entry that names fewer grants than its Manifest declares is installed with every declared permission", withDirectory(async directory => {
  const first = hostProcess(directory);
  try {
    const report = await first.platform.start([{ definition: build("1.0.0", [REQUIRED, OPTIONAL]), bundled: true, grants: [REQUIRED.permission] }]);
    assert.deepEqual(report.failed, []);
    assert.deepEqual(report.running, [PLUGIN_ID]);
    assert.deepEqual(first.grants(), [OPTIONAL.permission, REQUIRED.permission], "the entry's own list narrows nothing for a plugin that ships with the Host");
    assert.deepEqual(await first.availability(), { available: true });
  } finally { first.store.close(); }
}));

test("a bundled entry that names fewer grants than its Manifest declares starts again and again, not only the first two times", withDirectory(async directory => {
  const outcomes: Array<{ failed: Array<string | undefined>; running: string[]; grants: string[] }> = [];
  for (let start = 1; start <= 5; start++) {
    const host = hostProcess(directory);
    try {
      const report = await host.platform.start([{ definition: build("1.0.0", [REQUIRED, OPTIONAL]), bundled: true, grants: [REQUIRED.permission] }]);
      outcomes.push({ failed: report.failed.map(failure => failure.code), running: report.running, grants: host.grants() });
    } finally { host.store.close(); }
  }
  const every = { failed: [], running: [PLUGIN_ID], grants: [OPTIONAL.permission, REQUIRED.permission] };
  assert.deepEqual(outcomes, [every, every, every, every, every], "a repeated install is not a silent grant change (plugin_state_invalid), whichever start it is");
}));

test("PluginRuntime.install with bundled records every declared permission whatever grants it is given, and installing again replays; without bundled it records what it is given",
  () => {
    const declared = [OPTIONAL.permission, REQUIRED.permission];
    for (const given of [undefined, [], [REQUIRED.permission], declared]) {
      const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository());
      const definition = build("1.0.0", [REQUIRED, OPTIONAL]);
      const label = JSON.stringify(given);
      const installed = runtime.install({ definition, deployment: "local", bundled: true, ...(given ? { grants: given } : {}) });
      assert.deepEqual(installed.install.grants, declared, `grants ${label}: a plugin that ships with the Host holds what its Manifest declares`);
      for (const again of [undefined, [REQUIRED.permission], declared]) {
        const repeated = runtime.install({ definition, deployment: "local", bundled: true, ...(again ? { grants: again } : {}) });
        assert.equal(repeated.replayed, true, `grants ${label}, then ${JSON.stringify(again)}: the same build again changes nothing`);
        assert.deepEqual(repeated.install.grants, declared);
      }
    }

    const other = new PluginRuntime(new MemoryPluginRuntimeRepository());
    const definition = build("1.0.0", [REQUIRED, OPTIONAL]);
    assert.deepEqual(other.install({ definition, deployment: "local", grants: [REQUIRED.permission] }).install.grants, [REQUIRED.permission], "any other plugin gets what it was given");
    assert.throws(() => other.install({ definition, deployment: "local", grants: declared }),
      (error: unknown) => (error as { code?: string }).code === "plugin.state_invalid", "and a repeated install that names other grants is still a silent grant change");
  });

// Every permission without asking is for code the Host ships. Sandboxed code is generated or installed from outside and runs in
// isolation: what it may do is what the person confirmed, never what its Manifest declares. A start list that marks such a
// definition `bundled` (a mistake in the Host's own composition) is refused rather than honoured as a grant of everything.
test("a sandboxed definition is never granted everything because an entry calls it bundled: the install is refused, with grants or without, and the supervisor records nothing",
  withDirectory(async directory => {
    const sandboxed = { ...build("1.0.0", [REQUIRED, OPTIONAL]), execution: "sandbox" as const };
    const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository());
    for (const grants of [undefined, [], [REQUIRED.permission], [OPTIONAL.permission, REQUIRED.permission]]) {
      assert.throws(() => runtime.install({ definition: sandboxed, deployment: "local", bundled: true, ...(grants ? { grants } : {}) }),
        (error: unknown) => (error as { code?: string }).code === "plugin.grant_denied", `grants ${JSON.stringify(grants)}`);
    }
    assert.deepEqual(runtime.list(), []);
    // Not bundled, with the grants the person confirmed: unchanged, and it holds exactly those.
    assert.deepEqual(runtime.install({ definition: sandboxed, deployment: "local", grants: [REQUIRED.permission] }).install.grants, [REQUIRED.permission]);

    const host = hostProcess(directory);
    try {
      const report = await host.platform.start([{ definition: sandboxed, bundled: true, grants: [REQUIRED.permission] }]);
      assert.deepEqual(report.running, []);
      assert.deepEqual(report.failed.map(failure => failure.code), ["plugin.grant_denied"]);
      assert.deepEqual(host.platform.runtime.list(), [], "nothing was installed, so nothing holds a permission");
    } finally { host.store.close(); }
  }));
