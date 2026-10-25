import { existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { listCatalogProjectsForUninstall } from "@molis-ai/molis-work-module-projects";
import { readPluginRuntimeRecords } from "@molis-ai/molis-work-plugin-runtime";
import { LocalCatalogMetadata, LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import { openReadOnlyHomePluginStore } from "./home-plugin-store.js";
import { hostLog } from "./host-log.js";
import { isOwnedCatalogOwner } from "./project-catalog-contract.js";

// What the Home's shared data (a plugin's default rules) asks before it goes: does another installation of the plugin still depend on it?
// Read-only and synchronous (cleanup runs inside the install boundary), over the Home's install records as they are on disk.

/** An installation still has a claim on what its plugin declared while it is installed, or uninstalled with its data kept for a reinstall. */
const holds = (record: PluginInstanceRecord, pluginId: string): boolean => record.plugin_id === pluginId && (record.state !== "uninstalled" || record.retain_private_data);

function heldInHomeStore(home: string, pluginId: string): boolean {
  const db = openReadOnlyHomePluginStore(home);
  if (!db) return false;
  try { return readPluginRuntimeRecords(db).some(record => holds(record, pluginId)); } finally { db.close(); }
}

function heldInProject(file: string, pluginId: string): boolean {
  const project = new LocalSqliteStorage(file, { readonly: true });
  try {
    // A project that never ran a Plugin Runtime has no table, and so holds nothing.
    if (!project.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'plugin_runtime_installs'").get()) return false;
    return readPluginRuntimeRecords(project.db).some(record => holds(record, pluginId));
  } finally { project.close(); }
}

function heldInOtherProject(home: string, pluginId: string, projectId: string | null): boolean {
  const catalogPath = join(home, "projects", "catalog.db");
  if (!existsSync(catalogPath)) return false;
  const catalog = new LocalSqliteStorage(catalogPath, { readonly: true });
  try {
    if (!isOwnedCatalogOwner(new LocalCatalogMetadata(catalog.db).owner())) return true;
    const root = resolve(home, "projects") + sep;
    return listCatalogProjectsForUninstall(catalog.db).some(project => {
      if (project.project_id === projectId) return false;
      const file = resolve(project.database_path);
      // A project file this Host would not have put there is not read; what is in it cannot be told.
      if (!file.startsWith(root)) return true;
      return existsSync(file) && heldInProject(file, pluginId);
    });
  } finally { catalog.close(); }
}

/**
 * Whether the plugin is installed anywhere but in `projectId` (null: the Home's own activation) with a claim on its declared rules: another
 * project's install, or the Home's. The last installation to go is the one whose cleanup takes the rules. An installation that cannot be
 * read counts as holding: a rule kept is harmless, and one deleted under another project is not.
 */
export function pluginHeldElsewhere(home: string, pluginId: string, projectId: string | null): boolean {
  try {
    return (projectId !== null && heldInHomeStore(home, pluginId)) || heldInOtherProject(home, pluginId, projectId);
  } catch (error) {
    hostLog.warn("functions", "plugin_holders_unreadable", error, { plugin_id: pluginId, project_id: projectId });
    return true;
  }
}
