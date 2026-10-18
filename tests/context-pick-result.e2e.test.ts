import assert from "node:assert/strict";
import test from "node:test";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";

// W3-A3b (specs/context-program §21.2 item 6; 统筹 10-17): a result the work made is picked up from its card in the Assistant's
// panel, by keyboard as by click, and is then in hand: the bar beside it offers to put it on the left. Hovering or focusing
// that offer flashes the landing in the Pages document once (not again while it shows; nothing for a landing that is gone);
// choosing it previews there and writes only when confirmed.
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const editorText = "(document.querySelector('[data-pages-editor] .ProseMirror')?.textContent ?? '')";
const CARD = "[data-assistant-block='results'] .assistant-item[role='group']";
const ATTACH = ".mw-ctx:not(.mw-ctx--static):not([hidden]) [data-key^='attach.']";
const INSERT = `[...document.querySelectorAll(${JSON.stringify(ATTACH)})].find((node) => node.textContent.includes('插入到光标处'))`;

test("W3-A3b PICK-01, PICK-05, FLASH-01, FLASH-02, FLASH-03: a result picked up from its card goes to the cursor on the left; hovering the offer flashes the landing once", { timeout: 150_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const store = openPagesStore(homeDirectory);
  const left = store.create({ project_id: projectId!, title: "发布计划", body: { type: "doc", content: [paragraph("先完成核心体验。"), paragraph("再安排发布。")] } });
  const made = store.create({ project_id: projectId!, title: "访谈纪要", body: { type: "doc", content: [paragraph("离线也要能记下想法。")] } });
  store.close();
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  // What the page reports, and every flash asked for and every flash line Pages draws.
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `document.addEventListener('molis:surface-landing', (event) => { window.lastLanding = event.detail; });
    document.addEventListener('molis:surface-focus', (event) => { window.lastFocus = event.detail; });
    window.flashAsked = 0; window.flashLines = 0;
    document.addEventListener('molis:surface-landing-flash', () => { window.flashAsked += 1; }, true);
    new MutationObserver((records) => { for (const record of records) for (const node of record.addedNodes) if (node.classList?.contains('pages-landing-flash')) window.flashLines += 1; })
      .observe(document, { childList: true, subtree: true });` }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${left.id}` }, sessionId));
  await waitFor("document.querySelector('[data-pages-title]')?.value === '发布计划'");

  // A work, and the document it made handed back to it as its result.
  await issueModel(t, homeDirectory, { replyText: "整理好了，写在「访谈纪要」里。" });
  // UIV-02: Enter edits the multiline draft; Ctrl+Enter submits it. Card Enter below still picks up the card.
  await click("[data-assistant-input]");
  await command("Input.insertText", { text: "把访谈整理成纪要" }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", modifiers: 2, windowsVirtualKeyCode: 13 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", modifiers: 2, windowsVirtualKeyCode: 13 }, sessionId);
  await waitFor("document.querySelector('.assistant-msg--assistant')?.textContent.includes('访谈纪要')", 20_000);
  const api = `/projects/${projectId}/api/assistant/works`;
  const workId = await evaluate<string>(`fetch(${JSON.stringify(api)}).then((r) => r.json()).then((body) => body.works[0].work_id)`);
  const handed = await evaluate<number>(`fetch(${JSON.stringify(api)} + '/' + ${JSON.stringify(workId)} + '/results', { method: 'POST', headers: { 'content-type': 'application/json', 'x-molis-work-control-token': document.querySelector('meta[name=molis-work-control-token]').content,
      'x-molis-work-idempotency-key': 'w3a3b-hand-result' },
    body: JSON.stringify({ object: { kind: 'pages_document', id: ${JSON.stringify(made.id)} }, source: { title: 'Pages' } }) }).then((r) => r.status)`);
  assert.equal(handed, 200);
  await evaluate(`document.dispatchEvent(new CustomEvent('molis:assistant-open', { detail: { work_id: ${JSON.stringify(workId)} } }))`);
  await waitFor(`document.querySelector(${JSON.stringify(CARD)})?.checkVisibility() === true`, 15_000);
  assert.equal(await evaluate<string>(`document.querySelector(${JSON.stringify(CARD)}).getAttribute('aria-label')`), "拿起：访谈纪要");

  // The cursor in the document on the left is where it would go.
  await evaluate(`(() => {
    const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
    const text = [...editor.querySelectorAll('p')].find((node) => node.textContent === '先完成核心体验。').firstChild;
    const range = document.createRange(); range.setStart(text, 3); range.collapse(true);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  })()`);
  await waitFor("window.lastLanding?.position === 'cursor'");

  // PICK-01 by keyboard: the card takes focus, Enter picks it, Esc puts it down.
  const key = async (name: string, code: string, keyCode: number) => {
    for (const type of ["keyDown", "keyUp"]) await command("Input.dispatchKeyEvent", { type, key: name, code, windowsVirtualKeyCode: keyCode }, sessionId);
  };
  await evaluate(`document.querySelector(${JSON.stringify(CARD)}).focus()`);
  await key("Enter", "Enter", 13);
  await waitFor(`window.lastFocus?.object?.id === ${JSON.stringify(made.id)}`);
  assert.equal(await evaluate<string>("window.lastFocus.granularity"), "object");
  assert.equal(await evaluate<string>(`document.querySelector(${JSON.stringify(CARD)}).getAttribute('aria-current')`), "true");
  await key("Escape", "Escape", 27);
  await waitFor("window.lastFocus === null");
  assert.equal(await evaluate<boolean>("document.querySelector('[data-assistant-panel]').hidden"), false, "Esc put the card down and left the panel open");

  // PICK-01 by click, on the card but not its title: in hand again, and the bar beside it offers to put it at the cursor.
  const at = await evaluate<{ x: number; y: number }>(`(() => { const box = document.querySelector(${JSON.stringify(CARD)} + ' .assistant-glyph').getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; })()`);
  for (const type of ["mousePressed", "mouseReleased"]) await command("Input.dispatchMouseEvent", { type, x: at.x, y: at.y, button: "left", clickCount: 1 }, sessionId);
  await waitFor(`window.lastFocus?.object?.id === ${JSON.stringify(made.id)}`);
  assert.equal(await evaluate<string>("document.querySelector('[data-pages-title]').value"), "发布计划", "the card picked it up; only its title opens it");
  await waitFor(`Boolean(${INSERT})`, 15_000);

  // FLASH-01: hovering the offer flashes the landing once; out and in again while it shows asks again but draws no second line.
  const hover = async (inside: boolean) => {
    const point = inside ? await evaluate<{ x: number; y: number }>(`(() => { const box = ${INSERT}.getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; })()`) : { x: 1300, y: 900 };
    await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y }, sessionId);
  };
  await hover(true);
  await waitFor("window.flashAsked === 1 && window.flashLines === 1");
  await waitFor("document.querySelector('.pages-landing-flash')?.style.height !== ''");
  await hover(false); await hover(true);
  await waitFor("window.flashAsked === 2");
  assert.equal(await evaluate<number>("window.flashLines"), 1, "not again while it shows");
  await waitFor("document.querySelector('.pages-landing-flash') === null", 5_000);
  await hover(false); await hover(true);
  await waitFor("window.flashLines === 2", 5_000);
  // Off the offer onto the bar between its buttons, and back: a new entry, so it flashes again.
  await waitFor("document.querySelector('.pages-landing-flash') === null", 5_000);
  const gap = await evaluate<{ x: number; y: number }>(`(() => { const bar = ${INSERT}.closest('.mw-ctx'), box = bar.getBoundingClientRect();
    for (let y = box.top + 1; y < box.bottom; y += 2) for (let x = box.left + 1; x < box.right; x += 2) {
      const at = document.elementFromPoint(x, y); if (at && bar.contains(at) && !at.closest('[data-key]')) return { x, y }; }
    return null; })()`);
  assert.ok(gap, "the bar has room between its buttons");
  await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: gap.x, y: gap.y }, sessionId);
  await hover(true);
  await waitFor("window.flashLines === 3", 5_000);
  // Focus on the offer flashes it as hover does.
  await hover(false);
  await waitFor("document.querySelector('.pages-landing-flash') === null", 5_000);
  const lines = await evaluate<number>("window.flashLines");
  await evaluate(`${INSERT}.focus()`);
  await waitFor(`window.flashLines === ${lines + 1}`, 5_000);

  // FLASH-02: a landing that went away is not asked: no event, no error.
  await waitFor("document.querySelector('.pages-landing-flash') === null", 5_000);
  await hover(false);
  await evaluate(`(() => { const gone = document.createElement('div'); document.body.append(gone);
    gone.dispatchEvent(new CustomEvent('molis:surface-landing', { bubbles: true, detail: { ...window.lastLanding } })); gone.remove(); window.flashGoneFrom = window.flashAsked; window.flashGoneAt = window.lastLanding.targets[0].anchor; })()`);
  await hover(true);
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(await evaluate<number>("window.flashAsked - window.flashGoneFrom"), 0, "nothing asked of a landing that is gone");
  // Keep the real next judgment response in flight while Esc dismisses the rules' offer.
  // A late result must not undo the person's dismissal (PICK-05); no request or response is fabricated.
  await evaluate(`(() => { const fetch = window.fetch; window.fetch = async (...args) => {
    const response = await fetch(...args);
    if (String(args[0]).includes('/api/contextual/judge') && !window.releasePickJudgment) {
      await new Promise((resolve) => { window.releasePickJudgment = resolve; });
    }
    return response;
  }; })()`);
  // FLASH-03: the person moves the cursor, so the page reports its landing again; choosing the offer previews the result's name there.
  await evaluate(`(() => { const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
    const text = [...editor.querySelectorAll('p')].find((node) => node.textContent === '先完成核心体验。').firstChild;
    const range = document.createRange(); range.setStart(text, 2); range.collapse(true); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); })()`);
  await waitFor("window.lastLanding?.position === 'cursor' && window.lastLanding.targets[0].anchor !== window.flashGoneAt");
  await evaluate(`document.querySelector(${JSON.stringify(CARD)}).focus()`);
  await key("Enter", "Enter", 13);
  await waitFor(`Boolean(${INSERT})`, 15_000);
  // PICK-05: Esc on the bar puts the bar away, not the card; picking the card again brings the bar back.
  await waitFor("typeof window.releasePickJudgment === 'function'", 10_000);
  await evaluate(`${INSERT}.focus()`);
  await key("Escape", "Escape", 27);
  await waitFor(`!${INSERT}`, 5_000);
  assert.equal(await evaluate<string>(`document.querySelector(${JSON.stringify(CARD)}).getAttribute('aria-current')`), "true", "still in hand");
  await evaluate(`window.releasePickJudgment()`);
  await evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  assert.equal(await evaluate<boolean>(`Boolean(${INSERT})`), false, "a judgment arriving after Esc must not show the dismissed offer again");
  await evaluate(`document.querySelector(${JSON.stringify(CARD)}).focus()`);
  await key("Enter", "Enter", 13);
  await waitFor(`Boolean(${INSERT})`, 15_000);
  await evaluate(`${INSERT}.click()`);
  await waitFor("document.querySelector('.pages-landing-preview')?.textContent === '访谈纪要'", 10_000);
  assert.equal(await evaluate<string>(editorText), "先完成核心体验。再安排发布。", "nothing is written before the person confirms");
  // A visible preview must also be above the Assistant panel; DOM click alone can hit a covered control.
  const confirm = await evaluate<{ x: number; y: number; exposed: boolean }>(`(() => {
    const button = [...document.querySelectorAll('.pages-pop .mw-btn--primary')].find(node => node.textContent === '放进去');
    const box = button.getBoundingClientRect(), x = box.left + box.width / 2, y = box.top + box.height / 2;
    return { x, y, exposed: button.contains(document.elementFromPoint(x, y)) };
  })()`);
  assert.equal(confirm.exposed, true, "the insertion preview can be seen and clicked above the Assistant panel");
  for (const type of ["mousePressed", "mouseReleased"]) await command("Input.dispatchMouseEvent", { type, x: confirm.x, y: confirm.y, button: "left", clickCount: 1 }, sessionId);
  await waitFor(`${editorText} === '先完访谈纪要成核心体验。再安排发布。'`, 10_000);
});
