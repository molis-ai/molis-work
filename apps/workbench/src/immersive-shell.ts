import type { MolisWorkIcon } from "@molis-ai/molis-work-design-system";
import { renderPluginEventRecovery } from "./plugin-event-recovery.js";
import { DIRECT_WORK_SURFACE_IDS, islandEntries, pluginMarketCards, railEntries } from "./plugin-catalog.js";
import { renderAssistantDock } from "./assistant-dock.js";
import { renderSidePanel, type SidePanelPluginTab } from "./side-panel.js";

export interface ImmersiveShellPrimitives {
  L(value: string): string;
  escapeHtml(value: unknown): string;
  icon(name: MolisWorkIcon): string;
}

/**
 * Navigation comes from the Plugin catalog's Manifests, not from a list kept
 * here. Adding a Plugin must never mean editing the shell.
 *
 * `surface` keeps the historical Goals value: the URL surface predates the
 * Manifest id and changing it would break existing links and saved tabs.
 */
const SURFACE_OVERRIDES: Readonly<Record<string, string>> = { goals: "goal" };

function directoryPlugins(enabled: readonly string[]) {
  return railEntries(enabled).map(entry => ({
    id: entry.id,
    surface: SURFACE_OVERRIDES[entry.id] ?? entry.surface,
    label: entry.label,
    glyph: entry.glyph as MolisWorkIcon,
  }));
}

function pluginLink(
  { L, icon }: ImmersiveShellPrimitives,
  plugin: { id: string; surface: string; label: string; glyph: MolisWorkIcon },
  extraClass = "",
  suffix = "",
): string {
  const directory = DIRECT_WORK_SURFACE_IDS.has(plugin.id) ? "" : ` data-directory-open="${plugin.id}"`;
  const feedPreset = plugin.id === "feed" ? ' data-feed-preset="feed"' : "";
  const aria = plugin.id === "home" || plugin.id === "market"
    ? ` aria-label="${plugin.label}"`
    : ` aria-label="${L("切换到插件")}：${plugin.label}"`;
  const className = extraClass ? `immersive-plugin-link ${extraClass}` : "immersive-plugin-link";
  return `<button class="${className}" type="button" data-plugin-id="${plugin.id}"${directory} data-work-surface-open="${plugin.surface}"${feedPreset}${aria} title="${plugin.label}">${icon(plugin.glyph)}<span>${plugin.label}</span>${suffix}</button>`;
}

function currentListPlugin(directory: string): string {
  if (directory === "sources") return "feed";
  if (directory === "root" || directory === "market" || directory === "home") return "";
  return directory;
}

function islandPlugins(enabled: readonly string[]) {
  return islandEntries(enabled).map(entry => ({
    id: entry.id,
    surface: SURFACE_OVERRIDES[entry.id] ?? entry.surface,
    label: entry.label,
    glyph: entry.glyph as MolisWorkIcon,
  }));
}

/**
 * Host chrome, not a view slot. The rail answers one question per zone, top to bottom:
 * the person's own entries (灵光, 对话, 群聊 — reached from anywhere, so they come first),
 * where the work lives (home and the four backbone plugins), which tools this project uses,
 * and at the foot the account with the system settings.
 *
 * Not every tool stays on screen. The tools zone shows the ones used lately and the current one;
 * 全部工具 opens the rest in place, grouped, with the ways to extend them at the end. Everything
 * keeps its entry; nothing moves when the list opens. Every entry stays a direct child of the
 * list so the travelling selection chip can reach it.
 *
 * Only the backbone and the two named tool groups are listed here; any other Plugin, including
 * one added later, lands in 更多, so adding a Plugin never edits the shell.
 */
