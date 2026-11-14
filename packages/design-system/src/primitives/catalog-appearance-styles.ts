// The rules of the look card, the specimen card and the fade (catalog-appearance.ts). Like the composer's, they live on the board first: they are not in the
// served sheets and move into the page sheets with the page that first draws these parts (batch 16's Settings › Interface and language). Every colour,
// corner, shadow, duration and curve is a token of the page the part is on, or, inside a `[data-look]` element, of the look it draws.
import { lookRules } from "./catalog-appearance-looks.js";

export const APPEARANCE_PARTS_STYLES = `
  /* 1 · Look card. What a look is has to be seen before it is chosen: its colours, its corners and its recommended type, drawn by the look itself. The whole
     card is one button (aria-pressed); the state is said in words by a badge, and the more-actions button is the card's other, separate control. */
  .mw-look-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 196px), 1fr)); gap: 12px; width: 100%; min-width: 0; }
  .mw-look-grid--narrow { max-width: 196px; }
  /* Room under the card for its open menu, so it never lies over what comes next. At desktop size the menu ends about where the card does; the touch
     size below makes its three items 44px tall, and only there does it need the room. */
  .mw-look-grid--room { padding-bottom: 0; }
  .mw-look-card { position: relative; display: grid; min-width: 0; }
  .mw-look-card__pick {
    --pick-r: var(--r-card);
    display: grid; align-content: start; gap: 10px; width: 100%; min-width: 0; padding: 6px 6px 12px; text-align: start; cursor: pointer;
    border: 1px solid var(--line); border-radius: var(--pick-r); background: var(--paper); color: var(--ink); font: inherit;
    box-shadow: var(--lift-1);
    transition: border-color var(--dur-hover) var(--ease-quint), box-shadow var(--dur-hover) var(--ease-quint), transform var(--dur-press) var(--ease-quint);
  }
  .mw-look-card__pick:hover { border-color: var(--line-strong); box-shadow: var(--lift-2); }
  .mw-look-card__pick:active { transform: scale(.985); }
  .mw-look-card__pick:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
  .mw-look-card__pick[aria-pressed="true"] { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent), var(--lift-1); }
  /* The picture is the look's own: ground, sheet, text in its type, a button and three of its tones. It takes the card's corner less the card's padding. */
  .mw-look-card__view { position: relative; display: block; height: 84px; overflow: hidden; border-radius: calc(var(--pick-r) - 6px); background: var(--desk); color: var(--ink); font-family: var(--font); box-shadow: inset 0 0 0 1px var(--line); }
  .mw-look-card__sheet { position: absolute; inset: 10px 24px -12px 10px; display: grid; align-content: start; gap: 6px; padding: 10px 12px; border-radius: var(--r-card); background: var(--paper); box-shadow: var(--lift-1); }
  .mw-look-card__sample { overflow: hidden; font-size: 15px; line-height: 22px; font-weight: var(--weight-title); letter-spacing: var(--tracking-title); white-space: nowrap; }
  .mw-look-card__line { display: block; width: 72%; height: 4px; border-radius: 2px; background: color-mix(in srgb, var(--ink) 18%, transparent); }
  .mw-look-card__line + .mw-look-card__line { width: 46%; }
  .mw-look-card__marks { display: flex; align-items: center; gap: 6px; }
  .mw-look-card__button { width: 30px; height: 12px; margin-inline-end: 4px; border-radius: var(--r-control); background: var(--action); }
  .mw-look-card__dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
  .mw-look-card__dot:nth-child(3) { background: var(--green); }
  .mw-look-card__dot:nth-child(4) { background: var(--amber); }
  .mw-look-card__text { display: grid; gap: 2px; min-width: 0; padding-inline: 6px; }
  .mw-look-card__name { min-width: 0; font-size: 13px; line-height: 20px; font-weight: var(--weight-control); overflow-wrap: anywhere; }
  .mw-look-card__meta { min-width: 0; color: var(--muted); font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
  .mw-look-card__badges { display: flex; flex-wrap: wrap; gap: 4px; min-height: 20px; padding-inline: 6px; }
  :is(.mw-look-card__trial, .mw-look-card__current):not([hidden]) { display: contents; }
  /* The wrapper only holds the button and its menu together for the board's menu script; both are placed against the card, so the menu is as wide as the card. */
  .mw-look-card__more { display: contents; }
  .mw-look-card__more > .mw-btn { position: absolute; top: 12px; right: 12px; z-index: 1; background: color-mix(in srgb, var(--paper) 88%, transparent); }
  .mw-look-card__more .mw-compose__menu { top: 48px; right: 8px; left: 8px; }
  .mw-look-card__more .mw-menu { width: 100%; min-width: 0; }

  /* 2 · Specimen card. The card is the page's; its canvas is drawn in another look (its tokens are the look's, in a theme the canvas can keep whatever the
     page does), so what is chosen is seen before it is used. The page does not change; loading, a failure and a clash are said in the card's foot. The
     canvas is a picture: inert, with one name for it. */
  .mw-catalog .mw-look-proof.mw-card { --proof-r: var(--r-sheet); width: min(380px, 100%); }
  .mw-look-proof .mw-card__header { align-items: center; }
  .mw-look-proof .mw-card__header > div { min-width: 0; }
  .mw-look-proof .mw-card__description { overflow-wrap: anywhere; }
  .mw-look-proof__canvas { display: grid; gap: 12px; min-width: 0; padding: 16px; border-radius: var(--proof-r, var(--r-sheet)); background: var(--desk); color: var(--ink); font: 13px/1.5 var(--font); letter-spacing: var(--tracking-body); transition: background-color var(--dur-move) var(--ease-quint); }
  .mw-look-proof__sheet { display: grid; gap: 10px; min-width: 0; padding: 14px; border-radius: var(--r-card); background: var(--paper); box-shadow: var(--lift-1); }
  .mw-look-proof__sheet h4 { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0; font-size: 15px; line-height: 22px; font-weight: var(--weight-title); letter-spacing: var(--tracking-title); }
  .mw-look-proof__rows { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
  /* A row is 32px tall with its one line in the middle; when the words wrap, the mark stays on the first line. */
  .mw-look-proof__rows li { display: flex; align-items: flex-start; gap: 8px; padding: calc((32px - 1lh) / 2) 6px; border-radius: var(--r-row); font-size: 13px; }
  .mw-look-proof__rows .mw-state-ring { flex: none; margin-top: calc((1lh - 1em - 2px) / 2); }
  .mw-look-proof__rows li:first-child { background: var(--nav-active); }
  .mw-look-proof__rows li > span:nth-child(2) { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .mw-look-proof__rows li > span:last-child { margin-inline-start: auto; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .mw-look-proof__buttons { display: flex; flex-wrap: wrap; gap: 8px; }
  .mw-look-proof__read { margin: 0; color: var(--ink-soft); font-family: var(--type-reading-font, var(--font)); font-size: var(--type-reading-size, 15px); line-height: var(--type-reading-line-height, 1.65); text-wrap: pretty; }
  .mw-look-proof__code { margin: 0; padding: 8px 10px; border-radius: var(--r-control); background: var(--rail); color: var(--ink); font: 12px/1.6 var(--font-mono); white-space: pre-wrap; overflow-wrap: anywhere; }
  .mw-look-proof .mw-card__footer { display: grid; justify-items: stretch; gap: 12px; }
  .mw-look-proof__status { display: grid; gap: 4px; min-width: 0; color: var(--muted); font-size: 12px; line-height: 18px; text-wrap: pretty; overflow-wrap: anywhere; }
  .mw-look-proof__status .mw-status { align-items: flex-start; gap: 6px; font-weight: var(--weight-body); line-height: 18px; white-space: normal; }
  .mw-look-proof__status .mw-status > span:not(.mw-state-ring) { overflow: visible; text-overflow: clip; overflow-wrap: anywhere; }
  .mw-look-proof__status .mw-state-ring { margin-top: 2px; }
  .mw-look-proof__status ul { margin: 0; padding-inline-start: 18px; color: var(--ink-soft); }
  .mw-look-proof__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
  .mw-look-sides { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
  .mw-look-sides > figure { display: grid; gap: 6px; flex: 1 1 260px; min-width: 0; max-width: 340px; margin: 0; }
  .mw-look-sides figcaption { color: var(--muted); font-size: 12px; }
  .mw-look-narrow { width: min(280px, 100%); }
  .mw-catalog .mw-look-narrow .mw-look-proof.mw-card { width: 100%; }
  .mw-catalog #look-proof .mw-catalog__specimens { grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr)); align-items: start; }

  /* 3 · The fade specimen. */
  .mw-look-fade { display: grid; gap: 12px; justify-items: start; min-width: 0; max-width: 520px; }
  .mw-look-fade__now { margin: 0; color: var(--ink); font-size: 13px; line-height: 20px; overflow-wrap: anywhere; }
  .mw-look-fade__clock { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin: 0; color: var(--muted); font-size: 12px; line-height: 18px; }
  .mw-look-fade__clock code { padding: 1px 6px; border-radius: var(--r-tag); background: var(--control-fill); color: var(--ink-soft); font: 11px/18px var(--font-mono); }
  .mw-look-fade .mw-catalog__row { align-items: stretch; }

  @media (prefers-reduced-motion: reduce) {
    .mw-look-card__pick, .mw-look-proof__canvas { transition: none; }
    .mw-look-card__pick:active { transform: none; }
  }
  @media (max-width: 760px), (pointer: coarse) {
    .mw-look-card__more > .mw-btn { top: 8px; right: 8px; width: 44px; min-width: 44px; min-height: 44px; }
    .mw-look-card__more .mw-compose__menu { top: 56px; }
    .mw-look-grid--room { padding-bottom: calc(3 * 44px); }
  }
`;

export const APPEARANCE_BOARD_STYLES = `${lookRules()}${APPEARANCE_PARTS_STYLES}`;
