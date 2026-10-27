import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

/**
 * P1 of specs/archive/contextual-interaction in the real Workbench: the Pages editor reports what is in hand, the Host ranks
 * the directory's actions (rules here: this Home has no judgment connection, and the bar says so), the floating context
 * toolbar next to the selection shows them, and a click runs the chosen one on the range that was in hand — even when the
 * person selects something else while the model is working.
 */
const BAR = ".mw-ctx:not([hidden])";
const ACTION = `${BAR} .mw-btn[data-key]`;
const MORE = `${BAR} [data-more]`;
/** Catches the plan the Host answers with, so the bar can be compared with it (W2-03). */
const CAPTURE_PLAN = `(() => { const original = window.fetch; window.fetch = async (...args) => { const response = await original(...args);
  if (String(args[0]).includes('/api/assistant/cards')) window.contextPlaced={status:response.status,...await response.clone().json()};
  if (String(args[0]).includes('/api/contextual/candidates')) response.clone().json().then(body => { window.__contextPlan = body.plan; }, () => undefined); return response; }; })()`;
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const FIRST = "用户留存下降已经持续三个月。";
const SECOND = "我们认为主因是上手困难，新用户在第一周里很难完成第一个有价值的操作，所以很多人流失了。";
const THIRD = "竞品普遍提供十四天试用。";

