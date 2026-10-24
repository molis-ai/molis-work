import assert from "node:assert/strict";
import test from "node:test";
import { ASSISTANT_INSTALL_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { bindActionClient, defineSubjectContextAction, type ActionCallContext, type ActionExecutionContext, type ActionDefinition, type ActionView, type BoundActionClient,
  type WorkExecutorRole, type HostOfferedOriginalInput } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { AssistantService, AssistantStore, assistantServiceFor, ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { EXECUTOR_MODES, roleDefinitions, roleOfCapability, roleViews } from "./fixtures/work-executor-fake.js";

import { PluginRuntime, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { definePlugin } from "@molis-ai/molis-work-plugin-sdk";
import { openTestHome } from "./fixtures/test-home.js";

// specs/repository-anti-corruption PG-036 (C8-3): the Assistant carries a work in any plugin that publishes the work-executor protocol,
// found by the roles' types and kept by the plugin's id. These tests speak the protocol with a plugin that is not Coding.

const PLUGIN = "io.molis.work.fixture-agent", KIND = "fixture_session", MODES = EXECUTOR_MODES;
type Session = { mode: string | null; runs: AgentRunView[] };
type Input = Record<string, unknown>;
type Call = { role: WorkExecutorRole; input: Input };
const PROJECT_REF = { project_id: "project", storage_key: "memory:project" };

/** A plugin that is not Coding, as its page sees it: the six protocol actions over sessions kept in memory. */
function fakeExecutor(pluginId = PLUGIN, kind = KIND) {
  const sessions = new Map<string, Session>();
  const calls: Call[] = [];
  const started: Array<{ session_id: string; task: string; mode: string }> = [];
  // What the executor's control says became of a supplement: the round took it, unless a test says it had just ended.
  const receipt = { delivered: "run" as "run" | "queued" };
  const views = roleViews(pluginId, "样例 Agent", kind);
  const run = (id: string, task: string): AgentRunView => ({ ref: { run_id: id }, phase: "completed", turns: [{ turn_id: "u", kind: "user", text: task }],
    activity: [], awaiting_input: [], usage: {}, started_at: "2026-09-28T00:00:00.000Z", ended_at: "2026-09-28T00:00:01.000Z" }) as AgentRunView;
  const refuse = (mode: string) => { if (!MODES.some(row => row.id === mode)) throw Object.assign(new Error(`样例 Agent：不认识的方式 ${mode}`), { code: "fixture.mode_unknown" }); };
  // What the executor answers a call, whoever makes it: the Assistant through the person's bound client, or a test as the executor's own page.
  const respond = async (role: WorkExecutorRole, input: Input): Promise<unknown> => {
    calls.push({ role, input: structuredClone(input) });
    const sessionId = String(input.session_id), mode = input.mode === undefined ? null : String(input.mode);
    const session = sessions.get(sessionId);
    if (role !== "state" && role !== "session.open" && !session) throw new Error("样例 Agent：没有这个会话");
    switch (role) {
      case "state": return { modes: MODES, default_mode: "execute", images: false, workspace_id: "workspace", workspaces: [{ workspace_id: "workspace", name: "项目目录", path: "/work" }] };
      case "session.open": { if (mode) refuse(mode); const id = `session-${sessions.size + 1}`; sessions.set(id, { mode, runs: [] }); return { session_id: id }; }
      case "session.read": return { session_id: sessionId, title: "会话", mode: session!.mode, runs: session!.runs, runtime_session_id: null, recovery: null };
      case "session.update": refuse(mode!); session!.mode = mode; return { session_id: sessionId, mode };
      case "run.start": {
        const run_id = `run-${session!.runs.length + 1}`, task = String(input.task);
        session!.runs.push(run(run_id, task)); started.push({ session_id: sessionId, task, mode: session!.mode ?? "execute" });
        return { run_id };
      }
      case "run.control": return input.kind === "steer" ? { accepted: true, receipt: { input_id: "steer-1", replayed: false, delivered: receipt.delivered } } : { accepted: true };
    }
  };
  const actions: BoundActionClient = { discover: async () => views,
    invoke: async <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input) => await respond(roleOfCapability(pluginId, definition.capability_id), input) as Output };
  return { sessions, calls, started, actions, respond, receipt, views, controls: () => calls.filter(call => call.role === "run.control") };
}

function fixture(executors: Array<ReturnType<typeof fakeExecutor>> = [fakeExecutor()]) {
  const exec = executors[0]!;
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const host = { adapter: () => ({ readSession: async () => ({}), read: async () => null }), reviews: { list: () => [] } };
  // The project's whole directory and a call routed to the provider it names, as the person's bound client does.
  const actions: BoundActionClient = { discover: async () => (await Promise.all(executors.map(row => row.actions.discover()))).flat(),
    invoke: async <In, Out>(definition: ActionDefinition<In, Out>, input: In, control?: unknown) => {
      const owner = executors.find(row => row.views.some(view => view.capability_id === definition.capability_id))!;
      return await owner.actions.invoke(definition, input, control as never) as Out;
    } };
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => host as never, authority: async () => { throw new Error("not used"); },
    personActions: async () => actions }, "web-user");
  const caller = { project_ref: PROJECT_REF };
  const plugin = { kind: "plugin" as const, plugin_id: PLUGIN };
  const project = { kind: "project" as const, project_id: "project" };
  return { exec, store, service, caller, plugin, project };
}

