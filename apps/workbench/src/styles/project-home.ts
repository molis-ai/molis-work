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
  /* A plugin's page as the first page: it takes the whole surface and the platform's own is put away. */
  .immersive-home[data-home-leading] .home-scroll { display: none; }
  /* The adopted surface positions itself against its holder: this box is that holder. */
  .immersive-home .home-lead { position: relative; flex: 1; min-block-size: 0; display: flex; flex-direction: column; }
  .immersive-home .home-lead[hidden] { display: none; }
  .immersive-home .home-lead > * { flex: 1; min-block-size: 0; inline-size: 100%; }
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
  .home-row .mw-presentation__row-title[aria-haspopup] { cursor: pointer; }
  @media (max-width: 760px), (pointer: coarse) {
    .home-row .mw-presentation__row-title[aria-haspopup] { display: inline-flex; align-items: center; min-block-size: 28px; }
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
`;
