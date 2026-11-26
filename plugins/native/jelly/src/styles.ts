export const JELLY_STYLES = `
  [data-jelly="workbench"] { --plugin-tint: var(--ink-soft); position: relative; }
  body.immersive-workbench .plugin-stage-shell[data-jelly="workbench"] { display: flex; flex-direction: column; min-height: 0; }
  .jelly-page { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .jelly-head { display: flex; align-items: center; gap: 8px; flex: none; min-height: 52px; padding: 8px 16px; border-bottom: 1px solid var(--line); }
  .jelly-period { margin: 0 4px 0 0; font-size: 15px; font-weight: var(--weight-title, 600); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .jelly-grow { flex: 1; min-width: 0; }
  .jelly-cut { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .jelly-muted { color: var(--muted); font-size: 13px; }
  .jelly-notice { margin: 0 16px 8px; padding: 8px 12px; border-radius: var(--r-control); background: var(--surface-soft); color: var(--ink); font-size: 13px; }
  .jelly-pad { padding: 16px; }
  .jelly-center { display: grid; place-items: center; flex: 1; min-height: 240px; padding: 24px; }
  .jelly-tabs { display: flex; gap: 2px; padding: 2px; border-radius: var(--r-control); background: var(--control-fill); }
  .jelly-tab { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 12px; border: 0; border-radius: calc(var(--r-control) - 2px); background: transparent; color: var(--ink-soft); font: inherit; font-weight: 500; cursor: pointer; }
  .jelly-tab[aria-selected="true"] { background: var(--paper); color: var(--ink); box-shadow: var(--lift-1); }
  .jelly-tab svg, .jelly-sec svg, .jelly-ev svg, .jelly-row svg, .jelly-quick svg, .jelly-empty-hint svg, .jelly-date-chip svg, .jelly-nrow svg, .jelly-line > svg { width: 14px; height: 14px; flex: none; }
  .jelly-sub { display: flex; align-items: center; gap: 8px; flex: none; padding: 8px 16px; }
  .jelly-search { width: 220px; }
  .jelly-chips { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
  .jelly-chip { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border: 0; border-radius: 13px; background: transparent; color: var(--ink-soft); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; box-shadow: inset 0 0 0 1px var(--line); }
  .jelly-chip[aria-pressed="true"] { background: var(--nav-active); color: var(--ink); box-shadow: none; }
  .jelly-dot { width: 8px; height: 8px; flex: none; border-radius: 50%; background: var(--jelly-c, var(--muted)); }
  .jelly-empty-hint { display: flex; align-items: flex-start; gap: 8px; margin: 0 16px 8px; color: var(--muted); font-size: 12px; line-height: 18px; }
  .jelly-empty-hint svg { margin-top: 2px; }
  .jelly-body { flex: 1; min-height: 0; display: flex; }
  .jelly-main { flex: 1; min-width: 0; min-height: 0; overflow: auto; padding: 0 16px 16px; }
  .jelly-month { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); grid-template-rows: 30px; grid-auto-rows: minmax(104px, 1fr); min-height: 560px; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .jelly-wd { display: grid; place-items: center; color: var(--muted); font-size: 11px; border-bottom: 1px solid var(--line); background: var(--surface-soft); }
  .jelly-day { position: relative; min-width: 0; padding: 4px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); cursor: pointer; }
  .jelly-day:nth-child(7n) { border-right: 0; }
  .jelly-day:hover { background: var(--nav-hover); }
  .jelly-day[data-out] { background: var(--surface-soft); }
  .jelly-day[data-out] .jelly-dn { color: var(--faint); }
  .jelly-day[data-selected], .jelly-wh[data-selected] { box-shadow: inset 0 0 0 2px var(--accent); }
  .jelly-dn { display: inline-grid; place-items: center; min-width: 24px; height: 24px; padding: 0 4px; border-radius: 12px; color: var(--ink-soft); font-size: 12px; font-variant-numeric: tabular-nums; }
  .jelly-day[data-today] .jelly-dn { background: var(--action); color: var(--action-ink); font-weight: 600; }
  .jelly-day-note { position: absolute; top: 8px; right: 8px; color: var(--muted); }
  .jelly-day-note svg { width: 12px; height: 12px; }
  .jelly-ev { display: flex; align-items: center; gap: 5px; width: 100%; min-width: 0; margin-top: 3px; padding: 2px 6px 2px 4px; border: 0; border-radius: 5px; background: color-mix(in srgb, var(--jelly-c) 14%, transparent); color: var(--ink); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
  .jelly-ev:hover { background: color-mix(in srgb, var(--jelly-c) 22%, transparent); }
  .jelly-ev time { flex: none; color: var(--ink-soft); font-variant-numeric: tabular-nums; }
  .jelly-ev[data-done] { color: var(--faint); text-decoration: line-through; background: transparent; }
  .jelly-more { display: block; margin: 2px 0 0 4px; color: var(--muted); font-size: 11px; }
  .jelly-week { display: grid; grid-template-columns: 52px repeat(7, minmax(0, 1fr)); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .jelly-wh { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 48px; padding: 0; border: 0; border-bottom: 1px solid var(--line); background: var(--surface-soft); color: var(--muted); font: inherit; font-size: 11px; cursor: pointer; }
  .jelly-wh b { font-size: 15px; color: var(--ink); font-variant-numeric: tabular-nums; }
  .jelly-wh[data-today] b { color: var(--accent); }
  .jelly-allday-label { display: grid; place-items: center; color: var(--faint); font-size: 11px; border-bottom: 1px solid var(--line); }
  .jelly-allday { min-height: 30px; padding: 3px; border-bottom: 1px solid var(--line); border-left: 1px solid var(--line); }
  .jelly-ruler { position: relative; height: calc(var(--jelly-hours) * 44px); color: var(--faint); font-size: 11px; font-variant-numeric: tabular-nums; }
  .jelly-ruler span { position: absolute; right: 6px; transform: translateY(-50%); }
  .jelly-col { position: relative; height: calc(var(--jelly-hours) * 44px); border-left: 1px solid var(--line); background: repeating-linear-gradient(to bottom, transparent 0, transparent 43px, var(--line) 43px, var(--line) 44px); }
  .jelly-slot { position: absolute; left: 3px; right: 3px; }
  .jelly-slot .jelly-ev { height: 100%; margin: 0; align-items: flex-start; overflow: hidden; }
  .jelly-agenda { max-width: 760px; padding-top: 8px; }
  .jelly-ag { margin: 4px 0 20px; }
  .jelly-ag h3 { display: flex; gap: 8px; align-items: baseline; margin: 0 0 6px; font-size: 12px; font-weight: 600; color: var(--ink-soft); }
  .jelly-ag h3 small, .jelly-rail h2 small { color: var(--muted); font-weight: 400; font-size: 12px; }
  .jelly-row { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 6px; border-radius: var(--r-row, 8px); }
  .jelly-row:hover { background: var(--nav-hover); }
  .jelly-row-open { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; min-height: 40px; padding: 0; border: 0; background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .jelly-row-open time { width: 92px; flex: none; color: var(--ink-soft); font-size: 12px; font-variant-numeric: tabular-nums; }
  .jelly-row-open small { color: var(--muted); font-size: 12px; }
  .jelly-row[data-done] .jelly-row-open .jelly-cut { color: var(--faint); text-decoration: line-through; }
  .jelly-check { display: grid; place-items: center; width: 18px; height: 18px; flex: none; padding: 0; border: 0; border-radius: 5px; background: transparent; box-shadow: inset 0 0 0 1.5px var(--line-strong); color: var(--action-ink); cursor: pointer; }
  .jelly-check[aria-checked="true"] { background: var(--action); box-shadow: none; }
  .jelly-check[data-event] { width: 8px; height: 8px; margin: 0 5px; border-radius: 50%; box-shadow: none; background: var(--jelly-c); cursor: default; }
  .jelly-rail { width: 340px; flex: none; min-height: 0; overflow: auto; padding: 4px 16px 16px; border-left: 1px solid var(--line); display: flex; flex-direction: column; gap: 14px; }
  .jelly-rail h2 { margin: 4px 0 0; font-size: 15px; font-weight: var(--weight-title, 600); }
  .jelly-rail .jelly-row-open time { width: 72px; }
  .jelly-sec { display: flex; align-items: center; gap: 6px; margin: 0 0 4px; color: var(--muted); font-size: 12px; font-weight: 500; }
  .jelly-quick { display: flex; align-items: center; gap: 8px; margin-top: 6px; color: var(--faint); }
  .jelly-quick .mw-input { flex: 1; }
  .jelly-day-note-box .jelly-md-src { min-height: 180px; padding: 10px 12px; border-radius: 10px; background: var(--surface-soft); }
  .jelly-note-status { min-height: 16px; color: var(--muted); font-size: 12px; text-align: right; }
  .jelly-notes { flex: 1; min-height: 0; display: grid; grid-template-columns: 300px minmax(0, 1fr); }
  .jelly-nlist { min-height: 0; overflow: auto; padding: 8px 8px 16px; border-right: 1px solid var(--line); }
  .jelly-nlist .mw-input-group { margin: 4px 4px 8px; }
  .jelly-nrow { display: block; width: 100%; padding: 8px 10px; border: 0; border-radius: var(--r-row, 8px); background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .jelly-nrow:hover { background: var(--nav-hover); }
  .jelly-nrow[aria-current="true"] { background: var(--nav-active); }
  .jelly-nrow b { display: block; font-weight: 500; }
  .jelly-nrow span { display: block; margin-top: 2px; color: var(--muted); font-size: 12px; }
  .jelly-editor { min-height: 0; display: flex; flex-direction: column; padding: 0 16px 16px; }
  .jelly-ebar { display: flex; align-items: center; gap: 8px; flex: none; height: 48px; }
  .jelly-date-chip { position: relative; display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 13px; color: var(--ink-soft); font-size: 12px; box-shadow: inset 0 0 0 1px var(--line); cursor: pointer; }
  .jelly-date-chip input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .jelly-md-src { flex: 1; width: 100%; min-height: 320px; box-sizing: border-box; border: 0; outline: 0; resize: none; background: transparent; color: var(--ink); font: inherit; font-size: 14px; line-height: 1.75; }
  .jelly-md { flex: 1; overflow: auto; max-width: 72ch; font-size: 14px; line-height: 1.75; }
  .jelly-md code { padding: 1px 5px; border-radius: 4px; background: var(--surface-soft); font-size: 12px; }
  .jelly-md pre { padding: 10px 12px; border-radius: 8px; background: var(--surface-soft); overflow: auto; }
  .jelly-md blockquote { margin: 8px 0; padding-left: 12px; border-left: 2px solid var(--line-strong); color: var(--ink-soft); }
  .jelly-md-task { list-style: none; margin-left: -20px; }
  .jelly-scrim { position: absolute; inset: 0; z-index: 4; background: var(--scrim); }
  .jelly-panel { position: absolute; z-index: 5; top: 8px; right: 8px; bottom: 8px; width: min(400px, calc(100% - 16px)); display: flex; flex-direction: column; border-radius: 12px; background: var(--popover, var(--paper)); box-shadow: var(--lift-3); animation: jelly-slide var(--dur-arrive) var(--ease-quint) both; }
  .jelly-panel header { display: flex; align-items: center; gap: 8px; padding: 12px 12px 4px 20px; }
  .jelly-panel header h2 { flex: 1; margin: 0; font-size: 15px; font-weight: var(--weight-title, 600); }
  .jelly-panel footer { display: flex; align-items: center; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--line); }
  .jelly-form { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 14px; padding: 8px 20px 20px; }
  .jelly-title-in.mw-input { font-size: 18px; font-weight: 600; }
  .jelly-line { display: flex; align-items: center; gap: 10px; min-height: 34px; color: var(--ink-soft); }
  .jelly-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .jelly-grid label, .jelly-until, .jelly-field { display: grid; gap: 4px; color: var(--ink-soft); font-size: 12px; }
  .jelly-weekdays { display: flex; gap: 4px; flex-wrap: wrap; }
  .jelly-wd-pick { width: 32px; height: 28px; border: 0; border-radius: 7px; background: var(--control-fill); color: var(--ink-soft); font: inherit; font-size: 12px; cursor: pointer; }
  .jelly-wd-pick[aria-pressed="true"] { background: var(--action); color: var(--action-ink); }
  .jelly-scope { display: grid; gap: 6px; margin: 0; padding: 12px; border: 0; border-radius: 10px; background: var(--surface-soft); }
  .jelly-scope legend { float: left; margin-bottom: 4px; font-weight: 500; }
  .jelly-scope label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .jelly-form-error { margin: 0; color: var(--red); font-size: 12px; }
  .jelly-cats { list-style: none; margin: 0; padding: 8px 20px; display: grid; gap: 8px; overflow: auto; }
  .jelly-cat-row, .jelly-cat-new { display: flex; align-items: center; gap: 8px; }
  .jelly-cat-new { padding: 12px 20px; border-top: 1px solid var(--line); }
  .jelly-swatches { display: flex; gap: 3px; }
  .jelly-swatch { width: 16px; height: 16px; padding: 0; border: 0; border-radius: 50%; background: var(--jelly-c); cursor: pointer; }
  .jelly-swatch[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--paper), 0 0 0 4px var(--jelly-c); }
  @keyframes jelly-slide { from { opacity: 0; transform: translateX(16px); } }
  @media (prefers-reduced-motion: reduce) { .jelly-panel { animation: none; } }
  @media (max-width: 1023px) { .jelly-rail { width: 280px; } .jelly-search { display: none; } }
  @media (max-width: 720px) {
    .jelly-head { flex-wrap: wrap; } .jelly-wide { display: none; }
    .jelly-body { flex-direction: column; } .jelly-rail { width: auto; border-left: 0; border-top: 1px solid var(--line); }
    .jelly-month { grid-auto-rows: minmax(56px, 1fr); min-height: 0; } .jelly-ev span { display: none; }
    .jelly-notes { grid-template-columns: 1fr; } .jelly-notes[data-open] .jelly-nlist, .jelly-notes:not([data-open]) .jelly-editor { display: none; }
    .jelly-panel { top: auto; left: 8px; width: auto; max-height: 85%; }
  }
  @media (min-width: 721px) { .jelly-narrow { display: none; } }
  /* Where the design system raises inputs to 16px (no zoom on focus), the mark beside the quick-add input grows with it. */
  @media (max-width: 760px), (pointer: coarse) { .jelly-quick svg { width: 16px; height: 16px; } }
`;
