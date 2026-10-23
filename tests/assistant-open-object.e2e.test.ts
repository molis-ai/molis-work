import assert from "node:assert/strict";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import test, { type TestContext } from "node:test";
import { openWork, seedWork, sendBrowser } from "./fixtures/assistant-send-journey.js";

// specs/visual-ui-experience VUX-12 「来源、产出……进入已有对象/预览……保留返回会话路径与状态；……失效、读取失败反馈准确可恢复」:
// a result the Assistant made opens in the side panel's preview beside the conversation. When its owner no longer has it,
// the preview says so under the name the person knows, and what could not be read does not become what the person is
// looking at: the next Send does not offer it as 正在看. Before, the preview named it by its id and the bar offered
// 「正在看：doc-gone」. A real work on a real Host; the made object, which only a plugin's action records, is added to the
// view the page reads, in the contract's shape, pointing at a Pages document that does not exist.
const at = "2026-10-19T08:00:00.000Z";

/** A real work whose 产出 holds a result pointing at a Pages document that does not exist, open in the project workbench. */
async function goneResult(t: TestContext) {
  const browser = await sendBrowser(t); if (!browser) return null;
  const pages = await pluginFrameBrowser(t, browser, "pages");
  const { evaluate, waitFor, navigate, command, sessionId, origin, projectId } = browser;
  const id = await seedWork(browser, "把周报定稿");
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}` }, sessionId));
  await waitFor("!!document.querySelector('[data-assistant-island]') && !!document.querySelector('.workbench-bar')", 20_000);
  const made = [{ relation: "result", subject: { kind: "pages_document", id: "doc-gone" }, title: "已删掉的周报", recorded_revision: "3", current_revision: "3",
    state: "current", recorded_at: at, open: { surface: "pages", id: "doc-gone" } }];
  await evaluate(`(() => { const fetch0 = window.fetch; window.fetch = async (input, init) => {
    const response = await fetch0(input, init), path = new URL(typeof input === "string" ? input : input.url, location.href).pathname;
    if (!/\\/api\\/assistant\\/works\\/${id}$/.test(path) || (init && init.method && init.method !== "GET")) return response;
    const view = await response.json();
    Object.assign(view, { objects: [...(view.objects || []), ...${JSON.stringify(made)}] });
    return new Response(JSON.stringify(view), { status: response.status, headers: response.headers });
  }; })()`);
  await openWork(browser, id);
  const results = `document.querySelector('[data-assistant-block="results"]')`;
  const opener = `${results}.querySelector('button[aria-label="打开：已删掉的周报"]')`;
  await waitFor(`!!${opener}`, 15_000);
  return { ...browser, id, opener, pages };
}

test("VUX-12: a result whose object is gone opens to say so by its name, keeps the conversation, and is not taken as what the person looks at", { timeout: 120_000 }, async t => {
  const browser = await goneResult(t); if (!browser) return;
  const { evaluate, waitFor, id, opener } = browser;
  await evaluate(`${opener}.click()`);

  // The preview says what happened, under the result's own name.
  const preview = `document.querySelector('[data-side-files-body]')`;
  await waitFor(`!!${preview}?.querySelector('.side-files-problem')`, 15_000);
  assert.deepEqual(await evaluate(`[document.querySelector('[data-side-files-title]').textContent, ${preview}.querySelector('.side-files-problem').textContent]`),
    ["已删掉的周报", "文档不存在或已删除"]);

  // What could not be read is not in hand: nothing on the right declares it, and the next Send does not offer it.
  assert.equal(await evaluate(`${preview}.hasAttribute('data-assistant-context')`), false);
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-assistant-island] .assistant-strip-label, [data-assistant-block="materials"] .assistant-item-title')]
    .filter((node) => node.checkVisibility()).map((node) => node.textContent).filter((text) => /正在看|doc-gone/.test(text))`), [], "before: 「正在看：doc-gone」 in the bar and under 待发送");

  // The conversation it was opened from stays where it was: the same work, its panel open, its result still there to open again.
  assert.deepEqual(await evaluate(`[localStorage.getItem('molis.assistant.current'), !document.querySelector('[data-assistant-panel]').hidden, !!${opener}]`), [id, true, true]);
});

// The preview's 在插件中打开 takes the same result to its owner. Pages wrote why it could not open it in the editor's own
// corner, which is not drawn while no document is open, so the person saw the empty list (还没有文档) under a tab named
// for the document. Now the document's place says so, offers no editing, and its way back leads to the list.
test("VUX-12: opened in its plugin, a result whose object is gone says so in the document's place and leads back to the list, the conversation unchanged", { timeout: 120_000 }, async t => {
  const browser = await goneResult(t); if (!browser) return;
  const { evaluate, waitFor, click, id, opener, pages } = browser;
  await evaluate(`${opener}.click()`);
  await waitFor("!!document.querySelector('[data-side-files-body] .side-files-problem')", 15_000);
  await click('[data-side-files-action="open"]');
  const stage = `document.querySelector('[data-work-surface="pages"] [data-pages-stage-workspace]')`;
  await pages.waitFor(`${stage}?.checkVisibility() && ${stage}.querySelector('.pages-note')?.checkVisibility()`, 15_000);
  assert.deepEqual(await pages.evaluate(`(() => { const shown = (selector) => [...${stage}.querySelectorAll(selector)].some((node) => node.checkVisibility());
    return { note: ${stage}.querySelector('.pages-note').textContent, editor: shown('[data-pages-pane="editor"]'), tools: shown('.pages-editor-tools button'), back: shown('[data-pages-back]') }; })()`),
    { note: "找不到这篇文档", editor: false, tools: false, back: true }, "before: the note was not drawn and the list said 还没有文档");
  await pages.click(`[data-work-surface="pages"] [data-pages-back]`);
  await pages.waitFor(`!${stage}.checkVisibility() && document.querySelector('[data-work-surface="pages"] [data-pages="directory"]').checkVisibility()`, 10_000);
  assert.equal(await pages.evaluate<boolean>(`${stage}.hasAttribute('data-missing')`), false, "the list leaves nothing of the missing document behind");
  assert.deepEqual(await evaluate(`[localStorage.getItem('molis.assistant.current'), !!${opener}]`), [id, true], "the conversation it came from is as it was");
});
