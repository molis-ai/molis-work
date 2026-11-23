import assert from "node:assert/strict";
import test from "node:test";
import { homeAgentDefinitions } from "@molis-ai/molis-work-app-local-host";
import { openAutomationBrowser } from "./fixtures/automation-recommendations-browser.js";

test("AUT-01 AUT-06 AUT-08: the Home suggestion opens the Skill settings and enables use until turned off", { timeout: 95_000 }, async t => {
  const {
    fixture, project, model, skillBody, page, go, navigate, suggestion, loaded, suggestedSkillPath,
    input, visibleCommands, openAssistant, send,
  } = await openAutomationBrowser(t);
  await go("/");
  const open = `[data-automation-open="${project.project_id}"]`;
  await page.wait("!!document.querySelector(" + JSON.stringify(open) + ")");
  assert.equal(await page.evaluate("document.querySelector('[data-automation-dialog]').open"), false);
  await page.click(open);
  await loaded();
  await page.click(suggestion + " summary");
  assert.match(await page.evaluate<string>("document.querySelector('[data-automation-suggestion]').innerText"), /package\.json/);
  assert.equal(homeAgentDefinitions(fixture.home).skills.settings(project.project_id).length, 0);
  const kitPath = await suggestedSkillPath();
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
});
