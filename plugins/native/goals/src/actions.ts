import type { ActionDefinition, ActionHandlerBinding, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalEventWorkStatuses, goalIntentSourceKinds, type CreateGoalIntentInput, type CreateGoalIntentResult,
  type GoalEventDirectoryPage, type GoalEventDirectoryQuery, type GoalEventMutationResult, type RecordGoalNoteInput,
  type GoalEventStateView, type GoalEventDirectoryItem, type GoalEventHistoryPage, type GoalEventHistoryQuery, type GoalEventListPage,
  type GoalEventListQuery, type GoalEventTimelinePage, type GoalWorkEventRecord, type GoalEventProgressResult } from "@molis-ai/molis-work-contracts/modules/goals";
import { goalAction as action, goalActor } from "./action-contract.js";
import { goalsEventActions, createGoalsEventActionHandlers, goalProgressResultSchema } from "./event-command-actions.js";
import { goalDecisionAction, createGoalDecisionActionHandler } from "./decision-action.js";
import { goalsPlanningActions, createGoalsPlanningActionHandlers, type GoalsPlanningActionPorts } from "./planning-actions.js";
import { goalsGuidanceActions, createGoalsGuidanceActionHandlers, type GoalsGuidanceActionPorts } from "./guidance-actions.js";
import { goalsLifecycleActions, createGoalsLifecycleActionHandlers, type GoalsLifecycleActionPorts } from "./lifecycle-actions.js";
import { goalsTreeActions, createGoalsTreeActionHandlers } from "./tree-actions.js";
import type { GoalTreeApplicationApi } from "./goal-tree-contract.js";
import { goalsConfigurationActions, createGoalsConfigurationActionHandlers, type GoalsConfigurationActionPorts } from "./configuration-actions.js";
import type { GoalEventApplication } from "./goal-event-application.js";
import { text, identifier, count, boolean, object, nullable, goalStateSchema, goalEventSchema, goalEventPageSchema, goalTimelineSchema,
  goalDirectoryItemSchema, goalHistoryItemSchema, goalHistoryPageSchema } from "./event-action-schemas.js";
import { listGoalDocumentHistory } from "./event-document-model.js";
import { readGoalHistory, type GoalHistoryQueryPorts, type GoalHistoryReadResult } from "./history-query.js";
import type { GoalDocumentHistoryQuery, GoalHistoryTimelinePage } from "./event-history-map.js";
import { goalDocumentAction, createGoalDocumentActionHandler } from "./document-action.js";

export type GoalCreateActionInput = Omit<CreateGoalIntentInput, "board_id" | "actor_id" | "actor_kind">;
export type GoalListActionInput = Omit<GoalEventDirectoryQuery, "board_id">;
export type GoalNoteActionInput = Omit<RecordGoalNoteInput, "board_id" | "actor_id" | "actor_kind">;
export interface GoalReadActionInput { goal_id: string }
const goalInput = object({ goal_id: identifier });
const limit = { type: "integer", minimum: 1, maximum: 100 };

