import type { IntegrationProviderItem, IntegrationProviderPort } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ListenerCheckpoint, ListenerRunReceipt } from "@molis-ai/molis-work-contracts/services/listener-host";
import type { SignalRecord } from "@molis-ai/molis-work-contracts/modules/signals";
import type { FeedSourceRecord } from "./projection.js";
import type { FeedApplication } from "./application.js";

export type ConnectorSyncMode = NonNullable<Parameters<IntegrationProviderPort["sync"]>[0]["mode"]>;
export interface FeedConnectorListener {
  run(operationId: string, mode: ConnectorSyncMode): Promise<ListenerRunReceipt>;
  checkpoint(): ListenerCheckpoint;
}
export interface FeedConnectorSyncPorts {
  feed: FeedApplication;
  createListener(source: FeedSourceRecord, afterAccepted: (
    item: IntegrationProviderItem,
    signal: Pick<SignalRecord, "signal_id" | "revision">,
    occurredAt: string,
  ) => void): Promise<FeedConnectorListener>;
  reportCrash(sourceId: string, errorCode: string): Promise<void>;
  sourceMetadata(source: FeedSourceRecord, cursor: unknown): Pick<FeedSourceRecord, "account_label" | "config"> | Record<string, never>;
  transaction<T>(operation: () => T): T;
  appendEvent(boardId: string, sourceId: string, type: string, reason: string, payload: Record<string, unknown>): void;
}
