import { bindActionHandler, type InferActionInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { objectSchema } from "@molis-ai/molis-work-plugin-sdk";
import { goalAction } from "./action-contract.js";
import { goalStateSchema, object, identifier } from "./contract/goal-actions.js";
import type { GoalEventApplication } from "./goal-event-application.js";

const input = objectSchema({ goal_ids: { type: "array", minItems: 1, maxItems: 100, uniqueItems: true, items: { type: "string", minLength: 1 } } } as const);
/** D0027: one provider invocation for the explicitly selected project goals, with no partial result. */
export const goalsStatesAction = goalAction<InferActionInput<typeof input>, Array<{ goal_id: string; state: ReturnType<GoalEventApplication["readState"]> }>>(
  "goals.states.read", /* @version action.goals.states.read */ 1, "批量读取目标状态", "只读取当前项目明确选中的目标；任一目标不存在时整批拒绝", "query", input,
  { type: "array", maxItems: 100, items: object({ goal_id: identifier, state: goalStateSchema }) });
export const createGoalsStatesHandler = (events: GoalEventApplication, projectId: string) =>
  bindActionHandler(goalsStatesAction, input => input.goal_ids.map(goal_id => ({ goal_id, state: events.readState(projectId, goal_id) })));