test("W2-18-FOLLOWUP-DELETE-04 the person's bound client, carrying the follow-up's control, refuses a deleted request after the final beforeEffect await", async () => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const actions = new ActionService(undefined, { beforeEffect: async () => { entered.resolve(); await release.promise; } });
  const definition: ActionDefinition = { capability_id: "fixture.agent.start", version: 1, operation: "command", action: {
    title: "Start", description: "Start a round", kind: "operation", scope: "project", audiences: ["user"], permissions: ["fixture:write"],
    subject_kinds: [], input_schema: { type: "object", properties: {}, additionalProperties: false } } };
  let current = true, writes = 0;
  actions.registerProvider({ provider: { provider_id: "fixture.agent", kind: "plugin", title: "Fixture" }, definitions: [definition],
    handlers: [{ ...definition, async handle(context) { await context.beforeEffect(); writes++; return {}; } }] });
  const seen: Array<{ reference: unknown; permissions: unknown }> = [];
  const caller: ActionCallContext = { actor_id: "web-user", project_id: "project", audience: "user", permissions: ["fixture:write"],
    assert_authority_current: (reference, permissions) => { seen.push({ reference, permissions }); } };
  // The control the Assistant hands its executor for a follow-up's round, joined to the person's checks the way the Host's client joins it.
  const live = () => { if (!current) throw new Error("Follow-up removed"); };
  const reference = { capability_id: definition.capability_id, version: 1, provider_id: "fixture.agent" };
  const pending = bindActionClient(actions, () => caller).invoke({ ...definition, provider_id: "fixture.agent" }, {}, { beforeEffect: async () => live(), assert_authority_current: live });
  try { await entered.promise; current = false; release.resolve(); await assert.rejects(pending, /Follow-up removed/); }
  finally { release.resolve(); }
  assert.equal(writes, 0);
  const identity = (value: unknown) => { const { capability_id, version, provider_id } = value as ActionDefinition; return JSON.stringify({ capability_id, version, provider_id }); };
  assert.ok(seen.some(row => identity(row.reference) === JSON.stringify(reference) && JSON.stringify(row.permissions) === '["fixture:write"]'),
    "the original synchronous authority receives both the exact reference and declared required permissions");
});

test("RAC-430 the executors on offer are the providers that publish all six protocol roles, read from their own state; one short of a role is not offered", async () => {
  const whole = fakeExecutor(), partial = fakeExecutor("io.molis.work.partial", "partial_session");
  partial.views.splice(partial.views.findIndex(view => view.capability_id.endsWith(".run.control")), 1);
  const { service, caller } = fixture([whole, partial]);
  const offers = await service.executors(caller);
  assert.deepEqual(offers.map(offer => offer.plugin_id), [PLUGIN]);
  assert.deepEqual(offers[0], { plugin_id: PLUGIN, title: "样例 Agent", session_kind: KIND, modes: MODES, default_mode: "execute",
    capability_ids: { "session.update": `${PLUGIN}.session.update`, "run.start": `${PLUGIN}.run.start` } });
  assert.deepEqual(await service.executors({ project_ref: undefined as never }), [], "personal work has no project to find an executor in");
});

