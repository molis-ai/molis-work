// The catalog board's composed patterns: button groups, tag input, drop zone, stat tiles, item and settings rows, and the data
// table. They live on the board first: the styles below are the board's own (not in the served sheets), read the interface's semantic
// tokens with Soft Workbench's values as fallbacks, and move into the page sheets with the first product page that uses them.
import { icon, renderButton, renderCheckbox, renderInput, renderInputGroup, renderProgress, renderStatusMark, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderMenu, renderMenuItem } from "./overlay.js";
import { resolveCatalogSay, section, specimen, type CatalogSay } from "./catalog-parts.js";

const SURFACE = "border: 1px solid var(--line); border-radius: var(--r-card); background: var(--paper)";
const RADIUS = "var(--r-control)";
/**
 * A button in a group, directly or inside its menu anchor, optionally only at one end. The skin layer restates every button's
 * corner at (0,4,1); one id-weight `:not` lets a joined button keep its flat side.
 */
const joined = (end = "") => `:root body .mw-btn-group > .mw-btn${end}:not(#mw-joined), :root body .mw-btn-group > *${end} > .mw-btn:not(#mw-joined)`;

/**
 * Item rows (`mw-items`, `mw-item`): a list on its own surface, one row each, its end holding a state or a control. On the board,
 * and in the workbench sheet since the platform's reads area on a plugin page draws its categories with them.
 */
export const ITEM_ROW_STYLES = `
  .mw-items { display: grid; grid-template-columns: minmax(0, 1fr); width: min(480px, 100%); margin: 0; padding: 6px; list-style: none; ${SURFACE}; }
  .mw-item { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 6px 6px 6px 10px; border-radius: var(--r-row); transition: background-color var(--dur-hover, 130ms) var(--ease-quint); }
  .mw-item:is(:hover, :focus-within) { background: var(--nav-hover); }
  /* An item is one line: its name, then where it lives in muted words, cut first when room runs out. */
  .mw-item > span:nth-child(2) { display: flex; align-items: baseline; gap: 8px; flex: 1 1 auto; min-width: 0; }
  .mw-item strong { flex: 0 1 auto; min-width: 0; overflow: hidden; color: var(--ink); font-size: 13px; font-weight: var(--weight-control, 500); text-overflow: ellipsis; white-space: nowrap; }
  .mw-item small { flex: 1 1 0; min-width: 0; margin: 0; overflow: hidden; color: var(--muted); font-size: 12px; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
  .mw-item__end { display: flex; align-items: center; gap: 8px; flex: none; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }`;

/** The glyph square at an item row's start (`mw-mark`): in the composer's patterns and, alone, in the design kit. */
export const MARK_STYLES = `
  .mw-mark { display: inline-grid; place-items: center; width: 32px; height: 32px; flex: none; border-radius: var(--r-control); background: var(--paper); box-shadow: inset 0 0 0 1px var(--line); color: var(--ink-soft); }
  .mw-mark svg { width: 16px; height: 16px; }`;

/**
 * The patterns the unified input's shell is built from (implementation-plan.md §3.6, K2): the button group's joined corners, the
 * tag, the mark and the upload rows. Served in the workbench sheet with the composer (`COMPOSER_STYLES`); the board reads them too.
 */
export const COMPOSER_PATTERN_STYLES = `${MARK_STYLES}
  .mw-btn-group { display: inline-flex; gap: 1px; }
  ${joined()} { border-radius: 0; }
  ${joined(":first-child")} { border-start-start-radius: ${RADIUS}; border-end-start-radius: ${RADIUS}; }
  ${joined(":last-child")} { border-start-end-radius: ${RADIUS}; border-end-end-radius: ${RADIUS}; }
  .mw-btn-group > :focus-visible, .mw-btn-group > * > :focus-visible { position: relative; z-index: 1; }
  .mw-btn-group .mw-compose__menu { left: auto; right: 0; }
  .mw-tag { display: inline-flex; align-items: center; gap: 2px; height: 24px; padding: 0 3px 0 8px; border: 0; border-radius: var(--r-tag); background: var(--paper); box-shadow: 0 0 0 1px var(--line), var(--lift-1); color: var(--ink); font: inherit; font-size: 12px; font-weight: var(--weight-control, 500); white-space: nowrap; }
  .mw-tag button { display: inline-grid; place-items: center; width: 18px; height: 18px; padding: 0; border: 0; border-radius: var(--r-tag); background: none; color: var(--muted); cursor: pointer; }
  .mw-tag button:is(:hover, :focus-visible) { background: var(--nav-hover); color: var(--ink); }
  .mw-tag button:focus-visible { outline: var(--focus-stroke); outline-offset: 0; }
  .mw-tag svg { width: 12px; height: 12px; }
  .mw-uploads { display: grid; gap: 2px; width: min(440px, 100%); margin: 0; padding: 0; list-style: none; }
  .mw-upload { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 6px 4px 6px 8px; border-radius: var(--r-row); }
  .mw-upload > span:nth-child(2) { display: grid; gap: 6px; flex: 1; min-width: 0; font-size: 13px; color: var(--ink); }
  .mw-upload small { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .mw-upload small.is-failed { color: var(--red); }`;

