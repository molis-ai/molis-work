import type { ArtifactsApplicationApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type {
  PluginManifest,
  PluginPrivateStorage,
  PluginStartContext,
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
  SqlitePluginWiringRepository,
  type PluginCapabilityPort,
  type PluginEventsDatabase,
  type PluginSupervisorEntry,
  type PluginSupervisorReport,
  type PluginWiringDatabase,
} from "@molis-ai/molis-work-plugin-runtime";

import { PluginHostExecutor } from "./plugin-executor.js";

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
};

export interface PluginPlatformOptions {
  board_id: string;
  actor_id: string;
  db: PluginPlatformDatabase;
  artifacts: ArtifactsApplicationApi;
  ui: UiHostApi;
  privateStorageFor(context: PluginStartContext, manifest: PluginManifest): PluginPrivateStorage;
  /** Capabilities the Host exposes to Plugins that declared consuming them. */
  capabilities?: PluginCapabilityPort;
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
  /** Built after `start`, from the Manifests that actually activated. */
  router(): PluginRouteRouter;
  start(entries: readonly PluginSupervisorEntry[]): Promise<PluginSupervisorReport>;
}

export function createPluginPlatform(options: PluginPlatformOptions): PluginPlatform {
  const executor = new PluginHostExecutor({
    board_id: options.board_id,
    actor_id: options.actor_id,
    artifacts: options.artifacts,
    ui: options.ui,
    privateStorageFor: options.privateStorageFor,
  });
  const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(options.db), executor);
  const supervisor = new PluginSupervisor(runtime);
  const wiring = new PluginInputGraph({
    boardId: options.board_id,
    lifecycle: supervisor,
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
  supervisor.observeActivation(() => {
    void events.resume(options.board_id);
  });

  let manifests: PluginManifest[] = [];
  return {
    runtime,
    supervisor,
    events,
    wiring,
    router: () => new PluginRouteRouter(supervisor, manifests),
    async start(entries) {
      manifests = entries.map((entry) => entry.definition.manifest);
      const report = await supervisor.start(entries);
      // Deliver whatever was already bound and published before this process.
      wiring.evaluateAll();
      await events.resume(options.board_id);
      return report;
    },
  };
}
