import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ChromeHarness, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import { createLocalHostWorkbenchRenderer } from "@molis-ai/molis-work-app-local-host";
import { desktopWorkbenchRendererPorts } from "@molis-ai/molis-work-app-desktop";
import type { MolisWorkWebView } from "@molis-ai/molis-work-app-workbench";
import type { MemoryExportPackage } from "@molis-ai/molis-work-contracts/services/memory";

const { renderMolisWorkProjectSettingsHub, renderMolisWorkSettingsStylesheet } = createLocalHostWorkbenchRenderer(desktopWorkbenchRendererPorts);

// Production renderer + browser client + request helper over real HTTP. The server is a protocol fixture,
// not a substitute for the Service/SDK authority and CAS tests, and never starts a Home or calls a model.
interface Request { path: string; body: Record<string, unknown>; key: string }
const entry = (id: string, version: number, state = "active") => ({ memory_id: id, version, state,
  owner: "project", text: `记忆 ${id}`, kind: "preference", source: "manual", scope: "project", applies: {}, origin: "本人", created_at: "2026-10-23T00:00:00Z",
  classification: { scenes: ["common"], lifecycle: "long-term" } as { scenes: string[]; lifecycle: string } | null, expired: false, expires_at: null as string | null });
interface PageInput { query?: string; cursor?: string; filter?: { kinds?: string[]; scenes?: string[]; states?: string[]; expired?: boolean; unclassified?: boolean } }
const pageOf = (items: unknown[], extra: object = {}) => ({ items, exhausted: true, stopped: "end", total: { kind: "exact", value: items.length },
  scanned: "unknown", cost: {}, labels: { goals: {} }, ...extra });
