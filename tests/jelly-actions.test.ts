import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { actionResultSubject, bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { JELLY_ACTION_PERMISSIONS, JELLY_ACTIONS, jellyActions as a, jellyManifest } from "@molis-ai/molis-work-plugin-jelly";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { openPartitionLibraryDatabase } from "./fixtures/plugin-home-stores.js";

const zone = "Asia/Shanghai";
function fixture(t: { after(fn: () => Promise<void>): void }) {
  const home = mkdtempSync(join(tmpdir(), "jelly-actions-"));
  // No model is configured: Jelly starts and works without one (batch 112-2, hand-off to batch 108).
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  // Jelly works in a partition (batch 108): these calls are made in project "a".
  const reference = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "a" });
  const caller: ActionCallContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: JELLY_ACTION_PERMISSIONS };
  const service = host.actionClient(reference), bound = bindActionClient(service, () => caller);
  t.after(async () => { await host.close(); rmSync(home, { recursive: true, force: true }); });
  const month = () => bound.invoke(a.calendar, { start: "2026-09-01", end: "2026-09-30" });
  // The partition's overview rows Jelly keeps beside its entries, as the platform reads them.
  const events = () => {
    const db = openPartitionLibraryDatabase(home, "a", "jelly");
    try { return db.prepare("SELECT row_id, title, starts_at, ends_at, all_day, time_zone, remind_at FROM molis_overview_rows WHERE kind = 'event' ORDER BY row_id").all() as Array<{ row_id: string; starts_at: string }>; }
    finally { db.close(); }
  };
  return { home, host, caller, service, bound, month, events };
}

test("UPP-15 Jelly is a partition plugin with fifteen typed actions and no model, settings or routes; permissions and separate Homes hold", async t => {
  const f = fixture(t), other = fixture(t);
  assert.equal(Object.keys(a).length, 15);
  assert.equal(jellyManifest.runtime, undefined, "no Home runtime: one instance per partition it is enabled in");
  assert.equal(jellyManifest.databases?.partition?.store_name, "jelly");
  assert.deepEqual(jellyManifest.overview_projection, { kinds: ["event"] });
  assert.equal(jellyManifest.routes, undefined); assert.equal(jellyManifest.settings_entries, undefined);
  assert.ok(!JELLY_ACTION_PERMISSIONS.includes("model:invoke"));
  const directory = await f.bound.discover();
  for (const definition of JELLY_ACTIONS) assert.ok(directory.some(row => row.capability_id === definition.capability_id), definition.capability_id);
  assert.deepEqual((await f.service.discover({ ...f.caller, permissions: ["pages:read"] })).filter(row => row.capability_id.startsWith("jelly.")), []);
  await assert.rejects(f.service.invoke({ ...f.caller, permissions: ["jelly:write"] }, a.saveNote, { title: "denied" }), { code: "actions.forbidden" });
  await assert.rejects(f.bound.invoke(a.createItem, { item: { title: "bad", start_date: "2026-02-30" } }), { code: "jelly.invalid" });
  await assert.rejects(f.bound.invoke(a.createItem, { item: { title: "forged", start_date: "2026-09-01" }, actor_id: "x" } as never), { code: "actions.input_invalid" });
  await f.bound.invoke(a.saveNote, { title: "Home A", body: "private" });
  assert.equal((await other.bound.invoke(a.notes, {})).notes.length, 0);
});

