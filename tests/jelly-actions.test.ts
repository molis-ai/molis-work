import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { actionResultSubject, bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { JELLY_ACTION_PERMISSIONS, jellyActions as actions, jellyCommandActions as commands, jellyServiceActions as services, runJellyMcpTool, openJellyStore } from "@molis-ai/molis-work-plugin-jelly";
import { MolisWorkLocalHost } from "../apps/local-host/src/project-host.js";
import { assistantContributions } from "../apps/local-host/src/assistant/assistant-contributions.js";
import type { HostCompleteText } from "../apps/local-host/src/host-complete-text.js";
const day = "2026-09-25", tomorrow = "2026-09-26";
const slot = { start_date: day, end_date: day, start_time: 540, end_time: 570 };
function fixture(t: { after(fn: () => Promise<void>): void }, completeText: HostCompleteText | null = null) {
  const home = mkdtempSync(join(tmpdir(), "jelly-actions-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText });
  const caller: ActionCallContext = { actor_id: "owner", project_id: null, audience: "user", permissions: JELLY_ACTION_PERMISSIONS };
  const service = host.homeActionClient(), bound = bindActionClient(service, () => caller);
  t.after(async () => { await host.close(); rmSync(home, { recursive: true, force: true }); });
  const read = async () => (await bound.invoke(actions.state, {})).state;
  const command = async (type: keyof typeof commands, input: Record<string, unknown> = {}) => (await bound.invoke(commands[type], { expected_revision: (await read()).revision, ...input })).state;
  return { home, host, caller, bound, service, read, command };
}
// Commands on one note that name it as their result.
const noteResults = ["note.create", "note.import", "note.update", "note.pin", "note.restore"] as const;
const planModel: HostCompleteText = async () => JSON.stringify({ actions: [{ title: "核对来源", notes: "逐条核实", minutes: 30 }], clarification_questions: [] });

test("Jelly Home registration executes without a project; permissions, malformed inputs and separate Homes do not leak", async t => {
  const f = fixture(t), other = fixture(t);
  const directory = await f.bound.discover();
  for (const action of [...Object.values(commands), ...Object.values(actions), ...Object.values(services)]) assert.ok(directory.some(row => row.capability_id === action.capability_id));
  assert.equal(directory.find(row => row.capability_id === actions.manualPlan.capability_id)!.availability.available, true);
  assert.equal(directory.find(row => row.capability_id === actions.modelPlan.capability_id)!.availability.available, false);
  assert.deepEqual((await f.service.discover({ ...f.caller, permissions: ["pages:read", "model:invoke"] })).filter(row => row.capability_id.startsWith("jelly.")), []);
  await assert.rejects(f.service.invoke({ ...f.caller, permissions: ["jelly:write"] }, commands["note.create"], { expected_revision: 0, title: "denied" }), { code: "actions.forbidden" });
  await assert.rejects(f.bound.invoke(commands["item.create"], { expected_revision: 0, item: { title: "bad date", start_date: "2026-02-30" } }), /日期/);
  await assert.rejects(f.bound.invoke(commands["item.create"], { expected_revision: 0, item: { title: "unknown", start_date: day }, actor_id: "forged" }), { code: "actions.input_invalid" });
  const state = await f.command("note.create", { title: "Home A", markdown: "private" });
  assert.equal((await other.read()).notes.length, 0);
  await assert.rejects(f.bound.invoke(commands["note.update"], { expected_revision: 0, id: state.notes[0]!.id, patch: { title: "stale" } }), { code: "jelly.conflict" });
  await f.host.close();
  const reopened = new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null });
  try { const result = await reopened.homeActionClient().invoke(f.caller, actions.state, {}); assert.match(JSON.stringify(result), /Home A/); }
  finally { await reopened.close(); }
});

test("calendar commands retain dates, instance identity, category reassignment and original revision history", async t => {
  const { bound, command, read } = fixture(t);
  await command("category.create", { category: { id: "work", name: "工作" } });
  await command("category.update", { id: "work", patch: { name: "重点工作", color: "#AABBCC" } });
  let state = await command("category.reorder", { ids: ["work", "uncategorized"] });
  assert.equal(state.categories[0]!.id, "work");
  state = await command("item.create", { item: { title: "跨日任务", kind: "event", start_date: day, end_date: tomorrow, category_id: "work", notes: "需要留存" } });
  const id = state.items[0]!.id; assert.equal(state.items[0]!.kind, "event");
  state = await command("item.update", { id, patch: { title: "真正修改", kind: "task" } }); assert.equal(state.items[0]!.title, "真正修改"); assert.equal(state.items[0]!.kind, "task");
  state = await command("item.complete", { id, completed: true, completion_description: "已核对" }); assert.ok(state.items[0]!.completed_at);
  state = await command("item.move", { id, date: tomorrow }); assert.equal(state.items[0]!.end_date, "2026-09-27");
  state = await command("item.move_many", { ids: [id], date: day }); assert.equal(state.items[0]!.end_date, tomorrow);
  state = await command("item.create", { item: { title: "单日", start_date: day } }); const single = state.items[1]!.id;
  await command("item.reorder", { ids: [single], date: day });
  await assert.rejects(command("item.reorder", { ids: [id, single], date: day }), /全部单日/);
  state = await command("series.create", { series: { title: "每日", start_date: day, weekdays: [1, 2, 3, 4, 5, 6, 7], category_id: "work" } }); const series = state.series[0]!.id;
  await command("series.update", { id: series, original_date: day, scope: "onlyThis", patch: { start_date: tomorrow, end_date: tomorrow, title: "改期" } });
  await command("series.complete", { id: series, original_date: day, completed: true });
  const occurrences = (await bound.invoke(actions.calendar, { start: day, end: tomorrow })).items;
  assert.ok(occurrences.some(i => i.title === "改期" && i.original_date === day && i.start_date === tomorrow && i.completed_at));
  await command("series.delete", { id: series, original_date: tomorrow, scope: "thisAndFuture" });
  assert.equal((await bound.invoke(actions.calendar, { start: day, end: "2026-10-01" })).items.filter(i => i.series_id).length, 1);
  state = await command("category.delete", { id: "work" });
  assert.equal(state.items[0]!.category_id, "uncategorized"); assert.equal(state.series[0]!.category_id, "uncategorized");
  const progress = (await bound.invoke(actions.progress, { start: day, end: tomorrow, today: tomorrow })).progress;
  assert.equal(progress.completed_count, 2); assert.equal(progress.total, 3);
  state = await command("item.delete", { id }); assert.equal(state.items.length, 1);
  state = await command("undo"); assert.ok(state.items.some(i => i.id === id));
  state = await command("redo"); assert.ok(!state.items.some(i => i.id === id));
  assert.equal((await bound.invoke(actions.categories, {})).revision, (await read()).revision);
});

test("commands on one calendar entry name it as their result, and the Assistant can read that entry back", async t => {
  const { bound, read, host, caller } = fixture(t);
  const entries = ["item.create", "item.update", "item.complete", "item.move", "task.schedule", "series.create", "series.update", "series.complete"] as const;
  for (const type of entries) {
    assert.deepEqual(commands[type].action.subject_kinds, ["jelly_item"], type);
    assert.ok(commands[type].action.result_subject, type);
  }
  // Several entries, a removal or the whole workspace: no single entry to relate the result to.
  for (const type of ["item.move_many", "item.reorder", "item.delete", "series.delete", "undo"] as const) assert.deepEqual(commands[type].action.subject_kinds, ["jelly_workspace"], type);
  const agent = bindActionClient(host.homeActionClient(), () => ({ ...caller, audience: "agent" }));
  const reader = (await agent.discover()).find(view => view.capability_id === actions.itemSubject.capability_id);
  assert.equal(reader?.availability.available, true, "the reader of jelly_item is offered to agents");
  type Entry = { id: string; title: string; updated_at: string };
  // What the Assistant's work keeps from a successful change, and what it then reads back from Jelly.
  const run = async (type: (typeof entries)[number], input: Record<string, unknown>) => {
    const full = { expected_revision: (await read()).revision, ...input };
    const output = await bound.invoke(commands[type], full) as { state: Awaited<ReturnType<typeof read>>; item?: Entry; series?: Entry };
    const result = actionResultSubject(commands[type].action, full, output);
    assert.ok(result, type);
    const context = await agent.invoke(actions.itemSubject, { subject_id: result.subject.id });
    assert.equal(context.revision, result.revision, `${type}: the recorded revision is the one read back`);
    return { output, result, context };
  };
  const created = await run("item.create", { item: { title: "Q4 预算对齐会", kind: "event", ...slot } });
  const id = created.output.item!.id;
  assert.deepEqual(created.result.subject, { kind: "jelly_item", id });
  assert.ok(created.output.state.items.some(item => item.id === id));
  assert.equal(created.context.title, "Q4 预算对齐会");
  const given = await run("item.create", { item: { id: "chosen", title: "自带标识", start_date: day } });
  assert.equal(given.result.subject.id, "chosen");
  const updated = await run("item.update", { id, patch: { title: "Q4 预算对齐会（改）" } });
  assert.equal(updated.result.subject.id, id); assert.equal(updated.context.title, "Q4 预算对齐会（改）");
  assert.equal((await run("item.complete", { id, completed: true })).result.subject.id, id);
  assert.equal((await run("item.move", { id, date: tomorrow })).context.content.includes(tomorrow), true);
  const note = (await bound.invoke(commands["note.create"], { expected_revision: (await read()).revision, title: "笔记", blocks: [{ id: "task", kind: "task", text: "做检查" }] })).state.notes[0]!;
  const scheduled = await run("task.schedule", { note_id: note.id, block_id: "task", schedule: slot });
  assert.equal(scheduled.context.title, "做检查");
  assert.equal((await run("task.schedule", { note_id: note.id, block_id: "task", schedule: { ...slot, start_time: 600, end_time: 630 } })).result.subject.id, scheduled.result.subject.id, "rescheduling changes the same item");
  const series = await run("series.create", { series: { title: "每周例会", start_date: day, weekdays: [5] } });
  const seriesId = series.output.series!.id;
  assert.equal(series.context.title, "每周例会");
  assert.equal((await run("series.update", { id: seriesId, original_date: day, scope: "onlyThis", patch: { title: "本次改名" } })).result.subject.id, seriesId);
  assert.equal((await run("series.complete", { id: seriesId, original_date: day, completed: true })).result.subject.id, seriesId);
  const later = await run("series.update", { id: seriesId, original_date: "2026-10-02", scope: "thisAndFuture", patch: { title: "此后改名" } });
  assert.notEqual(later.result.subject.id, seriesId, "this and later occurrences become a new series");
  assert.equal(later.context.title, "此后改名");
  assert.ok((await read()).series.some(entry => entry.id === later.result.subject.id));
  // The developer diagnostics count exactly these, the note commands and the note a handoff makes, as changes the Assistant can relate and read back.
  const jelly = assistantContributions(await host.inspectActions({ actor_id: "web-user", actor_kind: "runtime", project_id: null, audience: "agent", permissions: [] }))
    .find(row => row.title === "Jelly")!;
  assert.ok(jelly.readable_kinds.includes("jelly_item"));
  assert.equal(jelly.linked_changes, entries.length + noteResults.length + 1);
  assert.match(jelly.gaps.find(gap => gap.area === "results" && gap.text.includes("jelly_workspace"))!.text, /没有读取动作/);
});

test("commands on one note name it as their result, and the Assistant can read it back; archiving and deletion do not", async t => {
  const { bound, read, host, caller } = fixture(t);
  for (const type of noteResults) {
    assert.deepEqual(commands[type].action.subject_kinds, ["jelly_note"], type);
    assert.ok(commands[type].action.result_subject, type);
  }
  // Right after these the readers treat the object as gone: the work would show its own result as missing.
  for (const type of ["note.archive", "note.delete"] as const) assert.deepEqual(commands[type].action.subject_kinds, ["jelly_workspace"], type);
  const agent = bindActionClient(host.homeActionClient(), () => ({ ...caller, audience: "agent" }));
  type Output = { state: Awaited<ReturnType<typeof read>>; note?: { id: string } };
  // What the Assistant's work keeps from a successful change, and what it then reads back from Jelly.
  const run = async (type: (typeof noteResults)[number], input: Record<string, unknown>) => {
    const full = { expected_revision: (await read()).revision, ...input };
    const output = await bound.invoke(commands[type], full) as Output;
    const result = actionResultSubject(commands[type].action, full, output);
    assert.ok(result, type);
    const context = await agent.invoke(actions.noteSubject, { subject_id: result.subject.id });
    assert.equal(context.revision, result.revision, `${type}: the recorded revision is the one read back`);
    return { output, result, context };
  };
  const created = await run("note.create", { title: "周报", markdown: "本周完成预算核对" });
  const noteId = created.output.note!.id;
  assert.deepEqual(created.result.subject, { kind: "jelly_note", id: noteId });
  assert.ok(created.output.state.notes.some(note => note.id === noteId));
  assert.equal(created.context.title, "周报");
  const updated = await run("note.update", { id: noteId, patch: { title: "第 40 周周报" } });
  assert.equal(updated.result.subject.id, noteId); assert.equal(updated.context.title, "第 40 周周报");
  assert.notEqual(updated.result.revision, created.result.revision);
  assert.match((await run("note.import", { id: noteId, format: "markdown", mode: "append", source: "下周计划" })).context.content, /下周计划/);
  assert.equal((await run("note.pin", { id: noteId, pinned: true })).result.subject.id, noteId);
  await bound.invoke(commands["note.archive"], { expected_revision: (await read()).revision, id: noteId });
  await assert.rejects(agent.invoke(actions.noteSubject, { subject_id: noteId }), { code: "jelly.not_found" }, "an archived note is not read back");
  assert.equal((await run("note.restore", { id: noteId })).context.title, "第 40 周周报");

});

test("notes, tasks and relationships update the same objects; confirmed deletion retains scheduled items and undo restores links", async t => {
  const { bound, command, read } = fixture(t);
  let state = await command("note.create", { title: "笔记", blocks: [{ id: "task", kind: "task", text: "做检查" }] });
  const noteId = state.notes[0]!.id;
  await command("note.update", { id: noteId, expected_note_revision: state.notes[0]!.revision, patch: { title: "检查笔记" } });
  state = await command("note.import", { id: noteId, format: "markdown", mode: "append", source: "补充原文" }); assert.ok(state.notes[0]!.blocks.some(b => b.text === "补充原文"));
  await command("note.pin", { id: noteId, pinned: true });
  state = await command("task.schedule", { note_id: noteId, block_id: "task", schedule: slot }); const itemId = state.task_links[0]!.item_id;
  state = await command("task.complete", { note_id: noteId, block_id: "task", completed: true, completion_description: "验过" });
  assert.equal(state.items[0]!.completed_at, state.notes[0]!.blocks[0]!.completed_at);
  await command("item.update", { id: itemId, patch: { title: "两边同步" } });
  assert.equal((await read()).notes[0]!.blocks[0]!.text, "两边同步");
  await assert.rejects(command("note.update", { id: noteId, patch: { blocks: [] } }), /先取消/);
  await command("relation.detach", { owner_id: itemId, note_id: noteId });
  await command("relation.attach", { owner_id: itemId, note_id: noteId, role: "primary" });
  state = await command("series.create", { series: { title: "重复关联", start_date: day, weekdays: [5] } }); const series = state.series[0]!.id;
  await command("relation.attach", { owner_id: series, original_date: day, note_id: noteId });
  state = await command("relation.reset", { owner_id: series, original_date: day }); assert.equal(state.relation_overrides?.length, 0);
  await command("item.update", { id: itemId, patch: { notes: "迁移随记" } });
  state = await command("item.notes_to_note", { owner_id: itemId, mode: "append", note_id: noteId });
  assert.equal(state.items[0]!.notes, ""); assert.ok(state.notes[0]!.blocks.some(b => b.text === "迁移随记"));
  await command("note.archive", { id: noteId }); await command("note.restore", { id: noteId });
  assert.equal((await read()).notes[0]!.archived_at, null);
  await command("note.archive", { id: noteId });
  const preview = (await bound.invoke(actions.previewNoteDelete, { id: noteId })).preview;
  await command("note.pin", { id: noteId, pinned: false });
  await assert.rejects(command("note.delete", { id: noteId, confirmation_token: preview.confirmation_token }), { code: "jelly.stale_preview" });
  const fresh = (await bound.invoke(actions.previewNoteDelete, { id: noteId })).preview;
  state = await command("note.delete", { id: noteId, confirmation_token: fresh.confirmation_token });
  assert.equal(state.notes.length, 0); assert.equal(state.items.length, 1); assert.equal(state.task_links.length, 0);
  state = await command("undo"); assert.equal(state.task_links.length, 1); assert.ok(state.notes[0]!.revision > 0);
  await command("note.restore", { id: noteId });
  state = await command("task.unlink", { note_id: noteId, block_id: "task" }); assert.equal(state.task_links.length, 0); assert.equal(state.items.length, 1);
  assert.match((await bound.invoke(actions.exportNote, { id: noteId })).content, /迁移随记/);
});

test("manual plans need no model; stale plans and altered imports cannot write and confirmed imports survive restart", async t => {
  const { bound, command, home, caller, read, host } = fixture(t);
  const result = await bound.invoke(actions.manualPlan, { source_type: "text", text: "核对来源\n保存结果" });
  assert.ok("plan" in result); assert.equal(result.method, "manual"); assert.equal((await read()).revision, 0);
  let state = await command("plan.apply", { plan: result.plan }); assert.equal(state.notes[0]!.blocks.filter(b => b.kind === "task").length, 2);
  await command("plan.apply", { plan: result.plan }); assert.equal((await read()).notes.length, 1);
  const noteId = state.notes[0]!.id;
  const stale = await bound.invoke(actions.manualPlan, { source_type: "note", source_id: noteId }); assert.ok("plan" in stale);
  await command("note.update", { id: noteId, patch: { markdown: "原文变更" } });
  await assert.rejects(command("plan.apply", { plan: stale.plan }), { code: "jelly.source_changed" });
  const donor = fixture(t); await donor.command("note.create", { title: "导入来源", markdown: "导入的原文" });
  const { workspace } = await donor.bound.invoke(actions.export, {});
  const preview = (await bound.invoke(actions.previewImport, { source: workspace })).preview;
  const changed = structuredClone(workspace); changed.notes[0]!.title = "偷换来源";
  await assert.rejects(command("workspace.import", { source: changed, confirmation_token: preview.confirmation_token }), { code: "jelly.stale_preview" });
  // The failed transaction must retain the original preview token.
  state = await command("workspace.import", { source: workspace, confirmation_token: preview.confirmation_token }); assert.equal(state.notes.length, 2);
  // A restart: the first Host ends before the next one owns this Home.
  await host.close();
  const reopened = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try { const data = await reopened.homeActionClient().invoke(caller, actions.export, {}); assert.match(JSON.stringify(data), /导入的原文/); }
  finally { await reopened.close(); }
});

for (const mode of ["cancel", "failure", "success"] as const) test(`Jelly model ${mode} uses the action path and commits nothing until a plan is applied`, async t => {
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; }), released = new Promise<void>(resolve => { release = resolve; });
  const f = fixture(t, async (prompt, options) => { enter(); await released; if (mode === "failure") throw new Error("model down"); return planModel(prompt, options); });
  const before = await f.command("note.create", { title: "原笔记", markdown: "准备真实发布材料" }), id = before.notes[0]!.id;
  const controller = new AbortController();
  const pending = f.service.invoke({ ...f.caller, signal: controller.signal }, actions.modelPlan, { source_type: "note", source_id: id });
  await entered;
  if (mode === "cancel") controller.abort();
  release();
  if (mode === "success") assert.equal((await pending).plan.actions[0]!.title, "核对来源");
  else await assert.rejects(pending, mode === "cancel" ? { code: "jelly.cancelled" } : /model down/);
  assert.deepEqual(await f.read(), before);
});

