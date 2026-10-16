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
const receipts = (browser: SendBrowser) => browser.evaluate<string[]>("[...document.querySelectorAll('[data-assistant-thread] .assistant-receipt')].map(node => node.textContent)");

test("RC-14/RC-15: while a question waits the chip says what Send does, a supplement's receipt says the question still waits, and a changed receipt is a new line in the live thread", { timeout: 120_000 }, async t => {
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
  await browser.waitFor("[...document.querySelectorAll('.assistant-receipt')].some(node => node.textContent === '已补充到这一轮；上面的问题仍在等你')");
  assert.equal((await readWork(browser, id)).rounds.at(-1)!.awaiting_input.length, 1, "a supplement does not answer the question");
  assert.match(await browser.evaluate<string>("document.querySelector('.assistant-receipt').title"), /读到不代表已遵循/u);
  await shot(browser, "assistant-receipt-waiting.png");

  await browser.click("[data-assistant-answer]");
  await browser.evaluate("window.__waiting = document.querySelector('.assistant-receipt')");
  const answered = await sendSeen(browser, "首页点保存没有反应");
  assert.equal(answered.target, "answer");
  await waitWork(browser, id, view => view.work.state === "completed");
  const ended = ["AI 已读到", "这一轮结束时 AI 没读到，留给下一轮"];
  await browser.waitFor(`${JSON.stringify(ended)}.includes(document.querySelector('.assistant-receipt')?.textContent)`, 15_000)
    .catch(async error => assert.fail(`${error}; lines: ${JSON.stringify(await receipts(browser))}; turns: ${JSON.stringify((await readWork(browser, id)).rounds.at(-1)!.turns)}`));
  assert.equal(await browser.evaluate("document.contains(window.__waiting)"), false, "a changed receipt replaces its line, so the thread's live region reads it");
  assert.deepEqual(await browser.evaluate("(() => { const thread = document.querySelector('[data-assistant-thread]'); return [thread.getAttribute('role'), thread.getAttribute('aria-live'), thread.getAttribute('aria-relevant')]; })()"), ["log", "polite", "additions"]);
  assert.equal(await chip(browser), null, "with no question waiting there is no choice to make");
  await shot(browser, "assistant-receipt-read.png");
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
