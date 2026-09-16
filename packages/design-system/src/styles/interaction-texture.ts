/** Linear × Coss interaction texture. Loaded after every page stylesheet so it owns the
 * final colour ramp, elevation, motion and icon calibration without moving any layout.
 * Structure, density and component ownership stay with the existing layers. */

/** Menus, popovers and compact dialogs that share one raised-surface recipe. */
const RAISED_SURFACE = ":is(.navigator-project-menu-popover, .tree-filter, .global-search-dialog, .home-shortcut-dialog, .runtime-plan-dialog, .goal-trash-dialog, .project-operation-confirm-dialog, .project-migration-dialog, .tui-menu, .source-filter-menu > .source-filter-row, .feed-filter-panel, .project-record-filter-menu > div)";

/** Modals that dim the app behind them. */
const SCRIMMED = ":is(.global-search-dialog, .home-shortcut-dialog, .runtime-plan-dialog, .goal-trash-dialog, .project-operation-confirm-dialog, .project-migration-dialog)";

/** Scroll regions that already show a scrollbar. `.document-pane` keeps its scrollbar-free rule. */
const SCROLL_REGION = "body :is(.settings-body, .project-settings-stage, .tab-pane-body, .feed-detail-scroll, .goal-info-body)";

export const INTERACTION_TEXTURE_STYLES = `
  :root,
  body.immersive-workbench,
  body.settings-page,
  body.project-index-page,
  body.project-preferences-page {
    /* Neutral ramp carries a faint indigo cast so greys belong to the accent family. */
    --page: #f6f7f9; --canvas: #f6f7f9; --rail: #f0f1f4;
    --paper: #ffffff; --panel: #ffffff; --nav-bg: #f8f8fa;
    --ink: #15161a; --text: #15161a; --ink-soft: #43464f;
    --muted: #5f636d; --faint: #6e727c;
    --line: #e6e7ec; --line-strong: #d5d7de;

    /* Interaction fills are ink at low alpha, so one recipe reads correctly on every surface. */
    --nav-hover: color-mix(in srgb, var(--ink) 5.5%, transparent);
    --nav-active: color-mix(in srgb, var(--ink) 9%, transparent);
    --nav-press: color-mix(in srgb, var(--ink) 13%, transparent);
    --nav-raised: #ffffff;
    --hairline: color-mix(in srgb, var(--ink) 9%, transparent);
    --edge-highlight: transparent;

    --blue: #5a63d6; --blue-dark: #474fbd; --blue-soft: #eeeffb; --focus: #5a63d6;
    --green: #2e7d5c; --green-soft: #e9f4ee;
    --amber: #8a6320; --amber-soft: #faf1e2;
    --red: #b0424a; --red-soft: #fbecec;
    --action: #1c1d21; --action-ink: #ffffff;

    --shadow-color: #131520;
    --surface-shadow: 0 1px 2px rgba(19, 21, 32, .05), 0 2px 5px rgba(19, 21, 32, .04);
    --shadow-soft: 0 1px 2px rgba(19, 21, 32, .05), 0 3px 8px rgba(19, 21, 32, .04);
    --shadow-raised: 0 1px 2px rgba(19, 21, 32, .05), 0 6px 16px rgba(19, 21, 32, .07);
    --shadow: 0 2px 4px rgba(19, 21, 32, .05), 0 12px 32px rgba(19, 21, 32, .10);
    --control-shadow: 0 1px 1px rgba(19, 21, 32, .04), 0 6px 14px rgba(19, 21, 32, .07), 0 18px 38px rgba(19, 21, 32, .09);
    --control-ring: color-mix(in srgb, var(--focus) 72%, transparent);

    --motion-instant: 90ms; --motion-fast: 130ms; --motion-normal: 190ms;
    --ease-out: cubic-bezier(.16, 1, .3, 1);
    --ease-standard: cubic-bezier(.32, .72, 0, 1);

    --icon-sm: 14px; --icon-md: 16px; --icon-lg: 18px;
    --scrim: rgba(19, 21, 32, .3);
  }

  html[data-resolved-theme="dark"],
  html[data-resolved-theme="dark"] :is(body.immersive-workbench, body.settings-page, body.project-index-page, body.project-preferences-page) {
    /* Deeper base with clearly separated layers: field → navigation → paper → raised. */
    --page: #0e0f12; --canvas: #0e0f12; --rail: #131417;
    --paper: #17181c; --panel: #17181c; --nav-bg: #121316;
    --ink: #f2f3f6; --text: #f2f3f6; --ink-soft: #c4c7d0;
    --muted: #9a9ea9; --faint: #82868f;
    --line: #26272d; --line-strong: #363840;

    --nav-hover: color-mix(in srgb, var(--ink) 6%, transparent);
    --nav-active: color-mix(in srgb, var(--ink) 10%, transparent);
    --nav-press: color-mix(in srgb, var(--ink) 14%, transparent);
    --nav-raised: #212328;
    --hairline: color-mix(in srgb, var(--ink) 10%, transparent);
    --edge-highlight: rgba(255, 255, 255, .055);

    --blue: #9aa2fb; --blue-dark: #b6bbfd; --blue-soft: #24263f; --focus: #8f97f8;
    --green: #62c08f; --green-soft: #172f23;
    --amber: #d8a45f; --amber-soft: #352b1c;
    --red: #ec8087; --red-soft: #381f23;
    --action: #edeef1; --action-ink: #17181c;

    --shadow-color: #000000;
    --surface-shadow: 0 1px 2px rgba(0, 0, 0, .45), 0 2px 6px rgba(0, 0, 0, .3);
    --shadow-soft: 0 1px 2px rgba(0, 0, 0, .45), 0 4px 10px rgba(0, 0, 0, .32);
    --shadow-raised: 0 2px 4px rgba(0, 0, 0, .48), 0 10px 24px rgba(0, 0, 0, .38);
    --shadow: 0 4px 10px rgba(0, 0, 0, .5), 0 20px 48px rgba(0, 0, 0, .46);
    --control-shadow: 0 1px 2px rgba(0, 0, 0, .5), 0 8px 20px rgba(0, 0, 0, .45), 0 24px 52px rgba(0, 0, 0, .4);
    --control-ring: color-mix(in srgb, var(--focus) 78%, transparent);
    --scrim: rgba(0, 0, 0, .55);
  }

  /* Text texture: macOS-grade smoothing and fixed-width digits wherever counts are scanned. */
  body {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  body :is(small, time, kbd, .goal-status, .tab-item, .immersive-plugin-link, .tree-entry, .directory-row-state) {
    font-variant-numeric: tabular-nums;
  }
  ::selection { background: color-mix(in srgb, var(--focus) 26%, transparent); color: var(--ink); }
  body :is(h1, h2, h3) { text-wrap: balance; }
  body :is(p, blockquote, li, figcaption) { text-wrap: pretty; }
  body a:not([class]) { text-underline-offset: 2.5px; text-decoration-thickness: from-font; }

  /* One shared interaction curve. Rest → hover → press is a tone step, never a lift. */
  :where(button, a, summary, [role="button"], .tree-entry, .tab-item, .desktop-module-item, .immersive-plugin-link) {
    transition:
      background-color var(--motion-instant) var(--ease-standard),
      color var(--motion-instant) var(--ease-standard),
      border-color var(--motion-instant) var(--ease-standard),
      box-shadow var(--motion-fast) var(--ease-standard),
      opacity var(--motion-fast) var(--ease-standard);
  }
  body :is(button, [role="button"], summary, a.top-action, a.tree-tool):active:not(:disabled, [aria-disabled="true"], [aria-expanded], [aria-haspopup]) {
    filter: brightness(.96);
  }
  html[data-resolved-theme="dark"] body :is(button, [role="button"], summary):active:not(:disabled, [aria-disabled="true"], [aria-expanded], [aria-haspopup]) {
    filter: brightness(1.06);
  }
  body.immersive-workbench :is(.tree-tool, .icon-button, .immersive-plugin-link, .tab-item-close, .workspace-history-button,
        .navigator-project-settings, .navigator-project-search, .tab-add-button, .tab-split-button):active:not(:disabled) {
    background: var(--nav-press);
  }

  /* Icons sit one step quieter than their label and resolve on interaction.
   * Lucide draws on a 24 grid, so 2 keeps a 16px glyph at a Linear-weight 1.33px stroke. */
  body:is(.immersive-workbench, .settings-page, .project-index-page, .project-preferences-page) svg { stroke-width: 2; }
  body.immersive-workbench :is(.tui-empty-mark, .goal-canvas-empty, .work-empty) svg { stroke-width: 1.6; }
  body.immersive-workbench :is(.immersive-plugin-link, .tree-tool, .icon-button, .tab-item-close, .workspace-history-button) svg {
    transition: color var(--motion-instant) var(--ease-standard), opacity var(--motion-instant) var(--ease-standard);
  }
  body.immersive-workbench :is(.navigator-project-settings, .navigator-project-search, .navigator-project-notifications, .workspace-history-button, .tab-add-button, .tab-split-button) svg {
    width: var(--icon-md); height: var(--icon-md);
  }
  body.immersive-workbench .plugin-rail .immersive-plugin-link svg { color: var(--faint); }
  body.immersive-workbench .plugin-rail .immersive-plugin-link:hover svg { color: var(--ink-soft); }

  /* The current plugin keeps its own identity colour instead of one anonymous grey box. */
  body.immersive-workbench .plugin-rail .immersive-plugin-link[aria-current] {
    background: color-mix(in srgb, var(--plugin-tint, var(--ink)) 12%, transparent);
  }
  body.immersive-workbench .plugin-rail .immersive-plugin-link[aria-current] svg { color: var(--plugin-tint, var(--ink)); }
  body.immersive-workbench .plugin-rail .immersive-plugin-link[aria-current]:hover {
    background: color-mix(in srgb, var(--plugin-tint, var(--ink)) 18%, transparent);
  }
  body.immersive-workbench .plugin-rail [data-plugin-id="goals"] { --plugin-tint: light-dark(#3c6fc6, #8fb2f5); }
  body.immersive-workbench .plugin-rail [data-plugin-id="feed"] { --plugin-tint: light-dark(#9c5f1a, #dcab6d); }
  body.immersive-workbench .plugin-rail [data-plugin-id="sessions"] { --plugin-tint: light-dark(#7f5eb0, #c0a0ea); }
  body.immersive-workbench .plugin-rail [data-plugin-id="inbox"] { --plugin-tint: light-dark(#26785f, #86c9b1); }
  body.immersive-workbench .plugin-rail [data-plugin-id="artifacts"] { --plugin-tint: light-dark(#a15571, #e39eb6); }

  /* Directory rows: press feedback, and a current row that reads as selected, not merely hovered. */
  body.immersive-workbench .tree-pane :is(.tree-entry, .desktop-module-item, .project-record-row, .feed-list-item, .source-list-item):active {
    background: var(--nav-press);
  }
  body.immersive-workbench .immersive-workspace .tree-pane .directory-list-row.is-selected {
    position: relative;
    background: var(--nav-active);
    color: var(--ink);
  }
  body.immersive-workbench .immersive-workspace .tree-pane .directory-list-row.is-selected::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    width: 2px;
    height: 15px;
    transform: translateY(-50%);
    border-radius: 0 2px 2px 0;
    background: color-mix(in srgb, var(--focus) 88%, transparent);
    pointer-events: none;
  }
  body.immersive-workbench .tree-pane .directory-list-row.is-selected :is(.tree-title-line strong, > strong) { color: var(--ink); font-weight: 550; }

  /* Raised surfaces get a hairline and, in Dark, a top edge highlight so they read as glass.
   * Repeated at workbench and Dark specificity because several surfaces pin their own shadow there. */
  body ${RAISED_SURFACE},
  body.immersive-workbench ${RAISED_SURFACE},
  html[data-resolved-theme="dark"] body.immersive-workbench ${RAISED_SURFACE} {
    border: 1px solid var(--hairline);
    box-shadow: var(--control-shadow), inset 0 1px 0 var(--edge-highlight);
  }
  /* One scrim for every transient surface, so Dark never washes the app with a light veil. */
  body ${SCRIMMED}::backdrop,
  body.immersive-workbench ${SCRIMMED}::backdrop,
  html[data-resolved-theme="dark"] body.immersive-workbench ${SCRIMMED}::backdrop,
  body.immersive-workbench dialog:is([data-create-dialog], [data-feed-sources-dialog], [data-session-add-dialog],
           [data-session-relations-dialog], [data-frame-picker])::backdrop {
    background: var(--scrim);
    backdrop-filter: none;
  }
  body.immersive-workbench .immersive-sidebar-scrim:not([hidden]) { background: var(--scrim); }
  body.immersive-workbench .tab-item.is-active {
    box-shadow: var(--surface-shadow), inset 0 0 0 1px var(--hairline), inset 0 1px 0 var(--edge-highlight);
  }
  body.immersive-workbench .tab-item:active:not(.is-active) { background: var(--nav-press); }

  /* Scrollbars stay out of the way until the region is used. */
  ${SCROLL_REGION} {
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
    transition: scrollbar-color var(--motion-normal) var(--ease-standard);
  }
  ${SCROLL_REGION}:hover {
    scrollbar-color: color-mix(in srgb, var(--ink) 22%, transparent) transparent;
  }
  ${SCROLL_REGION}::-webkit-scrollbar { width: 10px; height: 10px; }
  ${SCROLL_REGION}::-webkit-scrollbar-track { background: transparent; }
  ${SCROLL_REGION}::-webkit-scrollbar-thumb {
    border: 3px solid transparent;
    border-radius: 8px;
    background: color-mix(in srgb, var(--ink) 18%, transparent);
    background-clip: content-box;
  }
  ${SCROLL_REGION}::-webkit-scrollbar-thumb:hover {
    background: color-mix(in srgb, var(--ink) 32%, transparent);
    background-clip: content-box;
  }
  ${SCROLL_REGION}::-webkit-scrollbar-corner { background: transparent; }

  /* Fields answer focus with their own accent ring instead of a detached browser outline. */
  body :is(input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea):focus-visible {
    outline: none;
    border-color: color-mix(in srgb, var(--focus) 62%, transparent);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--focus) 72%, transparent),
      0 0 0 3.5px color-mix(in srgb, var(--focus) 15%, transparent);
  }
  body :is(input:not([type="checkbox"]):not([type="radio"]), select, textarea) {
    transition: border-color var(--motion-fast) var(--ease-standard), box-shadow var(--motion-fast) var(--ease-standard), background-color var(--motion-fast) var(--ease-standard);
  }
  body :is(input, textarea)::placeholder { color: var(--faint); }

  /* Status marks read as tone, not as a second bordered container. */
  .goal-status,
  body[data-desktop-shell="true"] .goal-status {
    border-color: transparent;
    border-radius: 5px;
    background: color-mix(in srgb, var(--goal-status-tone, var(--muted)) 11%, transparent);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0;
  }

  /* An empty board column says so at a readable weight instead of a near-invisible dash. */
  body.immersive-workbench .goal-kanban-empty {
    border: 1px dashed var(--line-strong);
    color: var(--faint);
    background: transparent;
  }

  /* Where status already reads as a dot plus a word, it keeps no second container. */
  body :is(.goal-canvas-node > .goal-status, .goal-kanban-card .goal-status) {
    background: transparent;
    border-color: transparent;
  }

  /* Goal canvas: a quiet field, hairline nodes, and an accent halo that marks the current node. */
  .goal-canvas-viewport, .goal-frame-canvas {
    background-image:
      radial-gradient(120% 90% at 50% -10%, color-mix(in srgb, var(--ink) 3.5%, transparent), transparent 62%),
      radial-gradient(circle, color-mix(in srgb, var(--ink) 13%, transparent) .9px, transparent 1px);
    background-size: 100% 100%, 22px 22px;
  }
  .goal-canvas-node {
    border-color: var(--line);
    box-shadow: inset 0 1px 0 var(--edge-highlight);
    transition: border-color var(--motion-fast) var(--ease-standard), background-color var(--motion-fast) var(--ease-standard), box-shadow var(--motion-fast) var(--ease-standard);
  }
  .goal-canvas-node:hover {
    border-color: var(--line-strong);
    background: color-mix(in srgb, var(--ink) 1.6%, var(--paper));
  }
  .goal-canvas-node.is-selected {
    border-color: color-mix(in srgb, var(--focus) 80%, transparent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus) 13%, transparent), inset 0 1px 0 var(--edge-highlight);
  }
  .goal-canvas-edges g path { stroke: color-mix(in srgb, var(--ink) 24%, transparent); stroke-width: 1.4; }
  .goal-canvas-edges marker path { fill: color-mix(in srgb, var(--ink) 32%, transparent); }
  .goal-canvas-edges .is-selected-path path { stroke: color-mix(in srgb, var(--focus) 85%, transparent); }

  /* One segmented control everywhere: a recessed track with a raised chip on the current choice.
   * The board switch used to invert that polarity against the settings and locale switches. */
  body :is(.goal-board-switch, .settings-segmented, .locale-switch) {
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    border: 1px solid var(--hairline);
    border-radius: 9px;
    background: var(--control-fill);
    box-shadow: none;
  }
  body :is(.goal-board-switch, .settings-segmented, .locale-switch) > :is(button, a) {
    min-height: 26px;
    padding: 0 11px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    font-size: 12px;
    font-weight: 500;
    box-shadow: none;
  }
  body :is(.goal-board-switch, .settings-segmented, .locale-switch) > :is(button, a):hover { color: var(--ink); background: var(--nav-hover); }
  body :is(.goal-board-switch, .settings-segmented, .locale-switch) > :is([aria-current="true"], [aria-current="page"], [aria-pressed="true"], .is-current, .is-active) {
    color: var(--ink);
    font-weight: 550;
    background: var(--nav-raised);
    box-shadow: var(--surface-shadow), inset 0 0 0 1px var(--hairline), inset 0 1px 0 var(--edge-highlight);
  }
  /* The directory keeps its own compact metrics; only the track and chip tones are shared. */
  body.immersive-workbench .tree-pane .settings-segmented {
    border-color: var(--hairline);
    background: var(--control-fill);
  }
  body.immersive-workbench .tree-pane .settings-segmented > :is([aria-current="true"], [aria-current="page"], [aria-pressed="true"]) {
    border-color: transparent;
    color: var(--ink);
    background: var(--nav-raised);
    box-shadow: var(--surface-shadow), inset 0 0 0 1px var(--hairline), inset 0 1px 0 var(--edge-highlight);
  }

  /* Directory empty states share one calm block instead of six paddings and three alignments. */
  body.immersive-workbench .tree-pane :is(.feed-list-empty, .source-list-empty, .project-record-empty,
        .artifact-empty, .goal-collection-empty, .tree-filter-empty) {
    margin: 0;
    padding: 18px 10px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.6;
    text-align: left;
  }
  body.immersive-workbench .tree-pane :is(.feed-list-empty, .source-list-empty, .project-record-empty) strong {
    display: block;
    color: var(--ink-soft);
    font-size: 12px;
    font-weight: 550;
  }
  body.immersive-workbench .tree-pane :is(.feed-list-empty, .source-list-empty, .project-record-empty) > svg {
    display: block;
    width: var(--icon-md);
    height: var(--icon-md);
    margin-bottom: 7px;
    color: var(--faint);
  }
  body.immersive-workbench .tree-pane .tree-filter-empty p { margin: 0 0 8px; }

  /* Home: adding a shortcut is a slot, not the loudest thing on the page. */
  .immersive-home .home-shortcut-add .home-shortcut-icon {
    color: var(--muted);
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--line-strong);
  }
  .immersive-home .home-shortcut-add .home-shortcut-main:hover .home-shortcut-icon {
    color: var(--ink);
    background: var(--nav-hover);
    box-shadow: inset 0 0 0 1px var(--line-strong);
  }

  /* Transient surfaces arrive with opacity and a short rise, and leave without a jump. */
  :where(dialog[open]) { animation: surface-arrive var(--motion-normal) var(--ease-out); }
  @keyframes surface-arrive {
    from { opacity: 0; transform: translateY(6px) scale(.985); }
    to { opacity: 1; transform: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    :where(button, a, summary, [role="button"], .tree-entry, .tab-item, .desktop-module-item, .immersive-plugin-link) { transition: none; }
    body :is(button, [role="button"], summary):active:not(:disabled, [aria-disabled="true"], [aria-expanded], [aria-haspopup]) { filter: none; }
    body :is(input, select, textarea) { transition: none; }
    .goal-canvas-node { transition: none; }
    :where(dialog[open]) { animation: none; }
  }
`;
