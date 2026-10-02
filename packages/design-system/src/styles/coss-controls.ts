import { renderControlMetrics, renderShapeTokens, renderShellTokens } from "../palette.js";

/** Shared Coss surfaces and controls. Loaded last by each page renderer. */
export const COSS_CONTROL_STYLES = `
  :root, body.immersive-workbench, body.settings-page {
    ${renderShellTokens("light")}
    ${renderShapeTokens()}
    ${renderControlMetrics()}
  }
  html[data-resolved-theme="dark"],
  html[data-resolved-theme="dark"] :is(body.immersive-workbench, body.settings-page) {
    ${renderShellTokens("dark")}
  }
  html[data-density="compact"] :is(body.immersive-workbench, body.settings-page, body.project-preferences-page) { --control-h: 28px; }

  body { caret-color: var(--ink); }
  ::selection { background: var(--blue-soft); color: var(--ink); }
  :where(button, a, summary, input, select, textarea) { -webkit-tap-highlight-color: transparent; }
  :where(button, a, summary) { transition: background-color var(--motion-fast) var(--ease-quint), color var(--motion-fast) var(--ease-quint), border-color var(--motion-fast) var(--ease-quint), box-shadow var(--motion-fast) var(--ease-quint); }
  :where(input, select, textarea) { accent-color: var(--action); }
  :where(button:disabled, [aria-disabled="true"]) { cursor: not-allowed; }
  :where(dialog[open]) { animation: surface-arrive var(--motion-normal) var(--ease-quint); }
  @keyframes surface-arrive { from { transform: translateY(6px) scale(.985); } to { transform: none; } }
  :where(.tree-scroll, .settings-body, .project-settings-stage, .tab-pane-body, .feed-detail-scroll, .goal-info-body) { scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }

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
  .project-record-tools input,
  .connection-action-form input,
  .connection-action-form select,
  .dialog-body input:not([type=checkbox]):not([type=radio]),
  .dialog-body textarea,
  .dialog-body select,
  .project-operation-dialog input:not([type="checkbox"]),
  .project-operation-dialog select,
  .project-operation-dialog textarea,
  .runtime-plan-dialog input:not([type=checkbox]),
  .artifact-reference-label input,
  .artifact-content-reference input,
  body.immersive-workbench .home-shortcut-dialog input {
    min-height: var(--control-h);
    height: var(--control-h);
    padding: 0 12px;
    border: 1px solid var(--control-input);
    border-radius: var(--radius-control);
    color: var(--ink);
    background: var(--paper);
    box-shadow: none;
  }
  body.immersive-workbench .home-shortcut-dialog input:focus {
    border-color: var(--control-input);
    outline: 0;
    box-shadow: none;
  }
  .dialog-body textarea,
  .project-operation-dialog textarea {
    height: auto;
    min-height: 72px;
    padding: 8px 12px;
    resize: vertical;
  }

  .create-dialog,
  .runtime-plan-dialog,
  .project-delete-dialog,
  .project-operation-dialog,
  .home-shortcut-dialog {
    border: 1px solid var(--control-border);
    border-radius: var(--radius-surface);
    background: var(--paper);
    color: var(--ink);
    box-shadow: var(--control-shadow);
  }
  .create-dialog::backdrop,
  .runtime-plan-dialog::backdrop,
  .project-delete-dialog::backdrop,
  .project-operation-dialog::backdrop,
  .home-shortcut-dialog::backdrop {
    background: var(--scrim);
  }
  .navigator-project-menu-popover {
    border: 1px solid var(--control-border);
    border-radius: var(--radius-surface);
    box-shadow: var(--control-shadow);
  }
  .toast {
    border-radius: var(--radius-control);
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

  .preference-option {
    border-color: var(--control-border);
    border-radius: var(--radius-control);
  }
  .preference-option:hover {
    border-color: var(--control-input);
    background: var(--control-fill);
  }
  .preference-option[aria-pressed="true"],
  .preference-option[aria-current="true"] {
    border-color: var(--control-input);
    color: var(--ink);
    background: var(--control-fill-hover);
  }
  .preference-option[aria-pressed="true"] .preference-check,
  .preference-option[aria-current="true"] .preference-check { color: var(--ink); }

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
    .project-operation-dialog footer button,
    .runtime-plan-shell > footer button {
      min-height: 44px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: 0s !important; transition-delay: 0s !important; scroll-behavior: auto !important; }
  }

  /* Task configuration has one active path and a stable dialog shell. */
  .feed-task-dialog-shell { display: flex; flex-direction: column; max-height: calc(100dvh - 50px); }
  .feed-task-dialog-shell > header { display: flex; align-items: start; justify-content: space-between; gap: 16px; padding: 24px 24px 16px; border-bottom: 1px solid var(--line); }
  .feed-task-dialog-shell h2 { margin: 0; font-size: 20px; letter-spacing: -.02em; }
  .feed-task-dialog-shell header p { margin: 8px 0 0; color: var(--muted); font-size: 13px; line-height: 1.6; }
  .feed-task-dialog-body { overflow-y: auto; min-height: 0; padding: 16px 24px 24px; }
  .feed-task-dialog-shell > footer { display: flex; gap: 8px; justify-content: end; border-top: 1px solid var(--line); padding: 12px 24px; }
  [data-feed-source-choices] { display: flex; flex-direction: column; gap: 1px; margin: 0; padding: 0; border: 0; }
  .feed-source-choice__mark { display: grid; place-items: center; width: 16px; height: 16px; color: var(--muted); }
  .feed-source-choice__mark svg { width: 14px; height: 14px; }
  .feed-source-choice strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: var(--weight-control, 500); }
  .feed-source-choice small { color: var(--faint); font-size: 12px; line-height: 1; white-space: nowrap; }
  .feed-task-extra { border-top: 1px solid var(--line); margin-top: 24px; padding-top: 16px; }
  .feed-task-extra summary, .form-disclosure summary { cursor: pointer; color: var(--ink-soft); font-size: 13px; font-weight: 400; padding: 8px 0; }
  .feed-task-extra summary small { margin-left: 8px; color: var(--muted); font-weight: 400; }
  .feed-task-health { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; color: var(--muted); }
  .feed-task-health strong { color: var(--ink); font-weight: var(--weight-control, 500); }
  .feed-config-actions, .feed-task-controls { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
  [data-feed-task] { position: relative; }
  .feed-task-config-trigger { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; background: transparent; color: var(--muted); border-radius: 5px; cursor: pointer; }
  .feed-task-config-trigger:hover { color: var(--ink); background: var(--nav-hover); }
  .feed-task-config-trigger svg { width: 16px; height: 16px; }
  .form-disclosure { border-top: 1px solid var(--line); padding-top: 8px; margin-top: 12px; }
  .form-disclosure[open] > summary { margin-bottom: 12px; }
  .form-disclosure .goal-choice-list { max-height: 230px; overflow-y: auto; }
  .event-form-body > :is(label,fieldset) { margin: 0; }
  .event-form fieldset { border: 1px solid var(--line); border-radius: 8px; padding: 16px; }
  .event-form legend { color: var(--ink-soft); font-size: 13px; padding-inline: 4px; }
  .event-form :is(input,textarea,select):focus-visible:not([class^="mw-"]) { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
  .event-form-status:not([hidden]), .event-field-error:not([hidden]) { padding: 12px 12px; border-left: 2px solid currentColor; margin-block: 12px; font-size: 13px; line-height: 1.6; }
  body.immersive-workbench .goal-event-document .event-form { width: min(100%, 780px); box-sizing: border-box; align-self: center; gap: 0; padding: 0; overflow: hidden; }
  .event-form-bottom .event-form-status:not([hidden]) { margin: 0 0 12px; border: 0; border-radius: 8px; background: var(--red-soft); }
  body.immersive-workbench .goal-event-document .event-form > [data-event-back] { display: none; }
  body.immersive-workbench .goal-event-document .event-form :is(label > span, legend) { font-size: 13px; }
  body.immersive-workbench .goal-event-document .event-form :is(.form-lead,.form-note,small) { font-size: 13px; line-height: 1.65; }
  body.immersive-workbench .goal-event-document .event-form button[type=submit] { align-self: flex-start; width: auto; min-height: 36px; background: var(--action); color: var(--action-ink); padding-inline: 16px; border-radius: 7px; }
  body.immersive-workbench .feed-stage-leading strong { font-size: 13px; }
  @media (max-width: 640px) {
    .feed-task-dialog-shell { max-height: calc(100dvh - 18px); }
    .feed-task-dialog-shell > header, .feed-task-dialog-body { padding: 16px; }
    .feed-task-health { flex-direction: column; gap: 4px; }
    body.immersive-workbench .goal-event-document .event-form { padding: 0; }
    body.immersive-workbench .goal-event-document .event-form button[type=submit] { min-height: 44px; }
  }

  /* Motion communicates focus and feedback; moving panes remain under the pointer. */
  :where(button:not(:disabled), summary):active { filter: brightness(.94); }
  :where(input, textarea, select) { transition: border-color 130ms var(--ease-quint), box-shadow 130ms var(--ease-quint); }
  :where(dialog) { transition: opacity 130ms var(--ease-quint), transform 130ms var(--ease-quint), overlay 130ms allow-discrete, display 130ms allow-discrete; opacity: 0; transform: scale(.985); }
  :where(dialog[open]) { opacity: 1; transform: none; }
  :where(dialog)::backdrop { background: var(--scrim); transition: opacity 130ms var(--ease-quint), overlay 130ms allow-discrete, display 130ms allow-discrete; opacity: 0; }
  :where(dialog[open])::backdrop { opacity: 1; }
  @starting-style { :where(dialog[open]) { opacity: 0; transform: scale(.985); } :where(dialog[open])::backdrop { opacity: 0; } }
  [popover]:popover-open { animation: feedback-reveal 130ms var(--ease-quint); }
  :is([data-toast], [data-settings-toast]).is-visible { animation: feedback-reveal 130ms var(--ease-quint); }
  :is(.form-error, .event-form-status, .event-field-error)[role=alert]:not([hidden]) { animation: feedback-reveal 130ms var(--ease-quint); }
  .form-disclosure[open] { border-color: var(--line-strong); }
  :is(.form-disclosure, .feed-task-extra) summary { transition: color 130ms var(--ease-quint); }
  :is(.form-disclosure, .feed-task-extra) summary:hover { color: var(--ink); }
  body.immersive-workbench .tab-item[aria-current] { box-shadow: inset 0 1px 0 color-mix(in srgb,var(--ink) 6%,transparent); }
  @keyframes feedback-reveal { from { opacity: .35; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) {
    :where(dialog), :where(dialog)::backdrop { transform: none; transition: none; animation: none; }
    [popover]:popover-open { animation: none; }
  }

  .policy-form footer.form-actions, .project-preferences-page .settings-save-footer.form-actions, .feed-plan-actions { display: flex; flex-direction: row; align-items: center; justify-content: flex-end; gap: 8px; }
  .form-actions > button { min-height: 36px; }
  @media (max-width: 760px) { .form-actions > button, .feed-plan-actions > button { min-height: 44px; } }

  :is(.form-actions, .event-form-actions, .feed-reader-footer, .project-operation-dialog) { --control-h: 36px; }
  @media (max-width: 760px) { :is(.form-actions, .event-form-actions, .feed-reader-footer, .project-operation-dialog, .project-operation-surface-empty) { --control-h: 44px; } }
  @media (max-width: 760px), (pointer: coarse) {
    :is(.frame-picker, .frame-goal-actions, .frame-empty) { --control-h: 44px; }
    .frame-goal-actions button, .frame-empty button, .frame-picker > header button { min-height: 44px; }
    .frame-picker > header button { min-width: 44px; }
    .frame-picker-tools :is(input, select) { font-size: 16px; }
  }
`;
