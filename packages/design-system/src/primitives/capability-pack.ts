// The parts of an AI kit page (docs/design/capability-pack/README.md「组件板新增」, decided by the user 2026-11-09: scheme A, eight
// parts after the D track's review), on top of 08's list and detail and item rows (catalog-skill-packs.ts). The board shows them
// (catalog-capability-packs.ts) and the 「能力包」 settings page draws them (apps/workbench/src/browser/kit): one set of rules and
// renderers for both. Every control inside them is an existing one (button, status mark, badge, menu); the rules only place them,
// on tokens only. Browser-safe: a page's program imports this file alone (`@molis-ai/molis-work-design-system/capability-pack`).
import { cx, escapeHtml, icon, renderAttrs, renderButton, renderStateRing, type AttrValue, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderMenu } from "./overlay.js";

export const CAPABILITY_PACK_STYLES = `
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

  /* 3 · Compact cells: each a button with a name, a code name and one tag; two columns where the room is narrow. */
  .mw-cells { container: mw-cells / inline-size; min-width: 0; }
  .mw-cells > ul { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr)); gap: 6px; margin: 0; padding: 0; list-style: none; }
  @container mw-cells (max-width: 480px) {
    .mw-cells > ul { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    /* Two narrow columns: the tag goes under the name, so the name keeps the cell's width. */
    .mw-cell { flex-wrap: wrap; row-gap: 4px; padding-block: 8px; }
    .mw-cell__name { flex-basis: 100%; }
  }
  .mw-cell { appearance: none; display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0; min-height: 44px; margin: 0; padding: 6px 10px; border: 0; border-radius: var(--r-row, 10px); background: var(--paper); box-shadow: inset 0 0 0 1px var(--line); color: inherit; font: inherit; text-align: start; cursor: pointer; transition: background-color var(--dur-hover) var(--ease-quint); }
  .mw-cell:hover { background: var(--nav-hover); }
  .mw-cell[aria-current="true"] { background: var(--nav-active); }
  .mw-cell:active { background: var(--nav-press); }
  .mw-cell:focus-visible { outline: var(--focus-stroke); outline-offset: -2px; }
  .mw-cell__name { display: grid; flex: 1 1 auto; min-width: 0; }
  .mw-cell__name > :is(strong, code) { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .mw-cell__name > strong { color: var(--ink); font-size: 13px; font-weight: var(--weight-control, 500); }
  .mw-cell__name > code { color: var(--muted); font-size: 11px; }
  .mw-cell > .mw-badge { flex: none; white-space: nowrap; }

  /* 4 · List and detail, third level: back to the entry it came from (the same button as 08's __back), then the path. */
  .mw-list-detail__trail { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; min-width: 0; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
  .mw-list-detail__trail > .mw-btn { max-width: calc(100% + 8px); height: auto; margin-left: -8px; white-space: normal; text-align: start; overflow-wrap: anywhere; }
  .mw-list-detail__path { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 6px; min-width: 0; margin: 0; padding: 0; list-style: none; color: var(--muted); font-size: 12px; }
  .mw-list-detail__path > li { min-width: 0; overflow-wrap: anywhere; }
  .mw-list-detail__path > li + li::before { content: "/"; margin-right: 6px; color: var(--faint); }
  .mw-list-detail__path > [aria-current] { color: var(--ink-soft); }

  /* 5 · Icon counts: one glyph and one number per kind; the whole name on hover (title) and for a screen reader (its own words). */
  .mw-counts { display: flex; flex-wrap: wrap; gap: 2px 10px; min-width: 0; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .mw-count { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }
  .mw-count > svg { width: 12px; height: 12px; flex: none; }

  /* 6 · State rows: one row per state, its name and what it means, its status mark, and where it is changed. Laid out by the list's
     own width: under 520px the words take a line and the state and the way there share the next; under 320px one each. */
  .mw-state-rows { container: mw-state-rows / inline-size; display: grid; gap: 1px; min-width: 0; margin: 0; padding: 0; list-style: none; border-radius: var(--r-row, 10px); overflow: hidden; background: var(--line); }
  .mw-state-rows > li { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) auto; align-items: center; gap: 10px; min-height: 52px; padding: 8px 10px 8px 12px; background: var(--paper); }
  .mw-state-row__what { display: grid; gap: 1px; min-width: 0; }
  .mw-state-row__what > strong { color: var(--ink); font-size: 13px; font-weight: var(--weight-control, 500); }
  .mw-state-row__what > small { color: var(--muted); font-size: 12px; line-height: 1.4; }
  .mw-state-row__state { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; min-width: 0; }
  .mw-state-row__state > .mw-status { height: auto; min-height: 22px; white-space: normal; text-align: start; }
  .mw-state-row__state > small { color: var(--muted); font-size: 12px; }
  .mw-state-row__go { justify-self: end; }
  @container mw-state-rows (max-width: 520px) {
    .mw-state-rows > li { grid-template-columns: minmax(0, 1fr) auto; row-gap: 6px; }
    .mw-state-row__what { grid-column: 1 / -1; }
  }
  @container mw-state-rows (max-width: 320px) {
    .mw-state-rows > li { grid-template-columns: minmax(0, 1fr); }
    .mw-state-row__go { justify-self: start; }
  }

  /* 7 · Usage: a figure only when there are recent uses, one line of what it counts, and under them what the count covers. */
  .mw-usage { display: grid; gap: 6px; min-width: 0; }
  .mw-usage__figure { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .mw-usage__num { min-width: 40px; color: var(--ink); font-size: 24px; font-weight: var(--weight-title, 600); line-height: 1; font-variant-numeric: tabular-nums; }
  .mw-usage__text { display: grid; gap: 2px; min-width: 0; color: var(--ink-soft); font-size: 13px; line-height: 1.45; }
  .mw-usage__text > strong { color: var(--ink); font-weight: var(--weight-control, 500); }
  .mw-usage__scope { margin: 0; max-width: 640px; color: var(--muted); font-size: 12px; line-height: 1.55; }

  /* 9 · A text count (batch 41): under a long text field, how to write it on the left and how much is written on the right; the
     count turns to the warning colour once it is over. */
  .mw-text-count { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; min-width: 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
  .mw-text-count__hint { min-width: 0; }
  .mw-text-count__n { flex: none; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .mw-text-count__n[data-over] { color: var(--red); font-weight: var(--weight-control, 500); }

  /* 10 · A leave bar (batch 41): unsaved changes and the person is going elsewhere; asked once, in place above the form, never a dialog. */
  .mw-leave-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; min-width: 0; padding: 10px 12px; border-radius: var(--r-card, 12px); background: var(--surface-soft); box-shadow: inset 0 0 0 1px var(--line-strong); color: var(--ink); font-size: 13px; line-height: 1.5; }
  .mw-leave-bar__text { flex: 1 1 160px; min-width: 0; margin: 0; }
  .mw-leave-bar__actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; }
  .mw-leave-bar:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; }
  .mw-leave-bar[data-tone="attention"] { background: var(--amber-soft); animation: craft-rise var(--dur-move) var(--ease-quint); }

  /* 11 · An adopt bar (batch 42, docs/design/skill-improvement): at the foot of a draft, the main act first, then the others, then one
     sentence of where it stands; while a step is owed, a save is under way or failed, the sentence carries a mark. Asking once more
     (the replay differs) is a leave bar in the attention tone above it, in place, never a dialog. */
  .mw-adopt-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; min-width: 0; padding-top: 12px; border-top: 1px solid var(--line); }
  .mw-adopt-bar__status { display: inline-flex; align-items: flex-start; gap: 6px; flex: 1 1 160px; min-width: 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
  .mw-adopt-bar__status[data-state="owed"] { color: var(--ink-soft); }
  .mw-adopt-bar__status[data-state="failed"] { color: var(--tone-blocked); }
  .mw-adopt-bar__status > svg { flex: none; width: 14px; height: 14px; margin-top: 2px; color: var(--muted); }
  .mw-adopt-bar__status[data-state="failed"] > svg { color: var(--tone-blocked); }
  .mw-adopt-bar__status .mw-state-ring { flex: none; margin-top: 2px; }
  .mw-adopt-stack { display: grid; gap: 10px; min-width: 0; }

  /* 12 · A replay grid (batch 42): one row per entry (the Assistant, Coding), one column per version (the one in use, the draft); each
     cell its verdict, where it differs and the way to its result. Narrow, each cell takes the row and names its column itself. */
  .mw-replay-grid { container: mw-replay-grid / inline-size; display: grid; gap: 6px; min-width: 0; }
  .mw-replay-grid__row { display: grid; grid-template-columns: minmax(84px, 120px) repeat(var(--mw-replay-cols, 2), minmax(0, 1fr)); gap: 6px; align-items: stretch; min-width: 0; }
  .mw-replay-grid__head > span { padding: 0 2px; color: var(--muted); font-size: 12px; }
  .mw-replay-grid__entry { display: inline-flex; align-items: flex-start; gap: 6px; padding-top: 10px; color: var(--ink); font-size: 13px; font-weight: var(--weight-control, 500); }
  .mw-replay-grid__entry > svg { flex: none; width: 14px; height: 14px; margin-top: 2px; color: var(--muted); }
  .mw-replay-cell { display: grid; gap: 6px; align-content: start; min-width: 0; padding: 10px 12px; border-radius: var(--r-card, 12px); background: var(--paper); box-shadow: inset 0 0 0 1px var(--line); }
  .mw-replay-cell[data-verdict="match"] { box-shadow: inset 0 0 0 1px var(--line), inset 3px 0 0 var(--tone-done); }
  .mw-replay-cell[data-verdict="differs"] { box-shadow: inset 0 0 0 1px var(--line), inset 3px 0 0 var(--tone-attention); }
  .mw-replay-cell .mw-status { max-width: 100%; height: auto; min-height: 22px; white-space: normal; }
  .mw-replay-cell > .mw-btn { justify-self: start; }
  .mw-replay-cell__col { display: none; color: var(--muted); font-size: 11px; }
  .mw-replay-cell__diffs { display: grid; gap: 2px; margin: 0; padding-left: 18px; color: var(--ink-soft); font-size: 12px; line-height: 1.5; }
  @container mw-replay-grid (max-width: 480px) {
    .mw-replay-grid__row { grid-template-columns: minmax(0, 1fr); }
    .mw-replay-grid__head { display: none; }
    .mw-replay-grid__entry { padding-top: 4px; }
    .mw-replay-cell__col { display: block; }
  }

  /* 13 · An ask row (batch 42): one sentence to the Assistant about the text being written, and after it how much it changed. */
  .mw-ask-row { display: grid; margin: 0; gap: 6px; min-width: 0; padding: 10px 12px; border-radius: var(--r-card, 12px); background: var(--surface-soft); box-shadow: inset 0 0 0 1px var(--line); }
  .mw-ask-row > label { display: inline-flex; align-items: center; gap: 6px; color: var(--ink); font-size: 13px; font-weight: var(--weight-control, 500); }
  .mw-ask-row > label > svg { width: 14px; height: 14px; color: var(--accent); }
  .mw-ask-row__line { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; }
  .mw-ask-row__line > .mw-input { flex: 1 1 200px; min-width: 0; }
  .mw-ask-row__go { display: inline-flex; flex: none; }
  .mw-ask-row__after { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0; animation: craft-rise var(--dur-move) var(--ease-quint); }
  .mw-ask-row__after:empty { display: none; }

  /* 14 · A placeholder list (batch 42): what a general Skill leaves to fill, one per row, the placeholder on the left and the person's own on the right. */
  .mw-placeholders { container: mw-placeholders / inline-size; display: grid; gap: 8px; min-width: 0; padding: 12px; border-radius: var(--r-card, 12px); box-shadow: inset 0 0 0 1px var(--line); }
  .mw-placeholders__title { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0; color: var(--muted); font-size: 12px; font-weight: var(--weight-control, 500); }
  .mw-placeholders > p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
  .mw-placeholders > ul { display: grid; grid-template-columns: fit-content(45%) 16px minmax(0, 1fr); gap: 6px 8px; margin: 0; padding: 0; list-style: none; }
  .mw-placeholders li { display: grid; grid-column: 1 / -1; grid-template-columns: subgrid; align-items: center; min-width: 0; }
  .mw-placeholders li > code { color: var(--ink-soft); font-size: 12px; overflow-wrap: anywhere; }
  .mw-placeholders li > svg { width: 14px; height: 14px; color: var(--muted); }
  @container mw-placeholders (max-width: 420px) { .mw-placeholders > ul { grid-template-columns: minmax(0, 1fr); } .mw-placeholders li { grid-template-columns: minmax(0, 1fr); gap: 4px; } .mw-placeholders li > svg { display: none; } }

  /* 8 · List and detail with the detail kept in view, only where a page asks (data-sticky-detail): it stays at the top of the
     scrolling area and scrolls itself when taller; at its end the scroll goes on to the page (no overscroll containment). The
     area's height comes from the settings shell (--settings-view-h); outside it, the window's. One side at a time, it is in flow. */
  .mw-list-detail[data-sticky-detail] .mw-list-detail__detail { position: sticky; top: 16px; max-height: calc(var(--settings-view-h, 100dvh) - 32px); overflow-y: auto; }
  @container mw-list-detail (max-width: 640px) { .mw-list-detail[data-sticky-detail] .mw-list-detail__detail { position: static; max-height: none; overflow: visible; } }
  /* A titled group inside a detail (an entry's usage, a pack's roles), quiet heading over its body. */
  .mw-list-detail__group { display: grid; gap: 8px; min-width: 0; }
  .mw-list-detail__group > .mw-items { width: 100%; }
  .mw-list-detail__group > h4 { margin: 0; color: var(--muted); font-size: 12px; font-weight: var(--weight-control, 500); }

  @media (prefers-reduced-motion: reduce) { :is(.mw-item-group__head, .mw-cell) { transition: none; } }
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

/** 3 · Compact cells: the whole cell is the button; the name and its code name (left out when it is the name) are cut on one line each, whole on hover. */
export function renderCells(cells: ReadonlyArray<{ name: string; code?: string; tag: string; current?: boolean; attrs?: Record<string, AttrValue> }>): string {
  return `<div class="mw-cells" data-slot="cells"><ul>${cells.map((cell) => `<li><button type="button" class="mw-cell" title="${escapeHtml(cell.code ? `${cell.name} · ${cell.code}` : cell.name)}"${cell.current ? ' aria-current="true"' : ""}${
    renderAttrs(cell.attrs)}><span class="mw-cell__name"><strong>${escapeHtml(cell.name)}</strong>${cell.code ? `<code>${escapeHtml(cell.code)}</code>` : ""}</span>${cell.tag}</button></li>`).join("")}</ul></div>`;
}

/** 4 · The third level's way back and its path; the button is 08's `__back`, the last step of the path is where the person is. */
export function renderDetailTrail(options: { up: string; path: readonly string[]; label: string; attrs?: Record<string, AttrValue> }): string {
  const up = renderButton({ label: options.up, variant: "ghost", size: "sm", icon: "chevron-left", className: "mw-list-detail__up", attrs: { "data-list-up": true, ...options.attrs } });
  const steps = options.path.map((step, index) => `<li${index === options.path.length - 1 ? ' aria-current="page"' : ""}>${escapeHtml(step)}</li>`).join("");
  return `<nav class="mw-list-detail__trail" aria-label="${escapeHtml(options.label)}">${up}<ol class="mw-list-detail__path">${steps}</ol></nav>`;
}

/** 5 · Icon counts. `name` is the whole name a count stands for ("3 个技能"), given on hover and to a screen reader. */
export function renderIconCounts(counts: ReadonlyArray<{ glyph: PluginIconName; value: string; name: string }>): string {
  return `<span class="mw-counts" data-slot="counts">${counts.map((count) => `<span class="mw-count" title="${escapeHtml(count.name)}">${icon(count.glyph)}<span aria-hidden="true">${
    escapeHtml(count.value)}</span><span class="mw-sr-only">${escapeHtml(count.name)}</span></span>`).join("")}</span>`;
}

/** 6 · State rows: one per state, each with its own mark and, when it is changed elsewhere, the way there. */
export function renderStateRows(rows: ReadonlyArray<{ name: string; meaning: string; mark: string; fact?: string; go?: string }>): string {
  return `<ul class="mw-state-rows" data-slot="state-rows">${rows.map((row) => `<li><span class="mw-state-row__what"><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.meaning)}</small></span><span class="mw-state-row__state">${
    row.mark}${row.fact ? `<small>${escapeHtml(row.fact)}</small>` : ""}</span>${row.go ? `<span class="mw-state-row__go">${row.go}</span>` : ""}</li>`).join("")}</ul>`;
}

/** 7 · Usage: `figure` only with recent uses (no number stands for "only the last one"); `scope` says what the count covers. */
export function renderUsage(options: { figure?: number; head: string; last?: string; scope?: string }): string {
  const figure = options.figure === undefined ? "" : `<span class="mw-usage__num">${options.figure}</span>`;
  return `<div class="mw-usage" data-slot="usage"><div class="mw-usage__figure">${figure}<span class="mw-usage__text"><strong>${escapeHtml(options.head)}</strong>${
    options.last ? `<span>${escapeHtml(options.last)}</span>` : ""}</span></div>${options.scope ? `<p class="mw-usage__scope">${escapeHtml(options.scope)}</p>` : ""}</div>`;
}

/**
 * 9 · A text count: `hint` says how to write the field (`hintId` lets the field name it as its description), `count` how much is
 * written against its limit; `over` once past it. The count is not announced as it changes: the field's own error says it is over.
 */
export function renderTextCount(options: { hint: string; count: string; over?: boolean; hintId?: string; attrs?: Record<string, AttrValue> }): string {
  return `<p class="mw-text-count" data-slot="text-count"${renderAttrs(options.attrs)}><span class="mw-text-count__hint"${options.hintId ? ` id="${escapeHtml(options.hintId)}"` : ""}>${escapeHtml(options.hint)}</span><span class="mw-text-count__n"${options.over ? " data-over" : ""}>${escapeHtml(options.count)}</span></p>`;
}

/** Already rendered HTML: only the output of `renderButton`, `renderStatusMark`, `renderBadge` and the like, never a person's text. */
type RenderedHtml = string;

/**
 * 10 · A leave bar: what is unsaved, then the ways on (`actions`: buttons, the main one last, as in every row of actions). It takes the
 * focus where it appears and is named by its own sentence (`id` when a page shows more than one). `tone: "attention"` asks once more
 * about something the person is waiting on (an adopt whose replay differs): the same bar on the attention tint, arriving in place.
 */
export function renderLeaveBar(options: { text: string; actions: RenderedHtml; id?: string; tone?: "attention"; attrs?: Record<string, AttrValue> }): string {
  const id = escapeHtml(options.id ?? "mw-leave-bar-text");
  return `<div class="mw-leave-bar" data-slot="leave-bar" role="group" aria-labelledby="${id}" tabindex="-1"${options.tone ? ` data-tone="${options.tone}"` : ""}${renderAttrs(options.attrs)}><p class="mw-leave-bar__text" id="${id}">${escapeHtml(options.text)}</p><div class="mw-leave-bar__actions">${options.actions}</div></div>`;
}
/**
 * 11 · An adopt bar: the main act (`primary`), the others (`actions`), then `status`, one sentence of where it stands. `state` marks
 * that sentence: `owed` (a step is still owed before the main act, and the sentence says which), `saving`, or `failed` (the last
 * change was not saved; the blocked tone and a mark, never grey words alone). The sentence keeps its node across saves, so a page
 * updates its text (`[data-adopt-status]`) rather than redrawing it; it is announced only when owed or failed. `confirm` is asked once
 * above it, in place: a leave bar in the attention tone with its sentence and two ways on; while it is shown, the page lowers the
 * bar's own main act to a secondary one, so there is one main act in view.
 */
export function renderAdoptBar(options: { primary: RenderedHtml; actions?: RenderedHtml; status: string; state?: "owed" | "saving" | "failed";
  confirm?: { text: string; actions: RenderedHtml; id?: string }; attrs?: Record<string, AttrValue> }): string {
  const mark = options.state === "owed" ? icon("info") : options.state === "failed" ? icon("alert") : options.state === "saving" ? renderStateRing({ state: "running" }) : "";
  const announced = options.state === "owed" || options.state === "failed";
  const bar = `<div class="mw-adopt-bar" data-slot="adopt-bar"${renderAttrs(options.attrs)}>${options.primary}${options.actions ?? ""}<span class="mw-adopt-bar__status"${
    options.state ? ` data-state="${options.state}"` : ""}${announced ? ` role="${options.state === "failed" ? "alert" : "status"}"` : ""}>${mark}<span data-adopt-status>${escapeHtml(options.status)}</span></span></div>`;
  if (!options.confirm) return bar;
  return `<div class="mw-adopt-stack">${renderLeaveBar({ text: options.confirm.text, actions: options.confirm.actions, id: options.confirm.id ?? "mw-adopt-confirm-text", tone: "attention" })}${bar}</div>`;
}

export type ReplayVerdict = "match" | "differs" | "unknown" | "none";
export interface ReplayCell { column: string; verdict: ReplayVerdict; mark: RenderedHtml; differences?: readonly string[]; action?: RenderedHtml }
/**
 * 12 · A replay grid: `columns` names each version, each row one entry with its cells in the same order. A cell is its verdict's
 * `mark` (a status mark), where the result differs, and its `action` (the way to the result).
 */
export function renderReplayGrid(options: { label: string; columns: readonly string[]; rows: ReadonlyArray<{ entry: string; icon: PluginIconName; cells: readonly ReplayCell[] }> }): string {
  const head = `<div class="mw-replay-grid__row mw-replay-grid__head" aria-hidden="true"><span></span>${options.columns.map((column) => `<span>${escapeHtml(column)}</span>`).join("")}</div>`;
  const rows = options.rows.map((row) => `<div class="mw-replay-grid__row" role="group" aria-label="${escapeHtml(row.entry)}"><span class="mw-replay-grid__entry">${icon(row.icon)}${escapeHtml(row.entry)}</span>${row.cells.map((cell) =>
    `<div class="mw-replay-cell" data-verdict="${escapeHtml(cell.verdict)}"><span class="mw-replay-cell__col" aria-hidden="true">${escapeHtml(cell.column)}</span><span class="mw-sr-only">${escapeHtml(cell.column)}</span>${cell.mark}${
      cell.differences?.length ? `<ul class="mw-replay-cell__diffs">${cell.differences.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}${cell.action ?? ""}</div>`).join("")}</div>`).join("");
  return `<div class="mw-replay-grid" data-slot="replay-grid" role="group" aria-label="${escapeHtml(options.label)}" style="--mw-replay-cols:${options.columns.length}">${head}${rows}</div>`;
}

