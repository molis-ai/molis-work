/** Connector journeys share the surrounding settings typography and surfaces. */
export const CONNECTOR_EXPERIENCE_STYLES = `
  [data-connectors-settings] [hidden] { display: none !important; }
  [data-connectors-settings] { --connector-width: 760px; }
  [data-connectors-settings] .settings-heading { padding-bottom: 24px; }
  [data-connectors-settings] .settings-connection-empty { padding: 16px 0; border: 0; border-radius: 0; }
  [data-connectors-settings] .settings-connector-catalog { gap: 20px; padding-top: 26px; }
  .settings-connector-filters { display: grid; grid-template-columns: minmax(160px, 1fr) minmax(120px, 180px); gap: 16px; }
  [data-connectors-settings] .mw-input { min-width: 0; width: 100%; min-height: 42px; }
  [data-connectors-settings] .mw-btn { min-height: 40px; max-width: 100%; white-space: normal; }
  [data-connectors-settings] a { text-underline-offset: 3px; }
  [data-connectors-settings] :is(button, a, input, select, textarea, summary):focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }
  [data-connectors-settings] .settings-connectors-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 24px; }
  [data-connectors-settings] button.settings-connector-card { padding: 16px 4px; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; gap: 12px; text-align: start; min-height: 92px; }
  [data-connectors-settings] button.settings-connector-card:hover { background: var(--nav-hover); }
  [data-connectors-settings] .settings-connector-card__title { align-items: start; flex-wrap: wrap; gap: 4px 8px; }
  [data-connectors-settings] .settings-connector-card__title strong { font-weight: 550; }
  [data-connectors-settings] .settings-state { line-height: 1.5; }
  [data-connectors-settings] .settings-connector-subgroup h3 { font-size: 13px; font-weight: 550; color: var(--ink-soft); margin-bottom: 4px; }
  [data-connectors-settings] .settings-connector-detail { width: 100%; max-width: var(--connector-width); gap: 20px; padding-top: 0; }
  .settings-connector-purpose { margin: -8px 0 0; max-width: 65ch; color: var(--muted); font-size: 14px; line-height: 1.65; }
  [data-connectors-settings] .settings-connector-detail__head { flex-wrap: wrap; }
  [data-connectors-settings] .settings-connector-detail__head h2 { font-size: 26px; font-weight: 550; }
  [data-connectors-settings] .settings-connector-detail__head .settings-state { margin-left: auto; }
  [data-connectors-settings] .settings-connector-setup { gap: 16px; }
  [data-connectors-settings] .settings-connector-setup > h3 { font-size: 17px; font-weight: 550; margin: 12px 0 0; }
  [data-connectors-settings] .settings-connector-method { padding: 0; border: 0; }
  .settings-connector-flow { display: grid; gap: 16px; min-width: 0; }
  [data-connectors-settings] .settings-connector-flow p, .settings-connector-help p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.65; max-width: 70ch; }
  .settings-connector-flow > .mw-btn, .settings-connector-auth > .mw-btn { justify-self: start; }
  [data-connectors-settings] .settings-connector-auth { gap: 16px; }
  [data-connectors-settings] .settings-connector-steps { display: grid; gap: 24px; padding: 0; margin: 0; list-style: none; counter-reset: connect-step; }
  [data-connectors-settings] .settings-connector-steps > li { display: grid; gap: 10px; padding-left: 32px; position: relative; counter-increment: connect-step; }
  [data-connectors-settings] .settings-connector-steps > li::before { content: counter(connect-step); position: absolute; top: 0; left: 0; color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; line-height: 22px; }
  .settings-connector-steps > li > strong { font-size: 14px; font-weight: 550; line-height: 22px; }
  [data-connectors-settings] .settings-connector-field { font-size: 13px; gap: 7px; }
  .settings-connector-links { display: flex; flex-wrap: wrap; gap: 4px 18px; }
  [data-connectors-settings] .settings-connector-links a { min-height: 36px; width: auto; font-size: 13px; display: inline-flex; align-items: center; gap: 6px; color: var(--blue-dark); overflow-wrap: anywhere; }
  .settings-connector-links svg { width: 14px; height: 14px; flex: none; }
  .settings-connector-copy { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; background: var(--rail); }
  .settings-connector-copy code { overflow-wrap: anywhere; font: 12px/1.6 var(--font-mono, monospace); min-width: 0; flex: 1; }
  .settings-connector-copy button { flex: none; }
  .settings-connector-help, .settings-connector-alternatives, .settings-connector-add { border-top: 1px solid var(--line); padding-top: 10px; }
  [data-connectors-settings] summary { cursor: pointer; min-height: 40px; align-content: center; font-size: 13px; color: var(--ink-soft); }
  .settings-connector-help[open] > :not(summary) { margin-top: 12px; }
  .settings-connector-alternative { border-top: 1px solid var(--line); padding: 8px 0; }
  .settings-connector-alternative > summary { font-weight: 500; }
  .settings-connector-alternative > summary small { margin-left: 12px; color: var(--muted); font-weight: 400; }
  .settings-connector-alternative[open] .settings-connector-method { padding: 12px 0 16px; }
  .settings-connector-next { display: grid; justify-items: start; gap: 12px; border-top: 1px solid var(--line-strong); margin-top: 12px; padding-top: 24px; }
  .settings-connector-next h3 { font-size: 15px; font-weight: 550; margin: 0; }
  .settings-connector-next p { color: var(--ink-soft); font-size: 13px; line-height: 1.65; margin: 0; max-width: 65ch; }
  .settings-connector-next small { font-size: 12px; color: var(--muted); line-height: 1.6; }
  .settings-connector-feedback, [data-protocol-result] { padding: 14px 16px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--rail); overflow-wrap: anywhere; }
  [data-connectors-settings] [data-tone=error] { border-color: var(--red); }
  [data-connectors-settings] [data-tone=error] > p { color: var(--red); }
  [data-connectors-settings] :is([data-protocol-result], .settings-connector-feedback, .settings-connection-result) > p { font-size: 13px; line-height: 1.6; margin: 0 0 8px; }
  [data-connectors-settings] .settings-connection-result > ul { display: grid; gap: 6px; padding-left: 18px; font-size: 13px; }
  [data-connectors-settings] .settings-connection-row { background: transparent; padding: 16px 0; border-radius: 0; border-width: 0 0 1px; }
  [data-connectors-settings] .settings-connection-row__identity strong { font-size: 14px; white-space: normal; overflow-wrap: anywhere; }
  [data-connectors-settings] .settings-connection-row__identity small { font-size: 12px; overflow-wrap: anywhere; }
  [data-connectors-settings] .settings-connection-row__actions { border-top: 0; padding-top: 4px; }
  @media (max-width: 760px) {
    [data-connectors-settings] .settings-connectors-grid { grid-template-columns: minmax(0, 1fr); }
    [data-connectors-settings] .settings-connector-detail { gap: 18px; }
    [data-connectors-settings] .settings-connector-detail__head .settings-state { margin-left: 0; }
    [data-connectors-settings] .mw-btn, [data-connectors-settings] summary { min-height: 44px; }
    .settings-connector-filters { grid-template-columns: minmax(0, 1fr) minmax(100px, 130px); gap: 10px; }
    .settings-connector-copy { align-items: start; flex-direction: column; }
    .settings-connector-alternative > summary small { display: block; margin: 4px 0 8px 16px; }
    [data-connectors-settings] .settings-connector-steps > li { padding-left: 24px; }
    [data-connectors-settings] .settings-connection-row { grid-template-columns: 40px minmax(0, 1fr); }
    [data-connectors-settings] .settings-connection-row > .settings-state { grid-column: 2; justify-self: start; }
  }
`;
