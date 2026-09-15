export const PROJECT_INDEX_STYLES = `
  html:has(> body.project-index-page), body.project-index-page { height: 100dvh; max-height: 100dvh; overflow: hidden; overscroll-behavior: none; background: var(--page); }
  body.project-index-page {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    caret-color: var(--ink);
  }
  body.project-index-page ::selection { background: color-mix(in srgb, var(--blue) 28%, transparent); color: var(--ink); }
  body.project-index-page > .topbar,
  body.project-index-page > .project-directory-topbar {
    grid-column: 1;
    grid-row: 1;
    display: flex;
    align-items: center;
    width: 100%;
    min-width: 0;
    padding: 0 10px 0 8px;
    border: 0;
    border-bottom: 1px solid var(--line);
    border-radius: 0;
    background: var(--paper);
    box-shadow: none;
  }
  body.project-index-page:not([data-native-desktop="true"]) > .topbar {
    height: 52px;
    min-height: 52px;
  }
  body.project-index-page[data-desktop-shell="true"][data-native-desktop="true"] > .topbar {
    height: var(--desktop-titlebar-height);
    min-height: var(--desktop-titlebar-height);
    padding-left: var(--desktop-window-safe-inline-start, 88px);
  }
  body.project-index-page > .topbar > .brand {
    display: flex;
    position: static;
    left: auto;
    z-index: auto;
    min-width: auto;
    height: 100%;
    padding: 0 12px;
    border-right: 0;
    gap: 8px;
    color: inherit;
    text-decoration: none;
  }
  body.project-index-page:not([data-native-desktop="true"]) > .topbar > .brand { transform: none; }
  body.project-index-page > .topbar > .brand strong {
    display: block;
    font-size: 14px;
    font-weight: 720;
    letter-spacing: -.025em;
  }
  body.project-index-page > .topbar > .top-action {
    display: inline-flex;
    width: auto;
    max-width: none;
    height: 32px;
    margin: 0 6px 0 0;
    padding: 0 10px;
    overflow: visible;
    border-radius: 8px;
    color: var(--muted);
    background: transparent;
    font-size: 12px;
    font-weight: 650;
    text-decoration: none;
  }
  body.project-index-page > .topbar > .top-action:hover {
    color: var(--ink);
    background: var(--rail);
  }
  body.project-index-page > .topbar > .top-action:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--blue) 62%, transparent);
    outline-offset: 2px;
  }
  body.project-index-page > .topbar > .top-action span { display: inline; }
  body.project-index-page > .project-index {
    grid-column: 1;
    grid-row: 2;
    min-height: 0;
    overflow: hidden;
    overscroll-behavior: contain;
    padding: 28px clamp(20px, 4vw, 56px) 20px;
    display: grid;
    place-items: stretch center;
  }
  .project-index-panel {
    width: min(100%, 960px);
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }
  .project-index-heading {
    flex: none;
    padding: 0 2px 20px;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 20px;
    border: 0;
  }
  .project-index-body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-color: color-mix(in srgb, var(--ink) 28%, transparent) transparent;
  }
  .project-index-heading h1 {
    margin: 0;
    font-size: clamp(27px, 2.25vw, 34px);
    font-weight: 710;
    line-height: 1.2;
    letter-spacing: -.035em;
  }
  .project-index-heading p { max-width: 64ch; margin: 8px 0 0; color: var(--muted); font-size: 13px; line-height: 1.52; }
  .project-index-actions { display: flex; align-items: center; gap: 8px; }
  .project-index-search { position: relative; display: flex; align-items: center; }
  .project-index-search svg { position: absolute; left: 10px; width: 14px; height: 14px; color: var(--muted); pointer-events: none; }
  .project-index-search input {
    width: 220px;
    min-height: var(--control-h);
    padding: 0 10px 0 32px;
    border: 1px solid var(--control-input);
    border-radius: var(--radius-control);
    color: var(--ink);
    background: var(--paper);
    appearance: none;
    -webkit-appearance: none;
  }
  .project-index-search input::placeholder { color: var(--muted); opacity: 1; }
  .project-index-search input:focus-visible {
    border-color: var(--control-input);
    outline: 2px solid var(--control-ring);
    outline-offset: 2px;
  }
  .project-index-search-empty {
    margin: 12px 0 0;
    padding: 28px 12px;
    border: 1px dashed var(--line-strong);
    border-radius: 12px;
    color: var(--muted);
    text-align: center;
  }
  .project-index-create {
    min-height: var(--control-h);
    padding: 0 var(--control-pad-x);
    border: 1px solid var(--action);
    border-radius: var(--radius-control);
    color: var(--action-ink);
    background: var(--action);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 550;
    text-decoration: none;
    white-space: nowrap;
  }
  .project-index-create:hover { background: color-mix(in srgb, var(--action) 90%, var(--action-ink)); }
  .project-index-create:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--blue) 62%, transparent);
    outline-offset: 2px;
  }
  .project-card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; align-content: start; justify-items: start; }
  .project-card {
    width: 100%;
    max-width: 360px;
    min-width: 0;
    min-height: 148px;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 12px;
    color: inherit;
    background: var(--paper);
    box-shadow: var(--shadow-soft);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 14px;
    text-decoration: none;
    transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
  }
  .project-card:hover { border-color: var(--line-strong); box-shadow: var(--shadow-raised); transform: translateY(-1px); }
  .project-card:focus-visible { outline: 2px solid color-mix(in srgb, var(--blue) 62%, transparent); outline-offset: 3px; }
  .project-card > header, .project-card > footer { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .project-card > div { min-width: 0; }
  .project-card-icon { width: 28px; height: 28px; border-radius: 8px; color: var(--ink-soft); background: var(--rail); display: grid; place-items: center; }
  .project-card-icon svg { width: 15px; height: 15px; }
  .project-card-kind {
    min-width: 0;
    overflow: hidden;
    color: var(--ink-soft);
    font-size: 11px;
    font-weight: 650;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .project-card h2 {
    margin: 0;
    overflow: hidden;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: -.015em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .project-card p {
    margin: 6px 0 0;
    overflow: hidden;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.45;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .project-card footer { color: var(--ink-soft); font-size: 12px; font-weight: 650; }
  .project-card footer svg { width: 14px; height: 14px; transform: none; transition: transform .18s ease; }
  .project-card:hover footer svg { transform: translateX(2px); }
  .project-index-empty { padding: 36px 8px 40px; color: var(--muted); }
  .project-index-empty h2 { margin: 0 0 8px; color: var(--ink); font-size: 18px; font-weight: 700; letter-spacing: -.015em; }
  .project-index-empty p { max-width: 48ch; margin: 0; font-size: 13px; line-height: 1.52; }
  .project-index-start { margin-top: 18px; display: flex; flex-wrap: wrap; gap: 9px; }
  .project-index-start a { min-height: 34px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 8px; color: var(--ink); background: var(--paper); display: inline-flex; align-items: center; font-weight: 650; text-decoration: none; }
  .project-index-start a:first-child { border-color: var(--action); color: var(--action-ink); background: var(--action); }
  .project-index-start a:hover { border-color: var(--line-strong); background: var(--rail); color: var(--ink); }
  .project-index-start a:first-child:hover { border-color: var(--action); color: var(--action-ink); background: color-mix(in srgb, var(--action) 90%, var(--action-ink)); }
  .project-index-start a:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--blue) 62%, transparent);
    outline-offset: 2px;
  }
  .project-index-migration {
    flex: none;
    margin-top: 20px;
    padding: 14px 2px 0;
    border: 0;
    border-top: 1px solid var(--line);
    border-radius: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    background: transparent;
  }
  .project-index-migration > div { min-width: 0; }
  .project-index-migration strong { display: block; font-size: 13px; font-weight: 650; }
  .project-index-migration small { display: block; margin-top: 2px; color: var(--muted); font-size: 12px; }
  .project-index-migrate {
    min-height: var(--control-h);
    padding: 0 var(--control-pad-x);
    border: 1px solid var(--control-border);
    border-radius: var(--radius-control);
    color: var(--ink);
    background: var(--control-fill);
    font-weight: 650;
    white-space: nowrap;
    cursor: pointer;
  }
  .project-index-migrate:hover { border-color: var(--control-input); background: var(--control-fill-hover); }
  .project-index-migrate:focus-visible { outline: 2px solid var(--control-ring); outline-offset: 2px; }
  .project-migration-dialog { width: min(100% - 28px, 580px); padding: 0; border: 1px solid var(--control-border); border-radius: var(--radius-surface); background: var(--paper); color: var(--ink); box-shadow: var(--control-shadow); }
  .project-migration-dialog::backdrop { background: color-mix(in srgb, var(--ink) 32%, transparent); }
  .project-migration-form { display: grid; }
  .project-migration-form > header { padding: 22px 24px 18px; border-bottom: 1px solid var(--line); display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .project-migration-form h2 { margin: 0; font-size: 19px; letter-spacing: -.02em; }
  .project-migration-form header p { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
  .project-migration-form > .project-migration-body { padding: 20px 24px; display: grid; gap: 15px; }
  .project-migration-form label:not(.project-migration-confirm) { display: grid; gap: 5px; color: var(--ink-soft); font-size: 13px; font-weight: 650; }
  .project-migration-form label small { color: var(--muted); font-weight: 400; }
  .project-migration-form input[type=text] { width: 100%; min-height: var(--control-h); padding: 0 10px; border: 1px solid var(--control-input); border-radius: var(--radius-control); background: var(--paper); color: var(--ink); }
  .project-migration-form input[type=text]:focus { border-color: var(--control-input); outline: 0; box-shadow: none; }
  .project-migration-warning { margin: 0; padding: 10px 11px; color: var(--amber); border: 1px solid color-mix(in srgb, var(--amber) 28%, var(--line)); background: var(--amber-soft); font-size: 12px; line-height: 1.55; border-radius: 8px; }
  .project-migration-confirm { display: flex; align-items: flex-start; gap: 9px; color: var(--ink-soft); font-size: 13px; line-height: 1.45; cursor: pointer; }
  .project-migration-confirm input { width: 16px; height: 16px; margin: 2px 0 0; accent-color: var(--blue); }
  .project-migration-error { margin: 0; color: var(--red); font-size: 13px; }
  .project-migration-form > footer { padding: 14px 24px; border-top: 1px solid var(--line); display: flex; justify-content: flex-end; gap: 9px; background: color-mix(in srgb, var(--rail) 70%, var(--paper)); }
  .project-migration-form > footer button { min-height: var(--control-h); padding: 0 var(--control-pad-x); border: 1px solid var(--control-border); border-radius: var(--radius-control); background: var(--control-fill); color: var(--ink); cursor: pointer; }
  .project-migration-form > footer button:focus-visible,
  .project-migration-form .icon-button:focus-visible {
    outline: 2px solid var(--control-ring);
    outline-offset: 2px;
  }
  .project-migration-form > footer .project-migration-submit { border-color: var(--action); color: var(--action-ink); background: var(--action); font-weight: 650; }
  .project-migration-form > footer .project-migration-submit:hover { background: color-mix(in srgb, var(--action) 90%, var(--action-ink)); }
  .project-migration-form > footer .project-migration-submit:disabled { opacity: .58; cursor: wait; }
  .project-index-note { flex: none; margin: 10px 0 0; padding: 0 2px; border: 0; color: var(--muted); font-size: 12px; line-height: 1.45; background: transparent; }
  @media (max-width: 760px) {
    body.project-index-page:not([data-native-desktop="true"]) > .topbar { height: 52px; min-height: 52px; }
    .project-index { min-height: 0; }
  }
  @media (max-width: 720px) {
    .project-index-heading { align-items: stretch; flex-direction: column; }
    .project-index-actions { flex-direction: column; align-items: stretch; }
    .project-index-search { flex: none; width: 100%; }
    .project-index-search input { width: 100%; min-height: 44px; font-size: 16px; }
    .project-index-create { min-height: 44px; width: 100%; justify-content: center; }
  }
  @media (max-width: 620px) {
    body.project-index-page:not([data-native-desktop="true"]) > .topbar > .top-action {
      height: 44px;
      min-width: 44px;
    }
    body.project-index-page > .project-index { padding: 20px 16px 16px; place-items: stretch; }
    .project-index-panel { width: 100%; }
    .project-index-heading, .project-index-empty { padding-inline: 0; }
    .project-index-migration { align-items: stretch; flex-direction: column; padding-top: 16px; }
    .project-index-migrate { align-self: flex-start; min-height: 44px; }
    .project-index-note { padding-inline: 0; }
    .project-index-start a { min-height: 44px; }
    .project-migration-form > header, .project-migration-form > .project-migration-body, .project-migration-form > footer { padding-inline: 18px; }
    .project-migration-form input[type=text] { min-height: 44px; font-size: 16px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .project-card, .project-card footer svg { transition: none; }
    .project-card:hover { transform: none; }
    .project-card:hover footer svg { transform: none; }
  }
`;
