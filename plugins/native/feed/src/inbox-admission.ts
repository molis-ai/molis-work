import type { FeedApplication } from "./application.js";
import type { FeedItemRecord, InboxEntryRecord } from "./projection.js";

/** An ignored item comes back through restore, never by being admitted, reopened or reported on in the Inbox. */
export const isIgnored = (item: Pick<FeedItemRecord, "disposition">): boolean => item.disposition === "archived";

/** The item's entry, open: a new one, or the one already there reopened when it was done or dismissed. */
export function admitToInbox(feed: Pick<FeedApplication, "ensureInboxEntryForFeedItem" | "setInboxEntryStatus">, projectId: string, itemId: string, addedBy: string): { entry: InboxEntryRecord; created: boolean } {
  const stored = feed.ensureInboxEntryForFeedItem(projectId, itemId, "manual", { added_by: addedBy });
  if (stored.entry.status !== "done" && stored.entry.status !== "dismissed") return stored;
  return { entry: feed.setInboxEntryStatus(projectId, stored.entry.entry_id, "open", stored.entry.revision), created: stored.created };
}
