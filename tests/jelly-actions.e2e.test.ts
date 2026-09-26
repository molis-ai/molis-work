import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openJellyStore } from "@molis-ai/molis-work-plugin-jelly";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
for (const width of [1440, 390]) test(`Jelly ${width}px: create, edit, manual plan, copy event and reload through actions`, { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, reloadPage, origin, projectId, homeDirectory } = browser;
  const read = () => { const store = openJellyStore(homeDirectory); try { return store.read(); } finally { store.close(); } };
  await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=jelly` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-id=jelly]')");
  if (await evaluate("document.body.dataset.desktopSurface") !== "jelly") {
    if (width === 390) await click('.workspace-chrome [data-directory-show]');
    await click('[data-plugin-strip] [data-plugin-id=jelly]');
  }
  await waitFor("document.body.dataset.desktopSurface === 'jelly' && document.querySelector('[data-jelly-period-title]').textContent.length > 0");
  await click('[data-jelly-view="notes"]'); await click('[data-jelly-new]');
  await waitFor("document.querySelector('[data-jelly-record-title]')");
  await evaluate(`(() => { const input=document.querySelector('[data-jelly-record-title]'); input.value='行动服务验证笔记'; input.dispatchEvent(new InputEvent('input',{bubbles:true})); })()`);
  await click('[data-jelly-block-text]'); await command("Input.insertText", { text: "核对来源，再保存结果" }, sessionId);
  await waitFor("document.querySelector('[data-jelly-save-status]').textContent === '已保存'");
  assert.equal(read().notes[0]!.title, "行动服务验证笔记"); assert.equal(read().notes[0]!.blocks[0]!.text, "核对来源，再保存结果");
  await click('[data-jelly-decompose]'); await click('[data-jelly-plan-manual]'); await click('[data-jelly-dialog-ok]');
  await waitFor("document.querySelector('[data-jelly-plan-title]')");
  assert.equal(read().notes[0]!.blocks.filter(b => b.kind === "task").length, 0);
  // Deliver the previous progress view close event after the next view has opened.
  await evaluate("document.querySelector('[data-jelly-dialog]').dispatchEvent(new Event('close'))");
  // This preview creates a note task without silently scheduling it.
  await evaluate(`document.querySelectorAll('[data-jelly-plan-schedule]').forEach(input=>{if(input.checked) input.click();})`);
  await click('[data-jelly-dialog-ok]');
  await waitFor("!document.querySelector('[data-jelly-dialog]').open && document.querySelector('[data-jelly-block][data-kind=task]')");
  assert.equal(read().notes[0]!.blocks.filter(b => b.kind === "task").length, 1); assert.equal(read().items.length, 0);
  if (width === 390) assert.ok(await evaluate<number>("document.querySelector('[data-jelly-block][data-kind=task] [data-jelly-block-text]').getBoundingClientRect().width") > 250, "task text must retain readable width beside its checkbox");
  const output = new URL("../.impeccable/review/action-service/", import.meta.url); await mkdir(output, { recursive: true });
  await writeFile(new URL(`jelly-note-${width}.png`, output), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  await click('[data-jelly-back]'); await click('[data-jelly-view="calendar"]'); await click('[data-jelly-new]');
  await waitFor("document.querySelector('[data-jelly-item-dialog]').open");
  await evaluate(`document.querySelector('[data-jelly-field=title]').value='团队复盘日程'`);
  await click('[data-jelly-item-kind="event"]'); await click('[data-jelly-item-form] button[type=submit]');
  await waitFor("!document.querySelector('[data-jelly-item-dialog]').open");
  assert.equal(read().items[0]!.kind, "event");
  await click('[data-jelly-mode="list"]');
  await waitFor("document.querySelector('[data-jelly-occurrence]')");
  await click('[data-jelly-occurrence]'); await click('[data-jelly-item-copy]');
  await waitFor("!document.querySelector('[data-jelly-item-dialog]').open && document.querySelectorAll('[data-jelly-occurrence]').length === 2");
  assert.equal(read().items.length, 2); assert.ok(read().items.every(i => i.kind === "event"));
  assert.notEqual(read().items[0]!.id, read().items[1]!.id);
  await reloadPage(); await waitFor("document.querySelector('[data-plugin-id=jelly]')");
  if (await evaluate("document.body.dataset.desktopSurface") !== "jelly") {
    if (width === 390) await click('.workspace-chrome [data-directory-show]');
    await click('[data-plugin-strip] [data-plugin-id=jelly]');
  }
  await waitFor("document.querySelector('[data-jelly-period-title]').textContent.length > 0");
  await click('[data-jelly-mode="list"]'); await waitFor("document.querySelectorAll('[data-jelly-occurrence]').length === 2");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  await writeFile(new URL(`jelly-calendar-${width}.png`, output), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
});
