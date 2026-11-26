import type { PluginInstanceRecord, PluginRuntimeRepository } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SqlitePluginRuntimeRepository, type PluginRuntimeDatabase } from "@molis-ai/molis-work-plugin-runtime";
import { forgetInDirectoryPass, rememberInDirectoryPass } from "@molis-ai/molis-work-kernel";

/**
 * The installation records a Plugin Runtime reads. Every action of an installation asks its record for its availability; within one
 * action directory that is one read per installation (`rememberInDirectoryPass`). Anything else, a call included, reads the row as it is,
 * and a save within the pass makes the next read in it fresh.
 */
export function pluginInstallRecords(db: PluginRuntimeDatabase): PluginRuntimeRepository {
  const rows = new SqlitePluginRuntimeRepository(db);
  const joined = partitionInstalls.get(db);
  if (!joined) return { get: installId => rememberInDirectoryPass(rows, installId, () => rows.get(installId)), list: () => rows.list(), save: record => {
    rows.save(record);
    forgetInDirectoryPass(rows, record.install_id);
  } };
  // A plugin with a library in each partition has its installation in the Home's one install table (batch 107): it is read from there, and a
  // row of it left in this table from before is not its record. Each partition instance keeps its running state in memory (`plugin-platform`):
  // while it runs here, its record is read and written through that instance, so this partition's readers see it running; else the Home row.
  // The Home install table is opened on the first read that needs it, not when the partition opens: a Home whose table cannot be opened
  // (too new, damaged) leaves the partition's own plugins readable, and its per-partition plugins read as not installed here; starting
  // one of them opens the table itself and reports why it cannot (`partition-plugin-host`).
  // Asked each time: the Home's table is closed with the partition plugin host, and a later read opens a new one or none.
  let opened: { db: PluginRuntimeDatabase; rows: SqlitePluginRuntimeRepository } | undefined;
  const partition = () => {
    const db = joined.installs();
    if (opened?.db !== db) opened = { db, rows: new SqlitePluginRuntimeRepository(db) };
    return opened.rows;
  };
  const readable = () => { try { return partition(); } catch { return undefined; } };
  const own = (record: PluginInstanceRecord | null) => !!record && joined.plugins().has(record.plugin_id);
  const live = (record: PluginInstanceRecord) => joined.running(record.plugin_id)?.get(record.install_id) ?? record;
  return {
    get: installId => rememberInDirectoryPass(rows, installId, () => {
      const here = rows.get(installId);
      if (here && !own(here)) return here;
      const there = readable()?.get(installId) ?? null;
      return there && own(there) ? live(there) : null;
    }),
    list: () => [...rows.list().filter(record => !own(record)), ...(readable()?.list() ?? []).filter(own).map(live)],
    save: record => {
      if (!own(record)) rows.save(record);
      else {
        const instance = joined.running(record.plugin_id);
        // The instance keeps the lifecycle and hands durable facts to the Home row; with none running here, only the installation's own
        // facts reach the Home row (installed, disabled, uninstalled), never one partition's lifecycle (running, crashed, quarantined).
        if (instance) instance.save(record);
        else partition().save(INSTALL_STATES.has(record.state) ? record : { ...record, state: partition().get(record.install_id)?.state ?? "installed", recovery_count: 0, last_error_code: null });
      }
      forgetInDirectoryPass(rows, record.install_id);
    },
  };
}

/** For each partition's database: the Home install table its per-partition plugins' records are in, and which plugins those are. */
/** The states that are the installation's, kept in the Home row; any other is one partition instance's lifecycle. */
const INSTALL_STATES: ReadonlySet<PluginInstanceRecord["state"]> = new Set(["installed", "disabled", "uninstalled"]);

interface PartitionInstalls {
  /** The Home install table, opened when first needed. */
  installs(): PluginRuntimeDatabase;
  plugins(): ReadonlySet<string>;
  /** The records of this plugin's instance running in this partition, if one is. */
  running(pluginId: string): PluginRuntimeRepository | undefined;
}
const partitionInstalls = new WeakMap<PluginRuntimeDatabase, PartitionInstalls>();

/** Where this plugin's installation is kept when it runs per partition: the Home install table (its archived builds are there too); else none. */
export function partitionInstallDatabase(partition: PluginRuntimeDatabase, pluginId: string): PluginRuntimeDatabase | undefined {
  const joined = partitionInstalls.get(partition);
  return joined?.plugins().has(pluginId) ? joined.installs() : undefined;
}

/** The per-partition assembly says where a partition's per-partition plugins keep their installations, so every reader of the partition's records sees them. */
export function notePartitionInstalls(partition: PluginRuntimeDatabase, installs: () => PluginRuntimeDatabase, plugins: () => ReadonlySet<string>,
  running: (pluginId: string) => PluginRuntimeRepository | undefined): void {
  partitionInstalls.set(partition, { installs: () => {
    const db = installs();
    if (db === partition) throw new Error("分区的安装记录要从 Home 的安装表读");
    return db;
  }, plugins, running });
}
