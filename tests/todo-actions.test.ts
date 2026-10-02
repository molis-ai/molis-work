import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PERSONAL_SPACE_PROJECT_ID, actionEffect, actionFieldOptions, bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { parsePluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionService } from "@molis-ai/molis-work-kernel";
import {
  TODO_ACTIONS as TODO_ALL_ACTIONS,
  TODO_ACTION_PERMISSIONS,
  createTodoActionHandlers,
  openTodoStore,
  parseTodoQuickText,
  todoActions as actions,
  todoManifest,
  todoSearchActions,
  type TodoListResult,
} from "@molis-ai/molis-work-plugin-todo";

const TODAY = "2026-09-28";

function fixture(t: { after(fn: () => void): void }, now = () => new Date("2026-09-28T10:30:00+08:00")) {
  const home = mkdtempSync(join(tmpdir(), "todo-actions-"));
  const store = openTodoStore(home, now);
  const service = new ActionService();
  service.registerProvider({ provider: { provider_id: todoManifest.plugin_id, plugin_id: todoManifest.plugin_id, title: "待办", kind: "plugin" },
    definitions: [...todoManifest.actions!], handlers: createTodoActionHandlers({ withStore: run => run(store), today: () => TODAY, now }) });
  t.after(() => { store.close(); rmSync(home, { recursive: true, force: true }); });
  const as = (project_id: string | null, audience: ActionCallContext["audience"] = "user") =>
    bindActionClient(service, () => ({ actor_id: audience === "user" ? "web-user" : "assistant", project_id, audience, permissions: TODO_ACTION_PERMISSIONS }));
  return { service, home, me: as(null), inA: as("project-a"), inB: as("project-b"), agentA: as("project-a", "agent"), agentHome: as(null, "agent") };
}

const titles = (result: TodoListResult) => result.items.map(item => item.title).sort();

test("manifest parses, every action is home-scoped (the home page source and a project's search source are per project) and delete is the only irreversible one", () => {
  const manifest = parsePluginManifest(JSON.parse(JSON.stringify(todoManifest)));
  assert.equal(manifest.plugin_id, "io.molis.work.todo");
  const perProject = new Set(["todo.home.events", "todo.search.project_entries"]);
  for (const definition of todoManifest.actions!) assert.equal(definition.action.scope, perProject.has(definition.capability_id) ? "project" : "home", definition.capability_id);
  const irreversible = todoManifest.actions!.filter(definition => actionEffect(definition.action, definition.capability_id) === "irreversible").map(definition => definition.capability_id);
  assert.deepEqual(irreversible, ["todo.items.delete"]);
  assert.deepEqual(actions.create.action.result_subject, { id: "item.id", revision: "item.revision" });
});

test("scope: personal and unplaced todos everywhere, a project's todos only in that project, all projects only for the person", async t => {
  const f = fixture(t);
  await f.me.invoke(actions.create, { title: "个人的事", planned_date: TODAY });
  await f.inA.invoke(actions.create, { title: "A 项目的事", placement: "project", planned_date: TODAY });
  await f.inB.invoke(actions.create, { title: "B 项目的事", placement: "project", planned_date: TODAY });
  const unplaced = await f.inA.invoke(actions.create, { title: "还没归类", planned_date: TODAY });
  assert.equal(unplaced.item.placement, "unassigned");
  assert.equal(unplaced.item.project_id, null);

  assert.deepEqual(titles(await f.me.invoke(actions.list, {})), ["个人的事", "还没归类"]);
  assert.deepEqual(titles(await f.inA.invoke(actions.list, {})), ["A 项目的事", "个人的事", "还没归类"]);
  assert.deepEqual(titles(await f.agentA.invoke(actions.list, {})), ["A 项目的事", "个人的事", "还没归类"]);
  assert.deepEqual(titles(await f.inA.invoke(actions.list, { all_projects: true })), ["A 项目的事", "B 项目的事", "个人的事", "还没归类"]);
  await assert.rejects(f.agentA.invoke(actions.list, { all_projects: true }), { code: "actions.forbidden" });
  await assert.rejects(f.me.invoke(actions.create, { title: "没有项目却要放进项目", placement: "project" }), { code: "actions.project_required" });

  const bTodo = (await f.inB.invoke(actions.list, { placement: "project" })).items[0]!;
  await assert.rejects(f.agentA.invoke(actions.get, { id: bTodo.id }), { code: "todo.not_found" });
  await assert.rejects(f.agentA.invoke(actions.update, { id: bTodo.id, title: "越界修改" }), { code: "todo.not_found" });
  // The person's own page may edit another project's todo from "所有项目" without moving it.
  const edited = await f.inA.invoke(actions.update, { id: bTodo.id, title: "B 项目的事（改）", placement: "project" });
  assert.equal(edited.item.project_id, "project-b");
});

