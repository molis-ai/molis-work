import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { AssistantStore } from "../apps/local-host/src/assistant/assistant-store.js";
import { AssistantService, presentActivity } from "../apps/local-host/src/assistant/assistant-service.js";
import type { PersonActions } from "../apps/local-host/src/assistant/assistant-coding.js";

/** Coding as its page sees it: the same actions, over sessions kept in memory. */
function fakeCoding() {
  const sessions = new Map<string, { configuration: Record<string, string> | null; runs: AgentRunView[] }>();
  const calls: Array<{ name: string; input: any }> = [];
  const names = ["state", "sessions.create", "sessions.read", "sessions.update", "runs.start", "runs.control"];
  const views = names.map(name => ({ capability_id: `coding.${name}`, version: 1, provider: { provider_id: "io.molis.coding", title: "Coding" },
    availability: { available: true } }) as unknown as ActionView);
  const run = (id: string, task: string): AgentRunView => ({ ref: { run_id: id }, phase: "completed", turns: [{ turn_id: "u", kind: "user", text: task }],
    activity: [], awaiting_input: [], usage: {}, started_at: "2026-09-28T00:00:00.000Z", ended_at: "2026-09-28T00:00:01.000Z" }) as unknown as AgentRunView;
  const actions: PersonActions = {
    discover: async () => views,
    invoke: async (reference, input: any) => {
      const name = reference.capability_id.slice("coding.".length);
      calls.push({ name, input: structuredClone(input) });
      const session = sessions.get(input.session_id);
      switch (name) {
        case "state": return { models: [{ provider_id: "provider", model_id: "model" }], workspace: { workspace_id: "workspace" } };
        case "sessions.create": { const id = `session-${sessions.size + 1}`; sessions.set(id, { configuration: null, runs: [] }); return { session: { session_id: id } }; }
        case "sessions.read": return { session: { session_id: input.session_id, runtime_session_id: null }, runs: session!.runs, configuration: session!.configuration };
        case "sessions.update": session!.configuration = structuredClone(input.configuration); return { session: { session_id: input.session_id } };
        case "runs.start": session!.runs.push(run(`run-${session!.runs.length + 1}`, input.task)); return {};
        default: return {};
      }
    },
  };
  return { sessions, calls, actions };
}

function fixture() {
  const coding = fakeCoding();
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service = new AssistantService(store, { host: async () => ({}) as AgentHost, authority: async () => { throw new Error("not used"); },
    personActions: async () => coding.actions }, "web-user");
  const caller = { project_ref: { project_id: "project", board_id: "board", storage_key: "memory:project" } as any };
  return { coding, store, service, caller };
}

test("a Coding work keeps its mode on Coding's own session, so the bottom bar and the Coding page start rounds alike", async () => {
  const { coding, service, caller } = fixture();
  const first = await service.send({ executor: "coding", scope: { kind: "project", project_id: "project" }, text: "加一个 subtract 函数", request_id: randomUUID() }, caller);
  assert.equal(first.outcome, "started");
  const sessionId = (first.work.executor as { session_id: string }).session_id;
  // With nothing saved yet, what the bottom bar used is saved on the session, where the Coding page reads it.
  assert.deepEqual(coding.sessions.get(sessionId)!.configuration, { intent: "execute", provider_id: "provider", model_id: "model", workspace_id: "workspace" });
  assert.equal(coding.calls.filter(call => call.name === "runs.start").at(-1)!.input.intent, "execute");

  // The person switches to discuss on the Coding page: the next round from the bottom uses that, and says so.
  coding.sessions.get(sessionId)!.configuration!.intent = "discuss";
  assert.equal(((await service.read(first.work.work_id)).work.executor as { mode?: string }).mode, "discuss");
  await service.send({ work_id: first.work.work_id, text: "再加 multiply", request_id: randomUUID() }, caller);
  assert.equal(coding.calls.filter(call => call.name === "runs.start").at(-1)!.input.intent, "discuss");

  // Switching from the bottom changes only the mode, on the session itself; model and directory stay as chosen.
  const view = await service.setExecutorMode(first.work.work_id, "execute");
  assert.equal((view.work.executor as { mode?: string }).mode, "execute");
  assert.deepEqual(coding.sessions.get(sessionId)!.configuration, { intent: "execute", provider_id: "provider", model_id: "model", workspace_id: "workspace" });
  await service.send({ work_id: first.work.work_id, text: "现在改吧", request_id: randomUUID() }, caller);
  assert.equal(coding.calls.filter(call => call.name === "runs.start").at(-1)!.input.intent, "execute");
  assert.equal(view.rounds.length, 2);
});

