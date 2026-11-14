import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { homeAgentDefinitions } from "@molis-ai/molis-work-app-local-host";
import { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { requiredHeadlessTestBrowser } from "./fixtures/dedicated-headless-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { newPublisher } from "./fixtures/sandbox-package.js";
import { signedContentPackage } from "./fixtures/content-package.js";
import { attachAutomationWorkspace } from "./fixtures/automation-workspace.js";
import { openTestHome } from "./fixtures/test-home.js";

test("AUT-01/06/07: the same project suggestions open in the chooser, Assistant and the real Studio frame", { timeout: 95_000 }, async t => {
  const fixture = await openTestHome(t);
  const project = await fixture.createProject("Automation browser project", ["pages", "plugin-builder"]);
  const base = "/projects/" + project.project_id;
  const folder = join(fixture.home, "browser-project");
  await mkdir(folder);
  await writeFile(join(folder, "package.json"), '{"devDependencies":{"vitest":"1.0.0"}}');
  await attachAutomationWorkspace(fixture, project, folder);
  const bundle = signedContentPackage(newPublisher(), { skills: [{ id: "review-tests" }] });
  const preview = await fixture.web.post<{ preview_id: string }>(base + "/api/plugin-trust/install/preview", { bundle });
  await fixture.web.post(base + "/api/plugin-trust/install/confirm", { preview_id: preview.preview_id, consent: true, pin_label: "Browser publisher" });
  const profile = join(fixture.home, "test-browser");
  await mkdir(profile);
  const browser = await ChromeHarness.start(profile, { executable: requiredHeadlessTestBrowser() });
  t.after(() => browser.close());
  const page = await browser.page();
  const studio = await pluginFrameBrowser(t, {
    sessionId: page.sessionId, command: browser.command.bind(browser), on: browser.on.bind(browser), evaluate: page.evaluate.bind(page),
  }, "plugin-builder");
  await page.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  const go = async (path: string) => {
    await page.evaluate("globalThis.previousAutomationPage = true");
    await page.command("Page.navigate", { url: fixture.origin + path });
    await page.wait("!globalThis.previousAutomationPage && document.readyState === 'complete'");
  };
  const dialog = "[data-automation-dialog]";
  const suggestion = "[data-automation-suggestion]";
  const loaded = async () => {
    await page.wait("document.querySelector('[data-automation-dialog]')?.open && !!document.querySelector('[data-automation-suggestion]')",
      { describe: "JSON.stringify({path:location.pathname,status:document.querySelector('[data-automation-progress]')?.textContent,error:document.querySelector('[data-automation-error]')?.textContent})" });
    assert.match(await page.evaluate<string>("document.querySelector('[data-automation-suggestion] summary').textContent"), /review-tests/);
  };

  await go("/");
  const open = `[data-automation-open="${project.project_id}"]`;
  await page.wait("!!document.querySelector(" + JSON.stringify(open) + ")");
  assert.equal(await page.evaluate("document.querySelector('[data-automation-dialog]').open"), false);
  await page.click(open);
  await loaded();
  await page.click(suggestion + " summary");
  assert.match(await page.evaluate<string>("document.querySelector('[data-automation-suggestion]').innerText"), /package\.json/);
  assert.equal(homeAgentDefinitions(fixture.home).skills.settings(project.project_id).length, 0);
  await page.click(suggestion + " a");
  await page.wait("!!document.querySelector('[data-kit-skill] fieldset')",
    { describe: "JSON.stringify({href:location.href,body:document.querySelector('[data-kit-body]')?.textContent?.slice(0,500)})" });
  assert.equal(await page.evaluate("document.querySelector('[data-kit-skill] input[value=off]').checked"), true);
  await page.click('[data-kit-skill] input[value=manual]');
  await page.wait("document.querySelector('[data-kit-skill] input[value=manual]').checked && !document.querySelector('[data-kit-skill] fieldset').disabled");
  assert.equal(homeAgentDefinitions(fixture.home).skills.settings(project.project_id)[0]?.state, "manual");
  await page.click("[data-kit-notice] button");
  await page.wait("document.querySelector('[data-kit-skill] input[value=off]').checked");

  await go(base + "/");
  await page.evaluate("document.dispatchEvent(new CustomEvent('molis:assistant-open', { detail: { new: true } }))");
  await page.wait("document.querySelector('[data-assistant-automation]')?.checkVisibility()");
  await page.click("[data-assistant-automation]");
  await loaded();
  await page.click(dialog + " [data-dialog-close]");
  await page.wait("!document.querySelector('[data-automation-dialog]').open");

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
  await page.click("[data-automation-save]");
  await page.wait("document.querySelector('iframe[data-plugin-frame=pages]')?.checkVisibility() || new URL(location.href).searchParams.get('openItem') === " + JSON.stringify(saved.documents[0]!.id));
});
