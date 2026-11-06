/**
 * Skins (DESIGN「皮肤」). Soft Workbench is the default and draws nothing here. Tray (a raised key on a sunken tray) and Pill
 * (capsules, softer and a little taller) restate the primitives' material and geometry under `:root[data-skin]`. Every rule is
 * scoped to a non-default skin and the block comes after every other layer, so it wins without !important and the default page
 * keeps exactly the cascade it had. Values a skin shares with the bindings are `--sk-*` tokens; one-skin touches are written once.
 * Height and padding stay relative to `--control-h` / `--control-pad-x` in the rules themselves, because density, touch and some
 * parts restate those below the root and a root token would freeze the root's 32px. The toast's skinned rule reads
 * `--sk-toast-*` and `--sk-r-toast` in toast.ts, the one place a toast's look is written.
 */
const SKINNED = ':root:is([data-skin="tray"], [data-skin="pill"]) body';
const TRAY = ':root[data-skin="tray"]';
const PILL = ':root[data-skin="pill"]';
const SEGMENTED = ":is(.mw-toggle-group, .settings-segmented, .locale-switch, .goal-board-switch)";
const BUTTON = ".mw-btn:not(.mw-btn--link)";
const HEIGHT = "calc(var(--control-h) + var(--sk-dh))";
/** The momentum layer's dark field rule weighs (0,9,2); one id-weight `:not` lifts the resting field above it without !important. */
const FIELD = ":is(.mw-input, .mw-textarea, .mw-select, .mw-input-group):not(:disabled, [aria-invalid=\"true\"], [data-plain-field], .mw-input-group *, :focus-within):not(#mw-skin-outranks)";
const ink = (share: number) => `color-mix(in srgb, var(--ink) ${share}%, transparent)`;

