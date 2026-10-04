import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineSubjectContextAction } from "@molis-ai/molis-work-contracts/platform/actions";
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
  const host = { adapter: () => ({ readSession: async () => ({}), read: async () => null }), reviews: { list: () => [] } };
  const service = new AssistantService(store, { host: async () => host as unknown as AgentHost, authority: async () => { throw new Error("not used"); },
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
    { call_id: "e", verb: "file-change", target: "README.md", state: "failed", reason: "interrupted", detail: "this run was cancelled before the tool ran." },
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

test("an Assistant work handed to Coding stays one work: the first Coding round is told the work so far, and handing back keeps Coding's rounds", async () => {
  const { coding, store, service } = fixture();
  const project_ref = { project_id: "project", board_id: "board", storage_key: "memory:project" } as any;
  const work = store.create({ actor_id: "web-user", title: "加法函数", scope: { kind: "project", project_id: "project" }, origin: null, project_ref });
  store.addRound(work.work_id, { run_id: "assistant-1", text: "写一个加法函数，放在 calc.js", materials: [], context: null, started_at: "2026-09-28T00:00:00.000Z" });

  const handed = await service.handover(work.work_id, { to: "coding", mode: "execute" });
  const sessionId = (handed.work.executor as { session_id: string }).session_id;
  assert.equal(handed.work.executor.kind, "coding");
  assert.ok(!("handover_brief" in handed.work), "the note is not part of the work as shown");
  assert.deepEqual(handed.objects.map(object => [object.relation, object.subject.kind, object.subject.id]), [["session", "coding_session", sessionId]]);
  assert.equal(coding.sessions.get(sessionId)!.configuration!.intent, "execute");

  await service.send({ work_id: work.work_id, text: "开始吧", request_id: randomUUID() }, { project_ref });
  const first = coding.calls.filter(call => call.name === "runs.start").at(-1)!.input.task as string;
  assert.match(first, /从个人助理转交给你继续/);
  assert.match(first, /写一个加法函数，放在 calc\.js/);
  assert.match(first, /用户现在的要求：开始吧/);
  await service.send({ work_id: work.work_id, text: "再补测试", request_id: randomUUID() }, { project_ref });
  assert.doesNotMatch(coding.calls.filter(call => call.name === "runs.start").at(-1)!.input.task as string, /转交/, "told once");

  let view = await service.read(work.work_id);
  assert.deepEqual(view.rounds.map(round => round.executor), ["coding", "coding"]);
  await assert.rejects(service.handover(work.work_id, { to: "coding" }), /已经由 Coding Agent 执行/);

  // Back to the Assistant: Coding's rounds still belong to the work.
  view = await service.handover(work.work_id, { to: "assistant" });
  assert.equal(view.work.executor.kind, "assistant");
  assert.deepEqual(view.rounds.map(round => round.executor), ["coding", "coding"]);
  // And to Coding again: the same session, not a new one.
  const creates = coding.calls.filter(call => call.name === "sessions.create").length;
  view = await service.handover(work.work_id, { to: "coding" });
  assert.equal((view.work.executor as { session_id: string }).session_id, sessionId);
  assert.equal(coding.calls.filter(call => call.name === "sessions.create").length, creates);
});

test("handing a work to Coding carries what its documents say now, read from their owner, since Coding cannot read them itself", async () => {
  const coding = fakeCoding();
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const host = { adapter: () => ({ readSession: async () => ({}), read: async () => null }), reviews: { list: () => [] } };
  const reader = defineSubjectContextAction("pages.subject.read", "pages_document", "Pages", ["pages:read"]);
  const view = { capability_id: reader.capability_id, version: reader.version, operation: reader.operation, provider: { provider_id: "io.molis.work.pages", kind: "plugin", title: "Pages" },
    action: reader.action, availability: { available: true } } as unknown as ActionView;
  const pages: PersonActions = { discover: async () => [view], invoke: async (_ref, input) => {
    assert.deepEqual(input, { subject_id: "doc-1" });
    return { subject: { kind: "pages_document", id: "doc-1" }, revision: "2", title: "calc average 需求", content: "## 错误处理\n空数组抛 RangeError" };
  } } as PersonActions;
  const service = new AssistantService(store, { host: async () => host as unknown as AgentHost, authority: async () => { throw new Error("not used"); },
    personActions: async () => coding.actions, scopeActions: async () => pages }, "web-user");
  const project_ref = { project_id: "project", board_id: "board", storage_key: "memory:project" } as any;
  const work = store.create({ actor_id: "web-user", title: "calc average", scope: { kind: "project", project_id: "project" }, origin: null, project_ref });
  store.addRound(work.work_id, { run_id: "assistant-1", text: "整理成需求文档", materials: [], context: null, started_at: "2026-09-30T00:00:00.000Z" });
  store.relations.link({ work_id: work.work_id, project_id: "project" }, "result", { kind: "pages_document", id: "doc-1", revision: "2" }, "助理产出");

  await service.handover(work.work_id, { to: "coding", mode: "execute" });
  await service.send({ work_id: work.work_id, text: "按文档实现", request_id: randomUUID() }, { project_ref });
  const task = coding.calls.filter(call => call.name === "runs.start").at(-1)!.input.task as string;
  assert.match(task, /相关对象的当前内容/);
  assert.match(task, /《calc average 需求》（产出，版本 2）：\n## 错误处理\n空数组抛 RangeError/);
  // The person reads their own message for that round, not the note that travelled with it.
  const shown = (await service.read(work.work_id)).rounds.at(-1)!.turns.find(turn => turn.kind === "user")!.text;
  assert.equal(shown, "按文档实现");
});
