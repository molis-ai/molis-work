// The two component-board parts added by the work-records design (docs/design/work-records/README.md「组件板新增」, decided by the
// user 2026-11-04): the kind-coloured mark (an item row's 32px mark in one of the five --mark-* hues so the five record kinds read
// apart alongside their distinct glyphs) and the category bar (an 8px proportional bar with a legend across the five record kinds
// plus files). Shared by the component board (catalog-work-records.ts) and the 「工作记录」 settings section. Browser-safe: imports
// only the Plugin SDK's plain-string UI helpers and erased types.
import { cx, escapeHtml, icon, renderAttrs, type AttrValue, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { MwContentMarkId } from "../palette.js";

export type MwKindMarkHue = MwContentMarkId;
export type MwCategoryBarHue = MwContentMarkId | "muted";

export interface MwKindMarkOptions {
  readonly icon: PluginIconName;
  readonly hue?: MwKindMarkHue;
  readonly className?: string;
  readonly attrs?: Record<string, AttrValue>;
}

export interface MwCategorySegment {
  readonly hue: MwCategoryBarHue;
  readonly label: string;
  readonly value: number;
  readonly formatted: string;
}

export interface MwCategoryBarOptions {
  readonly label: string;
  readonly segments: readonly MwCategorySegment[];
  readonly className?: string;
  readonly attrs?: Record<string, AttrValue>;
}

export const WORK_RECORD_STYLES = `
  /* 1 · Kind-coloured mark: the five --mark-* hues (blue, plum, slate, ochre, clay) pair with five distinct glyphs so record kinds
     separate at a glance without turning colour into the sole carrier of meaning. */
  .mw-mark[data-hue] { box-shadow: none; }
  .mw-mark[data-hue="blue"], .mw-mark--blue { background: var(--mark-blue-fill); color: var(--mark-blue); box-shadow: none; }
  .mw-mark[data-hue="plum"], .mw-mark--plum { background: var(--mark-plum-fill); color: var(--mark-plum); box-shadow: none; }
  .mw-mark[data-hue="slate"], .mw-mark--slate { background: var(--mark-slate-fill); color: var(--mark-slate); box-shadow: none; }
  .mw-mark[data-hue="ochre"], .mw-mark--ochre { background: var(--mark-ochre-fill); color: var(--mark-ochre); box-shadow: none; }
  .mw-mark[data-hue="clay"], .mw-mark--clay { background: var(--mark-clay-fill); color: var(--mark-clay); box-shadow: none; }

  /* 2 · Category bar: an 8px multi-segment bar with a wrapping legend of names and tabular figures. Zero-value categories stay in
     the legend so nothing disappears when a kind has no records yet, while only positive values take room in the track. */
  .mw-cat-bar { display: grid; gap: 10px; min-width: 0; }
  .mw-stat > .mw-cat-bar { margin-top: 12px; }
  .mw-cat-bar__track { display: flex; gap: 2px; height: 8px; border-radius: 999px; overflow: hidden; background: var(--line); }
  .mw-cat-bar__seg { display: block; min-width: 4px; height: 100%; background: var(--cat-hue, var(--muted)); }
  .mw-cat-bar__legend { display: flex; flex-wrap: wrap; gap: 4px 16px; min-width: 0; margin: 0; padding: 0; list-style: none; color: var(--ink-soft); font-size: 12px; line-height: 1.5; }
  .mw-cat-bar__legend > li { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; }
  .mw-cat-bar__legend > li::before { content: ""; width: 8px; height: 8px; flex: none; border-radius: 2px; background: var(--cat-hue, var(--muted)); }
  .mw-cat-bar__legend > li > span { min-width: 0; overflow-wrap: anywhere; }
  .mw-cat-bar__legend b { flex: none; color: var(--ink); font-weight: var(--weight-control, 500); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .mw-cat-bar [data-hue="blue"] { --cat-hue: var(--mark-blue); }
  .mw-cat-bar [data-hue="plum"] { --cat-hue: var(--mark-plum); }
  .mw-cat-bar [data-hue="slate"] { --cat-hue: var(--mark-slate); }
  .mw-cat-bar [data-hue="ochre"] { --cat-hue: var(--mark-ochre); }
  .mw-cat-bar [data-hue="clay"] { --cat-hue: var(--mark-clay); }
  .mw-cat-bar [data-hue="muted"] { --cat-hue: var(--muted); }

  @media (forced-colors: active) {
    .mw-mark[data-hue] { outline: 1px solid ButtonText; outline-offset: -1px; }
    .mw-cat-bar__track { outline: 1px solid GrayText; outline-offset: -1px; }
    .mw-cat-bar__seg, .mw-cat-bar__legend > li::before { forced-color-adjust: none; background: Highlight; outline: 1px solid Canvas; outline-offset: -1px; }
  }
`;

/** 1 · A 32px glyph square: neutral when `hue` is omitted, or tinted in one of the five `--mark-*` hues. */
export function renderKindMark(options: MwKindMarkOptions): string {
  const hueClass = options.hue ? `mw-mark--${options.hue}` : undefined;
  return `<span class="${cx("mw-mark", hueClass, options.className)}" data-slot="mark"${options.hue ? ` data-hue="${options.hue}"` : ""} aria-hidden="true"${renderAttrs(options.attrs)}>${icon(options.icon)}</span>`;
}

/** 2 · A proportional category bar with its legend of category names and formatted figures. */
export function renderCategoryBar(options: MwCategoryBarOptions): string {
  const positive = options.segments.filter((segment) => Number.isFinite(segment.value) && segment.value > 0);
  const track = positive.map((segment) => `<i class="mw-cat-bar__seg" data-hue="${segment.hue}" style="flex:${segment.value}"></i>`).join("");
  const legend = options.segments.map((segment) => `<li data-hue="${segment.hue}"><span>${escapeHtml(segment.label)}</span><b>${escapeHtml(segment.formatted)}</b></li>`).join("");
  return `<div class="${cx("mw-cat-bar", options.className)}" data-slot="category-bar"${renderAttrs(options.attrs)}><div class="mw-cat-bar__track" role="img" aria-label="${escapeHtml(options.label)}">${track}</div><ul class="mw-cat-bar__legend">${legend}</ul></div>`;
}