async function open(t: TestContext, answer: (request: Request) => { status?: number; body: unknown }, pageAnswer?: (input: PageInput) => Promise<{ status?: number; body: unknown }>) {
  const chrome = locateTestChrome(); if (!chrome) { t.skip("Chrome is required"); return null; }
  const directory = await mkdtemp(join(tmpdir(), "memory-settings-cas-"));
  const calls: Request[] = [];
  const overview = { items: [entry("active", 7), entry("disabled", 11, "disabled"), entry("paused", 19, "paused")],
    candidates: [{ candidate_id: "proposal", version: 13, text: "建议", kind: "preference" }], changes: [], pairs: null, prefs: {} };
  const reads: PageInput[] = [];
  const project = { project_id: "project", display_name: "测试项目" };
  const view: MolisWorkWebView = {
    snapshot: { board: { project_id: "project", active_goal_id: null, created_at: "2026-10-23T00:00:00Z", updated_at: "2026-10-23T00:00:00Z" },
      cursor: 0, goals: [], relations: [], goal_tree_proposals: [], planning_method_packs: [], project_guidance: [] },
    project, projects: [project], route_prefix: "/projects/project", demo: false, active_goal_id: null, goals: [], archived_goals: [], trashed_goals: [],
    counts: { waiting_for_human: 0, executing: 0, execution_blocked: 0, execution_pending: 0, satisfied: 0, invalidated: 0, trashed: 0, archived: 0 },
    input_bindings: [], policy_bindings: [], events: [], feed: { sources: [], feed_items: [], inbox_entries: [], runs: [], out_rules: [] },
  };
  const html = renderMolisWorkProjectSettingsHub(view, { entries: [], inactive_entries: [], revisions: [], virtual_document: "", runtime_prompt_prefix: "" }, [], "", false, "memory");
  const server = createServer(async (request, response) => {
    const url = new URL(request.url!, "http://local"), path = url.pathname;
    if (path.endsWith(".css")) { response.setHeader("content-type", "text/css"); response.end(renderMolisWorkSettingsStylesheet()); return; }
    if (path.endsWith(".js")) { response.setHeader("content-type", "application/javascript"); response.end(); return; }
    if (!path.includes("/api/memory/")) { response.setHeader("content-type", "text/html; charset=utf-8"); response.end(html); return; }
    response.setHeader("content-type", "application/json");
    if (path.endsWith("/overview")) { response.end(JSON.stringify({ ...overview, ...pageOf(overview.items) })); return; }
    if (path.endsWith("/pairs")) { response.end(JSON.stringify({ pairs: [] })); return; }
    if (path.endsWith("/page")) {
      const input: PageInput = JSON.parse(url.searchParams.get("input")!); reads.push(input);
      const result = pageAnswer ? await pageAnswer(input) : { body: pageOf(overview.items.filter(item => !input.query || item.text.includes(input.query))) };
      response.statusCode = result.status ?? 200;
      if (!response.destroyed) response.end(JSON.stringify(result.body)); return;
    }
    if (path.endsWith("/history")) { response.end(JSON.stringify({ revisions: [{ version: 2, text: "旧版", kind: "preference", classification: { scenes: ["common"], lifecycle: "long-term" }, expires_at: null, snapshot_available: true, at: "2026-10-22T00:00:00Z" }] })); return; }
    let raw = ""; for await (const chunk of request) raw += chunk;
    const call = { path, body: JSON.parse(raw || "{}"), key: String(request.headers["x-molis-work-idempotency-key"] || "") }; calls.push(call);
    const result = answer(call); response.statusCode = result.status ?? 200; response.end(JSON.stringify(result.body));
  });
  let browser: ChromeHarness | undefined;
  t.after(async () => { await browser?.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  browser = await ChromeHarness.start(directory, { executable: chrome });
  const page = await browser.page(); await page.viewport(1200, 1000);
  let visit = 0;
  const reset = async () => {
    await page.evaluate(`document.documentElement.dataset.memoryPreviousVisit = '${++visit}'`);
    await page.command("Page.navigate", { url: `http://127.0.0.1:${address.port}/?visit=${visit}` });
    await page.wait(`document.documentElement.dataset.memoryPreviousVisit !== '${visit}' && document.querySelector('[data-memory-id=active]')`);
  };
  await reset();
  return { page, calls, reset, overview, directory, reads };
}
const item = (id = "active") => `[data-memory-id=${id}]`;
const textButton = (label: string) => `button[aria-label^="${label}："]`;

// MEM-PAGE-02/03: bounded read states and delayed HTTP are protocol fixtures; the real Home journey is separate.
test("Memory page continues after an empty scan, preserves unknown totals and sends the server cursor with its filters", { timeout: 45_000 }, async t => {
  const final = { ...entry("expired", 31), text: "临时周报约定", kind: "habit", classification: null,
    expired: true, expires_at: "2026-01-01T00:00:00Z" };
  const f = await open(t, () => ({ body: {} }), async input => ({ body: input.cursor
    ? pageOf([final, { ...entry("decision", 5), kind: "project-decision" }], { total: { kind: "unknown" } })
    : pageOf([], { cursor: "fixed-query-page-2", exhausted: false, stopped: "unknown", total: { kind: "unknown" } }) }));
  if (!f) return;
  await f.page.fill("[data-memory-filter=query]", "周报");
  await f.page.wait("document.querySelector('[data-memory-list]').textContent.includes('尚未查完') && !document.querySelector('[data-memory-next]').disabled");
  assert.match(await f.page.evaluate<string>("document.querySelector('[data-memory-summary]').textContent"), /总数未知/);
  assert.equal(await f.page.evaluate("document.querySelector('[data-memory-next]').textContent"), "继续查找");
  await f.page.click("[data-memory-next]"); await f.page.wait("document.querySelector('[data-memory-id=expired]')");
  assert.equal(f.reads.at(-1)?.cursor, "fixed-query-page-2"); assert.equal(f.reads.at(-1)?.query, "周报");
  assert.match(await f.page.evaluate<string>("document.querySelector('[data-memory-summary]').textContent"), /总数未知/, "last page does not invent a total");
  assert.equal(await f.page.evaluate("document.querySelector('[data-memory-next]').disabled"), true);
  assert.match(await f.page.evaluate<string>("document.querySelector('[data-memory-id=expired] .memory-meta').textContent"), /未归类/);
  assert.match(await f.page.evaluate<string>("document.querySelector('[data-memory-id=expired] .memory-meta').textContent"), /已到期/);
  assert.equal(await f.page.evaluate("document.querySelector('[data-memory-id=expired] [data-mw-state=disabled]')"), null, "expiry is not a fabricated disabled state");
  // M3's formal-management contract now includes all six kinds; expiry is still a separate restriction.
  for (const id of ["expired", "decision"]) {
    assert.equal(await f.page.evaluate(`Boolean(document.querySelector('${item(id)} button[aria-label^=修改]'))`), true);
    assert.equal(await f.page.evaluate(`Boolean(document.querySelector('${item(id)} summary[aria-label^=更多操作]'))`), true);
  }
  assert.equal(f.calls.length, 0);
});

test("Memory filter changes reject a late page and reset navigation without reusing its cursor", { timeout: 45_000 }, async t => {
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }), barrier = new Promise<void>(resolve => { release = resolve; });
  const f = await open(t, () => ({ body: {} }), async input => {
    if (input.query === "旧查询") { entered(); await barrier; return { body: pageOf([entry("late", 1)], { cursor: "wrong-cursor", exhausted: false }) }; }
    return { body: pageOf([entry("current", 2)]) };
  });
  if (!f) return;
  t.after(release);
  await f.page.fill("[data-memory-filter=query]", "旧查询"); await started;
  await f.page.fill("[data-memory-filter=query]", "新查询"); await f.page.wait("document.querySelector('[data-memory-id=current]')");
  release();
  await f.page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await f.page.evaluate("document.querySelector('[data-memory-id=late]')"), null);
  assert.equal(await f.page.evaluate("document.querySelector('[data-memory-previous]').disabled && document.querySelector('[data-memory-next]').disabled"), true);
  assert.equal(f.reads.at(-1)?.cursor, undefined);
});

