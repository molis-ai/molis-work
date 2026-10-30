import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openJellyStore } from "./fixtures/plugin-home-stores.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

// 灵光 is the one place for ideas (specs/post-merge-review PMR-22): a file read into 灵光 becomes a spark, and a spark can
// become a Jelly note that opens in Jelly. Jelly no longer has an ideas view of its own.
test("a file read into 灵光 becomes a spark, and the spark becomes a Jelly note that opens in Jelly", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
  const spark = await pluginFrameBrowser(t, browser, "lingguang");
  const jelly = await pluginFrameBrowser(t, browser, "jelly");
  const { evaluate, waitFor, click } = spark;
  const folder = await mkdtemp(join(tmpdir(), "lingguang-file-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const file = join(folder, "发布会预热.md");
  await writeFile(file, "倒计时海报提前一周放出，现场再放一面用户留言墙。");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);

  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=jelly` }, sessionId));
  await browser.waitFor("document.body.dataset.desktopSurface === 'jelly'");
  await jelly.waitFor("!!document.querySelector('[data-jelly-content] [data-jelly-day]')");
  assert.equal(await jelly.evaluate("Boolean(document.querySelector('[data-jelly-view=\"inspirations\"]'))"), false, "Jelly keeps a calendar and notes; ideas live in 灵光");

  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=lingguang` }, sessionId));
  await browser.waitFor("document.body.dataset.desktopSurface === 'lingguang'");
  await waitFor("Boolean(document.querySelector('[data-lingguang-import-file]')?.getClientRects().length)");
  await spark.setFiles("[data-lingguang-file]", [file]);
  await waitFor("document.querySelector('[data-lingguang-title]')?.value === '发布会预热' && document.querySelector('[data-lingguang-body]').value.includes('倒计时海报提前一周放出')", 15_000);
  assert.match(String(await evaluate("document.querySelector('[data-lingguang-body]').value")), /文件：发布会预热\.md/);
  assert.equal(await evaluate("document.querySelector('[data-lingguang-reading]').open"), false, "the reading dialog closes once the spark is kept");

  await click("[data-lingguang-to-jelly]");
  await browser.waitFor("[...document.querySelectorAll('.placement-toast')].some(toast => toast.textContent.includes('已转成') && toast.textContent.includes('发布会预热'))", 15_000);
  const notes = (() => { const store = openJellyStore(homeDirectory); try { return store.read().notes; } finally { store.close(); } })();
  assert.equal(notes.length, 1);
  assert.equal(notes[0]!.title, "发布会预热");
  assert.match(notes[0]!.blocks.map(block => block.text).join("\n"), /倒计时海报提前一周放出[\s\S]*来自：灵光 · 发布会预热/);

  // 「打开」 goes to that note in Jelly.
  await browser.evaluate("[...document.querySelectorAll('.placement-toast button')].find(button => button.textContent === '打开').click()");
  await browser.waitFor("document.body.dataset.desktopSurface === 'jelly'");
  await jelly.waitFor("document.querySelector('[data-jelly-record-title]')?.value === '发布会预热'", 15_000);
});

test("RAC-1844 a file read into 灵光 whose name is past 80 characters becomes a spark titled with its first 80 characters, whole", { timeout: 120_000 }, async t => {
  // Unit 80 of the name falls between the two units of 🟢 (U+1F7E2): the page used to send half of it, and the spark's title ended on a broken character.
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, navigate, origin, projectId } = browser;
  const spark = await pluginFrameBrowser(t, browser, "lingguang");
  const folder = await mkdtemp(join(tmpdir(), "lingguang-file-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const title = "a".repeat(79) + "🟢";
  const file = join(folder, title + "尾尾尾.md");
  await writeFile(file, "倒计时海报提前一周放出，现场再放一面用户留言墙。");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=lingguang` }, sessionId));
  await browser.waitFor("document.body.dataset.desktopSurface === 'lingguang'");
  await spark.waitFor("Boolean(document.querySelector('[data-lingguang-import-file]')?.getClientRects().length)");
  await spark.setFiles("[data-lingguang-file]", [file]);
  await spark.waitFor(`document.querySelector('[data-lingguang-title]')?.value === ${JSON.stringify(title)}`, 15_000);
});
