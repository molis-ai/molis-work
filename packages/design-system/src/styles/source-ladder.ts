/**
 * The source ladder (docs/design/role-scope/README.md「组件板新增」, batch 36): `renderSourceLadder` of the SDK's /ui. It lays a
 * setting's layers out nearest first; the one in use is lifted, the ones not in use stay readable but quiet, empty layers are dashed
 * slots and a switched-off layer is struck through. Served in the Workbench and settings sheets; its specimen is on the board
 * (#source-ladder). The quiet note beside it (`renderNote`, `.mw-note`) is a primitive (styles/primitives.ts).
 */
export const SOURCE_LADDER_STYLES = `
  /* The ladder is its own container: it folds to two columns by the room it is given (a narrow pane or side), not by the window. */
  .mw-source-ladder { container: mw-source-ladder / inline-size; display: flex; flex-wrap: wrap; align-items: stretch; gap: 4px; min-width: 0; margin: 0; padding: 0; list-style: none; }
  .mw-source-ladder__layer { position: relative; display: grid; gap: 2px; min-width: 0; padding: 6px 10px; border: 1px solid transparent; border-radius: var(--r-control); font-size: 12px;
    transition: background var(--dur-moment) var(--ease-standard), box-shadow var(--dur-moment) var(--ease-standard), border-color var(--dur-moment) var(--ease-standard); }
  .mw-source-ladder__layer + .mw-source-ladder__layer { margin-left: 14px; }
  .mw-source-ladder__layer + .mw-source-ladder__layer::before { content: ""; position: absolute; left: -12px; top: 50%; width: 8px; height: 8px;
    border-top: 1.5px solid var(--line-strong); border-right: 1.5px solid var(--line-strong); transform: translateY(-50%) rotate(45deg); }
  .mw-source-ladder__name { min-width: 0; overflow: hidden; color: var(--muted); font-size: 11px; white-space: nowrap; text-overflow: ellipsis; }
  .mw-source-ladder__value { min-width: 0; overflow: hidden; color: var(--ink-soft); font-weight: var(--weight-control); white-space: nowrap; text-overflow: ellipsis; }
  .mw-source-ladder__layer.is-on { background: var(--paper); border-color: var(--line); box-shadow: var(--lift-1); }
  .mw-source-ladder__layer.is-on .mw-source-ladder__name { color: var(--accent-strong); }
  .mw-source-ladder__layer.is-on .mw-source-ladder__value { color: var(--ink); }
  .mw-source-ladder__layer.is-under .mw-source-ladder__value { color: var(--muted); }
  .mw-source-ladder__layer.is-empty, .mw-source-ladder__layer.is-off { border: 1px dashed var(--line-strong); }
  .mw-source-ladder__layer.is-empty .mw-source-ladder__value { color: var(--faint); font-weight: inherit; }
  .mw-source-ladder__layer.is-off .mw-source-ladder__value { color: var(--faint); text-decoration: line-through; }
  @container mw-source-ladder (max-width: 479px) {
    .mw-source-ladder__layer { flex: 1 1 calc(50% - 2px); }
    .mw-source-ladder__layer + .mw-source-ladder__layer { margin-left: 0; }
    .mw-source-ladder__layer + .mw-source-ladder__layer::before { display: none; }
  }
  @media (prefers-reduced-motion: reduce) { .mw-source-ladder__layer { transition: none; } }
  /* Forced colours drop the lift and the background: the layer in use keeps a heavier system-coloured edge instead. */
  @media (forced-colors: active) { .mw-source-ladder__layer.is-on { border: 2px solid Highlight; } }

`;
