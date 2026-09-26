import type {
  GoalEventStateView,
  GoalEventTimelineItem,
  GoalEventTypeDefinition,
  GoalRecord,
  GoalRelationRecord,
  PlanningMethodPack,
  RiskRecord,
} from "@molis-ai/molis-work-contracts/modules/goals";
import type { ReviewObligationRecord } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { GoalEventApplication } from "./goal-event-application.js";
import type { GoalsDecisionEvent } from "./decision-view.js";
import type { BoardSnapshot } from "./goal-entry-contract.js";
import {
  compareHistoryItems,
  indexItemFromTimeline,
  mapJournalHistoryItems,
  mapLegacyHistoryItems,
  mergeGoalHistoryItems,
  mixedPageIsStable,
  parseHistoryItemId,
  relatedHistoryObjectIds,
  type GoalDocumentHistoryQuery,
  type GoalHistoryIndexItem,
  type GoalHistoryTimelinePage,
} from "./event-history-map.js";
import type { GoalDisplayStatus, GoalPresentationState } from "./tree-order.js";

const TIMELINE_PAGE = 40;

export interface GoalEventDocumentView {
  state: GoalEventStateView;
  timeline: GoalHistoryTimelinePage;
  description: {
    title: string;
    outcome: string;
    why: string;
    business_logic: string;
    in_scope: string[];
    out_of_scope: string[];
    constraints: string[];
    required_inputs: string[];
    promised_outputs: string[];
  };
  relations: GoalRelationRecord[];
  risks: RiskRecord[];
  planning_methods: PlanningMethodPack[];
  transfer: {
    available: boolean;
    kind: "resume_cancelled" | "reopen_event_completed" | null;
  };
  types: GoalEventTypeDefinition[];
}

export type GoalEventDocumentPorts = Pick<
  GoalEventApplication,
  "readState" | "listLatestTimeline" | "isEventStateOwner" | "readEvent"
>;

export function listGoalDocumentHistory(input: {
  boardId: string;
  goalId: string;
  ports: GoalEventDocumentPorts;
  snapshot: BoardSnapshot;
  events?: readonly GoalsDecisionEvent[];
  query?: GoalDocumentHistoryQuery;
}): GoalHistoryTimelinePage {
  const query = input.query ?? {};
  const limit = Number.isInteger(query.limit) && (query.limit ?? 0) > 0
    ? Math.min(query.limit!, 100)
    : TIMELINE_PAGE;
  const related = relatedHistoryObjectIds(input.snapshot, input.goalId);
  const journal = (input.events ?? []).filter((event) => related.has(event.object_id));
  const legacyMapped = mapLegacyHistoryItems({
    runs: input.snapshot.runs.filter((item) => item.goal_id === input.goalId),
    evidence: input.snapshot.evidence.filter((item) => item.goal_id === input.goalId),
    reviews: input.snapshot.reviews.filter((item) => item.goal_id === input.goalId),
    obligations: input.snapshot.review_obligations.filter((item) => item.goal_id === input.goalId),
  });
  let cursorItem: GoalHistoryIndexItem | null = null;
  if (query.before_cursor) {
    cursorItem = findHistoryIndexItem(input, query.before_cursor);
    if (!cursorItem) {
      return {
        items: [],
        next_cursor: null,
        observed_event_cursor: input.ports.listLatestTimeline(input.boardId, input.goalId, { limit: 1 }).observed_event_cursor,
      };
    }
  }
  let workBefore: number | undefined = cursorItem?.source === "event_work" ? cursorItem.journal_seq : undefined;
  const workItems: GoalEventTimelineItem[] = [];
  let observed = 0;
  for (;;) {
    const result = input.ports.listLatestTimeline(input.boardId, input.goalId, { before_cursor: workBefore, limit: 100 });
    observed = result.observed_event_cursor;
    workItems.push(...result.items);
    const workIds = new Set(workItems.map((item) => item.event_id));
    if (cursorItem?.event_id) workIds.add(cursorItem.event_id);
    let merged = mergeGoalHistoryItems({
      work: { items: workItems, observed_event_cursor: observed },
      legacy: [...legacyMapped, ...mapJournalHistoryItems(journal, workIds, input.snapshot)],
    });
    if (cursorItem) merged = merged.filter((item) => compareHistoryItems(item, cursorItem) > 0);
    const pageItems = merged.slice(0, limit);
    const workExhausted = result.next_cursor == null;
    const oldestWork = workItems.length ? indexItemFromTimeline(workItems[workItems.length - 1]!) : undefined;
    const pageLast = pageItems[pageItems.length - 1];
    const stable = workExhausted || mixedPageIsStable(pageLast, oldestWork);
    if (!workExhausted && (pageItems.length < limit || !stable)) {
      workBefore = result.next_cursor ?? undefined;
      continue;
    }
    const hasMore = merged.length > pageItems.length || (!workExhausted && pageItems.length === limit);
    return {
      items: pageItems,
      next_cursor: hasMore && pageLast ? pageLast.item_id : null,
      observed_event_cursor: observed,
    };
  }
}

