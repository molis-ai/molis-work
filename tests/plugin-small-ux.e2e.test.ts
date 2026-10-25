import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages/testing";
import { openLingguangStore } from "@molis-ai/molis-work-plugin-lingguang";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// W2-18 decisions 3, 5 and 6 as a person meets them in the browser. The fixture Home has no model and the project has
// no bound workspace.
const until = async (check: () => boolean, ms = 8_000) => {
  const end = Date.now() + ms;
  while (!check()) { if (Date.now() > end) assert.fail("condition not reached in time"); await new Promise(resolve => setTimeout(resolve, 50)); }
};

// A surface opened for the first time is inert until its client is mounted (#150); a click sent straight to the page, which the
// fixture's click() would wait for, is lost before that.
const CLIENTS_READY = `!document.querySelector('[data-ui-client-state="loading"]')
  && ![...document.querySelectorAll('[data-deferred-surface]')].some(surface => !surface.closest('[hidden]') && surface.dataset.uiClientState !== 'failed')`;

// Every text the page's toast shows from now on (a reload drops the watcher, so install it again after one). A quiet reopen never says it failed.
const WATCH_TOASTS = `window.toasts = []; new MutationObserver(() => window.toasts.push(document.querySelector('[data-toast]').textContent))
  .observe(document.querySelector('[data-toast]'), { childList: true, characterData: true, subtree: true })`;

test("Schedule's new-task dialog says what a due task still needs, and creating is still possible", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const schedule = await pluginFrameBrowser(t,b,"schedule");
  const { navigate, command, sessionId, origin, projectId, click, evaluate, waitFor } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click("[data-plugin-strip] [data-plugin-id=schedule]");
  await b.surfaceReady("schedule");
  const shown = (kind: string) => `(() => { const hint = document.querySelector('[data-schedule-hint="${kind}"]'); return Boolean(hint) && !hint.hidden && hint.getClientRects().length > 0; })()`;
  assert.equal(await schedule.evaluate("document.querySelector('[data-schedule-hint=model]').hidden && document.querySelector('[data-schedule-hint=workspace]').hidden"), true,
    "nothing is claimed before the Host has answered");
  await schedule.click("[data-schedule-new]");
  await schedule.waitFor(`${shown("model")} && ${shown("workspace")}`, 20_000);
  assert.match(await schedule.evaluate("document.querySelector('[data-schedule-hint=model]').textContent"), /还没有配置文字模型/);
  assert.match(await schedule.evaluate("document.querySelector('[data-schedule-hint=workspace]').textContent"), /还没有绑定工作区/);
  assert.equal(await schedule.evaluate("document.querySelector('[data-schedule-create-form] [type=submit]').disabled"), false, "the hint does not block");
  await schedule.evaluate(`{ const form = document.querySelector('[data-schedule-create-form]');
    form.elements.title.value = '提示不拦创建'; form.elements.instructions.value = '只读汇总'; form.elements.time.value = '07:45'; }`);
  await schedule.click("[data-schedule-create-form] [type=submit]");
  await schedule.waitFor("!document.querySelector('[data-schedule-create-dialog]').open && document.querySelector('[data-schedule-detail]:not([hidden]) h1')?.textContent === '提示不拦创建'", 20_000);
  assert.equal(await schedule.evaluate("document.querySelector('[data-schedule-detail]:not([hidden]) [data-schedule-detail-status]').textContent"), "已启用", "created and enabled, as before");
  // Editing is not creating: the same dialog opens without the hint.
  await schedule.click("[data-schedule-task-edit]");
  assert.equal(await schedule.evaluate("document.querySelector('[data-schedule-hint=model]').hidden && document.querySelector('[data-schedule-hint=workspace]').hidden"), true);
  await schedule.click("[data-schedule-create-form] footer [data-schedule-create-close]");
  // Each opening asks again, so a model or a folder added meanwhile is not claimed missing.
  await evaluate(`window.realFetch = window.fetch; window.readinessAnswer = { model: true, workspace: false };
    window.fetch = (url, options) => String(url).endsWith('/api/plugins/io.molis.work.schedule/readiness')
      ? (window.readinessAnswer ? Promise.resolve(new Response(JSON.stringify(window.readinessAnswer), { status: 200, headers: { 'content-type': 'application/json' } })) : Promise.reject(new Error('offline')))
      : window.realFetch(url, options);`);
  await schedule.click("[data-schedule-collapse]");
  await schedule.click("[data-schedule-new]");
  await schedule.waitFor(shown("workspace"), 20_000);
  assert.equal(await schedule.evaluate("document.querySelector('[data-schedule-hint=model]').hidden"), true, "the model is there now");
  await schedule.click("[data-schedule-create-form] footer [data-schedule-create-close]");
  // A readiness read that fails says nothing, and the dialog still works.
  await evaluate("window.readinessAnswer = null");
  await schedule.click("[data-schedule-new]");
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(await schedule.evaluate("document.querySelector('[data-schedule-hint=model]').hidden && document.querySelector('[data-schedule-hint=workspace]').hidden"), true);
  assert.equal(await schedule.evaluate("document.querySelector('[data-schedule-create-dialog]').open && !document.querySelector('[data-schedule-create-form] [type=submit]').disabled"), true);
});

