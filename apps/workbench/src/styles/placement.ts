/** Placement bar, panel, dialogs and completion cards (specs/work-placement §4). Shared tokens only; no new visual system. */
export const PLACEMENT_STYLES = `
  /* The bar gives way in a crowded header: the location ellipsizes rather than pushing the plugin's own buttons out. */
  [data-placement-slot], .plugin-stage-detail-bar > span[data-placement-slot] { display: inline-flex; flex: 0 1 auto; min-width: 0; max-width: 100%; overflow: hidden; }
  [data-placement-slot]:empty, .plugin-stage-detail-bar > span[data-placement-slot]:empty { display: none; }
  .placement-bar { display: inline-flex; align-items: center; min-width: 0; max-width: 100%; height: 26px; padding: 0 4px; gap: 0; font: inherit; font-size: 12px;
    color: var(--muted); background: transparent; border: 1px solid var(--line); border-radius: 13px; cursor: pointer; }
  .placement-bar:hover, .placement-bar:focus-visible { background: var(--nav-hover); border-color: var(--line-strong); color: var(--ink); }
  .placement-bar > span { display: inline-flex; align-items: center; padding: 0 6px; white-space: nowrap; }
  .placement-bar > span + span:not([hidden]) { border-left: 1px solid var(--line); }
  .placement-bar > span:empty { display: none; }
  .placement-bar > .placement-bar-where { color: var(--ink); font-weight: 500; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 0 1 auto; }
  .placement-bar-saved:empty { display: none; }
  .placement-bar-saved::before { content: ""; width: 6px; height: 6px; border-radius: 50%; margin-right: 5px; background: var(--green); }
  .placement-bar-saved.is-unsaved::before { background: var(--amber); }
  .placement-target { display: inline-flex; align-items: baseline; gap: 4px; font-size: 12px; color: var(--muted); white-space: nowrap; }
  .placement-target b { font-weight: 500; color: var(--ink-soft, var(--ink)); }
  .placement-panel { position: fixed; z-index: 60; width: min(380px, calc(100vw - 16px)); max-height: calc(100vh - 80px); overflow: auto; padding: 14px;
    background: var(--paper); color: var(--ink); border: 1px solid var(--line-strong); border-radius: 12px; box-shadow: var(--shadow); }
  .placement-panel-title { margin: 0 0 10px; font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
  .placement-panel h3 { margin: 12px 0 6px; font-size: 12px; font-weight: 500; color: var(--muted); }
  .placement-panel-facts { display: grid; grid-template-columns: 64px 1fr; gap: 6px 10px; margin: 0; font-size: 12px; }
  .placement-panel-facts dt { color: var(--muted); }
  .placement-panel-facts dd { margin: 0; }
  .placement-panel-warning { margin: 0 0 8px; padding: 8px 10px; border-radius: 8px; background: var(--amber-soft); color: var(--amber); font-size: 12px; }
  .placement-panel-links { display: grid; gap: 4px; }
  .placement-panel-link { display: flex; align-items: center; gap: 6px; padding: 4px 4px 4px 8px; border-radius: 8px; background: var(--nav-hover); font-size: 12px; }
  .placement-panel-link > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .placement-panel-empty { margin: 0; color: var(--muted); font-size: 12px; }
  .placement-panel-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin-top: 12px; }
  .placement-dialog { width: min(520px, calc(100vw - 32px)); padding: 0; }
  .placement-dialog-form { display: grid; gap: 12px; padding: 18px 20px 16px; }
  .placement-dialog-head { display: grid; gap: 4px; }
  .placement-dialog-head h2 { margin: 0; font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
  .placement-dialog-head p { margin: 0; color: var(--muted); font-size: 12px; }
  .placement-dialog-foot { display: flex; justify-content: flex-end; gap: 8px; }
  .placement-dialog-body { display: grid; gap: 8px; max-height: min(52vh, 440px); overflow: auto; padding: 2px 0; }
  .placement-choice { display: grid; grid-template-columns: 18px 1fr; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; cursor: pointer; }
  .placement-choice:has(input:checked) { border-color: var(--blue); background: var(--blue-soft); }
  .placement-choice strong { display: block; font-weight: 500; }
  .placement-choice small { display: block; color: var(--muted); }
  .placement-choice small:empty { display: none; }
  .placement-dialog-note { margin: 4px 0 0; color: var(--muted); font-size: 12px; }
  .placement-dialog-error { margin: 6px 0 0; color: var(--red); font-size: 12px; }
  .placement-dialog-error:empty { display: none; }
  .placement-toasts { position: fixed; left: 50%; bottom: 76px; z-index: 70; display: grid; gap: 8px; transform: translateX(-50%); width: min(560px, calc(100vw - 24px)); pointer-events: none; }
  .placement-toasts.is-top { top: 56px; bottom: auto; }
  .placement-toast { display: flex; align-items: center; gap: 8px; padding: 10px 8px 10px 14px; background: var(--paper); color: var(--ink);
    border: 1px solid var(--line-strong); border-radius: 12px; box-shadow: var(--shadow); pointer-events: none; }
  /* Only the card's buttons take clicks; a click on its text reaches the stage underneath (composers live at the bottom). */
  .placement-toast button { pointer-events: auto; }
  .placement-toast--error { border-color: color-mix(in srgb, var(--red) 45%, var(--line-strong)); }
  .placement-toast-text { flex: 1; min-width: 0; }
  .placement-toast-text strong { display: block; font-weight: 500; overflow-wrap: anywhere; }
  .placement-toast-text small { display: block; color: var(--muted); overflow-wrap: anywhere; }
  .placement-related { margin: 18px 0 0; }
  .placement-related h3 { margin: 0 0 6px; font-size: 12px; font-weight: 500; color: var(--muted); }
  .placement-related-row { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 10px; padding: 8px 6px; border-top: 1px solid var(--line); }
  .placement-related-row strong { display: block; font-weight: 500; }
  .placement-related-row small { display: block; color: var(--muted); }
  .placement-related-row.is-gone strong { color: var(--muted); }
  .placement-related-row .mw-status { white-space: nowrap; }
  .placement-related-actions { display: inline-flex; align-items: center; gap: 4px; }
  .placement-goal-materials { margin-top: 18px; }
  .placement-goal-create { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 4px 0 10px; font-size: 12px; color: var(--muted); }
  .placement-goal-material { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px; }
  .placement-goal-material small { display: block; color: var(--muted); }
  .placement-goal-material.is-gone strong { color: var(--muted); }
  .placement-goal-material-actions { display: inline-flex; gap: 4px; }
  .placement-goal-hint { margin: 8px 0 0; color: var(--muted); font-size: 12px; }
  @media (max-width: 760px) {
    .placement-toasts { bottom: 84px; }
    .placement-toast { flex-wrap: wrap; }
    .placement-panel-actions { grid-template-columns: 1fr; }
    /* A phone header has room for where it is; who can see it and the links are one tap away in the panel. */
    .placement-bar > .placement-bar-access, .placement-bar > .placement-bar-links { display: none; }
    .placement-bar > .placement-bar-where { display: block; max-width: 8em; }
  }
  @media (prefers-reduced-motion: no-preference) {
    .placement-toast { animation: placement-rise var(--dur-move) var(--ease-quint); }
    @keyframes placement-rise { from { opacity: 0; transform: translateY(6px); } }
  }
`;
