import type { MolisWorkIcon } from "@molis-ai/molis-work-design-system";

export interface ImmersiveShellPrimitives {
  L(value: string): string;
  escapeHtml(value: unknown): string;
  icon(name: MolisWorkIcon): string;
}

/** Application chrome only. Plugin owners continue to render and operate their content. */
export function renderImmersivePluginStrip({ L, icon }: ImmersiveShellPrimitives, enabled: readonly string[]): string {
  const plugins = [
    { id: "goals", surface: "goal", label: "Goals", glyph: "target" as const },
    { id: "sessions", surface: "sessions", label: "Sessions", glyph: "terminal" as const },
    { id: "inbox", surface: "inbox", label: "Inbox", glyph: "input" as const },
    { id: "feed", surface: "feed", label: "Feed", glyph: "activity" as const },
    { id: "artifacts", surface: "artifacts", label: "Artifacts", glyph: "file" as const },
  ];
  const home = `<button class="immersive-plugin-link" type="button" data-plugin-id="home" data-work-surface-open="home" aria-label="${L("项目首页")}">${icon("home")}<span>${L("项目首页")}</span></button>`;
  const links = plugins.filter(plugin => enabled.includes(plugin.id)).map((plugin) => {
    const directory = plugin.id === "feed" ? "" : ` data-directory-open="${plugin.id}"`;
    const feedPreset = plugin.id === "feed" ? ' data-feed-preset="feed"' : "";
    return `<button class="immersive-plugin-link" type="button" data-plugin-id="${plugin.id}"${directory} data-work-surface-open="${plugin.surface}"${feedPreset} aria-label="${L("切换到插件")}：${plugin.label}">${icon(plugin.glyph)}<span>${plugin.label}</span></button>`;
  }).join("");
  const market = `<button class="immersive-plugin-link immersive-market-entry" type="button" data-plugin-id="market" data-work-surface-open="market" aria-label="${L("插件市场")}">${icon("plus")}<span>${L("插件市场")}</span></button>`;
  return `<div class="immersive-directory-heading" data-plugin-heading>
    <nav class="immersive-plugin-strip" data-plugin-strip aria-label="${L("项目入口")}">${home}${links}${market}</nav>
  </div>`;
}

const DIRECTORY_LIST_TITLES: Record<string, string> = {
  root: "项目首页",
  goals: "Goals",
  sessions: "Sessions",
  inbox: "Inbox",
  feed: "Feed",
  sources: "来源",
  artifacts: "Artifacts",
  settings: "项目设置",
};

export function directoryListTitle(directory: string, L: ImmersiveShellPrimitives["L"]): string {
  const key = DIRECTORY_LIST_TITLES[directory] || "项目首页";
  return directory === "goals" || directory === "sessions" || directory === "inbox" || directory === "feed" || directory === "artifacts"
    ? key
    : L(key);
}

export function wrapDirectoryListRegion(
  primitives: ImmersiveShellPrimitives,
  directory: string,
  panelsHtml: string,
): string {
  const { L } = primitives;
  return `<div class="directory-list-region" data-directory-list-region>
    <header class="directory-list-chrome" data-directory-list-chrome>
      <h2 class="directory-list-title" data-directory-list-title aria-live="polite">${directoryListTitle(directory, L)}</h2>
    </header>
    <div class="directory-list-stage" data-directory-list-stage>${panelsHtml}</div>
  </div>`;
}

export function renderDirectoryShortcuts({ L, icon }: ImmersiveShellPrimitives): string {
  return `<section class="directory-shortcuts" data-directory-shortcuts>
    <h2 class="directory-shortcuts-title">${L("快捷方式")}</h2>
    <ul class="directory-shortcuts-list" data-home-shortcuts aria-label="${L("快捷方式")}">
      <li class="directory-shortcut directory-shortcut-add"><button type="button" data-home-shortcut-add aria-label="${L("添加快捷方式")}"><span aria-hidden="true">${icon("plus")}</span><span>${L("添加")}</span></button></li>
    </ul>
    <p class="directory-shortcuts-error" data-home-shortcut-error role="alert" hidden></p>
    <template data-home-shortcut-template><li class="directory-shortcut"><a target="_blank" rel="noopener noreferrer" data-home-shortcut-link data-home-external>${icon("link")}<span data-home-shortcut-name></span></a><button type="button" data-home-shortcut-edit>${icon("more")}</button></li></template>
    <dialog class="home-shortcut-dialog" data-home-shortcut-dialog aria-labelledby="home-shortcut-title">
      <form data-home-shortcut-form novalidate>
        <header><h2 id="home-shortcut-title">${L("添加快捷方式")}</h2><button type="button" data-home-shortcut-cancel aria-label="${L("关闭")}">${icon("x")}</button></header>
        <label>${L("名称")}<input name="shortcut_name" maxlength="32" autocomplete="off" required placeholder="${L("例如：项目文档")}"></label>
        <label>${L("网址")}<input name="shortcut_url" type="url" maxlength="4096" autocomplete="off" required placeholder="https://"></label>
        <p class="home-shortcut-form-error" data-home-shortcut-form-error role="alert"></p>
        <footer><button type="button" class="home-shortcut-remove" data-home-shortcut-remove hidden>${L("移除")}</button><button type="button" data-home-shortcut-cancel>${L("取消")}</button><button type="submit" class="home-shortcut-save">${L("保存")}</button></footer>
      </form>
    </dialog>
  </section>`;
}

export function renderImmersiveHeader(primitives: ImmersiveShellPrimitives, desktop: boolean): string {
  const { L, icon } = primitives;
  return `<header class="workbench-header immersive-titlebar">
    <button class="immersive-icon-button immersive-show-directory" type="button" data-directory-show aria-label="${L("展开目录")}" title="${L("展开目录")}">${icon("panel")}</button>
    <button class="immersive-icon-button immersive-show-search" type="button" data-global-search-open aria-label="${L("打开搜索")}" title="${L("打开搜索")}">${icon("search")}</button>
    <strong data-immersive-plugin-title hidden>Goals</strong>
    <div class="immersive-goal-tools" data-immersive-goal-tools hidden><button class="immersive-icon-button" type="button" data-directory-open="goals" aria-label="${L("打开 Goal 列表")}" title="${L("打开 Goal 列表")}">${icon("list")}</button></div>
    <nav class="tab-strip tab-strip--chrome" data-titlebar-tabs aria-label="${L("工作区标签")}"></nav>
    <nav class="container-tabs" data-container-tabs aria-label="${L("工作区标签")}" hidden></nav>
    <div class="desktop-titlebar-drag"${desktop ? " data-tauri-drag-region" : ""} aria-hidden="true"></div>
  </header>`;
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
