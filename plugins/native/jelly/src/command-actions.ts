import type { ActionDefinition, ActionHandlerBinding, ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { JellyWorkspace } from "@molis-ai/molis-work-contracts/modules/jelly";
import type { JellyStore } from "./store.js";
import * as s from "./action-schema.js";

export const JELLY_READ = ["jelly:read"];
// Every command returns the workspace, so write permission alone cannot disclose Home data.
export const JELLY_WRITE = ["jelly:read", "jelly:write"];
export function defineJellyAction<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema, permissions = operation === "query" ? JELLY_READ : JELLY_WRITE, scheduling?: "concurrent"): ActionDefinition<I, O> {
  return { capability_id: `jelly.${name}`, version: 1, operation, action: { title, description, kind: operation === "query" ? "query" : "operation", scope: "home", ...(scheduling ? { scheduling } : {}), audiences: ["user", "workflow", "agent", "mcp"], permissions, subject_kinds: ["jelly_workspace"], input_schema: input, output_schema: output } };
}
export type JellyCommandInput = { expected_revision: number; [key: string]: unknown };
const command = (name: string, title: string, fields: Record<string, unknown>, required = Object.keys(fields)) => defineJellyAction<JellyCommandInput, { state: JellyWorkspace }>(name, title, `${title}；作用于本机 Jelly 工作区，使用最近读取的 revision，保留原撤销历史。`, "command", s.object({ ...fields, expected_revision: s.revision }, [...required, "expected_revision"]), s.stateResult);
const completed = { id: s.id, completed: s.boolean, completion_description: s.text };
const occurrence = { id: s.id, original_date: s.date, scope: { enum: ["onlyThis", "thisAndFuture"] } };
const task = { note_id: s.id, block_id: s.id };
export const jellyCommandActions = {
  "item.create": command("item.create", "新建日历事项", { item: s.itemInput }),
  "item.update": command("item.update", "修改日历事项", { id: s.id, patch: s.itemPatch }),
  "item.complete": command("item.complete", "完成或重开日历事项", completed, ["id", "completed"]),
  "item.delete": command("item.delete", "删除日历事项", { id: s.id }),
  "item.move": command("item.move", "移动日历事项", { id: s.id, date: s.date }),
  "item.move_many": command("item.move_many", "批量移动日历事项", { ids: { ...s.ids, minItems: 1 }, date: s.date }),
  "item.reorder": command("item.reorder", "排列当日无时间事项", { ids: s.ids, date: s.date }),
  "series.create": command("series.create", "新建重复事项", { series: s.seriesInput }),
  "series.update": command("series.update", "修改重复事项实例或后续", { ...occurrence, patch: s.seriesPatch }),
  "series.delete": command("series.delete", "删除重复事项实例或后续", occurrence),
  "series.complete": command("series.complete", "完成或重开重复实例", { ...completed, original_date: s.date }, ["id", "original_date", "completed"]),
  "category.create": command("category.create", "新建 Jelly 分类", { category: s.object({ id: s.id, name: s.id, color: s.text }, ["name"]) }),
  "category.update": command("category.update", "修改 Jelly 分类", { id: s.id, patch: s.object({ name: s.id, color: s.text }, []) }),
  "category.delete": command("category.delete", "删除分类并保留内容", { id: s.id }),
  "category.reorder": command("category.reorder", "排列 Jelly 分类", { ids: s.ids }),
  "note.create": command("note.create", "新建笔记", s.noteInputFields, []),
  "note.import": command("note.import", "导入笔记正文", { id: s.id, format: { enum: ["markdown", "html"] }, mode: { enum: ["append", "replace"] }, source: s.text, expected_note_revision: s.revision }, ["id", "format", "mode", "source"]),
  "note.update": command("note.update", "修改笔记", { id: s.id, patch: s.object({ ...s.noteInputFields, pinned: s.boolean }, []), expected_note_revision: s.revision }, ["id", "patch"]),
  "note.archive": command("note.archive", "归档笔记", { id: s.id }),
  "note.restore": command("note.restore", "恢复笔记", { id: s.id }),
  "note.pin": command("note.pin", "置顶或取消置顶笔记", { id: s.id, pinned: s.boolean }, ["id"]),
  "note.delete": command("note.delete", "确认永久删除已归档笔记", { id: s.id, confirmation_token: s.id }),
  "inspiration.create": command("inspiration.create", "收集灵感", s.inspirationInputFields, []),
  "inspiration.update": command("inspiration.update", "修改灵感及素材证据", { id: s.id, patch: s.object({ title: s.text, raw_text: s.text, url: s.nullable(s.text), file_name: s.nullable(s.text), category_id: s.id, material: s.nullable(s.inspirationInputFields.material), digest: s.object({ source_hash: { type: "string" }, snapshot: s.material, structured: s.structuredDigest, source_text: s.text, summary: s.text, created_at: s.text, written_note_ids: s.ids }, ["source_hash", "snapshot", "structured"]) }, []) }),
  "inspiration.archive": command("inspiration.archive", "归档灵感", { id: s.id }),
  "inspiration.restore": command("inspiration.restore", "恢复灵感", { id: s.id }),
  "inspiration.delete": command("inspiration.delete", "确认永久删除已归档灵感", { id: s.id, confirmation_token: s.id }),
  "inspiration.convert": command("inspiration.convert", "将灵感转为笔记", { id: s.id }),
  "inspiration.digest_write": command("inspiration.digest_write", "将素材摘要写入笔记", { id: s.id, note_id: s.id }, ["id"]),
  "relation.attach": command("relation.attach", "关联日历事项与笔记", s.relationFields, ["owner_id", "note_id"]),
  "relation.detach": command("relation.detach", "解除日历事项与笔记关联", s.relationFields, ["owner_id", "note_id"]),
  "relation.reset": command("relation.reset", "恢复重复实例的笔记关联", { owner_id: s.id, original_date: s.date }),
  "item.notes_to_note": command("item.notes_to_note", "将事项随记迁入笔记", { owner_id: s.id, original_date: s.nullable(s.date), mode: { enum: ["new", "append"] }, note_id: s.id }, ["owner_id", "mode"]),
  "task.schedule": command("task.schedule", "将笔记任务排入日历", { ...task, schedule: s.schedule, category_id: s.id, priority: s.priority }, ["note_id", "block_id", "schedule"]),
  "task.complete": command("task.complete", "完成或重开笔记任务", { ...task, completed: s.boolean, completion_description: s.text }, ["note_id", "block_id", "completed"]),
  "task.unlink": command("task.unlink", "取消笔记任务的日历同步", task),
  "plan.apply": command("plan.apply", "采纳拆解计划", { plan: s.plan, selected_action_ids: s.ids, note_id: s.id }, ["plan"]),
  "undo": command("undo", "撤销上次 Jelly 修改", {}),
  "redo": command("redo", "重做 Jelly 修改", {}),
  "workspace.import": command("workspace.import", "确认导入 Jelly 备份", { source: s.importSource, confirmation_token: s.id }),
};
export function createJellyCommandHandlers(withStore: <T>(run: (store: JellyStore) => T) => T): ActionHandlerBinding[] {
  return Object.entries(jellyCommandActions).map(([type, definition]) => ({ capability_id: definition.capability_id, version: definition.version,
    handle: (caller, raw) => { caller.signal?.throwIfAborted(); const { expected_revision, ...fields } = raw as JellyCommandInput; return withStore(store => ({ state: store.execute({ type, ...fields }, expected_revision) })); },
  }));
}
