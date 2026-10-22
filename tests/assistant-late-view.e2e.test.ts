import assert from "node:assert/strict";
import test from "node:test";
import { openWork, seedWork, sendBarrier, sendBrowser } from "./fixtures/assistant-send-journey.js";

// specs/visual-ui-experience VUX-12 「迟到响应不串会话」: the person opens one work and, before its view arrives, turns to
// another. The first work's view, arriving late, does not take the panel: the title, the conversation and the side groups
// stay the second work's, and the one it remembers is the second. Chrome holds the real Host's reply; nothing is mocked.
test("VUX-12: a work's view that arrives after the person turned to another work does not take the panel", { timeout: 120_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const { evaluate, waitFor } = browser;
  const first = await seedWork(browser, "甲：整理本周周报");
  const second = await seedWork(browser, "乙：订三楼的会议室");
  await openWork(browser, second);
  const shows = (text: string) => `document.querySelector('[data-assistant-work-title]').textContent.includes(${JSON.stringify(text)})
    && document.querySelector('[data-assistant-thread]').textContent.includes(${JSON.stringify(text)})`;
  await waitFor(shows("乙：订三楼的会议室"), 15_000);

  const barrier = await sendBarrier(browser, [{ urlPattern: `*/api/assistant/works/${first}`, requestStage: "Response" }]);
  await evaluate(`document.dispatchEvent(new CustomEvent('molis:assistant-open', { detail: { work_id: '${first}' } }))`);
  const late = await barrier.next();
  await evaluate(`document.dispatchEvent(new CustomEvent('molis:assistant-open', { detail: { work_id: '${second}' } }))`);
  await waitFor(`localStorage.getItem('molis.assistant.current') === '${second}' && ${shows("乙：订三楼的会议室")}`, 15_000);
  await barrier.release(late);
  await barrier.close();
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // The tabs name both works; the summary, the conversation and the side groups are the second's alone.
  assert.deepEqual(await evaluate(`[localStorage.getItem('molis.assistant.current'), document.querySelector('[data-assistant-work-title]').textContent,
    ...['[data-assistant-thread]', '.assistant-summary', '[data-assistant-block]'].map((selector) => [...document.querySelectorAll('[data-assistant-panel] ' + selector)].some((node) => node.textContent.includes('甲：整理本周周报')))]`),
    [second, "乙：订三楼的会议室", false, false, false], "the late view of 甲 drew nothing of itself into 乙's panel");
});
