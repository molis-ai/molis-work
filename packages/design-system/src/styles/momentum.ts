/** AP3 visual layer: momentum. */
export const MOMENTUM_STYLES = `  /* Momentum is an evidence-led workbench: cadence, complete topology, then action. */
  .goal-momentum {
    min-width: 0;
    height: 100%;
    padding: clamp(14px, 1.6vw, 24px);
    overflow: auto;
    background: var(--page);
    display: grid;
    grid-template-rows: auto auto auto minmax(0, auto);
    gap: 14px;
    align-content: start;
  }
  .goal-momentum[hidden] { display: none; }
  .momentum-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 20px;
  }
  .momentum-head h1 { margin: 2px 0 5px; color: var(--ink); font-size: clamp(19px, 2vw, 27px); line-height: 1.15; letter-spacing: -.035em; }
  .momentum-head > div > p:last-child { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.5; }
  .momentum-section-label {
    margin: 0;
    color: var(--muted);
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 9px;
    font-weight: 400;
    letter-spacing: .08em;
    text-transform: uppercase;
  }
  .momentum-section-label::before { content: ""; width: 16px; border-top: 1px solid currentColor; }
  .momentum-period-switch, .momentum-map-filter {
    padding: 3px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--rail);
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .momentum-period-switch button, .momentum-map-filter button {
    min-height: 28px;
    padding: 0 9px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    font-size: 10px;
    font-weight: 400;
    cursor: pointer;
  }
  .momentum-period-switch button.is-active, .momentum-map-filter button.is-active {
    background: var(--ink);
    color: var(--paper);
    box-shadow: 0 2px 7px color-mix(in srgb, var(--ink), transparent 84%);
  }
  .momentum-cadence {
    min-height: 144px;
    border: 1px solid var(--line);
    border-radius: 13px;
    background: var(--paper);
    box-shadow: 0 8px 26px rgba(22, 31, 43, .045);
    display: block;
    overflow: hidden;
    container-type: inline-size;
  }
  .momentum-cadence-panel {
    min-height: 144px;
    padding: 17px 19px;
    display: grid;
    grid-template-columns: minmax(230px, .85fr) minmax(430px, 2.4fr);
    gap: 22px;
  }
  .momentum-cadence-panel[hidden] { display: none; }
  .momentum-cadence-panel:not([hidden]) { display: grid; }
  .momentum-cadence-copy { min-width: 0; display: flex; flex-direction: column; justify-content: space-between; gap: 12px; }
  .momentum-cadence-copy > strong { max-width: 460px; color: var(--ink); font-size: clamp(13px, 1.45cqi, 17px); line-height: 1.45; letter-spacing: -.012em; }
  .momentum-metrics { margin: 0; display: flex; flex-wrap: wrap; gap: 7px 13px; }
  .momentum-metrics span { color: var(--muted); display: inline-flex; align-items: baseline; gap: 4px; font-size: 10px; }
  .momentum-metrics b { color: var(--ink); font: 700 14px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .momentum-metrics [data-tone="good"] b { color: var(--green); }
  .momentum-metrics [data-tone="bad"] b { color: var(--red); }
  .momentum-metrics [data-tone="warn"] b { color: var(--amber); }
  .momentum-rail-wrap { min-width: 0; }
  .momentum-rail-legend { min-height: 18px; display: flex; justify-content: flex-end; gap: 13px; color: var(--muted); font-size: 9px; }
  .momentum-rail-legend span { display: inline-flex; align-items: center; gap: 5px; }
  .momentum-rail-legend i { width: 6px; height: 6px; border-radius: 2px; background: var(--blue); }
  .momentum-rail-legend [data-tone="completed"] i { background: var(--green); }
  .momentum-rail-legend [data-tone="blocked"] i { background: var(--red); }
  .momentum-rail {
    min-width: 0;
    height: 74px;
    padding: 0 0 17px;
    border-bottom: 1px solid var(--line);
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(8px, 1fr));
    gap: 3px;
    align-items: end;
  }
  .momentum-rail-day { position: relative; height: 54px; display: flex; align-items: flex-end; justify-content: center; gap: 2px; }
  .momentum-rail-day > i { width: clamp(2px, 18%, 7px); height: var(--momentum-bar); min-height: 1px; border-radius: 3px 3px 1px 1px; background: color-mix(in srgb, var(--blue), transparent 10%); }
  .momentum-rail-day > i[data-tone="completed"] { background: var(--green); }
  .momentum-rail-day > i[data-tone="blocked"] { background: var(--red); }
  .momentum-rail-day time { position: absolute; top: 59px; left: 50%; color: var(--muted); font-size: 8px; transform: translateX(-50%); white-space: nowrap; }
  .momentum-data-honesty, .momentum-integrity {
    margin: 7px 0 0;
    color: var(--muted);
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 9px;
    line-height: 1.45;
  }
  .momentum-data-honesty svg, .momentum-integrity svg { width: 12px; height: 12px; flex: 0 0 auto; margin-top: 1px; }
  .momentum-integrity { margin: 0; padding: 9px 11px; border: 1px solid color-mix(in srgb, var(--amber), var(--line) 58%); border-radius: 9px; background: color-mix(in srgb, var(--amber), transparent 92%); color: var(--ink-soft); }
  .momentum-workbench { min-width: 0; display: grid; gap: 14px; }
  .momentum-map-panel, .momentum-queue-panel {
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 13px;
    background: var(--paper);
    box-shadow: 0 8px 26px rgba(22, 31, 43, .045);
    overflow: hidden;
  }
  .momentum-panel-head {
    min-height: 57px;
    padding: 10px 13px 10px 16px;
    border-bottom: 1px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }
  .momentum-panel-head h2 { margin: 0; color: var(--ink); font-size: 13px; letter-spacing: -.01em; }
  .momentum-panel-head p { margin: 3px 0 0; color: var(--muted); font-size: 9px; }
  .momentum-map-actions { display: flex; align-items: center; gap: 7px; }
  .momentum-map-filter button.is-active { background: var(--paper); color: var(--ink); box-shadow: 0 1px 4px rgba(22, 31, 43, .09); }
  .graph-zoom {
    min-height: 28px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--paper);
    display: inline-flex;
    align-items: center;
    overflow: hidden;
  }
  .graph-zoom button { width: 27px; height: 27px; padding: 0; border: 0; border-left: 1px solid var(--line); background: transparent; color: var(--muted); display: grid; place-items: center; font: 650 11px/1 var(--font); cursor: pointer; }
  .graph-zoom button:first-child { border-left: 0; }
  .graph-zoom button:hover { color: var(--ink); background: var(--rail); }
  .graph-zoom button:disabled { opacity: .35; cursor: default; }
  .graph-zoom button svg { width: 11px; height: 11px; }
  .graph-zoom output { width: 39px; color: var(--muted); text-align: center; font-size: 9px; font-variant-numeric: tabular-nums; }
  .graph-viewport { min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; }
  .momentum-map-scroll {
    max-height: min(62vh, 720px);
    background: var(--page);
    cursor: grab;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .momentum-map-scroll::-webkit-scrollbar { display: none; width: 0; height: 0; }
  .momentum-map-scroll.is-panning { cursor: grabbing; user-select: none; }
  .momentum-map.graph-stage {
    position: relative;
    width: max(100%, calc(var(--momentum-level-count) * 218px + 64px));
    min-width: 0;
    min-height: calc(var(--momentum-grid-rows) * 82px + 58px);
    padding: 0 30px 24px;
    background:
      linear-gradient(to right, color-mix(in srgb, var(--line) 36%, transparent) 1px, transparent 1px),
      linear-gradient(to bottom, color-mix(in srgb, var(--line) 30%, transparent) 1px, transparent 1px),
      var(--page);
    background-size: 32px 32px;
    display: grid;
    grid-template-columns: repeat(var(--momentum-level-count), minmax(178px, 190px));
    grid-template-rows: 42px repeat(var(--momentum-grid-rows), minmax(70px, auto));
    column-gap: 28px;
    row-gap: 12px;
    align-items: center;
    isolation: isolate;
  }
  .momentum-level {
    position: sticky;
    z-index: 6;
    top: 0;
    grid-column: var(--momentum-column);
    grid-row: 1;
    height: 42px;
    margin: 0 -14px;
    padding: 0 14px;
    color: var(--muted);
    background: color-mix(in srgb, var(--page) 94%, transparent);
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 9px;
    font-weight: 400;
  }
  .momentum-level b { min-width: 20px; height: 20px; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--paper); color: var(--ink-soft); display: grid; place-items: center; font: 700 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .momentum-group {
    z-index: 0;
    position: relative;
    grid-column: var(--momentum-column-start) / var(--momentum-column-end);
    grid-row: var(--momentum-row-start) / var(--momentum-row-end);
    align-self: stretch;
    margin: -7px -14px;
    border: 1px dashed color-mix(in srgb, var(--line-strong), transparent 20%);
    border-radius: 12px;
    background: color-mix(in srgb, var(--paper) 74%, transparent);
    pointer-events: none;
  }
  .momentum-group[hidden] { display: none; }
  .momentum-group header { position: absolute; top: 5px; left: 8px; right: 8px; min-width: 0; color: var(--muted); display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 8px; font-weight: 400; }
  .momentum-group header button, .momentum-group header > span { min-width: 0; overflow: hidden; padding: 2px 4px; border: 0; border-radius: 5px; background: transparent; color: inherit; font: inherit; text-overflow: ellipsis; white-space: nowrap; }
  .momentum-group header button { cursor: pointer; pointer-events: auto; }
  .momentum-group header button:hover, .momentum-group header button.is-selected { color: var(--ink); background: var(--nav-hover); }
  .momentum-group header small { flex: 0 0 auto; font-size: 8px; font-weight: 400; white-space: nowrap; }
  .momentum-edges { z-index: 1; position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
  .momentum-edge path { fill: none; stroke: var(--line-strong); stroke-width: 1.15; stroke-linecap: round; stroke-linejoin: round; opacity: .2; vector-effect: non-scaling-stroke; }
  .momentum-edge.is-selected-path path { stroke: var(--blue); stroke-width: 2; opacity: 1; }
  .momentum-edge[hidden] { display: none; }
  #momentum-arrow path { fill: var(--line-strong); }
  #momentum-arrow-selected path { fill: var(--blue); }
  .momentum-node {
    z-index: 2;
    position: relative;
    grid-column: var(--momentum-column);
    grid-row: var(--momentum-row);
    align-self: center;
    min-width: 0;
    min-height: 58px;
    margin-top: 0;
    padding: 8px 9px;
    border: 1px solid var(--line-strong);
    border-radius: 9px;
    background: var(--paper);
    color: var(--ink);
    text-align: left;
    box-shadow: 0 4px 14px rgba(22, 31, 43, .055);
    cursor: pointer;
  }
  .momentum-node.is-group-first-row { align-self: start; margin-top: 26px; }
  .momentum-node:hover { border-color: color-mix(in srgb, var(--blue), var(--line) 48%); transform: translateY(-1px); }
  .momentum-node.is-selected { border-color: var(--blue); box-shadow: 0 0 0 3px color-mix(in srgb, var(--blue), transparent 82%), 0 7px 20px rgba(22, 31, 43, .08); }
  .momentum-node.is-connected-path:not(.is-selected) { border-color: color-mix(in srgb, var(--blue), var(--line) 54%); }
  .momentum-node.is-complete { opacity: .58; box-shadow: none; }
  .momentum-node.is-complete:hover, .momentum-node.is-complete.is-selected { opacity: 1; }
  .momentum-node.is-bottleneck { border-color: color-mix(in srgb, var(--red), var(--line) 44%); }
  .momentum-node.is-bottleneck::after { content: ""; position: absolute; top: -4px; right: 10px; width: 7px; height: 7px; border-radius: 50%; background: var(--red); box-shadow: 0 0 0 3px color-mix(in srgb, var(--red), transparent 80%); }
  .momentum-node[hidden] { display: none; }
  .momentum-node-kicker { margin-bottom: 4px; color: var(--muted); display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .momentum-node-kicker > b { color: var(--muted); font: 700 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .momentum-node .goal-status { min-height: 15px; padding: 0 4px; border: 0; background: transparent; font-size: 8px; }
  .momentum-node .goal-status svg { width: 9px; height: 9px; }
  .momentum-node > strong { display: -webkit-box; overflow: hidden; font-size: 10.5px; line-height: 1.35; font-weight: 400; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .momentum-node > small { display: block; margin-top: 4px; overflow: hidden; color: var(--muted); font-size: 8px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
  .momentum-legend { min-height: 38px; padding: 7px 13px; border-top: 1px solid var(--line); background: var(--rail); color: var(--muted); display: flex; align-items: center; flex-wrap: wrap; gap: 9px 15px; font-size: 9px; }
  .momentum-legend span { display: inline-flex; align-items: center; gap: 6px; }
  .momentum-legend i { width: 18px; border-top: 2px solid var(--line-strong); }
  .momentum-legend i[data-kind="selected"] { border-color: var(--blue); }
  .momentum-legend i[data-kind="group"] { border-top-style: dashed; }
  .momentum-legend small { margin-left: auto; font-size: 9px; }
  .momentum-queue-panel { display: grid; grid-template-columns: minmax(320px, 420px) minmax(0, 1fr); }
  .momentum-queue-column { min-width: 0; border-right: 1px solid var(--line); }
  .momentum-queue-list { max-height: 480px; margin: 0; padding: 0; overflow: auto; list-style: none; }
  .momentum-queue-list li + li { border-top: 1px solid var(--line); }
  .momentum-queue-item { width: 100%; min-height: 60px; padding: 10px 12px; border: 0; background: transparent; color: var(--ink); display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; align-items: center; gap: 9px; text-align: left; cursor: pointer; }
  .momentum-queue-item:hover { background: var(--rail); }
  .momentum-queue-item.is-selected { background: var(--nav-active); }
  .momentum-queue-item > b { width: 23px; height: 23px; border: 1px solid var(--line-strong); border-radius: 7px; background: var(--paper); color: var(--muted); display: grid; place-items: center; font: 650 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .momentum-queue-item > span { min-width: 0; display: grid; gap: 3px; }
  .momentum-queue-item > span strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .momentum-queue-item > span small { overflow: hidden; color: var(--muted); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
  .momentum-selection-column { min-width: 0; }
  .momentum-selection { min-height: 100%; padding: 17px 19px; }
  .momentum-selection[hidden] { display: none; }
  .momentum-selection-title { margin-top: 10px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .momentum-selection-title h3 { margin: 0 0 3px; color: var(--ink); font-size: 16px; line-height: 1.3; letter-spacing: -.02em; }
  .momentum-selection-title small { color: var(--muted); font: 500 8px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .momentum-selection dl { margin: 16px 0 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
  .momentum-selection dl div { padding: 9px; border: 1px solid var(--line); border-radius: 9px; background: var(--rail); }
  .momentum-selection dt { color: var(--muted); font-size: 8px; }
  .momentum-selection dd { margin: 3px 0 0; color: var(--ink); font-size: 13px; font-weight: 400; }
  .momentum-selection ul { margin: 14px 0 18px; padding-left: 17px; color: var(--ink-soft); display: grid; gap: 6px; font-size: 10px; line-height: 1.45; }
  .momentum-selection > a { width: fit-content; min-height: 31px; padding: 0 11px; display: inline-flex; align-items: center; gap: 6px; text-decoration: none; }
  .momentum-selection > a svg { width: 11px; height: 11px; }
  .momentum-empty { min-height: 320px; border: 1px dashed var(--line-strong); border-radius: 13px; background: var(--paper); color: var(--muted); display: grid; place-content: center; justify-items: center; text-align: center; }
  .momentum-empty > svg { width: 28px; height: 28px; }
  .momentum-empty h2 { margin: 12px 0 5px; color: var(--ink); font-size: 16px; }
  .momentum-empty p { max-width: 360px; margin: 0; font-size: 10px; line-height: 1.5; }
  html[data-resolved-theme="dark"] .momentum-group { background: color-mix(in srgb, var(--paper) 54%, transparent); }
  html[data-resolved-theme="dark"] .momentum-period-switch button.is-active { background: var(--nav-active); color: var(--ink); }

  @container (max-width: 780px) {
    .momentum-cadence-panel { min-height: 0; padding: 15px 16px; grid-template-columns: minmax(0, 1fr); gap: 14px; }
    .momentum-cadence-copy { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 9px 16px; }
    .momentum-cadence-copy .momentum-section-label { grid-column: 1 / -1; }
    .momentum-cadence-copy > strong { max-width: 62ch; }
    .momentum-metrics { justify-content: flex-end; }
    .momentum-rail-legend { justify-content: flex-start; }
    .momentum-queue-panel { grid-template-columns: minmax(0, 1fr); }
    .momentum-queue-column { border-right: 0; border-bottom: 1px solid var(--line); }
    .momentum-queue-list { max-height: 330px; }
  }

  @container (max-width: 520px) {
    .momentum-cadence-panel { padding: 14px; }
    .momentum-cadence-copy { grid-template-columns: minmax(0, 1fr); }
    .momentum-metrics { justify-content: flex-start; }
    .momentum-rail-legend { gap: 10px; }
    .momentum-data-honesty { max-width: 62ch; }
  }

  .tree-resizer, .tui-resizer { background: var(--page); }
  .tree-resizer::after, .tui-resizer::after { background: var(--line); }
  .document-pane { background: var(--paper); }
  .document-pane[aria-busy="true"] > [data-goal-view] {
    opacity: 0;
    pointer-events: none;
    transition: opacity .12s ease;
  }
  .goal-document-loading {
    position: sticky;
    z-index: 9;
    top: 12px;
    width: fit-content;
    min-height: 32px;
    margin: 12px auto -44px;
    padding: 0 12px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--paper);
    color: var(--ink-soft);
    box-shadow: 0 8px 24px color-mix(in srgb, var(--page) 76%, transparent);
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 400;
  }
  .goal-document-loading::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--blue);
    animation: pulse 1s ease-in-out infinite;
  }
  .goal-document { width: min(100%, 940px); padding: 22px 32px 56px; }
  .goal-header { padding-bottom: 13px; }
  .goal-title-row h1 { font-size: clamp(21px, 2vw, 27px); line-height: 1.18; letter-spacing: -.035em; }
  .goal-title-copy { min-width: 0; }
  .goal-title-outcome {
    max-width: 66ch;
    margin: 9px 0 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.55;
    letter-spacing: -.005em;
    white-space: pre-wrap;
  }
  .goal-more > summary, .goal-more > div { border-color: var(--line); background: var(--paper); }
  .goal-focus-outcome {
    padding: 22px 0 20px;
    border-bottom: 1px solid var(--line);
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    gap: 10px;
  }
  .goal-focus-outcome > span { color: var(--blue); padding-top: 2px; }
  .goal-focus-outcome > span svg { width: 17px; height: 17px; }
  .goal-focus-outcome small { color: var(--muted); font-size: 11px; font-weight: 400; }
  .goal-focus-outcome p { max-width: 70ch; margin: 5px 0 0; color: var(--ink); font-size: 17px; line-height: 1.55; letter-spacing: -.015em; white-space: pre-wrap; }
  .goal-now {
    margin-top: 0;
    padding: 19px 0 18px;
    border: 0;
    border-bottom: 1px solid var(--line);
    border-radius: 0;
    background: transparent;
  }
  .goal-now-body {
    margin-top: 12px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px 18px;
  }
  .goal-now-body > div > strong { font-size: 16px; }
  .goal-now-body p { color: var(--ink-soft); }
  .goal-now-body small { display: block; margin-top: 5px; color: var(--muted); font-size: 10px; }
  .goal-now-body small b { margin-right: 4px; color: var(--ink-soft); }
  .goal-now-blockers { border-top-color: color-mix(in srgb, var(--blue), var(--line) 72%); }
  .goal-now-blockers--clear { color: var(--muted); grid-template-columns: 180px minmax(0, 1fr); }
  .goal-now-blockers--clear > strong { color: var(--green); display: inline-flex; align-items: center; gap: 6px; }
  .goal-now-blockers--clear > strong svg { width: 13px; height: 13px; }
  .goal-now-blockers--clear p { margin: 0; color: var(--muted); font-size: 12px; }
  .goal-focus-criteria { padding: 19px 0 21px; border-bottom: 1px solid var(--line); }
  .goal-focus-criteria > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
  .goal-focus-criteria h2 { margin: 0; font-size: 15px; letter-spacing: -.015em; }
  .goal-focus-criteria header p { margin: 2px 0 0; color: var(--muted); font-size: 11px; }
  .goal-focus-criteria header > strong { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .goal-focus-criteria ul { list-style: none; margin: 10px 0 0; padding: 0; }
  .goal-focus-criteria li { min-height: 38px; padding: 7px 0; border-top: 1px solid var(--line); display: flex; align-items: flex-start; gap: 10px; }
  .goal-focus-criteria li > span:last-child { min-width: 0; display: grid; gap: 1px; }
  .goal-focus-criteria li > span:last-child > strong { font-size: 12px; font-weight: 400; }
  .goal-focus-criteria li small { color: var(--muted); font-size: 10px; }
  .goal-focus-criteria > a { width: fit-content; margin-top: 10px; color: var(--blue-dark); display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 400; text-decoration: none; }
  .goal-focus-criteria > a svg { width: 12px; height: 12px; }
  .goal-focus-criteria > a:hover { text-decoration: underline; }
  .goal-focus-context { padding: 19px 0 21px; border-bottom: 1px solid var(--line); }
  .goal-focus-context > header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
  .goal-focus-context h2 { margin: 0; font-size: 15px; letter-spacing: -.015em; }
  .goal-focus-context header p { margin: 0; color: var(--muted); font-size: 10px; }
  .goal-focus-context dl { margin: 10px 0 0; }
  .goal-focus-context dl > div { min-height: 37px; border-top: 1px solid var(--line); display: grid; grid-template-columns: minmax(92px, 31%) minmax(0, 1fr); align-items: center; gap: 14px; }
  .goal-focus-context dt { color: var(--muted); font-size: 10px; }
  .goal-focus-context dd { margin: 0; overflow-wrap: anywhere; color: var(--ink-soft); font-size: 11px; }
  .companion-runtime { display: none; }
  .document-section { padding: 18px 0; border-bottom-color: var(--line); }
  .document-section h2, .document-subsection h3 { letter-spacing: -.015em; }
  .goal-purpose > section { padding: 12px 0; border-color: var(--line); }

  .tui-pane, .tui-tabs, .tui-owner { background: var(--rail); }
  .tui-pane { grid-template-rows: 58px 42px minmax(0, 1fr); }
  .tui-tabs { height: 42px; border-bottom-color: var(--line); }
  .tui-mode-label {
    height: 100%;
    padding: 0 8px;
    border-bottom: 1px solid var(--blue);
    color: var(--ink);
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    font-size: 11px;
    font-weight: 400;
  }
  .tui-stage { padding: 11px 12px 12px; gap: 9px; }
  .tui-tab.is-active { color: var(--ink); background: var(--paper); box-shadow: inset 0 0 0 1px var(--line); }
  .tui-owner {
    min-width: 0;
    padding: 9px 13px 8px;
    border-bottom: 1px solid var(--line);
    color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .tui-owner-copy { min-width: 0; flex: 1 1 auto; display: grid; gap: 3px; }
  .tui-owner-copy > strong { min-width: 0; overflow: hidden; color: var(--ink); font-size: 14px; font-weight: 400; text-overflow: ellipsis; white-space: nowrap; }
  .tui-owner-binding { min-width: 0; color: var(--muted); display: flex; align-items: center; gap: 6px; font-size: 10px; }
  .tui-owner-binding i { width: 5px; height: 5px; border-radius: 50%; background: var(--green); flex: 0 0 auto; }
  .tui-owner-binding b { font-weight: 400; }
  .tui-owner-actions { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; }
  .tui-owner-actions > .goal-status { flex: 0 0 auto; }
  .tui-focus-return {
    min-height: 28px;
    padding: 0 9px;
    border: 0;
    border-radius: 8px;
    color: var(--muted);
    background: transparent;
    font: inherit;
    font-size: 9.5px;
    font-weight: 400;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    cursor: pointer;
  }
  .tui-menu {
    border-color: var(--line-strong);
    background: var(--paper);
    color: var(--ink);
    box-shadow: 0 16px 44px rgba(14, 18, 26, .18);
  }
  .tui-menu > strong { color: var(--ink); }
  .tui-menu input,
  .tui-menu select {
    border-color: var(--line-strong);
    background: color-mix(in srgb, var(--paper) 92%, var(--rail));
    color: var(--ink);
  }
  .tui-menu input::placeholder { color: var(--faint); }
  .tui-runtime-choices button,
  .tui-menu-actions button:not(.mw-btn) {
    border-color: var(--line-strong);
    background: color-mix(in srgb, var(--paper) 92%, var(--rail));
    color: var(--ink-soft);
  }
  .tui-runtime-choices button:hover,
  .tui-runtime-choices button.is-selected {
    border-color: var(--line-strong);
    background: var(--nav-active);
    color: var(--ink);
  }
  .tui-runtime-choices button:disabled {
    border-color: var(--line);
    background: var(--rail);
    color: var(--faint);
    opacity: .72;
  }
  .tui-menu-missing {
    border: 1px solid color-mix(in srgb, var(--amber), var(--line) 62%);
    background: var(--amber-soft);
    color: var(--amber);
  }
  .tui-chrome button:not(.mw-btn) { border-color: var(--line-strong); border-radius: 8px; background: var(--paper); }
  .tui-terminal { border-color: var(--terminal-border); border-radius: 11px; box-shadow: none; }
  .tui-empty { color: var(--muted); }
  body[data-desktop-shell="true"] .tui-pane { grid-template-rows: 58px 42px minmax(0, 1fr); }
  body[data-desktop-shell="true"] .tui-owner { padding-inline: 18px; }
  body[data-desktop-shell="true"] .tui-owner-copy > strong { font-size: 14px; }
  body[data-desktop-shell="true"] .tui-tabs { padding-inline: 12px 10px; }
  body[data-desktop-shell="true"] .tui-stage { padding: 12px 14px 14px; }
  body[data-desktop-shell="true"] .tui-chrome { padding: 0 2px; }
  body[data-desktop-shell="true"] .tui-terminal { border-radius: 10px; }

  @media (min-width: 1181px) and (max-width: 1320px) {
    body[data-desktop-shell="true"] .goal-title-row h1 { font-size: clamp(26px, 2.15vw, 30px); }
    body[data-desktop-shell="true"] .goal-now-body { grid-template-columns: minmax(0, 1fr); align-items: start; }
  }

  @container (max-width: 580px) {
    .goal-now-body { grid-template-columns: minmax(0, 1fr); align-items: start; }
  }

  html[data-resolved-theme="dark"] .topbar,
  html[data-resolved-theme="dark"] .tree-pane,
  html[data-resolved-theme="dark"] .tree-chrome,
  html[data-resolved-theme="dark"] .tree-footer,
  html[data-resolved-theme="dark"] .tui-pane,
  html[data-resolved-theme="dark"] .tui-tabs,
  html[data-resolved-theme="dark"] .tui-owner,
  html[data-resolved-theme="dark"] .settings-navigation,
  html[data-resolved-theme="dark"] .project-index-panel { background: var(--rail); }
  html[data-resolved-theme="dark"] .document-pane,
  html[data-resolved-theme="dark"] .goal-document,
  html[data-resolved-theme="dark"] .settings-document,
  html[data-resolved-theme="dark"] .theme-menu,
  html[data-resolved-theme="dark"] .dialog-shell { background: var(--paper); color: var(--ink); }
  html[data-resolved-theme="dark"] .locale-switch { background: var(--paper); }
  html[data-resolved-theme="dark"] .project-context,
  html[data-resolved-theme="dark"] .top-action,
  html[data-resolved-theme="dark"] a.top-action,
  html[data-resolved-theme="dark"] .tree-tool,
  html[data-resolved-theme="dark"] a.tree-tool,
  html[data-resolved-theme="dark"] .tree-footer,
  html[data-resolved-theme="dark"] .tree-dep-copy strong,
  html[data-resolved-theme="dark"] .goal-now-body p,
  html[data-resolved-theme="dark"] .goal-purpose p,
  html[data-resolved-theme="dark"] .business-copy,
  html[data-resolved-theme="dark"] .trash-summary,
  html[data-resolved-theme="dark"] .trash-restore-row,
  html[data-resolved-theme="dark"] .evidence-record p,
  html[data-resolved-theme="dark"] .relation-copy .relation-path,
  html[data-resolved-theme="dark"] .relation-authority small { color: var(--ink-soft); }
  html[data-resolved-theme="dark"] input:not([type="range"]):not(.mw-slider):not(.global-search-query),
  html[data-resolved-theme="dark"] textarea,
  html[data-resolved-theme="dark"] select,
  html[data-resolved-theme="dark"] .tree-filter,
  html[data-resolved-theme="dark"] .tree-search input,
  html[data-resolved-theme="dark"] .tree-search kbd,
  html[data-resolved-theme="dark"] .tui-tab.is-active,
  html[data-resolved-theme="dark"] .goal-meta,
  html[data-resolved-theme="dark"] .decision-record,
  html[data-resolved-theme="dark"] .decision-results,
  html[data-resolved-theme="dark"] .goal-tree-risk-options,
  html[data-resolved-theme="dark"] .decision-actions button:not(.mw-btn--primary) {
    border-color: var(--line-strong);
    background: color-mix(in srgb, var(--paper) 86%, var(--rail));
    color: var(--ink);
  }
  html[data-resolved-theme="dark"] .tree-filter-option,
  html[data-resolved-theme="dark"] .contract-diff-row,
  html[data-resolved-theme="dark"] .proposal-appendix,
  html[data-resolved-theme="dark"] .candidate-contract > div { border-color: var(--line); }
  html[data-resolved-theme="dark"] .decision-record-heading,
  html[data-resolved-theme="dark"] .decision-details > summary,
  html[data-resolved-theme="dark"] .decision-reason,
  html[data-resolved-theme="dark"] .risk-resolution-fields,
  html[data-resolved-theme="dark"] .decision-record > footer.decision-actions,
  html[data-resolved-theme="dark"] .decision-link-row,
  html[data-resolved-theme="dark"] .decision-results > header {
    border-color: var(--line);
    background: color-mix(in srgb, var(--rail) 76%, var(--paper));
    color: var(--ink);
  }
  html[data-resolved-theme="dark"] .decision-guidance {
    border-color: var(--line-strong);
    background: color-mix(in srgb, var(--paper) 88%, var(--rail));
  }
  html[data-resolved-theme="dark"] .decision-guidance > section { border-color: var(--line); }
  html[data-resolved-theme="dark"] .decision-recommendation.has-recommendation {
    background: color-mix(in srgb, var(--green-soft) 72%, var(--paper));
  }
  html[data-resolved-theme="dark"] .decision-details > summary,
  html[data-resolved-theme="dark"] .decision-kind,
  html[data-resolved-theme="dark"] .decision-link-row a,
  html[data-resolved-theme="dark"] .risk-decision > footer.decision-actions a { color: var(--blue-dark); }
  html[data-resolved-theme="dark"] .risk-decision-fact p,
  html[data-resolved-theme="dark"] .risk-decision-fact small { color: var(--ink-soft); }
  html[data-resolved-theme="dark"] .risk-state-preview {
    border-color: var(--blue);
    background: color-mix(in srgb, var(--blue-soft) 58%, var(--paper));
    color: var(--ink-soft);
  }
  html[data-resolved-theme="dark"] .decision-actions button:disabled {
    border-color: var(--line) !important;
    background: var(--page) !important;
    color: var(--faint) !important;
  }
  html[data-resolved-theme="dark"] .mw-btn--primary,
  html[data-resolved-theme="dark"] .mw-btn--primary:hover,
  html[data-resolved-theme="dark"] .planning-form footer button[type="submit"],
  html[data-resolved-theme="dark"] .runtime-plan-shell > footer .runtime-plan-apply {
    color: var(--action-ink) !important;
  }
  html[data-resolved-theme="dark"] .navigator-view-switch,
  html[data-resolved-theme="dark"] .graph-toolbar,
  html[data-resolved-theme="dark"] .graph-legend { background: var(--rail); }
  html[data-resolved-theme="dark"] .navigator-view-switch button.is-active,
  html[data-resolved-theme="dark"] .graph-relation-toggles button,
  html[data-resolved-theme="dark"] .goal-factor-nav,
  html[data-resolved-theme="dark"] .relation-direction-control > div,
  html[data-resolved-theme="dark"] .relation-editor,
  html[data-resolved-theme="dark"] .relation-inactive-history,
  html[data-resolved-theme="dark"] .factor-advanced { border-color: var(--line-strong); background: var(--rail); }
  html[data-resolved-theme="dark"] .goal-factor-nav button { border-color: var(--line); background: transparent; color: var(--muted); }
  html[data-resolved-theme="dark"] .goal-factor-nav button:hover,
  html[data-resolved-theme="dark"] .goal-factor-nav button[aria-selected="true"] { background: var(--nav-active); color: var(--ink); box-shadow: none; }
  html[data-resolved-theme="dark"] .goal-factor-nav button small { background: var(--line); color: var(--muted); }
  html[data-resolved-theme="dark"] .goal-factor-nav button[aria-selected="true"] small { background: var(--nav-hover); color: var(--ink); }
  html[data-resolved-theme="dark"] .relation-group > header,
  html[data-resolved-theme="dark"] .relation-actions,
  html[data-resolved-theme="dark"] .risk-actions,
  html[data-resolved-theme="dark"] .impact-actions { background: var(--rail); }
  html[data-resolved-theme="dark"] .relation-kind { background: var(--line); color: var(--ink-soft); }
  html[data-resolved-theme="dark"] .relation-authority,
  html[data-resolved-theme="dark"] .relation-live-preview { border-color: color-mix(in srgb, var(--blue), var(--line) 68%); background: color-mix(in srgb, var(--blue-soft) 72%, var(--paper)); }
  html[data-resolved-theme="dark"] .tree-node:hover,
  html[data-resolved-theme="dark"] .tree-dep:hover { background: color-mix(in srgb, var(--blue-soft) 64%, transparent); }
  html[data-resolved-theme="dark"] .mobile-switch button.is-active { color: var(--blue-dark); background: transparent; box-shadow: none; }

  @media (max-width: 1120px) {
    .topbar .project-context > strong { display: none; }
  }

  .goal-title-heading { min-width: 0; display: flex; align-items: center; gap: 8px; }
  .goal-title-status--narrow { display: none; }

  @media (max-width: 760px) {
    body[data-desktop-shell="true"] .goal-title-kicker,
    .goal-title-kicker { display: none; }
    body[data-desktop-shell="true"] .goal-title-heading,
    .goal-title-heading { align-items: baseline; flex-wrap: wrap; column-gap: 8px; row-gap: 3px; }
    .goal-title-status--narrow { display: inline-flex; }
    body[data-desktop-shell="true"] .goal-title-status--narrow .goal-status,
    .goal-title-status--narrow .goal-status {
      min-height: 0;
      padding: 0;
      gap: 5px;
      border: 0;
      border-radius: 0;
      color: var(--muted);
      background: transparent;
      font-size: 9.5px;
      font-weight: 400;
    }
    .goal-title-status--narrow .goal-status::before { content: ""; width: 5px; height: 5px; flex: none; border-radius: 50%; background: var(--goal-status-tone); }
    .goal-title-status--narrow .goal-status > svg { display: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    body[data-navigation-pending="true"]::before,
    .goal-document-loading::before { animation: none; }
    .document-pane[aria-busy="true"] > [data-goal-view] { transition: none; }
  }

  @media (min-width: 761px) and (max-width: 1180px) {
    .workspace.is-desktop-tui,
    .workspace.is-desktop-tui.is-tui-collapsed {
      grid-template-columns: var(--tree-width, clamp(260px, 30vw, 320px)) 5px minmax(0, 1fr);
    }
    .workspace.is-desktop-tui .tui-resizer { display: none; }
    .workspace.is-desktop-tui .tui-pane {
      position: absolute;
      z-index: 12;
      top: 0;
      right: 0;
      bottom: 0;
      width: min(430px, 48vw);
      border-left: 1px solid var(--line-strong);
      box-shadow: -18px 0 42px rgba(21, 30, 43, .14);
    }
    .workspace.is-desktop-tui.is-tui-collapsed .tui-pane {
      visibility: hidden;
      pointer-events: none;
    }
    .workspace.is-desktop-tui .tui-expand {
      top: 50%;
      min-height: 104px;
      border-radius: 7px 0 0 7px;
      box-shadow: -8px 0 24px rgba(21, 30, 43, .12);
    }
    html[data-resolved-theme="dark"] .workspace.is-desktop-tui .tui-pane {
      box-shadow: -18px 0 48px rgba(0, 0, 0, .32);
    }
    .workspace.is-graph-view,
    .workspace.is-desktop-tui.is-graph-view,
    .workspace.is-desktop-tui.is-graph-view.is-tui-collapsed,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) {
      grid-template-columns: minmax(520px, 1fr) 5px minmax(300px, 36vw);
    }
  }

  @media (min-width: 761px) {
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] {
      grid-template-columns: minmax(0, 1fr) 5px minmax(330px, 32vw) !important;
    }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane {
      min-width: 0;
      grid-template-rows: auto 0 auto minmax(0, 1fr) 0;
    }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .navigator-project { grid-row: 1; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .desktop-pane-header { grid-row: 2; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .tree-chrome { grid-row: 3; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .tree-scroll { grid-row: 4; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .tree-footer { grid-row: 5; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .desktop-pane-header,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-footer,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .graph-direction-note { display: none; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .document-pane { min-width: 0; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tui-resizer,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tui-pane,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tui-expand { display: none !important; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) .tui-resizer,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) .tui-pane,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) .tui-expand { display: none; }
  }

  @media (min-width: 761px) {
    .workspace,
    .workspace.is-desktop-tui,
    .workspace.is-desktop-tui.is-tui-collapsed,
    .workspace.is-graph-view,
    .workspace.is-desktop-tui.is-graph-view,
    .workspace.is-desktop-tui.is-graph-view.is-tui-collapsed,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"],
    body[data-desktop-shell="true"] .workspace.is-desktop-tui:has(> .tree-pane[data-navigator-view="graph"]) {
      grid-template-columns: var(--tree-width, clamp(300px, 27vw, 400px)) 5px minmax(0, 1fr) !important;
      grid-template-rows: 50px minmax(0, 1fr);
    }
    .workspace > .tree-pane {
      grid-column: 1;
      grid-row: 1 / -1;
    }
    .workspace > .tree-resizer {
      grid-column: 2;
      grid-row: 1 / -1;
    }
    .workspace > .workbench-header {
      grid-column: 3;
      grid-row: 1;
      min-height: 50px;
      padding: 0 16px;
      display: flex;
    }
    body:not([data-desktop-shell="true"]) .workspace > .workbench-header {
      padding: 0 20px;
      background: var(--paper);
    }
    body:not([data-desktop-shell="true"]) .workbench-switch {
      align-self: stretch;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      gap: 18px;
    }
    body:not([data-desktop-shell="true"]) .workbench-switch button {
      position: relative;
      min-height: 49px;
      padding: 0 2px;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }
    body:not([data-desktop-shell="true"]) .workbench-switch button::after {
      content: "";
      position: absolute;
      right: 0;
      bottom: -1px;
      left: 0;
      height: 2px;
      border-radius: 2px 2px 0 0;
      background: transparent;
    }
    body:not([data-desktop-shell="true"]) .workbench-switch button.is-active { color: var(--ink); background: transparent; box-shadow: none; }
    body:not([data-desktop-shell="true"]) .workbench-switch button.is-active::after { background: var(--blue); }
    .workspace > .document-pane,
    .workspace > .goal-momentum,
    .workspace > .tui-pane {
      grid-column: 3;
      grid-row: 2;
      min-width: 0;
      min-height: 0;
    }
    .workspace.is-desktop-tui > .tui-pane {
      position: relative !important;
      inset: auto !important;
      width: auto !important;
      border-left: 0;
      box-shadow: none !important;
    }
    .workspace > .tui-resizer,
    .workspace > .tui-expand { display: none !important; }
    .workspace[data-workspace-mode="focus"] > .goal-momentum,
    .workspace[data-workspace-mode="focus"] > .tui-pane,
    .workspace[data-workspace-mode="graph"] > .document-pane,
    .workspace[data-workspace-mode="graph"] > .tui-pane,
    .workspace[data-workspace-mode="runtime"] > .document-pane,
    .workspace[data-workspace-mode="runtime"] > .goal-momentum { display: none !important; }
    .workspace[data-workspace-mode="focus"] > .document-pane { display: block; }
    .workspace[data-workspace-mode="graph"] > .goal-momentum { display: grid; }
    .workspace[data-workspace-mode="runtime"] > .tui-pane { display: grid; }
    .workspace[data-workspace-mode="graph"] > .workbench-header { display: none; }
    .workspace[data-workspace-mode="graph"] > .goal-momentum { grid-row: 1 / -1; }
    body[data-desktop-shell="true"] .workspace[data-workspace-mode="graph"] .graph-toolbar-copy { display: none; }
    .tree-pane[data-navigator-view="graph"] .tree-scroll { padding: 8px 12px 18px; overflow: auto; }
    .tree-pane[data-navigator-view="graph"] .goal-list-view { display: block; }
    .navigator-view-switch { display: grid; }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane {
      grid-template-rows: auto 34px auto minmax(0, 1fr) 46px;
    }
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-pane > .desktop-pane-header,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .tree-footer,
    body[data-desktop-shell="true"] .workspace.is-desktop-tui[data-navigator-view="graph"] .graph-direction-note { display: flex; }
    html[data-resolved-theme="dark"] .workbench-switch { background: var(--rail); }
    html[data-resolved-theme="dark"] .workbench-switch button.is-active { background: var(--paper); box-shadow: none; }
  }

  @media (max-width: 760px) {
    .app { grid-template-rows: 48px 44px minmax(0, 1fr); }
    body[data-desktop-shell="true"] .app { grid-template-rows: 44px 44px minmax(0, 1fr); }
    .topbar { min-width: 0; }
    .topbar[data-mobile-surface="document"] { transform: translateZ(.001px); }
    .brand { min-width: auto; padding: 0 12px; border-right: 0; }
    .brand strong { font-size: 15px; }
    .project-context { min-width: 0; padding: 0 8px; }
    .project-context span { max-width: 150px; }
    .top-spacer, body[data-desktop-shell="true"] .top-spacer { display: block; }
    .top-action { width: 30px; padding: 0; justify-content: center; }
    .top-action span, .theme-picker > summary span { display: none; }
    .theme-picker > summary .theme-caret { display: none; }
    .theme-menu { right: 0; }
    .mobile-switch {
      padding: 0 8px;
      gap: 3px;
      min-height: 44px;
      border-bottom-color: var(--line);
      background: var(--rail);
    }
    .mobile-switch button {
      position: relative;
      min-height: 44px;
      border-radius: 0;
      color: var(--muted);
      font-size: 12px;
      font-weight: 400;
    }
    .mobile-switch button:focus-visible {
      outline: 0;
      box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--blue) 62%, transparent);
    }
    .mobile-switch button::after {
      content: "";
      position: absolute;
      left: 28%;
      right: 28%;
      bottom: 0;
      height: 2px;
      border-radius: 1px;
      background: transparent;
    }
    .mobile-switch button.is-active { color: var(--blue-dark); background: transparent; box-shadow: none; }
    .mobile-switch button.is-active::after { background: var(--blue); }
    .workspace, .workspace.is-desktop-tui { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
    .workspace.is-graph-view, .workspace.is-desktop-tui.is-graph-view { grid-template-columns: minmax(0, 1fr); }
    .tree-pane { border-right: 0; }
    body[data-desktop-shell="true"] .desktop-pane-header { display: none; }
    .workbench-header { display: none; }
    .workspace > .goal-momentum { grid-column: 1; grid-row: 1; }
    .goal-momentum { padding: 12px; gap: 11px; }
    .momentum-head { align-items: flex-start; flex-direction: column; gap: 10px; }
    .momentum-head h1 { font-size: 20px; }
    .momentum-period-switch { align-self: stretch; }
    .momentum-period-switch button { min-height: 44px; flex: 1; }
    .momentum-cadence-panel { padding: 14px; grid-template-columns: minmax(0, 1fr); gap: 14px; }
    .momentum-cadence { min-height: 248px; }
    .momentum-panel-head { align-items: flex-start; flex-direction: column; }
    .momentum-map-actions { width: 100%; justify-content: space-between; }
    .momentum-map-filter { min-width: 0; }
    .momentum-map-filter button { min-height: 44px; padding-inline: 9px; }
    .graph-zoom button { width: 44px; height: 44px; }
    .graph-zoom output { width: 44px; }
    .momentum-map-scroll { max-height: 62vh; }
    .momentum-legend small { width: 100%; margin-left: 0; }
    .momentum-queue-panel { grid-template-columns: minmax(0, 1fr); }
    .momentum-queue-column { border-right: 0; border-bottom: 1px solid var(--line); }
    .momentum-selection dl { grid-template-columns: repeat(3, minmax(70px, 1fr)); }
    body[data-desktop-shell="true"] .tree-pane { grid-template-rows: auto auto minmax(0, 1fr) 42px; }
    body[data-desktop-shell="true"] .goal-document { padding: 17px 18px 38px; }
    body[data-desktop-shell="true"] .goal-header { padding-bottom: 14px; }
    body[data-desktop-shell="true"] .goal-title-row { display: flex; align-items: flex-start; gap: 12px; }
    body[data-desktop-shell="true"] .goal-title-actions { flex: 0 0 auto; justify-content: flex-end; }
    body[data-desktop-shell="true"] .goal-title-row h1 { font-size: 18px; line-height: 1.28; letter-spacing: -.025em; }
    body[data-desktop-shell="true"] .goal-focus-outcome { display: none; }
    body[data-desktop-shell="true"] .goal-now {
      margin: 0;
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--rail);
    }
    body[data-desktop-shell="true"] .goal-now-body { margin-top: 10px; }
    body[data-desktop-shell="true"] .goal-now-body > div > strong { font-size: 14px; }
    body[data-desktop-shell="true"] .goal-now-body p { margin-top: 5px; }
    body[data-desktop-shell="true"] .goal-now-blockers { margin-top: 13px; padding-top: 11px; }
    body[data-desktop-shell="true"] .companion-runtime {
      margin-top: 14px;
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--paper);
      display: grid;
      gap: 10px;
    }
    body[data-desktop-shell="true"] .companion-runtime > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    body[data-desktop-shell="true"] .companion-runtime header small { color: var(--muted); font-size: 10px; font-weight: 400; }
    body[data-desktop-shell="true"] .companion-runtime h2 { margin: 2px 0 0; font-size: 15px; letter-spacing: -.015em; }
    body[data-desktop-shell="true"] .companion-runtime-state { color: var(--muted); display: inline-flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 400; }
    body[data-desktop-shell="true"] .companion-runtime-state i { width: 6px; height: 6px; border-radius: 50%; background: var(--faint); }
    body[data-desktop-shell="true"] .companion-runtime-state.is-active { color: var(--green); }
    body[data-desktop-shell="true"] .companion-runtime-state.is-active i { background: var(--green); }
    body[data-desktop-shell="true"] .companion-runtime > p { margin: 0; color: var(--ink-soft); font-size: 11px; }
    body[data-desktop-shell="true"] .companion-runtime-progress { display: flex; align-items: center; gap: 9px; }
    body[data-desktop-shell="true"] .companion-runtime-progress > i { height: 5px; min-width: 0; flex: 1; border-radius: 3px; background: var(--line); overflow: hidden; }
    body[data-desktop-shell="true"] .companion-runtime-progress b { width: var(--companion-progress); height: 100%; border-radius: inherit; background: var(--blue); display: block; }
    body[data-desktop-shell="true"] .companion-runtime-progress span { color: var(--muted); font-size: 10px; font-variant-numeric: tabular-nums; }
    body[data-desktop-shell="true"] .companion-runtime dl { margin: 0; padding-top: 9px; border-top: 1px solid var(--line); display: grid; grid-template-columns: 1fr 1fr; }
    body[data-desktop-shell="true"] .companion-runtime dl div { display: grid; gap: 2px; }
    body[data-desktop-shell="true"] .companion-runtime dt { color: var(--muted); font-size: 9px; }
    body[data-desktop-shell="true"] .companion-runtime dd { margin: 0; color: var(--ink); font-size: 11px; font-weight: 400; }
    body[data-desktop-shell="true"] .companion-runtime > button { width: fit-content; padding: 0; border: 0; background: transparent; color: var(--ink); display: inline-flex; align-items: center; gap: 5px; font: 400 10px/1.2 var(--font); cursor: pointer; }
    body[data-desktop-shell="true"] .companion-runtime > button svg { width: 11px; height: 11px; }
    body[data-desktop-shell="true"] .goal-focus-criteria { margin-top: 3px; padding-top: 18px; }
    .navigator-view-switch { width: 100%; grid-template-columns: repeat(2, 1fr); }
    .graph-toolbar { flex-wrap: wrap; }
    .graph-toolbar-copy { flex-basis: 100%; }
    .graph-stage { min-width: 820px; padding-inline: 36px; }
    .graph-legend small { display: none; }
    .goal-document { padding: 18px 18px 44px; animation: none; }
    .goal-title-row h1 { font-size: 22px; }
    .goal-now { padding: 14px; }
    .tui-pane { grid-template-rows: 52px 38px minmax(0, 1fr); }
  }

  @media (min-width: 761px) {
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-chrome {
      padding: 4px 6px;
      gap: 2px 4px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-search input {
      height: 26px;
      border-radius: 5px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .navigator-view-switch {
      padding: 1px;
      border-radius: 6px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .navigator-view-switch button {
      min-height: 22px;
      border-radius: 4px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-scroll {
      padding: 2px 6px 8px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-children {
      margin-left: 8px;
      padding-left: 4px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-row {
      min-height: 27px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-toggle,
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-guide {
      width: 13px;
      height: 23px;
      flex-basis: 13px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-node {
      min-height: 25px;
      padding: 1px 4px;
      border-radius: 4px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-copy strong {
      font-size: 12px;
      font-weight: 400;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-copy {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-copy strong {
      min-width: 0;
      flex: 1;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-progress {
      flex: 0 0 auto;
      margin-top: 0;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-progress > i {
      display: none;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-node .goal-status {
      min-height: 16px;
      padding-inline: 0;
      border-color: transparent;
      border-radius: 0;
      background: transparent;
      font-size: 10px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-node .goal-status svg {
      display: none;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-relations {
      margin: 0 0 1px 13px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-relations > summary {
      min-height: 17px;
      padding-block: 0;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-deps {
      margin: 0 0 3px 13px;
      padding-block: 1px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-dep {
      min-height: 21px;
      padding-block: 1px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .tree-footer {
      min-height: 30px;
      padding-inline: 8px;
      font-size: 10px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-document {
      width: min(100%, 1120px);
      padding: 11px 18px 30px;
      font-size: 12px;
      line-height: 1.5;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-header {
      padding-bottom: 6px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-title-kicker {
      min-height: 15px;
      margin-bottom: 1px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-title-row {
      gap: 8px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-title-row h1 {
      font-size: clamp(18px, 1.55vw, 23px);
      line-height: 1.2;
      letter-spacing: -.025em;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-title-outcome {
      margin-top: 3px;
      font-size: 12px;
      line-height: 1.4;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-focus-outcome {
      padding: 10px 0;
      gap: 6px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-focus-outcome p {
      margin-top: 2px;
      font-size: 13px;
      line-height: 1.42;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-now {
      padding: 9px 0;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-now-body {
      margin-top: 6px;
      gap: 6px 10px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-now-body > div > strong {
      font-size: 13px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-now-body small {
      margin-top: 2px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-now-blockers {
      margin-top: 6px;
      padding-top: 6px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-focus-criteria,
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-focus-context {
      padding: 9px 0 11px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-focus-criteria ul,
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-focus-context dl {
      margin-top: 5px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-focus-criteria li {
      min-height: 28px;
      padding: 3px 0;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-focus-context dl > div {
      min-height: 27px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .document-section {
      padding: 9px 0;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .section-heading {
      margin-bottom: 5px;
      gap: 5px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .section-heading h2,
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-technical > header strong {
      font-size: 14px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .section-heading p,
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-technical > header small {
      font-size: 10px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .document-subsection {
      margin-top: 7px;
      padding-top: 7px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-purpose > section {
      padding: 6px 0;
      gap: 8px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-technical {
      padding-top: 10px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-technical > header {
      padding-bottom: 7px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .goal-technical-body {
      padding-bottom: 12px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .navigator-project {
      padding: 9px 10px 8px;
      gap: 4px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .navigator-project-primary {
      gap: 6px;
    }
    html[data-density="compact"] body[data-board-view]:not([data-board-view="decisions"]) .navigator-project-primary > strong {
      font-size: 13px;
    }
    html[data-density="compact"] body[data-desktop-shell="true"][data-board-view]:not([data-board-view="decisions"]) .tree-pane {
      grid-template-rows: auto 30px auto minmax(0, 1fr) 32px;
    }
    html[data-density="compact"] body[data-desktop-shell="true"][data-board-view]:not([data-board-view="decisions"]) .desktop-pane-header--navigator {
      min-height: 30px;
      padding-inline: 10px;
    }
    html[data-density="compact"] body[data-desktop-shell="true"][data-board-view]:not([data-board-view="decisions"]) .goal-document {
      padding: 10px 18px 30px;
    }
  }

`;