test("A failed page read does not claim an empty library and reload retries the same filter without a write", { timeout: 45_000 }, async t => {
  let unavailable = true;
  const f = await open(t, () => ({ body: {} }), async () => unavailable
    ? { status: 503, body: { code: "memory.unavailable", error: "本次读取暂不可用" } }
    : { body: pageOf([entry("active", 7)]) }); if (!f) return;
  await f.page.fill("[data-memory-filter=query]", "记忆 active");
  await f.page.wait("document.querySelector('[data-memory-page-status]').textContent.includes('读取未完成')");
  assert.match(await f.page.evaluate<string>("document.querySelector('[data-memory-list]').textContent"), /读取未完成/);
  assert.equal(await f.page.evaluate("document.querySelector('[data-memory-next]').disabled"), true);
  assert.equal(f.reads.at(-1)?.query, "记忆 active", "the failing request reached the real HTTP server");
  unavailable = false;
  await f.page.click("[data-memory-reload]"); await f.page.wait("document.querySelector('[data-memory-id=active]')");
  assert.equal(f.reads.at(-1)?.query, "记忆 active");
  assert.equal(await f.page.evaluate("document.querySelectorAll('[data-memory-id]').length"), 1);
  assert.equal(f.calls.length, 0);
});

test("Memory settings sends the displayed formal/candidate version for every existing-record decision", { timeout: 90_000 }, async t => {
  const f = await open(t, () => ({ body: {} })); if (!f) return;
  const { page, calls } = f;
  const more = async (label: string) => {
    await page.click(item() + " summary[aria-label^=更多操作]");
    await page.evaluate(`document.querySelector('${item()} .memory-menu').querySelectorAll('button').forEach(button => { if(button.textContent===${JSON.stringify(label)}) button.dataset.selectedAction='1'; })`);
    await page.click("[data-selected-action]");
  };
  const cases = [
    { name: "disable", version: 7, run: () => page.click(item() + " " + textButton("停用")) },
    { name: "enable", version: 11, run: () => page.click(item("disabled") + " " + textButton("启用")) },
    { name: "resume", version: 19, run: () => page.click(item("paused") + " " + textButton("恢复使用")) },
    { name: "update", version: 7, run: async () => { await page.click(item() + " " + textButton("修改")); await page.fill(item() + " textarea", "新的表达"); await page.click(item() + " button[type=submit]"); } },
    { name: "move", version: 7, run: () => more("改为个人记忆") },
    { name: "restore", version: 7, run: async () => { await more("历史版本"); await page.wait("document.querySelector('.memory-history button')"); await page.click(".memory-history button"); } },
    { name: "remove", version: 7, run: async () => { await more("删除"); await page.click("[data-memory-confirm-yes]"); } },
    { name: "accept", version: 13, run: () => page.click("[data-memory-candidates] " + textButton("记住")) },
    { name: "reword", version: 13, run: async () => { await page.click("[data-memory-candidates] .memory-actions button:nth-child(2)"); await page.fill("[data-memory-candidates] textarea", "改写后的建议"); await page.click("[data-memory-candidates] button[type=submit]"); } },
    { name: "discard", version: 13, run: () => page.click("[data-memory-candidates] " + textButton("不用")) },
  ];
  for (const one of cases) await t.test(one.name, async () => {
    await f.reset(); const at = calls.length; await one.run();
    await page.wait("document.querySelector('[data-settings-toast]').classList.contains('is-visible')");
    assert.equal(calls.length, at + 1); assert.equal(calls.at(-1)!.body.expected_version, one.version);
    assert.match(String(calls.at(-1)!.body.operation_id), /^[0-9a-f-]{36}$/, "domain identity is sent separately from the HTTP key");
    if (one.name === "restore") assert.equal(calls.at(-1)!.body.version, 2, "restore target and current CAS version stay distinct");
  });
});

