// The board's parts for AI kits (docs/design/capability-pack/README.md「组件板新增」, decided by the user 2026-11-09: scheme A,
// eight parts after the D track's review). Like the 08 parts they are built on (catalog-skill-packs.ts: the list and detail, the
// item rows, the status line) they live on the board first: these rules are the board's own, and move into a page sheet with the
// first product page that draws them (the 09 batch's AI kit page). Every control inside them is an existing one (button, status
// mark, badge, menu); the rules only place them, on tokens only. The renderers below are what a page calls; the sections after them
// are the board's specimens.
import { cx, escapeHtml, icon, renderAttrs, renderButton, renderStatusMark, type AttrValue, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderMenu, renderMenuGroup, renderMenuItem } from "./overlay.js";
import { section, specimen } from "./catalog-parts.js";
import type { Say } from "./catalog-composer.js";
import { statusLine } from "./catalog-skill-packs.js";

export const CAPABILITY_PACK_BOARD_STYLES = `
  /* 1 · State and next steps: the status line (08's), an optional note, then a row of buttons; one of them may open a menu anchored
     under it (a mw-menu in the top layer, so no scrolling box clips it; placed by the anchored-menu client). */
  .mw-now { display: grid; gap: 10px; min-width: 0; padding: 12px 14px; border-radius: var(--r-card, 12px); background: var(--surface-soft); }
  .mw-now > .mw-status-line { color: var(--ink-soft); font-size: 13px; line-height: 20px; }
  .mw-now__note { margin: 0; max-width: 640px; color: var(--muted); font-size: 12px; line-height: 1.55; }
  .mw-now__actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; }
  .mw-now__actions:empty { display: none; }
  .mw-anchored-menu[popover] { position: fixed; inset: auto; margin: 0; overflow-y: auto; width: 320px; max-width: calc(100vw - 32px); }

  /* 2 · An item group: a parent row (choosable, with where it applies) and, indented under it, its own entries. */
  .mw-item-groups { container: mw-item-groups / inline-size; display: grid; gap: 8px; min-width: 0; margin: 0; padding: 0; list-style: none; }
  .mw-item-group { display: grid; min-width: 0; padding: 6px; border-radius: var(--r-card, 12px); background: var(--paper); box-shadow: var(--lift-1); }
  .mw-item-group__head { appearance: none; display: flex; align-items: flex-start; gap: 12px; width: 100%; min-width: 0; min-height: 44px; margin: 0; padding: 8px 8px 8px 10px; border: 0; border-radius: var(--sk-r-item, 8px); background: transparent; color: inherit; font: inherit; text-align: start; cursor: pointer; transition: background-color var(--dur-hover) var(--ease-quint); }
  .mw-item-group__head:hover { background: var(--nav-hover); }
  .mw-item-group__head[aria-current="true"] { background: var(--nav-active); }
  .mw-item-group__head:active { background: var(--nav-press); }
  .mw-item-group__head:focus-visible { outline: var(--focus-stroke); outline-offset: -2px; }
  .mw-item-group__text { display: grid; gap: 2px; flex: 1 1 auto; min-width: 0; }
  .mw-item-group__text strong { color: var(--ink); font-size: 13px; font-weight: var(--weight-title, 600); line-height: 1.4; overflow-wrap: break-word; }
  .mw-item-group__text small { color: var(--muted); font-size: 12px; line-height: 1.45; }
  .mw-item-group__text .mw-item-group__where { color: var(--ink-soft); }
  .mw-item-group__head > .mw-item__end { margin-top: 4px; }
  .mw-item-group__children { display: grid; gap: 4px; min-width: 0; margin: 2px 0 0 54px; padding: 8px 0 2px; border-top: 1px solid var(--line); }
  .mw-item-group__label { padding: 0 4px; color: var(--faint); font-size: 11px; font-weight: var(--weight-control, 500); }
  .mw-item-group__children > .mw-items { width: 100%; padding: 0; background: transparent; box-shadow: none; }
  .mw-item-group__empty { margin: 0; padding: 4px; color: var(--muted); font-size: 12px; }
  @container mw-item-groups (max-width: 360px) { .mw-item-group__children { margin-left: 0; } }

  @media (prefers-reduced-motion: reduce) { :is(.mw-item-group__head, .mw-cell) { transition: none; } }

  .mw-catalog :is([data-primitive="now-block"], [data-primitive="item-group"], [data-primitive="cell-grid"], [data-primitive="detail-trail"], [data-primitive="icon-counts"], [data-primitive="state-rows"], [data-primitive="usage-figure"]) .mw-catalog__specimens { grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); align-items: start; }
  .mw-catalog :is([data-primitive="now-block"], [data-primitive="item-group"], [data-primitive="cell-grid"], [data-primitive="detail-trail"], [data-primitive="icon-counts"], [data-primitive="state-rows"], [data-primitive="usage-figure"]) .mw-catalog__row { display: grid; gap: 10px; min-width: 0; }
  .mw-catalog [data-primitive="icon-counts"] .mw-items { width: 100%; }
  .mw-catalog :is([data-primitive="sticky-detail"], [data-primitive="state-rows"]) .mw-catalog__specimens { grid-template-columns: minmax(0, 1fr); }
  .mw-catalog [data-primitive="sticky-detail"] .mw-catalog__row { display: block; }
  .mw-catalog [data-sticky-frame] { height: var(--settings-view-h); overflow: auto; padding: 12px; border-radius: var(--sk-r-item, 8px); box-shadow: inset 0 0 0 1px var(--line); }
  .mw-catalog [data-sticky-frame] > p { margin: 0 0 12px; color: var(--muted); font-size: 12px; }
`;

