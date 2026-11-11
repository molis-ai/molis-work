// PWA-148, PWA-149, PWA-151, PWA-152 (batch 18 P2, plugin side; specs/proactive-assistant/schedule-task-reads.md §3.2, §3.6): the read
// groups the five plugins declare, and Schedule's use of the platform's task grants (`agent.task_grants.list` and `.clear`). The Host
// side (registering the three actions, the grant subject of a plugin's round, S-108) is tested with the Host. Here the platform
// answers through a fake action client, so nothing below depends on how the Host keeps a grant.
import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { openTestSqlite, type SqliteDatabase } from "@molis-ai/molis-work-test-kit/sqlite";
import { actionEffect, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginJobControl, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentTaskGrantActions, TASK_GRANT_SUBJECT_KEY_PATTERN, type TaskGrantListResult, type TaskGrantSubject } from "@molis-ai/molis-work-contracts/services/agent-task-grants";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { todoManifest } from "@molis-ai/molis-work-plugin-todo";
import { inboxManifest } from "@molis-ai/molis-work-plugin-inbox";
import { goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { jellyManifest } from "@molis-ai/molis-work-plugin-jelly";
import {
  SCHEDULE_BRIEF_ROLE, SCHEDULE_PROJECT_DATABASE, SCHEDULE_READER_ROLE, SCHEDULE_TASK_GRANT_ACTIONS, createScheduleActionHandlers, createScheduleConversationTask,
  createSchedulePlugin, createScheduleRouteHandlers, createScheduleTaskGrants, getScheduleConversationTask, handleScheduleTaskWakeup, roundRole, scheduleActions, scheduleAgentManifest,
  scheduleManifest, schedulePrompts, scheduledTaskRunner, scheduleTaskReads, type ScheduleActionPorts,
} from "@molis-ai/molis-work-plugin-schedule";
import { memoryPluginDatabase } from "./fixtures/plugin-database.js";
import { SchedulePluginRouteTable } from "./schedule-direct-actions.js";

const MANIFESTS: Record<string, PluginManifest> = { todo: todoManifest, inbox: inboxManifest, goals: goalsManifest, jelly: jellyManifest, schedule: scheduleManifest };

/** The read groups by plugin, as the batch decided them (§3.2, 2026-11-05): 日程 is Jelly's calendar and Schedule's reminders, not notes. */
const EXPECTED: Record<string, Record<string, string>> = {
  todo: { todo: "待办" }, inbox: { inbox: "来信" }, goals: { goals: "目标" },
  jelly: { calendar: "日历", notes: "笔记" }, schedule: { reminders: "提醒", operations: "定时操作" },
};

test("PWA-148 the five plugins declare their read groups, and each Manifest is accepted as it is read", () => {
  for (const [name, manifest] of Object.entries(MANIFESTS)) {
    const groups = manifest.read_groups ?? [];
    assert.deepEqual(Object.fromEntries(groups.map(group => [group.group_id, group.title])), EXPECTED[name], `${name}'s groups`);
    // The SDK's checks run when the Manifest is read: only the plugin's own agent-audience read-only queries, each in one group.
    assert.deepEqual(parsePluginManifest(JSON.parse(JSON.stringify(manifest))).read_groups, groups, `${name} parses with its groups`);
    for (const group of groups) {
      assert.ok(group.description.trim(), `${name}/${group.group_id} says what it contains`);
      for (const id of group.actions) {
        for (const action of (manifest.actions ?? []).filter(item => item.capability_id === id)) {
          assert.ok(action.action.audiences.includes("agent") && action.operation === "query" && actionEffect(action.action, id) === "read", `${id} reads only`);
        }
      }
    }
  }
});

test("PWA-148 日程 is Jelly's calendar and Schedule's reminders: notes and exports, and other plugins' scheduled operations, are switches of their own", () => {
  const jelly = new Map(jellyManifest.read_groups!.map(group => [group.group_id, group.actions]));
  assert.deepEqual([...jelly.get("calendar")!].sort(), ["jelly.calendar.list", "jelly.calendar.progress", "jelly.item.get"]);
  for (const id of ["jelly.search", "jelly.note.export", "jelly.workspace.export", "jelly.workspace.get"]) {
    assert.ok(jelly.get("notes")!.includes(id), `${id} is a note read`);
    assert.ok(!jelly.get("calendar")!.includes(id), `and not in the calendar`);
  }
  // `schedule.tasks.list` carries other plugins' scheduled operations with their original input: it is not part of 日程.
  const schedule = new Map(scheduleManifest.read_groups!.map(group => [group.group_id, group.actions]));
  assert.ok(schedule.get("operations")!.includes(scheduleActions.list.capability_id));
  // A subject granted 提醒 is given exactly the reminders query: not the task list, its search, or a subject read.
  assert.deepEqual(schedule.get("reminders"), [scheduleActions.reminders.capability_id]);
  for (const id of [scheduleActions.list.capability_id, scheduleActions.searchEntries.capability_id, scheduleActions.subject.capability_id]) {
    assert.ok(!schedule.get("reminders")!.includes(id), `${id} is not read through 提醒`);
  }
  const reminders = scheduleManifest.actions!.find(action => action.capability_id === scheduleActions.reminders.capability_id)!;
  assert.equal(reminders.operation, "query");
  assert.ok(reminders.action.audiences.includes("agent"));
  assert.deepEqual(reminders.action.audiences, scheduleActions.list.action.audiences, "offered to the same callers as the task list");
  assert.equal(actionEffect(reminders.action, reminders.capability_id), "read");
});

test("PWA-148 the reminders query returns this project's reminders only, never another plugin's scheduled operation or its input", async () => {
  const job = (job_id: string, extra: Record<string, unknown> = {}) => ({ job_id, plugin_id: "io.molis.work.todo", capability_id: "todo.reminders.wake",
    object_ref: `secret-ref-${job_id}`, title: `title-${job_id}`, next_due_at: "2026-11-06T09:00:00.000Z", enabled: true, created_at: "c", updated_at: "u", ...extra });
  const reminder = { text: "交周报", plugin_id: "io.molis.work.todo", plugin_title: "待办", needs_confirmation: false,
    installation: { installation_id: "inst-secret", generation: "g", title: "待办", version: "1", publisher: "p" } };
  const unused = () => { throw new Error("unused"); };
  const ports: ScheduleActionPorts = { listJobs: () => [job("j-reminder", { reminder }), job("j-wakeup")] as never, listTasks: () => [],
    listOperations: () => [{ id: "op1", input: { token: "operation-input-secret" } }] as never, setEnabled: unused, recoverReminder: unused,
    createTask: unused, updateTask: unused, archiveTask: unused, setTaskEnabled: unused, openTask: unused };
  const handler = createScheduleActionHandlers("p1", ports).find(item => item.capability_id === scheduleActions.reminders.capability_id)!;
  const call = (project_id: string) => handler.handle({ actor_id: "agent", project_id, audience: "agent", permissions: ["schedule:read"] } as never, {});
  const output = await call("p1");
  assert.deepEqual(output, { reminders: [{ job_id: "j-reminder", text: "交周报", plugin_id: "io.molis.work.todo", plugin_title: "待办",
    next_due_at: "2026-11-06T09:00:00.000Z", enabled: true, needs_confirmation: false }] });
  for (const leak of ["operation-input-secret", "secret-ref", "inst-secret", "j-wakeup", "todo.reminders.wake"]) assert.ok(!JSON.stringify(output).includes(leak), `${leak} stays out`);
  await assert.rejects(Promise.resolve().then(() => call("p2")), { code: "actions.scope_mismatch" }, "another project's reminders are not read");
});

test("PWA-148 every group's words have their English in the plugin's own translations", () => {
  for (const [name, manifest] of Object.entries(MANIFESTS)) {
    const english = manifest.ui?.translations ?? {};
    for (const group of manifest.read_groups ?? []) {
      for (const words of [group.title, group.description]) assert.ok(english[words]?.trim(), `${name}: 「${words}」 has its English`);
    }
  }
});

test("Schedule consumes only the platform's list and clear of its tasks' grants; setting one is the person's alone", () => {
  const consumed = new Set(scheduleManifest.capabilities.consumes);
  assert.deepEqual(SCHEDULE_TASK_GRANT_ACTIONS.map(action => action.capability_id), [agentTaskGrantActions.list.capability_id, agentTaskGrantActions.clear.capability_id]);
  for (const action of SCHEDULE_TASK_GRANT_ACTIONS) assert.ok(consumed.has(action.capability_id), `${action.capability_id} is consumed`);
  assert.ok(!consumed.has(agentTaskGrantActions.set.capability_id), "the plugin never asks to write a grant");
  // A task's id is its subject key: the shape the platform accepts.
  const db = scheduleDatabase();
  const task = createScheduleConversationTask(db, { title: "晨报", instructions: "读", hour: 8, minute: 0, notify_important: true });
  assert.match(task.task_id, new RegExp(TASK_GRANT_SUBJECT_KEY_PATTERN));
});

test("TGA-23 Schedule declares its task grant subjects as its conversation tasks, a kind its own search entries list for the person", () => {
  // The grants page names a task by `task_subjects.kind` through this Manifest's own search source (task-grants-platform-area.md §5.1).
  assert.deepEqual(scheduleManifest.task_subjects, { kind: "schedule_task" });
  assert.deepEqual(parsePluginManifest(JSON.parse(JSON.stringify(scheduleManifest))).task_subjects, { kind: "schedule_task" }, "the SDK's checks accept it as read");
  const sources = (scheduleManifest.actions ?? []).filter(action => action.action.search_source?.kinds.some(kind => kind.kind === "schedule_task"));
  assert.deepEqual(sources.map(action => action.capability_id), [scheduleActions.searchEntries.capability_id], "the one source is the search entries Schedule already had");
  assert.ok(sources[0]!.action.audiences.includes("user"), "open to the person, as whom the title is read");
});

test("PWA-149 the brief role reads business data only: no directory, no host tools, read-only; the reader role is as it was", () => {
  const roles = new Map(scheduleAgentManifest.roles.map(role => [role.role_id, role]));
  assert.deepEqual(roles.get(SCHEDULE_BRIEF_ROLE), { role_id: "brief", version: 1, name: "读数据执行", execution: "read-only", workspace: "business", prompts: ["schedule-base", "schedule-brief"], host_tools: [] });
  assert.deepEqual(roles.get(SCHEDULE_READER_ROLE), { role_id: "reader", version: 1, name: "只读执行", execution: "read-only", prompts: ["schedule-base", "schedule-reader"], host_tools: ["read-file", "search"] });
  const body = (id: string) => schedulePrompts.find(prompt => prompt.prompt_id === id)!.body;
  const mark = body("schedule-reader").split("\n").find(line => line.includes("IMPORTANT"))!;
  assert.ok(body("schedule-brief").split("\n").includes(mark), "the brief keeps the first-line IMPORTANT mark in the same words");
  assert.match(body("schedule-brief"), /读不到/, "and says plainly what it could not read");
  // Batch 02 (N27, N29): a prompt names no action id and no version; the Agent finds what it may read in the catalog.
  for (const prompt of schedulePrompts) {
    assert.doesNotMatch(prompt.body, /\b[a-z][a-z_-]*(?:\.[a-z][a-z_-]*)+\b/u, `${prompt.prompt_id} names no action id`);
    assert.doesNotMatch(prompt.body, /@\d|\.v\d/u, `${prompt.prompt_id} names no version`);
  }
});

const subject = (key: string, statuses: TaskGrantSubject["categories"][number]["status"][]): TaskGrantSubject => ({
  plugin_install_id: "install-schedule", key, revision: "r1",
  categories: statuses.map((status, index) => ({ provider_id: `provider-${index}`, title: "类", description: "说明", status })),
});

test("PWA-149 a task with categories runs brief under its own subject; one without, or with none left, reads project files", () => {
  assert.deepEqual(roundRole(subject("sct_a", ["granted"])), { role_id: "brief", grant_subject: "sct_a" });
  assert.deepEqual(roundRole(subject("sct_a", ["needs_confirmation", "removed"])), { role_id: "brief", grant_subject: "sct_a" },
    "a task the person let read data still runs as one, and says what it could not read");
  assert.deepEqual(roundRole(subject("sct_a", [])), { role_id: "reader" });
  assert.deepEqual(roundRole(undefined), { role_id: "reader" });
});

/** The platform as Schedule sees it: whatever `list` answers, every call recorded, and `clear` refused while `refuse` says so. */
function platform(subjects: TaskGrantSubject[] = []) {
  const calls: Array<{ capability_id: string; input: unknown }> = [];
  const state = { refuse: false, listFails: false };
  const actions = {
    invoke: async <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input): Promise<Output> => {
      calls.push({ capability_id: definition.capability_id, input });
      // The definitions are the contract's own objects: nothing here names an action version.
      if (definition === (agentTaskGrantActions.list as unknown)) {
        if (state.listFails) throw new Error("平台暂时不可用");
        return { categories: [], subjects } satisfies TaskGrantListResult as Output;
      }
      if (definition === (agentTaskGrantActions.clear as unknown)) {
        if (state.refuse) throw new Error("平台暂时不可用");
        const key = (input as { key: string }).key, index = subjects.findIndex(item => item.key === key);
        if (index >= 0) subjects.splice(index, 1);
        return { cleared: index >= 0 } as Output;
      }
      throw new Error(`unexpected ${definition.capability_id}`);
    },
  };
  return { actions, calls, state, subjects, cleared: () => calls.filter(call => call.capability_id === agentTaskGrantActions.clear.capability_id).map(call => (call.input as { key: string }).key) };
}