export const goalsActions = {
  ...goalsEventActions,
  ...goalsPlanningActions,
  ...goalsGuidanceActions,
  ...goalsLifecycleActions,
  ...goalsTreeActions,
  ...goalsConfigurationActions,
  decide: goalDecisionAction,
  document: goalDocumentAction,
  progressReceipt: action<GoalReadActionInput & { idempotency_key: string }, GoalEventProgressResult | null>("goals.progress.receipt", "读取进展保存回执", "按当前调用者和原幂等键读取此目标已保存的进展回执；未保存时返回 null，不新建记录", "query",
    object({ goal_id: identifier, idempotency_key: identifier }), nullable(goalProgressResultSchema)),
  list: action<GoalListActionInput, GoalEventDirectoryPage>("goals.list", "目标目录", "读取当前项目未归档和未丢弃的目标；分页游标来自上次列表结果", "query",
    object({ work_status: { enum: [...goalEventWorkStatuses] }, limit: { type: "integer", minimum: 1, maximum: 100 }, after_cursor: text }, []),
    object({ goals: { type: "array", items: goalDirectoryItemSchema },
      next_cursor: { type: ["string", "null"] }, observed_event_cursor: count })),
  state: action<GoalReadActionInput, GoalEventStateView>("goals.state.read", "读取目标状态", "读取当前约定、要求、报告摘要、决定及收尾状态；历史正文通过事件读取", "query", goalInput, goalStateSchema),
  directoryItem: action<GoalReadActionInput, GoalEventDirectoryItem | null>("goals.directory.read", "读取目标目录项", "按目标 ID 读取目录摘要；不存在、已归档或已丢弃时返回 null", "query", goalInput, nullable(goalDirectoryItemSchema)),
  events: action<GoalReadActionInput & GoalEventListQuery, GoalEventListPage>("goals.events.list", "读取目标事件", "按记录顺序读取事件原文；after_cursor 为上次事件分页游标", "query",
    object({ goal_id: identifier, after_cursor: count, limit }, ["goal_id"]), goalEventPageSchema),
  latestEvents: action<GoalReadActionInput & GoalEventHistoryQuery, GoalEventHistoryPage>("goals.events.latest", "读取最近目标事件", "从新到旧读取事件原文；before_cursor 为上次倒序分页游标", "query",
    object({ goal_id: identifier, before_cursor: count, limit }, ["goal_id"]), goalEventPageSchema),
  timeline: action<GoalReadActionInput & GoalEventHistoryQuery, GoalEventTimelinePage>("goals.timeline.list", "读取目标事件时间线", "从新到旧读取当前事件的紧凑索引；使用事件数字游标，不含迁入的旧协议记录", "query",
    object({ goal_id: identifier, before_cursor: count, limit }, ["goal_id"]), goalTimelineSchema),
  event: action<GoalReadActionInput & { event_id: string }, GoalWorkEventRecord>("goals.events.read", "读取目标事件正文", "读取指定目标下的原始事件，包括完整报告字段、类型版本和审计作者", "query",
    object({ goal_id: identifier, event_id: identifier }), goalEventSchema),
  history: action<GoalReadActionInput & GoalDocumentHistoryQuery, GoalHistoryTimelinePage>("goals.history.list", "读取完整目标历史", "合并当前事件和迁入的历史记录；使用返回的字符串游标继续读取", "query",
    object({ goal_id: identifier, before_cursor: text, limit }, ["goal_id"]), goalHistoryPageSchema),
  historyItem: action<GoalReadActionInput & { item_id: string }, GoalHistoryReadResult | null>("goals.history.read", "读取目标历史正文", "读取完整历史列表中的条目及可展示正文；保留迁入记录来源，不存在时返回 null", "query",
    object({ goal_id: identifier, item_id: identifier }), nullable(object({ item: goalHistoryItemSchema, html: text }))),
  create: action<GoalCreateActionInput, CreateGoalIntentResult>("goals.create", "创建目标", "保存目标原始意图、要求及关系；创建本身不会完成目标。重试须保留相同 idempotency_key", "command",
    object({ title: identifier, outcome: text, why: text, business_logic: text, priority: { type: "number", minimum: 0, maximum: 100 },
      goal_id: text, parent_goal_id: text, dependency_goal_ids: { type: "array", items: text },
      requirements: { type: "array", items: object({ requirement_id: text, statement: identifier, human_decision_required: boolean }, ["statement"]) },
      source_kind: { enum: [...goalIntentSourceKinds] }, idempotency_key: identifier }, ["title", "idempotency_key"]),
    object({ goal: object({ goal_id: text, board_id: text, title: text, outcome: text }), replayed: boolean, observed_event_cursor: count,
      recorded: { const: true }, completion_effect: { const: false } })),
  note: action<GoalNoteActionInput, GoalEventMutationResult>("goals.note", "记录目标便笺", "将正文记到指定目标的历史；便笺不会推进状态或代替用户决定。重试须保留相同 idempotency_key", "command",
    object({ goal_id: identifier, body: identifier, idempotency_key: identifier }),
    object({ event_id: text, observed_event_cursor: count, replayed: boolean, recorded: { const: true } })),
} as const;

export const GOALS_ACTIONS: readonly ActionDefinition[] = Object.values(goalsActions);
export const GOALS_ACTION_PERMISSIONS = ["goals:read", "goals:write", "goals:decide"] as const;

