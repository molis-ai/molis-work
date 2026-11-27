import { UI_VIEW_GROUPS, type UiViewGroup } from "@molis-ai/molis-work-contracts/platform/ui";
import { t as uiText, icon as glyph, renderButton, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderPluginEventRecovery } from "./plugin-event-recovery.js";
import { DIRECT_WORK_SURFACE_IDS, RELOAD_ON_MEMBERSHIP_IDS, builtinPluginDirectory, extendPluginIds, hostSurfaceEntries, islandEntries, pluginMarketCards, railEntries, pluginStageSummaries, resolveSurfaceAlias } from "./plugin-catalog.js";
import type { PluginDirectory } from "./plugin-directory.js";
import { renderAssistantDock } from "./assistant-dock.js";
import { renderWorkLine } from "./work-line-parts.js";
import { renderAccountBar } from "./account-bar.js";
import { renderSidePanel, renderSideStrip, type SidePanelPluginTab } from "./side-panel.js";
import { PLATFORM_NAVIGATION } from "./platform-surfaces.js";

export interface ImmersiveShellPrimitives {
  readText(value: string): string;
  escapeHtml(value: unknown): string;
  icon(name: PluginIconName): string;
}

/**
 * Navigation comes from the Plugin catalog's Manifests, not from a list kept
 * here. Adding a Plugin must never mean editing the shell. A plugin's work
 * surface is its id, Goals' too (T-114).
 */

function directoryPlugins(directory: PluginDirectory, enabled: readonly string[]) {
  return railEntries(enabled, directory).map(entry => ({
    id: entry.id,
    surface: entry.surface,
    label: entry.label,
    glyph: entry.glyph as PluginIconName,
    group: entry.group,
    rail: entry.rail,
    chosen: entry.chosen,
  }));
}

function pluginLink(
  { icon, escapeHtml }: ImmersiveShellPrimitives,
  rawPlugin: { id: string; surface: string; label: string; glyph: PluginIconName; hint?: string; chosen?: boolean },
  extraClass = "",
  suffix = "",
): string {
  // A name a Manifest declares is text from its publisher: it is escaped where it is written into the page.
  const plugin = { ...rawPlugin, label: escapeHtml(rawPlugin.label) };
  // A plugin installed at run time has a stage and no directory panel to open.
  const directory = rawPlugin.chosen === false || DIRECT_WORK_SURFACE_IDS.has(plugin.id) ? "" : ` data-directory-open="${plugin.id}"`;
  const aria = plugin.id === "home"
    ? ` aria-label="${plugin.label}"`
    : ` aria-label="${uiText("workbench.immersive-shell.switch-plugin-name", { name: rawPlugin.label })}"`;
  const className = extraClass ? `immersive-plugin-link ${extraClass}` : "immersive-plugin-link";
  // One line under the name says what the person gets there (the switcher shows it; the Dock does not).
  const hint = plugin.hint ? `<small class="plugin-rail-hint">${escapeHtml(plugin.hint)}</small>` : "";
  return `<button class="${className}" type="button" data-plugin-id="${plugin.id}"${directory} data-work-surface-open="${plugin.surface}"${aria} title="${plugin.label}">${icon(plugin.glyph)}<span>${plugin.label}</span>${hint}${suffix}</button>`;
}

function currentListPlugin(directory: string): string {
  const canonical = resolveSurfaceAlias(directory);
  if (canonical === "root" || canonical === "market" || canonical === "home") return "";
  return canonical;
}

function islandPlugins(directory: PluginDirectory, enabled: readonly string[]) {
  return islandEntries(enabled, directory).map(entry => ({
    id: entry.id,
    surface: entry.surface,
    label: entry.label,
    glyph: entry.glyph as PluginIconName,
    group: entry.group,
    rail: entry.rail,
    chosen: entry.chosen,
  }));
}

