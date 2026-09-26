/** Experiment-specific content; stage, controls, typography and dialog chrome come from the host. */
export const EXPERIMENTS_STYLES = `
  .experiments { color: var(--text); font: inherit; }
  .experiments [data-exp-main] { flex: 1; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; }
  .exp-list-item {
    display: flex; align-items: center; gap: 12px; width: 100%; min-height: 36px;
    padding: 6px 8px; border: 0; border-radius: 6px; background: transparent;
    color: inherit; font: inherit; text-align: left; cursor: pointer;
  }
  .exp-list-item:hover { background: var(--nav-hover); }
  .exp-list-item[aria-current="true"] { background: var(--nav-active); }
  .exp-list-item strong { flex: 1; min-width: 0; font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .exp-list-item small { flex: none; color: var(--faint); font-size: 11px; font-variant-numeric: tabular-nums; }
  .experiments[data-expanded="true"] .exp-list-date { display: none; }
  .exp-detail, .exp-form { min-width: 0; margin: 0; }
  .exp-toolbar { position: sticky; top: 0; z-index: 2; background: var(--paper); border-bottom: 1px solid var(--line); }
  .exp-toolbar .exp-actions { margin-left: auto; }
  .exp-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .exp-body, .exp-form { padding: 8px 20px 28px; }
  .exp-body { max-width: 1180px; }
  .exp-meta { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 4px 0 16px; color: var(--muted); font-size: 12px; }
  .exp-section { margin: 0; padding: 20px 0; border-bottom: 1px solid var(--line); min-width: 0; }
  .exp-section:last-child { border-bottom: 0; }
  .exp-section h3, .exp-section-head h3 { margin: 0; font-size: 13px; font-weight: 500; line-height: 1.6; }
  .exp-section-head { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
  .exp-section h3 + :is(p,.exp-grid,label) { margin-top: 10px; }
  .exp-section p, .exp-muted { font-size: 12px; color: var(--muted); line-height: 1.6; }
  .exp-section p { margin: 8px 0; }
  .experiments summary { cursor: pointer; font-size: 12px; color: var(--muted); line-height: 1.6; }
  .experiments summary:hover { color: var(--ink); }
  .exp-config { padding: 0 0 16px; }
  .exp-config[open] > summary { margin-bottom: 12px; }
  .exp-tag { flex: none; padding: 2px 6px; border-radius: 4px; color: var(--muted); background: var(--rail); font-size: 11px; font-weight: 400; }
  .exp-tag--attention { color: var(--amber); background: color-mix(in srgb, var(--amber) 9%, transparent); }
  .exp-tag--failed { color: var(--red); background: color-mix(in srgb, var(--red) 8%, transparent); }
  .experiments label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted); }
  .experiments :is(input,textarea,select) { box-sizing: border-box; width: 100%; font: inherit; }
  .experiments textarea { resize: vertical; line-height: 1.6; }
  .exp-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 14px 20px; }
  .exp-wide { grid-column: 1 / -1; }
  .exp-form { display: grid; grid-template-columns: minmax(260px,.85fr) minmax(320px,1.15fr); column-gap: 28px; align-items: start; }
  .exp-form > .exp-section:nth-child(1) { grid-column: 1; grid-row: 1; }
  .exp-form > .exp-section:nth-child(2) { grid-column: 2; grid-row: 1 / span 2; }
  .exp-form > .exp-section:nth-child(3) { grid-column: 1; grid-row: 2; }
  .exp-form > footer { grid-column: 1 / -1; }
  .exp-form .exp-grid { grid-template-columns: minmax(0,1fr); }
  .exp-form .exp-section:first-child { padding-top: 12px; }
  .exp-form .exp-section > h3 { margin-bottom: 14px; }
  .exp-sample { padding: 16px 0; border-bottom: 1px solid var(--line); }
  .exp-sample:last-child { border-bottom: 0; }
  .exp-sample-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .exp-sample-head strong { font-size: 12px; font-weight: 400; color: var(--muted); }
  .exp-arm { flex-direction: row !important; align-items: center; gap: 8px !important; padding: 8px 0; }
  .exp-arm input { flex: none; width: 14px; height: 14px; accent-color: var(--ink); }
  .exp-arm span { color: var(--text); }
  .exp-arm small { display: block; color: var(--muted); margin-top: 3px; }
  .exp-import { position: relative; display: inline-flex !important; }
  .exp-import input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .exp-import:focus-within { outline: var(--focus-stroke, 1px solid var(--ink)); outline-offset: var(--focus-stroke-inset, -1px); }
  .exp-table-wrap { overflow-x: auto; }
  .exp-table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
  .exp-table th, .exp-table td { padding: 10px 12px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); min-width: 100px; }
  .exp-table th { color: var(--muted); font-weight: 400; white-space: nowrap; }
  .exp-table th:first-child, .exp-table td:first-child { padding-left: 0; }
  .exp-table th:last-child, .exp-table td:last-child { padding-right: 0; }
  .exp-table tbody tr:last-child td { border-bottom: 0; }
  .exp-table small { display: block; color: var(--muted); font-size: 11px; line-height: 1.6; margin-top: 4px; overflow-wrap: anywhere; }
  .exp-comparison { table-layout: fixed; min-width: 470px; margin-top: 10px; }
  .exp-answer { display: block; font-size: 13px; font-weight: 500; line-height: 1.65; }
  .exp-runtime { margin-top: 8px; }
  .exp-material { margin: 10px 0; white-space: pre-wrap; overflow-wrap: anywhere; font-family: inherit; font-size: 12px; line-height: 1.75; max-height: 400px; overflow: auto; }
  pre.exp-material { padding: 12px; border-radius: 6px; background: var(--rail); color: var(--muted); }
  .exp-reference { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; }
  .exp-review-panel { padding-top: 8px; }
  .exp-review { display: grid; grid-template-columns: minmax(150px,.8fr) minmax(160px,1.4fr) auto; align-items: end; gap: 10px; margin: 12px 0; }
  .exp-form > footer { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
  .exp-model-dialog { width: min(640px, calc(100vw - 32px)); }
  .exp-model-dialog .exp-section:first-child { padding-top: 0; }
  .exp-model-config > summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--text); }
  .exp-model-config > summary > span:first-child { flex: 1; }
  .exp-model-dialog label + label { margin-top: 12px; }
  .exp-add-model[open] > .exp-grid { margin: 14px 0; }
  .exp-notice { position: absolute; bottom: 16px; right: 20px; z-index: 30; max-width: min(480px,calc(100% - 40px)); margin: 0; padding: 10px 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); color: var(--muted); font-size: 12px; line-height: 1.6; white-space: pre-wrap; box-shadow: 0 4px 16px color-mix(in srgb,var(--ink) 8%,transparent); }
  .experiments :is(button,summary):focus-visible { outline: var(--focus-stroke, 1px solid var(--ink)); outline-offset: var(--focus-stroke-inset, -1px); }
  @media (max-width: 900px) {
    .exp-form { display: block; }
    .exp-grid, .exp-review { grid-template-columns: minmax(0,1fr); }
    .exp-toolbar { flex-wrap: wrap; }
    .exp-toolbar h1 { min-width: 140px; }
    .exp-toolbar .exp-actions { margin-left: 24px; }
  }
  @media (max-width: 760px) {
    .exp-body, .exp-form { padding: 8px 16px 24px; }
    .exp-list-date { display: none; }
  }
  .exp-body { max-width: none; }
  .exp-sample-head label { flex: 1; }
  .exp-sample-head { gap: 10px; align-items: end; }
  .exp-sample-extra, .exp-advanced, .exp-bulk { margin-top: 14px; }
  .exp-sample-extra[open] .exp-grid, .exp-advanced[open] .exp-grid { margin-top: 12px; }
  .exp-bulk[open] > label { margin: 12px 0; }
  .exp-overview { display: grid; grid-template-columns: minmax(0,1.3fr) minmax(0,1fr); gap: 32px; padding: 16px 0 22px; }
  .exp-overview h3, .exp-results-heading h3, .exp-inspector h3 { font-size: 13px; font-weight: 500; margin: 0; }
  .exp-legend { display: flex; gap: 8px 16px; flex-wrap: wrap; margin: 12px 0 18px; font-size: 11px; color: var(--muted); }
  .exp-legend span { display: inline-flex; align-items: center; gap: 5px; }
  .exp-legend i { width: 7px; height: 7px; border-radius: 2px; }
  .exp-dist-row { display: grid; grid-template-columns: 100px minmax(60px,1fr) 64px; align-items: center; gap: 12px; margin: 14px 0; font-size: 12px; }
  .exp-dist-row small { color: var(--muted); font-size: 11px; }
  .exp-distribution { display: flex; height: 28px; gap: 3px; overflow: hidden; border-radius: 4px; }
  .exp-distribution button { border: 0; color: var(--ink); font: inherit; cursor: pointer; min-width: 20px; padding: 0; }
  .exp-distribution button:hover { filter: brightness(.94); }
  .exp-distribution > span { display: flex; align-items: center; justify-content: center; color: var(--muted); }
  .exp-no-answer { background: var(--rail); }
  .exp-cost-row { margin-top: 14px; font-size: 12px; }
  .exp-cost-row > div:first-child { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
  .exp-cost-row strong { font-weight: 400; font-variant-numeric: tabular-nums; }
  .exp-cost-row small { font-size: 11px; color: var(--muted); display: block; margin-top: 4px; }
  .exp-track { height: 5px; background: var(--rail); border-radius: 3px; overflow: hidden; }
  .exp-track i { height: 100%; background: var(--blue); display: block; }
  .exp-results-heading { display: flex; flex-wrap: wrap; gap: 12px; align-items: baseline; border-top: 1px solid var(--line); padding-top: 20px; }
  .exp-filters { display: flex; flex-wrap: wrap; gap: 4px; padding: 12px 0; }
  .exp-filters button[aria-pressed="true"] { background: var(--nav-active); color: var(--ink); }
  .exp-result-workspace { display: grid; grid-template-columns: minmax(420px,1.25fr) minmax(300px,1fr); gap: 24px; align-items: start; }
  .exp-matrix-wrap { overflow-x: auto; min-width: 0; }
  .exp-matrix { min-width: 420px; table-layout: fixed; }
  .exp-matrix th:first-child { width: 32%; }
  .exp-matrix th, .exp-matrix td { min-width: 0; padding: 10px 6px; white-space: normal; overflow-wrap: anywhere; }
  .exp-matrix th:first-child, .exp-matrix td:first-child { padding-left: 8px; }
  .exp-matrix tbody tr[data-active="true"] { background: var(--nav-active); }
  .exp-material-button { padding: 0; background: none; border: 0; color: var(--text); text-align: left; font: inherit; line-height: 1.6; cursor: pointer; }
  .exp-cell { width: 100%; text-align: left; padding: 8px; border: 0; border-radius: 4px; background: color-mix(in srgb,var(--exp-answer-color) 10%,transparent); color: var(--text); font: inherit; line-height: 1.5; cursor: pointer; }
  .exp-cell > span { display: block; }
  .exp-cell:hover { background: color-mix(in srgb,var(--exp-answer-color) 18%,transparent); }
  .exp-inspector { min-width: 0; padding-left: 24px; border-left: 1px solid var(--line); scroll-margin-top: 65px; }
  .exp-inspector-head { display: flex; align-items: start; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
  .exp-inspector-head h3 { flex: 1; min-width: 150px; line-height: 1.6; }
  .exp-inspector h4 { font-size: 12px; font-weight: 500; margin: 0; }
  .exp-reading { padding-bottom: 16px; border-bottom: 1px solid var(--line); }
  .exp-reading .exp-material { max-height: 260px; }
  .exp-judgment { padding: 16px 0; border-bottom: 1px solid var(--line); }
  .exp-judgment strong { font-size: 13px; font-weight: 500; }
  .exp-judgment p { font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
  .exp-probabilities { margin-top: 12px; }
  .exp-prob-row { display: grid; grid-template-columns: minmax(80px,1.3fr) minmax(40px,1fr) 54px; gap: 10px; align-items: center; margin-top: 8px; font-size: 11px; }
  .exp-prob-row > span:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .exp-inspector { display: flex; flex-direction: column; }
  .exp-reading { order: 1; }
  .exp-review-area { order: 2; padding: 20px 0; border-bottom: 1px solid var(--line); }
  .exp-judgments { order: 3; }
  .exp-review-area > p { font-size: 12px; line-height: 1.6; }
  .exp-review-area .exp-review { display: flex; flex-direction: column; align-items: stretch; }
  .exp-run-progress { width: 100%; height: 4px; accent-color: var(--blue); }
  @media (max-width: 1100px) {
    .exp-result-workspace { grid-template-columns: minmax(0,1fr); }
    .exp-inspector { padding: 20px 0 0; border-left: 0; border-top: 1px solid var(--line); }
    .exp-judgments { display: grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap: 20px; }
  }
  @media (max-width: 760px) {
    .exp-overview { grid-template-columns: minmax(0,1fr); gap: 16px; }
    .exp-dist-row { grid-template-columns: 84px minmax(40px,1fr) 58px; gap: 8px; }
    .exp-judgments { display: block; }
  }
`;
