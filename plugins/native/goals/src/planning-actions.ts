import { ActionError, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { GoalsPlanningApi, PlanningMethodPack, ResolvedPlanningMethodPack, SaveProjectPlanningMethodInput } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalEntryCompositionApi } from "./entry-composition-capabilities.js";
import { goalAction, goalActor } from "./action-contract.js";
import { identifier, count, boolean, object, array } from "./event-action-schemas.js";
import { planningMethodInputSchema, planningMethodSchema, planningCompositionSchema, planningImpactSchema, planningGraphIssueSchema, planningSavedSchema } from "./planning-action-schemas.js";

type SaveInput = Omit<SaveProjectPlanningMethodInput, "board_id" | "actor_id">;
type Saved = ReturnType<GoalsPlanningApi["saveProjectMethod"]>;
type ApplyInput = { method_id: string; user_confirmed: boolean };
export interface GoalsPlanningActionPorts {
  planning: Pick<GoalsPlanningApi, "effectiveMethods" | "projectComposition" | "saveProjectMethod" | "analyzeChange" | "validateBoardGraph">;
  /** Original Home owner provides built-in/personal sources, without project overrides. */
  baseMethods(): readonly PlanningMethodPack[];
}
export const goalsPlanningActions = {
  planningRead: goalAction<Record<string, never>, ReturnType<GoalEntryCompositionApi["readPlanningComposition"]>>("goals.planning.read", "读取项目规划方法", "读取当前项目可用的完整规划方法及已启用的项目组合；项目覆盖个人，个人覆盖内置方法", "query",
    object({}), object({ methods: array(planningMethodSchema), composition: planningCompositionSchema })),
  planningSave: goalAction<SaveInput, Saved>("goals.planning.save", "保存项目规划方法", "用户明确确认后保存项目方法或覆盖；影响后续规划，保留完整正文、事件类型和默认要求。重复保存会生成新版本", "command",
    object({ method: planningMethodInputSchema, user_confirmed: boolean }), planningSavedSchema),
  planningApply: goalAction<ApplyInput, Saved>("goals.planning.apply", "采用已有规划方法", "用户确认后将指定内置或个人方法完整复制到当前项目并启用；包括事件类型和默认要求，Goal 仍须显式采用其要求", "command",
    object({ method_id: identifier, user_confirmed: boolean }), planningSavedSchema),
  planningImpact: goalAction<{ changed_goal_ids: string[] }, ReturnType<GoalsPlanningApi["analyzeChange"]>>("goals.planning.impact", "分析目标变更影响", "只读计算受影响的上层目标、下游消费者、相邻依赖、可复用工作和审查顺序；不会修改目标树", "query",
    object({ changed_goal_ids: array(identifier) }), planningImpactSchema),
  planningGraph: goalAction<Record<string, never>, ReturnType<GoalsPlanningApi["validateBoardGraph"]>>("goals.planning.graph.check", "检查目标关系图", "只读检查缺失引用、重复关系、父子循环、依赖循环和组合执行循环", "query",
    object({}), object({ issues: array(planningGraphIssueSchema), observed_event_cursor: count })),
} as const;

export function createGoalsPlanningActionHandlers(ports: GoalsPlanningActionPorts, boardId: string): ActionHandlerBinding[] {
  const { planning } = ports;
  return [
    { ...goalsPlanningActions.planningRead, handle: () => ({ methods: planning.effectiveMethods(boardId), composition: planning.projectComposition(boardId) }) },
    { ...goalsPlanningActions.planningSave, handle: (caller, input) => planning.saveProjectMethod({ ...input as SaveInput, board_id: boardId, actor_id: goalActor(caller).actor_id }) },
    { ...goalsPlanningActions.planningApply, handle: (caller, input) => {
      const { method_id, user_confirmed } = input as ApplyInput;
      const source = ports.baseMethods().find(method => method.method_id === method_id && method.scope !== "project");
      if (!source) throw new ActionError("planning_method.not_found", "找不到可选的规划方法");
      const { scope: _scope, created_at: _created, updated_at: _updated, overridden_scopes: _overrides, ...method } = source as ResolvedPlanningMethodPack;
      return planning.saveProjectMethod({ board_id: boardId, actor_id: goalActor(caller).actor_id, user_confirmed, method: { ...method, enabled: true } });
    } },
    { ...goalsPlanningActions.planningImpact, handle: (_caller, input) => planning.analyzeChange(boardId, (input as { changed_goal_ids: string[] }).changed_goal_ids) },
    { ...goalsPlanningActions.planningGraph, handle: () => planning.validateBoardGraph(boardId) },
  ];
}
