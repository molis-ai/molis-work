import { feedErrors } from "@molis-ai/molis-work-contracts/modules/feed";
import type { SignalCommands } from "@molis-ai/molis-work-contracts/modules/signals";
import { pluginErrors, type IntegrationProviderItem } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginConnectionsClient } from "@molis-ai/molis-work-contracts/platform/plugin-connections";
import type { PluginConnectorSourceClient } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import type { ConnectorHostApi, ConnectorRawEvent } from "@molis-ai/molis-work-contracts/services/connector-host";
import { listenerErrors } from "@molis-ai/molis-work-contracts/services/listener-host";
import type { ConnectorAuthStatus } from "./connector-auth-status.js";
import type { FeedApplication } from "./application.js";
import { FeedConnectorSync } from "./connector-sync.js";
import { integrationKeyOf } from "./integration-key.js";
import type { FeedSourceRecord } from "./projection.js";
import { ListenerHost, readListenerCheckpoint, type FeedRawEventAdapter, type FeedSql } from "./store/index.js";

// How a Runtime Feed syncs an account source (FI-4 step 4c-4, S-97 provisional, specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md §12).
// The account is the one the person bound to the Manifest's `per_record` slot of the source's service, the record being the source: the
// platform reads that binding and pulls through the Home's integration, and Feed never holds a connection, a credential or a token reference.
// The listener is the Host's own (`ListenerHost`); what changes is the connector under it and that every write after a wait is a commit.

export interface RuntimeConnectorServices {
  readonly connector: PluginConnectorSourceClient;
  readonly connections: PluginConnectionsClient;
}

/** The slot a source's account is bound to: one per service, named for it. The integration is the service's too. */
export const connectorSlotOf = (source: Pick<FeedSourceRecord, "sync_kind" | "kind">): string | null => integrationKeyOf(source);

export interface RuntimeConnectorSyncPorts {
  readonly feed: FeedApplication;
  readonly projectId: string;
  readonly sql: FeedSql;
  readonly signals: SignalCommands;
  readonly services: RuntimeConnectorServices;
  /** The call's own commit (`createFeedWriter().commit` for the caller). */
  commit<T>(operation: () => T): Promise<T>;
  acquireSync(projectId: string, sourceId: string): () => void;
  appendEvent(projectId: string, sourceId: string, type: string, reason: string, payload: Record<string, unknown>): void;
}

const unavailable = (): never => { throw pluginErrors.integration_unavailable("Runtime 里的 Feed 不直接使用连接器"); };

/** A connector host that pulls through the platform: `invoke` is the only part a listener uses. */
function platformConnector(services: RuntimeConnectorServices, source: FeedSourceRecord, slot: string, signal: AbortSignal | undefined): ConnectorHostApi {
  // Gmail's range is the source's own setting; the account, its tokens and everything else about it are the platform's.
  const settings = source.sync_kind === "gmail" && typeof source.config.scope === "string" ? { scope: source.config.scope } : undefined;
  return {
    registerDriver: unavailable, connect: unavailable, test: unavailable, revoke: unavailable,
    async invoke(input) {
      const sync_mode = typeof input.intent?.sync_mode === "string" ? input.intent.sync_mode : undefined;
      const receipt = await services.connector.pull({ slot_id: slot, integration_id: slot, record_key: source.source_id, cursor: input.cursor,
        ...(sync_mode ? { intent: { sync_mode } } : {}), ...(settings ? { settings } : {}) }, signal ? { signal } : undefined);
      return { ...receipt, connection_id: input.connection_id };
    },
  };
}

/** `FeedConnectorSync` over the platform: the listener, the adapter and the account's name all come from the connector service. */
export function createRuntimeConnectorSync(ports: RuntimeConnectorSyncPorts): FeedConnectorSync {
  const { services, projectId } = ports;
  // The name the person gave the account, read when a sync starts and written to the source with the sync's result.
  const labels = new Map<string, string>();
  return new FeedConnectorSync({
    feed: ports.feed, acquireSync: ports.acquireSync, commit: ports.commit, appendEvent: ports.appendEvent, transaction: operation => operation(),
    connectionAuthority(source) {
      const slot = connectorSlotOf(source);
      let original: string | undefined;
      // The account the sync started with is the one it ends with: unbinding, disconnecting or naming another is the person changing it.
      return async () => {
        if (slot === null) return;
        const now = await services.connections.describe(slot, source.source_id);
        const mark = JSON.stringify([now.bound, now.state ?? null, now.display_name ?? null, now.origin ?? null]);
        original ??= mark;
        if (mark !== original) throw feedErrors.source_connection_changed("账号连接已断开或改变，请重新确认来源账号后拉取");
      };
    },
    async createListener(source, afterAccepted) {
      const slot = connectorSlotOf(source);
      if (slot === null) throw pluginErrors.integration_unavailable(`来源 ${source.source_id} 没有可用的账号集成`);
      const { adapter } = await services.connector.open(slot, slot);
      const described = await services.connections.describe(slot, source.source_id);
      if (described.display_name) labels.set(source.source_id, described.display_name);
      const raw: FeedRawEventAdapter = { adapter, toSignalDraft: (event, context) =>
        services.connector.adapt({ slot_id: slot, integration_id: slot, record_key: context.source_id, event }) };
      return {
        run: (operationId, mode, execution) => new ListenerHost(ports.sql, platformConnector(services, source, slot, execution?.signal), ports.signals, {
          commit: ports.commit,
          afterSignalAccepted: (event, receipt) => afterAccepted(providerItemOf(event.payload), receipt.signal, event.occurred_at),
        }).run({ ...execution, project_id: projectId, source_id: source.source_id, connection_id: `source:${source.source_id}`, operation_id: operationId,
          adapter: raw, intent: { sync_mode: mode } }),
        checkpoint: () => readListenerCheckpoint(ports.sql, projectId, source.source_id),
      };
    },
    sourceMetadata(source): Pick<FeedSourceRecord, "account_label" | "config"> | Record<string, never> {
      const account_label = labels.get(source.source_id);
      return account_label ? { account_label, config: source.config } : {};
    },
  }, projectId);
}

