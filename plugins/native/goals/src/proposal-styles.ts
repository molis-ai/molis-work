/** Existing decision component CSS. Workbench retains cascade order and media-query placement. */
export const GOALS_DEPENDENCY_PROPOSAL_STYLES = `  .dependency-history { margin-top: 14px; }
  .dependency-history > h3 { margin: 0; font-size: 13px; }
  .dependency-history > h3 span { color: var(--muted); font-weight: 400; }
  .dependency-history > p { margin: 2px 0 8px; color: var(--muted); font-size: 12px; }
  .dependency-proposal-list { width: 100%; min-width: 0; margin-top: 8px; border: 1px solid var(--line); border-radius: 5px; overflow: hidden; }
  .dependency-proposal { min-width: 0; padding: 11px 13px; border-bottom: 1px solid var(--line); background: var(--paper); color: var(--ink); }
  .dependency-proposal:last-child { border-bottom: 0; }
  .dependency-proposal > header { display: flex; align-items: center; gap: 8px; }
  .dependency-action, .dependency-state { font-size: 11px; font-weight: 400; }
  .dependency-action { color: var(--blue-dark); }
  .dependency-action--deactivate { color: var(--red); }
  .dependency-state { margin-left: auto; color: var(--muted); }
  .dependency-state--pending { color: var(--amber); }
  .dependency-state--applied { color: var(--green); }
  .dependency-state--rejected { color: var(--red); }
  .dependency-direction { margin: 8px 0 9px; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 10px; }
  .dependency-direction > span { display: grid; justify-items: center; color: var(--muted); font-size: 11px; }
  .dependency-direction > span svg { font-size: 15px; }
  .dependency-goal { min-width: 0; padding: 0; border: 0; background: transparent; display: grid; text-align: left; color: var(--ink); cursor: pointer; }
  .dependency-goal:hover strong { color: var(--blue-dark); text-decoration: underline; }
  .dependency-goal strong, .dependency-goal small { white-space: normal; overflow-wrap: anywhere; }
  .dependency-goal small { color: var(--muted); font-size: 10px; }
  .dependency-rationale { margin: 0; display: grid; grid-template-columns: 1fr 1fr; column-gap: 20px; }
  .dependency-rationale div { min-width: 0; padding: 7px 0; border-top: 1px solid var(--line); }
  .dependency-rationale dt { color: var(--muted); font-size: 11px; }
  .dependency-rationale dd { margin: 1px 0 0; overflow-wrap: anywhere; }
  .dependency-evidence { min-width: 0; padding-top: 7px; border-top: 1px solid var(--line); display: grid; grid-template-columns: 64px minmax(0, 1fr); align-items: start; gap: 6px 12px; }
  .dependency-evidence > strong { color: var(--muted); font-size: 11px; }
  .dependency-evidence .inline-ref, .dependency-evidence > .empty-row { min-width: 0; width: 100%; max-width: 100%; grid-column: 2; margin: 0; align-items: flex-start; text-align: left; }
  .dependency-evidence .inline-ref span { min-width: 0; overflow: visible; text-overflow: clip; white-space: normal; overflow-wrap: anywhere; }`;

