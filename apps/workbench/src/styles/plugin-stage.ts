/** Shared plugin stage: the list fills it; an open record takes it whole. */
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
    a:is(.mw-stage-entry, .directory-list-row) { color: inherit; text-decoration: none; }
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
  body.immersive-workbench .plugin-stage-list .goal-collection-fold .mw-stage-entry { padding-left: 24px; }
  body.immersive-workbench .plugin-stage-list .goal-collection-fold > :is(.mw-dir-row, a.mw-dir-row) { padding-left: 24px; }
  body.immersive-workbench .plugin-stage-list .mw-dir-row-wrap:has(.is-selected)::before,
  body.immersive-workbench .plugin-stage-list :is(.mw-dir-row.is-selected, .mw-dir-row[aria-current="page"], .directory-list-row.is-selected, .mw-dir-row-wrap:has([aria-current="page"]))::before {
    content: none; display: none; width: 0;
  }
  body.immersive-workbench .plugin-stage-list {
    :is(.mw-dir-row.is-selected, .mw-dir-row[aria-current="page"], .directory-list-row.is-selected, .mw-stage-entry:is(.is-selected, .is-open, [aria-selected="true"])) {
      background: var(--nav-active); color: var(--ink);
    }
    .mw-dir-row-wrap:has(:is(.is-selected, [aria-current="page"])) { background: var(--nav-active); }
    .mw-stage-entry:has(.plugin-stage-kind) { grid-template-columns: minmax(12rem, 1.2fr) 4.75rem 7.5rem minmax(10rem, 1fr) 4.5rem; }
    .mw-stage-entry:has(.plugin-stage-kind) .mw-entry-status { justify-self: start; max-width: 100%; min-height: 0; padding: 0; background: transparent; border-radius: 0; }
  }
  .plugin-stage-kind, .plugin-stage-fact, .plugin-stage-meta { justify-self: start; max-width: 100%; }
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
    > :is(.mw-detail, .inbox-reference-detail, .shelf-stage) { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
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
    display: flex; align-items: center; gap: 8px; flex: none; flex-wrap: nowrap;
    min-height: 48px; padding: 8px 16px 8px 24px;
    > .mw-detail-kicker { margin: 0; flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    > span { flex: none; color: var(--muted); font-size: 12px; }
    > .form-tabs { margin-left: auto; }
    > .mw-btn:not(.plugin-stage-back) { flex: none; }
    > :is(h1, span) + .mw-btn { margin-left: auto; }
    > .form-tabs + .mw-btn { margin-left: 0; }
    :is([data-dataset-delete], [data-form-delete], [data-pages-delete], [data-ppt-delete], [data-functions-delete], [data-lingguang-discard-current], [data-alchemist-delete]) {
      color: var(--red);
      &:hover:not(:disabled) { background: color-mix(in srgb, var(--red) 8%, transparent); color: var(--red); }
    }
  }
  @container plugin-stage (max-width: 560px) {
    .plugin-stage-detail-bar { padding: 8px 12px 8px 16px; gap: 6px; }
  }
  .plugin-stage-detail-bar > h1 { margin: 0; flex: 1; min-width: 0; font-size: 13px; font-weight: var(--weight-title, 600); line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .plugin-stage-detail-bar[data-stage-back-only] {
    position: absolute; top: 0; left: 0; right: 0; z-index: 4;
    min-height: 32px; height: 32px; pointer-events: none; background: transparent;
    .plugin-stage-back { pointer-events: auto; }
  }
  .artifact-detail > .plugin-stage-detail-bar { border-bottom: 1px solid var(--line); }
  body.immersive-workbench .plugin-stage-detail-bar > .mw-detail-kicker { margin: 0; }
  .inbox-reference-detail { position: relative; }
  @media (max-width: 760px) {
    .plugin-stage-list { padding-top: 72px; }
    .plugin-stage-shell {
      &[data-expanded="true"] {
        :is(.plugin-stage-chrome, .plugin-stage-list) { display: none !important; }
        .plugin-stage-workspace { position: absolute; inset: 0; display: flex; flex-direction: column; }
      }
    }
    body.immersive-workbench .plugin-stage-list {
      .mw-stage-entry:has(.plugin-stage-kind) { grid-template-columns: minmax(0, 1fr) max-content max-content; }
      :is(.plugin-stage-fact, .plugin-stage-meta) { display: none; }
    }
  }
  /* An open record is its own page (specs/screen-polish §4「底栏第十三版」: 一件事一页): it takes the whole stage at every
     width, and the plugin's list is the page behind it — the back key, or the list's own tab. Nothing stands at its left. */
  body.immersive-workbench .plugin-stage-shell[data-expanded="true"] {
    display: block; overflow: hidden; padding: 0;
    :is(.plugin-stage-chrome, .plugin-stage-list) { display: none !important; }
    .plugin-stage-workspace {
      position: absolute; inset: 0; z-index: 3; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden;
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

const STAGE_ENTRY_LAYER_STYLES = `
  .mw-stage-leading strong, .mw-entry-source, .mw-stage-entry > time, .plugin-stage-fact, .plugin-stage-meta, .plugin-stage-detail-bar > h1, .plugin-stage-list .goal-collection-fold > summary strong {
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .mw-entry-source, .mw-stage-entry > time, .plugin-stage-fact, .plugin-stage-meta { font-size: 11px; line-height: 18px; }
  .mw-entry-source, .mw-stage-entry > time, .plugin-stage-meta { color: var(--muted); }
  .mw-stage-item { width: 100%; min-width: 0; }
  .mw-stage-entry {
    display: grid; grid: 28px / minmax(0, 1fr) minmax(7rem, 12rem) max-content max-content; column-gap: 12px; align-items: center;
    width: 100%; min-width: 0; height: 28px; padding: 0 8px;
    border: 0; border-radius: 6px; background: transparent; color: var(--ink); text-align: left; cursor: pointer;
    &:hover { background: var(--nav-hover); }
    &:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
    &:is(.is-selected, .is-open, [aria-expanded="true"]) { background: var(--nav-active); }
    > time { font-variant-numeric: tabular-nums; }
    .mw-entry-status { flex: none; min-width: 0; justify-self: end; > span { overflow: visible; text-overflow: clip; } }
  }
  .mw-stage-leading { display: flex; align-items: center; gap: 8px; min-width: 0; grid-column: 1; overflow: hidden; strong { flex: 1; font-size: 13px; font-weight: var(--weight-control); line-height: 18px; } }
`;

/** Structured plugin-frame stage rules: drops outer-shell prefixes and shell-only artifact-detail rules with zero regex transforms (102-1). */
export const PLUGIN_STAGE_LAYER_STYLES = STAGE_ENTRY_LAYER_STYLES + `
  body > .plugin-stage-shell { position: absolute; inset: 0; min-width: 0; min-height: 0; overflow: hidden; padding: 0; background: var(--paper); }
  .plugin-stage-shell [hidden] { display: none !important; }
  .plugin-stage-list, .plugin-stage-workspace { overflow: auto; overscroll-behavior: contain; background: var(--paper); }
  .plugin-stage-list {
    position: absolute; inset: 0; z-index: 0; padding: 60px 24px 32px;
    .goal-collection-fold {
      margin: 0 0 12px; border: 0;
      > summary {
        display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 8px; border-radius: 8px; color: var(--ink-soft); list-style: none; cursor: pointer;
        &::-webkit-details-marker, &::marker { display: none; }
        &:hover { color: var(--ink); background: var(--nav-hover); }
        strong { flex: 1; font-size: 12px; font-weight: var(--weight-control); }
        small { font-size: 11px; font-variant-numeric: tabular-nums; color: var(--faint); }
      }
      &:not([open]) > summary .goal-collection-caret svg { transform: rotate(-90deg); }
      .mw-stage-entry, > :is(.mw-dir-row, a.mw-dir-row) { padding-left: 24px; }
    }
    .goal-collection-caret, .goal-collection-mark { display: grid; place-items: center; width: 16px; height: 16px; }
    .goal-collection-caret { color: var(--muted); svg { width: 12px; height: 12px; transition: transform var(--dur-move) var(--ease-quint); } }
    .goal-collection-mark { color: var(--tone-idle); svg { width: 14px; height: 14px; } &.is-ready { color: var(--tone-done); } &.is-attention { color: var(--tone-attention); } }
    .goal-collection-empty { margin: 0; padding: 8px 8px 12px 24px; font-size: 12px; color: var(--muted); }
    a:is(.mw-stage-entry, .directory-list-row) { color: inherit; text-decoration: none; }
    :is(.mw-dir-row:is(.is-selected, [aria-current="page"]), .directory-list-row.is-selected, .mw-dir-row-wrap:has(:is(.is-selected, [aria-current="page"])))::before { content: none; }
    :is(.directory-list-row.is-selected, .mw-stage-entry:is(.is-selected, .is-open, [aria-selected="true"])) { background: var(--nav-active); color: var(--ink); }
    .mw-stage-entry:has(.plugin-stage-kind) {
      grid-template-columns: minmax(12rem, 1.2fr) 4.75rem 7.5rem minmax(10rem, 1fr) 4.5rem;
      .mw-entry-status { justify-self: start; max-width: 100%; min-height: 0; padding: 0; background: transparent; border-radius: 0; }
    }
  }
  .plugin-stage-chrome {
    position: absolute; top: 18px; left: 24px; z-index: 20; display: flex; align-items: center; gap: 8px; flex-wrap: nowrap;
    width: max-content; max-width: calc(100% - 40px); background: transparent; isolation: isolate; pointer-events: auto;
    .tree-create { flex: none; width: auto; svg { width: 14px; height: 14px; } }
  }
  .plugin-stage-kind, .plugin-stage-fact, .plugin-stage-meta { justify-self: start; max-width: 100%; }
  .plugin-stage-kind[data-kind] { --status-tone: var(--ink-soft); }
  .plugin-stage-fact { color: var(--ink-soft); }
  .plugin-stage-workspace, .plugin-stage-workspace > :is(.mw-detail, .inbox-reference-detail, .shelf-stage) {
    min-width: 0; min-height: 0; display: flex; flex-direction: column;
  }
  .plugin-stage-workspace {
    position: relative; height: 100%;
    > :is(.mw-detail, .inbox-reference-detail, .shelf-stage) { flex: 1; overflow: hidden; }
  }
  .plugin-stage-back {
    display: grid; place-items: center; width: 30px; height: 30px; padding: 0; flex: none; margin-left: -8px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer;
    &:hover { background: var(--nav-hover); color: var(--ink); }
    svg { width: 16px; height: 16px; transform: rotate(180deg); }
  }
  .plugin-stage-detail-bar {
    display: flex; align-items: center; gap: 8px; flex: none; flex-wrap: nowrap; min-height: 48px; padding: 8px 16px 8px 24px;
    > .mw-detail-kicker { margin: 0; flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    > h1 { margin: 0; flex: 1; font-size: 13px; font-weight: var(--weight-title); line-height: 1.3; }
    &[data-stage-back-only] { position: absolute; inset: 0 0 auto; z-index: 4; min-height: 32px; height: 32px; pointer-events: none; background: transparent; .plugin-stage-back { pointer-events: auto; } }
    > span { flex: none; color: var(--muted); font-size: 12px; }
    > .form-tabs, > :is(h1, span) + .mw-btn { margin-left: auto; }
    > .mw-btn:not(.plugin-stage-back) { flex: none; }
    > .form-tabs + .mw-btn { margin-left: 0; }
    :is([data-dataset-delete], [data-form-delete], [data-pages-delete], [data-ppt-delete], [data-functions-delete], [data-lingguang-discard-current], [data-alchemist-delete]) {
      color: var(--red);
      &:hover:not(:disabled) { background: color-mix(in srgb, var(--red) 8%, transparent); color: var(--red); }
    }
  }
  @container plugin-stage (max-width: 560px) { .plugin-stage-detail-bar { padding: 8px 12px 8px 16px; gap: 6px; } }
  .inbox-reference-detail { position: relative; }
  @media (max-width: 760px) {
    body.immersive-workbench { --control-h: 44px; .plugin-stage-back { width: 44px; height: 44px; } }
    .mw-stage-entry { height: auto; min-height: 44px; padding: 8px 12px; grid: auto / minmax(0, 1fr) max-content; }
    .mw-entry-source, .mw-stage-entry > time { display: none; }
    .plugin-stage-list {
      padding-top: 72px;
      .mw-stage-entry:has(.plugin-stage-kind) { grid: auto / minmax(0, 1fr) max-content max-content; }
      :is(.plugin-stage-fact, .plugin-stage-meta) { display: none; }
    }
  }
  /* An open record is its own page (specs/screen-polish §4「底栏第十三版」: 一件事一页): it takes the whole stage at every
     width, and the plugin's list is the page behind it — the back key, or the list's own tab. Nothing stands at its left. */
  body.immersive-workbench .plugin-stage-shell[data-expanded="true"] {
    display: block; overflow: hidden; padding: 0;
    :is(.plugin-stage-chrome, .plugin-stage-list) { display: none !important; }
    .plugin-stage-workspace { position: absolute; inset: 0; z-index: 3; overflow: hidden; }
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
  @media (max-width: 600px) {
    .plugin-stage-list .mw-empty { padding-top: 24px; }
    .plugin-stage-more-actions > .mw-btn { min-height: 44px; }
    .plugin-stage-more > summary { min-height: 40px; }
  }
`;

const FRAME_STAGE_SHELL = '.plugin-stage-shell:not([data-feed-stage-shell],.mw-layout-primitives,[data-work-surface="jelly"])';

/** Shared Soft Workbench plugin-stage finish rules (from craft-finish-pages.ts) for opaque plugin frames (102-1). */
export const PLUGIN_STAGE_FINISH_STYLES = `
  body.immersive-workbench {
    .plugin-stage-list {
      > .mw-empty, > div > .mw-empty:only-child {
        display: grid; justify-items: center; align-content: center; gap: 0;
        width: 100%; max-width: 440px; margin: 0 auto; text-align: center;
        > :is(strong, h1, h2) { margin: 0 0 8px; letter-spacing: -.02em; }
        > p { margin: 0; max-width: min(34em, 100%); color: var(--muted); line-height: 1.75; }
        > :is(.mw-btn, .mw-empty__actions) { margin: 24px 0 0; justify-content: center; }
      }
      > .mw-empty, > div:only-child > .mw-empty:only-child { min-height: calc(100% - 24px); padding: 48px 24px 64px; }
    }
    ${FRAME_STAGE_SHELL}[data-expanded="false"] > .plugin-stage-list {
      > :is(.plugin-stage-chrome, .shelf-stage-chrome) {
        position: relative; inset: auto; align-items: center; width: auto; max-width: none; height: auto; flex: none; padding: 0;
        &::before { content: var(--stage-title, "") / ""; font-weight: var(--weight-title); letter-spacing: -.02em; line-height: 1.3; color: var(--ink); }
        &::after { content: var(--stage-desc, "") / ""; font-size: 13px; line-height: 1.5; color: var(--muted); }
        @media (min-width: 761px) {
          z-index: 5; display: grid; grid: auto auto / minmax(0, 1fr); grid-auto-flow: column; grid-auto-columns: auto;
          gap: 4px 8px; min-height: 40px; margin: 0 0 24px;
          > * { grid-row: 1; }
          &::before, &::after { grid-column: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          &::before { grid-row: 1; font-size: 24px; }
          &::after { grid-row: 2; }
        }
        @media (max-width: 760px) {
          display: flex; flex-wrap: wrap; gap: 8px; min-height: 0; margin: 0 0 16px;
          &::before { order: -2; flex: 1 0 100%; font-size: 20px; }
          &::after { order: -1; flex: 1 0 100%; margin: -4px 0 4px; }
        }
      }
      .mw-stage-entry { height: auto; grid-template-rows: auto; }
      @media (min-width: 761px) {
        padding: 32px max(32px, calc((100% - 960px) / 2)) 56px;
        > .plugin-stage-chrome .tree-create {
          min-height: var(--control-h); padding: 0 12px; border-radius: 8px; font-size: 13px;
          &:first-of-type { background: var(--action); color: var(--action-ink); svg { color: currentColor; } &:hover { background: var(--action-hover); } }
        }
        &:has(> .plugin-stage-chrome .tree-create) .mw-empty .mw-btn--primary { border-color: transparent; background: var(--control-fill); color: var(--ink); &:hover:not(:disabled) { background: var(--nav-hover); } }
        .mw-stage-entry { min-height: 44px; padding: 8px 12px; border-radius: 8px; .mw-stage-leading strong { line-height: 20px; } }
        .mw-stage-item { min-height: 0; }
        :is(.mw-entry-source, .plugin-stage-fact, .plugin-stage-meta, .mw-stage-entry > time) { font-size: 12px; }
        .goal-collection-fold {
          margin: 0 0 16px;
          > summary { height: 34px; color: var(--muted); strong { color: var(--ink-soft); } }
          .mw-stage-entry { padding-left: 32px; }
        }
        > .mw-empty, > div:only-child > .mw-empty:only-child { min-height: calc(100% - 84px); }
        > div:not(:only-child) > .mw-empty:only-child { width: auto; padding: 12vh 24px 64px; }
      }
      @media (max-width: 760px) {
        padding-top: 16px;
        .mw-stage-entry { min-height: 48px; }
      }
    }
  }
  :is(.mw-empty__mark, .coding-start-mark) {
    position: relative; isolation: isolate; display: grid; place-items: center; flex: none;
    width: 56px; height: 56px; margin: 0 0 16px; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; color: var(--ink-soft);
    &::before, &::after { content: ""; position: absolute; left: 9px; top: 4px; width: 36px; height: 46px; border-radius: 6px; }
    &::after { z-index: 0; background: var(--surface-soft); box-shadow: 0 0 0 1px var(--line); transform: translate(8px, 2px) rotate(9deg); }
    &::before { z-index: 1; transform: rotate(-4deg); box-shadow: 0 0 0 1px var(--line), var(--lift-1); background: linear-gradient(var(--line) 0 0) 8px 30px/18px 2px no-repeat, linear-gradient(var(--line) 0 0) 8px 36px/12px 2px no-repeat, var(--popover); }
    > svg { position: relative; z-index: 2; width: 20px; height: 20px; stroke-width: 1.6; transform: translate(-1px, -8px) rotate(-4deg); color: var(--ink-soft); }
  }
  .mw-empty--error {
    padding: 32px 16px; gap: 0; justify-items: center; text-align: center;
    .mw-empty__mark > svg { color: var(--red); }
    > strong { margin: 0 0 4px; font-size: 15px; color: var(--ink); }
    > p { margin: 0 0 16px; max-width: 34em; color: var(--muted); overflow-wrap: anywhere; }
  }
`;
