import { initializeDemoPlugins, type DemoAcceptanceRequest } from "./plugin-demo-seed.js";
import { PLUGIN_PRESENTATION_CAPABILITY } from '@molis-ai/molis-work-contracts/platform/ui';
import { SYSTEM_OUTPUT_SOURCES } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { openPluginInstallationDirectory } from "./plugin-installation-directory.js";
import { installedArtifacts, supervisedArtifacts } from "./artifact-type-registry.js";
import { declarationOwnersFor } from "./declaration-owners.js";
import { bindProjectArtifacts } from "./declared-types.js";
import { PluginViewRevisions } from "./plugin-view-revisions.js";
import { pluginInstallRecords } from "./plugin-install-records.js";
import type { ArtifactsApplicationApi, ProcessItemsApplicationApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type {
  PluginDefinition,
  PluginInstanceRecord,
  PluginManifest,
  PluginPrivateStorage,
  PluginRuntimeRepository,
  PluginUpgradeContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiHostApi } from "@molis-ai/molis-work-contracts/platform/ui";

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
  resolveActionProviderId,
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
import { registerInstalledActions } from './installed-action-registration.js';
import { HOST_PLUGIN_IDS, RELEASE_PACKAGE_IDS } from "./host-plugin-ids.js";
import type { ProjectLibrary } from "./plugin-project-library.js";
import { assertOwnerFilesEntries, homeOwnerFilesEntries, type PluginOwnerFilesEntry } from "./plugin-owner-files-entries.js";
import type { PluginDependencyCheck } from "./plugin-actions-client.js";
import { hostReservedRuleKeys } from "./scene-rule-admission.js";
import { assertSurfacePresentation } from "./surface-installation.js";
import { projectedPermissionDeclarations, projectedPermissionsOf } from "./installed-permission-projection.js";
import { builtinPluginByManifestId } from "./plugin-registry.js";
import { forgetInstalledMemoryScene, rememberInstalledMemoryScene } from "./memory/memory-plugin-scene.js";

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
  /** The file the connection is: the project's library, which plugins' own tables live in. */
  readonly name?: string;
  /** False once the connection is closed. */
  readonly open?: boolean;
};

/**
 * One entry of the Host's own start list. A plugin on it is given the library in the Home its Manifest declares
 * (`databases.home`, as `services.database`); `assertDatabaseEntries` says what a list may declare.
 */
export interface PluginPlatformEntry extends PluginSupervisorEntry, Pick<PluginOwnerFilesEntry, "dual_instance"> {
  readonly localePacks?: PluginHostExecutorOptions["localePacks"];
}

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
  sourcePullGit?: import("./builtin-drivers.js").ResearchGit;
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
  /** Protected Host review seam for a plugin's `demo_seed` when its sample needs accepted requirements. */
  acceptDemoRequirements?: (items: readonly DemoAcceptanceRequest[]) => Promise<void>;
  /**
   * Where the installation records, install directory and signed release packages are. A per-partition instance's platform reads the Home's one install table (`plugin-runtime.db`,
   * specs/unified-partition-plugins §4.2 第 1 条); absent: the records in `db`, as the old assemblies keep them until batch 109 deletes them.
   */
  installDatabase?: import("@molis-ai/molis-work-plugin-runtime").PluginRuntimeDatabase;
  /** The (plugin, partition) instance's scope when this platform runs one plugin for the per-partition assembly; its libraries are the scope's. */
  partitionScope?: import("./partition-plugin-assembly.js").PartitionPluginScope;
}

