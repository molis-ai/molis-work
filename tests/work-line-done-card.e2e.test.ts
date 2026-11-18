import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { backgroundPlugin } from "./fixtures/home-background-plugin.js";
import { openTodoStore } from "./fixtures/plugin-home-stores.js";

// specs/work-line §4.4 and §4.2: the card of something done, the reply left above the input with the dialog closed, and 手边.
// The done event is an installed plugin's, so nothing here knows its kind.

const TAB = "document.querySelector('.assistant-tab[data-current]')";
const shots = new URL("../.impeccable/qa/review/work-line/", import.meta.url);

test("WLN-11: a done event's card shows what came of it in its owner's words, 「打开」 as a tab and 「放到 Shelf」 as the person, with the event's name, words and address", { timeout: 150_000 }, async t => {
  // An installed plugin the workbench has never heard of registers the done event; it opens a todo, a place the workbench has.
  const plugin = backgroundPlugin(() => ({ source: { surface: "example", title: "示例", icon: "list" }, tasks: [] }));
  const browser = await openGoalBrowser(t, true, undefined, null, undefined, undefined, {}, { project: [plugin.definition] });
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, homeDirectory, evaluate, waitFor, click } = browser;
  const store = openTodoStore(homeDirectory);
  const item = store.create({ title: "季度预算", placement: "project" }, { projectId, projectIds: [], actor: "user" as const, actorId: "test" }).item;
  store.close();
  const done = { event_id: "budget", subject: { kind: "homebg_item", id: "b1" }, title: "季度预算已整理", summary: "已办", content: "三档预算与对比表，附常见问题。", facts: [], category: "personal",
    placement: "occurred", occurred_at: new Date(Date.now() - 3_600_000).toISOString(), state: "done", needs_attention: false, open: { kind: "item", surface: "todo", id: item.id, title: "季度预算", label: "打开" } };
  plugin.state.events = () => ({ source: { surface: "example", title: "示例", icon: "list" }, events: [done] });
  // What 「放到 Shelf」 posts, as the page posted it.
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `window.__shelved = []; (() => { const real = window.fetch; window.fetch = function (input, init) {
    try { const url = typeof input === 'string' ? input : input.url; if (/\\/api\\/mainline\\/shelve$/.test(new URL(url, location.href).pathname) && init && typeof init.body === 'string') window.__shelved.push(JSON.parse(init.body)); } catch {}
    return real.apply(this, arguments); }; })();` }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));

  const PRESS = "[data-work-line] [data-work-event*=\"budget\"]";
  await waitFor(`document.querySelector(${JSON.stringify(PRESS)})?.textContent.includes('季度预算已整理')`, 20_000);
  // The demo project's other events stand nearer now, so this one is scrolled out of the run: pressed as a key would.
  await evaluate(`document.querySelector(${JSON.stringify(PRESS)}).click()`);
  await waitFor(`${TAB}?.dataset.tab === 'event:homebg_item:b1'`);
  const CARD = "document.querySelector('[data-assistant-event-card] [data-event-card=\"homebg_item:b1\"]')";
  await waitFor(`${CARD} && !${CARD}.querySelector('[data-card-result]').hidden && ${CARD}.querySelector('.work-card-preview')?.textContent === '三档预算与对比表，附常见问题。'`, 15_000);
  assert.deepEqual(await evaluate(`Array.from(${CARD}.querySelectorAll('[data-card-result] .mw-btn')).map(button => [button.textContent.trim(), button.disabled])`), [["打开", false], ["放到 Shelf", false]]);
  assert.equal(await evaluate(`${CARD}.querySelector('[data-card-tasks]').hidden`), true, "nothing was done for it, so there is no process to fold");
  await mkdir(shots, { recursive: true });
  await writeFile(new URL("event-card-done-1440.png", shots), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));

  // 放到 Shelf: Shelf's own action, as the person; what lands is the name, the words and the address that opens it again.
  await click("[data-assistant-event-card] [data-event-shelve]");
  await waitFor(`${CARD}.querySelector('[data-event-shelve]').textContent.trim() === '已放到 Shelf' && ${CARD}.querySelector('[data-event-shelve]').disabled`, 15_000);
  const [shelved] = await evaluate<Array<{ title: string; text: string }>>("window.__shelved");
  assert.deepEqual(shelved, { title: "季度预算已整理",
    text: `季度预算已整理\n三档预算与对比表，附常见问题。\n${origin}/projects/${encodeURIComponent(projectId ?? "")}/?openPlugin=todo&openItem=${encodeURIComponent(item.id)}&openTitle=${encodeURIComponent("季度预算")}` });

  // 打开: the event's own place, as a tab of the work surface.
  await click("[data-assistant-event-card] [data-event-open]");
  await waitFor("Array.from(document.querySelectorAll('[data-tab-id]')).some(tab => tab.textContent.includes('季度预算') && !tab.textContent.includes('已整理'))", 15_000);
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true, "no sideways scroll");
});