test("RAC-431 a work is kept with its plugin by id: it goes on in that plugin, and is refused, not moved to another, once the plugin no longer offers the protocol", async () => {
  const first = fakeExecutor(), other = fakeExecutor("io.molis.work.other-agent", "other_session");
  const { service, caller, plugin, project } = fixture([first, other]);
  const sent = await service.send({ executor: plugin, scope: project, text: "加一个 subtract 函数", request_id: randomUUID() }, caller);
  assert.equal((sent.work.executor as { plugin_id: string }).plugin_id, PLUGIN);
  assert.equal(other.calls.length, 0, "the other plugin was not asked");
  // The plugin is stopped (its role actions are gone from the directory): the work does not move to the plugin that is still there.
  first.views.length = 0;
  await assert.rejects(service.send({ work_id: sent.work.work_id, text: "再加 multiply", request_id: randomUUID() }, caller), (error: unknown) => (error as { code?: string }).code === "assistant.executor_unavailable");
  assert.equal(other.calls.length, 0, "no other executor takes the round");
  assert.equal(other.started.length, 0);
});

test("RAC-432 a new work names its executor by plugin id; an id nobody offers is refused before a work is made", async () => {
  const { service, store, caller, project } = fixture();
  await assert.rejects(service.send({ executor: { kind: "plugin", plugin_id: "io.molis.work.nobody" }, scope: project, text: "做点什么", request_id: randomUUID() }, caller),
    (error: unknown) => (error as { code?: string }).code === "assistant.executor_unavailable");
  assert.equal(store.list("web-user").length, 0, "no work was left behind");
  await assert.rejects(service.send({ executor: { kind: "plugin" } as never, scope: project, text: "做点什么", request_id: randomUUID() }, caller), (error: unknown) => (error as { code?: string }).code === "assistant.invalid");
});

test("a plugin work keeps its mode on the executor's own session, so the bottom bar and the plugin's page start rounds alike", async () => {
  const { exec, service, caller, plugin, project } = fixture();
  const first = await service.send({ executor: plugin, scope: project, text: "加一个 subtract 函数", request_id: randomUUID() }, caller);
  assert.equal(first.outcome, "started");
  const sessionId = (first.work.executor as { session_id: string }).session_id;
  // Nothing was chosen: the executor applies its own default, and run.start carries only the session and the task.
  assert.deepEqual(exec.calls.filter(call => call.role === "run.start").at(-1)!.input, { session_id: sessionId, task: "加一个 subtract 函数" });
  assert.equal(exec.started.at(-1)!.mode, "execute");

  // The person switches to discuss on the plugin's page: the next round from the bottom uses that, and says so.
  exec.sessions.get(sessionId)!.mode = "discuss";
  assert.equal(((await service.read(first.work.work_id)).work.executor as { mode?: string }).mode, "discuss");
  await service.send({ work_id: first.work.work_id, text: "再加 multiply", request_id: randomUUID() }, caller);
  assert.equal(exec.started.at(-1)!.mode, "discuss");

  // Switching from the bottom changes the session's own setting, where the plugin's page reads it.
  const view = await service.setExecutorMode(first.work.work_id, "execute");
  assert.equal((view.work.executor as { mode?: string }).mode, "execute");
  assert.equal(exec.sessions.get(sessionId)!.mode, "execute");
  await service.send({ work_id: first.work.work_id, text: "现在改吧", request_id: randomUUID() }, caller);
  assert.equal(exec.started.at(-1)!.mode, "execute");
  assert.equal(view.rounds.length, 2);
});

