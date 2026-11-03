import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { openGoalBrowser } from "./goal-browser.js";

export type AuditBrowser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;

// Hold the real response (or its actual body read), without replacing any Host route or response data.
const RESPONSE_BARRIERS = `(() => {
  const nativeFetch = window.fetch.bind(window);
  window.__auditGates = []; window.__auditHeld = []; window.__auditRequests = [];
  const held = new Map();
  const hold = gate => new Promise(resolve => { held.set(gate.id, resolve); window.__auditHeld.push(gate.id); });
  window.__auditRelease = id => { const release = held.get(id); held.delete(id); if (release) release(); return !!release; };
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const path = url.pathname + url.search, method = init.method || input.method || 'GET';
    window.__auditRequests.push({ path, method, body: typeof init.body === 'string' ? init.body : null });
    const gate = window.__auditGates.find(row => row.armed && row.method === method && path.includes(row.needle));
    if (gate) gate.armed = false;
    let response;
    try { response = await nativeFetch(input, init); }
    catch (error) { if (gate) await hold(gate); throw error; }
    if (!gate) return response;
    if (gate.mode === 'fetch') await hold(gate);
    else {
      for (const mode of gate.mode === 'body' ? ['json','text'] : [gate.mode]) {
        const read = response[mode].bind(response);
        response[mode] = async () => { const value = await read(); await hold(gate); return value; };
      }
    }
    return response;
  };
})();`;

export async function openAuditBrowser(t: TestContext): Promise<AuditBrowser | null> {
  let browser: AuditBrowser | null = null;
  browser = await openGoalBrowser(t, true, undefined, null, undefined, () => browser ? {
    workspace_id: "audit-workspace", canonical_path: join(browser.homeDirectory, "audit-workspace"), realpath_verified: true, display_name: "Audit workspace",
  } : null);
  if (!browser) return null;
  await mkdir(join(browser.homeDirectory, "audit-workspace"));
  await browser.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, browser.sessionId);
  await browser.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, browser.sessionId);
  await browser.command("Page.addScriptToEvaluateOnNewDocument", { source: RESPONSE_BARRIERS }, browser.sessionId);
  await browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + "/projects/" + browser.projectId + "/" }, browser.sessionId));
  return browser;
}

export async function armResponse(browser: AuditBrowser, id: string, needle: string, method = "GET", mode = "body"): Promise<void> {
  await browser.evaluate(`window.__auditGates.push(${JSON.stringify({ id, needle, method, mode, armed: true })})`);
}

export const waitHeld = (browser: AuditBrowser, id: string) => browser.waitFor(`window.__auditHeld.includes(${JSON.stringify(id)})`, 15_000);
export const releaseResponse = (browser: AuditBrowser, id: string) => browser.evaluate(`window.__auditRelease(${JSON.stringify(id)})`);

export async function typeField(browser: AuditBrowser, selector: string, value: string): Promise<void> {
  await browser.click(selector);
  await browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`);
  await browser.command("Input.insertText", { text: value }, browser.sessionId);
}

export async function openSideBrowser(browser: AuditBrowser, url: string): Promise<void> {
  await browser.evaluate(`document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'browser', target: { url: ${JSON.stringify(url)} }, focus: true } }))`);
  await browser.waitFor(`document.querySelector('[data-browser-address]')?.value === ${JSON.stringify(url)} && document.querySelector('[data-browser-action=stop]')?.hidden && document.querySelector('[data-browser-cover]')?.hidden && document.querySelector('[data-browser-canvas]')?.width > 0`, 15_000);
  await browser.waitFor(`(() => { const view=document.querySelector('[data-browser-view]'),canvas=document.querySelector('[data-browser-canvas]'),box=view.getBoundingClientRect(); return canvas.width===Math.max(240,Math.floor(box.width)) && canvas.height===Math.max(200,Math.floor(box.height)); })()`, 15_000);
}

export async function clickBrowserPoint(browser: AuditBrowser, x: number, y: number): Promise<void> {
  const point = await browser.evaluate<{ x: number; y: number }>(`(() => { const canvas = document.querySelector('[data-browser-canvas]'), box = canvas.getBoundingClientRect();
    return { x: box.left + ${x} * box.width / canvas.width, y: box.top + ${y} * box.height / canvas.height }; })()`);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await browser.command("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1 }, browser.sessionId);
  }
}

export async function setPickerFiles(browser: AuditBrowser, files: string[]): Promise<void> {
  const { root } = await browser.command<{ root: { nodeId: number } }>("DOM.getDocument", {}, browser.sessionId);
  const { nodeId } = await browser.command<{ nodeId: number }>("DOM.querySelector", { nodeId: root.nodeId, selector: "[data-browser-file]" }, browser.sessionId);
  assert.ok(nodeId);
  await browser.command("DOM.setFileInputFiles", { nodeId, files }, browser.sessionId);
}

export async function until<T>(read: () => T | Promise<T>, matches: (value: T) => boolean, message: string): Promise<T> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const value = await read();
    if (matches(value)) return value;
    if (Date.now() > deadline) throw new Error(message + ": " + JSON.stringify(value));
    await new Promise(resolve => setTimeout(resolve, 30));
  }
}
