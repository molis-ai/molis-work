/** Plugin-frame subset of mw-* primitives shared by molis-work-plugin-base.css (102-1). */
import { TOAST_STYLES } from "./toast.js";
import { SELECT_MENU_STYLES } from "../select-menu-client.js";
import { SR_ONLY_STYLES } from "./sr-only.js";
import { STATE_RING_STYLES } from "./state-ring.js";
import { NOTE_STYLES } from "./note.js";
import { ON_DEMAND_HELP_PLUGIN_STYLES } from "./on-demand-help.js";
import { BUTTON_STYLES } from "./buttons.js";

const CONTAINED_FOCUS_COMPACT = "outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); box-shadow: none";
const CONTAINED_FOCUS_DANGER = "outline: 2px solid var(--red); outline-offset: 1px; box-shadow: none";
const FIELD_FOCUS = "outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent); background-color: var(--popover)";

export const PRIMITIVE_PLUGIN_CORE_HEAD = `
  ${STATE_RING_STYLES}${NOTE_STYLES}${ON_DEMAND_HELP_PLUGIN_STYLES}
  :where(a:not([class])) { color: var(--accent); text-underline-offset: 3px; &:hover { color: var(--accent-strong); } }
  ${SR_ONLY_STYLES}

${BUTTON_STYLES}
  .mw-input, .mw-textarea, .mw-select, .mw-input-group {
    min-height: var(--control-h); padding: 0 12px;
    border: 1px solid var(--control-border); border-radius: var(--radius-control); background-color: var(--paper);
    box-shadow: inset 0 1px 1px color-mix(in srgb, var(--shadow-color) 3%, transparent);
    transition: border-color var(--dur-hover) var(--ease-quint), box-shadow var(--dur-move) var(--ease-quint), background-color var(--dur-hover) var(--ease-quint);
  }
  .mw-input, .mw-textarea, .mw-select {
    width: 100%; color: var(--ink); font: inherit; font-size: 13px; appearance: none;
    &:hover:where(:not(:disabled, :focus-visible)) { border-color: var(--control-input); }
  }
  .mw-input[type="search"]::-webkit-search-decoration,
  .mw-input[type="search"]::-webkit-search-cancel-button { appearance: none; }
  .mw-textarea { min-height: 72px; padding: 8px 12px; resize: vertical; height: auto; }
  .mw-select {
    padding-right: 32px;
    background: var(--paper) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236d6d76' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") right 8px center/14px 14px no-repeat;
  }
  /* Dark theme's generic select rule resets repeat, position and size with its background shorthand. */
  html[data-resolved-theme="dark"] .mw-select {
    background-repeat: no-repeat; background-position: right 8px center; background-size: 14px 14px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394949c' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  }
  :is(.mw-input, .mw-textarea)::placeholder { color: var(--muted); }
  ${SELECT_MENU_STYLES}
  /* Search and other grouped fields wear the same paper-bordered surface as a single field. */
  .mw-input-group {
    &:hover:not(:focus-within) { border-color: var(--control-input); }
    svg { width: 14px; height: 14px; color: var(--muted); flex: none; }
  }
  :is(.mw-input-group, .mw-number):focus-within,
  .mw-input:focus-visible, .mw-textarea:focus-visible, .mw-select:focus-visible,
  .mw-input:focus, .mw-textarea:focus { ${FIELD_FOCUS}; }
  :is(.mw-input, .mw-textarea, .mw-select) {
    &[aria-invalid="true"] {
      border-color: var(--red); background-color: color-mix(in srgb, var(--red) 6%, transparent);
      &:focus-visible { ${CONTAINED_FOCUS_DANGER}; border-color: var(--red); }
    }
    &:disabled { color: var(--faint); border-color: var(--control-border); background-color: transparent; }
  }
  .mw-input-group .mw-input, .mw-number .mw-input { border: 0; outline: 0; min-height: 26px; padding: 0; min-width: 0; background: transparent; box-shadow: none; border-radius: 0; }
  .mw-input-group .mw-input:is(:hover, :focus, :focus-visible, [aria-invalid="true"]), .mw-number .mw-input:is(:hover, :focus, :focus-visible, [aria-invalid="true"]) { border: 0; outline: 0; background: transparent; box-shadow: none; }

  .mw-form, .frame-empty.mw-empty, .mw-inset-group { display: flex; flex-direction: column; }

  .mw-badge, .mw-status, .mw-loading, kbd, .mw-kbd, .mw-choice, .mw-choice__label, .mw-number, .mw-severity-grid, .mw-group, .mw-signal, .mw-inset-row__end { display: inline-flex; align-items: center; }
  .mw-check, .mw-radio, .mw-avatar, .mw-menu__check, .mw-choice__check, .mw-calendar :is(td span, .mw-calendar__day), .mw-glyph-status, .mw-inset-row__lead { display: inline-grid; place-items: center; }
  .mw-input-group, .mw-menu__item, .mw-toolbar, .mw-calendar__header { display: flex; align-items: center; gap: 8px; }
  .mw-badge, .mw-menu__shortcut, .mw-signal, .mw-inset-row__end { font-variant-numeric: tabular-nums; }
  .mw-menu__item > [data-slot="menu-item-label"], .mw-menu__item--described > [data-slot="menu-item-label"] > span, .mw-inset-row__title, [data-mw-select-label] { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mw-fieldset, .mw-check-group, .mw-radio-group { border: 0; padding: 0; display: grid; gap: 8px; }
  .mw-popover, .mw-menu, .mw-number, .mw-preview-card, .mw-card, .mw-table-wrap, .mw-inset-group { background: var(--paper); }

  .mw-check-row { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: var(--ink); cursor: pointer; }
  .mw-check, .mw-radio {
    appearance: none; width: 16px; height: 16px; margin: 4px 0 0; padding: 0; flex: none;
    border: 1px solid color-mix(in srgb, var(--ink) 22%, transparent); background: var(--paper); color: var(--action-ink);
    &:hover:not(:disabled) { border-color: color-mix(in srgb, var(--control-input) 60%, var(--ink)); }
    &:checked { border-color: var(--action); background: var(--action); }
    &:disabled { opacity: .42; }
  }
  .mw-check { border-radius: 4px; &:checked::after { content: ""; width: 8px; height: 4px; border: 1.6px solid currentColor; border-top: 0; border-right: 0; transform: translateY(-1px) rotate(-45deg); } }
  .mw-radio { border-radius: 50%; &:checked::after { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; } }
  .mw-switch {
    position: relative; display: inline-grid; width: 36px; height: 22px; flex: none;
    input {
      appearance: none; position: absolute; inset: 0; margin: 0; opacity: 0; z-index: 1; cursor: pointer; background: transparent; border: 0; box-shadow: none;
      &:hover:not(:disabled) + .mw-switch__track { border-color: var(--control-input); }
      &:checked + .mw-switch__track { background: var(--action); border-color: var(--action); &::after { transform: translateX(14px); background: var(--action-ink); } }
    }
    &:has(input:disabled) { opacity: .42; }
  }
  .mw-switch__track {
    display: block; width: 36px; height: 22px; border-radius: 99px;
    background: color-mix(in srgb, var(--ink) 16%, var(--paper)); border: 1px solid transparent;
    transition: background-color var(--dur-hover) var(--ease-quint), border-color var(--dur-hover) var(--ease-quint);
    &::after { content: ""; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: var(--paper); box-shadow: var(--lift-1); transition: transform var(--dur-hover) var(--ease-quint); }
  }
  html[data-resolved-theme="dark"] .mw-switch__track::after { background: var(--ink); }

  .mw-field, .mw-form label:not(.mw-check-row) { display: grid; gap: 4px; font-size: 13px; color: var(--ink-soft); }
  .mw-field__label { display: flex; align-items: baseline; gap: 8px; color: var(--ink); }
  .mw-field__label small, .mw-field__hint { color: var(--muted); font-family: var(--type-note-font); font-weight: var(--type-note-weight); font-size: var(--type-note-size); line-height: var(--type-note-line-height); letter-spacing: var(--type-note-tracking); }
  /* An error says so in shape as well as colour: an alert glyph leads the message, centred on its first line. */
  .mw-field__error {
    display: flex; gap: 6px; margin: 0; color: var(--red); font-size: 12px; line-height: 1.6;
    &::before {
      --glyph: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M12 7.5v5M12 16.5h.01'/%3E%3C/svg%3E") center / 13px no-repeat;
      content: ""; flex: none; width: 13px; height: 19px; background: currentColor; -webkit-mask: var(--glyph); mask: var(--glyph);
    }
  }
  .mw-fieldset legend { color: var(--ink); font-size: 13px; padding: 0; }

  .mw-form { min-height: 0; height: 100%; }
  .mw-form__header, .mw-form__footer { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex: none; }
  .mw-form__header {
    padding: 24px 24px 8px;
    h2 { margin: 0; font-size: var(--type-title-size); line-height: var(--type-title-line-height); font-weight: var(--weight-title); letter-spacing: var(--tracking-title); color: var(--ink); }
    p { margin: 8px 0 0; color: var(--muted); font-size: 13px; line-height: 1.6; }
  }
  .mw-form__body { flex: 1; min-height: 0; overflow: auto; display: grid; align-content: start; gap: 12px; padding: 16px 24px; }
  .mw-form__footer {
    align-items: center; justify-content: flex-end; gap: 8px; padding: 16px 24px 24px;
    .mw-btn:not(.mw-btn--icon-only) { min-height: 36px; }
    :is(.mw-btn--secondary:first-child, button[data-dialog-close]:not(.mw-btn--icon-only)) { margin-right: auto; }
  }

  .mw-badge, .mw-status {
    gap: 4px; min-height: 18px; padding: 0 8px;
    border: 0; border-radius: 999px; font-size: 11px; line-height: 1; white-space: nowrap;
    background: color-mix(in srgb, var(--status-tone, var(--ink)) 10%, transparent);
    color: var(--status-tone, var(--ink-soft));
  }
  .mw-status { min-width: 0; svg { width: calc(1em + 2px); height: calc(1em + 2px); flex: none; } > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; padding-block: .2em; margin-block: -.2em; } }
  .mw-status--plain { min-height: 0; padding: 0; background: transparent; border-radius: 0; }
  .mw-status--idle, .mw-badge--neutral { --status-tone: var(--tone-idle); }
  .mw-status--progress, .mw-badge--info { --status-tone: var(--tone-progress); }
  .mw-status--attention, .mw-badge--warning { --status-tone: var(--tone-attention); }
  .mw-status--hold { --status-tone: var(--tone-hold); }
  .mw-status--blocked, .mw-badge--danger { --status-tone: var(--tone-blocked); }
  .mw-status--done, .mw-badge--success { --status-tone: var(--tone-done); }
  .mw-status--quiet { --status-tone: var(--tone-quiet); }

  .mw-alert {
    display: grid; gap: 4px; padding: 12px 16px; border: 1px solid transparent; border-radius: 10px;
    background: var(--control-fill); color: var(--ink); font-size: 13px; line-height: 1.6;
    p { margin: 0; color: var(--ink-soft); }
  }
  .mw-alert--danger { background: var(--red-soft); border-color: color-mix(in srgb, var(--red) 16%, transparent); }
  .mw-alert--success { background: color-mix(in srgb, var(--green) 12%, var(--paper)); }
  .mw-alert--warning { background: color-mix(in srgb, var(--amber) 14%, var(--paper)); }
`;

