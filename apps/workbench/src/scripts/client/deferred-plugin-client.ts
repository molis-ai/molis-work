import { BUILTIN_PLUGIN_WORKBENCH } from "../../plugin-workbench.js";

/** Loading is UI-only. Visible surfaces keep their original client and Host lifetime.
 * Browsers retain failed ESM imports. Explicit retry gets a new entry URL and
 * must never replay a business request. Keep this explanation out of served JS. */
export const DEFERRED_PLUGIN_CLIENT_FACTORY_SCRIPT = `(host) => {
  const { translate: L } = host;
  const packs = ${JSON.stringify(BUILTIN_PLUGIN_WORKBENCH.filter(pack => pack.clientFactory).map(pack => pack.clientAssets?.length ? [pack.project_plugin_id, pack.clientAssets] : [pack.project_plugin_id]))}.map(([id, assets = []]) => ({ id, assets }));
  const scripts = new Map(), mounting = new WeakMap(), selections = new WeakMap(), runtimeAttempts = new WeakMap();
  const scope = host.scope;
  const load = (url, stylesheet = false) => {
    if (scope.signal.aborted) return Promise.reject(scope.signal.reason);
    if (scripts.has(url)) return scripts.get(url);
    const waiting = new Promise((resolve, reject) => {
      const script = document.createElement(stylesheet ? 'link' : 'script');
      if (stylesheet) { script.rel = 'stylesheet'; script.href = url; } else script.src = url;
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
  const runtimeFactory = async root => {
    const safe = path => {
      const url = new URL(path, location.href), prefix = root.dataset.runtimeApiPrefix + '/';
      if (url.origin !== location.origin || !url.pathname.startsWith(prefix)) throw new Error(L('插件界面资源不属于当前插件'));
      return url.href;
    };
    if (root.dataset.runtimeStyle) await load(safe(root.dataset.runtimeStyle), true);
    const attempt = (runtimeAttempts.get(root) || 0) + 1; runtimeAttempts.set(root, attempt);
    const clientUrl = new URL(safe(root.dataset.runtimeClient));
    if (attempt > 1) clientUrl.searchParams.set('ui_attempt', String(attempt));
    const url = clientUrl.href;
    let timer, abort;
    const module = await Promise.race([import(url), new Promise((_, reject) => {
      abort = () => reject(scope.signal.reason);
      scope.signal.addEventListener('abort', abort, { once: true });
      timer = scope.timeout(() => reject(new Error(L('无法加载界面，请重试'))), 10_000);
    })]).finally(() => { scope.clearTimeout(timer); scope.signal.removeEventListener('abort', abort); });
    return module.default;
  };
  const prepare = root => {
    if (!root || !root.hasAttribute('data-deferred-surface')) return Promise.resolve();
    if (mounting.has(root)) return mounting.get(root);
    const pack = packs.find(pack => pack.id === root.dataset.workSurface);
    if (!pack && !root.dataset.runtimeClient) return Promise.resolve();
    const template = root.querySelector(':scope > template[data-deferred-content]');
    if (template) { root.append(template.content); template.remove(); }
    root.inert = true; root.setAttribute('aria-busy', 'true'); root.dataset.uiClientState = 'loading';
    const pending = (async () => {
      try {
        let factory;
        if (root.dataset.runtimeClient) factory = await runtimeFactory(root);
        else {
          for (const asset of pack.assets) await load(asset);
          await load('/assets/molis-work-plugins/' + encodeURIComponent(pack.id) + '.js');
          factory = globalThis.molisWorkbenchPluginFactories?.[pack.id];
        }
        if (!root.isConnected || scope.signal.aborted) return;
        if (typeof factory !== 'function') throw new Error(L('无法加载界面，请重试'));
        await factory({ ...host, root });
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
        retry.onclick = () => { notice.remove(); void prepare(root); }; notice.append(retry);
        if (root.dataset.runtimeClient) {
          const reload = document.createElement('button'); reload.type = 'button'; reload.className = 'mw-btn mw-btn--ghost';
          reload.textContent = L('重新加载页面'); reload.title = L('如果依赖资源也加载失败，请先保留其他页面未保存的内容，再重新加载');
          reload.onclick = () => location.reload(); notice.append(reload);
        }
        root.prepend(notice);
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
