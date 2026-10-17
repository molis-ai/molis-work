import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel, type IssueModelBehavior } from "./fixtures/issue-model.js";
import { putInput, readWork, sendBarrier, waitWork, type SendBrowser } from "./fixtures/assistant-send-journey.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

// specs/ai-input-receipts §3.3, §4.1, §4.2, §7, D14 (stage 1e): in the Assistant, the person picks where words go while a
// question waits, each supplement carries the runtime's receipt, and a Send whose outcome was lost goes again after a
// refresh under the same key. The model is a local fixture; the Assistant, its runtime and the Host are real.
async function assistantPage(t: TestContext, behavior: IssueModelBehavior, storage = true) {
  const browser = await openGoalBrowser(t, "user");
  if (!browser) return null;
  await issueModel(t, browser.homeDirectory, behavior);
  await browser.command("Emulation.setDeviceMetricsOverride", { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false }, browser.sessionId);
  await browser.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, browser.sessionId);
  if (!storage) await browser.command("Page.addScriptToEvaluateOnNewDocument", {
    source: "Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });",
  }, browser.sessionId);
  await browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + "/" }, browser.sessionId));
  await browser.waitFor(`document.querySelector('.chooser')?.dataset.selected === ${JSON.stringify(browser.projectId)}`);
  return browser;
}
// A Send the Host took clears the composer (an empty composer also disables Send, so that cannot tell).
const settled = (browser: SendBrowser) => browser.waitFor("document.querySelector('[data-assistant-input]').value === ''", 15_000);
async function send(browser: SendBrowser, text: string) { await putInput(browser, text); await browser.click("[data-assistant-send]"); await settled(browser); }
/** Sends through the composer and returns the body the page actually put on the wire. */
async function sendSeen(browser: SendBrowser, text: string) {
  const barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/send", requestStage: "Request" }]);
  try {
    await putInput(browser, text); await browser.click("[data-assistant-send]");
    const paused = await barrier.next(); await barrier.release(paused);
    return JSON.parse(paused.request.postData!) as Record<string, unknown>;
  } finally { await barrier.close(); await settled(browser); }
}
async function shot(browser: SendBrowser, name: string) {
  const evidence = reviewEvidenceUrl("ai-input-receipts/"); await mkdir(evidence, { recursive: true });
  await writeFile(new URL(name, evidence), Buffer.from((await browser.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, browser.sessionId)).data, "base64"));
}
const chip = (browser: SendBrowser) => browser.evaluate<string | null>("(() => { const chip = document.querySelector('[data-assistant-answer]'); return chip.hidden ? null : chip.textContent; })()");
const receipts = (browser: SendBrowser) => browser.evaluate<string[]>("[...document.querySelectorAll('[data-assistant-thread] .mw-receipt__fact')].map(node => node.textContent)");