test("A conflict preserves the observed version and editor; it never refreshes and repeats a new decision", { timeout: 40_000 }, async t => {
  let attempt = 0;
  const f = await open(t, () => ++attempt === 1 ? { status: 409, body: { code: "memory.conflict", error: "版本已变化" } } : { body: {} }); if (!f) return;
  const { page, calls } = f;
  await page.click(item() + " " + textButton("修改")); await page.fill(item() + " textarea", "原决定");
  await page.click(item() + " button[type=submit]"); await page.wait("!document.querySelector('[data-memory-error]').hidden");
  f.overview.items[0]!.version = 99;
  assert.equal(await page.evaluate(`document.querySelector('${item()} textarea').value`), "原决定");
  await page.click(item() + " button[type=submit]"); await page.wait("!document.querySelector('[data-memory-id=active] textarea')");
  assert.deepEqual(calls.map(call => call.body.expected_version), [7, 7]);
  assert.match(String(calls[0]!.body.operation_id), /^[0-9a-f-]{36}$/);
  assert.equal(calls[0]!.body.operation_id, calls[1]!.body.operation_id, "original decision retries with the same domain operation identity");
});

test("Partial clear and unknown retry retain the original confirmation; only complete results say done", { timeout: 50_000 }, async t => {
  let clears = 0, previews = 0;
  const f = await open(t, call => {
    if (call.path.endsWith("/preview")) return { body: { count: 4, fingerprint: `fixed-${++previews}` } };
    if (call.path.endsWith("/clear")) {
      clears++;
      if (clears === 1) return { body: { removed: 1, complete: false, items: [
        { memory_id: "a", outcome: "completed" }, { memory_id: "b", outcome: "conflict" },
        { memory_id: "c", outcome: "unknown" }, { memory_id: "d", outcome: "not-executed" }] } };
      if (clears === 2 || clears === 4) return { status: 503, body: { error: "结果待核对", code: "memory.conflict" } };
      return { body: { removed: 4, complete: true, items: ["a", "b", "c", "d"].map(memory_id => ({ memory_id, outcome: "completed" })) } };
    }
    return { body: {} };
  }); if (!f) return;
  const { page, calls } = f;
  await page.click("[data-memory-clear]"); await page.wait("document.querySelector('[data-memory-confirm-yes]')"); await page.click("[data-memory-confirm-yes]");
  await page.wait("document.querySelector('[data-memory-clear-status]')?.textContent.includes('尚未完成')");
  const status = await page.evaluate<string>("document.querySelector('[data-memory-clear-status]').textContent");
  assert.match(status, /已删除 1/); assert.match(status, /版本冲突 1/); assert.match(status, /结果未知 1/); assert.match(status, /尚未执行 1/);
  assert.equal(await page.evaluate("document.querySelector('[data-memory-clear]').textContent"), "重试本次清空");
  await page.click("[data-memory-clear]"); await page.wait("!document.querySelector('[data-memory-error]').hidden");
  await page.click("[data-memory-clear]"); await page.wait("document.querySelector('[data-memory-clear-status]').textContent.includes('清空已完成')");
  assert.equal(previews, 1); assert.equal(clears, 3);
  assert.deepEqual(calls.filter(call => call.path.endsWith("/clear")).map(call => call.body.fingerprint), ["fixed-1", "fixed-1", "fixed-1"]);
  assert.equal(await page.evaluate("document.querySelector('[data-memory-clear]').textContent"), "清空…");
  // A later, explicitly confirmed clear can fail; abandoning its retry never silently authorizes a new scope.
  await page.click("[data-memory-clear]"); await page.wait("document.querySelector('[data-memory-confirm-yes]')"); await page.click("[data-memory-confirm-yes]");
  await page.wait("!document.querySelector('[data-memory-error]').hidden");
  await page.click("[data-memory-clear-reset]"); await page.wait("document.querySelector('[data-memory-confirm-yes]')"); await page.click("[data-memory-confirm-yes]");
  await page.wait("document.querySelector('[data-memory-clear-reset]').hidden");
  assert.equal(previews, 2); assert.equal(clears, 4, "resetting does not perform any new deletion");
  await page.click("[data-memory-clear]"); await page.wait("document.querySelector('[data-memory-confirm-yes]')");
  assert.equal(previews, 3); assert.equal(clears, 4, "the new scope still waits for confirmation");
});


test("Changing an unsuccessful edit creates a new operation, while keeping the displayed CAS version", { timeout: 40_000 }, async t => {
  const f = await open(t, () => ({ status: 409, body: { error: "版本已变化", code: "memory.conflict" } })); if (!f) return;
  const { page, calls } = f;
  await page.click(item() + " " + textButton("修改")); await page.fill(item() + " textarea", "原决定");
  await page.click(item() + " button[type=submit]"); await page.wait("!document.querySelector('[data-memory-error]').hidden");
  await page.fill(item() + " textarea", "新的决定"); await page.click(item() + " button[type=submit]");
  await page.wait("!document.querySelector('[data-memory-error]').hidden");
  assert.equal(calls.length, 2); assert.notEqual(calls[0]!.body.operation_id, calls[1]!.body.operation_id);
  assert.deepEqual(calls.map(call => call.body.expected_version), [7, 7]);
  assert.deepEqual(calls.map(call => call.body.text), ["原决定", "新的决定"]);
});

