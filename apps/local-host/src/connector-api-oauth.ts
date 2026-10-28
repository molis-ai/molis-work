import type { ConnectorCallControl } from "@molis-ai/molis-work-contracts/services/connector-host";
import { controlledConnectorFetch } from "@molis-ai/molis-work-plugin-sdk";
import { submitConnectorActivation } from "./connector-authorization-commit.js";
import { assertConnectorAuthorizationPending, beginConnectorAuthorization, finishConnectorAuthorization } from "./connector-authorization-status.js";
import { checkConnectorSetupSubmission } from "./connector-setup-submission.js";
import { saveConnectorAuthorizationPresentation } from "./connector-authorization-presentation.js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { catalogWhoami, isCatalogConnectorId } from "@molis-ai/molis-work-integration-catalog";
import { withConnectorConnections } from "./connector-connection-store.js";
import { apiOAuthProvider, salesforceOrigin } from "./connector-api-oauth-providers.js";
import { connectorProductAuth, connectorBrokerOrigin } from "./connector-product-auth.js";
import { connectorProtocolSecrets, withConnectorProtocols, type ConnectorProtocolConfiguration } from "./connector-protocol-store.js";
import { isLoopbackHttpOrigin } from "@molis-ai/molis-work-contracts/platform/loopback";
import { tokenEndpointRefused } from "./connector-refresh-refusals.js";
import { homeIntegrationRegistry } from "./builtin-integrations.js";
import type { OAuthServiceOwner } from "./integration-registry.js";

const CALLBACK = "/api/settings/connectors/methods/oauth/callback";
interface OAuthConfiguration extends ConnectorProtocolConfiguration {
  protocol: "oauth";
  sessionId: string;
  displayName: string;
  clientId: string;
  redirectUri: string;
  settings: Record<string, string>;
  context: Record<string, string>;
  previousRevision?: string;
  brokerOrigin?: string;
  clientSource?: "product" | "custom";
  /** Who declared the method when the authorization started, and what it declared (W5-11 §3.2); dropped once the connection is saved. */
  plugin?: Omit<OAuthServiceOwner, "method">;
  fingerprint?: string;
  /** RFC 9207: the callback must name this issuer when the declaration gives one. */
  issuer?: string;
}
/** Who declares a service's OAuth method now: the Home's integration registry unless a test brings its own. */
export type OAuthOwners = (serviceId: string) => Promise<OAuthServiceOwner | undefined>;
const registryOwners = (home: string): OAuthOwners => async serviceId => (await homeIntegrationRegistry(home)).oauthOwner(serviceId);
/**
 * The method as declared now: the Manifest's `oauth` method and, until it carries the flow as data (W5-11 slice 4), the platform's
 * table entry for it. A broker flow's endpoints are the broker's, so only the Manifest's part counts there.
 */
