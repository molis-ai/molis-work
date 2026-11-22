import { renderButton, type MwButtonOptions } from "./button.js";
import { type AttrValue, cx, escapeHtml, renderAttrs } from "./html.js";
import { icon, type PluginIconName } from "./icon.js";

/**
 * The parts of a project's first page (specs/screen-polish §八之二): one column to read and a margin of sources beside it. The
 * platform's home is written in these. The frame itself (`mw-first-page` > `__grid` > `__column`, then the margin, and the quiet
 * `__meta` line over the title) is three elements the page's server template writes; `FIRST_PAGE_STYLES` lays them out.
 *
 * - `renderFirstPageSection`: a small ruled heading and whatever is under it. Rows under it are the platform's presentation rows
 *   (`renderPresentationForm` with `compactTime`), which `FIRST_PAGE_STYLES` lays out as time, owner, name and state on one line.
 * - `renderFirstPageNext`: at most three next steps side by side, each with one button; the caller makes one of them primary.
 * - `renderFirstPageMargin` and `renderFirstPageSource`: where the page's facts come from, one source a line, one word for whose turn.
 * - `renderProgressSegments`: a real count as five small segments beside its numbers.
 *
 * Names and sentences are plain text and are escaped here; `html` fields are the caller's own markup. `FIRST_PAGE_STYLES` is the one
 * style sheet for all of it: a page includes it once, beside the design system's own styles.
 */

type Attrs = Record<string, AttrValue>;

export function renderFirstPageSection(options: { title: string; note?: string; body: string; attrs?: Attrs }): string {
  return `<section class="mw-first-page__section"${renderAttrs(options.attrs)}><h2>${escapeHtml(options.title)}${options.note ? `<small>${escapeHtml(options.note)}</small>` : ""}</h2>${options.body}</section>`;
}

/** A step's name, one line of why, and its button. `button.variant` is the caller's: one primary on the page, the rest at rest. */
export function renderFirstPageNext(steps: readonly { title: string; why?: string; button?: MwButtonOptions; html?: string; attrs?: Attrs }[], options: { start?: boolean } = {}): string {
  return `<div class="${cx("mw-first-page__next", options.start && "is-start")}">${steps.map(step =>
    `<div class="mw-first-page__step"${renderAttrs(step.attrs)}><b>${escapeHtml(step.title)}</b>${step.why ? `<span>${escapeHtml(step.why)}</span>` : ""}${
      step.button ? renderButton(step.button) : ""}${step.html ?? ""}</div>`).join("")}</div>`;
}

export type FirstPageTurn = "idle" | "changed" | "waiting" | "blocked";

/**
 * One source in the margin. `index` is the number the page's sentences cite it by; `word` says whose turn it is, and `turn` colours it
 * (only "waiting" is warm). `control` makes the name a button; `after` is the caller's markup after the word (a retry, an enable).
 */
export function renderFirstPageSource(options: { index?: number | string; icon?: PluginIconName; name: string; word: string; turn?: FirstPageTurn;
  control?: Attrs; after?: string; attrs?: Attrs }): string {
  const name = options.control ? `<button type="button" class="mw-first-page__source-name"${renderAttrs(options.control)}>${escapeHtml(options.name)}</button>`
    : `<b class="mw-first-page__source-name">${escapeHtml(options.name)}</b>`;
  return `<div class="mw-first-page__source"${renderAttrs(options.attrs)}><sup>${options.index === undefined ? "" : escapeHtml(String(options.index))}</sup>${icon(options.icon ?? "package")}${name}<span class="mw-first-page__word" data-turn="${options.turn ?? "idle"}">${escapeHtml(options.word)}${options.after ?? ""}</span></div>`;
}

