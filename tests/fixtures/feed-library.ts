import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { feedErrors } from "@molis-ai/molis-work-plugin-feed/contract";
import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { IntegrationBinding } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { createDemoFeedApplication, createDemoFeedSourceService, homeIntegrationRegistry, withConnectorConnections, type DemoFeedApplicationOptions, type IntegrationProviderFactory, type SourcePullRuntime } from "@molis-ai/molis-work-app-local-host";
import { ConnectorHost } from "@molis-ai/molis-work-service-connector-host";
import { LocalSqliteJournal, resolveMolisWorkHome, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import {
  FeedConnectorSync, FeedSourceScheduler, createFeedSourceSyncLease, integrationKeyOf, providerItemOf,
  type FeedApplication, type FeedSourceRecord, type FeedSourceSchedulerDispatch, type FeedSourceService, type FeedSourceSyncLease,
} from "@molis-ai/molis-work-plugin-feed";
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
  runtimeFactory?: (db: SqliteDatabase, source?: FeedSourceRecord) => SourcePullRuntime, now?: () => Date, homeDirectory?: string, feedOptions?: LocalFeedApplicationOptions): FeedSourceService {
  return createDemoFeedSourceService(db, projectId, runtimeFactory, now, { ...feedOptions, acquireSync: feedSourceSyncLease(db) });
}

export function createLocalFeedSourceScheduler(db: SqliteDatabase, projectId: string, dispatch: FeedSourceSchedulerDispatch, now: () => Date = () => new Date(),
  homeDirectory?: string, feedOptions?: LocalFeedApplicationOptions): FeedSourceScheduler {
  return new FeedSourceScheduler(projectId, () => createLocalFeedSourceService(db, projectId, undefined, now, homeDirectory, feedOptions), dispatch, now);
}

/** What an integration plugin is given for one source: the references it holds, never a secret. */
function bindingOf(source: FeedSourceRecord): IntegrationBinding {
  return { source_id: source.source_id, connection_id: typeof source.config.connection_id === "string" ? source.config.connection_id : null,
    credential_ref: source.credential_ref ?? null, config: source.config };
}

export function createLocalFeedConnectorSync(db: SqliteDatabase, projectId: string, providerFactory?: IntegrationProviderFactory,
  feed: FeedApplication = createLocalFeedApplication(db), homeDirectory = resolveMolisWorkHome()): FeedConnectorSync {
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
        if (!original || !current || !current.enabled || current.disconnected_at || current.updated_at !== original.updated_at || current.credential_ref !== source.credential_ref) {
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

