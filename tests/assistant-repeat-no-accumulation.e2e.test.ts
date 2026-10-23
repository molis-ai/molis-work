import assert from "node:assert/strict";
import test from "node:test";
import { openWork, seedWork, sendBrowser } from "./fixtures/assistant-send-journey.js";
import { domCounters } from "./fixtures/dom-counters.js";

// specs/visual-ui-experience VUX-36「监听/计时/观察/请求/动画可释放，无无限缓存」, for the Assistant with real works: moving
// between three works that each finished a round (their steps, answers, side pane and long wait) again and again keeps the
// page's nodes, listeners and arrays where they were. tests/repeat-no-accumulation.e2e.test.ts does the panel on a new work.

test("VUX-36: moving between finished Assistant works again and again leaves nothing behind", { timeout: 300_000 }, async (t) => {
  const browser = await sendBrowser(t); if (!browser) return;
  const { command, sessionId, evaluate, waitFor } = browser;
  const works = [await seedWork(browser, "整理本周的会议记录"), await seedWork(browser, "列出下周要做的三件事"), await seedWork(browser, "给项目写一句简介")];
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const around = async () => {
    for (const id of works) {
      await openWork(browser, id);
      // The finished round's answer is drawn before the next move.
      await waitFor("document.querySelector('[data-assistant-panel]')?.textContent.includes('收到本次发送')", 10_000);
      await pause(150);
    }
  };
  await around(); await around();
  const before = await domCounters(command, sessionId);
  for (let i = 0; i < 15; i++) await around();
  const after = await domCounters(command, sessionId);
  t.diagnostic(`45 moves: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  assert.equal(await evaluate("localStorage.getItem('molis.assistant.current')"), works[2]);
  assert.ok(after.nodes <= before.nodes + 200, `nodes ${before.nodes} → ${after.nodes}`);
  assert.ok(after.listeners <= before.listeners + 10, `listeners ${before.listeners} → ${after.listeners}`);
  assert.ok(after.arrays - before.arrays < 40, `arrays ${before.arrays} → ${after.arrays}`);
});