export const CATALOG_PATTERN_STYLES = `
  .mw-btn-group__count { display: inline-flex; align-items: center; padding: 0 12px; border-radius: 0 ${RADIUS} ${RADIUS} 0; background: var(--control-fill); box-shadow: inset 0 0 0 1px var(--control-border); color: var(--ink-soft); font-size: 13px; font-variant-numeric: tabular-nums; }
  .mw-tag--add { gap: 4px; padding: 0 8px 0 6px; background: none; box-shadow: inset 0 0 0 1px var(--line); color: var(--ink-soft); cursor: pointer; }
  .mw-tag--add:is(:hover, :focus-visible) { background: var(--nav-hover); color: var(--ink); }
  .mw-tag--add:focus-visible { outline: var(--focus-stroke, 2px solid var(--accent)); outline-offset: 1px; }
  .mw-catalog .mw-popover .mw-catalog__row { flex-wrap: nowrap; }
  .mw-catalog .mw-popover .mw-input { flex: 1; min-width: 220px; }


  .mw-tags.mw-input-group { flex-wrap: wrap; gap: 6px; width: min(420px, 100%); height: auto; padding-block: 4px; cursor: text; }
  :root body .mw-tags.mw-input-group:not(#mw-joined) { border-radius: min(${RADIUS}, 18px); }
  .mw-tags .mw-input { flex: 1 0 96px; width: auto; min-height: 24px; }
  .mw-tags__suggest { display: flex; flex-wrap: wrap; gap: 8px; }

  .mw-drop { display: grid; justify-items: center; gap: 4px; width: min(440px, 100%); padding: 28px 20px; border: 1px dashed var(--line-strong); border-radius: var(--r-card); background: color-mix(in srgb, var(--ink) 2%, transparent); text-align: center; transition: border-color var(--dur-hover, 130ms) var(--ease-quint), background-color var(--dur-hover, 130ms) var(--ease-quint); }
  .mw-drop .mw-mark { margin-bottom: 8px; transition: transform var(--dur-move, 250ms) var(--ease-quint), color var(--dur-hover, 130ms); }
  .mw-drop p { margin: 0; font-size: 13px; color: var(--ink); }
  .mw-drop p + p { font-size: 12px; color: var(--muted); }
  .mw-drop .mw-btn--link { min-height: 0; padding: 0; vertical-align: baseline; }
  .mw-drop[data-dropping] { border-style: solid; border-color: var(--accent); background: color-mix(in srgb, var(--accent) 5%, transparent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 12%, transparent); }
  .mw-drop[data-dropping] .mw-mark { background: var(--accent); box-shadow: none; color: var(--on-accent); transform: translateY(-3px); }
  .mw-drop[data-drop-refused] { border-color: var(--red); background: color-mix(in srgb, var(--red) 5%, transparent); }
  .mw-drop[data-drop-refused] .mw-mark { color: var(--red); }
  .mw-drop--compact { grid-template-columns: auto minmax(0, 1fr); justify-items: start; gap: 0 12px; width: min(280px, 100%); padding: 12px 14px; text-align: left; }
  .mw-drop--compact .mw-mark { grid-row: span 2; margin: 0; }
  .mw-drop--compact[data-dropping] .mw-mark { transform: none; }

  .mw-stats { width: min(880px, 100%); container-type: inline-size; }
  .mw-stats > div { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  @container (max-width: 720px) { .mw-stats > div { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @container (max-width: 400px) { .mw-stats > div { grid-template-columns: minmax(0, 1fr); } }
  .mw-stat { display: grid; align-content: start; gap: 4px; padding: 16px; ${SURFACE}; }
  .mw-stat > p { margin: 0; font-size: 12px; color: var(--muted); }
  .mw-stat strong { font-size: 24px; line-height: 32px; font-weight: var(--weight-title, 600); color: var(--ink); letter-spacing: -.01em; }
  .mw-stat strong small { margin-left: 4px; font-size: 13px; font-weight: var(--weight-control, 500); letter-spacing: 0; color: var(--muted); }
  .mw-stat__delta { display: flex; align-items: center; gap: 6px; min-height: 20px; font-size: 12px; color: var(--muted); }
  .mw-stat__delta .mw-badge { gap: 2px; padding: 0 6px 0 4px; font-variant-numeric: tabular-nums; }
  .mw-stat__delta svg { width: 12px; height: 12px; }
  .mw-stat svg.mw-stat__trend { display: block; width: 100%; height: 36px; margin-top: 12px; overflow: visible; }
  .mw-stat__trend :is(polyline, line) { fill: none; stroke: var(--line-strong); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
  .mw-stat__trend polyline + polyline { stroke: var(--accent); }
  /* The latest point: a zero-length stroke stays round however the line is stretched; the first draws the surface ring. */
  .mw-stat__trend line { stroke: var(--paper); stroke-width: 10; }
  .mw-stat__trend line + line { stroke: var(--accent); stroke-width: 6; }
  .mw-stat .mw-progress { margin-top: 16px; }

${ITEM_ROW_STYLES}

  .mw-dt { display: grid; width: min(880px, 100%); overflow: hidden; ${SURFACE}; }
  .mw-dt--small { width: min(420px, 100%); }
  .mw-dt__bar { display: flex; align-items: center; gap: 8px; min-height: 52px; padding: 10px 12px; transition: background-color var(--dur-hover, 130ms) var(--ease-quint); }
  .mw-dt__bar > div { display: flex; flex: 1; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
  .mw-dt__bar .mw-input-group { flex: 0 1 240px; }
  .mw-dt__bar > div > span, .mw-dt__foot { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .mw-dt__bar > div > span:last-child { margin-left: auto; }
  .mw-dt__bar > div > strong { margin-right: 4px; color: var(--ink); font-size: 13px; font-weight: var(--weight-control, 500); }
  .mw-dt:not([data-picked]) .mw-dt__bulk, .mw-dt[data-picked] .mw-dt__bar > div:not(.mw-dt__bulk) { display: none; }
  .mw-dt[data-picked] .mw-dt__bar { background: color-mix(in srgb, var(--accent) 6%, transparent); }
  /* The accessible column label is positioned within the table's own scroller. */
  .mw-dt__scroll { position: relative; overflow-x: auto; }
  .mw-dt table { width: 100%; min-width: 600px; border-collapse: collapse; font-size: 13px; }
  .mw-dt--small table { min-width: 0; }
  .mw-dt th { height: 36px; padding: 0 12px; background: color-mix(in srgb, var(--ink) 2.5%, transparent); box-shadow: inset 0 1px 0 var(--line), inset 0 -1px 0 var(--line); color: var(--muted); font-size: 12px; font-weight: var(--weight-control, 500); text-align: left; white-space: nowrap; }
  .mw-dt td { height: 44px; padding: 0 12px; color: var(--ink-soft); white-space: nowrap; }
  .mw-dt tbody tr + tr td { box-shadow: inset 0 1px 0 var(--line); }
  .mw-dt tbody tr { transition: background-color var(--dur-hover, 130ms) var(--ease-quint); }
  .mw-dt tbody tr:is(:hover, :focus-within) { background: var(--nav-hover); }
  .mw-dt tbody tr[aria-selected="true"] { background: color-mix(in srgb, var(--accent) 7%, transparent); }
  .mw-dt__scroll:first-child th { box-shadow: inset 0 -1px 0 var(--line); }
  .mw-dt:not(.mw-dt--small) :is(th, td):first-child { width: 20px; padding-right: 0; }
  .mw-dt :is(th, td):last-child:not(:first-child, :nth-child(2)) { width: 32px; padding-left: 0; }
  .mw-dt .is-num { text-align: right; font-variant-numeric: tabular-nums; }
  .mw-dt td > div { display: flex; align-items: center; gap: 12px; }
  .mw-dt td > div > span:last-child { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  .mw-dt td strong { color: var(--ink); font-weight: var(--weight-control, 500); }
  .mw-dt td small { color: var(--muted); font-size: 12px; }
  .mw-dt th button { display: inline-flex; align-items: center; gap: 4px; height: 26px; margin: 0 -6px; padding: 0 6px; border: 0; border-radius: 6px; background: none; color: inherit; font: inherit; cursor: pointer; }
  .mw-dt th button:is(:hover, :focus-visible) { background: var(--nav-hover); color: var(--ink); }
  .mw-dt th button:focus-visible { outline: var(--focus-stroke, 2px solid var(--accent)); outline-offset: -1px; }
  .mw-dt th button svg { width: 12px; height: 12px; }
  .mw-dt th[aria-sort="ascending"] button svg { transform: rotate(180deg); }
  .mw-dt th:not([aria-sort$="ending"]) button svg { display: none; }
  .mw-dt th[aria-sort$="ending"] { color: var(--ink); }
  .mw-dt .mw-skeleton { height: 10px; }
  .mw-dt__foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 48px; padding: 0 8px 0 16px; box-shadow: inset 0 1px 0 var(--line); }
  .mw-dt__empty { display: grid; justify-items: center; gap: 12px; padding: 36px 20px 40px; box-shadow: inset 0 1px 0 var(--line); text-align: center; }
  .mw-dt__empty p { margin: 0; color: var(--ink); font-size: 13px; font-weight: var(--weight-control, 500); }
`;

