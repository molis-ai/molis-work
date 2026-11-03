import { openPluginInstallationDirectory } from "./plugin-installation-directory.js";
import { installedArtifacts, supervisedArtifacts } from "./artifact-type-registry.js";
import { declarationOwnersFor } from "./declaration-owners.js";
import { bindProjectArtifacts } from "./declared-types.js";
import { randomUUID } from "node:crypto";
import { pluginInstallRecords } from "./plugin-install-records.js";
import type { ArtifactsApplicationApi, ProcessItemsApplicationApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type {
  PluginDefinition,
  PluginManifest,
  PluginPrivateStorage,
  PluginUpgradeContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiHostApi } from "@molis-ai/molis-work-contracts/platform/ui";
import { PLUGIN_PRESENTATION_CAPABILITY } from '@molis-ai/molis-work-design-system';
import { registerPluginMessages } from "@molis-ai/molis-work-app-workbench";
import {
  PluginEventBus,
  PluginHostEvents,
  PluginInputGraph,
  PluginRouteRouter,
  PluginRuntime,
  PluginSupervisor,
  SqlitePluginEventsRepository,
  SqlitePluginRuntimeReleaseArtifactRepository,
  SqlitePluginWiringRepository,
  type InProcessAdmission,
  type PluginConsentLedger,
  type PluginEventsDatabase,
  type PluginSupervisorEntry,
  type PluginUpgradeCandidate,
  type PluginSupervisorReport,
  type PluginWiringDatabase,
} from "@molis-ai/molis-work-plugin-runtime";

import { PluginHostExecutor, type PluginHostExecutorOptions } from "./plugin-executor.js";
import type { PluginPlatformHome } from "./home-side.js";
import type { LocalSqliteJournal } from "@molis-ai/molis-work-storage";
import { observePluginArtifacts } from "./plugin-artifact-refresh.js";
import { assertDatabaseEntries } from "./plugin-database-entries.js";
import { pluginEntryIdentity } from "./plugin-entry-identity.js";
import { HOST_PLUGIN_IDS } from "./host-plugin-ids.js";
import type { ProjectLibrary } from "./plugin-project-library.js";
import { assertOwnerFilesEntries, homeOwnerFilesEntries, type PluginOwnerFilesEntry } from "./plugin-owner-files-entries.js";
import type { PluginDependencyCheck } from "./plugin-actions-client.js";
import { hostReservedRuleKeys } from "./scene-rule-admission.js";

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
  /** The file the connection is (better-sqlite3's `name`): the project's library, which plugins' own tables live in. */
  readonly name?: string;
  /** better-sqlite3's `open`: false once the connection is closed. */
  readonly open?: boolean;
};

/**
 * One entry of the Host's own start list. A plugin on it is given the library in the Home its Manifest declares
 * (`databases.home`, as `services.database`); `assertDatabaseEntries` says what a list may declare.
 */
export interface PluginPlatformEntry extends PluginSupervisorEntry, Pick<PluginOwnerFilesEntry, "dual_instance"> {}

