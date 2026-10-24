import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ChromeHarness, locateTestChrome, type ChromePage } from "@molis-ai/molis-work-test-kit/browser";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MemoryService, characterOwner } from "@molis-ai/molis-work-service-memory";
import { MolisWorkLocalHost, ensureSystemAgentService, AssistantStore, ASSISTANT_STORE_NAME } from "@molis-ai/molis-work-app-local-host";
import { openMemoryLedger, openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { openTestHome, serveTestHost } from "./fixtures/test-home.js";
import { seedLegacyCandidate } from "./fixtures/memory-candidate-adoption.js";

const root = "[data-candidate-adoption-test]", row = `${root} [data-memory-candidate="old-pending"]`;
async function select(page: ChromePage, selector: string, value: string) {
  await page.wait(`document.querySelector(${JSON.stringify(selector)})?.closest('.mw-select-picker')`);
  await page.evaluate(`(() => { document.querySelector('[data-candidate-picker]')?.removeAttribute('data-candidate-picker');
    document.querySelector(${JSON.stringify(selector)}).closest('.mw-select-picker').setAttribute('data-candidate-picker', ''); })()`);
  await page.click("[data-candidate-picker] .mw-select-picker__trigger");
  await page.click(`.mw-select-picker__menu:popover-open [data-value="${value}"]`);
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

async function fixture(t: TestContext, fromAssistant: boolean | "character" = false) {
  const executable = locateTestChrome(); assert.ok(executable, "Chrome is required for the real candidate adoption journey");
  let browser: ChromeHarness | undefined, directory: string | undefined, host: MolisWorkLocalHost | undefined;
  let server: Awaited<ReturnType<typeof serveTestHost>> | undefined;
  // Close browser and the second Host before the original Home fixture removes its directory.
  t.after(async () => { await browser?.close(); await server?.close(); await host?.close(); if (directory) await rm(directory, { recursive: true, force: true }); });
  const env = await openTestHome(t), project = await env.createProject("Candidate adoption");
  const character = fromAssistant === "character" ? { id: "historical-reviewer", title: "Historical reviewer" } : undefined;
  let work: { work_id: string; title: string } | undefined;
  if (fromAssistant) {
    const db = openHomeSqliteDatabase(env.home, ASSISTANT_STORE_NAME);
    try {
      const created = new AssistantStore(db).create({ actor_id: LOCAL_PERSON_ACTOR_ID, title: "Review the historical suggestion",
        scope: { kind: "project", project_id: project.project_id }, origin: null, project_ref: project.reference });
      work = { work_id: created.work_id, title: created.title };
    }
    finally { db.close(); }
  }
  await env.close(); await env.host.close();
  await seedLegacyCandidate({ home: env.home, storageRoot: join(env.home, "agent-runtime"), project: project.project_id, id: "old-pending", at: Date.now(), work, character });
  host = new MolisWorkLocalHost({ homeDirectory: env.home, completeText: null });
  server = await serveTestHost(null, { home: env.home, host });
  const calls: Array<{ operation_id?: string; input: Parameters<MemoryService["accept"]>[2] }> = [];
  const original = MemoryService.prototype.accept;
  let loseReply = false;
  t.mock.method(MemoryService.prototype, "accept", async function(this: MemoryService, ...args: Parameters<MemoryService["accept"]>) {
    calls.push({ operation_id: args[0].operation_id, input: structuredClone(args[2]) });
    const result = await original.apply(this, args);
    if (loseReply) { loseReply = false; throw new Error("Reply lost after real candidate settlement"); }
    return result;
  });
  directory = await mkdtemp(join(tmpdir(), "molis-candidate-browser-"));
  browser = await ChromeHarness.start(directory, { executable });
  const page = await browser.page(); await page.viewport(1280, 900);
  const navigate = async (url: string) => {
    t.diagnostic(`Candidate journey navigation started: ${new URL(url).pathname}`);
    try { await page.command("Page.navigate", { url }); }
    catch (error) {
      t.diagnostic(JSON.stringify({ navigation: url, process: process.pid, host: host?.status() }));
      const state = await Promise.allSettled([
        browser!.command("Target.getTargets"),
        page.evaluate("({url:location.href,title:document.title,ready:document.readyState})"),
      ]);
      t.diagnostic(JSON.stringify(state));
      throw error;
    }
    t.diagnostic(`Candidate journey navigation answered: ${new URL(url).pathname}`);
  };
  await navigate(server.origin + `/projects/${project.project_id}/settings/memory`);
  await page.wait("[...document.querySelectorAll('[data-memory-settings]')].some(node => node.checkVisibility())");
  await page.evaluate(`document.querySelectorAll('[data-memory-settings]').forEach(node => { if (node.checkVisibility()) node.setAttribute('data-candidate-adoption-test', ''); })`);
  if (!character) await page.wait(`document.querySelector('${row}')`);
  const canonical = async () => {
    const system = ensureSystemAgentService(host!, env.home); await system.ready;
    const memory = system.agentHost.adapter("prologue").memory!.withCaller({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id,
      person: true, consumer: "ui", purpose: "management", current_scene: "common" });
    const scope = character ? "character" : "project", owner = character ? characterOwner(project.project_id, character.id) : project.project_id;
    return { candidates: await memory.candidates.list(scope, owner), entries: await memory.list(scope, owner) };
  };
  const ledger = () => {
    const owner = openMemoryLedger({ homeDirectory: env.home });
    try { return { candidates: owner.candidates(LOCAL_PERSON_ACTOR_ID) }; }
    finally { owner.close(); }
  };
  const restart = async () => {
    await navigate("about:blank"); await server!.close(); await host!.close();
    host = new MolisWorkLocalHost({ homeDirectory: env.home, completeText: null });
    server = await serveTestHost(null, { home: env.home, host }); return canonical();
  };
  return { page, calls, canonical, ledger, restart, navigate, work, origin: server.origin, projectId: project.project_id, loseNextReply: () => { loseReply = true; } };
}

async function choose(page: ChromePage) {
  await page.click(`${row} button.mw-btn--primary`);
  await page.wait(`document.querySelector('${row} textarea')`);
  assert.equal(await page.evaluate(`document.querySelector('${row} [data-memory-lifecycle]').value`), "");
  assert.equal(await page.evaluate(`document.querySelector('${row} [data-memory-expiry]').value`), "");
  assert.equal(await page.evaluate(`document.querySelectorAll('${row} [data-memory-scene]:checked').length`), 0);
  await select(page, `${row} [data-memory-candidate-kind]`, "project-decision");
  await page.click(`${row} [data-memory-scene][value=assistant]`);
  await select(page, `${row} [data-memory-lifecycle]`, "long-term");
  await select(page, `${row} [data-memory-expiry]`, "remove");
}

// Real historical candidate -> production settings/request/Action/SDK -> persistent ledger; only the lost response is injected.
test("CAND-05: old candidate choices cancel without writes, then a lost reply retries the identical decision and survives restart", { timeout: 120_000 }, async t => {
  const f = await fixture(t), before = await f.canonical();
  assert.equal(before.candidates[0]!.meta.classification, undefined); assert.equal(before.entries.length, 0);
  await choose(f.page); await f.page.fill(`${row} textarea`, "Use my explicitly chosen project decision."); await f.page.click(`${row} button[type=submit]`);
  await f.page.wait("document.querySelector('.memory-confirm[open]')");
  await f.page.click(".memory-confirm button:not([data-memory-confirm-yes])");
  await f.page.wait("!document.querySelector('.memory-confirm')");
  assert.equal(f.calls.length, 0); assert.deepEqual(await f.canonical(), before);
  // The canceled confirmation keeps the editable decision; only a confirmed dispatch freezes it.
  f.loseNextReply(); await f.page.click(`${row} button[type=submit]`); await f.page.click("[data-memory-confirm-yes]");
  await f.page.wait(`!document.querySelector('${root} [data-memory-error]').hidden`);
  assert.equal(f.calls.length, 1); const request = structuredClone(f.calls[0]);
  assert.equal(request!.input!.text, "Use my explicitly chosen project decision.");
  assert.deepEqual(request!.input!.formal, { kind: "project-decision", classification: { scenes: ["assistant"], lifecycle: "long-term" }, expires_at: null });
  assert.equal(request!.input!.expected_version, 1); assert.ok(request!.operation_id);
  assert.equal(await f.page.evaluate(`document.querySelector('${row} textarea') === null`), true);
  const committed = await f.canonical(); assert.equal(committed.entries.length, 1); assert.equal(committed.candidates[0]!.candidate_id, "old-pending");
  assert.equal(committed.candidates[0]!.state, "accepted"); assert.equal(committed.entries[0]!.meta.basis, undefined);
  assert.deepEqual(committed.entries[0]!.meta.evidence ?? [], []);
  await f.page.click(`${root} [data-memory-retries] button`);
  await f.page.wait(`!document.querySelector('${row}')`);
  assert.equal(f.calls.length, 2); assert.deepEqual(f.calls[1], request);
  assert.deepEqual(await f.canonical(), committed); assert.equal(f.ledger().candidates[0]!.state, "accepted");
  assert.deepEqual(await f.restart(), committed);
});


test("CAND-05: short-term adoption requires a typed future deadline and persists it separately from candidate waiting", { timeout: 120_000 }, async t => {
  const f = await fixture(t), before = await f.canonical();
  await f.page.click(`${row} button.mw-btn--primary`);
  await f.page.wait(`document.querySelector('${row} textarea')`);
  await f.page.click(`${row} [data-memory-scene][value=coding]`);
  await select(f.page, `${row} [data-memory-lifecycle]`, "short-term");
  await f.page.click(`${row} button[type=submit]`);
  await f.page.wait(`!document.querySelector('${root} [data-memory-error]').hidden`);
  assert.equal(f.calls.length, 0); assert.deepEqual(await f.canonical(), before);
  await select(f.page, `${row} [data-memory-expiry]`, "set");
  await enterDeadline(f.page, `${row} [data-memory-expires-at]`, 2099);
  const expected = await f.page.evaluate<string>(`new Date(2099, 9, 24, 16, 45, 30).toISOString()`);
  await f.page.click(`${row} button[type=submit]`); await f.page.click("[data-memory-confirm-yes]");
  await f.page.wait(`!document.querySelector('${row}')`);
  const after = await f.canonical(); assert.equal(after.entries.length, 1);
  assert.deepEqual(after.entries[0]!.meta.classification, { scenes: ["coding"], lifecycle: "short-term" });
  assert.equal(after.entries[0]!.meta.expires_at_ms, Date.parse(expected));
  assert.equal(after.candidates[0]!.created_at_ms, before.candidates[0]!.created_at_ms);
  assert.equal(after.candidates[0]!.meta.expires_at_ms, before.candidates[0]!.meta.expires_at_ms);
  assert.deepEqual(await f.restart(), after);
});

for (const scope of ["project", "character"] as const) test(`CAND-05: a real Assistant ${scope} candidate card opens its project decision with the same identity`, { timeout: 120_000 }, async t => {
  const f = await fixture(t, scope === "character" ? "character" : true), before = await f.canonical();
  assert.ok(f.work);
  await f.navigate(f.origin + `/projects/${f.projectId}`);
  await f.page.wait("document.querySelector('[data-assistant-panel]')");
  await f.page.evaluate(`document.dispatchEvent(new CustomEvent('molis:assistant-open', { detail: { work_id: ${JSON.stringify(f.work.work_id)} } }))`);
  const action = '[data-assistant-block="attention"] button[aria-label="去设置查看：Historical suggestion old-pending"]';
  await f.page.wait(`document.querySelector(${JSON.stringify(action)})?.checkVisibility()`);
  assert.equal(f.calls.length, 0); assert.deepEqual(await f.canonical(), before);
  await f.page.click(action);
  // The workbench opens settings inside its project shell and keeps the project root URL.
  await f.page.wait(`[...document.querySelectorAll('[data-memory-settings]')].some(node => node.checkVisibility() && node.dataset.memoryScope === 'project' && node.dataset.project === ${JSON.stringify(f.projectId)})`);
  await f.page.wait("[...document.querySelectorAll('[data-memory-settings]')].some(node => node.checkVisibility())");
  await f.page.evaluate(`document.querySelectorAll('[data-memory-settings]').forEach(node => { if (node.checkVisibility()) node.setAttribute('data-candidate-adoption-test', ''); })`);
  await f.page.wait(`document.querySelector('${row}')`);
  await choose(f.page);
  await f.page.click(`${row} .memory-editor-actions button.mw-btn--ghost`);
  await f.page.wait(`document.querySelector('${row} .memory-text')`);
  assert.equal(f.calls.length, 0); assert.deepEqual(await f.canonical(), before);
  if (scope === "character") {
    await choose(f.page); await f.page.click(`${row} button[type=submit]`); await f.page.click("[data-memory-confirm-yes]");
    await f.page.wait(`!document.querySelector('${row}')`);
    const after = await f.canonical(); assert.equal(after.entries.length, 1); assert.equal(after.candidates[0]!.state, "accepted");
    assert.equal(after.candidates[0]!.candidate_id, "old-pending"); assert.equal(f.calls[0]!.input!.expected_version, 1);
    const note = f.ledger().candidates[0]!; assert.equal(note.scope, "character"); assert.equal(note.project_id, f.projectId);
    assert.equal(note.owner, characterOwner(f.projectId, "historical-reviewer"));
    assert.deepEqual(await f.restart(), after);
  }
});
