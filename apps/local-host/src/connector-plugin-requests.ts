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
import { credentialHeader, gatewayUrl } from "./connector-request-credentials.js";
import { shownState } from "./connector-refresh-refusals.js";
import { sendPublicHttps, type PublicHttpsFailure, type PublicHttpsTestServer, type PublicLookup } from "./public-https.js";

// The Host's side of a plugin's `services.connections` (S0b-2, security invariants S-57 and S-69): which account a slot is bound to, the
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

/** Every binding of one installation, in every project: its installation slot's and all its `per_record` ones (BL-596). The accounts stay. */
export function forgetInstallationBindings(home: string, install_id: string): void {
  if (existsSync(homeSqlitePath(home, "connectors"))) withConnectorConnections(home, store => store.forgetInstallationBindings(install_id));
}

/** The installations that have any plugin binding at all (BL-596); none when the Home never saved an account. */
export function installationIdsWithBindings(home: string): string[] {
  return existsSync(homeSqlitePath(home, "connectors")) ? withConnectorConnections(home, store => store.bindingInstallationIds()) : [];
}

/** A target's scope: an installation slot's, or a `per_record` slot's, which is also the call's project's and the record's (S-71 provisional). */
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
 * Requests reach only the slot's service origins, exactly; a tenant's service only the origin its bound connection was pinned to when it was
 * made (BL-595), never unbound. An unbound slot sends nothing but what the plugin wrote; a bound slot whose account is gone, disabled,
 * disconnected, of another service, pinned to another origin (or, for a tenant's service, to none), or of a kind whose secret the Host
 * cannot send, is refused rather than sent without it. The person's credential is added here and nowhere else, written as the registry
 * says for the kind of connection, and redirects come back unfollowed.
 * A 401 to a credential the Host can refresh (S-70 provisional: the service's `refresh: "host"` and real OAuth refresh material) is refreshed once
 * and the same request sent once more; a second 401 goes back to the plugin as it is, and so does the first one when there is no refresh
 * material. A failed refresh refuses the request.
 */
export function createPluginConnectionsPort(home: string, options: PluginConnectionsPortOptions = {}): PluginConnectionsPort {
  return {
    async request(target, dispatch) {
      const service = Object.hasOwn(CONNECTOR_REQUEST_SERVICES, target.service_id) ? CONNECTOR_REQUEST_SERVICES[target.service_id]! : undefined;
      if (!service) throw pluginRequestErrors.service_unknown(`平台没有登记服务 ${target.service_id} 的请求来源`);
      const origin = dispatch.url.origin, tenant = service.tenant;
      if (tenant ? !origin.endsWith(`.${tenant.domain}`) : !service.origins.includes(origin)) {
        throw pluginRequestErrors.origin_refused(`连接槽 ${target.slot_id} 只能请求 ${tenant ? `所绑定账号的 ${tenant.domain} 站点` : service.origins.join("、")}`);
      }
      const connection = boundConnection(home, target, service, origin);
      if (connection === null) {
        if (tenant) throw pluginRequestErrors.origin_refused(`连接槽 ${target.slot_id} 要先由人选好账号，才知道请求哪个站点`);
        return send(dispatch, undefined, options);
      }
      const { connection_id, auth_method } = connection, scheme = service.credential[auth_method]!;
      return withConnectorRequest(home, connection_id, dispatch.signal, async signal => {
        // The token, refreshed or not, stays here: a refusal names no credential, and the refreshed token is not in the answer.
        const access = async <T>(read: Promise<T>): Promise<T> => {
          try { return await read; }
          catch { throw pluginRequestErrors.connection_unavailable("所绑定的账号需要重新授权，请在设置里检查连接"); }
        };
        // An OAuth connection to a gateway service goes to the gateway of the site it was authorized for; the credential as its scheme writes it.
        const sendWith = async ({ token, authExtras }: { token: string; authExtras?: Record<string, string> }) => {
          const url = tenant?.gateway && auth_method === "oauth" ? gatewayUrl(tenant, target.service_id, dispatch.url, origin, authExtras) : dispatch.url;
          let header: Record<string, string>;
          try { if (!url) throw new Error("no gateway"); header = credentialHeader(scheme, target.service_id, auth_method, token); }
          catch { throw pluginRequestErrors.connection_unavailable("所绑定的账号缺少发请求要用的信息，请在设置里重新连接"); }
          return send({ ...dispatch, url, signal }, header, options);
        };
        const first = await sendWith(await access(resolveApiConnection(home, connection_id, target.service_id)));
        if (first.status !== 401 || service.refresh !== "host" || auth_method !== "oauth") return first;
        const refreshed = await access(resolveApiConnection(home, connection_id, target.service_id, "if_available"));
        if (refreshed === null) return first;
        // Once: the resend asks the call again after its own DNS (`beforeEffect`), so a call that ended meanwhile sends nothing more.
        return sendWith(refreshed);
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

/**
 * Whether the slot has an account, its name and how it stands, and for a tenant's service the origin its requests go to; never the
 * connection's id or anything about its credential.
 */
function describeBinding(home: string, target: PluginConnectionTarget): PluginConnectionDescription {
  if (!existsSync(homeSqlitePath(home, "connectors"))) return { bound: false };
  return withConnectorConnections(home, store => {
    const connection = store.binding(targetScope(target), target.plugin_id, target.slot_id);
    if (!connection) return { bound: false };
    const state = connection.service_id === target.service_id ? shownState(home, connection, store.state(connection)) : "disconnected";
    const origin = Object.hasOwn(CONNECTOR_REQUEST_SERVICES, target.service_id) && CONNECTOR_REQUEST_SERVICES[target.service_id]!.tenant
      ? store.targetOrigin(connection.connection_id) : null;
    const needsReconnect = state === "connected" && !origin && Boolean(CONNECTOR_REQUEST_SERVICES[target.service_id]?.tenant);
    return { bound: true, display_name: connection.display_name, state: needsReconnect ? "reauth_required" : state, ...(origin ? { origin } : {}) };
  });
}

/** The connection bound to this installation's slot, `null` when none is; refuses one that cannot be used as it is. */
function boundConnection(home: string, target: PluginConnectionTarget, service: ConnectorRequestService, origin: string)
  : { connection_id: string; auth_method: "token" | "oauth" } | null {
  // A Home that has never saved an account has bound nothing; reading must not create its registry.
  if (!existsSync(homeSqlitePath(home, "connectors"))) return null;
  return withConnectorConnections(home, store => {
    const binding = store.binding(targetScope(target), target.plugin_id, target.slot_id);
    if (!binding) return null;
    const connection = store.get(binding.connection_id);
    const usable = connection && connection.service_id === target.service_id && shownState(home, connection, store.state(connection)) === "connected"
      && (connection.auth_method === "token" || connection.auth_method === "oauth") && service.credential[connection.auth_method] !== undefined;
    if (!usable) throw pluginRequestErrors.connection_unavailable("所绑定的账号已不可用，请在设置里重新选择或解除绑定");
    const pinned = store.targetOrigin(connection.connection_id);
    // A tenant's connection saved before its origin was pinned (BL-595) is usable again once the person connects it again.
    if (service.tenant && pinned === null) throw pluginRequestErrors.connection_unavailable("所绑定的账号还没记下它的站点，请在设置的「服务连接」里重新连接这个账号，插件才能用它");
    if ((pinned ?? origin) !== origin) throw pluginRequestErrors.connection_unavailable(`所绑定的账号只能请求 ${pinned}`);
    return { connection_id: connection.connection_id, auth_method: connection.auth_method as "token" | "oauth" };
  });
}

async function send(dispatch: PluginConnectionDispatch, credential: Record<string, string> | undefined, options: PluginConnectionsPortOptions): Promise<PluginConnectionResponse> {
  const headers = { "user-agent": "Molis-Work", ...dispatch.headers, ...credential };
  const response = await sendPublicHttps({ url: dispatch.url, method: dispatch.method, headers, ...(dispatch.body === undefined ? {} : { body: dispatch.body }),
    signal: dispatch.signal, beforeEffect: dispatch.beforeEffect, ...(options.lookup ? { lookup: options.lookup } : {}),
    ...(options.allowAddress ? { allowAddress: options.allowAddress } : {}), ...(options.testServer ? { testServer: options.testServer } : {}),
    failure: (reason, detail) => FAILURES[reason](detail) });
  const visible: Record<string, string> = {};
  for (const [name, value] of Object.entries(response.headers)) if (typeof value === "string" && visibleHeader(name)) visible[name] = value;
  return { status: response.status, headers: visible, body: response.body, authenticated: credential !== undefined };
}
