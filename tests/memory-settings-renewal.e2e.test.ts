import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ChromeHarness, locateTestChrome, type ChromePage } from "@molis-ai/molis-work-test-kit/browser";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, memoryActions, type MemoryPageResponse } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { ensureSystemAgentService, MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { person } from "./fixtures/home-runtime.js";
import { openTestHome, serveTestHost } from "./fixtures/test-home.js";

/** Native date segments receive pointer/key events; no assignment to the date value. */
async function enterDeadline(page: ChromePage, selector: string, year: number) {
  await page.click(selector);
  const { root } = await page.command<{ root: { nodeId: number } }>("DOM.getDocument", { depth: 0 });
  const { nodeId } = await page.command<{ nodeId: number }>("DOM.querySelector", { nodeId: root.nodeId, selector });
  interface Node { backendNodeId: number; attributes?: string[]; children?: Node[]; shadowRoots?: Node[] }
  const { node } = await page.command<{ node: Node }>("DOM.describeNode", { nodeId, depth: -1, pierce: true });
  const nodes: Node[] = [];
  const collect = (one: Node) => { nodes.push(one); for (const child of [...one.children || [], ...one.shadowRoots || []]) collect(child); };
  collect(node);
  const field = (name: string) => nodes.find(one => one.attributes?.includes("-webkit-datetime-edit-" + name + "-field"));
  for (const [name, value] of Object.entries({ year: String(year), month: "10", day: "24", hour: field("ampm") ? "04" : "16", minute: "45", second: "30", ...(field("ampm") ? { ampm: "p" } : {}) })) {
    const segment = field(name); assert.ok(segment, `native ${name} segment`);
    const { model } = await page.command<{ model: { content: number[] } }>("DOM.getBoxModel", { backendNodeId: segment.backendNodeId });
    const [x1, y1, x2, , , y2] = model.content;
    for (const type of ["mousePressed", "mouseReleased"]) await page.command("Input.dispatchMouseEvent", { type, x: (x1! + x2!) / 2, y: (y1! + y2!) / 2, button: "left", clickCount: 1 });
    for (const key of value) {
      const numeric = /[0-9]/.test(key), code = numeric ? "Digit" + key : "KeyP", windowsVirtualKeyCode = numeric ? 48 + Number(key) : 80;
      await page.command("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode, text: key });
      await page.command("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
    }
  }
  assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).value`), `${year}-10-24T16:45:30`);
}

// MEM-08/17/28/34: nonempty production page -> native date input -> HTTP -> SDK -> complete Home close/reopen.
for (const laterEdit of [false, true]) test(laterEdit
  ? "a stale renewal retry shows the conflict and preserves a later edit after Home restart"
  : "expired disabled memory renews by an explicit date, retries the same decision and retains its state after Home restart", { timeout: 180_000 }, async t => {
  const executable = locateTestChrome(); assert.ok(executable, "Chrome is required for the real renewal journey");
  const start = Date.now(); t.mock.timers.enable({ apis: ["Date"], now: start });
  let browser: ChromeHarness | undefined, directory: string | undefined;
  t.after(async () => { await browser?.close(); if (directory) await rm(directory, { recursive: true, force: true }); });
  const env = await openTestHome(t), project = await env.createProject("明确续期验收");
  const client = bindActionClient(env.host.actionClient(project.reference), () => person(MEMORY_PERMISSIONS, project.project_id));
  const saved = (await client.invoke(memoryActions.write, { scope: "project", text: "续期保持原状态与来源", kind: "convention", expires_at: new Date(start + 1000).toISOString() })).memory!;
  const disabled = (await client.invoke(memoryActions.change, { action: "disable", memory_id: saved.memory_id, expected_version: saved.version })).memory!;
  t.mock.timers.setTime(start + 2000);
  const original = MemoryService.prototype.change; let loseReply = true;
  t.mock.method(MemoryService.prototype, "change", async function(this: MemoryService, ...args: Parameters<MemoryService["change"]>) {
    const result = await original.apply(this, args);
    if (args[1].action === "renew" && loseReply) { loseReply = false; throw new Error("Committed renewal response unavailable"); }
    return result;
  });
  directory = await mkdtemp(join(tmpdir(), "memory-renewal-browser-")); browser = await ChromeHarness.start(directory, { executable });
  const page = await browser.page(), deliveries: Array<Record<string, unknown>> = [];
  browser.on("Network.requestWillBeSent", (params, sessionId) => {
    const request = params.request as { url?: string; postData?: string };
    if (sessionId === page.sessionId && request.url?.endsWith("/api/memory/change") && request.postData) deliveries.push(JSON.parse(request.postData));
  });
  await page.command("Network.enable"); await page.viewport(1440, 1000);
  await page.command("Page.navigate", { url: env.origin + `/projects/${project.project_id}/settings/memory` });
  await page.wait("[...document.querySelectorAll('[data-memory-settings]')].some(node => node.checkVisibility())");
  await page.evaluate("[...document.querySelectorAll('[data-memory-settings]')].find(node => node.checkVisibility()).dataset.renewalTest = ''");
  const root = "[data-renewal-test]", row = `${root} [data-memory-id="${saved.memory_id}"]`;
  await page.wait(`document.querySelector('${row}') && document.querySelector('${root} [data-memory-list]')?.getAttribute('aria-busy') === 'false'`);
  assert.ok(String(await page.evaluate(`document.querySelector('${row}').textContent`)).includes("已到期"));
  await page.click(row + " summary[aria-label^=更多操作]");
  await page.evaluate(`document.querySelectorAll('${row} .memory-menu button').forEach(button => { if (button.textContent === '续期') button.dataset.renewalOpen = ''; })`);
  await page.click("[data-renewal-open]");
  const input = row + " [data-memory-renew-expiry]";
  assert.equal(await page.evaluate(`document.querySelector('${input}').value`), "", "no default expiry decision");
  await enterDeadline(page, input, new Date(start).getFullYear() + 1);
  const expiry = await page.evaluate<string>(`new Date(document.querySelector('${input}').value).toISOString()`);
  await page.click(row + " button[type=submit]"); await page.wait("document.querySelector('[data-memory-confirm-yes]')");
  await page.click("[data-memory-confirm-yes]"); await page.wait(`document.querySelector('${root} [data-memory-retry]')`);
  const renewed = (await client.invoke(memoryActions.page, { scope: "project" })).items.find(one => one.memory_id === saved.memory_id)!;
  if (laterEdit) await client.invoke(memoryActions.change, { action: "update", memory_id: saved.memory_id,
    expected_version: renewed.version, text: "另一窗口已纠正，旧续期不能覆盖" });
  const beforeRetry = (await client.invoke(memoryActions.page, { scope: "project" })).items.find(one => one.memory_id === saved.memory_id)!;
  const historyBeforeRetry = (await client.invoke(memoryActions.history, { memory_id: saved.memory_id })).revisions;
  await page.click(root + " [data-memory-retry]");
  if (laterEdit) {
    await page.wait(`document.querySelector('${root} [data-memory-error]')?.checkVisibility() && document.querySelector('${root} [data-memory-error]').textContent.includes('记忆已变化')`);
    assert.equal(await page.evaluate(`document.querySelector('${root} [data-memory-retry]')?.checkVisibility()`), true);
    await page.screenshot(join(tmpdir(), "molis-memory-renewal-conflict-20261024.png"));
  } else await page.wait(`!document.querySelector('${root} [data-memory-retry]') && document.querySelector('${root} [data-memory-list]')?.getAttribute('aria-busy') === 'false'`);
  assert.equal(deliveries.length, 2); assert.deepEqual(deliveries[0], deliveries[1]);
  assert.equal(deliveries[0]!.expected_version, disabled.version); assert.equal(deliveries[0]!.expires_at, expiry);
  const item = (await client.invoke(memoryActions.page, { scope: "project" })).items.find(one => one.memory_id === saved.memory_id)!;
  assert.deepEqual(item, beforeRetry);
  assert.equal(item.expired, false); assert.equal(item.state, "disabled"); assert.equal(item.expires_at, expiry); assert.equal(item.version, disabled.version + 1 + Number(laterEdit));
  assert.deepEqual((await client.invoke(memoryActions.history, { memory_id: saved.memory_id })).revisions, historyBeforeRetry);
  assert.equal(historyBeforeRetry.length, 2 + Number(laterEdit));
  if (!laterEdit) {
    const copy = String(await page.evaluate(`document.querySelector('${row}').textContent`)); assert.ok(copy.includes("停用")); assert.equal(copy.includes("已到期"), false);
  }
  await page.command("Page.navigate", { url: "about:blank" }); await page.wait("location.href === 'about:blank'"); await env.close(); await env.host.close();
  const reopened = new MolisWorkLocalHost({ homeDirectory: env.home, completeText: null });
  let served: Awaited<ReturnType<typeof serveTestHost>> | undefined;
  try {
    served = await serveTestHost(null, { home: env.home, host: reopened });
    const read = bindActionClient(reopened.actionClient(project.reference), () => person(MEMORY_PERMISSIONS, project.project_id));
    const after: MemoryPageResponse = await read.invoke(memoryActions.page, { scope: "project" });
    assert.deepEqual(after.items.find(one => one.memory_id === saved.memory_id), item);
    const system = ensureSystemAgentService(reopened, env.home); await system.ready;
    const raw = await system.agentHost.adapter("prologue").memory!.withCaller({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id,
      person: true, consumer: "ui", purpose: "management", current_scene: "common" }).list("project", project.project_id);
    assert.equal(raw[0]!.meta.expires_at_ms, Date.parse(expiry)); assert.ok(raw[0]!.disabled); assert.equal(raw[0]!.origin, saved.origin);
  } finally { await served?.close(); await reopened.close(); }
});
