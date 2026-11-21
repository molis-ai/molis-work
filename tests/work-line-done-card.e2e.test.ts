import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import type { AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { backgroundPlugin } from "./fixtures/home-background-plugin.js";
import { openTodoStore } from "./fixtures/plugin-home-stores.js";
import { cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";
import { recordingTextModel } from "./fixtures/recording-text-model.js";
import { sendBarrier } from "./fixtures/assistant-send-journey.js";

// specs/work-line §4.4 and §4.2: what is known of something done, the conversation closed (a reply is a dot on its key), and 手边.
// The done event is an installed plugin's, so nothing here knows its kind.

const ABOUT = "document.querySelector('[data-assistant-head]')?.dataset.about";
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
  await waitFor(`${ABOUT} === 'event:homebg_item:b1'`);
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

// POLISH-20, POLISH-21 (as §16 rewrote them) and QEA-198. With the conversation closed nothing of a reply stands above the
// input: a reply that came then is said once, by a dot on the key that opens the conversation — once for each reply, also one
// whose words are those of the last. Opening the conversation takes the dot away and shows the reply as its Markdown draws it.
// A press in the work, a press inside a plugin's page, and settings coming over the work each put the conversation away whole.
test("POLISH-20 POLISH-21 QEA-198: closed, a reply is a dot on the expand key and nothing above the input; opened, it is drawn from its Markdown; the work, a plugin's page and settings close the conversation whole", { timeout: 180_000 }, async t => {
  const words = "## 现状\n\n- 发布说明写进 `CHANGELOG.md`\n- **没有**按版本分节";
  const browser = await openGoalBrowser(t, true, undefined, undefined, undefined, undefined, {
    prepareHome: async home => { await recordingTextModel(t, home, () => cogniaScriptedResponse(undefined, words)); },
  });
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, click, evaluate, waitFor } = browser;
  assert.ok(projectId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  const PANEL = "document.querySelector('[data-assistant-panel]')", KEY = "document.querySelector('[data-work-counts] [data-dialog-open]')", DOT = `${KEY}.querySelector('[data-work-expand-dot]')`;
  const replies = `[...document.querySelectorAll('[data-assistant-thread] [data-reply-id]')].filter(reply => reply.dataset.text === ${JSON.stringify(words)})`;
  // Only the three keys and the expand key stand in the input while the conversation is closed.
  const RESTING = `(() => { const counts = document.querySelector('[data-work-counts]'); return ${PANEL}.hidden && !document.querySelector('[data-info-tabs]')?.getClientRects().length
    && [...counts.querySelectorAll('[data-work-list]')].filter(key => key.getClientRects().length).length === 3 && ${KEY}.getClientRects().length > 0; })()`;
  await waitFor(`${PANEL}?.hidden && Boolean(${KEY})`, 20_000);
  assert.equal(await evaluate(`${DOT}.hidden`), true, "nothing new: no dot");
  await command("Network.enable", {}, sessionId);
  const barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/send", requestStage: "Response" }]);
  t.after(() => barrier.close().catch(() => undefined));
  // Sending opens the conversation. It is closed before the Host's answer to the Send is let through, so the reply comes while it is closed.
  const send = async (text: string, count: number) => {
    await click("[data-assistant-composer] .mw-composer__input");
    await command("Input.insertText", { text }, sessionId);
    await click("[data-assistant-composer] [data-composer-send]");
    const held = await barrier.next();
    await evaluate(`${PANEL}.hidden || document.querySelector('[data-assistant-panel-close]').click()`);
    await barrier.release(held);
    await waitFor(`${replies}.length === ${count}`, 30_000);
    await waitFor(`${PANEL}.hidden && !${DOT}.hidden`, 10_000);
  };

  await send("请先核对第一份资料。", 1);
  assert.equal(await evaluate(`${KEY}.getAttribute('aria-label')`), "展开对话，有新回复", "the dot is said in words");
  assert.equal(await evaluate(RESTING), true, "POLISH-21: closed, the input holds the three keys and the expand key");
  assert.equal(await evaluate(`[...document.querySelectorAll('[data-work-line] *')].some(node => !node.closest('[data-assistant-panel]') && !node.children.length && /CHANGELOG|现状/u.test(node.textContent))`), false,
    "POLISH-20: no line of the reply is left above the input");
  await mkdir(shots, { recursive: true });
  await writeFile(new URL("reply-dot-1440.png", shots), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));

  // Opened: the dot is gone, and the reply is its own blocks with no Markdown marks.
  await evaluate(`${KEY}.click()`);
  await waitFor(`!${PANEL}.hidden && ${DOT}.hidden`);
  const BODY = `${replies}[0]`;
  assert.deepEqual(await evaluate(`[${BODY}.querySelector('h4').textContent, ${BODY}.querySelectorAll('li').length, ${BODY}.querySelector('strong').textContent, ${BODY}.querySelector('code').textContent]`),
    ["现状", 2, "没有", "CHANGELOG.md"], "POLISH-20: the reply's own blocks are drawn");
  assert.equal(await evaluate(`/[#*\`]|^- /mu.test([...${BODY}.querySelectorAll('h4, li')].map(node => node.textContent).join('\\n'))`), false, "POLISH-20: no Markdown marks are shown");

  // POLISH-21: a press in the work puts the conversation away whole; seen, the reply leaves no dot.
  const [first] = await evaluate<string[]>(`${replies}.map(reply => reply.dataset.replyId)`);
  assert.ok(first);
  await evaluate("document.querySelector('[data-tab-workspace]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))");
  await waitFor(RESTING);
  assert.equal(await evaluate(`${DOT}.hidden`), true, "a reply that was read is not news");
  // A plugin's page tells the shell of a press inside it (molis:surface-interaction, plugin-frame/parent.ts).
  await evaluate(`${KEY}.click()`);
  await waitFor(`!${PANEL}.hidden`);
  await evaluate("window.dispatchEvent(new CustomEvent('molis:surface-interaction'))");
  await waitFor(RESTING);

  // QEA-198: a second reply with the same words is another reply: the dot comes again, and the Host keeps both.
  await send("再核对第二份资料。", 2);
  const [unchanged, second] = await evaluate<string[]>(`${replies}.map(reply => reply.dataset.replyId)`);
  assert.equal(unchanged, first);
  assert.ok(second && second !== first);
  const workId = second.split(":")[0]!;
  const route = `/projects/${projectId}/api/assistant/works/${encodeURIComponent(workId)}`;
  const view = await evaluate<AssistantWorkView>(`molisWorkRequest(${JSON.stringify(route)}, { method: 'GET' })`);
  const stored = view.rounds.flatMap(round => round.turns
    .filter(turn => turn.kind === "assistant" && turn.text === words)
    .map(turn => `${view.work.work_id}:${round.run_id}:${turn.turn_id}`));
  assert.deepEqual(stored, [first, second]);

  // POLISH-21: settings comes over the work without a press on it (as a key opens it): the conversation closes, and nothing
  // of it — no float, no list — stands over settings.
  await evaluate(`${KEY}.click()`);
  await waitFor(`!${PANEL}.hidden`);
  await evaluate("document.querySelector('[data-directory-open=settings]').click()");
  await waitFor(`document.querySelector('.tab-workspace')?.dataset.exclusive === 'settings' && ${RESTING}`, 15_000);
  assert.equal(await evaluate("Boolean(document.querySelector('[data-work-task-float]')) || Boolean(document.querySelector('[data-work-lists]')?.getClientRects().length)"), false, "nothing floats over settings");
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
