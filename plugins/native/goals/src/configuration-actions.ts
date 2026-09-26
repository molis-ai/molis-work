import { ActionError, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalRelationTypes, type AddGoalRelationInput, type GoalPolicy, type GoalPolicyHistoryRecord,
  type GoalRelationRecord, type GoalsCommandApi, type GoalsQueryApi } from "@molis-ai/molis-work-contracts/modules/goals";
import { goalAction } from "./action-contract.js";
import { text, identifier, boolean, count, object, array, enumeration, nullable } from "./event-action-schemas.js";

function userOperation<I, O>(definition: ActionDefinition<I, O>): ActionDefinition<I, O> {
  return { ...definition, action: { ...definition.action, audiences: ["user"], permissions: ["goals:decide"] } };
}
function requireUser(caller: ActionCallContext): void {
  const p = caller.user_action;
  if (caller.audience !== "user" || caller.actor_kind !== "user" || !caller.actor_id.trim()
    || !p?.conversation_ref.trim() || !p.message_ref.trim() || !["web", "management"].includes(p.source)) {
    throw new ActionError("goals.configuration_user_required", "直接修改目标关系或项目规则需要受保护的用户操作；执行工具应提交结构提案");
  }
}
function protectedHandler(binding: ActionHandlerBinding): ActionHandlerBinding {
  return { ...binding, availability(caller) {
    try { requireUser(caller); return { available: true }; }
    catch (error) { if (error instanceof ActionError) return { available: false, code: error.code, reason: error.message }; throw error; }
  }, handle(caller, input) { requireUser(caller); return binding.handle(caller, input); } };
}
const policyFields = { goal_mode: enumeration(["disabled", "preferred", "required"]), required_capabilities: array(identifier),
  self_verification: boolean, cross_reviewers: count, adversarial_reviewers: count, human_approval: boolean,
  max_lease_seconds: { type: "integer", minimum: 1 } };
export const goalPolicySchema = object(policyFields);
const policy = goalPolicySchema;
export const goalPolicyBindingSchema = object({ policy_binding_id: text, goal_id: nullable(text), scope: enumeration(["project_default", "ancestor_minimum", "goal"]),
  policy: object(policyFields, []), state: enumeration(["active", "replaced", "withdrawn"]), created_by: text, reason: text, created_at: text });
const endpoints = { from_goal_id: identifier, to_goal_id: identifier, type: { ...enumeration(goalRelationTypes),
  description: "part_of：子目标到父目标；depends_on：消费目标到前置目标。其他类型同样按 from → to 保存，不能颠倒。" } };
export const goalRelationSchema = object({ relation_id: text, board_id: text, ...endpoints, state: enumeration(["proposed", "active", "inactive"]),
  reason: text, created_by: text, created_at: text, deactivated_at: nullable(text) });
