import { SETTINGS_DOCUMENT_STYLES } from "@molis-ai/molis-work-design-system";

/**
 * Independent project preferences: one navigation rail and one content scroll. Every page is laid out alike (specs/screen-polish/p5-settings.md):
 * a 220px category column, a 760px text column whose left edge stays put, a 24px heading over one 13px sentence, and the three rows of
 * `SETTINGS_DOCUMENT_STYLES`. Pages not yet rewritten in those rows keep their grouped cards (`.settings-section`) until they are.
 */
export const PROJECT_SETTINGS_PAGE_STYLES = `${SETTINGS_DOCUMENT_STYLES}
  body.settings-page:is(.project-preferences-page, .settings-stage) { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: 44px minmax(0, 1fr); background: var(--page); }
  .project-preferences-chrome { height: 44px; display: flex; align-items: center; justify-content: space-between; padding: 0 16px 0 24px; border-bottom: 1px solid var(--line); color: var(--muted); background: var(--paper); font-size: 12px; }
  .project-preferences-chrome > a { display: grid; place-items: center; width: 32px; height: 32px; color: var(--muted); border-radius: 8px; }
  .project-preferences-chrome > a:hover { color: var(--ink); background: var(--nav-hover); }
  .project-preferences-chrome svg { width: 16px; height: 16px; }
  :is(body.project-preferences-page, .settings-stage)[data-native-desktop="true"] .project-preferences-chrome { padding-left: 84px; }
  :is(body.project-preferences-page, .settings-stage) .settings-shell { grid-template-columns: 220px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
  :is(body.project-preferences-page, .settings-stage) .settings-navigation.settings-navigation--codex { padding: 16px 12px; border-color: var(--line); background: var(--nav-bg); }
  .settings-project-identity { display: grid; gap: 4px; padding: 16px 12px 24px; min-width: 0; }
  .settings-project-identity strong { font-size: 15px; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .settings-project-identity > span { font-size: 12px; color: var(--muted); }
  :is(body.project-preferences-page, .settings-stage) .settings-content { display: block; overflow: auto; overflow-anchor: none; overscroll-behavior: contain; scrollbar-gutter: stable; padding: 36px clamp(24px, 4vw, 56px) 48px; margin: 0; border: 0; border-radius: 0; box-shadow: none; background: var(--page); }
  html[data-resolved-theme="dark"] :is(body.project-preferences-page, .settings-stage) .settings-content { box-shadow: none; }
  html[data-resolved-theme="dark"] :is(body.project-preferences-page, .settings-stage) .settings-content > :is(.settings-document, .appearance-document) { background: transparent; }
  :is(body.project-preferences-page, .settings-stage) .settings-content > :is(.project-settings-page, .settings-document, .guidance-document, [data-settings-panel], [data-settings-loading]) { display: block; width: 100%; max-width: 760px; height: auto; min-height: 0; overflow: visible; margin-inline: 0; padding: 0; background: transparent; border: 0; box-shadow: none; }
  :is(.project-preferences-page, .settings-stage) :is(.settings-page-heading, .settings-heading) + .mw-settings-section { margin-top: 0; }
  :is(.project-preferences-page, .settings-stage) .settings-body { display: block; overflow: visible; min-height: 0; padding: 0; }
  :is(.project-preferences-page, .settings-stage) :is(.settings-page-heading, .settings-heading, .guidance-page-header) { max-width: none; margin: 0 0 24px; padding: 0; border: 0; }
  :is(.project-preferences-page, .settings-stage) :is(.guidance-page-header) { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  :is(.project-preferences-page, .settings-stage) .settings-page-heading, :is(.project-preferences-page, .settings-stage) .settings-heading { display: block; }
  :is(.project-preferences-page, .settings-stage) :is(.settings-page-heading, .settings-heading, .guidance-page-header) h1 { margin: 0; font-size: 24px; font-weight: var(--weight-title, 600); line-height: 1.3; letter-spacing: -.02em; }
  :is(.project-preferences-page, .settings-stage) :is(.settings-page-heading, .settings-heading, .guidance-page-header) p { max-width: 72ch; margin: 4px 0 0; font-size: 13px; line-height: 1.5; color: var(--muted); }
  :is(.project-preferences-page, .settings-stage) .settings-heading-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
  :is(.project-preferences-page, .settings-stage) .settings-section { margin: 0 0 12px; padding: 0 16px; border: 1px solid var(--line); border-radius: var(--r-card, 12px); background: var(--paper); }
  /* A titled section: the title sits outside and its rows are the card (settings-rows.ts). */
  :is(.project-preferences-page, .settings-stage) .settings-section.mw-settings-section { margin: 0 0 32px; padding: 0; border: 0; border-radius: 0; background: none; }
  :is(.project-preferences-page, .settings-stage) .settings-section + .settings-section { margin-top: 0; }
  :is(.project-preferences-page, .settings-stage) :is(.settings-section > h2) { margin: 12px 0 4px; font-size: 13px; font-weight: var(--weight-title, 600); letter-spacing: -.01em; }
  .assistant-capability-effect { color: var(--muted); font-size: 12px; white-space: nowrap; }
  /* 同步 draws its lines in its own program and cannot be opened without a signed-in space, so its row keeps the layout it had (specs/screen-polish/p5-settings.md). */
  .sync-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-width: 0; min-height: 60px; margin: 0; padding: 12px 0; border-bottom: 1px solid var(--line); }
  :is(.project-preferences-page, .settings-stage) .settings-section:not(.mw-settings-section) > :last-child { border-bottom: 0; }
  :is(.project-preferences-page, .settings-stage) :is(.settings-section, .mw-settings-section, .mcp-access) .settings-empty { display: grid; gap: 4px; padding: 12px 0 16px; }
  :is(.project-preferences-page, .settings-stage) :is(.settings-section, .mw-settings-section, .mcp-access) .settings-empty strong { font-size: 15px; color: var(--ink); }
  :is(.project-preferences-page, .settings-stage) :is(.settings-section, .mw-settings-section, .mcp-access) .settings-empty span { color: var(--muted); font-size: 13px; line-height: 1.5; }
  .setting-copy { display: grid; gap: 4px; min-width: 0; color: var(--ink); }
  .setting-copy > strong { font-size: 13px; font-weight: var(--weight-control, 500); line-height: 1.4; }
  .setting-copy > span { color: var(--muted); font-size: 12px; line-height: 1.5; }
  body.settings-page .settings-navigation--codex .settings-nav-body > a { gap: 12px; }
  body.settings-page .settings-navigation--codex .settings-nav-body > a svg { width: 16px; height: 16px; flex: none; color: var(--muted); }
  .setting-number { display: flex; gap: 8px; align-items: center; color: var(--muted); font-size: 12px; }
  .project-name-form input { width: 220px; min-width: 0; }
  .project-missing-plugin .mw-setting-row__copy > strong { overflow-wrap: anywhere; }
  :is(.project-preferences-page, .settings-stage) :is(input:not([type=checkbox]):not([type=radio]), select, textarea) { max-width: 100%; min-height: 36px; padding: 8px 12px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--paper); color: var(--ink); font: inherit; font-size: 13px; box-shadow: var(--lift-1); }
  :is(.project-preferences-page, .settings-stage) select { padding-right: 32px; }
  :is(.project-preferences-page, .settings-stage) textarea { width: 100%; resize: vertical; line-height: 1.65; }
  :is(.project-preferences-page, .settings-stage) button:not(.mw-btn) { font-size: 12px; font-weight: 400; }
  :is(.project-preferences-page, .settings-stage) :is(button, a, input, select, textarea, summary) { transition: background-color var(--dur-hover, 130ms) var(--ease-quint), border-color var(--dur-hover, 130ms) var(--ease-quint), color var(--dur-hover, 130ms) var(--ease-quint); }
  :is(.project-preferences-page, .settings-stage) :is(button, a, input, select, textarea, summary):focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
  .settings-data-disclosure, .settings-advanced { border-bottom: 1px solid var(--line); }
  :is(.project-preferences-page, .settings-stage) :is(.settings-data-disclosure, .settings-advanced) > summary { list-style: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 0; padding: 12px 0; cursor: pointer; }
  :is(.project-preferences-page, .settings-stage) summary::-webkit-details-marker { display: none; }
  :is(.project-preferences-page, .settings-stage) :is(.settings-data-disclosure, .settings-advanced) > summary > svg { flex: none; width: 14px; height: 14px; color: var(--muted); transition: transform var(--dur-hover) var(--ease-quint); }
  :is(.project-preferences-page, .settings-stage) :is(.settings-data-disclosure, .settings-advanced)[open] > summary > svg { transform: rotate(180deg); }
  .settings-data-list { margin: 0; padding: 0 0 24px; display: grid; gap: 12px; }
  .settings-data-list > div { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 16px; font-size: 12px; line-height: 1.6; }
  .settings-data-list dt { color: var(--muted); }
  .settings-data-list dd { margin: 0; overflow-wrap: anywhere; font-family: var(--font-mono, monospace); }
  :is(.project-preferences-page, .settings-stage) .project-manager-danger { margin: 0; padding: 16px 0; border: 0; background: none; }
  :is(.project-preferences-page, .settings-stage) .mw-settings-section__rows > .project-manager-danger:has(+ .settings-data-disclosure) { padding: 12px 0 4px; }
  :is(.project-preferences-page, .settings-stage) .project-manager-danger h3 { margin: 0 0 8px; font-size: 13px; font-weight: var(--weight-title, 600); }
  :is(.project-preferences-page, .settings-stage) .project-manager-danger p { max-width: 62ch; margin: 0 0 16px; font-size: 12px; line-height: 1.65; color: var(--muted); }
  :is(.project-preferences-page, .settings-stage) .project-manager-danger-actions { display: flex; gap: 8px; }
  :is(.project-preferences-page, .settings-stage) input.settings-switch { appearance: none; position: relative; flex: none; width: 34px; height: 20px; margin: 0; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--line-strong); cursor: pointer; }
  :is(.project-preferences-page, .settings-stage) input.settings-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--paper); box-shadow: var(--lift-1); transition: transform var(--dur-hover) var(--ease-quint); }
  :is(.project-preferences-page, .settings-stage) input.settings-switch:checked { background: var(--ink); border-color: var(--ink); }
  :is(.project-preferences-page, .settings-stage) input.settings-switch:checked::after { transform: translateX(14px); }
  :is(.project-preferences-page, .settings-stage) .settings-last-change { display: grid; gap: 4px; margin: 0; color: var(--muted); white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
  :is(.project-preferences-page, .settings-stage) .settings-last-change strong { color: var(--ink); font-size: 15px; font-weight: var(--weight-control, 500); }
  :is(.project-preferences-page, .settings-stage) .settings-rules-form { margin: 0; }
  :is(.project-preferences-page, .settings-stage) .settings-section .settings-data-disclosure .sync-row:last-child { border: 0; }
  :is(.project-preferences-page, .settings-stage) .settings-section .settings-data-disclosure > :not(summary) { padding-bottom: 8px; }
  :is(.project-preferences-page, .settings-stage) .settings-change-reason { display: grid; gap: 12px; padding-top: 12px; padding-bottom: 12px; }
  :is(.project-preferences-page, .settings-stage) .settings-change-reason .settings-save-footer { margin: 4px 0 0; }
  :is(.project-preferences-page, .settings-stage) .settings-save-footer { display: flex; justify-content: space-between; align-items: center; gap: 24px; margin-top: 24px; padding: 0; border: 0; }
  :is(.project-preferences-page, .settings-stage) .settings-save-footer > p, .settings-footnote { color: var(--muted); font-size: 12px; line-height: 1.65; }
  :is(.project-preferences-page, .settings-stage) .settings-save-footer button { flex: none; }
  :is(.project-preferences-page, .settings-stage) .settings-state-note { margin: 0 0 12px; color: var(--muted); font-size: 12px; }
  :is(.project-preferences-page, .settings-stage) :is(.guidance-settings-list, .guidance-advanced-list) { margin: 0 0 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); overflow: hidden; }
  :is(.project-preferences-page, .settings-stage) .guidance-section { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 0 16px; margin: 0; padding: 12px 16px; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; }
  :is(.project-preferences-page, .settings-stage) .guidance-section:last-child { border-bottom: 0; }
  :is(.project-preferences-page, .settings-stage) .guidance-section:has(.guidance-entry) { align-items: start; }
  :is(.project-preferences-page, .settings-stage) .guidance-section-heading { position: static; }
  :is(.project-preferences-page, .settings-stage) .guidance-section-heading h2 { margin: 0; font-size: 13px; font-weight: var(--weight-title, 600); }
  :is(.project-preferences-page, .settings-stage) .guidance-section-heading p { margin: 4px 0 0; color: var(--muted); font-size: 12px; }
  :is(.project-preferences-page, .settings-stage) .guidance-category-add { display: flex; align-items: center; gap: 4px; min-height: 28px; padding: 0 8px; border-radius: 6px; }
  :is(.project-preferences-page, .settings-stage) .guidance-category-add svg { width: 14px; height: 14px; }
  :is(.project-preferences-page, .settings-stage) .guidance-entry-list { grid-column: 1 / -1; }
  :is(.project-preferences-page, .settings-stage) .guidance-entry { margin-top: 8px; padding: 8px 0 0; background: transparent; border: 0; border-top: 1px solid var(--line); border-radius: 0; }
  :is(.project-preferences-page, .settings-stage) .guidance-entry > p { margin: 0; font-size: 13px; line-height: 1.55; }
  :is(.project-preferences-page, .settings-stage) .guidance-entry footer { margin-top: 8px; }
  :is(.project-preferences-page, .settings-stage) .guidance-entry-meta { font-size: 11px; }
  :is(.project-preferences-page, .settings-stage) .guidance-editor { margin: 0 0 12px; padding: 16px 16px; background: var(--paper); border: 1px solid var(--line); border-radius: 12px; box-shadow: none; }
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
    min-height: 0; margin: 0; padding: 12px 0; gap: 12px;
    font-size: inherit; font-weight: inherit; color: var(--ink);
  }
  :is(.project-preferences-page, .settings-stage) :is(.guidance-history, .guidance-inactive) > summary .setting-copy {
    color: inherit; font-size: inherit; font-weight: inherit;
  }
  :is(.project-preferences-page, .settings-stage) :is(.guidance-history, .guidance-inactive) > summary .setting-copy > strong { font-size: 13px; font-weight: var(--weight-control, 500); }
  :is(.project-preferences-page, .settings-stage) :is(.guidance-history, .guidance-inactive) > summary .setting-copy > span { color: var(--muted); font-size: 12px; font-weight: 400; }
  :is(.project-preferences-page, .settings-stage) :is(.guidance-history, .guidance-inactive) > :not(summary) { margin: 0; padding: 0 0 12px; border: 0; }
  :is(.project-preferences-page, .settings-stage) :is(.guidance-history-list, .guidance-inactive-body, .guidance-inactive-list) { margin: 0; padding: 0; border: 0; }
  :is(.project-preferences-page, .settings-stage) .guidance-inactive-list li:first-child { padding-top: 0; border-top: 0; }
  :is(.project-preferences-page, .settings-stage) :is(.guidance-history, .guidance-inactive) > :not(summary) p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
  :is(.project-preferences-page, .settings-stage) .settings-footnote { margin: 12px 0 0; }
  :is(.project-preferences-page, .settings-stage) .mw-btn { min-height: 32px; }
  :is(.project-preferences-page, .settings-stage) [data-planning-search] { width: 100%; }
  @media (max-width: 760px) {
    :is(body.project-preferences-page, .settings-stage) { --control-h: 44px; }
    :is(.project-preferences-page, .settings-stage) .project-preferences-chrome > a { width: 44px; height: 44px; }
    :is(body.project-preferences-page, .settings-stage) .settings-shell { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
    :is(body.project-preferences-page, .settings-stage) .settings-navigation.settings-navigation--codex { display: flex; flex-direction: column; align-items: stretch; padding: 8px 16px; border-right: 0; border-bottom: 1px solid var(--line); overflow: visible; }
    :is(body.project-preferences-page, .settings-stage) .settings-navigation--codex .settings-nav-back { align-self: flex-start; margin: 0 0 8px; min-height: 44px; }
    :is(.project-preferences-page, .settings-stage) .settings-project-identity { display: none; }
    :is(body.project-preferences-page, .settings-stage) .settings-navigation--codex .settings-nav-body { display: flex; flex-direction: row; gap: 4px; overflow-x: auto; padding: 4px; }
    :is(body.project-preferences-page, .settings-stage) .settings-navigation--codex .settings-nav-body > a { flex: none; min-height: 44px; padding: 0 8px; border: 1px solid var(--line-strong); font-size: 12px; white-space: nowrap; }
    :is(body.project-preferences-page, .settings-stage) .settings-navigation--codex .settings-nav-body > a svg { display: none; }
    :is(body.project-preferences-page, .settings-stage) .settings-content { padding: 24px 24px 48px; scrollbar-gutter: auto; }
    :is(.project-preferences-page, .settings-stage) :is(.guidance-page-header) { gap: 16px; flex-wrap: wrap; }
    :is(.project-preferences-page, .settings-stage) :is(.settings-page-heading, .settings-heading, .guidance-page-header) h1 { font-size: 20px; }
    .sync-row { align-items: stretch; flex-direction: column; }
    .project-name-form .mw-setting-row__control { flex: 1 1 100%; flex-wrap: nowrap; }
    .project-name-form .mw-setting-row__control input { flex: 1; width: auto; }
    :is(.project-preferences-page, .settings-stage) :is(input:not([type=checkbox]):not([type=radio]), select, textarea) { font-size: 16px; min-height: 44px; }
    :is(.project-preferences-page, .settings-stage) button { min-height: 44px; }
    :is(.project-preferences-page, .settings-stage) .settings-save-footer { flex-direction: column; align-items: stretch; }
    :is(.project-preferences-page, .settings-stage) .guidance-page-header { flex-direction: row; }
    :is(.project-preferences-page, .settings-stage) .guidance-entry footer { flex-wrap: wrap; }
    :is(.project-preferences-page, .settings-stage) .guidance-editor { padding: 16px; }
    .settings-data-list > div { grid-template-columns: 1fr; gap: 4px; }
  }
  @media (prefers-reduced-motion: reduce) {
    :is(.project-preferences-page, .settings-stage) *, :is(.project-preferences-page, .settings-stage) *::after { transition: none !important; animation: none !important; }
  }

  .settings-segmented { display: flex; flex: none; padding: 4px; gap: 4px; border: 1px solid var(--line); border-radius: 10px; background: var(--nav-bg); }
  .settings-segmented > :is(button, a) { display: flex; align-items: center; justify-content: center; min-height: 30px; padding: 0 12px; border: 1px solid transparent; border-radius: 6px; color: var(--muted); background: transparent; text-decoration: none; font-size: 12px; white-space: nowrap; box-shadow: none; }
  .settings-segmented > :is([aria-pressed="true"], [aria-current="true"]) { border-color: var(--line); color: var(--ink); background: var(--paper); box-shadow: var(--lift-1); }
  :is(.project-preferences-page, .settings-stage) .settings-record-title p { max-width: 48ch; margin: 0; color: var(--muted); font-size: 12px; line-height: 1.7; }
  :is(.project-preferences-page, .settings-stage) .diagnostics-summary { margin: 0 0 12px; padding: 12px 16px 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); }
  :is(.project-preferences-page, .settings-stage) .diagnostics-summary h2, :is(.project-preferences-page, .settings-stage) .launcher-section h2 { font-size: 15px; }
  :is(.project-preferences-page, .settings-stage) .diagnostics-summary dl { grid-template-columns: 1fr; }
  :is(.project-preferences-page, .settings-stage) .diagnostics-summary dl > div { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 16px; }
  :is(.project-preferences-page, .settings-stage) .diagnostics-summary dd { overflow-wrap: anywhere; }
  :is(.project-preferences-page, .settings-stage) .launcher-section { margin: 0 0 12px; padding: 12px 16px 8px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); }
  :is(.project-preferences-page, .settings-stage) .launcher-section ul { padding: 0; border: 0; background: transparent; }
  :is(.project-preferences-page, .settings-stage) .launcher-section li { border-radius: 0; border-bottom: 1px solid var(--line); padding: 16px 0; }
  :is(.project-preferences-page, .settings-stage) .launcher-section li:last-child { border-bottom: 0; }
  :is(body.project-preferences-page, .settings-stage) .settings-shell--standalone { grid-template-columns: minmax(0, 1fr); }
  @media (max-width: 760px) {
    :is(.project-preferences-page, .settings-stage) .settings-nav-group-label { display: none; }
    .settings-segmented { width: 100%; }
    .settings-segmented > :is(button, a) { flex: 1; min-height: 44px; padding: 0 8px; }
    :is(.project-preferences-page, .settings-stage) .diagnostics-summary dl > div { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  }



  /* Adding a project note keeps the editor in the available panel, with actions outside the field scroll. */
  :is(body.project-preferences-page, .settings-stage) .settings-content:has(.guidance-editor:not([hidden])) { display: flex; justify-content: center; overflow: hidden; padding: 24px clamp(24px, 4vw, 56px) 0; }
  :is(body.project-preferences-page, .settings-stage) .settings-content > .guidance-document:has(.guidance-editor:not([hidden])) { display: flex; flex: 1; flex-direction: column; overflow: hidden; }
  :is(.project-preferences-page, .settings-stage) .guidance-document:has(.guidance-editor:not([hidden])) > .settings-body { display: flex; flex: 1; min-height: 0; overflow: hidden; flex-direction: column; }
  :is(.project-preferences-page, .settings-stage) .guidance-editor-body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; padding: 4px 8px 24px 4px; }
  :is(.project-preferences-page, .settings-stage) .guidance-editor-actions { flex: none; padding: 12px 0; border-top: 1px solid var(--line); background: var(--paper); }
  :is(.project-preferences-page, .settings-stage) .guidance-editor footer { display: flex; flex-direction: row; justify-content: flex-end; gap: 8px; margin: 0; padding: 0; }
  :is(.project-preferences-page, .settings-stage) .guidance-editor-actions > [role=alert]:not([hidden]) { margin: 0 0 12px; max-height: 64px; overflow: auto; }
  /* The open editor marks its document (data-editing): a :has() followed by a broad selector here made the browser
     restyle the whole subtree of every :has() on the page with each node put in it (a long Assistant reply, a coloured change). */
  :is(.project-preferences-page, .settings-stage) .guidance-document[data-editing]:not([hidden]) > .guidance-page-header,
  :is(.project-preferences-page, .settings-stage) .guidance-document[data-editing]:not([hidden]) > .settings-body > :not(.guidance-editor) { display: none; }
  :is(.project-preferences-page, .settings-stage) .guidance-editor:not([hidden]) { display: flex; flex: 1; flex-direction: column; min-height: 0; margin: 0; padding: 0; border: 0; border-radius: 0; background: var(--paper); overflow: hidden; }
  :is(.project-preferences-page, .settings-stage) .guidance-editor > header { flex: none; padding: 0 4px 16px; }
  :is(.project-preferences-page, .settings-stage) .guidance-editor h2 { font-size: 20px; }
  :is(.project-preferences-page, .settings-stage) .guidance-editor form { display: flex; flex: 1; flex-direction: column; min-height: 0; margin: 0; gap: 0; overflow: hidden; }
  :is(.project-preferences-page, .settings-stage) .guidance-editor-body > label { margin-top: 16px; }
  :is(.project-preferences-page, .settings-stage) .guidance-editor textarea { max-height: 280px; }
  @media (max-width: 760px) {
    :is(body.project-preferences-page, .settings-stage) .settings-content:has(.guidance-editor:not([hidden])) { padding: 16px 16px 0; }
    :is(.project-preferences-page, .settings-stage) .guidance-editor h2 { font-size: 20px; }
    :is(.project-preferences-page, .settings-stage) .guidance-editor > header { padding-bottom: 12px; }
    :is(.project-preferences-page, .settings-stage) .guidance-editor-actions { padding: 12px 0; }
  }

  @media (max-height: 480px) {
    :is(body.project-preferences-page, .settings-stage) {
      & .settings-content:has(.guidance-editor:not([hidden])) { padding-top: 12px; }
      & .guidance-editor > header { padding-bottom: 8px; }
      & .guidance-editor header p { display: none; }
      & .guidance-editor-actions { padding: 8px 0; }
    }
  }
`;
