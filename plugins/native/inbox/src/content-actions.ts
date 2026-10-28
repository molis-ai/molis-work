import { defineSubjectContextAction, subjectContext, bindSearchEntriesHandler, defineSearchEntriesAction, searchRevisionOf, type SearchEntry, type ActionSubject, type ActionSubjectContext, ActionError, bindWorkflowContentHandlers, defineWorkflowContentActions, type ActionCallContext,
  type WorkflowPayload, type WorkflowReceiveInput, type WorkflowItemRef } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AttentionEntryRecord } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import { createInboxHomeEventsHandler } from "./home-events.js";

export const inboxContentActions = defineWorkflowContentActions({ id: "inbox", title: "Inbox", icon: "inbox", subject_kind: "inbox_entry",
  read_permissions: ["inbox:read", "feed:read"], write_permissions: ["inbox:write", "feed:write", "feed:read"], receive_scheduling: "concurrent" });

export const inboxSubjectAction = defineSubjectContextAction("inbox.subject.read", "inbox_entry", "Inbox 事项", ["inbox:read"]);
/** System search: open entries by title, reason and source. The related material's body stays with its owner (Feed keeps it encrypted). */
export const inboxSearchEntriesAction = defineSearchEntriesAction("inbox.search.entries", [{ kind: "inbox_entry", title: "Inbox 事项", surface: "inbox" }], "Inbox 事项", ["inbox:read"]);
const REASON_TEXT: Readonly<Record<string, string>> = { manual: "手动加入", source_rule: "来源规则加入", goal_decision: "目标待决定", source_fault: "来源故障", artifact_out_failed: "成果发出失败" };

type ContentEntry = Omit<AttentionEntryRecord, "project_id">;

/** What Feed shows an item an entry points at (`feed.briefs.read`): its name and where it came from, never its text. */
export interface InboxItemBrief { item_id: string; title: string; source_label: string | null; source_kind: string | null; summary: string; disposition: string }
export interface InboxBriefs { items: ReadonlyMap<string, InboxItemBrief>; sources: ReadonlyMap<string, { source_id: string; name: string }> }

/** The items and sources the open entries point at, asked of Feed once for all of them. */
async function briefsOf(ports: InboxContentPorts, caller: ActionCallContext, entries: readonly ContentEntry[]): Promise<InboxBriefs> {
  const item_ids = [...new Set(entries.filter(entry => entry.subject_type === "feed_item").map(entry => entry.subject_id))];
  const source_ids = [...new Set(entries.filter(entry => entry.subject_type === "source_fault").map(entry => entry.subject_id))];
  return ports.briefs(caller, { item_ids, source_ids });
}
const openEntries = (ports: InboxContentPorts) => ports.entries().filter(entry => entry.status === "open" || entry.status === "in_progress");

