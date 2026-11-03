import assert from "node:assert/strict";
import test from "node:test";
import { readFile, rename, writeFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { seedDemoBoard, seedDemoGoals } from "@molis-ai/molis-work-app-local-host";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import type { Issue } from "@molis-ai/molis-work-plugin-issues";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueView } from "./fixtures/issue-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { issueModel } from "./fixtures/issue-model.js";

const create = (title: string, type: "bug" | "experience" | "feature", description: string) => ({ title, type, description });

test("ISSUE-01 the failed Home page retries only on click and recovers without restarting Work", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "empty", async path => {
    seedDemoBoard(path);
    await seedDemoGoals(path);
    const directory = join(dirname(path), "plugin-runtime"); mkdirSync(directory);
    const db = new DatabaseSync(join(directory, "plugin-runtime.db")); db.exec("PRAGMA user_version=9"); db.close();
  }, null);
  if (!browser) return;
  const { origin, sessionId, command, navigate, click, waitFor, homeDirectory } = browser;
  const child = await pluginFrameBrowser(t, browser, "issues");
  const path = join(homeDirectory, "plugin-runtime", "plugin-runtime.db"), original = await readFile(path);
  await navigate(() => command("Page.navigate", { url: `${origin}/plugins/issues` }, sessionId));
  await waitFor("document.querySelector('[data-home-lifecycle=retry]')?.textContent === '重试启动'");
  await click("[data-home-lifecycle=retry]");
  await waitFor("!document.querySelector('[data-home-status]').hidden && !document.querySelector('[data-home-lifecycle]').disabled");
  assert.deepEqual(await readFile(path), original);
  await rename(path, path + ".rejected");
  await navigate(() => click("[data-home-lifecycle=retry]"));
  await child.waitFor("document.querySelector('[data-issues=workbench]')?.dataset.ready === 'true'");
  await child.waitFor("document.querySelector('[data-issue-list]').textContent.includes('还没有记录')");
  assert.ok(await child.evaluate("document.querySelector('[data-issue-list]').textContent.includes('随手记一笔')"));
  assert.deepEqual(await readFile(path + ".rejected"), original);
  await navigate(() => click("[data-home-lifecycle=disable]"));
  await waitFor("document.querySelector('[data-home-lifecycle=enable]')?.textContent === '启用插件'");
  await navigate(() => click("[data-home-lifecycle=enable]"));
  await child.waitFor("document.querySelector('[data-issues=workbench]')?.dataset.ready === 'true'");
});