/**
 * The names of the groups a view can name, which the Host owns (their order is `UI_VIEW_GROUPS`'): 推进 (the backbone plus
 * its helpers), 写与做 (things one makes), 个人 (what belongs to the person), 研究, 编码. See
 * specs/archive/plugin-e2e-review/spec.md §3.1.
 */
const RAIL_GROUP_LABELS: Readonly<Record<UiViewGroup, string>> = { advance: "workbench.immersive-shell.advance", make: "workbench.immersive-shell.write-make", personal: "workbench.immersive-shell.personal", code: "workbench.immersive-shell.coding" };
const RAIL_HOME_HINT = "workbench.immersive-shell.today-s-work-day-s-events-things-hand";

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

/**
 * The person's entries, the backbone and this project's tools (recent first, the rest one click away).
 *
 * Every plugin a project could have is listed once, in its group, as one tile. A tile this project has reads in full
 * colour and opens its plugin; one it does not have is grey and opens nothing. Each tile carries the same two small
 * buttons, shown when the tile is looked at (the row yields to them, as DropAgent's directory rows do): open it beside what
 * shows, and add it to or remove it from this project. The client
 * changes a tile's state in place (specs/archive/plugin-picker-dock), so the markup is the same in both states.
 */

/**
 * Host chrome, not a view slot. The rail answers one question per zone, top to bottom:
 * where the work lives (the project home, then the backbone plugins), and which tools this
 * project uses, in the group its view declares; a plugin without a group, including one added
 * later, lands in 更多, so adding a Plugin never edits the shell. An island leads the group it is in.
 *
 * Not every tool stays on screen. The tools zone shows the ones used lately and the current one;
 * 全部插件 opens the rest in place, grouped, and the ways to extend them are rendered separately
 * by `renderPickerExtend`. Everything keeps its entry; nothing moves when the list opens. Every
 * entry stays a direct child of the list so the travelling selection chip can reach it.
 */
