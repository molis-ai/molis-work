/** Approved quiet start page; all colors inherit the active workbench theme. */
export const PROJECT_HOME_STYLES = `
  body.immersive-workbench .immersive-workspace .immersive-plugin-stage > .immersive-home,
  body.immersive-workbench .tab-pane-body > .immersive-home { padding: 54px 40px 36px; }
  .immersive-home .project-home-content { width: 100%; max-width: 800px; min-height: 100%; margin: 0 auto; display: flex; flex-direction: column; }
  .immersive-home .home-context { display: grid; grid-template-columns: minmax(0, 1fr) 200px; align-items: center; gap: 40px; width: 100%; max-width: 670px; margin: clamp(0px, 3vh, 34px) auto 0; }
  .immersive-home .home-date-year { font-size: 12px; color: var(--muted); margin: 0 0 10px; }
  .immersive-home .home-today { display: flex; flex-wrap: wrap; align-items: baseline; gap: 13px; margin: 0; color: var(--ink); }
  .immersive-home .home-today time { font-size: 30px; font-weight: 500; letter-spacing: -.035em; line-height: 1.3; }
  .immersive-home .home-today > span { font-size: 12px; font-weight: 400; color: var(--muted); }
  .immersive-home .home-reflection { margin-top: 29px; }
  .immersive-home .home-quote-pages { display: grid; min-height: 112px; transition: opacity 160ms ease; }
  .immersive-home [data-home-quote] { grid-area: 1 / 1; align-self: start; min-width: 0; visibility: visible; }
  .immersive-home .home-quote-pages * { transition: none; }
  .immersive-home [data-home-quote][aria-hidden="true"] { visibility: hidden; }
  .immersive-home .home-quote-pages.is-changing { opacity: 0; }
  .immersive-home figure { margin: 0; }
  .immersive-home blockquote { margin: 0; padding: 0; border: 0; font: 17px/1.85 "Songti SC", "Noto Serif CJK SC", "STSong", Georgia, serif; letter-spacing: .015em; color: var(--muted); overflow-wrap: anywhere; }
  .immersive-home figcaption { margin-top: 9px; font-size: 11px; color: var(--muted); line-height: 1.6; }
  .immersive-home figcaption a { font-size: 11px; color: var(--muted); text-decoration: none; }
  .immersive-home figcaption a:hover { color: var(--blue); text-decoration: underline; text-underline-offset: 3px; }
  .immersive-home .home-calendar { width: 200px; }
  .immersive-home .home-calendar > header { display: flex; align-items: center; justify-content: space-between; gap: 4px; margin-bottom: 13px; padding-inline: 4px; }
  .immersive-home [data-home-month] { font-size: 12px; font-weight: 500; }
  .immersive-home .home-month-actions { display: flex; gap: 3px; }
  .immersive-home .home-month-actions button { width: 27px; height: 27px; display: grid; place-items: center; border: 0; border-radius: 5px; background: transparent; color: var(--muted); padding: 0; cursor: pointer; }
  .immersive-home .home-month-actions button:hover { background: var(--nav-active); color: var(--ink); }
  .immersive-home .home-month-actions svg { width: 13px; height: 13px; }
  .immersive-home .home-calendar table { width: 100%; table-layout: fixed; border-collapse: collapse; text-align: center; font-size: 11px; }
  .immersive-home .home-calendar th { height: 25px; padding: 0; font-weight: 400; color: var(--muted); border: 0; }
  .immersive-home .home-calendar td { height: 27px; padding: 0; border: 0; color: var(--muted); }
  .immersive-home .home-calendar td span { width: 25px; height: 25px; display: inline-grid; place-items: center; border-radius: 50%; }
  .immersive-home .home-calendar td.home-calendar-outside { color: var(--faint); opacity: .55; }
  .immersive-home .home-calendar td[aria-current="date"] span { background: var(--blue); color: var(--paper); font-weight: 600; }
  .immersive-home .home-launch { width: 100%; max-width: 740px; margin: auto auto 0; padding-top: 70px; }
  .immersive-home .home-composer { display: flex; align-items: center; gap: 16px; width: 100%; height: 76px; padding: 12px 17px 12px 24px; border: 1px solid var(--line); border-radius: 23px; background: var(--rail); box-shadow: 0 4px 16px color-mix(in srgb, var(--ink) 5%, transparent); }
  .immersive-home .home-agent-icon { display: grid; place-items: center; flex: none; color: var(--faint); }
  .immersive-home .home-agent-icon svg { width: 21px; height: 21px; }
  .immersive-home .home-composer input { flex: 1; width: 100%; min-width: 0; padding: 8px 0; border: 0; background: transparent; color: var(--faint); font: inherit; font-size: 17px; opacity: .7; -webkit-text-fill-color: var(--faint); cursor: not-allowed; }
  .immersive-home .home-composer input::placeholder { color: var(--faint); opacity: 1; }
  .immersive-home .home-send { flex: none; display: grid; place-items: center; width: 38px; height: 38px; padding: 0; border: 0; border-radius: 11px; background: var(--nav-active); color: var(--faint); cursor: not-allowed; }
  .immersive-home .home-send svg { width: 19px; height: 19px; transform: rotate(-90deg); }
  .immersive-home .home-agent-note { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 12px 0 0; color: var(--muted); font-size: 11px; }
  .immersive-home .home-agent-note svg { width: 12px; height: 12px; }
  .immersive-home :is(button, a, input):focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
  .immersive-home ::selection { color: var(--ink); background: var(--blue-soft); }
  body.immersive-workbench .home-shortcut-dialog { width: min(360px, calc(100vw - 40px)); max-height: calc(100dvh - 40px); padding: 25px; border: 1px solid var(--control-border); border-radius: var(--radius-surface); background: var(--paper); color: var(--ink); box-shadow: var(--control-shadow); }
  body.immersive-workbench .home-shortcut-dialog::backdrop { background: #11121655; }
  body.immersive-workbench .home-shortcut-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 22px; }
  body.immersive-workbench .home-shortcut-dialog h2 { margin: 0; font-size: 16px; font-weight: 500; }
  body.immersive-workbench .home-shortcut-dialog header button { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 5px; color: var(--muted); background: transparent; cursor: pointer; }
  body.immersive-workbench .home-shortcut-dialog header svg { width: 16px; height: 16px; }
  body.immersive-workbench .home-shortcut-dialog label { display: grid; gap: 7px; margin-top: 15px; color: var(--muted); font-size: 12px; }
  body.immersive-workbench .home-shortcut-dialog input { width: 100%; height: var(--control-h); min-height: var(--control-h); padding: 0 10px; border: 1px solid var(--control-input); border-radius: var(--radius-control); background: var(--paper); color: var(--ink); font: inherit; font-size: 14px; caret-color: var(--ink); }
  body.immersive-workbench .home-shortcut-dialog input::placeholder { color: var(--muted); opacity: 1; }
  body.immersive-workbench .home-shortcut-form-error { min-height: 17px; margin: 10px 0 0; color: var(--red); font-size: 11px; line-height: 1.6; }
  body.immersive-workbench .home-shortcut-dialog footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 22px; }
  body.immersive-workbench .home-shortcut-dialog footer button { min-height: var(--control-h); padding: 0 var(--control-pad-x); border: 1px solid var(--control-border); border-radius: var(--radius-control); color: var(--ink); background: var(--control-fill); font: inherit; cursor: pointer; }
  body.immersive-workbench .home-shortcut-dialog .home-shortcut-remove { margin-right: auto; color: var(--red); background: transparent; border-color: transparent; }
  body.immersive-workbench .home-shortcut-dialog .home-shortcut-save { color: var(--action-ink); background: var(--action); border-color: var(--action); }
  .immersive-home .home-quote-next { display: inline-flex; align-items: center; margin-top: 8px; min-height: var(--control-h); gap: 6px; font: inherit; font-size: 12px; color: var(--muted); cursor: pointer; }
  .immersive-home .home-quote-next svg { width: 14px; height: 14px; flex: none; }
  .immersive-home .home-goals-entry { display:inline-flex; align-items:center; margin-bottom:16px; gap:8px; font:inherit; font-size:13px; cursor:pointer; }
  .immersive-home .home-goals-entry svg { width:14px; height:14px; }
  @media (prefers-reduced-motion: reduce) { .immersive-home .home-quote-pages { transition: none; } }
  @container plugin-stage (max-width: 640px) {
    body.immersive-workbench .immersive-workspace .immersive-plugin-stage > .immersive-home,
    body.immersive-workbench .tab-pane-body > .immersive-home { padding: 38px 26px 28px; }
    .immersive-home .home-context { grid-template-columns: minmax(0, 1fr) 180px; gap: 22px; }
    .immersive-home .home-calendar { width: 180px; }
    .immersive-home .home-today time { font-size: 27px; }
    .immersive-home .home-composer input { font-size: 15px; }
  }
  @container plugin-stage (max-width: 450px) {
    body.immersive-workbench .immersive-workspace .immersive-plugin-stage > .immersive-home,
    body.immersive-workbench .tab-pane-body > .immersive-home { padding: 30px 20px 26px; }
    .immersive-home .home-context { grid-template-columns: minmax(0, 1fr); gap: 20px; margin-top: 0; }
    .immersive-home .home-date-panel { text-align: center; }
    .immersive-home .home-today { justify-content: center; }
    .immersive-home .home-reflection { margin-top: 20px; }
    .immersive-home .home-calendar { width: 224px; margin-inline: auto; }
    .immersive-home .home-calendar td { height: 28px; }
    .immersive-home .home-launch { padding-top: 46px; }
    .immersive-home .home-composer { height: 70px; padding-left: 17px; gap: 11px; }
    .immersive-home .home-composer input { font-size: 14px; }
    body.immersive-workbench .home-shortcut-dialog input { font-size: 16px; }
  }
  @media (pointer: coarse) { .immersive-home .home-month-actions button, body.immersive-workbench .home-shortcut-dialog header button { width: 44px; height: 44px; } }
`;
