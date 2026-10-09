import type { GoalEventTimelineItem, GoalEventTimelinePage, GoalHistoryLane } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalsDecisionEvent } from "./decision-view.js";
import type { BoardSnapshot } from "./goal-entry-contract.js";
import { GOALS_RELATION_LABELS } from "./relation-presentation.js";

export const NEW_WORK_JOURNAL_PREFIXES = ["goal.event_config.", "goal.work_event.", "goal.event_state."] as const;

/** Event work, or the Goals journal's own records (creation, relations). */
export type GoalHistorySource = "event_work" | "journal";

export interface GoalHistoryIndexItem {
  item_id: string;
  source: GoalHistorySource;
  original_id: string;
  event_id: string | null;
  journal_seq: number;
  received_at: string;
  title: string;
  type_label: string;
  lane: GoalHistoryLane;
  actor_id: string;
  actor_kind: "user" | "runtime" | null;
  status_label: string | null;
  relation?: { type: string; label: string; from_id: string; from_title: string; to_id: string; to_title: string; removed: boolean };
}

export interface GoalHistoryTimelinePage {
  items: GoalHistoryIndexItem[];
  next_cursor: string | null;
  observed_event_cursor: number;
}

export interface GoalDocumentHistoryQuery {
  before_cursor?: string;
  limit?: number;
}

export function isNewWorkJournalType(type: string): boolean {
  return NEW_WORK_JOURNAL_PREFIXES.some((prefix) => type.startsWith(prefix));
}

export function mapWorkTimelineItems(items: readonly GoalEventTimelineItem[]): GoalHistoryIndexItem[] {
  return items.map(indexItemFromTimeline);
}

export function indexItemFromTimeline(item: GoalEventTimelineItem): GoalHistoryIndexItem {
  return {
    item_id: item.event_id,
    source: "event_work",
    original_id: item.event_id,
    event_id: item.event_id,
    journal_seq: item.journal_seq,
    received_at: item.received_at,
    title: item.title,
    type_label: workTypeLabel(item),
    lane: item.lane ?? workLane(item),
    actor_id: item.actor_id,
    actor_kind: item.actor_kind,
    status_label: null,
  };
}

export function workLane(item: Pick<GoalEventTimelineItem, "kind" | "semantic_family" | "system_operation">): GoalHistoryLane {
  if (item.kind === "report") {
    return item.semantic_family === "delivery" || item.semantic_family === "verification" ? "result" : "other";
  }
  const operation = item.system_operation ?? "";
  if (operation === "user_decision" || operation === "decision_requested" || operation === "decision_cited"
    || operation === "agreement_set" || operation === "closure_submitted") return "decision";
  if (operation.startsWith("concern_")) return "problem";
  return "other";
}

function workTypeLabel(item: GoalEventTimelineItem): string {
  if (item.kind === "report") return item.type_name || "工作记录";
  if (item.kind === "configuration") return "配置";
  return SYSTEM_TYPE_LABELS[item.system_operation ?? ""] ?? "系统记录";
}

const SYSTEM_TYPE_LABELS: Record<string, string> = {
  progress_summary: "当前进展",
  observation_note: "补充说明",
  concern_opened: "问题待处理",
  concern_resolved: "问题已解决",
  concern_accepted: "风险已接受",
  concern_overturned: "问题判断已撤销",
  decision_requested: "请求决定",
  user_decision: "用户决定",
  decision_cited: "引用决定",
  agreement_set: "约定",
  closure_submitted: "收尾",
  completion_reopened: "继续此目标",
  work_resumed: "显式继续",
  event_owner_continued: "转交事件记录",
};

const JOURNAL_TYPE_LABELS: Record<string, string> = {
  "goal.created": "建立目标",
  "goal.updated": "更新目标",
  "goal.accepted": "确认目标",
  "relation.added": "增加关系",
  "relation.deactivated": "停用关系",
};

