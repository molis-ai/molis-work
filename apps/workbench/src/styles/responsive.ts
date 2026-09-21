import { GOALS_PROPOSAL_MOBILE_STYLES, GOALS_LEGACY_PROPOSAL_MOBILE_STYLES } from "@molis-ai/molis-work-plugin-goals";
export const RESPONSIVE_STYLES = `
  @container (max-width: 660px) {
    .goal-factor-nav, .goal-factor-panels { margin-left: 0; }
    .goal-factor-nav { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .goal-factor-nav button:nth-child(2) { border-right: 0; }
    .goal-factor-nav button:nth-child(-n+2) { border-bottom: 1px solid var(--line); }
    .policy-scope-note { grid-template-columns: auto minmax(0, 1fr); }
    .policy-scope-note a { grid-column: 2; }
    .document-subsection, .draft-editor-section { margin-left: 0; }
    .human-review-list > header { display: grid; gap: 2px; }
    .human-review-form > label, .human-review-form fieldset { grid-template-columns: 1fr; gap: 5px; }
    .human-review-form > label > span, .human-review-form legend { padding-top: 0; }
    .human-review-form footer { align-items: stretch; flex-direction: column; }
    .human-review-form footer button { align-self: flex-end; }
    .evidence-form-row { grid-template-columns: 1fr; }
    .evidence-submit footer { align-items: stretch; flex-direction: column; }
    .evidence-submit footer button { align-self: flex-end; }
    .event-ledger details > summary { grid-template-columns: 1fr; gap: 3px; }
    .event-ledger dl div { grid-template-columns: 1fr; gap: 2px; }
    .goal-situation { grid-template-columns: 1fr 1fr; }
    .goal-situation-cell:nth-child(2n) { border-right: 0; }
    .goal-situation-cell:nth-child(-n+2) { border-bottom: 1px solid var(--line); }
    .policy-effective dl { grid-template-columns: 1fr 1fr; }
    .policy-inheritance { grid-template-columns: 1fr; gap: 5px; }
    .policy-inheritance > svg { transform: rotate(90deg); }
    .policy-source > summary { align-items: flex-start; }
    .policy-source-state { min-width: 0; max-width: 42%; }
    .policy-source-title > span:last-child > span, .policy-source-state small { display: none; }
    .policy-mode-options, .policy-control--split, .policy-toggle-list, .policy-review-counts { grid-template-columns: 1fr; }
    .policy-reason { grid-template-columns: 1fr; gap: 5px; }
    .policy-reason > span { padding-top: 0; }
    .policy-form footer { align-items: stretch; flex-direction: column; }
    .policy-form footer button { align-self: flex-end; }
    .draft-form-row, .draft-list-grid, .decomposition-editor > div, .criterion-editor-grid, .draft-aux-form { grid-template-columns: 1fr; }
    .draft-list-grid label:last-child, .criterion-pass, .draft-aux-wide { grid-column: 1; }
    .decomposition-choice { border-right: 0; }
    .decomposition-choice:nth-last-child(2) { border-bottom: 1px solid var(--line); }
    .criteria-editor > header, .draft-contract-form > footer { align-items: stretch; flex-direction: column; }
    .criteria-editor > header button, .draft-contract-form > footer button { align-self: flex-end; }
    .draft-aux-form { padding-left: 0; }
    .relation-direction-control > div, .relation-builder { grid-template-columns: 1fr; }
    .factor-advanced-grid { grid-template-columns: 1fr; }
    .policy-form-wide { grid-column: 1; }
    .relation-form > footer { align-items: stretch; flex-direction: column; }
    .relation-form > footer button { align-self: flex-end; }
    .relation-editor-action { display: none; }
    .risk-facts, .risk-form, .risk-state-form { grid-template-columns: 1fr; }
    .risk-facts { padding-left: 14px; }
    .risk-fact-wide, .risk-form-wide, .risk-goal-picker { grid-column: 1; }
    .risk-record > header > div { grid-template-columns: 1fr; }
    .risk-record .risk-state { margin-bottom: 2px; }
    .risk-effect, .risk-resolution, .risk-readonly { margin-left: 14px; }
    .risk-actions > details > summary, .risk-form, .risk-state-form { padding-left: 14px; }
    .risk-decision-link { padding-left: 14px; }
    .risk-goal-options { grid-template-columns: 1fr; }
    .risk-form footer, .risk-state-form footer { align-items: stretch; flex-direction: column; }
    .risk-form footer button, .risk-state-form footer button { align-self: flex-end; }
    .risk-resolution-fields { grid-template-columns: 1fr; }
    .impact-facts, .impact-form { grid-template-columns: 1fr; }
    .impact-facts { padding-left: 14px; }
    .impact-fact-wide, .impact-form-wide { grid-column: 1; }
    .impact-record > header { grid-template-columns: auto minmax(0, 1fr); }
    .impact-record > header > div { grid-template-columns: 1fr; }
    .impact-record > header > .impact-state { grid-column: 2; justify-self: start; }
    .impact-access { margin-bottom: 2px; }
    .impact-effect, .impact-readonly { margin-left: 14px; }
    .impact-actions > details > summary, .impact-form, .impact-deactivate form { padding-left: 14px; }
    .impact-form footer { align-items: stretch; flex-direction: column; }
    .impact-form footer button { align-self: flex-end; }
    .goal-now > header, .goal-now-body { grid-template-columns: 1fr; display: grid; }
    .goal-now > header { gap: 8px; }
    .goal-now > header .goal-status { justify-self: start; }
    .goal-now-blockers, .goal-purpose > section, .completion-boundaries > section, .supporting-boundaries > div > section { grid-template-columns: 1fr; gap: 5px; }
    .goal-purpose, .goal-edit-disclosure, .child-progress, .progress-overview, .goal-technical-body { margin-left: 0; padding-left: 0; }
    .progress-facts, .technical-meta { grid-template-columns: 1fr; }
    .progress-facts > div { padding: 10px 0 !important; border-right: 0 !important; }
    .technical-meta > div { grid-template-columns: 1fr; gap: 2px; }
  }
  @media (max-width: 1500px) {
    .brand { min-width: 160px; padding-inline: 20px; }
    .project-context { min-width: 0; padding-inline: 14px; }
    .project-context > span { max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
    .top-action { padding-inline: 9px; }
  }
  @media (max-width: 1180px) {
    .app, .topbar, .workspace { min-width: 0; }
    .workspace { grid-template-columns: var(--tree-width, 280px) 5px minmax(0, 1fr); }
    .workspace.is-desktop-tui { grid-template-columns: var(--tree-width, 240px) 5px minmax(0, 1fr) 5px var(--tui-width, 400px); }
    .workspace.is-desktop-tui.is-tui-collapsed { grid-template-columns: var(--tree-width, 240px) 5px minmax(0, 1fr) 0 0; }
    .project-context { min-width: 0; padding-inline: 12px; }
    .project-context > span { max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
    .top-action { padding-inline: 8px; }
    .top-action span { display: none; }
    .runtime-grid { grid-template-columns: 1fr 1fr; }
    .runtime-grid > section:nth-child(2) { border-right: 0; }
    .runtime-grid > section:nth-child(-n+2) { border-bottom: 1px solid var(--line-strong); }
  }
  @media (max-width: 900px) {
    .top-spacer { display: block; flex: 1 1 auto; }
    .project-context { min-width: 0; flex: 1 1 auto; padding-inline: 12px; }
    .project-context > strong { display: none; }
    .project-context > span { min-width: 0; flex: 1 1 auto; max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
    .project-context a { flex: 0 0 auto; }
  }
  @media (max-width: 760px) {
    body { overflow: hidden; }
    .app { grid-template-rows: 52px 44px minmax(0, 1fr); }
    .topbar { grid-row: 1; }
    .brand { min-width: 0; padding: 0 15px; border-right: 0; }
    .brand strong { font-size: 17px; }
    .project-context { padding-inline: 8px; }
    .project-context > span { max-width: 132px; }
    .top-spacer { flex: 1; }
    .top-action { margin-right: 8px; }
    .top-action span { display: none; }
    .tree-search kbd { display: none; }
    .tree-search input { padding-right: 10px; }
    .mobile-switch { grid-row: 2; display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); padding: 0 5px; min-height: 44px; border-bottom: 1px solid var(--line); background: var(--rail); }
    .mobile-switch button { border: 0; border-radius: 4px; background: transparent; color: var(--muted); min-height: 44px; }
    .mobile-switch button.is-active { color: var(--ink); background: var(--paper); box-shadow: 0 1px 3px color-mix(in srgb, var(--ink) 10%, transparent); }
    .mobile-switch button:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); box-shadow: none; }
    .workspace { grid-row: 3; grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr); }
    .tree-resizer, .tui-resizer { display: none; }
    .workspace.is-desktop-tui { grid-template-columns: 1fr; }
    .workspace.is-desktop-tui .tree-resizer, .workspace.is-desktop-tui .tui-resizer { display: none; }
    .workspace > .tree-pane,
    .workspace > .document-pane,
    .workspace > .tui-pane,
    .workspace > .goal-momentum { grid-column: 1; grid-row: 1; min-width: 0; min-height: 0; }
    .workspace[data-mobile-view="tree"] .document-pane,
    .workspace[data-mobile-view="tree"] .tui-pane,
    .workspace[data-mobile-view="tree"] .goal-momentum { display: none; }
    .workspace[data-mobile-view="tree"] .tree-pane { height: 100%; min-height: 0; }
    .workspace[data-mobile-view="document"] .tree-pane,
    .workspace[data-mobile-view="document"] .tui-pane { display: none; }
    .workspace[data-mobile-view="tui"] .tree-pane,
    .workspace[data-mobile-view="tui"] .document-pane { display: none; }
    .workspace[data-mobile-view="tui"] .tui-pane { display: grid; }
    .workspace[data-workspace-mode="graph"] > .tree-pane,
    .workspace[data-workspace-mode="graph"] > .document-pane,
    .workspace[data-workspace-mode="graph"] > .tui-pane { display: none; }
    .workspace[data-workspace-mode="graph"] > .goal-momentum { display: grid; height: 100%; min-height: 0; }
    .tui-collapse, .tui-expand { display: none !important; }
    .tree-pane { border-right: 0; }
    .goal-document { padding: 20px 18px 64px; }
    .goal-title-row { display: grid; gap: 10px; }
    .goal-title-actions { justify-content: space-between; }
    .goal-meta { gap: 8px 16px; }
    .trash-summary, .trash-restore-row { margin-left: 0; }
    .trash-restore-row { align-items: stretch; flex-direction: column; }
    .trash-restore-row .mw-btn { align-self: flex-start; }
    .runtime-grid { grid-template-columns: 1fr; }
    .runtime-grid > section { min-height: 0; border-right: 0 !important; border-bottom: 1px solid var(--line) !important; }
    .runtime-grid > section:last-child { border-bottom: 0 !important; }
    .contract-list section { grid-template-columns: 1fr; gap: 6px; }
    .human-review-list > header { display: grid; gap: 2px; }
    .human-review-form > label, .human-review-form fieldset { grid-template-columns: 1fr; gap: 5px; }
    .human-review-form > label > span, .human-review-form legend { padding-top: 0; }
    .human-review-form footer { align-items: stretch; flex-direction: column; }
    .human-review-form footer button { align-self: flex-end; }
    .evidence-form-row { grid-template-columns: 1fr; }
    .evidence-submit footer { align-items: stretch; flex-direction: column; }
    .evidence-submit footer button { align-self: flex-end; }
    .policy-effective { padding-inline: 14px; }
    .policy-effective dl { grid-template-columns: 1fr 1fr; }
    .policy-inheritance { grid-template-columns: 1fr; gap: 5px; }
    .policy-inheritance > svg { transform: rotate(90deg); }
    .policy-source > summary { align-items: flex-start; }
    .policy-source-state { min-width: 0; max-width: 42%; }
    .policy-source-title > span:last-child > span, .policy-source-state small { display: none; }
    .policy-mode-options, .policy-control--split, .policy-toggle-list, .policy-review-counts { grid-template-columns: 1fr; }
    .policy-reason { grid-template-columns: 1fr; gap: 5px; }
    .policy-reason > span { padding-top: 0; }
    .policy-form footer { align-items: stretch; flex-direction: column; }
    .policy-form footer button { align-self: flex-end; }
    .draft-form-row, .draft-list-grid, .decomposition-editor > div, .criterion-editor-grid, .draft-aux-form { grid-template-columns: 1fr; }
    .draft-list-grid label:last-child, .criterion-pass, .draft-aux-wide { grid-column: 1; }
    .decomposition-choice { border-right: 0; }
    .decomposition-choice:nth-last-child(2) { border-bottom: 1px solid var(--line); }
    .criteria-editor > header, .draft-contract-form > footer { align-items: stretch; flex-direction: column; }
    .criteria-editor > header button, .draft-contract-form > footer button { align-self: flex-end; }
    .draft-aux-form { padding-left: 0; }
    .relation-direction-control > div, .relation-builder { grid-template-columns: 1fr; }
    .relation-form > footer { align-items: stretch; flex-direction: column; }
    .relation-form > footer button { align-self: flex-end; }
    .relation-editor-action { display: none; }
    .history-list li { grid-template-columns: 1fr; gap: 2px; }
    .decision-center { padding-inline: 24px; }
    .decision-center-header, .candidate-title, .decision-owner { align-items: flex-start; }
    .decision-center-header { display: grid; }
    .decision-center-header > strong { text-align: left; }
    .decision-summary { gap: 7px 16px; }
    .decision-record-heading { align-items: flex-start; }
    .decision-guidance, .review-context, .risk-decision-choice { grid-template-columns: 1fr; }
    .decision-guidance > section { border-right: 0; border-bottom: 1px solid var(--line); }
    .decision-guidance > section:last-child { border-bottom: 0; }
    .decision-scenario dl > div { grid-template-columns: 1fr; gap: 2px; }
    .risk-decision-details > div { grid-template-columns: 1fr; gap: 3px; }
    .decision-receipt { grid-template-columns: 1fr; }
    .decision-result { grid-template-columns: auto minmax(0, 1fr); }
    .decision-result-links { grid-column: 2; justify-items: start; }
    .decision-result-links a { justify-content: flex-start; text-align: left; }
${GOALS_PROPOSAL_MOBILE_STYLES}
    .decision-reason { grid-template-columns: 1fr; gap: 5px; }
    .decision-reason > span { padding-top: 0; }
    .goal-situation { grid-template-columns: 1fr 1fr; }
    .goal-situation-cell:nth-child(2n) { border-right: 0; }
    .goal-situation-cell:nth-child(-n+2) { border-bottom: 1px solid var(--line); }
${GOALS_LEGACY_PROPOSAL_MOBILE_STYLES}
    .decision-actions { justify-content: flex-end; }
    .field-row--split, .goal-choice-list { grid-template-columns: 1fr; }
    .relation-field-heading, .relation-field > legend { grid-template-columns: 1fr; gap: 6px; }
    .dialog-body input:not([type=checkbox]), .dialog-body textarea, .dialog-body select, .policy-form input:not([type=checkbox]), .policy-form textarea, .policy-form select, .human-review-form input:not([type=checkbox]), .human-review-form textarea, .human-review-form select, .evidence-submit textarea, .evidence-submit select, .draft-contract-form input:not([type=radio]), .draft-contract-form textarea, .draft-contract-form select, .draft-aux-form input, .draft-aux-form textarea, .draft-aux-form select, .relation-form input, .relation-form textarea, .relation-form select, .relation-deactivate-form textarea, .risk-form input:not([type=checkbox]), .risk-form textarea, .risk-form select, .risk-state-form textarea, .risk-state-form select, .impact-form input, .impact-form textarea, .impact-form select, .impact-deactivate textarea { font-size: 16px; }
    .create-dialog { width: 100vw; max-width: none; height: 100vh; max-height: none; margin: 0; border-radius: 0; }
    .dialog-shell { max-height: 100vh; height: 100%; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }
  }
`;

