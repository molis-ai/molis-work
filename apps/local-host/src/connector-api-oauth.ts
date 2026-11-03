import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { connectorErrors, type ConnectorCallControl } from "@molis-ai/molis-work-contracts/services/connector-host";
import { controlledConnectorFetch } from "@molis-ai/molis-work-plugin-sdk";
import { submitConnectorActivation } from "./connector-authorization-commit.js";
import type { ConnectorActivation } from "./connector-activation.js";
import { assertConnectorAuthorizationPending, beginConnectorAuthorization, finishConnectorAuthorization } from "./connector-authorization-status.js";
import { checkConnectorSetupSubmission } from "./connector-setup-submission.js";
import { saveConnectorAuthorizationPresentation } from "./connector-authorization-presentation.js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { OAuthTokenRequestDeclaration, PluginOAuthMethodDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { isDeclaredOAuth } from "@molis-ai/molis-work-plugin-sdk/oauth";
import { withConnectorConnections } from "./connector-connection-store.js";
import { connectorProductAuth, connectorBrokerOrigin } from "./connector-product-auth.js";
import { oauthAccount, oauthAccountRequest, oauthAuthorizationContext, oauthAuthorizationUrl, oauthContextValue, oauthEndpointFingerprint, oauthExpiry,
  oauthKept, oauthSecretRequired, oauthTokenRequest, resolveOAuthSettings, type OAuthRequestDescription, type OAuthResolvedSettings } from "./connector-oauth-declarations.js";
import { publicOAuthFetch, type OAuthNetwork, type OAuthSendChecks } from "./connector-oauth-send.js";
import { startSharedRefresh, type SharedRefresh, type SharedRefreshRun } from "./connector-shared-refresh.js";
import { connectorProtocolSecrets, withConnectorProtocols, type ConnectorAuthorizationSession, type ConnectorProtocolConfiguration } from "./connector-protocol-store.js";
import { isLoopbackHttpOrigin } from "@molis-ai/molis-work-contracts/platform/loopback";
import { tokenEndpointRefused } from "./connector-refresh-refusals.js";
import { homeIntegrationRegistry } from "./builtin-integrations.js";
import type { OAuthServiceOwner } from "./integration-registry.js";
export { apiOAuthConnectionId } from "./connector-oauth-shape.js";
import { OAUTH_CALLBACK as CALLBACK, defaultOAuthCallback, isOAuthCallbackAliasFor } from "./connector-oauth-callback-paths.js";
import { assertOAuthReturnPending, beginOAuthReturn, expiredOAuthReturn, finishOAuthReturn, type OAuthReturn } from "./connector-oauth-return.js";

interface OAuthConfiguration extends ConnectorProtocolConfiguration {
  protocol: "oauth";
  sessionId: string;
  displayName: string;
  clientId: string;
  redirectUri: string;
  settings: Record<string, string>;
  context: Record<string, string>;
  previousRevision?: string;
  /** Where the person returns to once the authorization ends; never saved with the connection. */
  returnTo?: OAuthReturn;
  brokerOrigin?: string;
  clientSource?: "product" | "custom";
  /**
   * Who declared the method when the authorization started, and what it declared (W5-11 §3.2). Never saved with the connection: a result
   * held for the person's intent keeps them in its private completion, to be judged once more before it takes effect.
   */
  plugin?: Omit<OAuthServiceOwner, "method">;
  fingerprint?: string;
  /** RFC 9207: the callback must name this issuer when the declaration gives one. */
  issuer?: string;
  /**
   * What the connection was activated under (W5-11 §2.6, M1(a)), saved with it: the declaring plugin, its publisher and the endpoint
   * fingerprint (`oauthEndpointFingerprint`). A refresh or a request goes ahead only while the plugin declaring the service now is the same.
   */
  binding?: { plugin_id: string; publisher_id: string; endpoint: string };
}
/** Refusals of an OAuth connection's use. */
export const oauthConnectionErrors = defineErrorCodes("connector.oauth", { method_unavailable: "unavailable" });
/** Who declares a service's OAuth method now: the Home's integration registry unless a test brings its own. */
export type OAuthOwners = (serviceId: string) => Promise<OAuthServiceOwner | undefined>;
const registryOwners = (home: string): OAuthOwners => async serviceId => (await homeIntegrationRegistry(home)).oauthOwner(serviceId);
/** The method as declared now: the Manifest's `oauth` method, all of it data (W5-11 slice 4). */
function methodFingerprint(owner: OAuthServiceOwner): string {
  return createHash("sha256").update(JSON.stringify(owner.method)).digest("hex");
}
/** The service's `oauth` method as the enabled plugin declares it now; a service with none has no OAuth connection. */
function declaredMethod(owner: OAuthServiceOwner | undefined, serviceId: string): PluginOAuthMethodDeclaration {
  if (!owner?.method || !isDeclaredOAuth(owner.method)) throw new ApiOAuthError("没有已启用的宿主插件声明这个服务的 OAuth 连接", serviceId);
  return owner.method;
}
/**
 * The method a connection of the generic flow may use now (W5-11 §2.6). The plugin declaring its service must be enabled (Q3): otherwise
 * `method_unavailable`, no request sent, back as soon as it is enabled again. And it must be the plugin, publisher and endpoints the
 * connection was activated under (M1(a)): otherwise the connection needs reauthorizing (`refused`), and neither its refresh token nor its
 * client secret goes anywhere. A connection activated before bindings were saved has none, and is reauthorized the same way.
 */
