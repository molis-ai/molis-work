import assert from "node:assert/strict";
import test from "node:test";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
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

test("Schedule's new-task dialog says what a due task still needs, and creating is still possible", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const { navigate, command, sessionId, origin, projectId, click, evaluate, waitFor } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click("[data-plugin-strip] [data-plugin-id=schedule]");
  const shown = (kind: string) => `(() => { const hint = document.querySelector('[data-schedule-hint="${kind}"]'); return Boolean(hint) && !hint.hidden && hint.getClientRects().length > 0; })()`;
  assert.equal(await evaluate("document.querySelector('[data-schedule-hint=model]').hidden && document.querySelector('[data-schedule-hint=workspace]').hidden"), true,
    "nothing is claimed before the Host has answered");
  await click("[data-schedule-new]");
  await waitFor(`${shown("model")} && ${shown("workspace")}`, 20_000);
  assert.match(await evaluate("document.querySelector('[data-schedule-hint=model]').textContent"), /还没有配置文字模型/);
  assert.match(await evaluate("document.querySelector('[data-schedule-hint=workspace]').textContent"), /还没有绑定工作区/);
  assert.equal(await evaluate("document.querySelector('[data-schedule-create-form] [type=submit]').disabled"), false, "the hint does not block");
  await evaluate(`{ const form = document.querySelector('[data-schedule-create-form]');
    form.elements.title.value = '提示不拦创建'; form.elements.instructions.value = '只读汇总'; form.elements.time.value = '07:45'; }`);
  await click("[data-schedule-create-form] [type=submit]");
  await waitFor("!document.querySelector('[data-schedule-create-dialog]').open && document.querySelector('[data-schedule-detail]:not([hidden]) h1')?.textContent === '提示不拦创建'", 20_000);
  assert.equal(await evaluate("document.querySelector('[data-schedule-detail]:not([hidden]) [data-schedule-detail-status]').textContent"), "已启用", "created and enabled, as before");
  // Editing is not creating: the same dialog opens without the hint.
  await click("[data-schedule-task-edit]");
  assert.equal(await evaluate("document.querySelector('[data-schedule-hint=model]').hidden && document.querySelector('[data-schedule-hint=workspace]').hidden"), true);
  await click("[data-schedule-create-form] footer [data-schedule-create-close]");
  // Each opening asks again, so a model or a folder added meanwhile is not claimed missing.
  await evaluate(`window.realFetch = window.fetch; window.readinessAnswer = { model: true, workspace: false };
    window.fetch = (url, options) => String(url).endsWith('/api/schedule/readiness')
      ? (window.readinessAnswer ? Promise.resolve(new Response(JSON.stringify(window.readinessAnswer), { status: 200, headers: { 'content-type': 'application/json' } })) : Promise.reject(new Error('offline')))
      : window.realFetch(url, options);`);
  await click("[data-schedule-collapse]");
  await click("[data-schedule-new]");
  await waitFor(shown("workspace"), 20_000);
  assert.equal(await evaluate("document.querySelector('[data-schedule-hint=model]').hidden"), true, "the model is there now");
  await click("[data-schedule-create-form] footer [data-schedule-create-close]");
  // A readiness read that fails says nothing, and the dialog still works.
  await evaluate("window.readinessAnswer = null");
  await click("[data-schedule-new]");
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(await evaluate("document.querySelector('[data-schedule-hint=model]').hidden && document.querySelector('[data-schedule-hint=workspace]').hidden"), true);
  assert.equal(await evaluate("document.querySelector('[data-schedule-create-dialog]').open && !document.querySelector('[data-schedule-create-form] [type=submit]').disabled"), true);
});

test("Pages: 「新建文档」 left empty is gone when the person goes back, and one that was written in stays", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const { navigate, command, sessionId, origin, projectId, click, evaluate, waitFor, homeDirectory } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-id=pages]')", 20_000);
  await click("[data-plugin-strip] [data-plugin-id=pages]");
  await waitFor("document.body.dataset.desktopSurface === 'pages' && document.querySelector('[data-pages-new]')", 20_000);
  const titles = () => { const store = openPagesStore(homeDirectory); try { return store.list(projectId!).map(page => page.title); } finally { store.close(); } };
  const before = titles();
  await click("[data-pages-new]");
  await waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')", 20_000);
  assert.equal(titles().length, before.length + 1, "made at once, as before");
  await click("[data-pages-back]");
  await waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'false'", 20_000);
  await until(() => titles().length === before.length);
  assert.deepEqual(titles(), before, "nothing was left behind");
  // The list drops the row when the discard is answered, which is after the store has already changed.
  await waitFor("![...document.querySelectorAll('[data-pages-rows] strong')].some(node => node.textContent === '未命名文档')", 20_000);
  assert.equal(await evaluate("[...document.querySelectorAll('[data-pages-rows] strong')].some(node => node.textContent === '未命名文档')"), false, "and not in the list either");

  await click("[data-pages-new]");
  await waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')", 20_000);
  await click("[data-pages-editor] .ProseMirror");
  await command("Input.insertText", { text: "写了一句" }, sessionId);
  await waitFor("document.querySelector('[data-pages-editor-status]').textContent === '已保存'", 20_000);
  await click("[data-pages-back]");
  await waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'false'", 20_000);
  assert.equal(titles().length, before.length + 1, "kept");
});

