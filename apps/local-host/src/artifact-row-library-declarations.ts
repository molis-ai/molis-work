import type { PluginDatabaseDeclaration, PluginManifest, PluginPinnedRowsDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginSyncDatabaseDeclaration } from "./plugin-sync-database.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";

/** A built-in library that pins artifacts on its rows: the Home's one file (`databases.home`) or a file in each partition (`databases.partition`). */
export interface ArtifactRowLibraryDeclaration {
  readonly manifest: PluginManifest;
  readonly scope: "home" | "partition";
  /** The library as the plugin declared it; for a partition's library, with its sync objects, which is the file's whole baseline. */
  readonly library: PluginDatabaseDeclaration;
  readonly pins: PluginPinnedRowsDeclaration;
}

/** The built-in libraries that pin artifacts on rows. Apart from the storage policy, which the statement worker loads. */
export function artifactRowLibraryDeclarations(): readonly ArtifactRowLibraryDeclaration[] {
  return PLATFORM_PLUGIN_REGISTRATIONS.flatMap(({ manifest }): ArtifactRowLibraryDeclaration[] => {
    const home = manifest.databases?.home, partition = manifest.databases?.partition;
    if (home?.project_rows?.artifact_join) return [{ manifest, scope: "home", library: home, pins: home.project_rows.artifact_join }];
    if (partition?.pinned_rows) return [{ manifest, scope: "partition", library: pluginSyncDatabaseDeclaration(manifest, partition), pins: partition.pinned_rows }];
    return [];
  });
}
