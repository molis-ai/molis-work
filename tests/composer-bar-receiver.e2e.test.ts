import assert from "node:assert/strict";
import test from "node:test";
import { renderComposer } from "@molis-ai/molis-work-plugin-sdk/ui";
import { COMPOSER_AI_LABELS } from "./fixtures/composer-labels.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openTodoStore } from "./fixtures/plugin-home-stores.js";

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
    const seen = globalThis.seen = { drafts: [], sent: [], acts: [], acknowledgements: [] }; let draft = "";
    globalThis.probeOptions = { kind: "ai", entry: "probe", labels: ${JSON.stringify(COMPOSER_AI_LABELS)}, sources: true,
      near: () => ({ kind: "composernotes.note", id: "n1", plugin_id: "io.molis.work.someone-else" }),
      draft: { adapter: { read: async () => draft, write: async (text) => { draft = text; seen.drafts.push(text); } } },
      receiver: () => ({ label: ${JSON.stringify(PROBE_LABEL)}, icon: "code", detail: "探针页", others: [{ id: "s2", label: "另一个探针", detail: "探针页" }], choose: (id) => seen.acts.push("choose:" + id) }),
      controls: [{ kind: "select", id: "mode", label: "方式", value: "a", options: [{ value: "a", label: "甲" }, { value: "b", label: "乙" }], change: (value) => seen.acts.push(value) }],
      commands: [{ slash: "probe", label: "探针命令", add: false, run: () => seen.acts.push("command") }],
      attachments: { upload: async file => ({ state: "attached", ref: file.name, title: file.name }) },
      submit: async (input, signal, acknowledge) => { seen.sent.push(input); seen.acknowledgements.push(acknowledge); return globalThis.probeReply ? await globalThis.probeReply() : { state: "sent" }; } };
    globalThis.probe = window.molisComposer(root, probeOptions);
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
    [true, { kind: "composernotes.note", id: "n1", plugin_id: pluginId }], "the parent offers requested sources, and the page's object is its own plugin's");

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
  // UIV-23 (O4): the tag opens 「发给」 — this page's receiver, who is spoken to at now (the Assistant), the events of the project's
  // work line (specs/work-line §4.4; whatever this project's line shows) and the page's other receivers.
  const MENU = "document.querySelector('[data-assistant-send-to]')";
  const pick = (label: string) => browser.evaluate(`[...${MENU}.querySelectorAll('[role=menuitemradio]')].find(item => item.querySelector('[data-slot=menu-item-label] > span').textContent === ${JSON.stringify(label)}).click()`);
  const LINE = "线上的事件", rowsOutsideLine = `[...${MENU}.querySelectorAll('[role=menuitemradio]')].filter(item => item.closest('[role=group]').getAttribute('aria-label') !== ${JSON.stringify(LINE)})`;
  const openMenu = async () => { await browser.evaluate(`${BAR}.querySelector('[data-composer-receiver]').click()`); await browser.waitFor(`${MENU}.matches(':popover-open')`); };
  await openMenu();
  assert.deepEqual(await browser.evaluate(`[[...${MENU}.querySelectorAll('.mw-menu__label')].map(node => node.textContent).filter(label => label !== ${JSON.stringify(LINE)}), ${rowsOutsideLine}.map(item => item.getAttribute('aria-checked') + ':' + item.querySelector('[data-slot=menu-item-label] > span').textContent), ${MENU}.querySelectorAll('img').length]`),
    [["这一页", "现在", "别的会话"], ["true:" + PROBE_LABEL, "false:助理", "false:另一个探针"], 0], "the page's names are text in the menu too");
  // Choosing the Assistant keeps the bar the Assistant's on this page, with its own draft; the page keeps its own.
  await pick("助理");
  await browser.waitFor(`!${BAR}.dataset.receiver && !${MENU}.matches(':popover-open') && globalThis.molisBarReceivers.front() !== null`);
  await browser.evaluate(`(() => { const box = ${BOX}; box.value = '给助理的字'; box.dispatchEvent(new InputEvent('input', { bubbles: true, data: '字', inputType: 'insertText' })); })()`);
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(await child.evaluate("seen.drafts.at(-1)"), "", "the Assistant's words are not the page's draft");
  await openMenu();
  assert.deepEqual(await browser.evaluate(`${rowsOutsideLine}.map(item => item.getAttribute('aria-checked'))`), ["false", "true", "false"]);
  await pick(PROBE_LABEL);
  await browser.waitFor(`${BAR}.dataset.receiver === 'page' && ${BOX}.value === ''`);
  // Another of the page's receivers reaches the page only as the id the page listed.
  await openMenu();
  await pick("另一个探针");
  await child.waitFor("seen.acts.includes('choose:s2')");
  // The Assistant's draft is still its own: picked again, it comes back; cleared for what follows.
  await openMenu(); await pick("助理");
  await browser.waitFor(`!${BAR}.dataset.receiver && ${BOX}.value === '给助理的字'`);
  await browser.evaluate(`(() => { const box = ${BOX}; box.value = ''; box.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await openMenu(); await pick(PROBE_LABEL);
  await browser.waitFor(`${BAR}.dataset.receiver === 'page'`);

  // The page writes into its own box (a prefill): the bar shows it.
  await child.evaluate("(() => { const box = document.querySelector('#probe .mw-composer__input'); box.value = '页面放进来的字'; box.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await browser.waitFor(`${BOX}.value === '页面放进来的字'`);

  // S-composer-source-call item 5: away from the page, the bar is the Assistant's; the page's text, insert, focus and send do nothing
  // to it, and the Assistant's words never reach the page.
  await browser.click(".workbench-header [data-plugin-id=home]");
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

test("QEA-41 S-composer-source-call: only a person's parent-bar send discloses a picked Todo reference to a framed receiver", { timeout: 180_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const store = openTodoStore(browser.homeDirectory);
  const item = (() => { try { return store.create({ title: "只在本人发送时交出的待办", notes: "尚未交给收件人", placement: "project" },
    { actor: "user", actorId: "web-user", projectId: browser.projectId!, projectIds: [] }).item; } finally { store.close(); } })();
  const child = await pluginFrameBrowser(t, browser, "lingguang");
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?openPlugin=lingguang` }, browser.sessionId));
  await child.waitFor("typeof window.molisComposer === 'function' && !document.querySelector('[data-work-surface=lingguang]').hidden");
  await child.evaluate(probe());
  await browser.waitFor(`${BAR}.dataset.receiver === 'page'`);
  assert.equal(await browser.evaluate("globalThis.molisBarReceivers.front().options.sources"), true);
  await browser.click("[data-assistant-island] [data-composer-add]");
  await browser.waitFor(`${BAR}.querySelector('[data-composer-source]')`);
  await browser.evaluate(`[...${BAR}.querySelectorAll('[data-composer-source]')].find(item => item.textContent.includes('待办')).click()`);
  await browser.waitFor(`[...${BAR}.querySelectorAll('[data-composer-pick]')].some(item => item.textContent.includes('只在本人发送时交出的待办'))`);
  await browser.evaluate(`[...${BAR}.querySelectorAll('[data-composer-pick]')].find(item => item.textContent.includes('只在本人发送时交出的待办')).click()`);
  await browser.waitFor(`${BAR}.querySelector('.mw-upload')`);
  assert.deepEqual(await child.evaluate("probe.materials()"), [], "a choice stays in the parent until Send, including its reference and title");
  await child.evaluate("document.querySelector('#probe [data-composer-send]').click(); probe.insert('请处理所选待办')");
  await browser.waitFor(`${BOX}.value === '请处理所选待办'`);
  assert.equal(await child.evaluate("seen.sent.length"), 0, "a child cannot submit another owner's selected material");
  assert.deepEqual(await child.evaluate("probe.materials()"), []);
  for (const path of ["/api/composer/sources", "/api/composer/pick", "/api/search/query"]) {
    const refusal = await child.evaluate(`window.molisWorkRequest(${JSON.stringify(path)}, { method: 'POST', body: { layer: 'ai', query: '' } }).then(() => 200, error => error.status)`);
    assert.equal(refusal, 403, path);
  }
  await browser.click("[data-assistant-island] [data-composer-send]");
  await child.waitFor("seen.sent.length === 1");
  const sent = await child.evaluate<{ text: string; materials: Array<{ kind: string; ref: { subject: { id: string } }; title: string }> }>("seen.sent[0]");
  assert.equal(sent.text, "请处理所选待办");
  assert.equal(sent.materials.length, 1);
  assert.equal(sent.materials[0]!.kind, "material");
  assert.equal(sent.materials[0]!.ref.subject.id, item.id);
  assert.equal(sent.materials[0]!.title, item.title);
  await browser.waitFor(`${BOX}.value === '' && !${BAR}.querySelector('.mw-upload')`);
  // A receiver without custom mentions uses the parent's actual system search under the same disclosure boundary.
  await browser.click("[data-assistant-island] .mw-composer__input");
  await browser.command("Input.insertText", { text: "@" }, browser.sessionId);
  await browser.command("Input.insertText", { text: item.title }, browser.sessionId);
  await browser.waitFor(`[...${BAR}.querySelectorAll('[data-composer-mention]')].some(row => row.textContent.includes(${JSON.stringify(item.title)}))`);
  await browser.evaluate(`[...${BAR}.querySelectorAll('[data-composer-mention]')].find(row => row.textContent.includes(${JSON.stringify(item.title)})).click()`);
  await browser.waitFor(`${BAR}.querySelector('.mw-upload')`);
  assert.deepEqual(await child.evaluate("probe.materials()"), [], "system-search selections are also private until the person sends");
  await browser.click("[data-assistant-island] [data-composer-send]");
  await child.waitFor("seen.sent.length === 2");
  assert.equal(await child.evaluate("seen.sent[1].materials[0].ref.subject.id"), item.id);
});

