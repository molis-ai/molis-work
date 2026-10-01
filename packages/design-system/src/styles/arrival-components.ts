/**
 * The arrival components (`primitives/arrival.ts`): the wordmark and its caption, short-line progress, the bar's
 * context and status blocks, the goal track, the file list, the project brief, a button's Enter key and the mixed
 * checkbox. Tokens only; motion is opacity and transform, from the shared durations and curves.
 */
export const ARRIVAL_COMPONENT_STYLES = `
  /* ───────── Wordmark and caption ───────── */
  .mw-wordmark { position: relative; display: inline-block; white-space: nowrap; font-size: 17px; font-weight: var(--weight-title, 600); letter-spacing: -.03em; line-height: 1; color: var(--ink); }
  .mw-wordmark__caret { position: absolute; left: calc(100% + .08em); bottom: .04em; width: .36em; height: .07em; border-radius: 1px; background: var(--accent); opacity: 0; }
  .mw-wordmark[data-pace="ritual"][data-state="done"] .mw-wordmark__caret { opacity: 1; background: currentColor; }
  .mw-caption { display: inline-grid; grid-template-columns: repeat(2, max-content); column-gap: .27em; padding: 2px 6px; margin: -2px -6px; border: 0; border-radius: 6px; background: none; color: var(--muted); font: inherit; font-size: 13px; letter-spacing: -.005em; text-align: left; cursor: pointer; transition: opacity var(--dur-move, 250ms) var(--ease-quint), visibility 0s var(--dur-move, 250ms); }
  .mw-caption:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, 1px); }
  .mw-caption__row { white-space: nowrap; }
  .mw-caption__ini { color: var(--ink); font-weight: var(--weight-control, 500); }
  .mw-caption[data-animated="true"] .mw-caption__l { opacity: 0; }
  .mw-caption .mw-caption__l.is-on { opacity: 1; }

  /* ───────── Short-line progress ───────── */
  .mw-steps { display: flex; align-items: center; gap: 4px; margin: 0 0 0 4px; padding: 0; list-style: none; }
  .mw-steps li { display: flex; align-items: center; padding: 12px 3px; }
  .mw-steps li > span { display: block; width: 15px; height: 3px; border-radius: 3px; background: var(--line-strong); transition: background-color var(--dur-arrive, 420ms) var(--ease-quint), transform var(--dur-arrive, 420ms) var(--ease-quint); }
  .mw-steps li.is-done > span { background: color-mix(in srgb, var(--accent) 45%, var(--desk)); }
  .mw-steps li[aria-current="step"] > span { background: var(--accent); transform: scaleX(1.6); }

  /* ───────── The bar's context and status blocks ───────── */
  .mw-bar-context { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .mw-bar-context__mark { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border-radius: 50%; color: var(--ink-soft); background: var(--rail); box-shadow: 0 0 0 1px var(--line); }
  .mw-bar-context__mark .project-monogram { width: 40px; height: 40px; border-radius: 50%; font-size: 15px; }
  .mw-bar-context__mark svg { width: 20px; height: 20px; stroke-width: 1.6; }
  .mw-bar-context__text { min-width: 0; display: grid; }
  .mw-bar-context__text strong { font-size: 13px; font-weight: var(--weight-control, 500); line-height: 18px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mw-bar-context__text small { font-size: 12px; line-height: 16px; color: var(--muted); white-space: nowrap; }
  .mw-bar-status { display: flex; align-items: center; gap: 12px; min-width: 0; height: var(--composer-h, 50px); padding: 0 4px; }
  .mw-bar-status__tile { display: grid; place-items: center; flex: none; width: 36px; height: 36px; border-radius: 10px; background: var(--rail); color: var(--ink-soft); }
  .mw-bar-status__tile svg { width: 16px; height: 16px; }
  .mw-bar-status__tile .mw-spinner { color: var(--ink); }
  .mw-bar-status__text { min-width: 0; display: grid; }
  .mw-bar-status__text strong { font-size: 13px; font-weight: var(--weight-control, 500); line-height: 18px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mw-bar-status__text small { font-size: 12px; line-height: 16px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* The Enter key a primary button names (“继续 ↵”). */
  .mw-btn__key { margin-left: 6px; font: inherit; font-size: 15px; line-height: 1; opacity: .62; }

  /* ───────── Goal track ───────── */
  .mw-goal-track { display: flex; gap: 4px; margin: 26px 0 0; padding: 0; list-style: none; }
  .mw-goal-track > li { flex: 1 1 0; min-width: 0; display: grid; gap: 8px; }
  .mw-goal-track__bar { display: block; height: 6px; border-radius: 3px; background: var(--line-strong); transform-origin: 0 50%; transition: background-color var(--dur-move, 250ms) var(--ease-quint); }
  .mw-goal-track > li[data-s="done"] .mw-goal-track__bar { background: var(--ink-soft); }
  .mw-goal-track > li[data-s="doing"] .mw-goal-track__bar { background: var(--accent); }
  .mw-goal-track__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--faint); font-size: 12px; line-height: 16px; }
  .mw-goal-track > li[data-s="done"] .mw-goal-track__name { color: var(--muted); }
  .mw-goal-track > li[data-s="doing"] .mw-goal-track__name { color: var(--ink); font-weight: var(--weight-control, 500); }
  .mw-goal-track.is-dense .mw-goal-track__name { visibility: hidden; }
  .mw-goal-track.is-dense > li[data-s="doing"] .mw-goal-track__name { visibility: visible; }

  /* ───────── File list ───────── */
  .mw-file-group + .mw-file-group { margin-top: 20px; }
  .mw-file-group__head { display: flex; align-items: center; gap: 12px; min-height: 40px; cursor: default; }
  label.mw-file-group__head { cursor: pointer; }
  .mw-file-group__head > .mw-check { margin: 0; }
  .mw-file-group__ic { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border-radius: 8px; background: var(--rail); color: var(--ink-soft); }
  .mw-file-group__ic svg { width: 16px; height: 16px; }
  .mw-file-group__text { flex: 1; min-width: 0; display: grid; }
  .mw-file-group__text strong { font-size: 13px; font-weight: var(--weight-control, 500); line-height: 18px; }
  .mw-file-group__text small { font-size: 12px; line-height: 16px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mw-file-group__count { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .mw-file-group__x { opacity: 0; transition: opacity var(--dur-hover, 130ms) var(--ease-quint); }
  .mw-file-group__head:hover .mw-file-group__x, .mw-file-group__x:focus-visible { opacity: 1; }
  .mw-file-group__note { margin: 0; padding: 4px 0 0 40px; color: var(--faint); font-size: 12px; }
  .mw-file-list { display: flex; flex-direction: column; gap: 1px; margin: 0; padding: 0 0 0 40px; list-style: none; }
  .mw-file-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 12px; min-height: 36px; padding: 2px 4px 2px 8px; margin-left: -8px; border-radius: var(--r-row, 10px); transition: background-color var(--dur-hover, 130ms) var(--ease-quint); }
  .mw-file-row:hover { background: var(--nav-hover); }
  .mw-file-row__label { display: flex; align-items: center; gap: 10px; min-width: 0; cursor: inherit; }
  label.mw-file-row__label { cursor: pointer; }
  .mw-file-row__label > .mw-check { margin: 0; }
  .mw-file-row__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: var(--ink); }
  .mw-file-row__name.is-off { color: var(--muted); }
  .mw-file-row__size, .mw-file-row__state { color: var(--faint); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .mw-file-row__x { opacity: 0; transition: opacity var(--dur-hover, 130ms) var(--ease-quint); }
  .mw-file-row:hover .mw-file-row__x, .mw-file-row__x:focus-visible { opacity: 1; }
  .mw-file-row.is-todo { grid-template-columns: minmax(0, 1fr) auto; }
  .mw-file-list.is-receipts { padding-left: 0; margin-top: 12px; }
  .mw-file-kind { display: inline-grid; place-items: center; flex: none; min-width: 34px; height: 18px; padding: 0 5px; border-radius: 5px; font-size: 11px; font-weight: var(--weight-title, 600); letter-spacing: .02em; background: color-mix(in srgb, var(--mark-text, var(--ink-soft)) 12%, transparent); color: var(--mark-text, var(--ink-soft)); }
  .mw-file-kind--pdf { background: color-mix(in srgb, var(--mark-pdf, var(--red)) 12%, transparent); color: var(--mark-pdf, var(--red)); }
  .mw-file-kind--doc, .mw-file-kind--docx { background: color-mix(in srgb, var(--mark-link, var(--accent)) 12%, transparent); color: var(--mark-link, var(--accent)); }
  .mw-file-group .mw-status { font-size: 12px; }

  /* The checkbox's mixed state: only some of a group's files are chosen. */
  .mw-check:indeterminate, .mw-check[data-mixed] { border-color: var(--action); background: var(--action); }
  .mw-check:indeterminate::after, .mw-check[data-mixed]::after { content: ""; width: 8px; height: 2px; border-radius: 1px; background: var(--action-ink); }

  /* ───────── Brief ───────── */
  .mw-brief { box-sizing: border-box; width: min(100%, 860px); margin: 0 auto; padding: clamp(32px, 8vh, 84px) clamp(24px, 4vw, 56px) 48px; display: flex; flex-direction: column; }
  .mw-brief__kicker { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; margin: 0; color: var(--muted); font-size: 12px; }
  .mw-brief__kicker > span:not(.mw-status) { position: relative; }
  .mw-brief__kicker > span:not(.mw-status):not(:first-child)::before, .mw-brief__kicker > .mw-status + span::before { content: ""; position: absolute; left: -8px; top: 50%; width: 2px; height: 2px; margin-top: -1px; border-radius: 50%; background: var(--faint); }
  .mw-brief__title { margin: 14px 0 0; font-size: 30px; font-weight: var(--weight-title, 600); line-height: 1.25; letter-spacing: -.03em; color: var(--ink); text-wrap: balance; overflow-wrap: anywhere; }
  .mw-brief__desc { margin: 14px 0 0; max-width: 38em; color: var(--ink-soft); font-size: 15px; line-height: 1.75; text-wrap: pretty; }
  .mw-brief__desc.is-missing { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; color: var(--muted); }
  .mw-brief__desc.is-missing svg { flex: none; width: 14px; height: 14px; margin-top: 4px; }
  .mw-brief__focus { position: relative; isolation: isolate; overflow: hidden; margin-top: 36px; padding: 22px 28px 28px; border-radius: var(--r-sheet, 14px); background: var(--surface-soft); }
  .mw-brief__focus::before { content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none; background: radial-gradient(ellipse at 96% 4%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 75%); }
  .mw-brief__focus > header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; font-size: 12px; }
  .mw-brief__focus-label { display: inline-flex; align-items: center; gap: 8px; color: var(--accent); font-weight: var(--weight-control, 500); }
  .mw-brief__focus-label::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .mw-brief__focus-count { color: var(--muted); font-variant-numeric: tabular-nums; }
  .mw-brief__focus-count b { color: var(--ink); font-weight: var(--weight-title, 600); font-size: 15px; margin-right: 1px; }
  .mw-brief__focus h2 { margin: 12px 0 0; font-size: 20px; font-weight: var(--weight-title, 600); line-height: 1.35; letter-spacing: -.025em; text-wrap: balance; }
  .mw-brief__focus > p { margin: 6px 0 0; max-width: 40em; color: var(--ink-soft); font-size: 13px; line-height: 1.8; }
  .mw-brief__focus.is-empty { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding-block: 18px; }
  .mw-brief__focus.is-empty::before { display: none; }
  .mw-brief__focus.is-empty h2 { margin: 0; font-size: 15px; }
  .mw-brief__focus.is-empty p { margin: 2px 0 0; color: var(--muted); font-size: 13px; line-height: 1.8; }
  .mw-brief__cols { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: clamp(24px, 4vw, 56px); margin-top: 44px; }
  .mw-brief__sec > h2 { margin: 0 0 10px; font-size: 15px; font-weight: var(--weight-title, 600); letter-spacing: -.02em; }
  .mw-brief__list { display: flex; flex-direction: column; gap: 1px; margin: 0 -8px; }
  .mw-brief__list .mw-dir-row--meta { height: auto; min-height: 48px; padding-block: 7px; border-radius: var(--r-row, 10px); }
  .mw-brief__list .mw-dir-row--meta .mw-dir-row__copy { grid-template-rows: 18px 16px; row-gap: 1px; }
  .mw-brief__quiet { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.7; }
  .mw-brief__hint { margin: 0 0 6px; color: var(--muted); font-size: 12px; line-height: 1.6; }
  .mw-brief__recent { margin: 0; padding: 0; list-style: none; }
  .mw-brief__recent li { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 13px; line-height: 1.5; }
  .mw-brief__recent li:last-child { border-bottom: 0; }
  .mw-brief__recent time { color: var(--faint); font-size: 12px; font-variant-numeric: tabular-nums; padding-top: 1px; }
  .mw-brief__facts { display: flex; flex-wrap: wrap; gap: 4px 20px; margin: 44px 0 0; padding-top: 16px; border-top: 1px solid var(--line); color: var(--faint); font-size: 12px; }
  .mw-brief__sec .mw-file-list { padding-left: 0; }
  .mw-brief__sec .mw-file-row { margin-left: -8px; padding-left: 8px; }
  .mw-brief__sec .mw-collapsible { margin-top: 8px; font-size: 13px; }
  /* Specimens on the component board. */
  .mw-arrival-demo { display: flex; align-items: center; gap: 24px; }
  .mw-arrival-demo .mw-wordmark { font-size: 30px; }
  .mw-arrival-bar-strip { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 32px; padding: 12px 16px; border-radius: var(--r-sheet, 14px); background: var(--desk); }
  .mw-arrival-wide { width: min(100%, 720px); }
  .mw-arrival-brief { width: 100%; max-height: 560px; overflow: auto; border-radius: var(--r-sheet, 14px); background: var(--paper); box-shadow: var(--sheet-shadow); }
  .mw-arrival-brief .mw-brief { padding-block: 32px; }
  @media (max-width: 980px) { .mw-brief__cols { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 600px) { .mw-brief { padding-inline: 20px; } }
`;
