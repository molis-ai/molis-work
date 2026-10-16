import assert from "node:assert/strict";
import test from "node:test";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";

// The context strip above the Assistant's input (specs/context-program §21.2 points 1, 3, 4; decision record §21.5).
const FIRST = "联系阿杰确认秋季发布计划。附上本周方案和预算说明。";
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const STRIP = "[data-assistant-context-strip]:not([hidden])";

async function openNotes(t: test.TestContext) {
  const browser = await openGoalBrowser(t, "user");
  if (!browser) return null;
  const { command, sessionId, navigate, waitFor, origin, projectId, homeDirectory } = browser;
  const model = await issueModel(t, homeDirectory, { replyText: "收到。" });
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  const pages = openPagesStore(homeDirectory);
  const page = (() => { try { return pages.create({ project_id: projectId!, title: "发布笔记", body: { type: "doc", content: [paragraph(FIRST)] } }); } finally { pages.close(); } })();
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${page.id}` }, sessionId));
  await waitFor(`document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes(${JSON.stringify(FIRST)})`);
  const related = () => browser.evaluate<Array<{ work_id: string; relation: string }>>(`fetch(document.body.dataset.routePrefix + '/api/assistant/related?kind=pages_document&id=' + ${JSON.stringify(page.id)}, { headers: molisWorkControlHeaders() }).then(r => r.json()).then(body => body.works)`);
  // What the model was asked, as text: the Host names the object a round is about as 「正在看的对象：…」.
  const asked = (index: number) => JSON.stringify(model.requests[index] ?? null);
  // As a person sends: words typed into the input, then Enter.
  const send = async (words: string) => {
    await browser.evaluate("document.querySelector('[data-assistant-input]').focus()");
    await command("Input.insertText", { text: words }, sessionId);
    for (const type of ["keyDown", "keyUp"]) await command("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  };
  return { ...browser, model, page, related, asked, send };
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
  await evaluate(`(() => {
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

test("STRIP-03: more chips than fit scroll sideways: the side with more fades, the last chip is reached by keyboard and by the wheel", { timeout: 120_000 }, async t => {
  const b = await openNotes(t);
  if (!b) return;
  const { command, sessionId, evaluate, waitFor } = b;
  const ROW = "[data-assistant-context-strip]:not([hidden]) .assistant-strip-row";
  const materials = Array.from({ length: 7 }, (_, index) => ({ title: `会议纪要第 ${index + 1} 份：秋季发布`, text: `要点 ${index + 1}` }));
  await evaluate(`document.dispatchEvent(new CustomEvent('molis:assistant-open', { detail: { new: true, materials: ${JSON.stringify(materials)} } }))`);
  for (const [width, height, mobile] of [[1440, 950, false], [390, 844, true]] as const) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile }, sessionId);
    await evaluate("document.querySelector('[data-assistant-input]').focus()");
    await evaluate(`(() => { const row = document.querySelector(${JSON.stringify(ROW)}); if (row) row.scrollLeft = 0; })()`);
    await waitFor(`document.querySelector(${JSON.stringify(ROW)})?.dataset.more === 'end'`, 10_000);
    // The cue is drawn: the row fades out on the side that has more.
    assert.notEqual(await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(ROW)})).maskImage`), "none", `${width}: the side with more fades out`);
    // The keyboard reaches the last chip: it scrolls into view, inside the row's box.
    await evaluate(`[...document.querySelectorAll(${JSON.stringify(ROW + " .assistant-strip-act")})].at(-1).focus()`);
    await waitFor(`(() => { const row = document.querySelector(${JSON.stringify(ROW)}), last = [...row.querySelectorAll('[data-strip-key]')].at(-1);
      const r = row.getBoundingClientRect(), box = last.getBoundingClientRect(); return box.left >= r.left - 1 && box.right <= r.right + 1 && row.dataset.more === 'start'; })()`, 10_000);
    // The wheel scrolls the row sideways, back towards the start.
    const box = await evaluate<{ x: number; y: number }>(`(() => { const r = document.querySelector(${JSON.stringify(ROW)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const before = await evaluate<number>(`document.querySelector(${JSON.stringify(ROW)}).scrollLeft`);
    await command("Input.dispatchMouseEvent", { type: "mouseWheel", x: box.x, y: box.y, deltaX: 0, deltaY: -200 }, sessionId);
    await waitFor(`document.querySelector(${JSON.stringify(ROW)}).scrollLeft < ${before} - 50`, 5000);
  }
});