test("words sent to a round under way reach it through the executor's run.control", async () => {
  const { exec, service, caller, plugin, project } = fixture();
  const first = await service.send({ executor: plugin, scope: project, text: "加一个 subtract 函数", request_id: randomUUID() }, caller);
  exec.sessions.get((first.work.executor as { session_id: string }).session_id)!.runs.at(-1)!.phase = "running";
  const requestId = randomUUID();
  const steered = await service.send({ work_id: first.work.work_id, text: "顺便补上测试", request_id: requestId }, caller);
  assert.equal(steered.outcome, "steered");
  const control = exec.controls().at(-1)!;
  assert.equal(control.input.kind, "steer");
  assert.equal(control.input.text, "顺便补上测试");
  assert.equal(control.input.key, `send.${requestId}`, "RC-06: the press of Send is the supplement's key, so a repeat after a lost answer is the same supplement");
});

// RCPT-368, BL-144: the control takes a supplement's source, so the Assistant no longer drops it on the way.
test("RCPT-368: words a page wrote reach a round under way as the Host's, and the person's own words as theirs", async () => {
  const { exec, service, caller, plugin, project } = fixture();
  const first = await service.send({ executor: plugin, scope: project, text: "加一个 subtract 函数", request_id: randomUUID() }, caller);
  exec.sessions.get((first.work.executor as { session_id: string }).session_id)!.runs.at(-1)!.phase = "running";
  await service.send({ work_id: first.work.work_id, text: "浏览器已经交还，请继续", request_id: randomUUID(), written_by: "page" }, caller);
  assert.equal(exec.controls().at(-1)!.input.source, "host", "a page's wording is a note in the round, never the person's words");
  const text = "顺便补上测试", request_id = randomUUID();
  await service.send({ work_id: first.work.work_id, text, request_id }, { ...caller, original_input: {
    install_id: ASSISTANT_INSTALL_ID, input_id: request_id, text, written_by: "person", occurred_at: new Date().toISOString(),
  } });
  assert.equal(exec.controls().at(-1)!.input.original, undefined, "personal authorship travels only in the protected client context, never the action payload");
  assert.equal(exec.controls().at(-1)!.input.source, undefined, "the person's own words go without a source, which the executor reads as theirs");
  await service.send({ work_id: first.work.work_id, text: "没有入口证明的文字", request_id: randomUUID() }, caller);
  assert.equal(exec.controls().at(-1)!.input.source, "host", "a direct Service call cannot claim personal authorship without the send owner's stamp");
});

test("RC-06: words that reach a round as it ends are said to wait for the next round, never to have reached this one", async () => {
  const { exec, service, caller, plugin, project } = fixture();
  const first = await service.send({ executor: plugin, scope: project, text: "加一个 subtract 函数", request_id: randomUUID() }, caller);
  exec.sessions.get((first.work.executor as { session_id: string }).session_id)!.runs.at(-1)!.phase = "running";
  exec.receipt.delivered = "queued";
  const late = await service.send({ work_id: first.work.work_id, text: "再把文档改了", request_id: randomUUID() }, caller);
  assert.equal(late.outcome, "queued");
});

test("RC-06: an answer to a question names the question's own revision, and one without a revision is not sent", async () => {
  const { exec, service, caller, plugin, project } = fixture();
  const first = await service.send({ executor: plugin, scope: project, text: "加一个 subtract 函数", request_id: randomUUID() }, caller);
  const round = exec.sessions.get((first.work.executor as { session_id: string }).session_id)!.runs.at(-1)!;
  round.phase = "awaiting-input";
  round.awaiting_input = [{ pending_id: "q1", pending_revision: 4, kind: "text", prompt: "用哪个名字？", options: [], allows_free_text: true }];
  assert.equal((await service.send({ work_id: first.work.work_id, text: "minus", request_id: randomUUID(), target: "answer" }, caller)).outcome, "answered");
  assert.equal(exec.controls().at(-1)!.input.pending_revision, 4);
  round.awaiting_input = [{ pending_id: "q2", kind: "text", prompt: "还要别的吗？", options: [], allows_free_text: true }];
  const before = exec.controls().length;
  await assert.rejects(service.send({ work_id: first.work.work_id, text: "不用了", request_id: randomUUID(), target: "answer" }, caller), (error: unknown) => (error as { code?: string }).code === "assistant.stale");
  assert.equal(exec.controls().length, before, "no default revision is made up");
});

