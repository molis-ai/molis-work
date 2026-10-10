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
/* Controls take the copper stroke; fields keep the shared field focus (copper edge and halo), so nothing shows two rings. */
.feed-workbench :is(button:not(.mw-select), summary, select:not(.mw-select), input:not(.mw-input), textarea:not(.mw-textarea)):focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }

/* ─── The article column ─────────────────────────────────────────────── */
${F} > .feed-column { grid-column: 1; grid-row: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; border-right: 1px solid var(--line); background: var(--surface-soft); }
${F} .feed-column-head { flex: none; padding: 24px 16px 0; border: 0; }
${F} .feed-column-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 4px 16px; }
${F} .feed-column-title h1 { margin: 0; font-size: 24px; font-weight: var(--weight-title, 600); letter-spacing: -.02em; line-height: 1.2; }
${F} .feed-column-actions { display: flex; align-items: center; gap: 4px; }
${F} .feed-column-actions .mw-btn { width: 32px; height: 32px; min-height: 32px; color: var(--muted); }
${F} .feed-column-actions .mw-btn:hover { color: var(--ink); }
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
  animation: feed-menu-in var(--dur-move) var(--ease-quint) both;
}
@keyframes feed-menu-in { from { opacity: 0; transform: translateY(-4px); } }
${F} .feed-source-rail > header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 4px 8px 8px; }
${F} .feed-source-rail > header > span { font-size: 12px; color: var(--muted); }
${F} .feed-source-rail > header .mw-btn { min-height: 28px; font-size: 12px; }
${F} .feed-source-rail > nav { display: flex; flex-direction: column; gap: 4px; }
${F} .feed-rail-label { color: var(--muted); font-size: 12px; padding: 12px 8px 4px; }
${F} .feed-source-nav { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 8px; min-height: 48px; padding: 8px 8px; border: 0; border-radius: 8px; color: var(--ink-soft); background: transparent; text-align: left; cursor: pointer; width: 100%; font: inherit; }
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
${F} .feed-source-tabs button { border: 0; border-bottom: 2px solid transparent; background: none; padding: 8px 0 8px; margin-bottom: -1px; font: inherit; font-size: 12px; color: var(--muted); cursor: pointer; }
${F} .feed-source-tabs button[aria-current] { color: var(--ink); border-bottom-color: var(--ink); }