test("Pages: 「新建文档」 left empty is gone when the person goes back, and one that was written in stays", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const pages = await pluginFrameBrowser(t,b,"pages");
  const { navigate, command, sessionId, origin, projectId, click, evaluate, waitFor, homeDirectory } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-id=pages]')", 20_000);
  await click("[data-plugin-strip] [data-plugin-id=pages]");
  await pages.waitFor("document.querySelector('[data-pages-new]')", 20_000);
  const titles = () => { const store = openPagesStore(homeDirectory); try { return store.list(projectId!).map(page => page.title); } finally { store.close(); } };
  const before = titles();
  await pages.click("[data-pages-new]");
  await pages.waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')", 20_000);
  assert.equal(titles().length, before.length + 1, "made at once, as before");
  await pages.click("[data-pages-back]");
  await pages.waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'false'", 20_000);
  await until(() => titles().length === before.length);
  assert.deepEqual(titles(), before, "nothing was left behind");
  // The list drops the row when the discard is answered, which is after the store has already changed.
  await pages.waitFor("![...document.querySelectorAll('[data-pages-rows] strong')].some(node => node.textContent === '未命名文档')", 20_000);
  assert.equal(await pages.evaluate("[...document.querySelectorAll('[data-pages-rows] strong')].some(node => node.textContent === '未命名文档')"), false, "and not in the list either");

  await pages.click("[data-pages-new]");
  await pages.waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')", 20_000);
  await pages.click("[data-pages-editor] .ProseMirror");
  await command("Input.insertText", { text: "写了一句" }, sessionId);
  await pages.waitFor("document.querySelector('[data-pages-editor-status]').textContent === '已保存'", 20_000);
  await pages.click("[data-pages-back]");
  await pages.waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'false'", 20_000);
  assert.equal(titles().length, before.length + 1, "kept");
});

test("Pages and 灵光: a blank item is gone when the person switches to another plugin, and the page comes back as its list", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const pages = await pluginFrameBrowser(t,b,"pages"), lingguang = await pluginFrameBrowser(t,b,"lingguang");
  const { navigate, command, sessionId, origin, projectId, click, evaluate, waitFor, homeDirectory } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-id=pages]')", 20_000);
  const titles = () => { const store = openPagesStore(homeDirectory); try { return store.list(projectId!).map(page => page.title); } finally { store.close(); } };
  const sparks = () => { const store = openLingguangStore(homeDirectory); try { return store.list(projectId!).map(spark => spark.title); } finally { store.close(); } };
  await click("[data-plugin-strip] [data-plugin-id=pages]");
  await pages.waitFor("document.querySelector('[data-pages-new]')", 20_000);
  const before = titles();
  await pages.click("[data-pages-new]");
  await pages.waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')", 20_000);
  assert.equal(titles().length, before.length + 1, "made at once, as before");
  await click("[data-plugin-strip] [data-plugin-id=schedule]");
  await waitFor("document.body.dataset.desktopSurface === 'schedule'", 20_000);
  await until(() => titles().length === before.length);
  await click("[data-plugin-strip] [data-plugin-id=pages]");
  await waitFor("document.body.dataset.desktopSurface === 'pages'", 20_000);
  assert.equal(await pages.evaluate("document.querySelector('[data-pages=workbench]').dataset.expanded"), "false", "the list, not an editor on a document that is gone");
  assert.equal(await pages.evaluate("[...document.querySelectorAll('[data-pages-rows] strong')].some(node => node.textContent === '未命名文档')"), false);
  // One that was written in is still there after the same switch, editor and all.
  await pages.click("[data-pages-new]");
  await pages.waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')", 20_000);
  await pages.click("[data-pages-editor] .ProseMirror");
  await command("Input.insertText", { text: "切走前写的" }, sessionId);
  await pages.waitFor("document.querySelector('[data-pages-editor-status]').textContent === '已保存'", 20_000);
  await click("[data-plugin-strip] [data-plugin-id=schedule]");
  await waitFor("document.body.dataset.desktopSurface === 'schedule'", 20_000);
  await click("[data-plugin-strip] [data-plugin-id=pages]");
  await waitFor("document.body.dataset.desktopSurface === 'pages'", 20_000);
  assert.equal(titles().length, before.length + 1, "kept");
  assert.equal(await pages.evaluate("document.querySelector('[data-pages=workbench]').dataset.expanded"), "true", "and still open");

  await click("[data-plugin-picker-popover] [data-plugin-id=lingguang]");
  await lingguang.waitFor(`document.querySelector('[data-lingguang-capture]') && ${CLIENTS_READY}`, 20_000);
  const keptSparks = sparks().length;
  await lingguang.click("[data-lingguang-capture]");
  await lingguang.waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'true'", 20_000);
  assert.equal(sparks().length, keptSparks + 1, "made at once, as before");
  await click("[data-plugin-strip] [data-plugin-id=pages]");
  await waitFor("document.body.dataset.desktopSurface === 'pages'", 20_000);
  await until(() => sparks().length === keptSparks);
  await click("[data-plugin-picker-popover] [data-plugin-id=lingguang]");
  await waitFor("document.body.dataset.desktopSurface === 'lingguang'", 20_000);
  assert.equal(await lingguang.evaluate("document.querySelector('[data-lingguang=workbench]').dataset.expanded"), "false");
});

