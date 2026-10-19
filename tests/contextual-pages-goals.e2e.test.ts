import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { GoalProjectApplication, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SurfaceFocus } from "@molis-ai/molis-work-contracts/services/contextual";
import { contextualCandidates } from "@molis-ai/molis-work-kernel/contextual";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

const SOURCE = "发布笔记";
const HEADING = "发布计划";
const FIRST = "联系阿杰确认秋季发布计划。附上本周方案和预算说明。";
const SECOND = "联系小王确认周末徒步路线。附上集合时间。";
const THIRD = "整理发布清单。核对附件和链接。";
const PLAN = "下周三前完成新手引导改版。周五发给二十个老用户试用并收集反馈。";
const text = (value: string) => ({ type: "text", text: value });
const paragraph = (value: string) => ({ type: "paragraph", content: [text(value)] });
const heading = (value: string) => ({ type: "heading", attrs: { level: 2 }, content: [text(value)] });
const lines = (body: unknown) => ((JSON.parse(JSON.stringify(body)) as { content?: { content?: { text?: string }[] }[] }).content ?? [])
  .map(block => (block.content ?? []).map(part => part.text ?? "").join(""));

const BAR = ".mw-ctx:not(.mw-ctx--static):not([hidden]):not([data-away])";
const BUTTON = (head: string) => `[...document.querySelectorAll('${BAR} button,.mw-ctx-menu button')].find(button => !button.disabled && button.textContent.trim().startsWith(${JSON.stringify(head)}))`;
const CARD = (head: string) => `[...document.querySelectorAll('.placement-toast')].find(card => card.textContent.includes(${JSON.stringify(head)}))`;
const RING = `document.querySelectorAll('${BAR} button:not(:disabled)').length`;
const FOCUSED = "(() => { const node = document.activeElement; return node && node.closest('.mw-ctx') ? (node.getAttribute('data-key') || node.textContent.trim()) : null; })()";