export const PRIMITIVE_PLUGIN_CORE_MID = `
  .mw-empty {
    display: grid; justify-items: start; align-content: start; gap: 8px; padding: 16px 12px; color: var(--ink-soft);
    :is(h1, h2, strong) { margin: 0; font-size: 15px; font-weight: var(--weight-title); color: var(--ink); }
    p { margin: 0; font-size: 13px; line-height: 1.6; color: var(--ink-soft); }
  }
  .mw-empty__mark, .mw-empty > svg { color: var(--plugin-tint, var(--muted)); }
  .mw-empty__mark svg, .mw-empty > svg { width: 16px; height: 16px; stroke-width: 2; }
  .mw-empty__actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 0; }
  .frame-empty.mw-empty {
    justify-content: center; align-items: center; gap: 12px; padding: 32px; text-align: center;
    .mw-btn { margin-top: 4px; }
  }

  ${TOAST_STYLES}
  .mw-spinner { width: 20px; height: 20px; display: inline-block; color: currentColor; }
  /* One loading rule everywhere: a quiet line with the spinner, shown only past a 250ms wait (a quick load never flashes). Skeletons (static),
     busy buttons and a plugin's dimmed region (mw-busy-dim to --busy-dim) wait the same, as animations; reduced motion drops only the fade. */
  .mw-loading, .mw-skeleton { animation: mw-loading-in var(--dur-move) var(--ease-quint) var(--dur-move) both; }
  .mw-loading { gap: 8px; color: var(--muted); font-size: 13px; }
  @keyframes mw-loading-in { from { opacity: 0; } to { opacity: 1; } } @keyframes mw-busy-dim { to { opacity: var(--busy-dim, .65); } }
  .mw-skeleton { display: block; height: 12px; border-radius: 4px; background: color-mix(in srgb, var(--ink) 8%, transparent); }
`;