export interface PluginPlatformOptions {
  project_id: string;
  actor_id: string;
  db: PluginPlatformDatabase;
  /** Domain journal from the same project connection; ordinary queries stay direct. */
  journal?: LocalSqliteJournal;
  artifacts: ArtifactsApplicationApi;
  /** Exchange data plugins record for each other, kept out of the 成果库 (specs/artifact-positioning A2). */
  processItems: ProcessItemsApplicationApi;
  ui: UiHostApi;
  privateStorageFor(context: PluginUpgradeContext, manifest: PluginManifest): PluginPrivateStorage;
  /** Test seam for `services.sourcePull`: the fetch its public-feed pulls go through. Production never passes it. */
  sourcePullFetch?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  /** Test seam for `services.sourcePull.repository`: the `git` it runs. Production never passes it. */
  sourcePullGit?: import("./research-repository-read.js").ResearchGit;
  /** Test seam for `services.sourcePull.connector`: the Home's integration registry, with providers of the test's own. Production never passes it. */
  sourcePullIntegrations?: () => Promise<import("./integration-registry.js").IntegrationRegistry>;
  /** The owner of private KV supplies whole-installation cleanup for synchronous non-retaining reinstalls. */
  deleteInstallationData?(installId: string): void;
  capturePrivateData?(installId: string): Promise<unknown> | unknown;
  restorePrivateData?(installId: string, snapshot: unknown): Promise<void> | void;
  /** Whether an action a plugin consumes is registered and ready in this project (`services.actions.availability`). */
  dependencyCheck?: PluginDependencyCheck;
  scheduler?: PluginHostExecutorOptions["scheduler"];
  /** Stands in for the Home's project catalog behind `services.projects` (S-96), for a test that has no Home. */
  projects?: PluginHostExecutorOptions["projects"];
  /** Shared system registry plus the trusted project identity for this activation. */
  actions: PluginHostExecutorOptions["actions"];
  /**
   * The Home this platform reaches in process, or `null` when it reaches none (a generated plugin's platform, a test without a
   * Home). Required, so that no caller leaves it out by accident: a platform that was never told serves its plugins nothing of
   * a Home, and nobody would notice.
   */
  home: PluginPlatformHome | null;
  /** The consent ledger for a platform that has no Home of its own to take it from (a generated plugin's platform, a test). */
  consents?: PluginConsentLedger;
  /**
   * Which definitions this platform's Runtime lets run in the Host's process without `host` trust (BL-588, S-75 ⑥): the Host's own
   * code names them (a Host's test fixtures; none in production). A platform given none checks nothing, which only a test's does;
   * `tests/plugin-in-process-call-sites.test.ts` has every production construction name it.
   */
  inProcess?: InProcessAdmission;
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
  /** What the Host itself tells one running installation (X-6, S-54): not stored, never replayed. */
  readonly hostEvents: PluginHostEvents;
  readonly wiring: PluginInputGraph;
  /** Ephemeral projection hints, never business delivery acknowledgements. */
  invalidateView(pluginId: string): void;
  viewRevision(pluginId: string): string;
  /** Stop input refresh/delivery and events before stopping plugins or closing storage. */
  closeCoordination(): Promise<void>;
  /**
   * The consent ledger this platform installs against and reads defaults from (a default wiring binds only on a standing agreement),
   * or `null` when it has none: then nothing is agreed to and no default binds.
   */
  readonly consents: PluginConsentLedger | null;
  /** Built after `start`, from the Manifests that actually activated. */
  router(): PluginRouteRouter;
  start(entries: readonly PluginPlatformEntry[]): Promise<PluginSupervisorReport>;
  upgradeCandidates(): PluginUpgradeCandidate[];
  upgrade(pluginId: string, definition?: PluginDefinition, options?: { grants?: string[] }): Promise<ReturnType<PluginSupervisor["state"]>>;
  rollback(pluginId: string, definition: PluginDefinition): Promise<ReturnType<PluginSupervisor["state"]>>;
}

