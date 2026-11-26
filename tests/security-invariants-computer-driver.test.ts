// Security invariant S-25 (docs/system/SECURITY-INVARIANTS.md):
// 1. A window that shows Molis Work (its confirm cards, in the desktop app or in the person's browser) is off limits
//    to the desktop assistant: menu paths that would bring it forward are refused before injection, and neither the
//    Window menu hint nor `window-metadata` offers it.
// 2. A model-supplied node selector is never compiled into a RegExp (preventing catastrophic backtracking over the tree).
// The shipped driver runs here on a fake helper (no macOS needed). Public entries only.
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";
import type { HostSurfaceActReceipt, HostSurfaceAction } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { ComputerDriver, isRefused, type DeskContext } from "@molis-ai/molis-work-app-local-host";
import { desktopState, observeSurface, performSurface, surfaceContext } from "./fixtures/surface-target.js";

const TEST_CONTEXT = surfaceContext("s");

type Call = { op: string; payload?: Record<string, unknown> };
type Step = { kind?: string; summary?: string };
type Node = { role: string; name: string; depth: number; frame: [number, number, number, number] };

const MOLIS_WINDOW = "确认 · Molis Work";
const PATHOLOGICAL = "(a+)+$";
/** Exponential for a backtracking engine: every split of the run of `a`s is tried before the `!` fails the anchor. */
const LONG_NAME = `${"a".repeat(40)}!`;
/** The 600 nodes the driver reads at most, each a clickable button whose name a backtracking pattern would choke on. */
const crowded: Node[] = Array.from({ length: 600 }, (_, index) => ({ role: "AXButton", name: LONG_NAME, depth: 0, frame: [index, 10, 1, 1] }));

