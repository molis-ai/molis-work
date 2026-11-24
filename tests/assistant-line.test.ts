import assert from "node:assert/strict";
import test from "node:test";
import { ASSISTANT_LINE_ACTIONS, ASSISTANT_TASK_TABLE_ACTION, ASSISTANT_WORK_KIND, assistantLineRegistration, installHostUiText, runWithLocale, type AssistantLineSource } from "@molis-ai/molis-work-app-local-host";
import { BACKGROUND_TASKS_OUTPUT_TYPE, WORK_EVENTS_OUTPUT_TYPE, TASK_SERVES_RELATION, type ActionCallContext, type BackgroundTaskCollection, type TaskServesResult, type WorkEventCollection } from "@molis-ai/molis-work-contracts/platform/actions";
import { isWorkEventSource } from "@molis-ai/molis-work-service-mainline";

// specs/work-line §5, §6 (WLN-37, WLN-38, WLN-39): the Assistant reports its works on the line like any registrant and any
// task provider, through actions found by their types; which event a background task is done for is kept on the task.

type Works = Awaited<ReturnType<AssistantLineSource["works"]>>;
type Work = Works[number]["work"];
const at = (minute: number) => `2026-11-14T08:${String(minute).padStart(2, "0")}:00.000Z`;
const WINDOW = { from: "2026-11-14T00:00:00.000Z", to: "2026-11-15T00:00:00.000Z", now: "2026-11-14T09:00:00.000Z" };

