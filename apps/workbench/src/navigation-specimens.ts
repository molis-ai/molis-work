import type { WebLocale } from "./i18n.js";
import { readFileSync } from "node:fs";
import { escapeHtml, icon, renderButton, renderComposer, t as uiText, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { assistantComposerLabels } from "./assistant-composer-labels.js";
import { builtinPluginDirectory } from "./plugin-catalog.js";
import {
  THEME_BOOTSTRAP_SCRIPT, VISUAL_FOUNDATION_CLIENT_SCRIPT, renderIconSprite, renderMenuGroup, renderMenuItem, renderProjectMonogram, renderToggleGroup,
} from "@molis-ai/molis-work-design-system";

/**
 * The component board's 工作台导航 section (07-1 S0): the parts the settled navigation adds (docs/design/workbench-navigation,
 * section 组件板新增, items 1–3, 6–10 and 12–16; 4, 5, 11 belong to the schemes not taken and 17 to the comparison page only),
 * then the titlebar and the three-zone bar composed from them, as they are and when something is wrong. The frame is a
 * workbench page (`body.immersive-workbench` with the workbench sheet), so every part is drawn by the rules the product loads
 * (styles/workbench-navigation.ts, design-system bar-zones.ts) on the product's own tab markup — the slices that move the
 * product onto it take these rules, not a copy. The data is a sample; nothing is read from a Home.
 */

type Say = (text: string, values?: Record<string, string | number>) => string;

type Plugin = { readonly glyph: PluginIconName; readonly hue: string }
  & ({ readonly name: string } | { readonly nameKey: string } | { readonly catalog: true });
/** Sample plugins with the glyph and hue their Manifests declare (the prototype's sample project). */
const P = {
  goals: { name: "Goals", glyph: "target", hue: "blue" }, pages: { name: "Pages", glyph: "note", hue: "cyan" },
  coding: { name: "Coding", glyph: "code", hue: "purple" }, feed: { name: "Feed", glyph: "rss", hue: "brown" },
  talk: { nameKey: "workbench.side-panel-tab.discussion", glyph: "message", hue: "steel" }, lingguang: { catalog: true, glyph: "idea", hue: "yellow" },
  shelf: { name: "Shelf", glyph: "library", hue: "slate" }, materials: { nameKey: "workbench.side-panel-tab.materials", glyph: "folder-tree", hue: "gray" },
  tasks: { nameKey: "workbench.side-panel-tab.background-tasks", glyph: "activity", hue: "gray" }, jelly: { name: "Jelly", glyph: "calendar", hue: "mint" },
  todo: { catalog: true, glyph: "list", hue: "green" }, cognia: { name: "Cognia", glyph: "book", hue: "blue" },
  receipts: { nameKey: "workbench.navigation-specimens.receipts", glyph: "package", hue: "gray" },
} as const satisfies Record<string, Plugin>;
type PluginId = keyof typeof P;

function pluginName(id: PluginId): string {
  const plugin = P[id];
  if ("name" in plugin) return plugin.name;
  if ("nameKey" in plugin) return uiText.text(plugin.nameKey);
  return builtinPluginDirectory().find(entry => entry.id === id)?.name ?? id;
}

const hueVars = (hue: string) => `--group-color:var(--hue-${hue});--group-fill:var(--hue-${hue}-fill)`;

interface TabOptions { readonly label: string; readonly glyph: PluginIconName; readonly head?: boolean; readonly current?: boolean; readonly glyphOnly?: boolean;
  readonly pinned?: boolean; readonly gone?: boolean; readonly warn?: boolean; readonly grown?: boolean; readonly badge?: number; readonly readerLabel?: string }

/** One tab in the product's markup (tab-workspace-strip.ts appendTab): a tab button and, unless it is glyph-only, its close. */
function tab(_L: Say, o: TabOptions): string {
  const label = o.readerLabel ?? o.label, close = uiText.text(o.head ? "workbench.navigation-specimens.close-tab-group" : "workbench.navigation-specimens.close-tab");
  const attrs = `${o.head ? ' data-tab-kind="plugin"' : ' data-tab-kind="record"'}${o.current ? ' aria-current="page"' : ""}${o.glyphOnly ? " data-glyph-only" : ""}${o.pinned ? ' data-pinned="true"' : ""}${o.gone ? ' data-tab-state="gone"' : ""}`;
  const trigger = `<button type="button" role="tab" class="tab-item-trigger" aria-selected="${Boolean(o.current)}" tabindex="${o.current ? 0 : -1}" aria-label="${escapeHtml(label)}">`
    + `<svg class="tab-item-icon" aria-hidden="true"><use href="#icon-${o.glyph}"></use></svg><span class="tab-item-name">${escapeHtml(o.label)}</span>${o.warn ? '<span class="nav-warn-dot" aria-hidden="true"></span>' : ""}</button>`;
  const closeButton = o.glyphOnly || o.pinned ? "" : `<button type="button" class="tab-item-close" tabindex="-1" aria-label="${escapeHtml(close)}" title="${escapeHtml(`${close}·${o.label}`)}">${icon("x")}</button>`;
  return `<div class="tab-item${o.current ? " is-active" : ""}${o.grown ? " is-grown" : ""}"${attrs} title="${escapeHtml(o.label)}">${trigger}${closeButton}${o.badge ? `<span class="tab-count-badge" aria-hidden="true">${o.badge}</span>` : ""}</div>`;
}

/** A plugin's group: its head tab in the plugin's colour, a hairline, then its records a step lighter. */
function group(readText: Say, id: PluginId, records: readonly (Omit<TabOptions, "glyph"> & { glyph?: PluginIconName })[], options: { headCurrent?: boolean; removed?: boolean; active?: boolean } = {}): string {
  const plugin = P[id], name = pluginName(id);
  // A removed plugin says so in its head's name too: the tag beside it is inside the tablist, where a reader does not read it.
  const head = tab(readText, { label: name, glyph: plugin.glyph, head: true, current: options.headCurrent, ...(options.removed ? { readerLabel: `${name} · ${uiText.text("workbench.navigation-specimens.removed")}` } : {}) });
  const rows = records.map((record) => tab(readText, { glyph: plugin.glyph, ...record })).join("");
  const removed = options.removed ? `<span class="tab-group-tag">${escapeHtml(uiText.text("workbench.navigation-specimens.removed"))}</span>` : "";
  return `<div class="tab-group tab-plugin-group" data-plugin-group="${id}" data-active="${Boolean(options.active ?? records.some((r) => r.current))}"${options.removed ? ' data-group-state="removed"' : ""} style="${hueVars(plugin.hue)}">`
    + `<div class="tab-group-pages">${head}${rows.length ? '<span class="tab-group-sep" aria-hidden="true"></span>' : ""}${rows}${removed}</div></div>`;
}

/** A person's group: the small solid label in its colour, then its tabs. */
function personGroup(_L: Say, title: string, hue: string, tabs: string): string {
  const toggle = `${uiText.text("workbench.navigation-specimens.collapse-tab-group")} · ${title}`;
  return `<div class="tab-group" data-tab-group="launch" data-active="false" style="${hueVars(hue)}"><button type="button" class="tab-group-label" aria-expanded="true" aria-label="${escapeHtml(toggle)}" title="${escapeHtml(toggle)}"><span class="tab-group-name">${escapeHtml(title)}</span></button><div class="tab-group-pages">${tabs}</div></div>`;
}

/** A tab strip: the tablist with its scrolling tabs, and what stays at its end (undo, one pane only, all tabs). */
function strip(label: string, tabs: string, options: { end?: string; unfocused?: boolean; lead?: string; titlebar?: boolean } = {}): string {
  return `<nav class="tab-strip" role="tablist" aria-label="${escapeHtml(label)}"${options.titlebar ? " data-titlebar-tabs" : ""}${options.unfocused ? " data-unfocused" : ""}>${options.lead ?? ""}<div class="tab-scroll" data-overflow-fade>${tabs}</div>${options.end ?? ""}</nav>`;
}

const sample = (_L: Say) => ({
  goal1: uiText.text("workbench.navigation-specimens.homepage-revamp-new-first-screen"), goal2: uiText.text("workbench.navigation-specimens.roll-out-brand-guide"), doc1: uiText.text("workbench.navigation-specimens.revamp-plan"), doc2: uiText.text("workbench.navigation-specimens.second-interview-round-notes"),
  code1: uiText.text("workbench.navigation-specimens.fix-first-screen-layout"), feed1: uiText.text("workbench.navigation-specimens.design-weekly-11-03"), ppt1: uiText.text("workbench.navigation-specimens.review-talk-third-version"), launch: uiText.text("workbench.navigation-specimens.launch-week"),
});

function mainTabs(readText: Say, state: "ok" | "wrong" = "ok"): string {
  const r = sample(readText);
  const goals = state === "wrong"
    ? group(readText, "goals", [{ label: r.goal1, current: true }, { label: r.goal2, gone: true, readerLabel: `${r.goal2} · ${uiText.text("workbench.navigation-specimens.goal-no-longer-here")}` }])
    : group(readText, "goals", [{ label: r.goal1, current: true }, { label: r.goal2 }]);
  const pages = group(readText, "pages", [{ label: r.doc1 }, { label: r.doc2 }]);
  const last = state === "wrong"
    ? group(readText, "feed", [{ label: r.feed1 }], { removed: true })
    : personGroup(readText, r.launch, "orange", tab(readText, { label: r.ppt1, glyph: "presentation" }) + tab(readText, { label: r.code1, glyph: "code" }));
  return goals + (state === "wrong" ? "" : pages) + last;
}

function specimen(id: string, n: string, caption: string, note: string, body: string): string {
  return `<section class="mw-navs__item" data-nav-specimen="${id}" aria-labelledby="nav-${id}"><h2 id="nav-${id}"><span>${n}</span>${escapeHtml(caption)}</h2>${note ? `<p class="mw-navs__note">${escapeHtml(note)}</p>` : ""}<div class="mw-navs__stage">${body}</div></section>`;
}

/** The menu's search field, outside the menu list so the list holds only its items. */
const find = (placeholder: string) => `<label class="mw-input-group tab-menu-find">${icon("search")}<input class="mw-input" type="search" data-nav-find placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(placeholder)}" autocomplete="off"></label>`;

function allTabsMenu(readText: Say, id: string, hidden = false): string {
  const r = sample(readText);
  const section = (pid: PluginId, rows: readonly [string, boolean?][]) => renderMenuGroup({ label: `${pluginName(pid)} · ${rows.length === 1 ? uiText.text("workbench.navigation-specimens.value-1-tab") : uiText.text("workbench.navigation-specimens.n-n", { n: rows.length })}`, items: rows.map(([label, current]) => renderMenuItem({ label, iconName: P[pid].glyph, attrs: current ? { "aria-current": "true" } : {} })).join("") })
    .replace('class="mw-menu__label" aria-hidden="true">', `class="mw-menu__label" aria-hidden="true"><span class="tab-menu-dot" style="${hueVars(P[pid].hue)}"></span>`).replace('class="mw-menu__group"', `class="mw-menu__group" style="${hueVars(P[pid].hue)}"`);
  return `<div class="mw-menu tab-menu" id="${id}" data-nav-popover${hidden ? " hidden" : ""}>${find(uiText.text("workbench.navigation-specimens.find-tab"))}<div role="menu" aria-label="${escapeHtml(uiText.text("workbench.navigation-specimens.all-tabs"))}">`
    + section("goals", [["Goals"], [r.goal1, true], [r.goal2]]) + section("pages", [["Pages"], [r.doc1], [r.doc2]]) + section("coding", [["Coding"], [r.code1]]) + `</div></div>`;
}

function allTabsButton(_L: Say, controls: string, open: boolean, phoneOnly = false): string {
  return `<button type="button" class="tab-strip-button tab-all-button"${phoneOnly ? " data-nav-when-full" : ""} data-nav-menu-for="${controls}" aria-haspopup="menu" aria-expanded="${open}" aria-controls="${controls}" aria-label="${escapeHtml(uiText.text("workbench.navigation-specimens.all-tabs"))} · ${escapeHtml(uiText.text("workbench.navigation-specimens.n-n", { n: 12 }))}">${icon("rows")}<span>${escapeHtml(uiText.text("workbench.navigation-specimens.all-tabs"))}</span><span class="tab-all-count">12</span></button>`;
}

function plusRow(_readText: Say, pid: PluginId, where = "", warn = false): string {
  const name = pluginName(pid), beside = `${uiText.text("workbench.navigation-specimens.open-beside")} · ${name}`;
  const item = `<button type="button" class="mw-menu__item" role="menuitem" style="${hueVars(P[pid].hue)}">${icon(P[pid].glyph)}<span data-slot="menu-item-label">${escapeHtml(name)}</span>`
    + `${warn ? `<span class="nav-warn-dot" aria-hidden="true"></span><span class="tab-menu-note">${escapeHtml(uiText.text("workbench.navigation-specimens.didn-t-start"))}</span>` : where ? `<span class="tab-menu-where">${escapeHtml(where)}</span>` : ""}</button>`;
  return `<div class="tab-menu-row">${item}${renderButton({ label: beside, icon: "columns", variant: "ghost", size: "sm", iconOnly: true, className: "tab-menu-beside", attrs: { title: `${beside} (⌥↵)`, tabindex: "-1" } })}</div>`;
}

function plusMenu(readText: Say, id: string, hidden = false, wrong = false): string {
  const label = (text: string, items: string) => renderMenuGroup({ label: text, items });
  return `<div class="mw-menu tab-menu" id="${id}" data-nav-popover${hidden ? " hidden" : ""}>${find(uiText.text("workbench.navigation-specimens.find-plugin-tab-just-closed"))}<div role="menu" aria-label="${escapeHtml(uiText.text("common.control.open"))}">`
    + label(uiText.text("workbench.navigation-specimens.project"), plusRow(readText, "goals", uiText.text("workbench.navigation-specimens.pane")) + plusRow(readText, "pages", uiText.text("workbench.navigation-specimens.pane")) + plusRow(readText, "coding") + plusRow(readText, "talk", uiText.text("workbench.navigation-specimens.right")))
    + label(uiText.text("workbench.navigation-specimens.personal-every-project"), plusRow(readText, "jelly") + plusRow(readText, "todo") + plusRow(readText, "cognia") + (wrong ? plusRow(readText, "receipts", "", true) : ""))
    + label(uiText.text("workbench.navigation-specimens.recently-closed"), renderMenuItem({ label: sample(readText).feed1, iconName: "rss", shortcut: "⌘⇧T", attrs: { style: hueVars(P.feed.hue) } }))
    + `</div><p class="tab-menu-foot" aria-hidden="true">${escapeHtml(uiText.text("workbench.navigation-specimens.opens-here-opens-beside"))}</p></div>`;
}

function layoutMenu(_L: Say, id: string, hidden = false): string {
  const item = (label: string, iconName: PluginIconName, shortcut?: string, disabled?: boolean) => renderMenuItem({ label: uiText.text(label), iconName, ...(shortcut ? { shortcut } : {}), ...(disabled ? { disabled } : {}) });
  return `<div class="mw-menu tab-menu" id="${id}" data-nav-popover role="menu" aria-label="${escapeHtml(uiText.text("workbench.navigation-specimens.layout-main"))}"${hidden ? " hidden" : ""}><p class="tab-menu-head" aria-hidden="true">${escapeHtml(uiText.text("workbench.navigation-specimens.layout-main"))}</p>`
    + renderMenuGroup({ items: item("workbench.navigation-specimens.split-right", "columns") + item("workbench.navigation-specimens.split-down", "frame") + item("workbench.navigation-specimens.move-tab-right", "arrow") + item("workbench.navigation-specimens.show-only-pane", "maximize", "⌘⇧↵") })
    + renderMenuGroup({ items: item("workbench.navigation-specimens.merge-into-one-pane", "minus", undefined, true) + item("workbench.navigation-specimens.hide-right-side", "panel", "⌘\\") + item("workbench.navigation-specimens.equal-widths", "columns", undefined, true) + item("workbench.navigation-specimens.close-pane", "x") })
    + renderMenuGroup({ label: uiText.text("workbench.navigation-specimens.go"), items: renderMenuItem({ label: uiText.text("workbench.navigation-specimens.main"), checked: true }) + renderMenuItem({ label: uiText.text("workbench.navigation-specimens.right-2"), checked: false }) })
    + `</div>`;
}

function plusButton(_L: Say, controls: string, open: boolean): string {
  return `<button type="button" class="tab-add-button" data-nav-menu-for="${controls}" aria-haspopup="menu" aria-expanded="${open}" aria-controls="${controls}" aria-label="${escapeHtml(uiText.text("common.control.open"))}" title="${escapeHtml(uiText.text("common.control.open"))}">${icon("plus")}</button>`;
}

function layoutButton(_L: Say, controls: string, open: boolean): string {
  const attrs = { title: uiText.text("workbench.navigation-specimens.layout"), "data-nav-menu-for": controls, "aria-haspopup": "menu", "aria-expanded": String(open), "aria-controls": controls };
  return `<span class="titlebar-layout">${renderButton({ label: uiText.text("workbench.navigation-specimens.layout"), icon: "columns", variant: "ghost", size: "sm", iconOnly: true, attrs })}</span>`;
}

/** The right side's glyphs: its tabs against the right edge, background tasks with what is unfinished. */
function sideGlyphs(readText: Say, options: { current?: PluginId; grown?: PluginId; asTabs?: boolean } = {}): string {
  const ids: PluginId[] = ["talk", "lingguang", "shelf", "materials", "tasks"];
  const tabs = ids.map((id) => {
    const name = pluginName(id), badge = id === "tasks" ? 2 : 0;
    return tab(readText, { label: name, glyph: P[id].glyph, head: true, glyphOnly: true, current: options.current === id, grown: options.grown === id, badge, readerLabel: badge ? `${name} · ${uiText.text("workbench.navigation-specimens.n-background-n-not-finished", { n: badge })}` : name });
  }).join("");
  return `<div class="tab-glyph-row" role="tablist" aria-label="${escapeHtml(uiText.text("workbench.navigation-specimens.tabs-right"))}" data-nav-glyph-row>${tabs}</div>`;
}

function paneSwitch(_L: Say): string {
  return renderToggleGroup({ label: uiText.text("workbench.navigation-specimens.which-pane-show"), className: "tab-pane-switch", items: [{ value: "main", label: uiText.text("workbench.navigation-specimens.main"), current: true }, { value: "side", label: uiText.text("workbench.navigation-specimens.right-2") }] });
}

/** The way back after closing Feed's group, at the end of the strip (the product's `.tab-undo-chip`). */
function undoChip(_L: Say): string {
  const label = uiText.text("workbench.navigation-specimens.reopen-plugin", { plugin: "Feed" });
  return `<button type="button" class="tab-undo-chip" data-nav-undo data-reopened="${escapeHtml(uiText.text("workbench.navigation-specimens.reopened-plugin", { plugin: "Feed" }))}" style="${hueVars(P.feed.hue)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)} (⌘⇧T)">${icon("undo")}<span>${escapeHtml(label)}</span></button>`;
}

/** The whole titlebar: history, the main strip and its ＋, the right side's glyphs, the layout button. */
function titlebar(readText: Say, state: "ok" | "wrong"): string {
  const r = sample(readText), wrong = state === "wrong", suffix = wrong ? "wrong" : "ok";
  const history = `<span class="mw-navs__history">${renderButton({ label: uiText.text("workbench.navigation-specimens.previous"), icon: "back", variant: "ghost", size: "sm", iconOnly: true })}${renderButton({ label: uiText.text("workbench.navigation-specimens.next"), icon: "arrow", variant: "ghost", size: "sm", iconOnly: true, disabled: true })}</span>`;
  const pinned = tab(readText, { label: r.doc1, glyph: "note", pinned: true, glyphOnly: true });
  const tabs = pinned + mainTabs(readText, state) + (wrong ? tab(readText, { label: uiText.text("workbench.navigation-specimens.receipts"), glyph: "package", head: true, warn: true, readerLabel: `${uiText.text("workbench.navigation-specimens.receipts")} · ${uiText.text("workbench.navigation-specimens.didn-t-start")}` }) : "");
  const undo = wrong ? undoChip(readText) : "";
  // A phone always shows 全部标签; on a desk only the strip that cannot hold its tabs does, so the normal row keeps it for the phone.
  const end = `${undo}${allTabsButton(readText, `nav-all-${suffix}`, false, !wrong)}`;
  const plus = `<span class="mw-navs__anchor">${plusButton(readText, `nav-plus-${suffix}`, false)}${plusMenu(readText, `nav-plus-${suffix}`, true, wrong)}</span>`;
  const mainStrip = strip(uiText.text("workbench.navigation-specimens.main-tabs"), tabs, { end, titlebar: true, lead: paneSwitch(readText) });
  const allMenu = `<span class="mw-navs__anchor mw-navs__anchor--all">${allTabsMenu(readText, `nav-all-${suffix}`, true)}</span>`;
  return `<header class="mw-navs__titlebar" data-nav-titlebar="${state}">${history}<div class="mw-navs__main">${mainStrip}${allMenu}${plus}</div>${sideGlyphs(readText, { current: "talk" })}`
    + `<span class="mw-navs__anchor mw-navs__anchor--end">${layoutButton(readText, `nav-layout-${suffix}`, false)}${layoutMenu(readText, `nav-layout-${suffix}`, true)}</span></header>`;
}

function dockPin(_readText: Say, id: PluginId | "home", options: { current?: boolean; warn?: boolean; fold?: boolean } = {}): string {
  const name = id === "home" ? uiText.text("workbench.navigation-specimens.project-home") : pluginName(id), glyph = id === "home" ? "home" : P[id].glyph;
  const label = options.warn ? `${name} · ${uiText.text("workbench.navigation-specimens.didn-t-start")}` : name;
  return `<button type="button" class="dock-pin${id === "home" ? " is-fixed" : ""}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"${options.current ? ' aria-current="page"' : ""}${options.fold ? " data-fold" : ""}>${icon(glyph)}${options.warn ? '<span class="nav-warn-dot" aria-hidden="true"></span>' : ""}</button>`;
}

/** The bar in three zones: the glyph-only switcher and the Dock, the Assistant, the person's own and the project. */
function bar(readText: Say, state: "ok" | "wrong"): string {
  const wrong = state === "wrong", now = `${"Goals"} · ${uiText.text("workbench.navigation-specimens.discuss")}`;
  const switcher = `<button type="button" class="dock-pin bar-switcher" aria-haspopup="menu" aria-expanded="false" aria-label="${escapeHtml(uiText.text("workbench.navigation-specimens.switch-plugin-now-now", { now }))}" title="${escapeHtml(uiText.text("workbench.navigation-specimens.switch-plugin"))} ⌘K">${icon("grid")}</button>`;
  // On a phone the bar folds what its second row cannot hold behind +N (the product's `.dock-pin-more`); here it is drawn, not measured.
  const fold = (count: number, label: string) => `<button type="button" class="dock-pin dock-pin-more mw-navs__fold" aria-haspopup="true" aria-expanded="false" aria-label="${escapeHtml(`${label} ${count}`)}" title="${escapeHtml(label)}">+${count}</button>`;
  const dock = `<div class="dock-pins" role="toolbar" aria-label="${escapeHtml(uiText.text("workbench.navigation-specimens.pinned-plugins"))}">${dockPin(readText, "home")}${dockPin(readText, "goals", { current: true })}${dockPin(readText, "pages", { fold: true })}${dockPin(readText, "coding", { fold: true })}${dockPin(readText, "feed", { fold: true })}${fold(3, uiText.text("workbench.navigation-specimens.more-pinned-plugins"))}</div>`;
  const composer = `<div class="bar-center"><div class="assistant-composer">${renderComposer({ kind: "ai", labels: assistantComposerLabels(uiText.text, true), placeholder: uiText.text("workbench.assistant-dock.ask-assistant-do-something"), receiver: { label: uiText.text("workbench.assistant-dock.assistant") } })}</div></div>`;
  const own = `<div class="bar-side bar-own" role="toolbar" aria-label="${escapeHtml(uiText.text("workbench.navigation-specimens.own"))}">${wrong ? dockPin(readText, "receipts", { warn: true }) : ""}${dockPin(readText, "jelly", { fold: wrong })}${dockPin(readText, "todo", { fold: true })}${dockPin(readText, "cognia", { fold: true })}${fold(wrong ? 3 : 2, uiText.text("workbench.navigation-specimens.own"))}</div>`;
  const project = `<section class="workspace-chrome project-island titlebar-chrome navigator-project" aria-label="${escapeHtml(uiText.text("workbench.navigation-specimens.current-project"))}"><div class="navigator-project-primary"><button type="button" class="navigator-project-selector" aria-label="${escapeHtml(uiText.text("workbench.navigation-specimens.switch-project"))} · ${escapeHtml(uiText.text("workbench.navigation-specimens.website-revamp"))}">${renderProjectMonogram(uiText.text("workbench.navigation-specimens.website-revamp"), "project-sample", escapeHtml)}</button></div></section>`;
  return `<div class="workbench-bar" data-nav-bar="${state}" data-own-kept aria-label="${escapeHtml(uiText.text("workbench.navigation-specimens.bottom-bar"))}"><div class="bar-start">${switcher}${dock}</div>${composer}<div class="bar-end">${own}${project}</div></div>`;
}

function partSpecimens(readText: Say): string {
  const r = sample(readText);
  const tiers = specimen("tiers", "1", uiText.text("workbench.navigation-specimens.group-s-head-its-tabs-two-tiers"), uiText.text("workbench.navigation-specimens.head-group-s-colour-its-tabs-step-lighter"),
    strip(uiText.text("workbench.navigation-specimens.main-tabs"), mainTabs(readText)));
  const unfocused = specimen("unfocused", "2", uiText.text("workbench.navigation-specimens.current-tab-pane-without-focus"), uiText.text("workbench.navigation-specimens.left-pane-has-focus-right-pane-s-current"),
    `<div class="mw-navs__pair">${strip(uiText.text("workbench.navigation-specimens.pane-1-tabs"), group(readText, "goals", [{ label: r.goal1, current: true }]))}${strip(uiText.text("workbench.navigation-specimens.pane-2-tabs"), group(readText, "pages", [{ label: r.doc1, current: true }]) + tab(readText, { label: r.code1, glyph: "code" }), { unfocused: true })}</div>`);
  const overflow = specimen("all-tabs", "3", uiText.text("workbench.navigation-specimens.all-tabs-button-its-list"), uiText.text("workbench.navigation-specimens.appears-end-strip-only-when-tabs-don-t"),
    `<div class="mw-navs__narrow">${strip(uiText.text("workbench.navigation-specimens.main-tabs"), mainTabs(readText), { end: allTabsButton(readText, "nav-all-open", true) })}</div>${allTabsMenu(readText, "nav-all-open")}`);
  const undo = specimen("undo", "6", uiText.text("workbench.navigation-specimens.undo-chip"), uiText.text("workbench.navigation-specimens.after-group-closes-stays-six-seconds-group-s"),
    `<div class="mw-navs__narrow">${strip(uiText.text("workbench.navigation-specimens.main-tabs"), mainTabs(readText), { end: undoChip(readText) })}</div><p class="mw-navs__live" role="status" data-nav-live></p>`);
  const solo = specimen("solo", "7", uiText.text("workbench.navigation-specimens.one-pane-chip"), uiText.text("workbench.navigation-specimens.one-pane-shown-others-hidden-press-again-bring"),
    strip(uiText.text("workbench.navigation-specimens.main-tabs"), group(readText, "goals", [{ label: r.goal1, current: true }]), { end: `<button type="button" class="tab-strip-button tab-solo-chip">${icon("maximize")}<span>${escapeHtml(uiText.text("workbench.navigation-specimens.one-pane-show-all"))}</span></button>` }));
  const plus = specimen("plus", "8", uiText.text("workbench.navigation-specimens.rows-menu"), uiText.text("workbench.navigation-specimens.only-opens-things-what-already-open-says-which"),
    `<div class="mw-navs__row">${plusButton(readText, "nav-plus-open", true)}</div>${plusMenu(readText, "nav-plus-open", false, true)}`);
  const marks = specimen("marks", "9", uiText.text("workbench.navigation-specimens.marks-tab-when-something-wrong"), uiText.text("workbench.navigation-specimens.struck-through-record-gone-amber-point-didn-t"),
    strip(uiText.text("workbench.navigation-specimens.main-tabs"), mainTabs(readText, "wrong") + tab(readText, { label: uiText.text("workbench.navigation-specimens.receipts"), glyph: "package", head: true, warn: true, readerLabel: `${uiText.text("workbench.navigation-specimens.receipts")} · ${uiText.text("workbench.navigation-specimens.didn-t-start")}` })));
  const phone = specimen("pane-switch", "10", uiText.text("workbench.navigation-specimens.main-right-switch-before-narrow-strip"), uiText.text("workbench.navigation-specimens.value-760px-less-only-focused-pane-shows-strip-leads"),
    `<div class="mw-navs__phone" data-force-narrow>${strip(uiText.text("workbench.navigation-specimens.main-tabs"), group(readText, "goals", [{ label: r.goal1, current: true }]), { lead: paneSwitch(readText) })}</div>`);
  const grow = specimen("grow", "12", uiText.text("workbench.navigation-specimens.glyph-tabs-that-widen-place"), uiText.text("workbench.navigation-specimens.rest-about-0-14s-move-keyboard-widens-place"),
    `<div class="mw-navs__row mw-navs__row--end">${sideGlyphs(readText, { current: "talk", grown: "shelf" })}</div><div class="mw-navs__row">${strip(uiText.text("workbench.navigation-specimens.main-tabs"), tab(readText, { label: r.doc1, glyph: "note", pinned: true, glyphOnly: true, grown: true }) + group(readText, "goals", [{ label: r.goal1, current: true }]))}</div>`);
  const badge = specimen("badge", "13", uiText.text("workbench.navigation-specimens.count-badge"), uiText.text("workbench.navigation-specimens.how-many-background-tasks-unfinished-their-glyph-screen"), `<div class="mw-navs__row mw-navs__row--end">${sideGlyphs(readText)}</div>`);
  const layout = specimen("layout", "14", uiText.text("workbench.navigation-specimens.layout-button-titlebar-s-end"), uiText.text("workbench.navigation-specimens.value-28px-after-hairline-right-side-hidden-right-side"),
    `<div class="mw-navs__row mw-navs__row--end">${sideGlyphs(readText)}${layoutButton(readText, "nav-layout-open", true)}</div><div class="mw-navs__row mw-navs__row--end">${layoutMenu(readText, "nav-layout-open")}</div>`);
  return tiers + unfocused + overflow + undo + solo + plus + marks + phone + grow + badge + sheetSpecimen(readText) + layout;
}

/** The glyph row drawn by whichever sheet this frame loads: the board shows it once in each, one above the other, to show they match. */
function sheetSpecimen(readText: Say): string {
  return specimen("sheets", "12 · 13", uiText.text("workbench.navigation-specimens.one-glyph-row-both-sheets"), uiText.text("workbench.navigation-specimens.project-page-s-sheet-arrival-page-s-each"),
    `<div class="mw-navs__row mw-navs__row--end" data-nav-sheet-row>${sideGlyphs(readText, { current: "talk", grown: "shelf" })}</div>`);
}

/** The frame the board's 工作台导航 section loads, in the board's language. */
export function renderMolisWorkNavigationSpecimen(readText: Say, htmlLang: string, sheet: "workbench" | "arrival" = "workbench"): string {
  // The arrival sheet has the glyph row but not the project page's tab rules, so its frame draws only that row.
  const arrival = sheet === "arrival";
  const bars = specimen("bar", "15 · 16", uiText.text("workbench.navigation-specimens.three-zone-bar"), uiText.text("workbench.navigation-specimens.left-switcher-glyph-then-after-hairline-dock-project"),
    `<p class="mw-navs__state">${escapeHtml(uiText.text("workbench.navigation-specimens.ok"))}</p><div class="mw-navs__bar">${bar(readText, "ok")}</div><p class="mw-navs__state">${escapeHtml(uiText.text("workbench.navigation-specimens.personal-plugin-didn-t-start"))}</p><div class="mw-navs__bar">${bar(readText, "wrong")}</div>`);
  const bars2 = specimen("titlebar", "", uiText.text("workbench.navigation-specimens.titlebar"), uiText.text("workbench.navigation-specimens.main-strip-right-side-s-glyphs-top-right"),
    `<p class="mw-navs__state">${escapeHtml(uiText.text("workbench.navigation-specimens.ok"))}</p>${titlebar(readText, "ok")}<p class="mw-navs__state">${escapeHtml(uiText.text("workbench.navigation-specimens.something-wrong"))}</p>${titlebar(readText, "wrong")}`);
  return `<!doctype html>
<html lang="${htmlLang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(uiText.text("workbench.navigation-specimens.workbench-navigation"))} · Molis Work</title>
  <script>${THEME_BOOTSTRAP_SCRIPT}</script>
  <link rel="stylesheet" href="/assets/molis-work-${arrival ? "arrival" : "workbench"}.css">
  <style>${FRAME_STYLES}</style>
</head>
<body class="${arrival ? "arrival-page " : ""}immersive-workbench mw-navs-page" data-nav-sheet="${sheet}">
  ${renderIconSprite()}
  <main class="mw-navs" data-nav-board>${arrival ? sheetSpecimen(readText) : `${partSpecimens(readText)}${bars2}${bars}`}</main>
  <script>${VISUAL_FOUNDATION_CLIENT_SCRIPT}${NAVIGATION_FRAME_SCRIPT}</script>
</body>
</html>`;
}

/**
 * Only the board's scaffolding: the column of specimens on the desk, their captions, and the boxes that stand for a narrow
 * window or an open menu's place. The parts themselves are drawn by the workbench sheet.
 */
const FRAME_STYLES = `html:has(> body.mw-navs-page),html body.mw-navs-page{height:auto;max-height:none;overflow-x:hidden;overflow-y:visible}
body.mw-navs-page{margin:0;background:var(--desk);color:var(--ink)}
.mw-navs{display:grid;gap:28px;margin:0 auto;padding:20px 16px 48px}
.mw-navs__item{display:grid;gap:8px;min-width:0}
.mw-navs__item h2{display:flex;align-items:baseline;gap:8px;margin:0;font-size:13px;font-weight:600}
.mw-navs__item h2 span{color:var(--muted);font-weight:500;font-variant-numeric:tabular-nums}
.mw-navs__note,.mw-navs__state{margin:0;color:var(--muted);font-size:12px;line-height:1.5;max-width:72ch}
.mw-navs__state{margin-top:4px;font-weight:500;color:var(--ink-soft)}
.mw-navs__stage{display:grid;gap:10px;min-width:0;padding:12px;border-radius:var(--r-card,12px);background:var(--desk);box-shadow:inset 0 0 0 1px var(--line)}
.mw-navs__stage>.mw-menu{justify-self:start}
.mw-navs__row{display:flex;align-items:center;gap:8px;min-width:0}
.mw-navs__row--end{justify-content:flex-end}
.mw-navs__pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px}
.mw-navs__pair>.tab-strip{border-radius:var(--r-control,8px);background:var(--surface-soft)}
.mw-navs__narrow{max-width:520px;min-width:0}
.mw-navs__phone{max-width:375px;min-width:0}
body.mw-navs-page .mw-navs__phone .tab-pane-switch{display:inline-flex}
body.mw-navs-page .mw-navs__phone .tab-pane-switch>.mw-toggle{min-height:44px}
.mw-navs .tab-strip{min-width:0}
.mw-navs__titlebar{display:flex;align-items:center;gap:8px;height:40px;min-width:0;padding:0 8px}
.mw-navs__history{display:flex;gap:2px;flex:none}
.mw-navs__titlebar>.tab-glyph-row{margin-left:8px}
.mw-navs__main{position:relative;display:flex;flex:1 1 auto;min-width:0}
.mw-navs__main>.tab-strip{flex:1 1 auto}
.mw-navs__anchor{position:relative;display:flex;align-items:center;flex:none}
.mw-navs__anchor>[data-nav-popover]{position:absolute;z-index:20;top:calc(100% + 6px);right:0}
.mw-navs__anchor--all{position:absolute;right:0;top:100%}
.mw-navs__live:empty{display:none}
@media (min-width:761px){[data-nav-when-full][data-nav-fits]{display:none}}
.mw-navs__live{margin:0;font-size:12px;color:var(--ink-soft)}
.mw-navs__bar{min-width:0}
.mw-navs .workbench-bar{min-height:var(--dock-min);padding:8px 0;background:transparent}
html body.mw-navs-page .workbench-bar .mw-navs__fold{display:none}
@media (max-width:760px){.mw-navs__history{display:none}.mw-navs__titlebar{position:relative;display:grid;grid-template-columns:1fr auto auto;grid-template-rows:44px 52px;gap:4px;height:auto;padding:0}.mw-navs__main{display:contents}.mw-navs__main>.tab-strip{grid-area:2/1/3/4}.mw-navs__main>.mw-navs__anchor:not(.mw-navs__anchor--all){grid-area:1/2;z-index:1}.mw-navs__titlebar>.mw-navs__anchor--end{grid-area:1/3;z-index:1}body.mw-navs-page .mw-navs__titlebar>.tab-glyph-row{display:none}.mw-navs .workbench-bar{height:auto}.mw-navs__titlebar .mw-navs__anchor{position:static}.mw-navs__titlebar .mw-navs__anchor>[data-nav-popover]{left:0;right:0;width:auto}html body.mw-navs-page .workbench-bar [data-fold]{display:none}html body.mw-navs-page .workbench-bar .mw-navs__fold{display:inline-grid}}`;

/** The board's section: the frame above, in the board's language, at a fixed height that scrolls inside, like the board's other specimen frames. */
export function renderNavigationSection(_L: Say, lang: WebLocale): string {
  return `<section class="mw-catalog__section" id="navigation" data-primitive="navigation"><h2>${escapeHtml(uiText.text("workbench.navigation-specimens.workbench-navigation"))}</h2>`
    + `<p class="mw-nav-section__note">${escapeHtml(uiText.text("workbench.navigation-specimens.what-07-1-layout-adds-board-parts-tab"))}</p>`
    + `<iframe class="mw-nav-frame" data-nav-frame src="/__ui/catalog/navigation?lang=${lang}" title="${escapeHtml(uiText.text("workbench.navigation-specimens.workbench-navigation-specimen"))}" loading="lazy"></iframe>`
    + `<p class="mw-nav-section__note">${escapeHtml(uiText.text("workbench.navigation-specimens.same-row-drawn-arrival-page-s-sheet"))}</p>`
    + `<iframe class="mw-nav-frame mw-nav-frame--sheet" data-nav-frame src="/__ui/catalog/navigation?lang=${lang}&amp;sheet=arrival" title="${escapeHtml(uiText.text("workbench.navigation-specimens.glyph-tabs-arrival-sheet"))}" loading="lazy"></iframe></section>`;
}

export const NAVIGATION_SECTION_STYLES = ".mw-nav-section__note{margin:0 0 12px;color:var(--muted);font-size:12px}.mw-nav-frame{display:block;width:100%;height:min(1400px,85vh);border:0;border-radius:var(--r-card,12px);background:var(--desk)}.mw-nav-frame--sheet{height:200px}";

/** The frame's program, written in `src/browser/board/navigation-frame.ts` and bundled into `dist/` when the package builds. */
const NAVIGATION_FRAME_SCRIPT = readFileSync(new URL("./board-navigation-frame.js", import.meta.url), "utf8").trim();