const RAIL_CORE_ORDER = ["goals", "inbox", "feed", "sessions"];
const RAIL_CORE_PLUGIN_IDS = new Set(RAIL_CORE_ORDER);
const RAIL_TOOL_GROUPS: ReadonlyArray<readonly [label: string, ids: readonly string[]]> = [
  ["工作", ["schedule", "workflows"]],
  ["创作", ["pages", "form", "dataset", "ppt", "images", "artifacts"]],
];
const RAIL_GROUPED_TOOL_IDS = new Set(RAIL_TOOL_GROUPS.flatMap(([, ids]) => ids));
const RAIL_EXTEND_PLUGIN_IDS = new Set(["plugin-builder"]);

/** A plugin installed into this project at run time: its stage and the name it was published under. */
export interface InstalledRailEntry { surface: string; label: string }

/** The person's entries, the backbone, this project's tools (recent first, the rest one click away), the account. */
export function renderPluginRail(
  primitives: ImmersiveShellPrimitives,
  enabled: readonly string[],
  accountFooter: string,
  personalIsland = "",
  installed: readonly InstalledRailEntry[] = [],
): string {
  const { L, icon, escapeHtml } = primitives;
  const entries = directoryPlugins(enabled);
  const zoned = (html: string, zone: string) => html.replace("<button ", `<button data-rail-zone="${zone}" `).replace("<a ", `<a data-rail-zone="${zone}" `);
  const link = (plugin: { id: string; surface: string; label: string; glyph: MolisWorkIcon }, zone: string, suffix = "") =>
    zoned(pluginLink(primitives, plugin, "plugin-rail-item", suffix), zone);
  const subgroup = (label: string, buttons: string) => buttons ? `<p class="plugin-rail-subgroup" data-rail-zone="more">${label}</p>${buttons}` : "";
  const home = link({ id: "home", surface: "home", label: L("项目首页"), glyph: "home" }, "core");
  const core = entries.filter(plugin => RAIL_CORE_PLUGIN_IDS.has(plugin.id))
    .sort((a, b) => RAIL_CORE_ORDER.indexOf(a.id) - RAIL_CORE_ORDER.indexOf(b.id)).map(plugin => link(plugin, "core")).join("");
  // 灵光 is a plugin like any other: it leads the first group, which sits directly under 插件.
  const personal = islandPlugins(enabled).map(plugin => link(plugin, "tool")).join("");
  const grouped = RAIL_TOOL_GROUPS.map(([label, ids], index) => {
    const links = entries.filter(plugin => ids.includes(plugin.id)).map(plugin => link(plugin, "tool")).join("");
    return index === 0 ? personal + links : subgroup(L(label), links);
  }).join("");
  // Plugins the project installed at run time (built in the studio) have no directory; their name is their own.
  const own = installed.map(plugin => `<button class="immersive-plugin-link plugin-rail-item" type="button" data-rail-zone="tool" data-plugin-id="${escapeHtml(plugin.surface)}" data-work-surface-open="${escapeHtml(plugin.surface)}" aria-label="${L("切换到插件")}：${escapeHtml(plugin.label)}" title="${escapeHtml(plugin.label)}">${icon("package")}<span>${escapeHtml(plugin.label)}</span></button>`);
  const other = [...entries.filter(plugin => !RAIL_CORE_PLUGIN_IDS.has(plugin.id) && !RAIL_GROUPED_TOOL_IDS.has(plugin.id) && !RAIL_EXTEND_PLUGIN_IDS.has(plugin.id))
    .map(plugin => link(plugin, "tool")), ...own].join("");
  const toggle = `<button class="immersive-plugin-link plugin-rail-item plugin-rail-toggle" type="button" data-rail-tools-toggle aria-expanded="false" aria-label="${L("全部插件")}" title="${L("全部插件")}">${icon("more")}<span data-rail-toggle-label="${L("收起插件")}">${L("全部插件")}</span></button>`;
  return `<nav class="mw-sidebar mw-sidebar--rail plugin-rail immersive-plugin-strip" data-plugin-strip data-plugin-heading aria-label="${L("项目入口")}">
    ${personalIsland}
    <div class="plugin-rail-items">${home}${core}<p class="plugin-rail-group" data-rail-zone="tools">${L("插件")}</p>${grouped}${subgroup(L("更多"), other)}${toggle}</div>
    ${accountFooter.replace("<!-- account-global-items -->", renderAccountGlobalItems(primitives, enabled))}
  </nav>`;
}

