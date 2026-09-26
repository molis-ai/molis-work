import { defineHomeEventsAction, assertHomeEventWindow, type HomeEventWindow, type ActionCallContext, type HomeEvent } from "@molis-ai/molis-work-contracts/platform/actions";
import type { InboxContentPorts } from "./content-actions.js";

export const inboxHomeEventsAction = defineHomeEventsAction("inbox.home.events", ["inbox_entry"], "Inbox 首页事项", ["inbox:read", "feed:read"]);
export function createInboxHomeEventsHandler(ports: InboxContentPorts) {
  return { ...inboxHomeEventsAction, handle: async (caller: ActionCallContext, value: unknown) => {
    assertHomeEventWindow(value as HomeEventWindow);
    const entries = ports.entries().filter(entry => entry.status === "open" || entry.status === "in_progress");
    const items = new Map(ports.items().map(item => [item.item_id, item]));
    const sources = new Map(ports.sources().map(source => [source.source_id, source]));
    const events = await Promise.all(entries.map(async (entry): Promise<HomeEvent | null> => {
      const relatedKind = entry.subject_type === "feed_item" ? "feed_item" : entry.subject_type === "goal_decision" ? "goal" : "source";
      let related;
      try { related = await ports.readSubject?.({ kind: relatedKind, id: entry.subject_id }, caller); } catch { /* Keep the attention reference, without unavailable content. */ }
      let goalLabel = related?.goal_ids.length ? "目标 · " + related.goal_ids.join("、") : "首页";
      if (related?.goal_ids.length && ports.readSubject) {
        const titles = await Promise.all(related.goal_ids.map(async id => {
          try { return (await ports.readSubject!({ kind: "goal", id }, caller)).title; } catch { return "目标 · " + id; }
        }));
        goalLabel = titles.join("、");
      }
      const current = ports.entry(entry.entry_id);
      if (current.revision !== entry.revision || (current.status !== "open" && current.status !== "in_progress")) return null;
      const item = items.get(entry.subject_id), source = sources.get(entry.subject_id);
      const sourceFault = entry.subject_type === "source_fault";
      const title = sourceFault && source ? `来源「${source.name}」需要处理` : related?.title || (entry.subject_type === "feed_item" ? item?.title : null) || "待处理事项";
      const sourceLabel = entry.subject_type === "feed_item" ? item?.source_label || "Feed" : sourceFault ? source?.name || "来源" : "Goals";
      const target = sourceFault && source ? { kind: "group" as const, surface: "feed", id: source.source_id, title: source.name, label: "查看来源" }
        : related ? { kind: "item" as const, surface: entry.subject_type === "goal_decision" ? "goals" : "feed", id: entry.subject_id, title: related.title, label: "打开事项" }
        : { kind: "item" as const, surface: "inbox", id: entry.entry_id, title, label: "查看事项" };
      return { event_id: "inbox:" + entry.entry_id, subject: { kind: "inbox_entry", id: entry.entry_id }, occurred_at: entry.created_at, placement: "active",
        category: sourceFault || ["github", "gmail", "youtube_channel"].includes(item?.source_kind || "") ? "organization" : "personal",
        title, summary: sourceFault ? "来源需要处理" : entry.subject_type === "goal_decision" ? "等待决定" : item?.summary || sourceLabel,
        content: sourceFault && typeof entry.detail?.user_action === "string" ? entry.detail.user_action
          : related?.content || "原事项暂不可读取。注意力记录仍保留，请到原事项检查。",
        facts: [["来自", sourceLabel], ["状态", entry.status === "in_progress" ? "处理中" : "待处理"], ["挂在", goalLabel]],
        needs_attention: true, open: target };
    }));
    return { source: { surface: "inbox", title: "Inbox", icon: "inbox" }, events: events.filter((event): event is HomeEvent => event !== null) };
  } };
}
