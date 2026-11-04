import { findHistoryIndexItem, type GoalEventDocumentPorts } from "./event-document-model.js";
import { renderHistoryItemBody } from "./event-history-body.js";
import type { GoalWorkEventRecord } from "./contract/goals.js";
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
  const workEvent = item.source === "event_work" && item.event_id ? input.ports.readEvent(input.projectId, input.goalId, item.event_id) : null;
  const lookups = workEvent
    ? { workEvent, requirementNames, acknowledgedActorKind: acknowledgedActorKind(input, workEvent) }
    : { journal: input.events.find(row => row.event_id === item.original_id) ?? null, requirementNames };
  const html = renderHistoryItemBody(item, lookups, {
    translate: (text, values) => text.replace(/\{(\w+)\}/g, (_, key) => String(values?.[key] ?? "")),
    escapeHtml: value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
  });
  return { item, html };
}

/** Who wrote the record an acknowledgement answers. The record is on the same Goal and events are never removed; a record that cannot be read counts as not the person's. */
function acknowledgedActorKind(input: { projectId: string; goalId: string; ports: GoalEventDocumentPorts }, event: GoalWorkEventRecord): "user" | "runtime" | null {
  if (event.kind !== "system" || event.payload.operation !== "input_acknowledged") return null;
  try { return input.ports.readEvent(input.projectId, input.goalId, event.payload.reference.event_id).actor_kind ?? null; }
  catch { return null; }
}
