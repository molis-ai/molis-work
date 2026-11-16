import { CAPABILITY_PACK_STYLES } from "@molis-ai/molis-work-design-system/capability-pack";

// The 「能力包」 page's own placement, on tokens only (docs/design/capability-pack/pack.css, the decided prototype), after the board's
// eight parts. It comes with the page's program and is added once, so no other page carries it.
// The list beside a pack needs more than a settings page's 760px column.
// 08's Skill detail and import from this computer, as they sit on this page.
// An icon and its words stay on one line; the words wrap under themselves (an upgrade's line in English).
const PAGE_STYLES = `
:is(body.project-preferences-page, .settings-stage) .settings-content > .settings-document.kit-settings, body.immersive-workbench .settings-stage .settings-document.kit-settings, .settings-document.kit-settings { width: 100%; max-width: 1100px; }
.kit-settings .mw-items { padding: 0; list-style: none; }
.kit-settings .mw-facts dd { white-space: pre-wrap; }
.kit-settings .mw-radio-group { display: grid; gap: 10px; border: 0; margin: 0; padding: 0; }
.kit-settings .mw-check-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-height: 32px; }
.kit-settings .mw-check-row small { flex: 1 1 100%; padding-left: 24px; }
.skill-full-text { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }
.kit-settings [data-kit-local-import] > select { margin-right: 8px; }
.skill-import-row { padding-block: 12px; border-bottom: 1px solid var(--line); }
.au-form, .au-ask { display: grid; gap: 16px; min-width: 0; max-width: 680px; }
.au-form > header h3, .au-ask > h3 { margin: 0; color: var(--ink); font-size: 16px; font-weight: var(--weight-title, 600); line-height: 1.4; overflow-wrap: anywhere; }
.au-ask > .kit-note { margin: -8px 0 0; }
.au-field { display: grid; gap: 6px; min-width: 0; }
.au-field :is(.mw-input, .mw-textarea) { width: 100%; box-sizing: border-box; }
.au-field .mw-toggle-group { justify-self: start; max-width: 100%; flex-wrap: wrap; }
.au-field .mw-toggle { white-space: nowrap; }
.au-body { min-height: 260px; font-family: var(--font-mono); font-size: 12.5px; line-height: 1.7; resize: vertical; }
.au-more > summary { padding: 4px 0; color: var(--ink-soft); font-size: 13px; cursor: pointer; }
.au-more[open] > summary { margin-bottom: 10px; }
.au-actions, .au-own { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; }
.au-drafting, .au-drafted { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0; color: var(--muted); font-size: 12px; }
.au-drafting { color: var(--ink-soft); font-size: 13px; }
.au-foot { position: sticky; bottom: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 12px 0; border-top: 1px solid var(--line); background: var(--paper); }
.au-foot__state { flex: 1 1 auto; min-width: 8px; color: var(--muted); font-size: 12px; }
.au-readonly { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 10px 12px; border-radius: var(--r-card, 12px); background: var(--surface-soft); box-shadow: inset 0 0 0 1px var(--line); color: var(--ink-soft); font-size: 13px; line-height: 1.5; }
.au-readonly > span { flex: 1 1 200px; min-width: 0; }
.au-failure:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; }
.kit-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 16px; min-width: 0; }
.kit-search { position: relative; display: inline-flex; align-items: center; flex: 1 1 240px; min-width: 0; max-width: 420px; }
.kit-search > svg { position: absolute; left: 10px; width: 16px; height: 16px; color: var(--muted); pointer-events: none; }
.kit-settings .kit-search input.mw-input { width: 100%; padding-left: 34px; }
.kit-settings .kit-toolbar .mw-select { width: auto; flex: none; max-width: 100%; }
.kit-settings .kit-toolbar .mw-select-picker { display: inline-flex; flex: none; width: auto; max-width: 100%; }
.kit-settings .kit-toolbar .mw-select-picker__trigger { width: auto; }
.kit-spacer { flex: 1 1 auto; }
.kit-io { display: inline-flex; flex-wrap: wrap; gap: 8px; }
.kit-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; margin: 12px 0 0; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.kit-summary .mw-btn--link, .kit-inline-empty .mw-btn--link { min-height: 0; padding: 0; }
.kit-settings [data-kit-notice], .kit-settings [data-kit-local-import] { margin-top: 12px; }
.kit-settings .mw-list-detail { margin-top: 12px; }
.kit-settings .mw-list-detail__list { display: grid; gap: 6px; align-content: start; }
.kit-settings .mw-item__end :is(.mw-status, .mw-badge) { white-space: nowrap; }
.kit-inline-empty { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; padding: 10px 12px; border-radius: var(--r-card, 12px); background: var(--surface-soft); color: var(--muted); font-size: 12px; }
.kit-detail > header { display: grid; gap: 6px; }
.kit-kind { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
.kit-kind svg, .kit-source > svg, .kit-line > svg { width: 14px; height: 14px; flex: none; }
.kit-code { color: var(--muted); font-size: 12px; font-weight: 400; }
.kit-source { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 6px; margin: 0; color: var(--muted); font-size: 12px; }
.kit-dot { color: var(--faint); }
.kit-sec, .kit-outer { display: grid; gap: 8px; min-width: 0; }
.kit-sec > h4, .kit-outer > h4 { margin: 0; color: var(--muted); font-size: 12px; font-weight: var(--weight-control, 500); }
.kit-outer { padding-top: 14px; border-top: 1px solid var(--line); }
.kit-note { margin: 0; max-width: 640px; color: var(--muted); font-size: 12px; line-height: 1.55; }
.kit-line { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin: 0; color: var(--ink-soft); font-size: 13px; line-height: 1.5; }
.kit-line > svg { color: var(--muted); }
.kit-line > span { flex: 1 1 0; min-width: 0; }
.kit-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; }
.kit-places.mw-items { box-shadow: none; padding: 0; gap: 4px; background: transparent; }
.kit-places .mw-item { min-height: 36px; padding: 2px 10px 2px 2px; background: var(--paper); box-shadow: inset 0 0 0 1px var(--line); }
.kit-places .mw-mark { width: 28px; height: 28px; box-shadow: none; }
.kit-packhead { display: grid; gap: 6px; }
.kit-packhead p { margin: 0; }
.mw-now .mw-status-line { align-items: flex-start; }
.mw-now .mw-status-line > span:last-child { min-width: 0; line-height: 1.5; }
.kit-import { display: grid; gap: 18px; margin-top: 16px; padding: 18px 20px; border-radius: 14px; background: var(--paper); box-shadow: var(--lift-1); animation: craft-rise var(--dur-move) var(--ease-quint); }
.kit-import__head { display: grid; gap: 10px; }
.kit-import__head h2 { margin: 0; font-size: 16px; font-weight: var(--weight-title, 600); }
.kit-import__head h2:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; border-radius: 4px; }
.kit-file { display: flex; align-items: center; gap: 10px; margin: 0; padding: 8px 10px; border-radius: 10px; background: var(--surface-soft); }
.kit-file > svg { width: 16px; height: 16px; flex: none; color: var(--ink-soft); }
.kit-file > span { display: grid; gap: 1px; min-width: 0; }
.kit-file strong { font-size: 13px; overflow-wrap: anywhere; }
.kit-file small { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.kit-import .mw-item__end { display: inline-flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px 8px; }
.kit-cards { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.kit-card { display: grid; gap: 8px; padding: 10px 12px; border-radius: 10px; background: var(--paper); box-shadow: inset 0 0 0 1px var(--line); }
.kit-card > :not(.kit-card__head) { margin-left: 42px; }
.kit-card .mw-badge { justify-self: start; height: auto; min-height: 20px; white-space: normal; }
.kit-card.is-muted strong { color: var(--muted); }
.kit-card__head { display: flex; align-items: center; gap: 10px; }
.kit-card__head > span:last-child { display: grid; gap: 1px; min-width: 0; }
.kit-card__head strong { font-size: 13px; font-weight: var(--weight-control, 500); }
.kit-card__head small { color: var(--muted); font-size: 12px; }
.kit-import__foot { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; padding-top: 14px; border-top: 1px solid var(--line); }
@media (prefers-reduced-motion: reduce) { .kit-import { animation: none; } }
@media (max-width: 600px) { .au-foot { position: static; } .kit-card > :not(.kit-card__head) { margin-left: 0; } .kit-import { padding: 14px; } }
`;

export function addKitStyles(): void {
  if (document.querySelector("style[data-kit-styles]")) return;
  const style = document.createElement("style");
  style.dataset.kitStyles = "";
  style.textContent = CAPABILITY_PACK_STYLES + PAGE_STYLES;
  document.head.append(style);
}
