import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import type { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import type { openTestHome } from "./test-home.js";
import { recordingTextModel } from "./recording-text-model.js";
import { CURRENT_WORK } from "./assistant-current-work.js";
import { response } from "./prologue-reviewed-tool.js";

/** The loopback model proposes a signed tool. The ordinary assistant and the person's Workbench own execution and approval. */
export async function exerciseReview(t: TestContext, served: Awaited<ReturnType<typeof openTestHome>>, project: LocalHostProjectReference,
  view: ActionView, input: { word: string }, browser: ChromeHarness) {
  const scenario = view.action.agent_scenario;
  assert.ok(scenario?.review);
  const ref = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
  let turn = 0, readRule = false;
  await recordingTextModel(t, served.home, request => {
    const wire = JSON.stringify(request);
    if (!wire.includes("find-capabilities")) return response();
    if (turn++ === 0) return response("find-capabilities", { query: scenario.title });
    if (turn === 2) {
      readRule = wire.includes(scenario.title) && wire.includes(scenario.instructions);
      return response("change-capability", { ...ref, input });
    }
    return response();
  }, served.withCatalog);
  await served.grant("agent:prologue", project.project_id, [view]);
  const page = await browser.page();
  await page.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  await page.command("Page.navigate", { url: served.origin + "/" });
  await page.wait('document.querySelector(".chooser")?.dataset.selected === ' + JSON.stringify(project.project_id));
  await page.evaluate('document.dispatchEvent(new CustomEvent("molis:assistant-open", { detail: { new: true } }))');
  const composer = "[data-assistant-composer] .mw-composer__input";
  await page.wait('document.querySelector(' + JSON.stringify(composer) + ')?.getBoundingClientRect().width > 0');
  await page.evaluate('(() => { const input = document.querySelector(' + JSON.stringify(composer) + '); input.value = "Use Notebook editing to review and save the proposed wording."; input.dispatchEvent(new Event("input", {bubbles:true})); })()');
  await page.click("[data-assistant-composer] [data-composer-send]");
  await page.wait(CURRENT_WORK);
  const id = await page.evaluate<string>(CURRENT_WORK);
  const current = () => served.web.get<AssistantWorkView>("/api/assistant/works/" + encodeURIComponent(id));
  const deadline = Date.now() + 25000;
  let work = await current();
  while (!work.reviews.length && Date.now() < deadline && !["failed", "completed", "cancelled"].includes(work.work.state)) {
    await new Promise(resolve => setTimeout(resolve, 80));
    work = await current();
  }
  const review = work.reviews[0];
  assert.ok(review, "the real Assistant must hold the proposal: " + JSON.stringify({ state: work.work.state, turn, readRule, rounds: work.rounds.slice(-1).map(round => round.run_id) }));
  assert.ok(readRule, "the scripted model received the signed scenario and instructions from the assistant's directory");
  const queue = ensureSystemAgentService(served.host, served.home).agentHost.reviews;
  const held = queue.list(project.project_id, "pending").find(item => item.review_id === review.review_id);
  assert.ok(held?.document.kind === "tool-operation");
  assert.equal(held.document.plugin_review?.kind, scenario.review.kind);
  const selector = '[data-review="' + review.review_id + '"]';
  try {
    await page.wait('document.querySelector(' + JSON.stringify(selector) + ')?.textContent.includes(' + JSON.stringify(scenario.review.title) + ')');
  } catch (error) {
    t.diagnostic(JSON.stringify(await page.evaluate('({path:location.pathname, cards:Array.from(document.querySelectorAll("[data-review]"), card=>[card.getAttribute("data-review"),card.innerText]), panel:document.querySelector("[data-assistant-panel]")?.innerText?.slice(-950), errors:document.querySelector("[data-assistant-error]")?.textContent})')));
    t.diagnostic(JSON.stringify({ summary: review.summary, fields: review.fields.map(field => field.label), html: ("html" in review ? String(review.html) : "").slice(0,1200) }));
    throw error;
  }
  const text = await page.evaluate<string>('document.querySelector(' + JSON.stringify(selector) + ').textContent');
  for (const expected of [scenario.review.fields[0]!.label, input.word, view.provider.provider_id]) assert.ok(text.includes(expected), expected);
  await page.click(selector + ' [data-assistant-decision="approve"]');
  await page.wait('!document.querySelector(' + JSON.stringify(selector + ' [data-assistant-decision="approve"]') + ')');
  const completedBy = Date.now() + 15000;
  while ((work = await current()).work.state !== "completed" && Date.now() < completedBy) await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(work.work.state, "completed");
  t.diagnostic(scenario.title + " → " + scenario.review.title + " → " + ref.capability_id + " · " + input.word);
}
