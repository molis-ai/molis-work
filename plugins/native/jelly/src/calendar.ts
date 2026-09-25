import { randomUUID } from "node:crypto";
import type { JellyCategory, JellyCommand, JellyItem, JellyOccurrence, JellySchedule, JellySeries, JellyWorkspace } from "@molis-ai/molis-work-contracts/modules/jelly";
import { JELLY_UNCATEGORIZED_ID, jellyAddDays, jellyAssert, jellyDate, jellyDaysBetween, jellyLogicalOccurrence, jellyOccurrenceIdentity, jellyWeekday, jellyWithinSeries, validateJellyItem, validateJellySeries, validateJellyWorkspace } from "./calendar-validation.js";
export { JELLY_UNCATEGORIZED_ID, validateJellyWorkspace } from "./calendar-validation.js";

export function emptyJellyWorkspace(): JellyWorkspace {
  return { schema_version: 1, revision: 0, categories: [{ id: JELLY_UNCATEGORIZED_ID, name: "未分类", color: "#8E8E93", sort_index: 0 }], items: [], series: [], notes: [], inspirations: [], relations: [], relation_overrides: [], task_links: [], applied_plan_ids: [] };
}
export function makeJellyItem(input: Partial<JellyItem>, now: string): JellyItem {
  const start = jellyDate(input.start_date);
  return { id: input.id ?? randomUUID(), title: typeof input.title === "string" ? input.title.trim() : "", kind: input.kind ?? "task", category_id: input.category_id ?? JELLY_UNCATEGORIZED_ID, priority: input.pinned ? "P0" : input.priority ?? "none", pinned: input.pinned ?? false, start_date: start, end_date: input.end_date ?? start, start_time: input.start_time ?? null, end_time: input.end_time ?? null, completed_at: input.completed_at ?? null, completion_description: input.completion_description ?? "", notes: input.notes ?? "", untimed_rank: input.untimed_rank ?? 0, created_at: now, updated_at: now, time_zone: input.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone };
}
function record(value: unknown, label: string): Record<string, unknown> { jellyAssert(value && typeof value === "object" && !Array.isArray(value), `${label} 无效`); return value as Record<string, unknown>; }
function identifier(value: unknown): string { jellyAssert(typeof value === "string" && value.length > 0, "ID 无效"); return value; }
function ids(value: unknown): string[] { jellyAssert(Array.isArray(value) && value.every(id => typeof id === "string") && new Set(value).size === value.length, "ID 列表重复或无效"); return value as string[]; }
function bool(value: unknown): boolean { jellyAssert(typeof value === "boolean", "完成状态无效"); return value; }
const mutableFields = ["title", "kind", "category_id", "priority", "pinned", "start_date", "end_date", "start_time", "end_time", "completion_description", "notes", "untimed_rank"] as const;
function patchItem<T extends JellyItem>(item: T, raw: Record<string, unknown>, now: string): T {
  const next = { ...item };
  for (const key of mutableFields) if (Object.hasOwn(raw, key)) Object.assign(next, { [key]: raw[key] });
  if (typeof next.title === "string") next.title = next.title.trim();
  if (raw.pinned === true) next.priority = "P0";
  next.updated_at = now;
  return next;
}
function shiftSchedule<T extends JellySchedule>(item: T, delta: number): T { return { ...item, start_date: jellyAddDays(item.start_date, delta), end_date: jellyAddDays(item.end_date, delta) }; }
function rangeIntersects(item: JellySchedule, start: string, end: string): boolean { return item.start_date <= end && item.end_date >= start; }
function effectiveOccurrence(series: JellySeries, date: string): JellyOccurrence {
  const duration = jellyDaysBetween(series.start_date, series.end_date);
  const { weekdays: _weekdays, until: _until, exceptions: _exceptions, completions: _completions, ...base } = series;
  const completion = series.completions[date];
  return { ...base, start_date: date, end_date: jellyAddDays(date, duration), ...series.exceptions[date]?.patch, id: `${series.id}@${date}`, series_id: series.id, original_date: date, completed_at: completion?.completed_at ?? null, completion_description: completion?.completion_description ?? base.completion_description };
}
const priorityRank = { P0: 0, P1: 1, P2: 2, none: 3 };
export function compareJellyOccurrences(a: JellyOccurrence, b: JellyOccurrence): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  if (a.priority !== b.priority) return priorityRank[a.priority] - priorityRank[b.priority];
  const aMulti = a.end_date !== a.start_date; const bMulti = b.end_date !== b.start_date;
  if (aMulti !== bMulti) return aMulti ? -1 : 1;
  if ((a.start_time === null) !== (b.start_time === null)) return a.start_time === null ? -1 : 1;
  if (a.start_time !== null && b.start_time !== null && a.start_time !== b.start_time) return a.start_time - b.start_time;
  if (!aMulti && !bMulti && a.start_time === null && b.start_time === null && a.untimed_rank !== b.untimed_rank) return a.untimed_rank - b.untimed_rank;
  return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}