/** The ways to extend the workbench — the market and the plugin studio — offered from the Dock menu. */
export function renderAccountGlobalItems(primitives: ImmersiveShellPrimitives, enabled: readonly string[]): string {
  const { L } = primitives;
  const item = (plugin: { id: string; surface: string; label: string; glyph: MolisWorkIcon }, suffix = "") =>
    pluginLink(primitives, plugin, "account-global-item", suffix);
  const builder = directoryPlugins(enabled).filter(plugin => RAIL_EXTEND_PLUGIN_IDS.has(plugin.id)).map(plugin => item(plugin)).join("");
  const market = item({ id: "market", surface: "market", label: L("插件市场"), glyph: "grid" },
    `<b class="plugin-rail-update-count" data-market-update-count hidden aria-live="polite"></b>`);
  return `${market}${builder}`;
}

/** Shelf and 灵光 are the person's own, so they stay at the right of the bar, beside the project, rather than among the chosen plugins. */
const BAR_RESIDENT_IDS = ["shelf", "lingguang"];

/**
 * The bottom bar replaces the rail. Left, where you go: the switcher — it names where you are (one chip per pane
 * when split) and opens search and every entry of the project, with the Dock's own settings at its foot (the market,
 * the plugin studio, which plugins stay in the Dock) — then the plugins chosen to stay. Centre: the resident Assistant, only an
 * input. Right: Shelf and 灵光, the side panel (the project's discussion, the browser and files beside the work,
 * specs/side-panel), then the project as a round button whose menu holds the project and the person — switching, search,
 * settings, capabilities.
 */
export function renderWorkbenchBar(
  primitives: ImmersiveShellPrimitives,
  parts: { rail: string; projectChrome: string; enabled: readonly string[]; sideTabs?: readonly SidePanelPluginTab[] },
): string {
  const { L, icon } = primitives;
  const known = [...directoryPlugins(parts.enabled), ...islandPlugins(parts.enabled)];
  const residents = BAR_RESIDENT_IDS.map(id => known.find(plugin => plugin.id === id)).filter(plugin => plugin !== undefined)
    .map(plugin => `<button class="bar-resident" type="button" data-bar-resident="${plugin.id}" data-craft-tip="${plugin.label}" aria-label="${L("切换到插件")}：${plugin.label}">${icon(plugin.glyph)}</button>`).join("");
  // The Dock's own settings sit at the foot of the full list, where the plugins they are about are.
  const dockSettings = `<footer class="personal-sidebar-footer">
          <section class="account-global-popover dock-settings" data-global-menu aria-label="${L("Dock 与插件")}">
            ${renderAccountGlobalItems(primitives, parts.enabled)}
            <p class="account-global-heading">${L("常驻在 Dock")}</p>
            <div class="dock-choices" data-dock-choices role="group" aria-label="${L("常驻在 Dock")}"></div>
          </section>
        </footer>`;
  return `<div class="workbench-bar" data-dock aria-label="${L("底栏")}">
    <div class="bar-start">
      <div class="plugin-picker" data-plugin-picker>
        <button class="plugin-picker-trigger" type="button" data-plugin-picker-toggle aria-expanded="false" aria-haspopup="true" aria-label="${L("全部插件与 Dock")}" title="${L("全部插件与 Dock")}"><span class="plugin-picker-all" aria-hidden="true">${icon("grid")}</span><span class="plugin-picker-current" data-plugin-picker-current>${icon("home")}<span>${L("项目首页")}</span></span>${icon("chevron-up")}</button>
        <div class="plugin-picker-popover" data-plugin-picker-popover hidden>
          <button class="plugin-picker-search" type="button" data-global-search-open aria-label="${L("打开搜索")}" title="${L("打开搜索")}">${icon("search")}<span>${L("搜索")}</span><kbd>⌘K</kbd></button>
          ${parts.rail}${dockSettings}
        </div>
      </div>
      <div class="dock-pins" data-dock-pins role="toolbar" aria-label="${L("常驻插件")}"></div>
    </div>
    ${renderAssistantDock(primitives)}
    <div class="bar-end">
      ${residents ? `<div class="bar-residents" role="toolbar" aria-label="${L("常驻插件")}">${residents}</div>` : ""}
      <button class="bar-chat" type="button" data-dock-toggle="im" data-side-toggle aria-expanded="false" aria-controls="dock-window-im" data-craft-tip="${L("侧栏：讨论、浏览器与文件")}" aria-label="${L("侧栏：讨论、浏览器与文件")}">${icon("sidebar")}</button>
      ${renderSidePanel(primitives, parts.sideTabs ?? [])}
      ${parts.projectChrome}
    </div>
  </div>`;
}

