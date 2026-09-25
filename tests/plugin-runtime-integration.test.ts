import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import type { ArtifactReference, ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type {
  IntegrationProviderPort,
  PluginAppContribution,
  PluginDefinition,
  PluginManifest,
  PluginStartContext,
  PluginUpstreamReadyInputs,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import { SignalsModule } from "@molis-ai/molis-work-module-signals";
import { SourcesModule } from "@molis-ai/molis-work-module-sources";
import { ConnectorHost } from "@molis-ai/molis-work-service-connector-host";
import { ListenerHost } from "@molis-ai/molis-work-service-listener-host";
import {
  createGithubIntegrationPlugin,
  githubIntegrationManifest,
} from "@molis-ai/molis-work-integration-github";
import {
  MemoryPluginEventsRepository,
  MemoryPluginRuntimeRepository,
  MemoryPluginWiringRepository,
  PluginEventBus,
  PluginInputGraph,
  PluginRouteRouter,
  PluginRuntime,
  PluginRuntimeError,
  PluginSupervisor,
  SqlitePluginRuntimeRepository,
} from "@molis-ai/molis-work-plugin-runtime";

import { DEMO_BOARD_ID, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { OfficialIntegrationRegistry } from "@molis-ai/molis-work-app-local-host";
import type { FeedSourceRecord } from "@molis-ai/molis-work-plugin-feed";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";

const SOURCE_ID = "source-fd3-github";
const CONNECTION_ID = "connection-fd3-github";

function saveSource(store: LocalProjectDatabase): void {
  new SourcesModule(store.db).commands.save({
    project_id: DEMO_BOARD_ID,
    source_id: SOURCE_ID,
    kind: "github",
    definition_id: "github",
    sync_kind: "github",
    name: "GitHub",
    description: "Official Integration Plugin lifecycle fixture",
    status: "active",
    enabled: true,
    origin: "molis_work",
    config: {},
    schedule: { mode: "manual" },
    connection_ref: CONNECTION_ID,
    account_label: "@fixture",
    last_sync_at: null,
    last_outcome: null,
    last_error_code: null,
    imported_at: "2026-09-02T08:00:00.000Z",
    updated_at: "2026-09-02T08:00:00.000Z",
  });
}

function connectorFor(driver: Parameters<ConnectorHost["registerDriver"]>[0]): ConnectorHost {
  const connector = new ConnectorHost();
  connector.registerDriver(driver);
  connector.connect({ connection_id: CONNECTION_ID, driver_id: driver.driver_id });
  return connector;
}

test("official GitHub Plugin installs, grants, produces Signal, recovers, and uninstalls without data loss", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-fd3-runtime-"));
  try {
    const databasePath = join(directory, "molis-work.sqlite");
    seedDemoBoard(databasePath);
    const store = new LocalProjectDatabase(databasePath);
    try {
      saveSource(store);
      let polls = 0;
      const provider: IntegrationProviderPort = {
        type: "github",
        async health() {
          return { ok: true, status: "connected", message: "ready" };
        },
        async sync() {
          polls += 1;
          return {
            ok: true,
            mode: "live",
            items: [{
              externalId: "github-notification-42",
              title: "Review Molis Work PR",
              summary: polls === 1 ? "Review requested" : "Review request updated",
              occurredAt: "2026-09-02T08:00:00.000Z",
              kind: "pr",
              priority: "high",
              tags: ["github", "review"],
              attention: {
                reason: "source_rule",
                detail: { provider_reason: "review_requested" },
              },
            }],
            cursor: { page: polls },
          } as const;
        },
      };
      const definition = createGithubIntegrationPlugin({
        provider,
        now: () => new Date(`2026-09-02T08:00:0${polls}.000Z`),
      });
      const repository = new MemoryPluginRuntimeRepository();
      const runtime = new PluginRuntime(repository, undefined, {
        now: () => new Date("2026-09-02T08:00:00.000Z"),
      });
      const install = runtime.install({ definition, deployment: "local" });
      const installId = install.install.install_id;

      await assert.rejects(
        runtime.start(installId),
        (error: unknown) => error instanceof PluginRuntimeError
          && error.code === "plugin_grant_denied",
      );
      assert.throws(
        () => runtime.grant(installId, ["filesystem:all"]),
        (error: unknown) => error instanceof PluginRuntimeError
          && error.code === "plugin_grant_denied",
      );
      runtime.grant(installId, ["network:github.com", "secret:github"]);
      await runtime.start(installId);

      const firstContribution = runtime.contribution(installId);
      assert.equal(firstContribution?.kind, "integration");
      if (!firstContribution || firstContribution.kind !== "integration") return;
      const signals = new SignalsModule(store.db);
      const firstListener = new ListenerHost(
        store.db,
        connectorFor(firstContribution.connector_driver),
        signals.commands,
      );
      const first = await firstListener.run({
        project_id: DEMO_BOARD_ID,
        source_id: SOURCE_ID,
        connection_id: CONNECTION_ID,
        operation_id: "fd3-first-sync",
        adapter: firstContribution.signal_adapter,
      });
      assert.equal(first.created_count, 1);
      const initialSignal = signals.query.list(DEMO_BOARD_ID, SOURCE_ID)[0]!;
      assert.equal(initialSignal.adapter.plugin_id, githubIntegrationManifest.plugin_id);
      assert.equal(initialSignal.adapter.version, githubIntegrationManifest.version);
      assert.equal(initialSignal.provenance.provider_plugin_id, githubIntegrationManifest.plugin_id);

      await runtime.reportCrash(installId, "provider_process_crashed");
      assert.equal(runtime.get(installId).state, "crashed");
      assert.equal(runtime.contribution(installId), null);
      await runtime.recover(installId);
      assert.equal(runtime.get(installId).state, "running");
      assert.equal(runtime.get(installId).recovery_count, 1);

      const recoveredContribution = runtime.contribution(installId);
      assert.equal(recoveredContribution?.kind, "integration");
      if (!recoveredContribution || recoveredContribution.kind !== "integration") return;
      const recoveredListener = new ListenerHost(
        store.db,
        connectorFor(recoveredContribution.connector_driver),
        signals.commands,
      );
      await recoveredListener.run({
        project_id: DEMO_BOARD_ID,
        source_id: SOURCE_ID,
        connection_id: CONNECTION_ID,
        operation_id: "fd3-recovered-sync",
        adapter: recoveredContribution.signal_adapter,
      });
      const revisedSignal = signals.query.list(DEMO_BOARD_ID, SOURCE_ID)[0]!;
      assert.equal(revisedSignal.signal_id, initialSignal.signal_id);
      assert.equal(revisedSignal.revision, 2);
      assert.equal(revisedSignal.payload.summary, "Review request updated");

      await runtime.uninstall(installId, { retain_private_data: true });
      assert.equal(runtime.get(installId).state, "uninstalled");
      assert.equal(runtime.contribution(installId), null);
      assert.equal(signals.query.list(DEMO_BOARD_ID, SOURCE_ID).length, 1);
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Plugin identity is signature-bound while references retain plugin id and version", () => {
  const provider: IntegrationProviderPort = {
    type: "fixture",
    async health() { return { ok: true, status: "connected", message: "ready" }; },
    async sync() { return { ok: true, mode: "live", items: [], cursor: {} }; },
  };
  const changedManifest: PluginManifest = {
    ...githubIntegrationManifest,
    publisher: {
      ...githubIntegrationManifest.publisher,
      signature: "different-reviewed-signature-v1",
    },
  };
  const original = createGithubIntegrationPlugin({ provider });
  const changed = { ...original, manifest: changedManifest };
  const repository = new MemoryPluginRuntimeRepository();
  const runtime = new PluginRuntime(repository);
  const first = runtime.install({ definition: original, deployment: "local" });
  const second = runtime.install({ definition: changed, deployment: "local" });

  assert.notEqual(first.install.install_id, second.install.install_id);
  assert.equal(first.install.plugin_id, second.install.plugin_id);
  assert.equal(first.install.version, second.install.version);
  assert.notEqual(first.install.publisher_signature, second.install.publisher_signature);

  const silentlyChanged = {
    ...original,
    manifest: { ...githubIntegrationManifest, name: "Changed without a version bump" },
  };
  assert.throws(
    () => new PluginRuntime(repository).install({ definition: silentlyChanged, deployment: "local" }),
    (error: unknown) => error instanceof PluginRuntimeError
      && error.code === "plugin_definition_conflict",
  );
});

test("official Plugin composition restarts a source when Provider configuration changes", async () => {
  let providerCreations = 0;
  const registry = new OfficialIntegrationRegistry(() => {
    providerCreations += 1;
    return {
      type: "gmail",
      async health() { return { ok: true, status: "connected" as const, message: "ready" }; },
      async sync() { return { ok: true as const, mode: "live" as const, items: [], cursor: {} }; },
    };
  });
  const source: FeedSourceRecord = {
    board_id: DEMO_BOARD_ID,
    source_id: "source-fd3-config",
    kind: "gmail",
    definition_id: "gmail",
    sync_kind: "gmail",
    name: "Gmail",
    description: "configuration restart fixture",
    status: "active",
    enabled: true,
    item_count: 0,
    origin: "molis_work",
    config: { scope: "in:inbox is:unread" },
    schedule: { mode: "manual" },
    cursor: {},
    credential_ref: "secret:gmail:fixture",
    account_label: "fixture@example.com",
    last_sync_at: null,
    last_outcome: null,
    last_error_code: null,
    imported_at: "2026-09-02T08:00:00.000Z",
    updated_at: "2026-09-02T08:00:00.000Z",
  };

  await registry.contributionFor(source);
  await registry.contributionFor({ ...source });
  assert.equal(providerCreations, 1);
  await registry.contributionFor({
    ...source,
    config: { scope: "in:inbox" },
    updated_at: "2026-09-02T08:01:00.000Z",
  });
  assert.equal(providerCreations, 2);
});

const PROBE_PERMISSION = "network:probe";

function probeView(pluginId: string): UiContribution {
  return {
    descriptor: {
      contribution_id: `${pluginId}.main`,
      plugin_id: pluginId,
      kind: "primary-page",
      label: "main",
      slots: [],
    },
    render: () => "<section></section>",
  };
}

function probeManifest(pluginId: string, extra: Partial<PluginManifest> = {}): PluginManifest {
  return {
    schema_version: 2,
    host_api_version: 2,
    plugin_id: pluginId,
    version: "1.0.0",
    name: pluginId,
    kind: "app",
    publisher: { publisher_id: "molis", signature: `${pluginId}-binding` },
    entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: PROBE_PERMISSION, required: true, reason: "探针" }],
    capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] },
    ui: {
      contributions: [`${pluginId}.main`],
      views: [{ view_id: "main", slot: "stage", title: "Main" }],
    },
    ...extra,
  };
}

