import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import test from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { DEMO_BOARD_ID, GoalProjectApplication, LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { materializeGoalEventV35Fixture } from "./goal-event-v35-fixture.js";

const TOKEN = "molis-work-history-contract-token-0123456789abcdef";

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${address.port}`);
    });
    server.once("error", reject);
  });
}

test("public document timeline is bounded, keeps journal, and does not label self-verification as user", async () => {
  const fixture = materializeGoalEventV35Fixture("legacy");
  const directory = fixture.directory;
  const databasePath = fixture.path;
  const store = new LocalProjectDatabase(databasePath);
  const app = new GoalProjectApplication(store);
  const server = createMolisWorkWebServer({ databasePath, boardId: DEMO_BOARD_ID, homeDirectory: directory, controlToken: TOKEN });
  const origin = await listen(server);
  try {
    const page = async (goalId: string, query: Record<string, string>) => {
      const response = await fetch(`${origin}/api/goals/${goalId}/event-timeline?${new URLSearchParams(query)}`);
      assert.equal(response.status, 200);
      return response.json() as Promise<{ items: Array<{ item_id: string; original_id: string; source: string; actor_id: string; actor_kind: string | null }>; next_cursor: string | null }>;
    };
    const coreBefore = await page("CORE", { limit: "1" });
    assert.ok(coreBefore.items.length <= 1, "limit must bound mixed history");

    const snapshot = store.snapshot(DEMO_BOARD_ID);
    const review = snapshot.reviews.find((item) => item.goal_id === "CORE");
    assert.ok(review);
    const obligation = snapshot.review_obligations.find((item) => item.obligation_id === review.obligation_id);
    assert.equal(obligation?.role, "self_verifier");
    const coreHistory = await page("CORE", { limit: "100" });
    const mappedReview = coreHistory.items.find((item) => item.original_id === review.review_id);
    assert.ok(mappedReview);
    assert.equal(mappedReview.source, "legacy_review");
    assert.equal(mappedReview.actor_id, review.actor_id);
    assert.notEqual(mappedReview.actor_kind, "user");

    const fragment = await (await fetch(origin + "/api/goals/V1/document")).text();
    const renderedIds = [...fragment.matchAll(/data-timeline-item="([^"]+)"/g)].map((match) => match[1]);
    const v1History = await page("V1", { limit: "100" });
    assert.ok(renderedIds.length > 0);
    assert.ok(renderedIds.every((id) => v1History.items.some((item) => item.item_id === id)));

    app.goalEvents.resumeWork({
      board_id: DEMO_BOARD_ID, goal_id: "CORE", actor_id: "review-user", actor_kind: "user",
      idempotency_key: "history-transfer", reason: "保留转交后的工作事实",
    });
    app.goalEvents.configure({
      board_id: DEMO_BOARD_ID, goal_id: "CORE", actor_id: "review-user", actor_kind: "user",
      idempotency_key: "history-type", expected_version: 0,
      types: [{ type_id: "history-note", version: 1, name: "接续记录", purpose: "保留转交后的工作事实",
        fields: [{ field_id: "body", name: "内容", purpose: "原文", format: "longtext", required: true }] }],
    });
    app.goalEvents.report({
      board_id: DEMO_BOARD_ID, goal_id: "CORE", actor_id: "review-runtime", actor_kind: "runtime",
      idempotency_key: "history-new-reports",
      events: Array.from({ length: 5 }, (_, index) => ({
        type_id: "history-note", type_version: 1, title: `转交后的工作记录 ${index + 1}`, fields: { body: `实际接续内容 ${index + 1}` },
      })),
    });
    const first = await page("CORE", { limit: "2" });
    assert.ok(first.next_cursor);
    const second = await page("CORE", { limit: "2", before_cursor: first.next_cursor ?? "" });
    assert.ok(first.items.length <= 2 && second.items.length <= 2);
    assert.equal(second.items.filter((item) => first.items.some((prior) => prior.item_id === item.item_id)).length, 0);
    const body = await fetch(`${origin}/api/goals/CORE/history/${encodeURIComponent(mappedReview.item_id)}`);
    assert.equal(body.status, 200);
    const payload = await body.json() as { html: string; item: { original_id: string; source: string; actor_id: string } };
    assert.equal(payload.item.source, "legacy_review");
    assert.equal(payload.item.original_id, review.review_id);
    assert.equal(payload.item.actor_id, review.actor_id);
    assert.match(payload.html, /生命周期测试通过/);
    assert.match(payload.html, new RegExp(review.actor_id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const byOriginal = await fetch(`${origin}/api/goals/CORE/history/${encodeURIComponent(review.review_id)}`);
    assert.equal(byOriginal.status, 200);
    const originalPayload = await byOriginal.json() as { html: string; item: { original_id: string; source: string } };
    assert.equal(originalPayload.item.original_id, review.review_id);
    assert.equal(originalPayload.item.source, "legacy_review");
    assert.equal(originalPayload.html, payload.html);

    const refresh = await fetch(`${origin}/api/board/refresh?view=current&goal_id=CORE`);
    assert.equal(refresh.status, 200);
    const refreshHtml = await refresh.text();
    assert.match(refreshHtml, /data-current-summary/);
    assert.match(refreshHtml, /data-timeline-item/);
    assert.doesNotMatch(refreshHtml, /正在读取当前事实|载入中/);

    const capGoal = app.goalEvents.createIntent({
      board_id: DEMO_BOARD_ID, title: "有界历史不能截断", outcome: "全部工作记录可翻到",
      actor_id: "review-runtime", actor_kind: "runtime", idempotency_key: "cap-intent",
    }).goal.goal_id;
    app.goalEvents.configure({
      board_id: DEMO_BOARD_ID, goal_id: capGoal, actor_id: "review-runtime", actor_kind: "runtime",
      expected_version: 0, idempotency_key: "cap-config",
      types: [{ type_id: "cap-note", version: 1, name: "记录", purpose: "分页",
        fields: [{ field_id: "body", name: "内容", purpose: "原文", format: "text", required: true }] }],
    });
    for (let start = 0; start < 120; start += 40) {
      app.goalEvents.report({
        board_id: DEMO_BOARD_ID, goal_id: capGoal, actor_id: "review-runtime", actor_kind: "runtime",
        idempotency_key: `cap-batch-${start}`,
        events: Array.from({ length: 40 }, (_, index) => ({
          type_id: "cap-note", type_version: 1, title: `历史 ${start + index}`, fields: { body: `原记录 ${start + index}` },
        })),
      });
    }
    const oldest = app.goalEvents.listEvents(DEMO_BOARD_ID, capGoal, { limit: 100 }).events.find((event) => event.kind === "report");
    assert.ok(oldest);
    const ids = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    do {
      const result = await page(capGoal, { limit: "100", ...(cursor ? { before_cursor: cursor } : {}) });
      for (const item of result.items) ids.add(item.item_id);
      cursor = result.next_cursor;
      pages += 1;
      assert.ok(pages < 10, "120 reports must paginate in a few windows");
    } while (cursor);
    assert.ok(pages >= 2, "a full 100-item work window must not look like the end of history");
    assert.equal(ids.has(oldest.event_id), true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
