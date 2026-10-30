import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { openPptStore } from "./fixtures/plugin-home-stores.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// The outline action takes 20000 characters (actions.ts outlineInput.text.maxLength): one 🙂 (U+1F642) is one character and two UTF-16
// units. A maxlength attribute counts units, so the box stopped at half of it; the box is filled through the browser's own text input
// (Input.insertText), which applies the box's limits. Setting `.value` by script, as tests/ppt-actions.e2e.test.ts does, goes around them.
const wide = "🙂";
const LIMIT = 20_000;

/** A real PPT page with its outline dialog open, and what typing into the outline box does. */
async function openOutline(t: TestContext) {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return null;
  const { command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
  const { evaluate, waitFor, click } = await pluginFrameBrowser(t, browser, "ppt");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=ppt` }, sessionId));
  await browser.waitFor("document.querySelector('[data-plugin-id=ppt]')");
  if (await browser.evaluate("document.body.dataset.desktopSurface") !== "ppt") await browser.click("[data-plugin-strip] [data-plugin-id=ppt]");
  await browser.waitFor("document.body.dataset.desktopSurface === 'ppt'");
  await click("[data-ppt-new]");
  await waitFor("document.querySelector('[data-ppt=workbench]').getAttribute('aria-busy') === 'false'");
  const slides = () => { const store = openPptStore(homeDirectory); try { return store.list(projectId!)[0]?.slides.length ?? 0; } finally { store.close(); } };
  return {
    click,
    waitFor,
    evaluate,
    slides,
    async openDialog() {
      await click("[data-ppt-outline-open]");
      await waitFor("document.querySelector('[data-ppt-outline-dialog]').open");
    },
    /** Click into the box and type: a real click, then the browser's own text input. */
    async type(text: string) {
      await click("[data-ppt-outline-text]");
      await command("Input.insertText", { text }, sessionId);
    },
    box: () => evaluate<{ units: number; characters: number; only: boolean }>(`(() => {const value = document.querySelector('[data-ppt-outline-text]').value;return {units: value.length, characters: [...value].length, only: [...value].every(character => character === ${JSON.stringify(wide)})};})()`),
    note: () => evaluate<string>("document.querySelector('[data-ppt-outline-error]')?.textContent ?? ''"),
    noteHidden: () => evaluate<boolean>("document.querySelector('[data-ppt-outline-error]').hidden"),
  };
}

test("RAC-2220: the outline box takes 20000 two-unit characters, the same count the action takes", { timeout: 60_000 }, async t => {
  const open = await openOutline(t); if (!open) return;
  await open.openDialog();
  await open.type(wide.repeat(LIMIT));
  await open.waitFor(`document.querySelector('[data-ppt-outline-text]').value.length === ${2 * LIMIT}`);
  assert.deepEqual(await open.box(), { units: 2 * LIMIT, characters: LIMIT, only: true }, "20000 whole characters (40000 units) fit in the box");
  assert.equal(await open.noteHidden(), true, "the box was not capped, so nothing says it was");
  await open.click("[data-ppt-outline-submit]");
  await open.waitFor("!document.querySelector('[data-ppt-outline-dialog]').open", 20_000);
  assert.ok(open.slides() >= 1, "the action took the outline and made slides, so the page and the action take the same count");
});

test("RAC-2221: typing past 20000 characters stops at 20000 whole characters and says the limit the action uses", { timeout: 60_000 }, async t => {
  const open = await openOutline(t); if (!open) return;
  await open.openDialog();
  await open.type(wide.repeat(LIMIT + 1000));
  await open.waitFor(`[...document.querySelector('[data-ppt-outline-text]').value].length === ${LIMIT}`);
  assert.deepEqual(await open.box(), { units: 2 * LIMIT, characters: LIMIT, only: true }, "the box stops at 20000 whole characters, never half of one");
  assert.match(await open.note(), /20000/, "the note says the same limit the action uses");
  assert.equal(await open.noteHidden(), false, "and it is shown");
});