test("RC-14: while a question waits, the person's choice decides where the words go; the Host never guesses an answer", async () => {
  const { exec, service, caller, plugin, project } = fixture();
  const first = await service.send({ executor: plugin, scope: project, text: "加一个 subtract 函数", request_id: randomUUID() }, caller);
  const round = exec.sessions.get((first.work.executor as { session_id: string }).session_id)!.runs.at(-1)!;
  round.phase = "awaiting-input";
  round.awaiting_input = [{ pending_id: "q1", pending_revision: 4, kind: "text", prompt: "用哪个名字？", options: [], allows_free_text: true }];
  // Without a choice the words are a supplement, even though they could have answered the one free-text question.
  assert.equal((await service.send({ work_id: first.work.work_id, text: "顺便补上测试", request_id: randomUUID() }, caller)).outcome, "steered");
  assert.equal(exec.controls().at(-1)!.input.kind, "steer");
  // Answering with materials is refused, never quietly sent as a supplement.
  const material = { material_id: "m1", kind: "text", title: "笔记", explicit: true, text: "minus" } as const;
  const before = exec.controls().length;
  await assert.rejects(service.send({ work_id: first.work.work_id, text: "minus", request_id: randomUUID(), target: "answer", materials: [material] }, caller),
    (error: unknown) => (error as { code?: string }).code === "assistant.invalid");
  // A question no longer waiting is a stale choice: nothing is sent.
  round.phase = "running"; round.awaiting_input = [];
  await assert.rejects(service.send({ work_id: first.work.work_id, text: "minus", request_id: randomUUID(), target: "answer" }, caller),
    (error: unknown) => (error as { code?: string }).code === "assistant.stale");
  assert.equal(exec.controls().length, before, "a refused choice sends nothing");
});

test("only a plugin work has a mode, and only a mode the executor knows: it refuses in its own words", async () => {
  const { store, service, caller, plugin, project } = fixture();
  const own = store.create({ actor_id: "web-user", title: "整理周报", scope: { kind: "personal" }, origin: null });
  await assert.rejects(service.setExecutorMode(own.work_id, "execute"), /不由执行方插件承担/);
  const carried = await service.send({ executor: plugin, scope: project, text: "修测试", request_id: randomUUID() }, caller);
  await assert.rejects(service.setExecutorMode(carried.work.work_id, "yolo"), /不认识的方式/);
  // A new plugin work can start in the mode chosen before its first Send; an existing one keeps the session's setting.
  const planned = await service.send({ executor: plugin, mode: "plan", scope: project, text: "先出个方案", request_id: randomUUID() }, caller);
  assert.equal(((await service.read(planned.work.work_id)).work.executor as { mode?: string }).mode, "plan");
  await assert.rejects(service.send({ work_id: planned.work.work_id, mode: "execute", text: "开始吧", request_id: randomUUID() }, caller), /只有交给执行方插件的新工作/);
  await assert.rejects(service.send({ executor: plugin, mode: "yolo", scope: project, text: "乱来", request_id: randomUUID() }, caller), /不认识的方式/);
  // Personal work has no directory: a plugin cannot carry it.
  await assert.rejects(service.send({ executor: plugin, scope: { kind: "personal" }, text: "写代码", request_id: randomUUID() }, caller), /执行方插件在项目里工作/);
});

test("a new plugin work can continue the session the person started on the plugin's page, and one session belongs to one work", async () => {
  const { exec, service, caller, plugin, project } = fixture();
  const started = await exec.respond("session.open", { title: "在插件里开始的" }) as { session_id: string };
  const before = exec.calls.filter(call => call.role === "session.open").length;
  const sent = await service.send({ executor: plugin, executor_session_id: started.session_id, scope: project, text: "接着做", request_id: randomUUID() }, caller);
  assert.equal((sent.work.executor as { session_id: string }).session_id, started.session_id);
  assert.equal(exec.calls.filter(call => call.role === "session.open").length, before, "no second session");
  // The relation keeps the kind the provider's session.open declares, not a name the Assistant knows.
  assert.deepEqual((await service.related("project", { kind: KIND, id: started.session_id })).map(row => [row.work_id, row.relation]), [[sent.work.work_id, "session"]]);
  await assert.rejects(service.send({ executor: plugin, executor_session_id: started.session_id, scope: project, text: "再开一个", request_id: randomUUID() }, caller), /已属于工作/);
  await assert.rejects(service.send({ work_id: sent.work.work_id, executor_session_id: "other", text: "换会话", request_id: randomUUID() }, caller), /只有交给执行方插件的新工作/);
});

