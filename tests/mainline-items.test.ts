import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, bindActionClient, type ActionCallContext, type ActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { MAINLINE_ARRANGE_PERMISSION, MAINLINE_LIMITS, MAINLINE_PLACE_PERMISSION, MAINLINE_READ_PERMISSION, WORK_ITEM_KIND, mainlineActions, mainlineItemActions, type Mainline,
  type WorkLineEvent } from "@molis-ai/molis-work-contracts/services/mainline";
import { MainlineStore, openMainlineDatabase } from "@molis-ai/molis-work-service-mainline";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { observationKeys, readRecords, snapshotText } from "@molis-ai/molis-work-service-observation";
import { createLazyFileSecretStore } from "@molis-ai/molis-work-storage";
import { backgroundPlugin, type BackgroundPlugin } from "./fixtures/home-background-plugin.js";
import { mainlineRig, notesPlugin } from "./fixtures/mainline-items-plugin.js";

/*
 * Work items on the mainline (specs/work-mainline/contract-design.md §9, MLC-01–MLC-14): one person's container of work in one
 * project. The page, the Assistant and MCP call the same actions; a source is any plugin that declares `item` on a kind, here an
 * installed-style notes plugin the Host has never heard of.
 * QEA-148 checks the current public actions and the same store used by the merged Host.
 * QEA-194 covers default and explicit groups in create, convert, and complete/reopen.
 */

const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;
const person = (projectId: string, change: Partial<ActionCallContext> = {}): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: projectId,
  permissions: [MAINLINE_READ_PERMISSION, MAINLINE_ARRANGE_PERMISSION, MAINLINE_PLACE_PERMISSION, "notes:read", "notes:write", "goals:read", "goals:write", "homebg:read"], ...change });
const groupOf = (mainline: Mainline, itemId: string) => mainline.groups.find(group => group.items.some(entry => entry.item_id === itemId))?.group_id;
const order = (mainline: Mainline, groupId: string) => mainline.groups.find(group => group.group_id === groupId)!.items.map(entry => [entry.item_id, entry.pinned]);

async function rigged(t: import("node:test").TestContext, background?: BackgroundPlugin) {
  const notes = notesPlugin();
  const rig = await mainlineRig(t, { notes, ...(background ? { background } : {}) }, ["A", "B"]);
  const a = rig.project("A"), client: ActionClient = rig.host.actionClient(a);
  const as = (caller: ActionCallContext) => bindActionClient(client, () => caller);
  return { ...rig, notes, client, me: as(person(a.project_id)), as, projectId: a.project_id };
}

test("MLC-01 the first read gives the three default groups and no items; a named item goes to the end of the first group", { timeout: 60_000 }, async t => {
  const { me } = await rigged(t);
  const first = await me.invoke(mainlineItemActions.read, {});
  assert.deepEqual(first.mainline.groups.map(group => [group.group_id, group.default, group.items.length]), [["now", "now", 0], ["next", "next", 0], ["waiting", "waiting", 0]]);
  assert.deepEqual([first.mainline.items, first.mainline.current, first.mainline.recent, first.mainline.completed_total], [[], null, [], 0]);
  assert.ok(first.mainline.groups.every(group => group.name === undefined), "a default group is named by its key, never by stored words");
  const one = await me.invoke(mainlineItemActions.create, { name: "  发布周报  " }), two = await me.invoke(mainlineItemActions.create, { name: "整理反馈" });
  assert.equal(one.item.name, "发布周报");
  assert.deepEqual(order(two.mainline, "now"), [[one.item.item_id, false], [two.item.item_id, false]]);
  const into = await me.invoke(mainlineItemActions.create, { name: "等回复", group_id: "waiting" });
  assert.equal(groupOf(into.mainline, into.item.item_id), "waiting");
  await assert.rejects(me.invoke(mainlineItemActions.create, { name: "x", from: { kind: "note", id: "n" } } as never), code("actions.input_invalid"), "one way of making an item at a time");
});

