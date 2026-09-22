/** Layout only: controls, colours and focus treatments remain Design System owned. */
export const MODEL_SETTINGS_STYLES = `
.model-settings-head,.model-settings-actions,.model-provider-detail-head,.model-list-head,.model-row,.model-key-row { display:flex; align-items:center; gap:8px; }
.model-settings-head,.model-list-head { justify-content:space-between; }
.model-settings-actions { flex-wrap:wrap; }
.model-settings-panes { display:grid; grid-template-columns:minmax(140px,200px) minmax(0,1fr); gap:28px; margin-top:24px; }
.model-provider-list { display:flex; flex-direction:column; gap:4px; }
.model-provider-group,.model-list h3 { font-size:12px; font-weight:400; color:var(--muted); }
.model-provider-row { display:flex; align-items:center; gap:8px; width:100%; padding:8px; border:0; border-radius:6px; background:transparent; color:var(--ink); text-align:left; }
.model-provider-row:hover { background:var(--nav-hover); }
.model-provider-row.is-current { background:var(--nav-active); }
.model-provider-detail { min-width:0; }
.model-provider-detail-head { flex-wrap:wrap; margin-bottom:24px; }
.model-provider-detail-head .mw-check-row { white-space:nowrap; }
.model-provider-detail-head h2 { margin:0; flex:1; font-size:16px; font-weight:400; }
.model-field { display:grid; gap:8px; margin:20px 0; }
.model-field label { color:var(--ink-soft); font-size:12px; }
.model-field .mw-input,.model-field .mw-select { width:100%; min-width:0; }
.model-key-row .mw-input { flex:1; }
.model-field-note,.model-field-hint,.model-settings-actions span,[data-model-status] { font-size:12px; color:var(--muted); line-height:1.6; }
[data-model-status] { min-height:20px; }
.model-row { margin:10px 0; }
.model-row-id { flex:1; min-width:0; }
.model-list { margin:28px 0; }
.model-provider-name { flex:1; overflow:hidden; text-overflow:ellipsis; }
.model-settings-document svg { width:16px; height:16px; flex-shrink:0; }
[data-model-delete-confirm] { padding:16px 0; color:var(--ink-soft); }
@media(max-width:700px) {
  .model-settings-panes { grid-template-columns:1fr; gap:16px; }
  .model-provider-list { flex-direction:row; flex-wrap:wrap; }
  .model-provider-row { width:auto; }
  .model-provider-group { width:100%; }
  .model-settings-head { align-items:flex-start; flex-direction:column; }
}
`;