const ghostIcon = (label: string, name: PluginIconName, attrs: Record<string, string | boolean> = {}) =>
  renderButton({ label, variant: "ghost", size: "icon", icon: name, iconOnly: true, attrs });
const splitMenu = (variant: "primary" | "secondary", items: string, moreLabel: string) => `<div class="mw-compose__anchor">${renderButton({
  label: moreLabel, variant, size: "icon", icon: "chevron-down", iconOnly: true,
  attrs: { "data-compose-menu-toggle": "", "aria-expanded": "false", "aria-haspopup": "menu" },
})}<div class="mw-compose__menu" data-compose-menu hidden>${renderMenu({ items })}</div></div>`;

export function buttonGroupSection(say: CatalogSay = resolveCatalogSay()): string {
  const group = (label: string, body: string) => `<div class="mw-btn-group" role="group" aria-label="${label}">${body}</div>`;
  const icons = (items: Array<[string, PluginIconName]>) => items.map(([label, name]) => renderButton({ label, variant: "secondary", size: "icon", icon: name, iconOnly: true })).join("");
  const moreOptions = say("workbench.catalog-board.ex.pat-more-options");
  const publish = group(say("workbench.catalog-board.ex.pat-publish"), renderButton({ label: say("workbench.catalog-board.ex.pat-publish"), variant: "primary" }) + splitMenu("primary",
    renderMenuItem({ label: say("workbench.catalog-board.ex.pat-schedule-publish"), iconName: "clock" }) + renderMenuItem({ label: say("workbench.catalog-board.ex.pat-save-draft"), iconName: "save" }),
    moreOptions,
  ));
  const exporter = group(say("workbench.catalog-board.ex.pat-export"), renderButton({ label: say("workbench.catalog-board.ex.pat-export"), variant: "secondary", icon: "download" }) + splitMenu("secondary",
    renderMenuItem({ label: "PDF", iconName: "file" }) + renderMenuItem({ label: "Markdown", iconName: "text" }) + renderMenuItem({ label: say("workbench.catalog-board.ex.pat-web-page"), iconName: "globe" }),
    moreOptions,
  ));
  return section("button-group", "Button Group / Split Button", `<div class="mw-catalog__specimens">${specimen(say("workbench.catalog-board.ex.pat-grouped"),
    group(say("workbench.catalog-board.ex.pat-history"), icons([[say("workbench.catalog-board.ex.pat-undo"), "undo"], [say("workbench.catalog-board.ex.pat-redo"), "redo"]]))
    + group(say("workbench.catalog-board.ex.pat-pagination"), icons([[say("workbench.catalog-board.ex.pat-previous"), "chevron-left"], [say("workbench.catalog-board.ex.pat-next"), "chevron-right"]]))
    + group(say("workbench.catalog-board.ex.pat-file-actions"), renderButton({ label: say("workbench.catalog-board.ex.pat-copy"), variant: "secondary", icon: "copy" }) + renderButton({ label: say("workbench.catalog-board.ex.pat-pin"), variant: "secondary", icon: "pin" }) + renderButton({ label: say("workbench.catalog-board.ex.pat-share"), variant: "secondary", icon: "share" })),
  )}${specimen(say("workbench.catalog-board.ex.pat-split-button"), publish + exporter)}${specimen(say("workbench.catalog-board.ex.pat-with-count"), group(say("workbench.catalog-board.ex.pat-star"), renderButton({ label: say("workbench.catalog-board.ex.pat-star"), variant: "secondary", icon: "star" }) + `<span class="mw-btn-group__count" aria-label="${say("workbench.catalog-board.ex.pat-star-count", { count: 128 })}">128</span>`))}</div>`);
}

