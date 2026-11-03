import { renderDirectoryPanel, renderDirectoryRow, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderAppearanceSettingsDocument } from "./settings-appearance.js";
import { createProjectSettingsFolds, type ProjectSettingsFoldProject } from "./project-settings-folds.js";
import { groupedGlobalSettingsSections } from "./settings-sections.js";

export interface SettingsDirectoryPrimitives {
  L(text: string): string;
  escapeHtml(value: unknown): string;
  icon(name: PluginIconName): string;
  htmlLang(): string;
  withDesktopQuery?(path: string): string;
}

const PROJECT_SETTINGS_SECTIONS = [
  { id: "general", label: "常规", icon: "tune" },
  { id: "workspaces", label: "工作目录", icon: "folder" },
  { id: "guidance", label: "项目说明", icon: "book" },
  { id: "memory", label: "记忆", icon: "bookmark" },
  { id: "knowledge", label: "项目资料", icon: "file" },
  { id: "plugins", label: "插件", icon: "package" },
] as const satisfies readonly { id: string; label: string; icon: PluginIconName }[];

function localeSwitchHref(locale: "zh" | "en", nextPath: string): string {
  return `/locale?lang=${locale}&next=${encodeURIComponent(nextPath)}`;
}

/** Personal entries under the project button: the future sign-in entry, then capabilities and settings. */
export function renderPersonalMenuItems(primitives: SettingsDirectoryPrimitives): string {
  const { L, icon } = primitives;
  // TODO: Enable this entry when sign-in is implemented; a local Home has no account identity yet.
  return `<div class="navigator-personal" data-personal-menu>
    <button class="personal-account" type="button" data-account-link disabled title="${L("登录功能暂未开放")}">
      <span class="personal-account-avatar" aria-hidden="true">${icon("user")}</span>
      <span class="personal-account-copy"><strong>${L("未登录")}</strong><small>${L("登录")}</small></span>
    </button>
    <a class="immersive-plugin-link account-global-item" href="__SYSTEM_CAPABILITIES__" data-capabilities-open aria-label="${L("打开能力服务")}" title="${L("能力")}">${icon("sparkles")}<span>${L("能力")}</span></a>
    <button class="immersive-plugin-link account-global-item personal-settings" type="button" data-plugin-id="settings" data-directory-open="settings" aria-label="${L("打开全局设置")}" title="${L("设置")}">${icon("settings")}<span>${L("设置")}</span></button>
  </div>`;
}

export function renderSettingsNav(
  primitives: SettingsDirectoryPrimitives,
  groups: readonly { group: string; sections: readonly { id: string; label: string; icon: PluginIconName; addressQuery?: string; addressHash?: string }[] }[],
  preset: string,
  label: string,
  pluginId: string,
): string {
  const { L, escapeHtml } = primitives;
  // Group labels only when there is more than one group (project settings are one short list).
  const labelled = groups.length > 1;
  return renderDirectoryPanel({
    pluginId,
    listLabel: L(label),
    listRole: "none",
    listClassName: "settings-directory-nav",
    listAttrs: { "data-settings-directory-nav": true },
    body: groups.map(({ group, sections }) => `${labelled ? `<p class="settings-directory-group" aria-hidden="true">${escapeHtml(L(group))}</p>` : ""}${sections.map((section) => renderDirectoryRow({
      title: L(section.label),
      icon: section.icon,
      density: "compact",
      current: section.id === preset,
      attrs: { "data-settings-section": section.id,
        ...(section.addressQuery ? { "data-settings-address-query": section.addressQuery } : {}),
        ...(section.addressHash ? { "data-settings-address-hash": section.addressHash } : {}) },
    })).join("")}`).join(""),
  });
}

export function renderSettingsDirectorySection(primitives: SettingsDirectoryPrimitives, shown?: readonly string[]): string {
  const { L, icon } = primitives;
  return `<section class="plugin-section is-expanded" data-plugin-section="settings" data-plugin-expanded="true" hidden>
    <div class="immersive-plugin-link" aria-hidden="true">${icon("settings")}<span>${L("设置")}</span></div>
    <div class="plugin-section-body">
      ${renderSettingsNav(primitives, groupedGlobalSettingsSections(shown), "appearance", "系统设置", "settings")}
    </div>
  </section>`;
}

/** `goals` is false for a project without Goals: the project description page is Goals', so it is not listed (RAC-400). */
export function renderProjectSettingsDirectorySection(primitives: SettingsDirectoryPrimitives, goals = true): string {
  const { L, icon } = primitives;
  return `<section class="plugin-section is-expanded" data-plugin-section="project-settings" data-plugin-expanded="true" hidden>
    <div class="immersive-plugin-link" aria-hidden="true">${icon("settings")}<span>${L("项目设置")}</span></div>
    <div class="plugin-section-body">
      ${renderSettingsNav(primitives, [{ group: "", sections: PROJECT_SETTINGS_SECTIONS.filter(section => goals || section.id !== "guidance") }], "general", "项目设置", "project-settings")}
    </div>
  </section>`;
}

/** Settings inside a project. `nextPath` is where switching the language lands: this project with Settings open on the same page (VUX-40). */
export function renderSettingsWorkSurface(primitives: SettingsDirectoryPrimitives, nextPath: string): string {
  const { L, htmlLang } = primitives;
  const locale = htmlLang().toLowerCase().startsWith("en") ? "en" : "zh";
  const appearance = renderAppearanceSettingsDocument({
    L,
    currentLocale: () => locale,
    localeSwitchHref,
  }, nextPath).replace(
    '<section class="settings-document appearance-document"',
    '<section class="settings-document appearance-document" data-settings-panel="appearance"',
  );
  return `<section class="desktop-work-surface settings-stage" data-work-surface="settings" data-work-surface-label="${L("设置")}" hidden>
    <div class="settings-content" data-settings-stage-body>${appearance}</div>
  </section>`;
}

export function renderProjectSettingsWorkSurface(
  primitives: SettingsDirectoryPrimitives,
  project?: ProjectSettingsFoldProject,
  desktopShell = false,
): string {
  const { L, escapeHtml, icon, withDesktopQuery = (path) => path } = primitives;
  const folds = createProjectSettingsFolds({
    L,
    escapeHtml,
    icon: (name) => icon(name),
    withDesktopQuery,
  });
  const general = project ? folds.renderGeneralPage(project, desktopShell) : "";
  return `<section class="desktop-work-surface settings-stage" data-work-surface="project-settings" data-work-surface-label="${L("项目设置")}" hidden>
    <div class="settings-content" data-settings-stage-body>${general}</div>
  </section>`;
}
