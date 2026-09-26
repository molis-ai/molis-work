import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import http from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { isRuntimeContextMcpTool } from "@molis-ai/molis-work-app-mcp";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalMcpServer, MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { LocalActionGatewayClient, ACTION_GATEWAY_PATH, actionGatewayHomeId } from "../apps/local-host/src/action-gateway.js";
import { hostActionToolName, createMcpActionGrant } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";
import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";

const save: ActionDefinition<{ text: string }, { saved: number }> = { capability_id: "unknown.gateway.save", version: 1, operation: "command", action: {
  title: "Save note", description: "Persistent fixture note", kind: "operation", scope: "project", audiences: ["mcp"], permissions: ["notes:write"], subject_kinds: [],
  input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
  output_schema: { type: "object", properties: { saved: { type: "integer" } }, required: ["saved"], additionalProperties: false } } };

test("official MCP process uses the shared Host registry and durable writes with fresh grants, exact Home, project and instance", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "action-gateway-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Gateway", actor_id: "user" }));
  const reference = molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
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
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object"); const origin = `http://127.0.0.1:${address.port}`;
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
    const name = hostActionToolName(save);
    assert.equal((await sdk.listTools()).tools.some(tool => tool.name === name), false);
    const view = (await host.inspectActions(caller, reference)).find(view => view.capability_id === save.capability_id)!;
    const grant = createMcpActionGrant(caller.actor_id, caller.project_id, view, true);
    await writeMcpActionGrant(home, grant);
    assert.ok((await sdk.listTools()).tools.some(tool => tool.name === name));
    const result = await sdk.callTool({ name, arguments: { text: "real cross-process note" } });
    assert.equal(result.isError, false, JSON.stringify(result)); assert.deepEqual(result.structuredContent, { saved: 1 });
    assert.deepEqual(await rows(), [{ actor: caller.actor_id, text: "real cross-process note" }]);
    assert.equal((await sdk.callTool({ name, arguments: { text: "forged", actor_id: "user" } })).isError, true);
    await gateway.discover(caller);
    const entered = new Promise<void>(resolve => { enter = resolve; }); barrier = new Promise<void>(resolve => { release = resolve; });
    const pending = assert.rejects(gateway.invoke(caller, view, { text: "revoked during wait" }), { code: "mcp.action_revoked" });
    await entered; await writeMcpActionGrant(home, { ...grant, enabled: false }); release!(); await pending; barrier = undefined;
    assert.equal((await rows()).length, 1);
    await assert.rejects(gateway.invoke({ ...caller, permissions: ["notes:write"] }, view, { text: "cannot self grant" }));
    assert.equal((await rows()).length, 1);
    await writeMcpActionGrant(home, grant);
    const controller = new AbortController();
    const cancellationEntered = new Promise<void>(resolve => { enter = resolve; });
    const remoteCancelled = new Promise<void>(resolve => { cancelled = resolve; });
    const remoteFinished = new Promise<void>(resolve => { finished = resolve; });
    barrier = new Promise<void>(resolve => { release = resolve; });
    const cancelCall = assert.rejects(gateway.invoke({ ...caller, signal: controller.signal }, view, { text: "cancelled" }), /cancelled by fixture/);
    await cancellationEntered; controller.abort(new Error("cancelled by fixture")); await remoteCancelled; release!();
    await Promise.all([cancelCall, remoteFinished]); barrier = undefined; finished = undefined;
    assert.equal((await rows()).length, 1);
    const formal = new LocalMcpServer(withCatalog, "runtime", { projectId: project.project_id,
      databasePath: project.database_path, boardId: project.board_id, webBaseUrl: origin }, {
      homeDirectory: home, webBaseUrl: origin, runtimeContext: { runtime_id: "gateway", stable_work_context_id: null, host_declares_stable: false },
    }, undefined, origin);
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
    const otherProject = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Other", actor_id: "user" }));
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
    const stale = await send({ ...envelope, operation: "invoke", instance_id: "old-host", capability: view, input: { text: "old" } });
    assert.equal((await stale.json() as any).code, "actions.host_replaced");
    await host.closeProject(reference);
    assert.equal((await rows()).length, 1, "durable data survives runtime reopening");
  } finally { release?.(); await sdk.close(); await new Promise<void>(resolve => server.close(() => resolve())); await host.close(); await rm(home, { recursive: true, force: true }); }
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

test("gateway rejects non-loopback destinations before reading a credential or making a request", () => {
  for (const url of ["https://127.0.0.1", "http://localhost:4173", "http://example.invalid", "http://127.0.0.1/path", "http://user:pass@127.0.0.1"]) {
    assert.throws(() => new LocalActionGatewayClient({ url, homeDirectory: "/unused", clientId: "fixture", projectId: null }), { code: "actions.transport_invalid" });
  }
});


test("production stdio keeps context tools usable without a running system service", { timeout: 20_000 }, async () => {
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
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const unavailable = await sdk.callTool({ name: hostActionToolName(save), arguments: { text: "offline" } });
    assert.equal(unavailable.isError, true);
    assert.match(JSON.stringify(unavailable), /actions.service_unavailable/);
  } finally { await sdk.close(); await rm(home, { recursive: true, force: true }); }
});
