import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ChromeHarness, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import { createLocalHostWorkbenchRenderer } from "@molis-ai/molis-work-app-local-host";
import { desktopWorkbenchRendererPorts } from "@molis-ai/molis-work-app-desktop";
import type { MolisWorkWebView } from "./workbench-renderer-fixture.js";
import type { FeedSnapshot } from "@molis-ai/molis-work-plugin-feed";
import type { MemoryExportPackage } from "@molis-ai/molis-work-contracts/services/memory";

const { renderMolisWorkProjectSettingsHub, renderMolisWorkSettingsStylesheet } = createLocalHostWorkbenchRenderer(desktopWorkbenchRendererPorts);

// Production renderer + browser client + request helper over real HTTP. The server is a protocol fixture,
// not a substitute for the Service/SDK authority and CAS tests, and never starts a Home or calls a model.
interface Request { path: string; body: Record<string, unknown>; key: string }
const entry = (id: string, version: number, state = "active") => ({ memory_id: id, version, state,
  text: `记忆 ${id}`, kind: "preference", source: "manual", scope: "project", applies: {}, origin: "本人", created_at: "2026-10-23T00:00:00Z" });
async function open(t: TestContext, answer: (request: Request) => { status?: number; body: unknown }) {
  const chrome = locateTestChrome(); if (!chrome) { t.skip("Chrome is required"); return null; }
  const directory = await mkdtemp(join(tmpdir(), "memory-settings-cas-"));
  const calls: Request[] = [];
  const overview = { items: [entry("active", 7), entry("disabled", 11, "disabled"), entry("paused", 19, "paused")],
    candidates: [{ candidate_id: "proposal", version: 13, text: "建议", kind: "preference" }], changes: [], pairs: [], prefs: {}, counts: { project: 3 } };
  const project = { project_id: "project", display_name: "测试项目" };
  const view: MolisWorkWebView & { feed: FeedSnapshot } = {
    snapshot: { board: { project_id: "project", active_goal_id: null, created_at: "2026-10-23T00:00:00Z", updated_at: "2026-10-23T00:00:00Z" },
      cursor: 0, goals: [], relations: [], goal_tree_proposals: [], planning_method_packs: [], project_guidance: [] },
    project, projects: [project], route_prefix: "/projects/project", demo: false, active_goal_id: null, goals: [], archived_goals: [], trashed_goals: [],
    counts: { waiting_for_human: 0, executing: 0, execution_blocked: 0, execution_pending: 0, satisfied: 0, invalidated: 0, trashed: 0, archived: 0 },
    input_bindings: [], policy_bindings: [], events: [], feed: { sources: [], feed_items: [], inbox_entries: [], runs: [], out_rules: [] },
  };
  const html = renderMolisWorkProjectSettingsHub(view, { entries: [], inactive_entries: [], revisions: [], virtual_document: "", runtime_prompt_prefix: "" }, [], "", false, "memory");
  const server = createServer(async (request, response) => {
    const path = new URL(request.url!, "http://local").pathname;
    if (path.endsWith(".css")) { response.setHeader("content-type", "text/css"); response.end(renderMolisWorkSettingsStylesheet()); return; }
    if (path.endsWith(".js")) { response.setHeader("content-type", "application/javascript"); response.end(); return; }
    if (!path.includes("/api/memory/")) { response.setHeader("content-type", "text/html; charset=utf-8"); response.end(html); return; }
    response.setHeader("content-type", "application/json");
    if (path.endsWith("/overview")) { response.end(JSON.stringify(overview)); return; }
    if (path.endsWith("/history")) { response.end(JSON.stringify({ revisions: [{ version: 2, text: "旧版", at: "2026-10-22T00:00:00Z" }] })); return; }
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
  const reset = async () => { await page.command("Page.navigate", { url: `http://127.0.0.1:${address.port}/?visit=${calls.length}` }); await page.wait("document.querySelector('[data-memory-id=active]')"); };
  await reset();
  return { page, calls, reset, overview, directory };
}
const item = (id = "active") => `[data-memory-id=${id}]`;
const textButton = (label: string) => `button[aria-label^="${label}："]`;

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
  const pack: MemoryExportPackage = { format: "molis.memory", version: 1, exported_at: "2026-10-23T00:00:00Z", scope: "project", redactions: [],
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
