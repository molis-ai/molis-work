import { isTimeZone } from "@molis-ai/molis-work-plugin-sdk";
import type { JellyItem, JellyOccurrence, JellyOccurrencePatch, JellySchedule, JellySeries } from "./contract.js";
import { jellyAssert } from "./error.js";

/** The one category that is always there and cannot be renamed or deleted; entries of a deleted category move to it. */
export const JELLY_UNCATEGORIZED_ID = "uncategorized";
const DAY = 86_400_000;

export function jellyDate(value: unknown): string {
  jellyAssert(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value), "日期应为 YYYY-MM-DD");
  const timestamp = Date.parse(`${value}T12:00:00.000Z`);
  jellyAssert(Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value && value >= "0001-01-01", "日期无效");
  return value;
}
export function jellyDaysBetween(start: string, end: string): number { return (Date.parse(`${jellyDate(end)}T12:00:00Z`) - Date.parse(`${jellyDate(start)}T12:00:00Z`)) / DAY; }
export function jellyAddDays(day: string, count: number): string {
  jellyAssert(Number.isSafeInteger(count), "天数无效");
  return jellyDate(new Date(Date.parse(`${jellyDate(day)}T12:00:00Z`) + count * DAY).toISOString().slice(0, 10));
}
/** 1 is Monday, 7 Sunday. */
export function jellyWeekday(day: string): number { return new Date(`${jellyDate(day)}T12:00:00Z`).getUTCDay() || 7; }

function validateSchedule(schedule: JellySchedule): void {
  jellyDate(schedule.start_date); jellyDate(schedule.end_date);
  jellyAssert(schedule.end_date >= schedule.start_date, "结束日期不能早于开始日期");
  jellyAssert((schedule.start_time === null) === (schedule.end_time === null), "开始和结束时间必须同时填写");
  for (const minute of [schedule.start_time, schedule.end_time]) jellyAssert(minute === null || (Number.isInteger(minute) && minute >= 0 && minute < 1440), "时间必须是 0–1439 的分钟数");
  if (schedule.start_date === schedule.end_date && schedule.start_time !== null && schedule.end_time !== null) jellyAssert(schedule.end_time > schedule.start_time, "结束时间必须晚于开始时间");
  jellyAssert(typeof schedule.time_zone === "string" && isTimeZone(schedule.time_zone), "时区无效");
}
const stamp = (value: unknown): boolean => typeof value === "string" && Number.isFinite(Date.parse(value));
/** What every entry and every occurrence must be. `categories` are the ids that exist. */
/** The category ids an entry may name; sync, where a category may arrive after its entries, passes one that has every id. */
export type JellyCategoryIds = Pick<ReadonlySet<string>, "has">;
export function validateJellyEntry(entry: Omit<JellyItem, "completed_at"> & { completed_at?: string | null }, categories: JellyCategoryIds): void {
  jellyAssert(typeof entry.id === "string" && entry.id.length > 0 && entry.id.length <= 200 && !entry.id.includes("@"), "事项 ID 无效");
  jellyAssert(typeof entry.title === "string" && entry.title.trim().length > 0 && entry.title.length <= 500, "事项标题不能为空，也不能超过 500 字");
  jellyAssert(entry.kind === "task" || entry.kind === "event", "事项类型无效");
  jellyAssert(categories.has(entry.category_id), "分类不存在");
  jellyAssert(typeof entry.notes === "string" && entry.notes.length <= 20_000, "备注过长");
  jellyAssert((entry.completed_at === undefined || entry.completed_at === null || stamp(entry.completed_at)) && stamp(entry.created_at) && stamp(entry.updated_at), "事项时间戳无效");
  jellyAssert(Number.isSafeInteger(entry.revision) && entry.revision >= 1, "事项版本无效");
  validateSchedule(entry);
}
const within = (series: JellySeries, date: string): boolean => date >= series.start_date && (series.until === null || date <= series.until);
/** Whether `date` is an occurrence the series shows (its weekday, or a moved occurrence kept as an exception, and not deleted). */
export function jellyOccurs(series: JellySeries, date: string): boolean {
  const exception = series.exceptions[date];
  return within(series, date) && !exception?.deleted && (!!exception?.patch || series.weekdays.includes(jellyWeekday(date)));
}
export function validateJellySeries(series: JellySeries, categories: JellyCategoryIds): void {
  validateJellyEntry(series, categories);
  jellyAssert(Array.isArray(series.weekdays) && series.weekdays.length > 0 && new Set(series.weekdays).size === series.weekdays.length && series.weekdays.every(day => Number.isInteger(day) && day >= 1 && day <= 7), "重复星期应为 1–7，不能重复或为空");
  if (series.until !== null) jellyAssert(jellyDate(series.until) >= series.start_date, "重复结束日不能早于开始日");
  let natural = false;
  for (let offset = 0; offset < 7; offset++) { const day = jellyAddDays(series.start_date, offset); if (series.until !== null && day > series.until) break; if (series.weekdays.includes(jellyWeekday(day))) natural = true; }
  jellyAssert(natural || Object.entries(series.exceptions).some(([day, exception]) => within(series, day) && exception.patch), "重复范围内没有一次日程");
  for (const [date, exception] of Object.entries(series.exceptions)) {
    jellyDate(date); jellyAssert(within(series, date), "重复例外超出系列范围");
    jellyAssert(exception && (exception.deleted === true) !== !!exception.patch, "重复例外无效");
    if (exception.patch) validateJellyEntry({ ...occurrenceOf(series, date), id: series.id }, categories);
  }
  for (const [date, completed] of Object.entries(series.completions)) jellyAssert(jellyOccurs(series, jellyDate(date)) && stamp(completed), "完成记录指向不存在的一次日程");
}

