import { existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { listCatalogProjectsForUninstall } from "@molis-ai/molis-work-module-projects";
import { readPluginReleaseManifest, readPluginRuntimeRecords } from "@molis-ai/molis-work-plugin-runtime";
import { LocalCatalogMetadata, LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import { openReadOnlyHomePluginStore } from "./home-plugin-store.js";
import { hostLog } from "./host-log.js";
import { isOwnedCatalogOwner } from "./project-catalog-contract.js";

// What the Home's shared data (a plugin's default rules) asks before it goes: does another installation of the plugin still depend on it?
// Read-only and synchronous (cleanup runs inside the install boundary), over the Home's install records as they are on disk.

/** An installation still has a claim on what its plugin declared while it is installed, or uninstalled with its data kept for a reinstall. */
const holdsInstall = (record: PluginInstanceRecord): boolean => record.state !== "uninstalled" || record.retain_private_data;

/** Where an installation lives: the Home's own plugin store, or one project's library. */
export type InstallScope = { readonly kind: "home" } | { readonly kind: "project"; readonly project_id: string };

/** The installation that is asking: its scope and its `install_id`, so it alone is left out of what others hold. */
export interface InstallRef { readonly scope: InstallScope; readonly install_id: string }

/** An installation that still holds its plugin's names, with the Manifest it was started with (null: no release row kept it) and where it lives. */
export interface HeldInstall { readonly record: PluginInstanceRecord; readonly manifest: PluginManifest | null; readonly scope: InstallScope }

type RuntimeDatabase = Parameters<typeof readPluginRuntimeRecords>[0];
const heldIn = (db: RuntimeDatabase, scope: InstallScope): HeldInstall[] =>
  readPluginRuntimeRecords(db).filter(holdsInstall).map(record => ({ record, manifest: readPluginReleaseManifest(db, record), scope }));

/**
 * Whether the plugin is installed anywhere but as `self` (an installation, or null: the Home's own activation, whose scope is the Home's
 * and has no installation of its own to leave out) with a claim on its declared rules. The last installation to go is the one whose
 * cleanup takes the rules. Only the exact installation `self` names is left out: another installation in the same project or in the
 * Home, whatever its signature, still holds. An installation that cannot be read counts as holding: a rule kept is harmless, and
 * one deleted under another installation is not.
 */
export function pluginHeldElsewhere(home: string, pluginId: string, self: InstallRef | null): boolean {
  try {
    return heldInstalls(home).some(held => held.record.plugin_id === pluginId && !(self !== null && held.record.install_id === self.install_id && sameScope(held.scope, self.scope)));
  } catch (error) {
    hostLog.warn("functions", "plugin_holders_unreadable", error, { plugin_id: pluginId, install_id: self?.install_id ?? null });
    return true;
  }
}

const sameScope = (a: InstallScope, b: InstallScope): boolean => a.kind === b.kind && (a.kind === "home" || (b.kind === "project" && a.project_id === b.project_id));

/**
 * Every installation that holds a claim anywhere in the Home, with the scope it lives in (the Home's plugin store, or a project's id):
 * the Home's own plugin store and each project's, read as they are on disk. This is where a plugin's names are kept one owner for
 * (S-82) and where the last holder of a plugin's rules is told, so what cannot be read is not guessed at: it throws, and the caller
 * refuses (or counts the plugin as held). `current` is the database of the installation scope asking, read as it is open.
 */
export function heldInstalls(home: string | null, current?: { readonly db: RuntimeDatabase; readonly scope: InstallScope }): HeldInstall[] {
  const found = current ? heldIn(current.db, current.scope) : [];
  if (home === null) return found;
  const store = openReadOnlyHomePluginStore(home);
  if (store) try { found.push(...heldIn(store, { kind: "home" })); } finally { store.close(); }
  const catalogPath = join(home, "projects", "catalog.db");
  if (!existsSync(catalogPath)) return found;
  const catalog = new LocalSqliteStorage(catalogPath, { readonly: true });
  try {
    if (!isOwnedCatalogOwner(new LocalCatalogMetadata(catalog.db).owner())) throw new Error("项目目录不是本 Home 建的，读不了其中的安装");
    const root = resolve(home, "projects") + sep;
    for (const project of listCatalogProjectsForUninstall(catalog.db)) {
      const file = resolve(project.database_path);
      if (!file.startsWith(root)) throw new Error(`项目库 ${project.project_id} 不在本 Home 的项目目录里，读不了其中的安装`);
      const db = new LocalSqliteStorage(file, { readonly: true });
      try {
        // A project that never ran a Plugin Runtime has no table, and so holds nothing.
        if (db.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'plugin_runtime_installs'").get()) found.push(...heldIn(db.db, { kind: "project", project_id: project.project_id }));
      } finally { db.close(); }
    }
  } finally { catalog.close(); }
  // The same installation is read once: the open database of the asking scope is also a file on disk. An install id is the scope's own, so two scopes may hold the same one.
  const seen = new Set<string>();
  const keyOf = (item: HeldInstall) => `${item.scope.kind === "home" ? "home" : `project:${item.scope.project_id}`}\u0000${item.record.install_id}`;
  return found.filter(item => !seen.has(keyOf(item)) && seen.add(keyOf(item)));
}
