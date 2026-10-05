/** Decision component CSS. Workbench retains cascade order and media-query placement. */
export const GOALS_DECISION_COMMON_STYLES = `  .decision-record { min-width: 0; margin: 0; padding: 0; border: 1px solid var(--line-strong); border-radius: 5px; overflow: hidden; background: var(--paper); }
  .decision-record-heading { min-height: 40px; padding: 8px 12px; border-bottom: 1px solid var(--line); background: var(--page); display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .decision-record-heading > small { min-width: 0; color: var(--muted); font-size: 11px; overflow-wrap: anywhere; text-align: right; }
  .decision-kind { display: inline-flex; align-items: center; gap: 8px; color: var(--ink-soft); font-size: 11px; font-weight: 400; letter-spacing: .04em; }
  .decision-new { margin-left: 4px; padding: 4px 8px; border-radius: 9px; color: var(--ink); background: var(--nav-hover); font-size: 11px; font-weight: 400; letter-spacing: 0; }
  .decision-kind--risk { color: var(--amber); }
  .decision-record-body { padding: 12px 16px; }
  .decision-record-body > h3 { margin: 0; font-size: 17px; line-height: 1.4; }
  .decision-record-body p { margin: 4px 0; color: var(--muted); }
  .decision-record-body small { color: var(--muted); overflow-wrap: anywhere; }
  .decision-guidance { margin-top: 12px; border: 1px solid var(--line); background: var(--page); display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .decision-guidance > section { min-width: 0; padding: 12px 12px; border-right: 1px solid var(--line); }
  .decision-guidance > section:last-child { border-right: 0; }
  .decision-guidance h4 { margin: 0 0 4px; color: var(--muted); font-size: 11px; }
  .decision-guidance p { margin: 0; overflow-wrap: anywhere; }
  .decision-recommendation strong { display: block; color: var(--muted); font-size: 13px; }
  .decision-recommendation.has-recommendation { background: var(--green-soft); }
  .decision-recommendation.has-recommendation strong { color: var(--green); }
  .decision-recommendation p { margin-top: 4px; font-size: 11px; }
  .decision-consequences dl { margin: 0; display: grid; gap: 8px; }
  .decision-consequences dl div { display: grid; grid-template-columns: minmax(72px, auto) minmax(0, 1fr); gap: 8px; }
  .decision-consequences dt { font-size: 11px; font-weight: var(--weight-control, 500); }
  .decision-consequences dd { margin: 0; color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
  .decision-scenario { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line-strong); }
  .decision-scenario h4 { margin: 0 0 8px; font-size: 12px; }
  .decision-scenario dl { margin: 0; display: grid; gap: 8px; }
  .decision-scenario dl > div { min-width: 0; display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 8px; align-items: start; }
  .decision-scenario dt { color: var(--muted); font-size: 11px; font-weight: var(--weight-control, 500); }
  .decision-scenario dd { margin: 0; color: var(--ink); overflow-wrap: anywhere; }
  .decision-record-tech { min-width: 0; color: var(--muted); font-size: 11px; text-align: right; }
  .decision-record-tech summary { cursor: pointer; }
  .decision-record-tech small { display: block; margin-top: 4px; overflow-wrap: anywhere; }
  .decision-details { border-top: 1px solid var(--line); }
  .decision-details > summary { min-height: 40px; padding: 8px 16px; color: var(--ink); background: var(--page); display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; font-weight: 400; cursor: pointer; }
  .decision-details > summary svg { transition: transform 130ms var(--ease-quint); }
  .decision-details[open] > summary svg { transform: rotate(180deg); }`;