export function createPluginPlatform(options: PluginPlatformOptions): PluginPlatform {
  if (options.journal && options.journal.db !== options.db) throw new Error("插件 journal 必须使用当前项目连接");
  // Tests and scripts are not type-checked, so the type alone would not make a caller say which.
  if (options.home === undefined) throw new Error("插件平台要说明它的 Home：给出进程内的 Home，或明确给 null");
  // A plugin that ships with the Host registers its actions under its plugin_id; every other plugin under its installation id
  // (user decision 2026-10-10, W3-06 Q1). "Ships with the Host" is the Host's own start list giving a definition `host` trust
  // object, not anything a plugin declares or its record holds, so a developed or generated plugin that names a built-in
  // plugin_id gets no more than an installation id.
  const identity = pluginEntryIdentity();
  const providerFor = identity.providerFor;
  const consents = options.consents ?? options.home?.consents ?? null;
  // The Runtime and the executor read the same records: an activation's jobs check the installation the Runtime keeps.
  const records = pluginInstallRecords(options.db);
  const viewEpoch = randomUUID(), viewRevisions = new Map<string, number>();
  let closed = false;
  // The Host and the plugin itself (`services.ui.invalidate`, PG-061) bump the same count; only a running plugin's moves.
  const invalidateView = (pluginId: string) => {
    if (!closed && supervisor.state(pluginId)?.status === "running") viewRevisions.set(pluginId, (viewRevisions.get(pluginId) ?? 0) + 1);
  };
  // The same holds for a library in the Home: the Host's list declares it about a definition object, so another definition that
  // carries the same plugin_id is given none.
  const installations = openPluginInstallationDirectory(options.db, records, pluginId => supervisor.manifest(pluginId));
  const executor = new PluginHostExecutor({
    installations: installations.client,
    record: installId => records.get(installId),
    invalidateView,
    providerFor,
    databaseFor: identity.databaseFor,
    dualInstance: identity.dualInstance,
    projectLibrary: projectLibraryOf(options), scheduler: options.scheduler,
    ...(options.projects ? { projects: options.projects } : {}),
    ...(options.sourcePullFetch ? { sourcePullFetch: options.sourcePullFetch } : {}),
    ...(options.sourcePullGit ? { sourcePullGit: options.sourcePullGit } : {}),
    ...(options.sourcePullIntegrations ? { sourcePullIntegrations: options.sourcePullIntegrations } : {}),
    project_id: options.project_id,
    actor_id: options.actor_id,
    artifacts: options.artifacts,
    processItems: options.processItems,
    actions: options.actions,
    home: options.home,
    ui: options.ui,
    privateStorageFor: options.privateStorageFor,
    deleteInstallationData: options.deleteInstallationData,
    capturePrivateData: options.capturePrivateData,
    restorePrivateData: options.restorePrivateData,
  });
  // A project instance of a dual-instance plugin offers only its half; the other half is the Home's (specs/dual-instance-plugins).
  const runtime = new PluginRuntime(records, executor,
    { ...options.inProcess ? { inProcess: options.inProcess } : {}, declarationOwners: declarationOwnersFor(options.home?.directory ?? null, { db: options.db, scope: { kind: "project", project_id: options.project_id } }, (pluginId: string): PluginManifest | undefined => supervisor.manifest(pluginId)), redemption: definition => ({ partial: identity.dualInstance(definition) }), scope: "project", hostIds: HOST_PLUGIN_IDS, ...consents ? { consents } : {}, reservedRuleKeys: hostReservedRuleKeys,
      actions: { ...options.actions, providerId: (record, definition) => providerFor(definition, record.install_id) } });
  const supervisor = new PluginSupervisor(runtime, {
    releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(options.db),
    hostCapabilities: [PLUGIN_PRESENTATION_CAPABILITY],
  });
  // What this project's installs declare is read from its supervisor while the platform is open: for display (all projects together)
  // and, for the writes in this project, by this project's database alone. A closed connection cannot answer, so a view over it is
  // as gone as one whose coordination closed: the Host closes coordination first, but a store closed on its own must not make every
  // other project's read of the shared directory throw.
  const artifactView = supervisedArtifacts(supervisor, runtime, () => !closed && options.db.open !== false);
  const unwatchArtifacts = installedArtifacts.watch(artifactView), unbindArtifacts = bindProjectArtifacts(options.db, artifactView);
  const wiring = new PluginInputGraph({
    projectId: options.project_id,
    lifecycle: supervisor,
    canReadCommitted: () => options.db.inTransaction !== true,
    repository: new SqlitePluginWiringRepository(options.db),
    // A port carries a process item it recorded, or a 成果 it pinned and selected.
    artifacts: {
      read: (reference) => options.processItems.query.getArtifactVersion(options.project_id, reference)
        ?? options.artifacts.query.getArtifactVersion(options.project_id, reference),
      // Someone can give an input port a fixed version from the 成果库, never a process item.
      library: (reference) => options.artifacts.query.getArtifactVersion(options.project_id, reference),
    },
  });
  const events = new PluginEventBus({
    projectId: options.project_id,
    lifecycle: supervisor,
    repository: new SqlitePluginEventsRepository(options.db),
  });
  const hostEvents = new PluginHostEvents({ projectId: options.project_id, lifecycle: supervisor });
  executor.attach({
    events,
    hostEvents,
    wiring,
    ...(options.dependencyCheck === undefined ? {} : { dependencyCheck: options.dependencyCheck }),
    scopeKey: options.scopeKey ?? options.project_id,
  });

  // Work queued for a Plugin survives a restart of that Plugin, so replay what
  // it never acknowledged once it is running again.
  let stopArtifactRefresh: (() => void) | undefined;
  const detachActivation = supervisor.observeActivation(pluginId => {
    // The words the Manifest declares (`ui.messages`) reach the pages' catalog the same way for a built-in and an installed plugin.
    const manifest = supervisor.manifest(pluginId);
    if (manifest) registerPluginMessages(manifest);
    if (!stopArtifactRefresh && options.journal && supervisor.manifest(pluginId)?.ports?.inputs.length) {
      stopArtifactRefresh = observePluginArtifacts(options.project_id, options.journal, wiring);
    }
    wiring.revoke(pluginId);
    wiring.evaluate(pluginId);
    void events.resume(options.project_id);
  });

  return {
    runtime,
    supervisor,
    events,
    hostEvents,
    wiring,
    invalidateView,
    viewRevision(pluginId) { return `${viewEpoch}:${viewRevisions.get(pluginId) ?? 0}`; },
    async closeCoordination() {
      closed = true; installations.dispose(); unwatchArtifacts(); unbindArtifacts();
      stopArtifactRefresh?.();
      detachActivation();
      await wiring.close();
      await events.close();
      await hostEvents.close();
    },
    router: () => new PluginRouteRouter(supervisor, supervisor.states().flatMap(state => {
      const manifest = supervisor.manifest(state.plugin_id);
      return manifest ? [manifest] : [];
    })),
    consents,
    upgradeCandidates: () => supervisor.upgradeCandidates(),
    upgrade: (pluginId, definition, options) => supervisor.upgrade(pluginId, definition, options),
    rollback: (pluginId, definition) => supervisor.rollback(pluginId, definition),
    async start(entries) {
      // The supervisor keeps one entry per plugin id and would let a later one silently replace an earlier one.
      const listed = new Set<string>();
      for (const { definition } of entries) {
        if (listed.has(definition.manifest.plugin_id)) throw new Error(`插件 ${definition.manifest.plugin_id} 在同一份启动名单里出现了两次`);
        listed.add(definition.manifest.plugin_id);
      }
      assertDatabaseEntries(entries, options.home, "project");
      assertOwnerFilesEntries(homeOwnerFilesEntries(options.home?.directory ?? null), entries, options.home);
      identity.remember(entries);
      const report = await supervisor.start(entries.map(entry => rememberingRestored(entry, identity.remember)));
      // Deliver whatever was already bound and published before this process.
      wiring.evaluateAll();
      await events.resume(options.project_id);
      return report;
    },
  };
}

/**
 * A definition the supervisor restores from a kept release stands in for the listed one, so the Host's marks on the listed entry
 * (its `trust`, `dual_instance`, its declarations) carry over to it, as the Home side does for its own (BL-394).
 */
function rememberingRestored(entry: PluginPlatformEntry, remember: (entries: readonly PluginPlatformEntry[]) => void): PluginPlatformEntry {
  const release = entry.releaseArtifact;
  if (!release) return entry;
  return { ...entry, releaseArtifact: { capture: () => release.capture(), async restore(source) {
    const definition = await release.restore(source);
    remember([{ ...entry, definition }]);
    return definition;
  } } };
}

/**
 * The project's library, when the platform runs on the Host's own connection to its file (better-sqlite3, which says its file
 * and whether it is in a transaction); otherwise none, and a plugin that declares tables there does not start.
 */
function projectLibraryOf(options: PluginPlatformOptions): ProjectLibrary | null {
  const { db, journal } = options;
  if (typeof db.name !== "string" || typeof db.inTransaction !== "boolean") return null;
  return { db, path: db.name, ...(journal ? { journal: { project_id: options.project_id, actor_id: options.actor_id, writer: journal } } : {}) };
}
