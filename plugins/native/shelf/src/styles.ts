/** DropAgent reading surface. Tokens come from the shared content family; this island only aliases `--da-*`. */
export const SHELF_STYLES = `
  [data-shelf],
  [data-plugin-section="shelf"],
  body.immersive-workbench [data-work-surface="shelf"],
  body.immersive-workbench[data-desktop-surface="shelf"] .tree-pane {
    --da-side: var(--content-side);
    --da-panel: var(--content-paper);
    --da-hover: var(--content-hover);
    --da-press: var(--content-press);
    --da-text: var(--content-ink);
    --da-muted: var(--content-muted);
    --da-faint: var(--content-muted);
    --da-line: var(--content-line);
    --da-accent: var(--content-accent);
    --da-accent-press: var(--content-accent-press);
    --da-on-accent: var(--content-on-accent);
    --da-select: var(--content-select);
    --da-tty: var(--content-tty);
    --da-tty-ink: var(--content-tty-ink);
    --slate: var(--mark-slate);
    --blue: var(--mark-blue);
    --ochre: var(--mark-ochre);
    --plum: var(--mark-plum);
    --clay: var(--mark-clay);
    --da-font: var(--font);
    --da-ease: cubic-bezier(.16, 1, .3, 1);
    --da-spring: cubic-bezier(.22, 1.2, .36, 1);
    --da-t: 180ms;
    --da-danger: var(--content-danger);
    --da-field: var(--content-field);
    color: var(--da-text);
    font-family: var(--da-font);
    -webkit-font-smoothing: antialiased;
  }
  body.immersive-workbench[data-desktop-surface="shelf"] .tree-pane,
  body.immersive-workbench [data-desktop-directory="shelf"].tree-pane {
    background: var(--da-side) !important;
    border-right-color: var(--da-line) !important;
  }
  body.immersive-workbench .plugin-section[data-plugin-section="shelf"] {
    background: var(--da-side);
    color: var(--da-text);
    min-height: 100%;
    display: flex;
    flex-direction: column;
  }
  body.immersive-workbench .plugin-section[data-plugin-section="shelf"] > .immersive-plugin-link {
    display: none !important;
  }
  body.immersive-workbench .plugin-section[data-plugin-section="shelf"] .plugin-section-body {
    flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 0;
  }
  body.immersive-workbench .plugin-section[data-plugin-section="shelf"].is-expanded > .plugin-section-body > .desktop-directory-panel:not([hidden]) > :not([data-directory-list-actions]):not(.desktop-directory-heading) {
    padding-inline: 0;
  }
  body.immersive-workbench :is([data-shelf], [data-plugin-section="shelf"]) :is(button, [role="button"], input) {
    appearance: none;
    -webkit-appearance: none;
  }
  [data-shelf="directory"] {
    position: relative;
    flex: 1; min-height: 0; display: flex; flex-direction: column;
    padding: 0 10px 16px; background: var(--da-side); color: var(--da-text);
  }
  .plugin-stage-list[data-shelf="directory"] {
    position: absolute; inset: 0; flex: none;
    padding: 52px 20px 28px; background: var(--paper);
  }
  body.immersive-workbench [data-work-surface="shelf"].plugin-stage-shell {
    padding: 0; background: var(--paper);
  }
  [data-shelf-stage-shell] .plugin-stage-workspace {
    background: var(--da-panel); overflow: hidden;
  }
  [data-shelf-stage-shell] .plugin-stage-workspace > .shelf-stage {
    flex: 1; min-height: 0; border: 0; border-radius: 0;
  }
  .plugin-stage-chrome .shelf-search { margin: 0; }
  /* DropAgent's directory chrome: search pill, add, more — paper, never Coss. */
  [data-shelf] .shelf-side-op {
    position: relative; display: grid; place-items: center; width: 30px; height: 30px; flex: none;
    border: 1px solid var(--da-line); border-radius: 8px; background: var(--da-side);
    color: var(--da-muted); cursor: pointer; transition: background var(--da-t) ease;
  }
  [data-shelf] .shelf-side-op:hover { background: var(--da-hover); color: var(--da-text); }
  [data-shelf] .shelf-side-op:active { background: var(--da-press); }
  [data-shelf] .shelf-side-op svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 1.7; }
  [data-shelf] .shelf-side-menu {
    position: absolute; top: 34px; right: 0; z-index: 30; min-width: 150px; padding: 4px;
    border: 1px solid var(--da-line); border-radius: 10px; background: var(--da-panel);
    box-shadow: 0 8px 24px #0002;
  }
  [data-shelf] .shelf-side-menu[hidden] { display: none; }
  /* The group head carries a coloured type mark and a neutral label; no green. */
  [data-shelf] .plugin-stage-list .goal-collection-fold > summary { color: var(--da-muted); }
  [data-shelf] .plugin-stage-list .goal-collection-fold > summary:hover { background: var(--da-hover); color: var(--da-text); }
  [data-shelf] .plugin-stage-list .goal-collection-fold > summary strong { color: inherit; }
  [data-shelf] .plugin-stage-list .goal-collection-fold > summary small { color: var(--da-faint); }
  [data-shelf] .shelf-group-mark { color: currentColor; }
  [data-shelf] .shelf-group-mark svg { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 1.7; }
  [data-shelf] .shelf-side-foot {
    display: flex; align-items: center; justify-content: space-between;
    margin-top: 12px; padding: 10px 8px 0; border-top: 1px solid var(--da-line);
    font-size: 10.5px; color: var(--da-faint);
  }
  /* DropAgent's directory is 213pt; the preview takes what is left. */
  body.immersive-workbench .plugin-stage-shell[data-shelf-stage-shell][data-expanded="true"] { --tree-width: 213px; }
  body.immersive-workbench .plugin-stage-shell[data-shelf-stage-shell][data-expanded="true"] .plugin-stage-list {
    border-right-color: var(--da-line); background: var(--da-side);
  }
  [data-shelf] .shelf-search {
    display: flex; align-items: center; gap: 6px; height: 30px;
    margin: 12px 0 6px; padding: 0 8px; border-radius: 8px;
    background: color-mix(in srgb, var(--da-panel) 70%, var(--da-side));
    border: 1px solid var(--da-line);
  }
  [data-shelf] .shelf-search svg { width: 13px; height: 13px; stroke: var(--da-faint); fill: none; stroke-width: 1.7; }
  body.immersive-workbench [data-shelf] .shelf-search input,
  [data-shelf] .shelf-search input {
    flex: 1; min-width: 0; border: 0 !important; background: transparent !important;
    color: var(--da-text) !important; font-size: 12px; outline: none !important; box-shadow: none !important;
  }
  [data-shelf] .shelf-search input:focus { outline: none !important; box-shadow: none !important; }
  [data-shelf] .shelf-search input::placeholder { color: var(--da-faint); }
  [data-shelf="settings"] .settings-heading h1 { margin: 0; }
  [data-shelf="settings"] .settings-section h2 { margin: 0 0 4px; font-size: 13px; font-weight: 500; color: var(--da-muted); }
  [data-shelf="settings"] .settings-setting-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin: 0; padding: 10px 0; border-bottom: 1px solid var(--da-line); }
  [data-shelf="settings"] .shelf-hotkey-lead { margin: 0 0 12px; font-size: 11px; color: var(--da-faint); }
  [data-shelf="settings"] .shelf-hotkey-row {
    display: flex; align-items: center; gap: 8px;
    padding: 12px; margin: 0 0 8px;
    background: color-mix(in srgb, var(--da-text) 4.5%, var(--da-panel));
    border-radius: 12px;
  }
  [data-shelf="settings"] .shelf-hotkey-row .setting-copy { min-width: 0; flex: 1; }
  [data-shelf="settings"] .shelf-hotkey-row .setting-copy strong { display: block; font-size: 13px; font-weight: 500; }
  [data-shelf="settings"] .shelf-hotkey-row .setting-copy span { display: block; margin-top: 2px; font-size: 12px; color: var(--da-faint); }
  [data-shelf="settings"] .shelf-hotkey-row .setting-copy span[data-occupied] { color: var(--da-muted); }
  [data-shelf="settings"] .shelf-hotkey-keys { display: flex; align-items: center; gap: 6px; flex: none; }
  [data-shelf="settings"] .shelf-hotkey-record {
    min-width: 72px; justify-content: center;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-weight: 600;
  }
  [data-shelf="settings"] .shelf-hotkey-row.is-recording .shelf-hotkey-record { color: var(--da-accent); }

  [data-shelf] .shelf-side-scroll::-webkit-scrollbar { width: 0; height: 0; }
  [data-shelf] .shelf-fold {
    display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 4px;
    border: 0; background: transparent; color: var(--da-muted); font-size: 12px; font-weight: 400;
    width: 100%; text-align: left; cursor: pointer; border-radius: 6px;
    transition: background var(--da-t) ease;
  }
  [data-shelf] .shelf-fold:hover { background: var(--da-hover); }
  [data-shelf] .shelf-fold .shelf-chev { width: 10px; transition: transform var(--da-t) var(--da-ease); }
  [data-shelf] .shelf-fold.is-shut .shelf-chev { transform: rotate(-90deg); }
  [data-shelf] .shelf-fold .shelf-count { margin-left: auto; font-size: 10px; font-weight: 400; color: var(--da-faint); }
  [data-shelf] .shelf-fold-gap { margin-top: 16px; }
  [data-shelf] .shelf-tree { margin: 0; padding: 0; list-style: none; }
  [data-shelf] .shelf-row {
    display: flex; align-items: center; gap: 8px; height: 31px;
    padding: 0 8px 0 21px; border-radius: 6px; cursor: pointer; position: relative;
    transition: background var(--da-t) var(--da-ease), padding-right var(--da-t) var(--da-ease); color: var(--da-muted);
  }
  [data-shelf] .shelf-row:hover { background: var(--da-hover); }
  [data-shelf] .shelf-row:is(:hover, .is-on):not(.is-child) { padding-right: 72px; }
  [data-shelf] .shelf-row.is-on {
    background: var(--da-select);
    color: var(--da-text);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--da-accent) 38%, transparent);
  }
  [data-shelf] .shelf-row .shelf-glyph { width: 16px; height: 16px; flex: none; display: grid; place-items: center; }
  [data-shelf] .shelf-row .shelf-glyph svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  [data-shelf] .shelf-row .shelf-name {
    min-width: 0; flex: 0 1 auto; overflow: hidden; font-size: 12px; white-space: nowrap;
  }
  [data-shelf] .shelf-row .shelf-name:not(:has(.shelf-name__stem)) {
    display: block; text-overflow: ellipsis;
  }
  [data-shelf] .shelf-row .shelf-name:has(.shelf-name__stem) { display: flex; }
  [data-shelf] .shelf-row .shelf-name__stem {
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  [data-shelf] .shelf-row .shelf-name__ext { flex: none; }
  [data-shelf] .shelf-row.is-on .shelf-name { color: var(--da-text); }
  /* DropAgent stamps a result H:mm and marks a failure; the row actions replace both on hover. */
  [data-shelf] .shelf-row .shelf-when {
    flex: none; max-width: 8rem; overflow: hidden; opacity: 1;
    font-size: 10px; color: var(--da-faint); font-variant-numeric: tabular-nums;
    transition: max-width var(--da-t) var(--da-ease), opacity var(--da-t) var(--da-ease), margin var(--da-t) var(--da-ease);
  }
  [data-shelf] .shelf-row .shelf-status {
    flex: none; margin-left: auto; display: grid; place-items: center; width: 16px; height: 16px; color: var(--mark-clay);
    max-width: 16px; overflow: hidden; opacity: 1;
    transition: max-width var(--da-t) var(--da-ease), opacity var(--da-t) var(--da-ease), margin var(--da-t) var(--da-ease);
  }
  [data-shelf] .shelf-row .shelf-status svg { width: 14px; height: 14px; }
  [data-shelf] .shelf-row:is(:hover, .is-on):not(.is-child) :is(.shelf-when, .shelf-status, .shelf-now) {
    max-width: 0; margin: 0; opacity: 0; pointer-events: none;
  }
  [data-shelf] .shelf-row .shelf-ops {
    position: absolute; right: 2px; top: 0; bottom: 0;
    display: flex; align-items: center; gap: 0;
    opacity: 0; pointer-events: none; background: var(--da-hover);
    transition: opacity var(--da-t) var(--da-ease);
  }
  [data-shelf] .shelf-row.is-on .shelf-ops { background: var(--da-select); }
  [data-shelf] .shelf-row:is(:hover, .is-on):not(.is-child) .shelf-ops { opacity: 1; pointer-events: auto; }
  [data-shelf] .shelf-row .shelf-op {
    box-sizing: border-box;
    width: 22px; height: 22px; border: 0; border-radius: 5px; background: transparent;
    color: var(--da-muted); display: grid; place-items: center; cursor: pointer;
  }
  [data-shelf] .shelf-row .shelf-op:hover { color: var(--da-text); background: var(--da-hover); }
  [data-shelf] .shelf-row .shelf-op:active { background: var(--da-press); }
  [data-shelf] .shelf-row .shelf-op.is-danger { color: var(--da-danger); }
  [data-shelf] .shelf-row .shelf-op.is-danger:hover { color: var(--da-danger); background: var(--da-hover); }
  [data-shelf] .shelf-row .shelf-op[aria-disabled="true"] { opacity: 0.45; pointer-events: none; }
  [data-shelf] .shelf-row .shelf-ops svg { width: 11px; height: 11px; stroke: currentColor; fill: none; stroke-width: 1.7; }
  [data-shelf] .shelf-empty-line { padding: 8px 8px 8px 21px; font-size: 11px; color: var(--da-faint); }
  [data-shelf] .shelf-now {
    flex: none; max-width: 8rem; overflow: hidden; opacity: 1;
    font-size: 10px; letter-spacing: .02em; color: var(--da-accent); padding: 1px 6px;
    border: 1px solid var(--da-line); border-radius: 999px;
    transition: max-width var(--da-t) var(--da-ease), opacity var(--da-t) var(--da-ease), margin var(--da-t) var(--da-ease);
  }
  @media (prefers-reduced-motion: reduce) {
    [data-shelf] .shelf-row,
    [data-shelf] .shelf-row .shelf-ops,
    [data-shelf] .shelf-row :is(.shelf-when, .shelf-status, .shelf-now) { transition: none; }
  }
  [data-shelf] .shelf-clip-hint {
    margin: 0 12px 6px; font-size: 11px; line-height: 1.45; color: var(--da-muted);
  }
  [data-shelf] .shelf-clip-hint[hidden] { display: none; }
  [data-shelf] .shelf-clip-more {
    display: flex; align-items: center; height: 28px; margin: 0 10px 8px; padding: 0 8px;
    border: 0; border-radius: 8px; background: transparent; color: var(--da-accent); font-size: 11px; cursor: pointer;
  }
  [data-shelf] .shelf-clip-more[hidden] { display: none; }
  [data-shelf] .shelf-clip-more:hover { background: var(--da-hover); }
  [data-shelf] .shelf-clip-more:active { background: var(--da-press); }
  [data-shelf] .shelf-clip-foot { margin: 0; padding: 12px 42px 20px; font-size: 11px; color: var(--da-faint); }
  [data-shelf] .tone-slate { color: var(--mark-slate); }
  [data-shelf] .tone-blue { color: var(--mark-blue); }
  [data-shelf] .tone-ochre { color: var(--mark-ochre); }
  [data-shelf] .tone-plum { color: var(--mark-plum); }
  [data-shelf] .tone-clay { color: var(--mark-clay); }

  body.immersive-workbench [data-work-surface="shelf"] {
    display: flex; flex-direction: column; min-height: 0; height: 100%;
    padding: 0 7px 7px 0; background: var(--da-side); color: var(--da-text);
    font-family: var(--da-font);
  }
  [data-shelf="workbench"] .shelf-stage {
    position: relative; flex: 1; min-width: 0; min-height: 0;
    display: flex; flex-direction: column;
    background: var(--da-panel);
    border: 1px solid var(--da-line);
    border-radius: 9px;
    overflow: hidden;
  }
  [data-shelf] .shelf-tools {
    flex: none; height: 42px; display: none; align-items: center; gap: 6px;
    padding: 0 10px; border-bottom: 1px solid var(--da-line);
  }
  [data-shelf] .shelf-stage.is-result .shelf-tools { display: flex; }
  [data-shelf] .shelf-chrome {
    display: none; flex: none; height: 44px; align-items: center; gap: 8px;
    padding: 0 20px; border-bottom: 1px solid var(--da-line);
    font-size: 12px; color: var(--da-text);
  }
  [data-shelf] .shelf-stage.is-item .shelf-chrome { display: flex; }
  [data-shelf] .shelf-chrome-title {
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  [data-shelf] .shelf-chrome-tag {
    margin-left: auto; flex: none; font-size: 11px; color: var(--da-muted);
  }
  [data-shelf] .shelf-chrome [data-shelf-edit] { flex: none; }
  [data-shelf] .shelf-editor-wrap {
    height: 100%; min-height: 0; display: flex; flex-direction: column;
    padding: 12px 16px 8px;
  }
  [data-shelf] .shelf-edit-hint { margin: 0 0 6px; font-size: 11px; color: var(--da-faint); }
  [data-shelf] .shelf-editor {
    flex: 1; min-height: 0; width: 100%; resize: none; border: 0;
    background: transparent; color: var(--da-text); padding: 6px 4px;
    font: 13px/1.7 var(--da-font); outline: none;
  }
  [data-shelf] .shelf-editor.is-code {
    font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  body.immersive-workbench [data-shelf] .shelf-paper,
  [data-shelf] .shelf-paper {
    box-sizing: border-box;
    height: 32px; padding: 0 12px; border-radius: 8px;
    border: 1px solid var(--da-line);
    background: var(--da-panel);
    color: var(--da-text);
    font: inherit; font-size: 12px; cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
    transition: background var(--da-t) ease, border-color var(--da-t) ease;
  }
  html[data-resolved-theme="dark"] [data-shelf] .shelf-paper {
    color-scheme: dark;
    background: var(--da-panel);
    color: var(--da-text);
    border-color: var(--da-line);
  }
  [data-shelf] .shelf-paper svg { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 1.6; }
  [data-shelf] .shelf-paper:hover { background: var(--da-hover); }
  [data-shelf] .shelf-paper:active { background: var(--da-press); }
  [data-shelf] .shelf-paper.is-on,
  [data-shelf] .shelf-paper[aria-pressed="true"] {
    background: var(--da-press);
    border-color: color-mix(in srgb, var(--da-accent) 45%, transparent);
    color: var(--da-accent);
    font-weight: 400;
  }
  [data-shelf] .shelf-paper.quiet { border-color: transparent; background: transparent; }
  [data-shelf] .shelf-paper.quiet:hover { background: var(--da-hover); border-color: transparent; }
  [data-shelf] .shelf-primary {
    box-sizing: border-box;
    height: 34px; padding: 0 14px; border-radius: 8px;
    background: var(--da-accent); color: var(--da-on-accent); font: inherit; font-size: 12px; font-weight: 400;
    cursor: pointer; display: inline-flex; align-items: center;
    box-shadow: 0 1px 2px #0002;
    transition: background var(--da-t) ease;
  }
  [data-shelf] .shelf-primary:hover { background: var(--da-accent-press); }
  [data-shelf] .shelf-primary:active { background: var(--da-accent-press); }
  [data-shelf] .shelf-primary:disabled, [data-shelf] .shelf-paper:disabled { opacity: .45; cursor: default; transform: none; box-shadow: none; }
  [data-shelf] .shelf-preview { flex: 1; min-height: 0; overflow: auto; background: var(--da-panel); }
  [data-shelf] .shelf-preview-inner { padding: 35px 42px 48px; max-width: 76ch; }
  [data-shelf] .shelf-stage.is-compare .shelf-preview-inner { padding: 24px 22px 48px; max-width: none; }
  [data-shelf] .shelf-kicker { font-size: 11px; color: var(--da-muted); margin: 0 0 10px; }
  [data-shelf] .shelf-title { margin: 0 0 16px; font-size: 22px; font-weight: 400; letter-spacing: -.03em; line-height: 1.3; }
  [data-shelf] .shelf-doc p { margin: 0 0 14px; font-size: 13px; line-height: 1.8; color: var(--da-text); }
  [data-shelf] .shelf-doc .muted { color: var(--da-muted); }
  [data-shelf] .shelf-welcome, [data-shelf] .shelf-idle {
    height: 100%; display: flex; flex-direction: column; align-items: flex-start; justify-content: center;
    padding: 48px 56px;
  }
  [data-shelf] .shelf-welcome h2 { margin: 0 0 12px; font-size: 26px; font-weight: 400; letter-spacing: -.025em; }
  [data-shelf] .shelf-welcome p, [data-shelf] .shelf-idle p { margin: 0; font-size: 13px; line-height: 1.8; color: var(--da-muted); max-width: 440px; }
  [data-shelf] .shelf-welcome .shelf-cta { display: flex; gap: 10px; margin-top: 22px; }
  [data-shelf] .shelf-idle { align-items: center; text-align: center; }
  [data-shelf] .shelf-compare { height: 100%; display: grid; grid-template-columns: 1fr 1px 1fr; min-height: 0; }
  [data-shelf] .shelf-compare > div { min-width: 0; overflow: auto; }
  [data-shelf] .shelf-rule { background: var(--da-line); }
  [data-shelf] .shelf-compare-nav { display: flex; gap: 6px; flex-wrap: wrap; padding: 10px 12px 0; }
  [data-shelf] .shelf-source {
    height: 26px; padding: 0 8px; border: 1px solid var(--da-line); border-radius: 8px;
    background: var(--da-panel); color: var(--da-text); font-size: 11px; cursor: pointer;
  }
  [data-shelf] .shelf-source:hover { background: var(--da-hover); }
  [data-shelf] .shelf-source:active { background: var(--da-press); }
  [data-shelf] .shelf-source.is-on { background: var(--da-select); }
  @media (max-width: 640px) {
    [data-shelf] .shelf-compare { grid-template-columns: 1fr; grid-template-rows: 44% 1px 1fr; }
  }
  /* Under 640pt of content the comparison stacks, whatever the window is doing. */
  [data-shelf] .shelf-stage.is-narrow .shelf-compare { grid-template-columns: 1fr; grid-template-rows: 44% 1px 1fr; }
  [data-shelf] .shelf-find {
    margin: 4px 8px 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px;
  }
  [data-shelf] .shelf-find[hidden] { display: none; }
  [data-shelf] .shelf-find li {
    display: flex; align-items: center; gap: 8px; min-height: 28px; padding: 0 8px;
    border-radius: 8px; font-size: 12px; color: var(--da-text); cursor: pointer;
  }
  [data-shelf] .shelf-find li:hover { background: var(--da-hover); }
  [data-shelf] .shelf-find small { margin-left: auto; color: var(--da-muted); font-size: 11px; }
  [data-shelf] .shelf-tty {
    display: none; flex-direction: column; height: 168px; border-top: 1px solid var(--da-line);
    background: var(--da-tty); color: var(--da-tty-ink);
  }
  [data-shelf] .shelf-stage.is-talk .shelf-tty { display: flex; }
  [data-shelf] .shelf-stage.is-talk.is-confirm .shelf-tty,
  [data-shelf] .shelf-stage.is-talk.is-run .shelf-tty,
  [data-shelf] .shelf-stage.is-talk.is-fail .shelf-tty { height: 72px; }
  [data-shelf] .shelf-tty-bar {
    height: 32px; display: flex; align-items: center; gap: 8px; padding: 0 12px;
    font-size: 11px; color: var(--da-muted); border-bottom: 1px solid var(--da-line);
  }
  [data-shelf] .shelf-tty pre {
    flex: 1; margin: 0; padding: 10px 14px; overflow: auto;
    font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  [data-shelf] .shelf-tty-screen { flex: 1; min-height: 0; padding: 8px 12px; overflow: hidden; }
  [data-shelf] .shelf-tty-screen .xterm { height: 100%; }
  [data-shelf] .shelf-tty.is-drop { outline: 2px solid var(--da-accent); outline-offset: -2px; }
  [data-shelf] .shelf-tty-in { display: flex; gap: 8px; padding: 8px 12px; border-top: 1px solid var(--da-line); }
  [data-shelf] .shelf-tty-in input {
    flex: 1; height: 32px; border: 1px solid var(--da-text); border-radius: 8px;
    background: var(--da-field); color: var(--da-text); padding: 0 10px; font-size: 12px; box-shadow: none;
  }
  [data-shelf] .shelf-drawer {
    display: none; padding: 12px 16px 8px; border-top: 1px solid var(--da-line); background: var(--da-panel);
  }
  [data-shelf] .shelf-stage.is-confirm .shelf-drawer,
  [data-shelf] .shelf-stage.is-run .shelf-drawer,
  [data-shelf] .shelf-stage.is-fail .shelf-drawer { display: block; }
  [data-shelf] .shelf-confirm-head { display: flex; align-items: baseline; gap: 8px; margin: 0 0 4px; }
  [data-shelf] .shelf-confirm-title {
    margin: 0 0 4px; font-size: 15px; font-weight: 400; color: var(--da-text);
  }
  [data-shelf] .shelf-confirm-count { margin-left: auto; font-size: 12px; color: var(--da-muted); }
  [data-shelf] .shelf-confirm-out {
    margin: 0 0 12px; font-size: 12px; color: var(--da-muted);
  }
  [data-shelf] .shelf-choice { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0 0 12px; }
  [data-shelf] .shelf-choice[hidden] { display: none; }
  [data-shelf] .shelf-choice-label { font-size: 12px; color: var(--da-muted); }
  [data-shelf] .shelf-choice-hint { font-size: 11.5px; color: var(--da-muted); }
  [data-shelf] .shelf-seg {
    position: relative; display: inline-flex; gap: 2px; padding: 2px;
    border: 1px solid var(--da-line); border-radius: 9px; background: var(--da-panel);
  }
  [data-shelf] .shelf-seg-plate {
    position: absolute; top: 2px; bottom: 2px; left: 0; width: 0;
    border-radius: 7px; background: var(--da-select); pointer-events: none;
    transition: transform 280ms var(--da-spring), width 280ms var(--da-spring);
  }
  [data-shelf] .shelf-seg-item {
    position: relative; height: 26px; padding: 0 10px; border-radius: 7px;
    display: inline-flex; align-items: center; font-size: 12px; color: var(--da-text);
    cursor: pointer; transition: background var(--da-t) ease;
  }
  [data-shelf] .shelf-seg-item:hover[aria-checked="false"] { background: var(--da-hover); }
  [data-shelf] .shelf-seg-item:active { background: var(--da-press); }
  [data-shelf] .shelf-facts {
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px;
    margin: 0; padding: 14px; border-radius: 12px; background: var(--da-side); font-size: 12px;
  }
  [data-shelf] .shelf-fact { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  [data-shelf] .shelf-facts dt { flex: none; min-width: 34px; color: var(--da-muted); }
  [data-shelf] .shelf-facts dd { margin: 0; color: var(--da-text); }
  [data-shelf] .shelf-actor { margin: 10px 0 0; font-size: 12px; color: var(--da-muted); }
  [data-shelf] .shelf-row.is-child { padding-left: 26px; }
  [data-shelf] .shelf-stage.is-run [data-shelf-back] { display: none; }
  [data-shelf] .shelf-drawer-actions { display: flex; gap: 8px; margin-top: 12px; }
  [data-shelf] .shelf-run-line { font-size: 12px; color: var(--da-muted); }
  [data-shelf] .shelf-stage.is-run [data-shelf-run],
  [data-shelf] .shelf-stage.is-fail [data-shelf-run] { display: none; }
  [data-shelf] .shelf-bar-wrap { flex: none; border-top: 1px solid var(--da-line); }
  [data-shelf] .shelf-bar-hint {
    margin: 0; padding: 8px 16px 0; font-size: 11.5px; line-height: 1.45; color: var(--da-muted);
  }
  [data-shelf] .shelf-bar-hint[hidden] { display: none; }
  [data-shelf] .shelf-bar {
    display: flex; align-items: center; gap: 4px;
    padding: 8px 13px; overflow: visible;
  }
  [data-shelf] .shelf-bar-scroll {
    display: flex; align-items: center; gap: 4px;
    flex: 1; min-width: 0; overflow-x: auto;
  }
  [data-shelf] .shelf-act-rule {
    flex: none; width: 1px; height: 18px; margin: 0 2px;
    background: var(--da-line);
  }
  [data-shelf] .shelf-act-wrap {
    display: inline-flex; align-items: center; flex: none;
  }
  [data-shelf] .shelf-act-grip {
    width: 8px; height: 32px; margin-right: 2px;
    background:
      radial-gradient(circle, var(--da-faint) 1.1px, transparent 1.2px) 1px 6px / 3px 6px repeat;
    opacity: 0.7;
  }
  [data-shelf] .shelf-act-hide {
    width: 22px; height: 22px; margin-left: -2px; border-radius: 5px;
    color: var(--da-muted); display: grid; place-items: center; cursor: pointer;
  }
  [data-shelf] .shelf-act-hide:hover { color: var(--da-text); background: var(--da-hover); }
  [data-shelf] .shelf-act-hide svg { width: 11px; height: 11px; stroke: currentColor; fill: none; stroke-width: 1.7; }
  [data-shelf] .shelf-act {
    position: relative;
    box-sizing: border-box;
    flex: none; height: 30px; padding: 0 8px; border: 0; border-radius: 8px;
    background: transparent; color: var(--da-text); font-size: 12px; cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
    transition: background var(--da-t) ease;
  }
  [data-shelf] .shelf-act svg { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 1.7; flex: none; }
  [data-shelf] .shelf-act:hover:not([aria-disabled="true"]) { background: var(--da-hover); }
  [data-shelf] .shelf-act:active:not([aria-disabled="true"]) { background: var(--da-press); }
  [data-shelf] .shelf-act[aria-disabled="true"] { color: var(--da-faint); cursor: default; opacity: 0.45; }
  [data-shelf] .shelf-act.is-on { background: var(--da-press); }
  [data-shelf] .shelf-act-wrap[data-dragging="1"] { opacity: .5; }
  [data-shelf] .shelf-more { position: relative; flex: none; z-index: 8; }
  [data-shelf] .shelf-more-menu {
    position: absolute; right: 0; bottom: calc(100% + 6px); z-index: 8;
    min-width: 148px; padding: 4px;
    background: var(--da-panel); border: 1px solid var(--da-line); border-radius: 8px;
  }
  [data-shelf] .shelf-more-menu[hidden] { display: none; }
  [data-shelf] .shelf-more-item {
    display: flex; align-items: center; height: 30px; padding: 0 10px; border-radius: 6px;
    font-size: 12px; color: var(--da-text); cursor: pointer;
  }
  [data-shelf] .shelf-more-item:hover { background: var(--da-hover); }
  [data-shelf] .shelf-more-item:active { background: var(--da-press); }
  [data-shelf] .shelf-drop {
    position: absolute; inset: 0; display: none; place-items: center;
    z-index: 4; pointer-events: none;
  }
  [data-shelf].is-drop > .shelf-drop,
  [data-shelf] .is-drop > .shelf-drop { display: grid; }
  [data-shelf] .shelf-drop-veil {
    position: absolute; inset: 0;
    background: color-mix(in srgb, var(--da-panel) 42%, transparent);
    border-radius: 9px;
  }
  [data-shelf] .shelf-drop-frame {
    position: absolute; inset: 10px;
    border: 1.5px dashed color-mix(in srgb, var(--da-text) 38%, transparent);
    border-radius: 9px;
  }
  [data-shelf="directory"] .shelf-drop-veil,
  [data-shelf="directory"] .shelf-drop-frame { border-radius: 8px; }
  [data-shelf] .shelf-drop-card {
    position: relative; z-index: 1;
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    color: var(--da-text);
  }
  [data-shelf] .shelf-drop-card svg {
    width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 1.4;
    stroke-linecap: round; stroke-linejoin: round;
  }
  [data-shelf] .shelf-drop-card b { font-size: 13px; font-weight: 400; }
  [data-shelf] .shelf-drop-card p { margin: 0; font-size: 11.5px; color: var(--da-muted); }
  [data-shelf] .shelf-pdf-frame { width: 100%; min-height: min(62vh, 640px); border: 0; background: var(--da-panel); }
  [data-shelf] .shelf-image { max-width: 100%; max-height: min(62vh, 640px); border: 1px solid var(--da-line); border-radius: 8px; }
  body.immersive-workbench :is([data-shelf], [data-plugin-section="shelf"]) :is(button, [role="button"], input):active:not(:disabled, [aria-disabled="true"]) {
    filter: none !important;
  }
  body.immersive-workbench :is([data-shelf], [data-plugin-section="shelf"]) :focus-visible {
    outline: 2px solid var(--da-accent); outline-offset: 2px;
  }
  [data-plugin-id="shelf"].is-current, [data-plugin-id="shelf"][aria-current="page"] { color: var(--da-accent, var(--hue-slate)); }
  [data-shelf] .shelf-settings-body { display: flex; gap: 20px; align-items: flex-start; }
  [data-shelf] .shelf-settings-nav {
    flex: none; width: 188px; display: flex; flex-direction: column; gap: 4px;
    padding: 4px 0; border-right: 1px solid var(--da-line);
  }
  [data-shelf] .shelf-settings-tab {
    display: flex; align-items: center; gap: 10px; height: 38px; padding: 0 12px;
    border: 0; border-radius: 8px; background: transparent; color: var(--da-text);
    font: inherit; font-size: 12px; text-align: left; cursor: pointer;
    transition: background var(--da-t) ease;
  }
  [data-shelf] .shelf-settings-tab:hover { background: var(--da-hover); }
  [data-shelf] .shelf-settings-tab:active { background: var(--da-press); }
  [data-shelf] .shelf-settings-tab.is-on { background: var(--da-press); color: var(--da-accent); }
  [data-shelf] .shelf-settings-tab .shelf-glyph { width: 16px; height: 16px; }
  [data-shelf] .shelf-settings-panes { flex: 1; min-width: 0; }
  [data-shelf] .shelf-settings-pane[hidden] { display: none; }
  [data-shelf] .shelf-settings-pane h2 { margin: 0 0 6px; font-size: 22px; font-weight: 400; }
  [data-shelf] .shelf-settings-detail { margin: 0 0 18px; font-size: 12px; color: var(--da-muted); line-height: 1.7; }
  [data-shelf] .shelf-settings-block { margin: 0 0 22px; }
  [data-shelf] .shelf-settings-block h3 { margin: 0 0 8px; font-size: 13px; font-weight: 400; color: var(--da-text); }
  [data-shelf] .shelf-settings-line { margin: 0 0 6px; font-size: 12px; color: var(--da-text); }
  [data-shelf] .shelf-runtime-list, [data-shelf] .shelf-runtime-custom, [data-shelf] .shelf-action-list {
    margin: 8px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px;
  }
  [data-shelf] .shelf-runtime-row, [data-shelf] .shelf-action-row {
    display: flex; align-items: center; gap: 10px; min-height: 31px; padding: 0 8px;
    border-radius: 8px; font-size: 12px;
  }
  [data-shelf] .shelf-runtime-row:hover, [data-shelf] .shelf-action-row:hover { background: var(--da-hover); }
  [data-shelf] .shelf-runtime-name, [data-shelf] .shelf-action-name { color: var(--da-text); }
  [data-shelf] .shelf-runtime-state { color: var(--da-muted); }
  [data-shelf] .shelf-runtime-state.is-on { color: var(--da-accent); }
  [data-shelf] .shelf-action-tag { color: var(--ochre); }
  [data-shelf] .shelf-action-ops { margin-left: auto; display: flex; gap: 4px; }
  [data-shelf] .shelf-action-row[data-dragging="1"] { background: var(--da-press); }
  [data-shelf] .shelf-runtime-picks { display: flex; flex-direction: column; gap: 2px; }
  [data-shelf] .shelf-runtime-pick {
    display: flex; align-items: center; gap: 10px; min-height: 31px; padding: 0 8px;
    border-radius: 8px; font-size: 12px; cursor: pointer;
  }
  [data-shelf] .shelf-runtime-pick:hover { background: var(--da-hover); }
  [data-shelf] .shelf-runtime-pick.is-missing { color: var(--da-faint); cursor: default; opacity: .45; }
  [data-shelf] .shelf-shortcut-form { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; max-width: 520px; }
  [data-shelf] .shelf-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--da-muted); }
  [data-shelf] .shelf-field input, [data-shelf] .shelf-field textarea, [data-shelf] .shelf-field select {
    border: 1px solid var(--da-line); border-radius: 8px; background: var(--da-field);
    color: var(--da-text); font: inherit; font-size: 12px; padding: 7px 10px;
  }
  [data-shelf] .shelf-field input:focus, [data-shelf] .shelf-field textarea:focus, [data-shelf] .shelf-field select:focus {
    outline: none; border-color: var(--da-text);
  }
  [data-shelf] .shelf-kinds { display: flex; flex-wrap: wrap; gap: 8px 14px; border: 0; margin: 0; padding: 0; }
  [data-shelf] .shelf-kinds legend { padding: 0 0 6px; font-size: 12px; color: var(--da-muted); }
  [data-shelf] .shelf-kind { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--da-text); }
  [data-shelf] .shelf-form-actions { display: flex; gap: 8px; }
  [data-shelf] .shelf-guide-list { margin: 0; display: grid; gap: 10px; }
  [data-shelf] .shelf-guide-row { display: flex; gap: 12px; font-size: 12px; }
  [data-shelf] .shelf-guide-row dt { flex: none; width: 88px; color: var(--da-muted); }
  [data-shelf] .shelf-guide-row dd { margin: 0; color: var(--da-text); line-height: 1.7; }
  @media (max-width: 760px) {
    [data-shelf] .shelf-settings-body { flex-direction: column; }
    [data-shelf] .shelf-settings-nav { width: 100%; flex-direction: row; flex-wrap: wrap; border-right: 0; border-bottom: 1px solid var(--da-line); }
  }
  @media (prefers-reduced-motion: reduce) {
    [data-shelf] *, [data-plugin-section="shelf"] * { animation: none !important; transition: none !important; }
  }
`;
