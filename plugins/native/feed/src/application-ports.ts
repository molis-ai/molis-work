import type { SourcesApi } from "@molis-ai/molis-work-contracts/modules/sources";
import type { AttentionApi } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { FeedApi } from "@molis-ai/molis-work-contracts/modules/feed";
import type { FeedImportReceiptRecord, FeedContractMigrationReceiptRecord } from "@molis-ai/molis-work-contracts/modules/feed";
import type { ListenerCheckpoint, ListenerRunRecord } from "@molis-ai/molis-work-contracts/services/listener-host";
import type { FeedArtifactProducer, FeedOutRuleStore } from "./out-rules.js";

export interface FeedApplicationPorts {
  readonly sources: SourcesApi;
  readonly attention: AttentionApi;
  readonly feed: FeedApi;
  readonly outRules?: FeedOutRuleStore;
  readonly artifacts?: FeedArtifactProducer;
  readonly receipts: {
    listImports(boardId: string): FeedImportReceiptRecord[];
    listContractMigrations(): FeedContractMigrationReceiptRecord[];
    putImportReceipt(receipt: FeedImportReceiptRecord): void;
  };
  readonly listener: {
    listRuns(boardId: string): ListenerRunRecord[];
    getRunByOperationId(boardId: string, operationId: string): ListenerRunRecord | null;
    saveRun(run: ListenerRunRecord): ListenerRunRecord;
    recoverInterruptedRuns(boardId: string): number;
    checkpoint(boardId: string, sourceId: string, at: string): ListenerCheckpoint;
    writeCursor(boardId: string, sourceId: string, cursor: unknown, at: string): void;
    deleteSourceState(boardId: string, sourceId: string): void;
  };
  transaction<T>(operation: () => T): T;
  appendEvent(boardId: string, objectType: string, objectId: string, type: string,
    reason: string, payload: Record<string, unknown>, at: string): void;
}