test("MLC-02 MLC-03 moving, pinning and regrouping take effect at once and are kept; deleting a group gives its items to the one before it, none lost", { timeout: 60_000 }, async t => {
  const { me } = await rigged(t);
  const ids: string[] = [];
  for (const name of ["一", "二", "三"]) ids.push((await me.invoke(mainlineItemActions.create, { name })).item.item_id);
  let mainline = (await me.invoke(mainlineItemActions.read, {})).mainline;
  mainline = (await me.invoke(mainlineItemActions.move, { expected_revision: mainline.revision, item_id: ids[2]!, group_id: "now", index: 0, pinned: true })).mainline;
  assert.deepEqual(order(mainline, "now"), [[ids[2], true], [ids[0], false], [ids[1], false]], "pinned first");
  mainline = (await me.invoke(mainlineItemActions.move, { expected_revision: mainline.revision, item_id: ids[1]!, group_id: "now", index: 0 })).mainline;
  assert.deepEqual(order(mainline, "now"), [[ids[2], true], [ids[1], false], [ids[0], false]], "an unpinned item moves only among the unpinned");
  mainline = (await me.invoke(mainlineItemActions.move, { expected_revision: mainline.revision, item_id: ids[0]!, group_id: "next", index: 5 })).mainline;
  assert.equal(groupOf(mainline, ids[0]!), "next");
  // Read again from the store: the order holds.
  assert.deepEqual((await me.invoke(mainlineItemActions.read, {})).mainline.groups, mainline.groups);

  // A group of the person's own, renamed, moved and deleted: its items go to the group before it.
  mainline = (await me.invoke(mainlineItemActions.groups, { expected_revision: mainline.revision, op: "add", name: "本周", index: 1 })).mainline;
  const mine = mainline.groups[1]!.group_id;
  mainline = (await me.invoke(mainlineItemActions.groups, { expected_revision: mainline.revision, op: "rename", group_id: mine, name: "这周" })).mainline;
  assert.deepEqual([mainline.groups[1]!.name, mainline.groups[1]!.default], ["这周", undefined]);
  mainline = (await me.invoke(mainlineItemActions.move, { expected_revision: mainline.revision, item_id: ids[1]!, group_id: mine, index: 0 })).mainline;
  mainline = (await me.invoke(mainlineItemActions.groups, { expected_revision: mainline.revision, op: "move", group_id: mine, index: 3 })).mainline;
  assert.equal(mainline.groups.at(-1)!.group_id, mine);
  mainline = (await me.invoke(mainlineItemActions.groups, { expected_revision: mainline.revision, op: "delete", group_id: mine })).mainline;
  assert.equal(groupOf(mainline, ids[1]!), "waiting", "to the group before it");
  assert.equal(mainline.groups.flatMap(group => group.items).length, 3, "none lost");
  mainline = (await me.invoke(mainlineItemActions.groups, { expected_revision: mainline.revision, op: "delete", group_id: "now" })).mainline;
  assert.equal(groupOf(mainline, ids[2]!), "next", "the first group's items go to the one after it");
  assert.deepEqual(order(mainline, "next")[0], [ids[2], true], "a pinned item stays ahead");
});

test("MLC-04 a stale revision is refused with the current mainline; adding an item or switching needs none", { timeout: 60_000 }, async t => {
  const { me } = await rigged(t);
  const { item, mainline } = await me.invoke(mainlineItemActions.create, { name: "一" });
  await me.invoke(mainlineItemActions.switch, { item_id: item.item_id });
  const current = (await me.invoke(mainlineItemActions.read, {})).mainline;
  for (const write of [
    () => me.invoke(mainlineItemActions.move, { expected_revision: mainline.revision, item_id: item.item_id, group_id: "next", index: 0 }),
    () => me.invoke(mainlineItemActions.rename, { expected_revision: mainline.revision, item_id: item.item_id, name: "二" }),
    () => me.invoke(mainlineItemActions.complete, { expected_revision: mainline.revision, item_id: item.item_id, completed: true }),
    () => me.invoke(mainlineItemActions.groups, { expected_revision: mainline.revision, op: "add", name: "x" }),
  ]) {
    await assert.rejects(write(), (error: unknown) => code("mainline.conflict")(error) && (error as ActionError).details?.current !== undefined
      && ((error as ActionError).details!.current as Mainline).revision === current.revision);
  }
  assert.deepEqual((await me.invoke(mainlineItemActions.read, {})).mainline, current, "nothing changed");
});

test("QEA-149 a stale conversion creates no Goal, and retry with the current arrangement creates it once", { timeout: 60_000 }, async t => {
  const { me, notes } = await rigged(t);
  const original = await me.invoke(mainlineItemActions.create, { name: "旧名字" });
  notes.state.notes.set("held-note", { id: "held-note", title: "相关笔记", status: "open" });
  const held = { kind: "note", id: "held-note" };
  await me.invoke(mainlineItemActions.holdsBind, { subject: held, target: { kind: WORK_ITEM_KIND, id: original.item.item_id } });
  const { mainline: current } = await me.invoke(mainlineItemActions.rename, {
    expected_revision: original.mainline.revision, item_id: original.item.item_id, name: "当前事项的名字",
  });
  const request = { item_id: original.item.item_id, kind: "goal", request_id: "qea149-same-conversion" };
  const before = (await me.invoke(goalsActions.list, {})).goals;
  await assert.rejects(me.invoke(mainlineItemActions.convert, { ...request, expected_revision: original.mainline.revision }),
    (error: unknown) => error instanceof ActionError && error.code === "mainline.conflict"
      && (error.details?.current as Mainline | undefined)?.revision === current.revision);
  assert.deepEqual((await me.invoke(mainlineItemActions.read, {})).mainline, current);
  assert.deepEqual((await me.invoke(goalsActions.list, {})).goals, before, "an already-stale request cannot write a Goal");

  const converted = await me.invoke(mainlineItemActions.convert, { ...request, expected_revision: current.revision });
  assert.equal(converted.item.item_id, original.item.item_id);
  assert.equal(converted.item.source?.kind, "goal");
  const after = (await me.invoke(goalsActions.list, {})).goals;
  assert.equal(after.length, before.length + 1);
  assert.equal(after.find(goal => goal.goal_id === converted.item.source?.id)?.title, "当前事项的名字");
  assert.deepEqual((await me.invoke(mainlineItemActions.contents, { item_id: original.item.item_id })).held, [held]);
});

