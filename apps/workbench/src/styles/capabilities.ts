export const CAPABILITIES_STYLES = `
  .capabilities-page .settings-content:has(.functions-system-editor) { padding: 0; overflow: hidden; }
  .functions-system-editor { position: relative; height: 100%; min-height: 0; overflow: hidden; background: var(--paper); }
  .functions-system-editor .functions-stage-chrome h1 { flex: 1; margin: 0; font-size: 16px; font-weight: 500; }
  .functions-system-editor[data-expanded="true"] > .plugin-stage-list { display: none; }
  .functions-system-editor > .plugin-stage-workspace { position: absolute; inset: 0; overflow: hidden; }
  .functions-system-editor .plugin-stage-list .feed-stage-entry { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 56px; padding: 12px; color: var(--ink); background: transparent; border: 0; border-bottom: 1px solid var(--line); text-align: left; }
  .functions-system-editor .feed-stage-leading { flex: 1; min-width: 0; }
  .functions-system-editor .feed-stage-entry:hover { background: var(--nav-hover); }
  .functions-system-editor .feed-stage-entry strong { font-size: 14px; font-weight: 500; }
  .functions-system-editor .mw-empty { padding: 32px; }
  .capability-rules-link { display: inline-block; margin: 12px 0 4px; color: var(--ink); text-underline-offset: 4px; }
  .capabilities-page .functions-settings-document { padding-bottom: 24px; margin-bottom: 28px; border-bottom: 1px solid var(--line); }
  .capabilities-page .settings-content:has(.capability-library) { padding: 0; overflow: hidden; }
  .capability-library { height: 100%; min-height: 0; display: flex; flex-direction: column; }
  .capability-heading { padding: 28px 28px 18px; border-bottom: 1px solid var(--line); }
  .capability-heading h1 { margin: 0; font-size: 26px; letter-spacing: -.025em; }
  .capability-heading p { color: var(--muted); margin: 6px 0 0; }
  .capability-filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin-top: 22px; }
  .capability-filters label { display: grid; gap: 6px; font-size: 12px; color: var(--muted); min-width: 0; }
  .capability-filters :is(input, select) { width: 100%; min-width: 0; max-width: 260px; min-height: 36px; padding: 6px 10px; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--paper); color: var(--ink); }
  .capability-search { flex: 1; }
  .capability-filters .capability-search input { max-width: none; }
  .capability-browser { display: grid; grid-template-columns: minmax(260px, 36%) minmax(0, 1fr); flex: 1; min-height: 0; }
  .capability-index { border-right: 1px solid var(--line); overflow: auto; min-width: 0; }
  .capability-count { padding: 0 20px; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .capability-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--line); text-decoration: none; color: var(--ink); }
  .capability-row > span:first-child { display: grid; gap: 6px; min-width: 0; overflow-wrap: anywhere; }
  .capability-row strong { font-size: 14px; font-weight: 500; }
  .capability-row small { color: var(--muted); font-size: 12px; }
  .capability-row:hover { background: var(--nav-hover); }
  .capability-row[aria-current] { background: var(--nav-active); }
  .capability-status { white-space: nowrap; font-size: 12px; color: var(--ink-soft); }
  .capability-status.is-unavailable { color: var(--muted); }
  .capability-detail { overflow: auto; padding: 28px; min-width: 0; }
  .capability-detail header h2 { margin: 10px 0; font-size: 22px; letter-spacing: -.02em; }
  .capability-detail p { color: var(--muted); line-height: 1.65; max-width: 70ch; overflow-wrap: anywhere; }
  .capability-detail-meta { color: var(--muted); font-size: 12px; display: flex; flex-wrap: wrap; gap: 14px; }
  .capability-detail section { margin-top: 28px; border-top: 1px solid var(--line); padding-top: 20px; }
  .capability-detail h3 { margin: 0 0 12px; font-size: 14px; font-weight: 600; }
  .capability-detail h3:not(:first-child) { margin-top: 24px; }
  .capability-fields { margin: 0; }
  .capability-fields > div { padding: 10px 0; }
  .capability-fields dt { display: flex; flex-wrap: wrap; gap: 12px; align-items: baseline; }
  .capability-fields :is(small, dd) { color: var(--muted); font-size: 12px; }
  .capability-fields dd { margin: 5px 0 0; }
  .capability-contract { margin-top: 12px; }
  .capability-contract summary { cursor: pointer; padding: 10px 0; font-size: 12px; color: var(--ink-soft); }
  .capability-contract pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; line-height: 1.6; padding: 12px; background: var(--nav-bg); }
  .capability-detail code { overflow-wrap: anywhere; }
  .capability-uses { list-style: none; margin: 0; padding: 0; }
  .capability-uses li { display: grid; gap: 5px; margin: 14px 0; font-size: 12px; }
  .capability-uses span { color: var(--muted); }
  .capability-empty { align-self: center; padding: 28px; text-align: center; color: var(--muted); }
  .capability-empty h2 { font-size: 18px; color: var(--ink); font-weight: 500; }
  .capability-back { display: none; }
  .capability-unavailable { padding: 12px; background: var(--nav-bg); border-radius: 6px; }
  .capability-history article { padding: 20px 0; border-bottom: 1px solid var(--line); overflow-wrap: anywhere; }
  .capability-history article header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; }
  .capability-history :is(p, time) { color: var(--muted); font-size: 12px; }
  .capabilities-page :is(a, input, select, summary, button):focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }
  .mcp-access { margin-bottom: 32px; }
  [data-mcp-settings] .settings-heading a { color: var(--ink-soft); text-underline-offset: 3px; }
  [data-mcp-settings] .settings-heading a:hover { color: var(--ink); }
  .mcp-access-context, .mcp-access-count { color: var(--muted); font-size: 13px; line-height: 1.6; }
  .mcp-access-scope { padding-bottom: 12px; }
  .mcp-access-search { padding: 18px 0; border-top: 1px solid var(--line); }
  .mcp-access [hidden] { display: none !important; }
  .mcp-access-row { display: flex; align-items: start; justify-content: space-between; gap: 20px; padding: 20px 0; border-bottom: 1px solid var(--line); }
  .mcp-access-copy { flex: 1; min-width: 0; }
  .mcp-access-copy h3 { margin: 0 0 6px; color: var(--ink); font-size: 15px; font-weight: 500; overflow-wrap: anywhere; }
  .mcp-access-copy p { margin: 6px 0; font-size: 13px; line-height: 1.6; color: var(--ink-soft); max-width: 70ch; overflow-wrap: anywhere; }
  .mcp-access-origin { font-size: 12px; color: var(--muted); }
  .mcp-access-copy .mcp-access-state { margin-top: 10px; color: var(--muted); }
  .mcp-access-copy .mcp-access-state:is([data-status="enabled"],[data-status="public"]) { color: var(--green); }
  .mcp-access-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: end; }
  .capabilities-page .mcp-access-actions button { min-height: 36px; white-space: nowrap; }
  .mcp-access-row summary { padding: 10px 0; font-size: 12px; color: var(--ink-soft); cursor: pointer; }
  .mcp-access-row dl { margin: 0; padding: 12px; background: var(--nav-bg); font-size: 12px; }
  .mcp-access-row dt { color: var(--muted); margin-bottom: 4px; }
  .mcp-access-row dd { margin: 0 0 12px; overflow-wrap: anywhere; }
  .mcp-access-row dd:last-child { margin-bottom: 0; }
  .mcp-access-feedback { color: var(--ink-soft); line-height: 1.6; overflow-wrap: anywhere; }
  .mcp-access-feedback[role="alert"] { color: var(--red); }
  .mcp-legacy-tools { margin-top: 32px; padding-top: 20px; border-top: 1px solid var(--line); }
  .mcp-legacy-tools > summary { cursor: pointer; padding: 12px 0; color: var(--ink-soft); font-size: 14px; }
  .mcp-legacy-tools > p { color: var(--muted); line-height: 1.6; }
  @media (max-width: 760px) {
    .capabilities-page .mcp-access :is(button,input) { min-height: 44px; }
    .mcp-access-row { flex-direction: column; gap: 10px; }
    .mcp-access-actions { align-self: end; }
    .mcp-access-row :is(summary,button) { min-height: 44px; }
    .mcp-access .capability-filters label { flex-basis: 100%; }

    .functions-system-editor .feed-stage-entry :is(.plugin-stage-fact, .plugin-stage-meta) { display: none; }
    .capabilities-page .settings-shell { grid-template-columns: minmax(0, 1fr) !important; grid-template-rows: auto minmax(0, 1fr) !important; }
    .capabilities-page .settings-navigation { display: block !important; padding: 4px 12px !important; border-right: 0; border-bottom: 1px solid var(--line); overflow-x: auto; }
    .capabilities-page .settings-navigation > :is(.settings-nav-back, .settings-project-identity) { display: none; }
    .capabilities-page .settings-nav-body { display: flex; width: max-content; gap: 4px; }
    .capabilities-page .settings-nav-body a { min-height: 44px; padding: 8px 10px; font-size: 13px; display: flex; }
    .capabilities-page .settings-nav-body svg { display: none; }
    .capability-heading { padding: 20px 16px 16px; }
    .capability-filters { gap: 10px; }
    .capability-filters label { flex: 1 1 40%; }
    .capability-filters :is(input, select, button) { min-height: 44px; max-width: none; }
    .capability-browser { display: block; overflow: auto; }
    .capability-index { border: 0; }
    .capability-empty { display: none; }
    .capability-library.has-selection .capability-empty { display: block; }
    .capabilities-page .project-preferences-chrome > a { width: 44px; height: 44px; }
    .capability-library.has-selection :is(.capability-index, .capability-heading) { display: none; }
    .capability-detail { padding: 20px 16px; }
    .capability-back { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; margin-bottom: 12px; color: var(--ink-soft); text-decoration: none; }
    .capability-back svg { width: 16px; height: 16px; }
    .capability-contract summary { min-height: 44px; }
  }
`;