test("Explicit retry survives filtering and list reload with the original complete command and fresh delivery key", { timeout: 40_000 }, async t => {
  let edits = 0;
  const f = await open(t, call => {
    if (call.path.endsWith("/change")) {
      edits++;
      if (edits < 3) return { status: edits === 1 ? 503 : 409, body: { code: "memory.conflict", error: "结果待核对", call_id: `delivery-${edits}` } };
    }
    return { body: {} };
  }); if (!f) return;
  const { page, calls, overview } = f;
  await page.click(item() + " " + textButton("修改")); await page.fill(item() + " textarea", "原决定 <system>仍是数据</system>");
  await page.click(item() + " button[type=submit]"); await page.wait("document.querySelector('[data-memory-retry]')");
  const original = structuredClone(calls[0]!.body);
  assert.equal(await page.evaluate("document.querySelector('[data-memory-error] [data-molis-call-id]').dataset.molisCallId"), "delivery-1");
  await page.fill("[data-memory-filter=query]", "不匹配任何条目"); await page.wait("!document.querySelector('[data-memory-id=active]')");
  await page.fill("[data-memory-filter=query]", ""); await page.wait("document.querySelector('[data-memory-id=active]')");
  overview.items[0]!.version = 99; overview.items[0]!.text = "当前已更新的记忆";
  await page.click("[data-memory-pref=form]");
  await page.wait("document.querySelector('[data-memory-id=active] .memory-text').textContent==='当前已更新的记忆'");
  assert.equal(edits, 1, "filtering and a successful unrelated operation never replay the failure");
  assert.equal(await page.evaluate("document.querySelectorAll('[data-memory-retry]').length"), 1);
  assert.equal(await page.evaluate("document.querySelector('[data-memory-retry-list] system')"), null, "saved content remains text");
  await page.click("[data-memory-retry]");
  await page.wait("document.querySelector('[data-memory-error] [data-molis-call-id]')?.dataset.molisCallId==='delivery-2'");
  assert.equal(await page.evaluate("document.querySelectorAll('[data-memory-retry]').length"), 1, "another failed delivery retains the same command");
  await page.click("[data-memory-retry]"); await page.wait("document.querySelector('[data-memory-retries]').hidden");
  const delivered = calls.filter(call => call.path.endsWith("/change"));
  assert.equal(delivered.length, 3);
  assert.deepEqual(delivered.map(call => call.body), [original, original, original]);
  assert.deepEqual(delivered.map(call => call.body.expected_version), [7, 7, 7], "the new overview version is never substituted into a retry");
  assert.ok(delivered.every(call => /^[0-9a-f-]{36}$/.test(call.key)));
  assert.equal(new Set(delivered.map(call => call.key)).size, 3, "HTTP delivery identity is distinct from the stable domain operation");
  assert.ok(delivered.every(call => call.key !== call.body.operation_id && !("call_id" in call.body)));
});

test("Failed decisions on different objects remain independently retryable until each succeeds", { timeout: 40_000 }, async t => {
  const seen = new Set<string>();
  const f = await open(t, call => {
    const id = String(call.body.operation_id);
    if (!seen.has(id)) { seen.add(id); return { status: 503, body: { code: "memory.conflict", error: "结果待核对" } }; }
    return { body: {} };
  }); if (!f) return;
  const { page, calls } = f;
  await page.click(item() + " " + textButton("停用")); await page.wait("document.querySelectorAll('[data-memory-retry]').length===1");
  await page.click(item("disabled") + " " + textButton("启用")); await page.wait("document.querySelectorAll('[data-memory-retry]').length===2");
  assert.notEqual(calls[0]!.body.operation_id, calls[1]!.body.operation_id);
  const commands = calls.map(call => structuredClone(call.body));
  await page.evaluate("document.querySelector('[data-memory-id=active]').dataset.beforeRetry='1'");
  await page.click("[data-memory-retry-list] li:first-child [data-memory-retry]");
  await page.wait("document.querySelectorAll('[data-memory-retry]').length===1 && !document.querySelector('[data-before-retry]')");
  assert.match(await page.evaluate<string>("document.querySelector('[data-memory-retry-list]').textContent"), /记忆 disabled/);
  await page.evaluate("document.querySelector('[data-memory-id=active]').dataset.beforeRetry='1'");
  await page.click("[data-memory-retry]"); await page.wait("document.querySelector('[data-memory-retries]').hidden && !document.querySelector('[data-before-retry]')");
  assert.deepEqual(calls.map(call => call.body), [commands[0], commands[1], commands[0], commands[1]]);
  await page.click(item() + " " + textButton("停用")); await page.wait("document.querySelector('[data-memory-retry]')");
  assert.notEqual(calls[4]!.body.operation_id, commands[0]!.operation_id, "a later decision is new after the earlier one completed");
  await f.reset();
  assert.equal(await page.evaluate("document.querySelector('[data-memory-retries]').hidden"), true, "browser navigation does not promise persistence");
});

