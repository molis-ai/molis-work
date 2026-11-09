import { t as uiText, renderDirectoryPanel, renderDirectoryRow, renderReturnBar, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderAppearanceSettingsDocument, type AppearanceSettingsModel } from "./settings-appearance.js";
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
  { id: "workspaces", label: "输入与输出", icon: "folder" },
  { id: "guidance", label: "项目说明", icon: "book" },
  { id: "memory", label: "记忆", icon: "bookmark" },
  { id: "knowledge", label: "项目资料", icon: "file" },
  { id: "plugins", label: "插件", icon: "package" },
  { id: "grants", label: "授权与放行", icon: "shield" },
] as const satisfies readonly { id: string; label: string; icon: PluginIconName }[];

function localeSwitchHref(locale: import("./i18n.js").WebLocalePreference, nextPath: string): string {
  return `/locale?lang=${locale}&next=${encodeURIComponent(nextPath)}`;
}

/** Personal identity and login entry stay inside main's project menu, followed by capabilities and settings. */
export function renderPersonalMenuItems(primitives: SettingsDirectoryPrimitives, appearance = false): string {
  const { icon } = primitives;
  return `<div class="navigator-personal" data-personal-menu>
    <button class="personal-account" type="button" data-account-link aria-label="${uiText("workbench.settings-directory.account")}">
      <span class="personal-account-avatar" aria-hidden="true">${icon("user")}</span>
      <span class="personal-account-copy"><strong data-personal-name>${uiText("workbench.settings-directory.not-signed")}</strong><small data-personal-status>${uiText("workbench.settings-directory.local-space")}</small></span>
    </button>
    <button class="immersive-plugin-link account-global-item" type="button" data-unified-account-link aria-label="${uiText("workbench.settings-directory.molis-account")}" title="${uiText("workbench.settings-directory.molis-account")}">${icon("user")}<span data-unified-account-name>${uiText("workbench.settings-directory.molis-account")}</span></button>
    <a class="immersive-plugin-link account-global-item" href="__SYSTEM_CAPABILITIES__" data-capabilities-open aria-label="${uiText("workbench.settings-directory.open-capabilities")}" title="${uiText("workbench.settings-directory.capabilities")}">${icon("sparkles")}<span>${uiText("workbench.settings-directory.capabilities")}</span></a>
    <button class="immersive-plugin-link account-global-item personal-settings" type="button" data-plugin-id="settings" data-directory-open="settings" aria-label="${uiText("workbench.settings-directory.open-global-settings")}" title="${uiText("workbench.settings-directory.settings")}">${icon("settings")}<span>${uiText("workbench.settings-directory.settings")}</span></button>
    ${appearance ? `<button class="immersive-plugin-link account-global-item" type="button" data-appearance-restore>${icon("settings")}<span>${uiText("workbench.settings-directory.restore-built-appearance")}</span></button>` : ""}
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
    listLabel: uiText.text(label),
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
  const { icon } = primitives;
  return `<section class="plugin-section is-expanded" data-plugin-section="settings" data-plugin-expanded="true" hidden>
    <div class="immersive-plugin-link" aria-hidden="true">${icon("settings")}<span>${uiText("workbench.settings-directory.settings")}</span></div>
    <div class="plugin-section-body">
      ${renderSettingsNav(primitives, groupedGlobalSettingsSections(shown), "appearance", "workbench.settings-directory.system-settings", "settings")}
    </div>
  </section>`;
}

/** `goals` is false for a project without Goals: the project description page is Goals', so it is not listed (RAC-400). */
export function renderProjectSettingsDirectorySection(primitives: SettingsDirectoryPrimitives, goals = true): string {
  const { icon } = primitives;
  return `<section class="plugin-section is-expanded" data-plugin-section="project-settings" data-plugin-expanded="true" hidden>
    <div class="immersive-plugin-link" aria-hidden="true">${icon("settings")}<span>${uiText("workbench.settings-directory.project-settings")}</span></div>
    <div class="plugin-section-body">
      ${renderSettingsNav(primitives, [{ group: "", sections: PROJECT_SETTINGS_SECTIONS.filter(section => goals || section.id !== "guidance") }], "general", "workbench.settings-directory.project-settings", "project-settings")}
    </div>
  </section>`;
}

/** The return bar the settings-return owner puts on top of the settings it opened for a page (specs/draft-and-return §9); it fills the words. */
function returnBarTemplate(_L: SettingsDirectoryPrimitives["L"]): string {
  return `<template data-settings-return-bar-template>${renderReturnBar({ title: "", body: "", back: uiText.text("workbench.settings-directory.go-back-now"), label: uiText.text("workbench.settings-directory.where-came") })}</template>`;
}

/** Settings inside a project. `nextPath` is where switching the language lands: this project with Settings open on the same page (VUX-40). */
export function renderSettingsWorkSurface(primitives: SettingsDirectoryPrimitives, nextPath: string, model?: AppearanceSettingsModel): string {
  const { L, htmlLang } = primitives;
  const locale = htmlLang().toLowerCase().startsWith("en") ? "en" : "zh";
  const appearance = renderAppearanceSettingsDocument({
    L,
    currentLocale: () => locale,
    localeSwitchHref,
  }, nextPath, model).replace(
    '<section class="settings-document appearance-document"',
    '<section class="settings-document appearance-document" data-settings-panel="appearance"',
  );
  return `<section class="desktop-work-surface settings-stage" data-work-surface="settings" data-work-surface-label="${uiText("workbench.settings-directory.settings")}" hidden>
    ${returnBarTemplate(L)}<div class="settings-content" data-settings-stage-body>${appearance}</div>
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
  return `<section class="desktop-work-surface settings-stage" data-work-surface="project-settings" data-work-surface-label="${uiText("workbench.settings-directory.project-settings")}" hidden>
    ${returnBarTemplate(L)}<div class="settings-content" data-settings-stage-body>${general}</div>
  </section>`;
}
