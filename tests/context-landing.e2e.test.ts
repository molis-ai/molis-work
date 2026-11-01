import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";

// specs/context-program §21.8 (W3-B1): a passage in hand on the right goes into the Pages document open on the left, at the
// place the person left in it. Pages reports the landing; the row offers 「插入到光标处」; Pages previews it at that place;
// confirming writes it through the Host with the saved version, and the document shows it.
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const editorText = "(document.querySelector('[data-pages-editor] .ProseMirror')?.textContent ?? '')";

test("W3-B1: a passage selected in the right panel is put at the cursor of the Pages document on the left, after a preview there", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId, homeDirectory } = browser;
  const child=await pluginFrameBrowser(t,browser,"pages");
  const store = openPagesStore(homeDirectory);
  const left = store.create({ project_id: projectId!, title: "发布计划", body: { type: "doc", content: [paragraph("先完成核心体验。"), paragraph("再安排发布。")] } });
  const right = store.create({ project_id: projectId!, title: "访谈记录", body: { type: "doc", content: [paragraph("用户说：离线也要能记下想法。")] } });
  store.close();
  const capture = async (name: string) => { const directory = join(process.cwd(), `${REVIEW_EVIDENCE}/context-landing`); await mkdir(directory, { recursive: true });
    const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId); await writeFile(join(directory, name + ".png"), Buffer.from(shot.data, "base64")); };
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: "document.addEventListener('molis:surface-landing', (event) => { window.lastLanding = event.detail; });" }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${left.id}` }, sessionId));
  await child.waitFor("document.querySelector('[data-pages-title]')?.value === '发布计划'");

  // Untouched, the landing is the end of the document; once the person is in it, it is the cursor.
  await waitFor("window.lastLanding?.position === 'end'");
  await child.evaluate(`(() => {
    const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
    const text = [...editor.querySelectorAll('p')].find(node => node.textContent === '先完成核心体验。').firstChild;
    const range = document.createRange(); range.setStart(text, 3); range.collapse(true);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  })()`);
  await waitFor("window.lastLanding?.position === 'cursor'");
  const landing = await evaluate<{ object: { id: string }; version: number; targets: { anchor: number; head: number }[] }>("window.lastLanding");
  assert.equal(landing.object.id, left.id);
  assert.equal(landing.targets[0]!.anchor, 4, "after 「先完成」 in the first paragraph");

  // The other document, shown in the right panel's file preview; a passage selected there is what is in hand.
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
  const attach = ".mw-ctx:not(.mw-ctx--static) [data-key^='attach.'], .mw-ctx-menu [data-key^='attach.']";
  await waitFor(`document.querySelector(".mw-ctx:not(.mw-ctx--static):not([hidden]) [data-key]") !== null`, 15_000);
  if (!await evaluate<boolean>(`document.querySelector(${JSON.stringify(attach)}) !== null`)) await evaluate(`document.querySelector('.mw-ctx:not(.mw-ctx--static) [data-more]')?.click()`);
  await waitFor(`[...document.querySelectorAll(${JSON.stringify(attach)})].some(node => node.textContent.includes('插入到光标处'))`, 10_000);
  await capture("1-row-offers-attach");
  await evaluate(`[...document.querySelectorAll(${JSON.stringify(attach)})].find(node => node.textContent.includes('插入到光标处')).click()`);

  // The preview stands at the landing, in Pages; nothing is written before the person confirms.
  await child.waitFor("document.querySelector('.pages-landing-preview')?.textContent === '离线也要能记下想法'", 10_000);
  assert.equal(await child.evaluate<string>(editorText), "先完成核心体验。再安排发布。", "the document is unchanged under the preview");
  await capture("2-preview-at-landing");
  await child.evaluate(`[...document.querySelectorAll('.pages-pop .mw-btn--primary')].find(node => node.textContent === '放进去').click()`);
  await child.waitFor(`${editorText} === '先完成离线也要能记下想法核心体验。再安排发布。'`, 10_000);
  assert.equal(await child.evaluate<boolean>("document.querySelector('.pages-landing-preview') === null"), true, "the preview is gone");
  await capture("3-written");
  const saved = openPagesStore(homeDirectory);
  try { assert.match(JSON.stringify(saved.get(left.id, projectId!).body), /先完成离线也要能记下想法核心体验。/u); } finally { saved.close(); }
});

test("RAC-1983: what the landing reports about the cursor and the selection never starts or ends with half a character", { timeout: 120_000 }, async (t) => {
  // landing-editor.ts reports the 200 units before and after the cursor and the first 4000 units of a selection. One 🟢 is one character but two UTF-16 units.
  const wide = (count: number) => "🟢".repeat(count);
  const first = wide(150) + "m".repeat(199) + "n".repeat(199) + wide(1) + "tail", second = "a" + wide(2500);
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId, homeDirectory } = browser;
  const child = await pluginFrameBrowser(t, browser, "pages");
  const store = openPagesStore(homeDirectory);
  const page = store.create({ project_id: projectId!, title: "Landing windows", body: { type: "doc", content: [paragraph(first), paragraph(second)] } });
  store.close();
  await command("Page.addScriptToEvaluateOnNewDocument", { source: "document.addEventListener('molis:surface-landing', (event) => { window.lastLanding = event.detail; });" }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${page.id}` }, sessionId));
  await child.waitFor("document.querySelector('[data-pages-title]')?.value === 'Landing windows'");
  await waitFor("window.lastLanding?.position === 'end'");
  // Put the DOM selection from one offset to another in the paragraph of `units` UTF-16 units, the way the person's pointer would.
  const place = (units: number, from: number, to: number) => child.evaluate(`(() => {
    const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
    const text = [...editor.querySelectorAll('p')].find(node => node.textContent.length === ${units}).firstChild;
    const range = document.createRange(); range.setStart(text, ${from}); range.setEnd(text, ${to});
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  })()`);
  const shape = (value: string, expected: string) => ({ units: value.length, characters: [...value].length, same: value === expected });
  type Landing = { targets: { text: string; truncated?: boolean }[]; surroundings: { before: string; after: string } };
  // The cursor after 499 units of the first paragraph: the 200 units before it start in the middle of the 150th 🟢, the 200 after it end in the middle of the last one.
  await place(first.length, 499, 499);
  await waitFor("window.lastLanding?.position === 'cursor'");
  const cursor = await evaluate<Landing>("window.lastLanding");
  assert.deepEqual(shape(cursor.surroundings.before, "m".repeat(199)), { units: 199, characters: 199, same: true }, "the text before the cursor starts at the first whole character");
  assert.deepEqual(shape(cursor.surroundings.after, "n".repeat(199)), { units: 199, characters: 199, same: true }, "the text after the cursor ends at the last whole character");
  // The whole second paragraph selected: 5001 units, of which the report keeps the first 4000.
  await place(second.length, 0, second.length);
  await waitFor("window.lastLanding?.position === 'selection'");
  const selected = await evaluate<Landing>("window.lastLanding");
  assert.deepEqual(shape(selected.targets[0]!.text, "a" + wide(1999)), { units: 3999, characters: 2000, same: true }, "unit 4000 was the first half of a 🟢: it is not kept");
  assert.equal(selected.targets[0]!.truncated, true);
  // RAC-1984: the cursor after one plain character and 100 🟢: both windows are 100 whole 🟢, and are kept as they are.
  await place(second.length, 201, 201);
  await waitFor("window.lastLanding?.position === 'cursor'");
  const whole = await evaluate<Landing>("window.lastLanding");
  assert.deepEqual(shape(whole.surroundings.before, wide(100)), { units: 200, characters: 100, same: true });
  assert.deepEqual(shape(whole.surroundings.after, wide(100)), { units: 200, characters: 100, same: true });
});