test("revisions refuse stale writes; the person's edits are recorded and the Assistant cannot set importance", async t => {
  const f = fixture(t);
  const created = await f.agentHome.invoke(actions.create, { title: "发送新版方案", due_date: "2026-10-02" });
  assert.equal(created.item.sources[0]!.kind, "assistant");
  assert.deepEqual(created.item.edited_fields, []);
  const byAgent = await f.agentHome.invoke(actions.update, { id: created.item.id, expected_revision: 1, notes: "预算等小李确认" });
  assert.deepEqual(byAgent.item.edited_fields, []);
  await assert.rejects(f.me.invoke(actions.update, { id: created.item.id, expected_revision: 1, title: "旧版本上的修改" }), { code: "todo.conflict" });
  const byMe = await f.me.invoke(actions.update, { id: created.item.id, expected_revision: 2, due_date: "2026-10-05", important: true });
  assert.deepEqual([...byMe.item.edited_fields].sort(), ["due_date", "important"]);
  await assert.rejects(f.agentHome.invoke(actions.update, { id: created.item.id, important: false }), { code: "todo.forbidden" });
  const unchanged = await f.me.invoke(actions.update, { id: created.item.id, expected_revision: 3, due_date: "2026-10-05" });
  assert.equal(unchanged.change_id, null);
  assert.equal(unchanged.item.revision, 3);
  // A day that does not exist and a reminder without its time zone fail the declared formats before Todo sees them.
  await assert.rejects(f.me.invoke(actions.update, { id: created.item.id, due_date: "2026-02-30" }), { code: "actions.input_invalid" });
  await assert.rejects(f.me.invoke(actions.update, { id: created.item.id, due_date: null, due_time: "10:00" }), { code: "todo.invalid" });
  await assert.rejects(f.me.invoke(actions.update, { id: created.item.id, remind_at: "2026-10-01T09:00:00" }), { code: "actions.input_invalid" });
  const history = await f.me.invoke(actions.get, { id: created.item.id });
  assert.deepEqual(history.history.map(change => [change.kind, change.actor]), [["update", "user"], ["update", "assistant"], ["create", "assistant"]]);
});

test("status, completion and archiving; archiving needs a closed todo and reopening brings it back", async t => {
  const f = fixture(t);
  const { item } = await f.me.invoke(actions.create, { title: "交季度报告" });
  await assert.rejects(f.me.invoke(actions.archive, { id: item.id, archived: true }), { code: "todo.invalid" });
  const done = await f.me.invoke(actions.status, { id: item.id, status: "done" });
  assert.ok(done.item.completed_at);
  const archived = await f.me.invoke(actions.archive, { id: item.id, archived: true, expected_revision: done.item.revision });
  assert.ok(archived.item.archived_at);
  assert.equal((await f.me.invoke(actions.list, { view: "closed" })).items.length, 0);
  assert.equal((await f.me.invoke(actions.list, { archived: true })).items.length, 1);
  const reopened = await f.me.invoke(actions.status, { id: item.id, status: "open" });
  assert.equal(reopened.item.archived_at, null);
  assert.equal(reopened.item.completed_at, null);
});

