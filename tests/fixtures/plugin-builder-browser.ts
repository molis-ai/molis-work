import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { WebSocket } from "ws";
import type { PluginCapabilityPort } from "@molis-ai/molis-work-plugin-runtime";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";

const design = {
  id: "inventory-table", title: "库存小账本", description: "记录每件商品的数量、单价和库存价值。", journey: ["添加商品与数量", "比较库存价值", "导出 CSV 交接"], acceptance: ["库存价值等于数量乘单价", "刷新后记录仍在"],
  fields: [{ id: "name", label: "商品名称", type: "text", required: true }, { id: "quantity", label: "数量", type: "number", required: true }, { id: "price", label: "单价", type: "number", required: true }],
  calculations: [{ id: "value", label: "库存价值", expression: { op: "multiply", left: { op: "field", id: "quantity" }, right: { op: "field", id: "price" } } }],
  layout: "table", allowImport: true, allowExport: true,
};
const outputs: Record<string, string> = {
  design: JSON.stringify({ summary: "按你的库存场景整理了两种方式。表格方便比较，卡片方便逐项查看。", candidates: [
    { ...design, rationale: "同时比较数量、单价和价值，方便盘点。" },
    { ...design, id: "inventory-cards", title: "库存收藏册", layout: "cards", rationale: "每件商品一张卡片，逐项查看更轻松。" },
  ] }),
  ui: JSON.stringify([
    { id: "heading", kind: "heading", label: "标题" }, { id: "form", kind: "form", label: "录入表单" },
    { id: "search", kind: "search", label: "搜索" }, { id: "collection", kind: "collection", label: "库存表格" },
    { id: "actions", kind: "actions", label: "导入导出" }, { id: "summary", kind: "summary", label: "价值汇总" },
  ]),
  behavior: JSON.stringify({ calculations: [{ id: "value", label: "库存价值", expression: { op: "multiply", left: { op: "field", id: "quantity" }, right: { op: "field", id: "price" } } }], allowImport: true, allowExport: true }),
};
/** Fixture only: these independent outputs simulate Prologue timing, never contact a model. */
export class BrowserFixtureRuntime implements PluginCapabilityPort {
  readonly starts: Array<{ runtime: string; role: string }> = [];
  private sessions = 0;
  private readonly runs = new Map<string, { role: string; reads: number; session_id: string }>();
  constructor(private readonly directory: string) {}
  async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
    const input = args as unknown as unknown[];
    if (definition.capability_id === projectSettingsCapabilities.workspaces.capability_id) return [{ workspace_id: "browser-workspace", display_name: "浏览器验证工作区", canonical_path: this.directory, realpath_verified: true }] as Output;
    if (definition.capability_id === agent.listRuntimes.capability_id) return [{ runtime_id: "prologue" }] as Output;
    if (definition.capability_id === agent.createSession.capability_id) { assert.equal(input[0], "prologue"); return { runtime_id: "prologue", session_id: `browser-session-${++this.sessions}` } as Output; }
    if (definition.capability_id === agent.startRun.capability_id) {
      const request = input[1] as { role_id: string; session: { session_id: string } };
      assert.equal(input[0], "prologue"); assert.ok(outputs[request.role_id]);
      const id = `browser-run-${this.starts.length + 1}`; this.starts.push({ runtime: String(input[0]), role: request.role_id });
      this.runs.set(id, { role: request.role_id, reads: 0, session_id: request.session.session_id });
      return { ref: { run_id: id, session_id: request.session.session_id } } as Output;
    }
    if (definition.capability_id === agent.readRun.capability_id) {
      const ref = input[1] as { run_id: string; session_id: string }, run = this.runs.get(ref.run_id); assert.ok(run);
      run.reads += 1;
      const completed = run.role !== "behavior" || run.reads >= 5;
      return { ref, phase: completed ? "completed" : "running", turns: completed ? [{ kind: "assistant", text: outputs[run.role] }] : [] } as Output;
    }
    if (definition.capability_id === agent.controlRun.capability_id) return undefined as Output;
    throw new Error(`Unexpected browser fixture capability: ${definition.capability_id}`);
  }
}

