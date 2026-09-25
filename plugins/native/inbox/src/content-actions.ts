import { ActionError, bindWorkflowContentHandlers, defineWorkflowContentActions, type ActionCallContext,
  type WorkflowPayload, type WorkflowReceiveInput, type WorkflowItemRef } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AttentionEntryRecord } from "@molis-ai/molis-work-contracts/modules/attention-resumption";

export const inboxContentActions = defineWorkflowContentActions({ id: "inbox", title: "Inbox", icon: "inbox",
  read_permissions: ["inbox:read", "feed:read"], write_permissions: ["inbox:write", "feed:write"] });

type ContentEntry = Omit<AttentionEntryRecord, "project_id">;

export interface InboxContentPorts {
  entries(): readonly ContentEntry[];
  entry(id: string): ContentEntry;
  items(): readonly { item_id: string; title: string; source_label: string | null }[];
  sources(): readonly { source_id: string; name: string }[];
  readFeed(id: string, caller: ActionCallContext): Promise<WorkflowPayload>;
  receiveFeed(input: WorkflowReceiveInput, caller: ActionCallContext): Promise<WorkflowItemRef>;
  ensure(itemId: string, instanceId: string): ContentEntry;
  reopen(entry: ContentEntry): ContentEntry;
  flush(): Promise<void>;
}
export function createInboxContentHandlers(ports: InboxContentPorts) {
  return bindWorkflowContentHandlers(inboxContentActions, {
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
      const itemId = input.payload.feed_item_id ?? (await ports.receiveFeed(input, caller)).item_id;
      const stored = ports.ensure(itemId, input.context.instance_id);
      const entry = stored.status === "done" || stored.status === "dismissed" ? ports.reopen(stored) : stored;
      await ports.flush();
      return { plugin: "inbox", item_id: entry.entry_id, title: input.payload.title };
    },
  });
}
