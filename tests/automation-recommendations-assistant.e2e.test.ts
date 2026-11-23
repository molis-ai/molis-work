import test from "node:test";
import { OPEN_DETAILS } from "./fixtures/assistant-current-work.js";
import { openAutomationBrowser } from "./fixtures/automation-recommendations-browser.js";

test("AUT-06 AUT-08: the Assistant work summary opens the suggestion and returns to the Assistant with the enabled Skill", { timeout: 95_000 }, async t => {
  const { page, go, dialog, suggestion, loaded, input, visibleCommands, openAssistant, send, suggestedSkillPath } = await openAutomationBrowser(t);
  await openAssistant();
  await send("检查撤下之后的新一轮");

  // The work's summary, with the suggestions' entry, is among its details: 更多 › 详情 (36A-3).
  await page.evaluate(OPEN_DETAILS);
  await page.wait("document.querySelector('[data-assistant-automation]')?.checkVisibility()");
  await page.click("[data-assistant-automation]");
  await loaded();
  await page.click(suggestion + " summary");
  const kitPath = await suggestedSkillPath();
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
});
