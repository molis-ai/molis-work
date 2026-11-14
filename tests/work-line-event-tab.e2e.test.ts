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

  // WLN-36: the work is a task behind the event. Its row in the panel opens its card in the panel's place: whom it is done for,
  // one step to that event's tab, and 「改」 to move it — off the event it stands on the line as an event of its own, and back.
  const CARD = "document.querySelector('[data-work-task-float] [data-task-card]')";
  await waitFor("document.querySelector('[data-task-mark] [data-background-tasks-count]')?.textContent === '1'", 20_000);
  await click("[data-task-mark]");
  await waitFor("document.querySelector('[data-work-task-float] [data-task-open]')");
  assert.match(String(await evaluate("document.querySelector('[data-work-task-float] .work-task-row').textContent")), /先问预算.*给王总回电话/u, "the row names the event it is done for");
  await click("[data-work-task-float] [data-task-open]");
  await waitFor(`${CARD} && document.activeElement?.matches('[data-task-panel-list]')`);
  assert.match(String(await evaluate(`${CARD}.querySelector('.work-task-facts').textContent`)), /为哪个事件给王总回电话/u);
  await click("[data-work-task-float] [data-place-change]");
  await waitFor("document.querySelector('[data-place-menu]')");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-place-menu] [aria-checked=\"true\"]')].map(item => item.textContent.trim())"), ["给王总回电话"], "the menu ticks where it is now");
  await click('[data-place-menu] [data-place-to="new_event"]');
  await waitFor(`${works}.then(list => list.some(work => work.work_id === ${JSON.stringify(made[0]!.work_id)} && !(work.serves || []).length))`, 15_000);
  await waitFor(`/为哪个事件先问预算/u.test(${CARD}?.querySelector('.work-task-facts').textContent || '') && [...document.querySelectorAll('[data-work-line] [data-work-event]')].some(node => node.textContent.includes('先问预算'))`, 20_000);
  await click("[data-work-task-float] [data-place-change]");
  await click(`[data-place-menu] [data-place-event*="todo-planned:${item.id}"]`);
  await waitFor(`${works}.then(list => list.some(work => work.work_id === ${JSON.stringify(made[0]!.work_id)} && (work.serves || []).some(one => one.id === ${JSON.stringify(item.id)})))`, 15_000);
  await waitFor(`/为哪个事件给王总回电话/u.test(${CARD}?.querySelector('.work-task-facts').textContent || '')`, 20_000);
  // One step from the card to the event's tab; the list is one press back.
  await click(".assistant-tab[data-main] .assistant-tab-main");
  await waitFor(`${TAB}?.hasAttribute('data-main')`);
  await click("[data-work-task-float] [data-task-event]");
  await waitFor(`${TAB}?.dataset.tab === ${JSON.stringify(`event:todo_item:${item.id}`)}`);
  // (This Home has no model: the round could not start, so the Host keeps the words as the work's draft and the input still shows them.)
  assert.equal(await evaluate("document.querySelector('[data-toast]:not([hidden])')?.textContent || ''"), "", "nothing was refused on the way");
  await click("[data-work-task-float] [data-task-panel-list]");
  await waitFor(`!${CARD} && document.querySelector('[data-work-task-float] [data-task-open]')`);
  await writeFile(new URL("task-panel-1440.png", shot), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  await click("[data-work-task-float] [data-task-panel-close]");
  await waitFor("!document.querySelector('[data-work-task-float]')");

  // Closing the tab goes back to now.
  await click(".assistant-tab[data-current] .assistant-tab-close");
  await waitFor(`${TAB}?.hasAttribute('data-main')`);
  assert.equal(await evaluate(`${EVENT}.hasAttribute('aria-current')`), false);
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true, "no sideways scroll");

  // WLN-17: the keyboard reaches the line, moves along it, opens an event and comes back to now.
  const key = (init: string) => `(document.activeElement && document.activeElement !== document.body ? document.activeElement : document).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ${init} }))`;
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code: 'KeyL', key: 'l', altKey: true }))`);
  assert.equal(await evaluate("document.activeElement?.matches('[data-work-line] [data-wing=\"past\"] [data-work-event]:last-child')"), true, "Alt+L lands on the event beside now");
  const from = await evaluate<string>("document.activeElement.dataset.workEvent");
  await evaluate(key("key: 'ArrowRight'"));
  const to = await evaluate<string>("document.activeElement.dataset.workEvent");
  assert.ok(to && to !== from, "→ moves to the next event of the line");
  await evaluate(key("key: 'ArrowLeft'"));
  assert.equal(await evaluate("document.activeElement.dataset.workEvent"), from, "← moves back");
  await evaluate("document.activeElement.click()");
  await waitFor(`${TAB}?.dataset.tab?.startsWith('event:') && document.querySelector('[data-work-line] [data-work-event][aria-current]')?.dataset.workEvent === ${JSON.stringify(from)}`);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code: 'KeyL', key: 'l', altKey: true }))`);
  assert.equal(await evaluate("document.activeElement?.getAttribute('aria-current')"), "true", "with an event's tab in front, Alt+L lands on that event");
  await evaluate(key("key: 'Escape'"));
  await waitFor(`${TAB}?.hasAttribute('data-main') && document.activeElement === ${INPUT}`);
  assert.equal(await evaluate("document.querySelectorAll('[data-work-line] [data-work-event][aria-current]').length"), 0, "Esc on the line goes back to now");

  // The card route answers only for an event that is on the person's line.
  const refused = await evaluate<{ status: number; code?: string }>(`fetch(${JSON.stringify(`/projects/${projectId}/api/mainline/event/surfaces`)}, { method: 'POST', headers: { 'content-type': 'application/json', ...(globalThis.molisWorkControlHeaders?.() || {}) },
    body: JSON.stringify({ subject: { kind: 'todo_item', id: 'not-on-the-line' } }) }).then(async response => ({ status: response.status, code: (await response.json().catch(() => ({}))).error?.code }))`);
  assert.equal(refused.status >= 400, true, "an object that is not on the line gets no card");
});