export function findHistoryIndexItem(
  input: Parameters<typeof listGoalDocumentHistory>[0],
  itemId: string,
): GoalHistoryIndexItem | null {
  const snapshot = input.snapshot;
  const goalId = input.goalId;
  const related = relatedHistoryObjectIds(snapshot, goalId);
  const journal = (input.events ?? []).filter((event) => related.has(event.object_id));
  const parsed = parseHistoryItemId(itemId);
  const originalId = parsed?.original_id ?? itemId;
  if (!parsed) {
    try {
      const event = input.ports.readEvent(input.boardId, goalId, originalId);
      return indexItemFromTimeline({
        event_id: event.event_id,
        journal_seq: event.journal_seq,
        received_at: event.received_at,
        title: event.title,
        kind: event.kind,
        type_id: event.kind === "report" ? event.type?.type_id ?? null : null,
        type_name: event.kind === "report" ? event.type?.name ?? null : event.kind === "configuration" ? "配置" : "系统",
        semantic_family: event.kind === "report" ? event.type?.semantic_family ?? null : null,
        actor_id: event.actor_id,
        actor_kind: event.actor_kind,
      });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
      if (code && code !== "event.not_found") throw error;
    }
  }
  if (parsed?.source === "legacy_run" || (!parsed && snapshot.runs.some((row) => row.run_id === originalId && row.goal_id === goalId))) {
    const run = snapshot.runs.find((row) => row.run_id === originalId && row.goal_id === goalId);
    return run ? mapLegacyHistoryItems({ runs: [run], evidence: [], reviews: [] })[0] ?? null : null;
  }
  if (parsed?.source === "legacy_evidence" || (!parsed && snapshot.evidence.some((row) => row.evidence_id === originalId && row.goal_id === goalId))) {
    const evidence = snapshot.evidence.find((row) => row.evidence_id === originalId && row.goal_id === goalId);
    return evidence ? mapLegacyHistoryItems({ runs: [], evidence: [evidence], reviews: [] })[0] ?? null : null;
  }
  if (parsed?.source === "legacy_review" || (!parsed && snapshot.reviews.some((row) => row.review_id === originalId && row.goal_id === goalId))) {
    const review = snapshot.reviews.find((row) => row.review_id === originalId && row.goal_id === goalId);
    const obligations = snapshot.review_obligations.filter((row) => row.goal_id === goalId);
    return review ? mapLegacyHistoryItems({ runs: [], evidence: [], reviews: [review], obligations })[0] ?? null : null;
  }
  const event = journal.find((row) => row.event_id === originalId);
  if ((parsed?.source === "legacy_record" || !parsed) && event) {
    return mapJournalHistoryItems([event], new Set(), input.snapshot)[0] ?? null;
  }
  return null;
}