export interface InboxContentPorts {
  entries(): readonly ContentEntry[];
  entry(id: string): ContentEntry;
  /** Feed's names for the items and sources asked about; one that Feed no longer has is left out. */
  briefs(caller: ActionCallContext, ids: { item_ids: readonly string[]; source_ids: readonly string[] }): Promise<InboxBriefs>;
  readSubject?(subject: ActionSubject, caller: ActionCallContext): Promise<ActionSubjectContext>;
  readFeed(id: string, caller: ActionCallContext): Promise<WorkflowPayload>;
  receiveFeed(input: WorkflowReceiveInput, caller: ActionCallContext): Promise<WorkflowItemRef>;
  /** The item's entry, open and judged: Feed adds it, or reopens the one that was done or dismissed (`feed.items.admit`); who added it is Feed's reading of the caller. */
  admit(itemId: string, caller: ActionCallContext): Promise<{ entry_id: string }>;
}
export function createInboxContentHandlers(ports: InboxContentPorts) {
  return [createInboxHomeEventsHandler(ports, (caller, entries) => briefsOf(ports, caller, entries)), ...bindWorkflowContentHandlers(inboxContentActions, {
    list: async caller => {
      const entries = openEntries(ports), { items, sources } = await briefsOf(ports, caller, entries);
      return entries.flatMap(entry => {
        if (entry.subject_type === "feed_item") {
          const item = items.get(entry.subject_id);
          return item ? [{ item_id: entry.entry_id, title: item.title, caption: item.source_label || "Feed", at: entry.updated_at }] : [];
        }
        if (entry.subject_type === "source_fault") {
          const source = sources.get(entry.subject_id);
          return source ? [{ item_id: entry.entry_id, title: `来源「${source.name}」需要处理`, caption: "来源故障", at: entry.updated_at }] : [];
        }
        return [];
      });
    },
    read: async ({ item_id }, caller) => {
      const entry = ports.entry(item_id);
      if (entry.subject_type === "feed_item") return ports.readFeed(entry.subject_id, caller);
      if (entry.subject_type === "source_fault") {
        const source = (await briefsOf(ports, caller, [entry])).sources.get(entry.subject_id);
        if (!source) throw new ActionError("actions.missing", "来源已经不存在");
        const detail = typeof entry.detail?.message === "string" ? entry.detail.message : "";
        return { title: `来源「${source.name}」需要处理`, body: detail || `来源「${source.name}」需要人工恢复。`, source: source.name, feed_item_id: null };
      }
      throw new ActionError("actions.input_invalid", "这条 Inbox 事项没有可以交接的正文");
    },
    receive: async (input, caller) => {
      const itemId = input.feed_item_id ?? (await ports.receiveFeed(input, caller)).item_id;
      const entry = await ports.admit(itemId, caller);
      return { plugin: "inbox", item_id: entry.entry_id, title: input.title };
    },
  }), bindSearchEntriesHandler(inboxSearchEntriesAction, async caller => {
    const entries = openEntries(ports), { items, sources } = await briefsOf(ports, caller, entries);
    return entries.map((entry): SearchEntry => {
      const item = entry.subject_type === "feed_item" ? items.get(entry.subject_id) : undefined;
      const source = entry.subject_type === "source_fault" ? sources.get(entry.subject_id) : undefined;
      const title = item?.title ?? (source ? `来源「${source.name}」需要处理` : typeof entry.detail?.title === "string" ? entry.detail.title : "Inbox 事项");
      const summary = [REASON_TEXT[entry.reason] ?? entry.reason, item?.source_label, item?.summary, typeof entry.detail?.message === "string" ? entry.detail.message : ""].filter(Boolean).join(" · ").slice(0, 600);
      return { subject: { kind: "inbox_entry", id: entry.entry_id }, revision: searchRevisionOf([String(entry.revision), entry.status, title, summary]), title, summary,
        updated_at: entry.updated_at, content: "summary", open: { surface: "inbox", id: entry.entry_id } };
    });
  }), { ...inboxSubjectAction, handle: async (caller: ActionCallContext, input: unknown) => {
    const entry = ports.entry((input as { subject_id: string }).subject_id);
    if (entry.status !== "open" && entry.status !== "in_progress") throw new ActionError("actions.subject_unavailable", "此事项已处理，请回到原记录查看");
    if (!ports.readSubject) throw new ActionError("actions.service_unavailable", "对象上下文服务不可用");
    const related = await ports.readSubject({ kind: entry.subject_type === "feed_item" ? "feed_item" : entry.subject_type === "goal_decision" ? "goal" : "source", id: entry.subject_id }, caller);
    const current = ports.entry(entry.entry_id);
    if (current.revision !== entry.revision || current.subject_id !== entry.subject_id || current.status !== entry.status) throw new ActionError("actions.subject_changed", "事项在读取期间已变化");
    return subjectContext({ subject: { kind: "inbox_entry", id: entry.entry_id }, revision: `${entry.revision}:${related.revision}`,
      title: related.title, content: related.content, truncated: related.truncated, ...(related.goal_ids ? { goal_ids: related.goal_ids } : {}) });
  } }];
}
