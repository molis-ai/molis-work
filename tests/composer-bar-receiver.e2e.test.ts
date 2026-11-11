import assert from "node:assert/strict";
import test from "node:test";
import { renderComposer } from "@molis-ai/molis-work-plugin-sdk/ui";
import { COMPOSER_AI_LABELS } from "./fixtures/composer-labels.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

// One input (specs/unified-input-voice/spec.md §10.3, O2): a sandboxed page's AI composer is a receiver of the bar's one input,
// not a second box. A probe composer is mounted in a real plugin frame (lingguang's), as a plugin page mounts one; the bar takes it
// while that page is in front, and the frame bridge carries only plain data each way (apps/workbench/src/browser/plugin-frame/
// composer-bridge.ts). The refusals at the end are S-composer-source-call item 5's for the bridge.

const BAR = "document.querySelector('[data-assistant-island]')";
const BOX = BAR + ".querySelector('.mw-composer__input')";
const PROBE_LABEL = '<img src=x onerror="globalThis.pwned=1">探针会话';

const probe = () => {
  const first = renderComposer({ kind: "ai", labels: COMPOSER_AI_LABELS, placeholder: "写给探针…" });
  return `(() => {
    const root = document.createElement("div"); root.id = "probe"; root.innerHTML = ${JSON.stringify(first)}; document.body.prepend(root);
    const seen = globalThis.seen = { drafts: [], sent: [], acts: [] }; let draft = "";
    globalThis.probe = window.molisComposer(root, { kind: "ai", entry: "probe", labels: ${JSON.stringify(COMPOSER_AI_LABELS)}, sources: true,
      near: () => ({ kind: "composernotes.note", id: "n1", plugin_id: "io.molis.work.someone-else" }),
      draft: { adapter: { read: async () => draft, write: async (text) => { draft = text; seen.drafts.push(text); } } },
      receiver: () => ({ label: ${JSON.stringify(PROBE_LABEL)}, icon: "code" }),
      controls: [{ kind: "select", id: "mode", label: "方式", value: "a", options: [{ value: "a", label: "甲" }, { value: "b", label: "乙" }], change: (value) => seen.acts.push(value) }],
      commands: [{ slash: "probe", label: "探针命令", add: false, run: () => seen.acts.push("command") }],
      submit: async (input) => { seen.sent.push({ text: input.text, controls: input.controls }); return { state: "sent" }; } });
  })()`;
};

test("UIV-21 UIV-22 S-composer-source-call item 5: a framed page's AI composer is the bar's receiver, carried as plain data, and acts on the bar only while in front", { timeout: 180_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "lingguang");
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/` }, browser.sessionId));
  await browser.waitFor("document.body.dataset.desktopSurface === 'home'");
  await browser.click("[data-plugin-picker-popover] [data-plugin-id=lingguang]");
  await child.waitFor("typeof window.molisComposer === 'function' && !document.querySelector('[data-work-surface=lingguang]').hidden");
  await child.evaluate(probe());

  // UIV-21: the page draws no box of its own; the bar takes it, under the page's own name, words and controls.
  await browser.waitFor(`${BAR}.dataset.receiver === 'page'`);
  assert.deepEqual(await child.evaluate("(() => { const root = document.querySelector('#probe'); return [root.hasAttribute('data-composer-remote'), getComputedStyle(root).display]; })()"), [true, "none"]);
  assert.deepEqual(await browser.evaluate(`(() => { const to = ${BAR}.querySelector('.mw-composer__to'); return [to.textContent, to.querySelectorAll('img').length, ${BOX}.placeholder, typeof globalThis.pwned]; })()`),
    ["发给：" + PROBE_LABEL, 0, "写给探针…", "undefined"], "the page's words are text in the bar, never markup");
  const pluginId = await child.evaluate<string>("document.body.dataset.pluginId");
  assert.deepEqual(await browser.evaluate("(() => { const options = globalThis.molisBarReceivers.front().options; return [options.sources, options.near()]; })()"),
    [false, { kind: "composernotes.note", id: "n1", plugin_id: pluginId }], "no sources for a framed page, and its object is its own plugin's");

  // UIV-22: what the person does in the bar reaches the page as plain data: a control, a command, the text and its draft, a send.
  await browser.evaluate(`(() => { const select = ${BAR}.querySelector('[data-composer-control=mode]'); select.value = 'b'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await child.waitFor("seen.acts.includes('b')");
  await browser.evaluate(`(() => { const box = ${BOX}; box.focus(); box.value = '你好，探针'; box.dispatchEvent(new InputEvent('input', { bubbles: true, data: '针', inputType: 'insertText' })); })()`);
  await child.waitFor("document.querySelector('#probe .mw-composer__input').value === '你好，探针' && seen.drafts.at(-1) === '你好，探针'");
  await browser.evaluate(`${BAR}.querySelector('[data-composer-send]').click()`);
  await child.waitFor("seen.sent.length === 1");
  assert.equal(await child.evaluate("seen.sent[0].text"), "你好，探针");
  await browser.waitFor(`${BOX}.value === ''`);
  await child.waitFor("document.querySelector('#probe .mw-composer__input').value === ''");
  // The page writes into its own box (a prefill): the bar shows it.
  await child.evaluate("(() => { const box = document.querySelector('#probe .mw-composer__input'); box.value = '页面放进来的字'; box.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await browser.waitFor(`${BOX}.value === '页面放进来的字'`);

  // S-composer-source-call item 5: away from the page, the bar is the Assistant's; the page's text, insert, focus and send do nothing
  // to it, and the Assistant's words never reach the page.
  await browser.click(".bar-start [data-plugin-id=home]");
  await browser.waitFor(`!${BAR}.dataset.receiver && globalThis.molisBarReceivers.front() === null`);
  const assistantWords = await browser.evaluate<string>(`${BOX}.value`);
  await browser.evaluate(`(() => { const box = ${BOX}; box.value = '只给助理的字'; box.dispatchEvent(new InputEvent('input', { bubbles: true, data: '字', inputType: 'insertText' })); box.blur(); })()`);
  await child.evaluate(`(() => { const box = document.querySelector('#probe .mw-composer__input'); box.value = '偷偷写进去'; box.dispatchEvent(new Event('input', { bubbles: true }));
    probe.insert('偷偷插入'); probe.focus(); document.querySelector('#probe [data-composer-send]').click(); })()`);
  await new Promise(resolve => setTimeout(resolve, 800));
  assert.deepEqual(await browser.evaluate(`[${BOX}.value, document.activeElement === ${BOX}, ${BAR}.dataset.receiver ?? null]`), ["只给助理的字", false, null], "the hidden page cannot write, focus or send");
  assert.equal(await child.evaluate("document.querySelector('#probe .mw-composer__input').value"), "偷偷写进去", "the Assistant's words never reach the page");
  assert.equal(await child.evaluate("seen.sent.length"), 1, "no send of the page's own");
  await browser.evaluate(`(() => { const box = ${BOX}; box.value = ${JSON.stringify("")}; box.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  assert.equal(assistantWords, "", "the Assistant's box started empty here");
});
