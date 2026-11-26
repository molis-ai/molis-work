import assert from "node:assert/strict";
import test from "node:test";
import { changeJellySeries, jellyAddDays, jellyDate, jellyOccurrences, jellyWeekday, validateJellyEntry, validateJellySeries, type JellyItem, type JellySeries } from "@molis-ai/molis-work-plugin-jelly";

const at = "2026-09-01T08:00:00.000Z", zone = "Asia/Shanghai";
const categories = new Set(["uncategorized", "work"]);
const item = (patch: Partial<JellyItem> = {}): JellyItem => ({ id: "a", title: "写周报", kind: "event", category_id: "uncategorized", notes: "", start_date: "2026-09-21", end_date: "2026-09-21",
  start_time: 540, end_time: 600, time_zone: zone, completed_at: null, revision: 1, created_at: at, updated_at: at, ...patch });
// Monday and Wednesday from 2026-09-21 (a Monday), no end.
const series = (patch: Partial<JellySeries> = {}): JellySeries => ({ ...item({ id: "s", title: "站会", start_time: 570, end_time: 585 }), weekdays: [1, 3], until: null, exceptions: {}, completions: {}, ...patch });
const days = (list: { start_date: string }[]) => list.map(entry => entry.start_date);

test("civil dates keep leap days and weekdays whatever the clock's time zone", () => {
  assert.equal(jellyAddDays("2028-02-28", 1), "2028-02-29");
  assert.equal(jellyAddDays("2026-03-08", 1), "2026-03-09");
  assert.equal(jellyWeekday("2026-09-27"), 7);
  assert.throws(() => jellyDate("2026-02-30"), { code: "jelly.invalid" });
});

test("an entry needs a title, a known category, paired times in order and a real time zone", () => {
  validateJellyEntry(item(), categories);
  validateJellyEntry(item({ start_time: null, end_time: null, end_date: "2026-09-23" }), categories);
  validateJellyEntry(item({ end_date: "2026-09-22", start_time: 1320, end_time: 60 }), categories);
  for (const bad of [item({ title: "  " }), item({ category_id: "gone" }), item({ end_time: null }), item({ end_time: 500 }), item({ end_date: "2026-09-20" }), item({ time_zone: "Mars/Base" }), item({ id: "a@b" })])
    assert.throws(() => validateJellyEntry(bad, categories), { code: "jelly.invalid" });
});

test("weekly occurrences cover a range, include a multi-day one that started before it, and sort multi-day first, then by start time", () => {
  const long = item({ id: "trip", start_date: "2026-09-19", end_date: "2026-09-22", start_time: null, end_time: null });
  const list = jellyOccurrences([item(), long], [series()], "2026-09-21", "2026-09-30");
  assert.deepEqual(list.map(entry => entry.id), ["trip", "a", "s@2026-09-21", "s@2026-09-23", "s@2026-09-28", "s@2026-09-30"]);
  assert.equal(list[2]!.series_id, "s"); assert.equal(list[2]!.original_date, "2026-09-21");
  assert.throws(() => jellyOccurrences([], [], "2026-01-01", "2027-03-01"), { code: "jelly.invalid" });
});

test("only this one: an edit or a delete is kept for its date, and completion marks just that date", () => {
  const moved = changeJellySeries(series(), "2026-09-23", "onlyThis", { start_date: "2026-09-24", end_date: "2026-09-24", title: "改期站会" }, at, "x").series!;
  const done = changeJellySeries(moved, "2026-09-28", "onlyThis", { completed: true }, at, "x").series!;
  const skipped = changeJellySeries(done, "2026-09-30", "onlyThis", null, at, "x").series!;
  validateJellySeries(skipped, categories);
  const list = jellyOccurrences([], [skipped], "2026-09-21", "2026-10-04");
  assert.deepEqual(days(list), ["2026-09-21", "2026-09-24", "2026-09-28"]);
  assert.equal(list[1]!.title, "改期站会"); assert.equal(list[2]!.completed_at, at); assert.equal(skipped.revision, 4);
  assert.throws(() => changeJellySeries(series(), "2026-09-22", "onlyThis", null, at, "x"), { code: "jelly.invalid" }, "a Tuesday is no occurrence");
  assert.throws(() => changeJellySeries(series(), "2026-09-23", "onlyThis", { weekdays: [2] }, at, "x"), { code: "jelly.invalid" });
  assert.throws(() => changeJellySeries(series(), "2026-09-23", "all", { completed: true }, at, "x"), { code: "jelly.invalid" });
});

test("this and following ends the series the day before and starts a new one, carrying later exceptions and completions over", () => {
  let value = changeJellySeries(series(), "2026-10-05", "onlyThis", { completed: true }, at, "x").series!;
  value = changeJellySeries(value, "2026-09-21", "onlyThis", { completed: true }, at, "x").series!;
  const { series: before, created } = changeJellySeries(value, "2026-09-30", "thisAndFuture", { start_date: "2026-10-01", end_date: "2026-10-01" }, at, "n");
  assert.equal(before!.until, "2026-09-29"); assert.deepEqual(Object.keys(before!.completions), ["2026-09-21"]);
  assert.equal(created!.id, "n"); assert.equal(created!.start_date, "2026-10-01"); assert.deepEqual(created!.weekdays, [2, 4]);
  assert.deepEqual(Object.keys(created!.completions), ["2026-10-06"]);
  validateJellySeries(before!, categories); validateJellySeries(created!, categories);
  // From the first occurrence on, nothing is left before it: the old series goes.
  assert.equal(changeJellySeries(series(), "2026-09-21", "thisAndFuture", { title: "新站会" }, at, "n").series, null);
});

test("the whole series moves with its first date, keeps its length, and deleting it leaves nothing", () => {
  const { series: moved } = changeJellySeries(series({ exceptions: { "2026-09-28": { deleted: true } } }), "2026-09-23", "all", { start_date: "2026-09-24", end_date: "2026-09-24" }, at, "x");
  assert.equal(moved!.start_date, "2026-09-22"); assert.deepEqual(moved!.weekdays, [2, 4]); assert.deepEqual(moved!.exceptions, {});
  assert.deepEqual(changeJellySeries(series(), "2026-09-23", "all", null, at, "x"), { series: null, created: null });
  assert.throws(() => validateJellySeries(series({ weekdays: [] }), categories), { code: "jelly.invalid" });
  assert.throws(() => validateJellySeries(series({ until: "2026-09-20" }), categories), { code: "jelly.invalid" });
  assert.throws(() => validateJellySeries(series({ completions: { "2026-09-22": at } }), categories), { code: "jelly.invalid" });
});