/** Application chrome only. Plugin owners continue to render and operate their content. */
export function renderDirectoryPluginSections(
  primitives: ImmersiveShellPrimitives,
  enabled: readonly string[],
  panels: Readonly<Record<string, string>>,
  activeDirectory = "root",
  settingsSection = "",
): string {
  const current = currentListPlugin(activeDirectory);
  const plugins = directoryPlugins(enabled).flatMap((plugin) => {
    const panel = panels[plugin.id] || "";
    if (!panel) return [];
    const visible = plugin.id === current;
    return [`<section class="plugin-section is-expanded" data-plugin-section="${plugin.id}"${panel.includes('data-directory-panel=') ? "" : ` data-directory-panel="${plugin.id}"`} data-plugin-expanded="true"${visible ? "" : " hidden"}>${pluginLink(primitives, plugin)}<div class="plugin-section-body" id="plugin-section-body-${plugin.id}">${panel}</div></section>`];
  }).join("");
  return `${plugins}${settingsSection}`;
}

export function renderImmersiveHeader(primitives: ImmersiveShellPrimitives, desktop: boolean): string {
  const { L, icon } = primitives;
  return `<header class="workbench-header immersive-titlebar"${desktop ? ' data-tauri-drag-region="deep"' : ""}>
    <div class="mw-group workspace-history">
      <button class="mw-btn mw-btn--ghost mw-btn--icon-only workspace-history-button" type="button" data-workspace-history="back" aria-label="${L("上一步")}" title="${L("上一步")}" disabled>${icon("back")}</button>
      <button class="mw-btn mw-btn--ghost mw-btn--icon-only workspace-history-button" type="button" data-workspace-history="forward" aria-label="${L("下一步")}" title="${L("下一步")}" disabled>${icon("arrow")}</button>
    </div>
    <strong data-immersive-plugin-title hidden>Goals</strong>
    <div class="mw-group immersive-goal-tools" data-immersive-goal-tools hidden><button class="mw-btn mw-btn--ghost mw-btn--icon-only immersive-icon-button" type="button" data-work-surface-open="goal" aria-label="${L("打开 Goal 列表")}" title="${L("打开 Goal 列表")}">${icon("list")}</button></div>
    <nav class="tab-strip tab-strip--chrome" data-titlebar-tabs aria-label="${L("工作区标签")}"></nav>
    <nav class="container-tabs" data-container-tabs aria-label="${L("工作区标签")}" hidden></nav>
    <div class="desktop-titlebar-drag"${desktop ? " data-tauri-drag-region" : ""} aria-hidden="true"></div>
    <button class="mw-btn mw-btn--ghost background-tasks-button" type="button" data-background-tasks aria-label="${L("后台任务")}" title="${L("后台任务")}" hidden>${icon("activity")}<span data-background-tasks-count>0</span></button>
    <button class="mw-btn mw-btn--ghost plugin-notifications-button" type="button" data-plugin-notifications aria-label="${L("插件通知")}" title="${L("插件通知")}" hidden>${icon("bell")}<span data-plugin-notifications-count>0</span></button>
  </header>`;
}