/** A Pages document open in the browser, one real text selection at a time, and the Pages documents in the project as its owner reads them. */
async function openPagesSelection(t: TestContext, blocks: object[]) {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return null;
  const { command, sessionId, navigate, evaluate, waitFor, origin, projectId, homeDirectory } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  const owner = openPagesStore(homeDirectory);
  const source = (() => { try { return owner.create({ project_id: projectId!, title: SOURCE, body: { type: "doc", content: blocks } }); } finally { owner.close(); } })();
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${source.id}` }, sessionId));
  await waitFor(`document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes(${JSON.stringify(lines({ content: blocks }).at(-1))})`);
  await evaluate(`(() => { const original = window.fetch; window.created = []; window.focusSeen = null;
    window.fetch = async (url, options) => {
      const response = await original(url, options);
      if (String(url).endsWith('/api/contextual/create')) window.created.push({ asked: JSON.parse(options.body), ...(await response.clone().json()) });
      if (/\\/api\\/contextual\\/(candidates|judge)$/.test(String(url))) window.focusSeen = JSON.parse(options.body).focus;
      return response;
    }; })()`);
  /** The nth paragraph of the open document, selected the way a person drags over it. */
  const select = (index: number) => evaluate(`(() => {
    const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
    const range = document.createRange(); range.selectNodeContents(editor.querySelectorAll('p')[${index}].firstChild);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange'));
  })()`);
  const documents = () => { const reader = openPagesStore(homeDirectory); try { return reader.list(projectId!); } finally { reader.close(); } };
  return { ...browser, source, select, documents };
}

// W4-2-08 (specs/context-program §21.10): 「存为文档」 is Pages' creation entry. Rules alone recommend one destination for a passage, and
// in this project Pages is the first one in the directory; Pages declared how a document is undone, so one click makes it, from what was
// selected, under the heading it sits in, and the completion card offers 「打开」 and 「撤销」. The whole way is also walkable by keyboard.
test("S2 W4-2-08 contextual Pages: keyboard walk → 存为文档 made at once under its heading → once per request → undo only while unchanged → 打开", { timeout: 150_000 }, async t => {
  const browser = await openPagesSelection(t, [heading(HEADING), paragraph(FIRST), paragraph(SECOND), paragraph(THIRD)]);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, projectId, source, select, documents } = browser;
  const press = async (key: string, code: string, windowsVirtualKeyCode: number, extra: Record<string, unknown> = {}) => {
    await command("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode, ...extra }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode }, sessionId);
  };
  const editorText = () => evaluate<string>("document.querySelector('[data-pages-editor] .ProseMirror').textContent");

  // ⌘. goes into the bar, ←→ walk its buttons in a ring, Esc leaves it and gives the focus back to what was being read. Esc sets the
  // recommended buttons aside for that selection, so the walk has a paragraph of its own and is not met again below.
  await select(2);
  await waitFor(`Boolean(${BUTTON("存为文档")})`, 10_000);
  const ring = await evaluate<number>(RING);
  assert.ok(ring >= 2, "the bar has more than one button");
  await press(".", "Period", 190, { modifiers: 2 });
  await waitFor(`${FOCUSED} !== null`, 5_000);
  const walked: unknown[] = [];
  for (let step = 0; step < ring; step++) { walked.push(await evaluate(FOCUSED)); await press("ArrowRight", "ArrowRight", 39); }
  assert.equal(new Set(walked).size, ring, "→ visits every button once");
  assert.equal(await evaluate(FOCUSED), walked[0], "and comes around to the first");
  await press("ArrowLeft", "ArrowLeft", 37);
  assert.equal(await evaluate(FOCUSED), walked.at(-1), "← goes back around");
  await press("Escape", "Escape", 27);
  await waitFor(`!document.querySelector('${BAR}') && Boolean(document.activeElement.closest('.ProseMirror'))`, 5_000);
  assert.equal(await evaluate("window.created.length"), 0, "walking the bar made nothing");

  // The same selection by keys only: ⌘., → until 「存为文档」, Enter.
  await select(0);
  await waitFor(`Boolean(${BUTTON("存为文档")})`, 10_000);
  await press(".", "Period", 190, { modifiers: 2 });
  await waitFor(`${FOCUSED} !== null`, 5_000);
  for (let step = 0; step < ring && !(await evaluate<boolean>("document.activeElement.textContent.trim().startsWith('存为文档')")); step++) await press("ArrowRight", "ArrowRight", 39);
  assert.equal(await evaluate("document.activeElement.textContent.trim().startsWith('存为文档')"), true, "the keys reach it");
  await press("Enter", "Enter", 13, { text: "\r" });
  await waitFor(`Boolean(${CARD("已存为文档")})`, 10_000);
  assert.equal(await evaluate("window.created.length"), 1);
  const first = await evaluate<{ asked: { focus: { targets: { text: string }[]; object: { id: string } }; request_id: string }; created: boolean; subject: { id: string; kind: string } }>("window.created[0]");
  assert.equal(first.created, true);
  assert.equal(first.subject.kind, "pages_document");
  assert.equal(first.asked.focus.targets[0]?.text, FIRST); assert.equal(first.asked.focus.object.id, source.id);
  assert.deepEqual(await evaluate(`[...${CARD("已存为文档")}.querySelectorAll('button')].map(button => button.textContent)`), ["打开", "撤销", "×"]);
  const made = documents().find(item => item.id === first.subject.id)!;
  assert.equal(documents().length, 2);
  assert.equal(made.title, HEADING, "the heading it sits under");
  assert.deepEqual(lines(made.body), [FIRST, `摘自『${SOURCE}』`], "the passage as selected, then where it came from");
  assert.equal(await editorText(), HEADING + FIRST + SECOND + THIRD, "the source document is not written");

  // The same selection again: the same request, which Pages makes once.
  await waitFor(`Boolean(${BUTTON("存为文档")})`, 10_000);
  await evaluate(`${BUTTON("存为文档")}.click()`);
  await waitFor("window.created.length === 2", 10_000);
  assert.equal(await evaluate("window.created[1].asked.request_id"), first.asked.request_id);
  assert.equal(documents().length, 2, "once per request");

  // Edited elsewhere since: 撤销 is refused by Pages, and the document stays as edited.
  const editor = openPagesStore(browser.homeDirectory);
  try { editor.update(made.id, { title: "改过的文档", expected_version: made.version }, projectId!); } finally { editor.close(); }
  await evaluate(`[...${CARD("已存为文档")}.querySelectorAll('button')].find(button => button.textContent === '撤销').click()`);
  await waitFor(`Boolean(${CARD("没能撤销")})`, 10_000);
  assert.deepEqual(documents().map(item => item.title).sort(), ["改过的文档", SOURCE].sort(), "not removed, not changed again");

  // Unchanged: 撤销 removes the document it made, and only that one.
  await select(1);
  await waitFor(`Boolean(${BUTTON("存为文档")})`, 10_000);
  await evaluate(`document.querySelectorAll('.placement-toast').forEach(card => card.remove()); ${BUTTON("存为文档")}.click()`);
  await waitFor(`Boolean(${CARD("已存为文档")})`, 10_000);
  assert.equal(documents().length, 3);
  await evaluate(`[...${CARD("已存为文档")}.querySelectorAll('button')].find(button => button.textContent === '撤销').click()`);
  await waitFor(`Boolean(${CARD("已撤销")})`, 10_000);
  assert.deepEqual(documents().map(item => item.title).sort(), ["改过的文档", SOURCE].sort());

  // 打开: the document it made opens in Pages.
  await select(1);
  await waitFor(`Boolean(${BUTTON("存为文档")})`, 10_000);
  await evaluate(`document.querySelectorAll('.placement-toast').forEach(card => card.remove()); ${BUTTON("存为文档")}.click()`);
  await waitFor(`Boolean(${CARD("已存为文档")})`, 10_000);
  const opened = (await evaluate<{ subject: { id: string } }>("window.created.at(-1)")).subject.id;
  await evaluate(`[...${CARD("已存为文档")}.querySelectorAll('button')].find(button => button.textContent === '打开').click()`);
  await waitFor(`JSON.parse([...document.querySelectorAll('[data-assistant-context]')].map(node => node.getAttribute('data-assistant-context')).find(value => value && value.includes(${JSON.stringify(opened)})) || 'null')?.object?.id === ${JSON.stringify(opened)}`, 15_000)
    .catch(async error => { throw new Error(`${(error as Error).message}\n${await evaluate<string>("location.href + ' | ' + [...document.querySelectorAll('[data-assistant-context]')].map(node => node.getAttribute('data-assistant-context')).join(' || ')")}`); });
});

// W4-2-08 (specs/context-program §21.10): 「拆成目标步骤」 is a proposal, so it never goes straight in and rules alone do not put it on the
// bar (decision D-1); the judgment names it. A judgment needs a model connection this fixture does not have, so the choice is asked of the
// Host the way the bar asks it (the same route, the key Goals' declaration gives it) and the card is placed the way the page places a draft.
// What it proves is what is behind the bar: a draft and no write, a card that refuses and runs again, and a proposal that waits for Goals.
test("S2 W4-2-08 contextual Goals: 拆成目标步骤 is a draft for a card → a refused run writes nothing → run again files one proposal → 去 Goals 确认", { timeout: 150_000 }, async t => {
  const browser = await openPagesSelection(t, [paragraph(PLAN), paragraph(SECOND)]);
  if (!browser) return;
  const { evaluate, waitFor, click, projectId, databasePath, localHost, source, select, store } = browser;
  await select(0);
  await waitFor(`Boolean(${BUTTON("存为文档")}) && window.focusSeen`, 10_000);
  await waitFor(`document.querySelector('${BAR} [data-more]')`, 8_000);
  await click(`${BAR} [data-more]`);
  await waitFor("document.querySelector('.mw-ctx-menu button')", 5_000);
  assert.equal(await evaluate(`Boolean(${BUTTON("拆成目标步骤")})`), false, "rules alone do not offer a proposal");

  const focus = await evaluate<SurfaceFocus>("window.focusSeen");
  const caller: ActionCallContext = { actor_id: "web-user", actor_kind: "user", project_id: projectId!, audience: "user", permissions: ["goals:read", "goals:write"] };
  const directory = await localHost!.actionClient(molisWorkHostProjectReference({ projectId: projectId!, databasePath })).discover(caller);
  const key = contextualCandidates(directory, focus).find(item => item.origin === "intake" && item.title === "拆成目标步骤")!.key;
  const proposals = () => new GoalProjectApplication(store).goalTree.listGoalTreeProposals({ project_id: projectId! }).proposals.length;

  const placed = await evaluate<{ out: { created: boolean; undo_token?: string }; work_id: string }>(`(async () => {
    const post = async (path, body) => { const r = await fetch(document.body.dataset.routePrefix + path, { method: 'POST', headers: molisWorkControlHeaders(), body: JSON.stringify(body) });
      const out = await r.json(); if (!r.ok) throw new Error(JSON.stringify(out)); return out; };
    const focus = window.focusSeen, out = await post('/api/contextual/create', { focus, key: ${JSON.stringify(key)}, request_id: crypto.randomUUID() });
    const material = { title: '选中的内容' + (focus.object.title ? ' · ' + focus.object.title : ''), text: focus.targets.map(target => target.text).join('\\n') };
    const card = { title: '拆成目标步骤', summary: out.draft.summary || '', reference: out.draft.action, input: out.draft.input,
      ...(out.draft.editable ? { editable: out.draft.editable } : {}), ...(out.draft.missing ? { missing: out.draft.missing } : {}), source_object: focus.object, materials: [material] };
    const placed = await post('/api/assistant/cards', { message_id: crypto.randomUUID(), source: { surface: focus.plugin_id, title: focus.object.title || '' }, card });
    document.dispatchEvent(new CustomEvent('molis:assistant-open', { detail: { work_id: placed.work_id } }));
    return { out, work_id: placed.work_id };
  })()`);
  assert.equal(placed.out.created, false, "a proposal is a draft");
  assert.equal(placed.out.undo_token, undefined, "withdrawing it is the approval decision, not an undo");
  assert.equal(proposals(), 0, "choosing it files nothing");

  const view = await evaluate<{ cards: Array<{ card_id: string; capability_id: string; source_object: { id: string } }> }>(
    `fetch(document.body.dataset.routePrefix + '/api/assistant/works/' + ${JSON.stringify(placed.work_id)}, { headers: molisWorkControlHeaders() }).then(r => r.json())`);
  const card = view.cards.find(value => value.capability_id === "goals.tree.submit")!;
  assert.ok(card); assert.equal(card.source_object.id, source.id);
  const run = `[data-card="${card.card_id}"] [data-ix-action="run"]`;
  await waitFor(`document.querySelector(${JSON.stringify(run)})`, 20_000);
  const draft = await evaluate<string[]>(`[...document.querySelector('[data-card="${card.card_id}"]').querySelectorAll('input,textarea')].map(control => control.value)`);

  // A refused run writes nothing and leaves the card as it was, ready to run again.
  await evaluate(`(() => { const original = window.fetch; window.cardFetch = original; window.refusals = 0; window.refuseRun = true;
    window.fetch = async (url, options) => {
      if (String(url).includes('/cards/') && String(url).endsWith('/run') && window.refuseRun) {
        window.refusals++; return new Response(JSON.stringify({ error: 'fixture permission refusal' }), { status: 403, headers: { 'content-type': 'application/json' } });
      }
      return original(url, options);
    }; })()`);
  await click(run);
  await waitFor(`window.refusals === 1 && !document.querySelector(${JSON.stringify(run)}).disabled`, 10_000);
  assert.deepEqual(await evaluate(`[...document.querySelector('[data-card="${card.card_id}"]').querySelectorAll('input,textarea')].map(control => control.value)`), draft, "the card is as it was");
  assert.equal(proposals(), 0, "a refused run writes nothing");

  // Run again: one proposal, which takes effect only once it is confirmed in Goals; the card says so and links there.
  await evaluate("window.refuseRun = false");
  await click(run);
  await waitFor(`document.querySelector('[data-card="${card.card_id}"]')?.dataset.status === 'done'`, 20_000);
  assert.equal(proposals(), 1, "written once");
  const done = `document.querySelector('[data-card="${card.card_id}"]')`;
  assert.equal(await evaluate(`${done}.textContent.includes('已提交目标提案：要在 Goals 里确认才生效')`), true);
  const link = await evaluate<{ text: string; href: string | null }>(`(() => { const link = [...${done}.querySelectorAll('a')].find(node => node.textContent.includes('去 Goals 确认')); return { text: link ? link.textContent.trim() : '', href: link ? link.getAttribute('href') : null }; })()`);
  assert.deepEqual([link.text, link.href], ["去 Goals 确认", `/projects/${projectId}/?openPlugin=goals`]);
  assert.equal(await evaluate("document.querySelector('[data-pages-editor] .ProseMirror').textContent"), PLAN + SECOND, "the source document is not written");
  await evaluate("window.fetch = window.cardFetch");
});
