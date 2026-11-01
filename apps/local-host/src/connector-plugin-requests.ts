import { existsSync } from "node:fs";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginConnectionDescription, PluginConnectionResponse } from "@molis-ai/molis-work-contracts/platform/plugin-connections";
import { CONNECTOR_REQUEST_SERVICES, type ConnectorRequestService } from "@molis-ai/molis-work-contracts/services/connector-host";
import { pluginBindingScope, type ConnectorConnectionStore } from "@molis-ai/molis-work-service-connector-host";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import type { CallConnection, CallConnectionsPort, PluginConnectionDispatch, PluginConnectionsPort, PluginConnectionTarget } from "@molis-ai/molis-work-plugin-runtime";
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
  return existsSync(homeSqlitePath(home, "connectors")) ? withConnectorConnections(home, store => [...new Set(store.pluginBindings().map(binding => binding.install_id))]) : [];
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
 * disconnected, of another service, made for another package's installation (T-134), pinned to another origin (or, for a tenant's service, to none), or of a kind whose secret the Host
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
      const what = `连接槽 ${target.slot_id}`, origin = reachable(service, dispatch.url, what);
      return sendThrough(home, target.service_id, service, boundConnection(home, target, service, origin), dispatch, what, options);
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
 * The Host's side of a call's own connection (S-95): a sandboxed integration's pull uses the account the person chose for the source, which
 * the Host's proxy names; nothing is looked up by slot and nothing is bound. The service is the platform's when its table has it, and
 * otherwise the origins the signed package declared for its own service, sent with the account's token as a bearer and never refreshed.
 * Everything else is the slot's rule: only those origins, only public addresses, a connection that is gone, disabled, disconnected or of
 * another service refused rather than sent without its credential, and no account (`connection_id: null`) sent as the plugin wrote it.
 */
export function createCallConnectionsPort(home: string, options: PluginConnectionsPortOptions = {}): CallConnectionsPort {
  return {
    async request(call, dispatch) {
      const service = callService(call);
      if (!service) throw pluginRequestErrors.service_unknown(`服务 ${call.service_id} 既不在平台的请求表里，插件也没有写它的来源`);
      const what = "来源的账号", origin = reachable(service, dispatch.url, what);
      // A Home that has never saved an account has no connection to name; reading must not create its registry.
      if (call.connection_id !== null && !existsSync(homeSqlitePath(home, "connectors"))) throw pluginRequestErrors.connection_unavailable("来源的账号已不可用，请在来源上重新选择");
      const connection = call.connection_id === null ? null : withConnectorConnections(home, store => usableConnection(home, store, call.connection_id!, call.service_id, service, origin, call.install_id));
      return sendThrough(home, call.service_id, service, connection, dispatch, what, options);
    },
    describe(call) {
      if (call.connection_id === null || !existsSync(homeSqlitePath(home, "connectors"))) return { bound: call.connection_id !== null, ...(call.connection_id === null ? {} : { state: "disconnected" as const }) };
      return withConnectorConnections(home, store => {
        const connection = store.get(call.connection_id!);
        if (!connection || pinnedToAnother(store, connection.connection_id, call.install_id)) return { bound: true, state: "disconnected" as const };
        return { bound: true, display_name: connection.display_name, state: connection.service_id === call.service_id ? shownState(home, connection, store.state(connection)) : "disconnected" };
      });
    },
  };
}

/** A service a package declared the origins of: the account's token as a bearer, no refresh path the Host knows. */
function callService(call: CallConnection): ConnectorRequestService | undefined {
  if (Object.hasOwn(CONNECTOR_REQUEST_SERVICES, call.service_id)) return CONNECTOR_REQUEST_SERVICES[call.service_id]!;
  return call.origins?.length ? { origins: [...call.origins], credential: { token: "bearer" }, refresh: "none" } : undefined;
}

/** The request's origin when the service may reach it; a tenant's service any of its own sites, the account's pinned one checked later. */
function reachable(service: ConnectorRequestService, url: URL, what: string): string {
  const origin = url.origin, tenant = service.tenant;
  if (tenant ? !origin.endsWith(`.${tenant.domain}`) : !service.origins.includes(origin)) {
    throw pluginRequestErrors.origin_refused(`${what}只能请求 ${tenant ? `所绑定账号的 ${tenant.domain} 站点` : service.origins.join("、")}`);
  }
  return origin;
}

