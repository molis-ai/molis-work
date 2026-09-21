export const PAGES_STYLES = `
  [data-pages="workbench"] { --plugin-tint: var(--plugin-pages); }
  .pages-stage-chrome { pointer-events: auto; }
  .pages-workspace {
    display: flex; flex-direction: column; gap: 0;
    flex: 1; min-height: 0; overflow: auto;
  }
  [data-pages="directory"] :is(.pages-search, [data-pages-empty], [data-pages-rows], [data-pages-search-empty]) { max-width: 36rem; }
  .pages-title {
    display: block; width: min(46rem, calc(100% - 40px)); margin: 20px auto 8px;
    padding: 0; border: 0 !important; border-radius: 0; background: transparent !important;
    color: var(--ink); font-size: 28px; line-height: 1.25; font-weight: 600; outline: none;
    box-shadow: none !important;
  }
  .pages-title::placeholder { color: var(--faint); font-weight: 500; }
  .pages-title:focus, .pages-title:focus-visible {
    border: 0 !important; background: transparent !important; box-shadow: none !important; outline: none !important;
  }
  .pages-editor-host {
    width: min(46rem, calc(100% - 40px)); margin: 0 auto 32px;
    min-height: 12rem;
  }
  .pages-editor-host .ProseMirror {
    min-height: 12rem; padding: 4px 0 72px 72px;
    color: var(--ink); font-size: 16px; line-height: 1.7; outline: none;
  }
  .pages-editor-host .ProseMirror p { margin: 0 0 0.6em; }
  .pages-editor-host .ProseMirror p.is-empty::before {
    content: attr(data-placeholder); color: var(--faint); pointer-events: none; float: left; height: 0;
  }
  .pages-editor-host .ProseMirror h1 { font-size: 1.6em; line-height: 1.3; font-weight: 650; margin: 1.1em 0 0.45em; }
  .pages-editor-host .ProseMirror h2 { font-size: 1.28em; line-height: 1.35; font-weight: 600; margin: 1em 0 0.4em; }
  .pages-editor-host .ProseMirror h3 { font-size: 1.08em; line-height: 1.4; font-weight: 600; margin: 0.9em 0 0.35em; }
  .pages-editor-host .ProseMirror ul, .pages-editor-host .ProseMirror ol { margin: 0 0 0.7em; padding-left: 1.4em; }
  .pages-editor-host .ProseMirror code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.88em; background: var(--rail); padding: 0.1em 0.32em; border-radius: 4px;
  }
  .pages-format-bar {
    position: fixed; z-index: 40; display: flex; gap: 2px; padding: 4px;
    border-radius: 8px; background: var(--paper); color: var(--ink);
    box-shadow: 0 8px 24px color-mix(in srgb, var(--ink) 16%, transparent);
    border: 1px solid var(--line);
  }
  .pages-format-bar[hidden] { display: none; }
  .pages-format-bar button {
    min-width: 28px; height: 28px; padding: 0 7px; border: 0; border-radius: 6px;
    background: transparent; color: inherit; font: inherit; cursor: pointer;
  }
  .pages-format-bar button:hover, .pages-format-bar button.is-on { background: var(--nav-active); }
  .pages-note { margin: 0 20px 16px; font-size: 12px; color: var(--muted); }
  .pages-note.is-error { color: var(--red); }
  .plugin-stage-detail-bar [data-pages-delete] { margin-left: 4px; }
  [data-pages-stage-workspace] .plugin-stage-detail-bar { flex-wrap: wrap; row-gap: 6px; }
  .plugin-stage-list .mw-empty { max-width: 32ch; padding: 8px 8px 16px; }
  .pages-search { display: flex; margin: 0 0 12px; width: min(36rem, 100%); max-width: 36rem; }
  body.immersive-workbench [data-pages="directory"] .pages-search input {
    padding: 0; background: transparent; width: auto; flex: 1; min-width: 0;
  }
  .pages-search-empty { margin: 0 8px 12px; font-size: 12px; color: var(--muted); }
  .pages-chrome-icon { width: 28px; min-width: 28px; height: 28px; padding: 0; display: grid; place-items: center; }
  .pages-chrome-icon svg { width: 14px; height: 14px; }
  .pages-doc-row { display: flex; align-items: stretch; gap: 0; }
  .pages-doc-row > .feed-stage-entry { flex: 1; min-width: 0; }
  .pages-star {
    flex: none; width: 22px; height: 22px; margin: 0 0 0 4px; padding: 0; align-self: center;
    border: 0; border-radius: 6px; background: transparent; color: var(--faint); cursor: pointer; font-size: 13px; line-height: 1;
  }
  .pages-star:hover, .pages-star.is-on { color: var(--ink); }
  .pages-folder-select { max-width: 9.5rem; min-width: 7rem; flex: 0 1 9.5rem; }
  .pages-folder-actions { display: flex; gap: 2px; margin-left: auto; }
  .pages-folder-actions button {
    width: 22px; height: 22px; padding: 0; border: 0; border-radius: 6px;
    background: transparent; color: var(--muted); cursor: pointer; font-size: 12px;
  }
  .pages-folder-actions button:hover { background: var(--nav-hover); color: var(--ink); }
  .pages-template-dialog { width: min(420px, calc(100vw - 32px)); }
  .pages-template-list { display: flex; flex-direction: column; gap: 4px; max-height: min(60vh, 420px); overflow: auto; }
  .pages-template-item {
    display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
    width: 100%; height: auto; min-height: 44px; padding: 8px 10px; text-align: left;
  }
  .pages-template-item strong { font-size: 13px; font-weight: 600; }
  .pages-template-item span { font-size: 12px; color: var(--muted); font-weight: 400; }
  dialog.mw-dialog.creative-confirm { width: min(360px, calc(100vw - 32px)); }
  .creative-confirm-form { display: flex; flex-direction: column; gap: 16px; padding: 18px 20px 16px; }
  .creative-confirm-form p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--ink); }
  .creative-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
  body.immersive-workbench .plugin-stage-workspace > .pages-workspace { flex: 1; min-height: 0; }
  .pages-block-handle {
    display: inline-flex; gap: 1px; width: 68px; margin: 0 4px 0 -72px; vertical-align: middle;
    opacity: 0; transition: opacity 120ms ease;
  }
  .pages-editor-host .ProseMirror > :hover > .pages-block-handle,
  .pages-editor-host .ProseMirror > :hover .pages-block-handle,
  .pages-block-handle:hover, .pages-block-handle:focus-within, .pages-block-handle.has-note,
  .pages-editor-host .ProseMirror > [data-pages-note]:not([data-pages-note=""]) > .pages-block-handle { opacity: 1; }
  .pages-block-handle button {
    width: 16px; height: 20px; padding: 0; border: 0; border-radius: 4px;
    background: transparent; color: var(--muted); cursor: pointer; font-size: 11px; line-height: 1;
  }
  .pages-block-handle button:hover { background: var(--nav-hover); color: var(--ink); }
  .pages-block-handle.has-note .pages-note-btn { color: var(--plugin-pages, var(--ink)); }
  .pages-insert-line {
    display: block; width: 100%; height: 10px; margin: 0; padding: 0; border: 0;
    background: transparent; cursor: text; position: relative;
  }
  .pages-insert-line::after {
    content: ""; position: absolute; left: 0; right: 0; top: 4px; height: 2px; border-radius: 1px;
    background: color-mix(in srgb, var(--plugin-pages, var(--ink)) 55%, transparent); opacity: 0;
    transition: opacity 120ms ease;
  }
  .pages-insert-line:hover::after { opacity: 1; }
  .pages-slash, .pages-pop {
    position: fixed; z-index: 50; min-width: 260px; max-width: min(360px, calc(100vw - 24px)); max-height: 360px; overflow: auto;
    padding: 8px; border: 1px solid var(--line); border-radius: 10px;
    background: var(--paper); box-shadow: 0 12px 32px color-mix(in srgb, var(--ink) 16%, transparent);
    color: var(--ink);
  }
  .pages-slash[hidden], .pages-pop[hidden] { display: none; }
  .pages-slash-item {
    display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
    width: 100%; padding: 8px 10px; border: 0; border-radius: 6px;
    background: transparent; color: var(--ink); text-align: left; cursor: pointer;
  }
  .pages-slash-item span { color: var(--muted); font-size: 12px; }
  .pages-slash-item.is-on, .pages-slash-item:hover { background: var(--nav-hover); }
  .pages-pop { display: flex; flex-direction: column; gap: 8px; }
  .pages-pop p { margin: 0; font-size: 12px; color: var(--muted); }
  .pages-pop label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
  .pages-pop textarea, .pages-pop input, .pages-pop select { width: 100%; }
  .pages-pop-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .pages-pop-error { color: var(--red); }
  .pages-comment {
    background: color-mix(in srgb, var(--hue-cyan, var(--ink)) 16%, transparent);
    border-bottom: 1px dotted color-mix(in srgb, var(--hue-cyan, var(--ink)) 55%, transparent);
    border-radius: 2px;
  }
  .pages-mention {
    color: var(--plugin-pages, var(--ink)); font-weight: 600; cursor: pointer;
    background: color-mix(in srgb, var(--plugin-pages, var(--ink)) 10%, transparent);
    border-radius: 4px; padding: 0 4px;
  }
  .pages-callout {
    margin: 0.7em 0; padding: 10px 12px; border-radius: 8px;
    border-left: 3px solid color-mix(in srgb, var(--hue-cyan, var(--ink)) 55%, transparent);
    background: color-mix(in srgb, var(--hue-cyan, var(--ink)) 10%, var(--paper));
  }
  .pages-callout--warn {
    border-left-color: color-mix(in srgb, var(--amber, #c9a227) 70%, transparent);
    background: color-mix(in srgb, var(--amber, #c9a227) 14%, var(--paper));
  }
  .pages-callout--success {
    border-left-color: color-mix(in srgb, var(--green, #3c8) 70%, transparent);
    background: color-mix(in srgb, var(--green, #3c8) 12%, var(--paper));
  }
  .pages-callout--plain { border-left-color: var(--line); background: var(--rail); }
  .pages-task-list { list-style: none; padding-left: 0; margin: 0 0 0.7em; }
  .pages-task-item, li.pages-task-item { display: flex; gap: 8px; align-items: flex-start; }
  .pages-task-item input[type="checkbox"] { margin-top: 0.35em; }
  .pages-task-item.is-checked .pages-task-content { color: var(--muted); text-decoration: line-through; }
  .pages-editor-host .ProseMirror pre.pages-code {
    margin: 0.7em 0; padding: 12px 14px; border-radius: 8px; background: var(--rail);
    overflow: auto; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px;
  }
  .pages-table { width: 100%; border-collapse: collapse; margin: 0.7em 0; }
  .pages-table th, .pages-table td { border: 1px solid var(--line); padding: 6px 8px; min-width: 6rem; vertical-align: top; }
  .pages-toggle { display: flex; gap: 8px; margin: 0.5em 0; align-items: flex-start; }
  .pages-toggle-caret {
    flex: none; width: 20px; height: 20px; margin-top: 2px; border: 0; border-radius: 4px;
    background: transparent; color: var(--muted); cursor: pointer;
  }
  .pages-toggle-caret::before { content: "▸"; display: block; }
  .pages-toggle.is-open .pages-toggle-caret::before { content: "▾"; }
  .pages-toggle:not(.is-open) .pages-toggle-body > :not(:first-child) { display: none; }
  .pages-toggle-body > p:first-child { font-weight: 600; margin-bottom: 0.35em; }
  .pages-hr { border: 0; border-top: 1px solid var(--line); margin: 1.2em 0; }
  .pages-toc {
    margin: 0.8em 0; padding: 10px 14px; border-radius: 8px; background: var(--rail); color: var(--ink);
  }
  .pages-toc-label { margin: 0 0 6px; font-size: 11px; color: var(--muted); }
  .pages-toc ol { margin: 0; padding-left: 1.1em; }
  .pages-toc li[data-level="2"] { margin-left: 1em; }
  .pages-toc li[data-level="3"] { margin-left: 2em; }
  .pages-card {
    display: flex; flex-direction: column; gap: 4px; margin: 0.7em 0; padding: 12px 14px;
    border: 1px solid var(--line); border-radius: 10px; background: color-mix(in srgb, var(--rail) 70%, var(--paper));
    cursor: pointer;
    transition: border-color 120ms ease, background-color 120ms ease;
  }
  .pages-card:hover {
    border-color: color-mix(in srgb, var(--plugin-pages, var(--ink)) 28%, var(--line));
    background: color-mix(in srgb, var(--plugin-pages, var(--ink)) 6%, var(--paper));
  }
  .pages-card strong { font-size: 14px; }
  .pages-card span { font-size: 12px; color: var(--muted); }
  .pages-card p { margin: 0; font-size: 13px; color: var(--ink-soft, var(--ink)); }
  .pages-card--task.is-done { opacity: 0.72; }
  .pages-calendar { margin: 0.8em 0; padding: 12px 14px; border-radius: 10px; background: var(--rail); }
  .pages-calendar header { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
  .pages-calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .pages-calendar-grid span {
    display: grid; place-items: center; height: 28px; border-radius: 6px; font-size: 12px; color: var(--muted);
  }
  .pages-calendar-grid span.is-weekday { height: 20px; font-size: 11px; color: var(--faint); }
  .pages-calendar-grid span.is-today { color: var(--ink); box-shadow: inset 0 0 0 1px var(--line); }
  .pages-calendar-grid span.is-on {
    background: color-mix(in srgb, var(--plugin-pages, var(--ink)) 18%, transparent); color: var(--ink); font-weight: 600;
  }
`;
