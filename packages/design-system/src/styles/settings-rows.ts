/**
 * The rows of a settings document (the SDK's `renderSettingsSection`, `renderSettingRow`, `renderObjectRow`, `renderQuestionList`,
 * `renderListToolbar`; specs/screen-polish/p5-settings.md). Every settings page is the same thing: a title, then one card of rows, one
 * control to a row. Both rows that open are `<details>`: an object row folds on the shared clock (`DISCLOSURE_STYLES`), and what
 * a setting row opens onto rises in without a height animation (`craft-rise`), as the plan's motion table has it.
 * The component board's 设置的行 section is their specimen. They are the only setting rows there are: a page that needs a row of
 * another shape (a folder, a role, a project's permit) gives it its own class and borrows none of these.
 */
export const SETTINGS_DOCUMENT_STYLES = `
  .mw-settings-section { min-width: 0; margin: 32px 0 0; padding: 0; border: 0; background: none; }
  .mw-settings-section[hidden] { display: none; }
  .mw-settings-section__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 32px; margin: 0 0 8px; }
  .mw-settings-section__head > h2 { min-width: 0; margin: 0; color: var(--ink); font-size: 15px; font-weight: var(--weight-title, 600); line-height: 1.4; letter-spacing: -.01em; }
  /* One card per section; the last hairline inside it is tucked under the card's own edge. The last thing shown, that is: a message
     kept hidden at the end of the card (an error that has not happened) or a template is not it. The rule weighs what
     a plain last-child rule weighed, so a page's own margin on its last block still wins as it did. */
  .mw-settings-section__rows { min-width: 0; padding: 0 16px; overflow: hidden; border: 1px solid var(--line); border-radius: var(--r-card, 12px); background: var(--paper); }
  :root[data-resolved-theme="dark"] .mw-settings-section__rows { box-shadow: inset 0 1px 0 var(--edge-highlight); }
  .mw-settings-section__rows > :not([hidden], template, :empty):where(:not(:has(~ :not([hidden], template, :empty)))) { margin-bottom: -1px; }
  .mw-settings-section__note { margin: 0; padding: 16px 0; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; line-height: 1.5; }
  /* What a card holds that is not a row (a form, a group under its own small heading): ruled off like a row, on the note's padding. */
  .mw-settings-section__block { min-width: 0; margin: 0; padding: 16px 0; border-bottom: 1px solid var(--line); color: var(--ink-soft); font-size: 13px; line-height: 1.5; }

  .mw-setting-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; min-width: 0; min-height: 60px; margin: 0; padding: 12px 0; border-bottom: 1px solid var(--line); box-sizing: border-box; }
  label.mw-setting-row { cursor: pointer; }
  /* A path or an id in the sentence breaks where it has to, so it never runs past the card. */
  .mw-setting-row__copy { flex: 1 1 200px; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; overflow-wrap: anywhere; }
  .mw-setting-row__copy > strong { color: var(--ink); font-size: 13px; font-weight: var(--weight-control, 500); line-height: 1.4; }
  .mw-setting-row__copy > span { color: var(--muted); font-size: 12px; font-weight: 400; line-height: 1.5; }
  .mw-setting-row__control { flex: none; max-width: 100%; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; color: var(--ink-soft); font-size: 13px; font-variant-numeric: tabular-nums; }
  .mw-setting-row[aria-disabled="true"] .mw-setting-row__copy > strong { color: var(--muted); }
  /* A row that opens a choice in place: while open the row keeps no line, the opened part closes the pair. */
  .mw-setting-fold { min-width: 0; }
  .mw-setting-fold > summary { list-style: none; cursor: pointer; border-radius: 8px; transition: background-color var(--dur-hover, 130ms) var(--ease-quint); }
  .mw-setting-fold > summary:hover { background: var(--nav-hover); margin-inline: -8px; padding-inline: 8px; }
  .mw-setting-fold > summary::-webkit-details-marker { display: none; }
  .mw-setting-fold > summary:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
  .mw-setting-fold[open] > summary { border-bottom-color: transparent; }
  .mw-setting-fold__label > svg { width: 14px; height: 14px; transition: transform var(--dur-hover) var(--ease-quint); }
  .mw-setting-fold[open] > summary .mw-setting-fold__label > svg { transform: rotate(180deg); }
  .mw-setting-fold[open] > .mw-setting-open { animation: craft-rise var(--dur-move) var(--ease-quint); }
  /* A control keeps its own width, so several sit on one line instead of each taking the row. */
  .mw-setting-row__control > :is(input[type=text], input[type=search]) { width: 220px; }
  .mw-setting-row__control > input[type=number] { width: 120px; }
  .mw-setting-row__control > :is(select, .mw-select-picker) { width: auto; flex: 0 0 auto; }
  .mw-setting-row__control > .mw-select-picker > .mw-select-picker__trigger { width: auto; min-width: 112px; }
  .mw-setting-row--sub { min-height: 36px; padding: 4px 0; border-bottom: 0; }
  .mw-setting-row--sub .mw-setting-row__copy > strong { color: var(--ink-soft); font-weight: 400; }
  .mw-setting-list { list-style: none; margin: 0; padding: 0; }
  .mw-setting-list > li { border-bottom: 1px solid var(--line); }
  .mw-setting-list > li > .mw-setting-row { border-bottom: 0; }
  .mw-setting-list > li > .mw-setting-row--sub { padding-bottom: 8px; }
  .mw-settings-subhead { margin: 0; padding: 16px 0 8px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; font-weight: var(--weight-control, 500); }
  :is(.mw-settings-section__note, .mw-settings-section__block):empty { display: none; }
  .mw-setting-open { padding: 0 0 12px; border-bottom: 1px solid var(--line); }
  .mw-setting-open__actions { display: flex; justify-content: flex-end; padding-top: 8px; }
  .mw-setting-open > .mw-choice-group { padding-bottom: 8px; }
  .mw-setting-open .mw-choice-group { gap: 8px; }
  .mw-setting-open .mw-choice { min-width: 0; min-height: 32px; gap: 8px; font-size: 12px; background: var(--control-fill); box-shadow: none; }
  .mw-setting-open .mw-choice:hover:not([aria-pressed="true"]) { background: var(--nav-hover); box-shadow: none; }
  .mw-setting-open .mw-choice[aria-pressed="true"] { background: var(--action); color: var(--action-ink); }
  .mw-setting-open .mw-choice:not([aria-pressed="true"]) .mw-choice__check { display: none; }
  .mw-setting-open .mw-choice__check { order: -1; }

  /* The row is a grid of what it says, what can be done, and the chevron. The part that opens it (the summary) runs under
     all three and leaves the middle one empty: the action sits there, beside the summary and never inside it. The
     <details> itself draws no box, so its summary and what it opens are the row's own cells: an engine that will not lay a
     <details> out as a grid (the desktop shell's WebKit before 18.4) has nothing to refuse. Where what it opens is wrapped
     (::details-content), the wrapper takes the cell instead. */
  .mw-object-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; grid-template-rows: auto auto auto; min-width: 0; border-bottom: 1px solid var(--line); }
  .mw-object-row__fold { display: contents; }
  .mw-object-row__fold::details-content { grid-area: 3 / 1 / 4 / -1; }
  .mw-object-row__head { grid-area: 1 / 1 / 2 / 2; display: flex; align-items: center; min-width: 0; min-height: 60px; padding: 12px 0; box-sizing: border-box; list-style: none; }
  summary.mw-object-row__head { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; cursor: pointer; border-radius: 8px; transition: background-color var(--dur-hover, 130ms) var(--ease-quint); }
  summary.mw-object-row__head:hover { background: var(--nav-hover); }
  summary.mw-object-row__head::-webkit-details-marker { display: none; }
  summary.mw-object-row__head:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
  .mw-object-row__main { grid-column: 1; flex: 1; display: flex; align-items: center; gap: 12px; min-width: 0; }
  .mw-object-row__tile { flex: none; width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; overflow: hidden; background: var(--control-fill); color: var(--ink-soft); }
  .mw-object-row__tile :is(svg, img) { width: 16px; height: 16px; }
  .mw-object-row__copy { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .mw-object-row__copy > strong { overflow: hidden; color: var(--ink); font-size: 13px; font-weight: var(--weight-control, 500); line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
  .mw-object-row__copy > span { overflow: hidden; color: var(--muted); font-size: 12px; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
  .mw-object-row__state { flex: none; display: inline-flex; align-items: center; gap: 8px; color: var(--ink-soft); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .mw-object-row__state > i { width: 6px; height: 6px; border-radius: 50%; background: var(--line-strong); }
  .mw-object-row__state > svg { flex: none; width: 14px; height: 14px; }
  .mw-object-row__state[data-mw-state] > :is(i, svg:not(.mw-state-ring)) { display: none; }
  .mw-object-row__state[data-tone="success"] > i { background: var(--green); }
  .mw-object-row__state[data-tone="warning"] { color: var(--tone-attention, var(--amber)); }
  .mw-object-row__state[data-tone="danger"] { color: var(--red); font-weight: var(--weight-control, 500); }
  .mw-object-row__action { grid-area: 1 / 2 / 2 / 3; display: flex; align-items: center; gap: 8px; min-height: 60px; margin-left: 12px; }
  .mw-object-row__chevron { grid-column: 3; display: grid; margin-left: 12px; color: var(--faint); transition: transform var(--dur-move) var(--ease-quint), color var(--dur-hover) var(--ease-quint); }
  .mw-object-row__chevron svg { width: 14px; height: 14px; }
  summary.mw-object-row__head:hover .mw-object-row__chevron { color: var(--ink-soft); }
  .mw-object-row__fold[open] > summary .mw-object-row__chevron { transform: rotate(90deg); color: var(--ink-soft); }
  .mw-object-row__body { grid-area: 3 / 1 / 4 / -1; min-width: 0; margin: 0 0 0 var(--text-start, 44px); padding: 0 0 12px; }
  .mw-object-row--plain .mw-object-row__body { margin-left: 0; }
  .mw-object-row--alert .mw-object-row__tile { color: var(--red); }

  .mw-question-list { margin: 0; display: grid; }
  .mw-question { display: grid; grid-template-columns: 96px minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 36px; }
  .mw-question > dt { color: var(--muted); font-size: 12px; }
  .mw-question > dd { min-width: 0; margin: 0; color: var(--ink); font-size: 13px; line-height: 1.5; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .mw-question > dd code { color: var(--ink-soft); font: 12px/1.5 var(--font-mono, ui-monospace, monospace); }
  .mw-question__action { display: flex; align-items: center; gap: 8px; }

  .mw-list-toolbar { min-width: 0; margin: 0 0 8px; }
  .mw-setting-open > .mw-list-toolbar { margin: 0 0 4px; }
  .mw-list-toolbar__main { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .mw-list-toolbar__search { flex: 1 1 200px; min-width: 0; display: flex; }
  .mw-list-toolbar__search > * { flex: 1; min-width: 0; }
  .mw-list-toolbar__main > .mw-select-picker { flex: 0 0 auto; width: auto; }
  .mw-list-toolbar__main > .mw-select-picker > .mw-select-picker__trigger { width: auto; min-width: 112px; }
  .mw-list-toolbar__more { position: relative; flex: none; }
  .mw-list-toolbar__more > summary { list-style: none; cursor: pointer; }
  .mw-list-toolbar__more > summary::-webkit-details-marker { display: none; }
  .mw-list-toolbar__more > summary > svg { width: 14px; height: 14px; transition: transform var(--dur-hover) var(--ease-quint); }
  .mw-list-toolbar__more[open] > summary { color: var(--ink); background: var(--nav-active); }
  .mw-list-toolbar__more[open] > summary > svg { transform: rotate(180deg); }
  .mw-list-toolbar__more-body { position: absolute; right: 0; top: calc(100% + 4px); z-index: 20; min-width: 220px; display: grid; gap: 8px; padding: 8px; border-radius: 12px; background: var(--popover, var(--paper)); box-shadow: var(--lift-3); }
  .mw-list-toolbar__end { flex: none; margin-left: auto; display: flex; align-items: center; gap: 8px; }
  .mw-list-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 12px; min-width: 0; padding: 12px 0; border-bottom: 1px solid var(--line); }

  @media (max-width: 600px) {
    /* No room beside the name: the state goes under it, and the action takes its own line between the head and what it opens. */
    .mw-object-row__main { flex-wrap: wrap; }
    .mw-object-row__copy { flex-basis: calc(100% - 44px); }
    .mw-object-row:not(.mw-object-row--plain) .mw-object-row__state { margin-left: 44px; }
    .mw-object-row__action { grid-area: 2 / 1 / 3 / -1; flex-wrap: wrap; min-height: 0; margin: -4px 0 12px 44px; }
    .mw-object-row--plain > .mw-object-row__action { margin-left: 0; }
    .mw-object-row__body { margin-left: 0; }
    .mw-question { grid-template-columns: minmax(0, 1fr) auto; gap: 0 12px; padding: 8px 0; }
    .mw-question > dt { grid-column: 1 / -1; }
    .mw-list-toolbar__more-body { left: 0; right: auto; }
    .mw-list-row { grid-template-columns: minmax(0, 1fr); }
  }
  /* A choice is a finger's target on a phone (DESIGN.md: 44px). */
  @media (max-width: 760px), (pointer: coarse) {
    .mw-setting-open .mw-choice { min-height: 44px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .mw-object-row__chevron, .mw-list-toolbar__more > summary > svg, .mw-setting-fold__label > svg { transition: none; }
    .mw-setting-fold[open] > .mw-setting-open { animation: none; }
  }
`;
