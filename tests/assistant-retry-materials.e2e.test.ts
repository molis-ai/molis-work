import assert from "node:assert/strict";
import test from "node:test";
import { issueModel } from "./fixtures/issue-model.js";
import { openWork, putInput, readWork, seedWork, sendBarrier, sendBrowser, waitWork } from "./fixtures/assistant-send-journey.js";

test("UIV-03/04 retry after model failure restores complete materials after reload and sends them once", { timeout: 120_000 }, async t => {
  const browser = await sendBrowser(t, false); if (!browser) return;
  const behavior = { replyText: "收到重试。", unavailable: false };
  const model = await issueModel(t, browser.homeDirectory, behavior);
  const work = await seedWork(browser, "材料重试");
  await openWork(browser, work);
  const body = "长材料正文".repeat(5000) + "完整末尾";
  await putInput(browser, "重试时需要完整材料");
  await browser.evaluate(`(() => { const items = new DataTransfer(); items.items.add(new File([${JSON.stringify(body)}], '完整材料.txt', { type: 'text/plain' })); const input = document.querySelector('[data-assistant-file]'); input.files = items.files; input.dispatchEvent(new Event('change')); })()`);
  await browser.waitFor("document.querySelector('[data-assistant-context-strip]').textContent.includes('完整材料.txt')");
  behavior.unavailable = true;
  await browser.click("[data-assistant-send]");
  const failed = await waitWork(browser, work, view => view.rounds.at(-1)?.phase === "failed");
  assert.equal(failed.rounds.length, 2);
  await browser.reloadPage(); await openWork(browser, work);
  await browser.waitFor("document.querySelector('[data-ix-step-id=retry]')");
  await browser.click("[data-ix-step-id=retry]");
  await browser.waitFor("document.querySelector('[data-assistant-input]').value === '重试时需要完整材料'");
  assert.match(await browser.evaluate<string>("document.querySelector('[data-assistant-context-strip]').textContent"), /完整材料/);
  behavior.unavailable = false;
  const requestsBefore = model.requests.length;
  await browser.click("[data-assistant-send]");
  const recovered = await waitWork(browser, work, view => view.rounds.length === 3 && view.rounds.at(-1)?.phase === "completed");
  assert.equal(model.requests.length, requestsBefore + 1);
  assert.ok(JSON.stringify(model.requests.at(-1)).includes("完整末尾"), "the model receives the full material, not its 20k preview");
  assert.deepEqual(recovered.rounds.at(-1)?.materials.map(m => m.title), ["完整材料.txt"]);
  assert.equal(recovered.work.draft, "");
});

test("UIV-04 a delayed retry material read cannot overwrite another work's newer draft", { timeout: 120_000 }, async t => {
  const browser = await sendBrowser(t, false); if (!browser) return;
  const behavior = { replyText: "收到。", unavailable: false };
  await issueModel(t, browser.homeDirectory, behavior);
  const a = await seedWork(browser, "失败的 A"), b = await seedWork(browser, "保留的 B");
  await openWork(browser, a); await putInput(browser, "A 的重试", "A 的文件");
  behavior.unavailable = true; await browser.click("[data-assistant-send]");
  await waitWork(browser, a, view => view.rounds.at(-1)?.phase === "failed");
  await browser.waitFor("document.querySelector('[data-ix-step-id=retry]')");
  const barrier = await sendBarrier(browser, [{ urlPattern: `*/api/assistant/works/${a}/materials/*`, requestStage: "Response" }]);
  try {
    await browser.click("[data-ix-step-id=retry]"); const pending = await barrier.next();
    await openWork(browser, b); await putInput(browser, "B 的新文字", "B 的文件");
    await barrier.release(pending);
    await browser.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    assert.equal(await browser.evaluate("document.querySelector('[data-assistant-input]').value"), "B 的新文字");
    const labels = await browser.evaluate<string>("document.querySelector('[data-assistant-context-strip]').textContent");
    assert.match(labels, /B 的文件/); assert.doesNotMatch(labels, /A 的文件/);
    assert.equal((await readWork(browser, b)).rounds.length, 1);
  } finally { await barrier.close(); }
});
