import { renderLinearShellTokens, renderPaletteTokens, renderPluginTintBindings } from "../palette.js";

/** Linear × Coss interaction texture. Loaded after every page stylesheet so it owns the
 * final colour ramp, elevation, motion and icon calibration without moving any layout.
 * Structure, density and component ownership stay with the existing layers. */

/** Menus, popovers and compact dialogs that share one raised-surface recipe. */
const RAISED_SURFACE = ":is(.navigator-project-menu-popover, .tree-filter, .global-search-dialog, .home-shortcut-dialog, .runtime-plan-dialog, .goal-trash-dialog, .project-operation-confirm-dialog, .tui-menu, .source-filter-menu > .source-filter-row, .feed-filter-panel, .project-record-filter-menu > div)";

/** Modals that dim the app behind them. */
const SCRIMMED = ":is(.global-search-dialog, .home-shortcut-dialog, .runtime-plan-dialog, .goal-trash-dialog, .project-operation-confirm-dialog)";

/** Scroll regions that already show a scrollbar. `.document-pane` keeps its scrollbar-free rule. */
const SCROLL_REGION = "body :is(.settings-body, .project-settings-stage, .tab-pane-body, .feed-detail-scroll, .goal-info-body)";

export const INTERACTION_TEXTURE_STYLES = `
  :root,
  body.immersive-workbench,
  body.settings-page,
  body.project-index-page,
  body.project-preferences-page {
    ${renderLinearShellTokens("light")}
    --nav-press: color-mix(in srgb, var(--ink) 14%, transparent);
    --hairline: color-mix(in srgb, var(--ink) 12%, transparent);
    --edge-highlight: transparent;
    ${renderPaletteTokens("light")}

    --shadow-color: #131520;
    --surface-shadow: 0 1px 2px rgba(19, 21, 32, .05), 0 2px 5px rgba(19, 21, 32, .04);
    --shadow-soft: 0 1px 2px rgba(19, 21, 32, .05), 0 3px 8px rgba(19, 21, 32, .04);
    --shadow-raised: 0 1px 2px rgba(19, 21, 32, .05), 0 6px 16px rgba(19, 21, 32, .07);
    --shadow: 0 2px 4px rgba(19, 21, 32, .05), 0 12px 32px rgba(19, 21, 32, .10);
    --control-shadow: 0 1px 1px rgba(19, 21, 32, .04), 0 6px 14px rgba(19, 21, 32, .07), 0 18px 38px rgba(19, 21, 32, .09);
    --control-ring: var(--ink);
    --focus-stroke: 1px solid var(--ink);
    --focus-stroke-inset: -1px;

    --motion-instant: 90ms; --motion-fast: 130ms; --motion-normal: 190ms;
    --ease-out: cubic-bezier(.16, 1, .3, 1);
    --ease-standard: cubic-bezier(.32, .72, 0, 1);

    --icon-sm: 14px; --icon-md: 16px; --icon-lg: 18px;
    --scrim: rgba(19, 21, 32, .3);
  }

  html[data-resolved-theme="dark"],
  html[data-resolved-theme="dark"] :is(body.immersive-workbench, body.settings-page, body.project-index-page, body.project-preferences-page) {
    ${renderLinearShellTokens("dark")}
    --nav-press: color-mix(in srgb, var(--ink) 16%, transparent);
    --hairline: color-mix(in srgb, var(--ink) 14%, transparent);
    --edge-highlight: rgba(255, 255, 255, .07);
    ${renderPaletteTokens("dark")}

    --shadow-color: #000000;
    --surface-shadow: 0 1px 2px rgba(0, 0, 0, .45), 0 2px 6px rgba(0, 0, 0, .3);
    --shadow-soft: 0 1px 2px rgba(0, 0, 0, .45), 0 4px 10px rgba(0, 0, 0, .32);
    --shadow-raised: 0 2px 4px rgba(0, 0, 0, .48), 0 10px 24px rgba(0, 0, 0, .38);
    --shadow: 0 4px 10px rgba(0, 0, 0, .5), 0 20px 48px rgba(0, 0, 0, .46);
    --control-shadow: 0 1px 2px rgba(0, 0, 0, .5), 0 8px 20px rgba(0, 0, 0, .45), 0 24px 52px rgba(0, 0, 0, .4);
    --control-ring: var(--ink);
    --focus-stroke: 1px solid var(--ink);
    --focus-stroke-inset: -1px;
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
  body.immersive-workbench :is(.tree-tool, .immersive-plugin-link, .tab-item-close, .workspace-history-button,
        .navigator-project-settings, .navigator-project-search, .tab-add-button, .tab-split-button):active:not(:disabled) {
    background: var(--nav-press);
  }

  /* Icons sit one step quieter than their label and resolve on interaction.
   * Lucide draws on a 24 grid, so 2 keeps a 16px glyph at a Linear-weight 1.33px stroke. */
  body:is(.immersive-workbench, .settings-page, .project-index-page, .project-preferences-page) svg { stroke-width: 2; }
  body.immersive-workbench :is(.tui-empty-mark, .goal-canvas-empty, .work-empty) svg { stroke-width: 1.6; }
  body.immersive-workbench :is(.immersive-plugin-link, .tree-tool, .tab-item-close, .workspace-history-button) svg {
    transition: color var(--motion-instant) var(--ease-standard), opacity var(--motion-instant) var(--ease-standard);
  }
  body.immersive-workbench :is(.navigator-project-settings, .navigator-project-search, .navigator-project-notifications, .workspace-history-button, .tab-add-button, .tab-split-button) svg {
    width: var(--icon-md); height: var(--icon-md);
  }
  body.immersive-workbench :is(.plugin-rail, .assistant-island) .immersive-plugin-link svg { color: var(--plugin-tint, var(--faint)); }
  body.immersive-workbench :is(.plugin-rail, .assistant-island) .immersive-plugin-link:hover {
    background: color-mix(in srgb, var(--plugin-tint, var(--ink)) 8%, transparent);
  }
  body.immersive-workbench :is(.plugin-rail, .assistant-island) .immersive-plugin-link:hover svg { color: var(--plugin-tint, var(--ink-soft)); }

  /* The current plugin keeps its own identity colour instead of one anonymous grey box. */
  body.immersive-workbench :is(.plugin-rail, .assistant-island) .immersive-plugin-link[aria-current] {
    background: color-mix(in srgb, var(--plugin-tint, var(--ink)) 12%, transparent);
  }
  body.immersive-workbench :is(.plugin-rail, .assistant-island) .immersive-plugin-link[aria-current] svg { color: var(--plugin-tint, var(--ink)); }
  body.immersive-workbench :is(.plugin-rail, .assistant-island) .immersive-plugin-link[aria-current]:hover {
    background: color-mix(in srgb, var(--plugin-tint, var(--ink)) 18%, transparent);
  }
  ${renderPluginTintBindings()}

  /* Ownership wash follows the current plugin onto its list and empty mark, not onto the paper. */
  body.immersive-workbench :is(.plugin-stage-list, .tree-pane) :is(.mw-dir-row.is-selected, .mw-dir-row[aria-current="page"], .directory-list-row.is-selected, .feed-stage-entry:is(.is-selected, .is-open, [aria-selected="true"])) {
    background: color-mix(in srgb, var(--plugin-tint, var(--ink)) 10%, transparent);
  }
  body.immersive-workbench .plugin-stage-list .mw-dir-row-wrap:has(.is-selected),
  body.immersive-workbench .plugin-stage-list .mw-dir-row-wrap:has([aria-current="page"]),
  body.immersive-workbench .tree-pane .mw-dir-row-wrap:has(.is-selected),
  body.immersive-workbench .tree-pane .mw-dir-row-wrap:has([aria-current="page"]) {
    background: color-mix(in srgb, var(--plugin-tint, var(--ink)) 10%, transparent);
  }
  body.immersive-workbench .mw-empty__mark,
  body.immersive-workbench .mw-empty > svg { color: var(--plugin-tint, var(--muted)); }
  body.immersive-workbench .plugin-stage-chrome .tree-create svg { color: var(--plugin-tint, var(--muted)); }

  /* Directory rows: press feedback, and a current row that reads as selected, not merely hovered. */
  body.immersive-workbench .tree-pane :is(.tree-entry, .desktop-module-item, .project-record-row, .feed-list-item, .source-list-item, .mw-dir-row):active {
    background: var(--nav-press);
  }
  body.immersive-workbench .immersive-workspace .tree-pane .directory-list-row.is-selected {
    position: relative;
    background: var(--nav-active);
    color: var(--ink);
  }
  body.immersive-workbench .immersive-workspace .tree-pane .mw-dir-row-wrap .directory-list-row.is-selected,
  body.immersive-workbench .immersive-workspace .tree-pane .mw-dir-row-wrap .directory-list-row[aria-current="page"] {
    background: transparent;
  }
  body.immersive-workbench .immersive-workspace .tree-pane .directory-list-row.is-selected:not(.mw-dir-row)::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    width: 2px;
    height: 15px;
    transform: translateY(-50%);
    border-radius: 0 2px 2px 0;
    background: var(--ink);
    pointer-events: none;
  }
  body.immersive-workbench .tree-pane .directory-list-row.is-selected :is(.tree-title-line strong, > strong) { color: var(--ink); font-weight: 400; }

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

  /* Fields answer focus with a 1px --ink stroke inside the control, never an outer halo. */
  body :is(input, select, textarea):not([type="checkbox"], [type="radio"], [type="range"], .mw-slider, .mw-input, .mw-textarea, .mw-select, .assistant-composer-input, [data-plain-field]):focus-visible {
    outline: var(--focus-stroke);
    outline-offset: var(--focus-stroke-inset);
    border-color: var(--ink);
    box-shadow: none;
  }
  body :is(input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not(.mw-slider):not(.mw-input), select:not(.mw-select), textarea:not(.mw-textarea)) {
    transition: border-color var(--motion-fast) var(--ease-standard), box-shadow var(--motion-fast) var(--ease-standard), background-color var(--motion-fast) var(--ease-standard);
  }
  body :is(input, textarea)::placeholder { color: var(--faint); }

  /* Status marks read as tone, not as a second bordered container.
   * Keep the default token on .goal-status only. Putting it on
   * body[data-desktop-shell=true] .goal-status would beat every
   * .goal-status--* family rule and collapse all statuses to idle. */
  .goal-status { --goal-status-tone: var(--tone-idle); }
  .goal-status,
  body[data-desktop-shell="true"] .goal-status {
    border-color: transparent;
    border-radius: 5px;
    background: color-mix(in srgb, var(--goal-status-tone, var(--muted)) 11%, transparent);
    color: var(--goal-status-tone);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0;
  }
  .goal-status svg { width: 12px; height: 12px; flex: none; }
  .goal-status--continue,
  .goal-status--execution_pending { --goal-status-tone: var(--tone-idle); }
  .goal-status--clarifying,
  .goal-status--executing,
  .goal-status--reviewing,
  .goal-status--revalidating,
  .goal-status--in_progress { --goal-status-tone: var(--tone-progress); }
  .goal-status--clarification_pending,
  .goal-status--clarification_decision_pending,
  .goal-status--compound_closure_pending,
  .goal-status--completion_pending,
  .goal-status--review_pending,
  .goal-status--waiting_for_human,
  .goal-status--revalidation_pending,
  .goal-status--waiting_user { --goal-status-tone: var(--tone-attention); }
  .goal-status--waiting_children,
  .goal-status--waiting { --goal-status-tone: var(--tone-hold); }
  .goal-status--clarification_blocked,
  .goal-status--execution_blocked,
  .goal-status--completion_blocked,
  .goal-status--review_blocked,
  .goal-status--revalidation_blocked,
  .goal-status--invalidated,
  .goal-status--blocked { --goal-status-tone: var(--tone-blocked); }
  .goal-status--satisfied,
  .goal-status--completed { --goal-status-tone: var(--tone-done); }
  .goal-status--trashed,
  .goal-status--archived,
  .goal-status--replaced { --goal-status-tone: var(--tone-quiet); }

  .mw-dir-row[data-settings-section="appearance"] { --plugin-tint: var(--tone-attention); }
  .mw-dir-row[data-settings-section="runtimes"] { --plugin-tint: var(--tone-progress); }
  .mw-dir-row[data-settings-section="planning"] { --plugin-tint: var(--tone-hold); }
  .mw-dir-row[data-settings-section="diagnostics"] { --plugin-tint: var(--tone-blocked); }
  .mw-dir-row[data-settings-section="shelf"] { --plugin-tint: var(--plugin-shelf); }
  .mw-dir-row[data-settings-section="functions"] { --plugin-tint: var(--plugin-functions); }
  .mw-dir-row[data-settings-section="pages"] { --plugin-tint: var(--plugin-pages); }
  .mw-dir-row[data-settings-section="form"] { --plugin-tint: var(--plugin-form); }
  .mw-dir-row[data-settings-section="dataset"] { --plugin-tint: var(--plugin-dataset); }
  .mw-dir-row[data-settings-section="ppt"] { --plugin-tint: var(--plugin-ppt); }
  .mw-dir-row[data-settings-section="general"] { --plugin-tint: var(--tone-idle); }
  .mw-dir-row[data-settings-section="guidance"] { --plugin-tint: var(--tone-progress); }
  .mw-dir-row[data-settings-section="rules"] { --plugin-tint: var(--tone-done); }

  /* Kickers are the same quiet tags, never stadium pills. */
  body[data-desktop-shell="true"] .feed-detail-kicker span,
  body[data-desktop-shell="true"] .feed-detail-kicker span:first-child,
  .feed-detail-kicker > :is(span, .mw-status) {
    padding: 2px 6px;
    border-radius: 5px;
    font-size: 11px;
    font-weight: 400;
    background: color-mix(in srgb, var(--status-tone, var(--ink)) 11%, transparent);
    color: var(--status-tone, var(--ink-soft));
  }

  /* An empty board column says so at a readable weight instead of a near-invisible dash. */
  body.immersive-workbench .goal-kanban-empty {
    border: 1px dashed var(--line-strong);
    color: var(--ink-soft);
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
    border-color: var(--ink);
    box-shadow: inset 0 1px 0 var(--edge-highlight);
  }
  .goal-canvas-edges g path { stroke: color-mix(in srgb, var(--ink) 24%, transparent); stroke-width: 1.4; }
  .goal-canvas-edges marker path { fill: color-mix(in srgb, var(--ink) 32%, transparent); }
  .goal-canvas-edges .is-selected-path path { stroke: color-mix(in srgb, var(--ink) 72%, transparent); }

  /* One segmented control everywhere: a recessed track with a raised chip on the current choice.
   * The board switch used to invert that polarity against the settings and locale switches. */
  body :is(.goal-board-switch, .settings-segmented, .locale-switch, .mw-toggle-group) {
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    border: 1px solid var(--hairline);
    border-radius: 9px;
    background: var(--control-fill);
    box-shadow: none;
  }
  body :is(.goal-board-switch, .settings-segmented, .locale-switch, .mw-toggle-group) > :is(button, a) {
    min-height: 26px;
    padding: 0 11px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    font-size: 12px;
    font-weight: 400;
    box-shadow: none;
  }
  body :is(.goal-board-switch, .settings-segmented, .locale-switch, .mw-toggle-group) > :is(button, a):hover { color: var(--ink); background: var(--nav-hover); }
  body :is(.goal-board-switch, .settings-segmented, .locale-switch, .mw-toggle-group) > :is([aria-current="true"], [aria-current="page"], [aria-pressed="true"], .is-current, .is-active) {
    color: var(--ink);
    font-weight: 400;
    background: var(--nav-raised);
    box-shadow: var(--surface-shadow), inset 0 0 0 1px var(--hairline), inset 0 1px 0 var(--edge-highlight);
  }
  body .goal-board-switch {
    height: var(--control-h, 28px);
    min-height: var(--control-h, 28px);
    padding: 2px;
    box-sizing: border-box;
  }
  body .goal-board-switch > :is(button, a) {
    width: calc(var(--control-h, 28px) - 6px);
    min-width: calc(var(--control-h, 28px) - 6px);
    height: calc(var(--control-h, 28px) - 6px);
    min-height: calc(var(--control-h, 28px) - 6px);
    padding: 0;
    display: inline-grid;
    place-items: center;
  }
  body .goal-board-switch svg { width: 14px; height: 14px; }
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
    font-weight: 400;
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
