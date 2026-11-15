import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { backgroundPlugin } from "./fixtures/home-background-plugin.js";
import { openTodoStore } from "./fixtures/plugin-home-stores.js";
import { issueModel } from "./fixtures/issue-model.js";

// specs/work-line §4.1 and §4.5: the line at the bottom keeps its height, what a multi-line input lies over makes room, the input
// takes the next request at once, a task that stops for the person says so without taking the page, and a line not heard from
// says what it last knew.

const INPUT = "document.querySelector('[data-assistant-composer] .mw-composer__input')";
const type = (words: string) => `(() => { const input = ${INPUT}; input.focus(); input.value = ${JSON.stringify(words)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`;
const shots = new URL("../.impeccable/qa/review/work-line/", import.meta.url);
const SOURCE = { surface: "example", title: "示例", icon: "list" };
const pad = (value: number) => String(value).padStart(2, "0");
const today = () => { const at = new Date(); return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`; };

type Box = { top: number; bottom: number; left: number; right: number; height: number };
type Shell = { row: Box; wings: Box[]; slot: Box; parts: Array<{ name: string; box: Box }> };
/** The line's row and wings, the composer's slot, and what stands above the line (the work surface, the side, the divider between them). */
const SHELL = `(() => { const box = node => { const at = node.getBoundingClientRect(); return { top: Math.round(at.top), bottom: Math.round(at.bottom), left: Math.round(at.left), right: Math.round(at.right), height: Math.round(at.height) }; };
  return { row: box(document.querySelector('.work-line-row')), wings: [...document.querySelectorAll('.work-line-wing')].map(box), slot: box(document.querySelector('.work-line-slot')),
    parts: [...document.querySelectorAll('[data-plugin-stage], [data-side-panel], .side-panel-divider')].filter(node => node.getBoundingClientRect().width > 0).map(node => ({ name: node.className.split(' ')[0], box: box(node) })) }; })()`;

/** The rise the shell has measured is the input's overflow above the line (0 at one line). */
const SETTLED = "(() => { const slot = document.querySelector('.work-line-slot'), over = Math.max(0, slot.offsetHeight - slot.parentElement.clientHeight); return getComputedStyle(document.querySelector('[data-work-bar]').parentElement).getPropertyValue('--line-rise') === over + 'px'; })()";
/** WLN-01 and WLN-02 at one width: the line stays where it was; the input rises out of it; what it lies over gives up that much. */
async function rises(evaluate: <T>(expression: string) => Promise<T>, waitFor: (expression: string, timeout?: number) => Promise<void>, width: number): Promise<void> {
  await evaluate(type(""));
  await waitFor(`document.querySelector('.work-line-slot').offsetHeight <= document.querySelector('.work-line-row').clientHeight && ${SETTLED}`);
  const rest = await evaluate<Shell>(SHELL);
  await evaluate(type("第一行\n第二行\n第三行\n第四行\n第五行"));
  await waitFor(`document.querySelector('.work-line-slot').offsetHeight > document.querySelector('.work-line-row').clientHeight + 40 && ${SETTLED}`, 10_000);
  const tall = await evaluate<Shell>(SHELL);
  assert.deepEqual(tall.row, rest.row, `${width}: the line's row stays where it was, at its height`);
  assert.deepEqual(tall.wings, rest.wings, `${width}: the wings do not move`);
  const rise = tall.row.top - tall.slot.top;
  assert.ok(rise > 40, `${width}: the input grew up out of the line (${rise}px)`);
  for (const part of tall.parts) {
    const before = rest.parts.find(one => one.name === part.name)!;
    const over = part.box.left < tall.slot.right && part.box.right > tall.slot.left;
    assert.equal(part.box.bottom, before.box.bottom - (over ? rise : 0), `${width}: ${part.name} ${over ? "gives up the input's rise at its foot" : "lies beside the input and keeps its height"}`);
  }
  assert.ok(tall.parts.some(part => part.box.left < tall.slot.right && part.box.right > tall.slot.left), `${width}: something stands above the input`);
  // Written back to one line: everything as it was.
  await evaluate(type(""));
  await waitFor(`document.querySelector('.work-line-slot').offsetHeight <= document.querySelector('.work-line-row').clientHeight && ${SETTLED}`, 10_000);
  assert.deepEqual(await evaluate<Shell>(SHELL), rest, `${width}: back to one line, back as it was`);
}

