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
    font: 13px/1.35 -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  body.project-preferences-page { --control-h: 28px; }
  body.immersive-workbench .immersive-workspace {
    grid-template-rows: var(--desktop-titlebar-height) var(--workspace-chrome-height) minmax(0, 1fr);
  }
  body.immersive-workbench .workspace-chrome {
    height: var(--workspace-chrome-height); min-height: var(--workspace-chrome-height); padding: 0 4px 0 6px; gap: 2px;
  }
  body.immersive-workbench .workspace-chrome .navigator-project-primary {
    display: flex; flex: none; min-width: 0; align-items: center; gap: 2px;
    height: var(--workspace-chrome-height); min-height: var(--workspace-chrome-height); margin: 0; padding: 0;
  }
  body.immersive-workbench .immersive-workspace .navigator-project-selector {
    height: 28px; min-height: 28px; padding: 0 4px; gap: 6px;
  }
  body.immersive-workbench .navigator-project-selector > svg:first-child { height: 16px; width: 16px; padding: 2px; border-radius: 4px; }
  body.immersive-workbench .navigator-project-selector strong { font-size: 12px; font-weight: 550; }
  body.immersive-workbench .immersive-workspace .navigator-project-settings,
  body.immersive-workbench .immersive-workspace .navigator-project-search,
  body.immersive-workbench .titlebar-chrome .navigator-directory-toggle,
  body.immersive-workbench .titlebar-chrome .immersive-show-directory {
    width: 26px; height: 26px; min-height: 26px;
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
  body.immersive-workbench .tree-pane .project-record-row { height: var(--dir-row-h); min-height: var(--dir-row-h); }
  body.immersive-workbench .tree-pane .feed-list-item,
  body.immersive-workbench .tree-pane .source-list-item { height: var(--dir-row-2h); min-height: var(--dir-row-2h); padding: 2px 6px; }
  body.immersive-workbench .tree-pane .artifact-version-list a { min-height: var(--dir-row-2h); padding: 4px 6px; }
  body.immersive-workbench .tree-pane .feed-list-copy { grid-template-rows: 18px 14px; }
  body.immersive-workbench .feed-source-task { min-height: var(--dir-row-2h); padding: 4px 6px; }
  body.immersive-workbench .immersive-titlebar { height: var(--desktop-titlebar-height); min-height: var(--desktop-titlebar-height); padding: 0 8px 0 4px; }
  body.immersive-workbench[data-native-desktop="true"] .immersive-titlebar {
    padding-left: var(--desktop-window-safe-inline-start, 88px);
  }
  body.immersive-workbench .tab-strip { height: var(--tab-strip-h); min-height: var(--tab-strip-h); padding-block: 2px; }
  body.immersive-workbench .tab-group { height: 28px; }
  body.immersive-workbench .tab-item { height: 26px; border-radius: 6px; }
  body.immersive-workbench .tab-item[data-pinned] { width: 28px; min-width: 28px; max-width: 28px; }
  body.immersive-workbench :is(.tab-split-button, .tab-add-button) { width: 26px; height: 26px; }
  body.immersive-workbench .tab-pane-close { top: 4px; width: 22px; height: 26px; }
  body.immersive-workbench .tab-workspace[data-split] .tab-drop-edges [data-tab-edge="left"],
  body.immersive-workbench .tab-workspace[data-split] .tab-drop-edges [data-tab-edge="right"] { top: var(--tab-strip-h); }
  body.immersive-workbench .tab-workspace[data-split] .tab-drop-edges [data-tab-edge="top"] { top: var(--tab-strip-h); }
  body.immersive-workbench .tab-pane[data-drop-preview]::after { inset: 32px 4px 4px; }
  body.immersive-workbench .immersive-plugin-stage > .desktop-work-surface { padding: 16px clamp(14px, 3%, 28px); }
  body.immersive-workbench .tab-pane-body > .project-operation-surface { padding: 16px clamp(14px, 3%, 28px); }
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
  body.immersive-workbench .feed-stage-toolbar > h1 { font-size: 13px; font-weight: 550; letter-spacing: 0; margin: 0; }
  body.immersive-workbench .feed-stage-search { height: 26px; border-radius: 6px; }
  body.immersive-workbench .feed-stage-tree { padding: 4px 12px 16px; gap: 2px; }
  body.immersive-workbench .feed-stage-task-head,
  body.immersive-workbench .feed-stage-add-toggle { height: 32px; min-height: 32px; padding: 4px 8px; }
  body.immersive-workbench .feed-source-task { height: var(--dir-row-2h); min-height: var(--dir-row-2h); overflow: hidden; }
  body.immersive-workbench .feed-stage-item { min-height: 40px; }
  body.immersive-workbench .feed-stage-item:not(.is-open) { height: 40px; overflow: hidden; }
  body.immersive-workbench .feed-stage-item.is-open { margin-block: 0; height: auto; }
  body.immersive-workbench .feed-stage-entry {
    height: 40px; min-height: 40px; padding: 4px 8px; overflow: hidden;
    grid-template-columns: 16px minmax(0, 1fr) 14px; align-items: center; gap: 8px; border-radius: 6px;
  }
  body.immersive-workbench .feed-entry-provider { width: 16px; height: 16px; border: 0; border-radius: 0; background: transparent; }
  body.immersive-workbench .feed-entry-provider svg { width: 14px; height: 14px; }
  body.immersive-workbench .feed-stage-entry-copy { grid-template-rows: 14px 18px; gap: 0; overflow: hidden; }
  body.immersive-workbench .feed-entry-origin { line-height: 14px; gap: 6px; flex-wrap: nowrap; overflow: hidden; }
  body.immersive-workbench .feed-stage-entry-copy strong { font-size: 13px; font-weight: 450; line-height: 18px; white-space: nowrap; }
  body.immersive-workbench .feed-entry-summary { display: none; }
  body.immersive-workbench .feed-stage-item.is-open .feed-stage-entry { height: auto; min-height: 36px; overflow: visible; }
  body.immersive-workbench .feed-stage-item-detail { padding: 0 12px 12px 32px; }
  body.immersive-workbench .feed-stage-item-detail .feed-rich-content { font-size: 13px; line-height: 1.6; }
  body.immersive-workbench .feed-reader-footer .feed-detail-actions button { min-height: 28px; }
  body.immersive-workbench .frame-goal-summary { padding: 8px 12px 8px; }
  body.immersive-workbench .frame-goal-heading { gap: 8px; }
  body.immersive-workbench .frame-goal-heading h1 { font-size: 14px; line-height: 1.3; font-weight: 550; }
  body.immersive-workbench .frame-goal-summary > p { margin: 2px 0 6px; font-size: 12px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
  body.immersive-workbench .frame-goal-actions { gap: 6px; }
  body.immersive-workbench .frame-goal-actions button { min-height: 26px; padding: 0 8px; font-size: 12px; border-radius: 6px; }
  body.immersive-workbench .goal-node-toolbar { min-height: 32px; padding: 4px 10px; gap: 8px; }
  body.immersive-workbench .goal-node-heading h1 { font-size: 13px; line-height: 1.3; }
  body.immersive-workbench .goal-node-toolbar button:not([data-tui-empty-add]) { height: 26px; width: 26px; }
  body.immersive-workbench .goal-workspace-hero { padding: 8px 12px; }
  body.immersive-workbench .goal-info-popover > summary { min-height: 28px; padding: 4px 10px; }
  body.immersive-workbench .inbox-reference-detail h1,
  body.immersive-workbench .immersive-artifact-surface .artifact-detail h1 { font-size: 16px; line-height: 1.3; }
  body.immersive-workbench .inbox-reference-body { padding: 12px 16px; }
  body.immersive-workbench .inbox-reference-footer { padding: 8px 16px; }
  body.immersive-workbench .immersive-artifact-surface .artifact-detail > header { padding: 8px 16px; }
  body.immersive-workbench .project-session-document .goal-title-row h1 { font-size: 15px; }
  body.immersive-workbench .project-session-document .project-operation-hero { padding: 8px 16px; }
  body.immersive-workbench .session-context-disclosure > summary { min-height: 28px; padding: 4px 16px; }
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
  body.immersive-workbench dialog:is([data-create-dialog], [data-feed-sources-dialog], [data-session-add-dialog], [data-session-relations-dialog], [data-frame-picker]) {
    inset: var(--tab-strip-h) 0 0 auto; height: calc(100dvh - var(--tab-strip-h)); max-height: calc(100dvh - var(--tab-strip-h));
  }
  body.immersive-workbench dialog:is([data-create-dialog], [data-feed-sources-dialog], [data-session-add-dialog], [data-session-relations-dialog], [data-frame-picker]) :is(h2, .feed-task-dialog-shell h2) { font-size: 15px; }
  body.immersive-workbench dialog:is([data-create-dialog], [data-feed-sources-dialog], [data-session-add-dialog], [data-session-relations-dialog], [data-frame-picker]) header button[data-dialog-close] { width: 28px; height: 28px; }
  body.immersive-workbench dialog:is([data-create-dialog], [data-feed-sources-dialog], [data-session-add-dialog], [data-session-relations-dialog], [data-frame-picker]) :is(.dialog-body, .feed-task-dialog-body) { padding: 12px 16px; }
  body.project-preferences-page { --control-h: 28px; }
  body.settings-page { --control-h: 28px; }
  body.project-preferences-page .project-preferences-chrome { height: 36px; padding: 0 12px 0 16px; }
  body.project-preferences-page .settings-navigation.settings-navigation--codex { padding: 10px 8px; }
  body.project-preferences-page .settings-project-identity { padding: 8px 8px 12px; }
  body.project-preferences-page .settings-content { padding: 16px clamp(16px, 2.5vw, 28px) 28px; }
  body.project-preferences-page :is(.settings-page-heading, .settings-heading, .guidance-page-header, .planning-page-header, .planning-detail-header) { margin: 0 0 12px; gap: 12px; }
  body.project-preferences-page :is(.settings-page-heading, .settings-heading, .guidance-page-header, .planning-page-header, .planning-detail-header) h1 { font-size: 16px; line-height: 1.3; }
  body.project-preferences-page :is(.settings-page-heading, .settings-heading, .guidance-page-header, .planning-page-header, .planning-detail-header) p { margin-top: 4px; line-height: 1.45; }
  body.project-preferences-page .settings-section + .settings-section { margin-top: 16px; }
  body.project-preferences-page .settings-setting-row { padding: 8px 0; gap: 16px; }
  body.project-preferences-page :is(.settings-data-disclosure, .settings-advanced) > summary { min-height: 36px; padding: 6px 0; }
  body.project-preferences-page :is(input:not([type=checkbox]):not([type=radio]), select) { min-height: 28px; padding: 4px 8px; }
  body.project-preferences-page .guidance-section { padding: 8px 0; }
  body.project-preferences-page .planning-adoption-card { padding: 8px 0; gap: 6px 16px; }
  body.settings-page .settings-navigation--codex .settings-nav-body > a { min-height: 28px; }
  body.settings-page .settings-navigation--codex .settings-nav-group-label { padding: 8px 8px 4px; }
  body.settings-page .settings-heading h1 { font-size: 16px; }
  body.settings-page .settings-document { padding: 20px clamp(16px, 4cqi, 28px) 0; }
  body.settings-page .preference-section { padding: 14px 0; gap: 16px; }
  @media (max-width: 1050px) {
    body.immersive-workbench { --immersive-sidebar-width: 220px; }
  }
  @media (max-width: 760px), (pointer: coarse) {
    body.immersive-workbench {
      --control-h: 44px; --tab-strip-h: 44px; --desktop-titlebar-height: 44px; --workspace-chrome-height: 44px;
      --desktop-project-header-height: 44px; --dir-row-h: 44px; --dir-row-2h: 44px;
    }
    body.project-preferences-page, body.settings-page { --control-h: 44px; }
    body.immersive-workbench .workspace-chrome,
    body.immersive-workbench .workspace-chrome .navigator-project-primary {
      height: 44px; min-height: 44px;
    }
    body.immersive-workbench .workspace-history-button,
    body.immersive-workbench .immersive-workspace .navigator-project-settings,
    body.immersive-workbench .immersive-workspace .navigator-project-search,
    body.immersive-workbench .navigator-directory-toggle,
    body.immersive-workbench .titlebar-chrome .immersive-show-directory { width: 44px; height: 44px; min-height: 44px; }
    body.immersive-workbench .tab-strip,
    body.immersive-workbench .tab-group,
    body.immersive-workbench .tab-item { height: 44px; min-height: 44px; }
    body.immersive-workbench .tab-item[data-pinned] { width: 44px; min-width: 44px; max-width: 44px; }
    body.immersive-workbench :is(.tab-item-close, .tab-split-button, .tab-add-button) { width: 44px; height: 44px; }
    body.immersive-workbench .plugin-rail .plugin-rail-item { min-height: 44px; height: 44px; width: 40px; }
    body.immersive-workbench .tree-pane .immersive-plugin-link { min-height: 44px; }
    body.immersive-workbench .tree-pane .tree-node,
    body.immersive-workbench .tree-pane .tree-toggle,
    body.immersive-workbench .tree-pane .project-record-row { height: 44px; min-height: 44px; }
    body.immersive-workbench .frame-goal-actions button { min-height: 44px; }
    body.immersive-workbench .goal-node-toolbar button { width: 44px; height: 44px; min-height: 44px; }
    body.immersive-workbench .feed-stage-entry { height: 44px; min-height: 44px; }
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
  }
`;