export function tagInputSection(say: CatalogSay = resolveCatalogSay()): string {
  const tag = (label: string) => `<span class="mw-tag">${label}<button type="button" data-tag-remove aria-label="${say("workbench.catalog-board.ex.pat-tag-remove", { label })}">${icon("x")}</button></span>`;
  const suggest = (label: string) => `<button type="button" class="mw-tag mw-tag--add" data-tag-add="${label}">${icon("plus")}${label}</button>`;
  const initialTags = [
    say("workbench.catalog-board.ex.pat-tag-design"),
    say("workbench.catalog-board.ex.pat-tag-research"),
    say("workbench.catalog-board.ex.pat-tag-q3"),
  ];
  const suggestedTags = [
    say("workbench.catalog-board.ex.pat-tag-weekly"),
    say("workbench.catalog-board.ex.pat-tag-customer"),
    say("workbench.catalog-board.ex.pat-tag-tbd"),
  ];
  return section("tag-input", "Tag Input", `<div class="mw-catalog__specimens">${specimen(say("workbench.catalog-board.ex.pat-tags"), `<div class="mw-tags mw-input-group" data-tags>${
    initialTags.map(tag).join("")
  }${renderInput({ placeholder: say("workbench.catalog-board.ex.pat-tag-placeholder"), attrs: { "aria-label": say("workbench.catalog-board.ex.pat-tag-add-label"), "data-tags-input": "" } })}</div><div class="mw-tags__suggest">${suggestedTags.map(suggest).join("")}</div>`)}</div>`);
}

