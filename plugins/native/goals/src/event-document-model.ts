import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { WORK_STATE_COPY } from "./goal-state-copy.js";
import type {
  GoalEventStateView,
  GoalEventTimelineItem,
  GoalEventTypeDefinition,
  GoalRecord,
  GoalRelationRecord,
} from "./contract/goals.js";
import type { GoalEventApplication } from "./goal-event-application.js";
import type { GoalsDecisionEvent } from "./decision-view.js";
import type { BoardSnapshot } from "./goal-entry-contract.js";
import {
  compareHistoryItems,
  indexItemFromTimeline,
  mapJournalHistoryItems,
  mergeGoalHistoryItems,
  mixedPageIsStable,
  relatedHistoryObjectIds,
  type GoalDocumentHistoryQuery,
  type GoalHistoryIndexItem,
  type GoalHistoryTimelinePage,
} from "./event-history-map.js";
import type { GoalDisplayStatus, GoalPresentationState } from "./tree-order.js";
import type { AcceptanceView } from "@molis-ai/molis-work-contracts/modules/acceptance";
import { goalAcceptanceSummary, type GoalAcceptanceSummary } from "./acceptance-summary.js";

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
  transfer: {
    available: boolean;
    kind: "resume_cancelled" | "reopen_event_completed" | null;
  };
  types: GoalEventTypeDefinition[];
  /** The Goal's requirements as the platform has them; null when they could not be read for this page. */
  acceptance: GoalAcceptanceSummary | null;
}

export type GoalEventDocumentPorts = Pick<
  GoalEventApplication,
  "readState" | "listLatestTimeline" | "isEventStateOwner" | "readEvent"
>;

