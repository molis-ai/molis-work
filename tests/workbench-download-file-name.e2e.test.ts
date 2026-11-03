import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

// RAC-2164: in real Chrome the workbench saves a plugin page's download under the name the page gave it, cut by whole characters
// and keeping its extension (apps/workbench/src/browser/plugin-frame/links.ts). Jelly names an exported note after its title (at most
// 100 characters) and ".html", so a title of 100 emoji is 205 UTF-16 units; the old cut at 200 units dropped the extension. The name is
// read from the event Chrome raises when the download begins, not from the file on disk, which Chrome and the system may shorten again.
// Chrome appends an extension from the MIME type when the name has none, so the event alone cannot tell whether the shell kept the
// extension: the `download` attribute the shell sets on its link is recorded too (the old cut at 200 UTF-16 units dropped ".html" there).
test("RAC-2164 a note titled with 100 emoji is saved as those 100 emoji and .html", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
  const { evaluate, waitFor, click } = await pluginFrameBrowser(t, browser, "jelly");
  const title = "😀".repeat(100);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=jelly` }, sessionId));
  await browser.waitFor("document.querySelector('[data-plugin-id=jelly]')");
  if (await browser.evaluate("document.body.dataset.desktopSurface") !== "jelly") {
    await browser.click('[data-plugin-strip] [data-plugin-id=jelly]');
  }
  await waitFor("!!document.querySelector('[data-jelly-content] [data-jelly-day]')");
  await click('[data-jelly-view="notes"]'); await click('[data-jelly-new]');
  await waitFor("document.querySelector('[data-jelly-record-title]')");
  await evaluate(`(() => { const input = document.querySelector('[data-jelly-record-title]'); input.value = ${JSON.stringify(title)}; input.dispatchEvent(new InputEvent('input', { bubbles: true })); })()`);
  await click('[data-jelly-block-text]'); await command("Input.insertText", { text: "核对来源，再保存结果" }, sessionId);
  await waitFor("document.querySelector('[data-jelly-save-status]').textContent === '已保存'");
  const downloads = join(homeDirectory, "downloads"); await mkdir(downloads);
  await command("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads, eventsEnabled: true });
  const begun = Promise.withResolvers<string>();
  t.after(browser.on("Browser.downloadWillBegin", event => { begun.resolve(String(event.suggestedFilename)); }));
  const timer = setTimeout(() => begun.reject(new Error("The download did not begin")), 12_000);
  try {
    // RAC-2164: the name the shell hands to Chrome, after its cut. Old code cut at 200 UTF-16 units, so this recorded 100 emoji and
    // no ".html"; the wrapper only records the attribute and calls the original click, so the download path is unchanged.
    await browser.evaluate("window.__downloadAttributes = []; const originalClick = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { window.__downloadAttributes.push(String(this.download)); return originalClick.call(this); };");
    await click("[data-jelly-editor-more]"); await click("[data-jelly-export-note-html]");
    assert.equal(await begun.promise, title + ".html");
    assert.deepEqual(JSON.parse(await browser.evaluate<string>("JSON.stringify(window.__downloadAttributes)")), [title + ".html"]);
  } finally { clearTimeout(timer); }
});