for (const width of [1440, 390]) {
  test(`contextual actions ${width}px: select → bar → choose → candidate → written to the range that was in hand`, { timeout: 120_000 }, async t => {
    const prompts: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const browser = await openGoalBrowser(t, true, undefined, async prompt => { prompts.push(prompt); await gate; return "主因是上手困难：新用户第一周难以完成有价值的操作。"; });
    if (!browser) return;
    const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const child=await pluginFrameBrowser(t,browser,"pages");
  await command("Page.addScriptToEvaluateOnNewDocument",{source:CAPTURE_PLAN},sessionId);
    await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
    const setup = openPagesStore(homeDirectory);
    const page = (() => { try { return setup.create({ project_id: projectId!, title: "留存分析", body: { type: "doc", content: [paragraph(FIRST), paragraph(SECOND), paragraph(THIRD)] } }); } finally { setup.close(); } })();
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${page.id}` }, sessionId));
    await child.waitFor(`document.querySelector('[data-pages=workbench]')?.dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes(${JSON.stringify(THIRD)})`);
    assert.equal(await evaluate("document.querySelector('.mw-ctx').hidden"), true, "nothing in hand, nothing offered");

    const selectParagraph = (index: number) => child.evaluate(`(() => { const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
      const text = editor.querySelectorAll('p')[${index}].firstChild; const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, text.length);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange')); })()`);
    // As many of the plan's first actions as the bar has room for: three in a wide window; in a narrow one at most two, and what
    // does not fit goes to 更多's 推荐 rather than being squeezed under its text (context-toolbar §6, QA-014).
    const shown = `(${width === 390 ? "n => n >= 1 && n <= 2" : "n => n === 3"})(document.querySelectorAll(${JSON.stringify(ACTION)}).length)`;
    await selectParagraph(1);
    await waitFor(`${shown} && window.__contextPlan`);
    const slots = await evaluate<number>(`document.querySelectorAll(${JSON.stringify(ACTION)}).length`);
    const row = await evaluate<{ titles: string[]; planned: string[]; tools: number; inView: boolean; fits: boolean; tight: boolean }>(`(() => { const plan = window.__contextPlan, title = key => plan.candidates.find(item => item.key === key).title;
      const bar = document.querySelector('.mw-ctx'), box = bar.getBoundingClientRect();
      return { titles: [...bar.querySelectorAll('.mw-btn[data-key] > span:first-child')].map(node => node.textContent.trim()), planned: plan.primary.map(title),
        tools: bar.querySelectorAll('.mw-ctx__tools button').length, inView: box.left >= 0 && box.right <= innerWidth && box.top >= 0,
        fits: bar.scrollWidth <= bar.clientWidth, tight: bar.hasAttribute('data-tight') }; })()`);
    assert.ok(row.planned.includes("改得更简洁"), `rules offer a rewrite for a passage: ${row.planned.join(" / ")}`);
    assert.deepEqual(row.titles, row.planned.slice(0, slots), "the bar shows the plan's first actions in order");
    assert.ok(row.tools > 0, "the editor's tools sit at the left of the bar");
    assert.equal(row.inView, true);
    assert.equal(row.fits, true, "everything on the bar fits inside it");
    assert.equal(row.tight, false, "the rules' own titles are shown whole");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);

    // 更多 holds exactly the plan (spec §6.4.1, W2-03): the actions that did not fit, the same groups, every action, the whole document's last.
    // One way to hand over (context-program §21.2 point 4): 「说出要做什么」 did the same as 「带到助理」 once neither writes words, so it is gone.
    await waitFor(`(() => { const menu = document.querySelector('.mw-ctx-menu'); if (menu && menu.querySelector('.mw-ctx-menu__basis')?.textContent === '按规则') return true; document.querySelector(${JSON.stringify(MORE)})?.click(); return false; })()`);
    // RING-07: the current toolbar keeps the unconfigured judgment state beside its rules explanation.
    await waitFor("document.querySelector('.mw-ctx-menu__basis .mw-state-ring')?.dataset.mwState === 'unavailable'");
    const menu = await evaluate<string[]>(`[...document.querySelectorAll('.mw-ctx-menu > p:not(.mw-ctx-menu__basis), .mw-ctx-menu > button')].map(node => node.matches('p') ? '#' + node.textContent.trim() : node.querySelector('span').textContent.trim())`);
    const planned = await evaluate<string[]>(`(() => { const plan = window.__contextPlan; const title = key => plan.candidates.find(item => item.key === key).title; const extra = plan.primary.slice(${slots}).map(title);
      return [...(extra.length ? ['#推荐', ...extra] : []), ...plan.more.flatMap(group => ['#' + group.title, ...group.keys.map(title)]), '#全部操作（不依赖推荐）', ...plan.candidates.map(item => item.title), '#助理', '带到助理']; })()`);
    assert.deepEqual(menu, planned);
    assert.deepEqual(menu.slice(menu.indexOf("#整篇") + 1, menu.indexOf("#全部操作（不依赖推荐）")), ["全文校对", "整篇翻译成新文档"], `the whole document's actions come last: ${menu.join(" / ")}`);
    await evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await waitFor("!document.querySelector('.mw-ctx-menu')");
    await selectParagraph(1);
    await waitFor(shown);

    // Choose through the bar: the editor keeps the selection (the bar never takes focus), the range freezes at once.
    const key = await evaluate<string>(`window.__contextPlan.candidates.find(item => item.title === '改得更简洁').key`);
    if (await evaluate<boolean>(`Boolean(document.querySelector(${JSON.stringify(`${ACTION}[data-key="${key}"]`)}))`)) await click(`${ACTION}[data-key="${key}"]`);
    else {
      await click(MORE);
      await waitFor("document.querySelector('.mw-ctx-menu')");
      await evaluate(`[...document.querySelectorAll('.mw-ctx-menu button')].find(button => button.textContent.includes('改得更简洁')).dataset.testChoice="true"`);
      await click("[data-test-choice]");
    }
    await child.waitFor("document.querySelector('.pages-focus-frozen') && document.querySelector('.pages-pop:not([hidden])')?.textContent.includes('正在处理')");
    await child.waitFor(`${JSON.stringify(SECOND)}.startsWith(document.querySelector('.pages-focus-frozen')?.textContent || '-')`);
    if (width === 1440) assert.equal(await child.evaluate("Boolean(document.activeElement?.closest('[data-pages-editor]'))"), true, "the bar never takes the focus from the editor");
    for (let tries = 0; prompts.length === 0 && tries < 200; tries++) await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(prompts.length, 1);
    assert.match(prompts[0]!, /上手困难/, "the prepared input carries the text that was in hand");

    // While the model works, the person selects another paragraph: the bar follows the new selection,
    // but the result waits where it was and still belongs to the paragraph they asked about.
    const firstContext = await evaluate<string>("window.__contextPlan.context_id");
    await selectParagraph(0);
    await waitFor(`window.__contextPlan.context_id !== ${JSON.stringify(firstContext)} && ${shown}`);
    assert.equal(await child.evaluate("Boolean(document.querySelector('.pages-pop:not([hidden])'))"), true, "the waited-for result stays when something else is selected");
    release();
    await child.waitFor("document.querySelector('.pages-pop:not([hidden]) textarea')?.value.includes('主因是上手困难：')");
    await child.evaluate(`[...document.querySelectorAll('.pages-pop button')].find(button => button.textContent.trim() === '替换').click()`);
    await child.waitFor(`(() => { const ps = [...document.querySelectorAll('[data-pages-editor] .ProseMirror p')].map(p => p.textContent);
      return ps[0] === ${JSON.stringify(FIRST)} && ps[1] === '主因是上手困难：新用户第一周难以完成有价值的操作。' && ps[2] === ${JSON.stringify(THIRD)}; })()`);
    await child.waitFor("!document.querySelector('.pages-pop:not([hidden])')");
    await child.waitFor("document.querySelector('[data-pages-editor-status]').textContent === '已保存'");
    const saved = openPagesStore(homeDirectory);
    try {
      const body = JSON.stringify(saved.get(page.id, projectId!).body);
      assert.match(body, /主因是上手困难：新用户第一周/);
      assert.match(body, new RegExp(FIRST));
      assert.doesNotMatch(body, /所以很多人流失了/);
    } finally { saved.close(); }
    const output = reviewEvidenceUrl("contextual-interaction/"); await mkdir(output, { recursive: true });
    await selectParagraph(2);
    await waitFor(shown);
    await writeFile(new URL(`contextual-bar-${width}.png`, output), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  });
}

test("contextual actions: a result the person did not accept writes nothing; an edited range refuses; leaving the document clears the bar", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, async () => "候选文字");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const child=await pluginFrameBrowser(t,browser,"pages");
  await command("Page.addScriptToEvaluateOnNewDocument",{source:CAPTURE_PLAN},sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  const setup = openPagesStore(homeDirectory);
  const page = (() => { try { return setup.create({ project_id: projectId!, title: "草稿", body: { type: "doc", content: [paragraph(FIRST), paragraph(SECOND)] } }); } finally { setup.close(); } })();
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${page.id}` }, sessionId));
  await child.waitFor(`document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes(${JSON.stringify(SECOND)})`);
  await child.evaluate(`(() => { const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
    const text = editor.querySelectorAll('p')[1].firstChild; const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 10);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange')); })()`);
  await waitFor(`document.querySelectorAll(${JSON.stringify(ACTION)}).length === 3`);
  // “更多” lists every action for this passage regardless of the ranking, grouped by purpose.
  await click(MORE);
  const menu = await evaluate<{ groups: string[]; all: number }>(`(() => { const menu = document.querySelector('.mw-ctx-menu');
    return { groups: [...menu.querySelectorAll('.mw-ctx-menu__label')].map(p => p.textContent), all: menu.querySelectorAll('button[role=menuitem]').length }; })()`);
  assert.ok(menu.groups.includes("全部操作（不依赖推荐）"), menu.groups.join(","));
  assert.ok(menu.all >= 8);
  await evaluate(`[...document.querySelectorAll('.mw-ctx-menu button')].find(button => button.textContent.includes('改得更正式')).dataset.testChoice="true"`);
  await click("[data-test-choice]");
  await child.waitFor("document.querySelector('.pages-pop:not([hidden]) textarea')?.value === '候选文字'");
  // The frozen text is edited before accepting: nothing is written anywhere.
  // The person clicks into the frozen text (the editor takes focus) and types a character there.
  await child.evaluate(`(() => { document.querySelector('[data-pages-editor] .ProseMirror').focus(); const frozen = document.querySelector('.pages-focus-frozen'); const text = frozen.firstChild; const range = document.createRange();
    range.setStart(text, 1); range.setEnd(text, 1); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); })()`);
  await command("Input.insertText", { text: "改" }, sessionId);
  await child.evaluate(`[...document.querySelectorAll('.pages-pop button')].find(button => button.textContent.trim() === '替换').click()`);
  await child.waitFor("document.querySelector('.pages-pop .pages-pop-error')?.textContent.includes('没有写入')");
  assert.equal(await child.evaluate("document.querySelector('[data-pages-editor] .ProseMirror').textContent.includes('候选文字')"), false);
  // Leaving the document: the bar goes away. The pointer goes to the back button first, as a person's does; while it rests
  // on the bar, a lapsing context is kept until it leaves (spec §13.3).
  await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: 40, y: 120 }, sessionId);
  await child.evaluate(`document.querySelector('[data-pages-back]')?.click()`);
  await waitFor("document.querySelector('.mw-ctx').hidden");
  await child.waitFor("!document.querySelector('.pages-pop:not([hidden])')");
});

