import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { once } from "node:events";
import test from "node:test";
import { StdioClientTransport, type StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createPrologueNodeAdapter, AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";
import { createConnectorMcpHost, MCP_SERVERS } from "../apps/local-host/dist/connector-mcp.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { captureHostLog, larkMcpLaunch, type HostLogEntry } from "@molis-ai/molis-work-app-local-host";
import { createAgentConnectorPorts } from "../apps/local-host/dist/agent-connector-ports.js";
import { connectorAuthorizationStatus, finishConnectorAuthorization } from "../apps/local-host/dist/connector-authorization-status.js";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { connectorProtocolSecrets, withConnectorProtocols } from "../apps/local-host/dist/connector-protocol-store.js";
import { connectorMcpCapabilityId, connectorMcpResourceCapabilityId, createConnectorMcpDirectory, type ConnectorMcpTool } from "../apps/local-host/dist/connector-mcp-actions.js";
import { MolisWorkLocalHost, connectorSetupAction, connectorSetupExecuteAction, connectorSetupIntentAction, holdConnectorAuthorizationsForSession, connectorManagementActions, CONNECTOR_MANAGEMENT_READ, CONNECTOR_MANAGEMENT_WRITE } from "@molis-ai/molis-work-app-local-host";
import { createDesktopWebHost } from "@molis-ai/molis-work-app-desktop";
import { isMcpToolCapability } from "../apps/local-host/dist/mcp-tool-actions.js";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { authorizeMcpActions } from "../apps/local-host/dist/mcp-action-client.js";
import { createMcpActionGrant } from "../apps/local-host/dist/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/dist/mcp-settings-store.js";

import { openTestHome } from "./fixtures/test-home.js";

async function body(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
function home() { return mkdtempSync(join(tmpdir(), "molis-mcp-test-")); }
const callbackOrigin = "http://localhost:19357";

type FixtureTool = { name: string; description?: string; inputSchema: { type: "object"; [key: string]: unknown } };
async function fixture(options: { token?: string; oauth?: boolean; sse?: boolean; toolError?: boolean; fail?: boolean; slow?: boolean; publicOrigin?: string; beforeToken?(): void | Promise<void>;
  beforeList?(): void | Promise<void>; beforeInitialize?(): void | Promise<void>; tools?(): FixtureTool[] } = {}) {
  let enterCall!: () => void, releaseCall!: () => void;
  const called = new Promise<void>(resolve => { enterCall = resolve; });
  const release = new Promise<void>(resolve => { releaseCall = resolve; });
  let origin = "";
  let expectedToken = options.token;
  let challenge = "";
  let refreshCount = 0;
  let tokenRequestCount = 0;
  let callCount = 0;
  let readCount = 0;
  let initializationCount = 0;
  let authClient = "";
  const authorizationHeaders: string[] = [];
  const sessions = new Set<Server>();
  const sseTransports = new Map<string, SSEServerTransport>();
  const makeServer = () => {
    const server = new Server({ name: "fixture-mcp", version: "1.0.0" }, { capabilities: { tools: {}, resources: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => { await options.beforeList?.(); return { tools: options.tools?.() ?? [{ name: "echo", description: "Echo an explicit input", inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] } }] }; });
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [{ uri: "fixture://readme", name: "Readme" }] }));
    server.setRequestHandler(CallToolRequestSchema, async request => { callCount++; enterCall(); if (options.slow) await release; return { ...(options.toolError ? { isError: true } : {}), content: [{ type: "text", text: String(request.params.arguments?.message) }] }; });
    server.setRequestHandler(ReadResourceRequestSchema, async request => { readCount++; return { contents: [{ uri: request.params.uri, text: "Actual MCP resource", mimeType: "text/plain" }] }; });
    sessions.add(server);
    return server;
  };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", origin);
    const json = (status: number, value: unknown) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(value)); };
    try {
      if (url.pathname.startsWith("/.well-known/oauth-protected-resource")) return json(200, { resource: `${origin}/mcp`, authorization_servers: [origin], scopes_supported: ["read"] });
      if (url.pathname.startsWith("/.well-known/oauth-authorization-server")) return json(200, {
        issuer: origin, authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`, registration_endpoint: `${origin}/register`,
        response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
      });
      if (url.pathname === "/register") { const metadata = JSON.parse(await body(request)); return json(201, { ...metadata, client_id: "dynamic-test-client" }); }
      if (url.pathname === "/token") {
        tokenRequestCount++;
        await options.beforeToken?.();
        const params = new URLSearchParams(await body(request));
        authClient = params.get("client_id") ?? "";
        if (params.get("grant_type") === "authorization_code") {
          const actual = createHash("sha256").update(params.get("code_verifier") ?? "").digest("base64url");
          if (params.get("code") !== "valid-code" || actual !== challenge) return json(400, { error: "invalid_grant", error_description: "do-not-echo-provider-secret" });
          expectedToken = "oauth-access-initial";
        } else {
          if (params.get("refresh_token") !== `oauth-refresh-${refreshCount}`) return json(400, { error: "invalid_grant" });
          refreshCount++;
          expectedToken = `oauth-access-${refreshCount}`;
        }
        return json(200, { access_token: expectedToken, token_type: "Bearer", refresh_token: `oauth-refresh-${refreshCount}`, expires_in: 3600 });
      }
      authorizationHeaders.push(request.headers.authorization ?? "");
      if (options.fail) return json(500, { error: "raw-provider-secret-must-not-leak" });
      if ((options.oauth || expectedToken) && request.headers.authorization !== `Bearer ${expectedToken}`) {
        response.writeHead(401, { "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"` });
        response.end(); return;
      }
      if (options.sse) {
        if (request.method === "GET" && url.pathname === "/mcp") {
          const transport = new SSEServerTransport("/messages", response);
          sseTransports.set(transport.sessionId, transport);
          await makeServer().connect(transport); return;
        }
        if (request.method === "POST" && url.pathname === "/messages") {
          const transport = sseTransports.get(url.searchParams.get("sessionId") ?? "");
          if (transport) { await transport.handlePostMessage(request, response); return; }
        }
        response.writeHead(405); response.end(); return;
      }
      if (request.method !== "POST") { response.writeHead(405); response.end(); return; }
      const parsed = JSON.parse(await body(request));
      if (parsed.method === "initialize") { initializationCount++; await options.beforeInitialize?.(); }
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      const mcp = makeServer();
      await mcp.connect(transport);
      await transport.handleRequest(request, response, parsed);
      response.on("close", () => { void mcp.close(); sessions.delete(mcp); });
    } catch { if (!response.headersSent) json(500, { error: "fixture-failed" }); }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing fixture address");
  const localOrigin = `http://127.0.0.1:${address.port}`;
  origin = options.publicOrigin ?? localOrigin;
  return {
    endpoint: `${origin}/mcp`, localOrigin, called, releaseCall,
    authorize(url: string) { const params = new URL(url).searchParams; challenge = params.get("code_challenge") ?? ""; assert.equal(params.get("code_challenge_method"), "S256"); return params.get("state")!; },
    rejectCurrentToken() { expectedToken = "server-invalidated-token"; },
    stats: () => ({ refreshCount, tokenRequestCount, callCount, readCount, initializationCount, authClient, authorizationHeaders }),
    async close() { await Promise.all([...sessions].map(session => session.close())); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}

test("MCP initializes, discovers real SDK tools/resources, calls explicitly, and honors disconnect", async () => {
  const temp = home(); const remote = await fixture();
  const host = createConnectorMcpHost({ testServers: { figma: { endpoint: remote.endpoint, auth: "none" } } });
  try {
    const result = await host.startMcpConnection(temp, { serviceId: "figma", displayName: "Desktop Figma", origin: callbackOrigin });
    assert.equal(result.tools?.[0]?.name, "echo");
    const descriptor = await host.getMcpConnectionDescriptor(temp, result.connectionId);
    assert.equal(descriptor.kind, "mcp"); assert.equal(descriptor.available, true);
    assert.ok(descriptor.revision); assert.equal("endpoint" in descriptor, false);
    const resource = await host.readMcpConnectionResource(temp, result.connectionId, "fixture://readme");
    assert.equal(resource.contents[0]?.text, "Actual MCP resource");
    assert.equal(result.resources?.[0]?.uri, "fixture://readme");
    assert.equal(remote.stats().callCount, 0, "connecting must not call a tool");
    const called = await host.callMcpConnectionTool(temp, result.connectionId, "echo", { message: "real-protocol" });
    assert.deepEqual(called.content, [{ type: "text", text: "real-protocol" }]);
    assert.equal(await host.resolveMcpConnectionToken(temp, result.connectionId, remote.endpoint), null);
    await assert.rejects(host.resolveMcpConnectionToken(temp, result.connectionId, remote.endpoint + "?other=1"), /完整服务地址/);
    withConnectorConnections(temp, store => store.disconnect(result.connectionId));
    const before = remote.stats().initializationCount;
    // J2C-01: the current owner code accompanies the refusal; no new remote initialization occurs.
    await assert.rejects(host.inspectMcpConnection(temp, result.connectionId), { code: "connector.mcp.disconnected", message: /已断开/ });
    assert.equal(remote.stats().initializationCount, before);
    assert.equal(remote.stats().callCount, 1);
  } finally { await remote.close(); rmSync(temp, { recursive: true, force: true }); }
});

test("MCP Bearer credentials are independent, remain private, and cannot move endpoints", async () => {
  const temp = home(); const remote = await fixture({ token: "mcp-bearer-secret" });
  const host = createConnectorMcpHost({ testServers: { github: { endpoint: remote.endpoint, auth: "either" } } });
  try {
    const result = await host.startMcpConnection(temp, { serviceId: "github", displayName: "Work", token: "mcp-bearer-secret", origin: callbackOrigin });
    assert.equal(await host.resolveMcpConnectionToken(temp, result.connectionId, remote.endpoint), "mcp-bearer-secret");
    assert.ok(remote.stats().authorizationHeaders.every(value => value === "Bearer mcp-bearer-secret"));
    assert.equal(JSON.stringify(result).includes("mcp-bearer-secret"), false);
    const publicView = withConnectorConnections(temp, store => store.view(store.require(result.connectionId)));
    assert.equal(JSON.stringify(publicView).includes("mcp-bearer-secret"), false);
    await assert.rejects(host.startMcpConnection(temp, { serviceId: "github", displayName: "Other", endpoint: "https://attacker.example/mcp", token: "mcp-bearer-secret", origin: callbackOrigin }), { code: "connector.mcp.configuration", message: /官方地址/ });
    const anotherHome = home();
    try { await assert.rejects(host.inspectMcpConnection(anotherHome, result.connectionId)); } finally { rmSync(anotherHome, { recursive: true, force: true }); }
  } finally { await remote.close(); rmSync(temp, { recursive: true, force: true }); }
});

test("linking an account authorizes even when the MCP server also accepts anonymous initialization", async () => {
  const temp = home(); const remote = await fixture();
  const host = createConnectorMcpHost({ testServers: { huggingface: { endpoint: remote.endpoint, auth: "either" } } });
  try {
    const started = await host.startMcpConnection(temp, { serviceId: "huggingface", displayName: "Account", origin: callbackOrigin });
    assert.ok(started.authorizationUrl);
    assert.equal(remote.stats().initializationCount, 0);
    assert.equal(withConnectorConnections(temp, store => store.list()).length, 0);
    const state = remote.authorize(started.authorizationUrl);
    const result = await host.completeMcpAuthorization(temp, { state, code: "valid-code", origin: callbackOrigin });
    assert.equal(result.tools[0]?.name, "echo");
    assert.equal(connectorProtocolSecrets(temp, result.connectionId).get("access"), "oauth-access-initial");
  } finally { await remote.close(); rmSync(temp, { recursive: true, force: true }); }
});

test("MCP OAuth DCR and PKCE survive a new host instance; refresh and 401 recovery use scoped credentials", async () => {
  const temp = home(); const remote = await fixture({ oauth: true });
  let clock = Date.now();
  const options = { testServers: { notion: { endpoint: remote.endpoint, auth: "oauth" as const } }, now: () => clock };
  try {
    const started = await createConnectorMcpHost(options).startMcpConnection(temp, { serviceId: "notion", displayName: "Workspace", origin: callbackOrigin });
    assert.ok(started.authorizationUrl);
    assert.equal(withConnectorConnections(temp, store => store.list()).length, 0, "pending authorization is not a verified connection");
    const state = remote.authorize(started.authorizationUrl);
    const restarted = createConnectorMcpHost(options);
    await assert.rejects(restarted.completeMcpAuthorization(temp, { state, code: "valid-code", origin: "http://localhost:9999" }), /授权会话无效/);
    const complete = await restarted.completeMcpAuthorization(temp, { state, code: "valid-code", origin: callbackOrigin });
    assert.equal(complete.connectionId, started.connectionId);
    assert.equal(complete.tools[0]?.name, "echo");
    assert.equal(remote.stats().authClient, "dynamic-test-client");
    await assert.rejects(restarted.completeMcpAuthorization(temp, { state, code: "valid-code", origin: callbackOrigin }), /已使用/);
    clock += 3_600_000;
    await restarted.inspectMcpConnection(temp, complete.connectionId);
    assert.equal(remote.stats().refreshCount, 1);
    remote.rejectCurrentToken();
    await restarted.inspectMcpConnection(temp, complete.connectionId);
    assert.equal(remote.stats().refreshCount, 2);
    assert.equal(await restarted.resolveMcpConnectionToken(temp, complete.connectionId, remote.endpoint), "oauth-access-2");
    const serialized = withConnectorProtocols(temp, store => JSON.stringify(store.get(complete.connectionId)));
    assert.equal(serialized.includes("oauth-refresh"), false);
    assert.equal(serialized.includes("oauth-access"), false);
    withConnectorConnections(temp, store => store.disconnect(complete.connectionId));
    assert.equal(connectorProtocolSecrets(temp, complete.connectionId).get("oauth"), null);
    await assert.rejects(restarted.inspectMcpConnection(temp, complete.connectionId), /已断开/);
  } finally { await remote.close(); rmSync(temp, { recursive: true, force: true }); }
});

test("S-37 ASC-19 ASC-35: MCP token resolution refuses a refresh completed after disable and reenable", { timeout: 30_000 }, async () => {
  const temp = home();
  let hold = false, entered!: () => void, release!: () => void;
  const reached = new Promise<void>(resolve => { entered = resolve; });
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const remote = await fixture({ oauth: true, beforeToken: async () => { if (hold) { entered(); await waiting; } } });
  let clock = Date.now();
  const host = createConnectorMcpHost({ testServers: { notion: { endpoint: remote.endpoint, auth: "oauth" } }, now: () => clock });
  try {
    const first = await host.startMcpConnection(temp, { serviceId: "notion", displayName: "Work", origin: callbackOrigin });
    await host.completeMcpAuthorization(temp, { state: remote.authorize(first.authorizationUrl!), code: "valid-code", origin: callbackOrigin });
    const secrets = connectorProtocolSecrets(temp, first.connectionId);
    const before = [secrets.get("access"), secrets.get("oauth"), secrets.get("expires")];
    hold = true; clock += 3_600_000;
    const refreshing = host.resolveMcpConnectionToken(temp, first.connectionId, remote.endpoint);
    const rejected = assert.rejects(refreshing);
    await reached;
    withConnectorConnections(temp, store => { store.setEnabled(first.connectionId, false); store.setEnabled(first.connectionId, true); });
    release(); await rejected;
    assert.deepEqual([secrets.get("access"), secrets.get("oauth"), secrets.get("expires")], before);
    assert.equal(remote.stats().callCount, 0);
  } finally { release(); await remote.close(); rmSync(temp, { recursive: true, force: true }); }
});

for (const stage of ["before_callback", "token", "discovery"] as const) test(`S-37 ASC-35 cancelled MCP authorization cannot activate after ${stage}`, { timeout: 30_000 }, async () => {
  const temp = home();
  let reached!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { reached = resolve; });
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const pause = async () => { reached(); await blocked; };
  const remote = await fixture({ oauth: true, ...(stage === "token" ? { beforeToken: pause } : stage === "discovery" ? { beforeList: pause } : {}) });
  const options = { testServers: { notion: { endpoint: remote.endpoint, auth: "oauth" as const } } };
  try {
    const started = await createConnectorMcpHost(options).startMcpConnection(temp, { serviceId: "notion", displayName: "Cancelled", origin: callbackOrigin });
    const state = remote.authorize(started.authorizationUrl!);
    if (stage === "before_callback") finishConnectorAuthorization(temp, state, "cancelled");
    // A replacement Host reads the persisted cancellation, rather than an in-memory flag.
    const completion = createConnectorMcpHost(options).completeMcpAuthorization(temp, { state, code: "valid-code", origin: callbackOrigin });
    const rejected = assert.rejects(completion, { code: "connector.mcp.authorization", message: /取消/ });
    if (stage !== "before_callback") { await entered; finishConnectorAuthorization(temp, state, "cancelled"); release(); }
    await rejected;
    assert.equal(connectorAuthorizationStatus(temp, started.authorizationId)?.status, "cancelled");
    assert.equal(withConnectorConnections(temp, store => store.get(started.connectionId)), null);
    assert.equal(withConnectorProtocols(temp, store => store.get(started.connectionId)), null);
    for (const name of ["access", "oauth", "client"]) assert.equal(connectorProtocolSecrets(temp, started.connectionId).get(name), null);
    assert.equal(remote.stats().callCount, 0);
    if (stage === "before_callback") assert.equal(remote.stats().tokenRequestCount, 0, "a cancelled request never exchanges its code");
    await assert.rejects(createConnectorMcpHost(options).completeMcpAuthorization(temp, { state, code: "valid-code", origin: callbackOrigin }), /已使用/);
  } finally { release(); await remote.close(); rmSync(temp, { recursive: true, force: true }); }
});

