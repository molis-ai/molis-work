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
    // A terminal the platform started (S-103) for a plugin in the first project: its own work context is bound there. The late alias
    // below is RAC-2565's MCP half: the session a runtime reports through MCP is what the terminal resumes (`tests/goals-terminal.test.ts`).
    const panel = await catalog.commit(() => catalog.terminalPanels.insert({ panel_id: "plugin-home-context-fixture", install_id: "fixture-install",
      project_id: one.project_id, actor_id: "fixture-user", key: "fixture", subject: "fixture-goal", runtime: "codex", launch_command: "codex",
      launch_args: [], title: "Codex" }, resident.home));
    return { one, two, panel };
  });
  const client = await homeContextStdio(t, { ...resident, panelId: projects.panel.panel_id, workContext: projects.panel.panel_id });
  const peer = await peers.start(join(resident.home, "agent-runtime"));
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
  const forgedBeforeAlias = await client.callTool({ name: "molis_work_v1_context_bind",
    arguments: { project_id: projects.two.project_id, user_confirmed: true, actor_id: "fixture-user" }, _meta: { "molis-work/sessionId": "refused-native-session" } });
  assert.equal(forgedBeforeAlias.isError, true); assert.match(JSON.stringify(forgedBeforeAlias), /mcp.unexpected_field/);
  assert.equal(await resident.catalog({ homeDirectory: resident.home }, catalog => catalog.terminalPanels.get(projects.panel.panel_id)?.host_session_id), null,
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
    projects: catalog.listProjects(), panel: catalog.terminalPanels.get(projects.panel.panel_id)!,
    events: catalog.listRuntimeContextBindingEvents({ runtime_id: "codex", stable_work_context_id: projects.panel.panel_id, host_declares_stable: true }),
  }));
  assert.equal(persisted.projects.filter(project => project.display_name === input.display_name).length, 1);
  assert.equal(persisted.panel.host_session_id, "late-native-session");
  assert.ok(persisted.events.some(event => event.project_id === created.connection!.project_id && event.actor_id === `runtime:codex:${projects.panel.panel_id}`));
  const deleted = await contextTool<{ deletion: { actor_id: string } }>(client, "project_delete", { project_id: created.connection.project_id, delete_confirmed: true, idempotency_key: "delete-from-real-stdio" });
  assert.equal(deleted.deletion.actor_id, `runtime:codex:${projects.panel.panel_id}`);
  await contextTool(client, "project_delete", { project_id: created.connection.project_id, delete_confirmed: true, idempotency_key: "delete-from-real-stdio" });
  await contextTool(client, "context_bind", { project_id: projects.two.project_id, user_confirmed: true });
  await client.close();
  const restarted = await homeContextStdio(t, { ...resident, workContext: projects.panel.panel_id });
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

