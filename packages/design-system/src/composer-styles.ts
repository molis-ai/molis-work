import { COMPOSER_PATTERN_STYLES } from "./primitives/catalog-patterns.js";

/**
 * The unified input's shell (specs/unified-input-voice/implementation-plan.md §3.6, K1's specimen rules), served in the workbench
 * sheet from K2 on with the patterns it is built from. The home bar's one-line capsule grown to rows (`--r-composer`, `--lift-1`,
 * `--line-strong` on focus). States are one attribute on `.mw-composer`, `data-state`: `sending`, `running`, `failed`, `unknown`
 * or `disabled`; focus is `:focus-within`, never an attribute.
 *
 * Its menus (＋ and the delivery ▾) hang from the whole composer, not from their button, so they are as wide as it allows and,
 * on a phone, open above the receiver row instead of over it (D-track desk). Scene controls sit beside ＋ and fold behind 更多 in
 * a narrow composer, a panel that rises from the bar like the menus.
 */
export const COMPOSER_STYLES = `${COMPOSER_PATTERN_STYLES}
  .mw-composer { position: relative; display: grid; gap: 6px; width: min(640px, 100%); min-width: 0; container: mw-composer / inline-size; }
  .mw-composer__to { display: flex; align-items: center; gap: 6px; min-width: 0; padding-inline: 4px; color: var(--muted); font-size: 12px; white-space: nowrap; }
  .mw-composer__to .mw-tag { min-width: 0; max-width: min(100%, 320px); }
  .mw-composer__to .mw-tag > span { overflow: hidden; text-overflow: ellipsis; }
  /* The receiver's reset (start a new one instead) is a real target, 28px, in the tag's own place: the margins take back what the row would grow by. */
  .mw-composer__to [data-tag-remove] { width: 28px; height: 28px; margin: -2px -5px -2px -3px; }
  .mw-composer__box { display: grid; min-width: 0; border-radius: var(--r-composer, 15px); background: var(--paper); box-shadow: 0 0 0 1px var(--line), var(--lift-1); transition: box-shadow var(--dur-hover) var(--ease-quint), background-color var(--dur-hover) var(--ease-quint); }
  .mw-composer__box:focus-within { box-shadow: 0 0 0 1px var(--line-strong), var(--lift-1); }
  .mw-composer__box[data-dropping] { box-shadow: 0 0 0 2px var(--accent), var(--lift-1); }
  .mw-composer__files { width: auto; padding: 6px 6px 0; }
  .mw-composer__restore { margin: 0; padding: 8px 12px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mw-composer__restore .mw-btn--link { min-height: 0; padding: 0; vertical-align: baseline; }
  .mw-composer__text { display: flex; padding: 10px 12px 0; }
  /* The page sheets style every bare textarea (a border and a field's fill); the field here is the box itself, so one id-weight
     \`:not\` takes those off, as the button group's joined corners do. */
  .mw-composer__text > .mw-composer__input:not(#mw-composer) { flex: 1; min-width: 0; min-height: 2lh; padding: 0; border: 0; border-radius: 0; outline: 0; background: transparent; box-shadow: none; color: var(--ink); font: inherit; font-size: 14px; line-height: 22px; }
  .mw-composer__input::placeholder { color: var(--muted); }
  .mw-composer__status { display: flex; align-items: baseline; gap: 8px; min-width: 0; padding: 8px 12px 0; color: var(--ink-soft); font-size: 12px; line-height: 18px; text-wrap: pretty; }
  .mw-composer__status > .mw-status { flex: none; }
  .mw-composer__status > span:not(.mw-status) { flex: 1; min-width: 0; }
  .mw-composer__status .mw-btn--link { flex: none; min-height: 0; padding: 0; }
  .mw-composer__foot { display: flex; align-items: center; gap: 6px; min-height: 44px; padding: 6px 8px 8px; }
  .mw-composer__start, .mw-composer__end, .mw-composer__controls { display: flex; align-items: center; gap: 4px; min-width: 0; }
  .mw-composer__start { flex: 1; }
  .mw-composer__end { flex: none; }
  .mw-composer__more { display: none; }
  .mw-composer .mw-compose__anchor { position: static; }
  .mw-composer .mw-compose__menu { top: auto; right: 0; bottom: calc(100% + 6px); left: auto; width: min(340px, 100%); }
  .mw-composer__start .mw-compose__menu { right: auto; left: 0; }
  .mw-composer .mw-compose__menu .mw-menu { width: 100%; min-width: 0; max-height: min(360px, 60vh, var(--mw-composer-menu-room, 60vh)); overflow-y: auto; animation-name: craft-rise-from-bar; }
  .mw-composer__query { padding: 4px 4px 6px; }
  .mw-composer__query > .mw-input { width: 100%; }
  .mw-composer__line { margin: 0; padding: 6px 10px; color: var(--muted); font-size: 12px; line-height: 18px; }
  .mw-composer[data-state="failed"] .mw-composer__box { box-shadow: 0 0 0 1px color-mix(in srgb, var(--red) 45%, transparent), var(--lift-1); }
  .mw-composer[data-state="disabled"] .mw-composer__box { background: var(--wash); box-shadow: 0 0 0 1px var(--line); }
  .mw-composer[data-state="disabled"] .mw-composer__input:not(#mw-composer) { color: var(--muted); cursor: not-allowed; }
  /* In a narrow box the explanation is the part that must be read: it flows as one paragraph that starts beside the mark and
     wraps under it, with the action following its last words, instead of a thin column squeezed between the two. */
  @container mw-composer (max-width: 480px) {
    .mw-composer__status { display: block; }
    .mw-composer__status > .mw-status { margin-right: 8px; vertical-align: 1px; }
    .mw-composer__status .mw-btn--link { margin-left: 8px; vertical-align: baseline; }
    .mw-composer__more { display: block; }
    .mw-composer__controls { position: absolute; bottom: calc(100% + 6px); left: 0; z-index: 5; display: none; flex-wrap: wrap; max-width: 100%; padding: 6px; border-radius: var(--r-card, 12px); background: var(--popover, var(--paper)); box-shadow: var(--lift-3); animation: craft-rise-from-bar 250ms var(--ease-quint); }
    .mw-composer__more:has(> [aria-expanded="true"]) + .mw-composer__controls { display: flex; }
  }
  @media (prefers-reduced-motion: reduce) { .mw-composer__box { transition: none; } .mw-composer__controls { animation: none; } }
  @media (max-width: 600px), (pointer: coarse) {
    .mw-composer__text > .mw-composer__input:not(#mw-composer) { font-size: 16px; }
    .mw-composer__foot .mw-btn--sm, .mw-composer__foot .mw-btn--icon { min-height: 44px; }
    .mw-composer__foot .mw-btn--icon-only { width: 44px; min-width: 44px; }
    .mw-composer__to { gap: 12px; }
    .mw-composer__to [data-tag-remove] { width: 44px; height: 44px; margin: -10px -13px -10px -11px; }
  }`;
