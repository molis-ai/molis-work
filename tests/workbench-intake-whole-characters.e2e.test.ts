// RAC-1872: the same cuts in the shipped workbench. A button in a plugin's frame (the frame bridge, then the intake handler) and a button
// in the page itself (the intake handler alone) carry a title and a text that run across the limits with a two-unit character; what the
// page asks the Host to make is cut by whole characters. The request is kept as it leaves, before the Host answers.
import assert from "node:assert/strict";
import test from "node:test";
import { molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

const GREEN = "\u{1F7E2}";
const TITLE = "题".repeat(199) + GREEN + "尾", TEXT = "字".repeat(3999) + GREEN + "尾";
const lone = (text: string) => /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(text);

test("RAC-1872 a control in a plugin's frame and one in the page ask the Host with a title and text cut by whole characters", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded", undefined, null);
  if (!browser) return;
  const { localHost, projectId, command, sessionId, navigate, evaluate, waitFor, click, surfaceReady, origin } = browser;
  const lingguang = await pluginFrameBrowser(t, browser, "lingguang");
  assert.ok(localHost); assert.ok(projectId);
  await localHost.withProject(molisWorkHostProjectReference({ databasePath: browser.databasePath, projectId }), () => undefined);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-work-surface=lingguang]')");
  await click("[data-plugin-picker-popover] [data-plugin-id=lingguang]");
  await waitFor("document.body.dataset.desktopSurface === 'lingguang'");
  await surfaceReady("lingguang");
  await evaluate(`(() => { const original = window.fetch; window.intakeAsked = [];
    window.fetch = async (url, options) => {
      if (String(url).endsWith('/api/contextual/create')) window.intakeAsked.push(JSON.parse(options.body));
      return original(url, options);
    }; })()`);
  const button = (parent: string, id: string, place: string) => `(() => { const button = document.createElement('button');
    button.type = 'button'; button.textContent = 'put in'; button.dataset.testIntake = ${JSON.stringify(id)};
    button.dataset.contextIntake = 'todo'; button.dataset.contextId = ${JSON.stringify(id)};
    button.dataset.contextTitle = ${JSON.stringify(TITLE)}; button.dataset.contextText = ${JSON.stringify(TEXT)};
    button.style.cssText = 'position:fixed;z-index:2147483647;${place}'; ${parent}.append(button); })()`;
  // In the frame: through the frame bridge, then the intake handler.
  await lingguang.evaluate(button("document.body", "whole-frame", "top:8px;left:8px"));
  await lingguang.click("[data-test-intake=whole-frame]");
  await waitFor("window.intakeAsked.length === 1", 10_000);
  // In the page, on the surface: the intake handler alone.
  await evaluate(button("document.querySelector('[data-work-surface=lingguang]')", "whole-page", "bottom:8px;right:8px"));
  await click("[data-test-intake=whole-page]");
  await waitFor("window.intakeAsked.length === 2", 10_000);
  const asked = JSON.parse(await evaluate<string>("JSON.stringify(window.intakeAsked.map(a => ({ id: a.focus.object.id, intake: a.intake_id, title: a.focus.object.title, text: a.focus.targets[0].text })))")) as
    Array<{ id: string; intake: string; title: string; text: string }>;
  for (const id of ["whole-frame", "whole-page"]) {
    const one = asked.find(item => item.id === id);
    assert.ok(one, `${id}: asked the Host`);
    assert.equal(one.intake, "todo");
    assert.equal(one.title, "题".repeat(199), `${id}: title is 199 whole characters`);
    assert.equal(one.text, "字".repeat(3999), `${id}: text is 3999 whole characters`);
    assert.equal(lone(one.title + one.text), false, `${id}: no half character`);
  }
});
