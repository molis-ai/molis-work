import { SHELL, ASSIST } from "./craft-finish-selectors.js";

/** The finish layer, second part: the resident Assistant panel (overview, steps, materials, the conversation, its choosers) up to the phone bar. */
export const CRAFT_ASSISTANT_STYLES = `  /* 概况: the state, what it is doing now, where it belongs, who carries it, and what can be done to it now. */
  ${ASSIST} .assistant-summary { display: flex; flex-direction: column; gap: 2px; }
  ${ASSIST} .assistant-summary-state { margin: 0; }
  ${ASSIST} .assistant-summary-state:has(.assistant-state:empty) { display: none; }
  ${ASSIST} .assistant-summary-title { margin: 0; color: var(--ink); font-size: 15px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
  ${ASSIST} .assistant-summary-now { margin: 2px 0 0; color: var(--ink-soft); overflow-wrap: anywhere; }
  ${ASSIST} .assistant-summary-now[hidden] { display: none; }
  ${ASSIST} .assistant-summary-meta { display: grid; grid-template-columns: max-content minmax(0, 1fr); align-items: center; gap: 6px 10px; margin: 10px 0 0; }
  ${ASSIST} .assistant-summary-meta:empty { display: none; }
  ${ASSIST} .assistant-summary-meta dt { color: var(--muted); }
  ${ASSIST} .assistant-summary-meta dd { margin: 0; min-width: 0; color: var(--ink); overflow-wrap: anywhere; }
  ${ASSIST} .assistant-summary-top { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-height: 22px; margin-bottom: 2px; }
  ${ASSIST} .assistant-summary-top:not(:has(.assistant-state:not(:empty), .assistant-control:not([hidden]))) { display: none; }
  ${ASSIST} .assistant-summary-controls { display: flex; flex-wrap: wrap; gap: 2px; margin-left: auto; }
  ${ASSIST} .assistant-control { height: 22px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: var(--ink-soft); font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer;
    transition: background-color var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint), transform var(--dur-press) var(--ease-spring); }
  ${ASSIST} .assistant-control[hidden] { display: none; }
  ${ASSIST} .assistant-control:hover { background: var(--nav-hover); color: var(--ink); }
  ${ASSIST} .assistant-control--stop:hover { color: var(--danger); }
  ${ASSIST} .assistant-control[data-assistant-control="resume"] { background: var(--ink); color: var(--paper); }
  ${ASSIST} .assistant-control:focus-visible { outline: var(--focus-stroke); outline-offset: 1px; }
  /* The work's state retains its label beside the shared ring. */
  ${ASSIST} :is(.assistant-summary, .assistant-strip) .assistant-state { display: inline-flex; align-items: center; gap: 6px; padding: 1px 8px 1px 7px; border-radius: 999px; background: var(--wash); color: var(--ink-soft); font-size: 11px; line-height: 18px; white-space: nowrap; }
  ${ASSIST} :is(.assistant-summary, .assistant-strip) .assistant-state:is([data-state="waiting-input"], [data-state="waiting-review"], [data-state="needs-check"]) { background: color-mix(in srgb, var(--tone-attention, #c27c0e) 13%, transparent); color: var(--ink); }
  /* One row of equal parts, however many choices: five Coding modes fit the side pane without wrapping. */
  ${ASSIST} .assistant-segmented { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 2px; padding: 2px; border-radius: 8px; background: var(--wash); }
  ${ASSIST} .assistant-segment { min-width: 0; height: 24px; padding: 0 4px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
  ${ASSIST} .assistant-segment:hover:not(:disabled) { color: var(--ink); }
  ${ASSIST} .assistant-segment[aria-pressed="true"] { background: var(--paper); color: var(--ink); box-shadow: 0 0 0 1px var(--line); }
  ${ASSIST} .assistant-segment:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-summary-meta .mw-select-picker { width: 100%; min-width: 0; }
  ${ASSIST} .assistant-summary-meta :is(select.mw-select, .mw-select-picker__trigger) { width: 100%; min-width: 0; height: 28px; min-height: 28px; font-size: 12px; }
  /* 路径 · 材料 · 成果: each a heading, small groups, and one line per thing with what can be done to it. */
  ${ASSIST} .assistant-block[hidden] { display: none; }
  ${ASSIST} .assistant-block-head { display: flex; align-items: center; gap: 6px; width: 100%; margin: 0; padding: 12px 0 4px; border: 0; border-radius: 0; background: transparent; box-shadow: inset 0 1px 0 var(--line); color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  ${ASSIST} .assistant-block-head:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; }
  ${ASSIST} .assistant-block-chevron { flex: none; display: inline-grid; place-items: center; width: 12px; height: 12px; color: var(--muted); }
  ${ASSIST} .assistant-block-chevron::before { content: "›"; font-size: 13px; line-height: 1; transform: rotate(90deg); transition: transform var(--dur-move) var(--ease-quint); }
  ${ASSIST} .assistant-block-head[aria-expanded="false"] .assistant-block-chevron::before { transform: none; }
  ${ASSIST} .assistant-block-head:hover .assistant-block-chevron { color: var(--ink); }
  ${ASSIST} .assistant-block:not([hidden], .assistant-block--usage) { /* opens and folds to its natural height (VUX-08, VUX-22): the body is a 0fr→1fr row; folded, out of reach */ display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto 1fr; transition: grid-template-rows var(--dur-move) var(--ease-quint); }
  ${ASSIST} .assistant-block[data-folded] { grid-template-rows: auto 0fr; }
  ${ASSIST} .assistant-block[data-folded] .assistant-block-body { visibility: hidden; transition: visibility 0s var(--dur-move); }
  ${ASSIST} .assistant-block-title { color: var(--ink); font-size: 12px; font-weight: 600; }
  ${ASSIST} .assistant-block-sub { margin: 8px 0 2px; color: var(--faint); font-size: 11px; }
  /* The name opens what it names, and its target is the whole row; the row's own actions sit above it. */
  ${ASSIST} .assistant-side-action { flex: none; height: 22px; padding: 0 6px; border: 0; border-radius: 5px; background: transparent; color: var(--accent, var(--ink)); font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer; }
  ${ASSIST} .assistant-side-action:hover:not(:disabled) { background: var(--nav-active); }
  ${ASSIST} .assistant-side-action { transition: background-color var(--dur-hover) var(--ease-quint), opacity var(--dur-hover) var(--ease-quint), transform var(--dur-press) var(--ease-spring); }
  ${ASSIST} .assistant-side-action[aria-busy="true"] { color: var(--muted); cursor: progress; }
  /* Stop, take back and cancel wait for the pointer or keyboard to reach the row; touch screens always show them. */
  ${ASSIST} .assistant-side-action.is-quiet { opacity: 0; }
  ${ASSIST} :is(.assistant-item, .assistant-subtask):is(:hover, :focus-within) .assistant-side-action.is-quiet { opacity: 1; }
  @media (hover: none) { ${ASSIST} .assistant-side-action.is-quiet { opacity: 1; } }
  ${ASSIST} .assistant-side-action:disabled { color: var(--muted); cursor: default; }
  ${ASSIST} .assistant-side-action:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-block--usage[hidden] { display: none; }
  ${ASSIST} .assistant-usage > summary { display: flex; align-items: center; gap: 6px; padding-top: 12px; box-shadow: inset 0 1px 0 var(--line); color: var(--muted); list-style: none; cursor: pointer; }
  ${ASSIST} .assistant-usage > summary::-webkit-details-marker { display: none; }
  ${ASSIST} .assistant-usage > summary::before { content: "›"; display: inline-grid; place-items: center; width: 12px; font-size: 13px; line-height: 1; transition: transform var(--dur-move) var(--ease-quint); }
  ${ASSIST} .assistant-usage[open] > summary::before { transform: rotate(90deg); }
  ${ASSIST} .assistant-usage > summary:hover { color: var(--ink); }
  ${ASSIST} .assistant-usage > summary:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; }
  ${ASSIST} .assistant-usage-form { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 0 2px; }
  ${ASSIST} .assistant-usage-input { width: 9em; min-width: 0; padding: 3px 6px; border: 1px solid var(--line); border-radius: 5px; background: var(--surface, transparent); color: var(--ink); font: inherit; font-size: 12px; }
  ${ASSIST} .assistant-round-executor { margin: 0 0 4px; font-size: 11px; color: var(--muted); }
  /* With the panel open, its tab says where the next message goes; with the side pane shown, it lists what goes with it and who carries it. */
  ${ASSIST} [data-assistant-island]:has(> .assistant-panel:not([hidden])) .assistant-target { display: none; }
  ${ASSIST} [data-assistant-island][data-side-shown] :is([data-assistant-executor], [data-assistant-character], [data-assistant-mode]) { display: none; }
  /* The side pane speaks in shapes, not only lines: the overview is a card toned by the state; what waits on you are
     cards with their buttons; the path is a line with markers; materials drop into a zone and sit as tiles; results are
     cards you open or take back. Colour only says state: amber waits on you, green is done, copper is a suggestion. */
  ${ASSIST} .assistant-summary { padding: 12px; border-radius: 12px; background: var(--wash); transition: background-color var(--dur-move) var(--ease-quint); }
  ${ASSIST} .assistant-summary[data-tone="waiting"] { background: color-mix(in srgb, var(--tone-attention, #c27c0e) 11%, var(--paper)); }
  ${ASSIST} .assistant-summary[data-tone="running"] { background: color-mix(in srgb, var(--tone-done, #3a8f5c) 8%, var(--paper)); }
  ${ASSIST} .assistant-summary[data-tone="failed"] { background: color-mix(in srgb, var(--tone-blocked, #c53030) 8%, var(--paper)); }
  ${ASSIST} :is(.assistant-summary, .assistant-strip) .assistant-state { background: var(--paper); }
  ${ASSIST} .assistant-summary .assistant-summary-meta { margin-top: 12px; padding-top: 10px; box-shadow: inset 0 1px 0 color-mix(in srgb, var(--ink) 8%, transparent); }
  ${ASSIST} .assistant-glyph-icon { display: inline-grid; place-items: center; flex: none; }
  ${ASSIST} .assistant-glyph-icon svg { width: 15px; height: 15px; }
  ${ASSIST} .assistant-glyph { flex: none; display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; background: var(--wash); color: var(--ink-soft); }
  ${ASSIST} .assistant-glyph.is-attention { background: color-mix(in srgb, var(--tone-attention, #c27c0e) 15%, transparent); color: var(--tone-attention, #c27c0e); }
  ${ASSIST} .assistant-glyph.is-done { background: color-mix(in srgb, var(--tone-done, #3a8f5c) 14%, transparent); color: var(--tone-done, #3a8f5c); }
  ${ASSIST} .assistant-glyph.is-suggest { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
  ${ASSIST} .assistant-glyph.is-blocked { background: color-mix(in srgb, var(--tone-blocked, #c53030) 12%, transparent); color: var(--tone-blocked, #c53030); }
  ${ASSIST} .assistant-state-ring { display: inline-flex; width: 20px; height: 20px; flex: none; }
  /* Block headings carry a glyph and a badge; the one that waits on you does not fold. */
  ${ASSIST} .assistant-block-head .assistant-glyph-icon { color: var(--muted); }
  ${ASSIST} .assistant-block-head.is-fixed { cursor: default; }
  ${ASSIST} .assistant-block-head.is-fixed .assistant-glyph-icon { color: var(--tone-attention, #c27c0e); }
  ${ASSIST} .assistant-block-badge { margin-left: auto; padding: 0 8px; border-radius: 999px; background: var(--wash); color: var(--muted); font-size: 11px; font-weight: 400; line-height: 18px; white-space: nowrap; }
  ${ASSIST} .assistant-block-badge.is-attention { background: color-mix(in srgb, var(--tone-attention, #c27c0e) 15%, transparent); color: var(--tone-attention, #c27c0e); }
  ${ASSIST} .assistant-block--attention .assistant-block-head { box-shadow: none; padding-top: 2px; }
  ${ASSIST} .assistant-block-body { min-height: 0; overflow: clip; overflow-clip-margin: 6px; } ${ASSIST} .assistant-block-body::before { /* the space under the head is content, so the row clips it as it folds; nothing but the row moves */ content: ""; display: block; height: 6px; }
  ${ASSIST} .assistant-group-list { display: flex; flex-direction: column; gap: 10px; }
  ${ASSIST} .assistant-group > .assistant-block-sub { margin: 0 0 6px; }
  /* Cards: glyph, title and one line; the title opens it and the whole card is its target; actions sit above that. */
  ${ASSIST} .assistant-stack { display: flex; flex-direction: column; gap: 6px; }
  ${ASSIST} .assistant-item { position: relative; display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 10px; background: var(--paper); box-shadow: 0 0 0 1px var(--line);
    transition: background-color var(--dur-hover) var(--ease-quint), box-shadow var(--dur-hover) var(--ease-quint); }
  ${ASSIST} .assistant-item.is-openable:hover { background: var(--nav-hover); box-shadow: 0 0 0 1px var(--line-strong); }
  ${ASSIST} .assistant-item.is-openable:active { background: var(--nav-active); }
  ${ASSIST} .assistant-item-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  ${ASSIST} .assistant-item-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); font-size: 12px; font-weight: 500; line-height: 1.45; }
  ${ASSIST} button.assistant-item-title { padding: 0; border: 0; background: transparent; font: inherit; font-size: 12px; font-weight: 500; text-align: left; cursor: pointer; }
  ${ASSIST} button.assistant-item-title::after { content: ""; position: absolute; inset: 0; border-radius: inherit; }
  ${ASSIST} button.assistant-item-title:focus-visible { outline: none; }
  ${ASSIST} :is(.assistant-item, .assistant-tile):has(> button.assistant-item-title:focus-visible, .assistant-item-text > button.assistant-item-title:focus-visible) { outline: var(--focus-stroke); outline-offset: 1px; }
  /* A result that can be picked up (W3-A3b): the card picks it, only its title opens it; picked, it is in hand. */
  ${ASSIST} .assistant-item[role="group"] { cursor: pointer; }
  ${ASSIST} .assistant-item[role="group"] button.assistant-item-title::after { content: none; }
  ${ASSIST} .assistant-item[role="group"] button.assistant-item-title:hover { text-decoration: underline; }
  ${ASSIST} .assistant-item[role="group"]:focus-visible { outline: var(--focus-stroke); outline-offset: 1px; }
  ${ASSIST} .assistant-item[aria-current="true"] { background: var(--accent-soft); box-shadow: 0 0 0 1px var(--accent); }
  ${ASSIST} .assistant-item-sub { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 11px; }
  ${ASSIST} .assistant-item-sub.is-attention { color: var(--tone-attention, #b7791f); }
  ${ASSIST} .assistant-item-sub.is-blocked { color: var(--tone-blocked, var(--danger)); }
  ${ASSIST} .assistant-item-actions { position: relative; z-index: 1; flex: none; display: flex; align-items: center; gap: 4px; }
  ${ASSIST} .assistant-item.is-done .assistant-item-title { color: var(--muted); font-weight: 400; text-decoration: line-through; }
  ${ASSIST} .assistant-item.is-done .assistant-glyph { opacity: .6; }
  /* A card that waits on you: its words wrap, its buttons sit under them, and its edge is amber. */
  ${ASSIST} .assistant-item--ask { flex-wrap: wrap; align-items: flex-start; box-shadow: 0 0 0 1px color-mix(in srgb, var(--tone-attention, #c27c0e) 38%, var(--line)); }
  ${ASSIST} .assistant-item--ask:has(.assistant-glyph.is-suggest) { box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 32%, var(--line)); }
  ${ASSIST} .assistant-item--ask :is(.assistant-item-title, .assistant-item-sub) { white-space: normal; overflow-wrap: anywhere; }
  ${ASSIST} .assistant-item--ask .assistant-item-actions { flex-basis: 100%; padding-left: 38px; }
  /* Buttons on cards: primary is graphite, secondary a quiet outline, both with the shared press. */
  ${ASSIST} .assistant-side-action { display: inline-flex; align-items: center; gap: 4px; }
  ${ASSIST} .assistant-side-action .assistant-glyph-icon svg { width: 13px; height: 13px; }
  ${ASSIST} .assistant-side-action:is(.is-primary, .is-secondary) { height: 26px; padding: 0 10px; border-radius: 8px; font-size: 12px; }
  ${ASSIST} .assistant-side-action.is-primary { background: var(--ink); color: var(--paper); }
  ${ASSIST} .assistant-side-action.is-primary:hover:not(:disabled) { background: color-mix(in srgb, var(--ink) 86%, var(--paper)); }
  ${ASSIST} .assistant-side-action.is-secondary { background: var(--paper); color: var(--ink); box-shadow: 0 0 0 1px var(--line-strong); }
  ${ASSIST} .assistant-side-action.is-secondary:hover:not(:disabled) { background: var(--nav-hover); }
  /* 路径: a vertical line; each step a marker on it — a glyph, or how many sub-tasks are done. */
  ${ASSIST} .assistant-timeline { position: relative; display: flex; flex-direction: column; gap: 14px; margin: 0; padding: 0 0 0 28px; list-style: none; }
  ${ASSIST} .assistant-timeline::before { content: ""; position: absolute; left: 10px; top: 12px; bottom: 12px; width: 1.5px; border-radius: 1px; background: var(--line-strong); }
  ${ASSIST} .assistant-step { position: relative; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  ${ASSIST} .assistant-step-marker { position: absolute; left: -28px; top: -1px; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--paper);
    box-shadow: 0 0 0 1.5px var(--line-strong); color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
  ${ASSIST} .assistant-step-marker .assistant-glyph-icon svg { width: 12px; height: 12px; }
  ${ASSIST} .assistant-step-marker.is-attention { box-shadow: 0 0 0 1.5px var(--tone-attention, #c27c0e); color: var(--tone-attention, #c27c0e); }
  ${ASSIST} .assistant-step-marker.is-done { background: var(--tone-done, #3a8f5c); box-shadow: none; color: var(--paper); }
  ${ASSIST} .assistant-step-marker.is-later { box-shadow: none; outline: 1.5px dashed var(--line-strong); outline-offset: -1.5px; }
  ${ASSIST} .assistant-step-label { margin: 2px 0 0; color: var(--muted); font-size: 11px; line-height: 18px; }
  ${ASSIST} .assistant-progress { display: block; height: 4px; border-radius: 2px; background: var(--wash); overflow: hidden; }
  ${ASSIST} .assistant-progress > span { display: block; height: 100%; border-radius: inherit; background: var(--tone-done, #3a8f5c); }
  ${ASSIST} .assistant-subtask { position: relative; display: flex; align-items: center; gap: 8px; min-height: 28px; margin: 0 -6px; padding: 2px 6px; border-radius: 8px; transition: background-color var(--dur-hover) var(--ease-quint); }
  ${ASSIST} .assistant-subtask:hover { background: var(--nav-hover); }
  ${ASSIST} .assistant-subtask.is-attention { background: color-mix(in srgb, var(--tone-attention, #c27c0e) 9%, transparent); }
  ${ASSIST} .assistant-subtask-mark { flex: none; display: inline-grid; place-items: center; width: 16px; color: var(--muted); }
  ${ASSIST} .assistant-subtask-mark.is-done { color: var(--tone-done, #3a8f5c); }
  ${ASSIST} .assistant-subtask-mark.is-attention { color: var(--tone-attention, #c27c0e); }
  ${ASSIST} .assistant-subtask-mark.is-blocked { color: var(--tone-blocked, #c53030); }
  ${ASSIST} .assistant-subtask-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0; border: 0; background: transparent; color: var(--ink); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
  ${ASSIST} .assistant-subtask-name::after { content: ""; position: absolute; inset: 0; border-radius: inherit; }
  ${ASSIST} .assistant-subtask-name:focus-visible { outline: none; }
  ${ASSIST} .assistant-subtask:has(> .assistant-subtask-name:focus-visible) { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-subtask-state { flex: none; color: var(--muted); font-size: 11px; }
  ${ASSIST} .assistant-subtask.is-attention .assistant-subtask-state { color: var(--tone-attention, #b7791f); }
  ${ASSIST} .assistant-subtask .assistant-side-action { position: relative; z-index: 1; }
  /* 步骤: a checklist on the path; the step in hand reads stronger, one set aside is struck through. */
  ${ASSIST} span.assistant-subtask-name { cursor: default; }
  ${ASSIST} .assistant-step-item:not(.is-attention):hover { background: transparent; }
  ${ASSIST} .assistant-step-item.is-current .assistant-subtask-name { font-weight: 500; }
  ${ASSIST} .assistant-step-item.is-abandoned .assistant-subtask-name { color: var(--muted); text-decoration: line-through; }
  ${ASSIST} .assistant-step-item .assistant-subtask-mark.is-done + .assistant-subtask-name { color: var(--ink-soft); }
  /* The memories an answer was given, folded under it like its steps. */
  ${ASSIST} .assistant-memory { display: flex; align-items: baseline; gap: 6px; }
  ${ASSIST} .assistant-memory-scope { flex: none; padding: 0 5px; border-radius: 5px; box-shadow: 0 0 0 1px var(--line); color: var(--muted); font-size: 11px; line-height: 17px; }
  ${ASSIST} .assistant-memory-omitted { margin: 6px 0 0 12px; color: var(--faint); font-size: 11px; }
  ${ASSIST} .assistant-subtask:is(:hover, :focus-within) .assistant-side-action.is-quiet { opacity: 1; }
  /* 材料: the next Send's things in a zone files can be dropped on; what was used, as tiles two to a row. */
  ${ASSIST} .assistant-drop { display: flex; flex-direction: column; gap: 8px; padding: 10px; border: 1px dashed var(--line-strong); border-radius: 10px;
    transition: border-color var(--dur-hover) var(--ease-quint), background-color var(--dur-hover) var(--ease-quint); }
  ${ASSIST} .assistant-drop[data-dropping] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 7%, transparent); }
  ${ASSIST} .assistant-drop-label { margin: 0; color: var(--faint); font-size: 11px; }
  ${ASSIST} .assistant-drop-hint { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 11px; }
  ${ASSIST} .assistant-drop-hint > span:not(.assistant-glyph-icon) { flex: 1; min-width: 0; }
  ${ASSIST} .assistant-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  ${ASSIST} .assistant-tile { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-width: 0; padding: 8px; border-radius: 10px; box-shadow: 0 0 0 1px var(--line);
    transition: background-color var(--dur-hover) var(--ease-quint); }
  ${ASSIST} .assistant-tile > :is(.assistant-item-title, .assistant-item-sub) { max-width: 100%; }
  ${ASSIST} .assistant-tile.is-openable:hover { background: var(--nav-hover); }
  ${ASSIST} .assistant-tile.is-attention { box-shadow: 0 0 0 1px color-mix(in srgb, var(--tone-attention, #c27c0e) 38%, var(--line)); }
  /* The conversation reads like a document: headings, lists (nested, checklists), tables, quotes, rules and links from
     Markdown, code with its language, length, colours and a copy button. Nothing a model wrote becomes markup. */
  ${ASSIST} .assistant-rich :is(h3, h4, h5) { margin: 14px 0 6px; color: var(--ink); line-height: 1.4; }
  ${ASSIST} .assistant-rich > :first-child { margin-top: 0; }
  ${ASSIST} .assistant-rich h3 { font-size: 15px; font-weight: 600; }
  ${ASSIST} .assistant-rich h4 { font-size: 13px; font-weight: 600; }
  ${ASSIST} .assistant-rich h5 { font-size: 13px; font-weight: 500; color: var(--ink-soft); }
  ${ASSIST} .assistant-rich :is(ul, ol) :is(ul, ol) { margin: 2px 0 2px; }
  ${ASSIST} .assistant-rich li + li { margin-top: 2px; }
  ${ASSIST} .assistant-rich li::marker { color: var(--muted); }
  ${ASSIST} .assistant-rich .assistant-task { position: relative; list-style: none; margin-left: -18px; padding-left: 20px; }
  ${ASSIST} .assistant-task-box { position: absolute; left: 0; top: 0.36em; width: 12px; height: 12px; border-radius: 3px; box-shadow: inset 0 0 0 1.5px var(--line-strong); }
  ${ASSIST} .assistant-task.is-done { color: var(--muted); }
  ${ASSIST} .assistant-task.is-done .assistant-task-box { background: var(--tone-done, #3a8f5c); box-shadow: none; }
  ${ASSIST} .assistant-task.is-done .assistant-task-box::after { content: ""; position: absolute; left: 4px; top: 1.5px; width: 3px; height: 6px; border: solid var(--paper); border-width: 0 1.5px 1.5px 0; transform: rotate(45deg); }
  ${ASSIST} .assistant-task > ul, ${ASSIST} .assistant-task > ol { color: var(--ink); }
  ${ASSIST} .assistant-rich blockquote { margin: 0 0 8px; padding: 6px 12px; border-radius: 8px; background: var(--wash); color: var(--ink-soft); }
  ${ASSIST} .assistant-rich blockquote > :last-child { margin-bottom: 0; }
  ${ASSIST} .assistant-rich hr { height: 1px; margin: 12px 0; border: 0; background: var(--line); }
  ${ASSIST} .assistant-rich s { color: var(--muted); }
  ${ASSIST} .assistant-link { color: var(--accent); text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--accent) 40%, transparent); text-underline-offset: 2px; overflow-wrap: anywhere; }
  ${ASSIST} .assistant-link:hover { text-decoration-color: currentColor; }
  ${ASSIST} .assistant-inline-object { display: inline-flex; align-items: center; gap: 4px; margin: 0 1px; padding: 0 6px; border: 0; border-radius: 6px; background: var(--wash); color: var(--ink); font: inherit;
    line-height: 1.5; vertical-align: baseline; cursor: pointer; transition: background-color var(--dur-hover) var(--ease-quint); }
  ${ASSIST} .assistant-inline-object:hover { background: var(--nav-active); }
  ${ASSIST} .assistant-inline-object:focus-visible { outline: var(--focus-stroke); outline-offset: 1px; }
  ${ASSIST} .assistant-inline-object svg { width: 13px; height: 13px; color: var(--muted); }
  ${ASSIST} .assistant-table { max-width: 100%; margin: 0 0 10px; overflow-x: auto; border-radius: 8px; box-shadow: 0 0 0 1px var(--line); }
  ${ASSIST} .assistant-table table { width: 100%; border-collapse: collapse; font-size: 12px; }
  ${ASSIST} .assistant-table :is(th, td) { padding: 6px 10px; text-align: left; vertical-align: top; box-shadow: inset 0 -1px 0 var(--line); }
  ${ASSIST} .assistant-table th { background: var(--wash); color: var(--ink); font-weight: 600; white-space: nowrap; }
  ${ASSIST} .assistant-table tr:last-child td { box-shadow: none; }
  ${ASSIST} .assistant-code { position: relative; margin: 0 0 10px; overflow: hidden; border-radius: 10px; box-shadow: 0 0 0 1px var(--line); background: var(--wash); }
  ${ASSIST} .assistant-code-head { display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 6px 0 12px; box-shadow: inset 0 -1px 0 var(--line); color: var(--muted); font-size: 11px; }
  ${ASSIST} .assistant-code-lang { color: var(--ink-soft); font-weight: 500; }
  ${ASSIST} .assistant-code-lines { margin-right: auto; }
  ${ASSIST} .assistant-code-copy, ${ASSIST} .assistant-code-more { height: 22px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font: inherit; font-size: 11px; cursor: pointer;
    transition: background-color var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint), transform var(--dur-press) var(--ease-spring); }
  ${ASSIST} :is(.assistant-code-copy, .assistant-code-more):hover { background: var(--nav-hover); color: var(--ink); }
  ${ASSIST} .assistant-code-copy[data-copy=done] { color: var(--tone-done, #3a8f5c); }
  ${ASSIST} .assistant-rich .assistant-code pre, ${ASSIST} .assistant-code pre { margin: 0; padding: 10px 12px; border-radius: 0; background: transparent; overflow: auto; font-size: 12px; line-height: 1.55; tab-size: var(--code-tab, 4); }
  ${ASSIST} .assistant-code[data-folded] pre { max-height: 300px; overflow: hidden; }
  ${ASSIST} .assistant-code-more { display: block; width: 100%; height: 28px; border-radius: 0; box-shadow: inset 0 1px 0 var(--line); }
  /* Cards: one shape for every moment that asks something of you — a kicker saying what kind, a badge saying what act,
     the title, the body, the buttons, and a line on what happens when you press them. */
  ${ASSIST} .assistant-card { gap: 10px; padding: 12px 14px; border-radius: 12px; background: var(--paper); }
  ${ASSIST} .assistant-card-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
  ${ASSIST} .assistant-card-kicker { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 11px; font-weight: 500; }
  ${ASSIST} .assistant-card-kicker .assistant-glyph-icon svg { width: 14px; height: 14px; }
  ${ASSIST} .assistant-card-kicker.is-attention { color: var(--tone-attention, #b7791f); }
  ${ASSIST} .assistant-card-kicker.is-blocked { color: var(--tone-blocked, var(--danger)); }
  ${ASSIST} .assistant-card-badge { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; padding: 0 8px; border-radius: 999px; background: var(--wash); color: var(--ink-soft); font-size: 11px; line-height: 20px; white-space: nowrap; }
  ${ASSIST} .assistant-card-badge .assistant-glyph-icon svg { width: 12px; height: 12px; }
  ${ASSIST} .assistant-card .assistant-card-title { color: var(--ink); font-size: 13px; font-weight: 600; line-height: 1.45; }
  ${ASSIST} .assistant-card-hint { margin: -2px 0 0; color: var(--faint); font-size: 11px; }
  ${ASSIST} .assistant-card:has(.assistant-card-kicker.is-attention) { box-shadow: 0 0 0 1px color-mix(in srgb, var(--tone-attention, #c27c0e) 40%, var(--line)); }
  ${ASSIST} .assistant-field-label { margin: 0 0 4px; color: var(--muted); font-size: 11px; }
  ${ASSIST} .assistant-field-code .assistant-code { margin: 0; }
  ${ASSIST} .assistant-problem .assistant-card-kicker { margin-bottom: -2px; }
  /* What a message carried: chips with their kind; an object opens where it lives. */
  ${ASSIST} .assistant-attachments { align-self: flex-end; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; max-width: 85%; margin-top: -4px; }
  ${ASSIST} .assistant-attachment { display: inline-flex; align-items: center; gap: 5px; max-width: 220px; height: 24px; padding: 0 8px; border: 0; border-radius: 7px; background: var(--wash); color: var(--ink-soft); font: inherit; font-size: 11px; }
  ${ASSIST} button.assistant-attachment { cursor: pointer; transition: background-color var(--dur-hover) var(--ease-quint); }
  ${ASSIST} button.assistant-attachment:hover { background: var(--nav-active); color: var(--ink); }
  ${ASSIST} .assistant-attachment .assistant-glyph-icon svg { width: 13px; height: 13px; }
  ${ASSIST} .assistant-attachment-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ${ASSIST} .assistant-attachment.is-draft { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tone-attention, #c27c0e) 40%, transparent); }
  ${ASSIST} .assistant-attachment.is-expired { color: var(--muted); text-decoration: line-through; text-decoration-color: color-mix(in srgb, currentColor 50%, transparent); }
  /* Each step of the process with the glyph of what it did; one still running turns. */
  ${ASSIST} .assistant-activity { display: flex; align-items: center; gap: 6px; }
  ${ASSIST} .assistant-activity .assistant-glyph-icon svg { width: 13px; height: 13px; }
  ${ASSIST} .assistant-activity .assistant-state-ring { width: 20px; height: 20px; }
  ${ASSIST} :is(.assistant-activity, .assistant-recovery > li)[data-state="unknown"] { color: var(--tone-attention, #b7791f); }
  /* Pressing gives a little everywhere in the panel, the same 130ms spring as the bar. */
  ${ASSIST} :is(.assistant-side-action, .assistant-segment, .assistant-tab-new, .assistant-tabbar .dock-window-action, .assistant-control, .assistant-start, .assistant-copy, .assistant-tab-close):active:not(:disabled) { transform: scale(.94); }
  ${ASSIST} :is(.assistant-tab-new, .assistant-tabbar .dock-window-action, .assistant-tab-close, .assistant-tab-main) { transition: background-color var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint), transform var(--dur-press) var(--ease-spring); }
  ${ASSIST} .assistant-tab-main:active { transform: scale(.98); }
  ${ASSIST} .assistant-tab { transition: background-color var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint); }
  ${ASSIST} .assistant-segment { transition: background-color var(--dur-hover) var(--ease-quint), color var(--dur-hover) var(--ease-quint), box-shadow var(--dur-hover) var(--ease-quint), transform var(--dur-press) var(--ease-spring); }
  /* Moving between works: the new work's content arrives; a drawer slides from its edge; the list grows from its button. */
  ${ASSIST} .assistant-panel[data-arrive] :is(.assistant-thread, .assistant-side) { animation: craft-rise var(--dur-move) var(--ease-quint); }
  ${ASSIST} .assistant-panel[data-layout="drawer"][data-side="open"] .assistant-side { animation: assistant-drawer var(--dur-move) var(--ease-quint); }
  @keyframes assistant-drawer { from { opacity: .6; transform: translateX(-16px); } to { opacity: 1; transform: none; } }
  ${ASSIST} .assistant-works:not([hidden]) { transform-origin: top right; animation: craft-drop var(--dur-move) var(--ease-quint); }
  ${ASSIST} :is(.assistant-thread > .assistant-card, .assistant-thread > .assistant-problem, .assistant-round > .assistant-msg, .assistant-round > .assistant-card) { animation: craft-rise var(--dur-move) var(--ease-quint); }
  /* “Go to it” marks what it took you to for a moment. */
  ${ASSIST} [data-flash] { outline: 2px solid transparent; outline-offset: 3px; animation: assistant-flash var(--dur-moment) var(--ease-quint); }
  @keyframes assistant-flash { 0%, 45% { outline-color: var(--accent); } 100% { outline-color: transparent; } }
  ${ASSIST} .assistant-attention[data-bump] { animation: assistant-bump 420ms var(--ease-spring); }
  @keyframes assistant-bump { 0% { transform: scale(.82); } 60% { transform: scale(1.08); } 100% { transform: none; } }
  /* The pill at the foot of the conversation: what waits below, or news that arrived while reading above. */
  ${ASSIST} .assistant-main { position: relative; }
  ${ASSIST} .assistant-jump { position: absolute; z-index: 2; left: 50%; bottom: 12px; translate: -50% 0; height: 28px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--ink); color: var(--paper); box-shadow: var(--lift-2);
    font: inherit; font-size: 12px; cursor: pointer; animation: craft-rise-from-bar var(--dur-move) var(--ease-quint); transition: transform var(--dur-press) var(--ease-spring); }
  ${ASSIST} .assistant-jump[hidden] { display: none; }
  ${ASSIST} .assistant-jump:active { transform: scale(.95); }
  ${ASSIST} .assistant-jump:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; }
  /* A new work starts from this page's starting points or goes back to a recent work. */
  ${ASSIST} .assistant-empty-list { display: flex; flex-direction: column; gap: 4px; max-width: 520px; margin-top: 14px; }
  ${ASSIST} .assistant-empty-list:empty { display: none; }
  ${ASSIST} .assistant-empty-title { margin: 10px 0 2px; color: var(--faint); font-size: 11px; }
  ${ASSIST} .assistant-empty-title:first-child { margin-top: 0; }
  ${ASSIST} .assistant-start { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 36px; padding: 6px 12px; border: 0; border-radius: 10px; background: var(--wash); color: var(--ink); font: inherit; font-size: 13px; text-align: left; cursor: pointer;
    transition: background-color var(--dur-hover) var(--ease-quint), transform var(--dur-press) var(--ease-spring); animation: craft-rise var(--dur-move) var(--ease-quint) both; }
  ${ASSIST} .assistant-start:hover { background: var(--nav-active); }
  ${ASSIST} .assistant-start:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-start-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ${ASSIST} .assistant-start-state { flex: none; color: var(--muted); font-size: 12px; }
  ${ASSIST} .assistant-empty-list > :nth-child(2) { animation-delay: 30ms; } ${ASSIST} .assistant-empty-list > :nth-child(3) { animation-delay: 60ms; }
  ${ASSIST} .assistant-empty-list > :nth-child(4) { animation-delay: 90ms; } ${ASSIST} .assistant-empty-list > :nth-child(n + 5) { animation-delay: 120ms; }
  ${ASSIST} .assistant-empty-hint { margin: 12px 0 0; color: var(--faint); font-size: 12px; }
  /* Copy an answer: it appears with the pointer over the round (always on touch) and says when it is done. */
  ${ASSIST} .assistant-copy { align-self: flex-start; margin: -6px 0 0 -6px; height: 22px; padding: 0 6px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font: inherit; font-size: 11px; cursor: pointer;
    opacity: 0; transition: opacity var(--dur-hover) var(--ease-quint), background-color var(--dur-hover) var(--ease-quint), transform var(--dur-press) var(--ease-spring); }
  ${ASSIST} :is(.assistant-round:hover .assistant-copy, .assistant-copy:focus-visible, .assistant-copy[data-copy]) { opacity: 1; }
  ${ASSIST} .assistant-copy:hover { background: var(--nav-hover); color: var(--ink); }
  ${ASSIST} .assistant-copy[data-copy=done] { color: var(--hue-green-fill); }
  @media (hover: none) { ${ASSIST} .assistant-copy { opacity: 1; } }
  /* A later round opens with when it began. */
  ${ASSIST} .assistant-round-time { display: flex; align-items: center; gap: 10px; margin: 8px 0 2px; color: var(--faint); font-size: 11px; }
  ${ASSIST} .assistant-round-time::before, ${ASSIST} .assistant-round-time::after { content: ""; flex: 1; height: 1px; background: var(--line); }
  /* The conversation: the person's words on the right, the Host's in the middle, the answer as text, what it did as quiet lines. */
  ${ASSIST} .assistant-thread { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 12px; padding: 16px 16px 16px; font-size: 13px; line-height: 1.6; overscroll-behavior: contain; }
  ${ASSIST} .assistant-empty { color: var(--muted); }
  ${ASSIST} .assistant-empty strong { display: block; margin-bottom: 4px; color: var(--ink); font-weight: 500; }
  ${ASSIST} .assistant-empty p { margin: 0; }
  ${ASSIST} .assistant-empty[hidden] { display: none; }
  ${ASSIST} .assistant-round { display: flex; flex-direction: column; gap: 8px; }
  ${ASSIST} .assistant-msg { max-width: 100%; overflow-wrap: anywhere; }
  ${ASSIST} .assistant-msg--user { align-self: flex-end; max-width: 85%; padding: 8px 12px; border-radius: 12px; background: var(--nav-active); color: var(--ink); white-space: pre-wrap; }
  ${ASSIST} .assistant-msg--assistant { color: var(--ink); }
  ${ASSIST} .assistant-msg--note { font-size: 12px; color: var(--muted); }
  ${ASSIST} .assistant-msg--host { align-self: center; max-width: 85%; padding: 4px 12px; border: 1px dashed var(--line); border-radius: 999px; color: var(--muted); font-size: 12px; text-align: center; white-space: pre-wrap; }
  ${ASSIST} .assistant-rich > :last-child { margin-bottom: 0; }
  ${ASSIST} .assistant-rich p { margin: 0 0 8px; }
  ${ASSIST} .assistant-rich :is(ul, ol) { margin: 0 0 8px; padding-left: 24px; list-style: revert; }
  ${ASSIST} .assistant-rich .assistant-rich-heading { font-weight: 600; }
  ${ASSIST} .assistant-rich pre { margin: 0 0 8px; padding: 8px 12px; border-radius: 8px; background: var(--wash); overflow: auto; font-size: 12px; }
  ${ASSIST} .assistant-rich code { padding: 0 4px; border-radius: 4px; background: var(--wash); font-size: 12px; }
  ${ASSIST} .assistant-rich pre code { padding: 0; background: none; }
  ${ASSIST} :is(.assistant-activity, .assistant-round-status, .assistant-muted) { margin: 0; font-size: 12px; color: var(--muted); } ${ASSIST} .assistant-round > .mw-receipt { align-self: flex-end; max-width: 88%; margin-top: -8px; }
  ${ASSIST} :is(.assistant-activity, .assistant-recovery > li)[data-state="failed"] { color: var(--danger); }
  ${ASSIST} .assistant-round-status[hidden] { display: none; } ${ASSIST} .assistant-round-status[data-retry-until] { font-variant-numeric: tabular-nums; }
  ${ASSIST} .assistant-round-status[data-phase="failed"] { color: var(--danger); }
  /* What needs the person: a question to answer, or an exact effect to allow. */
  ${ASSIST} .assistant-card { display: flex; flex-direction: column; gap: 8px; padding: 12px 12px; border-radius: 10px; box-shadow: 0 0 0 1px var(--line-strong); }
  ${ASSIST} .assistant-card-title { margin: 0; font-weight: 500; color: var(--ink); }
  ${ASSIST} .assistant-card p { margin: 0; }
  ${ASSIST} .assistant-card-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  ${ASSIST} .assistant-fields { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 12px; margin: 0; font-size: 12px; }
  ${ASSIST} .assistant-fields dt { color: var(--muted); }
  ${ASSIST} .assistant-fields dd { margin: 0; max-height: 200px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
  ${ASSIST} .assistant-problem { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 12px 12px; border-radius: 10px; background: var(--wash); }
  ${ASSIST} .assistant-problem p { margin: 0; }
  ${ASSIST} .assistant-recovery { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; margin: 0; padding-left: 16px; font-size: 12px; }
  /* In front of the input: where the next Send goes — a new work (and whose), or the work it continues. */
  /* The Assistant's choosers read like the plugin switcher: quiet words with a hover wash, never a row of outlined chips. */
  ${ASSIST} .assistant-target { display: inline-flex; flex: 0 1 auto; align-items: center; min-width: 0; max-width: 26%; height: 28px; border-radius: 8px; box-shadow: none; transition: background-color var(--dur-hover) var(--ease-quint); }
  ${ASSIST} .assistant-target:hover { background: var(--nav-hover); }
  ${ASSIST} .assistant-target[data-mode="work"] { background: var(--nav-hover); box-shadow: none; }
  ${ASSIST} .assistant-target-main {
    min-width: 0; height: 28px; padding: 0 8px; border: 0; border-radius: 7px; background: transparent; color: var(--muted);
    font: inherit; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer;
  }
  ${ASSIST} .assistant-target-main > span { display: block; overflow: hidden; text-overflow: ellipsis; }
  ${ASSIST} .assistant-target[data-mode="work"] .assistant-target-main { color: var(--ink); padding-right: 4px; }
  ${ASSIST} .assistant-target-main:hover { color: var(--ink); }
  ${ASSIST} :is(.assistant-target-main, .assistant-target-clear):focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-target-clear { display: inline-grid; place-items: center; flex: none; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 7px; background: transparent; color: var(--muted); cursor: pointer; }
  ${ASSIST} .assistant-target-clear[hidden] { display: none; }
  ${ASSIST} .assistant-target-clear:hover { background: var(--nav-active); color: var(--ink); }
  ${ASSIST} .assistant-target-clear svg { width: 12px; height: 12px; }
  /* What goes with this Send, and ways to begin: small popovers rising from the composer. */
  ${ASSIST} .assistant-executor { display: inline-flex; flex: none; align-items: center; gap: 4px; height: 28px; padding: 0 8px; border: 0; border-radius: 7px; background: transparent; box-shadow: none; color: var(--ink-soft); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
  ${ASSIST} .assistant-executor[hidden] { display: none; }
  ${ASSIST} .assistant-executor svg { width: 12px; height: 12px; color: var(--muted); }
  ${ASSIST} .assistant-executor:hover { background: var(--nav-hover); color: var(--ink); }
  ${ASSIST} .assistant-executor:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-starter[aria-current] { background: var(--nav-active); color: var(--ink); }
  ${ASSIST} .bar-composer-attach {
    display: inline-flex; flex: none; align-items: center; gap: 4px; height: 28px; padding: 0 8px; border: 0; border-radius: 7px;
    background: transparent; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer;
  }
  ${ASSIST} .bar-composer-attach svg { width: 14px; height: 14px; }
  ${ASSIST} .bar-composer-attach:hover { background: var(--nav-active); color: var(--ink); }
  ${ASSIST} .bar-composer-attach:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-popover {
    position: absolute; z-index: 60; left: 0; bottom: calc(100% + 8px); display: flex; flex-direction: column; gap: 4px; width: min(420px, 100%);
    max-height: 50dvh; overflow: auto; padding: 8px; border-radius: 10px; background: var(--paper); box-shadow: var(--lift-3); font-size: 13px;
  }
  ${ASSIST} .assistant-popover[hidden] { display: none; }
  /* One “+” beside the input: adding files and every choice about the next work, each with its current value. */
  ${ASSIST} .assistant-more { left: auto; right: 0; width: min(300px, 100%); gap: 2px; }
  ${ASSIST} .assistant-more-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 32px; padding: 4px 8px; border: 0; border-radius: 7px; background: transparent; color: var(--ink); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
  ${ASSIST} .assistant-more-item:hover { background: var(--nav-hover); }
  ${ASSIST} .assistant-more-item:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-more-value { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 12px; }
  /* News alone is a quiet bell; a number means something waits for the person. */
  /* The work's own menu: where it belongs, who carries it, handing over, usage. */
  /* A long message of the person's folds after six lines. */
  ${ASSIST} .assistant-msg--user[data-folded] { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 6; overflow: hidden; }
  ${ASSIST} .assistant-msg-more { align-self: flex-end; margin-top: -8px; padding: 0 4px; border: 0; background: transparent; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; }
  ${ASSIST} .assistant-msg-more:hover { color: var(--ink); }
  ${ASSIST} .assistant-msg-more:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; }
  /* A plugin's own floating bars and menus stay inside its stage, under the bottom bar and its menus. */
  ${SHELL} .immersive-plugin-stage { isolation: isolate; }
  /* The next steps sit just above the input, as part of it: the open panel moves up to make room (48px leaves 8px above a touch row). */
  ${ASSIST} .assistant-next-row{position:absolute;z-index:55;inset:auto auto calc(100% + 6px) 0;max-width:100%}
  ${ASSIST} .assistant-next-row .mw-ix-steps{--mw-ix-step-h:32px;overflow-x:auto}
  ${ASSIST} .assistant-next-row .mw-ix-step:not(:hover){background:var(--paper)}
  ${ASSIST} .bar-center:has(>.assistant-next-row:not([hidden])){--next-row:48px}
  /* What the next Send carries, above the next steps: a chip each; the object on show, not added, is dashed with + to add it. */
  ${ASSIST} .assistant-context-strip{position:absolute;z-index:55;inset:auto auto calc(100% + 6px + var(--next-row,0px)) 0;max-width:100%}
  ${ASSIST} .assistant-strip-row{display:flex;gap:6px;overflow-x:auto}
  ${ASSIST} .bar-center:has(>.assistant-context-strip:not([hidden])){--context-row:38px}
  ${ASSIST} .assistant-strip-chip{display:inline-flex;flex:none;align-items:center;gap:4px;max-width:240px;height:32px;padding:0 0 0 8px;border:0;border-radius:8px;background:var(--paper);box-shadow:inset 0 0 0 1px var(--line);color:var(--ink);font:inherit;font-size:12px}
  ${ASSIST} .assistant-strip-chip.is-optional{box-shadow:none;outline:1px dashed var(--line-strong);outline-offset:-1px;color:var(--muted)}
  ${ASSIST} .assistant-strip-chip.is-work{padding:0 8px;color:var(--muted);cursor:pointer}
  ${ASSIST} .assistant-strip-chip.is-landing{background:var(--accent-soft);box-shadow:none}
  ${ASSIST} .assistant-strip-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  ${ASSIST} .assistant-strip-note{color:var(--faint);white-space:nowrap} ${ASSIST} .assistant-strip-chip.is-failed{max-width:320px;box-shadow:inset 0 0 0 1px var(--danger)} ${ASSIST} .is-failed>.assistant-strip-label{max-width:120px} ${ASSIST} .is-failed>.assistant-strip-note{min-width:0;overflow:hidden;color:var(--danger);text-overflow:ellipsis}
  ${ASSIST} .assistant-strip-thumb{width:20px;height:20px;border-radius:4px;object-fit:cover}
  ${ASSIST} .assistant-strip-act{flex:none;width:32px;height:32px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--muted);font:inherit;cursor:pointer}
  ${ASSIST} :is(.assistant-strip-act,.is-work):hover{background:var(--nav-hover);color:var(--ink)}
  ${ASSIST} :is(.assistant-strip-act,.is-work):focus-visible{outline:var(--focus-stroke);outline-offset:var(--focus-stroke-inset,-1px)}
  ${ASSIST} .assistant-notice-actions{display:flex;gap:6px;justify-content:flex-end}
  /* Attention: a count only for what the person's rules let through here; the list says what waits and why. */
  ${ASSIST} .assistant-attention {
    display: inline-flex; flex: none; align-items: center; gap: 3px; height: 28px; padding: 0 7px; border: 0; border-radius: 7px;
    background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--ink); font: inherit; font-size: 12px; cursor: pointer;
  }
  ${ASSIST} .assistant-attention[hidden] { display: none; }
  ${ASSIST} .assistant-attention svg { width: 14px; height: 14px; }
  ${ASSIST} .assistant-attention:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-notices { left: auto; right: 0; gap: 8px; }
  ${ASSIST} .assistant-notice { display: flex; flex-direction: column; gap: 4px; padding: 8px; border-radius: 8px; background: var(--nav-hover); }
  ${ASSIST} .assistant-notice-text { margin: 0; color: var(--ink); overflow-wrap: anywhere; }
  ${ASSIST} .assistant-notices-held > summary { cursor: pointer; color: var(--muted); font-size: 12px; padding: 7px 2px; }
  ${ASSIST} .assistant-notices-held > .assistant-notice { margin-top: 6px; }
  ${ASSIST} .assistant-popover-title { margin: 0 0 4px; padding: 0 8px; font-size: 11px; color: var(--faint); }
  ${ASSIST} .assistant-mention { display: grid; gap: 2px; text-align: left; } ${ASSIST} .assistant-mention.is-stale { opacity: .5; cursor: default; }
  ${ASSIST} .assistant-mention-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  ${ASSIST} .assistant-mention-snippet { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--muted); }
  ${ASSIST} .assistant-composer[data-dropping] { outline: 2px dashed var(--accent, var(--ink)); outline-offset: 2px; }
  ${ASSIST} .assistant-material-origin { font-size: 11px; color: var(--faint); white-space: nowrap; }
  ${ASSIST} .assistant-starter { width: 100%; padding: 8px 8px; border: 0; border-radius: 7px; background: transparent; color: var(--ink-soft); font: inherit; text-align: left; cursor: pointer; }
  ${ASSIST} .assistant-starter:hover { background: var(--nav-hover); color: var(--ink); }
  ${ASSIST} .assistant-starter:focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, -1px); }
  ${ASSIST} .assistant-exact summary { cursor: pointer; font-size: 12px; color: var(--muted); }
  ${ASSIST} .assistant-exact pre { margin: 4px 0 0; max-height: 200px; overflow: auto; padding: 8px 12px; border-radius: 8px; background: var(--wash); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
  /* The input always keeps room to type; the Assistant's choosers give way first and end in an ellipsis. */
  ${SHELL} .bar-composer .assistant-composer-input { flex: 1 1 120px; min-width: 120px; }
  ${SHELL} .bar-composer .assistant-target { flex: 0 1 auto; min-width: 72px; max-width: 180px; }
  ${SHELL} .bar-composer .assistant-executor { flex: 0 1 auto; min-width: 0; max-width: 104px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* A narrower bar compacts the choosers first (short labels, tighter gaps); below 860px it keeps one beside the input,
     the rule main's phone bar uses: the executor or Character shows once chosen or while the panel is open. */
  @media (max-width: 1100px) {
    ${SHELL} .bar-composer { gap: 4px; }
    ${SHELL} .bar-composer .assistant-target { min-width: 56px; max-width: 96px; }
    ${SHELL} .bar-composer .assistant-executor { max-width: 72px; } ${SHELL} .bar-composer .assistant-mode-word { display: none; }
    ${SHELL} .bar-composer .assistant-composer-input { min-width: 96px; }
  }
  @media (max-width: 860px) and (min-width: 601px) {
    ${SHELL} [data-assistant-island]:has(.assistant-panel[hidden]) :is([data-assistant-character], [data-assistant-executor]):not([data-chosen]) { display: none; }
    ${SHELL} .bar-composer:has([data-assistant-character][data-chosen]) [data-assistant-executor] { display: none; }
  }
  /* ⌘K search opens from the same place: one entry for finding and for asking. */
  @media (min-width: 601px) {
    ${SHELL} dialog.global-search-dialog[open] { position: fixed; inset: auto 0 calc(var(--dock-h) + 4px) 0; margin: 0 auto; width: min(640px, calc(100vw - 32px)); max-height: min(70dvh, 560px); }
  }
  @keyframes craft-dock-rise { from { opacity: 0; transform: translateY(12px) scale(.985); } to { opacity: 1; transform: none; } }
  /* Everything that opens from the bar rises from it (craft-rise-from-bar), anchored at the edge nearest its control. */
  html ${SHELL} .workbench-bar :is(.account-global-popover, .plugin-picker-popover:not([hidden])) { transform-origin: bottom left; animation: craft-rise-from-bar 250ms var(--ease-quint) both; }
  html ${SHELL} .workbench-bar details > .navigator-project-menu-popover { transform-origin: bottom right; --menu-from-y: 4px; }

  /* The project: a round mark at the far right; its menu switches project, opens settings and the person. */
  html ${SHELL} .workbench-bar .bar-end .workspace-chrome { position: static; display: flex; width: auto; height: auto; min-height: 0; margin: 0 0 0 4px; padding: 0; border: 0; background: transparent; box-shadow: none; grid-area: auto; }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-primary { display: flex; flex-direction: row; align-items: center; width: auto; height: auto; min-height: 0; margin: 0; padding: 0; gap: 0; background: transparent; box-shadow: none; }
  html ${SHELL} .workbench-bar .bar-end :is(.navigator-project-search, .desktop-titlebar-drag, .navigator-directory-toggle, .immersive-show-directory) { display: none !important; }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-menu { position: relative; width: auto; }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-selector {
    display: grid; grid-template-columns: 40px; place-items: center; justify-content: center; gap: 0; width: 40px; height: 40px; min-height: 40px;
    padding: 0; border-radius: 50%; background: transparent; overflow: visible; list-style: none; cursor: pointer;
  }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-selector::-webkit-details-marker { display: none; }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-selector > :is(strong, svg:last-child) { display: none; }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-selector .project-monogram {
    width: 36px; height: 36px; border-radius: 50%; font-size: 13px; font-weight: 600;
    box-shadow: 0 0 0 2px var(--paper), var(--lift-1); transition: box-shadow var(--dur-move) var(--ease-quint);
  }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-selector:hover .project-monogram,
  html ${SHELL} .workbench-bar .bar-end .navigator-project-menu[open] > .navigator-project-selector .project-monogram { box-shadow: 0 0 0 2px var(--paper), 0 0 0 3.5px var(--line-strong), var(--lift-1); }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-selector:focus-visible { outline: var(--focus-stroke); outline-offset: 3px; }
  @media (max-width: 1100px) {
    ${SHELL} .workbench-bar { grid-template-columns: minmax(120px, 1fr) minmax(200px, 560px) minmax(max-content, 1fr); gap: 12px; }
  }
  html ${SHELL} .workbench-bar .bar-end .navigator-project-menu-popover {
    position: absolute; top: auto; left: auto; right: 0; bottom: calc(100% + 12px); width: 276px; min-width: 0; max-height: min(78dvh, 640px); overflow: auto;
  }
  /* The switch list keeps one layout at every width. */
  html ${SHELL} .workbench-bar .navigator-project-menu-popover > span { display: block; padding: 8px 12px 4px; color: var(--muted); font-size: 11px; font-weight: 500; line-height: 18px; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover nav { display: grid; gap: 1px; }
  html ${SHELL} .workbench-bar .navigator-project-option {
    display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 34px; padding: 0 12px; border-radius: 8px;
    color: var(--ink); font-size: 13px; text-decoration: none;
  }
  html ${SHELL} .workbench-bar .navigator-project-option > span { display: flex; align-items: center; gap: 8px; min-width: 0; }
  html ${SHELL} .workbench-bar .navigator-project-option strong { overflow: hidden; font-size: 13px; font-weight: var(--weight-control, 500); text-overflow: ellipsis; white-space: nowrap; }
  html ${SHELL} .workbench-bar .navigator-project-option.is-current strong { font-weight: 500; }
  html ${SHELL} .workbench-bar .navigator-project-option > svg { flex: none; width: 14px; height: 14px; color: var(--ink); }
  html ${SHELL} .workbench-bar .navigator-project-option:hover { background: var(--nav-hover); }
  html ${SHELL} .workbench-bar .navigator-project-option.is-current { background: var(--nav-active); }
  html ${SHELL} .workbench-bar .navigator-project-option:focus-visible { outline: var(--focus-stroke); outline-offset: -2px; }
  /* One row system for the project menu: every row 34px, a 20px leading slot, one text column, and one kind of
     divider with even space on both sides. */
  html ${SHELL} .workbench-bar .navigator-project-menu-popover { padding: 8px; border-radius: 14px; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover > span { padding: 4px 12px 4px; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover :is(.navigator-project-option, .navigator-project-manage, .navigator-project-settings, .navigator-personal > .account-global-item, .navigator-personal > .personal-account) {
    position: relative; display: flex; align-items: center; justify-content: flex-start; gap: 12px; width: 100%; height: var(--menu-row, 34px); min-height: var(--menu-row, 34px);
    margin: 0; padding: 0 12px; border: 0; border-radius: 8px; box-shadow: none; background: transparent;
    color: var(--ink); font: inherit; font-size: 13px; font-weight: 400; line-height: 1; text-align: left; text-decoration: none;
  }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover :is(.navigator-project-manage, .navigator-project-settings, .navigator-personal > .account-global-item) > svg:first-child {
    flex: none; width: 16px; height: 16px; margin: 0 4px; color: var(--ink-soft);
  }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover :is(.navigator-project-manage, .navigator-project-settings, .navigator-personal > .account-global-item) > span:not(.personal-account-avatar):not(.personal-account-copy) {
    position: static; width: auto; height: auto; margin: 0; clip: auto; overflow: visible; white-space: nowrap;
  }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover :is(.navigator-project-option, .navigator-project-manage, .navigator-project-settings, .navigator-personal > .account-global-item):hover { background: var(--nav-hover); color: var(--ink); }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover :is(.navigator-project-manage, .navigator-project-settings, .navigator-personal > .account-global-item):hover > svg:first-child { color: var(--ink); }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover :is(.navigator-project-option.is-current, .navigator-project-settings[aria-current], .navigator-personal > .account-global-item[aria-current]) { background: var(--nav-active); color: var(--ink); }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .navigator-project-option > span { gap: 12px; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .navigator-project-option .project-monogram { flex: none; width: 20px; height: 20px; border-radius: 6px; font-size: 11px; box-shadow: none; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .navigator-project-option > svg { margin-left: auto; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .personal-account-avatar {
    display: grid; place-items: center; flex: none; width: 20px; height: 20px; border-radius: 50%; background: var(--nav-active); color: var(--ink-soft);
  }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .personal-account-avatar svg { width: 12px; height: 12px; }
  @media (min-width: 761px) { html ${SHELL} .workbench-bar .navigator-project-menu-popover .personal-account-avatar { box-shadow: inset 0 0 0 1px var(--line-strong); } }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .personal-account-copy { display: flex; align-items: baseline; gap: 8px; min-width: 0; line-height: 1; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .personal-account-copy strong { font-size: 13px; font-weight: 500; color: var(--ink); }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .personal-account-copy small { font-size: 12px; color: var(--muted); }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .navigator-personal { position: relative; display: grid; gap: 0; margin: 12px 0 0; padding: 0; box-shadow: none; }
  /* Groups: switch projects · this project · you. The divider is drawn in the gap, so it never touches a row.
     Who you are is shown, not clicked: no hover, no pointer. */
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .navigator-personal > .personal-account { cursor: default; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .navigator-personal > .personal-account:hover { background: transparent; }
  html ${SHELL} .workbench-bar .navigator-project-menu-popover .navigator-personal::before {
    content: ""; position: absolute; left: 5px; right: 5px; top: -6px; height: 1px; background: var(--line); pointer-events: none;
  }
  ${SHELL} .dock-window-action {
    display: inline-flex; align-items: center; gap: 8px; width: auto; height: 28px; padding: 0 8px; border: 0; border-radius: 8px;
    background: transparent; color: var(--ink-soft); font: inherit; font-size: 12px; cursor: pointer;
  }
  ${SHELL} .dock-window-action:hover { background: var(--nav-hover); color: var(--ink); }
  ${SHELL} .dock-window-action svg { width: 14px; height: 14px; }

  /* A narrow Assistant column (a 640–900px window, a side-by-side layout) keeps one chooser beside a usable input, as on
     a phone: unchosen Character and executor chips fold away while the panel is closed, the plugin chip narrows. */
  @container assistant-bar (max-width: 460px) {
    ${SHELL} [data-assistant-island]:has(.assistant-panel[hidden]) :is([data-assistant-character], [data-assistant-executor]):not([data-chosen]) { display: none; }
    ${SHELL} .bar-composer:has([data-assistant-character][data-chosen]) [data-assistant-executor] { display: none; }
    ${SHELL} .bar-composer { gap: 4px; }
    ${SHELL} .bar-composer .assistant-composer-input { flex: 1 1 40px; min-width: 40px; }
    /* While typing the input takes the column; focusing a chip keeps that chip on screen. */
    ${SHELL} .bar-composer:has(.assistant-composer-input:focus):not([data-measuring]) :is(.assistant-target, .assistant-executor, .assistant-attention) { display: none; }
  }
  /* A crowded composer at any width takes the same steps, as far as the island measures it needs (data-fit): the chips
     present — a work, its materials, what needs a look, who does it — would otherwise leave the input no room at all. */
  ${SHELL} .bar-composer[data-fit] { gap: 4px; }
  ${SHELL} [data-assistant-island]:has(.assistant-panel[hidden]) .bar-composer:is([data-fit="folded"], [data-fit="narrow"]) :is([data-assistant-character], [data-assistant-executor]):not([data-chosen]) { display: none; }
  /* With the panel open the choosers are back; the ones nobody changed give up their width before the input does. */
  ${SHELL} .bar-composer[data-fit="narrow"] .assistant-executor:not([data-chosen]) { flex: 0 1 auto; min-width: 0; }
  ${SHELL} .bar-composer .assistant-executor > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  /* The input's floor holds only where the column has room for it; a narrow column's own steps above take over there. */
  @container assistant-bar (min-width: 461px) {
    ${SHELL} .bar-composer:is([data-fit="folded"], [data-fit="narrow"]) .assistant-composer-input { flex: 1 1 64px; min-width: 64px; }
    ${SHELL} .bar-composer:is([data-fit="folded"], [data-fit="narrow"]) .assistant-target { min-width: 56px; }
    ${SHELL} .bar-composer[data-fit="narrow"] .assistant-target { max-width: 96px; }
  }
`;