test("Pages and 灵光: reloading with a blank item open takes it back, and the page comes up as its list, with nothing said about it", { timeout: 150_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const pages = await pluginFrameBrowser(t,b,"pages"), lingguang = await pluginFrameBrowser(t,b,"lingguang");
  const { navigate, command, sessionId, origin, projectId, click, evaluate, waitFor, homeDirectory, reloadPage } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-id=pages]')", 20_000);
  const titles = () => { const store = openPagesStore(homeDirectory); try { return store.list(projectId!).map(page => page.title); } finally { store.close(); } };
  const sparks = () => { const store = openLingguangStore(homeDirectory); try { return store.list(projectId!).map(spark => spark.title); } finally { store.close(); } };
  // The record the workbench reopens in a plugin's page after a reload (per device, in localStorage).
  const remembered = (plugin: string) => evaluate<string[]>(`Object.keys(localStorage).filter(key => key.startsWith('molis-work-plugin-records:'))
    .map(key => JSON.parse(localStorage.getItem(key) || '{}')[${JSON.stringify(plugin)}]).filter(Boolean)`);
  // Before the reload the record is there to be reopened, so the checks after it are about something.
  const waitRemembered = async (plugin: string) => {
    const end = Date.now() + 8_000;
    while (!(await remembered(plugin)).length) { if (Date.now() > end) assert.fail(`the workbench never remembered the open ${plugin} record`); await new Promise(resolve => setTimeout(resolve, 50)); }
  };
  // The workbench asks a plugin for a remembered record that is not among its rows 1.5 s after the page comes up; a plugin that
  // cannot find it says so in its note. Past that point there must be no note.
  const quietAfterTheReopen = async (noteSelector: string, surface: string) => {
    const child = surface.includes("pages") ? pages : lingguang;
    await new Promise(resolve => setTimeout(resolve, 3_500));
    assert.deepEqual(await child.evaluate(`[document.querySelector('${noteSelector}').hidden, document.querySelector('${noteSelector}').textContent, document.querySelector('${surface}').dataset.expanded]`),
      [true, "", "false"], "no 「找不到」 note, and still the list");
  };
  await click("[data-plugin-strip] [data-plugin-id=pages]");
  await pages.waitFor("document.querySelector('[data-pages-new]')", 20_000);
  const before = titles();
  await pages.click("[data-pages-new]");
  await pages.waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')", 20_000);
  assert.equal(titles().length, before.length + 1, "made at once, as before");
  await waitRemembered("pages");
  await reloadPage();
  await until(() => titles().length === before.length);
  await pages.waitFor("document.querySelector('[data-pages=workbench]')", 20_000);
  assert.equal(await pages.evaluate("[...document.querySelectorAll('[data-pages-rows] strong')].some(node => node.textContent === '未命名文档')"), false);
  assert.deepEqual(await remembered("pages"), [], "the document is gone, so the workbench does not remember it to reopen");
  await quietAfterTheReopen("[data-pages-note]", "[data-pages=workbench]");

  // 灵光 the same way, on its own page (the reload comes back to where the person was).
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-picker-popover] [data-plugin-id=lingguang]')", 20_000);
  await click("[data-plugin-picker-popover] [data-plugin-id=lingguang]");
  await lingguang.waitFor(`document.querySelector('[data-lingguang-capture]') && ${CLIENTS_READY}`, 20_000);
  const keptSparks = sparks().length;
  await lingguang.click("[data-lingguang-capture]");
  await lingguang.waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'true'", 20_000);
  assert.equal(sparks().length, keptSparks + 1, "made at once, as before");
  await waitRemembered("lingguang");
  await reloadPage();
  await until(() => sparks().length === keptSparks);
  await lingguang.waitFor(`document.querySelector('[data-lingguang-capture]') && ${CLIENTS_READY}`, 20_000);
  assert.deepEqual(await remembered("lingguang"), [], "the spark is gone, so the workbench does not remember it to reopen");
  await quietAfterTheReopen("[data-lingguang-note]", "[data-lingguang=workbench]");
});

test("Pages and 灵光: once a blank item is taken back on 「返回」 the surface stops naming it as the current object", { timeout: 120_000 }, async t => {
  // The Assistant and the placement bar read this attribute, and so does the workbench when it decides whether a record is open.
  const b = await openGoalBrowser(t, true); if (!b) return;
  const pages = await pluginFrameBrowser(t,b,"pages"), lingguang = await pluginFrameBrowser(t,b,"lingguang");
  const { navigate, command, sessionId, origin, projectId, click, evaluate, waitFor } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-id=pages]')", 20_000);
  const object = (surface: string) => (surface.includes("pages") ? pages : lingguang).evaluate(`JSON.parse(document.querySelector('${surface}').getAttribute('data-assistant-context') || 'null')?.object ?? null`);
  await click("[data-plugin-strip] [data-plugin-id=pages]");
  await pages.waitFor("document.querySelector('[data-pages-new]')", 20_000);
  await pages.click("[data-pages-new]");
  await pages.waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')", 20_000);
  assert.ok(await object("[data-pages=workbench]"), "named while it is open");
  await pages.click("[data-pages-back]");
  await pages.waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'false'", 20_000);
  await pages.waitFor("![...document.querySelectorAll('[data-pages-rows] strong')].some(node => node.textContent === '未命名文档')", 20_000);
  assert.equal(await object("[data-pages=workbench]"), null, "the document taken back is not the object in hand");

  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-picker-popover] [data-plugin-id=lingguang]')", 20_000);
  await click("[data-plugin-picker-popover] [data-plugin-id=lingguang]");
  await lingguang.waitFor(`document.querySelector('[data-lingguang-capture]') && ${CLIENTS_READY}`, 20_000);
  await lingguang.click("[data-lingguang-capture]");
  await lingguang.waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'true'", 20_000);
  assert.ok(await object("[data-lingguang=workbench]"), "named while it is open");
  await lingguang.click("[data-lingguang-back]");
  await lingguang.waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'false' && document.querySelectorAll('[data-lingguang-id]').length === 0", 20_000);
  assert.equal(await object("[data-lingguang=workbench]"), null);
});

