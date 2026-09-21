/** AP3 visual layer: source-feed. */
export const SOURCE_FEED_STYLES = `  /* Source → Feed → Inbox high-fidelity slice. Sources use the same single
     directory ledger as Goals and Items; configuration stays in the workface. */
  body[data-desktop-shell="true"] .source-directory {
    min-height: 0;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    background: transparent;
  }
  body[data-desktop-shell="true"] .source-directory:not([hidden]) { display: grid; }
  body[data-desktop-shell="true"] .source-directory-heading { grid-template-columns: 24px minmax(0, 1fr) 24px; }
  body[data-desktop-shell="true"] .source-add-trigger {
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 7px;
    color: var(--muted);
    background: transparent;
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  body[data-desktop-shell="true"] .source-add-trigger:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 6%, transparent); }
  body[data-desktop-shell="true"] .source-add-trigger:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
  body[data-desktop-shell="true"] .source-add-trigger svg { width: 13px; height: 13px; }
  body[data-desktop-shell="true"] .source-mobile-add { display: none; }
  body[data-desktop-shell="true"] .source-directory-tools { padding: 2px 6px 8px; display: grid; gap: 6px; }
  body[data-desktop-shell="true"] .source-filter-row { min-width: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 3px; }
  body[data-desktop-shell="true"] .source-filter-row button {
    min-width: 0;
    min-height: 28px;
    padding: 0 4px;
    border: 0;
    border-radius: 7px;
    color: var(--faint);
    background: transparent;
    overflow: hidden;
    font: inherit;
    font-size: 8.5px;
    font-weight: 400;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }
  body[data-desktop-shell="true"] .source-filter-row button:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 5%, transparent); }
  body[data-desktop-shell="true"] .source-filter-row button.is-active { color: var(--blue-dark); background: color-mix(in srgb, var(--blue) 10%, transparent); }
  body[data-desktop-shell="true"] .source-filter-row button:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
  body[data-desktop-shell="true"] .source-list { min-height: 0; padding: 1px 3px 8px; overflow-y: auto; }
  body[data-desktop-shell="true"] .source-list-item {
    width: 100%;
    min-width: 0;
    min-height: 78px;
    padding: 8px 7px;
    border: 0;
    border-radius: 10px;
    color: var(--ink-soft);
    background: transparent;
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto;
    align-items: start;
    gap: 7px;
    text-align: left;
    cursor: pointer;
  }
  body[data-desktop-shell="true"] .source-list-item:hover { background: color-mix(in srgb, var(--ink) 4%, transparent); }
  body[data-desktop-shell="true"] .source-list-item.is-selected {
    color: var(--ink);
    background: color-mix(in srgb, var(--blue) 10%, transparent);
    box-shadow: none;
  }
  body[data-desktop-shell="true"] .source-list-item:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; box-shadow: none; }
  body[data-desktop-shell="true"] .source-list-icon {
    width: 22px;
    height: 22px;
    border-radius: 7px;
    color: var(--muted);
    background: color-mix(in srgb, var(--paper) 66%, transparent);
    display: grid;
    place-items: center;
  }
  body[data-desktop-shell="true"] .source-list-icon svg { width: 11px; height: 11px; }
  body[data-desktop-shell="true"] .source-list-copy { min-width: 0; display: grid; gap: 2px; }
  body[data-desktop-shell="true"] .source-list-copy > span { min-width: 0; display: flex; align-items: center; gap: 5px; }
  body[data-desktop-shell="true"] .source-list-copy em { color: var(--blue-dark); font-size: 7.5px; font-style: normal; font-weight: 400; }
  body[data-desktop-shell="true"] .source-list-copy > span small { padding: 2px 4px; border-radius: 5px; color: var(--faint); background: color-mix(in srgb, var(--ink) 5%, transparent); }
  body[data-desktop-shell="true"] .source-list-copy strong,
  body[data-desktop-shell="true"] .source-list-copy p,
  body[data-desktop-shell="true"] .source-list-copy > small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  body[data-desktop-shell="true"] .source-list-copy strong { color: inherit; font-size: 11.5px; font-weight: 400; line-height: 1.35; }
  body[data-desktop-shell="true"] .source-list-copy p { margin: 0; color: var(--muted); font-size: 9px; }
  body[data-desktop-shell="true"] .source-list-copy small { color: var(--faint); font-size: 8px; line-height: 1.35; }
  body[data-desktop-shell="true"] .source-list-state { max-width: 68px; align-self: start; }
  body[data-desktop-shell="true"] .source-list-state[data-source-status="active"] { color: var(--green); }
  body[data-desktop-shell="true"] .source-list-state[data-source-status="attention"] { color: var(--red); }
  body[data-desktop-shell="true"] .source-list-state[data-source-status="syncing"] { color: var(--blue-dark); }
  body[data-desktop-shell="true"] .source-list-state[data-source-status="paused"] { color: var(--faint); }
  body[data-desktop-shell="true"] .feed-directory-footer small { display: inline-flex; align-items: center; gap: 6px; }
  body[data-desktop-shell="true"] .feed-directory-footer small button {
    min-height: 24px;
    padding: 0 4px;
    border: 0;
    color: var(--blue-dark);
    background: transparent;
    font: inherit;
    font-size: 8px;
    cursor: pointer;
  }
  body[data-desktop-shell="true"] .feed-directory-footer small button:hover { text-decoration: underline; text-underline-offset: 2px; }

  body[data-desktop-shell="true"] .source-workbench { width: 100%; background: var(--page); }
  body[data-desktop-shell="true"] .source-workbench:not([hidden]) { display: block; }
  body[data-desktop-shell="true"] .source-detail { width: min(100%, 1120px); margin: 0 auto; padding: 28px clamp(20px, 4vw, 52px) 72px; }
  body[data-desktop-shell="true"] .source-detail-header { padding: 8px 8px 22px; display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
  body[data-desktop-shell="true"] .source-detail-identity { min-width: 0; display: grid; grid-template-columns: 42px minmax(0, 1fr); align-items: start; gap: 13px; }
  body[data-desktop-shell="true"] .source-detail-mark { width: 42px; height: 42px; border-radius: 12px; color: var(--blue-dark); background: var(--paper); box-shadow: 0 4px 14px color-mix(in srgb, var(--shadow-color) 22%, transparent); display: grid; place-items: center; }
  body[data-desktop-shell="true"] .source-detail-mark svg { width: 18px; height: 18px; }
  body[data-desktop-shell="true"] .source-detail-labels { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  body[data-desktop-shell="true"] .source-detail-labels span,
  body[data-desktop-shell="true"] .source-detail-labels em { padding: 3px 6px; border-radius: 6px; font-size: 9px; font-style: normal; font-weight: 400; }
  body[data-desktop-shell="true"] .source-detail-labels span { color: var(--blue-dark); background: color-mix(in srgb, var(--blue) 10%, transparent); }
  body[data-desktop-shell="true"] .source-detail-labels em { color: var(--faint); background: color-mix(in srgb, var(--ink) 5%, transparent); }
  body[data-desktop-shell="true"] .source-detail-header h1 { margin: 7px 0 0; color: var(--ink); font-size: clamp(23px, 2.7vw, 32px); font-weight: 400; letter-spacing: -.03em; line-height: 1.16; }
  body[data-desktop-shell="true"] .source-detail-header p { max-width: 64ch; margin: 8px 0 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
  body[data-desktop-shell="true"] .source-detail-health { flex: 0 0 auto; padding: 7px 9px; border-radius: 9px; background: color-mix(in srgb, var(--paper) 62%, transparent); display: grid; justify-items: end; gap: 3px; }
  body[data-desktop-shell="true"] .source-detail-health strong { color: var(--green); font-size: 11px; font-weight: 400; }
  body[data-desktop-shell="true"] .source-detail-health[data-source-status="attention"] strong { color: var(--red); }
  body[data-desktop-shell="true"] .source-detail-health[data-source-status="syncing"] strong { color: var(--blue-dark); }
  body[data-desktop-shell="true"] .source-detail-health[data-source-status="paused"] strong { color: var(--faint); }
  body[data-desktop-shell="true"] .source-detail-health small { color: var(--faint); font-size: 9px; }
  body[data-desktop-shell="true"] .source-detail-tabs {
    width: fit-content;
    max-width: calc(100% - 16px);
    min-height: 34px;
    margin: 0 8px 10px;
    padding: 3px;
    border: 0;
    border-radius: 10px;
    background: color-mix(in srgb, var(--paper) 54%, transparent);
    display: flex;
    align-items: center;
    gap: 2px;
  }
  body[data-desktop-shell="true"] .source-detail-tabs button {
    min-height: 28px;
    padding: 0 10px;
    border: 0;
    border-radius: 8px;
    color: var(--faint);
    background: transparent;
    font: inherit;
    font-size: 10.5px;
    font-weight: 400;
    cursor: pointer;
  }
  body[data-desktop-shell="true"] .source-detail-tabs button:hover { color: var(--ink); }
  body[data-desktop-shell="true"] .source-detail-tabs button.is-active { color: var(--ink); background: var(--paper); box-shadow: var(--shadow-soft); }
  body[data-desktop-shell="true"] .source-detail-tabs button:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
  body[data-desktop-shell="true"] .source-detail-panels { min-height: 400px; }
  body[data-desktop-shell="true"] .source-detail-panel {
    min-height: 360px;
    padding: 24px 26px 28px;
    border-radius: 14px;
    background: var(--paper);
    box-shadow: 0 5px 16px color-mix(in srgb, var(--shadow-color) 27%, transparent);
  }
  body[data-desktop-shell="true"] .source-detail-panel[hidden] { display: none; }
  body[data-desktop-shell="true"] .source-panel-heading { margin: 0 0 14px; display: grid; gap: 4px; }
  body[data-desktop-shell="true"] .source-panel-heading h2 { margin: 0; color: var(--ink); font-size: 14px; font-weight: 400; }
  body[data-desktop-shell="true"] .source-panel-heading p { max-width: 68ch; margin: 0; color: var(--muted); font-size: 10px; line-height: 1.5; }
  body[data-desktop-shell="true"] .source-overview-section { margin-top: 22px; }
  body[data-desktop-shell="true"] .source-overview-ledger { margin: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 28px; }
  body[data-desktop-shell="true"] .source-overview-ledger > div { min-width: 0; padding: 12px 0; border-top: 1px solid color-mix(in srgb, var(--line) 64%, transparent); display: grid; grid-template-columns: minmax(96px, .42fr) minmax(0, 1fr); align-items: baseline; gap: 12px; }
  body[data-desktop-shell="true"] .source-overview-ledger dt { color: var(--faint); font-size: 9.5px; font-weight: 400; }
  body[data-desktop-shell="true"] .source-overview-ledger dd { min-width: 0; margin: 0; overflow: hidden; color: var(--ink-soft); font-size: 12px; font-weight: 400; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
  body[data-desktop-shell="true"] .source-now { padding: 0 0 22px; border-bottom: 1px solid color-mix(in srgb, var(--line) 64%, transparent); display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 16px; }
  body[data-desktop-shell="true"] .source-now h2,
  body[data-desktop-shell="true"] .source-message-list h2,
  body[data-desktop-shell="true"] .source-schedule-heading h2 { margin: 0; color: var(--ink); font-size: 15px; font-weight: 400; }
  body[data-desktop-shell="true"] .source-now p,
  body[data-desktop-shell="true"] .source-message-list header p,
  body[data-desktop-shell="true"] .source-schedule-heading p { margin: 5px 0 0; color: var(--muted); font-size: 10.5px; line-height: 1.55; }
  body[data-desktop-shell="true"] .source-runtime-actions summary {
    min-height: 34px;
    padding: 0 11px;
    border: 0;
    border-radius: 8px;
    color: var(--ink-soft);
    background: color-mix(in srgb, var(--rail) 74%, var(--paper));
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    font: inherit;
    font-size: 10px;
    font-weight: 400;
    cursor: pointer;
    list-style: none;
  }
  body[data-desktop-shell="true"] .source-runtime-actions summary:hover { color: var(--blue-dark); }
  body[data-desktop-shell="true"] .source-now .mw-btn svg,
  body[data-desktop-shell="true"] .source-message-list header .mw-btn svg { width: 12px; height: 12px; }
  body[data-desktop-shell="true"] .source-now [data-prototype-action-status],
  body[data-desktop-shell="true"] .source-now [data-source-action-status] { grid-column: 1 / -1; margin: 0; color: var(--blue-dark); font-size: 10px; }
  body[data-desktop-shell="true"] .source-runtime-actions { margin-top: 22px; padding-top: 18px; border-top: 1px solid color-mix(in srgb, var(--line) 64%, transparent); display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; }
  body[data-desktop-shell="true"] .source-runtime-actions details { position: relative; }
  body[data-desktop-shell="true"] .source-runtime-actions summary { list-style: none; }
  body[data-desktop-shell="true"] .source-runtime-actions summary::-webkit-details-marker { display: none; }
  body[data-desktop-shell="true"] .source-runtime-actions details[open] { width: min(100%, 520px); padding: 12px; border-radius: 12px; background: color-mix(in srgb, var(--red) 5%, var(--paper)); }
  body[data-desktop-shell="true"] .source-runtime-actions details[open] summary { width: fit-content; color: var(--red); background: color-mix(in srgb, var(--red) 7%, var(--paper)); }
  body[data-desktop-shell="true"] .source-runtime-actions details p { margin: 10px 0; color: var(--muted); font-size: 10px; line-height: 1.55; }
  body[data-desktop-shell="true"] .source-runtime-actions details div { display: flex; flex-wrap: wrap; gap: 8px; }
  body[data-desktop-shell="true"] .source-runtime-actions .is-danger { color: var(--red); }
  body[data-desktop-shell="true"] .source-config-sheet,
  body[data-desktop-shell="true"] .source-schedule-sheet { max-width: 760px; display: grid; gap: 16px; }
  body[data-desktop-shell="true"] .source-config-sheet label,
  body[data-desktop-shell="true"] .source-schedule-sheet > label { display: grid; gap: 6px; }
  body[data-desktop-shell="true"] .source-config-sheet label > span,
  body[data-desktop-shell="true"] .source-schedule-sheet > label > span { color: var(--faint); font-size: 9px; font-weight: 400; }
  body[data-desktop-shell="true"] .source-config-sheet input,
  body[data-desktop-shell="true"] .source-config-sheet textarea,
  body[data-desktop-shell="true"] .source-config-sheet select,
  body[data-desktop-shell="true"] .source-schedule-sheet select {
    width: 100%;
    min-width: 0;
    min-height: 38px;
    padding: 8px 10px;
    border: 1px solid color-mix(in srgb, var(--line) 76%, transparent);
    border-radius: 9px;
    outline: 0;
    color: var(--ink);
    background: var(--paper);
    font: inherit;
    font-size: 11px;
  }
  body[data-desktop-shell="true"] .source-config-sheet textarea { resize: vertical; }
  body[data-desktop-shell="true"] .source-config-sheet input[readonly] { color: var(--faint); background: color-mix(in srgb, var(--ink) 3%, var(--paper)); cursor: not-allowed; }
  body[data-desktop-shell="true"] .source-config-sheet input:focus,
  body[data-desktop-shell="true"] .source-config-sheet textarea:focus,
  body[data-desktop-shell="true"] .source-config-sheet select:focus,
  body[data-desktop-shell="true"] .source-schedule-sheet select:focus { border-color: color-mix(in srgb, var(--blue) 55%, var(--line)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--blue) 10%, transparent); }
  body[data-desktop-shell="true"] .source-config-help { color: var(--faint); font-size: 9px; line-height: 1.5; }
  body[data-desktop-shell="true"] .source-config-actions,
  body[data-desktop-shell="true"] .source-schedule-actions { display: flex; align-items: center; gap: 10px; }
  body[data-desktop-shell="true"] .source-config-actions small,
  body[data-desktop-shell="true"] .source-schedule-actions small { color: var(--faint); font-size: 9px; }
  body[data-desktop-shell="true"] .source-config-sheet > p,
  body[data-desktop-shell="true"] .source-schedule-sheet > p { margin: -6px 0 0; color: var(--blue-dark); font-size: 10px; }
  body[data-desktop-shell="true"] .source-schedule-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  body[data-desktop-shell="true"] .source-schedule-toggle { min-height: 36px; display: inline-flex; align-items: center; gap: 7px; color: var(--ink-soft); font-size: 10px; }
  body[data-desktop-shell="true"] .source-schedule-toggle input { width: 16px; height: 16px; accent-color: var(--blue-dark); }
  body[data-desktop-shell="true"] .source-message-list > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  body[data-desktop-shell="true"] .source-message-list ul,
  body[data-desktop-shell="true"] .source-run-ledger { margin: 16px 0 0; padding: 0; list-style: none; }
  body[data-desktop-shell="true"] .source-message-list li,
  body[data-desktop-shell="true"] .source-run-ledger li { min-width: 0; padding: 13px 2px; border-top: 1px solid color-mix(in srgb, var(--line) 68%, transparent); display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; align-items: start; gap: 9px; }
  body[data-desktop-shell="true"] .source-message-list li > svg,
  body[data-desktop-shell="true"] .source-run-ledger li > span { width: 24px; height: 24px; border-radius: 7px; color: var(--muted); background: color-mix(in srgb, var(--ink) 5%, transparent); display: grid; place-items: center; }
  body[data-desktop-shell="true"] .source-message-list li > svg { padding: 6px; }
  body[data-desktop-shell="true"] .source-run-ledger li svg { width: 11px; height: 11px; }
  body[data-desktop-shell="true"] .source-message-list li span,
  body[data-desktop-shell="true"] .source-run-ledger li div { min-width: 0; display: grid; gap: 3px; }
  body[data-desktop-shell="true"] .source-message-list li strong,
  body[data-desktop-shell="true"] .source-run-ledger li strong { color: var(--ink-soft); font-size: 11px; font-weight: 400; }
  body[data-desktop-shell="true"] .source-message-list li small,
  body[data-desktop-shell="true"] .source-run-ledger li p,
  body[data-desktop-shell="true"] .source-run-ledger li time { margin: 0; color: var(--faint); font-size: 9px; line-height: 1.45; }
  body[data-desktop-shell="true"] .source-run-ledger li time { font-variant-numeric: tabular-nums; }
  body[data-desktop-shell="true"] .source-run-ledger li[data-run-state="error"] > span { color: var(--red); background: color-mix(in srgb, var(--red) 9%, transparent); }
  body[data-desktop-shell="true"] .source-run-ledger li[data-run-state="running"] > span { color: var(--blue-dark); background: color-mix(in srgb, var(--blue) 10%, transparent); }
  body[data-desktop-shell="true"] .source-panel-empty { margin-top: 18px; padding: 28px; color: var(--faint); display: grid; justify-items: center; gap: 6px; text-align: center; }
  body[data-desktop-shell="true"] .source-panel-empty svg { width: 18px; height: 18px; }
  body[data-desktop-shell="true"] .source-panel-empty strong { color: var(--ink-soft); font-size: 11px; }
  body[data-desktop-shell="true"] .source-panel-empty p { margin: 0; font-size: 9.5px; }
  body[data-desktop-shell="true"] .prototype-honesty-note { max-width: 74ch; margin: 28px 0 0; color: var(--faint); display: flex; align-items: flex-start; gap: 6px; font-size: 9.5px; line-height: 1.55; }
  body[data-desktop-shell="true"] .prototype-honesty-note svg { width: 12px; height: 12px; margin-top: 1px; flex: 0 0 auto; }
  body[data-desktop-shell="true"] .source-honesty-note { max-width: 720px; }

  body[data-desktop-shell="true"] .feed-list-item.is-selected {
    color: var(--ink);
    background: color-mix(in srgb, var(--blue) 10%, transparent);
    box-shadow: none;
  }
  body[data-desktop-shell="true"] .feed-workbench { padding: 22px 22px 56px; }
  body[data-desktop-shell="true"] .feed-detail {
    width: min(100%, 920px);
    margin: 0 auto;
    padding: 30px 34px 38px;
    border-radius: 14px;
    background: var(--paper);
    box-shadow: 0 5px 16px color-mix(in srgb, var(--shadow-color) 27%, transparent);
  }
  body[data-desktop-shell="true"] .feed-detail-header { max-width: 76ch; }
  body[data-desktop-shell="true"] .feed-detail-kicker { margin-bottom: 13px; }
  body[data-desktop-shell="true"] .feed-detail-kicker span {
    padding: 3px 6px;
    border-radius: 6px;
    color: var(--faint);
    background: color-mix(in srgb, var(--ink) 5%, transparent);
  }
  body[data-desktop-shell="true"] .feed-detail-kicker span:first-child { color: var(--blue-dark); background: color-mix(in srgb, var(--blue) 9%, transparent); }
  body[data-desktop-shell="true"] .feed-detail-header > p { margin-top: 12px; }
  body[data-desktop-shell="true"] .feed-detail-meta { margin-top: 13px; }
  body[data-desktop-shell="true"] .feed-detail-actions { margin-top: 20px; }
  body[data-desktop-shell="true"] .feed-detail-body {
    max-width: 76ch;
    margin-top: 30px;
    padding-top: 22px;
    border-top: 1px solid color-mix(in srgb, var(--line) 68%, transparent);
  }
  body[data-desktop-shell="true"] .feed-detail-body h2 { color: var(--ink); font-size: 13px; letter-spacing: 0; text-transform: none; }
  body[data-desktop-shell="true"] .feed-detail-body > .feed-rich-content {
    min-width: 0;
    color: var(--ink-soft);
    font-size: 14px;
    line-height: 1.76;
    overflow-wrap: anywhere;
    white-space: normal;
  }
  body[data-desktop-shell="true"] .feed-rich-content > :first-child { margin-top: 0; }
  body[data-desktop-shell="true"] .feed-rich-content > :last-child { margin-bottom: 0; }
  body[data-desktop-shell="true"] .feed-rich-content p { margin: 0 0 1em; }
  body[data-desktop-shell="true"] .feed-rich-content h1,
  body[data-desktop-shell="true"] .feed-rich-content h2,
  body[data-desktop-shell="true"] .feed-rich-content h3,
  body[data-desktop-shell="true"] .feed-rich-content h4,
  body[data-desktop-shell="true"] .feed-rich-content h5,
  body[data-desktop-shell="true"] .feed-rich-content h6 {
    margin: 1.7em 0 .55em;
    color: var(--ink);
    font-weight: 400;
    letter-spacing: -.018em;
    line-height: 1.3;
    text-transform: none;
  }
  body[data-desktop-shell="true"] .feed-rich-content h1 { font-size: 23px; }
  body[data-desktop-shell="true"] .feed-rich-content h2 { font-size: 19px; }
  body[data-desktop-shell="true"] .feed-rich-content h3 { font-size: 16px; }
  body[data-desktop-shell="true"] .feed-rich-content h4,
  body[data-desktop-shell="true"] .feed-rich-content h5,
  body[data-desktop-shell="true"] .feed-rich-content h6 { font-size: 14px; }
  body[data-desktop-shell="true"] .feed-rich-content a {
    color: var(--blue-dark);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, currentColor 38%, transparent);
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }
  body[data-desktop-shell="true"] .feed-rich-content a:hover { text-decoration-color: currentColor; }
  body[data-desktop-shell="true"] .feed-rich-content a:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 3px; }
  body[data-desktop-shell="true"] .feed-rich-content ul,
  body[data-desktop-shell="true"] .feed-rich-content ol { margin: 0 0 1.1em; padding-inline-start: 1.45em; }
  body[data-desktop-shell="true"] .feed-rich-content li + li { margin-top: .38em; }
  body[data-desktop-shell="true"] .feed-rich-content blockquote {
    margin: 1.25em 0;
    padding: .15em 0 .15em 1em;
    border-inline-start: 1px solid color-mix(in srgb, var(--blue) 50%, var(--line));
    color: var(--muted);
  }
  body[data-desktop-shell="true"] .feed-rich-content blockquote > :last-child { margin-bottom: 0; }
  body[data-desktop-shell="true"] .feed-rich-content code,
  body[data-desktop-shell="true"] .feed-rich-content kbd {
    padding: .12em .34em;
    border-radius: 5px;
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 7%, var(--paper));
    font: .9em/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
  body[data-desktop-shell="true"] .feed-rich-content pre {
    max-width: 100%;
    margin: 1.2em 0;
    padding: 14px 16px;
    border-radius: 9px;
    color: var(--ink-soft);
    background: color-mix(in srgb, var(--ink) 6%, var(--paper));
    font-size: 12px;
    line-height: 1.65;
    overflow: auto;
    overscroll-behavior-inline: contain;
  }
  body[data-desktop-shell="true"] .feed-rich-content pre code { padding: 0; color: inherit; background: transparent; font-size: inherit; }
  body[data-desktop-shell="true"] .feed-rich-content table {
    width: 100%;
    max-width: 100%;
    margin: 1.3em 0;
    border-collapse: collapse;
    display: block;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
  }
  body[data-desktop-shell="true"] .feed-rich-content th,
  body[data-desktop-shell="true"] .feed-rich-content td { min-width: 110px; padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: start; vertical-align: top; }
  body[data-desktop-shell="true"] .feed-rich-content th { color: var(--ink); font-size: 12px; font-weight: 400; background: color-mix(in srgb, var(--ink) 4%, transparent); }
  body[data-desktop-shell="true"] .feed-rich-content details { margin: 1.35em 0; padding-block: 10px; border-block: 1px solid color-mix(in srgb, var(--line) 78%, transparent); }
  body[data-desktop-shell="true"] .feed-rich-content summary { color: var(--ink); font-weight: 400; cursor: pointer; }
  body[data-desktop-shell="true"] .feed-rich-content summary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 3px; }
  body[data-desktop-shell="true"] .feed-rich-content details[open] summary { margin-bottom: 12px; }
  body[data-desktop-shell="true"] .feed-rich-content hr { margin: 1.8em 0; border: 0; border-top: 1px solid var(--line); }
  body[data-desktop-shell="true"] .feed-materials { max-width: 76ch; margin-top: 34px; padding-top: 22px; border-top: 1px solid color-mix(in srgb, var(--line) 68%, transparent); }
  body[data-desktop-shell="true"] .feed-detail-empty { width: min(100%, 920px); min-height: 440px; margin: 0 auto; border-radius: 14px; background: var(--paper); box-shadow: 0 5px 16px color-mix(in srgb, var(--shadow-color) 27%, transparent); }

  body[data-desktop-shell="true"] .feed-destination-strip { max-width: 76ch; margin-top: 26px; padding: 15px 0; border-top: 1px solid color-mix(in srgb, var(--line) 68%, transparent); border-bottom: 1px solid color-mix(in srgb, var(--line) 68%, transparent); border-radius: 0; background: transparent; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 3px 9px; }
  body[data-desktop-shell="true"] .feed-destination-strip > span { color: var(--faint); display: inline-flex; align-items: center; gap: 5px; font-size: 9px; }
  body[data-desktop-shell="true"] .feed-destination-strip > span svg { width: 11px; height: 11px; }
  body[data-desktop-shell="true"] .feed-destination-strip strong { color: var(--ink); font-size: 12px; }
  body[data-desktop-shell="true"] .feed-destination-strip small { grid-column: 2; color: var(--muted); font-size: 9.5px; }
  body[data-desktop-shell="true"] .feed-destination-strip[data-destination-state="inbox"] strong { color: var(--amber); }
  body[data-desktop-shell="true"] .feed-destination-strip[data-destination-state="saved"] strong { color: var(--green); }
  body[data-desktop-shell="true"] .feed-destination-strip[data-destination-state="promoted"] strong,
  body[data-desktop-shell="true"] .feed-destination-strip[data-destination-state="processing"] strong { color: var(--blue-dark); }
  body[data-desktop-shell="true"] .feed-detail--attention .feed-detail-kicker span:first-child { color: var(--amber); background: color-mix(in srgb, var(--amber) 9%, transparent); }
  body[data-desktop-shell="true"] .feed-detail--attention .feed-detail-actions { padding-bottom: 20px; border-bottom: 1px solid color-mix(in srgb, var(--line) 68%, transparent); }
  body[data-desktop-shell="true"] .inbox-attention-context { max-width: 76ch; margin-top: 24px; }
  body[data-desktop-shell="true"] .inbox-attention-context dl { margin: 0; display: flex; flex-direction: column; }
  body[data-desktop-shell="true"] .inbox-attention-context dl > div { padding: 12px 0; border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent); display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 18px; }
  body[data-desktop-shell="true"] .inbox-attention-context dt { color: var(--faint); font-size: 9.5px; font-weight: 400; }
  body[data-desktop-shell="true"] .inbox-attention-context dd { margin: 0; color: var(--ink-soft); font-size: 11.5px; line-height: 1.55; }
  body[data-desktop-shell="true"] .inbox-attention-context .inbox-attention-next { order: -1; padding: 0 0 18px; }
  body[data-desktop-shell="true"] .inbox-attention-context .inbox-attention-next dt { color: var(--blue-dark); font-weight: 400; }
  body[data-desktop-shell="true"] .inbox-attention-context .inbox-attention-next dd { color: var(--ink); font-size: 14px; font-weight: 400; line-height: 1.5; }
  body[data-desktop-shell="true"] .feed-detail--prototype .feed-action-status { color: var(--blue-dark); }
  body[data-desktop-shell="true"] .feed-detail--prototype .feed-detail-tags { max-width: 74ch; margin-top: 18px; display: flex; flex-wrap: wrap; gap: 5px; }
  body[data-desktop-shell="true"] .feed-detail--prototype .feed-detail-tags span { padding: 4px 7px; border-radius: 7px; color: var(--muted); background: color-mix(in srgb, var(--rail) 58%, transparent); font-size: 9px; }

`;

