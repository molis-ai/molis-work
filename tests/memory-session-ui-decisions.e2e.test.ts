import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ChromeHarness, locateTestChrome, type ChromePage } from "@molis-ai/molis-work-test-kit/browser";
import { createLocalHostWorkbenchRenderer } from "@molis-ai/molis-work-app-local-host";
import { desktopWorkbenchRendererPorts } from "@molis-ai/molis-work-app-desktop";
import type { MolisWorkWebView } from "./workbench-renderer-fixture.js";
import type { FeedSnapshot } from "@molis-ai/molis-work-plugin-feed";

const { renderMolisWorkProjectSettingsHub, renderMolisWorkSettingsStylesheet } = createLocalHostWorkbenchRenderer(desktopWorkbenchRendererPorts);
type Scope = "personal" | "project";
interface Call { path: string; body: Record<string, unknown> }
const memory = (scope: Scope) => ({ memory_id: scope + "-formal", version: 7, scope, state: "active", kind: "preference", text: scope + " 原正式记忆",
  classification: { scenes: ["coding"], lifecycle: "session" }, expires_at: null as string | null, expired: false, applies: {}, source: "manual", origin: "本人", created_at: null });
const projection = (scope: Scope) => ({ items: [memory(scope)], candidates: [
  { candidate_id: scope + "-candidate", version: 13, text: scope + " 待审建议", kind: "preference" },
  { candidate_id: scope + "-editing", version: 17, text: scope + " 改写中的建议", kind: "preference" }],
  total: { kind: "exact", value: 1 }, exhausted: true, cursor: null, changes: [], pairs: [], prefs: {}, counts: {}, scanned: "unknown", cost: {} });

