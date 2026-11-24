import { PRESENTATION_FORM_STYLES } from "@molis-ai/molis-work-design-system";
import { FIRST_PAGE_STYLES } from "@molis-ai/molis-work-plugin-sdk/ui";

export const PROJECT_HOME_STYLES = PRESENTATION_FORM_STYLES + FIRST_PAGE_STYLES + `
.surface-slot-body{height:100%;display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:var(--paper);color:var(--ink)}
.surface-slot-body>[data-framed-scroll]{overflow:auto;display:grid;align-content:start;gap:6px;padding-inline:4px}
.surface-slot-edge{display:flex;align-items:center;gap:6px;min-height:8px;padding-inline:4px}
.surface-slot-edge:not(:empty){padding-block:4px}
.assistant-attention-objects,.assistant-conversation-objects{display:grid;gap:6px;min-width:0}
.assistant-attention-objects:empty,.assistant-conversation-objects:empty{display:none}
.tree-presentation-name{display:grid;align-items:center;flex:1;min-inline-size:0}
.tree-presentation-name>*{grid-area:1/1;min-inline-size:0}
.tree-presentation-name .mw-presentation{pointer-events:none}
.tree-presentation-name .mw-presentation__tag{background:none;border-color:transparent}
  .immersive-plugin-stage > .immersive-home, .tab-pane-body > .immersive-home { padding: 0; min-block-size: 0; block-size: 100%; overflow: hidden; display: flex; flex-direction: column; position: relative; }
  /* The first page: one column to read and a margin of sources (the parts and their styles are the SDK's, FIRST_PAGE_STYLES). */
  .immersive-home .home-scroll { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 34px clamp(16px, 4vw, 40px) 48px; }
  /* The margin's holder is not a box of its own: what the view writes into it stands on the page's grid. */
  .immersive-home .home-margin { display: contents; }
  .home-read-state { margin: 0; color: var(--muted); font-size: var(--type-note-size, 12px); line-height: var(--type-note-line-height, 1.6); min-block-size: 0; }
  .home-read-state:not(:empty) { margin-block-start: 10px; display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; }
  .home-read-state p { margin: 0; }
  .home-groups { min-inline-size: 0; }
  .home-rows { display: grid; min-inline-size: 0; }
  .home-row { min-inline-size: 0; }
  .home-row.mw-first-page__row > .mw-badge { margin-inline-start: 88px; }
  /* Why the page is arranged this way is one small line, its scope beside it, not a paragraph of its own. */
  .home-groups > .surface-correction-reason { margin-block-start: 10px; font-size: var(--type-note-size, 12px); line-height: var(--type-note-line-height, 1.6); }
  .home-groups > .surface-correction-reason > div { display: flex; flex-wrap: wrap; align-items: baseline; gap: .1rem .7rem; min-inline-size: 0; }
  .home-rows:empty { display: none; }
  .home-row .mw-presentation__row-title:is([aria-haspopup], [role="button"]) { cursor: pointer; }
  @media (max-width: 760px), (pointer: coarse) {
    .home-row .mw-presentation__row-title:is([aria-haspopup], [role="button"]) { display: inline-flex; align-items: center; min-block-size: 28px; }
  }
  .home-row .mw-presentation__more { z-index: 1; }
  .home-row .mw-presentation__more[open] { z-index: 2; }
  .home-row:has(>.surface-correction-menu) { position: relative; }
  .surface-correction-menu { position: absolute; inset-block-start: .3rem; inset-inline-end: .35rem; }
  .home-row:has(>.surface-correction-menu) .mw-presentation__band,
  .home-row:has(>.surface-correction-menu) .mw-presentation--chip { padding-inline-end: 2.75rem; }
  .surface-correction-reason { display: flex; flex-wrap: wrap; gap: .35rem .65rem; align-items: center; justify-content: space-between; color: var(--muted); min-inline-size: 0; }
  /* The reason's words take the line's free space and wrap inside it, so the scope's menu stays on the line at the end:
     with its max-content width the reason pushed the menu to a second line at the left edge, where a right-aligned menu
     opened 120px off screen at 390px (overlay-placement VUX-29). */
  .surface-correction-reason > div:not(.surface-correction-recovery) { flex: 1 1 0; min-inline-size: 0; }
  .surface-correction-reason p { margin: 0; overflow-wrap: anywhere; }
  /* The scope is a note in the type scale, not the browser's small step (which lands on 10px). */
  .surface-correction-reason small { font-size: var(--type-note-size, 12px); line-height: var(--type-note-line-height, 1.6); }
  .surface-correction-recovery { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; }
  .discussion-display-defaults { display: flex; justify-content: flex-end; padding-inline: .5rem; }
  .home-peek { inline-size: min(100% - 2rem, 30rem); max-block-size: min(85dvh, 32rem); padding: 1rem; }
  .home-offers-controls { display: flex; flex-wrap: wrap; gap: .45em; }
  .home-offers-note { color: var(--muted); }
  .home-offers-result pre { overflow-wrap: anywhere; white-space: pre-wrap; }
  .home-peek__bar { display: flex; justify-content: end; margin-block-end: .4rem; }
  @media (max-width: 600px), (pointer: coarse) {
    .home-peek { inset: auto 0 0; margin: 0; inline-size: 100%; max-inline-size: none; max-block-size: 90dvh; border-radius: var(--r-sheet) var(--r-sheet) 0 0; }
  }
  /* Batch 37-1: Generated project home mounted inside 36A's First Page body slot (Work Brief lede stays on top). */
  .immersive-home[data-home-generated-active="true"] [data-home-groups] > :not([data-home-lede]):not([data-home-facts]) { display: none; }
  .immersive-home[data-home-generated-active="true"] .mw-first-page__grid { grid-template-columns: minmax(0, 1fr); max-width: 1120px; margin-inline: auto; }
  .immersive-home[data-home-generated-active="true"] .mw-first-page__column { grid-column: 1; }
  .immersive-home[data-home-generated-active="true"] [data-home-margin] { display: none; }
  .home-generated-notice { display: grid; gap: 8px; min-inline-size: 0; }
  .home-generated-notice:not(:empty) { margin-block: 12px; }
  .home-generated-body { margin-block-start: 14px; min-inline-size: 0; }
  .home-generated-frame { display: block; width: 100%; min-height: 260px; border: 0; background: transparent; }
  .hp-ver-wrap { position: relative; display: inline-flex; align-items: center; }
  .hp-ver-trigger { gap: 4px; }
  .hp-ver-popover { position: absolute; right: 0; top: calc(100% + 6px); z-index: 25; width: min(360px, calc(100vw - 24px)); max-width: calc(100vw - 24px); padding: 10px; box-sizing: border-box; }
  @media (max-width: 600px) {
    .hp-ver-popover { position: fixed; left: 12px; right: 12px; top: 104px; width: auto; max-width: none; }
  }
  .hp-ver-list { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; max-height: 260px; overflow-y: auto; }
  .hp-ver-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px; border-radius: var(--r-control); }
  .hp-ver-row.is-current { background: var(--surface-soft); }
  .hp-ver-row__main { display: grid; gap: 3px; min-inline-size: 0; }
  .hp-ver-row__main > strong { font-size: 13px; font-weight: var(--weight-control); color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hp-ver-row__tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .hp-ver-foot-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line); }
  .hp-ver-note { margin: 8px 0 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
  .hp-draft-banner { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; padding: 10px 12px; border-radius: var(--r-card); background: var(--surface-soft); border: 1px solid var(--line); }
  .hp-draft-banner__copy { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-inline-size: 0; color: var(--muted); font-size: 12px; }
  .hp-draft-banner__actions { display: flex; align-items: center; gap: 8px; }
  :is(.hp-draft-banner, .hp-ver-popover, .home-adopt-dialog) .mw-btn--secondary:not(:disabled) { background: var(--control-fill); border-color: var(--line); }
  :is(.hp-draft-banner, .hp-ver-popover, .home-adopt-dialog) .mw-btn--secondary:hover:not(:disabled) { background: var(--nav-hover); border-color: var(--line-strong); }
  .hp-quiet-note { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin: 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
  .hp-quiet-note > svg { width: 14px; height: 14px; flex: none; color: var(--accent); }
  .home-compare { display: grid; gap: 12px; margin-block-start: 14px; padding-bottom: 84px; min-inline-size: 0; }
  .home-compare .mw-compare-adopt-bar { bottom: 12px; border: 1px solid var(--line); border-radius: var(--r-card); box-shadow: var(--lift-2); }
  .hp-compare-switch { display: none; }
  .hp-compare-issues { display: grid; gap: 8px; min-inline-size: 0; }
  .hp-compare-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; min-inline-size: 0; }
  .hp-compare-col { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 10px; min-inline-size: 0; padding: 12px; border: 1px solid var(--line); border-radius: var(--r-card); background: var(--paper); }
  .hp-compare-col--draft { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
  .hp-compare-col__head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; }
  .hp-preview-note { margin-inline-start: auto; color: var(--muted); font-size: 12px; }
  @media (max-width: 1179.98px) {
    .hp-compare-switch { display: flex; }
    .hp-compare-grid { grid-template-columns: minmax(0, 1fr); }
    .hp-compare-grid[data-view="now"] [data-col="draft"],
    .hp-compare-grid[data-view="draft"] [data-col="now"] { display: none; }
  }
  .home-adopt-dialog { width: min(560px, calc(100vw - 24px)); }
  .hp-grant-list { display: grid; gap: 8px; margin: 0 0 12px; padding: 0; list-style: none; }
  .hp-grant-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--r-control); }
  .hp-grant-row .mw-check-row { flex: 1 1 auto; min-inline-size: 0; align-items: flex-start; }
  .hp-grant-row .mw-check-row > span { display: grid; gap: 2px; }
  .hp-grant-row small { color: var(--muted); font-size: 12px; }
  .hp-grant-empty { margin: 0; color: var(--muted); font-size: 13px; }
`;
