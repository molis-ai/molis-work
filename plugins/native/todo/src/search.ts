import { bindActionHandler, bindSearchEntriesHandler, defineSearchEntriesAction, defineSubjectContextAction, searchText, subjectContext, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding, type SearchEntry } from "@molis-ai/molis-work-contracts/platform/actions";
import { COMPOSER_PICK_INPUT_SCHEMA, COMPOSER_PICK_INPUT_TYPE, COMPOSER_PICK_OUTPUT_SCHEMA, COMPOSER_PICK_OUTPUT_TYPE, type ComposerPickInput, type ComposerPickItem, type ComposerPickOutput } from "@molis-ai/molis-work-contracts/platform/composer";
import { TODO_PROJECT_PLUGIN_ID, TODO_SUBJECT_KIND, type TodoEditableField, type TodoItem } from "./contract.js";
import type { TodoAccess, TodoStore } from "./store.js";
import { todoErrors } from "./error.js";

const subjectReader = defineSubjectContextAction("todo.item.subject.read", /* @version action.todo.item.subject.read */ 1, TODO_SUBJECT_KIND, "待办", ["todo:read"]);
// The unified input's ＋ (unified-input-voice K5): a todo picked there goes with the words as a reference, read again by
// `todo.item.subject.read` when the target takes it. Only reads, and only what the caller's search would find.
const composerPick: ActionDefinition<ComposerPickInput, ComposerPickOutput> = {
  capability_id: "todo.composer.pick", version: /* @version action.todo.composer.pick */ 1, operation: "query",
  action: { title: "选待办", description: "按标题找还没做完的待办，交给输入框作为资料", kind: "query", scope: "project", audiences: ["user"], permissions: ["todo:read"],
    subject_kinds: [TODO_SUBJECT_KIND], input_type: COMPOSER_PICK_INPUT_TYPE, output_type: COMPOSER_PICK_OUTPUT_TYPE,
    input_schema: COMPOSER_PICK_INPUT_SCHEMA, output_schema: COMPOSER_PICK_OUTPUT_SCHEMA, composer_source: { title: "待办", title_text: { key: "todo.directory.name" }, layers: ["ai", "plain"] } },
};

/** Todo's part in the system search and in object reading (the Assistant's "this todo"). */
export const todoSearchActions = {
  // Indexed with the partition the library is in (the personal space or a project), so no other partition's index holds them.
  entries: defineSearchEntriesAction("todo.search.entries", /* @version action.todo.search.entries */ 1, [{ kind: TODO_SUBJECT_KIND, title: "待办", surface: TODO_PROJECT_PLUGIN_ID, glyph: "check" }], "待办", ["todo:read"]),
  subject: { ...subjectReader, action: { ...subjectReader.action, execution: { cost: "none" as const } } },
  pick: composerPick,
};

const STATUS: Record<TodoItem["status"], string> = { open: "待处理", doing: "进行中", waiting: "等待他人", done: "已完成", cancelled: "已取消" };
// The fields the person changed, named as the todo page names them; readers never see the stored field names.
const FIELD: Record<TodoEditableField, string> = { title: "要做什么", notes: "说明", due_date: "截止日期", due_time: "截止时间", planned_date: "计划处理日期",
  remind_at: "提醒时间", important: "重要", waiting: "在等谁" };

/** The facts a reader (search, the Assistant) needs, in plain words; the owner's revision says when it changed. */
export function todoText(item: TodoItem): string {
  const lines = [
    `状态：${STATUS[item.status]}${item.archived_at ? "（已归档）" : ""}`,
    item.due_date ? `截止：${item.due_date}${item.due_time ? " " + item.due_time : ""}` : "",
    item.planned_date ? `计划处理：${item.planned_date}` : "",
    item.remind_at ? `提醒：${item.remind_at}` : "",
    item.important ? "重要：是（本人标记）" : "",
    item.status === "waiting" && item.waiting ? `在等：${[item.waiting.who, item.waiting.what].filter(Boolean).join("，")}${item.waiting.follow_up_on ? `；${item.waiting.follow_up_on} 跟进` : ""}` : "",
    item.notes ? `说明：\n${item.notes}` : "",
    ...item.sources.map(source => `来源：${source.title}${source.reason ? `（${source.reason}）` : ""}${source.excerpt ? `\n  依据：${source.excerpt}` : ""}`),
    ...item.links.map(link => `关联：${link.title}${link.relation ? `（${link.relation}）` : link.outcome === "draft" ? "（草稿）" : link.outcome === "done" ? "（已完成的动作）" : ""}`),
    item.edited_fields.length ? `你手动改过：${item.edited_fields.map(field => FIELD[field] ?? field).join("、")}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

const open = (id: string) => ({ surface: TODO_PROJECT_PLUGIN_ID, id });
const entry = (item: TodoItem): SearchEntry => ({
  subject: { kind: TODO_SUBJECT_KIND, id: item.id }, revision: String(item.revision), title: item.title,
  summary: searchText(item.notes, 1000), updated_at: item.updated_at, content: "context", open: open(item.id),
});
const attached = (item: TodoItem) => item.links.filter(link => link.kind === "goal").map(link => ({ kind: "goal", id: link.subject.id }));

/** Still to do: what a person means to hand over as "this todo". Done, cancelled and archived ones are left to Todo's own page. */
const pickable = (item: TodoItem) => !item.archived_at && item.status !== "done" && item.status !== "cancelled";

/**
 * The todos ＋ offers for what was typed: titles holding it (any case), the ones due first, then the latest changed. The hint is
 * the due date as written (a date reads the same in every language); the reference pins the revision picked, read again on send.
 */
export function todoPicks(items: readonly TodoItem[], { query, limit }: ComposerPickInput): ComposerPickOutput {
  const words = query.trim().toLocaleLowerCase();
  const due = (item: TodoItem) => item.due_date ? item.due_date + (item.due_time ? " " + item.due_time : "") : "";
  const found = items.filter(item => pickable(item) && (!words || item.title.toLocaleLowerCase().includes(words)))
    .sort((a, b) => (due(a) || "\uffff").localeCompare(due(b) || "\uffff") || b.updated_at.localeCompare(a.updated_at));
  return { items: found.slice(0, limit).map((item): ComposerPickItem => ({
    ref: { subject: { kind: TODO_SUBJECT_KIND, id: item.id }, pin: { mode: "current", read_revision: String(item.revision) } },
    title: item.title, ...(due(item) ? { hint: due(item) } : {}) })) };
}

export function createTodoSearchHandlers(read: <T>(run: (store: TodoStore) => T) => T): ActionHandlerBinding[] {
  const access = (caller: ActionCallContext): TodoAccess => ({ actor: "other", actorId: caller.actor_id });
  return [
    bindSearchEntriesHandler(todoSearchActions.entries, caller => read(store => store.list(access(caller)).map(entry))),
    bindActionHandler(composerPick, (input, caller) => read(store => todoPicks(store.list(access(caller)), input))),
    { ...todoSearchActions.subject, handle: (caller, input) => read(store => {
      const item = store.get((input as { subject_id: string }).subject_id, access(caller));
      // Readers treat an archived object as gone from use (the shared convention); Todo itself still lists it under 已归档.
      if (item.archived_at) throw todoErrors.not_found("这件待办已归档");
      return subjectContext({ subject: { kind: TODO_SUBJECT_KIND, id: item.id }, revision: String(item.revision), title: item.title,
        content: todoText(item), attached_to: attached(item), open: open(item.id) });
    }) },
  ];
}
