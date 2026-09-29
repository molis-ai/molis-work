/** Project home, as in the Soft Workbench design: heading, day strip, Goal in progress, events, margin. */
export const PROJECT_HOME_STYLES = `
  body.immersive-workbench .immersive-workspace .immersive-plugin-stage > .immersive-home,
  body.immersive-workbench .tab-pane-body > .immersive-home {
    padding: 0; height: 100%; min-height: 0; overflow: hidden;
    display: flex; flex-direction: column; position: relative; container: project-home / inline-size;
  }
  .immersive-home .home-scroll {
    flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain;
    width: 100%; max-width: 1280px; margin: 0 auto; padding: 48px clamp(28px, 4.3vw, 66px) 32px;
  }
  .immersive-home .home-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin: 0 0 32px; }
  .immersive-home .home-heading__main { min-width: 0; }
  .immersive-home .home-heading h1 { margin: 0; font-size: 30px; font-weight: var(--weight-title, 600); letter-spacing: -.03em; line-height: 1.25; }
  .immersive-home .home-heading__sub {
    display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 8px; margin: 12px 0 0;
    color: var(--muted); font-size: 13px; line-height: 1.7;
  }
  .immersive-home .home-heading__sub i { font-style: normal; color: var(--faint); }
  .immersive-home .home-heading__sub time { font-variant-numeric: tabular-nums; }
  .immersive-home .home-hero__sum { color: var(--ink-soft); }
  .immersive-home .home-heading .craft-greeting { display: inline; margin: 0; color: var(--muted); font-size: inherit; }
  .immersive-home .home-heading .craft-greeting::before { display: none; }
  .immersive-home .home-month {
    flex: none; display: flex; align-items: center; gap: 8px; margin: 0 0 8px;
    color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums;
  }
  .immersive-home .home-month svg { width: 14px; height: 14px; }
  .immersive-home [data-home-event-status] { max-height: 128px; overflow: auto; color: var(--muted); font-size: 12px; line-height: 1.6; }
  .immersive-home [data-home-event-status]:empty { display: none; }
  .immersive-home [data-home-event-status] p { margin: 8px 0; overflow-wrap: anywhere; }
  .immersive-home [data-home-navigation-error] { margin: 0; color: var(--danger, var(--muted)); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }

  /* The day column (strip, Goal in progress, events) and the margin beside it; one column on narrower homes. */
  .immersive-home .home-layout {
    display: grid; grid-template-columns: minmax(0, 1fr) 252px; grid-template-rows: auto auto 1fr;
    grid-template-areas: "dates margin" "focus margin" "events margin"; column-gap: clamp(32px, 4vw, 60px); align-items: start;
  }
  .immersive-home .home-dates { grid-area: dates; }
  .immersive-home .home-focus { grid-area: focus; }
  .immersive-home .home-tl { grid-area: events; min-width: 0; }
  .immersive-home .home-margin { grid-area: margin; }

  /* The day strip: the chosen day is the graphite choice; days with events carry a few quiet dots. */
  .immersive-home .home-dates { --dot-me: color-mix(in srgb, var(--ink) 28%, transparent); --dot-org: var(--accent);
    display: flex; align-items: center; gap: 8px; margin: 0 0 24px; min-width: 0; }
  .immersive-home .home-dates__list { display: flex; gap: 8px; min-width: 0; overflow-x: auto; scrollbar-width: none; padding: 4px 4px 8px; margin: -4px -4px -8px; }
  .immersive-home .home-dates__list::-webkit-scrollbar { height: 0; }
  .immersive-home .home-day {
    position: relative; flex: none; display: flex; flex-direction: column; align-items: center; justify-content: center;
    width: 55px; height: 70px; padding: 0; border: 0; border-radius: 10px; background: transparent;
    color: var(--ink); font: inherit; cursor: pointer;
    transition: background-color var(--dur-move) var(--ease-quint), color var(--dur-move) var(--ease-quint), box-shadow var(--dur-move) var(--ease-quint), transform var(--dur-move) var(--ease-spring);
  }
  .immersive-home .home-day:hover:not(.is-on) { background: var(--nav-hover); }
  .immersive-home .home-day:active { transform: scale(.97); transition-duration: var(--dur-press); }
  .immersive-home .home-day__w { color: var(--muted); font-size: 12px; line-height: 1.2; }
  .immersive-home .home-day__n { margin-top: 4px; font-size: 20px; font-weight: var(--weight-control, 500); line-height: 1.2; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
  .immersive-home .home-day__today { position: absolute; bottom: 5px; font-style: normal; font-size: 12px; line-height: 1; color: var(--accent); }
  .immersive-home .home-day__dots { position: absolute; bottom: 7px; display: flex; gap: 4px; height: 4px; }
  .immersive-home .home-day__dots i { width: 4px; height: 4px; border-radius: 50%; background: var(--dot-me); }
  .immersive-home .home-day__dots i[data-k="org"] { background: var(--dot-org); }
  .immersive-home .home-day__dots u { width: 8px; height: 1px; align-self: center; background: var(--line-strong); text-decoration: none; }
  .immersive-home .home-day.is-on { color: var(--action-ink); background: var(--action); box-shadow: var(--lift-1); }
  .immersive-home .home-day.is-on :is(.home-day__w, .home-day__today) { color: inherit; opacity: .75; }
  .immersive-home .home-day.is-on .home-day__dots i { background: color-mix(in srgb, var(--action-ink) 60%, transparent); }
  .immersive-home .home-dates__line { flex: 1; min-width: 12px; height: 1px; margin: 0 4px 0 12px; background: var(--line); }
  .immersive-home .home-today { flex: none; color: var(--muted); }

  /* The Goal in progress: a raised card with warm light, the one continue action and real child progress. */
  .immersive-home .home-focus {
    position: relative; isolation: isolate; overflow: hidden; min-height: 296px;
    padding: 24px 32px 24px; border-radius: 14px; background: var(--surface-soft);
  }
  .immersive-home .home-focus[hidden] { display: none; }
  .immersive-home .home-focus::before {
    content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
    background: radial-gradient(ellipse at 96% 4%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 75%);
  }
  .immersive-home .home-focus__top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 24px; color: var(--ink-soft); font-size: 12px; }
  .immersive-home .home-focus__top > span:first-child { display: inline-flex; align-items: center; gap: 8px; }
  .immersive-home .home-focus__top svg { width: 14px; height: 14px; }
  .immersive-home .home-focus__status { display: inline-flex; align-items: center; gap: 8px; color: var(--accent); font-weight: var(--weight-control, 500); }
  .immersive-home .home-focus__status i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .immersive-home .home-focus__status.is-attention { color: var(--amber); }
  .immersive-home .home-focus h2 {
    position: relative; z-index: 1; max-width: min(24ch, calc(100% - 200px)); margin: 0;
    font-size: 30px; font-weight: var(--weight-title, 600); line-height: 1.4; letter-spacing: -.025em; text-wrap: balance;
  }
  .immersive-home .home-focus > p {
    position: relative; z-index: 1; max-width: min(34em, calc(100% - 200px)); margin: 12px 0 0;
    color: var(--ink-soft); font-size: 13px; line-height: 1.85;
  }
  .immersive-home .home-focus__bottom { position: relative; z-index: 1; display: flex; align-items: center; flex-wrap: wrap; gap: 16px; margin-top: 32px; }
  .immersive-home .home-focus__bottom .mw-btn svg { width: 14px; height: 14px; }
  .immersive-home .home-focus__progress { display: flex; flex-direction: column; gap: 8px; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .immersive-home .home-focus__bar { display: block; width: 65px; height: 3px; border-radius: 2px; background: var(--line); overflow: hidden; }
  .immersive-home .home-focus__bar > span { display: block; height: 100%; background: var(--accent); }
  .immersive-home .home-focus__art { position: absolute; right: 45px; top: 86px; width: 175px; height: 190px; pointer-events: none; }
  .immersive-home .home-focus__sheet {
    position: absolute; width: 123px; height: 158px; padding: 24px 16px; border-radius: 10px;
    background: var(--paper); box-shadow: var(--shadow-raised);
  }
  .immersive-home .home-focus__sheet.is-back { right: 0; top: 0; transform: rotate(9deg); opacity: .5; }
  .immersive-home .home-focus__sheet.is-front { left: 0; top: 10px; transform: rotate(-8deg); }
  .immersive-home .home-focus__sheet.is-front > i { display: block; width: 74%; height: 4px; margin: 0 0 8px; border-radius: 2px; background: var(--line); }
  .immersive-home .home-focus__sheet.is-front > i:first-child { width: 45%; height: 5px; margin-bottom: 12px; background: var(--ink-soft); opacity: .7; }
  .immersive-home .home-focus__sheet.is-front > i:nth-child(3) { width: 50%; margin-bottom: 16px; }
  .immersive-home .home-focus__sheet b { display: flex; align-items: center; gap: 4px; margin-top: 8px; color: var(--green); }
  .immersive-home .home-focus__sheet b.is-open { color: var(--muted); }
  .immersive-home .home-focus__sheet b svg { width: 12px; height: 12px; }
  .immersive-home .home-focus__sheet b i { width: 67%; height: 3px; border-radius: 2px; background: var(--line); }

  /* The day's events: a quiet list; a row opens in place to show the event, its facts and its actions. */
  .immersive-home .home-tl { margin-top: 32px; }
  .immersive-home .home-layout:has(> .home-focus[hidden]) .home-tl { margin-top: 8px; }
  .immersive-home .home-tl__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .immersive-home .home-tl__head h2 { display: flex; align-items: baseline; gap: 8px; margin: 0; font-size: 13px; font-weight: var(--weight-title, 600); }
  .immersive-home .home-tl__head small { color: var(--muted); font-size: 12px; font-weight: 400; font-variant-numeric: tabular-nums; }
  .immersive-home .home-tl__head > span { color: var(--muted); font-size: 12px; }
  .immersive-home .home-tl__head > span b { color: var(--ink-soft); font-weight: var(--weight-control, 500); font-variant-numeric: tabular-nums; }
  .immersive-home .home-tl__rows { margin-top: 12px; }
  .immersive-home .home-erow-wrap { border-bottom: 1px solid var(--line); }
  .immersive-home .home-erow {
    display: flex; align-items: center; gap: 16px; width: 100%; min-height: 76px; padding: 12px 8px 12px 0;
    border: 0; border-radius: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
    transition: background-color var(--dur-hover) var(--ease-quint);
  }
  .immersive-home .home-erow:hover .home-erow__main strong { color: var(--ink); }
  .immersive-home .home-erow__when { flex: none; width: 38px; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .immersive-home :is(.home-erow__icon) {
    flex: none; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 9px;
    background: var(--rail); color: var(--ink-soft);
  }
  .immersive-home .home-erow__icon svg { width: 16px; height: 16px; }
  .immersive-home .home-erow__main { flex: 1; min-width: 0; }
  .immersive-home .home-erow__main strong {
    display: block; font-size: 13px; font-weight: var(--weight-control, 500); line-height: 1.6; color: var(--ink);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .immersive-home .home-erow__main small {
    display: block; margin-top: 4px; color: var(--muted); font-size: 12px; line-height: 1.6;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .immersive-home .home-erow__chev { flex: none; display: grid; place-items: center; width: 24px; color: var(--muted); }
  .immersive-home .home-erow__chev svg { width: 14px; height: 14px; transition: transform var(--dur-move) var(--ease-quint); }
  .immersive-home .home-erow[aria-expanded="true"] .home-erow__chev svg { transform: rotate(180deg); }
  .immersive-home .home-erow__slot { padding: 0 8px 24px 96px; animation: craft-rise var(--dur-arrive) var(--ease-quint) both; }
  .immersive-home .home-tl__now { display: flex; align-items: center; gap: 12px; padding: 12px 0 12px 0; }
  .immersive-home .home-tl__now span { flex: none; color: var(--accent); font-size: 12px; font-weight: var(--weight-control, 500); font-variant-numeric: tabular-nums; }
  .immersive-home .home-tl__now u { flex: 1; height: 1px; background: color-mix(in srgb, var(--accent) 34%, transparent); text-decoration: none; }
  .immersive-home .home-tl__empty { margin: 0; padding: 16px 0 24px; color: var(--muted); }
  .immersive-home .home-empty { padding: 48px 16px 32px; text-align: center; color: var(--muted); }
  .immersive-home .home-empty > svg { width: 20px; height: 20px; margin-bottom: 12px; color: var(--ink-soft); stroke-width: 1.6; }
  .immersive-home .home-empty h3 { margin: 0 0 8px; color: var(--ink-soft); font-size: 15px; font-weight: var(--weight-control, 500); }
  .immersive-home .home-empty p { margin: 0; font-size: 12px; line-height: 1.8; }
  .immersive-home .home-empty .mw-btn { margin-top: 16px; }
  .immersive-home .home-empty .mw-btn svg { width: 14px; height: 14px; }

  /* The event detail, opened inside its row: the row already names the source and time. */
  .immersive-home .home-detail-holder { display: none; }
  .immersive-home .home-detail { position: relative; display: block; min-width: 0; }
  .immersive-home .home-detail__head { position: absolute; top: -2px; right: 0; display: flex; }
  .immersive-home .home-detail__head > :not([data-home-close-event]) { display: none; }
  .immersive-home .home-detail__body { padding: 0 48px 0 0; }
  .immersive-home .home-detail__body > h2, .immersive-home .home-detail__kind { display: none; }
  .immersive-home .home-detail__text { margin: 0; color: var(--ink-soft); font-size: 13px; line-height: 1.85; }
  .immersive-home .home-detail__facts { margin: 16px 0 0; border-top: 1px solid var(--line); }
  .immersive-home .home-detail__facts > div {
    display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: 12px;
    padding: 12px 0; border-bottom: 1px solid var(--line); font-size: 12px;
  }
  .immersive-home .home-detail__facts > div:last-child { border-bottom: 0; }
  .immersive-home .home-detail__facts dt { color: var(--muted); font-weight: 400; }
  .immersive-home .home-detail__facts dd { margin: 0; color: var(--ink-soft); }
  .immersive-home .home-detail__act {
    display: flex; flex-direction: column; align-items: stretch; gap: 8px; width: 100%; margin-top: 16px;
  }
  /* The actions stay first so offers arriving later never move them from under the pointer. */
  .immersive-home .home-detail__primary { order: -1; }
  .immersive-home .home-detail__act-left {
    display: flex; flex-wrap: nowrap; align-items: center; gap: 8px; min-width: 0;
  }
  .immersive-home .home-detail__primary { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .immersive-home .home-offers-controls { display: flex; flex-wrap: wrap; gap: 8px; }
  .immersive-home [data-home-offers] { min-width: 0; max-height: 240px; overflow: auto; }
  .immersive-home [data-home-offers]:empty { display: none; }
  .immersive-home [data-home-offers] p { margin: 8px 0; color: var(--muted); font-size: 12px; }
  .immersive-home [data-home-offers] [role="alert"] { color: var(--red); }
  .immersive-home .home-offers-result { margin-top: 8px; font-size: 12px; }
  .immersive-home .home-offers-result summary { cursor: pointer; }
  .immersive-home .home-offers-result pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 140px; overflow: auto; }
  @media (pointer: coarse) { .immersive-home :is([data-home-offer], [data-home-offers-reload], [data-home-events-reload], [data-home-open-target]) { min-height: 44px; } }
  .immersive-home .home-detail__act .mw-btn { --control-h: 28px; --control-pad-x: 9px; font-size: 12px; }
  .immersive-home .home-detail__act [data-home-open-talk] { flex: none; margin-left: auto; }

  .immersive-home .home-talk {
    position: absolute; z-index: 28; display: none;
    width: 320px; max-height: min(420px, calc(100% - 24px));
    flex-direction: column; overflow: hidden;
    border-radius: 16px; background: var(--paper);
    box-shadow: var(--shadow); color: var(--ink);
  }
  .immersive-home[data-dock="open"] .home-talk { display: flex; animation: surface-arrive var(--motion-normal, 250ms) var(--ease-quint); }
  @media (prefers-reduced-motion: reduce) {
    .immersive-home .home-erow { transition: none; }
    .immersive-home[data-dock="open"] .home-talk { animation: none; }
  }
  .immersive-home .home-talk[hidden] { display: none !important; }
  .immersive-home .home-talk__head {
    flex: none; display: flex; align-items: center; gap: 8px;
    padding: 12px 12px 12px 16px; border-bottom: 1px solid var(--line);
  }
  .immersive-home .home-talk__head b { font-weight: var(--weight-control, 500); }
  .immersive-home .home-talk__head span { color: var(--faint); font-size: 12px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .immersive-home .home-talk__head .mw-btn { margin-left: auto; }
  .immersive-home .home-talk__body { flex: 1; min-height: 0; overflow: auto; padding: 16px; color: var(--ink-soft); line-height: 1.6; }
  .immersive-home .home-talk-targets { margin: 0 0 12px; }
  .immersive-home .home-talk-target { display: flex; align-items: center; gap: 8px; padding: 8px 0; cursor: pointer; }
  .immersive-home .home-talk-target span { display: grid; gap: 4px; min-width: 0; }
  .immersive-home .home-talk-target b { font-size: 13px; font-weight: 500; overflow-wrap: anywhere; }
  .immersive-home .home-talk-target small { color: var(--muted); font-size: 12px; }
  .immersive-home .home-talk-controls { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .immersive-home .home-talk-context { margin: 12px 0; font-size: 12px; }
  .immersive-home .home-talk-context summary { cursor: pointer; color: var(--muted); }
  .immersive-home .home-talk-context pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; max-height: 180px; overflow: auto; }
  .immersive-home .home-talk-status { margin: 12px 0 0; }
  .immersive-home .home-talk-error { color: var(--red); margin: 8px 0 0; }
  .immersive-home .home-talk-destination { margin: 0; overflow-wrap: anywhere; }
  @media (pointer: coarse) {
    .immersive-home .home-talk :is(.mw-btn, .home-talk-target) { min-height: 44px; }
    .immersive-home .home-talk__compose .mw-textarea { font-size: 16px; }
  }
  .immersive-home .home-talk__compose {
    flex: none; display: flex; gap: 8px; align-items: flex-end;
    padding: 12px; border-top: 1px solid var(--line);
  }
  .immersive-home .home-talk__compose .mw-textarea { min-height: 36px; max-height: 96px; }

  .immersive-home .home-enter { opacity: 0; transform: translateY(7px); }
  .immersive-home .home-enter.is-in {
    opacity: 1; transform: none;
    transition: opacity var(--dur-arrive) var(--ease-quint), transform var(--dur-arrive) var(--ease-quint);
  }
  @media (prefers-reduced-motion: reduce) {
    .immersive-home .home-enter { opacity: 1; transform: none; transition: none; }
  }


  /* The margin: a note kept in this browser, the things at hand, and one quiet line. */
  .immersive-home .home-margin { min-width: 0; padding-top: 4px; }
  .immersive-home .home-note { padding: 24px 16px 16px; border-radius: 12px; background: var(--surface-soft); box-shadow: var(--lift-1); }
  .immersive-home .home-note__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .immersive-home .home-note__head h2 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 13px; font-weight: var(--weight-title, 600); white-space: nowrap; }
  .immersive-home .home-note__head h2 svg { width: 16px; height: 16px; }
  .immersive-home .home-note__head span { color: var(--muted); font-size: 12px; line-height: 20px; text-align: right; }
  .immersive-home .home-note__text {
    display: block; width: 100%; min-height: 150px; margin: 16px 0 8px; padding: 0; resize: vertical;
    border: 0; background: transparent; color: var(--ink); font: inherit; font-size: 13px; line-height: 2; box-shadow: none;
  }
  .immersive-home .home-note__text::placeholder { color: var(--muted); }
  .immersive-home .home-note__text:focus-visible { outline: var(--focus-stroke); outline-offset: 3px; border-radius: 4px; }
  .immersive-home .home-note__foot { display: flex; align-items: center; justify-content: space-between; color: var(--muted); font-size: 12px; }
  .immersive-home .home-note__foot svg { width: 14px; height: 14px; }
  .immersive-home .home-launch { margin-top: 32px; }
  .immersive-home .home-launch > h2 { margin: 0 0 12px; color: var(--muted); font-size: 12px; font-weight: var(--weight-control, 500); }
  .immersive-home :is(.home-quick, .home-shortcuts) { list-style: none; margin: 0; padding: 0; }
  .immersive-home .home-shortcut { position: relative; }
  .immersive-home :is(.home-quick__item, .home-shortcut-main) {
    display: flex; align-items: center; gap: 12px; width: calc(100% + 16px); min-height: 60px; margin-inline: -8px; padding: 12px 8px;
    /* The separator is drawn inside the 8px bleed so it lines up with the column; the wash uses the full row. */
    border: 0; border-radius: 8px; background: linear-gradient(var(--line) 0 0) 8px 100% / calc(100% - 16px) 1px no-repeat;
    color: var(--ink); font: inherit; font-size: 13px; text-align: left; text-decoration: none; cursor: pointer;
    transition: background-color var(--dur-hover) var(--ease-quint);
  }
  /* Hover answers with a wash, not a shift: nothing moves under the pointer. */
  .immersive-home :is(.home-quick__item, .home-shortcut-main):hover { background: var(--nav-hover); }
  .immersive-home .home-shortcut-icon { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 9px; background: var(--rail); color: var(--ink-soft); }
  .immersive-home .home-shortcut-icon svg { width: 16px; height: 16px; }
  .immersive-home .home-quick__text { flex: 1; min-width: 0; }
  .immersive-home .home-quick__text small { display: block; margin-top: 4px; color: var(--muted); font-size: 12px; }
  .immersive-home .home-quick__item > svg { flex: none; width: 14px; height: 14px; margin-left: auto; color: var(--muted); }
  .immersive-home .home-shortcut-main > span:last-child { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .immersive-home .home-shortcut-add .home-shortcut-main { color: var(--ink-soft); border-bottom: 0; }
  .immersive-home .home-shortcut-add .home-shortcut-icon { background: transparent; box-shadow: inset 0 0 0 1px var(--line-strong); }
  .immersive-home .home-shortcut-edit { position: absolute; top: 50%; right: 0; transform: translateY(-50%); opacity: .6; }
  .immersive-home .home-shortcut:hover .home-shortcut-edit, .immersive-home .home-shortcut-edit:focus-visible { opacity: 1; }
  .immersive-home .home-shortcut:not(.home-shortcut-add) .home-shortcut-main { padding-right: 32px; }
  .immersive-home .home-shortcut-error { margin: 12px 0 0; color: var(--red); font-size: 12px; line-height: 1.6; }
  .immersive-home .home-margin-note { display: flex; align-items: center; gap: 8px; margin: 32px 0 0; color: var(--muted); font-size: 12px; }
  .immersive-home .home-margin-note svg { width: 14px; height: 14px; }
  .immersive-home :is(button, a, input, textarea):focus-visible { outline: var(--focus-stroke); outline-offset: var(--focus-stroke-inset); }
  @media (prefers-reduced-motion: reduce) {
    .immersive-home :is(.home-day, .home-quick__item, .home-shortcut-main, .home-erow__chev svg) { transition: none; }
    .immersive-home .home-erow__slot { animation: none; }
  }

  @container project-home (max-width: 1160px) {
    .immersive-home .home-layout { grid-template-columns: minmax(0, 1fr) 220px; gap: 32px; }
    .immersive-home .home-focus__art { right: 20px; }
  }
  @container project-home (max-width: 1020px) {
    .immersive-home .home-scroll { padding: 32px 32px 32px; }
    /* The margin holds still content; it sits above the events so a list that arrives later never moves it. */
    .immersive-home .home-layout { grid-template-columns: minmax(0, 1fr); grid-template-rows: none; grid-template-areas: "dates" "focus" "margin" "events"; }
    .immersive-home .home-margin { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; padding-top: 0; margin-top: 32px; }
    .immersive-home .home-note__text { min-height: 96px; }
    .immersive-home .home-launch { margin-top: 0; }
    .immersive-home .home-margin-note { display: none; }
  }
  @container project-home (max-width: 640px) {
    .immersive-home .home-scroll { padding: 24px 16px 24px; }
    .immersive-home .home-heading { margin-bottom: 24px; }
    .immersive-home .home-heading h1 { font-size: 24px; }
    .immersive-home .home-month { display: none; }
    .immersive-home .home-day { width: 49px; height: 64px; }
    .immersive-home .home-focus { min-height: 0; padding: 24px; }
    .immersive-home .home-focus h2 { max-width: none; font-size: 24px; }
    .immersive-home .home-focus > p { max-width: none; }
    .immersive-home .home-focus__art { display: none; }
    .immersive-home .home-erow { gap: 12px; }
    .immersive-home .home-erow__when { width: 34px; font-size: 12px; }
    .immersive-home .home-erow__icon { width: 28px; height: 28px; }
    .immersive-home .home-erow__src { display: none; }
    .immersive-home .home-erow__slot { padding-left: 0; }
    .immersive-home .home-layout { grid-template-areas: "dates" "focus" "events" "margin"; }
    .immersive-home .home-margin { display: block; margin-top: 32px; }
    .immersive-home .home-launch { margin-top: 32px; }
    .immersive-home .home-talk { width: auto; }
  }
  @media (pointer: coarse) {
    .immersive-home :is(.home-day) { min-height: 64px; }
    .immersive-home :is(.home-quick__item, .home-shortcut-main) { min-height: 56px; }
    .immersive-home .home-shortcut-edit { width: 44px; height: 44px; }
  }
  body.immersive-workbench .home-shortcut-dialog { width: min(380px, calc(100vw - 40px)); max-height: calc(100dvh - 40px); padding: 24px 24px 24px; border: 0; border-radius: 16px; background: var(--paper); color: var(--ink); box-shadow: var(--shadow); }
  body.immersive-workbench .home-shortcut-dialog::backdrop { background: var(--scrim); }
  body.immersive-workbench .home-shortcut-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 24px; }
  body.immersive-workbench .home-shortcut-dialog h2 { margin: 0; font-size: 15px; font-weight: var(--weight-title, 600); }
  body.immersive-workbench .home-shortcut-dialog header button { display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 8px; color: var(--ink-soft); background: transparent; cursor: pointer; }
  body.immersive-workbench .home-shortcut-dialog header button:hover { background: var(--nav-hover); color: var(--ink); }
  body.immersive-workbench .home-shortcut-dialog header svg { width: 16px; height: 16px; }
  body.immersive-workbench .home-shortcut-dialog label { display: grid; gap: 8px; margin-top: 16px; color: var(--ink); font-size: 12px; font-weight: var(--weight-control, 500); }
  body.immersive-workbench .home-shortcut-dialog input { width: 100%; height: var(--control-h); min-height: var(--control-h); padding: 0 12px; border: 1px solid var(--control-input); border-radius: var(--radius-control); background: var(--paper); color: var(--ink); font: inherit; font-size: 13px; caret-color: var(--ink); }
  body.immersive-workbench .home-shortcut-dialog input::placeholder { color: var(--muted); opacity: 1; }
  body.immersive-workbench .home-shortcut-form-error { min-height: 17px; margin: 12px 0 0; color: var(--red); font-size: 12px; line-height: 1.6; }
  body.immersive-workbench .home-shortcut-dialog footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; }
  body.immersive-workbench .home-shortcut-dialog .home-shortcut-remove { margin-right: auto; }
  @media (prefers-reduced-motion: reduce) { .immersive-home .home-shortcut-icon { transition: none; } }
  @media (pointer: coarse) { body.immersive-workbench .home-shortcut-dialog header button { width: 44px; height: 44px; } .immersive-home .home-shortcut-edit { width: 30px; height: 30px; } }

  .immersive-home .home-start { padding: 24px 0 32px; max-width: 560px; }
  .immersive-home .home-start h3 { font-size: 17px; font-weight: 500; letter-spacing: -.02em; margin: 0 0 8px; }
  .immersive-home .home-start > p { color: var(--muted); margin: 0 0 24px; line-height: 1.65; }
  .immersive-home .home-start-actions { display: flex; flex-direction: column; gap: 4px; }
  .immersive-home .home-start-action { display: flex; align-items: center; gap: 16px; min-height: 68px; padding: 12px; margin-left: -12px; border: 0; border-radius: 10px; background: transparent; color: var(--ink); text-align: left; cursor: pointer; font: inherit; transition: background-color 130ms var(--ease-quint); }
  .immersive-home .home-start-action:hover { background: var(--nav-hover); }
  .immersive-home .home-start-action > svg:last-child { margin-left: auto; width: 14px; }
  .immersive-home .home-start-action span { display: grid; gap: 4px; }
  .immersive-home .home-start-action strong { font-size: 15px; font-weight: 500; }
  .immersive-home .home-start-action small { color: var(--muted); font-size: 12px; line-height: 1.6; }
  .immersive-home .home-start-browse { align-self: flex-start; margin: 16px 0 0 -8px; }
  .immersive-home .home-start-today { margin: -8px 0 16px; }
  .immersive-home .home-start-today svg { width: 14px; height: 14px; }
  @media (prefers-reduced-motion: reduce) { .immersive-home .home-start-action { transition: none; } }
`;