test("WLN-01 WLN-02: the line keeps its height while the input grows to many lines and back and while the task panel opens; what the input lies over makes the same room, at 1440 and 1024 and with the side open", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, evaluate, waitFor } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor(`Boolean(${INPUT}) && Boolean(document.querySelector('.work-line-row'))`, 20_000);
  await rises(evaluate, waitFor, 1440);

  // The task panel floats beside the dialog: opening it moves neither the line nor what stands above it.
  const before = await evaluate<Shell>(SHELL);
  await evaluate("document.querySelector('[data-task-mark]').click()");
  await waitFor("Boolean(document.querySelector('[data-work-task-float] .work-task-panel'))");
  assert.deepEqual(await evaluate<Shell>(SHELL), before, "the task panel takes no room from the line or the work");
  await evaluate("document.querySelector('[data-task-mark]').click()");
  await waitFor("!document.querySelector('[data-work-task-float] .work-task-panel')");

  // With the side open: each part above the line yields only where the input lies under it.
  await evaluate("document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'files' } }))");
  await waitFor("document.querySelector('[data-side-panel]')?.getBoundingClientRect().width > 0", 15_000);
  await rises(evaluate, waitFor, 1440);
  await evaluate(type("第一行\n第二行\n第三行\n第四行\n第五行"));
  // The composer's own 「等你」 count stands in its foot row after the receiver, never over what is being written.
  await waitFor("!document.querySelector('[data-assistant-attention]').hidden", 15_000);
  assert.equal(await evaluate(`(() => { const at = node => document.querySelector(node).getBoundingClientRect(), chip = at('[data-assistant-attention]'), text = at('[data-assistant-composer] .mw-composer__text'), to = at('[data-assistant-composer] .mw-composer__to');
    return chip.top >= text.bottom - 1 && chip.left >= to.right && Math.abs((chip.top + chip.bottom) / 2 - (to.top + to.bottom) / 2) <= 1; })()`), true, "the count is in the foot row, after the receiver");
  await mkdir(shots, { recursive: true });
  await writeFile(new URL("line-rise-1440.png", shots), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));

  await command("Emulation.setDeviceMetricsOverride", { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false }, sessionId);
  await waitFor("innerWidth === 1024");
  await rises(evaluate, waitFor, 1024);
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true, "no sideways scroll");
});

