import { defineHomeEventsAction, withinHomeEventWindow, assertHomeEventWindow, type HomeEvent, type HomeEventWindow, type ActionCallContext, type ActionSubject, type ActionSubjectContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { FeedApplication } from "./application.js";
import type { FeedItemRecord } from "./projection.js";

export const feedHomeEventsAction = defineHomeEventsAction("feed.home.events", ["feed_item", "source"], "Feed 首页事项", ["feed:read", "inbox:read"]);
const organization = new Set(["github", "gmail", "youtube_channel"]);
export function createFeedHomeEventsHandler(feed: FeedApplication, board: string, hydrate: (item: FeedItemRecord) => FeedItemRecord,
  readSubject?: (subject: ActionSubject, caller: ActionCallContext) => Promise<ActionSubjectContext>) {
  return { ...feedHomeEventsAction, handle: async (caller: ActionCallContext, value: unknown) => {
    const window = value as HomeEventWindow; assertHomeEventWindow(window);
    const snapshot = feed.snapshot(board);
    const inboxed = new Set(snapshot.inbox_entries.filter(entry => entry.subject_type === "feed_item").map(entry => entry.subject_id));
    const faults = new Set(snapshot.inbox_entries.filter(entry => entry.subject_type === "source_fault").map(entry => entry.subject_id));
    const events: HomeEvent[] = [];
    for (const source of snapshot.sources) {
      const needsAttention = source.status === "disconnected" || source.status === "error" || source.last_error_code === "auth_required"
        || (source.last_outcome === "failed" && !!source.last_error_code);
      if (!needsAttention || faults.has(source.source_id)) continue;
      const disconnected = source.status === "disconnected" || source.last_error_code === "auth_required";
      events.push({ event_id: "auth:" + source.source_id, subject: { kind: "source", id: source.source_id }, occurred_at: source.updated_at,
        placement: "today", category: organization.has(source.kind) ? "organization" : "personal", title: source.name + " 需要处理",
        summary: disconnected ? "检查来源连接后继续接收内容" : "检查来源状态及最近同步结果",
        content: disconnected ? "此来源尚未连接。打开来源，检查账号和连接设置。" : "此来源最近同步出现问题。打开来源查看原因，再决定如何处理。",
        facts: [["来自", source.name], ["状态", disconnected ? "未连接" : "同步异常"], ["挂在", "Feed 来源"]], needs_attention: true,
        open: { kind: "group", surface: "feed", id: source.source_id, title: source.name, label: "查看来源" } });
    }
    for (const original of snapshot.feed_items) {
      const occurred = original.source_created_at || original.imported_at;
      if (inboxed.has(original.item_id) || !withinHomeEventWindow(occurred, window)) continue;
      const item = hydrate(original);
      let goalLabel = item.linked_goal_id ? "目标 · " + item.linked_goal_id : "Feed";
      if (item.linked_goal_id && readSubject) {
        try { goalLabel = (await readSubject({ kind: "goal", id: item.linked_goal_id }, caller)).title; } catch { /* Keep the owned association ID when Goal content is unavailable. */ }
        if (feed.getFeedItem(board, item.item_id).revision !== item.revision) continue;
      }
      events.push({ event_id: "feed:" + item.item_id, subject: { kind: "feed_item", id: item.item_id }, occurred_at: occurred,
        placement: "occurred", category: organization.has(item.source_kind) ? "organization" : "personal", title: item.title,
        summary: item.summary || item.source_label || "Feed",
        content: item.body || item.materials.map(material => material.content || material.preview).filter(Boolean).join("\n\n") || item.summary || item.title,
        facts: [["来自", item.source_label || item.source_kind], ["状态", "记录"], ["挂在", goalLabel]], needs_attention: false,
        open: { kind: "item", surface: "feed", id: item.item_id, title: item.title, label: "打开事项" } });
    }
    return { source: { surface: "feed", title: "Feed", icon: "rss" }, events };
  } };
}
