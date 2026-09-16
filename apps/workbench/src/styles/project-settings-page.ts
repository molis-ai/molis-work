/** Independent project preferences: one navigation rail and one content scroll. */
export const PROJECT_SETTINGS_PAGE_STYLES = `
  body.settings-page.project-preferences-page { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: 44px minmax(0, 1fr); background: var(--paper); }
  .project-preferences-chrome { height: 44px; display: flex; align-items: center; justify-content: space-between; padding: 0 14px 0 22px; border-bottom: 1px solid var(--line); color: var(--muted); background: var(--paper); font-size: 12px; }
  .project-preferences-chrome > a { display: grid; place-items: center; width: 32px; height: 32px; color: var(--muted); border-radius: 8px; }
  .project-preferences-chrome > a:hover { color: var(--ink); background: var(--nav-hover); }
  .project-preferences-chrome svg { width: 16px; height: 16px; }
  body.project-preferences-page[data-native-desktop="true"] .project-preferences-chrome { padding-left: 84px; }
  body.project-preferences-page .settings-shell { grid-template-columns: 224px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
  body.project-preferences-page .settings-navigation.settings-navigation--codex { padding: 16px 12px; border-color: var(--line); background: var(--nav-bg); }
  .settings-project-identity { display: grid; gap: 5px; padding: 16px 10px 24px; min-width: 0; }
  .settings-project-identity strong { font-size: 14px; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .settings-project-identity > span { font-size: 12px; color: var(--muted); }
  body.project-preferences-page .settings-content { display: block; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; padding: 24px clamp(20px, 3vw, 40px) 40px; }
  body.project-preferences-page .settings-content > :is(.project-settings-page, .settings-document, .guidance-document, .work-planning, .planning-catalog, .planning-detail, .planning-edit) { display: block; width: 100%; max-width: 920px; height: auto; min-height: 0; overflow: visible; margin: 0 auto; padding: 0; }
  .project-preferences-page .settings-body { display: block; overflow: visible; min-height: 0; padding: 0; }
  .project-preferences-page :is(.settings-page-heading, .settings-heading, .guidance-page-header, .planning-page-header, .planning-detail-header) { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; max-width: none; margin: 0 0 20px; padding: 0; border: 0; }
  .project-preferences-page .settings-page-heading, .project-preferences-page .settings-heading { display: block; }
  .project-preferences-page :is(.settings-page-heading, .settings-heading, .guidance-page-header, .planning-page-header, .planning-detail-header) h1 { margin: 0; font-size: 20px; font-weight: 600; line-height: 1.4; letter-spacing: -.025em; }
  .project-preferences-page :is(.settings-page-heading, .settings-heading, .guidance-page-header, .planning-page-header, .planning-detail-header) p { max-width: 64ch; margin: 8px 0 0; font-size: 13px; line-height: 1.7; color: var(--muted); }
  .project-preferences-page :is(.settings-section, .settings-advanced) { margin: 0; padding: 0; }
  .project-preferences-page .settings-section + .settings-section { margin-top: 24px; }
  .project-preferences-page :is(.settings-section > h2, .work-planning-section-header h2) { margin: 0 0 6px; font-size: 14px; font-weight: 600; }
  .settings-setting-row { display: flex; align-items: center; justify-content: space-between; gap: 24px; min-width: 0; margin: 0; padding: 14px 0; border-bottom: 1px solid var(--line); }
  .setting-copy { display: grid; gap: 5px; min-width: 0; color: var(--ink); }
  .setting-copy > strong { font-size: 13px; font-weight: 550; line-height: 1.5; }
  .setting-copy > span { color: var(--muted); font-size: 12px; line-height: 1.6; }
  .setting-number { display: flex; gap: 8px; align-items: center; color: var(--muted); font-size: 12px; }
  .setting-value { display: flex; align-items: center; flex: none; gap: 8px; max-width: 100%; }
  .project-name-form { flex-wrap: wrap; }
  .project-name-form input { width: 220px; min-width: 0; }
  .project-name-form .settings-form-error { flex-basis: 100%; margin: 0; }
  .project-preferences-page :is(input:not([type=checkbox]):not([type=radio]), select, textarea) { max-width: 100%; min-height: 36px; padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--paper); color: var(--ink); font: inherit; font-size: 13px; box-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 3%, transparent); }
  .project-preferences-page select { padding-right: 30px; }
  .project-preferences-page textarea { width: 100%; resize: vertical; line-height: 1.65; }
  .project-preferences-page button { font-size: 12px; font-weight: 500; }
  .project-preferences-page :is(button, a, input, select, textarea, summary) { transition: background-color var(--motion-fast, 120ms) ease, border-color var(--motion-fast, 120ms) ease, color var(--motion-fast, 120ms) ease; }
  .project-preferences-page :is(button, a, input, select, textarea, summary):focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
  .settings-data-disclosure, .settings-advanced { border-bottom: 1px solid var(--line); }
  .project-preferences-page :is(.settings-data-disclosure, .settings-advanced) > summary { list-style: none; display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 52px; padding: 12px 0; cursor: pointer; }
  .project-preferences-page summary::-webkit-details-marker { display: none; }
  .project-preferences-page :is(.settings-data-disclosure, .settings-advanced) > summary > svg { flex: none; width: 14px; height: 14px; color: var(--muted); transition: transform 160ms ease; }
  .project-preferences-page :is(.settings-data-disclosure, .settings-advanced)[open] > summary > svg { transform: rotate(180deg); }
  .settings-data-list { margin: 0; padding: 0 0 20px; display: grid; gap: 12px; }
  .settings-data-list > div { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 18px; font-size: 12px; line-height: 1.6; }
  .settings-data-list dt { color: var(--muted); }
  .settings-data-list dd { margin: 0; overflow-wrap: anywhere; font-family: var(--font-mono, monospace); }
  .project-preferences-page .project-manager-danger { margin: 0; padding: 18px 0; border: 0; background: none; }
  .project-preferences-page .project-manager-danger h3 { margin: 0 0 6px; font-size: 13px; font-weight: 550; }
  .project-preferences-page .project-manager-danger p { max-width: 62ch; margin: 0 0 16px; font-size: 12px; line-height: 1.65; color: var(--muted); }
  .project-preferences-page .project-manager-danger-actions { display: flex; gap: 8px; }
  .project-preferences-page .settings-toggle-row { cursor: pointer; }
  .project-preferences-page input.settings-switch { appearance: none; position: relative; flex: none; width: 34px; height: 20px; margin: 0; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--line-strong); cursor: pointer; }
  .project-preferences-page input.settings-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--paper); box-shadow: 0 1px 2px #0002; transition: transform 160ms ease; }
  .project-preferences-page input.settings-switch:checked { background: var(--ink); border-color: var(--ink); }
  .project-preferences-page input.settings-switch:checked::after { transform: translateX(14px); }
  .project-preferences-page .settings-last-change > p { margin: 0 0 16px; color: var(--muted); white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
  .project-preferences-page .settings-rules-form { margin-top: 24px; }
  .project-preferences-page .settings-rules-form .settings-advanced .settings-setting-row:last-child { border: 0; }
  .project-preferences-page .settings-setting-row > input:not([type=checkbox]) { width: 240px; }
  .project-preferences-page .settings-setting-row input[type=number] { width: 90px; }
  .project-preferences-page .settings-change-reason { display: grid; gap: 10px; margin-top: 28px; }
  .project-preferences-page .settings-save-footer { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-top: 20px; padding: 0; border: 0; }
  .project-preferences-page .settings-save-footer > p, .settings-footnote { color: var(--muted); font-size: 12px; line-height: 1.65; }
  .project-preferences-page .settings-save-footer button { flex: none; }
  .project-preferences-page .settings-state-note { margin: 0; color: var(--muted); font-size: 12px; }
  .project-preferences-page .guidance-section { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 0 20px; padding: 14px 0; border-bottom: 1px solid var(--line); }
  .project-preferences-page .guidance-section-heading { position: static; }
  .project-preferences-page .guidance-section-heading h2 { margin: 0; font-size: 13px; font-weight: 550; }
  .project-preferences-page .guidance-section-heading p { margin: 5px 0 0; color: var(--muted); font-size: 12px; }
  .project-preferences-page .guidance-category-add { display: flex; align-items: center; gap: 5px; min-height: 32px; padding: 0 8px; border-radius: 8px; }
  .project-preferences-page .guidance-category-add svg { width: 13px; height: 13px; }
  .project-preferences-page .guidance-entry-list { grid-column: 1 / -1; }
  .project-preferences-page .guidance-entry { margin-top: 14px; padding: 14px 16px; background: var(--nav-bg); border: 0; border-radius: 8px; }
  .project-preferences-page .guidance-entry > p { margin: 0; font-size: 13px; line-height: 1.75; }
  .project-preferences-page .guidance-entry footer { margin-top: 8px; }
  .project-preferences-page .guidance-entry-meta { font-size: 11px; }
  .project-preferences-page .guidance-editor { margin: 0 0 24px; padding: 20px; background: var(--nav-bg); border: 1px solid var(--line); border-radius: 12px; box-shadow: none; }
  .project-preferences-page .guidance-editor-fields { grid-template-columns: 1fr; gap: 16px; }
  .project-preferences-page .guidance-editor label { font-size: 12px; }
  .project-preferences-page .guidance-editor select { width: 180px; }
  .project-preferences-page .guidance-history, .project-preferences-page .guidance-inactive { padding: 0; margin: 0; }
  .project-preferences-page .guidance-history-list { padding-bottom: 16px; }
  .project-preferences-page .settings-footnote { margin: 20px 0 0; }
  .project-preferences-page .planning-page-header > div:last-child:not(:first-child) { display: flex; flex-wrap: wrap; flex: none; gap: 8px; align-items: center; }
  .project-preferences-page .planning-page-header { flex-wrap: wrap; }
  .project-preferences-page :is(.planning-primary-action, .planning-secondary-action, .guidance-primary-action) { min-height: 34px; padding: 7px 11px; border-radius: 8px; font-size: 12px; white-space: nowrap; }
  .project-preferences-page .work-planning-section-header { margin: 0 0 18px; }
  .project-preferences-page .work-planning-section-header p { margin: 5px 0 0; color: var(--muted); font-size: 12px; line-height: 1.65; }
  .project-preferences-page .planning-composition-section { padding: 0 0 28px; margin: 0; border-bottom: 1px solid var(--line); }
  .project-preferences-page .work-planning-empty { text-align: left; padding: 18px 20px; background: var(--nav-bg); border: 0; border-radius: 8px; }
  .project-preferences-page .work-planning-empty h3 { margin: 0 0 6px; font-size: 13px; }
  .project-preferences-page .work-planning-empty p { margin: 0; font-size: 12px; line-height: 1.7; color: var(--muted); }
  .project-preferences-page .planning-adoption-section { margin-top: 28px; }
  .project-preferences-page .planning-adoption-tools { grid-template-columns: 1fr; display: grid; gap: 12px; margin-bottom: 8px; }
  .project-preferences-page [data-planning-search] { width: 100%; }
  .project-preferences-page .planning-filters { display: flex; flex-wrap: wrap; gap: 4px; }
  .project-preferences-page .planning-filters button { min-height: 30px; padding: 5px 10px; border: 0; border-radius: 6px; color: var(--muted); background: transparent; font-size: 12px; }
  .project-preferences-page .planning-filters button[aria-pressed=true] { background: var(--nav-active); color: var(--ink); }
  .project-preferences-page .planning-adoption-grid { display: block; }
  .project-preferences-page .planning-adoption-card { display: grid; min-height: 0; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto auto; align-content: start; gap: 8px 20px; padding: 14px 0; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; box-shadow: none; }
  .project-preferences-page .planning-adoption-card[hidden] { display: none; }
  .project-preferences-page .planning-adoption-card > header { grid-column: 1; display: flex; justify-content: flex-start; gap: 8px; }
  .project-preferences-page .planning-adoption-copy { grid-column: 1; }
  .project-preferences-page .planning-adoption-copy h3 { margin: 0 0 5px; font-size: 14px; font-weight: 550; }
  .project-preferences-page .planning-adoption-copy p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.7; }
  .project-preferences-page .planning-adoption-card > footer { grid-column: 2; grid-row: 1 / 3; flex-direction: column-reverse; align-items: flex-end; justify-content: center; gap: 8px; margin: 0; padding: 0; border: 0; }
  .project-preferences-page .planning-adoption-card > footer > span { font-size: 11px; color: var(--muted); }
  .project-preferences-page .planning-card-kind, .project-preferences-page .planning-card-scope { padding: 0; background: transparent; border: 0; color: var(--muted); font-size: 11px; }
  @media (max-width: 760px) {
    body.project-preferences-page { --control-h: 44px; }
    .project-preferences-page .project-preferences-chrome > a { width: 44px; height: 44px; }
    body.project-preferences-page .settings-shell { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
    body.project-preferences-page .settings-navigation.settings-navigation--codex { display: flex; flex-direction: column; align-items: stretch; padding: 8px 14px; border-right: 0; border-bottom: 1px solid var(--line); overflow: visible; }
    body.project-preferences-page .settings-navigation--codex .settings-nav-back { align-self: flex-start; margin: 0 0 6px; min-height: 44px; }
    .project-preferences-page .settings-project-identity { display: none; }
    body.project-preferences-page .settings-navigation--codex .settings-nav-body { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 2px; overflow: visible; }
    body.project-preferences-page .settings-navigation--codex .settings-nav-body > a { justify-content: center; min-width: 0; min-height: 44px; padding: 0 6px; font-size: 12px; }
    body.project-preferences-page .settings-navigation--codex .settings-nav-body > a svg { display: none; }
    body.project-preferences-page .settings-content { padding: 24px 20px 48px; scrollbar-gutter: auto; }
    .project-preferences-page :is(.settings-page-heading, .settings-heading, .guidance-page-header, .planning-page-header, .planning-detail-header) { gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
    .project-preferences-page :is(.settings-page-heading, .settings-heading, .guidance-page-header, .planning-page-header, .planning-detail-header) h1 { font-size: 20px; }
    .settings-setting-row { gap: 16px; }
    .project-preferences-page .settings-setting-row:not(.settings-toggle-row) { align-items: stretch; flex-direction: column; }
    .setting-value { flex: auto; }
    .project-name-form .setting-value input { flex: 1; width: 100%; }
    .project-preferences-page :is(input:not([type=checkbox]):not([type=radio]), select, textarea) { font-size: 16px; min-height: 44px; }
    .project-preferences-page button, .project-preferences-page :is(.planning-primary-action, .planning-secondary-action, .guidance-primary-action, .guidance-text-action) { min-height: 44px; }
    body.project-preferences-page .planning-filters button, body.project-preferences-page .guidance-text-action { min-height: 44px; }
    .project-preferences-page .settings-save-footer { flex-direction: column; align-items: stretch; }
    .project-preferences-page .guidance-page-header { flex-direction: row; }
    .project-preferences-page .guidance-entry footer { flex-wrap: wrap; }
    .project-preferences-page .guidance-editor { padding: 16px; }
    .project-preferences-page .planning-adoption-card { gap: 8px 12px; }
    .project-preferences-page .planning-adoption-card > footer { grid-row: auto; grid-column: 1 / -1; flex-direction: row; align-items: center; justify-content: space-between; }
    .project-preferences-page .planning-adoption-card > header, .project-preferences-page .planning-adoption-copy { grid-column: 1 / -1; }
    .settings-data-list > div { grid-template-columns: 1fr; gap: 4px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .project-preferences-page *, .project-preferences-page *::after { transition: none !important; animation: none !important; }
  }

  .settings-segmented { display: flex; flex: none; padding: 3px; gap: 2px; border: 1px solid var(--line); border-radius: 9px; background: var(--nav-bg); }
  .settings-segmented > :is(button, a) { display: flex; align-items: center; justify-content: center; min-height: 30px; padding: 0 12px; border: 1px solid transparent; border-radius: 6px; color: var(--muted); background: transparent; text-decoration: none; font-size: 12px; white-space: nowrap; box-shadow: none; }
  .settings-segmented > :is([aria-pressed="true"], [aria-current="true"]) { border-color: var(--line); color: var(--ink); background: var(--paper); box-shadow: 0 1px 2px #0001; }
  .project-preferences-page .settings-record-list { gap: 0; }
  .project-preferences-page .settings-record { padding: 22px 0; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; box-shadow: none; }
  .project-preferences-page .settings-record-title .record-icon { display: none; }
  .project-preferences-page .settings-record-title h2 { font-size: 14px; margin: 0 0 5px; }
  .project-preferences-page .settings-record-title p { max-width: 48ch; margin: 0; color: var(--muted); font-size: 12px; line-height: 1.7; }
  .project-preferences-page .settings-record .settings-data-disclosure { border: 0; }
  .project-preferences-page .settings-record .settings-data-disclosure > summary { min-height: 0; padding: 14px 0 0; justify-content: flex-start; gap: 8px; color: var(--muted); font-size: 11px; }
  .project-preferences-page .settings-paths { padding: 16px 0 0; margin: 0; background: transparent; border: 0; }
  .project-preferences-page .settings-paths dd { overflow-wrap: anywhere; }
  .project-preferences-page .diagnostics-summary { margin: 0 0 20px; padding: 20px 0; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; }
  .project-preferences-page .diagnostics-summary h2, .project-preferences-page .launcher-section h2 { font-size: 14px; }
  .project-preferences-page .diagnostics-summary dl { grid-template-columns: 1fr; }
  .project-preferences-page .diagnostics-summary dl > div { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 16px; }
  .project-preferences-page .diagnostics-summary dd { overflow-wrap: anywhere; }
  .project-preferences-page .launcher-section { margin: 0 0 20px; }
  .project-preferences-page .launcher-section ul { padding: 0; border: 0; background: transparent; }
  .project-preferences-page .launcher-section li { border-radius: 0; border-bottom: 1px solid var(--line); padding: 14px 0; }
  .project-preferences-page .planning-card-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .project-preferences-page .planning-card { min-height: 0; padding: 20px; border: 1px solid var(--line); border-radius: 10px; box-shadow: none; background: var(--paper); }
  .project-preferences-page .planning-library-note { margin: 20px 0; padding: 12px 0; border: 0; background: transparent; }
  .project-preferences-page .planning-detail-layout { grid-template-columns: minmax(0, 1fr); }
  .project-preferences-page .planning-edit-section { padding: 20px 0; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; }
  body.project-preferences-page .settings-shell--standalone { grid-template-columns: minmax(0, 1fr); }
  @media (max-width: 760px) {
    .project-preferences-page .settings-nav-group-label { display: none; }
    .settings-segmented { width: 100%; }
    .settings-segmented > :is(button, a) { flex: 1; min-height: 44px; padding: 0 8px; }
    .project-preferences-page .settings-record > header { flex-direction: column; align-items: stretch; gap: 14px; }
    .project-preferences-page .settings-record-action { justify-content: space-between; }
    .project-preferences-page .planning-card-grid { grid-template-columns: minmax(0, 1fr); }
    .project-preferences-page .diagnostics-summary dl > div { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  }


  .project-preferences-page .settings-record > header { min-height: 0; padding: 0; }
  @media (max-width: 760px) {
    .project-preferences-page .settings-record-action { flex-direction: row; align-items: center; }
    .project-preferences-page .settings-record .settings-data-disclosure > summary { min-height: 44px; padding: 8px 0; }
  }

  /* Editing gets the available panel, with actions outside the field scroll. */
  body.project-preferences-page .settings-content:has(> .project-rules-document),
  body.project-preferences-page .settings-content:has(.guidance-editor:not([hidden])) { display: flex; overflow: hidden; padding: 20px clamp(24px, 4vw, 56px) 0; }
  body.project-preferences-page .settings-content > .project-rules-document,
  body.project-preferences-page .settings-content > .guidance-document:has(.guidance-editor:not([hidden])) { display: flex; flex: 1; flex-direction: column; overflow: hidden; }
  .project-preferences-page .project-rules-document > .settings-heading { flex: none; margin-bottom: 16px; }
  .project-preferences-page .project-rules-document > .settings-heading p { margin-top: 4px; }
  .project-preferences-page .project-rules-document > .settings-body,
  .project-preferences-page .guidance-document:has(.guidance-editor:not([hidden])) > .settings-body { display: flex; flex: 1; min-height: 0; overflow: hidden; flex-direction: column; }
  .project-preferences-page .settings-rules-form { display: flex; flex: 1; min-height: 0; flex-direction: column; margin: 0; overflow: hidden; }
  .project-preferences-page :is(.settings-rules-fields, .guidance-editor-body) { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; padding: 4px 8px 20px 4px; }
  .project-preferences-page .settings-rules-fields > .settings-state-note { margin-bottom: 16px; }
  .project-preferences-page :is(.settings-rules-actions, .guidance-editor-actions) { flex: none; padding: 12px 0; border-top: 1px solid var(--line); background: var(--paper); }
  .project-preferences-page :is(.settings-save-footer, .guidance-editor footer) { display: flex; flex-direction: row; justify-content: flex-end; gap: 8px; margin: 0; padding: 0; }
  .project-preferences-page :is(.settings-rules-actions, .guidance-editor-actions) > [role=alert]:not([hidden]) { margin: 0 0 10px; max-height: 64px; overflow: auto; }
  .project-preferences-page .guidance-document:has(.guidance-editor:not([hidden])) > .guidance-page-header,
  .project-preferences-page .guidance-document:has(.guidance-editor:not([hidden])) > .settings-body > :not(.guidance-editor) { display: none; }
  .project-preferences-page .guidance-editor:not([hidden]) { display: flex; flex: 1; flex-direction: column; min-height: 0; margin: 0; padding: 0; border: 0; border-radius: 0; background: var(--paper); overflow: hidden; }
  .project-preferences-page .guidance-editor > header { flex: none; padding: 0 4px 16px; }
  .project-preferences-page .guidance-editor h2 { font-size: 20px; }
  .project-preferences-page .guidance-editor form { display: flex; flex: 1; flex-direction: column; min-height: 0; margin: 0; gap: 0; overflow: hidden; }
  .project-preferences-page .guidance-editor-body > label { margin-top: 16px; }
  .project-preferences-page .guidance-editor textarea { max-height: 280px; }
  @media (max-width: 760px) {
    body.project-preferences-page .settings-content:has(> .project-rules-document),
    body.project-preferences-page .settings-content:has(.guidance-editor:not([hidden])) { padding: 14px 16px 0; }
    .project-preferences-page .project-rules-document > .settings-heading { margin-bottom: 10px; }
    .project-preferences-page .project-rules-document > .settings-heading h1,
    .project-preferences-page .guidance-editor h2 { font-size: 20px; }
    .project-preferences-page .guidance-editor > header { padding-bottom: 12px; }
    .project-preferences-page :is(.settings-rules-actions, .guidance-editor-actions) { padding: 10px 0; }
  }

  body.settings-page .settings-content:has(> .planning-edit) { display: flex; flex-direction: column; overflow: hidden; padding-block: 16px 12px; }
  body.settings-page .settings-content > .planning-edit { display: flex; flex-direction: column; flex: 1; height: 100%; min-height: 0; overflow: hidden; padding-block: 0; }
  .planning-edit .planning-page-header { margin-bottom: 12px; }
  .planning-edit .planning-save-context { flex: none; margin-block: 0 12px; padding: 10px 0; border: 0; border-radius: 0; background: transparent; }
  body.settings-page .planning-edit > .settings-body { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; padding: 0; }
  .planning-edit .planning-edit-form { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
  .planning-edit-fields { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; padding: 2px 4px 16px; }
  .planning-edit .planning-edit-section { padding-block: 16px; }
  .planning-edit .planning-edit-section:first-child { padding-top: 0; }
  .planning-edit .planning-edit-footer { flex: none; border-top: 1px solid var(--line); padding-top: 10px; }
  .planning-edit .planning-form-error { flex: none; margin-top: 8px; }
  .planning-edit [aria-disabled="true"] { opacity: .5; cursor: wait; }
  .planning-edit-form label { font-size: 13px; }
  .planning-edit-form label > small { font-size: 12px; }
  @media (max-height: 600px) {
    .planning-edit .planning-page-header p, .planning-edit .planning-save-context p { display: none; }
    .planning-edit .planning-page-header h1 { font-size: 20px; }
    .planning-edit .planning-page-header { margin-bottom: 8px; }
    .planning-edit .planning-save-context { padding: 4px 0; margin-bottom: 8px; }
  }
`;