export const PRIMITIVE_PLUGIN_KBD = `
  kbd, .mw-kbd {
    min-height: 20px; padding: 0 8px; border: 1px solid var(--control-border); border-radius: 6px; background: var(--control-fill);
    color: var(--muted); font: 11px/20px var(--font-mono);
  }
  .mw-kbd { border-radius: 8px; }
  .mw-separator { border: 0; border-top: 1px solid var(--line); margin: 16px 0; }
`;

export const PRIMITIVE_PLUGIN_DIALOG = `
  dialog:is(.mw-dialog, .mw-sheet) {
    padding: 0; border: 0; background: var(--paper); color: var(--ink); box-shadow: var(--shadow);
    &::backdrop { background: var(--scrim); }
  }
  dialog.mw-dialog {
    width: min(420px, calc(100vw - 32px)); max-height: calc(100dvh - 48px); border-radius: 16px;
    box-shadow: var(--shadow), inset 0 1px 0 var(--edge-highlight);
  }
`;

export const PRIMITIVE_PLUGIN_DIALOG_FORM = `
  /** Creation and picking happen in a centred modal sized to its content, not an edge sheet. */
  dialog.mw-dialog--form {
    position: fixed; inset: auto; top: 50%; left: 50%; translate: -50% -50%; margin: 0;
    width: min(560px, calc(100vw - 48px)); max-height: min(calc(100dvh - 96px), 720px); overflow: hidden;
    > .mw-form { height: auto; max-height: inherit; }
    .mw-form__body { overflow: auto; overscroll-behavior: contain; }
  }
  dialog.mw-sheet {
    position: fixed; inset: var(--tab-strip-h, 32px) 0 0 auto; margin: 0;
    width: min(560px, 100vw); max-width: none;
    height: calc(100dvh - var(--tab-strip-h, 32px)); max-height: none;
    border-radius: 16px 0 0 16px; animation: none;
  }
  .mw-progress { height: 4px; border-radius: 99px; background: var(--control-fill); overflow: hidden; > span { display: block; height: 100%; background: var(--action); } }
  .mw-avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--nav-active); color: var(--ink); font-size: 12px; }
`;