function scheduleDatabase() {
  const db = openTestSqlite(":memory:");
  db.exec(SCHEDULE_PROJECT_DATABASE.schema);
  return db;
}

test("PWA-149 a due round asks the platform once and starts the role its grants choose, with the task's key as the subject", async () => {
  const db = scheduleDatabase(), fake = platform([subject("sct_other", ["granted"])]);
  const grants = createScheduleTaskGrants(fake.actions);
  const runs: unknown[] = [];
  const agents = { run: async (input: unknown) => { runs.push(input); return { text: "IMPORTANT: no\n今天没有到期的待办。", session: { session_id: "s", runtime_id: "r" }, run: { run_id: "r1" } } as never; } };
  const files = createScheduleConversationTask(db, { title: "读文件", instructions: "看看项目", hour: 8, minute: 0, notify_important: true });
  const data = createScheduleConversationTask(db, { title: "晨报", instructions: "列出到期待办", hour: 8, minute: 0, notify_important: true });
  fake.subjects.push(subject(data.task_id, ["granted", "needs_confirmation"]));
  await handleScheduleTaskWakeup(db, files.task_id, scheduledTaskRunner(agents, grants));
  await handleScheduleTaskWakeup(db, data.task_id, scheduledTaskRunner(agents, grants));
  assert.deepEqual(runs.map(run => { const { role_id, grant_subject, title } = run as Record<string, unknown>; return { role_id, grant_subject, title }; }), [
    { role_id: "reader", grant_subject: undefined, title: "读文件" },
    { role_id: "brief", grant_subject: data.task_id, title: "晨报" },
  ]);
  assert.equal(fake.calls.length, 2, "one list per round, not one per task or per category");
  // Turns written in the same millisecond keep no order between them, so each is found by its kind.
  const turnsOf = (kind: string) => getScheduleConversationTask(db, data.task_id)!.turns.filter(turn => turn.kind === kind).map(turn => turn.text);
  assert.deepEqual(turnsOf("assistant"), ["今天没有到期的待办。"]);
  // A failed read fails the round and the task says so; it does not fall back to reading files.
  fake.state.listFails = true;
  await assert.rejects(handleScheduleTaskWakeup(db, data.task_id, scheduledTaskRunner(agents, grants)), /平台暂时不可用/);
  assert.equal(runs.length, 2, "no round started");
  assert.ok(turnsOf("system").some(text => /这一轮没跑成：平台暂时不可用/.test(text)), turnsOf("system").join(" / "));
  // N0705: the failed round consumed nothing, so the platform answering again lets the next due round run.
  fake.state.listFails = false;
  await handleScheduleTaskWakeup(db, data.task_id, scheduledTaskRunner(agents, grants));
  assert.equal(runs.length, 3, "the next due round runs once the platform answers again");
});

