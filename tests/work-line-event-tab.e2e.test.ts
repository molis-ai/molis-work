import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openTodoStore } from "./fixtures/plugin-home-stores.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/work-line §4.4: a press on an event of the line opens its tab in the Assistant's dialog. The event here is a plugin's
// (a todo planned for today), so nothing in the workbench knows its kind: the card is the platform's composed display.

const pad = (value: number) => String(value).padStart(2, "0");
const today = () => { const at = new Date(); return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`; };
const TAB = "document.querySelector('[data-assistant-tabs] .assistant-tab[data-current], .assistant-tab[data-current]')";
const INPUT = "document.querySelector('[data-assistant-composer] .mw-composer__input')";
const type = (words: string) => `(() => { const input = ${INPUT}; input.focus(); input.value = ${JSON.stringify(words)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`;

test("WLN-03 WLN-07 WLN-08 WLN-12 WLN-13: an event of the line opens as a tab of the dialog, with its composed card, its own draft, and words sent for it", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, homeDirectory, evaluate, waitFor, click } = browser;
  const store = openTodoStore(homeDirectory);
  const item = store.create({ title: "给王总回电话", placement: "project", notes: "问预算", planned_date: today() }, { projectId, projectIds: [], actor: "user" as const, actorId: "test" }).item;
  store.close();
  const subject = { kind: "todo_item", id: item.id };
  // The todo's event among the line's others (the demo project's Inbox and Feed put theirs there too).
  const PRESS = `[data-work-line] [data-work-event*="todo-planned:${item.id}"]`, EVENT = `document.querySelector(${JSON.stringify(PRESS)})`;
  // Every Send's body, as the page posted it.
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `window.__sent = []; (() => { const real = window.fetch; window.fetch = function (input, init) {
    try { const url = typeof input === 'string' ? input : input.url; if (/\\/api\\/assistant\\/send$/.test(new URL(url, location.href).pathname) && init && typeof init.body === 'string') window.__sent.push(JSON.parse(init.body)); } catch {}
    return real.apply(this, arguments); }; })();` }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));

  // The todo is on the line, from the page's one attention read.
  await waitFor(`${EVENT}?.textContent.includes('给王总回电话')`, 20_000);
  assert.equal(await evaluate(`${EVENT}.hasAttribute('aria-current')`), false, "nothing is focused at now");

  // WLN-07: a press opens the dialog on the event's tab; the event keeps its place and is outlined.
  await click(PRESS);
  await waitFor(`${TAB}?.dataset.tab === ${JSON.stringify(`event:todo_item:${item.id}`)}`);
  assert.equal(await evaluate("document.querySelector('[data-assistant-panel]').hidden"), false, "the dialog opened");
  assert.equal(await evaluate(`${EVENT}.getAttribute('aria-current')`), "true", "the line outlines the event whose tab is in front");
  assert.match(String(await evaluate(`${TAB}.textContent`)), /给王总回电话/u, "the tab carries the event's name");
  assert.equal(await evaluate(`Boolean(${TAB}.querySelector('.work-event-mark svg'))`), true, "and its owner's mark, as on the line");
  // WLN-03: the one input now speaks about the event.
  assert.equal(await evaluate(`${INPUT}.placeholder`), "关于这件事");
  assert.match(String(await evaluate("document.querySelector('[data-assistant-composer]').textContent")), /给王总回电话/u, "the receiver tag names the event");

  // WLN-08: the card is the platform's composed display of the event's object.
  await waitFor("(document.querySelector('[data-assistant-event-card]')?.textContent || '').includes('给王总回电话')", 15_000);
  assert.equal(await evaluate("document.querySelector('[data-assistant-event-card]').compareDocumentPosition(document.querySelector('[data-assistant-thread]') || document.body) & Node.DOCUMENT_POSITION_CONTAINS ? true : false"), true, "the card sits in the conversation");
  const shot = new URL("../.impeccable/qa/review/work-line/", import.meta.url);
  await mkdir(shot, { recursive: true });
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await writeFile(new URL("event-tab-1440.png", shot), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));

  // WLN-13: words half written here stay here; the main conversation's box is its own.
  await evaluate(type("先问预算"));
  await click(".assistant-tab[data-main] .assistant-tab-main");
  await waitFor(`${TAB}?.hasAttribute('data-main') && ${INPUT}.value === ''`);
  assert.equal(await evaluate(`${EVENT}.hasAttribute('aria-current')`), false, "back at now the line outlines nothing");
  assert.notEqual(await evaluate(`${INPUT}.placeholder`), "关于这件事");
  await click(PRESS);
  await waitFor(`${TAB}?.dataset.tab?.startsWith('event:') && ${INPUT}.value === '先问预算'`);

  // WLN-12: sent here, the words start a work done for this event — not the main conversation, not another work.
  await evaluate("document.querySelector('[data-assistant-composer] [data-composer-send]').click()");
  await waitFor("window.__sent.length > 0");
  const [sent] = await evaluate<Array<{ text: string; main?: boolean; for_event?: unknown; scope?: unknown; work_id?: string }>>("window.__sent");
  assert.deepEqual([sent!.text, sent!.for_event, sent!.main, sent!.work_id, sent!.scope], ["先问预算", subject, undefined, undefined, { kind: "project", project_id: projectId }]);
  const works = `fetch(${JSON.stringify(`/projects/${projectId}/api/assistant/works`)}).then(response => response.json()).then(body => body.works)`;
  await waitFor(`${works}.then(list => list.some(work => (work.serves || []).some(one => one.id === ${JSON.stringify(item.id)})))`, 15_000);
  const made = (await evaluate<Array<{ work_id: string; main?: boolean; serves?: unknown }>>(works)).filter(work => !work.main);
  assert.deepEqual(made.map(work => work.serves), [[subject]], "one work, done for the event");
  await waitFor(`${TAB}?.dataset.tab === ${JSON.stringify(`event:todo_item:${item.id}`)} && !document.querySelector(${JSON.stringify(`.assistant-tab[data-tab="${made[0]!.work_id}"]`)})`);
  // The line now shows the event with a task behind it (the work serves it), and it is still the focused one.
  await waitFor(`${EVENT}?.getAttribute('aria-current') === 'true'`);

  // Closing the tab goes back to now.
  await click(".assistant-tab[data-current] .assistant-tab-close");
  await waitFor(`${TAB}?.hasAttribute('data-main')`);
  assert.equal(await evaluate(`${EVENT}.hasAttribute('aria-current')`), false);
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true, "no sideways scroll");

  // The card route answers only for an event that is on the person's line.
  const refused = await evaluate<{ status: number; code?: string }>(`fetch(${JSON.stringify(`/projects/${projectId}/api/mainline/event/surfaces`)}, { method: 'POST', headers: { 'content-type': 'application/json', ...(globalThis.molisWorkControlHeaders?.() || {}) },
    body: JSON.stringify({ subject: { kind: 'todo_item', id: 'not-on-the-line' } }) }).then(async response => ({ status: response.status, code: (await response.json().catch(() => ({}))).error?.code }))`);
  assert.equal(refused.status >= 400, true, "an object that is not on the line gets no card");
});
