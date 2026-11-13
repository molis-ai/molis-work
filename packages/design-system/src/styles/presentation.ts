export { presentationOwnerHue } from "@molis-ai/molis-work-plugin-sdk/ui";

export const PRESENTATION_FORM_STYLES = `
  .mw-presentation { min-inline-size: 0; color: var(--ink); }
  .mw-presentation__owner {
    display: inline-grid; place-items: center; flex: none; inline-size: 2em; block-size: 2em;
    border-radius: var(--sk-r-slot, var(--r-control)); background: var(--presentation-soft); color: var(--presentation-hue);
  }
  .mw-presentation__owner svg { inline-size: 1em; block-size: 1em; }
  .mw-presentation__tag { max-inline-size: 100%; gap: .5em; padding-inline: .25em .6em; }
  .mw-presentation__tag .mw-presentation__owner { inline-size: 1.5em; block-size: 1.5em; border-radius: var(--sk-r-slot, var(--r-tag)); }
  .mw-presentation__tag > strong { overflow: hidden; text-overflow: ellipsis; font-weight: var(--weight-control); }
  .mw-presentation__tag .mw-status { flex: none; }
  .mw-presentation__tag .mw-status > .mw-state-ring + span {
    position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%);
  }
  .mw-presentation--row { container-type: inline-size; }
  .mw-presentation--row .mw-item {
    display: grid; grid-template-columns: auto minmax(0, 1fr) auto; grid-template-areas: "owner title end" ". fields end";
    align-items: start; gap: .25em .7em; border: 1px solid var(--line);
  }
  .mw-presentation--row .mw-item > :first-child { grid-area: owner; }
  .mw-presentation--row .mw-presentation__row-title { grid-area: title; }
  .mw-presentation--row .mw-item__end { grid-area: end; align-self: center; min-inline-size: 0; }
  .mw-presentation--row .mw-presentation__fields { grid-area: fields; }
  .mw-presentation__row-title:focus-visible, .mw-presentation__more summary:focus-visible { outline: var(--focus-stroke); }
  .mw-presentation__row-title > strong, .mw-presentation .mw-preview-card > strong {
    font-family: var(--type-title-font, inherit); font-size: var(--type-title-size, inherit);
    line-height: var(--type-title-line-height, inherit); letter-spacing: var(--type-title-tracking, inherit);
  }
  .mw-presentation__fields {
    display: flex; flex-wrap: wrap; align-items: baseline; gap: .25em 1em; min-inline-size: 0; color: var(--muted);
    font-size: var(--type-note-size, inherit); line-height: var(--type-note-line-height, inherit);
  }
  .mw-presentation__field { min-inline-size: 0; overflow-wrap: anywhere; }
  .mw-presentation__field > small { margin-inline-end: .4em; }
  .mw-presentation__field ul { margin-block: 0; padding-inline-start: 1em; }
  .mw-presentation__field[data-presentation-role=progress] { flex: 1 1 100%; }
  .mw-presentation__field[data-presentation-role=excerpt] { flex: 1 1 100%; white-space: pre-wrap; }
  .mw-presentation--row .mw-presentation__field :is(time, span, small) { font-size: inherit; white-space: normal; }
  .mw-presentation:is(.mw-presentation--card, .mw-presentation--peek) {
    display: grid; gap: .6em; border: 1px solid var(--line); border-radius: var(--sk-r-card, var(--r-card)); background: var(--paper);
  }
  .mw-presentation__band {
    display: flex; align-items: center; flex-wrap: wrap; gap: .6em; min-inline-size: 0; overflow-wrap: anywhere; padding: .6em .8em;
    border-start-start-radius: inherit; border-start-end-radius: inherit;
  }
  .mw-presentation--card .mw-presentation__band { background: var(--presentation-soft); }
  .mw-presentation--peek .mw-presentation__band { border-block-end: 1px solid var(--line); }
  .mw-presentation__band .mw-presentation__field { color: var(--muted); }
  .mw-presentation__band .mw-status { margin-inline-start: auto; }
  .mw-presentation :is(.mw-preview-card, .mw-presentation__notice, .mw-presentation__stale, .mw-presentation__unavailable) { overflow-wrap: anywhere; }
  .mw-presentation .mw-preview-card { inline-size: auto; min-inline-size: 0; max-inline-size: none; padding: 0; border: 0; box-shadow: none; background: none; }
  .mw-presentation:is(.mw-presentation--card, .mw-presentation--peek) > :not(.mw-presentation__band) { margin-inline: .8em; }
  .mw-presentation:is(.mw-presentation--card, .mw-presentation--peek) > :last-child { margin-block-end: .8em; }
  .mw-presentation__fields:empty, .mw-presentation .mw-preview-card p:empty { display: none; }
  .mw-presentation__stale { display: block; color: var(--muted); margin-block: .35em; }
  .mw-presentation__unavailable { display: flex; align-items: center; flex-wrap: wrap; gap: .6em; padding-block: .45em; }
  .mw-presentation__controls { display: flex; flex-wrap: wrap; align-items: start; gap: .45em; }
  .mw-presentation__control { display: grid; justify-items: start; min-inline-size: 0; }
  .mw-presentation__control [data-slot=button-label] { white-space: normal; overflow-wrap: anywhere; }
  .mw-presentation .mw-presentation__consequence { color: var(--muted); white-space: normal; overflow: visible; }
  .mw-presentation__more { position: relative; }
  .mw-presentation__more summary { display: grid; place-items: center; list-style: none; }
  .mw-presentation__more > .mw-menu {
    position: absolute; z-index: 2; inset-inline-end: 0; inset-block-start: 100%; inline-size: max-content; max-inline-size: min(16em, 75vw);
  }
  .mw-presentation__more .mw-menu__desc { white-space: pre-line; }
  .mw-presentation__notice { display: grid; gap: .4em; padding: .55em 0; border-block-start: 1px solid var(--line); }
  .mw-presentation__notice p { margin: 0; color: var(--muted); }
  @container (max-width: 30rem) {
    .mw-presentation--row .mw-item { grid-template-columns: auto minmax(0, 1fr); grid-template-areas: "owner title" ". fields" ". end"; }
    .mw-presentation--row .mw-item__end { flex-wrap: wrap; }
  }
`;
