import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
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

import { SourcesModule } from "@molis-ai/molis-work-module-sources";
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
import { FEED_PLUGIN_ID, FeedApplication, FeedOutRuleStore, feedManifest, type FeedApplicationPorts, type FeedArtifactProducer } from "@molis-ai/molis-work-plugin-feed";
import { createPluginArtifactOperations, projectVersionStores, type ArtifactsSqliteDatabase } from "@molis-ai/molis-work-module-artifacts";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import type { PluginArtifactClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { createFeedHistoryRelease } from "./feed-history-release.js";
import { projectPluginDatabaseRefusal } from "./project-plugin-databases.js";
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
          if (error instanceof ActionError && error.code === "sources.not_found") return false;
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
  // The project library's one pair of version stores, opened only when no producer was handed in (the first call that writes).
  const versionStores = () => projectVersionStores({
    db: db as unknown as ArtifactsSqliteDatabase,
    homeOwner: LOCAL_PERSON_ACTOR_ID,
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
    eventCursor: (projectId) => journal.eventCursor(projectId),
  });
  // Feed writes its captures as any plugin does: through the platform's artifact client bound to Feed's Manifest (the producer it
  // names, the types it declares in `artifacts.produces`), one per project. The Host runs this in the person's own process, so
  // there is no grant to hold or caller to outlive.
  const clients = new Map<string, PluginArtifactClient>();
  const clientFor = (projectId: string): PluginArtifactClient => {
    let client = clients.get(projectId);
    if (!client) {
      const stores = versionStores();
      client = createPluginArtifactOperations({ api: stores.artifacts, process: stores.processItems, manifest: feedManifest, project_id: projectId,
        actor_id: LOCAL_PERSON_ACTOR_ID, authorize: () => {}, assertCallerCurrent: () => {}, assertInput: assertActionInput }).client;
      clients.set(projectId, client);
    }
    return client;
  };
  return new FeedApplication({
    sources, feed: feedItems, attention, appendEvent,
    subscribeInboxCreated: listener => { inboxCreated = listener; },
    // A refused Feed library leaves the project without capture rules; the rest of Feed is the Modules' and goes on.
    ...projectPluginDatabaseRefusal(db, FEED_PLUGIN_ID) ? {} : { outRules: new FeedOutRuleStore(db) },
    artifacts: options.artifacts ?? {
      publish: (projectId, input) => clientFor(projectId).publish(input),
      head: (projectId, artifactId) => clientFor(projectId).head(artifactId),
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
