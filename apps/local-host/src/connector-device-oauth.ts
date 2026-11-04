import { randomUUID } from "node:crypto";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginOAuthMethodDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { ApiOAuthError, assertStillDeclared, commitApiOAuth, declared, declaredMethod, localOrigin, methodFingerprint, object, registryOwners, sender, serialized,
  settingsOf, text, type Json, type OAuthConfiguration, type OAuthOwners } from "./connector-api-oauth.js";
import { assertConnectorAuthorizationPending, beginConnectorAuthorization, expireConnectorAuthorizations, finishConnectorAuthorization, pendingConnectorAuthorizations } from "./connector-authorization-status.js";
import { readConnectorAuthorizationPresentation, saveConnectorAuthorizationPresentation } from "./connector-authorization-presentation.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { oauthDeviceRequest, oauthTokenRequest } from "./connector-oauth-declarations.js";
import { connectorProductAuth } from "./connector-product-auth.js";
import { connectorProtocolSecrets, withConnectorProtocols } from "./connector-protocol-store.js";
import { checkConnectorSetupSubmission } from "./connector-setup-submission.js";
import type { PeriodicTasks } from "./periodic-tasks.js";

// The device authorization grant of the generic OAuth flow (RFC 8628, W5-11 §2.5). The service's declaration says where to ask for the
// code and where to poll; the platform does the rest: it keeps the device code, rate-limits the polling itself, and judges the
// declaring plugin and the authorization on every poll, the way a callback does (S-101, S-106). The page gets the user code, the
// address to type it at and a state to poll with, never the device code.

/** A pending device authorization: the OAuth configuration of a callback flow plus what polling needs. */
interface DeviceConfiguration extends OAuthConfiguration {
  grant: "device";
  /** The earliest the service may be asked again; every authorization has its own, and `slow_down` moves only that one. */
  nextPollAt: number;
  interval: number;
}
const MIN_INTERVAL_SECONDS = 5, MAX_INTERVAL_SECONDS = 60, SLOW_DOWN_SECONDS = 5, MAX_EXPIRES_SECONDS = 600;
const USER_CODE = /^[A-Za-z0-9][A-Za-z0-9 -]{0,63}$/u;
const MAX_ADDRESS_LENGTH = 2048;

/**
 * The address the person types the code at: https, no account or port, and exactly the origin the device authorization request went
 * to. Compared as parsed origins, so a lookalike, a subdomain or another port is not it. A page that fails this ends the authorization.
 */