function harness() {
  const base = (id: string, title: string, minute: number, more: Partial<Work> = {}): Work => ({ work_id: id, revision: 1, title, scope: { kind: "project", project_id: "p1" }, origin: null,
    executor: { kind: "assistant" }, session_id: `s-${id}`, draft: "", draft_revision: 1, created_at: at(0), updated_at: at(minute), archived: false, actor_id: "local-person",
    project_ref: { project_id: "p1", storage_key: "memory:p1" }, ...more });
  const delegated = (node: string) => ({ delegated_by: { graph_id: "g-main", node_id: node, title: "与助理的对话", acceptance: "完成" } });
  const works: Works = [
    { work: base("main", "", 50, { main: true }), state: "running" },
    { work: base("report", "季度报告", 40), state: "completed" },
    { work: base("plan", "发布计划", 45), state: "waiting-input" },
    { work: base("errand", "查一下汇率", 46, { ...delegated("p-1"), character: { artifact_id: "character:project:editor", version: 2, title: "严格的编辑" } }), state: "running" },
    { work: base("tracked", "整理访谈", 47, { ...delegated("p-2"), line_event: true }), state: "waiting-review",
      reviews: [{ review_id: "r1", version: "v-r1", decisions: { approve: { available: true }, reject: { available: true } }, kind: "business", run_id: "run-1", summary: "把访谈整理成三段", fields: [{ label: "标题", value: "访谈纪要" }, { label: "正文", value: "三段" }], requested_at: at(47), expires_at: null },
        { review_id: "r2", version: "v-r2", decisions: { approve: { available: true }, reject: { available: true } }, kind: "file", run_id: "run-1", summary: "改 notes.md", fields: [], requested_at: at(47), expires_at: null }] },
    { work: base("for-plan", "补发布说明", 48, { ...delegated("p-3"), serves: [{ kind: ASSISTANT_WORK_KIND, id: "plan" }] }), state: "running" },
    { work: base("done-errand", "查了天气", 30, delegated("p-4")), state: "completed" },
    // Said by the person in a plugin event's tab (specs/work-line §4.4): a work done for that event, not an event of its own.
    { work: base("about-todo", "先问预算", 49, { serves: [{ kind: "todo_item", id: "t1" }] }), state: "running" },
  ];
  const placed: Array<{ work_id: string; to: { serves: unknown[]; line_event: boolean } }> = [], stopped: string[] = [], asked: string[] = [], tables: string[] = [], decided: Array<{ work_id: string; review_id: string; version: string; decision: string; note?: string }> = [];
  const source: AssistantLineSource = {
    works: async project => { asked.push(project); return project === "p1" ? works : []; },
    place: (workId, to) => {
      placed.push({ work_id: workId, to });
      const found = works.find(one => one.work.work_id === workId)!;
      const { serves: _serves, line_event: _event, ...rest } = found.work;
      found.work = { ...rest, ...(to.serves.length ? { serves: to.serves.map(one => ({ kind: one.kind, id: one.id })) } : {}), ...(to.line_event ? { line_event: true as const } : {}) };
      return found.work;
    },
    stop: async workId => { stopped.push(workId); },
    decide: async (workId, input) => { decided.push({ work_id: workId, ...input }); },
    // The project's whole table as the person reads it: the Assistant's rows and another provider's, with what can be done to them.
    table: async project => { tables.push(project); return { issues: [{ source: { capability_id: "broken.tasks", version: 1, provider_id: "broken" }, title: "坏掉的提供方", code: "broken.secret_detail" }], tasks: [
      { id: "row-1", source: { capability_id: "coding.background.tasks", version: 1, provider_id: "coding" }, origin: { surface: "coding", title: "Coding", icon: "code" }, subject: { kind: "coding_session", id: "s1" }, title: "修登录",
        state: "running", step: { text: "跑了 3 项" }, details: [], waiting: false, updated_at: at(48), executor: { kind: "plugin", label: "Coding" }, serves: [{ kind: "coding_session", id: "s1" }], scope: "project",
        commands: [{ role: "stop", action: { capability_id: "coding.background.stop", version: 1, provider_id: "coding" }, input: { session_id: "s1", task_id: "t1" }, summary: "停止 dev server" }], decisions: [], open: null },
      { id: "row-2", source: { capability_id: "assistant.background.tasks", version: 1, provider_id: "system.assistant.rules" }, origin: { surface: "assistant", title: "助理", icon: "assistant" }, subject: subject("tracked"), title: "整理访谈",
        state: "approval", details: [], waiting: true, updated_at: at(47), executor: { kind: "assistant", label: "助理" }, serves: [subject("tracked")], scope: "project", commands: [],
        decisions: [{ id: "r1", ask: "把访谈整理成三段", changes: [{ label: "标题", value: "访谈纪要" }], answers: [{ role: "approve", action: { capability_id: "assistant.background.decide", version: 1, provider_id: "system.assistant.rules" }, input: { work_id: "tracked", review_id: "r1", version: "v-r1", decision: "approve" }, summary: "同意" }] }], open: null }] }; },
  };
  const registration = assistantLineRegistration(() => source);
  let effects = 0;
  const person: ActionCallContext = { actor_id: "local-person", project_id: "p1", audience: "user", permissions: [] };
  const invoke = <T>(capability: string, input: unknown, caller: ActionCallContext = person) => {
    const handler = registration.handlers.find(one => one.capability_id === capability)!;
    return handler.handle({ ...caller, beforeEffect: async () => { effects++; } } as Parameters<typeof handler.handle>[0], input) as Promise<T>;
  };
  return { registration, invoke, placed, stopped, asked, decided, tables, effects: () => effects };
}
const subject = (id: string) => ({ kind: ASSISTANT_WORK_KIND, id });
installHostUiText();

// Text on the line and in the table is said in the reader's language when it is read; nothing of it is kept (AGENTS.md 界面文字).
test("WLN-37 WLN-39: the Assistant's events and task rows are worded in the reader's language", async () => {
  const { invoke } = harness();
  const read = (locale: "zh" | "en") => runWithLocale(locale, async () => ({
    events: await invoke<WorkEventCollection>(ASSISTANT_LINE_ACTIONS.events.capability_id, WINDOW),
    tasks: await invoke<BackgroundTaskCollection>(ASSISTANT_LINE_ACTIONS.tasks.capability_id, {}),
  }));
  const zh = await read("zh"), en = await read("en");
  assert.equal(zh.events.source.title, "助理"); assert.equal(en.events.source.title, "Assistant");
  const step = (answer: typeof en, id: string) => answer.tasks.tasks.find(task => task.subject.id === id)!;
  assert.equal(step(zh, "errand").step?.text, "正在办"); assert.equal(step(en, "errand").step?.text, "Working on it");
  assert.equal(step(en, "tracked").decisions[0]!.why, "This step changes content, so it asks you first, as you set it");
  assert.equal(step(en, "errand").commands[0]!.summary, "Stop “查一下汇率”", "the person's own words stay as written");
  const text = JSON.stringify(en);
  for (const own of ["查一下汇率", "整理访谈", "季度报告", "发布计划", "补发布说明", "先问预算", "把访谈整理成三段", "访谈纪要", "三段", "改 notes.md", "标题", "正文", "严格的编辑"]) assert.ok(text.includes(own) || !own, own);
  assert.doesNotMatch(text.replace(/查一下汇率|整理访谈|季度报告|发布计划|补发布说明|先问预算|把访谈整理成三段|访谈纪要|三段|改 notes\.md|标题|正文|严格的编辑|查了天气/g, ""), /[\u4e00-\u9fff]/, "nothing the Host words is left in Chinese");
});

