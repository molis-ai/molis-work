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
      receiver: () => ({ label: ${JSON.stringify(PROBE_LABEL)}, icon: "code", detail: "探针页", others: [{ id: "s2", label: "另一个探针", detail: "探针页" }], choose: (id) => seen.acts.push("choose:" + id) }),
      controls: [{ kind: "select", id: "mode", label: "方式", value: "a", options: [{ value: "a", label: "甲" }, { value: "b", label: "乙" }], change: (value) => seen.acts.push(value) }],
      commands: [{ slash: "probe", label: "探针命令", add: false, run: () => seen.acts.push("command") }],
      submit: async (input) => { seen.sent.push({ text: input.text, controls: input.controls }); return { state: "sent" }; } });
  })()`;
};

test("UIV-18 UIV-21 UIV-22 UIV-23 S-composer-source-call item 5: a framed page's AI composer is the bar's receiver, carried as plain data, and acts on the bar only while in front", { timeout: 180_000 }, async (t) => {
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
    [false, { kind: "composernotes.note", id: "n1", plugin_id: pluginId }], "no sources for a framed page even though the page passed sources: true, and its object is its own plugin's");

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
  // UIV-23 (O4): the tag opens 「发给」 — this page's receiver, the Assistant (a new conversation) and the page's other receivers.
  const MENU = "document.querySelector('[data-assistant-send-to]')";
  const pick = (label: string) => browser.evaluate(`[...${MENU}.querySelectorAll('[role=menuitemradio]')].find(item => item.textContent.includes(${JSON.stringify(label)})).click()`);
  const openMenu = async () => { await browser.evaluate(`${BAR}.querySelector('[data-composer-receiver]').click()`); await browser.waitFor(`${MENU}.matches(':popover-open')`); };
  await openMenu();
  assert.deepEqual(await browser.evaluate(`[[...${MENU}.querySelectorAll('.mw-menu__label')].map(node => node.textContent), [...${MENU}.querySelectorAll('[role=menuitemradio]')].map(item => item.getAttribute('aria-checked') + ':' + item.querySelector('[data-slot=menu-item-label] > span').textContent), ${MENU}.querySelectorAll('img').length]`),
    [["这一页", "助理", "别的会话"], ["true:" + PROBE_LABEL, "false:新对话", "false:另一个探针"], 0], "the page's names are text in the menu too");
  // Choosing the Assistant keeps the bar the Assistant's on this page, with its own draft; the page keeps its own.
  await pick("新对话");
  await browser.waitFor(`!${BAR}.dataset.receiver && !${MENU}.matches(':popover-open') && globalThis.molisBarReceivers.front() !== null`);
  await browser.evaluate(`(() => { const box = ${BOX}; box.value = '给助理的字'; box.dispatchEvent(new InputEvent('input', { bubbles: true, data: '字', inputType: 'insertText' })); })()`);
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(await child.evaluate("seen.drafts.at(-1)"), "", "the Assistant's words are not the page's draft");
  await openMenu();
  assert.deepEqual(await browser.evaluate(`[...${MENU}.querySelectorAll('[role=menuitemradio]')].map(item => item.getAttribute('aria-checked'))`), ["false", "true", "false"]);
  await pick(PROBE_LABEL);
  await browser.waitFor(`${BAR}.dataset.receiver === 'page' && ${BOX}.value === ''`);
  // Another of the page's receivers reaches the page only as the id the page listed.
  await openMenu();
  await pick("另一个探针");
  await child.waitFor("seen.acts.includes('choose:s2')");
  // The Assistant's draft is still its own: picked again, it comes back; cleared for what follows.
  await openMenu(); await pick("新对话");
  await browser.waitFor(`!${BAR}.dataset.receiver && ${BOX}.value === '给助理的字'`);
  await browser.evaluate(`(() => { const box = ${BOX}; box.value = ''; box.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await openMenu(); await pick(PROBE_LABEL);
  await browser.waitFor(`${BAR}.dataset.receiver === 'page'`);

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

// S-composer-source-call item 5 (refusals): what a framed page sends is rebuilt from the parts the bar knows. An icon that is not a
// platform icon's name is left out, so markup put in one is never drawn in the workbench (it was, in the review of head 8fd0f3c20:
// a command's icon went through `icon()` into the ＋ and `/` menus' HTML); a state with a field of the wrong shape is dropped whole,
// and the bar stays the Assistant's and usable.
test("S-composer-source-call item 5: a framed page's markup in an icon is never drawn in the bar, and a malformed state is dropped whole", { timeout: 180_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const errors: unknown[] = [];
  t.after(browser.on("Runtime.exceptionThrown", (event, session) => { if (session === browser.sessionId) errors.push(event.exceptionDetails); }));
  const child = await pluginFrameBrowser(t, browser, "lingguang");
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/` }, browser.sessionId));
  await browser.waitFor("document.body.dataset.desktopSurface === 'home'");
  await browser.click("[data-plugin-picker-popover] [data-plugin-id=lingguang]");
  await child.waitFor("typeof window.molisComposer === 'function' && !document.querySelector('[data-work-surface=lingguang]').hidden");
  const EVIL = 'x"></use></svg><img data-injected src=x onerror="globalThis.pwned=1"><svg><use href="#';
  const mount = (extra: string) => child.evaluate(`(() => {
    let root = document.querySelector('#probe');
    if (!root) { root = document.createElement("div"); root.id = "probe"; root.innerHTML = ${JSON.stringify(renderComposer({ kind: "ai", labels: COMPOSER_AI_LABELS, placeholder: "写给探针…" }))}; document.body.prepend(root); }
    globalThis.probe = window.molisComposer(root, { kind: "ai", entry: "probe", labels: ${JSON.stringify(COMPOSER_AI_LABELS)},
      receiver: () => ({ label: "探针会话", icon: ${JSON.stringify(EVIL)} }),
      commands: [{ slash: "probe", label: "探针命令", icon: ${JSON.stringify(EVIL)}, run: () => {} }, { slash: "plain", label: "普通命令", add: false, run: () => {} }],
      submit: async () => ({ state: "sent" }), ${extra} });
  })()`);

  // Markup in an icon: the bar takes the page, the icons are left out, and opening ＋ and the \`/\` list draws no element of the page's.
  await mount("");
  await browser.waitFor(`${BAR}.dataset.receiver === 'page'`);
  assert.deepEqual(await browser.evaluate("(() => { const options = globalThis.molisBarReceivers.front().options; return [options.receiver().icon ?? null, options.commands.map(one => one.icon ?? null)]; })()"),
    [null, [null, null]], "an icon that is not a platform icon's name does not cross");
  await browser.evaluate(`${BAR}.querySelector('[data-composer-add]').click()`);
  await browser.waitFor(`[...${BAR}.querySelectorAll('[data-composer-command]')].some(row => row.textContent.includes('探针命令'))`);
  await browser.evaluate(`(() => { const box = ${BOX}; box.focus(); box.value = '/'; box.dispatchEvent(new InputEvent('input', { bubbles: true, data: '/', inputType: 'insertText' })); })()`);
  await browser.waitFor(`[...${BAR}.querySelectorAll('[data-composer-command]')].some(row => row.textContent.includes('普通命令'))`);
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.deepEqual(await browser.evaluate("[document.querySelectorAll('[data-injected]').length, typeof globalThis.pwned]"), [0, "undefined"], "the page's markup is never drawn in the workbench");
  await browser.evaluate(`(() => { const box = ${BOX}; box.value = ''; box.dispatchEvent(new Event('input', { bubbles: true })); box.blur(); })()`);

  // A malformed state (a delivery with none of its three ways, a select whose options are not a list): dropped whole. The mount it
  // replaced is let go, so the bar is the Assistant's again, draws without an error and takes words.
  await mount(`delivery: () => ({}), controls: [{ kind: "select", id: "mode", label: "方式", value: "a", options: 1, change: () => {} }]`);
  await browser.waitFor(`!${BAR}.dataset.receiver && globalThis.molisBarReceivers.front() === null`);
  await browser.evaluate(`(() => { const box = ${BOX}; box.focus(); box.value = '还能写'; box.dispatchEvent(new InputEvent('input', { bubbles: true, data: '写', inputType: 'insertText' })); })()`);
  assert.equal(await browser.evaluate(`${BOX}.value`), "还能写", "the bar still takes words");
  assert.deepEqual(errors, [], "nothing the page sent made the workbench throw");
  await browser.evaluate(`(() => { const box = ${BOX}; box.value = ''; box.dispatchEvent(new Event('input', { bubbles: true })); })()`);
});
