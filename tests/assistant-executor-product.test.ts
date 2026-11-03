import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import type { AssistantExecutorOffer, AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { codingProductHost } from "./fixtures/coding-product-host.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";

// specs/repository-anti-corruption PG-036 (C8-3), on a real Home: the Assistant finds Coding as an executor by the work-executor
// protocol Coding publishes (C8-2), offers it with the ways its own `state` gives, and carries a work in a Coding session that
// Coding's page shows. Nothing in the Assistant names Coding.

const CODING = "io.molis.work.coding";

test("RAC-445 RAC-446 on a real Home the Assistant offers Coding by its protocol roles and carries a work in a session Coding's page shows", { timeout: 90_000 }, async t => {
  const f = await codingProductHost(t, async () => cogniaModelResponse("好的。"));
  const project = f.project.project_id;

  // RAC-445: the project's executors are the plugins that publish the whole protocol; Coding's ways are its own.
  const offers = await f.call<{ executors: AssistantExecutorOffer[] }>(project, "/api/assistant/executors");
  assert.equal(offers.status, 200, JSON.stringify(offers.body));
  const coding = offers.body.executors.find(offer => offer.plugin_id === CODING);
  assert.ok(coding, JSON.stringify(offers.body));
  assert.equal(coding.problem, undefined);
  assert.deepEqual(coding.modes.map(mode => mode.id), ["discuss", "plan", "edit", "execute", "review"]);
  assert.equal(coding.default_mode, "execute");
  assert.deepEqual(Object.keys(coding.capability_ids).sort(), ["run.start", "session.update"]);

  // RAC-446: a new work naming Coding by its plugin id opens a Coding session in the chosen way; Coding's page reads the same session and round.
  const sent = await f.call<AssistantSendResult>(project, "/api/assistant/send", { text: "把登录改到新接口", request_id: randomUUID(),
    scope: { kind: "project", project_id: project }, executor: { kind: "plugin", plugin_id: CODING }, mode: "plan" });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.work.executor.kind, "plugin");
  const sessionId = (sent.body.work.executor as { session_id: string }).session_id;
  assert.ok(sessionId);
  let view: AssistantWorkView | undefined;
  for (const end = Date.now() + 30_000; Date.now() < end;) {
    view = (await f.call<AssistantWorkView>(project, `/api/assistant/works/${sent.body.work.work_id}`)).body;
    if (view.work.state === "completed") break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(view?.work.state, "completed", "the Coding round ended");
  assert.deepEqual(view!.rounds.map(round => round.executor), ["plugin"]);
  assert.deepEqual(view!.objects.map(object => [object.relation, object.subject.kind, object.subject.id]), [["session", "coding_session", sessionId]]);
  assert.equal((view!.work.executor as { mode?: string }).mode, "plan");
  const page = await f.call<{ configuration: { intent: string }; runs: Array<{ ref: { run_id: string } }> }>(project, `/api/plugins/${CODING}/sessions/${sessionId}`);
  assert.equal(page.status, 200, JSON.stringify(page.body));
  assert.equal(page.body.configuration.intent, "plan", "the way the Assistant opened it with is the page's setting");
  assert.deepEqual(page.body.runs.map(run => run.ref.run_id), [view!.rounds[0]!.run_id], "the page shows the round the Assistant started");
});
