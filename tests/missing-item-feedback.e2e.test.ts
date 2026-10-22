import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/visual-ui-experience VUX-12 「失效、读取失败反馈准确可恢复」: an item the workbench opens in a plugin (a tab from a
// result, a notice, a link) that its owner no longer has is said to be gone in the plugin's own words. Workflows said
// 「页面或接口不存在」 (the Host's words for any missing address) and Alchemist said nothing at all. A reopen the person did
// not ask for (molis-work:select-item with quiet, after a reload or on Back) still forgets such an item without a word.
const missing = "missing-item-1";

test("VUX-12: Workflows and Alchemist say an item they were asked to open is gone, and stay quiet on a quiet reopen", { timeout: 150_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, navigate, waitFor, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  const cases = [
    { plugin: "workflows", said: "[data-wf-toast]", words: "这条流程不存在或已删除" },
    { plugin: "alchemist", said: "[data-alc-notice]", words: "这一项已不存在或已删除" },
  ];
  for (const { plugin, said, words } of cases) {
    const surface = `document.querySelector('[data-work-surface="${plugin}"]')`;
    const shown = `[...${surface}.querySelectorAll('${said}')].filter((node) => node.checkVisibility()).map((node) => node.textContent)`;
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}?openPlugin=${plugin}&openItem=${missing}&openTitle=${encodeURIComponent("不在了的条目")}` }, sessionId));
    await waitFor(`!!${surface}?.checkVisibility() && ${shown}.some((text) => text.includes(${JSON.stringify(words)}))`, 20_000);

    // Quiet: the same request, marked as a reopen the person did not ask for, leaves no word behind.
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}?openPlugin=${plugin}` }, sessionId));
    await waitFor(`!!${surface}?.checkVisibility()`, 20_000);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await evaluate(`${surface}.dispatchEvent(new CustomEvent('molis-work:select-item', { detail: { itemId: ${JSON.stringify(missing)}, quiet: true } }))`);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    assert.deepEqual(await evaluate<string[]>(`${shown}.filter((text) => text.trim())`), [], `${plugin}: a quiet reopen of a gone item says nothing`);
  }
});