test("Pages and 灵光: going back with the workbench's own Back button or the plugin's name on the tab strip takes a blank item back too", { timeout: 150_000 }, async t => {
  // The workbench says "no item" and folds the page itself, without the plugin's own 「返回」: the plugin used to be left with the
  // blank item selected behind the list, and it was only taken back at the next leave.
  const b = await openGoalBrowser(t, true); if (!b) return;
  const pages = await pluginFrameBrowser(t,b,"pages"), lingguang = await pluginFrameBrowser(t,b,"lingguang");
  const { navigate, command, sessionId, origin, projectId, click, evaluate, waitFor, homeDirectory } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-id=pages]')", 20_000);
  const titles = () => { const store = openPagesStore(homeDirectory); try { return store.list(projectId!).map(page => page.title); } finally { store.close(); } };
  const sparks = () => { const store = openLingguangStore(homeDirectory); try { return store.list(projectId!).map(spark => spark.title); } finally { store.close(); } };
  const object = (surface: string) => (surface.includes("pages") ? pages : lingguang).evaluate(`JSON.parse(document.querySelector('${surface}').getAttribute('data-assistant-context') || 'null')?.object ?? null`);
  const openBlankPage = async () => {
    await pages.click("[data-pages-new]");
    await pages.waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')", 20_000);
  };
  const openBlankSpark = async () => {
    await lingguang.click("[data-lingguang-capture]");
    await lingguang.waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'true'", 20_000);
  };
  await click("[data-plugin-strip] [data-plugin-id=pages]");
  await pages.waitFor("document.querySelector('[data-pages-new]')", 20_000);
  const before = titles();
  for (const [how, leave] of [["the titlebar Back button", () => click("[data-workspace-history=back]")], ["the plugin's tab on the tab strip", () => click('[data-tab-kind="plugin"][data-plugin="pages"] .tab-item-trigger')]] as const) {
    await openBlankPage();
    assert.equal(titles().length, before.length + 1, `made at once, as before (${how})`);
    assert.ok(await object("[data-pages=workbench]"), "named while it is open");
    await leave();
    await pages.waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'false'", 20_000);
    await until(() => titles().length === before.length);
    assert.deepEqual(titles(), before, `nothing was left behind (${how})`);
    await pages.waitFor("![...document.querySelectorAll('[data-pages-rows] strong')].some(node => node.textContent === '未命名文档')", 20_000);
    assert.equal(await object("[data-pages=workbench]"), null, "and the document taken back is not the object in hand");
  }
  // One that was written in stays through the same Back.
  await openBlankPage();
  await pages.click("[data-pages-editor] .ProseMirror");
  await command("Input.insertText", { text: "写了一句" }, sessionId);
  await pages.waitFor("document.querySelector('[data-pages-editor-status]').textContent === '已保存'", 20_000);
  await click("[data-workspace-history=back]");
  await pages.waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'false'", 20_000);
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.equal(titles().length, before.length + 1, "kept");

  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-picker-popover] [data-plugin-id=lingguang]')", 20_000);
  await click("[data-plugin-picker-popover] [data-plugin-id=lingguang]");
  await lingguang.waitFor(`document.querySelector('[data-lingguang-capture]') && ${CLIENTS_READY}`, 20_000);
  const keptSparks = sparks().length;
  for (const [how, leave] of [["the titlebar Back button", () => click("[data-workspace-history=back]")], ["the plugin's tab on the tab strip", () => click('[data-tab-kind="plugin"][data-plugin="lingguang"] .tab-item-trigger')]] as const) {
    await openBlankSpark();
    assert.equal(sparks().length, keptSparks + 1, `made at once, as before (${how})`);
    assert.ok(await object("[data-lingguang=workbench]"), "named while it is open");
    await leave();
    await lingguang.waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'false'", 20_000);
    await until(() => sparks().length === keptSparks);
    await lingguang.waitFor("document.querySelectorAll('[data-lingguang-id]').length === " + keptSparks, 20_000);
    assert.equal(await object("[data-lingguang=workbench]"), null);
  }
  await openBlankSpark();
  await lingguang.evaluate(`(() => { const body = document.querySelector('[data-lingguang-body]'); body.value = '一句话'; body.dispatchEvent(new InputEvent('input', { bubbles: true })); })()`);
  await click("[data-workspace-history=back]");
  await lingguang.waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'false'", 20_000);
  await new Promise(resolve => setTimeout(resolve, 1_200));
  assert.equal(sparks().length, keptSparks + 1, "kept");
});

