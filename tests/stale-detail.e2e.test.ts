import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test from "node:test";
import { openCogniaStore } from "./fixtures/plugin-home-stores.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { sendBarrier } from "./fixtures/assistant-send-journey.js";

// specs/visual-ui-experience VUX-31「旧响应不覆盖新状态」: a list that opens what is picked in a detail shows what was picked last.
// The first pick's answer is held back in Chrome (a real request, nothing mocked) while the person picks another, or goes
// back to the list; when it arrives late it changes nothing. Before, Todo and Cognia opened the late one over it. (PPT
// holds its list while a deck opens, so a second pick waits.)

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type Case = { plugin: string; ready: string; pick: (id: string) => string; shown: string; back: string; closed: string; path: (id: string) => string; items: (browser: { homeDirectory: string; projectId: string; evaluate: <T>(expression: string) => Promise<T>; waitFor: (expression: string, ms?: number) => Promise<void> }) => Promise<Array<{ id: string; title: string }>> };
const CASES: Case[] = [
  { plugin: "todo", ready: "!!document.querySelector('[data-todo-quick-input]') && document.querySelector('[data-todo-loading]').hidden",
    pick: (id) => `document.querySelector('[data-todo-id="${id}"]').click()`, shown: "document.querySelector('[data-todo-field=title]').value",
    back: "document.querySelector('[data-todo-close], [data-todo-back], .plugin-stage-back')?.click()", closed: "document.querySelector('[data-todo=workbench]').getAttribute('data-expanded') === 'false'",
    path: (id) => `*io.molis.work.todo/items/${id}`,
    items: async ({ evaluate, waitFor }) => {
      for (const title of ["今天写甲报告", "今天写乙报告"]) {
        await evaluate(`(() => { const input = document.querySelector('[data-todo-quick-input]'); input.value = ${JSON.stringify(title)}; input.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-todo-quick]').requestSubmit(); })()`);
        await waitFor(`[...document.querySelectorAll('[data-todo-row]')].some((row) => row.textContent.includes(${JSON.stringify(title.slice(2))}))`, 10_000);
      }
      return evaluate("[...document.querySelectorAll('[data-todo-row]')].map((row) => ({ id: row.dataset.todoRow, title: row.querySelector('[data-todo-id]').textContent.includes('甲') ? '写甲报告' : '写乙报告' }))");
    } },
  { plugin: "cognia", ready: "document.querySelectorAll('[data-cognia-id]').length >= 2", pick: (id) => `document.querySelector('[data-cognia-id="${id}"]').click()`,
    shown: "document.querySelector('[data-cognia-heading]').textContent", back: "document.querySelector('[data-cognia-action=back]').click()",
    closed: "document.querySelector('[data-cognia-workspace]').hidden", path: (id) => `*io.molis.work.cognia/library/materials/${id}`,
    items: async ({ homeDirectory }) => { const store = openCogniaStore(homeDirectory); try { return ["甲资料", "乙资料"].map((title) => ({ id: store.createMaterial({ title, body: title + "的正文" }).id, title })); } finally { store.close(); } } },
];

for (const item of CASES) test(`VUX-31: ${item.plugin} shows what was picked last when an earlier pick answers late, and stays on the list after going back`, { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { evaluate, waitFor } = await pluginFrameBrowser(t,browser,item.plugin);
  const { command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  const open = () => navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=${item.plugin}` }, sessionId));
  const seeded = item.plugin === "todo" ? null : await item.items({ homeDirectory, projectId: projectId!, evaluate, waitFor });
  await open(); await waitFor(item.ready, 20_000);
  const [first, second] = seeded ?? await item.items({ homeDirectory, projectId: projectId!, evaluate, waitFor });
  // Another pick before the first answers.
  let barrier = await sendBarrier(browser as never, [{ urlPattern: item.path(first!.id), requestStage: "Request" }]);
  await evaluate(item.pick(first!.id)); let held = await barrier.next();
  await evaluate(item.pick(second!.id)); await waitFor(`${item.shown} === ${JSON.stringify(second!.title)}`, 10_000);
  await barrier.release(held); await pause(800);
  assert.equal(await evaluate(item.shown), second!.title, "the late answer for the first pick does not replace the second");
  await barrier.close();
  // Going back before the pick answers.
  await evaluate(item.back); await waitFor(item.closed, 10_000);
  barrier = await sendBarrier(browser as never, [{ urlPattern: item.path(first!.id), requestStage: "Request" }]);
  await evaluate(item.pick(first!.id)); held = await barrier.next();
  await evaluate(item.back); await pause(300);
  await barrier.release(held); await pause(800);
  assert.equal(await evaluate(item.closed), true, "a pick that answers after going back does not open");
  await barrier.close();
});
