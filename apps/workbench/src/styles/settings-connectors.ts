import { SERVICE_CONNECTION_PART_STYLES, SERVICE_CONNECTION_PROGRESS_STYLES } from "../service-connection-parts.js";

/**
 * 设置 › 服务连接 (plan A of §13.1): one column of service rows that open in place, the account's four rows in a card, the folded 高级.
 * The rows and the card where a connection is missing are the component board's parts (`SERVICE_CONNECTION_PART_STYLES`); their
 * step progress comes once, with the model settings' sheet that both settings sheets carry, so it is not repeated here.
 */
const PARTS_WITHOUT_PROGRESS = SERVICE_CONNECTION_PART_STYLES.slice(SERVICE_CONNECTION_PROGRESS_STYLES.length);

const ITEM_ROW = "[data-connectors-settings] .settings-connection-item > .settings-connection-row";

export const CONNECTOR_EXPERIENCE_STYLES = `${PARTS_WITHOUT_PROGRESS}
  [data-connectors-settings] [hidden] { display: none !important; }
  [data-connectors-settings] { --connector-width: 760px; }
  [data-connectors-settings] .settings-heading { padding-bottom: 24px; }
  [data-connectors-settings] .settings-connector-catalog { display: grid; gap: 32px; padding-top: 0; max-width: var(--connector-width); }
  .settings-connector-search { max-width: 360px; }
  .settings-connector-empty { display: flex; align-items: center; gap: 12px; margin: 0; color: var(--muted); font-size: 13px; }
  [data-connectors-settings] .mw-input { min-width: 0; width: 100%; min-height: 42px; }
  [data-connectors-settings] .mw-btn { min-height: 40px; max-width: 100%; white-space: normal; }
  [data-connectors-settings] a { text-underline-offset: 3px; }
  [data-connectors-settings] :is(button, a, input, select, textarea, summary):focus-visible { outline: var(--focus-stroke); outline-offset: 1px; }
  [data-connectors-settings] .settings-state { line-height: 1.5; }
  [data-connectors-settings] .settings-connector-subgroup h3 { font-size: 12px; font-weight: 600; color: var(--muted); margin: 0 0 4px; }
  /* A service row says its name, what it is for and one state, each on one line: what does not fit ends in an ellipsis. */
  ${ITEM_ROW} { padding-block: 14px; }
  ${ITEM_ROW} .settings-connection-row__identity :is(strong, small) { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; overflow-wrap: normal; }
  ${ITEM_ROW} .settings-connection-row__identity small { font-size: 12px; }
  ${ITEM_ROW} > :is(.settings-state, .mw-status) { max-width: 24ch; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  ${ITEM_ROW} > .mw-status > span:last-child { overflow: hidden; text-overflow: ellipsis; }
  .settings-connector-panel { display: grid; gap: 16px; min-width: 0; }
  .settings-connector-source { margin: 0; }
  .settings-connector-source small { color: var(--muted); font-size: 12px; }
  /* One account: its four rows in a card, its actions under them, what an action answered in its own box. */
  .settings-connection-account, .settings-connection-manage { display: grid; gap: 12px; min-width: 0; }
  .mw-card.connection-facts { width: auto; max-width: 100%; }
  .connection-facts .mw-card__panel { padding: 0 16px; }
  .connection-facts .settings-setting-row { padding: 10px 0; gap: 16px; flex-direction: row; align-items: center; }
  .connection-facts .settings-setting-row:last-child { border-bottom: 0; }
  .connection-facts .setting-copy { flex: 1 1 auto; }
  .connection-facts .setting-copy > strong { font-size: 13px; white-space: nowrap; }
  .connection-facts .setting-copy > span { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .connection-facts .setting-value { flex: 0 1 auto; min-width: 0; max-width: 60%; flex-wrap: nowrap; justify-content: flex-end; color: var(--ink); font-size: 13px; }
  .connection-facts .setting-value > :is(strong, span) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .connection-facts .setting-value > strong { font-weight: 500; }
  .connection-facts .setting-value > [data-connection-state], .connection-facts [data-connection-retry-at] { display: flex; }
  .connection-facts .setting-value .mw-status { max-width: 100%; min-width: 0; }
  .connection-facts .mw-status > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .connection-facts small { color: var(--muted); font-size: 12px; }
  [data-connectors-settings] :is(.settings-connection-account, .settings-connection-manage, .settings-connection-switch) .settings-connection-row__actions { grid-column: auto; border-top: 0; padding-top: 0; }
  .settings-connection-switch { display: grid; gap: 12px; padding: 16px; border: 1px solid var(--line-strong); border-radius: 10px; min-width: 0; }
  .settings-connection-switch label { min-width: 0; overflow-wrap: anywhere; }
  /* Each choice's mark sits on the centre of its words' first line (visual-order mark-offset): a 20px line, the 16px mark 2px down. */
  .settings-connection-switch .mw-check-row { line-height: 20px; }
  .settings-connection-switch .mw-check-row > .mw-radio { margin-top: 2px; }
  .settings-connection-switch .mw-field__hint { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
  /* 高级: each account's own settings in a box, then the other ways to connect. */
  .settings-connector-advanced { border-top: 1px solid var(--line); }
  .settings-connector-advanced > .mw-collapsible__body { gap: 16px; padding-top: 4px; }
  .settings-connection-manage { padding: 16px; border: 1px solid var(--line); border-radius: 10px; }
  .settings-connection-manage > h4 { margin: 0; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  [data-connectors-settings] form.settings-connection-inline { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px 12px; margin: 0; color: inherit; font-size: 13px; }
  form.settings-connection-inline > .settings-connector-field { flex: 1 1 200px; }
  form.settings-connection-inline > .mw-btn { flex: none; }
  .settings-connection-scopes { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; }
  .settings-connector-add.mw-collapsible { border-top: 1px solid var(--line); }
  .settings-connector-draft .settings-connector-actions { margin-top: 8px; }
  [data-connectors-settings] .settings-connector-method { padding: 0; border: 0; }
  .settings-connector-flow { display: grid; gap: 16px; min-width: 0; }
  [data-connectors-settings] .settings-connector-flow p, .settings-connector-help p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.65; max-width: 70ch; }
  .settings-connector-flow > .mw-btn, .settings-connector-auth > .mw-btn { justify-self: start; }
  [data-connectors-settings] .settings-connector-auth { gap: 16px; }
  [data-connectors-settings] .settings-connector-steps { display: grid; gap: 24px; padding: 0; margin: 0; list-style: none; counter-reset: connect-step; }
  [data-connectors-settings] .settings-connector-steps > li { display: grid; gap: 12px; padding-left: 32px; position: relative; counter-increment: connect-step; }
  [data-connectors-settings] .settings-connector-steps > li::before { content: counter(connect-step); position: absolute; top: 0; left: 0; color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; line-height: 22px; }
  [data-connectors-settings] .settings-connector-steps > li:only-child { padding-left: 0; }
  [data-connectors-settings] .settings-connector-steps > li:only-child::before { content: none; }
  .settings-connector-steps > li > strong { font-size: 15px; font-weight: 500; line-height: 22px; }
  [data-connectors-settings] .settings-connector-field { font-size: 13px; gap: 8px; }
  .settings-connector-links { display: flex; flex-wrap: wrap; gap: 4px 16px; }
  [data-connectors-settings] .settings-connector-links a { min-height: 36px; width: auto; font-size: 13px; display: inline-flex; align-items: center; gap: 8px; color: var(--blue-dark); overflow-wrap: anywhere; }
  .settings-connector-links svg { width: 14px; height: 14px; flex: none; }
  .settings-connector-copy { display: flex; align-items: center; gap: 12px; padding: 12px 12px; border-radius: 8px; background: var(--rail); }
  .settings-connector-copy code { overflow-wrap: anywhere; font: 12px/1.6 var(--font-mono, monospace); min-width: 0; flex: 1; }
  .settings-connector-copy button { flex: none; }
  .settings-connector-help { border-top: 1px solid var(--line); padding-top: 12px; }
  [data-connectors-settings] summary { cursor: pointer; min-height: 40px; align-content: center; font-size: 13px; color: var(--ink-soft); }
  .settings-connector-help[open] > :not(summary) { margin-top: 12px; }
  .settings-connector-pending { display: grid; gap: 8px; }
  .settings-connector-alternative { border-top: 1px solid var(--line); padding: 8px 0; }
  .settings-connector-alternative > summary { font-weight: 500; }
  .settings-connector-alternative > summary small { margin-left: 12px; color: var(--muted); font-weight: 400; }
  .settings-connector-alternative[open] .settings-connector-method { padding: 12px 0 16px; }
  .settings-connector-next { display: grid; gap: 12px; border-top: 1px solid var(--line); padding-top: 16px; }
  .settings-connector-next h3 { font-size: 13px; font-weight: 600; margin: 0; }
  .settings-connector-next__step { display: grid; justify-items: start; gap: 8px; }
  .settings-connector-next p { color: var(--ink-soft); font-size: 13px; line-height: 1.65; margin: 0; max-width: 65ch; }
  /* What an action or a connection answered sits in a box of its own, so it reads apart from the controls around it. */
  .settings-connector-feedback, [data-protocol-result], [data-connectors-settings] .settings-connection-result { padding: 12px 16px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--rail); overflow-wrap: anywhere; min-width: 0; }
  .settings-connector-feedback:focus { outline: none; }
  [data-connectors-settings] [data-tone=error] { border-color: var(--red); }
  [data-connectors-settings] [data-tone=error] > p { color: var(--red); }
  [data-connectors-settings] :is([data-protocol-result], .settings-connector-feedback, .settings-connection-result) > p { font-size: 13px; line-height: 1.6; margin: 0 0 8px; }
  [data-connectors-settings] :is([data-protocol-result], .settings-connector-feedback, .settings-connection-result) > :last-child { margin-bottom: 0; }
  [data-connectors-settings] .settings-connection-result > ul { display: grid; gap: 8px; padding-left: 16px; font-size: 13px; }
  [data-connectors-settings] .settings-connection-result:focus { outline: none; }
  [data-connectors-settings] .settings-connection-row { background: transparent; padding: 16px 0; border-radius: 0; border-width: 0 0 1px; }
  [data-connectors-settings] .settings-connection-row__identity strong { font-size: 15px; white-space: normal; overflow-wrap: anywhere; }
  [data-connectors-settings] .settings-connection-row__identity small { font-size: 12px; overflow-wrap: anywhere; }
  [data-connectors-settings] .settings-connection-row__actions { border-top: 0; padding-top: 4px; }
  @media (max-width: 760px) {
    [data-connectors-settings] .mw-btn, [data-connectors-settings] summary { min-height: 44px; }
    .settings-connector-search { max-width: none; }
    .settings-connector-copy { align-items: start; flex-direction: column; }
    .settings-connector-alternative > summary small { display: block; margin: 4px 0 8px 16px; }
    [data-connectors-settings] .settings-connector-steps > li { padding-left: 24px; }
    [data-connectors-settings] .settings-connection-row:not(.settings-connection-item > *) { grid-template-columns: 40px minmax(0, 1fr); }
    [data-connectors-settings] .settings-connection-row:not(.settings-connection-item > *) > .settings-state { grid-column: 2; justify-self: start; }
    ${ITEM_ROW} > :is(.settings-state, .mw-status) { max-width: 100%; }
    .connection-facts .mw-card__panel { padding: 0 12px; }
    /* Narrow: each fact's value goes under its label, flush left with it, still one line each. */
    [data-connectors-settings] .connection-facts .settings-setting-row { flex-direction: column; align-items: stretch; gap: 4px; }
    .connection-facts .setting-value { max-width: 100%; justify-content: flex-start; text-align: start; }
    .settings-connection-switch, .settings-connection-manage { padding: 12px; }
  }
`;
