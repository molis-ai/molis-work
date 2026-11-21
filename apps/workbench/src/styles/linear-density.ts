/** Desktop default matches Linear tool density. Touch/narrow keep 44px. */
export const LINEAR_DENSITY_STYLES = `
  body.immersive-workbench {
    --desktop-titlebar-height: 32px;
    --desktop-titlebar-control-height: 26px;
    --workspace-chrome-height: 32px;
    --desktop-project-header-height: 36px;
    --immersive-sidebar-width: 240px;
    --plugin-rail-width: 48px;
    --dir-row-h: 32px;
    --dir-row-2h: 40px;
    --control-h: 32px;
    --tab-strip-h: 32px;
    font: 13px/1.5 var(--font);
  }
  /* Compact keeps the Mira metrics: 28px controls and rows; phones and coarse pointers still get 44px below. */
  html[data-density="compact"] body.immersive-workbench { --dir-row-h: 28px; --dir-row-2h: 36px; --control-h: 28px; }
  body.immersive-workbench .immersive-workspace {
    grid-template-rows: var(--desktop-titlebar-height) minmax(0, 1fr);
  }
  body.immersive-workbench .workspace-chrome {
    height: auto; min-height: 0; padding: 8px; gap: 0;
  }
  body.immersive-workbench .workspace-chrome .navigator-project-primary {
    display: flex; flex: none; width: 100%; max-width: 100%; min-width: 0; align-items: center; gap: 4px;
    height: auto; min-height: 0; margin: 0; padding: 4px; flex-direction: column;
  }
  body.immersive-workbench .immersive-workspace .navigator-project-selector {
    height: 32px; min-height: 32px; padding: 0; gap: 0; position: relative; overflow: hidden;
  }
  body.immersive-workbench .navigator-project-selector > svg:first-child { height: 16px; width: 16px; padding: 4px; border-radius: 4px; }
  body.immersive-workbench .navigator-project-selector strong { font-size: 12px; font-weight: var(--weight-control, 500); }
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
  /* .tree-filter.tree-filter keeps the weight this rule had while it also named Feed's filter row (BL-b44-feed-home-dir-and-styles). */
  body.immersive-workbench .tree-pane .tree-filter.tree-filter {
    top: calc(var(--dir-row-h) + var(--control-h) + 4px); left: 8px; right: 8px; width: auto; box-sizing: border-box;
  }
  body.immersive-workbench .immersive-plugin-link { min-height: var(--dir-row-h); gap: 8px; padding: 0 8px 0 8px; }
  body.immersive-workbench .immersive-workspace .personal-account { min-height: 32px; padding: 4px 4px; }
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
  body.immersive-workbench .tree-pane .settings-directory-nav { display: grid; gap: 0; padding: 4px 8px 16px; }
  body.immersive-workbench .tree-pane .settings-directory-nav .settings-directory-group { margin: 0; padding: 16px 8px 4px; color: var(--muted); font-size: 11px; font-weight: var(--weight-control, 500); line-height: 1.5; }
  body.immersive-workbench .tree-pane .settings-directory-nav .settings-directory-group:first-child { padding-top: 4px; }
  body.immersive-workbench .tree-pane .settings-directory-nav .mw-dir-row {
    display: flex; justify-content: flex-start; align-items: center;
    height: 32px; min-height: 32px; padding: 0 8px; border-radius: 10px; gap: 8px;
    grid-template-columns: none; text-align: left;
  }
  body.immersive-workbench .tree-pane .mw-dir-row.is-selected::before,
  body.immersive-workbench .tree-pane .mw-dir-row[aria-current="page"]::before,
  body.immersive-workbench .tree-pane .mw-dir-row-wrap:has(.is-selected)::before,
  body.immersive-workbench .tree-pane .mw-dir-row-wrap:has([aria-current="page"])::before { content: none; display: none; width: 0; }
  body.immersive-workbench .tree-pane .settings-directory-nav .mw-dir-row__copy { flex: none; min-width: 0; text-align: left; }
  body.immersive-workbench .tree-pane .settings-directory-nav .mw-dir-row__icon { width: 16px; height: 16px; flex: none; color: var(--plugin-tint, var(--muted)); }
  body.immersive-workbench .tree-pane .settings-directory-nav .mw-dir-row__icon svg { width: 16px; height: 16px; }
  body.immersive-workbench .tree-pane .mw-dir-row--meta { height: var(--dir-row-2h); min-height: var(--dir-row-2h); }
  /* 4px here + the 8px gap before the drag strip + the tab strip's 4px keep the last titlebar control 16px from the edge. */
  body.immersive-workbench .immersive-titlebar { height: var(--desktop-titlebar-height); min-height: var(--desktop-titlebar-height); padding: 0 4px 0 0; }
  html[data-native-desktop="true"] body.immersive-workbench .immersive-titlebar,
  body.immersive-workbench[data-native-desktop="true"] .immersive-titlebar {
    margin-inline-start: var(--desktop-window-safe-inline-start, 88px);
    padding-left: 0;
  }
  body.immersive-workbench .tab-strip { height: var(--tab-strip-h); min-height: var(--tab-strip-h); padding-block: 4px; }
  body.immersive-workbench .tab-group { height: 28px; }
  body.immersive-workbench .tab-item,
  body.immersive-workbench [data-tab-reorder-slot] { height: 26px; border-radius: 6px; }
  body.immersive-workbench .tab-item[data-pinned] { width: 28px; min-width: 28px; max-width: 28px; }
  body.immersive-workbench .tab-add-button { width: 26px; height: 26px; }
  body.immersive-workbench .tab-pane-close { top: 4px; width: 22px; height: 26px; }
  body.immersive-workbench .immersive-plugin-stage > .desktop-work-surface:not(.plugin-stage-shell, .immersive-home) { padding: 16px clamp(14px, 3%, 28px); }
  body.immersive-workbench .immersive-plugin-stage > .plugin-stage-shell { padding: 0; overflow: hidden; }
  body.immersive-workbench .plugin-market-body { padding: 16px clamp(16px, 3%, 28px) 32px; }
  body.immersive-workbench .plugin-market-heading h1 { font-size: 24px; }
  body.immersive-workbench .plugin-market-list article { min-height: 48px; padding: 8px; }
  body.immersive-workbench .mw-stage-tree { padding: 4px 12px 16px; gap: 4px; }
  body.immersive-workbench .plugin-stage-shell > .plugin-stage-list.mw-stage-tree {
    padding: 52px 24px 32px;
  }
  @media (max-width: 760px) {
    body.immersive-workbench .plugin-stage-shell > .plugin-stage-list.mw-stage-tree,
    body.immersive-workbench .plugin-stage-shell[data-expanded="true"] > .plugin-stage-list.mw-stage-tree {
      padding-top: 72px;
    }
  }
  body.immersive-workbench .plugin-stage-shell[data-expanded="true"] > .plugin-stage-list.mw-stage-tree {
    padding: 52px 8px 24px;
  }
  body.immersive-workbench .tab-pane-body > .plugin-stage-shell,
  body.immersive-workbench .tab-pane-body > .immersive-artifact-surface.plugin-stage-shell {
    overflow: hidden;
    padding: 0;
  }
  body.immersive-workbench .immersive-artifact-surface[data-expanded="true"] > .plugin-stage-workspace {
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
  body.immersive-workbench .tree-pane .mw-dir-row--meta { height: var(--dir-row-2h); min-height: var(--dir-row-2h); overflow: hidden; }
  body.immersive-workbench .mw-stage-item { min-height: 28px; }
  body.immersive-workbench .mw-stage-item:not(.is-open) { height: auto; overflow: visible; }
  body.immersive-workbench .mw-stage-item.is-open { margin-block: 0; height: auto; }
  body.immersive-workbench .mw-stage-entry {
    height: 28px; min-height: 28px; padding: 0 8px; overflow: visible;
    grid-template-columns: minmax(0, 1fr) minmax(7rem, 12rem) max-content max-content;
    grid-template-rows: 28px; column-gap: 12px; align-items: center; border-radius: 6px;
  }
  body.immersive-workbench .mw-stage-leading { display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden; }
  body.immersive-workbench .mw-stage-leading strong { flex: 1; min-width: 0; font-size: 13px; font-weight: var(--weight-control, 500); line-height: 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.immersive-workbench .mw-stage-item.is-open .mw-stage-entry { height: 28px; min-height: 28px; overflow: visible; }
  body.immersive-workbench .plugin-stage-detail-bar { min-height: 32px; padding: 4px 12px; gap: 8px; }
  body.immersive-workbench .plugin-stage-back { height: 26px; width: 26px; }
  body.immersive-workbench .plugin-stage-detail-bar > h1 { font-size: 13px; line-height: 1.3; }
  body.immersive-workbench .inbox-reference-detail > .plugin-stage-detail-bar { min-height: 32px; }
  body.immersive-workbench .plugin-stage-detail-bar[data-stage-back-only] { min-height: 32px; height: 32px; padding: 4px 12px; }
  body.immersive-workbench .immersive-artifact-surface .artifact-detail > header:not(.plugin-stage-detail-bar) { padding: 8px 16px; }
  body.immersive-workbench :is(.form-actions, .event-form-actions) { --control-h: 32px; }
  body.immersive-workbench .form-actions > button { min-height: 32px; }
  body.immersive-workbench dialog:is([data-create-dialog], [data-frame-picker]) h2 { font-size: 15px; }
  body.immersive-workbench dialog:is([data-create-dialog], [data-frame-picker]) header button[data-dialog-close] { width: 28px; height: 28px; }
  body.immersive-workbench dialog:is([data-create-dialog], [data-frame-picker]) .dialog-body { padding: 12px 16px; }
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
    body.immersive-workbench :is(.tab-item-close, .tab-add-button) { width: 44px; height: 44px; }
    /* A pane's close is a touch target too, and its strip keeps the room for it. */
    body.immersive-workbench .tab-pane-close { top: 0; width: 44px; height: 44px; }
    body.immersive-workbench .tab-pane > .tab-strip { padding-right: 50px; }
    body.immersive-workbench .plugin-rail .plugin-rail-item { min-height: 44px; height: 44px; width: 40px; }
    body.immersive-workbench .tree-pane .immersive-plugin-link { min-height: 44px; }
    body.immersive-workbench .tree-pane .tree-node,
    body.immersive-workbench .tree-pane .tree-toggle,
    body.immersive-workbench .tree-pane .mw-dir-row { height: 44px; min-height: 44px; }
    body.immersive-workbench .tree-pane .settings-directory-nav .mw-dir-row { height: 44px; min-height: 44px; }
    body.immersive-workbench .frame-goal-actions button { min-height: 44px; }
    body.immersive-workbench .plugin-stage-back { width: 44px; height: 44px; min-height: 44px; }
    body.immersive-workbench .mw-stage-entry {
      height: auto; min-height: 44px;
      grid-template-columns: minmax(0, 1fr) max-content;
      grid-template-rows: auto;
    }
    body.immersive-workbench .mw-entry-source,
    body.immersive-workbench .mw-stage-entry > time { display: none; }
    body.immersive-workbench .form-actions > button { min-height: 44px; }
    body.immersive-workbench :is(.form-actions, .event-form-actions) { --control-h: 44px; }
    body.immersive-workbench dialog:is([data-create-dialog], [data-frame-picker]) header button[data-dialog-close] { width: 44px; height: 44px; }
  }
  @media (max-width: 600px) {
    body.immersive-workbench .plugin-rail .personal-account { min-height: 44px; height: 44px; }
    body.immersive-workbench .immersive-workspace,
    body.immersive-workbench .immersive-workspace.is-directory-collapsed,
    body.immersive-workbench .immersive-workspace.is-plugin-directory-empty {
      grid-template-rows: auto auto auto minmax(0, 1fr);
    }
    body.immersive-workbench .immersive-titlebar {
      height: auto; min-height: calc(var(--desktop-titlebar-height) + var(--tab-strip-h));
      flex-wrap: wrap; overflow: visible;
    }
    body.immersive-workbench .workspace-chrome.project-island {
      grid-column: 1 / -1; grid-row: 3; width: 100%; max-width: none; margin: 0; padding: 8px 12px;
    }
    body.immersive-workbench .workspace-chrome .navigator-project-primary {
      flex-direction: row; height: 36px; min-height: 36px; width: auto; flex: 1; max-width: none;
    }
    body.immersive-workbench .immersive-workspace .navigator-project-selector {
      flex: 1; width: auto; height: 28px; min-height: 28px; padding: 0 4px; gap: 8px; overflow: hidden;
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
  body.immersive-workbench .immersive-artifact-surface[data-expanded="true"] > .plugin-stage-workspace,
  body.immersive-workbench .immersive-artifact-surface[data-expanded="true"] > .plugin-stage-workspace > [data-artifact-detail],
  body.immersive-workbench .immersive-artifact-surface[data-expanded="true"] > .plugin-stage-workspace .artifact-detail {
    overflow: hidden !important;
    min-height: 0 !important;
    height: 100% !important;
    max-height: 100%;
    display: flex;
    flex-direction: column;
  }
  /* Low-height desktop density (pointer: fine, 601..∞ width, ≤600 height). Keep the 48px rail,
     every entry visible and stacked vertically; only shrink vertical padding/gaps so the middle
     .plugin-rail-items gains at least one full 32px button. <=600px drawer and (pointer: coarse)
     keep their 44px rules above. */
  @media (min-width: 601px) and (max-height: 600px) and (pointer: fine) {
    body.immersive-workbench .plugin-stack {
      --plugin-rail-gap: 4px;
      padding-bottom: 4px;
    }
    body.immersive-workbench .workspace-chrome.project-island { padding: 4px 0; gap: 4px; }
    body.immersive-workbench .workspace-chrome .navigator-project-primary { padding: 4px; gap: 4px; }
    body.immersive-workbench .plugin-rail-items { gap: 1px; padding: 4px; }
    body.immersive-workbench .plugin-rail .personal-sidebar-footer { gap: 1px; padding: 4px; }
    body.immersive-workbench .plugin-rail .plugin-rail-item {
      width: 36px; height: 32px; min-height: 32px;
    }
    body.immersive-workbench .plugin-rail .personal-account {
      width: 36px; height: 32px; min-height: 32px;
    }
    /* Project block buttons must stay 32×32 inside the 48px rail; the (max-width:760px), (pointer:coarse)
       block above expands them to 44px and would crowd the 48px column. */
    body.immersive-workbench .immersive-workspace .navigator-project-selector,
    body.immersive-workbench .workspace-chrome :is(.navigator-project-settings, .navigator-project-search) {
      width: 32px; height: 32px; min-height: 32px;
    }
  }
`;
