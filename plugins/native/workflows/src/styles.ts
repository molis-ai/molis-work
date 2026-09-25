export const WORKFLOWS_STYLES = `
  [data-workflows="workbench"] {
    --plugin-tint: var(--plugin-workflows);
    --wf-hover: var(--motion-instant, 90ms) var(--ease-standard, cubic-bezier(.32, .72, 0, 1));
    --wf-row: var(--motion-normal, 180ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1));
    --wf-edge: var(--motion-fast, 130ms) var(--ease-standard, cubic-bezier(.32, .72, 0, 1));
  }
  [data-workflows="workbench"] .wf-muted { color: var(--muted); font-size: 12px; }
  [data-workflows="workbench"] .wf-hint { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
  [data-workflows="workbench"] .wf-error { margin: 0; color: var(--red); font-size: 12px; }
  [data-workflows="workbench"] .wf-danger { color: var(--red); }
  [data-workflows="workbench"] .wf-danger:hover { color: var(--red); background: color-mix(in srgb, var(--red) 8%, transparent); }

  /* List */
  [data-workflows="workbench"] .wf-rows { display: grid; gap: 2px; }
  [data-workflows="workbench"] .wf-row {
    display: grid; grid-template-columns: minmax(10rem, 1fr) minmax(0, 2fr) 10rem; align-items: center; gap: 16px;
    width: 100%; min-height: 36px; padding: 4px 12px; border: 0; border-radius: var(--radius-item, 8px);
    background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer;
    transition: background-color var(--wf-row);
  }
  [data-workflows="workbench"] .wf-row:hover { background: var(--nav-hover); }
  [data-workflows="workbench"] .wf-row.is-selected { background: color-mix(in srgb, var(--plugin-tint, var(--ink)) 10%, transparent); }
  [data-workflows="workbench"] .wf-row:focus-visible { outline: var(--focus-stroke, 1px solid var(--ink)); outline-offset: var(--focus-stroke-inset, -1px); }
  [data-workflows="workbench"] .wf-row__title { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 13px; }
  [data-workflows="workbench"] .wf-row__title > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  [data-workflows="workbench"] .wf-row__live { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--tone-progress, var(--blue)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--tone-progress, var(--blue)) 20%, transparent); }
  [data-workflows="workbench"] .wf-row__chain {
    display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; white-space: nowrap; font-size: 12px;
    /* A chain longer than the row fades out instead of cutting a word in half. */
    mask-image: linear-gradient(90deg, #000 calc(100% - 28px), transparent);
  }
  [data-workflows="workbench"] .wf-row__chain b { font-weight: 400; color: var(--ink-soft); }
  [data-workflows="workbench"] .wf-row__chain b::before { content: ""; display: inline-block; width: 6px; height: 6px; margin-right: 5px; border-radius: 2px; background: var(--station-tint); vertical-align: 1px; }
  [data-workflows="workbench"] .wf-mini-link { font-style: normal; color: var(--faint); font-size: 11px; }
  [data-workflows="workbench"] .wf-mini-link::before, [data-workflows="workbench"] .wf-mini-link::after { content: "—"; margin: 0 3px; color: var(--line-strong); }
  [data-workflows="workbench"] .wf-row__meta { color: var(--muted); font-size: 12px; white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
  [data-workflows="workbench"][data-expanded="true"] .wf-row { grid-template-columns: minmax(0, 1fr); gap: 2px; padding-block: 6px; }
  [data-workflows="workbench"][data-expanded="true"] .wf-row__meta { display: none; }
  [data-workflows="workbench"] .wf-example { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 2px 0 0; font-size: 12px; }
  [data-workflows="workbench"] .wf-example b { font-weight: 400; padding: 1px 8px; border: 1px solid var(--line); border-radius: 999px; color: var(--ink-soft); }
  [data-workflows="workbench"] .wf-example i { font-style: normal; color: var(--muted); }
  [data-workflows="workbench"] .wf-example i::before, [data-workflows="workbench"] .wf-example i::after { content: "—"; margin: 0 4px; color: var(--line-strong); }

  /* Shell modes: the run view takes the whole stage; its own vertical chain replaces the list. */
  body.immersive-workbench [data-workflows="workbench"][data-wf-mode="instance"][data-expanded="true"] { grid-template-columns: minmax(0, 1fr); }
  body.immersive-workbench [data-workflows="workbench"][data-wf-mode="instance"] .wf-list { display: none !important; }
  body.immersive-workbench [data-workflows="workbench"][data-wf-mode="instance"] .wf-workspace { grid-column: 1 / -1; }
  [data-workflows="workbench"] .wf-workspace { display: flex; flex-direction: column; min-height: 0; min-width: 0; overflow: hidden; background: var(--paper); }
  [data-workflows="workbench"] .wf-workspace[hidden] { display: none; }
  [data-workflows="workbench"] .wf-view { display: flex; flex-direction: column; flex: 1; min-height: 0; }

  /* Editor */
  [data-workflows="workbench"] .wf-editor { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  [data-workflows="workbench"] .wf-editor__bar { gap: 10px; border-bottom: 1px solid var(--line); }
  [data-workflows="workbench"] .wf-title-input {
    flex: 1; min-width: 0; height: 30px; padding: 0 8px; border: 1px solid transparent; border-radius: var(--radius-control, 8px);
    background: transparent; color: var(--ink); font: inherit; font-size: 15px;
    transition: border-color var(--wf-edge), background-color var(--wf-edge);
  }
  body.immersive-workbench [data-workflows="workbench"] .wf-title-input.mw-input { height: 30px; border-color: transparent; background: transparent; box-shadow: none; font-size: 15px; }
  body.immersive-workbench [data-workflows="workbench"] .wf-title-input.mw-input:hover { border-color: var(--line); }
  body.immersive-workbench [data-workflows="workbench"] .wf-title-input.mw-input:focus { border-color: var(--ink); background: var(--paper); }
  [data-workflows="workbench"] .wf-title-input:focus { outline: none; border-color: var(--ink); background: var(--paper); }
  [data-workflows="workbench"] .wf-link-fields .mw-input { width: 100%; }
  [data-workflows="workbench"] .wf-return-slot:empty { display: none; }
  [data-workflows="workbench"] .wf-return { flex: none; color: var(--plugin-tint); }
  [data-workflows="workbench"] .wf-return:hover { color: var(--plugin-tint); background: color-mix(in srgb, var(--plugin-tint) 10%, transparent); }
  [data-workflows="workbench"] .wf-save-state { flex: none; display: inline-flex; align-items: center; gap: 4px; min-width: 4.5em; justify-content: flex-end; color: var(--faint); font-size: 12px; }
  [data-workflows="workbench"] .wf-save-state svg { width: 12px; height: 12px; }
  [data-workflows="workbench"] .wf-save-state .mw-spinner { width: 11px; height: 11px; border-width: 1.5px; }
  [data-workflows="workbench"] .wf-save-state[data-state="saving"] { color: var(--muted); }
  [data-workflows="workbench"] .wf-save-state[data-state="saved"] { animation: wf-saved 1.8s var(--ease-out, ease-out) both; }
  @keyframes wf-saved { 0%, 55% { color: var(--green); } 100% { color: var(--faint); } }
  [data-workflows="workbench"] .wf-editor__scroll { flex: 1; min-height: 0; overflow: auto; padding: 20px 24px 40px; display: grid; align-content: start; gap: 28px; }
  [data-workflows="workbench"] .wf-section { display: grid; gap: 12px; min-width: 0; }
  [data-workflows="workbench"] .wf-section h2 { margin: 0; font-size: 13px; font-weight: 400; color: var(--ink); }
  [data-workflows="workbench"] .wf-section__head { display: flex; align-items: center; gap: 10px; }
  [data-workflows="workbench"] .wf-section__head .mw-btn { margin-left: auto; }

  /* The chain itself */
  [data-workflows="workbench"] .wf-chain {
    display: flex; align-items: center; gap: 0; min-width: 0; overflow-x: auto; padding: 18px 12px 30px;
    border: 1px solid var(--line); border-radius: var(--radius-surface, 12px); background: var(--page);
    scrollbar-width: thin; scroll-padding-inline: 24px;
  }
  [data-workflows="workbench"] .wf-chain.is-empty { justify-content: center; padding: 24px; }
  [data-workflows="workbench"] .wf-drop {
    display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 18px 36px; border: 1px dashed var(--line-strong);
    border-radius: var(--radius-surface, 12px); transition: border-color var(--wf-edge), background-color var(--wf-edge);
  }
  [data-workflows="workbench"] .wf-drop__mark { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; color: var(--plugin-tint); background: color-mix(in srgb, var(--plugin-tint) 12%, transparent); }
  [data-workflows="workbench"] .wf-drop__mark svg { width: 16px; height: 16px; }
  [data-workflows="workbench"] .wf-drop.is-drop, [data-workflows="workbench"] .wf-drop.is-picking { border-color: var(--plugin-tint); background: color-mix(in srgb, var(--plugin-tint) 8%, transparent); }
  [data-workflows="workbench"] .wf-station {
    flex: none; position: relative; display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px;
    border: 1px solid color-mix(in srgb, var(--station-tint) 36%, var(--line)); border-radius: var(--radius-control, 10px);
    background: var(--paper); color: var(--ink); font-size: 13px; cursor: grab; box-shadow: 0 1px 2px rgb(0 0 0 / 4%);
    transition: border-color var(--wf-hover), opacity var(--wf-edge);
  }
  [data-workflows="workbench"] .wf-station:hover { border-color: color-mix(in srgb, var(--station-tint) 62%, var(--line)); }
  [data-workflows="workbench"] .wf-station:active { cursor: grabbing; }
  [data-workflows="workbench"] .wf-station:focus-visible { outline: var(--focus-stroke, 1px solid var(--ink)); outline-offset: 2px; }
  [data-workflows="workbench"] .wf-station.is-drag-source, [data-workflows="workbench"] .wf-chip.is-drag-source { opacity: .35; }
  [data-workflows="workbench"] .wf-station__icon { display: grid; place-items: center; width: 22px; height: 22px; flex: none; border-radius: 6px; background: color-mix(in srgb, var(--station-tint) 14%, transparent); color: var(--station-tint); }
  [data-workflows="workbench"] .wf-station__icon svg { width: 14px; height: 14px; }
  [data-workflows="workbench"] .wf-station__name { white-space: nowrap; }
  [data-workflows="workbench"] .wf-station__warning { display: inline-flex; color: var(--amber); }
  [data-workflows="workbench"] .wf-station__warning svg { width: 14px; height: 14px; }
  [data-workflows="workbench"] .wf-issues > span { min-width: 0; overflow-wrap: anywhere; }

  [data-workflows="workbench"] .wf-station__tools {
    position: absolute; left: 50%; top: calc(100% + 4px); transform: translate(-50%, -3px); display: flex; gap: 2px; padding: 2px;
    border: 1px solid var(--line); border-radius: 8px; background: var(--paper); box-shadow: var(--shadow-raised, 0 4px 12px rgb(0 0 0 / 8%));
    opacity: 0; pointer-events: none; transition: opacity var(--wf-edge), transform var(--wf-edge); z-index: 2;
  }
  [data-workflows="workbench"] .wf-station:hover .wf-station__tools, [data-workflows="workbench"] .wf-station:focus-within .wf-station__tools { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
  [data-workflows="workbench"] .wf-chain.is-dragging .wf-station__tools { opacity: 0; pointer-events: none; }
  [data-workflows="workbench"] .wf-tool { display: grid; place-items: center; width: 24px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer; transition: background-color var(--wf-hover), color var(--wf-hover); }
  [data-workflows="workbench"] .wf-tool:hover { background: var(--nav-hover); color: var(--ink); }
  [data-workflows="workbench"] .wf-tool--danger:hover { background: color-mix(in srgb, var(--red) 10%, transparent); color: var(--red); }
  [data-workflows="workbench"] .wf-tool svg { width: 13px; height: 13px; }
  [data-workflows="workbench"] .wf-link { flex: 1 0 118px; display: flex; align-items: center; min-width: 118px; height: 64px; padding: 0 2px; transition: min-width var(--wf-row); }
  [data-workflows="workbench"] .wf-link__line { flex: 1; height: 0; border-top: 1.5px solid var(--line-strong); transition: border-color var(--wf-edge); }
  [data-workflows="workbench"] .wf-link[data-ready="false"] .wf-link__line { border-top-style: dashed; border-color: color-mix(in srgb, var(--amber) 55%, var(--line)); }
  [data-workflows="workbench"] .wf-link__pill {
    flex: none; display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 10px; margin: 0 2px;
    border: 1px solid var(--line); border-radius: 999px; background: var(--paper); color: var(--ink-soft); font: inherit; font-size: 12px; cursor: pointer;
    transition: border-color var(--wf-hover), color var(--wf-hover), background-color var(--wf-hover), box-shadow var(--wf-edge);
  }
  [data-workflows="workbench"] .wf-link__pill:hover { border-color: var(--line-strong); color: var(--ink); }
  [data-workflows="workbench"] .wf-link__pill:focus-visible { outline: var(--focus-stroke, 1px solid var(--ink)); outline-offset: 1px; }
  [data-workflows="workbench"] .wf-link[data-kind="ai"] .wf-link__pill { color: var(--hue-purple, var(--ink)); border-color: color-mix(in srgb, var(--hue-purple, var(--ink)) 32%, var(--line)); }
  [data-workflows="workbench"] .wf-link[data-kind="function"] .wf-link__pill { color: var(--hue-indigo, var(--ink)); border-color: color-mix(in srgb, var(--hue-indigo, var(--ink)) 32%, var(--line)); }
  [data-workflows="workbench"] .wf-link[data-ready="false"] .wf-link__pill { border-style: dashed; color: var(--amber); border-color: color-mix(in srgb, var(--amber) 55%, var(--line)); }
  [data-workflows="workbench"] .wf-link .wf-link__pill.is-open { border-style: solid; border-color: currentColor; background: color-mix(in srgb, currentColor 8%, var(--paper)); box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 12%, transparent); }
  [data-workflows="workbench"] .wf-link__pill svg { width: 12px; height: 12px; }
  [data-workflows="workbench"] .wf-add {
    flex: none; display: grid; place-items: center; width: 22px; height: 22px; margin: 0 2px; padding: 0; border: 1px solid var(--line); border-radius: 999px;
    background: var(--paper); color: var(--muted); cursor: pointer; opacity: .55;
    transition: opacity var(--wf-hover), color var(--wf-hover), border-color var(--wf-hover), background-color var(--wf-hover), transform var(--wf-edge);
  }
  [data-workflows="workbench"] .wf-add svg { width: 12px; height: 12px; }
  [data-workflows="workbench"] .wf-link:hover .wf-add, [data-workflows="workbench"] .wf-end:hover .wf-add, [data-workflows="workbench"] .wf-add:focus-visible { opacity: 1; color: var(--ink); border-color: var(--line-strong); }
  [data-workflows="workbench"] .wf-add:focus-visible { outline: var(--focus-stroke, 1px solid var(--ink)); outline-offset: 1px; }
  [data-workflows="workbench"] .wf-end { flex: none; display: grid; place-items: center; width: 34px; height: 64px; border-radius: var(--radius-control, 8px); transition: background-color var(--wf-edge); }
  [data-workflows="workbench"] .wf-chain.is-dragging .wf-add { opacity: 1; }
  /* The gap a plugin would land in makes room and takes the workflow tint. */
  [data-workflows="workbench"] .wf-chain.is-dragging .wf-link.is-drop { min-width: 164px; }
  [data-workflows="workbench"] :is(.wf-link, .wf-end):is(.is-drop, .is-picking) .wf-add { opacity: 1; color: var(--plugin-tint); border-color: var(--plugin-tint); background: color-mix(in srgb, var(--plugin-tint) 12%, var(--paper)); transform: scale(1.18); }
  [data-workflows="workbench"] .wf-link:is(.is-drop, .is-picking) .wf-link__line { border-color: color-mix(in srgb, var(--plugin-tint) 70%, var(--line)); }
  [data-workflows="workbench"] .wf-end.is-drop { background: color-mix(in srgb, var(--plugin-tint) 10%, transparent); }
  [data-workflows="workbench"] .wf-issues-slot:empty { display: none; }
  [data-workflows="workbench"] .wf-issues { display: flex; align-items: flex-start; gap: 6px; margin: 0; color: var(--amber); font-size: 12px; line-height: 1.6; }
  [data-workflows="workbench"] .wf-issues svg { width: 13px; height: 13px; flex: none; margin-top: 3px; }
  [data-workflows="workbench"] .wf-issue { padding: 0; border: 0; background: none; color: inherit; font: inherit; text-decoration: underline dotted; text-underline-offset: 3px; cursor: pointer; }
  [data-workflows="workbench"] .wf-issue:hover { text-decoration-style: solid; }
  [data-workflows="workbench"] .wf-palette { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  [data-workflows="workbench"] .wf-palette__label { margin-right: 4px; color: var(--muted); font-size: 12px; }
  [data-workflows="workbench"] .wf-palette__others { margin-left: 4px; color: var(--faint); font-size: 12px; cursor: help; }
  [data-workflows="workbench"] .wf-chip {
    display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid var(--line); border-radius: 999px;
    background: var(--paper); color: var(--ink-soft); font: inherit; font-size: 12px; cursor: grab;
    transition: border-color var(--wf-hover), color var(--wf-hover), opacity var(--wf-edge);
  }
  [data-workflows="workbench"] .wf-chip svg { width: 13px; height: 13px; color: var(--station-tint); }
  [data-workflows="workbench"] .wf-chip:hover:not(:disabled) { border-color: color-mix(in srgb, var(--station-tint) 50%, var(--line)); color: var(--ink); }
  [data-workflows="workbench"] .wf-chip:active { cursor: grabbing; }
  [data-workflows="workbench"] .wf-chip:focus-visible { outline: var(--focus-stroke, 1px solid var(--ink)); outline-offset: 1px; }

  /* Runs list */
  [data-workflows="workbench"] .wf-runs { display: grid; gap: 2px; }
  [data-workflows="workbench"] .wf-run-row {
    display: grid; grid-template-columns: minmax(0, 1fr) auto auto 4.5rem; align-items: center; gap: 12px; min-height: 36px; padding: 4px 10px;
    border: 0; border-radius: var(--radius-item, 8px); background: transparent; color: var(--ink); font: inherit; font-size: 13px; text-align: left; cursor: pointer;
    transition: background-color var(--wf-row);
  }
  [data-workflows="workbench"] .wf-run-row:hover { background: var(--nav-hover); }
  [data-workflows="workbench"] .wf-run-row:focus-visible { outline: var(--focus-stroke, 1px solid var(--ink)); outline-offset: var(--focus-stroke-inset, -1px); }
  [data-workflows="workbench"] .wf-run-row__title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  [data-workflows="workbench"] .wf-run-row > .wf-muted { text-align: right; font-variant-numeric: tabular-nums; }
  [data-workflows="workbench"] .wf-runs-empty { margin: 0; padding: 4px 10px; }
  /* One pip per station: where this run has been, where it is, what is left. */
  [data-workflows="workbench"] .wf-pips { display: inline-flex; align-items: center; gap: 3px; flex: none; }
  [data-workflows="workbench"] .wf-pips i { width: 7px; height: 7px; border-radius: 2px; background: color-mix(in srgb, var(--ink) 10%, transparent); }
  [data-workflows="workbench"] .wf-pips i[data-state="done"] { background: color-mix(in srgb, var(--station-tint) 72%, transparent); }
  [data-workflows="workbench"] .wf-pips i[data-state="current"] { background: var(--station-tint); box-shadow: 0 0 0 2px color-mix(in srgb, var(--station-tint) 24%, transparent); }
  [data-workflows="workbench"] .wf-pips i[data-state="stopped"] { background: var(--muted); }

  /* Popover: link editor and plugin picker */
  [data-workflows="workbench"] .wf-pop {
    position: fixed; inset: auto; margin: 0; width: min(360px, calc(100vw - 24px)); max-height: min(560px, calc(100dvh - 24px)); overflow: auto;
    padding: 12px; border: 1px solid var(--line); border-radius: var(--radius-surface, 12px); background: var(--paper); color: var(--ink);
    box-shadow: var(--shadow-raised, 0 12px 32px rgb(0 0 0 / 12%));
  }
  [data-workflows="workbench"] .wf-pop:popover-open { display: grid; gap: 10px; animation: creative-arrive var(--motion-fast, 130ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1)) both; }
  [data-workflows="workbench"] .wf-pop[data-side="above"]:popover-open { animation-name: wf-arrive-down; }
  @keyframes wf-arrive-down { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
  [data-workflows="workbench"] .wf-pop[data-mode="gap"] { width: min(260px, calc(100vw - 24px)); }
  [data-workflows="workbench"] .wf-pop__head { display: grid; gap: 2px; }
  [data-workflows="workbench"] .wf-pop__head strong { font-size: 13px; font-weight: 400; }
  [data-workflows="workbench"] .wf-pop__list { display: grid; gap: 2px; }
  [data-workflows="workbench"] .wf-pop__item {
    display: flex; align-items: center; gap: 8px; min-height: 34px; padding: 4px 8px; border: 0; border-radius: var(--radius-item, 8px);
    background: transparent; color: var(--ink); font: inherit; font-size: 13px; text-align: left; cursor: pointer;
    transition: background-color var(--wf-row);
  }
  [data-workflows="workbench"] .wf-pop__item:hover:not(:disabled), [data-workflows="workbench"] .wf-pop__item:focus-visible { background: var(--nav-hover); outline: none; }
  [data-workflows="workbench"] .wf-pop__item:disabled { cursor: not-allowed; color: var(--faint); }
  [data-workflows="workbench"] .wf-pop__foot { display: flex; justify-content: flex-end; margin: 2px -12px -2px; padding: 10px 12px 0; border-top: 1px solid var(--line); }
  [data-workflows="workbench"] .wf-kinds { width: fit-content; }
  [data-workflows="workbench"] .wf-kind-help { margin: 0; color: var(--ink-soft); font-size: 12px; line-height: 1.6; }
  [data-workflows="workbench"] .wf-link-fields { display: grid; gap: 10px; }
  [data-workflows="workbench"] .wf-link-fields .mw-textarea { width: 100%; font-size: 13px; }
  [data-workflows="workbench"] .wf-tokens { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: -2px 0 0; color: var(--muted); font-size: 12px; }
  [data-workflows="workbench"] .wf-tokens > span { margin-right: 2px; }
  [data-workflows="workbench"] .wf-token {
    height: 22px; padding: 0 7px; border: 1px solid var(--line); border-radius: 6px; background: var(--page); color: var(--ink-soft);
    font: 11px/20px ui-monospace, SFMono-Regular, Menlo, monospace; cursor: pointer; transition: border-color var(--wf-hover), color var(--wf-hover);
  }
  [data-workflows="workbench"] .wf-token:hover { border-color: var(--line-strong); color: var(--ink); }
  [data-workflows="workbench"] .wf-token:focus-visible { outline: var(--focus-stroke, 1px solid var(--ink)); outline-offset: 1px; }
  [data-workflows="workbench"] .wf-readiness { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 12px; }
  [data-workflows="workbench"] .wf-readiness svg { width: 13px; height: 13px; flex: none; }
  [data-workflows="workbench"] .wf-readiness[data-ready="true"] { color: var(--green); }
  [data-workflows="workbench"] .wf-readiness[data-ready="false"] { color: var(--amber); }
  [data-workflows="workbench"] .wf-readiness a { color: inherit; }

  /* Dialogs */
  [data-workflows="workbench"] .wf-pick-filter { position: relative; display: block; }
  [data-workflows="workbench"] .wf-pick-filter svg { position: absolute; left: 9px; top: 50%; width: 13px; height: 13px; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
  [data-workflows="workbench"] .wf-pick-filter .mw-input { width: 100%; padding-left: 28px; }
  [data-workflows="workbench"] .wf-picks { display: grid; gap: 2px; max-height: 320px; overflow: auto; }
  [data-workflows="workbench"] .wf-pick { display: flex; align-items: flex-start; gap: 10px; padding: 8px; border-radius: var(--radius-item, 8px); cursor: pointer; transition: background-color var(--wf-row); }
  [data-workflows="workbench"] .wf-pick[hidden] { display: none; }
  [data-workflows="workbench"] .wf-pick:hover { background: var(--nav-hover); }
  [data-workflows="workbench"] .wf-pick:has(input:checked) { background: color-mix(in srgb, var(--plugin-tint) 9%, transparent); }
  [data-workflows="workbench"] .wf-pick > span { display: grid; gap: 2px; min-width: 0; flex: 1; }
  [data-workflows="workbench"] .wf-pick strong { font-weight: 400; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  [data-workflows="workbench"] .wf-pick small { color: var(--muted); font-size: 12px; }
  [data-workflows="workbench"] .wf-pick input[type=radio] { margin-top: 3px; }
  [data-workflows="workbench"] .wf-pick--blank .mw-input { margin-top: 6px; }
  [data-workflows="workbench"] .wf-pick--skeleton { cursor: default; }
  [data-workflows="workbench"] .wf-pick--skeleton:hover { background: transparent; }
  [data-workflows="workbench"] .wf-pick--skeleton > span { gap: 7px; }
  [data-workflows="workbench"] .wf-skeleton-dot { flex: none; width: 14px; height: 14px; margin-top: 2px; border-radius: 50%; }
  [data-workflows="workbench"] .wf-skeleton-small { width: 28%; height: 9px; }
  [data-workflows="workbench"] .wf-picks-none { margin: 0; padding: 8px; }
  [data-workflows="workbench"] :is(.wf-picks, .wf-frame-skeleton) .mw-skeleton { animation: wf-breathe 1.2s ease-in-out infinite; }
  @keyframes wf-breathe { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }

  /* Run view */
  [data-workflows="workbench"] .wf-run { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  [data-workflows="workbench"] .wf-run__bar { gap: 10px; border-bottom: 1px solid var(--line); }
  body.immersive-workbench [data-workflows="workbench"] .wf-run__bar { padding-inline-end: 16px; }
  [data-workflows="workbench"] .wf-run__title { display: flex; align-items: baseline; gap: 10px; flex: 1; min-width: 0; }
  [data-workflows="workbench"] .wf-run__title h1 { margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 400; }
  [data-workflows="workbench"] .wf-run__title .wf-muted { flex: none; }
  [data-workflows="workbench"] .wf-run__status { white-space: nowrap; }
  [data-workflows="workbench"] .wf-run__body { flex: 1; min-height: 0; display: grid; grid-template-columns: 232px minmax(0, 1fr); }
  [data-workflows="workbench"] .wf-vchain { min-height: 0; overflow: auto; padding: 14px 10px 20px; border-right: 1px solid var(--line); background: var(--nav-bg, var(--page)); }
  [data-workflows="workbench"] .wf-vstep {
    display: grid; grid-template-columns: 16px 22px minmax(0, 1fr); align-items: center; gap: 8px; width: 100%; min-height: 44px; padding: 6px 8px;
    border: 0; border-radius: var(--radius-item, 8px); background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer;
    transition: background-color var(--wf-row);
  }
  [data-workflows="workbench"] .wf-vstep:hover { background: var(--nav-hover); }
  [data-workflows="workbench"] .wf-vstep.is-selected { background: color-mix(in srgb, var(--station-tint) 12%, transparent); }
  [data-workflows="workbench"] .wf-vstep:focus-visible { outline: var(--focus-stroke, 1px solid var(--ink)); outline-offset: var(--focus-stroke-inset, -1px); }
  [data-workflows="workbench"] .wf-vstep__mark { display: grid; place-items: center; width: 16px; height: 16px; color: var(--muted); }
  [data-workflows="workbench"] .wf-vstep__mark svg { width: 13px; height: 13px; }
  [data-workflows="workbench"] .wf-vstep.is-done .wf-vstep__mark { color: var(--green); }
  [data-workflows="workbench"] .wf-vstep.is-stopped .wf-vstep__mark { color: var(--muted); }
  [data-workflows="workbench"] .wf-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--station-tint); box-shadow: 0 0 0 3px color-mix(in srgb, var(--station-tint) 22%, transparent); }
  [data-workflows="workbench"] .wf-ring { width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid var(--line-strong); }
  [data-workflows="workbench"] .wf-vstep__copy { display: grid; min-width: 0; }
  [data-workflows="workbench"] .wf-vstep__copy strong { font-weight: 400; font-size: 13px; }
  [data-workflows="workbench"] .wf-vstep__copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 11px; }
  [data-workflows="workbench"] .wf-vstep.is-pending .wf-vstep__copy strong { color: var(--muted); }
  [data-workflows="workbench"] .wf-vstep.is-pending .wf-station__icon { filter: saturate(.3); opacity: .7; }
  [data-workflows="workbench"] .wf-vlink { position: relative; display: flex; align-items: center; min-height: 30px; padding-left: 38px; }
  [data-workflows="workbench"] .wf-vlink__line { position: absolute; left: 15.5px; top: 0; bottom: 0; border-left: 1.5px solid var(--line-strong); transform-origin: top; }
  [data-workflows="workbench"] .wf-vlink[data-state="done"] .wf-vlink__line { border-color: color-mix(in srgb, var(--green) 55%, var(--line)); }
  [data-workflows="workbench"] .wf-vlink[data-state="blocked"] .wf-vlink__line { border-left-style: dashed; border-color: color-mix(in srgb, var(--amber) 60%, var(--line)); }
  [data-workflows="workbench"] .wf-vlink[data-state="future"] .wf-vlink__line { border-left-style: dashed; }
  /* A handoff in progress runs down its line. */
  [data-workflows="workbench"] .wf-vlink[data-state="working"] .wf-vlink__line {
    width: 1.5px; border: 0;
    background: linear-gradient(to bottom, var(--line-strong) 0 30%, var(--plugin-tint) 45% 55%, var(--line-strong) 70% 100%) 0 0 / 100% 300%;
    animation: wf-flow 1.1s linear infinite;
  }
  @keyframes wf-flow { from { background-position: 0 100%; } to { background-position: 0 0; } }
  [data-workflows="workbench"] .wf-vlink__label { color: var(--muted); font-size: 11px; }
  [data-workflows="workbench"] .wf-vlink[data-state="waiting"] .wf-vlink__label { color: var(--ink-soft); }
  [data-workflows="workbench"] .wf-vlink[data-state="working"] .wf-vlink__label { color: var(--plugin-tint); }
  [data-workflows="workbench"] .wf-vlink[data-state="blocked"] .wf-vlink__label { color: var(--amber); }
  /* A step that just changed says so once. */
  [data-workflows="workbench"] .wf-vstep.is-changed.is-done .wf-vstep__mark svg { animation: wf-land 280ms var(--ease-settle, cubic-bezier(.32, 1.22, .52, 1)) both; }
  [data-workflows="workbench"] .wf-vstep.is-changed.is-current .wf-dot { animation: wf-land 360ms var(--ease-settle, cubic-bezier(.32, 1.22, .52, 1)) 160ms both; }
  [data-workflows="workbench"] .wf-vlink.is-changed[data-state="done"] .wf-vlink__line { animation: wf-fill 260ms var(--ease-out, ease-out) both; }
  @keyframes wf-land { from { opacity: 0; transform: scale(.3); } to { opacity: 1; transform: none; } }
  @keyframes wf-fill { from { transform: scaleY(0); } to { transform: none; } }
  [data-workflows="workbench"] .wf-stage { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  [data-workflows="workbench"] .wf-stage__head { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 10px 16px 8px; }
  [data-workflows="workbench"] .wf-stage__head .wf-station__icon { width: 20px; height: 20px; }
  [data-workflows="workbench"] .wf-stage__head .wf-station__icon svg { width: 12px; height: 12px; }
  [data-workflows="workbench"] .wf-stage__head strong { font-weight: 400; font-size: 13px; }
  [data-workflows="workbench"] .wf-stage__head .wf-muted { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  [data-workflows="workbench"] .wf-stage__step { color: var(--faint); font-size: 11px; font-variant-numeric: tabular-nums; }
  [data-workflows="workbench"] .wf-handoff { padding: 0 16px; }
  [data-workflows="workbench"] .wf-handoff:empty { display: none; }
  [data-workflows="workbench"] .wf-handoff__bar {
    position: relative; overflow: hidden; display: flex; align-items: center; gap: 10px; margin: 0 0 10px; padding: 8px 8px 8px 12px; border: 1px solid var(--line);
    border-radius: var(--radius-control, 10px); background: var(--page); font-size: 13px; color: var(--ink-soft);
  }
  [data-workflows="workbench"] .wf-handoff__bar .mw-btn { margin-left: auto; }
  [data-workflows="workbench"] .wf-handoff__bar .mw-btn[aria-disabled="true"] { cursor: progress; }
  [data-workflows="workbench"] .wf-handoff__bar .mw-btn .mw-spinner { width: 12px; height: 12px; border-width: 1.5px; }
  [data-workflows="workbench"] .wf-handoff__bar.is-blocked { color: var(--amber); border-style: dashed; }
  [data-workflows="workbench"] .wf-handoff__bar.is-working::after {
    content: ""; position: absolute; left: 0; bottom: 0; width: 36%; height: 2px; border-radius: 2px; background: var(--plugin-tint);
    animation: wf-sweep 1.2s var(--ease-standard, ease-in-out) infinite;
  }
  @keyframes wf-sweep { from { transform: translateX(-100%); } to { transform: translateX(290%); } }
  [data-workflows="workbench"] .wf-handoff__bar > svg { width: 14px; height: 14px; flex: none; }
  [data-workflows="workbench"] .wf-handoff__kind { flex: none; padding: 1px 8px; border: 1px solid var(--line); border-radius: 999px; font-size: 11px; color: var(--muted); }
  [data-workflows="workbench"] .wf-handoff__kind[data-kind="ai"] { color: var(--hue-purple, var(--ink)); border-color: color-mix(in srgb, var(--hue-purple, var(--ink)) 30%, var(--line)); }
  [data-workflows="workbench"] .wf-handoff__kind[data-kind="function"] { color: var(--hue-indigo, var(--ink)); border-color: color-mix(in srgb, var(--hue-indigo, var(--ink)) 30%, var(--line)); }
  [data-workflows="workbench"] .wf-handoff__note { display: flex; align-items: center; gap: 6px; margin: 0 0 10px; color: var(--muted); font-size: 12px; }
  [data-workflows="workbench"] .wf-handoff__note.is-done { color: var(--green); }
  [data-workflows="workbench"] .wf-handoff__note svg { width: 13px; height: 13px; }
  [data-workflows="workbench"] .wf-manual {
    display: grid; gap: 10px; margin: 0 0 12px; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius-surface, 12px); background: var(--page);
    max-height: 46vh; overflow: auto;
  }
  [data-workflows="workbench"] .wf-manual header { display: grid; gap: 2px; }
  [data-workflows="workbench"] .wf-manual header strong { font-weight: 400; font-size: 13px; }
  [data-workflows="workbench"] .wf-manual .mw-input, [data-workflows="workbench"] .wf-manual .mw-textarea { width: 100%; }
  /* Grows with what is being handed over, but never pushes the plugin below it out of sight. */
  [data-workflows="workbench"] .wf-manual .mw-textarea { field-sizing: content; min-height: 6lh; max-height: 28vh; resize: vertical; }
  [data-workflows="workbench"] .wf-manual footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
  [data-workflows="workbench"] .wf-kbd-hint { display: inline-flex; align-items: center; gap: 5px; margin-right: auto; color: var(--faint); font-size: 11px; }
  [data-workflows="workbench"] .wf-kbd-hint .mw-kbd { min-height: 18px; padding: 0 5px; border-radius: 5px; font-size: 10px; line-height: 18px; }
  [data-workflows="workbench"] .wf-kbd-hint .mw-kbd + * { margin-right: 6px; }
  [data-workflows="workbench"] .wf-record { margin: 0 0 10px; border: 1px solid var(--line); border-radius: var(--radius-control, 10px); background: var(--page); }
  [data-workflows="workbench"] .wf-record > summary { gap: 8px; min-height: 36px; padding: 0 12px; font-size: 13px; color: var(--ink-soft); }
  [data-workflows="workbench"] .wf-record > summary .wf-muted { margin-left: auto; }
  [data-workflows="workbench"] .wf-record__body { display: grid; gap: 8px; padding: 0 12px 12px; max-height: 40vh; overflow: auto; }
  [data-workflows="workbench"] .wf-record[open] .wf-record__body { animation: creative-arrive var(--motion-fast, 130ms) var(--ease-out, ease-out) both; }
  [data-workflows="workbench"] .wf-record__body > .mw-btn { justify-self: start; }
  [data-workflows="workbench"] .wf-record__label { margin: 4px 0 0; color: var(--muted); font-size: 11px; }
  [data-workflows="workbench"] .wf-payload { display: grid; gap: 6px; padding: 10px 12px; border-radius: var(--radius-control, 8px); background: var(--paper); border: 1px solid var(--line); }
  [data-workflows="workbench"] .wf-payload strong { font-weight: 400; font-size: 13px; }
  [data-workflows="workbench"] .wf-payload pre, [data-workflows="workbench"] .wf-rule { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; font-size: 12px; line-height: 1.65; color: var(--ink-soft); }
  [data-workflows="workbench"] .wf-payload a { font-size: 12px; color: var(--blue); overflow-wrap: anywhere; }
  /* The embedded plugin. A new step's view fades in over the last one; only a first load shows the skeleton. */
  [data-workflows="workbench"] .wf-stage__frame { position: relative; flex: 1; min-height: 0; border-top: 1px solid var(--line); background: var(--paper); }
  [data-workflows="workbench"] .wf-stage__frame.is-empty { display: grid; align-content: start; }
  [data-workflows="workbench"] .wf-stage__frame iframe {
    position: absolute; inset: 0; display: block; width: 100%; height: 100%; border: 0; background: var(--paper);
    transition: opacity var(--motion-normal, 190ms) var(--ease-out, ease-out);
  }
  [data-workflows="workbench"] .wf-stage__frame iframe.is-entering { opacity: 0; }
  [data-workflows="workbench"] .wf-frame-skeleton {
    position: absolute; inset: 0; display: grid; align-content: start; gap: 14px; padding: 28px 32px;
    opacity: 0; pointer-events: none; transition: opacity var(--wf-edge);
  }
  [data-workflows="workbench"] .wf-frame-skeleton .mw-skeleton:first-child { height: 16px; margin-bottom: 8px; }
  [data-workflows="workbench"] .wf-stage__frame.is-cold.is-loading .wf-frame-skeleton { opacity: 1; transition-delay: 120ms; }
  [data-workflows="workbench"] .wf-stage__empty { margin: 24px 16px; }
  [data-workflows="workbench"] .wf-toast {
    position: absolute; left: 50%; bottom: 20px; z-index: 30; margin: 0; padding: 8px 14px;
    border-radius: var(--radius-control, 10px); background: var(--action); color: var(--action-ink); font-size: 12px; box-shadow: var(--shadow-raised, none);
    opacity: 0; transform: translate(-50%, 6px); pointer-events: none;
    transition: opacity var(--wf-edge), transform var(--motion-normal, 190ms) var(--ease-out, ease-out);
  }
  [data-workflows="workbench"] .wf-toast.is-on { opacity: 1; transform: translate(-50%, 0); }
  [data-workflows="workbench"] .wf-toast.has-action { display: flex; align-items: center; gap: 12px; padding: 6px 6px 6px 14px; }
  [data-workflows="workbench"] .wf-toast.has-action.is-on { pointer-events: auto; }
  [data-workflows="workbench"] .wf-toast__action {
    height: 24px; padding: 0 10px; border: 0; border-radius: 7px; background: color-mix(in srgb, var(--action-ink) 14%, transparent);
    color: inherit; font: inherit; font-size: 12px; cursor: pointer; transition: background-color var(--wf-hover);
  }
  [data-workflows="workbench"] .wf-toast__action:hover { background: color-mix(in srgb, var(--action-ink) 24%, transparent); }
  [data-workflows="workbench"] .wf-toast__action:focus-visible { outline: 1px solid var(--action-ink); outline-offset: 1px; }
  [data-workflows="workbench"] .wf-toast[data-tone="error"] { background: var(--red); color: #fff; }
  [data-workflows="workbench"] .wf-toast[hidden] { display: none; }
  @media (max-width: 760px) {
    [data-workflows="workbench"] .wf-row { grid-template-columns: minmax(0, 1fr); gap: 2px; }
    [data-workflows="workbench"] .wf-row__meta { display: none; }
    [data-workflows="workbench"] .wf-run__body { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
    [data-workflows="workbench"] .wf-vchain { display: flex; gap: 4px; overflow-x: auto; padding: 8px; border-right: 0; border-bottom: 1px solid var(--line); }
    [data-workflows="workbench"] .wf-vstep { width: auto; flex: none; }
    [data-workflows="workbench"] .wf-vlink { display: none; }
    [data-workflows="workbench"] .wf-run__bar .wf-pips, [data-workflows="workbench"] .wf-run__title .wf-muted { display: none; }
    [data-workflows="workbench"] .wf-run-row { grid-template-columns: minmax(0, 1fr) auto; }
    [data-workflows="workbench"] .wf-run-row > .mw-status, [data-workflows="workbench"] .wf-run-row > .wf-muted { display: none; }
    [data-workflows="workbench"] .wf-editor__scroll { padding: 16px; }
    [data-workflows="workbench"] .wf-tool, [data-workflows="workbench"] .wf-add { min-width: 32px; min-height: 32px; }
  }
  @media (pointer: coarse) {
    [data-workflows="workbench"] .wf-kbd-hint { display: none; }
    [data-workflows="workbench"] .wf-add { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    [data-workflows="workbench"] *, [data-workflows="workbench"] *::after, [data-workflows="workbench"] .wf-pop:popover-open { transition: none !important; animation: none !important; }
  }
`;
