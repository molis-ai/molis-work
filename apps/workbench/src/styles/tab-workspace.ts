import { TAB_SASH_GUTTER, TAB_SASH_HIT, TAB_SPLIT_EDGE_X_CSS, TAB_SPLIT_EDGE_Y_CSS } from "../tab-split-drop.js";
import { TAB_SHARE_MAX } from "../tab-strip-share.js";

export const TAB_WORKSPACE_STYLES = `
  body.immersive-workbench .tab-workspace { --tab-split-edge-x: ${TAB_SPLIT_EDGE_X_CSS}; --tab-split-edge-y: ${TAB_SPLIT_EDGE_Y_CSS}; --tab-sash-gutter: ${TAB_SASH_GUTTER}px; --tab-sash-hit: ${TAB_SASH_HIT}px; }
  body.immersive-workbench .immersive-plugin-stage > .tab-workspace { position: absolute; inset: 0; min-width: 0; min-height: 0; display: flex; overflow: hidden; background: var(--canvas); }
  body.immersive-workbench .tab-workspace-panes { flex: 1; min-width: 0; min-height: 0; display: grid; gap: 1px; background: var(--line); }
  body.immersive-workbench .tab-workspace-pool { display: none; }
  body.immersive-workbench .tab-workspace-exclusive { display: none; }
  body.immersive-workbench .tab-workspace[data-exclusive] .tab-workspace-panes { visibility: hidden; }
  body.immersive-workbench .tab-workspace[data-exclusive] .tab-workspace-exclusive { display: block; position: absolute; inset: 0; }
  body.immersive-workbench .tab-workspace-exclusive > * { position: absolute; inset: 0; min-width: 0; min-height: 0; overflow: auto; }
  body.immersive-workbench .tab-workspace-exclusive > .settings-stage { overflow: hidden; display: flex; flex-direction: column; background: var(--page); }
  body.immersive-workbench .settings-stage { min-width: 0; min-height: 0; background: var(--page); }
  body.immersive-workbench .settings-stage > .settings-content { flex: 1; min-height: 0; }
  body.immersive-workbench .settings-stage :is(.settings-document, .guidance-document, .work-planning, .planning-catalog, .planning-detail, .planning-edit, .project-settings-page) { width: 100%; max-width: 760px; margin-inline: auto; padding: 0; }
  body.immersive-workbench .tab-pane { min-width: 0; min-height: 0; display: flex; flex-direction: column; position: relative; background: var(--paper); }
  body.immersive-workbench .tab-strip { flex: 1; min-width: 0; display: flex; align-items: center; height: 32px; min-height: 32px; padding: 2px; gap: 8px; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; background: transparent; border: 0; scroll-padding-inline: 12px; }
  body.immersive-workbench .tab-strip::-webkit-scrollbar { display: none; }
  body.immersive-workbench .tab-pane > .tab-strip { flex: none; padding: 2px 36px 2px 8px; background: var(--nav-bg); border-bottom: 1px solid var(--line); }
  body.immersive-workbench .tab-group { flex: none; display: flex; align-items: center; gap: 4px; min-width: 0; }
  body.immersive-workbench .tab-group:not([data-tab-group="home"]) { padding-left: 8px; border-left: 1px solid var(--line); }
  body.immersive-workbench .tab-group-label { appearance: none; display: inline-flex; align-items: center; gap: 5px; height: 28px; margin: 0; padding: 0 6px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font: inherit; font-size: 11px; font-weight: 400; white-space: nowrap; cursor: pointer; }
  body.immersive-workbench .tab-group-label::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: currentColor; flex: none; }
  body.immersive-workbench .tab-group-label svg { width: 11px; height: 11px; transition: transform var(--motion-normal) var(--ease-out); }
  body.immersive-workbench .tab-group[data-collapsed="true"] .tab-group-label svg { transform: rotate(-90deg); }
  body.immersive-workbench .tab-group-label:hover { color: var(--ink); background: var(--nav-hover); }
  body.immersive-workbench .tab-group[data-active="true"] .tab-group-label { color: var(--ink); }
  body.immersive-workbench .tab-group[data-collapsed="true"] .tab-item { display: none; }
  body.immersive-workbench .tab-group[data-collapsed="true"][data-active="true"] .tab-group-label { background: var(--nav-active); }
  body.immersive-workbench .tab-group-pages { display: flex; align-items: center; gap: 3px; min-width: 0; }
  body.immersive-workbench .tab-item { appearance: none; position: relative; flex: none; max-width: 208px; min-width: 72px; height: 26px; margin: 0; display: inline-flex; align-items: center; gap: 8px; padding: 0 6px 0 10px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; font-weight: 400; cursor: pointer; user-select: none; transition: background-color var(--motion-fast), color var(--motion-fast), box-shadow var(--motion-fast); }
  body.immersive-workbench .tab-item:hover { color: var(--ink); background: var(--nav-hover); }
  body.immersive-workbench .tab-item.is-active { background: var(--nav-raised); color: var(--ink); font-weight: 400; border-color: var(--control-border); box-shadow: var(--surface-shadow); }
  body.immersive-workbench .tab-item:focus-visible, body.immersive-workbench .tab-group-label:focus-visible { outline-offset: -2px; }
  body.immersive-workbench .tab-item-trigger { flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; border-radius: 4px; color: inherit; background: transparent; font: inherit; cursor: pointer; text-align: left; }
  body.immersive-workbench .tab-item-trigger span { display: block; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  body.immersive-workbench .tab-item:has(.tab-item-trigger:focus-visible) { outline: 2px solid var(--control-ring); outline-offset: -2px; }
  body.immersive-workbench .tab-item-trigger:focus-visible { outline: none; }
  body.immersive-workbench .tab-item-close { width: 22px; height: 22px; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--muted); display: grid; place-items: center; flex: none; cursor: pointer; }
  body.immersive-workbench .tab-item-close:hover { background: var(--nav-active); color: var(--ink); }
  body.immersive-workbench .tab-item-close svg { width: 12px; height: 12px; }
  @media (hover: hover) and (pointer: fine) {
    body.immersive-workbench .tab-item:not(.is-active) .tab-item-close { opacity: 0; }
    body.immersive-workbench .tab-item:hover .tab-item-close, body.immersive-workbench .tab-item:focus-within .tab-item-close { opacity: 1; }
  }
  body.immersive-workbench .tab-pane-close { position: absolute; top: 8px; right: 6px; z-index: 3; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 6px; background: var(--nav-bg); color: var(--muted); display: grid; place-items: center; }
  body.immersive-workbench .tab-pane-close[hidden] { display: none; }
  body.immersive-workbench .tab-pane-close svg { width: 12px; height: 12px; }
  body.immersive-workbench .tab-pane-close:hover { background: var(--nav-active); color: var(--ink); }
  body.immersive-workbench .tab-pane-body { flex: 1; min-width: 0; min-height: 0; position: relative; overflow: hidden; background: var(--paper); }
  body.immersive-workbench .tab-pane-body > * { position: absolute; inset: 0; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; }
  body.immersive-workbench .tab-pane-body > .goal-canvas-shell { overflow: hidden; background: var(--canvas); }
  body.immersive-workbench .tab-pane-body > .goal-canvas-shell[data-board-view="list"] { background: var(--paper); }
  body.immersive-workbench .tab-pane-body > .desktop-work-surface { background: var(--paper); padding: 0; }
  body.immersive-workbench .tab-pane-body > .feed-workbench { background: var(--canvas); }
  body.immersive-workbench .tab-pane-body > .project-operation-surface { overflow: hidden; padding: 0; }
  body.immersive-workbench .tab-pane-body > .project-operation-surface .session-stage { height: 100%; max-width: none; margin: 0; }
  body.immersive-workbench .tab-pane-body > .project-operation-surface-empty,
  body.immersive-workbench .tab-pane-body > .project-operation-surface > .project-operation-surface-empty { height: 100%; display: grid; place-content: center; }
  body.immersive-workbench .tab-pane-body > .immersive-artifact-surface { padding: 8px 24px 36px; }
  body.immersive-workbench .tab-pane-body > .immersive-home { padding: 54px 40px 36px; }
  body.immersive-workbench .tab-pane-body [data-work-surface="inbox"] .feed-detail-empty { display: grid; place-items: center; align-content: center; width: 100%; min-height: 100%; margin: 0; padding: 48px 24px; border-radius: 0; background: transparent; box-shadow: none; color: var(--muted); text-align: center; }
  body.immersive-workbench .tab-pane-body [data-work-surface="inbox"] .feed-detail-empty svg { width: 22px; height: 22px; color: var(--faint); }
  body.immersive-workbench .tab-pane-body [data-work-surface="inbox"] .feed-detail-empty h1 { margin: 8px 0 0; color: var(--ink-soft); font-size: 14px; font-weight: 400; letter-spacing: 0; }
  body.immersive-workbench .tab-pane-empty-hint, body.immersive-workbench .tab-pane-mirror { margin: 0; padding: 10px 8px 12px; color: var(--muted); font-size: 12px; }
  body.immersive-workbench .tab-drop-edges { display: none; position: absolute; inset: 0; pointer-events: none; }
  body.immersive-workbench .tab-workspace.is-tab-dragging .tab-drop-edges { display: block; }
  body.immersive-workbench .tab-workspace[data-split] .tab-drop-edges { top: var(--tab-strip-h); }
  body.immersive-workbench .tab-drop-edges [data-tab-edge] { position: absolute; z-index: 4; border: 0; padding: 0; background: transparent; pointer-events: auto; }
  body.immersive-workbench .tab-drop-edges [data-tab-edge="left"], body.immersive-workbench .tab-drop-edges [data-tab-edge="right"] { top: 0; bottom: 0; width: var(--tab-split-edge-x); z-index: 5; }
  body.immersive-workbench .tab-drop-edges [data-tab-edge="left"] { left: 0; }
  body.immersive-workbench .tab-drop-edges [data-tab-edge="right"] { right: 0; }
  body.immersive-workbench .tab-drop-edges [data-tab-edge="top"], body.immersive-workbench .tab-drop-edges [data-tab-edge="bottom"] { left: 0; right: 0; height: var(--tab-split-edge-y); z-index: 4; }
  body.immersive-workbench .tab-drop-edges [data-tab-edge="top"] { top: 0; }
  body.immersive-workbench .tab-drop-edges [data-tab-edge="bottom"] { bottom: 0; }
  @media (max-width: 760px) {
    body.immersive-workbench .tab-drop-edges { display: none !important; }
    body.immersive-workbench .tab-item { min-width: 0; max-width: 156px; padding: 0 4px 0 8px; }
    body.immersive-workbench .tab-pane-body > .immersive-home { padding: 30px 20px 26px; }
  }

  body.immersive-workbench .tab-strip { align-items: center; gap: 8px; padding-block: 4px; overflow: hidden; }
  body.immersive-workbench .tab-scroll { display: flex; align-items: center; flex: 1 1 0%; min-width: 0; gap: 2px; overflow-x: auto; overflow-y: hidden; overflow-clip-margin: 0; scrollbar-width: none; scroll-padding-inline: 2px; position: relative; }
  body.immersive-workbench [data-tab-scroll-pad] { flex: none; width: 0; height: 1px; overflow: hidden; pointer-events: none; }
  body.immersive-workbench .tab-scroll::-webkit-scrollbar { display: none; }
  body.immersive-workbench .tab-group { --group-color: var(--muted); position: relative; gap: 2px; height: 36px; border: 0; }
  body.immersive-workbench .tab-group[data-tab-group]::after { content: ""; position: absolute; left: 4px; right: 4px; bottom: 1px; height: 2px; border-radius: 1px; background: var(--group-color); pointer-events: none; }
  body.immersive-workbench .tab-group[data-pinned-group]::after { display: none; }
  body.immersive-workbench .tab-group:not([data-tab-group="home"]) { border-left: 0; padding-left: 0; }
  body.immersive-workbench .tab-group-label, body.immersive-workbench .tab-group[data-active="true"] .tab-group-label { color: var(--group-color); background: transparent; width: auto; min-width: 18px; height: 32px; padding: 0 6px; justify-content: center; margin: 0; }
  body.immersive-workbench .tab-group-label::before { display: block; width: 8px; height: 8px; background: var(--group-color); }
  body.immersive-workbench .tab-group-name { display: inline; max-width: 72px; overflow: hidden; text-overflow: ellipsis; }
  body.immersive-workbench .tab-group-name:empty { display: none; }
  body.immersive-workbench .tab-group[data-collapsed="true"] .tab-group-label { width: auto; padding-inline: 8px; gap: 6px; background: var(--nav-hover); }
  body.immersive-workbench .tab-group[data-pinned-group] { gap: 0; }
  body.immersive-workbench .tab-group-label:hover { background: var(--nav-hover); }
  body.immersive-workbench .tab-group-pages { gap: 2px; }
  body.immersive-workbench .tab-item { box-sizing: border-box; flex: 0 0 auto; width: var(--tab-share-width, max-content); min-width: 0; max-width: ${TAB_SHARE_MAX}px; height: 34px; border-radius: 6px; border: 0; gap: 0; padding: 0 8px 0 10px; background: color-mix(in srgb, var(--nav-hover) 55%, var(--nav-bg)); color: var(--ink-soft); }
  body.immersive-workbench .tab-item-trigger { display: flex; align-items: center; gap: 6px; }
  body.immersive-workbench .tab-item-trigger .tab-item-icon { width: 14px; height: 14px; flex: none; color: var(--plugin-color, var(--muted)); }
  body.immersive-workbench .tab-item-trigger .tab-item-name { flex: 1; }
  body.immersive-workbench .tab-item[data-pinned] { width: 36px; min-width: 36px; max-width: 36px; padding: 0; }
  body.immersive-workbench .tab-item[data-pinned] .tab-item-trigger { justify-content: center; }
  body.immersive-workbench .tab-item[data-pinned] .tab-item-name { display: none; }
  body.immersive-workbench .tab-item:active { background: var(--nav-active); }
  body.immersive-workbench .tab-item:hover { background: var(--nav-hover); color: var(--ink); }
  body.immersive-workbench .tab-item.is-active { background: var(--nav-raised); color: var(--ink); box-shadow: inset 0 0 0 1px var(--control-border); }
  body.immersive-workbench.is-tab-dragging .tab-item.is-tab-drag-source {
    position: absolute; width: 0 !important; min-width: 0 !important; max-width: 0 !important; height: 0 !important;
    padding: 0 !important; margin: 0 !important; border: 0 !important; opacity: 0; overflow: hidden; pointer-events: none;
  }
  body.immersive-workbench [data-tab-reorder-slot] {
    flex: none; box-sizing: border-box; width: var(--tab-share-width, var(--tab-reorder-width, ${TAB_SHARE_MAX}px)); max-width: ${TAB_SHARE_MAX}px; height: 34px; border-radius: 6px; pointer-events: none;
    background: color-mix(in srgb, var(--plugin-color, var(--ink)) 10%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--plugin-color, var(--ink)) 22%, transparent);
  }
  body.immersive-workbench .tab-item-close { border-radius: 50%; }
  body.immersive-workbench :is(.tab-split-button, .tab-add-button) { flex: none; align-self: center; display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 6px; color: var(--muted); background: transparent; cursor: pointer; }
  body.immersive-workbench .tab-strip .tab-strip-spacer { flex: 0 1 0; min-width: 0; align-self: stretch; }
  body.immersive-workbench [data-titlebar-tabs] .tab-scroll { flex: 0 1 auto; width: max-content; min-width: 0; }
  body.immersive-workbench [data-titlebar-tabs] .tab-strip-spacer { flex: 1 1 48px; min-width: 0; }
  html[data-native-desktop="true"] body.immersive-workbench [data-titlebar-tabs] .tab-scroll,
  body.immersive-workbench[data-native-desktop="true"] [data-titlebar-tabs] .tab-scroll { flex: 0 1 auto; width: max-content; min-width: 0; }
  html[data-native-desktop="true"] body.immersive-workbench .tab-strip .tab-strip-spacer,
  body.immersive-workbench[data-native-desktop="true"] .tab-strip .tab-strip-spacer { flex: 1 1 48px; min-width: 48px; -webkit-app-region: drag; }
  body.immersive-workbench :is(.tab-split-button, .tab-add-button):hover { background: var(--nav-hover); color: var(--ink); }
  body.immersive-workbench :is(.tab-split-button, .tab-add-button) svg { width: 15px; height: 15px; }
  body.immersive-workbench .tab-workspace-panes { display: flex; gap: 0; background: var(--canvas); }
  body.immersive-workbench .tab-split { display: grid; min-width: 0; min-height: 0; }
  body.immersive-workbench .tab-sash { position: relative; background: transparent; cursor: col-resize; touch-action: none; z-index: 5; }
  body.immersive-workbench .tab-split[data-direction="column"] > .tab-sash { cursor: row-resize; }
  body.immersive-workbench .tab-sash:focus-visible { outline: none; }
  body.immersive-workbench .tab-content-frame { display: block; width: 100%; height: 100%; border: 0; }
  body.immersive-workbench .tab-workspace:is(.is-tab-dragging, .is-resizing) iframe { pointer-events: none; }
  body.immersive-workbench .tab-workspace-panes[data-split-drop-preview]::after { content: ""; position: fixed; left: var(--split-preview-left); top: var(--split-preview-top); width: var(--split-preview-width); height: var(--split-preview-height); box-sizing: border-box; pointer-events: none; z-index: 2147483646; border: 2px solid var(--blue); border-radius: 8px; background: color-mix(in srgb, var(--blue) 14%, transparent); animation: feedback-reveal 120ms ease-out; }
  body.immersive-workbench[data-pane-embedded] .immersive-workspace { grid-template-columns: minmax(0, 1fr) !important; grid-template-rows: minmax(0, 1fr) !important; height: 100%; }
  body.immersive-workbench[data-pane-embedded] .immersive-workspace > :is(.plugin-stack, .plugin-rail, .tree-pane, .tree-resizer, .immersive-titlebar, .workspace-chrome, .mobile-tabs, .immersive-sidebar-scrim),
  body.immersive-workbench[data-pane-embedded] .tab-pane > .tab-strip { display: none !important; }
  body.immersive-workbench[data-pane-embedded] .immersive-plugin-stage { grid-column: 1 !important; grid-row: 1 / -1 !important; position: relative; width: 100%; height: 100%; min-height: 0; overflow: hidden; display: block !important; }
  @media (max-width: 760px) {
    body.immersive-workbench .tab-split { display: contents; }
    body.immersive-workbench .tab-sash, body.immersive-workbench .tab-pane:not(.is-focused) { display: none; }
    body.immersive-workbench .tab-pane.is-focused { flex: 1; }
  }
  @media (prefers-reduced-motion: reduce) { body.immersive-workbench :is(.tab-item, .tab-sash, .tab-sash-handle, .tab-group-label svg) { transition: none; } body.immersive-workbench .tab-workspace-panes[data-split-drop-preview]::after { animation: none; } }
  @media (max-width: 760px), (pointer: coarse) {
    body.immersive-workbench .tab-strip { padding-block: 0; align-items: center; }
    body.immersive-workbench .tab-group, body.immersive-workbench .tab-item, body.immersive-workbench [data-tab-reorder-slot] { height: 44px; }
    body.immersive-workbench .tab-item { padding-right: 0; }
    body.immersive-workbench .tab-item-close, body.immersive-workbench .tab-split-button, body.immersive-workbench .tab-add-button { width: 44px; height: 44px; }
    body.immersive-workbench .tab-item[data-pinned] { width: 44px; min-width: 44px; max-width: 44px; }
    body.immersive-workbench .tab-group .tab-group-label { min-width: 44px; min-height: 44px; margin-block: 0; }
  }


  body.immersive-workbench .tab-workspace-panes { display: block; position: relative; background: var(--canvas); }
  body.immersive-workbench .tab-workspace-panes > .tab-pane { position: absolute; }
  body.immersive-workbench .tab-workspace-panes > .tab-split { display: block; position: absolute; pointer-events: none; }
  body.immersive-workbench .tab-sash { position: absolute; pointer-events: auto; background: transparent; }
  body.immersive-workbench .tab-split[data-direction="row"] > .tab-sash { width: var(--tab-sash-hit); height: 100%; cursor: col-resize; }
  body.immersive-workbench .tab-split[data-direction="column"] > .tab-sash { height: var(--tab-sash-hit); width: 100%; cursor: row-resize; }
  body.immersive-workbench .tab-sash::before {
    content: ""; position: absolute; background: var(--line); pointer-events: none;
  }
  body.immersive-workbench .tab-split[data-direction="row"] > .tab-sash::before {
    top: 0; bottom: 0; left: 50%; width: 1px; transform: translateX(-50%);
  }
  body.immersive-workbench .tab-split[data-direction="column"] > .tab-sash::before {
    left: 0; right: 0; top: 50%; height: 1px; transform: translateY(-50%);
  }
  body.immersive-workbench .tab-sash-handle {
    position: absolute; left: 50%; top: 50%; z-index: 1; transform: translate(-50%, -50%);
    display: grid; place-items: center; pointer-events: none;
    box-sizing: border-box; background: var(--paper); color: var(--ink-soft);
    box-shadow: var(--surface-shadow), inset 0 0 0 1px var(--control-border);
    opacity: 1; transition: opacity var(--motion-fast) var(--ease-standard);
  }
  body.immersive-workbench .tab-split[data-direction="row"] > .tab-sash > .tab-sash-handle {
    width: 22px; height: 40px; border-radius: 999px;
  }
  body.immersive-workbench .tab-split[data-direction="column"] > .tab-sash > .tab-sash-handle {
    width: 40px; height: 22px; border-radius: 999px;
  }
  body.immersive-workbench .tab-sash-handle svg { width: 14px; height: 14px; }
  body.immersive-workbench .tab-split[data-direction="column"] > .tab-sash > .tab-sash-handle svg { transform: rotate(90deg); }
  @media (hover: hover) and (pointer: fine) {
    body.immersive-workbench .tab-sash-handle { opacity: 0; }
    body.immersive-workbench .tab-sash:is(:hover, :focus-visible, .is-dragging) .tab-sash-handle { opacity: 1; }
  }
  body.immersive-workbench .tab-sash:is(:hover, :focus-visible, .is-dragging) { background: transparent; }
  body.immersive-workbench .tab-sash:focus-visible .tab-sash-handle { outline: 2px solid var(--blue); outline-offset: 2px; }
  body.immersive-workbench .tab-window-select { align-self: center; flex: none; max-width: 200px; min-height: 28px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 10px; color: var(--muted); border: 0; border-radius: 6px; background: transparent; font: inherit; font-size: 11px; }
  body.immersive-workbench .tab-window-select[aria-pressed="true"] { color: var(--ink); background: var(--nav-active); }
  @media (max-width: 760px) {
    body.immersive-workbench .tab-workspace-panes > .tab-pane.is-focused { left: 0 !important; top: 0 !important; width: 100% !important; height: 100% !important; }
    body.immersive-workbench .tab-workspace-panes > .tab-split { display: none; }
  }

  /* Content windows stay mounted when their tab changes groups. */
  body.immersive-workbench .tab-workspace-panes > .tab-content-frame { position: absolute; inset: auto; z-index: 1; }
  body.immersive-workbench .tab-pane > .tab-strip { position: relative; z-index: 2; }
  body.immersive-workbench .tab-workspace[data-exclusive] .tab-content-frame { visibility: hidden; }
  @media (max-width: 760px) {
    body.immersive-workbench .tab-workspace-panes > .tab-content-frame:not(.is-focused) { display: none; }
    body.immersive-workbench .tab-workspace-panes > .tab-content-frame.is-focused { left: 0 !important; top: var(--pane-strip-height) !important; width: 100% !important; height: calc(100% - var(--pane-strip-height)) !important; }
  }

  .workspace-layout-menu { position:fixed; inset:auto; margin:0; width:260px; max-height:calc(100vh - 60px); overflow:auto; padding:6px; color:var(--ink); background:var(--paper); border:1px solid var(--line); border-radius:10px; box-shadow:var(--control-shadow); }
  .workspace-tab-menu > strong { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .workspace-tab-menu:popover-open { animation: tab-menu-in 120ms var(--ease-out); }
  @keyframes tab-menu-in { from { opacity: .6; transform: translateY(-3px); } to { opacity: 1; transform: none; } }
  @media(prefers-reduced-motion:reduce) { .workspace-tab-menu:popover-open { animation: none; } }
  .workspace-layout-menu > strong { display:block; padding:10px 10px 8px; font-size:12px; font-weight: 400; color:var(--muted); }
  .workspace-layout-menu button { display:flex; align-items:center; gap:10px; width:100%; min-height:34px; padding:7px 10px; text-align:left; border:0; background:transparent; border-radius:5px; font-size:13px; }
  .workspace-layout-menu button:hover,.workspace-layout-menu button:focus-visible { background:var(--nav-hover); }
  .workspace-layout-menu button svg { width:16px; height:16px; flex:none; }
  .workspace-layout-menu button span:first-of-type { flex:1; }
  .workspace-layout-menu [data-layout-split=bottom] svg,.workspace-layout-menu [data-layout-split=top] svg { transform:rotate(90deg); }
  .workspace-layout-menu hr { margin:5px 4px; border:0; border-top:1px solid var(--line); }
  .workspace-tab-menu input { display:block; width:calc(100% - 20px); margin:4px 10px 8px; min-height:32px; padding:4px 8px; border:1px solid var(--line); border-radius:6px; background:var(--paper); color:var(--ink); font:inherit; font-size:13px; }
  .workspace-tab-menu-colors { display:flex; flex-wrap:wrap; gap:6px; padding:4px 10px 10px; }
  .workspace-tab-menu-colors button { width:18px; min-width:18px; min-height:18px; height:18px; padding:0; border-radius:50%; background:var(--group-color); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--ink) 12%, transparent); }
  .workspace-tab-menu-colors button[aria-current] { box-shadow:inset 0 0 0 2px var(--ink); }
  @media(max-width:760px) { .workspace-layout-menu button { min-height:44px; } }
`;
