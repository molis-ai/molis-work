import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderProjectMonogram } from "@molis-ai/molis-work-design-system";
import { globalSettingsSectionPath, groupedGlobalSettingsSections } from "./settings-sections.js";

export interface WebProjectNavigation {
  project_id: string;
  display_name: string;
  data_class?: "user" | "regenerable_demo";
  database_path?: string;
  source?: "created";
  /** Host observation only; never an installation or activation request. */
  plugin_requirements?: readonly { plugin_id: string; installed: boolean }[];
}


export type WebSettingsSection = "appearance" | "models" | "runtimes" | "assistant" | "characters" | "prompts" | "kit" | "memory" | "mcp" | "connectors" | "projects" | "diagnostics" | "update" | "running" | "directories" | "sync";
type SettingsNavigationActive = string;
type ProjectSettingsNavigationActive = "general" | "workspaces" | "guidance" | "memory" | "knowledge" | "plugins" | "kit" | "grants" | "rules" | "planning";


export interface SettingsNavigationPrimitives {
  readText(text: string): string;
  escapeHtml(value: unknown): string;
  icon(name: PluginIconName): string;
  withDesktopQuery(path: string): string;
}
export function createWorkbenchSettingsNavigation(primitives: SettingsNavigationPrimitives) {
  const { escapeHtml, icon, withDesktopQuery } = primitives;
function settingsContextHref(
  path: string,
  project: Pick<WebProjectNavigation, "project_id"> | null,
  desktopShell: boolean,
): string {
  const scopedPath = project && (path.startsWith("/settings/") || path.startsWith("/capabilities/"))
    ? path + (path.includes("?") ? "&" : "?") + "project=" + encodeURIComponent(project.project_id)
    : path;
  return desktopShell ? withDesktopQuery(scopedPath) : scopedPath;
}

function renderProjectSwitcher(
  currentProject: WebProjectNavigation | null,
  projects: readonly WebProjectNavigation[],
  desktopShell: boolean,
  className = "navigator-project-menu",
  manageHref = "/",
  settingsLink = "",
): string {
  const href = (path: string) => desktopShell ? withDesktopQuery(path) : path;
  const options = projects.length ? projects : currentProject ? [currentProject] : [];
  const currentName = currentProject?.display_name ?? uiText.text("workbench.settings-navigation.choose-project");
  return `<details class="${className} navigator-project-menu" data-project-menu><summary class="navigator-project-selector" aria-label="${uiText("workbench.settings-navigation.switch-project")}">${currentProject ? renderProjectMonogram(currentProject.display_name, currentProject.project_id, escapeHtml) : icon("database")}<strong title="${escapeHtml(currentName)}">${escapeHtml(currentName)}</strong>${icon("chevron-down")}</summary><div class="navigator-project-menu-popover"><span>${uiText("workbench.settings-navigation.switch-project")}</span><nav>${options.map((project) => `<a class="navigator-project-option${project.project_id === currentProject?.project_id ? " is-current" : ""}" href="${href(`/projects/${encodeURIComponent(project.project_id)}/`)}"${project.project_id === currentProject?.project_id ? ' aria-current="page"' : ""}><span>${renderProjectMonogram(project.display_name, project.project_id, escapeHtml)}<strong>${escapeHtml(project.display_name)}</strong></span>${project.project_id === currentProject?.project_id ? icon("check") : ""}</a>`).join("")}</nav><a class="navigator-project-manage" href="${desktopShell ? withDesktopQuery(manageHref) : manageHref}">${icon("database")}<span>${uiText("workbench.settings-navigation.manage-projects")}</span></a>${settingsLink}<!-- project-menu-extra --></div></details>`;
}

function renderDesktopProjectChrome(
  currentProject: WebProjectNavigation | null,
  projects: readonly WebProjectNavigation[],
  desktopShell: boolean,
  settingsHref: string | null,
  options: {
    switcherClass?: string;
    manageHref?: string;
    settingsCurrent?: boolean;
    directoryToggle?: boolean;
    globalSearch?: boolean;
  } = {},
): string {
  const dragAttribute = desktopShell ? " data-tauri-drag-region" : "";
  const directoryToggle = options.directoryToggle
    ? `<button class="mw-btn mw-btn--ghost mw-btn--icon-only navigator-directory-toggle" type="button" data-directory-toggle aria-expanded="true" aria-label="${uiText("workbench.settings-navigation.collapse-directory")}" title="${uiText("workbench.settings-navigation.collapse-directory")}">${icon("panel")}</button><button class="mw-btn mw-btn--ghost mw-btn--icon-only immersive-icon-button immersive-show-directory" type="button" data-directory-show aria-label="${uiText("workbench.settings-navigation.expand-directory")}" title="${uiText("workbench.settings-navigation.expand-directory")}">${icon("panel")}</button>`
    : "";
  const search = options.globalSearch
    ? `<button class="mw-btn mw-btn--ghost mw-btn--icon-only navigator-project-search" type="button" data-global-search-open aria-label="${uiText("workbench.settings-navigation.open-search")}" title="${uiText("workbench.settings-navigation.open-search")}">${icon("search")}<span class="navigator-project-search-label" aria-hidden="true">${uiText("workbench.settings-navigation.search")}</span><kbd aria-hidden="true">⌘K</kbd></button>`
    : "";
  // Project settings belong to the project, so they live in its menu: the rail keeps one gear, for the system.
  const settings = settingsHref
    ? `<a class="navigator-project-settings" href="${settingsHref}" data-directory-open="project-settings"${options.settingsCurrent ? ' aria-current="page"' : ""} aria-label="${options.settingsCurrent ? uiText("workbench.settings-navigation.current-project-settings") : uiText("workbench.settings-navigation.open-current-project-settings")}" title="${uiText("workbench.settings-navigation.project-settings")}">${icon("tune")}<span>${uiText("workbench.settings-navigation.project-settings")}</span></a>`
    : "";
  return `<div class="navigator-project-primary">${renderProjectSwitcher(currentProject, projects, desktopShell, options.switcherClass, options.manageHref, settings)}<div class="desktop-titlebar-drag desktop-titlebar-drag--left"${dragAttribute} aria-hidden="true"></div>${search}${directoryToggle}</div>`;
}

function renderSettingsNavigation(
  active: SettingsNavigationActive,
  project: WebProjectNavigation | null,
  desktopShell = false,
  _projects: readonly WebProjectNavigation[] = [],
  shownPlugins?: readonly string[],
): string {
  const href = (path: string) => settingsContextHref(path, project, desktopShell);
  const current = (section: SettingsNavigationActive) => active === section ? ' aria-current="page"' : "";
  const projectHome = project ? `/projects/${encodeURIComponent(project.project_id)}/` : "/";
  return `<nav class="settings-navigation settings-navigation--codex" aria-label="${uiText("workbench.settings-navigation.system-settings")}">
    <a class="settings-nav-back" href="${href(projectHome)}">${icon("arrow")} ${uiText("workbench.settings-navigation.return-project")}</a>
    <div class="settings-nav-body">
      ${groupedGlobalSettingsSections(shownPlugins, desktopShell).map(({ group, sections }) => `<div class="settings-nav-group-label">${escapeHtml(group)}</div>
      ${sections.map((section) => `<a href="${href(globalSettingsSectionPath(section.id))}"${current(section.id)}>${icon(section.icon)}${escapeHtml(section.label)}</a>`).join("")}`).join("")}
    </div>
  </nav>`;
}

function renderProjectSettingsNavigation(
  active: ProjectSettingsNavigationActive,
  project: WebProjectNavigation,
  desktopShell = false,
  _projects: readonly WebProjectNavigation[] = [],
  /** Goals owns the project description page; a project without Goals does not list it (RAC-400). */
  options: { goals: boolean } = { goals: true },
): string {
  const routePrefix = `/projects/${encodeURIComponent(project.project_id)}`;
  const href = (path: string) => desktopShell ? withDesktopQuery(path) : path;
  const current = (section: ProjectSettingsNavigationActive) => active === section ? ' aria-current="page"' : "";
  return `<nav class="settings-navigation settings-navigation--codex project-settings-navigation" aria-label="${uiText("workbench.settings-navigation.project-settings")}">
    <a class="settings-nav-back" href="${href(`${routePrefix}/`)}">${icon("arrow")} ${uiText("workbench.settings-navigation.back-workbench")}</a>
    <div class="settings-project-identity"><strong title="${escapeHtml(project.display_name)}">${escapeHtml(project.display_name)}</strong><span>${uiText("workbench.settings-navigation.project-settings")}</span></div>
    <div class="settings-nav-body">
      <a href="${href(`${routePrefix}/settings`)}"${current("general")}>${icon("tune")}${uiText("workbench.settings-navigation.general")}</a>
      <a href="${href(`${routePrefix}/settings/workspaces`)}"${current("workspaces")}>${icon("folder")}${uiText("workbench.settings-navigation.inputs-output")}</a>
      ${options.goals ? `<a href="${href(`${routePrefix}/settings/guidance`)}"${current("guidance")}>${icon("book")}${uiText("workbench.settings-navigation.project-guidance")}</a>` : ""}
      <a href="${href(`${routePrefix}/settings/memory`)}"${current("memory")}>${icon("bookmark")}${uiText("workbench.settings-navigation.project-memory")}</a>
      <a href="${href(`${routePrefix}/settings/knowledge`)}"${current("knowledge")}>${icon("file")}${uiText("workbench.settings-navigation.project-knowledge")}</a>
      <a href="${href(`${routePrefix}/settings/plugins`)}"${current("plugins")}>${icon("package")}${uiText("workbench.settings-navigation.plugin")}</a>
      <a href="${href(`${routePrefix}/settings/kit`)}"${current("kit")}>${icon("sparkles")}${uiText("workbench.kit.title")}</a>
      <a href="${href(`${routePrefix}/settings/grants`)}"${current("grants")}>${icon("shield")}${uiText("workbench.settings-navigation.access-approvals")}</a>
    </div>
  </nav>`;
}


  return { settingsContextHref, renderProjectSwitcher, renderDesktopProjectChrome, renderSettingsNavigation, renderProjectSettingsNavigation };
}
