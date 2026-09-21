/** Independent project preferences: one navigation rail and one content scroll. */
export const PROJECT_SETTINGS_PAGE_STYLES = `
  body.settings-page:is(.project-preferences-page, .settings-stage) { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: 44px minmax(0, 1fr); background: var(--page); }
  .project-preferences-chrome { height: 44px; display: flex; align-items: center; justify-content: space-between; padding: 0 14px 0 22px; border-bottom: 1px solid var(--line); color: var(--muted); background: var(--paper); font-size: 12px; }
  .project-preferences-chrome > a { display: grid; place-items: center; width: 32px; height: 32px; color: var(--muted); border-radius: 8px; }
  .project-preferences-chrome > a:hover { color: var(--ink); background: var(--nav-hover); }
  .project-preferences-chrome svg { width: 16px; height: 16px; }
  :is(body.project-preferences-page, .settings-stage)[data-native-desktop="true"] .project-preferences-chrome { padding-left: 84px; }
  :is(body.project-preferences-page, .settings-stage) .settings-shell { grid-template-columns: 224px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
  :is(body.project-preferences-page, .settings-stage) .settings-navigation.settings-navigation--codex { padding: 16px 12px; border-color: var(--line); background: var(--nav-bg); }
  .settings-project-identity { display: grid; gap: 5px; padding: 16px 10px 24px; min-width: 0; }
  .settings-project-identity strong { font-size: 14px; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .settings-project-identity > span { font-size: 12px; color: var(--muted); }
  :is(body.project-preferences-page, .settings-stage) .settings-content { display: block; overflow: auto; overflow-anchor: none; overscroll-behavior: contain; scrollbar-gutter: stable; padding: 28px clamp(24px, 4vw, 48px) 48px; margin: 0; border: 0; border-radius: 0; box-shadow: none; background: var(--page); }
  html[data-resolved-theme="dark"] :is(body.project-preferences-page, .settings-stage) .settings-content { box-shadow: none; }
  html[data-resolved-theme="dark"] :is(body.project-preferences-page, .settings-stage) .settings-content > :is(.settings-document, .appearance-document) { background: transparent; }
  :is(body.project-preferences-page, .settings-stage) .settings-content > :is(.project-settings-page, .settings-document, .guidance-document, .work-planning, .planning-catalog, .planning-detail, .planning-edit, [data-settings-panel], [data-settings-loading]) { display: block; width: 100%; max-width: 760px; height: auto; min-height: 0; overflow: visible; margin-inline: auto; padding: 0; background: transparent; border: 0; box-shadow: none; }
  :is(.project-preferences-page, .settings-stage) .settings-body { display: block; overflow: visible; min-height: 0; padding: 0; }
  :is(.project-preferences-page, .settings-stage) :is(.settings-page-heading, .settings-heading, .guidance-page-header, .planning-page-header, .planning-detail-header) { max-width: none; margin: 0 0 20px; padding: 0; border: 0; }
  :is(.project-preferences-page, .settings-stage) :is(.guidance-page-header, .planning-page-header) { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  :is(.project-preferences-page, .settings-stage) .settings-page-heading, :is(.project-preferences-page, .settings-stage) .settings-heading, :is(.project-preferences-page, .settings-stage) .planning-detail-header { display: block; }
  :is(.project-preferences-page, .settings-stage) .planning-detail-lede { margin-top: 6px; }
  :is(.project-preferences-page, .settings-stage) .planning-detail-lede p { margin: 0; }
  :is(.project-preferences-page, .settings-stage) :is(.settings-page-heading, .settings-heading, .guidance-page-header, .planning-page-header, .planning-detail-header) h1 { margin: 0; font-size: 28px; font-weight: 400; line-height: 1.2; letter-spacing: -.03em; }
  :is(.project-preferences-page, .settings-stage) :is(.settings-page-heading, .settings-heading, .guidance-page-header, .planning-page-header, .planning-detail-header) p { max-width: 54ch; margin: 6px 0 0; font-size: 14px; line-height: 1.5; color: var(--muted); }
  :is(.project-preferences-page, .settings-stage) .settings-heading-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
  :is(.project-preferences-page, .settings-stage) .settings-section { margin: 0 0 12px; padding: 2px 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); }
  :is(.project-preferences-page, .settings-stage) .settings-section + .settings-section { margin-top: 0; }
  :is(.project-preferences-page, .settings-stage) :is(.settings-section > h2, .work-planning-section-header h2) { margin: 10px 0 2px; font-size: 13px; font-weight: 400; letter-spacing: -.01em; }
  .settings-setting-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-width: 0; margin: 0; padding: 10px 0; border-bottom: 1px solid var(--line); }
  :is(.project-preferences-page, .settings-stage) .settings-section > :last-child { border-bottom: 0; }
  :is(.project-preferences-page, .settings-stage) .settings-section > [data-runtime-row] { display: contents; }
  :is(.project-preferences-page, .settings-stage) .settings-section > [data-runtime-row]:last-child > :last-child { border-bottom: 0; }
  :is(.project-preferences-page, .settings-stage) .settings-section .settings-empty { display: grid; gap: 4px; padding: 12px 0 16px; }
  :is(.project-preferences-page, .settings-stage) .settings-section .settings-empty strong { font-size: 14px; color: var(--ink); }
  :is(.project-preferences-page, .settings-stage) .settings-section .settings-empty span { color: var(--muted); font-size: 13px; line-height: 1.5; }
  .setting-copy { display: grid; gap: 2px; min-width: 0; color: var(--ink); }
  .setting-copy > strong { font-size: 14px; font-weight: 400; line-height: 1.4; }
  .setting-copy > span { color: var(--muted); font-size: 13px; line-height: 1.5; }
  body.settings-page .settings-navigation--codex .settings-nav-body > a { gap: 10px; }
  body.settings-page .settings-navigation--codex .settings-nav-body > a svg { width: 16px; height: 16px; flex: none; color: var(--muted); }
  .setting-number { display: flex; gap: 8px; align-items: center; color: var(--muted); font-size: 12px; }
  .setting-value { display: flex; align-items: center; flex: none; flex-wrap: wrap; justify-content: flex-end; gap: 8px; max-width: 100%; }
  .project-name-form { flex-wrap: wrap; }
  .project-name-form input { width: 220px; min-width: 0; }
  .project-name-form .settings-form-error { flex-basis: 100%; margin: 0; }
  :is(.project-preferences-page, .settings-stage) :is(input:not([type=checkbox]):not([type=radio]), select, textarea) { max-width: 100%; min-height: 36px; padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--paper); color: var(--ink); font: inherit; font-size: 13px; box-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 3%, transparent); }
  :is(.project-preferences-page, .settings-stage) select { padding-right: 30px; }
  :is(.project-preferences-page, .settings-stage) textarea { width: 100%; resize: vertical; line-height: 1.65; }
  :is(.project-preferences-page, .settings-stage) button { font-size: 12px; font-weight: 400; }
  :is(.project-preferences-page, .settings-stage) :is(button, a, input, select, textarea, summary) { transition: background-color var(--motion-fast, 120ms) ease, border-color var(--motion-fast, 120ms) ease, color var(--motion-fast, 120ms) ease; }
  :is(.project-preferences-page, .settings-stage) :is(button, a, input, select, textarea, summary):focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
  .settings-data-disclosure, .settings-advanced { border-bottom: 1px solid var(--line); }
  :is(.project-preferences-page, .settings-stage) :is(.settings-data-disclosure, .settings-advanced) > summary { list-style: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 0; padding: 10px 0; cursor: pointer; }
  :is(.project-preferences-page, .settings-stage) summary::-webkit-details-marker { display: none; }
  :is(.project-preferences-page, .settings-stage) :is(.settings-data-disclosure, .settings-advanced) > summary > svg { flex: none; width: 14px; height: 14px; color: var(--muted); transition: transform 160ms ease; }
  :is(.project-preferences-page, .settings-stage) :is(.settings-data-disclosure, .settings-advanced)[open] > summary > svg { transform: rotate(180deg); }
  .settings-data-list { margin: 0; padding: 0 0 20px; display: grid; gap: 12px; }
  .settings-data-list > div { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 18px; font-size: 12px; line-height: 1.6; }
  .settings-data-list dt { color: var(--muted); }
  .settings-data-list dd { margin: 0; overflow-wrap: anywhere; font-family: var(--font-mono, monospace); }
  :is(.project-preferences-page, .settings-stage) .project-manager-danger { margin: 0; padding: 18px 0; border: 0; background: none; }
  :is(.project-preferences-page, .settings-stage) .settings-section > .project-manager-danger:has(+ .settings-data-disclosure) { padding: 10px 0 4px; }
  :is(.project-preferences-page, .settings-stage) .project-manager-danger h3 { margin: 0 0 6px; font-size: 13px; font-weight: 400; }
  :is(.project-preferences-page, .settings-stage) .project-manager-danger p { max-width: 62ch; margin: 0 0 16px; font-size: 12px; line-height: 1.65; color: var(--muted); }
  :is(.project-preferences-page, .settings-stage) .project-manager-danger-actions { display: flex; gap: 8px; }
  :is(.project-preferences-page, .settings-stage) .settings-toggle-row { cursor: pointer; }
  :is(.project-preferences-page, .settings-stage) input.settings-switch { appearance: none; position: relative; flex: none; width: 34px; height: 20px; margin: 0; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--line-strong); cursor: pointer; }
  :is(.project-preferences-page, .settings-stage) input.settings-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--paper); box-shadow: 0 1px 2px #0002; transition: transform 160ms ease; }
  :is(.project-preferences-page, .settings-stage) input.settings-switch:checked { background: var(--ink); border-color: var(--ink); }
  :is(.project-preferences-page, .settings-stage) input.settings-switch:checked::after { transform: translateX(14px); }
  :is(.project-preferences-page, .settings-stage) .settings-last-change > p { margin: 0 0 12px; color: var(--muted); white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
  :is(.project-preferences-page, .settings-stage) .settings-rules-form { margin: 0; }
  :is(.project-preferences-page, .settings-stage) .settings-section .settings-data-disclosure .settings-setting-row:last-child { border: 0; }
  :is(.project-preferences-page, .settings-stage) .settings-section .settings-data-disclosure > :not(summary) { padding-bottom: 8px; }
  :is(.project-preferences-page, .settings-stage) .settings-setting-row > input:not([type=checkbox]) { width: 240px; }
  :is(.project-preferences-page, .settings-stage) .settings-setting-row input[type=number] { width: 90px; }
  :is(.project-preferences-page, .settings-stage) .settings-change-reason { display: grid; gap: 10px; padding-top: 12px; padding-bottom: 12px; }
  :is(.project-preferences-page, .settings-stage) .settings-change-reason .settings-save-footer { margin: 4px 0 0; }
  :is(.project-preferences-page, .settings-stage) .settings-save-footer { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-top: 20px; padding: 0; border: 0; }
  :is(.project-preferences-page, .settings-stage) .settings-save-footer > p, .settings-footnote { color: var(--muted); font-size: 12px; line-height: 1.65; }
  :is(.project-preferences-page, .settings-stage) .settings-save-footer button { flex: none; }
  :is(.project-preferences-page, .settings-stage) .settings-state-note { margin: 0 0 12px; color: var(--muted); font-size: 12px; }
  :is(.project-preferences-page, .settings-stage) :is(.guidance-settings-list, .guidance-advanced-list) { margin: 0 0 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); overflow: hidden; }
  :is(.project-preferences-page, .settings-stage) .guidance-section { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 0 16px; margin: 0; padding: 10px 16px; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; }
  :is(.project-preferences-page, .settings-stage) .guidance-section:last-child { border-bottom: 0; }
  :is(.project-preferences-page, .settings-stage) .guidance-section:has(.guidance-entry) { align-items: start; }
  :is(.project-preferences-page, .settings-stage) .guidance-section-heading { position: static; }
  :is(.project-preferences-page, .settings-stage) .guidance-section-heading h2 { margin: 0; font-size: 13px; font-weight: 400; }
  :is(.project-preferences-page, .settings-stage) .guidance-section-heading p { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
  :is(.project-preferences-page, .settings-stage) .guidance-category-add { display: flex; align-items: center; gap: 4px; min-height: 28px; padding: 0 6px; border-radius: 6px; }
  :is(.project-preferences-page, .settings-stage) .guidance-category-add svg { width: 13px; height: 13px; }
  :is(.project-preferences-page, .settings-stage) .guidance-entry-list { grid-column: 1 / -1; }
  :is(.project-preferences-page, .settings-stage) .guidance-entry { margin-top: 8px; padding: 8px 0 0; background: transparent; border: 0; border-top: 1px solid var(--line); border-radius: 0; }
  :is(.project-preferences-page, .settings-stage) .guidance-entry > p { margin: 0; font-size: 13px; line-height: 1.55; }
  :is(.project-preferences-page, .settings-stage) .guidance-entry footer { margin-top: 6px; }
  :is(.project-preferences-page, .settings-stage) .guidance-entry-meta { font-size: 11px; }
  :is(.project-preferences-page, .settings-stage) .guidance-editor { margin: 0 0 12px; padding: 14px 16px; background: var(--paper); border: 1px solid var(--line); border-radius: 12px; box-shadow: none; }
  :is(.project-preferences-page, .settings-stage) .guidance-editor-fields { grid-template-columns: 1fr; gap: 12px; }
  :is(.project-preferences-page, .settings-stage) .guidance-editor label { font-size: 12px; }
  :is(.project-preferences-page, .settings-stage) .guidance-editor select { width: 180px; }
  :is(.project-preferences-page, .settings-stage) .guidance-advanced-list > :is(.guidance-history, .guidance-inactive),
  :is(.project-preferences-page, .settings-stage) .guidance-advanced-list > :is(.guidance-history, .guidance-inactive):first-of-type,
  :is(.project-preferences-page, .settings-stage) .guidance-advanced-list > :is(.guidance-history, .guidance-inactive):last-of-type {
    margin: 0; padding: 0 16px; border: 0; border-radius: 0; background: transparent;
  }
  :is(.project-preferences-page, .settings-stage) .guidance-advanced-list > .guidance-history { border-bottom: 1px solid var(--line); }
  :is(.project-preferences-page, .settings-stage) :is(.guidance-history, .guidance-inactive) > summary {
    min-height: 0; margin: 0; padding: 10px 0; gap: 12px;
    font-size: inherit; font-weight: inherit; color: var(--ink);
  }
  :is(.project-preferences-page, .settings-stage) :is(.guidance-history, .guidance-inactive) > summary .setting-copy {
    color: inherit; font-size: inherit; font-weight: inherit;
  }
  :is(.project-preferences-page, .settings-stage) :is(.guidance-history, .guidance-inactive) > summary .setting-copy > strong { font-size: 13px; font-weight: 400; }
  :is(.project-preferences-page, .settings-stage) :is(.guidance-history, .guidance-inactive) > summary .setting-copy > span { color: var(--muted); font-size: 12px; font-weight: 400; }
  :is(.project-preferences-page, .settings-stage) :is(.guidance-history, .guidance-inactive) > :not(summary) { margin: 0; padding: 0 0 10px; border: 0; }
  :is(.project-preferences-page, .settings-stage) :is(.guidance-history-list, .guidance-inactive-body, .guidance-inactive-list) { margin: 0; padding: 0; border: 0; }
  :is(.project-preferences-page, .settings-stage) .guidance-inactive-list li:first-child { padding-top: 0; border-top: 0; }
  :is(.project-preferences-page, .settings-stage) :is(.guidance-history, .guidance-inactive) > :not(summary) p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
  :is(.project-preferences-page, .settings-stage) .settings-footnote { margin: 12px 0 0; }
  :is(.project-preferences-page, .settings-stage) .planning-page-header > div:last-child:not(:first-child) { display: flex; flex-wrap: wrap; flex: none; gap: 8px; align-items: center; }
  :is(.project-preferences-page, .settings-stage) .planning-page-header { flex-wrap: wrap; }
  :is(.project-preferences-page, .settings-stage) .mw-btn { min-height: 32px; }
  :is(.project-preferences-page, .settings-stage) .work-planning-section-header { margin: 0 0 12px; }
  :is(.project-preferences-page, .settings-stage) .work-planning-section-header p { margin: 4px 0 0; color: var(--muted); font-size: 12px; line-height: 1.55; }
  :is(.project-preferences-page, .settings-stage) .planning-composition-section { padding: 0 0 20px; margin: 0; border-bottom: 1px solid var(--line); }
  :is(.project-preferences-page, .settings-stage) .work-planning-empty { text-align: left; padding: 12px 0; background: transparent; border: 0; border-radius: 0; }
  :is(.project-preferences-page, .settings-stage) .work-planning-empty h3 { margin: 0 0 6px; font-size: 13px; }
  :is(.project-preferences-page, .settings-stage) .work-planning-empty p { margin: 0; font-size: 12px; line-height: 1.7; color: var(--muted); }
  :is(.project-preferences-page, .settings-stage) .planning-adoption-section { margin-top: 28px; }
  :is(.project-preferences-page, .settings-stage) .planning-adoption-tools { grid-template-columns: 1fr; display: grid; gap: 12px; margin-bottom: 8px; }
  :is(.project-preferences-page, .settings-stage) [data-planning-search] { width: 100%; }
  :is(.project-preferences-page, .settings-stage) .planning-filters { display: flex; flex-wrap: wrap; gap: 4px; }
  :is(.project-preferences-page, .settings-stage) .planning-adoption-grid { display: block; }
  :is(.project-preferences-page, .settings-stage) .planning-adoption-card { display: grid; min-height: 0; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto auto; align-content: start; gap: 8px 20px; padding: 14px 0; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; box-shadow: none; }
  :is(.project-preferences-page, .settings-stage) .planning-adoption-card[hidden] { display: none; }
  :is(.project-preferences-page, .settings-stage) .planning-adoption-card > header { grid-column: 1; display: flex; justify-content: flex-start; gap: 8px; }
  :is(.project-preferences-page, .settings-stage) .planning-adoption-copy { grid-column: 1; }
  :is(.project-preferences-page, .settings-stage) .planning-adoption-copy h3 { margin: 0 0 5px; font-size: 14px; font-weight: 400; }
  :is(.project-preferences-page, .settings-stage) .planning-adoption-copy p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.7; }
  :is(.project-preferences-page, .settings-stage) .planning-adoption-card > footer { grid-column: 2; grid-row: 1 / 3; flex-direction: column-reverse; align-items: flex-end; justify-content: center; gap: 8px; margin: 0; padding: 0; border: 0; }
  :is(.project-preferences-page, .settings-stage) .planning-adoption-card > footer > span { font-size: 11px; color: var(--muted); }
  :is(.project-preferences-page, .settings-stage) .planning-card-kind, :is(.project-preferences-page, .settings-stage) .planning-card-scope { padding: 0; background: transparent; border: 0; color: var(--muted); font-size: 11px; }
  @media (max-width: 760px) {
    :is(body.project-preferences-page, .settings-stage) { --control-h: 44px; }
    :is(.project-preferences-page, .settings-stage) .project-preferences-chrome > a { width: 44px; height: 44px; }
    :is(body.project-preferences-page, .settings-stage) .settings-shell { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
    :is(body.project-preferences-page, .settings-stage) .settings-navigation.settings-navigation--codex { display: flex; flex-direction: column; align-items: stretch; padding: 8px 14px; border-right: 0; border-bottom: 1px solid var(--line); overflow: visible; }
    :is(body.project-preferences-page, .settings-stage) .settings-navigation--codex .settings-nav-back { align-self: flex-start; margin: 0 0 6px; min-height: 44px; }
    :is(.project-preferences-page, .settings-stage) .settings-project-identity { display: none; }
    :is(body.project-preferences-page, .settings-stage) .settings-navigation--codex .settings-nav-body { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 2px; overflow: visible; }
    :is(body.project-preferences-page, .settings-stage) .settings-navigation--codex .settings-nav-body > a { justify-content: center; min-width: 0; min-height: 44px; padding: 0 6px; font-size: 12px; }
    :is(body.project-preferences-page, .settings-stage) .settings-navigation--codex .settings-nav-body > a svg { display: none; }
    :is(body.project-preferences-page, .settings-stage) .settings-content { padding: 24px 20px 48px; scrollbar-gutter: auto; }
    :is(.project-preferences-page, .settings-stage) :is(.guidance-page-header, .planning-page-header) { gap: 16px; flex-wrap: wrap; }
    :is(.project-preferences-page, .settings-stage) :is(.settings-page-heading, .settings-heading, .guidance-page-header, .planning-page-header, .planning-detail-header) h1 { font-size: 20px; }
    .settings-setting-row { gap: 16px; }
    :is(.project-preferences-page, .settings-stage) .settings-setting-row:not(.settings-toggle-row) { align-items: stretch; flex-direction: column; }
    .setting-value { flex: auto; }
    .project-name-form .setting-value input { flex: 1; width: 100%; }
    :is(.project-preferences-page, .settings-stage) :is(input:not([type=checkbox]):not([type=radio]), select, textarea) { font-size: 16px; min-height: 44px; }
    :is(.project-preferences-page, .settings-stage) button { min-height: 44px; }
    :is(body.project-preferences-page, .settings-stage) .planning-filters button { min-height: 44px; }
    :is(.project-preferences-page, .settings-stage) .settings-save-footer { flex-direction: column; align-items: stretch; }
    :is(.project-preferences-page, .settings-stage) .guidance-page-header { flex-direction: row; }
    :is(.project-preferences-page, .settings-stage) .guidance-entry footer { flex-wrap: wrap; }
    :is(.project-preferences-page, .settings-stage) .guidance-editor { padding: 16px; }
    :is(.project-preferences-page, .settings-stage) .planning-adoption-card { gap: 8px 12px; }
    :is(.project-preferences-page, .settings-stage) .planning-adoption-card > footer { grid-row: auto; grid-column: 1 / -1; flex-direction: row; align-items: center; justify-content: space-between; }
    :is(.project-preferences-page, .settings-stage) .planning-adoption-card > header, :is(.project-preferences-page, .settings-stage) .planning-adoption-copy { grid-column: 1 / -1; }
    .settings-data-list > div { grid-template-columns: 1fr; gap: 4px; }
  }
  @media (prefers-reduced-motion: reduce) {
    :is(.project-preferences-page, .settings-stage) *, :is(.project-preferences-page, .settings-stage) *::after { transition: none !important; animation: none !important; }
  }

  .settings-segmented { display: flex; flex: none; padding: 3px; gap: 2px; border: 1px solid var(--line); border-radius: 9px; background: var(--nav-bg); }
  .settings-segmented > :is(button, a) { display: flex; align-items: center; justify-content: center; min-height: 30px; padding: 0 12px; border: 1px solid transparent; border-radius: 6px; color: var(--muted); background: transparent; text-decoration: none; font-size: 12px; white-space: nowrap; box-shadow: none; }
  .settings-segmented > :is([aria-pressed="true"], [aria-current="true"]) { border-color: var(--line); color: var(--ink); background: var(--paper); box-shadow: 0 1px 2px #0001; }
  :is(.project-preferences-page, .settings-stage) .settings-record-list { gap: 0; margin: 0 0 12px; padding: 2px 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); }
  :is(.project-preferences-page, .settings-stage) .settings-record { padding: 22px 0; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; box-shadow: none; }
  :is(.project-preferences-page, .settings-stage) .settings-record:last-child { border-bottom: 0; }
  :is(.project-preferences-page, .settings-stage) .settings-record-title .record-icon { display: none; }
  :is(.project-preferences-page, .settings-stage) .settings-record-title h2 { font-size: 14px; margin: 0 0 5px; }
  :is(.project-preferences-page, .settings-stage) .settings-record-title p { max-width: 48ch; margin: 0; color: var(--muted); font-size: 12px; line-height: 1.7; }
  :is(.project-preferences-page, .settings-stage) .settings-record .settings-data-disclosure { border: 0; }
  :is(.project-preferences-page, .settings-stage) .settings-record .settings-data-disclosure > summary { min-height: 0; padding: 14px 0 0; justify-content: flex-start; gap: 8px; color: var(--muted); font-size: 11px; }
  :is(.project-preferences-page, .settings-stage) .settings-paths { padding: 16px 0 0; margin: 0; background: transparent; border: 0; }
  :is(.project-preferences-page, .settings-stage) .settings-paths dd { overflow-wrap: anywhere; }
  :is(.project-preferences-page, .settings-stage) .diagnostics-summary { margin: 0 0 12px; padding: 10px 16px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); }
  :is(.project-preferences-page, .settings-stage) .diagnostics-summary h2, :is(.project-preferences-page, .settings-stage) .launcher-section h2 { font-size: 14px; }
  :is(.project-preferences-page, .settings-stage) .diagnostics-summary dl { grid-template-columns: 1fr; }
  :is(.project-preferences-page, .settings-stage) .diagnostics-summary dl > div { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 16px; }
  :is(.project-preferences-page, .settings-stage) .diagnostics-summary dd { overflow-wrap: anywhere; }
  :is(.project-preferences-page, .settings-stage) .launcher-section { margin: 0 0 12px; padding: 10px 16px 8px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); }
  :is(.project-preferences-page, .settings-stage) .launcher-section ul { padding: 0; border: 0; background: transparent; }
  :is(.project-preferences-page, .settings-stage) .launcher-section li { border-radius: 0; border-bottom: 1px solid var(--line); padding: 14px 0; }
  :is(.project-preferences-page, .settings-stage) .launcher-section li:last-child { border-bottom: 0; }
  :is(.project-preferences-page, .settings-stage) .planning-card-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  :is(.project-preferences-page, .settings-stage) .planning-card { min-height: 0; padding: 20px; border: 1px solid var(--line); border-radius: 10px; box-shadow: none; background: var(--paper); }
  :is(.project-preferences-page, .settings-stage) .planning-library-note { margin: 20px 0; padding: 12px 0; border: 0; background: transparent; }
  :is(.project-preferences-page, .settings-stage) .planning-detail-layout { grid-template-columns: minmax(0, 1fr); }
  :is(.project-preferences-page, .settings-stage) .planning-edit-section { padding: 20px 0; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; }
  :is(body.project-preferences-page, .settings-stage) .settings-shell--standalone { grid-template-columns: minmax(0, 1fr); }
  @media (max-width: 760px) {
    :is(.project-preferences-page, .settings-stage) .settings-nav-group-label { display: none; }
    .settings-segmented { width: 100%; }
    .settings-segmented > :is(button, a) { flex: 1; min-height: 44px; padding: 0 8px; }
    :is(.project-preferences-page, .settings-stage) .settings-record > header { flex-direction: column; align-items: stretch; gap: 14px; }
    :is(.project-preferences-page, .settings-stage) .settings-record-action { justify-content: space-between; }
    :is(.project-preferences-page, .settings-stage) .planning-card-grid { grid-template-columns: minmax(0, 1fr); }
    :is(.project-preferences-page, .settings-stage) .diagnostics-summary dl > div { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  }


  :is(.project-preferences-page, .settings-stage) .settings-record > header { min-height: 0; padding: 0; }
  @media (max-width: 760px) {
    :is(.project-preferences-page, .settings-stage) .settings-record-action { flex-direction: row; align-items: center; }
    :is(.project-preferences-page, .settings-stage) .settings-record .settings-data-disclosure > summary { min-height: 44px; padding: 8px 0; }
  }

  /* Adding a project note keeps the editor in the available panel, with actions outside the field scroll. */
  :is(body.project-preferences-page, .settings-stage) .settings-content:has(.guidance-editor:not([hidden])) { display: flex; justify-content: center; overflow: hidden; padding: 20px clamp(24px, 4vw, 56px) 0; }
  :is(body.project-preferences-page, .settings-stage) .settings-content > .guidance-document:has(.guidance-editor:not([hidden])) { display: flex; flex: 1; flex-direction: column; overflow: hidden; }
  :is(.project-preferences-page, .settings-stage) .guidance-document:has(.guidance-editor:not([hidden])) > .settings-body { display: flex; flex: 1; min-height: 0; overflow: hidden; flex-direction: column; }
  :is(.project-preferences-page, .settings-stage) .guidance-editor-body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; padding: 4px 8px 20px 4px; }
  :is(.project-preferences-page, .settings-stage) .guidance-editor-actions { flex: none; padding: 12px 0; border-top: 1px solid var(--line); background: var(--paper); }
  :is(.project-preferences-page, .settings-stage) .guidance-editor footer { display: flex; flex-direction: row; justify-content: flex-end; gap: 8px; margin: 0; padding: 0; }
  :is(.project-preferences-page, .settings-stage) .guidance-editor-actions > [role=alert]:not([hidden]) { margin: 0 0 10px; max-height: 64px; overflow: auto; }
  :is(.project-preferences-page, .settings-stage) .guidance-document:has(.guidance-editor:not([hidden])) > .guidance-page-header,
  :is(.project-preferences-page, .settings-stage) .guidance-document:has(.guidance-editor:not([hidden])) > .settings-body > :not(.guidance-editor) { display: none; }
  :is(.project-preferences-page, .settings-stage) .guidance-editor:not([hidden]) { display: flex; flex: 1; flex-direction: column; min-height: 0; margin: 0; padding: 0; border: 0; border-radius: 0; background: var(--paper); overflow: hidden; }
  :is(.project-preferences-page, .settings-stage) .guidance-editor > header { flex: none; padding: 0 4px 16px; }
  :is(.project-preferences-page, .settings-stage) .guidance-editor h2 { font-size: 20px; }
  :is(.project-preferences-page, .settings-stage) .guidance-editor form { display: flex; flex: 1; flex-direction: column; min-height: 0; margin: 0; gap: 0; overflow: hidden; }
  :is(.project-preferences-page, .settings-stage) .guidance-editor-body > label { margin-top: 16px; }
  :is(.project-preferences-page, .settings-stage) .guidance-editor textarea { max-height: 280px; }
  @media (max-width: 760px) {
    :is(body.project-preferences-page, .settings-stage) .settings-content:has(.guidance-editor:not([hidden])) { padding: 14px 16px 0; }
    :is(.project-preferences-page, .settings-stage) .guidance-editor h2 { font-size: 20px; }
    :is(.project-preferences-page, .settings-stage) .guidance-editor > header { padding-bottom: 12px; }
    :is(.project-preferences-page, .settings-stage) .guidance-editor-actions { padding: 10px 0; }
  }

  :is(body.settings-page, .settings-stage) .settings-content:has(> .planning-edit:not([hidden])) { display: flex; flex-direction: column; align-items: center; overflow: hidden; padding-block: 16px 12px; }
  :is(body.settings-page, .settings-stage) .settings-content > .planning-edit { display: flex; flex-direction: column; flex: 1; height: 100%; min-height: 0; overflow: hidden; padding-block: 0; }
  .planning-edit .planning-page-header { margin-bottom: 12px; }
  .planning-edit .planning-save-context { flex: none; margin-block: 0 12px; padding: 10px 0; border: 0; border-radius: 0; background: transparent; }
  :is(body.settings-page, .settings-stage) .planning-edit > .settings-body { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; padding: 0; }
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
