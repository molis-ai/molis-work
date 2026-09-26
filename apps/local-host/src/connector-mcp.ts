import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { withConnectorRequest } from "./connector-lifecycle.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { auth, UnauthorizedError, type OAuthClientProvider, type OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { OAuthClientInformationMixed, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { connectorProtocolSecrets, withConnectorProtocols, type ConnectorProtocolConfiguration } from "./connector-protocol-store.js";

export interface McpServerConfiguration {
  endpoint: string;
  auth?: "oauth" | "bearer" | "either" | "none";
  registration?: "manual";
  tokenScheme?: "Sentry-Bearer";
  endpointPattern?: RegExp;
  stdio?: boolean;
}
/** Server-owned allowlist. A submitted URL cannot move a credential to another resource. */
export const MCP_SERVERS: Readonly<Record<string, McpServerConfiguration>> = {
  gmail: { endpoint: "https://gmailmcp.googleapis.com/mcp/v1", auth: "either", registration: "manual" },
  "google-drive": { endpoint: "https://drivemcp.googleapis.com/mcp/v1", auth: "either", registration: "manual" },
  "google-calendar": { endpoint: "https://calendarmcp.googleapis.com/mcp/v1", auth: "either", registration: "manual" },
  outlook: { endpoint: "https://agent365.svc.cloud.microsoft/agents/tenants/{tenantId}/servers/mcp_MailTools", auth: "either", registration: "manual", endpointPattern: /^https:\/\/agent365\.svc\.cloud\.microsoft\/agents\/tenants\/[0-9a-f-]{36}\/servers\/mcp_MailTools$/iu },
  onedrive: { endpoint: "https://agent365.svc.cloud.microsoft/agents/tenants/{tenantId}/servers/mcp_OneDriveRemoteServer", auth: "either", registration: "manual", endpointPattern: /^https:\/\/agent365\.svc\.cloud\.microsoft\/agents\/tenants\/[0-9a-f-]{36}\/servers\/mcp_OneDriveRemoteServer$/iu },
  sharepoint: { endpoint: "https://agent365.svc.cloud.microsoft/agents/tenants/{tenantId}/servers/mcp_SharePointRemoteServer", auth: "either", registration: "manual", endpointPattern: /^https:\/\/agent365\.svc\.cloud\.microsoft\/agents\/tenants\/[0-9a-f-]{36}\/servers\/mcp_SharePointRemoteServer$/iu },
  teams: { endpoint: "https://agent365.svc.cloud.microsoft/agents/tenants/{tenantId}/servers/mcp_TeamsServer", auth: "either", registration: "manual", endpointPattern: /^https:\/\/agent365\.svc\.cloud\.microsoft\/agents\/tenants\/[0-9a-f-]{36}\/servers\/mcp_TeamsServer$/iu },
  salesforce: { endpoint: "https://api.salesforce.com/platform/mcp/v1/{serverName}", auth: "either", registration: "manual", endpointPattern: /^https:\/\/api\.salesforce\.com\/platform\/mcp\/v1\/(?:sandbox\/)?[A-Za-z0-9_-]+$/u },
  canva: { endpoint: "https://mcp.canva.com/mcp", auth: "oauth", registration: "manual" },
  feishu: { endpoint: "https://open.feishu.cn/", stdio: true },
  lark: { endpoint: "https://open.larksuite.com/", stdio: true },
  notion: { endpoint: "https://mcp.notion.com/mcp", auth: "oauth" },
  github: { endpoint: "https://api.githubcopilot.com/mcp/", auth: "either", registration: "manual" },
  dropbox: { endpoint: "https://mcp.dropbox.com/mcp", auth: "oauth" },
  box: { endpoint: "https://mcp.box.com", auth: "oauth" },
  slack: { endpoint: "https://mcp.slack.com/mcp", auth: "oauth", registration: "manual" },
  gitlab: { endpoint: "https://gitlab.com/api/v4/mcp", auth: "oauth" },
  vercel: { endpoint: "https://mcp.vercel.com", auth: "oauth" },
  cloudflare: { endpoint: "https://mcp.cloudflare.com/mcp", auth: "either" },
  huggingface: { endpoint: "https://huggingface.co/mcp", auth: "either" },
  sentry: { endpoint: "https://mcp.sentry.dev/mcp", auth: "either", tokenScheme: "Sentry-Bearer" },
  supabase: { endpoint: "https://mcp.supabase.com/mcp?read_only=true", auth: "either" },
  linear: { endpoint: "https://mcp.linear.app/mcp/readonly", auth: "either" },
  asana: { endpoint: "https://mcp.asana.com/v2/mcp", auth: "oauth", registration: "manual" },
  clickup: { endpoint: "https://mcp.clickup.com/mcp", auth: "oauth" },
  monday: { endpoint: "https://mcp.monday.com/mcp", auth: "either" },
  airtable: { endpoint: "https://mcp.airtable.com/mcp", auth: "either" },
  figma: { endpoint: "http://127.0.0.1:3845/mcp", auth: "none", endpointPattern: /^(?:http:\/\/127\.0\.0\.1:3845\/mcp|https:\/\/mcp\.figma\.com\/mcp)$/u },
  jira: { endpoint: "https://mcp.atlassian.com/v2/mcp", auth: "oauth" },
  confluence: { endpoint: "https://mcp.atlassian.com/v2/mcp", auth: "oauth" },
  bitbucket: { endpoint: "https://mcp.atlassian.com/v2/mcp", auth: "oauth" },
  loom: { endpoint: "https://mcp.atlassian.com/v2/mcp", auth: "oauth" },
  stripe: { endpoint: "https://mcp.stripe.com", auth: "either" },
  intercom: { endpoint: "https://mcp.intercom.com/mcp", auth: "either" },
  hubspot: { endpoint: "https://mcp.hubspot.com", auth: "oauth", registration: "manual" },
  zoom: { endpoint: "https://zoom.us/mcp/meeting/streamable", auth: "oauth" },
  x: { endpoint: "https://api.x.com/mcp", auth: "either" },
};

