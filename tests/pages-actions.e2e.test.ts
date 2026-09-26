import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

for (const width of [1440, 390]) {
  test(`Pages ${width}px: real create/edit, model candidate, restart and conflicting save`, { timeout: 90_000 }, async t => {
    const prompts: string[] = [];
    const browser = await openGoalBrowser(t, true, undefined, async prompt => { prompts.push(prompt); return "整理后的文稿：把讨论转成可执行的下一步。"; });
    if (!browser) return;
    const { command, sessionId, evaluate, waitFor, navigate, click, reloadPage, origin, projectId, homeDirectory } = browser;
    await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
    await waitFor("document.querySelector('[data-plugin-id=pages]')");
    if (width === 390) await click('.workspace-chrome [data-directory-show]');
    await click('[data-plugin-strip] [data-plugin-id=pages]');
    await waitFor("document.body.dataset.desktopSurface === 'pages' && document.querySelector('[data-pages-new]')");
    await click('[data-pages-new]');
    await waitFor("document.querySelector('[data-pages=workbench]').dataset.expanded === 'true' && document.querySelector('[data-pages-editor] .ProseMirror')");
    await evaluate(`(() => { const title = document.querySelector('[data-pages-title]'); title.value = '项目讨论记录'; title.dispatchEvent(new InputEvent('input', {bubbles:true})); })()`);
    await click('[data-pages-editor] .ProseMirror');
    await command("Input.insertText", { text: "今天讨论了动作服务的使用流程，下一步需要验证真实执行。" }, sessionId);
    await waitFor("document.querySelector('[data-pages-editor-status]').textContent === '已保存'");
    await evaluate(`(() => { const editor = document.querySelector('[data-pages-editor] .ProseMirror'); editor.focus(); const range = document.createRange(); range.selectNodeContents(editor); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event('selectionchange')); })()`);
    await waitFor("document.querySelector('[data-mark=ai]')?.getBoundingClientRect().width > 0");
    await click('[data-mark=ai]');
    await waitFor("[...document.querySelectorAll('.pages-pop button')].some(button => button.textContent.trim() === '总结')");
    await evaluate(`[...document.querySelectorAll('.pages-pop button')].find(button => button.textContent.trim() === '总结').click()`);
    await waitFor("document.querySelector('.pages-pop textarea')?.value.includes('整理后的文稿')");
    assert.equal(prompts.length, 1); assert.match(prompts[0]!, /今天讨论了动作服务/);
    const store = openPagesStore(homeDirectory);
    try {
      const page = store.list(projectId!)[0]!;
      assert.equal(page.title, "项目讨论记录");
      assert.match(JSON.stringify(page.body), /今天讨论/);
      assert.doesNotMatch(JSON.stringify(page.body), /整理后的文稿/, "candidate requires user confirmation");
    } finally { store.close(); }
    await evaluate(`[...document.querySelectorAll('.pages-pop button')].find(button => button.textContent.trim() === "确定").click()`);
    await waitFor("document.querySelector('[data-pages-editor] .ProseMirror').textContent.includes('整理后的文稿') && document.querySelector('[data-pages-editor-status]').textContent === '已保存'");
    const saved = openPagesStore(homeDirectory);
    try { assert.match(JSON.stringify(saved.list(projectId!)[0]!.body), /整理后的文稿/); } finally { saved.close(); }
    await reloadPage();
    await waitFor("document.querySelector('[data-plugin-id=pages]')");
    if (await evaluate("document.body.dataset.desktopSurface") !== 'pages') {
      if (width === 390) await click('.workspace-chrome [data-directory-show]');
      await click('[data-plugin-strip] [data-plugin-id=pages]');
    }
    await waitFor("document.querySelector('button.feed-stage-entry[data-page-id]')");
    await click('button.feed-stage-entry[data-page-id]');
    await waitFor("document.querySelector('[data-pages-title]')?.value === '项目讨论记录' && document.querySelector('[data-pages-editor] .ProseMirror')?.textContent.includes('整理后的文稿')");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    const output = new URL("../.impeccable/review/action-service/", import.meta.url); await mkdir(output, { recursive: true });
    await writeFile(new URL(`pages-actions-${width}.png`, output), Buffer.from((await command<{data:string}>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
    const other = openPagesStore(homeDirectory);
    try { const page = other.list(projectId!)[0]!; other.update(page.id, { title: "另一窗口的新标题" }, projectId!); } finally { other.close(); }
    await evaluate(`(() => { const title = document.querySelector('[data-pages-title]'); title.value = '当前未保存的草稿'; title.dispatchEvent(new InputEvent('input', {bubbles:true})); })()`);
    await waitFor("document.querySelector('[data-pages-note]').textContent.includes('其他窗口修改')");
    assert.equal(await evaluate("document.querySelector('[data-pages-title]').value"), "当前未保存的草稿");
    await click('[data-pages-back]');
    assert.equal(await evaluate("document.querySelector('[data-pages-stage-workspace]').hidden"), false);
    const final = openPagesStore(homeDirectory);
    try { assert.equal(final.list(projectId!)[0]!.title, "另一窗口的新标题"); } finally { final.close(); }
  });
}
