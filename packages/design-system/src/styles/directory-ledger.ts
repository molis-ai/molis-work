/** AP3 visual layer: directory-ledger. */
export const DIRECTORY_LEDGER_STYLES = `  /* Unified directory ledger: Goals establish the row grammar; Inbox, Feed,
     and Sources reuse the same interaction surface without sharing domain state. */
  body[data-desktop-shell="true"] .directory-list-row {
    min-width: 0;
    border: 0;
    border-radius: 8px;
    color: var(--ink-soft);
    background: transparent;
    transition: color .14s ease, background .14s ease, box-shadow .14s ease;
  }
  body[data-desktop-shell="true"] .directory-row-state {
    min-width: 0;
    min-height: 20px;
    padding: 1px 6px;
    border: 1px solid color-mix(in srgb, currentColor 24%, var(--line));
    border-radius: 5px;
    color: var(--muted);
    background: color-mix(in srgb, currentColor 5%, var(--paper));
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    font-size: 9px;
    font-style: normal;
    font-weight: 660;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-row {
    min-height: 0;
    align-items: flex-start;
    border-radius: 0;
    background: transparent;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-row:hover,
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-row:has(.tree-node.is-selected) {
    background: transparent;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-toggle,
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-guide {
    width: 16px;
    height: 40px;
    flex: 0 0 16px;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-entry {
    min-width: 0;
    flex: 1 1 auto;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto auto;
    align-items: center;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-entry:hover {
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 5%, transparent);
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-entry.is-selected {
    color: var(--ink);
    background: var(--paper);
    box-shadow: 0 1px 2px color-mix(in srgb, var(--shadow-color) 28%, transparent);
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-entry:has(.tree-relations[open]) {
    grid-template-rows: auto auto;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-node {
    width: auto;
    min-height: 22px;
    padding: 5px 0 0 7px;
    border-radius: 8px;
    color: inherit;
    background: transparent;
    box-shadow: none;
    display: block;
    grid-column: 1;
    grid-row: 1;
    align-items: center;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-node:hover,
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-node.is-selected {
    color: inherit;
    background: transparent;
    box-shadow: none;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-node:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--blue) 72%, transparent);
    outline-offset: -2px;
    box-shadow: none;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-copy {
    min-width: 0;
    display: block;
    overflow: hidden;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-title-line,
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-meta-line {
    min-width: 0;
    display: flex;
    align-items: center;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-title-line strong {
    min-width: 0;
    overflow: hidden;
    color: inherit;
    font-size: 12px;
    font-weight: 620;
    line-height: 1.35;
    letter-spacing: -.008em;
    overflow-wrap: anywhere;
    text-overflow: clip;
    white-space: normal;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-item:not(.is-collapsed):has(> .tree-children) > .tree-row > .tree-toggle {
    height: 30px;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-item:not(.is-collapsed):has(> .tree-children) > .tree-row > .tree-entry > .tree-node {
    min-height: 30px;
    padding-block: 5px;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-item:not(.is-collapsed):has(> .tree-children) > .tree-row > .tree-entry > .tree-node .tree-title-line strong {
    overflow-wrap: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-item:not(.is-collapsed):has(> .tree-children) > .tree-row > .tree-entry > .tree-meta-line > .tree-progress {
    display: none;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-item:not(.is-collapsed):has(> .tree-children) > .tree-row > .tree-entry:not(:has(> .tree-meta-line .tree-relations)) {
    grid-template-rows: auto;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-item:not(.is-collapsed):has(> .tree-children) > .tree-row > .tree-entry:not(:has(> .tree-meta-line .tree-relations)) > .tree-meta-line {
    display: none;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-item:not(.is-collapsed):has(> .tree-children) > .tree-row > .tree-entry:not(:has(> .tree-meta-line .tree-relations)) > .directory-row-state {
    grid-row: 1;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-entry.is-selected .tree-title-line strong {
    font-weight: 690;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-meta-line {
    min-width: 0;
    padding: 0 0 5px 7px;
    gap: 7px;
    color: var(--faint);
    grid-column: 1;
    grid-row: 2;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-meta-line:has(.tree-relations[open]) {
    padding-right: 7px;
    flex-wrap: wrap;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-meta-line > small {
    min-width: 0;
    max-width: 92px;
    flex: 1 1 42px;
    display: block;
    overflow: hidden;
    color: var(--faint);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 8.5px;
    line-height: 1.25;
    letter-spacing: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-progress {
    width: auto;
    margin: 0;
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 8.5px;
    font-variant-numeric: tabular-nums;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-progress > i {
    width: 26px;
    height: 2px;
    display: block;
    overflow: hidden;
    background: var(--line-strong);
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-progress > i > b { background: var(--blue); }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-progress.is-blocked,
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-progress.is-blocked > span { color: var(--red); }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-progress.is-blocked > i > b { background: var(--red); }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .directory-row-state {
    margin-right: 7px;
    grid-column: 2;
    grid-row: 1 / 3;
    justify-self: end;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .directory-row-state > .goal-status {
    width: auto;
    min-width: 0;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    font-size: 9px;
  }
  html[data-density="compact"] body[data-desktop-shell="true"][data-board-view]:not([data-board-view="decisions"]):where(:not(.immersive-workbench)) .desktop-goal-directory .directory-row-state > .goal-status {
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    font-size: 9px;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-relations {
    width: auto;
    min-width: 0;
    margin: 0;
    color: var(--muted);
    flex: 0 1 auto;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-relations > summary {
    max-width: 100%;
    min-height: 14px;
    padding: 0;
    border-radius: 4px;
    gap: 4px;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-relations > summary:hover {
    color: var(--ink-soft);
    background: transparent;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-relations > summary em {
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    font-size: 8.5px;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-relations > summary strong {
    font-size: 8.5px;
    font-weight: 620;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-relations > summary .tree-relations-mark {
    display: none;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-relations[open] {
    flex-basis: 100%;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) .desktop-goal-directory .tree-deps {
    width: min(206px, calc(100vw - 90px));
    margin: 3px 0 4px;
    padding: 3px 0 2px 7px;
  }

  body[data-desktop-shell="true"] .feed-item-scroll,
  body[data-desktop-shell="true"] .source-list {
    padding: 4px 7px 12px;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) :is(.feed-list-item, .source-list-item) {
    width: 100%;
    min-height: 32px;
    padding: 5px 7px;
    border: 0;
    border-radius: 8px;
    color: var(--ink-soft);
    background: transparent !important;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    text-align: left;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) :is(.feed-list-item, .source-list-item):hover {
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 5%, transparent) !important;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) :is(.feed-list-item, .source-list-item).is-selected {
    color: var(--ink);
    background: var(--paper) !important;
    box-shadow: 0 1px 2px color-mix(in srgb, var(--shadow-color) 28%, transparent);
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) :is(.feed-list-item, .source-list-item):focus-visible {
    outline: 2px solid color-mix(in srgb, var(--blue) 72%, transparent);
    outline-offset: -2px;
    box-shadow: none;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) :is(.feed-list-copy, .source-list-copy) {
    min-width: 0;
    display: block;
    overflow: hidden;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) :is(.feed-list-copy, .source-list-copy) strong {
    min-width: 0;
    display: block;
    overflow: hidden;
    color: inherit;
    font-size: 12px;
    font-weight: 620;
    line-height: 1.35;
    letter-spacing: -.008em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) :is(.feed-list-item, .source-list-item).is-selected :is(.feed-list-copy, .source-list-copy) strong {
    font-weight: 690;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) :is(.feed-list-item, .source-list-item) > .directory-row-state {
    margin-right: 0;
    justify-self: end;
  }
  body[data-desktop-shell="true"]:where(:not(.immersive-workbench)) :is(.feed-list-item, .source-list-item) > .directory-row-state > :is(.feed-list-state, .source-list-state) {
    min-width: 0;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    font-size: 9px;
    font-weight: 660;
    line-height: 1.2;
  }
  body[data-desktop-shell="true"] .feed-list-item[data-feed-entry-status="feed"] > .directory-row-state { display: none; }
  body[data-desktop-shell="true"] .feed-list-state[data-feed-disposition="inbox"] { color: var(--amber); }
  body[data-desktop-shell="true"] .feed-list-state[data-feed-disposition="feed"] { color: var(--faint); }
  body[data-desktop-shell="true"] .feed-list-state[data-feed-disposition="saved"] { color: var(--green); }
  body[data-desktop-shell="true"] .feed-list-state[data-feed-disposition="promoted"],
  body[data-desktop-shell="true"] .feed-list-state[data-feed-disposition="processing"] { color: var(--blue-dark); }
  body[data-desktop-shell="true"] .feed-list-state[data-feed-disposition="archived"] { color: var(--faint); }
  body[data-desktop-shell="true"] .source-list-state[data-source-status="active"] { color: var(--green); }
  body[data-desktop-shell="true"] .source-list-state[data-source-status="attention"] { color: var(--red); }
  body[data-desktop-shell="true"] .source-list-state[data-source-status="syncing"] { color: var(--blue-dark); }
  body[data-desktop-shell="true"] .source-list-state[data-source-status="paused"] { color: var(--faint); }

  body[data-desktop-shell="true"] .feed-directory-search { height: 32px; }
  body[data-desktop-shell="true"] .feed-directory-search input { font-size: 10.5px; }
  body[data-desktop-shell="true"] .feed-detail[data-feed-detail-read="unread"] [data-feed-read-state] {
    color: var(--blue-dark);
    font-weight: 720;
  }
  body[data-desktop-shell="true"] .feed-directory-footer span,
  body[data-desktop-shell="true"] .feed-directory-footer small { font-size: 8.5px; }

  body[data-desktop-shell="true"] .feed-source-list { gap: 4px; }
  body[data-desktop-shell="true"] .feed-source-row {
    min-width: 0;
    min-height: 66px;
    padding: 8px;
    border-radius: 8px;
    background: transparent;
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto;
    align-items: start;
    gap: 8px;
  }
  body[data-desktop-shell="true"] .feed-source-row:hover,
  body[data-desktop-shell="true"] .feed-source-row:focus-within {
    color: var(--ink);
    background: color-mix(in srgb, var(--ink) 4%, transparent);
  }
  body[data-desktop-shell="true"] .feed-source-mark {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    color: var(--muted);
    background: color-mix(in srgb, var(--ink) 5%, transparent);
  }
  body[data-desktop-shell="true"] .feed-source-copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  body[data-desktop-shell="true"] .feed-source-copy strong {
    overflow: hidden;
    color: var(--ink);
    font-size: 11.5px;
    font-weight: 630;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  body[data-desktop-shell="true"] .feed-source-copy p {
    margin: 0;
    overflow: hidden;
    color: var(--muted);
    font-size: 9px;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  body[data-desktop-shell="true"] .feed-source-copy small {
    overflow: hidden;
    color: var(--faint);
    font-size: 9px;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  body[data-desktop-shell="true"] .feed-source-side {
    min-width: 0;
    display: grid;
    justify-items: end;
    gap: 6px;
  }
  body[data-desktop-shell="true"] .feed-source-side > .directory-row-state[data-source-status="active"] { color: var(--green); }
  body[data-desktop-shell="true"] .feed-source-side > .directory-row-state[data-source-status="paused"],
  body[data-desktop-shell="true"] .feed-source-side > .directory-row-state[data-source-status="imported"] { color: var(--muted); }
  body[data-desktop-shell="true"] .feed-source-side > .directory-row-state[data-source-status="error"] { color: var(--red); }
  body[data-desktop-shell="true"] .feed-source-side > .directory-row-state[data-source-status="disconnected"] { color: var(--amber); }
  body[data-desktop-shell="true"] .feed-source-dialog-shell > header h2 { font-size: 21px; }

  body[data-desktop-shell="true"] .feed-detail-header h1 {
    max-width: 26ch;
    font-size: clamp(21px, 2.4vw, 28px);
    line-height: 1.16;
    letter-spacing: -.028em;
  }

`;

