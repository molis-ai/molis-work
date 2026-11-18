import { projectPluginRevision } from "@molis-ai/molis-work-test-kit/local-host-http";
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:http";
import test, { type TestContext } from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { scheduleServiceFor } from "@molis-ai/molis-work-app-local-host";
import { scheduleActions, SCHEDULE_ACTION_PERMISSIONS, SCHEDULE_PLUGIN_ID, getScheduleConversationTask } from "@molis-ai/molis-work-plugin-schedule";
import { evaluationActions, type EvaluationRunView } from "@molis-ai/molis-work-contracts/services/evaluation";
import { observationActions, type ObservationQueryOutput } from "@molis-ai/molis-work-contracts/services/observation";
import { readRecords } from "@molis-ai/molis-work-service-observation";
import { newCallId, withCallId } from "@molis-ai/molis-work-kernel";
import { MEMORY_PERMISSIONS, memoryActions } from "@molis-ai/molis-work-contracts/services/memory";
import { emptyCapabilityMatrix } from "@molis-ai/molis-work-service-agent-host";
import { openTestHome } from "./fixtures/test-home.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";
import { asideReply } from "./fixtures/ending-review.js";
import { createLocalFeedApplication } from "./fixtures/feed-library.js";

async function scheduledAgent(t: TestContext, options: { hold?: boolean; workspace?: boolean; model?: boolean } = {}) {
  const f = await openTestHome(t), project = await f.createProject("Scheduled Agent");
  // Every project has an output folder; the one a task cannot use is an output that is gone from disk.
  const gone = join(f.home, "removed-output");
  if (options.workspace === false) mkdirSync(gone);
  await f.host.configurePersonalPlanning(f.home, withMolisWorkProjectCatalog)({ homeDirectory: f.home }, catalog => catalog.commit(() => options.workspace === false
    ? catalog.changeDirectories({ project_id: project.project_id, actor_id: "web-user", change: { kind: "set_output", target: { workspace_path: gone } },
      expected_revision: catalog.projectDirectories(project.project_id).revision })
    : catalog.addWorkspaceProject({ project_id: project.project_id, canonical_path: f.home, actor_id: "web-user", user_confirmed: true })));
  if (options.workspace === false) rmSync(gone, { recursive: true });
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), disconnected = Promise.withResolvers<void>(), prompts: string[] = [];
  const model = createServer(async (request, response) => {
    let body = ""; for await (const part of request) body += part;
    const aside = asideReply(body);
    if (!aside) { prompts.push(body); entered.resolve(); response.on("close", () => disconnected.resolve()); if (options.hold) await release.promise; }
    if (response.destroyed) return;
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(await cogniaModelResponse(aside ?? "IMPORTANT: yes\n有三项工作需要处理。").text());
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { release.resolve(); model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address === "object");
  if (options.model !== false) await seedConfiguredModels(f.home, [{ provider_id: "fixture", model_id: "fixture" }], `http://127.0.0.1:${address.port}`, f.host.configurePersonalPlanning(f.home, withMolisWorkProjectCatalog));
  const caller = { actor_id: "web-user", project_id: project.project_id, audience: "user" as const, permissions: SCHEDULE_ACTION_PERMISSIONS };
  const client = f.host.actionClient(project.reference);
  const created = await client.invoke(caller, scheduleActions.createTask, { title: "早上汇总", instructions: "汇总本周进展", time: "08:30", notify_important: true });
  const store = await f.host.withProject(project.reference, runtime => runtime.store), clock = scheduleServiceFor(store.db);
  const agents = f.host.ensureAgentService(f.home, () => { throw new Error("The served Home must already own its Agent service"); });
  const starts = t.mock.method(agents.agentHost, "start");
  return { ...f, project, store, client, caller, agents, starts, prompts, entered: entered.promise, disconnected: disconnected.promise, release: () => release.resolve(),
    task: () => getScheduleConversationTask(store.db, created.task.task_id)!,
    tick: () => clock.tick(new Date(Date.parse(clock.get(created.task.job_id!)!.next_due_at) + 1000)),
    resume: () => client.invoke(caller, scheduleActions.setTaskEnabled, { task_id: created.task.task_id, enabled: true }),
  };
}

async function taskRecords(f: Awaited<ReturnType<typeof scheduledAgent>>) {
  const caller = await f.host.localPersonContext(f.project.reference);
  const result = await f.client.invoke(caller, observationActions.recordsQuery, {
    project_id: f.project.project_id, fact: "io.molis.work.schedule.task_turn", use: "evaluation",
  }) as ObservationQueryOutput;
  return result.records;
}

async function evaluateTask(f: Awaited<ReturnType<typeof scheduledAgent>>, sampleId: string, callId?: string) {
  const caller = await f.host.localPersonContext(f.project.reference);
  await f.client.invoke(caller, evaluationActions.samplesPut, {
    sample_id: sampleId, version: 1, title: "定时会话交付", purpose: "validation", work_mode: "schedule",
    project_id: f.project.project_id, initial_intent: "按本次任务实际保存的轮次核对交付数量",
    query: { project_id: f.project.project_id, ...(callId ? { call_id: callId } : {}) },
    expectations: [{ expectation_id: "turn", stage: "execution", source: "deterministic", description: "定时回合已留业务依据",
      rule: { check: "record_count", fact: "io.molis.work.schedule.task_turn", min_count: 1 } }],
  });
  return f.client.invoke(caller, evaluationActions.runsExecute, { sample_id: sampleId }) as Promise<EvaluationRunView>;
}

// Batch 28 (contract-design §13, user 2026-11-13): each wakeup is an operation of its own, so the round it starts carries the wakeup's own call id,
// not the tick's; two jobs due in one tick are two operations.
test("SYS-15-A1/S4: the real Schedule wakeup runs the Home Prologue reader with history, memory and its own wakeup's call id", { timeout: 60_000 }, async t => {
  const f = await scheduledAgent(t);
  let otherRuntimeCalls = 0;
  const unused = async () => { otherRuntimeCalls++; throw new Error("A different runtime must not receive scheduled work"); };
  f.agents.agentHost.register({ descriptor: { runtime_id: "aaa-other-runtime", display_name: "Other", provider_version: "1", capabilities: emptyCapabilityMatrix() },
    health: async () => ({ ok: true, status: "ready", message: "ready" }), createSession: unused, readSession: unused, start: unused, read: unused, control: unused, readCommandOutput: unused,
    observe: () => { otherRuntimeCalls++; return () => {}; } });
  const memory = await f.host.homeActionClient().invoke({ actor_id: "web-user", audience: "user", project_id: null, permissions: [...MEMORY_PERMISSIONS] }, memoryActions.write,
    { scope: "personal", text: "汇总工作进展时先列需要处理的工作", kind: "preference" });
  assert.ok(memory.memory);
  const callId = newCallId();
  const result = await withCallId(callId, f.tick);
  assert.equal(result.invoked, 1); assert.equal(result.failed, 0, f.task().last_error ?? "");
  assert.deepEqual(f.task().turns.map(turn => [turn.kind, turn.text]), [["user", "汇总本周进展"], ["assistant", "有三项工作需要处理。"]]);
  assert.equal(f.task().unread, true); assert.equal(f.task().last_error, null); assert.equal(otherRuntimeCalls, 0);
  const first = f.starts.mock.calls[0]!;
  assert.equal(first.arguments[0], "prologue"); assert.equal(first.arguments[1].plugin_id, SCHEDULE_PLUGIN_ID);
  assert.equal(first.arguments[1].role_id, "reader");
  assert.ok(first.arguments[2].call_id, "the round carries a call id"); assert.notEqual(first.arguments[2].call_id, callId, "the wakeup's own, not the tick's");
  // The wakeup's own work record carries the same number: the round and the wakeup are one operation.
  const layer = f.host.observation!.layer; layer.flush();
  const wakeups = readRecords(layer.writer.database()!.db, { fact: "scheduler.wakeup" });
  assert.equal(wakeups.at(-1)!.work.call_id, first.arguments[2].call_id);
  // PWA-55 / OCL-17: one saved turn in a real wakeup with multiple Agent/gateway receipts is one delivery.
  const firstRun = await evaluateTask(f, "one-turn", first.arguments[2].call_id!);
  assert.ok(firstRun.observed_conditions.record_count > 1);
  assert.equal(firstRun.effective_verdict, "passed");
  assert.deepEqual([firstRun.funnel.executed, firstRun.funnel.completed], [1, 1]);
  assert.match(f.prompts[0]!, /汇总本周进展/); assert.match(f.prompts[0]!, /汇总工作进展时先列需要处理的工作/);
  await f.resume(); await f.tick();
  const both = await evaluateTask(f, "two-turns");
  assert.deepEqual([both.funnel.executed, both.funnel.completed], [2, 2]);
  const records = await taskRecords(f);
  assert.deepEqual(records.map(r => r.work.work_ref).sort(), f.task().turns.filter(t => t.kind === "assistant").map(t => t.turn_id).sort());
  assert.ok(records.every(r => r.subjects.some(s => s.id === f.task().task_id)));
  assert.equal(f.task().turns.length, 3); assert.match(f.prompts[1]!, /assistant: 有三项工作需要处理/);
  assert.ok(f.starts.mock.calls[1]!.arguments[2].call_id); assert.notEqual(f.starts.mock.calls[1]!.arguments[2].call_id, callId);
  assert.notEqual(f.starts.mock.calls[1]!.arguments[2].call_id, first.arguments[2].call_id, "each wakeup is its own operation");
});

for (const missing of ["workspace", "model"] as const) test(`Schedule persists an actionable failure when its ${missing} is unavailable`, { timeout: 60_000 }, async t => {
  const f = await scheduledAgent(t, { [missing]: false });
  assert.equal((await f.tick()).failed, 1);
  assert.equal(f.prompts.length, 0); assert.equal(f.task().turns.at(-1)?.kind, "system");
  const [failure] = await taskRecords(f);
  assert.equal(failure?.work.work_ref, f.task().turns.at(-1)?.turn_id);
  const run = await evaluateTask(f, "failed-turn");
  assert.deepEqual([run.funnel.executed, run.funnel.completed], [1, 0]);
  // A missing folder is the output deleted from disk: the agent runtime refuses to start in it and says so (its own sentence).
  assert.match(f.task().last_error ?? "", missing === "workspace" ? /folder does not exist/i : /还没有配置可用的模型/);
});

test("SYS-15-S7/A3: disabling Schedule during the actual model request cancels it and writes no late task result or notification", { timeout: 60_000 }, async t => {
  const f = await scheduledAgent(t, { hold: true }), before = f.task().turns;
  const ticking = f.tick();
  await f.entered;
  await f.web.delete(`/api/settings/projects/${encodeURIComponent(f.project.project_id)}/plugins`, { plugin_id: "schedule", expected_revision: await projectPluginRevision(f.web, f.project.project_id) });
  await f.disconnected; f.release(); await ticking;
  assert.deepEqual(f.task().turns, before);
  assert.deepEqual(await taskRecords(f), []);
  assert.equal(createLocalFeedApplication(f.store.db).snapshot(f.project.project_id).feed_items.length, 0);
});