test("an Assistant work handed to a plugin stays one work: the first round is told the work so far, and handing back keeps the plugin's rounds", async () => {
  const { exec, store, service, plugin } = fixture();
  const project_ref = PROJECT_REF;
  const work = store.create({ actor_id: "web-user", title: "加法函数", scope: { kind: "project", project_id: "project" }, origin: null, project_ref });
  store.addRound(work.work_id, { run_id: "assistant-1", text: "写一个加法函数，放在 calc.js", materials: [], context: null, started_at: "2026-09-28T00:00:00.000Z" });

  const handed = await service.handover(work.work_id, { to: plugin, mode: "execute" });
  const sessionId = (handed.work.executor as { session_id: string }).session_id;
  assert.equal(handed.work.executor.kind, "plugin");
  assert.ok(!("handover_brief" in handed.work), "the note is not part of the work as shown");
  assert.deepEqual(handed.objects.map(object => [object.relation, object.subject.kind, object.subject.id]), [["session", KIND, sessionId]]);
  assert.equal(exec.sessions.get(sessionId)!.mode, "execute");

  await service.send({ work_id: work.work_id, text: "开始吧", request_id: randomUUID() }, { project_ref });
  const first = exec.started.at(-1)!.task;
  assert.match(first, /从个人助理转交给你继续/);
  assert.match(first, /写一个加法函数，放在 calc\.js/);
  assert.match(first, /用户现在的要求：开始吧/);
  await service.send({ work_id: work.work_id, text: "再补测试", request_id: randomUUID() }, { project_ref });
  assert.doesNotMatch(exec.started.at(-1)!.task, /转交/, "told once");

  let view = await service.read(work.work_id);
  assert.deepEqual(view.rounds.map(round => round.executor), ["plugin", "plugin"]);
  await assert.rejects(service.handover(work.work_id, { to: plugin }), /已经由执行方插件承担/);

  // Back to the Assistant: the plugin's rounds still belong to the work.
  view = await service.handover(work.work_id, { to: { kind: "assistant" } });
  assert.equal(view.work.executor.kind, "assistant");
  assert.deepEqual(view.rounds.map(round => round.executor), ["plugin", "plugin"]);
  // And to the plugin again: the same session, not a new one.
  const opens = exec.calls.filter(call => call.role === "session.open").length;
  view = await service.handover(work.work_id, { to: plugin });
  assert.equal((view.work.executor as { session_id: string }).session_id, sessionId);
  assert.equal(exec.calls.filter(call => call.role === "session.open").length, opens);
});

test("handing a work to a plugin carries what its documents say now, read from their owner, since the plugin cannot read them itself", async () => {
  const exec = fakeExecutor();
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const host = { adapter: () => ({ readSession: async () => ({}), read: async () => null }), reviews: { list: () => [] } };
  const reader = defineSubjectContextAction("pages.subject.read", "pages_document", "Pages", ["pages:read"]);
  const view: ActionView = { capability_id: reader.capability_id, version: reader.version, operation: reader.operation, provider: { provider_id: "io.molis.work.pages", kind: "plugin", title: "Pages" },
    action: reader.action, availability: { available: true } };
  const pages = { discover: async () => [view], invoke: async (_reference: unknown, input: unknown) => {
    assert.deepEqual(input, { subject_id: "doc-1" });
    return { subject: { kind: "pages_document", id: "doc-1" }, revision: "2", title: "calc average 需求", content: "## 错误处理\n空数组抛 RangeError" };
  } };
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => host as never, authority: async () => { throw new Error("not used"); },
    personActions: async () => exec.actions, scopeActions: async () => pages }, "web-user");
  const project_ref = PROJECT_REF;
  const work = store.create({ actor_id: "web-user", title: "calc average", scope: { kind: "project", project_id: "project" }, origin: null, project_ref });
  store.addRound(work.work_id, { run_id: "assistant-1", text: "整理成需求文档", materials: [], context: null, started_at: "2026-09-30T00:00:00.000Z" });
  store.relations.link({ work_id: work.work_id, project_id: "project" }, "result", { kind: "pages_document", id: "doc-1", revision: "2" }, "助理产出");

  await service.handover(work.work_id, { to: { kind: "plugin", plugin_id: PLUGIN }, mode: "execute" });
  await service.send({ work_id: work.work_id, text: "按文档实现", request_id: randomUUID() }, { project_ref });
  const task = exec.started.at(-1)!.task;
  assert.match(task, /相关对象的当前内容/);
  assert.match(task, /《calc average 需求》（产出，版本 2）：\n## 错误处理\n空数组抛 RangeError/);
  // The person reads their own message for that round, not the note that travelled with it.
  const shown = (await service.read(work.work_id)).rounds.at(-1)!.turns.find(turn => turn.kind === "user")!.text;
  assert.equal(shown, "按文档实现");
});


