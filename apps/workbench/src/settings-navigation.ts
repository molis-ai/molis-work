import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderProjectMonogram } from "@molis-ai/molis-work-design-system";
import { globalSettingsSectionPath, groupedGlobalSettingsSections } from "./settings-sections.js";
import type { DynamicPluginSettingsNavItem } from "./settings-view.js";

export interface WebProjectNavigation {
  project_id: string;
  display_name: string;
  data_class?: "user" | "regenerable_demo";
  database_path?: string;
  source?: "created";
  /** Host observation only; never an installation or activation request. */
  plugin_requirements?: readonly { plugin_id: string; installed: boolean }[];
}


export type WebSettingsSection = "appearance" | "models" | "runtimes" | "assistant" | "authorizations" | "characters" | "prompts" | "kit" | "memory" | "work-records" | "mcp" | "connectors" | "web-search" | "projects" | "diagnostics" | "update" | "running" | "directories" | "sync";
type SettingsNavigationActive = string;
type ProjectSettingsNavigationActive = "general" | "workspaces" | "guidance" | "memory" | "knowledge" | "plugins" | "kit" | "characters" | "grants" | "rules";


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

/**
 * The top strip's first place (specs/screen-polish §4「底栏第十三版」第 1 条; mock helm.html, screen 34): 「项目 › 项目主页」,
 * which is where you are, where to go, and the project home's own tab in one (the script lights it while the home shows). It
 * always opens the list: the projects on the left, the chosen one's pages on the right; looking changes nothing, choosing goes
 * there. A project's pages are its home for now: its work items join the right column with the work-item switch (batch 37-2).
 */