export class ChromeHarness {
  private next = 0;
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  private readonly events = new Map<string, Array<(params: Record<string, unknown>) => void>>();
  private constructor(private readonly child: ChildProcess, private readonly socket: WebSocket) {
    socket.on("message", raw => {
      const result = JSON.parse(String(raw));
      if (result.method) { for (const listener of this.events.get(result.method) ?? []) listener(result.params); return; }
      const pending = this.pending.get(result.id); if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(result.id);
      if (result.error) pending.reject(new Error(JSON.stringify(result.error))); else pending.resolve(result.result);
    });
  }
  static async start(directory: string) {
    const chrome = [process.env.MOLIS_WORK_TEST_CHROME, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((path): path is string => Boolean(path && existsSync(path)));
    if (!chrome) return null;
    const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--disable-background-networking", "--disable-component-update", "--disable-extensions", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${join(directory, "chrome")}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
    const url = await new Promise<string>((resolve, reject) => {
      let stderr = ""; const timer = setTimeout(() => reject(new Error("Chrome debugger startup timed out")), 8000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.stderr!.on("data", chunk => { stderr += String(chunk); const url = /DevTools listening on (ws:\/\/\S+)/.exec(stderr)?.[1]; if (url) { clearTimeout(timer); resolve(url); } });
      child.once("exit", () => { clearTimeout(timer); reject(new Error(stderr.slice(-700))); });
    });
    const socket = new WebSocket(url); await once(socket, "open"); return new ChromeHarness(child, socket);
  }
  command<T = unknown>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> {
    const id = ++this.next;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
      this.pending.set(id, { resolve: value => resolve(value as T), reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  event(method: string, predicate: (params: Record<string, unknown>) => boolean = () => true): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const listeners = this.events.get(method) ?? []; this.events.set(method, listeners);
      const timer = setTimeout(() => { listeners.splice(listeners.indexOf(listener), 1); reject(new Error(`CDP event timeout: ${method}`)); }, 15000);
      const listener = (params: Record<string, unknown>) => { if (predicate(params)) { clearTimeout(timer); listeners.splice(listeners.indexOf(listener), 1); resolve(params); } };
      listeners.push(listener);
    });
  }
  async page(targetId?: string) {
    if (!targetId) targetId = (await this.command<{ targetId: string }>("Target.createTarget", { url: "about:blank" })).targetId;
    const { sessionId } = await this.command<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
    return new ChromePage(this, sessionId);
  }
  async close() {
    for (const pending of this.pending.values()) clearTimeout(pending.timer); this.socket.close();
    if (this.child.exitCode === null && this.child.signalCode === null) { const closed = once(this.child, "close"); this.child.kill("SIGTERM"); await closed; }
  }
}
export class ChromePage {
  constructor(private readonly browser: ChromeHarness, readonly sessionId: string) {}
  command<T = unknown>(method: string, params: Record<string, unknown> = {}) { return this.browser.command<T>(method, params, this.sessionId); }
  async evaluate<T = unknown>(expression: string): Promise<T> {
    const result = await this.command<{ result: { value: T }; exceptionDetails?: unknown }>("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails)); return result.result.value;
  }
  async wait(expression: string) {
    await this.evaluate(`new Promise((resolve,reject)=>{const until=Date.now()+14000;function check(){if(${expression})return resolve(true);if(Date.now()>until)return reject(new Error('DOM timeout: '+${JSON.stringify(expression)}+'; error='+document.querySelector('[data-pb-error]')?.textContent+'; status='+document.querySelector('[data-pb-status]')?.textContent));setTimeout(check,40)}check()})`);
  }
  async click(selector: string) {
    const point = await this.evaluate<{ x: number; y: number }>(`(async()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const b=e.getBoundingClientRect();if(!b.width||!b.height||e.disabled)throw Error('Unavailable '+${JSON.stringify(selector)});if(!e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)))throw Error('Covered '+${JSON.stringify(selector)});return{x:b.x+b.width/2,y:b.y+b.height/2}})()`);
    await this.command("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
    await this.command("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
  }
  async fill(selector: string, text: string) {
    await this.click(selector);
    await this.command("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: process.platform === "darwin" ? 4 : 2, commands: ["selectAll"] });
    await this.command("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 0 });
    await this.command("Input.insertText", { text });
  }
  async viewport(width: number, height: number, mobile = false) {
    await this.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    await this.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  }
  async screenshot(path: string) { const result = await this.command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }); await writeFile(path, Buffer.from(result.data, "base64")); }
}
