/** Desktop default matches Linear tool density. Touch/narrow keep 44px. */
export const LINEAR_DENSITY_STYLES = `
  body.immersive-workbench {
    --desktop-titlebar-height: 32px;
    --desktop-titlebar-control-height: 26px;
    --workspace-chrome-height: 32px;
    --desktop-project-header-height: 36px;
    --immersive-sidebar-width: 240px;
    --plugin-rail-width: 48px;
    --dir-row-h: 28px;
    --dir-row-2h: 36px;
    --control-h: 28px;
    --tab-strip-h: 32px;
    font: 13px/1.5 var(--font);
  }
  body.immersive-workbench .immersive-workspace {
    grid-template-rows: var(--desktop-titlebar-height) minmax(0, 1fr);
  }
  body.immersive-workbench .workspace-chrome {
    height: auto; min-height: 0; padding: 8px; gap: 0;
  }
  body.immersive-workbench .workspace-chrome .navigator-project-primary {
    display: flex; flex: none; width: 100%; max-width: 100%; min-width: 0; align-items: center; gap: 2px;
    height: auto; min-height: 0; margin: 0; padding: 4px; flex-direction: column;
  }
  body.immersive-workbench .immersive-workspace .navigator-project-selector {
    height: 32px; min-height: 32px; padding: 0; gap: 0; position: relative; overflow: hidden;
  }
  body.immersive-workbench .navigator-project-selector > svg:first-child { height: 16px; width: 16px; padding: 2px; border-radius: 4px; }
  body.immersive-workbench .navigator-project-selector strong { font-size: 12px; font-weight: 400; }
  body.immersive-workbench .immersive-workspace .navigator-project-settings,
  body.immersive-workbench .immersive-workspace .navigator-project-search,
  body.immersive-workbench .titlebar-chrome .navigator-directory-toggle,
  body.immersive-workbench .titlebar-chrome .immersive-show-directory {
    width: 36px; height: 32px; min-height: 32px;
  }
  body.immersive-workbench .workspace-history-button {
    width: 26px; height: 26px; min-height: 26px;
  }
  body.immersive-workbench .plugin-section { position: relative; }
  body.immersive-workbench .plugin-section > .immersive-plugin-link { min-height: var(--dir-row-h); }
  body.immersive-workbench .plugin-section.is-expanded > .plugin-section-body > .desktop-directory-panel:not([hidden]) > [data-directory-list-actions] { min-height: var(--control-h); }
  body.immersive-workbench .tree-pane :is(.tree-filter, .project-record-filter-menu > div, .feed-filter-panel, .source-filter-menu > .source-filter-row) {
    top: calc(var(--dir-row-h) + var(--control-h) + 4px); left: 8px; right: 8px; width: auto; box-sizing: border-box;
  }
  body.immersive-workbench .immersive-plugin-link { min-height: var(--dir-row-h); gap: 8px; padding: 0 6px 0 8px; }
  body.immersive-workbench .immersive-workspace .personal-account { min-height: 32px; padding: 2px 4px; }
  body.immersive-workbench .desktop-module-item { min-height: var(--dir-row-h); padding: 4px 8px; }
  body.immersive-workbench .tree-pane .tree-row { min-height: var(--dir-row-h); }
  body.immersive-workbench .tree-pane .tree-entry {
    display: flex; align-items: center; height: var(--dir-row-h); min-height: var(--dir-row-h); overflow: hidden;
  }
  body.immersive-workbench .tree-pane .tree-node { height: var(--dir-row-h); min-height: var(--dir-row-h); padding: 0 4px; }
  body.immersive-workbench .tree-pane .tree-toggle,
  body.immersive-workbench .tree-pane .tree-guide { height: var(--dir-row-h); min-height: var(--dir-row-h); }
  body.immersive-workbench .tree-pane .tree-title-line strong { line-height: 18px; }
  body.immersive-workbench .tree-pane .mw-dir-row--compact { height: var(--dir-row-h); min-height: var(--dir-row-h); }
  body.immersive-workbench .tree-pane .settings-directory-nav { display: grid; gap: 2px; padding: 4px 8px 16px; }
  body.immersive-workbench .tree-pane .settings-directory-nav .mw-dir-row {
    display: flex; justify-content: flex-start; align-items: center;
    height: 36px; min-height: 36px; padding: 0 10px; border-radius: 8px; gap: 8px;
    grid-template-columns: none; text-align: left;
  }
  body.immersive-workbench .tree-pane .mw-dir-row.is-selected::before,
  body.immersive-workbench .tree-pane .mw-dir-row[aria-current="page"]::before,
  body.immersive-workbench .tree-pane .mw-dir-row-wrap:has(.is-selected)::before,
  body.immersive-workbench .tree-pane .mw-dir-row-wrap:has([aria-current="page"])::before { content: none; display: none; width: 0; }
  body.immersive-workbench .tree-pane .settings-directory-nav .mw-dir-row__copy { flex: none; min-width: 0; text-align: left; }
  body.immersive-workbench .tree-pane .settings-directory-nav .mw-dir-row__icon { width: 16px; height: 16px; flex: none; color: var(--plugin-tint, var(--muted)); }
  body.immersive-workbench .tree-pane .settings-directory-nav .mw-dir-row__icon svg { width: 16px; height: 16px; }
  body.immersive-workbench .tree-pane .source-list-item,
  body.immersive-workbench .tree-pane .mw-dir-row--meta { height: var(--dir-row-2h); min-height: var(--dir-row-2h); }
  body.immersive-workbench .tree-pane .feed-list-copy { grid-template-rows: 18px 14px; }
  body.immersive-workbench .immersive-titlebar { height: var(--desktop-titlebar-height); min-height: var(--desktop-titlebar-height); padding: 0 8px 0 0; }
  html[data-native-desktop="true"] body.immersive-workbench .immersive-titlebar,
  body.immersive-workbench[data-native-desktop="true"] .immersive-titlebar {
    margin-inline-start: var(--desktop-window-safe-inline-start, 88px);
    padding-left: 0;
  }
  body.immersive-workbench .tab-strip { height: var(--tab-strip-h); min-height: var(--tab-strip-h); padding-block: 2px; }
  body.immersive-workbench .tab-group { height: 28px; }
  body.immersive-workbench .tab-item,
  body.immersive-workbench [data-tab-reorder-slot] { height: 26px; border-radius: 6px; }
  body.immersive-workbench .tab-item[data-pinned] { width: 28px; min-width: 28px; max-width: 28px; }
  body.immersive-workbench :is(.tab-split-button, .tab-add-button) { width: 26px; height: 26px; }
  body.immersive-workbench .tab-pane-close { top: 4px; width: 22px; height: 26px; }
  body.immersive-workbench .immersive-plugin-stage > .desktop-work-surface:not(.session-stage-shell, .plugin-stage-shell) { padding: 16px clamp(14px, 3%, 28px); }
  body.immersive-workbench .immersive-plugin-stage > :is(.session-stage-shell, .plugin-stage-shell) { padding: 0; overflow: hidden; }
  body.immersive-workbench .tab-pane-body > .project-operation-surface { padding: 0; overflow: hidden; }
  body.immersive-workbench .session-stage-bar { min-height: 48px; padding: 8px 16px; }
  body.immersive-workbench .session-stage-bar h1 { font-size: 14px; }
  body.immersive-workbench .session-execution-toolbar { min-height: 32px; padding: 4px 16px; }
  body.immersive-workbench .plugin-market-body { padding: 16px clamp(16px, 3%, 28px) 28px; }
  body.immersive-workbench .plugin-market-heading h1 { font-size: 18px; }
  body.immersive-workbench .plugin-market-list article { min-height: 48px; padding: 6px; }
  body.immersive-workbench .feed-stage-toolbar { height: 32px; min-height: 32px; padding: 0 12px; gap: 8px; margin: 0; overflow: visible; }
  body.immersive-workbench .feed-stage-toolbar .feed-directory-tools,
  body.immersive-workbench .feed-stage-toolbar .feed-directory-toolbar,
  body.immersive-workbench .feed-stage-toolbar .feed-filter-control {
    padding: 0; margin: 0; min-height: 26px; height: 26px; display: flex; align-items: center; gap: 0;
  }
  body.immersive-workbench .feed-stage-heading h1,
  body.immersive-workbench .feed-stage-toolbar > h1 { font-size: 13px; font-weight: 400; letter-spacing: 0; margin: 0; }
  body.immersive-workbench .feed-stage-search { height: 26px; border-radius: 6px; }
  body.immersive-workbench .feed-stage-tree { padding: 4px 12px 16px; gap: 2px; }
  body.immersive-workbench .plugin-stage-shell > .plugin-stage-chrome.feed-stage-toolbar {
    position: absolute; top: 16px; left: 20px; z-index: 20;
    height: auto; min-height: 0; width: max-content; max-width: calc(100% - 40px);
    padding: 0; margin: 0; border: 0; background: transparent;
  }
  body.immersive-workbench .plugin-stage-shell > .plugin-stage-list.feed-stage-tree {
    padding: 52px 20px 28px;
  }
  @media (max-width: 760px) {
    body.immersive-workbench .plugin-stage-shell > .plugin-stage-list.feed-stage-tree,
    body.immersive-workbench .plugin-stage-shell[data-expanded="true"] > .plugin-stage-list.feed-stage-tree {
      padding-top: 72px;
    }
    body.immersive-workbench .plugin-stage-shell .feed-stage-search { display: none; }
  }
  body.immersive-workbench .plugin-stage-shell[data-expanded="true"] > .plugin-stage-list.feed-stage-tree {
    padding: 52px 8px 20px;
  }
  body.immersive-workbench .plugin-stage-workspace .feed-stage-item-detail {
    padding: 0 24px 24px;
  }
  body.immersive-workbench .tab-pane-body > .plugin-stage-shell,
  body.immersive-workbench .tab-pane-body > .immersive-artifact-surface.plugin-stage-shell {
    overflow: hidden;
    padding: 0;
  }
  body.immersive-workbench .plugin-stage-shell[data-expanded="true"] > .plugin-stage-workspace {
    overflow: hidden;
    height: 100%;
    min-height: 0;
  }
  body.immersive-workbench .plugin-stage-workspace > [data-artifact-detail],
  body.immersive-workbench .plugin-stage-workspace > [data-artifact-detail] .artifact-detail {
    flex: 1;
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }
  body.immersive-workbench .plugin-stage-workspace .feed-stage-item-detail .feed-detail-header :is(h1, .feed-detail-kicker, p, time) { display: revert; }
  body.immersive-workbench .plugin-stage-shell .feed-filter-panel {
    left: 0;
    right: auto;
    width: min(360px, calc(100vw - 96px));
    max-height: min(320px, calc(100dvh - 120px));
  }
  body.immersive-workbench .feed-stage-task-head,
  body.immersive-workbench .feed-stage-add-toggle { height: 32px; min-height: 32px; padding: 4px 8px; }
  body.immersive-workbench .tree-pane .mw-dir-row--meta { height: var(--dir-row-2h); min-height: var(--dir-row-2h); overflow: hidden; }
  body.immersive-workbench .feed-stage-item { min-height: 28px; }
  body.immersive-workbench .feed-stage-item:not(.is-open) { height: auto; overflow: visible; }
  body.immersive-workbench .feed-stage-item.is-open { margin-block: 0; height: auto; }
  body.immersive-workbench .feed-stage-entry {
    height: 28px; min-height: 28px; padding: 0 8px; overflow: visible;
    grid-template-columns: minmax(12rem, 1fr) minmax(7rem, 12rem) 6.25rem 5.5rem;
    grid-template-rows: 28px; column-gap: 12px; align-items: center; border-radius: 6px;
  }
  body.immersive-workbench .feed-entry-provider { width: 16px; height: 16px; border: 0; border-radius: 0; background: transparent; }
  body.immersive-workbench .feed-entry-provider svg { width: 14px; height: 14px; }
  body.immersive-workbench .feed-stage-leading { display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden; }
  body.immersive-workbench .feed-stage-leading strong { font-size: 13px; font-weight: 400; line-height: 18px; white-space: nowrap; }
  body.immersive-workbench .feed-stage-item.is-open .feed-stage-entry { height: 28px; min-height: 28px; overflow: visible; }
  body.immersive-workbench .feed-stage-item-detail { padding: 0 12px 12px 32px; }
  body.immersive-workbench .feed-stage-item-detail .feed-rich-content { font-size: 13px; line-height: 1.6; }
  body.immersive-workbench .feed-reader-footer .feed-detail-actions button { min-height: 28px; }
  body.immersive-workbench .frame-goal-summary { padding: 8px 12px 8px; }
  body.immersive-workbench .frame-goal-heading { gap: 8px; }
  body.immersive-workbench .frame-goal-heading h1 { font-size: 14px; line-height: 1.3; font-weight: 400; }
  body.immersive-workbench .frame-goal-summary > p { margin: 2px 0 6px; font-size: 12px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
  body.immersive-workbench .frame-goal-actions { gap: 6px; }
  body.immersive-workbench .goal-node-toolbar,
  body.immersive-workbench .plugin-stage-detail-bar,
  body.immersive-workbench .session-stage-bar { min-height: 32px; padding: 4px 10px; gap: 8px; }
  body.immersive-workbench .goal-node-heading h1 { font-size: 13px; line-height: 1.3; }
  body.immersive-workbench .goal-node-toolbar button:not([data-tui-empty-add]),
  body.immersive-workbench .goal-details-toggle,
  body.immersive-workbench .plugin-stage-back,
  body.immersive-workbench .session-stage-back { height: 26px; width: 26px; }
  body.immersive-workbench .goal-workspace-hero { padding: 8px 12px; }
  body.immersive-workbench .goal-info-popover > summary { min-height: 28px; padding: 4px 10px; }
  body.immersive-workbench .inbox-reference-detail h1,
  body.immersive-workbench .immersive-artifact-surface .artifact-detail h1 { font-size: 16px; line-height: 1.3; }
  body.immersive-workbench .inbox-reference-detail > .feed-detail-header { padding: 12px 16px 6px; }
  body.immersive-workbench .inbox-reference-body { padding: 12px 16px; }
  body.immersive-workbench .inbox-reference-footer { padding: 2px 16px 10px; }
  body.immersive-workbench .immersive-artifact-surface .artifact-detail > header:not(.plugin-stage-detail-bar) { padding: 8px 16px; }
  body.immersive-workbench .goal-event-document .goal-header { padding: 8px 14px 8px; }
  body.immersive-workbench .goal-event-document .goal-title-heading h1 { font-size: 16px; line-height: 1.3; }
  body.immersive-workbench .goal-event-document .goal-overview { padding: 8px 12px; margin: 0 14px 8px; }
  body.immersive-workbench .goal-event-document .goal-layout { margin: 0 14px 8px; }
  body.immersive-workbench .goal-event-document .stream-toolbar,
  body.immersive-workbench .goal-event-document .detail-toolbar { height: 32px; padding: 0 10px; }
  body.immersive-workbench .goal-event-document .timeline-entry { min-height: 36px; padding: 4px 6px; }
  body.immersive-workbench .goal-event-document .event h2 { font-size: 16px; margin: 0 0 6px; }
  body.immersive-workbench .goal-event-document .event-sheet,
  body.immersive-workbench .goal-event-document .reader-content,
  body.immersive-workbench .goal-event-document .event-form { padding: 12px 16px 20px; }
  body.immersive-workbench .goal-event-document .event p { line-height: 1.6; }
  body.immersive-workbench :is(.form-actions, .event-form-actions, .feed-reader-footer, .project-operation-dialog) { --control-h: 28px; }
  body.immersive-workbench .form-actions > button,
  body.immersive-workbench .goal-event-document .event-form button[type=submit] { min-height: 28px; }
  body.immersive-workbench dialog:is([data-session-relations-dialog], [data-session-handoff-dialog]) {
    inset: var(--tab-strip-h) 0 0 auto; height: calc(100dvh - var(--tab-strip-h)); max-height: calc(100dvh - var(--tab-strip-h));
  }
  body.immersive-workbench dialog:is([data-create-dialog], [data-feed-sources-dialog], [data-session-add-dialog], [data-session-relations-dialog], [data-frame-picker]) :is(h2, .feed-task-dialog-shell h2) { font-size: 15px; }
  body.immersive-workbench dialog:is([data-create-dialog], [data-feed-sources-dialog], [data-session-add-dialog], [data-session-relations-dialog], [data-frame-picker]) header button[data-dialog-close] { width: 28px; height: 28px; }
  body.immersive-workbench dialog:is([data-create-dialog], [data-feed-sources-dialog], [data-session-add-dialog], [data-session-relations-dialog], [data-frame-picker]) :is(.dialog-body, .feed-task-dialog-body) { padding: 12px 16px; }
  :is(body.project-preferences-page, .settings-stage), body.settings-page { --control-h: 32px; }
  @media (max-width: 1050px) {
    body.immersive-workbench { --immersive-sidebar-width: 220px; }
  }
  @media (max-width: 760px), (pointer: coarse) {
    body.immersive-workbench {
      --control-h: 44px; --tab-strip-h: 44px; --desktop-titlebar-height: 44px; --workspace-chrome-height: 44px;
      --desktop-project-header-height: 44px; --dir-row-h: 44px; --dir-row-2h: 44px;
    }
    :is(body.project-preferences-page, .settings-stage), body.settings-page { --control-h: 44px; }
    body.immersive-workbench .workspace-chrome .navigator-project-primary {
      height: auto; min-height: 0;
    }
    body.immersive-workbench .workspace-history-button,
    body.immersive-workbench .immersive-workspace .navigator-project-settings,
    body.immersive-workbench .immersive-workspace .navigator-project-search,
    body.immersive-workbench .navigator-directory-toggle,
    body.immersive-workbench .project-island .immersive-show-directory { width: 44px; height: 44px; min-height: 44px; }
    body.immersive-workbench .tab-strip,
    body.immersive-workbench .tab-group,
    body.immersive-workbench .tab-item,
    body.immersive-workbench [data-tab-reorder-slot] { height: 44px; min-height: 44px; }
    body.immersive-workbench .tab-item[data-pinned] { width: 44px; min-width: 44px; max-width: 44px; }
    body.immersive-workbench :is(.tab-item-close, .tab-split-button, .tab-add-button) { width: 44px; height: 44px; }
    body.immersive-workbench .plugin-rail .plugin-rail-item { min-height: 44px; height: 44px; width: 40px; }
    body.immersive-workbench .tree-pane .immersive-plugin-link { min-height: 44px; }
    body.immersive-workbench .tree-pane .tree-node,
    body.immersive-workbench .tree-pane .tree-toggle,
    body.immersive-workbench .tree-pane .mw-dir-row { height: 44px; min-height: 44px; }
    body.immersive-workbench .tree-pane .settings-directory-nav .mw-dir-row { height: 44px; min-height: 44px; }
    body.immersive-workbench .frame-goal-actions button { min-height: 44px; }
    body.immersive-workbench .goal-node-toolbar button,
    body.immersive-workbench .goal-details-toggle,
    body.immersive-workbench .plugin-stage-back,
    body.immersive-workbench .session-stage-back { width: 44px; height: 44px; min-height: 44px; }
    body.immersive-workbench .feed-stage-entry {
      height: auto; min-height: 44px;
      grid-template-columns: minmax(0, 1fr) 5.5rem;
      grid-template-rows: auto;
    }
    body.immersive-workbench .feed-entry-source,
    body.immersive-workbench .feed-stage-entry > time { display: none; }
    body.immersive-workbench .feed-stage-search { height: 44px; }
    body.immersive-workbench .feed-stage-search input { font-size: 16px; }
    body.immersive-workbench .feed-reader-footer .feed-detail-actions button { min-height: 44px; }
    body.immersive-workbench .form-actions > button,
    body.immersive-workbench .goal-event-document .event-form button[type=submit] { min-height: 44px; }
    body.immersive-workbench :is(.form-actions, .event-form-actions, .feed-reader-footer, .project-operation-dialog) { --control-h: 44px; }
    body.immersive-workbench dialog:is([data-create-dialog], [data-feed-sources-dialog], [data-session-add-dialog], [data-session-relations-dialog], [data-frame-picker]) header button[data-dialog-close] { width: 44px; height: 44px; }
  }
  @media (max-width: 600px) {
    body.immersive-workbench .plugin-rail .personal-account { min-height: 44px; height: 44px; }
    body.immersive-workbench .immersive-workspace,
    body.immersive-workbench .immersive-workspace.is-directory-collapsed,
    body.immersive-workbench .immersive-workspace.is-plugin-directory-empty {
      grid-template-rows: auto auto minmax(0, 1fr);
    }
    body.immersive-workbench .immersive-titlebar {
      height: auto; min-height: calc(var(--desktop-titlebar-height) + var(--tab-strip-h));
      flex-wrap: wrap; overflow: visible;
    }
    body.immersive-workbench .workspace-chrome.project-island {
      grid-column: 1 / -1; width: 100%; max-width: none; margin: 0; padding: 8px 12px;
    }
    body.immersive-workbench .workspace-chrome .navigator-project-primary {
      flex-direction: row; height: 36px; min-height: 36px; width: auto; flex: 1; max-width: none;
    }
    body.immersive-workbench .immersive-workspace .navigator-project-selector {
      flex: 1; width: auto; height: 28px; min-height: 28px; padding: 0 4px; gap: 6px; overflow: hidden;
    }
    body.immersive-workbench .workspace-chrome :is(.navigator-project-settings, .navigator-project-search),
    body.immersive-workbench .workspace-chrome.project-island :is(.navigator-directory-toggle, .immersive-show-directory) {
      width: 28px; height: 28px; min-height: 28px;
    }
    body.immersive-workbench .immersive-titlebar [data-titlebar-tabs] {
      flex: 1 1 100%; min-width: 0; width: auto; order: 2;
    }
  }
  body.immersive-workbench .tab-pane-body > .immersive-artifact-surface.plugin-stage-shell,
  body.immersive-workbench .tab-pane-body > .plugin-stage-shell {
    overflow: hidden !important;
    padding: 0 !important;
  }
  body.immersive-workbench .plugin-stage-shell[data-expanded="true"] > .plugin-stage-workspace,
  body.immersive-workbench .plugin-stage-shell[data-expanded="true"] > .plugin-stage-workspace > [data-artifact-detail],
  body.immersive-workbench .plugin-stage-shell[data-expanded="true"] > .plugin-stage-workspace .artifact-detail {
    overflow: hidden !important;
    min-height: 0 !important;
    height: 100% !important;
    max-height: 100%;
    display: flex;
    flex-direction: column;
  }
`;