test("WLN-04 WLN-06: the input takes the next request at once while the first is still worked on; a task that stops for the person makes its event wait, counts on the head and colours the mark, and opens nothing nor takes the keyboard", { timeout: 150_000 }, async t => {
  // The event is a todo planned for today; the task that stops is another plugin's, done for it (its `serves`).
  let served = { kind: "todo_item", id: "" }, waiting = false;
  const task = () => ({ subject: { kind: "homebg_task", id: "t1" }, title: "核对报价单", state: waiting ? "answer" : "running", details: [], waiting,
    updated_at: new Date().toISOString(), executor: { kind: "plugin", label: "示例" }, serves: [served], scope: "project", commands: [], decisions: [], open: null });
  const plugin = backgroundPlugin(() => ({ source: SOURCE, tasks: served.id ? [task()] : [] }));
  // A local model whose rounds are held: what is sent stays in progress while the next request is written.
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  t.after(() => release());
  const browser = await openGoalBrowser(t, true, undefined, null, undefined, undefined, { prepareHome: async home => { await issueModel(t, home, { replyText: "好的，在办。", held }); } }, { project: [plugin.definition] });
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, homeDirectory, evaluate, waitFor } = browser;
  const store = openTodoStore(homeDirectory);
  const item = store.create({ title: "报价单", placement: "project", planned_date: today() }, { projectId, projectIds: [], actor: "user" as const, actorId: "test" }).item;
  store.close();
  served = { kind: "todo_item", id: item.id };
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  const EVENT = `document.querySelector('[data-work-line] [data-work-event*="todo-planned:${item.id}"]')`;
  await waitFor(`${EVENT}?.textContent.includes('报价单') && Boolean(${INPUT})`, 20_000);

  // WLN-04: a request sent leaves the input empty, enabled and in hand while its round is still held; the next is written and
  // sent at once and is taken by the round under way (统一输入's 补充), and the answer comes when the model answers. Work the
  // Assistant puts in the background, and its row in the panel, is the Assistant's choice: a reply-only model puts nothing
  // there, so the panel's row here is the plugin's task.
  const send = async (words: string) => { await evaluate(type(words)); await evaluate("document.querySelector('[data-assistant-composer] [data-composer-send]').click()"); };
  await send("把季度预算整理成表");
  await waitFor(`${INPUT}.value === '' && !${INPUT}.disabled && document.activeElement === ${INPUT}`, 5_000);
  await send("再约王总明天下午");
  await waitFor(`${INPUT}.value === '' && !${INPUT}.disabled`, 5_000);
  const THREAD = "document.querySelector('[data-assistant-thread]').textContent";
  await waitFor(`${THREAD}.includes('把季度预算整理成表') && ${THREAD}.includes('再约王总明天下午')`, 10_000);
  release();
  await waitFor(`${THREAD}.includes('好的，在办。')`, 30_000);
  await evaluate("document.querySelector('[data-task-mark]').click()");
  await waitFor("[...document.querySelectorAll('[data-work-task-float] .work-task-row-title')].some(title => title.textContent === '核对报价单')", 15_000);
  await evaluate("document.querySelector('[data-task-mark]').click()");
  await waitFor("!document.querySelector('[data-work-task-float] .work-task-panel')");

  // WLN-06: the task stops for the person. Focus is in the input with words being written; the dialog's tabs are what they were.
  await evaluate(type("还没写完的一句"));
  const tabs = await evaluate<string[]>("[...document.querySelectorAll('.assistant-tab')].map(tab => tab.dataset.tab ?? '')");
  const head = "document.querySelector('[data-work-line-head] .work-line-count')";
  const count = `(${head} && !${head}.hidden ? Number(${head}.textContent) : 0)`;
  const before = await evaluate<number>(count);
  assert.notEqual(await evaluate(`${EVENT}.dataset.state`), "wait");
  waiting = true;
  await evaluate("document.dispatchEvent(new CustomEvent('molis-work:attention-refresh'))");
  await waitFor(`${EVENT}?.dataset.state === 'wait' && ${count} === ${before + 1} && Boolean(document.querySelector('[data-task-mark][data-needs-you]'))`, 20_000);
  assert.equal(await evaluate(`${EVENT}.textContent.includes('等你')`), true, "the state is said in words, not by colour alone");
  // WLN-39: the composer's 「等你」 is the head's number, not a count of its own.
  await waitFor(`document.querySelector('[data-assistant-attention-count]')?.textContent === '等你 ' + ${count}`, 10_000);
  assert.deepEqual(await evaluate<string[]>("[...document.querySelectorAll('.assistant-tab')].map(tab => tab.dataset.tab ?? '')"), tabs, "no tab is opened for it");
  assert.equal(await evaluate(`document.activeElement === ${INPUT} && ${INPUT}.value === '还没写完的一句'`), true, "the keyboard stays where the person was writing");
  // WLN-06 (user decision 2026-11-15): the main conversation has the platform's own row, at once and with no round of the model,
  // with 「去处理」; one for the task and its decision. No longer waiting, it folds and offers nothing to press; waiting again, the
  // same row opens again, and 「去处理」 opens the event's tab.
  const ROWS = "[...document.querySelectorAll('[data-assistant-thread] .work-reply-waiting')]", ROW = `${ROWS}[0]`;
  await waitFor(`${ROW}?.dataset.waiting === 'open' && ${ROW}.textContent.includes('核对报价单') && ${ROW}.querySelector('[data-waiting-go]')?.textContent.includes('去处理')`, 10_000);
  assert.equal(await evaluate(`${ROWS}.length`), 1, "one row for the task and its decision");
  assert.equal(await evaluate(`document.activeElement === ${INPUT}`), true, "the row takes no focus");
  waiting = false;
  await evaluate("document.dispatchEvent(new CustomEvent('molis-work:attention-refresh'))");
  await waitFor(`${ROW}?.dataset.waiting === 'settled' && !${ROW}.querySelector('[data-waiting-go]')`, 20_000);
  waiting = true;
  await evaluate("document.dispatchEvent(new CustomEvent('molis-work:attention-refresh'))");
  await waitFor(`${ROW}?.dataset.waiting === 'open' && ${ROWS}.length === 1`, 20_000);
  await evaluate(`${ROW}.querySelector('[data-waiting-go]').click()`);
  await waitFor(`[...document.querySelectorAll('.assistant-tab')].length === ${tabs.length + 1}`, 10_000);
});

