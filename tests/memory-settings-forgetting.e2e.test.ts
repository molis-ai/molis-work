import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ChromeHarness, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentMemoryCapability } from "@molis-ai/molis-work-contracts/services/agent-host";
import { MEMORY_PERMISSIONS, memoryActions } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { inspectMemoryForgetting } from "@molis-ai/molis-work-storage";
import { person } from "./fixtures/home-runtime.js";
import { openTestHome } from "./fixtures/test-home.js";

// B4 prerequisite: a committed deletion with a lost response must remove the already-rendered copies too.
for (const outcome of ["lost-response", "accepted-pending", "completed"] as const) test(`forgetting ${outcome} clears displayed copies without changing the original decision`, { timeout: 60_000 }, async t => {
  const executable = locateTestChrome(); assert.ok(executable, "Chrome is required for the real forgetting journey");
  const env = await openTestHome(t), project = await env.createProject("遗忘后的页面反馈");
  const client = bindActionClient(env.host.actionClient(project.reference), () => person(MEMORY_PERMISSIONS, project.project_id));
  const oldText = "遗忘页面原始正文，保留这个标记用于真实历史断言", currentText = "遗忘页面当前正文，提交后任何旧副本都应消失";
  const saved = (await client.invoke(memoryActions.write, { scope: "project", text: oldText, kind: "convention" })).memory!;
  const changed = (await client.invoke(memoryActions.change, { action: "update", memory_id: saved.memory_id,
    expected_version: saved.version, text: currentText })).memory!;
  const original = MemoryService.prototype.change; let loseReply = true, refuseRefresh = false, failedRefreshes = 0;
  const system = ensureSystemAgentService(env.host, env.home); await system.ready;
  const memory = system.agentHost.adapter("prologue").memory!;
  if (outcome === "accepted-pending") {
    const withCaller = memory.withCaller;
    const interrupt = (bound: AgentMemoryCapability): AgentMemoryCapability => ({ ...bound,
      withExecution: control => interrupt(bound.withExecution!(control)),
      remove: async () => { throw new Error("Physical cleanup interrupted before the SDK effect"); },
    });
    t.mock.method(memory, "withCaller", caller => interrupt(withCaller(caller)));
    const originalPage = MemoryService.prototype.page;
    t.mock.method(MemoryService.prototype, "page", async function(this: MemoryService, ...args: Parameters<MemoryService["page"]>) {
      if (refuseRefresh) { failedRefreshes++; throw new Error("Forgetting refresh unavailable"); }
      return originalPage.apply(this, args);
    });
  }
  t.mock.method(MemoryService.prototype, "change", async function(this: MemoryService, ...args: Parameters<MemoryService["change"]>) {
    try {
      const result = await original.apply(this, args);
      if (outcome === "lost-response" && args[1].action === "remove" && loseReply) { loseReply = false; throw new Error("Committed deletion response unavailable"); }
      return result;
    } catch (error) {
      if (outcome === "accepted-pending" && args[1].action === "remove") {
        assert.equal((error as { details?: { forgetting?: string } }).details?.forgetting, "accepted"); refuseRefresh = true;
      }
      throw error;
    }
  });
  const directory = await mkdtemp(join(tmpdir(), "memory-forgetting-browser-")), browser = await ChromeHarness.start(directory, { executable });
  t.after(async () => { await browser.close(); await rm(directory, { recursive: true, force: true }); });
  const page = await browser.page(), deliveries: Array<Record<string, unknown>> = [];
  browser.on("Network.requestWillBeSent", (params, sessionId) => {
    const request = params.request as { url?: string; postData?: string };
    if (sessionId === page.sessionId && request.url?.endsWith("/api/memory/change") && request.postData) deliveries.push(JSON.parse(request.postData));
  });
  await page.command("Network.enable"); await page.viewport(1440, 1000);
  await page.command("Page.navigate", { url: env.origin + `/projects/${project.project_id}/settings/memory` });
  await page.wait("[...document.querySelectorAll('[data-memory-settings]')].some(node => node.checkVisibility())");
  await page.evaluate("[...document.querySelectorAll('[data-memory-settings]')].find(node => node.checkVisibility()).dataset.forgettingTest = ''");
  const root = "[data-forgetting-test]", row = `${root} [data-memory-id="${saved.memory_id}"]`;
  await page.wait(`document.querySelector('${row}') && document.querySelector('${root} [data-memory-list]')?.getAttribute('aria-busy') === 'false'`);
  const more = async (label: string) => {
    await page.click(row + " summary[aria-label^=更多操作]");
    await page.evaluate(`document.querySelectorAll('${row} .memory-menu button').forEach(button => { if (button.textContent === ${JSON.stringify(label)}) button.dataset.forgettingOpen = ''; else delete button.dataset.forgettingOpen; })`);
    await page.click("[data-forgetting-open]");
  };
  await more("历史版本"); await page.wait(`document.querySelector('${row} .memory-history')?.textContent.includes(${JSON.stringify(oldText)})`);
  assert.ok(String(await page.evaluate(`document.querySelector('${row}').textContent`)).includes(currentText));
  let releaseHistory: (() => Promise<unknown>) | undefined, historyDelivered: Promise<void> | undefined;
  if (outcome === "accepted-pending") {
    let enter!: () => void, finish!: () => void, requestId: string | undefined;
    const entered = new Promise<void>(done => { enter = done; });
    historyDelivered = new Promise<void>(done => { finish = done; });
    browser.on("Fetch.requestPaused", (params, sessionId) => {
      if (sessionId !== page.sessionId) return;
      assert.equal(params.responseStatusCode, 200, "the real historical Action completed before the delayed delivery");
      requestId = params.networkId as string;
      releaseHistory = () => page.command("Fetch.continueRequest", { requestId: params.requestId }).then(() => page.command("Fetch.disable"));
      enter();
    });
    browser.on("Network.loadingFinished", (params, sessionId) => { if (sessionId === page.sessionId && params.requestId === requestId) finish(); });
    // Delay transport after the real Action has returned, never while holding its project queue.
    await page.command("Fetch.enable", { patterns: [{ urlPattern: env.origin + `/projects/${project.project_id}/api/memory/items/${saved.memory_id}/history*`, requestStage: "Response" }] });
    await more("历史版本"); await entered;
  }
  await more("删除"); await page.wait("document.querySelector('[data-memory-confirm-yes]')");
  await page.click(".memory-confirm footer button:first-child"); await page.wait("!document.querySelector('.memory-confirm')");
  assert.equal(deliveries.length, 0, "cancelled confirmation submits nothing");
  assert.ok(String(await page.evaluate(`document.querySelector('${row}').textContent`)).includes(currentText), "cancel leaves the displayed memory intact");
  assert.equal((await client.invoke(memoryActions.page, { scope: "project" })).items[0]!.version, changed.version);
  assert.equal((await client.invoke(memoryActions.history, { memory_id: saved.memory_id })).revisions.length, 2);
  await more("删除"); await page.wait("document.querySelector('[data-memory-confirm-yes]')"); await page.click("[data-memory-confirm-yes]");
  if (outcome === "completed") await page.wait(`!document.querySelector('${row}') && document.querySelector('${root} [data-memory-list]')?.getAttribute('aria-busy') === 'false'`);
  else await page.wait(`document.querySelector('${root} [data-memory-retry]') && document.querySelector('${root} [data-memory-error]')?.checkVisibility()`);
  if (outcome === "accepted-pending") {
    assert.ok(failedRefreshes > 0, "the real page attempted its failed refresh");
    const accepted = inspectMemoryForgetting(env.home).decisions.find(decision => decision.operation_id === deliveries[0]!.operation_id);
    assert.deepEqual(accepted!.memories, [{ memory_id: saved.memory_id, version: changed.version }]);
    assert.equal((await memory.withCaller({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, person: true,
      consumer: "ui", purpose: "management", current_scene: "common" }).list("project", project.project_id))[0]!.text, currentText,
    "the real SDK still contains the physically unremoved body");
    await releaseHistory!(); await historyDelivered;
  } else assert.equal((await client.invoke(memoryActions.page, { scope: "project" })).items.length, 0, "the real service committed the deletion");
  await page.screenshot(`/private/tmp/memory-v0-b4-ui-${outcome}-20261104.png`);
  const visibleCopy = String(await page.evaluate("document.body.textContent"));
  assert.equal(visibleCopy.includes(currentText), false, "the page must clear its displayed item and body-bearing retry title");
  assert.equal(visibleCopy.includes(oldText), false, "the already-open history must not retain the forgotten body");
  assert.equal(deliveries.length, 1);
  if (outcome === "completed") { assert.equal(await page.evaluate(`!!document.querySelector('${root} [data-memory-retry]')`), false); return; }
  if (outcome === "accepted-pending") {
    assert.match(String(await page.evaluate(`document.querySelector('${root} [data-memory-error]').textContent`)), /清理未完成/);
    const notice = String(await page.evaluate('document.querySelector("[data-settings-toast], [data-toast]").textContent'));
    assert.notEqual(notice, "已删除", "accepted pending cleanup never claims success");
    assert.equal(notice.includes("这次操作已完成"), false);
    const before = String(await page.evaluate(`document.querySelector('${root} [data-memory-error]').textContent`));
    await page.click(root + " [data-memory-retry]");
    await page.wait(`document.querySelector('${root} [data-memory-error]')?.checkVisibility() && document.querySelector('${root} [data-memory-error]').textContent !== ${JSON.stringify(before)}`);
    assert.equal(deliveries.length, 2); assert.deepEqual(deliveries[0], deliveries[1]);
    await page.command("Page.navigate", { url: "about:blank" }); await page.wait("location.href === 'about:blank'");
    refuseRefresh = false;
    await page.command("Page.navigate", { url: env.origin + `/projects/${project.project_id}/settings/memory` });
    await page.wait("[...document.querySelectorAll('[data-memory-settings]')].some(node => node.checkVisibility() && node.querySelector('[data-memory-list]')?.getAttribute('aria-busy') === 'false')");
    const reopened = String(await page.evaluate("document.body.textContent"));
    assert.equal(reopened.includes(currentText), false); assert.equal(reopened.includes(oldText), false);
    await page.screenshot("/private/tmp/memory-v0-b4-ui-pending-reentered-20261104.png");
    return;
  }
  await page.click(root + " [data-memory-retry]");
  await page.wait(`!document.querySelector('${root} [data-memory-retry]') && document.querySelector('${root} [data-memory-list]')?.getAttribute('aria-busy') === 'false'`);
  assert.equal(deliveries.length, 2); assert.deepEqual(deliveries[0], deliveries[1]);
  assert.equal(deliveries[0]!.memory_id, saved.memory_id); assert.equal(deliveries[0]!.expected_version, changed.version);
  assert.equal((await client.invoke(memoryActions.page, { scope: "project" })).items.length, 0);
});

