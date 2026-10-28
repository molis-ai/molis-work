import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ChromeHarness, locateTestChrome, type ChromePage } from "@molis-ai/molis-work-test-kit/browser";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, memoryActions, type MemoryChangeRequest, type MemoryPageResponse, type MemoryHistoryResponse } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { MolisWorkLocalHost, ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { person } from "./fixtures/home-runtime.js";
import { openTestHome, serveTestHost } from "./fixtures/test-home.js";

const root = "[data-memory-classification-test]";
const row = (id: string) => `${root} [data-memory-id="${id}"]`;
const ready = (page: ChromePage) => page.wait(`document.querySelector('${root} [data-memory-list]')?.getAttribute('aria-busy') === 'false'`);
async function select(page: ChromePage, selector: string, value: string) {
  await page.wait(`document.querySelector(${JSON.stringify(selector)})?.closest('.mw-select-picker')`);
  await page.evaluate(`(() => {
    document.querySelector('[data-classification-picker]')?.removeAttribute('data-classification-picker');
    document.querySelector(${JSON.stringify(selector)}).closest('.mw-select-picker').setAttribute('data-classification-picker', '');
  })()`);
  await page.click("[data-classification-picker] .mw-select-picker__trigger");
  await page.click(`.mw-select-picker__menu:popover-open [data-value="${value}"]`);
}
async function openEditor(page: ChromePage, id: string) {
  await page.click(row(id) + " button[aria-label^=修改]");
  await page.click(row(id) + " .memory-origin summary");
}
async function save(page: ChromePage, id: string, confirms = false) {
  await page.click(row(id) + " button[type=submit]");
  if (confirms) { await page.wait("document.querySelector('[data-memory-confirm-yes]')"); await page.click("[data-memory-confirm-yes]"); }
  await page.wait(`!document.querySelector('${row(id)} textarea')`); await ready(page);
}
async function history(page: ChromePage, id: string) {
  await page.click(row(id) + " summary[aria-label^=更多操作]");
  await page.evaluate(`document.querySelectorAll('${row(id)} .memory-menu button').forEach(button => { if (button.textContent === '历史版本') button.dataset.classificationHistory = ''; })`);
  await page.click("[data-classification-history]");
  await page.wait(`document.querySelector('${row(id)} .memory-history-list')`);
}
/** Read Chrome's native date segments to click and type into them; never assign the input's value. */
async function enterDeadline(page: ChromePage, selector: string, year: number) {
  await page.click(selector);
  const { root: document } = await page.command<{ root: { nodeId: number } }>("DOM.getDocument", { depth: 0 });
  const { nodeId } = await page.command<{ nodeId: number }>("DOM.querySelector", { nodeId: document.nodeId, selector });
  interface Node { backendNodeId: number; attributes?: string[]; children?: Node[]; shadowRoots?: Node[] }
  const { node } = await page.command<{ node: Node }>("DOM.describeNode", { nodeId, depth: -1, pierce: true });
  const nodes: Node[] = [];
  const collect = (one: Node) => { nodes.push(one); for (const child of [...one.children || [], ...one.shadowRoots || []]) collect(child); };
  collect(node);
  const field = (name: string) => nodes.find(one => one.attributes?.includes("-webkit-datetime-edit-" + name + "-field"));
  const parts = { year: String(year), month: "10", day: "24", hour: field("ampm") ? "04" : "16", minute: "45", second: "30", ...(field("ampm") ? { ampm: "p" } : {}) };
  for (const [name, value] of Object.entries(parts)) {
    const segment = field(name); assert.ok(segment, `native ${name} segment is exposed: ${JSON.stringify(nodes.map(one => one.attributes))}`);
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

async function setup(t: TestContext, legacyText?: string) {
  const executable = locateTestChrome(); assert.ok(executable, "Chrome is required for the real classification journey");
  let browser: ChromeHarness | undefined, directory: string | undefined;
  // Close browser-held HTTP/WebSocket connections before the Home fixture closes its server.
  t.after(async () => { await browser?.close(); if (directory) await rm(directory, { recursive: true, force: true }); });
  const env = await openTestHome(t), project = await env.createProject("分类纠正审校");
  const request = (path: string) => fetch(env.origin + path, { headers: { origin: env.origin, "x-molis-work-control-token": env.controlToken } });
  const client = bindActionClient(env.host.actionClient(project.reference), () => person(MEMORY_PERMISSIONS, project.project_id));
  const expires = new Date(Date.now() + 86_400_000).toISOString();
  let id: string;
  if (legacyText) {
    const system = ensureSystemAgentService(env.host, env.home); await system.ready;
    const raw = system.agentHost.adapter("prologue").memory!.withCaller({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id,
      person: true, consumer: "ui", purpose: "management", current_scene: "common" });
    const old = await raw.write({ scope: "project", owner: project.project_id, operation_id: "legacy-original", text: legacyText, origin: "旧记录的原始来源",
      meta: { kind: "fact", source: "manual", classification: { scenes: ["common"], lifecycle: "short-term" }, expires_at_ms: Date.parse(expires),
        evidence: [{ kind: "observation", text: "保留原始依据" }], applies_when: { task: "交付前核对" } } });
    id = old.memory_id;
    const ledger = openMemoryLedger({ homeDirectory: env.home });
    try {
      assert.deepEqual(ledger.revisions(id), [], "the owner creates a missing legacy revision, never overwrites one");
      ledger.addRevision(id, { version: old.version, text: legacyText, kind: "fact", applies: { task: "交付前核对" }, change: "created", by: "maintenance", at: new Date().toISOString() });
    } finally { ledger.close(); }
    const current = await client.invoke(memoryActions.change, { memory_id: id, expected_version: old.version, action: "update", text: "交付前逐条核对事实与来源", kind: "convention" });
    await client.invoke(memoryActions.change, { memory_id: id, expected_version: current.memory!.version, action: "disable" });
  } else {
    const written = await client.invoke(memoryActions.write, { scope: "project", kind: "convention", text: "交付前逐条核对事实与来源", expires_at: expires });
    assert.ok(written.memory); id = written.memory.memory_id;
  }
  const requests: MemoryChangeRequest[] = [];
  const original = MemoryService.prototype.change;
  let loseReply = false;
  t.mock.method(MemoryService.prototype, "change", async function(this: MemoryService, ...args: Parameters<MemoryService["change"]>) {
    requests.push(structuredClone({ ...args[1], operation_id: args[0].operation_id }));
    const result = await original.apply(this, args);
    if (loseReply) { loseReply = false; throw new Error("模拟提交成功后响应丢失"); }
    return result;
  });
  directory = await mkdtemp(join(tmpdir(), "memory-classification-browser-"));
  browser = await ChromeHarness.start(directory, { executable });
  const page = await browser.page(), deliveries: Record<string, unknown>[] = [];
  browser.on("Network.requestWillBeSent", (params, sessionId) => {
    const request = params.request as { url?: string; postData?: string };
    if (sessionId === page.sessionId && request.url?.endsWith("/api/memory/change") && request.postData) deliveries.push(JSON.parse(request.postData));
  });
  await page.command("Network.enable");
  const { windowId } = await page.command<{ windowId: number }>("Browser.getWindowForTarget", { targetId: page.targetId });
  await page.command("Browser.setWindowBounds", { windowId, bounds: { width: 1440, height: 1000 } });
  await page.viewport(1440, 1000);
  const navigate = async () => {
    await page.evaluate("document.documentElement.dataset.classificationOld = '1'");
    await page.command("Page.navigate", { url: env.origin + `/projects/${project.project_id}/settings/memory` });
    await page.wait("document.documentElement?.dataset.classificationOld !== '1' && [...document.querySelectorAll('[data-memory-settings]')].some(node => node.checkVisibility())");
    assert.equal(await page.evaluate(`(() => {
      const roots = [...document.querySelectorAll('[data-memory-settings]')].filter(node => node.checkVisibility());
      if (roots.length !== 1 || roots[0].dataset.memoryScope !== 'project') return false;
      roots[0].setAttribute('data-memory-classification-test', ''); return true;
    })()`), true);
    await page.wait(`document.querySelector('${row(id)}')`); await ready(page);
  };
  const current = async () => {
    const response = await request(`/projects/${project.project_id}/api/memory/page?input=` + encodeURIComponent(JSON.stringify({ scope: "project" })));
    assert.equal(response.status, 200);
    const body = await response.json() as MemoryPageResponse;
    const item = body.items.find(one => one.memory_id === id); assert.ok(item); return item;
  };
  const revisions = async () => {
    const response = await request(`/projects/${project.project_id}/api/memory/items/${encodeURIComponent(id)}/history`);
    assert.equal(response.status, 200); return (await response.json() as MemoryHistoryResponse).revisions;
  };
  const canonical = async (host = env.host) => {
    const system = ensureSystemAgentService(host, env.home); await system.ready;
    const memory = system.agentHost.adapter("prologue").memory!;
    const entries = await memory.withCaller({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id,
      person: true, consumer: "ui", purpose: "management", current_scene: "common" }).list("project", project.project_id);
    const stored = entries.find(one => one.memory_id === id); assert.ok(stored); return stored;
  };
  const restart = async () => {
    await page.command("Page.navigate", { url: "about:blank" }); await page.wait("location.href === 'about:blank'");
    await env.close(); await env.host.close();
    const reopened = new MolisWorkLocalHost({ homeDirectory: env.home, completeText: null });
    let served: Awaited<ReturnType<typeof serveTestHost>> | undefined;
    try {
      served = await serveTestHost(null, { home: env.home, host: reopened });
      const read = bindActionClient(reopened.actionClient(project.reference), () => person(MEMORY_PERMISSIONS, project.project_id));
      const after = await read.invoke(memoryActions.page, { scope: "project" });
      return { item: after.items.find(one => one.memory_id === id), canonical: await canonical(reopened) };
    } finally { await served?.close(); await reopened.close(); }
  };
  await navigate();
  return { page, client, id, expires, current, canonical, restart, revisions, navigate, requests, deliveries, loseNextReply: () => { loseReply = true; } };
}

// MEM-04/08/15/17/28/29/34: production settings + Action/HTTP + SDK + real Node storage; no model provider.
test("legacy history requires consent for text-only use, preserves current facts and retries one committed operation across refresh", { timeout: 120_000 }, async t => {
  const oldText = "较早记录的正文，不能代表旧分类或期限", f = await setup(t, oldText), { page, id } = f;
  const before = await f.canonical(), historyBefore = await f.revisions();
  assert.equal(historyBefore[0]!.snapshot_available, false); assert.equal(historyBefore[0]!.classification, null);
  assert.equal(historyBefore[1]!.snapshot_available, true);
  await history(page, id);
  await page.evaluate(`document.querySelectorAll('${row(id)} .memory-history-list button').forEach(button => { if (button.textContent === '使用这段旧文字') button.dataset.legacyText = ''; })`);
  await page.click("[data-legacy-text]"); await page.wait("document.querySelector('.memory-confirm[open]')");
  assert.match(await page.evaluate<string>("document.querySelector('.memory-confirm').textContent"), /只替换正文，保留当前分类、适用条件、期限、来源和状态/);
  await page.click(".memory-confirm button:not([data-memory-confirm-yes])");
  await page.wait("!document.querySelector('.memory-confirm')");
  assert.equal(f.deliveries.length, 0); assert.deepEqual(await f.canonical(), before); assert.deepEqual(await f.revisions(), historyBefore);
  f.loseNextReply(); await page.click("[data-legacy-text]"); await page.click("[data-memory-confirm-yes]");
  await page.wait(`!document.querySelector('${root} [data-memory-error]').hidden`);
  const submitted = structuredClone(f.deliveries.at(-1)!);
  assert.deepEqual(Object.keys(submitted).sort(), ["action", "expected_version", "memory_id", "operation_id", "text"].sort());
  assert.equal(submitted.action, "update"); assert.equal(submitted.text, oldText); assert.equal(submitted.expected_version, before.version);
  const applied = await f.canonical();
  assert.equal(applied.text, oldText); assert.equal(applied.version, before.version + 1);
  assert.deepEqual(applied.meta, before.meta); assert.equal(applied.origin, before.origin); assert.equal(applied.owner, before.owner);
  assert.deepEqual(applied.disabled, before.disabled); assert.deepEqual(applied.paused, before.paused);
  assert.equal((await f.current()).kind, "convention", "old revision kind is not restored");
  assert.equal((await f.current()).state, "disabled"); assert.equal((await f.current()).expires_at, f.expires);
  assert.equal((await f.current()).basis, null, "unknown basis stays unknown");
  await page.click(root + " [data-memory-reload]"); await ready(page);
  await page.click(root + " [data-memory-retry]"); await page.wait(`document.querySelector('${root} [data-memory-retries]').hidden`);
  assert.deepEqual(f.deliveries.at(-1), submitted); assert.deepEqual(await f.canonical(), applied);
  const afterHistory = await f.revisions(); assert.equal(afterHistory.length, historyBefore.length + 1);
  assert.equal(afterHistory[0]!.snapshot_available, false); assert.equal(afterHistory.at(-1)!.snapshot_available, true);
  const reopened = await f.restart(); assert.deepEqual(reopened.canonical, applied);
  assert.equal(reopened.item!.text, oldText); assert.equal(reopened.item!.state, "disabled");
});

test("legacy text confirmation keeps its observed version and never overwrites a later edit", { timeout: 120_000 }, async t => {
  const f = await setup(t, "旧文字不能覆盖另一次编辑"), { page, id } = f;
  const observed = await f.current(); await history(page, id);
  await page.evaluate(`document.querySelectorAll('${row(id)} .memory-history-list button').forEach(button => { if (button.textContent === '使用这段旧文字') button.dataset.legacyText = ''; })`);
  await page.click("[data-legacy-text]"); await page.wait("document.querySelector('.memory-confirm[open]')");
  await f.client.invoke(memoryActions.change, { memory_id: id, expected_version: observed.version, action: "update", text: "另一次已确认的正文" });
  const newer = await f.canonical(), newerHistory = await f.revisions();
  await page.click("[data-memory-confirm-yes]"); await page.wait(`!document.querySelector('${root} [data-memory-error]').hidden`);
  assert.match(await page.evaluate<string>(`document.querySelector('${root} [data-memory-error]').textContent`), /记忆已变化/);
  const original = structuredClone(f.deliveries.at(-1)!); assert.equal(original.expected_version, observed.version);
  await page.click(root + " [data-memory-reload]"); await ready(page);
  await page.click(root + " [data-memory-retry]");
  await page.wait(`!document.querySelector('${root} [data-memory-retry]').disabled && !document.querySelector('${root} [data-memory-error]').hidden`);
  assert.deepEqual(f.deliveries.at(-1), original); assert.deepEqual(await f.canonical(), newer); assert.deepEqual(await f.revisions(), newerHistory);
  assert.deepEqual((await f.restart()).canonical, newer);
});

test("one Memory editor corrects all six formal kinds, preserves expiry/state, filters and restores same-text history", { timeout: 180_000 }, async t => {
  const f = await setup(t), { page, id } = f;
  await f.client.invoke(memoryActions.change, { memory_id: id, expected_version: (await f.current()).version, action: "disable" });
  await f.navigate();
  let version = (await f.current()).version;
  const kinds = ["preference", "convention", "fact", "experience", "habit", "project-decision"] as const;
  for (const [index, kind] of kinds.entries()) {
    await openEditor(page, id);
    assert.deepEqual(await page.evaluate<string[]>(`[...document.querySelector('${row(id)} select[aria-label=类别]').options].map(option => option.value)`), [...kinds]);
    await select(page, row(id) + " select[aria-label=类别]", kind);
    if (index === 0) await page.click(row(id) + " [data-memory-scene][value=coding]");
    await save(page, id, index === 0);
    const stored = await f.current();
    assert.equal(stored.memory_id, id); assert.equal(stored.version, ++version); assert.equal(stored.kind, kind);
    assert.equal(stored.state, "disabled", "classification never restores a disabled entry");
    assert.equal(stored.expires_at, f.expires, "omitted expiry preserves the exact original instant");
    assert.equal(stored.text, "交付前逐条核对事实与来源");
    assert.deepEqual(stored.classification?.scenes, ["coding", "common"]);
    const request = f.requests.at(-1)!;
    assert.equal(request.action, "reclassify"); assert.equal(request.text, undefined); assert.equal(request.applies, undefined);
    assert.equal(Object.hasOwn(request, "expires_at"), false);
    assert.deepEqual(Object.keys(request).sort(), ["action", "classification", "expected_version", "kind", "memory_id", "operation_id"].sort());
  }
  await select(page, root + " [data-memory-filter=kind]", "project-decision"); await ready(page);
  assert.equal(await page.evaluate(`document.querySelectorAll('${root} [data-memory-id]').length`), 1);
  await select(page, root + " [data-memory-filter=kind]", "habit"); await ready(page);
  assert.equal(await page.evaluate(`document.querySelectorAll('${root} [data-memory-id]').length`), 0);
  await select(page, root + " [data-memory-filter=kind]", ""); await ready(page);
  await history(page, id);
  const versions = await f.revisions(), first = versions.find(one => one.kind === "preference"); assert.ok(first);
  assert.ok(versions.every(one => one.text === "交付前逐条核对事实与来源"));
  const shown = await page.evaluate<string>(`document.querySelector('${row(id)} .memory-history-list').textContent`);
  for (const label of ["偏好", "约定", "背景事实", "经验", "习惯", "项目决策"]) assert.ok(shown.includes(label), label);
  assert.match(shown, /Coding.*短期/); assert.ok(shown.includes(await page.evaluate<string>(`new Date(${JSON.stringify(f.expires)}).toLocaleString()`)), "history identifies same-text revisions by their expiry");
  await page.evaluate(`document.querySelectorAll('${row(id)} .memory-history-list li').forEach(entry => {
    if (entry.querySelector('.memory-history-version').textContent.startsWith('第 ${first.version} 版')) entry.querySelector('button').dataset.restoreClassification = '';
  })`);
  await page.click("[data-restore-classification]");
  await page.wait(`!document.querySelector('${row(id)} .memory-history-list')`); await ready(page);
  assert.equal((await f.current()).kind, "preference"); assert.equal((await f.current()).version, ++version);
  assert.equal((await f.current()).expires_at, f.expires);

  await openEditor(page, id);
  await select(page, row(id) + " [data-memory-expiry]", "remove");
  await page.click(row(id) + " button[type=submit]");
  await page.wait(`!document.querySelector('${root} [data-memory-error]').hidden`);
  assert.match(await page.evaluate<string>(`document.querySelector('${root} [data-memory-error]').textContent`), /短期记忆需要未来的截止时间/);
  assert.equal((await f.current()).version, version, "invalid short-term removal writes nothing");
  await select(page, row(id) + " [data-memory-lifecycle]", "long-term");
  await page.fill(row(id) + " textarea", "交付前核对事实、出处与时效");
  await page.fill(row(id) + " input[aria-label=适用情境]", "交付前");
  await page.click(row(id) + " button[type=submit]");
  await page.wait("document.querySelector('[data-memory-confirm-yes]')");
  const confirmation = await page.evaluate<string>("document.querySelector('.memory-confirm').textContent");
  assert.match(confirmation, /短期.*长期/); assert.match(confirmation, /无固定期限/);
  await page.click(".memory-confirm button:not([data-memory-confirm-yes])");
  assert.equal((await f.current()).version, version, "cancelled expansion writes nothing and keeps the draft");
  assert.equal(await page.evaluate(`document.querySelector('${row(id)} textarea').value`), "交付前核对事实、出处与时效");
  await save(page, id, true);
  const combined = await f.current(); assert.equal(combined.version, ++version);
  assert.equal(combined.expires_at, null); assert.equal(combined.classification?.lifecycle, "long-term");
  assert.equal(combined.text, "交付前核对事实、出处与时效"); assert.equal(combined.applies.task, "交付前");
  assert.equal(combined.state, "disabled");
  await f.navigate(); assert.equal((await f.current()).version, version);
  assert.match(await page.evaluate<string>(`document.querySelector('${row(id)} .memory-meta').textContent`), /长期/);

  // The third expiry decision is entered in the real native control, then sent over HTTP and persisted by the SDK.
  await page.command("Emulation.setTimezoneOverride", { timezoneId: "Asia/Tokyo" });
  await openEditor(page, id);
  await select(page, row(id) + " [data-memory-lifecycle]", "short-term");
  await select(page, row(id) + " [data-memory-expiry]", "set");
  const year = new Date().getUTCFullYear() + 1;
  const expectedExpiry = new Date(Date.UTC(year, 9, 24, 7, 45, 30)).toISOString();
  await enterDeadline(page, row(id) + " [data-memory-expires-at]", year);
  await save(page, id);
  const finite = await f.current(); assert.equal(finite.version, ++version);
  assert.equal(finite.expires_at, expectedExpiry); assert.equal(finite.classification?.lifecycle, "short-term");
  assert.equal(f.deliveries.at(-1)!.expires_at, expectedExpiry, "the actual browser HTTP payload carries the chosen absolute time");
  assert.equal(f.deliveries.at(-1)!.action, "reclassify");
  assert.equal((await f.canonical()).meta.expires_at_ms, Date.parse(expectedExpiry));
  const label = await page.evaluate<string>(`new Date(${JSON.stringify(expectedExpiry)}).toLocaleString()`);
  assert.ok((await page.evaluate<string>(`document.querySelector('${row(id)} .memory-meta').textContent`)).includes(label));
  const reopened = await f.restart();
  assert.equal(reopened.item?.memory_id, id); assert.equal(reopened.item?.version, version);
  assert.equal(reopened.item?.expires_at, expectedExpiry); assert.equal(reopened.canonical.meta.expires_at_ms, Date.parse(expectedExpiry));
  assert.equal(reopened.item?.state, "disabled", "restarting after a deadline edit preserves the actual state");
  t.diagnostic(`native deadline → HTTP → SDK → reopened Host: ${expectedExpiry}`);
});

test("classification retry keeps the original decision after a lost reply and CAS never overwrites a later edit", { timeout: 120_000 }, async t => {
  const f = await setup(t), { page, id } = f;
  let version = (await f.current()).version;
  await openEditor(page, id); await select(page, row(id) + " select[aria-label=类别]", "habit");
  f.loseNextReply(); await page.click(row(id) + " button[type=submit]");
  await page.wait(`!document.querySelector('${root} [data-memory-error]').hidden`);
  assert.equal((await f.current()).kind, "habit"); assert.equal((await f.current()).version, ++version);
  assert.ok(await page.evaluate(`document.querySelector('${row(id)} textarea') !== null`));
  const first = structuredClone(f.requests.at(-1)!);
  await page.click(root + " [data-memory-reload]"); await ready(page);
  await page.click(root + " [data-memory-retry]");
  await page.wait(`document.querySelector('${root} [data-memory-retries]').hidden`);
  assert.deepEqual(f.requests.at(-1), first, "same operation, version, kind and classification after rereading");
  assert.equal((await f.current()).version, version, "successful replay adds no revision");

  await openEditor(page, id); await select(page, row(id) + " select[aria-label=类别]", "project-decision");
  await page.fill(row(id) + " textarea", "本人尚未保存的分类草稿");
  await f.client.invoke(memoryActions.change, { memory_id: id, expected_version: version, action: "update", text: "另一处已提交的新内容" });
  await page.click(row(id) + " button[type=submit]");
  await page.wait(`!document.querySelector('${root} [data-memory-error]').hidden`);
  const conflict = structuredClone(f.requests.at(-1)!);
  assert.equal(conflict.expected_version, version);
  assert.equal(await page.evaluate(`document.querySelector('${row(id)} textarea').value`), "本人尚未保存的分类草稿");
  assert.equal(await page.evaluate(`document.querySelector('${row(id)} select[aria-label=类别]').value`), "project-decision");
  await page.click(row(id) + " button[type=submit]");
  await page.wait(`!document.querySelector('${row(id)} button[type=submit]').disabled`);
  assert.deepEqual(f.requests.at(-1), conflict, "retry never substitutes the current version");
  const after = await f.current(); assert.equal(after.kind, "habit"); assert.equal(after.version, version + 1);
  assert.equal(after.text, "另一处已提交的新内容");
});
