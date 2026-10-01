/** The memory settings page (settings-memory.ts): flat rows on 1px rings, state only in colour, dense meta line. */
export const MEMORY_SETTINGS_STYLES = `
  .memory-settings .memory-summary { margin: 8px 0 0; font-size: 13px; color: var(--ink-soft); }
  .memory-settings .memory-items-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .memory-settings .memory-items-head h2 { margin: 12px 0 4px; font-size: 13px; }
  .memory-settings .memory-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 12px 0; }
  .memory-settings :is(.memory-toolbar, .memory-editor-fields) > .mw-select-picker { width: auto; flex: 0 0 auto; }
  .memory-settings :is(.memory-toolbar, .memory-editor-fields) > .mw-select-picker > .mw-select-picker__trigger { width: auto; min-width: 112px; }
  .memory-settings .memory-search { flex: 1 1 160px; min-width: 0; }
  .memory-settings .memory-list, .memory-settings .memory-change-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .memory-settings .memory-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 12px; padding: 10px 12px; border-radius: 8px; box-shadow: 0 0 0 1px var(--line); }
  .memory-settings .memory-row.is-off .memory-text { color: var(--muted); }
  .memory-settings .memory-row--candidate { box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 38%, var(--line)); }
  .memory-settings .memory-row-copy { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .memory-settings .memory-text { font-size: 13px; font-weight: 500; line-height: 1.5; overflow-wrap: anywhere; }
  .memory-settings .memory-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 12px; color: var(--muted); }
  .memory-settings .memory-meta > span { overflow-wrap: anywhere; }
  .memory-settings .memory-tag { font-size: 11px; padding: 1px 8px; border-radius: 5px; box-shadow: 0 0 0 1px var(--line); color: var(--ink-soft); white-space: nowrap; }
  .memory-settings .memory-tag--auto { color: var(--ink); background: var(--nav-active); }
  .memory-settings .memory-tag--state { color: var(--tone-attention, var(--amber)); }
  .memory-settings .memory-hold { font-size: 12px; color: var(--tone-attention, var(--amber)); }
  .memory-settings .memory-origin { font-size: 12px; color: var(--muted); }
  .memory-settings .memory-origin > summary { cursor: pointer; width: fit-content; list-style: none; }
  .memory-settings .memory-origin > summary::-webkit-details-marker { display: none; }
  .memory-settings .memory-origin > summary::after { content: " ›"; }
  .memory-settings .memory-origin[open] > summary::after { content: " ‹"; }
  .memory-settings .memory-origin > p { margin: 4px 0 0; overflow-wrap: anywhere; }
  .memory-settings .memory-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 4px; }
  .memory-settings .memory-more { position: relative; }
  .memory-settings .memory-more > summary { list-style: none; }
  .memory-settings .memory-more > summary::-webkit-details-marker { display: none; }
  .memory-settings .memory-menu { position: absolute; right: 0; top: calc(100% + 4px); z-index: 20; }
  .memory-settings .memory-change { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 8px 12px; border-radius: 8px; box-shadow: 0 0 0 1px var(--line); }
  .memory-settings .memory-change-copy { display: flex; flex-direction: column; gap: 4px; min-width: 0; font-size: 13px; }
  .memory-settings .memory-change-copy > strong { font-weight: 500; overflow-wrap: anywhere; }
  .memory-settings .memory-change-copy > span { font-size: 12px; overflow-wrap: anywhere; }
  .memory-settings .memory-change.is-undone .memory-change-copy > strong { color: var(--muted); text-decoration: line-through; }
  .memory-settings .memory-editor { display: flex; flex-direction: column; gap: 8px; width: 100%; grid-column: 1 / -1; }
  .memory-settings .memory-editor-slot { margin-bottom: 8px; padding: 10px 12px; border-radius: 8px; box-shadow: 0 0 0 1px var(--line); }
  .memory-settings .memory-editor-text { width: 100%; font-size: 13px; line-height: 1.5; resize: vertical; }
  .memory-settings .memory-editor-fields { display: flex; flex-wrap: wrap; gap: 8px; }
  .memory-settings .memory-editor-fields .mw-input { flex: 1 1 200px; min-width: 0; }
  .memory-settings .memory-editor-actions { display: flex; gap: 8px; }
  .memory-settings .memory-history { margin-top: 4px; font-size: 12px; }
  .memory-settings .memory-history-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
  .memory-settings .memory-history-list li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
  .memory-settings .memory-history-version { color: var(--muted); white-space: nowrap; }
  .memory-settings .memory-pref-static .setting-value { font-size: 13px; }
  .memory-settings .memory-rules-note { margin-top: 16px; font-size: 12px; }
  .memory-settings .memory-empty { padding: 12px 0; font-size: 13px; }
  .memory-settings .memory-pair-line { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 8px; padding: 6px 0; box-shadow: 0 -1px 0 var(--line); }
  .memory-settings .memory-pair-line:first-of-type { box-shadow: none; }
  .memory-settings .memory-pair-line .settings-muted { font-size: 12px; white-space: nowrap; }
  .memory-settings .memory-import { cursor: pointer; }
  @media (max-width: 600px) {
    .memory-settings .memory-row, .memory-settings .memory-change { grid-template-columns: minmax(0, 1fr); }
    .memory-settings .memory-actions { justify-content: flex-start; }
    .memory-settings .memory-menu { left: 0; right: auto; }
    .memory-settings .memory-pair-line { grid-template-columns: minmax(0, 1fr) auto; }
    .memory-settings .memory-pair-line .settings-muted { display: none; }
  }
`;
