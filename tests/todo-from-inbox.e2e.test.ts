import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openTodoStore } from "./fixtures/plugin-home-stores.js";
import { molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { specEvidenceDirectory } from "./fixtures/review-evidence.js";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";

for (const width of [1440, 390]) test(`RAC-135 RAC-136 Todo ${width}px: an Inbox entry and a 灵光 become todos that keep where they came from; neither original is handled for the person`, { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null);
  if (!browser) return;
  const { store, localHost, projectId, homeDirectory, command, sessionId, navigate, evaluate, waitFor, click, surfaceReady, origin } = browser;
  const todo = await pluginFrameBrowser(t, browser, "todo");
  const lingguang = await pluginFrameBrowser(t, browser, "lingguang");
  assert.ok(localHost); assert.ok(projectId);
  await localHost.withProject(molisWorkHostProjectReference({ databasePath: browser.databasePath, projectId }), () => undefined);
  const feed = createLocalFeedApplication(store.db);
  const source = createLocalFeedSourceService(store.db, projectId).register({ kind: "research_library", repository: "fixture/todo", research_source: "current" }).source;
  const item = feed.ingestItem({ source, externalId: "todo-from-inbox", title: "供应商报价需要回复", summary: "报价单", body: "请本周内确认报价", occurredAt: new Date().toISOString(), attention: false }).item;
  const entry = feed.ensureInboxEntryForFeedItem(projectId, item.item_id, "manual").entry;
  const todos = () => { const todo = openTodoStore(homeDirectory); try { return todo.list({ projectId, projectIds: [], actor: "user", actorId: "test" }); } finally { todo.close(); } };
  const output = new URL(`../${specEvidenceDirectory("specs/archive/todo-plugin/verification")}/`, import.meta.url);
  await mkdir(output, { recursive: true });
  const screenshot = async (name: string) => {
    await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    await writeFile(new URL(`todo-from-${name}-${width}.png`, output), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  };
  const CARD = (head: string) => `[...document.querySelectorAll('.placement-toast')].find(card => card.textContent.includes(${JSON.stringify(head)}))`;
  const visible = (selector: string) => `(() => { const node = document.querySelector(${JSON.stringify(selector)}); return Boolean(node && node.getClientRects().length); })()`;
  const load = async (query: string, plugin: string) => {
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/${query}` }, sessionId));
    await waitFor(`document.querySelector('[data-work-surface=${plugin}]')`);
  };

  await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);

  // Inbox: the entry's own detail offers it next to its other choices.
  // A link to the entry opens it the way search and other plugins do.
  await load(`?openPlugin=inbox&openItem=${encodeURIComponent(entry.entry_id)}`, "inbox");
  await waitFor("document.body.dataset.desktopSurface === 'inbox'");
  const detail = `[data-inbox-detail="${entry.entry_id}"]`;
  await waitFor(visible(`${detail} [data-context-intake=todo]`));
  await click(`${detail} [data-context-intake=todo]`);
  await waitFor(`Boolean(${CARD("已记成待办")})`, 10_000);
  const [fromInbox] = todos();
  assert.equal(fromInbox!.title, "供应商报价需要回复");
  assert.deepEqual([fromInbox!.placement, fromInbox!.project_id], ["project", projectId], "Inbox 属于项目，转成的待办也在这个项目");
  assert.deepEqual([fromInbox!.sources[0]!.kind, fromInbox!.sources[0]!.title, fromInbox!.sources[0]!.subject, fromInbox!.sources[0]!.open], ["material", "供应商报价需要回复", { kind: "inbox_entry", id: entry.entry_id }, null]);
  assert.equal(feed.getInboxEntry(projectId, entry.entry_id).status, "open", "转为待办不替你处理 Inbox 条目");
  assert.ok(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "不横向滚动");
  await screenshot("inbox");

  // Converting it again finds the same todo instead of making a second one.
  await evaluate("document.querySelectorAll('.placement-toast').forEach(card => card.remove())");
  await click(`${detail} [data-context-intake=todo]`);
  await waitFor(`Boolean(${CARD("已记成待办")})`, 10_000);
  assert.equal(todos().length, 1);

  // The todo opens from the completion card, shows where it came from, and that source opens the Inbox entry again.
  await evaluate(`[...${CARD("已记成待办")}.querySelectorAll('button')].find(button => button.textContent === '打开').click()`);
  await waitFor("document.body.dataset.desktopSurface === 'todo'");
  await todo.waitFor("document.querySelector('[data-todo-field=title]')?.value === '供应商报价需要回复'");
  await todo.waitFor(`document.querySelector('[data-todo-sources]').textContent.includes('供应商报价需要回复')`);
  await screenshot("inbox-todo");
  await todo.click(`[data-todo-sources] [data-workbench-item-plugin=inbox][data-workbench-item-id="${entry.entry_id}"]`);
  await waitFor(`document.body.dataset.desktopSurface === 'inbox' && ${visible(`${detail} .feed-detail-header`)}`);

  // 灵光: what is on screen, including words not saved yet, becomes the todo; the spark stays where it is.
  await load("", "lingguang");
  // Beside the project on a wide screen; from the plugin switcher on a narrow one.
  await click("[data-plugin-picker-popover] [data-plugin-id=lingguang]");
  await waitFor("document.body.dataset.desktopSurface === 'lingguang'");
  await surfaceReady("lingguang");
  await lingguang.evaluate(`document.querySelector("[data-lingguang-capture]").click()`);
  await lingguang.waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'true'");
  await lingguang.evaluate(`(() => {
    const title = document.querySelector("[data-lingguang-title]"), body = document.querySelector("[data-lingguang-body]");
    title.value = "给新人写一页入门"; body.value = "先列常见问题，再配截图。";
    title.dispatchEvent(new InputEvent("input", { bubbles: true })); body.dispatchEvent(new InputEvent("input", { bubbles: true }));
  })()`);
  await lingguang.waitFor("document.querySelector('[data-lingguang-todo]')");
  await evaluate("document.querySelectorAll('.placement-toast').forEach(card => card.remove())");
  await lingguang.click("[data-lingguang-todo]");
  await waitFor(`Boolean(${CARD("已记成待办")})`, 10_000);
  const spark = todos().find(todo => todo.title === "给新人写一页入门");
  assert.ok(spark, "灵光转成的待办");
  assert.deepEqual([spark.placement, spark.project_id], ["project", projectId], "灵光属于项目，转成的待办也在这个项目");
  assert.deepEqual([spark.sources[0]!.kind, spark.sources[0]!.excerpt, spark.sources[0]!.subject?.kind, spark.sources[0]!.open], ["material", "给新人写一页入门\n先列常见问题，再配截图。", "lingguang_spark", null]);
  assert.ok(await lingguang.evaluate("Boolean(document.querySelector('[data-lingguang-id]'))"), "灵光还在");
  assert.ok(await evaluate("document.documentElement.scrollWidth <= window.innerWidth") && await lingguang.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "不横向滚动");
  await screenshot("lingguang");

  // Discarding the spark leaves the todo as it is; its source then says the spark is gone instead of opening nothing.
  await lingguang.evaluate(`document.querySelector("[data-lingguang-discard-current]").click()`);
  await lingguang.waitFor("document.querySelector('[data-lingguang-confirm]')?.open");
  await lingguang.evaluate(`document.querySelector("[data-lingguang-confirm] [data-confirm-ok]").click()`);
  await lingguang.waitFor("!document.querySelector('[data-lingguang-id]')");
  assert.equal(todos().find(todo => todo.id === spark.id)?.status, "open", "丢掉灵光不影响待办");
  await load(`?openPlugin=todo&openItem=${encodeURIComponent(spark.id)}`, "todo");
  await waitFor("document.body.dataset.desktopSurface === 'todo'");
  await todo.waitFor("document.querySelector('[data-todo-field=title]')?.value === '给新人写一页入门'");
  await todo.click(`[data-todo-sources] [data-workbench-item-plugin=lingguang]`);
  await waitFor("document.body.dataset.desktopSurface === 'lingguang'");
  await lingguang.waitFor("document.querySelector('[data-lingguang-note]').textContent.includes('已丢掉或不存在')");
});
