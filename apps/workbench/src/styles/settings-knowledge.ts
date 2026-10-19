/** 项目资料 in project settings (settings-knowledge.ts): flat rows on 1px rings like the memory page, state in a badge, dense meta line. */
export const KNOWLEDGE_SETTINGS_STYLES = `
  .knowledge-settings .knowledge-summary { margin: 8px 0 0; font-size: 13px; color: var(--ink-soft); }
  .knowledge-settings .knowledge-model-note { margin: 0 0 12px; padding: 10px 12px; border-radius: 8px; background: color-mix(in srgb, var(--tone-attention, var(--amber)) 10%, transparent); font-size: 13px; }
  .knowledge-settings .knowledge-select-all[hidden] { display: none; }
  .knowledge-settings .knowledge-quota-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .knowledge-settings .knowledge-quota-copy { display: flex; flex-direction: column; gap: 8px; min-width: 0; flex: 1 1 240px; font-size: 13px; }
  .knowledge-settings .knowledge-quota-bar { max-width: 360px; }
  .knowledge-settings .knowledge-items-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .knowledge-settings .knowledge-items-head h2 { margin: 12px 0 4px; font-size: 13px; }
  .knowledge-settings .knowledge-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 12px 0 8px; }
  .knowledge-settings .knowledge-toolbar > .mw-select-picker { width: auto; flex: 0 0 auto; }
  .knowledge-settings .knowledge-toolbar > .mw-select-picker > .mw-select-picker__trigger { width: auto; min-width: 112px; }
  .knowledge-settings .knowledge-search { flex: 1 1 180px; min-width: 0; }
  .knowledge-settings .knowledge-batch { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 8px; padding: 6px 8px; border-radius: 8px; background: var(--nav-active); font-size: 13px; }
  .knowledge-settings .knowledge-batch > span { margin-right: 6px; }
  .knowledge-settings .knowledge-select-all { display: inline-flex; align-items: center; gap: 8px; margin: 0 0 8px 12px; font-size: 12px; color: var(--muted); }
  .knowledge-settings :is(.knowledge-list, .knowledge-receipt-list) { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .knowledge-settings .knowledge-row { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 4px 12px; padding: 10px 12px; border-radius: 8px; box-shadow: 0 0 0 1px var(--line); }
  .knowledge-settings .knowledge-row > input[type=checkbox] { margin-top: 3px; }
  .knowledge-settings .knowledge-row.is-excluded .knowledge-title { color: var(--muted); }
  .knowledge-settings .knowledge-row-copy { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .knowledge-settings .knowledge-title { all: unset; cursor: pointer; font-size: 13px; font-weight: 500; line-height: 1.5; overflow-wrap: anywhere; border-radius: 4px; }
  .knowledge-settings .knowledge-title:hover { text-decoration: underline; text-underline-offset: 3px; }
  .knowledge-settings .knowledge-title:focus-visible { outline: 2px solid var(--focus, var(--action)); outline-offset: 2px; }
  .knowledge-settings .knowledge-brief { margin: 0; font-size: 12px; line-height: 1.5; color: var(--ink-soft); overflow-wrap: anywhere; }
  .knowledge-settings .knowledge-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 12px; color: var(--muted); }
  .knowledge-settings .knowledge-meta > span { overflow-wrap: anywhere; }
  .knowledge-settings .knowledge-tag { font-size: 11px; padding: 1px 8px; border-radius: 5px; box-shadow: 0 0 0 1px var(--line); color: var(--ink-soft); white-space: nowrap; }
  .knowledge-settings .knowledge-detail { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 10px; margin-top: 8px; padding-top: 10px; box-shadow: 0 -1px 0 var(--line); }
  .knowledge-settings .knowledge-failed { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--tone-blocked, var(--red)); }
  .knowledge-settings .knowledge-fields { display: flex; flex-direction: column; gap: 10px; }
  .knowledge-settings .knowledge-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--ink-soft); }
  .knowledge-settings .knowledge-field-head { display: flex; align-items: center; gap: 8px; }
  .knowledge-settings .knowledge-mark { font-size: 11px; color: var(--tone-attention, var(--amber)); }
  .knowledge-settings .knowledge-field :is(.mw-input, .mw-textarea) { width: 100%; font-size: 13px; }
  .knowledge-settings .knowledge-suggestion { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px; border-radius: 6px; background: color-mix(in srgb, var(--tone-attention, var(--amber)) 9%, transparent); color: var(--ink); overflow-wrap: anywhere; }
  .knowledge-settings .knowledge-suggestion > span { flex: 1 1 200px; min-width: 0; }
  .knowledge-settings .knowledge-detail-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .knowledge-settings .knowledge-exclude { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; font-size: 12px; color: var(--ink-soft); }
  .knowledge-settings .knowledge-outline { font-size: 12px; }
  .knowledge-settings .knowledge-outline > summary { cursor: pointer; width: fit-content; color: var(--ink-soft); }
  .knowledge-settings .knowledge-outline ol { margin: 6px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
  .knowledge-settings .knowledge-outline li { display: flex; flex-direction: column; gap: 2px; overflow-wrap: anywhere; }
  .knowledge-settings .knowledge-outline li > strong { font-weight: 500; }
  .knowledge-settings .knowledge-outline li > span { color: var(--ink-soft); }
  .knowledge-settings .knowledge-detail-receipts { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 12px; color: var(--muted); }
  .knowledge-settings .knowledge-receipt { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: baseline; gap: 10px; padding: 6px 0; font-size: 13px; box-shadow: 0 -1px 0 var(--line); }
  .knowledge-settings .knowledge-receipt:first-child { box-shadow: none; }
  .knowledge-settings .knowledge-receipt > strong { font-weight: 500; white-space: nowrap; }
  .knowledge-settings .knowledge-receipt > span { overflow-wrap: anywhere; }
  .knowledge-settings .knowledge-receipt > .settings-muted { font-size: 12px; white-space: nowrap; }
  .knowledge-settings .knowledge-more { margin-top: 8px; }
  .knowledge-settings .knowledge-empty { padding: 12px 0; font-size: 13px; }
  @media (max-width: 600px) {
    .knowledge-settings .knowledge-receipt { grid-template-columns: minmax(0, 1fr); gap: 2px; }
    .knowledge-settings .knowledge-exclude { margin-left: 0; }
    .knowledge-settings .knowledge-select-all { margin-left: 0; }
  }
`;

