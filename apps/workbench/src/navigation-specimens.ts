import type { WebLocale } from "./i18n.js";
import { renderLanguageHead } from "./language-resource.js";
import { readFileSync } from "node:fs";
import { escapeHtml, icon, renderButton, t as uiText, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { builtinPluginDirectory } from "./plugin-catalog.js";
import { WORK_LINE_FRAME_STYLES, renderWorkLineSpecimens, workLineSpecimenTitle } from "./work-line-specimens.js";
import {
  THEME_BOOTSTRAP_SCRIPT, VISUAL_FOUNDATION_CLIENT_SCRIPT, renderIconSprite, renderMenuGroup, renderMenuItem, renderProjectMonogram,
} from "@molis-ai/molis-work-design-system";

/**
 * The component board's 工作台导航 section (07-1 S0, redrawn for specs/screen-polish §3 方案 C「纸上的页签」): the parts of the
 * tab strip (docs/design/workbench-navigation, section 组件板新增), the side sheet's own tab with its list of views, the side's
 * switch and the layout button, then the top strip composed from them, as it is and when something is wrong. The frame is a
 * workbench page (`body.immersive-workbench` with the workbench sheet), so every part is drawn by the rules the product loads
 * (styles/workbench-navigation.ts, styles/top-strip.ts) on the product's own markup — the strip's specimen is the product's
 * header (`.workbench-header[data-dock]`), and a split's strips sit in the product's panes. The bottom of the window is the
 * 事项线 section's (work-line-specimens.ts). The data is a sample; nothing is read from a Home.
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
  readonly pinned?: boolean; readonly gone?: boolean; readonly warn?: boolean; readonly grown?: boolean; readonly badge?: number; readonly readerLabel?: string;
  /** The current tab is an ear on its sheet (方案 C), as tab-workspace-strip.ts marks it; a row of the side's list is not. */
  readonly ear?: boolean }

