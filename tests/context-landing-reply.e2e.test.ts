import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test from "node:test";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages/testing";
import { ASSISTANT_REPLY_KIND } from "@molis-ai/molis-work-contracts/services/contextual";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";

// specs/context-program §21.2 item 6 (R23, AC-S15; BACKLOG BL-150): a passage selected in an Assistant reply is in hand like
// one selected anywhere else, so it goes into the Pages document open on the left, at its cursor, after a preview there.
// The reply is the Assistant's own object: `assistant_reply`, named by the work's title, with the ids the Host gave it.
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const editorText = "(document.querySelector('[data-pages-editor] .ProseMirror')?.textContent ?? '')";
const reply = "document.querySelector('.assistant-msg--assistant')";
const select = (node: string, words: string) => `(() => {
  const walker = document.createTreeWalker(${node}, NodeFilter.SHOW_TEXT);
  let text; while ((text = walker.nextNode()) && !text.textContent.includes(${JSON.stringify(words)}));
  const start = text.textContent.indexOf(${JSON.stringify(words)});
  const range = document.createRange(); range.setStart(text, start); range.setEnd(text, start + ${words.length});
  const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
})()`;

test("BL-150 AC-S15: a passage selected in an Assistant reply is put at the cursor of the Pages document on the left", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const child=await pluginFrameBrowser(t,browser,"pages");
  const store = openPagesStore(homeDirectory);
  const left = store.create({ project_id: projectId!, title: "发布计划", body: { type: "doc", content: [paragraph("先完成核心体验。"), paragraph("再安排发布。")] } });
  store.close();
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: "document.addEventListener('molis:surface-landing', (event) => { window.lastLanding = event.detail; }); document.addEventListener('molis:surface-focus', (event) => { window.lastFocus = event.detail; });" }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${left.id}` }, sessionId));
  await child.waitFor("document.querySelector('[data-pages-title]')?.value === '发布计划'");

  // A work whose reply has the words to put on the left.
  await issueModel(t, homeDirectory, { replyText: "用户说：离线也要能记下想法。" });
  await click("[data-assistant-input]");
  await command("Input.insertText", { text: "把访谈里最要紧的一句话找出来" }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await waitFor(`${reply}?.textContent.includes('离线也要能记下想法')`, 20_000);

  // The reply names itself by the ids the Host gave it (work, round, turn) and by the work's title; a reload gives the same.
  const named = async () => {
    await waitFor(`${reply}?.hasAttribute('data-assistant-context') && document.querySelector('[data-assistant-work-title]')?.textContent !== '新工作'`, 15_000);
    return evaluate<{ plugin_id: string; object: { kind: string; id: string; title: string }; round: string; entry: string; title: string }>(`(() => {
      const bubble = ${reply};
      return { ...JSON.parse(bubble.getAttribute('data-assistant-context')), round: bubble.closest('[data-round]').dataset.round,
        entry: bubble.getAttribute('data-entry'), title: document.querySelector('[data-assistant-work-title]').textContent };
    })()`);
  };
  const first = await named();
  assert.equal(first.plugin_id, "assistant");
  assert.equal(first.object.kind, ASSISTANT_REPLY_KIND);
  const [workId, runId, turnId] = first.object.id.split(":");
  assert.ok(workId, "the work it belongs to");
  assert.equal(runId, first.round, "the round's run id");
  assert.equal(`t:${turnId}`, first.entry, "the turn id the Host gave the reply");
  assert.equal(first.object.title, first.title, "the work's title, as the Assistant has it");
  await navigate(() => command("Page.reload", {}, sessionId));
  await child.waitFor("document.querySelector('[data-pages-title]')?.value === '发布计划'");
  // A reload leaves the panel closed: the person opens the work again, and the reply is there to select.
  await evaluate(`document.dispatchEvent(new CustomEvent('molis:assistant-open', { detail: { work_id: ${JSON.stringify(workId)} } }))`);
  await waitFor(`${reply}?.checkVisibility() === true`, 15_000);
  assert.equal((await named()).object.id, first.object.id, "the same reply has the same id after a reload");

  // The person leaves the cursor in the document on the left: that is where it lands.
  await child.evaluate(`(() => {
    const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus();
    const text = [...editor.querySelectorAll('p')].find(node => node.textContent === '先完成核心体验。').firstChild;
    const range = document.createRange(); range.setStart(text, 3); range.collapse(true);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  })()`);
  await waitFor("window.lastLanding?.position === 'cursor'");

  // The person's own message is not in hand; the reply's words are, from the Assistant's place.
  await evaluate("window.lastFocus = 'none'");
  await evaluate(select("document.querySelector('.assistant-msg--user')", "访谈"));
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.equal(await evaluate<string>("window.lastFocus"), "none", "nothing is in hand from the person's own message");
  await evaluate(select(reply, "离线也要能记下想法"));
  await waitFor(`window.lastFocus?.object?.kind === ${JSON.stringify(ASSISTANT_REPLY_KIND)}`);
  assert.equal(await evaluate<string>("window.lastFocus.plugin_id"), "assistant");
  assert.equal(await evaluate<string>("window.lastFocus.targets[0].text"), "离线也要能记下想法");

  const attach = ".mw-ctx:not(.mw-ctx--static) [data-key^='attach.'], .mw-ctx-menu [data-key^='attach.']";
  await waitFor(`document.querySelector(".mw-ctx:not(.mw-ctx--static):not([hidden]) [data-key]") !== null`, 15_000);
  if (!await evaluate<boolean>(`document.querySelector(${JSON.stringify(attach)}) !== null`)) await evaluate(`document.querySelector('.mw-ctx:not(.mw-ctx--static) [data-more]')?.click()`);
  await waitFor(`[...document.querySelectorAll(${JSON.stringify(attach)})].some(node => node.textContent.includes('插入到光标处'))`, 10_000);
  await evaluate(`[...document.querySelectorAll(${JSON.stringify(attach)})].find(node => node.textContent.includes('插入到光标处')).click()`);

  // The preview stands at the landing, in Pages; nothing is written before the person confirms.
  await child.waitFor("document.querySelector('.pages-landing-preview')?.textContent === '离线也要能记下想法'", 10_000);
  assert.equal(await child.evaluate<string>(editorText), "先完成核心体验。再安排发布。", "the document is unchanged under the preview");
  await child.evaluate(`[...document.querySelectorAll('.pages-pop .mw-btn--primary')].find(node => node.textContent === '放进去').click()`);
  await child.waitFor(`${editorText} === '先完成离线也要能记下想法核心体验。再安排发布。'`, 10_000);
  const saved = openPagesStore(homeDirectory);
  try { assert.match(JSON.stringify(saved.get(left.id, projectId!).body), /先完成离线也要能记下想法核心体验。/u); } finally { saved.close(); }
});
