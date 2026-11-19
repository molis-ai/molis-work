import assert from "node:assert/strict";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/visual-ui-experience VUX-36「隐藏停无用渲染/轮询/动画但不取消后台真任务，恢复补齐」: two minutes of a hidden window and
// two minutes of Coding parked behind another plugin cost no reads; coming back reads once to catch up.
// Poll timers (>= 1 s) are uniformly accelerated 10x in both the owner document and opaque plugin iframes so two full
// virtual minutes of real browser scheduling and brokered requests execute in ~13 s wall time without touching product code.

const POLL_SCALE = 10;
const SCALE_TIMERS = `(() => {
  const scale = ${POLL_SCALE};
  const scaleInterval = (ms) => {
    const delay = Number(ms);
    return Number.isFinite(delay) && delay >= 1000 ? Math.max(50, Math.round(delay / scale)) : ms;
  };
  // Leave 10 s–20 s frame-handshake and waitFor deadlines untouched; only scale 1–8 s and >=30 s poll timers.
  const scaleTimeout = (ms) => {
    const delay = Number(ms);
    return Number.isFinite(delay) && ((delay >= 1000 && delay <= 8000) || delay >= 30000) ? Math.max(50, Math.round(delay / scale)) : ms;
  };
  const origInterval = globalThis.setInterval.bind(globalThis);
  const origTimeout = globalThis.setTimeout.bind(globalThis);
  globalThis.setInterval = (fn, ms, ...args) => origInterval(fn, scaleInterval(ms), ...args);
  globalThis.setTimeout = (fn, ms, ...args) => origTimeout(fn, scaleTimeout(ms), ...args);
})()`;

/** Counts the page's reads by path, and hides or shows the page as the browser would when the window goes behind others. */
const COUNT = `(() => {
  window.showPage = (shown) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => !shown });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => shown ? 'visible' : 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  };
})()`;

test("VUX-36: a hidden window and a parked plugin send no reads, and coming back catches up once", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, navigate, command, sessionId, origin, projectId } = browser;
  const coding = "/api/plugins/io.molis.work.coding/state";
  await command("Page.addScriptToEvaluateOnNewDocument", { source: SCALE_TIMERS }, sessionId);
  browser.setFrameInitScript(SCALE_TIMERS);
  const child = await pluginFrameBrowser(t, browser, "coding");
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=coding` }, sessionId));
  await waitFor("document.querySelector('[data-assistant-composer]') && document.querySelector('button[data-plugin-id=coding].is-current')", 20_000);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await evaluate(COUNT);
  const reads: string[] = [];
  t.after(browser.on("Network.requestWillBeSent", params => {
    const request = params.request as {url:string};
    const url = new URL(request.url);
    if (url.origin === origin && url.pathname.includes("/api/")) reads.push(url.pathname.replace(/\/projects\/[^/]+/, ""));
  }));
  await command("Network.enable", {}, sessionId);
  const count = async (path?: string) => path ? reads.filter(one => one === path).length : reads.length;
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const waitUntil = async (ready: () => Promise<boolean>, timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await ready()) return;
      await wait(100);
    }
  };
  // Shown, Coding reads its state as it runs; wait for >= 3 scaled-interval reads instead of a fixed 30 s sleep.
  await waitUntil(async () => (await count(coding)) >= 3, 25_000);
  const shown = await count(coding);
  assert.ok(shown >= 3, `a shown Coding keeps its state current (${shown} reads)`);

  await evaluate("showPage(false)"); await child.waitFor("document.body.hidden"); reads.length = 0;
  // >2 minutes scaled time hidden: no reads at all.
  await wait(13_000);
  assert.deepEqual(reads, [], "two minutes hidden: no reads at all");

  await evaluate("showPage(true)");
  await waitUntil(async () => (await count(coding)) >= 1 && (await count("/api/attention")) >= 1, 5_000);
  assert.ok(await count(coding) >= 1, "coming back reads Coding's state to catch up");
  assert.ok(await count("/api/attention") >= 1, "and what waits for the person");

  // Parked behind Todo in the same window (>2 minutes scaled time): Todo reads as it should, Coding does not.
  await evaluate("document.querySelector('button[data-plugin-id=todo]').click()");
  await waitFor("document.querySelector('button[data-plugin-id=todo].is-current')", 15_000);
  await wait(1_000);
  reads.length = 0;
  await wait(13_000);
  assert.equal(await count(coding), 0, "a parked Coding does not read its state");
  assert.ok(await count("/api/plugins/io.molis.work.todo/reminders") >= 1, "the plugin on show still does");
});
