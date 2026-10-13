import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalMcpServer } from "@molis-ai/molis-work-app-local-host";
import { newCallId, withCallId } from "@molis-ai/molis-work-kernel";
import { scheduleCapabilities } from "@molis-ai/molis-work-contracts/services/scheduler";
import type { PluginCapabilityClient, PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { shelfActions } from "@molis-ai/molis-work-plugin-shelf";
import { openTestHome, type TestHome, type TestProject } from "./fixtures/test-home.js";
import { crossEntrySchedule as subject, crossEntryTodo as todo, isCrossEntryObject } from "./fixtures/cross-entry-subjects.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const clientId = "runtime:cross-entry";
function object(value: unknown) { assert.ok(isCrossEntryObject(value), JSON.stringify(value)); return value; }
async function page(home: TestHome, path: string, input: unknown) {
  const response = await fetch(home.origin + path, { method: "POST", headers: { origin: home.origin, "content-type": "application/json",
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

test("W3-09-1-01 T1: page, actual MCP tool and typed-to-action creates agree on owner facts and findable operation ids", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Cross entry", ["schedule"]);
  await home.grant(clientId, project.project_id, [subject.create, subject.archive, subject.list]);
  const mcp = mcpFor(home, project); t.after(() => mcp.close());
  assert.ok(home.host.search);
  const changed = t.mock.method(home.host.search, "changed");
  const assertChanged = (expected: number) => assert.equal(changed.mock.calls.filter(call => call.arguments[0] === "schedule" && call.arguments[1] === project.project_id).length, expected);
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
  const typedId = newCallId(), fromTyped = await withCallId(typedId, () => home.host.client(project.reference).invoke(subject.create, input));
  results.push({ task: object(fromTyped.task), callId: typedId, actor: "local-host", audience: "user" });
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

test("W3-09-1-01 T4: the actual typed service records refusals, requires its original plugin identity and leaves successful reads unrecorded", { timeout: 60_000 }, async t => {
  let client: PluginCapabilityClient | undefined;
  const definition: PluginDefinition = {
    manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.cross-entry-service", version: "1.0.0", name: "Typed service fixture", kind: "app",
      publisher: { publisher_id: "fixture", signature: "typed-service-fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
      permissions: [], capabilities: { provides: [], consumes: [scheduleCapabilities.cancel.capability_id, scheduleCapabilities.list.capability_id] },
      artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [] },
    async start(context) { client = context.services?.capabilities; return { kind: "app", views: [], actions: [] }; }, async stop() {},
  };
  const home = await openTestHome(t, { host: { pluginFixtures: { project: [definition] } } });
  const project = await home.createProject("Cross entry typed service", ["schedule"]);
  await home.host.withProject(project.reference, () => undefined);
  assert.ok(client, "the production executor opened the fixture's declared service port");
  const changed = t.mock.method(home.host.search!, "changed");
  const directId = newCallId();
  await withCallId(directId, () => assert.rejects(home.host.client(project.reference).invoke(scheduleCapabilities.cancel, { job_id: "missing" }),
    { code: "schedule_job_invalid", message: "插件身份无效" }));
  const direct = row(home, directId, scheduleCapabilities.cancel.capability_id);
  assert.deepEqual([direct.path, direct.actor_id, direct.ok, direct.code], ["typed", "local-host", false, "schedule_job_invalid"]);
  const native = client, missingId = newCallId();
  await withCallId(missingId, () => assert.rejects(native.invoke(scheduleCapabilities.cancel, { job_id: "missing" }),
    { code: "schedule_job_not_found", message: "定时任务不存在" }));
  const missing = row(home, missingId, scheduleCapabilities.cancel.capability_id);
  assert.deepEqual([missing.path, missing.ok, missing.code], ["typed", false, "schedule_job_not_found"]);
  const readId = newCallId();
  assert.deepEqual(await withCallId(readId, () => native.invoke(scheduleCapabilities.list, {})), { jobs: [] });
  assert.deepEqual(home.host.callLog!.find(readId), [], "a successful typed query is not a platform command");
  assert.equal(changed.mock.calls.length, 0, "the typed service creates no plugin owner-change signal");
});

test("W3-09-1-01 T2: an owner refusal preserves its literal error and each page/MCP/typed diagnostic row without changing tasks", { timeout: 60_000 }, async t => {
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
  await withCallId(typedId, () => assert.rejects(home.host.client(project.reference).invoke(subject.archive, { task_id: "missing" }), subject.missing));
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
  const created = await page(home, "/api/todo", { title: "本人保留的真实待办" });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const item = object(created.body.item); assert.ok(typeof item.id === "string"); assert.ok(typeof item.revision === "number");
  const path = `/api/todo/${encodeURIComponent(item.id)}`;
  const updated = await page(home, path + "/status", { status: "doing", expected_revision: item.revision });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  const before = await home.web.get(path), stale = { id: item.id, status: "done", expected_revision: item.revision };
  const refusedPage = await page(home, path + "/status", { status: stale.status, expected_revision: stale.expected_revision });
  assert.equal(refusedPage.status, 409); assert.equal(refusedPage.body.code, todo.conflict); assert.equal(refusedPage.callId, refusedPage.body.call_id);
  const refusedMcp = await mcpCall(mcp, todo.status.capability_id, stale);
  assert.equal(refusedMcp.result.isError, true); assert.equal(refusedMcp.body.code, todo.conflict);
  for (const id of [refusedPage.callId, refusedMcp.body.call_id]) {
    const record = row(home, id, todo.status.capability_id);
    assert.deepEqual([record.ok, record.code, record.project_id, record.refused], [false, todo.conflict, null, undefined]);
  }
  assert.notEqual(refusedPage.callId, refusedMcp.body.call_id);
  assert.deepEqual(await home.web.get(path), before, "refusals preserve the current revision, status and complete owner history");
});

test("W3-09-1-01 T5: a real Shelf page caller retains the operation id on schema refusal before any owner write", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Literal page caller", ["shelf"]);
  const path = `/projects/${encodeURIComponent(project.project_id)}/api/shelf`;
  const before = await home.web.get(path);
  const refused = await page(home, path + "/items", { text: "原材料保留", title: "x".repeat(201), capture_pages: false });
  assert.equal(refused.status, 400); assert.equal(refused.body.code, "actions.input_invalid");
  assert.equal(refused.callId, refused.body.call_id);
  const record = row(home, refused.callId, shelfActions.admit.capability_id);
  assert.deepEqual([record.ok, record.code, record.refused, record.project_id, record.actor_id], [false, "actions.input_invalid", true, null, "web-user"]);
  assert.deepEqual(await home.web.get(path), before, "invalid material creates no Shelf item or job");
});

test("W3-09-1-01 T6: a disabled ordinary plugin returns the same 403 refusal through its page and actual Host gateway, with findable rows and no owner write", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Disabled cross entry", ["schedule"]);
  await home.grant(clientId, project.project_id, [subject.create, subject.list]);
  const path = subject.path(project.project_id), before = await home.web.get(path);
  const connection = await home.mcp(clientId, project.project_id);
  await home.web.delete(`/api/settings/projects/${encodeURIComponent(project.project_id)}/plugins`, { plugin_id: "schedule" });
  const input = subject.input("停用后不得新建", "23:00");
  const refusedPage = await page(home, path + "/tasks", input);
  assert.equal(refusedPage.status, 403); assert.equal(refusedPage.body.code, "actions.plugin_disabled");
  assert.equal(refusedPage.callId, refusedPage.body.call_id); assert.ok(typeof refusedPage.body.error === "string");
  const gatewayId = newCallId();
  await withCallId(gatewayId, () => assert.rejects(connection.client.invoke(connection.caller, subject.create, input),
    { code: "actions.plugin_disabled", message: refusedPage.body.error }));
  const typedId = newCallId();
  await withCallId(typedId, () => assert.rejects(home.host.client(project.reference).invoke(subject.create, input),
    { code: "actions.plugin_disabled", message: refusedPage.body.error }));
  for (const id of [refusedPage.callId, gatewayId, typedId]) {
    const record = row(home, id, subject.create.capability_id);
    assert.deepEqual([record.ok, record.code, record.refused], [false, "actions.plugin_disabled", true]);
    const diagnostics = await fetch(home.origin + "/settings/diagnostics?call=" + String(id).slice(0, 8));
    assert.equal(diagnostics.status, 200);
    const html = await diagnostics.text();
    assert.ok(html.includes(`data-molis-call-id="${id}"`), "the real diagnostics page offers the actual operation number for copying");
    assert.match(html, /actions\.plugin_disabled/u); assert.match(html, /未执行/u);
  }
  await home.web.post(`/api/settings/projects/${encodeURIComponent(project.project_id)}/plugins`, { plugin_id: "schedule" });
  assert.deepEqual(await home.web.get(path), before, "reenabling exposes the unchanged owner's task facts");
});

test("W3-09-2-01: a real MCP tool hidden after plugin disable still reaches the Host under its exact saved grant and records one refusal", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Named unavailable action", ["schedule"]);
  await home.grant(clientId, project.project_id, [subject.create, subject.list]);
  const path = subject.path(project.project_id), before = await home.web.get(path);
  const mcp = mcpFor(home, project); t.after(() => mcp.close());
  await home.web.delete(`/api/settings/projects/${encodeURIComponent(project.project_id)}/plugins`, { plugin_id: "schedule" });
  const input = subject.input("隐藏能力不得写入", "23:00"), fromMcp = await mcpCall(mcp, subject.create.capability_id, input, false);
  assert.equal(fromMcp.result.isError, true); assert.equal(fromMcp.body.code, "actions.plugin_disabled");
  assert.ok(typeof fromMcp.body.error === "string");
  const record = row(home, fromMcp.body.call_id, subject.create.capability_id);
  assert.deepEqual([record.ok, record.code, record.refused, record.actor_id, record.audience, record.project_id],
    [false, "actions.plugin_disabled", true, clientId, "mcp", project.project_id]);
  assert.equal(home.host.callLog!.find(String(fromMcp.body.call_id)).length, 1, "the named tool does not create a second diagnostic or typed row");
  const ungranted = await mcp.handleMessage({ jsonrpc: "2.0", id: 3, method: "tools/call", params: {
    name: `molis_work_v1_action_${subject.archive.capability_id}__v1`, arguments: { task_id: "missing" } } });
  assert.match(JSON.stringify(ungranted), /mcp\.tool_disabled/u);
  assert.equal(home.host.callLog!.recent(100).filter(row => row.capability_id === subject.archive.capability_id).length, 0);
  await home.web.post(`/api/settings/projects/${encodeURIComponent(project.project_id)}/plugins`, { plugin_id: "schedule" });
  assert.deepEqual(await home.web.get(path), before, "the denied calls preserve actual owner facts after reenabling");
  await home.revoke(clientId, project.project_id, [subject.create]);
  const denied = await mcp.handleMessage({ jsonrpc: "2.0", id: 4, method: "tools/call", params: {
    name: `molis_work_v1_action_${subject.create.capability_id}__v1`, arguments: input } });
  assert.match(JSON.stringify(denied), /mcp\.tool_disabled/u);
  assert.equal(home.host.callLog!.recent(100).filter(row => row.capability_id === subject.create.capability_id).length, 1, "revoked authority does not enter the Host a second time");
});

test("W3-09-3-01/02: actual Home Todo MCP writes require complete read revisions while the person's page keeps its contract", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("Versioned external caller");
  await home.grant(clientId, null, [todo.create, todo.get, todo.status, todo.batch]);
  const mcp = mcpFor(home, project); t.after(() => mcp.close());
  const first = await page(home, "/api/todo", { title: "第一个真实待办" }), second = await page(home, "/api/todo", { title: "第二个真实待办" });
  assert.equal(first.status, 200); assert.equal(second.status, 200);
  const a = object(first.body.item), b = object(second.body.item);
  assert.ok(typeof a.id === "string" && typeof b.id === "string" && typeof a.revision === "number" && typeof b.revision === "number");
  const ids = [a.id, b.id], paths = ids.map(id => `/api/todo/${encodeURIComponent(id)}`), before = await Promise.all(paths.map(path => home.web.get(path)));
  for (const expected of [undefined, {}, { [a.id]: a.revision }]) {
    const input = { ids, change: { kind: "status", status: "doing" }, ...(expected === undefined ? {} : { expected_revisions: expected }) };
    const refused = await mcpCall(mcp, todo.batch.capability_id, input);
    assert.equal(refused.result.isError, true); assert.equal(refused.body.code, "actions.version_required");
    const record = row(home, refused.body.call_id, todo.batch.capability_id);
    assert.deepEqual([record.code, record.refused, record.ok], ["actions.version_required", true, false]);
    assert.deepEqual(await Promise.all(paths.map(path => home.web.get(path))), before, "missing or incomplete prerequisites change neither item nor history");
  }
  const invalid = await mcpCall(mcp, todo.batch.capability_id, { ids, change: { kind: "status", status: "doing" }, expected_revisions: null });
  assert.equal(invalid.body.code, "actions.input_invalid");
  assert.deepEqual(await Promise.all(paths.map(path => home.web.get(path))), before);
  const changed = await mcpCall(mcp, todo.batch.capability_id, { ids, change: { kind: "status", status: "doing" }, expected_revisions: { [a.id]: a.revision, [b.id]: b.revision } });
  assert.notEqual(changed.result.isError, true, JSON.stringify(changed.result));
  for (const [index, path] of paths.entries()) {
    const state = await home.web.get<{ item: { status: string; revision: number } }>(path);
    assert.equal(state.item.status, "doing"); assert.equal(state.item.revision, Number([a.revision, b.revision][index]) + 1);
  }
  const fromPerson = await page(home, paths[0]! + "/status", { status: "done" });
  assert.equal(fromPerson.status, 200, "the person's existing optional-version HTTP contract is preserved");
  assert.equal((await home.web.get<{ item: { status: string } }>(paths[0]!)).item.status, "done");
});
