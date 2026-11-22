/** 用量 (VUX-11): one part per measure, each row a label and its number at the end. A system view (a page the platform draws in
 * a tab, system-tabs.ts) fills its pane. */
export const ASSISTANT_STAGE_STYLES = `
.assistant-usage-part{display:grid;gap:2px;padding-top:8px}.assistant-usage-part>.assistant-progress{margin:2px 0 4px}.assistant-usage-row{display:flex;justify-content:space-between;gap:8px;margin:0;font-size:12px;line-height:1.5}.assistant-usage-row.is-muted{color:var(--muted)}

.system-work-surface{height:100%;min-height:0;min-width:0;overflow:hidden}
`;