const CALLBACK = "/api/settings/connectors/methods/mcp/callback";
const REQUEST_TIMEOUT = 30_000;
interface McpConfiguration extends ConnectorProtocolConfiguration {
  protocol: "mcp";
  endpoint: string;
  displayName: string;
  redirectUri: string;
  sessionId: string;
  mode: "oauth" | "bearer" | "none";
  transport: "http" | "sse";
  discovery?: OAuthDiscoveryState;
  previousRevision?: string;
  previousDisconnectedAt?: string | null;
}
export class McpConnectionError extends Error {
  constructor(readonly code: "configuration" | "authorization" | "disconnected" | "provider", message: string) { super(message); }
}
export interface StartMcpConnectionInput {
  serviceId: string; displayName: string; endpoint?: string; clientId?: string; clientSecret?: string;
  token?: string; origin: string; connectionId?: string; redirectUri?: string;
}
type Tools = Awaited<ReturnType<Client["listTools"]>>["tools"];
type Resources = Awaited<ReturnType<Client["listResources"]>>["resources"];
type McpInspection = { tools: Tools; resources: Resources };

function callbackOrigin(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new McpConnectionError("configuration", "本机回调地址无效"); }
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new McpConnectionError("configuration", "授权回调必须使用本机 HTTP 地址");
  }
  return url.origin;
}
function safeError(error: unknown): McpConnectionError {
  if (error instanceof McpConnectionError) return error;
  if (error instanceof UnauthorizedError) return new McpConnectionError("authorization", "MCP 需要重新授权，请检查账号权限或 OAuth 应用配置");
  return new McpConnectionError("provider", "MCP 连接失败，请检查服务地址、账号权限和 OAuth 应用配置后重试");
}

