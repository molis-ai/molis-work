import type { GoalTrashResult } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalTrashPlacementView } from "@molis-ai/molis-work-plugin-goals";

export function presentGoalTrashResult<T extends GoalTrashResult>(
  result: T,
  workState: GoalTrashPlacementView,
): T & {
  work_state: GoalTrashPlacementView;
  next_action: { kind: string; message: string } | null;
} {
  if (result.status === "blocked") {
    return {
      ...result,
      work_state: workState,
      next_action: {
        kind: "finish_active_work",
        message: "这条 Goal 仍有未结束的工作；先在当前工作流结束或继续它，再由用户重新确认删除。",
      },
    };
  }
  if (result.pending_relation_ids.length > 0) {
    return {
      ...result,
      work_state: workState,
      next_action: {
        kind: "restore_related_goal",
        message: "关联 Goal 仍在回收站，相关 Relation 会保持停用；恢复另一端后再查看结果。",
      },
    };
  }
  if (result.status === "trashed") {
    return {
      ...result,
      work_state: workState,
      next_action: {
        kind: "report_recoverable_trash",
        message: "Goal 已移入回收站，历史仍被保留；用户可在当前对话随时请求恢复。",
      },
    };
  }
  if (result.status === "restored") {
    return {
      ...result,
      work_state: workState,
      next_action: {
        kind: "read_goal_state",
        message: "Goal 已恢复；读取其当前状态或事件记录，继续当前允许的工作。",
      },
    };
  }
  return { ...result, work_state: workState, next_action: null };
}
