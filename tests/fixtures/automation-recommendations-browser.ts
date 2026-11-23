import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { requiredHeadlessTestBrowser } from "./dedicated-headless-browser.js";
import { newPublisher } from "./sandbox-package.js";
import { signedContentPackage } from "./content-package.js";
import { attachAutomationWorkspace } from "./automation-workspace.js";
import { issueModel } from "./issue-model.js";
import { openTestHome } from "./test-home.js";

export async function openAutomationBrowser(t: TestContext) {
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
  const suggestedSkillPath = () => page.evaluate<string>(`(() => {
    const url = new URL(document.querySelector(${JSON.stringify(suggestion + " a")}).href);
    return url.pathname + url.search;
  })()`);
  return {
    fixture, project, model, skillBody,
    browser, page, base, go, navigate,
    dialog, suggestion, loaded, suggestedSkillPath,
    input, visibleCommands, openAssistant, send,
  };
}