test("RC-14/RC-15/RCPT-312: while a question waits the chip says what Send does, a supplement's receipt says the question still waits, and a changed receipt is said once on the status region", { timeout: 120_000 }, async t => {
  const browser = await assistantPage(t, { question: "free-text" }); if (!browser) return;
  await send(browser, "帮我记一个问题");
  const id = await browser.evaluate<string>("localStorage.getItem('molis.assistant.current')");
  await waitWork(browser, id, view => view.rounds.at(-1)?.phase === "awaiting-input");
  await browser.waitFor("!document.querySelector('[data-assistant-answer]').hidden");
  assert.equal(await chip(browser), "回答上面的问题", "the default is on the chip");
  await shot(browser, "assistant-target-chip.png");

  await browser.click("[data-assistant-answer]");
  assert.equal(await chip(browser), "补充这一轮");
  const steered = await sendSeen(browser, "顺便看一下截图");
  assert.equal(steered.target, "steer", "the page sends the choice; the Host never guesses");
  await browser.waitFor("[...document.querySelectorAll('[data-assistant-thread] .mw-receipt__fact')].some(node => node.textContent === '已补充到这一轮；问题仍在等你回答')");
  assert.equal((await readWork(browser, id)).rounds.at(-1)!.awaiting_input.length, 1, "a supplement does not answer the question");
  assert.match(await browser.evaluate<string>("document.querySelector('[data-assistant-thread] .mw-receipt__note').textContent"), /读到不代表已遵循/u);
  await shot(browser, "assistant-receipt-waiting.png");

  await browser.click("[data-assistant-answer]");
  await browser.evaluate("window.__waiting = document.querySelector('[data-assistant-thread] .mw-receipt')");
  const answered = await sendSeen(browser, "首页点保存没有反应");
  assert.equal(answered.target, "answer");
  await waitWork(browser, id, view => view.work.state === "completed");
  const ended = ["AI 已读到", "这一轮结束时 AI 没读到，留给下一轮"];
  await browser.waitFor(`${JSON.stringify(ended)}.includes(document.querySelector('[data-assistant-thread] .mw-receipt__fact')?.textContent)`, 15_000)
    .catch(async error => assert.fail(`${error}; lines: ${JSON.stringify(await receipts(browser))}; turns: ${JSON.stringify((await readWork(browser, id)).rounds.at(-1)!.turns)}`));
  assert.equal(await browser.evaluate("document.contains(window.__waiting) && window.__waiting.getAttribute('aria-live')"), "off", "a changed receipt changes in place and does not speak through the thread");
  await browser.waitFor("[...document.querySelectorAll('body > p.mw-sr-only[role=status]')].some(node => /^你的补充「顺便看一下截图」：(AI 已读到|这一轮结束时 AI 没读到，留给下一轮)/u.test(node.textContent))", 5_000);
  assert.deepEqual(await browser.evaluate("(() => { const thread = document.querySelector('[data-assistant-thread]'); return [thread.getAttribute('role'), thread.getAttribute('aria-live'), thread.getAttribute('aria-relevant')]; })()"), ["log", "polite", "additions"]);
  assert.equal(await chip(browser), null, "with no question waiting there is no choice to make");
  await shot(browser, "assistant-receipt-read.png");

  // RCPT-326: a correction from the receipt is a Send of the person's words naming the supplement; after the round it waits for the next one.
  const rounds = (await readWork(browser, id)).rounds, supplement = rounds.at(-1)!.turns.find(turn => turn.steer)!.steer!.id;
  const barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/send", requestStage: "Request" }]);
  try {
    await browser.evaluate("(() => { const receipt = document.querySelector('[data-assistant-thread] .mw-receipt'); receipt.open = true; [...receipt.querySelectorAll('button')].find(node => node.textContent === '更正…').click(); })()");
    assert.equal(await browser.evaluate("document.activeElement === document.querySelector('[data-assistant-thread] .mw-receipt form textarea')"), true, "the words box has focus");
    await browser.evaluate("(() => { const form = document.querySelector('[data-assistant-thread] .mw-receipt form'); [...form.querySelectorAll('button')].find(node => node.textContent === '这条针对的是：').click(); form.querySelector('textarea').value += '首页的截图'; form.requestSubmit(); })()");
    const paused = await barrier.next(); await barrier.release(paused);
    const body = JSON.parse(paused.request.postData!) as Record<string, unknown>;
    assert.deepEqual([body.work_id, body.text, body.about, body.written_by], [id, "这条针对的是：首页的截图", supplement, undefined], "the person's own words, naming the supplement");
  } finally { await barrier.close(); }
  await browser.waitFor("!document.querySelector('[data-assistant-thread] .mw-receipt form')", 15_000);
  await browser.waitFor("[...document.querySelectorAll('body > p.mw-sr-only[role=status]')].some(node => node.textContent.includes('已保存，下一轮开始生效'))", 5_000);
  assert.equal((await readWork(browser, id)).rounds.length, rounds.length, "no round starts on its own");
  // RCPT-336: it waits in the work's session, so the tray after the rounds lists it; taken back from there, nothing waits.
  const queue = JSON.stringify("[data-assistant-thread] > .mw-tray ul[aria-label='排着，下一轮开始时带上']");
  await browser.waitFor(`document.querySelector(${queue})?.textContent.includes('这条针对的是')`, 15_000);
  await browser.evaluate(`[...document.querySelector(${queue}).querySelectorAll('button')].find(node => node.textContent === '撤回').click()`);
  await waitWork(browser, id, view => Array.isArray(view.queued_inputs) && view.queued_inputs.length === 0);
  await browser.waitFor(`!document.querySelector(${queue})`, 15_000);
  assert.equal((await readWork(browser, id)).rounds.length, rounds.length, "taking it back starts nothing either");
});