test("WLN-37: the Assistant registers its events and tasks by the same typed actions as any plugin, on its own provider", () => {
  const A = ASSISTANT_LINE_ACTIONS;
  assert.equal(A.events.action.output_type, WORK_EVENTS_OUTPUT_TYPE);
  assert.ok(isWorkEventSource({ ...A.events, provider: { provider_id: A.events.provider_id!, title: "助理", kind: "system" } } as Parameters<typeof isWorkEventSource>[0]), "found by the event registry's two types");
  assert.equal(A.tasks.action.output_type, BACKGROUND_TASKS_OUTPUT_TYPE);
  assert.equal(A.tasks.action.home_aggregate, true);
  assert.deepEqual(A.tasks.action.audiences, ["user"], "S-49: a task table answers the person only");
  assert.deepEqual([A.servesList, A.servesBind, A.servesRelease, A.servesCreate].map(one => [one.action.placement_relation?.relation, one.action.placement_relation?.role]),
    [[TASK_SERVES_RELATION, "list"], [TASK_SERVES_RELATION, "bind"], [TASK_SERVES_RELATION, "release"], [TASK_SERVES_RELATION, "create"]]);
  for (const one of Object.values(A)) assert.deepEqual(one.action.subject_kinds, [ASSISTANT_WORK_KIND]);
  assert.equal(harness().registration.definitions.length, Object.keys(A).length + 1, "and the reading copy of the task table for its own Agent");
});

test("WLN-37 WLN-38: a work the person started and a background task registered as an event are events; the main conversation and a passing errand are not", async () => {
  const { invoke } = harness();
  const answer = await invoke<WorkEventCollection>("assistant.events", WINDOW);
  assert.equal(answer.source.surface, "assistant");
  assert.deepEqual(answer.events.map(event => [event.subject.id, event.placement, event.state, event.needs_attention]),
    [["plan", "active", "answer", false], ["tracked", "active", "approval", false], ["report", "occurred", "done", false]]);
  // Outside the window an ended work is not told; what is under way always is.
  const later = await invoke<WorkEventCollection>("assistant.events", { from: "2026-11-15T00:00:00.000Z", to: "2026-11-16T00:00:00.000Z", now: "2026-11-15T09:00:00.000Z" });
  assert.deepEqual(later.events.map(event => event.subject.id), ["plan", "tracked"]);
});

// PWA-138: task rows are the real works, with the owner's own controls.
test("WLN-39: every work under way is a row of the task table with whom it serves and its stop; the conversation itself and ended works are not", async () => {
  const { invoke } = harness();
  const table = await invoke<BackgroundTaskCollection>("assistant.background.tasks", {});
  assert.deepEqual(table.tasks.map(task => [task.subject.id, task.state, task.waiting, task.serves.map(one => one.id)]), [
    ["plan", "answer", true, ["plan"]], ["errand", "running", false, []], ["tracked", "approval", true, ["tracked"]], ["for-plan", "running", false, ["plan"]], ["about-todo", "running", false, ["t1"]]]);
  for (const task of table.tasks) {
    assert.deepEqual(task.commands.map(command => [command.role, command.action.capability_id, command.input]), [["stop", "assistant.background.stop", { work_id: task.subject.id }]]);
    // WLN-40: a task a Character carries says so; the rest are the Assistant's.
    assert.deepEqual(task.executor, task.subject.id === "errand" ? { kind: "character", label: "严格的编辑" } : { kind: "assistant", label: "助理" });
  }
});

