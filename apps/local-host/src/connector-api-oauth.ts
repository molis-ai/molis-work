import { createHash, randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { catalogWhoami, isCatalogConnectorId } from "@molis-ai/molis-work-integration-catalog";
import { withConnectorConnections } from "./connector-connection-store.js";
import { apiOAuthProvider, salesforceOrigin } from "./connector-api-oauth-providers.js";
import { connectorProtocolSecrets, withConnectorProtocols, type ConnectorProtocolConfiguration } from "./connector-protocol-store.js";

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
}
export class ApiOAuthError extends Error {}
type Json = Record<string, unknown>;
function object(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function localOrigin(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new ApiOAuthError("OAuth 必须从本机应用启动");
  return url.origin;
}
async function jsonRequest(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<Json> {
  const response = await fetchImpl(url, { ...init, redirect: "error", signal: AbortSignal.timeout(25_000) });
  const json = object(await response.json());
  if (!response.ok || json.error || json.ok === false || (typeof json.code === "number" && json.code !== 0)) throw new ApiOAuthError(`授权服务拒绝请求（HTTP ${response.status}）；请检查应用配置、回调、权限或重新授权`);
  return json;
}
const queues = new Map<string, Promise<unknown>>();
async function serialized<T>(home: string, id: string, run: () => Promise<T>): Promise<T> {
  const key = `${resolve(home)}:${id}`;
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(run);
  queues.set(key, next);
  try { return await next; } finally { if (queues.get(key) === next) queues.delete(key); }
}
function configured(home: string, id: string): OAuthConfiguration {
  const connection = withConnectorConnections(home, store => store.require(id));
  if (connection.disconnected_at) throw new ApiOAuthError("连接已断开，请重新授权");
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
  origin: string; redirectUri?: string; connectionId?: string;
}) {
  const origin = localOrigin(input.origin);
  const settings = { ...input.settings };
  const provider = apiOAuthProvider(input.serviceId, settings);
  if (!input.clientId.trim() || input.clientId.length > 512 || /[\r\n]/u.test(input.clientId)) throw new ApiOAuthError("请填写有效的 OAuth Client ID");
  if (!provider.optionalSecret && !input.clientSecret?.trim()) throw new ApiOAuthError("请填写此应用的 Client Secret");
  if (!input.displayName.trim() || input.displayName.length > 100) throw new ApiOAuthError("请填写连接名称（最多 100 字）");
  for (const field of provider.fields ?? []) if (field.required && !settings[field.key]?.trim()) throw new ApiOAuthError(`请填写${field.label}`);
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
    displayName: input.displayName.trim(), clientId: input.clientId.trim(), redirectUri, settings,
    context: { auth_method: "oauth", client_id: input.clientId.trim() }, previousRevision };
  const secrets = connectorProtocolSecrets(home, sessionId);
  secrets.put("client", JSON.stringify({ clientSecret: input.clientSecret?.trim() ?? "" }));
  const verifier = randomBytes(32).toString("base64url");
  secrets.put("verifier", verifier);
  const state = withConnectorProtocols(home, store => store.begin(origin, configuration));
  const url = new URL(provider.authorize);
  url.searchParams.set("client_id", configuration.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  if (provider.scope) url.searchParams.set("scope", provider.scope);
  for (const [key, value] of Object.entries(provider.parameters ?? {})) url.searchParams.set(key, value);
  if (provider.pkce) {
    url.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
    url.searchParams.set("code_challenge_method", "S256");
  }
  return { connection_id: connectionId, authorization_url: url.href, redirect_uri: redirectUri, manual_callback: redirectUri !== `${origin}${CALLBACK}` };
}
async function exchange(home: string, config: OAuthConfiguration, input: { code?: string; refreshToken?: string }, fetchImpl: typeof fetch): Promise<Json> {
  const provider = apiOAuthProvider(config.serviceId, config.settings);
  const secrets = connectorProtocolSecrets(home, config.sessionId);
  const clientSecret = text(object(JSON.parse(secrets.get("client") || "{}")).clientSecret);
  const body: Record<string, string> = input.refreshToken
    ? { grant_type: "refresh_token", refresh_token: input.refreshToken }
    : { grant_type: "authorization_code", code: input.code!, redirect_uri: config.redirectUri };
  if (provider.pkce && input.code) body.code_verifier = secrets.get("verifier") || "";
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
export async function apiOAuthIdentity(service: string, token: string, context: Record<string, string>, fetchImpl: typeof fetch = fetch): Promise<string> {
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
      const auth = await jsonRequest(fetchImpl, "https://sentry.io/api/0/auth/", { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
      const user = auth;
      if (!user.id || !identity.account_id) throw new ApiOAuthError("Sentry 未返回用户与组织身份，请检查应用权限");
      context.account_id = `${identity.account_id}:${String(user.id)}`;
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
export async function completeApiOAuth(home: string, input: { origin: string; state?: string; code?: string; returnedUrl?: string; error?: string }, fetchImpl: typeof fetch = fetch) {
  const origin = localOrigin(input.origin);
  const returned = input.returnedUrl ? new URL(input.returnedUrl) : null;
  const state = returned?.searchParams.get("state") || input.state || "";
  const session = withConnectorProtocols(home, store => store.consume<OAuthConfiguration>(state, origin));
  const config = session.configuration;
  if (config.protocol !== "oauth") throw new ApiOAuthError("授权方式不匹配，请重新开始");
  const staged = connectorProtocolSecrets(home, config.sessionId);
  try {
    if (returned && `${returned.origin}${returned.pathname}` !== config.redirectUri) throw new ApiOAuthError("返回地址不匹配本次登记的回调地址");
    if (input.error || returned?.searchParams.get("error")) throw new ApiOAuthError("授权被取消或拒绝，请重新连接");
    const code = returned?.searchParams.get("code") || input.code;
    if (!code || code.length > 4096) throw new ApiOAuthError("缺少有效的授权码");
    return await serialized(home, config.connectionId, async () => {
      const tokens = await exchange(home, config, { code }, fetchImpl);
      const token = text(tokens.access_token);
      if (!token) throw new ApiOAuthError("服务未返回 access_token，请检查应用权限");
      await enrichContext(config, tokens, fetchImpl);
      const label = await apiOAuthIdentity(config.serviceId, token, config.context, fetchImpl);
      if (config.previousRevision) {
        const previous = withConnectorConnections(home, store => store.require(config.connectionId, config.serviceId));
        if (previous.updated_at !== config.previousRevision) throw new ApiOAuthError("此连接在授权期间已变更，请重新开始");
        const previousContext = apiOAuthContext(home, config.connectionId);
        if (!previousContext?.account_id || previousContext.account_id !== config.context.account_id) throw new ApiOAuthError("无法确认这是原账号，请新增连接，保留已有账号绑定");
      }
      const secrets = connectorProtocolSecrets(home, config.connectionId);
      secrets.put("client", staged.get("client") || "{}");
      secrets.put("access", token);
      const refreshToken = text(tokens.refresh_token);
      if (refreshToken) secrets.put("oauth", refreshToken); else secrets.delete("oauth");
      const expires = expiry(tokens, config.serviceId);
      if (expires) secrets.put("expires", String(expires)); else secrets.delete("expires");
      config.sessionId = config.connectionId;
      withConnectorProtocols(home, store => store.save(config));
      const connection = withConnectorConnections(home, store => store.upsertOAuth({ connectionId: config.connectionId, serviceId: config.serviceId,
        displayName: config.displayName, accountLabel: label, accessRef: secrets.reference("access"),
        refreshRef: refreshToken ? secrets.reference("oauth") : null, expiresRef: expires ? secrets.reference("expires") : null, stableAccountValidated: true }));
      return { service_id: config.serviceId, connection: withConnectorConnections(home, store => store.view(connection)) };
    });
  } finally { staged.clear(); }
}
export async function resolveApiOAuthToken(home: string, id: string, forceRefresh = false, fetchImpl: typeof fetch = fetch): Promise<string> {
  return serialized(home, id, async () => {
    const config = configured(home, id);
    const secrets = connectorProtocolSecrets(home, id);
    const token = secrets.get("access");
    const expires = Number(secrets.get("expires"));
    if (token && !forceRefresh && (!expires || expires > Date.now() + 60_000)) return token;
    const refreshToken = secrets.get("oauth");
    if (!refreshToken) throw new ApiOAuthError("访问令牌已失效，请重新授权此连接");
    const json = await exchange(home, config, { refreshToken }, fetchImpl);
    const next = text(json.access_token);
    if (!next) throw new ApiOAuthError("刷新失败，请重新授权此连接");
    await enrichContext(config, json, fetchImpl);
    // A disconnect during the network request must win over a token refresh.
    configured(home, id);
    secrets.put("access", next);
    if (text(json.refresh_token)) secrets.put("oauth", text(json.refresh_token));
    const nextExpiry = expiry(json, config.serviceId);
    if (nextExpiry) secrets.put("expires", String(nextExpiry)); else secrets.delete("expires");
    withConnectorProtocols(home, store => store.save(config));
    return next;
  });
}
