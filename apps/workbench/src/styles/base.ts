import { renderLinearShellTokens } from "@molis-ai/molis-work-design-system";

export const STYLES = `
  :root {
    color-scheme: light;
    ${renderLinearShellTokens("light")}
    --green: #2d7a5a; --green-soft: #e8f4ee; --amber: #8a5c18;
    --amber-soft: #f8f0e2; --red: #b03d45; --red-soft: #fbecec;
    --terminal: #1b2129; --terminal-ink: #e8edf2;
    --shadow: 0 8px 28px rgba(26, 38, 52, .12);
    --font: "Inter Variable", Inter, "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  html { width: 100%; height: 100%; height: 100dvh; overflow: hidden; overscroll-behavior: none; }
  body { width: 100%; height: 100dvh; min-height: 0; margin: 0; overflow: hidden; overscroll-behavior: none; background: var(--page); color: var(--ink); font: 14px/1.55 var(--font); }
  button, input, textarea, select { font: inherit; }
  button { color: inherit; }
  button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible, a:focus-visible { outline: 2px solid color-mix(in srgb, var(--blue), transparent 30%); outline-offset: 2px; }
  svg { width: 1em; height: 1em; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  [hidden] { display: none !important; }
  .icon-sprite { position: absolute; width: 0; height: 0; overflow: hidden; }
  .app { min-width: 0; width: 100%; height: 100dvh; min-height: 0; overflow: hidden; display: grid; grid-template-rows: 58px minmax(0, 1fr); }
  .topbar { position: relative; min-width: 0; display: flex; align-items: center; border-bottom: 1px solid var(--line-strong); background: color-mix(in srgb, var(--rail) 82%, var(--paper)); box-shadow: 0 1px 2px rgba(18, 28, 40, .06); z-index: 10; }
  .brand { min-width: 182px; height: 100%; padding: 0 28px; display: flex; align-items: center; gap: 11px; border-right: 1px solid var(--line); }
  .brand svg { color: var(--blue); font-size: 22px; stroke-width: 2.4; }
  .brand strong { font-size: 19px; letter-spacing: -.02em; }
  .project-context { min-width: 0; height: 100%; padding: 0 16px 0 24px; display: flex; align-items: center; gap: 8px; white-space: nowrap; color: var(--ink-soft); }
  .project-context small { color: var(--muted); }
  .project-context a { color: var(--blue-dark); font-size: 12px; font-weight: 400; text-decoration: none; }
  .project-context a:hover { text-decoration: underline; }
  .navigator-project { min-width: 0; padding: 10px 10px 9px; border-bottom: 1px solid var(--line-strong); background: color-mix(in srgb, var(--paper) 62%, var(--rail)); display: grid; gap: 7px; }
  .navigator-project-primary { min-width: 0; display: flex; align-items: center; gap: 7px; }
  .navigator-project-primary > strong { min-width: 0; flex: 1; overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
  .top-spacer { min-width: 0; flex: 1; }
  .top-action { height: 34px; margin-right: 10px; padding: 0 12px; border: 0; border-radius: 5px; background: transparent; color: var(--ink-soft); display: inline-flex; align-items: center; gap: 8px; font-weight: 400; cursor: pointer; white-space: nowrap; }
  a.top-action { color: var(--ink-soft); text-decoration: none; }
  .top-action:hover, a.top-action:hover { color: var(--ink); background: var(--nav-hover); }
  .top-action.is-current, a.top-action.is-current { color: var(--ink); background: var(--nav-active); }
  .top-action svg { font-size: 17px; }
  .workspace { position: relative; min-width: 0; min-height: 0; width: 100%; height: 100%; overflow: hidden; display: grid; grid-template-columns: var(--tree-width, clamp(280px, 22vw, 360px)) 5px minmax(0, 1fr); }
  .tree-pane { position: relative; min-width: 0; min-height: 0; overflow: hidden; display: grid; grid-template-rows: auto auto minmax(0, 1fr) 48px; background: color-mix(in srgb, var(--rail) 36%, var(--paper)); border-right: 1px solid var(--line-strong); container-type: inline-size; }
  .tree-resizer { position: relative; z-index: 3; cursor: col-resize; background: color-mix(in srgb, var(--rail) 36%, var(--paper)); touch-action: none; }
  .tree-resizer::before, .tui-resizer::before { content: ""; position: absolute; inset: 0 -5px; }
  .tree-resizer::after { content: ""; position: absolute; inset: 0 auto 0 2px; width: 1px; background: var(--line-strong); }
  .tree-resizer:hover::after, .tree-resizer:focus-visible::after, .tree-resizer.is-dragging::after { width: 2px; background: var(--blue); }
  .tree-chrome { position: relative; z-index: 4; padding: 10px 10px 8px; border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--rail) 55%, var(--paper)); display: grid; gap: 6px; }
  .tree-search { position: relative; display: flex; align-items: center; }
  .tree-search svg { position: absolute; left: 10px; color: var(--muted); pointer-events: none; }
  .tree-search input { width: 100%; height: 32px; padding: 0 42px 0 32px; border: 1px solid var(--line); border-radius: 5px; background: var(--paper); }
  .tree-search input:hover, .tree-search input:focus { border-color: color-mix(in srgb, var(--blue), var(--line-strong) 42%); }
  .tree-search kbd { position: absolute; right: 8px; color: var(--faint); border: 1px solid var(--line); border-radius: 4px; padding: 0 5px; font: 12px/20px var(--font); background: var(--paper); }
  .tree-tools { display: flex; flex-wrap: nowrap; align-items: center; gap: 4px; min-width: 0; width: 100%; }
  .tree-create { flex: 1; min-width: 0; height: 28px; padding: 0 12px; border: 1px solid var(--line); border-radius: var(--radius-control, 8px); background: var(--paper); color: var(--ink); display: inline-flex; align-items: center; justify-content: center; gap: 6px; font: inherit; font-size: 12px; font-weight: 400; cursor: pointer; }
  .tree-create svg { width: 14px; height: 14px; flex: none; color: inherit; }
  .tree-create:hover { background: var(--nav-hover); }
  [data-tree-filter-trigger] { width: 28px; min-width: 28px; height: 28px; padding: 0; border: 1px solid var(--line); border-radius: var(--radius-control, 8px); background: var(--paper); color: var(--ink); display: inline-grid; place-items: center; flex: none; cursor: pointer; }
  [data-tree-filter-trigger] > span { display: none; }
  [data-tree-filter-trigger] svg { width: 14px; height: 14px; color: inherit; }
  [data-tree-filter-trigger]:is(:hover, .is-active, [aria-expanded="true"]) { background: var(--nav-hover); color: var(--ink); }
  .goal-collection-fold { margin: 0; border-top: 0; }
  .goal-collection-fold > summary { list-style: none; display: flex; align-items: center; gap: 6px; height: 28px; min-height: 28px; padding: 0 6px; border-radius: 5px; color: var(--muted); cursor: pointer; user-select: none; }
  .goal-collection-fold > summary::-webkit-details-marker, .goal-collection-fold > summary::marker { display: none; }
  .goal-collection-fold > summary:hover { color: var(--ink); background: color-mix(in srgb, var(--ink) 5%, transparent); }
  .goal-collection-fold > summary[aria-current="page"] { color: var(--ink); }
  .goal-collection-caret { display: grid; place-items: center; width: 16px; flex: none; }
  .goal-collection-caret svg { width: 12px; height: 12px; transform: rotate(-90deg); transition: transform .16s ease; }
  .goal-collection-fold[open] > summary .goal-collection-caret svg { transform: rotate(0deg); }
  .goal-collection-mark { display: grid; place-items: center; width: 16px; height: 16px; flex: none; color: var(--tone-idle, var(--muted)); }
  .goal-collection-mark svg { width: 13px; height: 13px; }
  .goal-collection-fold > summary strong { flex: 1; min-width: 0; font-size: 11px; font-weight: 400; }
  .goal-collection-fold > summary small { font-variant-numeric: tabular-nums; font-size: 11px; color: var(--faint); }
  .goal-collection-fold:not([open]) > :not(summary) { display: none; }
  .goal-collection-empty { margin: 0; padding: 6px 8px 10px 22px; color: var(--muted); font-size: 12px; }
  @media (prefers-reduced-motion: reduce) {
    .goal-collection-caret svg { transition: none; }
  }
  .tree-tool { height: 28px; padding: 0 6px; border: 0; border-radius: 4px; background: transparent; color: var(--muted); display: inline-flex; align-items: center; gap: 4px; font: inherit; font-size: 12px; font-weight: 400; cursor: pointer; white-space: nowrap; text-decoration: none; }
  a.tree-tool { color: var(--muted); text-decoration: none; }
  .tree-tool:hover, a.tree-tool:hover { color: var(--ink); background: var(--nav-hover); }
  .tree-tool.is-current, .tree-tool.is-active, a.tree-tool.is-current { color: var(--ink); background: var(--nav-active); }
  .tree-tool svg { font-size: 14px; }
  .tree-tool small { color: var(--muted); font-variant-numeric: tabular-nums; font-weight: 400; }
  .tree-tool.is-current small { color: var(--ink); }
  @container (max-width: 300px) {
    .tree-tool span, .tree-tool small { display: none; }
    .tree-tool { width: 28px; padding: 0; justify-content: center; }
  }
  .tree-filter-control { position: static; display: flex; align-items: center; flex: none; }
  .tree-filter { position: absolute; z-index: 12; top: calc(100% + 4px); left: 10px; right: 10px; width: auto; max-height: min(430px, calc(100dvh - 68px)); overflow: auto; padding: 13px 14px 12px; color: var(--ink); background: var(--paper); box-shadow: 0 9px 24px rgba(25, 34, 45, .14); }
  .tree-filter[hidden] { display: none; }
  .tree-filter > header { display: flex; align-items: baseline; gap: 10px; }
  .tree-filter > header strong { font-size: 13px; }
  .tree-filter > header .mw-btn { margin-left: auto; }
  .tree-filter > p { margin: 5px 0 10px; color: var(--muted); font-size: 12px; line-height: 1.5; }
  .tree-filter-options { display: grid; max-height: 280px; overflow: auto; scrollbar-width: none; }
  .tree-filter-options::-webkit-scrollbar { display: none; }
  .tree-filter-option { min-width: 0; min-height: 34px; padding: 5px 2px; border-top: 1px solid var(--line); display: grid; grid-template-columns: 17px minmax(0, 1fr) auto; align-items: center; gap: 8px; cursor: pointer; }
  .tree-filter-option:first-child { border-top: 0; }
  .tree-filter-option input { width: 15px; height: 15px; margin: 0; accent-color: var(--blue); }
  .tree-filter-option .goal-status { min-width: 0; white-space: normal; font-size: 12px; }
  .tree-filter-option small { color: var(--muted); font-size: 11px; }
  .tree-filter-summary { margin-bottom: 0 !important; padding-top: 9px; border-top: 1px solid var(--line); }
  .tree-scroll { min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; padding: 8px 12px 16px; scrollbar-width: none; -ms-overflow-style: none; }
  .tree-scroll::-webkit-scrollbar { display: none; }
  .tree-filter-empty { margin: 28px 5px; padding: 14px 12px; color: var(--muted); background: var(--page); font-size: 13px; line-height: 1.5; text-align: center; }
  .tree-filter-empty p { margin: 0 0 8px; }
  .tree-filter-empty .mw-btn { margin-top: 2px; }
  .goal-tree, .tree-children { list-style: none; padding: 0; margin: 0; }
  .tree-item { position: relative; }
  .tree-children { margin-left: 18px; padding-left: 8px; border-left: 1px solid var(--line); }
  .tree-item.is-collapsed > .tree-children { display: none; }
  .tree-item.is-collapsed > .tree-row .tree-toggle svg { transform: rotate(-90deg); }
  .tree-row { min-width: 0; min-height: 38px; display: flex; align-items: center; }
  .tree-toggle, .tree-guide { flex: 0 0 20px; width: 20px; height: 26px; border: 0; padding: 0; background: transparent; display: grid; place-items: center; color: var(--faint); }
  .tree-toggle { cursor: pointer; }
  .tree-toggle:hover { color: var(--ink); }
  .tree-node { min-width: 0; min-height: 34px; flex: 1; padding: 3px 8px; border: 0; border-radius: 4px; background: transparent; display: flex; align-items: center; cursor: pointer; text-align: left; }
  .tree-node:hover { background: var(--nav-hover); }
  .tree-node.is-selected { color: var(--ink); background: var(--nav-active); box-shadow: none; }
  .tree-copy { min-width: 0; flex: 1; display: grid; overflow: hidden; line-height: 1.2; }
  .tree-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 400; }
  .tree-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--faint); font-size: 11px; letter-spacing: .02em; }
  .tree-node.is-selected .tree-copy small { color: var(--muted); }
  .tree-deps { display: grid; gap: 2px; margin: 0 0 8px 20px; }
  .tree-dep { width: 100%; min-width: 0; padding: 2px 8px 5px; border: 0; border-radius: 4px; background: transparent; color: inherit; display: flex; align-items: flex-start; gap: 6px; cursor: pointer; text-align: left; }
  .tree-dep:hover { background: var(--nav-hover); }
  .tree-dep-mark { flex: 0 0 auto; margin-top: 2px; color: var(--faint); }
  .tree-dep-mark svg { width: 12px; height: 12px; }
  .tree-dep-copy { min-width: 0; display: grid; gap: 1px; }
  .tree-dep-copy strong { color: var(--ink-soft); font-size: 11px; font-weight: 400; overflow-wrap: anywhere; }
  .tree-dep-copy small { color: var(--muted); font-size: 11px; font-weight: 400; line-height: 1.35; overflow-wrap: anywhere; }
  .tree-dep-copy em { font-style: normal; font-size: 11px; font-weight: 400; color: var(--muted); }
  .tree-dep.is-waiting em { color: var(--amber); }
  .tree-dep.is-ready em { color: var(--green); }
  .tree-dep.is-blocked em { color: var(--red); }
  .goal-status { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; font-size: 12px; font-weight: 400; }
  .goal-status svg { font-size: 13px; }
  .goal-status--clarifying, .goal-status--executing, .goal-status--reviewing, .goal-status--revalidating, .goal-status--in_progress { color: var(--tone-progress, var(--blue)); }
  .goal-status--clarification_pending, .goal-status--clarification_decision_pending, .goal-status--compound_closure_pending, .goal-status--completion_pending, .goal-status--review_pending, .goal-status--waiting_for_human, .goal-status--revalidation_pending, .goal-status--waiting_user { color: var(--tone-attention, var(--amber)); }
  .goal-status--execution_pending, .goal-status--continue { color: var(--tone-idle, var(--ink-soft)); }
  .goal-status--clarification_blocked, .goal-status--execution_blocked, .goal-status--completion_blocked, .goal-status--review_blocked, .goal-status--revalidation_blocked, .goal-status--invalidated, .goal-status--blocked { color: var(--tone-blocked, var(--red)); }
  .goal-status--replaced { color: var(--tone-quiet, var(--muted)); }
  .goal-status--waiting_children, .goal-status--waiting { color: var(--tone-hold, var(--ink-soft)); }
  .goal-status--satisfied, .goal-status--completed { color: var(--tone-done, var(--green)); }
  .goal-status--trashed, .goal-status--archived { color: var(--tone-quiet, var(--muted)); }
  .tree-node.is-selected .goal-status { color: var(--goal-status-tone, inherit); }
  .tree-footer { padding: 0 22px; border-top: 1px solid var(--line); display: flex; align-items: center; color: var(--ink-soft); background: color-mix(in srgb, var(--rail) 55%, var(--paper)); }
  .tree-footer small { margin-left: auto; color: var(--muted); }
  .document-pane { min-width: 0; overflow: auto; background: var(--paper); scrollbar-width: none; -ms-overflow-style: none; }
  .document-pane::-webkit-scrollbar { display: none; }
  .workspace.is-desktop-tui { grid-template-columns: var(--tree-width, clamp(280px, 22vw, 360px)) 5px minmax(0, 1fr) 5px var(--tui-width, 480px); }
  .tui-resizer { position: relative; z-index: 3; cursor: col-resize; background: var(--rail); touch-action: none; }
  .tui-resizer::after { content: ""; position: absolute; inset: 0 2px 0 auto; width: 1px; background: var(--line-strong); }
  .tui-resizer:hover::after, .tui-resizer:focus-visible::after, .tui-resizer.is-dragging::after { width: 2px; background: var(--blue); }
  .tui-pane { position: relative; min-width: 0; min-height: 0; overflow: hidden; display: grid; grid-template-rows: 56px 40px minmax(0, 1fr); background: color-mix(in srgb, var(--rail) 70%, var(--paper)); container-type: inline-size; }
  .tui-tabs { min-width: 0; padding: 0 8px 0 10px; display: flex; align-items: center; gap: 4px; border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--rail) 70%, var(--paper)); }
  .tui-tab-list { min-width: 0; flex: 1; height: 100%; display: flex; align-items: center; gap: 2px; overflow: auto; scrollbar-width: none; }
  .tui-tab-list::-webkit-scrollbar { display: none; }
  .tui-tab { max-width: 168px; height: 28px; padding: 0 6px 0 10px; border: 0; border-radius: 4px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; font-weight: 400; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; white-space: nowrap; transition: background .16s ease, color .16s ease; }
  .tui-tab:hover { color: var(--ink); background: var(--nav-hover); }
  .tui-tab.is-active { color: var(--ink); background: var(--nav-active); box-shadow: none; }
  .tui-tab.is-exited { color: var(--faint); }
  .tui-tab-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .tui-tab-close { width: 22px; height: 22px; flex: 0 0 22px; padding: 0; border: 0; border-radius: 3px; background: transparent; color: var(--faint); display: grid; place-items: center; }
  .tui-tab-close svg { width: 12px; height: 12px; }
  .tui-tab-close:hover { color: var(--red); background: var(--red-soft); }
  .tui-tab-readonly { flex: 0 0 auto; color: var(--faint); font-size: 12px; font-weight: 400; }
  .tui-add { height: 28px; flex: 0 0 auto; padding: 0 9px; border: 0; border-radius: 4px; background: transparent; color: var(--muted); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px; font: inherit; font-size: 12px; font-weight: 400; white-space: nowrap; transition: background .16s ease, color .16s ease; }
  .tui-add:hover:not(:disabled), .tui-add[aria-expanded="true"] { color: var(--ink); background: var(--nav-hover); }
  .tui-add:disabled { color: var(--faint); cursor: not-allowed; }
  .tui-collapse { width: 28px; height: 28px; flex: 0 0 auto; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--muted); display: grid; place-items: center; cursor: pointer; transition: background .16s ease, color .16s ease; }
  .tui-collapse:hover { color: var(--ink); background: var(--nav-hover); }
  .tui-collapse svg { width: 14px; height: 14px; }
  .workspace.is-desktop-tui.is-tui-collapsed { grid-template-columns: var(--tree-width, clamp(280px, 22vw, 360px)) 5px minmax(0, 1fr) 0 0; }
  .workspace.is-tui-collapsed .tui-resizer, .workspace.is-tui-collapsed .tui-pane { visibility: hidden; pointer-events: none; }
  .tui-expand { display: none; }
  .workspace.is-tui-collapsed .tui-expand { position: absolute; top: 50%; right: 0; z-index: 8; width: 36px; min-height: 112px; padding: 14px 0; border: 1px solid var(--line-strong); border-right: 0; border-radius: 8px 0 0 8px; background: color-mix(in srgb, var(--rail) 40%, var(--paper)); box-shadow: -4px 2px 16px rgba(26, 38, 52, .1); color: var(--ink); transform: translateY(-50%); cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
  .workspace.is-tui-collapsed .tui-expand:hover { color: var(--ink); background: var(--nav-hover); }
  .workspace.is-tui-collapsed .tui-expand:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
  .workspace.is-tui-collapsed .tui-expand svg { width: 16px; height: 16px; }
  .tui-expand-label { display: none; }
  .workspace.is-tui-collapsed .tui-expand-label { display: block; writing-mode: vertical-rl; font-size: 12px; font-weight: 400; letter-spacing: .12em; line-height: 1; }
  .tui-stage { min-width: 0; min-height: 0; overflow: hidden; padding: 10px 12px 12px; display: grid; grid-template-areas: "guard" "actions" "terminal"; grid-template-rows: auto auto minmax(0, 1fr); gap: 8px; }
  .tui-parent-guard { grid-area: guard; min-width: 0; max-height: min(42vh, 360px); overflow: auto; padding: 12px; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--amber-soft); display: grid; gap: 10px; }
  .tui-parent-guard[hidden] { display: none; }
  .tui-parent-guard-copy { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 8px; align-items: start; }
  .tui-parent-guard-copy > svg { width: 16px; height: 16px; margin-top: 2px; color: var(--amber); }
  .tui-parent-guard-copy > div { min-width: 0; display: grid; gap: 3px; }
  .tui-parent-guard-copy strong { font-size: 14px; }
  .tui-parent-guard-copy p, .tui-child-choices > p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.55; }
  .tui-child-choices { display: grid; gap: 5px; }
  .tui-child-choice { min-width: 0; padding: 8px 9px; border: 1px solid var(--line); border-radius: 5px; background: var(--paper); color: var(--ink); text-decoration: none; display: flex; align-items: center; gap: 10px; }
  .tui-child-choice:hover { border-color: var(--amber); background: var(--paper); }
  .tui-child-choice > span { min-width: 0; flex: 1; display: grid; gap: 2px; }
  .tui-child-choice strong, .tui-child-choice small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tui-child-choice strong { font-size: 12px; }
  .tui-child-choice small { color: var(--muted); font-size: 12px; }
  .tui-child-choice b { flex: 0 0 auto; color: var(--amber); font-size: 12px; display: inline-flex; align-items: center; gap: 3px; }
  .tui-child-choice b svg { width: 11px; height: 11px; }
  .tui-pane[data-tui-read-only="true"] .tui-chrome { opacity: .7; }
  .tui-chrome { grid-area: actions; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
  .tui-chrome-actions { min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .tui-chrome button:not(.mw-btn) { min-height: 28px; padding: 0 10px; border: 1px solid var(--line-strong); border-radius: 5px; background: var(--paper); color: var(--ink); font: inherit; font-size: 12px; font-weight: 400; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; transition: background .16s ease, border-color .16s ease, color .16s ease, transform .1s ease; }
  .tui-chrome button:not(.mw-btn):hover:not(:disabled) { border-color: var(--line-strong); background: var(--nav-hover); color: var(--ink); }
  .tui-chrome button:not(.mw-btn):active:not(:disabled) { transform: scale(.98); }
  .tui-chrome button:not(.mw-btn):disabled { color: var(--faint); cursor: default; }
  .tui-status { margin: 0 0 0 auto; min-width: 8rem; flex: 1 1 12rem; color: var(--muted); font-size: 11px; font-weight: 400; display: flex; align-items: center; gap: 6px; line-height: 1.4; }
  .tui-status:empty { display: none; }
  .tui-status::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--faint); flex: 0 0 auto; }
  .tui-status[data-tone="live"]::before { background: var(--green); }
  .tui-status[data-tone="busy"]::before { background: var(--blue); animation: pulse 1s infinite; }
  .tui-status[data-tone="error"]::before { background: var(--red); }
  .tui-terminal { grid-area: terminal; position: relative; min-width: 0; min-height: 140px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--ink) 55%, var(--terminal)); border-radius: 6px; background: var(--terminal); }
  .tui-terminal .tui-xterm { position: absolute; inset: 10px 12px 12px; opacity: 0; transition: opacity .2s cubic-bezier(.16, 1, .3, 1); }
  .tui-terminal .tui-xterm.is-ready { opacity: 1; }
  .tui-empty { position: absolute; inset: 0; z-index: 1; min-height: 0; padding: 28px 22px; color: color-mix(in srgb, var(--terminal-ink) 72%, var(--terminal)); display: grid; place-content: center; justify-items: center; text-align: center; gap: 6px; }
  .tui-empty-mark { width: 36px; height: 36px; margin-bottom: 4px; border-radius: 6px; color: color-mix(in srgb, var(--terminal-ink) 48%, var(--terminal)); background: color-mix(in srgb, var(--terminal-ink) 8%, var(--terminal)); display: grid; place-items: center; }
  .tui-empty-mark svg { width: 18px; height: 18px; }
  .tui-empty p { margin: 0; max-width: 28ch; font-size: 13px; line-height: 1.5; }
  .tui-empty strong { color: var(--terminal-ink); font-size: 14px; font-weight: 400; }
  .tui-menu { position: absolute; z-index: 20; top: 44px; right: 10px; width: min(320px, calc(100% - 20px)); padding: 14px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--paper); box-shadow: 0 8px 28px rgba(26, 38, 52, .12); display: grid; gap: 10px; opacity: 0; visibility: hidden; pointer-events: none; transform: translateY(-6px); transition: opacity .2s cubic-bezier(.16, 1, .3, 1), transform .2s cubic-bezier(.16, 1, .3, 1); }
  .tui-menu.is-open { opacity: 1; visibility: visible; pointer-events: auto; transform: none; }
  .tui-menu > strong { font-size: 13px; letter-spacing: -.015em; }
  .tui-menu p { margin: 0; color: var(--muted); font-size: 12px; font-weight: 400; line-height: 1.45; }
  .tui-menu label { display: grid; gap: 4px; color: var(--ink); font-size: 12px; font-weight: 400; }
  .tui-menu input, .tui-menu select { min-height: 32px; padding: 0 8px; border: 1px solid var(--line-strong); border-radius: 5px; background: var(--paper); }
  .tui-runtime-choices { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .tui-runtime-choices button { min-height: 34px; border: 1px solid var(--line-strong); border-radius: 5px; background: var(--paper); cursor: pointer; text-align: left; padding: 0 10px; font-weight: 400; transition: background .16s ease, border-color .16s ease, color .16s ease; }
  .tui-runtime-choices button[data-tui-kind="generic"] { grid-column: 1 / -1; }
  .tui-runtime-choices button:hover, .tui-runtime-choices button.is-selected { border-color: var(--line-strong); background: var(--nav-active); color: var(--ink); }
  .tui-runtime-choices button:disabled { border-color: var(--line); background: var(--page); color: var(--faint); cursor: not-allowed; display: grid; }
  .tui-runtime-choices button:disabled small { color: var(--faint); font-size: 10px; font-weight: 400; opacity: .85; }
  .tui-menu-missing { padding: 7px 9px; border-radius: 5px; background: var(--amber-soft); color: var(--amber); }
  .tui-menu-actions { display: flex; justify-content: flex-end; gap: 8px; }
  @container (max-width: 380px) {
    .tui-add span, .tui-chrome [data-tui-copy] span { display: none; }
    .tui-add, .tui-chrome [data-tui-copy] { width: 28px; padding: 0; justify-content: center; }
  }
  .goal-document { width: min(100%, 1080px); min-height: 100%; margin: 0 auto; padding: 26px 38px 64px; container-type: inline-size; animation: document-in .24s cubic-bezier(.16, 1, .3, 1); }
  .goal-header { padding: 0 0 16px; }
  .goal-title-row { display: flex; align-items: flex-start; gap: 18px; }
  .goal-title-actions { display: flex; align-items: center; gap: 8px; }
  .goal-title-copy { min-width: 0; flex: 1; display: grid; gap: 2px; }
  .goal-title-copy > small { color: var(--muted); font-size: 11px; font-weight: 400; letter-spacing: .04em; }
  .goal-title-row h1 { margin: 0; font-size: clamp(22px, 2.1vw, 29px); line-height: 1.3; letter-spacing: -.03em; }
  .goal-title-actions > .goal-status { padding: 0; border: 0; background: transparent; font-size: 13px; }
  .goal-more { position: relative; }
  .goal-more > summary { width: 34px; height: 34px; border: 1px solid var(--line); border-radius: 5px; background: var(--paper); display: grid; place-items: center; color: var(--muted); cursor: pointer; list-style: none; }
  .goal-more > summary::-webkit-details-marker { display: none; }
  .goal-more > summary:hover { color: var(--ink); border-color: var(--line-strong); background: var(--nav-hover); }
  .goal-more[open] > summary { color: var(--ink); border-color: var(--line-strong); background: var(--nav-active); }
  .goal-more > div { position: absolute; z-index: 8; top: calc(100% + 6px); right: 0; min-width: 168px; padding: 6px; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--paper); box-shadow: 0 8px 28px rgba(26, 38, 52, .12); display: grid; }
  .goal-more .mw-btn { width: 100%; justify-content: flex-start; border: 0; height: 32px; }
  .goal-factors { padding: 20px 0 26px; }
  .goal-factors-heading { padding: 0 0 16px; border-bottom: 1px solid var(--line-strong); display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: start; gap: 9px; }
  .goal-factors-heading > span { padding-top: 2px; color: var(--ink-soft); }
  .goal-factors-heading h2 { margin: 0; font-size: 17px; letter-spacing: -.015em; }
  .goal-factors-heading p { max-width: 72ch; margin: 2px 0 0; color: var(--muted); font-size: 12px; }
  .goal-factor-nav { margin: 14px 0 0 31px; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--rail); display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); overflow: hidden; }
  .goal-factor-nav button { min-width: 0; min-height: 43px; padding: 7px 9px; border: 0; border-right: 1px solid var(--line); background: transparent; color: var(--muted); display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; }
  .goal-factor-nav button:last-child { border-right: 0; }
  .goal-factor-nav button:hover { color: var(--ink); background: var(--paper); }
  .goal-factor-nav button[aria-selected="true"] { color: var(--ink); background: var(--paper); box-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 8%, transparent); }
  .goal-factor-nav button svg { width: 14px; height: 14px; }
  .goal-factor-nav button small { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--rail); color: var(--muted); display: inline-grid; place-items: center; font-size: 10px; font-variant-numeric: tabular-nums; }
  .goal-factor-nav button[aria-selected="true"] small { color: var(--ink); background: var(--nav-active); }
  .goal-factor-panels { margin: 18px 0 0 31px; }
  .goal-factor-panel > header { margin-bottom: 12px; }
  .goal-factor-panel > header h3 { margin: 0; font-size: 15px; }
  .goal-factor-panel > header h3 span { color: var(--muted); font-size: 12px; font-weight: 400; }
  .goal-factor-panel > header p { max-width: 72ch; margin: 2px 0 0; color: var(--muted); font-size: 12px; }
  .factor-write-receipt { margin: 0 0 14px; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--green), var(--line) 65%); border-radius: 5px; background: var(--green-soft); display: grid; gap: 2px; }
  .factor-write-receipt strong { color: var(--green); font-size: 12px; }
  .factor-write-receipt span { color: var(--muted); font-size: 12px; line-height: 1.5; }
  .factor-write-receipt:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; }
  .policy-scope-note { margin: 0; padding: 11px 12px; border: 1px solid var(--line); border-radius: 5px; background: var(--page); display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; }
  .policy-scope-note > svg { color: var(--muted); }
  .policy-scope-note > span { min-width: 0; display: grid; }
  .policy-scope-note small { color: var(--muted); }
  .policy-scope-note a { color: var(--blue-dark); font-weight: 400; text-decoration: none; }
  .goal-workspace-panels { min-width: 0; }
  .goal-situation { margin: 16px 0 0; border: 1px solid var(--line); border-radius: 5px; background: var(--nav-hover); display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .goal-situation-cell { min-width: 0; padding: 10px 12px; border-right: 1px solid var(--line); color: inherit; text-decoration: none; display: grid; gap: 2px; }
  .goal-situation-cell:last-child { border-right: 0; }
  .goal-situation-cell:hover { background: var(--nav-hover); }
  .goal-situation-cell span { color: var(--muted); font-size: 11px; font-weight: 400; }
  .goal-situation-cell strong { min-width: 0; overflow-wrap: anywhere; font-size: 13px; }
  .goal-situation-cell small { color: var(--ink-soft); font-size: 11px; font-weight: 400; }
  .goal-situation-cell--static { cursor: default; }
  .goal-situation-cell--static:hover { background: transparent; }
  .goal-situation-cell--blocked strong { color: var(--red); }
  .goal-situation-cell--ready strong { color: var(--green); }
  .goal-situation-cell--muted strong { color: var(--muted); font-weight: 400; }
  .goal-now { margin: 20px 0 0; padding: 18px 20px; border: 1px solid var(--line); border-radius: 6px; background: var(--page); scroll-margin-top: 58px; }
  .goal-now > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
  .goal-now > header h2 { margin: 0; font-size: 15px; letter-spacing: -.01em; }
  .goal-now-body { margin-top: 15px; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 18px 28px; }
  .goal-now-body > div { min-width: 0; display: grid; gap: 4px; }
  .goal-now-body > div > strong { font-size: 17px; line-height: 1.4; }
  .goal-now-body p { max-width: 68ch; margin: 0; color: var(--ink-soft); }
  .goal-now-body small { color: var(--muted); }
  .goal-now-body small b { margin-right: 4px; color: var(--ink); }
  .goal-now-blockers { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 14px; }
  .goal-now-blockers > strong { color: var(--red); font-size: 12px; }
  .goal-now-blockers ul { margin: 0; padding-left: 18px; }
  .goal-now-blockers li + li { margin-top: 5px; }
  .goal-now-blockers small { display: block; color: var(--muted); }
  .goal-purpose { margin-left: 31px; }
  .goal-purpose > section { padding: 12px 0; border-top: 1px solid var(--line); display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 18px; }
  .goal-purpose > section:first-child { border-top: 0; }
  .goal-purpose h3, .completion-boundaries h3, .supporting-boundaries h3 { margin: 0; font-size: 13px; }
  .goal-purpose p { max-width: 72ch; margin: 0; color: var(--ink-soft); white-space: pre-wrap; }
  .goal-edit-disclosure { margin: 16px 0 0 31px; border-top: 1px solid var(--line); }
  .goal-edit-disclosure > summary { padding: 13px 0; display: grid; grid-template-columns: 20px minmax(0, 1fr) 16px; align-items: center; gap: 9px; cursor: pointer; list-style: none; }
  .goal-edit-disclosure > summary::-webkit-details-marker { display: none; }
  .goal-edit-disclosure > summary > span { display: grid; }
  .goal-edit-disclosure > summary small { color: var(--muted); font-weight: 400; }
  .goal-edit-disclosure[open] > summary > svg:last-child, .supporting-boundaries[open] > summary svg { transform: rotate(180deg); }
  .goal-edit-disclosure .draft-editor-section { margin: 0 0 18px; }
  .completion-boundaries { display: grid; }
  .completion-boundaries > section { padding: 11px 0; border-top: 1px solid var(--line); display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 18px; }
  .completion-boundaries > section:first-child { border-top: 0; }
  .completion-boundaries .doc-list, .completion-boundaries .empty-row, .supporting-boundaries .doc-list, .supporting-boundaries .empty-row { margin-top: 0; }
  .supporting-boundaries { border-top: 1px solid var(--line); }
  .supporting-boundaries > summary { padding: 11px 0; color: var(--ink); display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; font-weight: 400; cursor: pointer; list-style: none; }
  .supporting-boundaries > summary::-webkit-details-marker { display: none; }
  .supporting-boundaries > div > section { padding: 10px 0; display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 18px; }
  .child-progress { margin: 18px 0 0 31px; padding-top: 16px; border-top: 1px solid var(--line); }
  .child-progress > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
  .child-progress h3, .dependency-summary h3, .progress-overview h3, .rule-summary h3 { margin: 0; font-size: 14px; }
  .child-progress header p { margin: 2px 0 0; color: var(--muted); font-size: 11px; }
  .child-progress-rule { max-width: 720px; display: grid; gap: 2px; }
  .child-progress-rule strong { color: var(--ink); font-size: 12px; }
  .child-progress--needs_confirmation .child-progress-rule strong { color: var(--blue); }
  .child-progress--conflict .child-progress-rule strong { color: var(--red); }
  .child-progress > header > strong { color: var(--muted); font-variant-numeric: tabular-nums; }
  .child-progress ul, .dependency-summary ul { list-style: none; margin: 9px 0 0; padding: 0; }
  .child-progress li, .dependency-summary li { border-top: 1px solid var(--line); }
  .child-progress a, .dependency-summary a { min-height: 48px; padding: 8px 2px; color: inherit; display: flex; align-items: center; gap: 10px; text-decoration: none; }
  .child-progress a:hover strong, .dependency-summary a:hover strong { color: var(--blue-dark); }
  .child-progress a > span, .dependency-summary a > span { min-width: 0; flex: 1; display: grid; }
  .child-progress a small, .dependency-summary a small { color: var(--muted); }
  .child-progress a em { color: var(--muted); font-size: 11px; font-style: normal; font-weight: 400; }
  .dependency-summary .check-box { flex: 0 0 15px; }
  .progress-overview { margin-left: 31px; display: grid; gap: 18px; }
  .progress-facts { margin: 0; display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid var(--line); }
  .progress-facts > div { min-width: 0; padding: 11px 12px 11px 0; border-bottom: 1px solid var(--line); display: grid; gap: 2px; }
  .progress-facts > div:nth-child(odd) { padding-right: 20px; border-right: 1px solid var(--line); }
  .progress-facts > div:nth-child(even) { padding-left: 20px; }
  .progress-facts dt { color: var(--muted); font-size: 11px; font-weight: 400; }
  .progress-facts dd { margin: 0; font-weight: 400; }
  .progress-facts dd small { display: block; color: var(--muted); font-weight: 400; }
  .progress-blockers, .rule-summary { padding-top: 2px; }
  .rule-summary ul { margin: 8px 0 0; padding-left: 19px; }
  .rule-summary li + li { margin-top: 3px; }
  .goal-technical { padding: 20px 0 0; }
  .goal-technical > header { padding: 0 0 16px; border-bottom: 1px solid var(--line-strong); display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: center; gap: 9px; }
  .goal-technical > header > span:first-child { color: var(--ink-soft); }
  .goal-technical > header > span:nth-child(2) { display: grid; }
  .goal-technical > header strong { font-size: 17px; letter-spacing: -.015em; }
  .goal-technical > header small { color: var(--muted); font-size: 12px; font-weight: 400; }
  .goal-technical-body { padding: 2px 0 24px 31px; }
  .goal-record-section { border-bottom: 1px solid var(--line); }
  .goal-record-section > summary { min-height: 58px; padding: 10px 2px; display: flex; align-items: center; justify-content: space-between; gap: 14px; list-style: none; cursor: pointer; }
  .goal-record-section > summary::-webkit-details-marker { display: none; }
  .goal-record-section > summary:hover { color: var(--ink); }
  .goal-record-section > summary > span { min-width: 0; display: grid; gap: 1px; }
  .goal-record-section > summary strong { font-size: 14px; }
  .goal-record-section > summary small { color: var(--muted); font-size: 11px; font-weight: 400; }
  .goal-record-section > summary > svg { flex: 0 0 auto; color: var(--muted); transition: transform .16s ease; }
  .goal-record-section[open] > summary > svg { transform: rotate(180deg); }
  .goal-record-section > div { padding: 5px 0 20px; }
  .goal-record-section > div > section { padding: 15px 0 0; }
  .goal-record-section > div > section > h3 { margin: 0 0 10px; font-size: 13px; }
  .technical-meta { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; }
  .technical-meta > div { min-width: 0; display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 9px; }
  .technical-meta dt { color: var(--muted); }
  .technical-meta dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
  .technical-meta dd strong, .technical-meta dd small { display: block; }
  .technical-meta dd small { margin-top: 2px; color: var(--muted); font-size: 11px; }
  .archive-empty { min-height: 100%; padding: 72px 28px; display: grid; place-content: center; justify-items: center; text-align: center; color: var(--muted); }
  .archive-empty svg { width: 30px; height: 30px; margin-bottom: 12px; color: var(--faint); }
  .archive-empty h1 { margin: 0 0 5px; color: var(--ink); font-size: 20px; }
  .archive-empty p { margin: 0 0 18px; }
  .archive-empty a { color: var(--blue); text-decoration: none; }
  .goal-meta { margin: 14px 0 0; display: flex; flex-wrap: wrap; gap: 10px 24px; color: var(--muted); }
  .goal-meta div { display: flex; align-items: center; gap: 6px; }
  .goal-meta svg { font-size: 14px; }
  .goal-meta dt { font-size: 12px; }
  .goal-meta dd { margin: 0; }
  .goal-meta mark { padding: 1px 5px; border-radius: 3px; color: var(--amber); background: var(--amber-soft); }
  .document-section { padding: 20px 0; border-bottom: 1px solid var(--line); scroll-margin-top: 58px; }
  .section-heading { margin: 0 0 10px; display: flex; align-items: flex-start; gap: 9px; }
  .section-heading > span { width: 22px; height: 22px; margin-top: 1px; display: grid; place-items: center; color: var(--ink-soft); }
  .section-heading h2 { margin: 0; font-size: 17px; letter-spacing: -.015em; }
  .section-heading p { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
  .document-subsection { margin: 16px 0 0 31px; padding-top: 16px; border-top: 1px solid var(--line); scroll-margin-top: 12px; }
  .document-subsection:first-of-type { margin-top: 6px; padding-top: 0; border-top: 0; }
  .contract-scope-status { margin: 10px 0 0; padding: 10px 12px; border-left: 2px solid var(--green); background: var(--green-soft); display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 8px; }
  .contract-scope-status > svg { grid-row: 1 / 3; margin-top: 1px; color: var(--green); }
  .contract-scope-status strong { font-size: 12px; }
  .contract-scope-status span { color: var(--muted); font-size: 11px; }
  .contract-coverage-group { margin-top: 12px; }
  .contract-coverage-group > h4 { margin: 0 0 7px; font-size: 12px; }
  .contract-coverage-group > article { padding: 9px 10px; border: 1px solid var(--line); border-radius: 5px; background: var(--page); display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; }
  .contract-coverage-group > article + article { margin-top: 7px; }
  .contract-coverage-group article > small { color: var(--muted); }
  .contract-coverage-group article > p, .contract-coverage-group article > ul { grid-column: 1 / -1; }
  .contract-coverage-group article > p { margin: 0; color: var(--muted); font-size: 11px; }
  .contract-coverage-group article > ul { margin: 3px 0 0; padding-left: 18px; }
  .contract-coverage-group article button { padding: 0; border: 0; color: var(--ink); background: transparent; text-align: left; cursor: pointer; }
  .subsection-heading { margin: 0 0 10px; display: flex; align-items: flex-start; gap: 8px; }
  .subsection-heading > span { width: 20px; height: 20px; display: grid; place-items: center; color: var(--ink-soft); }
  .subsection-heading h3 { margin: 0; font-size: 14px; letter-spacing: -.01em; }
  .subsection-heading p { margin: 1px 0 0; color: var(--muted); font-size: 11px; }
  .business-copy { padding-left: 31px; color: var(--ink-soft); }
  .business-copy p { margin: 6px 0; }
  .business-copy .outcome { color: var(--ink); }
  .trash-summary { margin-left: 31px; color: var(--ink-soft); }
  .trash-summary p { margin: 6px 0; }
  .trash-restore-row { margin-left: 31px; display: flex; align-items: center; justify-content: space-between; gap: 18px; color: var(--ink-soft); }
  .trash-restore-row p { max-width: 62ch; margin: 0; }
  .draft-gaps { margin: 2px 0 12px 31px; padding: 10px 12px; border: 1px solid var(--line-strong); border-radius: 5px; background: var(--amber-soft); display: flex; align-items: center; gap: 14px; }
  .draft-gaps > div { min-width: 0; flex: 1; }
  .draft-gaps strong { color: var(--amber); }
  .draft-gaps p { margin: 2px 0 0; color: var(--ink); }
  .draft-gaps a { flex: 0 0 auto; color: var(--blue-dark); font-size: 12px; font-weight: 400; text-decoration: none; white-space: nowrap; }
  .draft-gaps a:hover { text-decoration: underline; }
  .doc-list { margin: 7px 0 0; padding-left: 19px; }
  .doc-list li { margin: 3px 0; }
  .empty-row { margin: 8px 0; color: var(--muted); font-size: 13px; }
  .empty-row--warning { padding: 10px 12px; color: var(--amber); background: var(--amber-soft); border-radius: 4px; }
  .clear-row { margin: 8px 0; display: flex; align-items: center; gap: 10px; color: var(--green); }
  .blocker-list, .check-list { list-style: none; padding: 0; margin: 4px 0 0; }
  .blocker-list li, .check-list li { display: flex; align-items: flex-start; gap: 10px; padding: 6px 0; }
  .blocker-list svg { flex: 0 0 auto; margin-top: 3px; color: var(--red); }
  .blocker-list span, .check-list li > span:last-child { display: grid; }
  .blocker-list small, .check-list small { color: var(--muted); }
  .check-box { flex: 0 0 15px; width: 15px; height: 15px; margin-top: 3px; border: 1px solid var(--line-strong); display: grid; place-items: center; }
  .check-box.is-checked { color: var(--action-ink); border-color: var(--action); background: var(--action); }
  .check-box svg { font-size: 12px; stroke-width: 3; }
`;


