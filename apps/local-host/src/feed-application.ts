import {
  LocalSqliteJournal,
} from "@molis-ai/molis-work-storage";
import {
  randomUUID,
} from "node:crypto";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import {
  createContextLedger,
} from "@molis-ai/molis-work-module-context-ledger";
import {
  createGoalReadServices,
} from "@molis-ai/molis-work-module-goals";

import {
  AttentionModule,
} from "@molis-ai/molis-work-module-attention-resumption";
import {
  FeedModule,
  FeedReceiptStore,
} from "@molis-ai/molis-work-module-feed";

import {
  SourcesError,
  SourcesModule,
} from "@molis-ai/molis-work-module-sources";
import {
  deleteListenerSourceState,
  getListenerRunByOperationId,
  listListenerRuns,
  migrateListenerHost,
  readListenerCheckpoint,
  recoverInterruptedListenerRuns,
  saveListenerRun,
  writeListenerCursor,
} from "@molis-ai/molis-work-service-listener-host";
import { FeedApplication, FeedOutRuleStore, type FeedApplicationPorts, type FeedArtifactProducer } from "@molis-ai/molis-work-plugin-feed";
import { ArtifactsModule, type ArtifactsSqliteDatabase } from "@molis-ai/molis-work-module-artifacts";
import type { JudgmentPort } from "@molis-ai/molis-work-contracts/modules/functions";
import { createFunctionsJudgmentPort } from "./functions-host.js";
import { hostOfferedBehaviorsForScene, liveHostAllowedBehaviorIds } from "./behavior-catalog.js";

export interface LocalFeedApplicationOptions {
  artifacts?: FeedArtifactProducer;
  judgments?: JudgmentPort;
  offered_behavior_ids?: readonly string[];
  offeredBehaviorsForScene?: (sceneId: string, subjects: readonly string[]) => readonly string[];
}

export function withLocalFeedJudgments(homeDirectory?: string): LocalFeedApplicationOptions {
  if (!homeDirectory) return {};
  return {
    judgments: createFunctionsJudgmentPort(homeDirectory),
    offered_behavior_ids: liveHostAllowedBehaviorIds(),
    offeredBehaviorsForScene: hostOfferedBehaviorsForScene,
  };
}

/** Assemble every Feed operation against the same local connection. */
export function createLocalFeedApplication(
  db: SqliteDatabase,
  options: LocalFeedApplicationOptions = {},
): FeedApplication {
  const sources = new SourcesModule(db);
  const receipts = new FeedReceiptStore(db);
  const journal = new LocalSqliteJournal(db);
  // Pre-reorg projects already applied Feed migrations 22–29, but those
  // releases did not have Listener storage. Initialize its owner before
  // recovery or cursor reads; the migration preserves existing checkpoints.
  migrateListenerHost(db);
  const goals = createGoalReadServices(db).query;
  let feedItems!: FeedModule;
  const attention = new AttentionModule(db, {
    exists: (projectId, subjectType, subjectId) => {
      if (subjectType === "feed_item") return feedItems.query.exists(projectId, subjectId);
      if (subjectType === "source_fault") {
        try {
          sources.query.get(projectId, subjectId);
          return true;
        } catch (error) {
          if (error instanceof SourcesError && error.code === "source_not_found") return false;
          throw error;
        }
      }
      return goals.getGoal(projectId, subjectId) !== null;
    },
  }, {
    eventSink: (event) => appendEvent(
      event.project_id,
      "inbox_entry",
      event.entry_id,
      event.type,
      event.reason,
      event.payload,
      event.at,
    ),
  });
  feedItems = new FeedModule(db, attention, {
    ledger: createContextLedger(db, { authorize: (access) => access.scope.kind === "personal" && access.actor_id === "module:feed" }),
    eventSink: (event) => appendEvent(
      event.project_id,
      "feed_item",
      event.item_id,
      event.type,
      event.reason,
      event.payload,
      event.at,
    ),
  });

  function appendEvent(...args: Parameters<FeedApplicationPorts["appendEvent"]>): void {
    const [boardId, objectType, objectId, type, reason, payload, at] = args;
    journal.appendEvent({ eventId: `event-${randomUUID()}`, boardId, actorId: "web-user",
      objectType, objectId, type, reason, payload, at });
  }
  const artifactsModule = new ArtifactsModule({
    db: db as unknown as ArtifactsSqliteDatabase,
    appendEvent: (input) => journal.appendEvent({
      eventId: input.eventId,
      boardId: input.boardId,
      actorId: input.actorId,
      type: input.type,
      objectType: input.objectType,
      objectId: input.objectId,
      reason: input.reason,
      payload: input.payload,
      at: input.at,
    }),
  });
  return new FeedApplication({
    sources, feed: feedItems, attention, receipts, appendEvent,
    outRules: new FeedOutRuleStore(db),
    artifacts: options.artifacts ?? {
      registerVersion: (input) => artifactsModule.commands.registerVersion(input),
      latestVersion: (boardId, artifactId) => artifactsModule.query.latestArtifactVersion(boardId, artifactId),
    },
    judgments: options.judgments,
    offered_behavior_ids: options.offered_behavior_ids,
    offeredBehaviorsForScene: options.offeredBehaviorsForScene ?? hostOfferedBehaviorsForScene,
    transaction: (operation) => db.transaction(operation).immediate(),
    listener: {
      listRuns: (boardId) => listListenerRuns(db, boardId),
      getRunByOperationId: (boardId, operationId) => getListenerRunByOperationId(db, boardId, operationId),
      saveRun: (run) => saveListenerRun(db, run),
      recoverInterruptedRuns: (boardId) => recoverInterruptedListenerRuns(db, boardId),
      checkpoint: (boardId, sourceId, at) => readListenerCheckpoint(db, boardId, sourceId, at),
      writeCursor: (boardId, sourceId, cursor, at) => writeListenerCursor(db, boardId, sourceId, cursor, at),
      deleteSourceState: (boardId, sourceId) => deleteListenerSourceState(db, boardId, sourceId),
    },
  });
}
