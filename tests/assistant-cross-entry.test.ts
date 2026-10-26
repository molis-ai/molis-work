import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { AssistantService, AssistantStore, assistantAuthority } from "@molis-ai/molis-work-app-local-host";
import { newCallId, withCallId } from "@molis-ai/molis-work-kernel";
import { openTestHome } from "./fixtures/test-home.js";
import { crossEntrySchedule as subject, isCrossEntryObject } from "./fixtures/cross-entry-subjects.js";
import { cogniaScriptedResponse as reply } from "./fixtures/cognia-model-response.js";
import { answeringEndingReviews } from "./fixtures/ending-review.js";

async function until<T>(read: () => Promise<T | undefined>, what: string): Promise<T> {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const value = await read(); if (value !== undefined) return value;
    assert.ok(Date.now() < deadline, what);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

// W3-09-1-01: only the model response is scripted; the SDK, gateway, review, Host, owner and operation log are real.
test("W3-09-1-01 T1/T2 assistant: approved Schedule changes and owner refusals retain the original round's diagnostic number", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Assistant cross entry", ["schedule"]);
  const queue = new AgentReviewQueue(), agent = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.cross-entry-assistant", appVersion: "1.0.0" }, storageRoot: join(home.home, "assistant-sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  agent.register(adapter);
  const db = new DatabaseSync(":memory:"), store = new AssistantStore(db);
  const service: AssistantService = new AssistantService(store, { pages: async () => ["home"], host: async () => agent,
    authority: async work => assistantAuthority(home.host, work, () => store.disabledActions("web-user")),
    projectTitle: async () => project.display_name }, "web-user");
  t.after(async () => { service.continuations.close(); await adapter.close(); db.close(); });
  const expected = new Date(Date.now() + 12 * 60 * 60_000), clock = `${String(expected.getHours()).padStart(2, "0")}:${String(expected.getMinutes()).padStart(2, "0")}`;
  const input = subject.input("同一个真实任务", clock);
  const caller = { actor_id: "web-user", audience: "agent" as const, project_id: project.project_id, permissions: ["schedule:read", "schedule:write"] };
  const offered = await home.host.inspectActions(caller, project.reference);
  const create = offered.find(view => view.capability_id === subject.create.capability_id), archive = offered.find(view => view.capability_id === subject.archive.capability_id);
  assert.ok(create); assert.ok(archive);
  const calls = [
    { name: "change-capability", input: { capability_id: create.capability_id, version: create.version, provider_id: create.provider.provider_id, input } },
    undefined,
    { name: "change-capability", input: { capability_id: archive.capability_id, version: archive.version, provider_id: archive.provider.provider_id, input: { task_id: "missing" } } },
    undefined,
  ];
  const network: unknown[] = [], originalFetch = globalThis.fetch.bind(globalThis);
  t.mock.method(globalThis, "fetch", answeringEndingReviews(text => reply(undefined, text), async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(url) !== "https://1.1.1.1/v1/messages") return originalFetch(url, init);
    assert.ok(typeof init?.body === "string" || init?.body instanceof Uint8Array);
    const body: unknown = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body)); network.push(body);
    assert.ok(network.length <= calls.length, "the scripted model must finish each actual round");
    return reply(calls[network.length - 1], "本轮已完成。");
  }));
  const before = await home.web.get<{ tasks: unknown[] }>(subject.path(project.project_id));
  const changed = t.mock.method(home.host.search!, "changed");
  const roundId = newCallId();
  const started = await withCallId(roundId, () => service.send({ text: "创建摘要定时任务", request_id: randomUUID() }, { project_ref: project.reference }));
  const waiting = await until(async () => { const view = await service.read(started.work.work_id); return view.reviews.length ? view : undefined; }, "actual create review");
  assert.equal(waiting.work.state, "waiting-review");
  assert.deepEqual(await home.web.get(subject.path(project.project_id)), before, "the proposed change does not write before the person approves");
  assert.deepEqual(home.host.callLog!.find(roundId), [], "preparing the review creates no platform call row");
  await withCallId(newCallId(), () => service.outcomes.decide(started.work.work_id, { review_id: waiting.reviews[0]!.review_id, decision: "approve" }));
  const done = await until(async () => { const view = await service.read(started.work.work_id); return view.work.state === "completed" ? view : undefined; }, "create round completed");
  const records = home.host.callLog!.find(roundId).filter(record => record.capability_id === subject.create.capability_id);
  assert.equal(records.length, 1);
  assert.deepEqual([records[0]!.ok, records[0]!.actor_id, records[0]!.audience, records[0]!.project_id, records[0]!.path],
    [true, "web-user", "agent", project.project_id, undefined]);
  assert.equal(done.rounds.length, 1);
  const facts = await home.web.get<{ tasks: Array<{ title: string; instructions: string; clock_label: string; enabled: boolean; next_due_at: string }> }>(subject.path(project.project_id));
  assert.equal(facts.tasks.length, before.tasks.length + 1);
  const task = facts.tasks.find(item => item.title === input.title); assert.ok(task);
  assert.deepEqual([task.instructions, task.clock_label, task.enabled], [input.instructions, clock, true]);
  assert.ok(Math.abs(Date.parse(task.next_due_at) - expected.getTime()) < 60_000);
  assert.equal(changed.mock.calls.filter(call => call.arguments[0] === "io.molis.work.schedule" && call.arguments[1] === project.project_id).length, 1);
  const refusedId = newCallId();
  await withCallId(refusedId, () => service.send({ work_id: started.work.work_id, text: "归档不存在的任务", request_id: randomUUID() }, {}));
  const refusedReview = await until(async () => { const view = await service.read(started.work.work_id); return view.reviews.length ? view : undefined; }, "actual owner refusal review");
  await withCallId(newCallId(), () => service.outcomes.decide(started.work.work_id, { review_id: refusedReview.reviews[0]!.review_id, decision: "approve" }));
  await until(async () => { const view = await service.read(started.work.work_id); return view.work.state === "completed" && view.rounds.length === 2 ? view : undefined; }, "refused action round completed");
  const refused = home.host.callLog!.find(refusedId).filter(record => record.capability_id === subject.archive.capability_id);
  assert.equal(refused.length, 1);
  assert.deepEqual([refused[0]!.ok, refused[0]!.code, refused[0]!.refused, refused[0]!.actor_id, refused[0]!.audience], [false, subject.missing.code, undefined, "web-user", "agent"]);
  assert.deepEqual(home.host.callLog!.find(refusedId.slice(0, 8)), home.host.callLog!.find(refusedId));
  assert.ok(isCrossEntryObject(network[3]));
  // GATEWAY-MODEL-CODE-01: the real SDK model sees the same owner code and reason as the Host row.
  assert.match(JSON.stringify(network[3]), /schedule\.task_not_found/u);
  assert.match(JSON.stringify(network[3]), /定时任务不存在/u);
  assert.deepEqual(await home.web.get(subject.path(project.project_id)), facts, "the owner refusal leaves every persisted task unchanged");
  assert.equal(changed.mock.calls.filter(call => call.arguments[0] === "io.molis.work.schedule" && call.arguments[1] === project.project_id).length, 1);
});

