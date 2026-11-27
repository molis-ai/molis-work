import { randomUUID } from "node:crypto";
import { bindActionHandler, type ActionDefinition, type ActionHandlerBinding, type ActionMetadata, type ActionSchema, type InferActionInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { arraySchema as array, createActionDefinition, nullableSchema as nullable, objectSchema as object } from "@molis-ai/molis-work-plugin-sdk";
import type { JellyCategory, JellyItem, JellyNote, JellyOccurrence, JellySeries } from "./contract.js";
import { changeJellySeries, JELLY_UNCATEGORIZED_ID, jellyAddDays, jellyDaysBetween, jellyOccurrences } from "./calendar.js";
import { isJellyFailure, jellyAssert, jellyErrors } from "./error.js";
import { type JellyRowKind, type JellyRows, type JellyStore, type JellyStores } from "./store.js";
import * as s from "./action-schema.js";
import { createJellySearchHandlers, JELLY_ITEM_SUBJECT_KIND, JELLY_NOTE_SUBJECT_KIND, jellySearchActions } from "./search.js";
import { createJellyContentHandlers, jellyContentActions } from "./content-actions.js";

export const JELLY_READ = ["jelly:read"];
/** A command returns what it changed, so write permission alone would disclose rows: every command needs read too. */
export const JELLY_WRITE = ["jelly:read", "jelly:write"];
const JELLY_CATEGORY_SUBJECT_KIND = "jelly_category";
type Extra = Partial<Pick<ActionMetadata, "result_subject" | "undo" | "effect">>;
/** `define<Output>()("name", …)`: the input type comes from the schema. Curried because TypeScript cannot infer `S` while `Output` is written. */
const define = <O>() => <const S extends ActionSchema>(name: string, version: number, title: string, description: string, operation: "query" | "command", subject: string, input: S, output: ActionSchema, extra: Extra = {}) =>
  createActionDefinition<InferActionInput<S>, O>(`jelly.${name}`, operation, { title, description, scope: "project", audiences: ["user", "workflow", "agent", "mcp"],
    permissions: operation === "query" ? JELLY_READ : JELLY_WRITE, subject_kinds: [subject], input_schema: input, output_schema: output, ...extra }, version);
const restoreUndo = { capability_id: "jelly.restore", version: /* @version action.jelly.restore */ 1, input: { rows: "restore" } } as const;
const changed = (key: "item" | "series" | "note") => ({ result_subject: { id: `${key}.id`, revision: `${key}.revision` } });
const expected = { expected_revision: s.revision } as const;
export type JellyRestoreRows = { categories?: JellyCategory[]; items?: JellyItem[]; series?: JellySeries[]; notes?: JellyNote[] };

export const jellyActions = {
  calendar: define<{ categories: JellyCategory[]; items: JellyOccurrence[] }>()("calendar.list", /* @version action.jelly.calendar.list */ 1, "读取日历",
    "按日期范围（含两端，最长 400 天）展开单次日程和每一次重复日程，各带自己的 revision；附全部分类。重复日程的一次的 id 是「系列 id@原日期」", "query", JELLY_ITEM_SUBJECT_KIND,
    object({ start: s.date, end: s.date }), object({ categories: array(s.category), items: array(s.occurrence) })),
  item: define<{ item?: JellyItem; series?: JellySeries }>()("item.get", /* @version action.jelly.item.get */ 1, "读取一条日程",
    "按 id 读取单次日程（item）或重复系列及其规则（series）；传重复日程某一次的 id 时读它所属的系列", "query", JELLY_ITEM_SUBJECT_KIND,
    object({ id: s.id }), object({ item: s.item, series: s.series }, [])),
  notes: define<{ notes: Array<Pick<JellyNote, "id" | "title" | "day" | "revision" | "updated_at"> & { excerpt: string }> }>()("note.list", /* @version action.jelly.note.list */ 1, "列出随手记",
    "列出随手记（最近改过的在前，最多 500 篇），可只看某一天的（day）、没挂日期的（day 为 null）或含某段文字的（query）；只给开头一段，正文用 jelly.note.get 读", "query", JELLY_NOTE_SUBJECT_KIND,
    object({ day: nullable(s.date), query: s.text }, []), object({ notes: array(s.noteSummary) })),
  note: define<{ note: JellyNote }>()("note.get", /* @version action.jelly.note.get */ 1, "读取一篇随手记", "按 id 读取一篇随手记的全文（纯文本或 Markdown）与 revision", "query", JELLY_NOTE_SUBJECT_KIND,
    object({ id: s.id }), object({ note: s.note })),

  createItem: define<{ item: JellyItem }>()("item.create", /* @version action.jelly.item.create */ 1, "新建日程", "新建一条单次日程或待办；不填时间是全天，时区默认本机", "command", JELLY_ITEM_SUBJECT_KIND,
    object({ item: s.itemInput }), object({ item: s.item }),
    { ...changed("item"), undo: { capability_id: "jelly.item.delete", version: /* @version action.jelly.item.delete */ 1, input: { id: "item.id", expected_revision: "item.revision" } } }),
  updateItem: define<{ item: JellyItem }>()("item.update", /* @version action.jelly.item.update */ 1, "修改日程", "按读到的 revision 修改一条单次日程，可标完成（completed）；只改开始日期时整段跟着移", "command", JELLY_ITEM_SUBJECT_KIND,
    object({ id: s.id, ...expected, patch: s.itemPatch }), object({ item: s.item }), changed("item")),
  deleteItem: define<{ restore: JellyRestoreRows }>()("item.delete", /* @version action.jelly.item.delete */ 1, "删除日程", "按读到的 revision 删除一条单次日程；可用 jelly.restore 撤销", "command", JELLY_ITEM_SUBJECT_KIND,
    object({ id: s.id, ...expected }), object({ restore: s.rows }), { effect: "write", undo: restoreUndo }),
  createSeries: define<{ series: JellySeries }>()("series.create", /* @version action.jelly.series.create */ 1, "新建每周重复日程", "新建一条按星期重复的日程（weekdays 1 是周一），可设结束日", "command", JELLY_ITEM_SUBJECT_KIND,
    object({ series: s.seriesInput }), object({ series: s.series }), changed("series")),
  updateSeries: define<{ series: JellySeries; ended: JellySeries | null }>()("series.update", /* @version action.jelly.series.update */ 1, "修改重复日程",
    "按读到的 revision 修改重复日程的某一次（original_date）：只这一次、这次和以后（拆出新系列，结果是新系列，ended 是到前一天为止的原系列）或整个系列；只标完成时只能是这一次", "command", JELLY_ITEM_SUBJECT_KIND,
    object({ id: s.id, ...expected, original_date: s.date, scope: s.scope, patch: s.seriesPatch }), object({ series: s.series, ended: nullable(s.series) }), changed("series")),
  deleteSeries: define<{ series: JellySeries | null; restore: JellyRestoreRows }>()("series.delete", /* @version action.jelly.series.delete */ 1, "删除重复日程",
    "按读到的 revision 删除重复日程的某一次、这次和以后或整个系列；series 是删后剩下的系列（全删了是 null）；可用 jelly.restore 撤销", "command", JELLY_ITEM_SUBJECT_KIND,
    object({ id: s.id, ...expected, original_date: s.date, scope: s.scope }), object({ series: nullable(s.series), restore: s.rows }), { effect: "write", undo: restoreUndo }),
  saveCategory: define<{ category: JellyCategory }>()("category.save", /* @version action.jelly.category.save */ 1, "新建或修改分类",
    "不带 id 或 id 不存在时新建（要名字，expected_revision 填 0）；改已有分类要带读到的 revision，可改名字、颜色（#RRGGBB）和排序。「未分类」只能改颜色", "command", JELLY_CATEGORY_SUBJECT_KIND,
    object({ id: s.id, name: { type: "string", minLength: 1, maxLength: 100, pattern: "\\S" }, color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" }, sort_index: s.revision, ...expected }, []), object({ category: s.category })),
  deleteCategory: define<{ restore: JellyRestoreRows }>()("category.delete", /* @version action.jelly.category.delete */ 1, "删除分类",
    "按读到的 revision 删除分类，它下面的日程归到「未分类」；可用 jelly.restore 撤销", "command", JELLY_CATEGORY_SUBJECT_KIND,
    object({ id: s.id, ...expected }), object({ restore: s.rows }), { effect: "write", undo: restoreUndo }),
  saveNote: define<{ note: JellyNote }>()("note.save", /* @version action.jelly.note.save */ 1, "写随手记",
    "不带 id 或 id 不存在时新写一篇（expected_revision 填 0）；改已有的要带读到的 revision。正文是纯文本或 Markdown，可挂到某一天（day）", "command", JELLY_NOTE_SUBJECT_KIND,
    object({ id: s.id, title: { type: "string", maxLength: 500 }, body: { type: "string", maxLength: 200_000 }, day: nullable(s.date), ...expected }, []), object({ note: s.note }), changed("note")),
  deleteNote: define<{ restore: JellyRestoreRows }>()("note.delete", /* @version action.jelly.note.delete */ 1, "删除随手记", "按读到的 revision 删除一篇随手记；可用 jelly.restore 撤销", "command", JELLY_NOTE_SUBJECT_KIND,
    object({ id: s.id, ...expected }), object({ restore: s.rows }), { effect: "write", undo: restoreUndo }),
  restore: define<{ rows: Required<JellyRestoreRows>; skipped: string[] }>()("restore", /* @version action.jelly.restore */ 1, "撤销删除",
    "把删除命令返回的 restore 原样传入，放回删除或移动前的行；只放回已经不在、或仍是删除命令留下样子的行。之后又被改过的行不放回，id 列在 skipped 里；「未分类」不经这里改", "command", JELLY_ITEM_SUBJECT_KIND,
    object({ rows: s.rows }), object({ rows: s.rows, skipped: array(s.id) }), { effect: "write" }),
};
export const JELLY_ACTIONS: readonly ActionDefinition[] = [...Object.values(jellyActions), ...Object.values(jellySearchActions), ...Object.values(jellyContentActions)];
export const JELLY_ACTION_PERMISSIONS = [...new Set(JELLY_ACTIONS.flatMap(definition => definition.action.permissions))];

const homeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const excerpt = (body: string) => [...body.replace(/\s+/gu, " ").trim()].slice(0, 200).join("");
/** The row as stored, if it is still at the revision the caller read. */
function current<K extends JellyRowKind>(store: JellyStore, kind: K, id: string, revision: number, label: string): JellyRows[K] {
  const row = store.require(kind, id, label);
  if (row.revision !== revision) store.conflict(kind, id);
  return row;
}
/** Moving only the start of an entry moves its end with it. */
function schedule(before: { start_date: string; end_date: string }, patch: { start_date?: string; end_date?: string }) {
  if (patch.start_date === undefined || patch.end_date !== undefined) return {};
  return { end_date: jellyAddDays(before.end_date, jellyDaysBetween(before.start_date, patch.start_date)) };
}

export function createJellyActionHandlers(stores: JellyStores): ActionHandlerBinding[] {
  const write = <T>(caller: Parameters<JellyStores["write"]>[0], run: (store: JellyStore, now: string) => T) => {
    caller.signal?.throwIfAborted();
    return stores.write(caller, store => run(store, new Date().toISOString()));
  };
  return [
    bindActionHandler(jellyActions.calendar, input => stores.read(store => ({ categories: store.categories(), items: jellyOccurrences(store.items(input.start, input.end), store.series(), input.start, input.end) }))),
    bindActionHandler(jellyActions.item, input => stores.read(store => {
      const id = input.id.split("@")[0]!;
      const item = store.get("item", id); if (item) return { item };
      const series = store.get("series", id); if (series) return { series };
      throw jellyErrors.not_found("日程不存在");
    })),
    bindActionHandler(jellyActions.notes, input => stores.read(store => ({ notes: store.notes({ ...(input.day !== undefined ? { day: input.day } : {}), ...(input.query ? { query: input.query } : {}) })
      .map(note => ({ id: note.id, title: note.title, day: note.day, revision: note.revision, updated_at: note.updated_at, excerpt: excerpt(note.body) })) }))),
    bindActionHandler(jellyActions.note, input => stores.read(store => ({ note: store.require("note", input.id, "随手记") }))),

    bindActionHandler(jellyActions.createItem, ({ item: input }, caller) => write(caller, (store, now) => ({ item: store.insert("item", {
      id: input.id ?? randomUUID(), title: input.title.trim(), kind: input.kind ?? "task", category_id: input.category_id ?? JELLY_UNCATEGORIZED_ID, notes: input.notes ?? "",
      start_date: input.start_date, end_date: input.end_date ?? input.start_date, start_time: input.start_time ?? null, end_time: input.end_time ?? null, time_zone: input.time_zone ?? homeZone(),
      completed_at: input.completed ? now : null, revision: 1, created_at: now, updated_at: now,
    }) }))),
    bindActionHandler(jellyActions.updateItem, (input, caller) => write(caller, (store, now) => {
      const before = current(store, "item", input.id, input.expected_revision, "日程");
      const { completed, ...patch } = input.patch;
      const item: JellyItem = { ...before, ...patch, ...schedule(before, patch), title: (patch.title ?? before.title).trim(),
        completed_at: completed === undefined ? before.completed_at : completed ? before.completed_at ?? now : null, revision: before.revision + 1, updated_at: now };
      return { item: store.replace("item", item, before.revision) };
    })),
    bindActionHandler(jellyActions.deleteItem, (input, caller) => write(caller, store => {
      const before = current(store, "item", input.id, input.expected_revision, "日程");
      store.delete("item", before.id, before.revision);
      return { restore: { items: [before] } };
    })),
    bindActionHandler(jellyActions.createSeries, ({ series: input }, caller) => write(caller, (store, now) => ({ series: store.insert("series", {
      id: input.id ?? randomUUID(), title: input.title.trim(), kind: input.kind ?? "task", category_id: input.category_id ?? JELLY_UNCATEGORIZED_ID, notes: input.notes ?? "",
      start_date: input.start_date, end_date: input.end_date ?? input.start_date, start_time: input.start_time ?? null, end_time: input.end_time ?? null, time_zone: input.time_zone ?? homeZone(),
      weekdays: [...input.weekdays], until: input.until ?? null, exceptions: {}, completions: {}, revision: 1, created_at: now, updated_at: now,
    }) }))),
    bindActionHandler(jellyActions.updateSeries, (input, caller) => write(caller, (store, now) => {
      const before = current(store, "series", input.id, input.expected_revision, "重复日程");
      const change = changeJellySeries(before, input.original_date, input.scope, input.patch, now, randomUUID());
      if (change.series) store.replace("series", change.series, before.revision); else store.delete("series", before.id, before.revision);
      if (change.created) store.insert("series", change.created);
      const series = change.created ?? change.series;
      jellyAssert(series, "这次修改没有留下重复日程");
      return { series, ended: change.created ? change.series : null };
    })),
    bindActionHandler(jellyActions.deleteSeries, (input, caller) => write(caller, (store, now) => {
      const before = current(store, "series", input.id, input.expected_revision, "重复日程");
      const change = changeJellySeries(before, input.original_date, input.scope, null, now, randomUUID());
      if (change.series) store.replace("series", change.series, before.revision); else store.delete("series", before.id, before.revision);
      return { series: change.series, restore: { series: [before] } };
    })),
    bindActionHandler(jellyActions.saveCategory, (input, caller) => write(caller, store => {
      const categories = store.categories(), before = input.id ? categories.find(category => category.id === input.id) : undefined;
      const name = input.name?.trim();
      jellyAssert(!name || !categories.some(category => category.id !== input.id && category.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()), "已经有同名的分类");
      if (!before) {
        jellyAssert(name, "新分类要有名字"); jellyAssert(!input.expected_revision, "分类不存在", jellyErrors.not_found);
        return { category: store.insert("category", { id: input.id ?? randomUUID(), name, color: input.color ?? "#6A8D73", sort_index: input.sort_index ?? categories.length, revision: 1 }) };
      }
      jellyAssert(input.expected_revision !== undefined, "修改分类要带读到的 revision");
      if (before.revision !== input.expected_revision) store.conflict("category", before.id);
      jellyAssert(before.id !== JELLY_UNCATEGORIZED_ID || name === undefined, "「未分类」不能改名");
      return { category: store.replace("category", { ...before, name: name ?? before.name, color: input.color ?? before.color, sort_index: input.sort_index ?? before.sort_index, revision: before.revision + 1 }, before.revision) };
    })),
    bindActionHandler(jellyActions.deleteCategory, (input, caller) => write(caller, (store, now) => {
      jellyAssert(input.id !== JELLY_UNCATEGORIZED_ID, "「未分类」不能删除");
      const before = current(store, "category", input.id, input.expected_revision, "分类");
      const items = store.itemsInCategory(before.id), series = store.seriesInCategory(before.id);
      for (const item of items) store.replace("item", { ...item, category_id: JELLY_UNCATEGORIZED_ID, revision: item.revision + 1, updated_at: now }, item.revision);
      for (const value of series) store.replace("series", { ...value, category_id: value.category_id === before.id ? JELLY_UNCATEGORIZED_ID : value.category_id, revision: value.revision + 1, updated_at: now,
        exceptions: Object.fromEntries(Object.entries(value.exceptions).map(([day, exception]) => [day, exception.patch?.category_id === before.id ? { patch: { ...exception.patch, category_id: JELLY_UNCATEGORIZED_ID } } : exception])) }, value.revision);
      store.delete("category", before.id, before.revision);
      return { restore: { categories: [before], items, series } };
    })),
    bindActionHandler(jellyActions.saveNote, (input, caller) => write(caller, (store, now) => {
      const before = input.id ? store.get("note", input.id) : null;
      if (!before) {
        jellyAssert(!input.expected_revision, "这篇随手记已经不在了，可能在别处删除了", jellyErrors.not_found);
        return { note: store.insert("note", { id: input.id ?? randomUUID(), title: input.title ?? "", body: input.body ?? "", day: input.day ?? null, revision: 1, created_at: now, updated_at: now }) };
      }
      jellyAssert(input.expected_revision !== undefined, "修改随手记要带读到的 revision");
      if (before.revision !== input.expected_revision) store.conflict("note", before.id);
      return { note: store.replace("note", { ...before, title: input.title ?? before.title, body: input.body ?? before.body, day: input.day !== undefined ? input.day : before.day, revision: before.revision + 1, updated_at: now }, before.revision) };
    })),
    bindActionHandler(jellyActions.deleteNote, (input, caller) => write(caller, store => {
      const before = current(store, "note", input.id, input.expected_revision, "随手记");
      store.delete("note", before.id, before.revision);
      return { restore: { notes: [before] } };
    })),
    bindActionHandler(jellyActions.restore, ({ rows }, caller) => write(caller, store => {
      // Each row goes back only if it is gone or still exactly as the removing command left it (one revision on); any other row stays as it
      // is now and is named in `skipped`, and the rest still go back. 「未分类」 is never removed, so it is never put back here.
      const skipped: string[] = [];
      const put = <K extends JellyRowKind>(kind: K, row: JellyRows[K]): JellyRows[K][] => {
        if (kind === "category" && row.id === JELLY_UNCATEGORIZED_ID) {
          skipped.push(row.id);
          return [];
        }
        const now = store.get(kind, row.id);
        // A category named like another one made since stays out, as saving it would.
        const named = kind === "category" && "name" in row && store.categories().some(category => category.id !== row.id && category.name.trim().toLocaleLowerCase() === String(row.name).trim().toLocaleLowerCase());
        if (named) {
          skipped.push(row.id);
          return [];
        }
        try {
          if (!now) return [store.insert(kind, { ...row, revision: row.revision + 1 })];
          if (now.revision !== row.revision + 1) store.conflict(kind, row.id);
          return [store.replace(kind, { ...row, revision: now.revision + 1 }, now.revision)];
        } catch (error) {
          // Checks run before any statement, so a refused row wrote nothing: a row changed since, or one whose category did not come back.
          if (!isJellyFailure(error) || error.code === "jelly.corrupt") throw error;
          skipped.push(row.id);
          return [];
        }
      };
      const categories = (rows.categories ?? []).flatMap(row => put("category", row));
      return { rows: { categories, items: (rows.items ?? []).flatMap(row => put("item", row)), series: (rows.series ?? []).flatMap(row => put("series", row)),
        notes: (rows.notes ?? []).flatMap(row => put("note", row)) }, skipped };
    })),
    ...createJellySearchHandlers(stores.read),
    ...createJellyContentHandlers(stores),
  ];
}