/** Schedule's own task actions over a library, with `archived` going to the platform as the Runtime binds it. */
function taskHandlers(db: SqliteDatabase, grants: ReturnType<typeof createScheduleTaskGrants>) {
  const unused = () => { throw new Error("unused"); };
  const ports: ScheduleActionPorts = { listJobs: () => [], setEnabled: unused, recoverReminder: unused, listTasks: () => [], createTask: unused, updateTask: unused, setTaskEnabled: unused, openTask: unused,
    archiveTask: taskId => { db.prepare("UPDATE schedule_conversation_tasks SET archived = 1, enabled = 0 WHERE task_id = ?").run(taskId); },
    archived: taskId => grants.archived(taskId) };
  const archive = createScheduleActionHandlers("p1", ports).find(handler => handler.capability_id === scheduleActions.archiveTask.capability_id)!;
  return (taskId: string) => archive.handle({ actor_id: "person", project_id: "p1", audience: "user", permissions: [], beforeEffect: async () => {} }, { task_id: taskId });
}

test("PWA-151 archiving a task clears its grants; a clear the platform refused leaves the archive done and is tried again by the reconcile job", async () => {
  const db = scheduleDatabase();
  const a = createScheduleConversationTask(db, { title: "A", instructions: "读", hour: 8, minute: 0, notify_important: true });
  const b = createScheduleConversationTask(db, { title: "B", instructions: "读", hour: 9, minute: 0, notify_important: true });
  const fake = platform([subject(a.task_id, ["granted"]), subject(b.task_id, ["granted"])]);
  const grants = createScheduleTaskGrants(fake.actions), archive = taskHandlers(db, grants);
  assert.deepEqual(await archive(a.task_id), { archived: true });
  assert.deepEqual(fake.cleared(), [a.task_id], "the archived task's subject is cleared, after the archive");
  fake.state.refuse = true;
  assert.deepEqual(await archive(b.task_id), { archived: true }, "the archive stands when the platform refuses the clear");
  assert.equal(getScheduleConversationTask(db, b.task_id)!.archived, true);
  fake.state.refuse = false;
  const live = new Set<string>();
  assert.equal(await grants.reconcile(() => live), true);
  assert.deepEqual(fake.cleared(), [a.task_id, b.task_id, b.task_id], "the reconcile job clears what the archive could not");
  assert.deepEqual(fake.subjects, []);
});

