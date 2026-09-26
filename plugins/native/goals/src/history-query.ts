import { findHistoryIndexItem, type GoalEventDocumentPorts } from "./event-document-model.js";
import { renderHistoryItemBody } from "./event-history-body.js";
import type { GoalHistoryIndexItem } from "./event-history-map.js";
import type { BoardSnapshot } from "./goal-entry-contract.js";
import type { GoalsDecisionEvent } from "./decision-view.js";

export interface GoalHistoryReadResult { item: GoalHistoryIndexItem; html: string }
export interface GoalHistoryQueryPorts { snapshot(): BoardSnapshot; journalEvents(): GoalsDecisionEvent[] }

/** Resolve and render one history entry from the same project snapshot, including legacy records. */
export function readGoalHistory(input: { boardId: string; goalId: string; itemId: string; ports: GoalEventDocumentPorts;
  snapshot: BoardSnapshot; events: readonly GoalsDecisionEvent[] }): GoalHistoryReadResult | null {
  const item = findHistoryIndexItem(input, input.itemId);
  if (!item) return null;
  const requirementNames = Object.fromEntries(input.ports.readState(input.boardId, input.goalId).requirements.map(row => [row.requirement_id, row.statement]));
  const lookups = item.source === "event_work" && item.event_id
    ? { workEvent: input.ports.readEvent(input.boardId, input.goalId, item.event_id), requirementNames }
    : { run: input.snapshot.runs.find(row => row.run_id === item.original_id) ?? null,
      evidence: input.snapshot.evidence.find(row => row.evidence_id === item.original_id) ?? null,
      review: input.snapshot.reviews.find(row => row.review_id === item.original_id) ?? null,
      journal: input.events.find(row => row.event_id === item.original_id) ?? null, requirementNames };
  const html = renderHistoryItemBody(item, lookups, {
    translate: (text, values) => text.replace(/\{(\w+)\}/g, (_, key) => String(values?.[key] ?? "")),
    escapeHtml: value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
  });
  return { item, html };
}
