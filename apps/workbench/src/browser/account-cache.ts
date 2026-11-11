import { accountCachePrefix } from '../account-cache-key.js';
/** Browser copies owned by the account UI; device preferences and unrelated origins' data are not account state. */
const prefixes = [
  'molis.assistant.', 'molis-work:alchemist:', 'molis.characters.drafts:', 'molis-plugin-page:', 'molis-review-feedback:', 'molis-connectors-', 'molis.home-action:',
  'molis-work-plugin-records:', 'molis-work-tab-history:', 'molis-work-tab-workspace:',
  'molis-work-frame-container:', 'molis-work-goal-work-modes:', 'molis-work-ui:',
  'molis-work-goal-move-receipt:', 'molis-work-guidance-receipt:', 'molis-work-studio-build:',
  'molis-work:brief:', 'molis-work:home-shortcuts:',
];
const keys = new Set(['molis-work:return-trips', 'molis-work:return-window', 'molis-work:return-window-handoff', 'molis-work-decision-receipt', 'molis-work:search-scope', 'molis-work:onboarding-intro', 'molis-work:arrived']);
const owned = (key: string) => keys.has(key) || prefixes.some(prefix => key.startsWith(prefix));

/** Install before account content runs. Revocation also fences pagehide handlers and late cache writes. */
export function installAccountCache(scope: string): {clear(): Promise<void>; hasDrafts(): Promise<boolean>} {
  let revoked = false, clearing: Promise<void> | undefined;
  const prefix = accountCachePrefix(scope);
  // Keep the native event (and isTrusted), exposing only this account's logical cache keys.
  addEventListener('storage', event => {
    const key = event.key;
    if (!key?.startsWith('molis-account-cache:')) return;
    if (revoked || !key.startsWith(prefix)) event.stopImmediatePropagation();
    else Object.defineProperty(event, 'key', {value: key.slice(prefix.length)});
  }, true);
  const set = Storage.prototype.setItem, get = Storage.prototype.getItem, remove = Storage.prototype.removeItem, keyAt = Storage.prototype.key;
  const physical = (key: string) => owned(key) ? prefix + key : key;
  Storage.prototype.setItem = function(key, value) { key=String(key);if (!revoked || !owned(key)) set.call(this, physical(key), value); };
  Storage.prototype.getItem = function(key) { key=String(key);return revoked && owned(key) ? null : get.call(this, physical(key)); };
  Storage.prototype.removeItem = function(key) { remove.call(this, physical(String(key))); };
  Storage.prototype.key = function(index) {
    const visible: string[] = [];
    for (let i=0;i<this.length;i++) {
      const key = keyAt.call(this,i);
      if (key?.startsWith(prefix)) visible.push(key.slice(prefix.length));
      else if (key && !key.startsWith('molis-account-cache:') && !owned(key)) visible.push(key);
    }
    return visible[index] ?? null;
  };
  const pending = new Set<Promise<unknown>>(), accountCaches = new WeakSet<Cache>();
  const track = <T>(operation: Promise<T>): Promise<T> => {
    pending.add(operation);
    void operation.then(() => pending.delete(operation), () => pending.delete(operation));
    return operation;
  };
  const expired = () => Promise.reject(new Error('Account page has expired'));
  if (globalThis.caches) {
    const open = caches.open.bind(caches), put = Cache.prototype.put;
    caches.open = name => {
      if (!name.startsWith('molis-plugin-page:')) return open(name);
      if (revoked) return expired();
      return track(open(prefix + name).then(cache => { accountCaches.add(cache); return cache; }));
    };
    Cache.prototype.put = function(request, response) {
      if (!accountCaches.has(this)) return put.call(this, request, response);
      if (revoked) return expired();
      return track(put.call(this, request, response));
    };
  }
  const clear = () => {
    revoked = true;
    return clearing ??= (async () => {
      for (const area of [localStorage, sessionStorage]) {
        for (const key of Object.keys(area)) if (key.startsWith(prefix)) remove.call(area,key);
      }
      // An already dispatched put can finish after revocation; drain it before deleting the cache.
      await Promise.allSettled([...pending]);
      if (globalThis.caches) for (const name of await caches.keys()) if (name.startsWith(prefix)) await caches.delete(name);
    })();
  };
  const hasDrafts = (): Promise<boolean> => {
    if (revoked) return Promise.resolve(false);
    const writes = [...pending];
    // A reader may open an existing cache; cleanup must also wait for that open before deleting it.
    return track((async () => {
    await Promise.allSettled(writes);
    if (revoked) return false;
    const nonempty = (value: string | null) => !!value && !['', '{}', '[]', 'null'].includes(value.trim());
    for (const area of [localStorage, sessionStorage]) for (const physicalKey of Object.keys(area)) {
      if (!physicalKey.startsWith(prefix)) continue;
      const key = physicalKey.slice(prefix.length);
      if ((key.startsWith('molis-review-feedback:') || key.startsWith('molis.characters.drafts:')
        || key.startsWith('molis-connectors-draft:') || key.startsWith('molis-work:alchemist:') && key.includes(':reuse:'))
        && nonempty(get.call(area, physicalKey))) return true;
    }
    if (globalThis.caches) for (const name of await caches.keys()) {
      if (!name.startsWith(prefix + 'molis-plugin-page:') || !name.endsWith(':drafts')) continue;
      const cache = await caches.open(name);
      if ((await cache.keys()).length) return true;
    }
    return false;
    })());
  };
  return {clear, hasDrafts};
}
