import { renderDirectoryPanel, renderDirectoryRow, type MolisWorkIcon } from "@molis-ai/molis-work-design-system";
import { renderAppearanceSettingsDocument } from "./settings-appearance.js";
import { createProjectSettingsFolds, type ProjectSettingsFoldProject } from "./project-settings-folds.js";
import { listPluginSettingsNavItems } from "./plugin-settings-catalog.js";

export interface SettingsDirectoryPrimitives {
  L(text: string): string;
  escapeHtml(value: unknown): string;
  icon(name: MolisWorkIcon): string;
  htmlLang(): string;
  withDesktopQuery?(path: string): string;
}

const SETTINGS_SECTIONS = [
  { id: "appearance", label: "外观", icon: "sun" },
  { id: "models", label: "模型设置", icon: "settings" },
  { id: "runtimes", label: "AI 与执行工具", icon: "terminal" },
  { id: "planning", label: "规划方法", icon: "workflow" },
  { id: "diagnostics", label: "诊断", icon: "bug" },
] as const satisfies readonly { id: string; label: string; icon: MolisWorkIcon }[];

function globalSettingsSections(): readonly { id: string; label: string; icon: MolisWorkIcon }[] {
  return [
    ...SETTINGS_SECTIONS,
    ...listPluginSettingsNavItems().map((item) => ({
      id: item.section_id,
      label: item.label,
      icon: item.icon,
    })),
  ];
}

const PROJECT_SETTINGS_SECTIONS = [
  { id: "general", label: "常规", icon: "tune" },
  { id: "guidance", label: "项目说明", icon: "book" },
  { id: "rules", label: "工作规则", icon: "shield" },
  { id: "planning", label: "工作规划", icon: "workflow" },
] as const satisfies readonly { id: string; label: string; icon: MolisWorkIcon }[];

function localeSwitchHref(locale: "zh" | "en", nextPath: string): string {
  return `/locale?lang=${locale}&next=${encodeURIComponent(nextPath)}`;
}

export function renderPluginRailAccountFooter(primitives: SettingsDirectoryPrimitives): string {
  const { L, icon } = primitives;
  return `<footer class="personal-sidebar-footer">
    <button class="immersive-plugin-link plugin-rail-item personal-settings" type="button" data-plugin-id="settings" data-directory-open="settings" aria-label="${L("打开全局设置")}" title="${L("设置")}">${icon("settings")}<span>${L("设置")}</span></button>
    <button class="personal-account" type="button" data-account-link aria-label="${L("账号管理")}" title="${L("账号管理")}">
      <span class="personal-account-avatar" aria-hidden="true">${icon("user")}</span>
      <span class="personal-account-copy"><strong>${L("一骏")}</strong><small>${L("本地空间")}</small></span>
    </button>
  </footer>`;
}

function renderSettingsNav(
  primitives: SettingsDirectoryPrimitives,
  sections: readonly { id: string; label: string; icon: MolisWorkIcon }[],
  preset: string,
  label: string,
  pluginId: string,
): string {
  const { L } = primitives;
  return renderDirectoryPanel({
    pluginId,
    listLabel: L(label),
    listRole: "none",
    listClassName: "settings-directory-nav",
    listAttrs: { "data-settings-directory-nav": true },
    body: sections.map((section) => renderDirectoryRow({
      title: L(section.label),
      icon: section.icon,
      density: "compact",
      current: section.id === preset,
      attrs: { "data-settings-section": section.id },
    })).join(""),
  });
}

export function renderSettingsDirectorySection(primitives: SettingsDirectoryPrimitives): string {
  const { L, icon } = primitives;
  return `<section class="plugin-section is-expanded" data-plugin-section="settings" data-plugin-expanded="true" hidden>
    <div class="immersive-plugin-link" aria-hidden="true">${icon("settings")}<span>${L("设置")}</span></div>
    <div class="plugin-section-body">
      ${renderSettingsNav(primitives, globalSettingsSections(), "appearance", "系统设置", "settings")}
    </div>
  </section>`;
}

export function renderProjectSettingsDirectorySection(primitives: SettingsDirectoryPrimitives): string {
  const { L, icon } = primitives;
  return `<section class="plugin-section is-expanded" data-plugin-section="project-settings" data-plugin-expanded="true" hidden>
    <div class="immersive-plugin-link" aria-hidden="true">${icon("settings")}<span>${L("项目设置")}</span></div>
    <div class="plugin-section-body">
      ${renderSettingsNav(primitives, PROJECT_SETTINGS_SECTIONS, "general", "项目设置", "project-settings")}
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
