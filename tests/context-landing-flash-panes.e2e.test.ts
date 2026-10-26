import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test from "node:test";
import { CONTEXT_TOOLBAR_CLIENT_SCRIPT } from "@molis-ai/molis-work-design-system";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/context-program §21.4 W3-A3c: hovering a way to put the thing in hand at the landing flashes that landing, also when
// the landing is the Pages document in a split pane (the top document asks that pane's frame, which raises the flash on its
// own landing) and also when the way is an entry in the bar's 「更多」 menu. A pane takes the ask only from the page around it
// (S-30); the keys the menu holds show the landing but are not kept in their slot like the bar's.
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const PANE = "[...document.querySelectorAll('iframe[data-pane-owner]')].find(frame => frame.contentDocument?.querySelector('iframe[data-plugin-frame=pages]'))";
const paneText = "(document.querySelector('[data-pages-editor] .ProseMirror')?.textContent ?? '')";
const OFFER = "插入到光标处";

test("PANE-FLASH-01, PANE-FLASH-02, MENU-FLASH-01 (W3-A3c, S-30): hovering 「插入到光标处」 on the bar or in its menu flashes the landing in the split pane; a pane does not flash for anyone but the page around it", { timeout: 150_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const child=await pluginFrameBrowser(t,browser,"pages"), paneView=await pluginFrameBrowser(t,browser,"pages","iframe[data-pane-owner]:not([hidden])");
  const store = openPagesStore(homeDirectory);
  const left = store.create({ project_id: projectId!, title: "发布计划", body: { type: "doc", content: [paragraph("先完成核心体验。"), paragraph("再安排发布。")] } });
  const right = store.create({ project_id: projectId!, title: "访谈记录", body: { type: "doc", content: [paragraph("用户说：离线也要能记下想法。")] } });
  store.close();
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${left.id}` }, sessionId));
  await child.waitFor("document.querySelector('[data-pages-title]')?.value === '发布计划'");
  await click("[data-titlebar-tabs] [data-tab-split]");
  await click("[data-layout-split=right]");
  await paneView.waitFor(`${paneText}.includes('先完成核心体验')`, 20_000);

  // What is asked of each document, and every flash line Pages draws in the pane.
  await evaluate(`(() => {
    window.flashAsked = 0; document.addEventListener('molis:surface-landing-flash', () => { window.flashAsked += 1; }, true);
  })()`);
  await paneView.evaluate(`(() => {
    const pane=window; pane.flashAsked=0;pane.flashLines=0;
    pane.document.addEventListener('molis:surface-landing-flash', () => { pane.flashAsked += 1; }, true);
    pane.document.addEventListener('molis:surface-landing', (event) => { pane.lastLanding = event.detail; }, true);
    new pane.MutationObserver((records) => { for (const record of records) for (const node of record.addedNodes) if (node.classList?.contains('pages-landing-flash')) pane.flashLines += 1; })
      .observe(pane.document.body, { childList: true, subtree: true });
  })()`);
  const pane = <T>(expression: string) => paneView.evaluate<T>(`(() => { const pane = window; return ${expression}; })()`);

  // The person leaves the cursor after 「先完成」 in the pane: that is the landing.
  await paneView.evaluate(`(() => {
    const doc = document, editor = doc.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
    const text = [...editor.querySelectorAll('p')].find(node => node.textContent === '先完成核心体验。').firstChild;
    const range = doc.createRange(); range.setStart(text, 3); range.collapse(true);
    const selection = doc.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  })()`);
  await paneView.waitFor(`(() => { const pane = window; return pane.lastLanding?.position === 'cursor'; })()`, 10_000);

  // PANE-FLASH-02: the pane asking itself, and a frame inside the pane that is not the page around it, flash nothing.
  await evaluate(`(async () => {
    const pane=${PANE}.contentWindow;
    // Posted by scripts running in the pane and in a frame inside it, so their windows are the messages' sources.
    const own = pane.document.createElement('script');
    own.textContent = "postMessage({ type: 'workbench-surface-landing-flash' }, location.origin)";
    pane.document.body.append(own);
    const stray = pane.document.createElement('iframe'); pane.document.body.append(stray);
    const script = stray.contentDocument.createElement('script');
    script.textContent = "parent.postMessage({ type: 'workbench-surface-landing-flash' }, parent.location.origin)";
    stray.contentDocument.body.append(script);
    await new Promise(resolve => setTimeout(resolve, 300)); stray.remove();
  })()`);
  assert.deepEqual(await pane<[number, number]>("[pane.flashAsked, pane.flashLines]"), [0, 0], "a flash not asked by the page around the pane is dropped");

  // A passage in hand from the right panel's file preview.
  await evaluate(`document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'files', target: { subject: { kind: 'pages_document', id: ${JSON.stringify(right.id)} } } } }))`);
  await waitFor("document.querySelector('[data-side-files-body]')?.textContent.includes('离线也要能记下想法')", 20_000);
  await evaluate(`(() => {
    const body = document.querySelector('[data-side-files-body]');
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let node; while ((node = walker.nextNode()) && !node.textContent.includes('离线也要能记下想法'));
    const start = node.textContent.indexOf('离线');
    const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + 9);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  })()`);
  const onBar = `[...document.querySelectorAll(".mw-ctx:not(.mw-ctx--static):not([hidden]) [data-key^='attach.']")].find(node => node.textContent.includes(${JSON.stringify(OFFER)}))`;
  const inMenu = `[...document.querySelectorAll(".mw-ctx-menu [data-key^='attach.']")].find(node => node.textContent.includes(${JSON.stringify(OFFER)}))`;
  await waitFor(`${onBar} !== undefined`, 15_000);
  const moveTo = async (expression: string) => {
    const point = await evaluate<{ x: number; y: number }>(`(() => { const node = ${expression}; node.scrollIntoView({ block: 'nearest' }); const rect = node.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`);
    await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y }, sessionId);
    return point;
  };
  const away = () => command("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1430, y: 950 }, sessionId);

  // PANE-FLASH-01: hovering the offer on the bar asks the pane, which flashes its own landing; the top document raises nothing.
  await moveTo(onBar);
  await paneView.waitFor(`(() => { const pane = window; return pane.flashAsked === 1 && pane.flashLines === 1; })()`, 5_000);
  assert.equal(await evaluate<number>("window.flashAsked"), 0, "the top document raises nothing for a landing in a pane");
  assert.equal(await evaluate<boolean>("document.querySelector('.pages-landing-flash') === null"), true, "the flash is drawn in the pane");
  await paneView.waitFor(`document.querySelector('.pages-landing-flash') === null`, 5_000);
  await away();

  // MENU-FLASH-01: the same offer in 「更多」 (its 「全部操作」 group lists every way): hovering it there flashes the landing too.
  const more = await evaluate<{ x: number; y: number }>(`(() => { const rect = document.querySelector('.mw-ctx:not(.mw-ctx--static):not([hidden]) [data-more]').getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`);
  await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: more.x, y: more.y }, sessionId);
  for (const type of ["mousePressed", "mouseReleased"]) await command("Input.dispatchMouseEvent", { type, x: more.x, y: more.y, button: "left", clickCount: 1 }, sessionId);
  await waitFor(`${inMenu} !== undefined`, 5_000);
  const asked = await pane<number>("pane.flashAsked");
  await moveTo(inMenu);
  await paneView.waitFor(`(() => { const pane = window; return pane.flashAsked === ${asked + 1} && pane.flashLines === 2; })()`, 5_000);
  assert.equal(await evaluate<number>("window.flashAsked"), 0);
  await paneView.waitFor(`document.querySelector('.pages-landing-flash') === null`, 5_000);
  assert.equal(await paneView.evaluate<string>(paneText), "先完成核心体验。再安排发布。", "a flash writes nothing");

  // MENU-FLASH-01: the toolbar itself. A key under the pointer in the menu is in hand for the flash (pointed), but not among
  // the keys the bar keeps in their slot (pinned, which goes to the Host with the next judgment).
  await away();
  await evaluate(`(() => {
    const make = Function("return (" + ${JSON.stringify(CONTEXT_TOOLBAR_CLIENT_SCRIPT)} + ")")(), parent = document.createElement('div');
    parent.setAttribute('data-test-toolbar', ''); document.body.append(parent);
    window.testHolds = [];
    window.testToolbar = make({ parent, translate: (text) => text, width: () => 1200, choose: () => {}, hold: (held) => window.testHolds.push(held) });
    window.testToolbar.show({ context_id: 'test', anchor: { rect: { left: 200, top: 300, right: 400, bottom: 320, width: 200, height: 20 } },
      actions: [{ key: 'rewrite', label: '改写' }], more: [{ title: '放进去', items: [{ key: 'attach.cursor', label: ${JSON.stringify(OFFER)} }] }] });
  })()`);
  await moveTo("document.querySelector('[data-test-toolbar] [data-key=rewrite]')");
  await waitFor("window.testHolds.at(-1)?.pinned.includes('rewrite')", 5_000);
  const opener = await moveTo("document.querySelector('[data-test-toolbar] [data-more]')");
  for (const type of ["mousePressed", "mouseReleased"]) await command("Input.dispatchMouseEvent", { type, x: opener.x, y: opener.y, button: "left", clickCount: 1 }, sessionId);
  await waitFor("document.querySelector('[data-test-toolbar] .mw-ctx-menu [data-key=\"attach.cursor\"]') !== null", 5_000);
  const holds = await evaluate<number>("window.testHolds.length");
  await moveTo("document.querySelector('[data-test-toolbar] .mw-ctx-menu [data-key=\"attach.cursor\"]')");
  await waitFor(`window.testHolds.length > ${holds} && window.testToolbar.pointed().includes('attach.cursor')`, 5_000);
  assert.deepEqual(await evaluate<string[]>("window.testToolbar.pinned()"), [], "a menu entry under the pointer keeps no slot on the bar");
  assert.equal(await evaluate<boolean>("window.testHolds.some(held => held.pinned.includes('attach.cursor'))"), false, "and is never reported as pinned");
});
