import { createHash } from "node:crypto";
import { LocalSqliteJournal, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { FeedSourceService, type FeedSourceCatalogView } from "@molis-ai/molis-work-plugin-feed";
import { FEED_CATEGORY_LABEL, listRegisterableFeeds, CUSTOM_RSS_DEFINITION_ID, customRssFeedHost, normalizeCustomRssFeedUrl, isRssSourceKind, readRssHttpState, withRssHttpFailure, withRssHttpSuccess } from "@molis-ai/molis-work-integration-rss";
import { YOUTUBE_CHANNEL_DEFINITION_ID, YOUTUBE_PUBLIC_FEED_HOST, normalizeYouTubeChannelId, youtubeChannelFeedUrl } from "@molis-ai/molis-work-integration-youtube";
import { GMAIL_DEFAULT_SCOPE, parseGmailScope } from "@molis-ai/molis-work-integration-gmail/scope";
import type { FeedSourceRecord } from "@molis-ai/molis-work-plugin-feed";
import { createLocalFeedApplication, type LocalFeedApplicationOptions } from "./feed-application.js";
import { createFeedSourceRuntime, type FeedSourceRuntime } from "./feed-source-runtime.js";
import { syncResearchLibrarySource } from "./research-library-source.js";
import { resolveMolisWorkHome } from "@molis-ai/molis-work-storage";
import { withConnectorConnections } from "./connector-connection-store.js";
import { connectorCredentialStatus } from "./connector-credentials.js";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
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
  boardId: string,
  runtimeFactory: (db: SqliteDatabase, source?: FeedSourceRecord) => FeedSourceRuntime =
    (database, source) => createFeedSourceRuntime({ db: database, sourceCursor: source?.cursor }),
  now: () => Date = () => new Date(),
  homeDirectory?: string,
  feedOptions?: LocalFeedApplicationOptions,
): FeedSourceService {
  const journal = new LocalSqliteJournal(db);
  const feed = createLocalFeedApplication(db, feedOptions);
  return new FeedSourceService({
    feed,
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
      const connection = connections.require(connectionId, serviceId);
      if (connection.disconnected_at || connection.auth_method === "mcp" || connection.auth_method === "cli") throw new Error("Feed 自动同步请选择 API OAuth 或令牌连接；CLI / MCP 请在连接器中使用其原生操作");
      const externalAvailable = connection.source === "external"
        && runWithMolisWorkHome(homeDirectory ?? resolveMolisWorkHome(), () => connectorCredentialStatus(serviceId).bound);
      if ((connections.state(connection) !== "connected" && !externalAvailable)
        || (!connection.credential_ref && !externalAvailable && connection.auth_method !== "none")) {
        throw new Error("所选账号连接不可用，请在 Connectors 中重新授权");
      }
      return {
        credentialRef: connection.credential_ref,
        accountLabel: connection.account_label,
        ...(connection.refresh_ref ? { refreshRef: connection.refresh_ref } : {}),
        ...(connection.credential_ref && connection.refresh_ref && connection.expires_ref ? { tokenRefs: {
          access: connection.credential_ref, refresh: connection.refresh_ref, expiresAt: connection.expires_ref,
        } } : {}),
      };
    }),
    appendEvent: (boardId, sourceId, type, reason, payload = {}) => {
      const value = `${sourceId}\u0000${type}\u0000${Date.now()}\u0000${Math.random()}`;
      const eventId = `event-feed-${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
      journal.appendEvent({ eventId, boardId, actorId: "feed-source-service", type,
        objectType: "feed_source", objectId: sourceId, reason, payload, at: new Date().toISOString() });
    },
  }, boardId, now);
}
