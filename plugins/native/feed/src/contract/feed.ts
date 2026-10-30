import type { AttentionApi, AttentionReason } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

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
  /** A source without Signals declares that this existing item's content changed, so it updates with its material. */
  refresh?: boolean;
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
  markRead(projectId: string, itemId: string): FeedItemRecord;
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

export interface FeedModuleDependencies {
  attention: AttentionApi;
}

/**
 * Feed's own error codes, every one `feed.<reason>`. The kind is the sort of failure; the Host's edge turns it into the status
 * (plugin SDK `actionHttpStatus`), so Feed keeps no status table of its own. The RSS and YouTube integrations and the platform's source
 * pull refuse in their own names (`rss.*`, `youtube.*`, `actions.input_invalid`).
 * Every status is the one the Feed route answered for the code's old name: the missing things 404, the changed-under-you things 409,
 * caller refusals 400; an internal deletion-contract violation remains 500.
 */
export const feedErrors = defineErrorCodes("feed", {
  contract_source_history_decision_required: "internal",
  item_not_found: "not_found",
  source_not_found: "not_found",
  out_rule_not_found: "not_found",
  /** The item, source or rule changed since the caller read it. */
  revision_conflict: "conflict",
  source_paused: "conflict",
  source_use_catalog: "conflict",
  invalid_transition: "invalid",
  /** A route's own refusal of what the request says (a missing revision, a parameter that is no value of the route). */
  request_invalid: "invalid",
  out_rule_invalid: "invalid",
  source_connection_changed: "invalid",
  source_sync_interrupted: "invalid",
  source_idempotency_required: "invalid",
  source_idempotency_conflict: "invalid",
  source_not_syncable: "invalid",
  source_invalid_state: "invalid",
  source_query_invalid: "invalid",
  source_invalid_configuration: "invalid",
  source_definition_unavailable: "invalid",
  source_invalid_schedule: "invalid",
  source_configuration_changed: "invalid",
  source_changed: "invalid",
  source_wrong_sync_kind: "invalid",
  connector_wrong_sync_kind: "invalid",
  connector_needs_auth: "invalid",
  /** The provider reported a failed pull. Its own code (what a run and a source fault store, e.g. `connector.rate_limited`) is `details.error_code`. */
  connector_failed: "invalid",
});
