import { HOME_SETTINGS_QUERY_EXTRAS, SETTINGS_ADDRESS_DEFAULTS } from "../settings-address-params.js";
import { MODEL_SETTINGS_CLIENT_SCRIPT } from "./settings-models.js";
import { CONNECTORS_SETTINGS_CLIENT_SCRIPT } from "./connectors-settings.js";

/** The project-free Home shell hosts the existing settings document without unloading plugin drafts. */
export const HOME_MODEL_SETTINGS_CLIENT_SCRIPT = `(() => {
  const readText = globalThis.t.text;
  // The pages' own address declarations (settings-address-params.ts): this dialog keeps only what the page it opens reads.
  const DEFAULTS = ${JSON.stringify(SETTINGS_ADDRESS_DEFAULTS.global)};
  const HOME_QUERY_EXTRAS = ${JSON.stringify(HOME_SETTINGS_QUERY_EXTRAS)};
  const declared = (table, key) => Object.prototype.hasOwnProperty.call(table, key) ? table[key] : "";
  const keptQuery = (search, path) => {
    const allowed = (DEFAULTS + " " + declared(HOME_QUERY_EXTRAS, path)).trim().split(/ +/);
    const kept = new URLSearchParams();
    for (const [key, value] of new URLSearchParams(search || "")) if (allowed.includes(key)) kept.append(key, value);
    const text = kept.toString();
    return text ? "?" + text : "";
  };
  ${MODEL_SETTINGS_CLIENT_SCRIPT}
  ${CONNECTORS_SETTINGS_CLIENT_SCRIPT}
  const dialog = document.querySelector('[data-home-model-settings]');
  const content = dialog.querySelector('[data-home-model-content]');
  const status = dialog.querySelector('[data-home-model-status]');
  const retry = dialog.querySelector('[data-home-model-retry]');
  const back = dialog.querySelector('[data-home-model-back]'), pages = new Map();
  let address = '/settings/models', pending, backdrop = false;
  const load = async (href = address) => {
    pending?.abort(); const controller = pending = new AbortController(); address = href;
    const models = new URL(href, location.origin).pathname === '/settings/models', key = models ? 'models' : 'connections';
    dialog.querySelector('h2').textContent = globalThis.t.text(models ? "workbench.home-model-settings.models" : "workbench.home-model-settings.account-connection"); back.hidden = models;
    content.replaceChildren();
    retry.hidden = true; status.hidden = true; content.removeAttribute('aria-busy');
    const cached = pages.get(key);
    if (cached) { content.append(cached); if (!models) return; }
    status.hidden = false; status.textContent = globalThis.t.text("workbench.home-model-settings.loading"); content.setAttribute('aria-busy', 'true');
    try {
      const url = new URL(href, location.origin); url.searchParams.set('embed', '1');
      if (cached && models) url.searchParams.set('new', '1');
      const html = await molisWorkRequest(url.href, {as:'text', signal:controller.signal, fallback:globalThis.t.text("workbench.home-model-settings.cannot-load-model-settings")});
      const page = new DOMParser().parseFromString(html, 'text/html');
      const document = page.querySelector(models ? '[data-model-settings]' : '[data-connectors-settings]');
      if (!document) throw new Error(globalThis.t.text("workbench.home-model-settings.model-settings-page-incomplete"));
      if (controller.signal.aborted) return;
      if (cached) {
        // Refresh connection choices after managing accounts without replacing unsaved model inputs.
        const current = cached.querySelector('[data-model-connection]'), fresh = document.querySelector('[data-model-connection]');
        if (current) {
          const selected = current.value, retained = current.selectedOptions[0]?.cloneNode(true);
          current.replaceChildren(...(fresh ? fresh.childNodes : [current.options[0].cloneNode(true)]));
          if (retained && ![...current.options].some(option => option.value === selected)) {
            retained.disabled = true; retained.textContent = globalThis.t.text("workbench.home-model-settings.previous-connection-unavailable-choose-another"); current.append(retained);
          }
          current.value = selected;
        }
      } else {
        // Cache a stable wrapper: the existing connections binding can replace its own document.
        const holder = page.createElement('div'); holder.append(document); content.append(holder);
        if (models) globalThis.molisWorkBindModelSettings(document);
        else {
          let connectionAddress = url;
          globalThis.molisWorkBindConnectorsSettings(document, { address: () => connectionAddress, replace: next => { connectionAddress = next; } });
        }
        pages.set(key, holder);
      }
      status.hidden = true;
    } catch (error) {
      if (!controller.signal.aborted) {
        molisWorkRequest.show(status, error);
        status.prepend(globalThis.t.text("workbench.home-model-settings.settings-could-not-load-input-preserved"), ' ');
        retry.hidden = false;
        // Let the cached form and the retry row lay out before correcting the dialog's scroll anchor.
        requestAnimationFrame(() => {
          if (pending !== controller || !dialog.open) return;
          const body = status.parentElement;
          if (status.getBoundingClientRect().top < body.getBoundingClientRect().top) body.scrollTop = 0;
        });
      }
    }
    finally { if (pending === controller) content.removeAttribute('aria-busy'); }
  };
  // Keep the settings document mounted on close, including any unsaved settings input.
  dialog.querySelector('[data-home-model-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('pointerdown', event => { backdrop = event.target === dialog; });
  dialog.addEventListener('click', event => { if (backdrop && event.target === dialog) dialog.close(); });
  retry.addEventListener('click', () => void load());
  back.addEventListener('click', () => void load('/settings/models'));
  const openSettings = href => {
    if (typeof href !== 'string') return false;
    let url;
    try { url = new URL(href, location.origin); } catch { return false; }
    if (url.origin !== location.origin || !['/settings/models', '/settings/connectors', '/capabilities/connections'].includes(url.pathname)) return false;
    if (!dialog.open) dialog.showModal(); void load(url.pathname + keptQuery(url.search, url.pathname));
    return true;
  };
  document.addEventListener('molis-work:open-settings-path', event => { openSettings(event.detail?.href); });
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (openSettings(link.href)) event.preventDefault();
  });
})();`;
