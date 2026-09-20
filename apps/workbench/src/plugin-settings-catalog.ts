import type { UiContributionDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import { PERSONAL_PLUGIN_IDS, PROJECT_SCOPED_PLUGIN_IDS, settingsEntries } from "./plugin-catalog.js";
import { listWorkbenchUiContributions, WORKBENCH_UI_SLOTS } from "./ui-composition.js";

export interface PluginSettingsNavItem {
  readonly section_id: string;
  readonly contribution_id: string;
  readonly plugin_id: string;
  readonly label: string;
  readonly icon: "library" | "sparkles" | "settings";
}

const PLUGIN_SETTINGS_ICONS: Readonly<Record<string, PluginSettingsNavItem["icon"]>> = {
  shelf: "library",
  functions: "sparkles",
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

export function listPluginSettingsNavItems(): PluginSettingsNavItem[] {
  const items = pluginSettingsNavItemsFrom(listWorkbenchUiContributions());
  const order = new Map(
    settingsEntries([...PERSONAL_PLUGIN_IDS, ...PROJECT_SCOPED_PLUGIN_IDS])
      .map((entry, index) => [entry.contribution_id, index]),
  );
  return [...items].sort((left, right) => {
    const leftOrder = order.get(left.contribution_id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(right.contribution_id) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.section_id.localeCompare(right.section_id);
  });
}

export function findPluginSettingsNavItem(sectionId: string): PluginSettingsNavItem | null {
  return listPluginSettingsNavItems().find((item) => item.section_id === sectionId) ?? null;
}

export function isHostGlobalSettingsSection(section: string): boolean {
  return section === "appearance"
    || section === "runtimes"
    || section === "projects"
    || section === "diagnostics"
    || section === "planning";
}
