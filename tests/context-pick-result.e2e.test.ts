import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test from "node:test";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages/testing";
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
  const child=await pluginFrameBrowser(t,browser,"pages");
  const store = openPagesStore(homeDirectory);
  const left = store.create({ project_id: projectId!, title: "发布计划", body: { type: "doc", content: [paragraph("先完成核心体验。"), paragraph("再安排发布。")] } });
  const made = store.create({ project_id: projectId!, title: "访谈纪要", body: { type: "doc", content: [paragraph("离线也要能记下想法。")] } });
  store.close();
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  // What the page reports, and every flash asked for and every flash line Pages draws.
  await pluginFrameInitScript(t, browser, `document.addEventListener('molis:surface-landing', (event) => { window.lastLanding = event.detail; });
    document.addEventListener('molis:surface-focus', (event) => { window.lastFocus = event.detail; });
    window.flashAsked = 0; window.flashLines = 0;
    // A judgment held back until the test lets it go, and how many came back (PICK-05).
    window.judged = 0; const realFetch = window.fetch;
    window.fetch = async (...args) => { const judge = window.holdJudge && String(args[0]?.url || args[0]).includes('/api/contextual/judge');
      while (judge && window.holdJudge) await new Promise((resolve) => setTimeout(resolve, 20));
      try { return await realFetch.apply(window, args); } finally { if (judge) window.judged += 1; } };
    document.addEventListener('molis:surface-landing-flash', () => { window.flashAsked += 1; }, true);
    new MutationObserver((records) => { for (const record of records) for (const node of record.addedNodes) if (node.classList?.contains('pages-landing-flash')) window.flashLines += 1; })
      .observe(document, { childList: true, subtree: true });`);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${left.id}` }, sessionId));
  await child.waitFor("document.querySelector('[data-pages-title]')?.value === '发布计划'");

  // A work, and the document it made handed back to it as its result.
  await issueModel(t, homeDirectory, { replyText: "整理好了，写在「访谈纪要」里。" });
  await click("[data-assistant-input]");
  await command("Input.insertText", { text: "把访谈整理成纪要" }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
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
  await child.evaluate(`(() => {
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
  assert.equal(await child.evaluate<string>("document.querySelector('[data-pages-title]').value"), "发布计划", "the card picked it up; only its title opens it");
  await waitFor(`Boolean(${INSERT})`, 15_000);

  // FLASH-01: hovering the offer flashes the landing once; out and in again while it shows asks again but draws no second line.
  const hover = async (inside: boolean) => {
    const point = inside ? await evaluate<{ x: number; y: number }>(`(() => { const box = ${INSERT}.getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; })()`) : { x: 1300, y: 900 };
    await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y }, sessionId);
  };
  await hover(true);
  await waitFor("window.flashAsked === 1");
  await child.waitFor("window.flashLines === 1");
  await child.waitFor("document.querySelector('.pages-landing-flash')?.style.height !== ''");
  await hover(false); await hover(true);
  await waitFor("window.flashAsked === 2");
  assert.equal(await child.evaluate<number>("window.flashLines"), 1, "not again while it shows");
  await child.waitFor("document.querySelector('.pages-landing-flash') === null", 5_000);
  await hover(false); await hover(true);
  await child.waitFor("window.flashLines === 2", 5_000);
  // Off the offer onto the bar between its buttons, and back: a new entry, so it flashes again.
  await child.waitFor("document.querySelector('.pages-landing-flash') === null", 5_000);
  const gap = await evaluate<{ x: number; y: number }>(`(() => { const bar = ${INSERT}.closest('.mw-ctx'), box = bar.getBoundingClientRect();
    for (let y = box.top + 1; y < box.bottom; y += 2) for (let x = box.left + 1; x < box.right; x += 2) {
      const at = document.elementFromPoint(x, y); if (at && bar.contains(at) && !at.closest('[data-key]')) return { x, y }; }
    return null; })()`);
  assert.ok(gap, "the bar has room between its buttons");
  await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: gap.x, y: gap.y }, sessionId);
  await hover(true);
  await child.waitFor("window.flashLines === 3", 5_000);
  // Focus on the offer flashes it as hover does.
  await hover(false);
  await child.waitFor("document.querySelector('.pages-landing-flash') === null", 5_000);
  const lines = await child.evaluate<number>("window.flashLines");
  await evaluate(`${INSERT}.focus()`);
  await child.waitFor(`window.flashLines === ${lines + 1}`, 5_000);

  // FLASH-02: a landing that went away is not asked: no event, no error.
  await child.waitFor("document.querySelector('.pages-landing-flash') === null", 5_000);
  await hover(false);
  await evaluate(`(() => { const gone = document.createElement('div'); document.body.append(gone);
    gone.dispatchEvent(new CustomEvent('molis:surface-landing', { bubbles: true, detail: { ...window.lastLanding } })); gone.remove(); window.flashGoneFrom = window.flashAsked; window.flashGoneAt = window.lastLanding.targets[0].anchor; })()`);
  await hover(true);
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(await evaluate<number>("window.flashAsked - window.flashGoneFrom"), 0, "nothing asked of a landing that is gone");
  // FLASH-03: the person moves the cursor, so the page reports its landing again; choosing the offer previews the result's name there.
  await child.evaluate(`(() => { const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
    const text = [...editor.querySelectorAll('p')].find((node) => node.textContent === '先完成核心体验。').firstChild;
    const range = document.createRange(); range.setStart(text, 2); range.collapse(true); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); })()`);
  await waitFor("window.lastLanding?.position === 'cursor' && window.lastLanding.targets[0].anchor !== window.flashGoneAt");
  await evaluate("window.holdJudge = true");
  await evaluate(`document.querySelector(${JSON.stringify(CARD)}).focus()`);
  await key("Enter", "Enter", 13);
  await waitFor(`Boolean(${INSERT})`, 15_000);
  // PICK-05: Esc on the bar puts the bar away, not the card; a judgment that comes back after it does not bring the bar up again
  // (on a slow machine it comes back late); picking the card again brings the bar back.
  await evaluate(`${INSERT}.focus()`);
  await key("Escape", "Escape", 27);
  await waitFor(`!${INSERT}`, 5_000);
  await evaluate("window.holdJudge = false");
  await waitFor("window.judged === 1", 5_000);
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(await evaluate<boolean>(`!${INSERT}`), true, "a judgment after Esc does not bring the bar back");
  assert.equal(await evaluate<string>(`document.querySelector(${JSON.stringify(CARD)}).getAttribute('aria-current')`), "true", "still in hand");
  await evaluate(`document.querySelector(${JSON.stringify(CARD)}).focus()`);
  await key("Enter", "Enter", 13);
  await waitFor(`Boolean(${INSERT})`, 15_000);
  await evaluate(`${INSERT}.dataset.testInsert="true"`);
  await click("[data-test-insert]");
  await child.waitFor("document.querySelector('.pages-landing-preview')?.textContent === '访谈纪要'", 10_000);
  assert.equal(await child.evaluate<string>(editorText), "先完成核心体验。再安排发布。", "nothing is written before the person confirms");
  await child.evaluate(`[...document.querySelectorAll('.pages-pop .mw-btn--primary')].find((node) => node.textContent === '放进去').click()`);
  await child.waitFor(`${editorText} === '先完访谈纪要成核心体验。再安排发布。'`, 10_000);
});

