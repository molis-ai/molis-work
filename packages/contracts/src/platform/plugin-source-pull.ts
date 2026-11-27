import type { ConnectorPollResult, ConnectorRawEvent } from "../services/connector-host.js";

/** What a plugin holds to pull a public feed (a catalog entry, or an address a person chose) through the platform (`services.sourcePull.pull`). */
export const PLUGIN_SOURCE_PULL_PUBLIC_FEED_PERMISSION = "sources:pull_public_feed";
/** What a plugin holds to run a fixed web query through the platform (`services.sourcePull.pull`). */
export const PLUGIN_SOURCE_PULL_QUERY_PERMISSION = "sources:pull_query";
/** What a plugin holds to read back an evidence body it pulled (`services.sourcePull.evidence`). */
export const PLUGIN_EVIDENCE_READ_PERMISSION = "evidence:read";
/** What a plugin holds to read a research library repository through the platform (`services.sourcePull.repository`). */
export const PLUGIN_SOURCE_PULL_REPOSITORY_PERMISSION = "sources:read_repository";

/**
 * The code `pull` refuses with, before it fetches anything, while the key that seals the Home's evidence bodies is lost and bodies
 * sealed with it remain (BL-1065): the bodies already kept stay as they are and nothing new is saved until the original key is back.
 */
export const SOURCE_PULL_EVIDENCE_KEY_MISSING = "host.source_pull.evidence_key_missing";

/** What a plugin holds to keep its references in the platform's evidence ledger and have the bodies nobody holds deleted (`services.evidence`, S-98). */
export const PLUGIN_EVIDENCE_COLLECT_PERMISSION = "evidence:collect";

/** What one release or reclaim did: the holds this holder gave up, and among the candidates the bodies deleted and those still held elsewhere. */
export interface PluginEvidenceRelease {
  readonly holds_released: number;
  readonly bodies_deleted: number;
  readonly bodies_kept: number;
}

/** Most references one hold, release or reclaim names, so each is one bounded write. */
export const PLUGIN_EVIDENCE_BATCH = 5_000;

/**
 * The platform's evidence ledger (`horizontal/evidence`) as one plugin instance reaches it, given with `evidence:collect` to a plugin the Host
 * runs itself. A hold is keyed by the plugin's own `holder_key` (its object, e.g. a source); the partition and the installation are the Host's
 * stamp from the trusted context, so an instance reaches only its own holds. A body is deleted only when no partition and no installation
 * holds it any more, whoever asks.
 */
export interface PluginEvidenceClient {
  /** Records that this holder holds these bodies. Done before the bodies are written; only after it returns may a write go ahead. */
  hold(holderKey: string, contentRefs: readonly string[]): Promise<{ readonly held: number }>;
  /**
   * This holder's hold on exactly these bodies goes, then each nobody else holds is deleted, in one transaction: for the holds a failed,
   * cancelled or interrupted write left behind, which the caller vouches none of its rows points at. Only in the plugin's own running action
   * that declares `evidence:collect`.
   */
  reclaim(holderKey: string, contentRefs: readonly string[]): Promise<PluginEvidenceRelease>;
  /** Every hold this holder has goes, then each candidate nobody else holds is deleted, in one transaction; same conditions as `reclaim`. */
  release(holderKey: string, candidates: readonly string[]): Promise<PluginEvidenceRelease>;
}

/** What a plugin holds to pull an account source (GitHub, Gmail, a directory connector) through the person's bound account (`services.sourcePull.connector`). */
export const PLUGIN_SOURCE_PULL_CONNECTOR_PERMISSION = "sources:pull_connector";

interface SourcePullBase {
  /** The pull's identity: the same id is the same pull (the platform's search record is kept under it). */
  readonly operation_id: string;
  /** Shown in the pull's record, not used to choose where it goes. */
  readonly source_name: string;
}

/**
 * What a plugin may ask the platform to fetch. Closed on purpose: a public feed (a catalog entry, or one of the integration's addressed
 * definitions with the address a person gave) and the HTTP cursor of the last pull, or a query. No headers, method, redirect or proxy
 * setting, no provider, no budget: where the request goes is decided by the public-feed integration's own allowlists and the platform's
 * web search service, whose key the plugin never sees (M10: the kinds and the vocabulary are the integration's declarations).
 */
export type SourcePullRequest =
  | (SourcePullBase & { readonly kind: "public_feed"; readonly definition_id: string; readonly address?: string; readonly cursor?: unknown })
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
 * A public-feed definition a person completes with an address of their own, as the integration that fetches it declares it: what the
 * address is (a feed address or a channel). The integration normalizes the address and decides where its pull may go.
 */
export interface PublicFeedAddressedDefinition {
  readonly definition_id: string;
  readonly address: "feed_url" | "channel_id";
}

/**
 * What a plugin must know to describe a public source the way the platform will fetch it: the catalog, the addressed definitions and
 * the normal form of their addresses, and the HTTP cursor of a feed. Pure: nothing leaves, nothing is written, the same input gives the
 * same answer, and every answer is plain data. These are the public-feed integration's declarations (M10); the platform answers with
 * them because it reads the same catalog to decide where a pull may go and the same cursor to send a conditional request.
 */
