export const TAB_WORKSPACE_STYLES = `
  body.immersive-workbench .immersive-plugin-stage > .tab-workspace { position: absolute; inset: 0; min-width: 0; min-height: 0; display: flex; overflow: hidden; background: var(--canvas); }
  body.immersive-workbench .tab-workspace-panes { flex: 1; min-width: 0; min-height: 0; display: grid; gap: 1px; background: var(--line); }
  body.immersive-workbench .tab-workspace-pool { display: none; }
  body.immersive-workbench .tab-workspace-exclusive { display: none; }
  body.immersive-workbench .tab-workspace[data-exclusive] .tab-workspace-panes { visibility: hidden; }
  body.immersive-workbench .tab-workspace[data-exclusive] .tab-workspace-exclusive { display: block; position: absolute; inset: 0; }
  body.immersive-workbench .tab-workspace-exclusive > * { position: absolute; inset: 0; min-width: 0; min-height: 0; overflow: auto; }
  body.immersive-workbench .tab-pane { min-width: 0; min-height: 0; display: flex; flex-direction: column; position: relative; background: var(--paper); }
  body.immersive-workbench .tab-strip { flex: none; display: flex; align-items: stretch; min-height: 32px; height: 32px; padding: 0; gap: 8px; overflow: auto; scrollbar-width: none; background: transparent; border: 0; }
  body.immersive-workbench .tab-strip::-webkit-scrollbar { display: none; }
  body.immersive-workbench .tab-pane > .tab-strip { padding: 0 8px; background: var(--nav-bg); box-shadow: inset 0 -1px 0 var(--line); }
  body.immersive-workbench .tab-group { display: flex; align-items: stretch; gap: 0; min-width: 0; background: transparent; }
  body.immersive-workbench .tab-group[data-tab-group="goals"] { --tab-group: var(--blue); }
  body.immersive-workbench .tab-group[data-tab-group="sessions"] { --tab-group: var(--green); }
  body.immersive-workbench .tab-group[data-tab-group="inbox"] { --tab-group: var(--amber); }
  body.immersive-workbench .tab-group[data-tab-group="feed"] { --tab-group: #7a6bb5; }
  body.immersive-workbench .tab-group[data-tab-group="artifacts"] { --tab-group: var(--ink-soft); }
  html[data-resolved-theme="dark"] body.immersive-workbench .tab-group[data-tab-group="feed"] { --tab-group: #b7add8; }
  body.immersive-workbench .tab-group:not([data-tab-group="home"]) { margin-left: 4px; padding-left: 10px; box-shadow: inset 3px 0 0 var(--tab-group); }
  body.immersive-workbench .tab-group-label { appearance: none; display: inline-flex; align-items: center; height: auto; margin: 0; padding: 0 8px 0 0; border: 0; border-radius: 0; background: transparent; color: var(--tab-group, var(--muted)); font: inherit; font-size: 12px; font-weight: 650; letter-spacing: 0; line-height: 1; white-space: nowrap; cursor: pointer; }
  body.immersive-workbench .tab-group-label:hover { color: var(--ink); }
  body.immersive-workbench .tab-group-label:focus-visible { outline-offset: -2px; }
  body.immersive-workbench .tab-group[data-collapsed="true"] .tab-group-pages { display: none; }
  body.immersive-workbench .tab-group-pages { display: flex; align-items: stretch; min-width: 0; }
  body.immersive-workbench .tab-item { appearance: none; position: relative; z-index: 0; flex: 0 1 auto; max-width: 168px; min-width: 72px; height: auto; margin: 0; display: inline-flex; align-items: center; gap: 6px; padding: 0 8px; border: 0; border-radius: 0; background: transparent; color: var(--muted); font: inherit; font-size: 12px; font-weight: 500; cursor: pointer; user-select: none; box-shadow: inset 0 -2px 0 transparent; }
  body.immersive-workbench .tab-item:hover { color: var(--ink); }
  body.immersive-workbench .tab-item.is-active { z-index: 1; background: transparent; color: var(--ink); font-weight: 650; box-shadow: inset 0 -2px 0 var(--blue); }
  body.immersive-workbench .tab-item:focus-visible { outline-offset: -2px; }
  body.immersive-workbench .tab-item span { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  body.immersive-workbench .tab-item-close { width: 18px; height: 18px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--muted); display: grid; place-items: center; opacity: .7; flex: none; }
  body.immersive-workbench .tab-item-close:hover { background: var(--nav-active); color: var(--ink); }
  body.immersive-workbench .tab-item-close svg { width: 11px; height: 11px; }
  body.immersive-workbench .tab-pane-close { position: absolute; top: 7px; right: 8px; z-index: 3; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--muted); display: grid; place-items: center; }
  body.immersive-workbench .tab-pane-close[hidden] { display: none; }
  body.immersive-workbench .tab-pane-close svg { width: 11px; height: 11px; }
  body.immersive-workbench .tab-pane-close:hover { background: var(--nav-active); color: var(--ink); }
  body.immersive-workbench .tab-pane-body { flex: 1; min-width: 0; min-height: 0; position: relative; overflow: hidden; background: var(--paper); }
  body.immersive-workbench .tab-pane-body > * { position: absolute; inset: 0; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; }
  body.immersive-workbench .tab-pane-body > .goal-canvas-shell { overflow: hidden; background: var(--canvas); }
  body.immersive-workbench .tab-pane-body > .desktop-work-surface { background: var(--paper); padding: 0; }
  body.immersive-workbench .tab-pane-body > .feed-workbench { background: var(--canvas); }
  body.immersive-workbench .tab-pane-body > .project-operation-surface { padding: 32px clamp(18px, 4%, 56px); }
  body.immersive-workbench .tab-pane-body > .project-operation-surface > [data-operation-detail] { max-width: 980px; margin: auto; }
  body.immersive-workbench .tab-pane-body > .immersive-artifact-surface { padding: 8px 24px 36px; }
  body.immersive-workbench .tab-pane-body > .immersive-home { padding: 54px 40px 36px; }
  body.immersive-workbench .tab-pane-body [data-work-surface="inbox"] .feed-detail-empty { display: grid; place-items: center; align-content: center; width: 100%; min-height: 100%; margin: 0; padding: 48px 24px; border-radius: 0; background: transparent; box-shadow: none; color: var(--muted); text-align: center; }
  body.immersive-workbench .tab-pane-body [data-work-surface="inbox"] .feed-detail-empty svg { width: 22px; height: 22px; color: var(--faint); }
  body.immersive-workbench .tab-pane-body [data-work-surface="inbox"] .feed-detail-empty h1 { margin: 8px 0 0; color: var(--ink-soft); font-size: 14px; font-weight: 550; letter-spacing: 0; }
  body.immersive-workbench .tab-pane-empty-hint, body.immersive-workbench .tab-pane-mirror { margin: 0; padding: 10px 8px 12px; color: var(--muted); font-size: 12px; }
  body.immersive-workbench .tab-drop-edges { display: none; }
  body.immersive-workbench .tab-workspace.is-tab-dragging .tab-drop-edges { display: block; pointer-events: none; }
  body.immersive-workbench .tab-drop-edges [data-tab-edge] { position: absolute; z-index: 4; border: 0; padding: 0; background: color-mix(in srgb, var(--blue) 18%, transparent); pointer-events: auto; }
  body.immersive-workbench .tab-drop-edges [data-tab-edge="left"], body.immersive-workbench .tab-drop-edges [data-tab-edge="right"] { top: 0; bottom: 0; width: 18px; }
  body.immersive-workbench .tab-drop-edges [data-tab-edge="left"] { left: 0; }
  body.immersive-workbench .tab-drop-edges [data-tab-edge="right"] { right: 0; }
  body.immersive-workbench .tab-drop-edges [data-tab-edge="top"], body.immersive-workbench .tab-drop-edges [data-tab-edge="bottom"] { left: 0; right: 0; height: 18px; }
  body.immersive-workbench .tab-drop-edges [data-tab-edge="top"] { top: 0; }
  body.immersive-workbench .tab-workspace[data-split] .tab-drop-edges [data-tab-edge="left"],
  body.immersive-workbench .tab-workspace[data-split] .tab-drop-edges [data-tab-edge="right"] { top: 32px; }
  body.immersive-workbench .tab-workspace[data-split] .tab-drop-edges [data-tab-edge="top"] { top: 32px; }
  body.immersive-workbench .tab-drop-edges [data-tab-edge="bottom"] { bottom: 0; }
  @media (max-width: 760px) {
    body.immersive-workbench .tab-drop-edges { display: none !important; }
    body.immersive-workbench .tab-item { min-width: 0; max-width: 120px; padding: 0 6px; }
    body.immersive-workbench .tab-pane-body > .immersive-home { padding: 30px 20px 26px; }
  }
`;