export function dropZoneSection(say: CatalogSay = resolveCatalogSay()): string {
  const zone = (attrs: string, mark: PluginIconName, title: string, meta: string, compact = false) =>
    `<div class="mw-drop${compact ? " mw-drop--compact" : ""}"${attrs}><span class="mw-mark">${icon(mark)}</span><p>${title}</p><p>${meta}</p></div>`;
  const pick = `${say("workbench.catalog-board.ex.pat-drop-prefix")} ${renderButton({ label: say("workbench.catalog-board.ex.pat-drop-choose"), variant: "link" })}`;
  const compact = zone(" data-drop-live", "paperclip", pick, say("workbench.catalog-board.ex.pat-drop-limit"), true)
    + zone(" data-dropping", "upload", say("workbench.catalog-board.ex.pat-drop-release"), say("workbench.catalog-board.ex.pat-drop-count", { count: 3 }), true)
    + zone(" data-drop-refused", "x", say("workbench.catalog-board.ex.pat-drop-no-folders"), say("workbench.catalog-board.ex.pat-drop-accepted-short"), true);
  const upload = (mark: PluginIconName, name: string, body: string, end: string, sample = false) =>
    `<li class="mw-upload"${sample ? " data-drop-sample" : ""}><span class="mw-mark">${icon(mark)}</span><span>${name}${body}</span>${end}</li>`;
  const interviewName = say("workbench.catalog-board.ex.pat-file-interview");
  const sketchName = say("workbench.catalog-board.ex.pat-file-sketch");
  const reportName = say("workbench.catalog-board.ex.pat-file-annual-report");
  return section("drop-zone", "Drop Zone", `<div class="mw-catalog__specimens">${specimen(say("workbench.catalog-board.ex.pat-drop-specimen"), zone(" data-drop-live", "upload", pick, say("workbench.catalog-board.ex.pat-drop-meta")))}${
    specimen(say("workbench.context-onboarding.compact"), compact)}${
    specimen(say("workbench.catalog-board.ex.pat-upload"), `<ul class="mw-uploads" data-drop-list>${
      upload("note", interviewName, renderProgress({ value: 62, label: say("workbench.catalog-board.ex.pat-upload-progress", { name: interviewName, percent: 62 }) }), `<small>62%</small>${ghostIcon(say("workbench.catalog-board.ex.pat-upload-cancel", { name: interviewName }), "x")}`)
      + upload("image", sketchName, "<small>820 KB</small>", renderStatusMark({ label: say("workbench.catalog-board.ex.pat-uploaded"), state: "done", tone: "done" }), true)
      + upload("file", reportName, `<small class="is-failed">${say("workbench.catalog-board.ex.pat-exceeds-limit")}</small>`, renderButton({ label: say("common.control.retry"), variant: "ghost", size: "sm" }))
    }</ul>`)}</div>`);
}

