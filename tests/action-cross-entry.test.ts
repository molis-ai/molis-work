import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalMcpServer, PluginHostExecutor } from "@molis-ai/molis-work-app-local-host";
import { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { newCallId, withCallId } from "@molis-ai/molis-work-kernel";
import { agentHostCapabilities as service } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { shelfActions } from "@molis-ai/molis-work-plugin-shelf";
import { openTestHome, type TestHome, type TestProject } from "./fixtures/test-home.js";
import { crossEntrySchedule as subject, crossEntryTodo as todo, isCrossEntryObject } from "./fixtures/cross-entry-subjects.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const clientId = "runtime:cross-entry";
async function scheduleSdk(t: Parameters<typeof openTestHome>[0], home: TestHome, project: TestProject) {
  let sdk: BoundActionClient | undefined;
  const actions = { registry: home.host.actionRegistry(project.reference), client: home.host.actionClient(project.reference, false), project_id: project.project_id };
  const runtime = await home.host.withProject(project.reference, owner => new PluginRuntime(undefined, new PluginHostExecutor({ actions,
    project_id: project.project_id, actor_id: "schedule-sdk-owner", artifacts: owner.artifacts, processItems: owner.processItems,
    ui: new UiHost(), privateStorageFor: () => { throw new Error("This consumer declares no private storage"); } }), { actions }));
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.fixture.schedule-sdk", version: "1.0.0", name: "Schedule consumer", kind: "app",
    publisher: { publisher_id: "fixture", signature: "schedule-sdk" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: "schedule:read", required: true, reason: "Read the original task" }, { permission: "schedule:write", required: true, reason: "Save the authorized task" }],
    capabilities: { provides: [], consumes: [subject.create.capability_id, subject.archive.capability_id, subject.list.capability_id] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [] },
    async start(context) { sdk = context.services?.actions; return { kind: "app" }; } };
  const install = runtime.install({ definition, deployment: "local", grants: ["schedule:read", "schedule:write"] }).install;
  t.after(() => runtime.stop(install.install_id));
  await runtime.start(install.install_id); assert.ok(sdk, "the real executor bound the declared action client"); return sdk;
}

function object(value: unknown) { assert.ok(isCrossEntryObject(value), JSON.stringify(value)); return value; }
async function page(home: TestHome, path: string, input: unknown) {
  const response = await fetch(home.origin + path.replace("/list/tasks", "/tasks"), { method: "POST", headers: { origin: home.origin, "content-type": "application/json",
    "x-molis-work-control-token": home.controlToken, "x-molis-work-idempotency-key": randomUUID() }, body: JSON.stringify(input) });
  const body: unknown = await response.json();
  return { status: response.status, body: object(body), callId: response.headers.get("x-molis-work-call-id") };
}
function mcpFor(home: TestHome, project: TestProject) {
  return new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", { projectId: project.project_id, databasePath: project.database_path, webBaseUrl: home.origin },
    { homeDirectory: home.home, webBaseUrl: home.origin, runtimeContext: { runtime_id: "cross-entry", stable_work_context_id: "cross-entry-session", host_declares_stable: true } }, home.host, home.origin);
}
async function mcpCall(mcp: LocalMcpServer, capabilityId: string, input: unknown, visible = true) {
  const listed = object((await mcp.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }))?.result);
  assert.ok(Array.isArray(listed.tools));
  const tools: unknown[] = listed.tools;
  const name = `molis_work_v1_action_${capabilityId}__v1`;
  assert.equal(tools.some(tool => isCrossEntryObject(tool) && tool.name === name), visible, name);
  const result = object((await mcp.handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: input } }))?.result);
  assert.ok(Array.isArray(result.content));
  const content: unknown[] = result.content;
  const first = object(content[0]); assert.equal(first.type, "text"); assert.equal(typeof first.text, "string");
  assert.ok(typeof first.text === "string");
  const decoded: unknown = JSON.parse(first.text);
  return { result, body: object(decoded), callId: isCrossEntryObject(result._meta) ? result._meta["molis-work/callId"] : undefined };
}
function row(home: TestHome, callId: unknown, capabilityId: string) {
  assert.ok(typeof callId === "string"); assert.match(callId, UUID); assert.ok(home.host.callLog);
  const rows = home.host.callLog.find(callId).filter(record => record.capability_id === capabilityId);
  assert.equal(rows.length, 1, `${capabilityId}: ${callId}`);
  assert.deepEqual(home.host.callLog.find(callId.slice(0, 8)), home.host.callLog.find(callId));
  const record = rows[0]!;
  assert.ok(record.call_id === callId || record.call_ids?.includes(callId), "the shown operation id is kept in the actual row");
  return record;
}