test("Pages and 灵光: the workbench's Back and Forward do not bring back a blank item that was taken back, and a reload comes up as the list", { timeout: 300_000 }, async t => {
  // W2-18 decision 6 takes an empty item back without the person deleting anything, but the workbench's history still holds the step
  // that names it. Stepping to that step makes the workbench ask the page for the item; the page does not have it, and the workbench's own
  // name for it on a page that is still at its list is not "shown", so the quiet reopen forgets the record: nothing keeps asking for it.
  const b = await openGoalBrowser(t, true); if (!b) return;
  const pages = await pluginFrameBrowser(t,b,"pages"), lingguang = await pluginFrameBrowser(t,b,"lingguang");
  const { navigate, command, sessionId, origin, projectId, click, evaluate, waitFor, homeDirectory, reloadPage } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-id=pages]')", 20_000);
  const titles = () => { const store = openPagesStore(homeDirectory); try { return store.list(projectId!).map(page => page.title); } finally { store.close(); } };
  const sparks = () => { const store = openLingguangStore(homeDirectory); try { return store.list(projectId!).map(spark => spark.title); } finally { store.close(); } };
  // The record the workbench reopens in a plugin's page after a reload (per device, in localStorage).
  const remembered = (plugin: string) => evaluate<string[]>(`Object.keys(localStorage).filter(key => key.startsWith('molis-work-plugin-records:'))
    .map(key => JSON.parse(localStorage.getItem(key) || '{}')[${JSON.stringify(plugin)}]).filter(Boolean)`);
  const untilAsync = async (check: () => Promise<boolean>, what: string, ms = 20_000) => {
    const end = Date.now() + ms;
    while (!(await check())) { if (Date.now() > end) assert.fail(what); await new Promise(resolve => setTimeout(resolve, 100)); }
  };
  const expanded = (surface: string) => (surface.includes("pages") ? pages : lingguang).evaluate<string>(`document.querySelector('${surface}').dataset.expanded`);
  const noToast = async (what: string) => assert.deepEqual(await evaluate("window.toasts"), [], `${what}: the quiet reopen never toasts 「未能打开这条内容」`);
  // A page that is asked (1.5 s after it comes up) for a record it does not have says so in its note; past that, there is none.
  const quietAfterTheReopen = async (noteSelector: string, surface: string) => {
    const child = surface.includes("pages") ? pages : lingguang;
    await new Promise(resolve => setTimeout(resolve, 3_500));
    assert.deepEqual(await child.evaluate(`[document.querySelector('${noteSelector}').hidden, document.querySelector('${noteSelector}').textContent, document.querySelector('${surface}').dataset.expanded]`),
      [true, "", "false"], "no 「找不到」 note, and still the list");
  };
  // The record is written once the page is open on it; before the step to it, it must have been there to be forgotten.
  const waitRemembered = (plugin: string) => untilAsync(async () => (await remembered(plugin)).length > 0, `the workbench never remembered the open ${plugin} record`, 8_000);
  // The step that names the taken-back item: the workbench names it again, asks the page for it, and the quiet reopen (8 s) forgets it.
  const stepToIt = async (plugin: string, surface: string, direction: "back" | "forward") => {
    await click(`[data-workspace-history=${direction}]`);
    assert.equal((await remembered(plugin)).length, 1, `${direction}: the step names the item again, so the workbench asks the page for it`);
    await untilAsync(async () => (await remembered(plugin)).length === 0, `${plugin} ${direction}: the workbench still holds the taken-back item after the quiet reopen`);
    assert.equal(await expanded(surface), "false", `${direction}: and the page stays at its list`);
  };
  const walk = async (plugin: string, surface: string, openBlank: () => Promise<void>, pageBack: string, count: () => number, kept: number) => {
    const child = plugin === "pages" ? pages : lingguang;
    const folded = () => child.waitFor(`document.querySelector('${surface}').dataset.expanded === 'false'`, 20_000);
    // Taken back on the page's own 「返回」: the workbench's Back goes to the step that names it, and Forward is the list.
    await openBlank();
    assert.equal(count(), kept + 1, `${plugin}: made at once, as before`);
    await waitRemembered(plugin);
    await child.click(pageBack);
    await folded();
    await until(() => count() === kept);
    await stepToIt(plugin, surface, "back");
    assert.equal(count(), kept, `${plugin}: nothing came back`);
    await click("[data-workspace-history=forward]");
    await new Promise(resolve => setTimeout(resolve, 600));
    assert.equal(await expanded(surface), "false", `${plugin}: Forward is the list as well`);
    assert.deepEqual(await remembered(plugin), []);
    // Taken back by the workbench's own Back: Forward is the step that names it.
    await openBlank();
    assert.equal(count(), kept + 1, `${plugin}: made at once, as before`);
    await waitRemembered(plugin);
    await click("[data-workspace-history=back]");
    await folded();
    await until(() => count() === kept);
    await stepToIt(plugin, surface, "forward");
    assert.equal(count(), kept, `${plugin}: nothing came back`);
  };

  await click("[data-plugin-strip] [data-plugin-id=pages]");
  await pages.waitFor("document.querySelector('[data-pages-new]')", 20_000);
  await evaluate(WATCH_TOASTS);
  const before = titles();
  await walk("pages", "[data-pages=workbench]", async () => {
    await pages.click("[data-pages-new]");
    await pages.waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')", 20_000);
  }, "[data-pages-back]", () => titles().length, before.length);
  await noToast("pages");
  await reloadPage();
  await pages.waitFor("document.querySelector('[data-pages=workbench]')", 20_000);
  assert.deepEqual(await remembered("pages"), [], "a reload has nothing to reopen");
  await quietAfterTheReopen("[data-pages-note]", "[data-pages=workbench]");
  assert.deepEqual(titles(), before);

  // 灵光 the same way.
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-picker-popover] [data-plugin-id=lingguang]')", 20_000);
  await click("[data-plugin-picker-popover] [data-plugin-id=lingguang]");
  await lingguang.waitFor(`document.querySelector('[data-lingguang-capture]') && ${CLIENTS_READY}`, 20_000);
  const keptSparks = sparks().length;
  await evaluate(WATCH_TOASTS);
  await walk("lingguang", "[data-lingguang=workbench]", async () => {
    await lingguang.click("[data-lingguang-capture]");
    await lingguang.waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'true'", 20_000);
  }, "[data-lingguang-back]", () => sparks().length, keptSparks);
  await noToast("lingguang");
  await reloadPage();
  await lingguang.waitFor(`document.querySelector('[data-lingguang-capture]') && ${CLIENTS_READY}`, 20_000);
  assert.deepEqual(await remembered("lingguang"), [], "a reload has nothing to reopen");
  await quietAfterTheReopen("[data-lingguang-note]", "[data-lingguang=workbench]");
  assert.equal(sparks().length, keptSparks);
});