function probeContribution(pluginId: string, extra: Partial<PluginAppContribution> = {}): PluginAppContribution {
  return { kind: "app", views: [probeView(pluginId)], ...extra };
}

function openRuntimeDatabase(directory: string, name: string): Database.Database {
  return new Database(join(directory, name));
}

test("a rebuilt runtime activates a persisted running plugin and does not revive crashed or quarantined ones", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-runtime-rebuild-"));
  const databasePath = join(directory, "runtime.sqlite");
  const healthyId = "io.molis.work.audit.healthy";
  const crashedId = "io.molis.work.audit.crashed";
  const quarantinedId = "io.molis.work.audit.quarantined";
  let healthyStarts = 0;
  let crashedStarts = 0;
  let quarantinedStarts = 0;
  let failRecovery = false;
  const contexts: PluginStartContext[] = [];
  const healthy: PluginDefinition = {
    manifest: probeManifest(healthyId),
    async start(context) {
      healthyStarts += 1;
      context.requireGrant(PROBE_PERMISSION);
      contexts.push(context);
      return probeContribution(healthyId);
    },
    async stop() {},
  };
  const crashed: PluginDefinition = {
    manifest: probeManifest(crashedId),
    async start() {
      crashedStarts += 1;
      return probeContribution(crashedId);
    },
    async stop() {},
  };
  const quarantined: PluginDefinition = {
    manifest: probeManifest(quarantinedId),
    async start() {
      quarantinedStarts += 1;
      if (failRecovery) throw new Error("恢复失败");
      return probeContribution(quarantinedId);
    },
    async stop() {},
  };
  const dbA = openRuntimeDatabase(directory, "runtime.sqlite");
  try {
    const runtimeA = new PluginRuntime(new SqlitePluginRuntimeRepository(dbA), undefined, {
      maxRecoveryAttempts: 1,
    });
    const supervisorA = new PluginSupervisor(runtimeA);
    const first = await supervisorA.start([
      { definition: healthy },
      { definition: crashed },
      { definition: quarantined },
    ]);
    assert.deepEqual(first.running.sort(), [crashedId, healthyId, quarantinedId].sort());
    const healthyInstall = supervisorA.state(healthyId)?.install_id;
    const crashedInstall = supervisorA.state(crashedId)?.install_id;
    const quarantinedInstall = supervisorA.state(quarantinedId)?.install_id;
    assert.ok(healthyInstall && crashedInstall && quarantinedInstall);
    const healthyGrants = [...runtimeA.get(healthyInstall).grants];
    await runtimeA.reportCrash(crashedInstall, "plugin_process_crashed");
    await runtimeA.reportCrash(quarantinedInstall, "plugin_process_crashed");
    failRecovery = true;
    await assert.rejects(
      runtimeA.recover(quarantinedInstall),
      (error: unknown) => error instanceof PluginRuntimeError && error.code === "plugin_quarantined",
    );
    assert.equal(runtimeA.get(crashedInstall).state, "crashed");
    assert.equal(runtimeA.get(crashedInstall).recovery_count, 0);
    assert.equal(runtimeA.get(quarantinedInstall).state, "quarantined");
    assert.equal(runtimeA.get(quarantinedInstall).recovery_count, 1);
    assert.equal(healthyStarts, 1);
    assert.equal(crashedStarts, 1);
    assert.equal(quarantinedStarts, 2);
    dbA.close();

    failRecovery = false;
    const dbB = new Database(databasePath);
    try {
      const runtimeB = new PluginRuntime(new SqlitePluginRuntimeRepository(dbB), undefined, {
        maxRecoveryAttempts: 1,
      });
      const supervisorB = new PluginSupervisor(runtimeB);
      const rebuilt = await supervisorB.start([
        { definition: healthy },
        { definition: crashed },
        { definition: quarantined },
      ]);
      assert.deepEqual(rebuilt.running, [healthyId], "只有本进程重新激活的健康插件算运行中");
      assert.equal(healthyStarts, 2, "新 Runtime 必须再次执行激活");
      assert.equal(crashedStarts, 1, "crashed 不能被健康启动路径执行");
      assert.equal(quarantinedStarts, 2, "quarantined 不能被健康启动路径执行");
      assert.equal(runtimeB.list().length, 3, "不能清空安装表");
      assert.equal(runtimeB.get(healthyInstall).install_id, healthyInstall);
      assert.equal(runtimeB.get(healthyInstall).recovery_count, 0);
      assert.deepEqual(runtimeB.get(healthyInstall).grants, healthyGrants);
      assert.equal(runtimeB.get(crashedInstall).state, "crashed");
      assert.equal(runtimeB.get(crashedInstall).recovery_count, 0);
      assert.deepEqual(runtimeB.get(crashedInstall).grants, healthyGrants);
      assert.equal(runtimeB.get(quarantinedInstall).state, "quarantined");
      assert.equal(runtimeB.get(quarantinedInstall).recovery_count, 1);
      assert.equal(supervisorB.contribution(healthyId)?.kind, "app");
      assert.equal(supervisorB.contribution(crashedId), null);
      const instance = await supervisorB.ensureStarted(healthyId);
      assert.equal(instance?.active(), true);
      assert.equal(contexts.at(-1)?.install_id, healthyInstall);
      contexts.at(-1)?.requireGrant(PROBE_PERMISSION);

      const replayed = await Promise.all([
        runtimeB.start(healthyInstall),
        runtimeB.start(healthyInstall),
      ]);
      assert.equal(healthyStarts, 2, "同进程并发 start 不能再次注册");
      assert.equal(replayed[0]?.replayed, true);
      assert.equal(replayed[0]?.receipt_id, replayed[1]?.receipt_id);
      const again = await runtimeB.start(healthyInstall);
      assert.equal(again.replayed, true);
      assert.equal(healthyStarts, 2);

      const generation = supervisorB.generation(healthyId);
      const restarted = await supervisorB.restart(healthyId);
      assert.equal(restarted.status, "running");
      assert.equal(supervisorB.generation(healthyId), generation, "重启不能改变启用世代");
      assert.equal(runtimeB.get(healthyInstall).recovery_count, 0);
      assert.equal(healthyStarts, 3);
      const previous = contexts.at(-2);
      const current = contexts.at(-1);
      assert.notEqual(previous, current);
      assert.throws(
        () => previous?.requireGrant(PROBE_PERMISSION),
        (error: unknown) => error instanceof PluginRuntimeError && error.code === "plugin_grant_denied",
      );
      current?.requireGrant(PROBE_PERMISSION);
    } finally {
      dbB.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a failed reactivation revokes grants, and a cold stop does not activate or spend recovery", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-runtime-reactivate-"));
  const failingId = "io.molis.work.audit.reactivate";
  const parkedId = "io.molis.work.audit.parked";
  let failingStarts = 0;
  let parkedStarts = 0;
  let parkedStops = 0;
  let allow = true;
  let failedContext: PluginStartContext | undefined;
  const failing: PluginDefinition = {
    manifest: probeManifest(failingId),
    async start(context) {
      failingStarts += 1;
      failedContext = context;
      context.requireGrant(PROBE_PERMISSION);
      if (!allow) throw new Error("激活失败");
      return probeContribution(failingId);
    },
    async stop() {},
  };
  const parked: PluginDefinition = {
    manifest: probeManifest(parkedId),
    async start() {
      parkedStarts += 1;
      return probeContribution(parkedId);
    },
    async stop() {
      parkedStops += 1;
    },
  };
  const dbA = openRuntimeDatabase(directory, "runtime.sqlite");
  try {
    const runtimeA = new PluginRuntime(new SqlitePluginRuntimeRepository(dbA));
    const supervisorA = new PluginSupervisor(runtimeA);
    await supervisorA.start([{ definition: failing }, { definition: parked }]);
    const failingInstall = supervisorA.state(failingId)?.install_id;
    const parkedInstall = supervisorA.state(parkedId)?.install_id;
    assert.ok(failingInstall && parkedInstall);
    const grants = [...runtimeA.get(failingInstall).grants];
    dbA.close();

    allow = false;
    const dbB = new Database(join(directory, "runtime.sqlite"));
    try {
      const runtimeB = new PluginRuntime(new SqlitePluginRuntimeRepository(dbB));
      const supervisorB = new PluginSupervisor(runtimeB);
      const report = await supervisorB.start([{ definition: failing }]);
      assert.deepEqual(report.running, []);
      assert.equal(failingStarts, 2);
      assert.equal(parkedStarts, 1, "没有被这次启动点名的插件不能被顺手激活");
      assert.equal(runtimeB.get(failingInstall).state, "crashed");
      assert.equal(runtimeB.get(failingInstall).recovery_count, 0, "失败的重新激活不能消耗恢复预算");
      assert.equal(runtimeB.get(failingInstall).install_id, failingInstall);
      assert.deepEqual(runtimeB.get(failingInstall).grants, grants);
      assert.equal(runtimeB.contribution(failingInstall), null);
      assert.throws(
        () => failedContext?.requireGrant(PROBE_PERMISSION),
        (error: unknown) => error instanceof PluginRuntimeError && error.code === "plugin_grant_denied",
      );
      await assert.rejects(
        runtimeB.start(failingInstall),
        (error: unknown) => error instanceof PluginRuntimeError && error.code === "plugin_state_invalid",
      );
      assert.equal(failingStarts, 2, "crashed 记录不能被下一次 start 重置成 running");
      assert.equal(runtimeB.get(failingInstall).state, "crashed");
    } finally {
      dbB.close();
    }

    const dbC = new Database(join(directory, "runtime.sqlite"));
    try {
      const runtimeC = new PluginRuntime(new SqlitePluginRuntimeRepository(dbC));
      runtimeC.install({ definition: parked, deployment: "local", grants: [PROBE_PERMISSION] });
      const stopped = await runtimeC.stop(parkedInstall);
      assert.equal(stopped.install.state, "disabled");
      assert.equal(stopped.replayed, false);
      assert.equal(parkedStarts, 1, "没有本进程实例时停止不能激活");
      assert.equal(parkedStops, 0, "没有本进程实例时不能调用插件 stop");
      assert.equal(runtimeC.get(parkedInstall).recovery_count, 0);
      assert.deepEqual(runtimeC.get(parkedInstall).grants, grants);
    } finally {
      dbC.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("repeated and concurrent start register once, and a stop queued behind start revokes grants", async () => {
  const pluginId = "io.molis.work.audit.once";
  let starts = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let hold = true;
  let context: PluginStartContext | undefined;
  const definition: PluginDefinition = {
    manifest: probeManifest(pluginId),
    async start(started) {
      starts += 1;
      context = started;
      started.requireGrant(PROBE_PERMISSION);
      if (hold) {
        hold = false;
        await gate;
      }
      return probeContribution(pluginId);
    },
    async stop() {},
  };
  const runtime = new PluginRuntime();
  const installed = runtime.install({
    definition,
    deployment: "local",
    grants: [PROBE_PERMISSION],
  });
  const installId = installed.install.install_id;
  const starting = Promise.all([runtime.start(installId), runtime.start(installId)]);
  const stopping = runtime.stop(installId);
  release();
  const started = await starting;
  const stopped = await stopping;
  assert.equal(starts, 1, "并发 start 只能注册一次");
  assert.equal(started[0]?.receipt_id, started[1]?.receipt_id);
  assert.equal(started[0]?.replayed, false);
  assert.equal(stopped.install.state, "disabled");
  assert.equal(runtime.get(installId).recovery_count, 0);
  assert.equal(runtime.contribution(installId), null);
  assert.throws(
    () => context?.requireGrant(PROBE_PERMISSION),
    (error: unknown) => error instanceof PluginRuntimeError && error.code === "plugin_grant_denied",
  );

  await runtime.start(installId);
  const replayed = await runtime.start(installId);
  assert.equal(starts, 2);
  assert.equal(replayed.replayed, true);
  assert.equal(runtime.get(installId).state, "running");
  assert.equal(runtime.get(installId).recovery_count, 0);
});

test("revoke withdraws enablement until enable, including delivery, routes, and inputs", async () => {
  const producerId = "io.molis.work.audit.producer";
  const consumerId = "io.molis.work.audit.consumer";
  const eventType = `${producerId}.changed`;
  const boardId = "board-revoke";
  const received: unknown[] = [];
  const delivered: PluginUpstreamReadyInputs[] = [];
  let consumerStarts = 0;
  let routes = 0;
  const producer: PluginDefinition = {
    manifest: probeManifest(producerId, {
      permissions: [{ permission: "artifact:write", required: true, reason: "发布探针成果" }],
      ports: {
        inputs: [],
        outputs: [{ port: "project", artifact_type_id: "audit.project", schema_version: 1 }],
      },
      artifacts: { produces: [{ artifact_type_id: "audit.project", schema_version: 1 }], consumes: [] },
      events: {
        publishes: [{ event_type_id: eventType, type_version: 1 }],
        subscribes: [],
      },
    }),
    event_types: [{ event_type_id: eventType, type_version: 1, validate: (payload) => payload }],
    async start() {
      return probeContribution(producerId);
    },
    async stop() {},
  };
  const consumer: PluginDefinition = {
    manifest: probeManifest(consumerId, {
      permissions: [{ permission: "artifact:read", required: true, reason: "读取探针成果" }],
      ports: {
        inputs: [{ port: "project", artifact_type_id: "audit.project", schema_version: 1 }],
        outputs: [],
      },
      artifacts: { produces: [], consumes: [{ artifact_type_id: "audit.project", schema_version: 1 }] },
      events: {
        publishes: [],
        subscribes: [{ event_type_id: eventType, type_version: 1, from_plugin_ids: [producerId] }],
      },
      routes: [{ route_id: "ping", method: "GET", path: "/ping" }],
    }),
    async start() {
      consumerStarts += 1;
      return probeContribution(consumerId, {
        onEvent: (event) => {
          received.push(event.payload);
        },
        onUpstreamReady: (inputs) => {
          delivered.push(inputs);
        },
        onUpstreamUnavailable: () => {},
        routes: [{
          route_id: "ping",
          handle: () => {
            routes += 1;
            return { status: 200, body: { ok: true } };
          },
        }],
      });
    },
    async stop() {},
  };
  const runtime = new PluginRuntime();
  const supervisor = new PluginSupervisor(runtime);
  const entries = [{ definition: producer }, { definition: consumer }];
  const started = await supervisor.start(entries);
  assert.deepEqual(started.running.sort(), [producerId, consumerId].sort(), JSON.stringify(started.failed));
  const before = supervisor.generation(consumerId);
  assert.equal(typeof before, "number");
  await supervisor.restart(consumerId);
  assert.equal(supervisor.generation(consumerId), before, "重启不能使旧队列失效");
  assert.equal(runtime.get(supervisor.state(consumerId)!.install_id!).recovery_count, 0);
  const startsAfterRestart = consumerStarts;
  await supervisor.enable(consumerId);
  assert.equal(supervisor.generation(consumerId), before, "重复 enable 不能换世代");
  assert.equal(consumerStarts, startsAfterRestart, "已经启用时 enable 不能再次启动");

  const artifacts = new Map<string, ArtifactVersionRecord>();
  const graph = new PluginInputGraph({
    boardId,
    lifecycle: supervisor,
    repository: new MemoryPluginWiringRepository(),
    artifacts: {
      read: (reference: ArtifactReference) => artifacts.get(`${reference.artifact_id}@${reference.version}`) ?? null,
    },
  });
  const bus = new PluginEventBus({
    boardId,
    lifecycle: supervisor,
    repository: new MemoryPluginEventsRepository(),
  });
  const router = new PluginRouteRouter(supervisor, [producer.manifest, consumer.manifest]);
  graph.bind({
    board_id: boardId,
    target_plugin_id: consumerId,
    target_port: "project",
    source_plugin_id: producerId,
    source_port: "project",
    origin: "user",
    actor_id: "actor",
  });
  const publishArtifact = (version: number) => {
    const reference = { artifact_id: "artifact-project", version };
    artifacts.set(`${reference.artifact_id}@${reference.version}`, {
      ...reference,
      board_id: boardId,
      artifact_type_id: "audit.project",
      schema_version: 1,
      producer_plugin_id: producerId,
      producer_plugin_version: "1.0.0",
      producer_binding_signature: "sig",
      owner_actor_id: "actor",
      content_kind: "inline",
      payload: { version },
      content_ref: null,
      content_digest: "digest",
      size_bytes: 1,
      metadata: {},
      scope: "personal",
      availability: "available",
      unavailable_reason: null,
      lifecycle_state: "active",
      supersedes_version: null,
      created_by: "actor",
      created_at: "2026-09-22T00:00:00.000Z",
      archived_at: null,
      archived_by: null,
    });
    graph.publish({ plugin_id: producerId, port: "project", reference });
  };
  const publishEvent = (payload: unknown) => {
    const installId = supervisor.state(producerId)?.install_id;
    assert.ok(installId);
    bus.publish(
      { board_id: boardId, plugin_id: producerId, install_id: installId },
      { event_type_id: eventType, type_version: 1, payload },
    );
  };

  publishArtifact(1);
  graph.evaluate(consumerId);
  await graph.drain();
  publishEvent({ path: "src/a.ts" });
  await bus.drain();
  const routed = await router.dispatch({
    method: "GET",
    pathname: `/api/plugins/${consumerId}/ping`,
    actor_id: "actor",
  });
  assert.equal(delivered.length, 1);
  assert.deepEqual(received, [{ path: "src/a.ts" }]);
  assert.equal(routed?.status, 200);
  assert.equal(routes, 1);
  const handle = await supervisor.ensureStarted(consumerId);
  assert.equal(handle?.active(), true);

  publishEvent({ path: "src/queued.ts" });
  supervisor.revoke(consumerId);
  await bus.drain();
  assert.equal(handle?.active(), false, "旧句柄在撤销后失效");
  assert.deepEqual(received, [{ path: "src/a.ts" }], "旧队列不能投递");
  assert.equal(supervisor.generation(consumerId), undefined);
  assert.equal(supervisor.generation(consumerId), undefined, "重复读取不能重新启用");
  assert.equal(supervisor.enabledPluginIds().includes(consumerId), false);
  assert.equal(await supervisor.ensureStarted(consumerId), undefined);
  assert.equal(supervisor.contribution(consumerId), null);
  publishEvent({ path: "src/after.ts" });
  await bus.drain();
  publishArtifact(2);
  graph.evaluate(consumerId);
  await graph.drain();
  const denied = await router.dispatch({
    method: "GET",
    pathname: `/api/plugins/${consumerId}/ping`,
    actor_id: "actor",
  });
  assert.deepEqual(received, [{ path: "src/a.ts" }], "撤销后的新投递不能拿到活动实例");
  assert.equal(delivered.length, 1, "撤销后的输入不能拿到活动实例");
  assert.equal(denied?.status, 404);
  assert.deepEqual(denied?.body, { error: "plugin_not_enabled" });
  assert.equal(routes, 1);

  await supervisor.start(entries);
  assert.equal(supervisor.generation(consumerId), undefined, "再次 start 不能取消撤销");
  assert.equal(await supervisor.ensureStarted(consumerId), undefined);
  const restored = await supervisor.enable(consumerId);
  assert.equal(restored.status, "running");
  const next = supervisor.generation(consumerId);
  assert.equal(typeof next, "number");
  assert.notEqual(next, before);
  assert.equal(supervisor.generation(consumerId), next);
  assert.equal(supervisor.enabledPluginIds().includes(consumerId), true);
  assert.equal(handle?.active(), false, "重新启用也不能复活旧句柄");
  const revived = await supervisor.ensureStarted(consumerId);
  assert.equal(revived?.active(), true);
  publishEvent({ path: "src/restored.ts" });
  await bus.drain();
  graph.evaluate(consumerId);
  await graph.drain();
  const allowed = await router.dispatch({
    method: "GET",
    pathname: `/api/plugins/${consumerId}/ping`,
    actor_id: "actor",
  });
  assert.deepEqual(received.at(-1), { path: "src/restored.ts" });
  assert.equal(delivered.length, 2);
  assert.equal(allowed?.status, 200);
  assert.equal(routes, 2);
  await supervisor.restart(consumerId);
  assert.equal(supervisor.generation(consumerId), next, "重新启用后的重启仍然保持世代");
  assert.equal(runtime.get(supervisor.state(consumerId)!.install_id!).recovery_count, 0);
});

test("a start that finishes after revoke does not become the active instance", async () => {
  const pluginId = "io.molis.work.audit.late";
  let starts = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let context: PluginStartContext | undefined;
  let entered: () => void = () => {};
  const inside = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const definition: PluginDefinition = {
    manifest: probeManifest(pluginId),
    async start(started) {
      starts += 1;
      context = started;
      started.requireGrant(PROBE_PERMISSION);
      if (starts === 1) {
        entered();
        await gate;
      }
      return probeContribution(pluginId);
    },
    async stop() {},
  };
  const runtime = new PluginRuntime();
  const supervisor = new PluginSupervisor(runtime);
  const pending = supervisor.start([{ definition }]);
  await inside;
  supervisor.revoke(pluginId);
  release();
  const report = await pending;
  assert.equal(report.running.includes(pluginId), false);
  assert.equal(supervisor.generation(pluginId), undefined);
  assert.equal(supervisor.generation(pluginId), undefined);
  assert.equal(supervisor.enabledPluginIds().includes(pluginId), false);
  assert.equal(await supervisor.ensureStarted(pluginId), undefined);
  assert.equal(supervisor.contribution(pluginId), null);
  const installId = supervisor.state(pluginId)?.install_id;
  assert.ok(installId);
  assert.equal(runtime.get(installId).state, "disabled");
  assert.equal(runtime.get(installId).recovery_count, 0);
  assert.throws(
    () => context?.requireGrant(PROBE_PERMISSION),
    (error: unknown) => error instanceof PluginRuntimeError && error.code === "plugin_grant_denied",
  );

  const enabled = await supervisor.enable(pluginId);
  assert.equal(enabled.status, "running");
  assert.equal(typeof supervisor.generation(pluginId), "number");
  assert.equal((await supervisor.ensureStarted(pluginId))?.active(), true);
  assert.equal(starts, 2);
  assert.equal(runtime.get(installId).recovery_count, 0);
});

test("ensureStarted that finishes after revoke cannot register an active instance", async () => {
  const pluginId = "io.molis.work.audit.lazy";
  let starts = 0;
  let mode: "fail" | "block" | "ok" = "fail";
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered: () => void = () => {};
  const inside = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const definition: PluginDefinition = {
    manifest: probeManifest(pluginId),
    async start() {
      starts += 1;
      if (mode === "fail") throw new Error("先失败");
      if (mode === "block") {
        mode = "ok";
        entered();
        await gate;
      }
      return probeContribution(pluginId);
    },
    async stop() {},
  };
  const runtime = new PluginRuntime();
  const supervisor = new PluginSupervisor(runtime);
  const failed = await supervisor.start([{ definition }]);
  assert.equal(failed.running.includes(pluginId), false);
  assert.equal(starts, 1);
  mode = "block";
  const pending = supervisor.ensureStarted(pluginId);
  await inside;
  supervisor.revoke(pluginId);
  release();
  assert.equal(await pending, undefined);
  assert.equal(supervisor.generation(pluginId), undefined);
  assert.equal(supervisor.enabledPluginIds().includes(pluginId), false);
  const installId = supervisor.state(pluginId)?.install_id;
  assert.ok(installId);
  assert.notEqual(runtime.get(installId).state, "running");
  const enabled = await supervisor.enable(pluginId);
  assert.equal(enabled.status, "running");
  assert.equal((await supervisor.ensureStarted(pluginId))?.active(), true);
  assert.equal(supervisor.enabledPluginIds().includes(pluginId), true);
  assert.equal(starts, 3);
});