/** One occurrence of a series as the calendar shows it. Its id is `<series id>@<original date>`. */
export function occurrenceOf(series: JellySeries, date: string): JellyOccurrence {
  const { weekdays: _weekdays, until: _until, exceptions, completions, ...base } = series;
  const length = jellyDaysBetween(series.start_date, series.end_date);
  return { ...base, start_date: date, end_date: jellyAddDays(date, length), ...exceptions[date]?.patch, id: `${series.id}@${date}`, series_id: series.id, original_date: date, completed_at: completions[date] ?? null };
}
const intersects = (entry: JellySchedule, start: string, end: string): boolean => entry.start_date <= end && entry.end_date >= start;
/** Sorted for one day's list: multi-day first, then all-day, then by start time; ties by creation. */
export function compareJellyOccurrences(a: JellyOccurrence, b: JellyOccurrence): number {
  const aLong = a.end_date !== a.start_date, bLong = b.end_date !== b.start_date;
  if (aLong !== bLong) return aLong ? -1 : 1;
  if ((a.start_time === null) !== (b.start_time === null)) return a.start_time === null ? -1 : 1;
  if (a.start_time !== null && b.start_time !== null && a.start_time !== b.start_time) return a.start_time - b.start_time;
  return a.start_date.localeCompare(b.start_date) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}
/** Every entry and occurrence that touches `start`..`end` (both included). */
export function jellyOccurrences(items: readonly JellyItem[], series: readonly JellySeries[], start: string, end: string): JellyOccurrence[] {
  jellyAssert(jellyDate(end) >= jellyDate(start) && jellyDaysBetween(start, end) <= 400, "日历查询范围无效或超过 400 天");
  const result: JellyOccurrence[] = items.filter(item => intersects(item, start, end)).map(item => ({ ...item, series_id: null, original_date: null }));
  for (const value of series) {
    const length = jellyDaysBetween(value.start_date, value.end_date);
    const first = jellyAddDays(start, -length) > value.start_date ? jellyAddDays(start, -length) : value.start_date;
    const last = value.until !== null && value.until < end ? value.until : end;
    const candidates = new Set(Object.keys(value.exceptions));
    for (let day = first; day <= last; day = jellyAddDays(day, 1)) if (value.weekdays.includes(jellyWeekday(day))) candidates.add(day);
    for (const day of candidates) if (jellyOccurs(value, day)) { const occurrence = occurrenceOf(value, day); if (intersects(occurrence, start, end)) result.push(occurrence); }
  }
  return result.sort(compareJellyOccurrences);
}

export type JellySeriesScope = "onlyThis" | "thisAndFuture" | "all";
export interface JellySeriesPatch extends JellyOccurrencePatch { weekdays?: number[]; until?: string | null; completed?: boolean }
/** What a change to a series leaves: the series as it is now (`null` when nothing of it is left) and, for "this and following", the new series split off. */
export interface JellySeriesChange { series: JellySeries | null; created: JellySeries | null }
const OCCURRENCE_FIELDS = ["title", "kind", "category_id", "notes", "start_date", "end_date", "start_time", "end_time"] as const;
function pick(patch: JellySeriesPatch): JellyOccurrencePatch {
  return Object.fromEntries(OCCURRENCE_FIELDS.filter(key => patch[key] !== undefined).map(key => [key, key === "title" ? patch.title!.trim() : patch[key]]));
}
/** Ends the series before `boundary`; `null` when no occurrence is left before it. */
function endBefore(series: JellySeries, boundary: string): JellySeries | null {
  const until = jellyAddDays(boundary, -1);
  const kept = { ...series, until: series.until !== null && series.until < until ? series.until : until,
    exceptions: Object.fromEntries(Object.entries(series.exceptions).filter(([day]) => day < boundary)),
    completions: Object.fromEntries(Object.entries(series.completions).filter(([day]) => day < boundary)) };
  for (let day = kept.start_date; day <= kept.until; day = jellyAddDays(day, 1)) if (jellyOccurs(kept, day)) return kept;
  return null;
}
const rotate = (weekdays: readonly number[], days: number): number[] => weekdays.map(day => ((day - 1 + days) % 7 + 7) % 7 + 1);
const sameDays = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every(day => b.includes(day));
/** Single-date records moved by `days`: the date they are kept under, and any date a kept change names. */
function shiftExceptions(exceptions: JellySeries["exceptions"], days: number): JellySeries["exceptions"] {
  return Object.fromEntries(Object.entries(exceptions).map(([day, value]) => [jellyAddDays(day, days), value.patch ? { patch: {
    ...value.patch,
    ...(value.patch.start_date !== undefined ? { start_date: jellyAddDays(value.patch.start_date, days) } : {}),
    ...(value.patch.end_date !== undefined ? { end_date: jellyAddDays(value.patch.end_date, days) } : {}),
  } } : value]));
}
/**
 * One change to a repeating series at the occurrence originally on `date`. `patch` absent deletes; `patch.completed` alone marks or clears that
 * one occurrence. A new `start_date` moves from where the occurrence is now (a single-date move included); "all" moves the whole series by as
 * many days, "this and following" ends the series before `date` and starts `newId` moved by as many days. `weekdays` count as a change only
 * when they differ: unchanged, they turn with the move. Single-date changes and completions move along, and only those that no longer fall on
 * the series are dropped.
 */