export interface PluginPlatform {
  readonly runtime: PluginRuntime;
  /**
   * The installation records this platform reads and writes. A per-partition instance's keep its lifecycle in memory and hand durable facts to
   * the Home install table, so the partition's other readers read this instance's record through them (`plugin-install-records.ts`).
   */
  readonly installRecords: PluginRuntimeRepository;
  invokeOwnedAction<Input, Output>(expected: { actor_id: string; project_id: string; plugin_id: string; install_id: string; installation_generation: string },
    reference: import("@molis-ai/molis-work-contracts/platform/actions").ExactActionReference, input: Input,
    control: import("@molis-ai/molis-work-contracts/platform/plugin").PluginExecutionControl): Promise<Output>;
  dualInstance(pluginId: string): boolean;
  /** Whether a dual-instance plugin's matching Home half is currently running (always true for non-dual plugins). */
  dualHomeRunning(record: PluginInstanceRecord): boolean;
  /** Grants effective right now for an installation (intersects dual-instance project halves with Home S-48 ceiling). */
  effectiveGrants(record: PluginInstanceRecord): readonly string[];
  readonly supervisor: PluginSupervisor;
  readonly events: PluginEventBus;
  /** What the Host itself tells one running installation (X-6, S-54): not stored, never replayed. */
  readonly hostEvents: PluginHostEvents;
  readonly wiring: PluginInputGraph;
  /** Ephemeral projection hints, never business delivery acknowledgements. */
  invalidateView(pluginId: string): void;
  viewRevision(pluginId: string): string;
  waitForView: PluginViewRevisions["waitForView"];
  /** Stop input refresh/delivery and events before stopping plugins or closing storage. */
  closeCoordination(): Promise<void>;
  /** Cancel this project's activation jobs and wait for their actual cleanup before storage is released. */
  stopProjectJobs(projectId: string): Promise<void>;
  /** Whether a plugin of this project has work running that closing the project would end. */
  hasProjectWork(projectId: string): boolean;
  /** Synchronous count of active background executions and command-kept jobs across this project's plugins. */
  activeWorkCount(): number;
  /**
   * The consent ledger this platform installs against and reads defaults from (a default wiring binds only on a standing agreement),
   * or `null` when it has none: then nothing is agreed to and no default binds.
   */
  readonly consents: PluginConsentLedger | null;
  /** Built after `start`, from the Manifests that actually activated. */
  router(): PluginRouteRouter;
  start(entries: readonly PluginPlatformEntry[], control?: { assertCurrent?: () => void }): Promise<PluginSupervisorReport>;
  upgradeCandidates(): PluginUpgradeCandidate[];
  upgrade(pluginId: string, definition?: PluginDefinition, options?: Parameters<PluginSupervisor["upgrade"]>[2]): Promise<ReturnType<PluginSupervisor["state"]>>;
  rollback(pluginId: string, definition: PluginDefinition): Promise<ReturnType<PluginSupervisor["state"]>>;
}

const isDualSandboxDefinition = (definition: PluginDefinition): boolean =>
  definition.execution === "sandbox" && definition.manifest.runtime?.scope === "home" && definition.manifest.runtime.dual_instance === true;

function isDualSandboxPlugin(supervisor: PluginSupervisor, records: ReturnType<typeof pluginInstallRecords>, pluginId: string): boolean {
  const state = supervisor.state(pluginId);
  const record = state?.install_id ? records.get(state.install_id) : undefined;
  return Boolean(record && record.execution === "sandbox" && record.publisher_trust === "pinned" && supervisor.manifest(pluginId)?.runtime?.dual_instance === true);
}

function dualHomeRunningFor(home: PluginPlatformHome | null, isDualId: (pluginId: string) => boolean, record: PluginInstanceRecord): boolean {
  if (!isDualId(record.plugin_id)) return true;
  if (!home) return false;
  if (home.dualHomeRunning) return home.dualHomeRunning(record);
  try { home.capturePermission(record, "storage:private"); return true; } catch { return false; }
}

function effectiveGrantsFor(runtime: PluginRuntime, isDualId: (pluginId: string) => boolean, dualHomeRunning: (record: PluginInstanceRecord) => boolean, record: PluginInstanceRecord): readonly string[] {
  if (!isDualId(record.plugin_id)) return record.grants;
  if (!dualHomeRunning(record)) return [];
  return record.grants.filter(permission => {
    try { runtime.capturePermission(record.install_id, permission); return true; } catch { return false; }
  });
}

