import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import type { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import type { openTestHome } from "./test-home.js";
import { recordingTextModel } from "./recording-text-model.js";
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
  });
  await served.grant("agent:prologue", project.project_id, [view]);
  const page = await browser.page();
  await page.command("Page.navigate", { url: served.origin + "/projects/" + project.project_id + "/" });
  await page.wait('!!document.querySelector("[data-assistant-head]")');
  const sent = await served.web.post<AssistantSendResult>("/projects/" + project.project_id + "/api/assistant/send", {
    scope: { kind: "project", project_id: project.project_id }, request_id: randomUUID(), text: "Use Notebook editing to review and save the proposed wording.",
  });
  const id = sent.work.work_id, current = () => served.web.get<AssistantWorkView>("/api/assistant/works/" + encodeURIComponent(id));
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
  await page.evaluate('document.dispatchEvent(new CustomEvent("molis:assistant-open",{detail:{work_id:' + JSON.stringify(id) + '}}))');
  await page.wait('document.querySelector(' + JSON.stringify(selector) + ')?.textContent.includes(' + JSON.stringify(scenario.review.title) + ')');
  const text = await page.evaluate<string>('document.querySelector(' + JSON.stringify(selector) + ').textContent');
  for (const expected of [scenario.review.fields[0]!.label, input.word, view.provider.provider_id]) assert.ok(text.includes(expected), expected);
  await page.click(selector + ' [data-assistant-decision="approve"]');
  await page.wait('!document.querySelector(' + JSON.stringify(selector + ' [data-assistant-decision="approve"]') + ')');
  const completedBy = Date.now() + 15000;
  while ((work = await current()).work.state !== "completed" && Date.now() < completedBy) await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(work.work.state, "completed");
  t.diagnostic(scenario.title + " → " + scenario.review.title + " → " + ref.capability_id + " · " + input.word);
}