export function renderPluginRail(
  primitives: ImmersiveShellPrimitives,
  enabled: readonly string[],
  directory: PluginDirectory = builtinPluginDirectory(),
): string {
  const { icon, escapeHtml } = primitives;
  const have = new Set(enabled);
  const extendIds = extendPluginIds(directory);
  const cards = pluginMarketCards(directory);
  const addable = cards.map(card => card.id).filter(id => !have.has(id) && !extendIds.has(id));
  const everyone = [...enabled, ...addable];
  const entries = directoryPlugins(directory, everyone);
  const islands = islandPlugins(directory, everyone);
  const join = (values: readonly string[]) => values.join(uiText.text("common.list.separator"));
  const summaries = pluginStageSummaries(directory);
  // A summary is the Plugin's own text, so it is English in that Plugin's own words and nobody else's.
  const hints: Record<string, string> = { ...Object.fromEntries(Object.entries(summaries).map(([id, { summary }]) => [id, summary])), ...Object.fromEntries(PLATFORM_NAVIGATION.map(({ id, hint }) => [id, uiText.text(hint)])) };
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
  // 「在旁边打开」: the pointer's way to what ⌥↵ on the tile does (PFG-23). Every tile has it, so adding or removing a plugin
  // changes no markup; it answers only for a plugin of the project.
  const besideButton = (plugin: { id: string; label: string }, owned: boolean) => renderButton({ variant: "secondary", size: "sm", icon: "columns", iconOnly: true, className: "rail-beside", disabled: !owned,
    label: uiText.text("workbench.immersive-shell.open-beside-name", { name: plugin.label }), attrs: { "data-rail-beside": plugin.id, title: uiText.text("workbench.immersive-shell.open-beside") } });
  // One button, two states: a plus while the plugin is not in the project, a red trash can once it is. Both glyphs are in the
  // button, so a change of state is the tile's class and nothing more; the stylesheet shows the one that fits.
  const toggleButton = (plugin: { id: string; label: string }, owned: boolean, along: readonly string[]) => {
    const sites = sitesOf.get(plugin.id) ?? [];
    const alongNote = along.length ? uiText.text("workbench.immersive-shell.adding-also-adds-list", { list: join(along.map(id => names.get(id) ?? id)) }) : "";
    // What adding it will not bring although it depends on it: an addable plugin cannot add them for it (RAC-1315).
    const needed = owned ? [] : addable.filter(id => id !== plugin.id && companionsOf(id).includes(plugin.id));
    const dependNote = needed.length ? uiText.text("workbench.immersive-shell.plugins-that-depend-not-added-list", { list: join(needed.map(id => names.get(id) ?? id)) }) : "";
    const button = renderButton({ variant: owned ? "secondary" : "primary", size: "sm", icon: "plus", iconOnly: true, className: "plugin-toggle",
      label: uiText.text(owned ? "workbench.immersive-shell.remove-name" : "workbench.immersive-shell.add-name", { name: plugin.label }),
      attrs: { "data-plugin-toggle": plugin.id, "data-state": owned ? "added" : "available",
        title: owned ? uiText.text("workbench.immersive-shell.turn-off-project-its-data-stays-comes-back") : `${uiText.text("workbench.immersive-shell.add-project")}${alongNote}${dependNote}${sites.length ? uiText.text("workbench.immersive-shell.uses-side-panel-browser-sites", { sites: join(sites) }) : ""}` } });
    return button.replace(glyph("plus"), glyph("plus", "plugin-toggle-add") + glyph("trash", "plugin-toggle-remove"));
  };
  // The second line a removal asks in (navigation-presentation.ts).
  const mark = `<small class="plugin-rail-confirm" aria-hidden="true"></small>`;
  const tile = (plugin: { id: string; surface: string; label: string; glyph: PluginIconName; chosen?: boolean; group?: string | null }, zone: string) => {
    // A plugin installed at run time is in the project because it runs there; taking it out is whoever installed it, not this list.
    const installed = plugin.chosen === false;
    const owned = installed || have.has(plugin.id);
    const label = escapeHtml(plugin.label);
    const along = owned ? [] : alongWith(plugin.id), dependents = owned ? dependentsOf(plugin.id) : [];
    const hint = hints[plugin.id] ? `<small class="plugin-rail-hint">${escapeHtml(hints[plugin.id])}</small>` : "";
    const main = owned ? link(plugin, zone, mark)
      : `<button class="immersive-plugin-link plugin-rail-item" type="button" data-rail-zone="${zone}" aria-disabled="true" tabindex="-1" aria-label="${uiText("workbench.immersive-shell.name-not-added", { name: plugin.label })}">${icon(plugin.glyph)}<span>${label}</span>${hint}${mark}</button>`;
    // The tile carries its group, the person's own (个人) among them.
    return `<div class="plugin-rail-tile${owned ? "" : " is-available"}" data-plugin-tile="${plugin.id}"${plugin.group ? ` data-rail-group="${plugin.group}"` : ""}${along.length ? ` data-along="${escapeHtml(named(along))}"` : ""}${dependents.length ? ` data-dependents="${escapeHtml(named(dependents))}"` : ""}>${main}<span class="plugin-rail-ops" role="group" aria-label="${label}">${besideButton(plugin, owned)}${installed ? "" : toggleButton(plugin, owned, along)}</span></div>`;
  };
  const subgroup = (label: string, buttons: string) => buttons ? `<p class="plugin-rail-subgroup" data-rail-zone="more">${label}</p>${buttons}` : "";
  const home = link({ id: "home", surface: "home", label: uiText.text("workbench.immersive-shell.project-home"), glyph: "home", hint: uiText.text(RAIL_HOME_HINT) }, "core");
  const core = entries.filter(plugin => plugin.rail === "core").map(plugin => tile(plugin, "core")).join("");
  // 灵光 is a plugin like any other: an island leads the group it is in.
  const tools = [...islands, ...entries].filter(plugin => plugin.rail === null);
  const grouped = UI_VIEW_GROUPS.map((group, index) => {
    const links = tools.filter(plugin => plugin.group === group).map(plugin => tile(plugin, "tool")).join("");
    // The backbone already sits under the first heading; its helpers follow without a second one.
    return index === 0 ? links : subgroup(uiText.text(RAIL_GROUP_LABELS[group]), links);
  }).join("");
  const other = tools.filter(plugin => plugin.group === null).map(plugin => tile(plugin, "tool")).join("");
  const toggle = `<button class="immersive-plugin-link plugin-rail-item plugin-rail-toggle" type="button" data-rail-tools-toggle aria-expanded="false" aria-label="${uiText("workbench.immersive-shell.all-plugins")}" title="${uiText("workbench.immersive-shell.all-plugins")}">${icon("more")}<span data-rail-toggle-label="${uiText("workbench.immersive-shell.fewer-plugins")}">${uiText("workbench.immersive-shell.all-plugins")}</span></button>`;
  return `<nav class="mw-sidebar mw-sidebar--rail plugin-rail immersive-plugin-strip" data-plugin-strip data-plugin-heading aria-label="${uiText("workbench.immersive-shell.project-entries")}">
    <div class="plugin-rail-items" data-reload-plugins="${RELOAD_ON_MEMBERSHIP_IDS.join(" ")}">${home}<p class="plugin-rail-group" data-rail-zone="tools">${uiText(RAIL_GROUP_LABELS[UI_VIEW_GROUPS[0]])}</p>${core}${grouped}${subgroup(uiText.text("workbench.immersive-shell.more"), other)}${toggle}</div>
  </nav>`;
}