test("all legacy Jelly MCP aliases call real actions with optional revision compatibility", async t => {
  const { bound, read, home } = fixture(t);
  const call = async (tool_id: string, args: Record<string, unknown> = {}) => JSON.parse(await runJellyMcpTool(bound, { tool_id, arguments: args }));
  const created = await call("create_item", { item: { title: "MCP item", start_date: day } }), id = created.state.items[0].id;
  assert.equal((await call("list_items", { start: day, end: day })).items[0].id, id);
  assert.equal((await call("get_item", { id })).item.title, "MCP item");
  assert.equal((await call("list_categories")).categories[0].id, "uncategorized");
  await call("update_item", { id, patch: { title: "Updated" } });
  await call("move_items", { ids: [id], date: tomorrow });
  await call("reorder_untimed_items", { ids: [id], date: tomorrow });
  await call("set_task_completed", { id, completed: true }); assert.ok((await read()).items[0]!.completed_at);
  assert.equal((await call("search", { query: "updated" })).items.length, 1);
  const series = (await call("create_series", { series: { title: "MCP repeat", start_date: day, weekdays: [5, 6] } })).state.series[0].id;
  await call("modify_series", { id: series, original_date: day, scope: "onlyThis", patch: { title: "Occurrence" } });
  await call("set_task_completed", { id: series, original_date: day, completed: true });
  await call("modify_series", { id: series, original_date: tomorrow, scope: "onlyThis", delete: true });
  assert.equal((await call("list_items", { start: day, end: tomorrow })).items.filter((i: { series_id: string }) => i.series_id).length, 1);
  await call("delete_item", { id }); assert.equal((await read()).items.length, 0);
  await call("undo"); assert.equal((await read()).items[0]!.id, id);
  await assert.rejects(call("update_item", { id, patch: { title: "stale" }, expected_revision: 0 }), { code: "jelly.conflict" });
  await assert.rejects(call("toString"), /未知/);
  // The original SQLite owner sees the exact same facts.
  const store = openJellyStore(home); try { assert.equal(store.read().items[0]!.id, id); } finally { store.close(); }
});

