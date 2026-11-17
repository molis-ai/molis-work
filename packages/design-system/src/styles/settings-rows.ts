/**
 * The rows of a settings document (the SDK's `renderSettingsSection`, `renderSettingRow`, `renderObjectRow`, `renderQuestionList`,
 * `renderListToolbar`; specs/screen-polish/p5-settings.md). Every settings page is the same thing: a title, then one card of rows, one
 * control to a row.
 * The component board's 设置的行 section is their specimen.
 */
export const SETTINGS_ROW_STYLES = `
  .mw-settings-section { min-width: 0; margin: 32px 0 0; padding: 0; border: 0; background: none; }
  .mw-settings-section[hidden] { display: none; }
  .mw-settings-section__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 32px; margin: 0 0 8px; }
  .mw-settings-section__head > h2 { min-width: 0; margin: 0; color: var(--ink); font-size: 15px; font-weight: var(--weight-title, 600); line-height: 1.4; letter-spacing: -.01em; }
  /* One card per section; the last hairline inside it is tucked under the card's own edge. */
  .mw-settings-section__rows { min-width: 0; padding: 0 16px; overflow: hidden; border: 1px solid var(--line); border-radius: var(--r-card, 12px); background: var(--paper); }
  .mw-settings-section__rows > :last-child { margin-bottom: -1px; }
  .mw-settings-section__note { margin: 0; padding: 16px 0; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; line-height: 1.5; }

  .mw-setting-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; min-width: 0; min-height: 60px; margin: 0; padding: 12px 0; border-bottom: 1px solid var(--line); box-sizing: border-box; }
  label.mw-setting-row { cursor: pointer; }
  .mw-setting-row__copy { flex: 1 1 200px; min-width: 0; display: grid; gap: 2px; }
  .mw-setting-row__copy > strong { color: var(--ink); font-size: 13px; font-weight: var(--weight-control, 500); line-height: 1.4; }
  .mw-setting-row__copy > span { color: var(--muted); font-size: 12px; font-weight: 400; line-height: 1.5; }
  .mw-setting-row__control { flex: none; max-width: 100%; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; color: var(--ink-soft); font-size: 13px; }
  .mw-setting-row[aria-disabled="true"] .mw-setting-row__copy > strong { color: var(--muted); }
  /* A row that opens a choice in place: the row above keeps no line, the opened part closes the pair. */
  .mw-setting-row[data-open="true"] { border-bottom-color: transparent; }
  /* A control keeps its own width, so several sit on one line instead of each taking the row. */
  .mw-setting-row__control > :is(input[type=text], input[type=search]) { width: 220px; }
  .mw-setting-row__control > input[type=number] { width: 120px; }
  .mw-setting-row__control > :is(select, .mw-select-picker) { width: auto; flex: 0 0 auto; }
  .mw-setting-row__control > .mw-select-picker > .mw-select-picker__trigger { width: auto; min-width: 112px; }
  .mw-setting-row__control [aria-expanded] > svg { width: 14px; height: 14px; transition: transform var(--dur-hover) var(--ease-quint); }
  .mw-setting-row__control [aria-expanded="true"] > svg { transform: rotate(180deg); }
  .mw-setting-row--sub { min-height: 36px; padding: 4px 0; border-bottom: 0; }
  .mw-setting-row--sub .mw-setting-row__copy > strong { color: var(--ink-soft); font-weight: 400; }
  .mw-setting-list { list-style: none; margin: 0; padding: 0; }
  .mw-setting-list > li { border-bottom: 1px solid var(--line); }
  .mw-setting-list > li > .mw-setting-row { border-bottom: 0; }
  .mw-setting-list > li > .mw-setting-row--sub { padding-bottom: 8px; }
  .mw-settings-subhead { margin: 0; padding: 16px 0 8px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12px; font-weight: var(--weight-control, 500); }
  .mw-settings-section__note:empty { display: none; }
  .mw-setting-open { padding: 0 0 12px; border-bottom: 1px solid var(--line); }
  .mw-setting-open__actions { display: flex; justify-content: flex-end; padding-top: 8px; }
  .mw-setting-open > .mw-choice-group { padding-bottom: 8px; }
  .mw-setting-open[hidden] { display: none; }
  .mw-setting-open .mw-choice-group { gap: 8px; }
  .mw-setting-open .mw-choice { min-width: 0; min-height: 32px; gap: 8px; font-size: 12px; background: var(--control-fill); box-shadow: none; }
  .mw-setting-open .mw-choice:hover:not([aria-pressed="true"]) { background: var(--nav-hover); box-shadow: none; }
  .mw-setting-open .mw-choice[aria-pressed="true"] { background: var(--action); color: var(--action-ink); }
  .mw-setting-open .mw-choice:not([aria-pressed="true"]) .mw-choice__check { display: none; }
  .mw-setting-open .mw-choice__check { order: -1; }

  .mw-object-row { min-width: 0; border-bottom: 1px solid var(--line); }
  .mw-object-row__head { display: flex; align-items: center; gap: 12px; min-width: 0; min-height: 60px; padding: 12px 0; box-sizing: border-box; list-style: none; }
  summary.mw-object-row__head { cursor: pointer; border-radius: 8px; }
  summary.mw-object-row__head::-webkit-details-marker { display: none; }
  summary.mw-object-row__head:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
  .mw-object-row__tile { flex: none; width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; overflow: hidden; background: var(--control-fill); color: var(--ink-soft); }
  .mw-object-row__tile :is(svg, img) { width: 16px; height: 16px; }
  .mw-object-row__copy { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .mw-object-row__copy > strong { overflow: hidden; color: var(--ink); font-size: 13px; font-weight: var(--weight-control, 500); line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
  .mw-object-row__copy > span { overflow: hidden; color: var(--muted); font-size: 12px; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
  .mw-object-row__state { flex: none; display: inline-flex; align-items: center; gap: 8px; color: var(--ink-soft); font-size: 12px; white-space: nowrap; }
  .mw-object-row__state > i { width: 6px; height: 6px; border-radius: 50%; background: var(--line-strong); }
  .mw-object-row__state > svg { flex: none; width: 14px; height: 14px; }
  .mw-object-row__state[data-mw-state] > :is(i, svg:not(.mw-state-ring)) { display: none; }
  .mw-object-row__state[data-tone="ok"] > i { background: var(--green); }
  .mw-object-row__state[data-tone="attention"] { color: var(--tone-attention, var(--amber)); }
  .mw-object-row__state[data-tone="bad"] { color: var(--red); font-weight: var(--weight-control, 500); }
  .mw-object-row__action { flex: none; display: flex; align-items: center; gap: 8px; }
  .mw-object-row__chevron { flex: none; display: grid; color: var(--faint); transition: transform var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint); }
  .mw-object-row__chevron svg { width: 14px; height: 14px; }
  summary.mw-object-row__head:hover .mw-object-row__chevron { color: var(--ink-soft); }
  .mw-object-row[open] > summary .mw-object-row__chevron { transform: rotate(90deg); color: var(--ink-soft); }
  .mw-object-row__body { min-width: 0; margin: 0 0 0 44px; padding: 0 0 12px; }
  .mw-object-row--plain > .mw-object-row__body { margin-left: 0; }
  .mw-object-row--alert .mw-object-row__tile { color: var(--red); }

  .mw-question-list { margin: 0; display: grid; }
  .mw-question { display: grid; grid-template-columns: 96px minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 36px; }
  .mw-question > dt { color: var(--muted); font-size: 12px; }
  .mw-question > dd { min-width: 0; margin: 0; color: var(--ink); font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
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
    .mw-object-row__head { flex-wrap: wrap; }
    .mw-object-row__copy { flex-basis: calc(100% - 44px); }
    .mw-object-row__body { margin-left: 0; }
    .mw-question { grid-template-columns: minmax(0, 1fr) auto; gap: 0 12px; padding: 8px 0; }
    .mw-question > dt { grid-column: 1 / -1; }
    .mw-list-toolbar__more-body { left: 0; right: auto; }
    .mw-list-row { grid-template-columns: minmax(0, 1fr); }
  }
  @media (prefers-reduced-motion: reduce) {
    .mw-object-row__chevron, .mw-list-toolbar__more > summary > svg, .mw-setting-row__control [aria-expanded] > svg { transition: none; }
  }
`;
