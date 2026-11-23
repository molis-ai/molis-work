/** Directory density belongs to the immersive shell; plugin detail surfaces keep their own layout. */
export const IMMERSIVE_DIRECTORY_STYLES = `
  body.immersive-workbench .tree-resizer {
    display: block;
    grid-column: 2; grid-row: 2; justify-self: end; align-self: stretch;
    width: 8px; margin-right: -4px; z-index: 25; background: transparent;
  }
  body.immersive-workbench .tree-resizer::before { inset: 0; }
  body.immersive-workbench .tree-resizer::after { inset: 0 auto 0 3px; background: transparent; }
  body.immersive-workbench .tree-resizer:is(:hover, :focus-visible, .is-dragging)::after { width: 2px; background: var(--blue); }
  body.immersive-workbench .is-directory-collapsed > .tree-resizer,
  body.immersive-workbench .is-plugin-directory-empty > .tree-resizer { display: none; }
  body.immersive-workbench .immersive-workspace.is-tree-resizing { cursor: col-resize; user-select: none; }

  body.immersive-workbench .tree-pane .tree-row { min-height: 28px; padding: 0; align-items: center; }
  body.immersive-workbench .tree-pane .tree-entry { min-height: 28px; height: 28px; box-shadow: none; }
  body.immersive-workbench .tree-pane .tree-entry:hover { background: var(--nav-hover); }
  body.immersive-workbench .tree-pane .tree-node { display: block; min-width: 0; height: 28px; min-height: 28px; padding: 0 4px; box-shadow: none; text-align: left; }
  body.immersive-workbench .tree-pane .tree-node:is(:hover, .is-selected) { background: transparent; box-shadow: none; }
  body.immersive-workbench .tree-pane .tree-copy { min-width: 0; display: block; overflow: hidden; }
  body.immersive-workbench .tree-pane .tree-title-line { display: block; min-width: 0; }
  body.immersive-workbench .tree-pane .tree-title-line strong { display: block; font-size: 13px; font-weight: var(--weight-control, 500); line-height: 18px; letter-spacing: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.immersive-workbench .tree-pane .tree-toggle,
  body.immersive-workbench .tree-pane .tree-guide { width: 16px; height: 28px; min-height: 28px; flex: 0 0 16px; }
  body.immersive-workbench .tree-pane .tree-children { margin-left: 8px; padding-left: 8px; }
  body.immersive-workbench .tree-pane .tree-entry > .directory-row-state { display: inline-flex; align-items: center; flex: none; width: auto; height: 22px; min-height: 0; margin: 0 4px 0 0; padding: 0; border: 0; border-radius: 0; background: transparent; }
  body.immersive-workbench .tree-pane .tree-entry .mw-object-status { padding: 0; border: 0; background: transparent; box-shadow: none; gap: 4px; font-size: 12px; line-height: 18px; white-space: nowrap; }
  body.immersive-workbench .tree-pane .tree-entry .mw-object-status > span { position: static; width: auto; height: auto; overflow: visible; clip-path: none; }


  body.immersive-workbench .tree-pane [data-directory-list-actions] { position: static; display: flex; align-items: center; justify-content: flex-start; flex-wrap: nowrap; gap: 4px; margin: 0; padding: 0 8px; background: transparent; border: 0; width: 100%; box-sizing: border-box; }
  body.immersive-workbench .tree-pane .mw-collection-fold { margin: 0; border-top: 0; }
  body.immersive-workbench .tree-pane .mw-collection-fold > summary { height: var(--dir-row-h, 28px); min-height: var(--dir-row-h, 28px); padding: 0 4px; border-radius: 5px; color: var(--muted); }
  body.immersive-workbench .tree-pane .mw-collection-fold > summary:hover { color: var(--ink); background: var(--nav-hover); }
  body.immersive-workbench .tree-pane .mw-collection-fold > summary[aria-current="page"] { color: var(--ink); }
  body.immersive-workbench .tree-pane .mw-collection-fold > summary strong { font-size: 11px; font-weight: var(--weight-control, 500); }
  body.immersive-workbench .tree-pane .mw-collection-empty { padding: 4px 8px 8px 24px; font-size: 11px; }
  body.immersive-workbench .tree-pane .mw-collection-fold .mw-tree { padding-inline-start: 16px; }
  body.immersive-workbench .tree-pane .mw-collection-fold > .mw-collection-empty { padding: 4px 8px 8px 24px; }
  body.immersive-workbench .tree-pane .tree-filter-control { position: static; }
  body.immersive-workbench .tree-pane .tree-tool:hover { color: var(--ink); background: var(--nav-active); }
  body.immersive-workbench .tree-pane .tree-tool[aria-expanded="true"],
  body.immersive-workbench .tree-pane .tree-tool.is-active { background: var(--nav-active); color: var(--ink); }
  body.immersive-workbench .tree-pane .tree-filter {
    position: absolute; top: calc(var(--dir-row-h, 28px) + var(--control-h, 28px) + 4px); left: 8px; right: 8px; bottom: auto; z-index: 30;
    width: auto; max-width: none; min-width: 0; max-height: min(280px, 42vh); box-sizing: border-box;
    margin: 0; padding: 12px; border: 0; border-radius: 8px; background: var(--paper); color: var(--ink);
    box-shadow: var(--lift-3); overflow: auto;
  }

  body.immersive-workbench .tree-pane :is(.tree-scroll, .mw-dir__list, .mw-dir__body, [data-artifact-directory]) { min-height: 0; height: auto; overflow: visible; padding: 0; }
  body.immersive-workbench .tree-pane .artifact-empty { flex: none; margin: 0; padding: 16px 8px; border: 0; border-radius: 0; background: transparent; display: grid; align-content: start; justify-items: start; gap: 8px; color: var(--muted); text-align: left; }
  body.immersive-workbench .tree-pane p.artifact-empty { max-width: 32ch; margin: 0; font-size: 11px; line-height: 1.6; }

  body.immersive-workbench .tree-pane :is(.tree-footer, [data-tree-footer]) { display: none !important; }
  body.immersive-workbench .tree-pane .artifact-version-list .mw-dir-row,
  body.immersive-workbench .plugin-stage-list .artifact-version-list .mw-stage-entry { width: 100%; }

  body.immersive-workbench .mw-stage-tree { display: flex; flex-direction: column; gap: 4px; width: 100%; min-width: 0; flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; padding: 8px clamp(16px, 3vw, 40px) 24px; }
  body.immersive-workbench .mw-stage-list { width: 100%; min-width: 0; max-width: 1104px; margin-inline: auto; padding-top: 8px; }
  body.immersive-workbench .plugin-stage-shell > .mw-stage-list { max-width: none; margin-inline: 0; }
  body.immersive-workbench .mw-stage-list .mw-collection-fold { margin: 0 0 12px; border: 0; }
  body.immersive-workbench .mw-stage-list .mw-collection-fold > summary {
    display: flex; align-items: center; gap: 8px; height: 32px; min-height: 32px; padding: 0 8px;
    border-radius: 6px; color: var(--muted); list-style: none; cursor: pointer;
  }
  body.immersive-workbench .mw-stage-list .mw-collection-fold > summary:hover { color: var(--ink); background: var(--nav-hover); }
  body.immersive-workbench .mw-stage-list .mw-collection-fold > summary strong {
    flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-size: 12px; font-weight: var(--weight-control, 500);
  }
  body.immersive-workbench .mw-stage-list .mw-collection-fold > summary small { font-size: 11px; font-variant-numeric: tabular-nums; color: var(--faint); }
  body.immersive-workbench .mw-stage-list .mw-collection-empty { margin: 0; padding: 8px 8px 12px 24px; font-size: 12px; color: var(--muted); }
  body.immersive-workbench .mw-stage-item { width: 100%; min-width: 0; border: 0; border-radius: 0; }
  body.immersive-workbench .mw-stage-item.is-open { margin-block: 0; border: 0; background: transparent; }
  body.immersive-workbench .mw-stage-entry {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(7rem, 12rem) max-content max-content;
    grid-template-rows: 28px;
    column-gap: 12px;
    align-items: center;
    width: 100%; min-width: 0; height: 28px; min-height: 28px; padding: 0 8px; box-sizing: border-box;
    border: 0; border-radius: 6px; background: transparent; box-shadow: none; color: var(--ink); text-align: left; cursor: pointer; overflow: visible;
  }
  body.immersive-workbench .mw-stage-entry:hover { background: var(--nav-hover); }
  body.immersive-workbench .mw-stage-entry:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
  body.immersive-workbench .mw-stage-entry:is(.is-selected, .is-open, [aria-expanded="true"]) { background: var(--nav-active); }
  body.immersive-workbench .mw-stage-item.is-open .mw-stage-entry { height: 28px; min-height: 28px; padding: 0 8px; }
  body.immersive-workbench .mw-stage-leading { display: flex; align-items: center; gap: 8px; min-width: 0; grid-column: 1; overflow: hidden; }
  body.immersive-workbench .mw-stage-leading strong { flex: 1; min-width: 0; font-size: 13px; font-weight: var(--weight-control, 500); line-height: 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.immersive-workbench .mw-entry-source,
  body.immersive-workbench .mw-stage-entry > time { min-width: 0; color: var(--muted); font-size: 11px; line-height: 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.immersive-workbench .mw-stage-entry > time { font-variant-numeric: tabular-nums; }
  body.immersive-workbench .mw-stage-entry .mw-entry-status { flex: none; min-width: 0; justify-self: end; overflow: visible; }
  body.immersive-workbench .mw-stage-entry .mw-entry-status > span { overflow: visible; text-overflow: clip; }
  @media (max-width: 600px) {
    body.immersive-workbench .tree-resizer { display: none; }
    body.immersive-workbench .directory-content-scroll { padding-right: 0; }
    body.immersive-workbench .tree-pane .tree-node,
    body.immersive-workbench .tree-pane .tree-toggle { height: 40px; min-height: 40px; }
    body.immersive-workbench .tree-pane .tree-tool { width: 36px; height: 40px; min-height: 40px; }
  }
  @media (max-width: 760px) {
    body.immersive-workbench .mw-stage-entry {
      height: auto; min-height: 44px; padding: 8px 12px;
      grid-template-columns: minmax(0, 1fr) max-content;
      grid-template-rows: auto;
    }
    body.immersive-workbench .mw-entry-source,
    body.immersive-workbench .mw-stage-entry > time { display: none; }
  }

  body.immersive-workbench .runtime-plan-dialog { width: min(680px, calc(100vw - 28px)); max-height: min(760px, calc(100dvh - 28px)); padding: 0; border: 1px solid var(--line); border-radius: 12px; color: var(--ink); background: var(--paper); box-shadow: var(--lift-3); }
  body.immersive-workbench .runtime-plan-dialog::backdrop { background: var(--scrim); }
  body.immersive-workbench .runtime-plan-shell { max-height: min(760px, calc(100dvh - 28px)); display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
  body.immersive-workbench .runtime-plan-shell > header { padding: 16px 16px 16px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; gap: 12px; }
  body.immersive-workbench .runtime-plan-shell h2 { margin: 0; font-size: 15px; }
  body.immersive-workbench .runtime-plan-shell header p { margin: 4px 0 0; color: var(--muted); }
  body.immersive-workbench .runtime-plan-body { min-height: 0; overflow: auto; padding: 16px 16px; }
  body.immersive-workbench .runtime-change-list { list-style: none; margin: 0; padding: 0; }
  body.immersive-workbench .runtime-change-list li { padding: 12px 0; border-bottom: 1px solid var(--line); display: grid; gap: 4px; }
  body.immersive-workbench .runtime-plan-shell > footer { padding: 12px 16px; border-top: 1px solid var(--line); display: flex; justify-content: flex-end; gap: 8px; }
  body.immersive-workbench .runtime-plan-shell > footer .runtime-plan-apply:disabled { opacity: .55; cursor: not-allowed; }
  body.immersive-workbench .runtime-plan-confirm { margin-top: 12px; padding: 12px; display: flex; gap: 8px; cursor: pointer; }
`;
