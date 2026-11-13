import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ChromeHarness, locateTestChrome, type ChromePage } from "@molis-ai/molis-work-test-kit/browser";
import { grantMcpAction, isLocalHostHttpError } from "@molis-ai/molis-work-test-kit/local-host-http";
import { ensureSystemAgentService, MolisWorkLocalHost, workspaceRefFor } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import { inspectMemoryForgetting } from "@molis-ai/molis-work-storage";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentReviewRequest, AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { MEMORY_PROVIDER_ID, memoryActions, type MemoryCandidate, type MemoryHistoryResponse, type MemoryItem, type MemoryManagementItem, type MemoryPageResponse, type MemorySessionClearPreview, type MemorySessionClearResult, type MemoryWriteResult } from "@molis-ai/molis-work-contracts/services/memory";
import { codingProductHost, type CodingProviderRequest } from "./fixtures/coding-product-host.js";
import { cogniaModelResponse, cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";
import { toolField, untilSetup } from "./fixtures/connector-assistant-model.js";
import { endingReviewAnswer } from "./fixtures/ending-review.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { CODING_OPEN, codingAdd } from "./fixtures/coding-composer.js";
import { serveTestHost } from "./fixtures/test-home.js";

type Product = Awaited<ReturnType<typeof codingProductHost>>;
type Scope = "personal" | "project";
interface Target { kind: "coding" | "assistant"; id: string; project: string | null }
interface SeenRequest { path: string; method: string; body: Record<string, unknown> | null; rawBody: string | null; requestId: string; mainPage: boolean }
interface SeenResponse { path: string; requestId: string; status: number }
const coding = "/api/plugins/io.molis.work.coding";
const active = "[data-session-memory-active]";
const row = (id: string) => `${active} [data-memory-id="${id}"]`;
const protectedBase = (target: Target) => (target.project ? "/projects/" + encodeURIComponent(target.project) : "")
  + "/api/memory/sessions/" + target.kind + "/" + encodeURIComponent(target.id);
const settingsPath = (target: Target) => (target.project ? "/projects/" + encodeURIComponent(target.project) : "")
  + "/settings/memory?memory_session_kind=" + target.kind + "&memory_session_id=" + encodeURIComponent(target.id);

async function product(t: TestContext) {
  return codingProductHost(t, request => cogniaModelResponse(endingReviewAnswer(request, () => []) ?? "已核对，不更改文件。"), { loopbackProvider: true });
}
async function codingWork(f: Product, title: string): Promise<Target> {
  const created = await f.call<{ session: { session_id: string } }>(f.project.project_id, coding + "/sessions", { title });
  assert.equal(created.status, 200, JSON.stringify(created.body)); const id = created.body.session.session_id;
  const started = await f.call<{ run: { ref: AgentRunRef } }>(f.project.project_id, coding + `/sessions/${id}/runs`, {
    task: "检查当前目录，不改文件。", intent: "discuss", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model",
  });
  assert.equal(started.status, 200, JSON.stringify(started.body)); assert.equal((await f.ended(started.body.run.ref)).phase, "completed");
  return { kind: "coding", id, project: f.project.project_id };
}
async function assistantWork(f: Product, project: string | null, text: string): Promise<Target> {
  const prefix = project ? "/projects/" + encodeURIComponent(project) : "";
  const sent = await f.web.post<AssistantSendResult>(prefix + "/api/assistant/send", { text, request_id: randomUUID() });
  await untilSetup(async () => {
    const view = await f.web.get<AssistantWorkView>(prefix + "/api/assistant/works/" + encodeURIComponent(sent.work.work_id));
    assert.notEqual(view.work.state, "failed", JSON.stringify(view.work)); return view.work.state === "completed" ? view : undefined;
  }, "the actual Assistant Run completes");
  return { kind: "assistant", id: sent.work.work_id, project };
}
async function write(f: Product, target: Target | null, scope: Scope, text: string, expires_at: string | null = null, project = f.project.project_id): Promise<MemoryItem> {
  const base = target ? protectedBase(target) : "/projects/" + encodeURIComponent(project) + "/api/memory";
  const saved = await f.web.post<MemoryWriteResult>(base + "/items", { scope, text, kind: "preference", expires_at,
    classification: { scenes: [target?.kind ?? "common"], lifecycle: target ? "session" : "long-term" }, operation_id: randomUUID() });
  assert.equal(saved.outcome, "written", JSON.stringify(saved)); assert.ok(saved.memory); return saved.memory;
}
const pageFor = (f: Product, target: Target | null, scope: Scope, project = f.project.project_id) => f.web.get<MemoryPageResponse>(
  (target ? protectedBase(target) : "/projects/" + encodeURIComponent(project) + "/api/memory")
  + "/page?input=" + encodeURIComponent(JSON.stringify({ scope })));

function closeChromeBeforeHost(t: TestContext) {
  let close: (() => Promise<void>) | undefined;
  t.after(async () => { await close?.(); });
  return (dispose: () => Promise<void>) => { close = dispose; };
}
async function browserFor(t: TestContext, f: Product, registerChrome: (dispose: () => Promise<void>) => void) {
  const executable = locateTestChrome(); assert.ok(executable, "Chrome is required for the real Session-management journey");
  const directory = await mkdtemp(join(tmpdir(), "memory-session-management-browser-"));
  const browser = await ChromeHarness.start(directory, { executable, extraArgs: ["--use-mock-keychain", "--password-store=basic"] });
  registerChrome(() => browser.close());
  t.after(async () => { await browser.close(); await rm(directory, { recursive: true, force: true }); });
  const page = await browser.page();
  const { windowId } = await page.command<{ windowId: number }>("Browser.getWindowForTarget", { targetId: page.targetId });
  await page.command("Browser.setWindowBounds", { windowId, bounds: { width: 1440, height: 1100 } }); await page.viewport(1440, 1100);
  let origin = f.web.origin;
  const requests: SeenRequest[] = [], responses: SeenResponse[] = [];
  const finished = new Set<string>();
  t.after(browser.on("Network.requestWillBeSent", (params, sessionId) => {
    const request = params.request as { url: string; method: string; postData?: string };
    const url = new URL(request.url); if (url.origin !== origin) return;
    requests.push({ path: url.pathname + url.search, method: request.method, body: request.postData ? JSON.parse(request.postData) : null, rawBody: request.postData ?? null,
      requestId: String(params.requestId), mainPage: sessionId === page.sessionId });
  }));
  t.after(browser.on("Network.responseReceived", (params, sessionId) => {
    const response = params.response as { url: string; status: number }, url = new URL(response.url);
    if (sessionId === page.sessionId && url.origin === origin) responses.push({ path: url.pathname + url.search, requestId: String(params.requestId), status: response.status });
  }));
  t.after(browser.on("Network.loadingFinished", (params, sessionId) => {
    if (sessionId === page.sessionId) finished.add(String(params.requestId));
  }));
  await page.command("Network.enable");
  const frame = await pluginFrameBrowser(t, { command: browser.command.bind(browser), on: browser.on.bind(browser),
    evaluate: page.evaluate.bind(page), sessionId: page.sessionId }, "coding");
  const navigate = async (path: string, nextOrigin = origin) => {
    origin = nextOrigin;
    await page.evaluate("document.documentElement.dataset.sessionJourneyOld = '1'");
    await page.command("Page.navigate", { url: origin + path });
    await page.wait("document.readyState === 'complete' && document.documentElement.dataset.sessionJourneyOld !== '1'");
  };
  return { page, frame, requests, responses, finished, navigate };
}
type Journey = Awaited<ReturnType<typeof browserFor>>;
async function activateMemory(page: ChromePage) {
  await page.wait("[...document.querySelectorAll('[data-memory-settings]')].some(node => node.checkVisibility() && node.querySelector('[data-memory-title]')?.textContent === '本会话记忆')");
  await page.evaluate(`(() => { document.querySelectorAll('${active}').forEach(node => node.removeAttribute('data-session-memory-active'));
    [...document.querySelectorAll('[data-memory-settings]')].find(node => node.checkVisibility()).setAttribute('data-session-memory-active', ''); })()`);
  await ready(page);
  assert.equal(await page.evaluate(`['.memory-prefs','[data-memory-classes]','[data-memory-pairs-section]','[data-memory-changes-section]'].some(selector => [...document.querySelectorAll('${active} '+selector)].some(node => node.checkVisibility()))`), false,
    "a Session view has no global switches or duplicate-management controls");
}
const ready = (page: ChromePage) => page.wait(`document.querySelector('${active} [data-memory-list]')?.getAttribute('aria-busy') === 'false' && document.querySelector('${active} [data-memory-error]').hidden`);
const ids = (page: ChromePage) => page.evaluate<string[]>(`[...document.querySelectorAll('${active} [data-memory-id]')].map(node => node.dataset.memoryId).sort()`);
async function select(page: ChromePage, selector: string, value: string) {
  await page.wait(`document.querySelector(${JSON.stringify(selector)})?.closest('.mw-select-picker')`);
  await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).closest('.mw-select-picker').setAttribute('data-session-journey-picker', '')`);
  await page.click("[data-session-journey-picker] .mw-select-picker__trigger");
  await page.click(`.mw-select-picker__menu:popover-open [data-value="${value}"]`);
  await page.evaluate("document.querySelector('[data-session-journey-picker]')?.removeAttribute('data-session-journey-picker')");
}
async function captureSessionViews(t: TestContext, j: Journey, kind: Target["kind"]) {
  const directory = join("/private/tmp/memory-v0-a4m-ui-20261105/session-management-screenshots-20261105", String(process.pid));
  await mkdir(directory, { recursive: true });
  const observations: Array<{ path: string; width: number; scheme: string; actual: unknown }> = [];
  const { windowId } = await j.page.command<{ windowId: number }>("Browser.getWindowForTarget", { targetId: j.page.targetId });
  try {
    for (const [width, height] of [[1440, 1100], [1024, 1000], [390, 844]]) {
      await j.page.command("Browser.setWindowBounds", { windowId, bounds: { width, height } });
      await j.page.viewport(width!, height!, width === 390);
      await j.page.command("Emulation.setTouchEmulationEnabled", { enabled: width === 390 });
      for (const scheme of ["light", "dark"]) {
        await j.page.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme },
          { name: "prefers-reduced-motion", value: "reduce" }, { name: "pointer", value: width === 390 ? "coarse" : "fine" }] });
        await ready(j.page);
        await j.page.evaluate("document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
        assert.ok((await ids(j.page)).length, "the screenshots use the existing nonempty Session data");
        const path = join(directory, `${kind}@${width}-${scheme}.png`); await j.page.screenshot(path);
        const actual = await j.page.evaluate(`({theme:document.documentElement.dataset.theme, colorScheme:getComputedStyle(document.documentElement).colorScheme,
          background:getComputedStyle(document.body).backgroundColor, width:innerWidth, height:innerHeight,
          visible:document.querySelector('${active}').checkVisibility(), page:location.pathname})`);
        observations.push({ path, width: width!, scheme, actual });
      }
    }
  } finally {
    await j.page.command("Browser.setWindowBounds", { windowId, bounds: { width: 1440, height: 1100 } });
    await j.page.viewport(1440, 1100); await j.page.command("Emulation.setTouchEmulationEnabled", { enabled: false });
    await j.page.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" },
      { name: "prefers-reduced-motion", value: "reduce" }, { name: "pointer", value: "fine" }] });
  }
  const manifest = join(directory, `${kind}-observations.json`); await writeFile(manifest, JSON.stringify(observations, null, 2));
  t.diagnostic("Session page screenshots require visual review: " + manifest);
}
function assertProtectedReads(j: Journey, at: number, target: Target) {
  const reads = j.requests.slice(at).filter(one => one.path.includes("/api/memory/")); assert.ok(reads.length, "the actual page read memory");
  assert.ok(reads.every(one => one.path.startsWith(protectedBase(target) + "/")), JSON.stringify(reads));
  assert.ok(reads[0]!.path.startsWith(protectedBase(target) + "/overview?"), "there is no initial global overview before switching to the business target");
}
async function openCoding(j: Journey, target: Target) {
  assert.equal(target.kind, "coding"); await j.navigate(`/projects/${target.project}/`);
  await j.page.click("[data-plugin-picker-toggle]");
  await j.page.wait("document.querySelector('[data-plugin-picker-popover] [data-plugin-id=coding]')?.checkVisibility()");
  await j.page.click('[data-plugin-picker-popover] [data-plugin-id="coding"]');
  await j.page.wait("document.querySelector('[data-work-surface=coding]')?.dataset.uiClientState === 'ready'");
  await j.frame.waitFor(`document.querySelector('[data-coding-session="${target.id}"]')`);
  await j.frame.click(`[data-coding-session="${target.id}"]`);
  await j.frame.waitFor(`document.querySelector('[data-coding-memory-open]')?.getAttribute('href') === ${JSON.stringify(settingsPath(target))}`);
  // Since one input (#1991) Coding draws no box of its own: its context row opens from the workbench bar's ＋ (`/context`).
  await j.page.wait(CODING_OPEN);
  await j.page.evaluate(codingAdd("context"));
  await j.frame.waitFor("document.querySelector('[data-coding-memory-open]')?.checkVisibility()");
  const at = j.requests.length; await j.frame.click("[data-coding-memory-open]"); await activateMemory(j.page); assertProtectedReads(j, at, target);
}
async function openAssistant(j: Journey, currentProject: string | null, target: Target) {
  assert.equal(target.kind, "assistant"); await j.navigate(currentProject ? `/projects/${currentProject}/` : "/");
  await j.page.wait("document.querySelector('[data-assistant-composer] .mw-composer__input')");
  // An empty send opens the existing work list; it never sends another model request. The unified composer (#1991, UIC-05)
  // sends on ⌘↵ / Ctrl+↵; Enter alone is a new line.
  await j.page.click("[data-assistant-composer] .mw-composer__input");
  const listAt = j.requests.length;
  await j.page.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 2 });
  await j.page.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 2 });
  await j.page.wait("document.querySelector('[data-assistant-panel]')?.checkVisibility()");
  if (await j.page.evaluate("document.querySelector('[data-assistant-works]').hidden")) await j.page.click("[data-assistant-works-toggle]");
  // Opening paints cached rows, then replaces them after the real /works read. Click the completed read's current row.
  await untilSetup(async () => j.requests.slice(listAt).find(one => one.mainPage && one.method === "GET" && one.path.endsWith("/api/assistant/works")
    && j.finished.has(one.requestId) && j.responses.some(response => response.requestId === one.requestId && response.status === 200)), "this page's work-list request started by opening finishes its actual refresh");
  await j.page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await j.page.wait(`document.querySelector('[data-assistant-works] [data-work-id="${target.id}"]')?.checkVisibility()`);
  await j.page.click(`[data-assistant-works] [data-work-id="${target.id}"]`);
  await j.page.wait(`document.querySelector('[data-assistant-memory]')?.getAttribute('href') === ${JSON.stringify(settingsPath(target))}`);
  assert.equal(await j.page.evaluate("location.pathname"), currentProject ? `/projects/${currentProject}/` : "/", "the original page is still the work's viewing context");
  // DOM-only negative control of the actual link handler; cancel default after observing it to avoid opening extra tabs.
  const modifiers = await j.page.evaluate<Array<{ preserved: boolean; unprevented: boolean; href: string }>>(`['metaKey','ctrlKey','shiftKey','altKey'].map(key => {
    const link=document.querySelector('[data-assistant-memory]');let unprevented=false;
    link.addEventListener('click',event=>{unprevented=!event.defaultPrevented;event.preventDefault();},{once:true});
    link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,button:0,[key]:true}));
    return {preserved:document.querySelector('[data-assistant-panel]').checkVisibility(),unprevented,href:link.getAttribute('href')};
  })`);
  assert.deepEqual(modifiers, Array.from({ length: 4 }, () => ({ preserved: true, unprevented: true, href: settingsPath(target) })));
  const at = j.requests.length; await j.page.click("[data-assistant-memory]"); await activateMemory(j.page); assertProtectedReads(j, at, target);
  await j.page.wait("!document.querySelector('[data-assistant-panel]')?.checkVisibility()");
  assert.ok((await j.page.evaluate<string[]>(`[...document.querySelectorAll('${active} [data-memory-id] .memory-meta span')].map(node=>node.textContent).filter(text=>text.startsWith('适用：'))`))
    .every(text => text.includes("会话内") && !text.includes("所有工作")), "the actual nonempty Session rows explain their restriction");
  const expectedProject = target.project ?? currentProject;
  assert.equal(await j.page.evaluate("location.pathname"), expectedProject ? `/projects/${expectedProject}/` : "/",
    "project works use their actual project; personal settings keep the viewing workbench context");
  assert.equal(await j.page.evaluate(`document.querySelector('${active}').closest('[data-settings-source]').dataset.settingsSource`), settingsPath(target),
    "the visible cover retains the exact business kind/id and only the work's actual project in its settings address");
}
async function promote(f: Product, j: Journey, target: Target, item: MemoryItem, lifecycle: "long-term" | "short-term") {
  await j.page.click(row(item.memory_id) + " button[aria-label^=修改]"); await j.page.click(row(item.memory_id) + " .memory-origin summary");
  await select(j.page, row(item.memory_id) + " [data-memory-lifecycle]", lifecycle);
  const writes = () => j.requests.filter(one => one.method === "POST" && one.path === protectedBase(target) + "/change" && one.body?.memory_id === item.memory_id);
  const at = writes().length; await j.page.click(row(item.memory_id) + " button[type=submit]");
  await j.page.wait("document.querySelector('[data-memory-confirm-yes]')"); assert.equal(writes().length, at, "the expansion waits for the person's decision");
  assert.match(await j.page.evaluate<string>("document.querySelector('dialog.memory-confirm').textContent"), /会话内.*→.*长期|会话内.*→.*短期/);
  await j.page.click("dialog.memory-confirm button:not([data-memory-confirm-yes])"); await j.page.wait("!document.querySelector('dialog.memory-confirm')");
  assert.equal(writes().length, at, "cancelling an expansion does not submit");
  await j.page.click(row(item.memory_id) + " button[type=submit]"); await j.page.wait("document.querySelector('[data-memory-confirm-yes]')");
  await j.page.click("[data-memory-confirm-yes]"); await j.page.wait(`!document.querySelector('${row(item.memory_id)}')`); await ready(j.page);
  assert.equal(writes().length, at + 1); const decision = writes().at(-1)!.body!;
  assert.equal(decision.action, "reclassify"); assert.equal(decision.expected_version, item.version); assert.equal(Object.hasOwn(decision, "expires_at"), false);
  const bound = await pageFor(f, target, item.scope as Scope); assert.equal(bound.items.some(one => one.memory_id === item.memory_id), false);
  const global = await pageFor(f, null, item.scope as Scope, target.project ?? f.project.project_id), current = global.items.find(one => one.memory_id === item.memory_id);
  assert.ok(current); assert.deepEqual(current.classification, { scenes: [target.kind], lifecycle });
  assert.equal(current.text, item.text); assert.equal(current.state, item.state); assert.equal(current.expires_at, item.expires_at); assert.ok(current.version > item.version);
}
async function archive(f: Product, target: Target) {
  if (target.kind === "assistant") {
    await f.web.post((target.project ? "/projects/" + target.project : "") + `/api/assistant/works/${target.id}/archive`, { archived: true }); return;
  }
  const project = { project_id: target.project!, storage_key: f.project.database_path };
  await f.host.actionClient(project).invoke(await f.host.localPersonContext(project),
    { capability_id: "coding.sessions.update", version: 1, provider_id: "io.molis.work.coding" }, { session_id: target.id, archive: true });
}
async function refusesArchivedWrite(f: Product, j: Journey, target: Target, item: MemoryItem) {
  await archive(f, target); await j.page.click(active + " [data-memory-reload]"); await ready(j.page);
  assert.ok((await ids(j.page)).includes(item.memory_id), "archive retains the original readable memory");
  await j.page.click(row(item.memory_id) + " button[aria-label^=停用]");
  await j.page.wait(`!document.querySelector('${active} [data-memory-error]').hidden`);
  assert.match(await j.page.evaluate<string>(`document.querySelector('${active} [data-memory-error]').textContent`), /归档.*不能修改|已归档|请先恢复/);
  const current = (await pageFor(f, target, item.scope as Scope)).items.find(one => one.memory_id === item.memory_id);
  assert.ok(current); assert.equal(current.version, item.version); assert.equal(current.state, "active"); assert.equal(current.text, item.text);
}

// MEM-08/17/28/29: actual Coding entry, nonempty scoped views, promotion confirmation/CAS, current persisted result and archive refusal.
// This does not yet cover fixed-clear recovery, candidate-only or the final backend's partial/unknown fault windows.
test("Coding's real Session-memory entry isolates scopes and other memories, confirms promotions and refuses archived writes", { timeout: 120_000 }, async t => {
  const registerChrome = closeChromeBeforeHost(t);
  const f = await product(t), own = await codingWork(f, "当前 Coding 会话"), other = await codingWork(f, "另一个 Coding 会话");
  const retained = await write(f, own, "project", "此会话检查时列出实际依据");
  const personal = await write(f, own, "personal", "此会话解释术语时附中文含义");
  const toLong = await write(f, own, "project", "此会话汇报时先写结论", "2099-01-01T00:00:00.000Z");
  const toShort = await write(f, own, "project", "此会话评审时列出未验证项", "2099-02-01T00:00:00.000Z");
  const separate = await write(f, other, "project", "另一个会话的偏好保持独立"), long = await write(f, null, "project", "长期材料始终注明出处");
  const models = f.requests.length, j = await browserFor(t, f, registerChrome); await openCoding(j, own);
  assert.deepEqual(await ids(j.page), [retained, toLong, toShort].map(one => one.memory_id).sort());
  await captureSessionViews(t, j, "coding");
  await select(j.page, active + " [data-memory-scope-choice]", "personal"); await ready(j.page); assert.deepEqual(await ids(j.page), [personal.memory_id]);
  await select(j.page, active + " [data-memory-scope-choice]", "project"); await ready(j.page);
  assert.deepEqual(await ids(j.page), [retained, toLong, toShort].map(one => one.memory_id).sort());
  await promote(f, j, own, toLong, "long-term"); await promote(f, j, own, toShort, "short-term");
  await refusesArchivedWrite(f, j, own, retained);
  assert.deepEqual((await pageFor(f, other, "project")).items.map(one => one.memory_id), [separate.memory_id]);
  assert.equal((await pageFor(f, null, "project")).items.find(one => one.memory_id === long.memory_id)?.text, long.text);
  assert.equal((await pageFor(f, own, "personal")).items.find(one => one.memory_id === personal.memory_id)?.text, personal.text);
  assert.equal(f.requests.length, models, "management, classification and archive never start another model request");
});

// BL-1076 review (2026-11-13): a long-term memory learned in this session is listed on the session page, but the session cannot change it:
// its row is read-only and links to the page it lives on. The Host's side (which long-term memories count as learned here) is in
// tests/memory-session-clear.test.ts; here the session page's answer marks one row long-term, the way that answer arrives.
test("a long-term memory learned in this Session is read-only on the Session page and links to its own memory page", { timeout: 120_000 }, async t => {
  const registerChrome = closeChromeBeforeHost(t);
  const f = await product(t), own = await codingWork(f, "学到长期记忆的会话");
  const learned = await write(f, own, "project", "此会话学到：评审先列风险"), role = await write(f, own, "project", "此会话学到：角色先核对范围");
  const local = await write(f, own, "project", "此会话内：先跑单测");
  const j = await browserFor(t, f, registerChrome);
  await j.page.command("Page.enable"); await j.page.command("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      const response = await original(...args), url = String(args[0] && args[0].url || args[0]);
      if (!/\\/api\\/memory\\/sessions\\/[^?]+\\/(?:overview|page)\\?/.test(url) || !response.ok) return response;
      const body = await response.clone().json();
      for (const item of body.items || []) if (item.memory_id === ${JSON.stringify(learned.memory_id)}) item.classification = { ...item.classification, lifecycle: "long-term" };
      for (const item of body.items || []) if (item.memory_id === ${JSON.stringify(role.memory_id)}) Object.assign(item, {
        classification: { ...item.classification, lifecycle: "long-term" }, scope: "character", owner: "project-character-owner", character_title: "评审者"
      });
      return new Response(JSON.stringify(body), { status: response.status, headers: response.headers });
    };
  })()` });
  await openCoding(j, own);
  assert.deepEqual(await ids(j.page), [learned, role, local].map(one => one.memory_id).sort());
  assert.match(await j.page.evaluate<string>(`document.querySelector('${active} [data-memory-intro]').textContent`), /包括在此学到的长期记忆/);
  for (const item of [learned, role]) {
    const link = await j.page.evaluate<{ text: string; href: string } | null>(`(() => { const a = document.querySelector('${row(item.memory_id)} [data-memory-manage-elsewhere]');
      return a ? { text: a.textContent, href: a.getAttribute('href') } : null; })()`);
    assert.deepEqual(link, { text: "在项目记忆里管理", href: "/projects/" + encodeURIComponent(f.project.project_id) + "/settings/memory" });
    assert.equal(await j.page.evaluate(`document.querySelectorAll('${row(item.memory_id)} .memory-actions button, ${row(item.memory_id)} .memory-more').length`), 0,
      "no edit, switch-off or ⋯ on a memory the session cannot change");
  }
  assert.equal(await j.page.evaluate(`Boolean(document.querySelector('${row(local.memory_id)} .memory-actions button[aria-label^=修改]'))`), true, "the session's own memory keeps its actions");
});

