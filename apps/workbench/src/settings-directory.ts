import { renderDirectoryPanel, renderDirectoryRow, type MolisWorkIcon } from "@molis-ai/molis-work-design-system";
import { renderAppearanceSettingsDocument } from "./settings-appearance.js";
import { createProjectSettingsFolds, type ProjectSettingsFoldProject } from "./project-settings-folds.js";
import { groupedGlobalSettingsSections } from "./settings-sections.js";

export interface SettingsDirectoryPrimitives {
  L(text: string): string;
  escapeHtml(value: unknown): string;
  icon(name: MolisWorkIcon): string;
  htmlLang(): string;
  withDesktopQuery?(path: string): string;
}

const PROJECT_SETTINGS_SECTIONS = [
  { id: "general", label: "常规", icon: "tune" },
  { id: "workspaces", label: "工作目录", icon: "folder" },
  { id: "guidance", label: "项目说明", icon: "book" },
  { id: "memory", label: "记忆", icon: "bookmark" },
] as const satisfies readonly { id: string; label: string; icon: MolisWorkIcon }[];

function localeSwitchHref(locale: "zh" | "en", nextPath: string): string {
  return `/locale?lang=${locale}&next=${encodeURIComponent(nextPath)}`;
}

export function renderPluginRailAccountFooter(primitives: SettingsDirectoryPrimitives): string {
  const { L, icon } = primitives;
  // The ways to extend the workbench. Which plugins stay in the Dock is chosen on the switcher's own entries, not here.
  return `<footer class="personal-sidebar-footer">
    <details class="account-global-menu" data-global-menu>
      <summary class="account-global-trigger" aria-label="${L("Dock 与插件")}" title="${L("Dock 与插件")}">${icon("package")}</summary>
      <div class="account-global-popover">
        <!-- account-global-items -->
      </div>
    </details>
  </footer>`;
}

/** What belongs to the person rather than the project, under the project button: who you are and where (shown, not
 * offered as a control until there is an account page), then capabilities and settings, both opening in the workbench. */
export function renderPersonalMenuItems(primitives: SettingsDirectoryPrimitives): string {
  const { L, icon } = primitives;
  return `<div class="navigator-personal" data-personal-menu>
    <div class="personal-account" data-account-link>
      <span class="personal-account-avatar" aria-hidden="true">${icon("user")}</span>
      <span class="personal-account-copy"><strong>${L("一骏")}</strong><small>${L("本地空间")}</small></span>
    </div>
    <a class="immersive-plugin-link account-global-item" href="__SYSTEM_CAPABILITIES__" data-capabilities-open aria-label="${L("打开能力服务")}" title="${L("能力")}">${icon("sparkles")}<span>${L("能力")}</span></a>
    <button class="immersive-plugin-link account-global-item personal-settings" type="button" data-plugin-id="settings" data-directory-open="settings" aria-label="${L("打开全局设置")}" title="${L("设置")}">${icon("settings")}<span>${L("设置")}</span></button>
  </div>`;
}

function renderSettingsNav(
  primitives: SettingsDirectoryPrimitives,
  groups: readonly { group: string; sections: readonly { id: string; label: string; icon: MolisWorkIcon; kind?: string }[] }[],
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
      attrs: { "data-settings-section": section.id, ...(section.kind === "cover" ? { "data-settings-cover": section.id } : {}) },
    })).join("")}`).join(""),
  });
}

export function renderSettingsDirectorySection(primitives: SettingsDirectoryPrimitives, enabled?: readonly string[], hidden?: readonly string[]): string {
  const { L, icon } = primitives;
  return `<section class="plugin-section is-expanded" data-plugin-section="settings" data-plugin-expanded="true" hidden>
    <div class="immersive-plugin-link" aria-hidden="true">${icon("settings")}<span>${L("设置")}</span></div>
    <div class="plugin-section-body">
      ${renderSettingsNav(primitives, groupedGlobalSettingsSections(enabled, hidden), "appearance", "系统设置", "settings")}
    </div>
  </section>`;
}

export function renderProjectSettingsDirectorySection(primitives: SettingsDirectoryPrimitives): string {
  const { L, icon } = primitives;
  return `<section class="plugin-section is-expanded" data-plugin-section="project-settings" data-plugin-expanded="true" hidden>
    <div class="immersive-plugin-link" aria-hidden="true">${icon("settings")}<span>${L("项目设置")}</span></div>
    <div class="plugin-section-body">
      ${renderSettingsNav(primitives, [{ group: "", sections: PROJECT_SETTINGS_SECTIONS }], "general", "项目设置", "project-settings")}
    </div>
  </section>`;
}

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
