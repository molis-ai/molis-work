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
  const links = plugins.filter(plugin => enabled.includes(plugin.id)).map((plugin) => `<button class="immersive-plugin-link" type="button" data-plugin-id="${plugin.id}" data-directory-open="${plugin.id}" data-work-surface-open="${plugin.surface}"${plugin.id === "feed" ? ' data-feed-preset="feed"' : ""} aria-label="${L("切换到插件")}：${plugin.label}">${icon(plugin.glyph)}<span>${plugin.label}</span></button>`).join("");
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
  feedViews: string,
  panelsHtml: string,
): string {
  const { L } = primitives;
  return `<div class="directory-list-region" data-directory-list-region>
    <header class="directory-list-chrome" data-directory-list-chrome>
      <h2 class="directory-list-title" data-directory-list-title aria-live="polite">${directoryListTitle(directory, L)}</h2>
      ${feedViews}
    </header>
    <div class="directory-list-stage" data-directory-list-stage>${panelsHtml}</div>
  </div>`;
}

export function renderImmersiveHeader(primitives: ImmersiveShellPrimitives, desktop: boolean): string {
  const { L, icon } = primitives;
  return `<header class="workbench-header immersive-titlebar">
    <button class="immersive-icon-button immersive-show-directory" type="button" data-directory-show aria-label="${L("展开目录")}" title="${L("展开目录")}">${icon("panel")}</button>
    <strong data-immersive-plugin-title>Goals</strong>
    <div class="immersive-goal-tools" data-immersive-goal-tools><span>${L("画布")}</span><button class="immersive-icon-button" type="button" data-directory-open="goals" aria-label="${L("打开 Goal 列表")}" title="${L("打开 Goal 列表")}">${icon("list")}</button></div>
    <nav class="container-tabs" data-container-tabs aria-label="${L("工作区标签")}" hidden></nav>
    <div class="desktop-titlebar-drag"${desktop ? " data-tauri-drag-region" : ""} aria-hidden="true"></div>
    <button class="immersive-icon-button" type="button" data-immersive-theme aria-label="${L("切换外观")}" title="${L("切换外观")}">${icon("sun")}</button>
  </header>`;
}

export function renderImmersiveGoalHeader(title: string, primitives: ImmersiveShellPrimitives): string {
  const { L, escapeHtml, icon } = primitives;
  return `<header class="goal-node-toolbar"><div class="goal-node-heading"><h1 data-workspace-goal-title tabindex="-1">${escapeHtml(title)}</h1><span data-workspace-goal-status></span></div>
    <div class="goal-node-actions"><button type="button" data-goal-details-toggle aria-expanded="true" aria-label="${L("收起 Goal 信息与时间线")}" title="${L("Goal 信息与时间线")}">${icon("panel")}</button><button type="button" data-goal-collapse aria-label="${L("收起 Goal，返回关系画布")}" title="${L("收起 Goal，返回关系画布")}">${icon("x")}</button></div>
  </header>`;
}

export function renderImmersiveWorkTabs({ L, icon }: ImmersiveShellPrimitives): string {
  return `<div class="goal-work-modebar"><div role="tablist" aria-label="${L("工作方式")}"><button type="button" role="tab" id="goal-conversation-tab" aria-selected="false" aria-disabled="true" disabled tabindex="-1" title="${L("对话尚未接入")}" data-goal-work-mode="conversation">${icon("message")}<span>${L("对话")}</span></button><button type="button" role="tab" id="goal-terminal-tab" aria-controls="goal-tui-pane" aria-selected="true" data-goal-work-mode="terminal">${icon("terminal")}<span>${L("终端")}</span></button></div><span data-goal-runtime-status></span></div>`;
}

export { renderProjectHome } from "./project-home.js";

export function renderPluginMarket({ L, icon }: ImmersiveShellPrimitives): string {
  const plugins = [
    { id: "goals", label: "Goals", glyph: "target" as const, copy: "确定目标，推进工作，留下结果。" },
    { id: "sessions", label: "Sessions", glyph: "terminal" as const, copy: "回到你的会话，继续正在做的事。" },
    { id: "inbox", label: "Inbox", glyph: "input" as const, copy: "只看需要你介入的事项。" },
    { id: "feed", label: "Feed", glyph: "activity" as const, copy: "查看来源消息和完整流水。" },
    { id: "artifacts", label: "Artifacts", glyph: "file" as const, copy: "打开项目成果，查看保留下来的版本。" },
  ];
  return `<header class="plugin-market-heading"><span>Molis Work</span><h1>${L("插件市场")}</h1><p>${L("把需要的工作方式添加到项目。")}</p></header>
    <div class="plugin-market-controls"><label>${L("搜索插件")}<input type="search" data-market-search placeholder="${L("名称或用途")}"></label><label>${L("添加到项目")}<select data-market-project aria-label="${L("添加到项目")}" disabled></select></label><label class="plugin-market-filter"><input type="checkbox" data-market-added>${L("仅看已添加")}</label></div>
    <p class="plugin-market-status" data-market-status role="status"></p><button type="button" data-market-retry hidden>${L("重试")}</button>
    <div class="plugin-market-body"><div class="plugin-market-grid">${plugins.map(plugin => `<article data-market-plugin="${plugin.id}"><div class="plugin-market-icon">${icon(plugin.glyph)}</div><h2>${plugin.label}</h2><p>${L(plugin.copy)}</p><footer><span>${L("内置")}</span><button type="button" data-market-add="${plugin.id}" disabled>${L("添加到项目")}</button></footer></article>`).join("")}</div>
    <p data-market-empty hidden>${L("没有符合条件的插件")}</p></div><p class="plugin-market-note">${L("这里提供随 Molis Work 一起交付的内置插件。")}</p>`;
}