test("SYS-52 P2: a word is looked up in the search palette; a write goes to the Assistant as a card; a Goal's own text offers Goals actions", { timeout: 150_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, async () => "候选文字");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const child=await pluginFrameBrowser(t,browser,"pages");
  await command("Page.addScriptToEvaluateOnNewDocument",{source:CAPTURE_PLAN},sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  const setup = openPagesStore(homeDirectory);
  const page = (() => { try { return setup.create({ project_id: projectId!, title: "术语表", body: { type: "doc", content: [paragraph("“激活”指新用户在第一周内完成至少一次有价值的操作。"), paragraph(SECOND)] } }); } finally { setup.close(); } })();
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${page.id}` }, sessionId));
  await child.waitFor(`document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes(${JSON.stringify(SECOND)})`);
  await child.evaluate("document.addEventListener('molis:surface-focus', event => window.contextualFocus = event.detail)");
  const select = async (index: number, from: number, to?: number) => {
    await child.evaluate(`(() => { const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
    const text = editor.querySelectorAll('p')[${index}].firstChild; const range = document.createRange(); range.setStart(text, ${from}); range.setEnd(text, ${to === undefined ? "text.length" : to});
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); window.expectedContextText = selection.toString(); document.dispatchEvent(new Event('selectionchange')); })()`);
    await child.waitFor("window.contextualFocus?.targets.map(part => part.text).join('\\n\\n') === window.expectedContextText");
    return child.evaluate<string>("contextualFocus.context_id");
  };

  // A word: looked up across the project, in the workbench's own search palette.
  await select(0, 1, 3);
  await waitFor(`[...document.querySelectorAll(${JSON.stringify(ACTION)})].some(button => button.textContent.includes('在项目里查找'))`, 8000);
  await evaluate(`[...document.querySelectorAll(${JSON.stringify(ACTION)})].find(button => button.textContent.includes('在项目里查找')).click()`);
  await waitFor("document.querySelector('[data-global-search-dialog]')?.open && document.querySelector('[data-global-search]')?.value === '激活'", 8000);
  await evaluate(`document.querySelector('[data-global-search-close]')?.click()`);

  // A write: prepared as a card in an Assistant work, which opens; nothing is written before the person runs it.
  const passageContext = await select(1, 0);
  await waitFor(`window.__contextPlan?.context_id === ${JSON.stringify(passageContext)} && document.querySelector(${JSON.stringify(MORE)})`, 8000);
  await click(MORE);
  // On the bar or under 更多, wherever the rules put it.
  await waitFor(`[...document.querySelectorAll(${JSON.stringify(ACTION + ", .mw-ctx-menu button")})].some(button => button.textContent.startsWith('拆成目标步骤'))`);
  await evaluate(`[...document.querySelectorAll(${JSON.stringify(ACTION + ", .mw-ctx-menu button")})].find(button => button.textContent.startsWith('拆成目标步骤')).dataset.testChoice="true"`);
  await click("[data-test-choice]");
  await waitFor("window.contextPlaced");
  const placed=await evaluate<{status:number;work_id?:string}>("window.contextPlaced");
  assert.equal(placed.status, 200);
  assert.ok(placed.work_id);
  await waitFor("document.querySelector('[data-assistant-panel]') && !document.querySelector('[data-assistant-panel]').hidden && document.querySelector('[data-assistant-work-title]')?.textContent === '拆成目标步骤'", 8000);

  // A Goal's own text: the frame names the Goal, so what is selected in it can become steps under it.
  const goalId = await evaluate<string>(`fetch(document.body.dataset.routePrefix + '/api/board', { headers: molisWorkControlHeaders() }).then(r => r.json()).then(board => board.goals[0].goal.goal_id)`);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=goals&openItem=${encodeURIComponent(goalId)}` }, sessionId));
  await waitFor(`JSON.parse(document.querySelector('[data-goal-frame-surface]')?.getAttribute('data-assistant-context') || '{}').object?.id === ${JSON.stringify(goalId)}`, 10_000);
  await evaluate(`(() => { const frame = document.querySelector('[data-goal-frame-surface]'); const walker = document.createTreeWalker(frame, NodeFilter.SHOW_TEXT);
    let node; while ((node = walker.nextNode())) { if (node.textContent.trim().length > 12 && !node.parentElement.closest('button, input, textarea')) break; }
    window.__goalContextSelection = { node, text: node.textContent };
    const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, node.textContent.length); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange')); })()`);
  try {
    await waitFor(`document.querySelectorAll(${JSON.stringify(ACTION)}).length > 0`, 10_000);
  } catch (error) {
    const diagnostic = await evaluate(`(() => { const chosen = window.__goalContextSelection, selection = getSelection(), frame = document.querySelector('[data-goal-frame-surface]');
      const shape = node => node ? { text: node.textContent, connected: node.isConnected, tag: node.nodeType === 1 ? node.tagName : node.parentElement?.tagName } : null;
      return { chosen: shape(chosen?.node), chosenText: chosen?.text, sameTitleTextNode: chosen?.node === frame?.querySelector('[data-frame-goal-title]')?.firstChild,
        selection: { text: selection?.toString(), anchor: shape(selection?.anchorNode), focus: shape(selection?.focusNode) },
        frame: frame ? { connected: frame.isConnected, hidden: frame.hidden, hiddenAncestor: Boolean(frame.closest('[hidden], [inert]')), rect: frame.getBoundingClientRect().toJSON(), context: frame.getAttribute('data-assistant-context') } : null,
        plan: window.__contextPlan ?? null, toolbar: [...document.querySelectorAll('.mw-ctx')].map(el => ({ hidden: el.hidden, rect: el.getBoundingClientRect().toJSON(), keys: [...el.querySelectorAll('[data-key]')].map(button => button.dataset.key) })) };
    })()`).catch(captureError => ({ captureError: String(captureError) }));
    throw new Error(`Goal context toolbar timed out: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
  await click(MORE);
  await waitFor("[...document.querySelectorAll('.mw-ctx-menu button')].some(button => button.textContent.startsWith('拆成目标步骤'))", 5000);
});

test("contextual actions: a command that cannot run keeps its name on one line and gives the reason beneath it (E-10)", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const child=await pluginFrameBrowser(t,browser,"pages");
  await command("Page.addScriptToEvaluateOnNewDocument",{source:CAPTURE_PLAN},sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  const setup = openPagesStore(homeDirectory);
  const page = (() => { try { return setup.create({ project_id: projectId!, title: "草稿", body: { type: "doc", content: [paragraph(FIRST), paragraph(SECOND)] } }); } finally { setup.close(); } })();
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${page.id}` }, sessionId));
  await child.waitFor(`document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes(${JSON.stringify(SECOND)})`);
  await child.evaluate(`(() => { const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
    const text = editor.querySelectorAll('p')[1].firstChild; const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 10);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange')); })()`);
  await waitFor(`document.querySelectorAll(${JSON.stringify(ACTION)}).length > 0`, 8000);
  await click(MORE);
  await waitFor("document.querySelectorAll('.mw-ctx-menu button[disabled]').length >= 3", 8000);
  const rows = await evaluate<Array<{ label: string; labelHeight: number; lineHeight: number; reasonBelowLabel: boolean }>>(`[...document.querySelectorAll('.mw-ctx-menu button[disabled]')].map(button => {
    const label = button.querySelector('span'), reason = button.querySelector('small'), box = label.getBoundingClientRect();
    return { label: label.textContent, labelHeight: box.height, lineHeight: parseFloat(getComputedStyle(label).lineHeight) || box.height, reasonBelowLabel: reason.getBoundingClientRect().top >= box.bottom - 1 }; })`);
  for (const row of rows) {
    assert.ok(row.labelHeight < row.lineHeight * 1.5, `${row.label} is squeezed onto ${Math.round(row.labelHeight / row.lineHeight)} lines`);
    assert.equal(row.reasonBelowLabel, true, `${row.label}: the reason sits under the name`);
  }
});
