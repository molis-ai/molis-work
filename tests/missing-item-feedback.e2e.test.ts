import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/visual-ui-experience VUX-12 「失效、读取失败反馈准确可恢复」: an item the workbench opens in a plugin (a tab from a
// result, a notice, a link) that its owner no longer has is said to be gone in the plugin's own words. Workflows said
// 「页面或接口不存在」 (the Host's words for any missing address) and Alchemist said nothing at all. A reopen the person did
// not ask for (molis-work:select-item with quiet, after a reload or on Back) still forgets such an item without a word.
// User decisions of 2026-10-21: ④ the words stay on the page where the item would have been (Issues and Workflows used a
// toast that went away), and ③ the plugin tells the workbench (molis-work:item-unreadable), which then neither names the
// surface after the tab nor lets the Assistant carry it as 「正在看」.
const missing = "missing-item-1";
const title = "不在了的条目";

test("VUX-12: Issues, Workflows and Alchemist say on the page that an item they were asked to open is gone, and stay quiet on a quiet reopen", { timeout: 180_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, navigate, waitFor, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  const cases = [
    { plugin: "issues", said: "[data-issue-gone]", toast: "[data-issue-toast]", words: "这条问题不存在或已删除" },
    { plugin: "workflows", said: "[data-wf-gone]", toast: "[data-wf-toast]", words: "这条流程不存在或已删除" },
    { plugin: "alchemist", said: "[data-alc-notice]", toast: "", words: "这一项已不存在或已删除" },
  ];
  for (const { plugin, said, toast, words } of cases) {
    const child=await pluginFrameBrowser(t,browser,plugin);
    const surface = `document.querySelector('[data-work-surface="${plugin}"]')`;
    const shown = `[...${surface}.querySelectorAll('${said}')].filter((node) => node.checkVisibility()).map((node) => node.textContent)`;
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}?openPlugin=${plugin}&openItem=${missing}&openTitle=${encodeURIComponent(title)}` }, sessionId));
    await child.waitFor(`!!${surface}?.checkVisibility() && ${shown}.some((text) => text.includes(${JSON.stringify(words)}))`, 20_000);
    // It stays: a toast would have gone after 3.5 seconds.
    await new Promise((resolve) => setTimeout(resolve, 4500));
    assert.ok((await child.evaluate<string[]>(shown)).some((text) => text.includes(words)), `${plugin}: the words stay on the page`);
    if (toast) assert.equal(await child.evaluate<boolean>(`[...${surface}.querySelectorAll('${toast}')].some((node) => node.checkVisibility())`), false, `${plugin}: no toast`);
    // The workbench did not name the surface after the gone item, and the Assistant does not offer it as what is in view.
    assert.equal(await evaluate<string | null>(`(JSON.parse(${surface}.getAttribute('data-assistant-context') || 'null')?.object?.id) ?? null`), null, `${plugin}: not named after the gone item`);
    assert.equal(await evaluate<boolean>(`[...document.querySelectorAll('body *')].some((node) => node.children.length === 0 && node.checkVisibility() && node.textContent.includes(${JSON.stringify(`正在看：${title}`)}))`), false, `${plugin}: not 正在看`);

    // Quiet: the same request, marked as a reopen the person did not ask for, leaves no word behind.
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}?openPlugin=${plugin}` }, sessionId));
    await waitFor(`!!${surface}?.checkVisibility()`, 20_000);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await evaluate(`${surface}.dispatchEvent(new CustomEvent('molis-work:select-item', { detail: { itemId: ${JSON.stringify(missing)}, quiet: true } }))`);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    assert.deepEqual(await child.evaluate<string[]>(`${shown}.filter((text) => text.trim())`), [], `${plugin}: a quiet reopen of a gone item says nothing`);
  }
});

test("VUX-12: every plugin that opens items by id tells the workbench when the item is gone, so the Assistant does not carry it", { timeout: 180_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, navigate, waitFor, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  for (const plugin of ["pages", "todo", "jelly", "lingguang", "coding"]) {
    const surface = `document.querySelector('[data-work-surface="${plugin}"]')`;
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}?openPlugin=${plugin}` }, sessionId));
    await waitFor(`!!${surface}?.checkVisibility()`, 20_000);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await evaluate(`window.__unreadable = []; document.addEventListener('molis-work:item-unreadable', (event) => window.__unreadable.push(event.detail.itemId))`);
    await evaluate(`${surface}.dispatchEvent(new CustomEvent('molis-work:select-item', { detail: { itemId: ${JSON.stringify(missing)} } }))`);
    await waitFor(`window.__unreadable.includes(${JSON.stringify(missing)})`, 15_000);
    await new Promise((resolve) => setTimeout(resolve, 800));
    assert.equal(await evaluate<string | null>(`(JSON.parse(${surface}.getAttribute('data-assistant-context') || 'null')?.object?.id) ?? null`), null, `${plugin}: not named after the gone item`);
  }
});
