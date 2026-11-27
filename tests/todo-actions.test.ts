import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PERSONAL_SPACE_PROJECT_ID, actionEffect, actionFieldOptions, bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { openSqliteConnection } from "@molis-ai/molis-work-storage";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { TODO_DATABASE, TODO_ACTIONS as TODO_ALL_ACTIONS, TODO_ACTION_PERMISSIONS, createTodoActionHandlers, parseTodoQuickText, todoActions as actions, todoDue, todoManifest, todoSearchActions, type TodoListResult, ownTodoStores } from "@molis-ai/molis-work-plugin-todo";
import { openTodoStore, partitionLibraryFile } from "./fixtures/plugin-home-stores.js";

const TODAY = "2026-09-28";

/**
 * Todo in one partition (batch 108): its own library, its own instance. Callers name that partition as their project; the person's page and
 * an Agent are the two audiences.
 */
function partition(t: { after(fn: () => void): void }, home: string, project_id: string, now: () => Date) {
  const store = openTodoStore(home, now, project_id);
  const service = new ActionService();
  service.registerProvider({ provider: { provider_id: todoManifest.plugin_id, plugin_id: todoManifest.plugin_id, title: "待办", kind: "plugin" },
    definitions: [...todoManifest.actions!], handlers: createTodoActionHandlers({ ...ownTodoStores(run => run(store)), today: () => TODAY, now }) });
  t.after(() => store.close());
  const as = (audience: ActionCallContext["audience"]) =>
    bindActionClient(service, () => ({ actor_id: audience === "user" ? "web-user" : "assistant", project_id, audience, permissions: TODO_ACTION_PERMISSIONS }));
  return { store, service, me: as("user"), agent: as("agent") };
}

