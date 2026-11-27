import assert from "node:assert/strict";
import test from "node:test";
import { openJellyStore } from "./fixtures/plugin-home-stores.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// The Jelly page (batch 112-2, Plan B): a calendar beside the chosen day, and notes; every write goes through Jelly's actions.
for (const width of [1440, 390]) test(`Jelly ${width}px: quick add, a new event, the day's note and a note survive reload`, { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  const { command, sessionId, navigate, reloadPage, origin, projectId, homeDirectory } = browser;
  const { evaluate, waitFor, click } = await pluginFrameBrowser(t, browser, "jelly");
  const rows = () => { const store = openJellyStore(homeDirectory, projectId!); try { return store.read(s => ({ items: s.items("2000-01-01", "2100-12-31"), notes: s.notes() })); } finally { store.close(); } };
  const open = async () => {
    await browser.waitFor("document.querySelector('[data-plugin-id=jelly]')");
    if (await browser.evaluate("document.body.dataset.desktopSurface") !== "jelly") await browser.click("[data-plugin-strip] [data-plugin-id=jelly]");
    await waitFor("!!document.querySelector('[data-jelly-page] [data-jelly-day]')", 20_000);
  };
  await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=jelly` }, sessionId));
  await open();
  assert.equal(await evaluate("document.querySelector('[data-jelly-tab=calendar]').getAttribute('aria-selected')"), "true");

  // The day rail: one line and Enter adds a task to the chosen day.
  await evaluate(`(() => { const input = document.querySelector('[data-jelly-quick]'); input.value = '买菜'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
  await waitFor("[...document.querySelectorAll('[data-jelly-open]')].some(node => node.textContent.includes('买菜'))");
  assert.deepEqual(rows().items.map(item => [item.title, item.kind]), [["买菜", "task"]]);

  // A new event from the panel.
  await click('[data-jelly-act="new"]');
  await waitFor("!!document.querySelector('[data-jelly-panel] input[name=title]')");
  await evaluate(`(() => { const input = document.querySelector('[data-jelly-panel] input[name=title]'); input.value = '团队复盘'; document.querySelector('[data-jelly-form]').requestSubmit(); })()`);
  await waitFor("!document.querySelector('[data-jelly-panel]')");
  assert.deepEqual(rows().items.map(item => item.title).sort(), ["买菜", "团队复盘"]);

  // The chosen day's note saves itself and is pinned to that day.
  await evaluate(`(() => { const box = document.querySelector('[data-jelly-day-note] [data-jelly-note-body]'); box.value = '今天先把周报写完'; box.dispatchEvent(new InputEvent('input', { bubbles: true })); })()`);
  await waitFor("document.querySelector('[data-jelly-day-note] [data-jelly-note-status]')?.dataset.mwState === 'saved'", 10_000);
  const dayNote = rows().notes[0]!;
  assert.equal(dayNote.body, "今天先把周报写完"); assert.ok(dayNote.day);

  // The notes tab lists it, and a new note is written there.
  await click('[data-jelly-tab="notes"]');
  await waitFor(`!!document.querySelector('[data-jelly-note="${dayNote.id}"]')`);
  await click('[data-jelly-act="new-note"]');
  await waitFor("!!document.querySelector('[data-jelly-notes-editor] [data-jelly-note-body]')");
  await evaluate(`(() => { const box = document.querySelector('[data-jelly-notes-editor] [data-jelly-note-body]'); box.value = '# 读书\\n\\n- 第三章'; box.dispatchEvent(new InputEvent('input', { bubbles: true })); box.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); })()`);
  await waitFor("document.querySelectorAll('[data-jelly-note]').length === 2", 10_000);
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);

  // A deletion is undone from the workbench's toast (Decision 60): the frame keeps the undo and the toast hands the press back.
  await evaluate(`document.querySelector('[data-jelly-act="delete-note"]').click()`);
  await waitFor("document.querySelectorAll('[data-jelly-note]').length === 1", 10_000);
  assert.equal(rows().notes.length, 1);
  await browser.waitFor("!!document.querySelector('[data-toast] [data-toast-action]')");
  await browser.evaluate("document.querySelector('[data-toast] [data-toast-action]').click(); true");
  await waitFor("document.querySelectorAll('[data-jelly-note]').length === 2", 10_000);
  assert.deepEqual(rows().notes.map(note => note.body).sort(), ["# 读书\n\n- 第三章", "今天先把周报写完"]);

  await reloadPage(); await open();
  await click('[data-jelly-mode="list"]');
  await waitFor("document.querySelectorAll('[data-jelly-open]').length >= 2");
  await click('[data-jelly-tab="notes"]');
  await waitFor("document.querySelectorAll('[data-jelly-note]').length === 2");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
});
