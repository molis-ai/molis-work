import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test from "node:test";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// Pages keeps its own import (user decision 2026-10-03, artifact-positioning §1): files become Pages documents to keep
// editing, and nothing is written to the 成果库. The 成果库 keeps its own import for versions people keep.
type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;

/** Open Pages in a project, open the import dialog and let it read one Markdown file up to the preview. */
async function openImportPreview(browser: Browser, child: Awaited<ReturnType<typeof pluginFrameBrowser>>, width: number): Promise<void> {
  const {command,sessionId,navigate,origin,projectId}=browser;
  const {evaluate,waitFor,click}=child;
  await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
  await browser.waitFor("document.querySelector('[data-plugin-id=pages]')");
  if (await browser.evaluate("document.body.dataset.desktopSurface") !== "pages") await browser.click('[data-plugin-strip] [data-plugin-id=pages]');
  await waitFor("Boolean(document.querySelector('[data-pages-import]'))");
  // An empty library offers import next to the templates; the header has it too.
  await click("[data-pages-import]");
  await waitFor("document.querySelector('[data-pages-import-dialog]')?.open === true");
  await evaluate(`(() => {
    const input = document.querySelector('[data-pages-import-files]');
    const transfer = new DataTransfer();
    transfer.items.add(new File(["# 迁移来的周报\\n\\n- 第一条\\n- 第二条\\n"], "周报.md", { type: "text/markdown" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await waitFor("!document.querySelector('[data-pages-import-preview]').hidden && !document.querySelector('[data-pages-import-submit]').disabled", 15_000);
}

for (const width of [1440, 390]) {
  test(`Pages ${width}px: its own import turns a file into a Pages document, not a 成果`, { timeout: 90_000 }, async t => {
    const browser = await openGoalBrowser(t, true, undefined, null);
    if (!browser) return;
    const child = await pluginFrameBrowser(t,browser,"pages");
    const {evaluate,waitFor,click}=child;
    const {projectId, homeDirectory, store: project} = browser;
    const artifactsBefore = (project.db.prepare("SELECT COUNT(*) AS n FROM library_artifact_versions").get() as { n: number }).n;

    await openImportPreview(browser, child, width);
    await click("[data-pages-import-submit]");
    await waitFor("document.querySelector('[data-pages-import-status]').textContent.includes('已导入')", 15_000);
    await waitFor("!document.querySelector('[data-pages-import-open]').hidden");
    await click("[data-pages-import-open]");
    await waitFor("document.querySelector('[data-pages-import-dialog]')?.open === false && document.querySelector('[data-pages-title]')?.value === '迁移来的周报'", 15_000);

    const pages = openPagesStore(homeDirectory);
    try {
      const documents = pages.list(projectId!);
      assert.deepEqual(documents.map(document => document.title), ["迁移来的周报"], "the file became one Pages document");
    } finally { pages.close(); }
    assert.equal((project.db.prepare("SELECT COUNT(*) AS n FROM library_artifact_versions").get() as { n: number }).n, artifactsBefore, "Pages' import writes nothing to the 成果库");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  });
}

// W3-02-D: a request body the Host refuses as too large answers 413 (it answered 400 before). The import client clears its submission on a bad
// request (400, 404) and now on 413 too, so a retry is a new submission with a new request id and not a replay of the one the Host refused.
test("Pages import: a 413 clears the submission, so the retry carries a new request id", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const child = await pluginFrameBrowser(t,browser,"pages");
  const {evaluate,waitFor,click}=child;
  await openImportPreview(browser, child, 1440);
  // The first import request is answered 413 by a stand-in for the Host; the second one reaches the real Host and imports.
  // The page asks through the frame's molisWorkRequest (it captured fetch when the frame started), so the stand-in wraps that helper
  // and refuses the way the helper reports a refused request: an Error with the Host's status, code and words.
  await evaluate(`(() => {
    const real = window.molisWorkRequest; window.__importRequestIds = [];
    window.molisWorkRequest = Object.assign((url, init = {}) => {
      if (init.method === "POST" && /\\/api\\/plugins\\/io\\.molis\\.work\\.pages\\/pages\\/import(\\?|$)/.test(String(url))) {
        window.__importRequestIds.push(init.body.request_id);
        if (window.__importRequestIds.length === 1) return Promise.reject(Object.assign(new Error("请求内容过大"), { status: 413, code: "actions.input_too_large" }));
      }
      return real(url, init);
    }, real);
  })()`);
  await click("[data-pages-import-submit]");
  await waitFor("document.querySelector('[data-pages-import-status]').textContent.includes('请求内容过大')", 15_000);
  await waitFor("!document.querySelector('[data-pages-import-submit]').disabled");
  await click("[data-pages-import-submit]");
  await waitFor("document.querySelector('[data-pages-import-status]').textContent.includes('已导入')", 15_000);
  const ids = await evaluate<string[]>("window.__importRequestIds");
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1], "after a 413 the retry is a new submission");
});
