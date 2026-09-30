export const CHARACTERS_STYLES = `
  .characters-import-dialog { width: min(62rem, calc(100vw - 32px)) !important; }
  .characters-dialog .mw-form__body { display: flex; flex-direction: column; gap: 16px; }
  .characters-dialog label { display: flex; flex-direction: column; gap: 8px; font-size: 12px; }
  .characters-dialog select { min-height: 34px; }
  .characters-dialog textarea { width: 100%; min-height: 110px; }
  .characters-sources { display: flex; flex-wrap: wrap; gap: 8px; }
  .characters-sources button { white-space: normal; text-align: left; }
  .characters-sources button[aria-pressed="true"] { border-color: var(--accent); background: var(--hover); }
  .characters-import-item { padding: 12px 0; border-top: 1px solid var(--line); }
  .characters-import-item > label { flex-direction: row; align-items: center; color: var(--ink); }
  .characters-import-item small { display: block; overflow-wrap: anywhere; color: var(--muted); margin: 4px 0; }
  .characters-import-item pre { background: var(--paper); padding: 12px; font: 12px/1.65 ui-monospace, monospace; }
  .characters-location { font-size: 12px; }
  .characters-location label { margin-top: 12px; }
  .characters-run-modes { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .characters-run-modes > section { border-top: 1px solid var(--line); padding-top: 12px; }
  .characters-run-modes h3 { font-size: 15px; margin: 8px 0; }
  .characters-source-detail details { font-size: 12px; margin: 8px 0; }
  .characters-source-detail pre, [data-character-run-output] { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 22rem; overflow: auto; font-size: 12px; line-height: 1.65; }
  .characters-terminal { height: 420px; min-width: 0; overflow: hidden; position: relative; background: var(--paper); }
  .characters-terminal .tui-xterm { position: absolute; inset: 0; }
  .characters-terminal-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 12px; }
  [data-character-native-runs] { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
  @media(max-width: 640px) { .characters-run-modes { grid-template-columns: 1fr; } .characters-terminal { height: 350px; } }
  /* Settings › 角色: one centred settings column; the list and a Character's editor take turns in it. */
  .settings-content > .characters-page { display: block; width: 100%; max-width: 760px; margin-inline: auto; }
  .characters-page[data-expanded="true"] > [data-character-list-view] { display: none; }
  .characters-page .characters-heading p { max-width: 58ch; }
  .characters-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; list-style: none; margin: 0 0 20px; padding: 0; }
  .characters-steps li { display: flex; gap: 12px; align-items: flex-start; padding: 12px; border-radius: 12px; background: var(--paper); box-shadow: 0 0 0 1px var(--line); }
  .characters-steps li > span:last-child { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .characters-steps strong { font-size: 13px; font-weight: 500; color: var(--ink); }
  .characters-steps small { font-size: 12px; line-height: 1.5; color: var(--muted); }
  .characters-step-mark { flex: none; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--nav-active); color: var(--ink); font-size: 12px; font-weight: 600; }
  .characters-page .characters-block { padding: 16px; }
  .characters-page .characters-block > h2, .characters-block-head h2 { margin: 0 0 4px; font-size: 15px; font-weight: 600; color: var(--ink); letter-spacing: -.01em; }
  .characters-block-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
  .characters-block-head > div:first-child { min-width: 0; }
  .characters-block-head .characters-hint { margin: 0; max-width: 56ch; }
  .characters-block-actions { flex: none; display: flex; flex-wrap: wrap; gap: 8px; }
  .characters-rows { display: flex; flex-direction: column; gap: 2px; }
  .characters-row { display: grid; grid-template-columns: minmax(0, 1fr) auto 14px; align-items: center; gap: 12px; width: 100%; min-height: 52px; padding: 8px 10px; margin: 0; border: 0; border-radius: 10px; background: transparent; color: var(--ink); font: inherit; text-align: left; text-decoration: none; cursor: pointer; transition: background-color var(--dur-hover) var(--ease-quint); }
  .characters-row:hover, .characters-row:focus-visible { background: var(--nav-hover); }
  .characters-row:focus-visible { outline: var(--focus-stroke, 2px solid var(--accent)); outline-offset: -2px; }
  .characters-row[aria-current="page"] { background: var(--nav-active); }
  .characters-row-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .characters-row-copy strong { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .characters-row-copy small { font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .characters-row-meta { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; }
  .characters-row-chevron { width: 14px; height: 14px; color: var(--faint); }
  .characters-tag { padding: 1px 8px; border-radius: 6px; box-shadow: 0 0 0 1px var(--line); color: var(--ink-soft); font-size: 11px; line-height: 18px; white-space: nowrap; }
  .characters-tag--quiet { color: var(--muted); }
  .characters-tag--done { color: var(--green); box-shadow: 0 0 0 1px color-mix(in srgb, var(--green) 30%, transparent); }
  .characters-tag--attention { color: var(--amber); box-shadow: 0 0 0 1px color-mix(in srgb, var(--amber) 34%, transparent); }
  .characters-group-label { margin: 12px 10px 4px; font-size: 12px; font-weight: 500; color: var(--muted); }
  .characters-group-label:first-child { margin-top: 0; }
  .characters-empty { display: grid; gap: 4px; padding: 16px 10px 8px; }
  .characters-empty strong { font-size: 13px; font-weight: 500; color: var(--ink); }
  .characters-empty p { margin: 0; max-width: 52ch; font-size: 12px; line-height: 1.6; color: var(--muted); }
  .characters-editor-bar { display: flex; align-items: center; gap: 8px; margin: 0 0 16px; }
  .characters-editor-title { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
  .characters-editor-title h1 { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -.02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; outline: none; }
  .characters-state { flex: none; font-size: 12px; color: var(--muted); }
  .characters-editor { display: flex; flex-direction: column; gap: 0; padding: 0 0 8px; }
  .characters-editor label { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; font-size: 12px; color: var(--muted); }
  .characters-editor textarea { min-height: 200px; resize: vertical; line-height: 1.65; }
  .characters-editor fieldset { border: 0; padding: 0; margin: 12px 0 0; display: flex; flex-direction: column; gap: 8px; }
  .characters-editor fieldset + fieldset { padding-top: 12px; border-top: 1px solid var(--line); }
  .characters-editor legend { padding: 0; margin: 0 0 4px; font-size: 13px; font-weight: 500; color: var(--ink); }
  .characters-editor .characters-check { flex-direction: row; align-items: center; margin-top: 0; color: var(--ink); }
  .characters-inline-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 4px; }
  .characters-link { color: var(--accent); font-size: 12px; text-underline-offset: 3px; }
  .characters-danger [data-character-delete] { color: var(--red); }
  .characters-danger [data-character-delete]:hover { color: var(--red); background: color-mix(in srgb, var(--red) 8%, transparent); }
  .characters-savebar { position: sticky; bottom: 0; z-index: 2; display: flex; align-items: center; gap: 8px; margin: 4px -4px 0; padding: 12px 4px; background: var(--page, var(--surface-soft)); box-shadow: 0 -1px 0 var(--line); }
  .characters-savebar .characters-hint { flex: 1; min-width: 0; margin: 0; }
  .characters-versions:empty::before { content: "尚未发布到当前项目。"; font-size: 12px; color: var(--muted); }
  .characters-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .characters-hint, .characters-editor small { color: var(--muted); font-size: 12px; line-height: 1.6; }
  .characters-notice { position: sticky; bottom: 12px; z-index: 3; width: fit-content; max-width: 100%; margin: 12px auto 0; padding: 8px 14px; border-radius: 10px; background: var(--action); color: var(--action-ink); font-size: 12px; box-shadow: var(--shadow-soft, 0 4px 14px rgba(0,0,0,.12)); }
  .characters-notice:empty { display: none; }
  [data-character-publications] details { border-top: 1px solid var(--line); padding: 12px 0; font-size: 12px; }
  [data-character-publications] details:first-child { border-top: 0; }
  [data-character-publications] pre, .characters-dialog pre { white-space: pre-wrap; overflow-wrap: anywhere; font-family: inherit; line-height: 1.65; max-height: 45vh; overflow: auto; }
  .characters-dialog { width: min(42rem, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow: auto; }
  .characters-dialog p { font-size: 12px; color: var(--muted); }
  .characters-settings-entry .characters-project-link { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 8px; margin: 0 -8px; border-radius: 8px; color: var(--ink); text-decoration: none; }
  .characters-settings-entry .characters-project-link:hover { background: var(--nav-hover); }
  .characters-settings-entry .characters-project-link span { flex: 1; }
  .characters-settings-entry .characters-project-link svg { width: 14px; height: 14px; color: var(--muted); }
  @media (max-width: 760px) {
    .characters-steps { grid-template-columns: minmax(0, 1fr); }
    .characters-block-head { flex-direction: column; }
    .characters-row { grid-template-columns: minmax(0, 1fr) 14px; }
    .characters-row-meta { grid-column: 1; justify-content: flex-start; }
    .characters-row-chevron { grid-row: 1; grid-column: 2; }
    .characters-savebar > button, .characters-block-actions > button, .characters-inline-actions > button { min-height: 44px; }
  }
`;
