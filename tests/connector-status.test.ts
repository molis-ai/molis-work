import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ensureSystemAgentService, MolisWorkLocalHost, connectorManagementActions, connectorRecordActions, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { openTestHome } from "./fixtures/test-home.js";

const caller: ActionCallContext = { actor_id: "status-user", audience: "agent", project_id: null,
  permissions: ["connectors:management:read", "connectors:management:write", "connectors:records:read", "connectors:account:read"] };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "x-oauth-scopes": "read:user, notifications" } });
type Status = {
  configuration: { state: string; enabled: boolean };
  connectivity: { state: string; current?: boolean; last_check?: { at: string; revision: string } };
  authorization: { service: { state: string; scopes: string[] | null; scope_state: string }; work: { state: string; missing_permissions: string[] } };
  capabilities: { state: string; entries: Array<{ capability_id: string; available: boolean; reason?: string }> };
  last_call?: { outcome: string; current_revision: boolean; action: { capability_id: string }; actor_id: string };
};
const read = async (host: MolisWorkLocalHost, id: string, context = caller) => {
  const result = await host.homeActionClient().invoke(context, connectorManagementActions.list, {}) as { connections: Array<{ connection_id: string; status: Status }> };
  return result.connections.find(row => row.connection_id === id)!.status;
};

for (const change of ["cancel", "revoke"] as const) test(`ASC-10 ASC-16: ${change} during the final MCP revision read preserves the previous observation`, { timeout: 30_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Observation cancellation");
  let calls = 0;
  const remote = createServer(async (request, response) => {
    if (request.method === "DELETE") { response.writeHead(204).end(); return; }
    const parts: Buffer[] = []; for await (const part of request) parts.push(Buffer.from(part));
    const rpc = JSON.parse(Buffer.concat(parts).toString());
    if (rpc.id === undefined) { response.writeHead(202).end(); return; }
    let result: unknown;
    if (rpc.method === "initialize") result = { protocolVersion: rpc.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "observation", version: "1" } };
    else if (rpc.method === "tools/list") result = { tools: [{ name: "inspect_item", inputSchema: { type: "object", properties: {} } }] };
    else if (rpc.method === "tools/call") { calls++; result = { content: [{ type: "text", text: "observed" }] }; }
    else { response.writeHead(400).end(); return; }
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }));
  });
  await new Promise<void>(resolve => remote.listen(0, "127.0.0.1", resolve));
  t.after(() => { remote.closeAllConnections(); remote.close(); });
  const address = remote.address(); assert.ok(address && typeof address === "object");
  const library = (await ensureSystemAgentService(home.host, home.home).mcpLibrary())!;
  const owner = { project_id: project.project_id, plugin_id: "io.molis.work.coding" };
  const saved = await library.save(owner, { expected_version: 0, label: "Observation service", transport: "http", enabled: true,
    timeout_ms: 3000, endpoint: `http://127.0.0.1:${address.port}/mcp`, auth: { kind: "none" } });
  const scope = { ...caller, project_id: project.project_id, permissions: [...caller.permissions, "mcp:external"] };
  const client = home.host.actionClient(project.reference);
  const observation = async () => {
    const result = await client.invoke(scope, connectorManagementActions.list, {}) as { connections: Array<{ connection_id: string; status: Status }> };
    return result.connections.find(row => row.connection_id === saved.id)!.status.last_call;
  };
  await client.invoke(scope, connectorManagementActions.check, { connection_id: saved.id });
  const tool = (await client.discover(scope)).find(row => row.action.title === "inspect_item")!;
  const ref = { capability_id: tool.capability_id, version: tool.version, provider_id: tool.provider.provider_id };
  await client.invoke(scope, ref, {}); const previous = await observation(); assert.ok(previous);
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), abort = new AbortController();
  t.after(() => release.resolve());
  const originalCall = library.call!.bind(library), originalList = library.list.bind(library); let gate = false, granted = true;
  t.mock.method(library, "call", async (...args: Parameters<typeof originalCall>) => { const result = await originalCall(...args); gate = true; return result; });
  t.mock.method(library, "list", async (...args: Parameters<typeof originalList>) => {
    const result = await originalList(...args); if (gate) { gate = false; entered.resolve(); await release.promise; } return result;
  });
  try {
    const pending = client.invoke({ ...scope, signal: abort.signal, validate_authority: () => { if (!granted) throw new ActionError("actions.revoked", "Grant withdrawn"); } }, ref, {});
    const stopped = pending.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));
    await Promise.race([entered.promise, pending.then(() => { throw new Error("call completed before the revision gate"); }, () => { throw new Error("call failed before the revision gate"); })]);
    if (change === "cancel") abort.abort(); else granted = false;
    release.resolve(); const outcome = await stopped; t.mock.restoreAll();
    assert.equal(calls, 2, "the completed remote operation is not retried or claimed undone");
    assert.deepEqual(await observation(), previous, "cancelled or revoked completion must not overwrite the technical observation");
    assert.equal(outcome.ok, false, "the completed result cannot be returned after cancellation or revocation");
    if (!outcome.ok) assert.equal(change === "cancel" ? outcome.error.name : outcome.error.code, change === "cancel" ? "AbortError" : "actions.revoked");
  } finally { release.resolve(); t.mock.restoreAll(); }
});

