/** D-reviewed B58 float body; its owner supplies width and height. Shared by hosted plugin pages and the workbench. */
export const SUBTASK_CONVERSATION_STYLES = `
  .mw-subtask { display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%; overflow: hidden; color: var(--ink); background: var(--paper); border: 1px solid var(--line); border-radius: var(--r-card); box-shadow: var(--lift-2); }
  .mw-subtask[hidden] { display: none; }
  .mw-subtask__head { display: flex; align-items: center; gap: 6px; padding: 8px; border-bottom: 1px solid var(--line); flex: none; }
  .mw-subtask__head > strong { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: var(--weight-title); }
  .mw-subtask__head > .mw-btn { flex: none; }
  .mw-subtask__context { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 8px; border-bottom: 1px solid var(--line); background: var(--surface-soft); flex: none; }
  .mw-subtask__context:empty { display: none; }
  .mw-subtask__parent { flex: 1; min-width: 0; overflow: hidden; }
  .mw-subtask__parent > .mw-btn { max-width: 100%; color: var(--muted); font-size: 11px; }
  .mw-subtask__parent [data-slot="button-label"] { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mw-subtask__controls { display: flex; gap: 6px; flex: none; }
  .mw-subtask__thread { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
  .mw-subtask__thread > * { flex: none; min-width: 0; }
  .mw-subtask__intro h3 { font-size: 15px; line-height: 1.6; margin: 0 0 4px; font-weight: var(--weight-title); }
  .mw-subtask__intro > p { font-size: 12px; line-height: 1.6; color: var(--muted); margin: 0 0 9px; }
  .mw-subtask__state { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
  .mw-subtask__state > .mw-state-ring { width: 14px; height: 14px; }
  .mw-subtask__messages { display: grid; gap: 14px; }
  .mw-subtask__message { min-width: 0; font-size: 13px; line-height: 1.8; overflow-wrap: anywhere; }
  .mw-subtask__who { font-size: 11px; color: var(--muted); margin-bottom: 7px; }
  .mw-subtask__words > :first-child { margin-top: 0; }
  .mw-subtask__words > :last-child { margin-bottom: 0; }
  .mw-subtask__words :is(img, video, pre, table) { max-width: 100%; }
  .mw-subtask__words pre { overflow: auto; }
  .mw-subtask__message[data-role="user"] .mw-subtask__words { padding: 10px 12px; border-radius: var(--r-card); background: var(--wash); }
  .mw-subtask__message[data-role="notice"], .mw-subtask__receipt { font-size: 11px; line-height: 1.6; color: var(--muted); }
  .mw-subtask__receipt { margin: 6px 0 0; }
  .mw-subtask__detail { font-size: 12px; line-height: 1.6; color: var(--ink-soft); margin-bottom: 12px; }
  .mw-subtask__detail > summary { padding: 6px 0; cursor: pointer; color: var(--muted); }
  .mw-subtask__detail-body { overflow-wrap: anywhere; }
  .mw-subtask__answers { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .mw-subtask__children { display: grid; gap: 6px; }
  .mw-subtask__children:empty { display: none; }
  .mw-subtask__children > p { font-size: 12px; color: var(--muted); margin: 0; }
  .mw-subtask__child > .mw-btn { flex: 1; justify-content: flex-start; min-width: 0; }
  .mw-subtask__child { display: flex; align-items: center; min-width: 0; gap: 6px; }
  .mw-subtask__child > .mw-state-ring { width: 14px; height: 14px; flex: none; }
  .mw-subtask__children [data-slot="button-label"] { overflow: hidden; text-overflow: ellipsis; }
  .mw-subtask__feedback { flex: none; max-height: 30%; overflow: auto; padding: 10px 12px; font-size: 12px; color: var(--ink-soft); }
  .mw-subtask__feedback:empty { display: none; }
  .mw-subtask__latest { display: flex; justify-content: center; flex: none; }
  .mw-subtask__latest[hidden] { display: none; }
  .mw-subtask__composer { flex: none; min-width: 0; padding: 10px; border-top: 1px solid var(--line); background: var(--surface-soft); }
  .mw-subtask__composer .mw-composer { width: 100%; box-shadow: none; }
  .mw-subtask__plain { white-space: pre-wrap; }
  /* This float has one owner control in its context row; the shared composer handles messages only. */
  .mw-subtask__composer [data-composer-stop] { display: none; }
  .mw-subtask__composer textarea { min-height: 56px; max-height: 110px; }
  .mw-subtask :is(button, summary, [tabindex]):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  @media (pointer: coarse), (max-width: 600px) {
    .mw-subtask .mw-btn, .mw-subtask__detail > summary { min-height: 44px; }
    .mw-subtask__head > .mw-btn { width: 44px; min-width: 44px; }
    .mw-subtask__context { flex-wrap: wrap; }
  }
`;