test("ISSUE-06 ISSUE-18 a record opens read-only; edits save or cancel; a conflict merges the person's changes; delete asks first", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "empty"); if (!b) return;
  const v = await issueView(t, b, "issue-page");
  t.after(async () => { if (t.error) await v.shot("failure"); });
  await v.viewport(1440, 940); await v.go("/plugins/issues"); await v.until("$('[data-issues=workbench]')?.dataset.ready === 'true'");
  const first = await v.api<Issue>("/api/plugins/io.molis.work.issues/create", create("切换项目后记录应保留", "bug", "切换项目，原来的记录还在。"));
  await v.api("/api/plugins/io.molis.work.issues/create", create("列表需要按类型筛选", "feature", "希望列表可以只看 Bug。"));
  await v.go("/plugins/issues"); await v.until("d.querySelectorAll('.issues-row').length === 2");
  assert.match(await v.ask<string>("$('.issues-row').textContent"), /列表需要按类型筛选功能需求 · 刚刚/, "newest first, with its type and age");
  await v.shot("list-light-1440");
  await v.press(`[data-issue-id="${first.id}"]`);
  await v.until("!$('[data-issue-detail]').hidden && $('[data-issue-title]').textContent === '切换项目后记录应保留'");
  assert.deepEqual(await v.ask("({ type: $('[data-issue-type]').textContent, text: $('[data-issue-text]').textContent, edit: !$('[data-issue-edit]').hidden, editor: $('[data-issue-editor]').hidden, focus: d.activeElement === $('[data-issue-back]') })"),
    { type: "Bug", text: "切换项目，原来的记录还在。", edit: true, editor: true, focus: true });
  assert.match(await v.ask<string>("$('[data-issue-source]').textContent"), /手动记录/);
  await v.shot("detail-light-1440");
  // Escape goes back to the list from a record; it never edits.
  await v.escape(); await v.until("$('[data-issue-detail]').hidden && d.activeElement?.dataset.issueId === " + JSON.stringify(first.id));
  await v.press(`[data-issue-id="${first.id}"]`); await v.press("[data-issue-edit]");
  await v.until("!$('[data-issue-editor]').hidden && d.activeElement === $('[data-issue-editor] [name=title]')");
  await v.type("，并且换项目后还在");
  await v.press("[data-issue-cancel]");
  await v.until("$('[data-issue-editor]').hidden && $('[data-issue-title]').textContent === '切换项目后记录应保留'");
  assert.equal((await v.read(first.id)).version, 1, "cancel writes nothing");
  await v.press("[data-issue-edit]"); await v.press("[data-issue-editor] [data-type=experience]");
  await v.press("[data-issue-save]");
  await v.until("$('[data-issue-editor]').hidden && $('[data-issue-type]').textContent === '体验问题'");
  assert.equal((await v.read(first.id)).type, "experience");
  // Leaving with unsaved changes asks; keeping them stays in the editor.
  await v.press("[data-issue-edit]"); await v.press("[data-issue-editor] [name=description]"); await v.type(" 补一句。");
  await v.press("[data-issue-back]"); await v.until("$('[data-issue-dialog]').open");
  await v.press("[data-issue-dialog] [value=cancel]"); await v.until("!$('[data-issue-dialog]').open && !$('[data-issue-editor]').hidden");
  // Someone else saves first: their title stays, this person's words go on top, nothing is written until saved again.
  await v.api("/api/plugins/io.molis.work.issues/update", { id: first.id, expected_version: 2, title: "别处改过的标题" });
  await v.press("[data-issue-save]");
  await v.until("$('[data-issue-flag]').textContent.includes('已合并你的修改')");
  assert.deepEqual(await v.ask("({ title: $('[data-issue-editor] [name=title]').value, text: $('[data-issue-editor] [name=description]').value })"),
    { title: "别处改过的标题", text: "切换项目，原来的记录还在。 补一句。" });
  assert.equal((await v.read(first.id)).version, 3);
  await v.shot("conflict-merged");
  await v.press("[data-issue-save]"); await v.until("$('[data-issue-editor]').hidden");
  const merged = await v.read(first.id);
  assert.deepEqual([merged.title, merged.description, merged.version], ["别处改过的标题", "切换项目，原来的记录还在。 补一句。", 4]);
  // A write whose answer is lost says it may have happened, and keeps the edit.
  await v.press("[data-issue-edit]"); await v.press("[data-issue-editor] [name=title]"); await v.type("！");
  await v.ask("(d.defaultView.issueFetch = d.defaultView.fetch, d.defaultView.fetch = (url, init) => String(url).endsWith('/update') ? Promise.reject(new TypeError('offline')) : d.defaultView.issueFetch(url, init), true)");
  await v.press("[data-issue-save]");
  await v.until("$('[data-issue-toast] span').textContent.includes('可能已经生效')");
  assert.equal(await v.ask("$('[data-issue-editor] [name=title]').value"), "别处改过的标题！");
  await v.ask("(d.defaultView.fetch = d.defaultView.issueFetch, true)");
  await v.press("[data-issue-cancel]");
  // Delete asks once; cancelling keeps the record, confirming removes it and returns to writing.
  await v.press("[data-issue-delete]"); await v.until("$('[data-issue-dialog]').open && $('[data-issue-dialog] p').textContent.startsWith('别处改过的标题')");
  await v.press("[data-issue-dialog] [value=cancel]"); await v.until("!$('[data-issue-dialog]').open");
  assert.equal((await v.list()).items.length, 2);
  await v.press("[data-issue-delete]"); await v.press("[data-issue-dialog] [value=confirm]");
  await v.until("$('[data-issue-detail]').hidden && d.querySelectorAll('.issues-row').length === 1 && d.activeElement === $('[data-issue-composer] [name=description]')");
  assert.equal((await v.list()).items.length, 1);
  for (const [width, theme] of [[390, "dark"], [1024, "light"]] as const) {
    await v.viewport(width, 844); await b.evaluate(`document.documentElement.dataset.theme='${theme}';document.documentElement.dataset.resolvedTheme='${theme}'`);
    assert.equal(await b.evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    await v.shot(`list-${theme}-${width}`);
  }
});

