import { deferredSurfaceClients } from "../../plugin-workbench.js";

/**
 * Trusted Host surfaces retain their client and lifetime. Registered plugin code runs only inside its opaque frame;
 * the owner loads the shared frame bridge and never executes a plugin bundle.
 */
export const DEFERRED_PLUGIN_CLIENT_FACTORY_SCRIPT = `(host) => {
  const { translate: L } = host;
  const failure = () => L('无法加载界面，请重试');
  const packs = ${JSON.stringify(deferredSurfaceClients().map(({ id, plugin_id, bundle, assets, searchRow, recordRow }) => [id, plugin_id, bundle, assets, searchRow, recordRow]))}.map(([id, plugin_id, bundle, assets, searchRow, recordRow]) => ({ id, plugin_id, bundle, assets, searchRow, recordRow }));
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
      const timer = scope.timeout(() => finish(new Error(failure())), 10_000);
      scope.signal.addEventListener('abort', abort, { once: true });
      script.onload = () => finish();
      script.onerror = () => finish(new Error(failure()));
      document.head.append(script);
    });
    scripts.set(url, waiting); return waiting;
  };
  const settle = (root, state) => { root.inert = false; root.removeAttribute('aria-busy'); root.dataset.uiClientState = state; };
  const prepare = root => {
    if (!root || !root.hasAttribute('data-deferred-surface') || root.closest('[hidden], [data-surface-pool]')) return Promise.resolve();
    if (mounting.has(root)) return mounting.get(root);
    const pack = packs.find(pack => pack.id === root.dataset.workSurface);
    if (!pack) return Promise.resolve();
    // A real reopen replaces this surface's previous failure, just as its retry button does.
    for (const retry of root.querySelectorAll(':scope > div > [data-ui-client-retry]')) retry.parentElement.remove();
    const template = root.querySelector(':scope > template[data-deferred-content]');
    if (!pack.plugin_id && template) { root.append(template.content); template.remove(); }
    root.inert = true; root.setAttribute('aria-busy', 'true'); root.dataset.uiClientState = 'loading';
    const pending = (async () => {
      try {
        if (pack.plugin_id) {
          await load('/assets/molis-work-plugin-frame.js');
          if (!root.isConnected || scope.signal.aborted) return;
          if(root.closest('[hidden], [data-surface-pool]')){mounting.delete(root);settle(root,'idle');return;}
          await globalThis.molisPluginFrames.mount(root, host, pack);
        } else {
          for (const asset of pack.assets) await load(asset);
          await load('/assets/molis-work-plugins/' + encodeURIComponent(pack.bundle) + '.js');
          if (!root.isConnected || scope.signal.aborted) return;
          const factory = globalThis.molisWorkbenchPluginFactories?.[pack.bundle];
          if (!factory) throw new Error(failure());
          factory({ ...host, root });
        }
        root.removeAttribute('data-deferred-surface'); settle(root, 'ready');
        const selection = selections.get(root);
        if (selection) { selections.delete(root); root.dispatchEvent(new CustomEvent('molis-work:select-item', { detail: selection })); }
      } catch (error) {
        if (!root.isConnected || scope.signal.aborted) return;
        settle(root, 'failed'); mounting.delete(root);
        const notice = document.createElement('div'); notice.style.cssText = 'position:absolute;right:12px;top:12px;z-index:30';
        const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'mw-btn mw-btn--ghost';
        retry.textContent = failure(); retry.dataset.uiClientRetry = 'true';
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
    if (!root.closest('[hidden], [data-surface-pool]') && root.dataset.uiClientState !== 'failed') void prepare(root);
  });
  scope.observe(new MutationObserver(visible), document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'], childList: true });
  visible();
  return { prepare, ready: id => prepare(document.querySelector('[data-work-surface="' + CSS.escape(id) + '"]')) };
}`;
