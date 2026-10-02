import { CONNECTOR_EXPERIENCE_STYLES } from "./settings-connectors.js";
export const SETTINGS_STYLES = `
  html:has(> body.settings-page), body.settings-page { height: 100dvh; max-height: 100dvh; min-height: 0; overflow: hidden; overscroll-behavior: none; background: var(--page); }
  body.settings-page { display: grid; grid-template-rows: auto minmax(0, 1fr); }
  body.settings-page[data-desktop-shell="true"] > .topbar { display: flex; }
  .settings-page > .topbar { height: 58px; min-height: 58px; }
  .settings-page .brand { color: inherit; text-decoration: none; }
  body.settings-page[data-desktop-shell="true"] .project-context strong { display: block; }
  body.settings-page[data-desktop-shell="true"] .project-context small { display: none; }
  .settings-shell { min-width: 0; min-height: 0; height: 100%; overflow: hidden; display: grid; grid-template-columns: 248px minmax(0, 1fr); }
  .settings-shell--standalone { grid-template-columns: minmax(0, 1fr); }
  .settings-shell--standalone .settings-document { margin-inline: auto; }
  .settings-navigation { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 16px 12px; border-right: 1px solid var(--line-strong); background: var(--nav-bg); display: flex; flex-direction: column; gap: 4px; }
  .settings-nav-group { min-width: 0; display: grid; gap: 4px; }
  .settings-nav-group + .settings-nav-group { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line); }
  .settings-nav-label { min-width: 0; padding: 0 12px 4px; display: grid; gap: 4px; color: var(--faint); }
  .settings-nav-label > span { font-size: 11px; font-weight: 400; letter-spacing: .07em; text-transform: uppercase; }
  .settings-nav-label > small { overflow: hidden; color: var(--muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .settings-navigation a { min-height: 50px; padding: 8px 12px; border-radius: 5px; color: var(--ink-soft); display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: center; gap: 8px; text-decoration: none; }
  .settings-navigation a:hover { background: var(--nav-hover); }
  .settings-navigation a[aria-current=page] { color: var(--ink); background: var(--nav-active); box-shadow: inset 2px 0 0 var(--ink); }
  .settings-navigation a > svg { font-size: 17px; }
  .settings-navigation a > span { min-width: 0; display: grid; }
  .settings-navigation strong { font-size: 13px; }
  .settings-navigation small { color: var(--muted); font-size: 11px; }
  .project-settings-back { min-height: 38px !important; margin-bottom: 12px; color: var(--muted) !important; }
  .project-settings-back svg { transform: rotate(180deg); }
  .project-settings-navigation .settings-nav-label { padding-top: 4px; }
  .settings-content { container: settings-content / inline-size; min-width: 0; min-height: 0; overflow: hidden; display: flex; flex-direction: column; background: var(--paper); }
  .settings-content > .project-manager { flex: 1; min-width: 0; min-height: 0; overflow: hidden; display: grid; grid-template-columns: 264px minmax(0, 1fr); caret-color: var(--ink); }
  .settings-content > .project-manager ::selection { background: color-mix(in srgb, var(--blue) 28%, transparent); color: var(--ink); }
  .settings-content > :is(.settings-document, .guidance-document, .planning-catalog, .planning-detail, .planning-edit, .work-planning) { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
  .settings-document { width: min(100%, 960px); min-height: 0; margin-inline: auto; padding: 32px clamp(20px, 5cqi, 48px) 0; }
  .settings-heading, .guidance-page-header, .planning-page-header, .planning-detail-header, .planning-library-tools, .planning-back { flex: none; }
  .settings-body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding-bottom: 80px; }
  .settings-heading { max-width: 72ch; padding-bottom: 24px; border-bottom: 1px solid var(--line-strong); }
  .settings-heading h1 { margin: 0; font-size: 30px; line-height: 1.25; letter-spacing: -.03em; }
  .settings-heading p { margin: 8px 0 0; color: var(--muted); }
  .settings-heading-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .settings-heading-title :is(h1, h2) { min-width: 0; }
  .appearance-settings { border-bottom: 1px solid var(--line-strong); }
  .preference-section { padding: 24px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: minmax(160px, .72fr) minmax(0, 1.28fr); align-items: start; gap: 32px; }
  .preference-section:last-child { border-bottom: 0; }
  .preference-copy h2 { margin: 0; font-size: 15px; letter-spacing: -.015em; }
  .preference-copy p { max-width: 48ch; margin: 4px 0 0; color: var(--muted); font-size: 12px; line-height: 1.55; }
  .preference-options { min-width: 0; display: grid; gap: 8px; }
  .preference-options--density { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .preference-options--language { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .preference-options--theme { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .preference-option {
    position: relative;
    min-width: 0;
    min-height: 76px;
    padding: 12px;
    border: 1px solid var(--line-strong);
    border-radius: 7px;
    background: var(--paper);
    color: var(--ink-soft);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) 16px;
    align-items: center;
    gap: 12px;
    text-align: left;
    cursor: pointer;
    text-decoration: none;
  }
  .preference-option:hover { border-color: var(--line-strong); background: var(--nav-hover); }
  .preference-option[aria-pressed="true"] { border-color: var(--line); color: var(--ink); background: var(--nav-active); }
  .preference-option[aria-current="true"] { border-color: var(--line); color: var(--ink); background: var(--nav-active); }
  .preference-option > span:nth-child(2) { min-width: 0; display: grid; gap: 4px; }
  .preference-option strong { color: var(--ink); font-size: 13px; font-weight: var(--weight-control, 500); }
  .preference-option small { color: var(--muted); font-size: 11px; line-height: 1.4; }
  .preference-option > svg { width: 16px; height: 16px; }
  .preference-option .preference-check { opacity: 0; color: var(--ink); }
  .preference-option[aria-pressed="true"] .preference-check { opacity: 1; }
  .preference-option[aria-current="true"] .preference-check { opacity: 1; }
  .language-preview { width: 54px; height: 42px; border: 1px solid var(--line); border-radius: 5px; background: var(--rail); color: var(--ink); display: grid; place-items: center; font-size: 12px; font-weight: 400; }
  .density-preview {
    width: 54px;
    height: 42px;
    padding: 4px;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--rail);
    display: grid;
    grid-template-columns: 14px minmax(0, 1fr);
    gap: 4px;
  }
  .density-preview > i { border-right: 1px solid var(--line-strong); }
  .density-preview > span { display: flex; flex-direction: column; justify-content: center; gap: 4px; }
  .density-preview > span > i { height: 2px; border-radius: 1px; background: var(--muted); opacity: .72; }
  .density-preview > span > i:nth-child(2) { width: 82%; }
  .density-preview > span > i:nth-child(3) { width: 68%; }
  .density-preview--compact > span { gap: 4px; }
  .density-preview--compact > span > i { height: 1px; }
  .preference-note { max-width: 72ch; margin: 16px 0 0; color: var(--muted); font-size: 12px; line-height: 1.55; }
  .settings-record-list { border-bottom: 1px solid var(--line-strong); }
  .settings-record { border-bottom: 1px solid var(--line); }
  .settings-record:last-child { border-bottom: 0; }
  .settings-record > header { min-height: 92px; padding: 16px 0; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
  .settings-record-title { min-width: 0; display: flex; align-items: flex-start; gap: 12px; }
  .settings-record-title .record-icon { width: 34px; height: 34px; flex: 0 0 34px; border: 1px solid var(--line); border-radius: 6px; display: grid; place-items: center; color: var(--ink); background: var(--rail); }
  .settings-record-title h2, .settings-record-title h3 { margin: 0; font-size: 15px; letter-spacing: -.015em; }
  .settings-record-title p { margin: 4px 0 0; color: var(--muted); font-size: 12px; }
  .settings-record-action { flex: 0 0 auto; display: flex; align-items: center; gap: 12px; }
  .settings-record-action .mw-btn:disabled { cursor: not-allowed; }
  .settings-state { display: inline-flex; align-items: center; white-space: nowrap; font-size: 12px; font-weight: 400; }
  .settings-state--success { color: var(--green); }
  .settings-state--warning { color: var(--amber); }
  .settings-state--danger { color: var(--red); }
  .settings-state--neutral { color: var(--muted); }
  .settings-document[data-connectors-settings] { overflow: hidden; }
  .settings-document[data-connectors-settings] > .settings-body { padding-top: 24px; }
  .settings-connection-section { display: grid; gap: 16px; padding-bottom: 32px; border-bottom: 1px solid var(--line-strong); }
  .settings-connection-section > header { display: flex; align-items: start; justify-content: space-between; gap: 24px; }
  .settings-connection-section h2, .settings-connector-catalog h2 { margin: 0; font-size: 17px; letter-spacing: -.02em; }
  .settings-connection-section header p, .settings-connector-catalog header p, .settings-connection-empty p { margin: 4px 0 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
  .settings-connection-list, .settings-connection-detail-list { display: grid; gap: 8px; }
  .settings-connection-empty { padding: 24px; border: 1px dashed var(--line-strong); border-radius: 10px; }
  .settings-connection-empty strong { font-size: 13px; font-weight: 500; }
  .settings-connection-row { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto auto; align-items: center; gap: 12px; padding: 12px 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface, transparent); }
  .settings-connection-row__identity { min-width: 0; display: grid; gap: 4px; }
  .settings-connection-row__identity strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 500; }
  .settings-connection-row__identity small { color: var(--muted); font-size: 11px; }
  .settings-connection-row__actions { grid-column: 2 / -1; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; border-top: 1px solid var(--line); padding-top: 12px; }
  .settings-connection-result, .settings-connection-tool { grid-column: 1 / -1; min-width: 0; }
  .settings-connection-output { max-height: 360px; max-width: 100%; overflow: auto; padding: 16px; border: 1px solid var(--line); border-radius: 8px; font: 12px/1.6 var(--font-mono, monospace); white-space: pre-wrap; overflow-wrap: anywhere; background: var(--rail); }
  .settings-connector-protocol { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
  .settings-connector-protocol > summary, .settings-connection-tool > summary { cursor: pointer; font-size: 13px; }
  .settings-connector-protocol[open] { display: grid; gap: 12px; }
  .settings-connector-protocol code { display: block; overflow-wrap: anywhere; }
  .settings-connector-protocol [data-protocol-result] { overflow-wrap: anywhere; }
  .settings-connection-inline { font-size: 12px; color: var(--muted); }
  .settings-connection-inline summary { cursor: pointer; }
  .settings-connection-inline form { display: flex; gap: 8px; margin-top: 8px; }
  .settings-connection-inline input { width: min(240px, 45vw); }
  .settings-connection-detail-list h3, .settings-connection-add-title { margin: 0 0 8px; font-size: 13px; font-weight: 500; }
  .settings-connector-catalog { display: grid; gap: 24px; padding-top: 32px; scroll-margin-top: 24px; }
  .settings-connector-group { display: grid; gap: 12px; }
  .settings-connector-group + .settings-connector-group { margin-top: 32px; }
  .settings-connector-group h2 { margin: 0; color: var(--muted); font-size: 13px; font-weight: var(--weight-title, 600); letter-spacing: -.01em; }
  .settings-connector-subgroup + .settings-connector-subgroup { margin-top: 16px; }
  .settings-connector-subgroup h3 { margin: 0 0 12px; color: var(--muted); font-size: 12px; font-weight: var(--weight-title, 600); letter-spacing: -.01em; }
  .settings-connectors-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 12px;
  }
  button.settings-connector-card {
    min-width: 0;
    padding: 16px;
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    align-items: start;
    gap: 12px;
    text-align: left;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }
  button.settings-connector-card:hover { background: var(--nav-hover); }
  button.settings-connector-card:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  button.settings-connector-card--placeholder { color: var(--ink-soft); }
  button.settings-connector-card--placeholder .settings-connector-card__copy { color: var(--faint, var(--muted)); }
  .settings-connector-card__body { min-width: 0; display: grid; gap: 8px; }
  .settings-connector-card__title { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .settings-connector-card__title strong { font-size: 15px; font-weight: var(--weight-control, 500); }
  .settings-connector-card__copy { color: var(--muted); font-size: 12px; line-height: 1.5; }
  .settings-connector-mark {
    width: 40px;
    height: 40px;
    padding: 8px;
    box-sizing: border-box;
    border-radius: 10px;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: var(--brand-tile-light);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 10%, transparent);
    flex: 0 0 auto;
  }
  .settings-connector-mark[data-on="light"] { color: var(--brand-tile-dark); }
  .settings-connector-mark[data-on="dark"] { background: var(--brand-tile-dark); box-shadow: none; }
  .settings-connector-mark img, .settings-connector-mark svg { width: 20px; height: 20px; display: block; object-fit: contain; stroke-width: 1.6; }
  .settings-connector-mark--fallback { background: var(--rail); color: var(--ink-soft); font-size: 11px; font-weight: 600; letter-spacing: -.05em; }
  .settings-connector-capabilities {
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
    list-style: none;
  }
  .settings-connector-capabilities li {
    display: grid;
    grid-template-columns: 4.5em minmax(0, 1fr);
    gap: 12px;
    color: var(--ink-soft);
    font-size: 13px;
    line-height: 1.5;
  }
  .settings-connector-capabilities span {
    color: var(--muted);
    font-size: 11px;
  }
  .settings-connector-capabilities [data-fulfillment="live"] span { color: var(--green); }
  .settings-connector-detail { padding: 8px 0 80px; display: grid; gap: 16px; max-width: 44rem; }
  .settings-connector-detail[hidden], [data-connectors-list][hidden] { display: none !important; }
  .settings-connector-detail__head { display: flex; align-items: center; gap: 12px; }
  .settings-connector-detail__head h2 { margin: 0; font-size: 20px; letter-spacing: -.02em; }
  .settings-connector-back { justify-self: start; }
  .settings-connector-auth { display: grid; gap: 16px; }
  .settings-connector-auth > p, .settings-connector-note { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.55; }
  .settings-connector-setup { display: grid; gap: 8px; }
  .settings-connector-setup > p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.55; }
  .settings-connector-setup ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }
  .settings-connector-setup a { width: fit-content; min-height: 28px; color: var(--blue-dark); font-size: 13px; text-decoration: underline; text-underline-offset: 3px; display: inline-flex; align-items: center; gap: 8px; }
  .settings-connector-setup a:hover { color: var(--ink); }
  .settings-connector-setup svg { width: 14px; height: 14px; flex: none; color: var(--muted); }
  .settings-connector-methods { display: grid; gap: 8px; padding: 12px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .settings-connector-methods > h3 { margin: 0; color: var(--ink); font-size: 13px; font-weight: 600; }
  .settings-connector-methods > ul { margin: 0; padding: 0; list-style: none; display: grid; }
  .settings-connector-method { min-width: 0; display: grid; gap: 4px; padding: 12px 0; border-top: 1px solid var(--line); }
  .settings-connector-method:first-child { border-top: 0; }
  .settings-connector-method__head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
  .settings-connector-method__head strong { font-size: 13px; font-weight: 600; }
  .settings-connector-method__head .settings-state { font-size: 11px; }
  .settings-connector-method p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
  .settings-connector-method ul { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 4px 16px; }
  .settings-connector-method a { width: fit-content; min-height: 26px; color: var(--blue-dark); font-size: 12px; text-decoration: underline; text-underline-offset: 3px; display: inline-flex; align-items: center; gap: 4px; overflow-wrap: anywhere; }
  .settings-connector-method a:hover { color: var(--ink); }
  .settings-connector-method a svg { width: 14px; height: 14px; flex: none; }
  .settings-connector-setup-extra summary { color: var(--muted); font-size: 12px; cursor: pointer; }
  .settings-connector-setup-extra .settings-connector-setup { padding: 8px 0 0; }
  .settings-connector-auth code { padding: 1px 4px; border: 1px solid var(--line); border-radius: 3px; color: var(--ink-soft); background: var(--rail); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .settings-connector-field { display: grid; gap: 8px; color: var(--ink-soft); font-size: 12px; }
  .settings-connector-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .settings-connector-extra { display: grid; gap: 12px; padding-top: 8px; border-top: 1px solid var(--line); }
  .settings-connector-extra summary { color: var(--muted); font-size: 12px; cursor: pointer; }
  .settings-connector-whoami { margin: 0; font-size: 13px; }
  .settings-paths { margin: 0; padding: 0 0 16px 48px; display: grid; gap: 4px; }
  .settings-paths > div { min-width: 0; display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 8px; }
  .settings-paths dt, .project-db-details dt, .diagnostics-summary dt, .runtime-plan-meta dt { color: var(--muted); font-size: 11px; font-weight: var(--weight-control, 500); }
  .settings-paths dd, .project-db-details dd, .diagnostics-summary dd, .runtime-plan-meta dd { min-width: 0; margin: 0; overflow-wrap: anywhere; color: var(--ink-soft); font-size: 12px; }
  .settings-footnote { max-width: 72ch; margin: 24px 0 0; color: var(--muted); font-size: 12px; }
  .settings-footnote code { padding: 1px 4px; border: 1px solid var(--line); border-radius: 3px; color: var(--ink-soft); background: var(--rail); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .settings-empty { padding: 32px 0 32px; color: var(--muted); }
  .settings-empty h2 { margin: 0; color: var(--ink); font-size: 15px; }
  .settings-empty p { margin: 4px 0 0; }
  .settings-action-section, .settings-import-row { padding: 24px 0; border-bottom: 1px solid var(--line-strong); display: grid; grid-template-columns: minmax(220px, .8fr) minmax(320px, 1.2fr); gap: 32px; align-items: start; }
  .settings-action-section h2, .settings-import-row h2, .launcher-section h2, .diagnostics-summary h2 { margin: 0; font-size: 15px; }
  .settings-action-section > div > p, .settings-import-row > div > p { margin: 4px 0 0; color: var(--muted); font-size: 12px; }
  .inline-settings-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: end; }
  .inline-settings-form > label:first-child { min-width: 0; display: grid; gap: 4px; color: var(--ink-soft); font-size: 12px; font-weight: var(--weight-control, 500); }
  .inline-settings-form input[type=text], .project-record-tools input { width: 100%; min-height: var(--control-h); padding: 0 12px; border: 1px solid var(--control-input); border-radius: var(--radius-control); color: var(--ink); background: var(--paper); }
  .inline-settings-form .inline-confirm { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; cursor: pointer; }
  .inline-settings-form .settings-form-error { grid-column: 1 / -1; }
  .settings-form-error { margin: 0; color: var(--red); font-size: 12px; }
  .project-general-page .settings-action-section { padding: 24px; margin-bottom: 12px; }
  .project-delete-section > button { justify-self: start; }
  /* The same in project settings on their own page and over the workbench (a settings cover). */
  :is(.settings-page, body.immersive-workbench) .project-delete-button:disabled { opacity: .5; cursor: not-allowed; }
  :is(.settings-page, body.immersive-workbench) .project-delete-dialog.runtime-plan-dialog { width: min(560px, calc(100vw - 28px)); height: fit-content; max-height: calc(100dvh - 28px); margin: auto; border-radius: var(--radius-surface); }
  .project-delete-dialog .runtime-plan-shell { height: auto; max-height: calc(100dvh - 28px); }
  .project-delete-dialog .runtime-plan-body > p:first-child { margin: 0; }
  .project-delete-dialog .settings-form-error { margin-top: 12px; }
  .project-delete-dialog header p { overflow-wrap: anywhere; }
  .project-record-tools { margin: -8px 0 16px 48px; display: flex; gap: 8px; }
  .project-record-tools details { min-width: min(100%, 280px); }
  .project-record-tools summary { min-height: 32px; padding: 0 8px; display: inline-flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; font-weight: 400; cursor: pointer; list-style: none; }
  .project-record-tools summary::-webkit-details-marker { display: none; }
  .project-record-tools summary svg:last-child { font-size: 11px; }
  .project-record-tools details[open] summary svg:last-child { transform: rotate(180deg); }
  .project-record-tools form, .project-db-details { width: min(100%, 440px); margin: 4px 0 0; padding: 12px; border: 1px solid var(--line); background: var(--rail); }
  .project-record-tools form { display: grid; gap: 8px; }
  .project-record-tools form label { display: grid; gap: 4px; color: var(--ink-soft); font-size: 12px; font-weight: var(--weight-control, 500); }
  .project-record-tools form button { justify-self: end; }
  .project-db-details { display: grid; gap: 8px; }
  .project-db-details > div { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 8px; }
  .connection-settings-section { margin-top: 32px; padding-top: 32px; border-top: 1px solid var(--line-strong); }
  .connection-settings-heading { max-width: 72ch; margin-bottom: 8px; }
  .connection-settings-heading h2 { margin: 0; font-size: 17px; letter-spacing: -.02em; }
  .connection-settings-heading p { margin: 8px 0 0; color: var(--muted); font-size: 12px; }
  .connection-record-list { border-bottom: 1px solid var(--line-strong); }
  .connection-record .settings-record-title p strong { color: var(--ink-soft); }
  .connection-record-tools { margin: -8px 0 16px 48px; display: flex; align-items: flex-start; gap: 12px; }
  .connection-record-tools details { min-width: min(100%, 300px); }
  .connection-record-tools summary { min-height: 32px; padding: 0 8px; display: inline-flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; font-weight: 400; cursor: pointer; list-style: none; }
  .connection-record-tools summary::-webkit-details-marker { display: none; }
  .connection-record-tools summary svg:last-child { font-size: 11px; }
  .connection-record-tools details[open] summary svg:last-child { transform: rotate(180deg); }
  .connection-action-form { width: min(100%, 460px); margin-top: 4px; padding: 12px; border: 1px solid var(--line); background: var(--rail); display: grid; gap: 12px; }
  .connection-action-form > label:not(.inline-confirm) { display: grid; gap: 4px; color: var(--ink-soft); font-size: 12px; font-weight: var(--weight-control, 500); }
  .connection-action-form select { width: 100%; min-height: var(--control-h); padding: 0 8px; border: 1px solid var(--control-input); border-radius: var(--radius-control); color: var(--ink); background: var(--paper); }
  .connection-action-form .inline-confirm { display: flex; align-items: flex-start; gap: 8px; color: var(--muted); font-size: 12px; cursor: pointer; }
  .connection-action-form .inline-confirm input { margin-top: 4px; }
  .connection-action-form > .mw-btn { justify-self: end; }
  .connection-action-form--danger > .mw-btn { color: var(--red); }
  .workspace-project-list { list-style: none; margin: -4px 0 12px 48px; padding: 0; width: min(100%, 620px); border-top: 1px solid var(--line); }
  .workspace-project-list li { min-height: 46px; padding: 8px 0; border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .workspace-project-list li > span { display: flex; align-items: center; gap: 8px; }
  .workspace-project-list form { display: flex; align-items: center; gap: 8px; }
  .workspace-project-list form .mw-btn { flex: none; }
  .workspace-project-list .settings-form-error { flex-basis: 100%; }
  .settings-import-row { border-top: 1px solid var(--line-strong); margin-top: 24px; }
  .settings-import-row > button { justify-self: end; }
  .diagnostics-summary { padding: 24px 0; border-bottom: 1px solid var(--line-strong); }
  .diagnostics-summary > div:first-child { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
  .diagnostics-summary dl { margin: 16px 0 0; display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid var(--line); }
  .diagnostics-summary dl > div { min-width: 0; padding: 12px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 12px; }
  .diagnostics-summary dl > div:nth-child(odd) { padding-right: 24px; }
  .launcher-section { padding: 24px 0 0; }
  .launcher-section ul { list-style: none; margin: 16px 0 0; padding: 0; border-top: 1px solid var(--line); }
  .launcher-section li { min-height: 60px; padding: 12px 0; border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .launcher-section li > span:first-child { min-width: 0; display: grid; grid-template-columns: 22px 50px minmax(0, 1fr); align-items: center; gap: 8px; }
  .launcher-section li small { min-width: 0; overflow-wrap: anywhere; color: var(--muted); }
  .service-action-row { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px; }
  .runtime-plan-dialog { width: min(680px, calc(100vw - 28px)); max-height: min(760px, calc(100dvh - 28px)); padding: 0; border: 1px solid var(--control-border); border-radius: var(--radius-surface); color: var(--ink); background: var(--paper); box-shadow: var(--control-shadow); }
  .runtime-plan-dialog::backdrop { background: var(--scrim); }
  .runtime-plan-shell { max-height: min(760px, calc(100dvh - 28px)); display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
  .runtime-plan-shell > header { padding: 24px 24px 16px; border-bottom: 1px solid var(--line); display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .runtime-plan-shell h2 { margin: 0; font-size: 20px; letter-spacing: -.02em; }
  .runtime-plan-shell header p { margin: 4px 0 0; color: var(--muted); }
  .runtime-plan-body { min-height: 0; overflow: auto; padding: 24px 24px; }
  .runtime-change-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
  .runtime-change-list li { padding: 12px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 8px 12px; }
  .runtime-change-list li > strong { font-size: 12px; }
  .runtime-change-list li > div { min-width: 0; }
  .runtime-change-list li p { margin: 0; overflow-wrap: anywhere; }
  .runtime-change-list li small { display: block; margin-top: 4px; color: var(--muted); overflow-wrap: anywhere; }
  .runtime-plan-meta { margin: 16px 0 0; display: grid; gap: 8px; }
  .runtime-plan-meta > div { display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 12px; }
  .runtime-plan-confirm { margin-top: 16px; padding: 12px; border: 1px solid var(--line); background: var(--page); display: flex; align-items: flex-start; gap: 8px; cursor: pointer; }
  .runtime-plan-confirm input { width: 16px; height: 16px; margin: 4px 0 0; accent-color: var(--focus); }
  .runtime-plan-shell > footer { padding: 16px 24px; border-top: 1px solid var(--line); background: var(--rail); display: flex; justify-content: flex-end; gap: 8px; }
  .runtime-plan-shell > footer .runtime-plan-apply:disabled { opacity: .55; cursor: not-allowed; }
  .settings-page .toast { position: fixed; right: 22px; bottom: 22px; z-index: 30; }
  @media (max-width: 760px) {
    .settings-connection-section > header { align-items: stretch; flex-direction: column; }
    .settings-connection-section > header .mw-btn { align-self: flex-start; }
    .settings-connection-row { grid-template-columns: 40px minmax(0, 1fr) auto; }
    .settings-connection-row > .mw-btn { grid-column: 2 / -1; justify-self: start; }
    .settings-connection-row__actions { grid-column: 1 / -1; }
    .settings-page > .topbar { height: 52px; min-height: 52px; }
    .settings-page .top-action { margin-right: 8px; padding-inline: 8px; }
    .settings-page .top-action span { display: none; }
    .settings-page .project-context small { display: none; }
    .settings-shell { min-height: 0; height: 100%; grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
    .settings-navigation { overflow-x: auto; overflow-y: hidden; padding: 8px 8px; border-right: 0; border-bottom: 1px solid var(--line-strong); flex-direction: row; }
    .settings-desktop-project,
    .settings-desktop-heading,
    .settings-navigation > .personal-sidebar-footer { display: none !important; }
    .settings-nav-body { display: contents; }
    .settings-nav-group { display: contents; }
    .settings-nav-label { display: none; }
    .settings-navigation a { min-width: max-content; min-height: 40px; grid-template-columns: 18px auto; }
    .settings-navigation small { display: none; }
    .settings-document { padding: 24px 16px 0; }
    .preference-section { grid-template-columns: 1fr; gap: 16px; }
    .preference-options--theme { grid-template-columns: 1fr; }
    .preference-options--language { grid-template-columns: 1fr; }
    .preference-option { min-height: 72px; }
    .settings-record > header { align-items: flex-start; }
    .settings-record-action { align-items: flex-end; flex-direction: column; }
    .settings-paths { padding-left: 0; }
    .settings-action-section, .settings-import-row { grid-template-columns: 1fr; gap: 16px; }
    .inline-settings-form { grid-template-columns: 1fr; }
    .inline-settings-form .inline-confirm, .inline-settings-form .settings-form-error { grid-column: 1; }
    .project-record-tools { margin-left: 0; flex-wrap: wrap; }
    .connection-record-tools { margin-left: 0; flex-wrap: wrap; }
    .workspace-project-list { margin-left: 0; }
    .workspace-project-list li { align-items: flex-start; flex-direction: column; }
    .connection-record-tools details { min-width: 100%; }
    .connection-action-form { width: 100%; }
    .connection-action-form select { font-size: 16px; }
    .settings-import-row > button { justify-self: start; }
    .diagnostics-summary dl { grid-template-columns: 1fr; }
    .diagnostics-summary dl > div:nth-child(odd) { padding-right: 0; }
    .runtime-plan-dialog { width: 100vw; max-width: none; height: 100vh; max-height: none; margin: 0; border-radius: 0; }
    .runtime-plan-shell { max-height: 100vh; height: 100%; }
    .runtime-change-list li { grid-template-columns: 1fr; gap: 4px; }
    .launcher-section li > span:first-child { grid-template-columns: 20px 42px minmax(0, 1fr); }
    .inline-settings-form input[type=text], .project-record-tools input { font-size: 16px; }
  }
  @media (max-width: 520px) {
    .preference-options--density { grid-template-columns: 1fr; }
  }
  .project-manager-index {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: var(--rail);
  }
  .project-manager-index-chrome { flex: none; padding: 24px 16px 12px; }
  .project-manager-index-chrome h1 { margin: 0; font-size: 13px; font-weight: var(--weight-title, 600); letter-spacing: -.015em; }
  .project-manager-index-chrome p { margin: 4px 0 0; color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  .project-manager-list { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 4px 8px 12px; scrollbar-color: var(--line-strong) transparent; }
  .project-manager-rows { min-width: 0; display: grid; gap: 4px; }
  .project-manager-row {
    position: relative;
    min-width: 0;
    min-height: 44px;
    padding: 8px 12px;
    border-radius: 6px;
    color: var(--ink-soft);
    display: grid;
    align-items: center;
    cursor: pointer;
  }
  .project-manager-row input { position: absolute; inset: 0; margin: 0; opacity: 0; cursor: pointer; }
  .project-manager-row > span { min-width: 0; display: grid; gap: 4px; }
  .project-manager-row strong { overflow: hidden; color: inherit; font-size: 13px; font-weight: var(--weight-control, 500); text-overflow: ellipsis; white-space: nowrap; }
  .project-manager-row small { overflow: hidden; color: var(--muted); font-size: 11px; font-weight: 400; text-overflow: ellipsis; white-space: nowrap; }
  .project-manager-row:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 4%, var(--rail)); }
  .project-manager-row:has(input:checked) { color: var(--ink); background: var(--nav-active); }
  .project-manager-row:has(input:checked) strong { font-weight: var(--weight-control, 500); }
  .project-manager-row:has(input:focus-visible) { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
  .project-manager-create-input { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); border: 0; }
  .project-manager-empty { margin: 16px 12px; color: var(--muted); font-size: 12px; }
  .project-manager-index-actions { flex: none; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 8px 12px 16px; }
  .project-manager-index-actions > * {
    min-height: 34px;
    padding: 0 12px;
    border: 0;
    border-radius: 6px;
    color: var(--muted);
    background: transparent;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font: inherit;
    font-size: 12px;
    font-weight: 400;
    cursor: pointer;
  }
  .project-manager-index-actions > *:hover { color: var(--ink); background: var(--nav-active); }
  .project-manager:has(#project-focus-create:checked) .project-manager-ghost { color: var(--ink); background: var(--nav-active); }
  .project-manager-index-actions svg { width: 14px; height: 14px; }
  .project-manager-stage { min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; background: var(--paper); scrollbar-color: var(--line-strong) transparent; }
  .project-manager-detail { width: 100%; max-width: none; min-width: 0; padding: 48px 48px 96px; box-sizing: border-box; }
  .project-manager-detail[hidden] { display: none; }
  .project-settings-document { width: 100%; max-width: 760px; min-width: 0; }
  .project-manager-hero { margin: 0 0 32px; display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
  .project-manager-hero h1, .project-manager-hero h2 { margin: 0; font-size: 24px; font-weight: var(--weight-title, 600); letter-spacing: -.03em; line-height: 1.2; overflow-wrap: anywhere; }
  .project-manager-hero p { max-width: 52ch; margin: 8px 0 0; color: var(--muted); font-size: 13px; line-height: 1.55; }
  .project-manager-open {
    flex: none;
    min-height: var(--control-h);
    padding: 0 var(--control-pad-x);
    border-radius: var(--radius-control);
    color: var(--action-ink);
    background: var(--action);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 400;
    text-decoration: none;
  }
  .project-manager-open:hover { background: color-mix(in srgb, var(--action) 88%, var(--action-ink)); }
  .project-manager-open:focus-visible, .project-settings-fold > summary:focus-visible, .project-manager-index-actions > *:focus-visible, .project-manager-create-form button:focus-visible, .project-delete-quiet:focus-visible, .project-manager-danger-actions button:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
  .project-settings-identity { margin: 0; min-width: 0; }
  .project-settings-identity .inline-settings-form { margin: 0; width: 100%; min-width: 0; }
  .project-settings-identity .inline-settings-form input[type=text] { min-height: var(--control-h); border-radius: var(--radius-control); }
  .project-manager-storage { margin: 16px 0 0; display: grid; gap: 4px; }
  .project-manager-storage > div { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; align-items: baseline; }
  .project-manager-storage dt { color: var(--muted); font-size: 12px; font-weight: var(--weight-control, 500); }
  .project-manager-storage dd { margin: 0; overflow-wrap: anywhere; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .project-settings-stack { margin: 32px 0 0; }
  .project-settings-fold { border: 0; }
  .project-settings-fold > summary {
    list-style: none;
    min-height: 40px;
    padding: 8px 0;
    color: var(--ink);
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    cursor: pointer;
    user-select: none;
  }
  .project-settings-fold > summary::-webkit-details-marker, .project-settings-fold > summary::marker { display: none; content: ""; }
  .project-settings-fold > summary:hover { color: var(--ink); }
  .project-settings-fold > summary:hover .project-settings-fold-chevron { color: var(--ink-soft); }
  .project-settings-fold strong { flex: none; color: inherit; font-size: 15px; font-weight: var(--weight-control, 500); letter-spacing: -.015em; }
  .project-settings-fold-chevron { display: grid; place-items: center; color: var(--faint); transition: transform 130ms var(--ease-quint), color 130ms var(--ease-quint); }
  .project-settings-fold-chevron svg { width: 16px; height: 16px; }
  .project-settings-fold[open] > summary { padding-bottom: 4px; }
  .project-settings-fold[open] > summary .project-settings-fold-chevron { transform: rotate(90deg); color: var(--ink-soft); }
  .project-settings-fold-body { padding: 4px 0 32px; min-width: 0; }
  .project-settings-fold-body > .guidance-document,
  .project-settings-fold-body > .settings-document,
  .project-settings-fold-body > .work-planning {
    width: 100%;
    max-width: none;
    min-height: 0;
    height: auto;
    padding: 0;
    overflow: visible;
    display: block;
  }
  .project-settings-fold-body .settings-body { height: auto; overflow: visible; padding-bottom: 0; }
  .project-settings-fold-body .guidance-page-header { padding: 0 0 16px; border: 0; justify-content: flex-start; }
  .project-settings-fold-body .guidance-page-header > div,
  .project-settings-fold-body .settings-heading,
  .project-settings-fold-body .planning-page-header > div:first-child { display: none; }
  .project-settings-fold-body .guidance-document:has(.guidance-empty) .guidance-page-header { display: none; }
  .project-settings-fold-body .planning-page-header { padding: 0 0 16px; border: 0; justify-content: flex-start; gap: 12px; }
  .project-settings-fold-body .guidance-layout { grid-template-columns: minmax(0, 1fr); gap: 32px; }
  .project-settings-fold-body .guidance-aside { padding-top: 0; position: static; display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
  .project-settings-fold-body .guidance-aside section { padding: 0; border-top: 0; }
  .project-settings-fold-body .guidance-empty { padding: 8px 0 8px; border: 0; text-align: left; }
  .project-settings-fold-body .guidance-empty svg { display: none; }
  .project-settings-fold-body .guidance-empty h2 { margin: 0; font-size: 15px; }
  .project-settings-fold-body .guidance-empty p { margin: 8px 0 16px; max-width: none; }
  .project-settings-fold-body .guidance-document:has(.guidance-empty) .guidance-aside,
  .project-settings-fold-body .guidance-document:has(.guidance-empty) .guidance-history { display: none; }
  .coding-settings details { margin-block: 12px; }
  .coding-settings summary { cursor: pointer; overflow-wrap: anywhere; }
  .coding-settings .coding-method-body { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 28rem; overflow: auto; font-family: var(--font-mono); font-size: 12px; line-height: 1.65; padding: 12px; background: var(--nav-hover); }
  .coding-settings .mw-select { max-width: 100%; }
  .project-settings-embed-pending { margin: 0; color: var(--muted); font-size: 13px; }
  .project-settings-hub { width: 100%; min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-color: var(--line-strong) transparent; }
  .project-manager-section { padding: 16px 0 0; }
  .project-manager-section + .project-manager-section { margin-top: 4px; border-top: 0; }
  .project-manager-section h3 { margin: 0 0 12px; font-size: 13px; font-weight: var(--weight-title, 600); letter-spacing: -.01em; }
  .project-manager-section > p { max-width: 58ch; margin: 0 0 12px; color: var(--muted); font-size: 12px; line-height: 1.55; }
  .project-manager-create-form { grid-template-columns: minmax(0, 1fr); max-width: 420px; }
  .project-manager .project-manager-create-form .mw-btn { justify-self: start; }
  .project-manager input[type=checkbox] { accent-color: var(--ink); }
  .project-manager-danger { margin: 56px 0 0; padding-top: 0; border-top: 0; }
  .project-manager-danger h3 { margin: 0 0 8px; font-size: 13px; font-weight: var(--weight-title, 600); }
  .project-manager-danger > p { max-width: 58ch; margin: 0 0 12px; color: var(--muted); font-size: 12px; line-height: 1.55; }
  .project-delete-quiet {
    padding: 0;
    border: 0;
    color: var(--muted);
    background: transparent;
    font: inherit;
    font-size: 13px;
    font-weight: 400;
    cursor: pointer;
  }
  .project-delete-quiet:hover { color: var(--red); }
  .project-manager-danger-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .project-manager .settings-footnote { margin-top: 32px; }
  @media (max-width: 760px) {
    .settings-content > .project-manager { grid-template-columns: 1fr; grid-template-rows: minmax(168px, 38vh) minmax(0, 1fr); }
    .project-manager-index { border-bottom: 1px solid var(--line); }
    .project-manager-index-actions { padding: 4px 8px 12px; }
    .project-manager-index-actions > * { font-weight: 400; }
    .project-manager-detail { padding: 24px 16px 72px; }
    .project-manager-hero { flex-direction: column; align-items: stretch; gap: 16px; }
    .project-manager-hero h1, .project-manager-hero h2 { font-size: 24px; }
    .project-manager-open, .project-manager-index-actions > *, .project-manager-danger-actions button, .project-delete-quiet, .project-settings-fold > summary { min-height: 44px; }
    .project-manager-create-form input, .project-settings-identity input { font-size: 16px; }
    .project-settings-fold-body .guidance-aside { grid-template-columns: 1fr; gap: 16px; }
  }
  body.settings-page[data-desktop-shell="true"][data-settings-section="projects"],
  body.settings-page[data-desktop-shell="true"][data-settings-section="project"] {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }
  body.settings-page[data-desktop-shell="true"]:is([data-settings-section="projects"], [data-settings-section="project"]) > .topbar {
    grid-column: 1;
    grid-row: 1;
    z-index: 1;
    padding: 0 16px;
    border: 0;
    border-bottom: 1px solid var(--line);
    border-radius: 0;
    background: var(--paper);
  }
  body.settings-page[data-desktop-shell="true"]:is([data-settings-section="projects"], [data-settings-section="project"]) > .topbar > .brand {
    position: static;
    left: auto;
    transform: none;
    display: flex;
    height: auto;
    padding: 0;
  }
  body.settings-page[data-desktop-shell="true"]:is([data-settings-section="projects"], [data-settings-section="project"]) > .topbar > .top-action {
    display: inline-flex;
  }
  body.settings-page[data-desktop-shell="true"]:is([data-settings-section="projects"], [data-settings-section="project"]) > .settings-shell {
    grid-column: 1;
    grid-row: 2;
    min-height: 0;
    height: auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }
  body.settings-page[data-desktop-shell="true"]:is([data-settings-section="projects"], [data-settings-section="project"]) .settings-content {
    grid-column: 1;
    grid-row: 1;
    padding: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--paper);
  }
  body.settings-page[data-desktop-shell="true"][data-settings-section="projects"] .project-manager {
    height: 100%;
    min-height: 0;
  }
`;

