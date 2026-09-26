import { INBOX_PLUGIN_ID } from "./identity.js";
import { retainActionAuthority, defineSubjectContextAction, subjectContext, type ActionSubject, type ActionSubjectContext, ActionError, bindWorkflowContentHandlers, defineWorkflowContentActions, type ActionCallContext,
  type WorkflowPayload, type WorkflowReceiveInput, type WorkflowItemRef } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AttentionEntryRecord } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import { createInboxHomeEventsHandler } from "./home-events.js";

export const inboxContentActions = defineWorkflowContentActions({ id: "inbox", title: "Inbox", icon: "inbox",
  read_permissions: ["inbox:read", "feed:read"], write_permissions: ["inbox:write", "feed:write"] });

export const inboxSubjectAction = defineSubjectContextAction("inbox.subject.read", "inbox_entry", "Inbox 事项", ["inbox:read"]);

type ContentEntry = Omit<AttentionEntryRecord, "project_id">;

export interface InboxContentPorts {
  entries(): readonly ContentEntry[];
  entry(id: string): ContentEntry;
  items(): readonly { item_id: string; title: string; source_label: string | null; source_kind?: string; summary?: string }[];
  sources(): readonly { source_id: string; name: string }[];
  readSubject?(subject: ActionSubject, caller: ActionCallContext): Promise<ActionSubjectContext>;
  readFeed(id: string, caller: ActionCallContext): Promise<WorkflowPayload>;
  receiveFeed(input: WorkflowReceiveInput, caller: ActionCallContext): Promise<WorkflowItemRef>;
  ensure(itemId: string, instanceId: string): ContentEntry;
  reopen(entry: ContentEntry): ContentEntry;
  flush(caller: ActionCallContext, entryId: string): Promise<void>;
}
export function createInboxContentHandlers(ports: InboxContentPorts) {
  return [createInboxHomeEventsHandler(ports), ...bindWorkflowContentHandlers(inboxContentActions, {
    list: () => {
      const items = new Map(ports.items().map(item => [item.item_id, item]));
      const sources = new Map(ports.sources().map(source => [source.source_id, source]));
      return ports.entries().filter(entry => entry.status === "open" || entry.status === "in_progress").flatMap(entry => {
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
        const source = ports.sources().find(source => source.source_id === entry.subject_id);
        if (!source) throw new ActionError("actions.missing", "来源已经不存在");
        const detail = typeof entry.detail?.message === "string" ? entry.detail.message : "";
        return { title: `来源「${source.name}」需要处理`, body: detail || `来源「${source.name}」需要人工恢复。`, source: source.name, feed_item_id: null };
      }
      throw new ActionError("actions.invalid_input", "这条 Inbox 事项没有可以交接的正文");
    },
    receive: async (input, caller) => {
      const origin = { ...inboxContentActions.receive, provider_id: INBOX_PLUGIN_ID };
      const nestedCaller = retainActionAuthority(caller, origin);
      const itemId = input.payload.feed_item_id ?? (await ports.receiveFeed(input, nestedCaller)).item_id;
      await nestedCaller.validate_authority?.(origin);
      const stored = ports.ensure(itemId, input.context.instance_id);
      const entry = stored.status === "done" || stored.status === "dismissed" ? ports.reopen(stored) : stored;
      await ports.flush(nestedCaller, entry.entry_id);
      return { plugin: "inbox", item_id: entry.entry_id, title: input.payload.title };
    },
  }), { ...inboxSubjectAction, handle: async (caller: ActionCallContext, input: unknown) => {
    const entry = ports.entry((input as { subject_id: string }).subject_id);
    if (entry.status !== "open" && entry.status !== "in_progress") throw new ActionError("actions.subject_unavailable", "此事项已处理，请回到原记录查看");
    if (!ports.readSubject) throw new ActionError("actions.service_unavailable", "对象上下文服务不可用");
    const related = await ports.readSubject({ kind: entry.subject_type === "feed_item" ? "feed_item" : entry.subject_type === "goal_decision" ? "goal" : "source", id: entry.subject_id }, caller);
    const current = ports.entry(entry.entry_id);
    if (current.revision !== entry.revision || current.subject_id !== entry.subject_id || current.status !== entry.status) throw new ActionError("actions.subject_changed", "事项在读取期间已变化");
    return subjectContext({ subject: { kind: "inbox_entry", id: entry.entry_id }, revision: `${entry.revision}:${related.revision}`,
      title: related.title, content: related.content, truncated: related.truncated, goal_ids: related.goal_ids, session_id: related.session_id });
  } }];
}
