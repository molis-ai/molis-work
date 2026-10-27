import { hostLog } from "./host-log.js";
import { heldInstalls } from "./plugin-holders.js";

/**
 * The projects of the Home in which the plugin is installed, or uninstalled with its data kept: what the plugin can be told about itself
 * (`services.installations.projects()`). It reads what `heldInstalls` reads, so it names the same installations the plugin's rules wait for.
 * What cannot be read is not guessed at and not half-answered: none are listed and `complete` is false.
 */
export function pluginInstalledProjects(home: string, pluginId: string): { project_ids: string[]; complete: boolean } {
  try {
    const ids = new Set<string>();
    for (const held of heldInstalls(home)) if (held.record.plugin_id === pluginId && held.scope.kind === "project") ids.add(held.scope.project_id);
    return { project_ids: [...ids], complete: true };
  } catch (error) {
    hostLog.warn("functions", "plugin_installed_projects_unreadable", error, { plugin_id: pluginId });
    return { project_ids: [], complete: false };
  }
}
