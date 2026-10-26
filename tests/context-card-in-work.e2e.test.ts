import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test from "node:test";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// W3-A3a (specs/context-program §21.2 item 5): a write chosen on the toolbar goes, as a card, into the work the person is
// on when the Assistant's panel is open and that work holds the object; the work shows the card at once. With the panel
// closed, the same choice starts a new work as before.
const TEXTS = ["联系阿杰确认秋季发布计划。", "联系小王确认周末徒步路线。", "联系小李确认预算说明。"];
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const BAR = ".mw-ctx:not(.mw-ctx--static):not([hidden]):not([data-away])";
// A write that goes as a card (记成待办 is made at once since W4-1): a plan broken into Goal steps, a proposal.
const WRITE = `[...document.querySelectorAll('${BAR} button,.mw-ctx-menu button')].find(button => !button.disabled && button.textContent.startsWith('拆成目标步骤'))`;

test("W3-A3a: a write chosen on the page goes into the open work that holds the object; with the panel closed, into a new one", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const child=await pluginFrameBrowser(t,browser,"pages");
  const { command, sessionId, navigate, evaluate, waitFor, click, origin, projectId, homeDirectory } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  const pages = openPagesStore(homeDirectory);
  const page = (() => { try { return pages.create({ project_id: projectId!, title: "发布笔记", body: { type: "doc", content: TEXTS.map(paragraph) } }); } finally { pages.close(); } })();
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${page.id}` }, sessionId));
  await child.waitFor(`document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes(${JSON.stringify(TEXTS[2])})`);
  // The same document in the right panel's file preview, beside the Assistant's panel: what is selected there is in hand.
  await evaluate(`document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'files', target: { subject: { kind: 'pages_document', id: ${JSON.stringify(page.id)} } } } }))`);
  await waitFor(`document.querySelector('[data-side-files-body]')?.textContent.includes(${JSON.stringify(TEXTS[2])})`, 20_000);
  // Every card the page places, with what it asked for.
  await evaluate(`(() => {
    const original = window.fetch; window.placed = [];
    window.fetch = async (url, options) => {
      const response = await original(url, options);
      if (String(url).endsWith('/api/assistant/cards')) window.placed.push({ asked: JSON.parse(options.body), ...(await response.clone().json()) });
      return response;
    };
  })()`);
  const choose = async (index: number) => {
    await evaluate(`(() => {
      const body = document.querySelector('[data-side-files-body]'), walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      let node; while ((node = walker.nextNode()) && !node.textContent.includes(${JSON.stringify(TEXTS[index])}));
      const start = node.textContent.indexOf(${JSON.stringify(TEXTS[index])}), range = document.createRange();
      range.setStart(node, start); range.setEnd(node, start + ${TEXTS[index]!.length});
      // Selecting with the mouse moves focus into the preview (off the Assistant's input, which has it once the panel is open);
      // without that the preview reports only when the click on 更多 takes focus, and that new report closes the menu it opened.
      body.focus({ preventScroll: true });
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    })()`);
    await waitFor(`document.querySelector('${BAR} [data-more]')`, 10_000);
    await click(`${BAR} [data-more]`);
    await waitFor(`Boolean(${WRITE})`, 10_000);
    await evaluate(`${WRITE}.click()`);
    await waitFor(`window.placed.length === ${index + 1}`, 15_000);
    return evaluate<{ asked: { work_id?: string }; work_id: string; card: { card_id: string } }>(`window.placed[${index}]`);
  };
  const thread = () => `document.querySelector('[data-assistant-panel]:not([hidden])') && [...document.querySelectorAll('[data-assistant-thread] > [data-card]')].map(node => node.dataset.card)`;

  // Panel closed: a new work, and the panel opens on it with the card.
  const first = await choose(0);
  assert.equal(first.asked.work_id, undefined, "nothing to go into yet");
  await waitFor(`(${thread()} || []).includes(${JSON.stringify(first.card.card_id)})`, 15_000);

  // The panel is open on that work, which holds the document (the card came from it): the next write goes in there and shows now.
  const second = await choose(1);
  assert.equal(second.asked.work_id, first.work_id, "the page asked for the work on show");
  assert.equal(second.work_id, first.work_id, "the Host placed it there");
  await waitFor(`JSON.stringify(${thread()}) === ${JSON.stringify(JSON.stringify([first.card.card_id, second.card.card_id]))}`, 10_000);

  // Panel closed again: nobody answers, and the write starts a new work as before.
  await evaluate("document.querySelector('[data-assistant-panel-close]').click()");
  await waitFor("document.querySelector('[data-assistant-panel]').hidden");
  const third = await choose(2);
  assert.equal(third.asked.work_id, undefined, "no answer with the panel closed");
  assert.notEqual(third.work_id, first.work_id);
});