function renderProjectCorner(
  currentProject: WebProjectNavigation | null,
  projects: readonly WebProjectNavigation[],
  desktopShell: boolean,
  manageHref = "/",
): string {
  const href = (path: string) => desktopShell ? withDesktopQuery(path) : path;
  const options = projects.length ? projects : currentProject ? [currentProject] : [];
  const name = currentProject?.display_name ?? uiText.text("workbench.settings-navigation.choose-project");
  const home = uiText.text("workbench.settings-navigation.project-home");
  const switchLabel = uiText.text("workbench.settings-navigation.switch-project");
  const isCurrent = (project: WebProjectNavigation) => project.project_id === currentProject?.project_id;
  const projectRow = (project: WebProjectNavigation) => `<button class="top-corner-project" type="button" data-corner-project="${escapeHtml(project.project_id)}" aria-pressed="${isCurrent(project)}">${icon(isCurrent(project) ? "folder-open" : "folder")}<span>${escapeHtml(project.display_name)}</span>${isCurrent(project) ? `<small>${uiText("workbench.settings-navigation.current")}</small>` : ""}</button>`;
  // The current project's home is pressed (the page's script opens it as a tab); another project's is that project's address.
  const homeRow = (project: WebProjectNavigation) => isCurrent(project)
    ? `<button class="top-corner-page" type="button" data-corner-home>${icon("home")}<span>${escapeHtml(home)}</span></button>`
    : `<a class="top-corner-page" href="${href(`/projects/${encodeURIComponent(project.project_id)}/`)}">${icon("home")}<span>${escapeHtml(home)}</span></a>`;
  // 项目设置 belongs to the project, so it is one of its pages (the strip's right end holds only the side and the split, POLISH-05).
  const settingsRow = (project: WebProjectNavigation) => `<a class="top-corner-page" href="${href(`/projects/${encodeURIComponent(project.project_id)}/settings`)}"${isCurrent(project) ? ' data-directory-open="project-settings"' : ""}>${icon("tune")}<span>${uiText("workbench.settings-navigation.project-settings")}</span></a>`;
  const pages = (project: WebProjectNavigation) => `<div class="top-corner-pages" data-corner-pages="${escapeHtml(project.project_id)}"${isCurrent(project) ? "" : " hidden"}><p class="top-corner-head"><strong>${escapeHtml(project.display_name)}</strong><small>${uiText("workbench.settings-navigation.choose-to-go")}</small></p>${homeRow(project)}${settingsRow(project)}</div>`;
  return `<div class="top-corner" data-top-corner>
    <button class="top-corner-cell" type="button" data-top-corner-toggle aria-expanded="false" aria-controls="top-corner-list" aria-label="${escapeHtml(`${name} › ${home} · ${switchLabel}`)}" title="${escapeHtml(switchLabel)}">${icon("home")}<span class="top-corner-project-name">${escapeHtml(name)}</span>${icon("chevron-right")}<span class="top-corner-page-name">${escapeHtml(home)}</span>${icon("chevron-down")}</button>
    <div class="top-corner-list" id="top-corner-list" data-top-corner-list role="group" aria-label="${escapeHtml(switchLabel)}" hidden>
      <section class="top-corner-projects"><p class="top-corner-head"><strong>${uiText("workbench.settings-navigation.projects")}</strong></p><div class="top-corner-rows">${options.map(projectRow).join("")}</div><div class="top-corner-foot"><a class="top-corner-manage" href="${href(manageHref)}">${icon("grid")}<span>${uiText("workbench.settings-navigation.all-projects")}</span></a><a class="top-corner-manage" href="${href("/onboarding?mode=new-project")}" data-corner-new>${icon("plus")}<span>${uiText("workbench.settings-navigation.new-project")}</span></a></div></section>
      <section class="top-corner-right">${options.map(pages).join("")}</section>
    </div>
  </div>`;
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
    ? `<button class="mw-btn mw-btn--ghost mw-btn--icon-only navigator-directory-toggle" type="button" data-directory-toggle aria-expanded="true" aria-label="${uiText("workbench.settings-navigation.collapse-directory")}" title="${uiText("workbench.settings-navigation.collapse-directory")}">${icon("sidebar")}</button><button class="mw-btn mw-btn--ghost mw-btn--icon-only immersive-icon-button immersive-show-directory" type="button" data-directory-show aria-label="${uiText("workbench.settings-navigation.expand-directory")}" title="${uiText("workbench.settings-navigation.expand-directory")}">${icon("sidebar")}</button>`
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
  dynamicPlugins?: readonly DynamicPluginSettingsNavItem[],
): string {
  const href = (path: string) => settingsContextHref(path, project, desktopShell);
  const current = (section: SettingsNavigationActive) => active === section ? ' aria-current="page"' : "";
  const projectHome = project ? `/projects/${encodeURIComponent(project.project_id)}/` : "/";
  const projectSettingsHref = project ? (desktopShell ? withDesktopQuery(`/projects/${encodeURIComponent(project.project_id)}/settings`) : `/projects/${encodeURIComponent(project.project_id)}/settings`) : "";
  const scopeSwitch = project
    ? `<div class="mw-toggle-group settings-scope-switch" role="group" aria-label="${uiText("workbench.settings-navigation.scope-switch")}"><a class="mw-toggle is-current" href="${href("/settings/appearance")}" aria-current="true">${uiText("workbench.settings-navigation.scope-global")}</a><a class="mw-toggle" href="${projectSettingsHref}">${uiText("workbench.settings-navigation.scope-project")}</a></div>`
    : "";
  return `<nav class="settings-navigation settings-navigation--codex" aria-label="${uiText("workbench.settings-navigation.system-settings")}">
    <a class="settings-nav-back" href="${href(projectHome)}">${icon("arrow")} ${uiText("workbench.settings-navigation.return-project")}</a>
    ${scopeSwitch}
    <div class="settings-nav-filter"><input class="mw-input" type="search" data-settings-nav-filter placeholder="${uiText("workbench.settings-navigation.filter-settings")}" aria-label="${uiText("workbench.settings-navigation.filter-settings")}" autocomplete="off"></div>
    <div class="settings-nav-body">
      ${groupedGlobalSettingsSections(shownPlugins, desktopShell, dynamicPlugins).map(({ group, sections }) => `<div class="settings-nav-group-label">${escapeHtml(group)}</div>
      ${sections.map((section) => `<a href="${href(globalSettingsSectionPath(section.id))}"${current(section.id)}>${icon(section.icon)}${escapeHtml(section.label)}</a>`).join("")}`).join("")}
    </div>
    <p class="settings-nav-empty" data-settings-nav-empty hidden>${uiText("workbench.settings-navigation.no-matching-settings")}</p>
  </nav>`;
}