test("W3-09-1-01 T1: page, actual MCP tool and the bound plugin SDK action client creates agree on owner facts and findable operation ids", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Cross entry", ["schedule"]);
  await home.grant(clientId, project.project_id, [subject.create, subject.archive, subject.list]);
  const mcp = mcpFor(home, project); t.after(() => mcp.close());
  assert.ok(home.host.search);
  const changed = t.mock.method(home.host.search, "changed");
  const assertChanged = (expected: number) => assert.equal(changed.mock.calls.filter(call => call.arguments[0] === "io.molis.work.schedule" && call.arguments[1] === project.project_id).length, expected);
  const target = new Date(Date.now() + 12 * 60 * 60_000);
  const time = `${String(target.getHours()).padStart(2, "0")}:${String(target.getMinutes()).padStart(2, "0")}`;
  const input = subject.input("同一个真实任务", time), results: Array<{ task: Record<string, unknown>; callId: unknown; actor: string; audience: string }> = [];
  const fromPage = await page(home, subject.path(project.project_id) + "/tasks", input);
  assert.equal(fromPage.status, 201, JSON.stringify(fromPage.body));
  results.push({ task: object(fromPage.body.task), callId: fromPage.callId, actor: "web-user", audience: "user" });
  assertChanged(1);
  const fromMcp = await mcpCall(mcp, subject.create.capability_id, input);
  assert.notEqual(fromMcp.result.isError, true, JSON.stringify(fromMcp.result));
  results.push({ task: object(fromMcp.body.task), callId: fromMcp.callId, actor: clientId, audience: "mcp" });
  assertChanged(2);
  const beforeLowPort = await home.web.get(subject.path(project.project_id)), lowPortId = newCallId();
  await withCallId(lowPortId, () => assert.rejects(home.host.client(project.reference).invoke(subject.create, input), { code: "actions.forbidden" }));
  assert.equal(row(home, lowPortId, subject.create.capability_id).code, "actions.forbidden");
  assert.deepEqual(await home.web.get(subject.path(project.project_id)), beforeLowPort, "the low port borrows no ambient write permission");
  assertChanged(2);
  const sdk = await scheduleSdk(t, home, project);
  const typedId = newCallId(), fromTyped = await withCallId(typedId, () => sdk.invoke(subject.create, input));
  results.push({ task: object(fromTyped.task), callId: typedId, actor: "schedule-sdk-owner", audience: "plugin" });
  assertChanged(3);
  for (const result of results) {
    const record = row(home, result.callId, subject.create.capability_id);
    assert.deepEqual([record.ok, record.operation, record.actor_id, record.audience, record.project_id, record.path],
      [true, "command", result.actor, result.audience, project.project_id, undefined]);
    assert.deepEqual([result.task.title, result.task.instructions, result.task.clock_label, result.task.enabled, result.task.archived],
      [input.title, input.instructions, time, true, false]);
    assert.ok(typeof result.task.next_due_at === "string");
    assert.ok(Math.abs(Date.parse(result.task.next_due_at) - target.getTime()) < 60_000, JSON.stringify(result.task));
  }
  assert.equal(new Set(results.map(result => result.callId)).size, 3);
  const persisted = await home.web.get<{ tasks: Array<{ task_id: string; title: string; clock_label: string; enabled: boolean }> }>(subject.path(project.project_id));
  for (const result of results) assert.ok(persisted.tasks.some(task => task.task_id === result.task.task_id && task.title === input.title && task.clock_label === time && task.enabled));
});