export const GOALS_DECISION_COMMON_STYLES = `  .decision-record { min-width: 0; margin: 0; padding: 0; border: 1px solid var(--line-strong); border-radius: 5px; overflow: hidden; background: var(--paper); }
  .decision-record-heading { min-height: 40px; padding: 8px 13px; border-bottom: 1px solid var(--line); background: var(--page); display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .decision-record-heading > small { min-width: 0; color: var(--muted); font-size: 10px; overflow-wrap: anywhere; text-align: right; }
  .decision-kind { display: inline-flex; align-items: center; gap: 6px; color: var(--ink-soft); font-size: 11px; font-weight: 400; letter-spacing: .04em; }
  .decision-new { margin-left: 2px; padding: 2px 6px; border-radius: 9px; color: var(--ink); background: var(--nav-hover); font-size: 10px; font-weight: 400; letter-spacing: 0; }
  .decision-kind--rewire { color: var(--hue-purple); }
  .decision-kind--risk { color: var(--amber); }
  .decision-record-body { padding: 12px 14px; }
  .decision-record-body > h3 { margin: 0; font-size: 17px; line-height: 1.4; }
  .decision-record-body p { margin: 3px 0; color: var(--muted); }
  .decision-record-body small { color: var(--muted); overflow-wrap: anywhere; }
  .decision-guidance { margin-top: 13px; border: 1px solid var(--line); background: var(--page); display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .decision-guidance > section { min-width: 0; padding: 11px 12px; border-right: 1px solid var(--line); }
  .decision-guidance > section:last-child { border-right: 0; }
  .decision-guidance h4 { margin: 0 0 4px; color: var(--muted); font-size: 11px; }
  .decision-guidance p { margin: 0; overflow-wrap: anywhere; }
  .decision-recommendation strong { display: block; color: var(--muted); font-size: 13px; }
  .decision-recommendation.has-recommendation { background: var(--green-soft); }
  .decision-recommendation.has-recommendation strong { color: var(--green); }
  .decision-recommendation p { margin-top: 3px; font-size: 11px; }
  .decision-consequences dl { margin: 0; display: grid; gap: 6px; }
  .decision-consequences dl div { display: grid; grid-template-columns: minmax(72px, auto) minmax(0, 1fr); gap: 8px; }
  .decision-consequences dt { font-size: 11px; font-weight: 400; }
  .decision-consequences dd { margin: 0; color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
  .decision-scenario { margin-top: 13px; padding-top: 11px; border-top: 1px solid var(--line-strong); }
  .decision-scenario h4 { margin: 0 0 7px; font-size: 12px; }
  .decision-scenario dl { margin: 0; display: grid; gap: 7px; }
  .decision-scenario dl > div { min-width: 0; display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 9px; align-items: start; }
  .decision-scenario dt { color: var(--muted); font-size: 11px; font-weight: 400; }
  .decision-scenario dd { margin: 0; color: var(--ink); overflow-wrap: anywhere; }
  .decision-record-tech { min-width: 0; color: var(--muted); font-size: 10px; text-align: right; }
  .decision-record-tech summary { cursor: pointer; }
  .decision-record-tech small { display: block; margin-top: 3px; overflow-wrap: anywhere; }
  .decision-details { border-top: 1px solid var(--line); }
  .decision-details > summary { min-height: 40px; padding: 9px 14px; color: var(--ink); background: var(--page); display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; font-weight: 400; cursor: pointer; }
  .decision-details > summary svg { transition: transform .16s ease; }
  .decision-details[open] > summary svg { transform: rotate(180deg); }
  .decision-key-fact { margin-top: 10px !important; padding: 9px 10px; border-left: 2px solid var(--blue); background: var(--nav-hover); color: var(--ink) !important; }`;

