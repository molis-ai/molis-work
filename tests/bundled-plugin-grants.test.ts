import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
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

// A plugin that ships with the Host follows the rule every plugin does (user decision 2026-10-18, which replaced 2026-10-10 W3-06 Q2;
// docs/releases/POLICY.md section 7.8): it always holds its Manifest's required permissions, and its optional ones as the person
// leaves them. A fresh install has every optional permission switched on, so a built-in plugin works as it did; one the person
// switches off stays off across starts and builds, and only the actions that need it are unavailable.

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

/** A start-list entry for a plugin that ships with the Host, with the release adapter every such entry has, so each start archives its build. */
function bundled(definition: PluginDefinition, grants?: string[]) {
  return { definition, trust: HOST_BUILD_TRUST, ...grants ? { grants } : {}, releaseArtifact: { capture: () => `fixture-${definition.manifest.version}`, restore: () => definition } };
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
      const report = await bundled.platform.start([{ definition: build("1.0.0", [REQUIRED, OPTIONAL]), trust: { level: "host" } }]);
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

/** Switches the optional permission off the way Settings does: the plugin is stopped while its grants change, then started again. */
async function switchTo(host: ReturnType<typeof hostProcess>, grants: string[]) {
  const installId = host.installId();
  await host.platform.runtime.stop(installId);
  host.platform.runtime.grant(installId, grants);
  await host.platform.runtime.start(installId);
}

test("an optional permission the person switched off stays off at every later start of the same build, which is not refused as a silent grant change",
  withDirectory(async directory => {
    const first = hostProcess(directory);
    try {
      await first.platform.start([bundled(build("1.0.0", [REQUIRED, OPTIONAL]))]);
      await switchTo(first, [REQUIRED.permission]);
      assert.deepEqual(first.grants(), [REQUIRED.permission]);
      assert.equal((await first.availability())?.available, false, "while it is off the action that needs it is unavailable");
    } finally { first.store.close(); }

    for (let start = 2; start <= 4; start++) {
      const next = hostProcess(directory);
      try {
        const report = await next.platform.start([bundled(build("1.0.0", [REQUIRED, OPTIONAL]))]);
        assert.deepEqual(report.failed, [], `start ${start}: plugin.state_invalid would be the refusal of a changed grant by a repeated install`);
        assert.deepEqual(report.running, [PLUGIN_ID], `start ${start}: the plugin runs without the optional permission`);
        assert.deepEqual(next.grants(), [REQUIRED.permission], `start ${start}: the start does not switch it back on`);
        assert.equal((await next.availability())?.available, false);
      } finally { next.store.close(); }
    }
  }));

test("an optional permission the person switched back on stays on at the next start", withDirectory(async directory => {
  const first = hostProcess(directory);
  try {
    await first.platform.start([bundled(build("1.0.0", [REQUIRED, OPTIONAL]))]);
    await switchTo(first, [REQUIRED.permission]);
    await switchTo(first, [REQUIRED.permission, OPTIONAL.permission]);
  } finally { first.store.close(); }

  const second = hostProcess(directory);
  try {
    const report = await second.platform.start([bundled(build("1.0.0", [REQUIRED, OPTIONAL]))]);
    assert.deepEqual(report.running, [PLUGIN_ID]);
    assert.deepEqual(second.grants(), [OPTIONAL.permission, REQUIRED.permission]);
    assert.deepEqual(await second.availability(), { available: true });
  } finally { second.store.close(); }
}));

test("following a newer build keeps off what the person switched off, switches on an optional permission new to the plugin, and the install stays the same one",
  withDirectory(async directory => {
    const first = hostProcess(directory);
    let installId = "";
    try {
      await first.platform.start([bundled(build("1.0.0", [REQUIRED, OPTIONAL]))]);
      installId = first.installId();
      await switchTo(first, [REQUIRED.permission]);
    } finally { first.store.close(); }

    const second = hostProcess(directory);
    try {
      const report = await second.platform.start([bundled(build("1.1.0", [REQUIRED, OPTIONAL, NEWER]))]);
      assert.deepEqual(report.running, [PLUGIN_ID]);
      assert.equal(second.installId(), installId, "the same installation, so its private data stays attached");
      assert.deepEqual(second.grants(), [NEWER.permission, REQUIRED.permission], "NEWER starts switched on as on a fresh install; OPTIONAL stays off");
      assert.equal((await second.availability())?.available, false);
    } finally { second.store.close(); }
  }));

test("following a newer build that makes a switched-off optional permission required grants it again", withDirectory(async directory => {
  const first = hostProcess(directory);
  try {
    await first.platform.start([bundled(build("1.0.0", [REQUIRED, OPTIONAL]))]);
    await switchTo(first, [REQUIRED.permission]);
  } finally { first.store.close(); }

  const second = hostProcess(directory);
  try {
    const report = await second.platform.start([bundled(build("1.1.0", [REQUIRED, { ...OPTIONAL, required: true }]))]);
    assert.deepEqual(report.running, [PLUGIN_ID]);
    assert.deepEqual(second.grants(), [OPTIONAL.permission, REQUIRED.permission], "a required permission is never the person's to switch off");
    assert.deepEqual(await second.availability(), { available: true });
  } finally { second.store.close(); }
}));

test("a permission a newer bundled build no longer declares is dropped, and the others stay as the person left them", withDirectory(async directory => {
  const first = hostProcess(directory);
  try {
    await first.platform.start([bundled(build("1.0.0", [REQUIRED, OPTIONAL, NEWER]))]);
    assert.deepEqual(first.grants(), [NEWER.permission, OPTIONAL.permission, REQUIRED.permission]);
  } finally { first.store.close(); }

  const second = hostProcess(directory);
  try {
    const report = await second.platform.start([bundled(build("1.1.0", [REQUIRED, OPTIONAL]))]);
    assert.deepEqual(report.running, [PLUGIN_ID]);
    assert.deepEqual(second.grants(), [OPTIONAL.permission, REQUIRED.permission]);
  } finally { second.store.close(); }
}));

// The list a Supervisor entry names for itself is not looked at when the entry is bundled: a fresh install has every optional
// permission switched on, and switching one off is the person's (Settings), not the Host's start list.
test("a bundled entry that names fewer grants than its Manifest declares is installed with every declared permission", withDirectory(async directory => {
  const first = hostProcess(directory);
  try {
    const report = await first.platform.start([{ definition: build("1.0.0", [REQUIRED, OPTIONAL]), trust: { level: "host" }, grants: [REQUIRED.permission] }]);
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
      const report = await host.platform.start([{ definition: build("1.0.0", [REQUIRED, OPTIONAL]), trust: { level: "host" }, grants: [REQUIRED.permission] }]);
      outcomes.push({ failed: report.failed.map(failure => failure.code), running: report.running, grants: host.grants() });
    } finally { host.store.close(); }
  }
  const every = { failed: [], running: [PLUGIN_ID], grants: [OPTIONAL.permission, REQUIRED.permission] };
  assert.deepEqual(outcomes, [every, every, every, every, every], "a repeated install is not a silent grant change (plugin.state_invalid), whichever start it is");
}));