test("Pages and 灵光: a blank item is gone when the person switches to another plugin, and the page comes back as its list", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const { navigate, command, sessionId, origin, projectId, click, evaluate, waitFor, homeDirectory } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-id=pages]')", 20_000);
  const titles = () => { const store = openPagesStore(homeDirectory); try { return store.list(projectId!).map(page => page.title); } finally { store.close(); } };
  const sparks = () => { const store = openLingguangStore(homeDirectory); try { return store.list(projectId!).map(spark => spark.title); } finally { store.close(); } };
  await click("[data-plugin-strip] [data-plugin-id=pages]");
  await waitFor("document.body.dataset.desktopSurface === 'pages' && document.querySelector('[data-pages-new]')", 20_000);
  const before = titles();
  await click("[data-pages-new]");
  await waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')", 20_000);
  assert.equal(titles().length, before.length + 1, "made at once, as before");
  await click("[data-plugin-strip] [data-plugin-id=schedule]");
  await waitFor("document.body.dataset.desktopSurface === 'schedule'", 20_000);
  await until(() => titles().length === before.length);
  await click("[data-plugin-strip] [data-plugin-id=pages]");
  await waitFor("document.body.dataset.desktopSurface === 'pages'", 20_000);
  assert.equal(await evaluate("document.querySelector('[data-pages=workbench]').dataset.expanded"), "false", "the list, not an editor on a document that is gone");
  assert.equal(await evaluate("[...document.querySelectorAll('[data-pages-rows] strong')].some(node => node.textContent === '未命名文档')"), false);
  // One that was written in is still there after the same switch, editor and all.
  await click("[data-pages-new]");
  await waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')", 20_000);
  await click("[data-pages-editor] .ProseMirror");
  await command("Input.insertText", { text: "切走前写的" }, sessionId);
  await waitFor("document.querySelector('[data-pages-editor-status]').textContent === '已保存'", 20_000);
  await click("[data-plugin-strip] [data-plugin-id=schedule]");
  await waitFor("document.body.dataset.desktopSurface === 'schedule'", 20_000);
  await click("[data-plugin-strip] [data-plugin-id=pages]");
  await waitFor("document.body.dataset.desktopSurface === 'pages'", 20_000);
  assert.equal(titles().length, before.length + 1, "kept");
  assert.equal(await evaluate("document.querySelector('[data-pages=workbench]').dataset.expanded"), "true", "and still open");

  await click("[data-bar-resident=lingguang]");
  await waitFor(`document.body.dataset.desktopSurface === 'lingguang' && document.querySelector('[data-lingguang-capture]') && ${CLIENTS_READY}`, 20_000);
  const keptSparks = sparks().length;
  await evaluate("document.querySelector('[data-lingguang-capture]').click()");
  await waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'true'", 20_000);
  assert.equal(sparks().length, keptSparks + 1, "made at once, as before");
  await click("[data-plugin-strip] [data-plugin-id=pages]");
  await waitFor("document.body.dataset.desktopSurface === 'pages'", 20_000);
  await until(() => sparks().length === keptSparks);
  await click("[data-bar-resident=lingguang]");
  await waitFor("document.body.dataset.desktopSurface === 'lingguang'", 20_000);
  assert.equal(await evaluate("document.querySelector('[data-lingguang=workbench]').dataset.expanded"), "false");
});

