/** Linear × coss: continuous pages, quiet transient surfaces.
 * Page navigation stays in the workspace; dialog semantics keep draft focus protected.
 *
 * Two geometries share one set of form internals. Creating or picking an item is a centred modal
 * sized to its content; editing an existing Session's relations stays an edge-attached sheet.
 */
const EDITOR_PANEL = 'body.immersive-workbench dialog:is([data-create-dialog], [data-feed-sources-dialog], [data-session-add-dialog], [data-session-relations-dialog], [data-frame-picker])';
const CENTERED_EDITOR = 'body.immersive-workbench dialog:is([data-create-dialog], [data-feed-sources-dialog], [data-session-add-dialog], [data-frame-picker])';

export const SURFACE_LANGUAGE_STYLES = `
  .goal-node-toolbar .goal-node-back,
  .plugin-stage-detail-bar .plugin-stage-back,
  .session-stage-bar .session-stage-back { flex: none; margin-left: -6px; }
  .goal-node-back svg { transform: rotate(180deg); }
  .goal-node-toolbar { gap: 10px; }
  body.immersive-workbench .goal-details-aside { background: var(--paper); box-shadow: none; }
  body.immersive-workbench .goal-canvas-shell .tui-empty { border: 0; border-radius: 0; background: transparent; box-shadow: none; }
  body.immersive-workbench .goal-event-document .event-form button[type=submit] { border-color: var(--action); }
  body.immersive-workbench .goal-event-document .event-form { width: min(100%, 880px); }

  /* All temporary editors meet the workspace edge, rather than floating over it. */
  ${EDITOR_PANEL} { position: fixed; inset: var(--tab-strip-h, 32px) 0 0 auto; margin: 0; width: min(560px, 100vw); max-width: 100vw; height: calc(100dvh - var(--tab-strip-h, 32px)); max-height: calc(100dvh - var(--tab-strip-h, 32px)); padding: 0; border: 0; border-left: 1px solid var(--line); border-radius: 0; background: var(--paper); color: var(--ink); box-shadow: none; overflow: hidden; transform: none; animation: none; transition: opacity 140ms ease, overlay 140ms allow-discrete, display 140ms allow-discrete; }
  ${EDITOR_PANEL}::backdrop { background: color-mix(in srgb, var(--ink) 10%, transparent); backdrop-filter: none; }
  ${EDITOR_PANEL} > :is(form, .feed-task-dialog-shell) { height: 100%; max-height: 100%; min-height: 0; }
  ${EDITOR_PANEL} > .dialog-shell { border: 0; border-radius: 0; box-shadow: none; }
  ${EDITOR_PANEL} :is(.dialog-body, .feed-task-dialog-body) { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; align-content: start; }
  ${EDITOR_PANEL} .dialog-body { gap: 12px; padding: 16px 20px; }
  body.immersive-workbench dialog[data-feed-sources-dialog] :is(input, select, textarea):focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; box-shadow: none; }
  ${EDITOR_PANEL} > form > section { flex: 1; min-height: 0; overflow: auto; align-content: start; gap: 12px; padding: 16px 20px; }
  ${EDITOR_PANEL} > form > header { border-bottom: 1px solid var(--line); }
  ${EDITOR_PANEL} header p { color: var(--muted); font-size: 13px; line-height: 1.6; }
  ${EDITOR_PANEL} label:not(.operation-confirm-check) { font-size: 13px; color: var(--ink-soft); align-content: start; gap: 5px; }
  ${EDITOR_PANEL} :is(input:not([type=checkbox]), select, textarea) { font-size: 14px; }
  ${EDITOR_PANEL} :is(.session-choice-picker > summary, .session-choice-option) { min-height: 36px; font-size: 14px; }
  ${EDITOR_PANEL} :is(.operation-capability-note, .operation-dialog-status, .operation-field-label, .session-workspace-picker small) { font: inherit; font-size: 12px; line-height: 1.6; }
  ${EDITOR_PANEL} .operation-field-label small { font-size: 11px; }
  ${EDITOR_PANEL} .session-workspace-picker strong { font-size: 13px; }
  ${EDITOR_PANEL} .session-add-field-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  ${EDITOR_PANEL} .operation-confirm-check { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; line-height: 1.6; }
  ${EDITOR_PANEL} .operation-confirm-check input { flex: none; width: 17px; height: 17px; margin: 2px 0 0; }
  ${EDITOR_PANEL} [data-session-add-toggle] { min-height: 36px; font-size: 12px; }
  ${EDITOR_PANEL} header button[data-dialog-close] { flex: none; width: 40px; height: 40px; border: 0; border-radius: var(--radius-control); background: var(--nav-bg); }
  ${EDITOR_PANEL} header button[data-dialog-close] svg { width: 16px; height: 16px; }
  ${EDITOR_PANEL} .dialog-icon { display: none; }
  ${EDITOR_PANEL} :is(h2, .feed-task-dialog-shell h2) { font-size: 18px; font-weight: 400; line-height: 1.4; letter-spacing: -.015em; }
  ${EDITOR_PANEL} :is(header, footer) { box-shadow: none; }
  ${EDITOR_PANEL} > form > header, ${EDITOR_PANEL} .feed-task-dialog-shell > header { padding: 16px 20px 12px; }
  ${EDITOR_PANEL} > form > footer, ${EDITOR_PANEL} .feed-task-dialog-shell > footer { padding: 10px 20px; }
  ${EDITOR_PANEL} .frame-picker-list { flex: 1; }
  ${EDITOR_PANEL} .form-disclosure { margin-top: 4px; padding-top: 0; }
  ${EDITOR_PANEL} .form-disclosure > summary { min-height: 44px; display: flex; align-items: center; padding-block: 8px; }
  ${EDITOR_PANEL} .form-disclosure > summary::before { content: ""; width: 6px; height: 6px; margin-right: 8px; border-right: 1px solid currentColor; border-bottom: 1px solid currentColor; transform: rotate(-45deg); flex: none; }
  ${EDITOR_PANEL} .form-disclosure[open] > summary::before { transform: rotate(45deg); }
  ${EDITOR_PANEL} .feed-task-dialog-body { padding: 12px 20px 20px; }
  ${EDITOR_PANEL} .feed-task-dialog-body label { margin-block: 12px; }
  /* Creation reads as writing, not as filling a form: two borderless lines and one quiet
   * disclosure. Labels become placeholders; the example disappears the moment you start. */
  ${CENTERED_EDITOR} .mw-form__header { padding-bottom: 0; align-items: center; }
  ${CENTERED_EDITOR} .create-compose { display: grid; gap: 2px; }
  ${CENTERED_EDITOR} .create-compose :is(.create-compose-title, .create-compose-outcome) {
    width: 100%;
    padding: 6px 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--ink);
    font: inherit;
    resize: none;
    outline: none;
  }
  ${CENTERED_EDITOR} .create-compose .create-compose-title { font-size: 19px; line-height: 1.4; letter-spacing: -.02em; }
  ${CENTERED_EDITOR} .create-compose .create-compose-outcome { min-height: 62px; font-size: 14px; line-height: 1.65; color: var(--ink-soft); }
  ${CENTERED_EDITOR} .create-compose :is(.create-compose-title, .create-compose-outcome)::placeholder { color: var(--faint); }
  ${CENTERED_EDITOR} .create-compose :is(.create-compose-title, .create-compose-outcome):focus,
  ${CENTERED_EDITOR} .create-compose :is(.create-compose-title, .create-compose-outcome):focus-visible {
    outline: none;
    background: var(--nav-hover);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--focus) 20%, transparent);
  }
  ${CENTERED_EDITOR} .create-compose-example {
    margin: 0 0 2px;
    padding: 0 8px;
    color: var(--faint);
    font-size: 11px;
    line-height: 1.6;
    transition: opacity var(--motion-fast) var(--ease-standard);
  }
  ${CENTERED_EDITOR} .create-compose-example[hidden] { display: block; opacity: 0; height: 0; margin: 0; overflow: hidden; }

  /* Everything beyond the two lines is one opt-in step, never three stacked walls. */
  ${CENTERED_EDITOR} .create-more { margin-top: 10px; padding: 0; border-top: 1px solid var(--line); }
  ${CENTERED_EDITOR} .create-more > summary {
    min-height: 34px;
    padding: 0 8px;
    color: var(--muted);
    font-size: 12px;
    cursor: pointer;
  }
  ${CENTERED_EDITOR} .create-more > summary:hover { color: var(--ink); }
  ${CENTERED_EDITOR} .create-more[open] > summary { color: var(--ink); }
  ${CENTERED_EDITOR} .create-more-group { display: grid; gap: 10px; padding: 12px 8px; margin: 0; border: 0; }
  ${CENTERED_EDITOR} .create-more-group + .create-more-group { border-top: 1px solid var(--line); }
  ${CENTERED_EDITOR} .create-more-group h3, ${CENTERED_EDITOR} .create-more-group legend {
    margin: 0; padding: 0; float: none; font-size: 13px; font-weight: 400; color: var(--ink);
  }
  ${CENTERED_EDITOR} .create-more-group > p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
  ${CENTERED_EDITOR} .create-more-group .relation-preview { color: var(--faint); }

  /* The keyboard route to the primary action sits with it, quiet and left of Cancel. */
  ${CENTERED_EDITOR} .dialog-submit-hint {
    margin-right: auto;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--faint);
    font: inherit;
    font-size: 11px;
    letter-spacing: .04em;
    display: inline-flex;
    gap: 2px;
    align-items: center;
  }

  /* Creation and picking float in the middle: content height, rounded, scrim behind. */
  ${CENTERED_EDITOR} {
    /* inset:0 + margin:auto only centres a definite box; auto height needs the translate form. */
    position: fixed;
    inset: auto;
    top: 50%;
    left: 50%;
    translate: -50% -50%;
    margin: 0;
    width: min(560px, calc(100vw - 48px));
    max-width: calc(100vw - 48px);
    height: auto;
    max-height: min(calc(100dvh - 96px), 720px);
    border: 1px solid var(--hairline, var(--control-border));
    border-radius: var(--radius-surface, 12px);
    box-shadow: var(--control-shadow), inset 0 1px 0 var(--edge-highlight, transparent);
    transition: opacity 140ms ease, overlay 140ms allow-discrete, display 140ms allow-discrete;
  }
  ${CENTERED_EDITOR}::backdrop { background: var(--scrim); }
  ${CENTERED_EDITOR} > :is(form, .feed-task-dialog-shell) { height: auto; max-height: min(calc(100dvh - 96px), 720px); }
  ${CENTERED_EDITOR} > .dialog-shell { border: 0; border-radius: 0; box-shadow: none; }
  @starting-style { ${CENTERED_EDITOR}[open] { opacity: 0; transform: translateY(6px) scale(.985); } }
  @media (max-width: 760px) {
    ${CENTERED_EDITOR} { width: calc(100vw - 24px); max-width: calc(100vw - 24px); max-height: calc(100dvh - 32px); }
    ${CENTERED_EDITOR} > :is(form, .feed-task-dialog-shell) { max-height: calc(100dvh - 32px); }
  }
  @starting-style { ${EDITOR_PANEL}[open] { opacity: .5; transform: none; } }
  @media (max-width: 760px) {
    ${EDITOR_PANEL} { width: 100vw; border-left: 0; }
    ${EDITOR_PANEL} .session-add-field-grid { grid-template-columns: minmax(0, 1fr); }
    ${EDITOR_PANEL} > form > header, ${EDITOR_PANEL} .feed-task-dialog-shell > header { padding: 16px; }
    ${EDITOR_PANEL} > form > section, ${EDITOR_PANEL} .dialog-body { padding: 16px; }
    ${EDITOR_PANEL} :is(input:not([type=checkbox]), select, textarea) { font-size: 16px; }
    ${EDITOR_PANEL} :is([data-session-add-toggle], header button[data-dialog-close]) { min-height: 44px; }
    ${EDITOR_PANEL} > form > footer, ${EDITOR_PANEL} .feed-task-dialog-shell > footer { padding: 10px 16px; }
    .goal-node-toolbar button, .goal-details-toggle, .plugin-stage-back, .session-stage-back { width: 44px; min-height: 44px; }
  }
  /* Search and irreversible confirmations remain compact, with restrained depth. */
  body :is(.global-search-dialog, .home-shortcut-dialog, .runtime-plan-dialog, .goal-trash-dialog, .project-operation-confirm-dialog) { border-radius: 8px; box-shadow: 0 8px 28px #00000018; }
  body :is(.global-search-dialog, .home-shortcut-dialog, .runtime-plan-dialog, .goal-trash-dialog, .project-operation-confirm-dialog)::backdrop { background: #00000026; backdrop-filter: none; }
  @media (prefers-reduced-motion: reduce) { ${EDITOR_PANEL}, ${EDITOR_PANEL}::backdrop { animation: none; transition: none; } }
`;