function methodFingerprint(owner: OAuthServiceOwner, serviceId: string, settings: Record<string, string>, broker: boolean): string {
  return createHash("sha256").update(JSON.stringify([owner.method, broker ? null : apiOAuthProvider(serviceId, settings)])).digest("hex");
}
/** The callback's rules 6 and 7 (W5-11 §3.3): the declaring plugin is still enabled as the same install and publisher, and its method unchanged. */
async function assertStillDeclared(config: OAuthConfiguration, owners: OAuthOwners): Promise<void> {
  const owner = await owners(config.serviceId);
  if (!owner || !config.plugin || owner.plugin_id !== config.plugin.plugin_id || owner.install_id !== config.plugin.install_id || owner.publisher_id !== config.plugin.publisher_id) {
    throw new ApiOAuthError("声明这个服务的插件在授权期间已停用或变更，请重新连接");
  }
  if (methodFingerprint(owner, config.serviceId, config.settings, Boolean(config.brokerOrigin)) !== config.fingerprint) throw new ApiOAuthError("这个服务的授权方式在授权期间已变更，请重新连接");
}
export class ApiOAuthError extends Error {
  /** `refused`: the token endpoint said no (`tokenEndpointRefused`), not a network failure or a 5xx. */
  constructor(message: string, readonly serviceId?: string, readonly refused = false) { super(message); }
}
type Json = Record<string, unknown>;
function object(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function localOrigin(raw: string): string {
  const url = new URL(raw);
  if (!isLoopbackHttpOrigin(url)) throw new ApiOAuthError("OAuth 必须从本机应用启动");
  return url.origin;
}
async function jsonRequest(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<Json> {
  const response = await fetchImpl(url, { ...init, redirect: "error", signal: AbortSignal.any([AbortSignal.timeout(25_000), ...(init.signal ? [init.signal] : [])]) });
  const json = object(await response.json());
  if (!response.ok || json.error || json.ok === false || (typeof json.code === "number" && json.code !== 0)) {
    throw new ApiOAuthError(`授权服务拒绝请求（HTTP ${response.status}）；请检查应用配置、回调、权限或重新授权`, undefined, tokenEndpointRefused(response.status, json.error));
  }
  return json;
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
export function apiOAuthConnectionId(ref?: string): string | undefined {
  return ref ? /^connector-protocol:([0-9a-f-]{36}):access$/u.exec(ref)?.[1] : undefined;
}
export async function startApiOAuth(home: string, input: {
  serviceId: string; displayName: string; clientId: string; clientSecret?: string; settings?: Record<string, string>;
  origin: string; redirectUri?: string; connectionId?: string; setupId?: string;
}, fetchImpl: typeof fetch = fetch, owners: OAuthOwners = registryOwners(home)) {
  const origin = localOrigin(input.origin);
  checkConnectorSetupSubmission(home, input.setupId, { service_id: input.serviceId, method: "oauth", connection_id: input.connectionId });
  const owner = await owners(input.serviceId);
  if (!owner) throw new ApiOAuthError("没有已启用的宿主插件声明这个服务的 OAuth 连接", input.serviceId);
  let brokerOrigin: string | undefined;
  let clientSource: "product" | "custom" = "custom";
  // Reauthorization keeps this account's app settings on the host. Never send a
  // saved client secret back to the browser or borrow another account's client.
  if (input.connectionId && !input.clientId.trim()) {
    const previous = withConnectorProtocols(home, store => store.get<OAuthConfiguration>(input.connectionId!));
    withConnectorConnections(home, store => store.require(input.connectionId!, input.serviceId));
    if (previous?.protocol === "oauth" && previous.serviceId === input.serviceId) {
      const secret = object(JSON.parse(connectorProtocolSecrets(home, input.connectionId).get("client") || "{}"));
      input = { ...input, clientId: previous.clientId, clientSecret: text(secret.clientSecret),
        settings: previous.settings, redirectUri: input.redirectUri || (previous.redirectUri.startsWith("https:") ? previous.redirectUri : undefined) };
      brokerOrigin = previous.brokerOrigin;
      clientSource = previous.clientSource ?? "custom";
      if (!brokerOrigin && !input.clientSecret && clientSource === "product") {
        const product = connectorProductAuth(input.serviceId, "oauth");
        if (!product || product.clientId !== previous.clientId || JSON.stringify(product.settings ?? {}) !== JSON.stringify(previous.settings)) {
          throw new ApiOAuthError("此账号的产品授权配置已变化，请联系支持或添加新连接", input.serviceId);
        }
        input = { ...input, clientSecret: product.clientSecret };
      }
      if (!brokerOrigin && !input.clientSecret && !apiOAuthProvider(input.serviceId, previous.settings).optionalSecret) {
        throw new ApiOAuthError("此自定义应用的密钥已随断开移除，请展开高级设置重新填写原应用凭据", input.serviceId);
      }
    }
  }
  // A custom client never inherits a product secret. Reauthorization above has
  // priority, even when deployment configuration changes between sessions.
  if (!input.connectionId && !input.clientId.trim() && !input.clientSecret?.trim() && !input.redirectUri?.trim()) {
    brokerOrigin = connectorBrokerOrigin(input.serviceId);
    if (brokerOrigin) input = { ...input, clientId: "broker", settings: {} };
    const product = connectorProductAuth(input.serviceId, "oauth");
    if (!brokerOrigin && product) { input = { ...input, ...product }; clientSource = "product"; }
  }
  const settings = { ...input.settings };
  const provider = brokerOrigin ? undefined : apiOAuthProvider(input.serviceId, settings);
  if (!input.clientId.trim() || input.clientId.length > 512 || /[\r\n]/u.test(input.clientId)) throw new ApiOAuthError("请填写有效的 OAuth Client ID");
  if (provider && !provider.optionalSecret && !input.clientSecret?.trim()) throw new ApiOAuthError("请填写此应用的 Client Secret");
  if (!input.displayName.trim() || input.displayName.length > 100) throw new ApiOAuthError("请填写连接名称（最多 100 字）");
  for (const field of provider?.fields ?? []) if (field.required && !settings[field.key]?.trim()) throw new ApiOAuthError(`请填写${field.label}`);
  const redirectUri = input.redirectUri?.trim() || `${origin}${CALLBACK}`;
  const redirect = new URL(redirectUri);
  if (redirect.username || redirect.password || redirect.hash || redirect.search || (redirect.protocol !== "https:" && redirectUri !== `${origin}${CALLBACK}`)) throw new ApiOAuthError("回调地址应为当前本机回调，或你在服务商登记的 HTTPS 地址（无查询参数）");
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
    context: { auth_method: "oauth", client_id: input.clientId.trim() }, previousRevision, ...(brokerOrigin ? { brokerOrigin } : {}),
    plugin: { plugin_id: owner.plugin_id, install_id: owner.install_id, publisher_id: owner.publisher_id },
    fingerprint: methodFingerprint(owner, input.serviceId, settings, Boolean(brokerOrigin)),
    ...(owner.method?.kind === "oauth" && "issuer" in owner.method && owner.method.issuer ? { issuer: owner.method.issuer } : {}) };
  const secrets = connectorProtocolSecrets(home, sessionId);
  secrets.put("client", JSON.stringify({ clientSecret: input.clientSecret?.trim() ?? "" }));
  const verifier = randomBytes(32).toString("base64url");
  secrets.put("verifier", verifier);
  const state = withConnectorProtocols(home, store => store.begin(origin, configuration));
  const authorizationId = beginConnectorAuthorization(home, state, connectionId, input.serviceId, Date.now(), input.setupId);
  if (brokerOrigin) {
    try {
      const result = await jsonRequest(fetchImpl, `${brokerOrigin}/start`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ service_id: input.serviceId, return_uri: redirectUri, state, code_challenge: createHash("sha256").update(verifier).digest("base64url") }) });
      const authorize = new URL(text(result.authorization_url));
      if (authorize.protocol !== "https:" || authorize.username || authorize.password || !text(result.client_id)) throw new ApiOAuthError("产品授权服务返回无效配置");
      configuration.clientId = text(result.client_id);
      configuration.context.client_id = configuration.clientId;
      configuration.settings = Object.fromEntries(Object.entries(object(result.settings)).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
      apiOAuthProvider(input.serviceId, configuration.settings);
      withConnectorProtocols(home, store => store.update(state, configuration));
      saveConnectorAuthorizationPresentation(home, authorizationId, { authorization_url: authorize.href });
      return { authorization_id: authorizationId, connection_id: connectionId, authorization_url: authorize.href, redirect_uri: redirectUri, manual_callback: false };
    } catch (error) { finishConnectorAuthorization(home, state, "failed"); withConnectorProtocols(home, store => store.discard(state)); secrets.clear(); throw error; }
  }
  const url = new URL(provider!.authorize);
  url.searchParams.set("client_id", configuration.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  if (provider!.scope) url.searchParams.set("scope", provider!.scope);
  for (const [key, value] of Object.entries(provider!.parameters ?? {})) url.searchParams.set(key, value);
  if (provider!.pkce) {
    url.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
    url.searchParams.set("code_challenge_method", "S256");
  }
  saveConnectorAuthorizationPresentation(home, authorizationId, { authorization_url: url.href });
  return { authorization_id: authorizationId, connection_id: connectionId, authorization_url: url.href, redirect_uri: redirectUri, manual_callback: redirectUri !== `${origin}${CALLBACK}` };
}
async function exchange(home: string, config: OAuthConfiguration, input: { code?: string; refreshToken?: string }, fetchImpl: typeof fetch): Promise<Json> {
  if (config.brokerOrigin) {
    return jsonRequest(fetchImpl, `${config.brokerOrigin}/token`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ service_id: config.serviceId, ...(input.refreshToken ? { grant_type: "refresh_token", refresh_token: input.refreshToken }
        : { grant_type: "authorization_code", code: input.code, code_verifier: connectorProtocolSecrets(home, config.sessionId).get("verifier") }) }) });
  }
  const provider = apiOAuthProvider(config.serviceId, config.settings);
  const secrets = connectorProtocolSecrets(home, config.sessionId);
  const clientSecret = text(object(JSON.parse(secrets.get("client") || "{}")).clientSecret);
  const body: Record<string, string> = input.refreshToken
    ? { grant_type: "refresh_token", refresh_token: input.refreshToken }
    : { grant_type: "authorization_code", code: input.code!, redirect_uri: config.redirectUri };
  if (provider.pkce && input.code) body.code_verifier = secrets.get("verifier") || "";
  if (config.serviceId === "gitlab" && input.refreshToken) body.redirect_uri = config.redirectUri;
  const headers: Record<string, string> = { accept: "application/json" };
  if (provider.auth === "basic" && clientSecret) headers.authorization = `Basic ${Buffer.from(`${config.clientId}:${clientSecret}`).toString("base64")}`;
  else {
    body.client_id = config.clientId;
    if (clientSecret) body.client_secret = clientSecret;
  }
  if (config.serviceId === "clickup") { delete body.grant_type; delete body.redirect_uri; }
  headers["content-type"] = provider.format === "json" ? "application/json" : "application/x-www-form-urlencoded";
  return jsonRequest(fetchImpl, input.refreshToken && provider.refresh ? provider.refresh : provider.token, {
    method: "POST", headers, body: provider.format === "json" ? JSON.stringify(body) : new URLSearchParams(body).toString(),
  });
}
function expiry(json: Json, service: string): number | null {
  const seconds = Number(json.expires_in);
  if (Number.isFinite(seconds) && seconds > 0) return Date.now() + seconds * 1000;
  if (service === "monday") {
    try { const exp = Number(JSON.parse(Buffer.from(text(json.access_token).split(".")[1]!, "base64url").toString()).exp); if (exp > 0) return exp * 1000; } catch { /* JWT expiry is only a refresh scheduling hint. */ }
  }
  return null;
}
async function enrichContext(config: OAuthConfiguration, json: Json, fetchImpl: typeof fetch): Promise<void> {
  const accessToken = text(json.access_token);
  if (text(json.workspace_id)) config.context.workspace_id = text(json.workspace_id);
  // Sentry returns the authorizing user with the token, not from /api/0/auth/.
  if (config.serviceId === "sentry" && text(object(json.user).id)) config.context.oauth_user_id = text(object(json.user).id);
  if (config.serviceId === "salesforce") config.context.instance = salesforceOrigin(text(json.instance_url) || config.context.instance || "");
  if (config.serviceId === "vercel" && text(json.team_id)) config.context.team_id = text(json.team_id);
  if (["clickup", "supabase"].includes(config.serviceId) && !config.context.authorized_workspaces) {
    const url = config.serviceId === "clickup" ? "https://api.clickup.com/api/v2/team" : "https://api.supabase.com/v1/organizations";
    const response = await fetchImpl(url, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(25_000) });
    if (!response.ok) throw new ApiOAuthError("无法读取已授权工作区，请检查应用权限");
    const body: unknown = await response.json();
    const rows: unknown = config.serviceId === "clickup" ? object(body).teams : body;
    if (!Array.isArray(rows)) throw new ApiOAuthError("服务未返回已授权工作区");
    config.context.authorized_workspaces = rows.map(row => object(row).id).filter(id => typeof id === "string" || typeof id === "number").map(String).sort().join(",");
  }
  if (["jira", "confluence"].includes(config.serviceId) && !config.context.cloud_id) {
    const response = await fetchImpl("https://api.atlassian.com/oauth/token/accessible-resources", { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(25_000) });
    if (!response.ok) throw new ApiOAuthError("无法读取 Atlassian 站点授权");
    const resources: unknown = await response.json();
    const site = new URL(config.settings.site_url!).origin;
    const match = Array.isArray(resources) ? resources.map(object).find(row => text(row.url).replace(/\/$/u, "") === site) : undefined;
    if (!match || !/^[0-9a-f-]{36}$/iu.test(text(match.id))) throw new ApiOAuthError("所填 Atlassian 站点未在本次授权范围内");
    config.context.cloud_id = text(match.id);
    config.context.base = `https://api.atlassian.com/ex/${config.serviceId}/${config.context.cloud_id}`;
    config.context.site_url = site;
  }
}
async function apiOAuthIdentity(service: string, token: string, context: Record<string, string>, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (["gmail", "google-calendar", "google-drive"].includes(service)) {
    const profile = await jsonRequest(fetchImpl, "https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
    if (!text(profile.sub)) throw new ApiOAuthError("Google 未返回稳定账号身份，请重新授权");
    context.account_id = text(profile.sub);
    return text(profile.email) || text(profile.name) || text(profile.sub);
  }
  if (isCatalogConnectorId(service)) {
    const identity = await catalogWhoami({ connectorId: service, token, authExtras: context, fetchImpl });
    if (!identity.ok) throw new ApiOAuthError(identity.message);
    if (service === "sentry") {
      if (!context.oauth_user_id || !identity.account_id) throw new ApiOAuthError("Sentry 未返回用户与组织身份，请检查应用权限");
      context.account_id = `${identity.account_id}:${context.oauth_user_id}`;
    } else if (identity.account_id) context.account_id = identity.account_id;
    if (context.authorized_workspaces !== undefined) context.account_id += `:workspaces:${context.authorized_workspaces}`;
    if (!context.account_id) throw new ApiOAuthError("服务未返回稳定账号身份，请检查应用权限后重新授权");
    return identity.login;
  }
  const url = service === "gmail" ? "https://gmail.googleapis.com/gmail/v1/users/me/profile" : "https://api.github.com/user";
  const result = await jsonRequest(fetchImpl, url, { headers: { authorization: `Bearer ${token}`, accept: "application/json", "user-agent": "Molis-Work" } });
  const label = text(result.emailAddress) || text(result.login);
  if (!label) throw new ApiOAuthError("授权成功但未取得账号身份");
  context.account_id = typeof result.id === "number" ? String(result.id) : text(result.id) || label;
  return label;
}
/**
 * The callback, judged in the order of W5-11 §3.3. The Host comes first (`localOrigin`), with the store untouched; then the record is
 * taken by its state, and from there every refusal ends it. Rules 1–7 refuse before any request,
 * rules 8 and 9 after the token request, and what those exchanged is never staged or committed. A refusal writes only what §3.4
 * allows: the taken record, the authorization's failed or cancelled status and the cleared stage.
 */
export async function completeApiOAuth(home: string, input: { origin: string; state?: string; code?: string; returnedUrl?: string; error?: string; iss?: string; callback?: string },
  fetchImpl: typeof fetch = fetch, owners: OAuthOwners = registryOwners(home)) {
  const origin = localOrigin(input.origin);
  const returned = input.returnedUrl ? new URL(input.returnedUrl) : null;
  const state = returned?.searchParams.get("state") || input.state || "";
  const error = input.error || returned?.searchParams.get("error") || undefined;
  const ended = () => finishConnectorAuthorization(home, state, error === "access_denied" ? "cancelled" : "failed");
  // Rule 1: a state that is malformed, unknown, used or expired; an expired record is taken all the same. A used state ends nothing:
  // the callback that took it may still be exchanging its code.
  const session = withConnectorProtocols(home, store => store.take<OAuthConfiguration>(state));
  const config = session.configuration;
  const staged = config.protocol === "oauth" ? connectorProtocolSecrets(home, config.sessionId) : null;
  try {
    if (config.protocol !== "oauth") throw new ApiOAuthError("授权方式不匹配，请重新开始");
    // Rule 2: the local origin the authorization started from.
    if (session.origin !== origin) throw new ApiOAuthError("回调来自另一个本机地址，请从发起授权的页面重新连接");
    // Rule 3: the address the service came back to is the one registered for this authorization.
    const callback = returned ? `${returned.origin}${returned.pathname}` : input.callback ?? `${origin}${CALLBACK}`;
    if (callback !== config.redirectUri) throw new ApiOAuthError("返回地址不匹配本次登记的回调地址");
    // Rule 4: the service said no, or gave no code.
    if (error) throw new ApiOAuthError("授权被取消或拒绝，请重新连接");
    const code = returned?.searchParams.get("code") || input.code;
    if (!code || code.length > (config.brokerOrigin ? 16000 : 4096)) throw new ApiOAuthError("缺少有效的授权码");
    // Rule 5 (RFC 9207): a declared issuer must come back named.
    if (config.issuer && (returned?.searchParams.get("iss") ?? input.iss) !== config.issuer) throw new ApiOAuthError("授权服务的签发方不符，请重新连接");
    // Rules 6 and 7: the declaring plugin and its method, as they were when the authorization started.
    await assertStillDeclared(config, owners);
    return await serialized(home, config.connectionId, async () => {
      assertConnectorAuthorizationPending(home, state);
      const tokens = await exchange(home, config, { code }, fetchImpl);
      const token = text(tokens.access_token);
      if (!token) throw new ApiOAuthError("服务未返回 access_token，请检查应用权限");
      await enrichContext(config, tokens, fetchImpl);
      const label = await apiOAuthIdentity(config.serviceId, token, config.context, fetchImpl);
      // Rule 9: cancelled or revoked while waiting, or rules 6 and 7 no longer hold.
      await assertStillDeclared(config, owners);
      assertConnectorAuthorizationPending(home, state);
      // Rule 8: a reauthorization lands on the revision and the account it started from.
      if (config.previousRevision) {
        const previous = withConnectorConnections(home, store => store.require(config.connectionId, config.serviceId));
        if (previous.updated_at !== config.previousRevision) throw new ApiOAuthError("此连接在授权期间已变更，请重新开始");
        const previousContext = apiOAuthContext(home, config.connectionId);
        if (!previousContext?.account_id || previousContext.account_id !== config.context.account_id) throw new ApiOAuthError("无法确认这是原账号，请新增连接，保留已有账号绑定");
      }
      const secrets = connectorProtocolSecrets(home, config.connectionId);
      const refreshToken = text(tokens.refresh_token), expires = expiry(tokens, config.serviceId);
      const credentials = { [secrets.reference("client")]: staged!.get("client") || "{}", [secrets.reference("access")]: token,
        [secrets.reference("oauth")]: refreshToken || null, [secrets.reference("expires")]: expires ? String(expires) : null };
      const saved = { ...config, sessionId: config.connectionId };
      delete saved.previousRevision; delete saved.plugin; delete saved.fingerprint; delete saved.issuer;
      const result = submitConnectorActivation(home, state, { kind: "oauth", target: { connectionId: config.connectionId, expectedRevision: config.previousRevision },
        credentials, protocol: saved, input: { connectionId: config.connectionId, serviceId: config.serviceId,
          displayName: config.displayName, accountLabel: label, accessRef: secrets.reference("access"),
          refreshRef: refreshToken ? secrets.reference("oauth") : null, expiresRef: expires ? secrets.reference("expires") : null, stableAccountValidated: true } });
      return { service_id: config.serviceId, ...result };
    });
  } catch (refused) {
    ended();
    throw new ApiOAuthError(refused instanceof ApiOAuthError ? refused.message : "授权未完成，请检查应用配置与权限后重试", config.serviceId);
  } finally { staged?.clear(); }
}
export async function resolveApiOAuthToken(home: string, id: string, control: ConnectorCallControl, forceRefresh = false, fetchImpl: typeof fetch = fetch): Promise<string> {
  return serialized(home, id, async () => {
    await control.beforeEffect(); control.current();
    const request = controlledConnectorFetch(fetchImpl, control);
    const config = configured(home, id);
    const revision = withConnectorConnections(home, store => store.require(id)).updated_at;
    const secrets = connectorProtocolSecrets(home, id);
    const token = secrets.get("access");
    const expires = Number(secrets.get("expires"));
    if (token && !forceRefresh && (!expires || expires > Date.now() + 60_000)) return token;
    const refreshToken = secrets.get("oauth");
    if (!refreshToken) throw new ApiOAuthError("访问令牌已失效，请重新授权此连接");
    const json = await exchange(home, config, { refreshToken }, request);
    const next = text(json.access_token);
    if (!next) throw new ApiOAuthError("刷新失败，请重新授权此连接");
    await enrichContext(config, json, request);
    await control.beforeEffect(); control.current();
    // A disconnect during the network request must win over a token refresh.
    configured(home, id);
    if (withConnectorConnections(home, store => store.require(id)).updated_at !== revision) throw new ApiOAuthError("连接在刷新期间已变化，请重试");
    secrets.put("access", next);
    if (text(json.refresh_token)) secrets.put("oauth", text(json.refresh_token));
    const nextExpiry = expiry(json, config.serviceId);
    if (nextExpiry) secrets.put("expires", String(nextExpiry)); else secrets.delete("expires");
    withConnectorProtocols(home, store => store.save(config));
    return next;
  });
}