test("a rejected stale deletion permits a fresh management read without changing the pending request", { timeout: 60_000 }, async t => {
  const executable = locateTestChrome(); assert.ok(executable);
  const env = await openTestHome(t), project = await env.createProject("版本冲突后重新读取");
  const client = bindActionClient(env.host.actionClient(project.reference), () => person(MEMORY_PERMISSIONS, project.project_id));
  const oldText = "冲突前本人所见的旧正文", currentText = "另一窗口已经保存的当前正文";
  const saved = (await client.invoke(memoryActions.write, { scope: "project", text: oldText, kind: "convention" })).memory!;
  const directory = await mkdtemp(join(tmpdir(), "memory-forgetting-conflict-browser-")), browser = await ChromeHarness.start(directory, { executable });
  t.after(async () => { await browser.close(); await rm(directory, { recursive: true, force: true }); });
  const page = await browser.page(), deliveries: Array<Record<string, unknown>> = [], statuses: number[] = [];
  browser.on("Network.requestWillBeSent", (params, sessionId) => {
    const request = params.request as { url?: string; postData?: string };
    if (sessionId === page.sessionId && request.url?.endsWith("/api/memory/change") && request.postData) deliveries.push(JSON.parse(request.postData));
  });
  browser.on("Network.responseReceived", (params, sessionId) => {
    const response = params.response as { url?: string; status?: number };
    if (sessionId === page.sessionId && response.url?.endsWith("/api/memory/change")) statuses.push(response.status!);
  });
  await page.command("Network.enable"); await page.viewport(1440, 1000);
  await page.command("Page.navigate", { url: env.origin + `/projects/${project.project_id}/settings/memory` });
  await page.wait("[...document.querySelectorAll('[data-memory-settings]')].some(node => node.checkVisibility() && node.querySelector('[data-memory-list]')?.getAttribute('aria-busy') === 'false')");
  await page.evaluate("[...document.querySelectorAll('[data-memory-settings]')].find(node => node.checkVisibility()).dataset.conflictTest = ''");
  const root = "[data-conflict-test]", row = `${root} [data-memory-id="${saved.memory_id}"]`;
  const more = async (label: string) => {
    await page.click(row + " summary[aria-label^=更多操作]");
    await page.evaluate(`document.querySelectorAll('${row} .memory-menu button').forEach(button => { if (button.textContent === ${JSON.stringify(label)}) button.dataset.conflictOpen = ''; else delete button.dataset.conflictOpen; })`);
    await page.click("[data-conflict-open]");
  };
  let entered!: () => void, delivered!: () => void, held: string | undefined, networkId: string | undefined;
  const paused = new Promise<void>(done => { entered = done; }), finished = new Promise<void>(done => { delivered = done; });
  browser.on("Fetch.requestPaused", (params, sessionId) => {
    if (sessionId !== page.sessionId) return; assert.equal(params.responseStatusCode, 200);
    held = params.requestId as string; networkId = params.networkId as string; entered();
  });
  browser.on("Network.loadingFinished", (params, sessionId) => { if (sessionId === page.sessionId && params.requestId === networkId) delivered(); });
  await page.command("Fetch.enable", { patterns: [{ urlPattern: env.origin + `/projects/${project.project_id}/api/memory/items/${saved.memory_id}/history*`, requestStage: "Response" }] });
  await more("历史版本"); await paused;
  const updated = (await client.invoke(memoryActions.change, { action: "update", memory_id: saved.memory_id,
    expected_version: saved.version, text: currentText })).memory!;
  await more("删除"); await page.wait("document.querySelector('[data-memory-confirm-yes]')"); await page.click("[data-memory-confirm-yes]");
  await page.wait(`document.querySelector('${root} [data-memory-retry]') && document.querySelector('${root} [data-memory-error]')?.checkVisibility()`);
  assert.deepEqual(statuses, [409]); assert.deepEqual(inspectMemoryForgetting(env.home).decisions, [], "the conflicted deletion was never accepted");
  await page.command("Fetch.continueRequest", { requestId: held }); await page.command("Fetch.disable"); await finished;
  await page.click(root + " [data-memory-reload]");
  await page.wait(`document.querySelector('${root} [data-memory-list]')?.getAttribute('aria-busy') === 'false'`);
  await page.screenshot("/private/tmp/memory-v0-b4-ui-v2-conflict-read-20261104.png");
  assert.equal(await page.evaluate(`document.querySelector('${row} .memory-text')?.textContent`), currentText,
    "a new successful management read can show the current authorized version after a rejected deletion");
  assert.equal(String(await page.evaluate("document.body.textContent")).includes(oldText), false, "the delayed pre-decision history cannot return the old body");
  assert.equal(deliveries[0]!.expected_version, saved.version);
  const before = String(await page.evaluate(`document.querySelector('${root} [data-memory-error]').textContent`));
  await page.click(root + " [data-memory-retry]");
  await page.wait(`document.querySelector('${root} [data-memory-error]')?.checkVisibility() && document.querySelector('${root} [data-memory-error]').textContent !== ${JSON.stringify(before)}`);
  assert.deepEqual(statuses, [409, 409]); assert.deepEqual(deliveries[1], deliveries[0]);
  assert.equal((await client.invoke(memoryActions.page, { scope: "project" })).items[0]!.version, updated.version);
  assert.deepEqual(inspectMemoryForgetting(env.home).decisions, []);
});


