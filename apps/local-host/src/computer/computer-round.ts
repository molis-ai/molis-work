import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostSurfaceContext } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import type { DeskContext } from "./computer-driver.js";
import { tierOf } from "./app-tiers.js";
import { isHelperFailure, refused } from "./computer-errors.js";
import type { ComputerWindowTarget } from "./computer-target.js";

/** All shared desk state and helper responses stay with one exact round; later sessions never supply its authority. */
export function scopedDeskContext(desk: DeskContext, context: HostSurfaceContext, alive: () => void) {
  let dispatches = 0, acknowledged = false;
  let target = desk.target();
  const takeover = desk.takeovers();
  let window: ComputerWindowTarget | null = null;
  const assertCurrent = () => {
    alive(); requireSynchronous(context.assertCurrent()); desk.assertCurrent(context);
    if (desk.target() !== target || desk.takeovers() !== takeover) throw refused("outside-target", "原桌面目标或交还状态已变化，请重新观察。");
    if (target && tierOf(target, desk.settings.forbiddenIds()).tier === "forbidden") throw refused("outside-target", "用户已禁止操作原应用。");
  };
  const use = <T>(read: () => T): T => { assertCurrent(); return read(); };
  const noteInjected = () => { assertCurrent(); desk.noteInjected(); dispatches++; };
  const noteCompleted = () => { acknowledged = true; };
  const ctx: DeskContext = {
    assertCurrent, assertReady: () => { assertCurrent(); desk.assertReady(context); },
    helper: { async call<T>(op: string, params: Record<string, unknown> = {}, timeout?: number, beforeSend?: () => void, onDispatch?: () => void): Promise<T> {
      assertCurrent();
      const guard = () => {
        assertCurrent(); desk.assertReady(context);
        if (op === "app.open" && (typeof params.bundle_id !== "string" || tierOf({ bundle_id: params.bundle_id, name: params.bundle_id }, desk.settings.forbiddenIds()).tier === "forbidden")) throw refused("outside-target", "用户已禁止打开这个应用。");
        requireSynchronous(beforeSend?.()); assertCurrent();
      };
      let sent = false;
      const input = op.startsWith("input.") || op === "file.give" || op === "app.open";
      const usesWindow = input || op.startsWith("observe.") || op === "focused.field" || op === "probe.point" || op === "document";
      const wire = usesWindow ? { ...params, expected_window: window } : params;
      const result = await desk.helper.call<T>(op, wire, timeout, guard, () => {
        if (input) { noteInjected(); sent = true; }
        requireSynchronous(onDispatch?.());
      }).catch(error => { if (sent && isHelperFailure(error) && error.partial === false) dispatches--; throw error; });
      if (sent) {
        if (typeof result !== "object" || result === null || !(op === "app.open" ? "bundle_id" in result && result.bundle_id === params.bundle_id
          : op === "file.give" ? "accepted" in result && result.accepted === true : "done" in result && result.done === true)) {
          throw refused("driver-unavailable", "原电脑助手没有确认这次输入的结果", true);
        }
        // The exact request already finished. Its acknowledgment is a receipt, not authority to read or write again.
        noteCompleted();
      }
      guard(); return result;
    } },
    settings: { forbiddenIds: () => use(() => desk.settings.forbiddenIds()) },
    target: () => use(() => desk.target()), setTarget: next => { assertCurrent(); desk.setTarget(next); target = next; },
    takeovers: () => use(() => desk.takeovers()),
    ready: async () => { assertCurrent(); await context.beforeEffect(); assertCurrent(); await desk.ready(context); assertCurrent(); },
    readiness: async () => { assertCurrent(); const result = await desk.readiness(context); assertCurrent(); return result; },
    mark: (summary, point) => use(() => desk.mark(summary, point)), activity: () => use(() => desk.activity()),
    recordStep: (step, png) => use(() => desk.recordStep(step, png)), emitFrame: png => use(() => desk.emitFrame(png)),
    rememberProduced: png => use(() => desk.rememberProduced(png)), masked: bytes => use(() => desk.masked(bytes)),
    pauseForPerson: () => use(() => desk.pauseForPerson()), pendingPersonMove: () => use(() => desk.pendingPersonMove()),
    changed: () => use(() => desk.changed()), noteInjected, noteCompleted,
    describeRound: (_context, metadata) => use(() => desk.describeRound(context, metadata)),
    noteRun: (_context, runId) => use(() => desk.noteRun(context, runId)),
    release: (_context, ended) => desk.release(context, ended),
    noteWindow: title => use(() => desk.noteWindow?.(title)), noteFile: name => use(() => desk.noteFile?.(name)),
    ...(desk.now ? { now: () => use(() => desk.now!()) } : {}),
  };
  return { ctx, assertCurrent, dispatches: () => dispatches, acknowledged: () => acknowledged,
    useWindow(expected: ComputerWindowTarget | null) { assertCurrent(); window = expected; },
  };
}
