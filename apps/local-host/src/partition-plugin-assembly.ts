import { chmodSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { partitionRoot } from "@molis-ai/molis-work-module-projects";
import { applySqliteBaseline, bindDatabaseSpace, ensureStorageSpace, openHomeSqliteFile } from "@molis-ai/molis-work-storage";

type LibraryConnection = ReturnType<typeof openHomeSqliteFile>;

// The one assembly (specs/unified-partition-plugins §4.2 第 2 条, batch 106): an instance per (plugin, partition), started when its partition
// is opened, a due entry fires, a push or a synchronized write arrives, and stopped again when idle, so the number of running instances follows
// the partitions in use, not the number of projects. Each instance is handed its own partition's files and nothing else (S-partition-isolation):
// its libraries under `<partition root>/libraries/`, its plugin files under `<partition root>/plugin-files/<install>/`. Which plugins a partition
// runs is `partition_plugins` (`partitions.plugins.set@1`); which are installed is the Home's one install table (`plugin-runtime.db`).
//
// It runs alongside the old assemblies until batch 109 merges them (V1: add, then move, then delete). Since batch 107 the Host builds one for
// each Home (`partition-plugin-host.ts`): a plugin whose Manifest declares `databases.partition` runs only here, never in the project platform
// or the Home-level one (`assembledPerPartition`). It reads none of the old assemblies' records.

/** Whether a plugin keeps a library in each partition (`databases.partition`). The Home-level platform skips it. */
export function assembledPerPartition(manifest: { readonly databases?: { readonly partition?: unknown } }): boolean {
  return manifest.databases?.partition !== undefined;
}

/** Why an instance is started: the four events that may wake a dormant partition (S-partition-wake-scope). */
export type PartitionWakeReason = "open" | "due" | "push" | "sync";

/** What a per-partition instance may reach: its own partition's root and the paths under it, nothing above or beside it. */
export interface PartitionPluginScope {
  readonly partition_id: string;
  readonly plugin_id: string;
  readonly install_id: string;
  /** The partition's root, resolved (`partitionRoot`). */
  readonly root: string;
  /** `<partition root>/libraries/<store>.db` (U2). */
  libraryPath(storeName: string): string;
  /** `<partition root>/plugin-files/<install>/`. */
  ownerFilesRoot(): string;
  /** Refuses a path that is not under this partition's root once links are resolved: another partition's library or files among them. */
  assertOwnPath(candidate: string): string;
}

/** A started instance: the assembly stops it when idle, when the plugin is disabled or uninstalled there, or when the partition goes. */
export interface PartitionPluginHandle {
  stop(): Promise<void>;
}

export interface PartitionPluginAssemblyOptions<Handle extends PartitionPluginHandle = PartitionPluginHandle> {
  readonly home: string;
  /**
   * The library name the plugin declares in `databases.partition`, or null when it is not assembled per partition. Two plugins enabled in one
   * partition may not declare the same name: the file is `<partition root>/libraries/<name>.db`, so one would open the other's data.
   */
  library(pluginId: string): string | null;
  /** The plugins enabled in this partition, as `partition_plugins` holds them now. */
  members(partitionId: string): Promise<readonly string[]> | readonly string[];
  /** The plugin's installation in the Home's one install table, or null when it is not installed. */
  installation(pluginId: string): { readonly install_id: string } | null;
  /** Starts the instance with its scope; production gives it a platform of its own over the partition's files. */
  start(scope: PartitionPluginScope, reason: PartitionWakeReason): Promise<Handle>;
  /** How long an instance with no lease stays up after its last use; the platform's policy, the same for every plugin. */
  readonly idleMs?: number;
  /** Told of every start and stop, after it settled (the Host's work records); never awaited, and what it throws is not the caller's. */
  readonly lifecycle?: (event: PartitionPluginLifecycleEvent) => void;
  readonly now?: () => number;
}

/** Why an instance stopped: idle, switched off or uninstalled there (`plugin`), its partition going, or the Host closing. */
export type PartitionStopReason = "idle" | "plugin" | "partition" | "close";

/** One start or stop of a (plugin, partition) instance, as the assembly saw it settle. */
export interface PartitionPluginLifecycleEvent {
  readonly scope: PartitionPluginScope;
  readonly stage: "start" | "stop";
  readonly reason: PartitionWakeReason | PartitionStopReason;
  readonly outcome: "succeeded" | "failed";
  readonly started_at: string;
  readonly duration_ms: number;
  /** The error's code, when it has one; never its message. */
  readonly code?: string;
}

/** One use of an instance; the instance may stop once every lease is released and the idle time has passed. */
export interface PartitionPluginLease {
  readonly scope: PartitionPluginScope;
  release(): void;
}

/** Ten minutes: an instance in a partition nobody looked at for that long is stopped; the next use starts it again. */
export const PARTITION_PLUGIN_IDLE_MS = 10 * 60_000;

interface Running<Handle> {
  readonly key: string;
  readonly scope: PartitionPluginScope;
  readonly ready: Promise<Handle>;
  /** The started instance, once `ready` settled with it. */
  handle?: Handle;
  leases: number;
  /** Callers currently awaiting `ready`: `sweep()` never treats an instance with pending waiters as idle. */
  pending: number;
  lastUsed: number;
}

/** How often `acquire` reads the membership again when instances were stopped while it read; past that it gives up instead of racing on. */
const MEMBERSHIP_READS = 4;

const keyOf = (pluginId: string, partitionId: string) => JSON.stringify([pluginId, partitionId]);

export class PartitionPluginAssembly<Handle extends PartitionPluginHandle = PartitionPluginHandle> {
  private readonly running = new Map<string, Running<Handle>>();
  /** Instances whose stop has begun and not finished: a new instance of the same pair starts only after it (two never overlap). */
  private readonly stopping = new Map<string, Promise<void>>();
  /** Counts every stop request, so an `acquire` that read the membership before one knows its reading may be stale. */
  private stops = 0;
  private closed = false;
  private readonly idleMs: number;
  private readonly now: () => number;

  constructor(private readonly options: PartitionPluginAssemblyOptions<Handle>) {
    this.idleMs = options.idleMs ?? PARTITION_PLUGIN_IDLE_MS;
    this.now = options.now ?? Date.now;
  }

  /**
   * The instance of this plugin in this partition, started if it is not running. Refused when the plugin is not assembled per partition, is not
   * installed, or is not enabled in this partition: a partition never runs a plugin it did not choose. Refused too when another plugin enabled
   * here declares the same library name (S-partition-isolation).
   */
  async acquire(pluginId: string, partitionId: string, reason: PartitionWakeReason): Promise<PartitionPluginLease> {
    const library = this.options.library(pluginId);
    if (library === null) throw new ActionError("actions.plugin_unavailable", "这个插件还不按分区运行");
    const record = this.options.installation(pluginId);
    if (!record) throw new ActionError("actions.plugin_unavailable", "这个插件没有安装");
    const key = keyOf(pluginId, partitionId);
    for (let read = 0; ; read += 1) {
      if (this.closed) throw new ActionError("actions.plugin_unavailable", "插件宿主已关闭");
      // A stop asked for while the membership was read (it was switched off there) wins: read it again, or a disabled plugin would start.
      const seen = this.stops;
      const members = await this.options.members(partitionId);
      if (!members.includes(pluginId)) throw new ActionError("actions.plugin_unavailable", "这个插件没有在这里启用");
      if (members.some(other => other !== pluginId && this.options.library(other) === library)) {
        throw new ActionError("actions.forbidden", "这里启用的另一个插件申报了同名的库，两个都不打开，免得一个读到另一个的数据");
      }
      // The instance being stopped finishes stopping first, so two instances of one pair never run at once.
      const stopping = this.stopping.get(key);
      if (stopping) await stopping.catch(() => {});
      if (this.stops === seen && !this.closed) break;
      if (read + 1 >= MEMBERSHIP_READS) throw new ActionError("actions.plugin_unavailable", "这个插件在这里刚被停下，请再试一次");
    }
    let entry = this.running.get(key);
    if (!entry) {
      const scope = partitionPluginScope(this.options.home, partitionId, pluginId, record.install_id);
      const began = this.now();
      const ready = this.options.start(scope, reason);
      const created: Running<Handle> = { key, scope, ready, leases: 0, pending: 0, lastUsed: began };
      entry = created;
      this.running.set(key, created);
      ready.then(handle => {
        created.handle = handle;
        this.tell(scope, "start", reason, began);
      }, error => {
        if (this.running.get(key) === created) this.running.delete(key);
        this.tell(scope, "start", reason, began, error);
      });
    }
    entry.pending += 1;
    try {
      await entry.ready;
    } finally {
      entry.pending -= 1;
    }
    // Stopped while it was starting (disabled, uninstalled, its partition gone): no lease on an instance that is no longer running.
    if (this.running.get(key) !== entry) throw new ActionError("actions.plugin_unavailable", "这个插件在这里刚停下");
    entry.handle ??= await entry.ready;
    entry.leases += 1;
    entry.lastUsed = this.now();
    let released = false;
    const held = entry;
    return { scope: held.scope, release: () => {
      if (released) return;
      released = true;
      held.leases -= 1;
      held.lastUsed = this.now();
    } };
  }

  /** The started instance of this plugin in this partition, or none while it is not running (or still starting); never starts one. */
  started(pluginId: string, partitionId: string): Handle | undefined {
    return this.running.get(keyOf(pluginId, partitionId))?.handle;
  }

  /** Whether an instance of this plugin in this partition is running or currently starting; never starts one. */
  hasActiveOrStarting(pluginId: string, partitionId: string): boolean {
    return this.running.has(keyOf(pluginId, partitionId));
  }

  /** The instances running now, as (plugin, partition) pairs. */
  instances(): readonly { plugin_id: string; partition_id: string }[] {
    return [...this.running.values()].map(entry => ({ plugin_id: entry.scope.plugin_id, partition_id: entry.scope.partition_id }));
  }

  /** Stops every instance with no lease or pending waiter whose last use is older than the idle time; returns how many stopped. */
  async sweep(): Promise<number> {
    const due = [...this.running.values()].filter(entry => entry.leases === 0 && entry.pending === 0 && this.now() - entry.lastUsed >= this.idleMs);
    return this.stopEntries(due, "idle");
  }

  /** Stops this plugin's instances (it was disabled there, or uninstalled), in one partition or in all of them. */
  async stopPlugin(pluginId: string, partitionId?: string): Promise<void> {
    await this.stopEntries([...this.running.values()].filter(entry => entry.scope.plugin_id === pluginId && (partitionId === undefined || entry.scope.partition_id === partitionId)), "plugin");
  }

  /** Stops every instance in a partition, before the partition is deleted or recycled. */
  async stopPartition(partitionId: string): Promise<void> {
    await this.stopEntries([...this.running.values()].filter(entry => entry.scope.partition_id === partitionId), "partition");
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.stopEntries([...this.running.values()], "close");
    await Promise.all([...this.stopping.values()].map(stop => stop.catch(() => {})));
  }

  private async stopEntries(entries: readonly Running<Handle>[], reason: PartitionStopReason): Promise<number> {
    this.stops += 1;
    const failures: unknown[] = [];
    const stops: Promise<void>[] = [];
    let stopped = 0;
    for (const entry of entries) {
      if (this.running.get(entry.key) !== entry) continue;
      this.running.delete(entry.key);
      // Registered before anything is awaited, so an `acquire` of the same pair waits for this stop to finish.
      const stop = (async () => {
        let handle: Handle;
        try {
          handle = await entry.ready;
        } catch {
          // Start failed before producing an instance: nothing to stop here; callers awaiting `acquire()` still receive the start error.
          return;
        }
        stopped += 1;
        const began = this.now();
        try {
          await handle.stop();
        } catch (error) {
          this.tell(entry.scope, "stop", reason, began, error);
          throw error;
        }
        this.tell(entry.scope, "stop", reason, began);
      })();
      const tracked = stop.finally(() => { if (this.stopping.get(entry.key) === tracked) this.stopping.delete(entry.key); });
      this.stopping.set(entry.key, tracked);
      stops.push(tracked.catch(error => { failures.push(error); }));
    }
    await Promise.all(stops);
    if (failures.length) throw new AggregateError(failures, "分区插件实例停止失败");
    return stopped;
  }

  private tell(scope: PartitionPluginScope, stage: "start" | "stop", reason: PartitionWakeReason | PartitionStopReason, began: number, error?: unknown): void {
    const code = error instanceof ActionError ? error.code : undefined;
    try {
      this.options.lifecycle?.({ scope, stage, reason, outcome: error === undefined ? "succeeded" : "failed", started_at: new Date(began).toISOString(),
        duration_ms: Math.max(0, this.now() - began), ...(code ? { code } : {}) });
    } catch { /* A record that could not be made does not change the instance. */ }
  }
}

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

/** The scope of one (plugin, partition) instance: every path is derived from `partitionRoot`, never from the plugin. */
export function partitionPluginScope(home: string, partitionId: string, pluginId: string, installId: string): PartitionPluginScope {
  if (!SEGMENT.test(installId)) throw new ActionError("actions.plugin_unavailable", "安装 ID 不是一个普通的目录名");
  const root = partitionRoot(realpathSync(home), partitionId);
  const inside = (candidate: string): string => {
    const resolved = resolveExisting(candidate);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new ActionError("actions.forbidden", "插件只能读写它所在分区的库和文件");
    }
    return resolved;
  };
  return Object.freeze({
    partition_id: partitionId, plugin_id: pluginId, install_id: installId, root,
    libraryPath: (storeName: string) => partitionLibraryPath(root, storeName),
    ownerFilesRoot: () => path.join(root, "plugin-files", installId),
    assertOwnPath: inside,
  });
}

