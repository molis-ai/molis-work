import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import test from "node:test";
import { contextTool, homeContextHost, homeContextStdio } from "./fixtures/home-context-host.js";
import { homeStorageTree } from "./fixtures/home-storage-files.js";
import { storageOwnerProcesses } from "./fixtures/home-storage-owner.js";

test("S-07 RAC-105-A-09: shipped stdio shares the resident Home for context tools, replay, restart restoration and late panel alias", { timeout: 180_000 }, async t => {
  const peers = storageOwnerProcesses(t), resident = await homeContextHost(t);
  const projects = await resident.catalog({ homeDirectory: resident.home }, async catalog => {
    const one = await catalog.createProject({ display_name: "已有项目", actor_id: "fixture-user" });
    const two = await catalog.createProject({ display_name: "另一个项目", actor_id: "fixture-user" });
    const panel = catalog.openDesktopPanel({ project_id: one.project_id, goal_id: "fixture-goal", runtime_kind: "codex", launch_command: "codex", actor_id: "fixture-user", user_confirmed: true });
    return { one, two, panel };
  });
  const client = await homeContextStdio(t, { ...resident, panelId: projects.panel.panel_id, workContext: projects.panel.work_context_id });
  const peer = await peers.start(join(resident.home, "agent-runtime"));
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
  const forgedBeforeAlias = await client.callTool({ name: "molis_work_v1_context_bind",
    arguments: { project_id: projects.two.project_id, user_confirmed: true, actor_id: "fixture-user" }, _meta: { "molis-work/sessionId": "refused-native-session" } });
  assert.equal(forgedBeforeAlias.isError, true); assert.match(JSON.stringify(forgedBeforeAlias), /mcp.unexpected_field/);
  assert.equal(await resident.catalog({ homeDirectory: resident.home }, catalog => catalog.getDesktopPanel(projects.panel.panel_id).host_session_id), null,
    "a tool-supplied actor is refused before the protocol Session alias writes anything");
  type Resolution = { status: string; connection: { project_id: string } | null };
  assert.equal((await contextTool<Resolution>(client, "context_resolve")).connection?.project_id, projects.one.project_id);
  const refused = await client.callTool({ name: "molis_work_v1_context_bind", arguments: { project_id: projects.two.project_id, user_confirmed: true } });
  assert.equal(refused.isError, true); assert.match(JSON.stringify(refused), /rebind_confirmation_required/);
  const switched = await contextTool<Resolution>(client, "context_bind", { project_id: projects.two.project_id, user_confirmed: true, rebind_confirmed: true });
  assert.equal(switched.connection?.project_id, projects.two.project_id);
  await contextTool(client, "context_unbind", { user_confirmed: true });
  const workspace = await mkdtemp(join(tmpdir(), "home-context-rejection-workspace-"));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const rejection = await homeContextStdio(t, { ...resident, workContext: "fresh-rejection-session", sessionTitle: "已有项目", workspace });
  const suggestions = await contextTool<{ suggested_projects: Array<{ project_id: string }> }>(rejection, "context_resolve");
  assert.ok(suggestions.suggested_projects.some(project => project.project_id === projects.one.project_id));
  assert.equal((await contextTool<{ changed: boolean }>(rejection, "context_reject_suggestion", { project_id: projects.one.project_id, user_confirmed: true })).changed, true);
  await rejection.close();
  const input = { display_name: "真正由常驻服务创建", user_confirmed: true, idempotency_key: "create-from-real-stdio" };
  const created = await contextTool<Resolution>(client, "context_create_and_bind", input);
  assert.ok(created.connection);
  assert.equal((await contextTool<Resolution>(client, "context_create_and_bind", input)).connection?.project_id, created.connection.project_id);
  const forged = await client.callTool({ name: "molis_work_v1_context_bind", arguments: { project_id: projects.one.project_id, user_confirmed: true, rebind_confirmed: true, actor_id: "fixture-user" } });
  assert.equal(forged.isError, true); assert.match(JSON.stringify(forged), /mcp.unexpected_field/);
  await contextTool(client, "context_list_projects", {}, { "molis-work/sessionId": "late-native-session" });
  const persisted = await resident.catalog({ homeDirectory: resident.home }, catalog => ({
    projects: catalog.listProjects(), panel: catalog.getDesktopPanel(projects.panel.panel_id),
    events: catalog.listRuntimeContextBindingEvents({ runtime_id: "codex", stable_work_context_id: projects.panel.work_context_id, host_declares_stable: true }),
  }));
  assert.equal(persisted.projects.filter(project => project.display_name === input.display_name).length, 1);
  assert.equal(persisted.panel.host_session_id, "late-native-session");
  assert.ok(persisted.events.some(event => event.project_id === created.connection!.project_id && event.actor_id === `runtime:codex:${projects.panel.work_context_id}`));
  const deleted = await contextTool<{ deletion: { actor_id: string } }>(client, "project_delete", { project_id: created.connection.project_id, delete_confirmed: true, idempotency_key: "delete-from-real-stdio" });
  assert.equal(deleted.deletion.actor_id, `runtime:codex:${projects.panel.work_context_id}`);
  await contextTool(client, "project_delete", { project_id: created.connection.project_id, delete_confirmed: true, idempotency_key: "delete-from-real-stdio" });
  await contextTool(client, "context_bind", { project_id: projects.two.project_id, user_confirmed: true });
  await client.close();
  const restarted = await homeContextStdio(t, { ...resident, workContext: projects.panel.work_context_id });
  assert.ok((await restarted.listTools()).tools.some(tool => tool.name === "molis_work_v1_context_resolve"));
  assert.equal((await contextTool<Resolution>(restarted, "context_resolve")).connection?.project_id, projects.two.project_id);
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
  await restarted.close(); await peer.stop();
});

