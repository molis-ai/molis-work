import { ActionError, withActionEffect, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { GoalsLifecycleApi, GoalsCommandApi, GoalRecord } from "./contract/goals.js";
import { goalAction, goalActor } from "./action-contract.js";
import { identifier, count, boolean, object, array } from "./contract/goal-actions.js";
import { goalRecordSchema, goalArchiveResultSchema, goalTrashResultSchema, goalEntryActions } from "./contract/goal-actions.js";

type ActiveInput = { goal_id: string; reason: string; idempotency_key: string };
type ArchiveInput = ActiveInput & { archived: boolean };
type TrashInput = ActiveInput & { trashed: boolean; user_confirmed: boolean };
export interface GoalsLifecycleActionPorts {
  lifecycle: GoalsLifecycleApi;
  setActiveGoal: GoalsCommandApi["setActiveGoal"];
  eventCursor(): number;
}
const write = { goal_id: identifier, reason: identifier, idempotency_key: identifier };
export const goalsLifecycleActions = {
  active: goalEntryActions.active,
  archive: goalAction<ArchiveInput, ReturnType<GoalsLifecycleApi["setArchived"]>>("goals.archive.set", "设置目标归档状态", "已完成的目标可以归档，也可恢复归档；归档清除匹配的当前目标，保留原完成事实和全部历史", "command",
    object({ ...write, archived: boolean }), goalArchiveResultSchema),
  // Trashed Goals can be restored; it stays out of generated plugins because it needs the person's confirmation.
  trash: withActionEffect(goalAction<TrashInput, ReturnType<GoalsLifecycleApi["setTrashed"]>>("goals.trash.set", "移入或恢复回收站", "仅在用户明确确认指定目标后执行。移入回收站会停用它的关系并清除当前目标标记，之后可恢复；恢复时只恢复两端可用的关系，保留未恢复关系和完整历史", "command",
    object({ ...write, trashed: boolean, user_confirmed: boolean }), goalTrashResultSchema), "write", false),
  trashed: goalAction<Record<string, never>, { goals: GoalRecord[]; observed_event_cursor: number }>("goals.trash.list", "读取回收站", "读取当前项目回收站中的完整目标与事件游标；不会修改状态或打开页面", "query",
    object({}), object({ goals: array(goalRecordSchema), observed_event_cursor: count })),
} as const;

export function createGoalsLifecycleActionHandlers(ports: GoalsLifecycleActionPorts, projectId: string): ActionHandlerBinding[] {
  return [
    { ...goalsLifecycleActions.active, handle: (caller, input) => {
      const { idempotency_key, ...goal } = input as ActiveInput;
      return ports.setActiveGoal(projectId, goal, { ...goalActor(caller), idempotency_key });
    } },
    { ...goalsLifecycleActions.archive, handle: (caller, input) => {
      const { idempotency_key, ...goal } = input as ArchiveInput;
      return ports.lifecycle.setArchived(projectId, goal, { ...goalActor(caller), idempotency_key });
    } },
    { ...goalsLifecycleActions.trash, handle: (caller, input) => {
      const { idempotency_key, user_confirmed, ...goal } = input as TrashInput;
      if (!user_confirmed) throw new ActionError("goals.goal.trash_confirmation_required", "移入或恢复回收站必须先由用户明确确认指定目标");
      return ports.lifecycle.setTrashed(projectId, goal, { ...goalActor(caller), idempotency_key });
    } },
    { ...goalsLifecycleActions.trashed, handle: () => ({ goals: ports.lifecycle.listTrashed(projectId), observed_event_cursor: ports.eventCursor() }) },
  ];
}
