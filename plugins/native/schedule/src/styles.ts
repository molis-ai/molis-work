export const SCHEDULE_STYLES = `
  .schedule-stage-chrome { pointer-events: auto; }
  .schedule-task-detail {
    display: flex; flex-direction: column; min-height: 0; overflow: hidden;
  }
  .schedule-task-detail > .feed-detail-header { flex: none; padding: 0 20px 12px; }
  .schedule-task-detail > .feed-detail-header h1 { margin: 0; font-size: 16px; font-weight: 400; }
  .schedule-task-detail > .feed-detail-header p { margin: 6px 0 0; color: var(--muted); font-size: 12px; }
  .schedule-thread {
    flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain;
    display: flex; flex-direction: column; gap: 16px;
    padding: 4px 20px 28px; max-width: 720px;
  }
  .schedule-turn { display: flex; flex-direction: column; gap: 6px; }
  .schedule-turn header {
    display: flex; align-items: baseline; gap: 8px; color: var(--muted); font-size: 11px;
  }
  .schedule-turn header time { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--faint); }
  .schedule-turn p {
    margin: 0; color: var(--ink); font-size: 13px; line-height: 1.6; white-space: pre-wrap;
  }
  .schedule-turn--system p { color: var(--muted); }
  .schedule-task-detail > .feed-action-status { margin: 0 20px 16px; }
  body.immersive-workbench .plugin-stage-workspace > .schedule-task-detail {
    flex: 1; min-height: 0; overflow: hidden;
  }
`;
