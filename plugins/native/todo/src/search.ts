import { bindActionHandler, bindSearchEntriesHandler, defineSearchEntriesAction, defineSubjectContextAction, searchText, subjectContext, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding, type SearchEntry } from "@molis-ai/molis-work-contracts/platform/actions";
import { COMPOSER_PICK_INPUT_SCHEMA, COMPOSER_PICK_INPUT_TYPE, COMPOSER_PICK_OUTPUT_SCHEMA, COMPOSER_PICK_OUTPUT_TYPE, type ComposerPickInput, type ComposerPickItem, type ComposerPickOutput } from "@molis-ai/molis-work-contracts/platform/composer";
import { TODO_PROJECT_PLUGIN_ID, TODO_SUBJECT_KIND, type TodoEditableField, type TodoItem } from "./contract.js";
import type { TodoAccess, TodoStore } from "./store.js";
import { withProjectReach } from "./reach.js";
import { todoCallerProject } from "./caller.js";
import { todoErrors } from "./error.js";

// The unified input's ＋ (unified-input-voice K5): a todo picked there goes with the words as a reference, read again by
// `todo.item.subject.read` when the target takes it. Only reads, and only what the caller's search would find.
const composerPick: ActionDefinition<ComposerPickInput, ComposerPickOutput> = {
  capability_id: "todo.composer.pick", version: /* @version action.todo.composer.pick */ 1, operation: "query",
  action: { title: "选待办", description: "按标题找还没做完的待办，交给输入框作为资料", kind: "query", scope: "home", audiences: ["user"], permissions: ["todo:read"],
    subject_kinds: [TODO_SUBJECT_KIND], input_type: COMPOSER_PICK_INPUT_TYPE, output_type: COMPOSER_PICK_OUTPUT_TYPE,
    input_schema: COMPOSER_PICK_INPUT_SCHEMA, output_schema: COMPOSER_PICK_OUTPUT_SCHEMA, composer_source: { title: "待办", layers: ["ai", "plain"] } },
};

/** Todo's part in the system search and in object reading (the Assistant's "this todo"). */
export const todoSearchActions = {
  // Two sources over one store: the person's own (personal and unplaced) is indexed once for the Home; a project's todos
  // are indexed with that project, so a project search finds them and no other project or the personal index holds them.
  entries: defineSearchEntriesAction("todo.search.entries", /* @version action.todo.search.entries */ 1, [{ kind: TODO_SUBJECT_KIND, title: "待办", surface: TODO_PROJECT_PLUGIN_ID }], "个人待办", ["todo:read"], "home"),
  projectEntries: defineSearchEntriesAction("todo.search.project_entries", /* @version action.todo.search.project_entries */ 1, [{ kind: TODO_SUBJECT_KIND, title: "待办", surface: TODO_PROJECT_PLUGIN_ID }], "项目待办", ["todo:read"], "project"),
  subject: withProjectReach(defineSubjectContextAction("todo.item.subject.read", /* @version action.todo.item.subject.read */ 1, TODO_SUBJECT_KIND, "待办", ["todo:read"], "home")),
  pick: composerPick,
};

const STATUS: Record<TodoItem["status"], string> = { open: "待处理", doing: "进行中", waiting: "等待他人", done: "已完成", cancelled: "已取消" };
const PLACEMENT: Record<TodoItem["placement"], string> = { personal: "个人", project: "项目", unassigned: "暂未归类" };
// The fields the person changed, named as the todo page names them; readers never see the stored field names.
const FIELD: Record<TodoEditableField, string> = { title: "要做什么", notes: "说明", due_date: "截止日期", due_time: "截止时间", planned_date: "计划处理日期",
  remind_at: "提醒时间", placement: "放在哪里", important: "重要", waiting: "在等谁" };

/** The facts a reader (search, the Assistant) needs, in plain words; the owner's revision says when it changed. */
export function todoText(item: TodoItem): string {
  const lines = [
    `状态：${STATUS[item.status]}${item.archived_at ? "（已归档）" : ""}`,
    `归属：${PLACEMENT[item.placement]}`,
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
const goals = (item: TodoItem) => item.links.filter(link => link.kind === "goal").map(link => link.subject.id);

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
  // Search and readers see what the caller sees: personal, unplaced, and the caller's own project.
  const access = (caller: ActionCallContext): TodoAccess => ({ projectId: todoCallerProject(caller), projectIds: [], actor: "other", actorId: caller.actor_id });
  return [
    bindSearchEntriesHandler(todoSearchActions.entries, caller => read(store => store.list(access(caller))
      .filter(item => item.placement !== "project").map(entry))),
    bindSearchEntriesHandler(todoSearchActions.projectEntries, caller => {
      const project = todoCallerProject(caller);
      return project ? read(store => store.list(access(caller)).filter(item => item.placement === "project" && item.project_id === project).map(entry)) : [];
    }),
    // The same todos a search here finds: personal, unplaced and this project's; never another project's.
    bindActionHandler(composerPick, (input, caller) => read(store => todoPicks(store.list(access(caller))
      .filter(item => item.placement !== "project" || item.project_id === todoCallerProject(caller)), input))),
    { ...todoSearchActions.subject, handle: (caller, input) => read(store => {
      // The person reading from their own Home or personal space (the placement panel after a move) reaches every todo
      // of theirs and learns its project: the Host gave the list of projects they may reach (PG-014). Anyone in a project, and
      // any caller the Host gave no list, keeps the usual scope, so another project's todo still reads as not there.
      const reach = todoCallerProject(caller) ? [] : caller.readable_project_ids ?? [];
      let item: TodoItem;
      try { item = store.get((input as { subject_id: string }).subject_id, { ...access(caller), projectIds: reach }); }
      catch { throw todoErrors.not_found("这件待办已删除，或不在当前范围内"); }
      // Readers treat an archived object as gone from use (the shared convention); Todo itself still lists it under 已归档.
      if (item.archived_at) throw todoErrors.not_found("这件待办已归档");
      // Todos live in the person's Home; one that belongs to a project says which (personal and unplaced leave it empty).
      return subjectContext({ subject: { kind: TODO_SUBJECT_KIND, id: item.id }, revision: String(item.revision), title: item.title,
        content: todoText(item), goal_ids: goals(item), open: open(item.id), project_id: item.placement === "project" ? item.project_id : null });
    }) },
  ];
}
