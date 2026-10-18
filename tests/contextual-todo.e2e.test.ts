import assert from "node:assert/strict";
import test from "node:test";
import { GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { openTodoStore } from "@molis-ai/molis-work-plugin-todo";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

const FIRST = "联系阿杰确认秋季发布计划。附上本周方案和预算说明。";
const SECOND = "联系小王确认周末徒步路线。附上集合时间。";
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

// W4-1 (specs/context-program §21, quick-create §8 point 3): 「记成待办」 is Todo's creation entry. It is offered on the bar beside the
// selection (rules alone recommend one destination), and since Todo declares how a todo is undone, one click makes it and the
// completion card offers 「打开」 and 「撤销」. Clicking again for the same selection makes nothing more; 撤销 after an edit elsewhere is
// refused by Todo and changes nothing.
test("S1 W4-1 contextual Todo: real selection → made at once from what was selected → once per request → owner readback → undo only while unchanged", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { command, sessionId, navigate, evaluate, waitFor, origin, projectId, homeDirectory } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  const pages = openPagesStore(homeDirectory);
  const page = (() => { try { return pages.create({ project_id: projectId!, title: "发布笔记", body: { type: "doc", content: [paragraph(FIRST), paragraph(SECOND)] } }); } finally { pages.close(); } })();
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${page.id}` }, sessionId));
  await waitFor(`document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes(${JSON.stringify(SECOND)})`);
  const select = (index: number) => evaluate(`(() => {
    const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
    const text = editor.querySelectorAll('p')[${index}].firstChild, range = document.createRange(); range.selectNodeContents(text);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange'));
  })()`);
  const access = { actor: "user" as const, actorId: "web-user", projectId: projectId!, everything: true };
  const todos = () => { const owner = openTodoStore(homeDirectory); try { return owner.list(access); } finally { owner.close(); } };
  const BAR = ".mw-ctx:not(.mw-ctx--static):not([hidden]):not([data-away])";
  const TODO = `[...document.querySelectorAll('${BAR} button')].find(button => !button.disabled && button.textContent.startsWith('记成待办'))`;
  const CARD = (head: string) => `[...document.querySelectorAll('.placement-toast')].find(card => card.textContent.includes(${JSON.stringify(head)}))`;
  await evaluate(`(() => { const original = window.fetch; window.created = [];
    window.fetch = async (url, options) => {
      const response = await original(url, options);
      if (String(url).endsWith('/api/contextual/create')) window.created.push({ asked: JSON.parse(options.body), ...(await response.clone().json()) });
      return response;
    }; })()`);

  // On the bar beside the selection, not under 更多; one click makes it, a second click while it is being made adds nothing.
  await select(0);
  await waitFor(`Boolean(${TODO})`, 10_000);
  await evaluate(`(() => { const button = ${TODO}; button.click(); button.click(); })()`);
  await waitFor(`Boolean(${CARD("已记成待办")})`, 10_000);
  assert.equal(await evaluate("window.created.length"), 1, "one request while the first was being made");
  const first = await evaluate<{ asked: { focus: { targets: { text: string }[]; object: { id: string } }; request_id: string }; created: boolean; subject: { id: string } }>("window.created[0]");
  assert.equal(first.created, true);
  assert.equal(first.asked.focus.targets[0]?.text, FIRST); assert.equal(first.asked.focus.object.id, page.id);
  assert.deepEqual(await evaluate(`[...${CARD("已记成待办")}.querySelectorAll('button')].map(button => button.textContent)`), ["打开", "撤销", "×"]);
  const [item] = todos();
  assert.equal(todos().length, 1);
  assert.equal(item!.id, first.subject.id);
  assert.equal(item!.title, "联系阿杰确认秋季发布计划"); assert.equal(item!.notes, FIRST);
  // The offer leaves placement for the person: unassigned is its current create contract.
  assert.deepEqual([item!.placement, item!.project_id], ["unassigned", null]);
  assert.equal(item!.sources[0]!.subject?.id, page.id); assert.equal(item!.sources[0]!.excerpt, FIRST); assert.equal(JSON.stringify(todos()).includes(SECOND), false);

  // The same selection again: the same request, which Todo makes once.
  await waitFor(`Boolean(${TODO})`, 10_000);
  await evaluate(`${TODO}.click()`);
  await waitFor("window.created.length === 2", 10_000);
  assert.equal(await evaluate("window.created[1].asked.request_id"), first.asked.request_id);
  assert.equal(todos().length, 1, "once per request");

  // Edited elsewhere since: 撤销 is refused by Todo, and the todo stays as edited.
  const owner = openTodoStore(homeDirectory);
  try { owner.update(item!.id, { title: "改过的待办" }, item!.revision, access); } finally { owner.close(); }
  await evaluate(`[...${CARD("已记成待办")}.querySelectorAll('button')].find(button => button.textContent === '撤销').click()`);
  await waitFor(`Boolean(${CARD("没能撤销")})`, 10_000);
  assert.deepEqual(todos().map(todo => todo.title), ["改过的待办"], "not removed, not changed");

  // Unchanged: 撤销 removes the todo it made, and only that one.
  await select(1);
  await waitFor(`Boolean(${TODO})`, 10_000);
  await evaluate(`document.querySelectorAll('.placement-toast').forEach(card => card.remove()); ${TODO}.click()`);
  await waitFor(`Boolean(${CARD("已记成待办")})`, 10_000);
  assert.equal(todos().length, 2);
  await evaluate(`[...${CARD("已记成待办")}.querySelectorAll('button')].find(button => button.textContent === '撤销').click()`);
  await waitFor(`Boolean(${CARD("已撤销")})`, 10_000);
  assert.deepEqual(todos().map(todo => todo.title), ["改过的待办"]);
  assert.equal(await evaluate("document.querySelector('[data-pages-editor] .ProseMirror').textContent"), FIRST + SECOND, "the page is not written");

  // 打开: the todo it made opens in Todo.
  await select(1);
  await waitFor(`Boolean(${TODO})`, 10_000);
  await evaluate(`document.querySelectorAll('.placement-toast').forEach(card => card.remove()); ${TODO}.click()`);
  await waitFor(`Boolean(${CARD("已记成待办")})`, 10_000);
  const opened = (await evaluate<{ subject: { id: string } }>("window.created.at(-1)")).subject.id;
  await evaluate(`[...${CARD("已记成待办")}.querySelectorAll('button')].find(button => button.textContent === '打开').click()`);
  await waitFor(`JSON.parse([...document.querySelectorAll('[data-assistant-context]')].map(node => node.getAttribute('data-assistant-context')).find(value => value && value.includes(${JSON.stringify(opened)})) || 'null')?.object?.id === ${JSON.stringify(opened)}`, 15_000)
    .catch(async error => { throw new Error(`${(error as Error).message}\n${await evaluate<string>("location.href + ' | ' + [...document.querySelectorAll('[data-assistant-context]')].map(node => node.getAttribute('data-assistant-context')).join(' || ')")}`); });
});

// W4-1 kept from S1 (统筹 10-18): an action without an undo still goes through a card, and a refused run of that card writes
// nothing and leaves it as it was, ready to run again. Before W4-1 「记成待办」 showed this; it is made at once now, so Goals'
// 「拆成目标步骤」 (a proposal, always a card) shows it here.
test("S1 W4-1 a card whose run is refused writes nothing and can run again: Goals 拆成目标步骤 from a real selection", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { command, sessionId, navigate, evaluate, waitFor, click, origin, projectId, homeDirectory, store } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  const pages = openPagesStore(homeDirectory);
  const page = (() => { try { return pages.create({ project_id: projectId!, title: "发布笔记", body: { type: "doc", content: [paragraph(FIRST), paragraph(SECOND)] } }); } finally { pages.close(); } })();
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${page.id}` }, sessionId));
  await waitFor(`document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes(${JSON.stringify(SECOND)})`);
  await evaluate(`(() => {
    const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
    const text = editor.querySelectorAll('p')[0].firstChild, range = document.createRange(); range.selectNodeContents(text);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange'));
  })()`);
  const BAR = ".mw-ctx:not(.mw-ctx--static):not([hidden]):not([data-away])";
  const WRITE = `[...document.querySelectorAll('${BAR} button,.mw-ctx-menu button')].find(button => !button.disabled && button.textContent.startsWith('拆成目标步骤'))`;
  await waitFor(`document.querySelector('${BAR} [data-more]')`, 8000);
  await click(`${BAR} [data-more]`);
  await waitFor(`Boolean(${WRITE})`);
  await evaluate(`(() => {
    const original = window.fetch; window.cardFetch = original; window.placedCard = null; window.refusals = 0;
    window.fetch = async (url, options) => {
      if (String(url).includes('/cards/') && String(url).endsWith('/run') && window.refuseRun) {
        window.refusals++; return new Response(JSON.stringify({ error: 'fixture permission refusal' }), { status: 403, headers: { 'content-type': 'application/json' } });
      }
      const response = await original(url, options);
      if (String(url).endsWith('/api/assistant/cards')) window.placedCard = { status: response.status, ...(await response.clone().json()) };
      return response;
    };
    ${WRITE}.click();
  })()`);
  await waitFor("window.placedCard?.status === 200 && !document.querySelector('[data-assistant-panel]').hidden", 20_000);
  const placed = await evaluate<{ work_id: string }>("window.placedCard");
  const view = await evaluate<{ cards: Array<{ card_id: string; capability_id: string; source_object: { id: string } }> }>(
    `fetch(document.body.dataset.routePrefix + '/api/assistant/works/' + ${JSON.stringify(placed.work_id)}, { headers: molisWorkControlHeaders() }).then(r => r.json())`);
  const card = view.cards.find(value => value.capability_id === "goals.tree.submit")!;
  assert.ok(card); assert.equal(card.source_object.id, page.id);
  const proposals = () => new GoalProjectApplication(store).goalTree.listGoalTreeProposals({ project_id: projectId! }).proposals.length;
  assert.equal(proposals(), 0, "nothing before the person runs it");
  const run = `[data-card="${card.card_id}"] [data-ix-action="run"]`;
  await waitFor(`document.querySelector(${JSON.stringify(run)})`);
  const draft = await evaluate<string[]>(`[...document.querySelector('[data-card="${card.card_id}"]').querySelectorAll('input,textarea')].map(control => control.value)`);
  await evaluate("window.refuseRun = true");
  await click(run);
  await waitFor(`window.refusals === 1 && !document.querySelector(${JSON.stringify(run)}).disabled`);
  assert.deepEqual(await evaluate(`[...document.querySelector('[data-card="${card.card_id}"]').querySelectorAll('input,textarea')].map(control => control.value)`), draft, "the card is as it was");
  assert.equal(proposals(), 0, "a refused run writes nothing");
  await evaluate("window.refuseRun = false");
  await click(run);
  await waitFor(`document.querySelector('[data-card="${card.card_id}"]')?.dataset.status === 'done'`, 20_000);
  assert.equal(proposals(), 1, "run again, it is written once");
  assert.equal(await evaluate("document.querySelector('[data-pages-editor] .ProseMirror').textContent"), FIRST + SECOND);
  await evaluate("window.fetch = window.cardFetch");
});
