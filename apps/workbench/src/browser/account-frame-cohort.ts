import { accountTransition } from './account-transition.js';
import type { accountCohort } from './account-cohort.js';

/** Trusted same-origin carrier documents save through their parent; opaque plugin documents never receive this bridge. */
export function accountFrameCohort(prepare: (signal: AbortSignal) => Promise<boolean>): ReturnType<typeof accountCohort> | null {
  const frame = window.frameElement;
  if (window.parent === window || !frame || window.parent.location.origin !== location.origin) return null;
  const transition = accountTransition();
  let detach: (() => void) | undefined, unwatch: (() => void) | undefined, closed = false, controller = new AbortController();
  const connect = async () => {
    // An arriving carrier is still inert; it joins only after the parent's account preparation ends.
    while (!closed && (!window.parent.molisWorkAccountTransition || window.parent.molisWorkAccountTransition.preparing)) await new Promise(resolve => setTimeout(resolve, 50));
    if (closed || detach) return;
    const attach = () => window.parent.molisWorkAccountTransition!.page(frame as HTMLElement, async () => {
      if (!await prepare(controller.signal)) throw new Error(globalThis.t.text('workbench.personal-account.cancelled'));
    }, () => { closed = true; unwatch?.(); controller.abort(); return transition.invalidate(); }, () => { controller.abort(); controller = new AbortController(); transition.resume(); });
    detach = attach();
    // A nested carrier or plugin mounting/unmounting changes the top window's preparation too.
    unwatch = transition.changed(() => { if (!closed) { detach?.(); detach = attach(); } });
  };
  return {
    pageId: '', revision: 0, connect, observe() {}, async cancel() {},
    async begin() { throw new Error(globalThis.t.text('workbench.personal-account.main-window')); },
    close() { closed = true; unwatch?.(); controller.abort(); detach?.(); },
  };
}
