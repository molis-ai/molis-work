import type { ProjectPluginId } from "@molis-ai/molis-work-contracts/modules/projects";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { UiContributionDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import type { PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { registeredIconNames } from "@molis-ai/molis-work-design-system";
import { BUILTIN_PLUGIN_CATALOG, builtinPluginDirectory, settingsEntries } from "./plugin-catalog.js";
import { listWorkbenchUiContributions, WORKBENCH_UI_SLOTS } from "./ui-composition.js";

/** 能力 is four settings categories served from /capabilities/<id> (specs/artifact-positioning S6b). */
export const CAPABILITY_SETTINGS_SECTIONS = ["library", "connections", "access", "history"] as const;

interface PluginSettingsNavItem {
  readonly section_id: string;
  readonly contribution_id: string;
  readonly plugin_id: string;
  readonly label: string;
  readonly icon: PluginIconName;
  /** Where the Manifest places the view among settings pages; host pages hold 10–90 (settings-sections.ts). */
  readonly order?: number;
}

/**
 * The icon each settings page's Manifest view names (W5-06 2b), by contribution, whether or not a project shows the plugin:
 * a page is also found by its own URL. A name the Host does not know is left out, and the page shows `settings`. Both the
 * catalog and the icon set are fixed when the package is built, so the map is made once, on first use.
 */
let settingsIcons: ReadonlyMap<string, PluginIconName> | undefined;
function declaredSettingsIcons(): ReadonlyMap<string, PluginIconName> {
  if (settingsIcons) return settingsIcons;
  const known = new Set<string>(registeredIconNames());
  settingsIcons = new Map(settingsEntries(builtinPluginDirectory().map((entry) => entry.id))
    .flatMap((view) => view.icon && known.has(view.icon) ? [[view.contribution_id, view.icon as PluginIconName] as const] : []));
  return settingsIcons;
}

/**
 * The read action a settings page gets its data with, as its Manifest view declares it (`settings_data`, W5-02 PR-D, PG-072), by the
 * page's contribution: the Manifest's own definition of it, which the SDK has checked is a query for the person that only reads.
 * The Host calls it and hands the answer to the page; it knows no plugin by name.
 */
let settingsDataActions: ReadonlyMap<string, ActionDefinition> | undefined;
export function pluginSettingsDataAction(contributionId: string): ActionDefinition | undefined {
  settingsDataActions ??= new Map(BUILTIN_PLUGIN_CATALOG.flatMap(entry => (entry.manifest.ui?.views ?? []).flatMap(view => {
    const declared = view.slot === "settings" ? view.settings_data?.action : undefined;
    const action = declared ? entry.manifest.actions?.find(item => item.capability_id === declared) : undefined;
    return action ? [[view.contribution_id ?? `${entry.manifest.plugin_id}.${view.view_id}`, action] as const] : [];
  })));
  return settingsDataActions.get(contributionId);
}

export function pluginSettingsNavItemsFrom(
  contributions: readonly UiContributionDescriptor[],
): PluginSettingsNavItem[] {
  const icons = declaredSettingsIcons();
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
        icon: icons.get(item.contribution_id) ?? "settings",
      };
    })
    .filter((item) => !isHostGlobalSettingsSection(item.section_id));
}

/** The settings pages of the plugins the context shows (`shown`, as the Host works it out: personal ones unless hidden, and the enabled ones). */
export function listPluginSettingsNavItems(shown: readonly string[] = []): PluginSettingsNavItem[] {
  const scope = [...new Set(shown)] as ProjectPluginId[];
  const placed = settingsEntries(scope);
  const allowed = new Set(placed.map((entry) => entry.contribution_id));
  const order = new Map(placed.map((entry, index) => [entry.contribution_id, index]));
  const views = new Map(placed.map((entry) => [entry.contribution_id, entry]));
  return pluginSettingsNavItemsFrom(listWorkbenchUiContributions())
    .filter((item) => allowed.has(item.contribution_id))
    .sort((left, right) => (order.get(left.contribution_id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.contribution_id) ?? Number.MAX_SAFE_INTEGER))
    .map((item) => {
      const view = views.get(item.contribution_id);
      return { ...item, ...(Number.isFinite(view?.order) ? { order: view!.order } : {}) };
    });
}

export function findPluginSettingsNavItem(sectionId: string): PluginSettingsNavItem | null {
  // Route discovery precedes project selection. Navigation filtering must not
  // make a registered project's settings page unreachable by its own URL.
  return pluginSettingsNavItemsFrom(listWorkbenchUiContributions()).find((item) => item.section_id === sectionId) ?? null;
}

export function isHostGlobalSettingsSection(section: string): boolean {
  return section === "appearance"
    || section === "models"
    || section === "assistant"
    || section === "characters"
    || section === "prompts"
    || (CAPABILITY_SETTINGS_SECTIONS as readonly string[]).includes(section)
    || section === "runtimes"
    || section === "mcp"
    || section === "connectors"
    || section === "projects"
    || section === "diagnostics"
    || section === "memory";
}
