export const GOALS_EVENT_DOCUMENT_STYLES = `
  .document-pane:where(:has(.desktop-work-surface:not([hidden]) > .goal-event-document)) { min-height: 0; height: 100%; overflow: hidden; display: flex; flex-direction: column; }
  .desktop-work-surface:has(> .goal-event-document) { min-width: 0; min-height: 0; flex: 1 1 auto; height: 100%; max-height: 100%; overflow: hidden; display: flex; flex-direction: column; }
  .goal-event-document { min-width: 0; min-height: 0; flex: 1 1 auto; height: 100%; max-height: 100%; overflow: hidden; display: flex; flex-direction: column; container-type: inline-size; container-name: goal-event-read; color: var(--ink); }
  .goal-event-document .goal-header { padding: 10px 18px 12px; flex: none; }
  .goal-event-document .title-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .goal-event-document .goal-title-heading { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .goal-event-document .goal-title-heading h1 { margin: 0; font-size: 21px; line-height: 1.4; letter-spacing: -.02em; font-weight: 650; }
  .goal-event-document .goal-outcome { color: var(--muted); font-size: 12px; margin: 5px 0 0; max-width: 78ch; }
  .goal-event-document .header-actions { display: flex; gap: 7px; flex-wrap: wrap; flex-shrink: 0; }
  .goal-event-document .header-actions > .button { flex: none; white-space: nowrap; }
  .goal-event-document .button, .event-form .button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 10px; min-height: 31px; background: var(--paper); border: 1px solid var(--line-strong); border-radius: 6px; font-size: 11px; font-weight: 550; cursor: pointer; }
  .goal-event-document .button.primary, .event-form .button.primary { background: var(--blue); border-color: var(--blue); color: var(--action-ink, #fff); }
  .goal-event-document .button.secondary, .event-form .button.secondary { color: var(--blue-dark, var(--blue)); background: var(--blue-soft); border-color: transparent; }
  .goal-event-document .text-button { display: inline-flex; gap: 5px; align-items: center; padding: 4px 6px; color: var(--blue-dark, var(--blue)); font-size: 11px; background: none; border: 0; cursor: pointer; }
  .goal-event-document .goal-overview { flex: none; padding: 12px 16px 13px; margin: 0 18px 14px; background: var(--rail); border-radius: 8px; }
  .goal-event-document .overview-heading { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .goal-event-document .overview-heading h2 { font-size: 12px; font-weight: 650; margin: 0; }
  .goal-event-document .overview-tools { margin-left: auto; }
  .goal-event-document .overview-timestamp { font-size: 10px; color: var(--muted); }
  .goal-event-document .state-pill { display: inline-flex; align-items: center; gap: 5px; color: var(--blue); font-size: 11px; }
  .goal-event-document .state-pill.is-amber { color: var(--amber); }
  .goal-event-document .state-pill.is-green { color: var(--green); }
  .goal-event-document .overview-lead { font-size: 13px; font-weight: 550; margin: 5px 0 0; line-height: 1.65; }
  .goal-event-document .overview-grid { display: grid; grid-template-columns: 1fr 1.25fr 1fr; gap: 22px; margin-top: 11px; }
  .goal-event-document .overview-grid h3 { font-size: 10px; font-weight: 550; color: var(--muted); margin: 0 0 3px; }
  .goal-event-document .overview-grid p { font-size: 12px; line-height: 1.7; color: var(--ink); margin: 0; }
  .goal-event-document .overview-grid .owner { color: var(--blue); }
  .goal-event-document .overview-grid .risk-copy { color: var(--amber); }
  .goal-event-document .goal-layout { display: grid; grid-template-columns: 302px minmax(0, 1fr); min-height: 0; flex: 1; margin: 0 18px 14px; border: 1px solid var(--line); border-radius: 9px; overflow: hidden; background: var(--paper); }
  .goal-event-document .goal-pending-proposals { flex: none; margin: 0 18px 12px; max-height: min(48vh, 520px); overflow: auto; border: 1px solid var(--line); border-radius: 9px; background: var(--paper); }
  .goal-event-document .goal-pending-proposals > .decision-record { margin: 0; border: 0; border-radius: 0; }
  .goal-event-document .goal-pending-proposals > .decision-record + .decision-record { border-top: 1px solid var(--line); }
  .goal-event-document .timeline-pane { display: flex; flex-direction: column; min-height: 0; min-width: 0; background: color-mix(in srgb, var(--rail) 70%, var(--paper)); border-right: 1px solid var(--line); }
  .goal-event-document .stream-toolbar, .goal-event-document .detail-toolbar { height: 43px; display: flex; justify-content: space-between; align-items: center; padding: 0 12px 0 16px; border-bottom: 1px solid var(--line); flex-shrink: 0; gap: 6px; font-size: 11px; color: var(--muted); }
  .goal-event-document .stream-toolbar h2 { font-size: 12px; margin: 0; }
  .goal-event-document [data-event-count] { font-size: 10px; color: var(--muted); font-weight: 400; }
  .goal-event-document .filters { display: flex; gap: 1px; }
  .goal-event-document .filters button { padding: 4px 6px; font-size: 10px; color: var(--muted); min-height: 27px; background: none; border: 0; border-radius: 6px; cursor: pointer; }
  .goal-event-document .filters button[aria-pressed="true"] { color: var(--blue); background: var(--blue-soft); font-weight: 550; }
  .goal-event-document [data-event-timeline] { overflow: auto; min-height: 0; padding: 4px 8px 8px; overscroll-behavior: contain; flex: 1; }
  .goal-event-document .day-label { font-size: 10px; font-weight: 550; color: var(--muted); margin: 10px 8px 5px; }
  .goal-event-document .timeline-entry { display: grid; grid-template-columns: 32px 15px minmax(0, 1fr); gap: 7px; width: 100%; text-align: left; min-height: 54px; padding: 9px 8px; border-radius: 6px; align-items: start; border: 0; background: none; color: inherit; cursor: pointer; }
  .goal-event-document .timeline-entry time { font-size: 10px; color: var(--muted); font-variant-numeric: tabular-nums; line-height: 18px; }
  .goal-event-document .timeline-dot { display: flex; justify-content: center; position: relative; height: 100%; min-height: 33px; }
  .goal-event-document .timeline-dot:before { content: ""; position: absolute; top: 16px; bottom: -14px; left: 7px; width: 1px; background: var(--line); }
  .goal-event-document .timeline-dot i { width: 6px; height: 6px; border: 1px solid var(--muted); background: var(--paper); border-radius: 50%; margin-top: 6px; z-index: 1; }
  .goal-event-document .timeline-mark { z-index:1; display:grid; place-items:center; width:18px; height:18px; border-radius:5px; background:var(--paper); border:1px solid var(--line); font:12px/1 system-ui; color:var(--muted); }
  .goal-event-document .timeline-entry.is-result .timeline-mark { color:var(--green); }
  .goal-event-document .timeline-entry.is-decision .timeline-mark { color:var(--blue); }
  .goal-event-document .timeline-entry.is-problem .timeline-mark { color:var(--amber); }
  .goal-event-document .timeline-type { display:inline-block; font-weight:500; padding:1px 5px; background:var(--control-fill); border-radius:4px; }
  .goal-event-document .timeline-actor { margin-left:4px; }
  .goal-event-document .history-state { display:inline-flex; align-items:center; width:fit-content; padding:2px 6px; margin-top:5px; border:1px solid var(--line); border-radius:4px; font:500 11px/1.4 system-ui; color:var(--ink-soft); }
  .goal-event-document .history-state[data-tone=positive] { color:var(--green); }
  .goal-event-document .event-relation header h2 { margin-top:10px; }
  .goal-event-document .history-relation-flow { display:grid; justify-items:stretch; gap:6px; margin:18px 0; }
  .goal-event-document .history-relation-flow button { width:100%; padding:12px; white-space:normal; overflow-wrap:anywhere; text-align:left; font:500 13px/1.6 system-ui; background:var(--control-fill); color:var(--ink); border:1px solid var(--line); border-radius:6px; cursor:pointer; }
  .goal-event-document .history-relation-flow button:hover { border-color:var(--blue); }
  .goal-event-document .history-relation-link { display:grid; gap:2px; padding-left:14px; font-size:12px; color:var(--muted); }
  .goal-event-document .timeline-entry.is-result .timeline-dot i { border-color: var(--green); background: var(--green); }
  .goal-event-document .timeline-entry.is-decision .timeline-dot i { border-color: var(--blue); background: var(--blue); }
  .goal-event-document .timeline-entry.is-problem .timeline-dot i { border-color: var(--amber); background: var(--amber); }
  .goal-event-document .timeline-entry[aria-current="true"] { background: var(--blue-soft); }
  .goal-event-document .timeline-copy { min-width: 0; }
  .goal-event-document .timeline-copy strong { display: -webkit-box; font-size: 11px; font-weight: 550; line-height: 1.55; overflow: hidden; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .goal-event-document .timeline-copy small { display: block; font-size: 10px; line-height: 1.5; color: var(--muted); margin-top: 3px; }
  .goal-event-document .timeline-footer { flex-shrink: 0; display: flex; justify-content: space-between; padding: 8px 16px; font-size: 10px; color: var(--muted); border-top: 1px solid var(--line); }
  .goal-event-document .detail-pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; background: var(--paper); }
  .goal-event-document .event-sheet, .goal-event-document .reader, .goal-event-document .event-form { flex: 1 1 0; min-height: 0; }
  .goal-event-document .event-sheet, .goal-event-document .reader-content, .goal-event-document .event-form { overflow: auto; padding: 22px 28px 36px; min-height: 0; overscroll-behavior: contain; }
  .goal-event-document .event-sheet:focus, .goal-event-document .event-sheet:focus-visible { outline: none; }
  .goal-event-document .timeline-entry:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
  .goal-event-document .event { max-width: 76ch; }
  .goal-event-document .event h2 { font-size: 22px; font-weight: 630; line-height: 1.5; margin: 0 0 10px; }
  .goal-event-document .event-meta { display: flex; flex-wrap: wrap; gap: 7px; color: var(--muted); font-size: 11px; margin: 0 0 18px; }
  .goal-event-document .event p { font-size: 13px; line-height: 1.85; color: var(--ink-soft, var(--muted)); max-width: 76ch; }
  .goal-event-document .no-results { color: var(--muted); font-size: 12px; padding: 24px 16px; }
  .goal-event-document .reader, .goal-event-document .event-form { display: flex; flex-direction: column; }
  .goal-event-document .reader { overflow: hidden; }
  .goal-event-document .reader-content { flex: 1 1 0; }
  .goal-event-document .reader-header { padding: 12px 28px 10px; border-bottom: 1px solid var(--line); flex-shrink: 0; }
  .goal-event-document .reader-header h2 { font-size: 18px; margin: 0; }
  .goal-event-document .event-form { gap: 0; padding: 0; overflow: hidden; }
  .goal-event-document .event-form h2, .goal-event-document .event-form h3 { margin: 0; }
  .goal-event-document .event-form label, .goal-event-document .event-form fieldset { display: grid; gap: 5px; margin: 0; padding: 0; border: 0; min-width: 0; }
  .goal-event-document .event-form label > span, .goal-event-document .event-form legend { font-size: 12px; font-weight: 550; }
  .goal-event-document .event-form small, .goal-event-document .form-lead, .goal-event-document .form-note { color: var(--muted); font-size: 11px; }
  .goal-event-document .event-form input, .goal-event-document .event-form select, .goal-event-document .event-form textarea { width: 100%; min-width: 0; padding: 8px 9px; border: 1px solid var(--line-strong); border-radius: 5px; background: var(--paper); color: var(--ink); }
  .goal-event-document .check-row { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 8px; }
  .goal-event-document .composer-bottom { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
  .goal-event-document .type-field-row { display: grid; gap: 8px; padding: 10px 0; border-bottom: 1px solid var(--line); }
  .goal-event-document .type-field-tools { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .goal-event-document .original-goal-criteria { margin-top: 18px; }
  .goal-event-document .original-goal-criteria > summary { cursor: pointer; font-size: 12px; font-weight: 550; }
  .goal-event-document .original-goal-criteria > p { color: var(--muted); font-size: 11px; margin: 8px 0 0; }
  .goal-event-document .original-goal-criteria ul { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 12px; }
  .goal-event-document .original-goal-criteria li { display: grid; gap: 4px; }
  .goal-event-document .original-goal-criteria small, .goal-event-document .original-goal-criteria li p { color: var(--muted); font-size: 12px; margin: 0; }
  .goal-event-document .event-form-status, .goal-event-document .event-field-error, .goal-event-document .event-conflict { color: var(--red, #a64e51); font-size: 12px; }
  .goal-event-document .event-conflict { padding: 10px 12px; background: var(--red-soft, color-mix(in srgb, var(--amber-soft) 70%, var(--paper))); border-radius: 8px; }
  .goal-event-document .planning-types, .goal-event-document .planning-requirements { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .goal-event-document .planning-types li { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); }
  .goal-event-document .planning-types li > div { min-width: 0; }
  .goal-event-document .planning-types li > span { flex: none; display: flex; flex-wrap: wrap; gap: 8px; }
  .goal-event-document .mobile-back { display: none; }
  .goal-event-document .overview-toggle, .goal-event-document .overview-mobile-next { display: none; }
  .goal-event-document .attachment { display: grid; gap: 4px; margin-top: 14px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: color-mix(in srgb, var(--rail) 55%, var(--paper)); }
  .goal-event-document .attachment small { color: var(--muted); font-size: 11px; }
  .goal-event-document .event-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
  .goal-event-document .icon-button { display: inline-grid; place-items: center; width: 28px; height: 28px; color: var(--muted); background: none; border: 0; cursor: pointer; }
  .goal-event-document ::selection { background: var(--blue-soft); color: var(--ink); }
  .goal-event-document [data-event-timeline]::-webkit-scrollbar, .goal-event-document .event-sheet::-webkit-scrollbar { width: 10px; }
  .goal-event-document [data-event-timeline]::-webkit-scrollbar-thumb, .goal-event-document .event-sheet::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--muted) 45%, transparent); border-radius: 99px; }
  @container goal-event-read (max-width: 1100px) {
    .goal-layout { grid-template-columns: 278px minmax(0, 1fr) !important; }
    .goal-title-heading h1 { font-size: 20px; }
  }
  @container goal-event-read (min-width: 1400px) {
    .goal-layout { grid-template-columns: 326px minmax(0, 1fr) !important; }
  }
  @container goal-event-read (max-width: 680px) {
    .title-row { flex-direction: column; align-items: stretch; }
    .header-actions { justify-content: flex-start; }
    .goal-layout { grid-template-columns: minmax(0, 1fr) !important; }
    .timeline-pane { border-right: 0; }
    .goal-layout.is-showing-detail .timeline-pane, .goal-layout:not(.is-showing-detail) .detail-pane { display: none !important; }
    .detail-toolbar .mobile-back { display: inline-flex !important; }
    .overview-grid { display: none !important; }
    .overview-toggle { display: inline-flex !important; }
    .overview-mobile-next { display: block !important; color: var(--blue); font-size: 11px; margin-top: 6px; }
    .goal-overview.is-expanded .overview-grid { display: grid !important; grid-template-columns: minmax(0, 1fr) !important; gap: 10px; }
    .goal-overview.is-expanded .overview-mobile-next { display: none; }
    .overview-lead { font-size: 12px; }
    .event-form .button.primary { width: 100%; }
    .composer-bottom { flex-direction: column; align-items: stretch; }
    .event-form input, .event-form select, .event-form textarea { font-size: 16px; }
    .draft-form-row, .draft-list-grid, .decomposition-editor > div, .criterion-editor-grid, .draft-aux-form { grid-template-columns: minmax(0, 1fr) !important; }
    .draft-list-grid label:last-child, .criterion-pass, .draft-aux-wide { grid-column: 1; }
    .criteria-editor > header, .draft-contract-form > footer { align-items: stretch; flex-direction: column; }
    .criteria-editor > header button, .draft-contract-form > footer button { align-self: stretch; }
    .goal-edit-disclosure, .draft-editor-section { margin-left: 0; }
    .timeline-entry { min-height: 56px; }
    .event h2 { font-size: 18px; }
  }

  .goal-event-document .detail-pane:has(> .event-form:not([hidden])) > .detail-toolbar { display: none; }
  .event-form-heading { flex: none; padding: 12px 20px 10px; max-height: 35%; overflow: auto; }
  .goal-event-document .event-form-heading :is(h2,h3) { margin: 0; font-size: 18px; line-height: 1.4; }
  .event-form-heading .form-lead { margin: 6px 0 0; line-height: 1.6; }
  .event-form-heading > button { margin-bottom: 8px; }
  .event-form-body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; display: flex; flex-direction: column; gap: 12px; padding: 4px 20px 16px; }
  .event-form-body > * { flex-shrink: 0; }
  .event-form-body textarea { max-height: 260px; resize: vertical; }
  .event-form-bottom { flex: none; padding: 10px 24px; border-top: 1px solid var(--line); background: var(--paper); }
  .event-form-bottom .event-form-status:not([hidden]) { margin: 0 0 10px; max-height: min(22dvh,120px); overflow: auto; }
  .event-form[aria-busy=true] .event-form-body { opacity: .65; }
  .goal-event-document .event-conflict:not([hidden]) { flex: none; max-height: 25dvh; overflow: auto; }
  .event-form-actions { display: flex; justify-content: flex-end; align-items: center; gap: 8px; width: 100%; margin: 0; }
  @media (max-width: 760px) {
    .event-form-heading { padding: 14px 16px 10px; }
    .event-form-body { padding: 4px 16px 16px; }
    .event-form-bottom { padding: 10px 16px; }
  }
  .event-form-help { color: var(--muted); font-size: 12px; line-height: 1.6; }
  .event-form-actions .button { min-height: 36px; }
  @media (max-width: 760px) { .event-form-actions .button { min-height: 44px; } }
`;