test("ISSUE-09 ISSUE-27 screenshots: six join a capture, a seventh and a mislabeled file are refused without losing the draft", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "empty"); if (!b) return;
  const v = await issueView(t, b, "issue-page");
  await v.viewport(1440, 940); await v.go("/plugins/issues"); await v.until("$('[data-issues=workbench]')?.dataset.ready === 'true'");
  await v.press("[data-issue-composer] [name=description]"); await v.type("一次贴六张截图");
  for (let index = 0; index < 6; index++) { await v.paste(`第${index + 1}张.png`, 200 + index); await v.until(`d.querySelectorAll('[data-issue-thumbs] img').length === ${index + 1}`); }
  assert.equal(await v.ask("$('[data-issue-composer] [data-issue-tip]').textContent"), "6 / 6 张截图");
  await v.paste("第七张.png"); await v.until("$('[data-issue-composer] [data-issue-tip]').textContent === '每条最多 6 张截图'");
  assert.equal(await v.ask("d.querySelectorAll('[data-issue-thumbs] img').length"), 6);
  await v.press("[data-issue-thumbs] figure:nth-child(2) [data-remove]");
  await v.until("d.querySelectorAll('[data-issue-thumbs] img').length === 5 && d.activeElement === $('[data-issue-composer] [data-issue-pick]')");
  // A JPEG named PNG decodes in a browser, but its declared type must match its bytes to be saved: refused at once.
  await v.ask(`(async () => { const c = d.createElement('canvas'); c.width = 20; c.height = 20; const blob = await new Promise(r => c.toBlob(r, 'image/jpeg'));
    const t = new DataTransfer(); t.items.add(new File([blob], '改名的.png', { type: 'image/png' }));
    $('[data-issue-composer] [name=description]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: t, bubbles: true, cancelable: true })); return true; })()`);
  await v.until("$('[data-issue-composer] [data-issue-tip]').textContent === '图片无法读取，请重新选择有效的图片。'");
  assert.deepEqual(await v.ask("({ shots: d.querySelectorAll('[data-issue-thumbs] img').length, text: $('[data-issue-composer] [name=description]').value })"), { shots: 5, text: "一次贴六张截图" });
  // Preview fits the window. A screenshot that already shows at its own pixels offers no 原始尺寸 (it would change nothing);
  // zoomed in from the keyboard, the button comes back to fit it again. It closes with Escape back to its thumbnail.
  await v.ask("(window.issuePreviewLoaded = new Promise(resolve => $('[data-issue-picture] img').addEventListener('load', () => resolve(true), { once: true })), true)");
  await v.press("[data-issue-thumbs] figure:first-child [data-preview]"); await v.until("$('[data-issue-preview]').open");
  await v.ask("window.issuePreviewLoaded");
  await v.until("$('[data-issue-picture] img').complete && $('[data-issue-picture] img').naturalWidth > 0 && $('[data-issue-picture]').dataset.zoom === 'fit' && $('[data-issue-zoom]').hidden");
  assert.equal(await v.ask("($('[data-issue-picture]').dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true })), $('[data-issue-picture]').dataset.zoom)"), "zoomed", "the zoom key changes the view synchronously");
  try { await v.until("$('[data-issue-picture]').dataset.zoom === 'zoomed' && !$('[data-issue-zoom]').hidden && $('[data-issue-zoom]').textContent === '适应窗口'"); }
  catch (error) { throw new Error(JSON.stringify(await v.ask("({ zoom: $('[data-issue-picture]').dataset.zoom, button: $('[data-issue-zoom]').outerHTML, image: $('[data-issue-picture] img').style.cssText })")), { cause: error }); }
  await v.escape(); await v.until("!$('[data-issue-preview]').open && d.activeElement?.matches('[data-issue-thumbs] figure:first-child [data-preview]')");
});

