import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

/**
 * P1 of specs/contextual-interaction in the real Workbench: the Pages editor reports what is in hand, the Host ranks
 * the directory's actions (rules here: this Home has no judgment connection, and the row says so), the row above the
 * Assistant input shows them, and a click runs the chosen one on the range that was in hand — even when the person
 * selects something else while the model is working.
 */
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const FIRST = "用户留存下降已经持续三个月。";
const SECOND = "我们认为主因是上手困难，新用户在第一周里很难完成第一个有价值的操作，所以很多人流失了。";
const THIRD = "竞品普遍提供十四天试用。";

for (const width of [1440, 390]) {
  test(`contextual actions ${width}px: select → row → choose → candidate → written to the range that was in hand`, { timeout: 120_000 }, async t => {
    const prompts: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const browser = await openGoalBrowser(t, true, undefined, async prompt => { prompts.push(prompt); await gate; return "主因是上手困难：新用户第一周难以完成有价值的操作。"; });
    if (!browser) return;
    const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
    await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
    const setup = openPagesStore(homeDirectory);
    const page = (() => { try { return setup.create({ project_id: projectId!, title: "留存分析", body: { type: "doc", content: [paragraph(FIRST), paragraph(SECOND), paragraph(THIRD)] } }); } finally { setup.close(); } })();
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${page.id}` }, sessionId));
    await waitFor(`document.querySelector('[data-pages=workbench]')?.dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes(${JSON.stringify(THIRD)})`);
    assert.equal(await evaluate("document.querySelector('[data-assistant-context-actions]').dataset.state"), "idle", "nothing in hand, nothing offered");

    const selectParagraph = (index: number) => evaluate(`(() => { const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
      const text = editor.querySelectorAll('p')[${index}].firstChild; const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, text.length);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange')); })()`);
    await selectParagraph(1);
    await waitFor("document.querySelector('[data-assistant-context-actions]')?.dataset.state === 'active' && document.querySelectorAll('[data-assistant-context-actions] .context-action[data-key]').length === 3");
    const row = await evaluate<{ titles: string[]; scope: string; basis: string; visible: number }>(`(() => { const root = document.querySelector('[data-assistant-context-actions]');
      const buttons = [...root.querySelectorAll('.context-action[data-key]')];
      return { titles: buttons.map(button => button.textContent.trim()), scope: root.querySelector('.context-actions-scope span')?.textContent || '',
        basis: root.querySelector('.context-actions-basis span')?.textContent || '', visible: buttons.filter(button => button.getClientRects().length).length }; })()`);
    assert.ok(row.titles.includes("改得更简洁"), `rules offer a rewrite for a passage: ${row.titles.join(" / ")}`);
    if (width === 1440) {
      assert.match(row.scope, /一段文字/);
      await waitFor("document.querySelector('[data-assistant-context-actions] .context-actions-basis span')?.textContent === '按规则'");
      assert.equal(row.visible, 3);
    } else {
      assert.equal(row.visible, 2, "a phone row keeps two actions; the third leads 更多");
    }
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);

    // Choose through the row: the editor keeps the selection (the row never takes focus), the range freezes at once.
    const key = await evaluate<string>(`[...document.querySelectorAll('[data-assistant-context-actions] .context-action[data-key]')].find(button => button.textContent.includes('改得更简洁'))?.dataset.key || ''`);
    if (width === 1440) await click(`[data-assistant-context-actions] .context-action[data-key="${key}"]`);
    else {
      await click("[data-assistant-context-actions] [data-more]");
      await waitFor("document.querySelector('.context-actions-menu')");
      await evaluate(`[...document.querySelectorAll('.context-actions-menu button')].find(button => button.textContent.includes('改得更简洁')).click()`);
    }
    await waitFor("document.querySelector('.pages-focus-frozen') && document.querySelector('.pages-pop:not([hidden])')?.textContent.includes('正在处理')");
    await waitFor(`${JSON.stringify(SECOND)}.startsWith(document.querySelector('.pages-focus-frozen')?.textContent || '-')`);
    if (width === 1440) assert.equal(await evaluate("Boolean(document.activeElement?.closest('[data-pages-editor]'))"), true, "the row never takes the focus from the editor");
    for (let tries = 0; prompts.length === 0 && tries < 200; tries++) await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(prompts.length, 1);
    assert.match(prompts[0]!, /上手困难/, "the prepared input carries the text that was in hand");

    // While the model works, the person selects another paragraph: the row follows the new selection,
    // but the result still belongs to the paragraph they asked about.
    await selectParagraph(0);
    await waitFor(`(document.querySelector('[data-assistant-context-actions] .context-actions-scope')?.title || '').startsWith(${JSON.stringify(FIRST.slice(0, 8))}) || innerWidth < 600`);
    release();
    await waitFor("document.querySelector('.pages-pop:not([hidden]) textarea')?.value.includes('主因是上手困难：')");
    await evaluate(`[...document.querySelectorAll('.pages-pop button')].find(button => button.textContent.trim() === '替换').click()`);
    await waitFor(`(() => { const ps = [...document.querySelectorAll('[data-pages-editor] .ProseMirror p')].map(p => p.textContent);
      return ps[0] === ${JSON.stringify(FIRST)} && ps[1] === '主因是上手困难：新用户第一周难以完成有价值的操作。' && ps[2] === ${JSON.stringify(THIRD)}; })()`);
    await waitFor("document.querySelector('[data-pages-editor-status]').textContent === '已保存'");
    const saved = openPagesStore(homeDirectory);
    try {
      const body = JSON.stringify(saved.get(page.id, projectId!).body);
      assert.match(body, /主因是上手困难：新用户第一周/);
      assert.match(body, new RegExp(FIRST));
      assert.doesNotMatch(body, /所以很多人流失了/);
    } finally { saved.close(); }
    const output = reviewEvidenceUrl("contextual-interaction/"); await mkdir(output, { recursive: true });
    await selectParagraph(2);
    await waitFor("document.querySelectorAll('[data-assistant-context-actions] .context-action[data-key]').length === 3");
    await writeFile(new URL(`contextual-row-${width}.png`, output), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  });
}

test("contextual actions: a result the person did not accept writes nothing; an edited range refuses; leaving the document clears the row", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, async () => "候选文字");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  const setup = openPagesStore(homeDirectory);
  const page = (() => { try { return setup.create({ project_id: projectId!, title: "草稿", body: { type: "doc", content: [paragraph(FIRST), paragraph(SECOND)] } }); } finally { setup.close(); } })();
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${page.id}` }, sessionId));
  await waitFor(`document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes(${JSON.stringify(SECOND)})`);
  await evaluate(`(() => { const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
    const text = editor.querySelectorAll('p')[1].firstChild; const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 10);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange')); })()`);
  await waitFor("document.querySelectorAll('[data-assistant-context-actions] .context-action[data-key]').length === 3");
  // “更多” lists every action for this passage regardless of the ranking, grouped by purpose.
  await click("[data-assistant-context-actions] [data-more]");
  const menu = await evaluate<{ groups: string[]; all: number }>(`(() => { const menu = document.querySelector('.context-actions-menu');
    return { groups: [...menu.querySelectorAll('h4')].map(h => h.textContent), all: menu.querySelectorAll('button[role=menuitem]').length }; })()`);
  assert.ok(menu.groups.includes("全部操作（不依赖推荐）"), menu.groups.join(","));
  assert.ok(menu.all >= 8);
  await evaluate(`[...document.querySelectorAll('.context-actions-menu button')].find(button => button.textContent.includes('改得更正式')).click()`);
  await waitFor("document.querySelector('.pages-pop:not([hidden]) textarea')?.value === '候选文字'");
  // The frozen text is edited before accepting: nothing is written anywhere.
  // The person clicks into the frozen text (the editor takes focus) and types a character there.
  await evaluate(`(() => { document.querySelector('[data-pages-editor] .ProseMirror').focus(); const frozen = document.querySelector('.pages-focus-frozen'); const text = frozen.firstChild; const range = document.createRange();
    range.setStart(text, 1); range.setEnd(text, 1); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); })()`);
  await command("Input.insertText", { text: "改" }, sessionId);
  await evaluate(`[...document.querySelectorAll('.pages-pop button')].find(button => button.textContent.trim() === '替换').click()`);
  await waitFor("document.querySelector('.pages-pop .pages-pop-error')?.textContent.includes('没有写入')");
  assert.equal(await evaluate("document.querySelector('[data-pages-editor] .ProseMirror').textContent.includes('候选文字')"), false);
  // Leaving the document: the row empties. The pointer goes to the back button first, as a person's does; while it rests
  // on the row, a lapsing context is kept until it leaves (spec §13.3).
  await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: 40, y: 120 }, sessionId);
  await evaluate(`document.querySelector('[data-pages-back]')?.click()`);
  await waitFor("document.querySelector('[data-assistant-context-actions]').dataset.state === 'idle'");
});

