import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// W3-10-1b in the Workbench, in a real browser with the real clipboard: a request that fails shows the diagnostic ID only when the
// Host kept a record of the call to look it up by (spec §1, 2026-10-10 「只在查得到时显示」), and says plainly when the answer never came
// (2026-10-10 「没有自己重发办法的页面保存时断线」). Chrome is required.
//
//  1. A failure of a call the Host recorded (the memory page's 停用 of a memory that was deleted elsewhere, `memory.change` → 404
//     `memory.not_found`): the page's error area carries 诊断编号 and a click copies the whole ID; the diagnostics page finds the call by it.
//  2. A write the connection loses: the page does not know whether it happened, and says so, in the person's language, with no ID.
//  3. A failure the Host does not record (a model provider saved with an address the Host refuses, a management write that does not go
//     through the action service): the Host puts no call number on the answer, and the page shows no 诊断编号, because nothing could
//     be looked up by it.

interface Answer { url: string; status: number; header: string | null; text: string }

/** Keeps what the Host answered to the requests of the page (the body and the call number header) so the test can compare them with what is shown. */
const RECORD_ANSWERS = `(() => {
  const original = window.fetch.bind(window);
  window.__answers = [];
  window.fetch = async (...args) => {
    const response = await original(...args);
    const copy = response.clone();
    copy.text().then(text => window.__answers.push({ url: String(args[0] instanceof Request ? args[0].url : args[0]), status: response.status, header: response.headers.get('x-molis-work-call-id'), text }));
    return response;
  };
})()`;

const answersFor = async (evaluate: <T>(expression: string) => Promise<T>, part: string): Promise<Answer[]> =>
  evaluate<Answer[]>(`window.__answers.filter(answer => answer.url.includes(${JSON.stringify(part)}))`);

