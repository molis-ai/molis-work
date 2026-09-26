import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { createLocalFeedApplication } from "../apps/local-host/src/feed-application.js";
import { createLocalFeedSourceService } from "../apps/local-host/src/feed-source-service.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

for (const width of [1440, 390]) {
  test(`Inbox ${width}px: select actual material, recover failed generation and edit the persisted Pages result`, { timeout: 90_000 }, async t => {
    let calls = 0;
    const browser = await openGoalBrowser(t, true, undefined, async prompt => {
      calls++; assert.match(prompt, /仅阅读研究摘要，尚未核对全文/);
      if (calls === 1) throw new Error("测试模型暂时不可用，材料已保留");
      return "本次观察来自研究摘要，全文仍待核对。[材料 1]";
    });
    if (!browser) return;
    const { store, command, sessionId, evaluate, waitFor, navigate, click, reloadPage, origin, projectId, homeDirectory } = browser;
    const boardId = store.goalsQuery.listBoardIds()[0]!;
    const feed = createLocalFeedApplication(store.db);
    const source = createLocalFeedSourceService(store.db, boardId).register({ kind: "research_library", repository: "fixture/observations", research_source: "summary" }).source;
    const item = feed.ingestItem({ source, externalId: "pages-ui-material", title: "产品研究摘要", summary: "仅阅读研究摘要，尚未核对全文", occurredAt: new Date().toISOString(), attention: false }).item;
    const entry = feed.ensureInboxEntryForFeedItem(boardId, item.item_id, "manual").entry;
    await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
    const openInbox = async () => {
      await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=inbox` }, sessionId));
      await waitFor("document.querySelector('[data-plugin-id=inbox]')");
      if (await evaluate("document.body.dataset.desktopSurface") !== "inbox") {
        if (width === 390) await click('.workspace-chrome [data-directory-show]');
        await click('[data-plugin-strip] [data-plugin-id=inbox]');
      }
      await waitFor("document.body.dataset.desktopSurface === 'inbox'");
      await click('[data-inbox-compose-open=""]');
      await waitFor("document.querySelector('[data-inbox-compose]').open");
    };
    await openInbox();
    await click(`[data-inbox-compose] input[name=entry_id][value="${entry.entry_id}"]`);
    await evaluate(`(() => { const form = document.querySelector('[data-inbox-compose-form]'); form.elements.title.value = '研究观察草稿'; form.elements.instructions.value = '区分摘要观察和未核验信息，保留材料边界'; form.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await click('[data-inbox-compose-submit]');
    await waitFor("document.querySelector('[data-inbox-compose-status]').textContent.includes('测试模型暂时不可用')");
    const pages = openPagesStore(homeDirectory);
    try {
      const failed = pages.generations(projectId!)[0]!;
      assert.equal(failed.status, "failed"); assert.equal(failed.inputs[0]!.item_id, item.item_id); assert.equal(pages.list(projectId!).length, 0);
      await reloadPage();
      await openInbox();
      await waitFor("document.querySelector('[data-inbox-compose-results]').textContent.includes('恢复处理')");
      await click('[data-inbox-compose-results] .inbox-compose-result button');
      assert.equal(await evaluate("document.querySelector('[data-inbox-compose-form]').elements.title.value"), "研究观察草稿");
      await click('[data-inbox-compose-submit]');
      await waitFor("document.body.dataset.desktopSurface === 'pages' && document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes('全文仍待核对')", 12_000);
      assert.equal(calls, 2);
      const record = pages.generation(projectId!, failed.request_id)!;
      assert.equal(record.status, "completed"); assert.equal(pages.list(projectId!).length, 1);
      assert.equal(feed.getInboxEntry(boardId, entry.entry_id).status, "open");
      await evaluate(`(() => { const title = document.querySelector('[data-pages-title]'); title.value = '人工补充后的研究草稿'; title.dispatchEvent(new InputEvent('input', { bubbles: true })); })()`);
      await waitFor("document.querySelector('[data-pages-editor-status]').textContent === '已保存'");
      assert.equal(pages.get(record.document_id!, projectId!).title, "人工补充后的研究草稿");
      assert.match(JSON.stringify(pages.get(record.document_id!, projectId!).body), new RegExp(`/projects/${projectId}/`));
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
      const output = new URL("../.impeccable/review/action-service/", import.meta.url); await mkdir(output, { recursive: true });
      await writeFile(new URL(`inbox-pages-actions-${width}.png`, output), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
    } finally { pages.close(); }
  });
}
