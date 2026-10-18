import assert from "node:assert/strict";
import test from "node:test";
import type { HostSurfaceActReceipt, HostSurfaceAction } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import {
  ComputerDriver,
  desktopTaskComplete,
  isRefused,
  type DeskContext,
  type DesktopTaskFacts,
  type DesktopTaskWanted,
} from "@molis-ai/molis-work-app-local-host";

/**
 * CU-G12: ten deterministic desktop scenarios over the real driver with a fake helper. It measures what the line can
 * check without a person at the Mac: success, steps, observation/receipt text (as a token estimate), refusals and
 * time. Real-machine scenarios are listed separately and are not claimed here (specs/computer-use §9).
 */

type Node = { role: string; name: string; depth: number; frame: [number, number, number, number]; secure?: boolean; subrole?: string };
type OcrLine = { text: string; x: number; y: number; width: number; height: number };
type Tree = { nodes: Node[]; menus?: string[] };
type Mutable = { title: string; files: string[]; records: string[]; takeovers: number };
type Action = HostSurfaceAction | { what: "observe" };
type Scenario = {
  readonly name: string;
  readonly app: { bundle_id: string; name: string };
  readonly title: string;
  readonly trees: Tree[];
  readonly actions: Action[];
  readonly wanted?: DesktopTaskWanted;
  readonly expectRefusal?: boolean;
  readonly windows?: string[];
  readonly menus?: string[];
  readonly windowMenuItems?: { title: string; enabled?: boolean }[];
  readonly ocrLines?: OcrLine[];
  readonly field?: { name: string; secure: boolean };
  readonly shot?: Record<string, unknown>;
  readonly onAction?: (action: HostSurfaceAction, state: Mutable) => void;
  readonly facts?: (state: Mutable) => DesktopTaskFacts;
};
type Row = { name: string; success: boolean; steps: number; ms: number; tokens: number; refusals: number; failed: number; takeovers: number; real: false; complete: boolean | null; reason: string };

const frame: [number, number, number, number] = [0, 0, 120, 80];
const button: Node = { role: "AXButton", name: "按钮", depth: 0, frame: [10, 10, 40, 20] };
const staticText = (name: string): Node => ({ role: "AXStaticText", name, depth: 0, frame: [0, 0, 120, 80] });
const click = (): Action => ({ what: "pointer", x: 20, y: 20, button: "left", clicks: 1 });
const observe: Action = { what: "observe" };

