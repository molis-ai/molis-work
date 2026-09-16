import type { MolisWorkIcon } from "@molis-ai/molis-work-design-system";

export interface ImmersiveShellPrimitives {
  L(value: string): string;
  escapeHtml(value: unknown): string;
  icon(name: MolisWorkIcon): string;
}

const DIRECTORY_PLUGINS = [
  { id: "goals", surface: "goal", label: "Goals", glyph: "target" as const },
  { id: "task", surface: "task", label: "Task", glyph: "list" as const },
  { id: "sessions", surface: "sessions", label: "Sessions", glyph: "terminal" as const },
  { id: "inbox", surface: "inbox", label: "Inbox", glyph: "input" as const },
  { id: "feed", surface: "feed", label: "Feed", glyph: "activity" as const },
  { id: "artifacts", surface: "artifacts", label: "Artifacts", glyph: "file" as const },
] as const;

function pluginLink(
  { L, icon }: ImmersiveShellPrimitives,
  plugin: { id: string; surface: string; label: string; glyph: MolisWorkIcon },
  extraClass = "",
): string {
  const directory = plugin.id === "home" || plugin.id === "market" || plugin.id === "feed" ? "" : ` data-directory-open="${plugin.id}"`;
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

/** Icon rail: home, enabled plugins, market. Account stays at the bottom. */
export function renderPluginRail(
  primitives: ImmersiveShellPrimitives,
  enabled: readonly string[],
  accountFooter: string,
): string {
  const { L } = primitives;
  const home = pluginLink(primitives, { id: "home", surface: "home", label: L("项目首页"), glyph: "home" }, "plugin-rail-item");
  const plugins = DIRECTORY_PLUGINS.filter(plugin => enabled.includes(plugin.id))
    .map(plugin => pluginLink(primitives, plugin, "plugin-rail-item"))
    .join("");
  const market = pluginLink(primitives, { id: "market", surface: "market", label: L("插件市场"), glyph: "plus" }, "plugin-rail-item");
  return `<nav class="plugin-rail immersive-plugin-strip" data-plugin-strip data-plugin-heading aria-label="${L("项目入口")}">
    <div class="plugin-rail-items">${home}${plugins}${market}</div>
    ${accountFooter}
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
  const plugins = DIRECTORY_PLUGINS.filter(plugin => enabled.includes(plugin.id)).map((plugin) => {
    const panel = panels[plugin.id] || "";
    const visible = plugin.id === current;
    return `<section class="plugin-section is-expanded" data-plugin-section="${plugin.id}" data-plugin-expanded="true"${visible ? "" : " hidden"}>${pluginLink(primitives, plugin)}<div class="plugin-section-body" id="plugin-section-body-${plugin.id}">${panel}</div></section>`;
  }).join("");
  return `${plugins}${settingsSection}`;
}

export function renderImmersiveHeader(primitives: ImmersiveShellPrimitives, desktop: boolean): string {
  const { L, icon } = primitives;
  return `<header class="workbench-header immersive-titlebar">
    <div class="workspace-history">
      <button class="workspace-history-button" type="button" data-workspace-history="back" aria-label="${L("上一步")}" title="${L("上一步")}" disabled>${icon("back")}</button>
      <button class="workspace-history-button" type="button" data-workspace-history="forward" aria-label="${L("下一步")}" title="${L("下一步")}" disabled>${icon("arrow")}</button>
    </div>
    <strong data-immersive-plugin-title hidden>Goals</strong>
    <div class="immersive-goal-tools" data-immersive-goal-tools hidden><button class="immersive-icon-button" type="button" data-directory-open="goals" aria-label="${L("打开 Goal 列表")}" title="${L("打开 Goal 列表")}">${icon("list")}</button></div>
    <nav class="tab-strip tab-strip--chrome" data-titlebar-tabs aria-label="${L("工作区标签")}"></nav>
    <nav class="container-tabs" data-container-tabs aria-label="${L("工作区标签")}" hidden></nav>
    <div class="desktop-titlebar-drag"${desktop ? " data-tauri-drag-region" : ""} aria-hidden="true"></div>
  </header>`;
}

export function renderWorkspaceChrome(primitives: ImmersiveShellPrimitives, chromeHtml: string): string {
  const { L } = primitives;
  return `<section class="workspace-chrome titlebar-chrome navigator-project" data-workspace-chrome data-titlebar-chrome aria-label="${L("当前项目")}">${chromeHtml}</section>`;
}

export function renderImmersiveGoalHeader(title: string, primitives: ImmersiveShellPrimitives): string {
  const { L, escapeHtml, icon } = primitives;
  return `<header class="goal-node-toolbar"><button class="goal-node-back" type="button" data-goal-collapse aria-label="${L("返回 Goal 画布")}" title="${L("返回 Goal 画布")}">${icon("chevron-right")}</button><div class="goal-node-heading"><h1 data-workspace-goal-title tabindex="-1">${escapeHtml(title)}</h1><span data-workspace-goal-status></span></div>
    <div class="goal-node-actions"><button type="button" data-goal-details-toggle aria-expanded="true" aria-label="${L("收起 Goal 信息与时间线")}" title="${L("Goal 信息与时间线")}">${icon("panel")}</button></div>
  </header>`;
}

export function renderImmersiveWorkTabs({ L, icon }: ImmersiveShellPrimitives): string {
  return `<div class="goal-work-modebar"><div role="tablist" aria-label="${L("工作方式")}"><button type="button" role="tab" id="goal-conversation-tab" aria-selected="false" aria-disabled="true" disabled tabindex="-1" title="${L("对话尚未接入")}" data-goal-work-mode="conversation">${icon("message")}<span>${L("对话")}</span></button><button type="button" role="tab" id="goal-terminal-tab" aria-controls="goal-tui-pane" aria-selected="true" data-goal-work-mode="terminal">${icon("terminal")}<span>${L("终端")}</span></button></div><span data-goal-runtime-status></span></div>`;
}

export { renderProjectHome } from "./project-home.js";

export function renderGlobalSearchOverlay({ L }: ImmersiveShellPrimitives): string {
  return `<dialog class="global-search-dialog" data-global-search-dialog aria-label="${L("搜索项目内的内容")}">
    <form class="global-search-shell" data-global-search-form>
      <label class="global-search-field"><input type="search" data-global-search placeholder="${L("搜索")}" aria-label="${L("搜索项目内的内容")}" autocomplete="off" enterkeyhint="search"><kbd>⌘K</kbd></label>
      <div class="global-search-body" data-global-search-results role="listbox" aria-label="${L("搜索结果")}"></div>
    </form>
  </dialog>`;
}

export function renderPluginMarket({ L, icon }: ImmersiveShellPrimitives): string {
  const plugins = [
    { id: "goals", label: "Goals", glyph: "target" as const, copy: "确定目标，推进工作，留下结果。" },
    { id: "task", label: "Task", glyph: "list" as const, copy: "真正开始做的工作台，不必先有 Goal。" },
    { id: "sessions", label: "Sessions", glyph: "terminal" as const, copy: "回到你的会话，继续正在做的事。" },
    { id: "inbox", label: "Inbox", glyph: "input" as const, copy: "只看需要你介入的事项。" },
    { id: "feed", label: "Feed", glyph: "activity" as const, copy: "查看来源消息和完整流水。" },
    { id: "artifacts", label: "Artifacts", glyph: "file" as const, copy: "打开项目成果，查看保留下来的版本。" },
  ];
  const rows = plugins.map(plugin => `<article data-market-plugin="${plugin.id}"><div class="plugin-market-icon">${icon(plugin.glyph)}</div><div class="plugin-market-copy"><h2>${plugin.label}</h2><p>${L(plugin.copy)}</p></div><button type="button" data-market-add="${plugin.id}" disabled>${L("添加")}</button></article>`).join("");
  return `<div class="plugin-market-body">
    <header class="plugin-market-heading"><div><h1>${L("插件")}</h1></div><div class="plugin-market-destination"><label id="plugin-market-destination-label" for="plugin-market-project-trigger">${L("添加到")}</label><button type="button" class="plugin-market-project-trigger" id="plugin-market-project-trigger" data-market-project-trigger popovertarget="plugin-market-project-menu" aria-labelledby="plugin-market-destination-label plugin-market-project-label" aria-haspopup="listbox" aria-expanded="false" disabled><strong id="plugin-market-project-label" data-market-project-label></strong>${icon("chevron-down")}</button><div id="plugin-market-project-menu" popover="auto" class="plugin-market-project-popover" data-market-project-popover role="listbox" aria-labelledby="plugin-market-destination-label"><nav data-market-project-options></nav></div><select data-market-project hidden tabindex="-1" aria-hidden="true" disabled></select><template data-market-project-check>${icon("check")}</template></div></header>
    <label class="plugin-market-search">${icon("search")}<input type="search" data-market-search placeholder="${L("搜索插件")}" aria-label="${L("搜索插件")}" autocomplete="off"></label>
    <div class="plugin-market-status-row"><p class="plugin-market-status" data-market-status role="status"></p><button type="button" data-market-retry hidden>${L("重试")}</button></div>
    <section class="plugin-market-installed" data-market-installed hidden><div class="plugin-market-section-head"><h2>${L("已添加")}</h2></div><div class="plugin-market-installed-row" data-market-installed-row></div></section>
    <div class="plugin-market-scope" role="group" aria-label="${L("筛选插件")}"><button type="button" data-market-scope="all" aria-pressed="true">${L("全部")}</button><button type="button" data-market-scope="added" aria-pressed="false">${L("已添加")}</button></div>
    <section class="plugin-market-catalog" data-market-catalog><div class="plugin-market-section-head"><h2>${L("内置")}</h2></div><div class="plugin-market-list">${rows}</div></section>
    <p class="plugin-market-empty" data-market-empty hidden>${L("没有符合条件的插件")}</p>
  </div>`;
}
