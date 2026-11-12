import type { PluginDirectory, PluginDirectoryEntry } from "./plugin-directory-words.js";
import { UiViewRegistry, type UiPlacedView } from "./view-registry.js";

/** One view a directory entry places in a slot, with its plugin's shell key. */
export interface PlacedDirectoryView {
  readonly id: string;
  readonly entry: PluginDirectoryEntry;
  readonly view: UiPlacedView;
}

/**
 * The directory's views in one slot, in the order the Manifests declare (then plugin and view id). A plugin the project chooses
 * counts only when `enabled` names it; one in the project because it runs there always counts. The shell's rail and the Host's
 * project home both place plugins by this one rule.
 */
export function placedDirectoryViews(directory: PluginDirectory, enabled: readonly string[], slot: "navigator" | "island" | "side" | "stage"): PlacedDirectoryView[] {
  return directory.flatMap(entry => new UiViewRegistry([{ manifest: entry, enabled: !entry.chosen || enabled.includes(entry.id) }]).slot(slot)
    .map(view => ({ id: entry.id, entry, view })))
    .sort((left, right) => left.view.order - right.view.order
      || left.view.plugin_id.localeCompare(right.view.plugin_id)
      || left.view.view_id.localeCompare(right.view.view_id));
}

/** The plugins the project does not choose that have no navigator or island view: they open at their stage, after the rail's views. */
export function stageOnlyDirectoryViews(directory: PluginDirectory, enabled: readonly string[]): PlacedDirectoryView[] {
  const placed = new Set([...placedDirectoryViews(directory, enabled, "navigator"), ...placedDirectoryViews(directory, enabled, "island")].map(item => item.id));
  const seen = new Set<string>();
  return placedDirectoryViews(directory, enabled, "stage").filter(item => {
    if (item.entry.chosen || placed.has(item.id) || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
