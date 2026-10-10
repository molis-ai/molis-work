import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("ISSUE-01 ISSUE-06 real page captures, keeps conflicting drafts, crosses projects, and confirms deletion", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "empty"); if (!browser) return;
  const { origin, sessionId, command, evaluate, waitFor, navigate, click, homeDirectory } = browser;
  const evidence = resolve(".impeccable/qa/review/issue-home-v0"); await mkdir(evidence, { recursive: true });
  const screenshot = async (name: string) => {
    const image = await command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
    await writeFile(resolve(evidence, `${name}.png`), Buffer.from(image.data, "base64"));
  };
  t.after(async () => { if (t.error) await screenshot("failure"); });
  const resize = (width: number) => command("Emulation.setDeviceMetricsOverride", { width, height: 940, deviceScaleFactor: 1, mobile: false }, sessionId);
  const enter = async (selector: string, text: string) => {
    await click(selector); await command("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 4, commands: ["selectAll"] }, sessionId);
    await command("Input.insertText", { text }, sessionId);
  };
  const api = <T>(path: string, body?: unknown) => evaluate<T>(`(async()=>{const response=await fetch('/api/plugins/io.molis.work.issues/'+${JSON.stringify(path)},
    {method:${JSON.stringify(body === undefined ? "GET" : "POST")},headers:globalThis.molisWorkControlHeaders(),${body === undefined ? "" : `body:JSON.stringify(${JSON.stringify(body)})`}});
    if(!response.ok)throw new Error(await response.text());return response.json();})()`);
  await resize(1440);
  await navigate(() => command("Page.navigate", { url: `${origin}/plugins/issues` }, sessionId));
  await waitFor("document.querySelector('[data-issue-list]').textContent.includes('还没有问题记录')");
  await evaluate("document.documentElement.dataset.theme='light';document.documentElement.dataset.resolvedTheme='light'");
  await screenshot("empty-light-1440");
  await click("[data-issue-new]");
  await enter('[name="title"]', "切换项目后记录应保留");
  await enter('[name="description"]', "  从问题列表进入详情，\n希望原文和空白都保留。\n");
  await click("[data-issue-save]");
  assert.equal(await evaluate("document.querySelector('[name=type]').validity.valueMissing"), true);
  assert.equal((await api<{ items: unknown[] }>("list")).items.length, 0);
  await evaluate("document.querySelector('[name=type]').value='experience';document.querySelector('[name=type]').dispatchEvent(new Event('change',{bubbles:true}))");
  await click("[data-issue-save]");
  await waitFor("document.querySelector('[data-issue-note]').textContent === '已保存'");
  const saved = (await api<{ items: Array<{ id: string; description: string; version: number }> }>("list")).items[0]!;
  assert.equal(saved.description, "  从问题列表进入详情，\n希望原文和空白都保留。\n");
  assert.equal(saved.version, 1);
  await screenshot("detail-light-1440");
  await evaluate("document.documentElement.dataset.theme='dark';document.documentElement.dataset.resolvedTheme='dark'");
  await screenshot("detail-dark-1440");
  await resize(1024); await screenshot("detail-dark-1024");
  await resize(390); await screenshot("detail-dark-390");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  await evaluate("document.documentElement.dataset.theme='light';document.documentElement.dataset.resolvedTheme='light'");
  await screenshot("detail-light-390");
  await resize(1440);

  await api("update", { id: saved.id, expected_version: 1, title: "另一入口已修改" });
  await enter('[name="title"]', "仍保留我的草稿");
  await click("[data-issue-save]");
  await waitFor("document.querySelector('[data-issue-note]').classList.contains('is-error')");
  assert.equal(await evaluate("document.querySelector('[name=title]').value"), "仍保留我的草稿");
  await screenshot("conflict-preserved");
  await click("[data-issue-reread]"); await waitFor("document.querySelector('[data-issue-dialog]').open");
  await click('[data-issue-dialog] [value="cancel"]');
  assert.equal(await evaluate("document.querySelector('[name=title]').value"), "仍保留我的草稿");
  await click("[data-issue-reread]"); await click("[data-issue-dialog-ok]");
  await waitFor("document.querySelector('[name=title]').value === '另一入口已修改'");

  const projects = await withMolisWorkProjectCatalog({ homeDirectory }, async catalog => [
    await catalog.createProject({ display_name: "Issue 页面验证 A", actor_id: "web-user" }),
    await catalog.createProject({ display_name: "Issue 页面验证 B", actor_id: "web-user" }),
  ]);
  const records = await Promise.all(projects);
  for (const project of records) {
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${project.project_id}/?openPlugin=issues` }, sessionId));
    await waitFor("document.querySelector('[data-issues=workbench]')?.dataset.ready === 'true'", 15_000);
    await waitFor("document.querySelector('[data-issue-list]').textContent.includes('另一入口已修改')", 10_000);
    await click(`[data-issue-id="${saved.id}"]`);
    await waitFor("document.querySelector('[name=title]').value === '另一入口已修改'");
  }
  await screenshot("project-b-same-issue");
  await click("[data-issue-delete]"); await waitFor("document.querySelector('[data-issue-dialog]').open");
  await screenshot("delete-confirmation"); await click('[data-issue-dialog] [value="cancel"]');
  assert.equal((await api<{ items: unknown[] }>("list")).items.length, 1);
  await click("[data-issue-delete]"); await click("[data-issue-dialog-ok]");
  await waitFor("document.querySelector('[data-issue-list]').textContent.includes('还没有问题记录')");
  assert.equal((await api<{ items: unknown[] }>("list")).items.length, 0);
});

test("ISSUE-06 hidden and removed Issue views stop refreshing; one remount keeps one listener", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "empty"); if (!browser) return;
  const { origin, sessionId, command, evaluate, waitFor, navigate } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/plugins/issues` }, sessionId));
  await waitFor("document.querySelector('[data-issue-list]').textContent.includes('还没有问题记录')");
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
    const host = { root: issueChecks.root, mountPluginClient: mount, translate: text => text };
    globalThis.molisWorkbenchPluginFactories.issues(host);globalThis.molisWorkbenchPluginFactories.issues(host);`);
  await waitFor("issueChecks.reads === 1");
  assert.equal(await evaluate(`(async()=>{issueChecks.reads=0;issueChecks.refresh();${nextFrame}return issueChecks.reads;})()`), 1,
    "mounting the same node twice must keep exactly one active listener");
  assert.equal(await evaluate("issueChecks.root.querySelectorAll('style').length"), 1);
});
