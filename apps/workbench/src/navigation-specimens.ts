import { readFileSync } from "node:fs";
import { escapeHtml, icon, renderButton, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
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

interface Plugin { readonly name: string; readonly glyph: PluginIconName; readonly hue: string }
/** Sample plugins with the glyph and hue their Manifests declare (the prototype's sample project). */
const P = {
  goals: { name: "Goals", glyph: "target", hue: "blue" }, pages: { name: "Pages", glyph: "note", hue: "cyan" },
  coding: { name: "Coding", glyph: "code", hue: "purple" }, feed: { name: "Feed", glyph: "rss", hue: "brown" },
  talk: { name: "讨论", glyph: "message", hue: "steel" }, lingguang: { name: "灵光", glyph: "idea", hue: "yellow" },
  shelf: { name: "Shelf", glyph: "library", hue: "slate" }, materials: { name: "项目资料", glyph: "folder-tree", hue: "gray" },
  tasks: { name: "后台任务", glyph: "activity", hue: "gray" }, jelly: { name: "Jelly", glyph: "calendar", hue: "mint" },
  todo: { name: "待办", glyph: "list", hue: "green" }, cognia: { name: "Cognia", glyph: "book", hue: "blue" },
  receipts: { name: "收据整理", glyph: "package", hue: "gray" },
} as const satisfies Record<string, Plugin>;
type PluginId = keyof typeof P;

const hueVars = (hue: string) => `--group-color:var(--hue-${hue});--group-fill:var(--hue-${hue}-fill)`;

interface TabOptions { readonly label: string; readonly glyph: PluginIconName; readonly head?: boolean; readonly current?: boolean; readonly glyphOnly?: boolean;
  readonly pinned?: boolean; readonly gone?: boolean; readonly warn?: boolean; readonly grown?: boolean; readonly badge?: number; readonly readerLabel?: string }

/** One tab in the product's markup (tab-workspace-strip.ts appendTab): a tab button and, unless it is glyph-only, its close. */
function tab(L: Say, o: TabOptions): string {
  const label = o.readerLabel ?? o.label, close = L(o.head ? "关闭标签组" : "关闭标签");
  const attrs = `${o.head ? ' data-tab-kind="plugin"' : ' data-tab-kind="record"'}${o.current ? ' aria-current="page"' : ""}${o.glyphOnly ? " data-glyph-only" : ""}${o.pinned ? ' data-pinned="true"' : ""}${o.gone ? ' data-tab-state="gone"' : ""}`;
  const trigger = `<button type="button" role="tab" class="tab-item-trigger" aria-selected="${Boolean(o.current)}" tabindex="${o.current ? 0 : -1}" aria-label="${escapeHtml(label)}">`
    + `<svg class="tab-item-icon" aria-hidden="true"><use href="#icon-${o.glyph}"></use></svg><span class="tab-item-name">${escapeHtml(o.label)}</span>${o.warn ? '<span class="nav-warn-dot" aria-hidden="true"></span>' : ""}</button>`;
  const closeButton = o.glyphOnly || o.pinned ? "" : `<button type="button" class="tab-item-close" tabindex="-1" aria-label="${escapeHtml(close)}" title="${escapeHtml(`${close}·${o.label}`)}">${icon("x")}</button>`;
  return `<div class="tab-item${o.current ? " is-active" : ""}${o.grown ? " is-grown" : ""}"${attrs} title="${escapeHtml(o.label)}">${trigger}${closeButton}${o.badge ? `<span class="tab-count-badge" aria-hidden="true">${o.badge}</span>` : ""}</div>`;
}

/** A plugin's group: its head tab in the plugin's colour, a hairline, then its records a step lighter. */
function group(L: Say, id: PluginId, records: readonly (Omit<TabOptions, "glyph"> & { glyph?: PluginIconName })[], options: { headCurrent?: boolean; removed?: boolean; active?: boolean } = {}): string {
  const plugin = P[id], name = L(plugin.name);
  // A removed plugin says so in its head's name too: the tag beside it is inside the tablist, where a reader does not read it.
  const head = tab(L, { label: name, glyph: plugin.glyph, head: true, current: options.headCurrent, ...(options.removed ? { readerLabel: `${name} · ${L("已移除")}` } : {}) });
  const rows = records.map((record) => tab(L, { glyph: plugin.glyph, ...record })).join("");
  const removed = options.removed ? `<span class="tab-group-tag">${escapeHtml(L("已移除"))}</span>` : "";
  return `<div class="tab-group tab-plugin-group" data-plugin-group="${id}" data-active="${Boolean(options.active ?? records.some((r) => r.current))}"${options.removed ? ' data-group-state="removed"' : ""} style="${hueVars(plugin.hue)}">`
    + `<div class="tab-group-pages">${head}${rows.length ? '<span class="tab-group-sep" aria-hidden="true"></span>' : ""}${rows}${removed}</div></div>`;
}

/** A person's group: the small solid label in its colour, then its tabs. */
function personGroup(L: Say, title: string, hue: string, tabs: string): string {
  const toggle = `${L("收起标签组")} · ${title}`;
  return `<div class="tab-group" data-tab-group="launch" data-active="false" style="${hueVars(hue)}"><button type="button" class="tab-group-label" aria-expanded="true" aria-label="${escapeHtml(toggle)}" title="${escapeHtml(toggle)}"><span class="tab-group-name">${escapeHtml(title)}</span></button><div class="tab-group-pages">${tabs}</div></div>`;
}

/** A tab strip: the tablist with its scrolling tabs, and what stays at its end (undo, one pane only, all tabs). */
function strip(label: string, tabs: string, options: { end?: string; unfocused?: boolean; lead?: string; titlebar?: boolean } = {}): string {
  return `<nav class="tab-strip" role="tablist" aria-label="${escapeHtml(label)}"${options.titlebar ? " data-titlebar-tabs" : ""}${options.unfocused ? " data-unfocused" : ""}>${options.lead ?? ""}<div class="tab-scroll" data-overflow-fade>${tabs}</div>${options.end ?? ""}</nav>`;
}

const sample = (L: Say) => ({
  goal1: L("首页改版：换成新的首屏"), goal2: L("品牌规范落地"), doc1: L("改版方案"), doc2: L("第二轮用户访谈整理稿"),
  code1: L("修首屏布局"), feed1: L("设计周报 11/03"), ppt1: L("评审会讲稿 v3"), launch: L("发布周"),
});

function mainTabs(L: Say, state: "ok" | "wrong" = "ok"): string {
  const r = sample(L);
  const goals = state === "wrong"
    ? group(L, "goals", [{ label: r.goal1, current: true }, { label: r.goal2, gone: true, readerLabel: `${r.goal2} · ${L("这个 Goal 已经不在了")}` }])
    : group(L, "goals", [{ label: r.goal1, current: true }, { label: r.goal2 }]);
  const pages = group(L, "pages", [{ label: r.doc1 }, { label: r.doc2 }]);
  const last = state === "wrong"
    ? group(L, "feed", [{ label: r.feed1 }], { removed: true })
    : personGroup(L, r.launch, "orange", tab(L, { label: r.ppt1, glyph: "presentation" }) + tab(L, { label: r.code1, glyph: "code" }));
  return goals + (state === "wrong" ? "" : pages) + last;
}

function specimen(id: string, n: string, caption: string, note: string, body: string): string {
  return `<section class="mw-navs__item" data-nav-specimen="${id}" aria-labelledby="nav-${id}"><h2 id="nav-${id}"><span>${n}</span>${escapeHtml(caption)}</h2>${note ? `<p class="mw-navs__note">${escapeHtml(note)}</p>` : ""}<div class="mw-navs__stage">${body}</div></section>`;
}

/** The menu's search field, outside the menu list so the list holds only its items. */
const find = (placeholder: string) => `<label class="mw-input-group tab-menu-find">${icon("search")}<input class="mw-input" type="search" data-nav-find placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(placeholder)}" autocomplete="off"></label>`;

function allTabsMenu(L: Say, id: string, hidden = false): string {
  const r = sample(L);
  const section = (pid: PluginId, rows: readonly [string, boolean?][]) => renderMenuGroup({ label: `${L(P[pid].name)} · ${rows.length === 1 ? L("1 张") : L("{n} 张", { n: rows.length })}`, items: rows.map(([label, current]) => renderMenuItem({ label, iconName: P[pid].glyph, attrs: current ? { "aria-current": "true" } : {} })).join("") })
    .replace('class="mw-menu__label" aria-hidden="true">', `class="mw-menu__label" aria-hidden="true"><span class="tab-menu-dot" style="${hueVars(P[pid].hue)}"></span>`).replace('class="mw-menu__group"', `class="mw-menu__group" style="${hueVars(P[pid].hue)}"`);
  return `<div class="mw-menu tab-menu" id="${id}" data-nav-popover${hidden ? " hidden" : ""}>${find(L("找标签"))}<div role="menu" aria-label="${escapeHtml(L("全部标签"))}">`
    + section("goals", [[L("Goals")], [r.goal1, true], [r.goal2]]) + section("pages", [[L("Pages")], [r.doc1], [r.doc2]]) + section("coding", [[L("Coding")], [r.code1]]) + `</div></div>`;
}

function allTabsButton(L: Say, controls: string, open: boolean, phoneOnly = false): string {
  return `<button type="button" class="tab-strip-button tab-all-button"${phoneOnly ? " data-nav-when-full" : ""} data-nav-menu-for="${controls}" aria-haspopup="menu" aria-expanded="${open}" aria-controls="${controls}" aria-label="${escapeHtml(L("全部标签"))} · ${escapeHtml(L("{n} 张", { n: 12 }))}">${icon("rows")}<span>${escapeHtml(L("全部标签"))}</span><span class="tab-all-count">12</span></button>`;
}

function plusRow(L: Say, pid: PluginId, where = "", warn = false): string {
  const name = L(P[pid].name), beside = `${L("在旁边打开")} · ${name}`;
  const item = `<button type="button" class="mw-menu__item" role="menuitem" style="${hueVars(P[pid].hue)}">${icon(P[pid].glyph)}<span data-slot="menu-item-label">${escapeHtml(name)}</span>`
    + `${warn ? `<span class="nav-warn-dot" aria-hidden="true"></span><span class="tab-menu-note">${escapeHtml(L("没能启动"))}</span>` : where ? `<span class="tab-menu-where">${escapeHtml(where)}</span>` : ""}</button>`;
  return `<div class="tab-menu-row">${item}${renderButton({ label: beside, icon: "columns", variant: "ghost", size: "sm", iconOnly: true, className: "tab-menu-beside", attrs: { title: `${beside} (⌥↵)`, tabindex: "-1" } })}</div>`;
}

function plusMenu(L: Say, id: string, hidden = false, wrong = false): string {
  const label = (text: string, items: string) => renderMenuGroup({ label: text, items });
  return `<div class="mw-menu tab-menu" id="${id}" data-nav-popover${hidden ? " hidden" : ""}>${find(L("找插件，或刚关掉的标签"))}<div role="menu" aria-label="${escapeHtml(L("打开"))}">`
    + label(L("这个项目的插件"), plusRow(L, "goals", L("在这一栏")) + plusRow(L, "pages", L("在这一栏")) + plusRow(L, "coding") + plusRow(L, "talk", L("在右侧")))
    + label(L("个人 · 所有项目共用"), plusRow(L, "jelly") + plusRow(L, "todo") + plusRow(L, "cognia") + (wrong ? plusRow(L, "receipts", "", true) : ""))
    + label(L("刚关掉的"), renderMenuItem({ label: sample(L).feed1, iconName: "rss", shortcut: "⌘⇧T", attrs: { style: hueVars(P.feed.hue) } }))
    + `</div><p class="tab-menu-foot" aria-hidden="true">${escapeHtml(L("↵ 在这一栏打开　⌥↵ 在旁边打开"))}</p></div>`;
}

function layoutMenu(L: Say, id: string, hidden = false): string {
  const item = (label: string, iconName: PluginIconName, shortcut?: string, disabled?: boolean) => renderMenuItem({ label: L(label), iconName, ...(shortcut ? { shortcut } : {}), ...(disabled ? { disabled } : {}) });
  return `<div class="mw-menu tab-menu" id="${id}" data-nav-popover role="menu" aria-label="${escapeHtml(L("布局 · 主区"))}"${hidden ? " hidden" : ""}><p class="tab-menu-head" aria-hidden="true">${escapeHtml(L("布局 · 主区"))}</p>`
    + renderMenuGroup({ items: item("向右分屏", "columns") + item("向下分屏", "frame") + item("把这张标签移到右侧", "arrow") + item("独看这一栏", "maximize", "⌘⇧↵") })
    + renderMenuGroup({ items: item("合并成一栏", "minus", undefined, true) + item("收起右侧", "panel", "⌘\\") + item("均分宽度", "columns", undefined, true) + item("关闭这一栏", "x") })
    + renderMenuGroup({ label: L("切到"), items: renderMenuItem({ label: L("主区"), checked: true }) + renderMenuItem({ label: L("右侧"), checked: false }) })
    + `</div>`;
}

function plusButton(L: Say, controls: string, open: boolean): string {
  return `<button type="button" class="tab-add-button" data-nav-menu-for="${controls}" aria-haspopup="menu" aria-expanded="${open}" aria-controls="${controls}" aria-label="${escapeHtml(L("打开"))}" title="${escapeHtml(L("打开"))}">${icon("plus")}</button>`;
}

function layoutButton(L: Say, controls: string, open: boolean): string {
  const attrs = { title: L("布局"), "data-nav-menu-for": controls, "aria-haspopup": "menu", "aria-expanded": String(open), "aria-controls": controls };
  return `<span class="titlebar-layout">${renderButton({ label: L("布局"), icon: "columns", variant: "ghost", size: "sm", iconOnly: true, attrs })}</span>`;
}

/** The right side's glyphs: its tabs against the right edge, background tasks with what is unfinished. */
function sideGlyphs(L: Say, options: { current?: PluginId; grown?: PluginId; asTabs?: boolean } = {}): string {
  const ids: PluginId[] = ["talk", "lingguang", "shelf", "materials", "tasks"];
  const tabs = ids.map((id) => {
    const name = L(P[id].name), badge = id === "tasks" ? 2 : 0;
    return tab(L, { label: name, glyph: P[id].glyph, head: true, glyphOnly: true, current: options.current === id, grown: options.grown === id, badge, readerLabel: badge ? `${name} · ${L("{n} 个后台任务没做完", { n: badge })}` : name });
  }).join("");
  return `<div class="tab-glyph-row" role="tablist" aria-label="${escapeHtml(L("右侧的标签"))}" data-nav-glyph-row>${tabs}</div>`;
}

function paneSwitch(L: Say): string {
  return renderToggleGroup({ label: L("显示哪一栏"), className: "tab-pane-switch", items: [{ value: "main", label: L("主区"), current: true }, { value: "side", label: L("右侧") }] });
}

/** The way back after closing Feed's group, at the end of the strip (the product's `.tab-undo-chip`). */
function undoChip(L: Say): string {
  const label = L("撤销关闭 {plugin}", { plugin: "Feed" });
  return `<button type="button" class="tab-undo-chip" data-nav-undo data-reopened="${escapeHtml(L("已恢复 {plugin}", { plugin: "Feed" }))}" style="${hueVars(P.feed.hue)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)} (⌘⇧T)">${icon("undo")}<span>${escapeHtml(label)}</span></button>`;
}

/** The whole titlebar: history, the main strip and its ＋, the right side's glyphs, the layout button. */
function titlebar(L: Say, state: "ok" | "wrong"): string {
  const r = sample(L), wrong = state === "wrong", suffix = wrong ? "wrong" : "ok";
  const history = `<span class="mw-navs__history">${renderButton({ label: L("上一步"), icon: "back", variant: "ghost", size: "sm", iconOnly: true })}${renderButton({ label: L("下一步"), icon: "arrow", variant: "ghost", size: "sm", iconOnly: true, disabled: true })}</span>`;
  const pinned = tab(L, { label: r.doc1, glyph: "note", pinned: true, glyphOnly: true });
  const tabs = pinned + mainTabs(L, state) + (wrong ? tab(L, { label: L("收据整理"), glyph: "package", head: true, warn: true, readerLabel: `${L("收据整理")} · ${L("没能启动")}` }) : "");
  const undo = wrong ? undoChip(L) : "";
  // A phone always shows 全部标签; on a desk only the strip that cannot hold its tabs does, so the normal row keeps it for the phone.
  const end = `${undo}${allTabsButton(L, `nav-all-${suffix}`, false, !wrong)}`;
  const plus = `<span class="mw-navs__anchor">${plusButton(L, `nav-plus-${suffix}`, false)}${plusMenu(L, `nav-plus-${suffix}`, true, wrong)}</span>`;
  const mainStrip = strip(L("主区的标签"), tabs, { end, titlebar: true, lead: paneSwitch(L) });
  const allMenu = `<span class="mw-navs__anchor mw-navs__anchor--all">${allTabsMenu(L, `nav-all-${suffix}`, true)}</span>`;
  return `<header class="mw-navs__titlebar" data-nav-titlebar="${state}">${history}<div class="mw-navs__main">${mainStrip}${allMenu}${plus}</div>${sideGlyphs(L, { current: "talk" })}`
    + `<span class="mw-navs__anchor mw-navs__anchor--end">${layoutButton(L, `nav-layout-${suffix}`, false)}${layoutMenu(L, `nav-layout-${suffix}`, true)}</span></header>`;
}

function dockPin(L: Say, id: PluginId | "home", options: { current?: boolean; warn?: boolean; fold?: boolean } = {}): string {
  const name = id === "home" ? L("项目首页") : L(P[id].name), glyph = id === "home" ? "home" : P[id].glyph;
  const label = options.warn ? `${name} · ${L("没能启动")}` : name;
  return `<button type="button" class="dock-pin${id === "home" ? " is-fixed" : ""}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"${options.current ? ' aria-current="page"' : ""}${options.fold ? " data-fold" : ""}>${icon(glyph)}${options.warn ? '<span class="nav-warn-dot" aria-hidden="true"></span>' : ""}</button>`;
}

/** The bar in three zones: the glyph-only switcher and the Dock, the Assistant, the person's own and the project. */
function bar(L: Say, state: "ok" | "wrong"): string {
  const wrong = state === "wrong", now = `${L("Goals")} · ${L("讨论")}`;
  const switcher = `<button type="button" class="dock-pin bar-switcher" aria-haspopup="menu" aria-expanded="false" aria-label="${escapeHtml(L("切换插件 · 现在：{now}", { now }))}" title="${escapeHtml(L("切换插件"))} ⌘K">${icon("grid")}</button>`;
  // On a phone the bar folds what its second row cannot hold behind +N (the product's `.dock-pin-more`); here it is drawn, not measured.
  const fold = (count: number, label: string) => `<button type="button" class="dock-pin dock-pin-more mw-navs__fold" aria-haspopup="true" aria-expanded="false" aria-label="${escapeHtml(`${label} ${count}`)}" title="${escapeHtml(label)}">+${count}</button>`;
  const dock = `<div class="dock-pins" role="toolbar" aria-label="${escapeHtml(L("常驻插件"))}">${dockPin(L, "home")}${dockPin(L, "goals", { current: true })}${dockPin(L, "pages", { fold: true })}${dockPin(L, "coding", { fold: true })}${dockPin(L, "feed", { fold: true })}${fold(3, L("更多常驻插件"))}</div>`;
  const composer = `<div class="bar-center"><form class="assistant-composer bar-composer" aria-label="Molis Work Assistant" data-nav-composer><textarea class="assistant-composer-input" rows="1" placeholder="${escapeHtml(L("让助理做点什么…"))}" aria-label="${escapeHtml(L("发给助理"))}"></textarea>`
    + `${renderButton({ label: L("发送"), icon: "send", variant: "primary", size: "sm", iconOnly: true, disabled: true, type: "submit" })}</form></div>`;
  const own = `<div class="bar-side bar-own" role="toolbar" aria-label="${escapeHtml(L("你自己的"))}">${wrong ? dockPin(L, "receipts", { warn: true }) : ""}${dockPin(L, "jelly", { fold: wrong })}${dockPin(L, "todo", { fold: true })}${dockPin(L, "cognia", { fold: true })}${fold(wrong ? 3 : 2, L("你自己的"))}</div>`;
  const project = `<section class="workspace-chrome project-island titlebar-chrome navigator-project" aria-label="${escapeHtml(L("当前项目"))}"><div class="navigator-project-primary"><button type="button" class="navigator-project-selector" aria-label="${escapeHtml(L("切换项目"))} · ${escapeHtml(L("网站改版"))}">${renderProjectMonogram(L("网站改版"), "project-sample", escapeHtml)}</button></div></section>`;
  return `<div class="workbench-bar" data-nav-bar="${state}" data-own-kept aria-label="${escapeHtml(L("底栏"))}"><div class="bar-start">${switcher}${dock}</div>${composer}<div class="bar-end">${own}${project}</div></div>`;
}

function partSpecimens(L: Say): string {
  const r = sample(L);
  const tiers = specimen("tiers", "1", L("标签组的组头与条目两档"), L("组头用组色字，条目轻一档，中间一条细竖线；当前标签是纸面、浮起，下面一条组色短线。"),
    strip(L("主区的标签"), mainTabs(L)));
  const unfocused = specimen("unfocused", "2", L("不在焦点那一栏的当前标签"), L("左边一栏有焦点；右边一栏的当前标签只留一层底色，不浮起。"),
    `<div class="mw-navs__pair">${strip(L("第 1 栏的标签"), group(L, "goals", [{ label: r.goal1, current: true }]))}${strip(L("第 2 栏的标签"), group(L, "pages", [{ label: r.doc1, current: true }]) + tab(L, { label: r.code1, glyph: "code" }), { unfocused: true })}</div>`);
  const overflow = specimen("all-tabs", "3", L("「全部标签」按钮与它的列表"), L("放不下时才出现在标签条末端；列表按组分段、带张数，顶上可以搜索。"),
    `<div class="mw-navs__narrow">${strip(L("主区的标签"), mainTabs(L), { end: allTabsButton(L, "nav-all-open", true) })}</div>${allTabsMenu(L, "nav-all-open")}`);
  const undo = specimen("undo", "6", L("撤销关闭小签"), L("关掉一组后留 6 秒，组色底，固定在标签条可见区的末端；⌘⇧T 也能恢复。"),
    `<div class="mw-navs__narrow">${strip(L("主区的标签"), mainTabs(L), { end: undoChip(L) })}</div><p class="mw-navs__live" role="status" data-nav-live></p>`);
  const solo = specimen("solo", "7", L("独看小签"), L("独看时别的栏先收起；点它或再按 ⌘⇧↵ 回来。"),
    strip(L("主区的标签"), group(L, "goals", [{ label: r.goal1, current: true }]), { end: `<button type="button" class="tab-strip-button tab-solo-chip">${icon("maximize")}<span>${escapeHtml(L("独看中 · 显示全部"))}</span></button>` }));
  const plus = specimen("plus", "8", L("「＋」菜单的行"), L("只负责打开。已经开着的写出在哪一栏；悬停或聚焦时行尾出现「在旁边打开」（⌥↵）。"),
    `<div class="mw-navs__row">${plusButton(L, "nav-plus-open", true)}</div>${plusMenu(L, "nav-plus-open", false, true)}`);
  const marks = specimen("marks", "9", L("标签的异常标记"), L("划掉＝记录不在；琥珀小点＝没能启动；组上「已移除」。标签都留着，不自动关、不挪位。"),
    strip(L("主区的标签"), mainTabs(L, "wrong") + tab(L, { label: L("收据整理"), glyph: "package", head: true, warn: true, readerLabel: `${L("收据整理")} · ${L("没能启动")}` })));
  const phone = specimen("pane-switch", "10", L("窄屏标签条前的「主区｜右侧」切换"), L("≤760px 只显示焦点那一栏，标签条最前面是现成的切换控件。"),
    `<div class="mw-navs__phone" data-force-narrow>${strip(L("主区的标签"), group(L, "goals", [{ label: r.goal1, current: true }]), { lead: paneSwitch(L) })}</div>`);
  const grow = specimen("grow", "12", L("原地展开的图标标签"), L("停约 0.14 秒或用键盘移到它，就原地变宽、写出名字；右侧那排向左长，图标不动。宽度一步到位，只有名字淡入。"),
    `<div class="mw-navs__row mw-navs__row--end">${sideGlyphs(L, { current: "talk", grown: "shelf" })}</div><div class="mw-navs__row">${strip(L("主区的标签"), tab(L, { label: r.doc1, glyph: "note", pinned: true, glyphOnly: true, grown: true }) + group(L, "goals", [{ label: r.goal1, current: true }]))}</div>`);
  const badge = specimen("badge", "13", L("数字角标"), L("后台任务图标上没做完的数，读屏名写出几个没做完。"), `<div class="mw-navs__row mw-navs__row--end">${sideGlyphs(L)}</div>`);
  const layout = specimen("layout", "14", L("标题栏右端的「布局」按钮"), L("28px，前面一条细分隔线；右侧收起时前面是右侧那排图标。菜单作用于焦点所在的那一栏。"),
    `<div class="mw-navs__row mw-navs__row--end">${sideGlyphs(L)}${layoutButton(L, "nav-layout-open", true)}</div><div class="mw-navs__row mw-navs__row--end">${layoutMenu(L, "nav-layout-open")}</div>`);
  return tiers + unfocused + overflow + undo + solo + plus + marks + phone + grow + badge + sheetSpecimen(L) + layout;
}

/** The glyph row drawn by whichever sheet this frame loads: the board shows it once in each, one above the other, to show they match. */
function sheetSpecimen(L: Say): string {
  return specimen("sheets", "12 · 13", L("两张样式表里的同一排图标"), L("项目页与打开页各自的样式表都带这排图标，画出来一样。"),
    `<div class="mw-navs__row mw-navs__row--end" data-nav-sheet-row>${sideGlyphs(L, { current: "talk", grown: "shelf" })}</div>`);
}

/** The frame the board's 工作台导航 section loads, in the board's language. */
export function renderMolisWorkNavigationSpecimen(L: Say, htmlLang: string, sheet: "workbench" | "arrival" = "workbench"): string {
  // The arrival sheet has the glyph row but not the project page's tab rules, so its frame draws only that row.
  const arrival = sheet === "arrival";
  const bars = specimen("bar", "15 · 16", L("三段新底栏"), L("左：只有图标的切换器，细线后面是 Dock，最前面是项目首页。中：输入框。右：钉住的个人插件，后面是项目圆钮。"),
    `<p class="mw-navs__state">${escapeHtml(L("正常"))}</p><div class="mw-navs__bar">${bar(L, "ok")}</div><p class="mw-navs__state">${escapeHtml(L("个人插件没能启动"))}</p><div class="mw-navs__bar">${bar(L, "wrong")}</div>`);
  const bars2 = specimen("titlebar", "", L("标题栏"), L("主区标签条与「＋」，右上是右侧那排图标，最右端是「布局」。异常态：记录不在、插件已移除、没能启动、刚关掉一组、放不下。"),
    `<p class="mw-navs__state">${escapeHtml(L("正常"))}</p>${titlebar(L, "ok")}<p class="mw-navs__state">${escapeHtml(L("异常"))}</p>${titlebar(L, "wrong")}`);
  return `<!doctype html>
<html lang="${htmlLang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(L("工作台导航"))} · Molis Work</title>
  <script>${THEME_BOOTSTRAP_SCRIPT}</script>
  <link rel="stylesheet" href="/assets/molis-work-${arrival ? "arrival" : "workbench"}.css">
  <style>${FRAME_STYLES}</style>
</head>
<body class="${arrival ? "arrival-page " : ""}immersive-workbench mw-navs-page" data-nav-sheet="${sheet}">
  ${renderIconSprite()}
  <main class="mw-navs" data-nav-board>${arrival ? sheetSpecimen(L) : `${partSpecimens(L)}${bars2}${bars}`}</main>
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
.mw-navs .workbench-bar{height:var(--dock-h);padding:0;background:transparent}
.mw-navs .bar-composer textarea{resize:none}
html body.mw-navs-page .workbench-bar .mw-navs__fold{display:none}
@media (max-width:760px){.mw-navs__history{display:none}.mw-navs__titlebar{position:relative;display:grid;grid-template-columns:1fr auto auto;grid-template-rows:44px 44px;gap:4px;height:auto;padding:0}.mw-navs__main{display:contents}.mw-navs__main>.tab-strip{grid-area:1/1/3/4}.mw-navs__main>.mw-navs__anchor:not(.mw-navs__anchor--all){grid-area:1/2;z-index:1}.mw-navs__titlebar>.mw-navs__anchor--end{grid-area:1/3;z-index:1}body.mw-navs-page .mw-navs__titlebar>.tab-glyph-row{display:none}.mw-navs .workbench-bar{height:auto}.mw-navs__titlebar .mw-navs__anchor{position:static}.mw-navs__titlebar .mw-navs__anchor>[data-nav-popover]{left:0;right:0;width:auto}body.mw-navs-page .mw-navs .bar-composer>.mw-btn{width:44px;min-width:44px;height:44px;min-height:44px}html body.mw-navs-page .workbench-bar [data-fold]{display:none}html body.mw-navs-page .workbench-bar .mw-navs__fold{display:inline-grid}}`;

/** The board's section: the frame above, in the board's language, at a fixed height that scrolls inside, like the board's other specimen frames. */
export function renderNavigationSection(L: Say, lang: "zh" | "en"): string {
  return `<section class="mw-catalog__section" id="navigation" data-primitive="navigation"><h2>${escapeHtml(L("工作台导航"))}</h2>`
    + `<p class="mw-nav-section__note">${escapeHtml(L("07-1 定样的组件板新增：标签条、标题栏与三段底栏的零件，以及它们组合成的整条样张。"))}</p>`
    + `<iframe class="mw-nav-frame" data-nav-frame src="/__ui/catalog/navigation?lang=${lang}" title="${escapeHtml(L("工作台导航样例"))}" loading="lazy"></iframe>`
    + `<p class="mw-nav-section__note">${escapeHtml(L("同一排图标，打开页的样式表画的："))}</p>`
    + `<iframe class="mw-nav-frame mw-nav-frame--sheet" data-nav-frame src="/__ui/catalog/navigation?lang=${lang}&amp;sheet=arrival" title="${escapeHtml(L("打开页样式表里的图标标签"))}" loading="lazy"></iframe></section>`;
}

export const NAVIGATION_SECTION_STYLES = ".mw-nav-section__note{margin:0 0 12px;color:var(--muted);font-size:12px}.mw-nav-frame{display:block;width:100%;height:min(1400px,85vh);border:0;border-radius:var(--r-card,12px);background:var(--desk)}.mw-nav-frame--sheet{height:200px}";

/** The frame's program, written in `src/browser/board/navigation-frame.ts` and bundled into `dist/` when the package builds. */
const NAVIGATION_FRAME_SCRIPT = readFileSync(new URL("./board-navigation-frame.js", import.meta.url), "utf8").trim();