test("batches apply all or nothing and undo together; an undo never discards a later edit", async t => {
  const f = fixture(t);
  const a = (await f.me.invoke(actions.create, { title: "甲", planned_date: TODAY })).item;
  const b = (await f.me.invoke(actions.create, { title: "乙", due_date: TODAY })).item;
  const c = (await f.me.invoke(actions.create, { title: "丙" })).item;
  const shifted = await f.me.invoke(actions.batch, { ids: [a.id, b.id, c.id], change: { shift_days: 1 } });
  assert.deepEqual(shifted.items.map(item => [item.planned_date, item.due_date]), [["2026-09-29", null], [null, "2026-09-29"], [null, null]]);
  await f.me.invoke(actions.revert, { batch_id: shifted.batch_id });
  const back = await f.me.invoke(actions.list, { view: "all" });
  assert.deepEqual(back.items.map(item => [item.title, item.planned_date, item.due_date]).sort(), [["丙", null, null], ["乙", null, TODAY], ["甲", TODAY, null]]);
  await assert.rejects(f.me.invoke(actions.revert, { batch_id: shifted.batch_id }), { code: "todo.conflict" });

  await assert.rejects(f.me.invoke(actions.batch, { ids: [a.id, b.id], change: { archive: true } }), { code: "todo.invalid" });
  assert.equal((await f.me.invoke(actions.get, { id: a.id })).item.archived_at, null);

  const completed = await f.me.invoke(actions.batch, { ids: [a.id, b.id], change: { status: "done" } });
  await f.me.invoke(actions.update, { id: a.id, notes: "完成后又补了说明" });
  await assert.rejects(f.me.invoke(actions.revert, { batch_id: completed.batch_id }), { code: "todo.conflict" });
  assert.equal((await f.me.invoke(actions.get, { id: b.id })).item.status, "done", "a refused batch undo changes nothing");

  const status = await f.me.invoke(actions.status, { id: c.id, status: "done" });
  const undone = await f.me.invoke(actions.revert, { change_id: status.change_id! });
  assert.equal(undone.items[0]!.status, "open");
  assert.equal(undone.items[0]!.completed_at, null);
});

test("undoing a create removes it; request_id replays instead of creating twice; delete removes history", async t => {
  const f = fixture(t);
  const first = await f.me.invoke(actions.create, { title: "记一下", request_id: "req-1" });
  const again = await f.me.invoke(actions.create, { title: "记一下", request_id: "req-1" });
  assert.equal(again.item.id, first.item.id);
  assert.equal(again.replayed, true);
  const removed = await f.me.invoke(actions.revert, { change_id: first.change_id });
  assert.deepEqual(removed.removed_ids, [first.item.id]);
  await assert.rejects(f.me.invoke(actions.get, { id: first.item.id }), { code: "todo.not_found" });

  const other = await f.me.invoke(actions.create, { title: "要删掉的" });
  await assert.rejects(f.me.invoke(actions.remove, { id: other.item.id, expected_revision: 9 }), { code: "todo.conflict" });
  assert.deepEqual(await f.me.invoke(actions.remove, { id: other.item.id, expected_revision: 1 }), { deleted: true, id: other.item.id });
  await assert.rejects(f.me.invoke(actions.revert, { change_id: other.change_id }), { code: "todo.not_found" });
});

test("links: todo relations read from both ends; unreachable todos cannot be linked; unlinking undoes", async t => {
  const f = fixture(t);
  const send = (await f.me.invoke(actions.create, { title: "发送新版方案", due_date: "2026-10-02" })).item;
  const wait = (await f.me.invoke(actions.create, { title: "等待小李确认预算", status: "waiting", waiting: { who: "小李", what: "确认预算", follow_up_on: null } })).item;
  assert.equal(wait.status, "waiting");
  const linked = await f.me.invoke(actions.link, { id: send.id, add: { kind: "todo", subject: { kind: "todo_item", id: wait.id }, title: wait.title, relation: "blocked_by" } });
  assert.equal(linked.item.links[0]!.relation, "blocked_by");
  const back = await f.me.invoke(actions.get, { id: wait.id });
  assert.deepEqual(back.backlinks, [{ item_id: send.id, title: send.title, relation: "blocked_by" }]);
  await assert.rejects(f.me.invoke(actions.link, { id: send.id, add: { kind: "todo", subject: { kind: "todo_item", id: wait.id }, title: "重复" } }), { code: "todo.invalid" });
  const other = (await f.inB.invoke(actions.create, { title: "B 的事", placement: "project" })).item;
  await assert.rejects(f.agentA.invoke(actions.link, { id: send.id, add: { kind: "todo", subject: { kind: "todo_item", id: other.id }, title: "B 的事" } }), { code: "todo.not_found" });
  const outcome = await f.me.invoke(actions.link, { id: send.id, add: { kind: "outcome", subject: { kind: "page", id: "doc-1" }, title: "回复张总的草稿", outcome: "draft", open: { surface: "pages", id: "doc-1" } } });
  assert.equal(outcome.item.links.length, 2);
  const undone = await f.me.invoke(actions.revert, { change_id: outcome.change_id });
  assert.equal(undone.items[0]!.links.length, 1);
});