test("model plan action returns a real preview and requires source mapping before execution", async t => {
  const { bound, command, read } = fixture(t, async () => JSON.stringify({ actions: [{ title: "模型给出的步骤", notes: "核对来源", minutes: 30 }] }));
  await assert.rejects(bound.invoke(actions.modelPlan, { source_type: "note" }), { code: "actions.input_invalid" });
  const result = await bound.invoke(actions.modelPlan, { source_type: "text", source_id: null, text: "准备发布", today: day, start_time: 540 });
  assert.ok("plan" in result); assert.equal(result.method, "model"); assert.equal(result.plan.actions[0]!.title, "模型给出的步骤");
  assert.equal((await read()).revision, 0);
  const state = await command("plan.apply", { plan: result.plan }); assert.equal(state.items[0]!.title, "模型给出的步骤"); assert.equal(state.task_links.length, 1);
});

for (const response of ["not JSON", '{"actions":[{"title":3}]}', "null"]) test(`Jelly rejects malformed or invalid structured output without changing original data: ${response}`, async t => {
  const f = fixture(t, async () => response);
  await f.command("note.create", { title: "原笔记", markdown: "准备真实发布材料" });
  const before = await f.read();
  await assert.rejects(f.bound.invoke(actions.modelPlan, { source_type: "note", source_id: before.notes[0]!.id }), { code: "jelly.ai_invalid" });
  assert.deepEqual(await f.read(), before);
});