test("WLN-05 WLN-29: a line not heard from keeps what it showed, says it is being checked as of the last read, and the task mark and panel say the connection is lost; heard again, all of that goes; a reload shows the last line at once, being checked", { timeout: 150_000 }, async t => {
  const plugin = backgroundPlugin(() => ({ source: SOURCE, tasks: [] }));
  plugin.state.events = () => ({ source: SOURCE, events: [{ event_id: "quote", subject: { kind: "homebg_item", id: "quote" }, title: "报价单", summary: "", content: "", facts: [], category: "personal",
    placement: "active", occurred_at: new Date().toISOString(), needs_attention: false, open: null }] });
  const browser = await openGoalBrowser(t, true, undefined, null, undefined, undefined, {}, { project: [plugin.definition] });
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, evaluate, waitFor } = browser;
  // The attention read fails as a lost connection does while this tab's `down` is set; set before a reload, it fails from the first read.
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { const real = window.fetch; window.fetch = function (input) {
    try { const url = new URL(typeof input === 'string' ? input : input.url, location.href); if (sessionStorage.getItem('down') === '1' && url.pathname.endsWith('/api/attention')) return Promise.reject(new TypeError('Failed to fetch')); } catch {}
    return real.apply(this, arguments); }; })();` }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  const EVENT = "document.querySelector('[data-work-line] [data-work-event*=\"quote\"]')", CHIP = "document.querySelector('[data-work-line] [data-work-line-checking]')";
  await waitFor(`${EVENT}?.textContent.includes('报价单')`, 20_000);
  assert.equal(await evaluate(`${CHIP} === null`), true);

  await evaluate("sessionStorage.setItem('down', '1'); document.dispatchEvent(new CustomEvent('molis-work:attention-refresh'))");
  await waitFor(`Boolean(${CHIP}) && Boolean(document.querySelector('[data-task-mark][data-offline]'))`, 15_000);
  assert.match(await evaluate<string>(`${CHIP}.textContent`), /^正在核对 · 截至 \S+/u, "said to be checked, as of the last read");
  assert.equal(await evaluate(`${EVENT}?.textContent.includes('报价单')`), true, "what it showed stays");
  await evaluate("document.querySelector('[data-task-mark]').click()");
  await waitFor("document.querySelector('[data-work-task-float] .work-task-banner [data-task-reconnect]') !== null");
  assert.match(await evaluate<string>("document.querySelector('[data-work-task-float] .work-task-banner').textContent"), /截至/u);
  await mkdir(shots, { recursive: true });
  await writeFile(new URL("line-checking-1440.png", shots), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));

  // Heard again (the panel's 重新连接 asks at once): the chip, the mark's state and the banner go.
  await evaluate("sessionStorage.setItem('down', '0'); document.querySelector('[data-work-task-float] [data-task-reconnect]').click()");
  await waitFor(`${CHIP} === null && !document.querySelector('[data-task-mark][data-offline]') && !document.querySelector('[data-work-task-float] .work-task-banner')`, 15_000);

  // A reload while not heard: the last line stands at once, being checked.
  await evaluate("sessionStorage.setItem('down', '1')");
  await navigate(() => command("Page.reload", {}, sessionId));
  await waitFor(`${EVENT}?.textContent.includes('报价单') && /截至/u.test(${CHIP}?.textContent ?? '')`, 20_000);
});