test("ASC-10 ASC-13: configuration, live checks, caller permission and actual reads remain separate across restart", async t => {
  const home = await openTestHome(t), row = withConnectorConnections(home.home, store => store.createToken({ serviceId: "github", displayName: "Work", token: "fixture-status-secret" }));
  let businessReads = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    if (String(input) === "https://api.github.com/user") return reply({ id: 42, login: "work-account" });
    assert.equal(new URL(String(input)).pathname, "/notifications"); businessReads++; return reply([]);
  });
  const initial = await read(home.host, row.connection_id);
  assert.equal(initial.configuration.state, "complete"); assert.equal(initial.connectivity.state, "unchecked");
  assert.equal(initial.authorization.service.state, "unknown"); assert.equal(initial.capabilities.state, "blocked"); assert.equal(initial.last_call, undefined);
  await home.host.homeActionClient().invoke(caller, connectorManagementActions.check, { connection_id: row.connection_id });
  const checked = await read(home.host, row.connection_id);
  assert.equal(checked.connectivity.state, "connected"); assert.equal(checked.capabilities.state, "callable");
  assert.equal(checked.authorization.service.scopes, null); assert.equal(checked.authorization.service.scope_state, "unknown");
  assert.equal(checked.last_call, undefined); assert.equal(businessReads, 0);
  const limited = await read(home.host, row.connection_id, { ...caller, permissions: ["connectors:management:read"] });
  assert.equal(limited.connectivity.state, "connected"); assert.equal(limited.authorization.work.state, "blocked");
  assert.deepEqual(limited.authorization.work.missing_permissions, ["connectors:records:read"]); assert.equal(limited.capabilities.entries[0]!.available, false);
  const disabledAction = await read(home.host, row.connection_id, { ...caller, allowed_actions: [{ ...connectorManagementActions.list, provider_id: "system.connectors" }] });
  assert.equal(disabledAction.authorization.work.state, "blocked"); assert.equal(disabledAction.capabilities.entries[0]!.available, false);
  await home.host.homeActionClient().invoke(caller, { capability_id: "connectors.account.read", version: 1, provider_id: "system.connectors" }, { connection_id: row.connection_id });
  assert.deepEqual((await read(home.host, row.connection_id)).authorization.service.scopes, ["notifications", "read:user"]);
  await home.host.homeActionClient().invoke(caller, connectorRecordActions.read, { connection_id: row.connection_id });
  assert.equal(businessReads, 1);
  const called = await read(home.host, row.connection_id);
  assert.equal(called.last_call?.outcome, "succeeded"); assert.equal(called.last_call?.action.capability_id, connectorRecordActions.read.capability_id);
  assert.equal(called.last_call?.actor_id, caller.actor_id); assert.doesNotMatch(JSON.stringify(called), /fixture-status-secret/);
  assert.equal((called.connectivity.last_check as { account?: { login: string } }).account?.login, "work-account", "verified identity is an explicit owner fact, not the editable display label");
  await home.close(); await home.host.close();
  const restarted = new MolisWorkLocalHost({ homeDirectory: home.home, completeText: null });
  try {
    assert.deepEqual((await read(restarted, row.connection_id)).last_call, called.last_call);
    withConnectorConnections(home.home, store => store.setEnabled(row.connection_id, false));
    const disabled = await read(restarted, row.connection_id);
    assert.equal(disabled.configuration.state, "complete"); assert.equal(disabled.configuration.enabled, false);
    assert.equal(disabled.connectivity.state, "disconnected"); assert.equal(disabled.capabilities.state, "blocked");
    withConnectorConnections(home.home, store => store.setEnabled(row.connection_id, true));
    const enabled = await read(restarted, row.connection_id);
    assert.equal(enabled.connectivity.state, "unchecked"); assert.equal(enabled.last_call?.current_revision, false);
    assert.equal(enabled.connectivity.current, false, "a prior check cannot verify a new configuration revision");
  } finally { await restarted.close(); }
});

