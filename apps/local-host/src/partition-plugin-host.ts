import { OVERVIEW_REFRESH_ENTRY_KEY } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginInstallRecords } from "./plugin-install-records.js";
import { partitionOverviewLibraries } from "./partition-platform-services.js";
import { realpathSync } from "node:fs";
import path from "node:path";
import { PERSONAL_SPACE_DIRECTORY, partitionRootsOnDisk } from "@molis-ai/molis-work-module-projects";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { installIdentity, isHostTrust, registerPluginOffHere, resolveManifestText } from "@molis-ai/molis-work-plugin-runtime";
import { installedLocalePacks } from "./installed-action-registration.js";
import { manifestWordResolver } from "./ui-text-provider.js";
import { openHomePluginStore } from "./home-plugin-store.js";
import { hostLog } from "./host-log.js";
import { assembledPerPartition, PartitionPluginAssembly, type PartitionPluginLease, type PartitionWakeReason } from "./partition-plugin-assembly.js";
import { notePartitionInstalls } from "./plugin-install-records.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { ATTENTION_OVERVIEW_SOURCE, forgetInstallationPlatformRecords, markPartitionChanged, PartitionPlatformServices } from "./partition-platform-services.js";
import { onAttentionChangeOf } from "./attention-changes.js";
import type { PluginPlatform, PluginPlatformEntry } from "./plugin-platform.js";
import { partitionPluginMembers, type ProjectPluginRefreshResult } from "./project-plugin-enablement.js";
import type { LocalProjectDatabase } from "./project-database.js";
import type { ProjectPluginPorts } from "./project-plugins.js";
import { PERSONAL_SPACE_PROJECT_ID } from "./personal-space.js";
import { REMINDER_LATE_MS, tellPartitionReminder } from "./partition-reminders.js";
import { dueWakeupRecord, partitionLifecycleRecords } from "./partition-observation.js";
import type { DueEntryRecord } from "@molis-ai/molis-work-service-scheduler";
import type { PluginDueReminder } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * The Host's per-partition assembly (specs/unified-partition-plugins §4.2 第 2 条, batch 107): one for each Home, holding the assembly that runs
 * a plugin with a library in each partition as one instance per (plugin, partition), and the partition platform services (the due timer, the
 * overview) once the Host starts them.
 *
 * - **Who runs**: the plugins a partition enables (`partition_plugins`, read as the project's plugin list); an instance is started when its
 *   partition is opened (an `open` lease held while it stays open), when a due entry fires, or when a push or a synchronized write arrives.
 * - **Idle**: an instance with no lease stops after `PARTITION_PLUGIN_IDLE_MS`; a sweep runs while the Host does.
 * - **Membership**: a plugin taken out of a partition stops there, and its due entries and overview rows there go (`pluginDisabled`). While
 *   the partition is open, the actions of a plugin it does not enable are still listed there and answer that it is off here (BL-088, `registerPluginOffHere`).
 * - **What an instance reaches**: its own partition's library and files (S-partition-isolation), and installation records from the Home's one
 *   install table, with its lifecycle kept by that instance alone, in memory per (install, partition).
 */

/** A started instance: its own platform, which serves its actions, routes and pages; nothing else runs on it. */
export interface PartitionPluginInstance {
  readonly platform: PluginPlatform;
  /** The partition's entry points arrived after it opened: hand the instance their observers too. */
  updateObservers(): void;
  stop(): Promise<void>;
}

/** Runs `work` with an opened partition's ports, opening its runtime if needed; the Host gives this, a bare platform has none. */
export type PartitionOpener = <Result>(partitionId: string, work: (ports: ProjectPluginPorts) => Promise<Result>) => Promise<Result>;

type StartInstance = (ports: ProjectPluginPorts, scope: import("./partition-plugin-assembly.js").PartitionPluginScope, entry: PluginPlatformEntry,
  installDatabase: ReturnType<typeof openHomePluginStore>["db"]) => Promise<PartitionPluginInstance>;

/** How often the Host sweeps idle instances. */
const SWEEP_MS = 60_000;

const hosts = new Map<string, PartitionPluginHost>();
const PARTITION_BUILT_INS: readonly string[] = PLATFORM_PLUGIN_REGISTRATIONS.filter(entry => entry.project_runtime && assembledPerPartition(entry.manifest)).map(entry => entry.manifest.plugin_id);
/** The host whose instances run on a project's store, so closing that store stops them. */
const storeHosts = new WeakMap<LocalProjectDatabase, PartitionPluginHost>();

const canonical = (home: string) => { try { return realpathSync(home); } catch { return home; } };

/** This Home's partition plugin host, made on first use. */
export function partitionPluginHostFor(home: string, startInstance: StartInstance): PartitionPluginHost {
  const key = canonical(home);
  let host = hosts.get(key);
  if (!host || host.closed) {
    host = new PartitionPluginHost(key, startInstance);
    hosts.set(key, host);
  }
  return host;
}

/** This Home's partition plugin host when one exists; never makes one. */
export const existingPartitionPluginHost = (home: string | undefined): PartitionPluginHost | undefined => {
  if (home === undefined) return undefined;
  const host = hosts.get(canonical(home));
  return host && !host.closed ? host : undefined;
};

/** Stops the instances that run on this store, before it closes; none when nothing of the partition assembly used it. */
export async function releasePartitionPlugins(store: LocalProjectDatabase, partitionId: string): Promise<void> {
  await storeHosts.get(store)?.releasePartition(partitionId);
}

/**
 * A synchronized write or a restore reached a partition: its overview is read again on the next open and nothing is started (§6.1). Through the
 * running services when the Host has them, else straight to the overview index (a restore runs without a Host).
 */
export function partitionChanged(home: string, partitionId: string, installId?: string, pluginId?: string): void {
  const host = existingPartitionPluginHost(home);
  if (host?.services) {
    const manifest = pluginId ? host.manifestOf(pluginId) : undefined;
    const id = manifest ? installIdentity(manifest) : installId;
    const libraries = manifest && id ? partitionOverviewLibraries(home, [{ partition_id: partitionId, plugins: [{ install_id: id, manifest }] }]) : undefined;
    host.services.partitionChanged(partitionId, id, libraries);
  }
  else markPartitionChanged(home, partitionId, installId);
}

/**
 * A membership write took a plugin out of a partition: its due entries and overview rows there go now, whether or not the partition is open
 * (an open one also stops its instance on the refresh that follows). Nothing for a plugin that does not run per partition.
 */
export function partitionPluginRemoved(home: string, pluginId: string, partitionId: string): void {
  const host = existingPartitionPluginHost(home);
  const manifest = host?.manifestOf(pluginId) ?? PLATFORM_PLUGIN_REGISTRATIONS.find(entry => PARTITION_BUILT_INS.includes(pluginId) && entry.manifest.plugin_id === pluginId)?.manifest;
  if (!manifest) return;
  const installId = installIdentity(manifest);
  if (host?.services) host.services.pluginDisabled(installId, partitionId);
  else forgetInstallationPlatformRecords(home, installId, partitionId, { dataGoes: false, installedElsewhere: true });
}

/** The plugins whose installation is this Home's and whose lifecycle each partition keeps: not Home plugins, though in the same install table. */
export function perPartitionPlugins(home: string): ReadonlySet<string> {
  return existingPartitionPluginHost(home)?.partitionPlugins() ?? new Set(PARTITION_BUILT_INS);
}

/** A restore replaced the Home's files: every partition's libraries are read into the overview again on its next open, and nothing starts. */
export function homeRestored(home: string): void {
  for (const root of partitionRootsOnDisk(home)) {
    const name = path.basename(root);
    if (name.startsWith(".")) continue;
    partitionChanged(home, root === path.join(home, PERSONAL_SPACE_DIRECTORY) ? PERSONAL_SPACE_PROJECT_ID : name);
  }
}

/** The provider its instance in a partition registers: a plugin that ships with the Host under its plugin_id, any other under its installation. */
const providerOf = (entry: PluginPlatformEntry) => entry.trust && isHostTrust(entry.trust) ? entry.definition.manifest.plugin_id : installIdentity(entry.definition.manifest);

export class PartitionPluginHost {
  readonly assembly: PartitionPluginAssembly<PartitionPluginInstance>;
  services: PartitionPlatformServices | undefined;
  closed = false;
  private readonly entries = new Map<string, PluginPlatformEntry>();
  /** Ports of the partitions opened now, with the `open` lease each enabled plugin holds there. */
  private readonly open = new Map<string, { ports: ProjectPluginPorts; leases: Map<string, PartitionPluginLease>; off: Map<string, () => void> }>();
  /** Why a plugin did not start in a partition the last time it was asked to; cleared when it starts. */
  private readonly failures = new Map<string, { reason: string; code: string | null }>();
  private installs: ReturnType<typeof openHomePluginStore> | undefined;
  private opener: PartitionOpener | undefined;
  private sweep: NodeJS.Timeout | undefined;
  private stopAttentionMarks: (() => void) | undefined;
  private readonly rounds = new Map<string, Promise<void>>();
  private readonly releasing = new Map<string, number>();

  constructor(readonly home: string, private readonly startInstance: StartInstance) {
    this.assembly = new PartitionPluginAssembly<PartitionPluginInstance>({
      home,
      library: pluginId => this.entries.get(pluginId)?.definition.manifest.databases?.partition?.store_name ?? null,
      members: partitionId => this.members(partitionId),
      installation: pluginId => {
        const entry = this.entries.get(pluginId);
        return entry ? { install_id: installIdentity(entry.definition.manifest) } : null;
      },
      start: (scope, reason) => this.start(scope, reason),
      lifecycle: partitionLifecycleRecords(home),
    });
  }

  /** The plugins this Host runs per partition, as the project's start reads them (scope and trust already applied). */
  declare(entries: readonly PluginPlatformEntry[]): void {
    for (const entry of entries) this.entries.set(entry.definition.manifest.plugin_id, entry);
  }

  syncOwner(pluginId: string) {
    const definition = this.entries.get(pluginId)?.definition;
    if (!definition?.partitionSync || definition.execution === "sandbox") return null;
    const installId = installIdentity(definition.manifest);
    return { definition, bindings: definition.partitionSync, installId,
      record: () => this.closed ? null : pluginInstallRecords(this.installDatabase()).get(installId) };
  }

  plugins(): readonly string[] { return [...this.entries.keys()]; }

  /** The Manifest of a plugin this Host runs per partition, when it was declared here. */
  manifestOf(pluginId: string): PluginPlatformEntry["definition"]["manifest"] | undefined { return this.entries.get(pluginId)?.definition.manifest; }

  /** Reads the original publisher's declared name without opening a partition or starting a plugin. */
  installationName(pluginId: string, installId: string): string | undefined {
    const entry = this.entries.get(pluginId);
    if (!entry || installIdentity(entry.definition.manifest) !== installId) return undefined;
    const { manifest } = entry.definition;
    const reader = entry.localePacks?.(entry.definition) ?? installedLocalePacks(entry.definition);
    return resolveManifestText(pluginId, manifest.name, manifest.name_text, manifestWordResolver(reader));
  }

  /**
   * Every plugin whose installation is this Home's and whose lifecycle is each partition's: the built-in ones that keep a library in each
   * partition, and any other declared here. Known before any of them started, so a partition's records read the same either way.
   */
  partitionPlugins(): ReadonlySet<string> {
    return new Set([...PARTITION_BUILT_INS, ...this.entries.keys()]);
  }

  /** A partition's database is open: its per-partition plugins' installation records are read from the Home install table from now on. */
  noteStore(partition: LocalProjectDatabase, partitionId: string): void {
    notePartitionInstalls(partition.db, () => this.installDatabase(), () => this.partitionPlugins(), pluginId => this.platform(pluginId, partitionId)?.installRecords);
  }

  /** The Host starts the services (due timer, overview) and the idle sweep, and says how a partition that is not open is opened. */
  startServices(opener: PartitionOpener): void {
    if (this.closed) throw new Error("分区插件宿主已关闭");
    this.opener = opener;
    // A fired entry wakes only its (plugin, partition) instance and is handed to its `onDue` (batch 108); a reminder it raises goes to the
    // person. The entry is taken off only once this succeeded (`DueTimer`): a failure is tried again.
    this.services ??= new PartitionPlatformServices({ home: this.home, assembly: this.assembly,
      deliverDue: async (_lease, entry) => {
        const startedAt = new Date(), told = await this.deliverDue(entry);
        dueWakeupRecord(this.home, entry, startedAt, { outcome: told ? "succeeded" : "no_action" });
      },
      // Every wake that failed, the instance not started included; the entry stays and is tried again.
      failed: (entry, error) => {
        dueWakeupRecord(this.home, entry, new Date(), { outcome: "failed", error });
        hostLog.warn("plugins", "partition_due_wake_failed", error, { plugin_id: entry.plugin_id, partition_id: entry.partition_id, entry_key: entry.entry_key });
      } });
    // Something waiting on the person may have changed in a partition: its "waiting on you" rows are read again on the next overview read
    // (R13), read-only; nothing is read now and nothing wakes.
    this.stopAttentionMarks ??= onAttentionChangeOf(partitionId => {
      if (partitionId !== null) try { this.services?.overview.markDirty(partitionId, ATTENTION_OVERVIEW_SOURCE); } catch { /* the next sync or restore marks it again */ }
    });
    this.sweep ??= setInterval(() => { void this.assembly.sweep().catch(() => {}); }, SWEEP_MS);
    this.sweep.unref?.();
  }

  /** Hands one fallen-due entry to the running instance and tells the person the reminder it raises, if any; answers whether it told one. */
  private async deliverDue(entry: DueEntryRecord): Promise<boolean> {
    const platform = this.platform(entry.plugin_id, entry.partition_id), manifest = this.manifestOf(entry.plugin_id);
    if (!platform || !manifest) throw new ActionError("actions.plugin_unavailable", "这个插件在这里没有运行");
    const late = Date.now() - Date.parse(entry.due_at) > REMINDER_LATE_MS;
    const outcome = await platform.deliverDue(entry.plugin_id, { entry_key: entry.entry_key, due_at: entry.due_at, source: entry.source, late });
    if (entry.source === "plugin" && entry.entry_key === OVERVIEW_REFRESH_ENTRY_KEY) return false;
    // An overview reminder the plugin does not speak for shows its overview row; `null` says it no longer stands.
    const reminder = outcome?.reminder !== undefined ? outcome.reminder : entry.source === "overview" ? this.overviewReminder(entry, manifest) : null;
    if (!reminder) return false;
    await tellPartitionReminder(this.home, { partition_id: entry.partition_id, plugin_id: entry.plugin_id, install_id: entry.install_id, entry_key: entry.entry_key,
      due_at: entry.due_at, late, source_title: manifest.name, title: reminder.title, open: reminder.open ?? null,
      ...(reminder.interrupted ? { interrupted: true } : {}) });
    return true;
  }

  /** The overview row behind a reminder time (`<kind>:<row_id>`), as the overview index read it from the plugin's table. */
  private overviewReminder(entry: DueEntryRecord, manifest: PluginPlatformEntry["definition"]["manifest"]): PluginDueReminder | null {
    const at = entry.entry_key.indexOf(":");
    if (at < 1 || !this.services) return null;
    const [library] = partitionOverviewLibraries(this.home, [{ partition_id: entry.partition_id, plugins: [{ install_id: entry.install_id, manifest }] }]);
    if (!library) throw new ActionError("actions.plugin_unavailable", "暂时无法读取提醒");
    const row = this.services.overview.row(library, entry.entry_key.slice(0, at), entry.entry_key.slice(at + 1));
    return typeof row?.fields.title === "string" && typeof row.fields.remind_at === "string" && Date.parse(row.fields.remind_at) === Date.parse(entry.due_at)
      ? { title: row.fields.title } : null;
  }

  /** Resolve the enabled plugins through the membership policy for this partition. */
  private async members(partitionId: string): Promise<readonly string[]> {
    return partitionPluginMembers(this.home, partitionId, this.plugins());
  }

  private installDatabase() {
    if (this.closed) throw new ActionError("actions.plugin_unavailable", "分区插件宿主已关闭");
    return (this.installs ??= openHomePluginStore(this.home)).db;
  }

  private async start(scope: import("./partition-plugin-assembly.js").PartitionPluginScope, reason: PartitionWakeReason): Promise<PartitionPluginInstance> {
    if (this.closed || this.releasing.has(scope.partition_id)) throw new ActionError("actions.plugin_unavailable", "分区正在关闭");
    const entry = this.entries.get(scope.plugin_id);
    if (!entry) throw new ActionError("actions.plugin_unavailable", "这个插件还不按分区运行");
    const run = async (ports: ProjectPluginPorts) => {
      if (this.closed || this.releasing.has(scope.partition_id)) throw new ActionError("actions.plugin_unavailable", "分区正在关闭");
      this.noteStore(ports.store, ports.projectId);
      const instance = await this.startInstance(ports, scope, entry, this.installDatabase());
      if (this.closed || this.releasing.has(scope.partition_id)) {
        await instance.stop().catch(() => {});
        throw new ActionError("actions.plugin_unavailable", "分区正在关闭");
      }
      storeHosts.set(ports.store, this);
      return instance;
    };
    const opened = this.open.get(scope.partition_id);
    if (opened) {
      const instance = await run(opened.ports);
      if (reason === "open" && (this.open.get(scope.partition_id) !== opened || this.releasing.has(scope.partition_id))) {
        await instance.stop().catch(() => {});
        throw new ActionError("actions.plugin_unavailable", "这个分区已关闭");
      }
      return instance;
    }
    if (reason === "open" || !this.opener) throw new ActionError("actions.plugin_unavailable", "这个分区现在没有打开");
    return this.opener(scope.partition_id, run);
  }

  /** The instance of this plugin running in this partition, if any; never starts one. */
  platform(pluginId: string, partitionId: string): PluginPlatform | undefined {
    return this.assembly.started(pluginId, partitionId)?.platform;
  }

  /** Every instance running in this partition. */
  platforms(partitionId: string): PluginPlatform[] {
    return this.plugins().flatMap(pluginId => this.platform(pluginId, partitionId) ?? []);
  }

  /** Why the plugin is not running in this partition, when it was asked to and failed. */
  failure(pluginId: string, partitionId: string) {
    return this.failures.get(JSON.stringify([pluginId, partitionId]));
  }

  /** The partition is open: its enabled plugins start and stay up while it does. */
  async openPartition(ports: ProjectPluginPorts): Promise<void> {
    if (this.closed) throw new ActionError("actions.plugin_unavailable", "分区插件宿主已关闭");
    const partitionId = ports.projectId;
    this.noteStore(ports.store, ports.projectId);
    const opened = this.open.get(partitionId);
    if (opened) { opened.ports = ports; } else this.open.set(partitionId, { ports, leases: new Map(), off: new Map() });
    await this.refresh(partitionId);
  }

  /**
   * Starts what the partition now enables and stops what it no longer does, with its due entries and overview rows there (`pluginDisabled`).
   * Answers the switches it could not finish, as the project's refresh does.
   */
  refresh(partitionId: string): Promise<ProjectPluginRefreshResult> {
    // One round at a time per partition, so an earlier start cannot outlive a later stop.
    const next = (this.rounds.get(partitionId) ?? Promise.resolve()).then(() => this.reconcile(partitionId));
    const tail = next.then(() => undefined, () => undefined);
    this.rounds.set(partitionId, tail);
    void tail.then(() => { if (this.rounds.get(partitionId) === tail) this.rounds.delete(partitionId); });
    return next;
  }

  private async reconcile(partitionId: string): Promise<ProjectPluginRefreshResult> {
    const opened = this.open.get(partitionId);
    if (!opened || this.closed || this.releasing.has(partitionId)) return [];
    const members = new Set(await this.members(partitionId));
    if (this.open.get(partitionId) !== opened || this.closed || this.releasing.has(partitionId)) return [];
    const unfinished: { plugin_id: string; desired_enabled: boolean; reason: string }[] = [];
    for (const pluginId of this.plugins()) {
      if (this.open.get(partitionId) !== opened || this.closed || this.releasing.has(partitionId)) return [];
      const key = JSON.stringify([pluginId, partitionId]);
      const held = opened.leases.get(pluginId);
      if (members.has(pluginId)) {
        // Its own instance answers from now on.
        opened.off.get(pluginId)?.();
        opened.off.delete(pluginId);
        if (held && this.assembly.started(pluginId, partitionId)) continue;
        held?.release();
        opened.leases.delete(pluginId);
        try {
          if (this.open.get(partitionId) !== opened || this.closed || this.releasing.has(partitionId)) return [];
          const lease = await this.assembly.acquire(pluginId, partitionId, "open");
          // Closed while it started: the lease goes with the partition.
          if (this.open.get(partitionId) !== opened || this.closed || this.releasing.has(partitionId)) {
            lease.release();
            if (!this.open.has(partitionId)) await this.assembly.stopPlugin(pluginId, partitionId).catch(() => {});
            return [];
          }
          opened.leases.set(pluginId, lease);
          this.failures.delete(key);
        } catch (error) {
          if (this.open.get(partitionId) !== opened || this.closed || this.releasing.has(partitionId)) return [];
          const reason = error instanceof Error ? error.message : String(error);
          // Which plugin in which partition, and the platform's code for why: never the plugin's own words.
          const causeCode = error instanceof ActionError ? (error.details as { code?: unknown } | undefined)?.code ?? error.code : undefined;
          const code = typeof causeCode === "string" ? causeCode : null;
          hostLog.warn("plugins", "partition_plugin_start_failed", error, { plugin_id: pluginId, partition_id: partitionId, code });
          this.failures.set(key, { reason, code });
          unfinished.push({ plugin_id: pluginId, desired_enabled: true, reason });
        }
        continue;
      }
      this.failures.delete(key);
      const running = held !== undefined || this.assembly.started(pluginId, partitionId) !== undefined;
      held?.release();
      opened.leases.delete(pluginId);
      if (running) {
        try {
          await this.assembly.stopPlugin(pluginId, partitionId);
          this.pluginDisabled(pluginId, partitionId);
        } catch (error) {
          if (this.open.get(partitionId) !== opened || this.closed || this.releasing.has(partitionId)) return [];
          unfinished.push({ plugin_id: pluginId, desired_enabled: false, reason: error instanceof Error ? error.message : String(error) });
          continue;
        }
      }
      const entry = this.entries.get(pluginId);
      if (entry && !opened.off.has(pluginId) && this.open.get(partitionId) === opened && !this.releasing.has(partitionId)) {
        opened.off.set(pluginId, registerPluginOffHere(opened.ports.actions.registry, entry.definition.manifest,
          { provider_id: providerOf(entry), plugin_install_id: installIdentity(entry.definition.manifest), project_id: partitionId }));
      }
    }
    return unfinished;
  }

  /** The plugin was taken out of a partition: its due entries and overview rows there go now. */
  private pluginDisabled(pluginId: string, partitionId: string): void {
    const entry = this.entries.get(pluginId);
    if (!entry) return;
    const installId = installIdentity(entry.definition.manifest);
    if (this.services) this.services.pluginDisabled(installId, partitionId);
    else forgetInstallationPlatformRecords(this.home, installId, partitionId, { dataGoes: false, installedElsewhere: true });
  }

  /** The partition closes (its runtime, or the project is deleted): its leases go and every instance in it stops. */
  async releasePartition(partitionId: string): Promise<void> {
    this.releasing.set(partitionId, (this.releasing.get(partitionId) ?? 0) + 1);
    try {
      const opened = this.open.get(partitionId);
      this.open.delete(partitionId);
      for (const lease of opened?.leases.values() ?? []) lease.release();
      for (const withdraw of opened?.off.values() ?? []) withdraw();
      let waited: Promise<void> | undefined;
      for (let pending = this.rounds.get(partitionId); pending && pending !== waited && !this.open.has(partitionId); pending = this.rounds.get(partitionId)) {
        waited = pending;
        await pending.catch(() => {});
      }
      for (const key of [...this.failures.keys()]) if ((JSON.parse(key) as string[])[1] === partitionId) this.failures.delete(key);
      await this.assembly.stopPartition(partitionId);
      // Made by a bare project platform (no Host started the services): nothing keeps it once its last partition closed.
      if (!this.services && this.open.size === 0 && this.assembly.instances().length === 0) await this.close();
    } finally {
      const remaining = (this.releasing.get(partitionId) ?? 1) - 1;
      if (remaining <= 0) this.releasing.delete(partitionId);
      else this.releasing.set(partitionId, remaining);
    }
  }

  /** Whether an instance in this partition has background work that closing it would end. */
  hasWork(partitionId: string): boolean {
    return this.platforms(partitionId).some(platform => platform.hasProjectWork(partitionId));
  }

  activeWorkCount(partitionId: string): number {
    return this.platforms(partitionId).reduce((sum, platform) => sum + platform.activeWorkCount(), 0);
  }

  async close(): Promise<void> {
    this.stopAttentionMarks?.();
    this.stopAttentionMarks = undefined;
    if (this.closed) return;
    this.closed = true;
    if (this.sweep) clearInterval(this.sweep);
    for (const opened of this.open.values()) for (const withdraw of opened.off.values()) withdraw();
    this.open.clear();
    const failures: unknown[] = [];
    await this.assembly.close().catch(error => { failures.push(error); });
    try { this.services?.close(); } catch (error) { failures.push(error); }
    try { this.installs?.db.close(); } catch (error) { failures.push(error); }
    this.services = undefined;
    this.installs = undefined;
    if (hosts.get(this.home) === this) hosts.delete(this.home);
    if (failures.length) throw new AggregateError(failures, "分区插件宿主关闭失败");
  }
}