function boundMethod(config: OAuthConfiguration, owner: OAuthServiceOwner | undefined): PluginOAuthMethodDeclaration {
  if (!owner?.method || !isDeclaredOAuth(owner.method)) {
    throw oauthConnectionErrors.method_unavailable("方法不可用：声明这个服务的插件已停用，重新启用后恢复");
  }
  const binding = config.binding;
  if (!binding || binding.plugin_id !== owner.plugin_id || binding.publisher_id !== owner.publisher_id || binding.endpoint !== oauthEndpointFingerprint(owner.method)) {
    throw new ApiOAuthError("这条连接授权时的服务声明已变更，请重新授权此连接", config.serviceId, true);
  }
  return owner.method;
}
/** The interpreter's answer, its refusal said to the person as the flow's own error. */
function declared<T>(run: () => T, serviceId?: string): T {
  try { return run(); } catch (error) { throw error instanceof ApiOAuthError ? error : new ApiOAuthError(error instanceof Error ? error.message : "授权方式的声明无法读取", serviceId); }
}
function settingsOf(serviceId: string, method: PluginOAuthMethodDeclaration, raw: Record<string, string>): OAuthResolvedSettings {
  return declared(() => resolveOAuthSettings(serviceId, method, raw), serviceId);
}
/** The callback's rules 6 and 7 (W5-11 §3.3): the declaring plugin is still enabled as the same install and publisher, and its method unchanged. */
async function assertStillDeclared(config: OAuthConfiguration, owners: OAuthOwners): Promise<void> {
  const owner = await owners(config.serviceId);
  if (!owner || !config.plugin || owner.plugin_id !== config.plugin.plugin_id || owner.install_id !== config.plugin.install_id || owner.publisher_id !== config.plugin.publisher_id) {
    throw new ApiOAuthError("声明这个服务的插件在授权期间已停用或变更，请重新连接");
  }
  if (methodFingerprint(owner) !== config.fingerprint) throw new ApiOAuthError("这个服务的授权方式在授权期间已变更，请重新连接");
}
/**
 * The last check before a held result takes effect (W5-11 §3.3 step 5): rules 6 and 7 once more, against what the completion pinned.
 * A generic flow's completion that pinned nothing is refused; the dedicated flows (Gmail, Notion) save no OAuth configuration and pin
 * nothing yet (slices 6 and 7).
 */