test("Import retry retains the selected package after the file input clears and reports refused entries accurately", { timeout: 40_000 }, async t => {
  let attempts = 0;
  const f = await open(t, () => ++attempts === 1
    ? { status: 503, body: { code: "memory.conflict", error: "结果待核对" } }
    : { body: { written: 1, skipped: 1, refused: 1 } }); if (!f) return;
  const { page, calls, directory } = f;
  const pack: MemoryExportPackage = { format: "molis.memory", version: 2, exported_at: "2026-10-23T00:00:00Z", scope: "project", redactions: [],
    entries: ["导入原文", "已有原文", "暂不导入"].map(text => ({ text, kind: "preference", applies: {}, source: "manual", basis: "explicit", origin: "本人", expires_at: null })) };
  const file = join(directory, "memory.json"); await writeFile(file, JSON.stringify(pack));
  const document = await page.command<{ root: { nodeId: number } }>("DOM.getDocument");
  const input = await page.command<{ nodeId: number }>("DOM.querySelector", { nodeId: document.root.nodeId, selector: "[data-memory-import]" });
  await page.command("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [file] });
  await page.wait("document.querySelector('[data-memory-retry]')");
  assert.equal(await page.evaluate("document.querySelector('[data-memory-import]').files.length"), 0);
  await writeFile(file, JSON.stringify({ ...pack, entries: [] }));
  await page.fill("[data-memory-filter=query]", "其他内容");
  await page.click("[data-memory-retry]"); await page.wait("document.querySelector('[data-memory-retries]').hidden");
  assert.equal(calls.length, 2); assert.deepEqual(calls[0]!.body.package, pack);
  assert.deepEqual(calls[1]!.body, calls[0]!.body, "retry does not reread the file or create another import operation");
  assert.notEqual(calls[1]!.key, calls[0]!.key);
  const status = await page.evaluate<string>("document.querySelector('[data-settings-toast]').textContent");
  assert.match(status, /导入 1/); assert.match(status, /跳过 1/); assert.match(status, /没有导入 1/);
  assert.doesNotMatch(status, /这次操作已完成/);
});

// M3 classification correction: protocol fixtures isolate the page's decision; SDK authority is tested separately.
test("Memory text editing preserves null and unknown classification values instead of silently replacing them", { timeout: 60_000 }, async t => {
  const f = await open(t, () => ({ body: {} })); if (!f) return;
  const cases = [null, { scenes: ["common", "future-scene"], lifecycle: "long-term" }, { scenes: ["common"], lifecycle: "future-lifecycle" }];
  for (const [index, classification] of cases.entries()) {
    f.overview.items[0]!.classification = classification;
    await f.reset();
    await f.page.click(item() + " " + textButton("修改"));
    await f.page.click(item() + " .memory-origin summary");
    const shown = await f.page.evaluate<string>(`document.querySelector('${item()} .memory-origin').textContent`);
    assert.ok(shown.includes(classification?.lifecycle === "future-lifecycle" ? "future-lifecycle" : classification ? "future-scene" : "未归类"));
    await f.page.fill(item() + " textarea", "保留未知分类的正文修改");
    await f.page.click(item() + " button[type=submit]");
    await f.page.wait("!document.querySelector('[data-memory-id=active] textarea')");
    assert.equal(f.calls.length, index + 1);
    const body: Request["body"] = f.calls.at(-1)!.body;
    assert.equal(body.action, "update"); assert.equal(body.text, "保留未知分类的正文修改"); assert.equal(body.expected_version, 7);
    assert.equal(Object.hasOwn(body, "classification"), false); assert.equal(Object.hasOwn(body, "expires_at"), false);
    assert.equal(await f.page.evaluate("Boolean(document.querySelector('.memory-confirm'))"), false);
  }
});

test("Memory explicitly replacing unknown classification values names them before confirmation", { timeout: 45_000 }, async t => {
  const f = await open(t, () => ({ body: {} })); if (!f) return;
  f.overview.items[0]!.classification = { scenes: ["common", "future-scene"], lifecycle: "future-lifecycle" };
  await f.reset(); await f.page.click(item() + " " + textButton("修改"));
  await f.page.click(item() + " .memory-origin summary");
  await f.page.click(item() + ' .mw-select-picker:has([data-memory-lifecycle]) .mw-select-picker__trigger');
  await f.page.click('.mw-select-picker__menu:popover-open [data-value="long-term"]');
  await f.page.click(item() + " button[type=submit]"); await f.page.wait("document.querySelector('.memory-confirm')");
  const description = await f.page.evaluate<string>("document.querySelector('.memory-confirm').textContent");
  assert.match(description, /原|适用场景/);
  assert.match(description, /将移除未声明的分类值：future-scene、future-lifecycle/);
  await f.page.click(".memory-confirm button:not([data-memory-confirm-yes])");
  assert.equal(f.calls.length, 0);
  assert.ok(await f.page.evaluate(`Boolean(document.querySelector('${item()} textarea'))`));
  await f.page.click(item() + " button[type=submit]"); await f.page.wait("document.querySelector('[data-memory-confirm-yes]')");
  await f.page.click("[data-memory-confirm-yes]"); await f.page.wait("!document.querySelector('[data-memory-id=active] textarea')");
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0]!.body.action, "reclassify");
  assert.deepEqual(f.calls[0]!.body.classification, { scenes: ["common"], lifecycle: "long-term" });
  assert.equal(Object.hasOwn(f.calls[0]!.body, "text"), false);
});

