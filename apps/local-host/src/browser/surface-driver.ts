import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostSurfaceContext, HostSurfaceDriver } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import type { BrowserPage } from "./browser-host.js";
import { browserErrors } from "./errors.js";
import { BrowserSurfaceRound } from "./surface-round.js";
import { observeBrowserSurface, surfaceField, surfacePoint } from "./surface-observation.js";
import { performBrowserSurface } from "./surface-input.js";

/** The shared side-panel page admits one exact round. An old cleanup never looks up a replacement by session id. */
export function createBrowserSurfaceDriver(page: BrowserPage, blocked: (origin: string) => boolean = () => false, enabled: () => boolean = () => true): HostSurfaceDriver {
  let active: BrowserSurfaceRound | undefined, closed = false;
  const released = new WeakSet<HostSurfaceContext>();
  const releasing = new Set<Promise<void>>();
  const retiring = new Set<BrowserSurfaceRound>();
  const roundFor = async (context: HostSurfaceContext) => {
    requireSynchronous(context.assertCurrent());
    await Promise.all([...retiring].map(round => round.drainInputs()));
    requireSynchronous(context.assertCurrent());
    if (closed || released.has(context)) throw browserErrors.load_failed("原轮次的浏览器已释放");
    if (active && active.context !== context) throw browserErrors.load_failed("另一个轮次正在使用这个浏览器");
    const round = active ??= new BrowserSurfaceRound(page, context, enabled, blocked);
    await round.ready(); round.assertCurrent(); return round;
  };
  const release = (context: HostSurfaceContext): Promise<void> => {
    released.add(context);
    const round = active;
    if (!round || round.context !== context) return Promise.resolve();
    active = undefined;
    retiring.add(round);
    // release invalidates its state synchronously before the first cleanup wait.
    const cleanup = round.release(); releasing.add(cleanup);
    return cleanup.finally(() => { releasing.delete(cleanup); retiring.delete(round); });
  };
  return {
    kind: "browser", project_id: page.projectId,
    async identity(context) {
      const round = await roundFor(context), session = await round.session(); session.assertCurrent();
      return `${session.targetId}\u0000${page.snapshot().url}\u0000${page.takeoverCount}\u0000${page.documentGeneration}`;
    },
    async scope(context) { const round = await roundFor(context); round.assertCurrent(); if (!page.sourceKnown) throw browserErrors.load_failed("原页面来源尚未确认"); return page.snapshot().origin || "about:blank"; },
    async observe(kind, context) {
      const round = await roundFor(context), bytes = await observeBrowserSurface(round, kind); round.assertCurrent(); return bytes;
    },
    async perform(action, context) { const round = await roundFor(context); await round.input(() => performBrowserSurface(round, action)); },
    async describeNode(node, context) {
      const round = await roundFor(context), target = await round.nodes.resolve(node);
      try { target.assertCurrent(); return target.label; }
      finally { await target.release(); round.assertCurrent(); }
    },
    async describePoint(x, y, context) {
      const round = await roundFor(context), session = await round.session();
      const label = await surfacePoint(session, x, y); session.assertCurrent(); return label;
    },
    async focusedField(context) {
      const round = await roundFor(context), session = await round.session();
      const field = await surfaceField(session); session.assertCurrent(); return field;
    },
    release,
    async close() { closed = true; if (active) await release(active.context); await Promise.all(releasing); },
    masked: bytes => active?.masked(bytes) ?? false,
  };
}