export function jellyOccurrences(state: JellyWorkspace, start: string, end: string): JellyOccurrence[] {
  jellyDate(start); jellyDate(end); jellyAssert(end >= start && jellyDaysBetween(start, end) <= 36600, "日历查询范围无效或超过 100 年");
  const result: JellyOccurrence[] = state.items.filter(item => rangeIntersects(item, start, end)).map(item => ({ ...item, series_id: null, original_date: null }));
  for (const series of state.series) {
    const duration = jellyDaysBetween(series.start_date, series.end_date);
    const startMs = Date.parse(`${start}T12:00:00Z`) - duration * 86400000;
    const lower = Math.max(startMs, Date.parse(`${series.start_date}T12:00:00Z`));
    let date = new Date(lower).toISOString().slice(0, 10);
    const upper = series.until && series.until < end ? series.until : end;
    const candidates = new Set(Object.keys(series.exceptions).filter(day => jellyLogicalOccurrence(series, day)));
    while (date <= upper) { if (series.weekdays.includes(jellyWeekday(date))) candidates.add(date); if (date === upper) break; date = jellyAddDays(date, 1); }
    for (const candidate of candidates) {
      if (!jellyLogicalOccurrence(series, candidate)) continue;
      const occurrence = effectiveOccurrence(series, candidate);
      if (rangeIntersects(occurrence, start, end)) result.push(occurrence);
    }
  }
  return result.sort(compareJellyOccurrences);
}
/** Timed intervals are half-open. Untimed items do not reserve every minute of their day. */
export function jellySchedulesOverlap(a: JellySchedule, b: JellySchedule): boolean {
  if (a.start_time === null || a.end_time === null || b.start_time === null || b.end_time === null) return false;
  const origin = a.start_date < b.start_date ? a.start_date : b.start_date;
  const startA = jellyDaysBetween(origin, a.start_date) * 1440 + a.start_time;
  const endA = jellyDaysBetween(origin, a.end_date) * 1440 + a.end_time;
  const startB = jellyDaysBetween(origin, b.start_date) * 1440 + b.start_time;
  const endB = jellyDaysBetween(origin, b.end_date) * 1440 + b.end_time;
  return startA < endB && startB < endA;
}
export function jellyProgress(state: JellyWorkspace, start: string, end: string, today: string, categoryIds?: string[]) {
  jellyDate(today);
  const allowed = categoryIds ? new Set(categoryIds) : null;
  const items = jellyOccurrences(state, start, end).filter(item => !allowed || allowed.has(item.category_id));
  const completed = items.filter(item => item.completed_at !== null);
  const open = items.filter(item => item.completed_at === null);
  const overdue = open.filter(item => item.end_date < today);
  const categories = state.categories.map(category => { const group = items.filter(item => item.category_id === category.id); return { ...category, total: group.length, completed: group.filter(item => item.completed_at !== null).length }; }).filter(category => category.total > 0).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return { start, end, today, total: items.length, completed_count: completed.length, open_count: open.length, overdue_count: overdue.length, high_priority_open: open.filter(item => item.priority === "P0" || item.priority === "P1").length, completed, open, overdue, categories, factual_summary: items.length === 0 ? "这一时段还没有事项。" : open.length === 0 ? `这一时段的 ${items.length} 件事项已全部完成。` : `已完成 ${completed.length} 件，仍有 ${open.length} 件${overdue.length ? `，其中 ${overdue.length} 件已延期。` : "在进行。"}` };
}
function syncLinkedBlock(state: JellyWorkspace, item: JellyItem, now: string): void {
  for (const link of state.task_links.filter(link => link.item_id === item.id)) {
    const note = state.notes.find(note => note.id === link.note_id); const block = note?.blocks.find(block => block.id === link.block_id);
    jellyAssert(note && block?.kind === "task", "关联的任务块已不存在");
    if (block.text !== item.title || block.completed_at !== item.completed_at || block.completion_description !== item.completion_description) { if (block.text !== item.title) block.inline_spans = undefined; block.text = item.title; block.completed_at = item.completed_at; block.completion_description = item.completion_description; note.revision++; note.updated_at = now; }
  }
}
function removeOwnerRelations(state: JellyWorkspace, id: string, predicate: (day: string | null) => boolean = () => true): void {
  state.relations = state.relations.filter(relation => relation.owner_id !== id || !predicate(relation.original_date));
  state.relation_overrides = state.relation_overrides?.filter(relation => relation.owner_id !== id || !predicate(relation.original_date));
}
function completeAt(previous: string | null, completed: boolean, now: string): string | null { return completed ? previous ?? now : null; }
function requireSeries(state: JellyWorkspace, command: JellyCommand): { series: JellySeries; date: string } {
  const series = state.series.find(series => series.id === identifier(command.id)); jellyAssert(series, "重复系列不存在");
  const date = jellyDate(command.original_date); jellyAssert(jellyLogicalOccurrence(series, date), "重复实例不存在"); return { series, date };
}
function retainHistory(state: JellyWorkspace, series: JellySeries, boundary: string, now: string): boolean {
  let hasHistory = Object.entries(series.exceptions).some(([date, exception]) => date < boundary && !exception.deleted);
  for (const weekday of series.weekdays) {
    let day = jellyAddDays(series.start_date, (weekday - jellyWeekday(series.start_date) + 7) % 7);
    while (day < boundary && series.exceptions[day]?.deleted) day = jellyAddDays(day, 7);
    if (day < boundary) hasHistory = true;
  }
  if (!hasHistory) { state.series = state.series.filter(value => value.id !== series.id); return false; }
  series.until = jellyAddDays(boundary, -1); series.updated_at = now;
  series.exceptions = Object.fromEntries(Object.entries(series.exceptions).filter(([day]) => day < boundary));
  series.completions = Object.fromEntries(Object.entries(series.completions).filter(([day]) => day < boundary));
  return true;
}
function mutateSeries(state: JellyWorkspace, command: JellyCommand, now: string): void {
  const { series, date } = requireSeries(state, command); const scope = command.scope;
  jellyAssert(scope === "onlyThis" || scope === "thisAndFuture", "修改范围应为 onlyThis 或 thisAndFuture");
  const deleting = command.type === "series.delete";
  if (scope === "onlyThis") {
    if (deleting) { series.exceptions[date] = { deleted: true }; delete series.completions[date]; }
    else {
      const patch = record(command.patch, "重复修改"); jellyAssert(patch.weekdays === undefined && patch.until === undefined, "单次修改不能改变重复规则");
      const occurrence = patchItem(effectiveOccurrence(series, date), patch, now);
      validateJellyItem(occurrence, new Set(state.categories.map(category => category.id)));
      const { series_id: _sid, original_date: _date, ...value } = occurrence;
      series.exceptions[date] = { patch: { ...value, id: series.id } };
    }
    series.updated_at = now; return;
  }
  const original = structuredClone(series);
  const keptHistory = retainHistory(state, series, date, now);
  if (deleting) { removeOwnerRelations(state, series.id, day => !keptHistory || (day !== null && day >= date)); return; }
  const patch = record(command.patch, "重复修改");
  const newStart = patch.start_date === undefined ? date : jellyDate(patch.start_date);
  const delta = jellyDaysBetween(date, newStart);
  const futureId = command.new_series_id === undefined ? randomUUID() : identifier(command.new_series_id);
  jellyAssert(!state.series.some(value => value.id === futureId) && !state.items.some(value => value.id === futureId) && futureId !== original.id, "新系列 ID 已存在");
  const duration = jellyDaysBetween(original.start_date, original.end_date);
  const future = patchItem({ ...original, id: futureId, start_date: newStart, end_date: jellyAddDays(newStart, duration), created_at: now }, patch, now);
  future.weekdays = patch.weekdays === undefined ? original.weekdays.map(day => ((day - 1 + delta) % 7 + 7) % 7 + 1) : patch.weekdays as number[];
  future.until = patch.until === undefined ? (original.until === null ? null : jellyAddDays(original.until, delta)) : patch.until as string | null;
  future.exceptions = {}; future.completions = {};
  for (const [oldDate, exception] of Object.entries(original.exceptions)) {
    if (oldDate < date) continue; const newDate = jellyAddDays(oldDate, delta); if (!jellyWithinSeries(future, newDate)) continue;
    if (exception.deleted) future.exceptions[newDate] = { deleted: true };
    else if (exception.patch) {
      let value = shiftSchedule({ ...effectiveOccurrence(original, oldDate), id: future.id }, delta);
      if (oldDate === date) value = patchItem(value, patch, now);
      const { series_id: _sid, original_date: _date, ...item } = value;
      future.exceptions[newDate] = { patch: item };
    }
  }
  for (const [oldDate, completion] of Object.entries(original.completions)) { const newDate = jellyAddDays(oldDate, delta); if (oldDate >= date && jellyLogicalOccurrence(future, newDate)) future.completions[newDate] = completion; }
  validateJellySeries(future, new Set(state.categories.map(category => category.id)));
  state.series.push(future);
  const baseline = state.relations.filter(relation => relation.owner_id === original.id && relation.original_date === null);
  for (const relation of baseline) state.relations.push({ ...relation, owner_id: future.id });
  state.relations = state.relations.flatMap(relation => {
    if (relation.owner_id !== original.id) return [relation];
    if (relation.original_date === null) return keptHistory ? [relation] : [];
    if (relation.original_date < date) return keptHistory ? [relation] : [];
    const day = jellyAddDays(relation.original_date, delta); return jellyOccurrenceIdentity(future, day) ? [{ ...relation, owner_id: future.id, original_date: day }] : [];
  });
  state.relation_overrides = state.relation_overrides?.flatMap(relation => {
    if (relation.owner_id !== original.id) return [relation];
    if (relation.original_date < date) return keptHistory ? [relation] : [];
    const day = jellyAddDays(relation.original_date, delta); return jellyOccurrenceIdentity(future, day) ? [{ ...relation, owner_id: future.id, original_date: day }] : [];
  });
}
const calendarCommandTypes = new Set(["item.create", "item.update", "item.delete", "item.move", "item.move_many", "item.complete", "item.reorder", "series.create", "series.update", "series.delete", "series.complete", "category.create", "category.update", "category.delete", "category.reorder"]);
/** Validate a candidate before publishing it, so failed commands cannot partly mutate callers. */
export function applyJellyCalendarCommand(state: JellyWorkspace, command: JellyCommand, nowValue: string | Date): boolean {
  if (!calendarCommandTypes.has(command.type)) return false;
  const now = nowValue instanceof Date ? nowValue.toISOString() : nowValue;
  jellyAssert(typeof now === "string" && Number.isFinite(Date.parse(now)), "操作时间无效");
  const next = structuredClone(state); apply(next, command, now); validateJellyWorkspace(next); Object.assign(state, next); return true;
}
function apply(state: JellyWorkspace, command: JellyCommand, now: string): void {
  const categoryIds = new Set(state.categories.map(category => category.id));
  switch (command.type) {
    case "item.create": { const item = makeJellyItem(record(command.item, "事项"), now); validateJellyItem(item, categoryIds); state.items.push(item); break; }
    case "item.update": { const index = state.items.findIndex(item => item.id === identifier(command.id)); jellyAssert(index >= 0, "事项不存在"); state.items[index] = patchItem(state.items[index]!, record(command.patch, "修改"), now); syncLinkedBlock(state, state.items[index]!, now); break; }
    case "item.complete": { const item = state.items.find(item => item.id === identifier(command.id)); jellyAssert(item, "事项不存在"); item.completed_at = completeAt(item.completed_at, bool(command.completed), now); if (command.completion_description !== undefined) { jellyAssert(typeof command.completion_description === "string", "完成说明无效"); item.completion_description = command.completion_description; } item.updated_at = now; syncLinkedBlock(state, item, now); break; }
    case "item.delete": { const id = identifier(command.id); jellyAssert(state.items.some(item => item.id === id), "事项不存在"); state.items = state.items.filter(item => item.id !== id); state.task_links = state.task_links.filter(link => link.item_id !== id); removeOwnerRelations(state, id); break; }
    case "item.move": case "item.move_many": { const selected = command.type === "item.move" ? [identifier(command.id)] : ids(command.ids); jellyAssert(selected.length > 0, "请选择事项"); const date = jellyDate(command.date); for (const id of selected) { const index = state.items.findIndex(item => item.id === id); jellyAssert(index >= 0, "事项不存在"); const item = state.items[index]!; state.items[index] = { ...shiftSchedule(item, jellyDaysBetween(item.start_date, date)), updated_at: now }; } break; }
    case "item.reorder": { const date = jellyDate(command.date); const order = ids(command.ids); const available = state.items.filter(item => item.start_date === date && item.end_date === date && item.start_time === null); jellyAssert(order.length === available.length && available.every(item => order.includes(item.id)), "排序必须包含该日全部单日无时间事项"); for (const item of available) { item.untimed_rank = order.indexOf(item.id); item.updated_at = now; } break; }
    case "series.create": { const input = record(command.series, "重复系列"); const series: JellySeries = { ...makeJellyItem(input, now), weekdays: input.weekdays as number[], until: input.until === undefined ? null : input.until as string | null, exceptions: {}, completions: {} }; validateJellySeries(series, categoryIds); state.series.push(series); break; }
    case "series.update": case "series.delete": mutateSeries(state, command, now); break;
    case "series.complete": { const { series, date } = requireSeries(state, command); const old = series.completions[date]; const completed = bool(command.completed); jellyAssert(command.completion_description === undefined || typeof command.completion_description === "string", "完成说明无效"); if (completed) series.completions[date] = { completed_at: completeAt(old?.completed_at ?? null, true, now), completion_description: command.completion_description as string ?? old?.completion_description ?? "" }; else delete series.completions[date]; series.updated_at = now; break; }
    case "category.create": { const input = record(command.category, "分类"); const category: JellyCategory = { id: input.id === undefined ? randomUUID() : identifier(input.id), name: typeof input.name === "string" ? input.name.trim() : "", color: input.color === undefined ? "#6A8D73" : input.color as string, sort_index: state.categories.length }; state.categories.push(category); break; }
    case "category.update": { const category = state.categories.find(category => category.id === identifier(command.id)); jellyAssert(category, "分类不存在"); const patch = record(command.patch, "分类修改"); if (patch.name !== undefined) { jellyAssert(category.id !== JELLY_UNCATEGORIZED_ID, "未分类不能改名"); jellyAssert(typeof patch.name === "string", "分类名无效"); category.name = patch.name.trim(); } if (patch.color !== undefined) category.color = patch.color as string; break; }
    case "category.delete": { const id = identifier(command.id); jellyAssert(id !== JELLY_UNCATEGORIZED_ID && categoryIds.has(id), "不能删除未分类或不存在的分类"); state.categories = state.categories.filter(category => category.id !== id); state.categories.forEach((category, index) => { category.sort_index = index; }); for (const item of [...state.items, ...state.series]) if (item.category_id === id) { item.category_id = JELLY_UNCATEGORIZED_ID; item.updated_at = now; } for (const series of state.series) for (const exception of Object.values(series.exceptions)) if (exception.patch?.category_id === id) exception.patch.category_id = JELLY_UNCATEGORIZED_ID; for (const note of state.notes) if (note.category_id === id) { note.category_id = JELLY_UNCATEGORIZED_ID; note.revision++; note.updated_at = now; } for (const inspiration of state.inspirations) if (inspiration.category_id === id) { inspiration.category_id = JELLY_UNCATEGORIZED_ID; inspiration.updated_at = now; } break; }
    case "category.reorder": { const order = ids(command.ids); jellyAssert(order.length === state.categories.length && state.categories.every(category => order.includes(category.id)), "排序必须包含全部分类"); state.categories.forEach(category => { category.sort_index = order.indexOf(category.id); }); state.categories.sort((a, b) => a.sort_index - b.sort_index); break; }
  }
}