for (const mode of ["callback", "manual"] as const) test(`ASC-09 MCP ${mode} publishes tools and resources before the assistant continues`, { timeout: 30_000 }, async t => {
  const temp = home(), publicOrigin = "https://mcp.notion.com";
  const remote = await fixture({ oauth: true, publicOrigin });
  const originalFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin === publicOrigin) {
      const forwarded = new URL(url.pathname + url.search, remote.localOrigin);
      return originalFetch(input instanceof Request ? new Request(forwarded, input) : forwarded, init);
    }
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") throw new Error("Unexpected external request in isolated MCP test");
    return originalFetch(input, init);
  });
  const localHost = new MolisWorkLocalHost({ homeDirectory: temp, completeText: null });
  const controlToken = randomUUID();
  const server = createDesktopWebHost({ ptyClientFilePath: () => "" })({ homeDirectory: temp, localHost, controlToken });
  try {
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}`, prefix = `${origin}/api/settings/connectors/methods/mcp`;
    const post = (url: string, data: Record<string, unknown>) => originalFetch(url, { method: "POST", headers: { origin, "content-type": "application/json",
      "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": randomUUID() }, body: JSON.stringify(data) });
    const startedResponse = await post(`${prefix}/start`, { service_id: "notion", display_name: "Team knowledge" });
    assert.equal(startedResponse.status, 200);
    const started = await startedResponse.json() as { connection_id: string; authorization_id: string; authorization_url: string };
    const state = remote.authorize(started.authorization_url);
    const returnedUrl = `${prefix}/callback?state=${encodeURIComponent(state)}&code=valid-code`;
    const response = mode === "callback" ? await originalFetch(returnedUrl, { redirect: "manual" }) : await post(`${prefix}/complete`, { returned_url: returnedUrl });
    assert.equal(response.status, mode === "callback" ? 302 : 200);
    assert.equal(connectorAuthorizationStatus(temp, started.authorization_id)?.status, "connected");
    const caller: ActionCallContext = { actor_id: "assistant:asc", project_id: null, audience: "agent", permissions: ["mcp:external"] };
    const actions = localHost.homeActionClient(), discovered = await actions.discover(caller);
    const echo = discovered.find(row => row.capability_id === connectorMcpCapabilityId(started.connection_id, "echo"));
    const resource = discovered.find(row => row.capability_id === connectorMcpResourceCapabilityId(started.connection_id));
    assert.ok(echo); assert.ok(resource);
    assert.equal(remote.stats().callCount, 0, "authorization never invokes a business tool");
    const result = await actions.invoke(caller, echo, { message: "assistant uses newly authorized service" });
    assert.deepEqual(result, { content: [{ type: "text", text: "assistant uses newly authorized service" }] });
    assert.equal(remote.stats().callCount, 1);
    const contents = await actions.invoke(caller, resource, { uri: "fixture://readme" });
    assert.deepEqual(contents, { contents: [{ uri: "fixture://readme", text: "Actual MCP resource", mimeType: "text/plain" }] });
    const replay = await post(`${prefix}/complete`, { returned_url: returnedUrl });
    assert.equal(replay.status, 401);
    assert.equal(remote.stats().tokenRequestCount, 1);
    assert.equal(remote.stats().callCount, 1);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); await localHost.close();
    t.mock.restoreAll(); await remote.close(); rmSync(temp, { recursive: true, force: true });
  }
});

test("MCP authorization expires after ten minutes and rejected grants reveal no remote error body", async () => {
  const temp = home(); const remote = await fixture({ oauth: true });
  let clock = Date.now();
  const host = createConnectorMcpHost({ testServers: { slack: { endpoint: remote.endpoint, auth: "oauth", registration: "manual" } }, now: () => clock });
  try {
    await assert.rejects(host.startMcpConnection(temp, { serviceId: "slack", displayName: "Slack", origin: callbackOrigin }), /Client ID/);
    const input = { serviceId: "slack", displayName: "Slack", origin: callbackOrigin, clientId: "registered-client", clientSecret: "registered-client-secret" };
    const started = await host.startMcpConnection(temp, input);
    const state = remote.authorize(started.authorizationUrl!);
    clock += 600_001;
    await assert.rejects(host.completeMcpAuthorization(temp, { state, code: "valid-code", origin: callbackOrigin }), /已过期/);
    const retry = await host.startMcpConnection(temp, input);
    const retryState = remote.authorize(retry.authorizationUrl!);
    await assert.rejects(host.completeMcpAuthorization(temp, { state: retryState, code: "wrong-code", origin: callbackOrigin }), error => {
      assert.doesNotMatch(String(error), /do-not-echo-provider-secret|registered-client-secret/); return true;
    });
    assert.equal(withConnectorConnections(temp, store => store.list()).length, 0);
  } finally { await remote.close(); rmSync(temp, { recursive: true, force: true }); }
});

test("MCP rejects issuerless OAuth credentials before they leave the Host", async () => {
  const temp = home(); const remote = await fixture({ oauth: true });
  const host = createConnectorMcpHost({ testServers: { slack: { endpoint: remote.endpoint, auth: "oauth", registration: "manual" } } });
  try {
    const started = await host.startMcpConnection(temp, { serviceId: "slack", displayName: "Slack", origin: callbackOrigin,
      clientId: "registered-client", clientSecret: "registered-client-secret" });
    const state = remote.authorize(started.authorizationUrl!);
    await host.completeMcpAuthorization(temp, { state, code: "valid-code", origin: callbackOrigin });
    const secrets = connectorProtocolSecrets(temp, started.connectionId);
    const client = JSON.parse(secrets.get("client")!) as Record<string, unknown>;
    const tokens = JSON.parse(secrets.get("oauth")!) as Record<string, unknown>;
    assert.equal(new URL(String(client.issuer)).origin, new URL(remote.endpoint).origin);
    assert.equal(tokens.issuer, client.issuer);

    delete client.issuer; delete tokens.issuer;
    secrets.put("client", JSON.stringify(client)); secrets.put("oauth", JSON.stringify(tokens));
    const before = remote.stats();
    await assert.rejects(host.inspectMcpConnection(temp, started.connectionId), /旧版本.*重新连接/u);
    const after = remote.stats();
    assert.equal(after.tokenRequestCount, before.tokenRequestCount, "the refresh token never reaches a token endpoint");
    assert.equal(after.initializationCount, before.initializationCount, "the access token never reaches the MCP server");
  } finally { await remote.close(); rmSync(temp, { recursive: true, force: true }); }
});

test("MCP falls back to real legacy SSE only when HTTP transport is unsupported", async () => {
  const temp = home(); const remote = await fixture({ sse: true, token: "sse-bearer-secret" });
  const host = createConnectorMcpHost({ testServers: { github: { endpoint: remote.endpoint, auth: "either" } } });
  try {
    const connected = await host.startMcpConnection(temp, { serviceId: "github", displayName: "Legacy SSE", token: "sse-bearer-secret", origin: callbackOrigin });
    assert.equal(connected.tools?.[0]?.name, "echo");
    const result = await host.callMcpConnectionTool(temp, connected.connectionId, "echo", { message: "sse-result" });
    assert.deepEqual(result.content, [{ type: "text", text: "sse-result" }]);
    assert.ok(remote.stats().authorizationHeaders.every(header => header === "Bearer sse-bearer-secret"));
  } finally { await remote.close(); rmSync(temp, { recursive: true, force: true }); }
});

test("MCP failure never registers a connection or exposes server error text", async () => {
  const temp = home(); const remote = await fixture({ fail: true });
  const host = createConnectorMcpHost({ testServers: { github: { endpoint: remote.endpoint, auth: "either" } } });
  try {
    await assert.rejects(host.startMcpConnection(temp, { serviceId: "github", displayName: "Failure", token: "test-access-token", origin: callbackOrigin }), error => {
      assert.doesNotMatch(String(error), /raw-provider-secret|test-access-token/); return true;
    });
    assert.equal(withConnectorConnections(temp, store => store.list()).length, 0);
    assert.equal(MCP_SERVERS.figma?.auth, "none");
  } finally { await remote.close(); rmSync(temp, { recursive: true, force: true }); }
});


test("MCP cancels an in-flight tool on caller abort and on connection disconnect", async () => {
  for (const reason of ["caller", "disconnect"]) {
    const temp = home(), remote = await fixture({ slow: true });
    const host = createConnectorMcpHost({ testServers: { figma: { endpoint: remote.endpoint, auth: "none" } } });
    try {
      const connection = await host.startMcpConnection(temp, { serviceId: "figma", displayName: "Cancellable", origin: callbackOrigin });
      const abort = new AbortController();
      const call = host.callMcpConnectionTool(temp, connection.connectionId, "echo", { message: "wait" }, { signal: abort.signal });
      const rejected = assert.rejects(call);
      await remote.called;
      if (reason === "caller") abort.abort();
      else withConnectorConnections(temp, store => store.disconnect(connection.connectionId));
      await rejected;
      remote.releaseCall();
    } finally { remote.releaseCall(); await remote.close(); rmSync(temp, { recursive: true, force: true }); }
  }
});


test("MCP explicit new authorization cannot replace an existing account binding", async () => {
  const temp = home(), remote = await fixture({ token: "original-account-token" });
  const host = createConnectorMcpHost({ testServers: { github: { endpoint: remote.endpoint, auth: "either" } } });
  try {
    const original = await host.startMcpConnection(temp, { serviceId: "github", displayName: "Original", token: "original-account-token", origin: callbackOrigin });
    await assert.rejects(host.startMcpConnection(temp, { serviceId: "github", displayName: "Replacement", token: "other-account-token", connectionId: original.connectionId, origin: callbackOrigin }), /新建连接/u);
    assert.equal(connectorProtocolSecrets(temp, original.connectionId).get("access"), "original-account-token");
    await host.inspectMcpConnection(temp, original.connectionId);
  } finally { await remote.close(); rmSync(temp, { recursive: true, force: true }); }
});

// The Host starts the Feishu/Lark child through `stdioTransport` here: the same parameters the real transport gets, with
// the pinned package swapped for a fixture server that reports the environment it was started with.
function larkChild(started: StdioServerParameters[], directories: string[][] = []) {
  const fixtureServer = fileURLToPath(new URL("./fixtures/connector-stdio-server.ts", import.meta.url));
  return (parameters: StdioServerParameters) => {
    started.push(parameters);
    directories.push(readdirSync(parameters.cwd!));
    return new StdioClientTransport({ ...parameters, command: process.execPath, args: ["--import", import.meta.resolve("tsx"), fixtureServer] });
  };
}

test("official Lark MCP stdio transport discovers and calls tools with environment credentials", async () => {
  const temp = home(), started: StdioServerParameters[] = [], directories: string[][] = [];
  try {
    const host = createConnectorMcpHost({ stdioTransport: larkChild(started, directories) });
    const connected = await host.startMcpConnection(temp, { serviceId: "feishu", displayName: "Tenant", clientId: "fixture-app", clientSecret: "fixture-secret", origin: callbackOrigin });
    assert.equal(connected.tools?.[0]?.name, "read");
    const result = await host.callMcpConnectionTool(temp, connected.connectionId, "read", {});
    assert.match(JSON.stringify(result), /actual stdio response/u);
    assert.doesNotMatch(JSON.stringify(connected), /fixture-secret/u);
    assert.ok(started.length >= 2, "the Host started the child for each use of the connection");
    assert.equal(new Set(started.map(parameters => parameters.cwd)).size, started.length, "every start has a working directory of its own");
    assert.deepEqual(directories.flat(), [], "each one was empty when the child started, so there was no .env for it to read");
    assert.deepEqual(started.filter(parameters => existsSync(parameters.cwd!)), [], "and each is removed once the Host is done with that child");
    withConnectorConnections(temp, store => store.disconnect(connected.connectionId));
    await assert.rejects(host.inspectMcpConnection(temp, connected.connectionId), /断开/u);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("the Host starts the Feishu/Lark child with the launch it built, and the child sees none of the Host's other variables", async t => {
  const hostSecrets = { MINIMAX_API_KEY: "minimax-secret", GITHUB_TOKEN: "github-secret", MOLIS_WORK_ENCRYPTION_KEY: "encryption-secret", MOLIS_WORK_TEXT_API_KEY: "text-secret" };
  const previous = Object.fromEntries(Object.keys(hostSecrets).map(name => [name, process.env[name]]));
  Object.assign(process.env, hostSecrets);
  t.after(() => { for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
  const temp = home(), started: StdioServerParameters[] = [];
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const host = createConnectorMcpHost({ stdioTransport: larkChild(started) });
  const connected = await host.startMcpConnection(temp, { serviceId: "feishu", displayName: "Tenant", clientId: "fixture-app", clientSecret: "fixture-secret", origin: callbackOrigin });
  const parameters = started.at(-1)!;
  const expected = larkMcpLaunch({ appId: "fixture-app", appSecret: "fixture-secret", domain: "https://open.feishu.cn" });
  expected.cleanup();
  assert.deepEqual(parameters.env, expected.env, "the transport gets the launch environment unchanged: not merged with the Host's process.env");
  assert.notEqual(parameters.cwd, expected.cwd, "and its own working directory, not one shared with another launch");
  assert.equal(parameters.stderr, "pipe");
  for (const name of Object.keys(hostSecrets)) assert.equal(name in (parameters.env ?? {}), false, `${name} stays in the Host`);
  const answer = await host.callMcpConnectionTool(temp, connected.connectionId, "environment", {}) as { content: Array<{ text: string }> };
  const reported = JSON.parse(answer.content[0]!.text) as string[];
  for (const name of Object.keys(hostSecrets)) assert.equal(reported.includes(name), false, `${name} does not reach the child process`);
  for (const name of ["APP_ID", "APP_SECRET", "LARK_DOMAIN", "LARK_TOKEN_MODE"]) assert.equal(reported.includes(name), true, `${name} reaches the child process`);
});

test("official MCP OAuth flows through Host into Agent selections, refreshes, and revokes active access", async () => {
  const temp = home(); const remote = await fixture({ oauth: true });
  let clock = Date.now();
  const host = createConnectorMcpHost({ testServers: { notion: { endpoint: remote.endpoint, auth: "oauth" } }, now: () => clock });
  let adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined;
  try {
    const started = await host.startMcpConnection(temp, { serviceId: "notion", displayName: "Official workspace", origin: callbackOrigin });
    const state = remote.authorize(started.authorizationUrl!);
    await host.completeMcpAuthorization(temp, { state, code: "valid-code", origin: callbackOrigin });
    assert.equal(connectorAuthorizationStatus(temp, started.authorizationId)?.status, "connected");
    const ports = createAgentConnectorPorts(temp, host.resolveMcpConnectionToken);
    await assert.rejects(ports.resolveMcpConnection(started.connectionId, remote.endpoint + "?other=1"), /完整服务地址/);
    adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.connector-agent-review", appVersion: "1.0.0" },
      reviewQueue: new AgentReviewQueue(), storageRoot: join(temp, "runtime"), modelConfiguration: async () => null,
      resolveMcpConnection: ports.resolveMcpConnection, resolveCredential: ports.resolveMcpCredential, subscribeMcpConnections: ports.subscribeMcpConnections });
    const owner = { project_id: "review", plugin_id: "io.molis.work.coding" };
    const library = adapter.mcpLibrary!;
    const saved = await library.save(owner, { expected_version: 0, label: "Notion tools", transport: "http", enabled: true, timeout_ms: 5000,
      endpoint: remote.endpoint, auth: { kind: "connection", connection_id: started.connectionId } });
    await library.control(owner, saved.id, "connect");
    const tools = (await library.list(owner))[0]!.tools;
    assert.equal(tools[0]?.tool, "echo");
    assert.equal(remote.stats().callCount, 0, "authorization and discovery do not execute tools");
    clock += 3_600_000;
    await library.validate(owner, tools);
    assert.equal(remote.stats().refreshCount, 1);
    assert.ok(remote.stats().authorizationHeaders.includes("Bearer oauth-access-1"));
    assert.doesNotMatch(JSON.stringify(await library.list(owner)), /oauth-access|oauth-refresh/);
    withConnectorConnections(temp, store => store.disconnect(started.connectionId));
    await assert.rejects(library.validate(owner, tools), /已改变|断开|不可用/);
    assert.notEqual((await library.list(owner))[0]!.health, "connected");
  } finally { await adapter?.close(); await remote.close(); rmSync(temp, { recursive: true, force: true }); }
});

test("tools of a connection in 服务连接 are Home actions: listed once, then run through the shared service, logged and following the connection", { timeout: 60_000 }, async () => {
  const temp = home(); const remote = await fixture();
  const client = createConnectorMcpHost({ testServers: { figma: { endpoint: remote.endpoint, auth: "none" } } });
  const localHost = new MolisWorkLocalHost({ homeDirectory: temp, completeText: null });
  const directory = createConnectorMcpDirectory({ localHost, homeDirectory: temp, call: client.callMcpConnectionTool, read: client.readMcpConnectionResource });
  const user: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: ["mcp:external"] };
  const actions = localHost.homeActionClient();
  try {
    const started = await client.startMcpConnection(temp, { serviceId: "figma", displayName: "Desktop Figma", origin: callbackOrigin });
    const id = connectorMcpCapabilityId(started.connectionId, "echo");
    assert.ok(isMcpToolCapability(id) && isMcpToolCapability(connectorMcpResourceCapabilityId(started.connectionId)) && !isMcpToolCapability("feed.sources.register"));
    assert.ok(!(await actions.discover(user)).some(view => view.capability_id === id), "nothing is registered before the tools are listed");
    directory.remember(started.connectionId, started.tools as ConnectorMcpTool[], started.resources);
    const view = (await actions.discover(user)).find(row => row.capability_id === id)!;
    assert.ok(view, "the listed tool is in the Home directory");
    assert.equal(view.provider.title, "Desktop Figma");
    assert.ok(view.action.audiences.includes("workflow") && view.action.audiences.includes("mcp"));
    assert.equal(view.availability.available, true);
    assert.equal(remote.stats().callCount, 0, "listing never calls a tool");
    const ref = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
    const result = await actions.invoke(user, ref, { message: "经由目录" }) as { content: unknown[] };
    assert.deepEqual(result.content, [{ type: "text", text: "经由目录" }]);
    assert.equal(remote.stats().callCount, 1);
    // Resources are read through the same directory, as a query (nothing is written, so the call log skips it).
    const readRef = (await actions.discover(user)).find(row => row.capability_id === connectorMcpResourceCapabilityId(started.connectionId))!;
    assert.equal(readRef.operation, "query");
    const resource = await actions.invoke(user, { capability_id: readRef.capability_id, version: readRef.version, provider_id: readRef.provider.provider_id }, { uri: "fixture://readme" }) as { contents: Array<{ text?: string }> };
    assert.equal(resource.contents[0]?.text, "Actual MCP resource");
    const logged = localHost.callLog!.list(null).find(row => row.capability_id === id)!;
    assert.equal(logged.ok, true); assert.equal(logged.provider_title, "Desktop Figma");
    await assert.rejects(actions.invoke({ ...user, permissions: [] }, ref, { message: "无权限" }));
    assert.equal(remote.stats().callCount, 1, "a caller without the permission never reaches the server");
    // A restart brings the entry back from what was listed; nothing is called.
    const again = createConnectorMcpDirectory({ localHost, homeDirectory: temp, call: client.callMcpConnectionTool, read: client.readMcpConnectionResource });
    directory.close(); again.sync();
    assert.ok((await actions.discover(user)).some(row => row.capability_id === id && row.version === view.version));
    withConnectorConnections(temp, store => store.disconnect(started.connectionId));
    const offline = (await actions.discover(user)).find(row => row.capability_id === id)!;
    assert.equal(offline.availability.available, false);
    assert.match(offline.availability.available ? "" : offline.availability.reason, /已断开/);
    await assert.rejects(actions.invoke(user, ref, { message: "断开后" }), { code: "actions.connection_unavailable" });
    assert.equal(remote.stats().callCount, 1);
    again.close();
  } finally {
    directory.close();
    await localHost.close();
    await remote.close(); rmSync(temp, { recursive: true, force: true });
  }
});

test("W5-13-07 a connection the directory cannot register after a restart is written by its id; the others are still registered", { timeout: 60_000 }, async () => {
  const temp = home(); const remote = await fixture();
  const client = createConnectorMcpHost({ testServers: { figma: { endpoint: remote.endpoint, auth: "none" } } });
  const localHost = new MolisWorkLocalHost({ homeDirectory: temp, completeText: null });
  const open = () => createConnectorMcpDirectory({ localHost, homeDirectory: temp, call: client.callMcpConnectionTool, read: client.readMcpConnectionResource });
  const directory = open();
  const user: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: ["mcp:external"] };
  const entries: HostLogEntry[] = [];
  const restore = captureHostLog(entries);
  let again: ReturnType<typeof open> | undefined;
  try {
    const good = await client.startMcpConnection(temp, { serviceId: "figma", displayName: "Good", origin: callbackOrigin });
    const bad = await client.startMcpConnection(temp, { serviceId: "figma", displayName: "Bad", origin: callbackOrigin });
    directory.remember(good.connectionId, good.tools as ConnectorMcpTool[], good.resources);
    directory.remember(bad.connectionId, bad.tools as ConnectorMcpTool[], bad.resources);
    directory.close();
    // The copy a restart reads, with one connection's entry torn.
    const file = join(temp, "config", "connector-mcp-tools.json");
    const seen = JSON.parse(readFileSync(file, "utf8")) as Record<string, { tools: unknown }>;
    seen[bad.connectionId]!.tools = { length: 1 };
    writeFileSync(file, JSON.stringify(seen));
    again = open(); again.sync();
    const listed = (await localHost.homeActionClient().discover(user)).map(view => view.capability_id);
    assert.ok(listed.includes(connectorMcpCapabilityId(good.connectionId, "echo")), "the readable connection is registered");
    assert.ok(!listed.includes(connectorMcpCapabilityId(bad.connectionId, "echo")));
    assert.deepEqual(entries.filter(entry => entry.event === "mcp_register_failed").map(entry => [entry.area, entry.fields]),
      [["connections", { connection_id: bad.connectionId }]], "the one that failed is named, not silently missing");
  } finally {
    restore(); again?.close(); directory.close();
    await localHost.close();
    await remote.close(); rmSync(temp, { recursive: true, force: true });
  }
});

for (const scenario of ["HTTP tool", "SSE tool", "HTTP resource"] as const) test(`an exact MCP grant revoked during preparation blocks the ${scenario} request`, { timeout: 30_000 }, async () => {
  const temp = home();
  let revoke: (() => Promise<void>) | undefined;
  const resource = scenario === "HTTP resource";
  const remote = await fixture({ sse: scenario === "SSE tool", beforeList: () => resource ? undefined : revoke?.(), beforeInitialize: () => resource ? revoke?.() : undefined });
  const client = createConnectorMcpHost({ testServers: { figma: { endpoint: remote.endpoint, auth: "none" } } });
  const localHost = new MolisWorkLocalHost({ homeDirectory: temp, completeText: null });
  const directory = createConnectorMcpDirectory({ localHost, homeDirectory: temp, call: client.callMcpConnectionTool, read: client.readMcpConnectionResource });
  const caller: ActionCallContext = { actor_id: "runtime:boundary", project_id: null, audience: "mcp", permissions: [] };
  try {
    const started = await client.startMcpConnection(temp, { serviceId: "figma", displayName: "Grant fixture", origin: callbackOrigin });
    directory.remember(started.connectionId, started.tools as ConnectorMcpTool[], started.resources);
    const id = resource ? connectorMcpResourceCapabilityId(started.connectionId) : connectorMcpCapabilityId(started.connectionId, "echo");
    const ref = directory.reference(started.connectionId, id)!;
    const view = (await localHost.inspectActions(caller)).find(row => row.capability_id === id)!;
    const grant = createMcpActionGrant(caller.actor_id, null, view, true);
    await writeMcpActionGrant(temp, grant);
    const authorized = await authorizeMcpActions(localHost, caller, temp);
    revoke = () => writeMcpActionGrant(temp, { ...grant, enabled: false }).then(() => undefined);
    await assert.rejects(authorized.service.invoke(authorized.context, ref, resource ? { uri: "fixture://readme" } : { message: "revoked" }));
    assert.equal(remote.stats().callCount, 0, "no tools/call reached the real server");
    assert.equal(remote.stats().readCount, 0, "no resources/read reached the real server");
    revoke = undefined;
    await writeMcpActionGrant(temp, grant);
    const restored = await authorizeMcpActions(localHost, caller, temp);
    await restored.service.invoke(restored.context, ref, resource ? { uri: "fixture://readme" } : { message: "restored" });
    assert.equal(resource ? remote.stats().readCount : remote.stats().callCount, 1, "regrant recovers without reconnecting or replacing the reference");
  } finally { directory.close(); await localHost.close(); await remote.close(); rmSync(temp, { recursive: true, force: true }); }
});

test("online MCP contract changes replace the directory snapshot and require a new exact grant", { timeout: 30_000 }, async () => {
  const temp = home(); let changed = false;
  const remote = await fixture({ tools: () => [{ name: "echo", inputSchema: { type: "object", properties: { message: { type: "string" }, ...(changed ? { mode: { type: "string" } } : {}) }, required: ["message"] } }] });
  const client = createConnectorMcpHost({ testServers: { figma: { endpoint: remote.endpoint, auth: "none" } } });
  const localHost = new MolisWorkLocalHost({ homeDirectory: temp, completeText: null });
  let directory = createConnectorMcpDirectory({ localHost, homeDirectory: temp, call: client.callMcpConnectionTool });
  const caller: ActionCallContext = { actor_id: "runtime:shape", project_id: null, audience: "mcp", permissions: [] };
  try {
    const started = await client.startMcpConnection(temp, { serviceId: "figma", displayName: "Shape fixture", origin: callbackOrigin });
    directory.remember(started.connectionId, started.tools as ConnectorMcpTool[], started.resources);
    const id = connectorMcpCapabilityId(started.connectionId, "echo"), ref = directory.reference(started.connectionId, id)!;
    const view = (await localHost.inspectActions(caller)).find(row => row.capability_id === id)!;
    await writeMcpActionGrant(temp, createMcpActionGrant(caller.actor_id, null, view, true));
    const authorized = await authorizeMcpActions(localHost, caller, temp);
    changed = true;
    await assert.rejects(authorized.service.invoke(authorized.context, ref, { message: "stale" }), { code: "actions.provider_changed" });
    assert.equal(remote.stats().callCount, 0);
    const next = directory.reference(started.connectionId, id)!;
    assert.equal(next.version, ref.version + 1);
    const updated = (await localHost.inspectActions(caller)).find(row => row.capability_id === id)!;
    assert.ok((updated.action.input_schema.properties as Record<string, unknown>).mode);
    const ungranted = await authorizeMcpActions(localHost, caller, temp);
    await assert.rejects(ungranted.service.invoke(ungranted.context, next, { message: "no new grant" }));
    assert.equal(remote.stats().callCount, 0);
    await writeMcpActionGrant(temp, createMcpActionGrant(caller.actor_id, null, updated, true));
    const granted = await authorizeMcpActions(localHost, caller, temp);
    await granted.service.invoke(granted.context, next, { message: "new contract" });
    assert.equal(remote.stats().callCount, 1);
    directory.close();
    directory = createConnectorMcpDirectory({ localHost, homeDirectory: temp, call: client.callMcpConnectionTool });
    directory.sync();
    assert.deepEqual(directory.reference(started.connectionId, id), next, "the updated snapshot and version survive restart");
  } finally { directory.close(); await localHost.close(); await remote.close(); rmSync(temp, { recursive: true, force: true }); }
});

test("ASC-03 ASC-13 ASC-31 PA-MCP-01: MCP header annotations keep value constraints and unsupported contracts never dispatch", { timeout: 30_000 }, async () => {
  const declared: FixtureTool["inputSchema"] = { type: "object", properties: {
    owner: { type: "string", enum: ["molis-ai"], "x-mcp-header": "owner" },
    repo: { type: "string", "x-mcp-header": "repo" }, message: { type: "string", minLength: 1 },
    "x-mcp-header": { type: "string" },
  }, required: ["owner", "repo", "message"], additionalProperties: false };
  const rejected: FixtureTool["inputSchema"][] = [
    { type: "object", properties: { value: { type: "string", "x-unrecognized-constraint": true } } },
    { type: "object", properties: { value: { type: "string", "x-mcp-header": "bad\r\nheader" } } },
    { type: "object", properties: { value: { type: "object", "x-mcp-header": "value" } } },
    { type: "object", properties: { a: { type: "string", "x-mcp-header": "Owner" }, b: { type: "string", "x-mcp-header": "owner" } } },
    { type: "object", properties: { nested: { type: "object", properties: { value: { type: "string", "x-mcp-header": "value" } } } } },
  ];
  const temp = home(), original = structuredClone(declared);
  const remote = await fixture({ tools: () => [{ name: "annotated", inputSchema: declared }, ...rejected.map((inputSchema, i) => ({ name: `refused_${i}`, inputSchema }))] });
  const client = createConnectorMcpHost({ testServers: { figma: { endpoint: remote.endpoint, auth: "none" } } });
  const localHost = new MolisWorkLocalHost({ homeDirectory: temp, completeText: null });
  const directory = createConnectorMcpDirectory({ localHost, homeDirectory: temp, call: client.callMcpConnectionTool });
  const caller: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: ["mcp:external"] };
  const actions = localHost.homeActionClient();
  try {
    const started = await client.startMcpConnection(temp, { serviceId: "figma", displayName: "Parameter annotations", origin: callbackOrigin });
    directory.remember(started.connectionId, started.tools as ConnectorMcpTool[], started.resources);
    const ref = directory.reference(started.connectionId, connectorMcpCapabilityId(started.connectionId, "annotated"))!;
    const valid = { owner: "molis-ai", repo: "molis-life", message: "actual response", "x-mcp-header": "a literal data property" };
    for (const input of [{ repo: "molis-life", message: "missing owner" }, { ...valid, owner: 7 }, { ...valid, owner: "another-owner" },
      { ...valid, message: "" }, { ...valid, extra: true }]) await assert.rejects(actions.invoke(caller, ref, input), { code: "actions.input_invalid" });
    assert.equal(remote.stats().callCount, 0, "value constraints reject before the real HTTP tool handler");
    for (let i = 0; i < rejected.length; i++) {
      const refused = directory.reference(started.connectionId, connectorMcpCapabilityId(started.connectionId, `refused_${i}`))!;
      await assert.rejects(actions.invoke(caller, refused, {}), { code: "actions.schema_unsupported" });
    }
    assert.equal(remote.stats().callCount, 0, "unrecognized or invalid annotations cannot make a tool callable");
    assert.deepEqual(await actions.invoke(caller, ref, valid), { content: [{ type: "text", text: "actual response" }] });
    assert.equal(remote.stats().callCount, 1);
    const snapshot = JSON.parse(readFileSync(join(temp, "config/connector-mcp-tools.json"), "utf8"));
    assert.deepEqual(snapshot[started.connectionId].tools.find((tool: ConnectorMcpTool) => tool.name === "annotated").input_schema, original);
    assert.deepEqual(declared, original, "transport metadata remains on the original discovery contract");
  } finally { directory.close(); await localHost.close(); await remote.close(); rmSync(temp, { recursive: true, force: true }); }
});

test("an unsupported MCP contract stays unavailable beside healthy tools and recovers after rediscovery", { timeout: 30_000 }, async () => {
  const temp = home(); let supported = false, reversed = false;
  const remote = await fixture({ tools: () => { const tools: FixtureTool[] = [
    { name: "echo", inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] } },
    { name: "future", inputSchema: { ...(!supported ? { $schema: "https://json-schema.org/draft/2019-09/schema" } : {}), type: "object", properties: { message: { type: "string" } }, required: ["message"] } },
  ]; return reversed ? tools.reverse() : tools; } });
  const client = createConnectorMcpHost({ testServers: { figma: { endpoint: remote.endpoint, auth: "none" } } });
  const localHost = new MolisWorkLocalHost({ homeDirectory: temp, completeText: null });
  const directory = createConnectorMcpDirectory({ localHost, homeDirectory: temp, call: client.callMcpConnectionTool });
  const caller: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: ["mcp:external"] };
  const actions = localHost.homeActionClient();
  try {
    const started = await client.startMcpConnection(temp, { serviceId: "figma", displayName: "Mixed contracts", origin: callbackOrigin });
    directory.remember(started.connectionId, started.tools as ConnectorMcpTool[], started.resources);
    const id = connectorMcpCapabilityId(started.connectionId, "future"), ref = directory.reference(started.connectionId, id)!;
    const bad = (await actions.discover(caller)).find(row => row.capability_id === id)!;
    assert.equal(bad.availability.available, false);
    assert.equal(bad.availability.available ? "" : bad.availability.code, "actions.schema_unsupported");
    await assert.rejects(actions.invoke(caller, ref, {}), { code: "actions.schema_unsupported" });
    assert.equal(remote.stats().callCount, 0);
    const healthy = directory.reference(started.connectionId, connectorMcpCapabilityId(started.connectionId, "echo"))!;
    reversed = true;
    await actions.invoke(caller, healthy, { message: "healthy" });
    assert.equal(remote.stats().callCount, 1, "a bad schema does not disable other tools on the server");
    assert.deepEqual(directory.reference(started.connectionId, healthy.capability_id), healthy, "list order does not replace a tool's identity");
    supported = true;
    const inspected = await client.inspectMcpConnection(temp, started.connectionId);
    directory.remember(started.connectionId, inspected.tools, inspected.resources);
    const next = directory.reference(started.connectionId, id)!;
    assert.equal(next.version, ref.version + 1);
    await assert.rejects(actions.invoke(caller, next, {}), { code: "actions.input_invalid" });
    await actions.invoke(caller, next, { message: "recovered" });
    assert.equal(remote.stats().callCount, 2);
  } finally { directory.close(); await localHost.close(); await remote.close(); rmSync(temp, { recursive: true, force: true }); }
});

test("a server that lists another tool while one tool is being called does not fail that call: only what changed is replaced", { timeout: 30_000 }, async () => {
  const temp = home(); let extra = false;
  const echo = { name: "echo", description: "Echo an explicit input", inputSchema: { type: "object" as const, properties: { message: { type: "string" } }, required: ["message"] } };
  const remote = await fixture({ tools: () => extra ? [echo, { name: "search", description: "Another tool", inputSchema: { type: "object" as const } }] : [echo] });
  const client = createConnectorMcpHost({ testServers: { figma: { endpoint: remote.endpoint, auth: "none" } } });
  const localHost = new MolisWorkLocalHost({ homeDirectory: temp, completeText: null });
  const directory = createConnectorMcpDirectory({ localHost, homeDirectory: temp, call: client.callMcpConnectionTool });
  const caller: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: ["mcp:external"] };
  const actions = localHost.homeActionClient();
  try {
    const started = await client.startMcpConnection(temp, { serviceId: "figma", displayName: "Growing server", origin: callbackOrigin });
    directory.remember(started.connectionId, started.tools as ConnectorMcpTool[], started.resources);
    const id = connectorMcpCapabilityId(started.connectionId, "echo"), ref = directory.reference(started.connectionId, id)!;
    // The call lists the server's tools first, as it always does, and now finds one more.
    extra = true;
    assert.deepEqual(await actions.invoke(caller, ref, { message: "unchanged tool" }), { content: [{ type: "text", text: "unchanged tool" }] });
    assert.equal(remote.stats().callCount, 1, "the call reached the server instead of failing before dispatch");
    assert.deepEqual(directory.reference(started.connectionId, id), ref, "the unchanged tool keeps its registration and version");
    assert.ok((await actions.discover(caller)).some(row => row.capability_id === connectorMcpCapabilityId(started.connectionId, "search")), "the new tool joined the directory");
    // A tool the server stops offering leaves the directory; the others stay.
    extra = false;
    const inspected = await client.inspectMcpConnection(temp, started.connectionId);
    directory.remember(started.connectionId, inspected.tools, inspected.resources);
    assert.equal(directory.reference(started.connectionId, connectorMcpCapabilityId(started.connectionId, "search")), undefined);
    assert.deepEqual(directory.reference(started.connectionId, id), ref);
    assert.ok(!(await actions.discover(caller)).some(row => row.capability_id === connectorMcpCapabilityId(started.connectionId, "search")));
  } finally { directory.close(); await localHost.close(); await remote.close(); rmSync(temp, { recursive: true, force: true }); }
});

for (const configuration of [{ authentication: "none", transport: "http" }, { authentication: "bearer", transport: "http" }, { authentication: "oauth", transport: "http" }, { authentication: "none", transport: "sse" }] as const) {
  test(`ASC-05 custom MCP ${configuration.transport}/${configuration.authentication} discovers and calls without a preset`, async () => {
    const temp = home(), remote = await fixture({ oauth: configuration.authentication === "oauth", sse: configuration.transport === "sse",
      ...(configuration.authentication === "bearer" ? { token: "fixture-custom-bearer" } : {}) });
    const host = createConnectorMcpHost();
    try {
      const started = await host.startMcpConnection(temp, { serviceId: "mcp-bearer", displayName: "Company knowledge", endpoint: remote.endpoint, origin: callbackOrigin,
        ...configuration, ...(configuration.authentication === "bearer" ? { token: "fixture-custom-bearer" } : {}) });
      const connected = started.authorizationUrl ? await host.completeMcpAuthorization(temp, { state: remote.authorize(started.authorizationUrl), code: "valid-code", origin: callbackOrigin }) : started;
      assert.equal(connected.tools?.[0]?.name, "echo");
      const restarted = createConnectorMcpHost();
      const answer = await restarted.callMcpConnectionTool(temp, started.connectionId, "echo", { message: "custom-result" });
      assert.deepEqual(answer.content, [{ type: "text", text: "custom-result" }]);
      assert.equal(remote.stats().callCount, 1);
      await assert.rejects(restarted.resolveMcpConnectionToken(temp, started.connectionId, remote.endpoint + "?other=1"), /完整服务地址/);
    } finally { await remote.close(); rmSync(temp, { recursive: true, force: true }); }
  });
}

test("ASC-22 custom MCP rejects credentials in URLs, nonlocal HTTP and substituted preset endpoints", async () => {
  const temp = home(), host = createConnectorMcpHost();
  try {
    for (const endpoint of ["http://192.168.1.5/mcp", "file:///private/mcp", "https://user:secret@example.test/mcp", "https://example.test/mcp?token=private", "https://example.test/mcp#private"]) {
      await assert.rejects(host.startMcpConnection(temp, { serviceId: "mcp-bearer", displayName: "Rejected", endpoint, authentication: "none", origin: callbackOrigin }), { code: "connector.mcp.configuration" });
    }
    await assert.rejects(host.startMcpConnection(temp, { serviceId: "notion", displayName: "Rejected", endpoint: "https://example.test/mcp", origin: callbackOrigin }), /官方地址/);
    assert.deepEqual(withConnectorConnections(temp, store => store.list()), []);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("ASC-12 ASC-14: enabling a Home MCP checks the server and refreshes changed capabilities without running a tool", async () => {
  const temp = home(); let extra = false;
  const remote = await fixture({ tools: () => [
    { name: "echo", inputSchema: { type: "object", properties: { message: { type: "string" } } } },
    ...(extra ? [{ name: "new_tool", inputSchema: { type: "object" as const, properties: {} } }] : []),
  ] });
  const localHost = new MolisWorkLocalHost({ homeDirectory: temp, completeText: null });
  const caller: ActionCallContext = { actor_id: "assistant:check", audience: "agent", project_id: null,
    permissions: [CONNECTOR_MANAGEMENT_READ, CONNECTOR_MANAGEMENT_WRITE, "mcp:external"] };
  try {
    const started = await createConnectorMcpHost().startMcpConnection(temp, { serviceId: "mcp-bearer", displayName: "Refresh fixture",
      endpoint: remote.endpoint, authentication: "none", origin: callbackOrigin });
    const client = localHost.homeActionClient();
    await client.invoke(caller, connectorManagementActions.check, { connection_id: started.connectionId });
    const revision = () => withConnectorConnections(temp, store => store.require(started.connectionId).updated_at);
    await client.invoke(caller, connectorManagementActions.control, { connection_id: started.connectionId, expected_revision: revision(), action: "disable" });
    const before = remote.stats().initializationCount;
    extra = true;
    const enabled = await client.invoke(caller, connectorManagementActions.control, { connection_id: started.connectionId, expected_revision: revision(), action: "enable" }) as { verification: { available: boolean } };
    assert.equal(enabled.verification.available, true);
    assert.ok(remote.stats().initializationCount > before, "enable made a fresh connection check");
    assert.ok((await client.discover(caller)).some(row => row.action.title === "new_tool" && row.availability.available));
    assert.equal(remote.stats().callCount, 0, "refresh does not run business tools");
  } finally { await localHost.close(); await remote.close(); rmSync(temp, { recursive: true, force: true }); }
});


for (const authentication of ["none", "oauth"] as const) test(`S-37 ASC-34: ${authentication} MCP finishing during an intent change stays inactive until the latest decision`, async t => {
  const local = await openTestHome(t), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const remote = await fixture({ oauth: authentication === "oauth", beforeList: async () => { entered.resolve(); await release.promise; } });
  try {
    const caller: ActionCallContext = { actor_id: "intent-user", runtime_session_id: "mcp-intent", audience: "agent", project_id: null,
      permissions: [CONNECTOR_MANAGEMENT_WRITE, CONNECTOR_MANAGEMENT_READ, "mcp:external"] };
    const input = { service_id: "mcp-bearer", method: "mcp", display_name: "Held MCP", expected_revision: null, endpoint: remote.endpoint, authentication, transport: "http" };
    const client = local.host.homeActionClient();
    const request = await client.invoke(caller, connectorSetupAction, input) as { authorization_id: string };
    const start = local.web.post<{ connection_id: string; authorization_url?: string; awaiting_intent?: boolean }>("/api/settings/connectors/methods/mcp/start", { ...input, setup_id: request.authorization_id });
    let completion: Promise<{ awaiting_intent?: boolean }> = start;
    if (authentication === "oauth") {
      const started = await start, state = remote.authorize(started.authorization_url!);
      completion = local.web.post("/api/settings/connectors/methods/mcp/complete", { returned_url: `${local.origin}/api/settings/connectors/methods/mcp/callback?state=${state}&code=valid-code` });
    }
    await entered.promise;
    holdConnectorAuthorizationsForSession(local.home, caller.runtime_session_id!, caller.actor_id, "new-intent");
    release.resolve(); assert.equal((await completion).awaiting_intent, true);
    assert.deepEqual(withConnectorConnections(local.home, store => store.list()), []);
    assert.equal(remote.stats().callCount, 0);
    const result = await client.invoke(caller, connectorSetupIntentAction, { authorization_id: request.authorization_id, intent_revision: "new-intent", decision: "retain" }) as { status: string; connection_id: string };
    assert.equal(result.status, "connected");
    const reference = local.host.connectorMcp!.reference(result.connection_id, connectorMcpCapabilityId(result.connection_id, "echo"));
    assert.ok(reference, "retaining the result refreshes the common capability directory");
    assert.deepEqual(await client.invoke(caller, reference, { message: "Latest intent" }), { content: [{ type: "text", text: "Latest intent" }] });
    assert.equal(remote.stats().callCount, 1);
  } finally { release.resolve(); await remote.close(); }
});

test("ASC-05 ASC-08 ASC-09: protected prepared MCP requests preserve authentication and discover callable tools", async t => {
  for (const authentication of ["none", "bearer", "oauth"] as const) {
    await t.test(authentication, async t => {
      const local = await openTestHome(t), remote = await fixture({ oauth: authentication === "oauth", ...(authentication === "bearer" ? { token: "fixture-private-mcp" } : {}) });
      try {
        const caller: ActionCallContext = { actor_id: "assistant:setup", runtime_session_id: "setup-mcp", audience: "agent", project_id: null, permissions: [CONNECTOR_MANAGEMENT_WRITE, CONNECTOR_MANAGEMENT_READ, "mcp:external"] };
        const input = { service_id: "mcp-bearer", method: "mcp", display_name: "Custom knowledge", expected_revision: null, endpoint: remote.endpoint, authentication, transport: "http" };
        const prepared = await local.host.homeActionClient().invoke(caller, connectorSetupAction, input) as { authorization_id: string; url: string };
        const html = await (await fetch(local.origin + prepared.url)).text();
        assert.match(html, new RegExp(`value="${authentication}" selected`));
        assert.doesNotMatch(html, /fixture-private-mcp/);
        await assert.rejects(local.web.post("/api/settings/connectors/methods/mcp/start", { ...input, endpoint: remote.endpoint + "/changed", setup_id: prepared.authorization_id }), { status: 400 });
        const started = await local.web.post<{ connection_id: string; authorization_id: string; authorization_url?: string }>("/api/settings/connectors/methods/mcp/start", { ...input, setup_id: prepared.authorization_id, ...(authentication === "bearer" ? { token: "fixture-private-mcp" } : {}) });
        assert.equal(started.authorization_id, prepared.authorization_id);
        if (authentication === "oauth") {
          const pendingPage = await (await fetch(local.origin + prepared.url)).text();
          assert.ok(pendingPage.includes(remote.localOrigin + "/authorize"));
          const state = remote.authorize(started.authorization_url!);
          const returned = `${local.origin}/api/settings/connectors/methods/mcp/callback?state=${state}&code=valid-code`;
          await local.web.post("/api/settings/connectors/methods/mcp/complete", { returned_url: returned });
          await assert.rejects(local.web.post("/api/settings/connectors/methods/mcp/complete", { returned_url: returned }), { status: 401 });
        }
        const result = await local.host.homeActionClient().invoke(caller, connectorManagementActions.authorization, { authorization_id: prepared.authorization_id }) as { status: string; connection_id: string };
        assert.equal(result.status, "connected");
        const reference = local.host.connectorMcp!.reference(result.connection_id, connectorMcpCapabilityId(result.connection_id, "echo"));
        assert.ok(reference);
        const called = await local.host.homeActionClient().invoke(caller, reference, { message: "Prepared and actually called" });
        assert.deepEqual(called, { content: [{ type: "text", text: "Prepared and actually called" }] });
        assert.equal(remote.stats().callCount, 1);
        assert.equal(withConnectorConnections(local.home, store => store.list()).length, 1);
      } finally { await remote.close(); }
    });
  }
});

test("ASC-10 ASC-17: a real MCP error reply is a failed business call while a deleted tool sends no new call", async t => {
  const local = await openTestHome(t); let present = true;
  const remote = await fixture({ toolError: true, tools: () => present ? [{ name: "echo", inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] } }] : [] });
  const caller: ActionCallContext = { actor_id: "status-user", audience: "agent", project_id: null, permissions: [CONNECTOR_MANAGEMENT_READ, "mcp:external"] };
  try {
    const started = await local.web.post<{ connection_id: string }>("/api/settings/connectors/methods/mcp/start", { service_id: "mcp-bearer", display_name: "Status MCP", endpoint: remote.endpoint, authentication: "none", transport: "http" });
    const status = async () => {
      const result = await local.host.homeActionClient().invoke(caller, connectorManagementActions.list, {}) as { connections: Array<{ connection_id: string; status: { connectivity: { state: string }; authorization: { service: { state: string } }; last_call?: { outcome: string } } }> };
      return result.connections.find(row => row.connection_id === started.connection_id)!.status;
    };
    assert.equal((await status()).connectivity.state, "connected"); assert.equal((await status()).authorization.service.state, "not-required");
    assert.equal((await status()).last_call, undefined); assert.equal(remote.stats().callCount, 0);
    const ref = local.host.connectorMcp!.reference(started.connection_id, connectorMcpCapabilityId(started.connection_id, "echo"))!;
    await local.host.homeActionClient().invoke(caller, ref, { message: "Business refusal" });
    const failed = (await status()).last_call;
    assert.equal(failed?.outcome, "failed"); assert.equal((await status()).connectivity.state, "connected"); assert.equal(remote.stats().callCount, 1);
    present = false;
    await assert.rejects(local.host.homeActionClient().invoke(caller, ref, { message: "Never sent" }));
    assert.equal(remote.stats().callCount, 1); assert.deepEqual((await status()).last_call, failed);
  } finally { await remote.close(); }
});

for (const sse of [false, true]) test(`ASC-05 ASC-09 ASC-12: prepared anonymous ${sse ? "SSE" : "HTTP"} executes once without a form and leaves the external service running`, async t => {
  const local = await openTestHome(t), remote = await fixture({ sse });
  t.after(() => remote.close());
  const caller: ActionCallContext = { actor_id: "assistant:anonymous", runtime_session_id: "anonymous-setup", audience: "agent", project_id: null,
    permissions: [CONNECTOR_MANAGEMENT_WRITE, CONNECTOR_MANAGEMENT_READ, "mcp:external"] };
  const client = local.host.homeActionClient();
  const prepared = { authorization_id: (await client.invoke(caller, connectorSetupAction, { service_id: "mcp-bearer", method: "mcp", display_name: "Existing service", expected_revision: null,
    endpoint: remote.endpoint, authentication: "none", transport: sse ? "sse" : "http" }) as { authorization_id: string }).authorization_id };
  for (const change of [{ actor_id: "someone-else" }, { runtime_session_id: "other-session" }]) {
    await assert.rejects(client.invoke({ ...caller, ...change }, connectorSetupExecuteAction, prepared), { code: "connector.setup.foreign_request" });
  }
  await assert.rejects(client.invoke({ ...caller, project_id: "other-project" }, connectorSetupExecuteAction, prepared), { code: "actions.scope_mismatch" });
  await assert.rejects(client.invoke({ ...caller, permissions: [] }, connectorSetupExecuteAction, prepared), { code: "actions.forbidden" });
  assert.equal(remote.stats().initializationCount, 0);
  const attempts = await Promise.allSettled([client.invoke(caller, connectorSetupExecuteAction, prepared), client.invoke(caller, connectorSetupExecuteAction, prepared)]);
  assert.ok(attempts.some(item => item.status === "fulfilled"));
  const connected = await client.invoke(caller, connectorManagementActions.authorization, prepared) as { status: string; connection_id: string };
  assert.equal(connected.status, "connected");
  assert.equal(withConnectorConnections(local.home, store => store.list()).length, 1);
  const starts = remote.stats().initializationCount;
  assert.equal((await client.invoke(caller, connectorSetupExecuteAction, prepared) as { connection_id: string }).connection_id, connected.connection_id);
  assert.equal(remote.stats().initializationCount, starts);
  const reference = local.host.connectorMcp!.reference(connected.connection_id, connectorMcpCapabilityId(connected.connection_id, "echo"))!;
  assert.deepEqual(await client.invoke(caller, reference, { message: "Read through the real directory" }), { content: [{ type: "text", text: "Read through the real directory" }] });
  assert.equal(remote.stats().callCount, 1);
  await local.close(); await local.host.close();
  const restarted = new MolisWorkLocalHost({ homeDirectory: local.home });
  try {
    assert.deepEqual(await restarted.homeActionClient().invoke(caller, reference, { message: "Restored connection" }), { content: [{ type: "text", text: "Restored connection" }] });
    const revision = () => withConnectorConnections(local.home, store => store.require(connected.connection_id).updated_at);
    await restarted.homeActionClient().invoke(caller, connectorManagementActions.control, { connection_id: connected.connection_id, expected_revision: revision(), action: "disable" });
    await assert.rejects(restarted.homeActionClient().invoke(caller, reference, { message: "Must not be sent" }));
    assert.equal(remote.stats().callCount, 2);
  } finally { await restarted.close(); }
  assert.equal((await fetch(remote.localOrigin)).status, 405, "the external service remains available after Host shutdown and disable");
});

for (const interruption of ["cancel", "revoke", "close", "hold"] as const) test(`S-37 ASC-35: anonymous setup ${interruption} during discovery never activates a late connection`, async t => {
  const local = await openTestHome(t), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const remote = await fixture({ beforeList: async () => { entered.resolve(); await release.promise; } });
  t.after(() => remote.close());
  let granted = true;
  const caller: ActionCallContext = { actor_id: "assistant:anonymous", runtime_session_id: "anonymous-setup", audience: "agent", project_id: null,
    permissions: [CONNECTOR_MANAGEMENT_WRITE, CONNECTOR_MANAGEMENT_READ], assert_authority_current: () => { if (!granted) throw new Error("test grant revoked"); } };
  const client = local.host.homeActionClient();
  const prepared = { authorization_id: (await client.invoke(caller, connectorSetupAction, { service_id: "mcp-bearer", method: "mcp", display_name: "Interrupted service", expected_revision: null,
    endpoint: remote.endpoint, authentication: "none", transport: "http" }) as { authorization_id: string }).authorization_id };
  const executing = client.invoke(caller, connectorSetupExecuteAction, prepared);
  const settled = Promise.allSettled([executing]);
  await entered.promise;
  let closing: Promise<void> | undefined;
  if (interruption === "cancel") await client.invoke(caller, connectorManagementActions.cancel, prepared);
  if (interruption === "revoke") granted = false;
  if (interruption === "close") closing = local.host.close();
  if (interruption === "hold") holdConnectorAuthorizationsForSession(local.home, caller.runtime_session_id!, caller.actor_id, "latest-request");
  release.resolve();
  const result = (await settled)[0]!;
  if (closing) await closing;
  assert.equal(result.status, interruption === "hold" ? "fulfilled" : "rejected");
  assert.deepEqual(withConnectorConnections(local.home, store => store.list()), []);
  assert.equal(remote.stats().callCount, 0);
  if (interruption === "hold") {
    const status = connectorAuthorizationStatus(local.home, prepared.authorization_id)!;
    assert.equal(status.commit_held, true); assert.equal(status.completion_ready, true);
    await client.invoke(caller, connectorSetupIntentAction, { ...prepared, intent_revision: "latest-request", decision: "cancel" });
    assert.equal(connectorAuthorizationStatus(local.home, prepared.authorization_id)?.status, "cancelled");
  }
});

test("S-37 ASC-08 ASC-14: anonymous execution does not collect credentials or release a held plan", async t => {
  const local = await openTestHome(t), remote = await fixture();
  t.after(() => remote.close());
  const caller: ActionCallContext = { actor_id: "assistant:anonymous", runtime_session_id: "anonymous-setup", audience: "agent", project_id: null,
    permissions: [CONNECTOR_MANAGEMENT_WRITE, CONNECTOR_MANAGEMENT_READ] };
  const client = local.host.homeActionClient();
  for (const method of ["token", "oauth", "cli", "mcp"] as const) {
    const prepared = { authorization_id: (await client.invoke(caller, connectorSetupAction, { service_id: "github", method, display_name: method, expected_revision: null,
      ...(method === "mcp" ? { authentication: "bearer" } : {}) }) as { authorization_id: string }).authorization_id };
    assert.deepEqual(await client.invoke(caller, connectorSetupExecuteAction, prepared), { status: "needs_person", ...prepared, url: `/capabilities/connections?setup=${prepared.authorization_id}` });
    await assert.rejects(client.invoke(caller, connectorSetupExecuteAction, { authorization_id: prepared.authorization_id, token: "forbidden-input-value" }), { code: "actions.input_invalid" });
  }
  const prepared = { authorization_id: (await client.invoke(caller, connectorSetupAction, { service_id: "mcp-bearer", method: "mcp", display_name: "Held anonymous", expected_revision: null,
    endpoint: remote.endpoint, authentication: "none", transport: "http" }) as { authorization_id: string }).authorization_id };
  holdConnectorAuthorizationsForSession(local.home, caller.runtime_session_id!, caller.actor_id, "latest-request");
  assert.equal((await client.invoke(caller, connectorSetupExecuteAction, prepared) as { awaiting_intent: boolean }).awaiting_intent, true);
  assert.equal(remote.stats().initializationCount, 0);
  assert.deepEqual(withConnectorConnections(local.home, store => store.list()), []);
});

// RAC-2416: `constructor` and `__proto__` are not official MCP services; the prototype chain must not answer for the server table, and
// starting a connection under them is refused exactly as an unregistered service is (the host already imports this module).
test("RAC-2416 a service id that names a prototype member has no official MCP address", async () => {
  const host = createConnectorMcpHost(), directory = home();
  const refusal = async (serviceId: string) => {
    const error = await host.startMcpConnection(directory, { serviceId, displayName: "Prototype" }).then(() => null, (failure: unknown) => failure);
    assert.ok(error instanceof ActionError, `an ActionError, not ${String(error)}`);
    return { code: error.code, message: error.message };
  };
  try {
    const missing = await refusal("no-such-service");
    assert.deepEqual(await refusal("constructor"), missing);
    assert.deepEqual(await refusal("__proto__"), missing);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