function ownWindowDesk(calls: Call[], steps: Step[]): DeskContext {
  const frame: [number, number, number, number] = [0, 0, 120, 80];
  const state = desktopState({
    bundle_id: "com.apple.TextEdit", name: "TextEdit", pid: 4, active: true, hidden: false, front_pid: 4,
    window: { title: "Notes", frame, window_id: 1, document: "" },
    windows: ["Notes", "Ideas", MOLIS_WINDOW].map(title => ({ title, frame, focused: title === "Notes", minimized: false })),
  });
  const target = { bundle_id: state.bundle_id, name: state.name, pid: state.pid, verdict: { tier: "ask" as const, reason: "", built_in: true } };
  return {
    helper: {
      async call<T>(op: string, payload?: Record<string, unknown>, _timeout?: number, beforeSend?: () => void, onDispatch?: () => void): Promise<T> {
        beforeSend?.();
        onDispatch?.();
        calls.push({ op, ...(payload ? { payload } : {}) });
        if (op === "app.state" || op === "app.open") return state as T;
        if (op === "apps.installed" || op === "apps.running") return { apps: [{ bundle_id: state.bundle_id, name: state.name }] } as T;
        if (op === "observe.screenshot") return { png: Buffer.from("png").toString("base64"), included_pids: [4], password_fields: 0, masked: 0 } as T;
        if (op === "observe.tree") {
          return { window: { title: "Notes", frame }, nodes: [{ role: "AXButton", name: "保存", depth: 0, frame: [10, 10, 40, 20] }], truncated: false, menus: ["文件", "窗口", "帮助"] } as T;
        }
        if (op === "observe.menus") return { items: [{ title: "Notes" }, { title: "Ideas" }, { title: "Minimize" }, { title: MOLIS_WINDOW }] } as T;
        if (op === "probe.point") return { window: { id: 1, pid: 4, title: "Notes" }, element: { pid: 4, name: "保存", window_title: "Notes" } } as T;
        if (op.startsWith("input.")) return { done: true } as T;
        throw new Error(op);
      },
    },
    settings: { forbiddenIds: () => [] },
    noteInjected: () => undefined,
    target: () => target,
    setTarget: () => undefined,
    takeovers: () => 0,
    assertCurrent: () => undefined,
    assertReady: () => undefined,
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

function selectorDesk(nodes: Node[], calls: Call[]): DeskContext {
  const state = desktopState({
    bundle_id: "com.apple.TextEdit", name: "TextEdit", pid: 4, active: true, hidden: false, front_pid: 4,
    window: { title: "Notes", frame: [0, 0, 800, 600], window_id: 1, document: "" },
  });
  const target = { bundle_id: state.bundle_id, name: state.name, pid: state.pid, verdict: { tier: "ask" as const, reason: "", built_in: true } };
  return {
    helper: {
      async call<T>(op: string, payload?: Record<string, unknown>, _timeout?: number, beforeSend?: () => void, onDispatch?: () => void): Promise<T> {
        beforeSend?.();
        onDispatch?.();
        calls.push({ op, payload });
        if (op === "app.state" || op === "app.open") return state as T;
        if (op === "apps.installed" || op === "apps.running") return { apps: [{ bundle_id: state.bundle_id, name: state.name }] } as T;
        if (op === "observe.screenshot") return { png: Buffer.from("target-window").toString("base64"), included_pids: [4], password_fields: 0, masked: 0 } as T;
        if (op === "observe.tree") return { window: { title: "Notes", frame: state.window.frame }, nodes, truncated: false, menus: [] } as T;
        if (op === "probe.point") return { window: { id: 1, pid: 4, title: "Notes" }, element: { pid: 4, name: "Save As…", window_title: "Notes" } } as T;
        if (op.startsWith("input.")) return { done: true } as T;
        throw new Error(op);
      },
    },
    settings: { forbiddenIds: () => [] },
    noteInjected: () => undefined,
    target: () => target,
    setTarget: () => undefined,
    takeovers: () => 0,
    assertCurrent: () => undefined,
    assertReady: () => undefined,
    ready: async () => undefined,
    readiness: async () => null,
    mark: () => undefined,
    activity: () => null,
    recordStep: () => undefined,
    emitFrame: () => undefined,
    rememberProduced: () => undefined,
    masked: () => false,
    pauseForPerson: () => undefined,
    pendingPersonMove: () => false,
    changed: () => undefined,
    describeRound: () => undefined,
    noteRun: () => undefined,
    release: () => undefined,
  };
}

const click = (node: string): HostSurfaceAction => ({ what: "pointer", x: 1, y: 1, button: "left", clicks: 1, node });

function acted(context: DeskContext, action: HostSurfaceAction): Promise<HostSurfaceActReceipt> {
  return performSurface(new ComputerDriver(context).surface(), action, TEST_CONTEXT) as Promise<HostSurfaceActReceipt>;
}

/** Every pattern source compiled through the RegExp constructor while `run` is pending; the model's text is refused outright. */
async function compiledDuring(run: () => Promise<unknown>): Promise<string[]> {
  const original = globalThis.RegExp;
  const sources: string[] = [];
  const watch = (args: unknown[]): void => {
    const source = String(args[0] instanceof original ? args[0].source : args[0]);
    sources.push(source);
    if (source.includes(PATHOLOGICAL)) throw new Error("the model's selector was compiled into a RegExp");
  };
  globalThis.RegExp = new Proxy(original, {
    construct(target, args, newTarget) {
      watch(args);
      return Reflect.construct(target, args, newTarget);
    },
    apply(target, thisArg, args) {
      watch(args);
      return Reflect.apply(target, thisArg, args);
    },
  });
  try {
    await run();
  } finally {
    globalThis.RegExp = original;
  }
  return sources;
}

test("S-25 a menu path to a window that shows Molis Work is refused before it is injected, and no look offers that window", async () => {
  const calls: Call[] = [];
  const steps: Step[] = [];
  const surface = new ComputerDriver(ownWindowDesk(calls, steps)).surface();
  const tree = new TextDecoder().decode(await observeSurface(surface, "accessibility-tree", TEST_CONTEXT));
  assert.match(tree, /Ideas/, "the Window menu hint still lists the app's other windows");
  assert.doesNotMatch(tree, /Molis Work/, "the Window menu hint does not offer a window that shows Molis Work");
  const metadata = JSON.parse(new TextDecoder().decode(await observeSurface(surface, "window-metadata", TEST_CONTEXT))) as { windows: { title: string }[] };
  assert.equal(metadata.windows.some(one => one.title.includes("Molis Work")), false, "window-metadata does not list it either");

  const injectedBefore = calls.filter(call => call.op.startsWith("input.")).length;
  await assert.rejects(() => performSurface(surface, { what: "menu", path: ["窗口", MOLIS_WINDOW] }, TEST_CONTEXT),
    (error: unknown) => isRefused(error) && /Molis Work/.test(error.message));
  assert.equal(calls.filter(call => call.op.startsWith("input.")).length, injectedBefore, "nothing reaches the input helper");
  assert.equal(steps.at(-1)?.kind, "refused");
  assert.match(steps.at(-1)?.summary ?? "", /Molis Work/);
});

test("S-25 a model-supplied node selector is never compiled into a RegExp: /(a+)+$/ over 600 long names is refused at once", async () => {
  for (const node of [`/${PATHOLOGICAL}/`, `~${PATHOLOGICAL}`]) {
    const calls: Call[] = [];
    const started = performance.now();
    const sources = await compiledDuring(() => assert.rejects(() => acted(selectorDesk(crowded, calls), click(node)), /没有「.+」这个可点的控件/u));
    const elapsed = performance.now() - started;
    assert.equal(sources.some(source => source.includes(PATHOLOGICAL)), false, node);
    assert.ok(elapsed < 2_000, `${node} took ${Math.round(elapsed)} ms`);
    assert.equal(calls.some(call => call.op.startsWith("input.")), false, `${node} was not clicked`);
  }
});

test("S-25 `~text` matches a part of the name case-insensitively, and the tree the model reads offers no regular expression", async () => {
  const nodes: Node[] = [
    { role: "AXButton", name: "Save As…", depth: 0, frame: [10, 10, 40, 20] },
    { role: "AXButton", name: "Open", depth: 0, frame: [60, 10, 40, 20] },
  ];
  const calls: Call[] = [];
  const receipt = await acted(selectorDesk(nodes, calls), click("~save as"));
  assert.deepEqual(calls.find(call => call.op === "input.pointer")?.payload?.point, [30, 20]);
  assert.match(receipt.tree, /~/u);
  assert.doesNotMatch(receipt.tree, /正则|\/[^/\s]+\//u);

  await assert.rejects(() => acted(selectorDesk(nodes, []), click("~")), /「~」后面要写名称里的一段文字/u);
  await assert.rejects(() => acted(selectorDesk(nodes, []), click("/Save|Open/")), /没有「\/Save\|Open\/」这个可点的控件/u);
});
