import type { MolisWorkIcon } from "@molis-ai/molis-work-design-system";
import { CAPABILITY_SETTINGS_SECTIONS, listPluginSettingsNavItems } from "./plugin-settings-catalog.js";

/**
 * The one list of global settings categories. The independent settings page and the settings cover in the
 * workbench both draw from it, so a category never exists in one and not the other (specs/archive/page-interaction-flow).
 *
 * Host pages carry a fixed order and a group. A plugin's settings page is placed by the `order` its Manifest
 * gives the view: it joins the group of the host page it follows, or 插件 after all of them. Nothing here names
 * a plugin.
 */
export interface GlobalSettingsSection {
  readonly id: string;
  readonly label: string;
  readonly icon: MolisWorkIcon;
  readonly group: string;
  readonly kind: "host" | "plugin";
}

interface HostSection { id: string; label: string; icon: MolisWorkIcon; group: string; order: number }

/** The address a global settings category is served from. */
export function globalSettingsSectionPath(id: string): string {
  return (CAPABILITY_SETTINGS_SECTIONS as readonly string[]).includes(id) ? `/capabilities/${id}` : `/settings/${id}`;
}

const HOST_SECTIONS: readonly HostSection[] = [
  { id: "appearance", label: "界面与语言", icon: "sun", group: "本机", order: 10 },
  { id: "memory", label: "记忆", icon: "bookmark", group: "个人", order: 15 },
  { id: "models", label: "模型设置", icon: "key", group: "AI", order: 20 },
  { id: "assistant", label: "助理", icon: "message", group: "AI", order: 30 },
  { id: "prompts", label: "提示词", icon: "text", group: "AI", order: 40 },
  { id: "runtimes", label: "AI 与执行工具", icon: "terminal", group: "工具与接入", order: 50 },
  { id: "library", label: "能力库", icon: "book", group: "工具与接入", order: 60 },
  { id: "connections", label: "服务连接", icon: "link", group: "工具与接入", order: 61 },
  { id: "access", label: "对外接入", icon: "shield", group: "工具与接入", order: 62 },
  { id: "history", label: "调用记录", icon: "workflow", group: "工具与接入", order: 63 },
  { id: "diagnostics", label: "诊断", icon: "bug", group: "系统", order: 90 },
];

/** Plugin pages past every host page share one group. */
const PLUGIN_GROUP = "插件";
const HOST_ORDER_END = 100;

export function globalSettingsSections(enabled?: readonly string[], hidden?: readonly string[]): GlobalSettingsSection[] {
  const placed = [
    ...HOST_SECTIONS.map((section) => ({ ...section, kind: "host" as const })),
    ...listPluginSettingsNavItems(enabled, hidden).map((item) => ({
      id: item.section_id,
      label: item.label,
      icon: item.icon as MolisWorkIcon,
      order: item.order ?? Number.MAX_SAFE_INTEGER,
      group: "",
      kind: "plugin" as const,
    })),
  ].sort((left, right) => left.order - right.order);
  let group = HOST_SECTIONS[0]!.group;
  return placed.map((section) => {
    if (section.kind !== "plugin") group = section.group;
    const own = section.kind === "plugin" ? (section.order < HOST_ORDER_END ? group : PLUGIN_GROUP) : section.group;
    return { id: section.id, label: section.label, icon: section.icon, group: own, kind: section.kind };
  });
}

/** The same list, split where the group changes, for a navigation with group labels. */
export function groupedGlobalSettingsSections(enabled?: readonly string[], hidden?: readonly string[]): { group: string; sections: GlobalSettingsSection[] }[] {
  const groups: { group: string; sections: GlobalSettingsSection[] }[] = [];
  for (const section of globalSettingsSections(enabled, hidden)) {
    const last = groups.at(-1);
    if (last?.group === section.group) last.sections.push(section);
    else groups.push({ group: section.group, sections: [section] });
  }
  return groups;
}
