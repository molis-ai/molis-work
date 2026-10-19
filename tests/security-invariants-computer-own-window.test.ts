// Security invariant S-25 (docs/system/SECURITY-INVARIANTS.md): a window that shows Molis Work (its confirm cards, in the
// desktop app or in the person's browser) is off limits to the desktop assistant. The app's Window menu can still name
// such a window, so the menu path that would bring it forward is refused before anything is injected and recorded as
// refused, and neither the Window menu hint nor `window-metadata` offers it. The shipped driver runs here on a fake
// helper (no macOS needed). Public entries only (tests may not reach into package sources: pnpm health:check).
import assert from "node:assert/strict";
import test from "node:test";
import { ComputerDriver, isRefused, type DeskContext } from "@molis-ai/molis-work-app-local-host";

type Call = { op: string; payload?: Record<string, unknown> };
type Step = { kind?: string; summary?: string };

const MOLIS_WINDOW = "确认 · Molis Work";

function desk(calls: Call[], steps: Step[]): DeskContext {
  const frame: [number, number, number, number] = [0, 0, 120, 80];
  const state = { bundle_id: "com.apple.TextEdit", name: "TextEdit", pid: 4, active: true, hidden: false, front_pid: 4,
    window: { title: "Notes", frame, window_id: 1, document: "" },
    windows: ["Notes", "Ideas", MOLIS_WINDOW].map(title => ({ title, frame, focused: title === "Notes", minimized: false })) };
  return {
    helper: { async call<T>(op: string, payload?: Record<string, unknown>): Promise<T> {
      calls.push({ op, ...(payload ? { payload } : {}) });
      if (op === "app.state" || op === "app.open") return state as T;
      if (op === "apps.installed" || op === "apps.running") return { apps: [{ bundle_id: state.bundle_id, name: state.name }] } as T;
      if (op === "observe.screenshot") return { png: Buffer.from("png").toString("base64"), included_pids: [4], password_fields: 0, masked: 0 } as T;
      if (op === "observe.tree") {
        return { window: { title: "Notes", frame }, nodes: [{ role: "AXButton", name: "保存", depth: 0, frame: [10, 10, 40, 20] }], truncated: false, menus: ["文件", "窗口", "帮助"] } as T;
      }
      if (op === "observe.menus") return { items: [{ title: "Notes" }, { title: "Ideas" }, { title: "Minimize" }, { title: MOLIS_WINDOW }] } as T;
      if (op === "probe.point") return { window: { pid: 4, title: "Notes" }, element: { pid: 4, name: "保存", window_title: "Notes" } } as T;
      if (op.startsWith("input.")) return {} as T;
      throw new Error(op);
    } },
    settings: { forbiddenIds: () => [] },
    noteInjected: () => undefined,
    target: () => ({ bundle_id: state.bundle_id, name: state.name, pid: state.pid, verdict: { tier: "ask", reason: "", built_in: true } }),
    setTarget: () => undefined,
    takeovers: () => 0,
    ready: async () => undefined,
    readiness: async () => null,
    mark: () => undefined,
    activity: () => null,
    recordStep: step => { steps.push(step); },
    emitFrame: () => undefined,
    rememberProduced: () => undefined,
    masked: () => false,
    pauseForPerson: () => undefined,
    pendingPersonMove: () => false,
    changed: () => undefined,
    describeRound: () => undefined,
    noteRun: () => undefined,
    release: () => undefined,
  } as DeskContext;
}

test("S-25 a menu path to a window that shows Molis Work is refused before it is injected, and no look offers that window", async () => {
  const calls: Call[] = [];
  const steps: Step[] = [];
  const surface = new ComputerDriver(desk(calls, steps)).surface();
  const tree = new TextDecoder().decode(await surface.observe("accessibility-tree", { session_id: "s" }));
  assert.match(tree, /Ideas/, "the Window menu hint still lists the app's other windows");
  assert.doesNotMatch(tree, /Molis Work/, "the Window menu hint does not offer a window that shows Molis Work");
  const metadata = JSON.parse(new TextDecoder().decode(await surface.observe("window-metadata", { session_id: "s" }))) as { windows: { title: string }[] };
  assert.equal(metadata.windows.some(one => one.title.includes("Molis Work")), false, "window-metadata does not list it either");

  const injectedBefore = calls.filter(call => call.op.startsWith("input.")).length;
  await assert.rejects(() => surface.perform({ what: "menu", path: ["窗口", MOLIS_WINDOW] }, { session_id: "s" }),
    (error: unknown) => isRefused(error) && /Molis Work/.test(error.message));
  assert.equal(calls.filter(call => call.op.startsWith("input.")).length, injectedBefore, "nothing reaches the input helper");
  assert.equal(steps.at(-1)?.kind, "refused");
  assert.match(steps.at(-1)?.summary ?? "", /Molis Work/);
});