// A fresh Host process reopens the same scratch Home; no browser command or memory body is carried into it.
const recoveryHostProgram = `
import { MolisWorkLocalHost, projectActionAvailability, ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { createMolisWorkWebServer } from "./dist/web/server.js";
const home = process.argv[1];
let catalog;
const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null,
  workspacesFor: id => catalog({ homeDirectory: home }, current => current.listWorkspaceDirectory(id)),
  actionAvailability: projectActionAvailability((settings, work) => catalog(settings, work), home) });
catalog = host.configurePersonalPlanning(home, host.ensureWebCatalog(home, openMolisWorkProjectCatalog).withCatalog);
const system = ensureSystemAgentService(host, home); await system.ready;
const capability = system.agentHost.adapter("prologue").memory;
if (process.argv[2] === "pending") {
  const original = capability.withCaller.bind(capability);
  const wrap = bound => ({ ...bound, withExecution: control => wrap(bound.withExecution(control)),
    remove: async () => { throw new Error("B4 real process physical cleanup interrupted"); },
    clearScope: async () => { throw new Error("B4 real process physical scope interrupted"); } });
  capability.withCaller = caller => wrap(original(caller));
}
const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host });
const connections = new Set();
server.on("connection", socket => { connections.add(socket); socket.once("close", () => connections.delete(socket)); });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
process.send({ ready: true, origin: "http://127.0.0.1:" + server.address().port });
process.on("message", async message => {
  if (message.kind === "count") {
    const bound = capability.withCaller({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: message.project,
      consumer: "ui", person: true, current_scene: "common", purpose: "management" });
    process.send({ count: (await bound.list("project", message.project)).length });
  }
  if (message.kind === "close") {
    const done = new Promise(resolve => server.close(resolve)); server.closeAllConnections();
    for (const socket of connections) socket.destroy();
    await done; await host.close(); process.exit(0);
  }
});
`;

