/**
 * 授权与放行 in project settings (settings-task-grants.ts): one container per task on paper with a light shadow, grouped under its
 * plugin's name; inside, the task's name and its two actions on one line, then one item row per category it holds (`mw-item`, the
 * rows the reads area on a plugin page draws its categories with), each with its state as a tag and its one or two actions. A row is
 * one line: the description is cut first, and on a phone a row that also offers 允许 drops its tag (the button says it) so the
 * category keeps its name. The settings sheet adds the item rows themselves (`ITEM_ROW_STYLES`); the workbench sheet
 * has them already, from the reads area's styles.
 */
export const TASK_GRANTS_SETTINGS_STYLES = `
.task-grants-page{container-type:inline-size;display:grid;grid-template-columns:minmax(0,1fr);gap:20px;margin-top:12px}
.task-grants-page[aria-busy] .task-grants-page__state{cursor:progress}
.task-grants-page__state{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0;padding:14px 16px;border-radius:var(--sk-r-card,12px);background:var(--sk-raised,var(--paper));box-shadow:inset 0 0 0 1px var(--line);color:var(--muted);font-size:13px;line-height:1.6}
.task-grants-page__state.is-error{background:color-mix(in srgb,var(--red) 6%,var(--paper));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--red) 26%,var(--line));color:color-mix(in srgb,var(--red) 78%,var(--ink))}
.task-grants-page__group{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;min-width:0}
.task-grants-page__group-head{display:flex;align-items:center;gap:8px;margin:0;min-width:0;color:var(--ink-soft);font-size:13px;font-weight:var(--weight-title,600)}
.task-grants-page__group-head>span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.task-grants-page__task{display:grid;grid-template-columns:minmax(0,1fr);min-width:0;padding:6px;border-radius:var(--sk-r-card,12px);background:var(--sk-raised,var(--paper));box-shadow:inset 0 0 0 1px var(--sk-card-edge,var(--line)),var(--lift-1);transition:opacity var(--dur-hover,130ms) var(--ease-quint)}
.task-grants-page__task[aria-busy]{cursor:progress}
.task-grants-page__task[aria-busy] .mw-btn{opacity:.6}
.task-grants-page__task-head{display:flex;align-items:center;gap:12px;min-height:40px;padding:2px 4px 2px 10px}
.task-grants-page__task-head>strong{flex:1 1 auto;min-width:0;overflow:hidden;color:var(--ink);font-size:14px;font-weight:var(--weight-title,600);text-overflow:ellipsis;white-space:nowrap}
.task-grants-page__task-head>strong.is-unnamed{color:var(--ink-soft);font-weight:var(--weight-control,500)}
.task-grants-page__task-actions{display:flex;align-items:center;gap:8px;flex:none}
.task-grants-page__rows{display:grid;grid-template-columns:minmax(0,1fr);margin:4px 0 0;padding:4px 0 0;list-style:none;box-shadow:inset 0 1px 0 var(--line)}
.task-grants-page__row.mw-item{min-width:0}
.task-grants-page__row.mw-item>.task-grants-page__copy{display:flex;align-items:baseline;gap:8px;flex:1 1 0;min-width:0}
.task-grants-page__row.mw-item>span.mw-item__end{display:flex;align-items:center;justify-content:flex-end;flex:none;gap:8px}
.task-grants-page__row .mw-badge{flex:none;white-space:nowrap}
.task-grants-page__row[data-status="removed"] strong,.task-grants-page__row[data-status="unavailable"] strong{color:var(--ink-soft)}
@container (max-width:520px){.task-grants-page__row small{display:none}.task-grants-page__task-head{padding-left:8px}}
@container (max-width:400px){.task-grants-page__row[data-status="needs_confirmation"] .mw-badge{display:none}}
`;
