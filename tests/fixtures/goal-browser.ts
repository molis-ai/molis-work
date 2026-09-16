import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { WebSocket } from "ws";
import { DEMO_BOARD_ID, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../../apps/desktop/launchers/web/server.js";


/** One isolated project and Chrome profile; no user services or Runtime bindings. */
export async function openGoalBrowser(t: TestContext, catalogMode: boolean | "empty" | "migrated" = false, seed = seedDemoBoard) {
  const chrome = [process.env.MOLIS_WORK_TEST_CHROME, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"]
    .find((path): path is string => Boolean(path && existsSync(path)));
  if (!chrome) { t.skip("Chrome is required for Goals UI E2E"); return null; }
  const directory = await mkdtemp(join(tmpdir(), "molis-work-goals-browser-"));
  let databasePath = join(directory, "fixture.db");
  let projectId: string | null = null;
  if (catalogMode === true || catalogMode === "migrated") {
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: directory });
    try {
      if (catalogMode === "migrated") seed(databasePath);
      const project = catalogMode === "migrated"
        ? await catalog.migrateLegacyDatabase({ legacy_database_path: databasePath, display_name: "目录交互验证", actor_id: "browser-test", user_confirmed: true })
        : (await catalog.ensureDemoProject({ actor_id: "browser-test", user_confirmed: true })).project;
      databasePath = project.database_path;
      projectId = project.project_id;
    } finally { catalog.close(); }
  } else seed(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  let child: ChildProcess | undefined;
  let socket: WebSocket | undefined;
  let server: ReturnType<typeof createMolisWorkWebServer> | undefined;
  t.after(async () => {
    socket?.close();
    if (child && child.exitCode === null && child.signalCode === null) {
      const closed = once(child, "close");
      child.kill("SIGTERM");
      await closed;
    }
    if (server?.listening) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    store.close();
    await rm(directory, { recursive: true, force: true });
  });
  server = createMolisWorkWebServer({ ...(catalogMode ? {} : { databasePath, boardId: DEMO_BOARD_ID }), homeDirectory: directory,
    controlToken: "goals-risk-test-control-token-0123456789" });
  child = spawn(chrome, ["--headless=new", "--disable-gpu", "--disable-background-networking",
    "--disable-component-update", "--disable-extensions", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=0", `--user-data-dir=${join(directory, "chrome-profile")}`, "about:blank"],
  { stdio: ["ignore", "ignore", "pipe"] });
  const debuggerUrl = await new Promise<string>((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(new Error("Chrome debugger did not start")), 8_000);
    child!.once("error", (error) => { clearTimeout(timer); reject(error); });
    child!.stderr!.on("data", (chunk) => {
      stderr += String(chunk);
      const url = stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
      if (url) { clearTimeout(timer); resolve(url); }
    });
    child!.once("exit", () => { clearTimeout(timer); reject(new Error(`Chrome exited before debugger start: ${stderr.slice(-700)}`)); });
  });
  socket = new WebSocket(debuggerUrl);
  await once(socket, "open");
  let nextId = 0;
  let pageLoaded: (() => void) | undefined;
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  socket.on("message", (raw) => {
    const response = JSON.parse(String(raw));
    if (response.method === "Page.loadEventFired") pageLoaded?.();
    const entry = pending.get(response.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(response.id);
    if (response.error) entry.reject(new Error(JSON.stringify(response.error)));
    else entry.resolve(response.result);
  });
  t.after(() => { for (const entry of pending.values()) clearTimeout(entry.timer); });
  function command<T = unknown>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve: (value) => resolve(value as T), reject, timer: setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 5_000) });
      socket!.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  await (await fetch(origin + "/health")).text();
  const before = store.snapshot(DEMO_BOARD_ID);
  const { targetId } = await command<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await command<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
  await command("Page.enable", {}, sessionId);
  async function evaluate<T = unknown>(expression: string): Promise<T> {
    const result = await command<{ result: { value: T }; exceptionDetails?: unknown }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function waitFor(expression: string, timeoutMs = 4000): Promise<void> {
    await evaluate(`new Promise((resolve, reject) => {
      const deadline = Date.now() + ${timeoutMs};
      const check = () => { if (${expression}) resolve(true); else if (Date.now() >= deadline) reject(new Error('DOM condition timeout; toast=' + document.querySelector('[data-toast]')?.textContent + '; focused=' + document.activeElement?.outerHTML.slice(0,500))); else requestAnimationFrame(check); }; check();
    })`);
  }
  async function click(selector: string): Promise<void> {
    const point = await evaluate<{ x: number; y: number }>(`(async () => { const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('Missing click target'); element.scrollIntoView({block:'center',behavior:'instant'});
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = element.getBoundingClientRect(); if (!rect.width || !rect.height) throw new Error('Hidden click target: ' + ${JSON.stringify(selector)});
      const hit = document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
      if (!element.contains(hit)) throw new Error('Click target ' + ${JSON.stringify(selector)} + ' is covered by ' + hit?.outerHTML.slice(0, 400));
      return {x:rect.x+rect.width/2,y:rect.y+rect.height/2}; })()`);
    await command("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 }, sessionId);
    await command("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 }, sessionId);
  }
  async function navigate(action: () => Promise<unknown>) {
    const timeoutError = new Error("Navigation did not finish");
    let timer: ReturnType<typeof setTimeout>;
    const loaded = new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => reject(timeoutError), 10_000);
      pageLoaded = () => resolve();
    });
    try {
      await Promise.all([loaded, action()]);
    } catch (error) {
      if (error === timeoutError) {
        timeoutError.message += "; " + await evaluate("JSON.stringify({url:location.pathname,error:document.querySelector('[role=alert]:not([hidden])')?.textContent,invalid:Array.from(document.querySelectorAll(':invalid')).map(x=>x.name)})");
      }
      throw error;
    } finally {
      clearTimeout(timer!);
      pageLoaded = undefined;
    }
  }
  const reloadPage = () => navigate(() => command("Page.reload", { ignoreCache: true }, sessionId));
  return { store, origin, before, sessionId, command, evaluate, waitFor, click, reloadPage, navigate, projectId, homeDirectory: directory };
}