export function renderFirstPageMargin(options: { title: string; note?: string; sources: string; rest?: string; foot?: string; attrs?: Attrs }): string {
  return `<aside class="mw-first-page__margin" aria-label="${escapeHtml(options.title)}"${renderAttrs(options.attrs)}><div class="mw-first-page__margin-head">${escapeHtml(options.title)}${
    options.note ? `<small>${escapeHtml(options.note)}</small>` : ""}</div>${options.sources}${options.rest ? `<div class="mw-first-page__rest">${escapeHtml(options.rest)}</div>` : ""}${options.foot ?? ""}</aside>`;
}

/** `done` of `total` as five segments and the two numbers; the label is what a screen reader hears. */
export function renderProgressSegments(options: { done: number; total: number; label: string }): string {
  const lit = options.total > 0 ? Math.min(5, Math.max(options.done > 0 ? 1 : 0, Math.floor(options.done / options.total * 5))) : 0;
  return `<span class="mw-first-page__progress" role="img" aria-label="${escapeHtml(options.label)}"><span class="mw-first-page__segments" aria-hidden="true">${
    [0, 1, 2, 3, 4].map(at => `<i${at < lit ? ' class="is-on"' : ""}></i>`).join("")}</span><small aria-hidden="true">${options.done} / ${options.total}</small></span>`;
}

