import type { HostSurfaceAction, HostSurfaceContext, HostSurfaceDriver, HostSurfaceExpectedTarget, HostSurfaceObservationKind } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { createHash } from "node:crypto";

export function surfaceContext(session_id: string | null): HostSurfaceContext {
  return { session_id, beforeEffect() {}, assertCurrent() {} };
}

/** Take the same two driver readings the SDK takes before a look. Race tests retain this object across the wait. */
export async function surfaceTarget(driver: HostSurfaceDriver, context: HostSurfaceContext): Promise<HostSurfaceExpectedTarget> {
  const identity = await driver.identity(context);
  const scope = await driver.scope(context);
  return Object.freeze({ identity, scope, assertCurrent: () => context.assertCurrent() });
}

export function observeSurface(driver: HostSurfaceDriver, kind: HostSurfaceObservationKind, context: HostSurfaceContext, expected?: HostSurfaceExpectedTarget) {
  return Promise.resolve(expected ?? surfaceTarget(driver, context)).then(target => driver.observe(kind, context, target));
}

export function performSurface(driver: HostSurfaceDriver, action: HostSurfaceAction, context: HostSurfaceContext, expected?: HostSurfaceExpectedTarget) {
  return Promise.resolve(expected ?? surfaceTarget(driver, context)).then(target => driver.perform(action, context, target));
}

export function desktopState<T extends {
  bundle_id: string; pid: number; window?: { window_id?: number; frame: readonly number[]; title?: string; document?: string };
}>(state: T) {
  return {
    ...state,
    target: state.window ? { bundle_id: state.bundle_id, pid: state.pid, launch_time: 1,
      window_id: state.window.window_id ?? 1, frame: state.window.frame,
      title_hash: createHash("sha256").update(state.window.title ?? "").digest("hex"),
      ...(state.window.document ? { document_hash: createHash("sha256").update(state.window.document).digest("hex") } : {}),
      focus: "fixture-focus" } : undefined,
  };
}
