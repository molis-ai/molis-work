import assert from "node:assert/strict";
import test from "node:test";
import {
  listGoalDocumentHistory,
  mapJournalHistoryItems,
  mapLegacyHistoryItems,
  mergeGoalHistoryItems,
  mixedPageIsStable,
  pageHistoryItems,
  renderHistoryItemBody,
} from "@molis-ai/molis-work-plugin-goals";
import type { GoalEventTimelineItem } from "@molis-ai/molis-work-contracts/modules/goals";

test("legacy history mapping keeps original IDs and does not duplicate work events", () => {
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
  const legacy = mapLegacyHistoryItems({
    runs: [{
      run_id: "run-1", board_id: "b", goal_id: "g", claim_id: "c", actor_id: "runtime-1", role: "executor",
      state: "completed", block_reason: null, output_refs: [], discovery_refs: [],
      started_at: "2026-09-08T10:00:00.000Z", ended_at: "2026-09-08T11:00:00.000Z",
    }],
    evidence: [{
      evidence_id: "ev-1", board_id: "b", goal_id: "g", contract_revision: 1, criterion_ids: ["c1"],
      producer_actor_id: "runtime-1", run_id: "run-1", review_id: null, kind: "inspection",
      locator: "README.md", locator_status: "verified", locator_validation_reason: "",
      locator_checked_at: null, locator_workspace_id: null, digest: null,
      captured_at: "2026-09-08T11:01:00.000Z", result: "passed", lifecycle_state: "effective",
    }],
    reviews: [{
      review_id: "rv-1", board_id: "b", goal_id: "g", obligation_id: "ob-1", claim_id: "c",
      actor_id: "runtime-core", verdict: "pass", evidence_refs: ["ev-1"], reasoning: "可检查",
      submitted_at: "2026-09-08T11:02:00.000Z",
    }],
    obligations: [{
      obligation_id: "ob-1", board_id: "b", goal_id: "g", contract_revision: 1, role: "self_verifier",
      required_count: 1, independence_rule: "self", criterion_scope: ["c1"], state: "satisfied",
      created_at: "2026-09-08T10:00:00.000Z",
    }],
  });
  const merged = mergeGoalHistoryItems({ work, legacy });
  assert.equal(merged[0]?.event_id, "gevt-1");
  assert.equal(merged.filter((item) => item.source === "event_work").length, 1);
  assert.equal(merged.find((item) => item.source === "legacy_run")?.original_id, "run-1");
  assert.equal(merged.find((item) => item.source === "legacy_evidence")?.original_id, "ev-1");
  assert.equal(merged.find((item) => item.source === "legacy_review")?.original_id, "rv-1");
  assert.equal(merged.find((item) => item.source === "legacy_review")?.actor_kind, "runtime");
  const page = pageHistoryItems(merged, { limit: 1 }, 9);
  assert.equal(page.items.length, 1);
  assert.equal(page.next_cursor, page.items[0]?.item_id);
  const second = pageHistoryItems(merged, { before_cursor: page.next_cursor ?? undefined, limit: 1 }, 9);
  assert.equal(second.items.length, 1);
  assert.notEqual(second.items[0]?.item_id, page.items[0]?.item_id);
  const journal = mapJournalHistoryItems([
    {
      seq: 3, event_id: "gevt-1", actor_id: "runtime-1", type: "goal.work_event.reported",
      object_type: "goal", object_id: "g", reason: "不应重复", payload: {}, at: "2026-09-09T12:00:00.000Z",
    },
    {
      seq: 2, event_id: "j-run", actor_id: "runtime-1", type: "execution.run.completed",
      object_type: "run", object_id: "run-1", reason: "相关推进结束", payload: {}, at: "2026-09-08T11:00:00.000Z",
    },
    {
      seq: 1, event_id: "j-1", actor_id: "user-1", type: "goal.created",
      object_type: "goal", object_id: "g", reason: "建立目标", payload: {}, at: "2026-09-07T09:00:00.000Z",
    },
  ], new Set(["gevt-1"]));
  assert.equal(journal.some((item) => item.original_id === "gevt-1"), false);
  assert.equal(journal.some((item) => item.original_id === "j-run"), true);
  assert.equal(journal.some((item) => item.original_id === "j-1"), true);
  assert.equal(journal.find((item) => item.original_id === "j-1")?.type_label, "建立目标");
  assert.equal(merged.find((item) => item.source === "event_work")?.lane, "result");
  assert.equal(merged.find((item) => item.source === "legacy_evidence")?.lane, "result");
  assert.equal(mixedPageIsStable(merged[0], merged[merged.length - 1]), true);
  assert.equal(mixedPageIsStable(merged[merged.length - 1], merged[0]), false);

  const escapeHtml = (value: string) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  const primitives = { translate: (value: string) => value, escapeHtml };
  const evidenceItem = merged.find((item) => item.source === "legacy_evidence")!;
  const evidence = {
    evidence_id: "ev-1", board_id: "b", goal_id: "g", contract_revision: 1, criterion_ids: ["c1"],
    producer_actor_id: "runtime-1", run_id: "run-1", review_id: null, kind: "inspection" as const,
    locator: "README.md", locator_status: "verified" as const, locator_validation_reason: "",
    locator_checked_at: null, locator_workspace_id: null, digest: null,
    captured_at: "2026-09-08T11:01:00.000Z", result: "passed" as const, lifecycle_state: "effective" as const,
    correction: null, historical_unmapped: false,
  };
  const verified = renderHistoryItemBody(evidenceItem, { evidence }, primitives);
  assert.match(verified, /href="\/api\/project-references\/README\.md\?evidence_id=ev-1"/);
  assert.match(verified, /data-project-reference/);
  const external = renderHistoryItemBody(evidenceItem, {
    evidence: { ...evidence, locator: "https://example.com/manual-evidence", locator_status: "unverified", locator_validation_reason: "外部 URL" },
  }, primitives);
  assert.match(external, /href="https:\/\/example\.com\/manual-evidence"/);
  assert.match(external, /data-copy-value="https:\/\/example\.com\/manual-evidence"/);
  assert.doesNotMatch(external, /\/api\/project-references\//);
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
  const snapshot = { runs: [], evidence: [], reviews: [], review_obligations: [], claims: [], relations: [], goal_risks: [] };
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
