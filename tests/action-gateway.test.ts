import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import http from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { isRuntimeContextMcpTool, molisWorkActionToolName } from "@molis-ai/molis-work-app-mcp";
import { newCallId, recordedCallId, withCallId } from "@molis-ai/molis-work-kernel";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalMcpServer, MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { LocalActionGatewayClient, ACTION_GATEWAY_PATH, actionGatewayHomeId } from "../apps/local-host/dist/action-gateway.js";
import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { serveTestHost } from "./fixtures/test-home.js";

const save: ActionDefinition<{ text: string }, { saved: number }> = { capability_id: "unknown.gateway.save", version: 1, operation: "command", action: {
  title: "Save note", description: "Persistent fixture note", kind: "operation", scope: "project", audiences: ["mcp"], permissions: ["notes:write"], subject_kinds: [],
  input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
  output_schema: { type: "object", properties: { saved: { type: "integer" } }, required: ["saved"], additionalProperties: false } } };

test("official MCP process uses the shared Host registry and durable writes with fresh grants, exact Home, project and instance", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "action-gateway-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const served = await serveTestHost(t, { home, host });
  const project = await served.createProject("Gateway");
  const reference = project.reference;
  const caller: ActionCallContext = { actor_id: "runtime:gateway", project_id: project.project_id, audience: "mcp", permissions: [] };
  let enter: (() => void) | undefined, release: (() => void) | undefined, barrier: Promise<void> | undefined;
  let cancelled: (() => void) | undefined, finished: (() => void) | undefined;
  await host.withProject(reference, runtime => {
    runtime.store.db.exec("CREATE TABLE gateway_notes (actor TEXT NOT NULL, text TEXT NOT NULL)");
    host.actionRegistry(reference).registerProvider({ provider: { provider_id: "unknown-gateway", title: "Unknown", kind: "plugin", plugin_id: "io.molis.work.example.gateway" },
      definitions: [save], handlers: [{ ...save, handle: async (context, input) => {
        try {
          context.signal?.addEventListener("abort", () => cancelled?.(), { once: true });
          if (barrier) { enter!(); await barrier; }
          await context.validate_authority?.({ ...save, provider_id: "unknown-gateway" });
          runtime.store.db.prepare("INSERT INTO gateway_notes VALUES (?, ?)").run(context.actor_id, (input as { text: string }).text);
          return { saved: Number((runtime.store.db.prepare("SELECT count(*) AS n FROM gateway_notes").get() as { n: number }).n) };
        } finally { finished?.(); }
      } }] });
  });
  const origin = served.origin;
  const gateway = new LocalActionGatewayClient({ url: origin, homeDirectory: home, clientId: caller.actor_id, projectId: project.project_id });
  const sdk = new Client({ name: "untrusted-name", version: "1" });
  await withCatalog({ homeDirectory: home }, catalog => catalog.bindRuntimeContext({
    context: { runtime_id: "gateway", stable_work_context_id: "gateway-session", host_declares_stable: true },
    project_id: project.project_id, actor_id: "user", user_confirmed: true,
  }));
  const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx",
    fileURLToPath(new URL("../apps/desktop/launchers/mcp/server.ts", import.meta.url))], env: {
      ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      MOLIS_WORK_HOME: home, MOLIS_WORK_RUNTIME_ID: "gateway", MOLIS_WORK_WEB_URL: origin,
      MOLIS_WORK_WORK_CONTEXT_ID: "gateway-session", MOLIS_WORK_WORK_CONTEXT_STABLE: "true",
    }, stderr: "pipe" });
  let errors = ""; transport.stderr?.on("data", chunk => { errors += String(chunk); });
  const rows = () => host.withProject(reference, runtime => runtime.store.db.prepare("SELECT actor, text FROM gateway_notes").all());
  try {
    await sdk.connect(transport).catch(error => { throw new Error(String(error) + errors); });
    const name = molisWorkActionToolName(save);
    assert.equal((await sdk.listTools()).tools.some(tool => tool.name === name), false);
    const view = (await host.inspectActions(caller, reference)).find(view => view.capability_id === save.capability_id)!;
    await served.grant(caller.actor_id, caller.project_id, [view]);
    assert.ok((await sdk.listTools()).tools.some(tool => tool.name === name));
    const result = await sdk.callTool({ name, arguments: { text: "real cross-process note" } });
    assert.equal(result.isError, false, JSON.stringify(result)); assert.deepEqual(result.structuredContent, { saved: 1 });
    assert.deepEqual(await rows(), [{ actor: caller.actor_id, text: "real cross-process note" }]);
    assert.equal((await sdk.callTool({ name, arguments: { text: "forged", actor_id: "user" } })).isError, true);
    await gateway.discover(caller);
    const entered = new Promise<void>(resolve => { enter = resolve; }); barrier = new Promise<void>(resolve => { release = resolve; });
    const pending = assert.rejects(gateway.invoke(caller, view, { text: "revoked during wait" }), { code: "mcp.action_revoked" });
    await entered; await served.revoke(caller.actor_id, caller.project_id, [view]); release!(); await pending; barrier = undefined;
    assert.equal((await rows()).length, 1);
    await assert.rejects(gateway.invoke({ ...caller, permissions: ["notes:write"] }, view, { text: "cannot self grant" }));
    assert.equal((await rows()).length, 1);
    await served.grant(caller.actor_id, caller.project_id, [view]);
    const controller = new AbortController();
    const cancellationEntered = new Promise<void>(resolve => { enter = resolve; });
    const remoteCancelled = new Promise<void>(resolve => { cancelled = resolve; });
    const remoteFinished = new Promise<void>(resolve => { finished = resolve; });
    barrier = new Promise<void>(resolve => { release = resolve; });
    const cancelCall = assert.rejects(gateway.invoke({ ...caller, signal: controller.signal }, view, { text: "cancelled" }), /cancelled by fixture/);
    await cancellationEntered; controller.abort(new Error("cancelled by fixture")); await remoteCancelled; release!();
    await Promise.all([cancelCall, remoteFinished]); barrier = undefined; finished = undefined;
    assert.equal((await rows()).length, 1);
    // Calls still go through the gateway URL; in one process the server shares the resident Host (one Runtime owner per Home).
    const formal = new LocalMcpServer(withCatalog, "runtime", { projectId: project.project_id,
      databasePath: project.database_path, webBaseUrl: origin }, {
      homeDirectory: home, webBaseUrl: origin, runtimeContext: { runtime_id: "gateway", stable_work_context_id: null, host_declares_stable: false },
    }, host, origin);
    const scopeEntered = new Promise<void>(resolve => { enter = resolve; });
    const scopeCancelled = new Promise<void>(resolve => { cancelled = resolve; });
    const scopeFinished = new Promise<void>(resolve => { finished = resolve; });
    barrier = new Promise<void>(resolve => { release = resolve; });
    const scopedCall = assert.rejects(formal.callTool(name, { text: "old connection" }), /连接已变化/);
    await scopeEntered; formal.runtimeConnection = null;
    await scopeCancelled; release!(); await Promise.all([scopedCall, scopeFinished]);
    barrier = undefined; finished = undefined; await formal.close();
    assert.equal((await rows()).length, 1, "changing the MCP project cancels remote writes at their checkpoint");
    const stranger = new LocalActionGatewayClient({ url: origin, homeDirectory: home, clientId: "runtime:stranger", projectId: project.project_id });
    const otherCaller = { ...caller, actor_id: "runtime:stranger", permissions: ["notes:write"] };
    assert.equal((await stranger.discover(otherCaller)).some(row => row.capability_id === save.capability_id), false);
    await assert.rejects(stranger.invoke(otherCaller, view, { text: "not authorized" }));
    const otherProject = await served.createProject("Other");
    const otherScope = { ...caller, project_id: otherProject.project_id };
    const otherGateway = new LocalActionGatewayClient({ url: origin, homeDirectory: home, clientId: caller.actor_id, projectId: otherProject.project_id });
    assert.equal((await otherGateway.discover(otherScope)).some(row => row.capability_id === save.capability_id), false);
    await assert.rejects(otherGateway.invoke(otherScope, view, { text: "different project" }));
    assert.equal((await rows()).length, 1);
    const token = (await readFile(join(home, "config/web-control-token"), "utf8")).trim();
    const wrongHome = new LocalActionGatewayClient({ url: origin, homeDirectory: home + "-other", controlToken: token, clientId: caller.actor_id, projectId: project.project_id });
    await assert.rejects(wrongHome.discover(caller), { code: "actions.home_mismatch" });
    const send = (body: unknown, authorized = true) => fetch(origin + ACTION_GATEWAY_PATH, { method: "POST", headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(), ...(authorized ? { "x-molis-work-control-token": token } : {}) }, body: JSON.stringify(body) });
    const envelope = { home_id: actionGatewayHomeId(home), client_id: caller.actor_id, project_id: project.project_id };
    assert.equal((await send({ ...envelope, operation: "discover" }, false)).status, 403);
    assert.equal((await send({ ...envelope, operation: "discover", permissions: ["notes:write"] })).status, 400);
    assert.equal((await send({ ...envelope, operation: "discover", audit_actor_id: "web-user" })).status, 400);
    assert.equal((await send({ ...envelope, operation: "discover", client_id: "user", runtime_session_id: "forged" })).status, 400);
    await assert.rejects(gateway.discover({ ...caller, audit_actor_id: "web-user" }), { code: "actions.scope_mismatch" });
    assert.equal((await send([])).status, 400);
    const invalidJson = await fetch(origin + ACTION_GATEWAY_PATH, { method: "POST", headers: {
      origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(), "x-molis-work-control-token": token,
    }, body: "{" });
    assert.equal(invalidJson.status, 400);
    assert.equal((await invalidJson.json() as { code: string }).code, "actions.input_invalid");
    const stale = await send({ ...envelope, operation: "invoke", instance_id: "old-host", call_id: randomUUID(), capability: view, input: { text: "old" } });
    assert.equal((await stale.json() as any).code, "actions.host_replaced");
    await host.closeProject(reference);
    assert.equal((await rows()).length, 1, "durable data survives runtime reopening");
  } finally { release?.(); await sdk.close(); await served.close(); await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("gateway never retries an uncertain invocation or follows a credential-bearing redirect", { timeout: 15_000 }, async () => {
  let invocations = 0, redirected = 0, redirect = false;
  const target = http.createServer((_request, response) => { redirected++; response.end("unexpected"); });
  await new Promise<void>(resolve => target.listen(0, "127.0.0.1", resolve));
  const targetAddress = target.address(); assert.ok(targetAddress && typeof targetAddress === "object");
  const server = http.createServer(async (request, response) => {
    if (redirect) { response.writeHead(302, { location: `http://127.0.0.1:${targetAddress.port}/secret` }); response.end(); return; }
    const chunks = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (body.operation === "discover") { response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ instance_id: "one", actions: [] })); }
    else { invocations++; response.destroy(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const client = new LocalActionGatewayClient({ url: `http://127.0.0.1:${address.port}`, homeDirectory: "/fixture", controlToken: "fixture-token", clientId: "fixture", projectId: null });
  const caller: ActionCallContext = { actor_id: "fixture", project_id: null, audience: "mcp", permissions: [] };
  try {
    await client.discover(caller);
    await assert.rejects(client.invoke(caller, save, { text: "once" }), { code: "actions.delivery_unknown" });
    assert.equal(invocations, 1);
    redirect = true;
    await assert.rejects(client.discover(caller), { code: "actions.service_unavailable" });
    assert.equal(redirected, 0);
  } finally { await Promise.all([server, target].map(server => new Promise<void>(resolve => server.close(() => resolve())))); }
});

/** A service of the gateway's shape on a loopback port, answering as `mode` says; it records what each request carried. */
async function fixtureService() {
  const seen: Array<{ method?: string; url?: string; headers: http.IncomingHttpHeaders; body: Record<string, unknown> }> = [];
  /** `echo`: whether the reply to an invocation names the number it was sent (the Host left a row), another number, or none. */
  const state: { mode: "ok" | "garbled" | "array"; echo: "none" | "same" | "other"; denied: boolean } = { mode: "ok", echo: "none", denied: false };
  const server = http.createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    seen.push({ method: request.method, url: request.url, headers: request.headers, body });
    if (state.mode === "garbled") { response.end("<html>not the system service</html>"); return; }
    response.setHeader("content-type", "application/json");
    if (state.mode === "array") { response.end("[]"); return; }
    const named = state.echo === "same" ? { call_id: body.call_id } : state.echo === "other" ? { call_id: "11111111-2222-4333-8444-555555555555" } : {};
    if (state.denied && body.operation === "invoke") { response.statusCode = 403; response.end(JSON.stringify({ code: "actions.forbidden", error: "denied by fixture", ...named })); return; }
    response.end(JSON.stringify(body.operation === "discover" ? { instance_id: "one", actions: [] } : { instance_id: "one", result: { saved: 1 }, ...named }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const stop = async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); };
  const client = new LocalActionGatewayClient({ url: origin, homeDirectory: "/fixture", controlToken: "fixture-token", clientId: "fixture", projectId: null });
  const caller: ActionCallContext = { actor_id: "fixture", project_id: null, audience: "mcp", permissions: [] };
  return { seen, state, origin, stop, client, caller };
}

test("gateway sends every call as the one request to the resident Host: its origin, the Home's token, a fresh one-time key", { timeout: 15_000 }, async () => {
  const { seen, origin, stop, client, caller } = await fixtureService();
  try {
    await client.discover(caller);
    assert.deepEqual(await client.invoke(caller, save, { text: "a" }), { saved: 1 });
    await client.invoke(caller, save, { text: "b" });
    assert.equal(seen.length, 3);
    for (const request of seen) {
      assert.equal(request.method, "POST"); assert.equal(request.url, ACTION_GATEWAY_PATH);
      assert.equal(request.headers.origin, origin, "the request is the Host's own origin");
      assert.equal(request.headers["x-molis-work-control-token"], "fixture-token");
      assert.equal(request.headers["content-type"], "application/json");
      assert.equal(request.body.home_id, actionGatewayHomeId("/fixture"));
    }
    assert.equal(new Set(seen.map(request => request.headers["x-molis-work-idempotency-key"])).size, 3, "a fresh one-time key for every request");
  } finally { await stop(); }
});

test("gateway: a reply that never completes leaves an invocation unknown, and a discovery (which changes nothing) with no service to use", { timeout: 15_000 }, async () => {
  const { state, stop, client, caller } = await fixtureService();
  try {
    await client.discover(caller);
    state.mode = "garbled";
    await assert.rejects(client.discover(caller), { code: "actions.service_unavailable" });
    await assert.rejects(client.invoke(caller, save, { text: "c" }), { code: "actions.delivery_unknown", message: /请核对原结果，不会自动重试/ });
  } finally { await stop(); }
});

test("gateway: an answer that is not a JSON object leaves an invocation unknown, as one that never completes does", { timeout: 15_000 }, async () => {
  const { state, stop, client, caller } = await fixtureService();
  try {
    await client.discover(caller);
    state.mode = "array";
    await assert.rejects(client.invoke(caller, save, { text: "d" }), { code: "actions.delivery_unknown", message: /请核对原结果，不会自动重试/ });
    await assert.rejects(client.discover(caller), { code: "actions.service_unavailable" });
  } finally { await stop(); }
});

test("gateway: an input that cannot be serialized was never sent, so it is the caller's error and not an uncertain delivery", { timeout: 15_000 }, async () => {
  const { seen, stop, client, caller } = await fixtureService();
  try {
    await client.discover(caller);
    const before = seen.length;
    const circular: Record<string, unknown> = {}; circular.self = circular;
    const unserializable: Array<[string, unknown]> = [["a cycle", circular], ["a BigInt", { n: 10n }], ["a toJSON that throws", { toJSON() { throw new Error("toJSON refused"); } }]];
    for (const [what, input] of unserializable) {
      await assert.rejects(client.invoke(caller, save, input), (error: unknown) => {
        assert.ok(error instanceof Error, what);
        assert.equal((error as { code?: string }).code, undefined, `${what} is the serializer's own error, not a code that says the call may have run`);
        return true;
      }, what);
    }
    assert.equal(seen.length, before, "nothing was sent");
    assert.deepEqual(await client.invoke(caller, save, { text: "after" }), { saved: 1 }, "the next call goes out as usual");
  } finally { await stop(); }
});

test("gateway: no control token in the Home sends nothing, and a service that is gone was not delivered to, for an invocation too", { timeout: 15_000 }, async () => {
  const { seen, origin, stop, client, caller } = await fixtureService();
  const home = await mkdtemp(join(tmpdir(), "action-gateway-request-"));
  try {
    await client.discover(caller);
    const tokenless = new LocalActionGatewayClient({ url: origin, homeDirectory: home, clientId: "fixture", projectId: null });
    const before = seen.length;
    await assert.rejects(tokenless.discover(caller), { code: "actions.service_unavailable" });
    assert.equal(seen.length, before, "nothing was sent");

    // Nothing listens any more: the connection is refused before the request leaves, so the invocation was not delivered.
    await stop();
    await assert.rejects(client.discover(caller), { code: "actions.service_unavailable" });
    await assert.rejects(client.invoke(caller, save, { text: "e" }), { code: "actions.service_unavailable" });
  } finally { await stop(); await rm(home, { recursive: true, force: true }); }
});

test("gateway rejects non-loopback destinations before reading a credential or making a request", () => {
  for (const url of ["https://127.0.0.1", "http://localhost:4173", "http://example.invalid", "http://127.0.0.1/path", "http://user:pass@127.0.0.1",
    // security invariant S-09: a query string or fragment, other spellings of "this machine" and look-alike names are refused as well
    "http://127.0.0.1:4173/?x=1", "http://127.0.0.1:4173/#x", "http://user@127.0.0.1:4173", "http://0.0.0.0:4173", "http://[::]:4173", "http://[::ffff:127.0.0.1]:4173", "http://127.0.0.1.evil.example:4173",
    "http://localhost.:4173", "ws://127.0.0.1:4173", "ftp://127.0.0.1"]) {
    assert.throws(() => new LocalActionGatewayClient({ url, homeDirectory: "/unused", clientId: "fixture", projectId: null }), { code: "actions.transport_invalid" }, url);
  }
  for (const url of ["http://127.0.0.1:4173", "http://127.0.0.1:4173/", "http://[::1]:4173"]) {
    assert.doesNotThrow(() => new LocalActionGatewayClient({ url, homeDirectory: "/unused", clientId: "fixture", projectId: null }), url);
  }
});


test("RAC-105-A-09: production stdio lists context tools offline and refuses them without a local business fallback", { timeout: 20_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "action-gateway-offline-"));
  const sdk = new Client({ name: "offline-fixture", version: "1" });
  const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx",
    fileURLToPath(new URL("../apps/desktop/launchers/mcp/server.ts", import.meta.url))],
    env: { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      MOLIS_WORK_HOME: home, MOLIS_WORK_RUNTIME_ID: "offline-fixture", MOLIS_WORK_WEB_URL: "http://127.0.0.1:1" }, stderr: "pipe" });
  let errors = ""; transport.stderr?.on("data", chunk => { errors += String(chunk); });
  try {
    await sdk.connect(transport).catch(error => { throw new Error(String(error) + errors); });
    const tools = (await sdk.listTools()).tools;
    assert.ok(tools.some(tool => tool.name === "molis_work_v1_context_resolve"));
    assert.ok(tools.every(tool => isRuntimeContextMcpTool(tool.name)));
    const result = await sdk.callTool({ name: "molis_work_v1_context_resolve", arguments: {} });
    assert.equal(result.isError, true, JSON.stringify(result));
    assert.match(JSON.stringify(result), /actions.service_unavailable/);
    const create = await sdk.callTool({ name: "molis_work_v1_context_create_and_bind", arguments: {
      display_name: "Must not be created offline", user_confirmed: true, idempotency_key: "offline-create",
    } });
    assert.equal(create.isError, true);
    assert.match(JSON.stringify(create), /actions.service_unavailable/);
    const unavailable = await sdk.callTool({ name: molisWorkActionToolName(save), arguments: { text: "offline" } });
    assert.equal(unavailable.isError, true);
    assert.match(JSON.stringify(unavailable), /actions.service_unavailable/);
    assert.deepEqual(await readdir(home), [], "listing and refused calls create no Catalog, SDK, owner or business files");
  } finally { await sdk.close(); await rm(home, { recursive: true, force: true }); }
});

