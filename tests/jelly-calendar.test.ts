import test from "node:test";
import assert from "node:assert/strict";
import { applyJellyCalendarCommand as command, emptyJellyWorkspace, jellyOccurrences, jellyProgress, jellySchedulesOverlap, validateJellyWorkspace } from "../plugins/native/jelly/src/calendar.js";
import { jellyAddDays, jellyDaysBetween, jellyWeekday } from "../plugins/native/jelly/src/calendar-validation.js";
import type { JellyCommand, JellyWorkspace } from "../packages/contracts/src/modules/jelly.js";
const now = "2026-09-22T01:00:00.000Z";
function apply(state: JellyWorkspace, value: JellyCommand) { assert.equal(command(state, value, now), true); }
function create(state: JellyWorkspace, id: string, extra: Record<string, unknown> = {}) { apply(state, { type: "item.create", item: { id, title: id, start_date: "2026-09-22", ...extra } }); }
function weekly(state: JellyWorkspace, extra: Record<string, unknown> = {}) { apply(state, { type: "series.create", series: { id: "series", title: "周复盘", start_date: "2026-09-21", weekdays: [1], until: "2026-10-19", ...extra } }); }
function note(state: JellyWorkspace, id = "note") { state.notes.push({ id, title: "笔记", category_id: "uncategorized", blocks: [{ id: "block", kind: "task", text: "task", indent: 0, completed_at: null, completion_description: "" }], pinned: false, archived_at: null, revision: 0, created_at: now, updated_at: now }); }