/** 1 · The menu a button in the state block opens: an id that ties the two, the menu's own label and its items. */
export interface NowMenu {
  readonly id: string;
  readonly label: string;
  readonly icon?: PluginIconName;
  readonly items: string;
}

/**
 * 1 · A state and its next steps. `status` is the status line (08's `statusLine`, or a status mark and words). The menu, when given,
 * is the last button of the row (so it never covers its neighbours) and opens from that button's lower edge: the anchored-menu
 * client places it, closes it on Escape or a press outside, and puts the focus back on the button.
 */
export function renderNowBlock(options: { status: string; note?: string; actions?: string; menu?: NowMenu; className?: string; attrs?: Record<string, AttrValue> }): string {
  const menu = options.menu;
  const trigger = menu ? renderButton({ label: menu.label, variant: "secondary", size: "sm", icon: menu.icon, attrs: {
    id: `${menu.id}-button`, "data-anchored-menu": true, popovertarget: menu.id, "aria-controls": menu.id, "aria-haspopup": "menu", "aria-expanded": "false",
  } }) : "";
  const layer = menu ? renderMenu({ items: menu.items, labelledBy: `${menu.id}-button`, className: "mw-anchored-menu", attrs: { id: menu.id, popover: "auto" } }) : "";
  const note = options.note ? `<p class="mw-now__note">${escapeHtml(options.note)}</p>` : "";
  return `<div class="${cx("mw-now", options.className)}" data-slot="now"${renderAttrs(options.attrs)}>${options.status}${note}<div class="mw-now__actions">${options.actions ?? ""}${trigger}${layer}</div></div>`;
}

/** One choosable row (08's list entry: the list item stays, a real button fills it). */
export interface PickRow {
  readonly glyph: PluginIconName;
  readonly name: string;
  readonly sub: string;
  readonly end: string;
  readonly current?: boolean;
  readonly attrs?: Record<string, AttrValue>;
}

export function renderPickRow(row: PickRow): string {
  return `<li class="mw-item mw-item--pick"><button type="button" class="mw-item__pick"${row.current ? ' aria-current="true"' : ""}${renderAttrs(row.attrs)}><span class="mw-mark" aria-hidden="true">${icon(row.glyph)}</span><span><strong>${
    escapeHtml(row.name)}</strong><small title="${escapeHtml(row.sub)}">${escapeHtml(row.sub)}</small></span><span class="mw-item__end">${row.end}</span></button></li>`;
}

/**
 * 2 · An item group: the parent row (its name, what it is, where it applies) and its own entries indented under a quiet label.
 * `children` are `renderPickRow` rows; with none, `empty` says so in place.
 */
export function renderItemGroup(options: { glyph: PluginIconName; name: string; description: string; where: string; end: string; label: string;
  children: readonly string[]; empty: string; current?: boolean; attrs?: Record<string, AttrValue> }): string {
  const children = options.children.length ? `<ul class="mw-items">${options.children.join("")}</ul>` : `<p class="mw-item-group__empty">${escapeHtml(options.empty)}</p>`;
  return `<li class="mw-item-group"><button type="button" class="mw-item-group__head"${options.current ? ' aria-current="true"' : ""}${renderAttrs(options.attrs)}><span class="mw-mark" aria-hidden="true">${icon(options.glyph)}</span><span class="mw-item-group__text"><strong>${
    escapeHtml(options.name)}</strong><small>${escapeHtml(options.description)}</small><small class="mw-item-group__where">${escapeHtml(options.where)}</small></span><span class="mw-item__end">${options.end}</span></button><div class="mw-item-group__children" role="group" aria-label="${
    escapeHtml(`${options.name} · ${options.label}`)}"><span class="mw-item-group__label" aria-hidden="true">${escapeHtml(options.label)}</span>${children}</div></li>`;
}

/* ---------- the board's specimens (made up; nothing is read from a Home). Every text is still Chinese: `say` turns it. ---------- */

