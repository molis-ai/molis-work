import { SERVICE_CONNECTION_PROGRESS_STYLES } from "../service-connection-parts.js";

/**
 * Layout only: controls, colours and focus treatments remain Design System owned. The first key's step progress is the
 * service-connection part's own (`SERVICE_CONNECTION_PROGRESS_STYLES`).
 */
export const MODEL_SETTINGS_STYLES = `
.model-settings-head,.model-settings-actions,.model-provider-detail-head,.model-list-head,.model-row,.model-provider-row { display:flex; align-items:center; gap:8px; }
.model-settings-head,.model-list-head { justify-content:space-between; }
.model-settings-actions,.model-row { flex-wrap:wrap; }
.model-settings-panes { display:grid; grid-template-columns:minmax(140px,200px) minmax(0,1fr); gap:32px; margin-top:24px; }
.model-provider-list { display:flex; flex-direction:column; gap:4px; }
.model-provider-group,.model-list h3 { font-size:12px; font-weight:400; color:var(--muted); }
.model-provider-row { width:100%; padding:8px; border:0; border-radius:6px; background:transparent; color:var(--ink); text-align:left; }
.model-provider-row:hover { background:var(--nav-hover); }
.model-provider-row.is-current { background:var(--nav-active); }
.model-provider-detail { min-width:0; }
.model-provider-detail.mw-empty,.mw-empty .mw-choice-group { justify-items:center; justify-content:center; text-align:center; }
.model-provider-detail-head { flex-wrap:wrap; margin-bottom:24px; }
.model-provider-detail-head .mw-check-row { white-space:nowrap; }
.model-provider-detail-head h2 { margin:0; flex:1; font-size:15px; font-weight: var(--weight-title, 600); }
.model-section { margin: 8px 0 4px; }
.model-section h3 { margin: 24px 0 0; font-size: 13px; font-weight: 500; }
.mw-card.model-facts { width:auto; margin:0 0 8px; }
.model-facts .mw-card__panel { padding-block:4px; container-type:inline-size; }
.model-facts .settings-setting-row:last-child { border-bottom:0; }
.model-facts .setting-value { max-width:60%; min-width:0; }
.model-facts .setting-value > * { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
@container (max-width:480px) { .model-facts .settings-setting-row { flex-direction:column; align-items:flex-start; gap:4px; } .model-facts .setting-value { max-width:100%; justify-content:flex-start; } }
.model-advanced { margin: 24px 0 8px; }
.model-advanced>.mw-collapsible__body{gap:24px}.model-advanced .model-field{margin:0}
.model-diagnostics { margin:0; padding:12px; border-radius:var(--r-tag); background:var(--surface-soft); color:var(--ink-soft); font:12px/1.6 var(--font-mono, ui-monospace, monospace); white-space:pre-wrap; overflow-wrap:anywhere; }
.model-field { display:grid; gap:8px; margin:24px 0; }
.model-field label,.model-field-label { color:var(--ink-soft); font-size:12px; }
.model-field .mw-input,.model-field .mw-select { width:100%; min-width:0; }
.model-field-note,.model-field-hint,.model-save-note,[data-model-status] { font-size:12px; color:var(--muted); line-height:1.6; }
[data-model-status] { min-height:20px; }
[data-model-status][data-failed]{color:var(--red)}
[data-model-limited]:not([hidden]) { display:grid; justify-items:start; gap:4px; margin:16px 0; }
[data-model-limited] p { margin:0 0 8px; }
.model-save-bar { padding-top:16px; border-top:1px solid var(--line); }
.model-save-bar .connection-progress { flex-basis:100%; }
.model-save-note { flex:1 1 220px; min-width:0; }
.model-row { margin:12px 0; }
.model-row-id { flex:1 1 140px; min-width:0; }
.model-row-flag { display:inline-flex; align-items:center; gap:4px; color:var(--muted); font-size:12px; white-space:nowrap; cursor:pointer; }
.model-list { margin:32px 0; }
.model-list-head h3{margin:0 auto 0 0}
.model-picker [role=listbox]:empty{display:none}
.model-picker-name{margin-left:8px;color:var(--muted);font-size:12px}
.model-picker [aria-selected=true]{color:var(--muted)}
.model-picker [aria-selected=true]::after{content:" ✓"}
.model-provider-name { flex:1; overflow:hidden; text-overflow:ellipsis; }
.model-settings-document svg { width:16px; height:16px; flex-shrink:0; }
[data-model-delete-confirm],[data-model-released] { padding:16px 0; color:var(--ink-soft); }
:is([data-model-delete-confirm],[data-model-released]):not([hidden]) { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
:is([data-model-delete-confirm],[data-model-released]) p { flex-basis:100%; margin:0 0 4px; }
@media(max-width:700px) {
  .model-settings-panes { grid-template-columns:1fr; gap:16px; }
  .model-provider-list { flex-direction:row; flex-wrap:wrap; }
  .model-provider-row { width:auto; }
  .model-provider-group { width:100%; }
  .model-settings-head { align-items:flex-start; flex-direction:column; }
}
${SERVICE_CONNECTION_PROGRESS_STYLES}`;
