import type { SourcesApi } from "@molis-ai/molis-work-contracts/modules/sources";
import type { AttentionApi } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { FeedApi } from "@molis-ai/molis-work-contracts/modules/feed";
import type { FeedContractMigrationReceiptRecord } from "@molis-ai/molis-work-contracts/modules/feed";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ListenerCheckpoint, ListenerRunRecord } from "@molis-ai/molis-work-contracts/services/listener-host";
import type { FeedArtifactProducer, FeedOutRuleStore } from "./out-rules.js";

export interface FeedApplicationPorts {
  readonly sources: SourcesApi;
  readonly attention: AttentionApi;
  readonly feed: FeedApi;
  readonly outRules?: FeedOutRuleStore;
  readonly artifacts?: FeedArtifactProducer;
  readonly captureJudgment?: (item: { board_id: string; item_id: string; rule_ids: string[] }, caller?: ActionCallContext) => Promise<void>;
  subscribeInboxCreated(listener: (entry: { board_id: string; entry_id: string }) => void): void;
  readonly homeJudgment?: (subject: { kind: "feed_item" | "inbox_entry"; id: string; board_id: string }, caller?: ActionCallContext) => Promise<void>;
  readonly inboxJudgment?: (entry: { board_id: string; entry_id: string }, caller?: ActionCallContext) => Promise<void>;
  readonly receipts: {
    listContractMigrations(): FeedContractMigrationReceiptRecord[];
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
