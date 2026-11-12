import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { CAPABILITY_SETTINGS_SECTIONS, listPluginSettingsNavItems } from "./plugin-settings-catalog.js";

/**
 * The one list of global settings categories. The independent settings page and the settings cover in the
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

interface HostSection { id: string; label: string; icon: PluginIconName; group: string; order: number }

/** The address a global settings category is served from. */
export function globalSettingsSectionPath(id: string): string {
  return (CAPABILITY_SETTINGS_SECTIONS as readonly string[]).includes(id) ? `/capabilities/${id}` : `/settings/${id}`;
}

const HOST_SECTIONS: readonly HostSection[] = [
  { id: "appearance", label: "workbench.settings-sections.appearance-and-language", icon: "sun", group: "workbench.settings-sections.this-device", order: 10 },
  { id: "directories", label: "workbench.settings-sections.local-directories", icon: "folder", group: "workbench.settings-sections.this-device", order: 12 },
  { id: "memory", label: "workbench.settings-sections.memory", icon: "bookmark", group: "workbench.settings-sections.personal", order: 15 },
  { id: "sync", label: "workbench.settings-sections.sync", icon: "network", group: "workbench.settings-sections.personal", order: 16 },
  { id: "models", label: "workbench.settings-sections.models", icon: "key", group: "workbench.settings-sections.ai", order: 20 },
  { id: "assistant", label: "workbench.settings-sections.assistant", icon: "message", group: "workbench.settings-sections.ai", order: 30 },
  { id: "characters", label: "workbench.settings-sections.characters", icon: "user", group: "workbench.settings-sections.ai", order: 35 },
  { id: "kit", label: "workbench.kit.title", icon: "sparkles", group: "workbench.settings-sections.ai", order: 45 },
  { id: "runtimes", label: "workbench.settings-sections.ai-and-runtimes", icon: "terminal", group: "workbench.settings-sections.tools-and-access", order: 50 },
  { id: "library", label: "workbench.settings-sections.capability-library", icon: "book", group: "workbench.settings-sections.tools-and-access", order: 60 },
  { id: "connections", label: "workbench.settings-sections.service-connections", icon: "link", group: "workbench.settings-sections.tools-and-access", order: 61 },
  { id: "access", label: "workbench.settings-sections.external-access", icon: "shield", group: "workbench.settings-sections.tools-and-access", order: 62 },
  { id: "history", label: "workbench.settings-sections.call-history", icon: "workflow", group: "workbench.settings-sections.tools-and-access", order: 63 },
  { id: "diagnostics", label: "workbench.settings-sections.diagnostics", icon: "bug", group: "workbench.settings-sections.system", order: 90 },
];

/** A host settings page's name in the person's language, for text that points at the page; undefined for an id that is no host page. */
export function hostSettingsSectionLabel(id: string): string | undefined {
  const section = HOST_SECTIONS.find(entry => entry.id === id);
  return section ? uiText.text(section.label) : undefined;
}

/** Plugin pages past every host page share one group. */
const PLUGIN_GROUP = "workbench.settings-sections.plugins";
const HOST_ORDER_END = 100;

function globalSettingsSections(shown?: readonly string[]): GlobalSettingsSection[] {
  const placed = [
    ...HOST_SECTIONS.map((section) => ({ ...section, kind: "host" as const, addressQuery: "", addressHash: "" })),
    ...listPluginSettingsNavItems(shown).map((item) => ({
      id: item.section_id,
      label: item.label,
      icon: item.icon as PluginIconName,
      order: item.order ?? Number.MAX_SAFE_INTEGER,
      group: "",
      kind: "plugin" as const,
      addressQuery: item.address.query,
      addressHash: item.address.hash,
    })),
  ].sort((left, right) => left.order - right.order);
  let group = HOST_SECTIONS[0]!.group;
  return placed.map((section) => {
    if (section.kind !== "plugin") group = section.group;
    const own = section.kind === "plugin" ? (section.order < HOST_ORDER_END ? group : PLUGIN_GROUP) : section.group;
    return { id: section.id, label: section.kind === "host" ? uiText.text(section.label) : section.label, icon: section.icon, group: uiText.text(own), kind: section.kind, addressQuery: section.addressQuery, addressHash: section.addressHash };
  });
}

/** The same list, split where the group changes, for a navigation with group labels. */
export function groupedGlobalSettingsSections(shown?: readonly string[]): { group: string; sections: GlobalSettingsSection[] }[] {
  const groups: { group: string; sections: GlobalSettingsSection[] }[] = [];
  for (const section of globalSettingsSections(shown)) {
    const last = groups.at(-1);
    if (last?.group === section.group) last.sections.push(section);
    else groups.push({ group: section.group, sections: [section] });
  }
  return groups;
}
