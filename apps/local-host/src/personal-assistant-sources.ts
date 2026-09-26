import { createHash } from "node:crypto";
import { ActionError, type ActionCallContext, type ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { FeedItemRecord } from "@molis-ai/molis-work-contracts/modules/feed";
import type { SourceRecord } from "@molis-ai/molis-work-contracts/modules/sources";
import type { AssistantSource } from "./personal-assistant-types.js";

type Source = Pick<SourceRecord, "source_id" | "kind" | "sync_kind" | "name" | "status" | "enabled" | "config" | "updated_at" | "imported_at"> & { credential_ref: string | null };
type Item = Pick<FeedItemRecord, "source_id" | "external_id" | "source_created_at" | "imported_at" | "disposition">;
/** Feed owns content/provenance; the Connector owner checks the live account grant without exposing secrets. */
export function createPersonalAssistantMaterialInspector(options: {
  projectId: string; boardId: string;
  feed: {
    getFeedItem(board: string, id: string): Item;
    getSource(board: string, id: string): Source;
    getInboxEntry(board: string, id: string): { subject_type: string; subject_id: string };
  };
  inspectSourceAuthorization(source: Source): Promise<{ authorized: boolean; connection_id: string | null; revision: string | null; reason?: string }>;
}): (subject: ActionSubject, caller: ActionCallContext) => Promise<AssistantSource | null> {
  return async (subject, caller) => {
    if (caller.project_id !== options.projectId) throw new ActionError("assistant.scope", "材料不属于当前项目");
    let kind = subject.kind, id = subject.id;
    if (kind === "inbox_entry") {
      if (!caller.permissions.includes("inbox:read")) throw new ActionError("assistant.forbidden", "当前没有 Inbox 读取权限");
      const entry = options.feed.getInboxEntry(options.boardId, id);
      kind = entry.subject_type; id = entry.subject_id;
      if (kind === "source_fault") kind = "source";
    }
    if (kind !== "feed_item" && kind !== "source") return null;
    if (!caller.permissions.includes("feed:read")) throw new ActionError("assistant.forbidden", "当前没有来源材料读取权限");
    const item = kind === "feed_item" ? options.feed.getFeedItem(options.boardId, id) : null;
    if (item && (item.disposition === "archived" || !item.source_id)) throw new ActionError("assistant.source_unavailable", "原来源不存在或材料已归档");
    const source = options.feed.getSource(options.boardId, item?.source_id ?? id);
    const authority = await options.inspectSourceAuthorization(source);
    if (!authority.authorized) throw new ActionError("assistant.source_unavailable", authority.reason ?? "来源授权已失效，请在 Connectors 中检查");
    return { source_id: source.source_id, name: source.name, connection_id: authority.connection_id,
      source_revision: createHash("sha256").update(JSON.stringify([source.kind, source.sync_kind, source.name, source.status, source.enabled, source.config, source.credential_ref])).digest("hex"), authorization_revision: authority.revision, external_id: item?.external_id ?? null,
      occurred_at: item?.source_created_at ?? source.updated_at, observed_at: item?.imported_at ?? source.imported_at };
  };
}