// MEM-08/17/28/29: the page project is navigation only; the selected Assistant work keeps its actual project or personal target.
test("Assistant's real entry follows project B from project A and retains personal and other-Session isolation", { timeout: 120_000 }, async t => {
  const registerChrome = closeChromeBeforeHost(t);
  const f = await product(t), projectA = f.project.project_id, projectB = f.other.project_id;
  const own = await assistantWork(f, projectB, "核对项目 B 的材料，不修改。"), other = await assistantWork(f, projectB, "记录项目 B 另一项工作的完成情况。"),
    personal = await assistantWork(f, null, "核对个人工作的当前状态。");
  const retained = await write(f, own, "project", "项目 B 此助理会话检查时保留证据");
  const toLong = await write(f, own, "project", "项目 B 此助理会话汇报时先写结论", "2099-03-01T00:00:00.000Z");
  const toShort = await write(f, own, "project", "项目 B 此助理会话评审时列出未验证项", "2099-04-01T00:00:00.000Z");
  const privateInProject = await write(f, own, "personal", "项目 B 此助理会话术语用中文说明");
  const otherItem = await write(f, other, "project", "项目 B 另一助理会话单独保留");
  const personalItem = await write(f, personal, "personal", "个人助理会话答复先列结论");
  const long = await write(f, null, "personal", "长期个人偏好保留任务出处");
  const projectLong = await write(f, null, "project", "项目 B 长期材料始终标明出处", null, projectB);
  const models = f.requests.length, j = await browserFor(t, f, registerChrome); await openAssistant(j, projectA, own);
  assert.deepEqual(await ids(j.page), [retained, toLong, toShort].map(one => one.memory_id).sort());
  await captureSessionViews(t, j, "assistant");
  await select(j.page, active + " [data-memory-scope-choice]", "personal"); await ready(j.page); assert.deepEqual(await ids(j.page), [privateInProject.memory_id]);
  await select(j.page, active + " [data-memory-scope-choice]", "project"); await ready(j.page); assert.deepEqual(await ids(j.page), [retained, toLong, toShort].map(one => one.memory_id).sort());
  await promote(f, j, own, toLong, "long-term"); await promote(f, j, own, toShort, "short-term");
  await refusesArchivedWrite(f, j, own, retained);
  assert.deepEqual((await pageFor(f, other, "project")).items.map(one => one.memory_id), [otherItem.memory_id]);
  assert.equal((await pageFor(f, null, "project", projectB)).items.find(one => one.memory_id === projectLong.memory_id)?.text, projectLong.text);
  await openAssistant(j, projectA, personal); assert.deepEqual(await ids(j.page), [personalItem.memory_id]);
  assert.equal(await j.page.evaluate(`document.querySelector('${active} [data-memory-scope-choice]')`), null, "a personal Assistant Session has no forged project scope switch");
  assert.equal((await pageFor(f, null, "personal")).items.find(one => one.memory_id === long.memory_id)?.text, long.text);
  assert.equal(f.requests.length, models, "viewing another project or personal work and managing it does not dispatch a new Run");
});