export const PROJECT_GUIDANCE_SETTINGS_STYLES = `
  .project-guidance-page .settings-content { max-width: none; }
  .guidance-document { width: min(100%, 1100px); margin: 0 auto; padding: 32px 48px 0; }
  .guidance-page-header { padding-bottom: 32px; border-bottom: 1px solid var(--line-strong); display: flex; align-items: flex-end; justify-content: space-between; gap: 32px; }
  .guidance-page-header h1 { margin: 0; color: var(--ink); font-size: 30px; letter-spacing: -.026em; }
  .guidance-page-header p { max-width: 68ch; margin: 8px 0 0; color: var(--muted); font-size: 13px; line-height: 1.65; }
  .guidance-layout { display: grid; grid-template-columns: minmax(0, 1fr) 250px; gap: 56px; align-items: start; }
  .guidance-editor { margin: 32px 0 4px; padding: 24px 24px; border: 1px solid var(--line); border-radius: 14px; background: var(--paper); box-shadow: var(--shadow-soft); animation: guidance-editor-reveal 250ms var(--ease-quint); }
  .guidance-editor[hidden] { display: none; }
  .guidance-editor > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .guidance-editor h2 { margin: 0; font-size: 17px; letter-spacing: -.015em; }
  .guidance-editor header p { margin: 4px 0 0; color: var(--muted); font-size: 11px; line-height: 1.5; }
  .guidance-editor form { margin-top: 16px; display: grid; gap: 16px; }
  .guidance-editor-fields { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 16px; }
  .guidance-editor-fields[hidden] { display: none; }
  .guidance-editor label { min-width: 0; display: grid; gap: 8px; color: var(--ink-soft); font-size: 11px; font-weight: var(--weight-control, 500); }
  .guidance-editor select, .guidance-editor textarea { width: 100%; border: 1px solid var(--line-strong); border-radius: 8px; color: var(--ink); background: var(--paper); font: inherit; }
  .guidance-editor select { min-height: 39px; padding: 0 12px; }
  .guidance-editor textarea { min-height: 86px; padding: 12px 12px; resize: vertical; line-height: 1.6; }
  .guidance-editor textarea[name=reason] { min-height: 66px; }
  .guidance-editor select:focus, .guidance-editor textarea:focus { border-color: var(--ink); outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
  .guidance-editor-preview { margin: 0; padding: 12px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); color: var(--ink-soft); font-size: 13px; line-height: 1.65; white-space: pre-wrap; }
  .guidance-editor-preview[hidden] { display: none; }
  .guidance-editor-error { margin: 0; padding: 12px 12px; border-radius: 8px; color: var(--red); background: var(--red-soft); font-size: 11px; }
  .guidance-editor footer { display: flex; justify-content: flex-end; gap: 8px; }
  .guidance-content { min-width: 0; }
  .guidance-empty { padding: 72px 24px; border-bottom: 1px solid var(--line); text-align: center; }
  .guidance-empty svg { width: 28px; height: 28px; color: var(--muted); }
  .guidance-empty h2 { margin: 16px 0 0; font-size: 17px; }
  .guidance-empty p { max-width: 56ch; margin: 8px auto 16px; color: var(--muted); font-size: 12px; line-height: 1.65; }
  .guidance-section { padding: 32px 0 32px; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 142px minmax(0, 1fr); gap: 32px; }
  .guidance-section-heading { align-self: start; position: sticky; top: 18px; }
  .guidance-section-heading h2 { margin: 0; color: var(--ink); font-size: 13px; }
  .guidance-section-heading p { margin: 4px 0 0; color: var(--faint); font-size: 11px; line-height: 1.5; }
  .guidance-entry-list { min-width: 0; display: grid; }
  .guidance-entry { min-width: 0; padding: 0 0 24px; }
  .guidance-entry + .guidance-entry { padding-top: 24px; border-top: 1px solid var(--line); }
  .guidance-entry:last-child { padding-bottom: 0; }
  .guidance-entry p { max-width: 72ch; margin: 0; color: var(--ink-soft); font-size: 13px; line-height: 1.78; white-space: pre-wrap; overflow-wrap: anywhere; }
  .guidance-entry footer { margin-top: 12px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .guidance-entry-meta { color: var(--faint); font-size: 11px; font-variant-numeric: tabular-nums; }
  .guidance-entry-actions { display: flex; gap: 12px; }
  .guidance-aside { padding-top: 32px; position: sticky; top: 0; }
  .guidance-aside section { padding: 16px 0; border-top: 1px solid var(--line-strong); }
  .guidance-aside h2 { margin: 0; font-size: 12px; }
  .guidance-aside p { margin: 8px 0 0; color: var(--muted); font-size: 11px; line-height: 1.6; }
  .guidance-aside dl { margin: 12px 0 0; display: grid; gap: 8px; }
  .guidance-aside dl div { display: flex; justify-content: space-between; gap: 12px; }
  .guidance-aside dt, .guidance-aside dd { margin: 0; font-size: 11px; }
  .guidance-aside dt { color: var(--muted); }
  .guidance-aside dd { color: var(--ink); font-weight: 400; font-variant-numeric: tabular-nums; }
  .guidance-inactive-list { margin: 12px 0 0; padding: 0; list-style: none; display: grid; gap: 12px; }
  .guidance-inactive-list li { padding-top: 12px; border-top: 1px solid var(--line); }
  .guidance-inactive-list p { margin: 0; display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
  .guidance-inactive-list button { margin-top: 8px; }
  .guidance-history { margin-top: 48px; border-top: 1px solid var(--line-strong); }
  .guidance-history > summary { min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 16px; color: var(--ink); font-size: 13px; font-weight: 400; cursor: pointer; list-style: none; }
  .guidance-history > summary::-webkit-details-marker { display: none; }
  .guidance-history > summary span { color: var(--muted); font-size: 11px; font-weight: 400; }
  .guidance-history-list { border-top: 1px solid var(--line); }
  .guidance-history-row { padding: 16px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 88px minmax(0, 1fr) auto; gap: 16px; }
  .guidance-history-row strong { font-size: 11px; }
  .guidance-history-row p { margin: 4px 0 0; color: var(--ink-soft); font-size: 11px; line-height: 1.55; white-space: pre-wrap; }
  .guidance-history-row time { color: var(--faint); font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .guidance-history-state { margin-top: 4px; color: var(--ink-soft); font-size: 11px; font-weight: 400; }
  .guidance-history-state--inactive { color: var(--muted); }
  .guidance-history-entry { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line); }
  .guidance-history-entry > summary { min-height: 30px; color: var(--ink); display: inline-flex; align-items: center; font-size: 11px; font-weight: 400; text-underline-offset: 3px; cursor: pointer; }
  .guidance-history-entry > summary:hover { text-decoration: underline; }
  .guidance-history-entry[open] > summary { margin-bottom: 12px; }
  .guidance-history-full { display: grid; gap: 12px; }
  .guidance-history-full > div { display: grid; gap: 4px; }
  .guidance-history-full dt { color: var(--faint); font-size: 11px; font-weight: var(--weight-control, 500); }
  .guidance-history-full dd { margin: 0; color: var(--ink-soft); font-size: 11px; line-height: 1.6; overflow-wrap: anywhere; white-space: pre-wrap; }
  @keyframes guidance-editor-reveal {
    from { opacity: .4; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (max-width: 1180px) {
    .guidance-layout { grid-template-columns: minmax(0, 1fr); gap: 12px; }
    .guidance-aside { position: static; padding-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
  }
  @media (max-width: 760px) {
    .guidance-document { padding: 24px 16px 0; }
    .guidance-page-header { align-items: stretch; flex-direction: column; gap: 16px; }
    .guidance-page-header h1 { font-size: 24px; }
    .guidance-page-header .mw-btn--primary { align-self: flex-start; }
    .guidance-editor { margin-top: 24px; padding: 16px; }
    .guidance-editor-fields { grid-template-columns: 1fr; }
    .guidance-editor select, .guidance-editor textarea { font-size: 16px; }
    .guidance-section { grid-template-columns: 1fr; gap: 16px; }
    .guidance-section-heading { position: static; }
    .guidance-aside { grid-template-columns: 1fr; gap: 0; }
    .guidance-entry-actions .mw-btn { min-height: 44px; padding: 0 8px; display: inline-flex; align-items: center; justify-content: center; }
    .guidance-entry-actions { gap: 4px; }
    .guidance-inactive-list button { margin-top: 4px; }
    .guidance-history-entry > summary { min-height: 44px; }
    .guidance-history-row { grid-template-columns: 76px minmax(0, 1fr); }
    .guidance-history-row time { grid-column: 2; }
  }
`;