export async function assertHeldOAuthDeclared(home: string, completion: ConnectorActivation, owners: OAuthOwners = registryOwners(home)): Promise<void> {
  if (completion.kind !== "oauth" || completion.protocol?.protocol !== "oauth") return;
  try {
    await assertStillDeclared({ ...completion.protocol as OAuthConfiguration, ...completion.declaration }, owners);
  } catch (error) {
    throw connectorErrors["connector.connection.invalid"](error instanceof ApiOAuthError ? error.message : "无法确认声明这个服务的插件，请重新连接");
  }
}
export class ApiOAuthError extends Error {
  /** `refused`: the token endpoint said no (`tokenEndpointRefused`), not a network failure or a 5xx. `status`: the service's HTTP answer. */
  constructor(message: string, readonly serviceId?: string, readonly refused = false, readonly status?: number) { super(message); }
  /** Set once the callback's record is known: where the person returns to, for the page that answers the callback. */
  returnTo?: OAuthReturn;
}
type Json = Record<string, unknown>;
function object(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function localOrigin(raw: string): string {
  const url = new URL(raw);
  if (!isLoopbackHttpOrigin(url)) throw new ApiOAuthError("OAuth 必须从本机应用启动");
  return url.origin;
}
/** A JSON answer the service did not refuse: a 2xx whose object, if it is one, carries no `error`, `ok: false` or non-zero `code`. */
async function answer(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<{ body: unknown }> {
  const response = await fetchImpl(url, { ...init, redirect: "error", signal: AbortSignal.any([AbortSignal.timeout(25_000), ...(init.signal ? [init.signal] : [])]) });
  let body: unknown;
  try { body = await response.json(); } catch { body = undefined; }
  const json = object(body);
  if (!response.ok || body === undefined || json.error || json.ok === false || (typeof json.code === "number" && json.code !== 0)) {
    throw new ApiOAuthError(`授权服务拒绝请求（HTTP ${response.status}）；请检查应用配置、回调、权限或重新授权`, undefined,
      tokenEndpointRefused(response.status, json.error), response.status);
  }
  return { body };
}
async function jsonRequest(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<Json> {
  return object((await answer(fetchImpl, url, init)).body);
}
async function described(fetchImpl: typeof fetch, request: OAuthRequestDescription): Promise<unknown> {
  return (await answer(fetchImpl, request.url, { method: request.method, headers: request.headers, ...(request.body === undefined ? {} : { body: request.body }) })).body;
}
/** The flow's own sender unless a test brings one: `sendPublicHttps` with the checks of this step. */
function sender(fetchImpl: typeof fetch | undefined, checks: OAuthSendChecks, network?: OAuthNetwork): typeof fetch {
  return fetchImpl ?? publicOAuthFetch(checks, network);
}
const queues = new Map<string, Promise<unknown>>();
async function serialized<T>(home: string, id: string, run: () => Promise<T>): Promise<T> {
  const key = `${resolve(home)}:${id}`;
  const previous = queues.get(key) ?? Promise.resolve();
  // Only the order is chained: the previous refresh's failure was already answered to its own caller.
  const next = previous.catch(() => {}).then(run);
  queues.set(key, next);
  try { return await next; } finally { if (queues.get(key) === next) queues.delete(key); }
}
function configured(home: string, id: string): OAuthConfiguration {
  const connection = withConnectorConnections(home, store => store.require(id));
  if (!connection.enabled || connection.disconnected_at) throw new ApiOAuthError("连接已断开，请重新授权");
  const config = withConnectorProtocols(home, store => store.get<OAuthConfiguration>(id));
  if (!config || config.protocol !== "oauth" || config.serviceId !== connection.service_id) throw new ApiOAuthError("找不到此连接的 OAuth 配置");
  return config;
}
export function apiOAuthContext(home: string, id: string): Record<string, string> | undefined {
  const config = withConnectorProtocols(home, store => store.get<OAuthConfiguration>(id));
  return config?.protocol === "oauth" ? { ...config.context, auth_method: "oauth" } : undefined;
}
export async function startApiOAuth(home: string, input: {
  serviceId: string; displayName: string; clientId: string; clientSecret?: string; settings?: Record<string, string>;
  origin: string; redirectUri?: string; connectionId?: string; setupId?: string; returnTo?: OAuthReturn;
}, fetchImpl?: typeof fetch, owners: OAuthOwners = registryOwners(home)) {
  const origin = localOrigin(input.origin);
  checkConnectorSetupSubmission(home, input.setupId, { service_id: input.serviceId, method: "oauth", connection_id: input.connectionId });
  const owner = await owners(input.serviceId);
  const method = declaredMethod(owner, input.serviceId);
  const settingKeys = (method.settings ?? []).map(setting => setting.key);
  let brokerOrigin: string | undefined;
  let clientSource: "product" | "custom" = "custom";
  // Reauthorization keeps this account's app settings on the host. Never send a
  // saved client secret back to the browser or borrow another account's client.
  const previous = input.connectionId ? withConnectorProtocols(home, store => store.get<OAuthConfiguration>(input.connectionId!)) : undefined;
  const reauthorizing = previous?.protocol === "oauth" && previous.serviceId === input.serviceId;
  if (input.connectionId && !input.clientId.trim()) {
    withConnectorConnections(home, store => store.require(input.connectionId!, input.serviceId));
    if (previous?.protocol === "oauth" && previous.serviceId === input.serviceId) {
      const secret = object(JSON.parse(connectorProtocolSecrets(home, input.connectionId).get("client") || "{}"));
      input = { ...input, clientId: previous.clientId, clientSecret: text(secret.clientSecret),
        settings: previous.settings, redirectUri: input.redirectUri || (previous.redirectUri.startsWith("https:") ? previous.redirectUri : undefined) };
      brokerOrigin = previous.brokerOrigin;
      clientSource = previous.clientSource ?? "custom";
      if (!brokerOrigin && !input.clientSecret && clientSource === "product") {
        const product = connectorProductAuth(input.serviceId, "oauth", settingKeys);
        if (!product || product.clientId !== previous.clientId || JSON.stringify(product.settings ?? {}) !== JSON.stringify(previous.settings)) {
          throw new ApiOAuthError("此账号的产品授权配置已变化，请联系支持或添加新连接", input.serviceId);
        }
        input = { ...input, clientSecret: product.clientSecret };
      }
      if (!brokerOrigin && !input.clientSecret && oauthSecretRequired(method, settingsOf(input.serviceId, method, previous.settings))) {
        throw new ApiOAuthError("此自定义应用的密钥已随断开移除，请展开高级设置重新填写原应用凭据", input.serviceId);
      }
    }
  }
  // A custom client never inherits a product secret. Reauthorization above has
  // priority, even when deployment configuration changes between sessions. A connection with no generic configuration (made before
  // its service joined the generic flow) chooses its client as a new one does, and ends at the callback's rule 8.
  if ((!input.connectionId || !reauthorizing) && !input.clientId.trim() && !input.clientSecret?.trim() && !input.redirectUri?.trim()) {
    brokerOrigin = connectorBrokerOrigin(input.serviceId);
    if (brokerOrigin) input = { ...input, clientId: "broker", settings: {} };
    const product = connectorProductAuth(input.serviceId, "oauth", settingKeys);
    if (!brokerOrigin && product) { input = { ...input, ...product }; clientSource = "product"; }
  }
  const settings = { ...input.settings };
  // A broker flow's settings are the broker's, checked once it answers.
  const resolved = brokerOrigin ? undefined : settingsOf(input.serviceId, method, settings);
  if (!input.clientId.trim() || input.clientId.length > 512 || /[\r\n]/u.test(input.clientId)) throw new ApiOAuthError("请填写有效的 OAuth Client ID");
  if (resolved && oauthSecretRequired(method, resolved) && !input.clientSecret?.trim()) throw new ApiOAuthError("请填写此应用的 Client Secret");
  if (!input.displayName.trim() || input.displayName.length > 100) throw new ApiOAuthError("请填写连接名称（最多 100 字）");
  // The service's registered alias is for a client the person registered; the broker's own callback sends the browser on to the generic one.
  const redirectUri = input.redirectUri?.trim() || (brokerOrigin ? `${origin}${CALLBACK}` : defaultOAuthCallback(input.serviceId, origin));
  const redirect = new URL(redirectUri);
  const local = redirectUri === `${origin}${CALLBACK}` || isOAuthCallbackAliasFor(input.serviceId, origin, redirectUri);
  if (redirect.username || redirect.password || redirect.hash || redirect.search || (redirect.protocol !== "https:" && !local)) throw new ApiOAuthError("回调地址应为当前本机回调，或你在服务商登记的 HTTPS 地址（无查询参数）");
  const connectionId = input.connectionId || randomUUID();
  let previousRevision: string | undefined;
  if (input.connectionId) {
    const current = withConnectorConnections(home, store => store.require(connectionId, input.serviceId));
    if (current.auth_method !== "oauth") throw new ApiOAuthError("这条连接不是 OAuth 连接");
    previousRevision = current.updated_at;
  }
  const sessionId = randomUUID();
  const configuration: OAuthConfiguration = { connectionId, serviceId: input.serviceId, protocol: "oauth", sessionId,
    clientSource, displayName: input.displayName.trim(), clientId: input.clientId.trim(), redirectUri, settings,
    context: { auth_method: "oauth", client_id: input.clientId.trim() }, previousRevision, ...(input.returnTo ? { returnTo: input.returnTo } : {}), ...(brokerOrigin ? { brokerOrigin } : {}),
    plugin: { plugin_id: owner!.plugin_id, install_id: owner!.install_id, publisher_id: owner!.publisher_id },
    fingerprint: methodFingerprint(owner!), ...(method.issuer ? { issuer: method.issuer } : {}) };
  const secrets = connectorProtocolSecrets(home, sessionId);
  secrets.put("client", JSON.stringify({ clientSecret: input.clientSecret?.trim() ?? "" }));
  const verifier = randomBytes(32).toString("base64url");
  secrets.put("verifier", verifier);
  const state = withConnectorProtocols(home, store => store.begin(origin, configuration));
  const authorizationId = beginConnectorAuthorization(home, state, connectionId, input.serviceId, Date.now(), input.setupId);
  if (brokerOrigin) {
    try {
      const result = await jsonRequest(sender(fetchImpl, { current: () => assertConnectorAuthorizationPending(home, state) }), `${brokerOrigin}/start`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ service_id: input.serviceId, return_uri: redirectUri, state, code_challenge: createHash("sha256").update(verifier).digest("base64url") }) });
      const authorize = new URL(text(result.authorization_url));
      if (authorize.protocol !== "https:" || authorize.username || authorize.password || !text(result.client_id)) throw new ApiOAuthError("产品授权服务返回无效配置");
      configuration.clientId = text(result.client_id);
      configuration.context.client_id = configuration.clientId;
      configuration.settings = Object.fromEntries(Object.entries(object(result.settings)).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
      settingsOf(input.serviceId, method, configuration.settings);
      withConnectorProtocols(home, store => store.update(state, configuration));
      saveConnectorAuthorizationPresentation(home, authorizationId, { authorization_url: authorize.href });
      beginOAuthReturn(home, input.returnTo, state);
      return { authorization_id: authorizationId, connection_id: connectionId, authorization_url: authorize.href, redirect_uri: redirectUri, manual_callback: false };
    } catch (error) { finishConnectorAuthorization(home, state, "failed"); withConnectorProtocols(home, store => store.discard(state)); secrets.clear(); throw error; }
  }
  let href: string;
  try {
    href = declared(() => oauthAuthorizationUrl(method, resolved!, { clientId: configuration.clientId, redirectUri, state,
      codeChallenge: createHash("sha256").update(verifier).digest("base64url") }), input.serviceId);
  } catch (error) { finishConnectorAuthorization(home, state, "failed"); withConnectorProtocols(home, store => store.discard(state)); secrets.clear(); throw error; }
  saveConnectorAuthorizationPresentation(home, authorizationId, { authorization_url: href });
  beginOAuthReturn(home, input.returnTo, state);
  return { authorization_id: authorizationId, connection_id: connectionId, authorization_url: href, redirect_uri: redirectUri, manual_callback: !local };
}
async function exchange(home: string, config: OAuthConfiguration, method: PluginOAuthMethodDeclaration, input: { code?: string; refreshToken?: string },
  fetchImpl: typeof fetch): Promise<Json> {
  if (config.brokerOrigin) {
    return jsonRequest(fetchImpl, `${config.brokerOrigin}/token`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ service_id: config.serviceId, ...(input.refreshToken ? { grant_type: "refresh_token", refresh_token: input.refreshToken }
        : { grant_type: "authorization_code", code: input.code, code_verifier: connectorProtocolSecrets(home, config.sessionId).get("verifier") }) }) });
  }
  const secrets = connectorProtocolSecrets(home, config.sessionId);
  const client = { clientId: config.clientId, clientSecret: text(object(JSON.parse(secrets.get("client") || "{}")).clientSecret), redirectUri: config.redirectUri };
  const request = declared(() => oauthTokenRequest(method, resolveOAuthSettings(config.serviceId, method, config.settings),
    input.refreshToken ? { ...client, refreshToken: input.refreshToken } : { ...client, code: input.code!, verifier: secrets.get("verifier") || "" }), config.serviceId);
  return object(await described(fetchImpl, request));
}
/**
 * What an authorization reads after the token comes back (W5-11 §2.1.1): the token response's kept values, each context request, the
 * site the platform's request check needs, then the account from the identity request. All of it lands in the connection's context.
 */