test("WLN-34 WLN-38: which event a task is done for is kept on the task; a work that is an event itself, another project's task and an unknown one are refused and nothing is written", async () => {
  const { invoke, placed, effects } = harness();
  assert.deepEqual(await invoke<TaskServesResult>("assistant.serves.list", { task: subject("for-plan") }), { serves: [subject("plan")] });
  assert.deepEqual(await invoke<TaskServesResult>("assistant.serves.bind", { task: subject("errand"), event: { kind: "todo_item", id: "t1" } }), { serves: [{ kind: "todo_item", id: "t1" }] });
  assert.deepEqual(await invoke<TaskServesResult>("assistant.serves.create", { task: subject("errand") }), { serves: [subject("errand")] });
  assert.deepEqual(await invoke<TaskServesResult>("assistant.serves.release", { task: subject("errand") }), { serves: [] });
  // A work said in an event's tab can be taken off its event by registering it: it then stands on the line as its own event.
  assert.deepEqual(await invoke<TaskServesResult>("assistant.serves.create", { task: subject("about-todo") }), { serves: [subject("about-todo")] });
  // …and, an event itself now, it can be hung on another event again: a task behind that one.
  assert.deepEqual(await invoke<TaskServesResult>("assistant.serves.bind", { task: subject("about-todo"), event: { kind: "todo_item", id: "t1" } }), { serves: [{ kind: "todo_item", id: "t1" }] });
  assert.equal(placed.length, 5);
  const before = effects();
  // It cannot belong to no event at all: only a task the Assistant sent out can.
  await assert.rejects(invoke("assistant.serves.release", { task: subject("about-todo") }), (error: unknown) => (error as { code?: string }).code === "assistant.invalid");
  // The refusals: each is checked before the effect gate, and writes nothing.
  await assert.rejects(invoke("assistant.serves.release", { task: subject("plan") }), (error: unknown) => (error as { code?: string }).code === "assistant.invalid");
  await assert.rejects(invoke("assistant.serves.bind", { task: subject("errand"), event: subject("errand") }), (error: unknown) => (error as { code?: string }).code === "assistant.invalid");
  await assert.rejects(invoke("assistant.serves.bind", { task: subject("main"), event: subject("plan") }), (error: unknown) => (error as { code?: string }).code === "assistant.not_found");
  await assert.rejects(invoke("assistant.serves.list", { task: subject("nowhere") }), (error: unknown) => (error as { code?: string }).code === "assistant.not_found");
  await assert.rejects(invoke("assistant.serves.list", { task: { kind: "coding_session", id: "errand" } }), (error: unknown) => (error as { code?: string }).code === "assistant.not_found");
  const elsewhere: ActionCallContext = { actor_id: "local-person", project_id: "p2", audience: "user", permissions: [] };
  await assert.rejects(invoke("assistant.serves.release", { task: subject("errand") }, elsewhere), (error: unknown) => (error as { code?: string }).code === "assistant.not_found");
  await assert.rejects(invoke("assistant.events", WINDOW, { ...elsewhere, project_id: null }), (error: unknown) => (error as { code?: string }).code === "assistant.scope");
  assert.equal(placed.length, 5, "a refused call keeps nothing");
  assert.equal(effects(), before, "and passes no effect gate");
});

// PWA-134: a row's stop stops that work only.
test("WLN-39: the stop on a row stops that work; a work of another project is not found and nothing is stopped", async () => {
  const { invoke, stopped } = harness();
  assert.deepEqual(await invoke("assistant.background.stop", { work_id: "errand" }), { stopped: true });
  await assert.rejects(invoke("assistant.background.stop", { work_id: "errand" }, { actor_id: "local-person", project_id: "p2", audience: "user", permissions: [] }), (error: unknown) => (error as { code?: string }).code === "assistant.not_found");
  await assert.rejects(invoke("assistant.background.stop", { work_id: "main" }), (error: unknown) => (error as { code?: string }).code === "assistant.not_found");
  assert.deepEqual(stopped, ["errand"]);
});

