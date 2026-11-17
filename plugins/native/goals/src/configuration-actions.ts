import { goalPolicySchema, goalRelationSchema, goalRelationEndpoints } from "./contract/goal-actions.js";
export { goalPolicySchema, goalPolicyBindingSchema, goalRelationSchema } from "./contract/goal-actions.js";
import { ActionError, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { type AddGoalRelationInput, type GoalPolicy, type GoalRelationRecord, type GoalsCommandApi, type GoalsQueryApi } from "./contract/goals.js";
import { goalAction } from "./action-contract.js";
import { identifier, boolean, count, object, array, enumeration } from "./contract/goal-actions.js";

function userOperation<I, O>(definition: ActionDefinition<I, O>): ActionDefinition<I, O> {
  return { ...definition, action: { ...definition.action, audiences: ["user"], permissions: ["goals:decide"] } };
}
function requireUser(caller: ActionCallContext): void {
  const p = caller.user_action;
  if (caller.audience !== "user" || caller.actor_kind !== "user" || !caller.actor_id.trim()
    || !p?.conversation_ref.trim() || !p.message_ref.trim() || !["web", "management"].includes(p.source)) {
    throw new ActionError("goals.configuration_user_required", "直接修改目标关系需要受保护的用户操作；执行工具应提交结构提案");
  }
}
function protectedHandler(binding: ActionHandlerBinding): ActionHandlerBinding {
  return { ...binding, availability(caller) {
    try { requireUser(caller); return { available: true }; }
    catch (error) { if (error instanceof ActionError) return { available: false, code: error.code, reason: error.message }; throw error; }
  }, handle(caller, input) { requireUser(caller); return binding.handle(caller, input); } };
}
/** A Goal's rule is the user's acceptance at closure; quality checks belong to Coding (specs/coding-quality-assurance). */
const policy = goalPolicySchema;
const endpoints = goalRelationEndpoints;
const relation = goalRelationSchema;
export const goalsConfigurationActions = {
  relations: goalAction<{ goal_id?: string }, { relations: GoalRelationRecord[]; observed_event_cursor: number }>("goals.relations.list", /* @version action.goals.relations.list */ 1, "读取目标关系",
    "读取当前项目或指定目标的入向及出向关系，保留 proposed、active、inactive 状态和原方向；不会重新启用历史关系", "query",
    object({ goal_id: identifier }, []), object({ relations: array(relation), observed_event_cursor: count })),
  relationAdd: userOperation(goalAction<AddGoalRelationInput & { idempotency_key: string }, ReturnType<GoalsCommandApi["addRelation"]>>("goals.relations.add", /* @version action.goals.relations.add */ 1, "建立目标关系",
    "按明确的起点、终点和类型建立关系，必须说明原因；默认 active，也可保存 proposed。拒绝重复、自关联、已丢弃目标及结构循环，重试保留原幂等键", "command",
    object({ ...endpoints, state: enumeration(["proposed", "active"]), reason: identifier, idempotency_key: identifier },
      ["from_goal_id", "to_goal_id", "type", "reason", "idempotency_key"]), object({ relation_id: identifier, replayed: boolean, observed_event_cursor: count }))),
  relationDeactivate: userOperation(goalAction<{ relation_id: string; reason: string; idempotency_key: string }, ReturnType<GoalsCommandApi["deactivateRelation"]>>("goals.relations.deactivate", /* @version action.goals.relations.deactivate */ 1, "解除目标关系",
    "解除指定的 active 关系并保留原记录和历史；必须说明原因，重试返回原回执", "command",
    object({ relation_id: identifier, reason: identifier, idempotency_key: identifier }), object({ relation, replayed: boolean, observed_event_cursor: count }))),
  policyResolve: goalAction<{ goal_id: string }, { policy: GoalPolicy; observed_event_cursor: number }>("goals.policy.resolve", /* @version action.goals.policy.resolve */ 1, "读取目标生效规则",
    "合并项目默认规则、上级最低要求与目标覆盖，返回指定目标当前生效的规则（是否需要人工确认）；只读，不改变规则历史", "query",
    object({ goal_id: identifier }), object({ policy, observed_event_cursor: count })),
} as const;
export interface GoalsConfigurationActionPorts {
  commands: Pick<GoalsCommandApi, "addRelation" | "deactivateRelation">;
  query: Pick<GoalsQueryApi, "listRelations" | "resolvePolicy">;
  eventCursor(): number;
}
export function createGoalsConfigurationActionHandlers(ports: GoalsConfigurationActionPorts, projectId: string): ActionHandlerBinding[] {
  return [
    { ...goalsConfigurationActions.relations, handle: (_caller, input) => ({
      relations: ports.query.listRelations(projectId, (input as { goal_id?: string }).goal_id), observed_event_cursor: ports.eventCursor() }) },
    protectedHandler({ ...goalsConfigurationActions.relationAdd, handle: (caller, input) => {
      const { idempotency_key, ...relation } = input as AddGoalRelationInput & { idempotency_key: string };
      return ports.commands.addRelation(projectId, relation, { actor_id: caller.actor_id, idempotency_key });
    } }),
    protectedHandler({ ...goalsConfigurationActions.relationDeactivate, handle: (caller, input) => {
      const { idempotency_key, ...relation } = input as { relation_id: string; reason: string; idempotency_key: string };
      return ports.commands.deactivateRelation(projectId, relation, { actor_id: caller.actor_id, idempotency_key });
    } }),
    { ...goalsConfigurationActions.policyResolve, handle: (_caller, input) => ({ policy: ports.query.resolvePolicy(projectId, (input as { goal_id: string }).goal_id), observed_event_cursor: ports.eventCursor() }) },
  ];
}