function verificationAddress(raw: unknown, requestUrl: string): string {
  const value = text(raw);
  if (value.length > MAX_ADDRESS_LENGTH) throw new ApiOAuthError("授权服务返回的验证地址无效");
  let url: URL;
  try { url = new URL(value); } catch { throw new ApiOAuthError("授权服务返回的验证地址无效"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || url.origin !== new URL(requestUrl).origin) {
    throw new ApiOAuthError("授权服务返回的验证地址不是它声明的服务地址");
  }
  return url.href;
}
function seconds(value: unknown, fallback: number, least: number, most: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(most, Math.max(least, Math.floor(parsed))) : fallback;
}
function deviceMethod(method: PluginOAuthMethodDeclaration, serviceId: string): PluginOAuthMethodDeclaration {
  if (method.grant !== "device") throw new ApiOAuthError("这个服务没有声明设备授权", serviceId);
  return method;
}

/** Starts a device authorization: asks the service for a code, keeps the device code, hands the page what the person needs. */
export async function startDeviceOAuth(home: string, input: { serviceId: string; displayName: string; origin: string; clientId?: string; connectionId?: string; setupId?: string },
  fetchImpl?: typeof fetch, owners: OAuthOwners = registryOwners(home)) {
  const origin = localOrigin(input.origin);
  const setup = { service_id: input.serviceId, method: "oauth" as const, connection_id: input.connectionId };
  checkConnectorSetupSubmission(home, input.setupId, setup);
  const owner = await owners(input.serviceId, "device");
  const method = deviceMethod(declaredMethod(owner, input.serviceId), input.serviceId);
  const settings = settingsOf(input.serviceId, method, {});
  if (!input.displayName.trim() || input.displayName.length > 100) throw new ApiOAuthError("请填写连接名称（最多 100 字）");
  let previousRevision: string | undefined;
  let clientId = input.clientId?.trim() ?? "";
  if (input.connectionId) {
    const current = withConnectorConnections(home, store => store.require(input.connectionId!, input.serviceId));
    if (current.auth_method !== "oauth") throw new ApiOAuthError("这条连接不是 OAuth 连接");
    previousRevision = current.updated_at;
    const before = withConnectorProtocols(home, store => store.get<OAuthConfiguration>(input.connectionId!));
    if (!clientId && before?.protocol === "oauth" && before.serviceId === input.serviceId && before.grant === "device") clientId = before.clientId;
  }
  if (!clientId) clientId = connectorProductAuth(input.serviceId, "oauth")?.clientId ?? "";
  if (!clientId || clientId.length > 512 || /[\r\n]/u.test(clientId)) throw new ApiOAuthError("请填写有效的 OAuth Client ID");
  const request = declared(() => oauthDeviceRequest(method, settings, clientId), input.serviceId);
  const send = sender(fetchImpl, { current: () => checkConnectorSetupSubmission(home, input.setupId, setup) });
  let started: Json;
  try {
    const response = await send(request.url, { method: request.method, headers: request.headers, body: request.body, redirect: "error", signal: AbortSignal.timeout(25_000) });
    started = object(await response.json().catch(() => undefined));
    if (!response.ok || started.error) throw new ApiOAuthError("授权服务拒绝了设备授权请求");
  } catch { throw new ApiOAuthError("无法开始设备授权，请检查应用配置或稍后重试", input.serviceId); }
  // A cancelled preparation cannot be claimed after the service's answer returns.
  checkConnectorSetupSubmission(home, input.setupId, setup);
  const deviceCode = text(started.device_code), userCode = text(started.user_code);
  if (!deviceCode || deviceCode.length > 4096 || !USER_CODE.test(userCode)) throw new ApiOAuthError("授权服务返回的设备码无效", input.serviceId);
  const verification = verificationAddress(started.verification_uri, request.url);
  const complete = started.verification_uri_complete === undefined ? undefined : verificationAddress(started.verification_uri_complete, request.url);
  const interval = seconds(started.interval, MIN_INTERVAL_SECONDS, MIN_INTERVAL_SECONDS, MAX_INTERVAL_SECONDS);
  const sessionId = randomUUID();
  const configuration: DeviceConfiguration = { protocol: "oauth", grant: "device", connectionId: input.connectionId ?? randomUUID(), serviceId: input.serviceId, sessionId,
    clientSource: input.clientId?.trim() ? "custom" : "product", displayName: input.displayName.trim(), clientId, redirectUri: "", settings: {},
    context: { auth_method: "oauth", client_id: clientId }, ...(previousRevision ? { previousRevision } : {}),
    plugin: { plugin_id: owner!.plugin_id, install_id: owner!.install_id, publisher_id: owner!.publisher_id }, fingerprint: methodFingerprint(owner!),
    interval: interval * 1000, nextPollAt: Date.now() + interval * 1000 };
  const secrets = connectorProtocolSecrets(home, sessionId);
  const state = withConnectorProtocols(home, store => store.begin(origin, configuration));
  try {
    secrets.put("client", JSON.stringify({ clientSecret: "" }));
    secrets.put("device", deviceCode);
    const authorizationId = beginConnectorAuthorization(home, state, configuration.connectionId, input.serviceId, Date.now(), input.setupId);
    saveConnectorAuthorizationPresentation(home, authorizationId, { authorization_url: complete ?? verification, user_code: userCode, device_state: state, origin });
    return { state, authorization_id: authorizationId, connection_id: configuration.connectionId, user_code: userCode, verification_uri: complete ?? verification,
      expires_in: seconds(started.expires_in, MAX_EXPIRES_SECONDS, 1, MAX_EXPIRES_SECONDS), interval };
  } catch (error) { withConnectorProtocols(home, store => store.discard(state)); secrets.clear(); throw error; }
}

/**
 * One poll. The service is asked only once the authorization's own interval has passed; a poll that comes early answers `pending` and
 * sends nothing. The record is read again inside the connection's queue, so a poll that waited behind another one sees the interval that
 * one set. Before every request and again before the connection is committed the authorization is judged as a callback is: still
 * pending, the declaring plugin and its method unchanged. Only an explicit error code from the service ends the authorization with a
 * status; a request that cannot be made or answered (no connection, a timeout, an answer with no code in it) is tried again after a
 * longer wait, until the authorization expires (RFC 8628 §3.5).
 */
export async function pollDeviceOAuth(home: string, input: { origin: string; state: string; signal?: AbortSignal }, fetchImpl?: typeof fetch, owners: OAuthOwners = registryOwners(home)) {
  const origin = localOrigin(input.origin), state = input.state;
  const read = () => {
    const config = withConnectorProtocols(home, store => store.read<DeviceConfiguration>(state, origin)).configuration;
    if (config.protocol !== "oauth" || config.grant !== "device") throw new ApiOAuthError("设备授权方式不匹配，请重新开始");
    return config;
  };
  const first = read();
  const secrets = connectorProtocolSecrets(home, first.sessionId);
  let terminal = false;
  try {
    return await serialized(home, first.connectionId, async () => {
      if (input.signal?.aborted) return { status: "pending" as const };
      const config = read();
      assertConnectorAuthorizationPending(home, state);
      if (Date.now() < config.nextPollAt) return { status: "pending" as const };
      const later = () => {
        config.interval = Math.min(MAX_INTERVAL_SECONDS * 1000, config.interval + SLOW_DOWN_SECONDS * 1000);
        config.nextPollAt = Date.now() + config.interval;
        withConnectorProtocols(home, store => store.update(state, config));
        return { status: "pending" as const };
      };
      // Whatever the service answers, nobody asks it again before the interval has run: a poll that fails keeps the record from being hit twice.
      config.nextPollAt = Date.now() + config.interval;
      withConnectorProtocols(home, store => store.update(state, config));
      await assertStillDeclared(config, owners);
      const method = deviceMethod(declaredMethod(await owners(config.serviceId, "device"), config.serviceId), config.serviceId);
      const deviceCode = secrets.get("device");
      if (!deviceCode) throw new ApiOAuthError("设备授权已失效，请重新开始", config.serviceId);
      const send = sender(fetchImpl, { beforeEffect: () => assertStillDeclared(config, owners), current: () => assertConnectorAuthorizationPending(home, state) });
      const request = declared(() => oauthTokenRequest(method, settingsOf(config.serviceId, method, config.settings), { clientId: config.clientId, clientSecret: "", redirectUri: "", deviceCode }), config.serviceId);
      let tokens: Json;
      try {
        const response = await send(request.url, { method: request.method, headers: request.headers, body: request.body, redirect: "error", signal: input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000) });
        tokens = object(await response.json().catch(() => undefined));
      } catch (error) {
        // The checks that run around the request refuse with the flow's own errors; anything else is the network.
        if (error instanceof ApiOAuthError || error instanceof ActionError) throw error;
        // The Host stopping is not the service failing: nothing is written for it.
        return input.signal?.aborted ? { status: "pending" as const } : later();
      }
      assertConnectorAuthorizationPending(home, state);
      if (!text(tokens.access_token)) {
        const reason = text(tokens.error);
        if (reason === "authorization_pending") return { status: "pending" as const };
        if (!reason || reason === "slow_down") return later();
        terminal = true;
        const status = reason === "expired_token" ? "expired" as const : reason === "access_denied" ? "cancelled" as const : "failed" as const;
        finishConnectorAuthorization(home, state, status);
        return { status };
      }
      // The token is claimed once: a second poll finds the record taken.
      withConnectorProtocols(home, store => store.consume(state, origin)); terminal = true;
      const result = await commitApiOAuth(home, state, config, method, tokens, send, owners, secrets);
      return result.status === "pending" ? result : { status: "authorized" as const, connection_id: result.connection!.connection_id };
    });
  } catch (error) {
    terminal = true;
    finishConnectorAuthorization(home, state, "failed");
    throw error instanceof ApiOAuthError ? error : new ApiOAuthError("设备授权未完成，请重新准备接入", first.serviceId);
  } finally { if (terminal) { withConnectorProtocols(home, store => store.discard(state)); secrets.clear(); } }
}

