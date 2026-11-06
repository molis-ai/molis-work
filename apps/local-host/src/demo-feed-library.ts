import { createHash, randomUUID } from "node:crypto";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ContextAccess, ContextEdge, ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import { createPluginArtifactOperations, projectVersionStores } from "@molis-ai/molis-work-module-artifacts";
import { GMAIL_DEFAULT_SCOPE, parseGmailScope } from "@molis-ai/molis-work-integration-gmail/scope";
import { CUSTOM_RSS_DEFINITION_ID, customRssFeedHost, isRssSourceKind, listRegisterableFeeds, normalizeCustomRssFeedUrl, readRssHttpState, withRssHttpFailure, withRssHttpSuccess } from "@molis-ai/molis-work-integration-rss";
import { YOUTUBE_CHANNEL_DEFINITION_ID, YOUTUBE_PUBLIC_FEED_HOST, normalizeYouTubeChannelId, youtubeChannelFeedUrl } from "@molis-ai/molis-work-integration-youtube";
import { LocalSqliteJournal, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import {
  FEED_PLUGIN_ID, FeedOutRuleStore, FeedSourceService, assembleFeedApplication, feedManifest, feedOwnedAttention,
  type FeedApplication, type FeedApplicationPorts, type FeedArtifactProducer, type FeedSourceRecord, type FeedSourceSyncLease,
} from "@molis-ai/molis-work-plugin-feed";
import { fromBetterSqlite, type FeedLedgerPort } from "@molis-ai/molis-work-plugin-feed/store";
import { pluginNamespace } from "./plugin-namespace.js";
import { createSourcePullRuntime, type SourcePullRuntime } from "./source-pull-runtime.js";

// A Feed library arranged offline, over a project database nobody has started a plugin on: the demo project's seed builds its Feed rows with
// this, and so do the tests that need rows before (or beside) the Host starts the plugin. Production Feed runs only as the Plugin Runtime
// plugin; this assembles none of it. Syncing a repository, deleting a source's local history and the library's declared-refusal check belong
// to the Runtime plugin and are reached through its actions.

export interface DemoFeedApplicationOptions {
  artifacts?: FeedArtifactProducer;
  captureJudgment?: FeedApplicationPorts["captureJudgment"];
  homeJudgment?: FeedApplicationPorts["homeJudgment"];
  inboxJudgment?: FeedApplicationPorts["inboxJudgment"];
}
export interface DemoFeedSourceOptions extends DemoFeedApplicationOptions {
  /** One claim per project database for the pull in flight, when the caller wants the claim shared with others. */
  acquireSync?: FeedSourceSyncLease;
}

/**
 * Feed's edges in the project's ledger, stored the way the platform stores a plugin's (`services.contextLedger`): the actor is the plugin and a
 * key is kept as `<plugin_id>:<key>`, so what this assembly writes is what the Runtime Feed reads, and the other way round.
 */
function feedLedger(ledger: ContextLedgerApi): FeedLedgerPort {
  const names = pluginNamespace(FEED_PLUGIN_ID);
  const access = (projectId: string): ContextAccess => ({ actor_id: FEED_PLUGIN_ID, scope: { kind: "personal", id: projectId } });
  const bare = (edge: ContextEdge): ContextEdge => ({ ...edge, key: names.bare(edge.key) });
  const bareOrNull = (edge: ContextEdge | null) => edge === null ? null : bare(edge);
  return {
    get: (projectId, key) => bareOrNull(ledger.query.get(access(projectId), names.named(key))),
    list: (projectId, query) => ledger.query.list(access(projectId), query).filter(edge => names.owns(edge.key)).map(bare),
    put: (projectId, input) => bare(ledger.commands.put(access(projectId), { ...input, key: names.named(input.key) })),
    remove: (projectId, key, cause, recordedAt) => bareOrNull(ledger.commands.remove(access(projectId), names.named(key), cause, recordedAt)),
  };
}

/** Every Feed operation against one local connection. */
export function createDemoFeedApplication(db: SqliteDatabase, options: DemoFeedApplicationOptions = {}): FeedApplication {
  const sql = fromBetterSqlite(db);
  const journal = new LocalSqliteJournal(db);
  let inboxCreated: (entry: { project_id: string; entry_id: string }) => void = () => {};
  function appendEvent(...args: Parameters<FeedApplicationPorts["appendEvent"]>): void {
    const [projectId, objectType, objectId, type, reason, payload, at] = args;
    journal.appendEvent({ eventId: `event-${randomUUID()}`, projectId, actorId: LOCAL_PERSON_ACTOR_ID, objectType, objectId, type, reason, payload, at });
  }
  // The library's pair of version stores, opened only when no producer was handed in (the first call that writes).
  const versionStores = () => projectVersionStores({
    db,
    homeOwner: LOCAL_PERSON_ACTOR_ID,
    appendEvent: input => journal.appendEvent({ eventId: input.eventId, projectId: input.projectId, actorId: input.actorId, type: input.type, objectType: input.objectType,
      objectId: input.objectId, reason: input.reason, payload: input.payload, at: input.at }),
    eventCursor: projectId => journal.eventCursor(projectId),
  });
  // What the Runtime plugin's `services.artifacts.join` gives it, without a call to check: the same declared types and the same producer
  // (Feed's Manifest), so a capture this seeds is one the Runtime Feed owns.
  const capture: FeedArtifactProducer["capture"] = (projectId, write) => {
    const stores = versionStores();
    return write(createPluginArtifactOperations({ api: stores.artifacts, process: stores.processItems, manifest: feedManifest, project_id: projectId,
      actor_id: LOCAL_PERSON_ACTOR_ID, authorize: () => {}, assertCallerCurrent: () => {}, assertInput: assertActionInput }).writer(() => {}, () => LOCAL_PERSON_ACTOR_ID));
  };
  return assembleFeedApplication({
    sql, appendEvent,
    attention: subjects => feedOwnedAttention(new AttentionModule(db, {
      exists: (projectId, subjectType, subjectId) => {
        if (subjectType === "feed_item") return subjects.feedItemExists(projectId, subjectId);
        if (subjectType === "source_fault") return subjects.sourceExists(projectId, subjectId);
        return false;
      },
    }, {
      eventSink: event => {
        appendEvent(event.project_id, "inbox_entry", event.entry_id, event.type, event.reason, event.payload, event.at);
        if (event.type === "inbox_entry.created") inboxCreated({ project_id: event.project_id, entry_id: event.entry_id });
      },
    })),
    ledger: feedLedger(createContextLedger(db, { authorize: access => access.scope.kind === "personal" && access.actor_id === FEED_PLUGIN_ID })),
    subscribeInboxCreated: listener => { inboxCreated = listener; },
    outRules: new FeedOutRuleStore(sql),
    artifacts: options.artifacts ?? { capture },
    captureJudgment: options.captureJudgment,
    inboxJudgment: options.inboxJudgment,
    homeJudgment: options.homeJudgment,
  });
}

/** Registers and configures sources over the same connection; a sync of a source is the Runtime plugin's (`feed.sources.sync`). */
export function createDemoFeedSourceService(db: SqliteDatabase, projectId: string,
  runtimeFactory: (db: SqliteDatabase, source?: FeedSourceRecord) => SourcePullRuntime = (database, source) => createSourcePullRuntime({ db: database, sourceCursor: source?.cursor }),
  now: () => Date = () => new Date(), options?: DemoFeedSourceOptions): FeedSourceService {
  const journal = new LocalSqliteJournal(db);
  return new FeedSourceService({
    feed: createDemoFeedApplication(db, options), ...(options?.acquireSync ? { acquireSync: options.acquireSync } : {}),
    providers: {
      listCatalog: listRegisterableFeeds,
      customRss: { definitionId: CUSTOM_RSS_DEFINITION_ID, normalizeUrl: normalizeCustomRssFeedUrl, host: customRssFeedHost },
      youtube: { definitionId: YOUTUBE_CHANNEL_DEFINITION_ID, host: YOUTUBE_PUBLIC_FEED_HOST, normalizeChannel: normalizeYouTubeChannelId, feedUrl: youtubeChannelFeedUrl },
      gmail: { defaultScope: GMAIL_DEFAULT_SCOPE, parseScope: parseGmailScope },
      rss: { isSourceKind: isRssSourceKind, failureCount: cursor => readRssHttpState(cursor).consecutive_failures, withFailure: withRssHttpFailure, withSuccess: withRssHttpSuccess },
    },
    createRuntime: source => runtimeFactory(db, source),
    transaction: operation => db.transaction(operation).immediate(),
    appendEvent: (eventProject, sourceId, type, reason, payload = {}) => {
      const value = `${sourceId}\u0000${type}\u0000${Date.now()}\u0000${Math.random()}`;
      journal.appendEvent({ eventId: `event-feed-${createHash("sha256").update(value).digest("hex").slice(0, 32)}`, projectId: eventProject, actorId: "feed-source-service", type,
        objectType: "feed_source", objectId: sourceId, reason, payload, at: new Date().toISOString() });
    },
  }, projectId, now);
}
