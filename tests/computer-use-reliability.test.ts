import { desktopState, observeSurface, performSurface, surfaceContext } from "./fixtures/surface-target.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { HostSurfaceActReceipt, HostSurfaceAction } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { ComputerDriver, type DeskContext } from "@molis-ai/molis-work-app-local-host";

const TEST_CONTEXT = surfaceContext("s");

type Node = { role: string; name: string; depth: number; frame: [number, number, number, number]; secure?: boolean; subrole?: string };
type Step = { kind?: string; summary?: string };
type OcrLine = { text: string; x: number; y: number; width: number; height: number };

const button: Node = { role: "AXButton", name: "保存", depth: 0, frame: [10, 10, 40, 20] };
const saved: Node = { ...button, name: "已保存" };

type Call = { op: string; payload?: Record<string, unknown> };

function desk(options: { trees?: Node[][]; steps?: Step[]; nodes?: Node[]; windows?: string[]; menus?: string[]; windowMenuItems?: { title: string; enabled?: boolean }[]; ocrLines?: OcrLine[]; ocrFails?: boolean; calls?: Call[] } = {}): DeskContext {
  const state = desktopState({ bundle_id: "com.apple.TextEdit", name: "TextEdit", pid: 4, active: true, hidden: false, front_pid: 4,
    window: { title: "Notes", frame: [0, 0, 120, 80] as [number, number, number, number], window_id: 1, document: "" },
    windows: (options.windows ?? []).map(title => ({ title, frame: [0, 0, 120, 80] as [number, number, number, number], focused: title === "Notes", minimized: false })) });
  const trees = [...(options.trees ?? [options.nodes ?? [button]])];
  const target = { bundle_id: state.bundle_id, name: state.name, pid: state.pid, verdict: { tier: "ask" as const, reason: "", built_in: true } };
  return {
    helper: { async call<T>(op: string, payload?: Record<string, unknown>, _timeout?: number, beforeSend?: () => void, onDispatch?: () => void): Promise<T> {
      beforeSend?.(); onDispatch?.();
      options.calls?.push({ op, ...(payload ? { payload } : {}) });
      if (op === "app.state" || op === "app.open") return state as T;
      if (op === "apps.installed" || op === "apps.running") return { apps: [{ bundle_id: state.bundle_id, name: state.name }] } as T;
      if (op === "observe.screenshot") return { png: Buffer.from("png").toString("base64"), included_pids: [4], password_fields: 0, masked: 0 } as T;
      if (op === "observe.tree") {
        const nodes = trees.length > 1 ? trees.shift()! : trees[0]!;
        return { window: { title: "Notes", frame: state.window.frame }, nodes, truncated: false, menus: options.menus ?? [] } as T;
      }
      if (op === "observe.menus") return { items: options.windowMenuItems ?? [] } as T;
      if (op === "observe.ocr") {
        if (options.ocrFails) throw new Error("observe.ocr failed");
        return { lines: options.ocrLines ?? [] } as T;
      }
      if (op === "probe.point") return { window: { id: 1, pid: 4, title: "Notes" }, element: { pid: 4, name: "保存", window_title: "Notes" } } as T;
      if (op.startsWith("input.")) return { done: true } as T;
      throw new Error(op);
    } },
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
  return performSurface(driver.surface(), action, TEST_CONTEXT) as Promise<HostSurfaceActReceipt>;
}

test("CU-G07: a step that leaves the tree unchanged says so, and the fourth identical click is refused", async () => {
  const steps: Step[] = [];
  const driver = new ComputerDriver(desk({ steps }));
  await observeSurface(driver.surface(), "accessibility-tree", TEST_CONTEXT);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const receipt = await acted(driver);
    assert.match(receipt.tree, /没有变化/, `attempt ${attempt} should say the tree did not change`);
  }
  await assert.rejects(() => acted(driver), /3 次/);
  assert.equal(steps.filter(step => step.kind === "failed").length, 1);
});

