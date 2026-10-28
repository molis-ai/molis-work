import { ActionError, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { GOAL_PLUGIN_OBJECT_SOURCE, goalPluginObjectRef, parseGoalPluginObjectRef, type GoalInputBindingRecord, type GoalInputBindingsApi } from "@molis-ai/molis-work-contracts/modules/goals";
import { CONTEXT_LEDGER_WRITE_PERMISSION, goalAction, goalActor, personAsked, usingServices } from "./action-contract.js";
import { text, identifier, boolean, array, object, nullable, enumeration, goalConfirmedInputSchema, goalEntryActions, inGoalRelation, type GoalConfirmedInput } from "@molis-ai/molis-work-contracts/modules/goal-actions";
export type { GoalConfirmedInput } from "@molis-ai/molis-work-contracts/modules/goal-actions";

/** A Plugin object bound to a Goal, as callers see it: the owner's subject, the name it was bound under, and state. */
export interface GoalBoundObject {
  binding_id: string;
  goal_id: string;
  subject: { kind: string; id: string };
  title: string;
  state: "proposed" | "confirmed" | "inactive";
  created_at: string;
}
const subject = object({ kind: identifier, id: identifier });
const bound = object({ binding_id: text, goal_id: text, subject, title: text, state: enumeration(["proposed", "confirmed", "inactive"]), created_at: text });

const confirmed = goalConfirmedInputSchema;
/** How a confirmed source is kept in the Goal's input receipts: the receipt type, the prefix of the locator, the prefix of the receipt id. */
const CONFIRMED_SOURCES = { feed_item: { source_type: "feed_item", locator: "feed-item:", receipt: "binding-feed-" } } as const;

/** An action only the person can call: the other audiences never see it. */
function userOnly<Input, Output>(definition: ActionDefinition<Input, Output>): ActionDefinition<Input, Output> {
  return { ...definition, action: { ...definition.action, audiences: ["user"] } };
}

/** The kept source a receipt records, read back from its locator; null for a receipt of any other kind of source. */
function keptSource(record: GoalInputBindingRecord): GoalConfirmedInput["source"] | null {
  const kind = (Object.keys(CONFIRMED_SOURCES) as Array<keyof typeof CONFIRMED_SOURCES>)
    .find(key => record.source_type === CONFIRMED_SOURCES[key].source_type && record.source_ref.startsWith(CONFIRMED_SOURCES[key].locator));
  return kind ? { kind, id: record.source_ref.slice(CONFIRMED_SOURCES[kind].locator.length) } : null;
}
const confirmedView = (record: GoalInputBindingRecord, source: GoalConfirmedInput["source"]): GoalConfirmedInput => ({ binding_id: record.binding_id, goal_id: record.goal_id,
  source, name: record.input_name, snapshot_digest: record.snapshot_digest, state: record.state, created_at: record.created_at });

/**
 * Goals owns which materials a Goal is bound to (its input receipts). Binding a Plugin object records the owner's
 * subject; it neither copies nor moves the object, and releasing keeps the receipt as history (specs/archive/work-placement §3.2).
 */
export const goalsInputActions = {
  bind: inGoalRelation(goalAction<{ goal_id: string; subject: { kind: string; id: string }; title: string }, { binding: GoalBoundObject; replayed: boolean }>("goals.inputs.bind",
    "把资料关联到目标", "把一份资料（文档、演示稿、问卷、数据表、Shelf 材料等）记为目标的绑定资料；不复制、不移动原对象，重复关联返回原记录", "command",
    object({ goal_id: identifier, subject, title: { ...identifier, maxLength: 200 } }), object({ binding: bound, replayed: boolean })), "bind"),
  confirm: usingServices(goalEntryActions.inputsConfirm, [CONTEXT_LEDGER_WRITE_PERMISSION]),
  accept: userOnly(goalAction<{ goal_id: string; binding_id: string }, { binding: GoalConfirmedInput; replayed: boolean }>("goals.inputs.accept",
    "认可待确认的输入", "用户本人认可一条由助理、Agent、工作流或外部工具提议的输入，把「待确认」记为「已确认」，摘要和理由不变；只有用户本人能调用；已确认的返回原记录，已移除的不能再认可", "command",
    object({ goal_id: identifier, binding_id: identifier }), object({ binding: confirmed, replayed: boolean }))),
  release: inGoalRelation(goalAction<{ goal_id: string; binding_id: string }, { released: boolean }>("goals.inputs.release",
    "移除目标的输入", "结束一条输入（绑定的资料，或来源材料的输入）；原对象和原材料不受影响，记录保留为历史；已确认的来源输入只能由用户移除，其他调用者只能撤回待确认的提议", "command",
    object({ goal_id: identifier, binding_id: identifier }), object({ released: boolean })), "release"),
  list: inGoalRelation(goalAction<{ goal_id?: string | null; subject?: { kind: string; id: string } | null }, { bindings: GoalBoundObject[] }>("goals.inputs.list",
    "目标的绑定资料", "列出目标绑定的插件资料，或某份资料绑定到了哪些目标；只含仍然有效的绑定", "query",
    object({ goal_id: nullable(identifier), subject: nullable(subject) }, []), object({ bindings: array(bound) })), "list"),
} as const;

/** A Goal's confirmed bound Plugin objects, by the owner's subject and the name they were bound under. */
export function boundGoalObjects(records: readonly GoalInputBindingRecord[], goalId: string): Array<{ subject: { kind: string; id: string }; title: string }> {
  return records.flatMap(record => {
    const subjectRef = record.goal_id === goalId && record.state === "confirmed" && record.source_type === GOAL_PLUGIN_OBJECT_SOURCE ? parseGoalPluginObjectRef(record.source_ref) : null;
    return subjectRef ? [{ subject: subjectRef, title: record.input_name }] : [];
  });
}

export function createGoalsInputActionHandlers(projectId: string, inputs: Pick<GoalInputBindingsApi, "list" | "register" | "deactivate" | "accept">, goalExists: (goalId: string) => boolean): ActionHandlerBinding[] {
  const view = (record: GoalInputBindingRecord): GoalBoundObject | null => {
    const subjectRef = parseGoalPluginObjectRef(record.source_ref);
    return record.source_type === GOAL_PLUGIN_OBJECT_SOURCE && subjectRef ? { binding_id: record.binding_id, goal_id: record.goal_id, subject: subjectRef,
      title: record.input_name, state: record.state, created_at: record.created_at } : null;
  };
  const active = () => inputs.list(projectId).map(view).filter((item): item is GoalBoundObject => !!item && item.state !== "inactive");
  return [
    { ...goalsInputActions.bind, handle: (caller, input) => {
      const value = input as { goal_id: string; subject: { kind: string; id: string }; title: string };
      if (!goalExists(value.goal_id)) throw new ActionError("goals.not_found", "找不到这个目标");
      const existing = active().find(item => item.goal_id === value.goal_id && item.subject.kind === value.subject.kind && item.subject.id === value.subject.id);
      if (existing) return { binding: existing, replayed: true };
      const record: GoalInputBindingRecord = { binding_id: crypto.randomUUID(), project_id: projectId, goal_id: value.goal_id, input_name: value.title.slice(0, 200),
        source_type: GOAL_PLUGIN_OBJECT_SOURCE, source_ref: goalPluginObjectRef(value.subject), snapshot_digest: null, state: "confirmed",
        reason: "用户关联的资料", created_by: goalActor(caller).actor_id, created_at: new Date().toISOString() };
      inputs.register(record);
      return { binding: view(record)!, replayed: false };
    } },
    { ...goalsInputActions.confirm, handle: (caller, input) => {
      const value = input as { goal_id: string; source: { kind: "feed_item"; id: string }; name: string; snapshot_digest: string; reason: string };
      if (!goalExists(value.goal_id)) throw new ActionError("goals.not_found", "找不到这个目标");
      const kept = CONFIRMED_SOURCES[value.source.kind];
      const locator = `${kept.locator}${value.source.id}`;
      const view = (record: GoalInputBindingRecord) => confirmedView(record, { kind: value.source.kind, id: value.source.id });
      const existing = inputs.list(projectId).find(record => record.goal_id === value.goal_id && record.source_type === kept.source_type
        && record.source_ref === locator && record.state !== "inactive");
      const person = personAsked(caller, value.source.kind);
      // The person's confirmation is not answered with someone else's proposal as if it were settled: accepting it is its own step.
      if (existing?.state === "proposed" && person) throw new ActionError("goals.input_proposed", "这条来源已被提议为输入，等你认可；请在目标的输入里认可或移除它");
      if (existing) return { binding: view(existing), replayed: true };
      // The person decides what a Goal took as input, also through the source owner's action they called (`personAsked`); everyone else proposes.
      const record: GoalInputBindingRecord = { binding_id: `${kept.receipt}${crypto.randomUUID()}`, project_id: projectId, goal_id: value.goal_id,
        input_name: value.name.slice(0, 200), source_type: kept.source_type, source_ref: locator, snapshot_digest: value.snapshot_digest,
        state: person ? "confirmed" : "proposed",
        reason: value.reason, created_by: goalActor(caller).actor_id, created_at: new Date().toISOString() };
      inputs.register(record);
      return { binding: view(record), replayed: false };
    } },
    { ...goalsInputActions.accept, handle: (_caller, input) => {
      const value = input as { goal_id: string; binding_id: string };
      if (!goalExists(value.goal_id)) throw new ActionError("goals.not_found", "找不到这个目标");
      const find = () => inputs.list(projectId).find(item => item.binding_id === value.binding_id && item.goal_id === value.goal_id);
      const found = find(), source = found && keptSource(found);
      if (!found || !source) throw new ActionError("goals.not_found", "找不到这条输入");
      if (found.state === "inactive") throw new ActionError("goals.input_released", "这条输入已经移除，不能再认可");
      if (found.state === "proposed") {
        if (!inputs.accept) throw new ActionError("actions.unavailable", "当前环境不能认可输入");
        inputs.accept(projectId, found.binding_id);
      }
      // Read again: a call that came in between may have settled it the other way.
      const settled = find();
      if (!settled || settled.state === "inactive") throw new ActionError("goals.input_released", "这条输入已经移除，不能再认可");
      return { binding: confirmedView(settled, source), replayed: found.state !== "proposed" };
    } },
    { ...goalsInputActions.release, handle: (caller, input) => {
      const value = input as { goal_id: string; binding_id: string };
      const found = inputs.list(projectId).find(item => item.binding_id === value.binding_id && item.goal_id === value.goal_id);
      if (!found || (found.source_type !== GOAL_PLUGIN_OBJECT_SOURCE && !keptSource(found))) throw new ActionError("goals.not_found", "找不到这条输入");
      // The person decides what a Goal took as input: others withdraw what they proposed, and only the person takes off a confirmed one.
      if (found.source_type !== GOAL_PLUGIN_OBJECT_SOURCE && found.state === "confirmed" && caller.audience !== "user") throw new ActionError("goals.input_confirmed", "已确认的输入只能由用户移除");
      if (!inputs.deactivate) throw new ActionError("actions.unavailable", "当前环境不能移除输入");
      return { released: inputs.deactivate(projectId, value.binding_id) };
    } },
    { ...goalsInputActions.list, handle: (_caller, input) => {
      const value = (input ?? {}) as { goal_id?: string | null; subject?: { kind: string; id: string } | null };
      return { bindings: active().filter(item => (!value.goal_id || item.goal_id === value.goal_id)
        && (!value.subject || (item.subject.kind === value.subject.kind && item.subject.id === value.subject.id))) };
    } },
  ];
}
