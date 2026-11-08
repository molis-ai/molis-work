/**
 * A project's 「输入与输出」 (src/project-directories-section.ts), on the settings page and in the workbench's settings. A folder is one
 * row that never wraps: glyph, name with its roles, the whole path cut at the end (its title holds it all), and the buttons on the right;
 * narrow, the buttons go under the words. What a folder stands in for is a quiet line under it. The chooser is the catalog's popover and
 * menu, placed by the page under its button.
 */
export const PROJECT_DIRECTORIES_STYLES = `
  :is(.project-preferences-page, .settings-stage) .settings-setting-row.project-directory {
    display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; align-items: center; gap: 4px 12px; flex-direction: row;
  }
  .project-directory__glyph { display: grid; place-items: center; align-self: start; height: 22px; color: var(--ink-soft); }
  .project-directory__glyph svg { width: 16px; height: 16px; }
  .project-directory__copy { min-width: 0; }
  .project-directory__head { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .project-directory__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .project-directory__roles { display: inline-flex; flex: none; gap: 4px; }
  .setting-copy > .project-directory__path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 12px/1.5 var(--mono); color: var(--muted); }
  .setting-copy > .project-directory__note { display: flex; align-items: center; gap: 6px; min-width: 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
  .project-directory__note > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .project-directory__note svg { flex: none; width: 14px; height: 14px; }
  .project-directory__note.is-warning { color: var(--amber); }
  .project-directory .setting-value { flex-wrap: nowrap; }
  .project-directory-link { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; align-items: center; gap: 8px; margin: -4px 0 0 32px; padding: 0 0 12px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 13px; }
  .project-directory:has(+ .project-directory-link) { border-bottom: 0; }
  .project-directory-link > svg { width: 14px; height: 14px; color: var(--ink-soft); }
  .project-directory-link__copy { display: grid; min-width: 0; }
  .project-directory-link__copy > * { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .project-directory-link__copy > span { color: var(--ink); }
  .project-directory-link__copy > small { font-size: 12px; }
  .project-directory-link__acts { display: inline-flex; gap: 4px; }
  .project-directories-add input { width: 240px; min-width: 0; }
  .project-directories .setting-value .mw-btn { white-space: nowrap; }
  .project-directories__status { min-height: 20px; margin: 0 0 12px; color: var(--muted); font-size: 13px; }
  .project-directories__status[data-tone=error] { color: var(--red); }
  .project-directory-chooser { position: fixed; inset: auto; margin: 0; width: min(340px, calc(100vw - 16px)); padding: 0; overflow: auto; overscroll-behavior: contain; }
  .project-directory-chooser:popover-open { display: grid; animation: craft-drop var(--dur-move) var(--ease-quint); }
  /* The menu is the popover's body, not a second card in it (the pages' and dark theme's menu rules are more specific). */
  html body:is(.immersive-workbench, .settings-page, .project-preferences-page) .mw-popover.project-directory-chooser > .mw-menu { min-width: 0; box-shadow: none; border-radius: 0; background: transparent; }
  .project-directory-chooser__head { display: grid; gap: 2px; padding: 12px 14px 4px; min-width: 0; }
  .project-directory-chooser__head > * { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .project-directory-chooser__head strong { font-size: 13px; color: var(--ink); }
  .project-directory-chooser__head small { font-size: 12px; color: var(--muted); }
  .project-directory-chooser .mw-menu__item, .project-directory-chooser [data-slot=menu-item-label] { min-width: 0; }
  .project-directory-chooser [data-target=pick][data-chosen] .mw-menu__desc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--mono); }
  .project-directory-chooser__say { margin: 0; padding: 4px 14px 8px; color: var(--muted); font-size: 12px; line-height: 1.5; text-wrap: pretty; }
  .project-directory-chooser__say[data-tone=error] { color: var(--red); }
  .project-directory-chooser__foot { display: flex; justify-content: flex-end; gap: 8px; padding: 8px 12px 12px; border-top: 1px solid var(--line); }
  @media (prefers-reduced-motion: reduce) { .project-directory-chooser:popover-open { animation: none; } }
  @media (max-width: 760px) {
    :is(.project-preferences-page, .settings-stage) .settings-setting-row.project-directory { grid-template-columns: 20px minmax(0, 1fr); }
    .project-directory .setting-value { grid-column: 2; justify-content: flex-start; }
    .project-directory-link { grid-template-columns: 16px minmax(0, 1fr); margin-left: 0; }
    .project-directory-link__acts { grid-column: 2; }
    .project-directories-add input { width: auto; flex: 1; }
    .project-directories-add .setting-value { flex-wrap: nowrap; }
  }
`;
