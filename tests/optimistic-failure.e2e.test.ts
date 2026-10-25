import assert from "node:assert/strict";
import test from "node:test";
import { openJellyStore } from "@molis-ai/molis-work-plugin-jelly";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

// specs/visual-ui-experience VUX-31「乐观失败可恢复」: a change that shows at once (a tick, a drag to another place) and then fails is
// taken back, the person is told in the plugin's own notice, and the next try works. Chrome answers the real request with a 500
// (nothing else is mocked); each test then lets the same action through, so a page that stuck after one failure could not pass.

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
const MESSAGE = "保存没成功（测试）";

/** Answers every request matching `patterns` with a 500 until `stop()`; `count()` is how many it turned away. */
async function failRequests(browser: Browser, patterns: string[]) {
  let turned = 0;
  const off = browser.on("Fetch.requestPaused", (event, session) => {
    if (session !== browser.sessionId) return;
    turned++;
    void browser.command("Fetch.fulfillRequest", { requestId: String(event.requestId), responseCode: 500, responseHeaders: [{ name: "content-type", value: "application/json" }],
      body: Buffer.from(JSON.stringify({ error: MESSAGE, code: "test.failed" })).toString("base64") }, browser.sessionId);
  });
  await browser.command("Fetch.enable", { patterns: patterns.map((urlPattern) => ({ urlPattern, requestStage: "Request" })) }, browser.sessionId);
  return {
    count: () => turned,
    async stop() { off(); await browser.command("Fetch.disable", {}, browser.sessionId); },
  };
}
const wide = (browser: Browser) => browser.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, browser.sessionId);
const openPlugin = async (browser: Browser, plugin: string) => browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?openPlugin=${plugin}` }, browser.sessionId));

test("VUX-31: a Todo that could not be ticked stays open, says why, and ticks the next time", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor } = await pluginFrameBrowser(t, browser, "todo");
  await wide(browser); await openPlugin(browser, "todo");
  await waitFor("!!document.querySelector('[data-todo-quick-input]') && document.querySelector('[data-todo-loading]').hidden", 20_000);
  await evaluate(`(() => { const input = document.querySelector('[data-todo-quick-input]'); input.value = '今天写周报'; input.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-todo-quick]').requestSubmit(); })()`);
  await waitFor("document.querySelectorAll('[data-todo-row]').length === 1", 10_000);
  const state = () => evaluate<{ rows: number; done: boolean; note: string; error: boolean }>(`({ rows: document.querySelectorAll('[data-todo-row]').length, done: !!document.querySelector('[data-todo-done].is-done'),
    note: document.querySelector('[data-todo-note]').hidden ? '' : document.querySelector('[data-todo-note-text]').textContent, error: document.querySelector('[data-todo-note]').classList.contains('is-error') })`);
  const failing = await failRequests(browser, ["*io.molis.work.todo/items/*/status"]);
  try {
    await evaluate("document.querySelector('[data-todo-done]').click()");
    await waitFor("document.querySelector('[data-todo-note]') && !document.querySelector('[data-todo-note]').hidden", 10_000);
    const failed = await state();
    assert.deepEqual(failed, { rows: 1, done: false, note: MESSAGE, error: true }, "the item stays where it was and the note says why");
    assert.equal(failing.count(), 1);
  } finally { await failing.stop(); }
  await evaluate("document.querySelector('[data-todo-done]').click()");
  await waitFor("document.querySelector('[data-todo-note-text]').textContent.startsWith('已完成')", 10_000);
  assert.equal((await state()).error, false);
});

test("VUX-31: a note task that could not be saved is unticked again and the notice says why", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  const { evaluate, waitFor } = await pluginFrameBrowser(t, browser, "jelly");
  const store = openJellyStore(browser.homeDirectory);
  try { store.execute({ type: "note.create", id: "task-note", title: "出差清单", markdown: "- [ ] 订机票\n- [ ] 订酒店" }, store.read().revision); } finally { store.close(); }
  await wide(browser); await openPlugin(browser, "jelly");
  await waitFor("!!document.querySelector('[data-jelly-content] [data-jelly-day]')", 20_000);
  await browser.evaluate(`document.querySelector('[data-work-surface="jelly"]').dispatchEvent(new CustomEvent('molis-work:select-item', { detail: { itemId: 'task-note' } }))`);
  await waitFor("document.querySelectorAll('[data-jelly-task-check]').length === 2", 10_000);
  const ticked = () => evaluate<boolean[]>("[...document.querySelectorAll('[data-jelly-task-check]')].map((box) => box.checked)");
  const failing = await failRequests(browser, ["*io.molis.work.jelly/commands"]);
  try {
    await evaluate("document.querySelector('[data-jelly-task-check]').click()");
    await waitFor("!document.querySelector('[data-jelly-notice]').hidden", 10_000);
    assert.deepEqual(await ticked(), [false, false], "the box the person ticked is unticked again");
    assert.equal(await evaluate("document.querySelector('[data-jelly-notice]').textContent"), MESSAGE);
    assert.equal(await evaluate("document.querySelector('[data-jelly-notice]').classList.contains('is-error')"), true);
    assert.equal(failing.count(), 1);
  } finally { await failing.stop(); }
  await evaluate("document.querySelector('[data-jelly-task-check]').click()");
  await waitFor("[...document.querySelectorAll('[data-jelly-task-check]')].map((box) => box.checked).join() === 'true,false'", 10_000);
});

