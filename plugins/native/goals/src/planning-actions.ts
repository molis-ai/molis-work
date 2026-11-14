import type { ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { GoalsPlanningApi } from "./contract/goals.js";
import { goalAction } from "./action-contract.js";
import { identifier, count, object, array } from "./contract/goal-actions.js";
import { planningImpactSchema, planningGraphIssueSchema } from "./contract/goal-actions.js";

export interface GoalsPlanningActionPorts {
  planning: Pick<GoalsPlanningApi, "analyzeChange" | "validateBoardGraph">;
}
/** What Goals works out over its own Goals and relations: the reach of a change, and whether the relation graph holds. */
export const goalsPlanningActions = {
  planningImpact: goalAction<{ changed_goal_ids: string[] }, ReturnType<GoalsPlanningApi["analyzeChange"]>>("goals.planning.impact", /* @version action.goals.planning.impact */ 1, "分析目标变更影响", "只读计算受影响的上层目标、下游消费者、相邻依赖、可复用工作和审查顺序；不会修改目标树", "query",
    object({ changed_goal_ids: array(identifier) }), planningImpactSchema),
  planningGraph: goalAction<Record<string, never>, ReturnType<GoalsPlanningApi["validateBoardGraph"]>>("goals.planning.graph.check", /* @version action.goals.planning.graph.check */ 1, "检查目标关系图", "只读检查缺失引用、重复关系、父子循环、依赖循环和组合执行循环", "query",
    object({}), object({ issues: array(planningGraphIssueSchema), observed_event_cursor: count })),
} as const;

export function createGoalsPlanningActionHandlers(ports: GoalsPlanningActionPorts, projectId: string): ActionHandlerBinding[] {
  const { planning } = ports;
  return [
    { ...goalsPlanningActions.planningImpact, handle: (_caller, input) => planning.analyzeChange(projectId, (input as { changed_goal_ids: string[] }).changed_goal_ids) },
    { ...goalsPlanningActions.planningGraph, handle: () => planning.validateBoardGraph(projectId) },
  ];
}