// R8 batches 3 and 4 (RAC-180, RAC-182): the Agent service is plugin-only actions, so the refusals here are the action service's, each
// recorded, and the identity a session is opened for is never the request's to give.
test("W3-09-1-01 T4: the Agent service records refusals, requires its original plugin identity and leaves successful reads unrecorded", { timeout: 60_000 }, async t => {
  let actions: BoundActionClient | undefined;
  const definition: PluginDefinition = {
    manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.cross-entry-service", version: "1.0.0", name: "Typed service fixture", kind: "app",
      publisher: { publisher_id: "fixture", signature: "typed-service-fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
      permissions: [], capabilities: { provides: [], consumes: [service.createSession.capability_id, service.listRuntimes.capability_id] },
      artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [] },
    async start(context) { actions = context.services?.actions; return { kind: "app", views: [], actions: [] }; }, async stop() {},
  };
  const home = await openTestHome(t, { host: { pluginFixtures: { project: [definition] } } });
  const project = await home.createProject("Cross entry typed service", ["schedule"]);
  await home.host.inspectActions({ actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: [] }, project.reference);
  assert.ok(actions, "the production executor opened the fixture's declared service port");
  const changed = t.mock.method(home.host.search!, "changed");
  const fields = (record: ReturnType<typeof row>) => [record.operation, record.actor_id, record.audience, record.ok, record.code, record.refused];
  // A caller that is not a plugin has no plugin identity to open a session for: refused before any Runtime is asked.
  const directId = newCallId();
  await withCallId(directId, () => assert.rejects(home.host.client(project.reference).invoke(service.createSession, ["prologue", { title: "refused" }] as never),
    { code: "actions.forbidden" }));
  assert.deepEqual(fields(row(home, directId, service.createSession.capability_id)), ["command", "local-host", "user", false, "actions.forbidden", true]);
  // The plugin's own call cannot name another owner: the schema refuses the forged identity.
  const native = actions, forgedId = newCallId();
  const forged = ["prologue", { project_id: "foreign", plugin_id: "io.molis.work.other", install_id: "foreign", actor_id: "foreign", title: "refused" }] as never;
  await withCallId(forgedId, () => assert.rejects(native.invoke(service.createSession, forged), { code: "actions.input_invalid" }));
  assert.deepEqual(fields(row(home, forgedId, service.createSession.capability_id)), ["command", "web-user", "plugin", false, "actions.input_invalid", true]);
  // Without a forged owner the same call reaches the service as the plugin, whose refusal is recorded as the service's own.
  const missingId = newCallId();
  await withCallId(missingId, () => assert.rejects(native.invoke(service.createSession, ["no-such-runtime", { title: "own" }] as never), { code: "agent.runtime_unknown" }));
  assert.deepEqual(fields(row(home, missingId, service.createSession.capability_id)), ["command", "web-user", "plugin", false, "agent.runtime_unknown", undefined]);
  const readId = newCallId();
  assert.ok(Array.isArray(await withCallId(readId, () => native.invoke(service.listRuntimes, []))));
  assert.deepEqual(home.host.callLog!.find(readId), [], "a successful query is not a platform command");
  assert.equal(changed.mock.calls.length, 0, "the Agent service creates no plugin owner-change signal");
});