/* Search with its filter menu, then the three-way switch. */
${F} > .feed-column > .feed-stage-toolbar { position: relative; inset: auto; z-index: 5; display: grid; gap: 12px; width: auto; max-width: none; height: auto; min-height: 0; flex: none; margin: 0; padding: 16px 16px 12px; border: 0; background: transparent; box-shadow: none; }
${F} .feed-search-row { display: flex; align-items: center; gap: 4px; min-width: 0; height: 36px; padding: 0 4px 0 12px; border-radius: 8px; background: var(--paper); box-shadow: inset 0 0 0 1px var(--line); transition: box-shadow var(--dur-hover) var(--ease-quint); }
${F} .feed-search-row:focus-within { box-shadow: inset 0 0 0 1px var(--accent), 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent); }
${F} .feed-search-row .feed-stage-search { display: flex; order: 0; align-items: center; gap: 8px; flex: 1; min-width: 0; width: auto; height: 34px; max-width: none; padding: 0; border: 0; background: transparent; box-shadow: none; color: var(--muted); }
${F} .feed-search-row .feed-stage-search svg { flex: none; width: 16px; height: 16px; }
${F} .feed-search-row .feed-stage-search input { flex: 1; min-width: 0; height: 32px; padding: 0; border: 0; background: transparent; box-shadow: none; outline: 0; font: inherit; font-size: 13px; color: var(--ink); }
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
  background: transparent; box-shadow: none; color: var(--ink); text-align: left; cursor: pointer;
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
${F} .feed-stage-entry[data-feed-entry-read="unread"] .feed-entry-copy strong::before { content: ""; display: inline-block; width: 6px; height: 6px; margin: 0 8px 4px 0; border-radius: 50%; background: var(--accent); vertical-align: middle; }
${F} .feed-stage-entry[data-feed-entry-read="read"] .feed-entry-copy strong { color: var(--ink-soft); }
${F} .plugin-stage-list .feed-stage-entry .feed-entry-preview { display: block; margin-top: 4px; font-size: 12px; line-height: 1.6; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${F} .feed-entry-foot { display: flex; align-items: center; min-height: 0; margin-top: 8px; }
${F} .feed-entry-foot:not(:has(.feed-entry-status:not(:has([data-feed-read-state])))) { display: none; }
${F} .plugin-stage-list .feed-stage-entry .feed-entry-status { justify-self: start; font-size: 12px; }
${F} .plugin-stage-list .feed-stage-entry .feed-entry-status svg { width: 12px; height: 12px; }
${F} .plugin-stage-list .feed-stage-entry .feed-entry-status:has([data-feed-read-state]) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
${F} .plugin-stage-list .feed-stage-entry[data-feed-entry-status="saved"] .feed-entry-status { color: var(--tone-done, var(--green)); }
${F} .feed-list-empty.mw-empty { display: grid; justify-items: center; gap: 8px; margin: 32px auto 0; padding: 24px 16px; max-width: 30em; text-align: center; color: var(--muted); background: transparent; }
${F} .feed-list-empty.mw-empty > svg { width: 20px; height: 20px; color: var(--faint, var(--muted)); stroke-width: 1.6; }
${F} .feed-list-empty.mw-empty > strong { font-size: 15px; font-weight: var(--weight-control, 500); line-height: 1.5; letter-spacing: 0; color: var(--ink); }
${F} .feed-list-empty.mw-empty > .mw-btn { margin: 4px 0 0; }
${F} .feed-column-foot { flex: none; display: flex; align-items: center; gap: 8px; margin: 0 16px; padding: 12px 4px 16px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; }
${F} .feed-column-foot svg { width: 12px; height: 12px; }

/* ─── The reading side ───────────────────────────────────────────────── */
${F} > .feed-reader-idle { grid-column: 2; grid-row: 1; display: grid; place-content: center; justify-items: center; gap: 12px; padding: 32px; text-align: center; color: var(--muted); }
${F} > .feed-reader-idle h2 { margin: 8px 0 0; font-size: 15px; font-weight: var(--weight-control, 500); color: var(--ink); }
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
${F} .feed-stage-item-detail .feed-detail { width: 100%; max-width: 700px; margin: 0 auto; padding: 0; border-radius: 0; background: transparent; box-shadow: none; animation: feed-reading-in var(--dur-arrive) var(--ease-quint) both; }
@keyframes feed-reading-in { from { opacity: 0; transform: translateY(6px); } }

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
.feed-setup-hint { color:var(--muted); font-size:12px; line-height:1.6; }
.feed-setup-panel textarea { resize:vertical; line-height:1.65; }
.feed-setup-panel :is(label small,p) { color:var(--muted); line-height:1.65; font-size:12px; }
.feed-setup-panel .check-row { flex-direction:row; align-items:center; }
.feed-setup-panel .feed-task-health { display:flex; justify-content:space-between; gap:12px; font-size:12px; padding:12px 0; color:var(--muted); }
.feed-setup-panel .feed-task-health strong { color:var(--ink-soft); font-weight: var(--weight-control, 500); }
.feed-setup-panel .feed-task-extra { padding:16px 0; border-top:1px solid var(--line); margin:16px 0 0; }
.feed-setup-panel .feed-task-extra summary { cursor:pointer; font-size:13px; color:var(--ink); padding:4px 0; }
.feed-setup-panel :is(.feed-plan-actions,.feed-task-controls,.feed-config-actions,.feed-rule-actions) { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; }
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
/* A short Feed (a split pane, a low window) gives its height to the list: a tighter heading and cards, no count row. */
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
  ${F} .feed-column-foot { display: none; }
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
@media (max-width: 760px) {
  ${F} .feed-scope { min-height: 48px; }
  ${F} .feed-source-nav { min-height: 52px; }
  ${F} .feed-quick-filter .mw-toggle { min-height: 36px; }
  ${F} .feed-search-row { height: 44px; }
  ${F} .plugin-stage-list .feed-stage-entry .feed-entry-copy strong { font-size: 15px; }
  ${F} .feed-stage-item-detail .feed-detail-actions > .mw-btn { min-height: 44px; }
}
`;
