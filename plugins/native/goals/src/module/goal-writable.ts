import type { GoalRecord } from "../contract/goals.js";
import type { GoalsCommandContext } from "./command-support.js";
import { goalErrors } from "./errors.js";

/** The goal a write may land on: it exists in the project's board and is neither in the trash nor archived. */
export function requireWritableGoal(context: GoalsCommandContext, projectId: string, goalId: string): GoalRecord {
  context.requireGoalsLibrary(projectId);
  const goal = context.requireGoal(projectId, goalId);
  if (goal.trashed_at) {
    throw goalErrors["goals.goal.trashed"]("回收站中的 Goal 不能登记事件配置或上报工作事实");
  }
  if (goal.archived_at) {
    throw goalErrors["goals.goal.archived"]("已归档的 Goal 不能登记事件配置或上报工作事实");
  }
  return goal;
}