export const GOALS_PROPOSAL_STYLES = `  .goal-tree-proposal-summary { margin-top: 12px; padding: 12px 12px; border-left: 2px solid var(--blue); background: var(--nav-hover); display: grid; gap: 4px; }
  .goal-tree-proposal-summary > small { color: var(--ink-soft); font-size: 11px; font-weight: 400; }
  .goal-tree-proposal-summary > strong { font-size: 15px; }
  .goal-tree-proposal-summary > p { margin: 4px 0 0; color: var(--ink); overflow-wrap: anywhere; }
  .goal-tree-proposal-narrative { margin-top: 12px; padding: 12px; border: 1px solid var(--line); background: var(--surface); }
  .goal-tree-proposal-narrative.is-missing { border-color: var(--amber); background: var(--amber-soft); }
  .goal-tree-proposal-narrative > h4 { margin: 0 0 8px; font-size: 13px; }
  .goal-tree-proposal-narrative > p { margin: 0; color: var(--ink); }
  .goal-tree-proposal-narrative dl, .goal-tree-proposal-item-explanation { margin: 0; display: grid; gap: 8px; }
  .goal-tree-proposal-narrative dl > div, .goal-tree-proposal-item-explanation > div { display: grid; grid-template-columns: minmax(88px, .3fr) minmax(0, 1fr); gap: 8px; }
  .goal-tree-proposal-narrative dt, .goal-tree-proposal-item-explanation dt { color: var(--muted); font-size: 11px; font-weight: var(--weight-control, 500); }
  .goal-tree-proposal-narrative dd, .goal-tree-proposal-item-explanation dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
  .goal-tree-proposal-narrative ol, .goal-tree-proposal-narrative ul { margin: 0; padding-left: 16px; }
  .goal-tree-proposal-readiness { margin-top: 12px; padding: 12px 12px; border: 1px solid color-mix(in srgb, var(--red) 32%, var(--line)); background: var(--red-soft); display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 8px; }
  .goal-tree-proposal-readiness > div:first-child { color: var(--red); }
  .goal-tree-proposal-readiness h4 { margin: 0 0 4px; color: var(--red); font-size: 13px; }
  .goal-tree-proposal-readiness p { margin: 0 0 4px; color: var(--ink); }
  .goal-tree-proposal-readiness strong { font-size: 12px; }
  .goal-tree-proposal-changes { padding: 0; }
  .goal-tree-proposal-changes > summary > span { min-width: 0; display: grid; gap: 1px; }
  .goal-tree-proposal-changes > summary small { color: var(--muted); font-size: 11px; font-weight: 400; }
  .goal-tree-proposal-details h4 { margin: 0 0 8px; font-size: 12px; }
  .goal-tree-proposal-changes > ol { list-style: none; margin: 0; padding: 0 16px; border-top: 1px solid var(--line); }
  .goal-tree-proposal-changes > .goal-tree-proposal-conflict { margin: 12px 16px 12px; }
  .goal-tree-proposal-item { min-width: 0; padding: 8px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 8px; }
  .goal-tree-proposal-item > span { color: var(--green); }
  .goal-tree-proposal-item.is-conflict > span, .goal-tree-proposal-item.is-invalid > span { color: var(--red); }
  .goal-tree-proposal-item > div { min-width: 0; display: grid; gap: 1px; }
  .goal-tree-proposal-item strong, .goal-tree-proposal-item small { overflow-wrap: anywhere; }
  .goal-tree-proposal-item small { color: var(--muted); }
  .goal-tree-proposal-item-explanation { margin-top: 8px; padding: 8px 8px; border-left: 2px solid var(--blue); background: var(--nav-hover); font-size: 11px; }
  .goal-tree-proposal-item-facts { margin: 8px 0 0; padding-left: 16px; color: var(--ink); font-size: 11px; }
  .goal-tree-proposal-item-facts li { margin: 4px 0; overflow-wrap: anywhere; }
  .goal-tree-proposal-item-error { margin-top: 8px; padding: 8px 8px; border: 1px solid color-mix(in srgb, var(--red) 32%, var(--line)); background: var(--red-soft); }
  .goal-tree-proposal-item-error > strong { color: var(--red); font-size: 11px; }
  .goal-tree-proposal-item-error > p { margin: 4px 0 0; color: var(--ink); font-size: 11px; }
  .goal-tree-proposal-conflict { margin: 12px 0 0; padding: 8px 12px; color: var(--red); background: var(--red-soft); }
  .goal-tree-proposal-details { padding: 0 16px 12px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 24px; }
  .goal-tree-proposal-details > section { min-width: 0; padding-top: 12px; }
  .goal-tree-proposal-details .doc-list { margin: 0; }
  .goal-tree-proposal-acceptance { grid-column: 1 / -1; }
  .goal-tree-proposal-acceptance > ol { margin: 0; padding-left: 16px; }
  .goal-tree-proposal-acceptance li { margin: 4px 0; padding-left: 4px; }
  .goal-tree-proposal-acceptance li small { display: block; color: var(--muted); }`;

export const GOALS_PROPOSAL_MOBILE_STYLES = `    .goal-tree-proposal-details { grid-template-columns: 1fr; }
    .goal-tree-proposal-acceptance { grid-column: 1; }`;