test("WLN-10, PWA-135: a work that waits on a confirmation lists each held effect as a decision of its row, by the review's own id; an answer reaches that effect of the caller's own work only, and a work of another project or the conversation itself is refused with nothing recorded", async () => {
  const { invoke, decided, effects } = harness();
  const tasks = (await invoke<BackgroundTaskCollection>("assistant.background.tasks", {})).tasks;
  const tracked = tasks.find(task => task.subject.id === "tracked")!;
  assert.deepEqual(tracked.decisions.map(one => [one.id, one.ask, one.changes, one.answers.map(answer => [answer.role, answer.action.capability_id, answer.input])]), [
    ["r1", "把访谈整理成三段", [{ label: "标题", value: "访谈纪要" }, { label: "正文", value: "三段" }], [["approve", "assistant.background.decide", { work_id: "tracked", review_id: "r1", version: "v-r1", decision: "approve" }],
      ["revise", "assistant.background.decide", { work_id: "tracked", review_id: "r1", version: "v-r1", decision: "reject" }], ["reject", "assistant.background.decide", { work_id: "tracked", review_id: "r1", version: "v-r1", decision: "reject" }]]],
    ["r2", "改 notes.md", [], [["approve", "assistant.background.decide", { work_id: "tracked", review_id: "r2", version: "v-r2", decision: "approve" }],
      ["revise", "assistant.background.decide", { work_id: "tracked", review_id: "r2", version: "v-r2", decision: "reject" }], ["reject", "assistant.background.decide", { work_id: "tracked", review_id: "r2", version: "v-r2", decision: "reject" }]]]]);
  assert.ok(tasks.filter(task => task.subject.id !== "tracked").every(task => task.decisions.length === 0), "a work that waits on nothing held asks nothing");
  assert.deepEqual(ASSISTANT_LINE_ACTIONS.decide.action.audiences, ["user"], "only the person answers");

  const before = effects();
  assert.deepEqual(await invoke("assistant.background.decide", { work_id: "tracked", review_id: "r1", version: "v-r1", decision: "approve" }), { decided: "approve" });
  assert.deepEqual(await invoke("assistant.background.decide", { work_id: "tracked", review_id: "r2", version: "v-r2", decision: "reject", note: "别动这个文件" }), { decided: "reject" });
  assert.equal(effects(), before + 2, "each answer passes beforeEffect");
  const missing = (error: unknown) => (error as { code?: string }).code === "assistant.not_found";
  await assert.rejects(invoke("assistant.background.decide", { work_id: "tracked", review_id: "r1", version: "v-r1", decision: "approve" }, { actor_id: "local-person", project_id: "p2", audience: "user", permissions: [] }), missing);
  await assert.rejects(invoke("assistant.background.decide", { work_id: "main", review_id: "r1", version: "v-r1", decision: "approve" }), missing);
  await assert.rejects(invoke("assistant.background.decide", { work_id: "nope", review_id: "r1", version: "v-r1", decision: "approve" }), missing);
  assert.deepEqual(decided, [{ work_id: "tracked", review_id: "r1", version: "v-r1", decision: "approve" }, { work_id: "tracked", review_id: "r2", version: "v-r2", decision: "reject", note: "别动这个文件" }]);
});

