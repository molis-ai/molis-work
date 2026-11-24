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
type Shell = { row: Box; blocks: Box[]; slot: Box; parts: Array<{ name: string; box: Box }> };
/** The foot's row, the two blocks beside the input (the account bar, the card stack: 底栏第十三版第 2、5 条, where the wings were), the
 * composer's slot, and what stands above the foot (the work surface, the side, the divider between them). */
const SHELL = `(() => { const box = node => { const at = node.getBoundingClientRect(); return { top: Math.round(at.top), bottom: Math.round(at.bottom), left: Math.round(at.left), right: Math.round(at.right), height: Math.round(at.height) }; };
  return { row: box(document.querySelector('.work-line-row')), blocks: [...document.querySelectorAll('[data-work-line] :is(.bar-account, .work-stack)')].map(box), slot: box(document.querySelector('.work-line-slot')),
    parts: [...document.querySelectorAll('[data-plugin-stage], [data-side-panel], .side-panel-divider')].filter(node => node.getBoundingClientRect().width > 0).map(node => ({ name: node.className.split(' ')[0], box: box(node) })) }; })()`;

/** The rise the shell has measured is the input's overflow above the line's row (0 at one line). */
const SETTLED = "(() => { const slot = document.querySelector('.work-line-slot'), over = Math.max(0, Math.round(slot.parentElement.getBoundingClientRect().top - slot.getBoundingClientRect().top)); return getComputedStyle(document.querySelector('[data-work-bar]').parentElement).getPropertyValue('--line-rise') === over + 'px'; })()";
/** WLN-01 and WLN-02 at one width: the line stays where it was; the input rises out of it; what it lies over gives up that much. */
async function rises(evaluate: <T>(expression: string) => Promise<T>, waitFor: (expression: string, timeout?: number) => Promise<void>, width: number): Promise<void> {
  await evaluate(type(""));
  await waitFor(`document.querySelector('.work-line-slot').offsetHeight <= document.querySelector('.work-line-row').clientHeight && ${SETTLED}`);
  const rest = await evaluate<Shell>(SHELL);
  await evaluate(type("第一行\n第二行\n第三行\n第四行\n第五行"));
  await waitFor(`document.querySelector('.work-line-slot').offsetHeight > document.querySelector('.work-line-row').clientHeight + 40 && ${SETTLED}`, 10_000);
  const tall = await evaluate<Shell>(SHELL);
  assert.deepEqual(tall.row, rest.row, `${width}: the line's row stays where it was, at its height`);
  assert.equal(tall.blocks.length, 2, `${width}: the account bar and the card stack stand beside the input`);
  assert.deepEqual(tall.blocks, rest.blocks, `${width}: the account bar and the card stack do not move or grow (WLN-01 as §16 rewrote it)`);
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

test("WLN-01 WLN-02 QEA-179: the line keeps its height while the input grows to many lines and back and while the conversation and its lists open; what the input lies over makes the same room, at 1440 and 1024 and with the side open", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, evaluate, waitFor } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor(`Boolean(${INPUT}) && Boolean(document.querySelector('.work-line-row'))`, 20_000);
  await rises(evaluate, waitFor, 1440);

  // The input keeps the window's centre whatever the panes hold (UIV-19 as specs/unified-input-voice §10.5 rewrote it): a change in a
  // pane's content writes nothing on the foot and moves nothing in it.
  await waitFor("Boolean(document.querySelector('[data-tab-pane].is-focused [data-tab-pane-body]'))");
  const placements = await evaluate<{ writes: number; moved: boolean; centre: number }>(`new Promise(resolve => requestAnimationFrame(() => {
    const row = document.querySelector('.work-line-row'), slot = document.querySelector('.work-line-slot'), body = document.querySelector('[data-tab-pane].is-focused [data-tab-pane-body]');
    const at = slot.getBoundingClientRect(), detail = document.createElement('span'); detail.hidden = true;
    let writes = 0;
    const observe = new MutationObserver(records => { writes += records.length; });
    for (const node of [row, slot]) observe.observe(node, { attributeFilter: ['style', 'data-slot-placed'] });
    body.append(detail); detail.className = 'sample-detail';
    requestAnimationFrame(() => {
      writes += observe.takeRecords().length;
      const now = slot.getBoundingClientRect();
      observe.disconnect(); detail.remove(); resolve({ writes, moved: now.left !== at.left || now.width !== at.width, centre: Math.round(now.left + now.width / 2 - innerWidth / 2) });
    });
  }))`);
  assert.deepEqual(placements, { writes: 0, moved: false, centre: 0 }, "a change in pane content does not reposition the input, which stands in the window's centre");

  // 在办 has one way in, the mark inside the input (POLISH-69): the conversation opens over the work with that list in its
  // information column, and moves neither the line nor what stands above it.
  const before = await evaluate<Shell>(SHELL);
  await evaluate(`document.querySelector('[data-work-counts] [data-work-list="now"]').click()`);
  await waitFor(`!document.querySelector('[data-assistant-panel]').hidden && document.querySelector('[data-info-tab="now"]')?.getAttribute('aria-selected') === 'true' && !document.querySelector('[data-work-lists]').hidden`);
  assert.deepEqual(await evaluate<Shell>(SHELL), before, "the conversation and its list take no room from the line or the work");
  await evaluate("document.querySelector('[data-assistant-panel-close]').click()");
  await waitFor("document.querySelector('[data-assistant-panel]').hidden");

  // With the side open: each part above the line yields only where the input lies under it.
  await evaluate("document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'files' } }))");
  await waitFor("document.querySelector('[data-side-panel]')?.getBoundingClientRect().width > 0", 15_000);
  await rises(evaluate, waitFor, 1440);
  await evaluate(type("第一行\n第二行\n第三行\n第四行\n第五行"));
  // What waits is the card stack's and the first place's (POLISH-15, POLISH-43): the input carries no 「等你」 of its own over what is being written.
  assert.equal(await evaluate("document.querySelector('[data-assistant-attention]')?.getClientRects().length ?? 0"), 0, "no count of its own in the input");
  await mkdir(shots, { recursive: true });
  await writeFile(new URL("line-rise-1440.png", shots), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));

  await command("Emulation.setDeviceMetricsOverride", { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false }, sessionId);
  await waitFor("innerWidth === 1024");
  await rises(evaluate, waitFor, 1024);
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true, "no sideways scroll");

  // POLISH-73 at <= 560px height: craft-finish-bar's short-window padding-block must not add --bar-gap around the resting composer.
  for (const [width, height] of [[1024, 500], [780, 493]] as const) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await waitFor(`innerWidth === ${width} && innerHeight === ${height}`);
    const compact = await evaluate<Shell>(SHELL);
    assert.equal(compact.row.height, 98, `${width}x${height}: foot stays 98px tall`);
    assert.equal(compact.slot.height, 74, `${width}x${height}: resting input stays 74px tall`);
    if (width >= 960) for (const block of compact.blocks) assert.deepEqual([block.top, block.bottom], [compact.slot.top, compact.slot.bottom], `${width}x${height}: wings align with input`);
  }
});

