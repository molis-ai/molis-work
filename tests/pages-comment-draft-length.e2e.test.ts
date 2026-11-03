import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// One 🟢 (U+1F7E2) is one character and two UTF-16 units. pages.comments.append@1 takes a comment of up to 20000 characters (comment-actions.ts,
// comments-store.ts); a maxlength attribute counts units, so the comment box stopped 🟢 at 10000. The box is filled through the browser's own text input
// (Input.insertText), which applies the box's limits. Setting `.value` by script, as tests/pages-assistant-surfaces.e2e.test.ts does, goes around them.
const wide = "🟢";

/** A real Pages document with its comments panel open in the side view, and what a person does in the comment box. */
async function openCommentBox(t: TestContext) {
  const browser = await openGoalBrowser(t, true); if (!browser) return null;
  const { command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
  const pages = await pluginFrameBrowser(t, browser, "pages");
  const comments = await pluginFrameBrowser(t, browser, "pages", '[data-side-body="plugin:pages/comments"] iframe');
  const store = openPagesStore(homeDirectory);
  const page = store.create({ project_id: projectId!, title: "长评论", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "已保存正文" }] }] } }); store.close();
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${page.id}` }, sessionId));
  await pages.waitFor(`document.querySelector('[data-pages-title]')?.value === ${JSON.stringify(page.title)}`);
  await pages.click("[data-pages-comments-open]");
  await comments.waitFor(`document.querySelector('[data-comment-title]')?.textContent === ${JSON.stringify(page.title)}`);
  return {
    /** Click into the box and type: a real click, then the browser's own text input. */
    async type(text: string) {
      await comments.click("[data-comment-draft]");
      await command("Input.insertText", { text }, sessionId);
      // The input handler has run once the Send button follows the draft.
      await comments.waitFor("!document.querySelector('[data-comment-send]').disabled");
    },
    /** What the box holds, counted both ways, and whether it is made only of `unit`. */
    box: (unit = wide) => comments.evaluate<{ units: number; characters: number; only: boolean }>(`(() => {const value=document.querySelector('[data-comment-draft]').value;return {units:value.length,characters:[...value].length,only:[...value].every(character=>character===${JSON.stringify(unit)})};})()`),
    /** The draft the page keeps for a reload, counted both ways; null when there is none. */
    kept: () => comments.evaluate<{ units: number; characters: number } | null>(`(() => {const saved=JSON.parse(localStorage.getItem('molis.pages.comments:${projectId}'));const draft=saved['${page.id}:'+saved.__active['${page.id}']];return draft?{units:draft.body.length,characters:[...draft.body].length}:null;})()`),
    hasMaxlength: () => comments.evaluate<boolean>("document.querySelector('[data-comment-draft]').hasAttribute('maxlength')"),
    /** A new whole-document discussion, with an empty box. */
    fresh: () => comments.click("[data-comment-new]"),
    async send() {
      await comments.click("[data-comment-send]");
      await comments.waitFor("document.querySelectorAll('[data-comment-messages] article').length===1 && document.querySelector('[data-comment-draft]').value===''", 20_000);
      assert.equal(await comments.evaluate("document.querySelector('[data-comment-error]').hidden"), true, "the person is told nothing went wrong");
    },
    /** The comments the document keeps, by length in characters, oldest first: what the store holds, not what the page shows. */
    stored() {
      const checked = openPagesStore(homeDirectory);
      try { return checked.comments.list(page.id, projectId!).flatMap(thread => thread.messages).filter(message => message.author === "user").map(message => [...message.body].length); }
      finally { checked.close(); }
    },
  };
}

test("RAC-1974: a comment of 12000 🟢 (12000 characters, 24000 UTF-16 units) goes into the comment box whole and is kept whole", { timeout: 120_000 }, async t => {
  const box = await openCommentBox(t); if (!box) return;
  await box.type(wide.repeat(12000));
  assert.deepEqual(await box.box(), { units: 24000, characters: 12000, only: true }, "the box holds all 12000 🟢; a maxlength of 20000 stopped it at 10000");
  await box.send();
  assert.deepEqual(box.stored(), [12000], "the document keeps the whole comment");
});

test("RAC-1975 RAC-1976: the comment box stops at 20000 characters, never inside one, and the draft kept for a reload is the same cut text", { timeout: 120_000 }, async t => {
  const box = await openCommentBox(t); if (!box) return;
  await box.type(wide.repeat(20001));
  assert.deepEqual(await box.box(), { units: 40000, characters: 20000, only: true }, "20001 🟢 are cut to 20000 whole ones");
  assert.deepEqual(await box.kept(), { units: 40000, characters: 20000 }, "RAC-1976: the draft kept for a reload is the cut text, not the longer text that was typed");
  await box.send();
  assert.deepEqual(box.stored(), [20000], "the action takes what the box let through");
  await box.fresh();
  await box.type("字".repeat(20001));
  assert.deepEqual(await box.box("字"), { units: 20000, characters: 20000, only: true }, "20001 汉字 are cut to 20000, as before");
  await box.send();
  assert.deepEqual(box.stored(), [20000, 20000], "the second comment is kept whole too");
});

test("RAC-1977: the comment box carries no maxlength attribute, which counts UTF-16 units", { timeout: 120_000 }, async t => {
  const box = await openCommentBox(t); if (!box) return;
  assert.equal(await box.hasMaxlength(), false, "the box is cut by the page's own input handler, in characters");
});
