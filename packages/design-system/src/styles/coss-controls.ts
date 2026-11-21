/** Core Coss control and dialog/popover motion rules shared by plugin frames (102-1). */
export const PLUGIN_COSS_CONTROL_STYLES = `
  html[data-density="compact"] body.immersive-workbench { --control-h: 28px; }

  body { caret-color: var(--ink); }
  ::selection { background: var(--blue-soft); color: var(--ink); }
  :where(button, a, summary, input, select, textarea) { -webkit-tap-highlight-color: transparent; }
  :where(button, a, summary) { transition: background-color var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint), border-color var(--dur-hover) var(--ease-quint), box-shadow var(--dur-hover) var(--ease-quint); }
  :where(input, select, textarea) { accent-color: var(--action); }
  :where(button:disabled, [aria-disabled="true"]) { cursor: not-allowed; }

  .tree-create {
    height: var(--control-h);
    min-height: var(--control-h);
    border: 1px solid transparent;
    border-radius: var(--radius-control);
    background: var(--control-fill);
    color: var(--ink);
    box-shadow: none;
    font-weight: var(--weight-control, 500);
  }
  .tree-create:hover {
    background: var(--nav-hover);
    color: var(--ink);
  }

  .dialog-body input:not([type=checkbox]):not([type=radio]),
  .dialog-body textarea,
  .dialog-body select {
    min-height: var(--control-h);
    height: var(--control-h);
    padding: 0 12px;
    border: 1px solid var(--control-input);
    border-radius: var(--radius-control);
    color: var(--ink);
    background: var(--paper);
    box-shadow: none;
  }
  .dialog-body textarea {
    height: auto;
    min-height: 72px;
    padding: 8px 12px;
    resize: vertical;
  }
  kbd {
    display: inline-flex;
    align-items: center;
    min-height: 20px;
    padding: 0 8px;
    border: 1px solid var(--control-border);
    border-radius: 6px;
    background: var(--control-fill);
    color: var(--muted);
    font: 11px/20px ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  :where(button:not(:disabled), summary):active { filter: brightness(.94); }
  :where(input, textarea, select) { transition: border-color 130ms var(--ease-quint), box-shadow 130ms var(--ease-quint); }
  :where(dialog) { transition: opacity var(--dur-hover) var(--ease-quint), transform var(--dur-hover) var(--ease-quint), overlay var(--dur-hover) allow-discrete, display var(--dur-hover) allow-discrete; opacity: 0; transform: translateY(8px) scale(.98); }
  :where(dialog[open]) { opacity: 1; transform: none; transition-duration: var(--dur-move); }
  :where(dialog)::backdrop { background: var(--scrim); transition: opacity var(--dur-hover) var(--ease-quint), overlay var(--dur-hover) allow-discrete, display var(--dur-hover) allow-discrete; opacity: 0; }
  :where(dialog[open])::backdrop { opacity: 1; transition-duration: var(--dur-move); }
  @starting-style { :where(dialog[open]) { opacity: 0; transform: translateY(8px) scale(.98); } :where(dialog[open])::backdrop { opacity: 0; } }
  [popover]:popover-open { animation: craft-fade-in var(--dur-hover) var(--ease-quint); }
  .form-actions { --control-h: 36px; }
  .form-actions > button { min-height: 36px; }
  .feed-stage-leading strong { font-size: 13px; }
  [data-feed-task] { position: relative; }
  @media (max-width: 760px) {
    .mw-btn--primary, .mw-btn--secondary, .mw-btn--danger, .form-actions > button { min-height: 44px; }
    .form-actions { --control-h: 44px; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms; animation-iteration-count: 1; transition-duration: 0s; transition-delay: 0s; scroll-behavior: auto; }
    :where(dialog), :where(dialog)::backdrop { transform: none; transition: none; animation: none; }
    [popover]:popover-open { animation: none; }
  }
`;