test("S-49 WLN-39: the Assistant's own round reads its project's task table as a copy with no command and no answer in it; another Agent, a call a plugin handed on, a workflow, an MCP client, the page and a personal round are refused and the table is not read", async () => {
  const { invoke, tables } = harness();
  const T = ASSISTANT_TASK_TABLE_ACTION;
  assert.deepEqual([T.action.audiences, T.action.kind, T.action.effect, T.action.scope], [["agent"], "query", "read", "project"], "offered to Agents only, a read, in a project");
  const round = (more: Partial<ActionCallContext> = {}): ActionCallContext => ({ actor_id: "local-person", actor_kind: "runtime", project_id: "p1", audience: "agent", permissions: [], skill_round: { consumer: "assistant", named: [] }, ...more });
  const table = await invoke<{ tasks: Array<Record<string, unknown>>; unreadable: string[] }>(T.capability_id, {}, round());
  assert.deepEqual(table, { unreadable: ["坏掉的提供方"], tasks: [
    { subject: { kind: "coding_session", id: "s1" }, title: "修登录", state: "running", step: "跑了 3 项", waiting: false, who: "Coding", from: "Coding", serves: [{ kind: "coding_session", id: "s1" }], asks: [], updated_at: at(48) },
    { subject: subject("tracked"), title: "整理访谈", state: "approval", waiting: true, who: "助理", from: "助理", serves: [subject("tracked")], asks: ["把访谈整理成三段"], updated_at: at(47) }] });
  const copy = JSON.stringify(table);
  for (const kept of ["commands", "decisions", "answers", "coding.background.stop", "assistant.background.decide", "review_id", "task_id", "broken.secret_detail", "source"]) assert.ok(!copy.includes(kept), `the copy carries no ${kept}`);
  assert.deepEqual(tables, ["p1"], "read once, in the round's own project");

  const refused = (error: unknown) => ["assistant.scope"].includes((error as { code?: string }).code ?? "");
  for (const [why, caller] of [
    ["another plugin's Agent", round({ skill_round: { consumer: "coding", named: [] } })], ["an Agent that is not the Assistant's round", round({ skill_round: { consumer: "agent", named: [] } })],
    ["an Agent call with no round", round({ skill_round: undefined })], ["a call a plugin handed on", round({ host_plugin: { plugin_id: "x", install_id: "i", project_id: "p1" } as never })],
    ["a delegated call", round({ delegated_by: "someone" as never })], ["a workflow", round({ audience: "workflow" })], ["an MCP client", round({ audience: "mcp" })], ["the page", round({ audience: "user" })],
    ["a personal round, which has no project", round({ project_id: null })]] as const) await assert.rejects(invoke(T.capability_id, {}, caller as ActionCallContext), refused, why);
  assert.deepEqual(tables, ["p1"], "no refused call read the table");
});

test("the Host's entries read one state table: resume, hand over, follow up, archive, notify and count a work agree for all ten states", async () => {
  const { ASSISTANT_WORK_STATE_TRAITS, assistantAsksPerson, assistantRoundOpen, assistantStateResumes, assistantStateUnknown, assistantUnderWay, assistantWaitsOnPerson } = await import("@molis-ai/molis-work-contracts/services/assistant");
  const states = Object.keys(ASSISTANT_WORK_STATE_TRAITS);
  assert.deepEqual(states.toSorted(), ["completed", "failed", "idle", "needs-check", "paused", "running", "stopped", "unreadable", "waiting-input", "waiting-review"]);
  const which = (predicate: (state: string) => boolean) => states.filter(predicate).toSorted();
  // Restart takes up a round that was running or stopped on the person (continuations), not a paused or unchecked one.
  assert.deepEqual(which(assistantStateResumes), ["running", "waiting-input", "waiting-review"]);
  // A scheduled follow-up is skipped as busy, a hand-over refused and a 「completed」 notice raised from, an open round.
  assert.deepEqual(which(assistantRoundOpen), ["paused", "running", "waiting-input", "waiting-review"]);
  // Archive refuses, the line shows active and the task table lists what is under way; the person still owes a check of needs-check,
  // and a state that could not be read is not taken for settled.
  assert.deepEqual(which(assistantUnderWay), ["needs-check", "paused", "running", "unreadable", "waiting-input", "waiting-review"]);
  // Only a failed read is unknown: it is no check the person owes, and a follow-up, a hand-over and archive wait for a real state.
  assert.deepEqual(which(assistantStateUnknown), ["unreadable"]);
  assert.deepEqual(which(assistantWaitsOnPerson), ["needs-check", "waiting-input", "waiting-review"]);
  // A decision notice stays up, and a delegated work reaches the person, only while the round asks them something.
  assert.deepEqual(which(assistantAsksPerson), ["waiting-input", "waiting-review"]);
  for (const unknown of ["", "archived", "__proto__", null, undefined]) {
    assert.equal([assistantStateResumes, assistantRoundOpen, assistantUnderWay, assistantWaitsOnPerson, assistantAsksPerson, assistantStateUnknown].some(read => read(unknown)), false, `${String(unknown)} is no state`);
  }
});
