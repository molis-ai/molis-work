import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";

// specs/context-program §21.8 B-6 (W3-B3): the Pages document open in a split pane is a landing too. Its frame reports the
// landing up to the top document, which raises it on that frame; a passage in hand on the right is offered 「插入到光标处」,
// the preview stands in the pane at the place the person left, and confirming writes it through the Host. A landing posted
// by any window that is not one of the panes is dropped.
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const paneText = "(document.querySelector('[data-pages-editor] .ProseMirror')?.textContent ?? '')";
const PANE = "document.querySelector('[data-tab-pane].is-focused')";

test("PANE-LAND-01, PANE-LAND-02 (W3-B3, S-30): a passage selected in the right panel is put at the cursor of the Pages document in a split pane, after a preview in that pane", { timeout: 150_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const child = await pluginFrameBrowser(t, browser, "pages");
  const pane = await pluginFrameBrowser(t, browser, "pages", undefined, '[data-tab-pane].is-focused iframe[data-plugin-frame="pages"]');
  const otherPane = await pluginFrameBrowser(t, browser, "pages", undefined, '[data-tab-pane]:not(.is-focused) iframe[data-plugin-frame="pages"]');
  const store = openPagesStore(homeDirectory);
  const left = store.create({ project_id: projectId!, title: "发布计划", body: { type: "doc", content: [paragraph("先完成核心体验。"), paragraph("再安排发布。")] } });
  const right = store.create({ project_id: projectId!, title: "访谈记录", body: { type: "doc", content: [paragraph("用户说：离线也要能记下想法。")] } });
  store.close();
  const capture = async (name: string) => { const directory = join(process.cwd(), `${REVIEW_EVIDENCE}/context-landing`); await mkdir(directory, { recursive: true });
    const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId); await writeFile(join(directory, name + ".png"), Buffer.from(shot.data, "base64")); };
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: "if (window.parent === window) document.addEventListener('molis:surface-landing', (event) => { window.landings = [...(window.landings || []), { detail: event.detail, paneId: event.target instanceof Element ? (event.target.closest('[data-tab-pane]')?.dataset.tabPane || event.target.dataset.paneOwner || '') : '' }]; });" }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${left.id}` }, sessionId));
  await child.waitFor("document.querySelector('[data-pages-title]')?.value === '发布计划'");
  await click("[data-layout-open]");
  await click("[data-layout-split=right]");
  await waitFor("document.querySelectorAll('[data-tab-pane]').length === 2 && document.querySelectorAll('iframe.tab-content-frame').length === 0", 15_000);
  await pane.waitFor(`${paneText}.includes('先完成核心体验')`, 20_000);

  // PANE-LAND-02 (S-30): anything that is not a trusted side pane frame cannot post a workbench-surface-landing message —
  // neither top window, a stray iframe, nor a forged iframe[data-pane-owner] outside #side-panel.
  await waitFor(`(window.landings || []).some(item => item.detail?.position === 'end' && item.paneId === (${PANE})?.dataset.tabPane)`, 10_000);
  const probeTitle = `landing-source-${left.id}`;
  const probeLandings = `window.landings.filter(item => item.detail?.object?.title === ${JSON.stringify(probeTitle)})`;
  await evaluate(`(() => {
    const paneEl = ${PANE};
    const original = window.landings.findLast(item => item.detail?.position === 'end' && item.paneId === paneEl.dataset.tabPane).detail;
    const probe = window.__paneLandingProbe = { payload: { ...original, pane_id: '', object: { ...original.object, title: ${JSON.stringify(probeTitle)} } }, received: [] };
    const stray = document.createElement('iframe'); document.body.append(stray);
    const forgedMain = document.createElement('iframe'); forgedMain.dataset.paneOwner = paneEl.dataset.tabPane; document.body.append(forgedMain);
    const observe = (event) => {
      if (event.origin !== location.origin || event.data?.type !== 'workbench-surface-landing' || event.data.landing?.object?.title !== probe.payload.object.title) return;
      probe.received.push(event.source === window ? 'top' : event.source === stray.contentWindow ? 'stray' : event.source === forgedMain.contentWindow ? 'forged-main' : 'other');
    };
    window.addEventListener('message', observe);
    const message = { type: 'workbench-surface-landing', landing: probe.payload };
    const sendFrom = (frame) => {
      const script = frame.contentDocument.createElement('script');
      script.textContent = 'parent.postMessage(' + JSON.stringify(message) + ', parent.location.origin)';
      frame.contentDocument.body.append(script); script.remove();
    };
    probe.cleanup = () => { window.removeEventListener('message', observe); stray.remove(); forgedMain.remove(); delete window.__paneLandingProbe; };
    window.postMessage(message, location.origin);
    sendFrom(stray);
    sendFrom(forgedMain);
  })()`);
  await waitFor("window.__paneLandingProbe.received.length >= 3");
  assert.deepEqual(await evaluate("window.__paneLandingProbe.received.slice().sort()"), ["forged-main", "stray", "top"], "all three non-side-pane messages reached the production listener");
  assert.deepEqual(await evaluate(probeLandings), [], "S-30 drops landings posted by top window, stray iframe, or forged main iframe[data-pane-owner]");
  await evaluate("window.__paneLandingProbe.cleanup()");

  // PANE-LAND-01: in the pane, the person leaves the cursor after 「先完成」: the pane's frame raises the landing in the top document.
  await pane.click("[data-pages-editor] .ProseMirror p");
  await pane.evaluate(`(() => {
    const doc = document, editor = doc.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
    const text = [...editor.querySelectorAll('p')].find(node => node.textContent === '先完成核心体验。').firstChild;
    const range = doc.createRange(); range.setStart(text, 3); range.collapse(true);
    const selection = doc.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  })()`);
  await waitFor(`window.landings.some(item => item.detail?.position === 'cursor' && item.detail?.targets?.[0]?.anchor === 4 && item.paneId === (${PANE})?.dataset.tabPane)`, 10_000);
  const landing = await evaluate<{ detail: { object: { id: string }; targets: { anchor: number }[] }; paneId: string }>(`window.landings.findLast(item => item.detail?.position === 'cursor' && item.detail?.targets?.[0]?.anchor === 4 && item.paneId === (${PANE})?.dataset.tabPane)`);
  assert.equal(landing.detail.object.id, left.id);
  assert.equal(landing.detail.targets[0]!.anchor, 4, "after 「先完成」 in the first paragraph");
  assert.notEqual(landing.paneId, "main", "named by the split pane it came from");

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

  // The preview stands in the owning split pane only; the sibling pane and outer chrome preview nothing and nothing is written yet.
  await pane.waitFor(`document.querySelector('.pages-landing-preview')?.textContent === '离线也要能记下想法'`, 10_000);
  assert.equal(await otherPane.evaluate<boolean>("document.querySelector('.pages-landing-preview') === null"), true, "the sibling pane previews nothing");
  assert.equal(await evaluate<boolean>("document.querySelector('.pages-landing-preview') === null"), true, "the top document previews nothing");
  assert.equal(await pane.evaluate<string>(paneText), "先完成核心体验。再安排发布。", "the document is unchanged under the preview");
  await capture("pane-1-preview-in-pane");
  await pane.click(".pages-pop .mw-btn--primary");
  await pane.waitFor(`${paneText} === '先完成离线也要能记下想法核心体验。再安排发布。'`, 10_000);
  await capture("pane-2-written");
  const saved = openPagesStore(homeDirectory);
  try { assert.match(JSON.stringify(saved.get(left.id, projectId!).body), /先完成离线也要能记下想法核心体验。/u); } finally { saved.close(); }
});