test("Jelly accepts whole-response JSON fences through Host and still returns an uncommitted domain plan", async t => {
  const f = fixture(t, async () => '```json\n{"actions":[{"title":"核对来源","notes":"逐条核实","minutes":30}],"clarification_questions":[]}\n```');
  const before = await f.read();
  const result = await f.bound.invoke(actions.modelPlan, { source_type: "text", text: "准备发布说明" });
  assert.equal(result.plan.actions[0]?.title, "核对来源");
  assert.deepEqual(await f.read(), before);
});

for (const phase of ["dispatch", "result"] as const) test(`Jelly revocation at ${phase} prevents further model dispatch or a returned plan`, async t => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let allowed = true, dispatched = 0;
  const f = fixture(t, async (prompt, options) => {
    if (phase === "dispatch") { entered.resolve(); await release.promise; }
    await options?.beforeDispatch?.(); dispatched++;
    if (phase === "result") { entered.resolve(); await release.promise; }
    return planModel(prompt, options);
  });
  const state = await f.command("note.create", { title: "原笔记", markdown: "这份原文必须保留。" });
  const pending = f.service.invoke({ ...f.caller, validate_authority: async () => {
    if (!allowed) throw Object.assign(new Error("Jelly permission revoked"), { code: "actions.forbidden" });
  } }, actions.modelPlan, { source_type: "note", source_id: state.notes[0]!.id });
  await entered.promise; allowed = false; release.resolve();
  await assert.rejects(pending, { code: "actions.forbidden" });
  assert.equal(dispatched, phase === "dispatch" ? 0 : 1);
  assert.deepEqual(await f.read(), state);
});
