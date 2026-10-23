import { existsSync } from "node:fs";
import type { Agent } from "node:https";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginConnectionResponse } from "@molis-ai/molis-work-contracts/platform/plugin-connections";
import { CONNECTOR_REQUEST_SERVICES, type ConnectorRequestService } from "@molis-ai/molis-work-contracts/services/connector-host";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import type { PluginConnectionDispatch, PluginConnectionsPort, PluginConnectionTarget } from "@molis-ai/molis-work-plugin-runtime";
import { resolveApiConnection } from "./connector-access.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { withConnectorRequest } from "./connector-lifecycle.js";
import { sendPublicHttps, type PublicHttpsFailure, type PublicLookup } from "./public-https.js";

// The Host's side of a plugin's `services.connections` (S0b-2, security invariant S-57): which account a slot is bound to, the
// credential, the one origin it may reach and the transport. The runtime client (packages/plugin-runtime `createPluginConnectionsClient`)
// has already checked the call, the permission, the slot and the request's shape before anything reaches here.

export const pluginRequestErrors = defineErrorCodes("connector.plugin_requests", {
  service_unknown: "invalid", origin_refused: "forbidden", connection_unavailable: "conflict",
  private_address: "forbidden", timeout: "timeout", too_large: "too_large", upstream: "upstream",
});

/** The scope an installation's slot bindings live under: one installation, so a reinstall starts unbound. */
export function pluginSlotScope(install_id: string): string {
  return `plugin-installation:${install_id}`;
}

/** Response headers a plugin may see: no cookies, nothing that names the credential. */
const VISIBLE = new Set(["content-type", "content-language", "etag", "last-modified", "location", "retry-after", "cache-control", "date", "link"]);
const visibleHeader = (name: string) => VISIBLE.has(name) || name.startsWith("x-ratelimit-");
const FAILURES: Record<PublicHttpsFailure, (detail: string) => Error> = {
  private_address: detail => pluginRequestErrors.private_address(detail), timeout: detail => pluginRequestErrors.timeout(detail),
  too_large: detail => pluginRequestErrors.too_large(detail), read: detail => pluginRequestErrors.upstream(detail), connect: detail => pluginRequestErrors.upstream(detail),
};

export interface PluginConnectionsPortOptions {
  /** Only for tests: how names resolve, which addresses a connection may use (a local server) and how TLS connections are made. */
  readonly lookup?: PublicLookup;
  allowAddress?(address: string): boolean;
  readonly agent?: Agent;
}

/**
 * Requests reach only the slot's service origin, exactly. An unbound slot sends nothing but what the plugin wrote; a bound slot whose
 * account is gone, disabled, disconnected, of another service, for another address, or of a kind whose secret the Host cannot send,
 * is refused rather than sent without it. The person's credential is added here and nowhere else, and redirects come back unfollowed.
 */
export function createPluginConnectionsPort(home: string, options: PluginConnectionsPortOptions = {}): PluginConnectionsPort {
  return {
    async request(target, dispatch) {
      const service = Object.hasOwn(CONNECTOR_REQUEST_SERVICES, target.service_id) ? CONNECTOR_REQUEST_SERVICES[target.service_id]! : undefined;
      if (!service) throw pluginRequestErrors.service_unknown(`平台没有登记服务 ${target.service_id} 的请求来源`);
      if (dispatch.url.origin !== service.origin) throw pluginRequestErrors.origin_refused(`连接槽 ${target.slot_id} 只能请求 ${service.origin}`);
      const connection_id = boundConnection(home, target, service);
      if (connection_id === null) return send(dispatch, undefined, options);
      return withConnectorRequest(home, connection_id, dispatch.signal, async signal => {
        let token: string;
        try { token = (await resolveApiConnection(home, connection_id, target.service_id)).token; }
        catch { throw pluginRequestErrors.connection_unavailable("所绑定的账号需要重新授权，请在设置里检查连接"); }
        return send({ ...dispatch, signal }, `Bearer ${token}`, options);
      });
    },
  };
}

/** The connection bound to this installation's slot, `null` when none is; refuses one that cannot be used as it is. */
function boundConnection(home: string, target: PluginConnectionTarget, service: ConnectorRequestService): string | null {
  // A Home that has never saved an account has bound nothing; reading must not create its registry.
  if (!existsSync(homeSqlitePath(home, "connectors"))) return null;
  return withConnectorConnections(home, store => {
    const binding = store.binding(pluginSlotScope(target.install_id), target.plugin_id, target.slot_id);
    if (!binding) return null;
    const connection = store.get(binding.connection_id);
    const usable = connection && connection.service_id === target.service_id && store.state(connection) === "connected"
      && (service.auth_methods as readonly string[]).includes(connection.auth_method)
      && (store.targetOrigin(connection.connection_id) ?? service.origin) === service.origin;
    if (!usable) throw pluginRequestErrors.connection_unavailable("所绑定的账号已不可用，请在设置里重新选择或解除绑定");
    return connection.connection_id;
  });
}

async function send(dispatch: PluginConnectionDispatch, authorization: string | undefined, options: PluginConnectionsPortOptions): Promise<PluginConnectionResponse> {
  const headers = { "user-agent": "Molis-Work", ...dispatch.headers, ...(authorization ? { authorization } : {}) };
  const response = await sendPublicHttps({ url: dispatch.url, method: dispatch.method, headers, ...(dispatch.body === undefined ? {} : { body: dispatch.body }),
    signal: dispatch.signal, beforeEffect: dispatch.beforeEffect, ...(options.lookup ? { lookup: options.lookup } : {}),
    ...(options.allowAddress ? { allowAddress: options.allowAddress } : {}), ...(options.agent ? { agent: options.agent } : {}),
    failure: (reason, detail) => FAILURES[reason](detail) });
  const visible: Record<string, string> = {};
  for (const [name, value] of Object.entries(response.headers)) if (typeof value === "string" && visibleHeader(name)) visible[name] = value;
  return { status: response.status, headers: visible, body: response.body, authenticated: authorization !== undefined };
}
