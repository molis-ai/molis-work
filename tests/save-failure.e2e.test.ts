import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { sendBarrier } from "./fixtures/assistant-send-journey.js";

// specs/visual-ui-experience VUX-31「乐观失败可恢复」: a setting saved the moment it is changed goes back to what was saved
// when the save fails, and says so in its own block. Shelf's settings drop the real save request in Chrome (the connection
// closes, nothing mocked). Before, the failure was swallowed: the drop wheel went back without a word, and an action's
// "on the bar" toggle failed in silence.

// A save whose request was dropped may or may not have been done: the page's request helper says so, as it does on every page.
const LOST_WRITE = "不知道这次操作有没有完成，请刷新后核对";
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("VUX-31: a Shelf setting whose save fails goes back to what was saved and says so in its block", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/settings/shelf` }, sessionId));
  await waitFor("!!document.querySelector('[data-shelf-drop-wheel]') && !!document.querySelector('[data-shelf-action-visible]')", 15_000);
  await pause(500);
  const alertIn = (control: string) => `(() => { const block = document.querySelector(${JSON.stringify(control)}).closest('.shelf-settings-block, .settings-section'), line = block.querySelector(':scope > [data-shelf-save-error]');
    return line && !line.hidden ? { text: line.textContent, role: line.getAttribute('role') } : null; })()`;
  const failNextSave = async (click: string) => {
    const barrier = await sendBarrier(browser as never, [{ urlPattern: "*api/plugins/io.molis.work.shelf/settings*", requestStage: "Request" }]);
    await evaluate(click);
    for (;;) { const held = await barrier.next(); if ((held.request as { method?: string }).method === "POST") { await barrier.drop(held); break; } await barrier.release(held); }
    await pause(600); await barrier.close();
  };

  const wheel = "[data-shelf-drop-wheel]", before = await evaluate<boolean>(`document.querySelector('${wheel}').checked`);
  await failNextSave(`document.querySelector('${wheel}').click()`);
  assert.equal(await evaluate(`document.querySelector('${wheel}').checked`), before, "the switch goes back to what was saved");
  assert.equal(await evaluate(`document.querySelector('${wheel}').disabled`), false);
  assert.deepEqual(await evaluate(alertIn(wheel)), { text: LOST_WRITE, role: "alert" }, "the failure is said beside the switch");

  const toggle = "[data-shelf-action-visible]", pressed = await evaluate<string>(`document.querySelector('${toggle}').getAttribute('aria-pressed')`);
  await failNextSave(`document.querySelector('${toggle}').click()`);
  assert.equal(await evaluate(`document.querySelector('${toggle}').getAttribute('aria-pressed')`), pressed, "the action keeps what was saved");
  assert.deepEqual(await evaluate(alertIn(toggle)), { text: LOST_WRITE, role: "alert" }, "the failure is said in the actions' block");

  // Trying again with the connection back saves it and the line goes.
  await evaluate(`document.querySelector('${wheel}').click()`);
  await waitFor(`document.querySelector('${wheel}').checked === ${!before} && !document.querySelector('${wheel}').disabled`, 10_000);
  await pause(300);
  assert.equal(await evaluate(alertIn(wheel)), null, "a save that works clears the failure");
  const saved = await evaluate<{ drop_wheel_enabled: boolean }>("fetch('/api/plugins/io.molis.work.shelf/settings', { cache: 'no-store' }).then((r) => r.json())");
  assert.equal(saved.drop_wheel_enabled, !before);
});
