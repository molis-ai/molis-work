/** Shared Coss surfaces and controls. Loaded last by each page renderer. */
export const COSS_CONTROL_STYLES = `
  :root, body.immersive-workbench, body.settings-page, body.project-index-page {
    --page: #f7f7f8; --canvas: #f7f7f8; --rail: #f4f4f5;
    --paper: #ffffff; --panel: #ffffff; --nav-bg: #f7f7f8;
    --ink: #202023; --text: #202023; --ink-soft: #515157;
    --muted: #65656d; --faint: #707078;
    --line: #e5e5e8; --line-strong: #d4d4d8;
    --nav-hover: #ededf0; --nav-active: #e8e8ec; --nav-raised: #ffffff;
    --blue: #5c5cc9; --blue-dark: #4848b0; --blue-soft: #eeeef9; --focus: #5c5cc9;
    --action: #252528; --action-ink: #ffffff;
    --surface-shadow: 0 1px 3px #18181b12, 0 1px 2px #18181b08;
    --motion-fast: 120ms; --motion-normal: 180ms; --ease-out: cubic-bezier(.16, 1, .3, 1);
    --radius-control: 8px;
    --radius-surface: 12px;
    --control-h: 32px;
    --control-pad-x: 12px;
    --control-border: color-mix(in srgb, var(--ink) 8%, transparent);
    --control-input: color-mix(in srgb, var(--ink) 10%, transparent);
    --control-fill: color-mix(in srgb, var(--ink) 4.5%, transparent);
    --control-fill-hover: color-mix(in srgb, var(--ink) 7.5%, transparent);
    --control-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 6%, transparent), 0 12px 32px color-mix(in srgb, var(--ink) 12%, transparent);
    --control-ring: color-mix(in srgb, var(--ink) 55%, transparent);
  }
  html[data-resolved-theme="dark"],
  html[data-resolved-theme="dark"] :is(body.immersive-workbench, body.settings-page, body.project-index-page) {
    --page: #141416; --canvas: #141416; --rail: #1c1c1f;
    --paper: #1c1c1f; --panel: #1c1c1f; --nav-bg: #171719;
    --ink: #f0f0f2; --text: #f0f0f2; --ink-soft: #c1c1c8;
    --muted: #a2a2ab; --faint: #9696a0;
    --line: #2d2d32; --line-strong: #414148;
    --nav-hover: #242428; --nav-active: #2b2b30; --nav-raised: #303035;
    --blue: #b1adf6; --blue-dark: #c4c1ff; --blue-soft: #2d2b43; --focus: #b1adf6;
    --action: #ededf0; --action-ink: #202023;
    --surface-shadow: 0 1px 3px #00000038, 0 1px 2px #00000024;
    --control-border: color-mix(in srgb, #fff 8%, transparent);
    --control-input: color-mix(in srgb, #fff 10%, transparent);
    --control-fill: color-mix(in srgb, #fff 5.5%, transparent);
    --control-fill-hover: color-mix(in srgb, #fff 9%, transparent);
    --control-shadow: 0 1px 2px rgba(0, 0, 0, .28), 0 16px 40px rgba(0, 0, 0, .38);
    --control-ring: color-mix(in srgb, #fff 60%, transparent);
  }
  body.immersive-workbench,
  body.settings-page,
  body.project-preferences-page { --control-h: 28px; }

  body { caret-color: var(--ink); }
  ::selection { background: var(--blue-soft); color: var(--ink); }
  :where(button, a, summary, input, select, textarea) { -webkit-tap-highlight-color: transparent; }
  :where(button, a, summary) { transition: background-color var(--motion-fast) ease, color var(--motion-fast) ease, border-color var(--motion-fast) ease, box-shadow var(--motion-fast) ease; }
  :where(input, select, textarea) { accent-color: var(--action); }
  :where(button:disabled, [aria-disabled="true"]) { cursor: not-allowed; }
  :where(dialog[open]) { animation: surface-arrive var(--motion-normal) var(--ease-out); }
  @keyframes surface-arrive { from { transform: translateY(6px) scale(.985); } to { transform: none; } }
  :where(.tree-scroll, .settings-body, .project-settings-stage, .tab-pane-body, .feed-detail-scroll, .goal-info-body) { scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }

  .button-primary,
  .goal-primary-action,
  .planning-primary-action,
  .project-index-create,
  .project-index-start a:first-child,
  .project-migration-submit,
  .project-manager-open,
  .project-manager .project-manager-create-form button,
  .runtime-plan-apply,
  .human-review-jump,
  .guidance-primary-action,
  .planning-edit-footer button[type="submit"],
  .tui-chrome .tui-advance:not(:disabled),
  .tui-menu-actions button[type="submit"],
  body[data-desktop-shell="true"] .source-now button:not(:disabled),
  body.immersive-workbench .feed-detail-actions .button-primary,
  body.immersive-workbench .feed-stage-add-actions .button-primary,
  body.immersive-workbench .home-shortcut-dialog .home-shortcut-save {
    min-height: var(--control-h) !important;
    padding: 0 var(--control-pad-x) !important;
    border: 1px solid var(--action) !important;
    border-radius: var(--radius-control) !important;
    background: var(--action) !important;
    color: var(--action-ink) !important;
    font-weight: 550 !important;
    box-shadow: none !important;
    transform: none !important;
  }
  .button-primary:hover,
  .goal-primary-action:hover,
  .planning-primary-action:hover,
  .project-index-create:hover,
  .project-index-start a:first-child:hover,
  .project-migration-submit:hover,
  .project-manager-open:hover,
  .project-manager .project-manager-create-form button:hover,
  .runtime-plan-apply:hover,
  .human-review-jump:hover,
  .guidance-primary-action:hover,
  .planning-edit-footer button[type="submit"]:hover,
  .tui-chrome .tui-advance:hover:not(:disabled),
  .tui-menu-actions button[type="submit"]:hover,
  body[data-desktop-shell="true"] .source-now button:hover:not(:disabled),
  body.immersive-workbench .feed-detail-actions .button-primary:hover,
  body.immersive-workbench .feed-stage-add-actions .button-primary:hover,
  body.immersive-workbench .home-shortcut-dialog .home-shortcut-save:hover {
    background: color-mix(in srgb, var(--action) 90%, var(--action-ink)) !important;
    color: var(--action-ink) !important;
    opacity: 1;
    transform: none !important;
  }
  .button-primary:disabled,
  .goal-primary-action:disabled,
  .project-migration-submit:disabled,
  .runtime-plan-apply:disabled,
  .guidance-primary-action:disabled,
  .planning-edit-footer button[type="submit"]:disabled,
  .tui-chrome .tui-advance:disabled,
  body[data-desktop-shell="true"] .source-now button:disabled {
    border-color: var(--control-border) !important;
    background: var(--control-fill) !important;
    color: var(--faint) !important;
    opacity: 1 !important;
  }
  .button-danger,
  .project-delete-button,
  .project-manager-danger-actions button[data-demo-action="remove"] {
    min-height: var(--control-h);
    padding: 0 var(--control-pad-x);
    border: 1px solid color-mix(in srgb, var(--red) 55%, var(--control-border));
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--red) 8%, var(--paper));
    color: var(--red);
    font-weight: 550;
  }
  .button-danger:hover,
  .project-delete-button:hover,
  .project-manager-danger-actions button[data-demo-action="remove"]:hover {
    background: color-mix(in srgb, var(--red) 14%, var(--paper));
  }

  .frame-picker footer .button,
  .frame-empty .button,
  .form-actions > button[type=reset],
  .event-form-actions > button:not(.primary),
  .settings-record-action button:not(.button-primary):not(.button-danger):not(.project-delete-button),
  .settings-button:not(.button-primary):not(.button-danger):not(.project-delete-button),
  .settings-action-section button:not(.button-primary):not(.button-danger):not(.project-delete-button),
  .settings-import-row button:not(.button-primary):not(.button-danger):not(.project-delete-button),
  .project-record-tools form button:not(.button-primary):not(.button-danger),
  .inline-settings-form button:not(.button-primary):not(.button-danger),
  .service-action-row button:not(.button-primary):not(.button-danger),
  .connection-action-form > button:not(.button-primary):not(.button-danger),
  .workspace-project-list form button:not(.button-primary):not(.button-danger),
  .runtime-plan-shell > footer button:not(.runtime-plan-apply):not(.button-primary):not(.button-danger),
  .create-dialog footer button:not(.button-primary):not(.button-danger),
  .project-operation-dialog footer button:not(.button-primary):not(.button-danger),
  .project-index-migrate,
  .project-manager-danger-actions button:not([data-demo-action="remove"]),
  .project-migration-form > footer button:not(.project-migration-submit),
  body[data-settings-section="projects"] .project-migration-form > footer button:not(.project-migration-submit),
  body.immersive-workbench .home-shortcut-dialog footer button:not(.home-shortcut-save):not(.home-shortcut-remove) {
    min-height: var(--control-h);
    padding: 0 var(--control-pad-x);
    border: 1px solid var(--control-border);
    border-radius: var(--radius-control);
    background: var(--control-fill);
    color: var(--ink);
    font-weight: 550;
    box-shadow: none;
  }
  .frame-picker footer .button:hover,
  .frame-empty .button:hover,
  .form-actions > button[type=reset]:hover,
  .event-form-actions > button:not(.primary):hover,
  .settings-record-action button:not(.button-primary):not(.button-danger):not(.project-delete-button):hover,
  .settings-button:not(.button-primary):not(.button-danger):not(.project-delete-button):hover,
  .settings-action-section button:not(.button-primary):not(.button-danger):not(.project-delete-button):hover,
  .settings-import-row button:not(.button-primary):not(.button-danger):not(.project-delete-button):hover,
  .project-record-tools form button:not(.button-primary):not(.button-danger):hover,
  .inline-settings-form button:not(.button-primary):not(.button-danger):hover,
  .service-action-row button:not(.button-primary):not(.button-danger):hover,
  .connection-action-form > button:not(.button-primary):not(.button-danger):hover,
  .runtime-plan-shell > footer button:not(.runtime-plan-apply):not(.button-primary):not(.button-danger):hover,
  .create-dialog footer button:not(.button-primary):not(.button-danger):hover,
  .project-operation-dialog footer button:not(.button-primary):not(.button-danger):hover,
  .project-index-migrate:hover,
  .project-manager-danger-actions button:not([data-demo-action="remove"]):hover,
  .project-migration-form > footer button:not(.project-migration-submit):hover,
  body[data-settings-section="projects"] .project-migration-form > footer button:not(.project-migration-submit):hover,
  body.immersive-workbench .home-shortcut-dialog footer button:not(.home-shortcut-save):not(.home-shortcut-remove):hover {
    border-color: var(--control-input);
    background: var(--control-fill-hover);
    color: var(--ink);
  }

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
  .project-migration-form input[type=text],
  .project-index-search input,
  .project-index-search input[type="search"],
  .artifact-reference-label input,
  .artifact-content-reference input,
  body.immersive-workbench .home-shortcut-dialog input {
    min-height: var(--control-h);
    height: var(--control-h);
    padding: 0 10px;
    border: 1px solid var(--control-input);
    border-radius: var(--radius-control);
    color: var(--ink);
    background: var(--paper);
    box-shadow: none;
  }
  .project-index-search input,
  .project-index-search input[type="search"] { padding-left: 32px; appearance: none; -webkit-appearance: none; }
  .project-migration-form input[type=text]:focus,
  body.immersive-workbench .home-shortcut-dialog input:focus {
    border-color: var(--control-input);
    outline: 0;
    box-shadow: none;
  }
  body[data-settings-section="projects"] .project-migration-form input[type=text]:focus-visible,
  .project-index-search input:focus-visible,
  .project-index-search input[type="search"]:focus-visible {
    outline: 2px solid var(--control-ring);
    outline-offset: 2px;
    border-color: var(--control-input);
  }
  .dialog-body textarea,
  .project-operation-dialog textarea {
    height: auto;
    min-height: 72px;
    padding: 8px 10px;
    resize: vertical;
  }

  .create-dialog,
  .runtime-plan-dialog,
  .project-delete-dialog,
  .project-migration-dialog,
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
  .project-migration-dialog::backdrop,
  .project-operation-dialog::backdrop,
  .home-shortcut-dialog::backdrop {
    background: color-mix(in srgb, #080910 38%, transparent);
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
    padding: 0 6px;
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

  button:focus-visible,
  input:focus-visible,
  textarea:focus-visible,
  select:focus-visible,
  a:focus-visible,
  summary:focus-visible,
  body.immersive-workbench :focus-visible,
  body.settings-page :focus-visible,
  body.project-index-page :focus-visible {
    outline: 2px solid var(--control-ring);
    outline-offset: 2px;
  }

  @media (max-width: 760px) {
    .settings-record-action button,
    .settings-button,
    .settings-action-section button,
    .create-dialog footer button,
    .project-operation-dialog footer button,
    .runtime-plan-shell > footer button,
    .button-primary,
    .goal-primary-action {
      min-height: 44px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }
  }

  /* Task configuration has one active path and a stable dialog shell. */
  body[data-desktop-shell="true"] .feed-task-dialog { width: min(620px, calc(100vw - 32px)); height: fit-content; min-height: 0; max-height: calc(100dvh - 48px); border: 1px solid var(--line); border-radius: 12px; }
  .feed-task-dialog-shell { display: flex; flex-direction: column; max-height: calc(100dvh - 50px); }
  .feed-task-dialog-shell > header { display: flex; align-items: start; justify-content: space-between; gap: 16px; padding: 24px 24px 18px; border-bottom: 1px solid var(--line); }
  .feed-task-dialog-shell h2 { margin: 0; font-size: 19px; letter-spacing: -.02em; }
  .feed-task-dialog-shell header p { margin: 6px 0 0; color: var(--muted); font-size: 13px; line-height: 1.6; }
  .feed-task-dialog-body { overflow-y: auto; min-height: 0; padding: 16px 24px 24px; }
  .feed-task-dialog-shell > footer { display: flex; gap: 8px; justify-content: end; border-top: 1px solid var(--line); padding: 12px 24px; }
  body[data-desktop-shell="true"] .feed-task-dialog button { min-height: 36px; font-size: 13px; font-weight: 500; padding: 0 12px; }
  .feed-task-dialog svg { width: 18px; height: 18px; flex: none; }
  body[data-desktop-shell="true"] .feed-task-dialog .feed-source-choice { width: 100%; display: grid; grid-template-columns: 32px 1fr 18px; text-align: left; align-items: center; gap: 12px; background: transparent; padding: 14px 8px; border-radius: 6px; }
  .feed-source-choice + .feed-source-choice { border-top: 1px solid var(--line) !important; }
  .feed-source-choice strong, .feed-source-choice small { display: block; }
  .feed-source-choice strong { color: var(--ink); font-size: 14px; font-weight: 600; }
  .feed-source-choice small { color: var(--muted); font-size: 12px; line-height: 1.55; margin-top: 4px; }
  .feed-task-dialog label { display: grid; gap: 7px; margin: 18px 0; font-size: 13px; }
  body[data-desktop-shell="true"] .feed-task-dialog label > span { font-size: 13px; font-weight: 500; color: var(--ink-soft); }
  body[data-desktop-shell="true"] .feed-task-dialog .button-primary { background: var(--action); color: var(--action-ink); border-color: transparent; }
  body[data-desktop-shell="true"] .feed-task-dialog :is(input:not([type=checkbox]),select,textarea) { width: 100%; min-width: 0; min-height: 38px; padding: 9px 11px; font: inherit; font-size: 14px; color: var(--ink); background: var(--paper); border: 1px solid var(--line); border-radius: 6px; }
  .feed-task-dialog label small, .feed-setup-hint { color: var(--muted); font-size: 12px; line-height: 1.6; }
  .feed-task-extra { border-top: 1px solid var(--line); margin-top: 20px; padding-top: 16px; }
  .feed-task-extra summary, .form-disclosure summary { cursor: pointer; color: var(--ink-soft); font-size: 13px; font-weight: 500; padding: 8px 0; }
  .feed-task-dialog .check-row { display: flex; align-items: center; gap: 8px; }
  .feed-task-health { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; color: var(--muted); }
  .feed-task-health strong { color: var(--ink); font-weight: 500; }
  .feed-config-actions, .feed-task-controls { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
  [data-feed-task] { position: relative; }
  [data-feed-task] .feed-source-task { padding-right: 36px !important; }
  .feed-task-config-trigger { position: absolute; right: 5px; top: 50%; transform: translateY(-50%); display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; background: transparent; color: var(--muted); border-radius: 5px; cursor: pointer; }
  .feed-task-config-trigger:hover { color: var(--ink); background: var(--nav-hover); }
  .feed-task-config-trigger svg { width: 15px; height: 15px; }
  .feed-directory-advanced { width: 100%; border: 0; background: transparent; text-align: left; color: var(--muted); font-size: 12px; padding: 12px 16px; cursor: pointer; }
  .form-disclosure { border-top: 1px solid var(--line); padding-top: 8px; margin-top: 12px; }
  .form-disclosure[open] > summary { margin-bottom: 12px; }
  .form-disclosure .goal-choice-list { max-height: 230px; overflow-y: auto; }
  .event-form-body > :is(label,fieldset) { margin: 0; }
  .event-form fieldset { border: 1px solid var(--line); border-radius: 8px; padding: 16px; }
  .event-form legend { color: var(--ink-soft); font-size: 13px; padding-inline: 5px; }
  .event-form :is(input,textarea,select):focus-visible { outline: 2px solid var(--ink-soft); outline-offset: 2px; }
  .event-form-status:not([hidden]), .event-field-error:not([hidden]) { padding: 10px 12px; border-left: 2px solid currentColor; margin-block: 12px; font-size: 13px; line-height: 1.6; }
  body.immersive-workbench .goal-event-document .event-form { width: min(100%, 780px); box-sizing: border-box; align-self: center; gap: 0; padding: 0; overflow: hidden; }
  .event-form-bottom .event-form-status:not([hidden]) { margin: 0 0 10px; border: 0; border-radius: 8px; background: var(--red-soft); }
  body.immersive-workbench .goal-event-document .event-form > [data-event-back] { display: none; }
  body.immersive-workbench .goal-event-document .event-form :is(label > span, legend) { font-size: 13px; }
  body.immersive-workbench .goal-event-document .event-form :is(.form-lead,.form-note,small) { font-size: 13px; line-height: 1.65; }
  body.immersive-workbench .goal-event-document .event-form button[type=submit] { align-self: flex-start; width: auto; min-height: 36px; background: var(--action); color: var(--action-ink); padding-inline: 16px; border-radius: 7px; }
  body.immersive-workbench .feed-stage-entry-copy strong { font-size: 14px; }
  body.immersive-workbench .feed-stage-entry-copy > p { font-size: 12px; line-height: 1.6; }
  @media (max-width: 640px) {
    body[data-desktop-shell="true"] .feed-task-dialog { width: calc(100vw - 16px); max-height: calc(100dvh - 16px); }
    .feed-task-dialog-shell { max-height: calc(100dvh - 18px); }
    .feed-task-dialog-shell > header, .feed-task-dialog-body { padding: 18px; }
    body[data-desktop-shell="true"] .feed-task-dialog button { min-height: 44px; }
    .feed-task-health { flex-direction: column; gap: 4px; }
    body.immersive-workbench .goal-event-document .event-form { padding: 0; }
    body.immersive-workbench .goal-event-document .event-form button[type=submit] { min-height: 44px; }
  }

  /* Motion communicates focus and feedback; moving panes remain under the pointer. */
  :where(button:not(:disabled), summary, .settings-button):active { filter: brightness(.94); }
  :where(input, textarea, select) { transition: border-color 120ms ease, box-shadow 120ms ease; }
  :where(dialog) { transition: opacity 120ms ease, transform 160ms var(--ease-out), overlay 160ms allow-discrete, display 160ms allow-discrete; opacity: 0; transform: scale(.985); }
  :where(dialog[open]) { opacity: 1; transform: none; }
  :where(dialog)::backdrop { background: #0006; transition: opacity 160ms ease, overlay 160ms allow-discrete, display 160ms allow-discrete; opacity: 0; }
  :where(dialog[open])::backdrop { opacity: 1; }
  @starting-style { :where(dialog[open]) { opacity: 0; transform: scale(.985); } :where(dialog[open])::backdrop { opacity: 0; } }
  [popover]:popover-open { animation: feedback-reveal 160ms ease-out; }
  :is([data-toast], [data-settings-toast]).is-visible { animation: feedback-reveal 160ms ease-out; }
  :is(.form-error, .event-form-status, .event-field-error)[role=alert]:not([hidden]) { animation: feedback-reveal 140ms ease-out; }
  .form-disclosure[open] { border-color: var(--line-strong); }
  :is(.form-disclosure, .feed-task-extra) summary { transition: color 120ms ease; }
  :is(.form-disclosure, .feed-task-extra) summary:hover { color: var(--ink); }
  body.immersive-workbench .tab-item[aria-current] { box-shadow: inset 0 1px 0 color-mix(in srgb,var(--ink) 6%,transparent); }
  body.immersive-workbench .tab-pane[data-drop-preview]::after { animation: split-target-reveal 120ms ease-out; }
  body.immersive-workbench .tab-sash:is(:hover,:active) { background: var(--blue); }
  @keyframes feedback-reveal { from { opacity: .35; } to { opacity: 1; } }
  @keyframes split-target-reveal { from { opacity: .35; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) {
    :where(dialog), :where(dialog)::backdrop { transform: none; transition: none; animation: none; }
    [popover]:popover-open, body.immersive-workbench .tab-pane[data-drop-preview]::after { animation: none; }
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
