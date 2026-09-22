import type { JellyItem, JellySchedule, JellySeries, JellyWorkspace } from "@molis-ai/molis-work-contracts/modules/jelly";

export const JELLY_UNCATEGORIZED_ID = "uncategorized";
export function jellyAssert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
export function jellyDate(value: unknown): string {
  jellyAssert(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value), "日期应为 YYYY-MM-DD");
  const timestamp = Date.parse(`${value}T12:00:00.000Z`);
  jellyAssert(Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value && value >= "0001-01-01", "日期无效");
  return value;
}
export function jellyDaysBetween(start: string, end: string): number { return (Date.parse(`${jellyDate(end)}T12:00:00Z`) - Date.parse(`${jellyDate(start)}T12:00:00Z`)) / 86400000; }
export function jellyAddDays(day: string, count: number): string {
  jellyAssert(Number.isSafeInteger(count), "天数无效");
  const date = new Date(Date.parse(`${jellyDate(day)}T12:00:00Z`) + count * 86400000);
  return jellyDate(date.toISOString().slice(0, 10));
}
export function jellyWeekday(day: string): number { return new Date(`${jellyDate(day)}T12:00:00Z`).getUTCDay() || 7; }
export function validateJellySchedule(schedule: JellySchedule): void {
  jellyDate(schedule.start_date); jellyDate(schedule.end_date);
  jellyAssert(schedule.end_date >= schedule.start_date, "结束日期不能早于开始日期");
  jellyAssert((schedule.start_time === null) === (schedule.end_time === null), "开始和结束时间必须同时填写");
  for (const minute of [schedule.start_time, schedule.end_time]) jellyAssert(minute === null || (Number.isInteger(minute) && minute >= 0 && minute < 1440), "时间必须是 0–1439 的分钟数");
  if (schedule.start_date === schedule.end_date && schedule.start_time !== null && schedule.end_time !== null) jellyAssert(schedule.end_time > schedule.start_time, "结束时间必须晚于开始时间");
}
function stamp(value: unknown): boolean { return value === null || (typeof value === "string" && Number.isFinite(Date.parse(value))); }
export function validateJellyItem(item: JellyItem, categoryIds: Set<string>): void {
  jellyAssert(item && typeof item.id === "string" && item.id.length > 0, "事项 ID 无效");
  jellyAssert(typeof item.title === "string" && item.title.trim().length > 0, "事项标题不能为空");
  jellyAssert(item.kind === "task" || item.kind === "event", "事项类型无效");
  jellyAssert(categoryIds.has(item.category_id), "分类不存在");
  jellyAssert(["P0", "P1", "P2", "none"].includes(item.priority), "优先级无效");
  jellyAssert(typeof item.pinned === "boolean" && Number.isSafeInteger(item.untimed_rank), "事项排序无效");
  jellyAssert(stamp(item.completed_at) && stamp(item.created_at) && stamp(item.updated_at) && item.created_at !== null && item.updated_at !== null, "事项时间戳无效");
  jellyAssert(typeof item.notes === "string" && typeof item.completion_description === "string", "事项内容无效");
  jellyAssert(typeof item.time_zone === "string", "时区无效");
  try { new Intl.DateTimeFormat("en", { timeZone: item.time_zone }); } catch { throw new Error("时区无效"); }
  validateJellySchedule(item);
}
export function jellyWithinSeries(series: JellySeries, date: string): boolean { return date >= series.start_date && (series.until === null || date <= series.until); }
export function jellyOccurrenceIdentity(series: JellySeries, date: string): boolean {
  return jellyWithinSeries(series, date) && (!!series.exceptions[date] || series.weekdays.includes(jellyWeekday(date)));
}
export function jellyLogicalOccurrence(series: JellySeries, date: string): boolean {
  return jellyWithinSeries(series, date) && !series.exceptions[date]?.deleted && (!!series.exceptions[date]?.patch || series.weekdays.includes(jellyWeekday(date)));
}
export function validateJellySeries(series: JellySeries, categoryIds: Set<string>): void {
  validateJellyItem(series, categoryIds);
  jellyAssert(Array.isArray(series.weekdays) && series.weekdays.length > 0 && new Set(series.weekdays).size === series.weekdays.length && series.weekdays.every(day => Number.isInteger(day) && day >= 1 && day <= 7), "重复星期应为 1–7 且不能重复或为空");
  if (series.until !== null) { jellyDate(series.until); jellyAssert(series.until >= series.start_date, "重复结束日不能早于开始日"); }
  jellyAssert(series.exceptions && !Array.isArray(series.exceptions) && typeof series.exceptions === "object" && series.completions && !Array.isArray(series.completions) && typeof series.completions === "object", "重复状态无效");
  let natural = false;
  for (let offset = 0; offset < 7; offset++) { const day = jellyAddDays(series.start_date, offset); if (series.until !== null && day > series.until) break; if (series.weekdays.includes(jellyWeekday(day))) natural = true; }
  // Historical series may retain an exceptional occurrence after its weekdays changed.
  jellyAssert(natural || Object.keys(series.exceptions).some(day => jellyWithinSeries(series, day) && !!series.exceptions[day]?.patch), "重复范围内没有实例");
  for (const [date, exception] of Object.entries(series.exceptions)) {
    jellyDate(date); jellyAssert(jellyWithinSeries(series, date), "重复例外超出系列范围");
    jellyAssert(exception && (exception.deleted === true || !!exception.patch), "重复例外无效");
    jellyAssert(!(exception.deleted && exception.patch), "重复例外不能同时删除与修改");
    if (exception.patch) {
      const duration = jellyDaysBetween(series.start_date, series.end_date);
      const item = { ...series, start_date: date, end_date: jellyAddDays(date, duration), ...exception.patch };
      jellyAssert(exception.patch.id === undefined || exception.patch.id === series.id, "重复例外不能改变身份");
      validateJellyItem(item, categoryIds);
    }
  }
  for (const [date, completion] of Object.entries(series.completions)) {
    jellyDate(date); jellyAssert(jellyLogicalOccurrence(series, date), "完成状态指向不存在的重复实例");
    jellyAssert(completion && stamp(completion.completed_at) && typeof completion.completion_description === "string", "重复完成状态无效");
  }
}
function uniqueIds(values: { id: string }[], label: string): void { jellyAssert(new Set(values.map(value => value.id)).size === values.length && values.every(value => value && typeof value.id === "string" && value.id.length > 0), `${label} ID 重复或无效`); }
export function validateJellyWorkspace(state: JellyWorkspace): void {
  jellyAssert(state && state.schema_version === 1 && Number.isSafeInteger(state.revision) && state.revision >= 0, "工作区版本无效");
  for (const key of ["categories", "items", "series", "notes", "inspirations", "relations", "task_links", "applied_plan_ids"] as const) jellyAssert(Array.isArray(state[key]), `工作区 ${key} 无效`);
  uniqueIds(state.categories, "分类"); uniqueIds(state.items, "事项"); uniqueIds(state.series, "系列"); uniqueIds(state.notes, "笔记"); uniqueIds(state.inspirations, "灵感");
  const categoryIds = new Set(state.categories.map(value => value.id));
  jellyAssert(categoryIds.has(JELLY_UNCATEGORIZED_ID), "缺少未分类");
  jellyAssert(new Set(state.categories.map(value => value.name.trim().toLocaleLowerCase())).size === state.categories.length, "分类名称重复");
  for (const category of state.categories) jellyAssert(typeof category.name === "string" && category.name.trim().length > 0 && /^#[\da-fA-F]{6}$/.test(category.color) && Number.isSafeInteger(category.sort_index), "分类名称、颜色或排序无效");
  jellyAssert(!state.series.some(series => state.items.some(item => item.id === series.id)), "事项和系列 ID 冲突");
  state.items.forEach(item => validateJellyItem(item, categoryIds)); state.series.forEach(series => validateJellySeries(series, categoryIds));
  for (const note of state.notes) {
    jellyAssert(categoryIds.has(note.category_id) && typeof note.title === "string" && Array.isArray(note.blocks) && Number.isSafeInteger(note.revision) && note.revision >= 0 && stamp(note.archived_at), "笔记无效");
    uniqueIds(note.blocks, "笔记块");
    for (const block of note.blocks) jellyAssert(["paragraph", "heading1", "heading2", "heading3", "bullet", "numbered", "task", "quote", "code", "divider", "link"].includes(block.kind) && typeof block.text === "string" && Number.isInteger(block.indent) && block.indent >= 0 && block.indent <= 8 && stamp(block.completed_at) && typeof block.completion_description === "string", "笔记块无效");
  }
  for (const inspiration of state.inspirations) jellyAssert(categoryIds.has(inspiration.category_id) && ["text", "url", "file"].includes(inspiration.input_kind) && typeof inspiration.raw_text === "string" && stamp(inspiration.archived_at) && (inspiration.note_id === null || state.notes.some(note => note.id === inspiration.note_id)), "灵感无效");
  const relations = new Set<string>(); const primaries = new Set<string>();
  for (const relation of state.relations) {
    jellyAssert(state.notes.some(note => note.id === relation.note_id), "笔记关联指向不存在的笔记");
    const series = state.series.find(value => value.id === relation.owner_id);
    jellyAssert(series || state.items.some(value => value.id === relation.owner_id), "笔记关联指向不存在的日历事项");
    if (relation.original_date !== null) { jellyDate(relation.original_date); jellyAssert(series && jellyOccurrenceIdentity(series, relation.original_date), "笔记关联指向不存在的重复实例"); }
    jellyAssert(relation.role === "primary" || relation.role === "reference", "笔记关联类型无效");
    const key = `${relation.owner_id}:${relation.original_date ?? ""}`; const tuple = `${key}:${relation.note_id}`;
    jellyAssert(!relations.has(tuple), "笔记关联重复"); relations.add(tuple);
    if (relation.role === "primary") { jellyAssert(!primaries.has(key), "一个日历对象只能有一篇主笔记"); primaries.add(key); }
  }
  jellyAssert(state.relation_overrides === undefined || Array.isArray(state.relation_overrides), "重复关联覆盖无效");
  const overrideKeys = new Set<string>();
  for (const override of state.relation_overrides ?? []) {
    const series = state.series.find(value => value.id === override.owner_id);
    jellyDate(override.original_date); jellyAssert(series && jellyOccurrenceIdentity(series, override.original_date), "关联覆盖指向不存在的重复实例");
    const key = `${override.owner_id}:${override.original_date}`; jellyAssert(!overrideKeys.has(key), "重复关联覆盖重复"); overrideKeys.add(key);
    jellyAssert(override.primary === "inherit" || override.primary === "clear" || state.notes.some(note => note.id === override.primary), "关联覆盖的主笔记不存在");
    jellyAssert(Array.isArray(override.added_reference_ids) && Array.isArray(override.removed_reference_ids), "参考笔记覆盖无效");
    for (const id of [...override.added_reference_ids, ...override.removed_reference_ids]) jellyAssert(state.notes.some(note => note.id === id), "关联覆盖的参考笔记不存在");
    jellyAssert(new Set(override.added_reference_ids).size === override.added_reference_ids.length && new Set(override.removed_reference_ids).size === override.removed_reference_ids.length && !override.added_reference_ids.some(id => override.removed_reference_ids.includes(id)), "参考笔记覆盖重复或冲突");
  }
  const linkedItems = new Set<string>(); const linkedBlocks = new Set<string>();
  for (const link of state.task_links) {
    const item = state.items.find(value => value.id === link.item_id); const note = state.notes.find(value => value.id === link.note_id); const block = note?.blocks.find(value => value.id === link.block_id);
    jellyAssert(item && block?.kind === "task", "任务关联指向不存在的事项或任务块");
    jellyAssert(item.title.trim() === block.text.trim() && item.completed_at === block.completed_at, "日历事项与任务块的标题或完成状态不一致");
    const key = `${link.note_id}:${link.block_id}`; jellyAssert(!linkedItems.has(link.item_id) && !linkedBlocks.has(key), "任务只能关联一次"); linkedItems.add(link.item_id); linkedBlocks.add(key);
  }
}