test("MLC-05 an object becomes an item read as the caller, once; 「建成」 asks its source; a kind without a declared source offers neither", { timeout: 60_000 }, async t => {
  const { me, as, projectId, notes } = await rigged(t);
  notes.state.notes.set("n1", { id: "n1", title: "笔记一", status: "open" });
  notes.state.memos.add("m1");
  const read = await me.invoke(mainlineItemActions.read, {});
  assert.deepEqual(read.sources, [{ kind: "goal", owner: "io.molis.work.goals", create: true, next: true }, { kind: "note", owner: "io.molis.work.example.notes", create: true, next: true }],
    "each declared kind, with what its source offers; Goals is one source among others");
  const reader = as(person(projectId, { permissions: [MAINLINE_READ_PERMISSION, MAINLINE_ARRANGE_PERMISSION, "notes:read"] }));
  assert.deepEqual((await reader.invoke(mainlineItemActions.read, {})).sources, [{ kind: "goal", owner: "io.molis.work.goals", create: false, next: false },
    { kind: "note", owner: "io.molis.work.example.notes", create: false, next: true }], "a part the caller cannot call is not offered; the kind still takes an existing object");
  const made = await me.invoke(mainlineItemActions.create, { from: { kind: "note", id: "n1" } });
  assert.deepEqual([made.item.source, made.item.name], [{ kind: "note", id: "n1" }, undefined], "an object's item has no name of its own");
  const again = await me.invoke(mainlineItemActions.create, { from: { kind: "note", id: "n1" }, group_id: "next" });
  assert.equal(again.item.item_id, made.item.item_id, "the same object gives back its item");
  assert.equal(again.mainline.groups.flatMap(group => group.items).length, 1);
  await assert.rejects(me.invoke(mainlineItemActions.create, { from: { kind: "note", id: "missing" } }), code("mainline.subject_unreadable"));
  await assert.rejects(me.invoke(mainlineItemActions.create, { from: { kind: "memo", id: "m1" } }), code("mainline.source_unavailable"), "a kind with no item source");
  await assert.rejects(me.invoke(mainlineItemActions.create, { create_as: { kind: "memo", name: "x" } }), code("mainline.source_unavailable"));
  // 「建成笔记」: the source makes the note as the caller, then it is an item.
  const built = await me.invoke(mainlineItemActions.create, { create_as: { kind: "note", name: "新笔记" } });
  assert.deepEqual(notes.state.creates.map(call => [call.name, call.audience]), [["新笔记", "user"]]);
  assert.deepEqual(built.item.source, { kind: "note", id: "note-1" });
  // 「变成笔记」: a light item becomes a note under its name and keeps what it holds.
  const light = await me.invoke(mainlineItemActions.create, { name: "先记下" });
  await me.invoke(mainlineItemActions.holdsBind, { subject: { kind: "note", id: "n1" }, target: { kind: WORK_ITEM_KIND, id: light.item.item_id } });
  const converted = await me.invoke(mainlineItemActions.convert, { expected_revision: light.mainline.revision, item_id: light.item.item_id, kind: "note" });
  assert.deepEqual([converted.item.name, converted.item.source, notes.state.notes.get(converted.item.source!.id)?.title], [undefined, { kind: "note", id: "note-2" }, "先记下"]);
  assert.deepEqual((await me.invoke(mainlineItemActions.contents, { item_id: light.item.item_id })).held, [{ kind: "note", id: "n1" }]);
});

const WINDOW = { from: "2026-11-14T00:00:00.000Z", to: "2026-11-21T00:00:00.000Z", now: "2026-11-15T10:00:00.000Z" };
const SOURCE = { surface: "example", title: "示例", icon: "list" };
const task = (id: string, extra: Record<string, unknown> = {}) => ({ subject: { kind: "homebg_task", id }, title: `任务 ${id}`, state: "running", details: [], waiting: false,
  updated_at: "2026-11-15T08:00:00.000Z", executor: { kind: "plugin", label: "示例" }, serves: [], scope: "project", commands: [], decisions: [], open: null, ...extra });
const N1 = { kind: "note", id: "n1" }, T1 = { kind: "homebg_task", id: "t1" }, T2 = { kind: "homebg_task", id: "t2" };

