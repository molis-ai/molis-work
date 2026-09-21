import { GOALS_DEPENDENCY_PROPOSAL_STYLES, GOALS_DECISION_COMMON_STYLES, GOALS_LEGACY_CONTRACT_STYLES, GOALS_PROPOSAL_STYLES, GOALS_CANDIDATE_STYLES, GOALS_EVENT_DOCUMENT_STYLES } from "@molis-ai/molis-work-plugin-goals";
export const MORE_STYLES = `
  .runtime-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--line-strong); border-radius: 5px; overflow: hidden; }
  .runtime-grid > section { min-width: 0; min-height: 174px; padding: 13px 15px; border-right: 1px solid var(--line-strong); }
  .runtime-grid > section:last-child { border-right: 0; }
  .runtime-grid h3 { margin: -13px -15px 12px; padding: 10px 15px; border-bottom: 1px solid var(--line); background: var(--rail); color: var(--ink); font-size: 14px; }
  .runtime-grid h3 span { color: var(--muted); font-weight: 400; }
  .runtime-facts, .policy-list { margin: 0; }
  .runtime-facts div, .policy-list div { display: grid; grid-template-columns: 66px minmax(0, 1fr); gap: 8px; margin: 5px 0; }
  .runtime-facts dt, .policy-list dt { color: var(--muted); }
  .runtime-facts dd, .policy-list dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
  .runtime-note { margin: 9px 0 0; color: var(--muted); font-size: 12px; }
  .ref-stack, .evidence-list, .review-list { display: grid; gap: 7px; margin-top: 9px; }
  .inline-ref { width: fit-content; max-width: 100%; padding: 0; border: 0; background: transparent; color: var(--blue-dark); display: inline-flex; align-items: center; gap: 5px; cursor: pointer; text-decoration: none; }
  .inline-ref:hover span { text-decoration: underline; }
  .inline-ref svg { flex: 0 0 auto; font-size: 13px; }
  .inline-ref span { min-width: 0; white-space: normal; overflow-wrap: anywhere; }
  .evidence-record, .review-row { display: flex; align-items: flex-start; gap: 8px; }
  .evidence-record > div, .review-row > span:last-child { min-width: 0; display: grid; gap: 3px; }
  .evidence-record header { min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 5px 8px; }
  .evidence-record small, .review-row small { color: var(--muted); overflow-wrap: anywhere; }
  .evidence-record p { margin: 1px 0 0; color: var(--ink-soft); font-size: 12px; overflow-wrap: anywhere; }
  .evidence-record--superseded, .evidence-record--retracted { opacity: .72; }
  .evidence-lifecycle { padding: 2px 6px; border-radius: 999px; background: var(--rail); color: var(--muted); font-size: 10px; font-weight: 400; }
  .evidence-lifecycle--effective { background: var(--green-soft); color: var(--green); }
  .evidence-locator-status { padding: 2px 6px; border-radius: 999px; color: var(--amber); background: var(--amber-soft); font-size: 10px; font-weight: 400; }
  .evidence-locator-status--verified { color: var(--green); background: var(--green-soft); }
  .evidence-locator-reason { color: var(--muted); }
  .evidence-correction { padding-top: 3px; border-top: 1px dashed var(--line); }
  .record-id { min-width: 0; padding: 0; border: 0; background: transparent; color: var(--blue-dark); font: inherit; font-size: 10px; cursor: pointer; overflow-wrap: anywhere; text-align: left; }
  .record-id:hover { text-decoration: underline; }
  .evidence-submit { margin-top: 13px; border-top: 1px solid var(--line-strong); border-bottom: 1px solid var(--line); }
  .evidence-submit > summary { min-height: 54px; padding: 9px 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; list-style: none; cursor: pointer; }
  .evidence-submit > summary::-webkit-details-marker { display: none; }
  .evidence-submit > summary > span { min-width: 0; display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: center; gap: 0 8px; }
  .evidence-submit > summary > span > svg { grid-row: span 2; color: var(--ink-soft); }
  .evidence-submit > summary strong { font-size: 13px; }
  .evidence-submit > summary small, .evidence-submit-note { color: var(--muted); font-size: 11px; }
  .evidence-submit > summary > svg { color: var(--muted); transition: transform .16s ease; }
  .evidence-submit[open] > summary > svg { transform: rotate(180deg); }
  .evidence-submit form { padding: 12px 0 15px; border-top: 1px solid var(--line); display: grid; gap: 12px; }
  .evidence-submit label { min-width: 0; display: grid; gap: 5px; }
  .evidence-submit label > span, .evidence-submit legend { font-weight: 400; }
  .evidence-submit label small { color: var(--muted); font-weight: 400; }
  .evidence-submit textarea, .evidence-submit select { width: 100%; min-width: 0; padding: 8px 9px; border: 1px solid var(--line-strong); border-radius: 4px; background: var(--paper); resize: vertical; }
  .evidence-criteria { min-width: 0; margin: 0; padding: 0; border: 0; }
  .evidence-criteria > div { max-height: 154px; overflow: auto; border: 1px solid var(--line); border-radius: 5px; }
  .evidence-criteria label { min-width: 0; padding: 8px 10px; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 8px; border-bottom: 1px solid var(--line); cursor: pointer; }
  .evidence-criteria label:last-child { border-bottom: 0; }
  .evidence-criteria input { margin-top: 3px; }
  .evidence-criteria label span { min-width: 0; display: grid; gap: 1px; }
  .evidence-criteria label small { color: var(--muted); font-size: 10px; overflow-wrap: anywhere; }
  .evidence-form-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
  .evidence-submit footer { padding-top: 11px; border-top: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .evidence-submit footer > span { color: var(--muted); font-size: 11px; }
  .evidence-submit-note { margin: 12px 0 0; }
  .human-review-list { margin-top: 12px; border-top: 1px solid var(--line-strong); border-bottom: 1px solid var(--line-strong); }
  .human-review-list > header { padding: 11px 0; display: flex; align-items: baseline; gap: 12px; }
  .human-review-list > header p { margin: 0; color: var(--muted); font-size: 12px; }
  .human-review-form { padding: 14px 0; border-top: 1px solid var(--line); display: grid; gap: 12px; }
  .human-verdict-prefill { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 10px; padding: 12px; border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--line)); border-radius: 8px; background: color-mix(in srgb, var(--accent) 7%, var(--surface)); }
  .human-verdict-prefill > span { color: var(--accent); }
  .human-verdict-prefill strong { display: block; margin-bottom: 3px; }
  .human-verdict-prefill p { margin: 0; color: var(--muted); }
  .human-verdict-prefill dl { margin: 9px 0 0; display: grid; gap: 6px; }
  .human-verdict-prefill dl div { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 8px; }
  .human-verdict-prefill dt { color: var(--muted); }
  .human-verdict-prefill dd { margin: 0; overflow-wrap: anywhere; }
  .human-review-form > label, .human-review-form fieldset { min-width: 0; margin: 0; padding: 0; border: 0; display: grid; grid-template-columns: 170px minmax(0, 1fr); align-items: start; gap: 14px; }
  .human-review-form > label > span, .human-review-form legend { padding-top: 7px; font-weight: 400; }
  .human-review-form input:not([type=checkbox]), .human-review-form textarea, .human-review-form select { width: 100%; min-width: 0; padding: 7px 9px; border: 1px solid var(--line-strong); border-radius: 4px; background: var(--paper); }
  .evidence-choice-list { min-width: 0; display: grid; gap: 5px; }
  .evidence-choice { min-width: 0; padding: 7px 0; display: flex; align-items: flex-start; gap: 9px; border-bottom: 1px solid var(--line); }
  .evidence-choice:last-child { border-bottom: 0; }
  .evidence-choice input { margin-top: 4px; }
  .evidence-choice span { min-width: 0; display: grid; }
  .evidence-choice small { color: var(--muted); overflow-wrap: anywhere; }
  .human-review-form footer { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .human-review-form footer small { min-width: 0; color: var(--muted); overflow-wrap: anywhere; }
  .evidence-result { margin-top: 2px; }
  .evidence-result--passed { color: var(--green); }
  .evidence-result--failed { color: var(--red); }
  .evidence-result--inconclusive { color: var(--amber); }
  .review-state { flex: 0 0 8px; width: 8px; height: 8px; margin-top: 7px; border-radius: 50%; background: var(--amber); }
  .review-state--satisfied { background: var(--green); }
  .review-state--waived { background: var(--faint); }
  .relation-layout { display: grid; grid-template-columns: 1fr; border: 1px solid var(--line); border-radius: 5px; overflow: hidden; }
  .relation-group { min-width: 0; border-bottom: 1px solid var(--line); }
  .relation-group:last-child { border-bottom: 0; }
  .relation-group > header { padding: 9px 12px; border-bottom: 1px solid var(--line); background: var(--page); display: flex; align-items: baseline; gap: 9px; }
  .relation-group h3 { margin: 0; font-size: 13px; }
  .relation-group h3 span { color: var(--muted); font-weight: 400; }
  .relation-group p { margin: 1px 0 0; color: var(--muted); font-size: 11px; }
  .relation-group > div { padding: 5px 7px; }
  .relation-record { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; border-bottom: 1px solid var(--line); }
  .relation-record:last-child { border-bottom: 0; }
  .relation-row { width: 100%; min-width: 0; padding: 8px 5px; border: 0; background: transparent; display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 7px; text-align: left; cursor: pointer; }
  .relation-row:hover { background: var(--nav-hover); }
  .relation-kind { padding: 1px 5px; border-radius: 3px; background: var(--rail); color: var(--muted); font-size: 10px; white-space: nowrap; }
  .relation-copy { min-width: 0; display: grid; gap: 1px; }
  .relation-copy strong, .relation-copy small { white-space: normal; overflow-wrap: anywhere; }
  .relation-copy small { color: var(--muted); font-size: 10px; }
  .relation-copy .relation-goal-id { color: var(--faint); }
  .relation-copy .relation-path { color: var(--ink-soft); }
  .relation-copy .relation-reason { line-height: 1.4; }
  .relation-state { font-size: 10px; color: var(--muted); }
  .relation-state--active { color: var(--green); }
  .relation-state--proposed { color: var(--amber); }
  .relation-state--inactive { color: var(--muted); }
  .relation-row > svg { color: var(--faint); }
  .relation-deactivate-open { align-self: center; margin-right: 5px; padding: 4px 6px; border: 1px solid transparent; color: var(--muted); background: transparent; font-size: 11px; }
  .relation-deactivate-open:hover { border-color: color-mix(in srgb, var(--red) 35%, var(--line)); color: var(--red); background: var(--red-soft); }
  .relation-deactivate-form { grid-column: 1 / -1; margin: 0 5px 7px; padding: 10px; border: 1px solid color-mix(in srgb, var(--red) 35%, var(--line)); border-radius: 5px; background: var(--red-soft); display: grid; gap: 8px; }
  .relation-deactivate-form[hidden] { display: none; }
  .relation-deactivate-form label { display: grid; gap: 4px; }
  .relation-deactivate-form label > span { color: var(--red); font-size: 11px; font-weight: 400; }
  .relation-deactivate-form textarea { width: 100%; min-height: 56px; padding: 7px 8px; border: 1px solid color-mix(in srgb, var(--red) 28%, var(--line)); border-radius: 4px; background: var(--paper); color: var(--ink); resize: vertical; }
  .relation-deactivate-form footer { display: flex; justify-content: flex-end; gap: 7px; }
  .relation-deactivate-form footer button { padding: 6px 10px; }
  .relation-editor { margin-top: 12px; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--page); overflow: hidden; }
  .relation-editor > summary, .relation-inactive-history > summary { min-height: 54px; padding: 10px 12px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 9px; list-style: none; cursor: pointer; }
  .relation-editor > summary::-webkit-details-marker, .relation-inactive-history > summary::-webkit-details-marker { display: none; }
  .relation-editor > summary:hover, .relation-inactive-history > summary:hover { background: var(--nav-hover); }
  .relation-editor > summary > svg:last-child, .relation-inactive-history > summary > svg:last-child { width: 14px; height: 14px; color: var(--muted); transition: transform .16s ease; }
  .relation-editor[open] > summary > svg:last-child, .relation-inactive-history[open] > summary > svg:last-child { transform: rotate(180deg); }
  .relation-editor-icon { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 5px; color: var(--ink); background: var(--nav-hover); }
  .relation-editor-icon svg { width: 15px; height: 15px; }
  .relation-editor > summary > span:nth-child(2), .relation-inactive-history > summary > span:first-child { min-width: 0; display: grid; }
  .relation-editor > summary strong, .relation-inactive-history > summary strong { font-size: 13px; }
  .relation-editor > summary small, .relation-inactive-history > summary small { color: var(--muted); font-size: 11px; }
  .relation-editor-action { color: var(--ink); font-size: 11px; font-weight: 400; }
  .relation-form { padding: 14px; border-top: 1px solid var(--line); background: var(--paper); display: grid; gap: 14px; }
  .relation-authority { padding: 10px 11px; border: 1px solid var(--line); border-radius: 5px; background: var(--page); display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 9px; }
  .relation-authority > span { width: 27px; height: 27px; display: grid; place-items: center; border-radius: 4px; color: var(--ink); background: var(--nav-hover); }
  .relation-authority svg { width: 14px; height: 14px; }
  .relation-authority p { margin: 0; display: grid; gap: 2px; }
  .relation-authority strong { font-size: 12px; }
  .relation-authority small { color: var(--muted); font-size: 11px; line-height: 1.5; }
  .relation-authority a { color: var(--blue-dark); text-underline-offset: 2px; }
  .relation-direction-control { min-width: 0; padding: 0; border: 0; }
  .relation-direction-control legend { margin-bottom: 6px; color: var(--ink-soft); font-size: 11px; font-weight: 400; }
  .relation-direction-control > div { padding: 3px; border: 1px solid var(--line-strong); border-radius: 5px; background: var(--rail); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px; }
  .relation-direction-control label { position: relative; min-width: 0; cursor: pointer; }
  .relation-direction-control input { position: absolute; opacity: 0; pointer-events: none; }
  .relation-direction-control label > span { min-height: 48px; padding: 7px 9px; border: 1px solid transparent; border-radius: 4px; display: grid; align-content: center; gap: 1px; }
  .relation-direction-control label > span strong { font-size: 12px; }
  .relation-direction-control label > span small { color: var(--muted); font-size: 10px; }
  .relation-direction-control input:checked + span { border-color: var(--line-strong); background: var(--paper); color: var(--ink); }
  .relation-direction-control input:focus-visible + span { outline: 2px solid var(--focus); outline-offset: -2px; }
  .relation-builder { display: grid; grid-template-columns: minmax(180px, .7fr) minmax(0, 1.3fr); gap: 10px; }
  .relation-builder label, .relation-reason-field { min-width: 0; display: grid; gap: 5px; }
  .relation-builder label > span, .relation-reason-field > span { color: var(--ink-soft); font-size: 11px; font-weight: 400; }
  .relation-builder select, .relation-reason-field textarea { width: 100%; padding: 8px 9px; border: 1px solid var(--line-strong); border-radius: 5px; background: var(--paper); color: var(--ink); }
  .relation-reason-field textarea { min-height: 72px; resize: vertical; }
  .relation-live-preview { padding: 11px 12px; border: 1px solid var(--line); border-radius: 5px; background: var(--nav-hover); display: grid; gap: 3px; }
  .relation-live-preview > small { color: var(--ink-soft); font-size: 10px; font-weight: 400; }
  .relation-live-preview > strong { min-width: 0; font-size: 13px; overflow-wrap: anywhere; }
  .relation-live-preview > strong span { color: var(--ink); }
  .relation-live-preview > p { margin: 0; color: var(--muted); font-size: 11px; }
  .relation-form > footer { padding-top: 10px; border-top: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .relation-form > footer p { margin: 0; color: var(--muted); font-size: 11px; }
  .relation-form > footer button { flex: 0 0 auto; }
  .factor-advanced { min-width: 0; margin: 0; border: 1px solid var(--line); border-radius: 5px; background: var(--page); }
  .factor-advanced > summary { min-height: 47px; padding: 8px 10px; display: flex; align-items: center; justify-content: space-between; gap: 10px; list-style: none; cursor: pointer; }
  .factor-advanced > summary::-webkit-details-marker { display: none; }
  .factor-advanced > summary:hover { background: var(--nav-hover); }
  .factor-advanced > summary > span { min-width: 0; display: grid; gap: 1px; }
  .factor-advanced > summary strong { font-size: 12px; }
  .factor-advanced > summary small { color: var(--muted); font-size: 10px; font-weight: 400; }
  .factor-advanced > summary > svg { color: var(--muted); transition: transform .16s ease; }
  .factor-advanced[open] > summary > svg { transform: rotate(180deg); }
  .factor-advanced-grid { padding: 11px 10px 12px; border-top: 1px solid var(--line); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px 14px; }
  .factor-advanced-grid > label { min-width: 0; display: grid; gap: 5px; }
  .factor-advanced-grid > label > span { color: var(--ink); font-size: 11px; font-weight: 400; }
  .policy-form-wide { grid-column: 1 / -1; }
  .factor-advanced-grid input:not([type=checkbox]), .factor-advanced-grid textarea, .factor-advanced-grid select { width: 100%; min-width: 0; padding: 8px 9px; border: 1px solid var(--line-strong); border-radius: 4px; background: var(--paper); resize: vertical; }
  [aria-invalid="true"] { border-color: var(--red) !important; outline: 2px solid var(--red); outline-offset: -2px; }
  .relation-inactive-history { margin-top: 8px; border: 1px solid var(--line); border-radius: 5px; background: var(--page); }
  .relation-inactive-history > summary { min-height: 44px; grid-template-columns: minmax(0, 1fr) auto; }
  .relation-inactive-history > summary > span { grid-template-columns: auto auto minmax(0, 1fr); align-items: center; gap: 7px; }
  .relation-inactive-history > summary > span svg { width: 14px; height: 14px; color: var(--muted); }
  .relation-inactive-history > div { padding: 5px 7px; border-top: 1px solid var(--line); }
  .relation-editor-empty { margin-top: 10px; padding: 10px 11px; border: 1px dashed var(--line-strong); display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; color: var(--muted); }
  .relation-editor-empty > span { display: grid; }
  .relation-editor-empty svg { width: 15px; height: 15px; }
${GOALS_DEPENDENCY_PROPOSAL_STYLES}
  .contract-list { border-top: 1px solid var(--line); }
  .contract-list section { min-width: 0; padding: 11px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 138px minmax(0, 1fr); gap: 14px; align-items: start; }
  .contract-list h3 { margin: 0; font-size: 13px; }
  .contract-list .doc-list, .contract-list .empty-row { margin-top: 0; }
  .contract-list .doc-list { min-width: 0; overflow-wrap: anywhere; }
  .scope-gaps { margin-top: 10px; border: 1px solid var(--line); border-radius: 5px; background: var(--page); }
  .scope-gaps > summary { min-height: 46px; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; list-style: none; cursor: pointer; }
  .scope-gaps > summary::-webkit-details-marker { display: none; }
  .scope-gaps > summary:hover { background: var(--nav-hover); }
  .scope-gaps > summary > span { min-width: 0; display: grid; gap: 2px; }
  .scope-gaps > summary strong { font-size: 13px; }
  .scope-gaps > summary small { color: var(--muted); font-size: 12px; font-weight: 400; }
  .scope-gaps > summary > svg { flex: 0 0 auto; color: var(--blue); transition: transform .16s ease; }
  .scope-gaps[open] > summary > svg { transform: rotate(180deg); }
  .scope-gaps > .contract-list { padding: 0 12px 6px; border-top: 1px solid var(--line); background: var(--paper); }
  .risk-register, .impact-register { min-width: 0; padding: 14px 0; border-bottom: 1px solid var(--line); }
  .impact-register { border-bottom: 0; }
  .safety-subheading { margin-bottom: 10px; display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
  .safety-subheading p { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
  .safety-subheading > span { flex: 0 0 auto; color: var(--muted); font-size: 11px; }
  .risk-list { border: 1px solid var(--line-strong); border-radius: 6px; overflow: hidden; }
  .risk-record { scroll-margin-top: 16px; border-bottom: 1px solid var(--line-strong); background: var(--paper); }
  .risk-record:last-child { border-bottom: 0; }
  .risk-record > header { min-width: 0; padding: 12px 14px 10px; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 10px; }
  .risk-record-icon { width: 30px; height: 30px; border-radius: 5px; color: var(--amber); background: var(--amber-soft); display: grid; place-items: center; }
  .risk-record-icon svg { width: 15px; height: 15px; }
  .risk-record > header > div { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 2px 8px; }
  .risk-record h4 { min-width: 0; margin: 0; font-size: 14px; line-height: 1.4; overflow-wrap: anywhere; }
  .risk-record header small { grid-column: 1 / -1; color: var(--faint); font-size: 10px; overflow-wrap: anywhere; }
  .risk-record .risk-state { width: fit-content; padding: 2px 6px; border-radius: 3px; color: var(--amber); background: var(--amber-soft); font-size: 10px; white-space: nowrap; }
  .risk-record .risk-state--triggered { color: var(--red); background: var(--red-soft); }
  .risk-record .risk-state--resolved { color: var(--green); background: var(--green-soft); }
  .risk-record .risk-state--accepted, .risk-record .risk-state--expired { color: var(--muted); background: var(--rail); }
  .risk-facts { margin: 0; padding: 0 14px 8px 54px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 24px; }
  .risk-facts > div { min-width: 0; padding: 8px 0; border-top: 1px solid var(--line); display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 9px; }
  .risk-facts dt { color: var(--muted); font-size: 11px; }
  .risk-facts dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
  .risk-fact-wide { grid-column: 1 / -1; }
  .risk-linked-goals { display: flex; flex-wrap: wrap; gap: 5px 16px; }
  .risk-linked-goals a { min-width: min(100%, 210px); display: grid; color: inherit; text-decoration: none; }
  .risk-linked-goals a:hover strong { color: var(--blue-dark); text-decoration: underline; }
  .risk-linked-goals small { color: var(--faint); font-size: 10px; }
  .risk-effect { margin: 0 14px 12px 54px; padding: 8px 10px; border-left: 2px solid var(--blue); background: var(--page); color: var(--muted); display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; }
  .risk-effect--triggered { border-left-color: var(--red); background: var(--red-soft); color: var(--red); }
  .risk-effect > svg { margin-top: 1px; color: inherit; }
  .risk-effect > span { display: grid; gap: 1px; }
  .risk-effect strong { color: var(--ink); font-size: 11px; }
  .risk-resolution { margin: 0 14px 12px 54px; padding: 9px 10px; border-left: 2px solid var(--green); background: var(--green-soft); }
  .risk-resolution > strong { font-size: 11px; }
  .risk-resolution > p { margin: 2px 0 7px; }
  .risk-resolution dl { margin: 0; display: grid; gap: 6px; }
  .risk-resolution dl > div { display: grid; grid-template-columns: 82px minmax(0, 1fr); gap: 8px; }
  .risk-resolution dt { color: var(--muted); font-size: 10px; }
  .risk-resolution dd { margin: 0; overflow-wrap: anywhere; }
  .risk-resolution--unrecorded { border-left-color: var(--amber); background: var(--amber-soft); }
  .risk-readonly { margin: 0 14px 12px 54px; color: var(--muted); font-size: 11px; }
  .risk-actions { border-top: 1px solid var(--line); background: var(--page); }
  .risk-actions > details { border-bottom: 1px solid var(--line); }
  .risk-actions > details:last-child { border-bottom: 0; }
  .risk-actions summary, .risk-create > summary, .risk-goal-picker > summary { list-style: none; cursor: pointer; }
  .risk-actions summary::-webkit-details-marker, .risk-create > summary::-webkit-details-marker, .risk-goal-picker > summary::-webkit-details-marker { display: none; }
  .risk-actions > details > summary { min-height: 43px; padding: 8px 14px 8px 54px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .risk-actions > details > summary:hover, .risk-create > summary:hover { background: var(--nav-hover); }
  .risk-actions summary > span { display: inline-flex; align-items: center; gap: 7px; }
  .risk-actions summary > span > svg { color: var(--muted); }
  .risk-actions summary > svg, .risk-create > summary > svg, .risk-goal-picker > summary > svg { color: var(--muted); transition: transform .16s ease; }
  .risk-actions details[open] > summary > svg, .risk-create[open] > summary > svg, .risk-goal-picker[open] > summary > svg { transform: rotate(180deg); }
  .risk-form, .risk-state-form { padding: 13px 14px 15px 54px; border-top: 1px solid var(--line); background: var(--paper); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px 14px; }
  .risk-form label, .risk-state-form label { min-width: 0; display: grid; gap: 5px; }
  .risk-form label > span, .risk-state-form label > span { color: var(--ink); font-size: 11px; font-weight: 400; }
  .risk-form label small { color: var(--muted); font-weight: 400; }
  .risk-form input:not([type=checkbox]), .risk-form textarea, .risk-form select, .risk-state-form textarea, .risk-state-form select { width: 100%; min-width: 0; padding: 8px 9px; border: 1px solid var(--line-strong); border-radius: 4px; background: var(--paper); resize: vertical; }
  .risk-form-wide, .risk-goal-picker { grid-column: 1 / -1; }
  .risk-form footer, .risk-state-form footer { padding-top: 10px; border-top: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .risk-form footer > span { color: var(--muted); font-size: 11px; }
  .risk-state-preview { min-width: 0; margin: 0; padding: 8px 10px; border-left: 2px solid var(--blue); background: var(--page); color: var(--muted); font-size: 11px; }
  .risk-resolution-fields { padding: 12px 14px; border-top: 1px solid var(--line); background: var(--page); display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .risk-resolution-fields[hidden] { display: none; }
  .risk-resolution-fields label { min-width: 0; display: grid; gap: 5px; }
  .risk-resolution-fields label > span { font-size: 11px; font-weight: 400; }
  .risk-resolution-fields textarea { width: 100%; min-width: 0; padding: 8px 9px; border: 1px solid var(--line-strong); border-radius: 4px; background: var(--paper); resize: vertical; }
  .risk-decision-link { min-height: 50px; padding: 9px 14px 9px 54px; border-top: 1px solid var(--line); color: var(--blue-dark); display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 9px; text-decoration: none; }
  .risk-decision-link:hover { background: var(--nav-hover); }
  .risk-decision-link > span { min-width: 0; display: grid; }
  .risk-decision-link small { color: var(--muted); }
  .risk-goal-picker { border: 1px solid var(--line); border-radius: 5px; background: var(--page); }
  .risk-goal-picker > summary { min-height: 45px; padding: 7px 10px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .risk-goal-picker > summary > span { min-width: 0; display: grid; }
  .risk-goal-picker > summary small { color: var(--muted); font-size: 10px; font-weight: 400; }
  .risk-goal-picker > div { padding: 9px; border-top: 1px solid var(--line); }
  .risk-goal-search { position: relative; display: block !important; }
  .risk-goal-search > svg { position: absolute; left: 9px; top: 9px; z-index: 1; color: var(--muted); pointer-events: none; }
  .risk-goal-search input { padding-left: 31px !important; }
  .risk-goal-options { max-height: 180px; margin-top: 7px; overflow: auto; scrollbar-width: none; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px 8px; }
  .risk-goal-options::-webkit-scrollbar { display: none; }
  .risk-goal-options > label { padding: 6px 7px; border-radius: 4px; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 7px; cursor: pointer; }
  .risk-goal-options > label:hover { background: var(--nav-hover); }
  .risk-goal-options > label[hidden] { display: none; }
  .risk-goal-options input { accent-color: var(--blue); }
  .risk-goal-options span { min-width: 0; display: grid; }
  .risk-goal-options strong, .risk-goal-options small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .risk-goal-options small { color: var(--faint); font-size: 10px; font-weight: 400; }
  .risk-create { margin-top: 10px; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--page); }
  .risk-create > summary { min-height: 52px; padding: 9px 12px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 9px; }
  .risk-create > summary > span:nth-child(2) { min-width: 0; display: grid; }
  .risk-create > summary small { color: var(--muted); font-size: 11px; }
  .risk-create > .risk-form { padding-left: 14px; }
  .risk-empty { margin: 0; padding: 13px 14px; border: 1px dashed var(--line-strong); color: var(--muted); background: var(--page); }
  .impact-ledger { border-top: 1px solid var(--line-strong); border-bottom: 1px solid var(--line-strong); }
  .impact-list { overflow: hidden; }
  .impact-record { scroll-margin-top: 16px; border-bottom: 1px solid var(--line-strong); background: var(--paper); }
  .impact-record:last-child { border-bottom: 0; }
  .impact-record--inactive { background: var(--page); }
  .impact-record > header { min-width: 0; padding: 12px 14px 10px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: 10px; }
  .impact-record-icon { width: 30px; height: 30px; border-radius: 5px; color: var(--ink); background: var(--nav-hover); display: grid; place-items: center; }
  .impact-record-icon svg { width: 15px; height: 15px; }
  .impact-record > header > div { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 2px 8px; }
  .impact-record h4 { min-width: 0; margin: 0; font-size: 14px; line-height: 1.4; overflow-wrap: anywhere; }
  .impact-record header small { grid-column: 1 / -1; color: var(--faint); font-size: 10px; overflow-wrap: anywhere; }
  .impact-access, .impact-state { width: fit-content; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 400; white-space: nowrap; }
  .impact-access { color: var(--ink); background: var(--nav-hover); }
  .impact-access--decide { color: var(--hue-purple); background: var(--hue-purple-soft); }
  .impact-access--exclusive { color: var(--red); background: var(--red-soft); }
  .impact-state { color: var(--green); background: var(--green-soft); }
  .impact-state--proposed { color: var(--amber); background: var(--amber-soft); }
  .impact-state--inactive { color: var(--muted); background: var(--rail); }
  .impact-record--inactive .impact-record-icon,
  .impact-record--inactive .impact-access { color: var(--muted); background: var(--rail); }
  .impact-facts { margin: 0; padding: 0 14px 8px 54px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 24px; }
  .impact-facts > div { min-width: 0; padding: 8px 0; border-top: 1px solid var(--line); display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 9px; }
  .impact-facts dt { color: var(--muted); font-size: 11px; }
  .impact-facts dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
  .impact-fact-wide { grid-column: 1 / -1; }
  .impact-effect { margin: 0 14px 12px 54px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 4px; background: var(--page); color: var(--muted); display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; }
  .impact-effect--proposed { border-color: color-mix(in srgb, var(--amber) 40%, var(--line)); background: var(--amber-soft); }
  .impact-effect--inactive { border-color: var(--line); background: var(--page); }
  .impact-record--inactive .impact-effect strong { color: var(--muted); }
  .impact-effect > svg { margin-top: 1px; color: inherit; }
  .impact-effect > span { display: grid; gap: 1px; }
  .impact-effect strong { color: var(--ink); font-size: 11px; }
  .impact-readonly { margin: 0 14px 12px 54px; color: var(--muted); font-size: 11px; }
  .impact-actions { border-top: 1px solid var(--line); background: var(--page); }
  .impact-actions > details { border-bottom: 1px solid var(--line); }
  .impact-actions > details:last-child { border-bottom: 0; }
  .impact-actions summary, .impact-create > summary, .impact-history > summary { list-style: none; cursor: pointer; }
  .impact-actions summary::-webkit-details-marker, .impact-create > summary::-webkit-details-marker, .impact-history > summary::-webkit-details-marker { display: none; }
  .impact-actions > details > summary { min-height: 43px; padding: 8px 14px 8px 54px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .impact-actions summary:focus-visible, .impact-create > summary:focus-visible, .impact-history > summary:focus-visible { outline: 2px solid var(--focus); outline-offset: -3px; }
  .impact-actions > details > summary:hover, .impact-create > summary:hover, .impact-history > summary:hover { background: var(--nav-hover); }
  .impact-actions summary > span { display: inline-flex; align-items: center; gap: 7px; }
  .impact-actions summary > span > svg { color: var(--muted); }
  .impact-actions summary > svg, .impact-create > summary > svg, .impact-history > summary > svg { color: var(--muted); transition: transform .16s ease; }
  .impact-actions details[open] > summary > svg, .impact-create[open] > summary > svg, .impact-history[open] > summary > svg { transform: rotate(180deg); }
  .impact-form { padding: 13px 14px 15px 54px; border-top: 1px solid var(--line); background: var(--paper); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px 14px; }
  .impact-form label, .impact-deactivate form label { min-width: 0; display: grid; gap: 5px; }
  .impact-form label > span, .impact-deactivate form label > span { color: var(--ink); font-size: 11px; font-weight: 400; }
  .impact-form label small { color: var(--muted); font-weight: 400; }
  .impact-form input, .impact-form textarea, .impact-form select, .impact-deactivate textarea { width: 100%; min-width: 0; padding: 8px 9px; border: 1px solid var(--line-strong); border-radius: 4px; background: var(--paper); resize: vertical; }
  .impact-form-wide { grid-column: 1 / -1; }
  .impact-form footer { padding-top: 10px; border-top: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .impact-form footer > span { color: var(--muted); font-size: 11px; }
  .impact-deactivate form { padding: 13px 14px 15px 54px; border-top: 1px solid var(--line); background: var(--paper); display: grid; gap: 10px; }
  .impact-deactivate form > p { margin: 0; color: var(--muted); font-size: 11px; }
  .impact-deactivate form footer { display: flex; justify-content: flex-end; }
  .impact-create, .impact-history { margin: 0; border: 0; border-top: 1px solid var(--line-strong); border-radius: 0; background: var(--page); }
  .impact-create > summary, .impact-history > summary { min-height: 52px; padding: 9px 12px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 9px; }
  .impact-create > summary > span:nth-child(2), .impact-history > summary > span:first-child { min-width: 0; display: grid; }
  .impact-create > summary small, .impact-history > summary small { color: var(--muted); font-size: 11px; }
  .impact-create > .impact-form { padding-left: 14px; }
  .impact-history > .impact-list { border: 0; border-top: 1px solid var(--line); border-radius: 0; }
  .impact-empty { margin: 0; padding: 13px 14px; border: 0; color: var(--muted); background: var(--page); }
  .fact-row { display: flex; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--line); }
  .fact-row:last-child { border-bottom: 0; }
  .fact-icon { flex: 0 0 auto; margin-top: 2px; color: var(--blue); }
  .fact-icon--risk { color: var(--amber); }
  .fact-row > span:last-child { min-width: 0; display: grid; }
  .fact-row small { color: var(--muted); overflow-wrap: anywhere; }
  .policy-list div { grid-template-columns: minmax(0, 1fr) auto; }
  .policy-workbench { padding-top: 2px; border-top: 1px solid var(--line-strong); display: grid; gap: 14px; }
  .policy-effective { margin-top: 14px; padding: 0; border: 1px solid var(--line); border-radius: 5px; background: var(--paper); }
  .policy-effective > header { padding: 12px 14px; display: flex; align-items: flex-start; gap: 8px; }
  .policy-effective-icon { width: 20px; height: 20px; margin-top: 1px; color: var(--muted); display: grid; place-items: center; }
  .policy-effective h3 { margin: 0; font-size: 14px; letter-spacing: -.01em; }
  .policy-effective header p { margin: 1px 0 0; color: var(--muted); font-size: 12px; }
  .policy-effective dl { margin: 0; padding: 0 14px 12px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid var(--line); }
  .policy-effective dl div { min-width: 0; padding: 10px 12px 1px 0; display: grid; gap: 1px; }
  .policy-effective dt { color: var(--muted); font-size: 11px; font-weight: 400; }
  .policy-effective dd { min-width: 0; margin: 0; display: grid; overflow-wrap: anywhere; }
  .policy-effective dd strong { font-size: 13px; }
  .policy-effective dd small { color: var(--muted); font-size: 11px; }
  .policy-inheritance { min-width: 0; padding: 10px 13px; border: 1px solid var(--line); border-radius: 5px; background: var(--rail); display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 10px; }
  .policy-inheritance > span { min-width: 0; display: grid; }
  .policy-inheritance small { color: var(--muted); font-size: 9px; font-weight: 400; letter-spacing: .05em; text-transform: uppercase; }
  .policy-inheritance strong { overflow-wrap: anywhere; font-size: 12px; }
  .policy-inheritance > svg { color: var(--faint); }
  .policy-source { min-width: 0; border: 1px solid var(--line-strong); border-radius: 6px; overflow: hidden; background: var(--paper); }
  .policy-source--goal { border-color: var(--line-strong); }
  .policy-source > summary { min-height: 76px; padding: 13px 15px; display: flex; align-items: center; justify-content: space-between; gap: 20px; cursor: pointer; list-style: none; background: color-mix(in srgb, var(--rail) 76%, var(--paper)); }
  .policy-source--goal > summary { background: var(--nav-hover); }
  .policy-source > summary::-webkit-details-marker { display: none; }
  .policy-source-title { min-width: 0; display: flex; align-items: flex-start; gap: 11px; }
  .policy-scope-index { flex: 0 0 auto; width: 29px; height: 29px; border: 1px solid var(--line-strong); border-radius: 4px; display: grid; place-items: center; color: var(--muted); font-size: 10px; font-weight: 400; }
  .policy-source--goal .policy-scope-index { color: var(--ink); border-color: var(--line-strong); background: var(--paper); }
  .policy-source-title > span:last-child { min-width: 0; display: grid; }
  .policy-source-title small { color: var(--muted); font-size: 9px; font-weight: 400; letter-spacing: .09em; }
  .policy-source-title strong { font-size: 15px; }
  .policy-source-title > span:last-child > span { color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
  .policy-source-state { min-width: 190px; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: 8px; text-align: right; }
  .policy-source-state strong, .policy-source-state small { min-width: 0; overflow-wrap: anywhere; }
  .policy-source-state strong { color: var(--ink); font-size: 11px; }
  .policy-source--project .policy-source-state strong { color: var(--ink-soft); }
  .policy-source-state small { grid-column: 1; color: var(--muted); font-size: 9px; }
  .policy-source-state svg { grid-column: 2; grid-row: 1 / 3; color: var(--muted); transition: transform .16s ease; }
  .policy-source[open] .policy-source-state svg { transform: rotate(180deg); }
  .policy-form { padding: 0 15px 15px; display: grid; }
  .policy-scope-notice { margin: 0 -15px; padding: 10px 15px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: var(--rail); display: flex; align-items: flex-start; gap: 8px; color: var(--ink-soft); font-size: 11px; }
  .policy-scope-notice svg { flex: 0 0 auto; margin-top: 2px; color: var(--muted); }
  .policy-current-reason { margin: 12px 0 0; padding: 9px 10px; border-left: 2px solid var(--line-strong); color: var(--muted); background: var(--rail); display: grid; gap: 1px; font-size: 11px; }
  .policy-current-reason strong { color: var(--ink-soft); }
  .policy-form-group { padding: 16px 0 2px; border-bottom: 1px solid var(--line); }
  .policy-form-group > header { margin-bottom: 13px; display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: start; gap: 9px; }
  .policy-form-group > header > span { width: 28px; height: 28px; border-radius: 4px; color: var(--ink); background: var(--nav-hover); display: grid; place-items: center; }
  .policy-form-group h3 { margin: 0; font-size: 14px; }
  .policy-form-group header p { margin: 1px 0 0; color: var(--muted); font-size: 11px; }
  .policy-control { min-width: 0; margin: 0; padding: 0 0 14px; border: 0; }
  .policy-control > legend { padding: 0; font-weight: 400; }
  .policy-control > p { margin: 0 0 8px; color: var(--muted); font-size: 11px; }
  .policy-mode-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
  .policy-mode-options label { min-width: 0; position: relative; cursor: pointer; }
  .policy-mode-options input { position: absolute; opacity: 0; pointer-events: none; }
  .policy-mode-options label > span { min-height: 58px; padding: 9px 10px; border: 1px solid var(--line-strong); border-radius: 5px; background: var(--paper); display: grid; align-content: center; gap: 1px; }
  .policy-mode-options label:hover > span { border-color: var(--line-strong); background: var(--nav-hover); }
  .policy-mode-options input:disabled + span { border-color: var(--line); color: var(--faint); background: var(--rail); cursor: not-allowed; }
  .policy-mode-options label:has(input:disabled) { cursor: not-allowed; }
  .policy-mode-options input:checked + span { border-color: var(--line-strong); background: var(--nav-active); box-shadow: none; }
  .policy-mode-options input:focus-visible + span { outline: 2px solid var(--focus); outline-offset: -2px; }
  .policy-mode-options strong { font-size: 12px; }
  .policy-mode-options small { color: var(--muted); font-size: 10px; overflow-wrap: anywhere; }
  .policy-control--split { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(180px, .65fr); gap: 12px; }
  .policy-input { min-width: 0; display: grid; gap: 6px; }
  .policy-input > span:first-child { display: grid; }
  .policy-input small { color: var(--muted); font-size: 10px; }
  .policy-input input, .policy-reason textarea { width: 100%; min-width: 0; padding: 8px 9px; border: 1px solid var(--line-strong); border-radius: 4px; color: var(--ink); background: var(--paper); resize: vertical; }
  .policy-with-unit { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 7px; }
  .policy-with-unit > span { color: var(--muted); }
  .policy-toggle-list { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .policy-toggle { min-width: 0; padding: 10px 11px; border: 1px solid var(--line); border-radius: 5px; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 9px; cursor: pointer; }
  .policy-toggle:hover { border-color: var(--line-strong); background: var(--nav-hover); }
  .policy-toggle:has(input:disabled) { color: var(--faint); background: var(--rail); cursor: not-allowed; }
  .policy-toggle > input { position: absolute; opacity: 0; pointer-events: none; }
  .policy-switch { position: relative; width: 30px; height: 18px; border-radius: 9px; background: var(--faint); transition: .16s ease; }
  .policy-switch::after { content: ""; position: absolute; top: 3px; left: 3px; width: 12px; height: 12px; border-radius: 50%; background: var(--paper); box-shadow: 0 1px 2px rgba(20, 30, 42, .2); transition: .16s ease; }
  .policy-toggle input:checked + .policy-switch { background: var(--action); }
  .policy-toggle input:checked + .policy-switch::after { transform: translateX(12px); }
  .policy-toggle input:focus-visible + .policy-switch { outline: 2px solid var(--focus); outline-offset: -2px; }
  .policy-toggle-copy { min-width: 0; display: grid; }
  .policy-toggle-copy strong { font-size: 12px; }
  .policy-toggle-copy small { color: var(--muted); font-size: 10px; overflow-wrap: anywhere; }
  .policy-review-counts { margin-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .policy-counter { min-width: 0; padding: 10px 11px; border: 1px solid var(--line); border-radius: 5px; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; }
  .policy-counter > span:first-child { min-width: 0; display: grid; }
  .policy-counter strong { font-size: 12px; }
  .policy-counter small { color: var(--muted); font-size: 10px; overflow-wrap: anywhere; }
  .policy-counter-input { display: grid; grid-template-columns: 56px auto; align-items: center; gap: 5px; color: var(--muted); }
  .policy-counter-input input { width: 56px; min-width: 0; padding: 7px 6px; border: 1px solid var(--line-strong); border-radius: 4px; color: var(--ink); background: var(--paper); text-align: center; }
  .policy-form-group--reason { border-bottom: 0; }
  .policy-reason { display: grid; grid-template-columns: 110px minmax(0, 1fr); align-items: start; gap: 10px; }
  .policy-reason > span { padding-top: 7px; font-weight: 400; }
  .policy-form > .form-error { margin: 8px 0 0; }
  .policy-form footer { margin-top: 13px; padding: 12px 0 0; border-top: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .policy-form footer > span { color: var(--muted); font-size: 11px; }
  .draft-editor-section { margin: 18px 0 0 31px; padding-top: 17px; border-top: 1px solid var(--line); background: transparent; scroll-margin-top: 12px; }
  .draft-contract-form { border-top: 1px solid var(--line-strong); display: grid; }
  .draft-contract-form label { min-width: 0; display: grid; gap: 5px; }
  .draft-contract-form label > span, .decomposition-editor legend { font-weight: 400; }
  .draft-contract-form label small { color: var(--muted); font-weight: 400; }
  .draft-contract-form input:not([type=radio]), .draft-contract-form textarea, .draft-contract-form select, .draft-aux-form input, .draft-aux-form textarea, .draft-aux-form select { width: 100%; min-width: 0; padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: 4px; background: var(--paper); resize: vertical; }
  .draft-form-row { padding: 14px 0 0; display: grid; grid-template-columns: minmax(0, 1fr) 120px; gap: 14px; }
  .draft-field { padding-top: 12px; }
  .draft-list-grid { padding: 14px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; }
  .draft-list-grid label:last-child { grid-column: 1 / -1; }
  .decomposition-editor { min-width: 0; margin: 0; padding: 15px 0; border: 0; border-bottom: 1px solid var(--line); }
  .decomposition-editor legend { margin-bottom: 9px; }
  .decomposition-editor > div { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border: 1px solid var(--line); border-radius: 5px; overflow: hidden; background: var(--paper); }
  .decomposition-choice { min-width: 0; padding: 10px 12px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); display: grid !important; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 9px !important; cursor: pointer; }
  .decomposition-choice:nth-child(2n) { border-right: 0; }
  .decomposition-choice:nth-last-child(-n+2) { border-bottom: 0; }
  .decomposition-choice:has(input:checked) { color: var(--ink); background: var(--nav-active); }
  .decomposition-choice input { margin-top: 4px; accent-color: var(--blue); }
  .decomposition-choice > span { min-width: 0; display: grid; }
  .decomposition-choice small { color: var(--muted); font-size: 12px; font-weight: 400; }
  .criteria-editor { padding: 15px 0; border-bottom: 1px solid var(--line); }
  .criteria-editor > header { margin-bottom: 10px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .criteria-editor h3 { margin: 0; font-size: 14px; }
  .criteria-editor header p { margin: 1px 0 0; color: var(--muted); font-size: 12px; }
  .criteria-editor .mw-btn, .draft-aux-form .mw-btn { display: inline-flex; }
  .criteria-editor-list { display: grid; gap: 9px; }
  .criterion-editor-row { border: 1px solid var(--line); border-radius: 5px; overflow: hidden; background: var(--paper); }
  .criterion-editor-row > header { min-height: 39px; padding: 6px 10px 6px 12px; border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; background: var(--page); }
  .criterion-editor-row > header .mw-btn { min-height: 28px; }
  .criterion-editor-grid { padding: 11px 12px 13px; display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(160px, .7fr); gap: 11px 14px; }
  .criterion-pass { grid-column: 1; }
  .draft-contract-form > .form-error { margin-top: 12px; }
  .draft-contract-form > footer { padding-top: 13px; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .draft-contract-form > footer > span { color: var(--muted); font-size: 12px; }
  .draft-auxiliary { margin-top: 17px; border-top: 1px solid var(--line-strong); }
  .draft-auxiliary > details { border-bottom: 1px solid var(--line); }
  .draft-auxiliary summary { min-height: 55px; padding: 9px 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; cursor: pointer; list-style: none; }
  .draft-auxiliary summary::-webkit-details-marker { display: none; }
  .draft-auxiliary summary > span { min-width: 0; display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: center; gap: 0 8px; }
  .draft-auxiliary summary > span > svg { grid-row: 1 / 3; color: var(--muted); font-size: 17px; }
  .draft-auxiliary summary small { color: var(--muted); font-size: 12px; }
  .draft-auxiliary summary > svg { color: var(--muted); transition: transform .16s ease; }
  .draft-auxiliary details[open] summary > svg { transform: rotate(180deg); }
  .draft-aux-form { padding: 4px 0 15px 30px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px 14px; }
  .draft-aux-form label { min-width: 0; display: grid; gap: 5px; }
  .draft-aux-form label > span { font-weight: 400; }
  .draft-aux-form label small { color: var(--muted); font-weight: 400; }
  .draft-aux-wide { grid-column: 1 / -1; }
  .draft-aux-form footer { display: flex; justify-content: flex-end; }
  .draft-policy-link { min-height: 61px; padding: 9px 0; color: inherit; display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 8px; text-decoration: none; }
  .draft-policy-link > svg:first-child { color: var(--muted); font-size: 17px; }
  .draft-policy-link > span { display: grid; }
  .draft-policy-link small { color: var(--muted); font-size: 12px; }
  .draft-policy-link > svg:last-child { color: var(--muted); }
  .draft-policy-link:hover { color: var(--blue-dark); }
  .history-list { list-style: none; margin: 0; padding: 0; }
  .history-list li { display: grid; grid-template-columns: 136px minmax(0, 1fr); gap: 15px; padding: 7px 0; border-bottom: 1px solid var(--line); }
  .history-list time { color: var(--muted); font-variant-numeric: tabular-nums; font-size: 12px; }
  .history-list span { min-width: 0; display: grid; }
  .history-list strong, .history-list small { overflow-wrap: anywhere; }
  .history-list small { color: var(--muted); }
  .decision-center { width: min(100%, 1080px); margin: 0 auto; padding: 34px 38px 80px; container-type: inline-size; animation: document-in .24s cubic-bezier(.16, 1, .3, 1); }
  .decision-center-header { padding-bottom: 22px; border-bottom: 1px solid var(--line-strong); display: flex; align-items: flex-end; justify-content: space-between; gap: 26px; }
  .decision-center-header > div { max-width: 710px; }
  .decision-center-header > div > small { color: var(--ink-soft); font-size: 10px; font-weight: 400; letter-spacing: .12em; }
  .decision-center-header h1 { margin: 0 0 5px; font-size: clamp(25px, 2.3vw, 32px); line-height: 1.25; letter-spacing: -.03em; }
  .decision-center-header p { margin: 0; color: var(--muted); }
  .decision-center-header > strong { min-width: 94px; font-size: 34px; line-height: 1; text-align: right; font-variant-numeric: tabular-nums; }
  .decision-center-header > strong small { margin-top: 5px; display: block; color: var(--muted); font-size: 11px; font-weight: 400; }
  .decision-summary { min-height: 48px; border-bottom: 1px solid var(--line); display: flex; align-items: center; flex-wrap: wrap; gap: 8px 24px; color: var(--muted); font-size: 12px; }
  .decision-summary span { display: inline-flex; align-items: center; gap: 6px; }
  .decision-summary strong { color: var(--ink); font-variant-numeric: tabular-nums; }
  .decision-groups { display: grid; }
  .decision-goal-group { padding: 25px 0 30px; border-bottom: 1px solid var(--line-strong); scroll-margin-top: 12px; }
  .decision-owner { margin-bottom: 13px; display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; }
  .decision-owner > div { min-width: 0; display: grid; gap: 3px; }
  .decision-owner > div > span { color: var(--muted); font-size: 11px; font-weight: 400; }
  .decision-owner > small { flex: 0 0 auto; color: var(--muted); }
  .decision-owner-link { min-width: 0; color: inherit; display: grid; text-decoration: none; }
  a.decision-owner-link:hover strong { color: var(--blue-dark); text-decoration: underline; }
  .decision-owner-link strong { font-size: 18px; letter-spacing: -.015em; overflow-wrap: anywhere; }
  .decision-owner-link small { color: var(--muted); font-size: 11px; }
  .decision-stack { display: grid; gap: 12px; }
${GOALS_DECISION_COMMON_STYLES}
${GOALS_LEGACY_CONTRACT_STYLES}
${GOALS_PROPOSAL_STYLES}
${GOALS_CANDIDATE_STYLES}
${GOALS_EVENT_DOCUMENT_STYLES}
  .decision-reason { padding: 12px 15px; border-top: 1px solid var(--line); background: var(--page); display: grid; grid-template-columns: 170px minmax(0, 1fr); align-items: start; gap: 13px; }
  .decision-reason > span { padding-top: 7px; font-weight: 400; }
  .decision-reason textarea { width: 100%; min-width: 0; padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: 4px; background: var(--paper); resize: vertical; }
  .decision-record > .form-error { margin: 0 15px 12px; }
  .decision-record > footer.decision-actions { padding: 11px 15px 12px; border-top: 1px solid var(--line); justify-content: flex-end; background: var(--page); }
  .decision-actions { display: flex; gap: 7px; }
  .decision-actions .mw-btn:disabled { cursor: not-allowed; }
  .risk-state { color: var(--amber); font-size: 11px; font-weight: 400; }
  .risk-state--triggered { color: var(--red); }
  .risk-goal-links { padding: 10px 14px; border-top: 1px solid var(--line); display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 14px; }
  .risk-goal-links > span { color: var(--muted); font-size: 11px; font-weight: 400; }
  .risk-goal-links > div { min-width: 0; display: flex; flex-wrap: wrap; gap: 8px 18px; }
  .risk-goal-links .decision-owner-link { min-width: min(100%, 220px); }
  .risk-goal-links .decision-owner-link strong { font-size: 13px; }
  .risk-decision-fact { margin-top: 11px; padding: 10px 11px; border-left: 2px solid var(--amber); background: var(--amber-soft); }
  .risk-decision-fact p, .risk-decision-fact small { display: block; margin: 2px 0 0; color: var(--amber); }
  .risk-decision-details { margin: 0; padding: 0 14px; }
  .risk-decision-details > div { padding: 10px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 170px minmax(0, 1fr); gap: 12px; }
  .risk-decision-details dt { color: var(--muted); font-size: 11px; font-weight: 400; }
  .risk-decision-details dd { margin: 0; overflow-wrap: anywhere; }
  .risk-decision-choice { padding: 12px 14px; border-top: 1px solid var(--line); display: grid; grid-template-columns: minmax(220px, .7fr) minmax(0, 1fr); align-items: end; gap: 14px; }
  .risk-decision-choice label { display: grid; gap: 5px; }
  .risk-decision-choice label > span { font-size: 11px; font-weight: 400; }
  .risk-decision-choice select { width: 100%; min-height: 36px; padding: 6px 9px; border: 1px solid var(--line-strong); border-radius: 4px; background: var(--paper); }
  .risk-decision-choice select[aria-invalid="true"], .decision-reason textarea[aria-invalid="true"] { border-color: var(--red); outline: 2px solid var(--red); outline-offset: -2px; }
  .risk-decision-choice .risk-state-preview { min-height: 36px; }
  .risk-decision > footer.decision-actions { justify-content: space-between; align-items: center; }
  .risk-decision > footer.decision-actions a { color: var(--blue-dark); font-size: 12px; font-weight: 400; text-decoration: none; }
  .decision-link-row { padding: 10px 14px; border-top: 1px solid var(--line); background: var(--page); display: flex; align-items: center; justify-content: space-between; gap: 18px; }
  .decision-link-row span { color: var(--muted); font-size: 12px; }
  .decision-link-row a { flex: 0 0 auto; color: var(--blue-dark); font-weight: 400; text-decoration: none; }
  .decision-stack > .human-review-list { margin: 0; border: 1px solid var(--line-strong); border-radius: 5px; overflow: hidden; }
  .decision-stack > .human-review-list > .decision-record-heading { padding: 8px 13px; border-bottom: 1px solid var(--line); }
  .review-context { padding: 0 14px 13px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; }
  .review-context h4 { margin: 13px 0 6px; font-size: 12px; }
  .decision-receipt { margin: 18px 0 2px; padding: 13px 15px; border: 1px solid color-mix(in srgb, var(--green), var(--line) 65%); background: var(--green-soft); display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 18px; }
  .decision-receipt strong, .decision-receipt span { display: block; }
  .decision-receipt span { color: var(--muted); font-size: 12px; }
  .decision-receipt a { color: var(--blue-dark); font-weight: 400; text-decoration: none; }
  .decision-results { margin: 18px 0 2px; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--paper); overflow: hidden; }
  .decision-results > header { padding: 12px 14px; border-bottom: 1px solid var(--line); background: var(--page); display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
  .decision-results > header h2 { margin: 0; font-size: 15px; }
  .decision-results > header p { margin: 2px 0 0; color: var(--muted); font-size: 12px; }
  .decision-results > header > small { flex: 0 0 auto; color: var(--muted); }
  .decision-result-list { display: grid; }
  .decision-result { min-width: 0; padding: 12px 14px; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(180px, auto); align-items: start; gap: 11px; }
  .decision-result:last-child { border-bottom: 0; }
  .decision-result-icon { width: 27px; height: 27px; border-radius: 50%; color: var(--green); background: var(--green-soft); display: grid; place-items: center; }
  .decision-result-icon svg { width: 14px; height: 14px; }
  .decision-result-copy { min-width: 0; }
  .decision-result-copy > div { display: flex; align-items: center; flex-wrap: wrap; gap: 5px 8px; color: var(--muted); font-size: 10px; }
  .decision-result-copy > div strong { padding: 1px 5px; border-radius: 3px; color: var(--green); background: var(--green-soft); }
  .decision-result-copy > div time { margin-left: auto; }
  .decision-result-copy h3 { margin: 4px 0 3px; font-size: 13px; line-height: 1.4; overflow-wrap: anywhere; }
  .decision-result-copy p { margin: 2px 0; color: var(--ink-soft); font-size: 12px; overflow-wrap: anywhere; }
  .decision-result-copy > small { display: block; margin-top: 5px; color: var(--muted); overflow-wrap: anywhere; }
  .decision-result-links { min-width: 0; display: grid; justify-items: end; gap: 4px; }
  .decision-result-links a { max-width: 100%; color: var(--blue-dark); font-size: 11px; font-weight: 400; text-decoration: none; display: flex; align-items: center; justify-content: flex-end; gap: 3px; text-align: right; overflow-wrap: anywhere; }
  .decision-result-links a svg { flex: 0 0 auto; width: 12px; height: 12px; }
  .decision-empty { min-height: 410px; display: grid; place-content: center; justify-items: center; text-align: center; color: var(--muted); }
  .decision-empty > svg { width: 30px; height: 30px; color: var(--green); }
  .decision-empty h2 { margin: 12px 0 3px; color: var(--ink); font-size: 19px; }
  .decision-empty p { margin: 0; }
  .decision-empty a { margin-top: 12px; color: var(--blue-dark); font-weight: 400; text-decoration: none; }
  .mobile-switch { display: none; }
  .create-dialog { width: min(680px, calc(100vw - 32px)); max-height: calc(100vh - 40px); padding: 0; border: 1px solid var(--control-border); border-radius: var(--radius-surface); box-shadow: var(--control-shadow); }
  .create-dialog::backdrop { background: rgba(25, 34, 45, .36); backdrop-filter: blur(2px); }
  .dialog-shell { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; max-height: calc(100vh - 40px); }
  .create-dialog header { padding: 18px 20px; border-bottom: 1px solid var(--line); display: flex; align-items: flex-start; justify-content: space-between; }
  .create-dialog header > div { display: flex; gap: 11px; }
  .dialog-icon { width: 34px; height: 34px; border-radius: 6px; background: var(--nav-hover); color: var(--ink); display: grid; place-items: center; font-size: 18px; }
  .dialog-icon--danger { color: var(--red); background: var(--red-soft); }
  .create-dialog h2 { margin: 0; font-size: 19px; }
  .create-dialog header p { margin: 1px 0 0; color: var(--muted); font-size: 12px; }
  .goal-lifecycle-hint { display: flex; align-items: flex-start; gap: 9px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--rail); }
  .goal-lifecycle-hint > svg { flex: 0 0 auto; margin-top: 2px; color: var(--muted); }
  .goal-lifecycle-hint span { display: grid; gap: 2px; }
  .goal-lifecycle-hint small { color: var(--muted); }
  .dialog-body { padding: 18px 20px 22px; overflow: auto; display: grid; gap: 13px; }
  .dialog-body label { display: grid; gap: 5px; }
  .dialog-body label > span, .dialog-body legend { font-weight: 400; }
  .dialog-body small { color: var(--muted); font-weight: 400; }
  .dialog-body input:not([type=checkbox]), .dialog-body textarea, .dialog-body select { width: 100%; border: 1px solid var(--control-input); border-radius: var(--radius-control); padding: 8px 10px; background: var(--paper); resize: vertical; }
  .goal-trash-dialog { width: min(560px, calc(100vw - 32px)); }
  .goal-trash-dialog .dialog-body { align-content: start; grid-auto-rows: max-content; }
  .goal-trash-target { margin: 0; padding-bottom: 12px; border-bottom: 1px solid var(--line); display: grid; gap: 2px; }
  .goal-trash-target strong { overflow-wrap: anywhere; }
  .goal-trash-target small { font-size: 11px; }
  .goal-trash-note { margin: 0; padding: 10px 12px; border: 1px solid var(--line); border-radius: 5px; color: var(--ink-soft); background: var(--page); font-size: 12px; }
  .field-row { display: grid; gap: 12px; }
  .field-row--split { grid-template-columns: 1fr 120px; }
  .dialog-body fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
  .relation-field { min-width: 0; padding: 13px 0 3px; border-top: 1px solid var(--line); }
  .relation-field-heading, .relation-field > legend { width: 100%; margin: 0 0 9px; padding: 0; display: grid; grid-template-columns: 82px minmax(0, 1fr); gap: 12px; text-align: left; }
  .relation-field-heading > span, .relation-field > legend > span { width: fit-content; height: fit-content; padding: 2px 6px; border-radius: 3px; color: var(--muted); background: var(--rail); font-size: 11px; font-weight: 400; }
  .relation-field-heading h3 { margin: 0; font-size: 14px; }
  .relation-field-heading p, .relation-field > legend small { margin: 2px 0 0; color: var(--muted); font-size: 12px; font-weight: 400; }
  .relation-field > legend strong, .relation-field > legend small { display: block; }
  .relation-preview { margin: 7px 0 0; padding: 7px 9px; border-radius: 4px; color: var(--ink-soft); background: var(--nav-hover); font-size: 12px; overflow-wrap: anywhere; }
  .goal-choice-list { max-height: 134px; margin-top: 6px; padding: 5px; border: 1px solid var(--line); border-radius: 5px; overflow: auto; display: grid; grid-template-columns: 1fr 1fr; }
  .goal-choice { padding: 6px 7px; display: grid !important; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 8px !important; border-radius: 4px; cursor: pointer; }
  .goal-choice:hover { background: var(--nav-hover); }
  .goal-choice > span { min-width: 0; display: grid; }
  .goal-choice strong, .goal-choice small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .form-error { margin: 0; padding: 9px 11px; border-radius: 4px; color: var(--red); background: var(--red-soft); }
  .create-dialog footer { padding: 13px 20px; border-top: 1px solid var(--line); display: flex; justify-content: flex-end; gap: 8px; }
  .toast { position: fixed; left: 50%; bottom: 24px; z-index: 30; padding: 9px 14px; border-radius: 5px; color: var(--action-ink); background: var(--action); box-shadow: var(--shadow); transform: translate(-50%, 18px); opacity: 0; pointer-events: none; transition: .16s ease; }
  .toast.is-visible { transform: translate(-50%, 0); opacity: 1; }
  .toast.is-error { background: var(--red); }
  .bound-list { display: grid; gap: 7px; }
  .bound-list article { min-width: 0; display: grid; }
  .bound-list small { color: var(--muted); overflow-wrap: anywhere; }
  .full-records { margin-top: 14px; border: 1px solid var(--line); border-radius: 5px; }
  .full-records > summary { padding: 9px 12px; color: var(--muted); cursor: pointer; background: var(--page); }
  .full-records > summary span { float: right; color: var(--faint); font-size: 11px; }
  .record-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-top: 1px solid var(--line); }
  .record-grid section { min-width: 0; padding: 11px 13px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .record-grid section:nth-child(2n) { border-right: 0; }
  .record-grid section:nth-last-child(-n+2) { border-bottom: 0; }
  .record-grid h3 { margin: 0 0 6px; font-size: 13px; }
  .record-grid p { margin: 5px 0; display: grid; }
  .record-grid small { color: var(--muted); overflow-wrap: anywhere; }
  .event-ledger { padding: 14px 13px; border-top: 1px solid var(--line); }
  .event-ledger > header { margin-bottom: 10px; }
  .event-ledger h3 { margin: 0; font-size: 13px; }
  .event-ledger header p { margin: 2px 0 0; color: var(--muted); font-size: 11px; }
  .event-ledger > ol { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--line); }
  .event-ledger li { border-bottom: 1px solid var(--line); }
  .event-ledger details > summary { min-width: 0; padding: 10px 0; display: grid; grid-template-columns: 126px minmax(0, 1fr); gap: 10px; cursor: pointer; }
  .event-ledger time { color: var(--muted); font-size: 11px; }
  .event-ledger summary span { min-width: 0; display: grid; gap: 1px; }
  .event-ledger summary strong, .event-ledger summary small { overflow-wrap: anywhere; }
  .event-ledger summary small { color: var(--muted); font-size: 10px; }
  .event-ledger dl { margin: 0 0 10px; padding: 9px 10px; border: 1px solid var(--line); border-radius: 4px; background: var(--page); display: grid; gap: 5px; }
  .event-ledger dl div { min-width: 0; display: grid; grid-template-columns: 70px minmax(0, 1fr); gap: 8px; }
  .event-ledger dt { color: var(--muted); font-size: 11px; }
  .event-ledger dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
  .event-ledger pre { max-height: 300px; margin: 0 0 11px; padding: 10px; overflow: auto; border: 1px solid var(--line); border-radius: 4px; background: var(--page); color: var(--ink-soft); font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
  .event-ledger-pagination { min-height: 42px; padding-top: 10px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .event-ledger-pagination > span { color: var(--muted); font-size: 11px; }
  .event-ledger-pagination button:not(.mw-btn) { min-height: 30px; padding: 5px 10px; border: 1px solid var(--line-strong); border-radius: 5px; background: var(--panel); color: var(--text); font-weight: 400; cursor: pointer; }
  .event-ledger-pagination button:not(.mw-btn):hover { border-color: var(--line-strong); color: var(--ink); background: var(--nav-hover); }
  .event-ledger-pagination button:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
  .event-ledger-pagination button:disabled { cursor: wait; opacity: .58; }
  .event-ledger-pagination [role="alert"] { flex-basis: 100%; margin: 0; color: var(--red); font-size: 11px; }
  .event-ledger-pagination:has([role="alert"]:not([hidden])) { flex-wrap: wrap; }
  @keyframes document-in { from { opacity: .5; transform: translateY(5px); } }
  @keyframes pulse { 50% { opacity: .35; } }
`;