test("PWA-151 a project that only starts makes no task grant call: the reconcile job asks the platform nothing until Schedule has read a list or owes a clear", async () => {
  const fake = platform([subject("sct_archived", ["granted"])]);
  const grants = createScheduleTaskGrants(fake.actions);
  for (let pass = 0; pass < 3; pass += 1) assert.equal(await grants.reconcile(() => new Set()), true);
  assert.deepEqual(fake.calls, [], "no list and no clear at start");
});

test("PWA-151 once per start the reconcile job clears subjects of archived or missing tasks from the first list a round read, never a live one; a failed clear is retried", async () => {
  const fake = platform([subject("sct_live", ["granted"]), subject("sct_gone", ["granted"]), subject("sct_archived", ["unavailable"])]);
  const grants = createScheduleTaskGrants(fake.actions), live = new Set(["sct_live"]);
  // A due round reads the platform's list to choose its role: that one answer is what the sweep takes.
  await grants.list();
  fake.state.refuse = true;
  assert.equal(await grants.reconcile(() => live), false, "a platform that refuses the clear is tried again on the next pass");
  fake.state.refuse = false;
  assert.equal(await grants.reconcile(() => live), true);
  assert.deepEqual(fake.subjects.map(item => item.key), ["sct_live"], "the archived and the missing task's subjects are cleared, the live one is not");
  assert.equal(fake.calls.filter(call => call.capability_id === agentTaskGrantActions.list.capability_id).length, 1, "the sweep listed nothing of its own");
  // A subject of a task that is not live shows up after the sweep: a second sweep would clear it, so the count below can fail.
  fake.subjects.push(subject("sct_late", ["granted"]));
  const before = fake.calls.length;
  await grants.list();
  for (let pass = 0; pass < 3; pass += 1) await grants.reconcile(() => live);
  assert.equal(fake.calls.length, before + 1, "after one sweep the job asks the platform nothing until a clear is owed, whatever is read later");
  assert.deepEqual(fake.subjects.map(item => item.key), ["sct_live", "sct_late"], "the subject read after the one sweep is not swept again");
});