async function authorizedAccount(config: OAuthConfiguration, method: PluginOAuthMethodDeclaration, tokens: Json, token: string, fetchImpl: typeof fetch): Promise<string> {
  const settings = settingsOf(config.serviceId, method, config.settings);
  Object.assign(config.context, declared(() => oauthKept(config.serviceId, method.keep, tokens), config.serviceId));
  const scope = () => ({ serviceId: config.serviceId, method, accessToken: token, clientId: config.clientId, context: config.context, settings });
  for (const entry of method.context ?? []) {
    const response = await described(fetchImpl, declared(() => oauthAccountRequest(entry, scope()), config.serviceId));
    config.context[entry.key] = declared(() => oauthContextValue(entry.pick, response, settings), config.serviceId);
  }
  Object.assign(config.context, declared(() => oauthAuthorizationContext(config.serviceId, method, settings, config.context), config.serviceId));
  const account = await identityOf(config, method, settings, token, fetchImpl);
  Object.assign(config.context, account.kept, { account_id: account.account_id });
  return account.label;
}
/** The account the identity request answers for, read from it and the connection's context; with no `url`, from the context alone. */
async function identityOf(config: OAuthConfiguration, method: PluginOAuthMethodDeclaration, settings: OAuthResolvedSettings, token: string,
  fetchImpl: typeof fetch): Promise<ReturnType<typeof oauthAccount>> {
  const identity = method.identity;
  const response = identity.url === undefined ? undefined : await described(fetchImpl, declared(() => oauthAccountRequest(identity as OAuthTokenRequestDeclaration,
    { serviceId: config.serviceId, method, accessToken: token, clientId: config.clientId, context: config.context, settings }), config.serviceId));
  return declared(() => oauthAccount(config.serviceId, identity, { identity: response, context: config.context }), config.serviceId);
}
/**
 * The callback, judged in the order of W5-11 §3.3. The Host comes first (`localOrigin`), with the store untouched; then the record is
 * taken by its state, and from there every refusal ends it. Rules 1–7 refuse before any request,
 * rules 8 and 9 after the token request, and what those exchanged is never staged or committed. A refusal writes only what §3.4
 * allows: the taken record, the authorization's failed or cancelled status and the cleared stage.
 */