export const GOALS_LEGACY_CONTRACT_STYLES = `  .rewire-decision .dependency-proposal-list { margin-top: 9px; }
  .contract-proposal > header { padding: 13px 15px; display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; background: var(--nav-hover); border-bottom: 1px solid var(--line); }
  .contract-proposal > header strong { font-size: 14px; }
  .contract-proposal > header p { color: var(--muted); }
  .contract-proposal > header > span { color: var(--muted); font-size: 11px; white-space: nowrap; }
  .contract-diff-list { padding: 0 15px; }
  .contract-diff-row { display: grid; grid-template-columns: 130px minmax(0, 1fr) minmax(210px, .72fr); gap: 15px; padding: 13px 0; border-bottom: 1px solid var(--line); align-items: start; }
  .contract-diff-row h4 { margin: 1px 0 0; font-size: 13px; }
  .contract-diff-copy { min-width: 0; }
  .contract-diff-copy small, .proposal-source > span { color: var(--muted); font-size: 11px; }
  .contract-diff-copy p { margin: 0 0 7px; color: var(--ink); overflow-wrap: anywhere; }
  .contract-diff-copy p:last-child { margin-bottom: 0; }
  .proposal-source { min-width: 0; display: grid; gap: 3px; padding-left: 12px; border-left: 1px solid var(--line); color: var(--muted); }
  .proposal-source > span { color: var(--ink); font-weight: 400; }
  .proposal-source > small { overflow-wrap: anywhere; }
  .proposal-refs { min-width: 0; display: flex; flex-wrap: wrap; gap: 3px 10px; }
  .proposal-refs .inline-ref { font-size: 11px; }
  .proposal-appendix { margin: 0 15px; padding: 11px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 15px; }
  .proposal-appendix > strong { font-size: 13px; }
  .proposal-appendix .doc-list { margin: 0; }
  .proposal-prerequisite > div { min-width: 0; }
  .proposal-prerequisite p { margin: 5px 0 0; color: var(--muted); font-size: 12px; }`;