const hold = (word: string) => renderStatusMark({ label: word, tone: "hold", state: "unavailable" });
const inUse = (word: string) => renderStatusMark({ label: word, tone: "idle", state: "ready" });

function exportMenu(say: Say, id: string, withPrompts = true): NowMenu {
  const items = [
    renderMenuItem({ label: say("整个包"), description: say("内容包原样带签名，加上你的提示词改写和引用"), iconName: "package" }),
    ...(withPrompts ? [renderMenuItem({ label: say("只导出你的提示词改写（{n}）", { n: 1 }), description: say("存成你自己的数据文件，导回时逐条确认"), iconName: "text" })] : []),
    renderMenuItem({ label: say("角色、工具和 MCP 的引用"), description: say("只带名字和版本，不带配置、地址和凭据"), iconName: "link" }),
  ].join("");
  return { id, label: say("导出这个包"), icon: "download", items: renderMenuGroup({ label: say("导出「{p}」", { p: say("写作工具") }), items }) };
}

export function nowBlockSection(say: Say): string {
  const manage = renderButton({ label: say("在插件设置里管理"), variant: "ghost", size: "sm", icon: "arrow" });
  return section("now-block", say("状态与去处 / State and Next Steps"), `<div class="mw-catalog__specimens">
    ${specimen(say("要处理：逐项写出，导出菜单锚在按钮下沿"), renderNowBlock({ status: statusLine(hold(say("1 项要处理")), say("排日程：暂时用不了")), actions: manage, menu: exportMenu(say, "now-export-a") }))}
    ${specimen(say("在用：一句说明"), renderNowBlock({ status: statusLine(inUse(say("在用")), say("包里的东西都能用。")), actions: manage, menu: exportMenu(say, "now-export-b", false) }))}
    ${specimen(say("插件停用：去处是启用插件"), renderNowBlock({ status: statusLine(renderStatusMark({ label: say("已停用"), tone: "quiet", state: "paused" }), say("插件停用了：包里的技能、角色和提示词都不会被用到。启用后照原来的设置。")),
      actions: renderButton({ label: say("启用插件"), variant: "primary", size: "sm" }) }))}
    ${specimen(say("一条的「现在」：说明在下，去处一排"), renderNowBlock({ status: statusLine(renderStatusMark({ label: say("默认已更新"), tone: "attention", state: "stale" }), say("用的是你的版本，基于第 3 版；默认已更新到第 4 版。")),
      note: say("这里不显示正文。改写、对比和恢复默认都在「提示词」里，从下一轮生效。"),
      actions: renderButton({ label: say("对比新的默认"), variant: "secondary", size: "sm", icon: "arrow" }) + renderButton({ label: say("在提示词里改"), variant: "secondary", size: "sm", icon: "arrow" }) }))}
  </div>`);
}

function promptRow(say: Say, name: string, sub: string, word: string, current = false): string {
  return renderPickRow({ glyph: "text", name: say(name), sub: say(sub), end: word === "默认已更新" ? renderStatusMark({ label: say(word), tone: "attention", state: "stale" }) : inUse(say(word)), current });
}

export function itemGroupSection(say: Say): string {
  const editor = renderItemGroup({ glyph: "user", name: say("写作编辑"), description: say("改稿、压缩篇幅、统一语气"), where: say("生效：助理、Pages"), end: inUse(say("在用")), label: say("它的提示词"),
    children: [promptRow(say, "写作编辑的说明", "写作工具 · 默认第 2 版", "默认", true), promptRow(say, "语气要求", "你的版本基于第 3 版；默认已更新到第 4 版", "默认已更新")], empty: say("没有自己的提示词") });
  const reference = renderItemGroup({ glyph: "user", name: say("个人助理"), description: say("你每天对话的助理"), where: say("Molis Work 自带的个人助理，这里只是引用"), end: inUse(say("在用")), label: say("它的提示词"),
    children: [promptRow(say, "提纲要求", "写作工具 · 没有归属角色，默认归个人助理", "默认")], empty: say("没有自己的提示词") });
  const none = renderItemGroup({ glyph: "user", name: say("审阅者"), description: say("只读地检查改动"), where: say("现在没有地方用它"), end: renderStatusMark({ label: say("已停用"), tone: "quiet", state: "paused" }), label: say("它的提示词"),
    children: [], empty: say("没有自己的提示词") });
  return section("item-group", say("条目组 / Item Group"), `<div class="mw-catalog__specimens">
    ${specimen(say("父行可选中，子条目缩进列在下面"), `<ul class="mw-item-groups">${editor}</ul>`)}
    ${specimen(say("引用行与没有子条目"), `<ul class="mw-item-groups">${reference}${none}</ul>`)}
  </div>`);
}

