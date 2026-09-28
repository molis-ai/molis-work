/** Instantiated once by each browser Host, then injected into plugin factories. */
export const UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT = String.raw`() => {
  const mounts = new WeakMap();
  return root => {
    if (!root?.isConnected || mounts.has(root)) return null;
    // Embedded studio views share their same-origin parent's visibility and lifetime.
    const roots = [root];
    for (let view = window; view.parent !== view;) {
      try { const frame = view.frameElement; if (!frame) break; roots.push(frame); view = view.parent; }
      catch { break; }
    }
    const documents = [...new Set(roots.map(node => node.ownerDocument))];
    const controller = new AbortController(), cleanups = new Set(), visibleEffects = new Set();
    const timers = new Map(), frames = new Map();
    let disposed = false, pageHidden = false;
    const alive = () => !disposed && roots.every(node => node.isConnected);
    const visible = () => alive() && !pageHidden && documents.every(doc => !doc.hidden) && roots.every(node => !node.closest('[hidden]'));
    const assertCurrent = signal => {
      controller.signal.throwIfAborted();
      signal?.throwIfAborted();
      if (!roots.every(node => node.isConnected)) throw new DOMException('View unmounted', 'AbortError');
    };
    const own = cleanup => {
      let pending = true;
      const release = () => { if (!pending) return; pending = false; cleanups.delete(release); cleanup(); };
      if (disposed) release(); else cleanups.add(release);
      return release;
    };
    const stopEffect = effect => {
      if (!effect.controller) return;
      effect.controller.abort(); effect.controller = null;
      const cleanup = effect.cleanup; effect.cleanup = null; cleanup?.();
    };
    const syncEffect = effect => {
      if (!visible()) { stopEffect(effect); return; }
      if (effect.controller) return;
      effect.controller = new AbortController();
      effect.cleanup = effect.start(effect.controller.signal);
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true; controller.abort(); mounts.delete(root);
      // One faulty plugin cleanup must not retain unrelated page resources.
      for (const release of [...cleanups]) { try { release(); } catch (error) { console.error(error); } }
    };
    const sync = () => {
      if (!roots.every(node => node.isConnected)) { dispose(); return; }
      for (const effect of visibleEffects) syncEffect(effect);
    };
    const listen = (target, name, callback, options) => {
      if (!alive() || !target) return () => {};
      const settings = typeof options === 'boolean' ? { capture: options } : { ...options };
      settings.signal = settings.signal ? AbortSignal.any([controller.signal, settings.signal]) : controller.signal;
      target.addEventListener(name, callback, settings);
      // Native signal ownership also allows detached, dynamically rendered targets to be collected.
      return () => target.removeEventListener(name, callback, settings);
    };
    const timeout = (callback, delay) => {
      if (disposed) return 0;
      const id = setTimeout(() => { const release = timers.get(id); release?.(); if (alive()) callback(); }, delay);
      timers.set(id, own(() => { clearTimeout(id); timers.delete(id); })); return id;
    };
    const frame = callback => {
      if (disposed) return 0;
      const id = requestAnimationFrame(time => { const release = frames.get(id); release?.(); if (alive()) callback(time); });
      frames.set(id, own(() => { cancelAnimationFrame(id); frames.delete(id); })); return id;
    };
    const whenVisible = start => {
      const effect = { start, controller: null, cleanup: null }; visibleEffects.add(effect);
      const release = own(() => { visibleEffects.delete(effect); stopEffect(effect); });
      if (!disposed) syncEffect(effect);
      return release;
    };
    const scope = {
      get alive() { return alive(); }, get visible() { return visible(); }, signal: controller.signal,
      assertCurrent, own, listen, dispose, whenVisible,
      observe(observer, target, options) { observer.observe(target, options); own(() => observer.disconnect()); return observer; },
      timeout, clearTimeout(id) { timers.get(id)?.(); },
      frame, cancelFrame(id) { frames.get(id)?.(); },
      delay(ms, externalSignal) {
        return new Promise((resolve, reject) => {
          try { assertCurrent(externalSignal); } catch (error) { reject(error); return; }
          const signal = externalSignal ? AbortSignal.any([controller.signal, externalSignal]) : controller.signal;
          const abort = () => { scope.clearTimeout(timer); reject(signal.reason); };
          const timer = timeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
          signal.addEventListener('abort', abort, { once: true });
        });
      },
      nextFrame() {
        return new Promise((resolve, reject) => {
          try { assertCurrent(); } catch (error) { reject(error); return; }
          const abort = () => { scope.cancelFrame(id); reject(controller.signal.reason); };
          const id = frame(time => { controller.signal.removeEventListener('abort', abort); resolve(time); });
          controller.signal.addEventListener('abort', abort, { once: true });
        });
      },
      async fetch(input, init = {}) {
        assertCurrent(init.signal);
        const signal = init.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal;
        const response = await fetch(input, { ...init, signal });
        assertCurrent(signal); return response;
      },
      poll(read, delay, onError = error => console.error(error)) {
        return whenVisible(signal => {
          let timer = 0;
          const next = async () => {
            try { assertCurrent(signal); await read(signal); }
            catch (error) { if (!signal.aborted && alive()) onError(error); }
            finally { if (!signal.aborted && visible()) timer = timeout(next, delay); }
          };
          void next(); return () => scope.clearTimeout(timer);
        });
      },
    };
    mounts.set(root, scope);
    for (const doc of documents) {
      const observer = new MutationObserver(sync);
      observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
      own(() => observer.disconnect()); listen(doc, 'visibilitychange', sync);
    }
    listen(window, 'pagehide', event => { if (event.persisted) { pageHidden = true; sync(); } else dispose(); });
    listen(window, 'pageshow', () => { pageHidden = false; sync(); });
    return scope;
  };
}`;