test("Memory classification editing rejects expired and session-bound entries without sending a mutation", { timeout: 60_000 }, async t => {
  const f = await open(t, () => ({ body: {} })); if (!f) return;
  f.overview.items[0]!.expired = true; f.overview.items[0]!.expires_at = "2026-01-01T00:00:00Z";
  f.overview.items[1]!.classification = { scenes: ["common"], lifecycle: "session" };
  for (const [id, reason] of [["active", "已到期"], ["disabled", "可信会话绑定"]]) {
    await f.reset();
    await f.page.click(item(id) + " " + textButton("修改"));
    const picker = item(id) + ' .mw-select-picker:has(select[aria-label="类别"]) .mw-select-picker__trigger';
    await f.page.wait(`document.querySelector(${JSON.stringify(picker)})`);
    await f.page.click(picker);
    await f.page.click('.mw-select-picker__menu:popover-open [data-value="habit"]');
    await f.page.click(item(id) + " button[type=submit]");
    await f.page.wait("!document.querySelector('[data-memory-error]').hidden");
    assert.ok((await f.page.evaluate<string>("document.querySelector('[data-memory-error]').textContent")).includes(reason!));
    assert.equal(f.calls.length, 0, "a prohibited reclassification never enters HTTP or a pending retry");
    assert.equal(await f.page.evaluate(`document.querySelector('${item(id)} select[aria-label=类别]').value`), "habit", "the rejected decision remains editable");
    assert.equal(await f.page.evaluate("document.querySelector('[data-memory-retries]').hidden"), true);
  }
});