/** One tab in the product's markup (tab-workspace-strip.ts appendTab): a tab button and, unless it is glyph-only, its close. */
function tab(_L: Say, o: TabOptions): string {
  const label = o.readerLabel ?? o.label, close = uiText.text(o.head ? "workbench.navigation-specimens.close-tab-group" : "workbench.navigation-specimens.close-tab");
  const attrs = `${o.head ? ' data-tab-kind="plugin"' : ' data-tab-kind="record"'}${o.current ? ' aria-current="page"' : ""}${o.glyphOnly ? " data-glyph-only" : ""}${o.pinned ? ' data-pinned="true"' : ""}${o.gone ? ' data-tab-state="gone"' : ""}${o.current && !o.glyphOnly && o.ear !== false ? " data-ear" : ""}`;
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
// The titlebar's strip takes the room its tabs want from --tabs-hug, which the page's script measures (tab-workspace-strip.ts);
// the board runs no such script, so its titlebar strip says it here (and its header is drawn: data-dock-drawn on it below).
function strip(label: string, tabs: string, options: { end?: string; unfocused?: boolean; lead?: string; titlebar?: boolean } = {}): string {
  return `<nav class="tab-strip" role="tablist" aria-label="${escapeHtml(label)}"${options.titlebar ? ' data-titlebar-tabs style="--tabs-hug:max-content"' : ""}${options.unfocused ? " data-unfocused" : ""}>${options.lead ?? ""}<div class="tab-scroll" data-overflow-fade>${tabs}</div>${options.end ?? ""}</nav>`;
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
  // Marked as the product's is (data-layout-open), so the strip's own rules hold for it: on a phone's row it shows only while split.
  const attrs = { title: uiText.text("workbench.navigation-specimens.layout"), "data-nav-menu-for": controls, "data-nav-layout": true, "data-layout-open": true, "aria-haspopup": "menu", "aria-expanded": String(open), "aria-controls": controls };
  return renderButton({ label: uiText.text("workbench.navigation-specimens.layout"), icon: "columns", variant: "ghost", size: "sm", iconOnly: true, attrs });
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

/** The side's switch at the strip's right end (immersive-shell.ts): pressed while the side is open; ⌘\ does the same. */
function sideSwitch(open: boolean): string {
  const label = uiText.text("workbench.immersive-shell.side-toggle");
  return renderButton({ label, icon: "panel", variant: "ghost", size: "sm", iconOnly: true, attrs: { "data-nav-side-switch": true, "aria-pressed": String(open), title: `${label} ⌘\\` } });
}

/** The side sheet's own tab: the view it shows, by name, which opens the list of the side's views (immersive-shell.ts). */
function sideEar(id: PluginId, list: string, open: boolean): string {
  const name = pluginName(id), label = uiText.text("workbench.side-panel.side-view-name", { name });
  return `<button type="button" class="side-ear" data-side-ear data-ear data-nav-menu-for="${list}" aria-expanded="${open}" aria-controls="${list}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><span class="side-ear-glyph" aria-hidden="true">${icon(P[id].glyph)}</span><span class="side-ear-name">${escapeHtml(name)}</span>${icon("chevron-down")}</button>`;
}

/** The side's views as the list that drops from its tab: every one with its glyph and its name (side-panel.ts, menu). */
function sideViews(readText: Say, id: string, current: PluginId, hidden: boolean): string {
  const ids: PluginId[] = ["talk", "lingguang", "shelf", "materials", "tasks"];
  const rows = ids.map((view) => {
    const name = pluginName(view), badge = view === "tasks" ? 2 : 0;
    return tab(readText, { label: name, glyph: P[view].glyph, head: true, current: view === current, ear: false, badge, readerLabel: badge ? `${name} · ${uiText.text("workbench.navigation-specimens.n-background-n-not-finished", { n: badge })}` : name });
  }).join("");
  return `<div class="side-strip side-views" id="${id}" role="tablist" aria-orientation="vertical" aria-label="${escapeHtml(uiText.text("workbench.navigation-specimens.tabs-right"))}" data-side-tabs data-side-menu data-nav-popover${hidden ? " hidden" : ""}>${rows}</div>`;
}

/** The way back after closing Feed's group, at the end of the strip (the product's `.tab-undo-chip`). */
function undoChip(_L: Say): string {
  const label = uiText.text("workbench.navigation-specimens.reopen-plugin", { plugin: "Feed" });
  return `<button type="button" class="tab-undo-chip" data-nav-undo data-reopened="${escapeHtml(uiText.text("workbench.navigation-specimens.reopened-plugin", { plugin: "Feed" }))}" style="${hueVars(P.feed.hue)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)} (⌘⇧T)">${icon("undo")}<span>${escapeHtml(label)}</span></button>`;
}

/** A kept plugin's glyph in the strip, or 项目首页 (navigation-presentation.ts); the one whose own page shows is the ear. */
function dockPin(_readText: Say, id: PluginId | "home", options: { current?: boolean; warn?: boolean } = {}): string {
  const name = id === "home" ? uiText.text("workbench.navigation-specimens.project-home") : pluginName(id), glyph = id === "home" ? "home" : P[id].glyph;
  const label = options.warn ? `${name} · ${uiText.text("workbench.navigation-specimens.didn-t-start")}` : name;
  return `<button type="button" class="dock-pin${id === "home" ? " is-fixed" : ""}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"${options.current ? ' aria-current="page" data-ear' : ""}>${icon(glyph)}${options.warn ? '<span class="nav-warn-dot" aria-hidden="true"></span>' : ""}</button>`;
}

/**
 * The top strip as the product draws it (immersive-shell.ts renderImmersiveHeader, filled as its scripts fill it): history,
 * 项目首页 and the kept plugins, the tabs with the current one an ear on its sheet, ＋; over the side sheet its own tab; at the
 * right end the side's switch, the layout button and the project. Below it a strip of paper stands for the sheets.
 */
function titlebar(readText: Say, state: "ok" | "wrong"): string {
  const r = sample(readText), wrong = state === "wrong", suffix = wrong ? "wrong" : "ok";
  const history = `<div class="mw-group workspace-history">${renderButton({ label: uiText.text("workbench.navigation-specimens.previous"), icon: "back", variant: "ghost", size: "sm", iconOnly: true, className: "workspace-history-button", attrs: { "data-workspace-history": "back" } })}${renderButton({ label: uiText.text("workbench.navigation-specimens.next"), icon: "arrow", variant: "ghost", size: "sm", iconOnly: true, disabled: true, className: "workspace-history-button", attrs: { "data-workspace-history": "forward" } })}</div>`;
  const pins = `<div class="dock-pins" role="toolbar" aria-label="${escapeHtml(uiText.text("workbench.navigation-specimens.pinned-plugins"))}">${dockPin(readText, "home")}${dockPin(readText, "pages")}${dockPin(readText, "feed", { warn: wrong })}</div>`;
  const pinned = tab(readText, { label: r.doc1, glyph: "note", pinned: true, glyphOnly: true });
  const tabs = pinned + mainTabs(readText, state) + (wrong ? tab(readText, { label: uiText.text("workbench.navigation-specimens.receipts"), glyph: "package", head: true, warn: true, readerLabel: `${uiText.text("workbench.navigation-specimens.receipts")} · ${uiText.text("workbench.navigation-specimens.didn-t-start")}` }) : "");
  const undo = wrong ? undoChip(readText) : "";
  // A phone always shows 全部标签; on a desk only the strip that cannot hold its tabs does, so the normal row keeps it for the phone.
  const end = `${undo}${allTabsButton(readText, `nav-all-${suffix}`, false, !wrong)}`;
  const mainStrip = strip(uiText.text("workbench.navigation-specimens.main-tabs"), tabs, { end, titlebar: true });
  const plus = `<span class="mw-navs__anchor mw-navs__anchor--plus">${plusButton(readText, `nav-plus-${suffix}`, false)}${plusMenu(readText, `nav-plus-${suffix}`, true, wrong)}</span>`;
  const allMenu = `<span class="mw-navs__anchor mw-navs__anchor--all">${allTabsMenu(readText, `nav-all-${suffix}`, true)}</span>`;
  const side = `${sideEar("talk", `nav-side-${suffix}`, false)}${sideViews(readText, `nav-side-${suffix}`, "talk", true)}`;
  const layout = `<span class="titlebar-layout">${sideSwitch(true)}<span class="mw-navs__anchor mw-navs__anchor--end">${layoutButton(readText, `nav-layout-${suffix}`, false)}${layoutMenu(readText, `nav-layout-${suffix}`, true)}</span></span>`;
  const project = `<div class="titlebar-end"><section class="workspace-chrome project-island titlebar-chrome navigator-project" aria-label="${escapeHtml(uiText.text("workbench.navigation-specimens.current-project"))}"><div class="navigator-project-primary"><button type="button" class="navigator-project-selector" aria-label="${escapeHtml(uiText.text("workbench.navigation-specimens.switch-project"))} · ${escapeHtml(uiText.text("workbench.navigation-specimens.website-revamp"))}">${renderProjectMonogram(uiText.text("workbench.navigation-specimens.website-revamp"), "project-sample", escapeHtml)}</button></div></section></div>`;
  return `<div class="mw-navs__window" data-side-open-sample><header class="workbench-header immersive-titlebar" data-dock data-dock-drawn data-nav-titlebar="${state}">${history}${pins}${mainStrip}${allMenu}${plus}<div class="desktop-titlebar-drag" aria-hidden="true"></div>${side}${layout}${project}</header><div class="mw-navs__sheets" aria-hidden="true"><span></span><span></span></div></div>`;
}

function partSpecimens(readText: Say): string {
  const r = sample(readText);
  const tiers = specimen("tiers", "1", uiText.text("workbench.navigation-specimens.group-s-head-its-tabs-two-tiers"), uiText.text("workbench.navigation-specimens.head-group-s-colour-its-tabs-step-lighter"),
    strip(uiText.text("workbench.navigation-specimens.main-tabs"), mainTabs(readText)));
  // A split, in the product's panes (tab-workspace.ts): each sheet carries its own strip, and its current tab is an ear on it.
  const pane = (stripHtml: string, focused: boolean) => `<section class="tab-pane${focused ? " is-focused" : ""}">${stripHtml}<div class="tab-pane-body mw-navs__sheet"></div></section>`;
  const unfocused = specimen("unfocused", "2", uiText.text("workbench.navigation-specimens.current-tab-pane-without-focus"), uiText.text("workbench.navigation-specimens.focused-pane-s-ear-has-accent-line"),
    `<div class="tab-workspace mw-navs__split" data-split><div class="tab-workspace-panes">${pane(strip(uiText.text("workbench.navigation-specimens.pane-1-tabs"), group(readText, "goals", [{ label: r.goal1, current: true }])), true)}${pane(strip(uiText.text("workbench.navigation-specimens.pane-2-tabs"), group(readText, "pages", [{ label: r.doc1, current: true }]) + tab(readText, { label: r.code1, glyph: "code" }), { unfocused: true }), false)}</div></div>`);
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
  // The side sheet's own tab with its list dropped, as it opens under the name (side-panel.ts); the list is drawn open here.
  const side = specimen("side", "10", uiText.text("workbench.navigation-specimens.side-sheet-s-tab-its-list"), uiText.text("workbench.navigation-specimens.side-sheet-names-view-it-shows-list"),
    `<header class="workbench-header immersive-titlebar mw-navs__side" data-dock>${sideEar("shelf", "nav-side-open", true)}${sideViews(readText, "nav-side-open", "shelf", false)}<span class="titlebar-layout">${sideSwitch(true)}</span></header>`);
  const grow = specimen("grow", "12", uiText.text("workbench.navigation-specimens.glyph-tabs-that-widen-place"), uiText.text("workbench.navigation-specimens.rest-about-0-14s-move-keyboard-widens-place"),
    `<div class="mw-navs__row mw-navs__row--end">${sideGlyphs(readText, { current: "talk", grown: "shelf" })}</div><div class="mw-navs__row">${strip(uiText.text("workbench.navigation-specimens.main-tabs"), tab(readText, { label: r.doc1, glyph: "note", pinned: true, glyphOnly: true, grown: true }) + group(readText, "goals", [{ label: r.goal1, current: true }]))}</div>`);
  const badge = specimen("badge", "13", uiText.text("workbench.navigation-specimens.count-badge"), uiText.text("workbench.navigation-specimens.how-many-background-tasks-unfinished-their-glyph-screen"), `<div class="mw-navs__row mw-navs__row--end">${sideGlyphs(readText)}</div>`);
  const layout = specimen("layout", "14", uiText.text("workbench.navigation-specimens.layout-button-titlebar-s-end"), uiText.text("workbench.navigation-specimens.side-switch-and-layout-after-hairline"),
    `<div class="mw-navs__row mw-navs__row--end"><span class="titlebar-layout">${sideSwitch(false)}${layoutButton(readText, "nav-layout-open", true)}</span></div><div class="mw-navs__row mw-navs__row--end">${layoutMenu(readText, "nav-layout-open")}</div>`);
  return tiers + unfocused + overflow + undo + solo + plus + marks + side + grow + badge + sheetSpecimen(readText) + layout;
}

/** The glyph row drawn by whichever sheet this frame loads: the board shows it once in each, one above the other, to show they match. */
function sheetSpecimen(readText: Say): string {
  return specimen("sheets", "12 · 13", uiText.text("workbench.navigation-specimens.one-glyph-row-both-sheets"), uiText.text("workbench.navigation-specimens.project-page-s-sheet-arrival-page-s-each"),
    `<div class="mw-navs__row mw-navs__row--end" data-nav-sheet-row>${sideGlyphs(readText, { current: "talk", grown: "shelf" })}</div>`);
}

/**
 * The frame the board's 工作台导航 section loads, in the board's language. `sheet: "work-line"` is the same frame (a workbench
 * page with the workbench sheet) holding the 事项线 section's specimens instead (work-line-specimens.ts).
 */
export function renderMolisWorkNavigationSpecimen(readText: Say, htmlLang: string, sheet: "workbench" | "arrival" | "work-line" = "workbench"): string {
  // The arrival sheet has the glyph row but not the project page's tab rules, so its frame draws only that row.
  const arrival = sheet === "arrival", workLine = sheet === "work-line";
  const top = specimen("titlebar", "", uiText.text("workbench.navigation-specimens.titlebar"), uiText.text("workbench.navigation-specimens.top-strip-tabs-on-paper"),
    `<p class="mw-navs__state">${escapeHtml(uiText.text("workbench.navigation-specimens.ok"))}</p>${titlebar(readText, "ok")}<p class="mw-navs__state">${escapeHtml(uiText.text("workbench.navigation-specimens.something-wrong"))}</p>${titlebar(readText, "wrong")}`);
  return `<!doctype html>
<html lang="${htmlLang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(workLine ? workLineSpecimenTitle() : uiText.text("workbench.navigation-specimens.workbench-navigation"))} · Molis Work</title>
  ${renderLanguageHead(htmlLang)}
  <script>${THEME_BOOTSTRAP_SCRIPT}</script>
  <link rel="stylesheet" href="/assets/molis-work-${arrival ? "arrival" : "workbench"}.css">
  <style>${FRAME_STYLES}${workLine ? WORK_LINE_FRAME_STYLES : ""}</style>
</head>
<body class="${arrival ? "arrival-page " : ""}immersive-workbench mw-navs-page" data-nav-sheet="${sheet}">
  ${renderIconSprite()}
  <main class="mw-navs" data-nav-board>${arrival ? sheetSpecimen(readText) : workLine ? renderWorkLineSpecimens(specimen) : `${partSpecimens(readText)}${top}`}</main>
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
.mw-navs__narrow{max-width:520px;min-width:0}
.mw-navs .tab-strip{min-width:0}
/* The strip's specimen is the product's header on a window's desk, with a strip of paper below for the sheets its ears grow on:
   the main sheet, and the side sheet under the side's tab. The header's own rules (styles/top-strip.ts) place everything in it. */
.mw-navs__window{position:relative;min-width:0;border-radius:var(--r-card,12px);background:var(--desk);overflow:visible}
html body.mw-navs-page .mw-navs__window>.workbench-header{position:relative;inset:auto;width:auto;--side-panel-width:30%}
.mw-navs__sheets{display:flex;gap:8px;height:28px;padding:0 var(--sheet-inset,14px)}
.mw-navs__sheets>span{flex:1 1 0;border-radius:0 0 var(--r-sheet,14px) var(--r-sheet,14px);background:var(--paper)}
.mw-navs__sheets>span:last-child{flex:0 0 30%}
html body.mw-navs-page .mw-navs__side{position:relative;inset:auto;display:flex;justify-content:flex-end;padding-bottom:220px}
html body.mw-navs-page .mw-navs__side>.side-ear{position:relative;left:auto;bottom:auto}
html body.mw-navs-page .mw-navs__side>.side-views{left:auto!important;right:60px}
/* A split's panes, side by side here (the product places them by its split tree). */
html body.mw-navs-page .mw-navs__split{display:block}
html body.mw-navs-page .mw-navs__split>.tab-workspace-panes{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px;background:none}
html body.mw-navs-page .mw-navs__split>.tab-workspace-panes>.tab-pane{position:relative}
.mw-navs__sheet{height:28px;background:var(--paper)}
.mw-navs__anchor{position:relative;display:flex;align-items:center;flex:none}
.mw-navs__anchor>[data-nav-popover]{position:absolute;z-index:20;top:calc(100% + 6px);right:0}
.mw-navs__anchor--all{position:absolute;right:0;top:100%}
.mw-navs__window .workbench-header>.mw-navs__anchor--plus{order:2}
.mw-navs__live:empty{display:none}
@media (min-width:761px){[data-nav-when-full][data-nav-fits]{display:none}}
.mw-navs__live{margin:0;font-size:12px;color:var(--ink-soft)}
/* A phone's row is drawn with the side closed: there the side's own tab takes the current tab's place only while it is open
   (it outweighs the strip's own rule for that tab, top-strip.ts). */
@media (max-width:760px){html body .mw-navs__window .workbench-header[data-dock][data-dock][data-dock]>.side-ear{display:none}.mw-navs__sheets>span:last-child{display:none}.mw-navs__window .mw-navs__anchor{position:static}.mw-navs__window .mw-navs__anchor>[data-nav-popover]{left:8px;right:8px;width:auto}}`;

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
