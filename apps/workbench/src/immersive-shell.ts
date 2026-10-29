import { UI_VIEW_GROUPS, type UiViewGroup } from "@molis-ai/molis-work-contracts/platform/ui";
import { icon as glyph, renderButton, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { withPluginWords } from "./i18n.js";
import { renderPluginEventRecovery } from "./plugin-event-recovery.js";
import { DIRECT_WORK_SURFACE_IDS, RELOAD_ON_MEMBERSHIP_IDS, builtinPluginDirectory, dockDefaultPins, extendPluginIds, islandEntries, pluginLabel, pluginMarketCards, railEntries, pluginStageSummaries, type PluginMarketOptions } from "./plugin-catalog.js";
import type { PluginDirectory } from "./plugin-directory.js";
import { renderAssistantDock } from "./assistant-dock.js";
import { renderSidePanel, type SidePanelPluginTab } from "./side-panel.js";
import { renderHomePluginNavigation } from "./home-plugin-navigation.js";

export interface ImmersiveShellPrimitives {
  L(value: string): string;
  escapeHtml(value: unknown): string;
  icon(name: PluginIconName): string;
  /** The page's language ("en" for English); plugin names and lists follow it. */
  htmlLang?(): string;
}

/** Whether these primitives render the English interface. */
const english = (primitives: ImmersiveShellPrimitives): boolean => primitives.htmlLang?.() === "en";

/** A translated sentence with its `{names}` filled in here, so any translator works (the shell's own stand-ins included). */
const say = (L: ImmersiveShellPrimitives["L"], template: string, values: Readonly<Record<string, string>>): string =>
  Object.entries(values).reduce((text, [key, value]) => text.split(`{${key}}`).join(value), L(template));

/**
 * Navigation comes from the Plugin catalog's Manifests, not from a list kept
 * here. Adding a Plugin must never mean editing the shell. A plugin's work
 * surface is its id, Goals' too (T-114).
 */

function directoryPlugins(directory: PluginDirectory, enabled: readonly string[], inEnglish = false) {
  return railEntries(enabled, directory).map(entry => ({
    id: entry.id,
    surface: entry.surface,
    label: pluginLabel(entry.id, entry.label, inEnglish),
    glyph: entry.glyph as PluginIconName,
    group: entry.group,
    rail: entry.rail,
    chosen: entry.chosen,
  }));
}

function pluginLink(
  { L, icon, escapeHtml }: ImmersiveShellPrimitives,
  rawPlugin: { id: string; surface: string; label: string; glyph: PluginIconName; hint?: string; chosen?: boolean },
  extraClass = "",
  suffix = "",
): string {
  // A name a Manifest declares is text from its publisher: it is escaped where it is written into the page.
  const plugin = { ...rawPlugin, label: escapeHtml(rawPlugin.label) };
  // A plugin installed at run time has a stage and no directory panel to open.
  const directory = rawPlugin.chosen === false || DIRECT_WORK_SURFACE_IDS.has(plugin.id) ? "" : ` data-directory-open="${plugin.id}"`;
  const feedPreset = plugin.id === "feed" ? ' data-feed-preset="feed"' : "";
  const aria = plugin.id === "home" || plugin.id === "market"
    ? ` aria-label="${plugin.label}"`
    : ` aria-label="${say(L, "切换到插件：{name}", { name: plugin.label })}"`;
  const className = extraClass ? `immersive-plugin-link ${extraClass}` : "immersive-plugin-link";
  // One line under the name says what the person gets there (the switcher shows it; the Dock does not).
  const hint = plugin.hint ? `<small class="plugin-rail-hint">${plugin.hint}</small>` : "";
  return `<button class="${className}" type="button" data-plugin-id="${plugin.id}"${directory} data-work-surface-open="${plugin.surface}"${feedPreset}${aria} title="${plugin.label}">${icon(plugin.glyph)}<span>${plugin.label}</span>${hint}${suffix}</button>`;
}

function currentListPlugin(directory: string): string {
  if (directory === "sources") return "feed";
  if (directory === "root" || directory === "market" || directory === "home") return "";
  return directory;
}

function islandPlugins(directory: PluginDirectory, enabled: readonly string[], inEnglish = false) {
  return islandEntries(enabled, directory).map(entry => ({
    id: entry.id,
    surface: entry.surface,
    label: pluginLabel(entry.id, entry.label, inEnglish),
    glyph: entry.glyph as PluginIconName,
    group: entry.group,
    rail: entry.rail,
    chosen: entry.chosen,
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
 * Only the backbone is listed here. Every other Plugin is listed in the group its view names
 * (`group`, W5-06 2b), and one that names none, including one added later, lands in 更多, so adding
 * a Plugin never edits the shell.
 */
/**
 * The names of the groups a view can name, which the Host owns (their order is `UI_VIEW_GROUPS`'): 推进 (the backbone plus
 * its helpers), 写与做 (things one makes), 个人 (what belongs to the person), 研究, 编码. See
 * specs/archive/plugin-e2e-review/spec.md §3.1.
 */
const RAIL_GROUP_LABELS: Readonly<Record<UiViewGroup, string>> = { advance: "推进", make: "写与做", personal: "个人", research: "研究", code: "编码" };
const RAIL_HOME_HINT = "今天的工作、当天的事件和回到手边的入口。";

/**
 * The person's entries, the backbone and this project's tools (recent first, the rest one click away).
 *
 * Every plugin a project could have is listed once, in its group, as one tile. A tile this project has reads in full
 * colour and opens its plugin; one it does not have is grey and opens nothing. Each tile carries the same two small
 * buttons, shown when the tile is looked at (the row yields to them, as DropAgent's directory rows do): keep it in the Dock
 * (the Dock's list is these buttons; there is no second list), and add it to or remove it from this project. The client
 * changes a tile's state in place (specs/archive/plugin-picker-dock), so the markup is the same in both states.
 */
/**
 * The plugin keys that go when one goes: `id` plus every member whose companions name something already going. The Projects service
 * applies the same closure on removal, so the Dock and the market both say it from the directory alone.
 */
function dependentPlugins(id: string, members: ReadonlySet<string> | readonly string[], companionsOf: (id: string) => readonly string[]): string[] {
  const going = new Set([id]);
  for (let changed = true; changed;) {
    changed = false;
    for (const other of members) if (!going.has(other) && companionsOf(other).some(companion => going.has(companion))) { going.add(other); changed = true; }
  }
  going.delete(id);
  return [...going];
}

export function renderPluginRail(
  primitives: ImmersiveShellPrimitives,
  enabled: readonly string[],
  personalIsland = "",
  directory: PluginDirectory = builtinPluginDirectory(),
  options: PluginMarketOptions = {},
): string {
  const { L, icon, escapeHtml } = primitives;
  const have = new Set(enabled);
  const extendIds = extendPluginIds(directory), pinned = new Set(dockDefaultPins(directory));
  const cards = pluginMarketCards(options, directory);
  const addable = cards.map(card => card.id).filter(id => !have.has(id) && !extendIds.has(id));
  const everyone = [...enabled, ...addable];
  const entries = directoryPlugins(directory, everyone, english(primitives));
  const islands = islandPlugins(directory, everyone, english(primitives));
  const join = (values: readonly string[]) => values.join(L("、"));
  const summaries = pluginStageSummaries();
  // A summary is the Plugin's own text, so it is English in that Plugin's own words and nobody else's.
  const hints = Object.fromEntries(Object.entries(summaries).map(([id, { plugin_id, summary }]) => [id, withPluginWords(plugin_id, () => L(summary))]));
  const names = new Map<string, string>([...entries, ...islands].map(plugin => [plugin.id, plugin.label]));
  const sitesOf = new Map(cards.map(card => [card.id, card.sites]));
  const zoned = (html: string, zone: string) => html.replace("<button ", `<button data-rail-zone="${zone}" `).replace("<a ", `<a data-rail-zone="${zone}" `);
  const link = (plugin: { id: string; surface: string; label: string; glyph: PluginIconName; hint?: string; chosen?: boolean }, zone: string, suffix = "") =>
    zoned(pluginLink(primitives, { ...plugin, hint: plugin.hint ?? hints[plugin.id] }, "plugin-rail-item", suffix), zone);
  // What adding one adds with it, and what removing one takes with it (the Projects service applies both, so the tile says so). Both
  // read the Host's marks on the directory (W5-02 B1); the Host's own registry decides, whatever the page says.
  const marks = new Map(directory.map(entry => [entry.id, entry]));
  const companionsOf = (id: string): readonly string[] => marks.get(id)?.companions ?? [];
  const alongWith = (id: string): string[] => companionsOf(id).filter(other => other !== id && !have.has(other));
  const dependentsOf = (id: string): string[] => dependentPlugins(id, have, companionsOf);
  const named = (ids: readonly string[]) => ids.map(id => names.get(id) ?? id).join("|");
  // The pin: kept in the Dock (graphite) or not (grey); out of reach until the plugin is in the project.
  const pinButton = (plugin: { id: string; label: string }, owned: boolean) => {
    const kept = owned && pinned.has(plugin.id);
    return renderButton({ variant: kept ? "primary" : "secondary", size: "sm", icon: "pin", iconOnly: true, className: "dock-keep", disabled: !owned,
      label: say(L, "常驻 Dock：{name}", { name: plugin.label }), attrs: { "data-dock-choice": plugin.id, "aria-pressed": String(kept), title: L("常驻 Dock") } });
  };
  // One button, two states: a plus while the plugin is not in the project, a red trash can once it is. Both glyphs are in the
  // button, so a change of state is the tile's class and nothing more; the stylesheet shows the one that fits. A 常开 plugin stays.
  const toggleButton = (plugin: { id: string; label: string }, owned: boolean, along: readonly string[]) => {
    const locked = owned && marks.get(plugin.id)?.always_on === true;
    const sites = sitesOf.get(plugin.id) ?? [];
    const alongNote = along.length ? say(L, "；添加会同时添加：{list}", { list: join(along.map(id => names.get(id) ?? id)) }) : "";
    // What adding it will not bring although it depends on it: an addable plugin cannot add them for it (RAC-1315).
    const needed = owned ? [] : addable.filter(id => id !== plugin.id && companionsOf(id).includes(plugin.id));
    const dependNote = needed.length ? say(L, "；依赖它的插件不会一并添加：{list}", { list: join(needed.map(id => names.get(id) ?? id)) }) : "";
    const button = renderButton({ variant: owned ? "secondary" : "primary", size: "sm", icon: "plus", iconOnly: true, className: "plugin-toggle", disabled: locked,
      label: say(L, owned ? "移除：{name}" : "添加：{name}", { name: plugin.label }),
      attrs: { "data-plugin-toggle": plugin.id, "data-state": owned ? "added" : "available",
        title: locked ? L("常开插件不能从项目移除") : owned ? L("在本项目停用；数据保留，加回即恢复") : `${L("添加到本项目")}${alongNote}${dependNote}${sites.length ? say(L, "；会在侧栏浏览器里使用：{sites}", { sites: join(sites) }) : ""}` } });
    return button.replace(glyph("plus"), glyph("plus", "plugin-toggle-add") + glyph("trash", "plugin-toggle-remove"));
  };
  // At rest the end of the tile shows only a small pin when the plugin is kept; looked at, the buttons replace it.
  const mark = `<i class="plugin-rail-mark" aria-hidden="true">${icon("pin")}</i><small class="plugin-rail-confirm" aria-hidden="true"></small>`;
  const tile = (plugin: { id: string; surface: string; label: string; glyph: PluginIconName; chosen?: boolean }, zone: string) => {
    // A plugin installed at run time is in the project because it runs there; taking it out is whoever installed it, not this list.
    const installed = plugin.chosen === false;
    const owned = installed || have.has(plugin.id);
    const label = escapeHtml(plugin.label);
    const kept = owned && pinned.has(plugin.id);
    const along = owned ? [] : alongWith(plugin.id), dependents = owned ? dependentsOf(plugin.id) : [];
    const hint = hints[plugin.id] ? `<small class="plugin-rail-hint">${hints[plugin.id]}</small>` : "";
    const main = owned ? link(plugin, zone, mark)
      : `<button class="immersive-plugin-link plugin-rail-item" type="button" data-rail-zone="${zone}" aria-disabled="true" tabindex="-1" aria-label="${say(L, "{name}（未添加）", { name: label })}">${icon(plugin.glyph)}<span>${label}</span>${hint}${mark}</button>`;
    return `<div class="plugin-rail-tile${owned ? "" : " is-available"}${kept ? " is-kept" : ""}" data-plugin-tile="${plugin.id}"${along.length ? ` data-along="${escapeHtml(named(along))}"` : ""}${dependents.length ? ` data-dependents="${escapeHtml(named(dependents))}"` : ""}>${main}<span class="plugin-rail-ops" role="group" aria-label="${label}">${pinButton(plugin, owned)}${installed ? "" : toggleButton(plugin, owned, along)}</span></div>`;
  };
  const subgroup = (label: string, buttons: string) => buttons ? `<p class="plugin-rail-subgroup" data-rail-zone="more">${label}</p>${buttons}` : "";
  const home = link({ id: "home", surface: "home", label: L("项目首页"), glyph: "home", hint: L(RAIL_HOME_HINT) }, "core");
  const core = entries.filter(plugin => plugin.rail === "core").map(plugin => tile(plugin, "core")).join("");
  // 灵光 is a plugin like any other: an island leads the group its view names (个人).
  const tools = [...islands, ...entries].filter(plugin => plugin.rail === null);
  const grouped = UI_VIEW_GROUPS.map((group, index) => {
    const links = tools.filter(plugin => plugin.group === group).map(plugin => tile(plugin, "tool")).join("");
    // The backbone already sits under the first heading; its helpers follow without a second one.
    return index === 0 ? links : subgroup(L(RAIL_GROUP_LABELS[group]), links);
  }).join("");
  const other = tools.filter(plugin => plugin.group === null).map(plugin => tile(plugin, "tool")).join("");
  const toggle = `<button class="immersive-plugin-link plugin-rail-item plugin-rail-toggle" type="button" data-rail-tools-toggle aria-expanded="false" aria-label="${L("全部插件")}" title="${L("全部插件")}">${icon("more")}<span data-rail-toggle-label="${L("收起插件")}">${L("全部插件")}</span></button>`;
  return `<nav class="mw-sidebar mw-sidebar--rail plugin-rail immersive-plugin-strip" data-plugin-strip data-plugin-heading aria-label="${L("项目入口")}">
    ${personalIsland}
    <div class="plugin-rail-items" data-reload-plugins="${RELOAD_ON_MEMBERSHIP_IDS.join(" ")}">${home}<p class="plugin-rail-group" data-rail-zone="tools">${L(RAIL_GROUP_LABELS[UI_VIEW_GROUPS[0]])}</p>${core}${grouped}${subgroup(L("更多"), other)}${toggle}</div>
  </nav>`;
}

/**
 * The market and the plugin studio, the workbench's two ways to get more plugins, as two buttons at the head of the switcher
 * beside search (not rows among the plugins: they are things to do, not places). The group keeps `data-global-menu`, which
 * the client finds them by.
 */
export function renderPickerExtend(primitives: ImmersiveShellPrimitives, enabled: readonly string[]): string {
  const { L } = primitives;
  const button = (plugin: { id: string; surface: string; label: string; glyph: PluginIconName }, suffix = "") => {
    const html = renderButton({ variant: "secondary", size: "sm", icon: plugin.glyph, label: plugin.label, className: "plugin-picker-extend-btn",
      attrs: { "data-plugin-id": plugin.id, ...(DIRECT_WORK_SURFACE_IDS.has(plugin.id) ? {} : { "data-directory-open": plugin.id }), "data-work-surface-open": plugin.surface, title: plugin.label } });
    return html.replace(/<\/button>$/, `${suffix}</button>`);
  };
  const builder = directoryPlugins(builtinPluginDirectory(), enabled, english(primitives)).filter(plugin => plugin.rail === "extend").map(plugin => button(plugin)).join("");
  const market = button({ id: "market", surface: "market", label: L("插件市场"), glyph: "grid" },
    `<b class="plugin-rail-update-count" data-market-update-count hidden aria-live="polite"></b>`);
  return `<div class="plugin-picker-extend" data-global-menu role="group" aria-label="${L("添加与创作插件")}">${market}${builder}</div>`;
}

/**
 * The bottom bar replaces the rail. Left, where you go: the switcher — it names where you are (one chip per pane
 * when split) and opens, under search and the two buttons that get more plugins (the market, the plugin studio), every
 * plugin, each with the button that keeps it in the Dock — then the plugins chosen to stay; the two sit in one tray.
 * Centre: the resident Assistant, only an input. Right: the side panel's button (Shelf, 灵光, files, the browser, the
 * computer and the project's discussion beside the work, specs/side-shelf §3.1) in its tray, then the project as a round button
 * whose menu holds the project and the person — switching, search, settings, capabilities.
 */
export function renderWorkbenchBar(
  primitives: ImmersiveShellPrimitives,
  parts: { rail: string; projectChrome: string; enabled: readonly string[]; sideTabs?: readonly SidePanelPluginTab[] },
): string {
  const { L, icon } = primitives;
  return `<div class="workbench-bar" data-dock aria-label="${L("底栏")}">
    <div class="bar-start">
      <div class="plugin-picker" data-plugin-picker>
        <button class="plugin-picker-trigger" type="button" data-plugin-picker-toggle aria-expanded="false" aria-haspopup="true" aria-label="${L("全部插件与 Dock")}" title="${L("全部插件与 Dock")}"><span class="plugin-picker-all" aria-hidden="true">${icon("grid")}</span><span class="plugin-picker-current" data-plugin-picker-current>${icon("home")}<span>${L("项目首页")}</span></span>${icon("chevron-up")}</button>
        <div class="plugin-picker-popover" data-plugin-picker-popover hidden>
          <div class="plugin-picker-head">
            <button class="plugin-picker-search" type="button" data-global-search-open aria-label="${L("打开搜索")}" title="${L("打开搜索")}">${icon("search")}<span>${L("搜索")}</span><kbd>⌘K</kbd></button>
            ${renderPickerExtend(primitives, parts.enabled)}
          </div>
          ${parts.rail}
        </div>
      </div>
      <div class="dock-pins" data-dock-pins role="toolbar" aria-label="${L("常驻插件")}"></div>
    </div>
    ${renderAssistantDock(primitives)}
    <div class="bar-end">
      <div class="bar-side"><button class="bar-chat" type="button" data-side-toggle aria-expanded="false" aria-controls="side-panel" data-craft-tip="${L("侧栏：Shelf、灵光、资料、浏览器、电脑与讨论")}" aria-label="${L("侧栏：Shelf、灵光、资料、浏览器、电脑与讨论")}">${icon("sidebar")}</button></div>
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
  const plugins = directoryPlugins(builtinPluginDirectory(), enabled, english(primitives)).flatMap((plugin) => {
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
    <div class="mw-group immersive-goal-tools" data-immersive-goal-tools hidden><button class="mw-btn mw-btn--ghost mw-btn--icon-only immersive-icon-button" type="button" data-work-surface-open="goals" aria-label="${L("打开 Goal 列表")}" title="${L("打开 Goal 列表")}">${icon("list")}</button></div>
    <nav class="tab-strip tab-strip--chrome" data-titlebar-tabs aria-label="${L("工作区标签")}"></nav>
    <nav class="container-tabs" data-container-tabs data-overflow-fade aria-label="${L("工作区标签")}" hidden></nav>
    <div class="desktop-titlebar-drag"${desktop ? " data-tauri-drag-region" : ""} aria-hidden="true"></div>
    ${renderHomePluginNavigation()}
    <button class="mw-btn mw-btn--ghost background-tasks-button" type="button" data-background-tasks aria-label="${L("后台任务")}" title="${L("后台任务")}" hidden>${icon("activity")}<span data-background-tasks-count>0</span></button>
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

export function renderPluginMarket(primitives: ImmersiveShellPrimitives, options: PluginMarketOptions = {}, directory: PluginDirectory = builtinPluginDirectory()): string {
  const { L, icon, escapeHtml } = primitives;
  const join = (values: readonly string[]) => values.join(L("、"));
  // Sites a Plugin says it uses in the side panel browser are read before it is added (specs/archive/side-panel D16).
  const sites = (plugin: { sites: readonly string[] }) => plugin.sites.length
    ? `<small class="plugin-market-sites" data-market-sites>${say(L, "会在侧栏浏览器里使用：{sites}", { sites: join(plugin.sites.map(site => escapeHtml(site))) })}</small>` : "";
  // What adding one brings, and what removing one takes, in the same words the Projects service applies (W5-02 B1 marks, RAC-1310).
  const cards = pluginMarketCards(options, directory), cardIds = new Set(cards.map(card => card.id));
  const marks = new Map(directory.map(entry => [entry.id, entry]));
  const companionsOf = (id: string): readonly string[] => marks.get(id)?.companions ?? [];
  const related = (ids: readonly string[]) => ids.filter(id => cardIds.has(id));
  const rows = cards.map(card => ({ ...card, label: pluginLabel(card.id, card.label, english(primitives)) })).map(plugin => {
    const needs = related(companionsOf(plugin.id).filter(id => id !== plugin.id));
    const neededBy = dependentPlugins(plugin.id, cardIds, companionsOf);
    return `<article class="mw-card" data-market-plugin="${plugin.id}" data-market-runtime-id="${plugin.runtime_id}"${plugin.personal ? " data-market-personal" : ""}${needs.length ? ` data-market-needs="${needs.join(" ")}"` : ""}${neededBy.length ? ` data-market-needed-by="${neededBy.join(" ")}"` : ""}><div class="plugin-market-icon">${icon(plugin.glyph as PluginIconName)}</div><div class="plugin-market-copy"><h2>${plugin.label}</h2><p>${withPluginWords(plugin.runtime_id, () => L(plugin.copy))}</p>${sites(plugin)}<small class="plugin-market-version" data-market-version hidden></small></div><button class="mw-btn mw-btn--secondary" type="button" data-market-upgrade hidden disabled>${L("升级")}</button><button class="mw-btn mw-btn--secondary" type="button" data-market-open="${plugin.id}" hidden>${L("打开")}</button><button class="mw-btn mw-btn--secondary" type="button" data-market-add="${plugin.id}" disabled>${L("添加")}</button></article>`;
  }).join("");
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