/** W3-01 D. The MCP process makes the number of an operation; the resident Host writes the rows under it and says so in its reply. */
const CALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test("W3-01 D gateway: an invocation carries the number of its operation and a discovery none; the number is shown only when the Host's reply names it", { timeout: 15_000 }, async () => {
  const { seen, state, stop, client, caller } = await fixtureService();
  const shown = (id: string, run: () => Promise<unknown>) => withCallId(id, async () => { await run().catch(() => undefined); return recordedCallId(); });
  try {
    await client.discover(caller);
    assert.equal(Object.hasOwn(seen[0]!.body, "call_id"), false, "a discovery is not an operation of its own");
    const id = newCallId();
    assert.equal(await shown(id, () => client.invoke(caller, save, { text: "a" })), undefined, "the Host left no row, so there is no number to show");
    assert.equal(seen[1]!.body.call_id, id, "the request carries the number of the operation that is open");
    state.echo = "same";
    assert.equal(await shown(id, () => client.invoke(caller, save, { text: "b" })), id, "the Host left a row and named this number");
    state.denied = true;
    assert.equal(await shown(id, () => client.invoke(caller, save, { text: "c" })), id, "a refusal that left a row is shown as well");
    state.denied = false;
    state.echo = "other";
    assert.equal(await shown(id, () => client.invoke(caller, save, { text: "d" })), undefined, "a number this process never sent is not taken");
    state.echo = "none";
    await client.invoke(caller, save, { text: "e" }); await client.invoke(caller, save, { text: "f" });
    const loose = seen.slice(-2).map(request => request.body.call_id);
    for (const value of loose) assert.match(String(value), CALL_ID);
    assert.notEqual(loose[0], loose[1], "outside any operation each invocation has a number of its own");
    const explicit = newCallId();
    await withCallId(id, () => client.invoke({ ...caller, call_id: explicit }, save, { text: "g" }));
    assert.equal(seen.at(-1)!.body.call_id, explicit, "a number the caller's context names wins over the open operation");
  } finally { await stop(); }
});

