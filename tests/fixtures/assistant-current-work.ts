/**
 * The page expressions for what this viewer has in front of them, which is remembered per project (proactive-assistant §12.1):
 * under the project the page is about, or the chooser's selection; under the bare key outside any project.
 */
const remembered = (name: string) => `localStorage.getItem('molis.assistant.${name}' + (id => id && id !== 'personal' ? ':' + id : '')(document.querySelector('.chooser')?.dataset.selected ?? decodeURIComponent(location.pathname.match(/^\\/projects\\/([^/]+)/)?.[1] ?? '')))`;
export const CURRENT_WORK = remembered("current");
/** The unresolved request belongs to this receiver within the selected project. */
export const UNSENT_WORDS = `localStorage.getItem('molis.assistant.unsent' + (id => id && id !== 'personal' ? ':' + id : '')(document.querySelector('.chooser')?.dataset.selected ?? decodeURIComponent(location.pathname.match(/^\\/projects\\/([^/]+)/)?.[1] ?? '')) + ':' + encodeURIComponent(${CURRENT_WORK} || 'new'))`;
/** A work's details (path, sub-tasks, results, changes, usage) are behind 更多 › 详情 (36A-3); this brings them in sight: opened,
 * or opened again when the window narrowed under them and the column they are in went back into its drawer. */
export const OPEN_DETAILS = "(() => { const pane = document.querySelector('[data-info-details]'); if (!pane.hidden && pane.getClientRects().length) return; if (!pane.hidden) pane.querySelector('[data-info-details-close]').click(); document.querySelector('[data-info-details-open]').click(); })()";
