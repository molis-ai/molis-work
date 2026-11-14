import assert from "node:assert/strict";
import test from "node:test";
import { ASSISTANT_LINE_ACTIONS, ASSISTANT_WORK_KIND, assistantLineRegistration, type AssistantLineSource } from "@molis-ai/molis-work-app-local-host";
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
    { work: base("main", "与助理的对话", 50, { main: true }), state: "running" },
    { work: base("report", "季度报告", 40), state: "completed" },
    { work: base("plan", "发布计划", 45), state: "waiting-input" },
    { work: base("errand", "查一下汇率", 46, delegated("p-1")), state: "running" },
    { work: base("tracked", "整理访谈", 47, { ...delegated("p-2"), line_event: true }), state: "waiting-review" },
    { work: base("for-plan", "补发布说明", 48, { ...delegated("p-3"), serves: [{ kind: ASSISTANT_WORK_KIND, id: "plan" }] }), state: "running" },
    { work: base("done-errand", "查了天气", 30, delegated("p-4")), state: "completed" },
    // Said by the person in a plugin event's tab (specs/work-line §4.4): a work done for that event, not an event of its own.
    { work: base("about-todo", "先问预算", 49, { serves: [{ kind: "todo_item", id: "t1" }] }), state: "running" },
  ];
  const placed: Array<{ work_id: string; to: { serves: unknown[]; line_event: boolean } }> = [], stopped: string[] = [], asked: string[] = [];
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
  };
  const registration = assistantLineRegistration(() => source);
  let effects = 0;
  const person: ActionCallContext = { actor_id: "local-person", project_id: "p1", audience: "user", permissions: [] };
  const invoke = <T>(capability: string, input: unknown, caller: ActionCallContext = person) => {
    const handler = registration.handlers.find(one => one.capability_id === capability)!;
    return handler.handle({ ...caller, beforeEffect: async () => { effects++; } } as Parameters<typeof handler.handle>[0], input) as Promise<T>;
  };
  return { registration, invoke, placed, stopped, asked, effects: () => effects };
}
const subject = (id: string) => ({ kind: ASSISTANT_WORK_KIND, id });

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
  assert.equal(harness().registration.definitions.length, Object.keys(A).length);
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

test("WLN-39: every work under way is a row of the task table with whom it serves and its stop; the conversation itself and ended works are not", async () => {
  const { invoke } = harness();
  const table = await invoke<BackgroundTaskCollection>("assistant.background.tasks", {});
  assert.deepEqual(table.tasks.map(task => [task.subject.id, task.state, task.waiting, task.serves.map(one => one.id)]), [
    ["plan", "answer", true, ["plan"]], ["errand", "running", false, []], ["tracked", "approval", true, ["tracked"]], ["for-plan", "running", false, ["plan"]], ["about-todo", "running", false, ["t1"]]]);
  for (const task of table.tasks) {
    assert.deepEqual(task.commands.map(command => [command.role, command.action.capability_id, command.input]), [["stop", "assistant.background.stop", { work_id: task.subject.id }]]);
    assert.equal(task.executor.kind, "assistant");
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

test("WLN-39: the stop on a row stops that work; a work of another project is not found and nothing is stopped", async () => {
  const { invoke, stopped } = harness();
  assert.deepEqual(await invoke("assistant.background.stop", { work_id: "errand" }), { stopped: true });
  await assert.rejects(invoke("assistant.background.stop", { work_id: "errand" }, { actor_id: "local-person", project_id: "p2", audience: "user", permissions: [] }), (error: unknown) => (error as { code?: string }).code === "assistant.not_found");
  await assert.rejects(invoke("assistant.background.stop", { work_id: "main" }), (error: unknown) => (error as { code?: string }).code === "assistant.not_found");
  assert.deepEqual(stopped, ["errand"]);
});
