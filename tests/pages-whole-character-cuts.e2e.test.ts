import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// T-249 (RAC-2265..2269): five places in Pages' browser client cut text by UTF-16 units; a cut that lands inside a two-unit character (an emoji,
// one character, two units) left half of it behind — mojibake where a person sees it, or a rejected payload downstream. Each place now cuts by
// whole characters, or by units without the half at the end, as the receiver counts.
// One 🟢 (U+1F7E2) is one character and two UTF-16 units.
const wide = "🟢";
const paragraph = (text: string, attrs: Record<string, unknown> = {}) => ({ type: "paragraph", attrs, content: [{ type: "text", text }] });
const docOf = (...content: object[]) => ({ type: "doc", content });

/** Whether the last unit is half of a character (a high surrogate with no low one after it). */
const halfAtEnd = (text: string) => { const last = text.charCodeAt(text.length - 1); return last >= 0xd800 && last <= 0xdbff; };

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
type Child = Awaited<ReturnType<typeof pluginFrameBrowser>>;

/** Pages open in a project, ready for its import dialog. */
async function openPages(t: TestContext, browser: Browser): Promise<Child> {
  const pages = await pluginFrameBrowser(t, browser, "pages");
  const { command, sessionId, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
  await browser.waitFor("document.querySelector('[data-plugin-id=pages]')");
  if (await browser.evaluate("document.body.dataset.desktopSurface") !== "pages") await browser.click('[data-plugin-strip] [data-plugin-id=pages]');
  await pages.waitFor("Boolean(document.querySelector('[data-pages=workbench]'))");
  return pages;
}

test("RAC-2265: an import preview cuts by whole characters, so a two-unit character at the cut is not left half", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const pages = await openPages(t, browser);
  await pages.waitFor("Boolean(document.querySelector('[data-pages-import]'))");
  await pages.click("[data-pages-import]");
  await pages.waitFor("document.querySelector('[data-pages-import-dialog]')?.open === true");
  // 3,999 single-unit characters then one 🟢: the old unit cut (4,000) ended on the first half of it.
  const text = "字".repeat(3999) + wide + "尾".repeat(50);
  await pages.evaluate(`(() => { const input = document.querySelector('[data-pages-import-files]'); const transfer = new DataTransfer();
    transfer.items.add(new File([${JSON.stringify(text)}], "长文.md", { type: "text/markdown" })); input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  await pages.waitFor("!document.querySelector('[data-pages-import-preview]').hidden && !document.querySelector('[data-pages-import-submit]').disabled", 20_000);
  const preview = await pages.evaluate<string>("document.querySelector('.pages-import-body')?.textContent || ''");
  assert.ok(preview.length > 4000, `the preview shows the cut text and the ellipsis: ${preview.length} units`);
  const shown = preview.replace(/…$/u, "");
  assert.equal(halfAtEnd(shown), false, "the preview does not end in half a character");
  assert.equal(shown.endsWith(wide), true, "the two-unit character at the cut is whole");
  assert.ok([...shown].length <= 4000, `${[...shown].length} characters shown, at most 4,000`);
  assert.equal(preview.endsWith("…"), true, "more text follows, so the preview says so");
  // RAC-2265, the other half: the ellipsis is decided by characters, not units. 2,500 🟢 are 5,000 UTF-16 units but 2,500 characters, under
  // the 4,000-character limit, so the preview is the whole text and there is no ellipsis; the old unit cut showed 1,000 of them and "…".
  const emojiText = wide.repeat(2500);
  await pages.evaluate(`(() => { const input = document.querySelector('[data-pages-import-files]'); const transfer = new DataTransfer();
    transfer.items.add(new File([${JSON.stringify(emojiText)}], "表情.md", { type: "text/markdown" })); input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  await pages.waitFor("document.querySelector('.pages-import-body')?.textContent.length > 4000", 20_000);
  const fullPreview = await pages.evaluate<string>("document.querySelector('.pages-import-body')?.textContent || ''");
  assert.equal(fullPreview, emojiText, "2,500 two-unit characters are under the 4,000-character limit, so the preview is the whole text");
  assert.equal(fullPreview.endsWith("…"), false, "nothing follows, so the preview does not claim more");
  assert.equal([...fullPreview].length, 2500, "2,500 characters in the preview");
});

/** A Pages document whose body is `body`, open in the project; the comments side view is opened with `openPanel` or by a comment itself. */
async function openComments(t: TestContext, browser: Browser, pages: Child, title: string, body: object, openPanel = true) {
  const { command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
  const store = openPagesStore(homeDirectory);
  const page = store.create({ project_id: projectId!, title, body }); store.close();
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${page.id}` }, sessionId));
  await pages.waitFor(`document.querySelector('[data-pages-title]')?.value === ${JSON.stringify(title)}`);
  if (!openPanel) return { comments: null, pageId: page.id };
  const comments = await pluginFrameBrowser(t, browser, "pages", '[data-side-body="plugin:pages/comments"] iframe');
  await pages.click("[data-pages-comments-open]");
  await comments.waitFor(`document.querySelector('[data-comment-title]')?.textContent === ${JSON.stringify(title)}`);
  return { comments, pageId: page.id };
}

test("RAC-2266: a comment list tag cuts by whole characters, so the 36th two-unit character is not left half", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const pages = await openPages(t, browser);
  const { comments } = await openComments(t, browser, pages, "评论标签", docOf(paragraph("已保存正文")));
  await comments.click("[data-comment-draft]");
  await browser.command("Input.insertText", { text: "字".repeat(35) + wide + "尾巴" }, browser.sessionId);
  await comments.waitFor("!document.querySelector('[data-comment-send]').disabled");
  await comments.click("[data-comment-send]");
  await comments.waitFor("document.querySelectorAll('[data-comment-threads] button').length === 1", 20_000);
  const tag = await comments.evaluate<string>("document.querySelector('[data-comment-threads] button')?.textContent || ''");
  assert.equal(halfAtEnd(tag), false, "the tag does not end in half a character");
  assert.equal(tag.endsWith(wide), true, "the 36th character, the two-unit one, is whole");
  assert.equal([...tag].length, 36, `${[...tag].length} characters in the tag`);
});

test("RAC-2267: the quote sent to the comments side cuts by whole characters at the store's 2,000", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const pages = await openPages(t, browser);
  // A comment mark over 1,999 single-unit characters then one 🟢: the quote's old unit cut ended on the first half of it.
  const text = "字".repeat(1999) + wide + "尾".repeat(40);
  const body = docOf({ type: "paragraph", content: [{ type: "text", text, marks: [{ type: "comment", attrs: { id: "mark-1", text: "已有评论" } }] }] });
  await openComments(t, browser, pages, "引文", body, false);
  // Focus the editor, take the whole marked text with the keyboard, then run the bar's own comment tool: the side receives that text as the quote.
  await pages.waitFor("Boolean(document.querySelector('mark[data-pages-comment]'))", 15_000);
  await pages.waitFor(`document.querySelector('[data-pages-title]')?.value === "引文"`);
  await pages.evaluate("window.__tools = null; document.addEventListener('molis:context-tools', event => { window.__tools = event.detail; }); document.querySelector('.ProseMirror')?.focus();");
  await pages.click(".ProseMirror");
  // The editor's "Mod-a" is Command on macOS and Ctrl elsewhere (prosemirror-keymap follows the platform); Linux has no Meta+A in the editor.
  for (const type of ["keyDown", "keyUp"]) await browser.command("Input.dispatchKeyEvent", { type, key: "a", code: "KeyA", modifiers: process.platform === "darwin" ? 4 : 2 }, browser.sessionId);
  await pages.waitFor("Boolean(window.__tools?.context_id)", 15_000);
  await pages.evaluate(`document.querySelector('[data-pages=workbench]').dispatchEvent(new CustomEvent('molis:context-tool-invoke', { bubbles: true,
    detail: { context_id: window.__tools.context_id, id: 'comment' } }))`);
  const comments = await pluginFrameBrowser(t, browser, "pages", '[data-side-body="plugin:pages/comments"] iframe');
  await comments.waitFor("document.querySelector('[data-comment-quote]')?.hidden === false && document.querySelector('[data-comment-quote]').textContent.length > 100", 20_000);
  const quote = await comments.evaluate<string>("document.querySelector('[data-comment-quote]').textContent");
  assert.equal(halfAtEnd(quote), false, "the quote does not end in half a character");
  assert.equal(quote.endsWith(wide), true, JSON.stringify({ units: quote.length, characters: [...quote].length, head: quote.slice(0, 8), tail: quote.slice(-8), codes: [...Array(4).keys()].map(at => quote.charCodeAt(quote.length - 1 - at)) }));
  assert.equal([...quote].length, 2000, `${[...quote].length} characters in the quote, the store keeps 2,000`);
});

test("RAC-2268/RAC-2269: the draft handed to the Assistant and a block note's summary do not end in half a character", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, navigate, origin } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/` }, sessionId));
  await browser.waitFor("document.readyState === 'complete'");
  await browser.evaluate(`Promise.all([new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/assets/molis-work-pages-editor.js';script.onload=resolve;script.onerror=reject;document.head.append(script)})]).then(()=>undefined)`);
  // 99,999 characters then one 🟢: 100,001 UTF-16 units, over the Assistant's stricter 100,000-unit bound; a unit cut ends on its first half.
  const draftText = "字".repeat(99999) + wide;
  const noteText = "字".repeat(99) + wide + "尾巴";
  await browser.evaluate(`(() => {
    const root = document.createElement('div'); root.id='cuts-fixture'; root.className='pages-editor-host'; root.style.cssText='width:640px;max-width:90vw;margin:48px auto';
    document.body.replaceChildren(root);
    window.__answers = [];
    window.__listen = null;
    window.__editor = window.MolisWorkPagesEditor.mount(root, { doc: ${JSON.stringify(docOf(paragraph(draftText), paragraph(noteText, { note: "有备注" })))} });
    window.__bind = window.MolisWorkPagesEditor.bindComments({ messages: { listen(handler){ window.__listen = handler; }, send(answer){ window.__answers.push(answer); } },
      selected: { id: 'page-1', version: 1 }, editor: { view: window.__editor.view }, unshowable: false, dirty: false,
      workbench: root, persistCurrent: async () => {}, showNote: () => {}, translate: value => value, projectId: 'p1', pluginRoute: path => path }); })()`);
  const commandFor = (kind: string, requestId: string) => `window.__listen({ type: 'molis:side-context-command', context: { plugin_id: 'io.molis.work.pages', object_ref: { id: 'page-1' } }, request_id: ${JSON.stringify(requestId)}, command: { kind: ${JSON.stringify(kind)}, request_id: ${JSON.stringify(requestId)} } })`;
  await browser.evaluate(commandFor("draft", "r-draft"));
  await browser.waitFor("window.__answers.length === 1", 10_000);
  const draft = await browser.evaluate<{ text: string }>("window.__answers[0]");
  assert.equal(halfAtEnd(draft.text), false, "RAC-2268: the draft handed to the Assistant does not end in half a character");
  assert.equal(draft.text.length, 99999, "RAC-2268: the 99,999 single-unit characters are kept and only the cut half is dropped, not a unit more");
  assert.ok(draft.text.length <= 100000, `RAC-2268: ${draft.text.length} UTF-16 units, at most the 100,000 the Assistant's context check accepts`);
  await browser.evaluate(commandFor("notes", "r-notes"));
  await browser.waitFor("window.__answers.length === 2", 10_000);
  const notes = await browser.evaluate<{ notes: Array<{ text: string }> }>("window.__answers[1]");
  const summary = notes.notes[0]?.text || "";
  assert.equal(halfAtEnd(summary), false, "RAC-2269: a block note's summary does not end in half a character");
  assert.equal(summary.endsWith(wide), true, "RAC-2269: the 100th character, the two-unit one, is whole");
  assert.equal([...summary].length, 100, `${[...summary].length} characters in the summary`);
});