export async function completeApiOAuth(home: string, input: { origin: string; state?: string; code?: string; returnedUrl?: string; error?: string; iss?: string; callback?: string },
  fetchImpl?: typeof fetch, owners: OAuthOwners = registryOwners(home)) {
  const origin = localOrigin(input.origin);
  const returned = input.returnedUrl ? new URL(input.returnedUrl) : null;
  const state = returned?.searchParams.get("state") || input.state || "";
  const error = input.error || returned?.searchParams.get("error") || undefined;
  const ended = (config: OAuthConfiguration) => {
    const how = error === "access_denied" ? "cancelled" : "failed";
    finishConnectorAuthorization(home, state, how);
    finishOAuthReturn(home, config.returnTo, state, { ended: how });
  };
  // Rule 1: a state that is malformed, unknown, used or expired; an expired record is taken all the same. A used state ends nothing:
  // the callback that took it may still be exchanging its code.
  let session: ConnectorAuthorizationSession<OAuthConfiguration>;
  try { session = withConnectorProtocols(home, store => store.take<OAuthConfiguration>(state)); } catch (refused) {
    const failure = new ApiOAuthError(refused instanceof Error ? refused.message : "授权状态无效，请重新连接");
    failure.returnTo = expiredOAuthReturn(home, state);
    throw failure;
  }
  const config = session.configuration;
  const staged = config.protocol === "oauth" ? connectorProtocolSecrets(home, config.sessionId) : null;
  try {
    if (config.protocol !== "oauth") throw new ApiOAuthError("授权方式不匹配，请重新开始");
    // Rule 2: the local origin the authorization started from.
    if (session.origin !== origin) throw new ApiOAuthError("回调来自另一个本机地址，请从发起授权的页面重新连接");
    // Rule 3: the address the service came back to is the one registered for this authorization.
    const callback = returned ? `${returned.origin}${returned.pathname}` : input.callback ?? (config.brokerOrigin ? `${origin}${CALLBACK}` : defaultOAuthCallback(config.serviceId, origin));
    if (callback !== config.redirectUri) throw new ApiOAuthError("返回地址不匹配本次登记的回调地址");
    // Rule 4: the service said no, or gave no code. The onboarding journey, if the authorization came from one, must still wait for it.
    assertOAuthReturnPending(home, config.returnTo, state);
    if (error) throw new ApiOAuthError("授权被取消或拒绝，请重新连接");
    const code = returned?.searchParams.get("code") || input.code;
    if (!code || code.length > (config.brokerOrigin ? 16000 : 4096)) throw new ApiOAuthError("缺少有效的授权码");
    // Rule 5 (RFC 9207): a declared issuer must come back named.
    if (config.issuer && (returned?.searchParams.get("iss") ?? input.iss) !== config.issuer) throw new ApiOAuthError("授权服务的签发方不符，请重新连接");
    // Rules 6 and 7: the declaring plugin and its method, as they were when the authorization started. Judged again once the
    // connection's queue lets this callback go: another callback or a refresh may have held it meanwhile.
    await assertStillDeclared(config, owners);
    return await serialized(home, config.connectionId, async () => {
      await assertStillDeclared(config, owners);
      assertConnectorAuthorizationPending(home, state);
      const method = declaredMethod(await owners(config.serviceId), config.serviceId);
      // Each request checks once more after its address resolves, right before it connects (S-10, S-101).
      const send = sender(fetchImpl, { beforeEffect: () => assertStillDeclared(config, owners), current: () => assertConnectorAuthorizationPending(home, state) });
      const tokens = await exchange(home, config, method, { code }, send);
      const token = text(tokens.access_token);
      if (!token) throw new ApiOAuthError("服务未返回 access_token，请检查应用权限");
      const label = await authorizedAccount(config, method, tokens, token, send);
      // Rule 9: cancelled or revoked while waiting, or rules 6 and 7 no longer hold.
      await assertStillDeclared(config, owners);
      assertConnectorAuthorizationPending(home, state);
      // Rule 8: a reauthorization lands on the revision and the account it started from.
      if (config.previousRevision) {
        const previous = withConnectorConnections(home, store => store.require(config.connectionId, config.serviceId));
        if (previous.updated_at !== config.previousRevision) throw new ApiOAuthError("此连接在授权期间已变更，请重新开始");
        const previousContext = apiOAuthContext(home, config.connectionId);
        if (!previousContext?.account_id || previousContext.account_id !== config.context.account_id) throw new ApiOAuthError("无法确认这是原账号：请新增一条连接，并把原来绑在这条连接上的来源重新绑定到新连接");
      }
      const secrets = connectorProtocolSecrets(home, config.connectionId);
      const refreshToken = text(tokens.refresh_token), expires = oauthExpiry(method, tokens, Date.now());
      const credentials = { [secrets.reference("client")]: staged!.get("client") || "{}", [secrets.reference("access")]: token,
        [secrets.reference("oauth")]: refreshToken || null, [secrets.reference("expires")]: expires ? String(expires) : null };
      const saved: OAuthConfiguration = { ...config, sessionId: config.connectionId,
        binding: { plugin_id: config.plugin!.plugin_id, publisher_id: config.plugin!.publisher_id, endpoint: oauthEndpointFingerprint(method) } };
      delete saved.previousRevision; delete saved.plugin; delete saved.fingerprint; delete saved.issuer; delete saved.returnTo;
      const result = submitConnectorActivation(home, state, { kind: "oauth", target: { connectionId: config.connectionId, expectedRevision: config.previousRevision },
        credentials, protocol: saved, declaration: { plugin: config.plugin!, fingerprint: config.fingerprint! }, input: { connectionId: config.connectionId, serviceId: config.serviceId,
          displayName: config.displayName, accountLabel: label, accessRef: secrets.reference("access"),
          refreshRef: refreshToken ? secrets.reference("oauth") : null, expiresRef: expires ? secrets.reference("expires") : null, stableAccountValidated: true } });
      if (result.status !== "pending") finishOAuthReturn(home, config.returnTo, state, { connected: config.connectionId });
      return { service_id: config.serviceId, ...result, ...(config.returnTo ? { return_to: config.returnTo } : {}) };
    });
  } catch (refused) {
    ended(config);
    const failure = new ApiOAuthError(refused instanceof ApiOAuthError ? refused.message : "授权未完成，请检查应用配置与权限后重试", config.serviceId);
    failure.returnTo = config.returnTo;
    throw failure;
  } finally { staged?.clear(); }
}
const refreshes = new Map<string, SharedRefresh<string>>();
const LOST_AUTHORITY = "等这次刷新的调用已失去授权，换到的令牌不保存";
/**
 * A connection's access token, refreshed when asked, when it is about to expire or when only the refresh token is left. Each use checks
 * the connection's binding first (`boundMethod`). One refresh per connection at a time, shared by the calls that need it (RAC-1085,
 * `connector-shared-refresh.ts`): a call arriving while one is in flight joins it. A refresh starts in the connection's queue, behind a
 * callback or another refresh, and holds it until it ends; a call that left while queued starts nothing. `network` is how the refresh
 * leaves by `sendPublicHttps` (a test's name resolution); its checks are the refresh's own, never the caller's.
 */
