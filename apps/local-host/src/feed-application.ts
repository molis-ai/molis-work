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
} from "@molis-ai/molis-work-module-feed";

import {
  SourcesError,
  SourcesModule,
} from "@molis-ai/molis-work-module-sources";
import {
  deleteListenerSourceState,
  getListenerRunByOperationId,
  listListenerRuns,
  LISTENER_HOST_SCHEMA_SQL,
  readListenerCheckpoint,
  recoverInterruptedListenerRuns,
  saveListenerRun,
  writeListenerCursor,
} from "@molis-ai/molis-work-service-listener-host";
import { FeedApplication, FeedOutRuleStore, type FeedApplicationPorts, type FeedArtifactProducer } from "@molis-ai/molis-work-plugin-feed";
import { ArtifactsModule, type ArtifactsSqliteDatabase } from "@molis-ai/molis-work-module-artifacts";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { createFeedHistoryRelease } from "./feed-history-release.js";
export interface LocalFeedApplicationOptions {
  artifacts?: FeedArtifactProducer;
  captureJudgment?: FeedApplicationPorts["captureJudgment"];
  homeJudgment?: FeedApplicationPorts["homeJudgment"];
  inboxJudgment?: FeedApplicationPorts["inboxJudgment"];
}

/** Assemble every Feed operation against the same local connection. */
export function createLocalFeedApplication(
  db: SqliteDatabase,
  options: LocalFeedApplicationOptions = {},
): FeedApplication {
  const sources = new SourcesModule(db);
  const journal = new LocalSqliteJournal(db);
  // Listener Host's storage is plain functions, so it has no constructor to create its tables; the other owners do.
  db.exec(LISTENER_HOST_SCHEMA_SQL);
  const goals = createGoalReadServices(db).query;
  let feedItems!: FeedModule;
  let inboxCreated: (entry: { project_id: string; entry_id: string }) => void = () => {};
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
    eventSink: (event) => {
      appendEvent(event.project_id, "inbox_entry", event.entry_id, event.type, event.reason, event.payload, event.at);
      if (event.type === "inbox_entry.created") inboxCreated({ project_id: event.project_id, entry_id: event.entry_id });
    },
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
    const [projectId, objectType, objectId, type, reason, payload, at] = args;
    journal.appendEvent({ eventId: `event-${randomUUID()}`, projectId, actorId: LOCAL_PERSON_ACTOR_ID,
      objectType, objectId, type, reason, payload, at });
  }
  const artifactsModule = new ArtifactsModule({
    db: db as unknown as ArtifactsSqliteDatabase,
    appendEvent: (input) => journal.appendEvent({
      eventId: input.eventId,
      projectId: input.projectId,
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
    sources, feed: feedItems, attention, appendEvent,
    subscribeInboxCreated: listener => { inboxCreated = listener; },
    outRules: new FeedOutRuleStore(db),
    artifacts: options.artifacts ?? {
      registerVersion: (input) => artifactsModule.commands.registerVersion(input),
      latestVersion: (projectId, artifactId) => artifactsModule.query.latestArtifactVersion(projectId, artifactId),
    },
    history: createFeedHistoryRelease(db),
    captureJudgment: options.captureJudgment,
    inboxJudgment: options.inboxJudgment,
    homeJudgment: options.homeJudgment,
    transaction: (operation) => db.transaction(operation).immediate(),
    listener: {
      listRuns: (projectId) => listListenerRuns(db, projectId),
      getRunByOperationId: (projectId, operationId) => getListenerRunByOperationId(db, projectId, operationId),
      saveRun: (run) => saveListenerRun(db, run),
      recoverInterruptedRuns: (projectId) => recoverInterruptedListenerRuns(db, projectId),
      checkpoint: (projectId, sourceId, at) => readListenerCheckpoint(db, projectId, sourceId, at),
      writeCursor: (projectId, sourceId, cursor, at) => writeListenerCursor(db, projectId, sourceId, cursor, at),
      deleteSourceState: (projectId, sourceId) => deleteListenerSourceState(db, projectId, sourceId),
    },
  });
}