export function changeJellySeries(series: JellySeries, date: string, scope: JellySeriesScope, patch: JellySeriesPatch | null, now: string, newId: string): JellySeriesChange {
  jellyAssert(jellyOccurs(series, jellyDate(date)), "这一次重复日程不存在");
  const touched = (value: JellySeries): JellySeries => ({ ...value, revision: value.revision + 1, updated_at: now });
  const fields = patch ? pick(patch) : {};
  const current = occurrenceOf(series, date);
  // Moving only the start moves the end along, as `jelly.item.update` does.
  const moved = fields.start_date === undefined ? 0 : jellyDaysBetween(current.start_date, fields.start_date);
  if (fields.start_date !== undefined && fields.end_date === undefined) fields.end_date = jellyAddDays(current.end_date, moved);
  const rule = patch && (patch.weekdays !== undefined || patch.until !== undefined);
  if (patch?.completed !== undefined) {
    jellyAssert(scope === "onlyThis" && !rule && Object.keys(fields).length === 0, "完成状态只能对一次日程单独标记");
    const completions = { ...series.completions };
    if (patch.completed) completions[date] = completions[date] ?? now; else delete completions[date];
    return { series: touched({ ...series, completions }), created: null };
  }
  if (scope === "onlyThis") {
    jellyAssert(!rule, "只改这一次时不能改变重复规则");
    const exceptions = { ...series.exceptions, [date]: patch ? { patch: { ...series.exceptions[date]?.patch, ...fields } } : { deleted: true as const } };
    const completions = { ...series.completions }; if (!patch) delete completions[date];
    return { series: touched({ ...series, exceptions, completions }), created: null };
  }
  if (scope === "all" && !patch) return { series: null, created: null };
  const kept = scope === "thisAndFuture" ? endBefore(series, date) : null;
  if (!patch) return { series: kept && touched(kept), created: null };
  const { start_date: _start, end_date: _end, ...rest } = fields;
  // The edited occurrence's new length, against what it was, changes every occurrence's length alike.
  const resized = jellyDaysBetween(fields.start_date ?? current.start_date, fields.end_date ?? current.end_date) - jellyDaysBetween(current.start_date, current.end_date);
  const length = jellyDaysBetween(series.start_date, series.end_date) + resized;
  const weekdays = patch.weekdays !== undefined && !sameDays(patch.weekdays, series.weekdays) ? [...patch.weekdays] : rotate(series.weekdays, moved);
  const from = scope === "all" ? series.start_date : date, start = jellyAddDays(from, moved);
  const own = (day: string) => scope === "all" || day >= date;
  const exceptions = shiftExceptions(Object.fromEntries(Object.entries(series.exceptions).filter(([day]) => own(day))), moved);
  // The edited occurrence now follows the series for what was just set; a single-date move it had keeps its new dates.
  const edited = exceptions[jellyAddDays(date, moved)];
  if (edited?.patch) {
    const left = Object.fromEntries(Object.entries(edited.patch).filter(([key]) => !(key in rest)));
    exceptions[jellyAddDays(date, moved)] = { patch: { ...left, ...(left.start_date !== undefined || left.end_date !== undefined
      ? { start_date: fields.start_date ?? jellyAddDays(current.start_date, moved), end_date: fields.end_date ?? jellyAddDays(current.end_date, moved) } : {}) } };
  }
  const next: JellySeries = { ...series, ...rest, start_date: start, end_date: jellyAddDays(start, length), weekdays,
    until: patch.until !== undefined ? patch.until : series.until === null ? null : jellyAddDays(series.until, moved), exceptions: {}, completions: {} };
  next.exceptions = Object.fromEntries(Object.entries(exceptions).filter(([day]) => within(next, day) && weekdays.includes(jellyWeekday(day))));
  next.completions = Object.fromEntries(Object.entries(series.completions).filter(([day]) => own(day))
    .map(([day, value]) => [jellyAddDays(day, moved), value] as const).filter(([day]) => jellyOccurs(next, day)));
  if (scope === "all") return { series: touched(next), created: null };
  return { series: kept && touched(kept), created: { ...next, id: newId, revision: 1, created_at: now, updated_at: now } };
}
