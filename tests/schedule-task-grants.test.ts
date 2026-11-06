// PWA-148, PWA-149, PWA-151, PWA-152 (batch 18 P2, plugin side; specs/proactive-assistant/schedule-task-reads.md §3.2, §3.6): the read
// groups the five plugins declare, and Schedule's use of the platform's task grants (`agent.task_grants.list` and `.clear`). The Host
// side (registering the three actions, the grant subject of a plugin's round, S-108) is tested with the Host. Here the platform
// answers through a fake action client, so nothing below depends on how the Host keeps a grant.
import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { actionEffect, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentTaskGrantActions, TASK_GRANT_SUBJECT_KEY_PATTERN, type TaskGrantListResult, type TaskGrantSubject } from "@molis-ai/molis-work-contracts/services/agent-task-grants";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { todoManifest } from "@molis-ai/molis-work-plugin-todo";
import { inboxManifest } from "@molis-ai/molis-work-plugin-inbox";
import { goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { jellyManifest } from "@molis-ai/molis-work-plugin-jelly";
import {
  SCHEDULE_BRIEF_ROLE, SCHEDULE_PROJECT_DATABASE, SCHEDULE_READER_ROLE, SCHEDULE_TASK_GRANT_ACTIONS, createScheduleActionHandlers, createScheduleConversationTask,
  createScheduleRouteHandlers, createScheduleTaskGrants, getScheduleConversationTask, handleScheduleTaskWakeup, roundRole, scheduleActions, scheduleAgentManifest,
  scheduleManifest, schedulePrompts, scheduledTaskRunner, scheduleTaskReads, type ScheduleActionPorts,
} from "@molis-ai/molis-work-plugin-schedule";
import { SchedulePluginRouteTable } from "./schedule-direct-actions.js";

const MANIFESTS: Record<string, PluginManifest> = { todo: todoManifest, inbox: inboxManifest, goals: goalsManifest, jelly: jellyManifest, schedule: scheduleManifest };

/** The read groups by plugin, as the batch decided them (§3.2, 2026-11-05): 日程 is Jelly's calendar, not its notes. */
const EXPECTED: Record<string, Record<string, string>> = {
  todo: { todo: "待办" }, inbox: { inbox: "来信" }, goals: { goals: "目标" },
  jelly: { calendar: "日历", notes: "笔记" }, schedule: { operations: "定时操作" },
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

test("PWA-148 日程 is Jelly's calendar alone: its notes and exports, and Schedule's other plugins' operations, are switches of their own", () => {
  const jelly = new Map(jellyManifest.read_groups!.map(group => [group.group_id, group.actions]));
  assert.deepEqual([...jelly.get("calendar")!].sort(), ["jelly.calendar.list", "jelly.calendar.progress", "jelly.item.get"]);
  for (const id of ["jelly.search", "jelly.note.export", "jelly.workspace.export", "jelly.workspace.get"]) {
    assert.ok(jelly.get("notes")!.includes(id), `${id} is a note read`);
    assert.ok(!jelly.get("calendar")!.includes(id), `and not in the calendar`);
  }
  // `schedule.tasks.list` carries other plugins' scheduled operations with their original input: it is not part of 日程.
  assert.ok(scheduleManifest.read_groups!.find(group => group.group_id === "operations")!.actions.includes(scheduleActions.list.capability_id));
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

test("PWA-149 the brief role reads business data only: no directory, no host tools, read-only; the reader role is as it was", () => {
  const roles = new Map(scheduleAgentManifest.roles.map(role => [role.role_id, role]));
  assert.deepEqual(roles.get(SCHEDULE_BRIEF_ROLE), { role_id: "brief", version: 1, name: "读数据执行", execution: "read-only", workspace: "business", prompts: ["schedule-base", "schedule-brief"], host_tools: [] });
  assert.deepEqual(roles.get(SCHEDULE_READER_ROLE), { role_id: "reader", version: 2, name: "只读执行", execution: "read-only", prompts: ["schedule-base", "schedule-reader"], host_tools: ["read-file", "search"] });
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
  const db = new Database(":memory:");
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
  assert.equal(getScheduleConversationTask(db, data.task_id)!.turns.at(-1)!.text, "今天没有到期的待办。");
  // A failed read fails the round and the task says so; it does not fall back to reading files.
  fake.state.listFails = true;
  await assert.rejects(handleScheduleTaskWakeup(db, data.task_id, scheduledTaskRunner(agents, grants)), /平台暂时不可用/);
  assert.equal(runs.length, 2, "no round started");
  assert.match(getScheduleConversationTask(db, data.task_id)!.turns.at(-1)!.text, /这一轮没跑成：平台暂时不可用/);
});

/** Schedule's own task actions over a library, with `archived` going to the platform as the Runtime binds it. */
function taskHandlers(db: Database.Database, grants: ReturnType<typeof createScheduleTaskGrants>) {
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
  assert.equal(await grants.reconcile(live), true);
  assert.deepEqual(fake.cleared(), [a.task_id, b.task_id, b.task_id], "the reconcile job clears what the archive could not");
  assert.deepEqual(fake.subjects, []);
});

test("PWA-151 the reconcile job lists once per start and clears subjects of archived or missing tasks, never a live one; a failure is retried", async () => {
  const fake = platform([subject("sct_live", ["granted"]), subject("sct_gone", ["granted"]), subject("sct_archived", ["unavailable"])]);
  const grants = createScheduleTaskGrants(fake.actions), live = new Set(["sct_live"]);
  fake.state.listFails = true;
  assert.equal(await grants.reconcile(live), false, "a platform that cannot answer is tried again on the next pass");
  fake.state.listFails = false;
  assert.equal(await grants.reconcile(live), true);
  assert.deepEqual(fake.cleared().sort(), ["sct_archived", "sct_gone"]);
  assert.deepEqual(fake.subjects.map(item => item.key), ["sct_live"]);
  const before = fake.calls.length;
  for (let pass = 0; pass < 3; pass += 1) await grants.reconcile(live);
  assert.equal(fake.calls.length, before, "after one sweep the job asks the platform nothing until a clear is owed");
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