test("PluginRuntime.install with host trust records every declared permission whatever grants it is given, and installing again replays; without it the install records what it is given",
  () => {
    const declared = [OPTIONAL.permission, REQUIRED.permission];
    for (const given of [undefined, [], [REQUIRED.permission], declared]) {
      const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { hostIds: ISOLATED_HOST_IDS });
      const definition = build("1.0.0", [REQUIRED, OPTIONAL]);
      const label = JSON.stringify(given);
      const installed = runtime.install({ definition, deployment: "local", trust: { level: "host" }, ...(given ? { grants: given } : {}) });
      assert.deepEqual(installed.install.grants, declared, `grants ${label}: a plugin that ships with the Host holds what its Manifest declares`);
      for (const again of [undefined, [REQUIRED.permission], declared]) {
        const repeated = runtime.install({ definition, deployment: "local", trust: { level: "host" }, ...(again ? { grants: again } : {}) });
        assert.equal(repeated.replayed, true, `grants ${label}, then ${JSON.stringify(again)}: the same build again changes nothing`);
        assert.deepEqual(repeated.install.grants, declared);
      }
    }

    const other = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { hostIds: ISOLATED_HOST_IDS });
    const definition = build("1.0.0", [REQUIRED, OPTIONAL]);
    assert.deepEqual(other.install({ trust: { level: "unsigned" }, definition, deployment: "local", grants: [REQUIRED.permission] }).install.grants, [REQUIRED.permission], "any other plugin gets what it was given");
    assert.throws(() => other.install({ trust: { level: "unsigned" }, definition, deployment: "local", grants: declared }),
      (error: unknown) => (error as { code?: string }).code === "plugin.state_invalid", "and a repeated install that names other grants is still a silent grant change");
  });