/**
 * 13 · An ask row: a form with a labelled one-line field and its submit button (`go`, a `type="submit"` button, so Enter is the
 * button), or, while the Assistant works, `busy` (a status mark) in the button's place. While busy the field is read-only and
 * `aria-busy`, never disabled, so the focus stays in it; when the change is in, the page keeps the focus there. `after` is what it
 * changed (a badge and the way to see it). The button's place and `after` are live regions, so both are heard as they change.
 */
export function renderAskRow(options: { id: string; label: string; placeholder: string; value?: string; go: RenderedHtml; busy?: RenderedHtml; after?: RenderedHtml;
  inputAttrs?: Record<string, AttrValue>; attrs?: Record<string, AttrValue> }): string {
  return `<form class="mw-ask-row" data-slot="ask-row"${renderAttrs(options.attrs)}><label for="${escapeHtml(options.id)}">${icon("sparkles")}${escapeHtml(options.label)}</label><div class="mw-ask-row__line"><input class="mw-input" data-slot="input" type="text" autocomplete="off" id="${
    escapeHtml(options.id)}" placeholder="${escapeHtml(options.placeholder)}" value="${escapeHtml(options.value ?? "")}"${options.busy ? ' readonly aria-busy="true"' : ""}${renderAttrs(options.inputAttrs)}><span class="mw-ask-row__go" role="status">${
    options.busy ?? options.go}</span></div><p class="mw-ask-row__after" role="status">${options.after ?? ""}</p></form>`;
}