// The production settings renderer, binder and request helper in a real DOM. This is a UI decision test over a protocol
// fixture, not Host/SDK persistence or product-journey evidence. No Home or model is started.
async function open(t: TestContext, sessionMode = true) {
  const executable = locateTestChrome(); assert.ok(executable, "Chrome is required for the Memory binder DOM checks");
  const directory = await mkdtemp(join(tmpdir(), "memory-session-decisions-"));
  const calls: Call[] = [], projections = { personal: projection("personal"), project: projection("project") };
  let held: { scope: Scope; entered: ReturnType<typeof Promise.withResolvers<void>>; release: ReturnType<typeof Promise.withResolvers<boolean>> } | undefined;
  let failWrites = false;
  const project = { project_id: "project", display_name: "UI 决定检查" };
  const view: MolisWorkWebView & { feed: FeedSnapshot } = {
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
    assert.ok(path.startsWith(sessionMode ? "/projects/project/api/memory/sessions/coding/business/" : "/projects/project/api/memory/"), "all binder requests use the selected management target");
    response.setHeader("content-type", "application/json");
    if (path.endsWith("/operations")) { response.end(JSON.stringify({ items: [], exhausted: true })); return; }
    if (path.endsWith("/overview") || path.endsWith("/page")) {
      const scope = (url.searchParams.get("scope") || JSON.parse(url.searchParams.get("input") || "{}").scope) as Scope;
      if (held?.scope === scope) {
        const gate = held; gate.entered.resolve(); const success = await gate.release.promise; if (held === gate) held = undefined;
        if (!success) { response.statusCode = 503; response.end(JSON.stringify({ error: "新范围读取失败" })); return; }
      }
      const current = projections[scope];
      response.end(JSON.stringify(path.endsWith("/overview") ? current : { items: current.items, total: current.total, exhausted: true, cursor: null, scanned: "unknown", cost: {} })); return;
    }
    let raw = ""; for await (const chunk of request) raw += chunk;
    calls.push({ path, body: JSON.parse(raw || "{}") });
    response.statusCode = failWrites ? 409 : 200;
    response.end(JSON.stringify(failWrites ? { code: "memory.conflict", error: "保留原决定以供重试" } : {}));
  });
  let browser: ChromeHarness | undefined;
  t.after(async () => { held?.release.resolve(false); await browser?.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  browser = await ChromeHarness.start(directory, { executable }); const page = await browser.page(); await page.viewport(1440, 1100);
  const reset = async () => {
    await page.command("Page.navigate", { url: `http://127.0.0.1:${address.port}/?${sessionMode ? "memory_session_kind=coding&memory_session_id=business&" : ""}visit=${calls.length}` });
    await ready(page); await page.wait("document.querySelector('[data-memory-id=project-formal]')");
  };
  await reset();
  return { page, calls, projections, reset, failWrites: (value: boolean) => { failWrites = value; },
    hold(scope: Scope) { const gate = { scope, entered: Promise.withResolvers<void>(), release: Promise.withResolvers<boolean>() }; held = gate; return gate; } };
}
const ready = (page: ChromePage) => page.wait("document.querySelector('[data-memory-list]')?.getAttribute('aria-busy') === 'false' && document.querySelector('[data-memory-error]').hidden");
async function choose(page: ChromePage, selector: string, value: string) {
  await page.evaluate(`(() => { const control = document.querySelector(${JSON.stringify(selector)}); control.value = ${JSON.stringify(value)}; control.dispatchEvent(new Event('change', {bubbles:true})); })()`);
}
const row = (scope: Scope) => `[data-memory-id=${scope}-formal]`;
const candidate = "[data-memory-candidates]";
const actionable = `(node) => Boolean(node && node.isConnected && node.checkVisibility() && !node.disabled && !node.closest('[inert]'))`;

// MEM-08/28: the row describes its real Session restriction even outside a Session page; task conditions remain additional limits.
test("Memory applicability text retains Session restriction and conditions while ordinary memories keep their original scope description", { timeout: 90_000 }, async t => {
  const f = await open(t, false), { page } = f;
  for (const one of [
    { lifecycle: "session", applies: {}, expected: "适用：会话内" },
    { lifecycle: "session", applies: { task: "写周报时" }, expected: "适用：会话内 · 写周报时" },
    { lifecycle: "long-term", applies: {}, expected: "适用：这个项目的所有工作" },
    { lifecycle: "short-term", applies: { task: "写周报时" }, expected: "适用：写周报时" },
  ]) {
    const item = f.projections.project.items[0]!; item.classification.lifecycle = one.lifecycle; item.applies = one.applies;
    await f.reset();
    const descriptions = await page.evaluate<string[]>(`[...document.querySelectorAll('${row("project")} .memory-meta span')].map(node => node.textContent).filter(text => text.startsWith('适用：'))`);
    assert.deepEqual(descriptions, [one.expected]);
  }
});

// Cancellation and the original version are asserted independently from the fixture's reply.
// MEM-28/29: expanding a Session's lifecycle or expiry requires confirmation of the original CAS decision.
test("Session promotion asks before long/short-term reclassification and keeps the chosen expiry and original CAS", { timeout: 90_000 }, async t => {
  const f = await open(t), { page, calls } = f;
  const future = new Date(Date.now() + 86_400_000).toISOString(), chosen = new Date(Date.now() + 172_800_000); chosen.setMilliseconds(0);
  const local = `${chosen.getFullYear()}-${String(chosen.getMonth() + 1).padStart(2, "0")}-${String(chosen.getDate()).padStart(2, "0")}T${String(chosen.getHours()).padStart(2, "0")}:${String(chosen.getMinutes()).padStart(2, "0")}:${String(chosen.getSeconds()).padStart(2, "0")}`;
  for (const one of [
    { lifecycle: "long-term", expiry: null, set: false }, { lifecycle: "long-term", expiry: future, set: false },
    { lifecycle: "short-term", expiry: future, set: false }, { lifecycle: "short-term", expiry: null, set: true },
  ]) {
    f.projections.project.items[0]!.expires_at = one.expiry; await f.reset(); const at = calls.length;
    await page.click(row("project") + " button[aria-label^=修改]");
    await page.click(row("project") + " .memory-origin summary");
    await choose(page, "[data-memory-lifecycle]", one.lifecycle);
    if (one.set) { await choose(page, "[data-memory-expiry]", "set"); await page.evaluate(`document.querySelector('[data-memory-expires-at]').value = ${JSON.stringify(local)}`); }
    await page.click(row("project") + " button[type=submit]");
    await page.wait("document.querySelector('[data-memory-confirm-yes]') || !document.querySelector('[data-memory-id=project-formal] textarea')");
    assert.equal(calls.length, at, "saving an expansion must wait for confirmation");
    assert.match(await page.evaluate<string>("document.querySelector('dialog.memory-confirm').textContent"), /会话内.*→.*长期|会话内.*→.*短期/);
    await page.click("dialog.memory-confirm button:not([data-memory-confirm-yes])");
    await page.wait("!document.querySelector('dialog.memory-confirm')"); assert.equal(calls.length, at, "cancelling submits nothing");
    await page.click(row("project") + " button[type=submit]"); await page.wait("document.querySelector('[data-memory-confirm-yes]')");
    await page.click("[data-memory-confirm-yes]"); await page.wait("!document.querySelector('[data-memory-id=project-formal] textarea')"); await ready(page);
    assert.equal(calls.length, at + 1, "one confirmed decision sends one request");
    const call = calls.at(-1)!; assert.ok(call.path.endsWith("/change"));
    assert.equal(call.body.action, "reclassify"); assert.equal(call.body.memory_id, "project-formal"); assert.equal(call.body.expected_version, 7);
    assert.deepEqual(call.body.classification, { scenes: ["coding"], lifecycle: one.lifecycle });
    if (one.set) assert.equal(call.body.expires_at, chosen.toISOString());
    else assert.equal(Object.hasOwn(call.body, "expires_at"), false, "keeping an expiry leaves it unchanged on the original version");
  }
});

// MEM-08/17: pending or failed scope reads withdraw old lists/editors while explicit retries retain the original request.
test("Session scope changes withdraw old formal/candidate editors during reads and failures without rebinding pending decisions", { timeout: 90_000 }, async t => {
  const f = await open(t), { page, calls } = f;
  for (const [from, to] of [["project", "personal"], ["personal", "project"]] as const) {
    if (from === "personal") { await choose(page, "[data-memory-scope-choice]", from); await ready(page); }
    f.failWrites(true);
    await page.click(candidate + " button[aria-label^=记住]"); await page.wait("document.querySelector('[data-memory-retry]')");
    const original = structuredClone(calls.at(-1)!); f.failWrites(false);
    await page.click(row(from) + " button[aria-label^=修改]");
    await page.click(candidate + " li:nth-child(2) .memory-actions button:nth-child(2)");
    const gate = f.hold(to), at = calls.length;
    await choose(page, "[data-memory-scope-choice]", to); await gate.entered.promise;
    const oldUi = () => page.evaluate(`(() => {
      const enabled = ${actionable};
      return [...document.querySelectorAll('[data-memory-list] button, [data-memory-list] textarea, [data-memory-candidates] button, [data-memory-candidates] textarea, [data-memory-new] textarea')].filter(enabled).length;
    })()`);
    assert.equal(await oldUi(), 0, "old accept/reword/discard and formal editors are withdrawn before the new read settles");
    assert.equal(calls.length, at);
    gate.release.resolve(false); await page.wait("!document.querySelector('[data-memory-error]').hidden && document.querySelector('[data-memory-list]').getAttribute('aria-busy') === 'false'");
    assert.equal(await oldUi(), 0, "a failed new read cannot reopen the old scope's decisions");
    assert.equal(calls.length, at);
    await page.click("[data-memory-reload]"); await ready(page);
    assert.equal(await page.evaluate(`document.querySelectorAll('${row(to)}').length`), 1);
    assert.equal(await page.evaluate(`document.querySelector('${candidate}').textContent.includes(${JSON.stringify(to + " 待审建议")})`), true);
    await page.click("[data-memory-retry]"); await page.wait("!document.querySelector('[data-memory-retry]')"); await ready(page);
    assert.deepEqual(calls.at(-1), original, "an explicit retry retains the old candidate id/version/body and protected target after a scope change");
  }
});
