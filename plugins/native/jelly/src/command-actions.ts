import { createActionDefinition, nullableSchema, objectSchema } from "@molis-ai/molis-work-plugin-sdk";
import { randomUUID } from "node:crypto";
import { bindActionHandler, withActionEffect, type ActionDefinition, type ActionHandlerBinding, type ActionSchema, type InferActionInput } from "@molis-ai/molis-work-contracts/platform/actions";
import type { JellyItem, JellyNote, JellySeries, JellyWorkspace } from "./contract.js";
import type { JellyStores } from "./store.js";
import * as s from "./action-schema.js";
import { JELLY_ITEM_SUBJECT_KIND, JELLY_NOTE_SUBJECT_KIND } from "./search.js";

export const JELLY_READ = ["jelly:read"];
// Every command returns the workspace, so write permission alone cannot disclose Home data.
export const JELLY_WRITE = ["jelly:read", "jelly:write"];
/** `define<Output>()("name", …)`: the input type comes from the schema. Curried because TypeScript cannot infer `S` while `Output` is written. */
export const defineJellyAction = <O>() => <const S extends ActionSchema>(name: string, version: number, title: string, description: string, operation: "query" | "command", input: S, output: ActionSchema, permissions = operation === "query" ? JELLY_READ : JELLY_WRITE, scheduling?: "concurrent", execution?: ActionDefinition["action"]["execution"]) =>
  createActionDefinition<InferActionInput<S>, O>(`jelly.${name}`, operation, { title, description, ...(execution ? { execution } : {}), scope: "home", ...(scheduling ? { scheduling } : {}), audiences: ["user", "workflow", "agent", "mcp"], permissions, subject_kinds: ["jelly_workspace"], input_schema: input, output_schema: output }, version);
type Fields = Readonly<Record<string, unknown>>;
type Keys<F> = readonly (keyof F & string)[];
/** What the one handler below reads from every command. The rest goes to the store by name; each command's own type is checked where it meets this one, in `createJellyCommandHandlers`. */
type CommandFields = { readonly item?: Fields; readonly series?: Fields; readonly [key: string]: unknown };
export type JellyCommandInput = CommandFields & { readonly expected_revision: number };
/** Every field is required unless the command names which, and the revision always is. `as R` is the default's one claim: with no list, `R` is every key. */
const commandInput = <const F extends Fields, const R extends Keys<F> = Keys<F>>(fields: F, required?: R) =>
  objectSchema({ ...fields, expected_revision: s.revision }, [...(required ?? Object.keys(fields)) as R, "expected_revision"]);
const describe = (title: string) => `${title}；作用于本机 Jelly 工作区，使用最近读取的 revision，保留原撤销历史。`;
const command = <const F extends Fields, const R extends Keys<F> = Keys<F>>(name: string, version: number, title: string, fields: F, required?: R) => defineJellyAction<{ state: JellyWorkspace }>()(name, version, title, describe(title), "command", commandInput(fields, required), s.stateResult);
type JellyEntries = { item: JellyItem; series: JellySeries; note: JellyNote };
type JellyEntryKey = keyof JellyEntries;
export type JellyEntryOutput<K extends JellyEntryKey> = { state: JellyWorkspace } & { [P in K]: JellyEntries[P] };
/** Each entry's kind, where its revision is (as its reader reports it), and how a description calls it. */
const entryKinds = {
  item: { kind: JELLY_ITEM_SUBJECT_KIND, revision: "updated_at", described: "这条事项（item）" },
  series: { kind: JELLY_ITEM_SUBJECT_KIND, revision: "updated_at", described: "这个重复系列（series；修改此后各次时是新拆出的系列）" },
  note: { kind: JELLY_NOTE_SUBJECT_KIND, revision: "revision", described: "这篇笔记（note）" },
} satisfies Record<JellyEntryKey, unknown>;
/**
 * A command on one entry (a calendar entry or a note) also returns that entry and names it as its
 * result, so a caller that keeps relations to results (the Assistant's work) relates the change to the entry and reads it
 * back by its kind's `subject.read`. Commands on several entries or on the workspace stay workspace commands, and so do
 * archiving and deletion: the readers treat an archived entry as gone, so the work would show its own result as missing.
 */