export async function resolveApiOAuthToken(home: string, id: string, control: ConnectorCallControl, forceRefresh = false, fetchImpl?: typeof fetch,
  owners: OAuthOwners = registryOwners(home), network?: OAuthNetwork): Promise<string> {
  await control.beforeEffect(); control.current();
  const key = `${resolve(home)}:${id}`;
  const inFlight = refreshes.get(key);
  if (inFlight?.open) return inFlight.join(control);
  let resolveTurn!: (decided: string | SharedRefresh<string>) => void, rejectTurn!: (error: unknown) => void;
  const turn = new Promise<string | SharedRefresh<string>>((resolved, rejected) => { resolveTurn = resolved; rejectTurn = rejected; });
  void serialized(home, id, async () => {
    let started: SharedRefresh<string> | undefined;
    try {
      control.signal.throwIfAborted(); await control.beforeEffect(); control.current();
      const config = configured(home, id);
      const owner = await owners(config.serviceId);
      const method = boundMethod(config, owner);
      const secrets = connectorProtocolSecrets(home, id);
      const token = secrets.get("access");
      const expires = Number(secrets.get("expires"));
      if (token && !forceRefresh && (!expires || expires > Date.now() + 60_000)) { resolveTurn(token); return; }
      if (!secrets.get("oauth")) throw new ApiOAuthError("访问令牌已失效，请重新授权此连接");
      const revision = withConnectorConnections(home, store => store.require(id)).updated_at;
      started = startSharedRefresh(control, refresh => renewed(home, id, { config, owner: owner!, method, revision }, refresh, { fetchImpl, network }, owners));
      refreshes.set(key, started);
      resolveTurn(started);
      await started.done;
    } catch (error) { rejectTurn(error); }
    finally { if (started && refreshes.get(key) === started) refreshes.delete(key); }
  });
  const decided = await turn;
  return typeof decided === "string" ? decided : decided.first;
}
/**
 * One refresh of a connection, as `startSharedRefresh` runs it. Its request is checked before it is sent, never after (a sent refresh is
 * not abandoned: `connector-shared-refresh.ts`). The last check (W5-11 §2.6, N2(a)) comes after the answer and before anything is written:
 * the plugin declaring the service still enabled as the same install, the connection still bound to it, the connection still there at the
 * revision the refresh read. After `settle` and the last `await`, `outcome` says what may be written: everything to the participants still
 * waiting; only the rotated credentials when every participant cancelled; nothing when one lost its authority.
 */