test("ISSUE-10 ISSUE-43 dropped screenshots preview, save and reopen; a late import joins nothing", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "empty"); if (!b) return;
  await issueModel(t, b.homeDirectory);
  const v = await issueView(t, b, "issue-page");
  await v.viewport(1440, 940); await v.go("/plugins/issues"); await v.until("$('[data-issues=workbench]')?.dataset.ready === 'true'");
  await v.frame.evaluate("window.issueScreen = 0; if(!navigator.mediaDevices)Object.defineProperty(navigator, 'mediaDevices', {value:{}}); navigator.mediaDevices.getDisplayMedia = async () => { issueScreen++; throw Error('screen access must not be requested'); }");
  const pngUrl = await b.evaluate<string>("(() => { const c = document.createElement('canvas'); c.width = 64; c.height = 32; c.getContext('2d').fillRect(0, 0, 64, 32); return c.toDataURL('image/png'); })()");
  const files = [join(b.homeDirectory, "第一张.png"), join(b.homeDirectory, "第二张.png")];
  for (const file of files) await writeFile(file, Buffer.from(pngUrl.split(",")[1]!, "base64"));
  const { x, y } = await v.point("[data-issue-composer] [name=description]");
  // Browser-native file drag supplies FileList and MIME metadata, without constructing a DOM drop event.
  for (const type of ["dragEnter", "dragOver", "drop"]) await b.command("Input.dispatchDragEvent", { type, x, y, data: { items: [], files, dragOperationsMask: 1 } }, b.sessionId);
  await v.until("d.querySelectorAll('[data-issue-thumbs] img').length === 2");
  assert.deepEqual(await v.ask("[...d.querySelectorAll('[data-issue-thumbs] img')].map(i => i.alt)"), ["第一张.png", "第二张.png"]);
  assert.equal(await v.frame.evaluate("issueScreen"), 0, "adding pictures never asks for the screen");
  await v.press("[data-issue-thumbs] [data-preview]");
  await v.until("$('[data-issue-preview]').open && $('[data-issue-preview] img').naturalWidth === 64");
  await v.escape();
  await v.press("[data-issue-composer] [name=description]"); await v.type("截图拖入后保存并重开，图片应保持完整。");
  await v.send();
  await v.until("$('[data-issue-list] .issues-row') && !$('[data-issue-list] [data-state=organizing]')", 20_000);
  const [captured] = (await v.list()).items;
  assert.ok(captured);
  const expectedImages = files.map(path => ({ name: path.split("/").at(-1), data_url: pngUrl }));
  assert.deepEqual((await v.read(captured.id)).images, expectedImages, "the dropped bytes, names and order are persisted");
  await v.go("/plugins/issues"); await v.press(`[data-issue-id="${captured.id}"]`);
  await v.until("d.querySelectorAll('[data-issue-view-shots] img').length === 2");
  await v.press("[data-issue-view-shots] [data-preview]");
  await v.until("$('[data-issue-preview]').open && $('[data-issue-preview] img').naturalWidth === 64");
  assert.equal(await v.ask("$('[data-issue-preview] img').src"), pngUrl);
  await v.escape(); await v.press("[data-issue-back]");

  const saved = await v.api<Issue>("/api/plugins/io.molis.work.issues/create", create("已有记录", "bug", "原文"));
  await v.go("/plugins/issues"); await v.press(`[data-issue-id="${saved.id}"]`); await v.press("[data-issue-edit]");
  await v.frame.evaluate("const decode = createImageBitmap; window.createImageBitmap = file => new Promise(resolve => { window.issueFinish = () => decode(file).then(resolve); })");
  await v.frame.frameCommand("Page.setInterceptFileChooserDialog", { enabled: true });
  await v.press("[data-issue-editor] [data-issue-pick]");
  await v.frame.setFiles("[data-issue-files]", [files[0]!]);
  await v.until("$('[data-issue-editor] [data-issue-tip]').textContent === '正在读取截图…'");
  // I5-ISSUE-INTERLEAVE-01: wait for the real decoder to enter its held promise before cancelling the record.
  await v.until("typeof window.issueFinish === 'function'");
  await v.press("[data-issue-cancel]"); await v.press("[data-issue-back]");
  await v.frame.evaluate("window.issueFinish()"); await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(await v.ask("d.querySelectorAll('[data-issue-edit-shots] img').length"), 0, "a late picture does not join a record the person left");
  assert.equal((await v.read(saved.id)).images.length, 0);
});