test("a single entry is created, moved as a whole, completed, refused on a stale revision, deleted and put back", async t => {
  const f = fixture(t);
  const input = { item: { title: " 交稿 ", start_date: "2026-09-10", end_date: "2026-09-11", start_time: 540, end_time: 600, time_zone: zone } };
  const created = await f.bound.invoke(a.createItem, input), { item } = created;
  assert.equal(item.title, "交稿"); assert.equal(item.revision, 1); assert.equal(item.kind, "task"); assert.equal(item.category_id, "uncategorized");
  assert.deepEqual(actionResultSubject(a.createItem.action, input, created), { subject: { kind: "jelly_item", id: item.id }, revision: "1" });
  // UPP-35: an open entry is an `event` row of the partition's overview, its times read in its own zone, with no reminder.
  assert.deepEqual(f.events(), [{ row_id: item.id, title: "交稿", starts_at: "2026-09-10T01:00:00.000Z", ends_at: "2026-09-11T02:00:00.000Z", all_day: 0, time_zone: zone, remind_at: null }]);
  const moved = (await f.bound.invoke(a.updateItem, { id: item.id, expected_revision: 1, patch: { start_date: "2026-09-15" } })).item;
  assert.deepEqual([moved.start_date, moved.end_date, moved.revision], ["2026-09-15", "2026-09-16", 2]);
  assert.deepEqual(f.events().map(row => row.starts_at), ["2026-09-15T01:00:00.000Z"], "the row moves with the entry, in the same write");
  const done = (await f.bound.invoke(a.updateItem, { id: item.id, expected_revision: 2, patch: { completed: true } })).item;
  assert.ok(done.completed_at);
  assert.deepEqual(f.events(), [], "a done entry has no row");
  await assert.rejects(f.bound.invoke(a.updateItem, { id: item.id, expected_revision: 2, patch: { title: "stale" } }), (error: { code: string; details?: { revision?: number } }) => error.code === "jelly.conflict" && error.details?.revision === 3);
  assert.deepEqual((await f.month()).items.map(entry => entry.id), [item.id]);
  await f.bound.invoke(a.updateItem, { id: item.id, expected_revision: 3, patch: { completed: false } });
  assert.equal(f.events().length, 1, "opened again, it is back in the overview");
  const { restore } = await f.bound.invoke(a.deleteItem, { id: item.id, expected_revision: 4 });
  assert.equal((await f.month()).items.length, 0);
  assert.deepEqual(f.events(), [], "a deleted entry's row goes with it");
  assert.equal(a.deleteItem.action.undo?.capability_id, "jelly.restore");
  const back = (await f.bound.invoke(a.restore, { rows: restore })).rows.items[0]!;
  assert.deepEqual([back.title, back.start_date, back.revision], ["交稿", "2026-09-15", 5]);
  assert.deepEqual(f.events().map(row => row.row_id), [item.id], "put back open, its row is written again");
  // Changed again after it came back: the old restore leaves that row as it is now and names it.
  await f.bound.invoke(a.updateItem, { id: item.id, expected_revision: 5, patch: { title: "改过" } });
  const stale = await f.bound.invoke(a.restore, { rows: restore });
  assert.deepEqual([stale.skipped, stale.rows.items], [[item.id], []]);
  assert.equal((await f.month()).items[0]?.title, "改过");
});

test("a weekly series answers each scope at one occurrence, and its occurrences come back with the series id", async t => {
  const f = fixture(t);
  const { series } = await f.bound.invoke(a.createSeries, { series: { title: "站会", start_date: "2026-09-07", start_time: 570, end_time: 585, weekdays: [1, 3], time_zone: zone } });
  const ids = async () => (await f.month()).items.map(entry => entry.id);
  assert.equal((await ids()).length, 8);
  assert.deepEqual((await f.bound.invoke(a.item, { id: `${series.id}@2026-09-09` })).series?.id, series.id);
  const one = (await f.bound.invoke(a.updateSeries, { id: series.id, expected_revision: 1, original_date: "2026-09-09", scope: "onlyThis", patch: { title: "改期站会", start_date: "2026-09-10", end_date: "2026-09-10" } })).series;
  assert.equal((await f.month()).items.find(entry => entry.id === `${series.id}@2026-09-09`)?.start_date, "2026-09-10");
  const ticked = (await f.bound.invoke(a.updateSeries, { id: series.id, expected_revision: one.revision, original_date: "2026-09-14", scope: "onlyThis", patch: { completed: true } })).series;
  const split = await f.bound.invoke(a.updateSeries, { id: series.id, expected_revision: ticked.revision, original_date: "2026-09-21", scope: "thisAndFuture", patch: { title: "新站会" } });
  assert.equal(split.ended?.until, "2026-09-20"); assert.notEqual(split.series.id, series.id);
  assert.deepEqual((await f.month()).items.filter(entry => entry.title === "新站会").map(entry => entry.start_date), ["2026-09-21", "2026-09-23", "2026-09-28", "2026-09-30"]);
  const { series: left, restore } = await f.bound.invoke(a.deleteSeries, { id: series.id, expected_revision: split.ended!.revision, original_date: "2026-09-07", scope: "all" });
  assert.equal(left, null);
  assert.equal((await ids()).filter(id => id.startsWith(series.id)).length, 0);
  await f.bound.invoke(a.restore, { rows: restore });
  assert.equal((await ids()).filter(id => id.startsWith(series.id)).length, 4);
  await assert.rejects(f.bound.invoke(a.updateSeries, { id: split.series.id, expected_revision: 1, original_date: "2026-09-22", scope: "onlyThis", patch: { title: "周二" } }), { code: "jelly.invalid" });
  // B112-02: undo of a partial deletion leaves a subsequently deleted series gone.
  const future = split.series;
  const partial = await f.bound.invoke(a.deleteSeries, { id: future.id, expected_revision: future.revision, original_date: future.start_date, scope: "onlyThis" });
  assert.ok(partial.series);
  await f.bound.invoke(a.deleteSeries, { id: future.id, expected_revision: partial.series.revision, original_date: "2026-09-23", scope: "all" });
  assert.deepEqual((await f.bound.invoke(a.restore, { rows: partial.restore })).skipped, [future.id]);
  // B112-14: a replacement can reach the old receipt's exact revision.
  const replacement = (await f.bound.invoke(a.createSeries, { series: { id: future.id, title: "新的系列",
    start_date: future.start_date, weekdays: future.weekdays } })).series;
  const revised = (await f.bound.invoke(a.updateSeries, { id: replacement.id, expected_revision: replacement.revision,
    original_date: replacement.start_date, scope: "all", patch: { title: "保留新的系列" } })).series;
  assert.equal(revised.revision, partial.series.revision);
  assert.deepEqual((await f.bound.invoke(a.restore, { rows: partial.restore })).skipped, [future.id]);
  assert.deepEqual((await f.bound.invoke(a.item, { id: future.id })).series, revised);
  const currentDelete = await f.bound.invoke(a.deleteSeries, { id: revised.id, expected_revision: revised.revision,
    original_date: revised.start_date, scope: "onlyThis" });
  const currentUndo = await f.bound.invoke(a.restore, { rows: currentDelete.restore });
  assert.deepEqual(currentUndo.skipped, []);
  assert.deepEqual(currentUndo.rows.series[0], { ...revised, revision: revised.revision + 2 });
});

