import type {
  ProjectPluginId,
  ProjectPluginRegistry,
} from "@molis-ai/molis-work-contracts/modules/projects";
import { PROJECT_PLUGIN_COMPANIONS } from "@molis-ai/molis-work-contracts/modules/projects";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { UiViewRegistry, type UiPlacedView } from "@molis-ai/molis-work-ui-host";
import { ARTIFACTS_PROJECT_PLUGIN_ID, artifactsManifest } from "@molis-ai/molis-work-plugin-artifacts";
import { CODING_PROJECT_PLUGIN_ID, codingManifest } from "@molis-ai/molis-work-plugin-coding";
import { FEED_PROJECT_PLUGIN_ID, feedManifest } from "@molis-ai/molis-work-plugin-feed";
import { GOALS_PROJECT_PLUGIN_ID, goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { INBOX_PROJECT_PLUGIN_ID, inboxManifest } from "@molis-ai/molis-work-plugin-inbox";
import { SHELF_PROJECT_PLUGIN_ID, shelfManifest } from "@molis-ai/molis-work-plugin-shelf";
import { WORK_PROJECT_PLUGIN_ID, workManifest } from "@molis-ai/molis-work-plugin-work";

/**
 * One Plugin this build ships. Adding a Plugin means adding an entry here and
 * nothing else: navigation, settings placement and project enablement are all
 * derived from its Manifest.
 */
export interface BuiltinPluginEntry {
  /** Identity the project database stores. Distinct from the Manifest's global id. */
  project_plugin_id: ProjectPluginId;
  manifest: PluginManifest;
  /** Always available rather than per-project. Shelf is personal, not project scoped. */
  personal?: boolean;
}

export const BUILTIN_PLUGIN_CATALOG: readonly BuiltinPluginEntry[] = [
  { project_plugin_id: GOALS_PROJECT_PLUGIN_ID, manifest: goalsManifest },
  { project_plugin_id: WORK_PROJECT_PLUGIN_ID, manifest: workManifest },
  { project_plugin_id: INBOX_PROJECT_PLUGIN_ID, manifest: inboxManifest },
  { project_plugin_id: FEED_PROJECT_PLUGIN_ID, manifest: feedManifest },
  { project_plugin_id: SHELF_PROJECT_PLUGIN_ID, manifest: shelfManifest, personal: true },
  { project_plugin_id: ARTIFACTS_PROJECT_PLUGIN_ID, manifest: artifactsManifest },
  { project_plugin_id: CODING_PROJECT_PLUGIN_ID, manifest: codingManifest },
];

/** Plugins a project can enable. Personal Plugins are always on and not listed. */
export const PROJECT_SCOPED_PLUGIN_IDS: readonly ProjectPluginId[] = BUILTIN_PLUGIN_CATALOG
  .filter((entry) => entry.personal !== true)
  .map((entry) => entry.project_plugin_id);

/** Personal Plugins are enabled for every project without being stored per project. */
export const PERSONAL_PLUGIN_IDS: readonly ProjectPluginId[] = BUILTIN_PLUGIN_CATALOG
  .filter((entry) => entry.personal === true)
  .map((entry) => entry.project_plugin_id);

/** The registry Projects validates against, derived from what this build ships. */
export const BUILTIN_PLUGIN_REGISTRY: ProjectPluginRegistry = {
  has: (pluginId) => PROJECT_SCOPED_PLUGIN_IDS.includes(pluginId),
  companions: (pluginId) =>
    PROJECT_PLUGIN_COMPANIONS[pluginId as keyof typeof PROJECT_PLUGIN_COMPANIONS] ?? [],
};

export interface RailEntry {
  id: ProjectPluginId;
  surface: string;
  label: string;
  glyph: string;
}

function entryFor(projectPluginId: ProjectPluginId): BuiltinPluginEntry | undefined {
  return BUILTIN_PLUGIN_CATALOG.find((entry) => entry.project_plugin_id === projectPluginId);
}

/** Navigator entries for the enabled set, in the order the Manifests declare. */
export function railEntries(enabled: readonly ProjectPluginId[]): RailEntry[] {
  const registry = new UiViewRegistry(BUILTIN_PLUGIN_CATALOG.map((entry) => ({
    manifest: entry.manifest,
    enabled: enabled.includes(entry.project_plugin_id),
  })));
  return registry.slot("navigator").map((view: UiPlacedView) => {
    const entry = BUILTIN_PLUGIN_CATALOG.find((item) => item.manifest.plugin_id === view.plugin_id);
    return {
      id: entry?.project_plugin_id ?? view.plugin_id,
      surface: entry?.project_plugin_id ?? view.plugin_id,
      label: view.title,
      glyph: view.icon ?? "package",
    };
  });
}

/** Settings pages for the enabled set, in Manifest order. */
export function settingsEntries(enabled: readonly ProjectPluginId[]): UiPlacedView[] {
  const registry = new UiViewRegistry(BUILTIN_PLUGIN_CATALOG.map((entry) => ({
    manifest: entry.manifest,
    enabled: enabled.includes(entry.project_plugin_id),
  })));
  return registry.slot("settings");
}

export function manifestFor(projectPluginId: ProjectPluginId): PluginManifest | undefined {
  return entryFor(projectPluginId)?.manifest;
}
