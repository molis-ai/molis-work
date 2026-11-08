/** The background tasks running or waiting, listed in their tab of the right side (side-panel.ts `.side-tasks`). */
export const BACKGROUND_TASKS_STYLES = `
  .side-tasks .background-task { display: grid; gap: 4px; padding: 8px 12px; border-radius: 6px; color: inherit; text-decoration: none; }
  .side-tasks .background-task:hover, .side-tasks .background-task:focus-visible { background: var(--nav-hover); }
  .side-tasks .background-task-head { display: flex; gap: 8px; align-items: baseline; min-width: 0; font-size: 13px; }
  .side-tasks .background-task-title { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .side-tasks .background-task-head time { flex: none; color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .side-tasks .background-task-detail { display: flex; gap: 8px; color: var(--muted); font-size: 12px; }
  .side-tasks .background-task-command { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 0 12px 8px 32px; font-size: 12px; color: var(--muted); }
  .side-tasks .background-task-command code { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); }
  .side-tasks .background-task-command .mw-btn { min-height: 24px; height: 24px; padding: 0 8px; }
  .side-tasks .background-task-project { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .side-tasks .background-task:is([data-state="waiting-approval"], [data-state="waiting-answer"], [data-state="reconcile-required"]) .background-task-detail > :first-child { color: var(--ink); }
`;
