import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { listPluginSettingsNavItems } from "./plugin-settings-catalog.js";
import { listedSettingsSections } from "./platform-settings-registry.js";
import type { DynamicPluginSettingsNavItem } from "./settings-view.js";

/**
 * The one list of global settings categories: the platform's (`platform-settings-registry.ts`) and the plugins'. The independent settings page and the settings cover in the
 * workbench both draw from it, so a category never exists in one and not the other (specs/archive/page-interaction-flow).
 *
 * Host pages carry a fixed order and a group. A plugin's settings page is placed by the `order` its Manifest
 * gives the view: it joins the group of the host page it follows, or 插件 after all of them. Nothing here names
 * a plugin.
 */
interface GlobalSettingsSection {
  readonly id: string;
  readonly label: string;
  readonly icon: PluginIconName;
  readonly group: string;
  readonly kind: "host" | "plugin";
  /** A plugin page's own address parameters (BL-543), space-joined for the row the shell reads; host pages read the shell's table. */
  readonly addressQuery: string;
  readonly addressHash: string;
}

/** A host settings page's name in the person's language, for text that points at the page; undefined for an id that is no host page. */
export function hostSettingsSectionLabel(id: string): string | undefined {
  const section = listedSettingsSections().find(entry => entry.id === id);
  return section ? uiText.text(section.row.label) : undefined;
}

/** Plugin pages past every host page share one group. */
const PLUGIN_GROUP = "workbench.settings-sections.plugins";
const HOST_ORDER_END = 100;

function globalSettingsSections(
  shown: readonly string[] | undefined,
  desktop: boolean,
  dynamicPlugins: readonly DynamicPluginSettingsNavItem[] = [],
): GlobalSettingsSection[] {
  const hostSections = listedSettingsSections();
  const builtinPluginNav = listPluginSettingsNavItems(shown);
  const coveredPluginIds = new Set(builtinPluginNav.map(item => item.plugin_id));
  const coveredSectionIds = new Set([...hostSections.map(item => item.id), ...builtinPluginNav.map(item => item.section_id)]);
  const dynamicNav = dynamicPlugins.filter(item => !coveredPluginIds.has(item.plugin_id) && !coveredSectionIds.has(item.section_id));
  const placed = [
    ...hostSections.filter(section => desktop || !section.row.desktop).map(({ id, row }) => ({ id, label: row.label, icon: row.icon, group: row.group, order: row.order, kind: "host" as const, addressQuery: "", addressHash: "" })),
    ...builtinPluginNav.map((item) => ({
      id: item.section_id,
      label: item.label,
      icon: item.icon as PluginIconName,
      order: item.order ?? Number.MAX_SAFE_INTEGER,
      group: "",
      kind: "plugin" as const,
      addressQuery: item.address.query,
      addressHash: item.address.hash,
    })),
    ...dynamicNav.map((item) => ({
      id: item.section_id,
      label: item.label,
      icon: (item.icon ?? "settings") as PluginIconName,
      order: Number.MAX_SAFE_INTEGER,
      group: "",
      kind: "plugin" as const,
      addressQuery: "",
      addressHash: "",
    })),
  ].sort((left, right) => left.order - right.order);
  let group = hostSections[0]!.row.group;
  return placed.map((section) => {
    if (section.kind !== "plugin") group = section.group;
    const own = section.kind === "plugin" ? (section.order < HOST_ORDER_END ? group : PLUGIN_GROUP) : section.group;
    return { id: section.id, label: section.kind === "host" ? uiText.text(section.label) : section.label, icon: section.icon, group: uiText.text(own), kind: section.kind, addressQuery: section.addressQuery, addressHash: section.addressHash };
  });
}

/** The same list, split where the group changes, for a navigation with group labels. */
export function groupedGlobalSettingsSections(
  shown?: readonly string[],
  desktop = false,
  dynamicPlugins: readonly DynamicPluginSettingsNavItem[] = [],
): { group: string; sections: GlobalSettingsSection[] }[] {
  const groups: { group: string; sections: GlobalSettingsSection[] }[] = [];
  for (const section of globalSettingsSections(shown, desktop, dynamicPlugins)) {
    const last = groups.at(-1);
    if (last?.group === section.group) last.sections.push(section);
    else groups.push({ group: section.group, sections: [section] });
  }
  return groups;
}
