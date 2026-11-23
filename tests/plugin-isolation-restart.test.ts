import { HOST_STAND_IN_IDS, ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from "node:assert/strict";
import test from "node:test";
import type {
  PluginAppContribution,
  PluginContribution,
  PluginDefinition,
  PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import { PluginRuntime, PluginSupervisor } from "@molis-ai/molis-work-plugin-runtime";

function view(pluginId: string, viewId: string): UiContribution {
  return {
    descriptor: {
      contribution_id: `${pluginId}.${viewId}`,
      kind: "primary-page",
      label: viewId,
      slots: [],
    },
    render: () => `<section data-view="${viewId}"></section>`,
  };
}

function appManifest(input: {
  id: string;
  provides?: string[];
  requires?: Array<{ capability_id: string; version: number }>;
}): PluginManifest {
  const requires = (input.requires ?? []).map((requirement) => ({
    ...requirement,
    reason: "测试依赖",
  }));
  return {
    schema_version: 1,
    host_api_version: 1,
    plugin_id: input.id,
    version: "1.0.0",
    name: input.id,
    kind: "app",
    publisher: { publisher_id: "molis", signature: `${input.id}-binding` },
    entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [],
    capabilities: {
      provides: input.provides ?? [],
      consumes: requires.map((requirement) => requirement.capability_id),
    },
    artifacts: { produces: [], consumes: [] },
    ui: {
      contributions: [`${input.id}.main`],
      views: [{ view_id: "main", slot: "stage", title: "Main" }],
    },
    ...(requires.length > 0 ? { requires } : {}),
  };
}

interface Probe {
  definition: PluginDefinition;
  starts: () => number;
}

function appPlugin(input: {
  id: string;
  provides?: string[];
  requires?: Array<{ capability_id: string; version: number }>;
  failUntil?: number;
  contribution?: (manifest: PluginManifest) => PluginContribution;
}): Probe {
  const manifest = appManifest(input);
  let starts = 0;
  const definition: PluginDefinition = {
    manifest,
    async start() {
      starts += 1;
      if (input.failUntil !== undefined && starts <= input.failUntil) {
        const error = new Error(`${input.id} 启动失败`) as Error & { code: string };
        error.code = "plugin_entry_failed";
        throw error;
      }
      if (input.contribution) return input.contribution(manifest);
      const contribution: PluginAppContribution = {
        kind: "app",
        views: [view(input.id, "main")],
      };
      return contribution;
    },
    async stop() {},
  };
  return { definition, starts: () => starts };
}

test("one Plugin's start failure leaves its siblings running and names a reason", async () => {
  const healthy = appPlugin({ id: "com.example.healthy" });
  const broken = appPlugin({ id: "com.example.broken", failUntil: 1 });
  const supervisor = new PluginSupervisor(new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS, releaseIds: HOST_STAND_IN_IDS }));

  const report = await supervisor.start([
    { definition: broken.definition },
    { definition: healthy.definition },
  ]);

  assert.deepEqual(report.running, ["com.example.healthy"]);
  assert.equal(report.failed.length, 1);
  assert.equal(report.failed[0]?.plugin_id, "com.example.broken");
  assert.equal(report.failed[0]?.code, "plugin.executor_failed");
  assert.equal(supervisor.contribution("com.example.healthy")?.kind, "app");
  assert.equal(supervisor.contribution("com.example.broken"), null);
});

test("an explicit restart revives only its own Plugin and keeps siblings untouched", async () => {
  const healthy = appPlugin({ id: "com.example.healthy" });
  const flaky = appPlugin({ id: "com.example.flaky", failUntil: 1 });
  const supervisor = new PluginSupervisor(new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS, releaseIds: HOST_STAND_IN_IDS }));
  await supervisor.start([{ definition: flaky.definition }, { definition: healthy.definition }]);

  const healthyBefore = supervisor.state("com.example.healthy");
  const restarted = await supervisor.restart("com.example.flaky");

  assert.equal(restarted.status, "running");
  assert.equal(supervisor.contribution("com.example.flaky")?.kind, "app");
  assert.deepEqual(supervisor.state("com.example.healthy"), healthyBefore);
  assert.equal(healthy.starts(), 1, "兄弟插件不应被重启牵连");
});

test("concurrent restarts of the same Plugin create exactly one new instance", async () => {
  const flaky = appPlugin({ id: "com.example.flaky", failUntil: 1 });
  const supervisor = new PluginSupervisor(new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS, releaseIds: HOST_STAND_IN_IDS }));
  await supervisor.start([{ definition: flaky.definition }]);
  assert.equal(flaky.starts(), 1);

  const [left, right] = await Promise.all([
    supervisor.restart("com.example.flaky"),
    supervisor.restart("com.example.flaky"),
  ]);

  assert.equal(left.status, "running");
  assert.deepEqual(left, right);
  assert.equal(flaky.starts(), 2, "并发重启只应产生一次新的启动");
});