export const PRIMITIVE_PLUGIN_MENU = `
  .mw-sheet__shell, .mw-dialog__shell { height: 100%; }
  .mw-dialog__close { flex: none; }

  .mw-popover, .mw-menu {
    min-width: 180px; padding: 6px; border: 0; border-radius: var(--radius-surface);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--ink) 6%, transparent), var(--shadow), inset 0 1px 0 var(--edge-highlight); color: var(--ink);
  }
  .mw-menu {
    hr { height: 0; margin: 4px 8px; border: 0; border-top: 1px solid var(--line); }
    /* One text column: once any item leads with a glyph, an item without one starts where the words do. */
    &:has(.mw-menu__item > svg:first-child) .mw-menu__item:not(:has(> svg:first-child, > .mw-menu__check)) { padding-left: 36px; }
  }
  .mw-menu__item {
    width: 100%; min-height: 34px;
    padding: 0 12px; border: 0; border-radius: 8px; background: transparent;
    color: var(--ink); font: inherit; font-size: 13px; text-align: left; cursor: pointer;
    &:is(:hover, :focus-visible, [data-active]) { background: var(--nav-hover); outline: none; }
    &:active { background: var(--nav-press); }
    svg { width: 16px; height: 16px; color: var(--ink-soft); flex: none; }
    > [data-slot="menu-item-label"] { flex: 1; }
    &:disabled { background: transparent; color: var(--faint); cursor: default; & :is(svg, .mw-menu__shortcut) { color: var(--faint); } }
  }
  .mw-menu__item--danger { color: var(--red); &:is(:hover, :focus-visible):not(:disabled) { background: color-mix(in srgb, var(--red) 8%, transparent); } svg { color: var(--red); } }
  .mw-menu__check { flex: none; width: 16px; height: 16px; svg { color: var(--ink); } }
  .mw-menu__shortcut { flex: none; margin-left: 16px; color: var(--muted); font-size: 12px; }
  /* Glyph, name and shortcut on the first row; the description takes the whole width under them, the shortcut's column too. */
  .mw-menu__item--described {
    display: grid; grid: 20px auto / auto minmax(0, 1fr) auto; align-items: baseline; gap: 2px 8px; padding-block: 8px; line-height: 20px;
    > :is(svg, .mw-menu__check) { grid-area: 1 / 1; align-self: center; }
    > [data-slot="menu-item-label"] { display: contents; overflow: visible; > span { grid-area: 1 / 2; } }
    .mw-menu__shortcut { grid-area: 1 / 3; }
  }
  .mw-menu__desc { grid-column: 2 / -1; color: var(--muted); font-size: 12px; font-weight: var(--weight-body); line-height: 18px; text-wrap: pretty; overflow-wrap: anywhere; }
  .mw-menu__label { padding: 4px 12px 2px; color: var(--muted); font-size: 11px; line-height: 20px; }
  .mw-menu__group + .mw-menu__group::before { content: ""; display: block; margin: 4px 8px; border-top: 1px solid var(--line); }
`;

export const PRIMITIVE_PLUGIN_CONTROLS = `
  .mw-tabs__list { display: flex; gap: 4px; }
  .mw-tabs__tab, .mw-dir-row { transition: background-color var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint); }
  .mw-tabs__tab, .mw-toggle { padding: 0 12px; border: 0; border-radius: 8px; background: transparent; color: var(--muted); font: inherit; }
  .mw-tabs__tab {
    position: relative; min-height: 30px;
    &:hover { color: var(--ink); background: var(--nav-hover); }
    &.is-active { background: var(--nav-active); color: var(--ink); }
  }
  .mw-toolbar { flex-wrap: wrap; }
  .mw-toggle-group { display: inline-flex; gap: 3px; padding: 3px; border: 0; border-radius: 11px; background: var(--control-fill); box-shadow: inset 0 0 0 1px var(--line); }
  .mw-toggle {
    min-height: 26px; font-size: 12px;
    transition: color var(--dur-move) var(--ease-quint), background-color var(--dur-hover) var(--ease-quint), box-shadow var(--dur-hover) var(--ease-quint);
    &:hover:not(:disabled):not(.is-current) { color: var(--ink); background: var(--nav-hover); }
    &:disabled { opacity: .42; cursor: not-allowed; }
    &.is-current { background: var(--paper); color: var(--ink); box-shadow: var(--lift-1), inset 0 1px 0 var(--edge-highlight); }
    &:not(.mw-toggle-group .mw-toggle) { min-height: 28px; font-size: 13px; color: var(--ink-soft); }
    &.is-current:not(.mw-toggle-group .mw-toggle) { background: var(--nav-active); color: var(--ink); box-shadow: none; }
  }
  /* Choice: a few options side by side; the chosen one is graphite with its check. */
  .mw-choice-group { display: flex; flex-wrap: wrap; gap: 8px; align-items: stretch; }
  .mw-choice {
    justify-content: space-between; gap: 16px; min-height: 40px; min-width: 124px; padding: 0 12px; border: 0; border-radius: 8px;
    background: var(--choice-surface, var(--paper)); color: var(--ink); text-decoration: none; cursor: pointer;
    box-shadow: var(--lift-1); font: inherit; font-size: 13px; line-height: 1.2; text-align: left;
    transition: background-color var(--dur-move) var(--ease-quint), color var(--dur-move) var(--ease-quint), box-shadow var(--dur-move) var(--ease-quint), transform var(--dur-hover) var(--ease-quint);
    &:hover:not([aria-pressed="true"]):not([aria-current="true"]) { background: color-mix(in srgb, var(--ink) 3%, var(--choice-surface, var(--paper))); box-shadow: var(--lift-1); }
    &:active { transform: scale(.97); }
    &:is([aria-pressed="true"], [aria-current="true"]) { background: var(--action); color: var(--action-ink); box-shadow: var(--lift-1); .mw-choice__check { opacity: 1; transform: none; } }
  }
  :is(.mw-check, .mw-radio, .mw-tabs__tab, .mw-toggle, .mw-pagination__page, .mw-choice, .mw-calendar__day, .mw-dir-row):focus-visible,
  .mw-switch input:focus-visible + .mw-switch__track { ${CONTAINED_FOCUS_COMPACT}; }
  .mw-choice__label { gap: 8px; white-space: nowrap; svg { width: 16px; height: 16px; flex: none; } }
  .mw-choice__check { width: 12px; opacity: 0; transform: scale(.6); transition: opacity var(--dur-move) var(--ease-quint), transform var(--dur-move) var(--ease-spring); svg { width: 12px; height: 12px; stroke-width: 2; } }
  .mw-collapsible { padding-top: 4px; summary { cursor: pointer; color: var(--ink-soft); font-size: 13px; padding: 12px 0; &:hover { color: var(--ink); } } }
  /* One disclosure grammar: a rotating chevron instead of the OS triangle. Summaries that bring their own mark keep it. */
  :is(.mw-disclosure, .mw-collapsible, .form-disclosure, .record-templates, .form-export-panel, .coding-material, .coding-checkpoints) {
    > summary:not(:has(svg)) {
      display: flex; align-items: center; gap: 8px; list-style: none; cursor: pointer;
      &::-webkit-details-marker { display: none; }
      &::before {
        content: ""; flex: none; width: 12px; height: 12px; background-color: currentColor; opacity: .72;
        --chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") center / 12px 12px no-repeat; -webkit-mask: var(--chevron); mask: var(--chevron);
        transform: rotate(-90deg); transition: transform var(--dur-move) var(--ease-quint);
      }
    }
    &[open] > summary:not(:has(svg))::before { transform: none; }
  }
  .mw-collapsible__body { display: grid; gap: 12px; }
`;

