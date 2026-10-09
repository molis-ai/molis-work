import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { once } from "node:events";
import test from "node:test";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createPrologueNodeAdapter, AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";
import { createConnectorMcpHost, MCP_SERVERS } from "../apps/local-host/src/connector-mcp.ts";
import { createAgentConnectorPorts } from "../apps/local-host/src/agent-connector-ports.ts";
import { connectorAuthorizationStatus } from "../apps/local-host/src/connector-authorization-status.ts";
import { withConnectorConnections } from "../apps/local-host/src/connector-connection-store.ts";
import { connectorProtocolSecrets, withConnectorProtocols } from "../apps/local-host/src/connector-protocol-store.ts";
import { connectorMcpCapabilityId, connectorMcpResourceCapabilityId, createConnectorMcpDirectory, type ConnectorMcpTool } from "../apps/local-host/src/connector-mcp-actions.ts";
import { MolisWorkLocalHost } from "../apps/local-host/src/project-host.ts";
import { isMcpToolCapability } from "../apps/local-host/src/mcp-tool-actions.ts";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { authorizeMcpActions } from "../apps/local-host/src/mcp-action-client.js";
import { createMcpActionGrant } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";

async function body(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
function home() { return mkdtempSync(join(tmpdir(), "molis-mcp-test-")); }
const callbackOrigin = "http://localhost:19357";

type FixtureTool = { name: string; description?: string; inputSchema: { type: "object"; [key: string]: unknown } };
async function fixture(options: { token?: string; oauth?: boolean; sse?: boolean; fail?: boolean; slow?: boolean;
  beforeList?(): void | Promise<void>; beforeInitialize?(): void | Promise<void>; tools?(): FixtureTool[] } = {}) {
  let enterCall!: () => void, releaseCall!: () => void;
  const called = new Promise<void>(resolve => { enterCall = resolve; });
  const release = new Promise<void>(resolve => { releaseCall = resolve; });
  let origin = "";
  let expectedToken = options.token;
  let challenge = "";
  let refreshCount = 0;
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
    server.setRequestHandler(CallToolRequestSchema, async request => { callCount++; enterCall(); if (options.slow) await release; return { content: [{ type: "text", text: String(request.params.arguments?.message) }] }; });
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
  origin = `http://127.0.0.1:${address.port}`;
  return {
    endpoint: `${origin}/mcp`, called, releaseCall,
    authorize(url: string) { const params = new URL(url).searchParams; challenge = params.get("code_challenge") ?? ""; assert.equal(params.get("code_challenge_method"), "S256"); return params.get("state")!; },
    rejectCurrentToken() { expectedToken = "server-invalidated-token"; },
    stats: () => ({ refreshCount, callCount, readCount, initializationCount, authClient, authorizationHeaders }),
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
    await assert.rejects(host.inspectMcpConnection(temp, result.connectionId), /已断开/);
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
    await assert.rejects(host.startMcpConnection(temp, { serviceId: "github", displayName: "Other", endpoint: "https://attacker.example/mcp", token: "mcp-bearer-secret", origin: callbackOrigin }), /官方地址/);
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

test("official Lark MCP stdio transport discovers and calls tools with environment credentials", async () => {
  const temp = home(), priorPath = process.env.PATH;
  const script = fileURLToPath(new URL("./fixtures/connector-stdio-server.ts", import.meta.url));
  const tsx = import.meta.resolve("tsx");
  writeFileSync(join(temp, "npx"), `#!${process.execPath}\nconst {spawnSync}=require('node:child_process'); const child=spawnSync(process.execPath,['--import',${JSON.stringify(tsx)},${JSON.stringify(script)}],{stdio:'inherit',env:process.env}); process.exit(child.status??1);`, { mode: 0o755 });
  process.env.PATH = `${temp}:${priorPath}`;
  try {
    const host = createConnectorMcpHost();
    const connected = await host.startMcpConnection(temp, { serviceId: "feishu", displayName: "Tenant", clientId: "fixture-app", clientSecret: "fixture-secret", origin: callbackOrigin });
    assert.equal(connected.tools?.[0]?.name, "read");
    const result = await host.callMcpConnectionTool(temp, connected.connectionId, "read", {});
    assert.match(JSON.stringify(result), /actual stdio response/u);
    assert.doesNotMatch(JSON.stringify(connected), /fixture-secret/u);
    withConnectorConnections(temp, store => store.disconnect(connected.connectionId));
    await assert.rejects(host.inspectMcpConnection(temp, connected.connectionId), /断开/u);
  } finally { process.env.PATH = priorPath; rmSync(temp, { recursive: true, force: true }); }
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