/** A resident Host with a command and a read of one plugin, an MCP client granted both, and the Host's log to look at. */
async function residentCallIdFixture() {
  const home = await mkdtemp(join(tmpdir(), "action-gateway-call-id-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const served = await serveTestHost(null, { home, host });
  const project = await served.createProject("Call id");
  const reference = project.reference;
  const caller: ActionCallContext = { actor_id: "runtime:call-id", project_id: project.project_id, audience: "mcp", permissions: [] };
  const look: ActionDefinition<Record<string, never>, { seen: number }> = { capability_id: "unknown.gateway.look", version: 1, operation: "query", action: {
    title: "Look at notes", description: "Persistent fixture read", kind: "query", scope: "project", audiences: ["mcp"], permissions: ["notes:read"], subject_kinds: [],
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    output_schema: { type: "object", properties: { seen: { type: "integer" } }, required: ["seen"], additionalProperties: false } } };
  let ran = 0;
  await host.withProject(reference, () => {
    host.actionRegistry(reference).registerProvider({ provider: { provider_id: "unknown-gateway", title: "Unknown", kind: "plugin", plugin_id: "io.molis.work.example.gateway" },
      definitions: [save, look], handlers: [{ ...save, handle: async () => { ran++; return { saved: ran }; } }, { ...look, handle: async () => ({ seen: ran }) }] });
  });
  const origin = served.origin;
  const views = await host.inspectActions(caller, reference);
  const saveView = views.find(view => view.capability_id === save.capability_id)!, lookView = views.find(view => view.capability_id === look.capability_id)!;
  await served.grant(caller.actor_id, caller.project_id, [saveView, lookView]);
  const gateway = new LocalActionGatewayClient({ url: origin, homeDirectory: home, clientId: caller.actor_id, projectId: project.project_id });
  const token = served.controlToken;
  const send = (body: unknown) => fetch(origin + ACTION_GATEWAY_PATH, { method: "POST", body: JSON.stringify(body), headers: {
    origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(), "x-molis-work-control-token": token } });
  const envelope = { home_id: actionGatewayHomeId(home), client_id: caller.actor_id, project_id: project.project_id };
  const stop = async () => { await served.close(); await host.close(); await rm(home, { recursive: true, force: true }); };
  return { host, caller, gateway, saveView, lookView, send, envelope, stop, ran: () => ran };
}

test("W3-01 D through the gateway the rows of the resident Host carry the number the MCP process made, and it is shown only for an operation that left a row", { timeout: 30_000 }, async () => {
  const { host, caller, gateway, saveView, lookView, stop } = await residentCallIdFixture();
  const inOperation = (id: string, run: () => Promise<unknown>) => withCallId(id, async () => { await run().catch(() => undefined); return recordedCallId(); });
  try {
    await gateway.discover(caller);
    const written = newCallId();
    assert.equal(await inOperation(written, () => gateway.invoke(caller, saveView, { text: "one" })), written, "a command left a row, so its number is shown");
    const [row, ...rest] = host.callLog!.find(written);
    assert.equal(rest.length, 0);
    assert.equal(row?.call_id, written, "the row is under the number the MCP process made");
    assert.deepEqual([row?.capability_id, row?.ok, row?.actor_id, row?.audience, row?.operation], [save.capability_id, true, caller.actor_id, "mcp", "command"]);

    const read = newCallId();
    assert.equal(await inOperation(read, () => gateway.invoke(caller, lookView, {})), undefined, "a read that worked leaves no row, so no number is shown");
    assert.deepEqual(host.callLog!.find(read), []);

    const refused = newCallId();
    assert.equal(await inOperation(refused, () => gateway.invoke(caller, saveView, { text: 5 })), refused, "a command turned away before its handler is a row too");
    const refusedRow = host.callLog!.find(refused)[0];
    assert.deepEqual([refusedRow?.refused, refusedRow?.code, refusedRow?.ok], [true, "actions.input_invalid", false]);
  } finally { await stop(); }
});

test("W3-01 D the gateway answers with the number of the row it wrote, in the header and the body, and with none when it wrote none", { timeout: 30_000 }, async () => {
  const { host, caller, gateway, send, envelope, stop } = await residentCallIdFixture();
  try {
    await gateway.discover(caller);
    const instance = (await (await send({ ...envelope, operation: "discover" })).json() as { instance_id: string }).instance_id;
    const capability = { capability_id: save.capability_id, version: save.version };
    const id = randomUUID();
    const done = await send({ ...envelope, operation: "invoke", instance_id: instance, call_id: id, capability, input: { text: "raw" } });
    assert.equal(done.status, 200);
    assert.equal(done.headers.get("x-molis-work-call-id"), id);
    assert.deepEqual(await done.json(), { instance_id: instance, result: { saved: 1 }, call_id: id });
    assert.equal(host.callLog!.find(id).length, 1);

    const failedId = randomUUID();
    const failed = await send({ ...envelope, operation: "invoke", instance_id: instance, call_id: failedId, capability, input: { text: 5 } });
    assert.equal(failed.status, 400);
    assert.equal(failed.headers.get("x-molis-work-call-id"), failedId);
    assert.equal((await failed.json() as { call_id?: string; code?: string }).call_id, failedId);
    assert.equal(host.callLog!.find(failedId)[0]?.refused, true);

    // Turned away at the door of the gateway: no call was made, so no row, and no number in the answer.
    const doorId = randomUUID();
    const malformed = await send({ ...envelope, operation: "invoke", instance_id: instance, call_id: doorId, capability: "not a reference", input: {} });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.headers.get("x-molis-work-call-id"), null);
    assert.equal("call_id" in (await malformed.json() as object), false);
    assert.deepEqual(host.callLog!.find(doorId), []);
  } finally { await stop(); }
});

test("W3-01 D the gateway takes a number only on an invocation and only as the UUID the MCP process made, and refuses the request otherwise", { timeout: 30_000 }, async () => {
  const { host, caller, gateway, saveView, lookView, send, envelope, ran, stop } = await residentCallIdFixture();
  try {
    await gateway.discover(caller);
    const instance = (await (await send({ ...envelope, operation: "discover" })).json() as { instance_id: string }).instance_id;
    const invoke = { ...envelope, operation: "invoke", instance_id: instance, capability: { capability_id: save.capability_id, version: save.version }, input: { text: "refused" } };
    const refusedBody = async (body: Record<string, unknown>) => {
      const response = await send(body);
      assert.equal(response.status, 400);
      assert.equal((await response.json() as { code: string }).code, "actions.input_invalid");
    };
    await refusedBody(invoke);
    for (const call_id of ["", "not-a-uuid", "ABCDEF12-0000-4000-8000-000000000000", `${randomUUID()}x`, 7, null, [randomUUID()], { id: randomUUID() }]) await refusedBody({ ...invoke, call_id });
    await refusedBody({ ...envelope, operation: "discover", call_id: randomUUID() });
    assert.equal(ran(), 0, "no handler ran for a refused request");
    assert.deepEqual(host.callLog!.recent(100).filter(row => row.capability_id === saveView.capability_id || row.capability_id === lookView.capability_id), [], "no fixture invocation row was written");
  } finally { await stop(); }
});