test("Pages: a document opened while the workbench is still looking for a taken-back one keeps its place, and a reload reopens it", { timeout: 180_000 }, async t => {
  // After the workbench's Back to the step that names a taken-back document, the quiet reopen stays alive for 8 s. It forgets only the record
  // it was looking for: a document the person opens meanwhile is remembered all the same.
  const b = await openGoalBrowser(t, true); if (!b) return;
  const pages = await pluginFrameBrowser(t,b,"pages");
  const { navigate, command, sessionId, origin, projectId, click, evaluate, waitFor, homeDirectory, reloadPage } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-id=pages]')", 20_000);
  await click("[data-plugin-strip] [data-plugin-id=pages]");
  await pages.waitFor(`document.querySelector('[data-pages-new]') && ${CLIENTS_READY}`, 20_000);
  const ids = () => { const store = openPagesStore(homeDirectory); try { return store.list(projectId!).map(page => page.id); } finally { store.close(); } };
  const remembered = () => evaluate<string[]>(`Object.keys(localStorage).filter(key => key.startsWith('molis-work-plugin-records:'))
    .map(key => JSON.parse(localStorage.getItem(key) || '{}').pages).filter(Boolean)`);
  const untilRemembered = async (count: number, what: string) => {
    const end = Date.now() + 8_000;
    while ((await remembered()).length !== count) { if (Date.now() > end) assert.fail(what); await new Promise(resolve => setTimeout(resolve, 100)); }
  };
  const before = ids();
  const open = "document.querySelector('[data-pages=workbench]').dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')";
  await pages.click("[data-pages-new]");
  await pages.waitFor(open, 20_000);
  await untilRemembered(1, "the workbench never remembered the open document");
  const [takenBack] = await remembered();
  await pages.click("[data-pages-back]");
  await pages.waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'false'", 20_000);
  await until(() => ids().length === before.length);
  // The workbench's Back names the taken-back document again, and its quiet reopen starts looking for it.
  await evaluate(WATCH_TOASTS);
  await click("[data-workspace-history=back]");
  const stepped = Date.now();
  assert.deepEqual(await remembered(), [takenBack], "the step names the taken-back document");
  // A document is opened and written in meanwhile.
  await pages.click("[data-pages-new]");
  await pages.waitFor(open, 20_000);
  await pages.click("[data-pages-editor] .ProseMirror");
  await command("Input.insertText", { text: "找的时候新写的" }, sessionId);
  await pages.waitFor("document.querySelector('[data-pages-editor-status]').textContent === '已保存'", 20_000);
  const written = ids().find(id => !before.includes(id))!;
  assert.ok(written && written !== takenBack, "a new document, kept because it was written in");
  await untilRemembered(1, "the new document was not remembered");
  assert.deepEqual(await remembered(), [written], "its record replaces the taken-back one");
  // Past the quiet reopen's 8 s (and its margin), the search for the other document ends, and it must not end this one.
  while (Date.now() - stepped < 11_000) await new Promise(resolve => setTimeout(resolve, 100));
  assert.deepEqual(await remembered(), [written], "the quiet reopen forgot the taken-back record, not this one");
  assert.equal(await pages.evaluate("document.querySelector('[data-pages=workbench]').dataset.expanded"), "true", "and the editor is still open");
  assert.deepEqual(await evaluate("window.toasts"), [], "the search for the other document ended without 「未能打开这条内容」");
  await reloadPage();
  await pages.waitFor(`document.querySelector('[data-pages=workbench]')?.dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes('找的时候新写的')`, 30_000);
});

test("Pages: Back and then Forward at once, while the workbench is still looking for a taken-back document, ends at the list without an error", { timeout: 120_000 }, async t => {
  // Forward is the list: it drops the record the quiet reopen was looking for, but its 8 s still run out. They end without forgetting
  // anything else and without saying that the document could not be opened.
  const b = await openGoalBrowser(t, true); if (!b) return;
  const pages = await pluginFrameBrowser(t,b,"pages");
  const { navigate, command, sessionId, origin, projectId, click, evaluate, waitFor, homeDirectory } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-id=pages]')", 20_000);
  await click("[data-plugin-strip] [data-plugin-id=pages]");
  await pages.waitFor(`document.querySelector('[data-pages-new]') && ${CLIENTS_READY}`, 20_000);
  const count = () => { const store = openPagesStore(homeDirectory); try { return store.list(projectId!).length; } finally { store.close(); } };
  const remembered = () => evaluate<string[]>(`Object.keys(localStorage).filter(key => key.startsWith('molis-work-plugin-records:'))
    .map(key => JSON.parse(localStorage.getItem(key) || '{}').pages).filter(Boolean)`);
  const before = count();
  await pages.click("[data-pages-new]");
  await pages.waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')", 20_000);
  const end = Date.now() + 8_000;
  while ((await remembered()).length !== 1) { if (Date.now() > end) assert.fail("the workbench never remembered the open document"); await new Promise(resolve => setTimeout(resolve, 100)); }
  await pages.click("[data-pages-back]");
  await pages.waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'false'", 20_000);
  await until(() => count() === before);
  await evaluate(WATCH_TOASTS);
  await click("[data-workspace-history=back]");
  const stepped = Date.now();
  assert.equal((await remembered()).length, 1, "the step names the taken-back document, and the workbench starts looking for it");
  await click("[data-workspace-history=forward]");
  // Past the quiet reopen's 8 s and its margin.
  while (Date.now() - stepped < 11_000) await new Promise(resolve => setTimeout(resolve, 100));
  assert.deepEqual(await remembered(), [], "nothing is left to reopen");
  assert.deepEqual(await evaluate("window.toasts"), [], "and no 「未能打开这条内容」");
  assert.equal(await pages.evaluate("document.querySelector('[data-pages=workbench]').dataset.expanded"), "false", "the page is at its list");
  assert.equal(count(), before, "nothing came back");
});

