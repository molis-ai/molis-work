import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages/testing";
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

/**
 * AC-S04 sometimes times out on CI (red twice and green once on one commit) while it passes locally, and the screenshot cannot
 * tell which step stood still. On a timeout this notes, beside the test, what the page held at that moment: what the top
 * document asked the Host for (`__asked`), what came back for each ask (`__answers`: when it left, its status and when it came
 * back, how many candidates and how many available, or the error), the page's clock at that moment, the shown bars in the side
 * tab's document and the first bar there in any state, the selection there, whether the panel is open, and the shown bars in the
 * top document. An ask with no status never came back; one with available candidates and no bar came back and was not drawn.
 * It then rethrows the original error; no assertion changes.
 */
const SCENE = `(() => { const doc = ${SHELF}?.contentDocument;
  return { now: Math.round(performance.now()), asked: window.__asked ?? null, answers: window.__answers ?? null, side_bars: doc?.querySelectorAll(${JSON.stringify(BAR)}).length ?? null,
    side_first_bar: doc?.querySelector('.mw-ctx')?.outerHTML.slice(0, 500) ?? null, side_selection: doc?.getSelection()?.toString() ?? null,
    side_open: document.body.dataset.sideOpen ?? null, top_bars: document.querySelectorAll(${JSON.stringify(BAR)}).length }; })()`;
async function noteSceneOnTimeout(t: TestContext, evaluate: <T>(expression: string) => Promise<T>, wait: Promise<void>): Promise<void> {
  await wait.catch(async (error: unknown) => {
    const scene = await evaluate<unknown>(SCENE).catch((reading: unknown) => ({ unreadable: String(reading) }));
    t.diagnostic(`AC-S04 scene at timeout: ${JSON.stringify(scene)}`);
    throw error;
  });
}

