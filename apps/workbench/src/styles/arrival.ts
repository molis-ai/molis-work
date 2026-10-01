import { BACKGROUND_TASKS_MENU_STYLES } from "./background-tasks.js";

/**
 * Arrival: the three screens a person passes through on the way in — the project chooser, the opening and Welcome
 * questions, and the new-project journey — drawn in one frame (specs/project-arrival-flow). The titlebar, the stage and
 * the bottom bar never move; a screen changes what is inside them. Controls and parts are the `mw-*` components; this
 * sheet only lays them out. Tokens only: gradients are the new person's opening and the Welcome questions (the
 * onboarding's ambient light) and the goal card's warm light.
 */
export const ARRIVAL_STYLES = String.raw`
  :root { --arrival-titlebar-h: 44px; }
  html:has(> body.arrival-page), body.arrival-page { height: 100dvh; max-height: 100dvh; overflow: hidden; overscroll-behavior: none; background: var(--desk); }
  body.arrival-page { margin: 0; caret-color: var(--ink); color: var(--ink); }
  body.arrival-page ::selection { background: color-mix(in srgb, var(--accent) 22%, transparent); color: var(--ink); }
  .icon-sprite { position: absolute; width: 0; height: 0; overflow: hidden; pointer-events: none; }
  .arrival { height: 100dvh; display: grid; grid-template-rows: var(--arrival-titlebar-h) minmax(0, 1fr) var(--dock-h, 76px); background: var(--desk); color: var(--ink); }
  :where(.arrival) :is(h1, h2, p) { margin: 0; }
  :where(.arrival) :is(ol, ul) { margin: 0; padding: 0; list-style: none; }
  .arrival :focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset, 1px); }
  /* A heading focused by the program (a new screen) is not a control; it shows no ring. */
  .arrival [tabindex="-1"]:focus-visible { outline: none; }
  .arrival-titlebar { grid-row: 1; position: relative; display: flex; align-items: center; gap: 14px; min-width: 0; padding: 0 12px 0 20px; }
  body[data-native-desktop="true"] .arrival-titlebar { padding-left: var(--desktop-window-safe-inline-start, 88px); }
  .arrival-stage { grid-row: 2; position: relative; min-width: 0; min-height: 0; overflow: hidden; }
  .arrival .arrival-bar { grid-row: 3; }
  .stage-split { height: 100%; display: grid; grid-template-columns: var(--side-w, 320px) minmax(0, 1fr); padding-right: var(--sheet-inset, 14px); }
  .stage-single { height: 100%; padding: 0 var(--sheet-inset, 14px); }
  .stage-single > .stage-sheet { height: 100%; }
  .stage-side { min-width: 0; min-height: 0; overflow: hidden; }
  .stage-sheet { position: relative; min-width: 0; min-height: 0; overflow: auto; border-radius: var(--r-sheet, 14px); background: var(--paper); box-shadow: var(--sheet-shadow); scrollbar-width: thin; }
  /* A sheet or pane that scrolls takes the keyboard's focus when it has nothing to focus inside; its ring sits inside, where the stage's edge cannot cut it. */
  body.arrival-page :is(.stage-sheet, .stage-side)[tabindex="0"]:focus-visible { outline-offset: -2px; }

  /* ───────── Titlebar ───────── */
  .arrival-brand { display: inline-flex; align-items: center; gap: 8px; color: var(--ink); }
  .arrival-brand > svg { width: 20px; height: 20px; stroke-width: 1.6; }
  .arrival-spacer { flex: 1; min-width: 0; }
  /* The caption belongs to the chooser; any other screen rests it and gives its place back. */
  .arrival:not([data-screen="chooser"]) .arrival-titlebar .mw-caption { opacity: 0; visibility: hidden; pointer-events: none; }
  .arrival[data-screen="chooser"] .arrival-titlebar .mw-caption { transition-delay: 0s; }
  .arrival-tools { display: flex; align-items: center; gap: 2px; }
  .arrival-tools .mw-btn { color: var(--ink-soft); }
  .arrival-tools .mw-btn:hover:not(:disabled) { color: var(--ink); }
  .arrival-bg { position: relative; display: inline-flex; }
  .arrival-bg .mw-btn { padding-right: 34px; }
  .arrival-bg .mw-btn[hidden] { display: none; }
  .arrival-bg [data-background-tasks-count] { position: absolute; right: 9px; top: 50%; transform: translateY(-50%); min-width: 17px; height: 17px; padding: 0 5px; border-radius: 9px; background: var(--action); color: var(--action-ink); font-size: 11px; font-weight: var(--weight-control, 500); line-height: 17px; text-align: center; font-variant-numeric: tabular-nums; pointer-events: none; }
  .arrival-bg [data-background-tasks-count][hidden], .arrival-bg:has(.mw-btn[hidden]) [data-background-tasks-count] { display: none; }
  .arrival[data-screen="opening"] .arrival-tools { visibility: hidden; }
  /* The way on arrives a moment after the name has been typed (any key or click ends the typing at once, and a still page has it already). */
  .arrival[data-screen="opening"] .arrival-bar .bar-end { opacity: 0; visibility: hidden; transform: translateY(8px); }
  .arrival[data-screen="opening"]:has(.opening.is-ready) .arrival-bar .bar-end { opacity: 1; visibility: visible; transform: none; transition: opacity var(--dur-arrive, 420ms) var(--ease-quint), transform var(--dur-arrive, 420ms) var(--ease-quint); }
  .arrival[data-screen="welcome"] .arrival-global { display: none; }
  .arrival-theme { display: none; }
  .arrival[data-screen="welcome"] .arrival-theme { display: inline-flex; }

  /* ───────── The bar: the same .workbench-bar, three blocks whose contents change ───────── */
  .arrival-bar .bar-start { grid-column: 1; gap: 8px; }
  .arrival-bar .bar-center { grid-column: 2; }
  .arrival-bar .bar-end { grid-column: 3; gap: 8px; }
  .arrival-bar :is(.bar-start, .bar-center, .bar-end):empty { visibility: hidden; }
  /* Only the chooser's bar has the Assistant to keep room for. The journey's centre is a status: it gives way to the way back and the buttons (a longer language, a narrower window), and the steps go first. */
  @media (min-width: 601px) {
    html body.immersive-workbench.arrival-page .arrival-bar:not([data-bar="chooser"]) { grid-template-columns: auto minmax(0, 1fr) auto; }
  }
  @media (max-width: 900px) { .arrival-bar .mw-steps { display: none; } }
  .arrival-bar .mw-btn--lg { min-height: 38px; padding-inline: 16px; border-radius: var(--r-control, 8px); }
  .arrival-bar .mw-btn--ghost.arrival-back { padding-inline: 12px 14px; color: var(--ink-soft); }
  .arrival-bar .mw-btn--ghost.arrival-back:hover:not(:disabled) { color: var(--ink); }
  .arrival-bar .bar-end .mw-btn--lg[hidden] { display: none; }
  /* A link that cannot go (nothing matches the search) looks and acts like a disabled button. */
  .arrival-bar .mw-btn[aria-disabled="true"] { opacity: .42; cursor: not-allowed; pointer-events: none; }

  /* ───────── Chooser: the directory on the desk, the brief on the sheet ───────── */
  .chooser { --side-w: clamp(296px, 24vw, 344px); }
  .chooser-list { display: flex; flex-direction: column; gap: 12px; padding: 4px 8px 6px 14px; }
  .chooser-head { padding: 2px 8px 0; }
  .chooser-greeting { display: grid; gap: 2px; }
  .chooser-greeting strong { font-size: 15px; font-weight: var(--weight-title, 600); letter-spacing: -.02em; color: var(--ink); }
  .chooser-greeting span { font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chooser-search { min-height: 36px; background: var(--paper); box-shadow: 0 0 0 1px var(--control-border); }
  .chooser-search:hover { background: var(--paper); box-shadow: 0 0 0 1px var(--control-input); }
  .chooser-search:focus-within { box-shadow: none; }
  /* The group carries the focus ring; the field inside it adds none of its own (a second halo around the text). */
  body.arrival-page .chooser-search .mw-input:focus-visible { box-shadow: none; border-color: transparent; outline: none; }
  .chooser-search svg { width: 16px; height: 16px; }
  .chooser-search__key { flex: none; display: inline-flex; }
  .chooser-search__key .mw-kbd { min-height: 18px; padding: 0 6px; font-size: 11px; line-height: 18px; border-radius: 5px; border: 0; background: var(--control-fill); }
  .chooser-dir { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 1px; margin: 0 -8px; padding: 0 8px 8px; scrollbar-width: thin; }
  .chooser-dir > [data-slot="directory-heading"] { padding: 10px 8px 4px; }
  .chooser-dir .mw-dir-row--meta { height: auto; min-height: 46px; padding-block: 6px; border-radius: var(--r-row, 10px); }
  .chooser-dir .mw-dir-row--meta .mw-dir-row__copy { grid-template-rows: 18px 16px; row-gap: 1px; }
  .chooser-none { padding: 20px 8px; color: var(--muted); font-size: 13px; }
  .chooser-none[hidden] { display: none; }
  .chooser-foot { display: flex; align-items: center; gap: 8px; padding: 0 8px; color: var(--faint); font-size: 12px; }
  .chooser-foot svg { width: 14px; height: 14px; }
  .chooser-detail { padding: 0; }
  .chooser-error { padding: 24px 8px 8px; justify-items: start; text-align: left; }
  .chooser-error > p { margin: 0 0 14px; }
  .brief-none { align-self: center; min-height: 100%; justify-content: center; }
  .brief-none .mw-empty { max-width: 30em; margin: 0 auto; text-align: left; justify-items: start; }
  .brief-none__actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
  /* A button named for what the person typed gives way with an ellipsis rather than run past the sheet. */
  .brief-none__actions .mw-btn { min-width: 0; max-width: 100%; }
  .brief-none__actions .mw-btn [data-slot="button-label"] { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mw-brief--loading .mw-brief__focus { margin-top: 36px; }
  .mw-brief--error .mw-empty { margin: 36px 0 0; justify-items: start; text-align: left; }

  /* ───────── Opening: the first screen a new person sees ───────── */
  .opening { --ob-warm: color-mix(in srgb, var(--accent) 26%, transparent); --ob-cool: color-mix(in srgb, var(--ink) 9%, transparent); isolation: isolate; overflow: hidden; display: grid; align-items: end; padding: clamp(32px, 5vw, 72px); }
  .opening-glow { position: absolute; inset: 0; z-index: -1; pointer-events: none; background: radial-gradient(ellipse 65% 74% at 0% 4%, var(--ob-warm), transparent 100%), radial-gradient(ellipse 65% 78% at 100% 100%, var(--ob-cool), transparent 100%); }
  html[data-resolved-theme="dark"] .opening-glow { opacity: .5; }
  .opening-copy { display: grid; gap: clamp(20px, 3vh, 36px); }
  .opening-caption .mw-caption { font-size: 30px; letter-spacing: -.03em; margin: 0; padding: 0; }
  .ob-greeting-wordmark { font-size: 0; line-height: 0; }
  .ob-greeting-wordmark .mw-wordmark { font-size: 200px; font-weight: var(--weight-control, 500); letter-spacing: -.05em; line-height: .86; }
  @media (max-width: 1280px) { .ob-greeting-wordmark .mw-wordmark { font-size: 160px; } }
  @media (max-width: 1024px) { .ob-greeting-wordmark .mw-wordmark { font-size: 128px; } }
  @media (max-width: 760px) { .ob-greeting-wordmark .mw-wordmark { font-size: 96px; } .opening-caption .mw-caption { display: inline-grid; font-size: 20px; } }
  @media (max-width: 480px) { .ob-greeting-wordmark .mw-wordmark { font-size: 68px; } }
  /* The name is about 4.8 times as wide as its size; these steps keep it inside the opening's side room down to the narrowest phone. */
  @media (max-width: 400px) { .ob-greeting-wordmark .mw-wordmark { font-size: 56px; } }
  @media (max-width: 340px) { .ob-greeting-wordmark .mw-wordmark { font-size: 48px; } }
  .ob-greeting-wordmark .mw-wordmark__caret { height: .035em; width: .2em; bottom: .06em; left: calc(100% + .04em); background: currentColor; }

  /* ───────── Welcome: one question at a time ───────── */
  .welcome { --ob-warm: color-mix(in srgb, var(--accent) 26%, transparent); --ob-cool: color-mix(in srgb, var(--ink) 9%, transparent); isolation: isolate; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: stretch; }
  .welcome::before { content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none; background: radial-gradient(ellipse 65% 74% at 0% 4%, var(--ob-warm), transparent 100%), radial-gradient(ellipse 65% 78% at 100% 100%, var(--ob-cool), transparent 100%); }
  html[data-resolved-theme="dark"] .welcome::before { opacity: .5; }
  .welcome-q { align-self: center; padding: 0 clamp(32px, 7vw, 120px); }
  .welcome-q h1 { font-size: 30px; font-weight: var(--weight-title, 600); letter-spacing: -.035em; line-height: 1.25; outline: none; }
  .welcome-q > p { margin-top: 12px; max-width: 40ch; color: var(--muted); font-size: 13px; line-height: 1.8; }
  .welcome-options { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 24px; }
  .welcome-label { margin-top: 28px; color: var(--muted); font-size: 12px; font-weight: var(--weight-control, 500); }
  .welcome-label + .welcome-options { margin-top: 12px; }
  .welcome-scene { display: grid; place-items: center; min-width: 0; }
  .ob-greeting { text-align: center; }
  .ob-greeting strong { display: block; font-size: 72px; font-weight: var(--weight-control, 500); letter-spacing: -.035em; line-height: 1.3; }
  .ob-greeting strong[lang="zh"] { font-size: 66px; }
  .ob-greeting span { display: block; margin-top: 16px; color: var(--muted); font-size: 12px; letter-spacing: .03em; }
  .ob-mini { width: min(340px, 100%); padding: 12px 12px 0; border-radius: 14px; background: var(--desk); box-shadow: var(--lift-1); }
  .ob-mini-surface { padding: 16px 16px 4px; border-radius: 10px; background: var(--paper); box-shadow: var(--sheet-shadow); }
  .ob-mini-title { display: block; width: 74px; height: 7px; margin-bottom: 12px; border-radius: 4px; background: var(--ink); opacity: .72; }
  .ob-mini-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--line); }
  html[data-density="compact"] .ob-mini-row { padding: 8px 0; }
  .ob-mini-row:last-child { border-bottom: 0; }
  .ob-mini-row i { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 7px; background: var(--rail); color: var(--ink-soft); }
  .ob-mini-row i svg { width: 12px; height: 12px; }
  .ob-mini-row span { flex: 1; display: grid; gap: 4px; }
  .ob-mini-row b { display: block; height: 6px; border-radius: 3px; background: var(--ink); opacity: .5; }
  .ob-mini-row s { display: block; height: 4px; border-radius: 2px; background: var(--line-strong); }
  .ob-mini-bar { display: flex; align-items: center; gap: 8px; height: 44px; }
  .ob-mini-dock { display: flex; gap: 4px; }
  .ob-mini-dock i { width: 14px; height: 14px; border-radius: 4px; background: var(--line-strong); }
  .ob-mini-dock i.is-on { background: var(--paper); box-shadow: var(--lift-1); }
  .ob-mini-composer { flex: 1; display: flex; align-items: center; gap: 6px; height: 22px; padding: 0 8px; border-radius: 8px; background: var(--paper); box-shadow: var(--lift-1); }
  .ob-mini-composer i { width: 6px; height: 6px; border-radius: 50%; background: var(--line-strong); }
  .ob-mini-composer em { flex: 1; height: 4px; border-radius: 2px; background: var(--line); }
  .ob-mini-avatar { width: 16px; height: 16px; border-radius: 50%; background: var(--accent); }

  /* ───────── New project: the question and its sources on the desk, the materials on the sheet ───────── */
  .onboard { --side-w: clamp(380px, 31vw, 460px); }
  .ob-left { display: flex; flex-direction: column; gap: 16px; overflow: auto; padding: 8px 14px 12px 20px; scrollbar-width: thin; }
  .ob-q h1 { font-size: 24px; font-weight: var(--weight-title, 600); line-height: 1.3; letter-spacing: -.02em; outline: none; }
  .ob-q p { margin-top: 6px; max-width: 34em; color: var(--muted); font-size: 13px; line-height: 1.7; }
  .ob-right { padding: 28px clamp(24px, 3.4vw, 48px) 32px; scrollbar-width: thin; }
  .ob-right.is-empty { display: grid; align-items: center; }
  .ob-right > .mw-empty { max-width: 30em; margin: 0; padding: 0; text-align: left; justify-items: start; }
  .ob-quick { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
  .ob-stage-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 8px; }
  .ob-stage-head h2 { font-size: 15px; font-weight: var(--weight-title, 600); letter-spacing: -.02em; }
  .ob-stage-head span { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .ob-stage-head b { color: var(--ink); font-weight: var(--weight-title, 600); font-size: 15px; }
  .ob-label { color: var(--muted); font-size: 12px; font-weight: var(--weight-control, 500); }
  .ob-note { display: flex; align-items: flex-start; gap: 8px; color: var(--muted); font-size: 12px; line-height: 1.7; }
  .ob-note svg { flex: none; width: 14px; height: 14px; margin-top: 3px; }
  .ob-note.is-warn svg { color: var(--amber); }
  .ob-error { display: flex; align-items: center; gap: 8px; color: var(--red); font-size: 12px; }
  .ob-error[hidden] { display: none; }
  .ob-error svg { width: 14px; height: 14px; flex: none; }
  .ob-quiet { color: var(--muted); font-size: 13px; }
  .ob-sources { display: flex; flex-direction: column; gap: 1px; margin: 0 -8px; }
  .ob-source .mw-dir-row--meta { height: auto; min-height: 48px; padding-block: 7px; border-radius: var(--r-row, 10px); }
  .ob-source .mw-dir-row--meta .mw-dir-row__copy { grid-template-rows: 18px 16px; row-gap: 1px; }
  .ob-source .mw-dir-row__count { color: var(--faint); font-size: 12px; }
  .ob-source.has-items .mw-dir-row__count { color: var(--green); font-weight: var(--weight-control, 500); }
  .ob-source .is-unavailable { opacity: .55; }
  .ob-source__cfg { display: grid; gap: 14px; padding: 6px 12px 18px 32px; }
  .ob-cfg-block { display: grid; gap: 8px; }
  .ob-cfg-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .ob-cfg-actions .ob-note { flex-basis: 100%; }
  .ob-picks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .ob-source__cfg .mw-choice { width: 100%; justify-content: space-between; }
  .ob-meters { display: grid; gap: 14px; padding: 16px; border-radius: var(--r-card, 12px); background: var(--paper); box-shadow: 0 0 0 1px var(--line); }
  .ob-meter p { display: flex; justify-content: space-between; margin-bottom: 8px; color: var(--muted); font-size: 12px; }
  .ob-meter p b { color: var(--ink); font-size: 15px; font-weight: var(--weight-title, 600); font-variant-numeric: tabular-nums; }
  .ob-meter .mw-progress > span { background: var(--ink-soft); }
  .ob-meters.is-over .mw-progress > span { background: var(--red); }
  .ob-model { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 12px 12px 12px 16px; border-radius: var(--r-card, 12px); background: var(--paper); box-shadow: 0 0 0 1px var(--line); }
  .ob-model__dot { width: 8px; height: 8px; border-radius: 50%; background: var(--faint); }
  .ob-model__dot.is-on { background: var(--green); box-shadow: 0 0 0 3px color-mix(in srgb, var(--green) 18%, transparent); }
  .ob-model__text { min-width: 0; display: grid; }
  .ob-model__text strong { font-size: 13px; font-weight: var(--weight-control, 500); line-height: 18px; }
  .ob-model__text small { font-size: 12px; line-height: 16px; color: var(--muted); }
  .ob-left .mw-collapsible { font-size: 13px; }
  .ob-left .mw-collapsible p { color: var(--muted); font-size: 12px; line-height: 1.7; }
  .ob-phases { display: flex; flex-direction: column; gap: 4px; }
  .ob-phase { display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; gap: 12px; padding: 8px 10px; border-radius: var(--r-row, 10px); }
  .ob-phase.is-progress { background: var(--nav-active); }
  .ob-phase__mark { display: grid; place-items: center; width: 28px; height: 28px; color: var(--faint); }
  .ob-phase__mark svg { width: 18px; height: 18px; }
  .ob-phase.is-done .ob-phase__mark { color: var(--green); }
  .ob-phase.is-progress .ob-phase__mark { color: var(--accent); }
  .ob-phase__text { display: grid; }
  .ob-phase__text strong { font-size: 13px; font-weight: var(--weight-control, 500); line-height: 18px; }
  .ob-phase.is-idle .ob-phase__text strong { color: var(--muted); font-weight: var(--weight-body, 400); }
  .ob-phase__text small { font-size: 12px; line-height: 16px; color: var(--muted); }
  .ob-right .mw-progress { height: 4px; }
  .ob-right .mw-progress > span { background: var(--accent); }
  .ob-name { display: grid; gap: 6px; }
  .ob-name__input.mw-input { min-height: 44px; padding: 0 2px; border: 0; border-radius: 0; border-bottom: 1.5px solid var(--line-strong); background: transparent; font-size: 20px; font-weight: var(--weight-title, 600); letter-spacing: -.02em; box-shadow: none; }
  .ob-name__input.mw-input:focus, .ob-name__input.mw-input:focus-visible { border-color: var(--accent); box-shadow: none; outline: none; background: transparent; }
  .ob-name__input::placeholder { color: var(--faint); font-weight: var(--weight-body, 400); }
  .ob-preview { margin: -28px calc(-1 * clamp(24px, 3.4vw, 48px)) 8px; }
  .ob-preview .mw-brief { width: min(100%, 860px); padding-top: 32px; padding-bottom: 8px; }
  .ob-preview .mw-brief__cols { grid-template-columns: minmax(0, 1fr); margin-top: 24px; }
  .ob-resume { display: flex; align-items: center; gap: 8px; margin: -4px 0 0; padding: 8px 12px; border-radius: var(--r-row, 10px); background: var(--accent-soft); color: var(--ink-soft); font-size: 12px; }
  .ob-resume svg { width: 14px; height: 14px; color: var(--accent); flex: none; }
  .ob-resume span { flex: 1; }
  .ob-notice { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: var(--r-row, 10px); background: var(--surface-soft); color: var(--ink-soft); font-size: 12px; }
  .ob-notice svg { width: 14px; height: 14px; flex: none; }
  .ob-notice span { flex: 1; }
  .ob-update-list { display: grid; gap: 12px; margin-top: 8px; }
  .ob-update-list li { display: grid; gap: 2px; }
  .ob-update-list strong { font-size: 13px; font-weight: var(--weight-control, 500); }
  .ob-update-list span { color: var(--muted); font-size: 12px; line-height: 1.7; }
  .cx-citation { display: inline; padding: 0 2px; border: 0; background: none; color: var(--accent); font: inherit; cursor: pointer; }
  .ob-error-page { padding: 48px clamp(24px, 6vw, 96px); max-width: 640px; }
  .ob-error-page h1 { font-size: 24px; font-weight: var(--weight-title, 600); line-height: 1.3; letter-spacing: -.02em; outline: none; }
  .ob-error-page > p { margin-top: 8px; color: var(--muted); font-size: 13px; line-height: 1.7; }
  .ob-error-page .mw-empty { margin: 0; padding: 0; justify-items: start; text-align: left; }
  .cx-error { margin: 0; color: var(--red); font-size: 12px; line-height: 1.6; }
  .cx-error:empty { display: none; }
  .cx-hint { margin: 0; }
  .cx-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .cx-summary { font-size: 13px; line-height: 1.9; overflow-wrap: anywhere; }
  .cx-summary p { margin: 0 0 12px; white-space: pre-wrap; }
  .cx-summary h3 { margin: 18px 0 6px; font-size: 15px; font-weight: var(--weight-title, 600); }
  .cx-summary-editor { min-height: 200px; resize: vertical; line-height: 1.85; }
  .cx-sources { display: grid; gap: 2px; }
  .cx-reference { display: block; width: 100%; padding: 8px 0; border: 0; border-bottom: 1px solid var(--line); background: transparent; color: var(--ink); font: inherit; font-size: 12px; text-align: left; overflow-wrap: anywhere; cursor: pointer; transition: color var(--dur-hover, 130ms) var(--ease-quint); }
  .cx-reference:hover { color: var(--accent); }
  .cx-reference span { display: block; color: var(--accent); font-size: 11px; font-weight: var(--weight-control, 500); }
  .cx-source-meta { color: var(--muted); font-size: 12px; }
  .cx-issues { margin-top: 8px; }
  .cx-draft { align-items: start; grid-template-columns: minmax(0, 1fr) auto; padding-block: 8px; }
  .cx-draft .mw-file-row__label { align-items: flex-start; }
  .cx-draft .mw-check { margin-top: 2px; }
  .cx-draft-copy { display: grid; gap: 2px; min-width: 0; }
  .cx-draft .mw-file-row__name { white-space: normal; overflow: visible; }
  .cx-draft-meta, .cx-draft-evidence { color: var(--muted); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
  .cx-draft-evidence { color: var(--faint); }
  .ob-name > .ob-label + .mw-input { margin: 0; }
  .cx-dialog { width: min(560px, calc(100vw - 48px)); max-height: min(calc(100dvh - 96px), 720px); padding: 20px 24px; border: 0; border-radius: var(--r-dialog, 16px); background: var(--paper); color: var(--ink); box-shadow: var(--lift-3); }
  .cx-dialog::backdrop { background: var(--scrim); }
  .cx-source-body { max-height: 320px; overflow: auto; white-space: pre-wrap; font-size: 13px; line-height: 1.7; }

  /* ───────── The hand-off between screens: a quiet stage while the next one is made ───────── */
  .arrival-toasts { position: absolute; z-index: 30; left: 50%; bottom: calc(var(--dock-h, 76px) + 12px); transform: translateX(-50%); }
  @media (max-width: 980px) {
    .welcome { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto; align-content: center; }
    .welcome-scene { display: none; }
    .arrival-tools .mw-btn [data-slot="button-label"] { display: none; }
    .arrival-bg .mw-btn { padding-right: 30px; }
  }
  @media (max-width: 760px) {
    .stage-split { padding-right: 0; }
    .stage-sheet { border-radius: var(--r-sheet, 14px) var(--r-sheet, 14px) 0 0; }
    .stage-single { padding: 0; }
    .mw-caption { display: none; }
    .ob-left { padding-inline: 14px; }
    .ob-right { padding-inline: 20px; }
  }
  /* Narrow and tall (a phone upright): the directory stacks over the sheet and is capped, so the sheet keeps most of the stage; the directory keeps room for two rows and its footnote steps aside.
     Narrow and short (a phone on its side): the two columns stay, each scrolling on its own. */
  @media (max-width: 560px), (max-width: 760px) and (min-height: 521px) {
    .stage-split { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
    .stage-split > .stage-side { max-height: 36vh; overflow: auto; }
    .chooser-dir { min-height: 104px; }
    .chooser-foot { display: none; }
  }
  @media (max-width: 600px) {
    /* A phone's bar is two rows (the assistant on one, the rest on the other), the workbench's own geometry. */
    html body.immersive-workbench.arrival-page .arrival { grid-template-rows: var(--arrival-titlebar-h) minmax(0, 1fr) auto; }
    html body.immersive-workbench.arrival-page .arrival > .arrival-bar { grid-row: 3; }
    .arrival-titlebar { padding-left: 14px; }
    .mw-bar-context__text, .mw-btn__key { display: none; }
    /* The three blocks never share a cell: the status on its own row, the way back and the actions below it (the actions wrap rather than run under it). */
    html body.immersive-workbench.arrival-page .arrival-bar { grid-template-columns: auto minmax(0, 1fr); grid-template-rows: auto auto; gap: 4px 8px; padding-block: 8px max(8px, env(safe-area-inset-bottom)); }
    html body.immersive-workbench.arrival-page .arrival-bar .bar-center { grid-column: 1 / -1; grid-row: 1; }
    html body.immersive-workbench.arrival-page .arrival-bar .bar-start { grid-column: 1; grid-row: 2; }
    html body.immersive-workbench.arrival-page .arrival-bar .bar-end { grid-column: 2; grid-row: 2; justify-self: stretch; flex-wrap: wrap; justify-content: flex-end; }
    .arrival-bar .mw-steps { display: none; }
    .arrival-bar .bar-end .mw-btn--secondary:has(svg) [data-slot="button-label"] { display: none; }
    .arrival-bar .bar-end .mw-btn--secondary:has(svg) { min-width: 38px; padding-inline: 0; }
    .arrival-bar .arrival-back [data-slot="button-label"] { display: none; }
    .arrival-bar .arrival-back:not(:has(svg)) [data-slot="button-label"] { display: inline; }
    .mw-bar-status__text small { display: none; }
    .welcome-q { padding-inline: 28px; }
    .welcome-q h1 { font-size: 24px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .arrival *, .arrival *::before, .arrival *::after { animation-duration: .01ms; animation-iteration-count: 1; transition-duration: .01ms; }
  }
  ${BACKGROUND_TASKS_MENU_STYLES}
`;
