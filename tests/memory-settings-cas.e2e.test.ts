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

const { renderMolisWorkProjectSettingsHub, renderMolisWorkProjectGuidanceSettings, renderMolisWorkSettingsStylesheet } = createLocalHostWorkbenchRenderer(desktopWorkbenchRendererPorts);

// Production renderer + browser client + request helper over real HTTP. The server is a protocol fixture,
// not a substitute for the Service/SDK authority and CAS tests, and never starts a Home or calls a model.
interface Request { path: string; body: Record<string, unknown>; key: string }
const entry = (id: string, version: number, state = "active") => ({ memory_id: id, version, state,
  text: `记忆 ${id}`, kind: "preference", source: "manual", scope: "project", applies: {}, origin: "本人", created_at: "2026-10-23T00:00:00Z" });
async function open(t: TestContext, answer: (request: Request) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>, guidanceFlow = false, section: "memory" | "plugins" = "memory") {
  const chrome = locateTestChrome(); if (!chrome) { t.skip("Chrome is required"); return null; }
  const directory = await mkdtemp(join(tmpdir(), "memory-settings-cas-"));
  const calls: Request[] = [];
  const requests: Array<{method:string;url:string}> = [];
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
  const html = renderMolisWorkProjectSettingsHub(view, { entries: [], inactive_entries: [], revisions: [], virtual_document: "", runtime_prompt_prefix: "" }, [], "", false, section);
  const guidanceHtml = guidanceFlow ? renderMolisWorkProjectGuidanceSettings(view, { entries: [], inactive_entries: [], revisions: [], virtual_document: "", runtime_prompt_prefix: "" }, []) : html;
  const server = createServer(async (request, response) => {
    requests.push({ method: request.method ?? "GET", url: request.url ?? "/" });
    const path = new URL(request.url!, "http://local").pathname;
    if (path.endsWith(".css")) { response.setHeader("content-type", "text/css"); response.end(renderMolisWorkSettingsStylesheet()); return; }
    if (path.endsWith(".js")) { response.setHeader("content-type", "application/javascript"); response.end(); return; }
    if (!path.includes("/api/memory/") && !path.includes("/api/contextual/") && !(section === "plugins" && ["/api/plugin-trust/", "/api/settings/plugin-permissions/", "/api/settings/plugin-project-reach/"].some(prefix => path.includes(prefix)))) { response.setHeader("content-type", "text/html; charset=utf-8"); response.end(guidanceFlow && path.endsWith("/settings/guidance") ? guidanceHtml : html); return; }
    response.setHeader("content-type", "application/json");
    if (path.endsWith("/overview")) { response.end(JSON.stringify(section === "plugins" ? {plugins:[],publishers:[]} : overview)); return; }
    if (section === "plugins" && path.endsWith("/list")) { response.end(JSON.stringify({ plugins: [], capabilities: [], refused: [], project_name: "测试项目" })); return; }
    if (path.endsWith("/history")) { response.end(JSON.stringify({ revisions: [{ version: 2, text: "旧版", at: "2026-10-22T00:00:00Z" }] })); return; }
    let raw = ""; for await (const chunk of request) raw += chunk;
    const call = { path, body: JSON.parse(raw || "{}"), key: String(request.headers["x-molis-work-idempotency-key"] || "") }; calls.push(call);
    const result = await answer(call); response.statusCode = result.status ?? 200; response.end(JSON.stringify(result.body));
  });
  let browser: ChromeHarness | undefined;
  t.after(async () => { await browser?.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  browser = await ChromeHarness.start(directory, { executable: chrome });
  const page = await browser.page(); await page.viewport(1200, 1000);
  const reset = async () => { await page.command("Page.navigate", { url: `http://127.0.0.1:${address.port}/?visit=${calls.length}` }); await page.wait(section === "plugins" ? "document.querySelector('[data-plugin-trust-settings][data-plugin-trust-bound=\"1\"]')" : "document.querySelector('[data-memory-id=active]')"); };
  await reset();
  return { page, calls, reset, overview, directory, requests, browser };
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
  let firstClearStarted!: () => void, releaseClear!: () => void;
  const clearStarted = new Promise<void>(resolve => { firstClearStarted = resolve; });
  const clearReply = new Promise<void>(resolve => { releaseClear = resolve; });
  t.after(releaseClear);
  const f = await open(t, async call => {
    if (call.path.endsWith("/preview")) return { body: { count: 4, fingerprint: `fixed-${++previews}` } };
    if (call.path.endsWith("/clear")) {
      clears++;
      if (clears === 1) {
        firstClearStarted(); await clearReply;
        return { body: { removed: 1, complete: false, items: [
          { memory_id: "a", outcome: "completed" }, { memory_id: "b", outcome: "conflict" },
          { memory_id: "c", outcome: "unknown" }, { memory_id: "d", outcome: "not-executed" }] } };
      }
      if (clears === 2 || clears === 4) return { status: 503, body: { error: "结果待核对", code: "memory.conflict" } };
      return { body: { removed: 4, complete: true, items: ["a", "b", "c", "d"].map(memory_id => ({ memory_id, outcome: "completed" })) } };
    }
    return { body: {} };
  }); if (!f) return;
  const { page, calls } = f;
  await page.click("[data-memory-clear]"); await page.wait("document.querySelector('[data-memory-confirm-yes]')"); await page.click("[data-memory-confirm-yes]");
  await clearStarted;
  const pending = await page.evaluate<string>("document.querySelector('[data-memory-clear-status]').textContent");
  assert.match(pending, /尚未完成/);
  assert.doesNotMatch(pending, /已删除|版本冲突|结果未知|尚未执行/, "the pending reply cannot report detailed outcomes yet");
  assert.equal(clears, 1);
  releaseClear();
  await page.wait("document.querySelector('[data-memory-clear-status]')?.textContent.includes('版本冲突')");
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
  assert.equal(await page.evaluate("document.activeElement?.hasAttribute('data-memory-clear')"), true, "the hidden reset button hands focus to the visible clear button");
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

test("D0194/D0224 the confirm dialog returns focus: Escape to the row's more button, a gone trigger to the add button, and never stealing focus", { timeout: 90_000 }, async t => {
  // Each confirmed delete's reply is held on the server. Both hold pairs are allocated before any request exists —
  // the handler only resolves arrival on its own pair and opens its own gate — so the awaiting side never reads an
  // unallocated slot, and a gate is released only after the request it pairs with is demonstrably on the server.
  const hold = () => {
    let arrived!: () => void, release!: () => void;
    return {
      onArrival: new Promise<void>(resolve => { arrived = resolve; }),
      gate: new Promise<void>(resolve => { release = resolve; }),
      arrived: () => arrived(),
      release: () => release(),
    };
  };
  const [first, second] = [hold(), hold()];
  let deletions = 0;
  const f = await open(t, async call => {
    if (call.path.endsWith("/change") && call.body.action === "remove") {
      const active = deletions === 0 ? first : second;
      deletions += 1;
      active.arrived();
      await active.gate;
      return { body: {} };
    }
    return { body: {} };
  }); if (!f) return;
  const { page } = f;
  const pressEscape = async () => {
    await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await page.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  };
  const menuDelete = async (id: string) => {
    await page.click(item(id) + " summary[aria-label^=更多操作]");
    await page.evaluate(`document.querySelector('${item(id)} .memory-menu').querySelectorAll('button').forEach(button => { if (button.textContent === '删除') button.dataset.chosenDelete = '1'; })`);
    await page.click("[data-chosen-delete]");
    await page.wait("document.querySelector('[data-memory-confirm-yes]')");
  };
  const focusEvidence = "(() => { const node = document.activeElement; if (!node) return null; const fold = node.closest('details');"
    + " return { tag: node.tagName, label: node.getAttribute?.('aria-label'), open: fold ? fold.open : null, rects: node.getClientRects?.().length ?? 0 }; })()";

  // The delete ask names the memory inside one translated sentence (D0224), and Escape hands focus to the row's more
  // button (D0194): the menu item it opened from is hidden once the menu closes, so the more button is what comes back.
  await menuDelete("active");
  assert.match(await page.evaluate<string>("document.querySelector('.memory-confirm header p').textContent"), /「记忆 active」/);
  await pressEscape();
  try {
    await page.wait(`document.activeElement?.tagName === 'SUMMARY' && (document.activeElement.getAttribute('aria-label') || '').startsWith('更多操作')`);
  } catch (error) {
    const evidence = await page.evaluate<Record<string, unknown> | null>(focusEvidence);
    throw new Error(`focus did not return to the row's more button, activeElement: ${JSON.stringify(evidence)}`, { cause: error });
  }

  // While the confirmed delete's repaint is still in flight, focus the person has already moved somewhere visible is never taken.
  await menuDelete("active");
  await page.click("[data-memory-confirm-yes]");
  await page.wait("!document.querySelector('.memory-confirm')");
  await first.onArrival;
  await page.evaluate("document.querySelector('[data-memory-export]').focus()");
  f.overview.items = f.overview.items.filter(one => one.memory_id !== "active");
  first.release();
  await page.wait("!document.querySelector('[data-memory-id=active]')");
  assert.equal(await page.evaluate("document.activeElement?.hasAttribute('data-memory-export')"), true, "focus the person moved stays put");

  // A confirmed delete repaints the list and takes the row's more button away: focus lands on the page's add button.
  await menuDelete("disabled");
  await page.click("[data-memory-confirm-yes]");
  await page.wait("!document.querySelector('.memory-confirm')");
  await second.onArrival;
  f.overview.items = f.overview.items.filter(one => one.memory_id !== "disabled");
  second.release();
  await page.wait("document.activeElement?.hasAttribute('data-memory-add')");
});


test("D0225 memory promotion navigates with only an opaque reference, fills an unsaved guidance draft and removes the reference before reload", { timeout: 60_000 }, async t => {
  const text = "PRIVATE_DRAFT_&?中文🧪".repeat(40), reference = "one-time-project-guidance-reference";
  let held: string | undefined;
  const f = await open(t, call => {
    if (call.path.endsWith("/draft-reference/issue")) { assert.deepEqual(call.body, { purpose: "project-guidance", text }); held = text; return { body: { reference } }; }
    if (call.path.endsWith("/draft-reference/take")) { assert.deepEqual(call.body, { purpose: "project-guidance", reference }); assert.equal(held, text); held = undefined; return { body: { text } }; }
    return { status: 500, body: { error: "Unexpected mutation" } };
  }, true);
  if (!f) return;
  await f.page.command("Page.enable");
  f.overview.items[0]!.text = text;
  await f.reset();
  await f.page.click(item() + " summary[aria-label^=更多操作]");
  await f.page.evaluate(`document.querySelector('${item()} .memory-menu').querySelectorAll('button').forEach(button=>{if(button.textContent==='升级为项目说明')button.dataset.promoteGuidance='1'})`);
  const navigation = f.browser.event("Page.domContentEventFired");
  await f.page.click("[data-promote-guidance]"); await navigation;
  await f.page.wait("document.querySelector('[data-guidance-form] [name=content]')?.value.startsWith('PRIVATE_DRAFT_')");
  assert.equal(await f.page.evaluate("document.querySelector('[data-guidance-form] [name=content]').value"), text);
  assert.equal(await f.page.evaluate("location.search"), "", "one-time reference is removed from browser history");
  const target = f.requests.find(request => request.method === "GET" && request.url.startsWith("/projects/project/settings/guidance"));
  assert.ok(target);
  const url = new URL(target.url, "http://fixture");
  assert.deepEqual([...url.searchParams.keys()], ["draft_ref"]); assert.equal(url.searchParams.get("draft_ref"), reference);
  assert.ok(f.requests.every(request => !request.url.includes("PRIVATE_DRAFT_") && !request.url.includes(encodeURIComponent(text))));
  assert.deepEqual(f.calls.map(call => call.path), ["/projects/project/api/contextual/draft-reference/issue", "/projects/project/api/contextual/draft-reference/take"], "promotion never auto-saves guidance or mutates the original memory");
  const reloaded = f.browser.event("Page.domContentEventFired"); await f.page.command("Page.reload"); await reloaded;
  await f.page.wait("document.querySelector('[data-guidance-form]')");
  assert.equal(await f.page.evaluate("document.querySelector('[data-guidance-form] [name=content]').value"), "");
  assert.equal(f.calls.length, 2, "reload cannot consume or restore the one-time draft again");
});

// D0246/D0247: production settings renderer and client, with the install action response as a protocol fixture.
test("D0246/D0247 installation review reveals the full signed body as inert text before confirmation", { timeout: 40_000 }, async t => {
  const excerpt = "🙂".repeat(200);
  const body = excerpt + '<img src="/injected" onerror="globalThis.installInjected=true"> signed tail';
  const f = await open(t, call => {
    assert.ok(call.path.endsWith("/install/preview"), `review must not confirm installation: ${call.path}`);
    return { body: { preview_id: "review", name: "审阅测试", runtime_scope: "project", publisher: { key_id: "test-key", pinned_label: "测试发布者" },
      preview: { plugin_id: "example.review", version: "1.0.0", permissions: [], jobs: [] }, skills: [], effects: {},
      agent_bodies: [{ kind: "role", name: "签名角色", change: "changed", excerpt, body, truncated: true, total_chars: Array.from(body).length }] } };
  }, false, "plugins");
  if (!f) return;
  const file = join(f.directory, "plugin.json"); await writeFile(file, JSON.stringify({ fixture: "signed package protocol" }));
  const doc = await f.page.command<{root:{nodeId:number}}>("DOM.getDocument");
  const input = await f.page.command<{nodeId:number}>("DOM.querySelector", {nodeId:doc.root.nodeId, selector:"[data-plugin-trust-pick]"});
  await f.page.command("DOM.setFileInputFiles", {nodeId:input.nodeId, files:[file]});
  await f.page.wait("document.querySelector('.plugin-trust-agent-body details')");
  assert.equal(await f.page.evaluate("document.querySelector('.plugin-trust-agent-body > pre').textContent"), excerpt);
  assert.match(await f.page.evaluate<string>("document.querySelector('.plugin-trust-agent-body').textContent"), /正文已截断/);
  assert.equal(await f.page.evaluate("document.querySelector('.plugin-trust-agent-body details').open"), false);
  await f.page.click(".plugin-trust-agent-body summary");
  assert.equal(await f.page.evaluate("document.querySelector('.plugin-trust-agent-body details').open"), true);
  assert.equal(await f.page.evaluate("document.querySelector('.plugin-trust-agent-body details pre').textContent"), body);
  assert.equal(await f.page.evaluate("Boolean(document.querySelector('.plugin-trust-agent-body img') || globalThis.installInjected)"), false);
  assert.equal(f.requests.some(r => r.url.includes("injected")), false);
  assert.equal(f.calls.length, 1, "opening full text makes no install request");
});
