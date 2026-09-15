import type { AttentionEntryRecord as ModuleAttentionEntryRecord } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { FeedItemRecord as ModuleFeedItemRecord, FeedMaterialRecord as ModuleFeedMaterialRecord } from "@molis-ai/molis-work-contracts/modules/feed";

import type { ListenerRunRecord } from "@molis-ai/molis-work-contracts/services/listener-host";

import type { FeedItemRecord, FeedMaterialRecord, FeedSourceRunRecord, InboxEntryRecord, InboxEntryStatus } from "./projection.js";

export function toLegacyAttentionEntry(entry: ModuleAttentionEntryRecord): InboxEntryRecord {
  return {
    board_id: entry.project_id,
    entry_id: entry.entry_id,
    subject_type: entry.subject_type,
    subject_id: entry.subject_id,
    reason: entry.reason,
    status: entry.status,
    detail: entry.detail,
    revision: entry.revision,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
    completed_at: entry.completed_at,
  };
}

export function toLegacyFeedMaterial(material: ModuleFeedMaterialRecord): FeedMaterialRecord {
  return {
    board_id: material.project_id,
    material_id: material.material_id,
    item_id: material.item_id,
    canonical_url: material.canonical_url,
    title: material.title,
    source_name: material.source_name,
    published_at: material.published_at,
    preview: material.preview,
    content_hash: material.content_hash,
    content_ref: material.content_ref,
    content_available: material.content_available,
    content_type: material.content_type,
    character_count: material.character_count,
    captured_at: material.captured_at,
    provenance: material.provenance,
    selected_for_context: material.selected_for_context,
    imported_at: material.imported_at,
    updated_at: material.updated_at,
  };
}

export function toLegacyFeedItem(item: ModuleFeedItemRecord): FeedItemRecord {
  return {
    board_id: item.project_id,
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
    tags: item.tags,
    author: item.author,
    disposition: item.disposition,
    linked_goal_id: item.linked_goal_id,
    read_at: item.read_at,
    revision: item.revision,
    source_created_at: item.source_created_at,
    source_updated_at: item.source_updated_at,
    imported_at: item.imported_at,
    updated_at: item.updated_at,
    materials: item.materials.map(toLegacyFeedMaterial),
  };
}

export function compatibleRun(run: ListenerRunRecord): FeedSourceRunRecord {
  return {
    board_id: run.project_id,
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

export function isActiveAttention(status: InboxEntryStatus): boolean {
  return status === "open" || status === "in_progress";
}
