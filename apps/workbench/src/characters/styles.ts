/**
 * The role page's arrangement (docs/design/role-scope, plan C): settings rows and sections, the right drawer, insets that open under
 * what opened them, and the import and run dialogs. Every control is the board's; the source ladder and the note are its parts
 * (SOURCE_LADDER_STYLES). Tokens only.
 */
export const CHARACTERS_STYLES = `
  .settings-content > .roles-page, .desktop-work-surface.roles-page { display: block; width: 100%; max-width: 760px; margin-inline: auto; }
  .desktop-work-surface.roles-page[hidden] { display: none; }
  .roles-page .settings-heading p, .roles-hint { text-wrap: pretty; }
  /* The page's empty list is a stage empty state: centred, its actions too (order audit, VUX-46). */
  .roles-page .mw-empty { justify-items: center; text-align: center; }
  .roles-page .mw-empty__actions { justify-content: center; }
  .roles-hint { margin: 4px 0 12px; color: var(--muted); font-size: 13px; line-height: 1.6; }
  .roles-page .mw-settings-section__head { flex-wrap: wrap; gap: 8px 12px; }
  .roles-page .mw-settings-section__head > h2 { margin: 0 auto 0 0; }
  .roles-page .mw-settings-section__head > :not(h2) { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .roles-page .mw-settings-section__rows > .mw-alert { margin: 12px 0; }
  /* POLISH-30: what a section's card starts or ends with keeps clear of the card's edge. */
  .roles-page .mw-settings-section__rows > .roles-hint { margin: 0; padding: 12px 0 8px; }
  .roles-page .mw-settings-section__rows > :is(.roles-builtin-list, .roles-inset, .mw-empty):last-child { margin-bottom: 0; padding-bottom: 8px; }
  .roles-page .mw-alert .mw-alert__actions { margin-top: 8px; }
  .roles-ladder { padding: 4px 0 12px; }
  /* The name and its facts keep a readable width; when the row's actions do not fit beside them, they wrap under it, right-aligned. */
  /* A role is this page's own row (an avatar, a name with its mark, a state, several actions), on a setting row's height, padding and line. */
  .roles-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; min-width: 0; min-height: 60px; margin: 0; padding: 12px 0; border-bottom: 1px solid var(--line); box-sizing: border-box; }
  .roles-row .settings-record-title { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1 1 14rem; }
  .roles-row .settings-record-title h3 { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; font-size: 14px; overflow-wrap: anywhere; }
  .roles-row .settings-record-title p { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
  .roles-row .mw-avatar { flex: none; width: 32px; height: 32px; font-size: 13px; }
  .roles-row__acts { display: flex; flex: none; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; max-width: 100%; margin-left: auto; }
  .roles-row:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; border-radius: var(--r-row, 10px); }
  .roles-row:focus:not(:focus-visible) { outline: none; }
  .roles-row.is-flash { animation: roles-flash var(--dur-reveal) var(--ease-standard); }
  @keyframes roles-flash { from { background: var(--accent-soft); } }
  .roles-inset { margin: 8px 0 12px; padding: 12px; border: 1px solid var(--line); border-radius: var(--r-card); background: var(--surface-soft); animation: craft-drop var(--dur-move) var(--ease-standard); }
  .mw-alert .roles-inset { margin-bottom: 0; background: var(--paper); }
  .roles-inset__title { margin: 0 0 8px; color: var(--ink-soft); font-size: 13px; line-height: 1.6; }
  .roles-inset__title:focus { outline: none; }
  .roles-inset .roles-row { min-height: 0; padding: 8px 0; }
  .roles-inset__end { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 8px; }
  .roles-fact { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 6px 0; font-size: 13px; }
  .roles-fact + .roles-fact { border-top: 1px solid var(--line); }
  .roles-fact > :last-child { color: var(--muted); font-size: 12px; text-align: end; }
  .roles-diff { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
  .roles-diff section { min-width: 0; padding: 12px; border: 1px solid var(--line); border-radius: var(--r-card); background: var(--surface-soft); }
  .roles-diff h4 { margin: 0 0 6px; color: var(--muted); font-size: 12px; font-weight: var(--weight-control); }
  .roles-diff p { margin: 0; font-size: 13px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
  .roles-more { position: relative; display: inline-flex; }
  .roles-more .mw-menu { position: absolute; top: calc(100% + 4px); right: 0; z-index: 20; min-width: 12rem; animation: craft-drop var(--dur-move) var(--ease-standard); }
  .roles-notice { position: sticky; bottom: 12px; z-index: 3; width: fit-content; max-width: 100%; margin: 12px auto 0; padding: 8px 14px; border-radius: 10px; background: var(--action); color: var(--action-ink); font-size: 12px; box-shadow: var(--shadow-soft, var(--shadow)); }
  .roles-notice:empty { display: none; }
  .roles-builtin-list { display: grid; gap: 2px; }
  .characters-row { display: grid; grid-template-columns: minmax(0, 1fr) auto 14px; align-items: center; gap: 12px; min-height: 48px; padding: 8px 10px; border-radius: 10px; color: var(--ink); text-decoration: none; transition: background-color var(--dur-hover) var(--ease-quint); }
  .characters-row:hover, .characters-row:focus-visible { background: var(--nav-hover); }
  .characters-row:focus-visible { outline: var(--focus-stroke); outline-offset: -2px; }
  .characters-row-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .characters-row-copy strong { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .characters-row-copy small { font-size: 12px; color: var(--muted); }
  .characters-row-meta { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; }
  .characters-row-chevron { width: 14px; height: 14px; color: var(--faint); }
  .characters-tag { padding: 1px 8px; border-radius: 6px; box-shadow: 0 0 0 1px var(--line); color: var(--ink-soft); font-size: 11px; line-height: 18px; white-space: nowrap; }
  .characters-tag--quiet { color: var(--muted); }
  .characters-tag--attention { color: var(--amber); box-shadow: 0 0 0 1px color-mix(in srgb, var(--amber) 34%, transparent); }
  .characters-group-label { margin: 12px 10px 4px; font-size: 12px; font-weight: 500; color: var(--muted); }
  @media (max-width: 760px) { .characters-row { grid-template-columns: minmax(0, 1fr) 14px; } .characters-row-meta { grid-column: 1; justify-content: flex-start; } .characters-row-chevron { grid-row: 1; grid-column: 2; } }
  .roles-link { color: var(--accent); font-size: 12px; text-underline-offset: 3px; }
  .roles-inline { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
  dialog.roles-drawer { width: min(520px, 100vw); }
  .roles-drawer .mw-drawer__shell { display: flex; flex-direction: column; }
  .roles-drawer__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .roles-drawer__title { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .roles-drawer__title .mw-avatar { flex: none; width: 40px; height: 40px; font-size: 15px; }
  .roles-drawer__title h2 { margin: 0; font-size: 18px; overflow-wrap: anywhere; }
  .roles-drawer__title p { margin: 2px 0 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
  .roles-drawer__body { display: flex; flex-direction: column; gap: 20px; }
  .roles-drawer__notices:empty { display: none; }
  .roles-drawer__notices { display: grid; gap: 8px; }
  .roles-dsec { display: grid; gap: 8px; min-width: 0; }
  .roles-dsec[hidden] { display: none; }
  .roles-dsec__head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-height: 28px; }
  .roles-dsec__head h3, .roles-dsec > h3 { margin: 0 auto 0 0; font-size: 13px; font-weight: var(--weight-title); }
  .roles-field { display: block; }
  .roles-field[hidden] { display: none; }
  .roles-field__k { display: block; margin-bottom: 4px; color: var(--muted); font-size: 12px; }
  .roles-field :is(input, textarea) { width: 100%; }
  .roles-field textarea { min-height: 140px; resize: vertical; line-height: 1.6; }
  .roles-versions .mw-collapsible__body { display: grid; gap: 4px; }
  .roles-ver { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; border-radius: var(--r-row); }
  .roles-ver > span { display: grid; gap: 2px; min-width: 0; }
  .roles-ver strong { font-size: 13px; font-variant-numeric: tabular-nums; }
  .roles-ver small { color: var(--muted); font-size: 12px; }
  .roles-drawer__foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; border-top: 1px solid var(--line); padding-top: 12px; }
  .roles-drawer__foot.is-asking { background: color-mix(in srgb, var(--amber) 8%, var(--paper)); }
  .roles-impact { display: flex; align-items: flex-start; gap: 6px; flex: 1 1 100%; margin: 0; color: var(--ink-soft); font-size: 12px; line-height: 1.5; }
  .roles-impact svg { flex: none; width: 13px; height: 13px; margin-top: 2px; color: var(--muted); }
  .roles-where { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .roles-where__k { color: var(--muted); font-size: 12px; }
  .roles-btns { display: flex; flex-wrap: wrap; gap: 8px; margin-left: auto; }
  .roles-ask { display: grid; gap: 4px; width: 100%; animation: craft-rise var(--dur-move) var(--ease-standard); }
  .roles-ask__title { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--ink); font-size: 13px; font-weight: var(--weight-title); }
  .roles-ask__title:focus { outline: none; }
  .roles-ask__title:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; border-radius: 4px; }
  .roles-ask__title svg { flex: none; width: 16px; height: 16px; color: var(--amber); }
  .roles-ask__body { margin: 0 0 8px 24px; color: var(--ink-soft); font-size: 12px; line-height: 1.6; }
  @media (prefers-reduced-motion: reduce) { .roles-inset, .roles-more .mw-menu, .roles-ask, .roles-row.is-flash { animation: none; } }
  @media (max-width: 759px) { .roles-diff { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 599px) { .roles-btns { width: 100%; justify-content: flex-end; } }
  .characters-import-dialog { width: min(62rem, calc(100vw - 32px)) !important; }
  .characters-dialog { width: min(42rem, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow: auto; }
  .characters-dialog .mw-form__body { display: flex; flex-direction: column; gap: 16px; }
  .characters-dialog label { display: flex; flex-direction: column; gap: 8px; font-size: 12px; }
  .characters-dialog textarea { width: 100%; min-height: 110px; }
  .characters-dialog p { font-size: 12px; color: var(--muted); }
  .characters-dialog pre { white-space: pre-wrap; overflow-wrap: anywhere; font-family: inherit; line-height: 1.65; max-height: 45vh; overflow: auto; }
  .characters-sources { display: flex; flex-wrap: wrap; gap: 8px; }
  .characters-sources button { white-space: normal; text-align: left; }
  .characters-sources button[aria-pressed="true"] { border-color: var(--accent); background: var(--nav-active); }
  .characters-import-item { padding: 12px 0; border-top: 1px solid var(--line); }
  .characters-import-item > label { flex-direction: row; align-items: center; color: var(--ink); }
  .characters-import-item small { display: block; overflow-wrap: anywhere; color: var(--muted); margin: 4px 0; }
  .characters-import-item pre { background: var(--paper); padding: 12px; font: 12px/1.65 ui-monospace, monospace; }
  .characters-location { font-size: 12px; }
  .characters-location label { margin-top: 12px; }
  .characters-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .characters-run-modes { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .characters-run-modes > section { border-top: 1px solid var(--line); padding-top: 12px; }
  .characters-run-modes h3 { font-size: 15px; margin: 8px 0; }
  [data-character-source-files] details { font-size: 12px; margin: 8px 0; }
  [data-character-source-files] pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 22rem; overflow: auto; font-size: 12px; line-height: 1.65; }
  .characters-terminal { height: 420px; min-width: 0; overflow: hidden; position: relative; background: var(--paper); }
  .characters-terminal .tui-xterm { position: absolute; inset: 0; }
  .characters-terminal-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 12px; }
  [data-character-native-runs] { display: flex; gap: 8px; flex-wrap: wrap; }
  @media (max-width: 640px) { .characters-run-modes { grid-template-columns: 1fr; } .characters-terminal { height: 350px; } }
`;
