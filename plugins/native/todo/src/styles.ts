export const TODO_STYLES = `
  [data-todo=workbench] { --plugin-tint: var(--ink-soft); }
  [data-todo=workbench] .todo-list { display: flex; flex-direction: column; gap: 10px; padding-bottom: 12px; }
  /* The header is in the flow (several rows), so the space the shell keeps for its single-row chrome is not needed. */
  body.immersive-workbench .plugin-stage-shell[data-todo=workbench] > .todo-list.plugin-stage-list { padding-top: 16px; }
  .todo-chrome { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; min-width: 0; }
  .todo-views { display: flex; flex-wrap: nowrap; gap: 2px; max-width: 100%; overflow-x: auto; }
  .todo-views .mw-toggle { flex: none; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .todo-chrome-tools { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .todo-search { width: 200px; max-width: 100%; }
  [data-todo-scope].is-current { background: var(--nav-active); color: var(--ink); }

  .todo-quick { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: var(--r-card, 12px); box-shadow: var(--lift-1); }
  .todo-quick-input { width: 100%; font-size: 13px; }
  .todo-quick-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .todo-quick-parts { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; flex: 1 1 12rem; min-width: 0; }
  .todo-quick-meta .mw-btn--primary { flex: none; }
  /* A long project name ellipsizes; the short choices keep their words. */
  .todo-chip { display: inline-flex; align-items: center; gap: 2px; height: 24px; padding: 0 2px 0 8px; border-radius: 999px; font-size: 12px; color: var(--ink-soft); background: var(--nav-hover); }
  .todo-chip--due_date { color: var(--ink); }
  .todo-chip-remove { display: inline-grid; place-items: center; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--muted); cursor: pointer; }
  .todo-chip-remove:hover, .todo-chip-remove:focus-visible { background: var(--nav-active); color: var(--ink); }
  .todo-chip-remove svg { width: 12px; height: 12px; }
  .todo-quick-hint, .todo-hint, .todo-muted { font-size: 12px; color: var(--muted); margin: 0; }

  .todo-summary { margin: 0; padding: 0 4px; font-size: 13px; color: var(--ink-soft); }
  .todo-reminders { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: var(--r-card, 12px); box-shadow: var(--lift-1); }
  .todo-reminders[hidden] { display: none; }
  .todo-reminders h2 { margin: 0; font-size: 12px; font-weight: 400; color: var(--tone-attention, var(--ink-soft)); }
  .todo-reminder { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 12px; min-height: 36px; }
  .todo-reminder-text { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
  .todo-reminder-text .mw-btn--link { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .todo-reminder-text small { flex: none; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .todo-reminder-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; }
  .todo-reminder-later { position: relative; }
  .todo-reminder-later > summary { list-style: none; }
  .todo-reminder-later > summary::-webkit-details-marker { display: none; }
  .todo-reminder-later .mw-menu { position: absolute; top: calc(100% + 4px); right: 0; z-index: 6; min-width: 140px; }
  .todo-note { display: flex; align-items: center; gap: 8px; margin: 0; padding: 0 4px; font-size: 12px; color: var(--muted); }
  .todo-note.is-error { color: var(--red, var(--ink)); }
  .todo-loading { display: flex; flex-direction: column; gap: 8px; padding: 4px; }
  .todo-loading[hidden] { display: none; }
  .todo-loading .mw-skeleton { height: 36px; border-radius: var(--r-row, 8px); }

  .todo-rows { display: flex; flex-direction: column; min-width: 0; }
  .todo-group > summary { margin-top: 6px; }
  .todo-row { display: grid; grid-template-columns: 22px 28px minmax(0, 1fr); align-items: center; column-gap: 2px; min-width: 0; border-radius: var(--r-row, 8px); }
  .todo-row.is-selected { background: var(--nav-active); }
  .todo-pick { justify-self: center; opacity: .35; transition: opacity var(--dur-hover) var(--ease-swift); }
  .todo-row:hover .todo-pick, .todo-pick:focus-visible, .todo-pick:checked, [data-todo-picking=true] .todo-pick { opacity: 1; }
  .todo-done { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--faint); cursor: pointer; }
  .todo-done:hover, .todo-done:focus-visible { color: var(--ink); background: var(--nav-hover); }
  .todo-done svg { width: 16px; height: 16px; }
  .todo-done.is-done { color: var(--tone-done, var(--ink)); }
  body.immersive-workbench .plugin-stage-list .todo-row > .todo-entry.mw-stage-entry { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "title trail" "meta trail"; align-items: center; gap: 2px 10px; width: auto; min-width: 0; height: auto; min-height: 44px; padding: 7px 8px; text-align: left; }
  .todo-title { grid-area: title; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: 400; color: var(--ink); }
  .todo-meta { grid-area: meta; display: flex; flex-wrap: wrap; gap: 2px 10px; min-width: 0; font-size: 12px; color: var(--muted); }
  .todo-meta:empty { display: none; }
  .todo-meta-part--due { color: var(--ink-soft); }
  .todo-trail { grid-area: trail; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; }
  .todo-row.is-closed .todo-title { color: var(--muted); text-decoration: line-through; text-decoration-color: var(--faint); }

  .todo-review { display: flex; flex-direction: column; gap: 14px; }
  .todo-review[hidden] { display: none; }
  .todo-batch-review { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: var(--r-card, 12px); box-shadow: var(--lift-1); }
  .todo-batch-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
  .todo-batch-head h2 { margin: 0; font-size: 15px; font-weight: 400; color: var(--ink); }
  .todo-batch-head small { font-size: 12px; color: var(--muted); }
  .todo-batch-materials > summary, .todo-batch-reference > summary { cursor: pointer; font-size: 12px; color: var(--muted); }
  .todo-candidate { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: start; gap: 4px 10px; padding: 10px 0; border-top: 1px solid var(--line); }
  .todo-candidate > .mw-check { margin-top: 3px; justify-self: center; }
  .todo-candidate.is-decided { opacity: .62; }
  .todo-candidate-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .todo-candidate-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
  .todo-candidate-head strong { font-weight: 400; color: var(--ink); overflow-wrap: anywhere; }
  .todo-candidate-kind { flex: none; padding: 0 6px; border-radius: 999px; font-size: 11px; line-height: 18px; color: var(--ink-soft); background: var(--nav-hover); }
  .todo-candidate-kind--suggestion { color: var(--muted); background: transparent; box-shadow: inset 0 0 0 1px var(--line); }
  .todo-candidate-why, .todo-candidate-existing, .todo-candidate-uncertain { margin: 0; font-size: 12px; color: var(--ink-soft); }
  .todo-candidate-existing--conflict, .todo-candidate-existing--maybe_done { color: var(--tone-attention, var(--ink)); }
  .todo-candidate-uncertain { color: var(--muted); }
  .todo-candidate-evidence { margin: 0; padding: 2px 10px; border-left: 2px solid var(--line-strong); font-size: 12px; color: var(--ink-soft); }
  .todo-candidate-evidence small { color: var(--faint); }
  .todo-candidate-protected { font-size: 12px; }
  .todo-candidate-suggest { padding: 0; height: auto; font-size: 12px; }
  .todo-candidate-editor { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 8px 12px; padding-top: 6px; }
  .todo-candidate-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 2px; }
  .todo-batch-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding-top: 10px; border-top: 1px solid var(--line); }
  .todo-review-toggle[hidden] { display: none; }
  @media (max-width: 720px), (pointer: coarse) {
    .todo-candidate { grid-template-columns: 32px minmax(0, 1fr); }
    .todo-candidate-actions { grid-column: 2; justify-content: flex-start; }
    .todo-batch-foot .mw-btn--primary { width: 100%; justify-content: center; }
  }
  .todo-batch { position: sticky; bottom: 8px; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; margin-top: 8px; padding: 6px 8px; border-radius: var(--r-card, 12px); background: var(--paper); box-shadow: var(--lift-3); }
  .todo-batch[hidden] { display: none; }
  .todo-batch strong { font-weight: 400; font-size: 13px; margin-right: 6px; font-variant-numeric: tabular-nums; }
  .todo-batch-more { position: relative; }
  .todo-batch-more > summary { list-style: none; }
  .todo-batch-more > summary::-webkit-details-marker { display: none; }
  .todo-batch-more .mw-menu { position: absolute; bottom: calc(100% + 4px); left: 0; min-width: 140px; }

  /* —— The open todo. Its layout follows its own width (a container query), so the side panel, a split and a narrow window
     are one set of rules. Type steps: 20 (the todo), 15 (its notes), 13 (rows), 12 (facts). —— */
  .todo-detail { position: relative; overflow: hidden; container: todo-detail / inline-size; }
  .todo-bar { display: flex; align-items: center; gap: 8px; flex: none; height: 48px; padding: 0 16px 0 12px; }
  /* The page's heading is for screen readers; it still sits on the type scale. */
  .todo-bar > h1 { font-size: 13px; }
  .todo-save { display: inline-flex; align-items: center; margin-left: auto; color: var(--muted); font-size: 12px; white-space: nowrap; }
  .todo-save[data-mw-state="unsaved"] { color: var(--ink-soft); }
  .todo-scroll { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; }
  .todo-editor { display: grid; grid-template-columns: minmax(0, 1fr) 312px; grid-template-areas: "alert alert" "head head" "main rail"; column-gap: 40px; box-sizing: content-box; max-width: 1040px; margin: 0 auto; padding: 12px 32px 56px; }
  .todo-detail :is(.todo-fact, .todo-prop, .todo-manual, .todo-title-error, .todo-work, .todo-hist > summary) > svg { width: 16px; height: 16px; flex: none; }
  .todo-detail :is(.todo-fact, .todo-manual, .todo-title-error) > svg { width: 14px; height: 14px; }

  /* Head: what it is, where it stands, what can be done. */
  .todo-alert { grid-area: alert; margin-bottom: 16px; }
  .todo-alert[hidden], .todo-alert [hidden] { display: none; }
  .todo-head { grid-area: head; display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "title acts" "line acts"; align-items: start; gap: 8px 24px; margin-bottom: 28px; }
  .todo-titlebox { grid-area: title; display: grid; gap: 8px; min-width: 0; }
  /* The platform frames every bare textarea (textarea:not(.mw-textarea)); these two are the page's own text, so the frame is taken off here and only shows on hover and focus. They grow by the shared data-fit sizing, without its two-line floor and its cap. */
  .todo-detail .todo-editor textarea.todo-name, .todo-detail .todo-editor textarea.todo-notes { display: block; box-sizing: content-box; border: 0; resize: none; overflow: hidden; max-height: none; background: transparent; box-shadow: none; color: var(--ink); font: inherit; overflow-wrap: anywhere; cursor: text; }
  .todo-detail .todo-editor textarea.todo-name { width: 100%; min-height: 0; margin: -4px -8px; padding: 4px 8px; border-radius: var(--r-control); font-size: 20px; font-weight: 600; line-height: 1.4; letter-spacing: -.02em; }
  .todo-detail .todo-editor textarea.todo-name[data-closed] { color: var(--ink-soft); }
  .todo-detail .todo-editor textarea.todo-notes { width: 100%; min-height: 52px; margin: -8px -12px; padding: 8px 12px; border-radius: var(--r-row); font-size: 15px; line-height: 1.7; }
  .todo-name::placeholder, .todo-notes::placeholder { color: var(--faint); font-weight: 400; }
  .todo-detail .todo-editor textarea.todo-name:hover, .todo-detail .todo-editor textarea.todo-notes:hover { background: var(--nav-hover); }
  .todo-detail .todo-editor textarea.todo-name:focus, .todo-detail .todo-editor textarea.todo-notes:focus { background: transparent; }
  .todo-detail .todo-editor textarea.todo-name[aria-invalid="true"] { box-shadow: inset 0 0 0 1px var(--red), 0 0 0 3px color-mix(in srgb, var(--red) 14%, transparent); }
  .todo-title-error { display: flex; align-items: center; gap: 4px; margin: 0; color: var(--red); font-size: 12px; }
  .todo-title-error[hidden] { display: none; }
  .todo-line { grid-area: line; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-width: 0; color: var(--ink-soft); font-size: 13px; }
  .todo-facts { display: contents; }
  .todo-acts { grid-area: acts; display: flex; align-items: center; gap: 8px; }
  .todo-acts > .mw-btn { white-space: nowrap; }
  .todo-acts > [hidden] { display: none; }
  /* The status chip can be pressed, so it has a wash and an arrow; its colour follows the status. */
  .todo-state { height: 28px; min-height: 28px; padding: 0 6px 0 8px; gap: 6px; border-radius: var(--r-control); font-size: 13px; cursor: pointer; transition: background-color var(--dur-move) var(--ease-quint), color var(--dur-move) var(--ease-quint); }
  .todo-state:hover, .todo-state[aria-expanded="true"] { background: color-mix(in srgb, var(--status-tone, var(--ink)) 16%, transparent); }
  .todo-state:focus-visible { outline: var(--focus-stroke); outline-offset: 1px; }
  .todo-state > svg:last-child { width: 12px; height: 12px; opacity: .7; }
  .todo-state > .mw-state-ring { margin: 0; }
  .todo-state.is-arriving > .mw-state-ring { animation: craft-done var(--dur-moment) var(--ease-spring); }
  .todo-fact { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
  .todo-fact > svg { color: var(--muted); }
  .todo-fact--quiet { color: var(--muted); }
  .todo-fact + .todo-fact::before { content: ""; width: 2px; height: 2px; margin-right: 5px; border-radius: 50%; background: var(--faint); }
  .todo-flag { height: 22px; min-height: 22px; padding: 0 8px; border-radius: var(--r-tag, 6px); font-size: 12px; }
  .todo-flag[hidden] { display: none; }

  /* More actions: a menu under its button; on a narrow page the button moves up into the bar. */
  .todo-more > summary { width: 32px; min-width: 32px; min-height: 32px; padding: 0; justify-content: center; }
  .todo-more-menu { position: absolute; top: calc(100% + 6px); right: 0; z-index: 40; min-width: 232px; transform-origin: 100% 0; animation: craft-drop var(--dur-move) var(--ease-quint) both; }

  /* The writing column. */
  .todo-main { grid-area: main; display: flex; flex-direction: column; gap: 28px; min-width: 0; }
  .todo-works > div { display: grid; gap: 12px; }
  .todo-works[hidden] { display: none; }
  .todo-section { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .todo-section > h2 { display: flex; align-items: center; gap: 8px; min-height: 28px; margin: 0; color: var(--muted); font-size: 12px; font-weight: 500; }
  .todo-section > h2 > em { font-style: normal; font-weight: 400; color: var(--faint); font-variant-numeric: tabular-nums; }
  .todo-section > h2 > .mw-btn { margin-left: auto; }
  .todo-none { margin: 0; color: var(--muted); font-size: 13px; }

  /* What is going on now: who is being waited for (cyan: someone else's turn), what the Assistant is doing (mist blue), and
     amber once it waits for the person. One soft block, one line per thing. */
  .todo-now { display: grid; gap: 10px; padding: 12px 14px; border-radius: var(--r-card); background: var(--hue-cyan-soft); animation: craft-rise var(--dur-arrive) var(--ease-quint) both; }
  .todo-now[hidden] { display: none; }
  .todo-now[data-kind="ai"] { background: var(--accent-soft); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 22%, transparent); }
  .todo-now[data-kind="you"] { background: var(--amber-soft); }
  .todo-now-head { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-height: 24px; }
  .todo-now-head > .todo-fact { white-space: normal; }
  .todo-wait { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) auto; gap: 8px; }
  .todo-wait > .mw-input { box-sizing: border-box; min-width: 0; background-color: var(--paper); border-color: var(--control-input); }
  .todo-wait > .mw-btn { white-space: nowrap; }
  .todo-work { display: flex; align-items: center; gap: 10px; min-width: 0; font-size: 13px; }
  .todo-work > strong { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; color: var(--ink); }
  .todo-work > .mw-btn { flex: none; }
  .todo-out { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 12px; border-radius: var(--r-row); background: var(--paper); box-shadow: inset 0 0 0 1px var(--line), var(--lift-1); min-width: 0; font-size: 13px; }
  .todo-out > :is(.mw-btn--link, span:not(.todo-tag)) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; justify-content: flex-start; text-align: left; }
  .todo-muted { flex: none; }

  /* Tags: each kind of thing has its own wash from the palette, so kinds read apart at a glance. */
  .todo-tag { display: inline-flex; align-items: center; flex: none; height: 20px; padding: 0 7px; border-radius: var(--r-tag, 6px); background: var(--control-fill); color: var(--ink-soft); font-size: 12px; white-space: nowrap; }
  .todo-tag:empty { display: none; }
  .todo-tag[data-kind="inbox"], .todo-tag[data-kind="lingguang"] { background: var(--hue-indigo-soft); color: var(--hue-indigo); }
  .todo-tag[data-kind="assistant"] { background: var(--accent-soft); color: var(--accent-strong, var(--accent)); }
  .todo-tag[data-kind="material"], .todo-tag[data-kind="onboarding"] { background: var(--hue-steel-soft); color: var(--hue-steel); }
  .todo-tag[data-kind="draft"] { background: var(--hue-purple-soft); color: var(--hue-purple); }
  .todo-tag[data-kind="blocked_by"] { background: var(--hue-cyan-soft); color: var(--hue-cyan); }
  .todo-tag[data-kind="blocks"] { background: var(--amber-soft); color: var(--amber); }

  /* Sources: one framed card each; a todo the person wrote down has only a line. */
  .todo-sources { display: grid; gap: 8px; }
  .todo-source { display: grid; gap: 6px; padding: 12px 14px; border-radius: var(--r-card); background: var(--paper); box-shadow: inset 0 0 0 1px var(--line), var(--lift-1); font-size: 13px; color: var(--ink-soft); }
  .todo-source-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .todo-source-head > :is(strong, .mw-btn--link) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; color: var(--ink); }
  .todo-source-head > .mw-btn--link { color: var(--accent); }
  .todo-source-head > time { flex: none; margin-left: auto; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .todo-source p { margin: 0; }
  .todo-source blockquote { margin: 0; padding: 2px 0 2px 10px; border-left: 2px solid var(--line-strong); white-space: pre-wrap; }
  .todo-manual { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--muted); font-size: 13px; }

  /* Links: a framed group of rows with hairlines between. */
  .todo-linked { border-radius: var(--r-card); background: var(--paper); box-shadow: inset 0 0 0 1px var(--line), var(--lift-1); }
  .todo-link { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 6px 0 12px; min-width: 0; font-size: 13px; }
  .todo-link + .todo-link { border-top: 1px solid var(--line); }
  .todo-link > :is(.mw-btn--link, span:not(.todo-tag)) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; justify-content: flex-start; text-align: left; }
  .todo-link-status { flex: none; display: inline-flex; align-items: center; color: var(--muted); font-size: 12px; }
  .todo-unlink { flex: none; opacity: 0; transition: opacity var(--dur-hover) var(--ease-quint); }
  .todo-link:hover > .todo-unlink, .todo-link:focus-within > .todo-unlink { opacity: 1; }
  @media (hover: none) { .todo-unlink { opacity: 1; } }

  /* History: folded to one line that says the latest. */
  .todo-hist[hidden] { display: none; }
  .todo-hist > summary { display: flex; align-items: center; gap: 8px; min-height: 32px; margin: 0 -8px; padding: 0 8px; border-radius: var(--r-control); list-style: none; cursor: pointer; color: var(--muted); font-size: 12px; font-weight: 500; white-space: nowrap; }
  .todo-hist > summary::-webkit-details-marker { display: none; }
  .todo-hist > summary:hover { background: var(--nav-hover); color: var(--ink-soft); }
  .todo-hist > summary > svg { width: 12px; height: 12px; transition: transform var(--dur-move) var(--ease-quint); }
  .todo-hist[open] > summary > svg { transform: rotate(90deg); }
  .todo-hist > summary > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-weight: 400; }
  .todo-history { display: grid; gap: 2px; margin: 4px 0 0; padding: 0; list-style: none; }
  .todo-history li { display: grid; grid-template-columns: 132px minmax(0, 1fr) auto; align-items: center; gap: 10px; min-height: 30px; color: var(--ink-soft); font-size: 12px; }
  .todo-history time { color: var(--faint); font-variant-numeric: tabular-nums; }
  .todo-history li.is-reverted span { color: var(--muted); text-decoration: line-through; text-decoration-color: var(--faint); }

  /* The side block: dates and place are attributes of the todo, not its subject. One row each, the whole row is the control. */
  .todo-rail { grid-area: rail; align-self: start; position: sticky; top: 0; display: grid; gap: 4px; padding: 8px; border-radius: var(--r-card); background: var(--surface-soft); }
  .todo-rail-group { display: grid; min-width: 0; }
  .todo-rail-group + .todo-rail-group { margin-top: 4px; padding-top: 8px; border-top: 1px solid var(--line); }
  .todo-rail-label { padding: 2px 8px 4px; color: var(--muted); font-size: 12px; font-weight: 500; }
  .todo-prop { box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0; min-height: 36px; padding: 0 6px 0 8px; border: 0; border-radius: var(--r-control); background: transparent; color: var(--ink-soft); font: inherit; font-size: 13px; text-align: left; cursor: pointer; transition: background-color var(--dur-hover) var(--ease-quint); }
  button.todo-prop:hover, .todo-prop[aria-expanded="true"] { background: var(--nav-hover); }
  button.todo-prop:active { background: var(--nav-press); }
  .todo-prop:focus-visible { outline: var(--focus-stroke); outline-offset: -2px; }
  .todo-prop > svg:first-child { color: var(--muted); }
  .todo-prop > svg:last-child { width: 12px; height: 12px; color: var(--faint); }
  .todo-prop-name { flex: none; }
  .todo-prop-value { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; color: var(--ink); font-weight: 500; font-variant-numeric: tabular-nums; }
  .todo-prop-value.is-unset { color: var(--faint); font-weight: 400; }
  .todo-prop-value.is-late { color: var(--red); }
  .todo-prop--switch { cursor: default; }
  .todo-prop--switch > .mw-switch { margin-left: auto; }
  .todo-seen { padding: 2px 8px 6px; font-size: 12px; }
  /* The row above already says where it is kept; here only who can see it. */
  .todo-seen .placement-bar > .placement-bar-where { display: none; }
  .todo-seen .placement-bar > .placement-bar-access { display: inline-flex; border-left: 0; }

  /* Popovers grow from the control that opened them. */
  .todo-pop { position: absolute; z-index: 20; box-sizing: border-box; max-height: calc(100% - 16px); overflow: auto; transform-origin: var(--todo-pop-origin, 100%) 0; animation: craft-drop var(--dur-move) var(--ease-quint) both; }
  .todo-pop[hidden], .todo-pop [hidden], .todo-pop-scrim { display: none; }
  .todo-pop[data-up] { transform-origin: var(--todo-pop-origin, 100%) 100%; }
  .todo-pop.mw-menu { min-width: 232px; }
  .todo-menu-ring { display: inline-grid; place-items: center; width: 16px; height: 16px; flex: none; }
  .mw-menu__item--described > .todo-menu-ring { grid-area: 1 / 1; align-self: center; }
  .todo-menu-tick { display: none; grid-area: 1 / 3; margin-left: auto; }
  .todo-menu-tick > svg { width: 14px; height: 14px; color: var(--ink); }
  [aria-checked="true"] > .todo-menu-tick { display: inline-grid; }
  .todo-date { width: 292px; padding: 8px; }
  .todo-pop .mw-menu__item > small:not(.mw-menu__desc) { flex: none; margin-left: auto; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .todo-date hr { margin: 6px 4px; border: 0; border-top: 1px solid var(--line); }
  .todo-date .mw-calendar { width: auto; padding: 2px 4px 4px; }
  .todo-date .mw-calendar__header .mw-btn { width: 24px; min-width: 24px; min-height: 24px; padding: 0; }
  .todo-time { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 4px 8px; padding: 0 8px 4px; font-size: 13px; }
  .todo-time > hr { grid-column: 1 / -1; width: 100%; margin-inline: -4px; }
  .todo-time > label { color: var(--ink-soft); }
  .todo-time-row { display: flex; align-items: center; gap: 4px; }
  .todo-time-row > .mw-input { box-sizing: border-box; width: 64px; min-height: 28px; margin-right: 4px; padding: 0 8px; text-align: center; font-variant-numeric: tabular-nums; }
  .todo-time-row > .mw-toggle { min-height: 26px; padding: 0 8px; font-size: 12px; font-variant-numeric: tabular-nums; }
  .todo-time > small, .todo-pop-hint { grid-column: 1 / -1; color: var(--muted); font-size: 12px; }
  .todo-pop-hint { margin: 0; padding: 8px 8px 6px; border-top: 1px solid var(--line); text-wrap: pretty; }
  .todo-pop-foot { display: flex; justify-content: space-between; padding: 4px 4px 0; }
  .todo-pop-foot > :last-child { margin-left: auto; }
  .todo-link-pop { display: grid; gap: 8px; width: 320px; padding: 8px; }
  .todo-link-pop > .mw-toggle-group { display: flex; }
  .todo-link-pop > .mw-toggle-group > .mw-toggle { flex: 1; padding: 0 6px; white-space: nowrap; }
  .todo-link-list { display: grid; grid-template-columns: minmax(0, 1fr); max-height: 204px; overflow: hidden auto; }
  /* A long name is cut, with the status still in view at the end of the row. */
  .todo-link-list > .mw-menu__item > [data-slot="menu-item-label"] { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .todo-link-list > .todo-none { padding: 8px 12px; }
  .todo-toast { position: absolute; left: 0; right: 0; bottom: 16px; z-index: 22; display: flex; justify-content: center; pointer-events: none; }
  .todo-toast[hidden], .todo-toast [hidden] { display: none; }
  .todo-toast > .mw-toast { pointer-events: auto; max-width: calc(100% - 32px); }

  @container todo-detail (max-width: 1020px) {
    .todo-editor { grid-template-columns: minmax(0, 1fr) 280px; column-gap: 28px; padding-inline: 24px; }
  }
  /* No room for two columns: the side block moves under the head, dates and place side by side; the writing follows. */
  @container todo-detail (max-width: 880px) {
    .todo-editor { grid-template-columns: minmax(0, 1fr); grid-template-areas: "alert" "head" "rail" "main"; }
    .todo-head { margin-bottom: 20px; }
    .todo-rail { position: static; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0 12px; margin-bottom: 28px; }
    .todo-rail-group + .todo-rail-group { margin-top: 0; padding-top: 0; padding-left: 12px; border-top: 0; border-left: 1px solid var(--line); }
  }
  /* A phone: one column; the two actions share a row under the status; rows are 44 high; popovers rise from the bottom. */
  @container todo-detail (max-width: 560px) {
    .todo-bar { padding: 0 48px 0 4px; }
    .todo-editor { display: flex; flex-direction: column; gap: 24px; padding: 4px 16px 40px; }
    /* Read the notes first, then the attributes. */
    .todo-main { display: contents; }
    .todo-alert { order: -1; margin: 0; }
    .todo-head { grid-template-columns: minmax(0, 1fr); grid-template-areas: "title" "line" "acts"; row-gap: 10px; margin: 0; }
    .todo-now, .todo-works { order: 1; }
    .todo-detail .todo-editor textarea.todo-notes { order: 2; width: auto; margin-block: -8px; }
    .todo-rail { order: 3; grid-template-columns: minmax(0, 1fr); align-self: stretch; margin: 0; }
    .todo-section, .todo-hist { order: 4; }
    .todo-acts { margin-top: 6px; }
    .todo-acts > .mw-btn { flex: 1; min-height: 44px; justify-content: center; }
    .todo-detail .todo-more { position: static; }
    .todo-more > summary { position: absolute; top: 8px; right: 8px; }
    .todo-more-menu, .todo-pop { position: absolute; left: 8px !important; right: 8px; top: auto !important; bottom: 8px; z-index: 41; width: auto !important; min-width: 0; animation-name: mw-toast-in; }
    .todo-more[open]::before, .todo-pop-scrim:not([hidden]) { content: ""; display: block; position: absolute; inset: 0; z-index: 19; background: var(--scrim); animation: craft-fade-in var(--dur-move) var(--ease-quint) both; }
    .todo-more[open]::before { z-index: 40; }
    .todo-state { height: 32px; min-height: 32px; }
    .todo-fact[data-optional] { display: none; }
    .todo-rail-group + .todo-rail-group { margin-top: 4px; padding: 8px 0 0; border-left: 0; border-top: 1px solid var(--line); }
    .todo-prop, .todo-link, .todo-pop .mw-menu__item, .todo-more-menu .mw-menu__item { min-height: 44px; }
    .todo-wait { grid-template-columns: minmax(0, 1fr); }
    .todo-wait > :is(.mw-input, .mw-btn) { min-height: 44px; font-size: 16px; }
    .todo-history li { grid-template-columns: minmax(0, 1fr) auto; }
    .todo-history li time { grid-column: 1 / -1; margin-bottom: -4px; }
    .todo-hist > summary { white-space: normal; }
  }
  /* The fields of an organizing candidate being corrected (review). */
  .todo-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; margin: 0; padding: 0; border: 0; font-size: 12px; color: var(--muted); }

  @media (max-width: 720px), (pointer: coarse) {
    .todo-chrome { flex-direction: column; align-items: stretch; }
    .todo-search { width: auto; flex: 1; }
    .todo-row { grid-template-columns: 32px 44px minmax(0, 1fr); }
    .todo-pick { opacity: 1; }
    .todo-done { width: 44px; height: 44px; }
    body.immersive-workbench .plugin-stage-list .todo-row > .todo-entry.mw-stage-entry { grid-template-columns: minmax(0, 1fr); grid-template-areas: "title" "meta" "trail"; }
    .todo-trail { justify-content: flex-start; }
    .todo-quick-meta .mw-btn--primary { width: 100%; justify-content: center; }
  }
  @media (prefers-reduced-motion: reduce) {
    .todo-pick, .todo-name, .todo-notes, .todo-state, .todo-prop, .todo-unlink, .todo-hist > summary > svg { transition: none; }
    .todo-pop, .todo-more-menu, .todo-now, .todo-pop-scrim, .todo-more[open]::before, .todo-state.is-arriving > .mw-state-ring { animation: none; }
  }
`;
