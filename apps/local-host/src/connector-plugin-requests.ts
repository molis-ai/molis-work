import { existsSync } from "node:fs";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginConnectionDescription, PluginConnectionResponse } from "@molis-ai/molis-work-contracts/platform/plugin-connections";
import { CONNECTOR_REQUEST_SERVICES, type ConnectorRequestService } from "@molis-ai/molis-work-contracts/services/connector-host";
import { pluginBindingScope } from "@molis-ai/molis-work-service-connector-host";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import type { PluginConnectionDispatch, PluginConnectionsPort, PluginConnectionTarget } from "@molis-ai/molis-work-plugin-runtime";
import { resolveApiConnection } from "./connector-access.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { withConnectorRequest } from "./connector-lifecycle.js";
import { shownState } from "./connector-refresh-refusals.js";
import { refreshConnectionAfter401 } from "./connector-refresh-scheduling.js";
import { sendPublicHttps, type PublicHttpsFailure, type PublicHttpsTestServer, type PublicLookup } from "./public-https.js";

// The Host's side of a plugin's `services.connections` (S0b-2, security invariants S-57 and S-68): which account a slot is bound to, the
// credential, the origins it may reach and the transport. The runtime client (packages/plugin-runtime `createPluginConnectionsClient`)
// has already checked the call, the permission, the slot and the request's shape before anything reaches here.

export const pluginRequestErrors = defineErrorCodes("connector.plugin_requests", {
  service_unknown: "invalid", origin_refused: "forbidden", connection_unavailable: "conflict",
  private_address: "forbidden", timeout: "timeout", too_large: "too_large", upstream: "upstream",
});

/**
 * The scope an installation slot's bindings live under (connector-host `pluginBindingScope` writes every plugin scope). `install_id` is
 * the installation identity (`installIdentity`: the plugin id and the publisher's signature), the same in every project and after a
 * reinstall, so a binding follows the plugin until it is unbound (the uninstall gap is listed under S-57); another publisher's build of
 * the same plugin id never reads it.
 */
export function pluginSlotScope(install_id: string): string {
  return pluginBindingScope({ install_id });
}

/** A deleted project's `per_record` bindings, of every plugin (S-57 extension X4); a Home that never saved an account has none. */
export function forgetProjectConnectionBindings(home: string, project_id: string): void {
  if (existsSync(homeSqlitePath(home, "connectors"))) withConnectorConnections(home, store => store.forgetProjectBindings(project_id));
}

/** An installation's `per_record` bindings in a project it is uninstalled from (S-57 extension X4). */
export function forgetInstallationProjectBindings(home: string, install_id: string, project_id: string): void {
  if (existsSync(homeSqlitePath(home, "connectors"))) withConnectorConnections(home, store => store.forgetInstallationProjectBindings(install_id, project_id));
}

/** A target's scope: an installation slot's, or a `per_record` slot's, which is also the call's project's and the record's (S-70 provisional). */
export function targetScope(target: Pick<PluginConnectionTarget, "install_id" | "project_id" | "record_key">): string {
  return target.project_id === undefined && target.record_key === undefined ? pluginSlotScope(target.install_id)
    : pluginBindingScope({ install_id: target.install_id, project_id: target.project_id!, record_key: target.record_key! });
}

/** Response headers a plugin may see: no cookies, nothing that names the credential. */
const VISIBLE = new Set(["content-type", "content-language", "etag", "last-modified", "location", "retry-after", "cache-control", "date", "link"]);
const visibleHeader = (name: string) => VISIBLE.has(name) || name.startsWith("x-ratelimit-");
const FAILURES: Record<PublicHttpsFailure, (detail: string) => Error> = {
  private_address: detail => pluginRequestErrors.private_address(detail), timeout: detail => pluginRequestErrors.timeout(detail),
  too_large: detail => pluginRequestErrors.too_large(detail), read: detail => pluginRequestErrors.upstream(detail), connect: detail => pluginRequestErrors.upstream(detail),
};

export interface PluginConnectionsPortOptions {
  /** Only for tests: how names resolve, which addresses a connection may use (a local server) and that server. */
  readonly lookup?: PublicLookup;
  allowAddress?(address: string): boolean;
  readonly testServer?: PublicHttpsTestServer;
}

/**
 * Requests reach only the slot's service origins, exactly. An unbound slot sends nothing but what the plugin wrote; a bound slot whose
 * account is gone, disabled, disconnected, of another service, pinned to another of the service's origins, or of a kind whose secret the Host cannot send,
 * is refused rather than sent without it. The person's credential is added here and nowhere else, and redirects come back unfollowed.
 * A 401 to a credential the Host can refresh (S-69 provisional: the service's `refresh: "host"` and real OAuth refresh material) is refreshed once
 * and the same request sent once more; without refresh material the first 401 goes back as it is. A failed refresh refuses the request.
 */