test("views answer their questions with the pinned day, and flags do not change status", async t => {
  const f = fixture(t);
  const make = (input: Record<string, unknown>) => f.me.invoke(actions.create, input as { title: string });
  await make({ title: "逾期", due_date: "2026-09-25" });
  await make({ title: "今天截止", due_date: TODAY, due_time: "18:00" });
  await make({ title: "计划今天", planned_date: TODAY });
  await make({ title: "计划日已过", planned_date: "2026-09-20" });
  await make({ title: "进行中", status: "doing" });
  await make({ title: "三天后截止", due_date: "2026-10-01" });
  await make({ title: "没安排" });
  await make({ title: "等小李", status: "waiting", waiting: { who: "小李", what: "预算", follow_up_on: "2026-09-30" } });
  const today = await f.me.invoke(actions.list, { view: "today" });
  assert.deepEqual(today.items.map(item => item.title), ["逾期", "今天截止", "计划日已过", "计划今天", "进行中"]);
  assert.deepEqual(today.items[0]!.flags, ["overdue"]);
  assert.equal(today.items[0]!.status, "open");
  assert.deepEqual(titles(await f.me.invoke(actions.list, { view: "waiting" })), ["等小李"]);
  assert.deepEqual(titles(await f.me.invoke(actions.list, { view: "unscheduled" })), ["没安排"]);
  assert.deepEqual(titles(await f.me.invoke(actions.list, { view: "upcoming" })), ["三天后截止"]);
  assert.deepEqual(today.counts, { today: 5, waiting: 1, unscheduled: 1, upcoming: 1, all: 8, closed: 0 });
  assert.deepEqual(titles(await f.me.invoke(actions.list, { view: "all", query: "小李" })), ["等小李"]);
});