test("ISSUE-06 hidden and removed Issue views stop refreshing; one remount keeps one listener", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "empty"); if (!browser) return;
  const { origin, sessionId, command, navigate } = browser;
  const { evaluate, waitFor } = await pluginFrameBrowser(t, browser, "issues");
  await navigate(() => command("Page.navigate", { url: `${origin}/plugins/issues` }, sessionId));
  await waitFor("document.querySelector('[data-issue-list]').textContent.includes('还没有记录')");
  await evaluate(`window.issueChecks = { reads: 0, root: document.querySelector('[data-issues=workbench]') };
    const originalFetch = window.fetch.bind(window);
    window.fetch = (...args) => { if (String(args[0]).includes('/api/plugins/io.molis.work.issues/list')) window.issueChecks.reads++; return originalFetch(...args); };
    window.issueChecks.parent = window.issueChecks.root.parentElement;
    window.issueChecks.refresh = () => dispatchEvent(new CustomEvent('molis:assistant-effect', { detail: { capability_id: 'issues.create' } }));`);
  const nextFrame = "await new Promise(resolve => requestAnimationFrame(resolve));";
  assert.equal(await evaluate(`(async()=>{issueChecks.root.hidden=true;${nextFrame}issueChecks.reads=0;issueChecks.refresh();${nextFrame}return issueChecks.reads;})()`), 0,
    "a hidden view must not read on assistant notifications");
  await evaluate("issueChecks.root.hidden=false");
  await waitFor("issueChecks.reads === 1");
  assert.equal(await evaluate(`(async()=>{issueChecks.root.remove();${nextFrame}issueChecks.reads=0;issueChecks.refresh();${nextFrame}return issueChecks.reads;})()`), 0,
    "removing the view must release its global listener");
  await evaluate(`issueChecks.parent.append(issueChecks.root);
    const mount = (${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})();
    const host = { root: issueChecks.root, mountPluginClient: mount, translate: text => text, route: path => path,
      pluginId: 'io.molis.work.issues', pluginRoute: path => '/api/plugins/io.molis.work.issues' + path, readRefusal: () => '' };
    globalThis.molisWorkbenchPluginFactories.issues(host);globalThis.molisWorkbenchPluginFactories.issues(host);`);
  await waitFor("issueChecks.reads === 1");
  assert.equal(await evaluate(`(async()=>{issueChecks.reads=0;issueChecks.refresh();${nextFrame}return issueChecks.reads;})()`), 1,
    "mounting the same node twice must keep exactly one active listener");
  assert.equal(await evaluate("issueChecks.root.querySelectorAll('style').length"), 1);
});
