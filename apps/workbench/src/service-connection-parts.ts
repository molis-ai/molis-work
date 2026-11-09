import { t as uiText, escapeHtml, renderAttrs, renderButton, renderStatusMark } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderSteps } from "@molis-ai/molis-work-design-system";

/**
 * The three parts the service-connection decision (specs/assistant-service-connections §13.1, plan A of each block) adds to the
 * component board, written as the product will use them: a service row that opens in place, a step progress that says which
 * step it is, and the card that asks for a missing connection where it is missing and folds into one line once connected.
 * They only draw: what a step is, which account, and when a state changes are the caller's. The markup and the state names are
 * the contract (`data-open`, `data-state`); `SERVICE_CONNECTION_PART_STYLES` styles them, and the page program
 * (src/browser/service-connection-item.ts: `mountConnectionItems`, `updateConnectionProgress`, `startConnectionCard`,
 * `foldConnectionCard`) changes them in place. Every motion is on the shared durations and curve and stops under reduced motion.
 */
type Say = (text: string, values?: Record<string, string | number>) => string;

/** Where a connection's steps stand: under way, waiting on the service, refused, given up by the person, or all done. */
export type ConnectionProgressState = "running" | "hold" | "failed" | "cancelled" | "done";

export interface ConnectionProgressView {
  /** The steps' names in the person's words, e.g. 在浏览器登录 · 看能做什么 · 能用了. */
  readonly steps: readonly string[];
  /** The step the connection is on (0-based); ignored when `state` is `done`. */
  readonly at: number;
  readonly state: ConnectionProgressState;
  /** False for a progress that never changes on its page (a list of states): its line is then not a live region. */
  readonly live?: boolean;
}

const PROGRESS_SUFFIX: Record<ConnectionProgressState, string> = { running: "", hold: "等服务那边", failed: "没通过", cancelled: "取消了", done: "" };
const PROGRESS_CAPTION = "workbench.service-connection-parts.step-n-total-step";

/**
 * The step marks with one line after them that says the step, out of how many, and what it is. The line is a polite live
 * region, so a screen reader hears each step as `updateConnectionProgress` changes it in place; the marks only repeat it and are
 * hidden from it. The words a page needs to change it (the steps, the caption's one template, the words after a step that did
 * not go on) are drawn into it here, so the page never writes them again.
 */
export function renderConnectionProgress(view: ConnectionProgressView, L: Say): string {
  const total = view.steps.length, done = view.state === "done";
  const at = done ? total - 1 : Math.min(Math.max(view.at, 0), total - 1);
  const marks = `<span class="connection-progress__marks" aria-hidden="true">${renderSteps({ total, current: done ? total : at, label: uiText.text("workbench.service-connection-parts.connection-progress") })}</span>`;
  const suffix = PROGRESS_SUFFIX[view.state];
  const words = Object.fromEntries(Object.entries(PROGRESS_SUFFIX).filter(([, word]) => word).map(([state, word]) => [state, L(word)]));
  const data = `data-steps="${escapeHtml(JSON.stringify(view.steps))}" data-caption="${escapeHtml(uiText.text(PROGRESS_CAPTION))}" data-words="${escapeHtml(JSON.stringify(words))}"`;
  const caption = escapeHtml(uiText.text(PROGRESS_CAPTION, { n: at + 1, total, step: view.steps[at] ?? "" }));
  return `<div class="connection-progress" data-connection-progress data-state="${view.state}" ${data}>${marks}<p class="connection-progress__caption" tabindex="-1"${view.live === false ? "" : ' aria-live="polite"'}>${caption}${suffix ? ` <span class="connection-progress__state">· ${escapeHtml(L(suffix))}</span>` : ""}</p></div>`;
}

export interface ConnectionItemView {
  /** A page-unique id for the row; the open part is `<id>-body`. */
  readonly id: string;
  /** The service's mark (`renderConnectorMark`). */
  readonly mark: string;
  readonly name: string;
  readonly caption: string;
  /** The row's state, already drawn (a `settings-state` word, or a running `mw-status`). */
  readonly state: string;
  /** What opens under the row: the connection's steps, its result, or what it can do now. */
  readonly body: string;
  readonly open?: boolean;
  /** The page's own marks on the item (the connections page: which service it is, the words its search matches). */
  readonly attrs?: Readonly<Record<string, string>>;
}