test("MEM-35 executor supplements bind personal provenance to the installed generic action's exact version; absent installation and revoked grants refuse it", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("原输入转交");
  const system = ensureSystemAgentService(home.host, home.home); await system.ready;
  const { service } = assistantServiceFor({ localHost: home.host, homeDirectory: home.home, agentHost: system.agentHost,
    agentReady: () => system.ready, projectTitle: async () => null, pages: async () => ["home"] });
  const exec = fakeExecutor(), permission = "fixture-executor:write";
  const definitions = roleDefinitions(PLUGIN, KIND, [permission]).map(definition => ({ ...definition,
    version: roleOfCapability(PLUGIN, definition.capability_id) === "run.control" ? 13 : definition.version }));
  const originals: Array<HostOfferedOriginalInput | undefined> = [];
  const handlers = definitions.map(definition => ({ ...definition, async handle(context: ActionCallContext, input: unknown) {
    if (roleOfCapability(PLUGIN, definition.capability_id) === "run.control") originals.push(context.original_input);
    return exec.respond(roleOfCapability(PLUGIN, definition.capability_id), input as Input);
  } }));
  const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: PLUGIN, version: "1.0.0", name: "样例 Agent", kind: "app",
    publisher: { publisher_id: "example", signature: "executor-original" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission, required: false, reason: "执行用户的工作" }], capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: definitions },
    async start() { return { kind: "app", actions: handlers }; } });
  const repository = await home.host.withProject(project.reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db));
  const runtime = new PluginRuntime(repository, undefined, { actions: { registry: home.host.actionRegistry(project.reference), project_id: project.project_id } });
  const installed = runtime.install({ definition: plugin, deployment: "local", grants: [permission] }).install;
  try {
    await runtime.start(installed.install_id);
    const caller = { project_ref: project.reference };
    const first = await service.send({ executor: { kind: "plugin", plugin_id: PLUGIN }, scope: { kind: "project", project_id: project.project_id },
      text: "先检查", request_id: randomUUID() }, caller);
    exec.sessions.get((first.work.executor as { session_id: string }).session_id)!.runs.at(-1)!.phase = "running";
    const send = (text: string) => {
      const request_id = randomUUID();
      const original = { input_id: request_id, text, written_by: "person" as const, occurred_at: "2026-10-24T00:00:00.000Z", install_id: ASSISTANT_INSTALL_ID };
      return { original, result: service.send({ work_id: first.work.work_id, text, request_id }, { ...caller, original_input: original }) };
    };
    const accepted = send("顺便补上测试"); await accepted.result;
    const action = definitions.find(definition => definition.capability_id.endsWith(".run.control"))!;
    const provider = (await home.host.inspectActions({ actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: [permission] }, project.reference))
      .find(view => view.capability_id === action.capability_id)!.provider;
    assert.deepEqual(originals, [{ ...accepted.original, use: "supplement", install_id: installed.install_id,
      action: { capability_id: action.capability_id, version: 13, provider_id: provider.provider_id } }]);
    assert.equal(exec.controls().at(-1)!.input.original, undefined);
    const before = exec.controls().length;
    const record = runtime.get(installed.install_id); repository.save({ ...record, grants: [] });
    await assert.rejects(send("撤权后不转交").result);
    assert.equal(exec.controls().length, before, "revocation never reaches the executor handler or records another supplement");
    repository.save(record); await runtime.stop(installed.install_id);
    // A provider can publish the same role and plugin id, but it cannot invent an installation owner.
    const withdraw = home.host.actionRegistry(project.reference).registerProvider({ provider: { provider_id: "fixture-uninstalled", plugin_id: PLUGIN,
      kind: "plugin", title: "未安装的声明", project_id: project.project_id }, definitions: definitions.map(definition => ({ ...definition,
        action: { ...definition.action, permissions: [] } })), handlers });
    try {
      await assert.rejects(send("声明角色不等于原件授权").result);
      assert.equal(exec.controls().length, before, "an uninstalled declaration gets no personal original or supplement");
      assert.equal(originals.length, 1);
    } finally { withdraw(); }
  } finally { await runtime.stop(installed.install_id); }
});

