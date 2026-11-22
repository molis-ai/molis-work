import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { homeAgentDefinitions } from "@molis-ai/molis-work-app-local-host";
import { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { requiredHeadlessTestBrowser } from "./fixtures/dedicated-headless-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { newPublisher } from "./fixtures/sandbox-package.js";
import { signedContentPackage } from "./fixtures/content-package.js";
import { attachAutomationWorkspace } from "./fixtures/automation-workspace.js";
import { issueModel } from "./fixtures/issue-model.js";
import { openTestHome } from "./fixtures/test-home.js";
import { OPEN_DETAILS } from "./fixtures/assistant-current-work.js";

// AUT-06, AUT-07 and AUT-08 are the three cases this e2e proves; AUT-01 is the scan citation.
test("AUT-01/06/07/08: suggestions open on all three surfaces and the suggested Skill applies until it is turned off", { timeout: 95_000 }, async t => {
  const fixture = await openTestHome(t);
  const project = await fixture.createProject("Automation browser project", ["pages"]);
  const { withCatalog } = fixture.host.ensureWebCatalog(fixture.home, openMolisWorkProjectCatalog);
  const model = await issueModel(t, fixture.home, { replyText: "已检查这轮要求。" }, withCatalog);
  const base = "/projects/" + project.project_id;
  const folder = join(fixture.home, "browser-project");
  await mkdir(folder);
  await writeFile(join(folder, "package.json"), '{"devDependencies":{"vitest":"1.0.0"}}');
  await attachAutomationWorkspace(fixture, project, folder);
  const skillBody = "先记录第一项失败测试的文件和断言，再提出修改。";
  const bundle = signedContentPackage(newPublisher(), { skills: [{ id: "review-tests", body: skillBody + "\n" }] });
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
  await page.command("Page.enable");
  const { frameTree: { frame: { id: mainFrame } } } = await page.command<{ frameTree: { frame: { id: string } } }>("Page.getFrameTree");
  // QEA-202: an in-document wait belongs to one execution context. Start it only after the new top-level document commits.
  const navigate = async (start: () => Promise<unknown>) => {
    await Promise.all([
      browser.event("Page.frameNavigated", params => (params.frame as { id: string }).id === mainFrame, 14_000),
      start(),
    ]);
    await page.wait("document.readyState === 'complete'");
  };
  const go = (path: string) => navigate(() => page.command("Page.navigate", { url: fixture.origin + path }));
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
  const kitPath = await page.evaluate<string>(`(() => {
    const url = new URL(document.querySelector(${JSON.stringify(suggestion + " a")}).href);
    return url.pathname + url.search;
  })()`);
  await navigate(() => page.click(suggestion + " a"));
  await page.wait("!!document.querySelector('[data-kit-skill] fieldset')",
    { describe: "JSON.stringify({href:location.href,body:document.querySelector('[data-kit-body]')?.textContent?.slice(0,500)})" });
  assert.equal(await page.evaluate("document.querySelector('[data-kit-skill] input[value=off]').checked"), true);
  await page.click('[data-kit-skill] input[value=manual]');
  await page.wait("document.querySelector('[data-kit-skill] input[value=manual]').checked && !document.querySelector('[data-kit-skill] fieldset').disabled");
  const { skills } = homeAgentDefinitions(fixture.home);
  assert.equal(skills.settings(project.project_id)[0]?.state, "manual");
  await page.click("[data-kit-notice] button");
  await page.wait("document.querySelector('[data-kit-skill] input[value=off]').checked");
  await page.click('[data-kit-skill] input[value=manual]');
  await page.wait("document.querySelector('[data-kit-skill] input[value=manual]').checked && !document.querySelector('[data-kit-skill] fieldset').disabled");
  const [setting] = skills.settings(project.project_id);
  assert.ok(setting);
  assert.equal(setting.state, "manual");
  const input = "[data-assistant-composer] .mw-composer__input";
  const visibleCommands = "[data-assistant-composer] [data-compose-menu]:not([hidden]) [data-composer-command]";
  const openAssistant = async () => {
    await go(base + "/");
    await page.evaluate("document.dispatchEvent(new CustomEvent('molis:assistant-open', { detail: { new: true } }))");
    await page.wait(`document.querySelector(${JSON.stringify(input)})?.checkVisibility()`);
  };
  const send = async (text: string) => {
    await page.fill(input, text);
    await page.click("[data-assistant-composer] [data-composer-send]");
    await page.wait("document.querySelector('[data-assistant-thread]')?.textContent.includes('已检查这轮要求。')");
  };

  await openAssistant();
  await page.click(input);
  await page.command("Input.insertText", { text: "/" });
  await page.wait(`[...document.querySelectorAll(${JSON.stringify(visibleCommands)})].some(row => row.textContent.includes('review-tests'))`);
  await page.command("Input.insertText", { text: "review-tests" });
  await page.wait(`document.querySelectorAll(${JSON.stringify(visibleCommands)}).length === 1 && document.querySelector(${JSON.stringify(visibleCommands)}).textContent.includes('review-tests')`);
  await page.click(visibleCommands);
  await send("检查这次测试失败");
  assert.ok(JSON.stringify(model.requests.at(-1) ?? null).includes(skillBody), "The exact signed Skill body reached the model");
  const uses = () => skills.uses(setting.install_id, setting.skill_id);
  const records = uses();
  assert.deepEqual(records.map(use => [use.caller, use.scope_ref, use.ref.skill_id]), [["assistant", project.project_id, "review-tests"]]);

  await go(kitPath);
  await page.wait("document.querySelector('[data-kit-skill] input[value=manual]')?.checked", {
    describe: "JSON.stringify({href:location.href, notice:document.querySelector('[data-kit-notice]')?.textContent, body:document.querySelector('[data-kit-body]')?.textContent?.slice(0,500)})",
  });
  await page.click('[data-kit-skill] input[value=off]');
  await page.wait("document.querySelector('[data-kit-skill] input[value=off]').checked && !document.querySelector('[data-kit-skill] fieldset').disabled");
  assert.deepEqual(skills.settings(project.project_id), []);

  const beforeReopen = model.requests.length;
  await openAssistant();
  await page.click(input);
  await page.command("Input.insertText", { text: "/" });
  await page.wait(`Boolean(document.querySelector(${JSON.stringify(visibleCommands)}))`);
  assert.equal(await page.evaluate(`[...document.querySelectorAll(${JSON.stringify(visibleCommands)})].some(row => row.textContent.includes('review-tests'))`), false);
  await send("检查撤下之后的新一轮");
  assert.ok(model.requests.length > beforeReopen);
  assert.ok(!JSON.stringify(model.requests.slice(beforeReopen)).includes(skillBody));
  assert.deepEqual(uses(), records, "Turning a Skill off preserves its original use without recording a new one");

  // The work's summary, with the suggestions' entry, is among its details: 更多 › 详情 (36A-3).
  await page.evaluate(OPEN_DETAILS);
  await page.wait("document.querySelector('[data-assistant-automation]')?.checkVisibility()");
  await page.click("[data-assistant-automation]");
  await loaded();
  await page.click(suggestion + " summary");
  await page.click(suggestion + " a");
  await page.wait(`!document.querySelector('${dialog}').open && document.querySelector('[data-assistant-panel]')?.hidden && !!document.querySelector('[data-kit-skill] fieldset')`);
  await page.click('[data-kit-skill] input[value=manual]');
  await page.wait("document.querySelector('[data-kit-skill] input[value=manual]').checked && !document.querySelector('[data-kit-skill] fieldset').disabled");
  await page.click("[data-return-bar-back]");
  await page.wait("!document.querySelector('[data-settings-return-bar]')");
  await page.evaluate("document.dispatchEvent(new CustomEvent('molis:assistant-open', { detail: { new: true } }))");
  await page.wait(`!document.querySelector('[data-assistant-panel]')?.hidden && document.querySelector(${JSON.stringify(input)})?.checkVisibility()`);
  await page.click(input);
  await page.command("Input.insertText", { text: "/" });
  await page.wait(`[...document.querySelectorAll(${JSON.stringify(visibleCommands)})].some(row => row.textContent.includes('review-tests'))`);
  await go(kitPath);
  await page.wait("document.querySelector('[data-kit-skill] input[value=manual]')?.checked");
  await page.click('[data-kit-skill] input[value=off]');
  await page.wait("document.querySelector('[data-kit-skill] input[value=off]').checked && !document.querySelector('[data-kit-skill] fieldset').disabled");

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
