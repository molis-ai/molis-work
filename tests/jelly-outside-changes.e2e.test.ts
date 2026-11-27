import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { openJellyStore } from "./fixtures/plugin-home-stores.js";
import type { JellyStore } from "@molis-ai/molis-work-plugin-jelly";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { connectorAssistantModel } from "./fixtures/connector-assistant-model.js";
import { CURRENT_WORK, OPEN_DETAILS } from "./fixtures/assistant-current-work.js";
import { openWork, waitWork } from "./fixtures/assistant-send-journey.js";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";

// A change made outside the page (the Assistant through a Jelly capability) and an object opened by id (search, the side
// panel, an Assistant result) both have to show the workspace as stored, not as the page first loaded it.
test("Jelly shows what the Assistant changed and opens an entry or a note by id", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "jelly");
  const { evaluate, waitFor, click } = child;
  const { command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
  const write = <T>(change: (store: JellyStore) => T) => { const store = openJellyStore(homeDirectory); try { return store.write(change); } finally { store.close(); } };
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=jelly` }, sessionId));
  await browser.waitFor("document.querySelector('[data-plugin-id=jelly]')");
  if (await browser.evaluate("document.body.dataset.desktopSurface") !== "jelly") await browser.click('[data-plugin-strip] [data-plugin-id=jelly]');
  await waitFor("!!document.querySelector('[data-jelly-page] [data-jelly-day]')");

  const now = new Date(), stamp = now.toISOString();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  write(store => store.insert("item", { id: "budget-sync", title: "和小李对预算", kind: "event", category_id: "uncategorized", notes: "", start_date: today, end_date: today,
    start_time: 900, end_time: 960, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone, completed_at: null, revision: 1, created_at: stamp, updated_at: stamp }));
  const shown = "[...document.querySelectorAll('[data-jelly-open]')].some(node => node.textContent.includes('和小李对预算'))";
  assert.equal(await evaluate(shown), false, "the page still shows what it loaded");
  // Another plugin's change is not Jelly's to reread.
  await browser.evaluate("window.dispatchEvent(new CustomEvent('molis:assistant-effect', { detail: { work_id: 'w-1', capability_id: 'todo.items.create' } }))");
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(await evaluate(shown), false);
  await browser.evaluate("window.dispatchEvent(new CustomEvent('molis:assistant-effect', { detail: { work_id: 'w-1', capability_id: 'jelly.item.create' } }))");
  await waitFor(shown);

  // Opened by id while the calendar shows: the note, written after the page loaded, opens on the notes tab.
  write(store => store.insert("note", { id: "wall-note", title: "现场放一面用户留言墙", body: "发布会现场可以放一面用户留言墙", day: null, revision: 1, created_at: stamp, updated_at: stamp }));
  const select = (id: string) => browser.evaluate(`document.querySelector('[data-work-surface="jelly"]').dispatchEvent(new CustomEvent('molis-work:select-item', { detail: { itemId: ${JSON.stringify(id)} } }))`);
  const declared = "JSON.parse(document.querySelector('[data-work-surface=\"jelly\"]').getAttribute('data-assistant-context') || '{}').object";
  await select("wall-note");
  // A note with words opens to read; its Markdown is drawn.
  await waitFor("document.querySelector('[data-jelly-notes-editor] .jelly-md')?.textContent.trim() === '发布会现场可以放一面用户留言墙'");
  assert.equal(await evaluate("document.querySelector('[data-jelly-tab=notes]').getAttribute('aria-selected')"), "true");
  assert.deepEqual(await evaluate(`(${declared}).id`), "wall-note");

  // An entry opens in its panel on the calendar, and the page names it only while that panel is open.
  await select("budget-sync");
  await waitFor("document.querySelector('[data-jelly-panel] input[name=title]')?.value === '和小李对预算'");
  assert.deepEqual(await evaluate(`({ kind: (${declared}).kind, id: (${declared}).id })`), { kind: "jelly_item", id: "budget-sync" });
  await click('[data-jelly-panel] [data-jelly-act="close"]');
  await waitFor("!document.querySelector('[data-jelly-panel]')");
  assert.equal(await evaluate(`(${declared}) === undefined`), true);

  // Something taken back before it was opened says so instead of opening nothing.
  await select("gone-already");
  await waitFor("document.querySelector('[data-jelly-notice]')?.textContent === '这一条已经不在了'");
  // A reopen nobody asked for (after a reload, on Back) forgets it without a word.
  await click('[data-jelly-tab="calendar"]');
  await browser.evaluate(`document.querySelector('[data-work-surface="jelly"]').dispatchEvent(new CustomEvent('molis-work:select-item', { detail: { itemId: 'gone-already', quiet: true } }))`);
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(await evaluate("document.querySelector('[data-jelly-notice]')"), null);
});

test("B27-AC02 BL-092: an Assistant result without a preview keeps its Jelly event name and opens the same event", { timeout: 120_000 }, async t => {
  const title = "和小李对预算";
  const date = "2026-11-12";
  const identity = { version: 1, provider_id: "io.molis.work.jelly" };
  const browser = await openGoalBrowser(t, true, undefined, undefined, undefined, undefined, {
    prepareHome: async home => {
      await connectorAssistantModel(t, home, (_body, turn) => {
        if (turn === 1) return { name: "read-capability", input: { ...identity, capability_id: "jelly.calendar.list", input: { start: date, end: date } } };
        if (turn === 2) return { name: "change-capability", input: {
          ...identity, capability_id: "jelly.item.create",
          input: { item: { title, kind: "event", start_date: date, end_date: date, start_time: 900, end_time: 960 } },
        } };
        return `已安排「${title}」。`;
      });
    },
  });
  if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "jelly");
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId } = browser;
  const url = `${origin}/projects/${projectId}/`;
  await browser.setViewport(1440, 950);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await command("Network.setCookie", { name: "molis_work_locale", value: "zh", url: origin }, sessionId);
  await navigate(() => command("Page.navigate", { url }, sessionId));
  await click("[data-assistant-composer] .mw-composer__input");
  await command("Input.insertText", { text: `请把 11 月 12 日 15:00 到 16:00 的「${title}」加到日程。` }, sessionId);
  await click("[data-assistant-composer] [data-composer-send]");
  const approve = '[data-review] [data-assistant-decision=approve]';
  await waitFor(`document.querySelector('${approve}') && document.querySelector('[data-review]').textContent.includes(${JSON.stringify(title)})`, 30_000);
  const workId = await evaluate<string>(CURRENT_WORK);
  assert.ok(workId);
  await click(approve);
  const work = await waitWork(browser, workId, view => view.work.state === "completed" && view.objects.some(object => object.relation === "result" && object.title === title));
  const result = work.objects.find(object => object.relation === "result" && object.title === title);
  assert.ok(result);
  assert.deepEqual(result.open, { surface: "jelly", id: result.subject.id });
  assert.equal(result.subject.kind, "jelly_item");
  const store = openJellyStore(browser.homeDirectory);
  try { assert.equal(store.read(rows => rows.get("item", result.subject.id))?.title, title); }
  finally { store.close(); }

  const problem = "[data-side-files-body] .side-files-problem", open = "[data-side-files-action=open]";
  const directory = process.env.MOLIS_CONTENT_CAPTURE || `${REVIEW_EVIDENCE}/batch27-jelly-result`;
  await mkdir(directory, { recursive: true });
  for (const [locale, reason, action] of [
    ["zh", "无法在侧栏预览这项内容。", "在插件中打开"],
    ["en", "This item cannot be previewed in the side panel.", "Open in its plugin"],
  ] as const) {
    if (locale === "en") {
      await command("Network.setCookie", { name: "molis_work_locale", value: locale, url: origin }, sessionId);
      await navigate(() => command("Page.navigate", { url }, sessionId));
      await waitFor("document.documentElement.lang === 'en' && document.querySelector('[data-assistant-island]')");
      await openWork(browser, workId);
    }
    await waitFor("!document.querySelector('[data-assistant-panel]').hidden", 30_000);
    // The work's details (its path, sub-tasks, results and changes) are behind 更多 › 详情 (36A-3).
    await evaluate(OPEN_DETAILS);
    const resultButton = '[data-assistant-block="results"] button.assistant-item-title';
    await waitFor(`document.querySelector(${JSON.stringify(resultButton)})?.checkVisibility()`);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(resultButton)}).textContent`), title);
    await click(resultButton);
    await waitFor(`document.querySelector('${problem}')?.checkVisibility() && document.querySelector('${open}')?.checkVisibility()`);
    assert.deepEqual(await evaluate(`[
      document.querySelector('[data-side-files-title]').textContent, document.querySelector('${problem}').textContent,
      document.querySelector('${open}').textContent.trim(), document.querySelector('[data-side-files-body]').hasAttribute('data-assistant-context')
    ]`), [title, reason, action, false]);
    assert.equal(await evaluate("document.querySelector('[data-side-files-body] .file-preview-text')"), null, "nothing is drawn beneath the explanation when there is no preview");
    assert.equal(await evaluate(CURRENT_WORK), workId);
    for (const width of [1440, 1024, 390]) {
      await browser.setViewport(width, 950);
      // On a phone the open side is the column that shows (specs/screen-polish §3 方案 C: the strip has no 主区｜右侧 switch).
      if (width === 390) await click("[data-assistant-panel-close]");
      for (const theme of ["light", "dark"]) {
        await evaluate(`localStorage.setItem('molis-work:theme','${theme}'); dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:'${theme}'}))`);
        await waitFor(`document.documentElement.dataset.resolvedTheme === '${theme}' && (() => {
          const note = document.querySelector('${problem}'), rect = note?.getBoundingClientRect();
          return rect && note.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
        })()`);
        const { data } = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
        await writeFile(`${directory}/jelly-result-${locale}-${theme}-${width}.png`, Buffer.from(data, "base64"));
      }
    }
    await browser.setViewport(1440, 950);
    await click(open);
    await child.waitFor(`document.querySelector('[data-jelly-panel] input[name=title]')?.value === ${JSON.stringify(title)}`);
    assert.equal(await evaluate("JSON.parse(document.querySelector('[data-work-surface=jelly]').getAttribute('data-assistant-context')).object.id"), result.subject.id);
    assert.equal(await evaluate(CURRENT_WORK), workId);
  }
});
