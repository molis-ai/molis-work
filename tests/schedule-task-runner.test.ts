import assert from "node:assert/strict";
import { createServer } from "node:http";
import test, { type TestContext } from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { scheduleServiceFor } from "@molis-ai/molis-work-app-local-host";
import { scheduleActions, SCHEDULE_ACTION_PERMISSIONS, SCHEDULE_PLUGIN_ID, getScheduleConversationTask } from "@molis-ai/molis-work-plugin-schedule";
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
  if (options.workspace !== false) await withMolisWorkProjectCatalog({ homeDirectory: f.home }, catalog => catalog.commit(() => catalog.addWorkspaceProject({
    project_id: project.project_id, canonical_path: f.home, actor_id: "web-user", user_confirmed: true,
  })));
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
  if (options.model !== false) await seedConfiguredModels(f.home, [{ provider_id: "fixture", model_id: "fixture" }], `http://127.0.0.1:${address.port}`);
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

test("SYS-15-A1/S4: the real Schedule wakeup runs the Home Prologue reader with history, memory and the tick's call id", { timeout: 60_000 }, async t => {
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
  assert.equal(first.arguments[1].role_id, "reader"); assert.equal(first.arguments[2].call_id, callId);
  assert.match(f.prompts[0]!, /汇总本周进展/); assert.match(f.prompts[0]!, /汇总工作进展时先列需要处理的工作/);
  await f.resume(); await f.tick();
  assert.equal(f.task().turns.length, 3); assert.match(f.prompts[1]!, /assistant: 有三项工作需要处理/);
  assert.ok(f.starts.mock.calls[1]!.arguments[2].call_id); assert.notEqual(f.starts.mock.calls[1]!.arguments[2].call_id, callId);
});

for (const missing of ["workspace", "model"] as const) test(`Schedule persists an actionable failure when its ${missing} is unavailable`, { timeout: 60_000 }, async t => {
  const f = await scheduledAgent(t, { [missing]: false });
  assert.equal((await f.tick()).failed, 1);
  assert.equal(f.prompts.length, 0); assert.equal(f.task().turns.at(-1)?.kind, "system");
  assert.match(f.task().last_error ?? "", missing === "workspace" ? /工作区/ : /模型|model/i);
});

test("SYS-15-S7/A3: disabling Schedule during the actual model request cancels it and writes no late task result or notification", { timeout: 60_000 }, async t => {
  const f = await scheduledAgent(t, { hold: true }), before = f.task().turns;
  const ticking = f.tick();
  await f.entered;
  await f.web.delete(`/api/settings/projects/${encodeURIComponent(f.project.project_id)}/plugins`, { plugin_id: "schedule" });
  await f.disconnected; f.release(); await ticking;
  assert.deepEqual(f.task().turns, before);
  assert.equal(createLocalFeedApplication(f.store.db).snapshot(f.project.project_id).feed_items.length, 0);
});
