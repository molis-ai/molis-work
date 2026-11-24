import assert from "node:assert/strict";
import test from "node:test";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { openAutomationBrowser } from "./fixtures/automation-recommendations-browser.js";

test("AUT-07: a Studio suggestion saves one editable Pages document and opens it", { timeout: 95_000 }, async t => {
  const { fixture, browser, page, base, go, navigate, loaded } = await openAutomationBrowser(t);
  const studio = await pluginFrameBrowser(t, {
    sessionId: page.sessionId, command: browser.command.bind(browser), on: browser.on.bind(browser), evaluate: page.evaluate.bind(page),
  }, "plugin-builder");

  await go(base + "/?openPlugin=plugin-builder");
  await studio.waitFor("document.querySelector('[data-automation-open]')?.checkVisibility()");
  await studio.click("[data-automation-open]");
  await loaded();
  assert.equal(await studio.evaluate("document.querySelector('[data-automation-result]')"), null);
  await page.click("[data-automation-save]");
  await page.wait("document.querySelector('[data-automation-progress]')?.textContent.includes('文稿')");
  assert.equal(await page.evaluate("document.querySelector('[data-automation-error]').hidden"), true);
  const saved = await fixture.web.get<{ documents: Array<{ id: string }> }>(base + "/api/plugins/io.molis.work.pages/pages");
  assert.equal(saved.documents.length, 1);
  await navigate(() => page.click("[data-automation-save]"));
  await page.wait("document.querySelector('iframe[data-plugin-frame=pages]')?.checkVisibility() || new URL(location.href).searchParams.get('openItem') === " + JSON.stringify(saved.documents[0]!.id));
});