test("ASC-10 ASC-16: a result lost after a business dispatch is unknown and is not retried", async t => {
  const home = await openTestHome(t), row = withConnectorConnections(home.home, store => store.createToken({ serviceId: "github", displayName: "Work", token: "fixture-status-secret" }));
  let reads = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    if (String(input) === "https://api.github.com/user") return reply({ id: 42, login: "work-account" });
    reads++; throw new Error("private provider diagnostic must not be stored");
  });
  await assert.rejects(home.host.homeActionClient().invoke(caller, connectorRecordActions.read, { connection_id: row.connection_id }));
  const result = await read(home.host, row.connection_id);
  assert.equal(reads, 1); assert.equal(result.last_call?.outcome, "unknown"); assert.equal(result.connectivity.state, "unknown");
  assert.doesNotMatch(JSON.stringify(result), /private provider|fixture-status-secret/);
});

test("ASC-10 ASC-25: cancellation or changed configuration during identity checks writes no late observation or business call", async t => {
  for (const change of ["cancel", "replace"] as const) {
    const home = await openTestHome(t), row = withConnectorConnections(home.home, store => store.createToken({ serviceId: "github", displayName: "Work", token: "fixture-status-secret" }));
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), abort = new AbortController(); let reads = 0;
    const mocked = t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
      if (String(input) === "https://api.github.com/user") { entered.resolve(); await release.promise; return reply({ id: 42, login: "work-account" }); }
      reads++; return reply([]);
    });
    try {
      const running = home.host.homeActionClient().invoke({ ...caller, signal: abort.signal }, connectorRecordActions.read, { connection_id: row.connection_id });
      const refused = assert.rejects(running); await entered.promise;
      if (change === "cancel") abort.abort(); else withConnectorConnections(home.home, store => store.replaceToken(row.connection_id, "fixture-new-secret"));
      release.resolve(); await refused;
      assert.equal(reads, 0); const result = await read(home.host, row.connection_id);
      assert.equal(result.last_call, undefined); assert.equal(result.connectivity.state, "unchecked");
    } finally { release.resolve(); mocked.mock.restore(); }
  }
});