async function lastReply<T>(j: Journey, path: string): Promise<{ status: number; value: T }> {
  const response = j.responses.filter(one => one.path === path).at(-1); assert.ok(response, "the actual HTTP response was observed: " + path);
  const body = await j.page.command<{ body: string; base64Encoded: boolean }>("Network.getResponseBody", { requestId: response.requestId });
  return { status: response.status, value: JSON.parse(body.base64Encoded ? Buffer.from(body.body, "base64").toString("utf8") : body.body) as T };
}
async function canonical(host: MolisWorkLocalHost, home: string, target: Target) {
  assert.ok(target.project, "this cross-scope observation belongs to the actual project target");
  const system = ensureSystemAgentService(host, home); await system.ready;
  const memory = system.agentHost.adapter("prologue").memory!;
  // Observe the real SDK's physical rows through its public management capability; no fabricated Session binding is supplied.
  const reader = memory.withCaller({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: target.project, person: true,
    consumer: "ui", current_scene: target.kind, purpose: "management" });
  return [...await reader.list("user", LOCAL_PERSON_ACTOR_ID), ...await reader.list("project", target.project)];
}

// MEM-03/08/09/17/20/28: actual business-bound fixed preview, independent durable facts and physical SDK rows.
// Home/Host close+reopen below is deliberately distinct from an independent OS-process restart.
for (const kind of ["coding", "assistant"] as const) test(`${kind} fixed Session clear keeps later items and resumes the original unknown request after Home/Host reopen`, { timeout: 120_000 }, async t => {
  const registerChrome = closeChromeBeforeHost(t);
  const f = await product(t), target = kind === "coding" ? await codingWork(f, "固定清理的 Coding 会话") : await assistantWork(f, f.project.project_id, "核对固定清理的助理工作。"),
    other = kind === "coding" ? await codingWork(f, "清理范围外的 Coding 会话") : await assistantWork(f, f.project.project_id, "核对另一个独立助理工作。");
  const original = [await write(f, target, "project", `${kind} 原预览项目正式记忆`), await write(f, target, "personal", `${kind} 原预览个人正式记忆`)];
  const separate = await write(f, other, "project", `${kind} 另一会话记忆保持独立`);
  const long = [await write(f, null, "project", `${kind} 长期项目记忆保留出处`), await write(f, null, "personal", `${kind} 长期个人记忆保留依据`)];
  const selected = new Set(original.map(one => one.memory_id)), base = protectedBase(target), models = f.requests.length;
  const facts = () => inspectMemoryForgetting(f.home).decisions.filter(one => one.memories.some(ref => selected.has(ref.memory_id)));
  for (const item of original) assert.ok((await f.web.get<MemoryHistoryResponse>(base + `/items/${item.memory_id}/history`)).revisions.length,
    "the original records have real ledger history before clear");
  const j = await browserFor(t, f, registerChrome);
  if (kind === "coding") await openCoding(j, target); else await openAssistant(j, target.project, target);
  const deliveries = () => j.requests.filter(one => one.path === base + "/clear/apply" && one.method === "POST");
  const preview = async () => {
    await j.page.click(active + " [data-memory-clear]"); await j.page.wait("document.querySelector('[data-memory-confirm-yes]')");
    const response = await lastReply<MemorySessionClearPreview>(j, base + "/clear/preview"); assert.equal(response.status, 200);
    assert.ok(response.value.preview_id); assert.equal(response.value.memory_count, 2); assert.equal(response.value.candidate_count, 0);
    assert.match(await j.page.evaluate<string>("document.querySelector('dialog.memory-confirm').textContent"),
      /将清除本会话的 2 条记忆和 0 条待认可建议，包括在此学到的长期记忆。对话和其他记忆会保留。/);
    return response.value.preview_id;
  };
  const cancelled = await preview();
  await j.page.click("dialog.memory-confirm button:not([data-memory-confirm-yes])"); await j.page.wait("!document.querySelector('dialog.memory-confirm')"); await ready(j.page);
  assert.equal(deliveries().length, 0, "cancelling submits no apply and accepts no forgetting fact"); assert.deepEqual(facts(), []);
  for (const item of original) assert.ok((await pageFor(f, target, item.scope as Scope)).items.some(one => one.memory_id === item.memory_id));

  const previewId = await preview(); assert.notEqual(previewId, cancelled, "a later explicit preview is a new decision");
  const later = [await write(f, target, "project", `${kind} 预览后新增项目记忆`), await write(f, target, "personal", `${kind} 预览后新增个人记忆`)];
  const sync = fs.fsyncSync, homeIdentity = fs.lstatSync(f.home); let reached = false;
  // The real independent-facts directory sync succeeds, then its acknowledgement is lost. No SDK reply is stubbed.
  const fault = t.mock.method(fs, "fsyncSync", (fd: number) => {
    const identity = fs.fstatSync(fd);
    if (!reached && identity.isDirectory() && identity.dev === homeIdentity.dev && identity.ino === homeIdentity.ino) {
      reached = true; sync(fd); throw Object.assign(new Error("independent fact directory sync acknowledgement lost"), { code: "EIO" });
    }
    return sync(fd);
  });
  syncBuiltinESMExports();
  try {
    await j.page.click("[data-memory-confirm-yes]");
    await j.page.wait(`document.querySelector('${active} [data-memory-retry]') && !document.querySelector('${active} [data-memory-error]').hidden && document.querySelector('${active} [data-memory-clear-status]')?.textContent.includes('尚未确认')`);
    assert.equal(reached, true, "the original Host call hit this Home's actual directory sync");
    assert.equal(deliveries().length, 1); assert.deepEqual(deliveries()[0]!.body, { preview_id: previewId });
    assert.equal(facts().length, 1, "one durable group exists even though the HTTP result is unknown");
    assert.ok(facts().every(one => one.selection_mode === "exact-identities" && one.memories.every(ref => selected.has(ref.memory_id))));
    const physical = await canonical(f.host, f.home, target);
    for (const item of [...original, ...later]) assert.ok(physical.some(one => one.memory_id === item.memory_id && one.version === item.version && one.text === item.text),
      "unknown acceptance cannot begin physical cleanup before all fixed groups are confirmed");
    assert.equal(await j.page.evaluate(`document.querySelector('${active} [data-memory-batch-results]').textContent.includes('遗忘未接受')`), false,
      "unknown acceptance is not presented as a definite not-accepted item");
  } finally { fault.mock.restore(); syncBuiltinESMExports(); }
  const originalBody = deliveries()[0]!.rawBody;
  await j.page.command("Page.navigate", { url: "about:blank" }); await j.page.wait("location.href === 'about:blank'");
  // Required final dependency: the approved fixture close shuts both its HTTP transport and Host, sharing one Promise with cleanup.
  assert.ok("close" in f && typeof f.close === "function", "the final codingProductHost dependency must expose its approved close lifecycle");
  await f.close();
  let withCatalog: ReturnType<MolisWorkLocalHost["configurePersonalPlanning"]>;
  const reopened = new MolisWorkLocalHost({ homeDirectory: f.home,
    workspacesFor: projectId => withCatalog({ homeDirectory: f.home }, catalog => catalog.listWorkspaceDirectory(projectId)),
    workspaceFor: projectId => withCatalog({ homeDirectory: f.home }, catalog => workspaceRefFor(catalog, projectId)) });
  withCatalog = reopened.configurePersonalPlanning(f.home, withMolisWorkProjectCatalog);
  let transport: Awaited<ReturnType<typeof serveTestHost>> | undefined;
  try {
    transport = await serveTestHost(null, { home: f.home, host: reopened });
    const pending = await transport.web.get<{ items: Array<{ kind: string; preview_id?: string; target?: { kind: string; id: string; project_id: string | null } }> }>(base + "/operations");
    const operation = pending.items.find(one => one.kind === "session-clear" && one.preview_id === previewId); assert.ok(operation);
    assert.deepEqual(operation.target, { kind, id: target.id, project_id: target.project });
    await j.navigate(settingsPath(target), transport.origin); await activateMemory(j.page);
    await j.page.wait(`document.querySelector('${active} [data-memory-retry]')`);
    assert.equal(deliveries().length, 1, "reopening only discovers the original operation; it never automatically applies it");
    // MEM-09/17/20: the first SDK cleanup really completes; only the second target's physical call fails once.
    const system = ensureSystemAgentService(reopened, f.home); await system.ready;
    const capability = system.agentHost.adapter("prologue").memory!, bind = capability.withCaller.bind(capability), purged: string[] = [];
    type Capability = import("@molis-ai/molis-work-contracts/services/agent-host").AgentMemoryCapability;
    const interrupted = (bound: Capability): Capability => ({ ...bound,
      withExecution: control => { assert.ok(bound.withExecution); return interrupted(bound.withExecution(control)); },
      purgeSessionTarget: async input => {
        purged.push(input.id); assert.ok(selected.has(input.id), "only this original preview's exact target reaches the SDK");
        if (purged.length === 2) throw new Error("second fixed physical cleanup interrupted once");
        assert.ok(bound.purgeSessionTarget); await bound.purgeSessionTarget(input);
      } });
    const fault = t.mock.method(capability, "withCaller", (...args: Parameters<typeof bind>) => interrupted(bind(...args)));
    try {
      await j.page.click(active + " [data-memory-retry]");
      await j.page.wait(`document.querySelector('${active} [data-memory-clear-status]')?.textContent.includes('本次清理尚未完成') && document.querySelectorAll('${active} [data-memory-session-item]').length === 2`); await ready(j.page);
      assert.equal(deliveries().length, 2); assert.equal(deliveries()[1]!.rawBody, originalBody);
      const partial = await lastReply<MemorySessionClearResult>(j, base + "/clear/apply"); assert.equal(partial.status, 200);
      assert.deepEqual(partial.value, { complete: false, items: [
        { kind: "memory", memory_id: purged[0], outcome: "completed", forgetting: "accepted", cleanup: "complete" },
        { kind: "memory", memory_id: purged[1], outcome: "unknown", forgetting: "accepted", cleanup: "pending" },
      ] });
      assert.equal(purged.length, 2); assert.notEqual(purged[0], purged[1]);
      const feedback = await j.page.evaluate<string[]>(`[...document.querySelectorAll('${active} [data-memory-session-item]')].map(node => node.textContent)`);
      assert.match(feedback[0]!, /已完成.*遗忘已接受.*清理完成/); assert.match(feedback[1]!, /结果未知.*遗忘已接受.*清理待继续/);
      const physical = await canonical(reopened, f.home, target);
      assert.equal(physical.some(one => one.memory_id === purged[0]), false); assert.ok(physical.some(one => one.memory_id === purged[1]));
      assert.equal(facts().length, 2, "both independent decisions stay accepted while only the second physical target remains pending");
      const evidence = join("/private/tmp/memory-v0-a4m-ui-20261105/session-management-screenshots-20261105", String(process.pid)); await mkdir(evidence, { recursive: true });
      await j.page.screenshot(join(evidence, `${kind}-partial.png`));
      await writeFile(join(evidence, `${kind}-partial.json`), JSON.stringify({ result: partial.value, feedback, purged, originalBody,
        deliveredBodies: deliveries().map(one => one.rawBody), physicalIds: physical.map(one => one.memory_id), facts: facts() }, null, 2));
      t.diagnostic("Real Session partial cleanup page and facts: " + join(evidence, `${kind}-partial.json`));
      await j.page.click(active + " [data-memory-retry]");
      await j.page.wait(`!document.querySelector('${active} [data-memory-retry]') && document.querySelector('${active} [data-memory-clear-status]')?.textContent.includes('本会话清理已完成')`); await ready(j.page);
      assert.deepEqual(purged, [purged[0], purged[1], purged[1]], "the completed first target is never purged again on the original retry");
    } finally { fault.mock.restore(); }
    assert.equal(deliveries().length, 3); assert.ok(deliveries().slice(1).every(one => one.rawBody === originalBody), "both explicit retries send the exact original preview body");
    assert.deepEqual(deliveries()[2]!.body, { preview_id: previewId });
    const response = await lastReply<MemorySessionClearResult>(j, base + "/clear/apply"); assert.equal(response.status, 200); assert.equal(response.value.complete, true);
    assert.deepEqual(response.value.items.map(one => one.kind === "memory" ? one.memory_id : "unexpected-candidate").sort(), [...selected].sort());
    assert.ok(response.value.items.every(one => one.outcome === "completed" && one.forgetting === "accepted" && one.cleanup === "complete"));
    const physical = await canonical(reopened, f.home, target);
    assert.ok(original.every(item => !physical.some(one => one.memory_id === item.memory_id)));
    for (const item of [...later, separate, ...long]) assert.ok(physical.some(one => one.memory_id === item.memory_id && one.version === item.version && one.text === item.text),
      "new identities, another Session and long-term controls survive physical cleanup");
    assert.equal(facts().length, 2);
    assert.deepEqual(facts().flatMap(one => one.memories).sort((a, b) => a.memory_id.localeCompare(b.memory_id)),
      original.map(item => ({ memory_id: item.memory_id, version: item.version })).sort((a, b) => a.memory_id.localeCompare(b.memory_id)));
    assert.ok(facts().every(one => one.selection_mode === "exact-identities" && !one.candidates.length));
    for (const item of original) await assert.rejects(transport.web.get(base + `/items/${item.memory_id}/history`), error =>
      isLocalHostHttpError(error) && [403, 404].includes(error.status), "the original body-bearing history is no longer publicly readable");
    for (const scope of ["personal", "project"] as const) {
      const current: MemoryPageResponse = await transport.web.get<MemoryPageResponse>(base + "/page?input=" + encodeURIComponent(JSON.stringify({ scope })));
      assert.deepEqual(current.items.map(one => one.memory_id), later.filter(one => one.scope === scope).map(one => one.memory_id));
    }
    const otherPage = await transport.web.get<MemoryPageResponse>(protectedBase(other) + "/page?input=" + encodeURIComponent(JSON.stringify({ scope: "project" })));
    assert.deepEqual(otherPage.items.map(one => one.memory_id), [separate.memory_id]);
    assert.equal(f.requests.length, models, "preview, unknown retry and Home/Host reopen do not dispatch a model");
  } finally { await transport?.close(); await reopened.close(); }
});

