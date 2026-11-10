import { installAccountCache } from './account-cache.js';
interface AccountTransition {
  readonly preparing: boolean;
  page(root: HTMLElement, flush: () => Promise<void>, dispose: () => void | Promise<void>, resume: () => void): () => void;
  changed(listener: () => void): () => void;
  prepare(): Promise<void>;
  hasDrafts(): Promise<boolean>;
  lock(): void;
  resume(): void;
  invalidate(clearCache?: boolean): Promise<void>;
}
declare global { var molisWorkAccountTransition: AccountTransition | undefined; interface Window { molisWorkAccountTransition?: AccountTransition } }

/** Account controls and opaque-frame transport are separate bundles in the same trusted document. */
export function accountTransition(): AccountTransition {
  if (globalThis.molisWorkAccountTransition) return globalThis.molisWorkAccountTransition;
  const pages = new Map<HTMLElement, {flush(): Promise<void>; dispose(): void | Promise<void>; resume(): void}>();
  const listeners = new Set<() => void>();
  const changed = () => { for (const listener of listeners) listener(); };
  const inert = new Map<HTMLElement, boolean>();
  const scope = document.querySelector<HTMLMetaElement>('meta[name="molis-work-page-session"]')?.content.split('.')[1];
  const accountCache = scope ? installAccountCache(scope) : {clear: async () => {}, hasDrafts: async () => false};
  let preparing = false, invalidated = false, disposal = Promise.resolve();
  return globalThis.molisWorkAccountTransition = {
    get preparing() { return preparing; },
    hasDrafts: () => accountCache.hasDrafts(),
    page(root, flush, dispose, resume) { pages.set(root, {flush, dispose, resume}); changed(); return () => { if (pages.delete(root)) changed(); }; },
    changed(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    lock() {
      preparing = true;
      if (document.body.hasAttribute('data-account-entry')) return;
      for (const notice of document.querySelectorAll<HTMLElement>('[data-account-transition-notice]')) notice.hidden = false;
      for (const node of document.body.children) if (node instanceof HTMLElement && !node.matches('.mw-account-popover, .mw-account-toast, [data-account-transition-notice]')) {
        if (!inert.has(node)) inert.set(node, node.inert); node.inert = true;
      }
    },
    async prepare() {
      if (invalidated) throw new Error('Account page has expired');
      globalThis.molisWorkAccountTransition!.lock();
      await Promise.all([...pages.values()].map(page => page.flush()));
    },
    resume() { if (invalidated) return; preparing = false; for (const page of pages.values()) page.resume(); for (const [node, value] of inert) node.inert = value; inert.clear(); for (const notice of document.querySelectorAll<HTMLElement>('[data-account-transition-notice]')) notice.hidden = true; },
    invalidate(clearCache = true) {
      const cleanup = clearCache ? accountCache.clear() : Promise.resolve();
      if (!invalidated) {
        globalThis.molisWorkAccountTransition!.lock(); invalidated = true;
        disposal = Promise.all([...pages.values()].map(async page => page.dispose())).then(() => {});
        pages.clear();
      }
      return Promise.all([cleanup, disposal]).then(() => {});
    },
  };
}