export function renderWorkspaceChrome(primitives: ImmersiveShellPrimitives, chromeHtml: string): string {
  const { L } = primitives;
  return `<section class="workspace-chrome project-island titlebar-chrome navigator-project" data-workspace-chrome data-titlebar-chrome data-project-island aria-label="${L("当前项目")}">${chromeHtml}</section>`;
}

export function renderImmersiveGoalHeader(title: string, primitives: ImmersiveShellPrimitives): string {
  const { L, escapeHtml, icon } = primitives;
  return `<header class="goal-node-toolbar"><button class="goal-node-back" type="button" data-goal-collapse aria-label="${L("返回 Goal 画布")}" title="${L("返回 Goal 画布")}">${icon("chevron-right")}</button><div class="goal-node-heading"><h1 data-workspace-goal-title tabindex="-1">${escapeHtml(title)}</h1><span data-workspace-goal-status></span></div><div class="mw-toggle-group goal-view-switch" data-slot="toggle-group" role="group" aria-label="${L("Goal 视图")}"><button class="mw-toggle is-current" type="button" data-goal-view-tab="document" aria-pressed="true">${icon("file")}<span>${L("概览")}</span></button><button class="mw-toggle" type="button" data-goal-view-tab="work" aria-pressed="false">${icon("terminal")}<span>${L("终端")}</span></button></div>
  </header>`;
}

export function renderGoalDetailsAside(documentHtml: string, primitives: ImmersiveShellPrimitives): string {
  const { L, icon } = primitives;
  return `<aside class="goal-details-aside" data-goal-details-aside>
      <button class="goal-details-toggle" type="button" data-goal-details-toggle aria-expanded="true" aria-label="${L("收起 Goal 信息与时间线")}" title="${L("Goal 信息与时间线")}">${icon("panel")}</button>
      ${documentHtml}
    </aside>`;
}

export function renderImmersiveWorkTabs({ L, icon }: ImmersiveShellPrimitives): string {
  return `<div class="goal-work-modebar"><div role="tablist" aria-label="${L("工作方式")}"><button type="button" role="tab" id="goal-conversation-tab" aria-selected="false" aria-disabled="true" disabled tabindex="-1" title="${L("对话尚未接入")}" data-goal-work-mode="conversation">${icon("message")}<span>${L("对话")}</span></button><button type="button" role="tab" id="goal-terminal-tab" aria-controls="goal-tui-pane" aria-selected="true" data-goal-work-mode="terminal">${icon("terminal")}<span>${L("终端")}</span></button></div><span data-goal-runtime-status></span></div>`;
}

export { renderProjectHome } from "./project-home.js";

export function renderGlobalSearchOverlay({ L, icon }: ImmersiveShellPrimitives): string {
  return `<dialog class="global-search-dialog" data-global-search-dialog aria-label="${L("搜索项目内的内容")}">
    <form class="global-search-shell" data-global-search-form>
      <div class="global-search-field">${icon("search")}<input class="global-search-query" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="global-search-results" data-global-search placeholder="${L("搜索")}" aria-label="${L("搜索项目内的内容")}" autocomplete="off" enterkeyhint="search"><kbd>⌘K</kbd><button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only" data-global-search-close aria-label="${L("关闭")}">${icon("x")}</button></div>
      <div class="global-search-scopes" data-global-search-scopes role="group" aria-label="${L("搜索范围")}">
        <button type="button" class="global-search-scope-option" data-global-search-scope-option="all" aria-pressed="true">${L("本项目与个人")}</button>
        <button type="button" class="global-search-scope-option" data-global-search-scope-option="project" aria-pressed="false">${L("仅本项目")}</button>
        <button type="button" class="global-search-scope-option" data-global-search-scope-option="personal" aria-pressed="false">${L("仅个人")}</button>
      </div>
      <p class="global-search-scope" data-global-search-status role="status" aria-live="polite">${L("搜索本项目与个人的全部内容，或按名称切换工具")}</p>
      <div id="global-search-results" class="global-search-body" data-global-search-results role="listbox" aria-label="${L("搜索结果")}"></div>
    </form>
  </dialog>`;
}