function buildPlatformRouter(supervisor: PluginSupervisor, runtime: PluginRuntime, records: ReturnType<typeof pluginInstallRecords>, isDualId: (pluginId: string) => boolean): PluginRouteRouter {
  return new PluginRouteRouter(supervisor, supervisor.states().flatMap(state => {
    const manifest = supervisor.manifest(state.plugin_id);
    return manifest ? [manifest] : [];
  }), {
    capturePermission: (pluginId, permission) => {
      const state = supervisor.state(pluginId);
      const current = state?.install_id ? records.get(state.install_id) : undefined;
      const allPermissions = [...(supervisor.manifest(pluginId)?.permissions ?? []), ...(current ? projectedPermissionsOf(current) : [])];
      if (!isDualId(pluginId) || !allPermissions.some(item => item.permission === permission && item.required === false)) return () => {};
      if (!state?.install_id) throw pluginErrors.grant_denied("插件权限当前不可用");
      return runtime.capturePermission(state.install_id, permission);
    },
  });
}

async function startPlatformEntries(ctx: {
  options: PluginPlatformOptions;
  identity: ReturnType<typeof pluginEntryIdentity>;
  supervisor: PluginSupervisor;
  runtime: PluginRuntime;
  wiring: PluginInputGraph;
  events: PluginEventBus;
  closed(): boolean;
}, entries: readonly PluginPlatformEntry[], control?: { assertCurrent?: () => void }): Promise<PluginSupervisorReport> {
  control?.assertCurrent?.();
  const listed = new Set<string>();
  for (const { definition } of entries) {
    if (listed.has(definition.manifest.plugin_id)) throw new Error(`插件 ${definition.manifest.plugin_id} 在同一份启动名单里出现了两次`);
    listed.add(definition.manifest.plugin_id);
  }
  assertDatabaseEntries(entries, ctx.options.home, "project");
  assertOwnerFilesEntries(homeOwnerFilesEntries(ctx.options.home?.directory ?? null), entries, ctx.options.home);
  ctx.identity.remember(entries);
  const report = await ctx.supervisor.start(entries.map(entry => rememberingRestored(entry, ctx.identity.remember)), control);
  control?.assertCurrent?.();
  ctx.wiring.evaluateAll();
  await ctx.events.resume(ctx.options.project_id);
  await initializeDemoPlugins({ home: ctx.options.home?.directory, projectId: ctx.options.project_id, actorId: ctx.options.actor_id, client: ctx.options.actions.client,
    assertCurrent: control?.assertCurrent, acceptDemoRequirements: ctx.options.acceptDemoRequirements, entries: entries.flatMap(entry => {
      const state = ctx.supervisor.state(entry.definition.manifest.plugin_id);
      if (!state?.install_id || state.status !== "running") return [];
      const installId = state.install_id;
      return [{ manifest: entry.definition.manifest, providerId: resolveActionProviderId(ctx.runtime.get(installId)),
        current: () => !ctx.closed() && ctx.supervisor.state(entry.definition.manifest.plugin_id)?.status === "running" && ctx.supervisor.state(entry.definition.manifest.plugin_id)?.install_id === installId }];
    }) });
  return report;
}