/**
 * The market and the plugin studio, the workbench's two ways to get more plugins, as two buttons at the head of the switcher
 * beside search (not rows among the plugins: they are things to do, not places). The group keeps `data-global-menu`, which
 * the client finds them by.
 */
export function renderPickerExtend(_primitives: ImmersiveShellPrimitives, enabled: readonly string[], hostSurfaces = false): string {
  const button = (plugin: { id: string; surface: string; label: string; glyph: PluginIconName }, suffix = "") => {
    const html = renderButton({ variant: "secondary", size: "sm", icon: plugin.glyph, label: plugin.label, className: "plugin-picker-extend-btn",
      attrs: { "data-plugin-id": plugin.id, ...(DIRECT_WORK_SURFACE_IDS.has(plugin.id) ? {} : { "data-directory-open": plugin.id }), "data-work-surface-open": plugin.surface, title: plugin.label } });
    return html.replace(/<\/button>$/, `${suffix}</button>`);
  };
  // The platform's own surfaces with an extend place (the plugin studio, 47-1 C) are in every project, beside the market, read from
  // their declarations like a plugin's; nobody turns them on.
  const hosted = hostSurfaces ? hostSurfaceEntries().filter(entry => entry.rail === "extend") : [];
  const builder = [...directoryPlugins(builtinPluginDirectory(), enabled).filter(plugin => plugin.rail === "extend"), ...hosted]
    .map(plugin => button({ ...plugin, glyph: plugin.glyph as PluginIconName })).join("");
  const market = button({ id: "market", surface: "market", label: uiText.text("workbench.immersive-shell.plugin-market"), glyph: "grid" },
    `<b class="plugin-rail-update-count" data-market-update-count hidden aria-live="polite"></b>`);
  return `<div class="plugin-picker-extend" data-global-menu role="group" aria-label="${uiText("workbench.immersive-shell.get-build-plugins")}">${market}${builder}</div>`;
}

/**
 * The foot of the workbench (specs/screen-polish §4「底栏第十三版」; specs/work-line §16, WLN-16): the account bar on the left,
 * the one input in the middle (the resident Assistant, whose dialog opens above it) with 办完, 在办 and 接下来 inside it, and the
 * card stack of what waits for the person on the right. It has no Dock: the way to every plugin and the projects are in the
 * top strip (`renderImmersiveHeader`). The counts, the lists and the cards are drawn by the page (browser/work-bar.ts) from the
 * line read, so the page is served with empty ones. The right side panel is in this element because it stands on the bar.
 */
