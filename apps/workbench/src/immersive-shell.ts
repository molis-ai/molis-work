import type { MolisWorkIcon } from "@molis-ai/molis-work-design-system";
import { DIRECT_WORK_SURFACE_IDS, islandEntries, pluginMarketCards, railEntries } from "./plugin-catalog.js";

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
): string {
  const directory = DIRECT_WORK_SURFACE_IDS.has(plugin.id) ? "" : ` data-directory-open="${plugin.id}"`;
  const feedPreset = plugin.id === "feed" ? ' data-feed-preset="feed"' : "";
  const aria = plugin.id === "home" || plugin.id === "market"
    ? ` aria-label="${plugin.label}"`
    : ` aria-label="${L("切换到插件")}：${plugin.label}"`;
  const className = extraClass ? `immersive-plugin-link ${extraClass}` : "immersive-plugin-link";
  return `<button class="${className}" type="button" data-plugin-id="${plugin.id}"${directory} data-work-surface-open="${plugin.surface}"${feedPreset}${aria}>${icon(plugin.glyph)}<span>${plugin.label}</span></button>`;
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

/** Icon rail: home, enabled plugins, market. Account stays at the bottom. */
export function renderPluginRail(
  primitives: ImmersiveShellPrimitives,
  enabled: readonly string[],
  accountFooter: string,
): string {
  const { L } = primitives;
  const home = pluginLink(primitives, { id: "home", surface: "home", label: L("项目首页"), glyph: "home" }, "plugin-rail-item");
  const plugins = directoryPlugins(enabled)
    .map(plugin => pluginLink(primitives, plugin, "plugin-rail-item"))
    .join("");
  const market = pluginLink(primitives, { id: "market", surface: "market", label: L("插件市场"), glyph: "grid" }, "plugin-rail-item");
  return `<nav class="mw-sidebar mw-sidebar--rail plugin-rail immersive-plugin-strip" data-plugin-strip data-plugin-heading aria-label="${L("项目入口")}">
    <div class="plugin-rail-items">${home}${plugins}${market}</div>
    ${accountFooter}
  </nav>`;
}

/** Personal capture + Assistant entry, above the project island. */
export function renderAssistantIsland(
  primitives: ImmersiveShellPrimitives,
  enabled: readonly string[],
): string {
  const { L, icon } = primitives;
  const islandButtons = islandPlugins(enabled)
    .map(plugin => pluginLink(primitives, plugin, "plugin-rail-item"))
    .join("");
  return `<nav class="assistant-island" data-assistant-island aria-label="${L("灵光与对话")}">
    <div class="assistant-island-card">
      ${islandButtons}
      <button class="immersive-plugin-link plugin-rail-item" type="button" data-assistant-toggle popovertarget="assistant-composer" aria-expanded="false" aria-controls="assistant-composer" aria-haspopup="dialog" aria-label="${L("打开对话")}" title="${L("对话")}">${icon("message")}<span>${L("对话")}</span></button>
    </div>
    <form class="assistant-composer" id="assistant-composer" data-assistant-composer popover="auto" aria-label="Molis Work Assistant">
      <input class="assistant-composer-input" data-assistant-input type="text" autocomplete="off" placeholder="${L("发给 Assistant")}" aria-label="${L("发给 Assistant")}">
      <select class="mw-select" data-assistant-model aria-label="${L("模型")}" disabled>
        <option value="">${L("还没有可用模型")}</option>
      </select>
      <button class="mw-btn mw-btn--primary mw-btn--icon-only mw-btn--sm" type="submit" data-assistant-send aria-label="${L("发送")}" title="${L("发送")}" disabled>${icon("send")}</button>
    </form>
  </nav>`;
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
    return [`<section class="plugin-section is-expanded" data-plugin-section="${plugin.id}" data-plugin-expanded="true"${visible ? "" : " hidden"}>${pluginLink(primitives, plugin)}<div class="plugin-section-body" id="plugin-section-body-${plugin.id}">${panel}</div></section>`];
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
  </header>`;
}

export function renderWorkspaceChrome(primitives: ImmersiveShellPrimitives, chromeHtml: string): string {
  const { L } = primitives;
  return `<section class="workspace-chrome project-island titlebar-chrome navigator-project" data-workspace-chrome data-titlebar-chrome data-project-island aria-label="${L("当前项目")}">${chromeHtml}</section>`;
}

export function renderImmersiveGoalHeader(title: string, primitives: ImmersiveShellPrimitives): string {
  const { L, escapeHtml, icon } = primitives;
  return `<header class="goal-node-toolbar"><button class="goal-node-back" type="button" data-goal-collapse aria-label="${L("返回 Goal 画布")}" title="${L("返回 Goal 画布")}">${icon("chevron-right")}</button><div class="goal-node-heading"><h1 data-workspace-goal-title tabindex="-1">${escapeHtml(title)}</h1><span data-workspace-goal-status></span></div>
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
      <label class="global-search-field">${icon("search")}<input class="global-search-query" type="search" data-global-search placeholder="${L("搜索")}" aria-label="${L("搜索项目内的内容")}" autocomplete="off" enterkeyhint="search"><kbd>⌘K</kbd></label>
      <div class="global-search-body" data-global-search-results role="listbox" aria-label="${L("搜索结果")}"></div>
    </form>
  </dialog>`;
}

export function renderPluginMarket({ L, icon }: ImmersiveShellPrimitives): string {
  const rows = pluginMarketCards().map(plugin => `<article class="mw-card" data-market-plugin="${plugin.id}"><div class="plugin-market-icon">${icon(plugin.glyph as MolisWorkIcon)}</div><div class="plugin-market-copy"><h2>${plugin.label}</h2><p>${L(plugin.copy)}</p></div><button class="mw-btn mw-btn--secondary" type="button" data-market-add="${plugin.id}" disabled>${L("添加")}</button></article>`).join("");
  return `<div class="plugin-market-body">
    <header class="plugin-market-heading"><div><h1>${L("插件")}</h1></div><div class="plugin-market-destination"><label id="plugin-market-destination-label" for="plugin-market-project-trigger">${L("添加到")}</label><button type="button" class="plugin-market-project-trigger" id="plugin-market-project-trigger" data-market-project-trigger popovertarget="plugin-market-project-menu" aria-labelledby="plugin-market-destination-label plugin-market-project-label" aria-haspopup="listbox" aria-expanded="false" disabled><strong id="plugin-market-project-label" data-market-project-label></strong>${icon("chevron-down")}</button><div id="plugin-market-project-menu" popover="auto" class="plugin-market-project-popover" data-market-project-popover role="listbox" aria-labelledby="plugin-market-destination-label"><nav data-market-project-options></nav></div><select data-market-project hidden tabindex="-1" aria-hidden="true" disabled></select><template data-market-project-check>${icon("check")}</template></div></header>
    <label class="plugin-market-search mw-input-group">${icon("search")}<input class="mw-input" type="search" data-market-search placeholder="${L("搜索插件")}" aria-label="${L("搜索插件")}" autocomplete="off"></label>
    <div class="plugin-market-status-row"><p class="plugin-market-status" data-market-status role="status"></p><button class="mw-btn mw-btn--secondary" type="button" data-market-retry hidden>${L("重试")}</button></div>
    <section class="plugin-market-installed" data-market-installed hidden><div class="plugin-market-section-head"><h2>${L("已添加")}</h2></div><div class="plugin-market-installed-row" data-market-installed-row></div></section>
    <div class="plugin-market-scope mw-toggle-group" role="group" aria-label="${L("筛选插件")}"><button class="mw-toggle is-current" type="button" data-market-scope="all" aria-pressed="true">${L("全部")}</button><button class="mw-toggle" type="button" data-market-scope="added" aria-pressed="false">${L("已添加")}</button></div>
    <section class="plugin-market-catalog" data-market-catalog><div class="plugin-market-section-head"><h2>${L("内置")}</h2></div><div class="plugin-market-list">${rows}</div></section>
    <p class="plugin-market-empty" data-market-empty hidden>${L("没有符合条件的插件")}</p>
  </div>`;
}