test("PWA-151 the reconcile job reads the live tasks after the platform's list: a task made and granted in between keeps its grants", async () => {
  const fake = platform([subject("sct_new", ["granted"])]), live = new Set<string>();
  // The person makes the task and turns a category on while the platform answers the list.
  const actions = { invoke: async <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input): Promise<Output> => {
    const answer = await fake.actions.invoke(definition, input);
    if (definition.capability_id === agentTaskGrantActions.list.capability_id) live.add("sct_new");
    return answer;
  } };
  const grants = createScheduleTaskGrants(actions);
  await grants.list();
  assert.equal(await grants.reconcile(() => live), true);
  assert.deepEqual(fake.cleared(), [], "the new task's grants are not taken");
  assert.deepEqual(fake.subjects.map(item => item.key), ["sct_new"]);
});

test("PWA-152 the page reads the grants once for the whole list, as counts by state (never another plugin's words)", async () => {
  const fake = platform([subject("sct_a", ["granted", "needs_confirmation"]), subject("sct_b", ["unavailable", "removed"]), subject("sct_c", [])]);
  assert.deepEqual(scheduleTaskReads(await fake.actions.invoke(agentTaskGrantActions.list, {})), [
    { task_id: "sct_a", categories: 2, granted: 1, needs_confirmation: 1, unavailable: 0, removed: 0 },
    { task_id: "sct_b", categories: 2, granted: 0, needs_confirmation: 0, unavailable: 1, removed: 1 },
  ], "a subject without categories reads project files, like a task with none");
  const routes = new SchedulePluginRouteTable(createScheduleRouteHandlers({ actions: { discover: async () => [], invoke: fake.actions.invoke }, changed() {} }));
  const answer = await routes.handle({ method: "GET", pathname: "/api/plugins/io.molis.work.schedule/grants", query: new URLSearchParams(), body: {} });
  assert.equal(answer?.status, 200);
  assert.deepEqual((answer?.body as { tasks: Array<{ task_id: string }> }).tasks.map(item => item.task_id), ["sct_a", "sct_b"]);
  assert.deepEqual(fake.calls.map(call => call.capability_id), [agentTaskGrantActions.list.capability_id, agentTaskGrantActions.list.capability_id]);
});

