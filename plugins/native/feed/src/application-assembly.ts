import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { FeedApplication } from "./application.js";
import type { FeedApplicationPorts } from "./application-ports.js";
import {
  deleteListenerSourceState,
  FeedModule,
  getListenerRunByOperationId,
  listListenerRuns,
  readListenerCheckpoint,
  recoverInterruptedListenerRuns,
  saveListenerRun,
  SourcesModule,
  writeListenerCursor,
  type FeedAttentionPort,
  type FeedModuleOptions,
  type FeedSql,
} from "./store/index.js";

/** The two questions a host-side Attention Module asks about a subject before it writes an entry for it. */
export interface FeedSubjects {
  feedItemExists(projectId: string, itemId: string): boolean;
  sourceExists(projectId: string, sourceId: string): boolean;
}

/**
 * Everything Feed's application is given from outside its own tables: the four ports the host (today) or the Runtime (next) supplies —
 * `sql`, `attention`, `ledger` and the journal's `appendEvent` — and the optional pieces that live outside the project library.
 */
export interface FeedAssemblyPorts extends Pick<FeedApplicationPorts,
  "outRules" | "artifacts" | "history" | "captureJudgment" | "homeJudgment" | "inboxJudgment" | "subscribeInboxCreated" | "appendEvent"> {
  readonly sql: FeedSql;
  readonly ledger: FeedModuleOptions["ledger"];
  /** Built once the item and source stores exist; an adapter whose writer vouches for its own subjects ignores the argument. */
  attention(subjects: FeedSubjects): FeedAttentionPort;
}

/**
 * Feed's Modules and listener functions over `ports.sql`, and the application over them. The Modules only keep the references they are given
 * (FI-5), so assembling is free to repeat: a write that must run in a transaction of its own assembles inside it.
 */
export function assembleFeedApplication(ports: FeedAssemblyPorts): FeedApplication {
  const { sql, appendEvent } = ports;
  const sources = new SourcesModule(sql);
  let feed!: FeedModule;
  const attention = ports.attention({
    feedItemExists: (projectId, itemId) => feed.query.exists(projectId, itemId),
    sourceExists: (projectId, sourceId) => {
      try {
        sources.query.get(projectId, sourceId);
        return true;
      } catch (error) {
        if (error instanceof ActionError && error.code === "sources.not_found") return false;
        throw error;
      }
    },
  });
  feed = new FeedModule(sql, attention, {
    ledger: ports.ledger,
    eventSink: event => appendEvent(event.project_id, "feed_item", event.item_id, event.type, event.reason, event.payload, event.at),
  });
  return new FeedApplication({
    sources, feed, attention, appendEvent,
    subscribeInboxCreated: ports.subscribeInboxCreated,
    outRules: ports.outRules,
    artifacts: ports.artifacts,
    history: ports.history,
    captureJudgment: ports.captureJudgment,
    inboxJudgment: ports.inboxJudgment,
    homeJudgment: ports.homeJudgment,
    transaction: <T>(operation: () => T) => sql.transaction(operation),
    listener: {
      listRuns: projectId => listListenerRuns(sql, projectId),
      getRunByOperationId: (projectId, operationId) => getListenerRunByOperationId(sql, projectId, operationId),
      saveRun: run => saveListenerRun(sql, run),
      recoverInterruptedRuns: projectId => recoverInterruptedListenerRuns(sql, projectId),
      checkpoint: (projectId, sourceId, at) => readListenerCheckpoint(sql, projectId, sourceId, at),
      writeCursor: (projectId, sourceId, cursor, at) => writeListenerCursor(sql, projectId, sourceId, cursor, at),
      deleteSourceState: (projectId, sourceId) => deleteListenerSourceState(sql, projectId, sourceId),
    },
  });
}
