import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

const entry = '[data-home-plugin-open="issues"]';
const ready = "document.querySelector('[data-issues=workbench]')?.dataset.ready === 'true'";

test("ISSUE-30 a Home without projects exposes a labelled Issue entry in the titlebar", { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, "empty"); if (!b) return;
  await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/?desktop=1" }, b.sessionId));
  await b.evaluate(`(async () => {
    const response = await fetch('/api/onboarding/dismiss', {method:'POST', headers:globalThis.molisWorkControlHeaders(),body:JSON.stringify({kind:'first_run',user_confirmed:true})});
    if (!response.ok) throw new Error(await response.text());
  })()`);
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/?desktop=1" }, b.sessionId));
  assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(entry)}).closest('header') !== null`), true);
  assert.equal(await b.evaluate(`document.querySelectorAll(${JSON.stringify(entry)}).length`), 1);
  await b.click(entry);
  await b.waitFor(ready);
  assert.equal(await b.evaluate("location.pathname"), "/plugins/issues");
  assert.match(await b.evaluate<string>("document.querySelector('[data-issue-list]').textContent"), /还没有问题记录/);
  await b.navigate(() => b.click('a[href="/"]'));
  await b.waitFor(`document.querySelector(${JSON.stringify(entry)})`);
});

test("ISSUE-30 the global entry stays visible and opens the same Issue without losing project or Issue drafts", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "user"); if (!b) return;
  await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, b.sessionId);
  const evidence = resolve(".impeccable/qa/review/issue-global-navigation"); await mkdir(evidence, { recursive: true });
  const enter = async (selector: string, text: string) => {
    await b.click(selector);
    await b.command("Input.insertText", { text }, b.sessionId);
  };
  const visibleEntry = async (page: string) => {
    for (const theme of ["light", "dark"]) for (const width of [1440, 1024, 390, 320]) {
      await b.command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, b.sessionId);
      await b.evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)};document.documentElement.dataset.resolvedTheme=${JSON.stringify(theme)}`);
      const image = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, b.sessionId);
      await writeFile(resolve(evidence, `${page}-${theme}-${width}.png`), Buffer.from(image.data, "base64"));
      assert.deepEqual(await b.evaluate(`(() => {
        const button = document.querySelector(${JSON.stringify(entry)}), box = button.getBoundingClientRect();
        return { text: button.textContent.trim(), visible: box.width >= 60 && box.height >= 28 && box.right <= innerWidth && box.left >= 0 && box.top >= 0 && box.bottom <= 80,
          clickable: button.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)),
          pageFits: document.documentElement.scrollWidth <= innerWidth };
      })()`), { text: "Issue", visible: true, clickable: true, pageFits: true }, `${page}, ${theme}, ${width}`);
    }
  };
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/" }, b.sessionId));
  await visibleEntry("home");
  await b.navigate(() => b.click(entry));
  await b.waitFor(ready);
  const saved = await b.evaluate<{ id: string }>(`(async () => {
    const response = await fetch('/api/plugins/io.molis.work.issues/create', { method: 'POST', headers: globalThis.molisWorkControlHeaders(),
      body: JSON.stringify({title:'全局导航自检', description:'打开问题后应能继续原项目', type:'experience'}) });
    if (!response.ok) throw new Error(await response.text()); return response.json();
  })()`);
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/?desktop=1` }, b.sessionId));
  await b.waitFor("document.querySelector('.tab-item[data-tab-kind=home][aria-current]')");
  await visibleEntry("project");
  await b.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, b.sessionId);
  await enter('[data-assistant-input]', "项目内尚未发送的输入");
  const projectUrl = await b.evaluate("location.href");
  await b.click(entry);
  await b.waitFor(`document.body.dataset.desktopSurface === 'issues' && document.querySelector('[data-issue-id="${saved.id}"]')`);
  assert.equal(await b.evaluate("location.href"), projectUrl, "opening Issue keeps the project document");
  await b.click(`[data-issue-id="${saved.id}"]`);
  await b.waitFor("document.querySelector('[data-issue-view-title]').textContent === '全局导航自检'");
  await b.click('[data-issue-edit]');
  await enter('[name=description]', "；这段编辑尚未保存");
  const draft = await b.evaluate("document.querySelector('[name=description]').value");
  await b.click('.tab-item[data-tab-kind=home] .tab-item-trigger');
  await b.waitFor("document.body.dataset.desktopSurface === 'home'");
  assert.equal(await b.evaluate("document.querySelector('[data-assistant-input]').value"), "项目内尚未发送的输入");
  await b.click(entry);
  await b.waitFor("document.body.dataset.desktopSurface === 'issues'");
  assert.equal(await b.evaluate("document.querySelector('[name=description]').value"), draft);
  await b.click(entry);
  assert.equal(await b.evaluate("document.querySelector('[name=description]').value"), draft, "a second click does not reset editing");
  const persisted = await b.evaluate<{ description: string; version: number }>(`fetch('/api/plugins/io.molis.work.issues/read?id=${saved.id}').then(response => response.json())`);
  assert.equal(persisted.description, "打开问题后应能继续原项目");
  assert.equal(persisted.version, 1, "switching and returning never saves a draft");
});