/** Shared Coss surfaces and controls. Loaded last by each page renderer. */
export const COSS_CONTROL_STYLES = `
  html[data-density="compact"] :is(body.immersive-workbench, body.settings-page, body.project-preferences-page) { --control-h: 28px; }

  body { caret-color: var(--ink); }
  ::selection { background: var(--blue-soft); color: var(--ink); }
  :where(button, a, summary, input, select, textarea) { -webkit-tap-highlight-color: transparent; }
  :where(button, a, summary) { transition: background-color var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint), border-color var(--dur-hover) var(--ease-quint), box-shadow var(--dur-hover) var(--ease-quint); }
  :where(input, select, textarea) { accent-color: var(--action); }
  :where(button:disabled, [aria-disabled="true"]) { cursor: not-allowed; }

  /* Create and filter in a plugin toolbar are soft buttons: a wash, no outline, the control height. */
  body.immersive-workbench .tree-create,
  body.immersive-workbench [data-tree-filter-trigger] {
    height: var(--control-h);
    min-height: var(--control-h);
    border: 1px solid transparent;
    border-radius: var(--radius-control);
    background: var(--control-fill);
    color: var(--ink);
    box-shadow: none;
    font-weight: var(--weight-control, 500);
  }
  body.immersive-workbench .tree-create:hover,
  body.immersive-workbench [data-tree-filter-trigger]:is(:hover, .is-active, [aria-expanded="true"]) {
    background: var(--nav-hover);
    color: var(--ink);
  }
  body.immersive-workbench [data-tree-filter-trigger] {
    width: var(--control-h);
    min-width: var(--control-h);
    padding: 0;
    display: inline-grid;
    place-items: center;
    flex: none;
  }
  body.immersive-workbench [data-tree-filter-trigger] > span { display: none; }
  body.immersive-workbench [data-tree-filter-trigger] svg { width: 14px; height: 14px; color: inherit; }

  .frame-picker-tools input,
  .frame-picker-tools select,
  .inline-settings-form input[type=text],
  .project-settings-identity .inline-settings-form input[type=text],
  .connection-action-form input,
  .connection-action-form select,
  .dialog-body input:not([type=checkbox]):not([type=radio]),
  .dialog-body textarea,
  .dialog-body select,
  .runtime-plan-dialog input:not([type=checkbox]),
  .artifact-reference-label input,
  .artifact-content-reference input {
    min-height: var(--control-h);
    height: var(--control-h);
    padding: 0 12px;
    border: 1px solid var(--control-input);
    border-radius: var(--radius-control);
    color: var(--ink);
    background: var(--paper);
    box-shadow: none;
  }
  .dialog-body textarea {
    height: auto;
    min-height: 72px;
    padding: 8px 12px;
    resize: vertical;
  }

  .create-dialog,
  .runtime-plan-dialog,
  .project-delete-dialog {
    border: 1px solid var(--control-border);
    border-radius: var(--radius-surface);
    background: var(--paper);
    color: var(--ink);
    box-shadow: var(--control-shadow);
  }
  .create-dialog::backdrop,
  .runtime-plan-dialog::backdrop,
  .project-delete-dialog::backdrop {
    background: var(--scrim);
  }
  .navigator-project-menu-popover {
    border: 1px solid var(--control-border);
    border-radius: var(--radius-surface);
    box-shadow: var(--control-shadow);
  }
  kbd {
    display: inline-flex;
    align-items: center;
    min-height: 20px;
    padding: 0 8px;
    border: 1px solid var(--control-border);
    border-radius: 6px;
    background: var(--control-fill);
    color: var(--muted);
    font: 11px/20px ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  button:focus-visible:not([class^="mw-"]),
  input:focus-visible:not([class^="mw-"]),
  textarea:focus-visible:not([class^="mw-"]),
  select:focus-visible:not([class^="mw-"]),
  a:focus-visible:not([class^="mw-"]),
  summary:focus-visible:not([class^="mw-"]),
  body.immersive-workbench :focus-visible:not([class^="mw-"]),
  body.settings-page :focus-visible:not([class^="mw-"]) {
    outline: var(--focus-stroke);
    outline-offset: var(--focus-stroke-inset);
  }

  @media (max-width: 760px) {
    .mw-btn--primary,
    .mw-btn--secondary,
    .mw-btn--danger,
    .create-dialog footer button,
    .runtime-plan-shell > footer button {
      min-height: 44px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: 0s !important; transition-delay: 0s !important; scroll-behavior: auto !important; }
  }

  .form-disclosure summary { cursor: pointer; color: var(--ink-soft); font-size: 13px; font-weight: 400; padding: 8px 0; }
  [data-feed-task] { position: relative; }
  .form-disclosure { border-top: 1px solid var(--line); padding-top: 8px; margin-top: 12px; }
  .form-disclosure[open] > summary { margin-bottom: 12px; }
  .event-form-body > :is(label,fieldset) { margin: 0; }
  .event-form fieldset { border: 1px solid var(--line); border-radius: 8px; padding: 16px; }
  .event-form legend { color: var(--ink-soft); font-size: 13px; padding-inline: 4px; }
  .event-form :is(input,textarea,select):focus-visible:not([class^="mw-"]) { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
  .event-form-status:not([hidden]), .event-field-error:not([hidden]) { padding: 12px 12px; border-left: 2px solid currentColor; margin-block: 12px; font-size: 13px; line-height: 1.6; }
  .event-form-bottom .event-form-status:not([hidden]) { margin: 0 0 12px; border: 0; border-radius: 8px; background: var(--red-soft); }
  body.immersive-workbench .feed-stage-leading strong { font-size: 13px; }

  /* Motion communicates focus and feedback; moving panes remain under the pointer. */
  :where(button:not(:disabled), summary):active { filter: brightness(.94); }
  :where(input, textarea, select) { transition: border-color 130ms var(--ease-quint), box-shadow 130ms var(--ease-quint); }
  /* The one dialog motion (user 2026-10-21): in over 250ms from 8px below at .98, out the same way over 130ms. */
  :where(dialog) { transition: opacity var(--dur-hover) var(--ease-quint), transform var(--dur-hover) var(--ease-quint), overlay var(--dur-hover) allow-discrete, display var(--dur-hover) allow-discrete; opacity: 0; transform: translateY(8px) scale(.98); }
  :where(dialog[open]) { opacity: 1; transform: none; transition-duration: var(--dur-move); }
  :where(dialog)::backdrop { background: var(--scrim); transition: opacity var(--dur-hover) var(--ease-quint), overlay var(--dur-hover) allow-discrete, display var(--dur-hover) allow-discrete; opacity: 0; }
  :where(dialog[open])::backdrop { opacity: 1; transition-duration: var(--dur-move); }
  @starting-style { :where(dialog[open]) { opacity: 0; transform: translateY(8px) scale(.98); } :where(dialog[open])::backdrop { opacity: 0; } }
  [popover]:popover-open { animation: craft-fade-in var(--dur-hover) var(--ease-quint); }
  .mw-modal-cover[popover] { width: auto; height: auto; margin: 0; padding: 0; border: 0; background: var(--scrim); }
  :is(.form-error, .event-form-status, .event-field-error)[role=alert]:not([hidden]) { animation: craft-fade-in var(--dur-hover) var(--ease-quint); }
  .form-disclosure[open] { border-color: var(--line-strong); }
  .form-disclosure summary { transition: color var(--dur-hover) var(--ease-quint); }
  .form-disclosure summary:hover { color: var(--ink); }
  body.immersive-workbench .tab-item[aria-current] { box-shadow: inset 0 1px 0 color-mix(in srgb,var(--ink) 6%,transparent); }
  @media (prefers-reduced-motion: reduce) {
    :where(dialog), :where(dialog)::backdrop { transform: none; transition: none; animation: none; }
    [popover]:popover-open { animation: none; }
  }

  .project-preferences-page .settings-save-footer.form-actions { display: flex; flex-direction: row; align-items: center; justify-content: flex-end; gap: 8px; }
  .form-actions > button { min-height: 36px; }
  @media (max-width: 760px) { .form-actions > button { min-height: 44px; } }

  :is(.form-actions, .event-form-actions) { --control-h: 36px; }
  @media (max-width: 760px) { :is(.form-actions, .event-form-actions) { --control-h: 44px; } }
`;