test("WLN-04 WLN-06 POLISH-34: the input takes the next request at once while the first is still worked on; a task that stops for the person makes its event wait, counts on the first place, puts it in the card stack, and opens nothing nor takes the keyboard", { timeout: 150_000 }, async t => {
  // The event is a todo planned for today; the task that stops is another plugin's, done for it (its `serves`).
  let served = { kind: "todo_item", id: "" }, waiting = false, ask = false, changes: Array<{ label: string; value: string }> = [];
  const task = () => ({ subject: { kind: "homebg_task", id: "t1" }, title: "核对报价单", state: waiting ? "answer" : "running", details: [], waiting,
    updated_at: new Date().toISOString(), executor: { kind: "plugin", label: "示例" }, serves: [served], scope: "project", commands: [],
    decisions: waiting && ask ? [{ id: "d1", ask: "确认发出报价单", why: "按设置先问你", changes,
      answers: (["approve", "reject"] as const).map(role => ({ role, action: { capability_id: "homebg.answer", version: 1 }, input: { job: "t1", verdict: role }, summary: role })) }] : [], open: null });
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
  // POLISH-34: the shared "your turn" ring is counted where the page receives it. The motion helpers are frozen once set, so the
  // count goes in as they are set; under automation the ring itself draws nothing, and the call is what is counted.
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `(() => { let craft; window.__rings = 0; Object.defineProperty(window, 'molisCraft', { configurable: true, get: () => craft,
    set(next) { craft = Object.freeze({ ...next, ask(node) { window.__rings += 1; window.__rang = node?.hasAttribute?.('data-work-stack') ?? false; return next.ask(node); } }); } }); })();` }, sessionId);
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
  // The plugin's task is a row of 在办, under the event it is done for (WLN-35).
  await evaluate(`document.querySelector('[data-work-counts] [data-work-list="now"]').click()`);
  await waitFor("[...document.querySelectorAll('[data-work-lists] [data-work-list-rows=\"now\"] .work-task-row-title')].some(title => title.textContent === '核对报价单')", 15_000);
  await evaluate("document.querySelector('[data-assistant-panel-close]').click()");
  await waitFor("document.querySelector('[data-assistant-panel]').hidden");

  // WLN-06: the task stops for the person. Focus is in the input with words being written; the conversation stays closed, on what it was about.
  await evaluate(type("还没写完的一句"));
  const SHOWN = "[document.querySelector('[data-assistant-panel]').hidden, document.querySelector('[data-assistant-head-title]').textContent]";
  const shown = await evaluate<unknown[]>(SHOWN);
  // WLN-06 as §16 rewrote it: the number is the first place's amber count (POLISH-15), and the event goes into the card stack.
  const head = "document.querySelector('[data-top-corner-toggle] .top-corner-count')";
  const count = `(${head} && !${head}.hidden ? Number(${head}.textContent) : 0)`;
  const before = await evaluate<number>(count);
  assert.notEqual(await evaluate(`${EVENT}.dataset.state`), "wait");
  // POLISH-34: nothing has rung yet; the event coming to wait for the person says so once.
  assert.equal(await evaluate("window.__rings"), 0);
  waiting = true;
  await evaluate("document.dispatchEvent(new CustomEvent('molis-work:attention-refresh'))");
  // POLISH-40: what waits for you leaves the three lists and is a card of the stack, which says 该你 in words, not by colour alone.
  const CARD = "document.querySelector('[data-work-stack] [data-work-stack-card]')";
  await waitFor(`${EVENT} === null && ${count} === ${before + 1} && (${CARD}?.textContent ?? '').includes('报价单')`, 20_000);
  assert.equal(await evaluate(`${CARD}.textContent.includes('该你')`), true, "the state is said in words, not by colour alone");
  // WLN-39: the card stack counts the same things as the first place: the card in front and how many are behind it.
  await waitFor(`(() => { const behind = Number(/\\d+/u.exec(document.querySelector('[data-work-stack] .work-stack-more')?.textContent ?? '')?.[0] ?? 0); return behind + 1 === ${count}; })()`, 10_000);
  assert.deepEqual(await evaluate<unknown[]>(SHOWN), shown, "the conversation is not opened for it, nor turned to it");
  assert.equal(await evaluate(`document.activeElement === ${INPUT} && ${INPUT}.value === '还没写完的一句'`), true, "the keyboard stays where the person was writing");
  // WLN-06 (user decision 2026-11-15): the main conversation has the platform's own row, at once and with no round of the model,
  // with 「去处理」; one for the task and its decision. No longer waiting, it folds and offers nothing to press; waiting again, the
  // same row opens again, and 「去处理」 turns the conversation to the event.
  const ROWS = "[...document.querySelectorAll('[data-assistant-thread] .work-reply-waiting')]", ROW = `${ROWS}[0]`;
  await waitFor(`${ROW}?.dataset.waiting === 'open' && ${ROW}.textContent.includes('核对报价单') && ${ROW}.querySelector('[data-waiting-go]')?.textContent.includes('去处理')`, 10_000);
  assert.equal(await evaluate(`${ROWS}.length`), 1, "one row for the task and its decision");
  assert.equal(await evaluate(`document.activeElement === ${INPUT}`), true, "the row takes no focus");
  assert.deepEqual(await evaluate("[window.__rings, window.__rang]"), [1, true], "POLISH-34: the card stack rang once as the event came to wait, and the reads since, with it still waiting, rang nothing");
  waiting = false;
  await evaluate("document.dispatchEvent(new CustomEvent('molis-work:attention-refresh'))");
  await waitFor(`${ROW}?.dataset.waiting === 'settled' && !${ROW}.querySelector('[data-waiting-go]')`, 20_000);
  waiting = true;
  await evaluate("document.dispatchEvent(new CustomEvent('molis-work:attention-refresh'))");
  await waitFor(`${ROW}?.dataset.waiting === 'open' && ${ROWS}.length === 1`, 20_000);
  await waitFor("window.__rings === 2", 10_000);
  assert.equal(await evaluate("window.__rings"), 2, "POLISH-34: settled and waiting again is a second coming, and rings once more, not more");
  await evaluate(`${ROW}.querySelector('[data-waiting-go]').click()`);
  await waitFor("!document.querySelector('[data-assistant-panel]').hidden && document.querySelector('[data-assistant-head-title]').textContent === '报价单'", 10_000);
  // POLISH-43: the event in front is answered in the information column, so it is no card of the stack while its conversation
  // is open; with the conversation closed it is the stack's card again.
  await waitFor(`!(${CARD}?.textContent ?? '').includes('报价单')`, 10_000);
  await evaluate("document.querySelector('[data-assistant-panel-close]').click()");
  await waitFor(`document.querySelector('[data-assistant-panel]').hidden && (${CARD}?.textContent ?? '').includes('报价单')`, 10_000);
  // POLISH-44: a decision with concrete changes stays behind 「去处理」 on the foot card; once it has no changes and at most
  // two direct choices, the next single refresh renders the direct buttons even when the line's events did not change.
  ask = true; changes = [{ label: "预算", value: "十万 → 十二万" }];
  await evaluate("document.dispatchEvent(new CustomEvent('molis-work:attention-refresh'))");
  await waitFor("(document.querySelector('[data-work-stack] [data-work-stack-card]')?.textContent ?? '').includes('确认发出报价单')", 10_000);
  assert.deepEqual(await evaluate("({ open: Boolean(document.querySelector('[data-work-stack] [data-work-stack-open]')), direct: document.querySelectorAll('[data-work-stack] [data-decision-answer]').length })"),
    { open: true, direct: 0 }, "POLISH-44: decision with changes keeps 「去处理」 instead of direct buttons on the foot card");
  changes = [];
  await evaluate("document.dispatchEvent(new CustomEvent('molis-work:attention-refresh'))");
  await waitFor("document.querySelectorAll('[data-work-stack] [data-decision-answer]').length === 2", 10_000);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-work-stack] [data-decision-answer]')].map(b => b.dataset.decisionAnswer)"),
    ["approve", "reject"], "POLISH-44: two-choice decision without changes renders direct buttons on the very first refresh");
  // POLISH-54: while data-checking is active (attention unreachable / restoring), direct decision buttons on the card stack are disabled and re-enable on live attention.
  await evaluate("document.dispatchEvent(new CustomEvent('molis-work:attention-unreachable', { detail: { since: new Date().toISOString() } }))");
  await waitFor("document.querySelector('[data-work-line]')?.hasAttribute('data-checking')", 10_000);
  assert.deepEqual(
    await evaluate("[...document.querySelectorAll('[data-work-stack] [data-decision-answer]')].map(b => b.disabled)"),
    [true, true],
    "POLISH-54: card stack decision buttons are disabled while data-checking",
  );
  await evaluate("document.dispatchEvent(new CustomEvent('molis-work:attention-refresh'))");
  await waitFor("!document.querySelector('[data-work-line]')?.hasAttribute('data-checking') && [...document.querySelectorAll('[data-work-stack] [data-decision-answer]')].every(b => !b.disabled)", 15_000);
  // POLISH-54: task rows in the three lists also become disabled ("正在核对") while unreachable and recover on live attention even when tasks and events are unchanged.
  waiting = false;
  await evaluate("document.dispatchEvent(new CustomEvent('molis-work:attention-refresh'))");
  await waitFor("[...document.querySelectorAll('[data-work-lists] [data-work-list-rows=\"now\"] .work-task-row-main')].some(b => !b.disabled && b.textContent.includes('核对报价单'))", 15_000);
  await evaluate("document.dispatchEvent(new CustomEvent('molis-work:attention-unreachable', { detail: { since: new Date().toISOString() } }))");
  await waitFor("[...document.querySelectorAll('[data-work-lists] [data-work-list-rows=\"now\"] .work-task-row-main')].every(b => b.disabled && b.textContent.includes('正在核对'))", 10_000);
  await evaluate("document.dispatchEvent(new CustomEvent('molis-work:attention-refresh'))");
  await waitFor("!document.querySelector('[data-work-line]')?.hasAttribute('data-checking') && [...document.querySelectorAll('[data-work-lists] [data-work-list-rows=\"now\"] .work-task-row-main')].every(b => !b.disabled && !b.textContent.includes('正在核对'))", 15_000);

  // B37R-3 / POLISH-34: a waiting event restored from the same scope was already waiting before this window opened.
  waiting = true;
  await evaluate("document.dispatchEvent(new CustomEvent('molis-work:attention-refresh'))");
  await waitFor(`(${CARD}?.textContent ?? '').includes('报价单')`, 15_000);
  await navigate(() => command("Page.reload", {}, sessionId));
  await waitFor(`(${CARD}?.textContent ?? '').includes('报价单') && !document.querySelector('[data-work-line]')?.hasAttribute('data-checking')`, 20_000);
  assert.equal(await evaluate("window.__rings"), 0, "restoring the cached and live copies of the same waiting event stays quiet");
});

