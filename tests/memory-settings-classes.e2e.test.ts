import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ChromeHarness, locateTestChrome, type ChromePage } from "@molis-ai/molis-work-test-kit/browser";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, memoryActions, type MemoryClassRestriction, type MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { person } from "./fixtures/home-runtime.js";
import { openTestHome, serveTestHost } from "./fixtures/test-home.js";

const root = "[data-memory-classes-test]";
async function choose(page: ChromePage, key: string, value: string) {
  const picker = `${root} .mw-select-picker:has([data-memory-class="${key}"])`;
  await page.click(picker + " .mw-select-picker__trigger");
  await page.click(`.mw-select-picker__menu:popover-open [data-value="${value}"]`);
}

// MEM-CLASS-03: real settings, HTTP actions and persisted preferences in a nonempty isolated Home.
test("classification controls save independent personal/project restrictions, keep failures visible and survive restart", { timeout: 150_000 }, async t => {
  const executable = locateTestChrome(); assert.ok(executable, "Chrome is required for the memory settings journey");
  let browser: ChromeHarness | undefined, directory: string | undefined;
  t.after(async () => { await browser?.close(); if (directory) await rm(directory, { recursive: true, force: true }); });
  const env = await openTestHome(t), project = await env.createProject("分类策略检查");
  const context = person(MEMORY_PERMISSIONS, project.project_id);
  const client = bindActionClient(env.host.actionClient(project.reference), () => context);
  const retained: MemoryClassRestriction = { selector: { consumer: "mcp", current_scene: "common", kind: "fact" }, read: "off", form: "inherit" };
  for (const scope of ["personal", "project"] as const) {
    await client.invoke(memoryActions.write, { scope, text: scope === "personal" ? "说明任务时先写结论" : "交付前核对事实来源", kind: "convention" });
    await client.invoke(memoryActions.savePrefs, { scope, prefs: { class_restrictions: [retained] } });
  }
  const read = (scope: MemoryScope) => client.invoke(memoryActions.prefs, { scope });
  const savePrefs = MemoryService.prototype.savePrefs;
  let failNext = false, failOverviewAfterSave = false, failPrefsRead = false, failedRefreshes = 0;
  t.mock.method(MemoryService.prototype, "savePrefs", function(this: MemoryService, ...args: Parameters<MemoryService["savePrefs"]>) {
    if (failNext) { failNext = false; throw new Error("保存分类限制失败，请重试"); }
    const saved = savePrefs.apply(this, args);
    if (failOverviewAfterSave) { failOverviewAfterSave = false; failPrefsRead = true; }
    return saved;
  });
  const prefs = MemoryService.prototype.prefs;
  t.mock.method(MemoryService.prototype, "prefs", function(this: MemoryService, ...args: Parameters<MemoryService["prefs"]>) {
    if (failPrefsRead) { failPrefsRead = false; failedRefreshes++; throw new Error("刷新分类限制失败，请重新读取"); }
    return prefs.apply(this, args);
  });
  directory = await mkdtemp(join(tmpdir(), "memory-classes-browser-"));
  browser = await ChromeHarness.start(directory, { executable });
  const page = await browser.page();
  const { windowId } = await page.command<{ windowId: number }>("Browser.getWindowForTarget", { targetId: page.targetId });
  await page.command("Browser.setWindowBounds", { windowId, bounds: { width: 1440, height: 1000 } }); await page.viewport(1440, 1000);
  const navigate = async (scope: "personal" | "project") => {
    await page.evaluate("document.documentElement.dataset.oldMemoryClasses = '1'");
    await page.command("Page.navigate", { url: env.origin + (scope === "project" ? `/projects/${project.project_id}` : "") + "/settings/memory" });
    await page.wait("document.documentElement?.dataset.oldMemoryClasses !== '1' && [...document.querySelectorAll('[data-memory-settings]')].some(node => node.checkVisibility())");
    await page.evaluate(`(() => { const node = [...document.querySelectorAll('[data-memory-settings]')].find(node => node.checkVisibility()); node.setAttribute('data-memory-classes-test', ''); })()`);
    await page.wait(`document.querySelector('${root} [data-memory-class-form] fieldset')?.disabled === false`);
    assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('${root} [data-memory-class]')].filter(node =>
      node.closest('.mw-select-picker')?.querySelector('button')?.disabled).map(node => node.dataset.memoryClass)`), [],
    "the loaded form enables its actual picker controls, not only the fieldset");
    assert.equal(await page.evaluate(`document.querySelectorAll('${root} [data-memory-id]').length`), 1, "management stays visible with restrictions");
  };
  const submit = async () => {
    // Hold delivery of the real HTTP response so the pending UI can be observed without faking persistence.
    await page.evaluate(`(() => {
      const original = globalThis.fetch;
      globalThis.memoryClassResponseHeld = false;
      globalThis.fetch = async (...args) => {
        const response = await original(...args);
        if (String(args[0]).endsWith('/api/memory/prefs') && args[1]?.method === 'POST') {
          globalThis.fetch = original;
          await new Promise(resolve => { globalThis.releaseMemoryClassResponse = resolve; globalThis.memoryClassResponseHeld = true; });
        }
        return response;
      };
    })()`);
    try {
      await page.click(root + " [data-memory-class-form] button[type=submit]");
      await page.wait("globalThis.memoryClassResponseHeld === true");
      assert.equal(await page.evaluate(`document.querySelector('${root} [data-memory-class-form] fieldset').disabled`), true);
      assert.equal(await page.evaluate(`[...document.querySelectorAll('${root} [data-memory-class]')].every(node =>
        node.disabled && node.closest('.mw-select-picker')?.querySelector('button')?.disabled)`), true,
      "the actual picker controls stay disabled while the save response is pending");
    } finally { await page.evaluate("globalThis.releaseMemoryClassResponse?.()"); }
    await page.wait(`document.querySelector('${root} [data-memory-class-status]').textContent === '分类限制已保存'`);
    assert.equal(await page.evaluate(`[...document.querySelectorAll('${root} [data-memory-class]')].every(node =>
      !node.disabled && node.closest('.mw-select-picker')?.querySelector('button')?.disabled === false)`), true);
  };
  const expected = new Map<string, MemoryClassRestriction[]>();
  for (const scope of ["personal", "project"] as const) {
    await navigate(scope);
    const selector: MemoryClassRestriction["selector"] = scope === "personal"
      ? { consumer: "assistant", current_scene: "assistant", scene: "common", kind: "preference", lifecycle: "long-term" }
      : { consumer: "agent", current_scene: "coding", scene: "coding", kind: "convention", lifecycle: "long-term" };
    for (const [key, value] of Object.entries(selector)) await choose(page, key, value);
    const rule: MemoryClassRestriction = { selector, read: scope === "personal" ? "explicit-only" : "off", form: scope === "personal" ? "off" : "inherit" };
    await choose(page, "read", rule.read); await choose(page, "form", rule.form);
    if (scope === "personal") {
      failNext = true; await page.click(root + " [data-memory-class-form] button[type=submit]");
      await page.wait(`document.querySelector('${root} [data-memory-class-status]').textContent === '尚未保存，请重试。'`);
      assert.equal(await page.evaluate(`document.querySelector('${root} [data-memory-class-error]').hidden`), false);
      assert.deepEqual((await read(scope)).prefs.class_restrictions, [retained]);
      assert.equal(await page.evaluate(`document.querySelector('${root} [data-memory-class=read]').value`), "explicit-only");
    }
    if (scope === "personal") failOverviewAfterSave = true;
    await submit(); expected.set(scope, [retained, rule]);
    const stored = (await read(scope)).prefs;
    assert.deepEqual(stored.class_restrictions, expected.get(scope)); assert.equal(stored.enabled, true); assert.equal(stored.form, true);
    if (scope === "personal") {
      assert.equal(failedRefreshes, 1, "the successful POST is followed by a real overview read failure");
      assert.equal(await page.evaluate(`document.querySelector('${root} [data-memory-error]').hidden`), false);
      assert.equal(await page.evaluate(`document.querySelector('${root} [data-memory-page-status]').textContent`), "读取未完成，请重新读取。");
      const second: MemoryClassRestriction = { selector: { ...selector, kind: "fact" }, read: "off", form: "inherit" };
      await choose(page, "kind", "fact"); await choose(page, "read", second.read); await choose(page, "form", second.form);
      await submit(); expected.set(scope, [retained, rule, second]);
      assert.deepEqual((await read(scope)).prefs.class_restrictions, expected.get(scope),
        "saving another selector after refresh failure preserves the first confirmed restriction");
    }
    await navigate(scope);
    const buttons = root + " [data-memory-class-list] button";
    await page.evaluate(`document.querySelectorAll('${buttons}')[1].setAttribute('data-edit-class-rule', '')`);
    await page.click("[data-edit-class-rule]");
    assert.equal(await page.evaluate(`document.querySelector('${root} [data-memory-class=read]').value`), rule.read);
    assert.equal(await page.evaluate(`document.querySelector('${root} [data-memory-class=form]').value`), rule.form);
    if (scope === "project") {
      await choose(page, "read", "inherit"); await choose(page, "form", "off"); await submit();
      expected.set(scope, [retained, { ...rule, read: "inherit", form: "off" }]);
      assert.deepEqual((await read(scope)).prefs.class_restrictions, expected.get(scope), "formation changes without disabling reads");
      await choose(page, "form", "inherit"); await submit();
      assert.deepEqual((await read(scope)).prefs.class_restrictions, [retained], "removing this selector preserves unrelated restrictions");
      await choose(page, "form", "off"); await submit();
      assert.deepEqual((await read(scope)).prefs.class_restrictions, expected.get(scope));
    }
  }
  await page.command("Page.navigate", { url: "about:blank" }); await page.wait("location.href === 'about:blank'");
  await env.close(); await env.host.close();
  const reopened = new MolisWorkLocalHost({ homeDirectory: env.home, completeText: null });
  let served: Awaited<ReturnType<typeof serveTestHost>> | undefined;
  try {
    served = await serveTestHost(null, { home: env.home, host: reopened });
    const restored = bindActionClient(reopened.actionClient(project.reference), () => context);
    for (const scope of ["personal", "project"] as const) {
      assert.deepEqual((await restored.invoke(memoryActions.prefs, { scope })).prefs.class_restrictions, expected.get(scope));
      assert.equal((await restored.invoke(memoryActions.page, { scope })).items.length, 1);
    }
  } finally { await served?.close(); await reopened.close(); }
});