test("WLN-35: with the dialog closed the latest reply stays above the input beside the task mark, folds to the mark once the work is pressed, and a new reply shows again", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, evaluate, waitFor } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-assistant-panel]')?.hidden && Boolean(document.querySelector('[data-reply-mini]'))", 20_000);
  // No model runs in this fixture: a reply is written into the conversation as the conversation draws one.
  const reply = (words: string) => `(() => { const bubble = document.createElement('div'); bubble.className = 'assistant-msg assistant-msg--assistant'; bubble.dataset.text = ${JSON.stringify(words)}; document.querySelector('[data-assistant-thread]').append(bubble); })()`;
  await evaluate(reply("预算表已经整理好，放在项目资料里。"));
  await waitFor("document.querySelector('[data-reply-peek] .work-reply-peek-body')?.textContent === '预算表已经整理好，放在项目资料里。' && !document.querySelector('[data-reply-mini]')");
  assert.equal(await evaluate("document.querySelector('[data-reply-peek] [role=status]') !== null"), true, "only the reply itself is announced");
  assert.equal(await evaluate("Boolean(document.querySelector('[data-reply-peek] .work-task-mark')) && Boolean(document.querySelector('[data-reply-peek] [data-dialog-open]'))"), true, "the task mark and the way back stay beside it");
  await mkdir(shots, { recursive: true });
  await writeFile(new URL("reply-peek-1440.png", shots), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));

  // Pressing the work folds it to the mark; the same reply does not come back, a new one does.
  await evaluate("document.querySelector('main, [data-tab-workspace], body').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))");
  await waitFor("!document.querySelector('[data-reply-peek]') && Boolean(document.querySelector('[data-reply-mini]'))");
  await evaluate(reply("王总约在明天下午三点。"));
  await waitFor("document.querySelector('[data-reply-peek] .work-reply-peek-body')?.textContent === '王总约在明天下午三点。'");
  // Opening the dialog puts the row away.
  await evaluate("document.querySelector('[data-reply-peek] [data-dialog-open]').click()");
  await waitFor("!document.querySelector('[data-assistant-panel]').hidden && !document.querySelector('[data-reply-peek]') && !document.querySelector('[data-reply-mini]')");
});

