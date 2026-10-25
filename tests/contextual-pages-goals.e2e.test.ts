import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { GoalProjectApplication, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SurfaceFocus } from "@molis-ai/molis-work-contracts/services/contextual";
import { contextualCandidates } from "@molis-ai/molis-work-kernel/contextual";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages/testing";
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
const RING = `document.querySelectorAll('${BAR} button:not(:disabled)').length`;
// The focused button by the name the bar gives it: an action by its key, a format tool by its group and id (six of Pages' tools are an
// icon with no text, so their text alone would name them all alike), 更多 and ✦ by their text.
const FOCUSED = "(() => { const node = document.activeElement; return node && node.closest('.mw-ctx') ? (node.getAttribute('data-key') || (node.hasAttribute('data-id') ? node.getAttribute('data-group') + '/' + node.getAttribute('data-id') : node.textContent.trim())) : null; })()";

/** A Pages document open in the browser, one real text selection at a time, and the Pages documents in the project as its owner reads them. */
async function openPagesSelection(t: TestContext, blocks: object[], goalId?: string, title = SOURCE) {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return null;
  const { command, sessionId, navigate, evaluate, waitFor, origin, projectId, homeDirectory } = browser;
  const child = await pluginFrameBrowser(t,browser,"pages");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  const owner = openPagesStore(homeDirectory);
  const source = (() => { try { return owner.create({ project_id: projectId!, title, goal_id: goalId, body: { type: "doc", content: blocks } }); } finally { owner.close(); } })();
  await command("Page.addScriptToEvaluateOnNewDocument", {source:`(() => { const original = window.fetch; window.created = []; window.focusSeen = null;window.refusals=0;window.refuseRun=false;window.placedCard=null;
    window.fetch = async (url, options) => {
      if(String(url).includes('/cards/') && String(url).endsWith('/run') && window.refuseRun){window.refusals++;return new Response(JSON.stringify({error:'fixture permission refusal'}),{status:403,headers:{'content-type':'application/json'}});}
      const response = await original(url, options);
      if(String(url).endsWith('/api/assistant/cards'))window.placedCard={status:response.status,...(await response.clone().json())};
      if (String(url).endsWith('/api/contextual/create')) window.created.push({ asked: JSON.parse(options.body), ...(await response.clone().json()) });
      if (/\\/api\\/contextual\\/(candidates|judge)$/.test(String(url))) window.focusSeen = JSON.parse(options.body).focus;
      return response;
    }; })()`},sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${source.id}` }, sessionId));
  await child.waitFor(`document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes(${JSON.stringify(lines({ content: blocks }).at(-1))})`);
  /** The nth paragraph of the open document, selected the way a person drags over it. */
  const select = (index: number) => child.evaluate(`(() => {
    const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
    const range = document.createRange(); range.selectNodeContents(editor.querySelectorAll('p')[${index}].firstChild);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange'));
  })()`);
  const documents = () => { const reader = openPagesStore(homeDirectory); try { return reader.list(projectId!); } finally { reader.close(); } };
  return { ...browser, child, source, select, documents };
}

// W4-2-08 (specs/context-program §21.10): 「存为文档」 is Pages' creation entry. For a passage in Pages, rules alone recommend the entry of
// another plugin when there is one (decision D-5), so the bar beside a Pages selection carries 「记成待办」 and not 「存为文档」, and
// 「存为文档」 is not under 「更多」 either (a destination without a slot is not listed, spec §6.1); 「拆成目标步骤」, a proposal, waits
// under 「更多」 (decision D-4). The bar is walkable by keyboard to 「更多」. The Host still makes the Pages entry when it is asked for
// (decision D-2; the judgment can name it, and this fixture has no model connection): from what was selected, under the heading it sits in,
// once per request, undone only while unchanged, and opened the way the completion card's 「打开」 opens a made object. The completion
// card itself is the page's one `create` path, which test S1 W4-1 (contextual-todo.e2e) walks for 「记成待办」.
test("S2 W4-2-08 contextual Pages: the bar recommends another plugin's entry and keeps 更多 for the proposal → 存为文档 made under its heading → once per request → undo only while unchanged → 打开", { timeout: 150_000 }, async t => {
  const browser = await openPagesSelection(t, [heading(HEADING), paragraph(FIRST), paragraph(SECOND), paragraph(THIRD)]);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, projectId, databasePath, localHost, source, select, documents } = browser;
  const press = async (key: string, code: string, windowsVirtualKeyCode: number, extra: Record<string, unknown> = {}) => {
    await command("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode, ...extra }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode }, sessionId);
  };
  const editorText = () => browser.child.evaluate<string>("document.querySelector('[data-pages-editor] .ProseMirror').textContent");

  // ⌘. goes into the bar, ←→ walk its buttons in a ring, Esc leaves it and gives the focus back to what was being read. Esc sets the
  // recommended buttons aside for that selection, so the walk has a paragraph of its own and is not met again below.
  await select(2);
  await waitFor(`Boolean(${BUTTON("记成待办")}) && window.focusSeen`, 10_000);
  assert.equal(await evaluate(`Boolean(${BUTTON("存为文档")})`), false, "in Pages the rules recommend the other plugin's entry, not Pages' own");
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
  await waitFor(`!document.querySelector('${BAR}')`,5_000);
  await browser.child.waitFor("Boolean(document.activeElement.closest('.ProseMirror'))",5_000);
  assert.equal(await evaluate("window.created.length"), 0, "walking the bar made nothing");

  // The same selection by keys only: ⌘., → until 「更多」, Enter. The proposal is under it; Pages' own entry is not.
  await select(0);
  await waitFor(`Boolean(${BUTTON("记成待办")}) && window.focusSeen?.targets?.[0]?.text === ${JSON.stringify(FIRST)}`, 10_000);
  await press(".", "Period", 190, { modifiers: 2 });
  await waitFor(`${FOCUSED} !== null`, 5_000);
  for (let step = 0; step < ring && !(await evaluate<boolean>("document.activeElement.hasAttribute('data-more')")); step++) await press("ArrowRight", "ArrowRight", 39);
  assert.equal(await evaluate("document.activeElement.hasAttribute('data-more')"), true, "the keys reach 更多");
  await press("Enter", "Enter", 13, { text: "\r" });
  await waitFor("document.querySelector('.mw-ctx-menu button')", 5_000);
  assert.equal(await evaluate(`Boolean(${BUTTON("拆成目标步骤")})`), true, "the proposal waits under 更多");
  assert.equal(await evaluate(`Boolean(${BUTTON("存为文档")})`), false, "Pages' own entry is not listed there");
  assert.equal(await evaluate("window.created.length"), 0, "looking at 更多 made nothing");

  // The Host makes the entry it is asked for, the way the bar would for a judgment that names it.
  const focus = await evaluate<SurfaceFocus>("window.focusSeen");
  const caller: ActionCallContext = { actor_id: "web-user", actor_kind: "user", project_id: projectId!, audience: "user", permissions: ["pages:read", "pages:write", "goals:read", "goals:write", "todo:read", "todo:write"] };
  const directory = await localHost!.actionClient(molisWorkHostProjectReference({ projectId: projectId!, databasePath })).discover(caller);
  const key = contextualCandidates(directory, focus).find(item => item.origin === "intake" && item.title === "存为文档")!.key;
  type Made = { created: boolean; subject: { id: string; kind: string }; undo_token?: string };
  const asked = (requestId: string) => evaluate<{ ok: boolean; out: Made }>(`(async () => {
    const r = await fetch(document.body.dataset.routePrefix + '/api/contextual/create', { method: 'POST', headers: molisWorkControlHeaders(),
      body: JSON.stringify({ focus: window.focusSeen, key: ${JSON.stringify(key)}, request_id: ${JSON.stringify(requestId)} }) });
    return { ok: r.ok, out: await r.json() }; })()`);
  const undo = (token: string) => evaluate<{ ok: boolean }>(`(async () => {
    const r = await fetch(document.body.dataset.routePrefix + '/api/contextual/undo', { method: 'POST', headers: molisWorkControlHeaders(), body: JSON.stringify({ undo_token: ${JSON.stringify(token)} }) });
    return { ok: r.ok }; })()`);
  const request = crypto.randomUUID();
  const first = await asked(request);
  assert.equal(first.ok, true);
  assert.equal(first.out.created, true);
  assert.equal(first.out.subject.kind, "pages_document");
  assert.equal(documents().length, 2);
  const made = documents().find(item => item.id === first.out.subject.id)!;
  assert.equal(made.title, HEADING, "the heading it sits under");
  assert.deepEqual(lines(made.body), [FIRST, `摘自『${SOURCE}』`], "the passage as selected, then where it came from");
  assert.equal(await editorText(), HEADING + FIRST + SECOND + THIRD, "the source document is not written");
  assert.equal(focus.targets[0]?.text, FIRST); assert.equal(focus.object.id, source.id);

  // The same selection again: the same request, which Pages makes once.
  const again = await asked(request);
  assert.equal(again.out.subject.id, first.out.subject.id);
  assert.equal(documents().length, 2, "once per request");

  // Edited elsewhere since: 撤销 is refused by Pages, and the document stays as edited.
  const editor = openPagesStore(browser.homeDirectory);
  try { editor.update(made.id, { title: "改过的文档", expected_version: made.version }, projectId!); } finally { editor.close(); }
  assert.equal((await undo(first.out.undo_token!)).ok, false, "refused");
  assert.deepEqual(documents().map(item => item.title).sort(), ["改过的文档", SOURCE].sort(), "not removed, not changed again");

  // Unchanged: 撤销 removes the document it made, and only that one.
  await select(1);
  await waitFor(`window.focusSeen?.targets?.[0]?.text === ${JSON.stringify(SECOND)}`, 10_000);
  const second = await asked(crypto.randomUUID());
  assert.equal(second.out.created, true);
  assert.equal(documents().length, 3);
  assert.equal((await undo(second.out.undo_token!)).ok, true);
  assert.deepEqual(documents().map(item => item.title).sort(), ["改过的文档", SOURCE].sort());

  // 打开: the document it made opens in Pages, by the call the completion card's 「打开」 makes.
  const third = await asked(crypto.randomUUID());
  const opened = third.out.subject.id;
  await evaluate(`(async () => { const place = globalThis.molisPlacement; const view = await place.describe({ ...${JSON.stringify(third.out.subject)}, project_id: document.body.dataset.projectId || null }, true); place.openObject(view.open); })()`);
  await waitFor(`JSON.parse([...document.querySelectorAll('[data-assistant-context]')].map(node => node.getAttribute('data-assistant-context')).find(value => value && value.includes(${JSON.stringify(opened)})) || 'null')?.object?.id === ${JSON.stringify(opened)}`, 15_000)
    .catch(async error => { throw new Error(`${(error as Error).message}\n${await evaluate<string>("location.href + ' | ' + [...document.querySelectorAll('[data-assistant-context]')].map(node => node.getAttribute('data-assistant-context')).join(' || ')")}`); });
});

// W4-2-08 (specs/context-program §21.10): 「拆成目标步骤」 is a proposal, so it never goes straight in and rules alone do not put it on a
// slot of the bar (decision D-1); it waits under 「更多」 (decision D-4), where it is chosen. What it proves is the whole way from there: a
// draft and no write, a card that refuses and runs again, and the exact proposal approved through its completion link (W4-2-13).
for (const goalId of [undefined, "CORE"]) test(`S2 W4-2-08 W4-2-13 contextual Goals (${goalId ?? "independent"}): selection → draft → refusal → one proposal → completion link → approve persists Goals`, { timeout: 150_000 }, async t => {
  const browser = await openPagesSelection(t, [paragraph(PLAN), paragraph(SECOND)], goalId, "秋季发布笔记：新手引导改版、二十位用户试用与反馈整理的完整计划");
  if (!browser) return;
  const { evaluate, waitFor, click, navigate, reloadPage, command, sessionId, origin, projectId, source, select, store } = browser;
  await select(0);
  await waitFor(`Boolean(${BUTTON("记成待办")}) && window.focusSeen`, 10_000);
  assert.equal(await evaluate(`[...document.querySelectorAll('${BAR} button')].some(button => button.textContent.trim().startsWith('拆成目标步骤'))`), false, "rules alone put no proposal on a slot of the bar");
  await waitFor(`document.querySelector('${BAR} [data-more]')`, 8_000);
  await click(`${BAR} [data-more]`);
  await waitFor(`Boolean(${BUTTON("拆成目标步骤")})`, 5_000);
  const proposals = () => new GoalProjectApplication(store).goalTree.listGoalTreeProposals({ project_id: projectId! }).proposals.length;

  // Pressed under 更多: the Host drafts it and the page places the draft as a card.
  await evaluate(`${BUTTON("拆成目标步骤")}.dataset.testProposal='true'`);
  await click('[data-test-proposal]');
  await waitFor("window.placedCard?.status === 200", 20_000);
  const placed = await evaluate<{ work_id: string }>("window.placedCard");
  const out = await evaluate<{ created: boolean; undo_token?: string }>("window.created.at(-1)");
  assert.equal(out.created, false, "a proposal is a draft");
  assert.equal(out.undo_token, undefined, "withdrawing it is the approval decision, not an undo");
  assert.equal(proposals(), 0, "choosing it files nothing");

  const view = await evaluate<{ cards: Array<{ card_id: string; capability_id: string; source_object: { id: string } }> }>(
    `fetch(document.body.dataset.routePrefix + '/api/assistant/works/' + ${JSON.stringify(placed.work_id)}, { headers: molisWorkControlHeaders() }).then(r => r.json())`);
  const card = view.cards.find(value => value.capability_id === "goals.tree.submit")!;
  assert.ok(card); assert.equal(card.source_object.id, source.id);
  const run = `[data-card="${card.card_id}"] [data-ix-action="run"]`;
  await waitFor(`document.querySelector(${JSON.stringify(run)})`, 20_000);
  const draft = await evaluate<string[]>(`[...document.querySelector('[data-card="${card.card_id}"]').querySelectorAll('input,textarea')].map(control => control.value)`);

  // A refused run writes nothing and leaves the card as it was, ready to run again.
  await evaluate("window.refuseRun=true");
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
  const coordinator = new GoalProjectApplication(store);
  const proposal = coordinator.goalTree.listGoalTreeProposals({ project_id: projectId! }).proposals[0]!;
  assert.equal(proposal.root_goal_id, goalId ?? null);
  assert.deepEqual([link.text, link.href], ["去 Goals 确认", `/projects/${projectId}/?openPlugin=goals#${proposal.proposal_id}`]);
  assert.equal(await browser.child.evaluate("document.querySelector('[data-pages-editor] .ProseMirror').textContent"), PLAN + SECOND, "the source document is not written");
  const other = coordinator.goalTreeSubmission.submitGoalTreeProposal({ project_id: projectId!, actor_id: "browser-planner", summary: "另一份尚未决定的计划",
    idempotency_key: "other-proposal", items: [{ item_id: "other-step", kind: "goal", operation: "create", payload: { goal_id: "other-step", title: "另一个目标步骤" },
      source_refs: ["conversation://other-plan"], reason: "必须由人单独决定", confidence: 1 }] }).proposal;
  const before = store.snapshot(projectId!);
  const goalItems = proposal.items.filter(item => item.kind === "goal");
  assert.equal(goalItems.length, 2);
  assert.ok(goalItems.every(item => !before.goals.some(goal => goal.goal_id === item.payload.goal_id)), "submitting a proposal materializes no Goals");
  await navigate(() => click(`[data-card="${card.card_id}"] a[href="${link.href}"]`));
  const entry = `#${proposal.proposal_id}`;
  const form = `${entry} [data-goal-tree-proposal-id="${proposal.proposal_id}"]`;
  await waitFor(`document.querySelector(${JSON.stringify(entry)})?.open && document.querySelector(${JSON.stringify(form)})?.getBoundingClientRect().width > 0`);
  assert.equal(await evaluate("location.hash"), "", "the navigation anchor is consumed once");
  assert.equal(await evaluate(`document.querySelector('#${other.proposal_id}').open`), false, "another pending proposal is not opened");
  if (!goalId) {
    const evidence = join(process.cwd(), ".impeccable/qa/review/contextual-pages-goals");
    await mkdir(evidence, { recursive: true });
    for (const width of [1440, 390]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
      await evaluate(`(() => { document.documentElement.dataset.theme = document.documentElement.dataset.resolvedTheme = ${width === 390 ? '"dark"' : '"light"'}; document.querySelector(${JSON.stringify(entry + " > summary")}).scrollIntoView({ block: "center" }); })()`);
      await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true, "the proposal fits the viewport");
      const capture = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(join(evidence, `proposal-${width}.png`), Buffer.from(capture.data, "base64"));
      await evaluate(`document.querySelector(${JSON.stringify(form + " .decision-actions")}).scrollIntoView({ block: "center" })`);
      await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      const footer = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(join(evidence, `proposal-actions-${width}.png`), Buffer.from(footer.data, "base64"));
    }
    await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  }
  const otherForm = `#${other.proposal_id} [data-goal-tree-decision-form]`;
  await click(`#${other.proposal_id} > summary`);
  await click(otherForm + ' textarea[name="reason"]');
  await command("Input.insertText", { text: "另一份计划先保留这段未提交的意见。" }, sessionId);
  await click(form + ' textarea[name="reason"]');
  await command("Input.insertText", { text: "确认这两步，按选中的发布计划推进。" }, sessionId);
  await command("Network.enable", {}, sessionId);
  await command("Network.setBlockedURLs", { urls: [origin + `/projects/${projectId}/api/goal-tree-proposals/${proposal.proposal_id}/decision`] }, sessionId);
  await click(form + ' button[value="confirm"]');
  await waitFor(`!document.querySelector(${JSON.stringify(form + " [data-decision-error]")}).hidden && !document.querySelector(${JSON.stringify(form + ' button[value="confirm"]')}).disabled`);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(form + ' textarea[name="reason"]')}).value`), "确认这两步，按选中的发布计划推进。");
  assert.deepEqual(store.snapshot(projectId!).goals, before.goals, "a refused approval writes no Goals");
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);
  await click(form + ' button[value="confirm"]');
  await waitFor(`!document.querySelector(${JSON.stringify(entry)})`, 15_000);
  assert.equal(await evaluate(`document.querySelector('#${other.proposal_id}').open`), true, "another proposal stays expanded through the forced refresh");
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(otherForm + ' textarea[name="reason"]')}).value`), "另一份计划先保留这段未提交的意见。", "approving this proposal preserves another proposal's unsubmitted reason");
  const after = store.snapshot(projectId!);
  assert.equal(after.goal_tree_proposals.find(item => item.proposal_id === proposal.proposal_id)?.state, "approved");
  assert.equal(after.goal_tree_proposals.find(item => item.proposal_id === other.proposal_id)?.state, "pending");
  for (const item of goalItems) {
    assert.equal(after.goals.filter(goal => goal.goal_id === item.payload.goal_id && goal.title === item.payload.title).length, 1);
    assert.equal(after.relations.filter(relation => relation.from_goal_id === item.payload.goal_id && relation.to_goal_id === goalId && relation.type === "part_of" && relation.state === "active").length, goalId ? 1 : 0);
  }
  await reloadPage();
  assert.deepEqual(store.snapshot(projectId!).goals, after.goals, "approved Goals survive reload without repetition");
  assert.deepEqual(store.snapshot(projectId!).relations, after.relations);
  const openBeforeMissing = await evaluate(`document.querySelector('#${other.proposal_id}').open`);
  await navigate(() => command("Page.navigate", { url: origin + `/projects/${projectId}/?openPlugin=goals#missing-proposal` }, sessionId));
  await waitFor(`document.readyState === "complete" && Boolean(document.querySelector('#${other.proposal_id}'))`);
  assert.equal(await evaluate(`document.querySelector('#${other.proposal_id}').open`), openBeforeMissing, "a missing target preserves the existing disclosure state");
  assert.deepEqual(store.snapshot(projectId!).goal_tree_proposals, after.goal_tree_proposals);

});
