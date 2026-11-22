/**
 * Feed in the Soft Workbench language: an article column (search, 全部 / 未读 / 已保存, one timeline) beside a reading page.
 * Sources live in one menu at the top of the column; adding, settings and rules open in the reading side.
 * Shared shell, form and theme tokens stay authoritative.
 */
const F = "body.immersive-workbench .feed-workbench.plugin-stage-shell[data-feed-stage-shell]";
export const FEED_STYLES = `
${F} {
  display: grid; grid-template-columns: clamp(300px, 30%, 360px) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr);
  container: feed-workbench / size; height: 100%; padding: 0; gap: 0; background: var(--paper); overflow: hidden;
}
.feed-workbench [hidden] { display: none !important; }
/* Focus ring */
.feed-workbench :is(button:not(.mw-select), summary, select:not(.mw-select), input:not(.mw-input), textarea:not(.mw-textarea)):focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }

/* Article column */
${F} > .feed-column { grid-column: 1; grid-row: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; border-right: 1px solid var(--line); background: var(--surface-soft); }
${F} .feed-column-head { flex: none; padding: 24px 16px 0; border: 0; }
${F} .feed-column-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 4px 16px; }
${F} .feed-column-title h1 { margin: 0; font-size: 24px; font-weight: var(--weight-title, 600); letter-spacing: -.02em; line-height: 1.2; }
${F} .feed-column-actions { display: flex; align-items: center; gap: 4px; }
${F} .feed-column-actions .mw-btn:not([data-mw-help-auto]) { width: 32px; height: 32px; min-height: 32px; color: var(--muted); }
${F} .feed-column-actions .mw-btn:hover { color: var(--ink); }
/* The platform's 「帮助」 button lands here (data-help-slot) and keeps its label: same height as the icon buttons, its own width. */
${F} .feed-column-actions [data-mw-help-auto] { height: 32px; min-height: 32px; color: var(--muted); }
${F} .feed-column-actions svg { width: 16px; height: 16px; }

/* The source menu: one row that names what the list is showing. */
${F} .feed-source-menu { position: relative; }
${F} .feed-scope { display: grid; grid-template-columns: 18px minmax(0, 1fr) 16px; align-items: center; gap: 8px; min-height: 44px; padding: 8px 12px; border-radius: 8px; background: var(--paper); box-shadow: inset 0 0 0 1px var(--line); list-style: none; cursor: pointer; transition: box-shadow var(--dur-hover) var(--ease-quint), background-color var(--dur-hover) var(--ease-quint); }
${F} .feed-scope::-webkit-details-marker { display: none; }
${F} .feed-scope:hover { box-shadow: inset 0 0 0 1px var(--line-strong); }
${F} .feed-source-menu[open] > .feed-scope { box-shadow: inset 0 0 0 1px var(--line-strong); }
${F} .feed-scope-icon { display: grid; place-items: center; color: var(--accent); }
${F} .feed-scope-icon svg, ${F} .feed-scope-caret svg { width: 16px; height: 16px; }
${F} .feed-scope-caret { color: var(--muted); transition: transform var(--dur-move) var(--ease-quint); }
${F} .feed-source-menu[open] .feed-scope-caret { transform: rotate(180deg); }
${F} .feed-scope-copy { display: grid; min-width: 0; }
${F} .feed-scope-copy strong { font-size: 13px; font-weight: var(--weight-control, 500); color: var(--ink); line-height: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${F} .feed-scope-copy small { font-size: 12px; color: var(--muted); line-height: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${F} .feed-source-rail {
  position: absolute; left: 0; right: 0; top: calc(100% + 6px); z-index: 30; display: flex; flex-direction: column; gap: 4px;
  max-height: min(460px, 64cqb, 70dvh); overflow: auto; overscroll-behavior: contain; padding: 8px;
  border-radius: 12px; background: var(--popover, var(--paper)); box-shadow: var(--lift-3);
  animation: craft-drop var(--dur-move) var(--ease-quint) both;
}
${F} .feed-source-rail > header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 4px 8px 8px; }
${F} .feed-source-rail > header > span { font-size: 12px; color: var(--muted); }
${F} .feed-source-rail > header .mw-btn { min-height: 28px; font-size: 12px; }
${F} .feed-source-rail > nav { display: flex; flex-direction: column; gap: 4px; }
${F} .feed-rail-label { color: var(--muted); font-size: 12px; padding: 12px 8px 4px; }
${F} .feed-source-nav { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 8px; min-height: 48px; padding: 8px; border: 0; border-radius: 8px; color: var(--ink-soft); background: none; text-align: left; cursor: pointer; width: 100%; font: inherit; }
${F} .feed-source-nav:hover { background: var(--nav-hover); }
${F} .feed-source-nav.is-selected { background: var(--nav-active); color: var(--ink); }
${F} .feed-source-nav-icon { display: grid; place-items: center; color: var(--muted); }
${F} .feed-source-nav-icon svg { width: 16px; height: 16px; }
${F} .feed-source-nav strong { display: block; font-size: 13px; font-weight: var(--weight-control, 500); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${F} .feed-source-nav small { display: flex; align-items: center; gap: 4px; margin-top: 4px; color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${F} .feed-source-nav small svg { flex: none; width: 12px; height: 12px; }
${F} .feed-source-nav small.is-ready svg { color: var(--tone-done, var(--green)); }
${F} .feed-source-nav small.is-attention { color: var(--tone-attention, var(--amber)); }
${F} .feed-source-nav em { font-style: normal; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }

/* One source: its messages, settings and capture rules are three tabs under the menu. */
${F} .feed-source-tabs { display: flex; gap: 24px; margin: 12px 4px 0; border-bottom: 1px solid var(--line); }
${F} .feed-source-tabs button { border: 0; border-bottom: 2px solid transparent; background: none; padding: 8px 0; margin-bottom: -1px; font: inherit; font-size: 12px; color: var(--muted); cursor: pointer; }
${F} .feed-source-tabs button[aria-current] { color: var(--ink); border-bottom-color: var(--ink); }

/* Search with its filter menu, then the three-way switch. */
${F} > .feed-column > .feed-stage-toolbar { position: relative; inset: auto; z-index: 5; display: grid; gap: 12px; width: auto; max-width: none; height: auto; min-height: 0; flex: none; margin: 0; padding: 16px 16px 12px; border: 0; background: transparent; box-shadow: none; }
${F} .feed-search-row { display: flex; align-items: center; gap: 4px; min-width: 0; height: 36px; padding: 0 4px 0 12px; border-radius: 8px; background: var(--paper); box-shadow: inset 0 0 0 1px var(--line); transition: box-shadow var(--dur-hover) var(--ease-quint); }
${F} .feed-search-row:focus-within { box-shadow: inset 0 0 0 1px var(--accent), 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent); }
${F} .feed-search-row .feed-stage-search { display: flex; order: 0; align-items: center; gap: 8px; flex: 1; min-width: 0; width: auto; height: 34px; max-width: none; padding: 0; border: 0; background: transparent; box-shadow: none; color: var(--muted); }
${F} .feed-search-row .feed-stage-search svg { flex: none; width: 16px; height: 16px; }
${F} .feed-search-row .feed-stage-search input { flex: 1; min-width: 0; height: 32px; padding: 0; border: 0; appearance: none; -webkit-appearance: none; background: transparent; box-shadow: none; outline: 0; font: inherit; font-size: 13px; color: var(--ink); }
${F} .feed-search-row .feed-stage-search input::placeholder { color: var(--muted); }
${F} .feed-search-row .feed-directory-tools { order: 1; flex: none; }
${F} .feed-search-row .feed-filter-trigger { width: 30px; height: 30px; min-height: 30px; border-radius: 6px; }
${F} .feed-search-row .feed-filter-panel { left: auto; right: -3px; top: calc(100% + 8px); width: min(300px, calc(100cqi - 36px)); }
${F} .feed-quick-filter { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); width: 100%; }
${F} .feed-quick-filter .mw-toggle { justify-content: center; min-height: 30px; font-size: 12px; }

/* One timeline of messages, newest first. */
${F} > .feed-column > .feed-stage-list { position: relative; inset: auto; flex: 1; min-height: 0; width: auto; height: auto; max-width: none; margin: 0; padding: 0 12px 12px; overflow: auto; overscroll-behavior: contain; }
${F} .feed-stage-rows { display: flex; flex-direction: column; gap: 4px; }
${F} .feed-stage-item { width: 100%; min-width: 0; border: 0; }
${F} .feed-stage-item-line { display: block; }
${F} .plugin-stage-list .feed-stage-entry {
  display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: none; align-items: start; gap: 0;
  width: 100%; height: auto; min-height: 0; padding: 12px 16px 16px; border: 0; border-radius: 10px;
  background: none; box-shadow: none; color: var(--ink); text-align: left; cursor: pointer;
}
${F} .plugin-stage-list .feed-stage-entry:hover { background: color-mix(in srgb, var(--nav-hover) 80%, transparent); }
${F} .plugin-stage-list .feed-stage-entry:is(.is-selected, .is-open, [aria-expanded="true"]) { background: var(--paper); box-shadow: 0 0 0 1px var(--line), var(--lift-1); }
${F} .feed-entry-meta { display: flex; align-items: center; gap: 8px; min-width: 0; color: var(--muted); font-size: 12px; line-height: 16px; }
${F} .feed-entry-meta .feed-entry-provider { display: grid; place-items: center; width: 14px; height: 14px; flex: none; color: var(--muted); }
${F} .feed-entry-meta .feed-entry-provider svg { width: 14px; height: 14px; }
${F} .plugin-stage-list .feed-stage-entry .feed-entry-source { display: block; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 12px; }
${F} .plugin-stage-list .feed-stage-entry .feed-entry-meta time { display: block; flex: none; margin-left: auto; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
${F} .plugin-stage-list .feed-stage-entry .feed-stage-leading { display: block; min-width: 0; margin-top: 8px; overflow: visible; }
${F} .feed-entry-copy { display: block; min-width: 0; }
${F} .plugin-stage-list .feed-stage-entry .feed-entry-copy strong {
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; white-space: normal;
  font-size: 13px; font-weight: var(--weight-control, 500); line-height: 1.55; color: var(--ink); text-wrap: pretty;
}
${F} .feed-stage-entry[data-feed-entry-read="read"] .feed-entry-copy strong { color: var(--ink-soft); }
${F} .plugin-stage-list .feed-stage-entry .feed-entry-preview { display: block; margin-top: 4px; font-size: 12px; line-height: 1.6; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${F} .feed-entry-foot { display: flex; align-items: center; min-height: 0; margin-top: 8px; }
${F} .feed-entry-foot:not(:has(.feed-entry-status:not(:has([data-feed-read-state])))) { display: none; }
${F} .plugin-stage-list .feed-stage-entry .feed-entry-status { justify-self: start; font-size: 12px; }
${F} .plugin-stage-list .feed-stage-entry .feed-entry-status:has([data-feed-read-state]) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
${F} .plugin-stage-list .feed-stage-entry[data-feed-entry-status="saved"] .feed-entry-status { color: var(--tone-done, var(--green)); }
${F} .feed-list-empty.mw-empty { display: grid; justify-items: center; gap: 8px; margin: 32px auto 0; padding: 24px 16px; max-width: 30em; text-align: center; color: var(--muted); background: transparent; }
${F} .feed-list-empty.mw-empty > svg { width: 20px; height: 20px; color: var(--faint, var(--muted)); stroke-width: 1.6; }
${F} .feed-list-empty.mw-empty > strong { font-size: 15px; font-weight: var(--weight-title, 600); line-height: 1.5; letter-spacing: 0; color: var(--ink); }
${F} .feed-list-empty.mw-empty > .mw-btn { margin: 4px 0 0; }
${F} .feed-column-foot { flex: none; display: flex; align-items: center; gap: 8px; margin: 0 16px; padding: 12px 4px 16px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; }
${F} .feed-column-foot svg { width: 12px; height: 12px; }

/* ─── The reading side ───────────────────────────────────────────────── */
${F} > .feed-reader-idle { grid-column: 2; grid-row: 1; display: grid; place-content: center; justify-items: center; gap: 12px; padding: 32px; text-align: center; color: var(--muted); }
${F} > .feed-reader-idle h2 { margin: 8px 0 0; font-size: 15px; font-weight: var(--weight-title, 600); color: var(--ink); }
${F} > .feed-reader-idle p { margin: 0; max-width: 32em; font-size: 13px; line-height: 1.75; }
${F}[data-expanded="true"] > .feed-reader-idle,
${F}:is([data-feed-view="settings"], [data-feed-view="rules"], [data-feed-view="add"]) > .feed-reader-idle { display: none; }
${F} > .feed-stage-workspace { grid-column: 2; grid-row: 1; position: relative; inset: auto; width: auto; height: 100%; min-height: 0; border: 0; background: var(--paper); }
${F} .feed-stage-detail { position: relative; display: flex; flex-direction: column; min-height: 0; flex: 1; overflow: hidden; }
${F} .feed-stage-detail > .feed-reader-bar[data-stage-back-only] {
  position: relative; inset: auto; z-index: 4; flex: none; display: flex; align-items: center; gap: 12px;
  height: 56px; min-height: 56px; padding: 0 24px; pointer-events: auto; background: var(--paper); border-bottom: 1px solid transparent;
  transition: border-color var(--dur-move) var(--ease-quint);
}
${F} .feed-stage-detail:has(.feed-stage-item-detail[data-scrolled]) > .feed-reader-bar { border-bottom-color: var(--line); }
${F} .feed-reader-bar .plugin-stage-back { width: 32px; height: 32px; margin-left: -8px; border-radius: 8px; }
${F} .feed-reader-bar .plugin-stage-back > span { display: grid; place-items: center; }
${F} .feed-reader-bar .plugin-stage-back > .feed-back-narrow { display: none; }
${F} .feed-reader-bar .feed-back-wide svg { transform: none; }
${F} .feed-reader-source { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${F} .feed-reader-source svg { flex: none; width: 14px; height: 14px; }
${F} .plugin-stage-workspace .feed-stage-item-detail { flex: 1; min-height: 0; margin: 0; padding: 12px clamp(20px, 6cqi, 64px) 56px; overflow: auto; overscroll-behavior: contain; border-radius: 0; background: transparent; animation: none; }
${F} .feed-stage-item-detail .feed-detail { width: 100%; max-width: 700px; margin: 0 auto; padding: 0; border-radius: 0; background: transparent; box-shadow: none; animation: craft-rise var(--dur-arrive) var(--ease-quint) both; }

/* Heading: where it came from, the title, who and when, then the summary as the lead. */
${F} .feed-stage-item-detail .feed-detail-header { display: flex; flex-direction: column; width: 100%; max-width: none; padding: 16px 0 0; margin: 0; border: 0; }
${F} .feed-stage-item-detail .feed-detail-kicker { order: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; margin: 0 0 16px; }
${F} .feed-stage-item-detail .feed-detail-kicker .mw-status { min-height: 0; padding: 0; border: 0; background: transparent; box-shadow: none; font-size: 12px; font-weight: 400; color: var(--muted); }
${F} .feed-stage-item-detail .feed-detail-kicker .mw-status::before { display: none; }
${F} .feed-stage-item-detail .feed-detail-kicker .mw-status:first-child { color: var(--accent); font-weight: var(--weight-control, 500); }
${F} .feed-stage-item-detail .feed-detail-kicker .mw-status--attention:not(:first-child) { color: var(--tone-attention, var(--amber)); }
${F} .feed-stage-item-detail .feed-detail-header h1 { order: 1; max-width: 20em; margin: 0 0 16px; font-size: 24px; font-weight: var(--weight-title, 600); line-height: 1.4; letter-spacing: -.025em; text-wrap: balance; color: var(--ink); }
${F} .feed-stage-item-detail .feed-detail-meta { order: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; margin: 0 0 24px; font-size: 12px; color: var(--muted); }
${F} .feed-stage-item-detail .feed-detail-meta > span:has(svg) { display: inline-flex; align-items: center; gap: 8px; color: var(--ink-soft); }
${F} .feed-stage-item-detail .feed-detail-meta > span > svg { box-sizing: border-box; width: 20px; height: 20px; padding: 4px; border-radius: 50%; background: var(--surface-soft); color: var(--muted); stroke-width: 1.6; }
${F} .feed-stage-item-detail .feed-detail-meta :is(a, .mw-btn--link) { display: inline-flex; align-items: center; gap: 4px; min-height: 0; padding: 0; font-size: 12px; color: var(--accent); text-decoration: none; }
${F} .feed-stage-item-detail .feed-detail-meta :is(a, .mw-btn--link):hover { text-decoration: underline; text-underline-offset: 3px; }
${F} .feed-stage-item-detail .feed-detail-meta :is(a, .mw-btn--link) svg { width: 14px; height: 14px; }
${F} .feed-stage-item-detail .feed-detail-header > p { order: 3; margin: 0 0 32px; padding: 0 0 24px; border-bottom: 1px solid var(--line); font-size: 13px; line-height: 1.9; color: var(--ink); max-width: none; }

/* Body: prose at reading size. */
${F} .feed-stage-item-detail .feed-detail-body { margin: 0; padding: 0; border: 0; max-width: none; max-height: none; overflow: visible; }
${F} .feed-stage-item-detail .feed-detail-body > h2 { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
${F} .feed-stage-item-detail .feed-rich-content { font-size: 15px; line-height: 1.9; color: var(--ink-soft); overflow-wrap: anywhere; }
${F} .feed-stage-item-detail .feed-rich-content > :first-child { margin-top: 0; }
${F} .feed-stage-item-detail .feed-rich-content :is(p, ul, ol) { margin: 0 0 1.05em; }
${F} .feed-stage-item-detail .feed-rich-content :is(h1, h2, h3, h4) { margin: 1.7em 0 .6em; color: var(--ink); font-weight: var(--weight-title, 600); line-height: 1.5; letter-spacing: -.01em; }
${F} .feed-stage-item-detail .feed-rich-content :is(h1, h2) { font-size: 17px; }
${F} .feed-stage-item-detail .feed-rich-content :is(h3, h4) { font-size: 15px; }
${F} .feed-stage-item-detail .feed-rich-content blockquote { margin: 1.5em 0; padding: 4px 0 4px 16px; border-left: 2px solid var(--accent); font-size: 13px; color: var(--ink); }
${F} .feed-stage-item-detail .feed-rich-content a { color: var(--accent); text-underline-offset: 3px; }
${F} .feed-stage-item-detail .feed-rich-content :is(code, pre) { font-family: var(--font-mono, ui-monospace, monospace); font-size: 13px; border-radius: 6px; background: var(--surface-soft); }
${F} .feed-stage-item-detail .feed-rich-content code { padding: 1px 4px; }
${F} .feed-stage-item-detail .feed-rich-content pre { padding: 12px 16px; overflow: auto; line-height: 1.6; }
${F} .feed-stage-item-detail .feed-rich-content pre code { padding: 0; background: none; }
${F} .feed-stage-item-detail .feed-rich-content img { max-width: 100%; height: auto; border-radius: 8px; }
${F} .feed-stage-item-detail .feed-detail-tags { display: flex; flex-wrap: wrap; gap: 8px; margin: 24px 0 0; }
${F} .feed-stage-item-detail .feed-detail-tags span { padding: 4px 8px; border-radius: 999px; background: var(--surface-soft); font-size: 12px; color: var(--muted); }
${F} .feed-stage-item-detail .feed-materials { margin: 24px 0 0; border-radius: 10px; background: var(--surface-soft); }

/* End of the page: where it stands now, and what to do with it. */
${F} .feed-stage-item-detail .feed-reader-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px 24px; margin: 32px 0 0; padding: 24px 0 0; border-top: 1px solid var(--line); background: transparent; }
${F} .feed-stage-item-detail .feed-destination-strip { display: grid; grid-template-columns: auto auto; justify-content: start; align-items: baseline; gap: 4px 12px; flex: 1 1 240px; min-width: 0; margin: 0; padding: 0; border: 0; background: transparent; }
${F} .feed-stage-item-detail .feed-destination-strip > span { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
${F} .feed-stage-item-detail .feed-destination-strip > span svg { width: 14px; height: 14px; }
${F} .feed-stage-item-detail .feed-destination-strip > strong { font-size: 13px; font-weight: var(--weight-control, 500); color: var(--ink); }
${F} .feed-stage-item-detail .feed-destination-strip > small { grid-column: 1 / -1; font-size: 12px; line-height: 1.6; color: var(--muted); }
${F} .feed-stage-item-detail .feed-detail-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin: 0; padding: 0; border: 0; }
${F} .feed-stage-item-detail .feed-action-status { flex-basis: 100%; margin: 0; font-size: 12px; color: var(--muted); }
${F} .feed-stage-detail:has(> [data-feed-item-slot][hidden]) { flex: none; }
${F} .feed-stage-workspace > .feed-detail-empty { flex: 1; display: grid; place-content: center; justify-items: center; gap: 12px; padding: 32px; text-align: center; }

/* Adding a source, a source's settings and its capture rules take the reading side. */
${F} > .feed-setup-panel { grid-column: 2; grid-row: 1; position: relative; inset: auto; width: 100%; height: 100%; min-height: 0; padding: 0; background: var(--paper); overflow: hidden; }
${F}:is([data-feed-view="settings"], [data-feed-view="rules"], [data-feed-view="add"]) > .feed-stage-workspace { display: none; }
.feed-setup-panel .feed-task-dialog-shell { width:100%; height:100%; display:flex; flex-direction:column; min-height:0; }
.feed-setup-panel .mw-form__header { padding:24px 32px 12px; border:0; display:flex; justify-content:space-between; flex:none; }
.feed-setup-panel .mw-form__header h2 { margin:0; font-weight: var(--weight-title, 600); font-size:17px; }
.feed-setup-panel .mw-form__header p { margin:8px 0 0; font-size:12px; line-height:1.6; color:var(--muted); }
.feed-setup-panel .mw-form__body { padding:12px 32px 32px; flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; }
.feed-setup-panel :is([data-feed-task-config],[data-feed-source-setup],[data-feed-source-choices]) { max-width:700px; width:100%; margin-inline:auto; }
.feed-setup-panel .mw-form__footer { flex:none; display:flex; justify-content:flex-end; gap:8px; padding:12px 32px; border-top:1px solid var(--line); background:var(--paper); }
.feed-setup-panel label { display:flex; flex-direction:column; gap:8px; margin:16px 0; font-size:12px; color:var(--ink-soft); }
.feed-setup-panel :is(input:not([type=checkbox]),textarea) { box-sizing:border-box; width:100%; min-height:36px; padding:8px 12px; background:var(--paper); border:1px solid var(--line-strong); border-radius:6px; color:var(--ink); font:inherit; font-size:13px; }
.feed-setup-panel input[readonly] { background:var(--rail); color:var(--muted); }
/* Same box as the text fields beside it; only background-color, so the trigger keeps its chevron image. */
.feed-setup-panel .mw-select-picker__trigger { box-sizing:border-box; width:100%; min-height:36px; padding:8px 32px 8px 12px; background-color:var(--paper); background-position:right 10px center; border:1px solid var(--line-strong); border-radius:6px; color:var(--ink); font:inherit; font-size:13px; }
.feed-setup-panel textarea { resize:vertical; line-height:1.65; }
.feed-setup-panel :is(label small,p) { color:var(--muted); line-height:1.65; font-size:12px; }
.feed-setup-panel .check-row { flex-direction:row; align-items:center; }
.feed-setup-panel .feed-task-health { display:flex; justify-content:space-between; gap:12px; font-size:12px; padding:12px 0; color:var(--muted); }
.feed-setup-panel .feed-task-health strong { color:var(--ink-soft); font-weight: var(--weight-control, 500); }
.feed-setup-panel .feed-task-extra { padding:16px 0; border-top:1px solid var(--line); margin:16px 0 0; }
.feed-setup-panel .feed-task-extra summary { cursor:pointer; font-size:13px; color:var(--ink); padding:4px 0; }
.feed-setup-panel :is(.feed-plan-actions,.feed-task-controls,.feed-rule-actions) { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; }
.feed-setup-panel .feed-source-choice { display:grid; grid-template-columns:28px 1fr auto; align-items:center; gap:12px; width:100%; padding:16px 8px; border:0; border-bottom:1px solid var(--line); border-radius:0; background:transparent; color:var(--ink); text-align:left; cursor:pointer; }
.feed-setup-panel .feed-source-choice:hover { background:var(--nav-hover); }
.feed-setup-panel .feed-source-choice strong { font-size:15px; font-weight: var(--weight-control, 500); }
.feed-setup-panel .feed-source-choice small { font-size:12px; color:var(--muted); }
.feed-setup-panel .feed-source-choice svg { width:20px; height:20px; color:var(--muted); stroke-width: 1.6; }
.feed-setup-panel .feed-section-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.feed-setup-panel h3 { margin:0; font-size:15px; font-weight: var(--weight-title, 600); color:var(--ink); }
.feed-section-heading > span { font-size:11px; color:var(--muted); }
body.immersive-workbench .feed-workbench .feed-setup-panel .feed-capture-rule { display:flex; gap:12px; align-items:center; padding:16px 0; border-bottom:1px solid var(--line); }
body.immersive-workbench .feed-workbench .feed-capture-rule-copy { display:block; width:auto; flex:1; min-width:0; }
.feed-setup-panel .feed-capture-rule-copy strong { font-size:13px; font-weight: var(--weight-control, 500); }
.feed-setup-panel .feed-capture-rule-copy :is(p,small) { margin:4px 0; font-size:12px; line-height:1.6; color:var(--muted); }
body.immersive-workbench .feed-workbench .feed-capture-rule-actions { display:flex; width:auto; flex:none; gap:8px; }
body.immersive-workbench .feed-workbench .feed-capture-rule-actions .mw-btn { width:auto; min-width:0; }
body.immersive-workbench .feed-workbench .feed-capture-rule-copy :is(strong,p,small) { white-space:normal; overflow-wrap:anywhere; }
.feed-rule-composer { border-top:1px solid var(--line); margin-top:24px; padding-top:24px; }
.feed-rule-modes { display:flex; flex-wrap:wrap; gap:4px; padding:4px; width:fit-content; background:var(--control-fill); border-radius:7px; margin:16px 0; }
.feed-rule-modes button { font:inherit; font-size:12px; color:var(--muted); background:transparent; border:0; border-radius:5px; min-height:30px; padding:4px 12px; cursor:pointer; }
.feed-rule-modes button[aria-pressed=true] { color:var(--ink); background:var(--nav-active); }
.feed-rule-preview { padding:16px 0; border-block:1px solid var(--line); margin-top:24px; }
.feed-rule-preview > strong { font-size:12px; font-weight: var(--weight-control, 500); }
.feed-rule-preview-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:16px; padding:12px 0; font-size:12px; line-height:1.6; }
.feed-rule-preview-outcome { color:var(--muted); }
.feed-rule-preview-outcome[data-match=true] { color:var(--tone-done,var(--green)); }
.feed-rule-note { font-size:11px !important; }
[data-feed-rule-status][data-error=true] { color:var(--tone-attention,var(--amber)); }
/* The draft changed elsewhere (docs/design/rule-stale-reload): the alert sits under the buttons that were pressed and pins to the
   bottom of what can be seen, as the editor's footer does, so it stays whole above the bottom bar and the focus never lands behind it. */
.feed-rule-band:not(:empty) { position:sticky; bottom:8px; z-index:2; margin-top:12px; }
.feed-rule-band .mw-alert { box-shadow:var(--lift-3); }
.feed-rule-band .mw-alert:not(.mw-alert--warning, .mw-alert--success) { background:var(--paper); }
.feed-setup-panel .feed-rule-band .mw-alert p { margin:0; font-size:13px; color:var(--ink-soft); white-space:pre-line; }
.feed-setup-panel p.mw-kept__text { font-size:13px; color:var(--ink-soft); }
.feed-setup-panel p.mw-kept__text.is-blank { color:var(--muted); }
.feed-setup-panel .mw-form__body:has(.feed-rule-band:not(:empty)) { scroll-padding-bottom:180px; }
/* A short pane has no room for a pinned alert: it would cover the very rows it points to, so it stays in place under the buttons. */
@media (max-height:560px) { .feed-rule-band:not(:empty) { position:static; } .feed-rule-band .mw-alert { box-shadow:none; } .feed-setup-panel .mw-form__body:has(.feed-rule-band:not(:empty)) { scroll-padding-bottom:0; } }
@media (max-width:760px) {
  .feed-source-tabs button, .feed-rule-modes button { min-height:44px; }
}

/* A narrow Feed shows one side at a time: the column, or the page it opened. */
@container feed-workbench (max-width: 820px) {
  ${F} > :is(.feed-column, .feed-stage-workspace, .feed-setup-panel) { grid-column: 1 / -1; }
  ${F} > .feed-column { border-right: 0; }
  ${F} > .feed-reader-idle { display: none; }
  ${F}[data-expanded="true"] > .feed-column,
  ${F}:is([data-feed-view="settings"], [data-feed-view="rules"], [data-feed-view="add"]) > .feed-column { display: none; }
  ${F} .feed-column-head { padding: 16px 16px 0; }
  ${F} > .feed-column > .feed-stage-toolbar { padding: 12px 16px 12px; }
  ${F} > .feed-column > .feed-stage-list { padding: 0 8px 12px; }
  ${F} .feed-column-foot { margin: 0 16px; }
  ${F} .feed-reader-bar .plugin-stage-back > .feed-back-narrow { display: grid; }
  ${F} .feed-reader-bar .plugin-stage-back > .feed-back-wide { display: none; }
  ${F} .feed-stage-detail > .feed-reader-bar[data-stage-back-only] { padding: 0 16px; }
  ${F} .plugin-stage-workspace .feed-stage-item-detail { padding: 8px 24px 48px; }
  ${F} .feed-stage-item-detail .feed-detail-header h1 { font-size: 20px; }
  ${F} .feed-stage-item-detail .feed-detail-actions { justify-content: flex-start; }
  .feed-setup-panel .mw-form__body { padding: 12px 16px 24px; }
  .feed-setup-panel .mw-form__header { padding: 16px 16px 8px; }
  .feed-setup-panel .mw-form__footer { padding: 12px 16px; }
  .feed-setup-panel .feed-source-choice { grid-template-columns: 24px minmax(0,1fr); }
  .feed-setup-panel .feed-source-choice small { grid-column: 2; }
  body.immersive-workbench .feed-workbench .feed-setup-panel .feed-capture-rule { align-items: stretch; flex-direction: column; gap: 12px; }
  .feed-setup-panel .feed-capture-rule-actions .mw-btn { min-height: 44px; }
}
@media (max-width: 760px) {
  ${F} .feed-scope { min-height: 48px; }
  ${F} .feed-source-nav { min-height: 52px; }
  ${F} .feed-quick-filter .mw-toggle { min-height: 36px; }
  ${F} .feed-search-row { height: 44px; }
  ${F} .plugin-stage-list .feed-stage-entry .feed-entry-copy strong { font-size: 15px; }
  ${F} .feed-stage-item-detail .feed-detail-actions > .mw-btn { min-height: 44px; }
}
/* A short Feed (a split pane, a low window) gives its height to the list: a tighter heading and cards, with pagination kept reachable. */
@container feed-workbench (max-height: 560px) {
  ${F} .feed-column-head { padding-top: 12px; }
  ${F} .feed-column-title { padding-bottom: 8px; }
  ${F} .feed-column-title h1 { font-size: 17px; }
  ${F} .feed-scope { min-height: 38px; padding-block: 4px; }
  ${F} .feed-scope-copy small { display: none; }
  ${F} > .feed-column > .feed-stage-toolbar { gap: 8px; padding-block: 8px; }
  ${F} .feed-search-row { height: 32px; }
  ${F} .feed-quick-filter .mw-toggle { min-height: 26px; }
  ${F} .plugin-stage-list .feed-stage-entry { padding: 8px 12px 12px; }
  ${F} .plugin-stage-list .feed-stage-entry .feed-stage-leading { margin-top: 4px; }
  ${F} .plugin-stage-list .feed-stage-entry .feed-entry-copy strong { -webkit-line-clamp: 1; }
  ${F} .feed-column-foot { padding-block: 6px; flex-wrap: wrap; }
  ${F} .feed-stage-detail > .feed-reader-bar[data-stage-back-only] { height: 44px; min-height: 44px; }
}
/* A very short pane (a split under a split) keeps every control, with tighter rows and one line per item:
   the preview is left to the reader, so a few items still show between the header and the pane's edge. */
@container feed-workbench (max-height: 420px) {
  ${F} .feed-column-head { padding-top: 8px; }
  ${F} .feed-column-title { padding-bottom: 4px; }
  ${F} .feed-scope { min-height: 32px; }
  ${F} > .feed-column > .feed-stage-toolbar { gap: 4px; padding-block: 4px; }
  ${F} .plugin-stage-list .feed-stage-entry .feed-entry-preview { display: none; }
}

/* Feed base, filter panel, materials, rich content, connector cards and Source workbench styles (PEQ-08). */
.feed-directory-tools { display: grid; gap: 8px; }
.feed-directory-toolbar { min-width: 0; position: relative; display: flex; align-items: center; gap: 4px; }
.feed-filter-control { position: relative; overflow: visible; }
.feed-filter-trigger { width: 28px; height: 28px; min-height: 28px; padding: 0; border: 0; border-radius: 6px; color: var(--muted); background: none; display: grid; place-items: center; position: relative; cursor: pointer; }
.feed-filter-trigger:is(:hover, [aria-expanded="true"], .is-active) { color: var(--ink); background: var(--nav-active); }
.feed-filter-trigger > svg { width: 16px; height: 16px; }
.feed-filter-trigger > span { min-width: 14px; height: 14px; padding: 0 4px; border-radius: 7px; color: var(--action-ink); background: var(--action); display: grid; place-items: center; position: absolute; top: -4px; right: -4px; font-size: 11px; font-variant-numeric: tabular-nums; line-height: 1; box-shadow: var(--lift-1); }
.feed-filter-trigger > span[hidden] { display: none; }
.feed-filter-panel { position: absolute; top: calc(100% + 6px); right: 0; z-index: 30; width: min(360px, calc(100vw - 48px)); max-height: min(420px, 50vh); margin: 0; padding: 12px; border: 0; border-radius: 10px; background: var(--paper); color: var(--ink); box-shadow: var(--lift-3); overflow: auto; overscroll-behavior: contain; }
.feed-filter-panel[hidden] { display: none; }
.feed-filter-panel > header { min-height: 28px; display: flex; align-items: center; gap: 8px; }
.feed-filter-panel > header strong { font-size: 12px; font-weight: var(--weight-control, 500); }
.feed-filter-panel > header .mw-btn { margin-left: auto; }
.feed-filter-section { padding-top: 8px; border-top: 1px solid var(--line); display: grid; gap: 4px; }
.feed-filter-section + .feed-filter-section { margin-top: 8px; }
.feed-filter-section > span { color: var(--faint); font-size: 11px; }
.feed-filter-options { min-width: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
.feed-filter-option { min-width: 0; min-height: 30px; padding: 0 8px; border: 0; border-radius: 6px; color: var(--muted); background: none; display: grid; grid-template-columns: minmax(0, 1fr) 12px; align-items: center; gap: 4px; font: inherit; font-size: 11px; text-align: left; cursor: pointer; }
.feed-filter-option:hover { color: var(--ink); background: var(--nav-hover); }
.feed-filter-option[aria-checked="true"] { color: var(--blue-dark); background: color-mix(in srgb, var(--blue) 10%, transparent); }
.feed-filter-option span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.feed-filter-option svg { width: 12px; height: 12px; opacity: 0; }
.feed-filter-option[aria-checked="true"] svg { opacity: 1; }
.feed-workbench .feed-list-empty { margin: 8px 4px; padding: 24px 12px; border-radius: 12px; color: var(--muted); background: none; display: grid; justify-items: center; gap: 8px; text-align: center; }
.feed-workbench .feed-list-empty[hidden] { display: none; }
.feed-workbench .feed-list-empty strong { color: var(--ink); font-size: 13px; font-weight: var(--weight-control, 500); }
.feed-workbench .feed-list-empty p { margin: 0; font-size: 11px; line-height: 1.5; }
.feed-directory-footer { min-height: 38px; padding: 4px 8px; border-top: 1px solid color-mix(in srgb, var(--line) 62%, transparent); display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--faint); }
.feed-directory-footer small { display: inline-flex; align-items: center; gap: 8px; }
.feed-directory-footer small button { min-height: 24px; padding: 0 4px; border: 0; color: var(--blue-dark); background: none; font: inherit; font-size: 11px; cursor: pointer; }
.feed-materials { max-width: 76ch; margin-top: 24px; border: 1px solid var(--line); border-radius: 8px; }
.feed-materials > summary { display: flex; align-items: center; gap: 8px; padding: 12px; list-style: none; font-size: 12px; cursor: pointer; }
.feed-materials > summary::-webkit-details-marker { display: none; }
.feed-materials > summary svg { width: 14px; height: 14px; color: var(--muted); }
.feed-materials > summary small { margin-left: auto; color: var(--muted); }
.feed-materials[open] > summary > svg:last-child { transform: rotate(180deg); }
.feed-materials ul { margin: 0; padding: 0 12px; list-style: none; }
.feed-materials li { padding: 12px 4px; border-top: 1px solid color-mix(in srgb, var(--line) 64%, transparent); display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: start; gap: 8px; }
.feed-materials li > span { width: 22px; height: 22px; border-radius: 7px; color: var(--muted); background: color-mix(in srgb, var(--rail) 62%, transparent); display: grid; place-items: center; }
.feed-materials li svg { width: 12px; height: 12px; }
.feed-materials li div { min-width: 0; display: grid; gap: 4px; }
.feed-materials li strong { color: var(--ink-soft); font-size: 12px; font-weight: var(--weight-control, 500); }
.feed-materials li small { color: var(--faint); font-size: 11px; }
.feed-materials li p { margin: 4px 0 0; overflow: hidden; color: var(--muted); font-size: 11px; line-height: 1.5; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.feed-materials .feed-material-empty { grid-template-columns: 22px minmax(0, 1fr); }
.feed-material-content { margin-top: 8px; color: var(--muted); font-size: 11px; }
.feed-material-content summary { color: var(--blue-dark); cursor: pointer; }
.feed-material-content > div { max-height: 320px; margin-top: 8px; padding: 12px; overflow: auto; border-radius: 8px; color: var(--ink-soft); background: color-mix(in srgb, var(--rail) 54%, transparent); font-size: 11px; line-height: 1.7; white-space: pre-wrap; }
.feed-material-unavailable { color: var(--danger) !important; }
.feed-rich-content table { width: 100%; max-width: 100%; margin: 1.3em 0; border-collapse: collapse; display: block; overflow-x: auto; overscroll-behavior-inline: contain; }
.feed-rich-content :is(th, td) { min-width: 110px; padding: 8px 12px; border-bottom: 1px solid var(--line); text-align: start; vertical-align: top; }
.feed-rich-content th { color: var(--ink); font-size: 12px; font-weight: var(--weight-control, 500); background: color-mix(in srgb, var(--ink) 4%, transparent); }
.feed-rich-content details { margin: 1.35em 0; padding-block: 12px; border-block: 1px solid color-mix(in srgb, var(--line) 78%, transparent); }
.feed-rich-content summary { color: var(--ink); cursor: pointer; }
.feed-rich-content hr { margin: 1.8em 0; border: 0; border-top: 1px solid var(--line); }
.feed-destination-strip[data-destination-state="inbox"] strong { color: var(--amber); }
.feed-destination-strip[data-destination-state="saved"] strong { color: var(--green); }
.feed-destination-strip[data-destination-state="promoted"] strong { color: var(--blue-dark); }
.feed-source-list { display: grid; gap: 4px; }
.feed-source-empty { margin: 0; padding: 16px; border-radius: 10px; color: var(--muted); background: color-mix(in srgb, var(--rail) 48%, transparent); font-size: 11px; }
.feed-connector-card { min-width: 0; padding: 12px; border-radius: 12px; background: color-mix(in srgb, var(--rail) 52%, var(--paper)); display: grid; align-content: start; gap: 8px; }
.feed-connector-card > div:first-child { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.feed-connector-card strong { font-size: 12px; }
.feed-connector-card em { color: var(--blue-dark); font-size: 11px; font-style: normal; }
.feed-connector-card :is(> p, details p) { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.5; }
.feed-connector-card details { padding-top: 8px; border-top: 1px solid color-mix(in srgb, var(--line) 64%, transparent); display: grid; gap: 8px; }
.feed-connector-card summary { color: var(--muted); font-size: 11px; cursor: pointer; }
.feed-source-progress { position: sticky; bottom: 0; margin: 0; padding: 8px 12px; border-radius: 8px; font-size: 11px; color: var(--blue-dark); background: color-mix(in srgb, var(--blue) 10%, var(--paper)); }
.source-directory { min-height: 0; grid-template-rows: auto auto minmax(0, 1fr) auto; background: transparent; }
.source-directory:not([hidden]) { display: grid; }
.source-directory-heading { grid-template-columns: 24px minmax(0, 1fr) 24px; }
.source-add-trigger { width: 24px; height: 24px; padding: 0; border: 0; border-radius: 7px; color: var(--muted); background: transparent; display: grid; place-items: center; cursor: pointer; }
.source-add-trigger:hover { color: var(--ink); background: var(--nav-hover); }
.source-add-trigger svg { width: 14px; height: 14px; }
.source-mobile-add { display: none; }
.source-directory-tools { padding: 4px 8px 8px; display: grid; gap: 8px; }
.source-filter-row { min-width: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
.source-filter-row button { min-width: 0; min-height: 28px; padding: 0 4px; border: 0; border-radius: 7px; color: var(--faint); background: transparent; overflow: hidden; font: inherit; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.source-filter-row button:hover { color: var(--ink); background: var(--nav-hover); }
.source-filter-row button.is-active { color: var(--blue-dark); background: color-mix(in srgb, var(--blue) 10%, transparent); }
.source-list { min-height: 0; padding: 1px 4px 8px; overflow-y: auto; }
.source-list-item { width: 100%; min-width: 0; min-height: 36px; padding: 4px 8px; border: 0; border-radius: 6px; color: var(--ink-soft); background: transparent; display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 8px; text-align: left; cursor: pointer; }
.source-list-item:is(:hover, .is-selected) { color: var(--ink); background: var(--nav-active); }
.source-list-icon { width: 22px; height: 22px; border-radius: 7px; color: var(--muted); background: color-mix(in srgb, var(--paper) 66%, transparent); display: grid; place-items: center; }
.source-list-icon svg { width: 12px; height: 12px; }
.source-list-copy { min-width: 0; display: grid; gap: 4px; }
.source-list-copy > span { min-width: 0; display: flex; align-items: center; gap: 4px; }
.source-list-copy strong { color: inherit; font-size: 13px; font-weight: var(--weight-control, 500); line-height: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.source-list-copy :is(p, small, em) { font-size: 11px; line-height: 16px; color: var(--faint); font-style: normal; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.source-list-copy em { color: var(--blue-dark); }
.source-list-state { max-width: 68px; align-self: start; }
.source-list-state[data-source-status="active"] { color: var(--green); }
.source-list-state[data-source-status="attention"] { color: var(--red); }
.source-list-state[data-source-status="syncing"] { color: var(--blue-dark); }
.source-list-state[data-source-status="paused"] { color: var(--faint); }
.source-workbench { width: 100%; background: var(--page); }
.source-workbench:not([hidden]) { display: block; }
.source-detail { width: min(100%, 1120px); margin: 0 auto; padding: 32px clamp(20px, 4vw, 52px) 72px; }
.source-detail-header { padding: 8px 8px 24px; display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
.source-detail-identity { min-width: 0; display: grid; grid-template-columns: 42px minmax(0, 1fr); align-items: start; gap: 12px; }
.source-detail-mark { width: 42px; height: 42px; border-radius: 12px; color: var(--blue-dark); background: var(--paper); box-shadow: var(--lift-1); display: grid; place-items: center; }
.source-detail-mark svg { width: 20px; height: 20px; stroke-width: 1.6; }
.source-detail-labels { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.source-detail-labels :is(span, em) { padding: 4px 8px; border-radius: 6px; font-size: 11px; font-style: normal; }
.source-detail-labels span { color: var(--blue-dark); background: color-mix(in srgb, var(--blue) 10%, transparent); }
.source-detail-labels em { color: var(--faint); background: color-mix(in srgb, var(--ink) 5%, transparent); }
.source-detail-header h1 { margin: 8px 0 0; color: var(--ink); font-size: 24px; font-weight: var(--weight-title, 600); letter-spacing: -.03em; line-height: 1.16; }
.source-detail-header p { max-width: 64ch; margin: 8px 0 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
.source-detail-health { flex: 0 0 auto; padding: 8px; border-radius: 9px; background: color-mix(in srgb, var(--paper) 62%, transparent); display: grid; justify-items: end; gap: 4px; }
.source-detail-health strong { color: var(--green); font-size: 11px; font-weight: var(--weight-control, 500); }
.source-detail-health[data-source-status="attention"] strong { color: var(--red); }
.source-detail-health[data-source-status="syncing"] strong { color: var(--blue-dark); }
.source-detail-health[data-source-status="paused"] strong { color: var(--faint); }
.source-detail-health small { color: var(--faint); font-size: 11px; }
.source-detail-tabs { width: fit-content; max-width: calc(100% - 16px); min-height: 34px; margin: 0 8px 12px; padding: 4px; border-radius: 10px; background: color-mix(in srgb, var(--paper) 54%, transparent); display: flex; align-items: center; gap: 4px; }
.source-detail-tabs button { min-height: 28px; padding: 0 12px; border: 0; border-radius: 8px; color: var(--faint); background: transparent; font: inherit; font-size: 11px; cursor: pointer; }
.source-detail-tabs button:hover { color: var(--ink); }
.source-detail-tabs button.is-active { color: var(--ink); background: var(--paper); box-shadow: var(--shadow-soft); }
.source-detail-panels { min-height: 400px; }
.source-detail-panel { min-height: 360px; padding: 24px 24px 32px; border-radius: 14px; background: var(--paper); box-shadow: var(--lift-1); }
.source-detail-panel[hidden] { display: none; }
.source-panel-heading { margin: 0 0 16px; display: grid; gap: 4px; }
.source-panel-heading h2 { margin: 0; color: var(--ink); font-size: 15px; font-weight: var(--weight-title, 600); }
.source-panel-heading p { max-width: 68ch; margin: 0; color: var(--muted); font-size: 11px; line-height: 1.5; }
.source-overview-section { margin-top: 24px; }
.source-overview-ledger { margin: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 32px; }
.source-overview-ledger > div { min-width: 0; padding: 12px 0; border-top: 1px solid color-mix(in srgb, var(--line) 64%, transparent); display: grid; grid-template-columns: minmax(96px, .42fr) minmax(0, 1fr); align-items: baseline; gap: 12px; }
.source-overview-ledger dt { color: var(--muted); font-size: 11px; font-weight: var(--weight-control, 500); }
.source-overview-ledger dd { min-width: 0; margin: 0; overflow: hidden; color: var(--ink-soft); font-size: 12px; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
.source-now { padding: 0 0 24px; border-bottom: 1px solid color-mix(in srgb, var(--line) 64%, transparent); display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 16px; }
.source-now h2, .source-message-list h2, .source-schedule-heading h2 { margin: 0; color: var(--ink); font-size: 15px; font-weight: var(--weight-title, 600); }
.source-now p, .source-message-list header p, .source-schedule-heading p { margin: 4px 0 0; color: var(--muted); font-size: 11px; line-height: 1.55; }
.source-now [data-source-action-status] { grid-column: 1 / -1; margin: 0; color: var(--blue-dark); font-size: 11px; }
.source-runtime-actions { margin-top: 24px; padding-top: 16px; border-top: 1px solid color-mix(in srgb, var(--line) 64%, transparent); display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; }
.source-runtime-actions summary { min-height: 34px; padding: 0 12px; border: 0; border-radius: 8px; color: var(--ink-soft); background: color-mix(in srgb, var(--rail) 74%, var(--paper)); display: inline-flex; align-items: center; gap: 4px; font: inherit; font-size: 11px; cursor: pointer; list-style: none; }
.source-runtime-actions summary::-webkit-details-marker { display: none; }
.source-runtime-actions details[open] { width: min(100%, 520px); padding: 12px; border-radius: 12px; background: color-mix(in srgb, var(--red) 5%, var(--paper)); }
.source-runtime-actions details[open] summary { width: fit-content; color: var(--red); background: color-mix(in srgb, var(--red) 7%, var(--paper)); }
.source-runtime-actions details p { margin: 12px 0; color: var(--muted); font-size: 11px; line-height: 1.55; }
.source-runtime-actions details div { display: flex; flex-wrap: wrap; gap: 8px; }
.source-config-sheet, .source-schedule-sheet { max-width: 760px; display: grid; gap: 16px; }
.source-config-sheet label, .source-schedule-sheet > label { display: grid; gap: 8px; }
.source-config-sheet label > span, .source-schedule-sheet > label > span { color: var(--faint); font-size: 11px; }
.source-config-sheet :is(input, textarea, select), .source-schedule-sheet select { width: 100%; min-width: 0; min-height: 38px; padding: 8px 12px; border: 1px solid color-mix(in srgb, var(--line) 76%, transparent); border-radius: 9px; outline: 0; color: var(--ink); background: var(--paper); font: inherit; font-size: 11px; }
.source-config-sheet textarea { resize: vertical; }
.source-config-sheet input[readonly] { color: var(--faint); background: color-mix(in srgb, var(--ink) 3%, var(--paper)); cursor: not-allowed; }
.source-config-help { color: var(--faint); font-size: 11px; line-height: 1.5; }
.source-config-actions, .source-schedule-actions { display: flex; align-items: center; gap: 12px; }
.source-config-actions small, .source-schedule-actions small { color: var(--faint); font-size: 11px; }
.source-config-sheet > p, .source-schedule-sheet > p { margin: -8px 0 0; color: var(--blue-dark); font-size: 11px; }
.source-schedule-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.source-schedule-toggle { min-height: 36px; display: inline-flex; align-items: center; gap: 8px; color: var(--ink-soft); font-size: 11px; }
.source-schedule-toggle input { width: 16px; height: 16px; accent-color: var(--blue-dark); }
.source-message-list > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.source-message-list ul, .source-run-ledger { margin: 16px 0 0; padding: 0; list-style: none; }
.source-message-list li, .source-run-ledger li { min-width: 0; padding: 12px 4px; border-top: 1px solid color-mix(in srgb, var(--line) 68%, transparent); display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; align-items: start; gap: 8px; }
.source-message-list li > svg, .source-run-ledger li > span { width: 24px; height: 24px; border-radius: 7px; color: var(--muted); background: color-mix(in srgb, var(--ink) 5%, transparent); display: grid; place-items: center; }
.source-run-ledger li svg { width: 12px; height: 12px; }
.source-message-list li span, .source-run-ledger li div { min-width: 0; display: grid; gap: 4px; }
.source-message-list li strong, .source-run-ledger li strong { color: var(--ink-soft); font-size: 11px; font-weight: var(--weight-control, 500); }
.source-message-list li small, .source-run-ledger li :is(p, time) { margin: 0; color: var(--faint); font-size: 11px; line-height: 1.45; }
.source-run-ledger li[data-run-state="error"] > span { color: var(--red); background: color-mix(in srgb, var(--red) 9%, transparent); }
.source-run-ledger li[data-run-state="running"] > span { color: var(--blue-dark); background: color-mix(in srgb, var(--blue) 10%, transparent); }
.source-panel-empty { margin-top: 16px; padding: 32px; color: var(--faint); display: grid; justify-items: center; gap: 8px; text-align: center; }
.source-panel-empty strong { color: var(--ink-soft); font-size: 11px; }
.source-panel-empty p { margin: 0; font-size: 12px; }
@media (max-width: 760px) {
  .source-detail { width: 100%; margin: 0; padding: 16px 12px 56px; }
  .source-detail-header { padding: 8px 8px 16px; align-items: stretch; flex-direction: column; gap: 16px; }
  .source-overview-ledger { grid-template-columns: minmax(0, 1fr); }
  .source-now { grid-template-columns: minmax(0, 1fr); }
  .source-now button { width: 100%; min-height: 44px; }
  .source-message-list li, .source-run-ledger li { grid-template-columns: 24px minmax(0, 1fr); }
  .feed-destination-strip { grid-template-columns: minmax(0, 1fr); }
  .feed-destination-strip small { grid-column: 1; }
}

/* Feed-owned rules migrated out of shared workbench and design-system sheets (PEQ-08, PG-070). */
body.immersive-workbench .tab-pane-body > .feed-workbench { background: var(--canvas); }
body.immersive-workbench .feed-stage-toolbar { height: 32px; min-height: 32px; padding: 0 12px; gap: 8px; margin: 0; overflow: visible; }
body.immersive-workbench .feed-stage-toolbar .feed-directory-tools,
body.immersive-workbench .feed-stage-toolbar .feed-directory-toolbar,
body.immersive-workbench .feed-stage-toolbar .feed-filter-control { padding: 0; margin: 0; min-height: 26px; height: 26px; display: flex; align-items: center; gap: 0; }
body.immersive-workbench .feed-stage-heading h1,
body.immersive-workbench .feed-stage-toolbar > h1 { font-size: 13px; font-weight: var(--weight-title, 600); letter-spacing: 0; margin: 0; }
body.immersive-workbench .feed-stage-search { height: 26px; border-radius: 6px; }
body.immersive-workbench .plugin-stage-shell > .plugin-stage-chrome.feed-stage-toolbar {
  position: absolute; top: 16px; left: 20px; z-index: 20;
  height: auto; min-height: 0; width: max-content; max-width: calc(100% - 40px);
  padding: 0; margin: 0; border: 0; background: transparent;
}
body.immersive-workbench .plugin-stage-workspace .feed-stage-item-detail {
  flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain;
  padding: 0 24px 24px; margin: 0; border-radius: 0; background: transparent; animation: none;
}
body.immersive-workbench .plugin-stage-shell .feed-filter-control { position: relative; overflow: visible; }
body.immersive-workbench .plugin-stage-shell .feed-filter-panel {
  left: 0; right: auto; top: calc(100% + 6px);
  width: min(360px, calc(100vw - 96px)); max-height: min(320px, calc(100dvh - 120px));
}
body.immersive-workbench .feed-workbench .plugin-stage-workspace .feed-stage-item-detail .feed-detail-header :is(h1, .feed-detail-kicker, p, time) { display: revert; }
body.immersive-workbench .feed-workbench .plugin-stage-workspace .feed-stage-item-detail .feed-detail-body { max-height: none; overflow: visible; padding: 0; }
body.immersive-workbench .feed-stage-task-head,
body.immersive-workbench .feed-stage-add-toggle { height: 32px; min-height: 32px; padding: 4px 8px; }
body.immersive-workbench .feed-entry-provider { width: 16px; height: 16px; border: 0; border-radius: 0; background: transparent; }
body.immersive-workbench .feed-entry-provider svg { width: 14px; height: 14px; }
body.immersive-workbench .feed-stage-item-detail { padding: 0 12px 12px 32px; }
body.immersive-workbench .feed-workbench .feed-stage-item-detail .feed-rich-content { font-size: 13px; line-height: 1.6; }
body.immersive-workbench .feed-workbench .feed-reader-footer .feed-detail-actions button { min-height: 28px; }
body.immersive-workbench .feed-reader-footer { --control-h: 32px; }
body.immersive-workbench .tree-pane .feed-list-copy { grid-template-rows: 18px 14px; }
body.immersive-workbench .feed-source-tabs:not(:has(button:not([hidden]) ~ button:not([hidden]))) { display: none; }
body.immersive-workbench .feed-source-tabs button { transition: color var(--dur-hover) var(--ease-quint), border-color var(--dur-move) var(--ease-quint); }
body.immersive-workbench .feed-source-tabs button:hover:not([aria-current]) { color: var(--ink-soft); border-bottom-color: var(--line-strong); }
.feed-task-dialog-shell { display: flex; flex-direction: column; max-height: calc(100dvh - 50px); }
.feed-task-dialog-shell > header { display: flex; align-items: start; justify-content: space-between; gap: 16px; padding: 24px 24px 16px; border-bottom: 1px solid var(--line); }
.feed-task-dialog-shell h2 { margin: 0; font-size: 20px; letter-spacing: -.02em; }
.feed-task-dialog-shell header p { margin: 8px 0 0; color: var(--muted); font-size: 13px; line-height: 1.6; }
.feed-task-dialog-body { overflow-y: auto; min-height: 0; padding: 16px 24px 24px; }
.feed-task-dialog-shell > footer { display: flex; gap: 8px; justify-content: end; border-top: 1px solid var(--line); padding: 12px 24px; }
[data-feed-source-choices] { display: flex; flex-direction: column; gap: 1px; margin: 0; padding: 0; border: 0; }
.feed-source-choice__mark { display: grid; place-items: center; width: 16px; height: 16px; color: var(--muted); }
.feed-source-choice__mark svg { width: 14px; height: 14px; }
.feed-source-choice strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: var(--weight-control, 500); }
.feed-source-choice small { color: var(--faint); font-size: 12px; line-height: 1; white-space: nowrap; }
.feed-task-extra { border-top: 1px solid var(--line); margin-top: 24px; padding-top: 16px; }
.feed-task-extra summary { cursor: pointer; color: var(--ink-soft); font-size: 13px; font-weight: 400; padding: 8px 0; transition: color var(--dur-hover) var(--ease-quint); }
.feed-task-extra summary:hover { color: var(--ink); }
.feed-task-extra summary small { margin-left: 8px; color: var(--muted); font-weight: 400; }
.feed-task-health { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; color: var(--muted); }
.feed-task-health strong { color: var(--ink); font-weight: var(--weight-control, 500); }
.feed-task-controls { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
.feed-task-config-trigger { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; background: transparent; color: var(--muted); border-radius: 5px; cursor: pointer; }
.feed-task-config-trigger:hover { color: var(--ink); background: var(--nav-hover); }
.feed-task-config-trigger svg { width: 16px; height: 16px; }
.feed-plan-actions { display: flex; flex-direction: row; align-items: center; justify-content: flex-end; gap: 8px; }
.feed-reader-footer { --control-h: 36px; }
@media (min-width: 761px) {
  .plugin-stage-shell[data-expanded="true"] .feed-stage-search,
  .plugin-stage-shell[data-expanded="true"] .feed-stage-count { display: none; }
}
@media (max-width: 760px) {
  .plugin-stage-shell .feed-stage-search,
  .plugin-stage-shell .feed-stage-count { display: none; }
  .feed-plan-actions > button { min-height: 44px; }
  .feed-reader-footer { --control-h: 44px; }
  body[data-desktop-shell="true"] .feed-directory-search,
  body[data-desktop-shell="true"] .feed-filter-trigger { height: 44px; min-height: 44px; border-radius: 10px; }
  body[data-desktop-shell="true"] .feed-directory-search { padding-inline: 12px; }
  body[data-desktop-shell="true"] .feed-directory-search input { font-size: 13px; }
  body[data-desktop-shell="true"] .feed-filter-control { position: static; }
  body[data-desktop-shell="true"] .feed-filter-trigger {
    width: 44px; padding: 0; border: 0; color: var(--muted); background: color-mix(in srgb, var(--paper) 64%, transparent);
    display: grid; place-items: center; position: relative; cursor: pointer;
  }
  body[data-desktop-shell="true"] .feed-filter-trigger:hover,
  body[data-desktop-shell="true"] .feed-filter-trigger.is-active { color: var(--ink); background: color-mix(in srgb, var(--ink) 7%, transparent); }
  body[data-desktop-shell="true"] .feed-filter-trigger:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); box-shadow: none; }
  body[data-desktop-shell="true"] .feed-filter-trigger > svg { width: 16px; height: 16px; }
  body[data-desktop-shell="true"] .feed-filter-trigger > span {
    min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; color: var(--action-ink); background: var(--action);
    display: grid; place-items: center; position: absolute; top: -4px; right: -4px; font-size: 11px; font-weight: 400;
    font-variant-numeric: tabular-nums; line-height: 1; box-shadow: var(--lift-1);
  }
  body[data-desktop-shell="true"] .feed-filter-trigger > span[hidden] { display: none; }
  body[data-desktop-shell="true"] .feed-filter-panel {
    width: auto; max-height: calc(100dvh - 126px); padding: 12px; border: 0; border-radius: 12px; color: var(--ink);
    background: var(--paper); box-shadow: var(--lift-3); position: absolute; z-index: 18; top: calc(100% + 7px);
    left: 0; right: 0; overflow: auto; overscroll-behavior: contain;
  }
  body[data-desktop-shell="true"] .feed-filter-panel[hidden] { display: none; }
  body[data-desktop-shell="true"] .feed-filter-panel > header { min-height: 44px; display: flex; align-items: center; gap: 8px; }
  body[data-desktop-shell="true"] .feed-filter-panel > header strong { font-size: 13px; font-weight: var(--weight-control, 500); }
  body[data-desktop-shell="true"] .feed-filter-panel > header .mw-btn { margin-left: auto; }
  body[data-desktop-shell="true"] .feed-filter-section { padding-top: 8px; border-top: 1px solid var(--line); display: grid; gap: 4px; }
  body[data-desktop-shell="true"] .feed-filter-section + .feed-filter-section { margin-top: 8px; }
  body[data-desktop-shell="true"] .feed-filter-section > span { color: var(--faint); font-size: 11px; font-weight: 400; letter-spacing: .03em; }
  body[data-desktop-shell="true"] .feed-filter-options { min-width: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
  body[data-desktop-shell="true"] .feed-filter-option {
    min-width: 0; min-height: 44px; padding: 0 8px; border: 0; border-radius: 8px; color: var(--muted); background: transparent;
    display: grid; grid-template-columns: minmax(0, 1fr) 12px; align-items: center; gap: 4px; font: inherit; font-size: 12px; text-align: left; cursor: pointer;
  }
  body[data-desktop-shell="true"] .feed-filter-option:hover { color: var(--ink); background: var(--nav-hover); }
  body[data-desktop-shell="true"] .feed-filter-option[aria-checked="true"] { color: var(--blue-dark); background: color-mix(in srgb, var(--blue) 10%, transparent); font-weight: 400; }
  body[data-desktop-shell="true"] .feed-filter-option:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); box-shadow: none; }
  body[data-desktop-shell="true"] .feed-filter-option span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  body[data-desktop-shell="true"] .feed-filter-option svg { width: 12px; height: 12px; opacity: 0; }
  body[data-desktop-shell="true"] .feed-filter-option[aria-checked="true"] svg { opacity: 1; }
  body[data-desktop-shell="true"] .feed-filter-summary { margin: 8px 1px 0; padding-top: 8px; border-top: 1px solid var(--line); color: var(--faint); font-size: 11px; line-height: 1.45; }
}
@media (max-width: 680px) {
  body[data-desktop-shell="true"] .feed-source-row { grid-template-columns: 22px minmax(0, 1fr); }
  body[data-desktop-shell="true"] .feed-source-side { grid-column: 2; grid-template-columns: auto minmax(0, 1fr); align-items: center; justify-items: start; }
}
@media (max-width: 640px) {
  .feed-task-dialog-shell { max-height: calc(100dvh - 18px); }
  .feed-task-dialog-shell > header, .feed-task-dialog-body { padding: 16px; }
  .feed-task-health { flex-direction: column; gap: 4px; }
}
`;