test("S-03/S-07 RAC-105-A-GW-02: the retained context deletion gate refuses untrusted requests and only the confirmed service records an actor", { timeout: 60_000 }, async t => {
  const resident = await homeContextHost(t);
  const project = await resident.catalog({ homeDirectory: resident.home }, catalog => catalog.createProject({ display_name: "只能由现行服务删除", actor_id: "fixture-user" }));
  const other = await resident.catalog({ homeDirectory: resident.home }, catalog => catalog.createProject({ display_name: "同一个键不能改删它", actor_id: "fixture-user" }));
  const homeId = createHash("sha256").update(resolve(resident.home)).digest("hex"), endpoint = resident.origin + "/api/internal/runtime-context";
  const input = { project_id: project.project_id, delete_confirmed: true, idempotency_key: "retained-context-delete" };
  const envelope = { operation: "tool", home_id: homeId, instance_id: resident.host.instanceId,
    metadata: { runtimeContext: { runtime_id: "codex", stable_work_context_id: "environment-session", host_declares_stable: true } },
    protocol: { runtimeSessionId: "protocol-session", runtimeSessionIdSource: "threadId" }, call_id: randomUUID(),
    tool: { name: "molis_work_v1_project_delete", arguments: input } };
  const headers = () => ({ origin: resident.origin, "content-type": "application/json", "accept-language": "zh-CN", "x-molis-work-control-token": resident.token, "x-molis-work-idempotency-key": randomUUID() });
  const post = (body: unknown, extra: Record<string, string> = {}) => fetch(endpoint, { method: "POST", headers: { ...headers(), ...extra }, body: JSON.stringify(body) });
  const original = homeStorageTree(resident.home);
  for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
    const response = await fetch(endpoint, { method, headers: headers() });
    assert.equal(response.status, 405, method);
  }
  const badHeaders: Record<string, string>[] = [{ "x-molis-work-control-token": "" }, { "x-molis-work-control-token": "wrong-token" }, { origin: "https://foreign.invalid" }];
  for (const extra of badHeaders) {
    const response = await post(envelope, extra); assert.equal(response.status, 403);
    assert.equal((await response.json() as { code: string }).code, "host.request_refused");
  }
  assert.equal((await post(envelope, { "x-molis-work-idempotency-key": "" })).status, 400);
  for (const [body, status, code] of [
    [{ ...envelope, home_id: "another-home" }, 403, "actions.home_mismatch"],
    [{ ...envelope, instance_id: "old-instance" }, 409, "actions.host_replaced"],
    [{ ...envelope, actor_id: "web-user" }, 400, "actions.input_invalid"],
    [{ ...envelope, metadata: { ...envelope.metadata, actor_id: "web-user" } }, 400, "actions.input_invalid"],
    [{ ...envelope, protocol: { ...envelope.protocol, runtimeSessionId: " " } }, 400, "actions.input_invalid"],
    [{ ...envelope, tool: { ...envelope.tool, arguments: { ...input, actor_id: "web-user" } } }, 400, "mcp.unexpected_field"],
    [{ ...envelope, tool: { ...envelope.tool, arguments: { ...input, delete_confirmed: false } } }, 400, "catalog.delete_confirmation_required"],
    [{ ...envelope, tool: { ...envelope.tool, arguments: { ...input, delete_confirmed: "yes" } } }, 400, "catalog.delete_confirmation_required"],
    [{ ...envelope, tool: { ...envelope.tool, arguments: { ...input, delete_confirmed: undefined } } }, 400, "catalog.delete_confirmation_required"],
  ] as const) {
    const response = await post(body); assert.equal(response.status, status);
    assert.equal((await response.json() as { code: string }).code, code);
  }
  // RAC-105-A-GW-01: the retired URL is no longer an alternative deletion entrance.
  const retired = await fetch(resident.origin + "/api/internal/project-deletion", { method: "POST", headers: headers(),
    body: JSON.stringify({ home_id: homeId, client_id: "runtime:codex", ...input }) });
  assert.equal(retired.status, 400);
  assert.deepEqual(await retired.json(), { error: "请先选择一个 Molis Work 项目" }, "the retired URL reaches the existing generic project guard, never a deletion handler");
  assert.deepEqual(homeStorageTree(resident.home), original, "every refusal preserved all Home business bytes and wrote no deletion receipt");
  const result = await post(envelope); assert.equal(result.status, 200);
  const response = await result.json() as { result: string };
  const receipt = JSON.parse(response.result) as { deletion: { actor_id: string }; replayed: boolean };
  assert.equal(receipt.deletion.actor_id, "runtime:codex:protocol-session", "the Home-token holder supplies protocol metadata; tool arguments never choose the actor");
  assert.equal(receipt.replayed, false);
  const replay = await post(envelope); assert.equal(replay.status, 200);
  assert.equal((JSON.parse((await replay.json() as { result: string }).result) as { replayed: boolean }).replayed, true);
  const beforeConflict = homeStorageTree(resident.home);
  const conflict = await post({ ...envelope, tool: { ...envelope.tool, arguments: { ...input, project_id: other.project_id } } });
  assert.equal(conflict.status, 400);
  assert.equal((await conflict.json() as { code: string }).code, "catalog.deletion_idempotency_conflict");
  assert.deepEqual(homeStorageTree(resident.home), beforeConflict, "reusing the deletion key for another project does not delete or record anything");
});