/**
 * A `settings-connection-row` that opens in place: the row is the one the connections page draws, with a toggle at its end
 * (`aria-expanded`, `aria-controls`); the part under it lines up with the row's name. A press anywhere on the row opens it too.
 */
export function renderConnectionItem(view: ConnectionItemView, _L: Say): string {
  const id = escapeHtml(view.id), open = view.open === true;
  const toggle = renderButton({ label: uiText.text("workbench.service-connection-parts.name-details", { name: view.name }), variant: "ghost", icon: "chevron-down", iconOnly: true, className: "settings-connection-item__toggle", attrs: { "data-connection-toggle": "", "aria-expanded": String(open), "aria-controls": `${view.id}-body` } });
  return `<div class="settings-connection-item" data-connection-item data-open="${open}"${renderAttrs(view.attrs)}>
    <div class="settings-connection-row">${view.mark}<div class="settings-connection-row__identity"><strong id="${id}-name">${escapeHtml(view.name)}</strong><small>${escapeHtml(view.caption)}</small></div>${view.state}${toggle}</div>
    <div class="settings-connection-item__fold" id="${id}-body" role="region" aria-labelledby="${id}-name"><div class="settings-connection-item__clip"><div class="settings-connection-item__body settings-connector-flow">${view.body}</div></div></div>
  </div>`;
}

/**
 * Where the card stands: offering to connect (its body, if drawn, stays folded until `startConnectionCard`), asking which account
 * to use, connecting inside it, refused or cancelled, or connected (one line).
 */
export type ConnectionCardState = "ask" | "choose" | "running" | "failed" | "cancelled" | "done";

export interface ConnectionCardView {
  readonly mark: string;
  /** What is missing, said as the thing the person was doing: 要读你的 GitHub 通知，先连上 GitHub. */
  readonly title: string;
  /** One line of why, and what happens after: 连好以后接着做这件事。 */
  readonly reason: string;
  readonly state: ConnectionCardState;
  /** The card's body: the connection's steps (`renderConnectionProgress` and what goes with it), or the accounts to choose from. */
  readonly body?: string;
  /** The card's one action before it starts or after it stops (a primary button); it steps aside while the connection runs. */
  readonly action?: string;
  /** The line the card folds into: 已连上 GitHub · yijunw0212. */
  readonly connected: string;
}

/**
 * The card a page shows where a connection is missing: a `mw-card` with the service's mark and one line of why, the connection
 * running in its body. Connected, the card folds away and the line under it opens (both are one-body folds on the same clock);
 * the line is a status region that `foldConnectionCard` fills from the template drawn here, so it is heard once, and it takes
 * the focus (`tabindex=-1`) when the card it was in folds away. Drawn as `done`, it is the line alone.
 */
export function renderConnectionCard(view: ConnectionCardView): string {
  const done = view.state === "done";
  const line = renderStatusMark({ label: view.connected, state: "done", tone: "done", plain: true });
  const body = view.body ? `<div class="connection-card__fold"><div class="connection-card__clip"><div class="mw-card__panel connection-card__body settings-connector-flow">${view.body}</div></div></div>` : "";
  const card = done ? "" : `<article class="mw-card connection-card" data-slot="card">
      <header class="mw-card__header connection-card__head">${view.mark}<div><h3 class="mw-card__title">${escapeHtml(view.title)}</h3><p class="mw-card__description">${escapeHtml(view.reason)}</p></div></header>
      ${body}${view.action ? `<footer class="mw-card__footer">${view.action}</footer>` : ""}
    </article>`;
  return `<div class="connection-need" data-connection-need data-state="${view.state}">
    <div class="connection-need__fold"${done ? " inert" : ""}><div class="connection-need__clip">${card}</div></div>
    <p class="connection-need__done" role="status" tabindex="-1"><span class="connection-need__line">${done ? line : ""}</span></p>${done ? "" : `<template data-connected-line>${line}</template>`}
  </div>`;
}