function renderProjectSettingsNavigation(
  active: ProjectSettingsNavigationActive,
  project: WebProjectNavigation,
  desktopShell = false,
  _projects: readonly WebProjectNavigation[] = [],
): string {
  const routePrefix = `/projects/${encodeURIComponent(project.project_id)}`;
  const href = (path: string) => desktopShell ? withDesktopQuery(path) : path;
  const current = (section: ProjectSettingsNavigationActive) => active === section ? ' aria-current="page"' : "";
  const globalSettingsHref = settingsContextHref("/settings/appearance", project, desktopShell);
  return `<nav class="settings-navigation settings-navigation--codex project-settings-navigation" aria-label="${uiText("workbench.settings-navigation.project-settings")}">
    <a class="settings-nav-back" href="${href(`${routePrefix}/`)}">${icon("arrow")} ${uiText("workbench.settings-navigation.back-workbench")}</a>
    <div class="mw-toggle-group settings-scope-switch" role="group" aria-label="${uiText("workbench.settings-navigation.scope-switch")}"><a class="mw-toggle" href="${globalSettingsHref}">${uiText("workbench.settings-navigation.scope-global")}</a><a class="mw-toggle is-current" href="${href(`${routePrefix}/settings`)}" aria-current="true">${uiText("workbench.settings-navigation.scope-project")}</a></div>
    <div class="settings-project-identity"><strong title="${escapeHtml(project.display_name)}">${escapeHtml(project.display_name)}</strong><span>${uiText("workbench.settings-navigation.project-settings")}</span></div>
    <div class="settings-nav-filter"><input class="mw-input" type="search" data-settings-nav-filter placeholder="${uiText("workbench.settings-navigation.filter-settings")}" aria-label="${uiText("workbench.settings-navigation.filter-settings")}" autocomplete="off"></div>
    <div class="settings-nav-body">
      <a href="${href(`${routePrefix}/settings`)}"${current("general")}>${icon("tune")}${uiText("workbench.settings-navigation.general")}</a>
      <a href="${href(`${routePrefix}/settings/workspaces`)}"${current("workspaces")}>${icon("folder")}${uiText("workbench.settings-navigation.inputs-output")}</a>
      <a href="${href(`${routePrefix}/settings/guidance`)}"${current("guidance")}>${icon("book")}${uiText("workbench.settings-navigation.project-guidance")}</a>
      <a href="${href(`${routePrefix}/settings/memory`)}"${current("memory")}>${icon("bookmark")}${uiText("workbench.settings-navigation.project-memory")}</a>
      <a href="${href(`${routePrefix}/settings/knowledge`)}"${current("knowledge")}>${icon("file")}${uiText("workbench.settings-navigation.project-knowledge")}</a>
      <a href="${href(`${routePrefix}/settings/plugins`)}"${current("plugins")}>${icon("package")}${uiText("workbench.settings-navigation.plugin")}</a>
      <a href="${href(`${routePrefix}/settings/kit`)}"${current("kit")}>${icon("sparkles")}${uiText("workbench.kit.title")}</a>
      <a href="${href(`${routePrefix}/settings/characters`)}"${current("characters")}>${icon("user")}${uiText("workbench.settings-sections.characters")}</a>
      <a href="${href(`${routePrefix}/settings/grants`)}"${current("grants")}>${icon("shield")}${uiText("workbench.settings-navigation.access-approvals")}</a>
    </div>
    <p class="settings-nav-empty" data-settings-nav-empty hidden>${uiText("workbench.settings-navigation.no-matching-settings")}</p>
  </nav>`;
}


  return { settingsContextHref, renderProjectSwitcher, renderProjectCorner, renderDesktopProjectChrome, renderSettingsNavigation, renderProjectSettingsNavigation };
}