/** `<partition root>/libraries/<store>.db` (U2): the one place a partition's own library's path is made, from a partition root `partitionRoot` gave. */
export function partitionLibraryPath(root: string, storeName: string): string {
  if (!/^[a-z][a-z0-9-]*$/u.test(storeName)) throw new ActionError("actions.plugin_unavailable", "插件库名称必须是可信的单个目录名");
  return path.join(root, "libraries", `${storeName}.db`);
}

/** The real location of a path, through the deepest part of it that exists: a link inside a partition that points elsewhere counts as elsewhere. */
function resolveExisting(candidate: string): string {
  const absolute = path.resolve(candidate);
  const rest: string[] = [];
  let at = absolute;
  for (;;) {
    try {
      return path.join(realpathSync(at), ...rest.reverse());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = path.dirname(at);
      if (parent === at) return absolute;
      rest.push(path.basename(at));
      at = parent;
    }
  }
}

/**
 * Opens one of an instance's own libraries, `<partition root>/libraries/<store>.db`, with its declaration's one current schema (U2): a writer and a
 * read-only reader, bound to the Home's storage space. The path is the scope's, checked again after the directory exists, so a link swapped in under
 * the partition root cannot lead the library elsewhere.
 */
export function openPartitionPluginLibrary(scope: PartitionPluginScope, home: string, declaration: PluginDatabaseDeclaration): { writer: LibraryConnection; reader: LibraryConnection; close(): void } {
  const file = scope.libraryPath(declaration.store_name);
  // Checked before the directory is made (a link swapped in must not have it made elsewhere) and again after.
  scope.assertOwnPath(path.dirname(file));
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  scope.assertOwnPath(file);
  const writer = openHomeSqliteFile(file);
  let reader: LibraryConnection | undefined;
  try {
    applySqliteBaseline(writer, file, declaration);
    bindDatabaseSpace(writer, ensureStorageSpace(home));
    try {
      chmodSync(file, 0o600);
    } catch { /* Mode is best-effort on this volume. */ }
    reader = openHomeSqliteFile(file, { readOnly: true });
  } catch (error) {
    writer.close();
    throw error;
  }
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    reader!.close();
    writer.close();
  };
  return { writer, reader, close };
}