export const GOALS_PROPOSAL_STYLES = `  .goal-tree-proposal-summary { margin-top: 11px; padding: 11px 12px; border-left: 2px solid var(--blue); background: var(--nav-hover); display: grid; gap: 2px; }
  .goal-tree-proposal-summary > small { color: var(--ink-soft); font-size: 10px; font-weight: 400; }
  .goal-tree-proposal-summary > strong { font-size: 15px; }
  .goal-tree-proposal-summary > p { margin: 2px 0 0; color: var(--ink); overflow-wrap: anywhere; }
  .goal-tree-proposal-narrative { margin-top: 10px; padding: 12px; border: 1px solid var(--line); background: var(--surface); }
  .goal-tree-proposal-narrative.is-missing { border-color: var(--amber); background: var(--amber-soft); }
  .goal-tree-proposal-narrative > h4 { margin: 0 0 8px; font-size: 13px; }
  .goal-tree-proposal-narrative > p { margin: 0; color: var(--ink); }
  .goal-tree-proposal-narrative dl, .goal-tree-proposal-item-explanation { margin: 0; display: grid; gap: 7px; }
  .goal-tree-proposal-narrative dl > div, .goal-tree-proposal-item-explanation > div { display: grid; grid-template-columns: minmax(88px, .3fr) minmax(0, 1fr); gap: 8px; }
  .goal-tree-proposal-narrative dt, .goal-tree-proposal-item-explanation dt { color: var(--muted); font-size: 10px; font-weight: 400; }
  .goal-tree-proposal-narrative dd, .goal-tree-proposal-item-explanation dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
  .goal-tree-proposal-narrative ol, .goal-tree-proposal-narrative ul { margin: 0; padding-left: 18px; }
  .goal-tree-proposal-readiness { margin-top: 11px; padding: 11px 12px; border: 1px solid color-mix(in srgb, var(--red) 32%, var(--line)); background: var(--red-soft); display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 8px; }
  .goal-tree-proposal-readiness > div:first-child { color: var(--red); }
  .goal-tree-proposal-readiness h4 { margin: 0 0 3px; color: var(--red); font-size: 13px; }
  .goal-tree-proposal-readiness p { margin: 0 0 5px; color: var(--ink); }
  .goal-tree-proposal-readiness strong { font-size: 12px; }
  .goal-tree-proposal-changes { padding: 0; }
  .goal-tree-proposal-changes > summary > span { min-width: 0; display: grid; gap: 1px; }
  .goal-tree-proposal-changes > summary small { color: var(--muted); font-size: 10px; font-weight: 400; }
  .goal-tree-proposal-details h4 { margin: 0 0 7px; font-size: 12px; }
  .goal-tree-proposal-changes > ol { list-style: none; margin: 0; padding: 0 14px; border-top: 1px solid var(--line); }
  .goal-tree-proposal-changes > .goal-tree-proposal-conflict { margin: 10px 14px 12px; }
  .goal-tree-proposal-item { min-width: 0; padding: 9px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 7px; }
  .goal-tree-proposal-item > span { color: var(--green); }
  .goal-tree-proposal-item.is-conflict > span, .goal-tree-proposal-item.is-invalid > span { color: var(--red); }
  .goal-tree-proposal-item > div { min-width: 0; display: grid; gap: 1px; }
  .goal-tree-proposal-item strong, .goal-tree-proposal-item small { overflow-wrap: anywhere; }
  .goal-tree-proposal-item small { color: var(--muted); }
  .goal-tree-proposal-item-explanation { margin-top: 7px; padding: 8px 9px; border-left: 2px solid var(--blue); background: var(--nav-hover); font-size: 11px; }
  .goal-tree-proposal-item-facts { margin: 6px 0 0; padding-left: 18px; color: var(--ink); font-size: 11px; }
  .goal-tree-proposal-item-facts li { margin: 3px 0; overflow-wrap: anywhere; }
  .goal-tree-proposal-item-error { margin-top: 7px; padding: 8px 9px; border: 1px solid color-mix(in srgb, var(--red) 32%, var(--line)); background: var(--red-soft); }
  .goal-tree-proposal-item-error > strong { color: var(--red); font-size: 11px; }
  .goal-tree-proposal-item-error > p { margin: 3px 0 0; color: var(--ink); font-size: 11px; }
  .goal-tree-risk-repair { margin-top: 10px; padding-top: 11px; border-top: 1px solid var(--line); }
  .goal-tree-risk-repair > h4 { margin: 0; color: var(--ink); font-size: 13px; }
  .goal-tree-risk-repair > p { margin: 3px 0 9px; color: var(--muted); font-size: 11px; }
  .goal-tree-risk-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border: 1px solid var(--line); border-radius: 5px; overflow: hidden; background: var(--paper); }
  .goal-tree-risk-options label { min-width: 0; padding: 9px 10px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 8px; cursor: pointer; }
  .goal-tree-risk-options label:nth-child(2n) { border-right: 0; }
  .goal-tree-risk-options label:nth-last-child(-n+2) { border-bottom: 0; }
  .goal-tree-risk-options label:has(input:checked) { color: var(--ink); background: var(--nav-active); }
  .goal-tree-risk-options input { margin-top: 3px; accent-color: var(--blue); }
  .goal-tree-risk-options span { min-width: 0; display: grid; }
  .goal-tree-risk-options strong { font-size: 12px; }
  .goal-tree-risk-options small { font-size: 10px; line-height: 1.45; }
  .goal-tree-risk-plan-editor { margin-top: 8px; border-top: 1px solid var(--line); }
  .goal-tree-risk-plan-editor > summary { min-height: 38px; color: var(--ink); display: flex; align-items: center; justify-content: space-between; gap: 12px; cursor: pointer; }
  .goal-tree-risk-plan-editor > summary > span { min-width: 0; display: flex; align-items: baseline; flex-wrap: wrap; gap: 3px 8px; font-size: 11px; font-weight: 400; }
  .goal-tree-risk-plan-editor > summary small { color: var(--muted); font-size: 10px; font-weight: 400; }
  .goal-tree-risk-plan-editor > summary svg { flex: 0 0 auto; transition: transform .16s ease; }
  .goal-tree-risk-plan-editor[open] > summary svg { transform: rotate(180deg); }
  .goal-tree-risk-plan { padding: 2px 0 7px; display: grid; gap: 5px; }
  .goal-tree-risk-plan > span { color: var(--ink); font-size: 12px; font-weight: 400; }
  .goal-tree-risk-plan > span small { margin-left: 4px; font-weight: 400; }
  .goal-tree-risk-plan textarea { width: 100%; min-width: 0; padding: 8px 9px; border: 1px solid var(--line-strong); border-radius: 4px; background: var(--paper); resize: vertical; }
  .goal-tree-risk-repair > .form-error { margin: 7px 0 0; }
  .goal-tree-proposal-conflict { margin: 10px 0 0; padding: 9px 10px; color: var(--red); background: var(--red-soft); }
  .goal-tree-proposal-details { padding: 0 14px 12px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 22px; }
  .goal-tree-proposal-details > section { min-width: 0; padding-top: 11px; }
  .goal-tree-proposal-details .doc-list { margin: 0; }
  .goal-tree-proposal-acceptance { grid-column: 1 / -1; }
  .goal-tree-proposal-acceptance > ol { margin: 0; padding-left: 19px; }
  .goal-tree-proposal-acceptance li { margin: 5px 0; padding-left: 3px; }
  .goal-tree-proposal-acceptance li small { display: block; color: var(--muted); }`;

