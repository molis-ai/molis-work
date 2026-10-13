import assert from "node:assert/strict";
import test from "node:test";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { openTodoStore } from "@molis-ai/molis-work-plugin-todo";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

const FIRST = "联系阿杰确认秋季发布计划。附上本周方案和预算说明。";
const SECOND = "联系小王确认周末徒步路线。附上集合时间。";
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

test("S1 contextual Todo: real selection → prepared card → refused request → execute → Todo owner readback keeps original text, project scope and source", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { command, sessionId, navigate, evaluate, waitFor, click, origin, projectId, homeDirectory } = browser;
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
  await select(0);
  await waitFor("document.querySelectorAll('[data-assistant-context-actions] .context-action[data-key]').length > 0", 8000);
  await click("[data-assistant-context-actions] [data-more]");
  await waitFor("[...document.querySelectorAll('.context-actions-menu button')].some(button => !button.disabled && button.textContent.startsWith('记成待办'))");
  // Hold only delivery of the genuine prepare response: the Host and Todo already evaluated the original focus.
  await evaluate(`(() => {
    const original = window.fetch; window.todoFetch = original; window.todoPrepare = null; window.todoCard = null; window.todoRefusals = 0;
    window.fetch = async (url, options) => {
      if (String(url).includes('/api/contextual/prepare')) {
        window.todoPrepare = JSON.parse(options.body);
        const response = await original(url, options); window.todoPreparedStatus = response.status;
        await new Promise(resolve => { window.releaseTodoPrepare = resolve; }); return response;
      }
      if (String(url).includes('/cards/') && String(url).endsWith('/run') && window.refuseTodoRun) {
        window.todoRefusals++; return new Response(JSON.stringify({ error: 'fixture permission refusal' }), { status: 403, headers: { 'content-type': 'application/json' } });
      }
      const response = await original(url, options);
      if (String(url).endsWith('/api/assistant/cards')) window.todoCard = { status: response.status, ...(await response.clone().json()) };
      return response;
    };
    [...document.querySelectorAll('.context-actions-menu button')].find(button => !button.disabled && button.textContent.startsWith('记成待办')).click();
  })()`);
  await waitFor("typeof window.releaseTodoPrepare === 'function'", 10_000);
  const prepared = await evaluate<{ focus: { targets: Array<{ text: string }>; object: { kind: string; id: string } } }>("window.todoPrepare");
  assert.equal(prepared.focus.targets[0]?.text, FIRST); assert.equal(prepared.focus.object.id, page.id);
  await select(1);
  assert.equal(await evaluate("getSelection().toString()"), SECOND);
  await evaluate("window.releaseTodoPrepare()");
  await waitFor("window.todoCard?.status === 200 && !document.querySelector('[data-assistant-panel]').hidden", 10_000);
  const placed = await evaluate<{ work_id: string }>("window.todoCard");
  const view = await evaluate<{ work: { scope: { kind: string; project_id: string } }; cards: Array<{ card_id: string; capability_id: string; source_object: { id: string }; fields: Array<{ key: string; value: string }> }> }>(
    `fetch(document.body.dataset.routePrefix + '/api/assistant/works/' + ${JSON.stringify(placed.work_id)}, { headers: molisWorkControlHeaders() }).then(r => r.json())`);
  assert.deepEqual(view.work.scope, { kind: "project", project_id: projectId });
  const card = view.cards.find(value => value.capability_id === "todo.items.create")!;
  assert.ok(card); assert.equal(card.source_object.id, page.id);
  assert.equal(card.fields.find(value => value.key === "notes")?.value, FIRST);
  assert.equal(JSON.stringify(card).includes(SECOND), false);
  const ownerBefore = openTodoStore(homeDirectory);
  try { assert.equal(ownerBefore.list({ actor: "user", actorId: "web-user", projectId: projectId!, everything: true }).length, 0); } finally { ownerBefore.close(); }
  const cardSelector = `[data-card="${card.card_id}"]`;
  await waitFor(`document.querySelector(${JSON.stringify(cardSelector + " .assistant-card-actions .mw-btn--primary")})`);
  const draft = await evaluate<string[]>(`[...document.querySelector(${JSON.stringify(cardSelector)}).querySelectorAll('input,textarea')].map(control => control.value)`);
  const closeStarters = async () => {
    if (!await evaluate("!document.querySelector('[data-assistant-starters]').hidden")) return;
    await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
    await waitFor("document.querySelector('[data-assistant-starters]').hidden");
  };
  await closeStarters();
  await evaluate("window.refuseTodoRun = true");
  await click(cardSelector + " .assistant-card-actions .mw-btn--primary");
  await waitFor(`window.todoRefusals === 1 && !document.querySelector(${JSON.stringify(cardSelector + " .assistant-card-actions .mw-btn--primary")}).disabled`);
  assert.deepEqual(await evaluate(`[...document.querySelector(${JSON.stringify(cardSelector)}).querySelectorAll('input,textarea')].map(control => control.value)`), draft);
  const refusedOwner = openTodoStore(homeDirectory);
  try { assert.equal(refusedOwner.list({ actor: "user", actorId: "web-user", projectId: projectId!, everything: true }).length, 0); } finally { refusedOwner.close(); }
  await evaluate("window.refuseTodoRun = false");
  await closeStarters();
  await click(cardSelector + " .assistant-card-actions .mw-btn--primary");
  await waitFor(`document.querySelector(${JSON.stringify(cardSelector)})?.dataset.status === 'done'`, 10_000);
  const owner = openTodoStore(homeDirectory);
  try {
    const items = owner.list({ actor: "user", actorId: "web-user", projectId: projectId!, everything: true });
    assert.equal(items.length, 1);
    assert.equal(items[0]!.title, "联系阿杰确认秋季发布计划"); assert.equal(items[0]!.notes, FIRST);
    // The existing offer leaves placement for the person: unassigned is its current create contract.
    assert.deepEqual([items[0]!.placement, items[0]!.project_id], ["unassigned", null]);
    assert.equal(items[0]!.sources[0]!.subject?.id, page.id); assert.equal(items[0]!.sources[0]!.subject?.kind, prepared.focus.object.kind);
    assert.equal(items[0]!.sources[0]!.excerpt, FIRST); assert.equal(JSON.stringify(items).includes(SECOND), false);
  } finally { owner.close(); }
  assert.equal(await evaluate("document.querySelector('[data-pages-editor] .ProseMirror').textContent"), FIRST + SECOND);
  await evaluate("window.fetch = window.todoFetch");
});