export const PRIMITIVE_PLUGIN_FIELDS_EXTRA = `
  .mw-label { color: var(--ink); font-size: 13px; }
  .mw-check-group, .mw-radio-group { legend { color: var(--ink-soft); font-size: 12px; padding: 0; margin-bottom: 4px; } }
  .mw-number {
    gap: 0; border: 1px solid var(--control-input); border-radius: var(--radius-control);
    .mw-input { min-width: 64px; text-align: center; }
    .mw-btn { width: 28px; min-width: 28px; border: 0; background: transparent; color: var(--muted); &:hover:not(:disabled) { background: var(--nav-hover); color: var(--ink); } }
  }
`;

export const PRIMITIVE_PLUGIN_SEVERITY = `
  /* 3 × 3 position mark (renderSeverityGrid): the lit cell is filled, the rest are hollow, so it never relies on colour alone. */
  .mw-severity-grid { --severity-cell: 5px; --severity-gap: 2px; --severity-tone: var(--tone-quiet); gap: 8px; flex: none; vertical-align: middle; }
  .mw-severity-grid--large { --severity-cell: 12px; --severity-gap: 3px; --severity-corner: 4px; }
  .mw-severity-grid--danger { --severity-tone: var(--tone-blocked); }
  .mw-severity-grid--warning { --severity-tone: var(--tone-attention); }
  .mw-severity-grid__cells {
    display: inline-grid; grid-template-columns: repeat(3, var(--severity-cell)); gap: var(--severity-gap);
    > i {
      width: var(--severity-cell); height: var(--severity-cell); border-radius: var(--severity-corner, 0); box-shadow: inset 0 0 0 1px var(--line-strong);
      &.is-lit { background: var(--severity-tone); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--severity-tone) 70%, var(--ink)); }
    }
  }
  .mw-severity-grid__axes { display: inline-flex; flex-direction: column; gap: 2px; font-family: var(--type-note-font); font-size: var(--type-note-size); color: var(--muted); line-height: 1.3; }
  @media (forced-colors: active) {
    .mw-severity-grid__cells > i { forced-color-adjust: none; box-shadow: inset 0 0 0 1px GrayText; background: Canvas; &.is-lit { background: CanvasText; box-shadow: none; } }
  }
`;

export const PRIMITIVE_PLUGIN_CALENDAR = `
  .mw-calendar {
    display: grid; gap: 8px; width: 252px;
    :is(td span, .mw-calendar__day) {
      width: 26px; height: 26px; margin: 0 auto; border: 0; border-radius: 50%; background: transparent; color: inherit; font: inherit; cursor: pointer;
      &:hover { background: var(--nav-hover); color: var(--ink); }
    }
    td[aria-current="date"]:not(.is-selected) :is(.mw-calendar__day, span) { color: var(--accent); font-weight: var(--weight-control); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent); }
    td.is-selected :is(.mw-calendar__day, span) { background: var(--action); color: var(--action-ink); font-weight: var(--weight-control); box-shadow: var(--lift-1); }
  }
  .mw-calendar--compact { width: 200px; }
  .mw-calendar__header { justify-content: space-between; font-size: 12px; color: var(--ink); }
  .mw-calendar__grid { width: 100%; table-layout: fixed; border-collapse: collapse; text-align: center; font-size: 11px; th { height: 24px; color: var(--muted); } }
  .mw-calendar__outside { color: var(--faint); }
  .mw-date-picker { display: grid; gap: 8px; width: min(252px, 100%); position: relative; }
  .mw-date-picker__popup { display: none; position: absolute; top: calc(100% + 6px); z-index: 8; padding: 12px; border: 0; border-radius: 14px; background: var(--paper); box-shadow: var(--shadow); &.is-open { display: grid; } }
`;