for (const failure of ["disabled", "invalid"] as const) test(`W3-09-2-01 assistant ${failure}: the actual preflight preserves its code and reason before review and before dispatch`, { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Assistant preflight", ["schedule"]);
  const before = await home.web.get(subject.path(project.project_id));
  const offered = await home.host.inspectActions({ actor_id: "web-user", audience: "agent", project_id: project.project_id, permissions: ["schedule:write"] }, project.reference);
  const create = offered.find(view => view.capability_id === subject.create.capability_id); assert.ok(create);
  if (failure === "disabled") await home.web.delete(`/api/settings/projects/${encodeURIComponent(project.project_id)}/plugins`, { plugin_id: "schedule" });
  const queue = new AgentReviewQueue(), agent = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: `io.molis.work.cross-entry-preflight-${failure}`, appVersion: "1.0.0" }, storageRoot: join(home.home, "preflight-sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  agent.register(adapter);
  const db = new DatabaseSync(":memory:"), store = new AssistantStore(db);
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => agent,
    authority: async work => assistantAuthority(home.host, work, () => new Set()), projectTitle: async () => project.display_name }, "web-user");
  t.after(async () => { service.continuations.close(); await adapter.close(); db.close(); });
  const originalFetch = globalThis.fetch.bind(globalThis), requests: unknown[] = [];
  t.mock.method(globalThis, "fetch", answeringEndingReviews(text => reply(undefined, text), async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(url) !== "https://1.1.1.1/v1/messages") return originalFetch(url, init);
    assert.ok(typeof init?.body === "string" || init?.body instanceof Uint8Array); const body: unknown = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body)); requests.push(body);
    assert.ok(requests.length <= 2, "the model receives the refusal and ends the actual round");
    return requests.length === 1 ? reply({ name: "change-capability", input: { capability_id: create.capability_id, version: create.version, provider_id: create.provider.provider_id,
      input: failure === "invalid" ? { ...subject.input("x", "23:00"), title: "x".repeat(201) } : subject.input("不可写的定时", "23:00") } }) : reply(undefined, "没有执行，原内容保留。");
  }));
  const roundId = newCallId(), sent = await withCallId(roundId, () => service.send({ text: "创建定时", request_id: randomUUID() }, { project_ref: project.reference }));
  const done = await until(async () => { const view = await service.read(sent.work.work_id); return view.work.state === "completed" ? view : undefined; }, "preflight refusal completed");
  assert.equal(done.reviews.length, 0); assert.deepEqual(home.host.callLog!.find(roundId), []);
  assert.equal(requests.length, 2);
  const modelReply = JSON.stringify(requests[1]);
  if (failure === "invalid") assert.ok(modelReply.includes("actions.input_invalid"), "an offered action's input refusal keeps the owner code");
  else assert.match(modelReply, /EFFECT_NOT_AUTHORIZED.*No capability with that exact identity is offered here/,
    "SYS-15-S7: stopping the Runtime removes its actions before this round discovers them; no owner action is dispatched");
  if (failure === "disabled") {
    const now = await home.host.inspectActions({ actor_id: "web-user", audience: "agent", project_id: project.project_id, permissions: ["schedule:write"] }, project.reference);
    assert.equal(now.some(row => row.capability_id === subject.create.capability_id), false, "a disabled Runtime no longer registers actions");
    await home.web.post(`/api/settings/projects/${encodeURIComponent(project.project_id)}/plugins`, { plugin_id: "schedule" });
  }
  assert.deepEqual(await home.web.get(subject.path(project.project_id)), before, "both preflight refusals leave all owner tasks unchanged");
});
