import type { UiPageView } from "@molis-ai/molis-work-contracts/platform/ui";

/**
 * What the UI Host's `mountPluginClient(root)` gives a plugin client, for tests that run a client script against a fake DOM:
 * `whenVisible` effects that run while the surface is shown, and `own` cleanups that run when the page goes away.
 * `document.hidden` is read from the global document the test installs.
 */
type Closing = NonNullable<Parameters<UiPageView["onClosing"]>[0]>;
export function fakeLifetime(options: { close?(action: Closing): void } = {}) {
  let closing: Closing | null = null;
  const effects: Array<{ start: () => (() => void) | void; stop: (() => void) | void }> = [], owned: Array<() => void> = [];
  let alive = true;
  const mount = () => ({
    /** False once the scope is being disposed: the cleanups of the visible effects run then too, but the page is not just hidden. */
    get alive() { return alive; },
    /** What a request made `scope: life` goes through (the request helper): the page's fetch while the view is mounted, an abort once it is not. */
    fetch: (input: string, init: object) => globalThis.fetch(input, init as RequestInit),
    assertCurrent() { if (!alive) throw new DOMException("View unmounted", "AbortError"); },
    whenVisible(start: () => (() => void) | void) { const effect = { start, stop: start() }; effects.push(effect); return () => {}; },
    own(cleanup: () => void) { owned.push(cleanup); return cleanup; },
  });
  const documentNow = () => (globalThis as { document?: { hidden: boolean } }).document!;
  return {
    mount,
    view: { onClosing(action: Closing | null) { closing = action; } },
    /** The workbench hides this page's surface (another plugin was chosen): the effects stop, the browser tab is still showing. */
    hideSurface() { for (const effect of effects) { const stop = effect.stop; effect.stop = undefined; stop?.(); } },
    showSurface() { for (const effect of effects) if (!effect.stop) effect.stop = effect.start(); },
    /** The whole tab or window stops being shown: the effects stop too, and it is not leaving. */
    hideDocument() { documentNow().hidden = true; this.hideSurface(); },
    showDocument() { documentNow().hidden = false; this.showSurface(); },
    /** The page is going away (reload, window closed): the scope is disposed, so the effects stop and then the cleanups run. The document may or may not already be hidden. */
    unload() { if (closing) { const action = closing; closing = null; options.close?.(action); } alive = false; this.hideSurface(); for (const cleanup of owned.splice(0)) cleanup(); },
  };
}