test("CU-G07: a changed tree resets the count, so a later unchanged click is not called stuck", async () => {
  const driver = new ComputerDriver(desk({ trees: [[button], [saved], [saved]] }));
  await observeSurface(driver.surface(), "accessibility-tree", TEST_CONTEXT);
  const changed = await acted(driver);
  assert.doesNotMatch(changed.tree, /没有变化/);
  const unchanged = await acted(driver);
  assert.match(unchanged.tree, /没有变化/);
});

test("CU-G07: a key that changes nothing is reported, not refused as stuck", async () => {
  const steps: Step[] = [];
  const driver = new ComputerDriver(desk({ steps }));
  await observeSurface(driver.surface(), "accessibility-tree", TEST_CONTEXT);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await performSurface(driver.surface(), { what: "key", keys: ["cmd", "s"] }, TEST_CONTEXT);
  }
  assert.equal(steps.filter(step => step.kind === "failed").length, 0);
});

test("CU-G07: alternating actions do not count as the same stuck action", async () => {
  const driver = new ComputerDriver(desk());
  await observeSurface(driver.surface(), "accessibility-tree", TEST_CONTEXT);
  await acted(driver);
  await performSurface(driver.surface(), { what: "scroll", x: 1, y: 1, dx: 0, dy: 10 }, TEST_CONTEXT);
  await acted(driver);
  await acted(driver);
  await acted(driver);
});

test("CU-G09: the Window menu names the app's other windows, and the typed menu action switches", async () => {
  const calls: Call[] = [];
  const driver = new ComputerDriver(desk({
    windows: ["Notes", "Ideas"],
    menus: ["文件", "窗口", "帮助"],
    windowMenuItems: [{ title: "Notes" }, { title: "Ideas" }, { title: "Minimize" }],
    calls,
  }));
  const text = new TextDecoder().decode(await observeSurface(driver.surface(), "accessibility-tree", TEST_CONTEXT));
  assert.match(text, /「窗口」菜单列着这些窗口/);
  assert.match(text, /Notes/);
  assert.match(text, /Ideas/);
  assert.doesNotMatch(text, /Minimize/);
  const receipt = await acted(driver);
  assert.match(receipt.tree, /没有变化/, "the menu hint is not part of the tree the step compares against");
  await performSurface(driver.surface(), { what: "menu", path: ["窗口", "Ideas"] }, TEST_CONTEXT);
  assert.deepEqual(calls.find(call => call.op === "input.menu")?.payload?.path, ["窗口", "Ideas"]);
  // A window that shows Molis Work is neither offered nor reachable by menu: S-25, tests/security-invariants-computer-driver.test.ts.
});

test("CU-G09: a sheet is named in the tree, not left as its raw accessibility role", async () => {
  const driver = new ComputerDriver(desk({ nodes: [{ role: "AXSheet", name: "保存", depth: 0, frame: [0, 0, 100, 50] }] }));
  const text = new TextDecoder().decode(await observeSurface(driver.surface(), "accessibility-tree", TEST_CONTEXT));
  assert.match(text, /表单「保存」/);
});

test("CU-G10: a sparse tree gets OCR text with window-relative points", async () => {
  const calls: Call[] = [];
  const driver = new ComputerDriver(desk({
    nodes: [{ role: "AXStaticText", name: "画布", depth: 0, frame: [0, 0, 120, 80] }],
    ocrLines: [{ text: "确定", x: 10, y: 10, width: 20, height: 10 }],
    calls,
  }));
  const text = new TextDecoder().decode(await observeSurface(driver.surface(), "accessibility-tree", TEST_CONTEXT));
  assert.match(text, /屏幕文字（OCR/);
  assert.match(text, /确定 @\(20,15\)/);
  assert.equal(calls.some(call => call.op === "observe.ocr"), true);
});

test("CU-G10: a tree with enough clickable nodes does not pay for OCR", async () => {
  const calls: Call[] = [];
  const nodes = [1, 2, 3, 4].map(index => ({ ...button, name: `按钮${index}` }));
  const driver = new ComputerDriver(desk({ nodes, ocrLines: [{ text: "不该出现", x: 1, y: 1, width: 10, height: 10 }], calls }));
  const text = new TextDecoder().decode(await observeSurface(driver.surface(), "accessibility-tree", TEST_CONTEXT));
  assert.equal(calls.some(call => call.op === "observe.ocr"), false);
  assert.doesNotMatch(text, /OCR/);
});

