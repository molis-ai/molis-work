import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { openFormStore } from "./fixtures/plugin-home-stores.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// Form answers are at most FORM_ANSWER_LIMIT characters (actions.ts schema, store.ts): one 🙂 (U+1F642) is one character and two UTF-16
// units. A maxlength attribute counts units, so the box stopped at half the limit; the box is filled through the browser's own text input
// (Input.insertText), which applies the box's limits. Setting `.value` by script, as tests/form-actions.e2e.test.ts does, goes around them.
const wide = "🙂";
const LIMIT = 4000;

/** A real Form page on its preview tab, the one text question's box, and what typing into it does. */
async function openPreview(t: TestContext) {
  const browser = await openGoalBrowser(t, true); if (!browser) return null;
  const { command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
  const form = await pluginFrameBrowser(t, browser, "form");
  const store = openFormStore(homeDirectory);
  const created = store.create({ project_id: projectId!, title: "回答长度" });
  const record = store.update(created.id, { questions: [{ id: "q1", type: "text", title: "备注", required: false }] }, projectId!);
  store.close();
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=form` }, sessionId));
  await browser.waitFor("document.querySelector('[data-plugin-id=form]')");
  if (await browser.evaluate("document.body.dataset.desktopSurface") !== "form") await browser.click("[data-plugin-strip] [data-plugin-id=form]");
  await browser.waitFor("document.body.dataset.desktopSurface === 'form'");
  await form.waitFor(`document.querySelector('[data-form-id="${record.id}"]')`);
  await form.click(`[data-form-id="${record.id}"]`);
  await form.waitFor("document.querySelector('[data-form=workbench]').getAttribute('aria-busy') === 'false'");
  await form.click("[data-form-tab=preview]");
  await form.waitFor("!document.querySelector('[data-form-pane=preview]').hidden");
  const box = () => form.evaluate<{ units: number; characters: number; only: boolean }>(`(() => {const value = document.querySelector('[data-form-pane=preview] input[type=text]').value;return {units: value.length, characters: [...value].length, only: [...value].every(character => character === ${JSON.stringify(wide)})};})()`);
  return {
    form,
    /** Click into the box and type: a real click, then the browser's own text input. */
    async type(text: string) {
      await form.click("[data-form-pane=preview] input[type=text]");
      await command("Input.insertText", { text }, sessionId);
    },
    box,
    /** What the preview's note line says, if anything. */
    note: () => form.evaluate<string>("document.querySelector('[data-form-note]')?.textContent ?? ''"),
    /** The answers the store kept for this form, counted in characters. */
    stored() {
      const checked = openFormStore(homeDirectory);
      try { return checked.listSubmissions(record.id, projectId!).map(submission => [...String((submission.answers || {})["q1"] ?? "")].length); }
      finally { checked.close(); }
    },
  };
}

test("RAC-2215: a text answer takes 4000 two-unit characters in the preview, the same count the store takes", { timeout: 60_000 }, async t => {
  const open = await openPreview(t); if (!open) return;
  await open.type(wide.repeat(LIMIT));
  await open.form.waitFor(`document.querySelector('[data-form-pane=preview] input[type=text]').value.length === ${2 * LIMIT}`);
  assert.deepEqual(await open.box(), { units: 2 * LIMIT, characters: LIMIT, only: true }, "4000 whole characters (8000 units) fit in the box");
  assert.equal(await open.note(), "", "the box was not capped, so nothing says it was");
  await open.form.click("[data-form-submit]");
  await open.form.waitFor("document.querySelector('[data-form-pane=results]') && !document.querySelector('[data-form-pane=results]').hidden", 20_000);
  assert.deepEqual(open.stored(), [LIMIT], "the store saved all 4000 characters, so the page and the store take the same count");
});

test("RAC-2216: typing past 4000 characters stops at 4000 whole characters and says the limit the library uses", { timeout: 60_000 }, async t => {
  const open = await openPreview(t); if (!open) return;
  await open.type(wide.repeat(LIMIT + 1000));
  await open.form.waitFor(`[...document.querySelector('[data-form-pane=preview] input[type=text]').value].length === ${LIMIT}`);
  assert.deepEqual(await open.box(), { units: 2 * LIMIT, characters: LIMIT, only: true }, "the box stops at 4000 whole characters, never half of one");
  assert.match(await open.note(), /4000/, "the note says the same limit the library uses");
  assert.match(await open.note(), /备注/, "and names the question it is about");
  assert.deepEqual(open.stored(), [], "nothing was submitted, so the store has no answer");
});
