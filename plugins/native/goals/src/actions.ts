import { goalEntryActions, goalPluginActions, type GoalCreateActionInput, type GoalReadActionInput } from "./contract/goal-actions.js";
export type { GoalCreateActionInput } from "./contract/goal-actions.js";
export type { GoalReadActionInput } from "./contract/goal-actions.js";
import { ActionError, defineArtifactLinkSubjectsAction, defineSearchEntriesAction, defineSubjectContextAction, searchEntriesPage, searchText, subjectContext, type ArtifactLinkSubjectsInput, type SearchEntriesInput, type SearchEntry } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ActionDefinition, ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { type GoalEventAcknowledgementsApi, type GoalEventDirectoryQuery, type GoalEventMutationResult, type RecordGoalNoteInput, type GoalEventHistoryPage, type GoalEventHistoryQuery, type GoalEventListPage, type GoalEventListQuery, type GoalEventTimelinePage, type GoalWorkEventRecord } from "./contract/goals.js";
import { goalAction as action, goalActor, personAsked } from "./action-contract.js";
import { goalsFragmentOffersAction, prepareGoalsFragmentOffers } from "./fragment-offers.js";
import type { FragmentOffersInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalsEventActions, createGoalsEventActionHandlers } from "./event-command-actions.js";
import { goalsAcknowledgeActions, createGoalsAcknowledgeActionHandlers } from "./acknowledge-actions.js";
import { goalDecisionAction, createGoalDecisionActionHandler } from "./decision-action.js";
import { goalsPlanningActions, createGoalsPlanningActionHandlers, type GoalsPlanningActionPorts } from "./planning-actions.js";
import { goalsGuidanceActions, createGoalsGuidanceActionHandlers, type GoalsGuidanceActionPorts } from "./guidance-actions.js";
import { goalsLifecycleActions, createGoalsLifecycleActionHandlers, type GoalsLifecycleActionPorts } from "./lifecycle-actions.js";
import { goalsTreeActions, createGoalsTreeActionHandlers } from "./tree-actions.js";
import type { GoalTreeApplicationApi } from "./goal-tree-contract.js";
import { goalsConfigurationActions, createGoalsConfigurationActionHandlers, type GoalsConfigurationActionPorts } from "./configuration-actions.js";
import type { GoalEventApplication } from "./goal-event-application.js";
import { text, identifier, count, boolean, object, nullable, goalEventSchema, goalEventPageSchema, goalTimelineSchema, goalHistoryItemSchema, goalHistoryPageSchema } from "./contract/goal-actions.js";
import { listGoalDocumentHistory } from "./event-document-model.js";
import { readGoalHistory, type GoalHistoryQueryPorts, type GoalHistoryReadResult } from "./history-query.js";
import type { GoalDocumentHistoryQuery, GoalHistoryTimelinePage } from "./event-history-map.js";
import { goalDocumentAction, createGoalDocumentActionHandler, readGoalDocument } from "./document-action.js";
import { goalsStageAction, createGoalsStageActionHandler } from "./stage-action.js";
import { buildGoalsDocumentCollection } from "./document-collection.js";
import type { GoalContractView } from "./goal-entry-contract.js";

import { goalsBoardActions, createGoalsBoardActionHandlers } from "./library-actions.js";
import { goalsInputActions, createGoalsInputActionHandlers } from "./input-actions.js";
import { goalsDeliverableActions, goalsArtifactInputActions, createGoalsDeliverableActionHandlers, type GoalDeliverablePorts } from "./deliverable-actions.js";
import { boundGoalObjects } from "./input-actions.js";
export { goalsDeliverableActions, goalsArtifactInputActions, createGoalsDeliverableActionHandlers, type GoalDeliverable, type GoalDeliverablePorts } from "./deliverable-actions.js";
import type { GoalsBoardPorts } from "./library-actions.js";
import { goalsCollectionAction, createGoalsCollectionActionHandler } from "./collection-action.js";
import type { GoalsDocumentReadPorts } from "./document-read-ports.js";

export type GoalListActionInput = Omit<GoalEventDirectoryQuery, "project_id">;
export type GoalNoteActionInput = Omit<RecordGoalNoteInput, "project_id" | "actor_id" | "actor_kind">;
const limit = { type: "integer", minimum: 1, maximum: 100 };