/** Test-only endpoint injection keeps production HTTP input behind the official allowlist. */
export function createConnectorMcpHost(options: { testServers?: Readonly<Record<string, McpServerConfiguration>>; now?: () => number } = {}) {
  if (options.testServers && process.env.NODE_ENV !== "test") throw new Error("MCP test endpoints require NODE_ENV=test");
  const servers = options.testServers ?? MCP_SERVERS;
  const now = options.now ?? Date.now;
  const queues = new Map<string, Promise<unknown>>();
  const serialized = async <T>(home: string, id: string, operation: () => Promise<T>): Promise<T> => {
    const key = `${resolve(home)}:${id}`;
    const previous = queues.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    queues.set(key, next);
    try { return await next; } catch (error) { throw safeError(error); }
    finally { if (queues.get(key) === next) queues.delete(key); }
  };
  function endpointFor(serviceId: string, requested?: string): string {
    const server = servers[serviceId];
    if (!server) throw new McpConnectionError("configuration", "这个服务尚未配置官方 MCP 地址");
    const expected = new URL(server.endpoint);
    const endpoint = new URL(requested || server.endpoint);
    if ((server.endpointPattern ? !server.endpointPattern.test(endpoint.href) : endpoint.href !== expected.href) || endpoint.username || endpoint.password || endpoint.hash) throw new McpConnectionError("configuration", "MCP 地址必须匹配所选服务的官方地址；租户 ID 和 server name 需替换成实际值");
    const local = endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
    if (endpoint.protocol !== "https:" && !(local && (options.testServers || serviceId === "figma"))) throw new McpConnectionError("configuration", "远程 MCP 必须使用 HTTPS");
    return endpoint.href;
  }
  function active(home: string, id: string): McpConfiguration {
    const connection = withConnectorConnections(home, store => store.require(id));
    if (connection.auth_method !== "mcp" || connection.disconnected_at) throw new McpConnectionError("disconnected", "MCP 连接已断开，请重新连接");
    const config = withConnectorProtocols(home, store => store.get<McpConfiguration>(id));
    if (!config || config.protocol !== "mcp" || config.serviceId !== connection.service_id) throw new McpConnectionError("configuration", "MCP 连接配置缺失，请重新连接");
    endpointFor(config.serviceId, config.endpoint);
    return config;
  }
  function guardedFetch(config: McpConfiguration, checkActive?: () => void, signal?: AbortSignal): typeof fetch {
    return async (input, init) => {
      checkActive?.();
      const url = new URL(input instanceof Request ? input.url : String(input));
      const configured = new URL(config.endpoint);
      const permittedLocal = url.origin === configured.origin && (options.testServers || config.serviceId === "figma");
      if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && permittedLocal))) throw new McpConnectionError("configuration", "MCP 授权服务返回了不安全的地址");
      const response = await fetch(input, { ...init, redirect: "error", signal: AbortSignal.any([AbortSignal.timeout(REQUEST_TIMEOUT), ...(init?.signal ? [init.signal] : []), ...(signal ? [signal] : [])]) });
      return response;
    };
  }
  function provider(home: string, config: McpConfiguration, state?: string, signal?: AbortSignal) {
    const secrets = connectorProtocolSecrets(home, config.sessionId);
    const checkActive = config.sessionId === config.connectionId ? () => { active(home, config.connectionId); } : undefined;
    let authorizationUrl: string | undefined;
    const saveConfig = () => {
      if (state) withConnectorProtocols(home, store => store.update(state, config));
      else if (config.sessionId === config.connectionId) { checkActive?.(); withConnectorProtocols(home, store => store.save(config)); }
    };
    const oauth: OAuthClientProvider = {
      redirectUrl: config.redirectUri,
      get clientMetadata() {
        const client = oauth.clientInformation() as OAuthClientInformationMixed | undefined;
        return { client_name: "Molis Work", redirect_uris: [config.redirectUri], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: client?.client_secret ? "client_secret_post" : "none" };
      },
      state: () => { if (!state) throw new McpConnectionError("authorization", "MCP 授权已失效，请重新连接"); return state; },
      clientInformation: () => { const raw = secrets.get("client"); return raw ? JSON.parse(raw) as OAuthClientInformationMixed : undefined; },
      saveClientInformation: client => { checkActive?.(); secrets.put("client", JSON.stringify(client)); },
      tokens: () => { checkActive?.(); const raw = secrets.get("oauth"); return raw ? JSON.parse(raw) as OAuthTokens : undefined; },
      saveTokens: tokens => {
        checkActive?.();
        secrets.put("oauth", JSON.stringify(tokens));
        secrets.put("access", tokens.access_token);
        if (tokens.expires_in !== undefined) secrets.put("expires", String(now() + tokens.expires_in * 1000));
        else secrets.delete("expires");
      },
      saveCodeVerifier: verifier => { if (!state) throw new McpConnectionError("authorization", "MCP 需要重新授权"); secrets.put("verifier", verifier); },
      codeVerifier: () => { const verifier = secrets.get("verifier"); if (!verifier) throw new McpConnectionError("authorization", "授权校验信息缺失，请重新连接"); return verifier; },
      redirectToAuthorization: url => {
        if (!state) throw new McpConnectionError("authorization", "MCP 需要重新授权");
        const localTest = options.testServers && url.origin === new URL(config.endpoint).origin;
        if (url.username || url.password || (url.protocol !== "https:" && !localTest)) throw new McpConnectionError("authorization", "MCP 返回的授权地址无效");
        authorizationUrl = url.href;
      },
      discoveryState: () => config.discovery,
      saveDiscoveryState: discovery => { config.discovery = discovery; saveConfig(); },
      invalidateCredentials: scope => {
        checkActive?.();
        if (scope === "all" || scope === "tokens") for (const name of ["oauth", "access", "expires"]) secrets.delete(name);
        if (scope === "all" || scope === "client") secrets.delete("client");
        if (scope === "all" || scope === "verifier") secrets.delete("verifier");
        if (scope === "all" || scope === "discovery") { delete config.discovery; saveConfig(); }
      },
    };
    return { oauth, secrets, checkActive, authorizationUrl: () => authorizationUrl, fetch: guardedFetch(config, checkActive, signal) };
  }
  async function useClient<T>(home: string, config: McpConfiguration, run: (client: Client) => Promise<T>, state?: string, signal?: AbortSignal): Promise<{ result?: T; authorizationUrl?: string }> {
    const session = provider(home, config, state, signal);
    signal?.throwIfAborted();
    if (servers[config.serviceId]?.stdio) {
      const info = session.oauth.clientInformation() as OAuthClientInformationMixed | undefined;
      if (!info?.client_id || !info.client_secret) throw new McpConnectionError("configuration", "飞书 / Lark MCP 需要 App ID 与 App Secret");
      const token = session.secrets.get("access");
      const environment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
      const transport = new StdioClientTransport({ command: "npx", args: ["-y", "@larksuiteoapi/lark-mcp", "mcp"], stderr: "pipe",
        env: { ...environment, APP_ID: info.client_id, APP_SECRET: info.client_secret, LARK_DOMAIN: new URL(config.endpoint).origin,
          LARK_TOKEN_MODE: token ? "user_access_token" : "tenant_access_token", ...(token ? { USER_ACCESS_TOKEN: token } : {}) } });
      const client = new Client({ name: "molis-work", version: "0.2.0" }, { capabilities: {} });
      const abort = () => { void client.close().catch(() => {}); };
      signal?.addEventListener("abort", abort, { once: true });
      try { await client.connect(transport, { timeout: 60_000, signal }); session.checkActive?.(); const result = await run(client); session.checkActive?.(); signal?.throwIfAborted(); return { result }; }
      finally { signal?.removeEventListener("abort", abort); await client.close().catch(() => {}); }
    }
    const expires = Number(session.secrets.get("expires"));
    if (config.mode === "oauth" && expires > 0 && expires <= now() + 30_000) {
      await auth(session.oauth, { serverUrl: config.endpoint, fetchFn: session.fetch });
      if (session.authorizationUrl()) return { authorizationUrl: session.authorizationUrl() };
    }
    const token = config.mode === "bearer" ? session.secrets.get("access") : null;
    if (config.mode === "bearer" && !token) throw new McpConnectionError("authorization", "MCP 令牌缺失，请重新连接");
    const headers = token ? { Authorization: `${servers[config.serviceId]?.tokenScheme ?? "Bearer"} ${token}` } : undefined;
    const transportOptions = { authProvider: config.mode === "oauth" ? session.oauth : undefined, requestInit: headers ? { headers } : undefined, fetch: session.fetch };
    const connect = async (kind: "http" | "sse") => {
      const client = new Client({ name: "molis-work", version: "0.2.0" }, { capabilities: {} });
      const transport = kind === "http" ? new StreamableHTTPClientTransport(new URL(config.endpoint), transportOptions) : new SSEClientTransport(new URL(config.endpoint), transportOptions);
      const abort = () => { void client.close().catch(() => {}); };
      signal?.addEventListener("abort", abort, { once: true });
      try {
        await client.connect(transport, { timeout: REQUEST_TIMEOUT, signal });
        session.checkActive?.();
        config.transport = kind;
        const result = await run(client);
        session.checkActive?.(); signal?.throwIfAborted();
        return { result };
      } finally { signal?.removeEventListener("abort", abort); await client.close().catch(() => {}); }
    };
    try { return await connect(config.transport); }
    catch (error) {
      if (session.authorizationUrl()) return { authorizationUrl: session.authorizationUrl() };
      if (config.transport === "http" && error instanceof StreamableHTTPError && [404, 405].includes(error.code ?? 0)) {
        try { return await connect("sse"); }
        catch (fallbackError) { if (session.authorizationUrl()) return { authorizationUrl: session.authorizationUrl() }; throw fallbackError; }
      }
      throw error;
    }
  }
  async function inspect(client: Client, signal?: AbortSignal): Promise<McpInspection> {
    const capabilities = client.getServerCapabilities();
    const tools: Tools = [];
    const resources: Resources = [];
    if (capabilities?.tools) {
      let cursor: string | undefined;
      const seen = new Set<string>();
      do { const page = await client.listTools(cursor ? { cursor } : undefined, { timeout: REQUEST_TIMEOUT, signal }); tools.push(...page.tools); cursor = page.nextCursor; if (cursor && seen.has(cursor)) throw new McpConnectionError("provider", "MCP 工具分页重复"); if (cursor) seen.add(cursor); } while (cursor);
    }
    if (capabilities?.resources) {
      let cursor: string | undefined;
      const seen = new Set<string>();
      do { const page = await client.listResources(cursor ? { cursor } : undefined, { timeout: REQUEST_TIMEOUT, signal }); resources.push(...page.resources); cursor = page.nextCursor; if (cursor && seen.has(cursor)) throw new McpConnectionError("provider", "MCP 资源分页重复"); if (cursor) seen.add(cursor); } while (cursor);
    }
    return { tools, resources };
  }
  function commit(home: string, config: McpConfiguration): void {
    const previous = withConnectorConnections(home, store => store.get(config.connectionId));
    if (previous && (previous.updated_at !== config.previousRevision || previous.disconnected_at !== config.previousDisconnectedAt)) throw new McpConnectionError("configuration", "连接已改变，请重新开始授权");
    const staged = connectorProtocolSecrets(home, config.sessionId);
    const final = connectorProtocolSecrets(home, config.connectionId);
    for (const name of ["oauth", "access", "expires", "client"]) {
      const value = staged.get(name);
      if (value) final.put(name, value); else final.delete(name);
    }
    const saved = { ...config, sessionId: config.connectionId };
    delete saved.previousRevision;
    delete saved.previousDisconnectedAt;
    withConnectorProtocols(home, store => store.save(saved));
    withConnectorConnections(home, store => store.saveProtocol({ connectionId: config.connectionId, serviceId: config.serviceId, displayName: config.displayName,
      endpoint: config.endpoint, credentialRef: config.mode === "none" ? null : final.reference("access"),
      refreshRef: config.mode === "oauth" ? final.reference("oauth") : null, expiresRef: config.mode === "oauth" ? final.reference("expires") : null }));
    staged.clear();
  }
  const startMcpConnection = async (home: string, input: StartMcpConnectionInput) => serialized(home, input.connectionId ?? "new", async () => {
    const endpoint = endpointFor(input.serviceId, input.endpoint);
    const base = servers[input.serviceId]!;
    const server = input.serviceId === "figma" && endpoint.startsWith("https:") ? { ...base, auth: "oauth" as const, registration: "manual" as const } : base;
    const origin = callbackOrigin(input.origin);
    const redirectUri = input.redirectUri?.trim() || origin + CALLBACK;
    const redirect = new URL(redirectUri);
    if (redirect.username || redirect.password || redirect.search || redirect.hash || (redirect.protocol !== "https:" && redirectUri !== origin + CALLBACK)) throw new McpConnectionError("configuration", "请使用当前本机回调或已登记的 HTTPS 回调地址");
    const displayName = input.displayName?.trim();
    if (!displayName || displayName.length > 100) throw new McpConnectionError("configuration", "连接名称不能为空且最多 100 个字符");
    const token = input.token?.trim();
    if (token && (token.length < 8 || token.length > 16_384 || /[\r\n]/u.test(token))) throw new McpConnectionError("configuration", "MCP 令牌格式无效");
    if (token && (server.auth === "oauth" || server.auth === "none")) throw new McpConnectionError("configuration", "此 MCP 服务不支持粘贴令牌，请使用其官方授权方式");
    const mode = server.stdio ? (token ? "bearer" : "none") : server.auth === "none" ? "none" : token ? "bearer" : "oauth";
    if (mode === "oauth" && server.registration === "manual" && !input.clientId?.trim()) throw new McpConnectionError("configuration", "此 MCP 服务需要预先注册的 OAuth Client ID；请先配置官方应用");
    // MCP does not define a stable account identity. An explicit new authorization
    // gets a new connection so it cannot silently switch consumers to another account.
    if (input.connectionId) throw new McpConnectionError("configuration", "MCP 新授权请新建连接，避免替换原账号；已有授权会自动刷新");
    const connectionId = randomUUID();
    const config: McpConfiguration = { connectionId, serviceId: input.serviceId, protocol: "mcp", displayName, endpoint, redirectUri,
      sessionId: randomUUID(), mode, transport: "http" };
    const secrets = connectorProtocolSecrets(home, config.sessionId);
    if (token) secrets.put("access", token);
    if (input.clientId?.trim()) secrets.put("client", JSON.stringify({ client_id: input.clientId.trim(), ...(input.clientSecret?.trim() ? { client_secret: input.clientSecret.trim() } : {}) }));
    const state = withConnectorProtocols(home, store => store.begin(origin, config, now()));
    try {
      const connected = await useClient(home, config, inspect, state);
      if (connected.authorizationUrl) { withConnectorProtocols(home, store => store.update(state, config)); return { connectionId, authorizationUrl: connected.authorizationUrl }; }
      if (!connected.result) throw new McpConnectionError("provider", "MCP 未完成初始化");
      if (config.mode === "oauth" && !secrets.get("access")) throw new McpConnectionError("authorization", "MCP 未取得访问令牌，请检查 OAuth 应用配置");
      commit(home, config);
      withConnectorProtocols(home, store => store.discard(state));
      return { connectionId, ...connected.result };
    } catch (error) { withConnectorProtocols(home, store => store.discard(state)); secrets.clear(); throw error; }
  });
  const completeMcpAuthorization = async (home: string, input: { state?: string; code?: string; origin: string; returnedUrl?: string; error?: string }) => {
    const returned = input.returnedUrl ? new URL(input.returnedUrl) : null;
    const state = returned?.searchParams.get("state") || input.state || "";
    const code = returned?.searchParams.get("code") || input.code || "";
    let config: McpConfiguration;
    try {
      config = withConnectorProtocols(home, store => store.consume<McpConfiguration>(state, callbackOrigin(input.origin), now())).configuration;
    } catch { throw new McpConnectionError("authorization", "MCP 授权会话无效、已过期或已使用，请重新连接"); }
    return serialized(home, config.connectionId, async () => {
      const session = provider(home, config);
      try {
        if (config.protocol !== "mcp") throw new McpConnectionError("authorization", "授权方式不匹配");
        if (returned && returned.origin + returned.pathname !== config.redirectUri) throw new McpConnectionError("authorization", "返回地址不匹配本次授权");
        if (input.error || returned?.searchParams.get("error")) throw new McpConnectionError("authorization", "授权被取消或拒绝");
        endpointFor(config.serviceId, config.endpoint);
        if (!code.trim()) throw new McpConnectionError("authorization", "MCP 未返回授权码，请重新连接");
        await auth(session.oauth, { serverUrl: config.endpoint, authorizationCode: code, fetchFn: session.fetch });
        const connected = await useClient(home, config, inspect);
        if (!connected.result) throw new McpConnectionError("authorization", "MCP 授权未完成，请重新连接");
        commit(home, config);
        return { connectionId: config.connectionId, serviceId: config.serviceId, ...connected.result };
      } finally { session.secrets.clear(); }
    });
  };
  const runConnection = <T>(home: string, id: string, options: { signal?: AbortSignal }, run: (client: Client, signal: AbortSignal) => Promise<T>) =>
    withConnectorRequest(home, id, options.signal, signal => serialized(home, id, async () => {
      signal.throwIfAborted();
      const connected = await useClient(home, active(home, id), client => run(client, signal), undefined, signal);
      if (connected.result === undefined) throw new McpConnectionError("authorization", "MCP 需要重新授权");
      return connected.result;
    }));
  const inspectMcpConnection = (home: string, id: string, options: { signal?: AbortSignal } = {}) => runConnection(home, id, options, inspect);
  const getMcpConnectionDescriptor = async (home: string, id: string, options: { signal?: AbortSignal } = {}) => {
    const before = active(home, id);
    const row = withConnectorConnections(home, store => store.require(id));
    const revision = createHash("sha256").update(JSON.stringify([row.updated_at, before.endpoint, before.mode])).digest("hex");
    const capabilities = await inspectMcpConnection(home, id, options);
    if (withConnectorConnections(home, store => store.require(id)).updated_at !== row.updated_at) throw new McpConnectionError("configuration", "连接已改变，请重新读取");
    return { kind: "mcp" as const, connection_id: id, service_id: row.service_id, display_name: row.display_name, revision, available: true, ...capabilities };
  };
  const callMcpConnectionTool = (home: string, id: string, name: string, args: Record<string, unknown>, options: { signal?: AbortSignal } = {}) => runConnection(home, id, options, async (client, signal) => {
    if (!name.trim() || name.length > 256) throw new McpConnectionError("configuration", "MCP 工具名称无效");
    const available = await inspect(client, signal);
    if (!available.tools.some(tool => tool.name === name)) throw new McpConnectionError("configuration", "此连接没有所选工具，请重新发现工具");
    return client.callTool({ name, arguments: args }, undefined, { timeout: REQUEST_TIMEOUT, signal });
  });
  const readMcpConnectionResource = (home: string, id: string, uri: string, options: { signal?: AbortSignal } = {}) => runConnection(home, id, options, (client, signal) => {
    if (!uri.trim() || uri.length > 4096) throw new McpConnectionError("configuration", "资源 URI 无效");
    return client.readResource({ uri }, { timeout: REQUEST_TIMEOUT, signal });
  });
  const resolveMcpConnectionToken = (home: string, id: string, endpoint: string) => serialized(home, id, async () => {
    const config = active(home, id);
    if (new URL(endpoint).href !== config.endpoint) throw new McpConnectionError("configuration", "MCP 连接只能用于已绑定的完整服务地址");
    const ready = await useClient(home, config, async () => true);
    if (!ready.result) throw new McpConnectionError("authorization", "MCP 需要重新授权");
    active(home, id);
    return connectorProtocolSecrets(home, id).get("access") ?? null;
  });
  return { startMcpConnection, completeMcpAuthorization, inspectMcpConnection, callMcpConnectionTool, readMcpConnectionResource, getMcpConnectionDescriptor, resolveMcpConnectionToken };
}

export const { startMcpConnection, completeMcpAuthorization, inspectMcpConnection, callMcpConnectionTool, readMcpConnectionResource, getMcpConnectionDescriptor, resolveMcpConnectionToken } = createConnectorMcpHost();