export function createGoalEventDocumentView(input: {
  boardId: string;
  goal: GoalRecord;
  ports: GoalEventDocumentPorts;
  snapshot: BoardSnapshot;
  relations: readonly GoalRelationRecord[];
  risks: readonly RiskRecord[];
  events?: readonly GoalsDecisionEvent[];
  planning_methods?: readonly PlanningMethodPack[];
}): GoalEventDocumentView {
  const state = input.ports.readState(input.boardId, input.goal.goal_id);
  const timeline = listGoalDocumentHistory({
    boardId: input.boardId,
    goalId: input.goal.goal_id,
    ports: input.ports,
    snapshot: input.snapshot,
    events: input.events,
  });
  const owned = state.owner != null;
  return {
    state,
    timeline,
    description: {
      title: input.goal.title,
      outcome: input.goal.outcome,
      why: input.goal.why,
      business_logic: input.goal.business_logic,
      in_scope: [...input.goal.in_scope],
      out_of_scope: [...input.goal.out_of_scope],
      constraints: [...input.goal.constraints],
      required_inputs: [...input.goal.required_inputs],
      promised_outputs: [...input.goal.promised_outputs],
    },
    relations: [...input.relations],
    risks: [...input.risks],
    planning_methods: [...(input.planning_methods ?? [])],
    transfer: transferFor(owned, state.work_status),
    types: state.config.types,
  };
}

function transferFor(owned: boolean, workStatus: GoalEventStateView["work_status"]): GoalEventDocumentView["transfer"] {
  if (!owned) return { available: false, kind: null };
  if (workStatus === "cancelled") return { available: true, kind: "resume_cancelled" };
  if (workStatus === "completed") return { available: true, kind: "reopen_event_completed" };
  return { available: false, kind: null };
}

export function eventDirectoryPresentation(state: GoalEventStateView, _goal?: Pick<GoalRecord, "fulfillment_state">): {
  event_work: boolean;
  status: GoalPresentationState;
  display_status: GoalDisplayStatus;
  status_label: string;
  main_action_label: string;
  action_summary: string;
} | null {
  if (!state.owner) return null;
  if (state.work_status === "completed") {
    return {
      event_work: true,
      status: "satisfied",
      display_status: "completed",
      status_label: "已完成",
      main_action_label: "显式继续",
      action_summary: state.closure?.result || state.agreement.outcome || "已有明确完成结论。如需新一轮，打开「继续此目标」并填写原因。",
    };
  }
  if (state.work_status === "cancelled") {
    return {
      event_work: true,
      status: "invalidated",
      display_status: "continue",
      status_label: "已取消",
      main_action_label: "显式继续",
      action_summary: "已取消的 Goal 需要显式继续，不会被普通记录自动恢复。",
    };
  }
  if (state.pending_decisions.length) {
    return {
      event_work: true,
      status: "waiting_for_human",
      display_status: "waiting_user",
      status_label: "需要你决定",
      main_action_label: "作出决定",
      action_summary: state.pending_decisions[0]!.question,
    };
  }
  const blocking = state.concerns.filter((item) => item.status === "open" && item.blocks_closure);
  if (blocking.length) {
    return {
      event_work: true,
      status: "execution_blocked",
      display_status: "blocked",
      status_label: "受阻",
      main_action_label: "处理问题",
      action_summary: blocking[0]!.title,
    };
  }
  const next = state.progress_summary?.next_step?.trim();
  if (next) {
    return {
      event_work: true,
      status: "executing",
      display_status: "in_progress",
      status_label: "正在推进",
      main_action_label: "记录进展",
      action_summary: next,
    };
  }
  return {
    event_work: true,
    status: "execution_pending",
    display_status: "continue",
    status_label: state.latest_reports.length || state.progress_summary ? "待继续" : "待开始",
    main_action_label: state.latest_reports.length || state.progress_summary ? "继续工作" : "开始工作",
    action_summary: state.progress_summary?.summary || "打开终端开始工作，或添加一条记录。",
  };
}

export type { ReviewObligationRecord };
