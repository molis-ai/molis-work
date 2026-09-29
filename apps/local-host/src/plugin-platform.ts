import type { ArtifactsApplicationApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type {
  PluginDefinition,
  PluginManifest,
  PluginPrivateStorage,
  PluginUpgradeContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiHostApi } from "@molis-ai/molis-work-contracts/platform/ui";
import {
  PluginEventBus,
  PluginInputGraph,
  PluginRouteRouter,
  PluginRuntime,
  PluginSupervisor,
  SqlitePluginEventsRepository,
  SqlitePluginRuntimeRepository,
  SqlitePluginRuntimeReleaseArtifactRepository,
  SqlitePluginWiringRepository,
  type PluginCapabilityPort,
  type PluginEventsDatabase,
  type PluginSupervisorEntry,
  type PluginUpgradeCandidate,
  type PluginSupervisorReport,
  type PluginWiringDatabase,
} from "@molis-ai/molis-work-plugin-runtime";

import { PluginHostExecutor, type PluginHostExecutorOptions } from "./plugin-executor.js";
import type { LocalSqliteJournal } from "@molis-ai/molis-work-storage";
import { observePluginArtifacts } from "./plugin-artifact-refresh.js";

/**
 * One project's v2 Plugin platform, assembled in a single place.
 *
 * Construction order is a real constraint, not a preference: the event bus and
 * input graph need a lifecycle, the lifecycle needs the Plugin Runtime, and the
 * Runtime needs the executor. This factory owns that order and uses the
 * executor's one `attach` seam to close the loop, so no caller has to
 * rediscover it.
 */

export type PluginPlatformDatabase = PluginEventsDatabase & PluginWiringDatabase & {
  exec(sql: string): unknown;
  readonly inTransaction?: boolean;
};

export interface PluginPlatformOptions {
  board_id: string;
  actor_id: string;
  db: PluginPlatformDatabase;
  /** Domain journal from the same project connection; ordinary queries stay direct. */
  journal?: LocalSqliteJournal;
  artifacts: ArtifactsApplicationApi;
  ui: UiHostApi;
  privateStorageFor(context: PluginUpgradeContext, manifest: PluginManifest): PluginPrivateStorage;
  capturePrivateData?(installId: string): Promise<unknown> | unknown;
  restorePrivateData?(installId: string, snapshot: unknown): Promise<void> | void;
  /** Capabilities the Host exposes to Plugins that declared consuming them. */
  capabilities?: PluginCapabilityPort;
  /** Shared system registry plus the trusted project identity for this activation. */
  actions: PluginHostExecutorOptions["actions"];
  /**
   * Opaque scope key stamped on every Plugin output in this project, so the
   * Host can tell two inputs belong to the same scope. Defaults to the board.
   */
  scopeKey?: string | null;
}

export interface PluginPlatform {
  readonly runtime: PluginRuntime;
  readonly supervisor: PluginSupervisor;
  readonly events: PluginEventBus;
  readonly wiring: PluginInputGraph;
  /** Stop input refresh/delivery and events before stopping plugins or closing storage. */
  closeCoordination(): Promise<void>;
  /** Built after `start`, from the Manifests that actually activated. */
  router(): PluginRouteRouter;
  start(entries: readonly PluginSupervisorEntry[]): Promise<PluginSupervisorReport>;
  upgradeCandidates(): PluginUpgradeCandidate[];
  upgrade(pluginId: string, definition?: PluginDefinition, options?: { grants?: string[] }): Promise<ReturnType<PluginSupervisor["state"]>>;
  rollback(pluginId: string, definition: PluginDefinition): Promise<ReturnType<PluginSupervisor["state"]>>;
}

export function createPluginPlatform(options: PluginPlatformOptions): PluginPlatform {
  if (options.journal && options.journal.db !== options.db) throw new Error("插件 journal 必须使用当前项目连接");
  const executor = new PluginHostExecutor({
    board_id: options.board_id,
    actor_id: options.actor_id,
    artifacts: options.artifacts,
    actions: options.actions,
    ui: options.ui,
    privateStorageFor: options.privateStorageFor,
    capturePrivateData: options.capturePrivateData,
    restorePrivateData: options.restorePrivateData,
  });
  const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(options.db), executor,
    { actions: options.actions });
  const supervisor = new PluginSupervisor(runtime, {
    releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(options.db),
  });
  const wiring = new PluginInputGraph({
    boardId: options.board_id,
    lifecycle: supervisor,
    canReadCommitted: () => options.db.inTransaction !== true,
    repository: new SqlitePluginWiringRepository(options.db),
    artifacts: {
      read: (reference) => options.artifacts.query.getArtifactVersion(options.board_id, reference),
    },
  });
  const events = new PluginEventBus({
    boardId: options.board_id,
    lifecycle: supervisor,
    repository: new SqlitePluginEventsRepository(options.db),
  });
  executor.attach({
    events,
    wiring,
    ...(options.capabilities === undefined ? {} : { capabilities: options.capabilities }),
    scopeKey: options.scopeKey ?? options.board_id,
  });

  // Work queued for a Plugin survives a restart of that Plugin, so replay what
  // it never acknowledged once it is running again.
  let stopArtifactRefresh: (() => void) | undefined;
  const detachActivation = supervisor.observeActivation(pluginId => {
    if (!stopArtifactRefresh && options.journal && supervisor.manifest(pluginId)?.ports?.inputs.length) {
      stopArtifactRefresh = observePluginArtifacts(options.board_id, options.journal, wiring);
    }
    wiring.revoke(pluginId);
    wiring.evaluate(pluginId);
    void events.resume(options.board_id);
  });

  return {
    runtime,
    supervisor,
    events,
    wiring,
    async closeCoordination() {
      stopArtifactRefresh?.();
      detachActivation();
      await wiring.close();
      await events.close();
    },
    router: () => new PluginRouteRouter(supervisor, supervisor.states().flatMap(state => {
      const manifest = supervisor.manifest(state.plugin_id);
      return manifest ? [manifest] : [];
    })),
    upgradeCandidates: () => supervisor.upgradeCandidates(),
    upgrade: (pluginId, definition, options) => supervisor.upgrade(pluginId, definition, options),
    rollback: (pluginId, definition) => supervisor.rollback(pluginId, definition),
    async start(entries) {
      const report = await supervisor.start(entries);
      // Deliver whatever was already bound and published before this process.
      wiring.evaluateAll();
      await events.resume(options.board_id);
      return report;
    },
  };
}
