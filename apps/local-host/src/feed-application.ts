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
import { fromBetterSqlite, type FeedSql } from "@molis-ai/molis-work-plugin-feed/store";
import { assembleFeedApplication, FEED_PLUGIN_ID, type FeedApplication, FeedOutRuleStore, type FeedApplicationPorts, type FeedArtifactProducer } from "@molis-ai/molis-work-plugin-feed";
import { projectVersionStores, type ArtifactsSqliteDatabase } from "@molis-ai/molis-work-module-artifacts";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { createFeedHistoryRelease } from "./feed-history-release.js";
import { assertProjectPluginDatabase, projectPluginDatabaseRefusal } from "./project-plugin-databases.js";
export interface LocalFeedApplicationOptions {
  artifacts?: FeedArtifactProducer;
  captureJudgment?: FeedApplicationPorts["captureJudgment"];
  homeJudgment?: FeedApplicationPorts["homeJudgment"];
  inboxJudgment?: FeedApplicationPorts["inboxJudgment"];
}

/**
 * What Feed's tables are read and written through: this library's connection, and Feed's declaration with it (FI-5). The tables are
 * the declaration's, so when the library refused it every path to them throws that refusal rather than "no such table", and only
 * Feed stops.
 */
export function feedSql(db: SqliteDatabase): FeedSql {
  const sql = fromBetterSqlite(db);
  return {
    get: (statement, ...params) => (assertProjectPluginDatabase(db, FEED_PLUGIN_ID), sql.get(statement, ...params)),
    all: (statement, ...params) => (assertProjectPluginDatabase(db, FEED_PLUGIN_ID), sql.all(statement, ...params)),
    run: (statement, ...params) => (assertProjectPluginDatabase(db, FEED_PLUGIN_ID), sql.run(statement, ...params)),
    transaction: operation => (assertProjectPluginDatabase(db, FEED_PLUGIN_ID), sql.transaction(operation)),
  };
}

/** Assemble every Feed operation against the same local connection. */
export function createLocalFeedApplication(
  db: SqliteDatabase,
  options: LocalFeedApplicationOptions = {},
): FeedApplication {
  const sql = feedSql(db);
  const journal = new LocalSqliteJournal(db);
  const goals = createGoalReadServices(db, journal).query;
  let inboxCreated: (entry: { project_id: string; entry_id: string }) => void = () => {};

  function appendEvent(...args: Parameters<FeedApplicationPorts["appendEvent"]>): void {
    const [projectId, objectType, objectId, type, reason, payload, at] = args;
    journal.appendEvent({ eventId: `event-${randomUUID()}`, projectId, actorId: LOCAL_PERSON_ACTOR_ID,
      objectType, objectId, type, reason, payload, at });
  }
  // The project library's one pair of version stores, opened only when no producer was handed in (the first call that writes).
  const artifactsModule = () => projectVersionStores({
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
  }).artifacts;
  return assembleFeedApplication({
    sql, appendEvent,
    attention: subjects => new AttentionModule(db, {
      exists: (projectId, subjectType, subjectId) => {
        if (subjectType === "feed_item") return subjects.feedItemExists(projectId, subjectId);
        if (subjectType === "source_fault") return subjects.sourceExists(projectId, subjectId);
        return goals.getGoal(projectId, subjectId) !== null;
      },
    }, {
      eventSink: (event) => {
        appendEvent(event.project_id, "inbox_entry", event.entry_id, event.type, event.reason, event.payload, event.at);
        if (event.type === "inbox_entry.created") inboxCreated({ project_id: event.project_id, entry_id: event.entry_id });
      },
    }),
    ledger: createContextLedger(db, { authorize: (access) => access.scope.kind === "personal" && access.actor_id === "module:feed" }),
    subscribeInboxCreated: listener => { inboxCreated = listener; },
    // A refused Feed library leaves the project without capture rules; the rest of Feed is the Modules' and goes on.
    ...projectPluginDatabaseRefusal(db, FEED_PLUGIN_ID) ? {} : { outRules: new FeedOutRuleStore(sql) },
    artifacts: options.artifacts ?? {
      registerVersion: (input) => artifactsModule().commands.registerVersion(input),
      latestVersion: (projectId, artifactId) => artifactsModule().query.latestArtifactVersion(projectId, artifactId),
    },
    history: createFeedHistoryRelease(db),
    captureJudgment: options.captureJudgment,
    inboxJudgment: options.inboxJudgment,
    homeJudgment: options.homeJudgment,
  });
}
