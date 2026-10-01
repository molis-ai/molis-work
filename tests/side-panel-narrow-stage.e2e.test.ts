import assert from "node:assert/strict";
import test from "node:test";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

// The side panel takes its width from the plugin stage. In an 860px window with the panel open, the stage is about 470px:
// beside a 240px list an open document would get some 200px. The record takes the whole stage instead, as on a phone,
// and the list comes back when the panel closes.
test("an open record keeps a readable width when the side panel narrows the stage", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 860, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  const store = openPagesStore(homeDirectory);
  const page = (() => { try {
    return store.create({ project_id: projectId!, title: "发布筹备摘要", body: { type: "doc", content: [paragraph("小王周五前把新版方案发给张总。预算等小李确认后再定。")] } });
  } finally { store.close(); } })();
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${page.id}` }, sessionId));
  await waitFor("document.querySelector('[data-pages=workbench]')?.dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes('小王周五前')");
  const layout = () => evaluate<{ list: boolean; editor: number; overflow: boolean }>(`(() => {
    const shell = document.querySelector('[data-pages=workbench]');
    return { list: shell.querySelector('.plugin-stage-list').getClientRects().length > 0,
      editor: Math.round(shell.querySelector('[data-pages-editor] .ProseMirror').getBoundingClientRect().width),
      overflow: document.documentElement.scrollWidth > innerWidth };
  })()`);

  const wide = await layout();
  assert.equal(wide.list, true, "without the side panel the list stays beside the document");
  assert.equal(wide.overflow, false);

  await click("[data-side-toggle]");
  await waitFor("document.body.dataset.sideOpen === 'true' && document.querySelector('section.side-panel').getBoundingClientRect().width >= 360");
  await waitFor("document.querySelector('[data-pages=workbench] .plugin-stage-list').getClientRects().length === 0");
  const narrow = await layout();
  assert.ok(narrow.editor >= 360, `the document keeps a readable width beside the panel: ${narrow.editor}px`);
  assert.equal(narrow.overflow, false);
  // The way back to the list is still there.
  assert.ok(await evaluate("Boolean(document.querySelector('[data-pages=workbench] .plugin-stage-detail-bar')?.getClientRects().length)"));

  await click("[data-side-toggle]");
  await waitFor("document.body.dataset.sideOpen !== 'true' && document.querySelector('[data-pages=workbench] .plugin-stage-list').getClientRects().length > 0");
});