export const goalsActions = {
  subject: defineSubjectContextAction("goals.subject.read", "goal", "目标上下文", ["goals:read"]),
  /** System search: every current Goal with the same revision its context reader reports. */
  searchEntries: defineSearchEntriesAction("goals.search.entries", [{ kind: "goal", title: "目标", surface: "goals" }], "目标", ["goals:read"]),
  /** What part of anything the person has in hand can do for Goals (specs/archive/contextual-interaction). */
  fragmentOffers: goalsFragmentOffersAction,
  /** 「被谁引用」 in the 成果库 (BL-646): the current Goals behind the link kinds Goals declares, by title; others are left out. */
  linkSubjects: defineArtifactLinkSubjectsAction("goals.artifacts.link_subjects", "目标", ["goals:read"]),
  ...goalsBoardActions,
  ...goalsEventActions,
  ...goalsAcknowledgeActions,
  inputsBind: goalsInputActions.bind,
  inputsConfirm: goalsInputActions.confirm,
  inputsAccept: goalsInputActions.accept,
  inputsRelease: goalsInputActions.release,
  inputsList: goalsInputActions.list,
  deliverablesAdd: goalsDeliverableActions.add,
  deliverablesRemove: goalsDeliverableActions.remove,
  deliverablesList: goalsDeliverableActions.list,
  deliverablesPin: goalsDeliverableActions.pin,
  deliverablesCandidates: goalsDeliverableActions.candidates,
  artifactInputsAdd: goalsArtifactInputActions.add,
  artifactInputsRemove: goalsArtifactInputActions.remove,
  artifactInputsList: goalsArtifactInputActions.list,
  artifactInputsPin: goalsArtifactInputActions.pin,
  ...goalsPlanningActions,
  ...goalsGuidanceActions,
  ...goalsLifecycleActions,
  ...goalsTreeActions,
  ...goalsConfigurationActions,
  decide: goalDecisionAction,
  document: goalDocumentAction,
  collection: goalsCollectionAction,
  stage: goalsStageAction,
  snapshot: goalEntryActions.snapshot,
  contract: goalPluginActions.contract,
  progressReceipt: goalPluginActions.receipt,
  list: goalPluginActions.list,
  state: goalPluginActions.state,
  directoryItem: goalEntryActions.directoryItem,
  events: { ...action<GoalReadActionInput & GoalEventListQuery, GoalEventListPage>("goals.events.list", "读取目标事件", "按记录顺序读取事件原文；after_cursor 为上次事件分页游标", "query",
    object({ goal_id: identifier, after_cursor: count, limit }, ["goal_id"]), goalEventPageSchema), version: 2 },
  latestEvents: { ...action<GoalReadActionInput & GoalEventHistoryQuery, GoalEventHistoryPage>("goals.events.latest", "读取最近目标事件", "从新到旧读取事件原文；before_cursor 为上次倒序分页游标", "query",
    object({ goal_id: identifier, before_cursor: count, limit }, ["goal_id"]), goalEventPageSchema), version: 2 },
  timeline: action<GoalReadActionInput & GoalEventHistoryQuery, GoalEventTimelinePage>("goals.timeline.list", "读取目标事件时间线", "从新到旧读取当前事件的紧凑索引；使用事件数字游标，不含 Goals 日志里的建立、更新、确认和关系记录（完整历史见 goals.history.list）", "query",
    object({ goal_id: identifier, before_cursor: count, limit }, ["goal_id"]), goalTimelineSchema),
  event: { ...action<GoalReadActionInput & { event_id: string }, GoalWorkEventRecord>("goals.events.read", "读取目标事件正文", "读取指定目标下的原始事件，包括完整报告字段、类型版本和审计作者", "query",
    object({ goal_id: identifier, event_id: identifier }), goalEventSchema), version: 2 },
  history: action<GoalReadActionInput & GoalDocumentHistoryQuery, GoalHistoryTimelinePage>("goals.history.list", "读取完整目标历史", "合并当前事件与 Goals 日志里的建立、更新、确认和关系记录；使用返回的字符串游标继续读取", "query",
    object({ goal_id: identifier, before_cursor: text, limit }, ["goal_id"]), goalHistoryPageSchema),
  historyItem: action<GoalReadActionInput & { item_id: string }, GoalHistoryReadResult | null>("goals.history.read", "读取目标历史正文", "读取完整历史列表中的条目及可展示正文；标明来自事件还是 Goals 日志，不存在时返回 null", "query",
    object({ goal_id: identifier, item_id: identifier }), nullable(object({ item: goalHistoryItemSchema, html: text }))),
  create: goalEntryActions.create,
  note: action<GoalNoteActionInput, GoalEventMutationResult>("goals.note", "记录目标便笺", "将正文记到指定目标的历史；便笺不会推进状态或代替用户决定。重试须保留相同 idempotency_key", "command",
    object({ goal_id: identifier, body: identifier, idempotency_key: identifier }),
    object({ event_id: text, observed_event_cursor: count, replayed: boolean, recorded: { const: true } }), true),
} as const;