const ROW = ".settings-connection-item > .settings-connection-row";
// A fold opens to its natural height on the chevron's clock (the catalog's 行展开收起 · 250ms), the way the design system's
// chevron folds do (packages/design-system styles/disclosure.ts): where the engine can animate to `auto` (`interpolate-size`),
// `block-size` goes from 0 to `auto` with the motion tokens, its inner clip hiding what is not yet shown; elsewhere it opens at
// once. Its rows stay one `1fr` row there, so nothing collapses before the height does; rows themselves are never animated.
// disclosure.ts's own rule is for `details::details-content` and `content-visibility`; these folds are elements the parts'
// program opens with `data-open`/`data-state`, hidden from focus by `visibility`, so the same shape is written for them here.
const FOLD_MOTION = "block-size var(--dur-move) var(--ease-quint),opacity var(--dur-move) var(--ease-quint)";
/** A closing part stays visible, for focus and the reader, until its motion ends. */
const HIDE_AFTER_FADE = "visibility 0s var(--ease-quint) var(--dur-move)";
const naturalFold = (fold: string, closed: string) => `@supports (interpolate-size:allow-keywords){${fold}{interpolate-size:allow-keywords}${closed}{grid-template-rows:1fr;block-size:0}}`;
/** A fold's clip lets focus rings and shadows out once it has opened; it clips only while closed or moving. */
const CLIP_OPEN = "overflow:visible;transition:overflow 0s var(--dur-move) allow-discrete";
const TONE = { hold: "var(--tone-attention)", failed: "var(--tone-blocked)", done: "var(--tone-done)" };

/** The step progress alone: the marks, then the line that says the step; the current mark takes the state's tone. A page that
 * shows only a progress (the model settings' first key) takes these, not the rows and cards it does not draw. */
export const SERVICE_CONNECTION_PROGRESS_STYLES = ""
  + `.connection-progress{display:flex;align-items:center;gap:12px;min-width:0;color:var(--muted);font-size:12px;line-height:1.5}`
  + `.connection-progress__marks{display:flex;flex:none}.connection-progress .mw-steps{margin:0}`
  + `.connection-progress__caption{margin:0;min-width:0;overflow-wrap:anywhere}[data-connectors-settings] .connection-progress__caption,.connection-card .connection-progress__caption{color:var(--muted);font-size:12px}`
  + `.connection-progress__caption:focus{outline:none}.connection-progress__caption:focus-visible{outline:var(--focus-stroke);outline-offset:1px;border-radius:var(--r-tag)}`
  + `.connection-progress[data-state=hold] li[aria-current] > span{background:${TONE.hold}}.connection-progress[data-state=hold] .connection-progress__state{color:${TONE.hold}}`
  + `.connection-progress[data-state=failed] li[aria-current] > span{background:${TONE.failed}}.connection-progress[data-state=failed] .connection-progress__state{color:${TONE.failed}}`
  + `.connection-progress[data-state=cancelled] li[aria-current] > span{background:var(--muted);transform:none}`
  + `.connection-progress[data-state=done] li > span{background:${TONE.done}}`;

/** The row that opens in place, alone: what a page of rows (the connections page) takes, without the card it does not draw. */
export const SERVICE_CONNECTION_ITEM_STYLES = ""
  // The row opening in place: the connections page's row, a wash on hover, the toggle's chevron turning, and the part under it
  // lined up with the row's name (40px mark + 12px gap); on a phone it takes the row's full width.
  + `.settings-connection-item{border-bottom:1px solid var(--line)}`
  + `${ROW},[data-connectors-settings] ${ROW}{grid-template-columns:40px minmax(0,1fr) auto auto;border-width:0;margin-inline:-8px;padding-inline:8px;border-radius:var(--r-row);cursor:pointer;transition:background-color var(--dur-press) var(--ease-quint)}`
  + `${ROW}:hover{background:var(--nav-hover)}`
  + `.settings-connection-item__toggle svg{transition:transform var(--dur-move) var(--ease-quint)}.settings-connection-item[data-open=true] .settings-connection-item__toggle svg{transform:rotate(180deg)}`
  + `@media (pointer:coarse){.settings-connection-item__toggle.mw-btn{min-width:44px;min-height:44px}}`
  + `.settings-connection-item__fold{display:grid;grid-template-rows:0fr;opacity:0;visibility:hidden;transition:${FOLD_MOTION},${HIDE_AFTER_FADE}}`
  + `.settings-connection-item[data-open=true]>.settings-connection-item__fold{grid-template-rows:1fr;opacity:1;visibility:visible;transition:${FOLD_MOTION},visibility 0s}`
  + naturalFold(".settings-connection-item__fold", ".settings-connection-item:not([data-open=true])>.settings-connection-item__fold")
  + `.settings-connection-item__clip{min-height:0;overflow:hidden;margin-inline:-4px;padding-inline:4px}.settings-connection-item[data-open=true] .settings-connection-item__clip{${CLIP_OPEN}}`
  + `.settings-connection-item__body{padding:4px 0 24px 52px}`
  + `@media (prefers-reduced-motion:reduce){:is(.settings-connection-item__fold,.settings-connection-item__toggle svg){transition:none}}`
  + `@media (max-width:760px){${ROW},[data-connectors-settings] ${ROW}{grid-template-columns:40px minmax(0,1fr) auto}`
  + `${ROW}>.settings-connection-item__toggle{grid-column:3;grid-row:1}[data-connectors-settings] ${ROW}>.settings-state,${ROW}>.mw-status{grid-column:2;grid-row:2;justify-self:start}`
  + `.settings-connection-item__body{padding-left:0}}`;

