import assert from "node:assert/strict";
import test from "node:test";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// T-229 (MISC, T-190's review): a list row's preview cut by UTF-16 units leaves half of a two-unit character at the cut. The notes list
// cuts by characters, both in what jelly.note.list answers and in the row the page draws itself right after a save.

test("RAC-2190 a note row's preview is at most 200 characters and never ends on half a character", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, reloadPage } = browser;
  const jelly = await pluginFrameBrowser(t, browser, "jelly");
  const open = async () => {
    await browser.waitFor("document.querySelector('[data-plugin-id=jelly]')");
    if (await browser.evaluate("document.body.dataset.desktopSurface") !== "jelly") await browser.click("[data-plugin-strip] [data-plugin-id=jelly]");
    await jelly.waitFor("!!document.querySelector('[data-jelly-page] [data-jelly-tab]')");
    await jelly.click('[data-jelly-tab="notes"]');
  };
  await browser.setViewport(1440, 950);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=jelly` }, sessionId));
  await open();
  // 199 "a" then 😀 (two units, U+1F600): unit 200 is the emoji's high surrogate, so a cut by units ends on half of it.
  await jelly.click('[data-jelly-act="new-note"]');
  await jelly.waitFor("!!document.querySelector('[data-jelly-notes-editor] [data-jelly-note-body]')");
  await jelly.evaluate(`(() => { const box = document.querySelector('[data-jelly-notes-editor] [data-jelly-note-body]'); box.value = ${JSON.stringify("a".repeat(199) + "😀" + "尾")};
    box.dispatchEvent(new InputEvent('input', { bubbles: true })); box.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); })()`);
  const preview = "document.querySelector('[data-jelly-note] span.jelly-cut')?.textContent ?? ''";
  for (const where of ["drawn after the save", "read back after a reload"]) {
    if (where !== "drawn after the save") { await reloadPage(); await open(); }
    await jelly.waitFor(`${preview}.length > 0`, 10_000);
    const text = await jelly.evaluate<string>(preview);
    assert.equal(text.endsWith("\ud83d"), false, `${where}: the preview ends on a whole character, not half of an emoji`);
    assert.deepEqual([[...text].length, [...text].at(-1)], [200, "😀"], `${where}: 200 characters, the emoji whole and the rest cut`);
  }
});
