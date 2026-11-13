import type { PluginDirectory, PluginDirectoryEntry } from "./plugin-directory-words.js";
import { UiViewRegistry, type UiPlacedView } from "./view-registry.js";

/** One view a directory entry places in a slot, with its plugin's shell key. */
export interface PlacedDirectoryView {
  readonly id: string;
  readonly entry: PluginDirectoryEntry;
  readonly view: UiPlacedView;
}

export type DirectoryRegistry = UiViewRegistry<PluginDirectoryEntry>;

/**
 * One registry over the whole directory, built once per question and read by slot: a plugin the project chooses counts only when
 * `enabled` names it; one in the project because it runs there always counts.
 */
export function directoryRegistry(directory: PluginDirectory, enabled: readonly string[]): DirectoryRegistry {
  const active = new Set(enabled);
  return new UiViewRegistry(directory.map(entry => ({ manifest: entry, enabled: !entry.chosen || active.has(entry.id) })));
}

/**
 * The directory's views in one slot, in the order the Manifests declare (then plugin and view id). A plugin the project chooses
 * counts only when `enabled` names it; one in the project because it runs there always counts. The shell's rail and the Host's
 * project home both place plugins by this one rule.
 */
export function placedDirectoryViews(registry: DirectoryRegistry, slot: "navigator" | "island" | "side" | "stage"): PlacedDirectoryView[] {
  return registry.placements(slot).map(({ manifest, view }) => ({ id: manifest.id, entry: manifest, view }));
}

/** The plugins the project does not choose that have no navigator or island view: they open at their stage, after the rail's views. */
export function stageOnlyDirectoryViews(registry: DirectoryRegistry): PlacedDirectoryView[] {
  const placed = new Set([...placedDirectoryViews(registry, "navigator"), ...placedDirectoryViews(registry, "island")].map(item => item.id));
  const seen = new Set<string>();
  return placedDirectoryViews(registry, "stage").filter(item => {
    if (item.entry.chosen || placed.has(item.id) || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
