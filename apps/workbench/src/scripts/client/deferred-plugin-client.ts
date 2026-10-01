import { BUILTIN_PLUGIN_WORKBENCH } from "../../plugin-workbench.js";

/** Loading is UI-only. Visible surfaces keep their original client and Host lifetime. */
export const DEFERRED_PLUGIN_CLIENT_FACTORY_SCRIPT = `(host) => {
  const { translate: L } = host;
  const packs = ${JSON.stringify(BUILTIN_PLUGIN_WORKBENCH.filter(pack => pack.clientFactory).map(pack => ({ id: pack.project_plugin_id, assets: pack.clientAssets ?? [] })))};
  const scripts = new Map(), mounting = new WeakMap(), selections = new WeakMap();
  const scope = host.scope;
  const load = url => {
    if (scope.signal.aborted) return Promise.reject(scope.signal.reason);
    if (scripts.has(url)) return scripts.get(url);
    const waiting = new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = url;
      let settled = false;
      const finish = error => {
        if (settled) return; settled = true; scope.clearTimeout(timer);
        scope.signal.removeEventListener('abort', abort); script.onload = null; script.onerror = null;
        if (error) { script.remove(); scripts.delete(url); reject(error); } else resolve();
      };
      const abort = () => finish(scope.signal.reason);
      const timer = scope.timeout(() => finish(new Error(L('无法加载界面，请重试'))), 10_000);
      scope.signal.addEventListener('abort', abort, { once: true });
      script.onload = () => finish();
      script.onerror = () => finish(new Error(L('无法加载界面，请重试')));
      document.head.append(script);
    });
    scripts.set(url, waiting); return waiting;
  };
  const prepare = root => {
    if (!root || !root.hasAttribute('data-deferred-surface')) return Promise.resolve();
    if (mounting.has(root)) return mounting.get(root);
    const pack = packs.find(pack => pack.id === root.dataset.workSurface);
    if (!pack) return Promise.resolve();
    const template = root.querySelector(':scope > template[data-deferred-content]');
    if (template) { root.append(template.content); template.remove(); }
    root.inert = true; root.setAttribute('aria-busy', 'true'); root.dataset.uiClientState = 'loading';
    const pending = (async () => {
      try {
        for (const asset of pack.assets) await load(asset);
        await load('/assets/molis-work-plugins/' + encodeURIComponent(pack.id) + '.js');
        if (!root.isConnected || scope.signal.aborted) return;
        const factory = globalThis.molisWorkbenchPluginFactories?.[pack.id];
        if (!factory) throw new Error(L('无法加载界面，请重试'));
        factory({ ...host, root });
        root.removeAttribute('data-deferred-surface'); root.dataset.uiClientState = 'ready';
        root.inert = false; root.removeAttribute('aria-busy');
        const selection = selections.get(root);
        if (selection) { selections.delete(root); root.dispatchEvent(new CustomEvent('molis-work:select-item', { detail: selection })); }
      } catch (error) {
        if (!root.isConnected || scope.signal.aborted) return;
        root.inert = false; root.removeAttribute('aria-busy'); root.dataset.uiClientState = 'failed'; mounting.delete(root);
        const notice = document.createElement('div'); notice.style.cssText = 'position:absolute;right:12px;top:12px;z-index:30';
        const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'mw-btn mw-btn--ghost';
        retry.textContent = L('无法加载界面，请重试'); retry.dataset.uiClientRetry = 'true';
        retry.onclick = () => { notice.remove(); void prepare(root); }; notice.append(retry); root.prepend(notice);
        host.showToast?.(error.message, true);
      }
    })(); mounting.set(root, pending); return pending;
  };
  // Preserve the most recent open/close intent until the actual client is listening.
  document.addEventListener('molis-work:select-item', event => {
    const root = event.target.closest?.('[data-deferred-surface]');
    if (!root) return; selections.set(root, event.detail); event.stopImmediatePropagation(); void prepare(root);
  }, true);
  const visible = () => document.querySelectorAll('[data-deferred-surface]').forEach(root => {
    if (!root.closest('[hidden]') && root.dataset.uiClientState !== 'failed') void prepare(root);
  });
  scope.observe(new MutationObserver(visible), document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'], childList: true });
  visible();
  return { prepare, ready: id => prepare(document.querySelector('[data-work-surface="' + CSS.escape(id) + '"]')) };
}`;