export const SKIN_STYLES = `
  ${TRAY} {
    --sk-dh: 0px; --sk-dpx: 0px; --sk-r: 8px; --sk-r-area: 8px; --sk-r-seg: 10px; --sk-r-slot: 6px; --sk-slot-h: 26px;
    --sk-r-card: 12px; --sk-card-pad: 16px; --sk-r-menu: 12px; --sk-r-item: 8px; --sk-menu-pad: 4px; --sk-r-toast: 12px;
    --sk-raised: var(--paper); --sk-sink: inset 0 1px 2px rgba(28, 34, 51, .07);
    --sk-b1-shadow: inset 0 1px 0 rgba(255, 255, 255, .14), var(--lift-1);
    --sk-b2-bg: var(--sk-raised); --sk-b2-hover: color-mix(in srgb, var(--ink) 3%, var(--sk-raised)); --sk-b2-press: color-mix(in srgb, var(--ink) 6%, var(--sk-raised));
    --sk-b2-edge: ${ink(11)}; --sk-b2-shadow: var(--lift-1);
    --sk-f-bg: ${ink(3)}; --sk-f-hover: ${ink(5)}; --sk-f-edge: var(--control-border); --sk-f-shadow: var(--sk-sink);
    --sk-seg-bg: ${ink(5)}; --sk-seg-shadow: var(--sk-sink), inset 0 0 0 1px ${ink(6)}; --sk-thumb-shadow: 0 0 0 1px ${ink(8)}, var(--lift-1);
    --sk-card-edge: var(--control-border); --sk-card-shadow: var(--lift-1); --sk-menu-shadow: 0 0 0 1px var(--control-border), var(--lift-2);
    --sk-toast-bg: var(--sk-raised); --sk-toast-ink: var(--ink); --sk-toast-shadow: 0 0 0 1px ${ink(10)}, var(--lift-2);
  }
  ${TRAY}[data-resolved-theme="dark"] { --sk-raised: var(--popover); --sk-sink: inset 0 1px 2px rgba(0, 0, 0, .35); }
  ${PILL} {
    --sk-dh: 4px; --sk-dpx: 4px; --sk-r: 999px; --sk-r-area: 16px; --sk-r-seg: 999px; --sk-r-slot: 999px; --sk-slot-h: 30px;
    --sk-r-card: 20px; --sk-card-pad: 20px; --sk-r-menu: 16px; --sk-r-item: 10px; --sk-menu-pad: 6px; --sk-r-toast: 21px; --r-dialog: 24px;
    --sk-raised: var(--paper); --sk-b1-shadow: none;
    --sk-b2-bg: ${ink(6)}; --sk-b2-hover: ${ink(9)}; --sk-b2-press: ${ink(12)}; --sk-b2-edge: transparent; --sk-b2-shadow: none;
    --sk-f-bg: ${ink(5)}; --sk-f-hover: var(--control-fill-hover); --sk-f-edge: transparent; --sk-f-shadow: none;
    --sk-seg-bg: ${ink(5)}; --sk-seg-shadow: none; --sk-thumb-shadow: var(--lift-1);
    --sk-card-edge: ${ink(8)}; --sk-card-shadow: none; --sk-menu-shadow: 0 0 0 1px ${ink(7)}, var(--lift-2);
    --sk-toast-bg: var(--action); --sk-toast-ink: var(--action-ink); --sk-toast-shadow: var(--lift-2);
  }
  ${PILL}[data-resolved-theme="dark"] { --sk-raised: var(--popover); }

  ${SKINNED} ${BUTTON} { border-radius: var(--sk-r); }
  ${SKINNED} ${BUTTON}:not(.mw-btn--sm, .mw-btn--lg) { min-height: ${HEIGHT}; }
  ${SKINNED} ${BUTTON}:not(.mw-btn--sm, .mw-btn--lg, .mw-btn--icon, .mw-btn--icon-only) { padding-inline: calc(var(--control-pad-x, 12px) + var(--sk-dpx)); }
  ${SKINNED} ${BUTTON}:is(.mw-btn--icon, .mw-btn--icon-only):not(.mw-btn--sm) { width: ${HEIGHT}; min-width: ${HEIGHT}; }
  ${SKINNED} .mw-btn--primary:not(:disabled) { box-shadow: var(--sk-b1-shadow); }
  ${SKINNED} .mw-btn--secondary:not(:disabled) { border-color: var(--sk-b2-edge); background-color: var(--sk-b2-bg); box-shadow: var(--sk-b2-shadow); }
  ${SKINNED} .mw-btn--secondary:not(:disabled):hover { background-color: var(--sk-b2-hover); }
  ${SKINNED} .mw-btn--secondary:not(:disabled):active { background-color: var(--sk-b2-press); }

  ${SKINNED} :is(.mw-input, .mw-select, .mw-input-group):not(.mw-input-group *) { min-height: ${HEIGHT}; border-radius: var(--sk-r); padding-inline-start: calc(var(--control-pad-x, 12px) + var(--sk-dpx)); }
  ${SKINNED} .mw-textarea { border-radius: var(--sk-r-area); }
  ${SKINNED} ${FIELD} { border-color: var(--sk-f-edge); background-color: var(--sk-f-bg); box-shadow: var(--sk-f-shadow); }
  ${SKINNED} ${FIELD}:hover { background-color: var(--sk-f-hover); }

  ${SKINNED} ${SEGMENTED} { border-radius: var(--sk-r-seg); background: var(--sk-seg-bg); box-shadow: var(--sk-seg-shadow); }
  ${SKINNED} ${SEGMENTED} > :is(button, a) { min-height: var(--sk-slot-h); border-radius: var(--sk-r-slot); }
  ${SKINNED} ${SEGMENTED}[data-seg-thumb]::before { border-radius: var(--sk-r-slot); background: var(--sk-raised); box-shadow: var(--sk-thumb-shadow); }

  ${SKINNED} .mw-card { border-color: var(--sk-card-edge); border-radius: var(--sk-r-card); background: var(--sk-raised); box-shadow: var(--sk-card-shadow); }
  ${SKINNED} .mw-card__header { padding: var(--sk-card-pad) var(--sk-card-pad) 0; }
  ${SKINNED} .mw-card__panel { padding: 12px var(--sk-card-pad) var(--sk-card-pad); }
  ${SKINNED} .mw-card__footer { padding: 0 var(--sk-card-pad) var(--sk-card-pad); }

  ${SKINNED} :is(.mw-menu, .mw-popover, .mw-select-picker__menu) { border-radius: var(--sk-r-menu); box-shadow: var(--sk-menu-shadow); }
  ${SKINNED} :is(.mw-menu, .mw-select-picker__menu) { padding: var(--sk-menu-pad); }
  ${SKINNED} :is(.mw-menu, .mw-select-picker__menu) :is(.mw-menu__item, [role="menuitem"], [role="option"]) { border-radius: var(--sk-r-item); }

  ${TRAY} body .mw-badge { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--status-tone, var(--ink)) 14%, transparent); }
  ${PILL} body .mw-badge { min-height: 20px; border-radius: 999px; }
`;
