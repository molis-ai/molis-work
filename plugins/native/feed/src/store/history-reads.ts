import type { FeedSql } from "./sql.js";

/** Holder key for kept project bodies whose owning row has no source_id (null or blank). */
export const FEED_UNASSIGNED_BODY_HOLDER = "__unassigned__";

export interface ProjectBodyRefRow {
  readonly source_id: string;
  readonly ref: string;
}

/** The database deduplicates references, including repeated receipt refs, before returning one bounded page. */
export function historyReads(sql: FeedSql) {
  return {
    refs(sourceId: string, after: string): string[] {
      return sql.all<{ ref: string }>(
        `SELECT ref FROM (
          SELECT feed_materials.content_ref AS ref
          FROM feed_materials
          JOIN feed_items ON feed_items.item_id = feed_materials.item_id
          WHERE feed_materials.content_ref IS NOT NULL
            AND feed_items.source_id = ?
          UNION
          SELECT run_refs.value AS ref
          FROM feed_source_runs
          JOIN json_each(feed_source_runs.receipt_json, '$.content_refs') AS run_refs
          WHERE feed_source_runs.source_id = ?
            AND feed_source_runs.receipt_json IS NOT NULL
            AND json_valid(feed_source_runs.receipt_json)
            AND json_type(feed_source_runs.receipt_json, '$.content_refs') = 'array'
            AND run_refs.type = 'text'
          UNION
          SELECT signal_refs.value AS ref
          FROM signals
          JOIN json_each(signals.content_refs_json) AS signal_refs
          WHERE signals.source_id = ?
            AND json_valid(signals.content_refs_json)
            AND json_type(signals.content_refs_json) = 'array'
            AND signal_refs.type = 'text'
          UNION
          SELECT revision_refs.value AS ref
          FROM signal_revisions
          JOIN signals ON signals.signal_id = signal_revisions.signal_id
          JOIN json_each(signal_revisions.draft_json, '$.content_refs') AS revision_refs
          WHERE signals.source_id = ?
            AND json_valid(signal_revisions.draft_json)
            AND json_type(signal_revisions.draft_json, '$.content_refs') = 'array'
            AND revision_refs.type = 'text'
        )
        WHERE ref > ?
        ORDER BY ref
        LIMIT 200`,
        sourceId,
        sourceId,
        sourceId,
        sourceId,
        after,
      ).map((row) => row.ref);
    },
    projectRefs(afterSourceId: string, afterRef: string): ProjectBodyRefRow[] {
      return sql.all<ProjectBodyRefRow>(
        `SELECT source_id, ref FROM (
          SELECT COALESCE(NULLIF(TRIM(feed_items.source_id), ''), ?) AS source_id,
                 feed_materials.content_ref AS ref
          FROM feed_materials
          LEFT JOIN feed_items ON feed_items.item_id = feed_materials.item_id
          WHERE feed_materials.content_ref IS NOT NULL
          UNION
          SELECT COALESCE(NULLIF(TRIM(feed_source_runs.source_id), ''), ?) AS source_id,
                 run_refs.value AS ref
          FROM feed_source_runs
          JOIN json_each(feed_source_runs.receipt_json, '$.content_refs') AS run_refs
          WHERE feed_source_runs.receipt_json IS NOT NULL
            AND json_valid(feed_source_runs.receipt_json)
            AND json_type(feed_source_runs.receipt_json, '$.content_refs') = 'array'
            AND run_refs.type = 'text'
          UNION
          SELECT COALESCE(NULLIF(TRIM(signals.source_id), ''), ?) AS source_id,
                 signal_refs.value AS ref
          FROM signals
          JOIN json_each(signals.content_refs_json) AS signal_refs
          WHERE json_valid(signals.content_refs_json)
            AND json_type(signals.content_refs_json) = 'array'
            AND signal_refs.type = 'text'
          UNION
          SELECT COALESCE(
                   NULLIF(TRIM(signals.source_id), ''),
                   NULLIF(TRIM(CAST(json_extract(signal_revisions.draft_json, '$.source_id') AS TEXT)), ''),
                   ?
                 ) AS source_id,
                 revision_refs.value AS ref
          FROM signal_revisions
          LEFT JOIN signals ON signals.signal_id = signal_revisions.signal_id
          JOIN json_each(signal_revisions.draft_json, '$.content_refs') AS revision_refs
          WHERE json_valid(signal_revisions.draft_json)
            AND json_type(signal_revisions.draft_json, '$.content_refs') = 'array'
            AND revision_refs.type = 'text'
        )
        WHERE source_id > ? OR (source_id = ? AND ref > ?)
        ORDER BY source_id, ref
        LIMIT 200`,
        FEED_UNASSIGNED_BODY_HOLDER,
        FEED_UNASSIGNED_BODY_HOLDER,
        FEED_UNASSIGNED_BODY_HOLDER,
        FEED_UNASSIGNED_BODY_HOLDER,
        afterSourceId,
        afterSourceId,
        afterRef,
      );
    },
    operations(sourceId: string, after: string): string[] {
      return sql.all<{ operation_id: string }>(
        `SELECT operation_id
        FROM feed_source_runs
        WHERE source_id = ? AND operation_id > ?
        ORDER BY operation_id
        LIMIT 200`,
        sourceId,
        after,
      ).map((row) => row.operation_id);
    },
  };
}
