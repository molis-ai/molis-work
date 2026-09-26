import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

for (const width of [1440, 390]) {
  test(`Pages ${width}px: interrupted publication survives reload, resumes its original snapshot and keeps later edits`, { timeout: 90_000 }, async t => {
    const browser = await openGoalBrowser(t, true, undefined, null);
    if (!browser) return;
    const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory, store: project } = browser;
    await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
    const openPages = async () => {
      await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
      await waitFor("document.querySelector('[data-plugin-id=pages]')");
      if (await evaluate("document.body.dataset.desktopSurface") !== "pages") {
        if (width === 390) await click('.workspace-chrome [data-directory-show]');
        await click('[data-plugin-strip] [data-plugin-id=pages]');
      }
      await waitFor("document.body.dataset.desktopSurface === 'pages'");
    };
    await openPages(); await click('[data-pages-new]');
    await waitFor("document.querySelector('[data-pages-editor] .ProseMirror')");
    await evaluate(`(() => { const title = document.querySelector('[data-pages-title]'); title.value = '已确认的发布快照'; title.dispatchEvent(new InputEvent('input', { bubbles: true })); })()`);
    await click('[data-pages-editor] .ProseMirror');
    await command("Input.insertText", { text: "本次成果只包含已经确认的研究结论。" }, sessionId);
    await waitFor("document.querySelector('[data-pages-editor-status]').textContent === '已保存'");
    const pages = openPagesStore(homeDirectory), db = openHomeSqliteDatabase(homeDirectory, "pages");
    try {
      const original = pages.list(projectId!)[0]!;
      db.exec("CREATE TRIGGER fail_ui_publication BEFORE UPDATE OF artifact_version ON pages WHEN NEW.artifact_version > OLD.artifact_version BEGIN SELECT RAISE(ABORT, '测试：成果关联暂未保存'); END");
      await click('[data-pages-artifact-bar]');
      await waitFor("document.querySelector('[data-pages-note]').textContent.includes('成果关联暂未保存') && document.querySelector('[data-pages-artifact-bar]').textContent.includes('继续保存')");
      assert.equal(pages.get(original.id, projectId!).publication_pending!.version, 1);
      db.exec("DROP TRIGGER fail_ui_publication");
      await openPages();
      await click(`button.feed-stage-entry[data-page-id="${original.id}"]`);
      await waitFor("document.querySelector('[data-pages-artifact-bar]').textContent.includes('继续保存') && document.querySelector('[data-pages-note]').textContent.includes('当时的快照')");
      await evaluate(`(() => { const title = document.querySelector('[data-pages-title]'); title.value = '后续编辑仍在文稿中'; title.dispatchEvent(new InputEvent('input', { bubbles: true })); })()`);
      await waitFor("document.querySelector('[data-pages-editor-status]').textContent === '已保存'");
      const output = new URL("../.impeccable/review/action-service/", import.meta.url); await mkdir(output, { recursive: true });
      const screenshot = async (state: string) => writeFile(new URL(`pages-publication-${state}-${width}.png`, output), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
      await screenshot("pending");
      await click('[data-pages-artifact-bar]');
      await waitFor("document.querySelector('[data-pages-note]').textContent.includes('已恢复上次成果') && document.querySelector('[data-pages-artifact-bar]').textContent === '再存一版'");
      const final = pages.get(original.id, projectId!);
      assert.equal(final.title, "后续编辑仍在文稿中"); assert.equal(final.artifact_version, 1); assert.equal(final.publication_pending, undefined);
      const artifact = project.db.prepare("SELECT payload_json FROM artifact_versions WHERE artifact_id = ? AND version = 1").get(final.artifact_id) as { payload_json: string };
      assert.equal(JSON.parse(artifact.payload_json).title, "已确认的发布快照");
      assert.equal(project.db.prepare("SELECT COUNT(*) AS n FROM artifact_versions WHERE artifact_id = ?").get(final.artifact_id)!.n, 1);
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
      await screenshot("recovered");
    } finally { db.close(); pages.close(); }
  });
}