function harness(scenario: Scenario): { desk: DeskContext; state: Mutable } {
  const state: Mutable = { title: scenario.title, files: [], records: [], takeovers: 0 };
  const trees = [...scenario.trees];
  const nextTree = () => trees.length > 1 ? trees.shift()! : trees[0]!;
  const appState = () => ({
    bundle_id: scenario.app.bundle_id, name: scenario.app.name, pid: 4, active: true, hidden: false, front_pid: 4,
    window: { title: state.title, frame, window_id: 1, document: "" },
    windows: (scenario.windows ?? [state.title]).map(title => ({ title, frame, focused: title === state.title, minimized: false })),
  });
  const desk: DeskContext = {
    helper: { async call<T>(op: string): Promise<T> {
      if (op === "app.state" || op === "app.open") return appState() as T;
      if (op === "apps.installed" || op === "apps.running") return { apps: [{ bundle_id: scenario.app.bundle_id, name: scenario.app.name }] } as T;
      if (op === "observe.tree") {
        const tree = nextTree();
        return { window: { title: state.title, frame }, nodes: tree.nodes, truncated: false, menus: tree.menus ?? scenario.menus ?? [] } as T;
      }
      if (op === "observe.ocr") return { lines: scenario.ocrLines ?? [] } as T;
      if (op === "observe.menus") return { items: scenario.windowMenuItems ?? [] } as T;
      if (op === "observe.screenshot") return (scenario.shot ?? { png: Buffer.from("png").toString("base64"), included_pids: [4], password_fields: 0, masked: 0 }) as T;
      if (op === "probe.point") return { window: { pid: 4, title: state.title }, element: { pid: 4, name: "按钮", window_title: state.title } } as T;
      if (op === "focused.field") return (scenario.field ?? { name: "", secure: false }) as T;
      if (op.startsWith("input.")) return {} as T;
      throw new Error(op);
    } },
    settings: { forbiddenIds: () => [] },
    noteInjected: () => undefined,
    target: () => ({ bundle_id: scenario.app.bundle_id, name: scenario.app.name, pid: 4, verdict: { tier: "ask", reason: "", built_in: true } }),
    setTarget: () => undefined,
    takeovers: () => state.takeovers,
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
  return { desk, state };
}

async function run(scenario: Scenario): Promise<Row> {
  const started = Date.now();
  const { desk, state } = harness(scenario);
  const driver = new ComputerDriver(desk);
  let steps = 0, tokens = 0, refusals = 0, failed = 0;
  try {
    for (const action of scenario.actions) {
      if (action.what === "observe") {
        steps += 1;
        const text = new TextDecoder().decode(await driver.surface().observe("accessibility-tree", { session_id: "s" }));
        tokens += Math.ceil(text.length / 4);
        continue;
      }
      steps += 1;
      const receipt = await driver.surface().perform(action, { session_id: "s" }) as HostSurfaceActReceipt | void;
      if (receipt) tokens += Math.ceil(receipt.tree.length / 4);
      scenario.onAction?.(action, state);
    }
  } catch (error) {
    if (isRefused(error)) refusals += 1;
    else failed += 1;
  }
  const facts = scenario.facts?.(state) ?? { windowTitle: state.title, files: state.files, record: state.records };
  const judged = scenario.wanted ? desktopTaskComplete(scenario.wanted, facts, true) : null;
  const success = scenario.expectRefusal
    ? refusals > 0 && failed === 0
    : failed === 0 && refusals === 0 && (judged ? judged.complete : true);
  return { name: scenario.name, success, steps, ms: Date.now() - started, tokens, refusals, failed, takeovers: state.takeovers, real: false,
    complete: judged?.complete ?? null, reason: scenario.expectRefusal ? "按预期被拒" : judged?.reason ?? "" };
}

const textEdit = { bundle_id: "com.apple.TextEdit", name: "TextEdit" };
const scenarios: Scenario[] = [
  {
    name: "TextEdit 写入并保存",
    app: textEdit, title: "Notes",
    trees: [{ nodes: [staticText("文档")] }, { nodes: [button] }, { nodes: [{ role: "AXTextArea", name: "正文", depth: 0, frame: [0, 0, 120, 80] }] }, { nodes: [{ ...button, name: "已保存" }] }, { nodes: [{ ...button, name: "已保存" }] }],
    actions: [observe, click(), { what: "text", text: "hello" }, { what: "key", keys: ["cmd", "s"] }, observe],
    wanted: { windowTitle: "Notes", file: "notes.txt" },
    onAction: (action, state) => { if (action.what === "key" && action.keys.includes("s")) state.files.push("notes.txt"); },
  },
  {
    name: "计算器用 OCR 读出结果",
    app: { bundle_id: "com.apple.calculator", name: "Calculator" }, title: "Calculator",
    trees: [{ nodes: [staticText("0")] }, { nodes: [staticText("391")] }, { nodes: [staticText("391")] }],
    ocrLines: [{ text: "17×23", x: 0, y: 0, width: 40, height: 10 }, { text: "391", x: 0, y: 12, width: 40, height: 10 }],
    actions: [observe, click(), observe],
    wanted: { windowTitle: "Calculator" },
  },
  {
    name: "Mail 添加附件（sheet）",
    app: { bundle_id: "com.apple.mail", name: "Mail" }, title: "New Message",
    trees: [{ nodes: [{ role: "AXSheet", name: "附件", depth: 0, frame: [0, 0, 100, 40] }] }, { nodes: [{ role: "AXSheet", name: "附件", depth: 0, frame: [0, 0, 100, 40] }] }, { nodes: [{ role: "AXSheet", name: "附件", depth: 0, frame: [0, 0, 100, 40] }] }],
    actions: [observe, { what: "menu", path: ["文件", "添加附件…"] }, observe],
    wanted: { windowTitle: "New Message" },
    onAction: (action, state) => { if (action.what === "menu" && action.path.includes("添加附件…")) state.records.push("附件"); },
  },
  {
    name: "Excel 导出 PDF",
    app: { bundle_id: "com.microsoft.Excel", name: "Excel" }, title: "Book1",
    trees: [{ nodes: [button] }, { nodes: [button] }, { nodes: [button] }],
    actions: [observe, { what: "menu", path: ["文件", "导出…"] }, observe],
    wanted: { file: "report.pdf" },
    onAction: (action, state) => { if (action.what === "menu" && action.path.includes("导出…")) state.files.push("report.pdf"); },
  },
  {
    name: "Finder 用窗口菜单切到另一个窗口",
    app: { bundle_id: "com.apple.finder", name: "Finder" }, title: "Downloads",
    windows: ["Downloads", "Desktop"], menus: ["文件", "窗口"], windowMenuItems: [{ title: "Downloads" }, { title: "Desktop" }],
    trees: [{ nodes: [button] }, { nodes: [button] }, { nodes: [button] }],
    actions: [observe, { what: "menu", path: ["窗口", "Desktop"] }, observe],
    wanted: { windowTitle: "Desktop" },
    onAction: (action, state) => { if (action.what === "menu" && action.path.at(-1) === "Desktop") state.title = "Desktop"; },
  },
  {
    name: "Electron 稀疏树走 OCR",
    app: { bundle_id: "com.todesktop.230313mzl4w4u92", name: "Electron" }, title: "Workspace",
    trees: [{ nodes: [staticText("canvas")] }, { nodes: [staticText("canvas")] }],
    ocrLines: [{ text: "Run", x: 10, y: 10, width: 20, height: 10 }],
    actions: [observe, click(), observe],
    wanted: { windowTitle: "Workspace" },
  },
  {
    name: "画布应用走 OCR",
    app: { bundle_id: "com.apple.Preview", name: "Preview" }, title: "image.png",
    trees: [{ nodes: [staticText("canvas")] }, { nodes: [staticText("canvas")] }],
    ocrLines: [{ text: "Zoom In", x: 10, y: 10, width: 20, height: 10 }],
    actions: [observe, click(), observe],
    wanted: { windowTitle: "image.png" },
  },
  {
    name: "终端只能看和点",
    app: { bundle_id: "com.apple.Terminal", name: "Terminal" }, title: "bash",
    trees: [{ nodes: [button] }],
    actions: [observe, { what: "text", text: "echo hi" }],
    expectRefusal: true,
  },
  {
    name: "系统设置是禁区",
    app: { bundle_id: "com.apple.systempreferences", name: "系统设置" }, title: "Privacy",
    trees: [{ nodes: [button] }],
    actions: [{ what: "app", app: "com.apple.systempreferences" }],
    expectRefusal: true,
  },
  {
    name: "密码框不输入",
    app: textEdit, title: "Login",
    trees: [{ nodes: [{ role: "AXTextField", subrole: "AXSecureTextField", name: "密码", secure: true, depth: 0, frame: [0, 0, 100, 20] }] }],
    actions: [observe, { what: "text", text: "secret" }],
    field: { name: "密码", secure: true },
    expectRefusal: true,
  },
];

test("CU-G12: ten desktop scenarios and their metrics", async t => {
  const rows: Row[] = [];
  for (const scenario of scenarios) {
    const row = await run(scenario);
    rows.push(row);
    assert.equal(row.success, true, `${scenario.name}: ${row.reason}`);
  }
  const summary = {
    scenarios: rows.length,
    success: rows.filter(row => row.success).length,
    steps: rows.reduce((total, row) => total + row.steps, 0),
    ms: rows.reduce((total, row) => total + row.ms, 0),
    tokens: rows.reduce((total, row) => total + row.tokens, 0),
    refusals: rows.reduce((total, row) => total + row.refusals, 0),
    failed: rows.reduce((total, row) => total + row.failed, 0),
    takeovers: rows.reduce((total, row) => total + row.takeovers, 0),
    refusalRate: 0,
    real: 0,
    realPending: ["twenty-step walk", "Shelf with screenshot", "five refusal records"],
    rows,
  };
  summary.refusalRate = summary.steps > 0 ? summary.refusals / summary.steps : 0;
  t.diagnostic(JSON.stringify(summary, null, 2));
  assert.equal(rows.length, scenarios.length);
  assert.equal(summary.success, scenarios.length);
  assert.equal(summary.real, 0);
  assert.equal(summary.realPending.length, 3);
});