// Decode only actual Provider Context blocks; tool declarations or local expected IDs cannot supply a replacement target.
function contextMemories(request: CodingProviderRequest): Array<{ memory: { id: string; scope: string }; text: string }> {
  return request.messages.flatMap(message => {
    const texts = typeof message.content === "string" ? [message.content] : message.content.filter(block => block.type === "text").map(block => block.text ?? "");
    return texts.flatMap(text => text.split("\n").filter(line => line.startsWith('{"source":"memory-recall"')).flatMap(line => {
      const entry = JSON.parse(line);
      return typeof entry.text === "string" && typeof entry.memory?.id === "string" && typeof entry.memory.scope === "string" ? [entry] : [];
    }));
  });
}

// MEM-02/08/09/17/21/28: the original Run tool/gate creates a genuine pending Session candidate; exact clear cannot follow it into a long-term formal.
for (const kind of ["coding", "assistant"] as const) test(`${kind} real Run leaves a Session candidate and candidate-only clear preserves its promoted long-term original`, { timeout: 120_000 }, async t => {
  const registerChrome = closeChromeBeforeHost(t);
  type Request = CodingProviderRequest & { tools?: Array<{ name: string; description?: string }> };
  const oldText = `${kind} 产品术语以中文解释`, proposedText = `${kind} 周报采用风险与进展两栏`, task = `${kind} CANDIDATE_SOURCE 请查看当前保存的偏好并说明内容。`;
  let phase: "bootstrap" | "list" | "replace" | "result" | "done" = "bootstrap", original: MemoryItem | undefined;
  let modelTarget = "", toolCandidate = "", writeTool = "";
  const actual: Request[] = [], compactions: Request[] = [];
  const f = await codingProductHost(t, given => {
    const request = given as Request, review = endingReviewAnswer(request, () => []);
    if (review !== undefined) return cogniaScriptedResponse(undefined, review);
    if (JSON.stringify((request as Request & { system?: unknown }).system).includes(codingPrompts.find(prompt => prompt.prompt_id === "coding-compaction")!.body.split("\n")[0]!)) {
      compactions.push(request); return cogniaModelResponse(JSON.stringify({ selections: [] }));
    }
    if (phase === "bootstrap") return cogniaModelResponse("已核对当前工作。");
    assert.ok(JSON.stringify(request.messages).includes(task), "the request belongs to the actual continuation of this business Session");
    if (phase === "done") return cogniaModelResponse("已提出待审建议。");
    actual.push(request);
    const offered = request.tools ?? [];
    if (phase === "list") {
      assert.ok(original);
      const list = kind === "assistant" ? offered.find(tool => tool.name === "list-memories")
        : offered.find(tool => tool.name.startsWith("molis-action-") && tool.description?.includes(memoryActions.list.action.title));
      const write = kind === "assistant" ? offered.find(tool => tool.name === "remember")
        : offered.find(tool => tool.name.startsWith("molis-action-") && tool.description?.includes(memoryActions.write.action.title));
      assert.ok(list && write, "the real frozen role offers both selected tools"); writeTool = write.name; phase = "replace";
      return cogniaScriptedResponse({ name: list.name, input: kind === "assistant" ? {} : { scope: "project", query: oldText } });
    }
    if (phase === "replace") {
      // The actual model Context supplies identity; list does not need to expand a memory already supplied automatically.
      const entry = contextMemories(request).find(one => one.text === oldText && one.memory.scope === "project"); assert.ok(entry, "the actual model Context contains text and canonical identity in the same object");
      modelTarget = entry.memory.id; assert.equal(modelTarget, original!.memory_id, "the payload, independently checked against the person-created original, supplies replaces");
      assert.notEqual(proposedText, task, "the proposed summary is not the complete Host-saved original sentence"); phase = "result";
      return cogniaScriptedResponse({ name: writeTool, input: { scope: "project", kind: "preference", text: proposedText, said: task, replaces: entry.memory.id } });
    }
    const candidate = toolField(request.messages, "candidate_id"); assert.equal(typeof candidate, "string", "the actual tool result returned its pending candidate identity"); toolCandidate = String(candidate);
    if (kind === "assistant") assert.equal(toolField(request.messages, "memory_id"), "", "remember did not turn the summary into a formal memory");
    else assert.equal(toolField(request.messages, "outcome"), "candidate", "the selected write Action went through the original gate");
    phase = "done"; return cogniaModelResponse("已提出待审建议，请在记忆页决定。");
  }, { loopbackProvider: true });
  // Isolate this explicit Run-tool gate from the separate completion-learning worker through the real preference API.
  for (const scope of ["personal", "project"] as const) await f.web.post(`/projects/${f.project.project_id}/api/memory/prefs`, { scope, prefs: { learn_from_work: false } });
  const target = kind === "coding" ? await codingWork(f, "真实待审建议的 Coding 会话") : await assistantWork(f, f.project.project_id, "核对此助理会话的当前状态。"),
    other = kind === "coding" ? await codingWork(f, "待审建议范围外的 Coding 会话") : await assistantWork(f, f.project.project_id, "核对另一项独立助理工作。");
  original = await write(f, target, "project", oldText);
  const outside = await write(f, other, "project", `${kind} 另一会话保留自己的约定`);
  const refs = [memoryActions.list, memoryActions.write].map(action => ({ capability_id: action.capability_id, version: action.version, provider_id: MEMORY_PROVIDER_ID }));
  if (kind === "coding") for (const action of refs) await grantMcpAction(f.web, { clientId: "agent:prologue", projectId: null, action });
  phase = "list";
  let run: AgentRunRef;
  if (kind === "coding") {
    const started = await f.call<{ run: { ref: AgentRunRef } }>(target.project!, coding + `/sessions/${target.id}/runs`, {
      task, intent: "execute", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model", action_tools: refs,
    });
    assert.equal(started.status, 200, JSON.stringify(started.body)); run = started.body.run.ref;
    const pending = await untilSetup(async () => {
      const response = await f.call<{ reviews: Array<{ request: AgentReviewRequest }> }>(target.project!, "/api/agent/reviews?status=pending");
      assert.equal(response.status, 200, JSON.stringify(response.body));
      return response.body.reviews.find(row => row.request.run?.run_id === run.run_id && row.request.run.session_id === run.session_id
        && row.request.kind === "tool-operation" && row.request.document.kind === "tool-operation" && row.request.document.tool === writeTool)?.request;
    }, "this exact Coding write requests its original human review");
    assert.equal(pending.project_id, target.project); assert.equal(pending.document.kind, "tool-operation");
    if (pending.document.kind !== "tool-operation") assert.fail("the original write review document is missing");
    const fields = Object.fromEntries(pending.document.fields.map(field => [field.label, field.value]));
    assert.equal(fields.Capability, memoryActions.write.capability_id); assert.equal(fields.Version, String(memoryActions.write.version)); assert.equal(fields.Provider, MEMORY_PROVIDER_ID);
    assert.ok(modelTarget); assert.deepEqual(JSON.parse(fields.Arguments!), { scope: "project", kind: "preference", text: proposedText, said: task, replaces: modelTarget });
    const approved = await f.call<{ receipt: { status: string } }>(target.project!, "/api/agent/reviews/decide", { review_id: pending.review_id, decision: "approve" });
    assert.equal(approved.status, 200, JSON.stringify(approved.body)); assert.equal(approved.body.receipt.status, "approved");
  } else {
    const sent = await f.web.post<AssistantSendResult>(`/projects/${target.project}/api/assistant/send`, { work_id: target.id, text: task, request_id: randomUUID() });
    assert.equal(sent.work.work_id, target.id); assert.ok(sent.work.session_id && sent.run_id);
    run = { session_id: sent.work.session_id, run_id: sent.run_id };
  }
  const ended = await f.ended(run); assert.equal(ended.phase, "completed", ended.stop_reason ?? "");
  assert.equal(ended.frozen.role_id, kind === "coding" ? "builder" : "assistant"); assert.equal(phase, "done"); assert.equal(actual.length, 3);
  assert.equal(compactions.length, kind === "coding" ? 1 : 0, "Coding's separate original-history selection is not a Run tool turn");
  t.diagnostic(`${kind} scripted Provider requests before management: total=${f.requests.length}, Run-tool-turns=${actual.length}, original-history-selections=${compactions.length}`);
  assert.ok(modelTarget && toolCandidate);
  const base = protectedBase(target), overview = await f.web.get<{ items: MemoryManagementItem[]; candidates: MemoryCandidate[] | null }>(base + "/overview?scope=project");
  const candidate = overview.candidates?.find(one => one.candidate_id === toolCandidate && one.text === proposedText); assert.ok(candidate);
  assert.equal(candidate.state, "pending"); assert.equal(candidate.basis, "inferred"); assert.equal(candidate.from, "gate"); assert.ok(candidate.hold_reason); assert.equal(candidate.supersedes, original.memory_id);
  assert.equal(overview.items.find(one => one.memory_id === original!.memory_id)?.version, original.version);
  const otherOverview = await f.web.get<{ candidates: MemoryCandidate[] | null }>(protectedBase(other) + "/overview?scope=project");
  assert.ok(Array.isArray(otherOverview.candidates)); assert.equal(otherOverview.candidates.some(one => one.candidate_id === toolCandidate), false);
  const system = ensureSystemAgentService(f.host, f.home); await system.ready;
  const observer = system.agentHost.adapter("prologue").memory!.withCaller({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: target.project!, person: true,
    consumer: "ui", current_scene: kind, purpose: "management" });
  const formalSnapshot = (await canonical(f.host, f.home, target)).find(one => one.memory_id === original!.memory_id)!;
  const candidateSnapshot = (await observer.candidates.list("project", target.project!)).find(one => one.candidate_id === toolCandidate); assert.ok(candidateSnapshot);
  assert.deepEqual(candidateSnapshot.meta.classification, formalSnapshot.meta.classification); assert.deepEqual(candidateSnapshot.meta.session_ref, formalSnapshot.meta.session_ref);
  assert.equal(candidateSnapshot.meta.classification?.lifecycle, "session"); assert.ok(candidateSnapshot.meta.session_ref, "the real gate retained the original Session classification and ref");
  const models = f.requests.length, j = await browserFor(t, f, registerChrome);
  if (kind === "coding") await openCoding(j, target); else await openAssistant(j, target.project, target);
  await j.page.wait(`document.querySelector('${active} [data-memory-candidates]').textContent.includes(${JSON.stringify(proposedText)})`);
  await promote(f, j, target, original, "long-term");
  assert.deepEqual(await ids(j.page), []); assert.equal(await j.page.evaluate(`document.querySelector('${active} [data-memory-candidates-section]').checkVisibility()`), true);
  const only = await f.web.get<{ items: MemoryManagementItem[]; candidates: MemoryCandidate[] | null }>(base + "/overview?scope=project");
  assert.equal(only.items.length, 0); assert.deepEqual(only.candidates?.map(one => one.candidate_id), [toolCandidate]);
  const long = (await pageFor(f, null, "project")).items.find(one => one.memory_id === original!.memory_id)!; assert.ok(long);
  await j.page.click(active + " [data-memory-clear]"); await j.page.wait("document.querySelector('[data-memory-confirm-yes]')");
  const preview = await lastReply<MemorySessionClearPreview>(j, base + "/clear/preview"); assert.equal(preview.status, 200);
  assert.equal(preview.value.memory_count, 0); assert.equal(preview.value.candidate_count, 1); assert.ok(preview.value.preview_id);
  assert.match(await j.page.evaluate<string>("document.querySelector('dialog.memory-confirm').textContent"), /将清除本会话的 0 条记忆和 1 条待认可建议/);
  await j.page.click("[data-memory-confirm-yes]");
  await j.page.wait(`document.querySelector('${active} [data-memory-clear-status]')?.textContent.includes('本会话清理已完成')`); await ready(j.page);
  const result = await lastReply<MemorySessionClearResult>(j, base + "/clear/apply"); assert.equal(result.status, 200); assert.equal(result.value.complete, true);
  assert.deepEqual(result.value.items, [{ kind: "memory-candidate", candidate_id: toolCandidate, outcome: "completed", forgetting: "accepted", cleanup: "complete" }]);
  const applied = j.requests.filter(one => one.path === base + "/clear/apply" && one.method === "POST"); assert.equal(applied.length, 1);
  assert.deepEqual(applied[0]!.body, { preview_id: preview.value.preview_id });
  assert.equal(await j.page.evaluate(`document.querySelector('${active} [data-memory-candidates-section]').hidden`), true);
  assert.equal((await observer.candidates.list("project", target.project!)).some(one => one.candidate_id === toolCandidate), false);
  const physical = await canonical(f.host, f.home, target), kept = physical.find(one => one.memory_id === long.memory_id); assert.ok(kept);
  assert.equal(kept.version, long.version); assert.equal(kept.text, long.text); assert.equal(kept.meta.classification?.lifecycle, "long-term"); assert.equal(kept.meta.session_ref, undefined);
  assert.ok(physical.some(one => one.memory_id === outside.memory_id && one.version === outside.version && one.text === outside.text));
  const decision = inspectMemoryForgetting(f.home).decisions.find(one => one.candidates.some(ref => ref.candidate_id === toolCandidate)); assert.ok(decision);
  assert.equal(decision.selection_mode, "exact-identities"); assert.deepEqual(decision.memories, []); assert.deepEqual(decision.candidates, [{ candidate_id: toolCandidate, version: candidateSnapshot.version }]);
  assert.deepEqual(decision.source_event_ids, []);
  const history = await f.web.get<MemoryHistoryResponse>(`/projects/${target.project}/api/memory/items/${long.memory_id}/history`);
  assert.ok(history.revisions.some(one => one.text === oldText), "candidate-only clear does not erase the retained long-term original's history");
  assert.equal(f.requests.length, models, "the person's promotion and candidate-only clear never call the model again");
});