test("a link to a record that opens inside a plugin's own list (Todo's batch review) ends without the error toast", { timeout: 90_000 }, async t => {
  // The review opens in the list page and leaves it at data-expanded=false; the workbench names the object for the Assistant. For a link,
  // that name says the plugin has it open. Only the quiet reopen after a reload holds a workbench name to an expanded page.
  const b = await openGoalBrowser(t, true); if (!b) return;

  const { navigate, command, sessionId, origin, projectId, evaluate, waitFor } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=todo&openRecord=batch:x` }, sessionId));
  await waitFor("document.querySelector('[data-toast]') && document.querySelector('[data-work-surface=todo]')", 20_000);
  await evaluate(WATCH_TOASTS);
  const surface = `document.querySelector('[data-work-surface=todo]')`;
  await waitFor(`(() => { const holder = ${surface}.querySelector('[data-assistant-context]') || ${surface}; try { const context = JSON.parse(holder.getAttribute('data-assistant-context') || '{}');
    return context.object?.id === 'batch:x' && context.named_by === 'workbench'; } catch { return false; } })()`, 20_000);
  assert.equal(await evaluate(`${surface}.dataset.expanded`), "false", "the review is in the list page, which stays folded");
  // The workbench waits 10 s for a plugin to say it has the record.
  await new Promise(resolve => setTimeout(resolve, 12_000));
  assert.deepEqual(await evaluate("window.toasts"), [], "no 「未能打开这条内容」");
});

test("Pages: opening an imported document leaves the blank new document next to it, and the other documents stay", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const pages = await pluginFrameBrowser(t,b,"pages");
  const { navigate, command, sessionId, origin, projectId, click, evaluate, waitFor, homeDirectory } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-id=pages]')", 20_000);
  const titles = () => { const store = openPagesStore(homeDirectory); try { return store.list(projectId!).map(page => page.title).sort(); } finally { store.close(); } };
  await click("[data-plugin-strip] [data-plugin-id=pages]");
  await pages.waitFor("document.querySelector('[data-pages-new]')", 20_000);
  const before = titles();
  await pages.click("[data-pages-new]");
  await pages.waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')", 20_000);
  assert.equal(titles().length, before.length + 1, "made at once, as before");
  // The import button stays in the list header while the editor is open.
  await pages.click("[data-pages-import]");
  await pages.waitFor("document.querySelector('[data-pages-import-dialog]').open", 20_000);
  await pages.evaluate(`(() => { const input = document.querySelector('[data-pages-import-files]'); const transfer = new DataTransfer();
    transfer.items.add(new File(['# 导入的笔记\\n\\n导入的正文'], 'note.md', { type: 'text/markdown' })); input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await pages.waitFor("!document.querySelector('[data-pages-import-submit]').disabled", 20_000);
  await pages.click("[data-pages-import-submit]");
  await pages.waitFor("!document.querySelector('[data-pages-import-open]').hidden", 20_000);
  await pages.click("[data-pages-import-open]");
  await pages.waitFor("document.querySelector('[data-pages-title]').value === '导入的笔记'", 20_000);
  await until(() => !titles().includes("未命名文档"));
  assert.deepEqual(titles(), [...before, "导入的笔记"].sort(), "the blank document is gone and the imported one is there");
  await pages.waitFor("![...document.querySelectorAll('[data-pages-rows] strong')].some(node => node.textContent === '未命名文档')", 20_000);
  // Going back from the imported document takes nothing: it was not made blank here.
  await pages.click("[data-pages-back]");
  await pages.waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'false'", 20_000);
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.deepEqual(titles(), [...before, "导入的笔记"].sort());
});

// A 「新建文档」 the person has starred, tied to a Goal or saved as a fixed version is not untouched any more, however empty the editor
// looks: pages.discard is the undo of a create and the Host refuses it once the document is past the version its own saves left it at.
async function blankDocumentGivenSomethingStays(t: TestContext, change: "star" | "goal" | "version") {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const pages = await pluginFrameBrowser(t,b,"pages");
  const { navigate, command, sessionId, origin, projectId, click, evaluate, waitFor, homeDirectory } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-id=pages]')", 20_000);
  await click("[data-plugin-strip] [data-plugin-id=pages]");
  await pages.waitFor("document.querySelector('[data-pages-new]')", 20_000);
  const documents = () => { const store = openPagesStore(homeDirectory); try { return store.list(projectId!); } finally { store.close(); } };
  const known = new Set(documents().map(page => page.id));
  // How the Host answered the page's discard: the page says nothing about a refused tidy-up, so this is where it shows.
  await evaluate(`window.discardAnswers = []; { const realFetch = window.fetch;
    window.fetch = (url, options) => { const answer = realFetch(url, options);
      if (String(url).includes('/discard')) answer.then(response => window.discardAnswers.push(response.status), () => window.discardAnswers.push(0));
      return answer; }; } true`);
  await pages.click("[data-pages-new]");
  await pages.waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')", 20_000);
  const made = () => documents().find(page => !known.has(page.id));
  assert.ok(made(), "made at once, as before");
  if (change === "star") {
    await pages.click("[data-pages-star-editor]");
    await until(() => made()?.starred === true);
  } else if (change === "goal") {
    await pages.click("[data-pages-more]");
    await pages.waitFor("document.querySelector('[data-pages-goal]').options.length > 1", 20_000);
    await pages.evaluate(`{ const select = document.querySelector('[data-pages-goal]'); select.value = [...select.options].find(option => option.value).value;
      select.dispatchEvent(new Event('change', { bubbles: true })); }`);
    await until(() => Boolean(made()?.goal_id));
  } else {
    await pages.click("[data-pages-promote][data-pages-artifact-bar]");
    await until(() => (made()?.artifact_version ?? 0) > 0);
  }
  const id = made()!.id;
  await pages.click("[data-pages-back]");
  await pages.waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'false'", 20_000);
  await waitFor("window.discardAnswers.length === 1", 20_000);
  assert.equal(await evaluate("window.discardAnswers[0]"), 409, "the page asked and the Host refused");
  assert.ok(documents().some(page => page.id === id), "the document is still there");
  await pages.waitFor("[...document.querySelectorAll('[data-pages-rows] strong')].some(node => node.textContent === '未命名文档')", 20_000);
  assert.equal(await pages.evaluate("document.querySelector('[data-pages-note]')?.hidden !== false"), true, "and nothing was said about it");
}

test("Pages: a blank 「新建文档」 the person starred stays when they go back", { timeout: 90_000 }, t => blankDocumentGivenSomethingStays(t, "star"));
test("Pages: a blank 「新建文档」 the person tied to a Goal stays when they go back", { timeout: 90_000 }, t => blankDocumentGivenSomethingStays(t, "goal"));
test("Pages: a blank 「新建文档」 the person saved as a fixed version stays when they go back", { timeout: 90_000 }, t => blankDocumentGivenSomethingStays(t, "version"));

test("灵光: 「记下第一条灵光」 left empty is thrown away when the person goes back, and one with words stays", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const lingguang = await pluginFrameBrowser(t,b,"lingguang");
  const { navigate, command, sessionId, origin, projectId, click, evaluate, waitFor, homeDirectory } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-picker-popover] [data-plugin-id=lingguang]')", 20_000);
  await click("[data-plugin-picker-popover] [data-plugin-id=lingguang]");
  await lingguang.waitFor(`document.querySelector('[data-lingguang-capture]') && ${CLIENTS_READY}`, 20_000);
  const kept = () => { const store = openLingguangStore(homeDirectory); try { return store.list(projectId!).map(spark => spark.title); } finally { store.close(); } };
  assert.deepEqual(kept(), []);
  await lingguang.click("[data-lingguang-capture]");
  await lingguang.waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'true' && document.querySelectorAll('[data-lingguang-id]').length === 1", 20_000);
  assert.deepEqual(kept(), ["未命名灵光"], "made at once, as before");
  await lingguang.click("[data-lingguang-back]");
  await lingguang.waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'false' && document.querySelectorAll('[data-lingguang-id]').length === 0", 20_000);
  await until(() => kept().length === 0);
  assert.deepEqual(kept(), [], "nothing is left behind, and no 「丢掉这条？」 question was asked");

  await lingguang.click("[data-lingguang-capture]");
  await lingguang.waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'true'", 20_000);
  await lingguang.evaluate(`(() => { const body = document.querySelector('[data-lingguang-body]'); body.value = '一句话'; body.dispatchEvent(new InputEvent('input', { bubbles: true })); })()`);
  await lingguang.click("[data-lingguang-back]");
  await lingguang.waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'false' && document.querySelectorAll('[data-lingguang-id]').length === 1", 20_000);
  assert.equal(kept().length, 1);
});