test("WLN-18: at 390 the event's tab is a layer above the line's track and the one input, which stay in reach", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, homeDirectory, evaluate, waitFor, click } = browser;
  const store = openTodoStore(homeDirectory);
  const item = store.create({ title: "给王总回电话", placement: "project", planned_date: today() }, { projectId, projectIds: [], actor: "user" as const, actorId: "test" }).item;
  store.close();
  const PRESS = `[data-work-line] [data-work-event*="todo-planned:${item.id}"]`;
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor(`document.querySelector(${JSON.stringify(PRESS)})`, 20_000);
  await evaluate(`document.querySelector(${JSON.stringify(PRESS)}).scrollIntoView({ inline: 'center', block: 'nearest' })`);
  await click(PRESS);
  await waitFor(`${TAB}?.dataset.tab === ${JSON.stringify(`event:todo_item:${item.id}`)}`);
  await waitFor("(document.querySelector('[data-assistant-event-card]')?.textContent || '').includes('给王总回电话')", 15_000);
  const shot = new URL("../.impeccable/qa/review/work-line/", import.meta.url);
  await mkdir(shot, { recursive: true });
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await writeFile(new URL("event-tab-390.png", shot), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  const box = await evaluate<{ panel: number; track: number; input: number; width: boolean; small: number }>(`(() => { const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    return { panel: Math.round(rect('[data-assistant-panel]').bottom), track: Math.round(rect('[data-work-line-track]').top), input: Math.round(rect('[data-assistant-composer] .mw-composer__input').top),
      width: document.documentElement.scrollWidth <= window.innerWidth,
      small: [...document.querySelectorAll('[data-work-line] [data-work-event], .assistant-tab .assistant-tab-main, .assistant-tab .assistant-tab-close, [data-task-mark]')].filter(node => { const at = node.getBoundingClientRect(); return at.width > 0 && (at.height < 44 || at.width < 44); }).length }; })()`);
  assert.equal(box.width, true, "no sideways scroll");
  assert.ok(box.panel <= box.track + 1 && box.panel <= box.input + 1, `the dialog ends above the track and the input (${JSON.stringify(box)})`);
  assert.equal(box.small, 0, "every target on the line and the tab strip is at least 44px");
});

