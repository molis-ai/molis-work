import assert from "node:assert/strict";
import test from "node:test";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages/testing";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";

// The context strip above the Assistant's input (specs/context-program §21.2 points 1, 3, 4; decision record §21.5).
const FIRST = "联系阿杰确认秋季发布计划。附上本周方案和预算说明。";
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const heading = (text: string) => ({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text }] });
const STRIP = "[data-assistant-context-strip]:not([hidden])";

async function openNotes(t: test.TestContext, content: object[] = [paragraph(FIRST)], ready = FIRST) {
  const browser = await openGoalBrowser(t, "user");
  if (!browser) return null;
  const child = await pluginFrameBrowser(t, browser, "pages");
  const { command, sessionId, navigate, waitFor, origin, projectId, homeDirectory } = browser;
  const model = await issueModel(t, homeDirectory, { replyText: "收到。" });
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  const pages = openPagesStore(homeDirectory);
  const page = (() => { try { return pages.create({ project_id: projectId!, title: "发布笔记", body: { type: "doc", content } }); } finally { pages.close(); } })();
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${page.id}` }, sessionId));
  await child.waitFor(`document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes(${JSON.stringify(ready)})`);
  const related = () => browser.evaluate<Array<{ work_id: string; relation: string }>>(`fetch(document.body.dataset.routePrefix + '/api/assistant/related?kind=pages_document&id=' + ${JSON.stringify(page.id)}, { headers: molisWorkControlHeaders() }).then(r => r.json()).then(body => body.works)`);
  // What the model was asked, as text: the Host names the object a round is about as 「正在看的对象：…」.
  const asked = (index: number) => JSON.stringify(model.requests[index] ?? null);
  // As a person sends: words typed into the input, then Enter.
  const send = async (words: string) => {
    await browser.evaluate("document.querySelector('[data-assistant-input]').focus()");
    await command("Input.insertText", { text: words }, sessionId);
    for (const type of ["keyDown", "keyUp"]) await command("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  };
  return { ...browser, child, model, page, related, asked, send };
}

test("STRIP-01: the object on show goes with a Send only once added with +: then the model sees it and the work is linked under it, otherwise neither", { timeout: 120_000 }, async t => {
  const b = await openNotes(t);
  if (!b) return;
  const { evaluate, waitFor, model, related, asked, send } = b;

  // On show but not added: a dashed chip that says so, and no starting points pop up over the input (§21.2 point 3).
  await evaluate("document.querySelector('[data-assistant-input]').focus()");
  await waitFor(`document.querySelector(${JSON.stringify(STRIP + " .is-optional")})?.textContent === '正在看：发布笔记没加入+'`, 10_000);
  assert.equal(await evaluate("document.querySelector('[data-assistant-starters]').hidden"), true, "focusing the input opens no popover of starting points");
  await send("总结一下");
  for (let tries = 0; tries < 100 && !model.requests.length; tries++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(model.requests.length >= 1, "the round reached the model");
  assert.equal(asked(0).includes("正在看的对象：发布笔记"), false, "not added: the model is not told about the object on show");
  assert.deepEqual(await related(), [], "not added: no work is linked under it");

  // A new work, and the person adds the object with +: the chip is solid, the model is told, the work is linked under it.
  await evaluate("document.dispatchEvent(new CustomEvent('molis:assistant-open', { detail: { new: true } }))");
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(STRIP + " .is-optional .assistant-strip-act")}))`, 10_000);
  await evaluate(`document.querySelector(${JSON.stringify(STRIP + " .is-optional .assistant-strip-act")}).click()`);
  await waitFor(`!document.querySelector(${JSON.stringify(STRIP + " .is-optional")}) && document.querySelector(${JSON.stringify(STRIP)})?.textContent.includes('正在看：发布笔记')`);
  const before = model.requests.length;
  await send("再总结一次");
  for (let tries = 0; tries < 150 && model.requests.length <= before; tries++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(asked(before).includes("正在看的对象：发布笔记"), "added: the model is told which object the round is about");
  for (let tries = 0; tries < 50 && !(await related()).length; tries++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.deepEqual((await related()).map(work => work.relation), ["origin"], "added: the new work is linked under the object it started from");
});

