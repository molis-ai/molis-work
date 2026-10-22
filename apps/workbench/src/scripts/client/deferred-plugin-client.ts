import { pluginSurfaceClients } from "../../plugin-workbench.js";

/**
 * The owner loads only the trusted frame bridge. Each visible surface loads its registered bundle inside its own opaque frame.
 */
export const DEFERRED_PLUGIN_CLIENT_FACTORY_SCRIPT = `(host) => {
  const { translate: L } = host;
  const failure = () => L('无法加载界面，请重试');
  const packs = ${JSON.stringify(pluginSurfaceClients().map(({ id, plugin_id, bundle, assets }) => [id, plugin_id === "io.molis.work." + id ? 0 : plugin_id, bundle === id ? 0 : bundle, ...(assets.length ? [assets] : [])]))}.map(([id,plugin_id,bundle,assets=[]])=>({id,plugin_id:plugin_id||"io.molis.work."+id,bundle:bundle||id,assets}));
  const mounting = new WeakMap(), selections = new WeakMap(), scope = host.scope;
  let runtime;
  const load = () => {
    if (globalThis.molisPluginFrames) return Promise.resolve();
    return runtime ||= new Promise((resolve,reject) => {
      const script=document.createElement('script');script.src='/assets/molis-work-plugin-frame.js';
      let settled=false;
      const finish=error=>{if(settled)return;settled=true;scope.clearTimeout(timer);scope.signal.removeEventListener('abort',abort);script.onload=null;script.onerror=null;
        if(error){script.remove();runtime=null;reject(error);}else resolve();};
      const abort=()=>finish(scope.signal.reason), timer=scope.timeout(()=>finish(new Error(failure())),10000);
      scope.signal.addEventListener('abort',abort,{once:true});script.onload=()=>finish();script.onerror=()=>finish(new Error(failure()));document.head.append(script);
    });
  };
  const settle = (root, state) => { root.inert = false; root.removeAttribute('aria-busy'); root.dataset.uiClientState = state; };
  const prepare = root => {
    if (!root || !root.hasAttribute('data-deferred-surface')) return Promise.resolve();
    if (mounting.has(root)) return mounting.get(root);
    const pack = packs.find(pack => pack.id === root.dataset.workSurface);
    if (!pack) return Promise.resolve();
    root.inert = true; root.setAttribute('aria-busy', 'true'); root.dataset.uiClientState = 'loading';
    const pending = (async () => {
      try {
        await load();
        if (!root.isConnected || scope.signal.aborted) return;
        await globalThis.molisPluginFrames.mount(root, host, pack);
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
    if (!root.closest('[hidden]') && root.dataset.uiClientState !== 'failed') void prepare(root);
  });
  scope.observe(new MutationObserver(visible), document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'], childList: true });
  visible();
  return { prepare, ready: id => prepare(document.querySelector('[data-work-surface="' + CSS.escape(id) + '"]')) };
}`;