// screen-polish P0, three defects of the row above the input (WLN-35), each seen in the product before:
// 1. it showed the reply's Markdown source (`## 现状 - …`) where the dialog shows the rendered reply;
// 2. a press inside a plugin's page (its own document) did not fold it;
// 3. folded, it came back over the next page the person opened (settings), though no new reply had come.
// Review of #2110: a named object is a button in the dialog whose words belong to the sentence; the row keeps those words.
test("WLN-35: the reply above the input reads as the dialog draws it, folds on a press inside a plugin's page, and stays folded when the page loads again", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, evaluate, waitFor } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  const load = async () => {
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
    await waitFor("document.querySelector('[data-assistant-panel]')?.hidden && Boolean(document.querySelector('[data-reply-mini]'))", 20_000);
  };
  await load();
  // A reply as the conversation draws one: its Markdown source in data-text, the Host's rendered blocks inside, its copy button.
  const SOURCE = "## 现状\n\n- 发布说明写进 `CHANGELOG.md`\n- **没有**按版本分节，已把「发布说明」放进项目";
  const RENDERED = "<h2>现状</h2><ul><li>发布说明写进 <code>CHANGELOG.md</code></li><li><strong>没有</strong>按版本分节，已把<button class=\"assistant-inline-object\" type=\"button\" data-assistant-object=\"0\">发布说明</button>放进项目</li></ul><button type=\"button\" class=\"assistant-copy\">复制</button>";
  const reply = (source: string, rendered: string) => `(() => { const bubble = document.createElement('div'); bubble.className = 'assistant-msg assistant-msg--assistant'; bubble.dataset.text = ${JSON.stringify(source)}; bubble.innerHTML = ${JSON.stringify(rendered)}; document.querySelector('[data-assistant-thread]').append(bubble); })()`;
  const BODY = "document.querySelector('[data-reply-peek] .work-reply-peek-body')";
  await evaluate(reply(SOURCE, RENDERED));
  await waitFor(`Boolean(${BODY}?.querySelector('h2'))`);
  assert.deepEqual(await evaluate(`[${BODY}.querySelector('h2').textContent, ${BODY}.querySelectorAll('li').length, ${BODY}.querySelector('strong').textContent, ${BODY}.querySelector('code').textContent]`),
    ["现状", 2, "没有", "CHANGELOG.md"], "the reply's own blocks are drawn");
  assert.equal(await evaluate(`/[#*\`]|^- /m.test(${BODY}.textContent)`), false, "no Markdown marks are shown");
  assert.equal(await evaluate(`${BODY}.querySelector('button')`), null, "the reply's buttons stay in the dialog");
  assert.equal(await evaluate(`${BODY}.querySelectorAll('li')[1].textContent`), "没有按版本分节，已把发布说明放进项目", "a named object keeps its words in the sentence");
  // WLN-35 / VUX-33: a syntax pass changes nodes in the dialog, while a genuine revision changes the preview.
  const message = "document.querySelector('[data-assistant-thread] .assistant-msg--assistant:last-child')";
  await evaluate(`const figure = document.createElement('figure'); figure.className = 'assistant-code';
    figure.innerHTML = '<pre><code>const x = 1</code></pre>'; ${message}.append(figure);`);
  await waitFor(`${BODY}.querySelector('pre code')?.textContent === 'const x = 1'`);
  await evaluate(`window.previewHeading = ${BODY}.querySelector('h2');
    const code = ${message}.querySelector('pre code'), token = document.createElement('span');
    token.className = 'tok-keyword'; token.textContent = 'const'; code.replaceChildren(token, ' x = 1');`);
  assert.equal(await evaluate(`${BODY}.querySelector('h2') === window.previewHeading`), true, "new syntax nodes leave the preview and its live region in place");
  // Three lines: a heading stands at the words' own size, and nothing of the reply runs out of the row.
  assert.deepEqual(await evaluate(`(() => { const body = ${BODY}, h = body.querySelector('h2'); return [getComputedStyle(h).fontSize === getComputedStyle(body).fontSize, body.getBoundingClientRect().height <= parseFloat(getComputedStyle(body).fontSize) * 4.95 + 1]; })()`), [true, true]);
  await mkdir(shots, { recursive: true });
  await writeFile(new URL("reply-peek-rendered-1440.png", shots), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));

  await evaluate(`${message}.dataset.text += '!'; ${message}.querySelector('h2').textContent = '最新进展'`);
  await waitFor(`${BODY}.querySelector('h2')?.textContent === '最新进展'`);
  await evaluate(`${message}.dataset.text = ${JSON.stringify(SOURCE)}; ${message}.querySelector('h2').textContent = '现状'`);
  await waitFor(`${BODY}.querySelector('h2')?.textContent === '现状'`);

  // A plugin's page tells the shell of a press inside it (molis:surface-interaction, plugin-frame/parent.ts): the row folds.
  await evaluate("window.dispatchEvent(new CustomEvent('molis:surface-interaction'))");
  await waitFor("!document.querySelector('[data-reply-peek]') && Boolean(document.querySelector('[data-reply-mini]'))");

  // The page loads again with the same reply the latest: it stays folded. Another reply shows.
  await load();
  await evaluate(reply(SOURCE, RENDERED));
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.deepEqual(await evaluate("[Boolean(document.querySelector('[data-reply-peek]')), Boolean(document.querySelector('[data-reply-mini]'))]"), [false, true], "the reply the person put away does not come back with the page");
  await evaluate(reply("改好了。", "<p>改好了。</p>"));
  await waitFor(`${BODY}?.textContent === '改好了。' && !document.querySelector('[data-reply-mini]')`);

  // Settings comes over the work without a press on it (as a key opens it): the row folds, and nothing stands over settings.
  await evaluate("document.querySelector('[data-directory-open=settings]').click()");
  await waitFor("document.querySelector('.tab-workspace')?.dataset.exclusive === 'settings' && !document.querySelector('[data-reply-peek]') && Boolean(document.querySelector('[data-reply-mini]'))");

  // The workbench opened at a settings address, in a window that never put the reply away: the reply found under the cover
  // stays folded, and one that comes while settings stands (the person asked from there) shows.
  await evaluate("sessionStorage.removeItem('molis.assistant.reply-folded')");
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?settings=appearance` }, sessionId));
  await waitFor("document.querySelector('.tab-workspace')?.dataset.exclusive === 'settings' && document.querySelector('[data-assistant-panel]')?.hidden", 20_000);
  await evaluate(reply(SOURCE, RENDERED));
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.deepEqual(await evaluate("[Boolean(document.querySelector('[data-reply-peek]')), Boolean(document.querySelector('[data-reply-mini]'))]"), [false, true], "nothing of an earlier reply stands over settings opened by its address");
  await evaluate(reply("改好了。", "<p>改好了。</p>"));
  await waitFor(`${BODY}?.textContent === '改好了。'`);
});

test("specs/work-line §4.2 手边: the input's ＋ lists Shelf, 灵光 and 项目资料, and one opens beside the work", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, evaluate, waitFor } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("Boolean(document.querySelector('[data-assistant-island] [data-composer-add]'))", 20_000);
  await evaluate("document.querySelector('[data-assistant-island] [data-composer-add]').click()");
  const ITEMS = "Array.from(document.querySelectorAll('[data-assistant-island] [data-compose-menu] .mw-menu__item')).filter(item => item.textContent.includes('手边'))";
  await waitFor(`${ITEMS}.length >= 3`);
  const listed = await evaluate<string[]>(`${ITEMS}.map(item => item.querySelector('.mw-menu__label, .mw-menu__item-label')?.textContent?.trim() || item.textContent.trim())`);
  // Shelf, 灵光 and 资料 lead, in the side's own order; another plugin's side page (Risk's here) follows by the same rule, not by name.
  assert.deepEqual(listed.map(label => label.replace(/在侧边打开.*$/u, "")).slice(0, 3), ["Shelf", "灵光", "项目资料"]);
  await evaluate(`${ITEMS}[0].click()`);
  await waitFor("document.querySelector('[data-side-tab][aria-selected=\"true\"]')?.dataset.sideTab === 'plugin:shelf/side'");
});
