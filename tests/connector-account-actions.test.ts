import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { openTestHome } from "./fixtures/test-home.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { connectorManagementActions, CONNECTOR_MANAGEMENT_READ, CONNECTOR_MANAGEMENT_WRITE, MolisWorkLocalHost, ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { connectorAccountActions, CONNECTOR_ACCOUNT_PERMISSIONS } from "../apps/local-host/dist/connector-account-actions.js";

test("a connected account is read through one registered connector action; connecting grants nothing else", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "connector-account-"));
  const priorBackend = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file"; resetSecretStoreCache();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const user: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: CONNECTOR_ACCOUNT_PERMISSIONS };
  try {
    const client = host.homeActionClient();
    const rows = (await client.discover(user)).filter(row => row.provider.provider_id === "system.connectors");
    assert.deepEqual(rows.map(row => row.capability_id), ["connectors.account.read"]);
    // CONACC-01/CONACC-02: The account is read through one connection; an unknown or disconnected one is never replaced by another account.
    await assert.rejects(client.invoke(user, connectorAccountActions.read, { connection_id: "11111111-1111-4111-8111-111111111111" }), { code: "connector.account.unknown", kind: "invalid", message: "没有这条连接" });
    const github = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "GitHub", token: "fixture-github-token" }));
    withConnectorConnections(home, store => store.disconnect(github.connection_id));
    await assert.rejects(client.invoke(user, connectorAccountActions.read, { connection_id: github.connection_id }), { code: "connector.account.disconnected", kind: "invalid" });
    await assert.rejects(client.invoke({ ...user, audience: "mcp", actor_id: "runtime:x", permissions: [] }, connectorAccountActions.read, { connection_id: github.connection_id }), { code: "actions.forbidden" });
    const external = await client.discover({ ...user, audience: "mcp", actor_id: "runtime:x" });
    assert.ok(external.some(row => row.capability_id === "connectors.account.read"), "an external client can be granted the account check explicitly");
  } finally {
    await host.close();
    if (priorBackend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = priorBackend;
    resetSecretStoreCache();
    await rm(home, { recursive: true, force: true });
  }
});