export const PRIMITIVE_PLUGIN_PREVIEW = `
  .mw-preview-card {
    width: min(280px, 100%); padding: 16px; border: 0; border-radius: 12px; box-shadow: var(--shadow-raised);
    strong { display: block; font-size: 13px; }
    p { margin: 8px 0 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
  }
`;

export const PRIMITIVE_PLUGIN_LAYOUT_SHELL = `
  .mw-sidebar { min-height: 0; min-width: 0; }
  .mw-sidebar__body { min-height: 0; }
  .mw-frame { min-height: 0; }
  .mw-frame__panel { min-height: 0; }
  .mw-group { display: inline-flex; align-items: center; gap: 4px; padding: 4px; }
  :is(.mw-catalog, .mw-layout-primitives) .mw-sidebar {
    display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%;
    overflow: hidden; color: var(--ink);
  }
  :is(.mw-catalog, .mw-layout-primitives) .mw-sidebar--rail {
    width: 48px; padding: 8px 0 12px;
    background: var(--nav-bg); border-right: 1px solid var(--line);
  }
  :is(.mw-catalog, .mw-layout-primitives) .mw-sidebar--rail .mw-sidebar__body {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    padding: 0 8px; overflow: hidden;
  }
  :is(.mw-catalog, .mw-layout-primitives) .mw-sidebar--rail .mw-btn {
    width: 36px; min-width: 36px; height: 32px; min-height: 32px; padding: 0;
    border: 0; border-radius: 8px; background: transparent; color: var(--faint);
    box-shadow: none;
  }
  :is(.mw-catalog, .mw-layout-primitives) .mw-sidebar--rail .mw-btn svg { width: 20px; height: 20px; color: inherit; stroke-width: 1.6; }
  :is(.mw-catalog, .mw-layout-primitives) .mw-sidebar--rail .mw-btn:hover:not(:disabled) {
    background: var(--nav-hover); color: var(--ink-soft);
  }
  :is(.mw-catalog, .mw-layout-primitives) .mw-sidebar--rail .mw-btn[aria-current="page"] {
    background: var(--nav-active); color: var(--plugin-tint, var(--ink));
  }
  :is(.mw-catalog, .mw-layout-primitives) .mw-sidebar--directory {
    width: 240px; background: var(--nav-bg, var(--rail));
    border-right: 1px solid var(--line);
  }
  :is(.mw-catalog, .mw-layout-primitives) .mw-sidebar__header {
    min-height: 36px; padding: 12px 12px 8px; font-size: 13px; font-weight: var(--weight-title, 600);
  }
  :is(.mw-catalog, .mw-layout-primitives) .mw-sidebar__footer { padding: 8px 8px 12px; }
  :is(.mw-catalog, .mw-layout-primitives) .mw-sidebar__body { flex: 1; min-height: 0; }
  :is(.mw-catalog, .mw-layout-primitives) .mw-sidebar--directory .mw-sidebar__body {
    display: flex; flex-direction: column; overflow: hidden; padding: 0;
  }
  :is(.mw-catalog, .mw-layout-primitives) .mw-sidebar--directory .mw-dir {
    flex: 1; min-height: 0; padding: 8px 8px 12px; overflow: auto;
  }
  :is(.mw-catalog, .mw-layout-primitives) .mw-frame {
    display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%;
    background: var(--paper);
  }
  :is(.mw-catalog, .mw-layout-primitives) .mw-frame__header {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 24px;
    padding: 24px 32px 8px;
  }
  :is(.mw-catalog, .mw-layout-primitives) .mw-frame__heading { min-width: 0; }
  :is(.mw-catalog, .mw-layout-primitives) .mw-frame__heading h2 {
    margin: 0; color: var(--ink); font-size: 17px; font-weight: var(--weight-title, 600); letter-spacing: -.02em; line-height: 24px;
  }
  :is(.mw-catalog, .mw-layout-primitives) .mw-frame__heading p { margin: 8px 0 0; color: var(--muted); font-size: 12px; line-height: 16px; }
  /* A frame's header action keeps its own kind (primary, secondary, outlined ghost): a button there never thins to a text link. */
  :is(.mw-catalog, .mw-layout-primitives) .mw-frame__action { flex: none; }
  :is(.mw-catalog, .mw-layout-primitives) .mw-frame__panel {
    flex: 1; min-height: 0; overflow: auto; padding: 12px 32px 32px;
    color: var(--ink-soft); font-size: 13px; line-height: 1.65;
  }
  :is(.mw-catalog, .mw-layout-primitives) .mw-frame__panel p { margin: 0 0 12px; max-width: 52ch; }
  :is(.mw-catalog, .mw-layout-primitives) .mw-frame__panel p:last-child { margin-bottom: 0; }
  :is(.mw-catalog, .mw-layout-primitives) .mw-frame__footer { padding: 8px 32px 24px; }
`;