test("ASC-10 ASC-13 ASC-32: project MCP reports live state, caller scope and real success/failure/unknown receipts without duplicating a connection", async t => {
  const home = await openTestHome(t), project = await home.createProject("Project MCP status");
  let mode: "success" | "failed" | "unknown" = "success", calls = 0, rejectChecks = false;
  const remote = createServer(async (request, response) => {
    if (request.method === "DELETE") { response.writeHead(204).end(); return; }
    const parts: Buffer[] = []; for await (const part of request) parts.push(Buffer.from(part));
    const rpc = JSON.parse(Buffer.concat(parts).toString());
    if (rpc.id === undefined) { response.writeHead(202).end(); return; }
    if (rejectChecks && rpc.method === "tools/list") { response.writeHead(503).end(); return; }
    let result: unknown;
    if (rpc.method === "initialize") result = { protocolVersion: rpc.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "status", version: "1" } };
    else if (rpc.method === "tools/list") result = { tools: [{ name: "inspect_item", inputSchema: { type: "object", properties: {} } }] };
    else if (rpc.method === "tools/call") {
      calls++; if (mode === "unknown") { response.destroy(); return; }
      result = { isError: mode === "failed", content: [{ type: "text", text: "private result must not be copied into connection status" }] };
    } else { response.writeHead(400).end(); return; }
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }));
  });
  await new Promise<void>(resolve => remote.listen(0, "127.0.0.1", resolve));
  t.after(() => { remote.closeAllConnections(); remote.close(); });
  const address = remote.address(); assert.ok(address && typeof address === "object");
  const library = (await ensureSystemAgentService(home.host, home.home).mcpLibrary())!;
  const owner = { project_id: project.project_id, plugin_id: "io.molis.work.coding" };
  const saved = await library.save(owner, { expected_version: 0, label: "Project service", transport: "http", enabled: true,
    timeout_ms: 3000, endpoint: `http://127.0.0.1:${address.port}/mcp`, auth: { kind: "none" } });
  const scope = { ...caller, project_id: project.project_id, permissions: [...caller.permissions, "mcp:external"] };
  const client = home.host.actionClient(project.reference);
  const status = async () => {
    const result = await client.invoke(scope, connectorManagementActions.list, {}) as { connections: Array<{ connection_id: string; status: Status }> };
    return result.connections.find(row => row.connection_id === saved.id)!.status;
  };
  assert.equal((await status()).configuration.state, "complete");
  assert.equal((await status()).connectivity.state, "disconnected"); assert.equal(calls, 0);
  await client.invoke(scope, connectorManagementActions.check, { connection_id: saved.id });
  const checked = await status();
  assert.equal(checked.connectivity.state, "connected"); assert.ok(checked.connectivity.last_check?.at);
  assert.equal(checked.authorization.service.state, "not-required"); assert.equal(checked.capabilities.state, "callable");
  assert.equal(checked.last_call, undefined); assert.equal(calls, 0);
  const tool = (await client.discover(scope)).find(row => row.action.title === "inspect_item")!;
  const ref = { capability_id: tool.capability_id, version: tool.version, provider_id: tool.provider.provider_id };
  await client.invoke(scope, ref, {});
  const success = await status(); assert.equal(success.last_call?.outcome, "succeeded"); assert.equal(calls, 1);
  await assert.rejects(client.invoke({ ...scope, permissions: ["connectors:management:read"] }, ref, {}));
  assert.deepEqual((await status()).last_call, success.last_call); assert.equal(calls, 1);
  mode = "failed"; await assert.rejects(client.invoke(scope, ref, {}));
  assert.equal((await status()).last_call?.outcome, "failed"); assert.equal(calls, 2);
  mode = "unknown"; await assert.rejects(client.invoke(scope, ref, {}));
  assert.equal((await status()).last_call?.outcome, "unknown"); assert.equal(calls, 3, "a lost result is not retried");
  assert.doesNotMatch(JSON.stringify(await status()), /private result/);
  rejectChecks = true;
  await assert.rejects(client.invoke(scope, connectorManagementActions.check, { connection_id: saved.id }));
  assert.equal((await status()).connectivity.state, "failed");
  rejectChecks = false;
  await client.invoke(scope, connectorManagementActions.check, { connection_id: saved.id });
  const homeStatus = await read(home.host, saved.id);
  assert.equal(homeStatus.authorization.work.state, "blocked"); assert.equal(homeStatus.capabilities.state, "blocked", "Home scope does not borrow project grants");
  const settings = await fetch(home.origin + "/capabilities/connections?connector=mcp-bearer").then(response => response.text());
  assert.match(settings, /data-connection-status/); assert.ok(settings.includes(saved.id)); assert.ok(settings.includes(project.project_id));
  const management = `/api/settings/connectors/connections/${saved.id}`;
  const preview = await home.web.post<{ tools: unknown[] }>(management + "/preview", {});
  assert.equal(preview.tools.length, 1); assert.equal(calls, 3, "a preview never calls the service tool");
  await home.web.post(management + "/manage", { expected_revision: "1", action: "disable" });
  assert.equal((await status()).configuration.enabled, false); assert.equal((await status()).connectivity.state, "disconnected");
  assert.equal((await status()).last_call?.current_revision, false);
  await assert.rejects(home.web.post(management + "/manage", { expected_revision: "1", action: "enable" }), { status: 409 });
  await home.web.post(management + "/manage", { expected_revision: "2", action: "enable" });
  assert.equal((await status()).connectivity.state, "connected"); assert.equal(calls, 3);
  assert.equal(withConnectorConnections(home.home, store => store.list().length), 0, "project configuration is never copied to the Home connection table");
  await home.web.post(management + "/manage", { expected_revision: "3", action: "remove" });
  assert.deepEqual(await library.list(owner), []);
});


test("ASC-10 ASC-25: changing credentials during an account read rejects the old identity and leaves no current check", async t => {
  const home = await openTestHome(t), row = withConnectorConnections(home.home, store => store.createToken({ serviceId: "github", displayName: "Work", token: "fixture-status-secret" }));
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  t.mock.method(globalThis, "fetch", async () => { entered.resolve(); await release.promise; return reply({ login: "old-account" }); });
  const refused = assert.rejects(home.host.homeActionClient().invoke(caller, { capability_id: "connectors.account.read", version: 1, provider_id: "system.connectors" }, { connection_id: row.connection_id }), { code: "connector.account.disconnected" });
  await entered.promise;
  withConnectorConnections(home.home, store => store.replaceToken(row.connection_id, "fixture-replacement-secret"));
  release.resolve(); await refused;
  assert.equal((await read(home.host, row.connection_id)).connectivity.state, "unchecked");
  assert.equal((await read(home.host, row.connection_id)).connectivity.last_check, undefined);
});