test("restarting a running Plugin stops it first and does not spend the recovery budget", async () => {
  const plugin = appPlugin({ id: "com.example.steady" });
  const runtime = new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS, releaseIds: HOST_STAND_IN_IDS });
  const supervisor = new PluginSupervisor(runtime);
  await supervisor.start([{ definition: plugin.definition }]);

  for (let round = 0; round < 4; round += 1) {
    const state = await supervisor.restart("com.example.steady");
    assert.equal(state.status, "running", `第 ${round + 1} 次重启应仍然成功`);
  }
  assert.equal(plugin.starts(), 5);
  const installId = supervisor.state("com.example.steady")?.install_id;
  assert.ok(installId);
  assert.equal(runtime.get(installId).recovery_count, 0, "显式重启不应消耗崩溃恢复额度");
});

test("a Plugin blocked by an unsatisfied dependency never starts and is not reported as failed", async () => {
  const dependent = appPlugin({
    id: "com.example.dependent",
    requires: [{ capability_id: "missing.v1", version: 1 }],
  });
  const independent = appPlugin({ id: "com.example.independent" });
  const supervisor = new PluginSupervisor(new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS, releaseIds: HOST_STAND_IN_IDS }));

  const report = await supervisor.start([
    { definition: dependent.definition },
    { definition: independent.definition },
  ]);

  assert.deepEqual(report.running, ["com.example.independent"]);
  assert.deepEqual(report.failed, []);
  assert.equal(report.blocked.length, 1);
  assert.equal(report.blocked[0]?.plugin_id, "com.example.dependent");
  assert.equal(report.blocked[0]?.code, "plugin.capability_missing");
  assert.equal(dependent.starts(), 0, "被阻塞的插件不应被执行");
});

test("a Plugin that does not deliver its declared views fails to start", async () => {
  const unredeemed = appPlugin({
    id: "com.example.unredeemed",
    contribution: () => ({ kind: "app", views: [] }),
  });
  const supervisor = new PluginSupervisor(new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS, releaseIds: HOST_STAND_IN_IDS }));
  const report = await supervisor.start([{ definition: unredeemed.definition }]);

  assert.deepEqual(report.running, []);
  assert.equal(report.failed[0]?.code, "plugin.contribution_unredeemed");
  assert.match(report.failed[0]?.message ?? "", /没有兑现/u);
});

test("a Plugin cannot contribute a view its Manifest never declared", async () => {
  const smuggler = appPlugin({
    id: "com.example.smuggler",
    contribution: (manifest) => ({
      kind: "app",
      views: [view(manifest.plugin_id, "main"), view(manifest.plugin_id, "extra")],
    }),
  });
  const supervisor = new PluginSupervisor(new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS, releaseIds: HOST_STAND_IN_IDS }));
  const report = await supervisor.start([{ definition: smuggler.definition }]);

  assert.deepEqual(report.running, []);
  assert.match(report.failed[0]?.message ?? "", /没有在 Manifest 里声明/u);
});

test("RAC-637 a Plugin names no owner for a view: not another Plugin's, and not its own either (the platform fills it from the Manifest)", async () => {
  const claiming = (claimed: (id: string) => string) => {
    const id = "com.example.impostor";
    return appPlugin({
      id,
      contribution: () => {
        const own = view(id, "main");
        return { kind: "app", views: [{ ...own, descriptor: { ...own.descriptor, plugin_id: claimed(id) } } as UiContribution] };
      },
    });
  };
  for (const claimed of [() => "com.example.victim", (id: string) => id]) {
    const supervisor = new PluginSupervisor(new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS, releaseIds: HOST_STAND_IN_IDS }));
    const report = await supervisor.start([{ definition: claiming(claimed).definition }]);
    assert.deepEqual(report.running, []);
    assert.match(report.failed[0]?.message ?? "", /自己写了插件身份/u);
  }
  // Without the field the same view is what the Manifest declared, and the plugin starts.
  const honest = appPlugin({ id: "com.example.honest", contribution: () => ({ kind: "app", views: [view("com.example.honest", "main")] }) });
  const supervisor = new PluginSupervisor(new PluginRuntime(undefined, undefined, { hostIds: ISOLATED_HOST_IDS, releaseIds: HOST_STAND_IN_IDS }));
  assert.equal((await supervisor.start([{ definition: honest.definition }])).running.length, 1);
});
