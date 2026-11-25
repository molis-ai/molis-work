import test from "node:test";
import assert from "node:assert/strict";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { evaluationActions } from "@molis-ai/molis-work-contracts/services/evaluation";
import type { AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { observationActions, type ObservationQueryOutput } from "@molis-ai/molis-work-contracts/services/observation";
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

test("QRF-04 a presented automation card records only a final choice, joined to the adopted work", { timeout: 95_000 }, async t => {
  const { fixture, project, base, page, go } = await openAutomationBrowser(t);
  const offered = await fixture.web.post<{work_id: string}>(base + "/api/automation/recommendations/offer", {});
  const actor = await fixture.host.localPersonContext();
  const facts = async () => (await fixture.host.homeActionClient().invoke(actor, observationActions.recordsQuery, {
    use: "evaluation", project_id: project.project_id, work_ref: offered.work_id,
  }) as ObservationQueryOutput).records;
  await go(base + "/");
  await page.wait("document.querySelector('[data-assistant-panel]')");
  await page.evaluate("document.dispatchEvent(new CustomEvent('molis:assistant-open',{detail:{work_id:" + JSON.stringify(offered.work_id) + "}}))");
  const toggle = "[data-ix-field=skill_state] [data-ix-option=manual]";
  await page.wait("document.querySelector('[data-ix-field=adopt] [data-ix-option]')?.checkVisibility()");
  const option = await page.evaluate<string>("document.querySelector('[data-ix-field=adopt] [data-ix-option]').dataset.ixOption");
  await page.click(toggle);
  await page.click("[data-ix-action=run]");
  await page.wait("document.querySelector('[data-assistant-adoption-confirm]')?.checkVisibility()");
  assert.ok(!(await facts()).some(record => record.stage === "chosen"));
  await page.click("[data-ix-action=confirm-adoption]");
  await page.wait("document.querySelector('[data-status=done]')");
  const rows = await facts();
  const candidates = rows.filter(row => row.fact === "ui.candidates" && row.subjects.some(s => s.id === option));
  assert.deepEqual(candidates.map(row=>row.stage), ["presented", "chosen"]);
  assert.equal(candidates[0]!.detail.receipt_id, candidates[1]!.detail.receipt_id);
  assert.equal(rows.filter(row => row.fact === "automation.adoption" && row.stage === "adopted").length,1);
  const workPath = base + "/api/assistant/works/" + offered.work_id;
  const undo = (await fixture.web.get<AssistantWorkView>(workPath)).undoable?.find(item => item.state === "available");
  assert.ok(undo);
  await fixture.web.post(workPath + "/undo/" + undo.undo_id, {});
  // Only the two owners' actual card and adoption facts form this sample. No technical success proves a completed work.
  const relevant = (await facts()).filter(row => row.fact === "ui.candidates" || row.fact === "automation.adoption");
  const evaluator = bindActionClient(fixture.host.homeActionClient(), () => actor);
  await evaluator.invoke(evaluationActions.samplesPut, { sample_id: "automation-card", version: 1, title: "签名建议的采用与撤回",
    purpose: "validation", work_mode: "mixed", project_id: project.project_id, initial_intent: "核对建议卡的呈现和本人选择",
    query: { project_id: project.project_id, work_ref: offered.work_id }, pinned_record_ids: relevant.map(row => row.record_id),
    expectations: [{ expectation_id: "interaction", stage: "delivery", source: "deterministic", description: "采用与撤回",
      rule: { check: "funnel_stage_separation", min_count: 1 } }] });
  await evaluator.invoke(evaluationActions.runsExecute, { sample_id: "automation-card" });
  await evaluator.invoke(evaluationActions.runsExecute, { sample_id: "automation-card" });
  const { denominator, funnel_totals: totals } = await evaluator.invoke(evaluationActions.metricsSummarize, { purpose: "validation", project_id: project.project_id });
  assert.deepEqual([denominator, totals.presented, totals.selected, totals.adopted, totals.undone_or_reworked, totals.completed], [2, 1, 1, 1, 1, 0]);
  assert.ok(Object.values(totals.unattributed_interactions).every(count => count === 0));
});
