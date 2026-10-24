import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// Pages keeps its own import (user decision 2026-10-03, artifact-positioning §1): files become Pages documents to keep
// editing, and nothing is written to the 成果库. The 成果库 keeps its own import for versions people keep.
type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
type Child = Awaited<ReturnType<typeof pluginFrameBrowser>>;

// Inspect before click(): that helper scrolls targets into view and could conceal a clipped footer.
async function assertFooterVisible(child: Child, selector = '[data-pages-import-dialog]'): Promise<void> {
  const boxes = await child.evaluate<Array<{ visible: boolean }>>(`(() => {
    const dialog = document.querySelector(${JSON.stringify(selector)}), box = dialog.getBoundingClientRect();
    return [...dialog.querySelectorAll('footer button, .mw-form__footer button, .creative-confirm-actions button')]
      .filter(button => button.getClientRects().length).map(button => {
        const r = button.getBoundingClientRect();
        const points = [[r.left + 6, r.top + 6], [r.right - 6, r.top + 6], [r.left + 6, r.bottom - 6], [r.right - 6, r.bottom - 6]];
        return { label: button.textContent, rect: r.toJSON(), dialog: box.toJSON(), viewport: [innerWidth, innerHeight],
          visible: r.top >= Math.max(0, box.top) && r.bottom <= Math.min(innerHeight, box.bottom)
            && r.left >= Math.max(0, box.left) && r.right <= Math.min(innerWidth, box.right)
            && points.every(([x, y]) => button.contains(document.elementFromPoint(x, y))) };
      });
  })()`);
  assert.ok(boxes.length > 0);
  assert.ok(boxes.every(box => box.visible), JSON.stringify(boxes));
}

async function capture(browser: Browser, name: string): Promise<void> {
  const output = new URL('../.impeccable/qa/review/dialog-footer/', import.meta.url);
  await mkdir(output, { recursive: true });
  await writeFile(new URL(name + '.png', output), Buffer.from((await browser.command<{ data: string }>('Page.captureScreenshot', { format: 'png' }, browser.sessionId)).data, 'base64'));
}