const relation = goalRelationSchema;
type SavePolicyInput = Omit<Parameters<GoalsCommandApi["saveProjectPolicy"]>[0], "board_id" | "actor_id">;
export const goalsConfigurationActions = {
  relations: goalAction<{ goal_id?: string }, { relations: GoalRelationRecord[]; observed_event_cursor: number }>("goals.relations.list", "读取目标关系",
    "读取当前项目或指定目标的入向及出向关系，保留 proposed、active、inactive 状态和原方向；不会重新启用历史关系", "query",
    object({ goal_id: identifier }, []), object({ relations: array(relation), observed_event_cursor: count })),
  relationAdd: userOperation(goalAction<AddGoalRelationInput & { idempotency_key: string }, ReturnType<GoalsCommandApi["addRelation"]>>("goals.relations.add", "建立目标关系",
    "按明确的起点、终点和类型建立关系，必须说明原因；默认 active，也可保存 proposed。拒绝重复、自关联、已丢弃目标及结构循环，重试保留原幂等键", "command",
    object({ ...endpoints, state: enumeration(["proposed", "active"]), reason: identifier, idempotency_key: identifier },
      ["from_goal_id", "to_goal_id", "type", "reason", "idempotency_key"]), object({ relation_id: identifier, replayed: boolean, observed_event_cursor: count }))),
  relationDeactivate: userOperation(goalAction<{ relation_id: string; reason: string; idempotency_key: string }, ReturnType<GoalsCommandApi["deactivateRelation"]>>("goals.relations.deactivate", "解除目标关系",
    "解除指定的 active 关系并保留原记录和历史；必须说明原因，重试返回原回执", "command",
    object({ relation_id: identifier, reason: identifier, idempotency_key: identifier }), object({ relation, replayed: boolean, observed_event_cursor: count }))),
  policyHistory: goalAction<Record<string, never>, { bindings: GoalPolicyHistoryRecord[]; observed_event_cursor: number }>("goals.policy.history", "读取项目规则历史",
    "读取当前项目的规则绑定历史，保留作用范围、原作者及 active、replaced、withdrawn 状态；历史绑定不代表当前最终生效规则", "query",
    object({}), object({ bindings: array(goalPolicyBindingSchema), observed_event_cursor: count })),
  policyResolve: goalAction<{ goal_id: string }, { policy: GoalPolicy; observed_event_cursor: number }>("goals.policy.resolve", "读取目标生效规则",
    "按原业务规则合并项目基线与目标要求，返回指定目标当前真正生效的规则；不会变更历史领取或审阅记录", "query",
    object({ goal_id: identifier }), object({ policy, observed_event_cursor: count })),
  policySave: userOperation(goalAction<SavePolicyInput, ReturnType<GoalsCommandApi["saveProjectPolicy"]>>("goals.policy.save", "保存项目默认规则",
    "用户明确确认后替换当前项目默认规则，保留历史绑定和原幂等回执；不创建目标单独规则，也不产生目标审批决定", "command",
    object({ policy, user_confirmed: boolean, idempotency_key: identifier }), object({ policy_binding_id: identifier, observed_event_cursor: count, replayed: boolean }))),
} as const;
export interface GoalsConfigurationActionPorts {
  commands: Pick<GoalsCommandApi, "addRelation" | "deactivateRelation" | "saveProjectPolicy">;
  query: Pick<GoalsQueryApi, "listRelations" | "listPolicyHistory" | "resolvePolicy">;
  eventCursor(): number;
}
export function createGoalsConfigurationActionHandlers(ports: GoalsConfigurationActionPorts, boardId: string): ActionHandlerBinding[] {
  return [
    { ...goalsConfigurationActions.relations, handle: (_caller, input) => ({
      relations: ports.query.listRelations(boardId, (input as { goal_id?: string }).goal_id), observed_event_cursor: ports.eventCursor() }) },
    protectedHandler({ ...goalsConfigurationActions.relationAdd, handle: (caller, input) => {
      const { idempotency_key, ...relation } = input as AddGoalRelationInput & { idempotency_key: string };
      return ports.commands.addRelation(boardId, relation, { actor_id: caller.actor_id, idempotency_key });
    } }),
    protectedHandler({ ...goalsConfigurationActions.relationDeactivate, handle: (caller, input) => {
      const { idempotency_key, ...relation } = input as { relation_id: string; reason: string; idempotency_key: string };
      return ports.commands.deactivateRelation(boardId, relation, { actor_id: caller.actor_id, idempotency_key });
    } }),
    { ...goalsConfigurationActions.policyHistory, handle: () => ({ bindings: ports.query.listPolicyHistory(boardId), observed_event_cursor: ports.eventCursor() }) },
    { ...goalsConfigurationActions.policyResolve, handle: (_caller, input) => ({ policy: ports.query.resolvePolicy(boardId, (input as { goal_id: string }).goal_id), observed_event_cursor: ports.eventCursor() }) },
    protectedHandler({ ...goalsConfigurationActions.policySave, handle: (caller, input) => ports.commands.saveProjectPolicy({ ...input as SavePolicyInput,
      board_id: boardId, actor_id: caller.actor_id }) }),
  ];
}
