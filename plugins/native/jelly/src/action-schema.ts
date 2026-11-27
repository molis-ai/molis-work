import { objectSchema as object, arraySchema as array, nullableSchema as nullable } from "@molis-ai/molis-work-plugin-sdk";

export const text = { type: "string" } as const;
export const id = { type: "string", minLength: 1, maxLength: 200 } as const;
export const boolean = { type: "boolean" } as const;
/** A row's revision: 1 when created, one more with every write. The uncategorized category is 0 until its colour is first changed. */
export const revision = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER } as const;
export const date = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } as const;
const minute = nullable({ type: "integer", minimum: 0, maximum: 1439 });
const reminder = nullable({ type: "integer", minimum: 0, maximum: 10_080 });
const title = { type: "string", minLength: 1, maxLength: 500, pattern: "\\S" } as const;
const kind = { enum: ["task", "event"] } as const;
const weekdays = { type: "array", items: { type: "integer", minimum: 1, maximum: 7 }, uniqueItems: true, minItems: 1 } as const;
export const scope = { enum: ["onlyThis", "thisAndFuture", "all"], description: "重复日程改哪些：只这一次、这次和以后、整个系列" } as const;

const occurrenceFields = { title: text, kind, category_id: id, notes: text, start_date: date, end_date: date, start_time: minute, end_time: minute, reminder_minutes: reminder } as const;
const entryFields = { id, ...occurrenceFields, time_zone: text, revision, created_at: text, updated_at: text } as const;
export const category = object({ id, name: text, color: text, sort_index: revision, revision });
export const item = object({ ...entryFields, completed_at: nullable(text) });
export const series = object({ ...entryFields, weekdays, until: nullable(date),
  exceptions: { type: "object", additionalProperties: object({ deleted: { const: true }, patch: object(occurrenceFields, []) }, []) },
  completions: { type: "object", additionalProperties: text } });
export const occurrence = object({ ...entryFields, completed_at: nullable(text), series_id: nullable(id), original_date: nullable(date) });
export const note = object({ id, title: text, body: text, day: nullable(date), revision, created_at: text, updated_at: text });
export const noteSummary = object({ id, title: text, day: nullable(date), revision, updated_at: text, excerpt: text });
/** Rows taken back by `jelly.restore`, as the command that removed or moved them returned them. */
export const rows = object({ categories: array(category), items: array(item), series: array(series), notes: array(note) }, []);

/** A new entry. Times are both given or both left out (all day); the time zone defaults to the Home's. */
export const itemInput = object({ id, title, kind, category_id: id, notes: text, start_date: date, end_date: date, start_time: minute, end_time: minute, reminder_minutes: reminder, time_zone: text, completed: boolean }, ["title", "start_date"]);
export const itemPatch = object({ title, kind, category_id: id, notes: text, start_date: date, end_date: date, start_time: minute, end_time: minute, reminder_minutes: reminder, time_zone: text, completed: boolean }, []);
export const seriesInput = object({ id, title, kind, category_id: id, notes: text, start_date: date, end_date: date, start_time: minute, end_time: minute, reminder_minutes: reminder, time_zone: text, weekdays, until: nullable(date) }, ["title", "start_date", "weekdays"]);
export const seriesPatch = object({ title, kind, category_id: id, notes: text, start_date: date, end_date: date, start_time: minute, end_time: minute, reminder_minutes: reminder, weekdays, until: nullable(date), completed: boolean }, []);
