export const PROJECT_OPERATIONS_STYLES = `
  @media (min-width: 761px) {
    body[data-desktop-shell="true"][data-desktop-surface="sessions"] {
      --desktop-project-header-height: var(--desktop-titlebar-height);
    }
    body[data-desktop-shell="true"][data-desktop-surface="sessions"] .navigator-project {
      height: var(--desktop-titlebar-height);
      min-height: var(--desktop-titlebar-height);
      grid-template-rows: var(--desktop-titlebar-height);
    }
    body[data-desktop-shell="true"][data-desktop-surface="sessions"] .navigator-native-row { display: none; }
    body[data-desktop-shell="true"][data-desktop-surface="sessions"] .navigator-project-primary {
      height: var(--desktop-titlebar-height);
      min-height: var(--desktop-titlebar-height);
      padding-inline: var(--desktop-project-safe-inline-start) 8px;
      border-bottom: 1px solid color-mix(in srgb, var(--line) 58%, transparent);
      grid-template-columns: minmax(0, 1fr) var(--desktop-titlebar-control-height);
    }
    body[data-desktop-shell="true"][data-desktop-surface="sessions"] .navigator-project-notifications { display: none; }
  }

  .project-record-directory { min-height: 0; grid-template-rows: 72px 115px minmax(0, 1fr) 46px; }
  .project-record-directory:not([hidden]) { display: grid; }
  body[data-desktop-shell="true"] .project-record-directory .desktop-directory-heading { grid-template-columns: 24px minmax(0, 1fr) 24px; }
  .directory-heading-action { grid-column: 3; }
  .project-record-tools { min-width: 0; padding: 5px 6px 5px; display: grid; grid-template-columns: minmax(0, 1fr) 86px; align-items: center; gap: 5px; }
  .project-record-tools .tree-search input { height: 32px; padding-right: 34px; border: 0; background: var(--paper); font-size: 11px; }
  .project-record-tools .tree-search kbd { right: 6px; border: 0; background: transparent; font-size: 9px; }
  .project-record-filter select { width: 100%; height: 32px; padding: 0 5px; border: 0; border-radius: 7px; color: var(--muted); background: var(--paper); font-size: 10px; }
  .project-record-filter-menu { position: relative; min-width: 0; grid-column: 1 / -1; }
  .project-record-filter-menu > summary { min-height: 32px; padding: 0 8px; border-radius: 7px; color: var(--muted); background: var(--paper); display: flex; align-items: center; justify-content: center; gap: 5px; font-size: 10px; font-weight: 650; list-style: none; cursor: pointer; }
  .project-record-filter-menu > summary::-webkit-details-marker { display: none; }
  .project-record-filter-menu > summary svg { width: 13px; height: 13px; }
  .project-record-filter-menu[open] > summary { color: var(--blue-dark); background: var(--blue-soft); }
  .project-record-filter-menu > div { position: absolute; z-index: 30; top: 36px; right: 0; width: 218px; padding: 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); box-shadow: 0 12px 30px rgba(14, 18, 24, .16); display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .project-record-filter-menu label { color: var(--muted); display: grid; gap: 4px; font-size: 9px; }
  .project-record-filter-menu select { min-width: 0; height: 32px; padding: 0 6px; border: 1px solid var(--line); border-radius: 7px; color: var(--ink); background: var(--page); font-size: 10px; }
  .project-record-add-compact { display: none; }
  .project-record-scroll { min-height: 0; overflow: auto; padding: 4px 7px 12px; scrollbar-width: none; }
  .project-record-scroll::-webkit-scrollbar { display: none; }
  .project-record-row { width: 100%; min-width: 0; min-height: 92px; padding: 12px 9px; border: 0; border-radius: 9px; color: var(--ink-soft); background: transparent; display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: minmax(42px, auto) 22px; column-gap: 9px; align-items: center; text-align: left; cursor: pointer; }
  body[data-desktop-shell="true"] .project-record-directory .project-record-row:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 5%, transparent); }
  body[data-desktop-shell="true"] .project-record-directory .project-record-row.is-selected { color: var(--ink); background: var(--paper); box-shadow: 0 1px 2px color-mix(in srgb, var(--shadow-color) 28%, transparent); }
  .project-record-select { min-width: 0; min-height: 22px; color: inherit; display: block; }
  .project-record-select > span { min-width: 0; display: grid; gap: 3px; }
  .project-record-select strong, .project-record-select small, .project-record-meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .project-record-select strong { color: inherit; font-size: 12px; font-weight: 640; line-height: 1.35; }
  .project-record-row.is-selected .project-record-select strong { font-weight: 690; }
  .project-record-select small { color: var(--faint); font-size: 9.5px; line-height: 1.35; }
  body[data-desktop-shell="true"] .project-record-directory .project-record-state--healthy { color: var(--green); border-color: color-mix(in srgb, var(--green) 32%, var(--line)); background: var(--green-soft); }
  body[data-desktop-shell="true"] .project-record-directory :is(.project-record-state--missing, .project-record-state--conflict) { color: var(--red); border-color: color-mix(in srgb, var(--red) 30%, var(--line)); background: var(--red-soft); }
  .project-record-meta { grid-column: 1 / -1; min-width: 0; color: var(--faint); display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; font-size: 9.5px; line-height: 1.35; }
  .project-record-meta time { font-variant-numeric: tabular-nums; white-space: nowrap; }
  body[data-desktop-shell="true"] .project-record-directory .project-record-row:focus-visible { outline: 2px solid color-mix(in srgb, var(--blue) 72%, transparent); outline-offset: -2px; box-shadow: none; }
  html[data-resolved-theme="light"] body[data-desktop-shell="true"] .project-record-directory .project-record-row.is-selected { background: color-mix(in srgb, var(--blue) 8%, transparent); box-shadow: none; }
  .project-record-empty { min-height: 0; padding: 36px 18px; color: var(--muted); display: grid; align-content: start; justify-items: center; gap: 7px; text-align: center; }
  .project-record-empty > svg { font-size: 24px; }
  .project-record-empty strong { color: var(--ink); font-size: 13px; }
  .project-record-empty p { max-width: 28ch; margin: 0; font-size: 10px; }
  .project-record-empty button { min-height: 30px; padding: 0 9px; border: 1px solid var(--line); border-radius: 7px; background: var(--paper); }
  .project-record-directory .tree-footer strong { color: var(--ink); font-variant-numeric: tabular-nums; }

  .project-operation-surface { min-height: 100%; }
  body[data-desktop-shell="true"][data-desktop-surface="sessions"] .project-operation-document { width: min(calc(100% - 8px), 1104px); margin: 0 auto 0 8px; padding: 0; box-sizing: border-box; gap: 10px; }
  .project-operation-hero { min-height: 141px; padding-bottom: 0; }
  .project-operation-hero .goal-header { padding: 24px 0 14px; }
  .project-operation-hero .goal-title-facts { flex-wrap: wrap; }
  .project-operation-hero .goal-title-actions { flex-wrap: wrap; }
  .project-operation-hero .goal-title-actions .goal-primary-action,
  .project-operation-hero .goal-title-actions .document-action { min-height: 34px; margin: 0; white-space: nowrap; }
  .project-operation-hero .goal-title-actions button:disabled { opacity: .42; cursor: not-allowed; }
  .operation-action-status { margin: 8px 0 0; color: var(--muted); font-size: 10px; }
  .operation-action-status.is-error { color: var(--red); }
  body[data-desktop-shell="true"][data-desktop-surface="sessions"] .project-operation-layout { padding-inline: 0; grid-template-columns: minmax(0, 1fr) minmax(270px, 303px); align-items: start; gap: 18px; }
  body[data-desktop-shell="true"][data-desktop-surface="sessions"] .project-operation-layout .goal-focus-aside { margin: 0; padding: 0; border: 0; display: grid; align-content: start; gap: 14px; }
  body[data-desktop-shell="true"][data-desktop-surface="sessions"] .session-execution { min-width: 0; min-height: 560px; padding: 21px 20px 28px; border: 1px solid var(--line); border-radius: 14px; background: var(--paper); box-shadow: var(--shadow-soft); }
  .session-execution > header { align-items: center; gap: 18px; }
  .session-execution > header > div:first-child { min-width: 72px; }
  .session-execution > header h2 { white-space: nowrap; }
  .operation-content-controls { min-width: min(100%, 360px); display: flex; justify-content: flex-end; gap: 7px; }
  .operation-content-search { position: relative; min-width: 184px; display: flex; align-items: center; }
  .operation-content-search svg { position: absolute; left: 9px; color: var(--muted); pointer-events: none; }
  .operation-content-search input { width: 100%; height: 34px; padding: 0 9px 0 28px; border: 1px solid var(--line); border-radius: 8px; color: var(--ink); background: var(--page); font-size: 11px; }
  .operation-content-search input:focus, .operation-content-filter select:focus { border-color: var(--blue); outline: none; }
  .operation-content-filter { position: relative; }
  .operation-content-filter > span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .operation-content-filter select { width: 112px; height: 34px; padding: 0 28px 0 9px; border: 1px solid var(--line); border-radius: 8px; color: var(--ink-soft); background: var(--page); font-size: 10.5px; }
  .session-content-body { min-width: 0; padding-top: 53px; }
  .session-transcript { width: 100%; max-width: none; min-width: 0; margin: 0; }
  .session-content-warning { margin: 0 0 18px 76px; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--red) 24%, var(--line)); border-radius: 8px; color: var(--red); background: color-mix(in srgb, var(--red) 7%, transparent); font-size: 11px; line-height: 1.55; }
  .session-content-summary { margin: 0 0 18px 76px; padding: 9px 12px; border-radius: 8px; color: var(--ink-soft); background: color-mix(in srgb, var(--accent) 7%, var(--rail)); font-size: 11px; line-height: 1.55; }
  .session-day-group + .session-day-group { margin-top: 28px; }
  .session-day-heading { min-height: 34px; margin: 0; display: grid; grid-template-columns: 58px 26px minmax(0, 1fr); gap: 12px; align-items: center; }
  .session-day-heading::after { content: ""; grid-column: 3; grid-row: 1; width: 100%; height: 1px; background: var(--line); }
  .session-day-heading time { z-index: 1; grid-column: 3; grid-row: 1; justify-self: start; width: max-content; padding: 4px 11px; border-radius: 999px; color: var(--muted); background: var(--rail); font-size: 10.5px; font-weight: 680; letter-spacing: .01em; }
  .session-timeline-event { min-width: 0; display: grid; grid-template-columns: 58px 26px minmax(0, 1fr); gap: 12px; align-items: stretch; }
  .session-timeline-event + .session-timeline-event { margin-top: 0; }
  .session-event-time { padding-top: 17px; color: var(--faint); text-align: right; font-size: 10px; font-variant-numeric: tabular-nums; }
  .session-event-track { position: relative; display: flex; justify-content: center; }
  .session-event-track::before { content: ""; position: absolute; inset: 0 auto 0 50%; width: 1px; background: var(--line); transform: translateX(-50%); }
  .session-event-track > span { position: relative; z-index: 1; width: 22px; height: 22px; margin-top: 11px; border: 1px solid currentColor; border-radius: 50%; color: var(--muted); background: var(--paper); display: grid; place-items: center; box-shadow: 0 0 0 3px var(--paper); }
  .session-event-track > span svg { width: 12px; height: 12px; stroke-width: 2; }
  .session-event--user_message .session-event-track > span { color: var(--blue-dark); background: var(--blue-soft); }
  .session-event--runtime_message .session-event-track > span { color: color-mix(in srgb, var(--blue) 76%, var(--green)); background: color-mix(in srgb, var(--blue-soft) 68%, var(--paper)); }
  .session-event--tool .session-event-track > span, .session-event--approval .session-event-track > span { color: var(--amber); background: var(--amber-soft); }
  .session-event--artifact .session-event-track > span { color: var(--blue-dark); background: var(--blue-soft); }
  .session-event--terminal_output .session-event-track > span { color: var(--muted); background: var(--rail); }
  .session-event--status .session-event-track > span { color: var(--green); background: var(--green-soft); }
  .session-event-card { min-width: 0; padding: 13px 16px 15px; border: 1px solid transparent; border-radius: 10px; }
  .session-event-card > header { min-width: 0; display: flex; align-items: baseline; justify-content: space-between; gap: 8px 16px; }
  .session-event-identity { min-width: 0; display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; }
  .session-event-identity strong { min-width: 0; color: var(--ink); overflow-wrap: anywhere; font-size: 11.5px; font-weight: 720; }
  .session-event-identity small, .session-event-meta { color: var(--faint); font-size: 9.5px; }
  .session-event-card > p { max-width: 68ch; margin: 7px 0 0; color: var(--ink-soft); white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.6; }
  .session-event--user_message .session-event-card { padding: 10px 16px 12px; border-color: color-mix(in srgb, var(--blue) 17%, transparent); background: color-mix(in srgb, var(--blue-soft) 54%, transparent); }
  .session-event--runtime_message .session-event-card { padding-top: 11px; padding-bottom: 15px; }
  .session-event--runtime_message .session-event-card > p { color: var(--ink); font-size: 13.2px; line-height: 1.62; }
  .session-event-card--technical { margin: 0; padding: 0; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; }
  .session-event-card--technical details { min-width: 0; }
  .session-event-card--technical summary { min-height: 44px; padding: 5px 1px; color: var(--ink-soft); display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 9px 13px; align-items: center; list-style: none; cursor: pointer; }
  .session-event-card--technical summary::-webkit-details-marker { display: none; }
  .session-event-summary { min-width: 0; display: flex; align-items: baseline; flex-wrap: wrap; gap: 5px 10px; }
  .session-event-summary strong { color: var(--ink); overflow-wrap: anywhere; font-size: 11.5px; }
  .session-event-summary small { color: var(--faint); font-size: 9.5px; }
  .session-event-status { color: var(--green); font-size: 9.5px; font-weight: 690; white-space: nowrap; }
  .session-event-status.is-error { color: var(--red); }
  .session-event-disclosure { color: var(--blue-dark); display: inline-flex; align-items: center; gap: 4px; font-size: 9.5px; font-weight: 650; white-space: nowrap; }
  .session-event-disclosure svg { width: 11px; height: 11px; transition: transform .16s cubic-bezier(.16, 1, .3, 1); }
  .session-event-card--technical details[open] .session-event-disclosure svg { transform: rotate(180deg); }
  .session-event-card--technical pre { max-height: 420px; margin: 0 0 12px; padding: 13px 14px 16px; overflow: auto; border: 1px solid var(--line); border-radius: 8px; color: var(--ink-soft); background: var(--page); white-space: pre-wrap; overflow-wrap: anywhere; font: 10.5px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .session-event-card--compact { margin: 0; padding: 10px 1px 12px; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; }
  .session-event-card--compact > p { margin-top: 4px; color: var(--muted); font-size: 11.5px; line-height: 1.55; }
  .session-content-state { min-height: 360px; padding: 50px 24px; color: var(--muted); display: grid; grid-template-columns: 28px minmax(0, 420px); justify-content: center; align-content: center; gap: 12px; }
  .session-content-state > svg { font-size: 24px; }
  .session-content-state > div:only-child { grid-column: 1 / -1; width: min(100%, 420px); }
  .session-content-state h3 { margin: 0; color: var(--ink); font-size: 14px; }
  .session-content-state p { margin: 5px 0 0; font-size: 11px; line-height: 1.6; }
  .session-content-state button { margin-top: 12px; }
  .operation-search-empty { margin: 30px 0; color: var(--muted); text-align: center; }
  .operation-current-context { min-height: 350px; padding: 20px 18px; border: 0; border-radius: 14px; background: var(--paper); box-shadow: var(--shadow-soft); }
  .operation-current-context dd { align-items: start; gap: 6px; }
  .operation-current-context > header p { display: none; }
  .operation-current-context > header { align-items: start; display: flex; justify-content: space-between; gap: 10px; }
  .operation-current-context > header button { min-height: 28px; padding: 0; border: 0; color: var(--blue-dark); background: transparent; font-size: 9.5px; white-space: nowrap; }
  .operation-current-context dd button { min-height: 24px; padding: 0; border: 0; color: var(--blue-dark); background: transparent; font-size: 9.5px; justify-self: start; }
  .operation-current-context code { overflow-wrap: anywhere; font: 9.5px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .operation-goal-history { min-height: 358px; margin: 0; padding: 20px 18px; border: 0; border-radius: 14px; background: var(--paper); box-shadow: var(--shadow-soft); }
  .operation-goal-history > header > span { color: var(--muted); font-size: 9.5px; }
  .operation-history { margin: 0; padding: 0; list-style: none; }
  .operation-history li { padding: 9px 0; display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 8px; }
  .operation-history li + li { border-top: 1px solid var(--line); }
  .operation-history svg { color: var(--muted); font-size: 15px; }
  .operation-history li.is-current svg { color: var(--blue-dark); }
  .operation-history span { min-width: 0; display: grid; gap: 1px; }
  .operation-history strong { color: var(--ink); font-size: 10px; line-height: 1.35; }
  .operation-history small, .operation-aside-empty small { color: var(--faint); font-size: 9px; }
  .operation-aside-empty { padding: 12px 0; color: var(--muted); display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 3px 8px; }
  .operation-aside-empty strong { color: var(--ink); font-size: 10px; }
  .operation-aside-empty small { grid-column: 2; }
  .operation-identity { padding: 13px 14px; border-radius: 12px; background: var(--paper); box-shadow: var(--shadow-soft); }
  .operation-identity summary { color: var(--ink-soft); display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 680; cursor: pointer; }
  .operation-identity dl { margin: 9px 0 0; }
  .operation-identity dl > div { padding: 5px 0; display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 8px; font-size: 9.5px; }
  .operation-identity dt { color: var(--muted); }
  .operation-identity dd { margin: 0; overflow-wrap: anywhere; }
  .operation-archive { width: 100%; min-height: 34px; justify-content: center; }

  .project-operation-dialog { width: min(520px, calc(100vw - 28px)); max-height: calc(100dvh - 28px); padding: 0; border: 1px solid var(--control-border); border-radius: var(--radius-surface); color: var(--ink); background: var(--paper); box-shadow: var(--control-shadow); }
  .project-operation-dialog::backdrop { background: rgba(12, 16, 22, .52); }
  .project-operation-dialog form > header { padding: 16px 18px 13px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; gap: 12px; }
  .project-operation-dialog h2 { margin: 0; font-size: 16px; }
  .project-operation-dialog header p { margin: 3px 0 0; color: var(--muted); font-size: 10px; }
  .project-operation-dialog header button { width: 32px; height: 32px; padding: 0; border: 0; border-radius: 7px; background: transparent; }
  .project-operation-dialog form > section { padding: 16px 18px; display: grid; gap: 12px; }
  .project-operation-dialog label:not(.operation-confirm-check) { color: var(--muted); display: grid; gap: 5px; font-size: 10px; }
  .project-operation-dialog input:not([type="checkbox"]), .project-operation-dialog select { width: 100%; height: var(--control-h); padding: 0 9px; border: 1px solid var(--control-input); border-radius: var(--radius-control); color: var(--ink); background: var(--paper); }
  .operation-confirm-facts { margin: 0; }
  .operation-confirm-facts > div { padding: 7px 0; display: grid; grid-template-columns: 108px minmax(0, 1fr); gap: 10px; }
  .operation-confirm-facts > div + div { border-top: 1px solid var(--line); }
  .operation-confirm-facts dt { color: var(--muted); font-size: 10px; }
  .operation-confirm-facts dd { margin: 0; font-size: 11px; overflow-wrap: anywhere; }
  .operation-confirm-check { display: grid; grid-template-columns: 17px minmax(0, 1fr); gap: 8px; font-size: 10px; }
  .operation-confirm-check input { margin: 2px 0 0; accent-color: var(--blue); }
  .project-operation-dialog footer { padding: 11px 18px; border-top: 1px solid var(--line); display: flex; justify-content: flex-end; gap: 7px; }
  .project-operation-dialog footer button { min-height: var(--control-h); padding: 0 11px; border: 1px solid var(--control-border); border-radius: var(--radius-control); background: var(--control-fill); font-weight: 550; }
  .project-operation-dialog footer .button-primary { color: var(--action-ink); background: var(--action); border-color: var(--action); }
  .project-operation-dialog footer .button-primary:disabled { opacity: .42; }
  .session-handoff-dialog { width: min(980px, calc(100vw - 32px)); }
  .session-handoff-dialog form { height: min(760px, calc(100dvh - 32px)); display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
  .session-handoff-dialog form > section.session-handoff-review { min-height: 0; padding: 0; display: grid; grid-template-columns: minmax(250px, 31%) minmax(0, 1fr); gap: 0; }
  .session-handoff-controls { min-width: 0; padding: 18px; overflow: auto; border-right: 1px solid var(--line); display: grid; align-content: start; gap: 14px; }
  .session-handoff-controls .operation-confirm-facts > div { grid-template-columns: 88px minmax(0, 1fr); }
  .session-handoff-controls .operation-confirm-check { padding-top: 13px; border-top: 1px solid var(--line); }
  .session-handoff-editor { min-width: 0; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); background: var(--page); }
  .session-handoff-editor > header { padding: 14px 16px 11px; border-bottom: 1px solid var(--line); display: flex; align-items: start; justify-content: space-between; gap: 12px; }
  .session-handoff-editor h3 { margin: 0; font-size: 12px; }
  .session-handoff-editor header p { max-width: 62ch; margin: 3px 0 0; color: var(--muted); font-size: 9.5px; line-height: 1.45; }
  .session-handoff-editor header > span { flex: none; padding: 3px 7px; border-radius: 999px; color: var(--blue-dark); background: var(--blue-soft); font-size: 9px; font-weight: 700; }
  .session-handoff-editor textarea { width: 100%; min-height: 0; padding: 17px 18px 24px; resize: none; border: 0; outline: 0; color: var(--ink-soft); caret-color: var(--blue); background: transparent; font: 11px/1.62 ui-monospace, SFMono-Regular, Menlo, monospace; tab-size: 2; scrollbar-color: var(--line-strong) transparent; }
  .session-handoff-editor textarea:focus-visible { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--blue) 68%, transparent); }
  .session-handoff-editor textarea::selection { color: var(--ink); background: color-mix(in srgb, var(--blue) 24%, transparent); }
  .session-handoff-dialog[data-handoff-busy="true"] .session-handoff-editor textarea { opacity: .62; }
  .session-handoff-dialog footer [data-handoff-save]:disabled { opacity: .42; }
  .session-handoff-cancel { min-height: 30px; padding: 0; border: 0; color: var(--muted); background: transparent; justify-self: start; font-size: 9.5px; }
  .session-handoff-cancel:hover:not(:disabled) { color: var(--red); }
  .session-handoff-cancel:disabled { opacity: .42; }
  .session-add-native { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 8px; }
  .session-add-native > label { min-width: 0; }
  .session-add-native > button { min-height: 36px; margin: 0; white-space: nowrap; }
  .session-add-dialog { width: min(540px, calc(100vw - 28px)); transform: translateX(68px); }
  .session-add-dialog form > header { padding: 19px 21px 10px; border-bottom: 0; align-items: start; }
  .session-add-dialog form > header > button { width: 44px; height: 44px; border: 1px solid var(--line); border-radius: 10px; }
  .session-add-heading { min-width: 0; flex: 1; }
  .session-add-heading-row { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
  .session-add-heading-row [data-session-add-toggle] { min-height: 28px; padding: 0; border: 0; color: var(--blue-dark); background: transparent; font-size: 10px; white-space: nowrap; }
  .session-add-dialog form > section { padding: 10px 21px 14px; gap: 11px; }
  .session-add-field-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .operation-field-label { color: var(--muted); display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: 10px; }
  .operation-field-label small { color: var(--faint); font-size: 9px; }
  .session-workspace-field { min-width: 0; display: grid; gap: 5px; }
  .session-workspace-picker { position: relative; }
  .session-workspace-picker > summary { min-height: 52px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; color: var(--ink); background: var(--page); display: flex; align-items: center; justify-content: space-between; gap: 10px; list-style: none; cursor: pointer; }
  .session-workspace-picker > summary::-webkit-details-marker { display: none; }
  .session-workspace-picker > summary > span { min-width: 0; display: flex; align-items: center; gap: 9px; }
  .session-workspace-picker > summary > span > svg { flex: none; color: var(--muted); }
  .session-workspace-picker > summary > span > span { min-width: 0; display: grid; gap: 2px; }
  .session-workspace-picker > summary strong, .session-workspace-picker > summary small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .session-workspace-picker > summary strong { font-size: 11px; }
  .session-workspace-picker > summary small { color: var(--faint); font: 9.5px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .session-workspace-picker > summary > svg { flex: none; color: var(--faint); }
  .session-workspace-picker[open] > summary { border-color: color-mix(in srgb, var(--blue) 58%, var(--line)); }
  .session-workspace-options { position: static; z-index: 90; width: min(304px, 100%); max-height: min(260px, calc(100dvh - 442px)); margin-top: 5px; overflow: auto; padding: 5px; border: 1px solid var(--line-strong); border-radius: 9px; background: var(--paper); box-shadow: 0 15px 40px rgba(10, 15, 22, .2); }
  .session-workspace-options button { width: 100%; min-height: 48px; padding: 7px 8px; border: 0; border-radius: 7px; color: var(--ink-soft); background: transparent; display: flex; align-items: center; justify-content: space-between; gap: 10px; text-align: left; }
  .session-workspace-options button:hover:not(:disabled), .session-workspace-options button:focus-visible { color: var(--ink); background: color-mix(in srgb, var(--blue) 8%, transparent); }
  .session-workspace-options button:disabled { opacity: .48; cursor: not-allowed; }
  .session-workspace-options button > span { min-width: 0; display: flex; align-items: center; gap: 9px; }
  .session-workspace-options button > span > svg { flex: none; color: var(--muted); }
  .session-workspace-options button > span > span { min-width: 0; display: grid; gap: 1px; }
  .session-workspace-options strong, .session-workspace-options small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .session-workspace-options strong { font-size: 10.5px; }
  .session-workspace-options small { color: var(--faint); font: 9px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .workspace-choice-state { flex: none; color: var(--green); font-size: 9px; font-style: normal; }
  .workspace-choice-state--missing, .workspace-choice-state--conflict { color: var(--red); }
  .session-workspace-options [data-session-workspace-none], .session-workspace-options [data-session-workspace-custom] { border-top: 1px solid var(--line); border-radius: 0; }
  .session-workspace-empty { margin: 0; padding: 12px 9px; color: var(--muted); font-size: 10px; }
  .session-workspace-custom { margin-top: 2px; }
  .session-add-confirm { padding-top: 2px; }
  .operation-capability-note, .operation-dialog-status { margin: 0; color: var(--muted); font-size: 10px; line-height: 1.5; }
  .operation-dialog-status.is-error { color: var(--red); }
  .project-operation-confirm-dialog { width: min(460px, calc(100vw - 28px)); }

  @media (min-width: 761px) and (max-width: 1180px) {
    .session-execution > header { align-items: stretch; flex-direction: column; gap: 12px; }
    .operation-content-controls { width: 100%; min-width: 0; justify-content: stretch; }
    .operation-content-search { min-width: 0; flex: 1 1 auto; }
  }

  @media (max-width: 760px) {
    .project-record-directory, .project-record-scroll { width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box; overflow-x: hidden; }
    .project-record-directory { grid-template-rows: 54px minmax(0, 1fr) 42px; }
    .project-record-directory .desktop-directory-heading { display: none !important; }
    .project-record-tools { padding: 5px 8px; grid-template-columns: minmax(0, 1fr) 44px 44px; }
    .project-record-tools .tree-search, .project-record-filter-menu { grid-column: auto; }
    .project-record-filter-menu > summary { width: 44px; height: 44px; padding: 0; }
    .project-record-filter-menu > summary span { display: none; }
    .project-record-filter-menu > div { position: fixed; z-index: 80; top: auto; right: 10px; bottom: 64px; left: 10px; width: auto; grid-template-columns: 1fr 1fr; }
    .project-record-add-compact { width: 44px; height: 44px; padding: 0; border: 0; border-radius: 7px; color: var(--ink); background: var(--paper); display: grid; place-items: center; }
    .project-record-tools .tree-search input, .project-record-filter select { height: 44px; }
    .project-record-row { width: 100%; min-width: 0; max-width: 100%; min-height: 64px; padding: 7px 8px; box-sizing: border-box; overflow: hidden; }
    .project-record-select, .project-record-meta { max-width: 100%; overflow: hidden; }
    .project-record-select strong { font-size: 12px; }
    .project-record-select small, .project-record-meta { font-size: 9.5px; }
    body[data-desktop-shell="true"][data-desktop-surface="sessions"] .project-operation-document { width: 100%; margin: 0; padding: 18px 14px 40px; }
    .project-operation-document, .project-operation-hero, .project-operation-layout, .project-operation-layout .goal-focus-main { max-width: 100%; box-sizing: border-box; }
    .project-operation-hero .goal-title-copy, .project-operation-hero .goal-title-copy h1, .project-operation-hero .goal-title-outcome { min-width: 0; max-width: 100%; }
    body[data-desktop-shell="true"] .project-operation-hero .goal-title-copy h1 { white-space: normal; overflow-wrap: anywhere; font-size: clamp(30px, 9vw, 38px); line-height: 1.16; }
    .project-operation-hero .goal-title-facts span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    body[data-desktop-shell="true"] .project-operation-hero .goal-title-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
    body[data-desktop-shell="true"] .project-operation-hero .goal-title-actions { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .project-operation-hero .goal-title-actions .goal-primary-action, .project-operation-hero .goal-title-actions .document-action { min-height: 44px; justify-content: center; }
    body[data-desktop-shell="true"][data-desktop-surface="sessions"] .project-operation-layout { grid-template-columns: minmax(0, 1fr); gap: 10px; }
    .project-operation-layout, .project-operation-layout .goal-focus-main, .session-execution, .session-content-body, .session-transcript { width: 100%; min-width: 0; max-width: 100%; }
    .project-operation-layout .goal-focus-main { order: 1; }
    .project-operation-layout .goal-focus-aside { order: 2; }
    .project-session-document .goal-focus-aside { display: contents; }
    .project-session-document .goal-focus-main { order: 1; }
    .project-session-document .operation-current-context { order: 2; }
    .project-session-document .operation-goal-history { order: 3; }
    .project-session-document .operation-identity { order: 4; }
    .project-session-document .operation-archive { order: 5; }
    body[data-desktop-shell="true"][data-desktop-surface="sessions"] .session-execution { min-height: 0; padding: 18px 14px 24px; }
    .session-execution > header { align-items: stretch; flex-direction: column; }
    .operation-content-controls { width: 100%; min-width: 0; }
    .operation-content-search { width: 100%; min-width: 0; }
    .operation-content-search input, .operation-content-filter select { min-height: 44px; }
    .operation-content-filter select { width: 108px; }
    .session-content-warning { margin-left: 0; }
    .session-content-summary { margin-left: 0; }
    .session-day-heading, .session-timeline-event { grid-template-columns: 42px 16px minmax(0, 1fr); gap: 7px; }
    .session-event-card { padding: 12px 12px 14px; }
    .session-event-card > p, .session-event--runtime_message .session-event-card > p { font-size: 13px; }
    .session-event-card--technical, .session-event-card--compact { padding: 0; }
    .session-event-card--compact { padding: 9px 10px; }
    .session-event-time { padding-top: 14px; font-size: 9px; }
    .session-content-state { min-height: 280px; padding: 34px 16px; }
    .operation-current-context dd button, .operation-archive { min-height: 44px; }
    .project-operation-dialog { width: 100vw; max-width: none; height: 100dvh; max-height: none; margin: 0; border: 0; border-radius: 0; }
    .session-add-dialog { transform: none; }
    .project-operation-dialog form > section { max-height: calc(100dvh - 132px); overflow: auto; }
    .session-handoff-dialog form { height: 100dvh; }
    .session-handoff-dialog form > section.session-handoff-review { max-height: none; overflow: auto; grid-template-columns: minmax(0, 1fr); }
    .session-handoff-controls { overflow: visible; border-right: 0; border-bottom: 1px solid var(--line); }
    .session-handoff-editor { min-height: 54dvh; }
    .session-handoff-editor textarea { min-height: 46dvh; resize: vertical; font-size: 10.5px; }
    .session-handoff-dialog footer { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .session-handoff-dialog footer .button-primary { grid-column: 1 / -1; grid-row: 1; }
    .project-operation-dialog header button, .project-operation-dialog footer button { min-width: 44px; min-height: 44px; }
    .session-add-field-grid { grid-template-columns: minmax(0, 1fr); }
    .session-add-heading-row { align-items: start; }
    .session-workspace-options { position: static; max-height: 240px; margin-top: 5px; box-shadow: none; }
    .session-add-native { grid-template-columns: minmax(0, 1fr); }
    .session-add-native > button { min-height: 44px; justify-content: center; }
  }

  @media (max-width: 320px) {
    body[data-desktop-shell="true"] .project-operation-hero .goal-title-actions { grid-template-columns: minmax(0, 1fr); }
    body[data-desktop-shell="true"] .project-session-document .goal-title-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .project-operation-hero .goal-title-actions .goal-primary-action,
    .project-operation-hero .goal-title-actions .document-action { width: 100%; }
  }

  @media (prefers-reduced-motion: reduce) {
    .project-record-row, .project-operation-dialog { transition: none; }
  }
`;
