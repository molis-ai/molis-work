import { ActionError, withActionEffect, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import { TODO_SUBJECT_KIND, type TodoChange, type TodoItem, type TodoPlacement, type TodoStatus, type TodoView } from "@molis-ai/molis-work-contracts/modules/todo";
import { isTodoDate, localDate } from "./dates.js";
import type { TodoAccess, TodoBatchChange, TodoCreateInput, TodoFields, TodoLinkInput, TodoStore } from "./store.js";
import { selectView, todoFlags, viewCounts, type TodoFlag } from "./views.js";
import { createTodoSearchHandlers, todoSearchActions } from "./search.js";

export const TODO_READ = ["todo:read"] as const;
export const TODO_WRITE = ["todo:read", "todo:write"] as const;

const text = { type: "string" };
const id = { ...text, minLength: 1, maxLength: 200 };
const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const array = (items: unknown, extra: Record<string, unknown> = {}) => ({ type: "array", items, ...extra });
const date = { ...text, pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const time = { ...text, pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" };
const instant = { ...text, minLength: 10, maxLength: 40 };
const revision = { type: "integer", minimum: 1 };
const status = { enum: ["open", "doing", "waiting", "done", "cancelled"] };
const placement = { enum: ["personal", "project", "unassigned"] };
const view = { enum: ["today", "waiting", "unscheduled", "upcoming", "all", "closed"] };
const subject = object({ kind: { ...id, maxLength: 80 }, id });
const open = object({ surface: { ...text, pattern: "^[a-z0-9_-]{1,40}$" }, id });
const waiting = object({ who: { ...text, maxLength: 80 }, what: { ...text, maxLength: 200 }, follow_up_on: nullable(date) });
const sourceKind = { enum: ["manual", "material", "assistant", "onboarding", "inbox"] };
const source = object({ source_id: id, kind: sourceKind, title: text, excerpt: text, reason: text, subject: nullable(subject), open: nullable(open), added_at: text });
const linkKind = { enum: ["goal", "material", "todo", "outcome", "work"] };
const relation = { enum: ["blocked_by", "blocks", "split_from", "merged", "related"] };
const link = object({ link_id: id, kind: linkKind, subject, title: text, relation: nullable(relation), outcome: nullable({ enum: ["draft", "done"] }), open: nullable(open), added_at: text });
const editable = { enum: ["title", "notes", "due_date", "due_time", "planned_date", "remind_at", "placement", "important", "waiting"] };
const itemFields = {
  id, title: text, notes: text, status, placement, project_id: nullable(id), due_date: nullable(date), due_time: nullable(time), planned_date: nullable(date),
  remind_at: nullable(instant), important: { type: "boolean" }, waiting: nullable(waiting), sources: array(source), links: array(link),
  edited_fields: array(editable), archived_at: nullable(text), completed_at: nullable(text), created_at: text, updated_at: text, revision,
};
const item = object(itemFields);
const flag = { enum: ["overdue", "due_today", "planned_past", "planned_today", "stale"] };
const listed = object({ ...itemFields, flags: array(flag) });
const change = object({ change_id: id, item_id: id, batch_id: nullable(id), kind: { enum: ["create", "update", "status", "archive", "unarchive", "link", "revert"] },
  actor: { enum: ["user", "assistant", "other"] }, at: text, before: nullable({ type: "object" }), after: { type: "object" }, revision_after: revision, reverted_by: nullable(id) });
const changed = object({ item, change_id: nullable(id) });
const expected = { expected_revision: revision };

/** Editable fields as an agent, a workflow or the page may send them; `important` stays the person's own. */
const fieldInput = {
  title: { ...text, minLength: 1, maxLength: 200, title: "要做什么" },
  notes: { ...text, maxLength: 10_000, title: "说明" },
  due_date: { ...nullable(date), title: "截止日期（YYYY-MM-DD）" },
  due_time: { ...nullable(time), title: "截止时间（HH:MM）" },
  planned_date: { ...nullable(date), title: "计划处理日期（YYYY-MM-DD）" },
  remind_at: { ...nullable(instant), title: "提醒时间（带时区）" },
  placement: { ...placement, title: "归属：个人、当前项目或暂未归类" },
  important: { type: "boolean", title: "重要（只能由本人设置）" },
  waiting: { ...nullable(waiting), title: "在等谁、等什么、何时跟进" },
};
const sourceInput = object({ kind: sourceKind, title: { ...text, maxLength: 200 }, excerpt: { ...text, maxLength: 2000 }, reason: { ...text, maxLength: 500 },
  subject: nullable(subject), open: nullable(open) }, ["kind", "title"]);
const linkInput = object({ kind: linkKind, subject, title: { ...text, maxLength: 200 }, relation: nullable(relation), outcome: nullable({ enum: ["draft", "done"] }), open: nullable(open) }, ["kind", "subject", "title"]);
const batchChange = {
  oneOf: [
    object({ status }), object({ planned_date: nullable(date) }), object({ due_date: nullable(date) }),
    object({ shift_days: { type: "integer", minimum: -366, maximum: 366 } }), object({ placement }), object({ archive: { type: "boolean" } }),
  ],
};

export interface TodoListItem extends TodoItem { readonly flags: TodoFlag[] }
export interface TodoListResult {
  readonly today: string;
  readonly project_id: string | null;
  readonly everything: boolean;
  readonly items: TodoListItem[];
  readonly counts: Record<TodoView, number>;
}
type ListInput = { view?: TodoView; query?: string; placement?: TodoPlacement; archived?: boolean; all_projects?: boolean; today?: string };
type Identity = { id: string; expected_revision?: number };

function define<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema,
  extra: Partial<ActionDefinition["action"]> = {}): ActionDefinition<I, O> {
  return { capability_id: `todo.${name}`, version: 1, operation, action: { title, description, kind: operation === "query" ? "query" : "operation", scope: "home",
    audiences: ["user", "agent", "workflow", "mcp"], permissions: [...(operation === "query" ? TODO_READ : TODO_WRITE)], subject_kinds: [TODO_SUBJECT_KIND],
    input_schema: input, output_schema: output, ...extra } };
}
const resultSubject = { id: "item.id", revision: "item.revision" };

export const todoActions = {
  list: define<ListInput, TodoListResult>("items.list", "列出待办", "按视图读取待办：today 今天要做、waiting 在等别人、unscheduled 没安排、upcoming 7 天内截止、all 全部进行中、closed 已完成或已取消。在项目里调用时范围是个人、暂未归类和这个项目的待办", "query",
    object({ view, query: { ...text, maxLength: 200 }, placement, archived: { type: "boolean" }, all_projects: { type: "boolean" }, today: date }, []),
    object({ today: date, project_id: nullable(id), everything: { type: "boolean" }, items: array(listed), counts: object(Object.fromEntries(["today", "waiting", "unscheduled", "upcoming", "all", "closed"].map(key => [key, { type: "integer", minimum: 0 }]))) })),
  get: define<{ id: string }, { item: TodoItem; flags: TodoFlag[]; history: TodoChange[]; backlinks: { item_id: string; title: string; relation: string | null }[] }>("items.get", "读取待办", "读取一件待办的全部内容、提示标记、修改记录，以及关联到它的其他待办", "query",
    object({ id }), object({ item, flags: array(flag), history: array(change), backlinks: array(object({ item_id: id, title: text, relation: nullable(relation) })) })),
  create: define<TodoCreateInput & { status?: TodoStatus }, { item: TodoItem; change_id: string; replayed: boolean }>("items.create", "新建待办", "记下一件要推进的事。日期只写原文或用户明确给出的，不猜；request_id 用于同一次请求的恢复，重试不会重复创建", "command",
    object({ ...fieldInput, status: { ...status, title: "状态" }, sources: { ...array(sourceInput), maxItems: 20, title: "来源与形成原因" }, request_id: { ...id, title: "请求号" } }, ["title"]),
    object({ item, change_id: id, replayed: { type: "boolean" } }), { result_subject: resultSubject, result_view: { summary: "已加入待办", title_pointer: "/item/title" } }),
  update: define<TodoFields & Identity, { item: TodoItem; change_id: string | null }>("items.update", "修改待办", "只改给出的字段；带上读取时的 expected_revision，别处改过时拒绝而不覆盖", "command",
    object({ id, ...expected, ...fieldInput }, ["id"]), changed, { result_subject: resultSubject, result_view: { summary: "已修改待办", title_pointer: "/item/title" } }),
  status: define<Identity & { status: TodoStatus }, { item: TodoItem; change_id: string | null }>("items.status", "改待办状态", "改为待处理、进行中、等待他人、已完成或已取消。只在用户确认这件事做完时才标为已完成", "command",
    object({ id, ...expected, status }, ["id", "status"]), changed, { result_subject: resultSubject, result_view: { summary: "已改状态", title_pointer: "/item/title" } }),
  archive: define<Identity & { archived: boolean }, { item: TodoItem; change_id: string | null }>("items.archive", "归档或取回待办", "把已完成或已取消的待办收起，或取回；不改变状态", "command",
    object({ id, ...expected, archived: { type: "boolean" } }, ["id", "archived"]), changed, { result_subject: resultSubject }),
  remove: withActionEffect(define<Identity, { deleted: true; id: string }>("items.delete", "删除待办", "永久删除一件待办及其修改记录，不能撤销", "command",
    object({ id, ...expected }, ["id"]), object({ deleted: { const: true }, id })), "irreversible"),
  batch: define<{ ids: string[]; change: TodoBatchChange; expected_revisions?: Record<string, number> }, { items: TodoItem[]; batch_id: string }>("items.batch", "批量处理待办", "对选中的几件待办做同一处理（改状态、改计划或截止日期、推后几天、改归属、归档），全部成功或全部不改；可凭 batch_id 一起撤销", "command",
    object({ ids: { ...array(id), minItems: 1, maxItems: 200, uniqueItems: true }, change: batchChange, expected_revisions: { type: "object", additionalProperties: revision } }, ["ids", "change"]),
    object({ items: array(item), batch_id: id })),
  revert: define<{ change_id?: string; batch_id?: string }, { items: TodoItem[]; removed_ids: string[] }>("changes.revert", "撤销待办修改", "撤销一次修改或一整批修改；之后又被改过就拒绝。撤销新建会去掉那件待办", "command",
    { ...object({ change_id: id, batch_id: id }, []), oneOf: [{ required: ["change_id"] }, { required: ["batch_id"] }] }, object({ items: array(item), removed_ids: array(id) })),
  link: define<Identity & { add?: TodoLinkInput; remove_link_id?: string }, { item: TodoItem; change_id: string }>("items.link", "关联到待办", "给待办加上或去掉一项关联：Goal、材料、另一件待办（依赖、拆分、合并、相关）、成果（草稿或已完成的动作）、助理工作", "command",
    { ...object({ id, ...expected, add: linkInput, remove_link_id: id }, ["id"]), oneOf: [{ required: ["add"] }, { required: ["remove_link_id"] }] }, object({ item, change_id: id }),
    { result_subject: resultSubject }),
  searchEntries: todoSearchActions.entries,
  subject: todoSearchActions.subject,
};
export const TODO_ACTIONS: readonly ActionDefinition[] = Object.values(todoActions);
export const TODO_ACTION_PERMISSIONS = [...new Set(TODO_ACTIONS.flatMap(definition => definition.action.permissions))];

export interface TodoActionPorts {
  withStore<T>(run: (store: TodoStore) => T): T;
  /** Today in the person's time zone; tests pin it. */
  today?(): string;
}

/** Who is asking, as far as a todo is concerned. Only the person's own page may read across projects. */
export function todoAccess(caller: ActionCallContext, everything = false): TodoAccess {
  if (everything && caller.audience !== "user") throw new ActionError("actions.forbidden", "只有你自己在 Todo 页面里能看到所有项目的待办");
  return { projectId: caller.project_id, everything, actor: caller.audience === "user" ? "user" : caller.audience === "agent" ? "assistant" : "other", actorId: caller.actor_id };
}

export function createTodoActionHandlers(ports: TodoActionPorts): ActionHandlerBinding[] {
  const today = (value?: string) => value && isTodoDate(value) ? value : ports.today?.() ?? localDate();
  const bind = <I, O>(definition: ActionDefinition<I, O>, handle: (input: I, caller: ActionCallContext) => O): ActionHandlerBinding => ({
    capability_id: definition.capability_id, version: definition.version, execution: "sync", handle: (caller, input) => handle(input as I, caller),
  });
  return [
    bind(todoActions.list, (input, caller) => ports.withStore(store => {
      const access = todoAccess(caller, input.all_projects === true);
      const day = today(input.today);
      const query = input.query?.trim().toLocaleLowerCase() ?? "";
      let items = store.list(access);
      if (input.placement) items = items.filter(entry => entry.placement === input.placement);
      if (query) items = items.filter(entry => [entry.title, entry.notes, entry.waiting?.who ?? "", entry.waiting?.what ?? "", ...entry.sources.map(source => source.title)]
        .some(value => value.toLocaleLowerCase().includes(query)));
      const counts = viewCounts(items, day);
      const selected = input.archived ? items.filter(entry => entry.archived_at !== null).sort((a, b) => (b.archived_at ?? "").localeCompare(a.archived_at ?? ""))
        : selectView(items, input.view ?? "today", day);
      return { today: day, project_id: caller.project_id, everything: access.everything, counts,
        items: selected.map(entry => ({ ...entry, flags: todoFlags(entry, day) })) };
    })),
    bind(todoActions.get, (input, caller) => ports.withStore(store => {
      const access = todoAccess(caller, caller.audience === "user");
      const entry = store.get(input.id, access);
      return { item: entry, flags: todoFlags(entry, today()), history: store.history(input.id, access),
        backlinks: store.backlinks(input.id, access).map(({ item: other, link: back }) => ({ item_id: other.id, title: other.title, relation: back.relation })) };
    })),
    bind(todoActions.create, (input, caller) => ports.withStore(store => store.create(input, todoAccess(caller)))),
    bind(todoActions.update, (input, caller) => ports.withStore(store => {
      const { id: target, expected_revision, ...patch } = input;
      return store.update(target, patch, expected_revision, todoAccess(caller, caller.audience === "user"));
    })),
    bind(todoActions.status, (input, caller) => ports.withStore(store => store.setStatus(input.id, input.status, input.expected_revision, todoAccess(caller, caller.audience === "user")))),
    bind(todoActions.archive, (input, caller) => ports.withStore(store => store.setArchived(input.id, input.archived, input.expected_revision, todoAccess(caller, caller.audience === "user")))),
    bind(todoActions.remove, (input, caller) => ports.withStore(store => {
      store.delete(input.id, input.expected_revision, todoAccess(caller, caller.audience === "user"));
      return { deleted: true as const, id: input.id };
    })),
    bind(todoActions.batch, (input, caller) => ports.withStore(store => store.batch(input.ids, input.change, input.expected_revisions, todoAccess(caller, caller.audience === "user")))),
    bind(todoActions.revert, (input, caller) => ports.withStore(store => store.revert(input, todoAccess(caller, caller.audience === "user")))),
    bind(todoActions.link, (input, caller) => ports.withStore(store => store.link(input.id, { add: input.add, remove_link_id: input.remove_link_id }, input.expected_revision, todoAccess(caller, caller.audience === "user")))),
    ...createTodoSearchHandlers(ports.withStore),
  ];
}
