/** Shared plugin stage master-detail: full list, then --tree-width + detail. */
export const PLUGIN_STAGE_STYLES = `
  .immersive-plugin-stage > .plugin-stage-shell,
  .tab-pane-body > .plugin-stage-shell {
    position: absolute; inset: 0; min-width: 0; min-height: 0; overflow: hidden;
    padding: 0; background: var(--paper);
  }
  .plugin-stage-shell [hidden] { display: none !important; }
  .plugin-stage-list {
    position: absolute; inset: 0; z-index: 0; overflow: auto; overscroll-behavior: contain;
    padding: 60px 24px 32px; background: var(--paper);
    .goal-collection-fold {
      margin: 0 0 12px; border: 0;
      > summary {
        display: flex; align-items: center; gap: 8px; height: 32px; min-height: 32px;
        padding: 0 8px; border-radius: 8px; color: var(--ink-soft); list-style: none; cursor: pointer;
        &::-webkit-details-marker, &::marker { display: none; }
        &:hover { color: var(--ink); background: var(--nav-hover); }
        strong { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: var(--weight-control, 500); }
        small { font-size: 11px; font-variant-numeric: tabular-nums; color: var(--faint); }
      }
      &:not([open]) > summary .goal-collection-caret svg { transform: rotate(-90deg); }
    }
    .goal-collection-caret { display: grid; place-items: center; width: 16px; height: 16px; color: var(--muted); svg { width: 12px; height: 12px; transition: transform 250ms var(--ease-quint); } }
    .goal-collection-mark {
      display: grid; place-items: center; width: 16px; height: 16px; color: var(--tone-idle, var(--muted));
      svg { width: 14px; height: 14px; }
      &.is-ready { color: var(--tone-done, var(--green)); }
      &.is-attention { color: var(--tone-attention, var(--amber)); }
    }
    .goal-collection-empty { margin: 0; padding: 8px 8px 12px 24px; font-size: 12px; color: var(--muted); }
    a:is(.feed-stage-entry, .directory-list-row) { color: inherit; text-decoration: none; }
    .mw-empty {
      padding: 24px 8px 16px; max-width: min(100%, 38em);
      > strong { font-size: 17px; font-weight: 500; line-height: 1.4; letter-spacing: -.02em; }
      > p { font-size: 13px; line-height: 1.75; }
      > .mw-btn { margin-top: 12px; width: fit-content; }
    }
  }
  .plugin-stage-chrome {
    position: absolute; top: 18px; left: 24px; z-index: 20;
    display: flex; align-items: center; gap: 8px; flex-wrap: nowrap;
    width: max-content; max-width: calc(100% - 40px);
    background: transparent; isolation: isolate; pointer-events: auto;
    .tree-create svg { width: 14px; height: 14px; }
  }
  .plugin-stage-chrome .tree-create,
  body.immersive-workbench .plugin-stage-chrome .tree-create { flex: none; width: auto; }
  body.immersive-workbench .plugin-stage-list .goal-collection-fold .feed-stage-entry { padding-left: 24px; }
  body.immersive-workbench .plugin-stage-list .goal-collection-fold > :is(.mw-dir-row, a.mw-dir-row) { padding-left: 24px; }
  body.immersive-workbench .plugin-stage-list :is(.mw-dir-row.is-selected, .mw-dir-row[aria-current="page"], .directory-list-row.is-selected, .feed-stage-entry:is(.is-selected, .is-open, [aria-selected="true"])) {
    background: var(--nav-active); color: var(--ink);
  }
  body.immersive-workbench .plugin-stage-list .mw-dir-row-wrap:has(.is-selected),
  body.immersive-workbench .plugin-stage-list .mw-dir-row-wrap:has([aria-current="page"]) {
    background: var(--nav-active);
  }
  body.immersive-workbench .plugin-stage-list :is(.mw-dir-row.is-selected, .mw-dir-row[aria-current="page"], .directory-list-row.is-selected)::before,
  body.immersive-workbench .plugin-stage-list .mw-dir-row-wrap:has(.is-selected)::before,
  body.immersive-workbench .plugin-stage-list .mw-dir-row-wrap:has([aria-current="page"])::before {
    content: none; display: none; width: 0;
  }
  body.immersive-workbench .plugin-stage-list .feed-stage-entry:has(.plugin-stage-kind) {
    grid-template-columns: minmax(12rem, 1.2fr) 4.75rem 7.5rem minmax(10rem, 1fr) 4.5rem;
  }
  .plugin-stage-kind,
  .plugin-stage-fact,
  .plugin-stage-meta,
  body.immersive-workbench .plugin-stage-list .feed-stage-entry:has(.plugin-stage-kind) .feed-entry-status {
    justify-self: start; max-width: 100%;
  }
  body.immersive-workbench .plugin-stage-list .feed-stage-entry:has(.plugin-stage-kind) .feed-entry-status {
    min-height: 0; padding: 0; background: transparent; border-radius: 0;
  }
  /* A kind is not a state: kind chips stay neutral, the words tell them apart. */
  .plugin-stage-kind[data-kind] { --status-tone: var(--ink-soft); }
  .plugin-stage-fact, .plugin-stage-meta {
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-size: 11px; line-height: 18px;
  }
  .plugin-stage-fact { color: var(--ink-soft); }
  .plugin-stage-meta { color: var(--muted); }
  .plugin-stage-workspace {
    position: relative; min-width: 0; min-height: 0; height: 100%; overflow: auto; overscroll-behavior: contain; display: flex; flex-direction: column; background: var(--paper);
    > :is(.feed-stage-detail, .feed-detail, .inbox-reference-detail, .shelf-stage) { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  }
  .plugin-stage-workspace > .artifact-detail,
  .plugin-stage-workspace > [data-artifact-detail] { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  .plugin-stage-workspace > [data-artifact-detail] .artifact-detail {
    flex: 1; min-width: 0; min-height: 0; height: auto; max-width: none; margin: 0;
    display: flex; flex-direction: column; overflow: hidden;
  }
  .plugin-stage-back {
    display: grid; place-items: center; width: 30px; height: 30px; padding: 0; flex: none;
    margin-left: -8px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer;
    &:hover { background: var(--nav-hover); color: var(--ink); }
    svg { width: 16px; height: 16px; transform: rotate(180deg); }
  }
  .plugin-stage-detail-bar {
    display: flex; align-items: center; gap: 8px; flex: none;
    min-height: 48px; padding: 8px 16px 8px 24px;
    > .feed-detail-kicker { margin: 0; flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    > h1 { margin: 0; flex: 1; min-width: 0; font-size: 13px; font-weight: var(--weight-title, 600); line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    > span { flex: none; color: var(--muted); font-size: 12px; }
    > .form-tabs { margin-left: auto; }
    > .mw-btn:not(.plugin-stage-back) { flex: none; }
    > :is(h1, span) + .mw-btn { margin-left: auto; }
    > .form-tabs + .mw-btn { margin-left: 0; }
    :is([data-dataset-delete], [data-form-delete], [data-pages-delete], [data-ppt-delete], [data-functions-delete], [data-lingguang-discard-current], [data-alchemist-delete]) {
      color: var(--red);
      &:hover { background: color-mix(in srgb, var(--red) 8%, transparent); color: var(--red); }
    }
    &[data-stage-back-only] {
      position: absolute; top: 0; left: 0; right: 0; z-index: 4;
      min-height: 32px; height: 32px; pointer-events: none; background: transparent;
      .plugin-stage-back { pointer-events: auto; }
    }
  }
  .artifact-detail > .plugin-stage-detail-bar { border-bottom: 1px solid var(--line); }
  body.immersive-workbench .plugin-stage-detail-bar > .feed-detail-kicker { margin: 0; }
  .feed-stage-detail, .inbox-reference-detail { position: relative; }
  .feed-stage-detail > .plugin-stage-detail-bar[data-stage-back-only] + .feed-stage-item-detail {
    .feed-detail-header { padding-top: 4px; }
    /* The kicker shares the back button's row, so it starts after the button like a breadcrumb. */
    .feed-detail-kicker { margin-left: 16px; }
  }
  @media (max-width: 760px) {
    .plugin-stage-list { padding-top: 72px; }
    .plugin-stage-shell :is(.feed-stage-search, .feed-stage-count) { display: none; }
    .plugin-stage-shell[data-expanded="true"] {
      :is(.plugin-stage-chrome, .plugin-stage-list) { display: none !important; }
      .plugin-stage-workspace { position: absolute; inset: 0; display: flex; flex-direction: column; }
    }
    body.immersive-workbench .plugin-stage-list .feed-stage-entry:has(.plugin-stage-kind) {
      grid-template-columns: minmax(0, 1fr) max-content max-content;
    }
    body.immersive-workbench .plugin-stage-list :is(.plugin-stage-fact, .plugin-stage-meta) { display: none; }
  }
  @media (min-width: 761px) {
    body.immersive-workbench .plugin-stage-shell[data-expanded="true"] {
      display: grid; grid-template-columns: var(--tree-width, var(--immersive-sidebar-width)) minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr); overflow: hidden; padding: 0;
      .plugin-stage-list {
        display: block; position: relative; inset: auto; z-index: 4;
        min-width: 0; min-height: 0; width: var(--tree-width, var(--immersive-sidebar-width)); height: auto; overflow: auto;
        border-right: 1px solid var(--line); padding: 52px 8px 24px; box-sizing: border-box;
        grid-column: 1; grid-row: 1;
      }
      .plugin-stage-workspace {
        position: relative; inset: auto; z-index: 3;
        min-width: 0; min-height: 0; width: auto; height: auto;
        display: flex; flex-direction: column; overflow: hidden;
        grid-column: 2; grid-row: 1;
      }
      .plugin-stage-chrome { visibility: inherit; }
      .feed-stage-entry { grid-template-columns: minmax(0, 1fr) auto; > time { display: none; } }
      :is(.feed-entry-source, .plugin-stage-fact, .plugin-stage-meta) { display: none; }
    }
    body.immersive-workbench .plugin-stage-shell[data-expanded="true"] .feed-stage-entry:has(.plugin-stage-kind) {
      grid-template-columns: minmax(0, 1fr) max-content max-content;
    }
  }
  /* The side panel takes its width from the stage, not from the window: a wide window with the panel open can leave the
     stage too narrow for the list beside an open record. Then the record takes the whole stage, as on a phone. */
  @container plugin-stage (max-width: 600px) {
    body.immersive-workbench .plugin-stage-shell[data-expanded="true"] {
      display: block;
      :is(.plugin-stage-chrome, .plugin-stage-list) { display: none !important; }
      .plugin-stage-workspace { position: absolute; inset: 0; display: flex; flex-direction: column; grid-column: auto; grid-row: auto; }
    }
  }
  .plugin-stage-more {
    position: relative; flex: none;
    > summary { list-style: none; cursor: pointer; gap: 4px; &::-webkit-details-marker { display: none; } }
    &[open] > summary { background: var(--nav-hover); }
  }
  .plugin-stage-more-actions {
    position: absolute; top: calc(100% + 6px); right: 0; z-index: 40; display: grid; min-width: 160px; max-height: min(300px, 60dvh); overflow: auto; padding: 4px; border: 1px solid var(--line); border-radius: 10px; background: var(--paper);
    > .mw-btn { width: 100%; justify-content: flex-start; margin: 0; min-height: 34px; }
  }
  [data-lingguang-save-status] { color: var(--muted); font-size: 12px; &[data-failed=true] { color: var(--red); } }
  @media(max-width: 600px) {
    .plugin-stage-list .mw-empty { padding-top: 24px; }
    .plugin-stage-more-actions > .mw-btn { min-height: 44px; }
    .plugin-stage-more > summary { min-height: 40px; }
    [data-lingguang-save-status] { order: 2; flex-basis: 100%; }
  }
`;

/** Layered plugin-frame stage rules: drops outer-shell prefixes and shell-only artifact-detail rules while preserving [hidden] and narrow-stage list visibility guards (102-1). */
export const PLUGIN_STAGE_LAYER_STYLES = PLUGIN_STAGE_STYLES
  .replace(".immersive-plugin-stage > .plugin-stage-shell,\n  .tab-pane-body > .plugin-stage-shell {", "body > .plugin-stage-shell {")
  .replaceAll("body.immersive-workbench ", "")
  .replaceAll(".plugin-stage-chrome .tree-create,\n  .plugin-stage-chrome .tree-create", ".plugin-stage-chrome .tree-create")
  .replace(/  \.plugin-stage-workspace > \.artifact-detail,[\s\S]*?\}\n/, "")
  .replace(/  \.plugin-stage-workspace > \[data-artifact-detail\] \.artifact-detail \{[\s\S]*?\}\n/, "")
  .replace("  .artifact-detail > .plugin-stage-detail-bar { border-bottom: 1px solid var(--line); }\n", "");