test("PluginRuntime.install with host trust keeps a record's switched-off optional permission, and following a build switches on only what the record's own build did not declare",
  () => {
    const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { hostIds: ISOLATED_HOST_IDS });
    const definition = build("1.0.0", [REQUIRED, OPTIONAL]);
    const installId = runtime.install({ definition, deployment: "local", trust: { level: "host" } }).install.install_id;
    runtime.grant(installId, [REQUIRED.permission]);
    const again = runtime.install({ definition, deployment: "local", trust: { level: "host" } });
    assert.equal(again.replayed, true, "the same build again is not a silent grant change");
    assert.deepEqual(again.install.grants, [REQUIRED.permission]);

    const followed = runtime.install({ definition: build("1.1.0", [REQUIRED, OPTIONAL, NEWER]), deployment: "local", trust: { level: "host" },
      declared_before: [REQUIRED.permission, OPTIONAL.permission] });
    assert.equal(followed.install.install_id, installId);
    assert.deepEqual(followed.install.grants, [NEWER.permission, REQUIRED.permission]);
  });

test("PluginRuntime.install with host trust, not told what the record's own build declared, switches on no optional permission when it follows a build", () => {
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { hostIds: ISOLATED_HOST_IDS });
  const installId = runtime.install({ definition: build("1.0.0", [REQUIRED, OPTIONAL]), deployment: "local", trust: { level: "host" } }).install.install_id;
  runtime.grant(installId, [REQUIRED.permission]);
  const followed = runtime.install({ definition: build("1.1.0", [REQUIRED, OPTIONAL, NEWER]), deployment: "local", trust: { level: "host" } });
  assert.deepEqual(followed.install.grants, [REQUIRED.permission], "OPTIONAL may be one the person switched off, so neither it nor NEWER is switched on");
});

// Every permission without asking is for code the Host ships. Sandboxed code is generated or installed from outside and runs in
// isolation: what it may do is what the person confirmed, never what its Manifest declares. A start list that marks such a
// definition `host` (a mistake in the Host's own composition) is refused rather than honoured as a grant of everything.
test("a sandboxed definition is never granted everything because an entry gives it host trust: the install is refused, with grants or without, and the supervisor records nothing",
  withDirectory(async directory => {
    const sandboxed = { ...build("1.0.0", [REQUIRED, OPTIONAL]), execution: "sandbox" as const };
    const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { hostIds: ISOLATED_HOST_IDS });
    for (const grants of [undefined, [], [REQUIRED.permission], [OPTIONAL.permission, REQUIRED.permission]]) {
      assert.throws(() => runtime.install({ definition: sandboxed, deployment: "local", trust: { level: "host" }, ...(grants ? { grants } : {}) }),
        (error: unknown) => (error as { code?: string }).code === "plugin.grant_denied", `grants ${JSON.stringify(grants)}`);
    }
    assert.deepEqual(runtime.list(), []);
    // Not host trust, with the grants the person confirmed: unchanged, and it holds exactly those.
    assert.deepEqual(runtime.install({ trust: { level: "unsigned" }, definition: sandboxed, deployment: "local", grants: [REQUIRED.permission] }).install.grants, [REQUIRED.permission]);

    const host = hostProcess(directory);
    try {
      const report = await host.platform.start([{ definition: sandboxed, trust: { level: "host" }, grants: [REQUIRED.permission] }]);
      assert.deepEqual(report.running, []);
      assert.deepEqual(report.failed.map(failure => failure.code), ["plugin.grant_denied"]);
      assert.deepEqual(host.platform.runtime.list(), [], "nothing was installed, so nothing holds a permission");
    } finally { host.store.close(); }
  }));
