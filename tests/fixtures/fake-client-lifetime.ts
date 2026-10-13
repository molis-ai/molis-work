/**
 * What the UI Host's `mountPluginClient(root)` gives a plugin client, for tests that run a client script against a fake DOM:
 * `whenVisible` effects that run while the surface is shown, and `own` cleanups that run when the page goes away.
 * `document.hidden` is read from the global document the test installs.
 */
export function fakeLifetime() {
  const effects: Array<{ start: () => (() => void) | void; stop: (() => void) | void }> = [], owned: Array<() => void> = [];
  let alive = true;
  const mount = () => ({
    /** False once the scope is being disposed: the cleanups of the visible effects run then too, but the page is not just hidden. */
    get alive() { return alive; },
    whenVisible(start: () => (() => void) | void) { const effect = { start, stop: start() }; effects.push(effect); return () => {}; },
    own(cleanup: () => void) { owned.push(cleanup); return cleanup; },
  });
  const documentNow = () => (globalThis as { document?: { hidden: boolean } }).document!;
  return {
    mount,
    /** The workbench hides this page's surface (another plugin was chosen): the effects stop, the browser tab is still showing. */
    hideSurface() { for (const effect of effects) { const stop = effect.stop; effect.stop = undefined; stop?.(); } },
    showSurface() { for (const effect of effects) if (!effect.stop) effect.stop = effect.start(); },
    /** The whole tab or window stops being shown: the effects stop too, and it is not leaving. */
    hideDocument() { documentNow().hidden = true; this.hideSurface(); },
    showDocument() { documentNow().hidden = false; this.showSurface(); },
    /** The page is going away (reload, window closed): the scope is disposed, so the effects stop and then the cleanups run. The document may or may not already be hidden. */
    unload() { alive = false; this.hideSurface(); for (const cleanup of owned.splice(0)) cleanup(); },
  };
}