export const GOALS_ACTIONS: readonly ActionDefinition[] = Object.values(goalsActions);
/** What the person on this machine holds for Goals: the Goal permissions, and the service permissions its tree, link and deliverable actions declare (`usingServices`). */
export const GOALS_ACTION_PERMISSIONS = ["goals:read", "goals:write", "goals:decide", "attention:write", "context-ledger:write", "artifacts:read"] as const;

/** The plugin keeps its original transaction, event history and idempotency owner. */
export function createGoalsActionHandlers({ events, acknowledgements, projectId, history, planning, guidance, lifecycle, tree, configuration, readGoal, readContract, collection, board, deliverables }: {
  events: GoalEventApplication; acknowledgements: GoalEventAcknowledgementsApi; projectId: string; history: GoalHistoryQueryPorts; planning: GoalsPlanningActionPorts;
  guidance: GoalsGuidanceActionPorts; lifecycle: GoalsLifecycleActionPorts; tree: GoalTreeApplicationApi; configuration: GoalsConfigurationActionPorts;
  readGoal: Parameters<typeof createGoalDocumentActionHandler>[1]["goal"];
  readContract(goalId: string): GoalContractView;
  collection: GoalsDocumentReadPorts;
  board: GoalsBoardPorts;
  /** The 成果库 and context ledger for a Goal's deliverables (artifact-positioning A5), and the owners that pin work objects. */
  deliverables: Omit<GoalDeliverablePorts, "projectId" | "goalExists" | "boundObjects">;
}): ActionHandlerBinding[] {
  const goalExists = (goalId: string) => Boolean(readGoal(goalId) && events.readDirectoryItem(projectId, goalId));
  const currentGoal = (goalId: string) => {
    try { return goalExists(goalId) ? readGoal(goalId) : null; } catch (error) {
      if (error instanceof ActionError && error.code === "goals.not_found") return null;
      throw error;
    }
  };
  return [
    ...createGoalsDeliverableActionHandlers({ ...deliverables, projectId, goalExists, boundObjects: goalId => boundGoalObjects(collection.inputs.list(projectId), goalId) }),
    ...createGoalsInputActionHandlers(projectId, collection.inputs, goalId => Boolean(readGoal(goalId) && events.readDirectoryItem(projectId, goalId))),
    { ...goalsActions.subject, handle: (_caller, input) => {
      const id = (input as { subject_id: string }).subject_id;
      const goal = readGoal(id);
      if (!goal || !events.readDirectoryItem(projectId, id)) throw new ActionError("actions.subject_unavailable", "当前目标已不存在或已归档");
      const state = events.readState(projectId, id);
      return subjectContext({ subject: { kind: "goal", id }, revision: `${goal.updated_at}:${state.goal_event_cursor}`, title: goal.title,
        content: [state.intent.title, state.intent.why, state.intent.business_logic, goal.outcome, `当前工作状态：${state.work_status}`, state.progress_summary?.summary, state.progress_summary?.next_step].filter(Boolean).join("\n\n"), goal_ids: [id],
        open: { surface: "goals", id } });
    } },
    // An id that is no current Goal (gone, archived, never one) is left out; the 成果库 shows it by id. One such id never fails the rest.
    { ...goalsActions.linkSubjects, handle: (_caller, input) => ({ objects: (input as ArtifactLinkSubjectsInput).ids.flatMap(id => {
      const goal = currentGoal(id);
      return goal ? [{ id, title: goal.title, open: { surface: "goals", id } }] : [];
    }) }) },
    { ...goalsActions.fragmentOffers, handle: (_caller, input) => ({ offers: prepareGoalsFragmentOffers(input as FragmentOffersInput, { cursor: goalId => {
      try { return readGoal(goalId) && events.readDirectoryItem(projectId, goalId) ? events.readState(projectId, goalId).goal_event_cursor : null; } catch { return null; }
    } }) }) },
    // Synchronous on purpose: the handler runs inside the plugin's database window, which refuses a body that returns a promise.
    { ...goalsActions.searchEntries, handle: (_caller, input) => {
      const entries: SearchEntry[] = [];
      let after: string | undefined;
      do {
        const page = events.listGoals({ project_id: projectId, limit: 100, ...(after ? { after_cursor: after } : {}) });
        for (const item of page.goals) {
          const goal = readGoal(item.goal_id);
          if (!goal) continue;
          const state = events.readState(projectId, item.goal_id);
          entries.push({ subject: { kind: "goal", id: item.goal_id }, revision: `${goal.updated_at}:${state.goal_event_cursor}`, title: goal.title,
            summary: searchText(state.progress_summary?.summary ?? item.next_hint, 400), updated_at: item.updated_at, content: "context", open: { surface: "goals", id: item.goal_id } });
        }
        after = page.next_cursor ?? undefined;
      } while (after);
      return searchEntriesPage(entries, input as SearchEntriesInput);
    } },
    ...createGoalsBoardActionHandlers(projectId, board),
    createGoalsCollectionActionHandler(projectId, collection),
    createGoalsStageActionHandler({ collection: () => buildGoalsDocumentCollection(collection, projectId),
      document: goalId => readGoalDocument(projectId, { goal: readGoal, events, history, planning: planning.planning }, goalId) }),
    { ...goalsActions.snapshot, handle: () => history.snapshot() },
    { ...goalsActions.contract, handle: (_caller, input) => readContract((input as GoalReadActionInput).goal_id) },
    createGoalDocumentActionHandler(projectId, { goal: readGoal, events, history, planning: planning.planning }),
    ...createGoalsEventActionHandlers(events, projectId),
    ...createGoalsAcknowledgeActionHandlers(acknowledgements, projectId),
    ...createGoalsPlanningActionHandlers(planning, projectId),
    ...createGoalsGuidanceActionHandlers(guidance, projectId),
    ...createGoalsLifecycleActionHandlers(lifecycle, projectId),
    ...createGoalsTreeActionHandlers(tree, projectId),
    ...createGoalsConfigurationActionHandlers(configuration, projectId),
    createGoalDecisionActionHandler(events, projectId),
    { ...goalsActions.progressReceipt, handle: (caller, input) => {
      const query = input as GoalReadActionInput & { idempotency_key: string };
      return events.readProgressReceipt(projectId, query.goal_id, goalActor(caller).actor_id, query.idempotency_key);
    } },
    { ...goalsActions.list, handle: (_caller, input) => events.listGoals({ ...(input as GoalListActionInput), project_id: projectId }) },
    { ...goalsActions.state, handle: (_caller, input) => events.readState(projectId, (input as GoalReadActionInput).goal_id) },
    { ...goalsActions.directoryItem, handle: (_caller, input) => events.readDirectoryItem(projectId, (input as GoalReadActionInput).goal_id) },
    { ...goalsActions.events, handle: (_caller, input) => { const { goal_id, ...query } = input as GoalReadActionInput & GoalEventListQuery; return events.listEvents(projectId, goal_id, query); } },
    { ...goalsActions.latestEvents, handle: (_caller, input) => { const { goal_id, ...query } = input as GoalReadActionInput & GoalEventHistoryQuery; return events.listLatestEvents(projectId, goal_id, query); } },
    { ...goalsActions.timeline, handle: (_caller, input) => { const { goal_id, ...query } = input as GoalReadActionInput & GoalEventHistoryQuery; return events.listLatestTimeline(projectId, goal_id, query); } },
    { ...goalsActions.event, handle: (_caller, input) => { const query = input as GoalReadActionInput & { event_id: string }; return events.readEvent(projectId, query.goal_id, query.event_id); } },
    { ...goalsActions.history, handle: (_caller, input) => { const { goal_id, ...query } = input as GoalReadActionInput & GoalDocumentHistoryQuery;
      return listGoalDocumentHistory({ projectId, goalId: goal_id, ports: events, snapshot: history.snapshot(), events: history.journalEvents(), query }); } },
    { ...goalsActions.historyItem, handle: (_caller, input) => { const query = input as GoalReadActionInput & { item_id: string };
      return readGoalHistory({ projectId, goalId: query.goal_id, itemId: query.item_id, ports: events, snapshot: history.snapshot(), events: history.journalEvents() }); } },
    { ...goalsActions.create, handle: (caller, input) => {
      const payload = input as GoalCreateActionInput;
      // The creation channel is a fact about who asked: only the person may name one (directly, or through the action of the plugin that owns
      // the channel they called); any other caller is a Runtime.
      const person = personAsked(caller, payload.source_kind);
      if (!person && payload.source_kind !== undefined && payload.source_kind !== "runtime") {
        throw new ActionError("actions.input_invalid", "只有本人可以指定 Goal 的创建渠道");
      }
      return events.createIntent({ ...payload, project_id: projectId,
        source_kind: person ? payload.source_kind ?? "web" : "runtime",
        ...goalActor(caller) });
    } },
    { ...goalsActions.note, handle: (caller, input) => events.recordNote({ ...(input as GoalNoteActionInput), project_id: projectId,
      ...goalActor(caller) }) },
  ];
}