test("STRIP-02: ✦助理 puts what is in hand in the strip with the object it is from, writes no words, and the Send carries it", { timeout: 120_000 }, async t => {
  const b = await openNotes(t);
  if (!b) return;
  const { evaluate, waitFor, click, model, related, asked, send } = b;
  await b.child.evaluate(`(() => {
    const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
    const range = document.createRange(); range.selectNodeContents(editor.querySelector('p').firstChild);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange'));
  })()`);
  const ask = ".mw-ctx:not(.mw-ctx--static):not([hidden]):not([data-away]) [data-assistant]";
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(ask)}))`, 8000);
  await click(ask);
  await waitFor(`(document.querySelector(${JSON.stringify(STRIP)})?.textContent || '').includes('选中的内容 · 发布笔记') && document.activeElement?.matches('[data-assistant-input]')`, 10_000);
  assert.equal(await evaluate("document.querySelector('[data-assistant-input]').value"), "", "no words are written for the person");
  assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(STRIP + " .is-optional")}))`), false, "the document the passage is from is not offered again: it comes with the passage");
  await send("这段怎么改更清楚");
  for (let tries = 0; tries < 150 && !model.requests.length; tries++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(asked(0).includes(FIRST), "the model reads the passage that was in hand");
  for (let tries = 0; tries < 50 && !(await related()).length; tries++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.deepEqual((await related()).map(work => work.relation), ["material"], "and the work is linked under the document the passage came from");
});

/** Where keyboard focus is, and what the browser's own tab order says is around it (STRIP-03, QA-016). */
interface Stop {
  index: number; total: number; positive: boolean; isInput: boolean; inStrip: boolean; label: string; focusVisible: boolean; ring: boolean;
  rowFirst: number; rowLast: number; rowCount: number; chipIndex: number; chips: number; more: string | null;
  row: { left: number; right: number }; button: { left: number; right: number }; chip: { left: number; right: number } | null;
}