test("search entries and the object reader follow the caller's scope", async t => {
  const f = fixture(t);
  const mine = (await f.me.invoke(actions.create, { title: "个人的事", notes: "带说明" })).item;
  const inB = (await f.inB.invoke(actions.create, { title: "B 项目的事", placement: "project" })).item;
  const page = await f.agentA.invoke(todoSearchActions.entries, { cursor: null, limit: 50 });
  assert.deepEqual(page.entries.map(entry => entry.title), ["个人的事"]);
  const context = await f.agentA.invoke(todoSearchActions.subject, { subject_id: mine.id });
  assert.equal(context.subject.kind, "todo_item");
  assert.equal(context.revision, "1");
  assert.match(context.content, /状态：待处理/u);
  assert.deepEqual(context.open, { surface: "todo", id: mine.id });
  assert.equal(context.project_id, null, "个人待办不属于项目");
  const inA = (await f.inA.invoke(actions.create, { title: "A 项目的事", placement: "project" })).item;
  assert.equal((await f.agentA.invoke(todoSearchActions.subject, { subject_id: inA.id })).project_id, "project-a", "项目待办说明属于哪个项目");
  // A project's todos are searched with that project: its own source lists them, the personal source never does.
  assert.deepEqual((await f.agentA.invoke(todoSearchActions.projectEntries, { cursor: null, limit: 50 })).entries.map(entry => entry.title), ["A 项目的事"]);
  assert.deepEqual((await f.inB.invoke(todoSearchActions.projectEntries, { cursor: null, limit: 50 })).entries.map(entry => entry.title), ["B 项目的事"]);
  assert.deepEqual((await f.agentA.invoke(todoSearchActions.entries, { cursor: null, limit: 50 })).entries.map(entry => entry.title), ["个人的事"]);
  await assert.rejects(f.me.invoke(todoSearchActions.projectEntries, { cursor: null, limit: 50 }), { code: "actions.project_required" }, "没有项目时不列项目待办");
  await assert.rejects(f.agentA.invoke(todoSearchActions.subject, { subject_id: inB.id }), { code: "todo.not_found" });
  // The person at Home (the placement panel after a move) reads a project's todo and learns where it is; an agent at Home does not.
  assert.equal((await f.me.invoke(todoSearchActions.subject, { subject_id: inB.id })).project_id, "project-b");
  await assert.rejects(f.agentHome.invoke(todoSearchActions.subject, { subject_id: inB.id }), { code: "todo.not_found" });
  const personalSpace = bindActionClient(f.service, () => ({ actor_id: "web-user", project_id: PERSONAL_SPACE_PROJECT_ID, audience: "user", permissions: TODO_ACTION_PERMISSIONS }));
  assert.equal((await personalSpace.invoke(todoSearchActions.subject, { subject_id: inB.id })).project_id, "project-b");
  assert.deepEqual(titles(await personalSpace.invoke(actions.list, { view: "all" })), ["个人的事"], "列表仍只列个人空间的");
  // What the person changed is said in the page's words, not as stored field names (search shows this text).
  const changed = await f.me.invoke(actions.update, { id: mine.id, expected_revision: mine.revision, due_date: "2026-10-05", planned_date: "2026-10-02" });
  const edited = (await f.agentA.invoke(todoSearchActions.subject, { subject_id: mine.id })).content;
  assert.match(edited, /你手动改过：(截止日期、计划处理日期|计划处理日期、截止日期)/u);
  assert.doesNotMatch(edited, /due_date|planned_date/u);
  // Archived reads as gone from use (the readers' shared convention), though Todo still lists it under 已归档.
  const done = await f.me.invoke(actions.status, { id: mine.id, status: "done", expected_revision: changed.item.revision });
  await f.me.invoke(actions.archive, { id: mine.id, archived: true, expected_revision: done.item.revision });
  await assert.rejects(f.agentA.invoke(todoSearchActions.subject, { subject_id: mine.id }), { code: "todo.not_found" });
});

test("quick entry reads due dates, planned days and reminders without a model, and leaves the rest alone", () => {
  const now = new Date(2026, 8, 28, 10, 30); // Monday 2026-09-28 10:30 local time
  const due = parseTodoQuickText("周四前给王总回电话", now);
  assert.equal(due.title, "给王总回电话");
  assert.deepEqual(due.parts, [{ field: "due_date", phrase: "周四前", date: "2026-10-01", time: null }]);
  const planned = parseTodoQuickText("明天整理会议纪要", now);
  assert.deepEqual([planned.title, planned.parts[0]!.field, planned.parts[0]!.date], ["整理会议纪要", "planned_date", "2026-09-29"]);
  const reminder = parseTodoQuickText("明天下午3点提醒我交报销单", now);
  assert.deepEqual([reminder.title, reminder.parts[0]!.field, reminder.parts[0]!.date, reminder.parts[0]!.time], ["交报销单", "remind_at", "2026-09-29", "15:00"]);
  const nextWeek = parseTodoQuickText("下周五前提交预算", now);
  assert.deepEqual([nextWeek.parts[0]!.date, nextWeek.parts[0]!.field], ["2026-10-09", "due_date"]);
  const explicit = parseTodoQuickText("10月2日截止 发新版方案", now);
  assert.deepEqual([explicit.title, explicit.parts[0]!.date], ["发新版方案", "2026-10-02"]);
  const withTime = parseTodoQuickText("周五下午3点前发方案", now);
  assert.deepEqual([withTime.parts[0]!.date, withTime.parts[0]!.time], ["2026-10-02", "15:00"]);
  const invalid = parseTodoQuickText("2月30日前交材料", now);
  assert.deepEqual(invalid.parts, []);
  assert.equal(invalid.title, "2月30日前交材料");
  const nothing = parseTodoQuickText("问问设计进展", now);
  assert.deepEqual([nothing.title, nothing.parts.length], ["问问设计进展", 0]);
  const timeOnly = parseTodoQuickText("9点提醒我开会", now);
  assert.deepEqual([timeOnly.parts[0]!.date, timeOnly.parts[0]!.time], ["2026-09-29", "09:00"]);
  const monthEnd = parseTodoQuickText("月底前报销", now);
  assert.equal(monthEnd.parts[0]!.date, "2026-09-30");
});