test("WLN-05 WLN-29: a line not heard from keeps what it showed, says it is being checked as of the last read; pressing that asks again, and heard again it goes; a reload shows the last line at once, being checked", { timeout: 150_000 }, async t => {
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
  await waitFor(`Boolean(${CHIP}) && document.querySelector('[data-work-line]').hasAttribute('data-checking')`, 15_000);
  assert.match(await evaluate<string>(`${CHIP}.textContent`), /^正在核对 · 截至 \S+/u, "said to be checked, as of the last read");
  assert.equal(await evaluate(`${EVENT}?.textContent.includes('报价单')`), true, "what it showed stays");
  await mkdir(shots, { recursive: true });
  await writeFile(new URL("line-checking-1440.png", shots), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));

  // Heard again (pressing 正在核对 asks at once): it goes.
  await evaluate(`sessionStorage.setItem('down', '0'); ${CHIP}.click()`);
  await waitFor(`${CHIP} === null && !document.querySelector('[data-work-line]').hasAttribute('data-checking')`, 15_000);

  // A reload while not heard: the last line stands at once, being checked.
  await evaluate("sessionStorage.setItem('down', '1')");
  await navigate(() => command("Page.reload", {}, sessionId));
  await waitFor(`${EVENT}?.textContent.includes('报价单') && /截至/u.test(${CHIP}?.textContent ?? '')`, 20_000);
});
