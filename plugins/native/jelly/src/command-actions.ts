import { createActionDefinition } from "@molis-ai/molis-work-plugin-sdk";
import { randomUUID } from "node:crypto";
import { withActionEffect, type ActionDefinition, type ActionHandlerBinding, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { JellyItem, JellyNote, JellySeries, JellyWorkspace } from "./contract.js";
import type { JellyStores } from "./store.js";
import * as s from "./action-schema.js";
import { JELLY_ITEM_SUBJECT_KIND, JELLY_NOTE_SUBJECT_KIND } from "./search.js";

export const JELLY_READ = ["jelly:read"];
// Every command returns the workspace, so write permission alone cannot disclose Home data.
export const JELLY_WRITE = ["jelly:read", "jelly:write"];
export function defineJellyAction<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema, permissions = operation === "query" ? JELLY_READ : JELLY_WRITE, scheduling?: "concurrent", execution?: ActionDefinition["action"]["execution"], version = /* @version factory.plugins.native.jelly.defineJellyAction */ 1): ActionDefinition<I, O> {
  return createActionDefinition<I, O>(`jelly.${name}`, operation, { title, description, ...(execution ? { execution } : {}), scope: "home", ...(scheduling ? { scheduling } : {}), audiences: ["user", "workflow", "agent", "mcp"], permissions, subject_kinds: ["jelly_workspace"], input_schema: input, output_schema: output }, version);
}
export type JellyCommandInput = { expected_revision: number; [key: string]: unknown };
const commandInput = (fields: Record<string, unknown>, required: string[]) => s.object({ ...fields, expected_revision: s.revision }, [...required, "expected_revision"]);
const describe = (title: string) => `${title}；作用于本机 Jelly 工作区，使用最近读取的 revision，保留原撤销历史。`;
const command = (name: string, title: string, fields: Record<string, unknown>, required = Object.keys(fields), version = /* @version factory.jelly.command */ 1) => defineJellyAction<JellyCommandInput, { state: JellyWorkspace }>(name, title, describe(title), "command", commandInput(fields, required), s.stateResult, undefined, undefined, undefined, version);
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
const entry = <K extends JellyEntryKey>(key: K, name: string, title: string, fields: Record<string, unknown>, required = Object.keys(fields), described: string = entryKinds[key].described, version = /* @version factory.jelly.entry */ 1) => {
  const definition = defineJellyAction<JellyCommandInput, JellyEntryOutput<K>>(name, title, `${describe(title)}结果附带${described}。`,
    "command", commandInput(fields, required), s.object({ state: s.workspace, [key]: s[key] }), undefined, undefined, undefined, version);
  return { ...definition, action: { ...definition.action, subject_kinds: [entryKinds[key].kind], result_subject: { id: `${key}.id`, revision: `${key}.${entryKinds[key].revision}` } } };
};
const completed = { id: s.id, completed: s.boolean, completion_description: s.text };
const occurrence = { id: s.id, original_date: s.date, scope: { enum: ["onlyThis", "thisAndFuture"] } };
const task = { note_id: s.id, block_id: s.id };
export const jellyCommandActions = {
  "item.create": entry("item", "item.create", "新建日历事项", { item: s.itemInput }, undefined, undefined, /* @version action.jelly.item.create */ 1),
  "item.update": entry("item", "item.update", "修改日历事项", { id: s.id, patch: s.itemPatch }, undefined, undefined, /* @version action.jelly.item.update */ 1),
  "item.complete": entry("item", "item.complete", "完成或重开日历事项", completed, ["id", "completed"], undefined, /* @version action.jelly.item.complete */ 1),
  "item.delete": command("item.delete", "删除日历事项", { id: s.id }, undefined, /* @version action.jelly.item.delete */ 1),
  "item.move": entry("item", "item.move", "移动日历事项", { id: s.id, date: s.date }, undefined, undefined, /* @version action.jelly.item.move */ 1),
  "item.move_many": command("item.move_many", "批量移动日历事项", { ids: { ...s.ids, minItems: 1 }, date: s.date }, undefined, /* @version action.jelly.item.move_many */ 1),
  "item.reorder": command("item.reorder", "排列当日无时间事项", { ids: s.ids, date: s.date }, undefined, /* @version action.jelly.item.reorder */ 1),
  "series.create": entry("series", "series.create", "新建重复事项", { series: s.seriesInput }, undefined, undefined, /* @version action.jelly.series.create */ 1),
  "series.update": entry("series", "series.update", "修改重复事项实例或后续", { ...occurrence, patch: s.seriesPatch }, undefined, undefined, /* @version action.jelly.series.update */ 1),
  "series.delete": command("series.delete", "删除重复事项实例或后续", occurrence, undefined, /* @version action.jelly.series.delete */ 1),
  "series.complete": entry("series", "series.complete", "完成或重开重复实例", { ...completed, original_date: s.date }, ["id", "original_date", "completed"], undefined, /* @version action.jelly.series.complete */ 1),
  "category.create": command("category.create", "新建 Jelly 分类", { category: s.object({ id: s.id, name: s.id, color: s.text }, ["name"]) }, undefined, /* @version action.jelly.category.create */ 1),
  "category.update": command("category.update", "修改 Jelly 分类", { id: s.id, patch: s.object({ name: s.id, color: s.text }, []) }, undefined, /* @version action.jelly.category.update */ 1),
  "category.delete": command("category.delete", "删除分类并保留内容", { id: s.id }, undefined, /* @version action.jelly.category.delete */ 1),
  "category.reorder": command("category.reorder", "排列 Jelly 分类", { ids: s.ids }, undefined, /* @version action.jelly.category.reorder */ 1),
  "note.create": entry("note", "note.create", "新建笔记", s.noteInputFields, [], undefined, /* @version action.jelly.note.create */ 1),
  "note.import": entry("note", "note.import", "导入笔记正文", { id: s.id, format: { enum: ["markdown", "html"] }, mode: { enum: ["append", "replace"] }, source: s.text, expected_note_revision: s.revision }, ["id", "format", "mode", "source"], undefined, /* @version action.jelly.note.import */ 1),
  "note.update": entry("note", "note.update", "修改笔记", { id: s.id, patch: s.object({ ...s.noteInputFields, pinned: s.boolean }, []), expected_note_revision: s.revision }, ["id", "patch"], undefined, /* @version action.jelly.note.update */ 1),
  "note.archive": command("note.archive", "归档笔记", { id: s.id }, undefined, /* @version action.jelly.note.archive */ 1),
  "note.restore": entry("note", "note.restore", "恢复笔记", { id: s.id }, undefined, undefined, /* @version action.jelly.note.restore */ 1),
  "note.pin": entry("note", "note.pin", "置顶或取消置顶笔记", { id: s.id, pinned: s.boolean }, ["id"], undefined, /* @version action.jelly.note.pin */ 1),
  "note.delete": command("note.delete", "确认永久删除已归档笔记", { id: s.id, confirmation_token: s.id }, undefined, /* @version action.jelly.note.delete */ 1),
  "relation.attach": command("relation.attach", "关联日历事项与笔记", s.relationFields, ["owner_id", "note_id"], /* @version action.jelly.relation.attach */ 1),
  "relation.detach": command("relation.detach", "解除日历事项与笔记关联", s.relationFields, ["owner_id", "note_id"], /* @version action.jelly.relation.detach */ 1),
  // Restores the recurring note relation; nothing is lost.
  "relation.reset": withActionEffect(command("relation.reset", "恢复重复实例的笔记关联", { owner_id: s.id, original_date: s.date }, undefined, /* @version action.jelly.relation.reset */ 1), "write", false),
  "item.notes_to_note": command("item.notes_to_note", "将事项随记迁入笔记", { owner_id: s.id, original_date: s.nullable(s.date), mode: { enum: ["new", "append"] }, note_id: s.id }, ["owner_id", "mode"], /* @version action.jelly.item.notes_to_note */ 1),
  "task.schedule": entry("item", "task.schedule", "将笔记任务排入日历", { ...task, schedule: s.schedule, category_id: s.id, priority: s.priority }, ["note_id", "block_id", "schedule"], undefined, /* @version action.jelly.task.schedule */ 1),
  "task.complete": command("task.complete", "完成或重开笔记任务", { ...task, completed: s.boolean, completion_description: s.text }, ["note_id", "block_id", "completed"], /* @version action.jelly.task.complete */ 1),
  "task.unlink": command("task.unlink", "取消笔记任务的日历同步", task, undefined, /* @version action.jelly.task.unlink */ 1),
  "plan.apply": command("plan.apply", "采纳拆解计划", { plan: s.plan, selected_action_ids: s.ids, note_id: s.id }, ["plan"], /* @version action.jelly.plan.apply */ 1),
  "undo": command("undo", "撤销上次 Jelly 修改", {}, undefined, /* @version action.jelly.undo */ 1),
  "redo": command("redo", "重做 Jelly 修改", {}, undefined, /* @version action.jelly.redo */ 1),
  "workspace.import": command("workspace.import", "确认导入 Jelly 备份", { source: s.importSource, confirmation_token: s.id }, undefined, /* @version action.jelly.workspace.import */ 1),
};
type Fields = Record<string, unknown>;
type EntryTarget = { key: JellyEntryKey; prepare?: (fields: Fields) => Fields; id: (fields: Fields, state: JellyWorkspace) => unknown };
const byId = (key: JellyEntryKey): EntryTarget => ({ key, id: fields => fields.id });
const created = (key: "note"): EntryTarget => ({ key, prepare: fields => ({ ...fields, id: randomUUID() }), id: fields => fields.id });
/** Which entry each entry command touched. Ids Jelly would generate are chosen here first, so the result can name them. */
const entries: Partial<Record<keyof typeof jellyCommandActions, EntryTarget>> = {
  "item.create": { key: "item", prepare: fields => ({ ...fields, item: { id: randomUUID(), ...fields.item as Fields } }), id: fields => (fields.item as Fields).id },
  "item.update": byId("item"),
  "item.complete": byId("item"),
  "item.move": byId("item"),
  "task.schedule": { key: "item", id: (fields, state) => state.task_links.find(link => link.note_id === fields.note_id && link.block_id === fields.block_id)?.item_id },
  "series.create": { key: "series", prepare: fields => ({ ...fields, series: { id: randomUUID(), ...fields.series as Fields } }), id: fields => (fields.series as Fields).id },
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
  return Object.entries(jellyCommandActions).map(([type, definition]) => ({ capability_id: definition.capability_id, version: definition.version,
    handle: (caller, raw) => {
      caller.signal?.throwIfAborted();
      const { expected_revision, ...input } = raw as JellyCommandInput;
      const target = entries[type as keyof typeof jellyCommandActions], fields = target?.prepare?.(input) ?? input;
      return stores.write(caller, store => {
        const state = store.execute({ type, ...fields }, expected_revision);
        if (!target) return { state };
        const id = target.id(fields, state);
        return { state, [target.key]: pools[target.key](state).find(value => value.id === id) };
      });
    },
  }));
}