test("S-03/S-07 RAC-105-A-10: context transport refuses foreign authority, open metadata, stale instances and one-time replay without business writes", { timeout: 60_000 }, async t => {
  const resident = await homeContextHost(t);
  const homeId = createHash("sha256").update(resolve(resident.home)).digest("hex"), endpoint = resident.origin + "/api/internal/runtime-context";
  const metadata = { runtimeContext: { runtime_id: "codex", stable_work_context_id: "wire-session", host_declares_stable: true } };
  const protocol = { runtimeSessionId: "wire-native", runtimeSessionIdSource: "threadId" };
  const envelope = { operation: "tool", home_id: homeId, instance_id: resident.host.instanceId, metadata, protocol, call_id: randomUUID(),
    tool: { name: "molis_work_v1_context_create_and_bind", arguments: { display_name: "forbidden", user_confirmed: true, idempotency_key: "forbidden-create" } } };
  const send = (body: unknown, headers: Record<string, string> = {}, raw?: string) => fetch(endpoint, { method: "POST", headers: {
    origin: resident.origin, "content-type": "application/json", "x-molis-work-control-token": resident.token, "x-molis-work-idempotency-key": randomUUID(), ...headers,
  }, body: raw ?? JSON.stringify(body) });
  const original = homeStorageTree(resident.home);
  const badHeaders: Record<string, string>[] = [{ origin: "https://foreign.invalid" }, { "x-molis-work-control-token": "wrong-token" }, { "x-molis-work-control-token": "" }];
  for (const headers of badHeaders) assert.equal((await send(envelope, headers)).status, 403);
  for (const patch of [{ actor_id: "fixture-user" }, { database_path: join(resident.home, "projects", "untrusted.db") }, { operation: "sql" }, { operation: ["tool"] }, { operation: { toString: "tool" } },
    { metadata: { ...metadata, actor_id: "fixture-user" } }, { metadata: { ...metadata, homeDirectory: resident.home } },
    { metadata: { runtimeContext: { ...metadata.runtimeContext, project_id: "forged" } } },
    { metadata: { runtimeContext: { ...metadata.runtimeContext, runtime_id: " " } } },
    { protocol: { ...protocol, actor_id: "fixture-user" } }, { protocol: { ...protocol, runtimeSessionIdSource: "arguments" } },
    { tool: { ...envelope.tool, database_path: "/elsewhere.db" } }, { tool: { name: "arbitrary_tool", arguments: {} } }]) assert.equal((await send({ ...envelope, ...patch })).status, 400);
  const wrongHome = await send({ ...envelope, home_id: "another-home" }); assert.equal(wrongHome.status, 403);
  const replaced = await send({ ...envelope, instance_id: "old-instance" }); assert.equal(replaced.status, 409);
  assert.equal((await send([], {}, undefined)).status, 400);
  assert.equal((await send({}, {}, "{")).status, 400);
  assert.equal((await send({}, {}, " ".repeat(64 * 1024 + 1))).status, 413);
  const key = randomUUID();
  const describe = { operation: "describe", home_id: homeId };
  assert.equal((await send(describe, { "x-molis-work-idempotency-key": key })).status, 200);
  assert.equal((await send(describe, { "x-molis-work-idempotency-key": key })).status, 409);
  assert.deepEqual(homeStorageTree(resident.home), original);
});
