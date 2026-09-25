import { bindWorkflowContentHandlers, defineWorkflowContentActions, type WorkflowPayload } from "@molis-ai/molis-work-contracts/platform/actions";
import type { FeedApplication } from "./application.js";
import type { FeedItemRecord } from "./projection.js";

export const feedContentActions = defineWorkflowContentActions({ id: "feed", title: "Feed", icon: "rss",
  read_permissions: ["feed:read"], write_permissions: ["feed:write"] });

export function createFeedContentHandlers(feed: FeedApplication, board: string, hydrate: (item: FeedItemRecord) => FeedItemRecord) {
  return bindWorkflowContentHandlers(feedContentActions, {
    list: () => feed.snapshot(board).feed_items.slice().sort((a, b) => String(b.imported_at).localeCompare(String(a.imported_at)))
      .map(item => ({ item_id: item.item_id, title: item.title, caption: item.source_label || item.source_kind || "Feed", at: item.imported_at })),
    read: ({ item_id }): WorkflowPayload => {
      const item = hydrate(feed.getFeedItem(board, item_id));
      const body = item.body || item.materials.map(material => material.content || material.preview).filter(Boolean).join("\n\n") || item.summary || "";
      return { title: item.title, body, url: item.url ?? null, source: item.source_label || item.source_kind || "Feed", feed_item_id: item.item_id };
    },
    receive: async ({ payload, context }) => {
      const now = new Date().toISOString();
      const source = feed.snapshot(board).sources.find(source => source.source_id === "workflow-handoffs") ?? feed.upsertSource({
        board_id: board, source_id: "workflow-handoffs", kind: "workflow", definition_id: null, sync_kind: "manual",
        name: "工作流程", description: "工作流程交给 Feed 或 Inbox 的内容", status: "active", enabled: true, origin: "molis_work",
        config: {}, schedule: { mode: "manual" }, credential_ref: null, account_label: null, last_sync_at: null,
        last_outcome: null, last_error_code: null, imported_at: now, updated_at: now, item_count: 0, cursor: null,
      });
      const item = feed.ingestItem({ source, externalId: `${context.instance_id}:${context.step}`, title: payload.title,
        summary: payload.body.replace(/\s+/g, " ").trim().slice(0, 240), body: payload.body, url: payload.url ?? null,
        occurredAt: now, attention: false }).item;
      await feed.flushPendingJudgments();
      return { plugin: "feed", item_id: item.item_id, title: item.title };
    },
  });
}