/**
 * 14 · A placeholder list: each placeholder a general Skill writes beside the person's own word for it (`attrs` on each field), each
 * field named by its placeholder and `name` (“replace … with”), not by the bare placeholder; `badge` says how many are left, `after`
 * holds what goes with the list (a choice about the original). The title is a label, not a heading: the page owns its outline.
 */
export function renderPlaceholderList(options: { id: string; title: string; lead: string; badge?: RenderedHtml; name: string;
  rows: ReadonlyArray<{ placeholder: string; value: string; hint: string; attrs?: Record<string, AttrValue> }>; after?: RenderedHtml }): string {
  const id = escapeHtml(options.id);
  return `<section class="mw-placeholders" data-slot="placeholders" aria-labelledby="${id}-title"><p class="mw-placeholders__title" id="${id}-title">${escapeHtml(options.title)}${options.badge ?? ""}</p><p>${
    escapeHtml(options.lead)}</p><span class="mw-sr-only" id="${id}-name">${escapeHtml(options.name)}</span><ul>${options.rows.map((row, index) =>
    `<li><code id="${id}-${index}">${escapeHtml(row.placeholder)}</code>${icon("arrow")}<input class="mw-input" data-slot="input" type="text" autocomplete="off" value="${escapeHtml(row.value)}" placeholder="${
      escapeHtml(row.hint)}" aria-labelledby="${id}-name ${id}-${index}"${renderAttrs(row.attrs)}></li>`).join("")}</ul>${options.after ?? ""}</section>`;
}
export { renderMenuGroup, renderMenuItem } from "./overlay.js";
