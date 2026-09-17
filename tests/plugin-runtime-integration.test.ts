import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type {
  IntegrationProviderPort,
  PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { SignalsModule } from "@molis-ai/molis-work-module-signals";
import { SourcesModule } from "@molis-ai/molis-work-module-sources";
import { ConnectorHost } from "@molis-ai/molis-work-service-connector-host";
import { ListenerHost } from "@molis-ai/molis-work-service-listener-host";
import {
  createGithubIntegrationPlugin,
  githubIntegrationManifest,
} from "@molis-ai/molis-work-integration-github";
import {
  MemoryPluginRuntimeRepository,
  PluginRuntime,
  PluginRuntimeError,
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