for (const role of ["run.start", "run.control"] as const) test(`AST-MEM-ARCH: a real installed executor refuses late ${role} after its Work archives`, { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("归档与执行交错"), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const system = ensureSystemAgentService(home.host, home.home); await system.ready;
  const { service, store } = assistantServiceFor({ localHost: home.host, homeDirectory: home.home, agentHost: system.agentHost,
    agentReady: () => system.ready, projectTitle: async () => null, pages: async () => ["home"] });
  const exec = fakeExecutor(), definitions = roleDefinitions(PLUGIN, KIND).map(definition => ({ ...definition,
    action: { ...definition.action, scheduling: "concurrent" as const } })); let armed = false;
  const handlers = definitions.map(definition => ({ ...definition, async handle(context: ActionExecutionContext, input: unknown) {
    if (armed && roleOfCapability(PLUGIN, definition.capability_id) === role) {
      entered.resolve(); await release.promise; await context.beforeEffect();
    }
    return exec.respond(roleOfCapability(PLUGIN, definition.capability_id), input as Input);
  } }));
  const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: PLUGIN, version: "1.0.0", name: "任意执行方", kind: "app",
    publisher: { publisher_id: "example", signature: "executor-lifecycle" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: definitions },
    async start() { return { kind: "app", actions: handlers }; } });
  const repository = await home.host.withProject(project.reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db));
  const runtime = new PluginRuntime(repository, undefined, { actions: { registry: home.host.actionRegistry(project.reference), project_id: project.project_id } });
  const installed = runtime.install({ definition: plugin, deployment: "local", grants: [] }).install;
  try {
    await runtime.start(installed.install_id);
    const caller = { project_ref: project.reference }, first = await service.send({ executor: { kind: "plugin", plugin_id: PLUGIN },
      scope: { kind: "project", project_id: project.project_id }, text: "第一轮", request_id: randomUUID() }, caller);
    assert.equal(store.get("web-user", first.work.work_id).session_id, null, "the executor's Session is never an Assistant owner");
    const session = exec.sessions.get((first.work.executor as { session_id: string }).session_id)!;
    if (role === "run.control") session.runs.at(-1)!.phase = "running";
    const rounds = store.rounds(first.work.work_id), starts = exec.started.length, controls = exec.controls().length;
    armed = true;
    const late = service.send({ work_id: first.work.work_id, text: "迟到的请求", request_id: randomUUID() }, caller);
    await entered.promise;
    if (role === "run.control") session.runs.at(-1)!.phase = "completed";
    await service.archive(first.work.work_id, await service.lifecycle.preview(first.work.work_id, true), { beforeEffect: async () => {}, assert_current: () => {} });
    release.resolve(); await assert.rejects(late, { code: "assistant.conflict" });
    assert.equal(exec.started.length, starts); assert.equal(exec.controls().length, controls);
    assert.deepEqual(store.rounds(first.work.work_id), rounds); assert.equal(store.get("web-user", first.work.work_id).archived, true);
  } finally { release.resolve(); await runtime.stop(installed.install_id); }
});
