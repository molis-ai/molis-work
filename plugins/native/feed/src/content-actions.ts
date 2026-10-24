import { retainActionAuthority, ActionError, defineSubjectContextAction, subjectContext, bindSearchEntriesHandler, defineSearchEntriesAction, searchRevisionOf, searchText, type SearchEntry, bindWorkflowContentHandlers, defineWorkflowContentActions, type WorkflowPayload, type ActionSubject, type ActionSubjectContext, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { FeedApplication } from "./application.js";
import type { FeedItemRecord } from "./projection.js";
import { createFeedHomeEventsHandler } from "./home-events.js";
import { handInSourceFor, isHandInSource } from "./hand-in-sources.js";
import { feedArtifactPreviewHandler } from "./artifact-preview.js";

export const feedContentActions = defineWorkflowContentActions({ id: "feed", title: "Feed", icon: "rss", subject_kind: "feed_item",
  read_permissions: ["feed:read"], write_permissions: ["feed:write"], receive_scheduling: "concurrent" });

export const feedSubjectAction = defineSubjectContextAction("feed.subject.read", "feed_item", "Feed 材料", ["feed:read"]);
export const feedSourceSubjectAction = defineSubjectContextAction("feed.source.subject.read", "source", "来源状态", ["feed:read"]);
/**
 * System search: materials by title, summary, source and tags, and sources by name. Retained bodies are encrypted at rest
 * and only this owner decrypts them on request, so they never enter the plain-text index.
 */
export const feedSearchEntriesAction = defineSearchEntriesAction("feed.search.entries",
  [{ kind: "feed_item", title: "Feed 材料", surface: "feed" }, { kind: "source", title: "来源", surface: "feed" }], "Feed 材料与来源", ["feed:read"]);

export function createFeedContentHandlers(feed: FeedApplication, board: string, hydrate: (item: FeedItemRecord) => FeedItemRecord, readSubject?: (subject: ActionSubject, caller: ActionCallContext) => Promise<ActionSubjectContext>) {
  return [createFeedHomeEventsHandler(feed, board, hydrate, readSubject), feedArtifactPreviewHandler, ...bindWorkflowContentHandlers(feedContentActions, {
    list: () => feed.snapshot(board).feed_items.slice().sort((a, b) => String(b.imported_at).localeCompare(String(a.imported_at)))
      .map(item => ({ item_id: item.item_id, title: item.title, caption: item.source_label || item.source_kind || "Feed", at: item.imported_at })),
    read: ({ item_id }): WorkflowPayload => {
      const item = hydrate(feed.getFeedItem(board, item_id));
      const body = item.body || item.materials.map(material => material.content || material.preview).filter(Boolean).join("\n\n") || item.summary || "";
      return { title: item.title, body, url: item.url ?? null, source: item.source_label || item.source_kind || "Feed", feed_item_id: item.item_id };
    },
    receive: async (input, caller) => {
      const now = new Date().toISOString();
      const source = handInSourceFor(feed, board, caller.audience, now);
      // This action runs beside the project's queue while the model judges, so it judges what its own delivery queued and
      // nothing another producer queued meanwhile: that is judged by its owner, under its owner's authority.
      const { item } = await feed.ingestItemJudged({ source, externalId: input.request_id, title: input.title,
        summary: input.body.replace(/\s+/g, " ").trim().slice(0, 240), body: input.body, url: input.url ?? null,
        occurredAt: now, attention: false }, retainActionAuthority(caller, feedContentActions.receive));
      return { plugin: "feed", item_id: item.item_id, title: item.title };
    },
  }), bindSearchEntriesHandler(feedSearchEntriesAction, () => {
    const snapshot = feed.snapshot(board);
    const items = snapshot.feed_items.filter(item => item.disposition !== "archived").map((item): SearchEntry => {
      const summary = searchText([item.summary, item.source_label, item.author, ...(item.tags ?? [])].filter(Boolean).join(" · "), 1000);
      return { subject: { kind: "feed_item", id: item.item_id }, revision: searchRevisionOf([String(item.revision), item.disposition, item.title, summary]), title: item.title,
        summary, updated_at: item.updated_at || item.imported_at, content: "summary", open: { surface: "feed", id: item.item_id } };
    });
    const sources = snapshot.sources.filter(source => !isHandInSource(source.source_id)).map((source): SearchEntry => ({
      subject: { kind: "source", id: source.source_id }, revision: searchRevisionOf([source.updated_at, source.name, source.description ?? "", source.status]), title: source.name,
      summary: searchText(source.description, 600), updated_at: source.updated_at, content: "summary", open: { surface: "feed", id: source.source_id } }));
    return [...items, ...sources];
  }), { ...feedSubjectAction, handle: (_caller: unknown, input: unknown) => {
    const item = hydrate(feed.getFeedItem(board, (input as { subject_id: string }).subject_id));
    if (item.disposition === "archived") throw new ActionError("actions.subject_unavailable", "材料已归档，请回到原记录查看");
    return subjectContext({ subject: { kind: "feed_item", id: item.item_id }, revision: String(item.revision), title: item.title,
      content: item.body || item.materials.map(material => material.content || material.preview).filter(Boolean).join("\n\n") || item.summary || "",
      goal_ids: item.linked_goal_id ? [item.linked_goal_id] : [], session_id: null }, input as { offset?: number });
  } }, { ...feedSourceSubjectAction, handle: (_caller: unknown, input: unknown) => {
    const source = feed.snapshot(board).sources.find(source => source.source_id === (input as { subject_id: string }).subject_id);
    if (!source) throw new ActionError("actions.subject_unavailable", "来源已不存在");
    return subjectContext({ subject: { kind: "source", id: source.source_id }, revision: source.updated_at,
      title: source.name, content: [source.description, `状态：${source.status}`, source.last_error_code].filter(Boolean).join("\n"), goal_ids: [], session_id: null });
  } }];
}
