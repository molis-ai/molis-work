import type { ProjectPluginId } from "@molis-ai/molis-work-contracts/modules/projects";
import type { UiContributionDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import { PERSONAL_PLUGIN_IDS, settingsEntries } from "./plugin-catalog.js";
import { listWorkbenchUiContributions, WORKBENCH_UI_SLOTS } from "./ui-composition.js";

export interface PluginSettingsNavItem {
  readonly section_id: string;
  readonly contribution_id: string;
  readonly plugin_id: string;
  readonly label: string;
  readonly icon: "library" | "sparkles" | "settings" | "workflow" | "code" | "note" | "clipboard" | "database" | "image";
}

const PLUGIN_SETTINGS_ICONS: Readonly<Record<string, PluginSettingsNavItem["icon"]>> = {
  shelf: "library",
  planning: "workflow",
  "coding-settings": "code",
  pages: "note",
  form: "clipboard",
  dataset: "database",
  ppt: "image",
};

export function pluginSettingsNavItemsFrom(
  contributions: readonly UiContributionDescriptor[],
): PluginSettingsNavItem[] {
  return contributions
    .filter((item) => (
      item.kind === "settings-page"
      && item.surfaces?.some((surface) => surface.target_slot_id === WORKBENCH_UI_SLOTS.settings.slot_id)
    ))
    .map((item) => {
      const section_id = item.navigation_id || item.plugin_id.split(".").at(-1) || item.plugin_id;
      return {
        section_id,
        contribution_id: item.contribution_id,
        plugin_id: item.plugin_id,
        label: item.label,
        icon: PLUGIN_SETTINGS_ICONS[section_id] ?? "settings",
      };
    })
    .filter((item) => !isHostGlobalSettingsSection(item.section_id));
}

/** Personal plugins are installed until this project hides them. Project plugins appear only when `enabled` includes them. */
export function listPluginSettingsNavItems(enabled?: readonly string[], hidden?: readonly string[]): PluginSettingsNavItem[] {
  const excluded = new Set(hidden ?? []);
  const scope = [...new Set([
    ...PERSONAL_PLUGIN_IDS.filter((id) => !excluded.has(id)),
    ...(enabled ?? []),
  ])] as ProjectPluginId[];
  const placed = settingsEntries(scope);
  const allowed = new Set(placed.map((entry) => entry.contribution_id));
  const order = new Map(placed.map((entry, index) => [entry.contribution_id, index]));
  return pluginSettingsNavItemsFrom(listWorkbenchUiContributions())
    .filter((item) => allowed.has(item.contribution_id))
    .sort((left, right) => (order.get(left.contribution_id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.contribution_id) ?? Number.MAX_SAFE_INTEGER));
}

export function findPluginSettingsNavItem(sectionId: string): PluginSettingsNavItem | null {
  // Route discovery precedes project selection. Navigation filtering must not
  // make a registered project's settings page unreachable by its own URL.
  return pluginSettingsNavItemsFrom(listWorkbenchUiContributions()).find((item) => item.section_id === sectionId) ?? null;
}

export function isHostGlobalSettingsSection(section: string): boolean {
  return section === "appearance"
    || section === "runtimes"
    || section === "mcp"
    || section === "connectors"
    || section === "projects"
    || section === "diagnostics";
}
