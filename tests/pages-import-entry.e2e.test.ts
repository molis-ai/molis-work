import assert from "node:assert/strict";
import test from "node:test";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// Pages keeps its own import (user decision 2026-10-03, artifact-positioning §1): files become Pages documents to keep
// editing, and nothing is written to the 成果库. The 成果库 keeps its own import for versions people keep.
for (const width of [1440, 390]) {
  test(`Pages ${width}px: its own import turns a file into a Pages document, not a 成果`, { timeout: 90_000 }, async t => {
    const browser = await openGoalBrowser(t, true, undefined, null);
    if (!browser) return;
    const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory, store: project } = browser;
    await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
    await waitFor("document.querySelector('[data-plugin-id=pages]')");
    if (await evaluate("document.body.dataset.desktopSurface") !== "pages") await click('[data-plugin-strip] [data-plugin-id=pages]');
    await waitFor("document.body.dataset.desktopSurface === 'pages' && Boolean(document.querySelector('[data-pages-import]'))");
    const artifactsBefore = (project.db.prepare("SELECT COUNT(*) AS n FROM library_artifact_versions").get() as { n: number }).n;

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