test("MLC-06 putting in and taking out change only the relation; removing an item deletes neither what it held nor its source", { timeout: 60_000 }, async t => {
  const { me, notes } = await rigged(t);
  for (const id of ["n1", "n2"]) notes.state.notes.set(id, { id, title: `笔记 ${id}`, status: "open" });
  const light = (await me.invoke(mainlineItemActions.create, { name: "收拾" })).item, from = (await me.invoke(mainlineItemActions.create, { from: { kind: "note", id: "n2" } })).item;
  const at = { kind: WORK_ITEM_KIND, id: light.item_id };
  const before = (await me.invoke(mainlineItemActions.read, {})).mainline.revision;
  assert.deepEqual(await me.invoke(mainlineItemActions.holdsBind, { subject: N1, target: at }), { targets: [at] });
  assert.deepEqual(await me.invoke(mainlineItemActions.holdsBind, { subject: N1, target: at }), { targets: [at] }, "twice is once");
  assert.equal((await me.invoke(mainlineItemActions.read, {})).mainline.revision, before, "what an item holds is not its arrangement");
  assert.deepEqual(await me.invoke(mainlineItemActions.holdsList, { subject: N1 }), { targets: [at] });
  assert.deepEqual(await me.invoke(mainlineItemActions.holdsRelease, { subject: N1, target: at }), { targets: [] });
  assert.ok(notes.state.notes.has("n1"), "taken out, not deleted");
  await me.invoke(mainlineItemActions.holdsBind, { subject: N1, target: at });
  const removed = await me.invoke(mainlineItemActions.remove, { expected_revision: before, item_id: light.item_id });
  await me.invoke(mainlineItemActions.remove, { expected_revision: removed.mainline.revision, item_id: from.item_id });
  assert.deepEqual([notes.state.notes.has("n1"), notes.state.notes.has("n2")], [true, true], "neither what it held nor its source");
  assert.deepEqual(await me.invoke(mainlineItemActions.holdsList, { subject: N1 }), { targets: [] }, "the relation went with the item");
  await assert.rejects(me.invoke(mainlineItemActions.contents, { item_id: light.item_id }), code("mainline.item_missing"));
  // 「新建一件放进去」: a light item made around the object.
  const made = await me.invoke(mainlineItemActions.holdsCreate, { subject: N1, name: "新的一件" });
  assert.equal(made.targets.length, 1);
  assert.deepEqual((await me.invoke(mainlineItemActions.contents, { item_id: made.targets[0]!.id })).held, [N1]);
});