test("Pages and 灵光: reloading with a blank item open takes it back, and the page comes up as its list, with nothing said about it", { timeout: 150_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
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
    await new Promise(resolve => setTimeout(resolve, 3_500));
    assert.deepEqual(await evaluate(`[document.querySelector('${noteSelector}').hidden, document.querySelector('${noteSelector}').textContent, document.querySelector('${surface}').dataset.expanded]`),
      [true, "", "false"], "no 「找不到」 note, and still the list");
  };
  await click("[data-plugin-strip] [data-plugin-id=pages]");
  await waitFor("document.body.dataset.desktopSurface === 'pages' && document.querySelector('[data-pages-new]')", 20_000);
  const before = titles();
  await click("[data-pages-new]");
  await waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')", 20_000);
  assert.equal(titles().length, before.length + 1, "made at once, as before");
  await waitRemembered("pages");
  await reloadPage();
  await until(() => titles().length === before.length);
  await waitFor("document.querySelector('[data-pages=workbench]')", 20_000);
  assert.equal(await evaluate("[...document.querySelectorAll('[data-pages-rows] strong')].some(node => node.textContent === '未命名文档')"), false);
  assert.deepEqual(await remembered("pages"), [], "the document is gone, so the workbench does not remember it to reopen");
  await quietAfterTheReopen("[data-pages-note]", "[data-pages=workbench]");

  // 灵光 the same way, on its own page (the reload comes back to where the person was).
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-picker-popover] [data-plugin-id=lingguang]')", 20_000);
  await click("[data-bar-resident=lingguang]");
  await waitFor(`document.body.dataset.desktopSurface === 'lingguang' && document.querySelector('[data-lingguang-capture]') && ${CLIENTS_READY}`, 20_000);
  const keptSparks = sparks().length;
  await evaluate("document.querySelector('[data-lingguang-capture]').click()");
  await waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'true'", 20_000);
  assert.equal(sparks().length, keptSparks + 1, "made at once, as before");
  await waitRemembered("lingguang");
  await reloadPage();
  await until(() => sparks().length === keptSparks);
  await waitFor(`document.body.dataset.desktopSurface === 'lingguang' && document.querySelector('[data-lingguang-capture]') && ${CLIENTS_READY}`, 20_000);
  assert.deepEqual(await remembered("lingguang"), [], "the spark is gone, so the workbench does not remember it to reopen");
  await quietAfterTheReopen("[data-lingguang-note]", "[data-lingguang=workbench]");
});

test("Pages and 灵光: once a blank item is taken back on 「返回」 the surface stops naming it as the current object", { timeout: 120_000 }, async t => {
  // The Assistant and the placement bar read this attribute, and so does the workbench when it decides whether a record is open.
  const b = await openGoalBrowser(t, true); if (!b) return;
  const { navigate, command, sessionId, origin, projectId, click, evaluate, waitFor } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-id=pages]')", 20_000);
  const object = (surface: string) => evaluate(`JSON.parse(document.querySelector('${surface}').getAttribute('data-assistant-context') || 'null')?.object ?? null`);
  await click("[data-plugin-strip] [data-plugin-id=pages]");
  await waitFor("document.body.dataset.desktopSurface === 'pages' && document.querySelector('[data-pages-new]')", 20_000);
  await click("[data-pages-new]");
  await waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')", 20_000);
  assert.ok(await object("[data-pages=workbench]"), "named while it is open");
  await click("[data-pages-back]");
  await waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'false'", 20_000);
  await waitFor("![...document.querySelectorAll('[data-pages-rows] strong')].some(node => node.textContent === '未命名文档')", 20_000);
  assert.equal(await object("[data-pages=workbench]"), null, "the document taken back is not the object in hand");

  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-picker-popover] [data-plugin-id=lingguang]')", 20_000);
  await click("[data-bar-resident=lingguang]");
  await waitFor(`document.body.dataset.desktopSurface === 'lingguang' && document.querySelector('[data-lingguang-capture]') && ${CLIENTS_READY}`, 20_000);
  await evaluate("document.querySelector('[data-lingguang-capture]').click()");
  await waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'true'", 20_000);
  assert.ok(await object("[data-lingguang=workbench]"), "named while it is open");
  await click("[data-lingguang-back]");
  await waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'false' && document.querySelectorAll('[data-lingguang-id]').length === 0", 20_000);
  assert.equal(await object("[data-lingguang=workbench]"), null);
});

test("灵光: 「记下第一条灵光」 left empty is thrown away when the person goes back, and one with words stays", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const { navigate, command, sessionId, origin, projectId, click, evaluate, waitFor, homeDirectory } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-picker-popover] [data-plugin-id=lingguang]')", 20_000);
  await click("[data-bar-resident=lingguang]");
  await waitFor(`document.body.dataset.desktopSurface === 'lingguang' && document.querySelector('[data-lingguang-capture]') && ${CLIENTS_READY}`, 20_000);
  const kept = () => { const store = openLingguangStore(homeDirectory); try { return store.list(projectId!).map(spark => spark.title); } finally { store.close(); } };
  assert.deepEqual(kept(), []);
  await evaluate("document.querySelector('[data-lingguang-capture]').click()");
  await waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'true' && document.querySelectorAll('[data-lingguang-id]').length === 1", 20_000);
  assert.deepEqual(kept(), ["未命名灵光"], "made at once, as before");
  await click("[data-lingguang-back]");
  await waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'false' && document.querySelectorAll('[data-lingguang-id]').length === 0", 20_000);
  await until(() => kept().length === 0);
  assert.deepEqual(kept(), [], "nothing is left behind, and no 「丢掉这条？」 question was asked");

  await evaluate("document.querySelector('[data-lingguang-capture]').click()");
  await waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'true'", 20_000);
  await evaluate(`(() => { const body = document.querySelector('[data-lingguang-body]'); body.value = '一句话'; body.dispatchEvent(new InputEvent('input', { bubbles: true })); })()`);
  await click("[data-lingguang-back]");
  await waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'false' && document.querySelectorAll('[data-lingguang-id]').length === 1", 20_000);
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