test("W3-09-1-01 T2: an owner refusal preserves its literal error and each page/MCP/SDK action diagnostic row without changing tasks", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Cross entry refusals", ["schedule"]);
  await home.grant(clientId, project.project_id, [subject.create, subject.archive, subject.list]);
  const mcp = mcpFor(home, project); t.after(() => mcp.close());
  const path = subject.path(project.project_id), before = await home.web.get(path);
  const refusedPage = await page(home, path + "/tasks/missing/archive", {});
  assert.equal(refusedPage.status, 404); assert.equal(refusedPage.body.code, subject.missing.code); assert.equal(refusedPage.body.error, subject.missing.message);
  assert.equal(refusedPage.callId, refusedPage.body.call_id);
  const refusedMcp = await mcpCall(mcp, subject.archive.capability_id, { task_id: "missing" });
  assert.equal(refusedMcp.result.isError, true); assert.equal(refusedMcp.body.code, subject.missing.code); assert.equal(refusedMcp.body.error, subject.missing.message);
  const typedId = newCallId();
  const sdk = await scheduleSdk(t, home, project);
  await withCallId(typedId, () => assert.rejects(sdk.invoke(subject.archive, { task_id: "missing" }), subject.missing));
  for (const id of [refusedPage.callId, refusedMcp.body.call_id, typedId]) {
    const record = row(home, id, subject.archive.capability_id);
    assert.deepEqual([record.ok, record.code, record.refused, record.operation], [false, subject.missing.code, undefined, "command"]);
  }
  const again = await page(home, path + "/tasks/missing/archive", {});
  assert.equal(again.status, 404); assert.notEqual(again.callId, refusedPage.callId);
  row(home, again.callId, subject.archive.capability_id); row(home, refusedPage.callId, subject.archive.capability_id);
  assert.deepEqual(await home.web.get(path), before, "all refused paths leave the owner's persisted tasks unchanged");
});

test("W3-09-1-01 T7: stale Home Todo revisions refuse page and actual MCP equally, with no new item or history", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Home scope caller");
  await home.grant(clientId, null, [todo.create, todo.get, todo.status]);
  const mcp = mcpFor(home, project); t.after(() => mcp.close());
  const created = await page(home, "/api/plugins/io.molis.work.todo/items", { title: "本人保留的真实待办" });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const item = object(created.body.item); assert.ok(typeof item.id === "string"); assert.ok(typeof item.revision === "number");
  const path = `/api/plugins/io.molis.work.todo/items/${encodeURIComponent(item.id)}`;
  const updated = await page(home, path + "/status", { status: "doing", expected_revision: item.revision });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  const before = await home.web.get(path), stale = { id: item.id, status: "done", expected_revision: item.revision };
  const refusedPage = await page(home, path + "/status", { status: stale.status, expected_revision: stale.expected_revision });
  assert.equal(refusedPage.status, 409); assert.equal(refusedPage.body.code, todo.conflict); assert.equal(refusedPage.callId, refusedPage.body.call_id);
  const refusedMcp = await mcpCall(mcp, todo.status.capability_id, stale);
  assert.equal(refusedMcp.result.isError, true); assert.equal(refusedMcp.body.code, todo.conflict);
  for (const [id, expectedProject] of [[refusedPage.callId, null], [refusedMcp.body.call_id, project.project_id]]) {
    const record = row(home, id, todo.status.capability_id);
    assert.deepEqual([record.ok, record.code, record.project_id, record.refused], [false, todo.conflict, expectedProject, undefined]);
  }
  assert.notEqual(refusedPage.callId, refusedMcp.body.call_id);
  assert.deepEqual(await home.web.get(path), before, "refusals preserve the current revision, status and complete owner history");
});

