/** Files uses shared controls and directory rows; these rules describe its reading surface. */
export const FILES_STYLES = `
.files-browser { min-height:0; overflow:auto; padding:8px; }
.files-browser[hidden],.files-results[hidden] { display:none; }
.files-browser .mw-field { display:grid; gap:6px; }
.files-browser select { width:100%; }
.files-directory-toolbar { padding:8px 0 4px; }
.files-directory-toolbar .mw-dir__label { padding-left:4px; }
.files-notice,[data-files-status],[data-files-notice],[data-files-capture-status] { color:var(--muted); font-size:12px; line-height:1.6; overflow-wrap:anywhere; }
[data-files-status]:empty,[data-files-capture-status]:empty { display:none; }
[data-files-tree] ul { margin:0; padding-left:12px; list-style:none; }
[data-files-tree]>ul { padding-left:0; }
[data-files-tree] .mw-dir-row { min-height:30px; }
[data-files-tree] button[aria-current=true] { background:var(--nav-active); }
.files-results { min-width:0; height:100%; display:flex; flex-direction:column; }
.files-reader-head { display:flex; align-items:center; gap:8px; padding:12px 16px; flex:none; }
.files-reader-head > div:not(.mw-group) { flex:1; min-width:0; }
.files-reader-kind { color:var(--faint); font-size:11px; }
.files-results h2 { margin:2px 0 0; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14px; font-weight:500; }
.files-reader-body { min-width:0; min-height:0; overflow:auto; padding:0 20px 24px; }
.files-reader-body > [data-files-notice] { margin:0 0 12px; }
.files-preview.mw-textarea { width:100%; min-height:140px; height:clamp(160px,26dvh,300px); resize:vertical; white-space:pre; overflow:auto; padding:12px; border-color:var(--line); background:var(--paper); font:12px/1.75 ui-monospace,SFMono-Regular,Menlo,monospace; tab-size:2; }
.files-snapshots { padding:16px 0 8px; }
.files-snapshot-heading { display:flex; align-items:baseline; flex-wrap:wrap; gap:8px; }
.files-snapshot-heading h4 { margin:0; font-size:13px; font-weight:500; }
.files-snapshot-heading span { font-size:11px; color:var(--muted); }
.files-actions { display:flex; flex-wrap:wrap; gap:8px; margin:8px 0; }
.files-results details { margin:8px 0; padding:8px 0; font-size:12px; }
.files-results summary { cursor:pointer; min-height:28px; align-content:center; color:var(--ink); }
.files-results details > p { color:var(--muted); }
.files-results .stats-counts { display:grid; grid-template-columns:1fr auto; gap:8px; max-width:400px; font-variant-numeric:tabular-nums; }
.files-results .stats-counts dd { margin:0; }
.files-results .stats-origin { display:block; color:var(--muted); overflow-wrap:anywhere; }
.files-results[aria-busy=true] .files-reader-body { opacity:.65; }
@container coding-companion (max-width:600px) {
  .files-reader-head { flex-wrap:wrap; padding:8px 12px; gap:4px 8px; }
  .files-reader-head > div:not(.mw-group) { order:3; flex-basis:100%; padding:4px; }
  .files-reader-head > .mw-group { margin-left:auto; }
  .files-reader-body { padding:4px 16px 20px; }
  .files-results summary { min-height:44px; }
  .files-preview.mw-textarea { height:26dvh; min-height:160px; font-size:13px; }
}
`;
