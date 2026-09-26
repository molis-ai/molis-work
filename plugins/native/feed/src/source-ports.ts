import type { IntelligenceIntentClientV1, SearchIntentExactResultV1 } from "@adeptify/intelligence-client";
import type { RssFetchReceipt } from "@molis-ai/molis-work-contracts/modules/sources";
import type { FeedSourceRecord, FeedSourceRunRecord } from "./projection.js";
import type { FeedApplication } from "./application.js";
export type IntelligenceCollectRequest = Parameters<IntelligenceIntentClientV1["executeExact"]>[0];
export type IntelligenceCollectResult = Readonly<Pick<SearchIntentExactResultV1, "operationId" | "intentFingerprint" | "outcome" | "requirementMet" | "materials" | "receipts" | "warnings" | "budget">>;
export interface PublicFeedRuntime {
  intelligenceCollect: { executeExact(request: IntelligenceCollectRequest, options?: { signal?: AbortSignal }): Promise<IntelligenceCollectResult> };
  content: { has(contentRef: string): boolean };
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
export interface FeedSourcePorts {
  syncRepository?(source: FeedSourceRecord, input: { idempotencyKey: string; signal?: AbortSignal }): Promise<FeedSourceSyncResult>;
  feed: FeedApplication;
  providers: FeedSourceProviders;
  createRuntime(source: FeedSourceRecord): PublicFeedRuntime;
  transaction<T>(operation: () => T): T;
  appendEvent(boardId: string, sourceId: string, type: string, reason: string, payload?: Record<string, unknown>): void;
  resolveConnection?(serviceId: string, connectionId: string): {
    credentialRef: string | null;
    accountLabel: string | null;
    refreshRef?: string;
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
