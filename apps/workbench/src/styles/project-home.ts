import { PRESENTATION_FORM_STYLES } from "@molis-ai/molis-work-design-system";

export const PROJECT_HOME_STYLES = PRESENTATION_FORM_STYLES + `
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
.inbox-object-title .mw-presentation__tag{font-size:var(--type-title-size,1rem)}
  .tab-pane-body > .immersive-home { container-type: inline-size; padding: 0; min-block-size: 0; block-size: 100%; overflow: auto; overscroll-behavior: contain; }
  .immersive-home .home-scroll { max-inline-size: 74rem; margin-inline: auto; padding: clamp(1rem, 4cqi, 3.5rem); }
  .immersive-home .home-heading h1 { margin: 0; font-size: clamp(1.6rem, 4cqi, 2.2rem); line-height: 1.2; }
  .immersive-home .home-heading p, .home-read-state { color: var(--muted); }
  .home-read-state { min-block-size: 1.6em; margin-block: .5rem 1rem; }
  .home-read-state p { display: inline; margin-inline-end: .6em; }
  .home-groups { display: grid; gap: 1.4rem; }
  .home-groups h2 { font-size: var(--type-title-size, 1rem); margin: 0 0 .7rem; }
  .home-plugin-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 27rem), 1fr)); gap: .9rem; align-items: start; }
  .home-plugin-card { overflow: visible; min-inline-size: 0; }
  .home-plugin-card__band { display: flex; align-items: center; gap: .5em; border-radius: var(--sk-r-card, var(--r-card)) var(--sk-r-card, var(--r-card)) 0 0; background: var(--presentation-soft); padding: .65rem .9rem; }
  .home-plugin-card__band h3 { margin: 0; font-size: var(--type-title-size, 1rem); overflow-wrap: anywhere; }
  .home-plugin-card__body { padding: .75rem .9rem; display: grid; gap: .65rem; }
  .home-plugin-card__body p { margin: 0; color: var(--muted); overflow-wrap: anywhere; }
  .home-plugin-card__actions { display: flex; flex-wrap: wrap; gap: .45rem; }
  .home-rows { display: grid; min-inline-size: 0; gap: .45rem; }
  .home-row { min-inline-size: 0; }
  .home-row .mw-presentation__row-title[aria-haspopup] { cursor: pointer; }
  .home-row .mw-presentation__more { z-index: 1; }
  .home-row .mw-presentation__more[open] { z-index: 2; }
  .home-peek { inline-size: min(100% - 2rem, 30rem); max-block-size: min(85dvh, 32rem); padding: 1rem; }
  .home-offers-controls { display: flex; flex-wrap: wrap; gap: .45em; }
  .home-offers-note { color: var(--muted); }
  .home-offers-result pre { overflow-wrap: anywhere; white-space: pre-wrap; }
  .home-peek__bar { display: flex; justify-content: end; margin-block-end: .4rem; }
  @media (max-width: 600px), (pointer: coarse) {
    .home-peek { inset: auto 0 0; margin: 0; inline-size: 100%; max-inline-size: none; max-block-size: 90dvh; border-radius: var(--sk-r-card, var(--r-sheet)) var(--sk-r-card, var(--r-sheet)) 0 0; }
  }
`;
