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
  .immersive-plugin-stage > .immersive-home, .tab-pane-body > .immersive-home { container-type: inline-size; padding: 0; min-block-size: 0; block-size: 100%; overflow: hidden; display: flex; flex-direction: column; position: relative; }
  .immersive-home .home-scroll { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; width: 100%; max-width: 1280px; margin: 0 auto; padding: clamp(1rem, 4cqi, 3.5rem); }
  /* A plugin's page as the home: it takes the whole surface, under one thin line that leads back to the groups. */
  .immersive-home[data-home-leading] .home-scroll { display: none; }
  /* The adopted surface positions itself against its holder: this box is that holder, so the page never covers the line above it. */
  .immersive-home .home-lead { position: relative; flex: 1; min-block-size: 0; display: flex; flex-direction: column; }
  .immersive-home .home-lead[hidden], .immersive-home .home-lead-bar[hidden] { display: none; }
  .immersive-home .home-lead > * { flex: 1; min-block-size: 0; inline-size: 100%; }
  .immersive-home .home-lead-bar { flex: none; display: flex; align-items: center; justify-content: flex-end; gap: .2rem .7rem; flex-wrap: wrap; min-block-size: 2rem; padding: .2rem clamp(.6rem, 2cqi, 1.2rem); color: var(--muted); font-size: var(--type-note-size, 12px); line-height: var(--type-note-line-height, 1.6); }
  .immersive-home .home-lead-bar p { margin: 0; margin-inline-end: auto; overflow-wrap: anywhere; }
  /* Where am I: the page's kind as a quiet line, then the project's own name. */
  .immersive-home .home-heading-bar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .immersive-home .home-heading-bar > .mw-btn { flex: none; }
  .immersive-home .home-heading { display: grid; gap: .25rem; }
  .immersive-home .home-heading h1 { margin: 0; font-family: var(--type-display-font); font-size: var(--type-display-size); line-height: max(var(--type-display-line-height), 1.3); overflow-wrap: anywhere; text-wrap: balance; }
  .immersive-home .home-heading p, .home-read-state { margin: 0; color: var(--muted); }
  .immersive-home .home-heading__place { font-size: var(--type-note-size, 12px); line-height: var(--type-note-line-height, 1.6); }
  .home-read-state { min-block-size: 1.6em; margin-block: .5rem 1rem; }
  .home-read-state:empty { min-block-size: 0; margin-block: .4rem .9rem; }
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
  /* Why the page is arranged this way is one small line under the heading, its scope beside it, not a paragraph of its own. */
  .home-groups > .surface-correction-reason { font-size: var(--type-note-size, 12px); line-height: var(--type-note-line-height, 1.6); margin-block-end: -.5rem; }
  .home-groups > .surface-correction-reason > div { display: flex; flex-wrap: wrap; align-items: baseline; gap: .1rem .7rem; min-inline-size: 0; }
  /* Nothing waiting: one line with a settled mark. */
  .home-clear p { display: flex; align-items: center; gap: .45em; margin: 0; color: var(--muted); }
  .home-clear svg { flex: none; inline-size: 1.1em; block-size: 1.1em; color: var(--green); }
  .home-start__actions { align-items: center; gap: .6rem 1rem; }
  .home-start__hint { color: var(--muted); font-size: var(--type-note-size, 12px); line-height: var(--type-note-line-height, 1.6); }
  /* A group's rows are one list: a single edge around it and hairlines between rows, instead of a box for every row
     (and, in a plugin's card, a box inside a box). */
  .home-groups > section:is([data-home-group=attention], [data-home-group=continue]) .home-rows {
    gap: 0; border-radius: var(--sk-r-card, var(--r-card)); box-shadow: 0 0 0 1px var(--line); background: var(--paper);
  }
  .home-groups :is([data-home-group=attention], [data-home-group=continue], .home-plugin-card) .home-row + .home-row { border-block-start: 1px solid var(--line); }
  .home-groups :is([data-home-group=attention], [data-home-group=continue], .home-plugin-card) .mw-presentation--row .mw-item { border: 0; border-radius: 0; padding: 8px 8px 8px 12px; }
  .home-groups > section:is([data-home-group=attention], [data-home-group=continue]) .home-row:first-child .mw-item { border-start-start-radius: var(--sk-r-card, var(--r-card)); border-start-end-radius: var(--sk-r-card, var(--r-card)); }
  .home-groups > section:is([data-home-group=attention], [data-home-group=continue]) .home-row:last-child .mw-item { border-end-start-radius: var(--sk-r-card, var(--r-card)); border-end-end-radius: var(--sk-r-card, var(--r-card)); }
  .home-plugin-card .home-rows { gap: 0; margin-inline: -.9rem; }
  .home-plugin-card .mw-presentation--row .mw-item { padding-inline: .9rem .6rem; }
  .home-rows:empty { display: none; }
  @media (hover: hover) and (pointer: fine) {
    .home-groups .home-row:hover .mw-presentation--row .mw-item { background: var(--nav-hover); }
  }
  .home-row .mw-presentation__row-title[aria-haspopup] { cursor: pointer; }
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
    .home-peek { inset: auto 0 0; margin: 0; inline-size: 100%; max-inline-size: none; max-block-size: 90dvh; border-radius: var(--sk-r-card, var(--r-sheet)) var(--sk-r-card, var(--r-sheet)) 0 0; }
  }
`;
