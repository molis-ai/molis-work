import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// Found in the artifact-positioning walkthrough: 「已存为固定版本」 offers 打开, and it opens the version just pinned in the
// 成果库 — not the document it was pinned from, which is already open.
for (const width of [1440, 390]) {
  test(`Pages ${width}px: the toast after pinning a version opens that version in the 成果库`, { timeout: 90_000 }, async t => {
    const browser = await openGoalBrowser(t, true, undefined, null);
    if (!browser) return;
    const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId } = browser;
    await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
    await waitFor("document.querySelector('[data-plugin-id=pages]')");
    if (await evaluate("document.body.dataset.desktopSurface") !== "pages") await click('[data-plugin-strip] [data-plugin-id=pages]');
    await waitFor("document.body.dataset.desktopSurface === 'pages'");
    await click("[data-pages-new]");
    await waitFor("document.querySelector('[data-pages-editor] .ProseMirror')");
    await evaluate(`(() => { const title = document.querySelector('[data-pages-title]'); title.value = '固定后打开'; title.dispatchEvent(new InputEvent('input', { bubbles: true })); })()`);
    await click("[data-pages-editor] .ProseMirror");
    await command("Input.insertText", { text: "这一版要在成果库里打开。" }, sessionId);
    await waitFor("document.querySelector('[data-pages-editor-status]').textContent === '已保存'");

    await click("[data-pages-artifact-bar]");
    await waitFor("[...document.querySelectorAll('.placement-toast')].some(toast => toast.textContent.includes('已存为固定版本') && [...toast.querySelectorAll('button')].some(button => button.textContent === '打开'))", 15_000);
    await evaluate("[...document.querySelectorAll('.placement-toast')].find(toast => toast.textContent.includes('已存为固定版本')).querySelectorAll('button')[0].click()");
    await waitFor("document.body.dataset.desktopSurface === 'artifacts' && (document.querySelector('[data-artifact-detail]')?.innerText ?? '').includes('这一版要在成果库里打开')", 15_000);
    assert.match(await evaluate<string>("document.querySelector('[data-artifact-detail]').innerText"), /固定后打开/);
    assert.match(await evaluate<string>("location.pathname"), new RegExp(`^/projects/${projectId}/`), "it stays in this project");
  });
}