test("ASC-37 the assistant discovers connection management before any project, model or service exists", async () => {
  const home = await mkdtemp(join(tmpdir(), "connector-management-empty-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const caller: ActionCallContext = { actor_id: "assistant-test", audience: "agent", project_id: null, permissions: [CONNECTOR_MANAGEMENT_READ] };
  try {
    const client = host.homeActionClient();
    const available = await client.discover(caller);
    assert.ok(available.some(row => row.capability_id === connectorManagementActions.catalog.capability_id && row.availability.available));
    const catalog = await client.invoke(caller, connectorManagementActions.catalog, { service_id: "asana" }) as { services: Array<{ connector_id: string; method_options: Array<{ kind: string; support: string }> }> };
    assert.equal(catalog.services.length, 1); assert.equal(catalog.services[0]!.connector_id, "asana");
    assert.ok(catalog.services[0]!.method_options.some(method => method.kind === "oauth" && method.support === "in_app"));
    assert.deepEqual(await client.invoke(caller, connectorManagementActions.list, {}), { connections: [] });
    await assert.rejects(client.invoke({ ...caller, permissions: [] }, connectorManagementActions.list, {}), { code: "actions.forbidden" });
    await assert.rejects(client.invoke(caller, connectorManagementActions.list, { project_id: "another-project" }), { code: "actions.input_invalid" });
    const account = withConnectorConnections(home, store => store.createToken({ serviceId: "github", displayName: "Work", token: "fixture-private-token" }));
    const rows = await client.invoke(caller, connectorManagementActions.list, { service_id: "github" }) as { connections: Array<{ connection_id: string; display_name: string }> };
    assert.equal(rows.connections[0]!.connection_id, account.connection_id); assert.equal(rows.connections[0]!.display_name, "Work");
    assert.doesNotMatch(JSON.stringify(rows), /fixture-private-token|credential_ref|refresh_ref/);
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});


test("ASC-14 ASC-20 ASC-24: connection controls persist disable without deleting credentials and remove only the selected account", async t => {
  const home = await mkdtemp(join(tmpdir(), "connector-lifecycle-"));
  let host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const caller: ActionCallContext = { actor_id: "assistant-test", audience: "agent", project_id: null, permissions: [CONNECTOR_MANAGEMENT_READ, CONNECTOR_MANAGEMENT_WRITE] };
  const token = "fixture-lifecycle-private-value";
  let checks = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    assert.equal(String(input), "https://api.github.com/user"); checks++;
    return new Response(JSON.stringify({ login: "work-account", id: 1 }), { status: 200, headers: { "content-type": "application/json" } });
  });
  try {
    const [one, two] = withConnectorConnections(home, store => [store.createToken({ serviceId: "github", displayName: "Work", token }),
      store.createToken({ serviceId: "github", displayName: "Personal", token: "fixture-other-account" })]);
    const change = (action: string, revision: string) => host.homeActionClient().invoke(caller, connectorManagementActions.control, {
      connection_id: one!.connection_id, expected_revision: revision, action,
    });
    await assert.rejects(change("disable", "obsolete"), { code: "connector.management.changed" });
    const disabled = await change("disable", one!.updated_at) as { connection: { enabled: boolean } };
    assert.equal(disabled.connection.enabled, false);
    withConnectorConnections(home, store => {
      assert.throws(() => store.resolveToken(one!.connection_id, "github"));
      assert.equal(store.resolveToken(two!.connection_id, "github"), "fixture-other-account");
      assert.equal(store.require(one!.connection_id).credential_ref, one!.credential_ref);
    });
    await host.close(); host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    const paused = withConnectorConnections(home, store => store.require(one!.connection_id));
    assert.equal(paused.enabled, false);
    const enabled = await change("enable", paused.updated_at) as { verification: { available: boolean } };
    assert.equal(enabled.verification.available, true); assert.equal(checks, 1);
    assert.equal(withConnectorConnections(home, store => store.resolveToken(one!.connection_id, "github")), token, "enable uses the same retained secret");
    const revision = withConnectorConnections(home, store => store.require(one!.connection_id).updated_at);
    const removed = await change("remove", revision) as { removed: boolean; service_authorization_revoked: boolean };
    assert.equal(removed.removed, true); assert.equal(removed.service_authorization_revoked, false);
    const listed = await host.homeActionClient().invoke(caller, connectorManagementActions.list, { service_id: "github" });
    assert.doesNotMatch(JSON.stringify(listed), new RegExp(one!.connection_id));
    assert.doesNotMatch(JSON.stringify(listed), /fixture-lifecycle-private-value|fixture-other-account/);
    withConnectorConnections(home, store => {
      assert.equal(store.get(one!.connection_id), null);
      assert.equal(store.resolveToken(two!.connection_id, "github"), "fixture-other-account");
    });
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});


test("ASC-25: cancelling the common connection check reaches the API request", async t => {
  const home = await openTestHome(t);
  const saved = withConnectorConnections(home.home, store => store.createToken({ serviceId: "github", displayName: "Work", token: "fixture-check-cancel" }));
  const controller = new AbortController();
  let reached!: () => void;
  const started = new Promise<void>(resolve => { reached = resolve; });
  let requestAborted = false;
  t.mock.method(globalThis, "fetch", (_input: unknown, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init.signal!.addEventListener("abort", () => { requestAborted = true; reject(init.signal!.reason); }, { once: true });
    reached();
  }));
  const caller: ActionCallContext = { actor_id: "assistant:check", audience: "agent", project_id: null, permissions: [CONNECTOR_MANAGEMENT_READ], signal: controller.signal };
  const pending = home.host.homeActionClient().invoke(caller, connectorManagementActions.check, { connection_id: saved.connection_id });
  const rejected = assert.rejects(pending);
  await started; controller.abort(new Error("stop-check")); await rejected;
  assert.equal(requestAborted, true);
  assert.equal(withConnectorConnections(home.home, store => store.require(saved.connection_id)).enabled, true);
});


test("ASC-01 ASC-12 ASC-13 ASC-14 ASC-32: Home management checks a saved project MCP without Coding and publishes actions only in its project", async t => {
  const home = await openTestHome(t);
  const project = await home.createProject("MCP project");
  const writes: string[] = [];
  let discovery = 0, initializes = 0, phase = 0;
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const noteTool = { name: "write_note", inputSchema: { type: "object", properties: { note: { type: "string" } }, required: ["note"] } };
  const server = createServer(async (request, response) => {
    if (request.method === "DELETE") { response.writeHead(204).end(); return; }
    const parts: Buffer[] = []; for await (const part of request) parts.push(Buffer.from(part));
    const message = JSON.parse(Buffer.concat(parts).toString());
    if (message.id === undefined) { response.writeHead(202).end(); return; }
    let result: unknown;
    if (message.method === "initialize") { initializes++; result = { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "inventory", version: "1" } }; }
    else if (message.method === "tools/list") {
      discovery++;
      result = { tools: phase === 2 ? [] : [noteTool,
        { name: phase === 0 ? "old_tool" : "new_tool", inputSchema: { type: "object", properties: {} } },
        { name: "shape_tool", inputSchema: { type: "object", properties: { value: { type: phase === 0 ? "string" : "number" } }, required: ["value"] } }] };
    }
    else if (message.method === "tools/call") {
      writes.push(message.params.arguments.note);
      if (message.params.arguments.note === "held task") { entered(); await held; }
      result = { content: [{ type: "text", text: "saved" }] };
    }
    else { response.writeHead(400).end(); return; }
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  const service = ensureSystemAgentService(home.host, home.home);
  const library = (await service.mcpLibrary())!;
  const owner = { project_id: project.project_id, plugin_id: "io.molis.work.coding" };
  const saved = await library.save(owner, { expected_version: 0, label: "Project notes", transport: "http", endpoint: `http://127.0.0.1:${address.port}/mcp`,
    enabled: true, timeout_ms: 3000, auth: { kind: "none" } });
  const caller: ActionCallContext = { actor_id: "assistant:inventory", audience: "agent", project_id: null, permissions: [CONNECTOR_MANAGEMENT_READ, CONNECTOR_MANAGEMENT_WRITE, "mcp:external"] };
  const homeClient = home.host.homeActionClient();
  const inventory = await homeClient.invoke(caller, connectorManagementActions.list, {}) as { connections: Array<{ connection_id: string; project_id?: string }> };
  assert.equal(inventory.connections.find(row => row.connection_id === saved.id)?.project_id, project.project_id);
  assert.equal((await library.list(owner))[0]!.health, "disconnected", "inventory does not start the transport");
  assert.deepEqual(writes, []);
  await homeClient.invoke(caller, connectorManagementActions.check, { connection_id: saved.id });
  const client = home.host.actionClient(project.reference), scoped = { ...caller, project_id: project.project_id };
  const action = (await client.discover(scoped)).find(row => row.action.title === "write_note")!;
  assert.ok(action?.availability.available, "checking publishes tools through the Host without opening Coding");
  const ref = { capability_id: action.capability_id, version: action.version, provider_id: action.provider.provider_id };
  await assert.rejects(homeClient.invoke(caller, ref, { note: "Home cannot borrow project access" }));
  await client.invoke(scoped, ref, { note: "project task" });
  assert.deepEqual(writes, ["project task"]);
  const prior = await client.discover(scoped);
  const removedTool = prior.find(row => row.action.title === "old_tool")!;
  const changedTool = prior.find(row => row.action.title === "shape_tool")!;
  const reference = (row: typeof removedTool) => ({ capability_id: row.capability_id, version: row.version, provider_id: row.provider.provider_id });
  const active = client.invoke(scoped, ref, { note: "held task" });
  await started; phase = 1;
  try {
    await homeClient.invoke(caller, connectorManagementActions.check, { connection_id: saved.id });
    assert.equal(initializes, 1, "a check reuses the live protocol session");
    assert.equal(discovery, 2, "a check asks the server again instead of reading a cached snapshot");
    const refreshed = await client.discover(scoped);
    assert.ok(refreshed.some(row => row.action.title === "new_tool"));
    assert.ok(!refreshed.some(row => row.action.title === "old_tool"));
    await assert.rejects(client.invoke(scoped, reference(removedTool), {}));
    await assert.rejects(client.invoke(scoped, reference(changedTool), { value: "old shape" }));
    assert.deepEqual(writes, ["project task", "held task"]);
  } finally { release(); }
  await active;
  phase = 2;
  await homeClient.invoke(caller, connectorManagementActions.check, { connection_id: saved.id });
  assert.ok(!(await client.discover(scoped)).some(row => row.provider.provider_id === action.provider.provider_id), "an empty current list removes all previously seen tools");
  await assert.rejects(client.invoke(scoped, ref, { note: "removed" }));
  phase = 0;
  await homeClient.invoke(caller, connectorManagementActions.control, { connection_id: saved.id, expected_revision: "1", action: "disable" });
  await assert.rejects(client.invoke(scoped, ref, { note: "disabled" }));
  assert.deepEqual(writes, ["project task", "held task"]);
  await homeClient.invoke(caller, connectorManagementActions.control, { connection_id: saved.id, expected_revision: "2", action: "enable" });
  const enabled = (await client.discover(scoped)).find(row => row.action.title === "write_note")!;
  assert.ok(enabled.availability.available, "enable refreshes the actual connection and capabilities");
  await client.invoke(scoped, { capability_id: enabled.capability_id, version: enabled.version, provider_id: enabled.provider.provider_id }, { note: "enabled again" });
  assert.deepEqual(writes, ["project task", "held task", "enabled again"]);
  await homeClient.invoke(caller, connectorManagementActions.control, { connection_id: saved.id, expected_revision: "3", action: "remove" });
  assert.deepEqual(await library.list(owner), []);
});
