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
import { createConnectorMcpHost, MCP_SERVERS } from "../apps/local-host/src/connector-mcp.ts";
import { withConnectorConnections } from "../apps/local-host/src/connector-connection-store.ts";
import { connectorProtocolSecrets, withConnectorProtocols } from "../apps/local-host/src/connector-protocol-store.ts";

async function body(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
function home() { return mkdtempSync(join(tmpdir(), "molis-mcp-test-")); }
const callbackOrigin = "http://localhost:19357";

async function fixture(options: { token?: string; oauth?: boolean; sse?: boolean; fail?: boolean; slow?: boolean } = {}) {
  let enterCall!: () => void, releaseCall!: () => void;
  const called = new Promise<void>(resolve => { enterCall = resolve; });
  const release = new Promise<void>(resolve => { releaseCall = resolve; });
  let origin = "";
  let expectedToken = options.token;
  let challenge = "";
  let refreshCount = 0;
  let callCount = 0;
  let initializationCount = 0;
  let authClient = "";
  const authorizationHeaders: string[] = [];
  const sessions = new Set<Server>();
  const sseTransports = new Map<string, SSEServerTransport>();
  const makeServer = () => {
    const server = new Server({ name: "fixture-mcp", version: "1.0.0" }, { capabilities: { tools: {}, resources: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: "echo", description: "Echo an explicit input", inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] } }] }));
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [{ uri: "fixture://readme", name: "Readme" }] }));
    server.setRequestHandler(CallToolRequestSchema, async request => { callCount++; enterCall(); if (options.slow) await release; return { content: [{ type: "text", text: String(request.params.arguments?.message) }] }; });
    server.setRequestHandler(ReadResourceRequestSchema, async request => ({ contents: [{ uri: request.params.uri, text: "Actual MCP resource", mimeType: "text/plain" }] }));
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
      if (parsed.method === "initialize") initializationCount++;
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
    stats: () => ({ refreshCount, callCount, initializationCount, authClient, authorizationHeaders }),
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
