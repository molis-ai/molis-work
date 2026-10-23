import assert from "node:assert/strict";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/visual-ui-experience VUX-36「隐藏停无用渲染/轮询/动画但不取消后台真任务，恢复补齐」: two minutes of a hidden window and
// two minutes of Coding parked behind another plugin cost no reads; coming back reads once to catch up. Time runs on the
// real clock across the owner and opaque child renderers, so every interval has time to fire.

/** Counts the page's reads by path, and hides or shows the page as the browser would when the window goes behind others. */
const COUNT = `(() => {
  window.showPage = (shown) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => !shown });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => shown ? 'visible' : 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  };
})()`;

test("VUX-36: a hidden window and a parked plugin send no reads, and coming back catches up once", { timeout: 420_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, navigate, command, sessionId, origin, projectId } = browser;
  const coding = "/api/plugins/io.molis.work.coding/state";
  const child = await pluginFrameBrowser(t, browser, "coding");
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=coding` }, sessionId));
  await waitFor("document.querySelector('[data-assistant-composer]') && document.querySelector('button[data-plugin-id=coding].is-current')", 20_000);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await evaluate(COUNT);
  const reads: string[] = [];
  t.after(browser.on("Network.requestWillBeSent", params => {
    const request = params.request as {url:string};
    const url = new URL(request.url);
    if (url.origin === origin && url.pathname.includes("/api/")) reads.push(url.pathname.replace(/\/projects\/[^/]+/, ""));
  }));
  await command("Network.enable", {}, sessionId);
  const count = async (path?: string) => path ? reads.filter(one => one === path).length : reads.length;
  // DevTools' per-renderer virtual clocks cannot synchronize brokered requests between opaque frames.
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  // Shown, Coding reads its state as it runs; this is what hiding saves.
  await wait(30_000);
  const shown = await count(coding);
  assert.ok(shown >= 3, `a shown Coding keeps its state current (${shown} reads in 30 s)`);

  await evaluate("showPage(false)"); await child.waitFor("document.body.hidden"); reads.length = 0;
  await wait(120_000);
  assert.deepEqual(reads, [], "two minutes hidden: no reads at all");

  await evaluate("showPage(true)");
  await wait(1_000);
  assert.ok(await count(coding) >= 1, "coming back reads Coding's state to catch up");
  assert.ok(await count("/api/attention") >= 1, "and what waits for the person");

  // Parked behind Todo in the same window: Todo reads as it should, Coding does not.
  await evaluate("document.querySelector('button[data-plugin-id=todo]').click()");
  await waitFor("document.querySelector('button[data-plugin-id=todo].is-current')", 15_000);
  await wait(1_000);
  reads.length = 0;
  await wait(120_000);
  assert.equal(await count(coding), 0, "a parked Coding does not read its state");
  assert.ok(await count("/api/plugins/io.molis.work.todo/reminders") >= 1, "the plugin on show still does");
});