test("a failure the Host recorded shows its diagnostic ID, which copies whole and finds the call; one it did not record shows none; a lost write says it is unknown", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null);
  if (!browser) return;
  const { origin, projectId, localHost, sessionId, command, evaluate, waitFor, click, navigate } = browser;
  assert.ok(localHost?.callLog, "the Host keeps a call log");
  await command("Browser.grantPermissions", { origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  const prefix = `/projects/${projectId}`;
  const open = (settings: string) => navigate(() => command("Page.navigate", { url: `${origin}${prefix}/?settingsPath=${encodeURIComponent(settings)}` }, sessionId));
  const text = (selector: string) => evaluate<string | null>(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);

  // ---- 1. A recorded failure ------------------------------------------------------------------------------------------------------
  await open("/settings/memory");
  await waitFor("document.querySelector('[data-memory-settings] [data-memory-add]') && typeof molisWorkRequest === 'function'", 20_000);
  const memoryId = (await evaluate<{ memory?: { memory_id: string }; memory_id?: string }>(
    "molisWorkRequest('/api/memory/items', { body: { scope: 'personal', text: '周报用要点列表，每条一句', kind: 'preference' } })")).memory?.memory_id;
  assert.ok(memoryId, "a memory was written");
  await open("/settings/memory");
  const row = `[data-memory-settings] [data-memory-id="${memoryId}"]`;
  await waitFor(`!!document.querySelector(${JSON.stringify(row)})`, 20_000);
  // Deleted somewhere else (a second window, the assistant) while this page still shows it.
  await evaluate(`molisWorkRequest('/api/memory/change', { body: { memory_id: ${JSON.stringify(memoryId)}, action: 'remove' } })`);
  await evaluate(RECORD_ANSWERS);
  await click(`${row} button[aria-label^="停用"]`);
  const errorButton = "[data-memory-settings] [data-memory-error] [data-molis-call-id]";
  await waitFor(`!!document.querySelector(${JSON.stringify(errorButton)})`, 15_000);

  const [refused] = await answersFor(evaluate, "/api/memory/change");
  assert.ok(refused, "the page's request was answered");
  const body = JSON.parse(refused.text) as { error: string; code: string; call_id?: string };
  assert.equal(refused.status, 404);
  assert.equal(body.code, "memory.not_found");
  assert.match(body.call_id ?? "", /^[0-9a-f-]{36}$/, "the Host put the call's ID in the body of the answer, because it recorded the call");
  assert.equal(refused.header, body.call_id, "and it is the one in the header");
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(errorButton)}).textContent`), `诊断编号 ${body.call_id!.slice(0, 8)}`, "the short form a person sees");
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(errorButton)}).dataset.molisCallId`), body.call_id, "carrying the whole ID");
  assert.equal(await evaluate("document.querySelector('[data-memory-settings] [data-memory-error]').firstChild.textContent"), body.error, "after the Host's own words");
  assert.equal(await evaluate("document.querySelector('[data-memory-settings] [data-memory-error]').hidden"), false);
  // The reason also shows where the person is (the toast), with the same button, and the toast does not run away from a pointer on it.
  await waitFor("!!document.querySelector('[data-toast].is-error [data-molis-call-id]')", 5_000);

  await click(errorButton);
  assert.equal(await evaluate("navigator.clipboard.readText()"), body.call_id, "a click copies the whole ID, not the short form");
  assert.equal(await text(errorButton), "已复制");

  // The diagnostics page finds the call by the short form a person copied.
  await open(`/settings/diagnostics?call=${body.call_id!.slice(0, 8)}`);
  const panel = "[data-work-surface=settings] [data-settings-panel=diagnostics]";
  await waitFor(`!!document.querySelector(${JSON.stringify(panel + " [data-call-row]")})`, 20_000);
  assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(panel + " [data-call-row]")}).length`), 1, "one operation");
  const found = await text(panel + " [data-call-row]");
  assert.match(found ?? "", /memory\.change@/, "the call that failed");
  assert.match(found ?? "", new RegExp(`诊断编号 ${body.call_id!.slice(0, 8)}`));
  assert.match(found ?? "", /失败/);
  const logged = localHost.callLog.find(body.call_id!.slice(0, 8));
  assert.deepEqual(logged.map(entry => entry.code), ["memory.not_found"], "and the log row has the code of the answer");

  // ---- 2. A write the connection loses ------------------------------------------------------------------------------------------------
  await open("/settings/memory");
  await waitFor("document.querySelector('[data-memory-settings] [data-memory-add]') && typeof molisWorkRequest === 'function'", 20_000);
  const kept = (await evaluate<{ memory?: { memory_id: string } }>(
    "molisWorkRequest('/api/memory/items', { body: { scope: 'personal', text: '连接断开时保持原样', kind: 'preference' } })")).memory?.memory_id;
  await open("/settings/memory");
  const keptRow = `[data-memory-settings] [data-memory-id="${kept}"]`;
  await waitFor(`!!document.querySelector(${JSON.stringify(keptRow)})`, 20_000);
  await command("Network.enable", {}, sessionId);
  await command("Network.setBlockedURLs", { urls: [`${origin}${prefix}/api/memory/change`, `${origin}/api/memory/change`] }, sessionId);
  await click(`${keptRow} button[aria-label^="停用"]`);
  await waitFor("!document.querySelector('[data-memory-settings] [data-memory-error]').hidden", 15_000);
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);
  assert.equal(await text("[data-memory-settings] [data-memory-error]"), "不知道这次操作有没有完成，请刷新后核对", "no browser English, and no pretending it is known");
  assert.equal(await evaluate("document.querySelectorAll('[data-memory-settings] [data-memory-error] [data-molis-call-id]').length"), 0, "there is no call to look up");
  assert.equal((await evaluate<{ items: { memory_id: string; state: string }[] }>("molisWorkRequest('/api/memory/overview?scope=personal')")).items.find(item => item.memory_id === kept)?.state, "active",
    "and the write that got no answer did not happen");
  // ---- 3. A failure the Host does not record (last: the model page keeps what was typed, so leaving it would ask the person first) ----------
  await open("/settings/models");
  await waitFor("document.querySelector('[data-model-settings] [data-model-template]') && typeof molisWorkRequest === 'function'", 20_000);
  await evaluate(RECORD_ANSWERS);
  const setValue = (selector: string, value: string) => evaluate(`(() => { const field = document.querySelector(${JSON.stringify(selector)});
    field.value = ${JSON.stringify(value)}; field.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await click("[data-model-settings] [data-model-template=deepseek]");
  await waitFor("document.querySelector('[data-model-base-url]')?.value === 'https://api.deepseek.com'");
  await setValue("[data-model-base-url]", "ftp://models.invalid/v1");
  await setValue("[data-model-api-key]", "page-test-key-0123456789");
  await click("[data-model-save]");
  await waitFor("document.querySelector('[data-model-status]')?.hasAttribute('data-failed')", 15_000);
  const [unrecorded] = await answersFor(evaluate, "/api/settings/models/");
  assert.ok(unrecorded && unrecorded.status >= 400 && unrecorded.status < 500, `the Host refused the provider, got ${unrecorded?.status}`);
  assert.ok((await text("[data-model-status]"))?.length, "the reason shows as it always did");
  assert.equal(await text("[data-model-status]"), (JSON.parse(unrecorded.text) as { error: string }).error, "in the Host's own words");
  assert.equal(unrecorded.header, null, "the answer carries no call number in its header");
  assert.equal((JSON.parse(unrecorded.text) as { call_id?: string }).call_id, undefined, "nor in its body: no call was recorded, so nothing could be looked up");
  assert.equal(await evaluate("document.querySelectorAll('[data-model-settings] [data-molis-call-id], [data-toast] [data-molis-call-id]').length"), 0, "so the page shows no 诊断编号");

});