test("civil dates preserve leap days and weekday independent of DST", () => {
  assert.equal(jellyAddDays("2024-02-28", 1), "2024-02-29"); assert.equal(jellyAddDays("2024-02-29", 1), "2024-03-01");
  assert.equal(jellyDaysBetween("2026-03-07", "2026-03-09"), 2); assert.equal(jellyWeekday("2026-09-21"), 1);
  assert.throws(() => jellyAddDays("2025-02-29", 1));
});
test("item commands validate atomically, preserve multi-day duration and completion timestamp", () => {
  const state = emptyJellyWorkspace(); create(state, "trip", { end_date: "2026-09-24", start_time: 1320, end_time: 60 });
  apply(state, { type: "item.move", id: "trip", date: "2026-10-31" }); assert.equal(state.items[0]!.end_date, "2026-11-02");
  apply(state, { type: "item.complete", id: "trip", completed: true }); command(state, { type: "item.complete", id: "trip", completed: true }, "2026-09-23T01:00:00Z"); assert.equal(state.items[0]!.completed_at, now);
  const saved = structuredClone(state); assert.throws(() => apply(state, { type: "item.update", id: "trip", patch: { end_date: "2026-09-01" } })); assert.deepEqual(state, saved);
  assert.throws(() => apply(state, { type: "item.move_many", ids: ["trip", "missing"], date: "2026-12-01" })); assert.deepEqual(state, saved);
  assert.equal(command(state, { type: "note.create" }, now), false);
});
test("timeline applies pin, priority, multi-day, untimed/manual and stable order", () => {
  const state = emptyJellyWorkspace(); create(state, "timed", { start_time: 600, end_time: 660 }); create(state, "untimed"); create(state, "multi", { end_date: "2026-09-23" }); create(state, "urgent", { priority: "P1" }); create(state, "pinned", { pinned: true });
  assert.deepEqual(jellyOccurrences(state, "2026-09-22", "2026-09-22").map(item => item.id), ["pinned", "urgent", "multi", "untimed", "timed"]);
  create(state, "second"); apply(state, { type: "item.reorder", date: "2026-09-22", ids: ["second", "untimed", "urgent", "pinned"] });
  assert.deepEqual(jellyOccurrences(state, "2026-09-22", "2026-09-22").filter(item => ["untimed", "second"].includes(item.id)).map(item => item.id), ["second", "untimed"]);
  assert.throws(() => apply(state, { type: "item.reorder", date: "2026-09-22", ids: ["untimed"] }));
});
test("weekly recurrence includes overlapping cross-day instances and moved-in exceptions only once", () => {
  const state = emptyJellyWorkspace(); weekly(state, { end_date: "2026-09-23" });
  assert.equal(jellyOccurrences(state, "2026-09-22", "2026-09-22").length, 1);
  apply(state, { type: "series.update", id: "series", original_date: "2026-09-21", scope: "onlyThis", patch: { start_date: "2026-10-02", end_date: "2026-10-04", title: "改期" } });
  assert.equal(jellyOccurrences(state, "2026-09-22", "2026-09-22").length, 0);
  const occurrences = jellyOccurrences(state, "2026-10-02", "2026-10-04"); assert.equal(occurrences.length, 1); assert.equal(occurrences[0]!.original_date, "2026-09-21"); assert.equal(occurrences[0]!.title, "改期");
  apply(state, { type: "series.complete", id: "series", original_date: "2026-09-21", completed: true }); assert.equal(jellyOccurrences(state, "2026-10-03", "2026-10-03")[0]!.completed_at, now);
  apply(state, { type: "series.delete", id: "series", original_date: "2026-09-21", scope: "onlyThis" }); assert.equal(jellyOccurrences(state, "2026-10-03", "2026-10-03").length, 0);
});
test("future split shifts weekdays, exceptions, completions and note relation overrides while retaining history", () => {
  const state = emptyJellyWorkspace(); weekly(state); note(state);
  state.relations.push({ owner_id: "series", original_date: null, note_id: "note", role: "primary" });
  state.relation_overrides = [{ owner_id: "series", original_date: "2026-10-05", primary: "clear", added_reference_ids: [], removed_reference_ids: [] }];
  apply(state, { type: "series.update", id: "series", original_date: "2026-10-05", scope: "onlyThis", patch: { title: "保留例外" } });
  apply(state, { type: "series.complete", id: "series", original_date: "2026-10-05", completed: true });
  apply(state, { type: "series.update", id: "series", original_date: "2026-09-28", scope: "thisAndFuture", new_series_id: "future", patch: { start_date: "2026-09-29", title: "新系列" } });
  assert.equal(state.series.find(value => value.id === "series")!.until, "2026-09-27");
  const future = state.series.find(value => value.id === "future")!; assert.deepEqual(future.weekdays, [2]); assert.equal(future.until, "2026-10-20"); assert.equal(future.completions["2026-10-06"]!.completed_at, now);
  const occurrence = jellyOccurrences(state, "2026-10-06", "2026-10-06")[0]!; assert.equal(occurrence.title, "保留例外"); assert.equal(occurrence.original_date, "2026-10-06");
  assert.equal(state.relations.filter(relation => relation.original_date === null).length, 2); assert.equal(state.relation_overrides[0]!.owner_id, "future"); assert.equal(state.relation_overrides[0]!.original_date, "2026-10-06");
  apply(state, { type: "series.delete", id: "future", original_date: "2026-10-06", scope: "thisAndFuture" }); assert.equal(jellyOccurrences(state, "2026-10-06", "2026-10-31").length, 0); assert.deepEqual(state.relation_overrides, []);
});
test("splitting first occurrence removes old series and migrates baseline; changing weekdays prunes impossible completions", () => {
  const state = emptyJellyWorkspace(); weekly(state); note(state); state.relations.push({ owner_id: "series", original_date: null, note_id: "note", role: "primary" });
  apply(state, { type: "series.complete", id: "series", original_date: "2026-09-28", completed: true });
  apply(state, { type: "series.update", id: "series", original_date: "2026-09-21", scope: "thisAndFuture", new_series_id: "replacement", patch: { weekdays: [2] } });
  assert.equal(state.series.length, 1); assert.equal(state.series[0]!.id, "replacement"); assert.deepEqual(state.series[0]!.completions, {}); assert.equal(state.relations[0]!.owner_id, "replacement");
});
test("invalid repeated rules, time pairs and only-this rule changes leave state unchanged", () => {
  const state = emptyJellyWorkspace(); weekly(state); const before = structuredClone(state);
  for (const patch of [{ weekdays: [] }, { until: "2026-09-01" }, { start_time: 700, end_time: null }]) assert.throws(() => apply(state, { type: "series.update", id: "series", original_date: "2026-09-28", scope: "thisAndFuture", patch }));
  assert.throws(() => apply(state, { type: "series.update", id: "series", original_date: "2026-09-28", scope: "onlyThis", patch: { weekdays: [3] } })); assert.deepEqual(state, before);
});
test("linked task rename/completion remains consistent, deletion preserves note content", () => {
  const state = emptyJellyWorkspace(); create(state, "task"); note(state); state.task_links.push({ item_id: "task", note_id: "note", block_id: "block" }); state.relations.push({ owner_id: "task", original_date: null, note_id: "note", role: "primary" });
  apply(state, { type: "item.update", id: "task", patch: { title: "新任务" } }); assert.equal(state.notes[0]!.blocks[0]!.text, "新任务");
  apply(state, { type: "item.complete", id: "task", completed: true, completion_description: "已交付" }); assert.equal(state.notes[0]!.blocks[0]!.completed_at, now); assert.equal(state.notes[0]!.revision, 2);
  apply(state, { type: "item.delete", id: "task" }); assert.equal(state.task_links.length, 0); assert.equal(state.relations.length, 0); assert.equal(state.notes[0]!.blocks[0]!.text, "新任务");
});
test("category deletion migrates all domains and exception categories; protected defaults remain", () => {
  const state = emptyJellyWorkspace(); apply(state, { type: "category.create", category: { id: "work", name: "工作", color: "#FF8800" } }); create(state, "task", { category_id: "work" }); weekly(state, { category_id: "work" }); note(state); state.notes[0]!.category_id = "work";
  state.inspirations.push({ id: "idea", input_kind: "text", title: "想法", raw_text: "想法", url: null, file_name: null, category_id: "work", archived_at: null, note_id: null, digest: null, created_at: now, updated_at: now });
  apply(state, { type: "series.update", id: "series", original_date: "2026-09-21", scope: "onlyThis", patch: { category_id: "work" } });
  apply(state, { type: "category.delete", id: "work" }); assert.equal(state.items[0]!.category_id, "uncategorized"); assert.equal(state.series[0]!.exceptions["2026-09-21"]!.patch!.category_id, "uncategorized"); assert.equal(state.notes[0]!.category_id, "uncategorized"); assert.equal(state.inspirations[0]!.category_id, "uncategorized");
  assert.throws(() => apply(state, { type: "category.delete", id: "uncategorized" }));
});
test("progress deduplicates multi-day schedules and counts recurring instances and inclusive category filters", () => {
  const state = emptyJellyWorkspace(); create(state, "spanning", { start_date: "2026-09-20", end_date: "2026-09-24" }); create(state, "late", { start_date: "2026-09-21", priority: "P1" }); weekly(state); apply(state, { type: "series.complete", id: "series", original_date: "2026-09-21", completed: true });
  const result = jellyProgress(state, "2026-09-21", "2026-09-22", "2026-09-22"); assert.equal(result.total, 3); assert.equal(result.completed_count, 1); assert.equal(result.overdue_count, 1); assert.equal(result.high_priority_open, 1); assert.equal(jellyProgress(state, "2026-09-21", "2026-09-22", "2026-09-22", []).total, 0);
});
test("timed occupancy ignores untimed, detects cross-midnight and permits adjacent intervals", () => {
  const a = { start_date: "2026-09-21", end_date: "2026-09-22", start_time: 1380, end_time: 60 };
  assert.equal(jellySchedulesOverlap(a, { start_date: "2026-09-22", end_date: "2026-09-22", start_time: 30, end_time: 90 }), true);
  assert.equal(jellySchedulesOverlap(a, { start_date: "2026-09-22", end_date: "2026-09-22", start_time: 60, end_time: 90 }), false);
  assert.equal(jellySchedulesOverlap(a, { start_date: "2026-09-22", end_date: "2026-09-22", start_time: null, end_time: null }), false);
});
test("workspace rejects stale task links and dangling relations before persistence", () => {
  const state = emptyJellyWorkspace(); create(state, "task"); note(state); state.task_links.push({ item_id: "task", note_id: "note", block_id: "block" }); validateJellyWorkspace(state);
  state.notes[0]!.blocks[0]!.text = "out of sync"; assert.throws(() => validateJellyWorkspace(state));
});
test("skipped recurring identities retain note overrides and migrate them across a future split", () => {
  const state = emptyJellyWorkspace(); weekly(state); note(state);
  state.relation_overrides = [{ owner_id: "series", original_date: "2026-10-05", primary: "note", added_reference_ids: [], removed_reference_ids: [] }];
  apply(state, { type: "series.delete", id: "series", original_date: "2026-10-05", scope: "onlyThis" });
  validateJellyWorkspace(state); assert.equal(state.relation_overrides.length, 1);
  apply(state, { type: "series.update", id: "series", original_date: "2026-09-28", scope: "thisAndFuture", new_series_id: "future", patch: { title: "后续" } });
  assert.equal(state.relation_overrides[0]!.owner_id, "future"); assert.equal(jellyOccurrences(state, "2026-10-05", "2026-10-05").length, 0);
});
test("a future split removes history when every earlier occurrence was skipped", () => {
  const state = emptyJellyWorkspace(); weekly(state); apply(state, { type: "series.delete", id: "series", original_date: "2026-09-21", scope: "onlyThis" });
  apply(state, { type: "series.update", id: "series", original_date: "2026-09-28", scope: "thisAndFuture", new_series_id: "future", patch: { title: "后续" } });
  assert.equal(state.series.length, 1); assert.equal(state.series[0]!.id, "future");
});