test("Text Stats is not in the plugin list unless developer mode is on, and is when it is", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;

  const { navigate, command, sessionId, origin, projectId, evaluate, waitFor } = b;
  const previous = process.env.MOLIS_WORK_DEVELOPER_MODE;
  t.after(() => { if (previous === undefined) delete process.env.MOLIS_WORK_DEVELOPER_MODE; else process.env.MOLIS_WORK_DEVELOPER_MODE = previous; });
  delete process.env.MOLIS_WORK_DEVELOPER_MODE;
  const open = async () => {
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
    await waitFor("document.querySelector('[data-plugin-picker-popover] [data-plugin-id=lingguang]')", 20_000);
  };
  await open();
  assert.equal(await evaluate("Boolean(document.querySelector('[data-plugin-tile=files]'))"), true, "the list itself is there");
  assert.equal(await evaluate("Boolean(document.querySelector('[data-market-plugin=files]'))"), true);
  assert.equal(await evaluate("Boolean(document.querySelector('[data-plugin-tile=\"text-stats\"], [data-market-plugin=\"text-stats\"]'))"), false);
  process.env.MOLIS_WORK_DEVELOPER_MODE = "1";
  await open();
  assert.equal(await evaluate("Boolean(document.querySelector('[data-plugin-tile=\"text-stats\"]')) && Boolean(document.querySelector('[data-market-plugin=\"text-stats\"]'))"), true);
});