/** A 12-point trend, older weeks in the recessive line and the latest step in the accent (dataviz: stat tile `trend`). */
function trend(values: number[], label: string): string {
  const low = Math.min(...values), high = Math.max(...values);
  const points = values.map((value, index) => [Math.round((index / (values.length - 1)) * 200), Math.round(28 - ((value - low) / (high - low || 1)) * 24)] as const);
  const line = (list: ReadonlyArray<readonly [number, number]>) => `<polyline points="${list.map(([x, y]) => `${x},${y}`).join(" ")}"/>`;
  const [x, y] = points[points.length - 1]!;
  const dot = `<line x1="${x}" y1="${y}" x2="${x}" y2="${y}"/>`;
  return `<svg class="mw-stat__trend" viewBox="0 0 200 32" preserveAspectRatio="none" role="img" aria-label="${label}">${line(points.slice(0, -1))}${line(points.slice(-2))}${dot}${dot}</svg>`;
}

export function statSection(say: CatalogSay = resolveCatalogSay()): string {
  const vsLastWeek = say("workbench.catalog-board.ex.pat-stat-vs-last-week");
  const delta = (tone: "success" | "danger", up: boolean, text: string) =>
    `<p class="mw-stat__delta"><span class="mw-badge mw-badge--${tone}">${icon(up ? "chevron-up" : "chevron-down")}${text}</span>${vsLastWeek}</p>`;
  const tile = (label: string, value: string, body: string) => `<article class="mw-stat"><p>${label}</p><strong>${value}</strong>${body}</article>`;
  return section("stat", "Stat", `<div class="mw-catalog__specimens">${specimen(say("workbench.catalog-board.ex.pat-stat-cards"), `<div class="mw-stats"><div>${
    tile(say("workbench.catalog-board.ex.pat-stat-done-week"), "128", delta("success", true, "12%") + trend([62, 70, 66, 74, 81, 77, 88, 93, 90, 104, 114, 128], say("workbench.catalog-board.ex.pat-stat-done-trend")))
    + tile(say("workbench.catalog-board.ex.pat-stat-failed-runs"), "7", delta("danger", true, "3") + trend([4, 6, 3, 5, 4, 2, 3, 5, 4, 3, 4, 7], say("workbench.catalog-board.ex.pat-stat-failed-trend")))
    + tile(say("workbench.catalog-board.ex.pat-stat-avg-duration"), `4.2<small>${say("workbench.catalog-board.ex.pat-unit-min")}</small>`, delta("success", false, "8%") + trend([7.1, 6.8, 6.9, 6.2, 5.9, 6.1, 5.4, 5.2, 4.9, 4.8, 4.6, 4.2], say("workbench.catalog-board.ex.pat-stat-duration-trend")))
    + tile(say("workbench.catalog-board.ex.pat-stat-local-storage"), "4.2<small>/ 10 GB</small>", `<p class="mw-stat__delta">${say("workbench.catalog-board.ex.pat-stat-remaining", { amount: "5.8 GB" })}</p>${renderProgress({ value: 42, label: say("workbench.catalog-board.ex.pat-stat-used-pct", { percent: 42 }) })}`)
  }</div></div>`)}</div>`);
}