/** Sends with the connection's credential (refreshed once on a 401 the Host can refresh), or as the plugin wrote it when there is none. */
async function sendThrough(home: string, service_id: string, service: ConnectorRequestService, connection: { connection_id: string; auth_method: "token" | "oauth" } | null,
  dispatch: PluginConnectionDispatch, what: string, options: PluginConnectionsPortOptions): Promise<PluginConnectionResponse> {
  const origin = dispatch.url.origin, tenant = service.tenant;
  if (connection === null) {
    if (tenant) throw pluginRequestErrors.origin_refused(`${what}要先由人选好账号，才知道请求哪个站点`);
    return send(dispatch, undefined, options);
  }
  const { connection_id, auth_method } = connection, scheme = service.credential[auth_method]!;
  return withConnectorRequest(home, connection_id, dispatch.signal, async signal => {
    // The token, refreshed or not, stays here: a refusal names no credential, and the refreshed token is not in the answer.
    const current = () => { signal.throwIfAborted(); dispatch.current(); };
    const control = { signal, current, beforeEffect: async () => { current(); await dispatch.beforeEffect(); current(); } };
    const access = async <T>(read: Promise<T>): Promise<T> => {
      try { return await read; }
      catch { await control.beforeEffect(); current(); throw pluginRequestErrors.connection_unavailable("所绑定的账号需要重新授权，请在设置里检查连接"); }
    };
    // An OAuth connection to a gateway service goes to the gateway of the site it was authorized for; the credential as its scheme writes it.
    const sendWith = async ({ token, authExtras }: { token: string; authExtras?: Record<string, string> }) => {
      const url = tenant?.gateway && auth_method === "oauth" ? gatewayUrl(tenant, service_id, dispatch.url, origin, authExtras) : dispatch.url;
      let header: Record<string, string>;
      try { if (!url) throw new Error("no gateway"); header = credentialHeader(scheme, service_id, auth_method, token); }
      catch { throw pluginRequestErrors.connection_unavailable("所绑定的账号缺少发请求要用的信息，请在设置里重新连接"); }
      return send({ ...dispatch, ...control, url }, header, options);
    };
    const first = await sendWith(await access(resolveApiConnection(home, connection_id, control, service_id, false, options)));
    if (first.status !== 401 || service.refresh !== "host" || auth_method !== "oauth") return first;
    const refreshed = await access(resolveApiConnection(home, connection_id, control, service_id, "if_available", options));
    if (refreshed === null) return first;
    // Once: the resend asks the call again after its own DNS (`beforeEffect`), so a call that ended meanwhile sends nothing more.
    return sendWith(refreshed);
  });
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
    if (pinnedToAnother(store, connection.connection_id, target.install_id)) return { bound: true, state: "disconnected" };
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
    return binding ? usableConnection(home, store, binding.connection_id, target.service_id, service, origin, target.install_id) : null;
  });
}

/**
 * Whether a connection was made for a signed package and `install_id` is not that package's installation (T-134): the plugin id and the
 * publisher's verified signature. A package of another publisher that declares the same service later is another installation, so
 * it never gets the account the first one was given. A built-in or platform service's connection has no pin and is judged as before.
 */
function pinnedToAnother(store: ConnectorConnectionStore, connection_id: string, install_id: string): boolean {
  const pin = store.declarers.get(connection_id);
  return pin !== null && pin.install_id !== install_id;
}

/**
 * A connection that can send to `origin` for `service_id` as it is, to the installation `install_id` the request runs as; any other is
 * refused, not sent without its credential. A pin to another installation is refused before anything of the credential is read.
 */
function usableConnection(home: string, store: ConnectorConnectionStore, connection_id: string, service_id: string, service: ConnectorRequestService, origin: string, install_id: string)
  : { connection_id: string; auth_method: "token" | "oauth" } {
  const connection = store.get(connection_id);
  if (connection && pinnedToAnother(store, connection.connection_id, install_id)) throw pluginRequestErrors.connection_unavailable("所绑定的账号不是为这个插件建的，请在设置里为它新建连接");
  const usable = connection && connection.service_id === service_id && shownState(home, connection, store.state(connection)) === "connected"
    && (connection.auth_method === "token" || connection.auth_method === "oauth") && service.credential[connection.auth_method] !== undefined;
  if (!usable) throw pluginRequestErrors.connection_unavailable("所绑定的账号已不可用，请在设置里重新选择或解除绑定");
  const pinned = store.targetOrigin(connection.connection_id);
  // A tenant's connection saved before its origin was pinned (BL-595) is usable again once the person connects it again.
  if (service.tenant && pinned === null) throw pluginRequestErrors.connection_unavailable("所绑定的账号还没记下它的站点，请在设置的「服务连接」里重新连接这个账号，插件才能用它");
  if ((pinned ?? origin) !== origin) throw pluginRequestErrors.connection_unavailable(`所绑定的账号只能请求 ${pinned}`);
  return { connection_id: connection.connection_id, auth_method: connection.auth_method as "token" | "oauth" };
}

async function send(dispatch: PluginConnectionDispatch, credential: Record<string, string> | undefined, options: PluginConnectionsPortOptions): Promise<PluginConnectionResponse> {
  const headers = { "user-agent": "Molis-Work", ...dispatch.headers, ...credential };
  const response = await sendPublicHttps({ url: dispatch.url, method: dispatch.method, headers, ...(dispatch.body === undefined ? {} : { body: dispatch.body }),
    signal: dispatch.signal, beforeEffect: dispatch.beforeEffect, current: dispatch.current, ...(options.lookup ? { lookup: options.lookup } : {}),
    ...(options.allowAddress ? { allowAddress: options.allowAddress } : {}), ...(options.testServer ? { testServer: options.testServer } : {}),
    failure: (reason, detail) => FAILURES[reason](detail) });
  const visible: Record<string, string> = {};
  for (const [name, value] of Object.entries(response.headers)) if (typeof value === "string" && visibleHeader(name)) visible[name] = value;
  return { status: response.status, headers: visible, body: response.body, authenticated: credential !== undefined };
}
