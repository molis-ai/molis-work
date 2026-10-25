import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openTodoStore } from "./fixtures/plugin-home-stores.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { specEvidenceDirectory } from "./fixtures/review-evidence.js";

type Heard = { purpose: string; object?: { kind: string; id: string; title?: string }; text?: string; work_id?: string; materials?: Array<{ title: string; text: string }> };

for (const width of [1440, 390]) test(`Todo ${width}px: a todo is handed to the resident Assistant, its work shows on the todo, and handing it over again continues the same work`, { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
  const child = await pluginFrameBrowser(t, browser, "todo");
  const { evaluate, waitFor, click } = child;
  const store = openTodoStore(homeDirectory);
  const scope = { projectId, projectIds: [], actor: "user" as const, actorId: "test" };
  const made = store.create({ title: "给王总回电话", placement: "project", notes: "问预算" }, scope).item;
  // A draft the Assistant made and linked back, with where it opens.
  const item = store.link(made.id, { add: { kind: "outcome", subject: { kind: "pages_document", id: "doc-reply" }, title: "给王总的回电要点", outcome: "draft", open: { surface: "pages", id: "doc-reply" } } }, made.revision, scope).item;
  store.close();
  const output = new URL(`../${specEvidenceDirectory("specs/archive/todo-plugin/verification")}/`, import.meta.url);
  await mkdir(output, { recursive: true });
  const heard = async () => await browser.evaluate<Heard[]>("window.__heard");
  await command("Page.addScriptToEvaluateOnNewDocument", { source: "window.__heard = []; addEventListener('molis:assistant-message', event => window.__heard.push(event.detail));" }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=todo&openItem=${item.id}` }, sessionId));
  await waitFor("document.querySelector('[data-todo-field=title]')?.value === '给王总回电话'");
  assert.equal(await evaluate("document.querySelector('[data-todo-works-section]').hidden"), true, "还没有助理工作时不显示这一栏");
  assert.deepEqual(await evaluate("(() => { const draft = document.querySelector('[data-todo-links] [data-workbench-item-plugin]'); return draft && [draft.dataset.workbenchItemPlugin, draft.dataset.workbenchItemId, draft.textContent]; })()"),
    ["pages", "doc-reply", "给王总的回电要点"], "挂回的草稿可以从待办点开");

  // Handing over is the person's own click: the todo goes as the object, its details as material. No words are written for the
  // person (context-program §21.2 point 4): the todo waits in the Assistant's strip and the person says what to do with it.
  await click("[data-todo-delegate]");
  await browser.waitFor("window.__heard.some(message => message.purpose === 'delegate')");
  const [asked] = (await heard()).filter(message => message.purpose === "delegate");
  assert.deepEqual([asked!.object!.kind, asked!.object!.id, asked!.text, asked!.work_id], ["todo_item", item.id, undefined, undefined]);
  assert.match(asked!.materials![0]!.text, /说明：问预算/u);
  await browser.waitFor("(document.querySelector('[data-assistant-context-strip]:not([hidden])')?.textContent || '').includes('给王总回电话') && document.activeElement?.matches('[data-assistant-input]')", 10_000);
  assert.equal(await browser.evaluate("document.querySelector('[data-assistant-input]').value"), "", "nothing is typed for the person");
  assert.equal(await evaluate("document.querySelector('[data-todo-works-section]').hidden"), true, "and nothing starts before they send");
  await browser.evaluate(`(() => { const input = document.querySelector('[data-assistant-input]'); input.value = '帮我推进这件事'; input.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-assistant-composer]').requestSubmit(document.querySelector('[data-assistant-send]')); })()`);

  // The Assistant records the work against the todo; the todo lists it once, with where it stands.
  await waitFor("!document.querySelector('[data-todo-works-section]').hidden", 10_000);
  assert.equal(await evaluate("document.querySelectorAll('[data-todo-works] [data-todo-continue-work]').length"), 1, "同一项工作只列一次");
  assert.match(String(await evaluate("document.querySelector('[data-todo-works]').textContent")), /帮我推进这件事继续推进/u);
  const workId = String(await evaluate("document.querySelector('[data-todo-continue-work]').dataset.todoContinueWork"));
  assert.ok((await browser.evaluate("document.documentElement.scrollWidth <= window.innerWidth") && await evaluate("document.documentElement.scrollWidth <= window.innerWidth")), "不横向滚动");
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await writeFile(new URL(`todo-assistant-${width}.png`, output), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));

  // The Assistant's panel opens over the page; the person folds it away to come back to the todo.
  if (await browser.evaluate("Boolean(document.querySelector('[data-assistant-panel-close]')?.getClientRects().length)")) await browser.click("[data-assistant-panel-close]");
  // From the todo again: the same unfinished work goes on rather than a second one starting.
  await browser.evaluate("window.__heard = []");
  await click("[data-todo-delegate]");
  await browser.waitFor("window.__heard.some(message => message.purpose === 'delegate')");
  assert.equal((await heard()).find(message => message.purpose === "delegate")!.work_id, workId);
  // The todo waits in the strip for the person's words (once: this Home has no model, so the first Send kept what it carried);
  // they leave it out (×) and go back to the todo instead.
  const drop = "[data-assistant-context-strip]:not([hidden]) .assistant-strip-act[aria-label='不带上：待办「给王总回电话」']";
  await browser.waitFor(`Boolean(document.querySelector(${JSON.stringify(drop)}))`, 10_000);
  assert.equal(await browser.evaluate(`[...document.querySelectorAll(${JSON.stringify(drop)})].length`), 1, "the same todo handed over again is in hand once, even after a Send that did not go through");
  await browser.click(drop);
  await browser.waitFor("!(document.querySelector('[data-assistant-context-strip]')?.textContent || '').includes('待办「给王总回电话」')");
  if (await browser.evaluate("Boolean(document.querySelector('[data-assistant-panel-close]')?.getClientRects().length)")) await browser.click("[data-assistant-panel-close]");
  await browser.evaluate("window.__heard = []");
  await click(`[data-todo-continue-work="${workId}"]`);
  await browser.waitFor("window.__heard.some(message => message.purpose === 'delegate')");
  const going = (await heard()).find(message => message.purpose === "delegate")!;
  assert.deepEqual([going.work_id, going.text], [workId, undefined]);

  // A change made here tells the works that relate to the todo to read it again (not a request).
  if (await browser.evaluate("Boolean(document.querySelector('[data-assistant-panel-close]')?.getClientRects().length)")) await browser.click("[data-assistant-panel-close]");
  await browser.evaluate("window.__heard = []");
  await evaluate(`(() => { const notes = document.querySelector('[data-todo-field=notes]'); notes.value = '问预算，顺便约下周见面'; notes.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await browser.waitFor("window.__heard.some(message => message.purpose === 'change')", 10_000);
  assert.deepEqual((await heard()).find(message => message.purpose === "change")!.object!.id, item.id);
});