/** Open Pages in a project, open the import dialog and let it read one Markdown file up to the preview. */
async function openImportPreview(browser: Browser, child: Child, width: number, height = width === 390 ? 844 : 750): Promise<void> {
  const {command,sessionId,navigate,origin,projectId}=browser;
  const {evaluate,waitFor,click}=child;
  await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
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

for (const width of [1440, 1024, 390]) {
  test(`Pages ${width}px: its own import turns a file into a Pages document, not a 成果`, { timeout: 90_000 }, async t => {
    const browser = await openGoalBrowser(t, true, undefined, null);
    if (!browser) return;
    const child = await pluginFrameBrowser(t,browser,"pages");
    const {evaluate,waitFor,click}=child;
    const {projectId, homeDirectory, store: project} = browser;
    const artifactsBefore = (project.db.prepare("SELECT COUNT(*) AS n FROM library_artifact_versions").get() as { n: number }).n;

    await openImportPreview(browser, child, width);
    const alignment = await evaluate<Record<string, boolean>>(`(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const drop = box('.pages-import-drop'), icon = box('.pages-import-drop svg');
      // The shared picker hides the native select; measure the combobox the person sees.
      const field = box('.pages-import-fields > .pages-import-field'), select = box('.pages-import-fields > .pages-import-field [role=combobox]');
      const check = box('.pages-import-document input'), title = box('.pages-import-document strong');
      return { centredUpload: Math.abs((icon.left + icon.right) - (drop.left + drop.right)) < 2,
        inlineSource: Math.abs(select.top - field.top) < 2, inlineDocument: title.left > check.right };
    })()`);
    assert.ok(Object.values(alignment).every(Boolean), JSON.stringify(alignment));
    for (const theme of ['light', 'dark']) {
      await browser.evaluate(`document.documentElement.dataset.resolvedTheme = '${theme}'`);
      await evaluate(`document.documentElement.dataset.resolvedTheme = '${theme}'`);
      await capture(browser, `import-${width}-${theme}`);
      await assertFooterVisible(child);
    }
    await click("[data-pages-import-submit]");
    await waitFor("document.querySelector('[data-pages-import-status]').textContent.includes('已导入')", 15_000);
    await waitFor("!document.querySelector('[data-pages-import-open]').hidden");
    await assertFooterVisible(child);
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

test("Pages import: a short window keeps actions visible through long previews, scrolling and cancellation", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "pages");
  await openImportPreview(browser, child, 1024, 520);
  await child.evaluate(`(() => {
    const input = document.querySelector('[data-pages-import-files]'), transfer = new DataTransfer();
    for (let i = 0; i < 20; i++) transfer.items.add(new File(['# 长文档 ' + i + '\\n\\n' + '有正文的迁移预览。\\n'.repeat(100)], '周报-' + i + '.md', { type: 'text/markdown' }));
    input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await child.waitFor("document.querySelectorAll('.pages-import-document').length === 20 && !document.querySelector('[data-pages-import-submit]').disabled");
  await capture(browser, 'long-preview');
  await assertFooterVisible(child);
  await child.click('.pages-import-document summary');
  await assertFooterVisible(child);
  const scroll = await child.evaluate<{ moved: boolean; lastVisible: boolean }>(`(() => {
    const body = document.querySelector('.pages-import-fields'); body.scrollTop = body.scrollHeight;
    const last = document.querySelector('.pages-import-document:last-child').getBoundingClientRect(), box = body.getBoundingClientRect();
    return { moved: body.scrollTop > 0, lastVisible: last.bottom <= box.bottom && last.top >= box.top };
  })()`);
  assert.deepEqual(scroll, { moved: true, lastVisible: true }, 'the last document remains reachable in the content scroller');
  await assertFooterVisible(child);
  await child.click('.pages-import-document:last-child input');
  assert.match(await child.evaluate<string>("document.querySelector('[data-pages-import-submit]').textContent"), /\(19\)/);
  await capture(browser, 'long-preview-scrolled');
  await child.click('[data-pages-import-close]');
  await child.waitFor("!document.querySelector('[data-pages-import-dialog]').open");
  const pages = openPagesStore(browser.homeDirectory);
  try { assert.equal(pages.list(browser.projectId!).length, 0, 'cancel does not create documents'); }
  finally { pages.close(); }
});

test("Pages: template, name and confirmation actions remain visible in a short window", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "pages");
  await openImportPreview(browser, child, 1024, 400);
  await capture(browser, 'import-short');
  await assertFooterVisible(child);
  await child.click('[data-pages-import-close]');
  await child.click('[data-pages-empty] [data-pages-templates]');
  await child.waitFor("document.querySelector('[data-pages-template-dialog]').open");
  await capture(browser, 'templates-short');
  await assertFooterVisible(child, '[data-pages-template-dialog]');
  await child.click('[data-pages-template-dialog] button[value=cancel]');
  await child.click('[data-pages-create-more]');
  await child.click('[data-pages-new-folder]');
  await child.waitFor("document.querySelector('[data-pages-name]').open");
  // The folder contract permits a blank name but rejects names over 40 characters.
  await child.evaluate("document.querySelector('[data-name-input]').value = '文件夹'.repeat(20)");
  await child.click('[data-name-ok]');
  await child.waitFor("!document.querySelector('[data-name-error]').hidden && !document.querySelector('[data-name-ok][data-loading]')");
  assert.equal(await child.evaluate("document.querySelector('[data-name-input]').value"), '文件夹'.repeat(20));
  await assertFooterVisible(child, '[data-pages-name]');
  await capture(browser, 'name-error-short');
  await child.click('[data-name-cancel]');
  await child.click('[data-pages-new]');
  await child.waitFor("document.querySelector('[data-pages-editor] .ProseMirror')");
  await child.click('[data-pages-more]');
  await child.click('[data-pages-delete]');
  await child.waitFor("document.querySelector('[data-pages-confirm]').open");
  await assertFooterVisible(child, '[data-pages-confirm]');
  // A refused deletion leaves its message in the content area, with cancel still fully reachable.
  await child.evaluate(`(() => {
    const real = window.fetch.bind(window);
    window.fetch = (input, init) => init?.method === 'POST' && String(input?.url || input).includes('/delete')
      ? Promise.resolve(new Response(JSON.stringify({ error: '暂时无法删除，请检查后重试。'.repeat(60) }), { status: 503, headers: { 'content-type': 'application/json' } }))
      : real(input, init);
  })()`);
  await child.click('[data-confirm-ok]');
  await child.waitFor("!document.querySelector('[data-pages-confirm] .mw-field__error').hidden && !document.querySelector('[data-confirm-ok][data-loading]')");
  await assertFooterVisible(child, '[data-pages-confirm]');
  await capture(browser, 'confirm-short');
  await child.click('[data-pages-confirm] button[value=cancel]');
  await child.waitFor("!document.querySelector('[data-pages-confirm]').open");
});

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
  await assertFooterVisible(child);
  await click("[data-pages-import-submit]");
  await waitFor("document.querySelector('[data-pages-import-status]').textContent.includes('已导入')", 15_000);
  const ids = await evaluate<string[]>("window.__importRequestIds");
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1], "after a 413 the retry is a new submission");
});
