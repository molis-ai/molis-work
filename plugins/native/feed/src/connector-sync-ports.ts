import type { FeedSyncExecution } from "./source-ports.js";
import type { IntegrationProviderItem, IntegrationProviderPort } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ListenerCheckpoint, ListenerRunReceipt } from "@molis-ai/molis-work-contracts/services/listener-host";
import type { SignalRecord } from "@molis-ai/molis-work-contracts/modules/signals";
import type { FeedSourceRecord } from "./projection.js";
import type { FeedApplication } from "./application.js";

export type ConnectorSyncMode = NonNullable<Parameters<IntegrationProviderPort["sync"]>[0]["mode"]>;
export interface FeedConnectorListener {
  run(operationId: string, mode: ConnectorSyncMode, execution?: FeedSyncExecution): Promise<ListenerRunReceipt>;
  checkpoint(): ListenerCheckpoint;
}
export interface FeedConnectorSyncPorts {
  feed: FeedApplication;
  acquireSync?(projectId: string, sourceId: string): () => void;
  /** The connection owner pins its original account; Feed owns source configuration. */
  connectionAuthority?(source: FeedSourceRecord): () => void | Promise<void>;
  /**
   * One write that may wait for the caller's authority first (the Runtime: `createFeedWriter().commit`). Absent, a write is `transaction`.
   * Everything a sync writes after it has awaited goes through here, because a Runtime Feed cannot write outside its transaction. With
   * it, `afterAccepted` runs inside the commit that accepts a signal and must finish synchronously.
   */
  commit?<T>(operation: () => T): Promise<T>;
  createListener(source: FeedSourceRecord, afterAccepted: (
    item: IntegrationProviderItem,
    signal: Pick<SignalRecord, "signal_id" | "revision">,
    occurredAt: string,
  ) => void | Promise<void>): Promise<FeedConnectorListener>;
  sourceMetadata(source: FeedSourceRecord, cursor: unknown): Pick<FeedSourceRecord, "account_label" | "config"> | Record<string, never>;
  transaction<T>(operation: () => T): T;
  appendEvent(projectId: string, sourceId: string, type: string, reason: string, payload: Record<string, unknown>): void;
}
