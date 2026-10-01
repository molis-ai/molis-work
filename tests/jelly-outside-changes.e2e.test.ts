import assert from "node:assert/strict";
import test from "node:test";
import { openJellyStore } from "@molis-ai/molis-work-plugin-jelly";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// A change made outside the page (the Assistant through a Jelly capability) and an object opened by id (search, the side
// panel, an Assistant result) both have to show the workspace as stored, not as the page first loaded it.
test("Jelly shows what the Assistant changed and opens an item, note or idea by id", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const write = (change: Parameters<ReturnType<typeof openJellyStore>["execute"]>[0]) => {
    const store = openJellyStore(homeDirectory);
    try { return store.execute(change, store.read().revision); } finally { store.close(); }
  };
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=jelly` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-id=jelly]')");
  if (await evaluate("document.body.dataset.desktopSurface") !== "jelly") await click('[data-plugin-strip] [data-plugin-id=jelly]');
  await waitFor("document.body.dataset.desktopSurface === 'jelly' && document.querySelector('[data-jelly-period-title]').textContent.length > 0");

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  write({ type: "item.create", item: { id: "budget-sync", title: "和小李对预算", kind: "event", start_date: today, end_date: today, start_time: 900, end_time: 960 } });
  const shown = "[...document.querySelectorAll('[data-jelly-occurrence]')].some(node => node.textContent.includes('和小李对预算'))";
  assert.equal(await evaluate(shown), false, "the page still shows the workspace it loaded");
  // Another plugin's change is not Jelly's to reread.
  await evaluate("window.dispatchEvent(new CustomEvent('molis:assistant-effect', { detail: { work_id: 'w-1', capability_id: 'todo.items.create' } }))");
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(await evaluate(shown), false);
  await evaluate("window.dispatchEvent(new CustomEvent('molis:assistant-effect', { detail: { work_id: 'w-1', capability_id: 'jelly.item.create' } }))");
  await waitFor(shown);

  // Opened by id while the calendar shows: the idea, written after the page loaded, opens in its own view.
  write({ type: "inspiration.create", id: "wall-idea", title: "现场放一面用户留言墙", raw_text: "发布会现场可以放一面用户留言墙" });
  const select = (id: string) => evaluate(`document.querySelector('[data-work-surface="jelly"]').dispatchEvent(new CustomEvent('molis-work:select-item', { detail: { itemId: ${JSON.stringify(id)} } }))`);
  const declared = "JSON.parse(document.querySelector('[data-work-surface=\"jelly\"]').getAttribute('data-assistant-context') || '{}').object";
  await select("wall-idea");
  await waitFor("document.querySelector('[data-jelly-record-title]')?.value === '现场放一面用户留言墙'");
  assert.equal(await evaluate("document.querySelector('[data-jelly-view=\"inspirations\"]').getAttribute('aria-current')"), "page");
  assert.deepEqual(await evaluate(`(${declared}).id`), "wall-idea");

  // An item opens in its editor, and the page names it only while that editor is open.
  await select("budget-sync");
  await waitFor("document.querySelector('[data-jelly-item-dialog]').open && document.querySelector('[data-jelly-field=title]').value === '和小李对预算'");
  assert.deepEqual(await evaluate(`({ kind: (${declared}).kind, id: (${declared}).id })`), { kind: "jelly_item", id: "budget-sync" });
  await click("[data-jelly-item-dialog] [data-jelly-close-dialog]");
  await waitFor(`!document.querySelector('[data-jelly-item-dialog]').open && (${declared}) === undefined`);

  // Something taken back before it was opened says so instead of opening nothing.
  await select("gone-already");
  await waitFor("document.querySelector('[data-jelly-notice]').textContent === '这条内容已不存在'");
});
