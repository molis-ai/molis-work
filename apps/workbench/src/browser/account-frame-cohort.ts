import { accountTransition } from './account-transition.js';
import type { accountCohort } from './account-cohort.js';

/** Trusted same-origin carrier documents save through their parent; opaque plugin documents never receive this bridge. */
export function accountFrameCohort(prepare: (signal: AbortSignal) => Promise<boolean>): ReturnType<typeof accountCohort> | null {
  const frame = window.frameElement;
  if (window.parent === window || !frame || window.parent.location.origin !== location.origin) return null;
  const transition = accountTransition(), L = globalThis.L || (text => text);
  let detach: (() => void) | undefined, unwatch: (() => void) | undefined, closed = false, controller = new AbortController();
  const connect = async () => {
    while (!closed && !window.parent.molisWorkAccountTransition) await new Promise(resolve => setTimeout(resolve, 50));
    if (closed || detach) return;
    const attach = () => window.parent.molisWorkAccountTransition!.page(frame as HTMLElement, async () => {
      if (!await prepare(controller.signal)) throw new Error(L('账号操作已取消，尚未退出或切换账号。'));
    }, () => { closed = true; unwatch?.(); controller.abort(); transition.invalidate(); }, () => { controller.abort(); controller = new AbortController(); transition.resume(); });
    detach = attach();
    // A nested carrier or plugin mounting/unmounting changes the top window's preparation too.
    unwatch = transition.changed(() => { if (!closed) { detach?.(); detach = attach(); } });
  };
  return {
    pageId: '', revision: 0, connect, observe() {}, async cancel() {},
    async begin() { throw new Error(L('请在主窗口操作账号。')); },
    close() { closed = true; unwatch?.(); controller.abort(); detach?.(); },
  };
}
