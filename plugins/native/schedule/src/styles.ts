export const SCHEDULE_STYLES = `
  .schedule-stage-chrome { pointer-events: auto; }
  [data-schedule-operation-input], [data-operation-review-input] {
    white-space: pre-wrap; overflow-wrap: anywhere; max-height: 180px; overflow: auto;
    font: 12px/1.6 var(--font-mono, monospace); color: var(--muted);
  }
  .schedule-task-detail {
    display: flex; flex-direction: column; min-height: 0; overflow: hidden;
  }
  .schedule-task-detail > .feed-detail-header { flex: none; padding: 0 24px 12px; }
  .schedule-task-detail > .feed-detail-header h1 { margin: 0; font-size: 15px; font-weight: var(--weight-title, 600); }
  .schedule-task-detail > .feed-detail-header p { margin: 8px 0 0; color: var(--muted); font-size: 12px; }
  .schedule-thread {
    flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain;
    display: flex; flex-direction: column; gap: 16px;
    padding: 4px 24px 32px; max-width: 720px;
  }
  .schedule-turn { display: flex; flex-direction: column; gap: 8px; }
  .schedule-turn header {
    display: flex; align-items: baseline; gap: 8px; color: var(--muted); font-size: 11px;
  }
  .schedule-turn header time { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--faint); }
  .schedule-turn p {
    margin: 0; color: var(--ink); font-size: 13px; line-height: 1.6; white-space: pre-wrap;
  }
  .schedule-turn--system p { color: var(--muted); }
  .schedule-task-detail > .feed-action-status { margin: 0 24px 16px; }
  /* A task's kind in the list: one icon in a kept place, shown once the platform's grants are read (both are drawn, one shows). */
  .schedule-kind { display: inline-grid; place-items: center; width: 16px; height: 16px; flex: none; color: var(--muted); }
  .schedule-kind__icon { grid-area: 1 / 1; display: none; }
  .schedule-kind__icon svg { width: 14px; height: 14px; }
  .schedule-kind[data-schedule-kind-mark="files"] [data-kind="files"], .schedule-kind[data-schedule-kind-mark="data"] [data-kind="data"] { display: inline-flex; }
  /* 「能读的数据」: Schedule's lines around the platform's own area (batch 18 P3 draws inside it). */
  .schedule-reads { display: grid; gap: 8px; min-width: 0; padding-bottom: 16px; border-bottom: 1px solid var(--line); }
  .schedule-reads__title { margin: 0; font-size: 13px; font-weight: var(--weight-control, 560); color: var(--ink-soft); }
  .schedule-reads__line { margin: 0; display: flex; align-items: flex-start; gap: 8px; font-size: 13px; line-height: 1.55; color: var(--muted); }
  .schedule-reads__line svg { width: 15px; height: 15px; flex: none; margin-top: 2px; }
  .schedule-reads__line--fresh { color: var(--ink); }
  .schedule-reads__line--fresh svg { color: var(--accent); }
  .schedule-reads__area:empty { display: none; }
  .schedule-reads__actions { display: flex; gap: 8px; margin-top: 4px; }
  .schedule-reads__actions .mw-btn svg { width: 14px; height: 14px; }
  /* New and edit, in the detail pane where the task will be (no dialog). */
  .schedule-task-form { display: flex; flex-direction: column; min-height: 0; overflow: auto; }
  .schedule-task-form .mw-form { height: auto; max-width: 640px; }
  .schedule-task-form .mw-form__header, .schedule-task-form .mw-form__body { padding-top: 8px; }
  .schedule-time-field .mw-input { max-width: 160px; }
  body.immersive-workbench .plugin-stage-workspace > .schedule-task-form { flex: 1; min-height: 0; }
  body.immersive-workbench .plugin-stage-workspace > .schedule-task-detail {
    flex: 1; min-height: 0; overflow: hidden;
  }
`;
