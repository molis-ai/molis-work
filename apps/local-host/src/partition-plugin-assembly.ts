import { chmodSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseDeclaration, PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { partitionRoot } from "@molis-ai/molis-work-module-projects";
import { applySqliteBaseline, bindDatabaseSpace, ensureStorageSpace, openHomeSqliteFile } from "@molis-ai/molis-work-storage";

type LibraryConnection = ReturnType<typeof openHomeSqliteFile>;

// The one assembly (specs/unified-partition-plugins §4.2 第 2 条, batch 106): an instance per (plugin, partition), started when its partition
// is opened, a due entry fires, a push or a synchronized write arrives, and stopped again when idle, so the number of running instances follows
// the partitions in use, not the number of projects. Each instance is handed its own partition's files and nothing else (S-partition-isolation):
// its libraries under `<partition root>/libraries/`, its plugin files under `<partition root>/plugin-files/<install>/`. Which plugins a partition
// runs is `partition_plugins` (`partitions.plugins.set@1`); which are installed is the Home's one install table (`plugin-runtime.db`).
//
// It runs alongside the old assemblies until batches 107–109 move every plugin to it (V1: add, then move, then delete). Only a plugin whose
// Manifest declares `databases.partition` is assembled here, and the old ones skip such a plugin (`assembledPerPartition`), so no plugin ever
// has two instances on the same partition. It reads none of the old assemblies' records.

/** Whether a plugin is run by the per-partition assembly: its Manifest declares a library in each partition. The old assemblies skip it. */
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

export interface PartitionPluginAssemblyOptions {
  readonly home: string;
  /** Whether this plugin is assembled per partition: its Manifest declares `databases.partition`. */
  assembled(pluginId: string): boolean;
  /** The plugins enabled in this partition, as `partition_plugins` holds them now. */
  members(partitionId: string): Promise<readonly string[]> | readonly string[];
  /** The plugin's installation in the Home's one install table, or null when it is not installed. */
  installation(pluginId: string): PluginInstanceRecord | null;
  /** Starts the instance with its scope; production gives it a platform of its own over the partition's files. */
  start(scope: PartitionPluginScope, reason: PartitionWakeReason): Promise<PartitionPluginHandle>;
  /** How long an instance with no lease stays up after its last use; the platform's policy, the same for every plugin. */
  readonly idleMs?: number;
  readonly now?: () => number;
}

/** One use of an instance; the instance may stop once every lease is released and the idle time has passed. */
export interface PartitionPluginLease {
  readonly scope: PartitionPluginScope;
  release(): void;
}

/** Ten minutes: an instance in a partition nobody looked at for that long is stopped; the next use starts it again. */
export const PARTITION_PLUGIN_IDLE_MS = 10 * 60_000;

interface Running {
  readonly key: string;
  readonly scope: PartitionPluginScope;
  readonly ready: Promise<PartitionPluginHandle>;
  leases: number;
  lastUsed: number;
}

const keyOf = (pluginId: string, partitionId: string) => JSON.stringify([pluginId, partitionId]);

export class PartitionPluginAssembly {
  private readonly running = new Map<string, Running>();
  private readonly idleMs: number;
  private readonly now: () => number;

  constructor(private readonly options: PartitionPluginAssemblyOptions) {
    this.idleMs = options.idleMs ?? PARTITION_PLUGIN_IDLE_MS;
    this.now = options.now ?? Date.now;
  }

  /**
   * The instance of this plugin in this partition, started if it is not running. Refused when the plugin is not assembled per partition, is not
   * installed, or is not enabled in this partition: a partition never runs a plugin it did not choose.
   */
  async acquire(pluginId: string, partitionId: string, reason: PartitionWakeReason): Promise<PartitionPluginLease> {
    if (!this.options.assembled(pluginId)) throw new ActionError("actions.plugin_unavailable", "这个插件还不按分区运行");
    const record = this.options.installation(pluginId);
    if (!record) throw new ActionError("actions.plugin_unavailable", "这个插件没有安装");
    if (!(await this.options.members(partitionId)).includes(pluginId)) throw new ActionError("actions.plugin_unavailable", "这个插件没有在这里启用");
    const key = keyOf(pluginId, partitionId);
    let entry = this.running.get(key);
    if (!entry) {
      const scope = partitionPluginScope(this.options.home, partitionId, pluginId, record.install_id);
      const ready = this.options.start(scope, reason);
      entry = { key, scope, ready, leases: 0, lastUsed: this.now() };
      this.running.set(key, entry);
      ready.catch(() => {
        if (this.running.get(key) === entry) this.running.delete(key);
      });
    }
    await entry.ready;
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

  /** The instances running now, as (plugin, partition) pairs. */
  instances(): readonly { plugin_id: string; partition_id: string }[] {
    return [...this.running.values()].map(entry => ({ plugin_id: entry.scope.plugin_id, partition_id: entry.scope.partition_id }));
  }

  /** Stops every instance with no lease whose last use is older than the idle time; returns how many stopped. */
  async sweep(): Promise<number> {
    const due = [...this.running.values()].filter(entry => entry.leases === 0 && this.now() - entry.lastUsed >= this.idleMs);
    await this.stopEntries(due);
    return due.length;
  }

  /** Stops this plugin's instances (it was disabled there, or uninstalled), in one partition or in all of them. */
  stopPlugin(pluginId: string, partitionId?: string): Promise<void> {
    return this.stopEntries([...this.running.values()].filter(entry => entry.scope.plugin_id === pluginId && (partitionId === undefined || entry.scope.partition_id === partitionId)));
  }

  /** Stops every instance in a partition, before the partition is deleted or recycled. */
  stopPartition(partitionId: string): Promise<void> {
    return this.stopEntries([...this.running.values()].filter(entry => entry.scope.partition_id === partitionId));
  }

  async close(): Promise<void> { await this.stopEntries([...this.running.values()]); }

  private async stopEntries(entries: readonly Running[]): Promise<void> {
    const failures: unknown[] = [];
    for (const entry of entries) {
      if (this.running.get(entry.key) !== entry) continue;
      this.running.delete(entry.key);
      try {
        await (await entry.ready).stop();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) throw new AggregateError(failures, "分区插件实例停止失败");
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
    libraryPath: (storeName: string) => {
      if (!/^[a-z][a-z0-9-]*$/u.test(storeName)) throw new ActionError("actions.plugin_unavailable", "插件库名称必须是可信的单个目录名");
      return path.join(root, "libraries", `${storeName}.db`);
    },
    ownerFilesRoot: () => path.join(root, "plugin-files", installId),
    assertOwnPath: inside,
  });
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