export const GOALS_CANDIDATE_STYLES = `  .candidate-title { padding: 14px 15px; border-bottom: 1px solid var(--line); display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
  .decision-record-body .candidate-title { margin: 11px 0 0; padding: 11px 0; border-top: 1px solid var(--line); }
  .candidate-title > div { min-width: 0; }
  .candidate-title small { color: var(--muted); font-size: 10px; font-weight: 400; letter-spacing: .06em; text-transform: uppercase; }
  .candidate-title h3 { margin: 2px 0 3px; font-size: 17px; line-height: 1.35; letter-spacing: -.015em; }
  .candidate-title p { margin: 0; color: var(--muted); }
  .candidate-title > span { flex: 0 0 auto; padding: 2px 7px; border-radius: 3px; color: var(--amber); background: var(--amber-soft); font-size: 10px; font-weight: 400; }
  .candidate-contract { margin: 0; padding: 0 15px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 24px; }
  .candidate-contract > div { min-width: 0; padding: 11px 0; border-bottom: 1px solid var(--line); }
  .candidate-contract dt { margin-bottom: 2px; color: var(--muted); font-size: 11px; font-weight: 400; }
  .candidate-contract dd { margin: 0; overflow-wrap: anywhere; }
  .candidate-contract .doc-list, .candidate-contract .empty-row { margin: 0; }
  .candidate-wide { grid-column: 1 / -1; }
  .candidate-acceptance { margin: 2px 0 0; padding-left: 19px; }
  .candidate-acceptance li { margin: 4px 0; padding-left: 3px; }
  .candidate-acceptance li small { display: block; color: var(--muted); }`;

export const GOALS_PROPOSAL_MOBILE_STYLES = `    .candidate-title { display: grid; }
    .candidate-title > span { justify-self: start; }
    .candidate-contract { grid-template-columns: 1fr; }
    .goal-tree-proposal-details { grid-template-columns: 1fr; }
    .goal-tree-risk-options { grid-template-columns: 1fr; }
    .goal-tree-risk-options label { border-right: 0; }
    .goal-tree-risk-options label:nth-last-child(-n+2) { border-bottom: 1px solid var(--line); }
    .goal-tree-risk-options label:last-child { border-bottom: 0; }
    .goal-tree-risk-plan textarea { font-size: 16px; }
    .candidate-wide { grid-column: 1; }
    .goal-tree-proposal-acceptance { grid-column: 1; }`;

export const GOALS_LEGACY_PROPOSAL_MOBILE_STYLES = `    .contract-proposal > header { display: grid; }
    .contract-diff-row, .proposal-appendix { grid-template-columns: 1fr; gap: 6px; }
    .proposal-source { padding: 7px 0 0; border-left: 0; border-top: 1px dashed var(--line); }
    .dependency-direction, .dependency-rationale { grid-template-columns: 1fr; }
    .dependency-direction > span { grid-auto-flow: column; justify-content: start; gap: 5px; }
    .dependency-direction > span svg { transform: rotate(90deg); }
    .dependency-evidence { grid-template-columns: 1fr; }
    .dependency-evidence .inline-ref, .dependency-evidence > .empty-row { grid-column: 1; }`;
