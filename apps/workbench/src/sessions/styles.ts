export const SESSIONS_SURFACE_STYLES = `
  .sessions-surface { position: relative; height: 100%; min-width: 0; overflow: hidden; background: var(--paper); color: var(--ink); }
  .sessions-layout { display: grid; grid-template-columns: minmax(280px, 348px) minmax(0, 1fr); height: 100%; min-width: 0; }
  .sessions-list-pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; border-right: 1px solid var(--line); background: var(--paper); }
  .sessions-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 14px 8px; min-width: 0; }
  .sessions-head h1 { margin: 0; font-size: 15px; font-weight: var(--weight-title); line-height: 22px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sessions-head-actions { display: flex; align-items: center; gap: 4px; flex: none; }
  .sessions-views { display: flex; align-items: center; gap: 4px; padding: 0 14px 8px; flex-wrap: wrap; }
  .sessions-filter-bar { display: grid; gap: 6px; padding: 0 14px 10px; border-bottom: 1px solid var(--line); min-width: 0; }
  .sessions-filter-row { display: grid; grid-template-columns: minmax(0, 118px) minmax(0, 1fr); gap: 6px; min-width: 0; }
  .sessions-droid-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; padding: 6px 8px; border-radius: var(--r-control); background: var(--wash); font-size: 12px; color: var(--ink-soft); }
  .sessions-sources { border-bottom: 1px solid var(--line); background: var(--wash); min-width: 0; }
  .sessions-sources-summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 8px 14px; border: 0; background: transparent; color: var(--ink-soft); font: inherit; font-size: 12px; text-align: left; cursor: pointer; min-width: 0; }
  .sessions-sources-summary:hover { color: var(--ink); }
  .sessions-sources-list { display: grid; gap: 6px; padding: 0 14px 10px; min-width: 0; max-height: 240px; overflow-y: auto; }
  .sessions-source-item { display: grid; gap: 6px; padding: 8px 10px; border-radius: var(--r-control); background: var(--paper); box-shadow: inset 0 0 0 1px var(--line); font-size: 12px; min-width: 0; }
  .sessions-source-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
  .sessions-source-top strong { font-weight: var(--weight-control); color: var(--ink); min-width: 0; overflow-wrap: anywhere; }
  .sessions-source-note { margin: 0; color: var(--muted); line-height: 1.5; overflow-wrap: anywhere; }
  .sessions-source-code { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 8px; border-radius: var(--r-tag); background: var(--wash); min-width: 0; }
  .sessions-source-code code { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 11px/16px var(--font-mono); color: var(--ink); }
  .sessions-source-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .sessions-body { flex: 1 1 auto; min-height: 0; min-width: 0; overflow-y: auto; padding: 8px; display: grid; align-content: start; gap: 4px; }
  .sessions-row { display: grid; gap: 3px; width: 100%; padding: 9px 10px; border: 0; border-radius: var(--r-row); background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer; min-width: 0; transition: background-color var(--dur-move) var(--ease-quint); }
  .sessions-row:hover { background: var(--wash); }
  .sessions-row.is-selected { background: var(--nav-active); }
  .sessions-row-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
  .sessions-row-title { font-size: 13px; font-weight: var(--weight-control); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sessions-row-time { flex: none; font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .sessions-row-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 11px; color: var(--muted); min-width: 0; }
  .sessions-row-dir { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); }
  .sessions-empty-card { display: grid; gap: 8px; padding: 18px 14px; margin: 8px 6px; border-radius: var(--r-card); background: var(--wash); color: var(--ink-soft); font-size: 13px; line-height: 1.55; }
  .sessions-empty-card strong { color: var(--ink); font-weight: var(--weight-title); }
  .sessions-unfiled-note { margin: 4px 6px 8px; padding: 10px 12px; border-radius: var(--r-card); background: var(--wash); color: var(--ink-soft); font-size: 12px; line-height: 1.55; display: grid; gap: 6px; }
  .sessions-unfiled-card { display: grid; gap: 8px; padding: 10px 12px; margin: 2px 4px; border-radius: var(--r-card); box-shadow: inset 0 0 0 1px var(--line); background: var(--paper); min-width: 0; }
  .sessions-unfiled-dir { margin: 0; font: 12px/18px var(--font-mono); color: var(--ink); overflow-wrap: anywhere; }
  .sessions-unfiled-suggest { margin: 0; font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
  .sessions-unfiled-controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
  .sessions-unfiled-controls select { flex: 1 1 150px; min-width: 0; }
  .sessions-detail-pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: var(--paper); }
  .sessions-mobile-back { display: none; }
  .sessions-detail-empty { margin: auto; padding: 24px; text-align: center; color: var(--muted); font-size: 13px; max-width: 36ch; }
  .sessions-detail { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; min-width: 0; }
  .sessions-detail-head { display: grid; gap: 8px; padding: 14px 20px 12px; border-bottom: 1px solid var(--line); min-width: 0; }
  .sessions-detail-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; min-width: 0; }
  .sessions-detail-title { margin: 0; font-size: 16px; font-weight: var(--weight-title); line-height: 1.4; min-width: 0; overflow-wrap: anywhere; }
  .sessions-detail-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .sessions-detail-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--muted); min-width: 0; }
  .sessions-detail-meta code { font: 12px/18px var(--font-mono); color: var(--ink-soft); overflow-wrap: anywhere; }
  .sessions-readonly-bar { display: grid; gap: 4px; padding: 8px 12px; border-radius: var(--r-control); background: var(--wash); font-size: 12px; color: var(--ink-soft); min-width: 0; }
  .sessions-resume-cmd { margin: 0; font: 12px/18px var(--font-mono); color: var(--muted); overflow-wrap: anywhere; }
  .sessions-attr-banner { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 8px 12px; border-radius: var(--r-control); background: var(--amber-soft); color: var(--ink); font-size: 12px; min-width: 0; }
  .sessions-detail-search { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .sessions-detail-scroll { flex: 1 1 auto; min-height: 0; min-width: 0; overflow-y: auto; padding: 18px 20px 28px; }
  .sessions-scope-sheet { width: min(620px, 100vw); max-width: 100vw; }
  .sessions-scope-tabs { display: flex; align-items: center; gap: 6px; padding: 0 0 12px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  .sessions-scope-panel { display: grid; gap: 16px; padding-top: 12px; min-width: 0; }
  .sessions-scope-panel[hidden] { display: none; }
  .sessions-scope-group { display: grid; gap: 8px; min-width: 0; }
  .sessions-scope-group h3 { margin: 0; font-size: 13px; font-weight: var(--weight-title); color: var(--ink); }
  .sessions-scope-hint { margin: 0; font-size: 12px; color: var(--muted); line-height: 1.55; overflow-wrap: anywhere; }
  .sessions-tool-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 10px 12px; border-bottom: 1px solid var(--line); min-width: 0; }
  .sessions-tool-row:last-child { border-bottom: 0; }
  .sessions-tool-main { display: flex; align-items: flex-start; gap: 10px; flex: 1 1 200px; min-width: 0; }
  .sessions-tool-copy { display: grid; gap: 2px; min-width: 0; }
  .sessions-tool-copy strong { font-size: 13px; font-weight: var(--weight-control); color: var(--ink); overflow-wrap: anywhere; }
  .sessions-tool-copy small { font-size: 12px; color: var(--muted); line-height: 1.5; overflow-wrap: anywhere; }
  .sessions-tool-copy code { font: 11px/16px var(--font-mono); color: var(--ink-soft); overflow-wrap: anywhere; }
  .sessions-tool-side { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
  @media (max-width: 1080px) {
    .sessions-layout { grid-template-columns: minmax(250px, 300px) minmax(0, 1fr); }
  }
  @media (max-width: 760px) {
    .sessions-layout { grid-template-columns: minmax(0, 1fr); }
    .sessions-surface[data-expanded="true"] .sessions-list-pane { display: none; }
    .sessions-surface:not([data-expanded="true"]) .sessions-detail-pane { display: none; }
    .sessions-mobile-back { display: inline-flex; min-height: 44px; }
    .sessions-row, .sessions-sources-summary { min-height: 44px; }
    .sessions-detail-head, .sessions-detail-scroll { padding-left: 14px; padding-right: 14px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .sessions-row { transition: none; }
  }
`;
