import { createFeedEvidenceContentStore } from "@molis-ai/molis-work-module-feed";
import type { FeedItemRecord, FeedSnapshot } from "@molis-ai/molis-work-plugin-feed";

/**
 * Decrypt retained evidence only at the local presentation boundary. A missing
 * key/blob is represented as unavailable; it never makes the Item unreadable.
 */
export function hydrateFeedItemContent(item: FeedItemRecord): FeedItemRecord {
  if (!item.materials.some((material) => material.content_ref)) return item;
  const content = createFeedEvidenceContentStore();
  return {
    ...item,
    materials: item.materials.map((material) => {
      if (!material.content_ref) return material;
      try {
        return { ...material, content: content.read(material.content_ref), content_available: true };
      } catch {
        return { ...material, content: null, content_available: false };
      }
    }),
  };
}

export function hydrateFeedSnapshotContent(snapshot: FeedSnapshot): FeedSnapshot {
  return { ...snapshot, feed_items: snapshot.feed_items.map(hydrateFeedItemContent) };
}