async function renewed(home: string, id: string, read: { config: OAuthConfiguration; owner: OAuthServiceOwner; method: PluginOAuthMethodDeclaration; revision: string },
  refresh: SharedRefreshRun, { fetchImpl, network }: { fetchImpl?: typeof fetch; network?: OAuthNetwork }, owners: OAuthOwners): Promise<string> {
  const { config, method } = read;
  const secrets = connectorProtocolSecrets(home, id);
  const checks = refresh.control;
  const send: typeof fetch = fetchImpl ? async (input, init) => { await checks.beforeEffect(); checks.current(); return fetchImpl(input, init); } : sender(undefined, checks, network);
  const json = await exchange(home, config, method, { refreshToken: secrets.get("oauth")! }, send);
  const next = text(json.access_token);
  if (!next) throw new ApiOAuthError("刷新失败，请重新授权此连接");
  // A refresh sends no context request; it keeps what the token response says again, and what it leaves out stays as it was.
  const kept = declared(() => oauthKept(config.serviceId, method.keep?.map(keep => ({ ...keep, required: false })), json), config.serviceId);
  await refresh.settle();
  if (refresh.outcome() === "discard") throw new ApiOAuthError(LOST_AUTHORITY);
  const owner = await owners(config.serviceId);
  // The last await: from here to the write nothing yields, so the participants are asked once more now (S-95).
  const outcome = refresh.outcome();
  if (outcome === "discard") throw new ApiOAuthError(LOST_AUTHORITY);
  if (!owner || owner.install_id !== read.owner.install_id) throw new ApiOAuthError("声明这个服务的插件在刷新期间已停用或重装，换到的令牌不保存");
  boundMethod(config, owner);
  // A disconnect during the network request must win over a token refresh.
  configured(home, id);
  if (withConnectorConnections(home, store => store.require(id)).updated_at !== read.revision) throw new ApiOAuthError("连接在刷新期间已变化，请重试");
  secrets.put("access", next);
  if (text(json.refresh_token)) secrets.put("oauth", text(json.refresh_token));
  const nextExpiry = oauthExpiry(method, json, Date.now());
  if (nextExpiry) secrets.put("expires", String(nextExpiry)); else secrets.delete("expires");
  if (outcome === "deliver") {
    const saved: OAuthConfiguration = { ...config, context: { ...config.context, ...kept } };
    withConnectorProtocols(home, store => store.save(saved));
  }
  return next;
}
/**
 * The account behind an OAuth connection of the generic flow, read the way its authorization read it (W5-11 §2.2「检查连接和读账号」):
 * the declaration's identity request with the context the connection holds, and no context request. A 401 takes a forced refresh
 * (`token(true)`) and one more read; a second refusal is `refused`.
 */
export async function readApiOAuthAccount(home: string, id: string, control: ConnectorCallControl, token: (refresh: boolean) => Promise<string>,
  options: { fetchImpl?: typeof fetch; owners?: OAuthOwners } = {}): Promise<{ account_id: string; label: string }> {
  const config = configured(home, id);
  const method = boundMethod(config, await (options.owners ?? registryOwners(home))(config.serviceId));
  const settings = settingsOf(config.serviceId, method, config.settings);
  const send = controlledConnectorFetch(sender(options.fetchImpl, control), control);
  const read = async (refresh: boolean) => identityOf(config, method, settings, await token(refresh), send);
  let account: Awaited<ReturnType<typeof read>>;
  try { account = await read(false); } catch (error) {
    if (!(error instanceof ApiOAuthError && error.status === 401)) throw error;
    try { account = await read(true); } catch (again) {
      throw again instanceof ApiOAuthError && (again.status === 401 || again.status === 403)
        ? new ApiOAuthError("服务拒绝了这条连接的令牌，请重新授权", config.serviceId, true, again.status) : again;
    }
  }
  await control.beforeEffect(); control.current();
  return { account_id: account.account_id, label: account.label };
}