test("PRR-21 QA-017 opens the side panel; W3-A3b PICK-02 on the real result card the title asks to open the card's own object once and picks nothing; a drag that selects its text picks nothing; the card body still picks", { timeout: 150_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const child=await pluginFrameBrowser(t,browser,"pages");
  const store = openPagesStore(homeDirectory);
  const left = store.create({ project_id: projectId!, title: "发布计划", body: { type: "doc", content: [paragraph("先完成核心体验。")] } });
  const made = store.create({ project_id: projectId!, title: "访谈纪要", body: { type: "doc", content: [paragraph("离线也要能记下想法。")] } });
  store.close();
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  // What the page is asked and told, counted from the page's own events: the open request the title makes (a cancelable
  // molis:side-open carrying the object), every pick up the card reports, and every click that reaches the page from inside the
  // card, with whether anything cancelled it. QA-017 asks whether a title click really opens the panel, so it goes through and
  // the test closes the panel again before the card work below.
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `window.picks = 0; window.opens = []; window.clicks = [];
    document.addEventListener('molis:surface-focus', (event) => { if (String(event.detail?.context_id ?? '').startsWith('pick:')) window.picks += 1; });
    window.addEventListener('molis:side-open', (event) => { window.opens.push(event.detail?.target ?? null); }, true);
    document.addEventListener('click', (event) => { if (event.target.closest?.(${JSON.stringify(CARD)})) window.clicks.push({ title: Boolean(event.target.closest('.assistant-item-title')), prevented: event.defaultPrevented }); });` }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${left.id}` }, sessionId));
  await child.waitFor("document.querySelector('[data-pages-title]')?.value === '发布计划'");

  // A work, and the document it made handed back to it as its result (as the first test does).
  await issueModel(t, homeDirectory, { replyText: "整理好了，写在「访谈纪要」里。" });
  await click("[data-assistant-input]");
  await command("Input.insertText", { text: "把访谈整理成纪要" }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await waitFor("document.querySelector('.assistant-msg--assistant')?.textContent.includes('访谈纪要')", 20_000);
  const api = `/projects/${projectId}/api/assistant/works`;
  const workId = await evaluate<string>(`fetch(${JSON.stringify(api)}).then((r) => r.json()).then((body) => body.works[0].work_id)`);
  const handed = await evaluate<number>(`fetch(${JSON.stringify(api)} + '/' + ${JSON.stringify(workId)} + '/results', { method: 'POST', headers: { 'content-type': 'application/json', 'x-molis-work-control-token': document.querySelector('meta[name=molis-work-control-token]').content,
      'x-molis-work-idempotency-key': 'w3a3b-pick02-result' },
    body: JSON.stringify({ object: { kind: 'pages_document', id: ${JSON.stringify(made.id)} }, source: { title: 'Pages' } }) }).then((r) => r.status)`);
  assert.equal(handed, 200);
  await evaluate(`document.dispatchEvent(new CustomEvent('molis:assistant-open', { detail: { work_id: ${JSON.stringify(workId)} } }))`);
  await waitFor(`document.querySelector(${JSON.stringify(CARD)})?.checkVisibility() === true`, 15_000);
  const mouse = (type: string, x: number, y: number, buttons: number) => command("Input.dispatchMouseEvent", { type, x, y, ...(type === "mouseMoved" && !buttons ? {} : { button: "left" }), buttons, clickCount: 1 }, sessionId);
  const held = (name: string) => evaluate<number | unknown[]>(`window.${name}`);
  const inHand = () => evaluate<string | null>(`document.querySelector(${JSON.stringify(CARD)}).getAttribute('aria-current')`);

  // The title is the card's button: one real click asks to open the card's own object, exactly once, nothing is picked up, and the
  // click goes on to the page uncancelled. The document on the left stays where it was (the request was claimed above).
  await evaluate("window.opens = []; window.picks = 0; window.clicks = []");
  await click(`${CARD} .assistant-item-title`);
  await waitFor("window.opens.length >= 1", 10_000);
  await waitFor("document.body.dataset.sideOpen === 'true'", 10_000);
  await waitFor("document.querySelector('#side-panel [role=tab][aria-selected=true]')", 10_000);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const opens = await evaluate<Array<{ subject?: { kind?: string; id?: string }; title?: string; open?: { surface?: string; id?: string } } | null>>("window.opens");
  assert.equal(opens.length, 1, "the title asked to open exactly once");
  assert.equal(opens[0]?.open?.surface, "pages", "it asks the owner surface to open");
  assert.equal(opens[0]?.open?.id, made.id, "it asks for the card's own object, not the document on the left");
  assert.deepEqual([opens[0]?.subject?.kind, opens[0]?.subject?.id, opens[0]?.title], ["pages_document", made.id, "访谈纪要"]);
  assert.deepEqual(await held("clicks"), [{ title: true, prevented: false }], "one click, on the title, not cancelled on its way to the page");
  assert.equal(await held("picks"), 0, "a click on the title is not a pick up");
  assert.equal(await inHand(), null, "and nothing is in hand");
  assert.equal(await child.evaluate<string>("document.querySelector('[data-pages-title]').value"), "发布计划", "the document on the left was not replaced by the title's request");
  // QA-017: the title really opened the panel; close it again so the card and the Assistant stay in view for the rest.
  await evaluate("document.dispatchEvent(new CustomEvent('molis:side-close'))");
  await waitFor("document.body.dataset.sideOpen === 'false'", 10_000);

  // A real drag over the card's own line of text selects it; the click that ends the drag is reading, not picking.
  // Closing the platform pane restores the Assistant's split layout. The title was scrolled into view above, but its
  // subtitle can still be below the side pane's clipped bottom. Centre it so the drag reaches text, away from the edge
  // where native text-selection autoscroll would move the card out from under the pointer before release.
  const line = await evaluate<{ x0: number; x1: number; y: number; hittable: boolean } | null>(`(async () => { const sub = document.querySelector(${JSON.stringify(CARD + " .assistant-item-sub")}); if (!sub) return null;
    sub.scrollIntoView({ block: 'center', behavior: 'instant' });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const range = document.createRange(); range.selectNodeContents(sub); const r = range.getBoundingClientRect();
    const x0 = r.left + 1, x1 = r.right - 1, y = r.top + r.height / 2;
    return { x0, x1, y, hittable: sub.contains(document.elementFromPoint(x0, y)) && sub.contains(document.elementFromPoint(x1, y)) }; })()`);
  assert.ok(line && line.x1 - line.x0 > 8, "the card has a line of text to select");
  assert.equal(line.hittable, true, "both drag endpoints hit the card's visible text");
  await mouse("mouseMoved", line.x0, line.y, 0);
  await mouse("mousePressed", line.x0, line.y, 1);
  await mouse("mouseMoved", (line.x0 + line.x1) / 2, line.y, 1);
  await mouse("mouseMoved", line.x1, line.y, 1);
  await mouse("mouseReleased", line.x1, line.y, 0);
  assert.equal(await evaluate<boolean>(`(() => { const selection = getSelection(); return !selection.isCollapsed && selection.toString().length >= 2 && document.querySelector(${JSON.stringify(CARD)}).contains(selection.anchorNode); })()`), true, "the drag selected text inside the card");
  await waitFor("window.clicks.length === 2", 5_000);
  assert.deepEqual((await evaluate<Array<{ title: boolean; prevented: boolean }>>("window.clicks")).at(-1), { title: false, prevented: false }, "the click that ended the drag was not cancelled");
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(await held("picks"), 0, "a click that ends a text selection is not a pick up");
  assert.equal(await inHand(), null);
  assert.equal((await evaluate<unknown[]>("window.opens")).length, 1, "and it opened nothing");

  // The silence above is the rule, not a dead card: with no selection a click on the card body picks it up, and does not cancel the click.
  await evaluate("getSelection().removeAllRanges()");
  const body = await evaluate<{ x: number; y: number }>(`(() => { const box = document.querySelector(${JSON.stringify(CARD)} + ' .assistant-glyph').getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; })()`);
  await mouse("mousePressed", body.x, body.y, 1);
  await mouse("mouseReleased", body.x, body.y, 0);
  await waitFor("window.picks === 1", 5_000);
  assert.equal(await inHand(), "true", "the card body picked the card up");
  assert.deepEqual((await evaluate<Array<{ title: boolean; prevented: boolean }>>("window.clicks")).at(-1), { title: false, prevented: false }, "even a pick leaves the click alone");
  assert.equal((await evaluate<unknown[]>("window.opens")).length, 1, "and still opened nothing");
});
