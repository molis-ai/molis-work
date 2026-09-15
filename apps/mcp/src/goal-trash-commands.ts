import type { AsyncApplicationMethods } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { GoalTrashResult } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalEntryCompositionApi, GoalTrashPlacementView } from "@molis-ai/molis-work-plugin-goals";
import type { McpPresentationErrorFactory } from "./query-presentation.js";

/** Only adapts the user's request and the owner's result; the lifecycle owns all transitions. */
export function createMcpGoalTrashHandlers(
  application: Pick<GoalEntryCompositionApi, "setTrashedWithWorkState"> | AsyncApplicationMethods<Pick<GoalEntryCompositionApi, "setTrashedWithWorkState">>,
  createError: McpPresentationErrorFactory,
) {
  async function setTrashed(args: Record<string, unknown>, trashed: boolean) {
    if (Object.hasOwn(args, "payload")) {
      throw createError(
        "mcp.unexpected_field",
        "不能使用未许可字段：payload",
        { fields: ["payload"] },
      );
    }
    const boardId = String(args.board_id ?? "");
    const goalId = String(args.goal_id ?? "");
    const actorId = String(args.actor_id ?? "");
    const reason = String(args.reason ?? "");
    const idempotencyKey = String(args.idempotency_key ?? "");
    if (!boardId || !goalId || !actorId || !reason || !idempotencyKey) {
      throw createError(
        "mcp.invalid_arguments",
        "回收站写入需要明确的目标、操作者和确认理由",
        { fields: ["board_id", "goal_id", "actor_id", "reason", "idempotency_key"] },
      );
    }
    if (args.user_confirmed !== true) {
      const action = trashed ? "移入回收站" : "恢复";
      throw createError("mcp.user_confirmation_required",
        `当前 Runtime 只有在用户明确要求${action}指定 Goal 后才能调用；请先在当前对话确认。`);
    }
    const { result, work_state } = await application.setTrashedWithWorkState(
      boardId,
      { goal_id: goalId, trashed, reason },
      { actor_id: actorId, idempotency_key: idempotencyKey },
    );
    return presentGoalTrashResult(result, work_state);
  }
  return {
    molis_work_v1_goal_trash: (args: Record<string, unknown>) => setTrashed(args, true),
    molis_work_v1_goal_restore: (args: Record<string, unknown>) => setTrashed(args, false),
  };
}

function presentGoalTrashResult<T extends GoalTrashResult>(
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
