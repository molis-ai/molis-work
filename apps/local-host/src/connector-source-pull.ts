import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { currentCallId } from "@molis-ai/molis-work-kernel";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ConnectorPullReceipt } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import type { ConnectorConnectionRecord } from "@molis-ai/molis-work-contracts/services/connector-host";
import type { ObservationOwnerSourceClass } from "@molis-ai/molis-work-contracts/services/observation";
import { withObservationSource } from "@molis-ai/molis-work-service-observation";
import type { IntegrationBinding } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { ConnectorHost } from "@molis-ai/molis-work-service-connector-host";
import { homeSqlitePath, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import type { PluginConnectionTarget, PluginConnectorPort } from "@molis-ai/molis-work-plugin-runtime";
import { lastConnectorCheck, withConnectorConnections } from "./connector-connection-store.js";
import { withConnectorRequest } from "./connector-lifecycle.js";
import { targetScope } from "./connector-plugin-requests.js";
import { shownState } from "./connector-refresh-refusals.js";
import type { IntegrationRegistry } from "./integration-registry.js";
import { hostLog } from "./host-log.js";
import { liveObservation } from "./observation-live.js";

// The Host's side of `services.sourcePull.connector` (FI-4 step 4c-4, S-97 provisional): the account of a source is the one the person bound
// to the plugin's `per_record` slot for that source, read here and nowhere else; the integration is the Home registry's. The credential
// is the provider's, read by the provider; the plugin gets the events the provider returned and never a connection or a reference.

export const connectorSourcePullErrors = defineErrorCodes("connector.source_pull", { integration_unavailable: "invalid", connection_changed: "conflict" });

export interface ConnectorSourcePortOptions {
  readonly home: string;
  readonly registry: () => Promise<IntegrationRegistry>;
}

/** What the registry is asked with when no account is involved: the adapter and the integration's identity do not depend on one. */
const noAccount = (source_id: string): IntegrationBinding => ({ source_id, connection_id: null, credential_ref: null, config: {} });
/** Names the platform reads from the account; the Runtime client refuses them, and a Host asked anyway drops them. */
const RESERVED = new Set(["token_refs", "connection_id", "credential_ref", "config"]);

export function createConnectorSourcePort(options: ConnectorSourcePortOptions): PluginConnectorPort {
  const { home } = options;
  const integrationOf = async (integration_id: string, service_id: string) => {
    const registry = await options.registry(), entry = registry.integration(integration_id);
    if (!entry || entry.declaration.kind !== "source" || entry.declaration.service_id !== service_id) {
      throw connectorSourcePullErrors.integration_unavailable(`集成 ${integration_id} 不是连接槽所用服务 ${service_id} 的账号来源`);
    }
    return registry;
  };
  return {
    async open(service_id, integration_id) {
      const registry = await integrationOf(integration_id, service_id);
      return (await registry.bind(integration_id, "source", noAccount("-"))).signal_adapter.adapter;
    },
    async pull(target, request, run) {
      const registry = await integrationOf(request.integration_id, target.service_id), source_id = target.record_key!;
      run.current();
      const account = accountOf(home, target);
      if (!account) return refusal(request.integration_id);
      const marker = markerOf(account);
      // Register synchronously after reading the binding, before the first wait. A slot's ABA cannot revive this controller.
      return withConnectorRequest(home, account.connection_id, run.signal, async signal => {
        const current = () => {
          signal.throwIfAborted(); run.current();
          const now = accountOf(home, target);
          if (!now || markerOf(now) !== marker) throw connectorSourcePullErrors.connection_changed("账号连接已断开或改变，请重新确认来源账号后拉取");
        };
        const integration = await registry.bind(request.integration_id, "source", bindingOf(account, source_id, request.settings), run.retainProvider);
        const connector = new ConnectorHost(), connection_id = `source:${source_id}`;
        connector.registerDriver(integration.connector_driver);
        connector.connect({ connection_id, driver_id: integration.connector_driver.driver_id });
        await run.beforeEffect(); current();
        const source = pullClass(request.cursor, request.intent);
        const invoke = () => runWithMolisWorkHome(home, () => connector.invoke({ connection_id, cursor: request.cursor, intent: { ...request.intent } }, { signal, current, beforeEffect: async () => { current(); await run.beforeEffect(); current(); } }));
        const receipt = source ? await withObservationSource(source, invoke) : await invoke();
        recordPull(home, target, account.connection_id, request.integration_id, source, receipt);
        await run.beforeEffect(); current();
        const { receipt_id, driver_id, started_at, completed_at, result } = receipt;
        return { receipt_id, driver_id, started_at, completed_at, result };
      }, { scope_id: targetScope(target), plugin_id: target.plugin_id, slot_id: target.slot_id });
    },
    async adapt(target, integration_id, event) {
      const registry = await integrationOf(integration_id, target.service_id);
      const adapter = (await registry.bind(integration_id, "source", noAccount(target.record_key!))).signal_adapter;
      return adapter.toSignalDraft(event, { project_id: target.project_id!, source_id: target.record_key! });
    },
    accounts(service_ids) {
      if (!existsSync(homeSqlitePath(home, "connectors"))) return Object.fromEntries(service_ids.map(id => [id, { bound: false }]));
      return withConnectorConnections(home, store => Object.fromEntries(service_ids.map(id => [id, { bound: store.list(id).some(row => row.enabled && !row.disconnected_at) }])), true) ?? Object.fromEntries(service_ids.map(id => [id, { bound: false }]));
    },
  };
}

/**
 * What a pull reads (design §3): with no cursor, what the account already held when the source was first connected; with a rebuilt cursor,
 * the changes a break missed, at their own times. Neither is new work done now, so neither may count as it. Any other pull is real.
 */
function pullClass(cursor: unknown, intent: Readonly<Record<string, unknown>> | undefined): ObservationOwnerSourceClass | undefined {
  if (cursor === null || cursor === undefined) return "first_read";
  return intent?.sync_mode === "rebuild_cursor" ? "catch_up" : undefined;
}

/** One pull from a bound account as a work record, in the call that asked for it; what the plugin made of the events is the plugin's. */
function recordPull(home: string, target: PluginConnectionTarget, connectionId: string, integrationId: string, source: ObservationOwnerSourceClass | undefined,
  receipt: Awaited<ReturnType<ConnectorHost["invoke"]>>): void {
  const live = liveObservation(home), call_id = currentCallId(), { result } = receipt;
  if (!live) return;
  try {
    live.sink("connections").bind({ kind: "background", entry: "background", actor_id: `plugin:${target.plugin_id}`, project_id: target.project_id ?? null,
      install_id: target.install_id, ...(call_id ? { call_id } : {}) }).record({ fact: "connections.pull", outcome: result.ok ? "succeeded" : "failed",
      occurred_at: receipt.started_at, ...(source ? { source_class: source } : {}),
      subjects: [{ kind: "source", id: target.record_key ?? "" }, { kind: "connection", id: connectionId }],
      detail: { integration_id: integrationId, driver_id: receipt.driver_id, mode: result.mode, completed_at: receipt.completed_at,
        ...(result.ok ? { events: result.events.length } : { failure: result.failure }) } });
  } catch (error) { hostLog.warn("observation", "connector_pull_record_failed", error); }
}

/** The connection bound to this record's slot, when it can be used as it is: of the slot's service, enabled, connected. */
function accountOf(home: string, target: PluginConnectionTarget): ConnectorConnectionRecord | null {
  // A Home that has never saved an account has bound nothing; reading must not create its registry.
  if (!existsSync(homeSqlitePath(home, "connectors"))) return null;
  return withConnectorConnections(home, store => {
    const connection = store.binding(targetScope(target), target.plugin_id, target.slot_id);
    return connection && connection.service_id === target.service_id && connection.enabled && !connection.disconnected_at
      && shownState(home, connection, store.state(connection), lastConnectorCheck(store, connection.connection_id)) === "connected" ? connection : null;
  }, true) ?? null;
}

/** What makes an account the same account: any of these changing is the person changing it. */
const markerOf = (account: ConnectorConnectionRecord): string => [account.connection_id, account.updated_at, account.credential_ref, account.refresh_ref, account.expires_ref].join("\u0000");

function bindingOf(account: ConnectorConnectionRecord, source_id: string, settings: Readonly<Record<string, string>> | undefined): IntegrationBinding {
  const config: Record<string, unknown> = Object.fromEntries(Object.entries(settings ?? {}).filter(([key]) => !RESERVED.has(key)));
  return { source_id, connection_id: account.connection_id, credential_ref: account.credential_ref, config };
}

/** No usable account for this record: the source needs the person, as a provider answering 401 would say. Nothing was sent. */
function refusal(integration_id: string): ConnectorPullReceipt {
  const at = new Date().toISOString();
  return { receipt_id: `connector-receipt-${randomUUID()}`, driver_id: integration_id, started_at: at, completed_at: at,
    result: { ok: false, mode: "live", failure: "needs_auth", message: "这个来源还没有选好可用的账号连接", action: "请在设置的“服务连接”里为这个来源选择账号" } };
}
