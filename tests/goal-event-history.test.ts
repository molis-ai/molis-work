import assert from "node:assert/strict";
import test from "node:test";
import {
  listGoalDocumentHistory,
  mapJournalHistoryItems,
  mergeGoalHistoryItems,
  mixedPageIsStable,
  pageHistoryItems,
  renderHistoryItemBody,
} from "@molis-ai/molis-work-plugin-goals";
import type { GoalEventTimelineItem } from "@molis-ai/molis-work-contracts/modules/goals";

test("history merges event work with the journal's records, keeps original IDs and does not duplicate work events", () => {
  const work = {
    items: [{
      event_id: "gevt-1",
      journal_seq: 9,
      received_at: "2026-09-09T12:00:00.000Z",
      title: "新报告",
      kind: "report" as const,
      type_id: "delivery",
      type_name: "交付",
      semantic_family: "delivery" as const,
      actor_id: "runtime-1",
      actor_kind: "runtime" as const,
    }],
    next_cursor: null,
    observed_event_cursor: 9,
  };
  const created = {
    seq: 1, event_id: "j-1", actor_id: "user-1", type: "goal.created",
    object_type: "goal", object_id: "g", reason: "建立目标", payload: {}, at: "2026-09-07T09:00:00.000Z",
  };
  const journal = mapJournalHistoryItems([
    {
      seq: 3, event_id: "gevt-1", actor_id: "runtime-1", type: "goal.work_event.reported",
      object_type: "goal", object_id: "g", reason: "不应重复", payload: {}, at: "2026-09-09T12:00:00.000Z",
    },
    {
      seq: 2, event_id: "j-2", actor_id: "user-1", type: "goal.updated",
      object_type: "goal", object_id: "g", reason: "补充说明", payload: {}, at: "2026-09-08T11:00:00.000Z",
    },
    created,
  ], new Set(["gevt-1"]));
  assert.equal(journal.some((item) => item.original_id === "gevt-1"), false);
  assert.deepEqual(journal.map((item) => [item.source, item.original_id]), [["journal", "j-2"], ["journal", "j-1"]]);
  assert.equal(journal.find((item) => item.original_id === "j-1")?.type_label, "建立目标");
  const merged = mergeGoalHistoryItems({ work, journal });
  assert.equal(merged[0]?.event_id, "gevt-1");
  assert.equal(merged.filter((item) => item.source === "event_work").length, 1);
  assert.equal(merged.find((item) => item.source === "event_work")?.lane, "result");
  assert.equal(merged.find((item) => item.original_id === "j-1")?.lane, "other");
  const page = pageHistoryItems(merged, { limit: 1 }, 9);
  assert.equal(page.items.length, 1);
  assert.equal(page.next_cursor, page.items[0]?.item_id);
  const second = pageHistoryItems(merged, { before_cursor: page.next_cursor ?? undefined, limit: 1 }, 9);
  assert.equal(second.items.length, 1);
  assert.notEqual(second.items[0]?.item_id, page.items[0]?.item_id);
  assert.equal(mixedPageIsStable(merged[0], merged[merged.length - 1]), true);
  assert.equal(mixedPageIsStable(merged[merged.length - 1], merged[0]), false);

  const escapeHtml = (value: string) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  const body = renderHistoryItemBody(merged.find((item) => item.original_id === "j-1")!, { journal: created }, { translate: (value: string) => value, escapeHtml });
  assert.match(body, /<h2>建立目标<\/h2>/);
  assert.match(body, /<code>g<\/code>/);
});

test("mixed document history keeps next_cursor when a work fetch window is full", () => {
  const work: GoalEventTimelineItem[] = Array.from({ length: 150 }, (_, index) => {
    const seq = 150 - index;
    return {
      event_id: `gevt-${seq}`,
      journal_seq: seq,
      received_at: new Date(Date.parse("2026-09-09T00:00:00.000Z") + seq * 1000).toISOString(),
      title: `历史 ${seq}`,
      kind: "report",
      type_id: "note",
      type_name: "记录",
      semantic_family: "progress",
      actor_id: "runtime-1",
      actor_kind: "runtime",
    };
  });
  const listLatestTimeline = (_boardId: string, _goalId: string, query: { before_cursor?: number; limit?: number } = {}) => {
    const limit = query.limit ?? 40;
    const start = query.before_cursor == null
      ? 0
      : work.findIndex((item) => item.journal_seq === query.before_cursor) + 1;
    const items = start < 0 ? [] : work.slice(start, start + limit);
    return {
      items,
      next_cursor: items.length === limit ? items[items.length - 1]!.journal_seq : null,
      observed_event_cursor: 150,
    };
  };
  const readEvent = (_boardId: string, _goalId: string, eventId: string) => {
    const item = work.find((row) => row.event_id === eventId);
    if (!item) throw Object.assign(new Error("事件不存在"), { code: "event.not_found" });
    return {
      ...item,
      board_id: "b",
      goal_id: "g",
      type: { type_id: "note", version: 1, name: "记录", purpose: "原文", fields: [] },
      payload: { body: `原记录 ${item.journal_seq}` },
      judgments: [],
      config_version: 1,
    };
  };
  const ports = {
    listLatestTimeline,
    readEvent,
    readState: () => ({}),
    isEventStateOwner: () => true,
  };
  const snapshot = { relations: [], goal_risks: [] };
  const input = { boardId: "b", goalId: "g", ports, snapshot, events: [] };
  const first = listGoalDocumentHistory({ ...input, query: { limit: 100 } } as never);
  assert.equal(first.items.length, 100);
  assert.equal(first.next_cursor, "gevt-51");
  assert.equal(first.items.some((item) => item.item_id === "gevt-1"), false);
  const second = listGoalDocumentHistory({ ...input, query: { limit: 100, before_cursor: first.next_cursor ?? undefined } } as never);
  assert.equal(second.items.length, 50);
  assert.equal(second.next_cursor, null);
  assert.equal(second.items.some((item) => item.item_id === "gevt-1"), true);
  assert.equal(second.items.filter((item) => first.items.some((prior) => prior.item_id === item.item_id)).length, 0);
});
