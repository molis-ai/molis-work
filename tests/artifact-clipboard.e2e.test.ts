import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { WebSocket } from "ws";
import { DEMO_BOARD_ID, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { insertHistoricalEvidence } from "./historical-sql-fixture.js";

// This checks the real browser clipboard, not the automation tool's virtual clipboard.
test("migrated result reference copies exact text and handles denied clipboard permission without changing facts", { timeout: 30_000 }, async (t) => {
  const chrome = [process.env.MOLIS_WORK_TEST_CHROME, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"]
    .find((path): path is string => Boolean(path && existsSync(path)));
  if (!chrome) return t.skip("Chrome is required for actual clipboard E2E");
  const directory = await mkdtemp(join(tmpdir(), "molis-work-artifact-clipboard-"));
  const databasePath = join(directory, "fixture.db");
  seedDemoBoard(databasePath);
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
  new GoalProjectApplication(store);
  const reference = "artifact://迁移结果/季度?version=1&note=原始引用";
  insertHistoricalEvidence(store.db, {
    evidence_id: "clipboard-fixture",
    board_id: DEMO_BOARD_ID,
    goal_id: "V1",
    producer_actor_id: "fixture-user",
    criterion_ids: ["V1-C1"],
    kind: "artifact",
    locator: reference,
    result: "inconclusive",
  });
  server = createMolisWorkWebServer({ databasePath, boardId: DEMO_BOARD_ID, homeDirectory: directory,
    controlToken: "artifact-clipboard-test-control-token-0123456789" });
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
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  socket.on("message", (raw) => {
    const response = JSON.parse(String(raw));
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
  async function evaluate<T = unknown>(expression: string): Promise<T> {
    const result = await command<{ result: { value: T }; exceptionDetails?: unknown }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function waitFor(expression: string): Promise<void> {
    await evaluate(`new Promise((resolve, reject) => {
      const deadline = Date.now() + 4000;
      const check = () => { if (${expression}) resolve(true); else if (Date.now() >= deadline) reject(new Error('DOM condition timeout; toast=' + document.querySelector('[data-toast]')?.textContent + '; focused=' + document.activeElement?.outerHTML.slice(0,500))); else requestAnimationFrame(check); }; check();
    })`);
  }
  async function click(selector: string): Promise<void> {
    const point = await evaluate<{ x: number; y: number }>(`(async () => { const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('Missing click target'); element.scrollIntoView({block:'center',behavior:'instant'});
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = element.getBoundingClientRect(); if (!rect.width || !rect.height) throw new Error('Hidden click target');
      const hit = document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
      if (!element.contains(hit)) throw new Error('Click target is covered');
      return {x:rect.x+rect.width/2,y:rect.y+rect.height/2}; })()`);
    await command("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 }, sessionId);
    await command("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 }, sessionId);
  }
  await command("Browser.grantPermissions", { origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await command("Page.navigate", { url: origin + "/goals/V1" }, sessionId);
  await command("Page.bringToFront", {}, sessionId);
  await waitFor("document.readyState === 'complete' && document.querySelector('[data-goal-event-document]')");
  if (await evaluate("document.querySelector('[data-frame-goal-work]')?.getBoundingClientRect().width > 0")) await click("[data-frame-goal-work]");
  const evidenceItem = await evaluate<string>(`(() => {
    const items = [...document.querySelectorAll("[data-timeline-item]")];
    const hit = items.find((item) => String(item.dataset.timelineItem || "").includes("evidence") || item.textContent.includes(${JSON.stringify(reference)}));
    return hit?.dataset.timelineItem || items[0]?.dataset.timelineItem || "";
  })()`);
  assert.ok(evidenceItem, "timeline must expose the submitted Evidence");
  await click(`[data-goal-event-document]:not([hidden]) [data-timeline-item="${evidenceItem}"]`);
  const copySelector = `[data-copy-value=${JSON.stringify(reference)}]`;
  await waitFor(`document.querySelector(${JSON.stringify(copySelector)})`);
  await click(copySelector);
  await waitFor(`document.querySelector('[data-toast]')?.textContent.includes('引用已复制')`);
  assert.equal(await evaluate("navigator.clipboard.readText()"), reference);
  // No stub replaces navigator.clipboard: reject writes using the browser's real permission boundary.
  await command("Browser.setPermission", { origin, permission: { name: "clipboard-write" }, setting: "denied" });
  await click(copySelector);
  await waitFor(`document.querySelector('[data-toast]')?.textContent.includes('无法访问剪贴板')`);
  await command("Browser.grantPermissions", { origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
  assert.equal(await evaluate("navigator.clipboard.readText()"), reference);
  const after = store.snapshot(DEMO_BOARD_ID);
  assert.deepEqual(after.goals, before.goals);
  assert.deepEqual(after.evidence, before.evidence);
  assert.deepEqual(after.runs, before.runs);
  assert.deepEqual(after.reviews, before.reviews);
});