// WLN-32: under the reply that handed a task to the background the conversation says where the task went, with 「改」. This Home
// has no model, so no round begins and nothing delegates by itself: the page's read of the main conversation is given the round
// and one task it handed out — the work started for the event, with where the Host says it stands now — and everything after
// that read is the product's own.
test("WLN-32: the reply that handed a task out says where it went; 「改」 opens the task's card with where it can go, and the row follows the change", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, homeDirectory, evaluate, waitFor, click } = browser;
  const store = openTodoStore(homeDirectory);
  const item = store.create({ title: "给王总回电话", placement: "project", planned_date: today() }, { projectId, projectIds: [], actor: "user" as const, actorId: "test" }).item;
  store.close();
  const PRESS = `[data-work-line] [data-work-event*="todo-planned:${item.id}"]`;
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `window.__handed = null; (() => { const real = window.fetch; window.fetch = async function (input, init) {
    const response = await real.apply(this, arguments);
    try {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (!window.__handed || !/\\/api\\/assistant\\/(works\\/[^/]+|send$)/.test(url.pathname)) return response;
      // Every way the page gets the conversation: a read, the wait that follows it, the answer to a Send.
      const body = await response.clone().json(), view = body.view && body.view.work ? body.view : body;
      if (!view.work || !view.work.main || !Array.isArray(view.rounds)) return response;
      // (No model here: the words were kept as a draft and no round began. The reply that handed the task out is given too.)
      if (!view.rounds.length) view.rounds = [{ run_id: 'run-handed', text: '顺便订会议室', materials: [], context: null, started_at: view.work.created_at, phase: 'completed', turns: [], activity: [], awaiting_input: [] }];
      const child = (await real(url.pathname.replace(/\\/api\\/assistant\\/.*$/, '/api/assistant/works/' + encodeURIComponent(window.__handed))).then(read => read.json())).work, serves = child.serves || [];
      view.delegated = [{ work_id: child.work_id, title: child.title, state: child.state, follow_ups: 0, created_at: view.rounds[view.rounds.length - 1].started_at, ...(serves.length ? { serves } : { line_event: true }) }];
      return new Response(JSON.stringify(body), { status: response.status, headers: { "content-type": "application/json" } });
    } catch { return response; }
  }; })();` }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  const send = "document.querySelector('[data-assistant-composer] [data-composer-send]').click()";
  const works = `fetch(${JSON.stringify(`/projects/${projectId}/api/assistant/works`)}).then(response => response.json()).then(body => body.works)`;

  // A task done for the todo's event (the words said in its tab), then words in the main conversation.
  await waitFor(`document.querySelector(${JSON.stringify(PRESS)})?.textContent.includes('给王总回电话')`, 20_000);
  await click(PRESS);
  await waitFor(`${TAB}?.dataset.tab?.startsWith('event:')`);
  await evaluate(type("先问预算")); await evaluate(send);
  await waitFor(`${works}.then(list => list.some(work => (work.serves || []).some(one => one.id === ${JSON.stringify(item.id)})))`, 15_000);
  const task = (await evaluate<Array<{ work_id: string; main?: boolean }>>(works)).find(work => !work.main)!.work_id;
  await click(".assistant-tab[data-main] .assistant-tab-main");
  await waitFor(`${TAB}?.hasAttribute('data-main') && ${INPUT}.value === ''`);
  await evaluate(`window.__handed = ${JSON.stringify(task)}`);
  await evaluate(type("顺便订会议室")); await evaluate(send);
  // The answer to the Send is not a read of the work; coming back to the tab is.
  await waitFor(`${works}.then(list => list.some(work => work.main))`, 15_000);
  await click(PRESS);
  await waitFor(`${TAB}?.dataset.tab?.startsWith('event:')`);
  await click(".assistant-tab[data-main] .assistant-tab-main");
  await waitFor(`${TAB}?.hasAttribute('data-main')`);

  // The row stands under that reply: done for the event, by the event's name on the line.
  const ROW = `document.querySelector(${JSON.stringify(`[data-assistant-thread] [data-placed-task="${task}"]`)})`, WHERE = `${ROW}?.querySelector('.work-reply-placed-where')?.textContent`;
  await waitFor(`${WHERE} === '为「给王总回电话」办'`, 20_000);
  assert.equal(await evaluate(`${ROW}.previousElementSibling?.matches('.assistant-round')`), true, "it ends the reply that handed the task out");
  const button = await evaluate<{ name: string; border: string }>(`(() => { const node = ${ROW}.querySelector('[data-place-change]'); return { name: node.textContent.trim(), border: getComputedStyle(node).borderTopWidth }; })()`);
  assert.deepEqual(button, { name: "改", border: "1px" }, "「改」 is a button with an edge");
  const shot = new URL("../.impeccable/qa/review/work-line/", import.meta.url);
  await mkdir(shot, { recursive: true });
  await writeFile(new URL("reply-placed-1440.png", shot), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));

  // 「改」: the task's card in the background-task panel, with where it can go; the event it is on is ticked.
  await click(`[data-placed-task="${task}"] [data-place-change]`);
  await waitFor("document.querySelector('[data-work-task-float] [data-task-card] [data-place-menu]')", 20_000);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-place-menu] [aria-checked=\"true\"]')].map(node => node.textContent.trim())"), ["给王总回电话"]);
  // Moved: the work goes on as it was (same work, nothing started again), and the row, the line and the panel say the new place.
  const before = await evaluate<Array<{ work_id: string }>>(works);
  await click('[data-place-menu] [data-place-to="new_event"]');
  await waitFor(`${WHERE} === '新事件「先问预算」'`, 25_000);
  await waitFor("[...document.querySelectorAll('[data-work-line] [data-work-event]')].some(node => node.textContent.includes('先问预算'))", 20_000);
  assert.match(String(await evaluate("document.querySelector('[data-work-task-float] .work-task-facts').textContent")), /为哪个事件先问预算/u);
  assert.deepEqual((await evaluate<Array<{ work_id: string }>>(works)).map(work => work.work_id).sort(), before.map(work => work.work_id).sort(), "no work was started or ended by moving it");
  assert.equal(await evaluate("document.querySelector('[data-toast]:not([hidden])')?.textContent || ''"), "");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true, "no sideways scroll");
});

