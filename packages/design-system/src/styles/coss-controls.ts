/** Coss control language on Calm Desktop space. Must remain last in the cascade. */
export const COSS_CONTROL_STYLES = `
  /* Coss control language: buttons, fields, dialogs. Directory rows and poetic home stay as they are. */
  :root {
    --radius-control: 10px;
    --radius-surface: 12px;
    --control-h: 32px;
    --control-pad-x: 12px;
    --control-border: color-mix(in srgb, var(--ink) 8%, transparent);
    --control-input: color-mix(in srgb, var(--ink) 10%, transparent);
    --control-fill: color-mix(in srgb, var(--ink) 4.5%, transparent);
    --control-fill-hover: color-mix(in srgb, var(--ink) 7.5%, transparent);
    --control-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 6%, transparent), 0 12px 32px color-mix(in srgb, var(--ink) 12%, transparent);
    --control-ring: color-mix(in srgb, var(--ink) 28%, transparent);
  }
  html[data-resolved-theme="dark"] {
    --control-border: color-mix(in srgb, #fff 8%, transparent);
    --control-input: color-mix(in srgb, #fff 10%, transparent);
    --control-fill: color-mix(in srgb, #fff 5.5%, transparent);
    --control-fill-hover: color-mix(in srgb, #fff 9%, transparent);
    --control-shadow: 0 1px 2px rgba(0, 0, 0, .28), 0 16px 40px rgba(0, 0, 0, .38);
    --control-ring: color-mix(in srgb, #fff 32%, transparent);
  }

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
  body.immersive-workbench .feed-import-dialog footer .button-primary,
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
  body.immersive-workbench .feed-import-dialog footer .button-primary:hover,
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
  .feed-import-dialog footer button:not(.button-primary):not(.button-danger),
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
  .feed-import-dialog footer button:not(.button-primary):not(.button-danger):hover,
  .project-index-migrate:hover,
  .project-manager-danger-actions button:not([data-demo-action="remove"]):hover,
  .project-migration-form > footer button:not(.project-migration-submit):hover,
  body[data-settings-section="projects"] .project-migration-form > footer button:not(.project-migration-submit):hover,
  body.immersive-workbench .home-shortcut-dialog footer button:not(.home-shortcut-save):not(.home-shortcut-remove):hover {
    border-color: var(--control-input);
    background: var(--control-fill-hover);
    color: var(--ink);
  }

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
  .feed-import-dialog,
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
  .feed-import-dialog::backdrop,
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
`;