test("VUX-31: an item dropped on another day that could not be moved stays on its day and the notice says why", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  const { evaluate, waitFor } = await pluginFrameBrowser(t, browser, "jelly");
  const now = new Date(), day = (offset: number) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const store = openJellyStore(browser.homeDirectory);
  try { store.execute({ type: "item.create", item: { id: "drag-a", title: "拖动的事项", kind: "task", start_date: day(0), end_date: day(0) } }, store.read().revision); } finally { store.close(); }
  await wide(browser); await openPlugin(browser, "jelly");
  await waitFor("!!document.querySelector('[data-jelly-content] [data-jelly-day]')", 20_000);
  await evaluate("document.querySelector('[data-jelly-mode=week]').click()");
  await waitFor("!!document.querySelector('[data-jelly-occurrence=\"drag-a\"]') && document.querySelectorAll('[data-jelly-day]').length > 1", 10_000);
  // Any other day of the week on the page is a place to drop it.
  const target = await evaluate<string>(`[...document.querySelectorAll('[data-jelly-day]')].map((node) => node.dataset.jellyDay).find((value) => value !== ${JSON.stringify(day(0))})`);
  const dropOn = () => evaluate(`(() => { const data = new DataTransfer(), item = document.querySelector('[data-jelly-occurrence="drag-a"]');
    item.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: data }));
    const cell = document.querySelector('[data-jelly-day="${target}"]');
    cell.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }));
    cell.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data })); })()`);
  const dayOfItem = () => evaluate<string>("document.querySelector('[data-jelly-occurrence=\"drag-a\"]').closest('[data-jelly-day]').dataset.jellyDay");
  assert.equal(await dayOfItem(), day(0));
  const failing = await failRequests(browser, ["*io.molis.work.jelly/commands"]);
  try {
    await dropOn();
    await waitFor("!document.querySelector('[data-jelly-notice]').hidden", 10_000);
    assert.equal(await dayOfItem(), day(0), "the item stays on its day");
    assert.equal(await evaluate("document.querySelector('[data-jelly-notice]').textContent"), MESSAGE);
    assert.equal(failing.count(), 1);
  } finally { await failing.stop(); }
  await dropOn();
  await waitFor(`document.querySelector('[data-jelly-occurrence="drag-a"]')?.closest('[data-jelly-day]')?.dataset.jellyDay === ${JSON.stringify(target)}`, 10_000);
});

test("VUX-31: a Shelf action dragged to another place that could not be saved goes back and the bar says why", { timeout: 120_000 }, async (t) => {
  const agentSetting = process.env.MOLIS_WORK_LOCAL_TOOLS;
  process.env.MOLIS_WORK_LOCAL_TOOLS = "off";
  t.after(() => { if (agentSetting === undefined) delete process.env.MOLIS_WORK_LOCAL_TOOLS; else process.env.MOLIS_WORK_LOCAL_TOOLS = agentSetting; });
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { navigate, command, sessionId, origin, projectId } = browser;
  const { evaluate, waitFor, click } = await pluginFrameBrowser(t, browser, "shelf");
  await wide(browser);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] }, sessionId);
  // Shelf is the side panel's first tab; the panel's own document is then opened as its frame loads it.
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await browser.waitFor("document.documentElement.dataset.resolvedTheme === 'light'");
  await browser.waitFor("document.querySelector('[data-side-toggle]')");
  await browser.click("[data-side-toggle]");
  await browser.waitFor("document.querySelector('#side-panel [role=tab][aria-selected=true]')?.dataset.sideTab === 'plugin:shelf/side'");
  await browser.waitFor(`document.querySelector('[data-side-body="plugin:shelf/side"] iframe')?.getAttribute('src') === ${JSON.stringify(`/projects/${projectId}/side/shelf/side`)}`);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/side/shelf/side` }, sessionId));
  await waitFor("document.documentElement.dataset.resolvedTheme === 'light' && document.querySelector('[data-shelf-stage-shell]')", 8_000);
  await waitFor("[...document.querySelectorAll('[data-shelf-list=materials] [data-shelf-item]')].some(row => row.dataset.shelfName === '试用示例.pdf')", 20_000);
  await click('[data-shelf-list="materials"] [data-shelf-item][data-shelf-name="试用示例.pdf"]');
  await waitFor("document.querySelectorAll('[data-shelf-act-slot]').length > 1", 10_000);
  await click("[data-shelf-more]");
  await waitFor("document.querySelector('[data-shelf-more-menu]') && !document.querySelector('[data-shelf-more-menu]').hidden");
  await click("[data-shelf-arrange]");
  await waitFor("document.querySelector('[data-shelf-act-slot]').draggable === true", 10_000);
  const order = () => evaluate<string[]>("[...document.querySelectorAll('[data-shelf-bar] [data-shelf-act-slot]')].map((node) => node.dataset.shelfActSlot)");
  const before = await order();
  const dragFirstOverLast = () => evaluate(`(() => { const data = new DataTransfer(), slots = [...document.querySelectorAll('[data-shelf-bar] [data-shelf-act-slot]')], bar = document.querySelector('[data-shelf-bar]');
    slots[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: data }));
    slots[slots.length - 1].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }));
    bar.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data })); })()`);
  const failing = await failRequests(browser, ["*io.molis.work.shelf/settings"]);
  try {
    await dragFirstOverLast();
    await waitFor("!document.querySelector('[data-shelf-bar-hint]').hidden && document.querySelector('[data-shelf-bar-hint]').textContent === " + JSON.stringify(MESSAGE), 10_000);
    assert.deepEqual(await order(), before, "the action goes back to where it was");
    assert.equal(failing.count(), 1);
  } finally { await failing.stop(); }
  await dragFirstOverLast();
  await waitFor(`document.querySelector('[data-shelf-bar] [data-shelf-act-slot]').dataset.shelfActSlot !== ${JSON.stringify(before[0])}`, 10_000);
  assert.deepEqual((await order()).slice(-1), [before[0]], "the same drag the next time is kept");
});
