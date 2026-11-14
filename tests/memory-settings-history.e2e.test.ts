import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ChromeHarness, locateTestChrome, type ChromePage } from "@molis-ai/molis-work-test-kit/browser";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { MEMORY_PERMISSIONS, memoryActions, type MemoryChangeResult, type MemoryHistoryResponse, type MemoryPageResponse, type MemoryWriteResult } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { ensureSystemAgentService, MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { person } from "./fixtures/home-runtime.js";
import { openTestHome, serveTestHost } from "./fixtures/test-home.js";
import { codingProductHost } from "./fixtures/coding-product-host.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";
import { endingReviewAnswer } from "./fixtures/ending-review.js";

const root = "[data-memory-history-test]";
const row = (id: string) => `${root} [data-memory-id="${id}"]`;
const revision = (id: string, version: number) => row(id) + ` [data-memory-history-version="${version}"]`;
const ready = (page: ChromePage) => page.wait(`document.querySelector('${root} [data-memory-list]')?.getAttribute('aria-busy') === 'false' && document.querySelector('${root} [data-memory-error]').hidden`);
const items = async (client: BoundActionClient) => (await client.invoke(memoryActions.page, { scope: "project" })).items;

async function navigate(page: ChromePage, url: string) {
  await page.evaluate("document.documentElement.dataset.oldHistoryPage = '1'");
  await page.command("Page.navigate", { url });
  await page.wait("document.documentElement?.dataset.oldHistoryPage !== '1' && [...document.querySelectorAll('[data-memory-settings]')].some(node => node.checkVisibility())");
  await page.evaluate(`(() => { [...document.querySelectorAll('[data-memory-settings]')].find(node => node.checkVisibility()).setAttribute('data-memory-history-test', ''); })()`);
  await ready(page);
}

async function browserFor(t: TestContext, start: (browser: ChromeHarness) => void) {
  const executable = locateTestChrome(); assert.ok(executable, "Chrome is required for the real history journey");
  const directory = await mkdtemp(join(tmpdir(), "memory-v0-history-browser-20261105-"));
  const browser = await ChromeHarness.start(directory, { executable, extraArgs: ["--use-mock-keychain", "--password-store=basic"] }); start(browser);
  t.diagnostic(`History screenshots: ${directory}`);
  const page = await browser.page(); await page.viewport(1440, 1100);
  const deliveries: Array<{ body: string; key: string }> = [];
  browser.on("Network.requestWillBeSent", (params, sessionId) => {
    const request = params.request as { url?: string; postData?: string; headers?: Record<string, string> };
    if (sessionId !== page.sessionId || !request.url?.endsWith("/change") || !request.postData) return;
    const key = Object.entries(request.headers ?? {}).find(([name]) => name.toLowerCase() === "x-molis-work-idempotency-key")?.[1] ?? "";
    deliveries.push({ body: request.postData, key });
  });
  await page.command("Network.enable");
  return { browser, page, directory, deliveries };
}

async function history(page: ChromePage, id: string, version: number) {
  await page.click(row(id) + " summary[aria-label^=更多操作]");
  await page.evaluate(`document.querySelectorAll('${row(id)} .memory-menu button').forEach(button => { if (button.textContent === '历史版本') button.dataset.historyOpen = ''; })`);
  await page.click(row(id) + " [data-history-open]");
  await page.wait(`document.querySelector('${revision(id, version)} button')`);
}

async function confirm(page: ChromePage, selector: string, accept: boolean) {
  await page.click(selector + " button"); await page.wait("document.querySelector('[data-memory-confirm-yes]')");
  if (accept) await page.click("[data-memory-confirm-yes]");
  else { await page.click(".memory-confirm footer button:first-child"); await page.wait("!document.querySelector('.memory-confirm')"); }
}

// Normal current Home: all history is produced by public Memory Actions and the real SDK, with no ledger fixture.
test("complete history discloses a short-to-long decision, cancels without writing and restores once after a lost reply and Home reopen", { timeout: 180_000 }, async t => {
  let chrome: ChromeHarness | undefined; t.after(async () => { await chrome?.close(); });
  const env = await openTestHome(t), project = await env.createProject("历史完整恢复");
  const client = bindActionClient(env.host.actionClient(project.reference), () => person(MEMORY_PERMISSIONS, project.project_id));
  const saved = (await client.invoke(memoryActions.write, { scope: "project", text: "交付前先列结论和依据", kind: "preference",
    classification: { scenes: ["common"], lifecycle: "long-term" }, expires_at: null })).memory!;
  const expiry = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const changed = (await client.invoke(memoryActions.change, { action: "reclassify", memory_id: saved.memory_id, expected_version: saved.version,
    text: "本轮编码交付前列检查结果", kind: "convention", applies: { task: "本轮编码交付" },
    classification: { scenes: ["coding"], lifecycle: "short-term" }, expires_at: expiry })).memory!;
  const disabled = (await client.invoke(memoryActions.change, { action: "disable", memory_id: saved.memory_id, expected_version: changed.version })).memory!;
  const before = await items(client), priorHistory = await client.invoke(memoryActions.history, { memory_id: saved.memory_id });
  assert.equal(memoryActions.history.version, 1);
  const old = priorHistory.revisions.find(one => one.version === saved.version)!;
  assert.deepEqual(old.classification, { scenes: ["common"], lifecycle: "long-term" }); assert.equal(old.expires_at, null); assert.equal(old.snapshot_available, true);
  assert.equal(Object.hasOwn(old, "snapshot"), false);
  const f = await browserFor(t, browser => { chrome = browser; });
  const url = env.origin + `/projects/${project.project_id}/settings/memory`;
  await navigate(f.page, url); await history(f.page, saved.memory_id, saved.version);
  const selector = revision(saved.memory_id, saved.version), displayed = await f.page.evaluate<string>(`document.querySelector('${selector}').innerText`);
  for (const text of [saved.text, "通用", "长期", "无固定期限", "完整历史快照"]) assert.ok(displayed.includes(text), text);
  await f.page.click(selector + " button"); await f.page.wait("document.querySelector('[data-memory-confirm-yes]')");
  const decision = await f.page.evaluate<string>("document.querySelector('.memory-confirm').innerText");
  for (const text of [saved.text, changed.text, "Coding", "短期", "通用", "长期", "无固定期限", "→", "来源", "状态保持不变"]) assert.ok(decision.includes(text), text);
  const localExpiry = await f.page.evaluate<string>(`new Date(${JSON.stringify(expiry)}).toLocaleString()`); assert.ok(decision.includes(localExpiry));
  await f.page.screenshot(join(f.directory, "full-restore-decision.png"));
  await f.page.click(".memory-confirm footer button:first-child"); await f.page.wait("!document.querySelector('.memory-confirm')");
  assert.equal(f.deliveries.length, 0); assert.deepEqual(await items(client), before);
  assert.deepEqual(await client.invoke(memoryActions.history, { memory_id: saved.memory_id }), priorHistory);
  const original = MemoryService.prototype.change; let loseReply = true;
  t.mock.method(MemoryService.prototype, "change", async function(this: MemoryService, ...args: Parameters<MemoryService["change"]>) {
    const result = await original.apply(this, args);
    if (args[1].action === "restore" && loseReply) { loseReply = false; throw new Error("Committed history response unavailable"); }
    return result;
  });
  await confirm(f.page, selector, true);
  await f.page.wait(`document.querySelector('${root} [data-memory-error]')?.checkVisibility() && document.querySelector('${root} [data-memory-retry]')`);
  assert.doesNotMatch(await f.page.evaluate<string>("document.querySelector('[data-settings-toast]')?.textContent || ''"), /已回到这一版|这次操作已完成/);
  const committed = await items(client), restored = committed.find(one => one.memory_id === saved.memory_id)!;
  assert.equal(restored.version, disabled.version + 1); assert.equal(restored.text, saved.text); assert.equal(restored.kind, saved.kind);
  assert.equal(restored.state, "disabled"); assert.deepEqual(restored.classification, old.classification); assert.equal(restored.expires_at, null);
  assert.equal(restored.source, saved.source); assert.equal(restored.origin, saved.origin); assert.equal(restored.basis, saved.basis);
  assert.deepEqual(restored.applies, saved.applies); assert.deepEqual(restored.evidence, saved.evidence);
  const changes = await client.invoke(memoryActions.changes, { scope: "project", limit: 50 }), histories = await client.invoke(memoryActions.history, { memory_id: saved.memory_id });
  await f.page.screenshot(join(f.directory, "committed-restore-response-failed.png"));
  await f.page.click(root + " [data-memory-retry]");
  await f.page.wait(`!document.querySelector('${root} [data-memory-retry]') && document.querySelector('[data-settings-toast]')?.textContent.includes('这次操作已完成')`); await ready(f.page);
  assert.equal(f.deliveries.length, 2); assert.equal(f.deliveries[0]!.body, f.deliveries[1]!.body);
  const body = JSON.parse(f.deliveries[0]!.body); assert.equal(body.action, "restore"); assert.equal(body.version, saved.version); assert.equal(body.expected_version, disabled.version);
  assert.ok(body.operation_id && f.deliveries[0]!.key && f.deliveries[1]!.key); assert.notEqual(f.deliveries[0]!.key, f.deliveries[1]!.key);
  assert.deepEqual(await items(client), committed); assert.deepEqual(await client.invoke(memoryActions.history, { memory_id: saved.memory_id }), histories);
  assert.deepEqual(await client.invoke(memoryActions.changes, { scope: "project", limit: 50 }), changes);
  await f.page.command("Page.navigate", { url: "about:blank" }); await f.page.wait("location.href === 'about:blank'"); await env.close(); await env.host.close();
  const reopened = new MolisWorkLocalHost({ homeDirectory: env.home, completeText: null }); let served: Awaited<ReturnType<typeof serveTestHost>> | undefined;
  try {
    served = await serveTestHost(null, { home: env.home, host: reopened });
    const read = bindActionClient(reopened.actionClient(project.reference), () => person(MEMORY_PERMISSIONS, project.project_id));
    assert.deepEqual(await items(read), committed); assert.deepEqual(await read.invoke(memoryActions.history, { memory_id: saved.memory_id }), histories);
    assert.deepEqual(await read.invoke(memoryActions.changes, { scope: "project", limit: 50 }), changes);
    const system = ensureSystemAgentService(reopened, env.home); await system.ready;
    const canonical = await system.agentHost.adapter("prologue").memory!.withCaller({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id,
      person: true, consumer: "ui", purpose: "management", current_scene: "common" }).list("project", project.project_id);
    assert.ok(canonical.find(one => one.memory_id === saved.memory_id)?.disabled);
    await navigate(f.page, served.origin + `/projects/${project.project_id}/settings/memory`);
    assert.ok((await f.page.evaluate<string>(`document.querySelector('${row(saved.memory_id)}').innerText`)).includes(saved.text));
    await history(f.page, saved.memory_id, changed.version); await f.page.screenshot(join(f.directory, "same-home-reopened-history.png"));
    await f.page.command("Page.navigate", { url: "about:blank" }); await f.page.wait("location.href === 'about:blank'");
  } finally { await served?.close(); await reopened.close(); }
});

// Explicit ledger boundary fixture, NOT a normal new-Home history source, an old Home, import-v1 or migration.
test("an existing missing-snapshot ledger revision offers only confirmed text adoption and preserves current facts", { timeout: 120_000 }, async t => {
  let chrome: ChromeHarness | undefined; t.after(async () => { await chrome?.close(); });
  const env = await openTestHome(t), project = await env.createProject("缺快照边界夹具");
  const client = bindActionClient(env.host.actionClient(project.reference), () => person(MEMORY_PERMISSIONS, project.project_id));
  await client.invoke(memoryActions.write, { scope: "project", text: "正常当前记忆用于建立项目owner", kind: "convention" });
  const system = ensureSystemAgentService(env.host, env.home); await system.ready;
  const raw = system.agentHost.adapter("prologue").memory!.withCaller({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id,
    person: true, consumer: "ui", purpose: "management", current_scene: "common" });
  const expiry = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const initial = await raw.write({ scope: "project", owner: project.project_id, operation_id: randomUUID(), text: "边界夹具的旧文字", origin: "明确的边界来源",
    meta: { kind: "convention", source: "manual", classification: { scenes: ["coding"], lifecycle: "short-term" }, expires_at_ms: Date.parse(expiry), approved_by: { by: "person" } } });
  // Only add a record that does not exist. Never replace a revision or alter the current SDK entry through storage.
  const ledger = openMemoryLedger({ homeDirectory: env.home });
  try { assert.deepEqual(ledger.revisions(initial.memory_id), []); ledger.addRevision(initial.memory_id, { version: initial.version,
    text: initial.text, kind: "convention", applies: {}, change: "created", by: "person", at: new Date().toISOString() }); }
  finally { ledger.close(); }
  const changed = (await client.invoke(memoryActions.change, { memory_id: initial.memory_id, expected_version: initial.version, action: "update", text: "当前正文与限定条件",
    applies: { task: "仅处理当前边界样本" } })).memory!;
  await client.invoke(memoryActions.change, { memory_id: changed.memory_id, expected_version: changed.version, action: "disable" });
  const before = (await items(client)).find(one => one.memory_id === initial.memory_id)!;
  const f = await browserFor(t, browser => { chrome = browser; });
  await navigate(f.page, env.origin + `/projects/${project.project_id}/settings/memory`); await history(f.page, initial.memory_id, initial.version);
  const selector = revision(initial.memory_id, initial.version), text = await f.page.evaluate<string>(`document.querySelector('${selector}').innerText`);
  assert.ok(text.includes("历史分类与期限未知")); assert.ok(text.includes("使用这段旧文字")); assert.equal(text.includes("回到这一版"), false);
  await confirm(f.page, selector, false); assert.equal(f.deliveries.length, 0); assert.deepEqual((await items(client)).find(one => one.memory_id === initial.memory_id), before);
  await f.page.click(selector + " button"); await f.page.wait("document.querySelector('[data-memory-confirm-yes]')");
  const decision = await f.page.evaluate<string>("document.querySelector('.memory-confirm').innerText");
  assert.ok(decision.includes("只采用旧正文")); assert.ok(decision.includes("Coding · 短期 → Coding · 短期"));
  await f.page.screenshot(join(f.directory, "missing-snapshot-text-only-decision.png"));
  await f.page.click("[data-memory-confirm-yes]"); await f.page.wait("document.querySelector('[data-settings-toast]')?.textContent.includes('已采用旧文字')"); await ready(f.page);
  const after = (await items(client)).find(one => one.memory_id === initial.memory_id)!;
  assert.deepEqual({ ...after, text: before.text, version: before.version, updated_at: before.updated_at }, before);
  assert.equal(after.text, initial.text); assert.equal(after.version, before.version + 1);
  const body = JSON.parse(f.deliveries[0]!.body); assert.equal(f.deliveries.length, 1); assert.equal(body.action, "update");
  assert.equal(body.text, initial.text); assert.equal(body.expected_version, before.version); assert.equal(body.version, undefined);
  assert.deepEqual(Object.keys(body).sort(), ["action", "expected_version", "memory_id", "operation_id", "text"]);
  assert.equal((await client.invoke(memoryActions.history, { memory_id: initial.memory_id })).revisions[0]!.snapshot_available, false);
});

// Real Coding business owner + Runtime Session binding, not a Session identity supplied by a URL.
test("protected Session history restores old text while disclosing that current classification, binding and expiry are retained", { timeout: 180_000 }, async t => {
  let chrome: ChromeHarness | undefined; t.after(async () => { await chrome?.close(); });
  const f = await codingProductHost(t, request => cogniaModelResponse(endingReviewAnswer(request, () => []) ?? "已核对，不更改文件。"), { loopbackProvider: true });
  const prefix = `/projects/${f.project.project_id}`, coding = "/api/plugins/io.molis.work.coding";
  const created = await f.call<{ session: { session_id: string } }>(f.project.project_id, coding + "/sessions", { title: "真实会话历史" }); assert.equal(created.status, 200);
  const id = created.body.session.session_id;
  const started = await f.call<{ run: { ref: AgentRunRef } }>(f.project.project_id, coding + `/sessions/${id}/runs`, {
    task: "检查当前目录，不改文件。", intent: "discuss", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model" });
  assert.equal(started.status, 200); assert.equal((await f.ended(started.body.run.ref)).phase, "completed");
  const base = prefix + "/api/memory/sessions/coding/" + encodeURIComponent(id), expiry = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const saved = (await f.web.post<MemoryWriteResult>(base + "/items", { scope: "project", text: "原会话的历史文字", kind: "convention",
    classification: { scenes: ["coding"], lifecycle: "session" }, expires_at: null, operation_id: randomUUID() })).memory!;
  const changed = (await f.web.post<MemoryChangeResult>(base + "/change", { memory_id: saved.memory_id, expected_version: saved.version, action: "reclassify",
    text: "本轮有明确期限的文字", kind: "preference", classification: { scenes: ["coding", "common"], lifecycle: "session" }, expires_at: expiry, operation_id: randomUUID() })).memory!;
  const before = (await f.web.get<MemoryPageResponse>(base + "/page?input=" + encodeURIComponent(JSON.stringify({ scope: "project" })))).items[0]!;
  const system = ensureSystemAgentService(f.host, f.home); await system.ready;
  const raw = system.agentHost.adapter("prologue").memory!.withCaller({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: f.project.project_id,
    person: true, consumer: "ui", purpose: "management", current_scene: "coding" });
  const canonicalBefore = (await raw.list("project", f.project.project_id)).find(one => one.memory_id === saved.memory_id)!;
  const models = f.requests.length, b = await browserFor(t, browser => { chrome = browser; });
  await navigate(b.page, f.web.origin + prefix + `/settings/memory?memory_session_kind=coding&memory_session_id=${encodeURIComponent(id)}`);
  await history(b.page, saved.memory_id, saved.version);
  const selector = revision(saved.memory_id, saved.version);
  assert.ok((await b.page.evaluate<string>(`document.querySelector('${selector}').innerText`)).includes("无固定期限"));
  await b.page.click(selector + " button"); await b.page.wait("document.querySelector('[data-memory-confirm-yes]')");
  const decision = await b.page.evaluate<string>("document.querySelector('.memory-confirm').innerText"), localExpiry = await b.page.evaluate<string>(`new Date(${JSON.stringify(expiry)}).toLocaleString()`);
  assert.ok(decision.includes("会话内恢复保留当前分类、会话绑定和期限，不采用旧期限。")); assert.ok(decision.includes(localExpiry + " → " + localExpiry));
  assert.ok(decision.includes("Coding · 通用 · 会话内 → Coding · 通用 · 会话内"));
  await b.page.screenshot(join(b.directory, "protected-session-restore-decision.png"));
  await b.page.click("[data-memory-confirm-yes]"); await b.page.wait("document.querySelector('[data-settings-toast]')?.textContent.includes('已回到这一版')"); await ready(b.page);
  const after = (await f.web.get<MemoryPageResponse>(base + "/page?input=" + encodeURIComponent(JSON.stringify({ scope: "project" })))).items[0]!;
  assert.equal(after.text, saved.text); assert.equal(after.kind, saved.kind); assert.equal(after.version, changed.version + 1);
  assert.equal(after.expires_at, expiry); assert.deepEqual(after.classification, before.classification);
  const canonicalAfter = (await raw.list("project", f.project.project_id)).find(one => one.memory_id === saved.memory_id)!;
  assert.deepEqual(canonicalAfter.meta.session_ref, canonicalBefore.meta.session_ref); assert.equal(canonicalAfter.meta.expires_at_ms, Date.parse(expiry));
  assert.equal(after.source, saved.source); assert.equal(f.requests.length, models, "history and the person's restore do not call the provider");
  const historyAfter = await f.web.get<MemoryHistoryResponse>(base + `/items/${saved.memory_id}/history`);
  assert.equal(historyAfter.revisions.at(-1)!.expires_at, expiry); assert.deepEqual(historyAfter.revisions.at(-1)!.classification, before.classification);
  assert.equal(b.deliveries.length, 1); assert.equal(JSON.parse(b.deliveries[0]!.body).action, "restore");
});