export const FIRST_PAGE_STYLES = `
.mw-first-page{container-type:inline-size;min-inline-size:0;color:var(--ink)}
.mw-first-page__grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,640px) 56px 216px minmax(0,1fr);align-content:start;min-inline-size:0}
.mw-first-page__column{grid-column:2;min-inline-size:0}
.mw-first-page__margin{grid-column:4;min-inline-size:0;padding-block-start:76px;font-size:12px;line-height:1.5;color:var(--muted)}
.mw-first-page__meta{display:flex;align-items:center;gap:4px;min-block-size:28px;font-size:12px;color:var(--muted)}
.mw-first-page__grow{flex:1}
.mw-first-page__version{appearance:none;display:inline-flex;align-items:center;gap:4px;min-block-size:24px;margin-inline-end:4px;padding:0 6px 0 8px;border:0;border-radius:8px;background:var(--control-fill);color:var(--ink-soft);font:inherit;white-space:nowrap;cursor:pointer}
.mw-first-page__version svg{inline-size:12px;block-size:12px}
@media (hover:hover) and (pointer:fine){.mw-first-page__version:hover{color:var(--ink)}}
.mw-first-page h1{margin:2px 0 0;font-size:30px;font-weight:600;line-height:1.3;letter-spacing:-.01em;overflow-wrap:anywhere;text-wrap:balance}
.mw-first-page__lede{margin:14px 0 0;font-size:17px;line-height:1.8;text-wrap:pretty;overflow-wrap:anywhere}
.mw-first-page__lede sup,.mw-first-page__source sup{font-size:11px;font-weight:600;color:var(--faint);font-variant-numeric:tabular-nums}
.mw-first-page__lede sup{margin-inline-start:1px;vertical-align:.5em;line-height:0}
.mw-first-page__lede .is-yours{text-decoration:underline;text-decoration-color:var(--amber);text-decoration-thickness:2px;text-underline-offset:5px}
.mw-first-page__lede .is-new{background:color-mix(in srgb,var(--accent) 14%,transparent);border-radius:4px;box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 14%,transparent)}
.mw-first-page__lede .is-gap{color:var(--muted);border-block-end:1px dashed var(--line-strong)}
.mw-first-page__facts{margin:12px 0 0;font-size:13px;line-height:1.6;color:var(--ink-soft);overflow-wrap:anywhere}
.mw-first-page__ask{display:flex;align-items:center;gap:16px;margin:14px 0 0;padding:14px 16px;border:1px dashed var(--line-strong);border-radius:12px;color:var(--ink-soft)}
.mw-first-page__ask>span{flex:1;min-inline-size:0}
.mw-first-page__ask .mw-btn{flex:none}
.mw-first-page__section{min-inline-size:0}
.mw-first-page__section>h2{display:flex;align-items:center;gap:10px;margin:22px 0 2px;font-size:12px;font-weight:600;line-height:1.5;color:var(--muted)}
.mw-first-page__section>h2 small{font-size:12px;font-weight:400;color:var(--faint)}
.mw-first-page__section>h2::after{content:"";flex:1;block-size:1px;background:var(--line)}
.mw-first-page__quiet{margin:6px 0 0;font-size:12px;line-height:1.6;color:var(--muted)}
.mw-first-page__rows{display:grid;min-inline-size:0}
.mw-first-page__row{position:relative;min-inline-size:0}
.mw-first-page__row .mw-presentation--row{min-inline-size:0}
.mw-first-page__row .mw-presentation--row .mw-item{display:grid;grid-template-columns:72px 14px minmax(0,1fr) auto;grid-template-areas:"time owner name end";align-items:center;gap:10px;min-block-size:32px;padding:0;border:0;border-radius:6px;background:none;box-shadow:none}
.mw-first-page__row:has(>.mw-first-page__progress){display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px}
.mw-first-page__row[data-first-page-depth] .mw-presentation--row .mw-item{grid-template-columns:14px minmax(0,1fr) auto auto;grid-template-areas:"ring name word end";min-block-size:30px}
.mw-first-page__row[data-first-page-depth] .mw-item>span:first-child{display:none}
.mw-first-page__row[data-first-page-depth] :is(.mw-item__end,.mw-status){display:contents}
.mw-first-page__row[data-first-page-depth] .mw-status>svg{grid-area:ring;inline-size:14px;block-size:14px}
.mw-first-page__row[data-first-page-depth] .mw-status>span{grid-area:word;font-size:12px;white-space:nowrap}
.mw-first-page__row[data-first-page-depth] .mw-status>svg:is([data-ring-family=running],[data-ring-family=done])+span{position:absolute;inline-size:1px;block-size:1px;overflow:hidden;clip-path:inset(50%)}
.mw-first-page__row[data-first-page-depth] .mw-presentation__controls{grid-area:end}
.mw-first-page__row[data-first-page-depth="1"] .mw-presentation--row .mw-item{padding-inline-start:24px;color:var(--ink-soft)}
.mw-first-page__row .mw-item>span:first-child{grid-area:owner;display:grid;place-items:center}
.mw-first-page__row .mw-presentation__owner{inline-size:14px;block-size:14px;border-radius:0;background:none;color:var(--muted)}
.mw-first-page__row .mw-presentation__owner svg{inline-size:14px;block-size:14px}
.mw-first-page__row .mw-presentation__row-title{grid-area:name;min-inline-size:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:4px}
.mw-first-page__row .mw-presentation__row-title strong{font-weight:500}
.mw-first-page__row[data-first-page-depth="1"] .mw-presentation__row-title strong{font-weight:400}
.mw-first-page__row .mw-item__end{grid-area:end;display:inline-flex;align-items:center;gap:8px;min-inline-size:0}
.mw-first-page__row .mw-presentation__fields{display:contents}
.mw-first-page__row .mw-presentation__field{display:none}
.mw-first-page__row .mw-presentation__field:is([data-presentation-role=updated_at],[data-presentation-role=happened_at]){display:block;grid-area:time;font-size:11px;color:var(--faint);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mw-first-page__row .mw-presentation__field time{white-space:nowrap}
.mw-first-page__row[data-first-page-depth] .mw-presentation__field{display:none}
.mw-first-page__row .mw-status{min-block-size:0;padding:0;border:0;background:none;font-size:12px;font-weight:400;color:var(--muted)}
.mw-first-page__row>.mw-presentation__more{position:absolute;inset-block-start:2px;inset-inline-end:0;background:var(--paper);border-radius:8px;opacity:0}
.mw-first-page__row>.mw-presentation__more>summary{min-block-size:28px;min-inline-size:28px}
.mw-first-page__row:is(:hover,:focus-within)>.mw-presentation__more,.mw-first-page__row>.mw-presentation__more[open]{opacity:1}
@media (hover:none),(pointer:coarse){
  .mw-first-page__row:has(>.mw-presentation__more){padding-inline-end:36px}
  .mw-first-page__row>.mw-presentation__more{opacity:1}
}
.mw-first-page__progress{display:inline-flex;align-items:center;gap:8px}
.mw-first-page__progress small{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.mw-first-page__segments{display:inline-flex;gap:2px}
.mw-first-page__segments i{inline-size:14px;block-size:4px;border-radius:2px;background:var(--line-strong)}
.mw-first-page__segments i.is-on{background:var(--accent)}
.mw-first-page__next{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;padding-block-start:6px}
.mw-first-page__next.is-start{margin-block-start:18px}
.mw-first-page__step{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-inline-size:0}
.mw-first-page__step>b{max-inline-size:100%;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mw-first-page__step>span{max-inline-size:100%;font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mw-first-page__step .mw-btn{margin-block-start:8px}
.mw-first-page__margin-head{display:flex;align-items:baseline;gap:8px;min-block-size:24px;font-weight:600}
.mw-first-page__margin-head small{font-size:12px;font-weight:400;color:var(--faint)}
.mw-first-page__source{display:grid;grid-template-columns:10px 14px minmax(0,1fr) auto;align-items:center;gap:6px;min-block-size:26px}
.mw-first-page__source>svg{inline-size:14px;block-size:14px}
.mw-first-page__source-name{min-inline-size:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:inherit;font-weight:400;color:var(--ink-soft);text-align:start}
button.mw-first-page__source-name{appearance:none;border:0;padding:0;background:none;border-radius:4px;cursor:pointer}
@media (hover:hover) and (pointer:fine){button.mw-first-page__source-name:hover{color:var(--ink);text-decoration:underline;text-underline-offset:3px}}
.mw-first-page__word{color:var(--faint);white-space:nowrap}
.mw-first-page__word[data-turn=waiting]{color:var(--amber);font-weight:600}
.mw-first-page__word[data-turn=blocked]{color:var(--red)}
.mw-first-page__word[data-turn=changed]{color:var(--accent-strong)}
.mw-first-page__link{appearance:none;border:0;padding:0;background:none;font:inherit;color:var(--ink-soft);text-decoration:underline;text-underline-offset:3px;cursor:pointer;border-radius:4px}
.mw-first-page__rest{display:flex;align-items:center;min-block-size:26px;padding-inline-start:16px;color:var(--faint)}
.mw-first-page__add{margin-block-start:12px;padding-block-start:10px;border-block-start:1px solid var(--line);line-height:1.6}
.mw-first-page__all{display:flex;align-items:center;gap:8px;margin-block-start:12px;color:var(--ink-soft)}
.mw-first-page kbd{font:inherit;font-size:11px;padding:0 5px;border-radius:5px;background:var(--control-fill);color:var(--muted)}
@media (max-width:760px),(pointer:coarse){button.mw-first-page__source-name,.mw-first-page__link{min-block-size:28px}}
@container (max-width:980px){
  .mw-first-page__grid{grid-template-columns:minmax(0,1fr) minmax(0,640px) minmax(0,1fr)}
  .mw-first-page__margin{grid-column:2;margin-block-start:28px;padding-block-start:14px;border-block-start:1px solid var(--line)}
}
@container (max-width:560px){
  .mw-first-page h1{font-size:24px}
  .mw-first-page__lede{font-size:15px}
  .mw-first-page__next{grid-template-columns:minmax(0,1fr);gap:14px}
  .mw-first-page__row:not([data-first-page-depth]) .mw-presentation--row .mw-item{grid-template-columns:14px minmax(0,1fr) auto auto;grid-template-areas:"owner name time end";gap:8px}
  .mw-first-page__row:not([data-first-page-depth]) .mw-status>span{position:absolute;inline-size:1px;block-size:1px;overflow:hidden;clip-path:inset(50%)}
  .mw-first-page__ask{flex-direction:column;align-items:flex-start}
}
`;