/** Lower-specificity layout-shell primitives for framed plugins so a plugin's own responsive overrides win cleanly. */
export const PRIMITIVE_PLUGIN_LAYOUT_SHELL_FRAME = `
  .mw-sidebar, .mw-sidebar__body, .mw-frame, .mw-frame__panel { min-height: 0; }
  .mw-sidebar { min-width: 0; }
  .mw-group { gap: 4px; padding: 4px; }
  :where(.mw-layout-primitives) {
    .mw-sidebar, .mw-frame { display: flex; flex-direction: column; min-width: 0; height: 100%; }
    .mw-sidebar { overflow: hidden; color: var(--ink); }
    .mw-sidebar--rail, .mw-sidebar--directory {
      background: var(--nav-bg); border-right: 1px solid var(--line);
      .mw-sidebar__body { display: flex; flex-direction: column; overflow: hidden; }
    }
    .mw-sidebar--rail {
      width: 48px; padding: 8px 0 12px;
      .mw-sidebar__body { align-items: center; gap: 4px; padding: 0 8px; }
      .mw-btn {
        width: 36px; min-width: 36px; height: 32px; min-height: 32px; padding: 0;
        border: 0; border-radius: 8px; background: transparent; color: var(--faint); box-shadow: none;
        svg { width: 20px; height: 20px; color: inherit; stroke-width: 1.6; }
        &:hover:not(:disabled) { background: var(--nav-hover); color: var(--ink-soft); }
        &[aria-current="page"] { background: var(--nav-active); color: var(--plugin-tint, var(--ink)); }
      }
    }
    .mw-sidebar--directory {
      width: 240px;
      .mw-sidebar__body { padding: 0; }
      .mw-dir { flex: 1; min-height: 0; padding: 8px 8px 12px; overflow: auto; }
    }
    .mw-sidebar__header { min-height: 36px; padding: 12px 12px 8px; font-size: 13px; font-weight: var(--weight-title); }
    .mw-sidebar__footer { padding: 8px 8px 12px; }
    .mw-sidebar__body { flex: 1; }
    .mw-frame { background: var(--paper); }
    .mw-frame__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding: 24px 32px 8px; }
    .mw-frame__heading {
      min-width: 0;
      h2 { margin: 0; color: var(--ink); font-size: 17px; font-weight: var(--weight-title); letter-spacing: -.02em; line-height: 24px; }
      p { margin: 8px 0 0; color: var(--muted); font-size: 12px; line-height: 16px; }
    }
    .mw-frame__action { flex: none; }
    .mw-frame__panel {
      flex: 1; overflow: auto; padding: 12px 32px 32px; color: var(--ink-soft); font-size: 13px; line-height: 1.65;
      p { margin: 0 0 12px; max-width: 52ch; &:last-child { margin-bottom: 0; } }
    }
    .mw-frame__footer { padding: 8px 32px 24px; }
  }
`;

export const PRIMITIVE_PLUGIN_CARD_TABLE = `
  /* A card lifts off the surface on a hairline and a soft shadow instead of a drawn frame. */
  .mw-card {
    display: grid; border: 1px solid transparent; border-radius: 16px; overflow: hidden;
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--ink) 5%, transparent), var(--shadow-soft), inset 0 1px 0 var(--edge-highlight);
  }
  .mw-card__header { display: flex; justify-content: space-between; gap: 12px; padding: 20px 20px 0; }
  .mw-card__title { margin: 0; font-size: 15px; }
  .mw-card__description { margin: 4px 0 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
  .mw-card__panel { padding: 12px 20px 20px; color: var(--ink-soft); font-size: 13px; line-height: 1.6; > :first-child { margin-top: 0; } > :last-child { margin-bottom: 0; } }
  .mw-card__footer { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 0 20px 20px; color: var(--muted); font-size: 12px; }
  .mw-scroll { overflow: auto; min-height: 0; }
  .mw-table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: 12px; }
  .mw-table {
    width: 100%; border-collapse: collapse; font-size: 13px;
    :is(th, td) { padding: 12px 16px; border: 0; text-align: left; }
    th { color: var(--muted); font-size: 11px; letter-spacing: .01em; }
    thead th { padding-bottom: 8px; }
    tbody tr { &:hover { background: var(--nav-hover); } & + tr td { box-shadow: inset 0 1px 0 var(--line); } }
  }
  .mw-table tbody tr, .mw-inset-row { transition: background-color var(--dur-hover) var(--ease-quint); }
  .mw-badge--chip { border-radius: 6px; padding: 0 7px; min-height: 20px; }
  .mw-glyph-status { width: 20px; height: 20px; flex: none; border-radius: 6px; color: var(--status-tone, var(--ink-soft)); svg { width: 15px; height: 15px; display: block; } }
  .mw-signal-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; flex: none; background: var(--status-tone, var(--muted)); }
  .mw-signal { gap: 4px; color: var(--muted); font-size: 12px; line-height: 16px; white-space: nowrap; svg { width: 12px; height: 12px; flex: none; color: var(--faint); } }
  .mw-tabs__list--underline {
    gap: 16px; border-bottom: 1px solid var(--line);
    .mw-tabs__tab {
      min-height: 36px; padding: 0 2px; border-radius: 0; background: transparent;
      &:is(:hover, .is-active) { background: transparent; color: var(--ink); }
      &::after { content: ""; position: absolute; inset: auto 0 -1px; height: 2px; border-radius: 1px; background: var(--accent); opacity: 0; transform: scaleX(.4); transition: opacity var(--dur-move) var(--ease-quint), transform var(--dur-move) var(--ease-quint); }
      &.is-active::after { opacity: 1; transform: scaleX(1); }
    }
  }
  .mw-section-well { padding: 4px; border-radius: var(--radius-surface); background: var(--surface-soft); box-shadow: inset 0 0 0 1px var(--line); }
  .mw-inset-group { border-radius: var(--radius-item); box-shadow: 0 0 0 1px color-mix(in srgb, var(--ink) 5.5%, transparent), var(--shadow-soft), inset 0 1px 0 var(--edge-highlight); overflow: hidden; }
  .mw-inset-row {
    position: relative; display: grid; grid: auto / 20px minmax(0, 1fr) auto; column-gap: 10px; align-items: start; padding: 11px 14px;
    &:hover { background: color-mix(in srgb, var(--ink) 2.5%, transparent); }
    & + &::before { content: ""; position: absolute; inset: 0 14px auto var(--text-start); height: 1px; background: var(--line); pointer-events: none; }
    &[data-open="true"] .mw-inset-row__drawer { display: block; animation: craft-rise var(--dur-move) var(--ease-quint); }
  }
  .mw-inset-row--plain { grid: auto / minmax(0, 1fr) auto; & + &::before { left: 14px; } }
  .mw-inset-row__lead { width: 20px; height: 22px; flex: none; color: var(--ink-soft); svg { width: 16px; height: 16px; } }
  .mw-inset-row__body { min-width: 0; display: grid; gap: 3px; }
  .mw-inset-row__title { margin: 0; color: var(--ink); font-size: 13px; line-height: 22px; }
  .mw-inset-row__signals { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; min-width: 0; }
  .mw-inset-row__end { gap: 8px; min-height: 22px; color: var(--muted); font-size: 12px; }
  .mw-inset-row__drawer { grid-column: 2 / -1; display: none; margin-top: 8px; > div { overflow: hidden; min-height: 0; } }
  .mw-field__label, .mw-fieldset legend, .mw-badge, .mw-status, .mw-avatar, .mw-menu__label, .mw-tabs__tab, .mw-toggle, .mw-choice, .mw-collapsible summary, .mw-label, .mw-check-group legend, .mw-radio-group legend, .mw-calendar__header, .mw-calendar__grid th, .mw-preview-card strong, .mw-card__title, .mw-table th, .mw-inset-row__title { font-weight: var(--weight-control); }
`;