test("reminders: due once, late when missed, not delivered after 48 hours, gone once acknowledged, done or moved", async t => {
  let clock = new Date("2026-09-28T10:30:00+08:00");
  const f = fixture(t, () => clock);
  const soon = (await f.me.invoke(actions.create, { title: "交报销单", remind_at: "2026-09-28T10:00:00+08:00" })).item;
  const missed = (await f.me.invoke(actions.create, { title: "给妈妈打电话", remind_at: "2026-09-27T20:00:00+08:00" })).item;
  await f.me.invoke(actions.create, { title: "太久以前", remind_at: "2026-09-25T09:00:00+08:00" });
  await f.me.invoke(actions.create, { title: "还没到", remind_at: "2026-09-28T18:00:00+08:00" });
  const due = await f.me.invoke(actions.dueReminders, {});
  assert.deepEqual(due.reminders.map(entry => [entry.item.title, entry.late]), [["给妈妈打电话", true], ["交报销单", false]]);
  const acked = await f.me.invoke(actions.acknowledgeReminder, { id: soon.id });
  assert.ok(acked.item.reminder_acknowledged_at);
  assert.equal(acked.item.revision, soon.revision, "知道了不改待办本身");
  await f.me.invoke(actions.status, { id: missed.id, status: "done" });
  assert.deepEqual((await f.me.invoke(actions.dueReminders, {})).reminders, []);
  // Later: a new time is a new reminder, shown again when it comes.
  await f.me.invoke(actions.update, { id: soon.id, remind_at: "2026-09-28T10:45:00+08:00" });
  assert.equal((await f.me.invoke(actions.dueReminders, {})).reminders.length, 0);
  clock = new Date("2026-09-28T10:50:00+08:00");
  assert.deepEqual((await f.me.invoke(actions.dueReminders, {})).reminders.map(entry => entry.item.title), ["交报销单"]);
  // A project's reminders reach only callers in that project.
  await f.inB.invoke(actions.create, { title: "B 的提醒", placement: "project", remind_at: "2026-09-28T10:40:00+08:00" });
  assert.deepEqual((await f.agentA.invoke(actions.dueReminders, {})).reminders.map(entry => entry.item.title), ["交报销单"]);
});

test("home events: due reminders and overdue need attention; due, planned and follow-up days show for today; scoped to the project", async t => {
  // Local wall-clock times: "today" and the shown clock follow this computer's time zone.
  const local = (hours: number, minutes = 0) => new Date(2026, 8, 28, hours, minutes);
  const f = fixture(t, () => local(10, 30));
  await f.me.invoke(actions.create, { title: "逾期的", due_date: "2026-09-26" });
  await f.me.invoke(actions.create, { title: "今天截止", due_date: TODAY, status: "waiting", waiting: { who: "小李", what: "预算", follow_up_on: null } });
  await f.me.invoke(actions.create, { title: "计划今天", planned_date: TODAY });
  await f.me.invoke(actions.create, { title: "约好今天问", status: "waiting", waiting: { who: "王总", what: "回复", follow_up_on: TODAY } });
  await f.me.invoke(actions.create, { title: "提醒到了", remind_at: local(10, 15).toISOString() });
  await f.inB.invoke(actions.create, { title: "B 项目逾期", placement: "project", due_date: "2026-09-20" });
  await f.me.invoke(actions.create, { title: "完成了的", due_date: "2026-09-20", status: "done" });
  const window = { from: local(0).toISOString(), to: new Date(2026, 8, 29).toISOString(), now: local(10, 30).toISOString() };
  const collection = await f.agentA.invoke(actions.homeEvents, window);
  assert.equal(collection.source.surface, "todo");
  assert.deepEqual(collection.events.map(event => [event.title, event.placement, event.needs_attention, event.summary]), [
    ["提醒到了", "today", true, "提醒 · 10:15"],
    ["逾期的", "today", true, "已逾期，截止 2026-09-26"],
    ["今天截止", "today", false, "今天截止，还在等 小李"],
    ["计划今天", "today", false, "计划今天做"],
    ["约好今天问", "today", false, "约定今天跟进 王总"],
  ]);
  assert.deepEqual(collection.events[0]!.open, { kind: "item", surface: "todo", id: collection.events[0]!.subject.id, title: "提醒到了", label: "打开待办" });
});

