import type { PluginSourcePullClient, RssFetchReceipt } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import type { FeedSourceRecord, FeedSourceRunRecord } from "./projection.js";
import type { FeedApplication } from "./application.js";
import type { FeedSourceHistoryRelease } from "./source-history.js";
export type FeedSourceSyncInput = { idempotencyKey: string } & FeedSyncExecution;
export interface FeedSourceProviders {
  listCatalog(): readonly { sourceId: string; enabled: boolean; feedUrl: string; name: string }[];
  customRss: { definitionId: string; normalizeUrl(value: string): string };
  youtube: { definitionId: string; normalizeChannel(value: string): string };
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
  /** The platform owns planning, fetching and its search records; Feed owns the source and the references its runs hold. */
  sourcePull?: Pick<PluginSourcePullClient, "plan" | "pull" | "forget">;
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
}

/** The services an account source can be added for: each is a `per_record` slot of Feed's Manifest and an integration the platform pulls. */
export const FEED_ACCOUNT_SERVICES = ["github", "gmail"] as const;
export interface AddFeedAccountSourceInput { service: typeof FEED_ACCOUNT_SERVICES[number]; name: string }

export type ConfigureFeedSourceScheduleInput =
  | { mode: "manual" }
  | { mode: "interval"; enabled: boolean; interval_minutes: number };
