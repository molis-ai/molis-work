import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalAction, inGoalRelation } from "./goal-action-definition.js";
import { goalEntryActions } from "./goal-entry-actions.js";
import { goalEventWorkStatuses, type GoalEventDirectoryQuery, type GoalEventDirectoryPage, type GoalContractView, type GoalEventStateView, type RecordGoalProgressSummaryInput, type GoalEventProgressResult } from "./goals.js";
import { text, identifier, count, object, nullable, goalDirectoryItemSchema, artifactSource } from "./goal-event-action-schemas.js";
import { goalContractSchema } from "./goal-snapshot-action-schemas.js";
import { goalStateSchema } from "./goal-event-action-schemas.js";
import { goalProgressResultSchema } from "./goal-progress-action-schema.js";
export * from "./goal-event-action-schemas.js";
export * from "./goal-record-action-schema.js";
export * from "./goal-planning-action-schemas.js";
export * from "./goal-tree-action-schemas.js";
export * from "./goal-snapshot-action-schemas.js";
export * from "./goal-policy-action-schemas.js";
export * from "./goal-guidance-action-schemas.js";
export * from "./goal-progress-action-schema.js";
export * from "./goal-entry-actions.js";
export { goalAction, inGoalRelation } from "./goal-action-definition.js";

type GoalListActionInput = Omit<GoalEventDirectoryQuery, "project_id">;
export interface GoalReadActionInput { goal_id: string }
type BusinessInput<Input> = Omit<Input, "project_id" | "actor_id" | "actor_kind">;
const goalInput = object({ goal_id: identifier });
const base = { goal_id: identifier, idempotency_key: identifier }, required = Object.keys(base);


/** Goals' complete shared contracts consumed by Coding and installed plugin clients. The action gateway checks who calls and what it holds; Goals keeps no list of plugins. */
export const goalPluginActions = {
  list: inGoalRelation(goalAction<GoalListActionInput, GoalEventDirectoryPage>("goals.list", "目标目录", "读取当前项目未归档和未丢弃的目标；分页游标来自上次列表结果", "query",
    object({ work_status: { enum: [...goalEventWorkStatuses] }, limit: { type: "integer", minimum: 1, maximum: 100 }, after_cursor: text }, []),
    object({ goals: { type: "array", items: goalDirectoryItemSchema },
      // Installed plugins may read the directory and leave notes; nothing else in Goals is open to them.
      next_cursor: { type: ["string", "null"] }, observed_event_cursor: count }), true), "candidates"),
  /** Version 2 (S8): the output no longer carries the board's name. */
  contract: { ...goalAction<GoalReadActionInput, GoalContractView>("goals.contract.read", "读取目标约定与历史资料",
    "读取指定目标的原始约定、上级覆盖、关系、生效规则、项目长期说明和相关结构提案；包含归档及回收站目标。当前工作状态通过 goals.state.read 读取", "query", goalInput, goalContractSchema, true), version: 2 },
  state: goalAction<GoalReadActionInput, GoalEventStateView>("goals.state.read", "读取目标状态", "读取当前约定、要求、报告摘要、决定及收尾状态；历史正文通过事件读取", "query", goalInput, goalStateSchema, true),
  progress: goalAction<BusinessInput<RecordGoalProgressSummaryInput>, GoalEventProgressResult>("goals.progress.record", "记录目标进展", "记录基于当前目标事件游标的进展与下一步；事务内核对预期 Goal 版本。可附成果引用，引用不代表成果内容已验证", "command",
    object({ ...base, based_on_cursor: count, summary: identifier, next_step: text, next_actor: text,
      source: artifactSource, expected_goal_cursor: count }, [...required, "based_on_cursor", "summary"]),
    goalProgressResultSchema, true),
  receipt: goalAction<GoalReadActionInput & { idempotency_key: string }, GoalEventProgressResult | null>("goals.progress.receipt", "读取进展保存回执", "按当前调用者和原幂等键读取此目标已保存的进展回执；未保存时返回 null，不新建记录", "query",
    object({ goal_id: identifier, idempotency_key: identifier }), nullable(goalProgressResultSchema), true),
} as const;

/** Shared recovery projection; each underlying query retains the caller's authority. */
export async function readGoalResumeFacts(actions: Pick<BoundActionClient, "invoke">, focusGoalIds: readonly string[] = []) {
  const directory = await actions.invoke(goalPluginActions.list, { limit: 100 });
  const goals = [...directory.goals];
  const seen = new Set(goals.map(item => item.goal_id));
  const focus = [...new Set(focusGoalIds.map(id => id.trim()).filter(Boolean))].slice(0, 2);
  for (const goalId of focus) {
    if (seen.has(goalId)) continue;
    const item = await actions.invoke(goalEntryActions.directoryItem, { goal_id: goalId });
    if (item) { goals.push(item); seen.add(goalId); }
  }
  return { goals, observed_event_cursor: directory.observed_event_cursor };
}
