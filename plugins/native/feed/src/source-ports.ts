import type { IntelligenceIntentClientV1, SearchIntentExactResultV1 } from "@adeptify/intelligence-client";
import type { RssFetchReceipt } from "@molis-ai/molis-work-contracts/modules/sources";
import type { FeedSourceRecord, FeedSourceRunRecord } from "./projection.js";
import type { FeedApplication } from "./application.js";
import type { FeedSourceHistoryRelease } from "./source-history.js";
export type FeedSourceSyncInput = { idempotencyKey: string } & FeedSyncExecution;
export type IntelligenceCollectRequest = Parameters<IntelligenceIntentClientV1["executeExact"]>[0];
/** What a sync reads of one collected material: the search layer's richer material fits it, and so does what the platform hands a Runtime Feed. */
export interface CollectedMaterial {
  readonly id: string; readonly candidateId: string; readonly canonicalUrl: string; readonly title: string; readonly sourceName: string; readonly publishedAt?: string;
  readonly preview: string; readonly contentRef: string; readonly contentHash: string; readonly contentType: string; readonly characterCount: number;
  readonly capturedAt: string; readonly provenance: object;
}
/** What a sync reads of a pull's result; `SearchIntentExactResultV1` fits it, and so does the platform's `SourcePullResult` once renamed. */
export interface IntelligenceCollectResult extends Pick<SearchIntentExactResultV1, "outcome"> {
  readonly operationId: string; readonly intentFingerprint: string; readonly requirementMet: boolean; readonly materials: readonly CollectedMaterial[];
  readonly receipts: readonly object[]; readonly warnings: readonly string[]; readonly budget: object;
}
export interface PublicFeedRuntime {
  intelligenceCollect: { executeExact(request: IntelligenceCollectRequest, options?: { signal?: AbortSignal }): Promise<IntelligenceCollectResult> };
  content: { has(contentRef: string): boolean };
  /** The evidence bodies this runtime has written so far, including those of a pull that never reached a result. */
  writtenContentRefs?(): readonly string[];
  publicFeedReceipt?(): RssFetchReceipt | null;
  shutdown(): Promise<void>;
}
export interface FeedSourceProviders {
  listCatalog(): readonly { sourceId: string; enabled: boolean; feedUrl: string; name: string }[];
  customRss: { definitionId: string; normalizeUrl(value: string): string; host(url: string): string };
  youtube: { definitionId: string; host: string; normalizeChannel(value: string): string; feedUrl(channel: string): string };
  gmail: { defaultScope: string; parseScope(value: string): string | null };
  rss: {
    isSourceKind(kind: string): boolean;
    failureCount(cursor: unknown): number;
    withFailure(cursor: unknown): { cursor: unknown; failures: number };
    withSuccess(cursor: unknown, receipt: RssFetchReceipt | null, at: string): unknown;
  };
}
export interface FeedSyncExecution {
  signal?: AbortSignal;
  beforeEffect?(): Promise<void>;
}
export interface FeedSourcePorts {
  /** Host-wide lease shared by every service instance for the same database/source. */
  acquireSync?(projectId: string, sourceId: string): () => void;
  syncRepository?(source: FeedSourceRecord, input: FeedSourceSyncInput): Promise<FeedSourceSyncResult>;
  feed: FeedApplication;
  providers: FeedSourceProviders;
  /** `operationId` and `hold` are for a Runtime pull: `hold` names the bodies about to be written, before any is. The Host's runtime ignores both. */
  createRuntime(source: FeedSourceRecord, operationId?: string, hold?: (contentRefs: readonly string[]) => Promise<void>): PublicFeedRuntime;
  transaction<T>(operation: () => T): T;
  /**
   * One write that may wait for the caller's authority first (the Runtime: `createFeedWriter().commit`). Absent, a write is `transaction`.
   * Everything a sync writes after it has awaited goes through here, because a Runtime Feed cannot write outside its transaction.
   */
  commit?<T>(operation: () => T): Promise<T>;
  /** Tells the Home's reference ledger that this source holds these bodies. Present when the Feed keeps its references there. */
  holdContent?(source: FeedSourceRecord, contentRefs: readonly string[]): Promise<void>;
  /** Releases the bodies and search records a source's history holds, before the history is deleted; reports what it could not do. */
  releaseHistory?(input: { project_id: string; source_id: string }): Promise<FeedSourceHistoryRelease>;
  appendEvent(projectId: string, sourceId: string, type: string, reason: string, payload?: Record<string, unknown>): void;
  resolveConnection?(serviceId: string, connectionId: string): {
    credentialRef: string | null;
    accountLabel: string | null;
    tokenRefs?: { access: string; refresh: string; expiresAt: string };
  };
}
export type RegisterFeedSourceInput =
  | { kind: "research_library"; repository: string; research_source: string; name?: string }
  | { kind: "rss"; definition_id: string }
  | { kind: "web_query"; query: string; name?: string }
  | { kind: "youtube_channel"; channel_id: string; name?: string }
  | { kind: "custom_rss"; feed_url: string; name?: string };

export interface FeedSourceSyncResult {
  source: FeedSourceRecord;
  run: FeedSourceRunRecord;
  created: number;
  deduped: number;
  replayed: boolean;
}

export interface UpdateFeedSourceInput {
  name?: string;
  description?: string;
  scope?: string;
  feed_url?: string;
  connection_id?: string;
}

export type ConfigureFeedSourceScheduleInput =
  | { mode: "manual" }
  | { mode: "interval"; enabled: boolean; interval_minutes: number };