async function recoveryHost(home: string, pending: boolean) {
  const child = spawn(process.execPath, ["--input-type=module", "-e", recoveryHostProgram, home, pending ? "pending" : "ready"],
    { cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  let diagnostics = ""; child.stderr?.on("data", value => { diagnostics = (diagnostics + String(value)).slice(-16000); });
  child.stdout?.on("data", value => { diagnostics = (diagnostics + String(value)).slice(-16000); });
  const ready = await new Promise<{ origin: string }>((resolve, reject) => {
    child.once("error", reject); child.once("exit", code => reject(new Error(`Recovery Host exited ${code}: ${diagnostics}`)));
    child.once("message", value => resolve(value as { origin: string }));
  });
  return { origin: ready.origin,
    count(project: string) { return new Promise<number>(resolve => { child.once("message", value => resolve((value as { count: number }).count)); child.send({ kind: "count", project }); }); },
    async close() { if (child.exitCode !== null) return; const done = new Promise<void>(resolve => child.once("exit", () => resolve())); child.send({ kind: "close" }); await done; },
  };
}

test("B4 accepted deletion is discovered after leaving and a real Host process restart, then the original request physically completes", { timeout: 60_000 }, async t => {
  const executable = locateTestChrome(); assert.ok(executable);
  const env = await openTestHome(t), project = await env.createProject("原操作进程重启续清");
  const client = bindActionClient(env.host.actionClient(project.reference), () => person(MEMORY_PERMISSIONS, project.project_id));
  const text = "跨进程已接受但物理待清理的独有正文";
  const saved = (await client.invoke(memoryActions.write, { scope: "project", text, kind: "convention" })).memory!;
  await env.close(); await env.host.close();
  let host = await recoveryHost(env.home, true); t.diagnostic("process 1 ready");
  const directory = await mkdtemp(join(tmpdir(), "memory-process-recovery-browser-")), browser = await ChromeHarness.start(directory, { executable });
  try {
    const page = await browser.page(), deliveries: Array<Record<string, unknown>> = [];
    browser.on("Network.requestWillBeSent", (params, sessionId) => {
      const request = params.request as { url?: string; postData?: string };
      if (sessionId === page.sessionId && request.url?.endsWith("/api/memory/change") && request.postData) deliveries.push(JSON.parse(request.postData));
    });
    await page.command("Network.enable"); await page.viewport(1440, 1000);
    await page.command("Page.navigate", { url: host.origin + `/projects/${project.project_id}/settings/memory` });
    await page.wait("[...document.querySelectorAll('[data-memory-settings]')].some(node => node.checkVisibility() && node.querySelector('[data-memory-list]')?.getAttribute('aria-busy') === 'false')");
    await page.evaluate("[...document.querySelectorAll('[data-memory-settings]')].find(node => node.checkVisibility()).dataset.processRecovery = ''");
    const root = "[data-process-recovery]", row = `${root} [data-memory-id="${saved.memory_id}"]`;
    await page.click(row + " summary[aria-label^=更多操作]");
    await page.evaluate(`document.querySelectorAll('${row} .memory-menu button').forEach(button => { if (button.textContent === '删除') button.dataset.processRemove = ''; })`);
    await page.click("[data-process-remove]"); await page.click("dialog.memory-confirm [data-memory-confirm-yes]");
    await page.wait(`document.querySelector('${root} [data-memory-retry]') && document.querySelector('${root} [data-memory-error]')?.textContent.includes('清理未完成')`);
    assert.equal(await host.count(project.project_id), 1, "accepted is not physical completion"); t.diagnostic("process 1 accepted and physically pending");
    assert.equal(String(await page.evaluate("document.body.textContent")).includes(text), false);
    assert.equal(String(await page.evaluate("JSON.stringify(Object.entries(localStorage))")).includes(text), false);
    await page.command("Page.navigate", { url: "about:blank" }); await page.wait("location.href === 'about:blank'");
    await host.close(); t.diagnostic("process 1 exited"); host = await recoveryHost(env.home, false); t.diagnostic("process 2 ready");
    const probe = await fetch(host.origin + `/projects/${project.project_id}/api/memory/operations?scope=project`, { headers: { origin: host.origin, "x-molis-work-control-token": env.controlToken } });
    t.diagnostic("process 2 operations: " + probe.status + " " + await probe.text());
    await page.command("Page.navigate", { url: host.origin + `/projects/${project.project_id}/settings/memory` });
    await page.wait("[...document.querySelectorAll('[data-memory-settings]')].some(node => node.checkVisibility() && node.querySelector('[data-memory-retry]') && node.querySelector('[data-memory-list]')?.getAttribute('aria-busy') === 'false')");
    await page.evaluate("[...document.querySelectorAll('[data-memory-settings]')].find(node => node.checkVisibility()).dataset.processRecovery = ''");
    t.diagnostic("process 2 page discovered original request");
    assert.equal(deliveries.length, 1, "discovery does not automatically execute cleanup");
    assert.equal(String(await page.evaluate("document.body.textContent")).includes(text), false);
    await page.click(root + " [data-memory-retry]");
    await page.wait(`!document.querySelector('${root} [data-memory-retry]') && document.querySelector('${root} [data-memory-list]')?.getAttribute('aria-busy') === 'false'`);
    assert.equal(deliveries.length, 2); assert.deepEqual(deliveries[1], deliveries[0]);
    assert.equal(deliveries[1]!.memory_id, saved.memory_id); assert.equal(deliveries[1]!.expected_version, saved.version);
    assert.equal(await host.count(project.project_id), 0);
    await page.screenshot("/private/tmp/memory-v0-b4-process-recovery-complete-20261104.png");
  } finally { await browser.close(); await host.close(); await rm(directory, { recursive: true, force: true }); }
});

test("B4 category selection previews original versions, cancels with zero effect, and disables exactly the selected rows", { timeout: 60_000 }, async t => {
  const executable = locateTestChrome(); assert.ok(executable);
  const env = await openTestHome(t), project = await env.createProject("分类固定选中批量");
  const client = bindActionClient(env.host.actionClient(project.reference), () => person(MEMORY_PERMISSIONS, project.project_id));
  const saved = [];
  for (const text of ["选中甲", "选中乙", "保留丙"]) saved.push((await client.invoke(memoryActions.write, { scope: "project", text, kind: "convention" })).memory!);
  const directory = await mkdtemp(join(tmpdir(), "memory-batch-browser-")), browser = await ChromeHarness.start(directory, { executable });
  try {
    const page = await browser.page(); await page.viewport(1440, 1000);
    await page.command("Page.navigate", { url: env.origin + `/projects/${project.project_id}/settings/memory` });
    await page.wait("[...document.querySelectorAll('[data-memory-settings]')].some(node => node.checkVisibility() && node.querySelector('[data-memory-list]')?.getAttribute('aria-busy') === 'false')");
    await page.evaluate("[...document.querySelectorAll('[data-memory-settings]')].find(node => node.checkVisibility()).dataset.batchTest = ''");
    const root = "[data-batch-test]";
    for (const item of saved.slice(0, 2)) await page.click(`${root} [data-memory-id="${item.memory_id}"] [data-memory-select]`);
    for (const [index, item] of saved.slice(0, 2).entries()) assert.match(await page.evaluate<string>(`document.querySelector('${root} [data-memory-id="${item.memory_id}"] [data-memory-selection-index]').textContent`), new RegExp(`第 ${index + 1} 项`));
    await page.click(root + ' [data-memory-batch-action="disable"]');
    await page.wait("document.querySelector('dialog.memory-confirm[open]')");
    await page.click("dialog.memory-confirm button.mw-btn--secondary");
    await page.wait("!document.querySelector('dialog.memory-confirm') && document.querySelector('[data-batch-test] [data-memory-list]')?.getAttribute('aria-busy') === 'false'");
    assert.ok((await client.invoke(memoryActions.page, { scope: "project" })).items.every(item => item.state === "active"));
    assert.equal((await client.invoke(memoryActions.operations, { scope: "project" })).items.some(item => item.kind === "batch"), false);
    await page.click(root + ' [data-memory-batch-action="disable"]'); await page.click("dialog.memory-confirm [data-memory-confirm-yes]");
    await page.wait("document.querySelector('[data-batch-test] [data-memory-batch-results]')?.textContent.includes('已完成') && document.querySelector('[data-batch-test] [data-memory-list]')?.getAttribute('aria-busy') === 'false'");
    const result = (await client.invoke(memoryActions.page, { scope: "project" })).items;
    assert.ok(result.filter(item => saved.slice(0, 2).some(one => one.memory_id === item.memory_id)).every(item => item.state === "disabled"));
    assert.equal(result.find(item => item.memory_id === saved[2]!.memory_id)!.state, "active");
    await page.screenshot("/private/tmp/memory-v0-b4-selected-batch-complete-20261104.png");
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});

for (const action of ["batch", "clear"] as const) test(`B4 ${action} physical failure keeps a visible bodyless original retry title`, { timeout: 60_000 }, async t => {
  const executable = locateTestChrome(); assert.ok(executable);
  const env = await openTestHome(t), project = await env.createProject("原批量待清理标题");
  const client = bindActionClient(env.host.actionClient(project.reference), () => person(MEMORY_PERMISSIONS, project.project_id));
  const text = "标题校验不可保留的待清理正文";
  const saved = (await client.invoke(memoryActions.write, { scope: "project", text, kind: "convention" })).memory!;
  const system = ensureSystemAgentService(env.host, env.home); await system.ready;
  const memory = system.agentHost.adapter("prologue").memory!, withCaller = memory.withCaller;
  const interrupt = (bound: AgentMemoryCapability): AgentMemoryCapability => ({ ...bound,
    withExecution: control => interrupt(bound.withExecution!(control)),
    applyBatch: async () => { throw new Error("physical batch interrupted"); },
    clearScope: async () => { throw new Error("physical scope interrupted"); },
  });
  t.mock.method(memory, "withCaller", caller => interrupt(withCaller(caller)));
  const directory = await mkdtemp(join(tmpdir(), "memory-original-title-")), browser = await ChromeHarness.start(directory, { executable });
  try {
    const page = await browser.page(); await page.viewport(1440, 1000);
    await page.command("Page.navigate", { url: env.origin + `/projects/${project.project_id}/settings/memory` });
    await page.wait("[...document.querySelectorAll('[data-memory-settings]')].some(node => node.checkVisibility() && node.querySelector('[data-memory-list]')?.getAttribute('aria-busy') === 'false')");
    await page.evaluate("[...document.querySelectorAll('[data-memory-settings]')].find(node => node.checkVisibility()).dataset.originalTitle = ''");
    const root = "[data-original-title]";
    if (action === "batch") {
      await page.click(`${root} [data-memory-id="${saved.memory_id}"] [data-memory-select]`);
      await page.click(root + ' [data-memory-batch-action="remove"]');
    } else await page.click(root + " [data-memory-clear]");
    await page.click("dialog.memory-confirm [data-memory-confirm-yes]");
    await page.wait(`document.querySelector('${root} [data-memory-retry]') && document.querySelector('${root} [data-memory-error]')?.textContent.includes('清理未完成')`);
    assert.equal(await page.evaluate<string>(`document.querySelector('${root} [data-memory-retry-list] strong').textContent`), action === "batch" ? "遗忘选中项" : "清空记忆");
    assert.equal(String(await page.evaluate("document.body.textContent")).includes(text), false);
    assert.equal(inspectMemoryForgetting(env.home).decisions.length, 1);
    assert.equal((await withCaller({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, consumer: "ui", person: true,
      current_scene: "common", purpose: "management" }).list("project", project.project_id)).length, 1);
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});


test("B4 v2 original clear is visible after a real Host restart and explicitly resumes the same fingerprint", { timeout: 60_000 }, async t => {
  const executable = locateTestChrome(); assert.ok(executable);
  const env = await openTestHome(t), project = await env.createProject("原清空重启继续");
  const client = bindActionClient(env.host.actionClient(project.reference), () => person(MEMORY_PERMISSIONS, project.project_id));
  const text = "清空已接受而物理待清理的独有正文";
  await client.invoke(memoryActions.write, { scope: "project", text, kind: "convention" });
  await env.close(); await env.host.close();
  let host = await recoveryHost(env.home, true);
  const directory = await mkdtemp(join(tmpdir(), "memory-clear-recovery-browser-")), browser = await ChromeHarness.start(directory, { executable });
  try {
    const page = await browser.page(), deliveries: Array<Record<string, unknown>> = [];
    browser.on("Network.requestWillBeSent", (params, sessionId) => {
      const request = params.request as { url?: string; postData?: string };
      if (sessionId === page.sessionId && request.url?.endsWith("/api/memory/clear") && request.postData) deliveries.push(JSON.parse(request.postData));
    });
    await page.command("Network.enable"); await page.viewport(1440, 1000);
    const visit = async () => {
      await page.command("Page.navigate", { url: host.origin + `/projects/${project.project_id}/settings/memory` });
      await page.wait("[...document.querySelectorAll('[data-memory-settings]')].some(node => node.checkVisibility() && node.querySelector('[data-memory-list]')?.getAttribute('aria-busy') === 'false')");
      await page.evaluate("[...document.querySelectorAll('[data-memory-settings]')].find(node => node.checkVisibility()).dataset.clearRecovery = ''");
    };
    const root = "[data-clear-recovery]";
    await visit(); await page.click(root + " [data-memory-clear]"); await page.wait("document.querySelector('dialog.memory-confirm [data-memory-confirm-yes]')"); await page.click("dialog.memory-confirm [data-memory-confirm-yes]");
    await page.wait(`document.querySelector('${root} [data-memory-retry]') && document.querySelector('${root} [data-memory-error]')?.textContent.includes('清理未完成')`);
    assert.equal(await host.count(project.project_id), 1, "accepted clear has not physically completed");
    assert.equal(inspectMemoryForgetting(env.home).decisions.length, 1);
    assert.equal(String(await page.evaluate("document.body.textContent")).includes(text), false);
    await page.command("Page.navigate", { url: "about:blank" }); await page.wait("location.href === 'about:blank'");
    await host.close(); host = await recoveryHost(env.home, false);
    await visit();
    await page.wait(`document.querySelector('${root} [data-memory-retry]')`);
    assert.equal(deliveries.length, 1, "reopening discovers, never automatically applies the clear");
    assert.equal(String(await page.evaluate("document.body.textContent")).includes(text), false);
    await page.click(root + " [data-memory-retry]");
    await page.wait(`!document.querySelector('${root} [data-memory-retry]') && document.querySelector('${root} [data-memory-clear-status]')?.textContent.includes('清空已完成')`);
    assert.equal(deliveries.length, 2); assert.deepEqual(deliveries[1], deliveries[0]);
    assert.equal(typeof deliveries[0]!.fingerprint, "string"); assert.equal(await host.count(project.project_id), 0);
    await page.screenshot("/private/tmp/memory-v0-b4-clear-recovery-v2-20261104.png");
  } finally { await browser.close(); await host.close(); await rm(directory, { recursive: true, force: true }); }
});