const KINDS: ReadonlySet<unknown> = new Set(["message", "notification", "issue", "pr", "mention", "update"]);
const PRIORITIES: ReadonlySet<unknown> = new Set(["low", "medium", "high", "urgent"]);
const text = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;

const attentionOf = (value: unknown): IntegrationProviderItem["attention"] => {
  if (value === false) return false;
  if (!value || typeof value !== "object" || !("reason" in value) || value.reason !== "source_rule") return undefined;
  const detail = "detail" in value && value.detail && typeof value.detail === "object" && !Array.isArray(value.detail) ? Object.fromEntries(Object.entries(value.detail)) : undefined;
  return { reason: "source_rule", ...(detail ? { detail } : {}) };
};

/** The provider's item as the integration put it in the raw event's payload; a payload without the fields every item has is not one. */
export function providerItemOf(payload: ConnectorRawEvent["payload"]): IntegrationProviderItem {
  const { externalId, title, summary, kind, priority, tags } = payload;
  if (typeof externalId !== "string" || typeof title !== "string" || typeof summary !== "string") throw listenerErrors.delivery_failed("连接器事件缺少消息的必要字段");
  const body = text(payload.body), url = text(payload.url), occurredAt = text(payload.occurredAt), author = text(payload.author), attention = attentionOf(payload.attention);
  return { externalId, title, summary,
    ...(body === undefined ? {} : { body }), ...(url === undefined ? {} : { url }), ...(occurredAt === undefined ? {} : { occurredAt }), ...(author === undefined ? {} : { author }),
    ...(KINDS.has(kind) ? { kind: kind as IntegrationProviderItem["kind"] } : {}), ...(PRIORITIES.has(priority) ? { priority: priority as IntegrationProviderItem["priority"] } : {}),
    ...(Array.isArray(tags) ? { tags: tags.filter((tag): tag is string => typeof tag === "string") } : {}),
    ...(attention === undefined ? {} : { attention }) };
}

/** Whether an account source may be read now: the person bound an account to it and it still works. A public source needs none. */
export function authorizeRuntimeSource(connections: PluginConnectionsClient | undefined) {
  return async (source: FeedSourceRecord): Promise<{ authorized: boolean; reason?: string }> => {
    const lifecycle = source.config._molis_work_lifecycle as { deleted_at?: string } | undefined;
    if (!source.enabled || source.status !== "active" || lifecycle?.deleted_at) return { authorized: false, reason: "来源已暂停、断开或移除" };
    if (["manual", "public_source"].includes(source.sync_kind)) return { authorized: true };
    const slot = connectorSlotOf(source);
    if (slot === null || !connections) return { authorized: false, reason: "来源连接暂不可用" };
    const account = await connections.describe(slot, source.source_id);
    if (!account.bound) return { authorized: false, reason: "来源缺少当前有效的账号连接" };
    return account.state === "connected" ? { authorized: true } : { authorized: false, reason: account.state === "disconnected" ? "连接已断开" : "账号需要重新授权" };
  };
}

/** The Home-wide answer behind `feed.connections.status`: only whether there is an account, never which one. */
export async function runtimeConnectorStatus(connector: PluginConnectorSourceClient): Promise<ConnectorAuthStatus> {
  const answer = await connector.accounts(["github", "gmail"]);
  return { github: { bound: answer.github?.bound === true }, gmail: { bound: answer.gmail?.bound === true } };
}

/** Takes the person's account off a record the Feed no longer reads with it (a disconnected source). */
export async function releaseRuntimeAccount(connections: PluginConnectionsClient, source: FeedSourceRecord): Promise<void> {
  const slot = connectorSlotOf(source);
  if (slot !== null) await connections.release(slot, source.source_id);
}