// Storage is a browser recovery reference, never a completion ledger. Exceptions use the actual Storage boundary.
test("batch storage faults keep the original preview, block unsaved writes and refresh completed forgetting", { timeout: 70_000 }, async t => {
  let applied = 0, completed = false;
  const f = await open(t, call => {
    if (call.path.endsWith("/batch/preview")) return { body: { preview_id: "fixed-storage-preview", action: "remove", items: call.body.items, max_items: 100 } };
    assert.ok(call.path.endsWith("/batch/apply"));
    assert.equal(call.body.preview_id, "fixed-storage-preview"); applied++; completed = true;
    return { body: { preview_id: "fixed-storage-preview", action: "remove", complete: true,
      items: [{ scope: "project", owner: "project", memory_id: "active", expected_version: 7, outcome: "completed", change_id: "original-receipt" }] } };
  });
  if (!f) return;
  const { page } = f, key = "memory-selection:/projects/project/api/memory";
  await page.evaluate(`(() => {
    window.memoryStorageErrors = [];
    addEventListener('error', event => window.memoryStorageErrors.push(event.message));
    addEventListener('unhandledrejection', event => window.memoryStorageErrors.push(String(event.reason)));
    window.memoryStorageSet = Storage.prototype.setItem; window.memoryStorageRemove = Storage.prototype.removeItem;
    Storage.prototype.setItem = function(key, value) { if (key.startsWith('memory-selection:')) throw new DOMException('quota', 'QuotaExceededError'); return window.memoryStorageSet.call(this, key, value); };
  })()`);
  await page.click("[data-memory-id=active] [data-memory-select]");
  await page.click("[data-memory-batch-remove]"); await page.wait("document.querySelector('.memory-confirm[open]')");
  await page.click("[data-memory-confirm-yes]");
  await page.wait("document.querySelector('[data-memory-error]').textContent.includes('尚未开始执行') && !document.querySelector('[data-memory-batch-retry]').disabled");
  assert.equal(applied, 0); assert.equal(completed, false);
  assert.equal(f.calls.filter(call => call.path.endsWith("/batch/preview")).length, 1);
  assert.equal(await page.evaluate(`localStorage.getItem(${JSON.stringify(key)})`), null);
  assert.equal(await page.evaluate("document.querySelector('[data-memory-batch-remove]').disabled"), true);
  await page.evaluate(`(() => {
    Storage.prototype.setItem = window.memoryStorageSet;
    Storage.prototype.removeItem = function(key) { if (key.startsWith('memory-selection:')) throw new DOMException('blocked', 'SecurityError'); return window.memoryStorageRemove.call(this, key); };
  })()`);
  // A failed abandon must retain the same in-page preview, before any mutation.
  await page.click("[data-memory-selection-reset]");
  await page.wait("document.querySelector('[data-memory-error]').textContent.includes('本次操作仍保留')");
  assert.equal(await page.evaluate("document.querySelector('[data-memory-batch-retry]').hidden"), false); assert.equal(applied, 0);
  // The protocol owner removes the body only when apply succeeds; the following overview must project that result.
  const original = f.overview.items;
  Object.defineProperty(f.overview, "items", { get: () => completed ? original.filter(item => item.memory_id !== "active") : original });
  await page.click("[data-memory-batch-retry]");
  await page.wait("document.querySelector('[data-memory-batch-status]').textContent.includes('引用未能清理') && !document.querySelector('[data-memory-id=active]') && !document.querySelector('[data-memory-batch-retry]').disabled");
  assert.equal(applied, 1); assert.equal(completed, true);
  assert.doesNotMatch(await page.evaluate<string>("document.querySelector('[data-memory-settings]').textContent"), /记忆 active/);
  assert.deepEqual(JSON.parse(await page.evaluate<string>(`localStorage.getItem(${JSON.stringify(key)})`)), { preview_id: "fixed-storage-preview", action: "remove" });
  assert.deepEqual(await page.evaluate("window.memoryStorageErrors"), []);
  await page.evaluate("Storage.prototype.removeItem = window.memoryStorageRemove");
  await page.click("[data-memory-batch-retry]");
  await page.wait("document.querySelector('[data-memory-batch-retry]').hidden && document.querySelector('[data-memory-list]').getAttribute('aria-busy') === 'false'");
  assert.equal(applied, 2); assert.equal(f.calls.filter(call => call.path.endsWith("/batch/preview")).length, 1);
  assert.equal(await page.evaluate(`localStorage.getItem(${JSON.stringify(key)})`), null);
  assert.deepEqual(await page.evaluate("window.memoryStorageErrors"), []);
});

test("unreadable batch storage cannot overwrite a previous preview before explicit abandonment", { timeout: 45_000 }, async t => {
  const f = await open(t, () => ({ body: {} })); if (!f) return;
  const key = "memory-selection:/projects/project/api/memory";
  await f.page.evaluate(`localStorage.setItem(${JSON.stringify(key)}, JSON.stringify({preview_id:'original-unread',action:'disable'}))`);
  await f.page.command("Page.enable");
  const { identifier } = await f.page.command<{ identifier: string }>("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.memoryStorageReadProbe = true;
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function(key) { if (key.startsWith('memory-selection:')) throw new DOMException('blocked', 'SecurityError'); return original.call(this, key); };
  ` });
  await f.reset();
  assert.equal(await f.page.evaluate("window.memoryStorageReadProbe === true"), true, "the storage fault must be installed in the new document before Memory initializes");
  await f.page.wait("document.querySelector('[data-memory-batch-status]').textContent.includes('无法读取原预览')");
  assert.equal(await f.page.evaluate("document.querySelector('[data-memory-select]').disabled && document.querySelector('[data-memory-batch-disable]').disabled"), true);
  assert.equal(f.calls.length, 0);
  await f.page.command("Page.removeScriptToEvaluateOnNewDocument", { identifier });
  await f.page.click("[data-memory-selection-reset]");
  await f.page.wait("!document.querySelector('[data-memory-select]').disabled");
  await f.reset();
  assert.equal(await f.page.evaluate(`localStorage.getItem(${JSON.stringify(key)})`), null);
  assert.equal(await f.page.evaluate("document.querySelector('[data-memory-batch-retry]').hidden"), true);
  assert.equal(f.calls.length, 0);
});
