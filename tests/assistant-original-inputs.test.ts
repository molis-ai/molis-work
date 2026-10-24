import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { MolisWorkLocalHost, assistantServiceFor, ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { ASSISTANT_INSTALL_ID, type AssistantSendResult, type AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { openTestHome, serveTestHost } from "./fixtures/test-home.js";
import { connectorAssistantModel, toolField, untilSetup } from "./fixtures/connector-assistant-model.js";

async function owner(home: Awaited<ReturnType<typeof openTestHome>>) {
  const system = ensureSystemAgentService(home.host, home.home); await system.ready;
  const assistant = assistantServiceFor({ localHost: home.host, homeDirectory: home.home, agentHost: system.agentHost, agentReady: () => system.ready,
    projectTitle: async () => null, pages: async () => ["home"] });
  return { ...assistant, system, adapter: system.agentHost.adapter("prologue") };
}
const finished = (home: Awaited<ReturnType<typeof serveTestHost>>, id: string) => untilSetup(async () => {
  const view = await home.web.get<AssistantWorkView>(`/api/assistant/works/${id}`);
  return view.work.state === "completed" ? view : undefined;
}, "Assistant completed");

test("MEM-35: protected Assistant input is available to the first real remember tool before its display round, and survives restart", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), current = await owner(home), text = "回答用要点列表", inputId = randomUUID();
  let release = () => {}, observed = false;
  const gate = new Promise<void>(resolve => { release = resolve; }); t.after(release);
  const start = current.system.agentHost.start.bind(current.system.agentHost);
  t.mock.method(current.system.agentHost, "start", async (...args: Parameters<typeof start>) => { const handle = await start(...args); await gate; return handle; });
  const model = await connectorAssistantModel(t, home.home, (body, turn) => {
    if (turn === 1) return { name: "remember", input: { text, said: text, scope: "personal" } };
    assert.equal(current.store.list(LOCAL_PERSON_ACTOR_ID).flatMap(work => current.store.rounds(work.work_id)).length, 0, "the App has not recorded a display round yet");
    assert.equal(typeof toolField(body.messages, "memory_id"), "string", "the actual tool obtained canonical words and saved memory");
    observed = true; release(); return "已按你的原话记住。";
  });
  const before = Date.now();
  const sent = await home.web.post<AssistantSendResult>("/api/assistant/send", { text, request_id: inputId });
  await finished(home, sent.work.work_id); assert.equal(observed, true);
  assert.ok(sent.run_id);
  const run = await current.adapter.read({ session_id: sent.work.session_id!, run_id: sent.run_id });
  assert.deepEqual(run.original_input?.ref, { session_id: sent.work.session_id, input_id: inputId, version: 1 });
  assert.equal(run.original_input?.text, text); assert.equal(run.original_input?.written_by, "person");
  assert.ok(Date.parse(run.original_input!.occurred_at) >= before && Date.parse(run.original_input!.occurred_at) <= Date.now());
  assert.equal((await current.service.memories()).find(memory => memory.text === text)?.disabled, false);
  const count = model.requests.length;
  const retried = await home.web.post<AssistantSendResult>("/api/assistant/send", { text, request_id: inputId });
  assert.equal(retried.run_id, sent.run_id); assert.equal(model.requests.length, count, "an acknowledged HTTP retry does not dispatch again");
  await home.close(); await home.host.close();
  const reopened = new MolisWorkLocalHost({ homeDirectory: home.home, completeText: null });
  try {
    const system = ensureSystemAgentService(reopened, home.home); await system.ready;
    const restored = await system.agentHost.adapter("prologue").read(run.ref);
    assert.deepEqual(restored.original_input, run.original_input, "the existing attempt owns the same identity, words and first time after restart");
  } finally { await reopened.close(); }
});

test("MEM-35: absent Host proof and page text still run without a personal original; business fields cannot forge the original", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), current = await owner(home);
  await connectorAssistantModel(t, home.home, () => "已读。");
  const unknown = await current.service.send({ text: "未证明作者的输入", request_id: randomUUID() }, {});
  await finished(home, unknown.work.work_id);
  assert.ok(unknown.run_id);
  assert.equal((await current.adapter.read({ session_id: unknown.work.session_id!, run_id: unknown.run_id })).original_input, undefined);
  const page = await home.web.post<AssistantSendResult>("/api/assistant/send", { text: "页面生成的要求", request_id: randomUUID(), written_by: "page" });
  await finished(home, page.work.work_id);
  assert.ok(page.run_id);
  assert.equal((await current.adapter.read({ session_id: page.work.session_id!, run_id: page.run_id })).original_input, undefined);
  const id = randomUUID(), text = "我实际发送的原文", now = Date.now();
  const forged = await home.web.post<AssistantSendResult>("/api/assistant/send", { text, request_id: id,
    original_input: { input_id: "forged", text: "假的原话", written_by: "person", occurred_at: "2000-01-01T00:00:00Z" } });
  await finished(home, forged.work.work_id);
  assert.ok(forged.run_id);
  const actual = (await current.adapter.read({ session_id: forged.work.session_id!, run_id: forged.run_id })).original_input!;
  assert.equal(actual.ref.input_id, id); assert.equal(actual.text, text); assert.ok(Date.parse(actual.occurred_at) >= now);
  await assert.rejects(current.service.send({ text, request_id: randomUUID() }, { original_input: {
    input_id: id, text, written_by: "person", occurred_at: new Date().toISOString(), install_id: ASSISTANT_INSTALL_ID,
  } }), /原件与受理/);
});