test("in the personal space Todo is the personal view, and never files a todo under a project called “personal”", async t => {
  const f = fixture(t);
  const personalSpace = bindActionClient(f.service, () => ({ actor_id: "web-user", project_id: PERSONAL_SPACE_PROJECT_ID, audience: "user", permissions: TODO_ACTION_PERMISSIONS }));
  await f.me.invoke(actions.create, { title: "个人的事" });
  await f.inA.invoke(actions.create, { title: "A 项目的事", placement: "project" });
  const made = (await personalSpace.invoke(actions.create, { title: "在个人空间记下" })).item;
  assert.deepEqual([made.placement, made.project_id], ["personal", null]);
  assert.deepEqual(titles(await personalSpace.invoke(actions.list, { view: "all" })), ["个人的事", "在个人空间记下"]);
  await assert.rejects(personalSpace.invoke(actions.create, { title: "放进项目", placement: "project" }), { code: "actions.project_required" });
});

test("the placement panel moves a todo between the personal space and projects: same todo, recorded, undoable, only for the person", async t => {
  const f = fixture(t);
  const inA = (await f.inA.invoke(actions.create, { title: "A 项目的事", placement: "project" })).item;
  const toB = await f.me.invoke(actions.move, { subject: { kind: "todo_item", id: inA.id }, to_project_id: "project-b" });
  assert.deepEqual([toB.subject.id, toB.project_id], [inA.id, "project-b"]);
  assert.deepEqual(titles(await f.inB.invoke(actions.list, { view: "all" })), ["A 项目的事"], "身份不变，到了 B");
  assert.deepEqual(titles(await f.inA.invoke(actions.list, { view: "all" })), []);
  const home = await f.me.invoke(actions.move, { subject: { kind: "todo_item", id: inA.id }, to_project_id: PERSONAL_SPACE_PROJECT_ID });
  assert.equal(home.project_id, PERSONAL_SPACE_PROJECT_ID);
  const item = (await f.me.invoke(actions.get, { id: inA.id })).item;
  assert.deepEqual([item.placement, item.project_id], ["personal", null]);
  await assert.rejects(f.me.invoke(actions.move, { subject: { kind: "todo_item", id: inA.id }, to_project_id: PERSONAL_SPACE_PROJECT_ID }), { code: "placement.same_location" });
  const { history } = await f.me.invoke(actions.get, { id: inA.id });
  const last = history.find(change => change.kind === "update" && "project_id" in change.after)!;
  await f.me.invoke(actions.revert, { change_id: last.change_id });
  assert.equal((await f.me.invoke(actions.get, { id: inA.id })).item.project_id, "project-b", "移动可以撤销");
  await assert.rejects(f.agentHome.invoke(actions.move, { subject: { kind: "todo_item", id: inA.id }, to_project_id: "project-a" }));
});

test("every change the Assistant may make without asking says how it is undone, from its own output; delete stays confirmed each time", () => {
  const byId = new Map(TODO_ALL_ACTIONS.map(definition => [definition.capability_id, definition]));
  const reversible = ["todo.items.create", "todo.items.update", "todo.items.status", "todo.items.archive", "todo.items.batch", "todo.items.link", "todo.organize.extract", "todo.organize.apply"];
  for (const id of reversible) {
    const definition = byId.get(id)!;
    const undo = definition.action.undo;
    assert.ok(undo, id);
    assert.ok(byId.has(undo.capability_id), `${id} → ${undo.capability_id}`);
    const properties = (definition.action.output_schema as { properties: Record<string, { properties?: Record<string, unknown> }> }).properties;
    for (const path of Object.values(undo.input)) {
      const [head, next] = String(Array.isArray(path) ? path[0] : path).split(".");
      assert.ok(next ? properties[head!]?.properties?.[next] : properties[head!], `${id}: ${String(path)}`);
    }
  }
  assert.equal(byId.get("todo.items.delete")!.action.undo, undefined);
  assert.equal(actionEffect(byId.get("todo.items.delete")!.action, "todo.items.delete"), "irreversible");
});

