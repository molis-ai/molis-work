// Security invariant S-25 (docs/system/SECURITY-INVARIANTS.md): the node a desktop pointer names comes from the model,
// and window or page text can steer the model, so the selector is never compiled into a pattern. A backtracking pattern
// such as `/(a+)+$/` over a long name would otherwise hold the Host's event loop while it scans the whole tree. The
// shipped driver runs here on a fake helper (no macOS needed). Public entries only (tests may not reach into package
// sources: pnpm health:check).
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";
import type { HostSurfaceActReceipt, HostSurfaceAction } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { ComputerDriver, type DeskContext } from "@molis-ai/molis-work-app-local-host";

type Call = { op: string; payload?: Record<string, unknown> };
type Node = { role: string; name: string; depth: number; frame: [number, number, number, number] };

const PATHOLOGICAL = "(a+)+$";
/** Exponential for a backtracking engine: every split of the run of `a`s is tried before the `!` fails the anchor. */
const LONG_NAME = `${"a".repeat(40)}!`;

/** The 600 nodes the driver reads at most, each a clickable button whose name a backtracking pattern would choke on. */
const crowded: Node[] = Array.from({ length: 600 }, (_, index) => ({ role: "AXButton", name: LONG_NAME, depth: 0, frame: [index, 10, 1, 1] }));

function desk(nodes: Node[], calls: Call[]): DeskContext {
  const state = { bundle_id: "com.apple.TextEdit", name: "TextEdit", pid: 4, active: true, hidden: false, front_pid: 4,
    window: { title: "Notes", frame: [0, 0, 800, 600], window_id: 1, document: "" } };
  return {
    helper: { async call<T>(op: string, payload?: Record<string, unknown>): Promise<T> {
      calls.push({ op, payload });
      if (op === "app.state" || op === "app.open") return state as T;
      if (op === "apps.installed" || op === "apps.running") return { apps: [{ bundle_id: state.bundle_id, name: state.name }] } as T;
      if (op === "observe.screenshot") return { png: Buffer.from("target-window").toString("base64"), included_pids: [4], password_fields: 0, masked: 0 } as T;
      if (op === "observe.tree") return { window: { title: "Notes", frame: state.window.frame }, nodes, truncated: false, menus: [] } as T;
      if (op === "probe.point") return { window: { pid: 4, title: "Notes" }, element: { pid: 4, name: "Save As…", window_title: "Notes" } } as T;
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
  return new ComputerDriver(context).surface().perform(action, { session_id: "s" }) as Promise<HostSurfaceActReceipt>;
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
    construct(target, args, newTarget) { watch(args); return Reflect.construct(target, args, newTarget); },
    apply(target, thisArg, args) { watch(args); return Reflect.apply(target, thisArg, args); },
  });
  try { await run(); }
  finally { globalThis.RegExp = original; }
  return sources;
}

test("S-25 a model-supplied node selector is never compiled into a RegExp: /(a+)+$/ over 600 long names is refused at once", async () => {
  for (const node of [`/${PATHOLOGICAL}/`, `~${PATHOLOGICAL}`]) {
    const calls: Call[] = [];
    const started = performance.now();
    const sources = await compiledDuring(() => assert.rejects(() => acted(desk(crowded, calls), click(node)), /没有「.+」这个可点的控件/u));
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
  const receipt = await acted(desk(nodes, calls), click("~save as"));
  assert.deepEqual(calls.find(call => call.op === "input.pointer")?.payload?.point, [30, 20]);
  assert.match(receipt.tree, /~/u);
  assert.doesNotMatch(receipt.tree, /正则|\/[^/\s]+\//u);

  await assert.rejects(() => acted(desk(nodes, []), click("~")), /「~」后面要写名称里的一段文字/u);
  await assert.rejects(() => acted(desk(nodes, []), click("/Save|Open/")), /没有「\/Save\|Open\/」这个可点的控件/u);
});
