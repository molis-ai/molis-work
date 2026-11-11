/**
 * The page expressions for what this viewer has in front of them, which is remembered per project (proactive-assistant §12.1):
 * under the project the page is about, or the chooser's selection; under the bare key outside any project.
 */
const remembered = (name: string) => `localStorage.getItem('molis.assistant.${name}' + (id => id && id !== 'personal' ? ':' + id : '')(document.querySelector('.chooser')?.dataset.selected ?? decodeURIComponent(location.pathname.match(/^\\/projects\\/([^/]+)/)?.[1] ?? '')))`;
export const CURRENT_WORK = remembered("current");
/** The unresolved request belongs to this receiver within the selected project. */
export const UNSENT_WORDS = `localStorage.getItem('molis.assistant.unsent' + (id => id && id !== 'personal' ? ':' + id : '')(document.querySelector('.chooser')?.dataset.selected ?? decodeURIComponent(location.pathname.match(/^\\/projects\\/([^/]+)/)?.[1] ?? '')) + ':' + encodeURIComponent(${CURRENT_WORK} || 'new'))`;