const entry = <K extends JellyEntryKey, const F extends Fields, const R extends Keys<F> = Keys<F>>(key: K, name: string, version: number, title: string, fields: F, required?: R, described: string = entryKinds[key].described) => {
  const definition = defineJellyAction<JellyEntryOutput<K>>()(name, version, title, `${describe(title)}结果附带${described}。`,
    "command", commandInput(fields, required), objectSchema({ state: s.workspace, [key]: s[key] }));
  return { ...definition, action: { ...definition.action, subject_kinds: [entryKinds[key].kind], result_subject: { id: `${key}.id`, revision: `${key}.${entryKinds[key].revision}` } } };
};
const completed = { id: s.id, completed: s.boolean, completion_description: s.text } as const;
const occurrence = { id: s.id, original_date: s.date, scope: { enum: ["onlyThis", "thisAndFuture"] } } as const;
const task = { note_id: s.id, block_id: s.id } as const;
export const jellyCommandActions = {
  "item.create": entry("item", "item.create", /* @version action.jelly.item.create */ 1, "新建日历事项", { item: s.itemInput }),
  "item.update": entry("item", "item.update", /* @version action.jelly.item.update */ 1, "修改日历事项", { id: s.id, patch: s.itemPatch }),
  "item.complete": entry("item", "item.complete", /* @version action.jelly.item.complete */ 1, "完成或重开日历事项", completed, ["id", "completed"]),
  "item.delete": command("item.delete", /* @version action.jelly.item.delete */ 1, "删除日历事项", { id: s.id }),
  "item.move": entry("item", "item.move", /* @version action.jelly.item.move */ 1, "移动日历事项", { id: s.id, date: s.date }),
  "item.move_many": command("item.move_many", /* @version action.jelly.item.move_many */ 1, "批量移动日历事项", { ids: { ...s.ids, minItems: 1 }, date: s.date }),
  "item.reorder": command("item.reorder", /* @version action.jelly.item.reorder */ 1, "排列当日无时间事项", { ids: s.ids, date: s.date }),
  "series.create": entry("series", "series.create", /* @version action.jelly.series.create */ 1, "新建重复事项", { series: s.seriesInput }),
  "series.update": entry("series", "series.update", /* @version action.jelly.series.update */ 1, "修改重复事项实例或后续", { ...occurrence, patch: s.seriesPatch }),
  "series.delete": command("series.delete", /* @version action.jelly.series.delete */ 1, "删除重复事项实例或后续", occurrence),
  "series.complete": entry("series", "series.complete", /* @version action.jelly.series.complete */ 1, "完成或重开重复实例", { ...completed, original_date: s.date }, ["id", "original_date", "completed"]),
  "category.create": command("category.create", /* @version action.jelly.category.create */ 1, "新建 Jelly 分类", { category: objectSchema({ id: s.id, name: s.id, color: s.text }, ["name"]) }),
  "category.update": command("category.update", /* @version action.jelly.category.update */ 1, "修改 Jelly 分类", { id: s.id, patch: objectSchema({ name: s.id, color: s.text }, []) }),
  "category.delete": command("category.delete", /* @version action.jelly.category.delete */ 1, "删除分类并保留内容", { id: s.id }),
  "category.reorder": command("category.reorder", /* @version action.jelly.category.reorder */ 1, "排列 Jelly 分类", { ids: s.ids }),
  "note.create": entry("note", "note.create", /* @version action.jelly.note.create */ 1, "新建笔记", s.noteInputFields, []),
  "note.import": entry("note", "note.import", /* @version action.jelly.note.import */ 1, "导入笔记正文", { id: s.id, format: { enum: ["markdown", "html"] }, mode: { enum: ["append", "replace"] }, source: s.text, expected_note_revision: s.revision }, ["id", "format", "mode", "source"]),
  "note.update": entry("note", "note.update", /* @version action.jelly.note.update */ 1, "修改笔记", { id: s.id, patch: objectSchema({ ...s.noteInputFields, pinned: s.boolean }, []), expected_note_revision: s.revision }, ["id", "patch"]),
  "note.archive": command("note.archive", /* @version action.jelly.note.archive */ 1, "归档笔记", { id: s.id }),
  "note.restore": entry("note", "note.restore", /* @version action.jelly.note.restore */ 1, "恢复笔记", { id: s.id }),
  "note.pin": entry("note", "note.pin", /* @version action.jelly.note.pin */ 1, "置顶或取消置顶笔记", { id: s.id, pinned: s.boolean }, ["id"]),
  "note.delete": command("note.delete", /* @version action.jelly.note.delete */ 1, "确认永久删除已归档笔记", { id: s.id, confirmation_token: s.id }),
  "relation.attach": command("relation.attach", /* @version action.jelly.relation.attach */ 1, "关联日历事项与笔记", s.relationFields, ["owner_id", "note_id"]),
  "relation.detach": command("relation.detach", /* @version action.jelly.relation.detach */ 1, "解除日历事项与笔记关联", s.relationFields, ["owner_id", "note_id"]),
  // Restores the recurring note relation; nothing is lost.
  "relation.reset": withActionEffect(command("relation.reset", /* @version action.jelly.relation.reset */ 1, "恢复重复实例的笔记关联", { owner_id: s.id, original_date: s.date }), "write", false),
  "item.notes_to_note": command("item.notes_to_note", /* @version action.jelly.item.notes_to_note */ 1, "将事项随记迁入笔记", { owner_id: s.id, original_date: nullableSchema(s.date), mode: { enum: ["new", "append"] }, note_id: s.id }, ["owner_id", "mode"]),
  "task.schedule": entry("item", "task.schedule", /* @version action.jelly.task.schedule */ 1, "将笔记任务排入日历", { ...task, schedule: s.schedule, category_id: s.id, priority: s.priority }, ["note_id", "block_id", "schedule"]),
  "task.complete": command("task.complete", /* @version action.jelly.task.complete */ 1, "完成或重开笔记任务", { ...task, completed: s.boolean, completion_description: s.text }, ["note_id", "block_id", "completed"]),
  "task.unlink": command("task.unlink", /* @version action.jelly.task.unlink */ 1, "取消笔记任务的日历同步", task),
  "plan.apply": command("plan.apply", /* @version action.jelly.plan.apply */ 1, "采纳拆解计划", { plan: s.plan, selected_action_ids: s.ids, note_id: s.id }, ["plan"]),
  "undo": command("undo", /* @version action.jelly.undo */ 1, "撤销上次 Jelly 修改", {}),
  "redo": command("redo", /* @version action.jelly.redo */ 1, "重做 Jelly 修改", {}),
  "workspace.import": command("workspace.import", /* @version action.jelly.workspace.import */ 1, "确认导入 Jelly 备份", { source: s.importSource, confirmation_token: s.id }),
};
type EntryTarget = { key: JellyEntryKey; prepare?: (fields: CommandFields) => CommandFields; id: (fields: CommandFields, state: JellyWorkspace) => unknown };
const byId = (key: JellyEntryKey): EntryTarget => ({ key, id: fields => fields.id });
const created = (key: "note"): EntryTarget => ({ key, prepare: fields => ({ ...fields, id: randomUUID() }), id: fields => fields.id });
/** Which entry each entry command touched. Ids Jelly would generate are chosen here first, so the result can name them. */
const entries: Partial<Record<keyof typeof jellyCommandActions, EntryTarget>> = {
  "item.create": { key: "item", prepare: fields => ({ ...fields, item: { id: randomUUID(), ...fields.item } }), id: fields => fields.item?.id },
  "item.update": byId("item"),
  "item.complete": byId("item"),
  "item.move": byId("item"),
  "task.schedule": { key: "item", id: (fields, state) => state.task_links.find(link => link.note_id === fields.note_id && link.block_id === fields.block_id)?.item_id },
  "series.create": { key: "series", prepare: fields => ({ ...fields, series: { id: randomUUID(), ...fields.series } }), id: fields => fields.series?.id },
  // Changing this and later occurrences splits off a new series: that new series is what changed.
  "series.update": { key: "series", prepare: fields => fields.scope === "thisAndFuture" ? { ...fields, new_series_id: randomUUID() } : fields, id: fields => fields.new_series_id ?? fields.id },
  "series.complete": byId("series"),
  "note.create": created("note"),
  "note.import": byId("note"),
  "note.update": byId("note"),
  "note.pin": byId("note"),
  "note.restore": byId("note"),
};
const pools: Record<JellyEntryKey, (state: JellyWorkspace) => readonly { id: string }[]> = { item: state => state.items, series: state => state.series, note: state => state.notes };
export function createJellyCommandHandlers(stores: JellyStores): ActionHandlerBinding[] {
  return Object.entries<ActionDefinition<JellyCommandInput>>(jellyCommandActions).map(([type, definition]) => bindActionHandler(definition, ({ expected_revision, ...input }, caller) => {
    caller.signal?.throwIfAborted();
    const target = entries[type as keyof typeof jellyCommandActions], fields = target?.prepare?.(input) ?? input;
    return stores.write(caller, store => {
      const state = store.execute({ type, ...fields }, expected_revision);
      if (!target) return { state };
      const id = target.id(fields, state);
      return { state, [target.key]: pools[target.key](state).find(value => value.id === id) };
    });
  }));
}
