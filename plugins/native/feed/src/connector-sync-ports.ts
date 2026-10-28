import type { FeedSyncExecution } from "./source-ports.js";
import type { IntegrationProviderItem, IntegrationProviderPort } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { IntegrationAccountPresentation } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import type { ListenerCheckpoint, ListenerRunReceipt } from "@molis-ai/molis-work-contracts/services/listener-host";
import type { SignalRecord } from "@molis-ai/molis-work-contracts/modules/signals";
import type { FeedSourceRecord } from "./projection.js";
import type { FeedApplication } from "./application.js";

export type ConnectorSyncMode = NonNullable<Parameters<IntegrationProviderPort["sync"]>[0]["mode"]>;
export interface FeedConnectorListener {
  run(operationId: string, mode: ConnectorSyncMode, execution?: FeedSyncExecution): Promise<ListenerRunReceipt>;
  checkpoint(): ListenerCheckpoint;
  /** How the source's account reads after this pull, as its integration says; `null`, or none, leaves the source's account as it is. */
  account?(cursor: unknown): IntegrationAccountPresentation | null;
}
export interface FeedConnectorSyncPorts {
  feed: FeedApplication;
  acquireSync?(projectId: string, sourceId: string): () => void;
  /** The connection owner pins its original account; Feed owns source configuration. */
  connectionAuthority?(source: FeedSourceRecord): () => void | Promise<void>;
  /** Account presentation from the current platform binding; no account identifier is written into source configuration. */
  sourceMetadata?(source: FeedSourceRecord, cursor: unknown): Pick<FeedSourceRecord, "account_label" | "config"> | Record<string, never>;
  /**
   * One write that may wait for the caller's authority first (the Runtime: `createFeedWriter().commit`). Absent, a write is `transaction`.
   * Everything a sync writes after it has awaited goes through here, because a Runtime Feed cannot write outside its transaction. With
   * it, `afterAccepted` runs inside the commit that accepts a signal and must finish synchronously.
   */
  commit?<T>(operation: () => T): Promise<T>;
  /**
   * `commit`, given with `commit` above, is the one the listener writes its runs, signals and checkpoint through: it checks this pull's source
   * inside each transaction, so a listener never advances a source that changed while it waited (FI-C-05).
   */
  createListener(source: FeedSourceRecord, afterAccepted: (
    item: IntegrationProviderItem,
    signal: Pick<SignalRecord, "signal_id" | "revision">,
    occurredAt: string,
  ) => void | Promise<void>, commit?: <T>(operation: () => T) => Promise<T>): Promise<FeedConnectorListener>;
  transaction<T>(operation: () => T): T;
  appendEvent(projectId: string, sourceId: string, type: string, reason: string, payload: Record<string, unknown>): void;
}
