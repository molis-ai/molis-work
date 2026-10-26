import type { RssFetchReceipt } from "../modules/sources.js";

/** What a plugin holds to pull public feeds (rss, custom_rss, youtube_channel) through the platform (`services.sourcePull.pull`). */
export const PLUGIN_SOURCE_PULL_FEED_PERMISSION = "sources:pull_feed";
/** What a plugin holds to run a fixed web query through the platform (`services.sourcePull.pull`). */
export const PLUGIN_SOURCE_PULL_QUERY_PERMISSION = "sources:pull_query";
/** What a plugin holds to read back an evidence body it pulled (`services.sourcePull.evidence`). */
export const PLUGIN_EVIDENCE_READ_PERMISSION = "evidence:read";
/** What a plugin holds to read a research library repository through the platform (`services.sourcePull.repository`). */
export const PLUGIN_SOURCE_PULL_REPOSITORY_PERMISSION = "sources:read_repository";

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

/**
 * A research library on GitHub: the repository (`owner/name`) and one source in it. Closed like a pull: the platform decides how the
 * repository is fetched (its own cache, its own `git`), never the plugin.
 */
export interface RepositoryReadRequest {
  readonly repository: string;
  readonly source_id: string;
}

/** One published, hash-checked finding of a research library at one immutable revision. */
export interface RepositoryEntry {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly body: string;
  readonly url: string;
  readonly published_at: string;
  readonly tags: readonly string[];
  readonly provenance: Readonly<Record<string, unknown>>;
}

export interface RepositoryReadResult {
  readonly repository: string;
  /** The Git revision every entry was read at. */
  readonly revision: string;
  readonly entries: readonly RepositoryEntry[];
}

/** One public feed a person may choose: the platform's catalog, which is also the list of feeds it will fetch. */
export interface SourceCatalogEntry {
  readonly source_id: string;
  readonly name: string;
  readonly feed_url: string;
  readonly enabled: boolean;
  readonly category: string;
  readonly category_label: string;
  readonly limitations: readonly string[];
}

/**
 * What a plugin must know to describe a public source the way the platform will fetch it: the catalog, the normal form of a custom feed
 * address and of a YouTube channel, and the HTTP cursor of a feed. Pure: nothing leaves, nothing is written, the same input gives the same
 * answer, and every answer is plain data. The platform owns these because it reads the same catalog to decide where a pull may go and the
 * same cursor to send a conditional request.
 */
export interface PluginSourceVocabulary {
  readonly custom_rss_definition_id: string;
  readonly youtube_definition_id: string;
  readonly youtube_feed_host: string;
  catalog(): readonly SourceCatalogEntry[];
  normalizeCustomRssUrl(value: string): string;
  customRssHost(feed_url: string): string;
  normalizeYouTubeChannel(value: string): string;
  youTubeChannelFeedUrl(channel_id: string): string;
  isRssSourceKind(kind: string): boolean;
  rssFailureCount(cursor: unknown): number;
  rssCursorAfterFailure(cursor: unknown): { readonly cursor: unknown; readonly failures: number };
  rssCursorAfterSuccess(cursor: unknown, receipt: RssFetchReceipt | null, completed_at: string): unknown;
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
  /** The published findings of a research library repository, read by the platform: no path of its cache, no Git output, only the entries. */
  /** Present with `sources:pull_feed`. Pure: usable in any call of this installation that declares the permission, read-only calls included. */
  readonly vocabulary?: PluginSourceVocabulary;
  readonly repository?: { read(request: RepositoryReadRequest, options?: { readonly signal?: AbortSignal }): Promise<RepositoryReadResult> };
}
