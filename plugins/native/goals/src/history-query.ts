import { findHistoryIndexItem, type GoalEventDocumentPorts } from "./event-document-model.js";
import { renderHistoryItemBody } from "./event-history-body.js";
import type { GoalHistoryIndexItem } from "./event-history-map.js";
import type { BoardSnapshot } from "./goal-entry-contract.js";
import type { GoalsDecisionEvent } from "./decision-view.js";

export interface GoalHistoryReadResult { item: GoalHistoryIndexItem; html: string }
export interface GoalHistoryQueryPorts { snapshot(): BoardSnapshot; journalEvents(): GoalsDecisionEvent[] }

/** Resolve and render one history entry from the same project snapshot: event work or a journal record. */
export function readGoalHistory(input: { projectId: string; goalId: string; itemId: string; ports: GoalEventDocumentPorts;
  snapshot: BoardSnapshot; events: readonly GoalsDecisionEvent[] }): GoalHistoryReadResult | null {
  const item = findHistoryIndexItem(input, input.itemId);
  if (!item) return null;
  const requirementNames = Object.fromEntries(input.ports.readState(input.projectId, input.goalId).requirements.map(row => [row.requirement_id, row.statement]));
  const lookups = item.source === "event_work" && item.event_id
    ? { workEvent: input.ports.readEvent(input.projectId, input.goalId, item.event_id), requirementNames }
    : { journal: input.events.find(row => row.event_id === item.original_id) ?? null, requirementNames };
  const html = renderHistoryItemBody(item, lookups, {
    translate: (text, values) => text.replace(/\{(\w+)\}/g, (_, key) => String(values?.[key] ?? "")),
    escapeHtml: value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
  });
  return { item, html };
}