export function rowsSection(say: CatalogSay = resolveCatalogSay()): string {
  const item = (mark: PluginIconName, title: string, meta: string, end: string) =>
    `<li class="mw-item"><span class="mw-mark">${icon(mark)}</span><span><strong>${title}</strong><small>${meta}</small></span><span class="mw-item__end">${end}</span></li>`;
  const more = (name: string) => ghostIcon(say("workbench.catalog-board.ex.pat-more-actions", { name }), "more");
  const reviewName = say("workbench.catalog-board.ex.pat-file-review");
  const sketchName = say("workbench.catalog-board.ex.pat-file-sketch");
  const customersName = say("workbench.catalog-board.ex.pat-file-customers");
  const items = `<ul class="mw-items">${
    item("file", reviewName, say("workbench.catalog-board.ex.pat-row-meta-review"), `${say("workbench.catalog-board.ex.pat-time-10m")}${more(reviewName)}`)
    + item("image", sketchName, say("workbench.catalog-board.ex.pat-row-meta-sketch"), renderStatusMark({ label: say("workbench.catalog-board.ex.pat-status-syncing"), state: "syncing", tone: "progress" }) + more(sketchName))
    + item("database", customersName, say("workbench.catalog-board.ex.pat-row-meta-customers"), renderStatusMark({ label: say("workbench.assistant-delivery.failed"), state: "failed", tone: "blocked" }) + renderButton({ label: say("common.control.retry"), variant: "ghost", size: "sm" }))
  }</ul>`;
  // A settings page's rows have their own section on the board (settings rows: the SDK's renderSettingRow and its kin).
  return section("rows", "Item Row", `<div class="mw-catalog__specimens">${specimen(say("workbench.catalog-board.ex.pat-items"), items)}</div>`);
}

type FileRow = { name: string; mark: PluginIconName; where: string; status: Parameters<typeof renderStatusMark>[0]; updated: string; minutes: number; size: string; bytes: number };

