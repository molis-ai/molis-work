import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/context-program §21.4 W3-C, specs/side-shelf AC-S04: a plugin's tab in the side panel reports what is in hand, as a
// split pane does. A passage of a Shelf material selected in its side tab is in hand there: the bar stands beside it in that
// tab's own document, with its actions and the landing on the left (「插入到光标处」); a selection on the left takes the bar
// back to the left; closing the panel puts it away. The top document marks it as in the side panel, and which tab.
const SHELF_TAB = "plugin:shelf/side";
const SHELF = `document.querySelector('[data-side-body="${SHELF_TAB}"] iframe')`;
const BAR = ".mw-ctx:not(.mw-ctx--static):not([hidden])";
const MATERIAL = "离线也要能记下想法，回到网上再同步。";
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

test("W3-C AC-S04: a passage selected in Shelf's side tab is in hand there; the bar follows to the left and goes when the panel closes", { timeout: 150_000 }, async (t) => {
  const agentSetting = process.env.MOLIS_WORK_SHELF_AGENT;
  process.env.MOLIS_WORK_SHELF_AGENT = "off";
  t.after(() => { if (agentSetting === undefined) delete process.env.MOLIS_WORK_SHELF_AGENT; else process.env.MOLIS_WORK_SHELF_AGENT = agentSetting; });
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId, homeDirectory } = browser;
  const store = openPagesStore(homeDirectory);
  const left = (() => { try { return store.create({ project_id: projectId!, title: "发布计划", body: { type: "doc", content: [paragraph("先完成核心体验。"), paragraph("再安排发布。")] } }); } finally { store.close(); } })();
  const capture = async (name: string) => {
    const directory = join(process.cwd(), ".impeccable/qa/review/side-shelf-in-hand"); await mkdir(directory, { recursive: true });
    const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId); await writeFile(join(directory, name + ".png"), Buffer.from(shot.data, "base64"));
  };
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: "if (window.top === window) document.addEventListener('molis:surface-landing', (event) => { window.lastLanding = event.detail; });" }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${left.id}` }, sessionId));
  await waitFor("document.querySelector('[data-pages-title]')?.value === '发布计划'");

  // The cursor on the left is where a thing in hand on the right would go.
  await evaluate(`(() => {
    const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
    const text = [...editor.querySelectorAll('p')].find(node => node.textContent === '先完成核心体验。').firstChild;
    const range = document.createRange(); range.setStart(text, 3); range.collapse(true);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  })()`);
  await waitFor("window.lastLanding?.position === 'cursor'");

  // A text material on the shelf, opened in Shelf's side tab.
  const item = await evaluate<{ item_id: string }>(`fetch(${JSON.stringify(`/projects/${projectId}/api/shelf/items`)}, { method: "POST", headers: molisWorkControlHeaders(),
    body: JSON.stringify({ filename: "访谈记录.md", mime: "text/markdown", bytes_base64: btoa(String.fromCharCode(...new TextEncoder().encode(${JSON.stringify(`# 访谈记录\n\n用户说：${MATERIAL}\n`)}))) }) })
    .then((response) => response.json()).then((body) => body.item)`);
  assert.ok(item?.item_id, "the material is on the shelf");
  // What the top document asks the Host for, to read where it says the thing in hand is.
  await evaluate(`(() => { window.__asked = []; const original = window.fetch;
    window.fetch = async (...args) => { if (String(args[0]).includes('/api/contextual/candidates')) window.__asked.push(JSON.parse(args[1].body)); return original(...args); }; })()`);
  await evaluate(`document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: ${JSON.stringify(SHELF_TAB)}, target: { item: ${JSON.stringify(item.item_id)} } } }))`);
  await waitFor(`Boolean(${SHELF}?.contentDocument?.querySelector('[data-shelf-read] .shelf-reading')?.textContent.includes(${JSON.stringify(MATERIAL)}))`, 20_000);

  // AC-S04: selected in the side tab, the bar stands beside the passage in that tab's own document, with its actions.
  const selectInShelf = `(() => { const doc = ${SHELF}.contentDocument, body = doc.querySelector('[data-shelf-read] .shelf-reading');
    const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT); let node; while ((node = walker.nextNode()) && !node.textContent.includes('离线也要能'));
    const start = node.textContent.indexOf('离线'), range = doc.createRange(); range.setStart(node, start); range.setEnd(node, start + 9);
    const selection = doc.getSelection(); selection.removeAllRanges(); selection.addRange(range); doc.dispatchEvent(new Event('selectionchange')); })()`;
  await evaluate(selectInShelf);
  await waitFor(`Boolean(${SHELF}.contentDocument.querySelector(${JSON.stringify(`${BAR} .mw-btn[data-key]`)}))`, 15_000);
  const placed = await evaluate<{ inTop: boolean; inView: boolean; beside: boolean }>(`(() => { const doc = ${SHELF}.contentDocument, bar = doc.querySelector(${JSON.stringify(BAR)}).getBoundingClientRect();
    const passage = doc.getSelection().getRangeAt(0).getBoundingClientRect();
    return { inTop: Boolean(document.querySelector(${JSON.stringify(BAR)})), inView: bar.left >= 0 && bar.right <= doc.defaultView.innerWidth && bar.top >= 0,
      beside: Math.min(Math.abs(bar.top - passage.bottom), Math.abs(passage.top - bar.bottom)) < 48 }; })()`);
  assert.deepEqual(placed, { inTop: false, inView: true, beside: true }, "the side tab's document draws the bar, beside the passage; the top document draws none");
  const asked = await evaluate<Array<{ pane_id: string; focus: { place?: string; side_tab?: string; object: { kind: string; id: string } } }>>("window.__asked");
  const last = asked.at(-1)!;
  assert.deepEqual([last.pane_id, last.focus.place, last.focus.side_tab, last.focus.object.kind, last.focus.object.id], ["side", "side", SHELF_TAB, "shelf_item", item.item_id],
    "the top document marks it as in the side panel, in Shelf's tab");
  // The landing on the left is offered: 「插入到光标处」, on the bar or in its menu.
  const attach = ".mw-ctx:not(.mw-ctx--static) [data-key^='attach.'], .mw-ctx-menu [data-key^='attach.']";
  if (!await evaluate<boolean>(`${SHELF}.contentDocument.querySelector(${JSON.stringify(attach)}) !== null`)) await evaluate(`${SHELF}.contentDocument.querySelector('.mw-ctx:not(.mw-ctx--static) [data-more]')?.click()`);
  await waitFor(`[...${SHELF}.contentDocument.querySelectorAll(${JSON.stringify(attach)})].some(node => node.textContent.includes('插入到光标处'))`, 10_000);
  await capture("1-bar-beside-shelf-passage");

  // Back on the left: a selection there takes the bar to the left; the side tab's goes.
  await evaluate(`(() => { const doc = ${SHELF}.contentDocument; doc.getSelection().removeAllRanges(); doc.dispatchEvent(new Event('selectionchange'));
    const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
    const text = [...editor.querySelectorAll('p')].find(node => node.textContent === '再安排发布。').firstChild;
    const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, text.length);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange')); })()`);
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(`${BAR} [data-key]`)})) && !${SHELF}.contentDocument.querySelector(${JSON.stringify(BAR)})`, 15_000);
  await capture("2-bar-back-on-the-left");

  // In hand on the right again (the left's bar goes), then the panel closed: the bar goes with it.
  await evaluate(selectInShelf);
  await waitFor(`Boolean(${SHELF}.contentDocument.querySelector(${JSON.stringify(`${BAR} .mw-btn[data-key]`)})) && !document.querySelector(${JSON.stringify(BAR)})`, 15_000);
  await evaluate("document.dispatchEvent(new CustomEvent('molis:side-close'))");
  await waitFor(`document.body.dataset.sideOpen === 'false' && !${SHELF}.contentDocument.querySelector(${JSON.stringify(BAR)}) && !document.querySelector(${JSON.stringify(BAR)})`, 10_000);
});