test("deleting a category moves its entries, including a single date's change, to uncategorized, and undo moves them back", async t => {
  const f = fixture(t);
  const { category } = await f.bound.invoke(a.saveCategory, { name: "工作", color: "#3366CC" });
  await assert.rejects(f.bound.invoke(a.saveCategory, { name: " 工作 " }), { code: "jelly.invalid" });
  await assert.rejects(f.bound.invoke(a.saveCategory, { id: "uncategorized", expected_revision: 0, name: "别的" }), { code: "jelly.invalid" });
  const recolored = (await f.bound.invoke(a.saveCategory, { id: "uncategorized", expected_revision: 0, color: "#123456" })).category;
  assert.equal(recolored.revision, 1);
  const { item } = await f.bound.invoke(a.createItem, { item: { title: "评审", start_date: "2026-09-02", category_id: category.id } });
  const { series } = await f.bound.invoke(a.createSeries, { series: { title: "周会", start_date: "2026-09-07", weekdays: [1] } });
  await f.bound.invoke(a.updateSeries, { id: series.id, expected_revision: 1, original_date: "2026-09-14", scope: "onlyThis", patch: { category_id: category.id } });
  const later = (await f.bound.invoke(a.createItem, { item: { title: "随后删除", start_date: "2026-09-03", category_id: category.id } })).item;
  const changed = (await f.bound.invoke(a.createItem, { item: { title: "另一件", start_date: "2026-09-03", category_id: category.id } })).item;
  const reused = (await f.bound.invoke(a.createItem, { item: { title: "原来的事项", start_date: "2026-09-04", category_id: category.id } })).item;
  const { restore } = await f.bound.invoke(a.deleteCategory, { id: category.id, expected_revision: 1 });
  const after = await f.month();
  assert.deepEqual(after.categories.map(row => row.id), ["uncategorized"]);
  assert.ok(after.items.every(entry => entry.category_id === "uncategorized"));
  // One moved entry since the delete stays where it is; the category and the rest still come back.
  // B112-02: one untouched item, one revised item, and one removed through another call.
  const other = (await f.bound.invoke(a.updateItem, { id: changed.id, expected_revision: 2, patch: { title: "另一件（改过）" } })).item;
  await f.bound.invoke(a.deleteItem, { id: later.id, expected_revision: 2 });
  await f.bound.invoke(a.deleteItem, { id: reused.id, expected_revision: 2 });
  const replacement = (await f.bound.invoke(a.createItem, { item: { id: reused.id, title: "同 ID 新事项", start_date: "2026-09-04" } })).item;
  const kept = (await f.bound.invoke(a.updateItem, { id: replacement.id, expected_revision: replacement.revision, patch: { title: "保留新事项" } })).item;
  const after2 = await f.bound.invoke(a.restore, { rows: restore });
  assert.deepEqual(after2.skipped.sort(), [other.id, later.id, reused.id].sort());
  assert.deepEqual((await f.bound.invoke(a.item, { id: reused.id })).item, kept);
  assert.deepEqual(after2.rows.items.map(row => row.id), [item.id]);
  await assert.rejects(f.bound.invoke(a.item, { id: later.id }), { code: "jelly.not_found" });
  const back = await f.month();
  assert.equal(back.items.find(entry => entry.id === item.id)?.category_id, category.id);
  assert.equal(back.items.find(entry => entry.id === `${series.id}@2026-09-14`)?.category_id, category.id);
  assert.deepEqual(back.items.filter(entry => entry.id === other.id).map(entry => [entry.category_id, entry.title]), [["uncategorized", "另一件（改过）"]]);
  // A category deleted and then made again under the same name: the old one stays out, as saving it would.
  const { category: again } = await f.bound.invoke(a.saveCategory, { name: "家里" });
  const { restore: home } = await f.bound.invoke(a.deleteCategory, { id: again.id, expected_revision: 1 });
  await f.bound.invoke(a.saveCategory, { name: "家里" });
  assert.deepEqual((await f.bound.invoke(a.restore, { rows: home })).skipped, [again.id]);
  // 「未分类」 is never put back through restore, so it cannot be renamed that way.
  const renamed = await f.bound.invoke(a.restore, { rows: { categories: [{ ...recolored, name: "别的", revision: recolored.revision - 1 }] } });
  assert.deepEqual(renamed.skipped, ["uncategorized"]);
  await assert.rejects(f.bound.invoke(a.deleteCategory, { id: "uncategorized", expected_revision: 1 }), { code: "jelly.invalid" });
});