/** Shared recovery projection; each underlying query retains the caller's authority. */
export async function readGoalResumeFacts(actions: Pick<BoundActionClient, "invoke">, focusGoalIds: readonly string[] = []) {
  const directory = await actions.invoke(goalsActions.list, { limit: 100 });
  const goals = [...directory.goals];
  const seen = new Set(goals.map(item => item.goal_id));
  const focus = [...new Set(focusGoalIds.map(id => id.trim()).filter(Boolean))].slice(0, 2);
  for (const goalId of focus) {
    if (seen.has(goalId)) continue;
    const item = await actions.invoke(goalsActions.directoryItem, { goal_id: goalId });
    if (item) { goals.push(item); seen.add(goalId); }
  }
  return { goals, observed_event_cursor: directory.observed_event_cursor };
}

/** The plugin keeps its original transaction, event history and idempotency owner. */
export function createGoalsActionHandlers({ events, boardId, history, planning, guidance, lifecycle, tree, configuration, readGoal }: {
  events: GoalEventApplication; boardId: string; history: GoalHistoryQueryPorts; planning: GoalsPlanningActionPorts;
  guidance: GoalsGuidanceActionPorts; lifecycle: GoalsLifecycleActionPorts; tree: GoalTreeApplicationApi; configuration: GoalsConfigurationActionPorts;
  readGoal: Parameters<typeof createGoalDocumentActionHandler>[1]["goal"];
}): ActionHandlerBinding[] {
  return [
    createGoalDocumentActionHandler(boardId, { goal: readGoal, events, history, planning: planning.planning }),
    ...createGoalsEventActionHandlers(events, boardId),
    ...createGoalsPlanningActionHandlers(planning, boardId),
    ...createGoalsGuidanceActionHandlers(guidance, boardId),
    ...createGoalsLifecycleActionHandlers(lifecycle, boardId),
    ...createGoalsTreeActionHandlers(tree, boardId),
    ...createGoalsConfigurationActionHandlers(configuration, boardId),
    createGoalDecisionActionHandler(events, boardId),
    { ...goalsActions.progressReceipt, handle: (caller, input) => {
      const query = input as GoalReadActionInput & { idempotency_key: string };
      return events.readProgressReceipt(boardId, query.goal_id, goalActor(caller).actor_id, query.idempotency_key);
    } },
    { ...goalsActions.list, handle: (_caller, input) => events.listGoals({ ...(input as GoalListActionInput), board_id: boardId }) },
    { ...goalsActions.state, handle: (_caller, input) => events.readState(boardId, (input as GoalReadActionInput).goal_id) },
    { ...goalsActions.directoryItem, handle: (_caller, input) => events.readDirectoryItem(boardId, (input as GoalReadActionInput).goal_id) },
    { ...goalsActions.events, handle: (_caller, input) => { const { goal_id, ...query } = input as GoalReadActionInput & GoalEventListQuery; return events.listEvents(boardId, goal_id, query); } },
    { ...goalsActions.latestEvents, handle: (_caller, input) => { const { goal_id, ...query } = input as GoalReadActionInput & GoalEventHistoryQuery; return events.listLatestEvents(boardId, goal_id, query); } },
    { ...goalsActions.timeline, handle: (_caller, input) => { const { goal_id, ...query } = input as GoalReadActionInput & GoalEventHistoryQuery; return events.listLatestTimeline(boardId, goal_id, query); } },
    { ...goalsActions.event, handle: (_caller, input) => { const query = input as GoalReadActionInput & { event_id: string }; return events.readEvent(boardId, query.goal_id, query.event_id); } },
    { ...goalsActions.history, handle: (_caller, input) => { const { goal_id, ...query } = input as GoalReadActionInput & GoalDocumentHistoryQuery;
      return listGoalDocumentHistory({ boardId, goalId: goal_id, ports: events, snapshot: history.snapshot(), events: history.journalEvents(), query }); } },
    { ...goalsActions.historyItem, handle: (_caller, input) => { const query = input as GoalReadActionInput & { item_id: string };
      return readGoalHistory({ boardId, goalId: query.goal_id, itemId: query.item_id, ports: events, snapshot: history.snapshot(), events: history.journalEvents() }); } },
    { ...goalsActions.create, handle: (caller, input) => {
      const payload = input as GoalCreateActionInput;
      return events.createIntent({ ...payload, board_id: boardId,
        source_kind: payload.source_kind ?? (caller.audience === "user" ? "web" : "runtime"),
        ...goalActor(caller) });
    } },
    { ...goalsActions.note, handle: (caller, input) => events.recordNote({ ...(input as GoalNoteActionInput), board_id: boardId,
      ...goalActor(caller) }) },
  ];
}