export const PRIMITIVE_PLUGIN_LAYOUT = PRIMITIVE_PLUGIN_LAYOUT_SHELL + PRIMITIVE_PLUGIN_CARD_TABLE;

import { PRIMITIVE_PLUGIN_DIR, PRIMITIVE_PLUGIN_DIR_COMPACT } from "./primitives-dir.js";
export { PRIMITIVE_PLUGIN_DIR, PRIMITIVE_PLUGIN_DIR_COMPACT };

export const PRIMITIVE_PLUGIN_MEDIA = `
  @media (max-width: 760px), (pointer: coarse) {
    .mw-form__footer .mw-btn:not(.mw-btn--icon-only), .mw-btn--lg, .mw-menu__item, .mw-select-picker > .mw-select-picker__trigger { min-height: 44px; }
    .mw-menu.mw-select-picker__menu .mw-select-picker__item { min-height: 44px; font-size: 15px; }
    .mw-btn--sm { min-height: var(--control-h); }
    /* A 44 × 44 touch target round the 36 × 22 switch; callers must leave >= 11px vertical and >= 4px horizontal clearance to adjacent controls. */
    .mw-switch input { inset: -11px -4px; }
    .mw-input, .mw-textarea, .mw-select { font-size: 16px; }
    .mw-input-group svg { width: 16px; height: 16px; }
    dialog.mw-sheet { inset: 0; width: 100vw; height: 100dvh; }
    dialog.mw-dialog--form { width: calc(100vw - 24px); max-height: calc(100dvh - 32px); > .mw-form { max-height: inherit; } }
  }
  @media (prefers-reduced-motion: reduce) {
    .mw-spinner, .mw-inset-row[data-open="true"] .mw-inset-row__drawer { animation: none; }
    .mw-help-card, .mw-select-picker__menu { animation: none !important; }
  }
`;

/** Complete plugin-frame primitive stylesheet (all core SDK mw-* controls, including fields, severity, calendar, and layout shell). */
export const PRIMITIVE_PLUGIN_STYLES =
  PRIMITIVE_PLUGIN_CORE_HEAD
  + PRIMITIVE_PLUGIN_CORE_MID
  + PRIMITIVE_PLUGIN_KBD
  + PRIMITIVE_PLUGIN_DIALOG
  + PRIMITIVE_PLUGIN_DIALOG_FORM
  + PRIMITIVE_PLUGIN_MENU
  + PRIMITIVE_PLUGIN_CONTROLS
  + PRIMITIVE_PLUGIN_FIELDS_EXTRA
  + PRIMITIVE_PLUGIN_SEVERITY
  + PRIMITIVE_PLUGIN_CALENDAR
  + PRIMITIVE_PLUGIN_PREVIEW
  + PRIMITIVE_PLUGIN_LAYOUT_SHELL_FRAME
  + PRIMITIVE_PLUGIN_CARD_TABLE
  + PRIMITIVE_PLUGIN_DIR_COMPACT
  + PRIMITIVE_PLUGIN_MEDIA;