export interface PluginSourceVocabulary {
  presentation(id: string, input: import("./plugin-integrations.js").SourcePresentationInput): Promise<import("./plugin-integrations.js").SourcePresentation>;
  catalog(): readonly SourceCatalogEntry[];
  addressed(): readonly PublicFeedAddressedDefinition[];
  /** The address in the form the pull uses; refuses an address the definition does not accept. */
  normalizeAddress(definition_id: string, value: string): string;
  feedFailureCount(cursor: unknown): number;
  feedCursorAfterFailure(cursor: unknown): { readonly cursor: unknown; readonly failures: number };
  feedCursorAfterSuccess(cursor: unknown, receipt: RssFetchReceipt | null, completed_at: string): unknown;
}

/**
 * One pull of an account source. The account is the one the person bound to the plugin's `per_record` slot `slot_id` for the record
 * `record_key` (the source), never one the plugin names: there is no connection, credential or token field. Closed on purpose.
 */
export interface ConnectorPullRequest {
  /** A `per_record` slot of the Manifest's `connections.slots`; its service must be the integration's. */
  readonly slot_id: string;
  /** An integration of the Home's registry, of kind `source`. */
  readonly integration_id: string;
  readonly record_key: string;
  /** The plugin's checkpoint of this source; plain data. */
  readonly cursor: unknown;
  readonly intent?: { readonly sync_mode?: string };
  /** Non-secret settings of the source (Gmail's `scope`): up to 8 short texts, none of them a name the platform reads from the account. */
  readonly settings?: Readonly<Record<string, string>>;
}

/** What the platform's connector returned for one pull: the provider's raw events and next cursor, or its failure. No connection is named. */
export interface ConnectorPullReceipt {
  readonly receipt_id: string;
  readonly driver_id: string;
  readonly started_at: string;
  readonly completed_at: string;
  readonly result: ConnectorPollResult;
}

/** A signal draft the integration's adapter made of one raw event. The owner of the source adds the source, the dedupe and raw event ids and the adapter. */
export interface ConnectorSignalDraft {
  kind: string;
  occurred_at: string;
  observed_at: string;
  payload: Record<string, unknown>;
  content_refs?: string[];
  provenance: Record<string, unknown>;
}

/** An integration's adapter (`PluginIntegrationContribution.bind().signal_adapter`): the provider's raw events made into signal drafts. */
export interface RawEventAdapter {
  readonly adapter: { plugin_id: string; version: string };
  toSignalDraft(event: ConnectorRawEvent, context: { project_id: string; source_id: string }): ConnectorSignalDraft;
}

/** What one public feed request answered: the HTTP cursor of the next pull and the feed's own title and address are read from it. */
export interface RssFetchReceipt {
  readonly status: number;
  readonly not_modified: boolean;
  readonly etag?: string;
  readonly last_modified?: string;
  readonly final_url: string;
  readonly feed_title?: string;
  readonly home_url?: string;
}

/**
 * Pulling the accounts a person bound to a plugin's records, through the platform's integration registry. The credential stays
 * with the platform: the plugin gets the events the provider returned and the adapter's drafts, nothing that names the account.
 * Needs `connections:use` as well as `sources:pull_connector`, in the action and in the caller.
 */
export interface PluginConnectorSourceClient {
  /** Whether the integration is registered as a source of this slot's service, and its adapter's identity. Pure. */
  open(slot_id: string, integration_id: string): Promise<{ readonly adapter: RawEventAdapter["adapter"] }>;
  /** Concurrent actions and jobs only, never read-only. The binding is read when the pull starts and again when it ends; a change refuses it. */
  pull(request: ConnectorPullRequest, options?: { readonly signal?: AbortSignal }): Promise<ConnectorPullReceipt>;
  /** The integration's adapter on one raw event. Pure: it reads no account. */
  adapt(request: { readonly slot_id: string; readonly integration_id: string; readonly record_key: string; readonly event: ConnectorRawEvent }): Promise<ConnectorSignalDraft>;
  /** For services the Manifest declares a slot for: whether the Home has a connected account of each, whether it can be pulled, and its name. */
  accounts(service_ids: readonly string[]): Promise<Readonly<Record<string, PluginConnectorAccountState>>>;
}

/**
 * What a plugin may know about a service it declares a slot for (BL-917): nothing about any account but whether one is connected; whether
 * the Home has a source integration of the service, so it can be pulled at all; and the service's name as the person reads it.
 */
export interface PluginConnectorAccountState {
  readonly bound: boolean;
  readonly pullable: boolean;
  readonly title: string;
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
  /** Refused with `SOURCE_PULL_EVIDENCE_KEY_MISSING`, before anything is fetched, while the Home's evidence key is lost. */
  pull?(request: SourcePullRequest, options: SourcePullOptions): Promise<SourcePullResult>;
  /** The decrypted body of an evidence reference of the Home's evidence store, or `null` when there is none. */
  readonly evidence?: { read(content_ref: string): Promise<string | null> };
  /** Forgets the platform's search records of these pulls in this project; returns how many went. */
  forget?(operation_ids: readonly string[]): Promise<{ readonly records_deleted: number }>;
  /** The published findings of a research library repository, read by the platform: no path of its cache, no Git output, only the entries. */
  /** Present with `sources:pull_public_feed`. Pure: usable in any call of this installation that declares the permission, read-only calls included. */
  readonly vocabulary?: PluginSourceVocabulary;
  readonly repository?: { read(request: RepositoryReadRequest, options?: { readonly signal?: AbortSignal }): Promise<RepositoryReadResult> };
  /** Present with `sources:pull_connector`. */
  readonly connector?: PluginConnectorSourceClient;
}
