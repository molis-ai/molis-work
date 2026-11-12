import { GLOBAL_SEARCH_FACTORY_SCRIPT } from "../scripts/client/global-search.js";

/**
 * The project list's search of the person's own content (BL-041): the workbench's search dialog in its Home variant. Its program is
 * served once as `/assets/molis-work-chooser-search.js` and fetched on the first press of 「搜索个人内容」, so the project list's
 * own document, read on every visit, does not carry it (user 2026-11-12). The dialog's markup and the plugin directory stay in the page.
 */
export const CHOOSER_SEARCH_ASSET = "/assets/molis-work-chooser-search.js";

let client: string | null = null;
export function renderMolisWorkChooserSearchClientScript(): string {
  return client ??= `globalThis.__CHOOSER_SEARCH__ = (${GLOBAL_SEARCH_FACTORY_SCRIPT})({ translate: globalThis.t.text, home: true, projectId: "", route: path => path,
  itemTabs: JSON.parse(document.querySelector("script[data-plugin-directory]")?.textContent || "[]").filter(entry => entry.accepts_objects).map(entry => entry.id),
  setMobileView: () => {}, noteSearchActivity: () => {} });`;
}

/**
 * What the project list carries instead: on the first press it fetches the program and opens the dialog from that button; from then on
 * the dialog's own listener answers the button. A fetch that fails says so under the button and leaves the next press to try again.
 */
export const CHOOSER_SEARCH_LOADER_SCRIPT = String.raw`
document.addEventListener('click', (event) => {
  const trigger = event.target.closest?.('.chooser-personal-search[data-global-search-open]');
  if (!trigger || globalThis.__CHOOSER_SEARCH__) return;
  event.preventDefault();
  if (trigger.getAttribute('aria-busy') === 'true') return;
  const error = document.querySelector('[data-chooser-search-error]');
  if (error) { error.hidden = true; error.textContent = ''; }
  trigger.setAttribute('aria-busy', 'true');
  const script = document.createElement('script');
  script.src = ${JSON.stringify(CHOOSER_SEARCH_ASSET)};
  script.onload = () => { trigger.removeAttribute('aria-busy'); globalThis.__CHOOSER_SEARCH__?.open(trigger); };
  script.onerror = () => {
    trigger.removeAttribute('aria-busy'); script.remove();
    if (error) { error.textContent = globalThis.t.text("workbench.chooser.search-not-available-right-now-try-again-later"); error.hidden = false; }
  };
  document.head.append(script);
});
`;