test("STRIP-03, QA-016: more chips than fit scroll sideways: the side with more fades, Shift+Tab / Tab walk every chip from the input to the last and back with a visible focus ring, and the wheel scrolls the row", { timeout: 180_000 }, async t => {
  const b = await openNotes(t);
  if (!b) return;
  const { command, sessionId, evaluate, waitFor } = b;
  const ROW = "[data-assistant-context-strip]:not([hidden]) .assistant-strip-row";
  // The tab order as the browser walks it: enabled, not tabindex=-1, not hidden, in document order (nothing on the page may use a positive tabindex).
  // It is read from the live page before every press, so the expected next stop never comes from the strip's own code.
  const STOP = `(() => {
    const row = document.querySelector(${JSON.stringify(ROW)}), active = document.activeElement;
    const order = [...document.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
      .filter(node => !node.disabled && node.tabIndex >= 0 && !node.closest('[hidden], [inert]') && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden');
    const inRow = order.map((node, index) => row.contains(node) ? index : -1).filter(index => index >= 0);
    const box = node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right }; };
    const chip = active.closest('[data-strip-key]'), chips = [...row.querySelectorAll('[data-strip-key]')], style = getComputedStyle(active);
    return {
      index: order.indexOf(active), total: order.length, positive: order.some(node => node.tabIndex > 0),
      isInput: active.matches('[data-assistant-input]'), inStrip: row.contains(active),
      label: active.getAttribute('aria-label') || active.textContent.trim() || active.tagName,
      focusVisible: active.matches(':focus-visible'), ring: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
      rowFirst: inRow[0], rowLast: inRow.at(-1), rowCount: inRow.length, chipIndex: chips.indexOf(chip), chips: chips.length, more: row.dataset.more ?? null,
      row: box(row), button: box(active), chip: chip ? box(chip) : null,
    };
  })()`;
  const stop = () => evaluate<Stop>(STOP);
  // A real Tab (or Shift+Tab: modifier 8) key press at the page, as a person presses it; nothing is focused by script from here on.
  const press = async (shift: boolean) => {
    for (const type of ["keyDown", "keyUp"]) await command("Input.dispatchKeyEvent", { type, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, ...(shift ? { modifiers: 8 } : {}) }, sessionId);
  };
  const materials = Array.from({ length: 7 }, (_, index) => ({ title: `会议纪要第 ${index + 1} 份：秋季发布`, text: `要点 ${index + 1}` }));
  await evaluate(`document.dispatchEvent(new CustomEvent('molis:assistant-open', { detail: { new: true, materials: ${JSON.stringify(materials)} } }))`);
  for (const [width, height, mobile] of [[1440, 950, false], [390, 844, true]] as const) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile }, sessionId);
    // The starting point is where a person types: the Assistant's input.
    await evaluate("document.querySelector('[data-assistant-input]').focus()");
    await evaluate(`(() => { const row = document.querySelector(${JSON.stringify(ROW)}); if (row) row.scrollLeft = 0; })()`);
    await waitFor(`document.querySelector(${JSON.stringify(ROW)})?.dataset.more === 'end'`, 10_000);
    // The cue is drawn: the row fades out on the side that has more.
    assert.notEqual(await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(ROW)})).maskImage`), "none", `${width}: the side with more fades out`);

    // The focus ring is drawn on the focused control and the control is inside the row's box (not scrolled out of sight).
    const shown = (at: Stop, what: string) => {
      assert.equal(at.inStrip, true, `${width}: ${what} is in the strip (${at.label})`);
      assert.equal(at.focusVisible, true, `${width}: ${what} matches :focus-visible (${at.label})`);
      assert.equal(at.ring, true, `${width}: ${what} draws a focus ring (${at.label})`);
      assert.ok(at.button.left >= at.row.left - 1 && at.button.right <= at.row.right + 1, `${width}: ${what} is inside the row's box (${at.label})`);
    };
    const step = async (shift: boolean, from: Stop, what: string) => {
      await press(shift);
      const now = await stop();
      assert.equal(now.index, from.index + (shift ? -1 : 1), `${width}: ${what}: ${shift ? "Shift+Tab" : "Tab"} goes to the next control in the tab order and skips none (from ${from.label} to ${now.label})`);
      return now;
    };

    // From the input, Shift+Tab walks back, one control at a time, to the last chip (the strip is drawn before the input).
    let at = await stop();
    assert.equal(at.isInput, true, `${width}: the walk starts in the input`);
    assert.equal(at.positive, false, `${width}: no positive tabindex, so the document order is the tab order`);
    assert.ok(at.rowCount >= 3, `${width}: several chips with a button each (${at.rowCount})`);
    assert.ok(at.rowLast < at.index, `${width}: the strip's buttons come before the input in the tab order`);
    const { rowFirst, rowLast, rowCount } = at, bound = at.index - rowLast;
    for (let presses = 0; !at.inStrip; presses++) {
      assert.ok(presses < bound, `${width}: the last chip is reached within ${bound} presses (the controls between it and the input)`);
      at = await step(true, at, "from the input");
    }
    assert.equal(at.index, rowLast, `${width}: the first stop in the strip is the last chip's button`);
    assert.equal(at.chipIndex, at.chips - 1, `${width}: and that button belongs to the last chip`);
    // The last chip scrolled fully into view, inside the row's box, and the row is at its end.
    await waitFor(`(() => { const row = document.querySelector(${JSON.stringify(ROW)}), last = [...row.querySelectorAll('[data-strip-key]')].at(-1);
      const r = row.getBoundingClientRect(), box = last.getBoundingClientRect(); return last.contains(document.activeElement) && box.left >= r.left - 1 && box.right <= r.right + 1 && row.dataset.more === 'start'; })()`, 10_000);
    at = await stop();
    shown(at, "the last chip");
    assert.ok(at.chip && at.chip.left >= at.row.left - 1 && at.chip.right <= at.row.right + 1, `${width}: the whole last chip is inside the row's box`);
    assert.equal(at.more, "start", `${width}: nothing more to the right once the last chip is reached`);

    // On back through every chip's button to the first, then forward again to the last: each Tab lands on the next one.
    let visited = 1;
    while (at.index > rowFirst) { at = await step(true, at, "back through the strip"); shown(at, "a chip on the way back"); visited++; }
    assert.equal(at.chipIndex, 0, `${width}: Shift+Tab reached the first chip`);
    assert.equal(visited, rowCount, `${width}: every button in the strip had its turn on the way back`);
    while (at.index < rowLast) { at = await step(false, at, "forward through the strip"); shown(at, "a chip on the way forward"); visited++; }
    assert.equal(visited, rowCount * 2 - 1, `${width}: and every one on the way forward`);
    assert.equal(at.chipIndex, at.chips - 1, `${width}: Tab reached the last chip again`);
    await waitFor(`(() => { const row = document.querySelector(${JSON.stringify(ROW)}), last = [...row.querySelectorAll('[data-strip-key]')].at(-1);
      const r = row.getBoundingClientRect(), box = last.getBoundingClientRect(); return last.contains(document.activeElement) && box.left >= r.left - 1 && box.right <= r.right + 1 && row.dataset.more === 'start'; })()`, 10_000);
    // The wheel scrolls the row sideways, back towards the start.
    const box = await evaluate<{ x: number; y: number }>(`(() => { const r = document.querySelector(${JSON.stringify(ROW)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const before = await evaluate<number>(`document.querySelector(${JSON.stringify(ROW)}).scrollLeft`);
    await command("Input.dispatchMouseEvent", { type: "mouseWheel", x: box.x, y: box.y, deltaX: 0, deltaY: -200 }, sessionId);
    await waitFor(`document.querySelector(${JSON.stringify(ROW)}).scrollLeft < ${before} - 50`, 5000);
  }
});

// A document with a heading, and the caret in it after 「第二步，」: that place is the landing Pages reports.
const STEPS = [heading("步骤"), paragraph("第一步，整理访谈记录。"), paragraph("第二步，写出离线记录的方案。")];
const caretAfterSecond = `(() => {
  const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
  const text = [...editor.querySelectorAll('p')].find(node => node.textContent.startsWith('第二步')).firstChild;
  const range = document.createRange(); range.setStart(text, 4); range.collapse(true);
  const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange'));
})()`;
const LANDING = STRIP + " .is-landing";

test("STRIP-04: the landing is on the strip only while its object goes with the Send; × leaves out the landing and keeps the object", { timeout: 120_000 }, async t => {
  const b = await openNotes(t, STEPS, "第二步");
  if (!b) return;
  const { evaluate, waitFor, model, asked, send } = b;
  await b.child.evaluate(caretAfterSecond);
  await evaluate("document.querySelector('[data-assistant-input]').focus()");
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(STRIP + " .is-optional")}))`, 10_000);
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(LANDING)}))`), false, "the object is not added: no landing either (§21.5 L-1)");

  await evaluate(`document.querySelector(${JSON.stringify(STRIP + " .is-optional .assistant-strip-act")}).click()`);
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(LANDING)}))`, 10_000);
  // Named by the heading above the place and the place, never by counting paragraphs (L-3); a screen reader hears the sentence.
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(LANDING + " .assistant-strip-label")}).textContent`), "发布笔记 · 「步骤」光标处");
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(LANDING + " .mw-sr-only")}).textContent`), "放进去的位置：发布笔记，「步骤」，光标处（「…第二步，」之后）");

  await evaluate(`document.querySelector(${JSON.stringify(LANDING + " .assistant-strip-act")}).click()`);
  await waitFor(`!document.querySelector(${JSON.stringify(LANDING)}) && document.querySelector(${JSON.stringify(STRIP)})?.textContent.includes('正在看：发布笔记')`, 10_000);
  assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(STRIP + " .is-optional")}))`), false, "× on the landing leaves the object added");
  await send("接着写");
  for (let tries = 0; tries < 150 && !model.requests.length; tries++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(asked(0).includes("正在看的对象：发布笔记"), "the object still goes with the Send");
  assert.equal(asked(0).includes("左边可以放进去的位置"), false, "the landing left out with × is not told");
});

test("STRIP-05: a round is told the landing once its owner reads the object again, as facts; not read, nothing is told", { timeout: 120_000 }, async t => {
  const b = await openNotes(t, STEPS, "第二步");
  if (!b) return;
  const { evaluate, waitFor, model, asked, send, page, homeDirectory, projectId } = b;
  await b.child.evaluate(caretAfterSecond);
  await evaluate("document.querySelector('[data-assistant-input]').focus()");
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(STRIP + " .is-optional .assistant-strip-act")}))`, 10_000);
  await evaluate(`document.querySelector(${JSON.stringify(STRIP + " .is-optional .assistant-strip-act")}).click()`);
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(LANDING)}))`, 10_000);
  await send("接着写");
  for (let tries = 0; tries < 150 && !model.requests.length; tries++) await new Promise(resolve => setTimeout(resolve, 100));
  for (const fact of ["左边可以放进去的位置", "对象：发布笔记", "「步骤」下，光标处", "位置之前的原文", "第二步，", "位置之后的原文", "写出离线记录的方案"]) assert.ok(asked(0).includes(fact), `the round is told ${fact}`);

  // The document is gone from its owner: the page still reports the landing, the Host reads nothing and tells nothing.
  const pages = openPagesStore(homeDirectory);
  try { pages.delete(page.id, projectId!); } finally { pages.close(); }
  await evaluate("document.dispatchEvent(new CustomEvent('molis:assistant-open', { detail: { new: true } }))");
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(STRIP + " .is-optional .assistant-strip-act")}))`, 10_000);
  await evaluate(`document.querySelector(${JSON.stringify(STRIP + " .is-optional .assistant-strip-act")}).click()`);
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(LANDING)}))`, 10_000);
  await send("再写一段");
  const second = () => model.requests.map(request => JSON.stringify(request)).find(text => text.includes("再写一段"));
  for (let tries = 0; tries < 150 && !second(); tries++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(second(), "the round reached the model");
  assert.equal(second()!.includes("左边可以放进去的位置"), false, "an object its owner cannot read is not told as a landing");
});

test("CTX-COVER-01: the selection toolbar waits while the Assistant's panel covers the passage and comes back when it closes, at 390 and at 1440", { timeout: 180_000 }, async t => {
  const b = await openNotes(t);
  if (!b) return;
  const { command, sessionId, evaluate, waitFor, send } = b;
  const BAR = ".mw-ctx:not(.mw-ctx--static):not([hidden])";
  for (const [width, height, mobile] of [[390, 844, true], [1440, 950, false]] as const) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile }, sessionId);
    await b.child.evaluate(`(() => {
      const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
      const range = document.createRange(); range.selectNodeContents(editor.querySelector('p').firstChild);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange'));
    })()`);
    await waitFor(`Boolean(document.querySelector(${JSON.stringify(BAR)}))`, 10_000);
    const box = await b.child.evaluate<{x:number;y:number}>("(() => {const box=document.querySelector('[data-pages-editor] .ProseMirror p').getBoundingClientRect();return {x:box.x+box.width/2,y:box.y+box.height/2}})()");
    const passage = await evaluate<{x:number;y:number}>(`(() => {const frame=document.querySelector('iframe[data-plugin-frame=pages]').getBoundingClientRect();return {x:frame.x+${box.x},y:frame.y+${box.y}}})()`);
    await send("看看这段");
    await waitFor("!document.querySelector('[data-assistant-panel]').hidden", 10_000);
    const covered = await evaluate<boolean>(`Boolean(document.elementFromPoint(${passage.x}, ${passage.y})?.closest('[data-assistant-panel]'))`);
    if (width < 600) assert.ok(covered, "a phone's panel covers the page");
    await new Promise(resolve => setTimeout(resolve, 600));
    if (covered) assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(BAR)}))`), false, `${width}: no toolbar floats over the panel for a passage under it`);
    else assert.equal(await evaluate(`Boolean(document.querySelector(${JSON.stringify(BAR)}))`), true, `${width}: a passage the panel leaves in sight keeps its toolbar`);
    await evaluate("document.querySelector('[data-assistant-panel-close]').click()");
    await waitFor(`Boolean(document.querySelector(${JSON.stringify(BAR)}))`, 10_000);
  }
});
