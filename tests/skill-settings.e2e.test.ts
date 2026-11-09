import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { HomeConsentLedger, homeAgentDefinitions } from "@molis-ai/molis-work-app-local-host";
import { requiredHeadlessTestBrowser } from "./fixtures/dedicated-headless-browser.js";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { newPublisher } from "./fixtures/sandbox-package.js";
import { signedContentPackage } from "./fixtures/content-package.js";

// SKP-01 SKP-08 SKP-10: real signed file -> preview -> install (still off) -> separate enable step -> settings -> reload.
test("SKP-01 SKP-08 SKP-10: Skill installation and settings work through the actual browser and Host", { timeout: 120_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis08-ui-"));
  let browser: ChromeHarness | undefined;
  t.after(async () => { try { await browser?.close(); } finally { await rm(directory, { recursive: true, force: true }); } });
  const f = await serveHomeRuntime(t), project = await f.project("Skill settings");
  browser = await ChromeHarness.start(directory, { executable: requiredHeadlessTestBrowser() });
  const page = await browser.page();
  await page.command("Runtime.enable");
  const go = async (path: string) => {
    await page.evaluate("globalThis.skillPreviousDocument = true");
    await page.command("Page.navigate", { url: f.origin + path });
    await page.wait("!globalThis.skillPreviousDocument && document.readyState === 'complete'");
  };
  await go(`/projects/${project.project_id}/settings/plugins`);
  await page.wait("!!document.querySelector('[data-plugin-trust-pick]')");
  const bundle = signedContentPackage(newPublisher()), file = join(directory, "skills.json");
  await writeFile(file, JSON.stringify(bundle));
  const doc = await page.command<{ root: { nodeId: number } }>("DOM.getDocument");
  const input = await page.command<{ nodeId: number }>("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "[data-plugin-trust-pick]" });
  await page.command("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [file] });
  await page.wait("document.querySelector('[data-plugin-trust-preview]')?.innerText.includes('这个包带的技能')", { describe: "document.querySelector('[data-plugin-trust-error]')?.innerText" });
  assert.equal(homeAgentDefinitions(f.home).skills.settings(project.project_id).length, 0);
  await page.fill("[data-plugin-trust-preview] input", "Skill test publisher");
  await page.click("[data-plugin-trust-preview] .mw-btn--primary");
  await page.wait("!!document.querySelector('.skill-segments')", { describe: "document.querySelector('[data-plugin-trust-error]')?.innerText" });
  assert.equal(homeAgentDefinitions(f.home).skills.settings(project.project_id).length, 0, "installation never enables a Skill");
  const offCatalogResponse = await f.request(`/projects/${project.project_id}/api/skills/list`, { method: "POST", body: {} });
  const offCatalog = await offCatalogResponse.json() as { skills: Array<{ ref: { skill_id: string } }> };
  const offRef = offCatalog.skills.find(row => row.ref.skill_id === "meeting-notes")!.ref;
  const offBody = await f.request(`/projects/${project.project_id}/api/skills/body`, { method: "POST", body: { refs: [offRef] } });
  assert.equal((await offBody.json() as { results: Array<{ reason: string }> }).results[0]?.reason, "off", "management full-text route preserves the off refusal");
  await page.click('.skill-segments input[value="manual"]');
  await page.wait("!document.querySelector('.skill-segments').disabled");
  assert.equal(homeAgentDefinitions(f.home).skills.settings(project.project_id)[0]?.state, "manual");
  await page.click("[data-plugin-trust-preview] .skill-toolbar .mw-btn--primary");
  const document = await f.request(`/projects/${project.project_id}/settings/skills`);
  assert.match(await document.text(), /data-skill-settings/, "server renders the Skill section");
  const catalog = await f.request(`/projects/${project.project_id}/api/skills/list`, { method: "POST", body: {} });
  assert.match(await catalog.text(), /meeting-notes/, "HTTP catalog includes installed Skill");
  await go(`/projects/${project.project_id}/settings/skills`);
  await page.wait("[...document.querySelectorAll('[data-sk-list] button')].some(node => node.textContent.includes('meeting-notes'))", { describe: "JSON.stringify({url:location.href,text:document.body.innerText,api:typeof molisSkillUI})" });
  await page.evaluate("[...document.querySelectorAll('[data-sk-list] button')].find(node => node.textContent.includes('meeting-notes')).click()");
  await page.wait("document.querySelector('[data-sk-detail] input[value=manual]')?.checked", { describe: "document.querySelector('[data-sk-error]')?.innerText" });
  await page.click('[data-sk-body]');
  await page.wait("document.querySelector('.skill-full-text')?.textContent.includes('references/template.md')");
  assert.equal(homeAgentDefinitions(f.home).skills.uses(homeAgentDefinitions(f.home).skills.settings(project.project_id)[0]!.install_id, "meeting-notes").length, 0, "viewing a manual Skill is not an accepted run");
  const failureScript = `globalThis.originalSkillFetch = fetch; globalThis.fetch = (input, options) => String(input instanceof Request ? input.url : input).endsWith('/api/skills/set') ? Promise.resolve(new Response(JSON.stringify({code:'ui_host.unavailable',error:'Fixture failure'}),{status:409,headers:{'content-type':'application/json'}})) : originalSkillFetch(input, options)`;
  await page.evaluate(failureScript);
  await page.click('[data-sk-detail] input[value="auto"]');
  await page.wait("document.querySelector('[data-sk-detail] [role=alert]')?.innerText.includes('Fixture failure')");
  assert.equal(await page.evaluate("document.querySelector('[data-sk-detail] input[value=manual]').checked"), true);
  assert.equal(homeAgentDefinitions(f.home).skills.settings(project.project_id)[0]?.state, "manual");
  await page.evaluate("globalThis.fetch = originalSkillFetch");
  await page.click("[data-sk-detail] [role=alert] button");
  await page.wait("document.querySelector('[data-sk-detail] input[value=auto]')?.checked && !document.querySelector('[data-sk-detail] fieldset')?.disabled");
  assert.equal(homeAgentDefinitions(f.home).skills.settings(project.project_id)[0]?.state, "auto");
  await page.click('[data-sk-notice] button');
  await page.wait("document.querySelector('[data-sk-detail] input[value=manual]')?.checked");
  assert.equal(homeAgentDefinitions(f.home).skills.settings(project.project_id)[0]?.state, "manual", "undo uses the saved revision");
  await page.click('[data-sk-detail] input[value="auto"]');
  await page.wait("!document.querySelector('[data-sk-detail] fieldset')?.disabled");
  // Another settings window commits first: conflict refreshes the current value before a new choice.
  const concurrent = homeAgentDefinitions(f.home).skills.settings(project.project_id)[0]!;
  const concurrentResponse = await f.request(`/projects/${project.project_id}/api/skills/set`, { method: "POST", body: {
    scope: "project", install_id: concurrent.install_id, skill_id: concurrent.skill_id, expected_revision: concurrent.revision, state: "manual",
  } });
  assert.equal(concurrentResponse.status, 200);
  await page.click('[data-sk-detail] input[value="off"]');
  await page.wait("!document.querySelector('[data-sk-detail] [role=alert]')?.hidden");
  assert.equal(homeAgentDefinitions(f.home).skills.settings(project.project_id)[0]?.state, "manual");
  await page.click("[data-sk-detail] [role=alert] button");
  await page.wait("document.querySelector('[data-sk-detail] input[value=manual]')?.checked");
  await page.click('[data-sk-detail] input[value="auto"]');
  await page.wait("!document.querySelector('[data-sk-detail] fieldset')?.disabled");
  assert.equal(homeAgentDefinitions(f.home).skills.settings(project.project_id)[0]?.state, "auto");
  for (const locale of ["zh", "en"]) {
    await go(`/locale?lang=${locale}&next=${encodeURIComponent(`/projects/${project.project_id}/settings/skills`)}`);
    await page.wait("!!document.querySelector('[data-sk-list] .mw-item__pick')");
    for (const width of [1440, 1024, 390]) for (const theme of ["light", "dark"]) {
      await page.command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await page.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });
      await page.wait(`getComputedStyle(document.body).colorScheme.includes(${JSON.stringify(theme)})`);
      await page.click("[data-sk-list] .mw-item__pick");
      assert.equal(await page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1"), true, `${locale} ${width} ${theme} fits`);
      if (locale === "en") assert.doesNotMatch(await page.evaluate<string>("document.querySelector('[data-skill-settings]').innerText"), /技能详情|使用方式|启用记录|看详情/);
      const shots = join(process.cwd(), ".impeccable/qa/review/skill-settings"); await mkdir(shots, { recursive: true });
      const shot = await page.command<{ data: string }>("Page.captureScreenshot", { format: "png" });
      await writeFile(join(shots, `${locale}-${width}-${theme}.png`), Buffer.from(shot.data, "base64"));
      if (width === 390) {
        assert.equal(await page.evaluate("document.activeElement?.tagName"), "H3");
        await page.click(".mw-list-detail__back");
        assert.equal(await page.evaluate("document.activeElement?.classList.contains('mw-item__pick')"), true);
      }
      await page.evaluate("document.querySelector('[data-sk-catalog]').removeAttribute('data-detail')");
    }
  }
  new HomeConsentLedger(f.home).revokePublisher(bundle.payload.manifest.publisher.signature, new Date().toISOString());
  await page.click('[data-sk-refresh]');
  await page.wait("[...document.querySelectorAll('[data-sk-list] button')].some(n => n.textContent.includes('meeting-notes') && n.textContent.includes('Retracted'))");
  await page.evaluate("[...document.querySelectorAll('[data-sk-list] button')].find(n => n.textContent.includes('meeting-notes')).click()");
  assert.equal(await page.evaluate("document.querySelector('[data-sk-detail] fieldset').disabled"), true);
  assert.match(await page.evaluate<string>("document.querySelector('[data-sk-detail]').innerText"), /Retracted/);
  await go("/settings/skills");
  await page.wait("document.querySelector('[data-skill-settings][data-project=\"\"] [data-sk-count]')?.textContent.length > 0", { describe: "JSON.stringify([...document.querySelectorAll('[data-skill-settings]')].map(n => ({project:n.dataset.project,text:n.innerText})))" });
  assert.equal(await page.evaluate("[...document.querySelectorAll('[data-skill-settings][data-project=\"\"] [data-sk-list] .mw-item__pick')].some(node => node.textContent.includes('meeting-notes'))"), false, "project state and installation never leak into Home catalog");
});