// WLN-03, WLN-40: 「发给」 on a project lists who can be spoken to at now and the line's own events. The Characters the project
// offers are the Host's answer; this project has published none, so the page's read of them is given one (nothing else is).
test("WLN-03 WLN-40: 「发给」 lists the Assistant, the Characters and the line's events; a Character chosen there has its own tab and draft, and the next Send is its main conversation's", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, homeDirectory, evaluate, waitFor, click } = browser;
  const store = openTodoStore(homeDirectory);
  const item = store.create({ title: "给王总回电话", placement: "project", planned_date: today() }, { projectId, projectIds: [], actor: "user" as const, actorId: "test" }).item;
  store.close();
  const editor = { artifact_id: "character:project:editor", version: 2 };
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `window.__sent = []; (() => { const real = window.fetch; window.fetch = async function (input, init) {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (/\\/api\\/assistant\\/send$/.test(url.pathname) && init && typeof init.body === 'string') window.__sent.push(JSON.parse(init.body));
    if (/\\/api\\/assistant\\/characters$/.test(url.pathname)) return new Response(JSON.stringify({ characters: [{ reference: ${JSON.stringify(editor)}, title: "严格的编辑", available: true }] }), { status: 200, headers: { "content-type": "application/json" } });
    return real.apply(this, arguments); }; })();` }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor(`document.querySelector('[data-work-line] [data-work-event*="todo-planned:${item.id}"]')?.textContent.includes('给王总回电话')`, 20_000);

  const MENU = "document.querySelector('[data-assistant-send-to]')", TAG = "document.querySelector('[data-assistant-composer] [data-composer-receiver]')";
  const rows = `[...${MENU}.querySelectorAll('[role=menuitemradio]')].map(item => item.getAttribute('aria-checked') + ':' + item.querySelector('[data-slot=menu-item-label] > span').textContent)`;
  const open = async () => { await evaluate(`${TAG}.click()`); await waitFor(`${MENU}.matches(':popover-open') && ${MENU}.textContent.includes('严格的编辑')`, 15_000); };
  const pick = (label: string) => evaluate(`[...${MENU}.querySelectorAll('[role=menuitemradio]')].find(item => item.textContent.includes(${JSON.stringify(label)})).click()`);

  // At now the Assistant is ticked; the events are the line's.
  await open();
  assert.deepEqual(await evaluate(`[...${MENU}.querySelectorAll('.mw-menu__label')].map(node => node.textContent)`), ["现在", "线上的事件"]);
  const listed = await evaluate<string[]>(rows);
  assert.deepEqual(listed.slice(0, 2), ["true:助理", "false:严格的编辑"]);
  const onLine = await evaluate<string[]>("[...document.querySelectorAll('[data-work-line] [data-work-event]:not([data-work-line-retry]) .work-event-name')].map(node => node.textContent)");
  assert.deepEqual(listed.slice(2).map(row => row.slice(row.indexOf(":") + 1)).sort(), [...onLine].sort(), "the same events as the line");
  assert.ok(listed.some(row => row === "false:给王总回电话"));
  assert.equal(await evaluate(`${MENU}.scrollWidth <= ${MENU}.clientWidth && [...${MENU}.querySelectorAll('[role=menuitemradio]')].every(item => item.getBoundingClientRect().height >= 32)`), true);
  const shot = new URL("../.impeccable/qa/review/work-line/", import.meta.url);
  await mkdir(shot, { recursive: true });
  await writeFile(new URL("send-to-1440.png", shot), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));

  // An event chosen here is the event's tab, as a press on the line.
  await pick("给王总回电话");
  await waitFor(`${TAB}?.dataset.tab === ${JSON.stringify(`event:todo_item:${item.id}`)} && !${MENU}.matches(':popover-open')`);
  await open();
  assert.ok((await evaluate<string[]>(rows)).includes("true:给王总回电话"), "the menu ticks what the tag shows");

  // WLN-40: a Character chosen here is who the box speaks to: its own tab, its name in the tag, a draft of its own.
  await pick("严格的编辑");
  await waitFor(`${TAB}?.dataset.tab === 'talk' && ${TAG}.textContent.includes('严格的编辑')`);
  assert.match(String(await evaluate(`${TAB}.textContent`)), /严格的编辑/u);
  await evaluate(type("帮我改改周报开头"));
  await open();
  assert.deepEqual((await evaluate<string[]>(rows)).slice(0, 2), ["false:助理", "true:严格的编辑"]);
  await pick("助理");
  await waitFor(`${TAB}?.hasAttribute('data-main') && ${INPUT}.value === ''`);
  assert.equal(await evaluate("Boolean(document.querySelector('.assistant-tab[data-tab=\"talk\"]'))"), false, "back with the Assistant, the Character's tab is not kept open for nothing");
  await evaluate(type("今天有什么要办"));
  await open(); await pick("严格的编辑");
  await waitFor(`${TAB}?.dataset.tab === 'talk' && ${INPUT}.value === '帮我改改周报开头'`);
  await open(); await pick("助理");
  await waitFor(`${TAB}?.hasAttribute('data-main') && ${INPUT}.value === '今天有什么要办'`);

  // The Send from the Character's tab is its main conversation's: main, with that Character, no work named and no event.
  await open(); await pick("严格的编辑");
  await waitFor(`${TAB}?.dataset.tab === 'talk' && ${INPUT}.value === '帮我改改周报开头'`);
  await evaluate("document.querySelector('[data-assistant-composer] [data-composer-send]').click()");
  await waitFor("window.__sent.length > 0");
  const [sent] = await evaluate<Array<{ text: string; main?: boolean; character?: unknown; work_id?: string; for_event?: unknown }>>("window.__sent");
  assert.deepEqual([sent!.text, sent!.main, sent!.character, sent!.work_id, sent!.for_event], ["帮我改改周报开头", true, editor, undefined, undefined]);
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true, "no sideways scroll");
});

