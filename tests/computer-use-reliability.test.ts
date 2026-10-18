import assert from "node:assert/strict";
import test from "node:test";
import type { HostSurfaceActReceipt, HostSurfaceAction } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { ComputerDriver, type DeskContext } from "@molis-ai/molis-work-app-local-host";

type Node = { role: string; name: string; depth: number; frame: [number, number, number, number] };
type Step = { kind?: string; summary?: string };

const button: Node = { role: "AXButton", name: "保存", depth: 0, frame: [10, 10, 40, 20] };
const saved: Node = { ...button, name: "已保存" };

function desk(options: { trees?: Node[][]; steps?: Step[] } = {}): DeskContext {
  const state = { bundle_id: "com.apple.TextEdit", name: "TextEdit", pid: 4, active: true, hidden: false, front_pid: 4,
    window: { title: "Notes", frame: [0, 0, 120, 80] as [number, number, number, number], window_id: 1, document: "" } };
  const trees = [...(options.trees ?? [[button]])];
  return {
    helper: { async call<T>(op: string): Promise<T> {
      if (op === "app.state" || op === "app.open") return state as T;
      if (op === "apps.installed" || op === "apps.running") return { apps: [{ bundle_id: state.bundle_id, name: state.name }] } as T;
      if (op === "observe.screenshot") return { png: Buffer.from("png").toString("base64"), included_pids: [4], password_fields: 0, masked: 0 } as T;
      if (op === "observe.tree") {
        const nodes = trees.length > 1 ? trees.shift()! : trees[0]!;
        return { window: { title: "Notes", frame: state.window.frame }, nodes, truncated: false, menus: [] } as T;
      }
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
    recordStep: step => { options.steps?.push(step); },
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

const click = (): HostSurfaceAction => ({ what: "pointer", x: 1, y: 1, button: "left", clicks: 1 });

function acted(driver: ComputerDriver, action: HostSurfaceAction = click()): Promise<HostSurfaceActReceipt> {
  return driver.surface().perform(action, { session_id: "s" }) as Promise<HostSurfaceActReceipt>;
}

test("CU-G07: a step that leaves the tree unchanged says so, and the fourth identical click is refused", async () => {
  const steps: Step[] = [];
  const driver = new ComputerDriver(desk({ steps }));
  await driver.surface().observe("accessibility-tree", { session_id: "s" });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const receipt = await acted(driver);
    assert.match(receipt.tree, /没有变化/, `attempt ${attempt} should say the tree did not change`);
  }
  await assert.rejects(() => acted(driver), /3 次/);
  assert.equal(steps.filter(step => step.kind === "failed").length, 1);
});

test("CU-G07: a changed tree resets the count, so a later unchanged click is not called stuck", async () => {
  const driver = new ComputerDriver(desk({ trees: [[button], [saved], [saved]] }));
  await driver.surface().observe("accessibility-tree", { session_id: "s" });
  const changed = await acted(driver);
  assert.doesNotMatch(changed.tree, /没有变化/);
  const unchanged = await acted(driver);
  assert.match(unchanged.tree, /没有变化/);
});

test("CU-G07: a key that changes nothing is reported, not refused as stuck", async () => {
  const steps: Step[] = [];
  const driver = new ComputerDriver(desk({ steps }));
  await driver.surface().observe("accessibility-tree", { session_id: "s" });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await driver.surface().perform({ what: "key", keys: ["cmd", "s"] }, { session_id: "s" });
  }
  assert.equal(steps.filter(step => step.kind === "failed").length, 0);
});

test("CU-G07: alternating actions do not count as the same stuck action", async () => {
  const driver = new ComputerDriver(desk());
  await driver.surface().observe("accessibility-tree", { session_id: "s" });
  await acted(driver);
  await driver.surface().perform({ what: "scroll", x: 1, y: 1, dx: 0, dy: 10 }, { session_id: "s" });
  await acted(driver);
  await acted(driver);
  await acted(driver);
});
