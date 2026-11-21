/** Directory list primitives (.mw-dir, .mw-dir-row*) shared by plugin frames and workbench (102-1). */
import { CONTAINED_FOCUS } from "./buttons.js";

const PRIMITIVE_PLUGIN_DIR_BASE = `
  .mw-dir { display: flex; flex-direction: column; min-width: 0; }
  .mw-dir__tools {
    display: flex; align-items: center; gap: 4px;
    min-height: 28px; padding: 0 4px 8px;
  }
  .mw-dir__label {
    flex: 1; min-width: 0; padding: 0 8px;
    overflow: hidden; color: var(--ink);
    font-size: 13px; font-weight: var(--weight-title, 600); line-height: 28px;
    text-overflow: ellipsis; white-space: nowrap;
  }
  .mw-dir__tools .mw-btn {
    width: 28px; min-width: 28px; min-height: 28px; padding: 0;
    border-color: transparent; background: transparent; color: var(--faint);
  }
  .mw-dir__tools .mw-btn:hover:not(:disabled) { color: var(--ink); background: var(--nav-hover); }
  .mw-dir__heading {
    margin: 0; padding: 12px 8px 4px; color: var(--muted);
    font-size: 11px; font-weight: var(--weight-control, 500); letter-spacing: .01em; line-height: 16px;
  }
  .mw-dir__heading:first-child { padding-top: 4px; }
  .mw-dir__list, .mw-dir__body { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .mw-dir .mw-empty { padding: 16px 12px; }
  .mw-dir-row-wrap {
    position: relative; min-width: 0;
    display: grid; grid-template-columns: minmax(0, 1fr);
    align-items: stretch; border-radius: var(--radius-item, 8px);
    transition: background-color var(--dur-move, 250ms) var(--ease-quint);
  }
  body[data-desktop-shell="true"] .mw-dir-row,
  body.immersive-workbench .tree-pane .mw-dir-row,
  .mw-dir-row {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: center;
    column-gap: 8px;
    width: 100%;
    min-width: 0;
    min-height: 32px;
    padding: 0 8px;
    border: 0;
    border-radius: var(--radius-item, 8px);
    color: var(--ink-soft);
    background: transparent;
    box-shadow: none;
    font: inherit;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    transition:
      background-color 130ms var(--ease-quint),
      color 130ms var(--ease-quint);
  }
  body[data-desktop-shell="true"] .mw-dir-row:has(.mw-dir-row__icon),
  body.immersive-workbench .tree-pane .mw-dir-row:has(.mw-dir-row__icon),
  .mw-dir-row:has(.mw-dir-row__icon) { grid-template-columns: 16px minmax(0, 1fr); }
  .mw-dir-row--compact { height: 28px; min-height: 28px; }
  /* A row with a second fact stays one line: the title, then the fact in muted words (cut first when room runs out), then the
     count or state. A row never stacks its facts. A plugin's record row (.pc-row) is content to read and keeps its own layout. */
  .mw-dir-row--meta { height: 36px; min-height: 36px; align-items: center; padding-block: 0; }
  .mw-dir-row {
    &:hover { color: var(--ink); background: var(--nav-hover); }
    &:active { background: var(--nav-press); }
    &:focus-visible { ${CONTAINED_FOCUS}; }
    &:is(.is-selected, [aria-current="page"]) {
      color: var(--ink); background: var(--nav-active);
      .mw-dir-row__copy strong { color: var(--ink); }
      .mw-dir-row__icon { color: var(--plugin-tint, var(--ink-soft)); }
      .mw-dir-row__copy small { color: var(--muted); }
      .mw-dir-row__status { color: var(--status-tone, var(--muted)); }
    }
    .mw-dir-row__status {
      justify-self: end; align-self: center; flex: none; gap: 4px;
      min-height: 0; padding: 0; border: 0; border-radius: 0;
      background: transparent; color: var(--status-tone, var(--faint));
      font-size: 12px; font-weight: 400; line-height: 16px;
      svg:not(.mw-state-ring) { width: 12px; height: 12px; color: inherit; }
    }
  }
  .mw-dir-row__icon { width: 16px; height: 16px; color: var(--plugin-tint, var(--faint)); display: grid; place-items: center; svg { width: 16px; height: 16px; } }
  .mw-dir-row__copy {
    min-width: 0; overflow: hidden; display: grid; align-content: center; column-gap: 12px;
    strong { min-width: 0; overflow: hidden; color: inherit; font-size: 13px; font-weight: var(--weight-control, 500); line-height: 18px; text-overflow: ellipsis; white-space: nowrap; }
  }
  .mw-dir-row__copy strong:has(.mw-dir-row__stem) { display: flex; text-overflow: clip; }
  .mw-dir-row--compact { .mw-dir-row__copy { grid-template-columns: minmax(0, 1fr) auto; align-items: center; } .mw-dir-row__headline { display: contents; } }
  .mw-dir-row--meta:not(.pc-row) {
    .mw-dir-row__copy { grid-template-columns: minmax(0, max-content) minmax(0, 1fr); grid-auto-columns: auto; grid-auto-flow: column; align-items: baseline; column-gap: 8px; }
    .mw-dir-row__headline { display: contents; > :not(strong) { order: 2; justify-self: end; } }
  }
  .mw-dir-row__headline { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; column-gap: 8px; align-items: center; }
  .mw-dir-row__stem { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mw-dir-row__ext { flex: none; }
  .mw-dir-row--meta .mw-dir-row__copy small { order: 1; min-width: 0; max-width: 100%; overflow: hidden; color: var(--muted); font-size: 12px; font-weight: 400; line-height: 14px; text-overflow: ellipsis; white-space: nowrap; }
  .mw-dir-row__count { min-width: 0; color: var(--muted); font-size: 12px; font-weight: 400; line-height: 18px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  /* Light rows darken when hovered, pressed or selected; these tones keep their hue but take 20% ink (or ink-soft) so the word stays at 4.5:1. */
  :root:not([data-resolved-theme="dark"]) .mw-dir-row .mw-dir-row__status:is(.mw-status--attention, .mw-status--progress, .mw-status--blocked, .mw-status--done, .mw-status--hold) { color: color-mix(in srgb, var(--status-tone) 80%, var(--ink)); }
  :root:not([data-resolved-theme="dark"]) .mw-dir-row .mw-dir-row__status:is(.mw-status--quiet, .mw-status--idle) { color: var(--ink-soft); }
  .mw-dir-row-wrap {
    &:hover { background: var(--nav-hover); }
    &:active { background: var(--nav-press); }
    &:is(:hover, :active) .mw-dir-row { color: var(--ink); background: transparent; }
    .mw-dir-row { width: 100%; min-width: 0; }
    > :not(.mw-dir-row) { position: static; transform: none; align-self: center; justify-self: center; display: grid; place-items: center; }
  }
  .mw-dir-row-wrap:has(.is-selected),
  .mw-dir-row-wrap:has([aria-current="page"]) { background: var(--nav-active); }
  .mw-dir-row-wrap:has(.is-selected) .mw-dir-row,
  .mw-dir-row-wrap:has([aria-current="page"]) .mw-dir-row,
  body.immersive-workbench .immersive-workspace .tree-pane .mw-dir-row-wrap .mw-dir-row,
  body.immersive-workbench .immersive-workspace .tree-pane .mw-dir-row-wrap .mw-dir-row:is(:hover, :active, .is-selected, [aria-current="page"]) { background: transparent; }
  .mw-dir-row-wrap:has(.is-selected)::before,
  .mw-dir-row-wrap:has([aria-current="page"])::before {
    content: "";
    position: absolute; left: 0; top: 6px; bottom: 6px; width: 2px;
    border-radius: 1px; background: var(--ink); pointer-events: none;
  }
  .mw-dir-row-wrap:has(.is-selected) .mw-dir-row::before,
  .mw-dir-row-wrap:has([aria-current="page"]) .mw-dir-row::before { content: none; }
  .mw-dir-row-wrap:has(> :not(.mw-dir-row)):not(.is-yield) { grid-template-columns: minmax(0, 1fr) 28px; }
  .mw-dir .mw-empty {
    :is(h1, h2, strong) { font-size: 13px; font-weight: var(--weight-control, 500); color: var(--ink-soft); }
    p { font-size: 12px; line-height: 1.55; color: var(--muted); }
  }

`;


