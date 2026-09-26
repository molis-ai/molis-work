/** The list of Coding sessions running or waiting, opened from the title bar or the project directory. */
export const BACKGROUND_TASKS_MENU_STYLES = `
  .background-tasks-menu { position: fixed; inset: auto; margin: 0; width: 320px; max-height: calc(100vh - 60px); overflow: auto; padding: 6px; color: var(--ink); background: var(--paper); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--control-shadow); }
  .background-tasks-menu > strong { display: block; padding: 8px 10px 6px; font-size: 12px; font-weight: 400; color: var(--muted); }
  .background-tasks-menu .background-task { display: grid; gap: 2px; padding: 7px 10px; border-radius: 6px; color: inherit; text-decoration: none; }
  .background-tasks-menu .background-task:hover, .background-tasks-menu .background-task:focus-visible { background: var(--nav-hover); }
  .background-tasks-menu .background-task-head { display: flex; gap: 8px; align-items: baseline; min-width: 0; font-size: 13px; }
  .background-tasks-menu .background-task-title { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .background-tasks-menu .background-task-head time { flex: none; color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .background-tasks-menu .background-task-detail { display: flex; gap: 8px; color: var(--muted); font-size: 12px; }
  .background-tasks-menu .background-task-project { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .background-tasks-menu .background-task:is([data-state="waiting-approval"], [data-state="waiting-answer"], [data-state="reconcile-required"]) .background-task-detail > :first-child { color: var(--ink); }
`;
