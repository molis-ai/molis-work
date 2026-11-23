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
  return { get: installId => rememberInDirectoryPass(rows, installId, () => rows.get(installId)), list: () => rows.list(), save: record => {
    rows.save(record);
    forgetInDirectoryPass(rows, record.install_id);
  } };
}

/** Batch 47 retired the studio's unsigned installations. The raw rows remain with their data. */
export function isRetiredStudioInstallation(record: PluginInstanceRecord): boolean {
  const id = record.plugin_id.slice("io.molis.work.generated.".length);
  return record.execution === "sandbox" && record.publisher_trust === "unsigned" && record.publisher_id === "molis-studio"
    && /^io\.molis\.work\.generated\.[a-f0-9-]{36}$/u.test(record.plugin_id) && record.publisher_signature === "agent-built:" + id;
}
