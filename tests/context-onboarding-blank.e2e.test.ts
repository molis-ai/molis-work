import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// A person types the new project's name and clicks "创建项目" with the mouse. Leaving the field fires `change`
// before the click submits; that must not save the source selection and re-render the form empty.
test("Onboarding blank start: a typed name survives the mouse click on 创建项目 and the project opens", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/onboarding?mode=new-project` }, sessionId));
  await waitFor("Boolean(document.querySelector('[data-action=blank]'))");
  await click("[data-action=blank]");
  await waitFor("Boolean(document.getElementById('cx-blank-name'))");

  await evaluate("document.getElementById('cx-blank-name').focus()");
  await command("Input.insertText", { text: "秋季内容计划" }, sessionId);
  assert.equal(await evaluate("document.querySelector('.ob-project-name')?.textContent"), "秋季内容计划", "the preview card names the project as it is typed");

  await navigate(() => click("button[form=cx-blank-form]"));
  await waitFor("location.pathname.startsWith('/projects/')");
  assert.match(String(await evaluate("document.title")), /秋季内容计划/);
});

test("Onboarding blank start: a refused name stays in the field with the reason beside it", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/onboarding?mode=new-project` }, sessionId));
  await waitFor("Boolean(document.querySelector('[data-action=blank]'))");
  await click("[data-action=blank]");
  await waitFor("Boolean(document.getElementById('cx-blank-name'))");

  // Only spaces: the browser's own check passes, the Host refuses after trimming.
  await evaluate("document.getElementById('cx-blank-name').focus()");
  await command("Input.insertText", { text: "   " }, sessionId);
  await click("button[form=cx-blank-form]");
  await waitFor("document.querySelector('#cx-blank-form .cx-error')?.textContent.includes('项目名称')");
  assert.equal(await evaluate("document.getElementById('cx-blank-name').value"), "   ", "what was typed is still there to correct");
  assert.equal(await evaluate("location.pathname"), "/onboarding");
});
