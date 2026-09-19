import type { AttentionApi, AttentionReason } from "./attention-resumption.js";
import type { ContractDescriptor } from "../platform/package.js";

export const modulesFeedContract = {
  contractId: "io.molis.work.module.feed.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/modules/feed.md",
} as const satisfies ContractDescriptor;

export type FeedItemDisposition = "inbox" | "saved" | "promoted" | "processing" | "archived";

export interface FeedMaterialRecord {
  project_id: string;
  material_id: string;
  item_id: string;
  canonical_url: string | null;
  title: string;
  source_name: string;
  published_at: string | null;
  preview: string;
  content_hash: string | null;
  content_ref: string | null;
  content_available: boolean;
  content_type: string | null;
  character_count: number | null;
  captured_at: string | null;
  provenance: Record<string, unknown>;
  selected_for_context: boolean;
  imported_at: string;
  updated_at: string;
}

export interface FeedItemRecord {
  project_id: string;
  item_id: string;
  source_id: string | null;
  signal_id: string | null;
  signal_revision: number | null;
  kind: string;
  title: string;
  summary: string;
  body: string | null;
  source_kind: string;
  source_label: string;
  external_id: string | null;
  url: string | null;
  origin_status: string;
  priority: string;
  tags: string[];
  author: string | null;
  disposition: FeedItemDisposition;
  linked_goal_id: string | null;
  read_at: string | null;
  revision: number;
  source_created_at: string;
  source_updated_at: string;
  imported_at: string;
  updated_at: string;
  materials: FeedMaterialRecord[];
}

export interface FeedAttentionRequest {
  reason: Extract<AttentionReason, "manual" | "source_rule">;
  detail?: Record<string, unknown>;
}

export interface IngestFeedItemInput {
  project_id: string;
  source_id: string;
  source_kind: string;
  source_label: string;
  external_id: string;
  signal?: { signal_id: string; revision: number };
  title: string;
  summary: string;
  body?: string | null;
  url?: string | null;
  kind?: string;
  priority?: string;
  tags?: string[];
  author?: string | null;
  occurred_at: string;
  attention?: false | FeedAttentionRequest;
  material?: Omit<FeedMaterialRecord, "project_id" | "item_id" | "imported_at" | "updated_at">;
}

export interface FeedQuery {
  list(projectId: string): FeedItemRecord[];
  get(projectId: string, itemId: string): FeedItemRecord;
  exists(projectId: string, itemId: string): boolean;
  countBySource(projectId: string, sourceId: string): number;
  findByLinkedGoal(projectId: string, goalId: string, itemId?: string): FeedItemRecord | null;
}

export interface FeedCommands {
  ingest(input: IngestFeedItemInput): { item: FeedItemRecord; created: boolean; updated: boolean };
  upsertMaterial(material: FeedMaterialRecord): FeedMaterialRecord;
  setDisposition(
    projectId: string,
    itemId: string,
    disposition: FeedItemDisposition,
    expectedRevision?: number,
  ): FeedItemRecord;
  restore(projectId: string, itemId: string, expectedRevision?: number): FeedItemRecord;
  markRead(projectId: string, itemId: string, expectedItemType?: "feed" | "inbox_message"): FeedItemRecord;
  linkGoal(
    projectId: string,
    itemId: string,
    goalId: string,
    disposition: "promoted" | "processing",
  ): FeedItemRecord;
  deleteBySource(projectId: string, sourceId: string): string[];
}

export interface FeedEvent {
  event_id: string;
  project_id: string;
  item_id: string;
  type:
    | "feed_item.created"
    | "feed_item.updated"
    | "feed_item.read"
    | "feed_item.restored"
    | "feed_item.saved"
    | "feed_item.promoted"
    | "feed_item.processing"
    | "feed_item.archived"
    | "feed_item.inbox"
    | "feed_item.deleted";
  payload: Record<string, unknown>;
  at: string;
}

export interface FeedEvents {
  list(projectId: string, itemId?: string): FeedEvent[];
}

export interface FeedApi {
  readonly query: FeedQuery;
  readonly commands: FeedCommands;
  readonly events: FeedEvents;
}

export interface InfoflowContractMigrationReport {
  receipt_id: string;
  schema_version: number;
  preflight: { feed_items: number; legacy_inbox_messages: number; inbox_entries: number };
  postflight: {
    feed_items: number;
    legacy_inbox_messages: number;
    inbox_entries: number;
    orphan_feed_item_entries: number;
  };
  rollback_strategy: "sqlite_immediate_transaction";
  applied_at: string;
}

export interface FeedModuleDependencies {
  attention: AttentionApi;
}

export interface FeedContractMigrationReceiptRecord {
  receipt_id: string;
  schema_version: number;
  preflight: Record<string, number>;
  postflight: Record<string, number>;
  rollback_strategy: "sqlite_immediate_transaction";
  applied_at: string;
}

export class FeedError extends Error {
  constructor(
    readonly code:
      | "feed_item_not_found"
      | "feed_revision_conflict"
      | "feed_invalid_transition"
      | "feed_read_not_supported",
    message: string,
  ) {
    super(message);
    this.name = "FeedError";
  }
}

export class FeedDomainError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "FeedDomainError";
  }
}
