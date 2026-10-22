import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";

// specs/context-program §21.8 B-6 (W3-B3): the Pages document open in a split pane is a landing too. Its frame reports the
// landing up to the top document, which raises it on that frame; a passage in hand on the right is offered 「插入到光标处」,
// the preview stands in the pane at the place the person left, and confirming writes it through the Host. A landing posted
// by any window that is not one of the panes is dropped.
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const paneText = "(document.querySelector('[data-pages-editor] .ProseMirror')?.textContent ?? '')";

test("PANE-LAND-01, PANE-LAND-02 (W3-B3, S-30): a passage selected in the right panel is put at the cursor of the Pages document in a split pane, after a preview in that pane", { timeout: 150_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const child=await pluginFrameBrowser(t,browser,"pages"), pane=await pluginFrameBrowser(t,browser,"pages","iframe[data-pane-owner]:not([hidden])");
  const store = openPagesStore(homeDirectory);
  const left = store.create({ project_id: projectId!, title: "发布计划", body: { type: "doc", content: [paragraph("先完成核心体验。"), paragraph("再安排发布。")] } });
  const right = store.create({ project_id: projectId!, title: "访谈记录", body: { type: "doc", content: [paragraph("用户说：离线也要能记下想法。")] } });
  store.close();
  const capture = async (name: string) => { const directory = join(process.cwd(), `${REVIEW_EVIDENCE}/context-landing`); await mkdir(directory, { recursive: true });
    const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId); await writeFile(join(directory, name + ".png"), Buffer.from(shot.data, "base64")); };
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: "if (window.parent === window) document.addEventListener('molis:surface-landing', (event) => { window.landings = [...(window.landings || []), { detail: event.detail, framed: event.target instanceof HTMLIFrameElement }]; });" }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${left.id}` }, sessionId));
  await child.waitFor("document.querySelector('[data-pages-title]')?.value === '发布计划'");
  await click("[data-titlebar-tabs] [data-tab-split]");
  await click("[data-layout-split=right]");
  await pane.waitFor(`${paneText}.includes('先完成核心体验')`, 20_000);

  // PANE-LAND-02: anything that is not one of the panes cannot report a landing, neither this document nor a frame that is not a pane.
  // The pane's page reports its own landing (the end) once it opens; wait for it, so it is not taken for a forged one.
  await waitFor("(window.landings || []).some(item => item.framed && item.detail?.position === 'end')", 10_000);
  const forged = { pane_id: "", plugin_id: "io.molis.work.pages", object: { kind: "pages_document", id: left.id, title: "发布计划" }, position: "end", version: 1, targets: [] };
  await evaluate(`(async () => {
    window.landings = [];
    window.postMessage({ type: 'workbench-surface-landing', landing: ${JSON.stringify(forged)} }, location.origin);
    const stray = document.createElement('iframe'); document.body.append(stray);
    // Posted by the stray frame's own script, so its window is the message's source.
    const script = stray.contentDocument.createElement('script');
    script.textContent = "parent.postMessage({ type: 'workbench-surface-landing', landing: " + ${JSON.stringify(JSON.stringify(forged))} + " }, parent.location.origin)";
    stray.contentDocument.body.append(script);
    await new Promise(resolve => setTimeout(resolve, 300)); stray.remove();
  })()`);
  assert.deepEqual(await evaluate("window.landings"), [], "a landing from a window that is not a pane is dropped");

  // PANE-LAND-01: in the pane, the person leaves the cursor after 「先完成」: the pane's frame raises the landing in the top document.
  await pane.evaluate(`(() => {
    const doc = document, editor = doc.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
    const text = [...editor.querySelectorAll('p')].find(node => node.textContent === '先完成核心体验。').firstChild;
    const range = doc.createRange(); range.setStart(text, 3); range.collapse(true);
    const selection = doc.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  })()`);
  await waitFor("window.landings.some(item => item.framed && item.detail?.position === 'cursor')", 10_000);
  const landing = await evaluate<{ detail: { object: { id: string }; pane_id: string; screen?: unknown; targets: { anchor: number }[] } }>("window.landings.findLast(item => item.framed)");
  assert.equal(landing.detail.object.id, left.id);
  assert.equal(landing.detail.targets[0]!.anchor, 4, "after 「先完成」 in the first paragraph");
  assert.notEqual(landing.detail.pane_id, "main", "named by the pane it came from");
  assert.equal("screen" in landing.detail, false, "where it is on the pane's screen stays in the pane");

  // The other document in the right panel's file preview; a passage selected there is in hand.
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
  await evaluate(`[...document.querySelectorAll(${JSON.stringify(attach)})].find(node => node.textContent.includes('插入到光标处')).dataset.testAttach='true'`);
  await click('[data-test-attach]');

  // The preview stands in the pane, at its landing; the top document shows none and nothing is written yet.
  await pane.waitFor(`document.querySelector('.pages-landing-preview')?.textContent === '离线也要能记下想法'`, 10_000);
  assert.equal(await evaluate<boolean>("document.querySelector('.pages-landing-preview') === null"), true, "the top document previews nothing");
  assert.equal(await pane.evaluate<string>(paneText), "先完成核心体验。再安排发布。", "the document is unchanged under the preview");
  await capture("pane-1-preview-in-pane");
  await pane.click(".pages-pop .mw-btn--primary");
  await pane.waitFor(`${paneText} === '先完成离线也要能记下想法核心体验。再安排发布。'`, 10_000);
  await capture("pane-2-written");
  const saved = openPagesStore(homeDirectory);
  try { assert.match(JSON.stringify(saved.get(left.id, projectId!).body), /先完成离线也要能记下想法核心体验。/u); } finally { saved.close(); }
});
