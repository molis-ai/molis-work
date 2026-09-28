/** The search palette's content results: scope switch, status line, snippets and "more" (specs/system-search §9). */
export const GLOBAL_SEARCH_CONTENT_STYLES = `
  .global-search-scopes { display: flex; gap: 4px; padding: 6px 12px 0; flex-wrap: wrap; }
  .global-search-scopes[hidden] { display: none; }
  .global-search-scope-option { border: 1px solid var(--line); background: transparent; color: var(--muted); font: inherit; font-size: 12px;
    line-height: 1.4; padding: 3px 10px; border-radius: 999px; cursor: pointer; }
  .global-search-scope-option:hover { background: var(--nav-hover); color: var(--ink, inherit); }
  .global-search-scope-option[aria-pressed="true"] { background: var(--nav-hover); color: var(--ink, inherit); border-color: transparent; font-weight: 600; }
  .global-search-scope-option:focus-visible { outline: 2px solid var(--focus, currentColor); outline-offset: 1px; }
  .global-search-scope[hidden] { display: none; }
  .global-search-hit.is-content { align-items: flex-start; }
  .global-search-hit-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .global-search-hit-main .global-search-hit-title { flex: none; }
  .global-search-hit-snippet { font-size: 12px; line-height: 1.45; color: var(--muted); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .global-search-hit-snippet mark { background: color-mix(in srgb, #f5c542 42%, transparent); color: inherit; border-radius: 2px; padding: 0 1px; }
  .global-search-more { display: block; margin: 4px auto 6px; font-size: 12px; }
`;
