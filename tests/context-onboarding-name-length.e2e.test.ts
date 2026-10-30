import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { withContextJourneys } from "../apps/local-host/dist/context-onboarding-store.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// RAC-2251: the onboarding's two project-name fields take 120 characters (码点), not 120 UTF-16 units, so a name made of two-unit
// characters can be written to its stated limit; the 121st character is capped, and neither field keeps the browser's own unit limit.
const wide = "🟢".repeat(120);

test("RAC-2251 the onboarding's two project-name fields take 120 two-unit characters and cap the 121st", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, homeDirectory } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  // A journey that has already reached the review step: its name field is the one the person edits there.
  const id = randomUUID();
  withContextJourneys(homeDirectory, store => {
    const journey = store.create(id);
    journey.phase = "review";
    journey.summary = { title: "草稿", body: "正文", references: [] };
    return store.save(journey);
  });
  await navigate(() => command("Page.navigate", { url: `${origin}/onboarding?mode=new-project&journey=${id}` }, sessionId));
  await waitFor("Boolean(document.getElementById('cx-project-title'))");
  assert.equal(await evaluate("document.getElementById('cx-project-title').getAttribute('maxlength')"), null, "no maxlength: the browser's own limit counts UTF-16 units");
  await evaluate("document.getElementById('cx-project-title').focus()");
  await command("Input.insertText", { text: wide }, sessionId);
  assert.equal(await evaluate("[...document.getElementById('cx-project-title').value].length"), 120, "120 characters are written whole");
  assert.equal(await evaluate("document.getElementById('cx-project-title').value.length"), 240, "120 characters, 240 UTF-16 units");
  await command("Input.insertText", { text: "🟢" }, sessionId);
  assert.equal(await evaluate("[...document.getElementById('cx-project-title').value].length"), 120, "the 121st character is capped");
  assert.equal(await evaluate("document.getElementById('cx-project-title').value.length"), 240, "the cap keeps whole characters");
  // The blank start's field has the same limit.
  await navigate(() => command("Page.navigate", { url: `${origin}/onboarding?mode=new-project` }, sessionId));
  await waitFor("Boolean(document.querySelector('[data-action=blank]'))");
  await click("[data-action=blank]");
  await waitFor("Boolean(document.getElementById('cx-blank-name'))");
  assert.equal(await evaluate("document.getElementById('cx-blank-name').getAttribute('maxlength')"), null, "no maxlength here either");
  await evaluate("document.getElementById('cx-blank-name').focus()");
  await command("Input.insertText", { text: wide }, sessionId);
  assert.equal(await evaluate("[...document.getElementById('cx-blank-name').value].length"), 120, "120 characters are written whole");
  assert.equal(await evaluate("document.getElementById('cx-blank-name').value.length"), 240);
  await command("Input.insertText", { text: "🟢" }, sessionId);
  assert.equal(await evaluate("[...document.getElementById('cx-blank-name').value].length"), 120, "the 121st character is capped");
  assert.equal(await evaluate("document.getElementById('cx-blank-name').value.length"), 240);
});