export const SETTINGS_IA_NAV_STYLES = `
  body.settings-page .settings-navigation.settings-navigation--codex {
    min-height: 0;
    padding: 16px 12px 24px;
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow: hidden;
  }
  body.settings-page[data-desktop-shell="true"] .settings-navigation.settings-navigation--codex {
    display: flex;
    flex-direction: column;
    grid-template-rows: none;
    padding: 16px 12px 32px;
    overflow: hidden;
  }
  body.settings-page .settings-navigation--codex .settings-nav-back {
    min-height: 32px;
    margin: 0 0 12px;
    padding: 0 8px;
    display: flex;
    align-items: center;
    color: var(--muted);
    text-decoration: none;
    font-size: 13px;
  }
  body.settings-page .settings-navigation--codex .settings-nav-back:hover { color: var(--ink); background: transparent; box-shadow: none; }
  body.settings-page .settings-navigation--codex .settings-nav-back svg { width: 14px; height: 14px; flex: none; transform: rotate(180deg); }
  body.settings-page .settings-navigation--codex .settings-nav-body {
    min-height: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    overflow: auto;
    overscroll-behavior: contain;
    grid-row: auto;
  }
  body.settings-page .settings-navigation--codex .settings-nav-group-label {
    padding: 16px 8px 8px;
    color: var(--faint);
    font-size: 12px;
    font-weight: var(--weight-control, 500);
    letter-spacing: 0;
  }
  body.settings-page .settings-navigation--codex .settings-nav-body > a {
    min-height: 36px;
    padding: 0 12px;
    border-radius: 8px;
    color: var(--ink);
    display: flex;
    align-items: center;
    grid-template-columns: none;
    font-size: 13px;
    font-weight: 400;
  }
  body.settings-page .settings-navigation--codex .settings-nav-body > a:hover { background: var(--nav-hover, color-mix(in srgb, var(--ink) 6%, transparent)); box-shadow: none; }
  body.settings-page .settings-navigation--codex .settings-nav-body > a[aria-current="page"] {
    color: var(--ink);
    background: var(--nav-active);
    box-shadow: none;
    font-weight: 400;
  }
  html[data-resolved-theme="dark"] body.settings-page .settings-navigation--codex .settings-nav-body > a[aria-current="page"] { background: var(--nav-active); }
  @container settings-content (max-width: 620px) {
    .preference-section, .settings-action-section, .settings-import-row { grid-template-columns: minmax(0, 1fr); gap: 16px; padding-block: 24px; }
    .settings-record > header { align-items: flex-start; flex-wrap: wrap; gap: 16px; }
    .settings-record-action { flex-wrap: wrap; }
    .settings-document { padding-top: 24px; }
    .inline-settings-form { grid-template-columns: minmax(0, 1fr); }
    .inline-settings-form > button { justify-self: start; }
  }
  @media (max-width: 760px) {
    body.settings-page .settings-navigation.settings-navigation--codex { flex-direction: row; align-items: center; overflow-x: auto; overflow-y: hidden; }
    body.settings-page .settings-navigation--codex .settings-nav-back { margin: 0 8px 0 0; }
    body.settings-page .settings-navigation--codex .settings-nav-body { flex-direction: row; align-items: center; overflow: visible; }
    body.settings-page .settings-navigation--codex .settings-nav-group-label { display: none; }
    body.settings-page .settings-navigation--codex .settings-nav-body > a { min-width: max-content; }
  }
${CONNECTOR_EXPERIENCE_STYLES}
`;
