import { feedSourceSyncLease } from "./feed-source-sync-lease.js";
import { createHash } from "node:crypto";
import { LocalSqliteJournal, resolveMolisWorkHome, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { feedErrors } from "@molis-ai/molis-work-contracts/modules/feed";
import { ConnectorHost } from "@molis-ai/molis-work-service-connector-host";
import { ListenerHost } from "@molis-ai/molis-work-service-listener-host";
import { SignalsModule } from "@molis-ai/molis-work-module-signals";
import { pluginErrors, type IntegrationProviderItem } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { IntegrationBinding } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { FeedConnectorSync, integrationKeyOf, type FeedApplication, type FeedSourceRecord } from "@molis-ai/molis-work-plugin-feed";
import { createLocalFeedApplication } from "./feed-application.js";
import { homeIntegrationRegistry } from "./builtin-integrations.js";
import type { IntegrationProviderFactory } from "./integration-providers.js";
import { withConnectorConnections } from "./connector-connection-store.js";

export function createLocalFeedConnectorSync(
  db: SqliteDatabase, projectId: string, providerFactory?: IntegrationProviderFactory,
  feed: FeedApplication = createLocalFeedApplication(db),
  homeDirectory = resolveMolisWorkHome(),
): FeedConnectorSync {
  const registry = homeIntegrationRegistry(homeDirectory, providerFactory);
  const journal = new LocalSqliteJournal(db);
  return new FeedConnectorSync({
    feed, acquireSync: feedSourceSyncLease(db),
    connectionAuthority(source) {
      const id = source.config.connection_id;
      if (typeof id !== "string") return () => {};
      const original = withConnectorConnections(homeDirectory, store => store.get(id));
      return () => withConnectorConnections(homeDirectory, store => {
        const current = store.get(id);
        if (!original || !current || !current.enabled || current.disconnected_at || current.updated_at !== original.updated_at
          || current.credential_ref !== source.credential_ref) {
          throw feedErrors.source_connection_changed("账号连接已断开或改变，请重新确认来源账号后拉取");
        }
      });
    },
    async createListener(source, afterAccepted) {
      const key = integrationKeyOf(source);
      if (key === null) throw pluginErrors.integration_unavailable(`来源 ${source.source_id} 没有可用的账号集成`);
      const integration = await (await registry).bind(key, "source", bindingOf(source));
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
        run: (operationId, mode, execution) => listener.run({ ...execution, project_id: projectId, source_id: source.source_id,
          connection_id: connectionId, operation_id: operationId, adapter: integration.signal_adapter,
          intent: { sync_mode: mode } }),
        checkpoint: () => listener.checkpoint(projectId, source.source_id),
        ...(integration.account ? { account: (cursor: unknown) => integration.account!(cursor, source.account_label) } : {}),
      };
    },
    transaction: (operation) => db.transaction(operation).immediate(),
    appendEvent(projectId, sourceId, type, reason, payload) {
      const value = `${sourceId}\u0000${type}\u0000${Date.now()}\u0000${Math.random()}`;
      const eventId = `event-connector-${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
      journal.appendEvent({ eventId, projectId, actorId: "feed-connector-service", type,
        objectType: "feed_source", objectId: sourceId, reason, payload, at: new Date().toISOString() });
    },
  }, projectId);
}

/** What an integration plugin is given for one source: the references it holds, never a secret. */
function bindingOf(source: FeedSourceRecord): IntegrationBinding {
  return {
    source_id: source.source_id,
    connection_id: typeof source.config.connection_id === "string" ? source.config.connection_id : null,
    credential_ref: source.credential_ref ?? null,
    config: source.config,
  };
}
