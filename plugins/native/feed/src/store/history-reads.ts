import type { FeedSql } from "./sql.js";

/** The database deduplicates references, including repeated receipt refs, before returning one bounded page. */
export function historyReads(sql: FeedSql) {
  return {
    refs(sourceId: string, after: string): string[] {
      return sql.all<{ ref: string }>(`SELECT ref FROM (
        SELECT content_ref AS ref FROM feed_materials WHERE item_id IN
          (SELECT item_id FROM feed_items WHERE source_id = ?)
        UNION SELECT value AS ref FROM feed_source_runs, json_each(feed_source_runs.receipt_json, '$.content_refs')
          WHERE source_id = ? AND json_each.type = 'text'
        ) WHERE ref > ? ORDER BY ref LIMIT 200`, sourceId, sourceId, after).map(row => row.ref);
    },
    operations(sourceId: string, after: string): string[] {
      return sql.all<{ operation_id: string }>(`SELECT operation_id FROM feed_source_runs
        WHERE source_id = ? AND operation_id > ? ORDER BY operation_id LIMIT 200`,
      sourceId, after).map(row => row.operation_id);
    },
  };
}