/** Shell-only yield-action, nested-row and directory-add rules (kept in PRIMITIVE_STYLES, omitted from plugin frames). */
const PRIMITIVE_DIR_SHELL_EXTRAS = `
  .mw-dir-row-wrap:has(> .mw-dir-row--nested) { padding-left: 16px; }
  .mw-dir-row--nested:not(.mw-dir-row-wrap .mw-dir-row--nested) { padding-left: 24px; }
  .mw-dir-row-wrap.is-yield .mw-dir-row {
    /* The row yields room to its actions at once; only the tone eases. */
    transition: background-color 130ms var(--ease-quint), color 130ms var(--ease-quint);
  }
  .mw-dir-row-wrap.is-yield:is(:hover, :focus-within, :has(.is-selected), :has([aria-current="page"])) .mw-dir-row { padding-right: var(--dir-yield, 72px); }
  .mw-dir-row-wrap.is-yield .mw-dir-row__ops {
    position: absolute; right: 2px; top: 0; bottom: 0;
    display: flex; align-items: center; gap: 0;
    opacity: 0; pointer-events: none;
    background: var(--nav-hover);
    transition: opacity 130ms var(--ease-quint);
  }
  .mw-dir-row-wrap.is-yield:has(.is-selected) .mw-dir-row__ops,
  .mw-dir-row-wrap.is-yield:has([aria-current="page"]) .mw-dir-row__ops { background: var(--nav-active); }
  .mw-dir-row-wrap.is-yield:is(:hover, :focus-within, :has(.is-selected), :has([aria-current="page"])) .mw-dir-row__ops { opacity: 1; pointer-events: auto; }
  .mw-dir-row-wrap.is-yield .mw-dir-row__ops .mw-btn { width: 22px; min-width: 22px; min-height: 22px; }
  .mw-dir-row-wrap > :not(.mw-dir-row).mw-btn,
  .mw-dir-row-wrap > :not(.mw-dir-row) .mw-btn {
    width: 28px; min-width: 28px; min-height: 28px; padding: 0;
    border-color: transparent; background: transparent; color: var(--faint);
  }
  .mw-dir-row-wrap > :not(.mw-dir-row).mw-btn:hover,
  .mw-dir-row-wrap > :not(.mw-dir-row) .mw-btn:hover {
    color: var(--ink); background: var(--nav-hover);
  }
  .mw-dir__add {
    display: flex; align-items: center; gap: 8px;
    width: 100%; margin-top: 8px; min-height: 32px; padding: 0 8px;
    border: 1px dashed var(--line-strong); border-radius: var(--radius-item, 8px);
    color: var(--ink-soft); background: transparent;
    font: inherit; font-size: 13px; font-weight: var(--weight-control, 500); text-align: left; cursor: pointer;
  }
  .mw-dir > [data-slot="directory-add"]:first-child,
  .mw-dir__tools + [data-slot="directory-add"] { margin-top: 0; margin-bottom: 4px; }
  .mw-dir__add svg { width: 14px; height: 14px; flex: none; color: var(--muted); }
  .mw-dir__add:hover { color: var(--ink); background: var(--nav-hover); }
  .mw-dir__footer { display: none; }
`;

export const PRIMITIVE_PLUGIN_DIR_COMPACT = PRIMITIVE_PLUGIN_DIR_BASE
  .replace(/body\[data-desktop-shell="true"\]\s+\.mw-dir-row:has\(\.mw-dir-row__icon\),\s*body\.immersive-workbench\s+\.tree-pane\s+\.mw-dir-row:has\(\.mw-dir-row__icon\),\s*/g, "")
  .replace(/body\[data-desktop-shell="true"\]\s+\.mw-dir-row,\s*body\.immersive-workbench\s+\.tree-pane\s+\.mw-dir-row,\s*/g, "")
  .replace(/,\s*body\.immersive-workbench\s+\.immersive-workspace\s+\.tree-pane\s+\.mw-dir-row-wrap\s+\.mw-dir-row,\s*body\.immersive-workbench\s+\.immersive-workspace\s+\.tree-pane\s+\.mw-dir-row-wrap\s+\.mw-dir-row:is\(:hover,\s*:active,\s*\.is-selected,\s*\[aria-current="page"\]\)/g, "");

export const PRIMITIVE_PLUGIN_DIR = PRIMITIVE_PLUGIN_DIR_BASE + PRIMITIVE_DIR_SHELL_EXTRAS;