export function mapJournalHistoryItems(
  events: readonly GoalsDecisionEvent[],
  workEventIds: ReadonlySet<string>,
  snapshot?: Pick<BoardSnapshot, "goals" | "relations">,
): GoalHistoryIndexItem[] {
  return events.flatMap((event) => {
    if (isNewWorkJournalType(event.type) || workEventIds.has(event.event_id)) return [];
    const record = event.type.startsWith("relation.") ? snapshot?.relations.find(row => row.relation_id === event.object_id) : undefined;
    const payload = event.payload as Record<string, unknown> | null;
    const from = record?.from_goal_id ?? (typeof payload?.from_goal_id === "string" ? payload.from_goal_id : "");
    const to = record?.to_goal_id ?? (typeof payload?.to_goal_id === "string" ? payload.to_goal_id : "");
    const type = record?.type ?? (typeof payload?.type === "string" ? payload.type : "");
    const relation = event.type.startsWith("relation.") && from && to ? {
      type, label: GOALS_RELATION_LABELS[type]?.out ?? "关联",
      from_id: from, from_title: snapshot?.goals.find(goal => goal.goal_id === from)?.title ?? from,
      to_id: to, to_title: snapshot?.goals.find(goal => goal.goal_id === to)?.title ?? to,
      removed: event.type === "relation.deactivated",
    } : undefined;
    return [{
      item_id: `journal:${event.event_id}`,
      source: "journal" as const,
      original_id: event.event_id,
      event_id: null,
      journal_seq: event.seq,
      received_at: event.at,
      title: relation ? `${relation.from_title} → ${relation.label} → ${relation.to_title}` : event.reason?.trim() || JOURNAL_TYPE_LABELS[event.type] || "记录",
      type_label: JOURNAL_TYPE_LABELS[event.type] ?? "记录",
      lane: "other" as const,
      actor_id: event.actor_id,
      actor_kind: null,
      status_label: relation ? relation.removed ? "已解除" : "已建立" : null,
      ...(relation ? { relation } : {}),
    }];
  });
}

export function relatedHistoryObjectIds(snapshot: BoardSnapshot, goalId: string): Set<string> {
  const ids = new Set<string>([goalId]);
  for (const relation of snapshot.relations) {
    if (relation.from_goal_id === goalId || relation.to_goal_id === goalId) ids.add(relation.relation_id);
  }
  return ids;
}

export function mergeGoalHistoryItems(input: {
  work: GoalEventTimelinePage | { items: readonly GoalEventTimelineItem[]; observed_event_cursor: number };
  journal: readonly GoalHistoryIndexItem[];
}): GoalHistoryIndexItem[] {
  const workItems = mapWorkTimelineItems(input.work.items);
  const workIds = new Set(workItems.map((item) => item.original_id));
  const seen = new Set(workItems.map((item) => item.item_id));
  const items = [...workItems];
  for (const item of input.journal) {
    if (workIds.has(item.original_id) || seen.has(item.item_id)) continue;
    seen.add(item.item_id);
    items.push(item);
  }
  return items.sort(compareHistoryItems);
}

export function pageHistoryItems(
  items: readonly GoalHistoryIndexItem[],
  query: GoalDocumentHistoryQuery,
  observedEventCursor: number,
  defaultLimit = 40,
): GoalHistoryTimelinePage {
  const limit = query.limit ?? defaultLimit;
  const bounded = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : defaultLimit;
  let start = 0;
  if (query.before_cursor) {
    const index = items.findIndex((item) => item.item_id === query.before_cursor);
    start = index >= 0 ? index + 1 : items.length;
  }
  const page = items.slice(start, start + bounded);
  return {
    items: page,
    next_cursor: start + page.length < items.length ? page[page.length - 1]?.item_id ?? null : null,
    observed_event_cursor: observedEventCursor,
  };
}

export function compareHistoryItems(left: GoalHistoryIndexItem, right: GoalHistoryIndexItem): number {
  const time = right.received_at.localeCompare(left.received_at);
  if (time) return time;
  if (right.journal_seq !== left.journal_seq) return right.journal_seq - left.journal_seq;
  return right.item_id.localeCompare(left.item_id);
}

export { SYSTEM_TYPE_LABELS, JOURNAL_TYPE_LABELS };

export function mixedPageIsStable(
  pageLast: GoalHistoryIndexItem | undefined,
  oldestFetchedWork: GoalHistoryIndexItem | undefined,
): boolean {
  if (!pageLast || !oldestFetchedWork) return false;
  return compareHistoryItems(pageLast, oldestFetchedWork) <= 0;
}
