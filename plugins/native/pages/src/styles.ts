import { PAGES_TONES } from "./tone.js";

const CALLOUT_TONE_RULES = PAGES_TONES.map((tone) => `
  .pages-callout[data-pages-callout="${tone.id}"] { background: var(--hue-${tone.id}-soft); }
  .pages-callout[data-pages-callout="${tone.id}"] .pages-callout-mark { color: var(--hue-${tone.id}); }
`).join("");

const TONE_RULES = PAGES_TONES.map((tone) => `
  .pages-editor-host .ProseMirror [data-pages-ink="${tone.id}"] { color: var(--hue-${tone.id}); }
  .pages-editor-host .ProseMirror [data-pages-wash="${tone.id}"] { background: var(--hue-${tone.id}-soft); }
  .pages-tone[data-pages-tone="${tone.id}"] { color: var(--hue-${tone.id}); background: var(--hue-${tone.id}-soft); }
`).join("");

export const PAGES_STYLES = `
  [data-pages="workbench"] { --plugin-tint: var(--plugin-pages); }
  [data-pages="workbench"] .pages-format-bar,
  [data-pages="workbench"] .pages-slash,
  [data-pages="workbench"] .pages-pop,
  [data-pages="workbench"] .pages-block-handle,
  [data-pages="workbench"] .pages-block-menu,
  [data-pages="workbench"] .pages-block-ghost,
  [data-pages="workbench"] .pages-drop-line { position: fixed; }
  .pages-stage-chrome { pointer-events: auto; }
  .pages-workspace {
    display: flex; flex-direction: column; gap: 0;
    flex: 1; min-height: 0; overflow: auto;
    scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent;
    background: var(--content-paper, var(--paper));
    color: var(--content-ink, var(--ink));
  }
  [data-pages-stage-workspace] { background: var(--content-paper, var(--paper)); }
  [data-pages="directory"] :is(.pages-search, [data-pages-empty], [data-pages-rows], [data-pages-search-empty]) { max-width: 36rem; }
  [data-pages="directory"] .pages-search { width: min(36rem, 100%); margin: 0 0 14px; box-sizing: border-box; }
  body.immersive-workbench [data-pages="directory"] .feed-stage-entry,
  body.immersive-workbench .plugin-stage-shell[data-expanded="true"] [data-pages="directory"] .feed-stage-entry,
  body.immersive-workbench .plugin-stage-shell[data-expanded="true"] [data-pages="directory"] .feed-stage-entry:has(.plugin-stage-kind) {
    grid-template-columns: minmax(0, 1fr) max-content;
  }
  [data-pages="directory"] .plugin-stage-meta { font-variant-numeric: tabular-nums; color: var(--faint); }
  .pages-create {
    display: inline-flex; align-items: stretch; position: relative;
    border-radius: 8px;
  }
  .pages-create .tree-create { border-radius: 8px 0 0 8px; padding-right: 8px; }
  .pages-create-more {
    width: 26px; min-width: 26px; height: auto; padding: 0;
    border-radius: 0 8px 8px 0; color: var(--muted);
  }
  .pages-create-more svg { width: 14px; height: 14px; }
  .pages-create-more:hover, .pages-create-more[aria-expanded="true"] { color: var(--ink); background: var(--nav-hover); }
  .pages-create-menu {
    position: absolute; left: 0; top: calc(100% + 6px); z-index: 30;
    min-width: 196px;
  }
  .pages-title {
    display: block; width: min(46rem, calc(100% - 48px)); margin: 40px auto 4px;
    padding: 0 24px 0 52px; border: 0 !important; border-radius: 0; background: transparent !important;
    color: var(--content-ink, var(--ink)); font-size: 40px; line-height: 1.2; font-weight: 700;
    letter-spacing: -0.03em; outline: none; box-shadow: none !important;
  }
  .pages-title::placeholder { color: var(--faint); font-weight: 600; }
  .pages-title:focus, .pages-title:focus-visible,
  body.immersive-workbench [data-pages="workbench"] .pages-title:focus,
  body.immersive-workbench [data-pages="workbench"] .pages-title:focus-visible {
    border: 0 !important; background: transparent !important; box-shadow: none !important; outline: none !important;
  }
  body.immersive-workbench [data-pages="workbench"] ::selection,
  body.immersive-workbench [data-pages="workbench"] ::-moz-selection,
  .pages-title::selection, .pages-title::-moz-selection,
  .pages-editor-host .ProseMirror::selection, .pages-editor-host .ProseMirror ::selection,
  .pages-editor-host .ProseMirror::-moz-selection, .pages-editor-host .ProseMirror ::-moz-selection {
    background: var(--content-select) !important; color: inherit !important;
  }
  .pages-editor-host {
    width: min(46rem, calc(100% - 48px)); margin: 0 auto 64px;
    min-height: 12rem;
    --pages-gutter: 76px;
  }
  .pages-editor-host, .pages-editor-host .ProseMirror {
    outline: none !important; box-shadow: none !important; border: 0;
  }
  .pages-editor-host .ProseMirror {
    min-height: 12rem; padding: 4px 24px 120px var(--pages-gutter);
    color: var(--content-ink, var(--ink)); font-size: 16px; line-height: 1.7;
    caret-color: var(--content-ink, var(--ink));
  }
  .pages-editor-host .ProseMirror:focus, .pages-editor-host .ProseMirror:focus-visible,
  body.immersive-workbench [data-pages="workbench"] .pages-editor-host .ProseMirror:focus,
  body.immersive-workbench [data-pages="workbench"] .pages-editor-host .ProseMirror:focus-visible,
  body.immersive-workbench [data-pages="workbench"] .pages-editor-host:focus-within {
    outline: none !important; box-shadow: none !important; border-color: transparent;
  }
  .pages-editor-host .ProseMirror > :not(.pages-insert-line) {
    border-radius: 6px;
  }
  .pages-editor-host .ProseMirror > * {
    transition: background var(--motion-fast, 130ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1)),
      box-shadow var(--motion-fast, 130ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1));
  }
  .pages-editor-host .ProseMirror .is-block-hover {
    background: var(--content-hover, color-mix(in srgb, var(--ink) 5.5%, var(--paper)));
    box-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 8%, transparent);
    border-radius: 6px;
  }
  .pages-editor-host .ProseMirror .is-block-selected {
    background: var(--content-select);
    border-radius: 6px;
  }
  .pages-editor-host .ProseMirror .ProseMirror-selectednode,
  .pages-editor-host .ProseMirror > .ProseMirror-selectednode {
    outline: none !important;
    box-shadow: none !important;
    background: var(--content-select);
    border-radius: 6px;
  }
  body.immersive-workbench [data-pages="directory"] .feed-stage-entry:focus-visible {
    outline: none; background: var(--nav-hover);
  }
  .pages-editor-host .ProseMirror p { margin: 0 0 0.55em; }
  .pages-editor-host .ProseMirror :is(p, h1, h2, h3).is-empty::before {
    content: attr(data-placeholder); color: var(--faint); pointer-events: none; float: left; height: 0;
    font-weight: inherit;
  }
  .pages-editor-host .ProseMirror h1 { font-size: 1.55em; line-height: 1.3; font-weight: 650; letter-spacing: -0.02em; margin: 1.35em 0 0.4em; }
  .pages-editor-host .ProseMirror h2 { font-size: 1.22em; line-height: 1.35; font-weight: 600; margin: 1.2em 0 0.35em; }
  .pages-editor-host .ProseMirror h3 { font-size: 1.05em; line-height: 1.4; font-weight: 600; margin: 1.05em 0 0.3em; }
  .pages-editor-host .ProseMirror ul, .pages-editor-host .ProseMirror ol { margin: 0 0 0.7em; padding-left: 1.5em; }
  .pages-editor-host .ProseMirror li { margin: 0.15em 0; }
  .pages-editor-host .ProseMirror li > p { margin: 0; }
  .pages-editor-host .ProseMirror li > :is(ul, ol, .pages-task-list) { margin: 0.15em 0 0; }
  .pages-editor-host .ProseMirror ul { list-style: disc; }
  .pages-editor-host .ProseMirror ul ul { list-style: circle; }
  .pages-editor-host .ProseMirror ul ul ul { list-style: square; }
  .pages-editor-host .ProseMirror ol { list-style: decimal; }
  .pages-editor-host .ProseMirror ol ol { list-style: lower-alpha; }
  .pages-editor-host .ProseMirror ol ol ol { list-style: lower-roman; }
  .pages-editor-host .ProseMirror li::marker { color: var(--muted); }
  .pages-editor-host .ProseMirror .pages-task-list .pages-task-list { padding-left: 1.5em; }
  .pages-editor-host .ProseMirror a, .pages-editor-host .ProseMirror .pages-link {
    color: var(--plugin-pages, var(--ink));
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--plugin-pages, var(--ink)) 40%, transparent);
    text-underline-offset: 2px; cursor: pointer;
  }
  .pages-editor-host .ProseMirror a:hover {
    text-decoration-color: var(--plugin-pages, var(--ink));
    background: color-mix(in srgb, var(--plugin-pages, var(--ink)) 8%, transparent);
    border-radius: 3px;
  }
  .pages-editor-host .ProseMirror mark[data-pages-wash] {
    color: inherit; border-radius: 3px;
    padding: 0.05em 0.16em; margin: 0 -0.04em;
    box-decoration-break: clone; -webkit-box-decoration-break: clone;
  }
  ${TONE_RULES}
  .pages-format-bar button[data-mark="tone"] {
    font-weight: 600; position: relative;
  }
  .pages-format-bar button[data-mark="tone"]::after {
    content: ""; position: absolute; left: 50%; bottom: 5px;
    width: 13px; height: 2px; border-radius: 1px; transform: translateX(-50%);
    background: linear-gradient(90deg, var(--hue-red), var(--hue-yellow), var(--hue-blue));
  }
  .pages-tone-strip { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 2px 6px; }
  .pages-tone-strip + .pages-menu-label { padding-top: 4px; border-top: 1px solid var(--line); }
  .pages-tone {
    width: 22px; height: 22px; padding: 0; border-radius: 6px; cursor: pointer;
    border: 1px solid var(--line); background: var(--paper); color: var(--ink);
    font: inherit; font-size: 11px; font-weight: 600; line-height: 20px;
    display: grid; place-items: center;
    transition: transform 90ms ease, border-color 120ms ease;
  }
  .pages-tone::before { content: "A"; }
  .pages-tone:hover { transform: scale(1.12); border-color: var(--line-strong); }
  .pages-tone:focus-visible { outline: none; box-shadow: var(--focus-stroke); }
  .pages-tone.is-on { border-color: var(--ink); }
  .pages-editor-host .ProseMirror code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.88em; background: var(--content-field, color-mix(in srgb, var(--rail) 80%, var(--paper)));
    padding: 0.12em 0.34em; border-radius: 4px;
  }
  .pages-format-bar {
    position: fixed; z-index: 40; display: flex; align-items: center; gap: 0; padding: 3px;
    border-radius: 8px; background: var(--paper); color: var(--ink);
    box-shadow: var(--shadow-raised);
  }
  .pages-format-bar[hidden], .pages-slash[hidden], .pages-pop[hidden], .pages-more-menu[hidden],
  .pages-move-menu[hidden], .pages-block-handle[hidden], .pages-block-menu[hidden],
  .pages-block-ghost[hidden], .pages-drop-line[hidden],
  .pages-create-menu[hidden] { display: none; }
  .pages-format-bar:not([hidden]), .pages-slash:not([hidden]), .pages-pop:not([hidden]), .pages-more-menu:not([hidden]), .pages-block-menu:not([hidden]), .pages-create-menu:not([hidden]) {
    animation: pages-rise var(--motion-fast, 130ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1));
  }
  @keyframes pages-rise {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: none; }
  }
  .pages-format-bar button {
    min-width: 28px; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px;
    background: transparent; color: var(--ink); font: inherit; font-size: 12px; font-weight: 650; cursor: pointer;
  }
  .pages-format-bar button[data-mark="h1"],
  .pages-format-bar button[data-mark="h2"],
  .pages-format-bar button[data-mark="h3"] { width: 32px; min-width: 32px; letter-spacing: -0.03em; }
  .pages-format-bar button svg { width: 15px; height: 15px; display: block; margin: 0 auto; color: var(--ink); }
  .pages-format-bar button[data-mark="strong"] { font-weight: 700; }
  .pages-format-bar button[data-mark="em"] { font-style: italic; font-weight: 500; }
  .pages-format-bar button[data-mark="underline"] { text-decoration: underline; text-underline-offset: 2px; font-weight: 500; }
  .pages-format-bar button[data-mark="strike"] { text-decoration: line-through; font-weight: 500; }
  .pages-format-bar button:hover, .pages-format-bar button.is-on { background: var(--nav-hover); }
  .pages-format-gap {
    width: 1px; height: 14px; margin: 0 3px; background: var(--line); flex: none;
  }
  .pages-note {
    position: absolute; left: 50%; bottom: 22px; z-index: 8;
    margin: 0; padding: 8px 14px; border-radius: 8px;
    background: var(--action); color: var(--action-ink);
    font-size: 12px; transform: translateX(-50%);
    max-width: min(420px, calc(100% - 32px)); text-align: center;
    box-shadow: var(--shadow-soft);
  }
  .pages-note.is-error { background: var(--red); color: var(--paper); }
  .plugin-stage-detail-bar [data-pages-delete] { margin-left: 0; }
  [data-pages-stage-workspace] .plugin-stage-detail-bar { flex-wrap: nowrap; background: transparent; }
  [data-pages-stage-workspace] .plugin-stage-detail-bar > h1 { color: var(--muted); font-weight: 400; }
  .pages-editor-tools {
    display: flex; align-items: center; gap: 2px; margin-left: auto; position: relative; flex: none;
  }
  .pages-more-menu {
    position: absolute; right: 0; top: calc(100% + 6px); z-index: 30;
    display: flex; flex-direction: column; gap: 2px;
    width: 228px; padding: 6px;
  }
  .pages-more-field {
    display: flex; flex-direction: column; gap: 4px;
    padding: 8px 10px 10px; font-size: 11px; color: var(--muted);
  }
  .pages-more-menu .mw-select, .pages-more-menu .mw-select-picker, .pages-more-menu .pages-folder-select {
    width: 100%; max-width: none; min-width: 0; flex: none;
  }
  .pages-more-menu [data-pages-delete] { color: var(--red); }
  [data-pages-star-editor].is-on, .pages-star.is-on { color: var(--amber, var(--ink)); }
  .plugin-stage-list .mw-empty { max-width: 32ch; padding: 8px 8px 16px; }
  .pages-search-empty { margin: 0 0 12px; font-size: 12px; color: var(--muted); }
  .pages-chrome-icon { width: 28px; min-width: 28px; height: 28px; padding: 0; display: grid; place-items: center; }
  .pages-chrome-icon svg { width: 14px; height: 14px; }
  .pages-doc-row {
    display: grid; grid-template-columns: minmax(0, 1fr); align-items: stretch;
    position: relative; border-radius: 8px;
    transition: background-color 90ms var(--ease-out, cubic-bezier(.16, 1, .3, 1)),
      box-shadow 90ms var(--ease-out, cubic-bezier(.16, 1, .3, 1));
  }
  .pages-doc-row > .feed-stage-entry { flex: 1; min-width: 0; padding-right: 58px; background: transparent; }
  body.immersive-workbench [data-pages="directory"] .pages-doc-row:hover {
    background: var(--nav-hover);
    box-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 7%, transparent);
  }
  body.immersive-workbench [data-pages="directory"] .pages-doc-row.is-selected,
  body.immersive-workbench [data-pages="directory"] .pages-doc-row:has(.feed-stage-entry.is-selected) {
    background: var(--nav-active);
    box-shadow: none;
  }
  body.immersive-workbench [data-pages="directory"] .pages-doc-row .feed-stage-entry:is(.is-selected, [aria-selected="true"]),
  body.immersive-workbench [data-pages="directory"] .pages-doc-row:hover .feed-stage-entry {
    background: transparent;
  }
  [data-pages="directory"] .feed-stage-leading {
    display: flex; align-items: center; gap: 8px; min-width: 0;
  }
  .pages-doc-mark {
    display: grid; place-items: center; width: 18px; height: 18px; color: var(--mark-slate, var(--muted)); flex: none;
  }
  .pages-doc-mark svg { width: 14px; height: 14px; }
  .pages-doc-row.is-dragging { opacity: .45; }
  .pages-doc-row.creative-artifact-row { display: flex; align-items: center; }
  body.immersive-workbench .pages-doc-row.creative-artifact-row > .feed-stage-entry { flex: 1 1 auto; min-width: 0; width: auto; padding-right: 8px; }
  .creative-artifact-act {
    display: inline-flex; align-items: center; flex: none; height: 28px; max-width: 28px;
    margin-right: 4px; padding: 0; overflow: hidden; border: 0; border-radius: 6px;
    background: transparent; color: var(--muted); cursor: pointer;
    transition: max-width var(--motion-fast, 130ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1)),
      background-color var(--motion-fast, 130ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1)),
      color var(--motion-fast, 130ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1));
  }
  .creative-artifact-act svg { width: 14px; height: 14px; flex: none; margin: 0 7px; }
  .creative-artifact-act span { overflow: hidden; white-space: nowrap; font-size: 12px; line-height: 28px; padding-right: 8px; }
  .creative-artifact-act:hover, .creative-artifact-act:focus-visible {
    max-width: 11rem; color: var(--ink); background: color-mix(in srgb, var(--ink) 8%, var(--paper));
  }
  .pages-doc-row:has(.creative-artifact-act:hover) .pages-row-act,
  .pages-doc-row:has(.creative-artifact-act:focus-visible) .pages-row-act { opacity: 0; }
  @media (prefers-reduced-motion: reduce) { .creative-artifact-act { transition: none; } }
  .pages-row-actions {
    position: absolute; right: 36px; top: 50%; transform: translateY(-50%);
    display: flex; align-items: center; flex: none; z-index: 1;
  }
  .pages-row-act {
    flex: none; width: 24px; height: 24px; margin: 0; padding: 0;
    border: 0; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer;
    opacity: 0; transition: opacity var(--motion-fast, 130ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1)),
      color var(--motion-fast, 130ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1)),
      background-color var(--motion-fast, 130ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1));
  }
  .pages-row-act svg { width: 13px; height: 13px; display: block; margin: 0 auto; }
  .pages-doc-row:hover .pages-row-act, .pages-doc-row:focus-within .pages-row-act,
  .pages-row-act.is-on, .pages-row-act:focus-visible,
  .pages-row-act[aria-expanded="true"] { opacity: 1; }
  .pages-doc-row:hover .plugin-stage-meta, .pages-doc-row:focus-within .plugin-stage-meta { opacity: 0; }
  .pages-row-act:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 6%, transparent); }
  .pages-move-menu:not([hidden]) {
    position: fixed; z-index: 40; inset: unset; margin: 0;
  }
  .pages-move-menu .mw-menu__item.is-current { font-weight: 600; }
  .goal-collection-fold.is-drop > summary {
    background: var(--nav-active); color: var(--ink);
  }
  .pages-folder-actions { display: flex; gap: 2px; margin-left: auto; opacity: 0;
    transition: opacity var(--motion-fast, 130ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1));
  }
  .goal-collection-fold > summary:hover .pages-folder-actions,
  .pages-folder-actions:focus-within { opacity: 1; }
  .pages-folder-actions button {
    width: 22px; height: 22px; padding: 0; border: 0; border-radius: 6px;
    background: transparent; color: var(--muted); cursor: pointer; display: grid; place-items: center;
  }
  .pages-folder-actions button svg { width: 12px; height: 12px; }
  .pages-folder-actions button:hover { background: var(--nav-hover); color: var(--ink); }
  .pages-template-dialog { width: min(420px, calc(100vw - 32px)); }
  .pages-template-list { display: flex; flex-direction: column; gap: 2px; max-height: min(60vh, 420px); overflow: auto; }
  .pages-template-item {
    display: flex; flex-direction: row; align-items: flex-start; gap: 10px;
    width: 100%; height: auto; min-height: 48px; padding: 8px 10px; text-align: left;
  }
  .pages-template-mark {
    display: grid; place-items: center; width: 32px; height: 32px; flex: none; margin-top: 1px;
    border-radius: 8px; background: var(--content-field, var(--rail)); color: var(--mark-slate, var(--muted));
  }
  .pages-template-item svg, .pages-template-mark svg { width: 16px; height: 16px; }
  .pages-template-item span { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .pages-template-item strong { font-size: 13px; font-weight: 600; }
  .pages-template-item em { font-size: 12px; color: var(--muted); font-style: normal; font-weight: 400; }
  dialog.mw-dialog.creative-confirm { width: min(360px, calc(100vw - 32px)); }
  .creative-confirm-form { display: flex; flex-direction: column; gap: 16px; padding: 18px 20px 16px; }
  .creative-confirm-form p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--ink); }
  .creative-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
  body.immersive-workbench .plugin-stage-workspace > .pages-workspace { flex: 1; min-height: 0; }
  .pages-block-handle {
    position: fixed; z-index: 12; display: inline-flex; gap: 0; width: 44px; height: 24px;
    margin: 0; padding: 0; pointer-events: auto;
  }
  .pages-block-handle:not([hidden]) {
    animation: pages-fade var(--motion-fast, 130ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1));
  }
  @keyframes pages-fade { from { opacity: 0; } to { opacity: 1; } }
  .pages-block-handle button {
    width: 22px; height: 24px; padding: 0; border: 0; border-radius: 4px;
    background: transparent; color: var(--faint); cursor: grab; display: grid; place-items: center;
  }
  .pages-block-handle [data-pages-plus] { cursor: pointer; }
  html.is-pages-dragging { user-select: none; }
  html.is-pages-dragging, html.is-pages-dragging * { cursor: grabbing !important; }
  .pages-block-handle button svg { width: 16px; height: 16px; }
  .pages-block-handle button:hover { background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--ink); }
  .pages-block-handle.has-note [data-pages-grip] { position: relative; }
  .pages-block-handle.has-note [data-pages-grip]::after {
    content: ""; position: absolute; top: 3px; right: 3px; width: 5px; height: 5px;
    border-radius: 50%; background: var(--plugin-pages, var(--ink));
  }
  .pages-block-menu {
    position: fixed; z-index: 40; inset: unset; margin: 0; min-width: 176px;
    max-height: min(60vh, 420px); overflow: auto;
  }
  .pages-menu-label {
    margin: 6px 10px 2px; font-size: 11px; font-weight: 500; color: var(--faint); letter-spacing: 0.02em;
  }
  .pages-editor-host .ProseMirror-gapcursor { display: none; pointer-events: none; position: absolute; }
  .pages-editor-host .ProseMirror-gapcursor::after {
    content: ""; display: block; position: absolute; top: -2px; width: 22px;
    border-top: 1.5px solid var(--ink);
    animation: pages-caret 1.1s steps(2, start) infinite;
  }
  .pages-editor-host .ProseMirror-focused .ProseMirror-gapcursor { display: block; }
  @keyframes pages-caret { to { visibility: hidden; } }
  .pages-native-drop {
    border-color: var(--plugin-pages, var(--ink)) !important; border-radius: 2px;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--plugin-pages, var(--ink)) 18%, transparent);
  }
  .pages-drag-count {
    position: absolute; top: -8px; right: -8px; min-width: 18px; height: 18px; padding: 0 5px;
    border-radius: 9px; background: var(--plugin-pages, var(--ink)); color: var(--paper);
    font-size: 11px; font-weight: 650; display: grid; place-items: center;
  }
  .pages-block-ghost {
    position: fixed; left: 0; top: 0; z-index: 28; pointer-events: none;
    margin: 0; padding: 4px 8px; border-radius: 6px;
    background: var(--content-paper, var(--paper)); color: var(--content-ink, var(--ink));
    box-shadow: var(--shadow-raised); opacity: 0.92; will-change: transform;
  }
  .pages-drop-line {
    position: fixed; z-index: 27; pointer-events: none; height: 3px; border-radius: 2px;
    background: var(--plugin-pages, var(--ink));
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--plugin-pages, var(--ink)) 18%, transparent);
    transition: left 70ms var(--ease-out, cubic-bezier(.16, 1, .3, 1)),
      width 70ms var(--ease-out, cubic-bezier(.16, 1, .3, 1));
  }
  .pages-drop-line::before {
    content: ""; position: absolute; left: -3px; top: -3px; width: 8px; height: 8px;
    border-radius: 50%; background: var(--plugin-pages, var(--ink));
  }
  .pages-editor-host .ProseMirror .is-dragging { opacity: 0.4; }
  .pages-insert-line {
    display: block; width: 100%; height: 8px; margin: 0; padding: 0; border: 0;
    background: transparent; cursor: text; position: relative;
  }
  .pages-insert-line::after {
    content: ""; position: absolute; left: 0; right: 8px; top: 3px; height: 2px; border-radius: 1px;
    background: color-mix(in srgb, var(--plugin-pages, var(--ink)) 45%, transparent); opacity: 0;
    transition: opacity 80ms var(--ease-out, cubic-bezier(.16, 1, .3, 1));
  }
  .pages-insert-line:hover::after { opacity: 1; }
  .pages-slash, .pages-pop {
    position: fixed; z-index: 50; min-width: 280px; max-width: min(320px, calc(100vw - 24px)); max-height: 380px; overflow: auto;
    padding: 6px; border-radius: 10px;
    background: var(--paper); box-shadow: var(--shadow-raised);
    color: var(--ink);
  }
  .pages-slash-group {
    margin: 8px 10px 4px; font-size: 11px; font-weight: 500; color: var(--faint); letter-spacing: 0.02em;
  }
  .pages-slash-group:first-child { margin-top: 4px; }
  .pages-slash-item {
    display: grid; grid-template-columns: 36px minmax(0, 1fr); align-items: center; gap: 8px;
    width: 100%; padding: 4px 6px; border: 0; border-radius: 6px;
    background: transparent; color: var(--ink); text-align: left; cursor: pointer;
  }
  .pages-slash-icon {
    display: grid; place-items: center; width: 36px; height: 36px; border-radius: 8px;
    background: var(--content-field, var(--rail)); color: var(--ink);
  }
  .pages-slash-icon svg { width: 16px; height: 16px; }
  .pages-slash-copy { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .pages-slash-item strong { font-size: 14px; font-weight: 500; }
  .pages-slash-item .pages-slash-hint { color: var(--faint); font-size: 12px; font-style: normal; font-weight: 400; }
  .pages-slash-item.is-on, .pages-slash-item:hover { background: var(--nav-hover); }
  .pages-slash > p, .pages-pop > p { margin: 8px 10px; font-size: 12px; color: var(--muted); }
  .pages-pop { display: flex; flex-direction: column; gap: 6px; padding: 8px; }
  .pages-pop label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
  .pages-pop textarea, .pages-pop input, .pages-pop select { width: 100%; }
  .pages-pop-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .pages-pop-error { color: var(--red); }
  .pages-comment {
    background: color-mix(in srgb, var(--hue-cyan, var(--ink)) 14%, transparent);
    border-radius: 2px;
  }
  .pages-mention {
    color: var(--plugin-pages, var(--ink)); font-weight: 600; cursor: pointer;
    background: color-mix(in srgb, var(--plugin-pages, var(--ink)) 10%, transparent);
    border-radius: 4px; padding: 0 4px;
  }
  .pages-quote {
    position: relative; margin: 0.7em 0; padding: 2px 0 2px 16px;
  }
  .pages-quote::before {
    content: ""; position: absolute; left: 0; top: 0.2em; bottom: 0.2em; width: 3px; border-radius: 2px;
    background: var(--plugin-pages, var(--ink));
  }
  .pages-callout {
    display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 10px; align-items: start;
    margin: 0.35em 0; padding: 10px 14px; border-radius: 8px;
    background: var(--hue-cyan-soft, color-mix(in srgb, var(--hue-cyan) 10%, var(--paper)));
    color: var(--ink);
  }
  .pages-callout-mark {
    display: grid; place-items: center; width: 22px; height: 22px; margin-top: 1px; color: var(--hue-cyan, var(--muted));
  }
  .pages-callout-mark svg { width: 16px; height: 16px; display: block; }
  .pages-callout-body > :first-child { margin-top: 0; }
  .pages-callout-body > :last-child { margin-bottom: 0; }
  ${CALLOUT_TONE_RULES}
  .pages-callout-mark[data-pages-callout-pick] {
    border: 0; padding: 0; background: transparent; cursor: pointer; border-radius: 6px;
    transition: background var(--motion-fast, 130ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1));
  }
  .pages-callout-mark[data-pages-callout-pick]:hover { background: color-mix(in srgb, var(--ink) 9%, transparent); }
  .pages-callout-mark[data-pages-callout-pick]:focus-visible { outline: none; box-shadow: var(--focus-stroke); }
  .pages-icon-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; padding: 0 2px 6px; }
  .pages-icon-pick {
    width: 26px; height: 26px; padding: 0; border-radius: 6px; cursor: pointer;
    border: 1px solid transparent; background: transparent; color: var(--muted);
    display: grid; place-items: center;
    transition: background var(--motion-fast, 130ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1));
  }
  .pages-icon-pick svg { width: 15px; height: 15px; display: block; }
  .pages-icon-pick:hover { background: var(--nav-hover); color: var(--ink); }
  .pages-icon-pick:focus-visible { outline: none; box-shadow: var(--focus-stroke); }
  .pages-icon-pick.is-on { border-color: var(--ink); color: var(--ink); }
  .pages-task-list { list-style: none; padding-left: 0; margin: 0 0 0.7em; }
  .pages-task-item, li.pages-task-item { display: flex; gap: 8px; align-items: flex-start; }
  .pages-task-item input[type="checkbox"] { margin-top: 0.4em; accent-color: var(--plugin-pages, var(--ink)); }
  .pages-task-item.is-checked .pages-task-content { color: var(--muted); text-decoration: line-through; }
  .pages-editor-host .ProseMirror pre.pages-code {
    margin: 0; padding: 10px 14px 12px; border-radius: 0 0 8px 8px;
    background: var(--content-field, color-mix(in srgb, var(--ink) 4%, var(--paper)));
    overflow: auto; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px;
    line-height: 1.6; tab-size: 2;
  }
  .pages-editor-host .ProseMirror pre.pages-code code {
    background: none; padding: 0; border-radius: 0; font-size: inherit;
  }
  .pages-code-block { margin: 0.5em 0; }
  /* A real strip above the code, not an overlay: the language stays readable without hovering. */
  .pages-code-bar {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 3px 8px 3px 6px; border-radius: 8px 8px 0 0;
    background: color-mix(in srgb, var(--ink) 6%, var(--content-field, var(--paper)));
    border-bottom: 1px solid color-mix(in srgb, var(--ink) 6%, transparent);
    user-select: none;
  }
  .pages-code-language {
    height: 22px; padding: 0 4px; border: 0; border-radius: 5px; cursor: pointer;
    background: transparent; color: var(--muted);
    font: inherit; font-size: 11px; letter-spacing: 0.01em;
  }
  .pages-code-language:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 7%, transparent); }
  .pages-code-language:focus-visible { outline: none; box-shadow: var(--focus-stroke); }
  .pages-code-copy {
    width: 22px; height: 22px; padding: 0; border: 0; border-radius: 5px; cursor: pointer;
    background: transparent; color: var(--faint); display: grid; place-items: center;
    opacity: 0; transition: opacity var(--motion-fast, 130ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1));
  }
  .pages-code-block:hover .pages-code-copy,
  .pages-code-copy:focus-visible, .pages-code-copy.is-done { opacity: 1; }
  .pages-code-copy svg { width: 13px; height: 13px; }
  .pages-code-copy:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 7%, transparent); }
  .pages-code-copy:focus-visible { outline: none; box-shadow: var(--focus-stroke); }
  .pages-code-copy.is-done { color: var(--hue-green); }
  .pages-editor-host .ProseMirror .hljs-comment, .pages-editor-host .ProseMirror .hljs-quote {
    color: var(--faint); font-style: italic;
  }
  .pages-editor-host .ProseMirror :is(.hljs-keyword, .hljs-literal, .hljs-type, .hljs-built_in, .hljs-selector-tag) {
    color: var(--hue-purple);
  }
  .pages-editor-host .ProseMirror :is(.hljs-string, .hljs-regexp, .hljs-addition, .hljs-char.escape_) {
    color: var(--hue-green);
  }
  .pages-editor-host .ProseMirror :is(.hljs-number, .hljs-symbol, .hljs-bullet) { color: var(--hue-orange); }
  .pages-editor-host .ProseMirror :is(.hljs-title, .hljs-section, .hljs-selector-id, .hljs-class) { color: var(--hue-blue); }
  .pages-editor-host .ProseMirror :is(.hljs-attr, .hljs-attribute, .hljs-property, .hljs-variable, .hljs-template-variable) {
    color: var(--hue-cyan);
  }
  .pages-editor-host .ProseMirror :is(.hljs-name, .hljs-tag, .hljs-selector-class) { color: var(--hue-red); }
  .pages-editor-host .ProseMirror :is(.hljs-meta, .hljs-doctag, .hljs-params) { color: var(--hue-brown); }
  .pages-editor-host .ProseMirror .hljs-deletion { color: var(--hue-red); }
  .pages-editor-host .ProseMirror :is(.hljs-emphasis) { font-style: italic; }
  .pages-editor-host .ProseMirror :is(.hljs-strong) { font-weight: 650; }
  .pages-table { width: 100%; border-collapse: collapse; margin: 0.5em 0; }
  .pages-table th, .pages-table td { border-bottom: 1px solid var(--content-line, var(--line)); padding: 6px 8px; min-width: 6rem; vertical-align: top; }
  .pages-table th { font-weight: 600; text-align: left; color: var(--muted); }
  .pages-toggle { display: flex; gap: 6px; margin: 0.45em 0; align-items: flex-start; }
  .pages-toggle-caret {
    flex: none; width: 22px; height: 22px; margin-top: 1px; padding: 0; border: 0; border-radius: 6px;
    background: transparent; color: var(--muted); cursor: pointer; display: grid; place-items: center;
  }
  .pages-toggle-caret svg {
    width: 14px; height: 14px;
    transition: transform var(--motion-fast, 130ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1));
  }
  .pages-toggle.is-open .pages-toggle-caret svg { transform: rotate(90deg); }
  .pages-toggle-caret:hover { background: var(--nav-hover); color: var(--ink); }
  .pages-toggle:not(.is-open) .pages-toggle-body > :not(:first-child) { display: none; }
  .pages-toggle-body > p:first-child { font-weight: 600; margin-bottom: 0.35em; }
  .pages-hr { border: 0; border-top: 1px solid var(--content-line, var(--line)); margin: 1.4em 0; }
  .pages-toc { margin: 0.6em 0 1em; padding: 0; color: var(--ink); }
  .pages-toc-label { margin: 0 0 8px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .pages-toc ol { margin: 0; padding-left: 1.1em; }
  .pages-toc li { margin: 0.2em 0; color: var(--ink-soft, var(--ink)); }
  .pages-toc li[data-level="2"] { margin-left: 1em; }
  .pages-toc li[data-level="3"] { margin-left: 2em; }
  .pages-card {
    display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 10px; align-items: start;
    margin: 0.35em 0; padding: 8px 10px;
    border-radius: 8px; background: var(--content-field, color-mix(in srgb, var(--ink) 3.5%, var(--paper)));
    cursor: pointer;
    transition: background-color 80ms var(--ease-out, cubic-bezier(.16, 1, .3, 1));
  }
  .pages-card:hover { background: var(--content-hover, color-mix(in srgb, var(--ink) 6%, var(--paper))); }
  .pages-card-mark {
    display: grid; place-items: center; width: 22px; height: 22px; margin-top: 1px; color: var(--muted);
  }
  .pages-card-mark svg { width: 15px; height: 15px; }
  .pages-card-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .pages-card-body strong { font-size: 14px; font-weight: 600; }
  .pages-card-body strong.is-placeholder, .pages-card-body .is-placeholder { color: var(--faint); font-weight: 500; }
  .pages-card-body span { font-size: 12px; color: var(--muted); }
  .pages-card-body p { margin: 0; font-size: 13px; color: var(--ink-soft, var(--ink)); }
  .pages-card--task.is-done { opacity: 0.72; }
  .pages-calendar { margin: 0.9em 0; padding: 4px 0 8px; }
  .pages-calendar header { font-size: 13px; font-weight: 600; margin-bottom: 10px; letter-spacing: -0.01em; }
  .pages-calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
  .pages-calendar-grid span {
    display: grid; place-items: center; height: 30px; border-radius: 8px; font-size: 12px; color: var(--muted);
  }
  .pages-calendar-grid span.is-weekday { height: 22px; font-size: 11px; color: var(--faint); }
  .pages-calendar-grid span.is-today { color: var(--ink); background: var(--content-select); }
  .pages-calendar-grid span.is-on {
    background: color-mix(in srgb, var(--plugin-pages, var(--ink)) 16%, transparent); color: var(--ink); font-weight: 600;
  }
  @media (max-width: 760px) {
    .pages-title, .pages-editor-host { width: calc(100% - 32px); }
    .pages-title { margin-top: 24px; font-size: 32px; padding-left: 36px; }
    .pages-editor-host { --pages-gutter: 36px; }
    .pages-block-handle { width: 28px; }
    .pages-block-handle [data-pages-grip] { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    [data-pages="workbench"] *,
    [data-pages="directory"] * { animation: none !important; transition: none !important; }
    .pages-editor-host .ProseMirror-gapcursor::after { animation: none !important; }
  }
`;
