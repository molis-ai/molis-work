import { ActionError, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { GOAL_PLUGIN_OBJECT_SOURCE, goalPluginObjectRef, parseGoalPluginObjectRef, type GoalInputBindingRecord, type GoalInputBindingsApi } from "@molis-ai/molis-work-contracts/modules/goals";
import { goalAction, goalActor } from "./action-contract.js";
import { text, identifier, boolean, array, object, nullable, enumeration } from "./event-action-schemas.js";

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

/** A source the person confirmed as an input of a Goal as it was then: the receipt holds the digest of what was confirmed, not a live link. */
export interface GoalConfirmedInput {
  binding_id: string;
  goal_id: string;
  source: { kind: "feed_item"; id: string };
  name: string;
  snapshot_digest: string | null;
  state: "proposed" | "confirmed" | "inactive";
  created_at: string;
}
const confirmedSource = object({ kind: enumeration(["feed_item"]), id: { ...identifier, maxLength: 200 } });
/** What the owner of a source computes of it: `sha256:` and 64 lower-case hex digits; the reason is one bounded sentence like a deliverable's. */
const snapshotDigest = { type: "string", pattern: "^sha256:[0-9a-f]{64}$" };
const confirmReason = { ...identifier, maxLength: 300 };
const confirmed = object({ binding_id: text, goal_id: text, source: confirmedSource, name: text, snapshot_digest: { type: ["string", "null"] },
  state: enumeration(["proposed", "confirmed", "inactive"]), created_at: text });
/** How a confirmed source is kept in the Goal's input receipts: the receipt type, the prefix of the locator, the prefix of the receipt id. */
const CONFIRMED_SOURCES = { feed_item: { source_type: "feed_item", locator: "feed-item:", receipt: "binding-feed-" } } as const;

/**
 * Goals owns which materials a Goal is bound to (its input receipts). Binding a Plugin object records the owner's
 * subject; it neither copies nor moves the object, and releasing keeps the receipt as history (specs/archive/work-placement §3.2).
 */
export const goalsInputActions = {
  bind: goalAction<{ goal_id: string; subject: { kind: string; id: string }; title: string }, { binding: GoalBoundObject; replayed: boolean }>("goals.inputs.bind",
    "把资料关联到目标", "把一份资料（文档、演示稿、问卷、数据表、Shelf 材料等）记为目标的绑定资料；不复制、不移动原对象，重复关联返回原记录", "command",
    object({ goal_id: identifier, subject, title: { ...identifier, maxLength: 200 } }), object({ binding: bound, replayed: boolean })),
  confirm: goalAction<{ goal_id: string; source: { kind: "feed_item"; id: string }; name: string; snapshot_digest: string; reason: string }, { binding: GoalConfirmedInput; replayed: boolean }>("goals.inputs.confirm",
    "确认来源材料为目标的输入", "把一条来源材料（目前是 Feed 消息）按确认时内容的摘要记为目标的已确认输入；不复制、不移动原材料，重复确认返回原记录", "command",
    object({ goal_id: identifier, source: confirmedSource, name: { ...identifier, maxLength: 200 }, snapshot_digest: snapshotDigest, reason: confirmReason }),
    object({ binding: confirmed, replayed: boolean })),
  release: goalAction<{ goal_id: string; binding_id: string }, { released: boolean }>("goals.inputs.release",
    "移除目标的资料关联", "结束一条资料绑定；原对象不受影响，绑定记录保留为历史", "command",
    object({ goal_id: identifier, binding_id: identifier }), object({ released: boolean })),
  list: goalAction<{ goal_id?: string | null; subject?: { kind: string; id: string } | null }, { bindings: GoalBoundObject[] }>("goals.inputs.list",
    "目标的绑定资料", "列出目标绑定的插件资料，或某份资料绑定到了哪些目标；只含仍然有效的绑定", "query",
    object({ goal_id: nullable(identifier), subject: nullable(subject) }, []), object({ bindings: array(bound) })),
} as const;

/** A Goal's confirmed bound Plugin objects, by the owner's subject and the name they were bound under. */
export function boundGoalObjects(records: readonly GoalInputBindingRecord[], goalId: string): Array<{ subject: { kind: string; id: string }; title: string }> {
  return records.flatMap(record => {
    const subjectRef = record.goal_id === goalId && record.state === "confirmed" && record.source_type === GOAL_PLUGIN_OBJECT_SOURCE ? parseGoalPluginObjectRef(record.source_ref) : null;
    return subjectRef ? [{ subject: subjectRef, title: record.input_name }] : [];
  });
}

export function createGoalsInputActionHandlers(projectId: string, inputs: Pick<GoalInputBindingsApi, "list" | "register" | "deactivate">, goalExists: (goalId: string) => boolean): ActionHandlerBinding[] {
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
      const view = (record: GoalInputBindingRecord): GoalConfirmedInput => ({ binding_id: record.binding_id, goal_id: record.goal_id,
        source: { kind: value.source.kind, id: value.source.id }, name: record.input_name, snapshot_digest: record.snapshot_digest, state: record.state, created_at: record.created_at });
      const existing = inputs.list(projectId).find(record => record.goal_id === value.goal_id && record.source_type === kept.source_type
        && record.source_ref === locator && record.state !== "inactive");
      if (existing) return { binding: view(existing), replayed: true };
      const record: GoalInputBindingRecord = { binding_id: `${kept.receipt}${crypto.randomUUID()}`, project_id: projectId, goal_id: value.goal_id,
        input_name: value.name.slice(0, 200), source_type: kept.source_type, source_ref: locator, snapshot_digest: value.snapshot_digest, state: "confirmed",
        reason: value.reason, created_by: goalActor(caller).actor_id, created_at: new Date().toISOString() };
      inputs.register(record);
      return { binding: view(record), replayed: false };
    } },
    { ...goalsInputActions.release, handle: (_caller, input) => {
      const value = input as { goal_id: string; binding_id: string };
      const found = inputs.list(projectId).find(item => item.binding_id === value.binding_id && item.goal_id === value.goal_id);
      if (!found || found.source_type !== GOAL_PLUGIN_OBJECT_SOURCE) throw new ActionError("goals.not_found", "找不到这条资料关联");
      if (!inputs.deactivate) throw new ActionError("actions.unavailable", "当前环境不能移除资料关联");
      return { released: inputs.deactivate(projectId, value.binding_id) };
    } },
    { ...goalsInputActions.list, handle: (_caller, input) => {
      const value = (input ?? {}) as { goal_id?: string | null; subject?: { kind: string; id: string } | null };
      return { bindings: active().filter(item => (!value.goal_id || item.goal_id === value.goal_id)
        && (!value.subject || (item.subject.kind === value.subject.kind && item.subject.id === value.subject.id))) };
    } },
  ];
}
