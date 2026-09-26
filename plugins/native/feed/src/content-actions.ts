import { FEED_PLUGIN_ID } from "./identity.js";
import { retainActionAuthority, ActionError, defineSubjectContextAction, subjectContext, bindWorkflowContentHandlers, defineWorkflowContentActions, type WorkflowPayload, type ActionSubject, type ActionSubjectContext, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { FeedApplication } from "./application.js";
import type { FeedItemRecord } from "./projection.js";
import { createFeedHomeEventsHandler } from "./home-events.js";

export const feedContentActions = defineWorkflowContentActions({ id: "feed", title: "Feed", icon: "rss",
  read_permissions: ["feed:read"], write_permissions: ["feed:write"] });

export const feedSubjectAction = defineSubjectContextAction("feed.subject.read", "feed_item", "Feed 材料", ["feed:read"]);
export const feedSourceSubjectAction = defineSubjectContextAction("feed.source.subject.read", "source", "来源状态", ["feed:read"]);

export function createFeedContentHandlers(feed: FeedApplication, board: string, hydrate: (item: FeedItemRecord) => FeedItemRecord, readSubject?: (subject: ActionSubject, caller: ActionCallContext) => Promise<ActionSubjectContext>) {
  return [createFeedHomeEventsHandler(feed, board, hydrate, readSubject), ...bindWorkflowContentHandlers(feedContentActions, {
    list: () => feed.snapshot(board).feed_items.slice().sort((a, b) => String(b.imported_at).localeCompare(String(a.imported_at)))
      .map(item => ({ item_id: item.item_id, title: item.title, caption: item.source_label || item.source_kind || "Feed", at: item.imported_at })),
    read: ({ item_id }): WorkflowPayload => {
      const item = hydrate(feed.getFeedItem(board, item_id));
      const body = item.body || item.materials.map(material => material.content || material.preview).filter(Boolean).join("\n\n") || item.summary || "";
      return { title: item.title, body, url: item.url ?? null, source: item.source_label || item.source_kind || "Feed", feed_item_id: item.item_id };
    },
    receive: async ({ payload, context }, caller) => {
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
      await feed.flushPendingJudgments(retainActionAuthority(caller, { ...feedContentActions.receive, provider_id: FEED_PLUGIN_ID }));
      return { plugin: "feed", item_id: item.item_id, title: item.title };
    },
  }), { ...feedSubjectAction, handle: (_caller: unknown, input: unknown) => {
    const item = hydrate(feed.getFeedItem(board, (input as { subject_id: string }).subject_id));
    if (item.disposition === "archived") throw new ActionError("actions.subject_unavailable", "材料已归档，请回到原记录查看");
    return subjectContext({ subject: { kind: "feed_item", id: item.item_id }, revision: String(item.revision), title: item.title,
      content: item.body || item.materials.map(material => material.content || material.preview).filter(Boolean).join("\n\n") || item.summary || "",
      goal_ids: item.linked_goal_id ? [item.linked_goal_id] : [], session_id: null });
  } }, { ...feedSourceSubjectAction, handle: (_caller: unknown, input: unknown) => {
    const source = feed.snapshot(board).sources.find(source => source.source_id === (input as { subject_id: string }).subject_id);
    if (!source) throw new ActionError("actions.subject_unavailable", "来源已不存在");
    return subjectContext({ subject: { kind: "source", id: source.source_id }, revision: source.updated_at,
      title: source.name, content: [source.description, `状态：${source.status}`, source.last_error_code].filter(Boolean).join("\n"), goal_ids: [], session_id: null });
  } }];
}