test("W3-09-1-01 T5: a real Shelf page caller retains the operation id on schema refusal before any owner write", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Literal page caller", ["shelf"]);
  const path = `/projects/${encodeURIComponent(project.project_id)}/api/plugins/io.molis.work.shelf`;
  const before = await home.web.get(path + "/");
  const refused = await page(home, path + "/items", { text: "原材料保留", title: "x".repeat(201) });
  assert.equal(refused.status, 400); assert.equal(refused.body.code, "actions.input_invalid");
  assert.equal(refused.callId, refused.body.call_id);
  const record = row(home, refused.callId, shelfActions.admit.capability_id);
  // A Home plugin route under a project's prefix runs in that project, so the row names the page's project.
  assert.deepEqual([record.ok, record.code, record.refused, record.project_id, record.actor_id], [false, "actions.input_invalid", true, project.project_id, "web-user"]);
  assert.deepEqual(await home.web.get(path + "/"), before, "invalid material creates no Shelf item or job");
});

test("W3-09-1-01 T6: a stopped Runtime withdraws its actions and rejects page and saved gateway access without owner writes", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Disabled cross entry", ["schedule"]);
  await home.grant(clientId, project.project_id, [subject.create, subject.list]);
  const path = subject.path(project.project_id), before = await home.web.get(path);
  const connection = await home.mcp(clientId, project.project_id);
  await home.web.delete(`/api/settings/projects/${encodeURIComponent(project.project_id)}/plugins`, { plugin_id: "schedule" });
  const input = subject.input("停用后不得新建", "23:00");
  const refusedPage = await page(home, path + "/tasks", input);
  assert.equal(refusedPage.status, 403); assert.equal(refusedPage.body.code, "actions.plugin_disabled");
  assert.equal(refusedPage.callId, null); assert.equal(refusedPage.body.call_id, undefined, "the page is rejected before entering an action");
  assert.ok(typeof refusedPage.body.error === "string");
  const gatewayId = newCallId();
  await withCallId(gatewayId, () => assert.rejects(connection.client.invoke(connection.caller, subject.create, input),
    { code: "actions.missing" }));
  const typedId = newCallId();
  await withCallId(typedId, () => assert.rejects(home.host.client(project.reference).invoke(subject.create, input),
    { code: "actions.dependency_missing" }));
  assert.equal(row(home, typedId, subject.create.capability_id).code, "actions.dependency_missing");
  const diagnostics = await fetch(home.origin + "/settings/diagnostics?call=" + typedId.slice(0, 8));
  assert.equal(diagnostics.status, 200);
  const html = await diagnostics.text();
  assert.ok(html.includes(`data-molis-call-id="${typedId}"`));
  assert.match(html, /actions\.dependency_missing/u); assert.match(html, /未执行/u);
  await home.web.post(`/api/settings/projects/${encodeURIComponent(project.project_id)}/plugins`, { plugin_id: "schedule" });
  assert.deepEqual(await home.web.get(path), before, "reenabling exposes the unchanged owner's task facts");
});

test("W3-09-2-01: a stopped Runtime removes the MCP tool even with a saved grant; reenabling preserves owner facts and revocation still applies", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Named unavailable action", ["schedule"]);
  await home.grant(clientId, project.project_id, [subject.create, subject.list]);
  const path = subject.path(project.project_id), before = await home.web.get(path);
  const mcp = mcpFor(home, project); t.after(() => mcp.close());
  await home.web.delete(`/api/settings/projects/${encodeURIComponent(project.project_id)}/plugins`, { plugin_id: "schedule" });
  const input = subject.input("隐藏能力不得写入", "23:00"), fromMcp = await mcpCall(mcp, subject.create.capability_id, input, false);
  assert.equal(fromMcp.result.isError, true); assert.equal(fromMcp.body.code, "mcp.tool_unknown");
  assert.ok(typeof fromMcp.body.error === "string");
  assert.equal(fromMcp.body.call_id, undefined, "an unregistered tool never starts a platform invocation");
  assert.equal(home.host.callLog!.recent(100).filter(row => row.capability_id === subject.create.capability_id).length, 0);
  const ungranted = await mcp.handleMessage({ jsonrpc: "2.0", id: 3, method: "tools/call", params: {
    name: `molis_work_v1_action_${subject.archive.capability_id}__v1`, arguments: { task_id: "missing" } } });
  assert.match(JSON.stringify(ungranted), /mcp\.tool_unknown/u);
  assert.equal(home.host.callLog!.recent(100).filter(row => row.capability_id === subject.archive.capability_id).length, 0);
  await home.web.post(`/api/settings/projects/${encodeURIComponent(project.project_id)}/plugins`, { plugin_id: "schedule" });
  assert.deepEqual(await home.web.get(path), before, "the denied calls preserve actual owner facts after reenabling");
  await home.revoke(clientId, project.project_id, [subject.create]);
  const denied = await mcp.handleMessage({ jsonrpc: "2.0", id: 4, method: "tools/call", params: {
    name: `molis_work_v1_action_${subject.create.capability_id}__v1`, arguments: input } });
  // Removing the saved grant makes this dynamic tool unknown; no second Host row is made.
  assert.match(JSON.stringify(denied), /mcp\.tool_unknown/u);
  assert.equal(home.host.callLog!.recent(100).filter(row => row.capability_id === subject.create.capability_id).length, 0, "revoked authority never enters the Host");
});

