import { feedSourceSyncLease } from "./feed-source-sync-lease.js";
import { createHash } from "node:crypto";
import { LocalSqliteJournal, resolveMolisWorkHome, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { FeedDomainError } from "@molis-ai/molis-work-contracts/modules/feed";
import { ConnectorHost } from "@molis-ai/molis-work-service-connector-host";
import { ListenerHost } from "@molis-ai/molis-work-service-listener-host";
import { SignalsModule } from "@molis-ai/molis-work-module-signals";
import { gmailAccountPresentation } from "@molis-ai/molis-work-integration-gmail";
import { githubAccountPresentation } from "@molis-ai/molis-work-integration-github";
import { catalogAccountPresentation } from "@molis-ai/molis-work-integration-catalog";
import type { IntegrationProviderItem } from "@molis-ai/molis-work-contracts/platform/plugin";
import { FeedConnectorSync, type FeedApplication, type FeedSourceRecord } from "@molis-ai/molis-work-plugin-feed";
import { createLocalFeedApplication } from "./feed-application.js";
import { OfficialIntegrationRegistry, type OfficialProviderFactory } from "./official-integrations.js";
import { withConnectorConnections } from "./connector-connection-store.js";

export function createLocalFeedConnectorSync(
  db: SqliteDatabase, boardId: string, providerFactory?: OfficialProviderFactory,
  feed: FeedApplication = createLocalFeedApplication(db),
  homeDirectory = resolveMolisWorkHome(),
): FeedConnectorSync {
  const integrations = new OfficialIntegrationRegistry(providerFactory);
  const journal = new LocalSqliteJournal(db);
  return new FeedConnectorSync({
    feed, acquireSync: feedSourceSyncLease(db),
    connectionAuthority(source) {
      const id = source.config.connection_id;
      if (typeof id !== "string") return () => {};
      const original = withConnectorConnections(homeDirectory, store => store.get(id));
      return () => withConnectorConnections(homeDirectory, store => {
        const current = store.get(id);
        if (!original || !current || current.disconnected_at || current.updated_at !== original.updated_at
          || current.credential_ref !== source.credential_ref) {
          throw new FeedDomainError("账号连接已断开或改变，请重新确认来源账号后拉取", "feed_source_connection_changed");
        }
      });
    },
    async createListener(source, afterAccepted) {
      const integration = await integrations.contributionFor(source);
      const connector = new ConnectorHost();
      const connectionId = `source:${source.source_id}`;
      connector.registerDriver(integration.connector_driver);
      connector.connect({ connection_id: connectionId, driver_id: integration.connector_driver.driver_id });
      const signals = new SignalsModule(db);
      const listener = new ListenerHost(db, connector, signals.commands, {
        afterSignalAccepted(event, receipt) {
          return afterAccepted(event.payload as unknown as IntegrationProviderItem, receipt.signal, event.occurred_at);
        },
      });
      return {
        run: (operationId, mode, execution) => listener.run({ ...execution, project_id: boardId, source_id: source.source_id,
          connection_id: connectionId, operation_id: operationId, adapter: integration.signal_adapter,
          intent: { sync_mode: mode } }),
        checkpoint: () => listener.checkpoint(boardId, source.source_id),
      };
    },
    reportCrash: (sourceId, code) => integrations.reportCrash(sourceId, code),
    sourceMetadata(source, cursor): Pick<FeedSourceRecord, "account_label" | "config"> | Record<string, never> {
      const metadata = source.sync_kind === "gmail"
        ? gmailAccountPresentation(cursor, source.account_label, source.config.scope)
        : source.sync_kind === "github"
          ? githubAccountPresentation(cursor, source.account_label)
          : source.sync_kind === "connector"
            ? catalogAccountPresentation(cursor, source.account_label)
            : null;
      if (!metadata) return {};
      const { account_label, ...configuration } = metadata;
      return { account_label, config: { ...source.config, ...configuration } };
    },
    transaction: (operation) => db.transaction(operation).immediate(),
    appendEvent(boardId, sourceId, type, reason, payload) {
      const value = `${sourceId}\u0000${type}\u0000${Date.now()}\u0000${Math.random()}`;
      const eventId = `event-connector-${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
      journal.appendEvent({ eventId, boardId, actorId: "feed-connector-service", type,
        objectType: "feed_source", objectId: sourceId, reason, payload, at: new Date().toISOString() });
    },
  }, boardId);
}