/** Pages open on the left with its cursor placed (the landing), and a text material open in Shelf's side tab. */
async function shelfBesidePages(t: TestContext) {
  const agentSetting = process.env.MOLIS_WORK_LOCAL_TOOLS;
  process.env.MOLIS_WORK_LOCAL_TOOLS = "off";
  t.after(() => { if (agentSetting === undefined) delete process.env.MOLIS_WORK_LOCAL_TOOLS; else process.env.MOLIS_WORK_LOCAL_TOOLS = agentSetting; });
  const browser = await openGoalBrowser(t, true);
  if (!browser) return null;
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId, homeDirectory } = browser;
  const pages=await pluginFrameBrowser(t,browser,"pages"), shelf=await pluginFrameBrowser(t,browser,"shelf",'[data-side-body="plugin:shelf/side"] iframe');
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
  await pages.waitFor("document.querySelector('[data-pages-title]')?.value === '发布计划'");

  // The cursor on the left is where a thing in hand on the right would go.
  await pages.evaluate(`(() => {
    const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
    const text = [...editor.querySelectorAll('p')].find(node => node.textContent === '先完成核心体验。').firstChild;
    const range = document.createRange(); range.setStart(text, 3); range.collapse(true);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  })()`);
  await waitFor("window.lastLanding?.position === 'cursor'");

  // A text material on the shelf, opened in Shelf's side tab.
  const item = await evaluate<{ item_id: string }>(`fetch(${JSON.stringify(`/projects/${projectId}/api/plugins/io.molis.work.shelf/items`)}, { method: "POST", headers: molisWorkControlHeaders(),
    body: JSON.stringify({ filename: "访谈记录.md", mime: "text/markdown", bytes_base64: btoa(String.fromCharCode(...new TextEncoder().encode(${JSON.stringify(`# 访谈记录\n\n用户说：${MATERIAL}\n`)}))) }) })
    .then((response) => response.json()).then((body) => body.item)`);
  assert.ok(item?.item_id, "the material is on the shelf");
  // What the top document asks the Host for, to read where it says the thing in hand is; and, for the scene, what came back.
  await evaluate(`(() => { window.__asked = []; window.__answers = []; const original = window.fetch;
    window.fetch = async (...args) => {
      if (!String(args[0]).includes('/api/contextual/candidates')) return original(...args);
      const body = JSON.parse(args[1].body), answer = { at: Math.round(performance.now()), pane_id: body.pane_id, context_id: body.focus?.context_id ?? null };
      window.__asked.push(body); window.__answers.push(answer);
      try {
        const response = await original(...args);
        Object.assign(answer, { status: response.status, back_at: Math.round(performance.now()) });
        response.clone().json().then((out) => Object.assign(answer, { candidates: out?.plan?.candidates?.length ?? null,
          available: out?.plan?.candidates?.filter((item) => item.available).length ?? null, plan_context_id: out?.plan?.context_id ?? null }),
        (error) => { answer.unreadable = String(error); });
        return response;
      } catch (error) { answer.error = String(error); throw error; }
    }; })()`);
  await evaluate(`document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: ${JSON.stringify(SHELF_TAB)}, target: { item: ${JSON.stringify(item.item_id)} } } }))`);
  await shelf.waitFor(`Boolean(document.querySelector('[data-shelf-read] .shelf-reading')?.textContent.includes(${JSON.stringify(MATERIAL)}))`, 20_000);

  // AC-S04: selected in the side tab, the bar stands beside the passage in that tab's own document, with its actions.
  const selectInShelf = async () => { await shelf.evaluate(`(() => { const doc = document, body = doc.querySelector('[data-shelf-read] .shelf-reading');
    const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT); let node; while ((node = walker.nextNode()) && !node.textContent.includes('离线也要能'));
    const start = node.textContent.indexOf('离线'), range = doc.createRange(); range.setStart(node, start); range.setEnd(node, start + 9);
    const selection = doc.getSelection(); selection.removeAllRanges(); selection.addRange(range); doc.dispatchEvent(new Event('selectionchange')); })()`);

  };
  return { ...browser, item, selectInShelf, capture, pages, shelf };
}

test("W3-C AC-S04: a passage selected in Shelf's side tab is in hand there; the bar follows to the left and goes when the panel closes", { timeout: 150_000 }, async (t) => {
  const fixture = await shelfBesidePages(t);
  if (!fixture) return;
  const { evaluate, waitFor, item, selectInShelf, capture, pages, shelf } = fixture;
  await selectInShelf();
  await noteSceneOnTimeout(t, evaluate, waitFor(`Boolean(${SHELF}.contentDocument.querySelector(${JSON.stringify(`${BAR} .mw-btn[data-key]`)}))`, 15_000));
  const selectionRect = await shelf.evaluate("getSelection().getRangeAt(0).getBoundingClientRect().toJSON()");
  const placed = await evaluate<{ inTop: boolean; inView: boolean; beside: boolean }>(`(() => { const doc = ${SHELF}.contentDocument, bar = doc.querySelector(${JSON.stringify(BAR)}).getBoundingClientRect();
    const selected = ${JSON.stringify(selectionRect)}, frame = doc.querySelector('iframe[data-plugin-frame]').getBoundingClientRect(), passage = {top: frame.top + selected.top, bottom: frame.top + selected.bottom};
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
  await shelf.evaluate("getSelection().removeAllRanges(); document.dispatchEvent(new Event('selectionchange'));");
  await pages.evaluate(`(() => { const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
    const text = [...editor.querySelectorAll('p')].find(node => node.textContent === '再安排发布。').firstChild;
    const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, text.length);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange')); })()`);
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(`${BAR} [data-key]`)})) && !${SHELF}.contentDocument.querySelector(${JSON.stringify(BAR)})`, 15_000);
  await capture("2-bar-back-on-the-left");

  // In hand on the right again (the left's bar goes), then the panel closed: the bar goes with it.
  await selectInShelf();
  await noteSceneOnTimeout(t, evaluate, waitFor(`Boolean(${SHELF}.contentDocument.querySelector(${JSON.stringify(`${BAR} .mw-btn[data-key]`)})) && !document.querySelector(${JSON.stringify(BAR)})`, 15_000));
  await evaluate("document.dispatchEvent(new CustomEvent('molis:side-close'))");
  await waitFor(`document.body.dataset.sideOpen === 'false' && !${SHELF}.contentDocument.querySelector(${JSON.stringify(BAR)}) && !document.querySelector(${JSON.stringify(BAR)})`, 10_000);
});

test("W3-C2: hovering 「插入到光标处」 on the side tab's own bar, or in its 「更多」 menu, flashes the landing on the left", { timeout: 150_000 }, async (t) => {
  const fixture = await shelfBesidePages(t);
  if (!fixture) return;
  const { command, sessionId, evaluate, waitFor, selectInShelf, pages } = fixture;
  // Pages draws its flash line only for a person who has not asked for reduced motion.
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] }, sessionId);
  // Every flash asked of the top document, and every flash line Pages draws there.
  await evaluate("window.flashAsked = 0; document.addEventListener('molis:surface-landing-flash', () => { window.flashAsked += 1; }, true);");
  await pages.evaluate(`(() => { window.flashLines = 0; new MutationObserver((records) => { for (const record of records) for (const node of record.addedNodes) if (node.classList?.contains('pages-landing-flash')) window.flashLines += 1; })
      .observe(document.body, { childList: true, subtree: true }); })()`);
  await selectInShelf();
  const offer = (scope: string) => `[...${SHELF}.contentDocument.querySelectorAll(${JSON.stringify(`${scope} [data-key^='attach.']`)})].find(node => node.textContent.includes('插入到光标处'))`;
  const onBar = offer(".mw-ctx:not(.mw-ctx--static):not([hidden])"), inMenu = offer(".mw-ctx-menu");
  await waitFor(`${onBar} !== undefined`, 15_000);
  // A point inside the side tab's frame, in the top page's coordinates: the pointer reaches the frame's bar as a person's would.
  const moveTo = async (expression: string) => {
    const point = await evaluate<{ x: number; y: number }>(`(() => { const frame = ${SHELF}.getBoundingClientRect(), rect = (${expression}).getBoundingClientRect();
      return { x: frame.left + rect.left + rect.width / 2, y: frame.top + rect.top + rect.height / 2 }; })()`);
    await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y }, sessionId);
    return point;
  };
  const away = () => command("Input.dispatchMouseEvent", { type: "mouseMoved", x: 700, y: 700 }, sessionId);

  await moveTo(onBar);
  await waitFor("window.flashAsked === 1", 5_000);
  await pages.waitFor("window.flashLines === 1", 5_000);
  await pages.waitFor("document.querySelector('.pages-landing-flash') === null", 5_000);
  await away();

  // The same offer in the tab's 「更多」 menu.
  const more = await moveTo(`${SHELF}.contentDocument.querySelector('.mw-ctx:not(.mw-ctx--static):not([hidden]) [data-more]')`);
  for (const type of ["mousePressed", "mouseReleased"]) await command("Input.dispatchMouseEvent", { type, x: more.x, y: more.y, button: "left", clickCount: 1 }, sessionId);
  await waitFor(`${inMenu} !== undefined`, 5_000);
  await moveTo(inMenu);
  await waitFor("window.flashAsked === 2", 5_000);
  await pages.waitFor("window.flashLines === 2", 5_000);
  assert.equal(await pages.evaluate<string>("document.querySelector('[data-pages-editor] .ProseMirror').textContent"), "先完成核心体验。再安排发布。", "a flash writes nothing");
});
