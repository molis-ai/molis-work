import assert from "node:assert/strict";
import test from "node:test";
import { purgeAssistantProject } from "@molis-ai/molis-work-app-local-host";
import { openWork, putInput, readWork, seedWork, sendBarrier, sendBrowser, waitWork } from "./fixtures/assistant-send-journey.js";

// W2-18-ASSISTANT-404-01: the real owner removes A, Chrome delays its actual 404, and B's real read wins first.
test("W2-18-ASSISTANT-404-01: A's late 404 preserves B while deleting the work still in view exits it", { timeout: 120_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const a = await seedWork(browser, "即将删除的 A"), b = await seedWork(browser, "有效 B", "personal");
  await openWork(browser, a);
  await browser.waitFor("document.querySelector('[data-assistant-thread]').textContent.includes('即将删除的 A')");
  assert.equal(await purgeAssistantProject(browser.homeDirectory, browser.projectId!), 1);
  const missing = await fetch(`${browser.origin}/api/assistant/works/${a}`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json() as { code: string }).code, "assistant.not_found");
  const beforeB = await readWork(browser, b);
  await browser.command("Network.enable", {}, browser.sessionId);
  const barrier = await sendBarrier(browser, [{ urlPattern: `*/api/assistant/works/${a}`, requestStage: "Response" }]);
  try {
    await browser.evaluate("window.dispatchEvent(new Event('focus'))");
    const late = await barrier.next();
    assert.equal(late.responseStatusCode, 404, "the delayed reply is from the production Host's missing-work branch");
    assert.ok(late.networkId, "the held reply has a corresponding real network request");
    await openWork(browser, b);
    await browser.waitFor("document.querySelector('[data-assistant-thread]').textContent.includes('有效 B')");
    await putInput(browser, "B 留下的草稿", "B 的材料");
    const delivered = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { off(); reject(new Error("The delayed 404 was not delivered")); }, 5_000);
      const off = browser.on("Network.loadingFinished", (event, session) => { if (session === browser.sessionId && event.requestId === late.networkId) { clearTimeout(timer); off(); resolve(); } });
    });
    await barrier.release(late);
    await delivered;
    // Drain the page's fetch/JSON reaction after Chrome delivered the HTTP reply.
    await browser.evaluate("new Promise(resolve => setTimeout(resolve, 0))");
    assert.equal(await browser.evaluate("localStorage.getItem('molis.assistant.current')"), b);
    assert.equal(await browser.evaluate("document.querySelector('[data-assistant-input]').value"), "B 留下的草稿");
    assert.match(await browser.evaluate<string>("document.querySelector('[data-assistant-materials]').getAttribute('aria-label')"), /B 的材料/);
    assert.deepEqual((await readWork(browser, b)).rounds, beforeB.rounds);
    await waitWork(browser, b, view => view.work.draft === "B 留下的草稿");
  } finally { await barrier.close(); }
  await browser.reloadPage();
  await browser.waitFor("document.querySelector('[data-assistant-input]').value === 'B 留下的草稿'");
  assert.equal(await browser.evaluate("localStorage.getItem('molis.assistant.current')"), b, "B's choice and unsent draft persist across reload");

  const c = await seedWork(browser, "当前页被删除的工作");
  await openWork(browser, c);
  await browser.waitFor("document.querySelector('[data-assistant-thread]').textContent.includes('当前页被删除的工作')");
  assert.equal(await purgeAssistantProject(browser.homeDirectory, browser.projectId!), 1);
  await browser.evaluate("window.dispatchEvent(new Event('focus'))");
  await browser.waitFor("localStorage.getItem('molis.assistant.current') === null && document.querySelector('[data-assistant-target-wrap]').dataset.mode === 'new'");
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-assistant-thread] > [data-round]').length"), 0);
  assert.deepEqual((await readWork(browser, b)).rounds, beforeB.rounds, "exiting a deleted work leaves the valid work alone");
});