export function listGoalDocumentHistory(input: {
  projectId: string;
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
  let cursorItem: GoalHistoryIndexItem | null = null;
  if (query.before_cursor) {
    cursorItem = findHistoryIndexItem(input, query.before_cursor);
    if (!cursorItem) {
      return {
        items: [],
        next_cursor: null,
        observed_event_cursor: input.ports.listLatestTimeline(input.projectId, input.goalId, { limit: 1 }).observed_event_cursor,
      };
    }
  }
  let workBefore: number | undefined = cursorItem?.source === "event_work" ? cursorItem.journal_seq : undefined;
  const workItems: GoalEventTimelineItem[] = [];
  let observed = 0;
  for (;;) {
    const result = input.ports.listLatestTimeline(input.projectId, input.goalId, { before_cursor: workBefore, limit: 100 });
    observed = result.observed_event_cursor;
    workItems.push(...result.items);
    const workIds = new Set(workItems.map((item) => item.event_id));
    if (cursorItem?.event_id) workIds.add(cursorItem.event_id);
    let merged = mergeGoalHistoryItems({
      work: { items: workItems, observed_event_cursor: observed },
      journal: mapJournalHistoryItems(journal, workIds, input.snapshot),
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
  const journalId = itemId.startsWith("journal:") ? itemId.slice("journal:".length) : null;
  if (!journalId) {
    try {
      const event = input.ports.readEvent(input.projectId, goalId, itemId);
      return indexItemFromTimeline({
        event_id: event.event_id,
        journal_seq: event.journal_seq,
        received_at: event.received_at,
        title: event.title,
        kind: event.kind,
        type_id: event.kind === "report" ? event.type?.type_id ?? null : null,
        type_name: event.kind === "report" ? event.type?.name ?? null : event.kind === "configuration" ? "配置" : "系统",
        semantic_family: event.kind === "report" ? event.type?.semantic_family ?? null : null,
        system_operation: event.kind === "system" ? event.payload.operation : null,
        actor_id: event.actor_id,
        actor_kind: event.actor_kind,
      });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
      if (code && code !== "goals.event.not_found") throw error;
    }
  }
  const event = journal.find((row) => row.event_id === (journalId ?? itemId));
  return event ? mapJournalHistoryItems([event], new Set(), input.snapshot)[0] ?? null : null;
}

export function createGoalEventDocumentView(input: {
  projectId: string;
  goal: GoalRecord;
  ports: GoalEventDocumentPorts;
  snapshot: BoardSnapshot;
  relations: readonly GoalRelationRecord[];
  events?: readonly GoalsDecisionEvent[];
  /** What `acceptance.read@1` gave Goals for this Goal before the read window opened. */
  acceptance?: AcceptanceView | null;
}): GoalEventDocumentView {
  const state = input.ports.readState(input.projectId, input.goal.goal_id);
  const timeline = listGoalDocumentHistory({
    projectId: input.projectId,
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
    transfer: transferFor(owned, state.work_status),
    types: state.config.types,
    acceptance: input.acceptance ? goalAcceptanceSummary(state, input.acceptance) : null,
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
      status_label: uiText.text(WORK_STATE_COPY.satisfied.label),
      main_action_label: uiText.text("goals.event-document-model.continue-explicitly"),
      action_summary: state.closure?.result || state.agreement.outcome || uiText.text("goals.event-document-model.a-completion-result-is-recorded-to-start"),
    };
  }
  if (state.work_status === "cancelled") {
    return {
      event_work: true,
      status: "invalidated",
      display_status: "cancelled",
      status_label: uiText.text(WORK_STATE_COPY.invalidated.label),
      main_action_label: uiText.text("goals.event-document-model.continue-explicitly"),
      action_summary: uiText.text("goals.event-document-model.continue-a-cancelled-goal-explicitly-adding-a"),
    };
  }
  if (state.pending_decisions.length) {
    return {
      event_work: true,
      status: "waiting_for_human",
      display_status: "waiting_user",
      status_label: uiText.text(WORK_STATE_COPY.waiting_for_human.label),
      main_action_label: uiText.text("goals.event-document-model.make-a-decision"),
      action_summary: state.pending_decisions[0]!.question,
    };
  }
  const blocking = state.concerns.filter((item) => item.status === "open" && item.blocks_closure);
  if (blocking.length) {
    return {
      event_work: true,
      status: "execution_blocked",
      display_status: "blocked",
      status_label: uiText.text(WORK_STATE_COPY.execution_blocked.label),
      main_action_label: uiText.text("goals.event-document-model.handle-issue"),
      action_summary: blocking[0]!.title,
    };
  }
  const next = state.progress_summary?.next_step?.trim();
  if (next) {
    return {
      event_work: true,
      status: "executing",
      display_status: "in_progress",
      status_label: uiText.text(WORK_STATE_COPY.executing.label),
      main_action_label: uiText.text("goals.event-document-model.record-progress"),
      action_summary: next,
    };
  }
  return {
    event_work: true,
    status: "execution_pending",
    display_status: "continue",
    status_label: uiText.text(WORK_STATE_COPY.execution_pending.label),
    main_action_label: state.latest_reports.length || state.progress_summary ? uiText.text("goals.event-document-model.continue-work") : uiText.text("goals.event-document-model.start-work"),
    action_summary: state.progress_summary?.summary || uiText.text("goals.event-document-model.open-the-terminal-to-start-work-or"),
  };
}


/** One requirement as the Goal page lists it: the platform's words and state, with the types Goals bound to it. */
export interface GoalRequirementRow {
  requirement_id: string;
  statement: string;
  human_decision_required: boolean;
  bound_type_ids: string[];
  /** Null when the platform's view could not be read for this page. */
  satisfied: boolean | null;
  person: GoalAcceptanceSummary["requirements"][number]["person"] | null;
}

/** The Goal's requirements in the platform's order; where its view could not be read, the ids Goals hung, without words. */
export function goalRequirementRows(doc: Pick<GoalEventDocumentView, "state" | "acceptance"> | null | undefined): GoalRequirementRow[] {
  if (!doc) return [];
  const links = new Map(doc.state.requirements.map(link => [link.requirement_id, link]));
  if (doc.acceptance) {
    return doc.acceptance.requirements.map(requirement => ({ requirement_id: requirement.id, statement: requirement.statement,
      human_decision_required: requirement.requires_person, bound_type_ids: links.get(requirement.id)?.bound_type_ids ?? [],
      satisfied: requirement.satisfied, person: requirement.person }));
  }
  return doc.state.requirements.map(link => ({ requirement_id: link.requirement_id, statement: link.requirement_id, human_decision_required: false,
    bound_type_ids: link.bound_type_ids, satisfied: null, person: null }));
}