test("an occurrence moved before its series' first date still shows in the range it moved to", async t => {
  const f = fixture(t);
  const { series } = await f.bound.invoke(a.createSeries, { series: { title: "周会", start_date: "2026-10-05", weekdays: [1] } });
  await f.bound.invoke(a.updateSeries, { id: series.id, expected_revision: 1, original_date: "2026-10-05", scope: "onlyThis", patch: { start_date: "2026-09-25" } });
  assert.deepEqual((await f.month()).items.map(entry => [entry.id, entry.start_date, entry.end_date]), [[`${series.id}@2026-10-05`, "2026-09-25", "2026-09-25"]]);
});

test("notes keep plain text or Markdown, pin to a day, list by day or words, refuse a stale save and come back after delete", async t => {
  const f = fixture(t);
  const calendarBeforeNotes = await f.month();
  const { note } = await f.bound.invoke(a.saveNote, { title: "周一", body: "# 要点\n\n- 订会议室", day: "2026-09-07" });
  // An Assistant or MCP caller must name a version on every write: 0 is how it says "a new one".
  await f.service.invoke({ ...f.caller, audience: "agent" }, a.saveNote, { expected_revision: 0, title: "随想", body: "没有日期" });
  assert.deepEqual((await f.bound.invoke(a.notes, { day: "2026-09-07" })).notes.map(row => row.id), [note.id]);
  assert.deepEqual((await f.bound.invoke(a.notes, { day: null })).notes.map(row => row.title), ["随想"]);
  assert.deepEqual((await f.bound.invoke(a.notes, { query: "会议室" })).notes.map(row => [row.id, row.excerpt]), [[note.id, "# 要点 - 订会议室"]]);
  // B112-13: the calendar-only response has the same contents whether the person has pinned notes or not.
  assert.deepEqual(await f.month(), calendarBeforeNotes);
  assert.deepEqual(Object.keys(calendarBeforeNotes).sort(), ["categories", "items"]);
  assert.deepEqual(await f.bound.invoke(a.noteDays, { start: "2026-09-01", end: "2026-09-30" }), { days: ["2026-09-07"] });
  assert.deepEqual(await f.bound.invoke(a.noteDays, { start: "2026-09-08", end: "2026-09-30" }), { days: [] });
  await assert.rejects(f.bound.invoke(a.noteDays, { start: "2026-09-08", end: "2026-09-07" }), { code: "jelly.invalid" });
  assert.equal((await f.bound.invoke(a.notes, { limit: 1 })).notes.length, 1);
  const saved = (await f.bound.invoke(a.saveNote, { id: note.id, expected_revision: 1, body: "改过" })).note;
  assert.deepEqual([saved.title, saved.body, saved.day, saved.revision], ["周一", "改过", "2026-09-07", 2]);
  await assert.rejects(f.bound.invoke(a.saveNote, { id: note.id, expected_revision: 1, body: "旧稿" }), { code: "jelly.conflict" });
  await assert.rejects(f.bound.invoke(a.saveNote, { id: note.id, body: "没带版本" }), { code: "jelly.invalid" });
  const { restore } = await f.bound.invoke(a.deleteNote, { id: note.id, expected_revision: 2 });
  await assert.rejects(f.bound.invoke(a.note, { id: note.id }), { code: "jelly.not_found" });
  await assert.rejects(f.bound.invoke(a.saveNote, { id: note.id, expected_revision: 2, body: "删了还写" }), { code: "jelly.not_found" });
  await f.bound.invoke(a.restore, { rows: restore });
  assert.equal((await f.bound.invoke(a.note, { id: note.id })).note.body, "改过");
});