export function dataTableSection(say: CatalogSay = resolveCatalogSay()): string {
  const files: FileRow[] = [
    { name: say("workbench.catalog-board.ex.pat-file-review"), mark: "file", where: say("workbench.catalog-board.ex.pat-where-artifacts"), status: { label: say("workbench.catalog-board.ex.pat-status-synced"), state: "done", tone: "done" }, updated: say("workbench.catalog-board.ex.pat-time-10m"), minutes: 10, size: "2.4 MB", bytes: 2_400_000 },
    { name: say("workbench.catalog-board.ex.pat-file-sketch"), mark: "image", where: say("workbench.catalog-board.ex.pat-tag-design"), status: { label: say("workbench.catalog-board.ex.pat-status-syncing"), state: "syncing", tone: "progress" }, updated: say("workbench.catalog-board.ex.pat-time-1h"), minutes: 60, size: "820 KB", bytes: 820_000 },
    { name: say("workbench.catalog-board.ex.pat-file-customers"), mark: "database", where: say("workbench.catalog-board.ex.pat-where-import"), status: { label: say("workbench.assistant-delivery.failed"), state: "failed", tone: "blocked" }, updated: say("workbench.catalog-board.ex.pat-time-yesterday"), minutes: 1_440, size: "96 KB", bytes: 96_000 },
    { name: say("workbench.catalog-board.ex.pat-file-interview"), mark: "note", where: say("workbench.catalog-board.ex.pat-tag-research"), status: { label: say("workbench.catalog-board.ex.pat-status-synced"), state: "done", tone: "done" }, updated: say("workbench.catalog-board.ex.pat-time-3d"), minutes: 4_320, size: "1.1 MB", bytes: 1_100_000 },
    { name: say("workbench.catalog-board.ex.pat-file-checklist"), mark: "text", where: "Pages", status: { label: say("workbench.catalog-board.ex.pat-status-draft"), state: "draft", tone: "idle" }, updated: say("workbench.catalog-board.ex.pat-time-last-week"), minutes: 10_080, size: "12 KB", bytes: 12_000 },
  ];
  const sort = (key: string, label: string, order = "none", num = false) =>
    `<th aria-sort="${order}"${num ? ` class="is-num"` : ""}><button type="button" data-dt-sort="${key}">${label}${icon("chevron-down")}</button></th>`;
  const rows = files.map((file) => `<tr data-name="${file.name}" data-updated="${-file.minutes}" data-size="${file.bytes}">
    <td>${renderCheckbox({ attrs: { "aria-label": say("workbench.catalog-board.ex.pat-dt-select-row", { name: file.name }), "data-dt-pick": "" } })}</td>
    <td><div><span class="mw-mark">${icon(file.mark)}</span><span><strong>${file.name}</strong><small>${file.where}</small></span></div></td>
    <td>${renderStatusMark(file.status)}</td><td>${file.updated}</td><td class="is-num">${file.size}</td><td>${ghostIcon(say("workbench.catalog-board.ex.pat-more-actions", { name: file.name }), "more")}</td></tr>`).join("");
  const searchLabel = say("workbench.catalog-board.ex.pat-dt-search");
  const search = (value = "") => renderInputGroup({ start: icon("search"), control: renderInput({ type: "search", placeholder: searchLabel, value, attrs: { "aria-label": searchLabel } }) });
  const sampleQuery = say("workbench.catalog-board.ex.pat-dt-sample-query");
  const table = `<div class="mw-dt" data-dt><div class="mw-dt__bar"><div>${search()}${renderButton({ label: say("workbench.catalog-board.ex.pat-dt-status"), variant: "secondary", icon: "filter" })}<span>${say("workbench.catalog-board.ex.pat-dt-count-items", { count: files.length })}</span></div>
    <div class="mw-dt__bulk"><strong aria-live="polite"><span data-dt-count>0</span> ${say("workbench.catalog-board.ex.pat-dt-selected-suffix")}</strong>${renderButton({ label: say("workbench.catalog-board.ex.pat-dt-download"), variant: "secondary", icon: "download" })}${renderButton({ label: say("workbench.catalog-board.ex.pat-dt-archive"), variant: "secondary", icon: "archive" })}${
      renderButton({ label: say("workbench.catalog-board.ex.pat-dt-delete"), variant: "danger-outline", icon: "trash" })}<span>${renderButton({ label: say("workbench.catalog-board.ex.pat-dt-clear-selection"), variant: "ghost", attrs: { "data-dt-clear": "" } })}</span></div></div>
    <div class="mw-dt__scroll"><table><thead><tr><th>${renderCheckbox({ attrs: { "aria-label": say("workbench.catalog-board.ex.pat-dt-select-all"), "data-dt-all": "" } })}</th>${sort("name", say("workbench.catalog-board.ex.pat-dt-col-name"))}<th>${say("workbench.catalog-board.ex.pat-dt-status")}</th>${
      sort("updated", say("workbench.catalog-board.ex.pat-dt-col-updated"), "descending")}${sort("size", say("workbench.catalog-board.ex.pat-dt-col-size"), "none", true)}<th><span class="mw-sr-only">${say("workbench.catalog-board.ex.pat-dt-col-actions")}</span></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="mw-dt__foot"><span>${say("workbench.catalog-board.ex.pat-dt-page-range")}</span><div class="mw-btn-group" role="group" aria-label="${say("workbench.catalog-board.ex.pat-pagination")}">${
      renderButton({ label: say("workbench.catalog-board.ex.pat-dt-prev-page"), variant: "secondary", size: "icon", icon: "chevron-left", iconOnly: true, disabled: true })}${renderButton({ label: say("workbench.catalog-board.ex.pat-dt-next-page"), variant: "secondary", size: "icon", icon: "chevron-right", iconOnly: true })}</div></div></div>`;
  const skeleton = (width: number) => `<tr><td><span class="mw-skeleton" style="width:${width}%"></span></td><td><span class="mw-skeleton" style="width:56px"></span></td></tr>`;
  const loading = `<div class="mw-dt mw-dt--small" aria-busy="true"><div class="mw-dt__scroll"><table><thead><tr><th>${say("workbench.catalog-board.ex.pat-dt-col-name")}</th><th>${say("workbench.catalog-board.ex.pat-dt-col-updated")}</th></tr></thead><tbody>${[72, 54, 64].map(skeleton).join("")}</tbody></table></div></div>`;
  const empty = `<div class="mw-dt mw-dt--small"><div class="mw-dt__bar"><div>${search(sampleQuery)}</div></div><div class="mw-dt__empty"><span class="mw-mark">${icon("search")}</span><p>${say("workbench.catalog-board.ex.pat-dt-empty-match", { query: sampleQuery })}</p>${
    renderButton({ label: say("workbench.catalog-board.ex.pat-dt-clear-search"), variant: "secondary" })}</div></div>`;
  return section("data-table", "Data Table", `<div class="mw-catalog__specimens">${specimen(say("workbench.catalog-board.ex.pat-dt-specimen-files"), table)}${specimen(say("workbench.catalog-board.ex.pat-dt-specimen-loading"), loading)}${specimen(say("workbench.catalog-board.ex.pat-dt-specimen-empty"), empty)}</div>`);
}