/**
 * Device polling is protocol work on the Host's timer registry, independent of any open page or model; it covers every service that
 * declares the grant. Each authorization polls on its own: a tick starts the ones not already in flight and does not wait for them, so
 * a service whose endpoint hangs holds up only its own authorization. Stopping the timer registry aborts the requests in flight and
 * waits for those polls to finish, so nothing is committed or written once `stop()` has returned.
 */
export function registerConnectorDevicePolling(home: string, periodic: PeriodicTasks): void {
  const inFlight = new Map<string, Promise<unknown>>();
  const stopping = new AbortController();
  periodic.every({ id: "connector-device-authorization", title: "完成设备登录授权", owner: "connectors", intervalMs: 2000,
    run: () => runWithMolisWorkHome(home, async () => {
      if (stopping.signal.aborted) return;
      expireConnectorAuthorizations(home);
      for (const request of pendingConnectorAuthorizations(home)) {
        const ui = readConnectorAuthorizationPresentation(home, request.id);
        if (!ui?.device_state || !ui.origin || inFlight.has(ui.device_state)) continue;
        const { device_state: state, origin } = ui;
        inFlight.set(state, runWithMolisWorkHome(home, () => pollDeviceOAuth(home, { state, origin, signal: stopping.signal })).catch(() => undefined).finally(() => inFlight.delete(state)));
      }
    }),
    onStop: () => { stopping.abort(); return Promise.all(inFlight.values()); },
  });
}
