/** The canvas composition belongs to Workbench; Goal and Work keep their own content. */
export const GOAL_CANVAS_STYLES = `
  .immersive-plugin-stage > .goal-canvas-shell, .tab-pane-body > .goal-canvas-shell { position: absolute; inset: 0; min-width: 0; min-height: 0; overflow: hidden; overscroll-behavior: contain; background: var(--canvas); container: goal-board / inline-size; }
  .goal-canvas-shell [hidden] { display: none !important; }
  .goal-canvas-shell .goal-canvas-map { position: absolute; inset: 0; width: 100%; height: 100%; display: block; padding: 0; margin: 0; overflow: hidden; background: transparent; }
  .goal-canvas-shell .goal-kanban { position: absolute; inset: 0; display: none; overflow-x: auto; overflow-y: hidden; overscroll-behavior: contain; background: var(--canvas); scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
  .goal-canvas-shell .goal-stage-list { display: none; position: absolute; inset: 0; z-index: 0; overflow: auto; overscroll-behavior: contain; padding: 52px 20px 28px; background: var(--paper); scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
  .goal-canvas-shell[data-board-view="list"] .goal-stage-list { display: block; }
  .goal-canvas-shell[data-board-view="list"] { background: var(--paper); }
  .goal-canvas-shell[data-expanded="true"]:not([data-board-view="list"]) .goal-stage-list { display: none !important; }
  @media (max-width: 760px) {
    .goal-canvas-shell[data-board-view="list"][data-expanded="true"] .goal-stage-list { display: none !important; }
  }
  @media (min-width: 761px) {
    .goal-canvas-shell[data-board-view="list"][data-expanded="true"] {
      display: grid;
      grid-template-columns: var(--tree-width, var(--immersive-sidebar-width)) minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
    }
    .goal-canvas-shell[data-board-view="list"][data-expanded="true"] .goal-stage-list {
      display: block !important;
      position: relative;
      inset: auto;
      z-index: 4;
      min-width: 0;
      min-height: 0;
      width: auto;
      height: auto;
      overflow: auto;
      border-right: 1px solid var(--line);
      padding: 8px 8px 20px;
      grid-column: 1;
      grid-row: 2;
    }
    .goal-canvas-shell[data-board-view="list"][data-expanded="true"] .goal-node-workspace {
      position: relative;
      inset: auto;
      z-index: 3;
      min-width: 0;
      min-height: 0;
      width: auto;
      height: auto;
      grid-column: 2;
      grid-row: 1 / -1;
    }
    .goal-canvas-shell[data-board-view="list"][data-expanded="true"] [data-goal-stage-chrome],
    .goal-canvas-shell[data-board-view="list"][data-expanded="true"] .goal-board-switch { visibility: visible; }
    .goal-canvas-shell[data-board-view="list"][data-expanded="true"] [data-goal-stage-chrome] {
      position: relative; top: auto; left: auto; grid-column: 1; grid-row: 1;
      margin: 16px 8px 8px; width: auto; max-width: none; flex-wrap: wrap; gap: 4px;
    }
    body.immersive-workbench .goal-canvas-shell[data-board-view="list"][data-expanded="true"] [data-goal-stage-chrome] :is(.tree-chrome, .tree-tools) { max-width: 100%; flex-wrap: wrap; }
    body.immersive-workbench .goal-canvas-shell[data-board-view="list"][data-expanded="true"] .tree-entry {
      grid-template-columns: minmax(0, 1fr) auto;
      column-gap: 8px;
    }
    body.immersive-workbench .goal-canvas-shell[data-board-view="list"][data-expanded="true"] .tree-copy { grid-template-columns: minmax(0, 1fr); }
    body.immersive-workbench .goal-canvas-shell[data-board-view="list"][data-expanded="true"] .tree-created-meta,
    .goal-canvas-shell[data-board-view="list"][data-expanded="true"] .tree-progress,
    .goal-canvas-shell[data-board-view="list"][data-expanded="true"] .tree-relations { display: none !important; }
    .goal-canvas-shell[data-board-view="list"][data-expanded="true"] .tree-title-line { grid-column: 1; }
  }
  .goal-canvas-shell[data-board-view="list"] > [data-goal-momentum] { display: none !important; }
  .goal-canvas-shell[data-board-view="kanban"] > [data-goal-kanban] { display: flex; position: absolute; inset: 0; width: 100%; height: 100%; }
  .goal-canvas-shell[data-board-view="kanban"] > [data-goal-momentum] { display: none !important; }
  body.immersive-workbench [data-goal-stage-list] .tree-created-meta { display: inline-flex !important; }
  body.immersive-workbench [data-goal-stage-list] .tree-created-meta .tree-avatar { display: grid !important; }
  body.immersive-workbench [data-goal-stage-list] .tree-created-meta .tree-created { display: block !important; }
  .goal-work-planning-toggle { display: inline-flex; align-items: center; gap: 6px; height: 28px; min-height: 28px; padding: 0 10px; border-radius: 6px; }
  .goal-work-planning-toggle[aria-pressed="true"] { background: var(--nav-active); color: var(--ink); }
  .goal-work-planning-pane,
  .goal-work-rules-pane { display: none; min-width: 0; min-height: 0; overflow: auto; padding: 64px 40px 48px; background: var(--page); }
  .goal-canvas-shell[data-goal-planning="open"] .goal-work-planning-pane { overflow: hidden; padding: 52px 0 0; }
  .goal-canvas-shell[data-goal-planning="open"] .goal-work-planning-pane,
  .goal-canvas-shell[data-goal-rules="open"] .goal-work-rules-pane { display: block; position: absolute; inset: 0; z-index: 4; }
  .goal-canvas-shell:is([data-goal-planning="open"], [data-goal-rules="open"]) [data-goal-stage-chrome] { visibility: visible; }
  .goal-canvas-shell[data-goal-planning="open"] .goal-work-planning-pane { display: flex; flex-direction: column; overflow: hidden; }
  .goal-canvas-shell[data-goal-planning="open"] .goal-work-planning-pane > .work-planning { flex: 1; min-height: 0; height: auto; overflow: hidden; }
  .goal-canvas-shell[data-goal-planning="open"] .work-planning-layout,
  .goal-canvas-shell[data-goal-planning="open"] .work-planning-directory,
  .goal-canvas-shell[data-goal-planning="open"] .work-planning-stage { min-height: 0; }
  .goal-canvas-shell[data-goal-planning="open"] .work-planning-directory { overflow: auto; overscroll-behavior: contain; }
  .goal-canvas-shell[data-goal-planning="open"] .work-planning-detail { display: flex; flex-direction: column; overflow: hidden; padding: 0 32px; }
  .goal-canvas-shell[data-goal-planning="open"] .work-planning-detail > :is(.planning-detail, .planning-edit) { display: flex; flex-direction: column; flex: 1; min-height: 0; width: 100%; max-width: none; height: auto; margin: 0; padding: 0; overflow: hidden; }
  .goal-canvas-shell[data-goal-planning="open"] .planning-detail-scroll { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; }
  .goal-canvas-shell[data-goal-planning="open"] .work-planning-detail :is(.mw-breadcrumb, .planning-back) { flex: none; margin: 0; padding: 12px 0 8px; background: var(--page); }
  .goal-work-planning-pane :is(.work-planning, .planning-detail, .planning-edit),
  .goal-work-rules-pane .project-rules-document,
  html[data-resolved-theme="dark"] .goal-work-rules-pane .project-rules-document { display: block; height: auto; overflow: visible; background: transparent; }
  .goal-work-rules-pane.settings-stage :is(.mw-input, .mw-select, .mw-textarea) { width: 240px; min-height: var(--control-h, 28px); padding: 0 10px; border: 1px solid var(--control-input); border-radius: var(--radius-control, 8px); background-color: var(--paper); color: var(--ink); box-shadow: none; font-size: 13px; appearance: none; }
  .goal-work-rules-pane.settings-stage .mw-textarea { width: 100%; min-height: 72px; height: auto; padding: 8px 10px; resize: vertical; }
  .goal-work-rules-pane.settings-stage .mw-select { padding-right: 28px; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%2394949c' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 8px center; background-size: 14px 14px; }
  .goal-work-rules-pane.settings-stage .setting-number .mw-input { width: 90px; }
  .goal-work-rules-pane .settings-setting-row > .mw-select-picker { width: 240px; flex: none; margin-left: auto; }
  .goal-work-rules-pane .settings-setting-row > .mw-select-picker > .mw-select-picker__trigger { width: 100%; }
  .goal-work-planning-pane .settings-body,
  .goal-work-rules-pane .settings-body { display: block; height: auto; min-height: 0; overflow: visible; overscroll-behavior: auto; flex: none; padding-bottom: 48px; }
  .goal-stage-list .goal-collection-fold { margin: 0 0 10px; border: 0; }
  .goal-stage-list .goal-collection-fold > summary { display: flex; align-items: center; gap: 8px; height: 32px; min-height: 32px; padding: 0 8px; border-radius: 6px; color: var(--muted); list-style: none; cursor: pointer; }
  .goal-stage-list .goal-collection-fold > summary::-webkit-details-marker, .goal-stage-list .goal-collection-fold > summary::marker { display: none; }
  .goal-stage-list .goal-collection-fold > summary:hover { color: var(--ink); background: var(--nav-hover); }
  .goal-stage-list .goal-collection-fold > summary strong { font-size: 12px; font-weight: 400; }
  .goal-stage-list .goal-collection-fold > summary small { font-size: 11px; font-variant-numeric: tabular-nums; color: var(--faint); }
  .goal-stage-list .goal-collection-caret { display: grid; place-items: center; width: 16px; height: 16px; color: var(--muted); }
  .goal-stage-list .goal-collection-caret svg { width: 12px; height: 12px; transition: transform 140ms cubic-bezier(.16, 1, .3, 1); }
  .goal-stage-list .goal-collection-mark { display: grid; place-items: center; width: 16px; height: 16px; color: var(--tone-idle, var(--muted)); }
  .goal-stage-list .goal-collection-mark svg { width: 13px; height: 13px; }
  .goal-stage-list [data-goal-collection-fold="archive"] .goal-collection-mark { color: var(--tone-quiet, var(--muted)); }
  .goal-stage-list [data-goal-collection-fold="trash"] .goal-collection-mark { color: var(--tone-blocked, var(--red)); }
  .goal-stage-list .goal-collection-fold:not([open]) > summary .goal-collection-caret svg { transform: rotate(-90deg); }
  .goal-stage-list .goal-collection-empty { margin: 0; padding: 6px 8px 10px 24px; font-size: 12px; color: var(--muted); }
  .goal-stage-list .goal-tree { margin: 0; padding: 0; list-style: none; }
  .goal-stage-list .tree-item { margin: 0; padding: 0; }
  body.immersive-workbench .goal-stage-list .tree-row { display: block; min-height: 28px; padding: 0; }
  body.immersive-workbench .goal-stage-list .tree-toggle,
  body.immersive-workbench .goal-stage-list .tree-guide { flex: none; width: 16px; height: 28px; min-height: 28px; padding: 0; display: grid; place-items: center; border: 0; background: transparent; color: var(--muted); }
  .goal-stage-list .tree-toggle svg { width: 11px; height: 11px; }
  body.immersive-workbench .goal-canvas-shell .goal-stage-list .tree-children {
    margin: 0;
    margin-inline: 0;
    padding: 0;
    padding-inline: 0;
    border: 0;
  }
  body.immersive-workbench .goal-stage-list .tree-entry {
    display: grid;
    grid-template-columns: minmax(12rem, 1fr) 6.25rem 4.75rem 8.5rem auto;
    grid-template-rows: 28px;
    column-gap: 12px;
    align-items: center;
    min-width: 0;
    height: 28px;
    min-height: 28px;
    padding: 0 8px;
    border-radius: 6px;
    overflow: visible;
  }
  .goal-stage-list .tree-entry:hover { background: var(--nav-hover); }
  .goal-stage-list .tree-entry.is-selected { background: var(--nav-active); }
  body.immersive-workbench .goal-stage-list .tree-leading {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    width: 100%;
    grid-column: 1;
    grid-row: 1;
    padding-left: calc((var(--tree-depth, 0) + 1) * 16px);
  }
  body.immersive-workbench .goal-stage-list .tree-copy { display: grid; grid-template-columns: minmax(0, 1fr); align-items: center; min-width: 0; flex: 1; width: 100%; overflow: hidden; }
  .goal-stage-list .tree-created-meta {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    grid-column: 5;
    grid-row: 1;
    min-width: 0;
    height: 28px;
    cursor: pointer;
  }
  .goal-stage-list .tree-avatar {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    font-size: 9px;
    font-weight: 400;
    line-height: 1;
    letter-spacing: 0;
    color: var(--ink);
    background: color-mix(in srgb, hsl(var(--tree-avatar-hue, 210) 42% 48%) 26%, var(--paper));
    flex: none;
  }
  .goal-stage-list .tree-avatar.is-unknown {
    background: color-mix(in srgb, var(--muted) 14%, var(--paper));
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .goal-stage-list .tree-created { min-width: 7ch; color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; font-weight: 400; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .goal-stage-list .tree-created.is-empty { visibility: hidden; }
  body.immersive-workbench .goal-stage-list .tree-node {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    width: 100%;
    height: 28px;
    min-height: 28px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--ink);
    text-align: left;
    cursor: pointer;
  }
  .goal-stage-list .tree-title-line { grid-column: 1; min-width: 0; overflow: hidden; }
  .goal-stage-list .tree-title-line strong { display: block; font-size: 13px; font-weight: 400; line-height: 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.immersive-workbench .goal-stage-list .directory-row-state {
    display: flex;
    align-items: center;
    grid-column: 2;
    grid-row: 1;
    min-width: 0;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    overflow: hidden;
    font-size: inherit;
    font-weight: inherit;
  }
  body.immersive-workbench .goal-stage-list .goal-status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    max-width: 100%;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    font-size: 11px;
    font-weight: 400;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .goal-stage-list .goal-status svg { display: block; width: 12px; height: 12px; flex: none; }
  .goal-stage-list .tree-progress { display: inline-flex; align-items: center; gap: 6px; grid-column: 3; grid-row: 1; min-width: 0; width: auto; margin: 0; color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; }
  .goal-stage-list .tree-progress.is-empty { visibility: hidden; }
  .goal-stage-list .tree-progress > i { width: 34px; height: 2px; overflow: hidden; background: var(--line-strong); flex: none; }
  .goal-stage-list .tree-progress > i > b { display: block; width: var(--tree-progress); height: 100%; background: var(--green); }
  .goal-stage-list .tree-relations { position: relative; display: flex; align-items: center; grid-column: 4; grid-row: 1; min-width: 0; min-height: 28px; margin: 0; }
  .goal-stage-list .tree-relations.is-empty { visibility: hidden; }
  .goal-stage-list .tree-relations > summary {
    display: flex;
    align-items: center;
    max-width: 100%;
    height: 28px;
    min-height: 28px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    list-style: none;
    overflow: hidden;
  }
  .goal-stage-list .tree-relations > summary::-webkit-details-marker,
  .goal-stage-list .tree-relations > summary::marker { display: none; }
  .goal-stage-list .tree-relations-copy { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; font-variant-numeric: tabular-nums; }
  .goal-stage-list .tree-relations.is-waiting .tree-relations-copy { color: var(--amber); }
  .goal-stage-list .tree-relations.is-blocked .tree-relations-copy { color: var(--red); }
  .goal-stage-list .tree-relations.is-ready .tree-relations-copy { color: var(--green); }
  .goal-stage-list .tree-relations > summary:hover .tree-relations-copy { color: var(--ink); }
  .goal-stage-list .tree-relations .tree-deps {
    position: absolute;
    right: 0;
    top: calc(100% + 2px);
    z-index: 4;
    width: min(280px, 72vw);
    margin: 0;
    padding: 6px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--paper);
    box-shadow: var(--surface-shadow);
  }
  .goal-kanban-board { display: flex; align-items: stretch; gap: 8px; box-sizing: border-box; min-width: 0; flex: 1; min-height: 0; height: 100%; width: 100%; padding: 52px 12px 12px; }
  .goal-kanban-column { flex: 1 1 0; width: auto; min-width: 0; height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; position: relative; background: transparent; border: 0; border-radius: 0; }
  .goal-kanban-column > details { display: block; height: 100%; min-height: 0; overflow: hidden; }
  .goal-kanban-column > details > summary { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; padding: 0 0 8px; border-bottom: 1px solid var(--line); font-size: 13px; font-weight: 400; letter-spacing: -.011em; color: var(--ink); list-style: none; cursor: default; pointer-events: none; user-select: none; }
  .goal-kanban-column > details > summary::-webkit-details-marker, .goal-kanban-column > details > summary::marker { display: none; }
  .goal-kanban-chevron { display: none; width: 16px; height: 16px; color: var(--muted); flex: none; place-items: center; }
  .goal-kanban-chevron svg { display: block; width: 12px; height: 12px; }
  .goal-kanban-status { width: 16px; height: 16px; display: grid; place-items: center; flex: none; color: var(--ink-soft); }
  .goal-kanban-status svg { display: block; width: 16px; height: 16px; overflow: visible; }
  .goal-kanban-column[data-kanban-column="continue"] .goal-kanban-status { color: var(--tone-idle, var(--ink-soft)); }
  .goal-kanban-column[data-kanban-column="in_progress"] .goal-kanban-status { color: var(--tone-progress, var(--blue)); }
  .goal-kanban-column[data-kanban-column="waiting_user"] .goal-kanban-status { color: var(--tone-attention, var(--amber)); }
  .goal-kanban-column[data-kanban-column="waiting"] .goal-kanban-status { color: var(--tone-hold, var(--faint)); }
  .goal-kanban-column[data-kanban-column="blocked"] .goal-kanban-status { color: var(--tone-blocked, var(--red)); }
  .goal-kanban-column[data-kanban-column="completed"] .goal-kanban-status { color: var(--tone-done, var(--green)); }
  .goal-kanban-card > .goal-kanban-status { display: none; }
  .goal-kanban-group-name { min-width: 0; white-space: nowrap; }
  .goal-kanban-count { color: var(--muted); font-size: 12px; font-weight: 400; font-variant-numeric: tabular-nums; flex: none; }
  .goal-kanban-empty { margin: 0; padding: 8px 10px; border: 1px dashed var(--line); border-radius: 6px; color: var(--muted); font-size: 12px; }
  .goal-kanban-column [data-kanban-cards] { position: absolute; inset: 36px 0 0; flex: none; min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 6px; padding: 0 0 8px; scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
  .goal-kanban-card { transition: border-color var(--motion-fast), background-color var(--motion-fast); flex: none; display: grid; gap: 3px; min-width: 0; padding: 8px 9px; background: var(--paper); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; text-align: left; cursor: pointer; }
  .goal-kanban-card:hover { border-color: color-mix(in srgb, var(--ink) 22%, var(--line)); }
  .goal-kanban-card.is-selected { border-color: var(--blue); }
  .goal-kanban-card.is-complete strong { color: color-mix(in srgb, var(--ink) 82%, var(--muted)); }
  .goal-kanban-card strong { font-size: 13px; line-height: 1.3; font-weight: 400; letter-spacing: -.012em; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .goal-kanban-card-outcome { color: color-mix(in srgb, var(--ink) 78%, var(--muted)); font-size: 12px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .goal-kanban-card-meta { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .goal-kanban-card-meta small { min-width: 0; color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  body.immersive-workbench .goal-kanban-card .goal-status { display: inline-flex; align-items: center; gap: 5px; width: max-content; max-width: 100%; min-height: 0; padding: 0; border: 0; border-radius: 0; background: transparent; font-size: 11px; font-weight: 400; color: var(--goal-status-tone); }
  body.immersive-workbench .goal-kanban-card .goal-status svg { display: none; }
  body.immersive-workbench .goal-kanban-card .goal-status::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex: none; }
  .goal-kanban-card:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
  @container goal-board (max-width: 839px) {
    .goal-canvas-shell[data-board-view="kanban"] > [data-goal-kanban] { display: block; overflow-x: hidden; overflow-y: auto; background: var(--paper); min-width: 0; max-width: 100%; }
    .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-board { flex-direction: column; align-items: stretch; gap: 6px; box-sizing: border-box; min-width: 0; max-width: 100%; flex: none; width: 100%; height: auto; min-height: 100%; margin: 0; padding: 44px 12px 24px; background: transparent; border: 0; border-radius: 0; overflow-x: hidden; }
    .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-column { flex: none; width: auto; min-width: 0; max-width: 100%; height: auto; overflow: visible; }
    .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-card { max-width: 100%; }
    .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-column > details { display: block; height: auto; overflow: visible; }
    .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-column > details[open] { padding-bottom: 2px; }
    .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-chevron { display: grid; transition: transform 140ms cubic-bezier(.16, 1, .3, 1); transform-origin: 50% 50%; }
    @media (prefers-reduced-motion: reduce) { .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-chevron { transition: none; } }
    .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-column > details[open] > summary .goal-kanban-chevron { transform: rotate(90deg); }
    .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-column > details > summary { display: flex; width: 100%; max-width: none; height: 32px; min-height: 32px; margin: 0; padding: 0 10px 0 8px; gap: 8px; border: 0; border-radius: 6px; font-size: 13px; font-weight: 400; color: var(--ink-soft); background: transparent; cursor: pointer; pointer-events: auto; }
    .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-column > details[open] > summary { background: color-mix(in srgb, var(--ink) 4.5%, transparent); }
    .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-column > details > summary:hover { background: color-mix(in srgb, var(--ink) 6.5%, transparent); }
    .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-column > details > summary:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
    .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-group-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--ink-soft); }
    .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-count { color: var(--faint); font-size: 13px; font-weight: 400; }
    .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-column [data-kanban-cards] { position: static; inset: auto; overflow: visible; gap: 0; padding: 2px 0 0; height: auto; }
    .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-empty { display: none; }
    .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-card > .goal-kanban-status { display: grid; }
    .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-card { display: grid; grid-template-columns: 16px minmax(0, 1fr); align-items: center; gap: 8px; height: 36px; min-height: 36px; padding: 0 10px 0 32px; background: transparent; border: 0; border-radius: 6px; }
    .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-card:hover { background: color-mix(in srgb, var(--ink) 4.5%, transparent); border-color: transparent; }
    .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-card.is-selected { background: color-mix(in srgb, var(--ink) 7%, transparent); border-color: transparent; }
    .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-card.is-complete strong { color: color-mix(in srgb, var(--ink) 48%, var(--muted)); }
    .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-card-outcome,
    .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-card-meta { display: none; }
    .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-card strong { grid-column: 2; grid-row: 1; display: block; font-size: 13px; font-weight: 400; line-height: 20px; letter-spacing: -.011em; color: var(--ink); white-space: nowrap; text-overflow: ellipsis; -webkit-line-clamp: unset; -webkit-box-orient: unset; overflow: hidden; }
    .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-card:focus-visible { outline-offset: var(--focus-stroke-inset); }
  }
  @media (max-width: 760px) {
    @container goal-board (max-width: 839px) {
      .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-board { padding: 40px 8px 16px; }
      .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-column > details > summary, .goal-canvas-shell[data-board-view="kanban"] .goal-kanban-card { height: 44px; min-height: 44px; }
    }
  }
  .goal-canvas-viewport { position: absolute; inset: 0; overflow: hidden; touch-action: none; cursor: grab; background-image: radial-gradient(circle, color-mix(in srgb, var(--muted) 36%, transparent) .9px, transparent 1px); background-size: 22px 22px; }
  .goal-canvas-viewport.is-panning { cursor: grabbing; user-select: none; }
  .goal-canvas-world { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; }
  .goal-canvas-edges { position: absolute; width: 1px; height: 1px; overflow: visible; pointer-events: none; }
  .goal-canvas-edges g path { fill: none; stroke: color-mix(in srgb, var(--muted) 62%, var(--line)); stroke-width: 1.5; }
  .goal-canvas-edges marker path { fill: var(--muted); }
  .goal-canvas-edges .is-selected-path path { stroke: var(--blue); stroke-width: 2; }
  .goal-canvas-node { position: absolute; inset: 0 auto auto 0; width: 258px; height: 190px; padding: 18px 16px 14px; display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto minmax(0, 1fr) auto; align-items: start; gap: 8px 10px; background: var(--paper); color: var(--ink); border: 1px solid var(--line); border-radius: 12px; text-align: left; cursor: pointer; touch-action: none; }
  .goal-canvas-open, .goal-canvas-frame { position: absolute; top: 10px; width: 28px; height: 28px; display: grid; place-items: center; border: 0; border-radius: 5px; color: var(--muted); background: transparent; cursor: pointer; }
  .goal-canvas-open { right: 10px; }
  .goal-canvas-frame { right: 42px; }
  .goal-canvas-open svg, .goal-canvas-frame svg { width: 15px; height: 15px; }
  .goal-canvas-open:hover, .goal-canvas-frame:hover { color: var(--ink); background: var(--rail); }
  @media (hover: hover) and (pointer: fine) {
    .goal-canvas-open, .goal-canvas-frame { opacity: 0; }
    .goal-canvas-node:hover .goal-canvas-open, .goal-canvas-node:hover .goal-canvas-frame, .goal-canvas-node:focus-within .goal-canvas-open, .goal-canvas-node:focus-within .goal-canvas-frame, .goal-canvas-node.is-selected .goal-canvas-open, .goal-canvas-node.is-selected .goal-canvas-frame { opacity: 1; }
  }
  .goal-canvas-node > .goal-status { display: inline-flex; align-items: center; gap: 6px; grid-row: 3; grid-column: 1; align-self: end; width: max-content; padding: 0; border: 0; background: transparent; max-width: none; font-size: 11px; font-weight: 400; color: var(--goal-status-tone); }
  .goal-canvas-node > .goal-status svg { display: none; }
  .goal-canvas-node > .goal-status::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; flex: none; }
  .goal-canvas-node:focus-visible, .goal-canvas-open:focus-visible, .goal-canvas-frame:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
  .goal-canvas-viewport.is-reject { background-color: color-mix(in srgb, var(--amber) 8%, var(--canvas)); }
  .goal-canvas-node:hover { border-color: color-mix(in srgb, var(--ink) 22%, var(--line)); }
  .goal-canvas-node.is-selected { border-color: var(--blue); }
  .goal-canvas-node.is-complete { background: var(--paper); }
  .goal-canvas-node.is-complete strong { color: color-mix(in srgb, var(--ink) 82%, var(--muted)); }
  .goal-canvas-node.is-expanded-node { visibility: hidden; }
  .goal-canvas-node strong { grid-column: 1 / -1; grid-row: 1; padding-right: 56px; font-size: 16px; line-height: 1.35; font-weight: 400; letter-spacing: -.018em; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .goal-canvas-node-outcome { grid-column: 1 / -1; grid-row: 2; color: color-mix(in srgb, var(--ink) 78%, var(--muted)); font-size: 13px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .goal-canvas-node small { grid-row: 3; grid-column: 2; align-self: end; padding: 0; border: 0; max-width: 16ch; text-align: right; color: var(--muted); font-size: 11px; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .goal-canvas-integrity { position: absolute; top: 56px; left: 20px; z-index: 1; pointer-events: none; max-width: calc(100% - 140px); margin: 0; font-size: 12px; color: var(--muted); }
  .goal-canvas-tools { position: absolute; inset: auto 22px 18px; display: flex; justify-content: flex-end; align-items: center; gap: 12px; pointer-events: none; }
  .goal-canvas-tools > div { pointer-events: auto; display: flex; align-items: center; gap: 4px; padding: 4px; background: var(--paper); border: 1px solid var(--line); border-radius: 9px; }
  .goal-canvas-tools button { width: 32px; height: 32px; display: grid; place-items: center; border: 0; background: transparent; color: var(--ink); cursor: pointer; border-radius: 6px; font-size: 17px; }
  .goal-canvas-tools button:hover { background: var(--rail); }
  .goal-canvas-tools output { min-width: 48px; text-align: center; font-size: 12px; font-variant-numeric: tabular-nums; }
  .goal-canvas-tools svg { width: 16px; height: 16px; }
  [data-goal-stage-chrome] { position: absolute; top: 16px; left: 20px; z-index: 20; display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; width: max-content; max-width: calc(100% - 40px); background: transparent; isolation: isolate; pointer-events: auto; }
  body.immersive-workbench [data-goal-stage-chrome] .tree-chrome,
  body.immersive-workbench [data-goal-stage-chrome] .tree-tools { width: max-content; min-width: 0; justify-content: flex-start; flex-wrap: nowrap; background: transparent; border: 0; padding: 0; }
  body.immersive-workbench [data-goal-stage-chrome] .tree-create,
  body.immersive-workbench [data-goal-stage-chrome] .goal-board-switch { flex: none; }
  [data-goal-stage-chrome] .tree-filter-control { position: relative; z-index: 1; }
  [data-goal-stage-chrome] [data-tree-filter-trigger] { position: relative; z-index: 1; pointer-events: auto; }
  [data-goal-stage-chrome] .tree-filter { left: 0; right: auto; width: min(22rem, calc(100cqi - 40px)); max-width: calc(100cqi - 40px); }
  .goal-canvas-shell[data-expanded="true"] [data-goal-stage-chrome] { visibility: hidden; }
  .goal-board-switch { position: static; }
  .goal-canvas-shell[data-expanded="true"] .goal-canvas-integrity, .goal-canvas-shell[data-expanded="true"] .goal-canvas-tools, .goal-canvas-shell[data-expanded="true"] .goal-board-switch { visibility: hidden; }
  /* The canvas toolbar hides because an opened Goal covers the canvas — so ask whether it actually
   * does. Returning to Goals from a Goal tab leaves data-expanded set while nothing is expanded,
   * and keying on the flag alone stranded New Goal, the filters, the zoom and the board switch. */
  .goal-canvas-shell[data-expanded="true"]:not(:has([data-goal-node-workspace]:not([hidden])))
    :is([data-goal-stage-chrome], .goal-canvas-integrity, .goal-canvas-tools, .goal-board-switch) { visibility: visible; }
  .goal-canvas-empty.mw-empty {
    position: absolute; inset: 0; z-index: 1; pointer-events: none;
    display: grid; place-content: center; justify-items: center; align-content: center;
    gap: 8px; padding: 72px 32px 88px; text-align: center; background: transparent;
  }
  .goal-canvas-empty.mw-empty strong { font-size: 14px; font-weight: 400; letter-spacing: -.018em; line-height: 1.35; color: var(--ink); }
  .goal-canvas-empty.mw-empty p { margin: 0; max-width: 28ch; font-size: 13px; line-height: 1.5; color: var(--muted); }
  .goal-canvas-map [data-retry-goal-momentum] { position: absolute; bottom: 25px; left: 26px; }
  .goal-canvas-map [data-goal-momentum-status] { position: absolute; bottom: 74px; left: 26px; right: 26px; padding: 12px; background: var(--paper); color: var(--ink); font-size: 13px; }
  .goal-node-workspace { position: absolute; inset: 0; z-index: 3; background: var(--paper); border-radius: 0; box-shadow: none; overflow: hidden; display: flex; flex-direction: column; min-width: 0; min-height: 0; container: goal-workspace / inline-size; }
  .goal-canvas-shell[data-expanded="true"]::before { content: none; }
  .goal-node-toolbar { flex: none; min-height: 48px; display: flex; justify-content: flex-start; align-items: center; padding: 8px 16px 8px 20px; gap: 16px; border-bottom: 1px solid var(--line); }
  .goal-node-heading { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
  .goal-node-heading h1 { margin: 0; min-width: 0; font-size: 16px; line-height: 1.5; font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .goal-node-heading > span { font-size: 10px; color: var(--muted); white-space: nowrap; flex: none; }
  .goal-node-toolbar button { display: grid; place-items: center; height: 30px; width: 30px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer; }
  .goal-node-toolbar button:hover { background: var(--rail); color: var(--ink); }
  .goal-node-toolbar svg { width: 16px; height: 16px; }
  .goal-node-workbench { position: relative; flex: 1; min-height: 0; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) 300px; grid-template-rows: minmax(0, 1fr); }
  .goal-node-workspace[data-details-open="false"] .goal-node-workbench { grid-template-columns: minmax(0, 1fr) 32px; }
  .goal-node-workspace[data-details-open="false"] .goal-details-aside { width: 32px; min-width: 32px; max-width: 32px; }
  .goal-details-aside { grid-column: 2; grid-row: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; position: relative; border-left: 1px solid var(--line); background: color-mix(in srgb, var(--rail) 30%, var(--paper)); }
  .goal-details-toggle { flex: none; align-self: flex-start; z-index: 3; display: grid; place-items: center; height: 26px; width: 26px; margin: 4px 0 0 6px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer; }
  .goal-details-toggle:hover { background: var(--rail); color: var(--ink); }
  .goal-details-toggle svg { width: 16px; height: 16px; }
  .goal-details-toggle:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
  .goal-node-workspace[data-details-open="false"] .goal-details-toggle { align-self: center; margin: 6px auto 0; }
  .goal-work-main { min-width: 0; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); grid-column: 1; grid-row: 1; overflow: hidden; }
  .goal-work-modebar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 22px; font-size: 10px; color: var(--muted); }
  .goal-work-modebar:has(#goal-conversation-tab:disabled) { display: none; }
  .goal-work-modebar > [role="tablist"] { display: flex; gap: 4px; }
  .goal-work-modebar button { display: flex; align-items: center; gap: 6px; border: 0; border-radius: 6px; padding: 6px 9px; font: inherit; font-size: 11px; color: var(--muted); background: transparent; cursor: pointer; }
  .goal-work-modebar button[aria-selected="true"] { background: var(--rail); color: var(--ink); }
  .goal-work-modebar svg { width: 13px; height: 13px; }
  body.immersive-workbench .goal-details-aside > .document-pane { display: flex; flex: 1; padding: 0; margin: 0; border: 0; min-width: 0; min-height: 0; width: auto; overflow: hidden; position: static; background: transparent; }
  body.immersive-workbench .goal-details-aside > .document-pane[hidden] { display: none !important; }
  .goal-canvas-shell [data-work-surface="goal"] { display: flex; width: 100%; min-width: 0; min-height: 0; padding: 0; }
  .goal-canvas-shell .goal-event-document { display: flex; flex-direction: column; flex: 1; width: 100%; min-width: 0; min-height: 0; position: relative; container-type: normal; margin: 0; padding: 0; background: transparent; }
  .goal-canvas-shell .goal-layout { display: contents; }
  .goal-workspace-hero { min-width: 0; min-height: 0; padding: 16px; flex: none; }
  .goal-canvas-shell .goal-workspace-hero { background: transparent; padding: 12px 14px 4px; }
  .goal-info-popover { background: transparent; border-radius: 0; box-shadow: none; }
  .goal-info-popover > summary { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 10px 12px; cursor: pointer; list-style: none; font-size: 12px; font-weight: 400; }
  .goal-info-popover > summary::-webkit-details-marker, .timeline-compose > summary::-webkit-details-marker { display: none; }
  .goal-info-popover .goal-info-collapsed-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .goal-info-popover:not([open]) .goal-info-label, .goal-info-popover[open] .goal-info-collapsed-title { display: none; }
  .goal-info-popover > summary > .goal-status { margin-left: auto; font-size: 10px; }
  .goal-info-popover > summary > svg { width: 14px; height: 14px; flex: none; color: var(--muted); transform: rotate(-90deg); }
  .goal-info-popover[open] > summary > svg { transform: none; }
  .goal-info-body { padding: 0 14px 8px; max-height: min(43vh, 365px); overflow: auto; overscroll-behavior: contain; }
  .goal-canvas-shell .goal-info-body h1 { display: none; }
  .goal-info-body h1 { font-size: 16px; font-weight: 400; line-height: 1.5; letter-spacing: -.02em; margin: 4px 0 8px; overflow-wrap: anywhere; }
  .goal-info-outcome { color: var(--muted); font-size: 12px; line-height: 1.65; margin: 0 0 12px; overflow-wrap: anywhere; }
  .goal-info-status { font-size: 13px; line-height: 1.6; margin-bottom: 10px; }
  .goal-info-status p { margin: 0; }
  .goal-info-status .goal-current-fact { font-weight: 400; }
  .goal-info-status .goal-progress-fact { color: var(--muted); margin-top: 10px; }
  .goal-info-status .mw-btn--link { margin: 4px 0; }
  .goal-info-status .overview-timestamp { color: var(--muted); font-size: 10px; }
  .goal-info-requirements, .goal-info-attention { display: flex; align-items: center; gap: 5px; width: 100%; padding: 9px 0; border: 0; background: transparent; color: var(--ink); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
  .goal-info-requirements > span:nth-child(2) { margin-left: auto; color: var(--muted); }
  .goal-info-attention { color: var(--blue); }
  .goal-info-attention > svg { margin-left: auto; }
  .goal-info-actions { display: flex; align-items: center; justify-content: space-between; gap: 6px; border-top: 1px solid var(--line); margin-top: 5px; padding-top: 4px; }
  .goal-info-actions > button { display: flex; align-items: center; gap: 4px; min-height: 34px; }
  .goal-info-body svg { width: 14px; height: 14px; flex: none; }
  .goal-info-actions .goal-more > div { top: auto; bottom: calc(100% + 4px); right: 0; }
  .goal-info-requirements:hover, .goal-info-attention:hover { color: var(--blue); }
  .timeline-compose { position: relative; }
  .timeline-compose > summary { display: flex; align-items: center; gap: 4px; min-height: 32px; padding: 5px 8px; list-style: none; border-radius: 6px; cursor: pointer; font-size: 12px; color: var(--ink); }
  .timeline-compose > summary:hover, .timeline-compose[open] > summary { background: var(--rail); }
  .timeline-compose > summary > svg { width: 14px; height: 14px; }
  .timeline-compose-options { position: absolute; right: 0; top: calc(100% + 5px); z-index: 6; width: 250px; max-width: calc(100vw - 56px); padding: 5px; border-radius: 12px; background: var(--paper); box-shadow: 0 6px 24px color-mix(in srgb, var(--ink) 16%, transparent); }
  .timeline-compose-options button { display: block; width: 100%; padding: 10px; border: 0; border-radius: 7px; background: transparent; color: var(--ink); text-align: left; cursor: pointer; }
  .timeline-compose-options button:hover { background: var(--rail); }
  .timeline-compose-options strong { display: block; font-size: 12px; font-weight: 400; }
  .timeline-compose-options small { display: block; margin-top: 4px; font-size: 11px; color: var(--muted); line-height: 1.5; }
  .record-templates { margin-bottom: 18px; font-size: 12px; }
  .record-templates summary { cursor: pointer; padding: 6px 0; color: var(--muted); }
  body.immersive-workbench .goal-work-main .tui-pane { display: grid; position: relative; inset: auto; z-index: auto; visibility: visible; pointer-events: auto; box-shadow: none; grid-column: 1; grid-row: 2; min-width: 0; min-height: 0; width: auto; height: auto; padding: 12px 16px 16px; margin: 0; border: 0; border-radius: 0; background: var(--paper); grid-template-rows: auto minmax(0, 1fr); }
  .goal-canvas-shell .tui-resizer, .goal-canvas-shell .tui-focus-return, .goal-canvas-shell .tui-owner { display: none !important; }
  .goal-canvas-shell .tui-tabs { min-height: 34px; padding: 3px 2px; }
  .goal-canvas-shell .tui-stage { min-height: 0; padding: 5px 0 0; gap: 8px; }
  .goal-canvas-shell .tui-terminal { min-height: 100px; }
  .goal-canvas-shell .tui-pane:has([data-tui-empty]:not([hidden])) .tui-chrome-actions { display:none; }
  .goal-canvas-shell .tui-empty [data-tui-empty-add] { display:inline-flex; align-items:center; gap:7px; margin-top:10px; min-height:36px; padding:0 14px; border:1px solid var(--terminal-ink); border-radius:7px; background:var(--terminal-ink); color:var(--terminal); font:inherit; font-size:13px; font-weight: 400; cursor:pointer; }
  .goal-canvas-shell .tui-empty [data-tui-empty-add] svg { width:14px; height:14px; }
  .goal-canvas-shell .tui-empty [data-tui-empty-add]:hover { filter:brightness(.92); }
  .goal-canvas-shell .tui-empty [data-tui-empty-add]:focus-visible { outline:2px solid var(--terminal); outline-offset:-2px; }
  @media (max-width:760px) { .goal-canvas-shell .tui-empty [data-tui-empty-add] { min-height:44px; } }
  .goal-canvas-shell .tui-empty { min-height: 0; overflow: auto; align-content: center; padding: 24px; }
  .goal-canvas-shell .goal-event-document .timeline-pane { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; width: 100%; border: 0; padding: 0 14px; overflow: hidden; background: transparent; }
  .goal-canvas-shell .stream-toolbar { min-height: 42px; padding: 8px 4px; border: 0; }
  .goal-canvas-shell .stream-toolbar h2 { font-size: 11px; font-weight: 400; }
  .goal-canvas-shell .timeline-pane [data-event-timeline] { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; }
  .goal-canvas-shell .timeline-footer { font-size: 10px; padding: 10px 4px; }
  .goal-canvas-shell .timeline-footer > span { display: none; }
  .goal-canvas-shell .timeline-item { padding: 9px 5px; font-size: 11px; }
  .goal-canvas-shell [data-timeline-item] strong { font-size: 11px; font-weight: 400; line-height: 1.65; }
  .goal-canvas-shell [data-timeline-item] small { font-size: 10px; }
  .goal-canvas-shell .event-sheet { padding: 10px 8px; font-size: 12px; line-height: 1.8; overflow-wrap: anywhere; }
  .goal-canvas-shell .event-sheet .event > h2, .goal-canvas-shell .event-sheet .event > header h2 { margin: 6px 0 12px; font-size: 16px; font-weight: 400; line-height: 1.5; letter-spacing: -.01em; }
  .goal-canvas-shell .goal-event-document .detail-pane { display: none !important; }
  .goal-canvas-shell .goal-event-document.is-editing-goal .detail-pane { display: flex !important; position: absolute; inset: 0; z-index: 6; width: auto; min-width: 0; overflow: hidden; background: var(--paper); border: 0; }
  .goal-canvas-shell .goal-event-document.is-editing-goal .reader, .goal-canvas-shell .goal-event-document.is-editing-goal .event-form { min-height: 0; overflow: auto; overscroll-behavior: contain; }
  .goal-canvas-shell .is-editing-goal .detail-toolbar { flex: none; padding: 12px 20px; }
  .goal-canvas-shell .is-editing-goal .detail-toolbar > :not([data-event-back]), .goal-canvas-shell .is-editing-goal .reader-header [data-event-back] { display: none; }
  .goal-canvas-shell .goal-event-document.is-editing-goal .detail-pane > .event-sheet { display: none; }
  .goal-canvas-shell :focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
  .goal-canvas-shell ::selection { background: var(--blue-soft); color: var(--ink); }
  .goal-canvas-shell :is(input, textarea) { caret-color: var(--blue); }
  .goal-canvas-shell :is(.goal-info-body, [data-event-timeline], .reader-content, .event-form) { scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
  @container goal-workspace (max-width: 839px) {
    .goal-node-workbench { grid-template-columns: minmax(0, 1fr); }
    .goal-details-aside { grid-area: 1 / 1; position: absolute; inset: 0 0 0 auto; width: min(330px, 100%); z-index: 5; background: var(--paper); box-shadow: none; }
    .goal-node-workspace[data-details-open="false"] .goal-details-aside { width: 32px; }
    .goal-details-aside:has(.is-editing-goal) { inset: 0; width: auto; }
    .goal-node-toolbar { min-height: 48px; padding: 6px 12px; gap: 8px; }
    .goal-node-heading > span { display: none; }
    .goal-node-heading h1 { font-size: 14px; }
    .goal-work-modebar { padding: 8px 14px; }
  }
  /* Archive/read-only documents share the integrated timeline, without a terminal frame. */
  .document-pane:not(.goal-canvas-shell .document-pane) .goal-event-document { position: relative; container-type: normal; }
  .document-pane:not(.goal-canvas-shell .document-pane) .goal-layout { display: flex; flex-direction: column; }
  .document-pane:not(.goal-canvas-shell .document-pane) .timeline-pane { flex: 1; border: 0; }
  .document-pane:not(.goal-canvas-shell .document-pane) .is-editing-goal .detail-pane { display: flex !important; position: absolute; inset: 0; z-index: 4; }
  @media (max-width: 600px) {
    .goal-node-workspace { inset: 0; border-radius: 0; }
    .goal-work-main .tui-pane { padding: 0 10px 10px; }
    .goal-canvas-tools { justify-content: flex-end; }
    .goal-canvas-node { width: 240px; }
    .goal-node-toolbar button, .goal-work-modebar button, .goal-details-toggle { min-height: 36px; }
    .goal-canvas-shell .event-form :is(input, textarea, select) { font-size: 16px; }
  }
  .goal-frame-surface { position: absolute; inset: 0; overflow: hidden; background: var(--canvas); }
  .goal-frame-canvas { position: absolute; inset: 0; overflow: hidden; touch-action: none; cursor: grab; background-color: var(--canvas); background-image: radial-gradient(circle, color-mix(in srgb, var(--muted) 36%, transparent) .9px, transparent 1px); background-size: 22px 22px; }
  .goal-frame-canvas.is-panning { cursor: grabbing; user-select: none; }
  .goal-frame-canvas.is-drop { background-color: color-mix(in srgb, var(--blue-soft) 42%, var(--canvas)); }
  .goal-frame-canvas.is-reject { background-color: color-mix(in srgb, var(--amber) 8%, var(--canvas)); }
  .goal-frame-world { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; }
  .frame-block { position: absolute; width: 232px; min-height: 0; padding: 16px 16px 12px; display: flex; flex-direction: column; gap: 10px; background: var(--paper); border: 1px solid var(--line); border-radius: 12px; text-align: left; cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; }
  .frame-block:hover { border-color: color-mix(in srgb, var(--ink) 20%, var(--line)); }
  .frame-block-handle { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 8px; cursor: grab; }
  .frame-block-kind { display: block; font-size: 11px; font-weight: 400; color: var(--muted); }
  .frame-block-handle strong { display: block; font-size: 12px; font-weight: 400; letter-spacing: -.01em; color: color-mix(in srgb, var(--ink) 70%, var(--muted)); overflow-wrap: anywhere; }
  .frame-block > p { margin: 0; font-size: 13.5px; color: var(--ink); line-height: 1.5; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
  .frame-block-close { display: none; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer; align-items: center; justify-content: center; }
  .frame-block-close svg { width: 14px; height: 14px; }
  .frame-block-body { display: none; }
  .frame-block.is-expanded { width: min(380px, 78vw); height: auto; max-height: 420px; z-index: 3; cursor: default; padding-bottom: 14px; }
  .frame-block.is-expanded .frame-block-close { display: inline-flex; }
  .frame-block.is-expanded .frame-block-handle strong { font-size: 16px; font-weight: 400; color: var(--ink); letter-spacing: -.018em; }
  .frame-block.is-expanded > p, .frame-block.is-expanded .frame-block-kind { display: none; }
  .frame-block.is-expanded .frame-block-body { display: block; flex: 1; min-height: 0; overflow: auto; margin: 0; touch-action: pan-y; color: var(--ink); font-size: 13px; line-height: 1.55; user-select: text; -webkit-user-select: text; cursor: auto; }
  .frame-block .frame-reading > h2 { display: none; }
  .frame-block-status, .frame-block-note { margin: 0 0 10px; color: var(--muted); font-size: 12px; }
  .frame-block-body button[data-frame-block-retry] { margin-top: 8px; }
  .frame-reading { display: grid; gap: 12px; }
  .frame-reading h2 { margin: 0; font-size: 15px; font-weight: 400; letter-spacing: -.015em; line-height: 1.35; overflow-wrap: anywhere; }
  .frame-reading-meta { margin: 0; font-size: 12px; color: var(--muted); line-height: 1.5; }
  .frame-reading .feed-rich-content { font-size: 13.5px; line-height: 1.6; overflow-wrap: anywhere; }
  .frame-reading .feed-rich-content p { margin: 0 0 .7em; }
  .frame-reading .feed-rich-content p:last-child { margin-bottom: 0; }
  .frame-reading-link { margin: 0; font-size: 12px; }
  .frame-reading-link a { color: var(--blue-dark); text-underline-offset: 3px; }
  .frame-reading dl { display: grid; gap: 10px; margin: 0; }
  .frame-reading dl > div { display: grid; gap: 2px; }
  .frame-reading dt { color: var(--muted); font-size: 11px; font-weight: 400; }
  .frame-reading dd { margin: 0; font-size: 13.5px; overflow-wrap: anywhere; }
  .frame-reading .artifact-facts { display: grid; gap: 8px; margin: 0; font-size: 13.5px; line-height: 1.6; }
  .frame-reading .artifact-facts p { margin: 0; }
  .frame-session-events { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
  .frame-session-events li { display: grid; gap: 4px; padding: 0; border: 0; }
  .frame-session-events strong { font-size: 11px; font-weight: 400; color: var(--muted); }
  .frame-session-events span { overflow-wrap: anywhere; }
  .goal-frame-tools { z-index: 6; }
  @media (prefers-reduced-motion: no-preference) {
    .goal-node-workspace:not([hidden]) { animation: immersive-goal-open .2s cubic-bezier(.16, 1, .3, 1); }
    @keyframes immersive-goal-open { from { opacity: .8; } to { opacity: 1; } }
  }

  .goal-frame-surface { display:flex; flex-direction:column; }
  .frame-goal-summary { position:relative; z-index:2; flex:none; padding:16px 20px 14px; background:var(--paper); border-bottom:1px solid var(--line); }
  .frame-goal-heading { display:flex; align-items:baseline; gap:12px; }
  .frame-goal-heading h1 { margin:0; font-size:20px; line-height:1.4; font-weight: 400; overflow-wrap:anywhere; }
  .frame-goal-heading > span { flex:none; font-size:12px; color:var(--muted); }
  .frame-goal-summary > p { max-width:76ch; margin:6px 0 12px; color:var(--ink-soft); font-size:13px; line-height:1.7; }
  .frame-goal-actions { display:flex; flex-wrap:wrap; gap:8px; }
  [data-frame-goal-status],
  [data-workspace-goal-status] { display:inline-flex; gap:5px; align-items:center; min-height: 18px; padding: 1px 7px; border: 0; border-radius: 5px; background: color-mix(in srgb, var(--goal-status-tone, var(--muted)) 11%, transparent); color: var(--goal-status-tone, var(--ink-soft)); font-size: 11px; font-weight: 400; }
  [data-frame-goal-status] svg,
  [data-workspace-goal-status] svg { width: 12px; height: 12px; }
  .frame-goal-actions svg { width:14px; height:14px; }
  .goal-frame-surface > .goal-frame-canvas { position:relative; inset:auto; flex:1; min-height:0; }
  .frame-empty { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:12px; padding:32px; text-align:center; pointer-events:none; }
  .frame-empty .mw-btn { pointer-events:auto; }
  .frame-block:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
  .frame-picker { width:min(560px, calc(100vw - 32px)); max-height:calc(100dvh - 48px); padding:0; border:1px solid var(--line-strong); border-radius:12px; background:var(--paper); color:var(--ink); box-shadow:var(--surface-shadow); }
  .frame-picker[open] { display:flex; flex-direction:column; }
  .frame-picker::backdrop { background:rgb(0 0 0 / .4); }
  .frame-picker > header, .frame-picker > footer { display:flex; align-items:center; justify-content:space-between; gap:16px; flex:none; padding:16px 20px; }
  .frame-picker > header h2 { margin:0; font-size:16px; }
  .frame-picker > header button { width:32px; height:32px; }
  .frame-picker-tools { display:flex; gap:8px; padding:0 20px 16px; flex:none; border-bottom:1px solid var(--line); }
  .frame-picker-tools :is(input,select) { font:inherit; font-size:13px; }
  .frame-picker footer button { font:inherit; font-size:13px; cursor:pointer; }
  .frame-picker-tools input { min-width:0; flex:1; }
  .frame-picker-tools select { max-width:130px; }
  .frame-picker-list { min-height:0; overflow:auto; overscroll-behavior:contain; padding:8px; }
  .frame-picker-list > button { width:100%; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:4px 12px; padding:12px; border:0; border-radius:6px; background:transparent; color:var(--ink); text-align:left; cursor:pointer; }
  .frame-picker-list > button:hover:not(:disabled) { background:var(--nav-hover); }
  .frame-picker-list strong { font-size:13px; font-weight: 400; overflow-wrap:anywhere; }
  .frame-picker-list small { grid-column:1; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .frame-picker-list button > span { grid-column:2; grid-row:1 / 3; align-self:center; color:var(--muted); font-size:12px; }
  .frame-picker > footer { border-top:1px solid var(--line); }
  .frame-picker > footer > span { color:var(--muted); font-size:12px; line-height:1.5; }
  @media (max-width:760px) { .frame-picker > header button, .frame-picker > footer button { min-width:44px; min-height:44px; } .frame-picker-tools :is(input,select) { min-height:44px; font-size:16px; } }
  .frame-empty strong { font-size:15px; font-weight: 400; color:var(--ink); }
  .frame-empty p { max-width:36ch; margin:0; color:var(--ink-soft); font-size:13px; line-height:1.6; }
  @media(max-width:760px) { .frame-goal-summary { padding:20px 16px; } .frame-goal-heading { align-items:flex-start; flex-direction:column; gap:4px; } .frame-goal-heading h1 { font-size:20px; } .frame-goal-actions button { min-height:44px; } }
`;
