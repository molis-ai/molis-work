import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { WebSocket } from "ws";

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
    const child = spawn(chrome, ["--headless=new", "--lang=zh-CN", "--accept-lang=zh-CN", "--disable-gpu", "--disable-background-networking", "--disable-component-update", "--disable-extensions", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${join(directory, "chrome")}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
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
