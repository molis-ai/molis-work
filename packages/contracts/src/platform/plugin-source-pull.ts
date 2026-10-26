import type { RssFetchReceipt } from "../modules/sources.js";

/** What a plugin holds to pull public feeds (rss, custom_rss, youtube_channel) through the platform (`services.sourcePull.pull`). */
export const PLUGIN_SOURCE_PULL_FEED_PERMISSION = "sources:pull_feed";
/** What a plugin holds to run a fixed web query through the platform (`services.sourcePull.pull`). */
export const PLUGIN_SOURCE_PULL_QUERY_PERMISSION = "sources:pull_query";
/** What a plugin holds to read back an evidence body it pulled (`services.sourcePull.evidence`). */
export const PLUGIN_EVIDENCE_READ_PERMISSION = "evidence:read";

interface SourcePullBase {
  /** The pull's identity: the same id is the same pull (the platform's search record is kept under it). */
  readonly operation_id: string;
  /** Shown in the pull's record, not used to choose where it goes. */
  readonly source_name: string;
}

/**
 * What a plugin may ask the platform to fetch. Closed on purpose: an address, a channel, a catalog entry or a query, and the HTTP
 * cursor of the last pull. No headers, method, redirect or proxy setting, no provider, no budget: where the request goes is decided
 * by the platform's own allowlists (the public feed catalog, YouTube's public channel feeds, public HTTPS addresses a person chose)
 * and its web search service, whose key the plugin never sees.
 */
export type SourcePullRequest =
  | (SourcePullBase & { readonly kind: "rss"; readonly definition_id: string; readonly cursor?: unknown })
  | (SourcePullBase & { readonly kind: "custom_rss"; readonly feed_url: string; readonly cursor?: unknown })
  | (SourcePullBase & { readonly kind: "youtube_channel"; readonly channel_id: string; readonly cursor?: unknown })
  | (SourcePullBase & { readonly kind: "web_query"; readonly query: string });

export type SourcePullKind = SourcePullRequest["kind"];

export interface SourcePullMaterial {
  readonly id: string;
  readonly candidate_id: string;
  readonly canonical_url: string;
  readonly title: string;
  readonly source_name: string;
  readonly published_at?: string;
  readonly preview: string;
  /** The evidence body's reference. The plugin was told it (`hold`) before the body was written. */
  readonly content_ref: string;
  readonly content_hash: string;
  readonly content_type: string;
  readonly character_count: number;
  readonly captured_at: string;
  readonly provenance: Readonly<Record<string, unknown>>;
  /** Whether the body can be read back now. */
  readonly content_available: boolean;
}

export interface SourcePullResult {
  readonly operation_id: string;
  readonly intent_fingerprint: string;
  readonly outcome: string;
  readonly requirement_met: boolean;
  readonly materials: readonly SourcePullMaterial[];
  /** The platform's receipts and budget ledger of the pull, as plain records for the plugin's run record. */
  readonly receipts: readonly unknown[];
  readonly budget: unknown;
  readonly warnings: readonly string[];
  /** For the feed kinds: the HTTP outcome (status, validators) the next pull's `cursor` is made from. */
  readonly http_receipt: RssFetchReceipt | null;
}

export interface SourcePullOptions {
  /**
   * Told the references of the bodies the platform is about to write, and the write waits for it. A body is never on disk before the
   * plugin has said it holds it, so what the plugin keeps (the Feed's content ledger) always includes every body that exists. A
   * failure here fails the pull and nothing is written.
   */
  hold(content_refs: readonly string[]): Promise<void>;
  readonly signal?: AbortSignal;
}

/**
 * Pulling public sources, reading evidence bodies and forgetting search records, through the platform. Authority comes from the call
 * the plugin's code is running in, as with `services.connections`: this installation's own concurrent action (or kept job) that
 * declares the permission. Each method is present only when the Manifest declares its permission.
 */
export interface PluginSourcePullClient {
  /** The request's fingerprint. Fetches nothing and writes nothing: the plugin compares it with a stored pull to see whether the source changed under the same key. */
  plan?(request: SourcePullRequest): Promise<{ readonly intent_fingerprint: string }>;
  pull?(request: SourcePullRequest, options: SourcePullOptions): Promise<SourcePullResult>;
  /** The decrypted body of an evidence reference of the Home's evidence store, or `null` when there is none. */
  readonly evidence?: { read(content_ref: string): Promise<string | null> };
  /** Forgets the platform's search records of these pulls in this project; returns how many went. */
  forget?(operation_ids: readonly string[]): Promise<{ readonly records_deleted: number }>;
}
