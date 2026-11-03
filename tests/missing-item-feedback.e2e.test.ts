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

// VUX-12 「无权限 … 反馈准确」: a plugin that is refused the read (HTTP 403 from the Host's router: the plugin lacks the grant,
// or the project no longer enables it) says so where the missing-item words would have gone, and what the person can do. It must
// not say the item is gone: it is not, and "gone" sends the person looking for a deletion that did not happen.
const denied = { code: "actions.forbidden", error: "没有读取权限" };
const disabled = { code: "actions.plugin_disabled", error: "此项目未启用该插件" };
const permissionCases = [
  { plugin: "issues", said: "[data-issue-gone]", path: "/io.molis.work.issues/", toast: "[data-issue-toast]" },
  { plugin: "workflows", said: "[data-wf-gone]", path: "/io.molis.work.native.workflows/", toast: "[data-wf-toast]" },
  { plugin: "alchemist", said: "[data-alc-notice]", path: "/api/alchemist/", toast: "" },
  { plugin: "pages", said: "[data-pages-note]", path: "/io.molis.work.pages/", toast: "" },
  { plugin: "todo", said: "[data-todo-note-text]", path: "/io.molis.work.todo/", toast: "" },
  { plugin: "jelly", said: "[data-jelly-notice]", path: "/io.molis.work.jelly/", toast: "" },
  { plugin: "lingguang", said: "[data-lingguang-note]", path: "/io.molis.work.lingguang/", toast: "" },
  { plugin: "coding", said: "[data-coding-status]", path: "/io.molis.work.coding/", toast: "" },
];

test("VUX-12: a plugin refused the read says it is a permission matter (or that the project turned it off) where the missing-item words go, never that the item is gone", { timeout: 360_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, navigate, waitFor, origin, projectId, on } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  let refusal: { path: string; body: Record<string, string> } | null = null;
  const answered: string[] = [];
  t.after(on("Fetch.requestPaused", async (event, session) => {
    if (session !== sessionId) return;
    const request = event.request as { url: string; method: string };
    const requestId = String(event.requestId);
    if (refusal && request.method === "GET" && request.url.includes(refusal.path)) {
      answered.push(request.url);
      await command("Fetch.fulfillRequest", { requestId, responseCode: 403, responseHeaders: [{ name: "content-type", value: "application/json" }], body: Buffer.from(JSON.stringify(refusal.body)).toString("base64") }, sessionId);
    } else await command("Fetch.continueRequest", { requestId }, sessionId).catch(() => undefined);
  }));
  await command("Fetch.enable", { patterns: [{ urlPattern: "*/api/*", requestStage: "Request" }] }, sessionId);
  t.after(() => command("Fetch.disable", {}, sessionId).catch(() => undefined));
  // Every plugin is walked and every miss collected, so one run shows the whole picture instead of the first plugin that fails.
  const problems: string[] = [];
  const check = (ok: boolean, message: string) => { if (!ok) problems.push(message); };
  for (const { plugin, said, path, toast } of permissionCases) {
    const child = await pluginFrameBrowser(t, browser, plugin);
    const surface = `document.querySelector('[data-work-surface="${plugin}"]')`;
    const shown = `[...${surface}.querySelectorAll('${said}')].filter((node) => node.checkVisibility()).map((node) => node.textContent)`;
    refusal = null;
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}?openPlugin=${plugin}` }, sessionId));
    await waitFor(`!!${surface}?.checkVisibility()`, 20_000);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await evaluate(`window.__unreadable = []; document.addEventListener('molis-work:item-unreadable', (event) => window.__unreadable.push(event.detail.itemId))`);
    for (const [kind, body, words, itemId] of [["permission", denied, ["没有权限", "授权在设置里管理"], "denied-item-1"], ["disabled", disabled, ["停用了这个插件", "插件市场"], "denied-item-2"]] as const) {
      refusal = { path, body };
      answered.length = 0;
      await evaluate(`${surface}.dispatchEvent(new CustomEvent('molis-work:select-item', { detail: { itemId: ${JSON.stringify(itemId)} } }))`);
      const said_ = await child.waitFor(`${shown}.some((text) => ${JSON.stringify(words)}.every((word) => text.includes(word)))`, 8_000).then(() => true, () => false);
      if (!said_) { problems.push(`${plugin} ${kind}: the page does not say so (asked ${answered.length} read(s); shows ${JSON.stringify(await child.evaluate<string[]>(shown))})`); continue; }
      // It stays, in the same place the missing words go, and does not call the item gone.
      await new Promise((resolve) => setTimeout(resolve, 4500));
      const text = (await child.evaluate<string[]>(shown)).join(" ");
      check(words.every((word) => text.includes(word)), `${plugin} ${kind}: the words do not stay on the page`);
      check(!/不存在|已删除|已不在|找不到|已丢掉/u.test(text), `${plugin} ${kind}: it calls the item gone (${text})`);
      if (toast) check(!(await child.evaluate<boolean>(`[...${surface}.querySelectorAll('${toast}')].some((node) => node.checkVisibility())`)), `${plugin}: a toast was used`);
      check(await evaluate<boolean>(`window.__unreadable.includes(${JSON.stringify(itemId)})`), `${plugin} ${kind}: the workbench is not told the item cannot be read`);
      check((await evaluate<string | null>(`(JSON.parse(${surface}.getAttribute('data-assistant-context') || 'null')?.object?.id) ?? null`)) === null, `${plugin} ${kind}: the surface is named after the item it cannot read`);
    }
    refusal = null;
  }
  assert.deepEqual(problems, []);
});