/** The card where a connection is missing (a plugin's place in its page), and the line it folds into. */
export const SERVICE_CONNECTION_CARD_STYLES = ""
  // The card where a connection is missing, and the line it folds into. Its body is a fold too: closed while the card only
  // offers to connect, opened on the same clock when the connection starts; the action steps aside while it runs.
  + `.connection-need{display:grid;min-width:0}.connection-need [hidden]{display:none}`
  + `.connection-need__fold{display:grid;grid-template-rows:1fr;transition:${FOLD_MOTION},visibility 0s}`
  + `.connection-need__clip{min-height:0}`
  + `.connection-need[data-state=done]>.connection-need__fold{grid-template-rows:0fr;opacity:0;visibility:hidden;transition:${FOLD_MOTION},${HIDE_AFTER_FADE}}`
  + `.connection-need[data-state=done] .connection-need__clip{overflow:hidden}`
  + `.connection-need__done{display:grid;grid-template-rows:0fr;opacity:0;margin:0;transition:${FOLD_MOTION}}`
  + `.connection-need[data-state=done]>.connection-need__done{grid-template-rows:1fr;opacity:1;transition-delay:var(--dur-press)}`
  + `.connection-need__line{min-height:0;overflow:hidden;font-size:13px}`
  + naturalFold(".connection-need__fold", ".connection-need[data-state=done]>.connection-need__fold")
  + naturalFold(".connection-need__done", ".connection-need:not([data-state=done])>.connection-need__done")
  + `.connection-need__done:focus{outline:none}.connection-need__done:focus-visible{outline:var(--focus-stroke);outline-offset:1px;border-radius:var(--r-tag)}`
  + `.mw-card.connection-card{width:auto;max-width:100%}`
  + `.connection-card__head{justify-content:flex-start;align-items:flex-start}.connection-card__head>div{min-width:0}.connection-card .mw-card__title{text-wrap:balance;overflow-wrap:anywhere}.connection-card .mw-card__title:lang(zh){word-break:keep-all}`
  + `.connection-card__fold{display:grid;grid-template-rows:1fr;transition:${FOLD_MOTION},visibility 0s}`
  + `.connection-need[data-state=ask] .connection-card__fold{grid-template-rows:0fr;opacity:0;visibility:hidden;transition:${FOLD_MOTION},${HIDE_AFTER_FADE}}`
  + naturalFold(".connection-card__fold", ".connection-need[data-state=ask] .connection-card__fold")
  + `.connection-card__clip{min-height:0;overflow:hidden;margin-inline:-4px;padding-inline:4px}.connection-need:not([data-state=ask]) .connection-card__clip{${CLIP_OPEN}}`
  + `.connection-card__body{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;padding-bottom:0}.connection-card__body .mw-status{max-width:100%;white-space:normal;line-height:1.4}.connection-card__fold:last-child .connection-card__body{padding-bottom:20px}`
  // Accounts to choose from stack one per line at the card's width; a long account line wraps instead of leaving the card.
  + `.connection-card .mw-choice-group{display:grid}.connection-card .mw-choice{min-width:0;padding-block:10px}.connection-card .mw-choice__label{white-space:normal;align-items:start}`
  + `.connection-card .mw-card__footer{padding-top:16px}.connection-need[data-state=running] .connection-card .mw-card__footer{display:none}`
  + `@media (prefers-reduced-motion:reduce){:is(.connection-need__fold,.connection-need__done,.connection-card__fold){transition:none}}`;

/** Every part: what the component board shows. */
export const SERVICE_CONNECTION_PART_STYLES = SERVICE_CONNECTION_PROGRESS_STYLES + SERVICE_CONNECTION_ITEM_STYLES + SERVICE_CONNECTION_CARD_STYLES;
