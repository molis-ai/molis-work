import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { assistantServiceFor, ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import type { AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { readRecords } from "@molis-ai/molis-work-service-observation";
import { openTestHome } from "./fixtures/test-home.js";
import { connectorAssistantModel, untilSetup } from "./fixtures/connector-assistant-model.js";

// OCL-03, OCL-11 (specs/observation-collection/spec.md; design §4「助理」): a turn the person sends, the round it starts and what they do to
// the work afterwards are joined: the send and its round share one call number, and each panel write names its work. The person's own
// Assistant work belongs to no project. A draft they have not sent is recorded as saved, never with its words.

test("OCL-03 OCL-11: an Assistant turn, its round and the person's later writes are joined to the work; an unsent draft keeps no words", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), system = ensureSystemAgentService(home.host, home.home); await system.ready;
  assistantServiceFor({ localHost: home.host, homeDirectory: home.home, agentHost: system.agentHost, agentReady: () => system.ready, projectTitle: async () => null, pages: async () => ["home"] });
  await connectorAssistantModel(t, home.home, () => "已读。", undefined, home.host.configurePersonalPlanning(home.home, withMolisWorkProjectCatalog));
  const sent = await home.web.post<AssistantSendResult>("/api/assistant/send", { text: "看一下本周的安排", request_id: randomUUID() });
  const work = sent.work.work_id;
  await untilSetup(async () => (await home.web.get<AssistantWorkView>(`/api/assistant/works/${work}`)).work.state === "completed" || undefined, "Assistant completed");
  await home.web.post(`/api/assistant/works/${work}/draft`, { draft: "还没发出去的半句话" });
  const layer = home.host.observation!.layer; layer.flush();
  const all = readRecords(layer.writer.database()!.db, { limit: 5000 });
  const steps = all.filter(record => record.fact === "assistant.work");
  assert.deepEqual(steps.map(record => [record.stage, record.work.work_ref, record.actor.actor_id, record.project_id]),
    [["send", work, steps[0]!.actor.actor_id, null], ["works.draft", work, steps[0]!.actor.actor_id, null]]);
  const send = steps[0]!, round = all.filter(record => record.fact.startsWith("agent.") && record.work.call_id === send.work.call_id);
  assert.ok(send.work.call_id && round.some(record => record.fact === "agent.run" && record.stage === "started"), "the round the turn started is in the same operation");
  assert.ok(round.every(record => record.project_id === null), "the person's own Assistant work belongs to no project");
  const draftCall = all.find(record => record.fact === "action.call" && record.detail.action === "assistant.panel.works.draft@1")!;
  assert.deepEqual(draftCall.evidence.map(item => item.ref.kind === "missing" ? item.ref.reason : item.ref.kind), ["by_rule", "by_rule"]);
  assert.ok(!JSON.stringify(all).includes("还没发出去的半句话"));
});