test("RC-16: a Send whose outcome was lost goes again after a refresh under the same key, and the Host keeps one round", { timeout: 120_000 }, async t => {
  const browser = await assistantPage(t, { replyText: "收到本次发送。" }); if (!browser) return;
  await send(browser, "第一句");
  const id = await browser.evaluate<string>("localStorage.getItem('molis.assistant.current')");
  await waitWork(browser, id, view => view.work.state === "completed");
  const barrier = await sendBarrier(browser, [{ urlPattern: "*/api/assistant/send", requestStage: "Response" }]);
  try {
    await putInput(browser, "第二句"); await browser.click("[data-assistant-send]");
    await barrier.drop(await barrier.next());
  } finally { await barrier.close(); }
  await browser.waitFor("Boolean(document.querySelector('.assistant-problem'))", 15_000);
  assert.equal(await browser.evaluate("document.querySelector('[data-assistant-input]').value"), "第二句", "the words stay in the composer");
  const kept = JSON.parse(await browser.evaluate<string>("localStorage.getItem('molis.assistant.unsent')")) as { work: string; text: string; id: string };
  assert.equal(kept.work, id); assert.equal(kept.text, "第二句");
  await browser.reloadPage();
  await browser.waitFor(`localStorage.getItem('molis.assistant.current') === ${JSON.stringify(id)}`);
  const again = await sendSeen(browser, "第二句");
  assert.equal(again.request_id, kept.id, "the same words to the same work go under the same key");
  await waitWork(browser, id, view => view.work.state === "completed");
  assert.deepEqual((await readWork(browser, id)).rounds.map(round => round.text), ["第一句", "第二句"], "the Host took the words once");
  assert.equal(await browser.evaluate("localStorage.getItem('molis.assistant.unsent')"), null, "an answered Send leaves nothing to resend");
  const fresh = await sendSeen(browser, "第三句");
  assert.notEqual(fresh.request_id, kept.id, "other words are a new Send");
});

test("RC-16: without local storage the Assistant still sends; only the key across a refresh is lost", { timeout: 90_000 }, async t => {
  const browser = await assistantPage(t, { replyText: "收到本次发送。" }, false); if (!browser) return;
  assert.equal(await browser.evaluate("(() => { try { localStorage; return 'open'; } catch { return 'blocked'; } })()"), "blocked");
  const first = await sendSeen(browser, "没有存储也能发");
  assert.equal(typeof first.request_id, "string");
  await browser.waitFor("[...document.querySelectorAll('[data-assistant-thread] .assistant-msg')].some(node => node.textContent.includes('收到本次发送。'))", 15_000);
  const second = await sendSeen(browser, "再补一句");
  assert.equal(typeof second.work_id, "string", "the second Send goes to the work the first one started");
  await browser.waitFor("[...document.querySelectorAll('[data-assistant-thread] .assistant-msg')].filter(node => node.textContent.includes('收到本次发送。')).length === 2", 15_000);
});

test("RC-19 (D32): words the person asked to keep that the write gate held show as 「你刚才让我记住」, the gate's reason only in the details, and one press keeps them", { timeout: 90_000 }, async t => {
  const browser = await assistantPage(t, { remember: { text: "周报先写风险", said: "周报先写风险" } }); if (!browser) return;
  await send(browser, "帮我整理这周的周报。另外请记住：周报先写风险");
  const id = await browser.evaluate<string>("localStorage.getItem('molis.assistant.current')");
  await waitWork(browser, id, view => view.work.state === "completed" && (view.memory_candidates?.length ?? 0) === 1);
  const candidate = (await readWork(browser, id)).memory_candidates![0]!;
  assert.match(candidate.held ?? "", /原样照抄/, "the person asked, and the gate's reason stays the memory service's own");
  const item = "[...document.querySelectorAll('[data-assistant-block=\"attention\"] .assistant-item')].find(node => node.textContent.includes('周报先写风险'))";
  await browser.waitFor(`Boolean(${item})`, 15_000);
  const shown = await browser.evaluate<{ title: string; sub: string; detail: string; primary: string }>(`(() => { const node = ${item}; return { title: node.querySelector('.assistant-item-title').textContent,
    sub: node.querySelector('.assistant-item-sub').textContent, detail: node.title, primary: node.querySelector('.assistant-item-actions button').textContent.trim() }; })()`);
  assert.deepEqual([shown.title, shown.sub, shown.primary], ["你刚才让我记住：周报先写风险", "个人", "记住"], "the card says what they asked, where it would go, and one press keeps it");
  assert.equal(shown.detail, candidate.held, "why it was not kept directly waits in the details");
  assert.doesNotMatch(await browser.evaluate<string>("document.querySelector('[data-assistant-thread]').textContent"), /原样照抄/, "the conversation does not read the gate's rule out");
  await shot(browser, "assistant-remember-asked.png");
  await browser.evaluate(`${item}.querySelector('.assistant-item-actions button').click()`);
  await waitWork(browser, id, view => !view.memory_candidates?.length);
});
