import type { ExactRef, Runtime, UiAction, UiExpectedTarget, UiSurface } from "@prologue/sdk";
import { createSurfaceRefusal } from "@prologue/sdk";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostSurfaceAction, HostSurfaceContext, HostSurfaceDriver, HostSurfaceExpectedTarget, HostSurfacePointerTarget, HostSurfaceRoundEnd } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { isHostSurfaceRefusal } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { agentErrors } from "../errors.js";
import type { ReviewDecisionControl } from "../review-decisions.js";
import { deliverDesktopAct } from "./desktop-act-delivery.js";

export type SurfaceRuntime = {
  readonly surfaces: Pick<Runtime["surfaces"], "attach" | "detach" | "reviewTarget">;
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
  checked<T>(operation: () => Promise<T>, expected?: UiExpectedTarget): Promise<T>;
  retainTextApproval(target: UiExpectedTarget, body: ExactRef<"resource">, focus: string): void;
}

/** One SDK target holds one exact context. Cleanup may outlive it, but cannot act on the next binding. */
export function createSurfaceBinding(surfaces: SurfaceRuntime["surfaces"], driver: HostSurfaceDriver,
  session: ExactRef<"session">, sessionId: string, control: ReviewDecisionControl,
  readText: (ref: ExactRef<"resource">) => Promise<string>, retired: () => void): SurfaceBinding {
  let live = true, ended: HostSurfaceRoundEnd | undefined, released = false;
  let releasing: Promise<void> | undefined;
  let target: ExactRef<"ui-target"> | undefined;
  const textApprovals = new Map<string, { target: UiExpectedTarget; focus: string }>();
  // SDK assessment and dispatch receive the very same action held by the original plan.
  const pointerAssessments = new WeakMap<UiAction, HostSurfacePointerTarget>();
  const resourceKey = (ref: ExactRef<"resource">) => JSON.stringify([ref.kind, ref.id, ref.revision]);
  const invalidate = () => { if (live) { live = false; textApprovals.clear(); retired(); } };
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
  const checked = async <T>(operation: () => Promise<T>, expected?: UiExpectedTarget): Promise<T> => {
    const check = () => { context.assertCurrent(); requireSynchronous(expected?.assertCurrent()); };
    try { check(); await context.beforeEffect(); check(); const value = await operation(); check(); return value; }
    catch (error) { throw refusal(error); }
  };
  const close = () => {
    invalidate();
    if (released) return Promise.resolve();
    return releasing ??= Promise.resolve().then(() => driver.release?.(context, ended)).then(() => { released = true; })
      .finally(() => { releasing = undefined; });
  };
  const surface: UiSurface = {
    kind: driver.kind,
    assertCurrent: context.assertCurrent,
    identity: () => checked(() => driver.identity(context)),
    scope: () => checked(() => driver.scope(context)),
    observe: (kind, expected) => checked(() => driver.observe(kind, context, expected), expected),
    async perform(action, expected) {
      try {
        let dispatch: HostSurfaceExpectedTarget = expected;
        const pointer = pointerAssessments.get(action);
        if (pointer) dispatch = Object.freeze({ ...expected, assessed_pointer: pointer });
        if (action.what === "text" && driver.kind === "browser") {
          const key = resourceKey(action.body), approved = textApprovals.get(key);
          textApprovals.delete(key);
          if (approved) {
            if (approved.target.identity !== expected.identity || approved.target.scope !== expected.scope) {
              throw createSurfaceRefusal("outside-target");
            }
            dispatch = Object.freeze({ ...expected, approved_focus: approved.focus, assertCurrent() {
              requireSynchronous(expected.assertCurrent());
              requireSynchronous(approved.target.assertCurrent());
            } });
          }
        }
        const converted = await checked(() => hostAction(action, readText), dispatch);
        // Once the driver was entered its own dispatch fence and receipt decide the outcome, including partial input.
        const receipt = await driver.perform(converted, context, dispatch);
        return driver.kind === "desktop" ? deliverDesktopAct(receipt) : undefined;
      } catch (error) { throw refusal(error); }
    },
    ...(driver.kind === "desktop" ? {
      readiness: () => checked(async () => (await driver.readiness?.(context))?.refusal ?? "ready"),
    } : {}),
    ...(driver.assess ? { assess: (action: UiAction, expected: UiExpectedTarget) => checked(async () => {
      const converted = await hostAction(action, readText); context.assertCurrent(); requireSynchronous(expected.assertCurrent());
      const assessed = await driver.assess!(converted, context, expected);
      if (assessed.pointer) pointerAssessments.set(action, Object.freeze({ ...assessed.pointer }));
      return assessed;
    }, expected) } : {}),
    close,
  };
  context.assertCurrent();
  target = surfaces.attach(surface, { owner: session }).ref;
  return { driver, context, target, checked, invalidate,
    retainTextApproval(original, body, focus) {
      context.assertCurrent();
      requireSynchronous(original.assertCurrent());
      textApprovals.set(resourceKey(body), { target: original, focus });
    },
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
