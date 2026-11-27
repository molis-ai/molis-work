import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";

// RAC-2164: in real Chrome the workbench saves a plugin page's download under the name the page gave it, cut by whole characters
// and keeping its extension (apps/workbench/src/browser/plugin-frame/links.ts). Pages names an exported document after its title (at
// most 80 characters) and ".html", so a title of 80 emoji is 165 UTF-16 units and must arrive whole. Names past 200 units, where the
// old cut dropped the extension, are covered without a browser in workbench-download-file-name.test.ts (RAC-2160, RAC-2161); Jelly's
// note export, which this test used to drive, was removed in batch 112-2. The name is read from the event Chrome raises when the
// download begins, not from the file on disk, which Chrome and the system may shorten again. Chrome appends an extension from the
// MIME type when the name has none, so the event alone cannot tell whether the shell kept the extension: the `download` attribute
// the shell sets on its link is recorded too.
test("RAC-2164 a document titled with 80 emoji is saved as those 80 emoji and .html", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
  const { waitFor, click } = await pluginFrameBrowser(t, browser, "pages");
  const title = "😀".repeat(80);
  const store = openPagesStore(homeDirectory, projectId!);
  const page = (() => { try { return store.create({ title, body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "核对来源，再保存结果" }] }] } }); } finally { store.close(); } })();
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${page.id}` }, sessionId));
  await waitFor(`document.querySelector('[data-pages-title]')?.value === ${JSON.stringify(title)} && document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes('核对来源')`, 20_000);
  const downloads = join(homeDirectory, "downloads"); await mkdir(downloads);
  await command("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads, eventsEnabled: true });
  const begun = Promise.withResolvers<string>();
  t.after(browser.on("Browser.downloadWillBegin", event => { begun.resolve(String(event.suggestedFilename)); }));
  const timer = setTimeout(() => begun.reject(new Error("The download did not begin")), 12_000);
  try {
    // RAC-2164: the name the shell hands to Chrome, after its cut; the wrapper only records the attribute and calls the original click, so the download path is unchanged.
    await browser.evaluate("window.__downloadAttributes = []; const originalClick = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { window.__downloadAttributes.push(String(this.download)); return originalClick.call(this); };");
    await click("[data-pages-more]"); await click('[data-pages-export="html"]');
    assert.equal(await begun.promise, title + ".html");
    assert.deepEqual(JSON.parse(await browser.evaluate<string>("JSON.stringify(window.__downloadAttributes)")), [title + ".html"]);
  } finally { clearTimeout(timer); }
});
