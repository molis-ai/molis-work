import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { beginConnectorAuthorization, finishConnectorAuthorization } from "./connector-authorization-status.js";
import { checkConnectorSetupSubmission } from "./connector-setup-submission.js";
import { saveConnectorAuthorizationPresentation } from "./connector-authorization-presentation.js";
import { assertMcpAuthorizationPending, commitMcpConnection } from "./connector-mcp-commit.js";
import { CUSTOM_MCP_SERVICE, mcpAuthentication, mcpServerFor, requiresMcpDeclaration } from "./connector-mcp-endpoint.js";
import { randomUUID } from "node:crypto";
import { connectorProductAuth } from "./connector-product-auth.js";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { withConnectorRequest } from "./connector-lifecycle.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { mcpInputFingerprint } from "./mcp-tool-actions.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { auth, UnauthorizedError, type OAuthClientProvider, type OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport, type StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { larkMcpLaunch, type LarkMcpLaunchInput } from "./lark-mcp-launch.js";
import type { OAuthClientInformationMixed, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { connectorProtocolSecrets, withConnectorProtocols, type ConnectorProtocolConfiguration } from "./connector-protocol-store.js";
import { isLoopbackHttpOrigin, isLoopbackHttpUrl } from "@molis-ai/molis-work-contracts/platform/loopback";
import { PRODUCT_VERSION } from "./product-version.js";
import { activeMcpOperation, resolveMcpServer, mcpOperationAuthority, mcpSourcePin, productMcpClientEligible, type McpSourcePin, type McpOperationAuthority } from "./connector-mcp-configuration.js";
import { useLocalMcpConnection } from "./connector-local-mcp.js";

export interface McpServerConfiguration {
  endpoint: string;
  auth?: "oauth" | "bearer" | "either" | "none";
  registration?: "manual";
  tokenScheme?: "Sentry-Bearer";
  endpointPattern?: RegExp;
  stdio?: boolean;
}

const CALLBACK = "/api/settings/connectors/methods/mcp/callback";
const REQUEST_TIMEOUT = 30_000;
export interface McpConfiguration extends ConnectorProtocolConfiguration {
  protocol: "mcp";
  endpoint: string;
  displayName: string;
  redirectUri: string;
  sessionId: string;
  mode: "oauth" | "bearer" | "none";
  transport: "http" | "sse";
  discovery?: OAuthDiscoveryState;
  source?: McpSourcePin;
  /** Pending authorization only; removed before the stable protocol record is committed. */
  sourceGeneration?: string;
  tokenScheme?: "Sentry-Bearer";
  previousRevision?: string;
  previousDisconnectedAt?: string | null;
}

export interface StartMcpConnectionInput {
  serviceId: string; displayName: string; endpoint?: string; clientId?: string; clientSecret?: string;
  token?: string; origin?: string; connectionId?: string; redirectUri?: string; setupId?: string;
  authentication?: "none" | "bearer" | "oauth";
  transport?: "http" | "sse";
}
import { inspectMcpClient as inspect, type McpInspection } from "./connector-mcp-inspection.js";
export type { McpInspection } from "./connector-mcp-inspection.js";
/** Host-only authority and contract checks; never serialized into MCP requests. */
interface McpRequestOptions {
  signal?: AbortSignal;
  beforeDispatch?(): void | Promise<void>;
  onBusinessDispatch?(): void;
}
interface McpToolRequestOptions extends McpRequestOptions {
  expectedInputFingerprint?: string;
  onInspection?(inspection: McpInspection): void;
}

function callbackOrigin(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw connectorErrors["connector.mcp.configuration"]("本机回调地址无效"); }
  if (!isLoopbackHttpOrigin(url)) {
    throw connectorErrors["connector.mcp.configuration"]("授权回调必须使用本机 HTTP 地址");
  }
  return url.origin;
}
function mcpCallback(input: StartMcpConnectionInput, mode: McpConfiguration["mode"]) {
  if (mode === "none" && input.origin === undefined && input.redirectUri === undefined) return { origin: "", redirectUri: "" };
  const origin = callbackOrigin(input.origin ?? ""), redirectUri = input.redirectUri?.trim() || origin + CALLBACK;
  const redirect = new URL(redirectUri);
  if (redirect.username || redirect.password || redirect.search || redirect.hash || (redirect.protocol !== "https:" && redirectUri !== origin + CALLBACK)) throw connectorErrors["connector.mcp.configuration"]("请使用当前本机回调或已登记的 HTTPS 回调地址");
  return { origin, redirectUri };
}
function authorizationError(message: string): ActionError { return connectorErrors["connector.mcp.authorization"](message); }
function safeError(error: unknown): ActionError {
  const connectionRefusal = error instanceof ActionError && error.code.startsWith("connector.connection.") && Object.hasOwn(connectorErrors, error.code);
  if (error instanceof ActionError && !connectionRefusal) return error;
  if (error instanceof UnauthorizedError) return authorizationError("MCP 需要重新授权，请检查账号权限或 OAuth 应用配置");
  return connectorErrors["connector.mcp.provider"]("MCP 连接失败，请检查服务地址、账号权限和 OAuth 应用配置后重试");
}

function readOAuthCredential<T extends { issuer?: string }>(raw: string | null, allowUnbound = false): T | undefined {
  if (!raw) return undefined;
  const credential = JSON.parse(raw) as T;
  if (!allowUnbound && !credential.issuer?.trim()) throw authorizationError("MCP 授权凭据来自旧版本，请重新连接");
  return credential;
}

function bindStagedOAuthClient(secrets: ReturnType<typeof connectorProtocolSecrets>, issuer: string, staged: boolean): void {
  const raw = staged ? secrets.get("client") : null;
  if (!raw) return;
  const client = JSON.parse(raw) as OAuthClientInformationMixed;
  if (!client.issuer) secrets.put("client", JSON.stringify({ ...client, issuer }));
}

interface ConnectorMcpHostOptions {
  testServers?: Readonly<Record<string, McpServerConfiguration>>;
  now?: () => number;
  /** Tests only: builds the transport for a local stdio server (Feishu/Lark), so a test sees exactly what the Host starts it with. */
  stdioTransport?: (parameters: StdioServerParameters) => Transport;
}

/**
 * Runs `run` against the Feishu/Lark MCP server, started as a child process for this use alone: the Host builds its launch
 * (pinned package, only the variables it needs, an empty working directory of its own), and closes the child and removes
 * that directory when the use ends, however it ends.
 */
async function runLarkMcpChild<T>(credentials: LarkMcpLaunchInput, use: Pick<ConnectorMcpHostOptions, "stdioTransport"> & { checkActive?: () => void; signal?: AbortSignal },
  run: (client: Client) => Promise<T>): Promise<{ result: T }> {
  const launch = larkMcpLaunch(credentials);
  const client = new Client({ name: "molis-work", version: PRODUCT_VERSION }, { capabilities: {} });
  // Aborting closes the connection; a connection that is already closed has nothing left to close.
  const abort = () => { void client.close().catch(() => {}); };
  try {
    const parameters: StdioServerParameters = { command: launch.command, args: launch.args, env: launch.env, cwd: launch.cwd, stderr: "pipe" };
    const transport = use.stdioTransport ? use.stdioTransport(parameters) : new StdioClientTransport(parameters);
    use.signal?.addEventListener("abort", abort, { once: true });
    await client.connect(transport, { timeout: 60_000, signal: use.signal });
    use.checkActive?.();
    const result = await run(client);
    use.checkActive?.(); use.signal?.throwIfAborted();
    return { result };
  // The result (or the error) is already in hand; a connection that is already closed has nothing left to close.
  } finally { use.signal?.removeEventListener("abort", abort); await client.close().catch(() => {}); launch.cleanup(); }
}

/** Preset addresses stay pinned; the generic MCP entry validates the address the person explicitly supplied. */
export function createConnectorMcpHost(options: ConnectorMcpHostOptions = {}) {
  if ((options.testServers || options.stdioTransport) && process.env.NODE_ENV !== "test") throw new Error("MCP test endpoints require NODE_ENV=test");
  const now = options.now ?? Date.now;
  const queues = new Map<string, Promise<unknown>>();
  const serialized = async <T>(home: string, id: string, operation: () => Promise<T>): Promise<T> => {
    const key = `${resolve(home)}:${id}`;
    const previous = queues.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(operation); // Only the order is chained: the previous operation's failure was already answered to its own caller.
    queues.set(key, next);
    try { return await next; } catch (error) { throw safeError(error); }
    finally { if (queues.get(key) === next) queues.delete(key); }
  };
  const resolveServer = (home: string, serviceId: string, requested?: string) => resolveMcpServer(home, serviceId, requested, options.testServers);
  const active = (home: string, id: string) => activeMcpOperation(home, id, options.testServers);
  function guardedFetch(config: McpConfiguration, checkActive?: () => void, signal?: AbortSignal, beforeDispatch?: McpRequestOptions["beforeDispatch"]): typeof fetch {
    return async (input, init) => {
      checkActive?.();
      const url = new URL(input instanceof Request ? input.url : String(input));
      const configured = new URL(config.endpoint);
      const permittedLocal = url.origin === configured.origin && (options.testServers || config.serviceId === "figma" || config.serviceId === CUSTOM_MCP_SERVICE && isLoopbackHttpUrl(configured));
      if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && permittedLocal))) throw connectorErrors["connector.mcp.configuration"]("MCP 授权服务返回了不安全的地址");
      await beforeDispatch?.();
      checkActive?.();
      signal?.throwIfAborted();
      const response = await fetch(input, { ...init, redirect: "error", signal: AbortSignal.any([AbortSignal.timeout(REQUEST_TIMEOUT), ...(init?.signal ? [init.signal] : []), ...(signal ? [signal] : [])]) });
      checkActive?.(); signal?.throwIfAborted();
      return response;
    };
  }
  function provider(home: string, config: McpConfiguration, authority: McpOperationAuthority, state?: string, signal?: AbortSignal, beforeDispatch?: McpRequestOptions["beforeDispatch"]) {
    const secrets = connectorProtocolSecrets(home, config.sessionId);
    const checkActive = () => {
      signal?.throwIfAborted();
      if (state) assertMcpAuthorizationPending(home, state, now());
      authority.check();
    };
    let authorizationUrl: string | undefined;
    const saveConfig = () => {
      if (state) { checkActive?.(); withConnectorProtocols(home, store => store.update(state, config)); }
      else if (config.sessionId === config.connectionId) { checkActive?.(); withConnectorProtocols(home, store => store.save(config)); }
    };
    const oauth: OAuthClientProvider = {
      redirectUrl: config.redirectUri,
      get clientMetadata() {
        const client = oauth.clientInformation() as OAuthClientInformationMixed | undefined;
        return { client_name: "Molis", client_uri: "https://molis.ai", redirect_uris: [config.redirectUri], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: client?.client_secret ? "client_secret_post" : "none" };
      },
      state: () => { checkActive(); if (!state) throw connectorErrors["connector.mcp.authorization"]("MCP 授权已失效，请重新连接"); return state; },
      clientInformation: () => { checkActive(); return readOAuthCredential<OAuthClientInformationMixed>(secrets.get("client"), Boolean(authority.server.stdio)); },
      saveClientInformation: client => { checkActive?.(); secrets.put("client", JSON.stringify(client)); },
      tokens: () => { checkActive?.(); return readOAuthCredential<OAuthTokens>(secrets.get("oauth")); },
      saveTokens: tokens => {
        checkActive?.();
        secrets.put("oauth", JSON.stringify(tokens));
        secrets.put("access", tokens.access_token);
        if (tokens.expires_in !== undefined) secrets.put("expires", String(now() + tokens.expires_in * 1000));
        else secrets.delete("expires");
      },
      saveCodeVerifier: verifier => { checkActive(); if (!state) throw connectorErrors["connector.mcp.authorization"]("MCP 需要重新授权"); secrets.put("verifier", verifier); },
      codeVerifier: () => { checkActive(); const verifier = secrets.get("verifier"); if (!verifier) throw connectorErrors["connector.mcp.authorization"]("授权校验信息缺失，请重新连接"); return verifier; },
      redirectToAuthorization: url => {
        checkActive();
        if (!state) throw connectorErrors["connector.mcp.authorization"]("MCP 需要重新授权");
        const local = url.origin === new URL(config.endpoint).origin && (options.testServers || config.serviceId === CUSTOM_MCP_SERVICE && isLoopbackHttpUrl(url));
        if (url.username || url.password || (url.protocol !== "https:" && !local)) throw connectorErrors["connector.mcp.authorization"]("MCP 返回的授权地址无效");
        authorizationUrl = url.href;
      },
      discoveryState: () => { checkActive(); return config.discovery; },
      saveDiscoveryState: discovery => { checkActive?.(); bindStagedOAuthClient(secrets, discovery.authorizationServerUrl, Boolean(state)); config.discovery = discovery; saveConfig(); },
      invalidateCredentials: scope => {
        checkActive?.();
        if (scope === "all" || scope === "tokens") for (const name of ["oauth", "access", "expires"]) secrets.delete(name);
        if (scope === "all" || scope === "client") secrets.delete("client");
        if (scope === "all" || scope === "verifier") secrets.delete("verifier");
        if (scope === "all" || scope === "discovery") { delete config.discovery; saveConfig(); }
      },
    };
    return { oauth, secrets, checkActive, authorizationUrl: () => authorizationUrl, fetch: guardedFetch(config, checkActive, signal, beforeDispatch) };
  }
  async function useClient<T>(home: string, config: McpConfiguration, authority: McpOperationAuthority, run: (client: Client) => Promise<T>, state?: string, signal?: AbortSignal, beforeDispatch?: McpRequestOptions["beforeDispatch"]): Promise<{ result?: T; authorizationUrl?: string }> {
    const session = provider(home, config, authority, state, signal, beforeDispatch);
    signal?.throwIfAborted(); session.checkActive();
    if (authority.server.stdio) {
      const info = session.oauth.clientInformation() as OAuthClientInformationMixed | undefined;
      if (!info?.client_id || !info.client_secret) throw connectorErrors["connector.mcp.configuration"]("飞书 / Lark MCP 需要 App ID 与 App Secret");
      return runLarkMcpChild({ appId: info.client_id, appSecret: info.client_secret, domain: new URL(config.endpoint).origin, userAccessToken: session.secrets.get("access") },
        { stdioTransport: options.stdioTransport, checkActive: session.checkActive, signal }, run);
    }
    const expires = Number(session.secrets.get("expires"));
    // Some official servers also expose anonymous tools. A user asking to link
    // an account must still authorize, even if initialize would succeed publicly.
    if (config.mode === "oauth" && ((state && !session.secrets.get("access")) || (expires > 0 && expires <= now() + 30_000))) {
      await auth(session.oauth, { serverUrl: config.endpoint, fetchFn: session.fetch });
      session.checkActive();
      if (session.authorizationUrl()) return { authorizationUrl: session.authorizationUrl() };
    }
    const token = config.mode === "bearer" ? session.secrets.get("access") : null;
    if (config.mode === "bearer" && !token) throw connectorErrors["connector.mcp.authorization"]("MCP 令牌缺失，请重新连接");
    const headers = token ? { Authorization: `${authority.server.tokenScheme ?? "Bearer"} ${token}` } : undefined;
    const transportOptions = { authProvider: config.mode === "oauth" ? session.oauth : undefined, requestInit: headers ? { headers } : undefined, fetch: session.fetch };
    const connect = async (kind: "http" | "sse") => {
      const client = new Client({ name: "molis-work", version: PRODUCT_VERSION }, { capabilities: {} });
      const transport = kind === "http" ? new StreamableHTTPClientTransport(new URL(config.endpoint), transportOptions) : new SSEClientTransport(new URL(config.endpoint), transportOptions);
      const abort = () => { void client.close().catch(() => {}); }; // Aborting closes the connection; a connection that is already closed has nothing left to close.
      signal?.addEventListener("abort", abort, { once: true });
      try {
        await client.connect(transport, { timeout: REQUEST_TIMEOUT, signal });
        session.checkActive?.();
        config.transport = kind;
        const result = await run(client);
        session.checkActive?.(); signal?.throwIfAborted();
        return { result };
      } finally { signal?.removeEventListener("abort", abort); await client.close().catch(() => {}); } // The result (or the error) is already in hand; a connection that is already closed has nothing left to close.
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

  const startMcpConnection = async (home: string, input: StartMcpConnectionInput, control: McpRequestOptions = {}) => serialized(home, input.connectionId ?? "new", async () => {
    control.signal?.throwIfAborted();
    const resolved = await resolveServer(home, input.serviceId, input.endpoint);
    const { endpoint, server } = resolved;
    const displayName = input.displayName?.trim();
    if (!displayName || displayName.length > 100) throw connectorErrors["connector.mcp.configuration"]("连接名称不能为空且最多 100 个字符");
    const token = input.token?.trim();
    if (token && (token.length < 8 || token.length > 16_384 || /[\r\n]/u.test(token))) throw connectorErrors["connector.mcp.configuration"]("MCP 令牌格式无效");
    const mode = mcpAuthentication(input, server);
    const { origin, redirectUri } = mcpCallback(input, mode);
    const connectionId = randomUUID();
    const config: McpConfiguration = { connectionId, serviceId: input.serviceId, protocol: "mcp", displayName, endpoint, redirectUri,
      sessionId: randomUUID(), mode, transport: input.transport ?? "http", ...(server.tokenScheme ? { tokenScheme: server.tokenScheme } : {}) };
    if (resolved.owner && requiresMcpDeclaration(input.serviceId, endpoint)) {
      config.source = mcpSourcePin(resolved.owner, endpoint, mode);
      config.sourceGeneration = resolved.owner.installation_generation;
    }
    const authority = mcpOperationAuthority(config, resolved, true);
    authority.check(); control.signal?.throwIfAborted();
    // A product client belongs to the original build identity and its original default resource, before the setting is even read.
    const originalDefault = resolved.owner ? mcpServerFor(input.serviceId, resolved.owner.method) : undefined;
    if (server.auth !== "none" && !input.clientId?.trim() && !input.clientSecret?.trim() && !token &&
      endpoint === originalDefault?.endpoint && (!input.endpoint || input.endpoint === originalDefault.endpoint) && productMcpClientEligible(input.serviceId, resolved.owner)) {
      const product = connectorProductAuth(input.serviceId, "mcp");
      if (product) input = { ...input, clientId: product.clientId, clientSecret: product.clientSecret };
    }
    await control.beforeDispatch?.(); control.signal?.throwIfAborted(); authority.check();
    checkConnectorSetupSubmission(home, input.setupId, { service_id: input.serviceId, method: "mcp", endpoint, authentication: mode, transport: input.transport ?? "http", connection_id: input.connectionId });
    if (input.transport !== undefined && !["http", "sse"].includes(input.transport)) throw connectorErrors["connector.mcp.configuration"]("MCP 传输方式无效");
    if (mode === "oauth" && server.registration === "manual" && !input.clientId?.trim()) throw connectorErrors["connector.mcp.configuration"]("此 MCP 服务需要预先注册的 OAuth Client ID；请先配置官方应用");
    // MCP does not define a stable account identity. An explicit new authorization
    // gets a new connection so it cannot silently switch consumers to another account.
    if (input.connectionId) throw connectorErrors["connector.mcp.configuration"]("MCP 新授权请新建连接，避免替换原账号；已有授权会自动刷新");
    const secrets = connectorProtocolSecrets(home, config.sessionId);
    if (token) secrets.put("access", token);
    if (input.clientId?.trim()) secrets.put("client", JSON.stringify({ client_id: input.clientId.trim(), ...(input.clientSecret?.trim() ? { client_secret: input.clientSecret.trim() } : {}) }));
    const state = withConnectorProtocols(home, store => store.begin(origin, config, now()));
    const authorizationId = beginConnectorAuthorization(home, state, connectionId, input.serviceId, now(), input.setupId);
    try {
      const connected = await useClient(home, config, authority, inspect, state, control.signal, control.beforeDispatch);
      authority.check(); assertMcpAuthorizationPending(home, state, now());
      if (connected.authorizationUrl) { withConnectorProtocols(home, store => store.update(state, config)); saveConnectorAuthorizationPresentation(home, authorizationId, { authorization_url: connected.authorizationUrl }); return { connectionId, authorizationId, authorizationUrl: connected.authorizationUrl }; }
      if (!connected.result) throw connectorErrors["connector.mcp.provider"]("MCP 未完成初始化");
      if (config.mode === "oauth" && !secrets.get("access")) throw connectorErrors["connector.mcp.authorization"]("MCP 未取得访问令牌，请检查 OAuth 应用配置");
      await control.beforeDispatch?.(); control.signal?.throwIfAborted();
      const result = commitMcpConnection(home, config, state, now(), authority.commit, authority.source);
      withConnectorProtocols(home, store => store.discard(state));
      return result.status === "pending" ? { connectionId, authorizationId, ...result } : { connectionId, authorizationId, ...connected.result };
    } catch (error) { finishConnectorAuthorization(home, state, "failed"); withConnectorProtocols(home, store => store.discard(state)); secrets.clear(); throw error; }
  });
  const completeMcpAuthorization = async (home: string, input: { state?: string; code?: string; origin: string; returnedUrl?: string; error?: string }) => {
    const returned = input.returnedUrl ? new URL(input.returnedUrl) : null;
    const state = returned?.searchParams.get("state") || input.state || "";
    const code = returned?.searchParams.get("code") || input.code || "";
    let config: McpConfiguration;
    try {
      config = withConnectorProtocols(home, store => store.consume<McpConfiguration>(state, callbackOrigin(input.origin), now())).configuration;
    } catch { throw connectorErrors["connector.mcp.authorization"]("MCP 授权会话无效、已取消、已过期或已使用，请重新连接"); }
    return serialized(home, config.connectionId, async () => {
      const secrets = connectorProtocolSecrets(home, config.sessionId);
      try {
        const resolved = await resolveServer(home, config.serviceId, config.endpoint);
        const authority = mcpOperationAuthority(config, resolved, true);
        const session = provider(home, config, authority, state);
        session.checkActive?.();
        if (config.protocol !== "mcp") throw connectorErrors["connector.mcp.authorization"]("授权方式不匹配");
        if (returned && returned.origin + returned.pathname !== config.redirectUri) throw connectorErrors["connector.mcp.authorization"]("返回地址不匹配本次授权");
        if (input.error || returned?.searchParams.get("error")) throw connectorErrors["connector.mcp.authorization"]("授权被取消或拒绝");
        if (!code.trim()) throw connectorErrors["connector.mcp.authorization"]("MCP 未返回授权码，请重新连接");
        await auth(session.oauth, { serverUrl: config.endpoint, authorizationCode: code, fetchFn: session.fetch });
        const connected = await useClient(home, config, authority, inspect, state);
        if (!connected.result) throw connectorErrors["connector.mcp.authorization"]("MCP 授权未完成，请重新连接");
        const result = commitMcpConnection(home, config, state, now(), authority.commit, authority.source);
        return { connectionId: config.connectionId, serviceId: config.serviceId, ...(result.status === "pending" ? result : connected.result) };
      } catch (error) {
        finishConnectorAuthorization(home, state, (input.error || returned?.searchParams.get("error")) === "access_denied" ? "cancelled" : "failed");
        throw error;
      } finally { secrets.clear(); }
    });
  };
  const runConnection = <T>(home: string, id: string, options: McpRequestOptions, run: (client: Client, signal: AbortSignal, checkCurrent: () => void) => Promise<T>) =>
    withConnectorRequest(home, id, options.signal, signal => serialized(home, id, async () => {
      signal.throwIfAborted();
      const { config, authority } = await active(home, id);
      authority.check();
      const connected = config.transport === "stdio"
        ? await useLocalMcpConnection(home, config, { ...options, signal }, client => run(client, signal, authority.check))
        : await useClient(home, config, authority, client => run(client, signal, authority.check), undefined, signal, options.beforeDispatch);
      authority.check();
      if (connected.result === undefined) throw connectorErrors["connector.mcp.authorization"]("MCP 需要重新授权");
      return connected.result;
    }));
  const inspectMcpConnection = (home: string, id: string, options: McpRequestOptions = {}) => runConnection(home, id, options, inspect);
  const getMcpConnectionDescriptor = async (home: string, id: string, options: { signal?: AbortSignal } = {}) => {
    const { config: before, authority } = await active(home, id);
    const row = withConnectorConnections(home, store => store.require(id));
    const revision = createHash("sha256").update(JSON.stringify([row.updated_at, before.transport === "stdio" ? before.launch : before.endpoint, before.mode])).digest("hex");
    const capabilities = await inspectMcpConnection(home, id, options);
    authority.check();
    if (withConnectorConnections(home, store => store.require(id)).updated_at !== row.updated_at) throw connectorErrors["connector.mcp.configuration"]("连接已改变，请重新读取");
    return { kind: "mcp" as const, connection_id: id, service_id: row.service_id, display_name: row.display_name, revision, available: true, ...capabilities };
  };
  const callMcpConnectionTool = (home: string, id: string, name: string, args: Record<string, unknown>, options: McpToolRequestOptions = {}) => runConnection(home, id, options, async (client, signal, checkCurrent) => {
    if (!name.trim() || name.length > 256) throw connectorErrors["connector.mcp.configuration"]("MCP 工具名称无效");
    const available = await inspect(client, signal);
    await options.beforeDispatch?.(); signal.throwIfAborted();
    checkCurrent();
    options.onInspection?.(available);
    const tool = available.tools.find(tool => tool.name === name);
    if (!tool) throw new ActionError("actions.provider_changed", "此连接已不再提供所选工具，请重新选择");
    if (options.expectedInputFingerprint && options.expectedInputFingerprint !== mcpInputFingerprint(tool.inputSchema)) {
      throw new ActionError("actions.provider_changed", "MCP 工具的参数合同已变化，原引用已保留，请重新选择并授权");
    }
    await options.beforeDispatch?.();
    signal.throwIfAborted(); checkCurrent();
    options.onBusinessDispatch?.();
    return client.callTool({ name, arguments: args }, undefined, { timeout: REQUEST_TIMEOUT, signal });
  });
  const readMcpConnectionResource = (home: string, id: string, uri: string, options: McpRequestOptions = {}) => runConnection(home, id, options, async (client, signal, checkCurrent) => {
    if (!uri.trim() || uri.length > 4096) throw connectorErrors["connector.mcp.configuration"]("资源 URI 无效");
    await options.beforeDispatch?.();
    signal.throwIfAborted(); checkCurrent();
    options.onBusinessDispatch?.();
    return client.readResource({ uri }, { timeout: REQUEST_TIMEOUT, signal });
  });
  const resolveMcpConnectionToken = (home: string, id: string, endpoint: string) => serialized(home, id, async () => {
    const { config, authority } = await active(home, id);
    if (config.transport === "stdio") throw connectorErrors["connector.mcp.configuration"]("本地 MCP 没有可供远程连接复用的令牌");
    if (new URL(endpoint).href !== config.endpoint) throw connectorErrors["connector.mcp.configuration"]("MCP 连接只能用于已绑定的完整服务地址");
    const ready = await useClient(home, config, authority, async () => true);
    if (!ready.result) throw connectorErrors["connector.mcp.authorization"]("MCP 需要重新授权");
    authority.check();
    return connectorProtocolSecrets(home, id).get("access") ?? null;
  });
  return { startMcpConnection, completeMcpAuthorization, inspectMcpConnection, callMcpConnectionTool, readMcpConnectionResource, getMcpConnectionDescriptor, resolveMcpConnectionToken };
}

export const { startMcpConnection, completeMcpAuthorization, inspectMcpConnection, callMcpConnectionTool, readMcpConnectionResource, getMcpConnectionDescriptor, resolveMcpConnectionToken } = createConnectorMcpHost();
