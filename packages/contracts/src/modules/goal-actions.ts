import type { ActionAudience, ActionDefinition, ActionSchema } from "../platform/actions.js";
import { goalEventWorkStatuses, type GoalEventDirectoryQuery, type GoalEventDirectoryPage, type GoalContractView, type GoalEventStateView, type RecordGoalProgressSummaryInput, type GoalEventProgressResult } from "./goals.js";
import { text, identifier, count, object, nullable, array, goalDirectoryItemSchema, artifactSource } from "./goal-event-action-schemas.js";
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

type GoalListActionInput = Omit<GoalEventDirectoryQuery, "project_id">;
interface GoalReadActionInput { goal_id: string }
type BusinessInput<Input> = Omit<Input, "project_id" | "actor_id" | "actor_kind">;
const goalInput = object({ goal_id: identifier });
const base = { goal_id: identifier, idempotency_key: identifier }, required = Object.keys(base);

/** `plugins` opens one action to installed plugins too (still under the plugin's own granted permissions).
 * Every Goals write is authored by a Session when a Runtime makes it. */
export function goalAction<Input, Output>(id: string, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema, plugins = false): ActionDefinition<Input, Output> {
  const audiences: ActionAudience[] = ["user", "agent", "workflow", "mcp", ...(plugins ? ["plugin" as const] : [])];
  return { capability_id: id, version: 1, operation, action: { title, description,
    kind: operation === "query" ? "query" : "operation", scope: "project", audiences, ...(operation === "command" ? { authorship: "session" as const } : {}),
    permissions: [operation === "query" ? "goals:read" : "goals:write"], subject_kinds: ["goal"], input_schema: input, output_schema: output } };
}


/** Goals' complete shared contracts consumed by Coding and installed plugin clients. Permission and trusted caller checks stay at the owner. */
export const goalPluginActions = {
  list: goalAction<GoalListActionInput, GoalEventDirectoryPage>("goals.list", "目标目录", "读取当前项目未归档和未丢弃的目标；分页游标来自上次列表结果", "query",
    object({ work_status: { enum: [...goalEventWorkStatuses] }, limit: { type: "integer", minimum: 1, maximum: 100 }, after_cursor: text }, []),
    object({ goals: { type: "array", items: goalDirectoryItemSchema },
      // Installed plugins may read the directory and leave notes; nothing else in Goals is open to them.
      next_cursor: { type: ["string", "null"] }, observed_event_cursor: count }), true),
  contract: goalAction<GoalReadActionInput, GoalContractView>("goals.contract.read", "读取目标约定与历史资料",
    "读取指定目标的原始约定、上级覆盖、关系、生效规则、项目长期说明和相关结构提案；包含归档及回收站目标。当前工作状态通过 goals.state.read 读取", "query", goalInput, goalContractSchema, true),
  state: goalAction<GoalReadActionInput, GoalEventStateView>("goals.state.read", "读取目标状态", "读取当前约定、要求、报告摘要、决定及收尾状态；历史正文通过事件读取", "query", goalInput, goalStateSchema, true),
  progress: goalAction<BusinessInput<RecordGoalProgressSummaryInput>, GoalEventProgressResult>("goals.progress.record", "记录目标进展", "记录基于当前目标事件游标的进展与下一步；事务内核对预期 Goal 版本。可附成果引用，引用不代表成果内容已验证", "command",
    object({ ...base, based_on_cursor: count, summary: identifier, next_step: text, next_actor: text,
      source: artifactSource, expected_goal_cursor: count }, [...required, "based_on_cursor", "summary"]),
    goalProgressResultSchema, true),
  receipt: goalAction<GoalReadActionInput & { idempotency_key: string }, GoalEventProgressResult | null>("goals.progress.receipt", "读取进展保存回执", "按当前调用者和原幂等键读取此目标已保存的进展回执；未保存时返回 null，不新建记录", "query",
    object({ goal_id: identifier, idempotency_key: identifier }), nullable(goalProgressResultSchema), true),
} as const;