test("QEA-45: a late framed receipt settles only its invocation, including a failed reply after acknowledgement and a reused request id", { timeout: 180_000 }, async t => {
  const b = await openGoalBrowser(t, true);
  if (!b) return;
  const child = await pluginFrameBrowser(t, b, "lingguang");
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/?openPlugin=lingguang` }, b.sessionId));
  await child.waitFor("typeof window.molisComposer === 'function' && !document.querySelector('[data-work-surface=lingguang]').hidden");
  await child.evaluate(probe()); await b.waitFor(`${BAR}.dataset.receiver === 'page'`);
  const fill = (value: string) => b.evaluate(`{ const input = ${BOX}; input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); }`);
  const attach = async (name: string) => {
    await child.evaluate(`probe.attach([new File(['content'], ${JSON.stringify(name)})])`);
    await b.waitFor(`[...${BAR}.querySelectorAll('.mw-upload:not(.is-reading)')].some(item => item.textContent.includes(${JSON.stringify(name)}))`);
  };
  const send = () => b.click("[data-assistant-island] [data-composer-send]");
  await child.evaluate("globalThis.probeReply = async () => ({ state: 'failed', message: 'controlled unknown response' })");
  await attach("sent.txt"); await fill("原提交"); await send();
  await b.waitFor(`${BAR}.textContent.includes('controlled unknown response')`);
  await fill("后来输入"); await attach("new.txt");
  await child.evaluate("seen.acknowledgements[0]()");
  await b.waitFor(`${BAR}.querySelectorAll('.mw-upload').length === 1`);
  assert.equal(await b.evaluate(`${BOX}.value`), "后来输入");
  assert.match(await b.evaluate<string>(`${BAR}.querySelector('.mw-upload').textContent`), /new.txt/u);
  // A completed receipt cannot be applied twice after another edit.
  await child.evaluate("seen.acknowledgements[0]()");
  assert.equal(await b.evaluate(`${BOX}.value`), "后来输入");

  // A receipt may beat the response; after B starts, A's late failure must not turn B into a failed send.
  await child.evaluate("globalThis.probeReply = () => new Promise(resolve => { globalThis.firstReply = resolve; })");
  await send(); await child.waitFor("seen.sent.length === 2 && typeof firstReply === 'function'");
  await child.evaluate("seen.acknowledgements[1]()"); await b.waitFor(`${BOX}.value === ''`);
  await fill("B 的正文");
  await child.evaluate("globalThis.probeReply = () => new Promise(resolve => { globalThis.secondReply = resolve; })");
  await send(); await child.waitFor("seen.sent.length === 3 && typeof secondReply === 'function'");
  await child.evaluate("firstReply({state:'failed',message:'A must not replace B'})");
  await child.waitFor("seen.drafts.at(-1) === 'B 的正文'");
  assert.equal(await b.evaluate(`${BOX}.value`), "B 的正文");
  assert.equal(await b.evaluate(`${BAR}.textContent.includes('A must not replace B')`), false);
  await child.evaluate("secondReply({state:'sent'})"); await b.waitFor(`${BOX}.value === ''`);

  // Changing mode can reuse the public retry request_id. Invocation identity still prevents A's callback settling B.
  await child.evaluate("probe.setRunning(true); globalThis.probeReply = async () => ({state:'failed',message:'controlled unknown response'})");
  await fill("相同文字"); await send(); await b.waitFor(`${BAR}.textContent.includes('controlled unknown response')`);
  await b.click("[data-assistant-island] [data-compose-menu-toggle]");
  await b.click("[data-assistant-island] [data-composer-delivery=after-run]");
  await send(); await child.waitFor("seen.sent.length === 5");
  assert.equal(await child.evaluate("seen.sent[3].request_id === seen.sent[4].request_id"), true);
  await child.evaluate("seen.acknowledgements[3]()");
  await b.waitFor(`${BAR}.textContent.includes('controlled unknown response')`);
  assert.equal(await b.evaluate(`${BOX}.value`), "相同文字");
  await child.evaluate("seen.acknowledgements[4]()"); await b.waitFor(`${BOX}.value === ''`);
});

test("QEA-45: same-id frame shape remount preserves the draft and selections across a late acknowledgement or answer", { timeout: 180_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const child = await pluginFrameBrowser(t, b, "lingguang");
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/?openPlugin=lingguang` }, b.sessionId));
  await child.waitFor("typeof window.molisComposer === 'function' && !document.querySelector('[data-work-surface=lingguang]').hidden");
  await child.evaluate(probe()); await b.waitFor(`${BAR}.dataset.receiver === 'page'`);
  const fill = (text: string) => b.evaluate(`{ const input = ${BOX}; input.value = ${JSON.stringify(text)}; input.dispatchEvent(new Event('input', { bubbles: true })); }`);
  const attach = async (name: string) => {
    await child.evaluate(`probe.attach([new File(['content'], ${JSON.stringify(name)})])`);
    await b.waitFor(`[...${BAR}.querySelectorAll('.mw-upload:not(.is-reading)')].some(item => item.textContent.includes(${JSON.stringify(name)}))`);
  };
  for (const [index, mode] of ["acknowledge", "answer"].entries()) {
    const original = `${mode} original`, newer = `${mode} newer`;
    await child.evaluate("globalThis.probeReply = () => new Promise(resolve => { globalThis.delayedReply = resolve; })");
    await fill(original); await attach(`${mode}-old.txt`); await b.click("[data-assistant-island] [data-composer-send]");
    await child.waitFor(`seen.sent.length === ${index + 1}`);
    await b.evaluate(`globalThis.beforeRemountFile = ${BAR}.querySelector('input[type=file]')`);
    await child.evaluate("probeOptions.sources = !probeOptions.sources; probe.refresh()");
    await b.waitFor("beforeRemountFile && !beforeRemountFile.isConnected");
    await b.waitFor(`globalThis.molisBarReceivers.front().options.sources === ${index === 1}`);
    await b.waitFor(`${BOX}.value === ${JSON.stringify(original)}`);
    assert.match(await b.evaluate<string>(`${BAR}.textContent`), new RegExp(`${mode}-old.txt`), "shape changes preserve the current draft's selections");
    await fill(newer); await attach(`${mode}-new.txt`);
    await child.waitFor(`seen.drafts.at(-1) === ${JSON.stringify(newer)}`);
    if (mode === "acknowledge") {
      await child.evaluate(`seen.acknowledgements[${index}]()`);
      await b.waitFor(`![...${BAR}.querySelectorAll('.mw-upload')].some(item => item.textContent.includes(${JSON.stringify(mode + "-old.txt")}))`);
    }
    await child.evaluate("delayedReply({ state: 'sent' })");
    await b.waitFor(`${BOX}.value === ${JSON.stringify(newer)}`);
    assert.equal(await child.evaluate("seen.drafts.at(-1)"), newer, "a late result cannot clear the persistent newer draft");
    assert.match(await b.evaluate<string>(`${BAR}.textContent`), new RegExp(`${mode}-new.txt`));
    // Explicitly remove remaining picks before the next independently delayed invocation.
    await b.evaluate(`for (const button of ${BAR}.querySelectorAll('[data-composer-remove]')) button.click()`);
  }
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
