export interface WebProjectNavigation {
  project_id: string;
  display_name: string;
  data_class?: "user" | "migrated_user" | "regenerable_demo";
  database_path?: string;
  source?: "created" | "migrated";
}


export type WebSettingsSection = "appearance" | "runtimes" | "projects" | "diagnostics";
type SettingsNavigationActive = WebSettingsSection | "planning";
type ProjectSettingsNavigationActive = "general" | "guidance" | "rules" | "planning";


export interface SettingsNavigationPrimitives {
  L(text: string): string;
  escapeHtml(value: unknown): string;
  icon(name: "database" | "chevron-down" | "check" | "settings" | "panel" | "bell" | "search" | "arrow" | "user" | "system" | "workflow" | "tree" | "activity" | "book" | "shield"): string;
  withDesktopQuery(path: string): string;
}
export function createWorkbenchSettingsNavigation(primitives: SettingsNavigationPrimitives) {
  const { L, escapeHtml, icon, withDesktopQuery } = primitives;
function settingsContextHref(
  path: string,
  _project: Pick<WebProjectNavigation, "project_id"> | null,
  desktopShell: boolean,
): string {
  return desktopShell ? withDesktopQuery(path) : path;
}

function renderProjectSwitcher(
  currentProject: WebProjectNavigation | null,
  projects: readonly WebProjectNavigation[],
  desktopShell: boolean,
  className = "navigator-project-menu",
  manageHref = "/",
): string {
  const href = (path: string) => desktopShell ? withDesktopQuery(path) : path;
  const options = projects.length ? projects : currentProject ? [currentProject] : [];
  const currentName = currentProject?.display_name ?? L("选择项目");
  return `<details class="${className} navigator-project-menu" data-project-menu><summary class="navigator-project-selector" aria-label="${L("切换项目")}">${icon("database")}<strong title="${escapeHtml(currentName)}">${escapeHtml(currentName)}</strong>${icon("chevron-down")}</summary><div class="navigator-project-menu-popover"><span>${L("切换项目")}</span><nav>${options.map((project) => `<a class="navigator-project-option${project.project_id === currentProject?.project_id ? " is-current" : ""}" href="${href(`/projects/${encodeURIComponent(project.project_id)}/`)}"${project.project_id === currentProject?.project_id ? ' aria-current="page"' : ""}><span>${icon("database")}<strong>${escapeHtml(project.display_name)}</strong></span>${project.project_id === currentProject?.project_id ? icon("check") : ""}</a>`).join("")}</nav><a class="navigator-project-manage" href="${desktopShell ? withDesktopQuery(manageHref) : manageHref}">${icon("settings")}<span>${L("管理项目")}</span></a></div></details>`;
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
    ? `<button class="navigator-directory-toggle" type="button" data-directory-toggle aria-expanded="true" aria-label="${L("收起目录")}" title="${L("收起目录")}">${icon("panel")}</button>`
    : "";
  const search = options.globalSearch
    ? `<button class="navigator-project-search" type="button" data-global-search-open aria-label="${L("打开搜索")}" title="${L("打开搜索")}">${icon("search")}</button>`
    : "";
  const settings = settingsHref
    ? `<a class="navigator-project-settings" href="${settingsHref}"${options.settingsCurrent ? ' aria-current="page"' : ""} aria-label="${options.settingsCurrent ? L("当前项目设置") : L("打开当前项目设置")}" title="${L("项目设置")}">${icon("settings")}</a>`
    : "";
  return `<div class="navigator-native-row">${directoryToggle}<div class="desktop-titlebar-drag desktop-titlebar-drag--left"${dragAttribute} aria-hidden="true"></div></div><div class="navigator-project-primary">${renderProjectSwitcher(currentProject, projects, desktopShell, options.switcherClass, options.manageHref)}${search}<button class="navigator-project-notifications" type="button" disabled aria-label="${L("通知，暂不可用")}" title="${L("通知功能即将开放")}">${icon("bell")}</button>${settings}</div>`;
}

function renderSettingsNavigation(
  active: SettingsNavigationActive,
  project: WebProjectNavigation | null,
  desktopShell = false,
  _projects: readonly WebProjectNavigation[] = [],
): string {
  const href = (path: string) => desktopShell ? withDesktopQuery(path) : path;
  const current = (section: SettingsNavigationActive) => active === section ? ' aria-current="page"' : "";
  const projectHome = project ? `/projects/${encodeURIComponent(project.project_id)}/` : "/";
  return `<nav class="settings-navigation settings-navigation--codex" aria-label="${L("系统设置")}">
    <a class="settings-nav-back" href="${href(projectHome)}">← ${L("返回项目")}</a>
    <div class="settings-nav-body">
      <div class="settings-nav-group-label">${L("本机")}</div>
      <a href="${href("/settings/appearance")}"${current("appearance")}>${L("外观")}</a>
      <div class="settings-nav-group-label">${L("工具")}</div>
      <a href="${href("/settings/runtimes")}"${current("runtimes")}>${L("AI 与执行工具")}</a>
      <a href="${href("/settings/planning")}"${current("planning")}>${L("规划方法")}</a>
      <div class="settings-nav-group-label">${L("系统")}</div>
      <a href="${href("/settings/diagnostics")}"${current("diagnostics")}>${L("诊断")}</a>
    </div>
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
  return `<nav class="settings-navigation settings-navigation--codex project-settings-navigation" aria-label="${L("项目设置")}">
    <a class="settings-nav-back" href="${href(`${routePrefix}/`)}">← ${L("返回项目")}</a>
    <div class="settings-nav-body">
      <div class="settings-nav-group-label">${L("项目设置")}</div>
      <a href="${href(`${routePrefix}/settings`)}"${current("general")}>${L("常规")}</a>
      <a href="${href(`${routePrefix}/settings/guidance`)}"${current("guidance")}>${L("项目说明")}</a>
      <a href="${href(`${routePrefix}/settings/rules`)}"${current("rules")}>${L("工作规则")}</a>
      <a href="${href(`${routePrefix}/settings/planning`)}"${current("planning")}>${L("工作规划")}</a>
    </div>
  </nav>`;
}


  return { settingsContextHref, renderProjectSwitcher, renderDesktopProjectChrome, renderSettingsNavigation, renderProjectSettingsNavigation };
}
