import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { LocalSqliteJournal, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { FeedSourceService, createFeedSourceSyncLease, type FeedSourceCatalogView, type FeedSourceSyncLease } from "@molis-ai/molis-work-plugin-feed";
import { FEED_CATEGORY_LABEL, listRegisterableFeeds, CUSTOM_RSS_DEFINITION_ID, customRssFeedHost, normalizeCustomRssFeedUrl, isRssSourceKind, readRssHttpState, withRssHttpFailure, withRssHttpSuccess } from "@molis-ai/molis-work-integration-rss";
import { YOUTUBE_CHANNEL_DEFINITION_ID, YOUTUBE_PUBLIC_FEED_HOST, normalizeYouTubeChannelId, youtubeChannelFeedUrl } from "@molis-ai/molis-work-integration-youtube";
import { GMAIL_DEFAULT_SCOPE, parseGmailScope } from "@molis-ai/molis-work-integration-gmail/scope";
import type { FeedSourceRecord } from "@molis-ai/molis-work-plugin-feed";
import { createLocalFeedApplication, type LocalFeedApplicationOptions } from "./feed-application.js";
import { createFeedSourceRuntime, type FeedSourceRuntime } from "./feed-source-runtime.js";
import { syncResearchLibrarySource } from "./research-library-source.js";
import { resolveMolisWorkHome } from "@molis-ai/molis-work-storage";
import { feedErrors } from "@molis-ai/molis-work-contracts/modules/feed";
import { withConnectorConnections, type ConnectorConnectionStore } from "./connector-connection-store.js";

// One executing Host owns the Home. Separate factory instances and SQLite connections of one project database must still share the
// claims Feed's lease keeps; in-memory databases have distinct identities. Feed owns the claim; this only picks which lease a database has.
const leasesByFile = new Map<string, FeedSourceSyncLease>();
const leasesByMemory = new WeakMap<SqliteDatabase, FeedSourceSyncLease>();
export function feedSourceSyncLease(db: SqliteDatabase): FeedSourceSyncLease {
  const file = db.name && db.name !== ":memory:" ? realpathSync(db.name) : undefined;
  const lease = (file ? leasesByFile.get(file) : leasesByMemory.get(db)) ?? createFeedSourceSyncLease();
  if (file) leasesByFile.set(file, lease); else leasesByMemory.set(db, lease);
  return lease;
}

/** The connector host's refusal (no such connection, another service's, a disconnected one) is the person choosing a connection Feed cannot use. */
function requireFeedConnection(connections: ConnectorConnectionStore, connectionId: string, serviceId: string) {
  try { return connections.require(connectionId, serviceId); }
  catch (error) { throw (error instanceof ActionError && ["connector.connection.invalid","connector.connection.not_found","connector.connection.service_mismatch","connector.connection.disconnected"].includes(error.code)) ? feedErrors.source_invalid_configuration(error.message) : error; }
}

export function listFeedSourceCatalog(): FeedSourceCatalogView[] {
  return listRegisterableFeeds().filter((source) => source.enabled).map((source) => ({
    id: source.sourceId,
    name: source.name,
    kind: "rss" as const,
    feed_url: source.feedUrl,
    category: source.category,
    category_label: FEED_CATEGORY_LABEL[source.category],
    limitations: source.limitations ?? [],
  }));
}


export function createLocalFeedSourceService(
  db: SqliteDatabase,
  projectId: string,
  runtimeFactory: (db: SqliteDatabase, source?: FeedSourceRecord) => FeedSourceRuntime =
    (database, source) => createFeedSourceRuntime({ db: database, sourceCursor: source?.cursor }),
  now: () => Date = () => new Date(),
  homeDirectory?: string,
  feedOptions?: LocalFeedApplicationOptions,
): FeedSourceService {
  const journal = new LocalSqliteJournal(db);
  const feed = createLocalFeedApplication(db, feedOptions);
  return new FeedSourceService({
    feed, acquireSync: feedSourceSyncLease(db),
    syncRepository: (source, input) => syncResearchLibrarySource(homeDirectory ?? resolveMolisWorkHome(), feed, source, input),
    providers: {
      listCatalog: listRegisterableFeeds,
      customRss: { definitionId: CUSTOM_RSS_DEFINITION_ID, normalizeUrl: normalizeCustomRssFeedUrl, host: customRssFeedHost },
      youtube: { definitionId: YOUTUBE_CHANNEL_DEFINITION_ID, host: YOUTUBE_PUBLIC_FEED_HOST, normalizeChannel: normalizeYouTubeChannelId, feedUrl: youtubeChannelFeedUrl },
      gmail: { defaultScope: GMAIL_DEFAULT_SCOPE, parseScope: parseGmailScope },
      rss: { isSourceKind: isRssSourceKind, failureCount: (cursor) => readRssHttpState(cursor).consecutive_failures, withFailure: withRssHttpFailure, withSuccess: withRssHttpSuccess },
    },
    createRuntime: (source) => runtimeFactory(db, source),
    transaction: (operation) => db.transaction(operation).immediate(),
    resolveConnection: (serviceId, connectionId) => withConnectorConnections(homeDirectory ?? resolveMolisWorkHome(), (connections) => {
      const connection = requireFeedConnection(connections, connectionId, serviceId);
      if (!connection.enabled || connection.disconnected_at || connection.auth_method === "mcp" || connection.auth_method === "cli") throw feedErrors.source_invalid_configuration("Feed 自动同步请选择 API OAuth 或令牌连接；CLI / MCP 请在连接器中使用其原生操作");
      if (connections.state(connection) !== "connected" || (!connection.credential_ref && connection.auth_method !== "none")) {
        throw feedErrors.source_invalid_configuration("所选账号连接不可用，请在 Connectors 中重新授权");
      }
      return {
        credentialRef: connection.credential_ref,
        accountLabel: connection.account_label,
        ...(connection.credential_ref && connection.refresh_ref && connection.expires_ref ? { tokenRefs: {
          access: connection.credential_ref, refresh: connection.refresh_ref, expiresAt: connection.expires_ref,
        } } : {}),
      };
    }),
    appendEvent: (projectId, sourceId, type, reason, payload = {}) => {
      const value = `${sourceId}\u0000${type}\u0000${Date.now()}\u0000${Math.random()}`;
      const eventId = `event-feed-${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
      journal.appendEvent({ eventId, projectId, actorId: "feed-source-service", type,
        objectType: "feed_source", objectId: sourceId, reason, payload, at: new Date().toISOString() });
    },
  }, projectId, now);
}