/** The personal space and project A of one Home. */
function fixture(t: { after(fn: () => void): void }, now = () => new Date("2026-09-28T10:30:00+08:00")) {
  const home = mkdtempSync(join(tmpdir(), "todo-actions-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const personal = partition(t, home, PERSONAL_SPACE_PROJECT_ID, now), a = partition(t, home, "project-a", now);
  return { home, store: personal.store, service: personal.service, me: personal.me, agent: personal.agent, storeA: a.store, inA: a.me, agentA: a.agent };
}

const titles = (result: TodoListResult) => result.items.map(item => item.title).sort();

test("manifest parses, every action runs in its partition and delete is the only irreversible one", () => {
  const manifest = parsePluginManifest(JSON.parse(JSON.stringify(todoManifest)));
  assert.equal(manifest.plugin_id, "io.molis.work.todo");
  assert.equal(manifest.databases?.partition?.store_name, TODO_DATABASE.store_name);
  assert.equal(manifest.databases?.home, undefined);
  assert.deepEqual(manifest.overview_projection, { kinds: ["task"] });
  for (const definition of todoManifest.actions!) assert.equal(definition.action.scope, "project", definition.capability_id);
  const irreversible = todoManifest.actions!.filter(definition => actionEffect(definition.action, definition.capability_id) === "irreversible").map(definition => definition.capability_id);
  assert.deepEqual(irreversible, ["todo.items.delete"]);
  assert.deepEqual(actions.create.action.result_subject, { id: "item.id", revision: "item.revision" });
});

test("each partition keeps its own todos: a list holds only its own, another partition's id is not found here, and a call outside a partition is refused", async t => {
  const f = fixture(t);
  await f.me.invoke(actions.create, { title: "个人的事", planned_date: TODAY });
  const inA = (await f.inA.invoke(actions.create, { title: "A 项目的事", planned_date: TODAY })).item;
  assert.equal("placement" in inA, false);
  assert.equal("project_id" in inA, false);
  assert.deepEqual(titles(await f.me.invoke(actions.list, {})), ["个人的事"]);
  assert.deepEqual(titles(await f.agent.invoke(actions.list, {})), ["个人的事"]);
  assert.deepEqual(titles(await f.inA.invoke(actions.list, {})), ["A 项目的事"]);
  await assert.rejects(f.me.invoke(actions.get, { id: inA.id }), { code: "todo.not_found" });
  await assert.rejects(f.agent.invoke(actions.update, { id: inA.id, expected_revision: inA.revision, title: "越界修改" }), { code: "todo.not_found" });
  const outside = bindActionClient(f.service, () => ({ actor_id: "web-user", project_id: null, audience: "user" as const, permissions: TODO_ACTION_PERMISSIONS }));
  await assert.rejects(outside.invoke(actions.list, {}), { code: "actions.project_required" });
});

test("revisions refuse stale writes; the person's edits are recorded and the Assistant cannot set importance", async t => {
  const f = fixture(t);
  const created = await f.agent.invoke(actions.create, { title: "发送新版方案", due_date: "2026-10-02" });
  assert.equal(created.item.sources[0]!.kind, "assistant");
  assert.deepEqual(created.item.edited_fields, []);
  const byAgent = await f.agent.invoke(actions.update, { id: created.item.id, expected_revision: 1, notes: "预算等小李确认" });
  assert.deepEqual(byAgent.item.edited_fields, []);
  await assert.rejects(f.me.invoke(actions.update, { id: created.item.id, expected_revision: 1, title: "旧版本上的修改" }), { code: "todo.conflict" });
  const byMe = await f.me.invoke(actions.update, { id: created.item.id, expected_revision: 2, due_date: "2026-10-05", important: true });
  assert.deepEqual([...byMe.item.edited_fields].sort(), ["due_date", "important"]);
  await assert.rejects(f.agent.invoke(actions.update, { id: created.item.id, expected_revision: byMe.item.revision, important: false }), { code: "todo.forbidden" });
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

test("an Agent changes a todo only from the revision it read; the person's own page may leave it out", async t => {
  const f = fixture(t);
  const { item } = await f.agent.invoke(actions.create, { title: "约设计评审" });
  // Every write that changes an existing todo declares the revision it was read at, so the platform refuses an Agent's write without
  // one (actions.version_required) before Todo runs: without it, a model would overwrite a newer edit unseen. Nothing of Todo's own repeats it.
  const refused = { code: "actions.version_required", message: /expected_revision/u };
  await assert.rejects(f.agent.invoke(actions.update, { id: item.id, notes: "没读过就改" }), refused);
  await assert.rejects(f.agent.invoke(actions.status, { id: item.id, status: "doing" }), refused);
  await assert.rejects(f.agent.invoke(actions.archive, { id: item.id, archived: true }), refused);
  await assert.rejects(f.agent.invoke(actions.link, { id: item.id, add: { kind: "goal", subject: { kind: "goal", id: "g-1" }, title: "设计评审", relation: null, outcome: null, open: null } }), refused);
  await assert.rejects(f.agent.invoke(actions.remove, { id: item.id }), refused);
  await assert.rejects(f.agent.invoke(actions.batch, { ids: [item.id], change: { status: "doing" } }), refused);
  await assert.rejects(f.agent.invoke(actions.batch, { ids: [item.id], change: { status: "doing" }, expected_revisions: {} }), refused, "every todo of a batch names its revision");
  assert.equal((await f.me.invoke(actions.get, { id: item.id })).item.revision, 1, "nothing was written");
  // With the revision it read, the same writes go through; the person's page still writes without one.
  const moved = await f.agent.invoke(actions.status, { id: item.id, status: "doing", expected_revision: 1 });
  const batched = await f.agent.invoke(actions.batch, { ids: [item.id], change: { status: "open" }, expected_revisions: { [item.id]: moved.item.revision } });
  assert.equal(batched.changed_count, 1);
  const mine = await f.me.invoke(actions.update, { id: item.id, notes: "我自己改的" });
  assert.equal(mine.item.notes, "我自己改的");
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
  await f.me.invoke(actions.revert, { batch_id: shifted.batch_id! });
  const back = await f.me.invoke(actions.list, { view: "all" });
  assert.deepEqual(back.items.map(item => [item.title, item.planned_date, item.due_date]).sort(), [["丙", null, null], ["乙", null, TODAY], ["甲", TODAY, null]]);
  await assert.rejects(f.me.invoke(actions.revert, { batch_id: shifted.batch_id! }), { code: "todo.conflict" });

  await assert.rejects(f.me.invoke(actions.batch, { ids: [a.id, b.id], change: { archive: true } }), { code: "todo.invalid" });
  assert.equal((await f.me.invoke(actions.get, { id: a.id })).item.archived_at, null);

  const completed = await f.me.invoke(actions.batch, { ids: [a.id, b.id], change: { status: "done" } });
  await f.me.invoke(actions.update, { id: a.id, notes: "完成后又补了说明" });
  await assert.rejects(f.me.invoke(actions.revert, { batch_id: completed.batch_id! }), { code: "todo.conflict" });
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

test("a request id belongs to the caller and partition that chose it: another caller's identical id is another request, never a replay of someone else's todo", async t => {
  const f = fixture(t);
  const inA = await f.inA.invoke(actions.create, { title: "A 项目的事", request_id: "todo-req-1" });
  // The same id in another partition is another library's request.
  const home = await f.me.invoke(actions.create, { title: "个人空间里的另一件", request_id: "todo-req-1" });
  assert.deepEqual([home.replayed, home.item.title], [false, "个人空间里的另一件"]);
  // Another caller reusing the person's id here used to get the person's todo back as a replay.
  const mine = await f.me.invoke(actions.create, { title: "我的个人事", request_id: "todo-req-2" });
  const assistant = await f.agent.invoke(actions.create, { title: "助理另记的事", request_id: "todo-req-2" });
  assert.equal(assistant.replayed, false);
  assert.equal(assistant.item.title, "助理另记的事");
  assert.notEqual(assistant.item.id, mine.item.id);
  // Each caller's own retry still finds its own todo.
  const retried = [
    [await f.inA.invoke(actions.create, { title: "A 项目的事", request_id: "todo-req-1" }), inA],
    [await f.me.invoke(actions.create, { title: "个人空间里的另一件", request_id: "todo-req-1" }), home],
    [await f.me.invoke(actions.create, { title: "我的个人事", request_id: "todo-req-2" }), mine],
    [await f.agent.invoke(actions.create, { title: "助理另记的事", request_id: "todo-req-2" }), assistant],
  ] as const;
  for (const [retry, first] of retried) assert.deepEqual([retry.replayed, retry.item.id], [true, first.item.id], first.item.title);
});

test("a request row written before ids were kept per caller holds the raw id: it no longer matches (a retry makes a new todo) and nothing fails on it", async t => {
  const f = fixture(t);
  const before = (await f.me.invoke(actions.create, { title: "之前转过的收件" })).item;
  const rows = f.store.database();
  // How an Inbox conversion looks in a Home that kept the caller's id as it came.
  rows.run("INSERT INTO todo_requests (request_id, item_id, created_at) VALUES (?, ?, ?)", ["inbox:entry-1", before.id, "2026-09-01T00:00:00.000Z"]);
  const again = await f.me.invoke(actions.create, { title: "之前转过的收件", request_id: "inbox:entry-1" });
  assert.deepEqual([again.replayed, again.item.id === before.id], [false, false], "an old retry is a new request: it does not dedupe");
  const retry = await f.me.invoke(actions.create, { title: "之前转过的收件", request_id: "inbox:entry-1" });
  assert.deepEqual([retry.replayed, retry.item.id], [true, again.item.id], "and from then on it is kept under the caller's key");
  // The old row is still a plain row of its todo: deleting or undoing that todo takes it away, and the id is free again.
  assert.equal((rows.get("SELECT COUNT(*) AS n FROM todo_requests WHERE item_id = ?", [before.id]) as { n: number }).n, 1);
  await f.me.invoke(actions.remove, { id: before.id, expected_revision: before.revision });
  assert.equal((rows.get("SELECT COUNT(*) AS n FROM todo_requests WHERE item_id = ?", [before.id]) as { n: number }).n, 0);
  assert.deepEqual((await f.me.invoke(actions.list, { view: "all" })).items.map(item => item.id), [again.item.id]);
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
  // A todo of another partition is not here to link to.
  const other = (await f.inA.invoke(actions.create, { title: "A 的事" })).item;
  const sendNow = (await f.me.invoke(actions.get, { id: send.id })).item;
  await assert.rejects(f.agent.invoke(actions.link, { id: send.id, expected_revision: sendNow.revision, add: { kind: "todo", subject: { kind: "todo_item", id: other.id }, title: "A 的事", relation: "related", open: null, outcome: null } }), { code: "todo.not_found" });
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

test("ARF-6: a corrupt row of one partition leaves the other partition's list alone, and its reader surfaces the decoding failure", async t => {
  const f = fixture(t);
  await f.me.invoke(actions.create, { title: "个人的事" });
  const { item } = await f.inA.invoke(actions.create, { title: "项目 A 的事" });
  const db = openSqliteConnection(partitionLibraryFile(f.home, "project-a", TODO_DATABASE.store_name), { fileMustExist: true });
  try {
    db.prepare("UPDATE todo_items SET sources_json = ? WHERE id = ?").run("{broken", item.id);
  } finally { db.close(); }
  assert.deepEqual(titles(await f.agent.invoke(actions.list, { view: "all" })), ["个人的事"]);
  await assert.rejects(f.agent.invoke(todoSearchActions.subject, { subject_id: item.id }), { code: "todo.not_found" });
  await assert.rejects(f.agentA.invoke(todoSearchActions.subject, { subject_id: item.id }), SyntaxError);
});

test("search entries and the object reader read this partition's todos", async t => {
  const f = fixture(t);
  const mine = (await f.me.invoke(actions.create, { title: "个人的事", notes: "带说明" })).item;
  const inA = (await f.inA.invoke(actions.create, { title: "A 项目的事" })).item;
  assert.deepEqual((await f.agent.invoke(todoSearchActions.entries, { cursor: null, limit: 50 })).entries.map(entry => entry.title), ["个人的事"]);
  assert.deepEqual((await f.agentA.invoke(todoSearchActions.entries, { cursor: null, limit: 50 })).entries.map(entry => entry.title), ["A 项目的事"]);
  const context = await f.agent.invoke(todoSearchActions.subject, { subject_id: mine.id });
  assert.equal(context.subject.kind, "todo_item");
  assert.equal(context.revision, "1");
  assert.match(context.content, /状态：待处理/u);
  assert.deepEqual(context.open, { surface: "todo", id: mine.id });
  await assert.rejects(f.agent.invoke(todoSearchActions.subject, { subject_id: inA.id }), { code: "todo.not_found" });
  assert.equal((await f.agentA.invoke(todoSearchActions.subject, { subject_id: inA.id })).title, "A 项目的事");
  // What the person changed is said in the page's words, not as stored field names (search shows this text).
  const changed = await f.me.invoke(actions.update, { id: mine.id, expected_revision: mine.revision, due_date: "2026-10-05", planned_date: "2026-10-02" });
  const edited = (await f.agent.invoke(todoSearchActions.subject, { subject_id: mine.id })).content;
  assert.match(edited, /你手动改过：(截止日期、计划处理日期|计划处理日期、截止日期)/u);
  assert.doesNotMatch(edited, /due_date|planned_date/u);
  // Archived reads as gone from use (the readers' shared convention), though Todo still lists it under 已归档.
  const done = await f.me.invoke(actions.status, { id: mine.id, status: "done", expected_revision: changed.item.revision });
  await f.me.invoke(actions.archive, { id: mine.id, archived: true, expected_revision: done.item.revision });
  await assert.rejects(f.agent.invoke(todoSearchActions.subject, { subject_id: mine.id }), { code: "todo.not_found" });
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

test("reminders: due once, late when missed, not delivered after 48 hours, gone once acknowledged or done", async t => {
  let clock = new Date("2026-09-28T10:30:00+08:00");
  const f = fixture(t, () => clock);
  const soon = (await f.me.invoke(actions.create, { title: "交报销单", remind_at: "2026-09-28T10:00:00+08:00" })).item;
  const missed = (await f.me.invoke(actions.create, { title: "给妈妈打电话", remind_at: "2026-09-27T20:00:00+08:00" })).item;
  await f.me.invoke(actions.create, { title: "太久以前", remind_at: "2026-09-25T09:00:00+08:00" });
  await f.me.invoke(actions.create, { title: "还没到", remind_at: "2026-09-28T18:00:00+08:00" });
  const due = await f.me.invoke(actions.dueReminders, {});
  assert.deepEqual(due.reminders.map(entry => [entry.item.title, entry.late]), [["给妈妈打电话", true], ["交报销单", false]]);
  const acked = await f.me.invoke(actions.acknowledgeReminder, { id: soon.id, remind_at: soon.remind_at! });
  assert.ok(acked.item.reminder_acknowledged_at);
  assert.equal(acked.item.revision, soon.revision, "知道了不改待办本身");
  await f.me.invoke(actions.status, { id: missed.id, status: "done" });
  assert.deepEqual((await f.me.invoke(actions.dueReminders, {})).reminders, []);
  // Later: a new time is a new reminder, shown again when it comes.
  await f.me.invoke(actions.update, { id: soon.id, remind_at: "2026-09-28T10:45:00+08:00" });
  assert.equal((await f.me.invoke(actions.dueReminders, {})).reminders.length, 0);
  clock = new Date("2026-09-28T10:50:00+08:00");
  assert.deepEqual((await f.me.invoke(actions.dueReminders, {})).reminders.map(entry => entry.item.title), ["交报销单"]);
  // Another partition's reminders are that partition's own.
  await f.inA.invoke(actions.create, { title: "A 的提醒", remind_at: "2026-09-28T10:40:00+08:00" });
  assert.deepEqual((await f.agent.invoke(actions.dueReminders, {})).reminders.map(entry => entry.item.title), ["交报销单"]);
});

test("work events: due reminders and overdue need attention; due, planned and follow-up days show for today; this partition's only", async t => {
  // Local wall-clock times: "today" and the shown clock follow this computer's time zone.
  const local = (hours: number, minutes = 0) => new Date(2026, 8, 28, hours, minutes);
  const f = fixture(t, () => local(10, 30));
  await f.me.invoke(actions.create, { title: "逾期的", due_date: "2026-09-26" });
  await f.me.invoke(actions.create, { title: "今天截止", due_date: TODAY, status: "waiting", waiting: { who: "小李", what: "预算", follow_up_on: null } });
  await f.me.invoke(actions.create, { title: "计划今天", planned_date: TODAY });
  await f.me.invoke(actions.create, { title: "约好今天问", status: "waiting", waiting: { who: "王总", what: "回复", follow_up_on: TODAY } });
  await f.me.invoke(actions.create, { title: "提醒到了", remind_at: local(10, 15).toISOString() });
  await f.inA.invoke(actions.create, { title: "A 项目逾期", due_date: "2026-09-20" });
  await f.me.invoke(actions.create, { title: "完成了的", due_date: "2026-09-20", status: "done" });
  const window = { from: local(0).toISOString(), to: new Date(2026, 8, 29).toISOString(), now: local(10, 30).toISOString() };
  const collection = await f.agent.invoke(actions.workEvents, window);
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

test("placement carries a todo between partitions: a move keeps its id, dates and history; a copy is a new todo; links to todos here stay behind", async t => {
  const f = fixture(t);
  const other = (await f.inA.invoke(actions.create, { title: "留在 A 的事" })).item;
  const made = (await f.inA.invoke(actions.create, { title: "A 项目的事", due_date: "2026-10-02", remind_at: "2026-10-01T09:00:00+08:00" })).item;
  const linked = (await f.inA.invoke(actions.link, { id: made.id, add: { kind: "todo", subject: { kind: "todo_item", id: other.id }, title: other.title, relation: "related", open: null, outcome: null } })).item;
  const subject = { kind: "todo_item", id: made.id };
  const exported = await f.inA.invoke(actions.placementExport, { subject });
  assert.equal(exported.revision, String(linked.revision));
  // A move: put under the same id, then let it go from A while it is still the revision carried.
  const put = await f.me.invoke(actions.placementPut, { kind: "todo_item", record: exported.record, request_id: "move-1", target_id: made.id });
  assert.deepEqual([put.subject.id, put.project_id], [made.id, PERSONAL_SPACE_PROJECT_ID]);
  assert.deepEqual(await f.me.invoke(actions.placementPut, { kind: "todo_item", record: exported.record, request_id: "move-1", target_id: made.id }), put, "the same put again is a replay");
  const here = await f.me.invoke(actions.get, { id: made.id });
  assert.deepEqual([here.item.title, here.item.due_date, here.item.remind_at, here.item.links.length], ["A 项目的事", "2026-10-02", made.remind_at, 0]);
  assert.deepEqual(here.history.map(change => change.kind), ["create"], "the link to a todo left in A stays behind with its change");
  await assert.rejects(f.inA.invoke(actions.placementRemove, { subject, revision: "1" }), { code: "todo.conflict" });
  assert.deepEqual(await f.inA.invoke(actions.placementRemove, { subject, revision: exported.revision }), { subject, removed: true });
  assert.deepEqual(titles(await f.inA.invoke(actions.list, { view: "all" })), ["留在 A 的事"]);
  // What was written here since is never replaced by a later put of the old record.
  await f.me.invoke(actions.update, { id: made.id, notes: "到了个人空间后补的" });
  await assert.rejects(f.me.invoke(actions.placementPut, { kind: "todo_item", record: exported.record, request_id: "move-1", target_id: made.id }), { code: "todo.conflict" });
  // A copy is a new todo; the same request makes the same copy.
  const copied = await f.inA.invoke(actions.placementPut, { kind: "todo_item", record: (await f.me.invoke(actions.placementExport, { subject })).record, request_id: "copy-1" });
  assert.notEqual(copied.subject.id, made.id);
  assert.deepEqual((await f.inA.invoke(actions.placementPut, { kind: "todo_item", record: exported.record, request_id: "copy-1" })).subject, copied.subject);
  await assert.rejects(f.me.invoke(actions.placementPut, { kind: "todo_item", record: { title: "缺字段" }, request_id: "bad" }), { code: "todo.invalid" });
  await assert.rejects(f.me.invoke(actions.placementPut, { kind: "page", record: exported.record, request_id: "bad-kind" }), { code: "todo.invalid" });
  // Placement is the person's: an Agent does not carry todos.
  await assert.rejects(f.agent.invoke(actions.placementExport, { subject }));
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

test("UPP-31 a todo's reminder is its overview row: the platform reads it into the due registry and a fallen-due entry names the todo while it still stands", async t => {
  const f = fixture(t);
  const overview = () => f.store.database().all("SELECT row_id, title, remind_at, priority FROM molis_overview_rows WHERE kind = 'task' ORDER BY row_id") as { row_id: string; remind_at: string | null }[];
  const find = (id: string) => f.store.find(id);
  const item = (await f.me.invoke(actions.create, { title: "交电费", remind_at: "2026-09-28T02:00:00.000Z", important: true })).item;
  assert.deepEqual(overview().map(row => [row.row_id, row.remind_at]), [[item.id, item.remind_at]]);
  assert.deepEqual(todoDue(`task:${item.id}`, item.remind_at!, find), { reminder: { title: "交电费", open: { surface: "todo", id: item.id } } });
  // A time that has changed since, a reminder seen, a todo done: nothing rings, and done todos leave the overview.
  assert.deepEqual(todoDue(`task:${item.id}`, "2026-09-28T01:00:00.000Z", find), { reminder: null });
  await f.me.invoke(actions.acknowledgeReminder, { id: item.id, remind_at: item.remind_at! });
  assert.equal(overview()[0]!.remind_at, null);
  assert.deepEqual(todoDue(`task:${item.id}`, item.remind_at!, find), { reminder: null });
  await f.me.invoke(actions.status, { id: item.id, status: "done" });
  assert.deepEqual(overview(), []);
  assert.deepEqual(todoDue("event:x", item.remind_at!, find), { reminder: null });
});

test("choices a card may show carry the names a person reads, and still validate by their values", async t => {
  const props = (definition: { action: { input_schema: unknown } }) => (definition.action.input_schema as { properties: Record<string, unknown> }).properties;
  assert.deepEqual(actionFieldOptions(props(actions.status).status), [
    { value: "open", label: "待处理" }, { value: "doing", label: "进行中" }, { value: "waiting", label: "等待他人" }, { value: "done", label: "已完成" }, { value: "cancelled", label: "已取消" }]);
  assert.equal(props(actions.update).placement, undefined);
  assert.deepEqual(actionFieldOptions(props(actions.list).view)?.map(option => option.value), ["today", "waiting", "unscheduled", "upcoming", "all", "closed"]);
  const f = fixture(t);
  const made = (await f.inA.invoke(actions.create, { title: "按名称选", status: "doing" })).item;
  assert.equal(made.status, "doing");
  await assert.rejects(f.inA.invoke(actions.create, { title: "不认识的值", status: "进行中" as never }), { code: "actions.input_invalid" });
});
test("RAC-1655: a todo's title, notes and waiting fields are counted in Unicode characters, as its action schemas count them", async t => {
  // fieldInput in src/actions.ts allows a 200-character title, 10000 characters of notes and an 80/200-character waiting who/what;
  // one 🟢 is one character but two UTF-16 units.
  const f = fixture(t);
  const wide = (count: number) => "🟢".repeat(count);
  const { item } = await f.me.invoke(actions.create, { title: wide(200) });
  assert.equal(item.title, wide(200), "create keeps a 200-character title");
  const noted = (await f.me.invoke(actions.update, { id: item.id, notes: wide(10_000) })).item;
  assert.equal(noted.notes, wide(10_000), "update keeps 10000 characters of notes");
  const waited = (await f.me.invoke(actions.update, { id: item.id, waiting: { who: wide(80), what: wide(200), follow_up_on: null } })).item;
  assert.deepEqual(waited.waiting, { who: wide(80), what: wide(200), follow_up_on: null }, "update keeps an 80-character who and a 200-character what");
  await assert.rejects(f.me.invoke(actions.update, { id: item.id, title: wide(201) }), { code: "actions.input_invalid" }, "201 characters is still past the schema");
});

test("RAC-1656: a todo's sources keep names, excerpts and reasons up to their schema lengths in Unicode characters", async t => {
  // sourceInput in src/actions.ts allows a 200-character name, a 2000-character excerpt and a 500-character reason.
  const f = fixture(t);
  const wide = (count: number) => "🟢".repeat(count);
  const { item } = await f.me.invoke(actions.create, { title: "有来源", sources: [{ kind: "material", title: wide(200), excerpt: wide(2000), reason: wide(500) }] });
  assert.deepEqual(item.sources.map(source => [source.title, source.excerpt, source.reason]), [[wide(200), wide(2000), wide(500)]], "create keeps the source as given");
  await assert.rejects(f.me.invoke(actions.create, { title: "来源名太长", sources: [{ kind: "material", title: wide(201) }] }), { code: "actions.input_invalid" }, "201 characters is still past the schema");
});

test("RAC-1657: a link's name is counted in Unicode characters, as todo.items.link's schema counts it", async t => {
  // linkInput in src/actions.ts allows a 200-character name; organizing names a link after another todo's title, which may be that long.
  const f = fixture(t);
  const wide = (count: number) => "🟢".repeat(count);
  const { item } = await f.me.invoke(actions.create, { title: "有关联" });
  const linked = (await f.me.invoke(actions.link, { id: item.id, add: { kind: "material", subject: { kind: "page", id: "doc-1" }, title: wide(200) } })).item;
  assert.deepEqual(linked.links.map(link => link.title), [wide(200)], "link keeps a 200-character name");
  await assert.rejects(f.me.invoke(actions.link, { id: item.id, add: { kind: "material", subject: { kind: "page", id: "doc-2" }, title: wide(201) } }), { code: "actions.input_invalid" }, "201 characters is still past the schema");
});

test("RAC-1679: a fallen-due reminder names its todo by its whole title, never half a character", async t => {
  // A todo's title is at most 200 characters (RAC-1655) and a reminder's title 300; "a" and 199 🟢 are 200 characters but 399 UTF-16 units.
  const f = fixture(t);
  const title = "a" + "🟢".repeat(199);
  const { item } = await f.me.invoke(actions.create, { title, remind_at: "2026-09-28T02:00:00.000Z" });
  assert.equal(todoDue(`task:${item.id}`, item.remind_at!, id => f.store.find(id)).reminder?.title, title, "a 200-character title is named whole");
});

test("ARF-2 old dismissal cannot acknowledge a rescheduled reminder; title edits preserve the occurrence", async t => {
  const f = fixture(t, () => new Date("2026-09-28T12:00:00Z"));
  const first = "2026-09-28T09:00:00.000Z", next = "2026-09-28T11:00:00.000Z";
  const { item } = await f.me.invoke(actions.create, { title: "Pay invoice", remind_at: first });
  await f.me.invoke(actions.update, { id: item.id, remind_at: next });
  await assert.rejects(f.me.invoke(actions.acknowledgeReminder, { id: item.id, remind_at: first }), { code: "todo.conflict" });
  assert.deepEqual((await f.me.invoke(actions.dueReminders, {})).reminders.map(row => row.item.remind_at), [next]);
  await f.me.invoke(actions.update, { id: item.id, title: "Pay revised invoice" });
  const current = { id: item.id, remind_at: next };
  const acknowledged = await f.me.invoke(actions.acknowledgeReminder, current);
  assert.deepEqual(await f.me.invoke(actions.acknowledgeReminder, current), acknowledged);
  assert.deepEqual((await f.me.invoke(actions.dueReminders, {})).reminders, []);
});

test("ARF-5 mixed and empty batches count only recorded changes and stale observations roll back", async t => {
  const f = fixture(t);
  const { item: undated } = await f.me.invoke(actions.create, { title: "Unscheduled" });
  const { item: dated } = await f.me.invoke(actions.create, { title: "Scheduled", planned_date: TODAY });
  const shift = { shift_days: 1 };
  const empty = await f.me.invoke(actions.batch, { ids: [undated.id], change: shift });
  assert.equal(empty.batch_id, null);
  assert.equal(empty.changed_count, 0);
  const unchanged = await f.me.invoke(actions.batch, { ids: [dated.id, undated.id], change: { status: "open" } });
  assert.equal(unchanged.batch_id, null);
  await f.me.invoke(actions.update, { id: undated.id, title: "Later edit" });
  await assert.rejects(f.me.invoke(actions.batch, { ids: [dated.id, undated.id], change: shift,
    expected_revisions: { [undated.id]: undated.revision } }), { code: "todo.conflict" });
  assert.equal((await f.me.invoke(actions.get, { id: dated.id })).item.planned_date, TODAY);
  const mixed = await f.me.invoke(actions.batch, { ids: [dated.id, undated.id], change: shift });
  assert.equal(mixed.changed_count, 1);
  assert.ok(mixed.batch_id);
  assert.deepEqual((await f.me.invoke(actions.revert, { batch_id: mixed.batch_id })).items.map(item => item.id), [dated.id]);
});
