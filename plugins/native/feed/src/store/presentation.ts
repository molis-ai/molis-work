import type { FeedItemRecord } from "../contract/feed.js";
import type { FeedSql } from "./sql.js";

type ItemMetadata = Pick<FeedItemRecord, "item_id" | "source_id" | "title" | "source_label" | "read_at" | "revision" | "updated_at">;

export function feedPresentationRecords(sql: FeedSql, project: string) {
  return {
    item: (id: string) => sql.get(`SELECT item_id, source_id, title, source_label, read_at, revision, updated_at
      FROM feed_items WHERE project_id = ? AND item_id = ? AND disposition != 'archived'`, project, id) as ItemMetadata | undefined,
    recent: (limit: number) => sql.all(`SELECT item_id FROM feed_items WHERE project_id = ? AND disposition != 'archived'
      ORDER BY updated_at DESC, item_id LIMIT ?`, project, limit) as Pick<ItemMetadata, "item_id">[],
  };
}
