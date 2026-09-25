/** Three-column project home: date cards, today's stream, event dock. */
export const PROJECT_HOME_STYLES = `
  body.immersive-workbench .immersive-workspace .immersive-plugin-stage > .immersive-home,
  body.immersive-workbench .tab-pane-body > .immersive-home {
    padding: 8px 10px 12px 8px; height: 100%; min-height: 0; overflow: hidden;
    display: flex; flex-direction: column; position: relative;
  }
  .immersive-home .home-flow {
    --dot-me: color-mix(in srgb, var(--ink) 30%, transparent);
    --dot-org: var(--accent, var(--blue));
    flex: 1; min-height: 0; min-width: 0;
    display: grid;
    grid-template-columns: 104px minmax(0, 1fr) 0px;
    column-gap: 12px;
    transition: padding-right 190ms cubic-bezier(.16, 1, .3, 1);
  }
  .immersive-home[data-event="on"] .home-flow {
    grid-template-columns: 104px minmax(0, 1fr) clamp(300px, 26vw, 372px);
    padding-right: 6px;
  }
  .immersive-home .home-dates { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  .immersive-home .home-dates__label {
    flex: none; padding: 8px 10px 10px; color: var(--faint);
    font-size: 11px; letter-spacing: .04em; margin: 0;
  }
  .immersive-home .home-dates__list {
    flex: 1; min-height: 0; overflow: auto; scrollbar-width: none;
    display: flex; flex-direction: column; gap: 2px; padding-bottom: 8px;
  }
  .immersive-home .home-dates__list::-webkit-scrollbar { width: 0; }
  .immersive-home .home-day {
    flex: none; display: flex; flex-direction: column; gap: 6px;
    width: 100%; padding: 9px 10px 10px;
    border: 0; border-radius: 11px; background: transparent;
    color: var(--muted); font: inherit; text-align: left; cursor: pointer;
  }
  .immersive-home .home-day:hover { background: var(--nav-hover); color: var(--ink-soft); }
  .immersive-home .home-day.is-on {
    color: var(--ink); background: var(--nav-raised);
    box-shadow: var(--surface-shadow), inset 0 0 0 1px var(--hairline);
  }
  .immersive-home .home-day__n { display: flex; align-items: baseline; gap: 5px; }
  .immersive-home .home-day__n b {
    font-size: 21px; font-weight: 400; line-height: 1; letter-spacing: -.035em;
    font-variant-numeric: tabular-nums; color: inherit;
  }
  .immersive-home .home-day__n em { font-style: normal; font-size: 11px; color: var(--faint); }
  .immersive-home .home-day.is-on .home-day__n em { color: var(--muted); }
  .immersive-home .home-day__n s {
    width: 5px; height: 5px; margin-left: 1px; border-radius: 50%;
    background: var(--accent, var(--blue)); text-decoration: none;
  }
  .immersive-home .home-day__dots { display: flex; align-items: center; gap: 3px; height: 6px; }
  .immersive-home .home-day__dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--dot-me); }
  .immersive-home .home-day__dots i[data-k="org"] { background: var(--dot-org); }
  .immersive-home .home-day__dots u { width: 11px; height: 1px; background: var(--line-strong); text-decoration: none; }

  .immersive-home .home-dayview {
    min-width: 0; min-height: 0; overflow: hidden;
    display: flex; flex-direction: column;
    border-radius: 14px; background: var(--paper);
    box-shadow: inset 0 0 0 1px var(--hairline);
  }
  .immersive-home .home-hero { flex: none; max-width: 40rem; padding: 26px 28px 22px; }
  .immersive-home .home-hero__eyebrow {
    display: flex; align-items: center; gap: 6px;
    margin: 0 0 12px; color: var(--faint); font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .immersive-home .home-hero__eyebrow svg { width: 13px; height: 13px; }
  .immersive-home .home-hero__date { margin: 0; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .immersive-home .home-hero__date time {
    font-size: 34px; font-weight: 400; letter-spacing: -.04em; line-height: 1.04;
    font-variant-numeric: tabular-nums;
  }
  .immersive-home .home-hero__date span { color: var(--muted); font-size: 14px; }
  .immersive-home .home-hero__today {
    align-self: center; height: 20px; padding: 0 9px; border-radius: 5px;
    background: var(--blue-soft, var(--nav-hover)); color: var(--accent, var(--blue));
    font-size: 11px; line-height: 20px;
  }
  .immersive-home .home-hero__sum {
    margin: 18px 0 0; max-width: 32ch;
    font-size: 19px; font-weight: 400; letter-spacing: -.025em; line-height: 1.45;
  }
  .immersive-home .home-hero__lead { margin: 9px 0 0; max-width: 56ch; color: var(--muted); line-height: 1.72; }
  .immersive-home .home-hero__stats {
    display: flex; align-items: center; gap: 16px;
    margin: 20px 0 0; color: var(--faint); font-size: 12px;
  }
  .immersive-home .home-hero__stats span { display: inline-flex; align-items: center; gap: 6px; }
  .immersive-home .home-hero__stats i { width: 5px; height: 5px; border-radius: 50%; background: var(--dot-me); }
  .immersive-home .home-hero__stats i[data-k="org"] { background: var(--dot-org); }
  .immersive-home .home-hero__stats b { font-weight: 400; color: var(--ink-soft); font-variant-numeric: tabular-nums; }

  .immersive-home .home-tl { flex: 1; min-height: 0; overflow: auto; padding: 0 16px 18px; border-top: 1px solid var(--line); }
  .immersive-home :is(.home-tl__head, .home-tl__rows) { max-width: calc(40rem - 32px); }
  .immersive-home .home-tl__head {
    display: flex; align-items: center; gap: 7px;
    padding: 15px 8px 9px; color: var(--faint); font-size: 12px;
  }
  .immersive-home .home-tl__head svg { width: 13px; height: 13px; }
  .immersive-home .home-tl__head span { margin-left: auto; font-variant-numeric: tabular-nums; }
  .immersive-home .home-erow {
    --node: var(--muted);
    position: relative; display: grid;
    grid-template-columns: 44px 20px minmax(0, 1fr) auto;
    align-items: center; gap: 0 10px;
    width: 100%; max-width: 40rem; padding: 9px 10px 9px 6px;
    border: 0; border-radius: 10px; background: transparent;
    color: inherit; font: inherit; text-align: left; cursor: pointer;
  }
  .immersive-home .home-erow:hover { background: var(--nav-hover); }
  .immersive-home .home-erow {
    transition: background-color 180ms var(--ease-out, cubic-bezier(.16, 1, .3, 1)), color 180ms var(--ease-out, cubic-bezier(.16, 1, .3, 1));
  }
  .immersive-home .home-erow.is-on { background: color-mix(in srgb, var(--accent, var(--blue)) 11%, transparent); }
  .immersive-home .home-erow__when {
    text-align: right; color: var(--faint); font-size: 12px; font-variant-numeric: tabular-nums;
  }
  .immersive-home .home-erow.is-on .home-erow__when { color: var(--accent, var(--blue)); }
  .immersive-home .home-erow__node { position: relative; align-self: stretch; display: grid; place-items: center; }
  .immersive-home .home-erow__node::before {
    content: ""; position: absolute; top: -5px; bottom: -5px; width: 1px; background: var(--line);
  }
  .immersive-home .home-erow.is-first .home-erow__node::before { top: 50%; }
  .immersive-home .home-erow.is-last .home-erow__node::before { bottom: 50%; }
  .immersive-home .home-erow__dot {
    position: relative; width: 9px; height: 9px; border-radius: 50%;
    background: var(--paper); box-shadow: inset 0 0 0 1.5px var(--node);
  }
  .immersive-home .home-erow[data-k="me"] .home-erow__dot { box-shadow: inset 0 0 0 5px var(--node); }
  .immersive-home .home-erow__main { min-width: 0; padding: 1px 0; }
  .immersive-home .home-erow__main strong {
    display: block; font-weight: 400; color: var(--ink-soft);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .immersive-home .home-erow.is-on .home-erow__main strong,
  .immersive-home .home-erow:hover .home-erow__main strong { color: var(--ink); }
  .immersive-home .home-erow__main small {
    display: flex; align-items: center; gap: 5px; margin-top: 3px;
    color: var(--faint); font-size: 12px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .immersive-home .home-erow__main small svg { width: 11px; height: 11px; flex: none; }
  .immersive-home .home-erow__src {
    display: inline-flex; align-items: center; gap: 5px; height: 21px; padding: 0 8px;
    border-radius: 6px; color: var(--muted); font-size: 11px;
    background: color-mix(in srgb, var(--node) 10%, transparent);
  }
  .immersive-home .home-erow__src svg { width: 12px; height: 12px; color: var(--node); }
  .immersive-home .home-tl__now {
    display: grid; grid-template-columns: 44px 20px minmax(0, 1fr);
    align-items: center; gap: 0 10px; padding: 5px 10px 5px 6px;
  }
  .immersive-home .home-tl__now i { position: relative; display: grid; place-items: center; }
  .immersive-home .home-tl__now i::after {
    content: ""; position: absolute; top: -10px; bottom: -10px; width: 1px; background: var(--line);
  }
  .immersive-home .home-tl__now i::before {
    content: ""; position: relative; z-index: 1;
    width: 7px; height: 7px; border-radius: 50%; background: var(--accent, var(--blue));
  }
  .immersive-home .home-tl__now em { display: flex; align-items: center; gap: 9px; font-style: normal; }
  .immersive-home .home-tl__now u {
    flex: 1; height: 1px; text-decoration: none;
    background: linear-gradient(90deg, color-mix(in srgb, var(--accent, var(--blue)) 40%, transparent), transparent);
  }
  .immersive-home .home-tl__now span { flex: none; color: var(--accent, var(--blue)); font-size: 11px; font-variant-numeric: tabular-nums; }
  .immersive-home .home-tl__empty {
    display: flex; align-items: center; gap: 9px; padding: 14px 10px 20px; color: var(--muted); margin: 0;
  }
  .immersive-home .home-tl__empty svg { width: 15px; height: 15px; color: var(--faint); }

  .immersive-home .home-eventcol {
    min-width: 0; min-height: 0; display: none; flex-direction: column;
  }
  .immersive-home[data-event="on"] .home-eventcol { display: flex; }
  .immersive-home .home-detail {
    --node: var(--muted);
    flex: 1; min-width: 0; min-height: 0;
    display: flex; flex-direction: column; overflow: hidden;
    border-radius: 14px; background: var(--paper);
    box-shadow: inset 0 0 0 1px var(--hairline);
  }
  .immersive-home .home-detail__head {
    flex: none; display: flex; align-items: center; gap: 8px; padding: 11px 10px 9px 14px;
  }
  .immersive-home .home-detail__src {
    display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 9px;
    border-radius: 6px; color: var(--ink-soft); font-size: 11px;
    background: color-mix(in srgb, var(--node) 11%, transparent);
  }
  .immersive-home .home-detail__src svg { width: 12px; height: 12px; color: var(--node); }
  .immersive-home .home-detail__head time { color: var(--faint); font-size: 12px; font-variant-numeric: tabular-nums; }
  .immersive-home .home-detail__head .mw-btn { margin-left: auto; }
  .immersive-home .home-detail__body { flex: 1; min-height: 0; overflow: auto; padding: 6px 18px 18px; }
  .immersive-home .home-detail__body h2 {
    margin: 0; font-size: 20px; font-weight: 400; letter-spacing: -.025em; line-height: 1.32;
  }
  .immersive-home .home-detail__kind {
    display: inline-flex; align-items: center; gap: 5px; margin: 10px 0 0; color: var(--muted); font-size: 12px;
  }
  .immersive-home .home-detail__kind svg { width: 12px; height: 12px; }
  .immersive-home .home-detail__text { margin: 14px 0 0; color: var(--ink-soft); line-height: 1.75; }
  .immersive-home .home-detail__facts { margin: 18px 0 0; border-top: 1px solid var(--line); }
  .immersive-home .home-detail__facts > div {
    display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: 10px;
    padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 12px;
  }
  .immersive-home .home-detail__facts > div:last-child { border-bottom: 0; }
  .immersive-home .home-detail__facts dt { color: var(--faint); }
  .immersive-home .home-detail__facts dd { margin: 0; color: var(--ink-soft); }
  .immersive-home .home-detail__act {
    flex: none; display: flex; flex-wrap: nowrap; align-items: center;
    justify-content: space-between; gap: 8px;
    width: 100%; padding: 8px 10px 9px; border-top: 1px solid var(--line);
  }
  .immersive-home .home-detail__act-left {
    display: flex; flex-wrap: nowrap; align-items: center; gap: 6px; min-width: 0;
  }
  .immersive-home .home-detail__act .mw-btn { --control-h: 28px; --control-pad-x: 9px; font-size: 12px; }
  .immersive-home .home-detail__act [data-home-open-talk] { flex: none; margin-left: auto; }
  .immersive-home .home-detail__error { margin: 0 10px 8px; color: var(--red); font-size: 12px; }

  .immersive-home .home-talk {
    position: absolute; z-index: 28; display: none;
    width: 320px; max-height: min(420px, calc(100% - 24px));
    flex-direction: column; overflow: hidden;
    border-radius: var(--radius-surface); background: var(--paper);
    box-shadow: var(--control-shadow); color: var(--ink);
  }
  .immersive-home[data-dock="open"] .home-talk { display: flex; animation: surface-arrive var(--motion-normal, 190ms) var(--ease-out, cubic-bezier(.16, 1, .3, 1)); }
  @media (prefers-reduced-motion: reduce) {
    .immersive-home .home-erow { transition: none; }
    .immersive-home[data-dock="open"] .home-talk { animation: none; }
  }
  .immersive-home .home-talk[hidden] { display: none !important; }
  .immersive-home .home-talk__head {
    flex: none; display: flex; align-items: center; gap: 8px;
    padding: 11px 10px 11px 14px; border-bottom: 1px solid var(--line);
  }
  .immersive-home .home-talk__head b { font-weight: 400; }
  .immersive-home .home-talk__head span { color: var(--faint); font-size: 12px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .immersive-home .home-talk__head .mw-btn { margin-left: auto; }
  .immersive-home .home-talk__body { flex: 1; min-height: 0; overflow: auto; padding: 14px; color: var(--ink-soft); line-height: 1.6; }
  .immersive-home .home-talk__compose {
    flex: none; display: flex; gap: 8px; align-items: flex-end;
    padding: 10px; border-top: 1px solid var(--line);
  }
  .immersive-home .home-talk__compose .mw-textarea { min-height: 36px; max-height: 96px; }

  .immersive-home .home-enter { opacity: 0; transform: translateY(7px); }
  .immersive-home .home-enter.is-in {
    opacity: 1; transform: none;
    transition: opacity 190ms cubic-bezier(.16, 1, .3, 1), transform 190ms cubic-bezier(.16, 1, .3, 1);
  }
  @media (prefers-reduced-motion: reduce) {
    .immersive-home .home-enter { opacity: 1; transform: none; transition: none; }
  }

  .immersive-home .home-launch { flex: none; width: 100%; margin: 0; padding: 12px 16px 16px; border-top: 1px solid var(--line); }
  .immersive-home .home-shortcuts { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: flex-start; gap: 18px; list-style: none; margin: 0; padding: 0; }
  .immersive-home .home-shortcut { position: relative; width: 88px; text-align: center; }
  .immersive-home .home-shortcut-main { display: flex; flex-direction: column; align-items: center; gap: 9px; width: 88px; padding: 0; border: 0; background: transparent; color: var(--muted); text-decoration: none; font: inherit; cursor: pointer; }
  .immersive-home .home-shortcut-icon { display: grid; place-items: center; width: 43px; height: 43px; border-radius: 50%; background: var(--nav-bg); color: var(--muted); transition: background .15s ease, color .15s ease; }
  .immersive-home .home-shortcut-icon svg { width: 18px; height: 18px; }
  .immersive-home .home-shortcut-main:hover .home-shortcut-icon { background: var(--nav-active); color: var(--ink); }
  .immersive-home .home-shortcut-main > span:last-child { display: block; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; line-height: 1.5; }
  .immersive-home .home-shortcut-add { width: auto; min-width: 88px; }
  .immersive-home .home-shortcut-add .home-shortcut-icon { color: var(--ink); background: var(--nav-hover); }
  .immersive-home .home-shortcut-add .home-shortcut-main { width: auto; min-width: 88px; }
  .immersive-home .home-shortcut-add .home-shortcut-main > span:last-child { width: auto; white-space: nowrap; overflow: visible; }
  .immersive-home .home-shortcut-edit { position: absolute; top: -6px; right: 3px; display: grid; place-items: center; width: 25px; height: 25px; padding: 0; border: 0; border-radius: 50%; color: var(--muted); background: var(--paper); opacity: .6; cursor: pointer; }
  .immersive-home .home-shortcut-edit svg { width: 14px; height: 14px; }
  .immersive-home .home-shortcut:hover .home-shortcut-edit, .immersive-home .home-shortcut-edit:focus-visible { opacity: 1; }
  .immersive-home .home-shortcut-error { font-size: 11px; color: var(--red); text-align: center; line-height: 1.6; margin: 12px 0 0; }
  .immersive-home :is(button, a, input, textarea):focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
  body.immersive-workbench .home-shortcut-dialog { width: min(360px, calc(100vw - 40px)); max-height: calc(100dvh - 40px); padding: 25px; border: 1px solid var(--control-border); border-radius: var(--radius-surface); background: var(--paper); color: var(--ink); box-shadow: var(--control-shadow); }
  body.immersive-workbench .home-shortcut-dialog::backdrop { background: #11121655; }
  body.immersive-workbench .home-shortcut-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 22px; }
  body.immersive-workbench .home-shortcut-dialog h2 { margin: 0; font-size: 16px; font-weight: 400; }
  body.immersive-workbench .home-shortcut-dialog header button { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 5px; color: var(--muted); background: transparent; cursor: pointer; }
  body.immersive-workbench .home-shortcut-dialog header svg { width: 16px; height: 16px; }
  body.immersive-workbench .home-shortcut-dialog label { display: grid; gap: 7px; margin-top: 15px; color: var(--muted); font-size: 12px; }
  body.immersive-workbench .home-shortcut-dialog input { width: 100%; height: var(--control-h); min-height: var(--control-h); padding: 0 10px; border: 1px solid var(--control-input); border-radius: var(--radius-control); background: var(--paper); color: var(--ink); font: inherit; font-size: 14px; caret-color: var(--ink); }
  body.immersive-workbench .home-shortcut-dialog input::placeholder { color: var(--muted); opacity: 1; }
  body.immersive-workbench .home-shortcut-form-error { min-height: 17px; margin: 10px 0 0; color: var(--red); font-size: 11px; line-height: 1.6; }
  body.immersive-workbench .home-shortcut-dialog footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 22px; }
  body.immersive-workbench .home-shortcut-dialog .home-shortcut-remove { margin-right: auto; }
  @media (prefers-reduced-motion: reduce) { .immersive-home .home-shortcut-icon { transition: none; } }
  @container plugin-stage (max-width: 640px) {
    body.immersive-workbench .immersive-workspace .immersive-plugin-stage > .immersive-home,
    body.immersive-workbench .tab-pane-body > .immersive-home { padding: 8px 12px 12px; }
    .immersive-home .home-hero { padding: 18px 16px 16px; }
    .immersive-home .home-hero__date time { font-size: 27px; }
    .immersive-home .home-hero__sum { font-size: 17px; }
    .immersive-home .home-tl { padding: 0 10px 14px; }
    .immersive-home .home-erow { grid-template-columns: 42px 20px minmax(0, 1fr); }
    .immersive-home .home-erow__src { display: none; }
  }
  @container plugin-stage (max-width: 450px) {
    body.immersive-workbench .immersive-workspace .immersive-plugin-stage > .immersive-home,
    body.immersive-workbench .tab-pane-body > .immersive-home { padding: 6px 12px 12px; }
    .immersive-home .home-flow,
    .immersive-home[data-event="on"] .home-flow {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
      row-gap: 8px; padding-right: 0;
    }
    .immersive-home .home-dates { grid-row: 1; }
    .immersive-home :is(.home-dayview, .home-eventcol) { grid-column: 1; grid-row: 2; }
    .immersive-home .home-dates__label { display: none; }
    .immersive-home .home-dates__list { flex-direction: row; gap: 4px; padding: 2px 0 4px; }
    .immersive-home .home-day { width: 58px; padding: 8px 8px 9px; }
    .immersive-home .home-day__dots { justify-content: flex-start; }
    .immersive-home[data-event="on"] .home-dayview { display: none; }
    .immersive-home .home-shortcuts { gap: 11px; }
    .immersive-home .home-talk { width: auto; }
  }
  @media (pointer: coarse) { body.immersive-workbench .home-shortcut-dialog header button { width: 44px; height: 44px; } .immersive-home .home-shortcut-edit { width: 30px; height: 30px; } }
`;
