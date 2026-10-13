import type { SourcesApi } from "@molis-ai/molis-work-contracts/modules/sources";
import type { AttentionApi } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { FeedApi } from "@molis-ai/molis-work-contracts/modules/feed";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ListenerCheckpoint, ListenerRunRecord } from "@molis-ai/molis-work-contracts/services/listener-host";
import type { FeedArtifactProducer, FeedOutRuleStore } from "./out-rules.js";
import type { FeedSourceHistory } from "./source-history.js";

export interface FeedApplicationPorts {
  readonly sources: SourcesApi;
  readonly attention: AttentionApi;
  readonly feed: FeedApi;
  readonly outRules?: FeedOutRuleStore;
  readonly artifacts?: FeedArtifactProducer;
  /** Evidence bodies and search records outside the project database; without it a deleted source leaves them in place. */
  readonly history?: FeedSourceHistory;
  readonly captureJudgment?: (item: { project_id: string; item_id: string; rule_ids: string[] }, caller?: ActionCallContext) => Promise<void>;
  subscribeInboxCreated(listener: (entry: { project_id: string; entry_id: string }) => void): void;
  readonly homeJudgment?: (subject: { kind: "feed_item" | "inbox_entry"; id: string; project_id: string }, caller?: ActionCallContext) => Promise<void>;
  readonly inboxJudgment?: (entry: { project_id: string; entry_id: string }, caller?: ActionCallContext) => Promise<void>;
  readonly listener: {
    listRuns(projectId: string): ListenerRunRecord[];
    getRunByOperationId(projectId: string, operationId: string): ListenerRunRecord | null;
    saveRun(run: ListenerRunRecord): ListenerRunRecord;
    recoverInterruptedRuns(projectId: string): number;
    checkpoint(projectId: string, sourceId: string, at: string): ListenerCheckpoint;
    writeCursor(projectId: string, sourceId: string, cursor: unknown, at: string): void;
    deleteSourceState(projectId: string, sourceId: string): void;
  };
  transaction<T>(operation: () => T): T;
  appendEvent(projectId: string, objectType: string, objectId: string, type: string,
    reason: string, payload: Record<string, unknown>, at: string): void;
}
