import type { ExactRef, Runtime, UiAction, UiSurface } from "@prologue/sdk";
import { createSurfaceRefusal } from "@prologue/sdk";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostSurfaceAction, HostSurfaceContext, HostSurfaceDriver, HostSurfaceRoundEnd } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { isHostSurfaceRefusal } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { agentErrors } from "../errors.js";
import type { ReviewDecisionControl } from "../review-decisions.js";
import { deliverDesktopAct } from "./desktop-act-delivery.js";

export type SurfaceRuntime = {
  readonly surfaces: Pick<Runtime["surfaces"], "attach" | "detach">;
  readonly effects: Pick<Runtime["effects"], "remember" | "forget" | "releaseRun">;
};

/** The original resource is read under the original round, never a later session's focus. */
async function hostAction(action: UiAction, readText: (ref: ExactRef<"resource">) => Promise<string>): Promise<HostSurfaceAction> {
  switch (action.what) {
    case "text": return { what: "text", text: await readText(action.body) };
    case "pointer": return { what: "pointer", x: action.x, y: action.y, button: action.button, clicks: action.clicks, ...(action.node ? { node: action.node } : {}) };
    case "key": return { what: "key", keys: [...action.keys] };
    case "navigate": return { what: "navigate", url: action.url };
    case "wait": return { what: "wait", ms: action.ms };
    case "upload": return { what: "upload", from: [...action.from] };
    case "download": return { what: "download", to: [...action.to] };
    case "scroll": return { what: "scroll", x: action.x, y: action.y, dx: action.dx, dy: action.dy };
    case "drag": return { what: "drag", x: action.x, y: action.y, to_x: action.toX, to_y: action.toY };
    case "hover": return { what: "hover", x: action.x, y: action.y };
    case "app": return { what: "app", app: action.app };
    case "menu": return { what: "menu", path: [...action.path] };
  }
}

const refusal = (error: unknown): Error => isHostSurfaceRefusal(error)
  ? createSurfaceRefusal(error.refusal, { partial: error.partial === true })
  : error instanceof Error ? error : new Error(String(error));

export interface SurfaceBinding {
  readonly driver: HostSurfaceDriver;
  readonly context: HostSurfaceContext;
  readonly target: ExactRef<"ui-target">;
  invalidate(): void;
  held(): boolean;
  current(): boolean;
  detach(ended?: HostSurfaceRoundEnd): Promise<void>;
  checked<T>(operation: () => Promise<T>): Promise<T>;
}

/** One SDK target holds one exact context. Cleanup may outlive it, but cannot act on the next binding. */
export function createSurfaceBinding(surfaces: SurfaceRuntime["surfaces"], driver: HostSurfaceDriver,
  session: ExactRef<"session">, sessionId: string, control: ReviewDecisionControl,
  readText: (ref: ExactRef<"resource">) => Promise<string>, retired: () => void): SurfaceBinding {
  let live = true, ended: HostSurfaceRoundEnd | undefined, released = false;
  let releasing: Promise<void> | undefined;
  let target: ExactRef<"ui-target"> | undefined;
  const invalidate = () => { if (live) { live = false; retired(); } };
  const context: HostSurfaceContext = {
    session_id: sessionId,
    assertCurrent() {
      if (!live) throw agentErrors.review_not_permitted("原轮次的界面已释放");
      requireSynchronous(control.assertCurrent());
    },
    async beforeEffect() {
      context.assertCurrent();
      await control.beforeEffect();
      context.assertCurrent();
    },
  };
  const checked = async <T>(operation: () => Promise<T>): Promise<T> => {
    try { await context.beforeEffect(); context.assertCurrent(); const value = await operation(); context.assertCurrent(); return value; }
    catch (error) { throw refusal(error); }
  };
  const close = () => {
    invalidate();
    if (released) return Promise.resolve();
    return releasing ??= Promise.resolve().then(() => driver.release?.(context, ended)).then(() => { released = true; })
      .finally(() => { releasing = undefined; });
  };
  const actionOf = async (action: UiAction) => {
    const converted = await hostAction(action, ref => checked(() => readText(ref)));
    context.assertCurrent(); return converted;
  };
  const surface: UiSurface = {
    kind: driver.kind,
    assertCurrent: context.assertCurrent,
    identity: () => checked(() => driver.identity(context)),
    scope: () => checked(() => driver.scope(context)),
    observe: kind => checked(() => driver.observe(kind, context)),
    async perform(action) {
      try {
        await context.beforeEffect(); const converted = await actionOf(action); context.assertCurrent();
        // Once the driver was entered its own dispatch fence and receipt decide the outcome, including partial input.
        const receipt = await driver.perform(converted, context);
        return driver.kind === "desktop" ? deliverDesktopAct(receipt) : undefined;
      } catch (error) { throw refusal(error); }
    },
    ...(driver.kind === "desktop" ? {
      readiness: () => checked(async () => (await driver.readiness?.(context))?.refusal ?? "ready"),
      assess: (action: UiAction) => checked(async () => {
        const converted = await actionOf(action); context.assertCurrent();
        return driver.assess ? driver.assess(converted, context) : { irreversible: false };
      }),
    } : {}),
    close,
  };
  context.assertCurrent();
  target = surfaces.attach(surface, { owner: session }).ref;
  return { driver, context, target, checked, invalidate,
    held: () => live,
    current() { try { context.assertCurrent(); return true; } catch { return false; } },
    detach(reason) { ended ??= reason; invalidate(); return surfaces.detach(target!); },
  };
}

/** Retire every binding before awaiting any cleanup; report failures only after all original cleanups settled. */
export async function detachSurfaceBindings(bindings: readonly SurfaceBinding[], ended?: HostSurfaceRoundEnd): Promise<void> {
  for (const binding of bindings) binding.invalidate();
  const outcomes = await Promise.allSettled(bindings.map(binding => binding.detach(ended)));
  const failures = outcomes.flatMap(outcome => outcome.status === "rejected" ? [outcome.reason] : []);
  if (failures.length) throw new AggregateError(failures, "原轮次界面尚未完成释放");
}
