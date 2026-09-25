import { ActionError, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding, type ActionAvailability } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PlanningMethodPack, PlanningMethodPackInput } from "@molis-ai/molis-work-contracts/modules/goals";
import { goalAction } from "./action-contract.js";
import { object, array } from "./event-action-schemas.js";
import { planningMethodInputSchema, planningMethodSchema } from "./planning-action-schemas.js";

function home<I, O>(definition: ActionDefinition<I, O>): ActionDefinition<I, O> {
  return { ...definition, action: { ...definition.action, scope: "home", subject_kinds: ["planning_method"],
    ...(definition.operation === "command" ? { audiences: ["user"] } : {}) } };
}
export const personalPlanningActions = {
  list: home(goalAction<Record<string, never>, { methods: PlanningMethodPack[] }>("goals.planning.personal.list", "读取个人规划方法",
    "读取当前 Home 的完整内置和个人规划方法，个人版本优先；无需选择项目，不包含项目覆盖", "query", object({}), object({ methods: array(planningMethodSchema) }))),
  save: home(goalAction<{ method: PlanningMethodPackInput }, { method: PlanningMethodPack }>("goals.planning.personal.save", "保存个人规划方法",
    "用户保存个人规划模板，每次保存生成新版本；后续查询和采用立即使用新版本，既有项目副本和目标要求保持原样。响应不确定时先读取核对，不自动重试", "command",
    object({ method: planningMethodInputSchema }), object({ method: planningMethodSchema }))),
} as const;
export const PERSONAL_PLANNING_ACTIONS = Object.values(personalPlanningActions);
export interface PersonalPlanningActionPorts {
  list(): PlanningMethodPack[];
  save(method: PlanningMethodPackInput): Promise<PlanningMethodPack>;
  saveAvailability(): ActionAvailability;
}
function userAvailability(caller: ActionCallContext): ActionAvailability {
  const proof = caller.user_action;
  return caller.audience === "user" && caller.actor_kind === "user" && caller.actor_id.trim() && proof?.conversation_ref.trim()
    && proof.message_ref.trim() && ["web", "management"].includes(proof.source)
    ? { available: true } : { available: false, code: "planning.user_required", reason: "个人规划修改需要受保护的用户操作" };
}
export function createPersonalPlanningActionHandlers(ports: PersonalPlanningActionPorts): ActionHandlerBinding[] {
  return [
    { ...personalPlanningActions.list, handle: () => ({ methods: ports.list() }) },
    { ...personalPlanningActions.save, availability: caller => {
      const user = userAvailability(caller); return user.available ? ports.saveAvailability() : user;
    }, handle: async (caller, input) => {
      const authority = userAvailability(caller);
      if (!authority.available) throw new ActionError(authority.code, authority.reason);
      return { method: await ports.save((input as { method: PlanningMethodPackInput }).method) };
    } },
  ];
}
