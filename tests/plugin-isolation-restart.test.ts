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
      plugin_id: pluginId,
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
    schema_version: 2,
    host_api_version: 2,
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
  const healthy = appPlugin({ id: "io.molis.work.healthy" });
  const broken = appPlugin({ id: "io.molis.work.broken", failUntil: 1 });
  const supervisor = new PluginSupervisor(new PluginRuntime());

  const report = await supervisor.start([
    { definition: broken.definition },
    { definition: healthy.definition },
  ]);

  assert.deepEqual(report.running, ["io.molis.work.healthy"]);
  assert.equal(report.failed.length, 1);
  assert.equal(report.failed[0]?.plugin_id, "io.molis.work.broken");
  assert.equal(report.failed[0]?.code, "plugin_executor_failed");
  assert.equal(supervisor.contribution("io.molis.work.healthy")?.kind, "app");
  assert.equal(supervisor.contribution("io.molis.work.broken"), null);
});

test("an explicit restart revives only its own Plugin and keeps siblings untouched", async () => {
  const healthy = appPlugin({ id: "io.molis.work.healthy" });
  const flaky = appPlugin({ id: "io.molis.work.flaky", failUntil: 1 });
  const supervisor = new PluginSupervisor(new PluginRuntime());
  await supervisor.start([{ definition: flaky.definition }, { definition: healthy.definition }]);

  const healthyBefore = supervisor.state("io.molis.work.healthy");
  const restarted = await supervisor.restart("io.molis.work.flaky");

  assert.equal(restarted.status, "running");
  assert.equal(supervisor.contribution("io.molis.work.flaky")?.kind, "app");
  assert.deepEqual(supervisor.state("io.molis.work.healthy"), healthyBefore);
  assert.equal(healthy.starts(), 1, "兄弟插件不应被重启牵连");
});

test("concurrent restarts of the same Plugin create exactly one new instance", async () => {
  const flaky = appPlugin({ id: "io.molis.work.flaky", failUntil: 1 });
  const supervisor = new PluginSupervisor(new PluginRuntime());
  await supervisor.start([{ definition: flaky.definition }]);
  assert.equal(flaky.starts(), 1);

  const [left, right] = await Promise.all([
    supervisor.restart("io.molis.work.flaky"),
    supervisor.restart("io.molis.work.flaky"),
  ]);

  assert.equal(left.status, "running");
  assert.deepEqual(left, right);
  assert.equal(flaky.starts(), 2, "并发重启只应产生一次新的启动");
});

test("restarting a running Plugin stops it first and does not spend the recovery budget", async () => {
  const plugin = appPlugin({ id: "io.molis.work.steady" });
  const runtime = new PluginRuntime();
  const supervisor = new PluginSupervisor(runtime);
  await supervisor.start([{ definition: plugin.definition }]);

  for (let round = 0; round < 4; round += 1) {
    const state = await supervisor.restart("io.molis.work.steady");
    assert.equal(state.status, "running", `第 ${round + 1} 次重启应仍然成功`);
  }
  assert.equal(plugin.starts(), 5);
  const installId = supervisor.state("io.molis.work.steady")?.install_id;
  assert.ok(installId);
  assert.equal(runtime.get(installId).recovery_count, 0, "显式重启不应消耗崩溃恢复额度");
});

test("a Plugin blocked by an unsatisfied dependency never starts and is not reported as failed", async () => {
  const dependent = appPlugin({
    id: "io.molis.work.dependent",
    requires: [{ capability_id: "missing.v1", version: 1 }],
  });
  const independent = appPlugin({ id: "io.molis.work.independent" });
  const supervisor = new PluginSupervisor(new PluginRuntime());

  const report = await supervisor.start([
    { definition: dependent.definition },
    { definition: independent.definition },
  ]);

  assert.deepEqual(report.running, ["io.molis.work.independent"]);
  assert.deepEqual(report.failed, []);
  assert.equal(report.blocked.length, 1);
  assert.equal(report.blocked[0]?.plugin_id, "io.molis.work.dependent");
  assert.equal(report.blocked[0]?.code, "capability_missing");
  assert.equal(dependent.starts(), 0, "被阻塞的插件不应被执行");
});

test("a Plugin that does not deliver its declared views fails to start", async () => {
  const unredeemed = appPlugin({
    id: "io.molis.work.unredeemed",
    contribution: () => ({ kind: "app", views: [] }),
  });
  const supervisor = new PluginSupervisor(new PluginRuntime());
  const report = await supervisor.start([{ definition: unredeemed.definition }]);

  assert.deepEqual(report.running, []);
  assert.equal(report.failed[0]?.code, "plugin_contribution_unredeemed");
  assert.match(report.failed[0]?.message ?? "", /没有兑现/u);
});

test("a Plugin cannot contribute a view its Manifest never declared", async () => {
  const smuggler = appPlugin({
    id: "io.molis.work.smuggler",
    contribution: (manifest) => ({
      kind: "app",
      views: [view(manifest.plugin_id, "main"), view(manifest.plugin_id, "extra")],
    }),
  });
  const supervisor = new PluginSupervisor(new PluginRuntime());
  const report = await supervisor.start([{ definition: smuggler.definition }]);

  assert.deepEqual(report.running, []);
  assert.match(report.failed[0]?.message ?? "", /没有在 Manifest 里声明/u);
});

test("a Plugin cannot borrow another Plugin's identity for a view", async () => {
  const impostor = appPlugin({
    id: "io.molis.work.impostor",
    contribution: () => ({ kind: "app", views: [view("io.molis.work.victim", "main")] }),
  });
  const supervisor = new PluginSupervisor(new PluginRuntime());
  const report = await supervisor.start([{ definition: impostor.definition }]);

  assert.deepEqual(report.running, []);
  assert.match(report.failed[0]?.message ?? "", /别的插件身份/u);
});