// WLN-09, WLN-14: the card says who registered the event and lists the tasks done for it; parked, the same card stays open in the
// side panel's 「对话」 page while the dialog is closed, and what is pressed there is what is pressed in the dialog.
test("WLN-09 WLN-14: an event's card lists the tasks done for it; parked in the side panel it stays open, acts the same and goes back to the dialog", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, homeDirectory, evaluate, waitFor, click } = browser;
  const store = openTodoStore(homeDirectory);
  const item = store.create({ title: "给王总回电话", placement: "project", planned_date: today() }, { projectId, projectIds: [], actor: "user" as const, actorId: "test" }).item;
  store.close();
  const PRESS = `[data-work-line] [data-work-event*="todo-planned:${item.id}"]`, KEY = `todo_item:${item.id}`;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor(`document.querySelector(${JSON.stringify(PRESS)})?.textContent.includes('给王总回电话')`, 20_000);
  await click(PRESS);
  const CARD = `document.querySelector('[data-assistant-event-card] [data-event-card=${JSON.stringify(KEY)}]')`;
  await waitFor(`${CARD}?.querySelector('[data-card-body]')?.textContent.includes('给王总回电话')`, 15_000);
  // Who registered it, then how it stands; no task yet, so no 「在办」.
  assert.match(String(await evaluate(`${CARD}.querySelector('.work-card-facts').textContent`)), /^待办 登记/u);
  assert.equal(await evaluate(`${CARD}.querySelector('[data-card-tasks]').hidden`), true);

  // Words said here start a task done for the event: the card lists it, by the row the task panel gives the same task.
  await evaluate(type("先问预算"));
  await evaluate("document.querySelector('[data-assistant-composer] [data-composer-send]').click()");
  await waitFor(`${CARD}?.querySelector('[data-card-tasks] .work-task-row-title')?.textContent === '先问预算'`, 25_000);
  assert.equal(await evaluate(`${CARD}.querySelector('[data-card-tasks] h4').textContent`), "在办");
  assert.equal(await evaluate(`Boolean(${CARD}.querySelector('[data-card-tasks] .work-task-serves'))`), false, "inside its own event's card a row does not repeat the event");
  const shot = new URL("../.impeccable/qa/review/work-line/", import.meta.url);
  await mkdir(shot, { recursive: true });
  await writeFile(new URL("event-card-tasks-1440.png", shot), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));

  // WLN-14: parked — the card is in the side panel's 「对话」 page, the dialog is closed and the event's tab is put away.
  await click("[data-assistant-event-card] [data-event-park]");
  const SIDE = `document.querySelector('[data-side-body="conversation"] [data-event-card=${JSON.stringify(KEY)}]')`;
  await waitFor(`${SIDE} && !document.querySelector('[data-side-body="conversation"]').hidden && document.querySelector('[data-assistant-panel]').hidden`, 15_000);
  assert.equal(await evaluate("document.querySelector('[data-side-tab=\"conversation\"]').hidden"), false, "the page is offered while a card is parked");
  assert.equal(await evaluate("Boolean(document.querySelector('.assistant-tab[data-tab^=\"event:\"]'))"), false);
  await waitFor(`${SIDE}.querySelector('[data-card-name] strong')?.textContent === '给王总回电话' && ${SIDE}.querySelector('[data-card-body]')?.textContent.includes('给王总回电话') && ${SIDE}.querySelector('[data-card-tasks] .work-task-row-title')?.textContent === '先问预算'`, 15_000);
  assert.equal(await evaluate(`(() => { const box = ${SIDE}.getBoundingClientRect(), side = document.querySelector('[data-side-panel]').getBoundingClientRect(); return box.left >= side.left && box.right <= side.right + 1 && ${SIDE}.scrollWidth <= ${SIDE}.clientWidth + 1; })()`), true, "the card fits the side panel");
  await writeFile(new URL("event-card-parked-1440.png", shot), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  // A row pressed there opens that task's card in the background-task panel, as in the dialog.
  await click(`[data-side-body="conversation"] [data-card-tasks] [data-task-open]`);
  await waitFor("document.querySelector('[data-work-task-float] [data-task-card]')?.textContent.includes('先问预算')");
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await waitFor("!document.querySelector('[data-work-task-float]')");
  // It stays parked over a reload (this viewer's own, per project).
  await navigate(() => command("Page.reload", {}, sessionId));
  await waitFor(`${SIDE}?.querySelector('[data-card-name] strong')?.textContent === '给王总回电话' && ${SIDE}.querySelector('[data-card-tasks] .work-task-row-title')?.textContent === '先问预算'`, 25_000);

  // Back in the dialog: the event's tab again, and nothing left parked.
  await evaluate(`${SIDE}.querySelector('[data-event-unpark]').click()`);
  await waitFor(`${TAB}?.dataset.tab === ${JSON.stringify(`event:${KEY}`)} && !document.querySelector('[data-assistant-panel]').hidden && !${SIDE}`);
  await waitFor(`${CARD}?.querySelector('[data-card-tasks] .work-task-row-title')?.textContent === '先问预算'`, 15_000);
  assert.equal(await evaluate("document.querySelector('[data-side-parked]').dataset.empty"), "true");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true, "no sideways scroll");
});