/** N0704: exercise the plugin's public health and archive binding, with the Host's kept job and database contracts. */
async function reconcileHealthFixture() {
  const fake = platform([]), db = memoryPluginDatabase(SCHEDULE_PROJECT_DATABASE.schema, ["p1"]);
  const controller = new AbortController();
  let authority = true, closed = false, onClear: (() => Promise<void>) | undefined;
  let work: ((control: PluginJobControl) => Promise<void>) | undefined, running: Promise<unknown> | undefined;
  const check = () => { controller.signal.throwIfAborted(); if (!authority) throw new Error("authority withdrawn"); };
  const unused = () => { throw new Error("unexpected service call"); };
  const writer = { register: unused, cancel: unused, setEnabled: unused };
  const actions = { dependencies: {}, invoke: async <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input): Promise<Output> => {
    if (definition.capability_id === agentTaskGrantActions.clear.capability_id) await onClear?.();
    return fake.actions.invoke(definition, input);
  } };
  const plugin = createSchedulePlugin();
  const started = await plugin.start({ project_id: "p1", install_id: "install-schedule", requireGrant() {}, services: {
    actions, project_database: db,
    scheduler: { list: () => [], get: () => null, isExecuting: () => false,
      join: (_transaction: object, write: (value: typeof writer) => unknown) => write(writer) },
    installations: { list: () => [], get: () => undefined }, notifications: { deliver: unused },
    background: { keep: (job: string, callback: (control: PluginJobControl) => Promise<void>) => {
      assert.equal(job, "schedule-reconcile"); work = callback; return { done: Promise.resolve(), cancel: unused };
    } },
  } } as never);
  assert.equal(started.kind, "app");
  if (started.kind !== "app") throw new Error("expected app contribution");
  const archive = started.actions?.find(item => item.capability_id === scheduleActions.archiveTask.capability_id);
  assert.ok(archive); assert.ok(plugin.health); assert.ok(work);
  const health = () => plugin.health!({} as never);
  const waitFor = async (predicate: () => boolean | Promise<boolean>) => {
    const deadline = Date.now() + 8_000;
    while (!await predicate()) {
      assert.ok(Date.now() < deadline, "expected observed job state before deadline");
      await setTimeout(5);
    }
  };
  return { fake, health, waitFor,
    async archive() {
      db.raw.prepare("INSERT INTO schedule_conversation_tasks (task_id,title,instructions,hour,minute,notify_important,enabled,archived,unread,job_id,last_run_at,last_error,created_at,updated_at) VALUES ('sct_owed','owed','read',8,0,1,1,0,0,NULL,NULL,NULL,'2026-11-01','2026-11-01')").run();
      fake.state.refuse = true;
      assert.deepEqual(await archive.handle({ actor_id: "person", project_id: "p1", audience: "user", permissions: [], beforeEffect: async () => {} }, { task_id: "sct_owed" }), { archived: true });
      assert.equal(fake.calls.filter(call => call.capability_id === agentTaskGrantActions.clear.capability_id).length, 1);
    },
    start() {
      assert.equal(running, undefined);
      running = work!({ job: "schedule-reconcile", signal: controller.signal, beforeEffect: async () => check(), assert_authority_current: check }).then(() => null, error => error);
    },
    holdClear() {
      let release!: () => void, entered = false;
      const gate = new Promise<void>(resolve => { release = resolve; });
      onClear = async () => { entered = true; await gate; };
      return { reached: () => entered, release };
    },
    revoke: () => { authority = false; }, cancel: () => controller.abort(),
    async close() { if (closed) return; closed = true; controller.abort(); await running; db.close(); },
  };
}