export function renderWorkbenchBar(primitives: ImmersiveShellPrimitives, parts: { sideTabs?: readonly SidePanelPluginTab[] } = {}): string {
  const line = renderWorkLine({ account: renderAccountBar(primitives), slot: renderAssistantDock(primitives) });
  return `<div class="workbench-bar" data-work-bar aria-label="${uiText("workbench.immersive-shell.bottom-bar")}">${line}${renderSidePanel(primitives, parts.sideTabs ?? [])}</div>`;
}

/** What the top strip carries beyond history, tabs and the right side's glyphs: the plugins' way around and the project. */
export interface TopStripNavigation {
  readonly rail: string; readonly enabled: readonly string[]; readonly projectChrome: string; readonly corner?: string;
  /** The platform's own surfaces (the plugin studio) get their button beside the market (47-1 C); the shell page always gives them. */
  readonly hostSurfaces?: boolean;
}

/** A panel may name an alias inside its HTML; only unmarked panels acquire their owner's identity from the wrapper. */
export function directoryPanelIdentity(owner: string, panel: string): { ids: string[]; wrap: boolean } {
  const marked = [...panel.matchAll(/\bdata-directory-panel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(match => match[1] ?? match[2] ?? match[3]!);
  return { ids: panel ? marked.length ? marked : [owner] : [], wrap: !!panel && !marked.length };
}

/** Application chrome only. Plugin owners continue to render and operate their content. */
export function renderDirectoryPluginSections(
  primitives: ImmersiveShellPrimitives,
  enabled: readonly string[],
  panels: Readonly<Record<string, string>>,
  directory: PluginDirectory,
  activeDirectory = "root",
  settingsSection = "",
): string {
  const current = currentListPlugin(activeDirectory);
  const plugins = directoryPlugins(directory, enabled).flatMap((plugin) => {
    const panel = panels[plugin.id] || "";
    if (!panel) return [];
    const identity = directoryPanelIdentity(plugin.id, panel);
    const visible = plugin.id === current;
    return [`<section class="plugin-section is-expanded" data-plugin-section="${plugin.id}"${identity.wrap ? ` data-directory-panel="${plugin.id}"` : ""} data-plugin-expanded="true"${visible ? "" : " hidden"}>${pluginLink(primitives, plugin)}<div class="plugin-section-body" id="plugin-section-body-${plugin.id}">${panel}</div></section>`];
  }).join("");
  return `${plugins}${settingsSection}`;
}

/**
 * The top strip (specs/screen-polish §3 方案 C「纸上的页签」; specs/work-line §4.2, WLN-16): the way back; the first place,
 * 「项目 › 项目主页」 with ⌂ in it, whose list changes the project (`nav.corner`, §4「底栏第十三版」第 1 条); the work area's tabs,
 * the current one grown on its sheet; ＋, which opens the start page (search, the market and the studio, then every plugin with
 * the button that adds it to the project or takes it out). Over the
 * side sheet stands the name of the view it shows, which opens the list of the side's views (side-panel.ts). The right end holds
 * three controls and no more (POLISH-05): the side's switch, the one layout button (07-S2, 口径 6) and the project, a round
 * button whose menu holds the project and the person; the sync mark joins them only while it has something to say.
 * `nav` is given by the workbench page; without it the strip is the title bar alone (a frame that draws no navigation).
 */
export function renderImmersiveHeader(primitives: ImmersiveShellPrimitives, desktop: boolean, sideTabs: readonly SidePanelPluginTab[] = [], nav?: TopStripNavigation): string {
  const { icon } = primitives;
  const pins = nav ? `<div class="dock-pins" data-dock-pins>${nav.corner ?? ""}</div>` : "";
  const picker = nav ? `<div class="plugin-picker" data-plugin-picker>
      <button class="plugin-picker-trigger" type="button" data-plugin-picker-toggle aria-expanded="false" aria-haspopup="true" aria-label="${uiText("workbench.immersive-shell.switch-plugin")}" title="${uiText("workbench.immersive-shell.switch-plugin")} ⌘K">${icon("plus")}<span class="plugin-picker-current" data-plugin-picker-current>${icon("home")}<span>${uiText("workbench.immersive-shell.project-home")}</span></span></button>
      <div class="plugin-picker-popover" data-plugin-picker-popover hidden>
        <div class="plugin-picker-head">
          <button class="plugin-picker-search" type="button" data-global-search-open aria-label="${uiText("workbench.immersive-shell.open-search")}" title="${uiText("workbench.immersive-shell.open-search")}">${icon("search")}<span>${uiText("workbench.immersive-shell.search")}</span><kbd>⌘K</kbd></button>
          ${renderPickerExtend(primitives, nav.enabled, nav.hostSurfaces)}
        </div>
        ${nav.rail}
      </div>
    </div>` : "";
  // The side sheet's own tab: the view it shows, by name. The script fills it (side-panel.ts); it is there only while the side is open.
  const sideEar = `<button class="side-ear" type="button" data-side-ear data-ear aria-expanded="false" aria-controls="side-views" hidden><span class="side-ear-glyph" data-side-ear-glyph aria-hidden="true"></span><span class="side-ear-name" data-side-ear-name></span>${icon("chevron-down")}</button>`;
  const sideToggle = renderButton({ label: uiText.text("workbench.immersive-shell.side-toggle"), icon: "panel", variant: "ghost", size: "sm", iconOnly: true, attrs: { "data-side-toggle": true, "aria-pressed": "false", "aria-controls": "side-panel", "aria-keyshortcuts": "Meta+\\", title: `${uiText.text("workbench.immersive-shell.side-toggle")} ⌘\\` } });
  return `<header class="workbench-header immersive-titlebar"${nav ? " data-dock" : ""}${desktop ? ' data-tauri-drag-region="deep"' : ""}>
    <div class="mw-group workspace-history">
      <button class="mw-btn mw-btn--ghost mw-btn--icon-only workspace-history-button" type="button" data-workspace-history="back" aria-label="${uiText("workbench.immersive-shell.previous")}" title="${uiText("workbench.immersive-shell.previous")}" disabled>${icon("back")}</button>
      <button class="mw-btn mw-btn--ghost mw-btn--icon-only workspace-history-button" type="button" data-workspace-history="forward" aria-label="${uiText("workbench.immersive-shell.next")}" title="${uiText("workbench.immersive-shell.next")}" disabled>${icon("arrow")}</button>
    </div>
    ${pins}
    <nav class="tab-strip tab-strip--chrome" data-titlebar-tabs aria-label="${uiText("workbench.immersive-shell.workspace-tabs")}"></nav>
    ${picker}
    <nav class="container-tabs" data-container-tabs data-overflow-fade aria-label="${uiText("workbench.immersive-shell.workspace-tabs")}" hidden></nav>
    <div class="desktop-titlebar-drag"${desktop ? " data-tauri-drag-region" : ""} aria-hidden="true"></div>
    ${sideEar}
    ${renderSideStrip(primitives, sideTabs, {}, { menu: true })}
    <span class="titlebar-layout">${sideToggle}${renderButton({ label: uiText.text("workbench.immersive-shell.layout"), icon: "columns", variant: "ghost", size: "sm", iconOnly: true, attrs: { "data-layout-open": true, "aria-haspopup": "menu", "aria-expanded": "false", title: uiText.text("workbench.immersive-shell.layout") } })}</span>
    ${nav ? `<div class="titlebar-end">${nav.projectChrome}</div>` : ""}
  </header>`;
}

export function renderWorkspaceChrome(_primitives: ImmersiveShellPrimitives, chromeHtml: string): string {
  return `<section class="workspace-chrome project-island titlebar-chrome navigator-project" data-workspace-chrome data-titlebar-chrome data-project-island aria-label="${uiText("workbench.immersive-shell.current-project")}">${chromeHtml}</section>`;
}

export { renderProjectHome } from "./project-home.js";

/**
 * The workbench search dialog. `personal`: the project list's variant (BL-041), where the person's own content is the one
 * scope, so it has no scope switch, and ⌘K stays with the project filter, so the field does not offer it.
 */
export function renderGlobalSearchOverlay({ icon }: Pick<ImmersiveShellPrimitives, "icon">, options: { personal?: boolean } = {}): string {
  const label = options.personal ? uiText("workbench.immersive-shell.search-personal") : uiText("workbench.immersive-shell.search-project");
  const scopes = options.personal ? "" : `<div class="global-search-scopes" data-global-search-scopes role="group" aria-label="${uiText("workbench.immersive-shell.search-scope")}">
        <button type="button" class="global-search-scope-option" data-global-search-scope-option="all" aria-pressed="true">${uiText("workbench.immersive-shell.project-personal")}</button>
        <button type="button" class="global-search-scope-option" data-global-search-scope-option="project" aria-pressed="false">${uiText("workbench.immersive-shell.project")}</button>
        <button type="button" class="global-search-scope-option" data-global-search-scope-option="personal" aria-pressed="false">${uiText("workbench.immersive-shell.personal-2")}</button>
      </div>`;
  return `<dialog class="global-search-dialog" data-global-search-dialog aria-label="${label}">
    <form class="global-search-shell" data-global-search-form>
      <div class="global-search-field">${icon("search")}<input class="global-search-query" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="global-search-results" data-global-search placeholder="${uiText("workbench.immersive-shell.search")}" aria-label="${label}" autocomplete="off" enterkeyhint="search">${options.personal ? "" : "<kbd>⌘K</kbd>"}<button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only" data-global-search-close aria-label="${uiText("common.control.close")}">${icon("x")}</button></div>
      ${scopes}
      <p class="global-search-scope" data-global-search-status role="status" aria-live="polite">${options.personal ? label : uiText("workbench.immersive-shell.search-everything-project-personal-space-jump-tool-name")}</p>
      <div id="global-search-results" class="global-search-body" data-global-search-results role="listbox" aria-label="${uiText("workbench.immersive-shell.search-results")}"></div>
    </form>
  </dialog>`;
}

export function renderPluginMarket(primitives: ImmersiveShellPrimitives, directory: PluginDirectory = builtinPluginDirectory()): string {
  const { readText, icon, escapeHtml } = primitives;
  const join = (values: readonly string[]) => values.join(uiText.text("common.list.separator"));
  // Sites a Plugin says it uses in the side panel browser are read before it is added (specs/archive/side-panel D16).
  const sites = (plugin: { sites: readonly string[] }) => plugin.sites.length
    ? `<small class="plugin-market-sites" data-market-sites>${uiText("workbench.immersive-shell.uses-side-panel-browser-sites-2", { sites: join(plugin.sites) })}</small>` : "";
  // What adding one brings, and what removing one takes, in the same words the Projects service applies (W5-02 B1 marks, RAC-1310).
  const cards = pluginMarketCards(directory), cardIds = new Set(cards.map(card => card.id));
  const marks = new Map(directory.map(entry => [entry.id, entry]));
  const companionsOf = (id: string): readonly string[] => marks.get(id)?.companions ?? [];
  const related = (ids: readonly string[]) => ids.filter(id => cardIds.has(id));
  const rows = cards.map(plugin => {
    const needs = related(companionsOf(plugin.id).filter(id => id !== plugin.id));
    const neededBy = dependentPlugins(plugin.id, cardIds, companionsOf);
    return `<article class="mw-card" data-market-plugin="${plugin.id}" data-market-runtime-id="${plugin.runtime_id}"${needs.length ? ` data-market-needs="${needs.join(" ")}"` : ""}${neededBy.length ? ` data-market-needed-by="${neededBy.join(" ")}"` : ""}><div class="plugin-market-icon">${icon(plugin.glyph as PluginIconName)}</div><div class="plugin-market-copy"><h2>${escapeHtml(plugin.label)}</h2><p>${escapeHtml(plugin.copy)}</p>${sites(plugin)}<small class="plugin-market-version" data-market-version hidden></small></div><button class="mw-btn mw-btn--secondary" type="button" data-market-upgrade hidden disabled>${uiText("workbench.immersive-shell.upgrade")}</button><button class="mw-btn mw-btn--secondary" type="button" data-market-open="${plugin.id}" hidden>${uiText("common.control.open")}</button><button class="mw-btn mw-btn--secondary" type="button" data-market-add="${plugin.id}" disabled>${uiText("workbench.immersive-shell.add")}</button></article>`;
  }).join("");
  return `<div class="plugin-market-body">
    <header class="plugin-market-heading"><div><h1>${uiText("workbench.immersive-shell.plugin")}</h1><p>${uiText("workbench.immersive-shell.add-plugins-project-open-ones-already-use")}</p></div><div class="plugin-market-destination"><label id="plugin-market-destination-label" for="plugin-market-project-trigger">${uiText("workbench.immersive-shell.add-2")}</label><button type="button" class="plugin-market-project-trigger" id="plugin-market-project-trigger" data-market-project-trigger popovertarget="plugin-market-project-menu" aria-labelledby="plugin-market-destination-label plugin-market-project-label" aria-haspopup="listbox" aria-expanded="false" disabled><strong id="plugin-market-project-label" data-market-project-label></strong>${icon("chevron-down")}</button><div id="plugin-market-project-menu" popover="auto" class="plugin-market-project-popover" data-market-project-popover role="listbox" aria-labelledby="plugin-market-destination-label"><nav data-market-project-options></nav></div><select data-market-project hidden tabindex="-1" aria-hidden="true" disabled></select><template data-market-project-check>${icon("check")}</template></div></header>
    <label class="plugin-market-search mw-input-group">${icon("search")}<input class="mw-input" type="search" data-market-search placeholder="${uiText("workbench.immersive-shell.search-plugins")}" aria-label="${uiText("workbench.immersive-shell.search-plugins")}" autocomplete="off"></label>
    <div class="plugin-market-status-row"><p class="plugin-market-status" data-market-status role="status"></p><button class="mw-btn mw-btn--secondary" type="button" data-market-retry hidden>${uiText("common.control.retry")}</button></div>
    ${renderPluginEventRecovery(readText)}
    <section class="plugin-market-installed" data-market-installed hidden><div class="plugin-market-section-head"><h2>${uiText("workbench.immersive-shell.added")}</h2></div><div class="plugin-market-installed-row" data-market-installed-row></div></section>
    <div class="plugin-market-scope mw-toggle-group" role="group" aria-label="${uiText("workbench.immersive-shell.filter-plugins")}"><button class="mw-toggle is-current" type="button" data-market-scope="all" aria-pressed="true">${uiText("workbench.immersive-shell.all")}</button><button class="mw-toggle" type="button" data-market-scope="added" aria-pressed="false">${uiText("workbench.immersive-shell.added")}</button></div>
    <section class="plugin-market-catalog" data-market-catalog><div class="plugin-market-section-head"><h2>${uiText("workbench.immersive-shell.built")}</h2></div><div class="plugin-market-list">${rows}</div></section>
    <p class="plugin-market-empty" data-market-empty hidden>${uiText("workbench.immersive-shell.no-matching-plugins")}</p>
  </div>`;
}
