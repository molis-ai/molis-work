import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { feedErrors } from "@molis-ai/molis-work-plugin-feed/contract";
import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ConnectorConnectionRecord } from "@molis-ai/molis-work-contracts/services/connector-host";
import { createDemoFeedApplication, createDemoFeedSourceService, homeIntegrationRegistry, withConnectorConnections, type DemoFeedApplicationOptions, type IntegrationProviderFactory, type SourcePullRuntime } from "@molis-ai/molis-work-app-local-host";
import { ConnectorHost, pluginBindingScope } from "@molis-ai/molis-work-service-connector-host";
import { LocalSqliteJournal, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import {
  FEED_PLUGIN_ID, feedSourceCatalog, FeedConnectorSync, FeedSourceScheduler, createFeedSourceSyncLease, integrationKeyOf, providerItemOf,
  type FeedApplication, type FeedSourceRecord, type FeedSourceSchedulerDispatch, type FeedSourceService, type FeedSourceSyncLease,
} from "@molis-ai/molis-work-plugin-feed";
import { listRegisterableFeeds, FEED_CATEGORY_LABEL } from "@molis-ai/molis-work-integration-rss";
import { ListenerHost, SignalsModule, fromBetterSqlite } from "@molis-ai/molis-work-plugin-feed/store";

// A Feed library arranged without the Plugin Runtime: the tests that need rows in a project library before (or beside) the Host starts the
// plugin build them with these, over the same tables the Runtime Feed reads. The application and the source service are the demo seed's
// (`createDemoFeedApplication`, `createDemoFeedSourceService`); this adds the claim, the scheduler and the connector sync the tests drive
// directly. Syncing a repository source and deleting a source's local history are the Runtime plugin's, exercised through its actions.

export type LocalFeedApplicationOptions = DemoFeedApplicationOptions;
export const createLocalFeedApplication = createDemoFeedApplication;

// One process, one claim per project database, whichever connection asks (in-memory databases have distinct identities).
const leasesByFile = new Map<string, FeedSourceSyncLease>();
const leasesByMemory = new WeakMap<SqliteDatabase, FeedSourceSyncLease>();
export function feedSourceSyncLease(db: SqliteDatabase): FeedSourceSyncLease {
  const file = db.name && db.name !== ":memory:" ? realpathSync(db.name) : undefined;
  const lease = (file ? leasesByFile.get(file) : leasesByMemory.get(db)) ?? createFeedSourceSyncLease();
  if (file) leasesByFile.set(file, lease); else leasesByMemory.set(db, lease);
  return lease;
}

export function createLocalFeedSourceService(db: SqliteDatabase, projectId: string,
  runtimeFactory?: (db: SqliteDatabase, source?: FeedSourceRecord) => SourcePullRuntime, now?: () => Date, feedOptions?: LocalFeedApplicationOptions): FeedSourceService {
  return createDemoFeedSourceService(db, projectId, runtimeFactory, now, { ...feedOptions, acquireSync: feedSourceSyncLease(db) });
}

export function createLocalFeedSourceScheduler(db: SqliteDatabase, projectId: string, dispatch: FeedSourceSchedulerDispatch, now: () => Date = () => new Date(),
  feedOptions?: LocalFeedApplicationOptions): FeedSourceScheduler {
  return new FeedSourceScheduler(projectId, () => createLocalFeedSourceService(db, projectId, undefined, now, feedOptions), dispatch, now);
}

// This fixture runs without a Plugin Runtime installation, but uses the same record key and connector owner's store as one.
function accountTarget(source: FeedSourceRecord) {
  const serviceId = integrationKeyOf(source);
  if (serviceId === null) throw pluginErrors.integration_unavailable(`来源 ${source.source_id} 没有可用的账号集成`);
  const scopeId = pluginBindingScope({ install_id: "feed-library-fixture", project_id: source.project_id, record_key: source.source_id });
  return { scopeId, pluginId: FEED_PLUGIN_ID, slotId: serviceId, serviceId };
}

export function bindLocalFeedSourceAccount(homeDirectory: string, source: FeedSourceRecord, connectionId: string | null): void {
  const target = accountTarget(source);
  withConnectorConnections(homeDirectory, store => {
    if (connectionId === null) store.unbind(target.scopeId, target.pluginId, target.slotId);
    else store.bind({ ...target, connectionId });
  });
}

/** Account preparation for tests that supply their own provider. */
export function seedLocalFeedSourceAccount(homeDirectory: string, source: FeedSourceRecord): void {
  const target = accountTarget(source);
  withConnectorConnections(homeDirectory, store => {
    const account = store.createToken({ serviceId: target.serviceId, displayName: source.name, token: "fixture-source-account" });
    store.bind({ ...target, connectionId: account.connection_id });
  });
}

export function createLocalFeedConnectorSync(db: SqliteDatabase, projectId: string, homeDirectory: string, providerFactory?: IntegrationProviderFactory,
  feed: FeedApplication = createLocalFeedApplication(db)): FeedConnectorSync {
  const registry = homeIntegrationRegistry(homeDirectory, providerFactory);
  const journal = new LocalSqliteJournal(db);
  const readAccount = ({ scopeId, pluginId, slotId, serviceId }: ReturnType<typeof accountTarget>) => withConnectorConnections(homeDirectory, store => {
    const account = store.binding(scopeId, pluginId, slotId);
    return account?.service_id === serviceId && store.state(account) === "connected" ? account : null;
  });
  const missingAccount = () => feedErrors.connector_failed("这个来源还没有选好可用的账号连接");
  return new FeedConnectorSync({
    feed, acquireSync: feedSourceSyncLease(db),
    connectionAuthority(source) {
      const target = accountTarget(source);
      let original: ConnectorConnectionRecord | undefined;
      return () => {
        const current = readAccount(target);
        if (!original) {
          if (!current) throw missingAccount();
          original = current;
          return;
        }
        if (!current || current.connection_id !== original.connection_id || current.updated_at !== original.updated_at || current.credential_ref !== original.credential_ref) {
          throw feedErrors.source_connection_changed("账号连接已断开或改变，请重新确认来源账号后拉取");
        }
      };
    },
    async createListener(source, afterAccepted) {
      const target = accountTarget(source);
      const account = readAccount(target);
      if (!account) throw missingAccount();
      const config = source.sync_kind === "gmail" && typeof source.config.scope === "string" ? { scope: source.config.scope } : {};
      const integration = await (await registry).bind(target.serviceId, "source", {
        source_id: source.source_id, connection_id: account.connection_id, credential_ref: account.credential_ref, config,
      });
      const connector = new ConnectorHost();
      const connectionId = `source:${source.source_id}`;
      connector.registerDriver(integration.connector_driver);
      connector.connect({ connection_id: connectionId, driver_id: integration.connector_driver.driver_id });
      const sql = fromBetterSqlite(db);
      const signals = new SignalsModule(sql);
      const listener = new ListenerHost(sql, connector, signals.commands, {
        afterSignalAccepted(event, receipt) { return afterAccepted(providerItemOf(event.payload), receipt.signal, event.occurred_at); },
      });
      return {
        run: (operationId, mode, execution) => listener.run({ ...execution, project_id: projectId, source_id: source.source_id, connection_id: connectionId,
          operation_id: operationId, adapter: integration.signal_adapter, intent: { sync_mode: mode } }),
        checkpoint: () => listener.checkpoint(projectId, source.source_id),
        account: cursor => integration.account?.(cursor, source.account_label) ?? null,
      };
    },
    transaction: operation => db.transaction(operation).immediate(),
    appendEvent(eventProject, sourceId, type, reason, payload) {
      const value = `${sourceId}\u0000${type}\u0000${Date.now()}\u0000${Math.random()}`;
      journal.appendEvent({ eventId: `event-connector-${createHash("sha256").update(value).digest("hex").slice(0, 32)}`, projectId: eventProject, actorId: "feed-connector-service", type,
        objectType: "feed_source", objectId: sourceId, reason, payload, at: new Date().toISOString() });
    },
  }, projectId);
}

/** Public catalog fixture arranged through Feed's own projection, without the deleted Host business export. */
export const listTestFeedSourceCatalog = () => feedSourceCatalog({ catalog: () => listRegisterableFeeds().map(source => ({
  source_id: source.sourceId, name: source.name, feed_url: source.feedUrl, enabled: source.enabled, category: source.category,
  category_label: FEED_CATEGORY_LABEL[source.category], limitations: [...(source.limitations ?? [])],
})) });
