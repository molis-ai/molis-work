import type { FeedItemRecord as ModuleFeedItemRecord } from "@molis-ai/molis-work-contracts/modules/feed";

import type { ListenerRunRecord } from "@molis-ai/molis-work-contracts/services/listener-host";

import type { FeedItemRecord, FeedSourceRunRecord } from "./projection.js";

/** The tag a pulled Feed item carries for its source: an internal marker, not something a person reads. */
const FEED_SOURCE_TAG_PREFIX = "feed-source:";

/** A Feed item as the plugin shows it: the module record without its signal fields, typed as a Feed item. The internal source tag
 * SourceSync writes on every pulled item is dropped here; stop writing it there and remove both in the same change. */
export function feedItemRecord(item: ModuleFeedItemRecord): FeedItemRecord {
  return {
    project_id: item.project_id,
    item_id: item.item_id,
    source_id: item.source_id,
    item_type: "feed",
    kind: item.kind,
    title: item.title,
    summary: item.summary,
    body: item.body,
    source_kind: item.source_kind,
    source_label: item.source_label,
    external_id: item.external_id,
    url: item.url,
    origin_status: item.origin_status,
    priority: item.priority,
    tags: item.tags.filter(tag => !tag.startsWith(FEED_SOURCE_TAG_PREFIX)),
    author: item.author,
    disposition: item.disposition,
    linked_goal_id: item.linked_goal_id,
    read_at: item.read_at,
    revision: item.revision,
    source_created_at: item.source_created_at,
    source_updated_at: item.source_updated_at,
    imported_at: item.imported_at,
    updated_at: item.updated_at,
    materials: item.materials,
  };
}

/** A source run with the connector's receipt under the name the Feed UI reads. */
export function sourceRunRecord(run: ListenerRunRecord): FeedSourceRunRecord {
  return {
    project_id: run.project_id,
    run_id: run.run_id,
    operation_id: run.operation_id,
    source_id: run.source_id,
    phase: run.phase,
    outcome: run.outcome,
    empty: run.empty,
    error_code: run.error_code,
    receipt: run.connector_receipt,
    created_count: run.created_count,
    deduped_count: run.deduped_count,
    recovery_count: run.recovery_count,
    started_at: run.started_at,
    completed_at: run.completed_at,
    updated_at: run.updated_at,
  };
}