test("only a Coding work has a mode, and only a mode Coding knows", async () => {
  const { store, service, caller } = fixture();
  const own = store.create({ actor_id: "web-user", title: "整理周报", scope: { kind: "personal" }, origin: null });
  await assert.rejects(service.setExecutorMode(own.work_id, "execute"), /不由专业 Agent 执行/);
  const coding = await service.send({ executor: "coding", scope: { kind: "project", project_id: "project" }, text: "修测试", request_id: randomUUID() }, caller);
  await assert.rejects(service.setExecutorMode(coding.work.work_id, "yolo"), /不认识的方式/);
  // A new Coding work can start in the mode chosen before its first Send; an existing one keeps the session's setting.
  const planned = await service.send({ executor: "coding", mode: "plan", scope: { kind: "project", project_id: "project" }, text: "先出个方案", request_id: randomUUID() }, caller);
  assert.equal(((await service.read(planned.work.work_id)).work.executor as { mode?: string }).mode, "plan");
  await assert.rejects(service.send({ work_id: planned.work.work_id, mode: "execute", text: "开始吧", request_id: randomUUID() }, caller), /只有新的 Coding 工作/);
  // Personal work has no directory: Coding cannot carry it.
  await assert.rejects(service.send({ executor: "coding", scope: { kind: "personal" }, text: "写代码", request_id: randomUUID() }, caller), /Coding Agent 在项目里工作/);
});

test("a professional Agent's own steps read as file and command work, never as business capabilities", () => {
  assert.deepEqual(presentActivity([
    { call_id: "a", name: "list", target: ".", state: "completed", summary: "list", at: null },
    { call_id: "b", name: "edit", target: "calc.js", state: "completed", summary: "edit", at: null },
    { call_id: "c", name: "run-command", target: "npm test", state: "started", summary: "run-command", at: null },
  ], undefined), [
    { call_id: "a", verb: "file-list", target: ".", state: "completed" },
    { call_id: "b", verb: "file-change", target: "calc.js", state: "completed" },
    { call_id: "c", verb: "command", target: "npm test", state: "started" },
  ]);
  // Stopped while an edit waited for approval: the one never closed has no recorded outcome; the cancelled one did not run.
  assert.deepEqual(presentActivity([
    { call_id: "d", name: "write", target: "calc.js", state: "started", summary: "write", at: null },
    { call_id: "e", name: "write", target: "README.md", state: "failed", summary: "write · TOOL_INTERRUPTED", output: "TOOL_INTERRUPTED: this run was cancelled before the tool ran.", at: null },
  ], undefined, true), [
    { call_id: "d", verb: "file-change", target: "calc.js", state: "unknown" },
    { call_id: "e", verb: "file-change", target: "README.md", state: "failed", reason: "interrupted", detail: "TOOL_INTERRUPTED: this run was cancelled before the tool ran." },
  ]);
});

test("a new Coding work can continue the session the person started on the Coding page, and one session belongs to one work", async () => {
  const { coding, service, caller } = fixture();
  const started = await coding.actions.invoke({ capability_id: "coding.sessions.create", version: 1, provider_id: "io.molis.coding" }, { title: "在 Coding 里开始的" }) as { session: { session_id: string } };
  const before = coding.calls.filter(call => call.name === "sessions.create").length;
  const sent = await service.send({ executor: "coding", coding_session_id: started.session.session_id, scope: { kind: "project", project_id: "project" }, text: "接着做", request_id: randomUUID() }, caller);
  assert.equal((sent.work.executor as { session_id: string }).session_id, started.session.session_id);
  assert.equal(coding.calls.filter(call => call.name === "sessions.create").length, before, "no second session");
  assert.deepEqual((await service.related("project", { kind: "coding_session", id: started.session.session_id })).map(row => [row.work_id, row.relation]), [[sent.work.work_id, "session"]]);
  await assert.rejects(service.send({ executor: "coding", coding_session_id: started.session.session_id, scope: { kind: "project", project_id: "project" }, text: "再开一个", request_id: randomUUID() }, caller),
    /已属于工作/);
  await assert.rejects(service.send({ work_id: sent.work.work_id, coding_session_id: "other", text: "换会话", request_id: randomUUID() }, caller), /只有新的 Coding 工作/);
});