export function createPluginConnectionsPort(home: string, options: PluginConnectionsPortOptions = {}): PluginConnectionsPort {
  return {
    async request(target, dispatch) {
      const service = Object.hasOwn(CONNECTOR_REQUEST_SERVICES, target.service_id) ? CONNECTOR_REQUEST_SERVICES[target.service_id]! : undefined;
      if (!service) throw pluginRequestErrors.service_unknown(`平台没有登记服务 ${target.service_id} 的请求来源`);
      const origin = dispatch.url.origin;
      if (!service.origins.includes(origin)) throw pluginRequestErrors.origin_refused(`连接槽 ${target.slot_id} 只能请求 ${service.origins.join("、")}`);
      const connection = boundConnection(home, target, service, origin);
      if (connection === null) return send(dispatch, undefined, options);
      const { connection_id } = connection;
      return withConnectorRequest(home, connection_id, dispatch.signal, async signal => {
        // The token, refreshed or not, stays here: a refusal names no credential, and the refreshed token is not in the answer.
        const access = async <T>(read: Promise<T>): Promise<T> => {
          try { return await read; }
          catch { throw pluginRequestErrors.connection_unavailable("所绑定的账号需要重新授权，请在设置里检查连接"); }
        };
        const sent = { ...dispatch, signal };
        const initial = await access(resolveApiConnection(home, connection_id, target.service_id));
        const first = await send(sent, `Bearer ${initial.token}`, options);
        if (first.status !== 401 || service.refresh !== "host" || connection.auth_method !== "oauth") return first;
        const refreshed = await refreshConnectionAfter401(home, initial.connection, async () => {
          signal.throwIfAborted(); await sent.beforeEffect(); signal.throwIfAborted();
        }, () => access(resolveApiConnection(home, connection_id, target.service_id, "if_available")));
        if (refreshed === null) return first;
        // Once: the resend asks the call again after its own DNS (`beforeEffect`), so a call that ended meanwhile sends nothing more.
        return send(sent, `Bearer ${refreshed.token}`, options);
      });
    },
    describe(target) {
      return describeBinding(home, target);
    },
    release(target) {
      if (existsSync(homeSqlitePath(home, "connectors"))) withConnectorConnections(home, store => store.unbind(targetScope(target), target.plugin_id, target.slot_id));
    },
  };
}

/** Whether the slot has an account, its name and how it stands; never the connection's id or anything about its credential. */
function describeBinding(home: string, target: PluginConnectionTarget): PluginConnectionDescription {
  if (!existsSync(homeSqlitePath(home, "connectors"))) return { bound: false };
  return withConnectorConnections(home, store => {
    const connection = store.binding(targetScope(target), target.plugin_id, target.slot_id);
    if (!connection) return { bound: false };
    const state = connection.service_id === target.service_id ? shownState(home, connection, store.state(connection)) : "disconnected";
    return { bound: true, display_name: connection.display_name, state };
  });
}

/** The connection bound to this installation's slot, `null` when none is; refuses one that cannot be used as it is. */
function boundConnection(home: string, target: PluginConnectionTarget, service: ConnectorRequestService, origin: string)
  : { connection_id: string; auth_method: string } | null {
  // A Home that has never saved an account has bound nothing; reading must not create its registry.
  if (!existsSync(homeSqlitePath(home, "connectors"))) return null;
  return withConnectorConnections(home, store => {
    const binding = store.binding(targetScope(target), target.plugin_id, target.slot_id);
    if (!binding) return null;
    const connection = store.get(binding.connection_id);
    const usable = connection && connection.service_id === target.service_id && shownState(home, connection, store.state(connection)) === "connected"
      && (service.auth_methods as readonly string[]).includes(connection.auth_method)
      && (store.targetOrigin(connection.connection_id) ?? origin) === origin;
    if (!usable) throw pluginRequestErrors.connection_unavailable("所绑定的账号已不可用，请在设置里重新选择或解除绑定");
    return { connection_id: connection.connection_id, auth_method: connection.auth_method };
  });
}

async function send(dispatch: PluginConnectionDispatch, authorization: string | undefined, options: PluginConnectionsPortOptions): Promise<PluginConnectionResponse> {
  const headers = { "user-agent": "Molis-Work", ...dispatch.headers, ...(authorization ? { authorization } : {}) };
  const response = await sendPublicHttps({ url: dispatch.url, method: dispatch.method, headers, ...(dispatch.body === undefined ? {} : { body: dispatch.body }),
    signal: dispatch.signal, beforeEffect: dispatch.beforeEffect, ...(options.lookup ? { lookup: options.lookup } : {}),
    ...(options.allowAddress ? { allowAddress: options.allowAddress } : {}), ...(options.testServer ? { testServer: options.testServer } : {}),
    failure: (reason, detail) => FAILURES[reason](detail) });
  const visible: Record<string, string> = {};
  for (const [name, value] of Object.entries(response.headers)) if (typeof value === "string" && visibleHeader(name)) visible[name] = value;
  return { status: response.status, headers: visible, body: response.body, authenticated: authorization !== undefined };
}