test("W3-09-3-01/02: actual Home Todo MCP writes require complete read revisions while the person's page keeps its contract", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Versioned external caller");
  await home.grant(clientId, null, [todo.create, todo.get, todo.status, todo.batch]);
  const mcp = mcpFor(home, project); t.after(() => mcp.close());
  const first = await page(home, "/api/plugins/io.molis.work.todo/items", { title: "第一个真实待办" }), second = await page(home, "/api/plugins/io.molis.work.todo/items", { title: "第二个真实待办" });
  assert.equal(first.status, 200); assert.equal(second.status, 200);
  const a = object(first.body.item), b = object(second.body.item);
  assert.ok(typeof a.id === "string" && typeof b.id === "string" && typeof a.revision === "number" && typeof b.revision === "number");
  const ids = [a.id, b.id], paths = ids.map(id => `/api/plugins/io.molis.work.todo/items/${encodeURIComponent(id)}`), before = await Promise.all(paths.map(path => home.web.get(path)));
  for (const expected of [undefined, {}, { [a.id]: a.revision }]) {
    const input = { ids, change: { status: "doing" }, ...(expected === undefined ? {} : { expected_revisions: expected }) };
    const refused = await mcpCall(mcp, todo.batch.capability_id, input);
    assert.equal(refused.result.isError, true); assert.equal(refused.body.code, "actions.version_required");
    const record = row(home, refused.body.call_id, todo.batch.capability_id);
    assert.deepEqual([record.code, record.refused, record.ok], ["actions.version_required", true, false]);
    assert.deepEqual(await Promise.all(paths.map(path => home.web.get(path))), before, "missing or incomplete prerequisites change neither item nor history");
  }
  const invalid = await mcpCall(mcp, todo.batch.capability_id, { ids, change: { status: "doing" }, expected_revisions: null });
  assert.equal(invalid.body.code, "actions.input_invalid");
  assert.deepEqual(await Promise.all(paths.map(path => home.web.get(path))), before);
  const changed = await mcpCall(mcp, todo.batch.capability_id, { ids, change: { status: "doing" }, expected_revisions: { [a.id]: a.revision, [b.id]: b.revision } });
  assert.notEqual(changed.result.isError, true, JSON.stringify(changed.result));
  for (const [index, path] of paths.entries()) {
    const state = await home.web.get<{ item: { status: string; revision: number } }>(path);
    assert.equal(state.item.status, "doing"); assert.equal(state.item.revision, Number([a.revision, b.revision][index]) + 1);
  }
  const fromPerson = await page(home, paths[0]! + "/status", { status: "done" });
  assert.equal(fromPerson.status, 200, "the person's existing optional-version HTTP contract is preserved");
  assert.equal((await home.web.get<{ item: { status: string } }>(paths[0]!)).item.status, "done");
});