test("MLC-07 the store keeps names, references and the arrangement only: no object's title, state or body", { timeout: 60_000 }, async t => {
  const { me, notes, home } = await rigged(t);
  notes.state.notes.set("n1", { id: "n1", title: "只在插件里的标题", status: "review", due_at: "2027-03-09T09:00:00.000Z" });
  notes.state.related.set("n1", [{ kind: "memo", id: "m1" }]);
  const { item } = await me.invoke(mainlineItemActions.create, { from: N1 });
  const light = (await me.invoke(mainlineItemActions.create, { name: "我自己起的名字" })).item;
  await me.invoke(mainlineItemActions.holdsBind, { subject: N1, target: { kind: WORK_ITEM_KIND, id: light.item_id } });
  await me.invoke(mainlineActions.line, { ...WINDOW, item: item.item_id });
  const db = openMainlineDatabase(home);
  try {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'mainline_%' ORDER BY name").all() as Array<{ name: string }>).map(row => row.name);
    assert.deepEqual(tables, ["mainline_arrangements", "mainline_holds", "mainline_items"]);
    const columns = tables.flatMap(table => (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(column => column.name));
    assert.deepEqual(columns.filter(name => /title|status|state|body|content|summary|due|next/u.test(name)), [], "no column for anything the owner keeps");
    const dump = JSON.stringify(tables.map(table => db.prepare(`SELECT * FROM ${table}`).all()));
    assert.ok(dump.includes("我自己起的名字") && dump.includes("\"n1\""), "a light item's name and the references are there");
    for (const words of ["只在插件里的标题", "正文", "review", "2027-03-09", "m1"]) assert.ok(!dump.includes(words), `nothing of the object: ${words}`);
  } finally { db.close(); }
});

test("MLC-08 another person's item, another project's item and an object the caller cannot read are refused, each with a diagnostic row", { timeout: 60_000 }, async t => {
  const { me, as, host, projectId, project, notes } = await rigged(t);
  notes.state.notes.set("n1", { id: "n1", title: "笔记一", status: "open" });
  const { item, mainline } = await me.invoke(mainlineItemActions.create, { name: "我的" });
  const at = { kind: WORK_ITEM_KIND, id: item.item_id };
  const someone = as(person(projectId, { actor_id: "someone-else" }));
  assert.deepEqual((await someone.invoke(mainlineItemActions.read, {})).mainline.items, [], "each person has a mainline of their own");
  await assert.rejects(someone.invoke(mainlineItemActions.contents, { item_id: item.item_id }), code("mainline.item_missing"));
  await assert.rejects(someone.invoke(mainlineItemActions.holdsBind, { subject: N1, target: at }), code("mainline.item_missing"));
  await assert.rejects(someone.invoke(mainlineItemActions.switch, { item_id: item.item_id }), code("mainline.item_missing"));
  await assert.rejects(someone.invoke(mainlineItemActions.subject, { subject_id: item.item_id }), code("mainline.item_missing"));
  const b = project("B"), there = bindActionClient(host.actionClient(b), () => person(b.project_id));
  await assert.rejects(there.invoke(mainlineItemActions.contents, { item_id: item.item_id }), code("mainline.item_missing"));
  await assert.rejects(there.invoke(mainlineItemActions.rename, { expected_revision: "0", item_id: item.item_id, name: "改" }), code("mainline.item_missing"));
  await assert.rejects(me.invoke(mainlineItemActions.holdsBind, { subject: { kind: "note", id: "nobody-reads-this" }, target: at }), code("mainline.subject_unreadable"));
  await assert.rejects(me.invoke(mainlineItemActions.holdsBind, { subject: at, target: at }), code("actions.input_invalid"), "an item does not hold an item");
  const unread = as(person(projectId, { permissions: [MAINLINE_READ_PERMISSION, MAINLINE_ARRANGE_PERMISSION] }));
  await assert.rejects(unread.invoke(mainlineItemActions.create, { from: N1 }), code("mainline.subject_unreadable"), "a caller without the owner's grant reads nothing");
  await assert.rejects(as(person(projectId, { audience: "workflow" })).invoke(mainlineItemActions.move, { expected_revision: mainline.revision, item_id: item.item_id, group_id: "next", index: 0 }),
    code("actions.forbidden"), "a workflow does not arrange anyone's mainline");
  assert.deepEqual((await me.invoke(mainlineItemActions.read, {})).mainline, mainline, "nothing changed");
  const rows = host.callLog!.list(projectId).filter(row => row.capability_id.startsWith("mainline."));
  for (const [capability, expected] of [["mainline.items.contents", "mainline.item_missing"], ["mainline.holds.bind", "mainline.item_missing"], ["mainline.switch", "mainline.item_missing"],
    ["mainline.holds.bind", "mainline.subject_unreadable"], ["mainline.items.create", "mainline.subject_unreadable"], ["mainline.items.move", "actions.forbidden"]] as const) {
    assert.ok(rows.some(row => row.capability_id === capability && !row.ok && row.code === expected), `a row for ${capability} refused with ${expected}: ${JSON.stringify(rows.map(row => [row.capability_id, row.code, row.actor_id]))}`);
  }
  assert.ok(host.callLog!.list(b.project_id).some(row => row.capability_id === "mainline.items.rename" && row.code === "mainline.item_missing"), "and in the other project");
  assert.ok(!JSON.stringify(host.callLog!.list(projectId)).includes("笔记一"));
});

test("MLC-09 MLC-10 an installed plugin's object is an item with its next step; a line read for the item gives its events, held objects with a time role and the step first ahead", { timeout: 60_000 }, async t => {
  const background = backgroundPlugin(() => ({ source: SOURCE, tasks: [] }));
  const { me, notes } = await rigged(t, background);
  notes.state.notes.set("n1", { id: "n1", title: "发布说明", status: "open" });
  notes.state.notes.set("n2", { id: "n2", title: "要交的稿", status: "open", due_at: "2026-11-17T09:00:00.000Z" });
  notes.state.notes.set("n3", { id: "n3", title: "开过的会", status: "done", happened_at: "2026-11-14T15:00:00.000Z" });
  notes.state.notes.set("n4", { id: "n4", title: "等你验收", status: "review" });
  notes.state.notes.set("n5", { id: "n5", title: "没有时间的", status: "open" });
  notes.state.next.set("n1", { text: "写完第二节", waiting_on: "等设计稿" });
  notes.state.related.set("n1", [{ kind: "homebg_item", id: "release" }]);
  background.state.events = () => ({ source: SOURCE, events: [
    { event_id: "e-in", subject: { kind: "homebg_item", id: "release" }, title: "说明上线", summary: "", content: "", facts: [], category: "personal", placement: "active", occurred_at: "2026-11-15T09:00:00.000Z", needs_attention: false, open: null },
    { event_id: "e-out", subject: { kind: "homebg_item", id: "elsewhere" }, title: "别的事", summary: "", content: "", facts: [], category: "personal", placement: "active", occurred_at: "2026-11-15T09:00:00.000Z", needs_attention: false, open: null },
  ] });
  const { item } = await me.invoke(mainlineItemActions.create, { from: N1 });
  for (const id of ["n2", "n3", "n4", "n5"]) await me.invoke(mainlineItemActions.holdsBind, { subject: { kind: "note", id }, target: { kind: WORK_ITEM_KIND, id: item.item_id } });
  const values = notes.state.valuesCalls;
  const line = await me.invoke(mainlineActions.line, { ...WINDOW, item: item.item_id });
  const shown = (event: WorkLineEvent) => [event.wing, event.subject.id, event.suggestion ? "suggestion" : event.title, event.waiting];
  assert.deepEqual(line.events.map(shown), [
    ["done", "n3", "开过的会", false],
    ["now", "n4", "等你验收", true], ["now", "release", "说明上线", false],
    ["next", "n1", "suggestion", false], ["next", "n2", "要交的稿", false],
  ], "the event of what the source relates, three held objects by their time roles, the source's next step first ahead; nothing outside the item, nothing without a time");
  assert.deepEqual(line.events.find(event => event.suggestion)!.suggestion, { text: "写完第二节", waiting_on: "等设计稿" });
  assert.equal(notes.state.valuesCalls - values, 1, "held objects read once per kind");
  assert.equal(notes.state.nextCalls, 1);
  assert.deepEqual(line.issues, []);
  // The whole line has no item to scope it: the other event is there, the held objects and the suggestion are not.
  const whole = await me.invoke(mainlineActions.line, WINDOW);
  assert.deepEqual(whole.events.map(event => event.subject.id).sort(), ["elsewhere", "release"]);
  // A light item has no source to ask; its line is what it holds. None of this asked Goals for anything.
  const light = (await me.invoke(mainlineItemActions.create, { name: "空的" })).item;
  assert.deepEqual((await me.invoke(mainlineActions.line, { ...WINDOW, item: light.item_id })).events, []);
  await assert.rejects(me.invoke(mainlineActions.line, { ...WINDOW, item: "no-such-item" }), code("mainline.item_missing"));
});

test("MLC-11 MLC-14 placing a task into an item, into another, or into none changes only what holds it; the task runs on; an item reads by its name", { timeout: 60_000 }, async t => {
  const background = backgroundPlugin(() => ({ source: SOURCE, tasks: [task("t1", { serves: [N1] })] }));
  background.state.serves.set("t1", [N1]);
  const { me, notes, client, projectId } = await rigged(t, background);
  notes.state.notes.set("n1", { id: "n1", title: "笔记一", status: "open" });
  const one = (await me.invoke(mainlineItemActions.create, { name: "第一件" })).item, two = (await me.invoke(mainlineItemActions.create, { from: N1 })).item;
  const place = (item: unknown) => me.invoke(mainlineActions.place, { task: T1, item } as never);
  assert.deepEqual(await place({ kind: "item", item_id: one.item_id }), { task: T1, serves: [N1], items: [{ kind: WORK_ITEM_KIND, id: one.item_id }] });
  assert.deepEqual(await place({ kind: "item", item_id: two.item_id }), { task: T1, serves: [N1], items: [{ kind: WORK_ITEM_KIND, id: two.item_id }] }, "into another: only that one");
  assert.deepEqual(await me.invoke(mainlineItemActions.holdsList, { subject: T1 }), { targets: [{ kind: WORK_ITEM_KIND, id: two.item_id }] });
  assert.deepEqual((await me.invoke(mainlineItemActions.contents, { item_id: one.item_id })).held, []);
  assert.deepEqual(await place({ kind: "none" }), { task: T1, serves: [N1], items: [] });
  assert.deepEqual([background.state.stops, background.state.servesCalls.filter(call => call.role !== "list")], [[], []], "the task was not stopped, redone or re-placed");
  assert.deepEqual((await client.invoke(person(projectId), mainlineActions.tasks, {})).tasks.map(row => [row.subject.id, row.state]), [["t1", "running"]]);
  await assert.rejects(place({ kind: "item" }), code("actions.input_invalid"));
  await assert.rejects(place({ kind: "item", item_id: "nope" }), code("mainline.item_missing"));
  await assert.rejects(me.invoke(mainlineActions.place, { task: { kind: "homebg_task", id: "not-on-my-table" }, item: { kind: "none" } } as never), (error: unknown) => error instanceof ActionError);
  // MLC-14: an item as a subject reads by its name; one an object became, by the object's title as the caller reads it.
  assert.equal((await me.invoke(mainlineItemActions.subject, { subject_id: one.item_id })).title, "第一件");
  assert.equal((await me.invoke(mainlineItemActions.subject, { subject_id: two.item_id })).title, "笔记一");
  assert.equal((await me.invoke(mainlineActions.open, { subject: { kind: WORK_ITEM_KIND, id: one.item_id } })).title, "第一件", "found by kind like any object");
});

test("B36F-06 S-mainline-own-line: failed or unauthorized task placement retains the original item", { timeout: 60_000 }, async t => {
  const background = backgroundPlugin(() => ({ source: SOURCE, tasks: [task(T1.id, { serves: [N1] })] }));
  background.state.serves.set(T1.id, [N1]);
  const { me, as, home, projectId } = await rigged(t, background);
  const { item: from } = await me.invoke(mainlineItemActions.create, { name: "原事项" });
  const { item: full } = await me.invoke(mainlineItemActions.create, { name: "已满" });
  await me.invoke(mainlineActions.place, { task: T1, item: { kind: "item", item_id: from.item_id } });
  const db = openMainlineDatabase(home);
  try {
    const store = new MainlineStore(db, LOCAL_PERSON_ACTOR_ID, projectId);
    for (let i = 0; i < MAINLINE_LIMITS.held; i++) store.hold(full.item_id, { kind: "note", id: `fixture-${i}` });
  } finally { db.close(); }

  await assert.rejects(me.invoke(mainlineActions.place, { task: T1, item: { kind: "item", item_id: full.item_id } }), code("mainline.limit"));
  // MR21-04: an event and a full item together are refused before the task's owner records the event.
  await assert.rejects(me.invoke(mainlineActions.place, { task: T1, to: { kind: "none" }, item: { kind: "item", item_id: full.item_id } }), code("mainline.limit"));
  assert.deepEqual(background.state.serves.get(T1.id), [N1], "a combined request the item refuses leaves the task's event as it was");
  const onlyEvent = as(person(projectId, { permissions: [MAINLINE_PLACE_PERMISSION, "homebg:read"] }));
  await assert.rejects(onlyEvent.invoke(mainlineActions.place, { task: T1, to: { kind: "none" }, item: { kind: "none" } }), code("actions.forbidden"));
  assert.deepEqual(background.state.serves.get(T1.id), [N1], "the denied combined request never changes the task owner's relation");
  const withdrawn = as(person(projectId, { validate_permissions: permissions => {
    if (permissions.includes(MAINLINE_ARRANGE_PERMISSION)) throw new ActionError("actions.forbidden", "withdrawn");
  } }));
  await assert.rejects(withdrawn.invoke(mainlineActions.place, { task: T1, item: { kind: "none" } }), code("actions.forbidden"));
  const combined = { task: T1, to: { kind: "none" }, item: { kind: "none" } } as const;
  await assert.rejects(withdrawn.invoke(mainlineActions.place, combined), code("actions.forbidden"));
  const withdrawnAtOwner = as(person(projectId, { assert_authority_current: (ref, permissions) => {
    if (ref?.capability_id === "homebg.serves.release" && permissions?.includes(MAINLINE_ARRANGE_PERMISSION)) {
      throw new ActionError("actions.forbidden", "withdrawn at owner");
    }
  } }));
  await assert.rejects(withdrawnAtOwner.invoke(mainlineActions.place, combined), code("actions.forbidden"));
  await assert.rejects(me.invoke(mainlineActions.place, { ...combined, item: { kind: "item" } }), code("actions.input_invalid"));
  assert.ok(background.state.servesCalls.every(call => call.role === "list"), "the owner never handles a denied write");
  assert.deepEqual(background.state.serves.get(T1.id), [N1], "the original event is kept");
  assert.deepEqual(await me.invoke(mainlineItemActions.holdsList, { subject: T1 }), { targets: [{ kind: WORK_ITEM_KIND, id: from.item_id }] });
  assert.deepEqual(await onlyEvent.invoke(mainlineActions.place, { task: T1, to: { kind: "none" } }), { task: T1, serves: [] });
});

test("MLC-12 putting in, moving, switching and completing each leave one work record with the actor and the item, and no object's body; the contract has no status flow, assignee, due or comment", { timeout: 60_000 }, async t => {
  const { me, host, home, notes, projectId } = await rigged(t);
  notes.state.notes.set("n1", { id: "n1", title: "只在插件里的标题", status: "open" });
  const { item, mainline } = await me.invoke(mainlineItemActions.create, { name: "一件" });
  await me.invoke(mainlineItemActions.holdsBind, { subject: N1, target: { kind: WORK_ITEM_KIND, id: item.item_id } });
  const moved = await me.invoke(mainlineItemActions.move, { expected_revision: mainline.revision, item_id: item.item_id, group_id: "next", index: 0 });
  await me.invoke(mainlineItemActions.switch, { item_id: item.item_id });
  await me.invoke(mainlineItemActions.complete, { expected_revision: (await me.invoke(mainlineItemActions.read, {})).mainline.revision, item_id: item.item_id, completed: true });
  assert.ok(moved);
  const layer = host.observation!.layer; layer.flush();
  const keys = observationKeys(createLazyFileSecretStore(home), () => true), db = layer.writer.database()!.db;
  const kept = (record: { evidence: Array<{ role: string; ref: { kind: string; digest?: string } }> }) => record.evidence
    .map(entry => entry.ref.kind === "snapshot" ? snapshotText(db, keys, entry.ref.digest!) ?? "" : "").join("\n");
  const records = readRecords(layer.writer.database()!.db, { limit: 5000 }).filter(record => record.fact === "action.call" && String(record.detail.action).startsWith("mainline.")
    && record.project_id === projectId);
  for (const action of ["mainline.holds.bind@1", "mainline.items.move@1", "mainline.switch@1", "mainline.items.complete@1"]) {
    const mine = records.filter(record => record.detail.action === action);
    assert.equal(mine.length, 1, `one record for ${action}`);
    assert.equal(mine[0]!.actor.actor_id, LOCAL_PERSON_ACTOR_ID);
    assert.equal(mine[0]!.outcome, "succeeded");
    assert.ok(kept(mine[0]!).includes(item.item_id), `${action} names the item`);
  }
  const all = JSON.stringify(records) + records.map(kept).join("\n");
  assert.ok(!all.includes("只在插件里的标题") && !all.includes("正文"), "no object's title or body");
  // MLN-22: the contract carries no status flow, assignee, due date or comments.
  const shapes = JSON.stringify(Object.values(mainlineItemActions).map(definition => [definition.action.input_schema, definition.action.output_schema]));
  for (const field of ["status", "assignee", "owner_id", "due", "deadline", "comment", "priority"]) assert.ok(!shapes.includes(`"${field}`), `no ${field}`);
});

test("MLC-13 a 「建成」 retried under the same request makes one object; two asked in one operation make two; a next step that starts another provider's action is refused; counts come from one task read", { timeout: 60_000 }, async t => {
  const background = backgroundPlugin(() => ({ source: SOURCE, tasks: [task("t1", { serves: [N1], waiting: true, state: "waiting" }), task("t2"), task("t3")] }));
  for (const id of ["t1", "t2", "t3"]) background.state.serves.set(id, id === "t1" ? [N1] : []);
  const { me, as, notes, projectId } = await rigged(t, background);
  notes.state.notes.set("n1", { id: "n1", title: "笔记一", status: "open" });
  notes.state.failAfterCreate = true;
  await assert.rejects(me.invoke(mainlineItemActions.create, { create_as: { kind: "note", name: "周报" }, request_id: "r-1" }), code("notes.lost"));
  assert.equal((await me.invoke(mainlineItemActions.read, {})).mainline.items.length, 0, "nothing on the mainline after the lost answer");
  const retried = await me.invoke(mainlineItemActions.create, { create_as: { kind: "note", name: "周报" }, request_id: "r-1" });
  assert.deepEqual([retried.item.source, notes.state.made.size], [{ kind: "note", id: "note-1" }, 1], "the same object, made once");
  assert.equal(new Set(notes.state.creates.map(call => call.request_id)).size, 1);
  // One operation (one call id) asking for two different objects gets two.
  const operation = as(person(projectId, { call_id: "one-operation" }));
  const a = await operation.invoke(mainlineItemActions.create, { create_as: { kind: "note", name: "甲" } }), b = await operation.invoke(mainlineItemActions.create, { create_as: { kind: "note", name: "乙" } });
  assert.notEqual(a.item.source!.id, b.item.source!.id);
  // A conversion whose source has already committed can race a later arrangement edit.
  const light = await me.invoke(mainlineItemActions.create, { name: "先记下" });
  const beforeConversion = notes.state.made.size;
  const created = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>();
  notes.state.afterCreate = () => { created.resolve(); return finish.promise; };
  const pending = me.invoke(mainlineItemActions.convert, { expected_revision: light.mainline.revision, item_id: light.item.item_id, kind: "note", request_id: "c-1" });
  try {
    await Promise.race([created.promise, pending.then(() => assert.fail("the source must be held before the arrangement changes"))]);
    assert.equal(notes.state.made.size, beforeConversion + 1);
    await me.invoke(mainlineItemActions.move, { expected_revision: light.mainline.revision, item_id: light.item.item_id, group_id: "next", index: 0 });
  } finally {
    notes.state.afterCreate = undefined;
    finish.resolve();
  }
  await assert.rejects(pending, code("mainline.conflict"));
  const current = (await me.invoke(mainlineItemActions.read, {})).mainline.revision, made = notes.state.made.size;
  const converted = await me.invoke(mainlineItemActions.convert, { expected_revision: current, item_id: light.item.item_id, kind: "note", request_id: "c-1" });
  assert.equal(notes.state.made.size, made, "the note the conflicted call made is the one the item became");
  assert.equal(notes.state.notes.get(converted.item.source!.id)!.title, "先记下");

  // A next step whose `start` names another provider's action is not shown; the line says so.
  const n1 = (await me.invoke(mainlineItemActions.create, { from: N1 })).item;
  notes.state.next.set("n1", { text: "去别处开工", start: { action: { capability_id: "goals.list", version: 1, provider_id: "io.molis.work.goals" }, input: {} } });
  const line = await me.invoke(mainlineActions.line, { ...WINDOW, item: n1.item_id });
  assert.deepEqual(line.events.filter(event => event.suggestion), []);
  assert.deepEqual(line.issues.map(issue => [issue.source.capability_id, issue.code]), [["notes.items.next", "mainline.owner_answer_invalid"]]);

  // Counts: t1 serves the note an item became, t2 is held by it, t3 by nothing; one read of the task table for all of it.
  await me.invoke(mainlineActions.place, { task: T2, item: { kind: "item", item_id: n1.item_id } } as never);
  const calls = background.state.calls.length;
  const read = await me.invoke(mainlineItemActions.read, { counts: true });
  assert.equal(background.state.calls.length - calls, 1, "the task table read once");
  assert.deepEqual(read.counts!.items[n1.item_id], { waiting: 1, running: 1 });
  const group = read.mainline.groups.find(entry => entry.items.some(item => item.item_id === n1.item_id))!.group_id;
  assert.deepEqual(read.counts!.groups[group], { waiting: 1, running: 1 });
  assert.equal((await me.invoke(mainlineItemActions.read, {})).counts, undefined, "no counts unless asked");
});

test("MLC-05 MLC-13 Goals is a source like any other: 「建成目标」 under one request makes one goal, and its next step is read as the caller", { timeout: 60_000 }, async t => {
  const { me } = await rigged(t);
  const first = await me.invoke(mainlineItemActions.create, { create_as: { kind: "goal", name: "发布 1.0" }, request_id: "g-1" });
  const again = await me.invoke(mainlineItemActions.create, { create_as: { kind: "goal", name: "发布 1.0" }, request_id: "g-1" });
  assert.equal(first.item.source!.kind, "goal");
  assert.deepEqual([again.item.item_id, again.mainline.items.length], [first.item.item_id, 1], "the same goal, one item");
  assert.equal((await me.invoke(mainlineItemActions.subject, { subject_id: first.item.item_id })).title, "发布 1.0", "named by the goal as Goals reads it");
  const line = await me.invoke(mainlineActions.line, { ...WINDOW, item: first.item.item_id });
  assert.deepEqual(line.issues, []);
  assert.ok(line.events.filter(event => event.suggestion).every(event => event.wing === "next" && event.rank === 0 && event.source.capability_id === "goals.items.next"));
});
