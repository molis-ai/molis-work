import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// T-229 (MISC, T-190's review): a list row's preview is cut by units, so a two-unit character at the cut leaves half of it;
// the import dialog shows source.length units as if they were characters. Both are the page's own text, fixed here.

async function openJelly(t: { after: (fn: () => Promise<unknown>) => void }) {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return null;
  const { command, sessionId, navigate, origin, projectId } = browser;
  const jelly = await pluginFrameBrowser(t, browser, "jelly");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=jelly` }, sessionId));
  await browser.waitFor("document.querySelector('[data-plugin-id=jelly]')");
  if (await browser.evaluate("document.body.dataset.desktopSurface") !== "jelly") await browser.click('[data-plugin-strip] [data-plugin-id=jelly]');
  await jelly.waitFor("!!document.querySelector('[data-jelly-content] [data-jelly-day]')");
  return { browser, jelly, command, sessionId };
}

async function createNote(opened: NonNullable<Awaited<ReturnType<typeof openJelly>>>, title: string, body: string): Promise<void> {
  const { jelly, command, sessionId } = opened;
  await jelly.click('[data-jelly-view="notes"]');
  await jelly.click("[data-jelly-new]");
  await jelly.waitFor("document.querySelector('[data-jelly-record-title]')");
  await jelly.evaluate(`(() => { const input = document.querySelector('[data-jelly-record-title]'); input.value = ${JSON.stringify(title)}; input.dispatchEvent(new InputEvent("input", { bubbles: true })); })()`);
  await jelly.click("[data-jelly-block-text]");
  await command("Input.insertText", { text: body }, sessionId);
  await jelly.waitFor("document.querySelector('[data-jelly-save-status]').textContent === '已保存'");
}

test("RAC-2190 a note list row's preview is cut to 180 whole characters, never half of one", { timeout: 120_000 }, async t => {
  // 179 "a" then 😀 (two units, U+1F600): unit 180 is the emoji's high surrogate, so a cut by units ends on half of it.
  const opened = await openJelly(t); if (!opened) return;
  await createNote(opened, "长预览", "a".repeat(179) + "😀" + "尾");
  await opened.jelly.click("[data-jelly-back]");
  await opened.jelly.click('[data-jelly-view="notes"]');
  await opened.jelly.waitFor("!!document.querySelector('[data-jelly-record] p')");
  const preview = await opened.jelly.evaluate<string>("document.querySelector('[data-jelly-record] p').textContent");
  assert.equal(preview.endsWith("\ud83d"), false, "the preview ends on a whole character, not half of an emoji");
  assert.equal([...preview].length, 179, "179 characters: the cut emoji is left out whole");
});

test("RAC-2191 the import dialog counts characters, as the limit it is shown against does, not UTF-16 units", { timeout: 120_000 }, async t => {
  // 🟢 (U+1F7E2) is one character and two units, so ten of them are 10 characters and 20 units.
  const opened = await openJelly(t); if (!opened) return;
  await createNote(opened, "导入笔记", "第一行");
  const folder = await mkdtemp(join(tmpdir(), "jelly-import-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const file = join(folder, "note.md");
  await writeFile(file, "🟢".repeat(10));
  await opened.jelly.setFiles("[data-jelly-note-file]", [file]);
  await opened.jelly.waitFor("document.querySelector('[data-jelly-dialog]')?.open === true");
  const text = await opened.jelly.evaluate<string>("document.querySelector('[data-jelly-dialog-body]').textContent");
  assert.match(text, /· 10 个字符/, "the dialog counts characters, not UTF-16 units");
});