test("CU-G10: a tree cut by the text budget also gets OCR", async () => {
  const calls: Call[] = [];
  const nodes = Array.from({ length: 10 }, (_, index) => ({ ...button, name: `按钮${index}${"x".repeat(3_000)}` }));
  const driver = new ComputerDriver(desk({ nodes, ocrLines: [{ text: "确定", x: 1, y: 1, width: 10, height: 10 }], calls }));
  const text = new TextDecoder().decode(await observeSurface(driver.surface(), "accessibility-tree", TEST_CONTEXT));
  assert.equal(calls.some(call => call.op === "observe.ocr"), true);
  assert.match(text, /屏幕文字（OCR/);
});

test("CU-G10: OCR failing leaves the accessibility look intact", async () => {
  const driver = new ComputerDriver(desk({ nodes: [{ role: "AXStaticText", name: "画布", depth: 0, frame: [0, 0, 120, 80] }], ocrFails: true }));
  const text = new TextDecoder().decode(await observeSurface(driver.surface(), "accessibility-tree", TEST_CONTEXT));
  assert.match(text, /画布/);
  assert.doesNotMatch(text, /OCR/);
});

test("CU-G10: a secure field in the tree keeps OCR from running", async () => {
  const calls: Call[] = [];
  const driver = new ComputerDriver(desk({
    nodes: [{ role: "AXTextField", subrole: "AXSecureTextField", name: "密码", depth: 0, frame: [0, 0, 100, 20], secure: true }],
    ocrLines: [{ text: "不该出现", x: 1, y: 1, width: 10, height: 10 }],
    calls,
  }));
  const text = new TextDecoder().decode(await observeSurface(driver.surface(), "accessibility-tree", TEST_CONTEXT));
  assert.doesNotMatch(text, /OCR/);
  assert.equal(calls.some(call => call.op === "observe.ocr"), false);
});

test("CU-G06: unnamed containers are left out, and node ids still point at the raw tree", async () => {
  const groups = Array.from({ length: 100 }, () => ({ role: "AXGroup", name: "", depth: 0, frame: [0, 0, 120, 80] as [number, number, number, number] }));
  const namedGroup = { role: "AXGroup", name: "工具栏", depth: 0, frame: [0, 0, 120, 20] as [number, number, number, number] };
  const secure = { role: "AXTextField", subrole: "AXSecureTextField", name: "密码", secure: true, depth: 0, frame: [0, 20, 100, 20] as [number, number, number, number] };
  const calls: Call[] = [];
  const driver = new ComputerDriver(desk({ nodes: [...groups, namedGroup, secure, button], calls }));
  const text = new TextDecoder().decode(await observeSurface(driver.surface(), "accessibility-tree", TEST_CONTEXT));
  assert.doesNotMatch(text, /组「无名称」/);
  assert.match(text, /组「工具栏」/);
  assert.match(text, /密码框「密码」/);
  assert.match(text, /\[103\] 按钮「保存」/);
  assert.ok(text.length < 1_500, `compressed tree is ${text.length} chars`);
  await performSurface(driver.surface(), { what: "pointer", node: "[103]", x: 1, y: 1, button: "left", clicks: 1 }, TEST_CONTEXT);
  assert.deepEqual(calls.find(call => call.op === "input.pointer")?.payload?.point, [30, 20]);
});

test("CU-G09: a long window title is offered in full, because the menu path matches it exactly", async () => {
  const long = `A long document name ${"x".repeat(120)}.txt`;
  const driver = new ComputerDriver(desk({ windows: ["Notes", long], menus: ["窗口"], windowMenuItems: [{ title: "Notes" }, { title: long }] }));
  const text = new TextDecoder().decode(await observeSurface(driver.surface(), "accessibility-tree", TEST_CONTEXT));
  assert.match(text, new RegExp(long.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
});