test("N0704 failed grant cleanup makes public health unhealthy; the next successful pass clears it", async () => {
  const f = await reconcileHealthFixture();
  try {
    await f.archive(); f.start();
    await f.waitFor(async () => !(await f.health()).ok);
    assert.equal((await f.health()).message, "授权清理尚未完成，稍后重试");
    f.fake.state.refuse = false;
    await f.waitFor(async () => (await f.health()).ok);
    assert.ok(f.fake.calls.filter(call => call.capability_id === agentTaskGrantActions.clear.capability_id).length >= 3);
  } finally { await f.close(); }
});

for (const interruption of ["cancel", "revoke"] as const) {
  test(`N0704 ${interruption} during grant cleanup preserves the last health report`, async () => {
    const f = await reconcileHealthFixture();
    let retry: ReturnType<typeof f.holdClear> | undefined;
    try {
      await f.archive(); f.start();
      await f.waitFor(async () => !(await f.health()).ok);
      const previous = await f.health();
      retry = f.holdClear(); f.fake.state.refuse = false;
      await f.waitFor(() => retry!.reached());
      if (interruption === "cancel") f.cancel(); else f.revoke();
      retry.release(); await f.close();
      assert.deepEqual(await f.health(), previous, "successful cleanup must not publish a late healthy report after authority is lost");
    } finally { retry?.release(); await f.close(); }
  });
}
