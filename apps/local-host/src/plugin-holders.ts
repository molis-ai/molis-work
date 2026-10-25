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

/** The projects whose library holds a claim of the plugin, and whether every project's records could be read; `except` is not read. The Home's own activation is not a project. */
function projectsHolding(home: string, pluginId: string, except: string | null = null): { project_ids: string[]; complete: boolean } {
  const catalogPath = join(home, "projects", "catalog.db");
  if (!existsSync(catalogPath)) return { project_ids: [], complete: true };
  const catalog = new LocalSqliteStorage(catalogPath, { readonly: true });
  try {
    if (!isOwnedCatalogOwner(new LocalCatalogMetadata(catalog.db).owner())) return { project_ids: [], complete: false };
    const root = resolve(home, "projects") + sep;
    const found: string[] = [];
    let complete = true;
    for (const project of listCatalogProjectsForUninstall(catalog.db)) {
      if (project.project_id === except) continue;
      const file = resolve(project.database_path);
      // A project file this Host would not have put there is not read; what is in it cannot be told.
      if (!file.startsWith(root)) { complete = false; continue; }
      if (!existsSync(file)) continue;
      try { if (heldInProject(file, pluginId)) found.push(project.project_id); }
      catch (error) { complete = false; hostLog.warn("functions", "plugin_holders_unreadable", error, { plugin_id: pluginId, project_id: project.project_id }); }
    }
    return { project_ids: found, complete };
  } finally { catalog.close(); }
}

/**
 * The projects the plugin is installed in, or uninstalled with its data kept: what it can be told about itself (`services.installations.projects()`).
 * A project that cannot be read makes the answer incomplete rather than silently absent.
 */
export function pluginInstalledProjects(home: string, pluginId: string): { project_ids: string[]; complete: boolean } {
  try { return projectsHolding(home, pluginId); }
  catch (error) {
    hostLog.warn("functions", "plugin_holders_unreadable", error, { plugin_id: pluginId });
    return { project_ids: [], complete: false };
  }
}

/**
 * Whether the plugin is installed anywhere but in `projectId` (null: the Home's own activation) with a claim on its declared rules: another
 * project's install, or the Home's. The last installation to go is the one whose cleanup takes the rules. An installation that cannot be
 * read counts as holding: a rule kept is harmless, and one deleted under another project is not.
 */
export function pluginHeldElsewhere(home: string, pluginId: string, projectId: string | null): boolean {
  try {
    if (projectId !== null && heldInHomeStore(home, pluginId)) return true;
    const { project_ids, complete } = projectsHolding(home, pluginId, projectId);
    return !complete || project_ids.length > 0;
  } catch (error) {
    hostLog.warn("functions", "plugin_holders_unreadable", error, { plugin_id: pluginId, project_id: projectId });
    return true;
  }
}