export function renderPluginMarket({ L, icon, escapeHtml }: ImmersiveShellPrimitives): string {
  // Sites a Plugin says it uses in the side panel browser are read before it is added (specs/side-panel D16).
  const sites = (plugin: { sites: readonly string[] }) => plugin.sites.length
    ? `<small class="plugin-market-sites" data-market-sites>${L("会在侧栏浏览器里使用")}：${plugin.sites.map(site => escapeHtml(site)).join("、")}</small>` : "";
  const rows = pluginMarketCards().map(plugin => `<article class="mw-card" data-market-plugin="${plugin.id}" data-market-runtime-id="${plugin.runtime_id}"><div class="plugin-market-icon">${icon(plugin.glyph as MolisWorkIcon)}</div><div class="plugin-market-copy"><h2>${plugin.label}</h2><p>${L(plugin.copy)}</p>${sites(plugin)}<small class="plugin-market-version" data-market-version hidden></small></div><button class="mw-btn mw-btn--secondary" type="button" data-market-upgrade hidden disabled>${L("升级")}</button><button class="mw-btn mw-btn--secondary" type="button" data-market-open="${plugin.id}" hidden>${L("打开")}</button><button class="mw-btn mw-btn--secondary" type="button" data-market-add="${plugin.id}" disabled>${L("添加")}</button></article>`).join("");
  return `<div class="plugin-market-body">
    <header class="plugin-market-heading"><div><h1>${L("插件")}</h1><p>${L("给这个项目添加插件，或打开已经在用的。")}</p></div><div class="plugin-market-destination"><label id="plugin-market-destination-label" for="plugin-market-project-trigger">${L("添加到")}</label><button type="button" class="plugin-market-project-trigger" id="plugin-market-project-trigger" data-market-project-trigger popovertarget="plugin-market-project-menu" aria-labelledby="plugin-market-destination-label plugin-market-project-label" aria-haspopup="listbox" aria-expanded="false" disabled><strong id="plugin-market-project-label" data-market-project-label></strong>${icon("chevron-down")}</button><div id="plugin-market-project-menu" popover="auto" class="plugin-market-project-popover" data-market-project-popover role="listbox" aria-labelledby="plugin-market-destination-label"><nav data-market-project-options></nav></div><select data-market-project hidden tabindex="-1" aria-hidden="true" disabled></select><template data-market-project-check>${icon("check")}</template></div></header>
    <label class="plugin-market-search mw-input-group">${icon("search")}<input class="mw-input" type="search" data-market-search placeholder="${L("搜索插件")}" aria-label="${L("搜索插件")}" autocomplete="off"></label>
    <div class="plugin-market-status-row"><p class="plugin-market-status" data-market-status role="status"></p><button class="mw-btn mw-btn--secondary" type="button" data-market-retry hidden>${L("重试")}</button></div>
    ${renderPluginEventRecovery(L)}
    <section class="plugin-market-installed" data-market-installed hidden><div class="plugin-market-section-head"><h2>${L("已添加")}</h2></div><div class="plugin-market-installed-row" data-market-installed-row></div></section>
    <div class="plugin-market-scope mw-toggle-group" role="group" aria-label="${L("筛选插件")}"><button class="mw-toggle is-current" type="button" data-market-scope="all" aria-pressed="true">${L("全部")}</button><button class="mw-toggle" type="button" data-market-scope="added" aria-pressed="false">${L("已添加")}</button></div>
    <section class="plugin-market-catalog" data-market-catalog><div class="plugin-market-section-head"><h2>${L("内置")}</h2></div><div class="plugin-market-list">${rows}</div></section>
    <p class="plugin-market-empty" data-market-empty hidden>${L("没有符合条件的插件")}</p>
  </div>`;
}
