/** Shared mw-* control language. Loaded with the visual foundation. */
export const PRIMITIVE_STYLES = `
  .mw-sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
  }

  .mw-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: var(--control-h, 28px);
    padding: 0 var(--control-pad-x, 12px);
    border: 1px solid var(--control-border);
    border-radius: var(--radius-control, 8px);
    background: var(--control-fill);
    color: var(--ink);
    font: inherit;
    font-size: 13px;
    font-weight: 400;
    line-height: 1;
    letter-spacing: -.01em;
    box-shadow: none;
    cursor: pointer;
    text-decoration: none;
    white-space: nowrap;
    appearance: none;
    -webkit-appearance: none;
    transition:
      background-color var(--motion-instant, 90ms) var(--ease-standard, ease),
      color var(--motion-instant, 90ms) var(--ease-standard, ease),
      border-color var(--motion-instant, 90ms) var(--ease-standard, ease),
      box-shadow var(--motion-fast, 140ms) var(--ease-standard, ease),
      opacity var(--motion-fast, 140ms) var(--ease-standard, ease);
  }
  body .mw-btn:active { filter: none; }
  .mw-btn svg { width: 14px; height: 14px; flex: none; }
  .mw-btn--sm { min-height: 28px; }
  .mw-btn--md { min-height: 32px; }
  .mw-btn--lg { min-height: 36px; padding-inline: 16px; }
  .mw-btn--icon, .mw-btn--icon-only {
    width: var(--control-h, 28px);
    min-width: var(--control-h, 28px);
    padding: 0;
  }
  .mw-btn--icon.mw-btn--sm, .mw-btn--icon-only.mw-btn--sm {
    width: 28px; min-width: 28px; min-height: 28px;
  }
  .mw-btn:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--focus) 72%, transparent),
      0 0 0 3.5px color-mix(in srgb, var(--focus) 15%, transparent);
  }
  .mw-btn--primary {
    border-color: var(--action);
    background: var(--action);
    color: var(--action-ink);
  }
  .mw-btn--primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--action) 90%, var(--action-ink));
    color: var(--action-ink);
  }
  .mw-btn--primary:active:not(:disabled) {
    background: color-mix(in srgb, var(--action) 82%, var(--action-ink));
  }
  .mw-btn--secondary {
    min-height: var(--control-h, 28px);
    padding: 0 var(--control-pad-x, 12px);
    border: 1px solid var(--control-border);
    border-radius: var(--radius-control);
    background: var(--control-fill);
    color: var(--ink);
  }
  .mw-btn--secondary:hover:not(:disabled) {
    border-color: var(--control-input);
    background: var(--control-fill-hover);
  }
  .mw-btn--secondary:active:not(:disabled),
  .mw-btn--ghost:active:not(:disabled) {
    background: var(--nav-press, color-mix(in srgb, var(--ink) 14%, transparent));
  }
  .mw-btn--ghost { border-color: transparent; background: transparent; color: var(--ink-soft); }
  .mw-btn--ghost:hover:not(:disabled) { background: var(--nav-hover); color: var(--ink); }
  .mw-btn--danger {
    border-color: var(--danger-action, var(--red));
    background: var(--danger-action, var(--red));
    color: var(--danger-action-ink, var(--page));
  }
  .mw-btn--danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--danger-action, var(--red)) 88%, var(--ink));
    color: var(--danger-action-ink, var(--page));
  }
  .mw-btn--danger:active:not(:disabled) {
    background: color-mix(in srgb, var(--danger-action, var(--red)) 76%, var(--ink));
  }
  .mw-btn--danger-outline {
    border-color: color-mix(in srgb, var(--red) 28%, var(--control-border));
    background: transparent;
    color: var(--red);
  }
  .mw-btn--danger-outline:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--red) 46%, var(--control-border));
    background: color-mix(in srgb, var(--red) 8%, var(--paper));
  }
  .mw-btn--link {
    min-height: auto;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--ink-soft);
    font-weight: 400;
    box-shadow: none;
  }
  .mw-btn--link:hover:not(:disabled) {
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 3px;
    background: transparent;
  }
  .mw-btn--link:active:not(:disabled) { color: var(--ink); }
  .mw-btn--link:focus-visible { box-shadow: none; outline: 2px solid var(--focus); outline-offset: 3px; }
  .mw-btn:disabled {
    cursor: not-allowed;
    opacity: .42;
  }
  .mw-btn--primary:disabled,
  .mw-btn--primary[data-loading] {
    border-color: var(--action);
    background: var(--action);
    color: var(--action-ink);
  }
  .mw-btn--danger:disabled,
  .mw-btn--danger[data-loading] {
    border-color: var(--danger-action, var(--red));
    background: var(--danger-action, var(--red));
    color: var(--danger-action-ink, var(--page));
  }
  .mw-btn[data-loading] { pointer-events: none; opacity: 1; }
  .mw-btn[data-loading] > :not(.mw-spinner) { visibility: hidden; }
  .mw-btn[data-loading] > .mw-spinner {
    position: absolute;
    visibility: visible;
  }

  .mw-input, .mw-textarea, .mw-select {
    width: 100%;
    min-height: var(--control-h, 28px);
    padding: 0 10px;
    border: 1px solid var(--control-input);
    border-radius: var(--radius-control, 8px);
    color: var(--ink);
    background-color: var(--paper);
    font: inherit;
    font-size: 13px;
    box-shadow: none;
    appearance: none;
    -webkit-appearance: none;
  }
  .mw-input[type="search"]::-webkit-search-decoration,
  .mw-input[type="search"]::-webkit-search-cancel-button {
    appearance: none;
    -webkit-appearance: none;
  }
  .mw-textarea { min-height: 72px; padding: 8px 10px; resize: vertical; height: auto; }
  .mw-select {
    padding-right: 28px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%236d6d76' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
    background-size: 14px 14px;
  }
  html[data-resolved-theme="dark"] .mw-select {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%2394949c' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  }
  .mw-input::placeholder, .mw-textarea::placeholder { color: var(--faint); }
  .mw-input:hover:not(:disabled):not(:focus-visible),
  .mw-textarea:hover:not(:disabled):not(:focus-visible),
  .mw-select:hover:not(:disabled):not(:focus-visible) {
    border-color: color-mix(in srgb, var(--control-input) 72%, var(--ink));
  }
  .mw-input:focus-visible, .mw-textarea:focus-visible, .mw-select:focus-visible {
    outline: 0;
    border-color: color-mix(in srgb, var(--focus) 62%, transparent);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--focus) 72%, transparent),
      0 0 0 3.5px color-mix(in srgb, var(--focus) 15%, transparent);
  }
  .mw-input[aria-invalid="true"], .mw-textarea[aria-invalid="true"], .mw-select[aria-invalid="true"] {
    border-color: var(--red);
  }
  .mw-input[aria-invalid="true"]:focus-visible,
  .mw-textarea[aria-invalid="true"]:focus-visible,
  .mw-select[aria-invalid="true"]:focus-visible {
    border-color: var(--red);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--red) 72%, transparent),
      0 0 0 3.5px color-mix(in srgb, var(--red) 15%, transparent);
  }
  .mw-input:disabled, .mw-textarea:disabled, .mw-select:disabled {
    color: var(--faint);
    background-color: var(--control-fill);
  }
  .mw-input-group {
    display: flex; align-items: center; gap: 8px;
    min-height: var(--control-h, 28px);
    padding: 0 10px;
    border: 1px solid var(--control-input);
    border-radius: var(--radius-control, 8px);
    background: var(--paper);
  }
  .mw-input-group .mw-input,
  .mw-number .mw-input {
    border: 0;
    outline: 0;
    min-height: 26px;
    padding: 0;
    min-width: 0;
    background: transparent;
    box-shadow: none;
    border-radius: 0;
  }
  .mw-input-group .mw-input:is(:hover, :focus, :focus-visible, [aria-invalid="true"]),
  .mw-number .mw-input:is(:hover, :focus, :focus-visible, [aria-invalid="true"]) {
    border: 0;
    outline: 0;
    background: transparent;
    box-shadow: none;
  }
  .mw-input-group:focus-within {
    border-color: color-mix(in srgb, var(--focus) 62%, transparent);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--focus) 72%, transparent),
      0 0 0 3.5px color-mix(in srgb, var(--focus) 15%, transparent);
  }
  .mw-input-group svg { width: 14px; height: 14px; color: var(--faint); flex: none; }

  .mw-check-row { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: var(--ink); cursor: pointer; }
  .mw-check, .mw-radio {
    appearance: none; -webkit-appearance: none;
    width: 14px; height: 14px; margin: 3px 0 0; padding: 0; flex: none;
    border: 1px solid var(--control-input); background: var(--paper);
    display: inline-grid; place-items: center; color: var(--action-ink);
  }
  .mw-check { border-radius: 4px; }
  .mw-radio { border-radius: 50%; }
  .mw-check:hover:not(:disabled), .mw-radio:hover:not(:disabled) { border-color: color-mix(in srgb, var(--control-input) 60%, var(--ink)); }
  .mw-check:checked, .mw-radio:checked { border-color: var(--action); background: var(--action); }
  .mw-check:checked::after {
    content: ""; width: 7px; height: 4px;
    border: 1.5px solid currentColor; border-top: 0; border-right: 0;
    transform: translateY(-1px) rotate(-45deg);
  }
  .mw-radio:checked::after {
    content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor;
  }
  .mw-check:focus-visible, .mw-radio:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--focus) 72%, transparent),
      0 0 0 3.5px color-mix(in srgb, var(--focus) 15%, transparent);
  }
  .mw-check:disabled, .mw-radio:disabled { opacity: .42; }
  .mw-switch { position: relative; display: inline-grid; width: 32px; height: 18px; flex: none; }
  .mw-switch input { appearance: none; position: absolute; inset: 0; margin: 0; cursor: pointer; }
  .mw-switch__track {
    display: block; width: 32px; height: 18px; border-radius: 99px;
    background: var(--control-fill); border: 1px solid var(--control-border);
    transition: background-color var(--motion-instant, 90ms) var(--ease-standard, ease), border-color var(--motion-instant, 90ms) var(--ease-standard, ease);
  }
  .mw-switch__track::after {
    content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%;
    background: var(--paper); box-shadow: var(--surface-shadow); transition: transform 160ms var(--ease-standard, ease);
  }
  .mw-switch input:hover:not(:disabled) + .mw-switch__track { border-color: var(--control-input); }
  .mw-switch input:checked + .mw-switch__track { background: var(--action); border-color: var(--action); }
  .mw-switch input:checked + .mw-switch__track::after { transform: translateX(14px); background: var(--action-ink); }
  .mw-switch input:focus-visible + .mw-switch__track {
    outline: none;
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--focus) 72%, transparent),
      0 0 0 3.5px color-mix(in srgb, var(--focus) 15%, transparent);
  }
  .mw-switch:has(input:disabled) { opacity: .42; }

  .mw-field, .mw-form label:not(.mw-check-row):not(.operation-confirm-check) {
    display: grid; gap: 5px; font-size: 13px; color: var(--ink-soft);
  }
  .mw-field__label { display: flex; align-items: baseline; gap: 6px; color: var(--ink); font-weight: 400; }
  .mw-field__label small, .mw-field__hint { color: var(--muted); font-weight: 400; font-size: 12px; line-height: 1.6; }
  .mw-field__error { margin: 0; color: var(--red); font-size: 12px; line-height: 1.6; }
  .mw-fieldset {
    border: 0; padding: 0; display: grid; gap: 8px;
  }
  .mw-fieldset legend { color: var(--ink-soft); font-size: 13px; padding: 0; }

  .mw-form { display: flex; flex-direction: column; min-height: 0; height: 100%; }
  .mw-form__header, .mw-form__footer {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex: none;
  }
  .mw-form__header { padding: 18px 20px 8px; }
  .mw-form__header h2 { margin: 0; font-size: 15px; font-weight: 400; letter-spacing: -.01em; color: var(--ink); }
  .mw-form__header p { margin: 6px 0 0; color: var(--muted); font-size: 13px; line-height: 1.6; }
  .mw-form__body {
    flex: 1; min-height: 0; overflow: auto; display: grid; align-content: start; gap: 12px;
    padding: 16px 20px;
  }
  .mw-form__footer {
    align-items: center; justify-content: flex-end; gap: 8px;
    padding: 8px 20px 18px;
  }
  .mw-form__footer .mw-btn:not(.mw-btn--icon-only) { min-height: 36px; }
  .mw-form__footer .mw-btn--secondary:first-child,
  .mw-form__footer button[data-dialog-close]:not(.mw-btn--icon-only) { margin-right: auto; }

  .mw-badge {
    display: inline-flex; align-items: center; gap: 4px; min-height: 18px; padding: 0 6px;
    border: 0; border-radius: 5px; font-size: 11px; font-weight: 400;
    background: color-mix(in srgb, var(--status-tone, var(--ink)) 11%, transparent);
    color: var(--status-tone, var(--ink-soft));
  }
  .mw-status {
    display: inline-flex; align-items: center; gap: 4px; min-width: 0; min-height: 18px; padding: 0 6px;
    border: 0; border-radius: 5px; font-size: 11px; font-weight: 400; line-height: 1;
    background: color-mix(in srgb, var(--status-tone, var(--ink)) 11%, transparent);
    color: var(--status-tone, var(--ink-soft));
    white-space: nowrap;
  }
  .mw-status svg { width: 12px; height: 12px; flex: none; }
  .mw-status > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .mw-status--plain {
    min-height: 0; padding: 0; background: transparent; border-radius: 0;
  }
  .mw-status--idle, .mw-badge--neutral { --status-tone: var(--tone-idle, var(--ink-soft)); }
  .mw-status--progress, .mw-badge--info { --status-tone: var(--tone-progress, var(--blue)); }
  .mw-status--attention, .mw-badge--warning { --status-tone: var(--tone-attention, var(--amber)); }
  .mw-status--hold { --status-tone: var(--tone-hold, var(--muted)); }
  .mw-status--blocked, .mw-badge--danger { --status-tone: var(--tone-blocked, var(--red)); }
  .mw-status--done, .mw-badge--success { --status-tone: var(--tone-done, var(--green)); }
  .mw-status--quiet { --status-tone: var(--tone-quiet, var(--muted)); }
  .mw-badge--info { background: color-mix(in srgb, var(--status-tone) 11%, transparent); color: var(--status-tone); }
  .mw-badge--success { background: color-mix(in srgb, var(--status-tone) 11%, transparent); color: var(--status-tone); }
  .mw-badge--warning { background: color-mix(in srgb, var(--status-tone) 11%, transparent); color: var(--status-tone); }
  .mw-badge--danger { background: color-mix(in srgb, var(--status-tone) 11%, transparent); color: var(--status-tone); }

  .mw-alert {
    display: grid; gap: 4px; padding: 12px 14px; border: 1px solid transparent;
    border-radius: var(--radius-control, 8px);
    background: var(--control-fill); color: var(--ink); font-size: 13px; line-height: 1.6;
  }
  .mw-alert p { margin: 0; color: var(--ink-soft); }
  .mw-alert--danger { background: var(--red-soft); border-color: color-mix(in srgb, var(--red) 16%, transparent); }
  .mw-alert--success { background: color-mix(in srgb, var(--green) 12%, var(--paper)); }
  .mw-alert--warning { background: color-mix(in srgb, var(--amber) 14%, var(--paper)); }

  .mw-empty {
    display: grid; justify-items: start; align-content: start; gap: 8px; padding: 18px 10px; color: var(--ink-soft);
  }
  .mw-empty__mark { color: var(--muted); }
  .mw-empty__mark svg { width: 16px; height: 16px; }
  .mw-empty h1, .mw-empty h2, .mw-empty strong { margin: 0; font-size: 14px; font-weight: 400; color: var(--ink); }
  .mw-empty p { margin: 0; font-size: 13px; line-height: 1.6; color: var(--ink-soft); }
  .frame-empty.mw-empty {
    display: flex; flex-direction: column; justify-content: center; align-items: center;
    gap: 12px; padding: 32px; text-align: center;
  }
  .frame-empty.mw-empty .mw-btn { margin-top: 4px; }

  .mw-toast {
    min-height: 36px; padding: 10px 14px; border: 1px solid var(--hairline, var(--control-border));
    border-radius: var(--radius-surface, 12px); background: var(--paper);
    box-shadow: var(--control-shadow); color: var(--ink); font-size: 13px;
  }
  .mw-spinner {
    width: 14px; height: 14px; border: 2px solid color-mix(in srgb, currentColor 22%, transparent);
    border-top-color: currentColor; border-radius: 50%; display: inline-block;
    animation: mw-spin 700ms linear infinite;
  }
  .mw-skeleton {
    display: block; height: 12px; border-radius: 4px;
    background: color-mix(in srgb, var(--ink) 8%, transparent);
  }
  .mw-progress {
    height: 4px; border-radius: 99px; background: var(--control-fill); overflow: hidden;
  }
  .mw-progress > span { display: block; height: 100%; background: var(--action); }
  .mw-kbd {
    display: inline-flex; align-items: center; min-height: 20px; padding: 0 6px;
    border: 1px solid var(--control-border); border-radius: 8px; background: var(--control-fill);
    color: var(--muted); font: 11px/20px ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .mw-separator { border: 0; border-top: 1px solid var(--line); margin: 16px 0; }
  .mw-avatar {
    display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 50%;
    background: var(--nav-active); color: var(--ink); font-size: 12px; font-weight: 400;
  }

  dialog.mw-dialog {
    width: min(420px, calc(100vw - 32px));
    max-height: calc(100dvh - 48px);
    padding: 0; border: 1px solid var(--hairline, var(--control-border));
    border-radius: var(--radius-surface, 12px);
    background: var(--paper); color: var(--ink);
    box-shadow: var(--control-shadow), inset 0 1px 0 var(--edge-highlight, transparent);
  }
  dialog.mw-dialog::backdrop { background: var(--scrim, color-mix(in srgb, var(--ink) 30%, transparent)); }
  dialog.mw-command { width: min(560px, calc(100vw - 32px)); }
  .mw-command__shell { display: flex; flex-direction: column; max-height: min(480px, 70dvh); }
  .mw-command__shell header { padding: 12px 12px 8px; }
  .mw-command__list { overflow: auto; padding: 8px; }
  .mw-command__list [role="option"] {
    display: block; width: 100%; text-align: left; padding: 8px 10px; border: 0;
    border-radius: 8px; background: transparent; color: var(--ink); font: inherit;
  }
  .mw-command__list [role="option"]:hover { background: var(--nav-hover); }

  /** Creation and picking happen in a centred modal sized to its content, not an edge sheet. */
  dialog.mw-dialog--form {
    position: fixed; inset: auto; top: 50%; left: 50%; translate: -50% -50%; margin: 0;
    width: min(560px, calc(100vw - 48px));
    max-height: min(calc(100dvh - 96px), 720px);
    overflow: hidden;
  }
  dialog.mw-dialog--form > .mw-form { height: auto; max-height: min(calc(100dvh - 96px), 720px); }
  dialog.mw-dialog--form .mw-form__body { overflow: auto; overscroll-behavior: contain; }

  dialog.mw-sheet {
    position: fixed; inset: var(--tab-strip-h, 32px) 0 0 auto; margin: 0;
    width: min(560px, 100vw); max-width: 100vw;
    height: calc(100dvh - var(--tab-strip-h, 32px));
    max-height: calc(100dvh - var(--tab-strip-h, 32px));
    padding: 0; border: 0; border-left: 1px solid var(--line); border-radius: 0;
    background: var(--paper); color: var(--ink); box-shadow: none;
    animation: none;
  }
  dialog.mw-sheet::backdrop {
    background: color-mix(in srgb, var(--ink) 10%, transparent);
  }
  .mw-sheet__shell, .mw-dialog__shell { height: 100%; }
  .mw-dialog__close { flex: none; }

  .mw-popover, .mw-menu {
    min-width: 180px; padding: 6px; border: 1px solid var(--hairline, var(--control-border));
    border-radius: var(--radius-surface, 12px); background: var(--paper);
    box-shadow: var(--control-shadow), inset 0 1px 0 var(--edge-highlight, transparent); color: var(--ink);
  }
  .mw-menu hr { height: 0; margin: 6px 8px; border: 0; border-top: 1px solid var(--line); }
  .mw-menu__item {
    display: flex; align-items: center; gap: 8px; width: 100%; min-height: 32px;
    padding: 0 10px; border: 0; border-radius: 8px; background: transparent;
    color: var(--ink); font: inherit; font-size: 13px; text-align: left; cursor: pointer;
  }
  .mw-menu__item:hover, .mw-menu__item:focus-visible { background: var(--nav-hover); outline: none; }
  .mw-menu__item:active { background: var(--nav-press, color-mix(in srgb, var(--ink) 14%, transparent)); }
  .mw-menu__item--danger { color: var(--red); }
  .mw-menu__item--danger:hover, .mw-menu__item--danger:focus-visible {
    background: color-mix(in srgb, var(--red) 8%, transparent);
  }
  .mw-menu__item svg { width: 14px; height: 14px; color: var(--muted); flex: none; }
  .mw-menu__item--danger svg { color: var(--red); }
  .mw-tooltip {
    padding: 4px 8px; border-radius: 8px; background: var(--ink); color: var(--action-ink);
    font-size: 11px; line-height: 1.4;
  }
  .mw-hint { position: relative; display: inline-flex; flex: none; align-items: center; }
  .mw-hint__trigger {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; margin: 0; padding: 0; border: 0; border-radius: 999px;
    background: transparent; color: var(--muted); cursor: help;
  }
  .mw-hint__trigger:hover { color: var(--ink); background: var(--nav-hover); }
  .mw-hint__trigger:focus-visible {
    outline: none; color: var(--ink);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--focus) 72%, transparent),
      0 0 0 3.5px color-mix(in srgb, var(--focus) 15%, transparent);
  }
  .mw-hint__trigger svg { width: 14px; height: 14px; }
  .mw-hint__tooltip {
    box-sizing: border-box; width: max-content; max-width: min(36ch, calc(100vw - 32px));
    margin: 0; padding: 8px 10px; overflow: visible; white-space: normal;
    border: 1px solid var(--hairline, var(--control-border));
    background: var(--paper); color: var(--ink);
    box-shadow: var(--control-shadow), inset 0 1px 0 var(--edge-highlight, transparent);
    font-size: 12px; line-height: 1.5; inset: unset;
  }
  .mw-hint__tooltip:not(:popover-open) { display: none; }
  .mw-hint__tooltip:popover-open {
    position: fixed; top: auto; bottom: 24px; left: 16px; right: 16px; width: auto;
    transform: none;
  }
  .mw-hint__tooltip code {
    padding: 0 4px; border-radius: 4px;
    background: color-mix(in srgb, var(--ink) 10%, transparent);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px;
  }
  @supports (anchor-name: --x) {
    .mw-hint__tooltip:popover-open {
      position: fixed;
      top: anchor(top); left: calc(anchor(right) + 10px); right: auto; bottom: auto;
      width: max-content;
      position-try-fallbacks: flip-inline, flip-block;
    }
  }
  @media (max-width: 760px) {
    @supports (anchor-name: --x) {
      .mw-hint__tooltip:popover-open {
        top: calc(anchor(bottom) + 8px);
        left: 16px; right: 16px; width: auto; max-width: none;
      }
    }
  }

  .mw-tabs__list { display: flex; gap: 4px; }
  .mw-tabs__tab {
    min-height: 28px; padding: 0 10px; border: 0; border-radius: 8px;
    background: transparent; color: var(--muted); font: inherit; font-weight: 400;
  }
  .mw-tabs__tab:hover { color: var(--ink); background: var(--nav-hover); }
  .mw-tabs__tab:focus-visible, .mw-toggle:focus-visible, .mw-pagination__page:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--focus) 72%, transparent),
      0 0 0 3.5px color-mix(in srgb, var(--focus) 15%, transparent);
  }
  .mw-tabs__tab.is-active { background: var(--nav-active); color: var(--ink); font-weight: 400; }
  .mw-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .mw-toggle-group {
    display: inline-flex; gap: 3px; padding: 3px;
    border: 1px solid var(--hairline, var(--control-border));
    border-radius: 10px; background: var(--control-fill);
  }
  .mw-toggle {
    min-height: 24px; padding: 0 10px; border: 0; border-radius: 8px;
    background: transparent; color: var(--muted); font: inherit; font-size: 12px;
  }
  .mw-toggle:hover:not(:disabled):not(.is-current) { color: var(--ink); background: var(--nav-hover); }
  .mw-toggle:disabled { opacity: .42; cursor: not-allowed; }
  .mw-toggle.is-current {
    background: var(--nav-raised); color: var(--ink);
    box-shadow: var(--surface-shadow);
  }
  .mw-collapsible { padding-top: 2px; }
  .mw-collapsible summary { cursor: pointer; color: var(--ink-soft); font-size: 13px; font-weight: 400; padding: 10px 0; }
  .mw-collapsible summary:hover { color: var(--ink); }
  .mw-collapsible__body { display: grid; gap: 12px; padding: 0 0 12px; }
  .mw-accordion { display: grid; gap: 4px; }
  .mw-combobox { display: grid; gap: 4px; }
  .mw-combobox__list {
    border: 1px solid var(--control-border); border-radius: var(--radius-control, 8px);
    background: var(--paper); max-height: 230px; overflow: auto;
  }
  .mw-combobox__list [role="option"] {
    display: block; width: 100%; text-align: left; padding: 8px 10px; border: 0;
    background: transparent; color: var(--ink); font: inherit;
  }
  .mw-combobox__list [role="option"]:hover { background: var(--nav-hover); }

  .mw-label { color: var(--ink); font-size: 13px; font-weight: 400; }
  .mw-check-group, .mw-radio-group { border: 0; padding: 0; display: grid; gap: 6px; }
  .mw-check-group legend, .mw-radio-group legend { color: var(--muted); font-size: 12px; font-weight: 400; padding: 0; margin-bottom: 2px; }
  .mw-number {
    display: inline-flex; align-items: center; gap: 0;
    border: 1px solid var(--control-input); border-radius: var(--radius-control, 8px); background: var(--paper);
  }
  .mw-number .mw-input { min-width: 64px; text-align: center; }
  .mw-number .mw-btn {
    width: 28px; min-width: 28px; border: 0; background: transparent; color: var(--muted);
  }
  .mw-number .mw-btn:hover:not(:disabled) { background: var(--nav-hover); color: var(--ink); }
  .mw-number:focus-within {
    border-color: color-mix(in srgb, var(--focus) 62%, transparent);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--focus) 72%, transparent),
      0 0 0 3.5px color-mix(in srgb, var(--focus) 15%, transparent);
  }
  .mw-otp { display: inline-flex; gap: 6px; }
  .mw-otp__cell {
    width: 36px; min-height: var(--control-h, 28px); text-align: center;
    border: 1px solid var(--control-input); border-radius: var(--radius-control, 8px);
    background: var(--paper); color: var(--ink); font: inherit; font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
  .mw-otp__cell:focus-visible {
    outline: 0;
    border-color: color-mix(in srgb, var(--focus) 62%, transparent);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--focus) 72%, transparent),
      0 0 0 3.5px color-mix(in srgb, var(--focus) 15%, transparent);
  }
  .mw-slider-field {
    display: grid; gap: 4px; width: min(280px, 100%);
  }
  .mw-slider-field__meta {
    display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
    min-height: 16px; color: var(--ink); font-size: 13px; font-weight: 400; line-height: 16px;
  }
  .mw-slider-field__meta output {
    color: var(--muted); font-size: 12px; font-weight: 400; font-variant-numeric: tabular-nums;
  }
  input.mw-slider {
    appearance: none; -webkit-appearance: none; display: block;
    width: min(280px, 100%); height: var(--control-h, 28px); margin: 0; padding: 0;
    border: 0; border-radius: 0; background: transparent; box-shadow: none;
    accent-color: var(--action); cursor: pointer;
  }
  .mw-slider-field input.mw-slider { width: 100%; }
  input.mw-slider::-webkit-slider-runnable-track {
    height: 4px; border: 0; border-radius: 99px;
    background: linear-gradient(
      to right,
      var(--action) 0,
      var(--action) var(--slider-progress, 40%),
      var(--control-fill) var(--slider-progress, 40%),
      var(--control-fill) 100%
    );
  }
  input.mw-slider::-webkit-slider-thumb {
    appearance: none; -webkit-appearance: none;
    width: 16px; height: 16px; margin-top: -6px; border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--ink) 14%, transparent);
    background: var(--paper); box-shadow: var(--surface-shadow); cursor: grab;
  }
  input.mw-slider::-moz-range-track {
    height: 4px; border: 0; border-radius: 99px; background: var(--control-fill);
  }
  input.mw-slider::-moz-range-progress {
    height: 4px; border: 0; border-radius: 99px; background: var(--action);
  }
  input.mw-slider::-moz-range-thumb {
    width: 16px; height: 16px; border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--ink) 14%, transparent);
    background: var(--paper); box-shadow: var(--surface-shadow); cursor: grab;
  }
  input.mw-slider::-moz-focus-outer { border: 0; }
  input.mw-slider:hover:not(:disabled)::-webkit-slider-thumb,
  input.mw-slider:hover:not(:disabled)::-moz-range-thumb {
    border-color: color-mix(in srgb, var(--ink) 28%, transparent);
  }
  input.mw-slider:active:not(:disabled)::-webkit-slider-thumb,
  input.mw-slider:active:not(:disabled)::-moz-range-thumb { cursor: grabbing; }
  input.mw-slider:focus { outline: 0; }
  input.mw-slider:focus-visible::-webkit-slider-thumb,
  input.mw-slider:focus-visible::-moz-range-thumb {
    border-color: color-mix(in srgb, var(--focus) 62%, transparent);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--focus) 72%, transparent),
      0 0 0 3.5px color-mix(in srgb, var(--focus) 15%, transparent);
  }
  input.mw-slider:disabled { opacity: .42; cursor: not-allowed; }
  html[data-resolved-theme="dark"] input.mw-slider {
    border: 0; background: transparent; color: inherit; box-shadow: none;
  }
  .mw-meter { width: 180px; height: 8px; border: 0; border-radius: 99px; background: var(--control-fill); }
  .mw-meter::-webkit-meter-bar { background: var(--control-fill); border-radius: 99px; }
  .mw-meter::-webkit-meter-optimum-value { background: var(--action); border-radius: 99px; }
  .mw-autocomplete { display: grid; gap: 4px; }
  .mw-autocomplete__list {
    border: 1px solid var(--control-border); border-radius: var(--radius-control, 8px);
    background: var(--paper); max-height: 180px; overflow: auto;
  }
  .mw-autocomplete__list [role="option"] {
    display: block; width: 100%; text-align: left; padding: 8px 10px; border: 0;
    background: transparent; color: var(--ink); font: inherit;
  }
  .mw-autocomplete__list [role="option"]:hover { background: var(--nav-hover); }

  .mw-calendar { display: grid; gap: 8px; width: 252px; }
  .mw-calendar--compact { width: 200px; }
  .mw-calendar__header { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; font-weight: 400; color: var(--ink); }
  .mw-calendar__grid { width: 100%; table-layout: fixed; border-collapse: collapse; text-align: center; font-size: 11px; }
  .mw-calendar__grid th { height: 24px; color: var(--muted); font-weight: 400; }
  .mw-calendar td span,
  .mw-calendar__day {
    width: 26px; height: 26px; margin: 0 auto; border: 0; border-radius: 50%;
    background: transparent; color: inherit; font: inherit; cursor: pointer;
    display: inline-grid; place-items: center;
  }
  .mw-calendar__day:hover, .mw-calendar td span:hover { background: var(--nav-hover); color: var(--ink); }
  .mw-calendar__day:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--focus) 72%, transparent),
      0 0 0 3.5px color-mix(in srgb, var(--focus) 15%, transparent);
  }
  .mw-calendar__outside { color: var(--faint); }
  .mw-calendar td[aria-current="date"]:not(.is-selected) .mw-calendar__day,
  .mw-calendar td[aria-current="date"]:not(.is-selected) span {
    background: transparent; color: var(--ink); font-weight: 400;
    box-shadow: inset 0 0 0 1px var(--action);
  }
  .mw-calendar td.is-selected .mw-calendar__day,
  .mw-calendar td.is-selected span { background: var(--action); color: var(--action-ink); font-weight: 400; box-shadow: none; }
  .mw-date-picker { display: grid; gap: 8px; width: min(252px, 100%); position: relative; }
  .mw-date-picker__popup { display: none; position: absolute; top: calc(100% + 6px); z-index: 8; padding: 10px; border: 1px solid var(--hairline, var(--control-border)); border-radius: var(--radius-surface, 12px); background: var(--paper); box-shadow: var(--control-shadow); }
  .mw-date-picker__popup.is-open { display: grid; }

  dialog.mw-drawer { padding: 0; border: 0; background: var(--paper); color: var(--ink); box-shadow: none; }
  dialog.mw-drawer::backdrop { background: color-mix(in srgb, var(--ink) 10%, transparent); }
  dialog.mw-drawer--left { position: fixed; inset: 0 auto 0 0; margin: 0; width: min(320px, 100vw); height: 100dvh; max-height: 100dvh; border-right: 1px solid var(--line); border-radius: 0; }
  dialog.mw-drawer--right { position: fixed; inset: 0 0 0 auto; margin: 0; width: min(320px, 100vw); height: 100dvh; max-height: 100dvh; border-left: 1px solid var(--line); border-radius: 0; }
  dialog.mw-drawer--bottom { position: fixed; inset: auto 0 0; margin: 0; width: 100vw; height: min(70dvh, 480px); border-top: 1px solid var(--hairline, var(--line)); border-radius: 16px 16px 0 0; }
  .mw-drawer__shell { height: 100%; }
  .mw-menu--context { min-width: 220px; }
  .mw-preview-card {
    width: min(280px, 100%); padding: 12px 14px; border: 1px solid var(--hairline, var(--control-border));
    border-radius: var(--radius-surface, 12px); background: var(--paper); box-shadow: var(--control-shadow);
  }
  .mw-preview-card strong { display: block; font-size: 13px; }
  .mw-preview-card p { margin: 6px 0 0; color: var(--muted); font-size: 12px; line-height: 1.5; }

  .mw-pagination { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .mw-pagination__page {
    min-height: 28px; min-width: 28px; padding: 0 8px; border: 1px solid transparent;
    border-radius: 8px; background: transparent; color: var(--ink-soft); font: inherit;
  }
  .mw-pagination__page:hover { background: var(--nav-hover); color: var(--ink); }
  .mw-pagination__page:disabled { opacity: .42; cursor: not-allowed; }
  .mw-pagination__page.is-current { background: var(--nav-active); color: var(--ink); font-weight: 400; }
  .mw-breadcrumb ol { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; color: var(--muted); font-size: 12px; }
  .mw-breadcrumb li:not(:last-child)::after { content: "/"; margin-left: 6px; color: var(--faint); }
  .mw-breadcrumb a { color: var(--ink-soft); text-decoration: none; }
  .mw-breadcrumb a:hover { color: var(--ink); }
  .mw-breadcrumb [aria-current="page"] { color: var(--ink); }

  .mw-sidebar { min-height: 0; min-width: 0; }
  .mw-sidebar__body { min-height: 0; }
  .mw-frame { min-height: 0; }
  .mw-frame__panel { min-height: 0; }
  .mw-group { display: inline-flex; align-items: center; gap: 2px; padding: 2px; }
  .mw-catalog-shell {
    display: grid; grid-template-columns: 48px 240px minmax(0, 1fr);
    height: 440px; width: 100%; overflow: hidden;
    background: var(--nav-bg, var(--rail)); border: 1px solid var(--hairline, var(--line));
    border-radius: var(--radius-surface, 12px);
  }
  .mw-catalog-shell > [data-primitive] { display: contents; }
  .mw-catalog .mw-sidebar {
    display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%;
    overflow: hidden; color: var(--ink);
  }
  .mw-catalog .mw-sidebar--rail {
    width: 48px; padding: 8px 0 10px;
    background: var(--nav-bg); border-right: 1px solid var(--line);
  }
  .mw-catalog .mw-sidebar--rail .mw-sidebar__body {
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    padding: 0 6px; overflow: hidden;
  }
  .mw-catalog .mw-sidebar--rail .mw-btn {
    width: 36px; min-width: 36px; height: 32px; min-height: 32px; padding: 0;
    border: 0; border-radius: 8px; background: transparent; color: var(--faint);
    box-shadow: none;
  }
  .mw-catalog .mw-sidebar--rail .mw-btn svg { width: 18px; height: 18px; color: inherit; }
  .mw-catalog .mw-sidebar--rail .mw-btn:hover:not(:disabled) {
    background: var(--nav-hover); color: var(--ink-soft);
  }
  .mw-catalog .mw-sidebar--rail .mw-btn[aria-current="page"] {
    background: var(--nav-active); color: var(--plugin-tint, var(--ink));
  }
  .mw-catalog .mw-sidebar--directory {
    width: 240px; background: var(--nav-bg, var(--rail));
    border-right: 1px solid var(--line);
  }
  .mw-catalog .mw-sidebar__header {
    min-height: 36px; padding: 10px 12px 8px; font-size: 13px; font-weight: 400;
  }
  .mw-catalog .mw-sidebar__footer { padding: 8px 6px 12px; }
  .mw-catalog .mw-sidebar__body { flex: 1; min-height: 0; }
  .mw-catalog .mw-sidebar--directory .mw-sidebar__body {
    display: flex; flex-direction: column; overflow: hidden; padding: 0;
  }
  .mw-catalog .mw-sidebar--directory .mw-dir {
    flex: 1; min-height: 0; padding: 8px 8px 12px; overflow: auto;
  }
  .mw-catalog .mw-frame {
    display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%;
    background: var(--paper);
  }
  .mw-catalog .mw-frame__header {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 24px;
    padding: 20px 28px 6px;
  }
  .mw-catalog .mw-frame__heading { min-width: 0; }
  .mw-catalog .mw-frame__heading h2 {
    margin: 0; color: var(--ink); font-size: 16px; font-weight: 400; letter-spacing: -.015em; line-height: 22px;
  }
  .mw-catalog .mw-frame__heading p { margin: 6px 0 0; color: var(--muted); font-size: 12px; line-height: 16px; }
  .mw-catalog .mw-frame__action { flex: none; padding-top: 2px; }
  .mw-catalog .mw-frame__action .mw-btn {
    min-height: 0; padding: 0; border: 0; border-radius: 0;
    background: transparent; color: var(--muted); font-weight: 400; box-shadow: none;
  }
  .mw-catalog .mw-frame__action .mw-btn:hover:not(:disabled) {
    background: transparent; color: var(--ink); text-decoration: underline; text-underline-offset: 3px;
  }
  .mw-catalog .mw-frame__panel {
    flex: 1; min-height: 0; overflow: auto; padding: 10px 28px 28px;
    color: var(--ink-soft); font-size: 13px; line-height: 1.65;
  }
  .mw-catalog .mw-frame__panel p { margin: 0 0 12px; max-width: 52ch; }
  .mw-catalog .mw-frame__panel p:last-child { margin-bottom: 0; }
  .mw-catalog .mw-frame__footer { padding: 8px 28px 20px; }
  .mw-card {
    display: grid; border: 1px solid var(--hairline, var(--line));
    border-radius: var(--radius-surface, 12px);
    background: var(--paper); overflow: hidden;
  }
  .mw-card__header { display: flex; justify-content: space-between; gap: 12px; padding: 16px 16px 0; }
  .mw-card__title { margin: 0; font-size: 14px; font-weight: 400; }
  .mw-card__description { margin: 4px 0 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
  .mw-card__panel { padding: 10px 16px 16px; color: var(--ink-soft); font-size: 13px; line-height: 1.6; }
  .mw-card__footer { padding: 0 16px 16px; color: var(--muted); font-size: 12px; }
  .mw-card--tile {
    border: 0; background: transparent; overflow: visible; width: auto; display: block;
  }
  .mw-scroll { overflow: auto; min-height: 0; scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
  .mw-table-wrap {
    overflow: auto; border: 1px solid var(--hairline, var(--line));
    border-radius: var(--radius-surface, 12px); background: var(--paper);
  }
  .mw-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .mw-table th, .mw-table td { padding: 10px 14px; border: 0; text-align: left; }
  .mw-table th { color: var(--muted); font-size: 11px; font-weight: 400; letter-spacing: .02em; }
  .mw-table thead th { padding-bottom: 8px; }
  .mw-catalog .mw-card { width: min(280px, 100%); }
  .mw-catalog .mw-table-wrap { width: min(520px, 100%); }
  .mw-catalog-scroll {
    max-height: 140px; width: 240px; padding: 10px 12px;
    border: 1px solid var(--hairline, var(--line));
    border-radius: var(--radius-surface, 12px);
    background: var(--paper); color: var(--ink-soft); font-size: 13px; line-height: 1.6;
  }
  .mw-catalog-scroll p { margin: 0 0 10px; }
  .mw-catalog-scroll p:last-child { margin-bottom: 0; }

  .mw-catalog {
    display: grid; gap: 48px; padding: 32px 40px 96px;
    max-width: 1120px; margin: 0 auto;
  }
  .mw-catalog__section h2 {
    margin: 0 0 16px; font-size: 13px; font-weight: 400; letter-spacing: -.01em;
    color: var(--ink);
  }
  .mw-catalog__section > .mw-catalog__hint { margin: 0 0 16px; }
  .mw-catalog__row, .mw-catalog__sizes { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .mw-catalog__specimens {
    display: grid; gap: 24px;
  }
  .mw-catalog__specimen { display: grid; gap: 10px; min-width: 0; }
  .mw-catalog__specimen figcaption,
  .mw-catalog__specimen > span {
    margin: 0; color: var(--muted); font-size: 11px; font-weight: 400; letter-spacing: .02em;
  }
  .mw-catalog [data-primitive="menu"] .mw-menu,
  .mw-catalog [data-primitive="context-menu"] .mw-menu {
    position: static; display: grid;
  }
  .mw-catalog dialog.mw-command {
    position: static; display: grid; width: min(420px, 100%);
    max-height: none; margin: 0; opacity: 1; transform: none;
  }
  .mw-catalog .mw-popover { position: static; display: grid; inset: auto; }
  .mw-catalog__section[data-primitive="field"] .mw-catalog__row,
  .mw-catalog__section[data-primitive="form"] .mw-catalog__row {
    display: grid; gap: 14px; max-width: 520px;
  }
  .mw-catalog-form { height: auto; border: 1px solid var(--hairline, var(--line)); border-radius: var(--radius-surface, 12px); overflow: hidden; background: var(--paper); }
  .mw-catalog-form .mw-form__body { max-height: 220px; }
  .mw-catalog__hint { width: 100%; margin: 0; color: var(--muted); font-size: 13px; }
  .mw-swatch-row { display: flex; flex-wrap: wrap; gap: 12px 16px; }
  .mw-swatch {
    display: grid; grid-template-columns: 36px minmax(0, 1fr); grid-template-rows: auto auto;
    column-gap: 8px; align-items: center; min-width: 108px;
  }
  .mw-swatch__chip {
    grid-row: 1 / span 2; width: 36px; height: 36px; border-radius: 8px;
    box-shadow: inset 0 0 0 1px var(--hairline, var(--line));
  }
  .mw-swatch__fill {
    display: none;
  }
  .mw-swatch:has(.mw-swatch__fill) {
    grid-template-columns: 36px 10px minmax(0, 1fr);
  }
  .mw-swatch:has(.mw-swatch__fill) .mw-swatch__fill {
    display: block; grid-column: 2; grid-row: 1 / span 2; width: 8px; height: 36px;
    border-radius: 4px;
  }
  .mw-swatch:has(.mw-swatch__fill) span,
  .mw-swatch:has(.mw-swatch__fill) small { grid-column: 3; }
  .mw-swatch span {
    grid-column: 2; color: var(--ink); font-size: 12px; font-weight: 400; line-height: 16px;
  }
  .mw-swatch small {
    grid-column: 2; color: var(--faint); font-size: 11px; font-weight: 400; line-height: 14px;
  }
  .mw-icon-lib { display: grid; gap: 28px; }
  .mw-icon-lib__group h3 {
    margin: 0 0 8px; color: var(--faint); font-size: 11px; font-weight: 400; letter-spacing: .02em;
  }
  .mw-icon-lib ul {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
    gap: 2px; margin: 0; padding: 0; list-style: none;
  }
  .mw-icon-lib li {
    display: flex; align-items: center; gap: 8px; min-height: 32px; padding: 0 8px;
    border-radius: 8px; color: var(--ink-soft);
  }
  .mw-icon-lib li:hover { background: var(--nav-hover); color: var(--ink); }
  .mw-icon-lib svg { width: 16px; height: 16px; flex: none; color: var(--ink); }
  .mw-icon-lib span { font-size: 12px; font-weight: 400; }
  .mw-type-sample {
    display: grid; gap: 10px; width: min(560px, 100%);
    padding: 22px 24px; border-radius: var(--radius-surface, 12px);
    background: var(--paper); box-shadow: inset 0 0 0 1px var(--line);
  }
  .mw-type-sample p { margin: 0; font-weight: 400; }
  .mw-type-sample__latin {
    color: var(--ink); font-size: 22px; letter-spacing: -.02em; line-height: 1.3;
  }
  .mw-type-sample__zh {
    color: var(--ink-soft); font-size: 18px; letter-spacing: -.01em; line-height: 1.4;
  }
  .mw-type-sample__mix {
    color: var(--muted); font-size: 13px; line-height: 1.5;
  }
  html:has(> body.mw-catalog-page),
  body.mw-catalog-page.settings-page {
    height: 100dvh; max-height: 100dvh; overflow: hidden;
  }
  body.mw-catalog-page {
    margin: 0; background: var(--page); color: var(--ink);
    display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0;
  }
  body.mw-catalog-page .mw-catalog {
    min-height: 0; overflow: auto; overscroll-behavior: contain;
  }
  .mw-catalog-top {
    display: flex; justify-content: space-between; align-items: center; gap: 16px;
    padding: 14px 32px; border-bottom: 1px solid var(--line); background: var(--paper);
  }
  .mw-catalog-top h1 { margin: 0; font-size: 16px; font-weight: 400; }
  .mw-catalog-top p { margin: 4px 0 0; color: var(--muted); font-size: 12px; }

  .mw-dir { display: flex; flex-direction: column; min-width: 0; }
  .mw-dir__tools {
    display: flex; align-items: center; gap: 2px;
    min-height: 28px; padding: 0 4px 6px;
  }
  .mw-dir__label {
    flex: 1; min-width: 0; padding: 0 6px;
    overflow: hidden; color: var(--ink);
    font-size: 13px; font-weight: 400; line-height: 28px;
    text-overflow: ellipsis; white-space: nowrap;
  }
  .mw-dir__tools .mw-btn {
    width: 28px; min-width: 28px; min-height: 28px; padding: 0;
    border-color: transparent; background: transparent; color: var(--faint);
  }
  .mw-dir__tools .mw-btn:hover:not(:disabled) { color: var(--ink); background: var(--nav-hover); }
  .mw-dir__heading {
    margin: 0; padding: 10px 8px 4px; color: var(--faint);
    font-size: 11px; font-weight: 400; letter-spacing: .02em; line-height: 16px;
  }
  .mw-dir__heading:first-child { padding-top: 4px; }
  .mw-dir__list, .mw-dir__body { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .mw-dir .mw-empty { padding: 18px 10px; }
  .mw-dir-row-wrap {
    position: relative; min-width: 0;
    display: grid; grid-template-columns: minmax(0, 1fr);
    align-items: stretch; border-radius: var(--radius-item, 8px);
    transition: background-color 180ms var(--ease-out, cubic-bezier(.16, 1, .3, 1));
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
    min-height: 28px;
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
      background-color 180ms var(--ease-out, cubic-bezier(.16, 1, .3, 1)),
      color 180ms var(--ease-out, cubic-bezier(.16, 1, .3, 1));
  }
  body[data-desktop-shell="true"] .mw-dir-row:has(.mw-dir-row__icon),
  body.immersive-workbench .tree-pane .mw-dir-row:has(.mw-dir-row__icon),
  .mw-dir-row:has(.mw-dir-row__icon) { grid-template-columns: 16px minmax(0, 1fr); }
  .mw-dir-row--compact { height: 28px; min-height: 28px; }
  .mw-dir-row-wrap:has(> .mw-dir-row--nested) { padding-left: 16px; }
  .mw-dir-row--nested:not(.mw-dir-row-wrap .mw-dir-row--nested) { padding-left: 24px; }
  .mw-dir-row--meta {
    height: 36px; min-height: 36px; align-items: center; padding-block: 2px;
  }
  .mw-dir-row--meta:has(.mw-dir-row__icon) { align-items: start; }
  .mw-dir-row:hover { color: var(--ink); background: var(--nav-hover); }
  .mw-dir-row:active { background: var(--nav-press); }
  .mw-dir-row.is-selected,
  .mw-dir-row[aria-current="page"] {
    color: var(--ink);
    background: var(--nav-active);
  }
  .mw-dir-row.is-selected::before,
  .mw-dir-row[aria-current="page"]::before {
    content: "";
    position: absolute; left: 0; top: 6px; bottom: 6px; width: 2px;
    border-radius: 1px; background: var(--ink);
  }
  .mw-dir-row:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--focus) 72%, transparent),
      0 0 0 3.5px color-mix(in srgb, var(--focus) 15%, transparent);
  }
  .mw-dir-row.is-selected .mw-dir-row__copy strong,
  .mw-dir-row[aria-current="page"] .mw-dir-row__copy strong {
    color: var(--ink); font-weight: 400;
  }
  .mw-dir-row.is-selected .mw-dir-row__icon,
  .mw-dir-row[aria-current="page"] .mw-dir-row__icon { color: var(--plugin-tint, var(--ink-soft)); }
  .mw-dir-row.is-selected .mw-dir-row__copy small,
  .mw-dir-row[aria-current="page"] .mw-dir-row__copy small { color: var(--muted); }
  .mw-dir-row__icon {
    width: 16px; height: 16px; color: var(--plugin-tint, var(--faint));
    display: grid; place-items: center;
  }
  .mw-dir-row__icon svg { width: 15px; height: 15px; }
  .mw-dir-row--meta .mw-dir-row__icon { margin-top: 2px; }
  .mw-dir-row__copy {
    min-width: 0; overflow: hidden; display: grid; align-content: center; column-gap: 10px;
  }
  .mw-dir-row--compact .mw-dir-row__copy {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }
  .mw-dir-row--compact .mw-dir-row__headline { display: contents; }
  .mw-dir-row--meta .mw-dir-row__copy { grid-template-rows: 18px 14px; }
  .mw-dir-row__headline {
    min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto auto;
    column-gap: 8px; align-items: center;
  }
  .mw-dir-row__copy strong {
    min-width: 0; overflow: hidden;
    color: inherit; font-size: 13px; font-weight: 400; line-height: 18px;
    text-overflow: ellipsis; white-space: nowrap;
    mask-image: linear-gradient(to right, #000 0%, #000 calc(100% - 12px), transparent 100%);
    -webkit-mask-image: linear-gradient(to right, #000 0%, #000 calc(100% - 12px), transparent 100%);
  }
  .mw-dir-row__copy strong:has(.mw-dir-row__stem) {
    display: flex; text-overflow: clip;
    mask-image: none; -webkit-mask-image: none;
  }
  .mw-dir-row__stem {
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .mw-dir-row__ext { flex: none; }
  .mw-dir-row--meta .mw-dir-row__copy small {
    min-width: 0; max-width: 100%; overflow: hidden;
    color: var(--faint); font-size: 12px; font-weight: 400; line-height: 14px;
    text-overflow: ellipsis; white-space: nowrap;
  }
  .mw-dir-row__count {
    min-width: 0; color: var(--faint);
    font-size: 12px; font-weight: 400; line-height: 18px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .mw-dir-row .mw-dir-row__status {
    justify-self: end; align-self: center; flex: none; gap: 4px;
    min-height: 0; padding: 0; border: 0; border-radius: 0;
    background: transparent; color: var(--status-tone, var(--faint));
    font-size: 12px; font-weight: 400; line-height: 16px;
  }
  .mw-dir-row .mw-dir-row__status svg { width: 12px; height: 12px; color: inherit; }
  .mw-dir-row.is-selected .mw-dir-row__status,
  .mw-dir-row[aria-current="page"] .mw-dir-row__status { color: var(--status-tone, var(--muted)); }
  .mw-dir-row-wrap:hover { background: var(--nav-hover); }
  .mw-dir-row-wrap:active { background: var(--nav-press); }
  .mw-dir-row-wrap:hover .mw-dir-row,
  .mw-dir-row-wrap:active .mw-dir-row { color: var(--ink); background: transparent; }
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
  .mw-dir-row-wrap .mw-dir-row { width: 100%; min-width: 0; }
  .mw-dir-row-wrap > :not(.mw-dir-row) {
    position: static; transform: none; align-self: center; justify-self: center;
    display: grid; place-items: center;
  }
  .mw-dir-row-wrap.is-yield .mw-dir-row {
    transition:
      background-color 180ms var(--ease-out, cubic-bezier(.16, 1, .3, 1)),
      color 180ms var(--ease-out, cubic-bezier(.16, 1, .3, 1)),
      padding-right 180ms var(--ease-out, cubic-bezier(.16, 1, .3, 1));
  }
  .mw-dir-row-wrap.is-yield:is(:hover, :has(.is-selected), :has([aria-current="page"])) .mw-dir-row {
    padding-right: var(--dir-yield, 72px);
  }
  .mw-dir-row-wrap.is-yield .mw-dir-row__ops {
    position: absolute; right: 2px; top: 0; bottom: 0;
    display: flex; align-items: center; gap: 0;
    opacity: 0; pointer-events: none;
    background: var(--nav-hover);
    transition: opacity 180ms var(--ease-out, cubic-bezier(.16, 1, .3, 1));
  }
  .mw-dir-row-wrap.is-yield:has(.is-selected) .mw-dir-row__ops,
  .mw-dir-row-wrap.is-yield:has([aria-current="page"]) .mw-dir-row__ops { background: var(--nav-active); }
  .mw-dir-row-wrap.is-yield:is(:hover, :has(.is-selected), :has([aria-current="page"])) .mw-dir-row__ops {
    opacity: 1; pointer-events: auto;
  }
  .mw-dir-row-wrap.is-yield .mw-dir-row__ops .mw-btn {
    width: 22px; min-width: 22px; min-height: 22px;
  }
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
    width: 100%; margin-top: 6px; min-height: 28px; padding: 0 8px;
    border: 0; border-radius: var(--radius-item, 8px);
    color: var(--faint); background: transparent;
    font: inherit; font-size: 13px; font-weight: 400; text-align: left; cursor: pointer;
  }
  .mw-dir > [data-slot="directory-add"]:first-child,
  .mw-dir__tools + [data-slot="directory-add"] {
    margin-top: 0; margin-bottom: 4px;
  }
  .mw-dir__add svg { width: 14px; height: 14px; flex: none; color: var(--muted); }
  .mw-dir__add:hover { color: var(--ink); background: var(--nav-hover); }
  .mw-dir__footer { display: none; }
  .mw-catalog-dir-stage {
    width: 240px; min-height: 280px; overflow: hidden;
    background: var(--nav-bg, var(--rail)); border: 1px solid var(--hairline, var(--line));
    border-radius: var(--radius-surface, 12px);
  }
  .mw-catalog-dir-stage.is-yield { width: 213px; }
  .mw-catalog-dir {
    min-height: 280px; padding: 8px;
    border: 0; background: transparent;
  }
  .mw-dir .mw-empty h1, .mw-dir .mw-empty h2, .mw-dir .mw-empty strong {
    font-size: 13px; font-weight: 400; color: var(--ink-soft);
  }
  .mw-dir .mw-empty p { font-size: 12px; line-height: 1.55; color: var(--muted); }

  @keyframes mw-spin { to { transform: rotate(360deg); } }
  @media (max-width: 760px), (pointer: coarse) {
    .mw-form__footer .mw-btn:not(.mw-btn--icon-only), .mw-btn--lg { min-height: 44px; }
    .mw-input, .mw-textarea, .mw-select { font-size: 16px; }
    dialog.mw-sheet { inset: 0; width: 100vw; height: 100dvh; max-height: 100dvh; }
    dialog.mw-dialog--form { width: calc(100vw - 24px); max-height: calc(100dvh - 32px); }
    dialog.mw-dialog--form > .mw-form { max-height: calc(100dvh - 32px); }
    .mw-catalog { padding: 24px 16px 80px; gap: 40px; }
    .mw-catalog-top { padding: 12px 16px; }
    .mw-catalog-shell { grid-template-columns: 1fr; height: auto; min-height: 0; }
    .mw-catalog .mw-sidebar--rail {
      flex-direction: row; width: auto; height: 48px; padding: 0 8px;
      border-right: 0; border-bottom: 1px solid var(--line);
    }
    .mw-catalog .mw-sidebar--rail .mw-sidebar__body { flex-direction: row; }
    .mw-catalog .mw-sidebar--directory {
      width: auto; height: 220px; border-right: 0; border-bottom: 1px solid var(--line);
    }
    .mw-catalog .mw-frame { min-height: 220px; }
    .mw-catalog-dir-stage, .mw-catalog-dir { width: min(100%, 240px); max-width: 100%; }
  }
  @media (prefers-reduced-motion: reduce) {
    .mw-spinner, .mw-switch__track, .mw-switch__track::after { animation: none; transition: none; }
    .mw-dir-row, .mw-dir-row-wrap, .mw-dir-row-wrap.is-yield .mw-dir-row, .mw-dir-row-wrap.is-yield .mw-dir-row__ops { transition: none; }
  }
`;