/** The project knowledge picker (browser/knowledge/picker.ts): a form dialog, one checkbox row per piece, the count by the buttons. */
export const KNOWLEDGE_PICKER_STYLES = `
  dialog.mw-dialog.knowledge-picker { width: min(560px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); padding: 20px; display: none; }
  dialog.mw-dialog.knowledge-picker[open] { display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto auto; gap: 12px; }
  .knowledge-picker header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .knowledge-picker h2 { margin: 0; font-size: 15px; font-weight: var(--weight-title, 600); }
  .knowledge-picker-tools { display: flex; flex-wrap: wrap; gap: 8px; }
  .knowledge-picker-tools > .mw-input { flex: 1 1 200px; min-width: 0; }
  .knowledge-picker-tools > .mw-select-picker { flex: 0 0 auto; width: auto; }
  .knowledge-picker-tools > .mw-select-picker > .mw-select-picker__trigger { width: auto; min-width: 112px; max-width: 160px; }
  .knowledge-picker-list { list-style: none; margin: 0; padding: 0; overflow: auto; height: min(50dvh, 420px); display: flex; flex-direction: column; gap: 2px; }
  .knowledge-picker-row label { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; align-items: start; padding: 8px; border-radius: 8px; cursor: pointer; }
  .knowledge-picker-row label:hover { background: var(--nav-hover); }
  .knowledge-picker-row .mw-check { margin-top: 2px; }
  .knowledge-picker-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .knowledge-picker-copy strong { font-size: 13px; font-weight: 500; overflow-wrap: anywhere; }
  .knowledge-picker-copy small { font-size: 12px; color: var(--muted); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .knowledge-picker-empty { padding: 16px 8px; font-size: 13px; color: var(--muted); }
  .knowledge-picker-status { margin: 0; min-height: 1em; font-size: 12px; color: var(--muted); }
  .knowledge-picker footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
  .knowledge-picker-count { margin-right: auto; font-size: 12px; color: var(--muted); }
`;