test("P2: a word is looked up in the search palette; a write goes to the Assistant as a card; a Goal's own text offers Goals actions", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, async () => "候选文字");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  const setup = openPagesStore(homeDirectory);
  const page = (() => { try { return setup.create({ project_id: projectId!, title: "术语表", body: { type: "doc", content: [paragraph("“激活”指新用户在第一周内完成至少一次有价值的操作。"), paragraph(SECOND)] } }); } finally { setup.close(); } })();
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${page.id}` }, sessionId));
  await waitFor(`document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes(${JSON.stringify(SECOND)})`);
  const select = (index: number, from: number, to?: number) => evaluate(`(() => { const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
    const text = editor.querySelectorAll('p')[${index}].firstChild; const range = document.createRange(); range.setStart(text, ${from}); range.setEnd(text, ${to === undefined ? "text.length" : to});
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange')); })()`);

  // A word: looked up across the project, in the workbench's own search palette.
  await select(0, 1, 3);
  await waitFor("[...document.querySelectorAll('[data-assistant-context-actions] .context-action[data-key]')].some(button => button.textContent.includes('在项目里查找'))", 8000);
  await evaluate(`[...document.querySelectorAll('[data-assistant-context-actions] .context-action[data-key]')].find(button => button.textContent.includes('在项目里查找')).click()`);
  await waitFor("document.querySelector('[data-global-search-dialog]')?.open && document.querySelector('[data-global-search]')?.value === '激活'", 8000);
  await evaluate(`document.querySelector('[data-global-search-close]')?.click()`);

  // A write: prepared as a card in an Assistant work, which opens; nothing is written before the person runs it.
  await select(1, 0);
  await waitFor("document.querySelectorAll('[data-assistant-context-actions] .context-action[data-key]').length > 0", 8000);
  await click("[data-assistant-context-actions] [data-more]");
  await waitFor("[...document.querySelectorAll('.context-actions-menu button')].some(button => button.textContent.startsWith('记下灵光'))");
  const placed = await evaluate<{ status: number; work_id?: string }>(`new Promise(resolve => { const original = window.fetch;
    window.fetch = async (url, options) => { const response = await original(url, options); if (String(url).includes('/api/assistant/cards')) { const copy = response.clone(); resolve({ status: response.status, ...(await copy.json().catch(() => ({}))) }); } return response; };
    [...document.querySelectorAll('.context-actions-menu button')].find(button => button.textContent.startsWith('记下灵光')).click(); })`);
  assert.equal(placed.status, 200);
  assert.ok(placed.work_id);
  await waitFor("document.querySelector('[data-assistant-panel]') && !document.querySelector('[data-assistant-panel]').hidden && document.querySelector('[data-assistant-work-title]')?.textContent === '记下灵光'", 8000);

  // A Goal's own text: the frame names the Goal, so what is selected in it can become steps under it.
  const goalId = await evaluate<string>(`fetch(document.body.dataset.routePrefix + '/api/board', { headers: molisWorkControlHeaders() }).then(r => r.json()).then(board => board.goals[0].goal.goal_id)`);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=goals&openItem=${encodeURIComponent(goalId)}` }, sessionId));
  await waitFor(`JSON.parse(document.querySelector('[data-goal-frame-surface]')?.getAttribute('data-assistant-context') || '{}').object?.id === ${JSON.stringify(goalId)}`, 10_000);
  await evaluate(`(() => { const frame = document.querySelector('[data-goal-frame-surface]'); const walker = document.createTreeWalker(frame, NodeFilter.SHOW_TEXT);
    let node; while ((node = walker.nextNode())) { if (node.textContent.trim().length > 12 && !node.parentElement.closest('button, input, textarea')) break; }
    const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, node.textContent.length); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange')); })()`);
  await waitFor("document.querySelectorAll('[data-assistant-context-actions] .context-action[data-key]').length > 0", 10_000);
  await click("[data-assistant-context-actions] [data-more]");
  await waitFor("[...document.querySelectorAll('.context-actions-menu button')].some(button => button.textContent.startsWith('拆成目标步骤'))", 5000);
});
