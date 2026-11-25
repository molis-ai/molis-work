import type { PluginInstanceRecord, PluginRuntimeRepository } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PartitionPluginRuntimeRepository, SqlitePluginRuntimeRepository, type PluginRuntimeDatabase } from "@molis-ai/molis-work-plugin-runtime";
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
  // A plugin with a library in each partition has its installation in the Home's one install table and its lifecycle here (batch 107): it is
  // read from there, and a row of it left in this table from before is not its record.
  const partition = partitionInstallRecords(joined.installs, db), own = (record: PluginInstanceRecord | null) => !!record && joined.plugins().has(record.plugin_id);
  return {
    get: installId => rememberInDirectoryPass(rows, installId, () => {
      const here = rows.get(installId);
      if (here && !own(here)) return here;
      const there = partition.get(installId);
      return own(there) ? there : null;
    }),
    list: () => [...rows.list().filter(record => !own(record)), ...partition.list().filter(own)],
    save: record => {
      if (own(record)) partition.save(record); else rows.save(record);
      forgetInDirectoryPass(rows, record.install_id);
    },
  };
}

/** For each partition's database: the Home install table its per-partition plugins' records are in, and which plugins those are. */
const partitionInstalls = new WeakMap<PluginRuntimeDatabase, { installs: PluginRuntimeDatabase; plugins(): ReadonlySet<string> }>();

/** Where this plugin's installation is kept when it runs per partition: the Home install table (its archived builds are there too); else none. */
export function partitionInstallDatabase(partition: PluginRuntimeDatabase, pluginId: string): PluginRuntimeDatabase | undefined {
  const joined = partitionInstalls.get(partition);
  return joined?.plugins().has(pluginId) ? joined.installs : undefined;
}

/** The per-partition assembly says where a partition's per-partition plugins keep their installations, so every reader of the partition's records sees them. */
export function notePartitionInstalls(partition: PluginRuntimeDatabase, installs: PluginRuntimeDatabase, plugins: () => ReadonlySet<string>): void {
  if (partition === installs) throw new Error("分区的安装记录要从 Home 的安装表读");
  partitionInstalls.set(partition, { installs, plugins });
}

/**
 * A per-partition instance's installation records (batch 107): install facts from the Home's install table, its lifecycle from its own
 * partition. The Home plugin store and every partition instance each open the install table themselves, so these are read as they are on
 * every call, with no directory-pass memory: a write through any of them is what the next read through any other sees.
 */
export function partitionInstallRecords(installs: PluginRuntimeDatabase, partition: PluginRuntimeDatabase): PluginRuntimeRepository {
  return new PartitionPluginRuntimeRepository(new SqlitePluginRuntimeRepository(installs), partition);
}