test("the Assistant's reminder query lists the person's own reminders due in the window, from every project, each once per time", async t => {
  const f = fixture(t);
  const at = (hours: number, minutes = 0) => new Date(Date.UTC(2026, 8, 28, hours, minutes)).toISOString();
  const mine = (await f.me.invoke(actions.create, { title: "个人：交电费", remind_at: at(2) })).item;
  const inA = (await f.inA.invoke(actions.create, { title: "A：给王总回电话", placement: "project", remind_at: at(2, 30) })).item;
  const later = (await f.me.invoke(actions.create, { title: "窗口之后", remind_at: at(5) })).item;
  const seen = (await f.me.invoke(actions.create, { title: "已经知道了", remind_at: at(2, 10) })).item;
  await f.me.invoke(actions.acknowledgeReminder, { id: seen.id });
  const done = (await f.me.invoke(actions.create, { title: "做完了", remind_at: at(2, 20) })).item;
  await f.me.invoke(actions.status, { id: done.id, status: "done", expected_revision: done.revision });
  const window = { from: at(1), to: at(3) };
  const { source, reminders } = await f.me.invoke(actions.dueWindow, window);
  assert.deepEqual(source, { surface: "todo", title: "待办" });
  assert.deepEqual(reminders.map(reminder => [reminder.title, reminder.project_id, reminder.reminder_id]),
    [["个人：交电费", null, `${mine.id}@${mine.remind_at}`], ["A：给王总回电话", "project-a", `${inA.id}@${inA.remind_at}`]]);
  assert.deepEqual(reminders[1]!.open, { surface: "todo", id: inA.id });
  // A new time is a new reminder; the window's end is exclusive; a reminder is never marked by being read.
  const moved = await f.me.invoke(actions.update, { id: mine.id, remind_at: at(2, 45), expected_revision: mine.revision });
  const again = await f.me.invoke(actions.dueWindow, window);
  assert.equal(again.reminders.find(reminder => reminder.subject?.id === mine.id)!.reminder_id, `${mine.id}@${moved.item.remind_at}`);
  assert.equal((await f.me.invoke(actions.dueWindow, { from: at(1), to: at(2) })).reminders.length, 0);
  assert.ok(!(await f.me.invoke(actions.get, { id: later.id })).item.reminder_acknowledged_at);
  await assert.rejects(f.me.invoke(actions.dueWindow, { from: at(3), to: at(1) }), { code: "actions.input_invalid" });
  await assert.rejects(f.agentHome.invoke(actions.dueWindow, window));
});

test("choices a card may show carry the names a person reads, and still validate by their values", async t => {
  const props = (definition: { action: { input_schema: unknown } }) => (definition.action.input_schema as { properties: Record<string, unknown> }).properties;
  assert.deepEqual(actionFieldOptions(props(actions.status).status), [
    { value: "open", label: "待处理" }, { value: "doing", label: "进行中" }, { value: "waiting", label: "等待他人" }, { value: "done", label: "已完成" }, { value: "cancelled", label: "已取消" }]);
  assert.deepEqual(actionFieldOptions(props(actions.update).placement)?.map(option => option.label), ["个人空间", "当前项目", "暂未归类"]);
  assert.deepEqual(actionFieldOptions(props(actions.list).view)?.map(option => option.value), ["today", "waiting", "unscheduled", "upcoming", "all", "closed"]);
  const f = fixture(t);
  const made = (await f.inA.invoke(actions.create, { title: "按名称选", placement: "project", status: "doing" })).item;
  assert.deepEqual([made.placement, made.status], ["project", "doing"]);
  await assert.rejects(f.inA.invoke(actions.create, { title: "不认识的值", placement: "当前项目" as never }), { code: "actions.input_invalid" });
});
