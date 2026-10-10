import { ActionError, defineSubjectContextAction, subjectContext, type ActionAvailability, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { InstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { TODO_PROJECT_PLUGIN_ID, type TodoBatch } from "@molis-ai/molis-work-contracts/modules/todo";
import { localDate } from "./dates.js";
import { TodoError } from "./error.js";
import { organizeParts, organizePrompt, parseOrganizeOutput, type TodoCandidateDraft, type TodoOrganizeMaterial } from "./organize-model.js";
import { TodoOrganizer, validEdits, type TodoApplyResult, type TodoCandidateDecision } from "./organize.js";
import { TODO_ORGANIZE_BASIC, TODO_ORGANIZE_ORGANIZER } from "./prompts.js";
import type { TodoAccess, TodoStore } from "./store.js";

export const TODO_BATCH_SUBJECT_KIND = "todo_batch";

const text = { type: "string" };
const id = { ...text, minLength: 1, maxLength: 200 };
const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const array = (items: unknown, extra: Record<string, unknown> = {}) => ({ type: "array", items, ...extra });
const date = { ...text, pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const time = { ...text, pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" };
const choices = (entries: readonly (readonly [string, string])[], title?: string) => ({ oneOf: entries.map(([value, name]) => ({ const: value, title: name })), ...(title ? { title } : {}) });
const placement = choices([["personal", "个人空间"], ["project", "当前项目"], ["unassigned", "暂未归类"]], "放在哪里");
const subject = object({ kind: { ...id, maxLength: 80 }, id });
const open = object({ surface: { ...text, pattern: "^[a-z0-9_-]{1,40}$" }, id });
const changeValues = object(Object.fromEntries(["title", "due_date", "due_time", "planned_date", "notes"].map(key => [key, nullable(text)])), []);
const candidate = object({
  candidate_id: id, kind: { enum: ["request", "commitment", "waiting", "suggestion"] }, title: text, why: text,
  owner: object({ value: text, stated: { type: "boolean" } }), due_date: nullable(date), due_time: nullable(time), due_phrase: nullable(text),
  suggested_date: nullable(date), topic: nullable(text), placement, waiting: nullable(object({ who: text, what: text })),
  evidence: array(object({ material: { type: "integer", minimum: 1 }, excerpt: text })), uncertain: array(text), depends_on: array(id),
  existing: nullable(object({ item_id: id, title: text, relation: { enum: ["same", "update", "conflict", "maybe_done", "reopen"] }, changes: changeValues,
    protected: array(object({ field: { enum: ["title", "due_date", "due_time", "planned_date", "notes"] }, value: nullable(text) })), reason: text })),
  selected: { type: "boolean" },
  decision: nullable(object({ action: { enum: ["added", "merged", "updated", "ignored"] }, item_id: nullable(id), reason: text, at: text })),
});
const material = object({ index: { type: "integer", minimum: 1 }, title: text, subject: nullable(subject), open: nullable(open), received_at: nullable(text),
  read: { enum: ["read", "truncated", "failed"] }, note: text });
const batch = object({ batch_id: id, title: text, origin: { enum: ["assistant", "onboarding", "manual"] }, project_id: nullable(id), method: text,
  materials: array(material), candidates: array(candidate), reference_only: array(object({ summary: text, material: { type: "integer", minimum: 1 } })),
  notes: array(text), status: { enum: ["open", "done"] }, created_at: text, updated_at: text, revision: { type: "integer", minimum: 1 } });
const materialInput = object({ title: { ...text, minLength: 1, maxLength: 200, title: "材料名称（邮件主题、文件名）" }, text: { ...text, minLength: 1, maxLength: 200_000, title: "材料正文" },
  subject: nullable(subject), open: nullable(open), received_at: nullable({ ...text, maxLength: 40, title: "材料的发出或收到时间" }),
  read: { enum: ["read", "truncated", "failed"], title: "读成了多少：全文、只读了一部分、没读成" }, note: { ...text, maxLength: 200, title: "没读全时说明缺了什么" } }, ["title", "text"]);
const decision = object({ candidate_id: id, action: choices([["add", "加入待办"], ["merge", "合并到已有待办"], ["update", "更新已有待办"], ["complete", "把已有待办标为完成"], ["reopen", "重新打开已有待办"], ["ignore", "忽略"]], "怎么处理"),
  edits: object({ title: { ...text, minLength: 1, maxLength: 200 }, due_date: nullable(date), due_time: nullable(time), planned_date: nullable(date), placement, notes: { ...text, maxLength: 10_000 } }, []),
  accept_protected: array({ enum: ["title", "due_date", "due_time", "planned_date", "notes"] }), ignore_reason: { ...text, maxLength: 100 } }, ["candidate_id", "action"]);

function define<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema,
  permissions: readonly string[], extra: Partial<ActionDefinition["action"]> = {}): ActionDefinition<I, O> {
  return { capability_id: `todo.${name}`, version: 1, operation, action: { title, description, kind: operation === "query" ? "query" : "operation", scope: "home",
    audiences: ["user", "agent", "workflow", "mcp"], permissions: [...permissions], subject_kinds: [TODO_BATCH_SUBJECT_KIND], input_schema: input, output_schema: output, ...extra } };
}
const READ = ["todo:read"], WRITE = ["todo:read", "todo:write"];

export const todoOrganizeActions = {
  extract: define<{ materials: TodoOrganizeMaterial[]; title?: string; request?: string; request_id?: string; origin?: "onboarding"; me?: string[]; method?: "basic" | "organizer" }, { batch: TodoBatch; replayed: boolean }>(
    "organize.extract", "整理材料里的待办", "读给定材料，找出要你处理的事、你的承诺、在等别人的事和可考虑的建议，与已有待办比对，存成一份待你确认的整理结果；不直接新建或修改待办。材料正文由调用方先读好传入", "command",
    object({ materials: { ...array(materialInput), minItems: 1, maxItems: 50 }, title: { ...text, maxLength: 120 }, request: { ...text, maxLength: 500, title: "用户这次的要求" }, request_id: id,
      origin: { enum: ["onboarding"], title: "由开始使用时的整理发起" },
      me: { ...array({ ...text, minLength: 1, maxLength: 40 }), maxItems: 8, title: "用户本人在材料里的称呼（名字、昵称）" },
      method: choices([["basic", "基本整理"], ["organizer", "待办整理师的方法"]], "整理方法") }, ["materials"]),
    object({ batch, replayed: { type: "boolean" } }), [...WRITE, "model:invoke"],
    // Organizing only saves a result to confirm; taking it back puts that result away (nothing was added to Todo).
    { execution: { cost: "metered" }, scheduling: "concurrent", result_subject: { id: "batch.batch_id", revision: "batch.revision" }, result_view: { summary: "整理结果已保存，等你确认", title_pointer: "/batch/title" },
      undo: { capability_id: "todo.organize.close", version: 1, input: { id: "batch.batch_id" } } }),
  list: define<{ status?: "open" | "all" }, { batches: TodoBatch[] }>("organize.list", "列出整理结果", "列出等你确认的整理结果（或全部最近的）", "query",
    object({ status: choices([["open", "等你确认的"], ["all", "全部最近的"]], "列哪些") }, []), object({ batches: array(batch) }), READ),
  get: define<{ id: string }, { batch: TodoBatch }>("organize.get", "读取整理结果", "读取一份整理结果：候选、依据、与已有待办的关系、未列入的参考信息", "query",
    object({ id }), object({ batch }), READ),
  apply: define<{ id: string; expected_revision?: number; decisions: TodoCandidateDecision[] }, TodoApplyResult>("organize.apply", "采用整理结果", "按用户的选择处理候选：加入待办、合并到已有、更新已有、标为完成、重新打开或忽略；全部成功或全部不改，可凭 change_batch_id 整批撤销", "command",
    object({ id, expected_revision: { type: "integer", minimum: 1 }, decisions: { ...array(decision), minItems: 1, maxItems: 80 } }, ["id", "decisions"]),
    object({ batch, change_batch_id: id, results: array(object({ candidate_id: id, action: text, item_id: nullable(id) })) }), WRITE,
    { result_subject: { id: "batch.batch_id", revision: "batch.revision" }, undo: { capability_id: "todo.changes.revert", version: 1, input: { batch_id: "change_batch_id" } } }),
  close: define<{ id: string }, { batch: TodoBatch }>("organize.close", "收起整理结果", "把这份整理结果收起来；没处理的候选原样留下，之后仍可打开查看", "command",
    object({ id }), object({ batch }), WRITE, { result_subject: { id: "batch.batch_id", revision: "batch.revision" } }),
  subject: defineSubjectContextAction("todo.batch.subject.read", TODO_BATCH_SUBJECT_KIND, "整理结果", ["todo:read"], "home"),
};

export interface TodoOrganizePorts {
  withStore<T>(run: (store: TodoStore) => T): T;
  modelAvailability(): ActionAvailability;
  completeText?(prompt: InstructedPrompt, options: { signal?: AbortSignal }): Promise<string>;
  today?(): string;
  access(caller: ActionCallContext, everything?: boolean): TodoAccess;
}

const KIND: Record<string, string> = { request: "要你处理", commitment: "你的承诺", waiting: "在等别人", suggestion: "建议" };

/** Plain text of a batch for readers (the Assistant's work view, search): candidates with their evidence and state. */
export function batchText(batch: TodoBatch): string {
  const lines = [`状态：${batch.status === "open" ? "等你确认" : "已处理完"}`, ...batch.notes.map(note => `说明：${note}`)];
  for (const candidate of batch.candidates) {
    const state = candidate.decision ? `（${{ added: "已加入", merged: "已合并", updated: "已更新", ignored: "已忽略" }[candidate.decision.action]}）` : "";
    lines.push(`- [${KIND[candidate.kind]}] ${candidate.title}${state}${candidate.due_date ? `，截止 ${candidate.due_date}` : ""}${candidate.existing ? `，与已有「${candidate.existing.title}」：${candidate.existing.relation}` : ""}`);
    for (const entry of candidate.evidence) lines.push(`  依据（${batch.materials[entry.material - 1]?.title ?? "材料"}）：${entry.excerpt}`);
  }
  return lines.join("\n");
}

export function createTodoOrganizeHandlers(ports: TodoOrganizePorts): ActionHandlerBinding[] {
  const bind = <I, O>(definition: ActionDefinition<I, O>, handle: (input: I, caller: ActionExecutionContext) => O | Promise<O>, availability?: ActionHandlerBinding["availability"]): ActionHandlerBinding => ({
    capability_id: definition.capability_id, version: definition.version, handle: (caller, input) => handle(input as I, caller), ...(availability ? { availability } : {}) });
  const organizer = <T>(run: (value: TodoOrganizer, store: TodoStore) => T) => ports.withStore(store => run(new TodoOrganizer(store), store));
  return [
    bind(todoOrganizeActions.extract, async (input, caller) => {
      const access = ports.access(caller);
      const replay = input.request_id ? organizer(value => value.byRequest(input.request_id!, access)) : null;
      if (replay) return { batch: replay, replayed: true };
      if (!ports.completeText) throw new ActionError("actions.connection_required", "请先配置可用的文字模型");
      const existing = ports.withStore(store => store.list(access).filter(item => item.archived_at === null));
      const byId = new Map(existing.map(item => [item.id, item]));
      const today = ports.today?.() ?? localDate();
      const drafts: TodoCandidateDraft[] = [];
      const reference: TodoBatch["reference_only"][number][] = [];
      let unverified = 0;
      const method = input.method === "organizer" ? TODO_ORGANIZE_ORGANIZER : TODO_ORGANIZE_BASIC;
      const parts = organizeParts(input.materials);
      for (const [part, indexes] of parts.entries()) {
        caller.signal?.throwIfAborted();
        caller.on_progress?.({ stage: "organizing", progress: part / Math.max(parts.length, 1) });
        let parsed;
        // A reply that is not the requested JSON is asked for once more before giving up.
        for (let attempt = 0; !parsed; attempt += 1) {
          const raw = await ports.completeText(organizePrompt(method, { materials: input.materials, indexes, existing, today, request: input.request, me: input.me }), { signal: caller.signal });
          try { parsed = parseOrganizeOutput(raw, input.materials, byId, today); }
          catch { if (attempt >= 1) throw new TodoError("todo.model_invalid", "模型没有给出可用的整理结果，请再试一次"); }
        }
        drafts.push(...parsed.candidates.map(draft => ({ ...draft, ref: `p${part}-${draft.ref}`, depends_on: draft.depends_on.map(ref => `p${part}-${ref}`) })));
        reference.push(...parsed.reference_only);
        unverified += parsed.unverified;
      }
      await caller.beforeEffect();
      return organizer(value => value.create({ title: input.title ?? "", origin: input.origin === "onboarding" ? "onboarding" : caller.audience === "agent" ? "assistant" : "manual", method: method.prompt_id,
        materials: input.materials, candidates: drafts, reference_only: reference, unverified, request_id: input.request_id }, access));
    }, () => ports.modelAvailability()),
    bind(todoOrganizeActions.list, (input, caller) => organizer(value => ({ batches: value.list(ports.access(caller, caller.audience === "user"), input.status ?? "open") }))),
    bind(todoOrganizeActions.get, (input, caller) => organizer(value => ({ batch: value.get(input.id, ports.access(caller, caller.audience === "user")) }))),
    bind(todoOrganizeActions.apply, (input, caller) => organizer(value => {
      if (!input.decisions.every(entry => validEdits(entry.edits))) throw new TodoError("todo.invalid", "日期或时间写法不对");
      return value.apply(input.id, input.decisions, input.expected_revision, ports.access(caller, caller.audience === "user"));
    })),
    bind(todoOrganizeActions.close, (input, caller) => organizer(value => ({ batch: value.close(input.id, ports.access(caller, caller.audience === "user")) }))),
    { ...todoOrganizeActions.subject, handle: (caller, input) => organizer(value => {
      let found: TodoBatch;
      try { found = value.get((input as { subject_id: string }).subject_id, ports.access(caller)); }
      catch { throw new ActionError("todo.not_found", "这份整理结果不在当前范围内"); }
      return subjectContext({ subject: { kind: TODO_BATCH_SUBJECT_KIND, id: found.batch_id }, revision: String(found.revision), title: found.title, content: batchText(found),
        goal_ids: [], session_id: null, open: { surface: TODO_PROJECT_PLUGIN_ID, id: "batch:" + found.batch_id } });
    }) },
  ];
}
