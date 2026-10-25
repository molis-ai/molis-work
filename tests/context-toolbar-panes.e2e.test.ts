import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages/testing";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

/**
 * The floating context toolbar's own acceptance items of specs/context-program §19.4 that no other test proves: W2-02 (a
 * split pane draws its bar in its own document; what the person holds is reported to the top document; Esc puts it away
 * and records "ignored"), W2-05 (the editor's shortcuts are unchanged; ⌘K opens the link form under the bar) and W2-08
 * (a starter that cannot run any more says why in a toast, not in a row that no longer exists).
 */
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const TEXT = "我们认为主因是上手困难，新用户在第一周里很难完成第一个有价值的操作。";
const BAR = ".mw-ctx:not([hidden])";

async function pagesWorkbench(t: TestContext) {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return null;
  const { command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
  const child = await pluginFrameBrowser(t, browser, "pages");
  const pane = await pluginFrameBrowser(t, browser, "pages", "iframe.tab-content-frame:not([hidden])");
  await command("Page.addScriptToEvaluateOnNewDocument", {source:`window.__holds=[];window.__signals=[];
    window.addEventListener("message",event=>{if(event.data?.type==="workbench-context-hold")window.__holds.push(event.data)});
    const original=window.fetch;window.fetch=async(...args)=>{if(String(args[0]).includes("/api/contextual/signal"))window.__signals.push(JSON.parse(args[1].body));return original(...args)};`},sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  const setup = openPagesStore(homeDirectory);
  const page = (() => { try { return setup.create({ project_id: projectId!, title: "留存分析", body: { type: "doc", content: [paragraph(TEXT)] } }); } finally { setup.close(); } })();
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${page.id}` }, sessionId));
  await child.waitFor(`document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes(${JSON.stringify(TEXT)})`, 15_000);
  return {...browser,child,pane};
}

/** Selects the first paragraph's text in the editor of `scope` (an expression that names a document). */
const selectIn = (scope: string) => `(() => { const doc = ${scope}; const editor = doc.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
  const text = editor.querySelector('p').firstChild; const range = doc.createRange(); range.setStart(text, 0); range.setEnd(text, text.length);
  const selection = doc.getSelection(); selection.removeAllRanges(); selection.addRange(range); doc.dispatchEvent(new Event('selectionchange')); })()`;

test("W2-02: a split pane draws its bar in its own document; holding it is reported to the top document; Esc puts it away as ignored", { timeout: 120_000 }, async t => {
  const browser = await pagesWorkbench(t);
  if (!browser) return;
  const { evaluate, waitFor, click } = browser;
  await click("[data-titlebar-tabs] [data-tab-split]");
  await click("[data-layout-split=right]");
  const PANE = "[...document.querySelectorAll('iframe.tab-content-frame')].find(frame => frame.contentDocument?.querySelector('iframe[data-plugin-frame=pages]'))";
  await browser.pane.waitFor(`document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes(${JSON.stringify(TEXT)})`,20_000);
  await browser.pane.evaluate(selectIn("document"));
  await waitFor(`Boolean(${PANE}.contentDocument.querySelector(${JSON.stringify(`${BAR} .mw-btn[data-key]`)}))`, 15_000);
  const placed = await evaluate<{ inPane: boolean; inTop: boolean; inView: boolean }>(`(() => { const doc = ${PANE}.contentDocument, bar = doc.querySelector(${JSON.stringify(BAR)}), box = bar.getBoundingClientRect();
    return { inPane: bar.ownerDocument === doc, inTop: Boolean(document.querySelector(${JSON.stringify(BAR)})), inView: box.left >= 0 && box.right <= doc.defaultView.innerWidth && box.top >= 0 }; })()`);
  assert.deepEqual(placed, { inPane: true, inTop: false, inView: true }, "the pane's own document draws the bar, inside the pane; the top document draws none");

  // Reaching a button holds the bar: the pane says which keys are under the person, so a ranking that arrives meanwhile leaves them where they are.
  const key = await evaluate<string>(`(() => { const button = ${PANE}.contentDocument.querySelector(${JSON.stringify(`${BAR} .mw-btn[data-key]`)}); button.focus(); return button.dataset.key; })()`);
  await waitFor(`window.__holds.some(hold => Array.isArray(hold.pinned) && hold.pinned.includes(${JSON.stringify(key)}))`, 5_000);

  // Esc on the bar puts it away and tells the Host the person ignored what was offered.
  await evaluate(`${PANE}.contentDocument.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await waitFor(`!${PANE}.contentDocument.querySelector(${JSON.stringify(BAR)})`, 5_000);
  await waitFor(`window.__signals.some(body => body.signal === 'ignored' && body.key === ${JSON.stringify(key)})`, 5_000);
  assert.equal(await evaluate<boolean>(`window.__signals.every(body => body.signal === 'ignored')`), true, "putting the bar away accepts nothing");
});

test("W2-05: the editor's shortcuts are unchanged with the bar up; ⌘K opens the link form under the bar", { timeout: 120_000 }, async t => {
  const browser = await pagesWorkbench(t);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor } = browser;
  // ProseMirror's "Mod" is ⌘ on a Mac and Ctrl elsewhere (CI runs on Linux).
  const modifiers = await evaluate<boolean>("/Mac|iP(hone|ad)/.test(navigator.platform)") ? 4 : 2;
  const press = async (key: string, code: string, keyCode: number) => {
    await command("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: keyCode, modifiers }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode, modifiers }, sessionId);
  };
  await browser.child.evaluate(selectIn("document"));
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(`${BAR} .mw-ctx__tools button`)}))`, 15_000);

  await press("b", "KeyB", 66);
  await browser.child.waitFor(`document.querySelector('[data-pages-editor] .ProseMirror p strong')?.textContent === ${JSON.stringify(TEXT)}`, 5_000);
  await waitFor(`[...document.querySelectorAll(${JSON.stringify(`${BAR} .mw-ctx__tools button`)})].some(button => button.getAttribute('aria-pressed') === 'true')`, 5_000);

  await press("k", "KeyK", 75);
  await browser.child.waitFor("Boolean(document.querySelector('.pages-pop:not([hidden]) input[type=url]'))", 5_000);
  assert.equal(await browser.child.evaluate<boolean>("document.activeElement === document.querySelector('.pages-pop input[type=url]')"), true, "the address field takes the focus");
  assert.equal(await browser.child.evaluate<boolean>("Boolean(document.querySelector('.pages-pop:not([hidden])')) && !document.querySelector('.pages-pop.is-docked')"), true,
    "SYS-15-U1 the editable link form stays inside its page, using the existing local positioning fallback");
});

test("W2-08: a starter that cannot run any more says why in a toast", { timeout: 120_000 }, async t => {
  const browser = await pagesWorkbench(t);
  if (!browser) return;
  const { evaluate, waitFor } = browser;
  // The Assistant's opening suggestions name an object and an action; one that is no longer offered for it is refused aloud.
  await evaluate(`document.dispatchEvent(new CustomEvent('molis:assistant-starter-choose', { detail: { object_key: 'start:pages_document:gone:', key: 'gone.offer' } }))`);
  await waitFor("document.querySelector('[data-toast]')?.textContent.includes('这个动作已不在当前内容的候选里') && document.querySelector('[data-toast]').classList.contains('is-error')", 5_000);
});
