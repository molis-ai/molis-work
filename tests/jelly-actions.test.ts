import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { actionResultSubject, bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { JELLY_ACTION_PERMISSIONS, JELLY_ACTIONS, jellyActions as a, jellyManifest } from "@molis-ai/molis-work-plugin-jelly";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";

const zone = "Asia/Shanghai";
function fixture(t: { after(fn: () => Promise<void>): void }) {
  const home = mkdtempSync(join(tmpdir(), "jelly-actions-"));
  // No model is configured: Jelly starts and works without one (batch 112-2, hand-off to batch 108).
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const caller: ActionCallContext = { actor_id: "owner", project_id: null, audience: "user", permissions: JELLY_ACTION_PERMISSIONS };
  const service = host.homeActionClient(), bound = bindActionClient(service, () => caller);
  t.after(async () => { await host.close(); rmSync(home, { recursive: true, force: true }); });
  const month = () => bound.invoke(a.calendar, { start: "2026-09-01", end: "2026-09-30" });
  return { home, host, caller, service, bound, month };
}

test("Jelly is a Home plugin with fifteen typed actions and no model, settings or routes; permissions and separate Homes hold", async t => {
  const f = fixture(t), other = fixture(t);
  assert.equal(Object.keys(a).length, 15);
  assert.deepEqual(jellyManifest.runtime, { scope: "home" });
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
  const moved = (await f.bound.invoke(a.updateItem, { id: item.id, expected_revision: 1, patch: { start_date: "2026-09-15" } })).item;
  assert.deepEqual([moved.start_date, moved.end_date, moved.revision], ["2026-09-15", "2026-09-16", 2]);
  const done = (await f.bound.invoke(a.updateItem, { id: item.id, expected_revision: 2, patch: { completed: true } })).item;
  assert.ok(done.completed_at);
  await assert.rejects(f.bound.invoke(a.updateItem, { id: item.id, expected_revision: 2, patch: { title: "stale" } }), (error: { code: string; details?: { revision?: number } }) => error.code === "jelly.conflict" && error.details?.revision === 3);
  assert.deepEqual((await f.month()).items.map(entry => entry.id), [item.id]);
  const { restore } = await f.bound.invoke(a.deleteItem, { id: item.id, expected_revision: 3 });
  assert.equal((await f.month()).items.length, 0);
  assert.equal(a.deleteItem.action.undo?.capability_id, "jelly.restore");
  const back = (await f.bound.invoke(a.restore, { rows: restore })).rows.items[0]!;
  assert.deepEqual([back.title, back.start_date, back.revision], ["交稿", "2026-09-15", 4]);
  // Changed again after it came back: the old restore no longer applies.
  await f.bound.invoke(a.updateItem, { id: item.id, expected_revision: 4, patch: { title: "改过" } });
  await assert.rejects(f.bound.invoke(a.restore, { rows: restore }), { code: "jelly.conflict" });
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
  const { restore } = await f.bound.invoke(a.deleteCategory, { id: category.id, expected_revision: 1 });
  const after = await f.month();
  assert.deepEqual(after.categories.map(row => row.id), ["uncategorized"]);
  assert.ok(after.items.every(entry => entry.category_id === "uncategorized"));
  await f.bound.invoke(a.restore, { rows: restore });
  const back = await f.month();
  assert.equal(back.items.find(entry => entry.id === item.id)?.category_id, category.id);
  assert.equal(back.items.find(entry => entry.id === `${series.id}@2026-09-14`)?.category_id, category.id);
  await assert.rejects(f.bound.invoke(a.deleteCategory, { id: "uncategorized", expected_revision: 1 }), { code: "jelly.invalid" });
});

test("notes keep plain text or Markdown, pin to a day, list by day or words, refuse a stale save and come back after delete", async t => {
  const f = fixture(t);
  const { note } = await f.bound.invoke(a.saveNote, { title: "周一", body: "# 要点\n\n- 订会议室", day: "2026-09-07" });
  // An Assistant or MCP caller must name a version on every write: 0 is how it says "a new one".
  await f.service.invoke({ ...f.caller, audience: "agent" }, a.saveNote, { expected_revision: 0, title: "随想", body: "没有日期" });
  assert.deepEqual((await f.bound.invoke(a.notes, { day: "2026-09-07" })).notes.map(row => row.id), [note.id]);
  assert.deepEqual((await f.bound.invoke(a.notes, { day: null })).notes.map(row => row.title), ["随想"]);
  assert.deepEqual((await f.bound.invoke(a.notes, { query: "会议室" })).notes.map(row => [row.id, row.excerpt]), [[note.id, "# 要点 - 订会议室"]]);
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