export function createPluginPlatform(options: PluginPlatformOptions): PluginPlatform {
  if (options.journal && options.journal.db !== options.db) throw new Error("插件 journal 必须使用当前项目连接");
  if (options.home === undefined) throw new Error("插件平台要说明它的 Home：给出进程内的 Home，或明确给 null");
  const identity = pluginEntryIdentity();
  const consents = options.consents ?? options.home?.consents ?? null;
  // One install table in the Home (batch 106, §4.2): a partition instance keeps its durable installation records, install directory
  // and signed release packages there with it, while keeping its own per-partition runtime state (`running`/`crashed`/idle stop) in
  // memory so stopping or crashing partition B never corrupts partition A's running state or skips A's cleanup.
  const installDb = options.installDatabase ?? options.db;
  // A per-partition instance reads the Home's one install table, and only for the partition it was started for.
  if (options.partitionScope && (!options.installDatabase || options.installDatabase === options.db || options.partitionScope.partition_id !== options.project_id)) {
    throw new Error("分区插件实例要用 Home 的安装表，且只在它自己的分区里运行");
  }
  const records = options.installDatabase && options.partitionScope
    ? partitionInstanceInstallRecords(installDb)
    : pluginInstallRecords(installDb);
  let closed = false;
  const views = new PluginViewRevisions(id => !closed && supervisor.state(id)?.status === "running");
  const { invalidateView, viewRevision, waitForView } = views;
  const installations = openPluginInstallationDirectory(installDb, records, pluginId => supervisor.manifest(pluginId));
  const isDualDefinition = (definition: PluginDefinition): boolean => identity.dualInstance(definition) || isDualSandboxDefinition(definition);
  const isDualId = (pluginId: string): boolean => identity.dualInstanceId(pluginId) || isDualSandboxPlugin(supervisor, records, pluginId);
  const executor = new PluginHostExecutor({
    installations: installations.client, record: installId => records.get(installId), invalidateView,
    localePacks: identity.localePacks, databaseFor: identity.databaseFor, dualInstance: isDualDefinition,
    projectLibrary: projectLibraryOf(options), scheduler: options.scheduler,
    ...(options.partitionScope ? { partitionScope: options.partitionScope } : {}),
    ...(options.projects ? { projects: options.projects } : {}),
    ...(options.sourcePullFetch ? { sourcePullFetch: options.sourcePullFetch } : {}),
    ...(options.sourcePullGit ? { sourcePullGit: options.sourcePullGit } : {}),
    ...(options.sourcePullIntegrations ? { sourcePullIntegrations: options.sourcePullIntegrations } : {}),
    project_id: options.project_id, actor_id: options.actor_id, artifacts: options.artifacts, processItems: options.processItems,
    actions: options.actions, home: options.home, ui: options.ui, privateStorageFor: options.privateStorageFor,
    deleteInstallationData: options.deleteInstallationData, capturePrivateData: options.capturePrivateData, restorePrivateData: options.restorePrivateData,
  });
  const dualHomeRunning = (record: PluginInstanceRecord) => dualHomeRunningFor(options.home, isDualId, record);
  const effectiveGrants = (record: PluginInstanceRecord) => effectiveGrantsFor(runtime, isDualId, dualHomeRunning, record);
  const runtime: PluginRuntime = new PluginRuntime(records, executor,
    { inProcess: options.inProcess, declarationOwners: declarationOwnersFor(options.home?.directory ?? null, { db: installDb, scope: options.installDatabase ? { kind: "home" } : { kind: "project", project_id: options.project_id } }, (pluginId: string): PluginManifest | undefined => supervisor.manifest(pluginId), options.home?.settingsVersionClaims), redemption: definition => ({ partial: isDualDefinition(definition) }), scope: "project", hostIds: HOST_PLUGIN_IDS, releaseIds: RELEASE_PACKAGE_IDS, ...consents ? { consents } : {}, reservedRuleKeys: hostReservedRuleKeys, permissionDeclarations: projectedPermissionDeclarations,
      assertPresentation: (manifest, rollback) => assertSurfacePresentation(manifest, { db: installDb, home: options.home?.directory, projectId: options.project_id, registry: options.actions.registry }, runtime, rollback),
      permissionBound: (record, definition) => isDualDefinition(definition) ? permission => { if (!options.home) throw pluginErrors.grant_denied("个人空间插件权限当前不可用"); return options.home.capturePermission(record, permission); } : undefined,
      actions: { ...options.actions,
        register: (definition, contribution, record, registration) => registerInstalledActions(definition, contribution, record, registration, options.actions, {
          dualHomeRunning: () => { const now = records.get(record.install_id); return Boolean(now && dualHomeRunning(now)); },
          effectiveGrants: () => { const now = records.get(record.install_id); return now ? effectiveGrants(now) : []; },
        }) } });
  const supervisor = new PluginSupervisor(runtime, {
    releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(installDb),
    hostCapabilities: [PLUGIN_PRESENTATION_CAPABILITY],
  });
  const artifactView = supervisedArtifacts(supervisor, runtime, () => !closed && options.db.open !== false);
  const unwatchArtifacts = installedArtifacts.watch(artifactView), unbindArtifacts = bindProjectArtifacts(options.db, artifactView);
  const wiring = new PluginInputGraph({
    projectId: options.project_id, lifecycle: supervisor, canReadCommitted: () => options.db.inTransaction !== true,
    repository: new SqlitePluginWiringRepository(options.db), systemSources: SYSTEM_OUTPUT_SOURCES,
    artifacts: {
      read: (reference) => options.processItems.query.getArtifactVersion(options.project_id, reference) ?? options.artifacts.query.getArtifactVersion(options.project_id, reference),
      library: (reference) => options.artifacts.query.getArtifactVersion(options.project_id, reference),
    },
  });
  const events = new PluginEventBus({ projectId: options.project_id, lifecycle: supervisor, repository: new SqlitePluginEventsRepository(options.db) });
  const hostEvents = new PluginHostEvents({ projectId: options.project_id, lifecycle: supervisor });
  executor.attach({ events, hostEvents, wiring, ...(options.dependencyCheck === undefined ? {} : { dependencyCheck: options.dependencyCheck }), scopeKey: options.scopeKey ?? options.project_id });
  let stopArtifactRefresh: (() => void) | undefined;
  const rememberedScenes = new Set<string>();
  const detachActivation = supervisor.observeActivation(pluginId => {
    if (!builtinPluginByManifestId(pluginId)) {
      const scene = supervisor.manifest(pluginId)?.memory_scene;
      rememberInstalledMemoryScene(options.project_id, pluginId, scene);
      if (scene) rememberedScenes.add(pluginId);
      else rememberedScenes.delete(pluginId);
    }
    if (!stopArtifactRefresh && options.journal && supervisor.manifest(pluginId)?.ports?.inputs.length) {
      stopArtifactRefresh = observePluginArtifacts(options.project_id, options.journal, wiring);
    }
    wiring.revoke(pluginId); wiring.evaluate(pluginId); void events.resume(options.project_id);
  });
  return {
    runtime, installRecords: records,
    invokeOwnedAction: (expected, reference, input, control) => executor.invokeOwnedAction(expected, reference, input, control),
    supervisor, events, hostEvents, wiring, invalidateView, viewRevision, waitForView,
    stopProjectJobs: projectId => executor.stopProjectJobs(projectId),
    hasProjectWork: projectId => executor.hasProjectWork(projectId),
    activeWorkCount: () => executor.activeWorkCount(),
    async closeCoordination() {
      closed = true; views.close(); installations.dispose(); unwatchArtifacts(); unbindArtifacts();
      stopArtifactRefresh?.(); detachActivation();
      for (const pluginId of rememberedScenes) forgetInstalledMemoryScene(options.project_id, pluginId);
      rememberedScenes.clear();
      await wiring.close(); await events.close(); await hostEvents.close();
    },
    dualInstance: isDualId, dualHomeRunning, effectiveGrants,
    router: () => buildPlatformRouter(supervisor, runtime, records, isDualId),
    consents, upgradeCandidates: () => supervisor.upgradeCandidates(),
    upgrade: (pluginId, definition, opt) => supervisor.upgrade(pluginId, definition, opt),
    rollback: (pluginId, definition) => supervisor.rollback(pluginId, definition),
    start: (entries, control) => startPlatformEntries({ options, identity, supervisor, runtime, wiring, events, closed: () => closed }, entries, control),
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
 * The project's library, when the platform runs on the Host's own connection to its file (which says its file
 * and whether it is in a transaction); otherwise none, and a plugin that declares tables there does not start.
 */
function projectLibraryOf(options: PluginPlatformOptions): ProjectLibrary | null {
  const { db, journal } = options;
  if (typeof db.name !== "string" || typeof db.inTransaction !== "boolean") return null;
  return { db, path: db.name, ...(journal ? { journal: { project_id: options.project_id, actor_id: options.actor_id, writer: journal } } : {}) };
}

type PartitionInstanceState = Pick<PluginInstanceRecord, "installation_generation" | "version" | "manifest_digest" | "state" | "recovery_count" | "last_error_code" | "updated_at">;

function durableInstallFieldsChanged(stored: PluginInstanceRecord, next: PluginInstanceRecord): boolean {
  return stored.installation_generation !== next.installation_generation
    || stored.plugin_id !== next.plugin_id
    || stored.version !== next.version
    || stored.publisher_id !== next.publisher_id
    || stored.publisher_signature !== next.publisher_signature
    || stored.manifest_digest !== next.manifest_digest
    || stored.deployment !== next.deployment
    || stored.selected_entrypoint !== next.selected_entrypoint
    || stored.execution !== next.execution
    || stored.publisher_trust !== next.publisher_trust
    || stored.installed_at !== next.installed_at
    || stored.uninstalled_at !== next.uninstalled_at
    || stored.retain_private_data !== next.retain_private_data
    || stored.grants.length !== next.grants.length
    || stored.grants.some((grant, index) => grant !== next.grants[index]);
}

/**
 * Splits durable Home installation facts (`plugin-runtime.db`) from one `(plugin, partition)` instance's ephemeral runtime state.
 * Durable installation changes (install, upgrade, grants, uninstall) persist to Home; per-partition start/stop/crash stays local to
 * this platform instance so another partition stopping or crashing never invalidates this instance's running state or skips cleanup.
 * Durable Home `disabled` / `uninstalled` and generation/edition changes still take immediate effect on reads.
 */
function partitionInstanceInstallRecords(db: NonNullable<PluginPlatformOptions["installDatabase"]>): PluginRuntimeRepository {
  const base = pluginInstallRecords(db);
  const local = new Map<string, PartitionInstanceState>();
  const project = (stored: PluginInstanceRecord | null): PluginInstanceRecord | null => {
    if (!stored) return null;
    if (stored.state === "uninstalled" || stored.state === "disabled") return stored;
    const instance = local.get(stored.install_id);
    if (instance
      && instance.installation_generation === stored.installation_generation
      && instance.version === stored.version
      && instance.manifest_digest === stored.manifest_digest) {
      return {
        ...stored,
        state: instance.state,
        recovery_count: instance.recovery_count,
        last_error_code: instance.last_error_code,
        updated_at: instance.updated_at,
      };
    }
    return stored.state === "running" ? { ...stored, state: "installed" } : stored;
  };
  return {
    get: installId => project(base.get(installId)),
    list: () => base.list().map(stored => project(stored)!),
    save(record: PluginInstanceRecord) {
      if (record.state === "uninstalled") {
        local.delete(record.install_id);
        base.save(record);
        return;
      }
      const stored = base.get(record.install_id);
      const durableChanged = !stored
        || stored.state === "uninstalled"
        || (stored.state === "disabled" && record.state === "running")
        || durableInstallFieldsChanged(stored, record);
      if (durableChanged) {
        base.save({ ...record, state: "installed", recovery_count: 0, last_error_code: null });
      }
      local.set(record.install_id, {
        installation_generation: record.installation_generation,
        version: record.version,
        manifest_digest: record.manifest_digest,
        state: record.state,
        recovery_count: record.recovery_count,
        last_error_code: record.last_error_code,
        updated_at: record.updated_at,
      });
    },
  };
}
