import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, LocalMcpServer, molisWorkHostProjectReference, openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
import { createGoalIntentCapability, goalsActions, recordGoalNoteCapability } from "@molis-ai/molis-work-plugin-goals";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { createMcpActionGrant, hostActionToolName } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { grantGoalsMcp } from "./fixtures/goals-mcp-grants.js";

test("Goals MCP action tools use client grants and the shared Host, and record the Session as author with replayable receipts", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-mcp-aliases-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Legacy Goals", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  let gate: Promise<void> | undefined, entered: (() => void) | undefined, release: (() => void) | undefined;
  const policies: string[] = [];
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: async (caller, view) => {
    if (view.capability_id === "goals.note") {
      policies.push(caller.actor_id);
      if (gate) { entered!(); await gate; }
    }
    return { available: true };
  } });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host });
  const clientId = "runtime:legacy-goals", session = "legacy-thread", auditActor = `${clientId}:${session}`;
  const context = { runtime_id: "legacy-goals", stable_work_context_id: session, host_declares_stable: true };
  const aliases = { create: "molis_work_v1_action_goals.create__v1", list: "molis_work_v1_action_goals.list__v1", note: "molis_work_v1_action_goals.note__v1", state: "molis_work_v1_action_goals.state.read__v1", events: "molis_work_v1_action_goals.events.list__v1", event: "molis_work_v1_action_goals.events.read__v1" };
  const sdk = new Client({ name: "not-the-authorized-client", version: "1" });
  let pending: Promise<Awaited<ReturnType<typeof sdk.callTool>>> | undefined;
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    await withCatalog({ homeDirectory: home }, c => c.bindRuntimeContext({ context, project_id: project.project_id, actor_id: "user", user_confirmed: true }));
    const registry = await openWorkSessionRegistry({ homeDirectory: home });
    const sessionId = registry.explicitlyLinkSession({ runtime_id: context.runtime_id, native_runtime_session_id: session,
      actor_id: "user", user_confirmed: true, project_id: project.project_id }).session_id;
    registry.close();
    // The Session history MCP must replay is written through the action client. The typed door is the local person.
    const input = { goal_id: "HISTORICAL-GOAL", title: "迁移前目标", outcome: "保留回执", idempotency_key: "historical-create" };
    const sessionCaller = { actor_id: clientId, audit_actor_id: auditActor, actor_kind: "runtime" as const, runtime_session_id: session,
      audience: "mcp" as const, project_id: project.project_id, permissions: ["goals:read", "goals:write"] };
    const prior = bindActionClient(host.actionClient(ref), () => sessionCaller);
    const createdBefore = await prior.invoke(goalsActions.create, input);
    const noteInput = { goal_id: input.goal_id, body: "迁移前便笺", idempotency_key: "historical-note" };
    const noteBefore = await prior.invoke(goalsActions.note, noteInput);
    policies.length = 0;
    const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx",
      fileURLToPath(new URL("../apps/desktop/launchers/mcp/server.ts", import.meta.url))], env: {
      ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      MOLIS_WORK_HOME: home, MOLIS_WORK_WEB_URL: origin, MOLIS_WORK_RUNTIME_ID: context.runtime_id,
      MOLIS_WORK_WORK_CONTEXT_ID: session, MOLIS_WORK_WORK_CONTEXT_STABLE: "true",
    }, stderr: "pipe" });
    let errors = ""; transport.stderr?.on("data", chunk => { errors += String(chunk); });
    await sdk.connect(transport).catch(error => { throw new Error(String(error) + errors); });
    const names = async () => (await sdk.listTools()).tools.map(tool => tool.name);
    for (const alias of Object.values(aliases)) assert.equal((await names()).includes(alias), false);
    assert.equal((await sdk.callTool({ name: aliases.create, arguments: input })).isError, true, "a project binding grants no writes");
    await grantGoalsMcp(host, home, project, clientId);
    const tools = (await sdk.listTools()).tools;
    for (const alias of Object.values(aliases)) assert.ok(tools.some(tool => tool.name === alias));
    for (const alias of tools.filter(tool => Object.values(aliases).includes(tool.name))) {
      for (const key of ["database_path", "project_id", "actor_id", "audit_actor_id", "runtime_session_id"])
        assert.equal(Object.hasOwn(alias.inputSchema.properties ?? {}, key), false);
    }
    async function call<T>(name: string, input: Record<string, unknown>): Promise<T> {
      const result = await sdk.callTool({ name, arguments: input });
      assert.notEqual(result.isError, true, JSON.stringify(result));
      const content = result.content as Array<{ type: string; text?: string }>;
      assert.equal(content[0]?.type, "text");
      return JSON.parse(content[0]!.text!) as T;
    }
    const replay = await call<typeof createdBefore>(aliases.create, input);
    assert.deepEqual(replay, { ...createdBefore, replayed: true });
    assert.deepEqual(await call(aliases.note, noteInput), { ...noteBefore, replayed: true });
    const newInput = { ...noteInput, body: "迁移后原文", idempotency_key: "after-migration" };
    const note = await call<typeof noteBefore>(aliases.note, newInput);
    assert.equal(note.replayed, false);
    assert.deepEqual(await call(aliases.note, newInput), { ...note, replayed: true });
    const stored = await host.withProject(ref, runtime => runtime.coordinator.goalEvents.readEvent(project.project_id, input.goal_id, note.event_id));
    assert.equal(stored.actor_id, auditActor); assert.equal(stored.actor_kind, "runtime");
    assert.equal((stored.payload as { body: string }).body, newInput.body);
    assert.ok(policies.includes(clientId), "policy receives the grant principal, never the historical author");
    assert.equal(policies.includes(auditActor), false);
    const listed = await call<{ goals: Array<{ goal_id: string }> }>(aliases.list, {});
    assert.ok(listed.goals.some(goal => goal.goal_id === input.goal_id));
    const state = await call<{ goal_id: string; intent: { title: string } }>(aliases.state, { goal_id: input.goal_id });
    assert.equal(state.goal_id, input.goal_id); assert.equal(state.intent.title, input.title);
    const eventPage = await call<{ events: Array<{ event_id: string }>; next_cursor: number | null }>(aliases.events, { goal_id: input.goal_id, limit: 1 });
    assert.equal(eventPage.events.length, 1); assert.ok(eventPage.next_cursor);
    const read = await call<typeof stored>(aliases.event, { goal_id: input.goal_id, event_id: note.event_id });
    assert.deepEqual(read, stored);
    const configuredInput = { goal_id: input.goal_id, expected_version: 0, idempotency_key: "mcp-config", types: [{ type_id: "work", version: 1,
      name: "工作", purpose: "保留原文", fields: [{ field_id: "body", name: "正文", purpose: "历史", format: "text", required: true }] }] };
    const configured = await call<{ event_id: string; replayed: boolean }>("molis_work_v1_action_goals.events.configure__v1", configuredInput);
    assert.deepEqual(await call("molis_work_v1_action_goals.events.configure__v1", configuredInput), { ...configured, replayed: true });
    const reportInput = { goal_id: input.goal_id, idempotency_key: "legacy-report", events: [{ type_id: "work", type_version: 1, title: "旧名称报告", fields: { body: "Session 作者保持" } }] };
    const reported = await call<{ events: Array<{ actor_id: string; payload: { body: string } }>; replayed: boolean }>("molis_work_v1_action_goals.events.report__v1", reportInput);
    assert.equal(reported.events[0]?.actor_id, auditActor); assert.equal(reported.events[0]?.payload.body, "Session 作者保持");
    assert.deepEqual(await call("molis_work_v1_action_goals.events.report__v1", reportInput), { ...reported, replayed: true });
    const inspect = await openWorkSessionRegistry({ homeDirectory: home });
    try {
      assert.equal(inspect.get(sessionId).current_goal_id, input.goal_id);
      assert.equal(inspect.events(sessionId).filter(event => event.source_id === `${aliases.note}:after-migration`).length, 1);
    } finally { inspect.close(); }
    for (const field of ["actor_id", "audit_actor_id", "runtime_session_id", "database_path", "project_id"]) {
      assert.equal((await sdk.callTool({ name: aliases.note, arguments: { ...newInput, [field]: "forged" } })).isError, true);
    }
    const caller = { actor_id: clientId, project_id: project.project_id, audience: "mcp" as const, permissions: [] };
    const noteView = (await host.inspectActions(caller, ref)).find(view => view.capability_id === goalsActions.note.capability_id)!;
    const started = new Promise<void>(resolve => { entered = resolve; });
    gate = new Promise<void>(resolve => { release = resolve; });
    pending = sdk.callTool({ name: aliases.note, arguments: { ...newInput, idempotency_key: "revoked-in-flight" } });
    await Promise.race([started, pending.then(() => { throw new Error("Expected an asynchronous policy checkpoint"); })]);
    await writeMcpActionGrant(home, createMcpActionGrant(clientId, project.project_id, noteView, false));
    release!(); assert.equal((await pending).isError, true); pending = undefined; gate = undefined;
    const afterRevoke = await names();
    assert.equal(afterRevoke.includes(aliases.note), false); assert.equal(afterRevoke.includes(hostActionToolName(goalsActions.note)), false);
    const events = await host.withProject(ref, runtime => runtime.coordinator.goalEvents.listEvents(project.project_id, input.goal_id));
    assert.equal(events.events.filter(event => event.kind === "system" && event.payload.operation === "observation_note").length, 2);
    const stateView = (await host.inspectActions(caller, ref)).find(view => view.capability_id === goalsActions.state.capability_id)!;
    await writeMcpActionGrant(home, createMcpActionGrant(clientId, project.project_id, stateView, false));
    const withoutState = await names();
    assert.equal(withoutState.includes(aliases.state), false);
    assert.equal(withoutState.includes(hostActionToolName(goalsActions.state)), false);
    assert.equal((await sdk.callTool({ name: aliases.state, arguments: { goal_id: input.goal_id } })).isError, true);
    assert.equal((await sdk.callTool({ name: hostActionToolName(goalsActions.state), arguments: { goal_id: input.goal_id } })).isError, true);
    assert.ok(withoutState.includes(aliases.event), "revoking state does not revoke a separately granted event query");
    // In production these are separate processes on the same resident service; in one process they share its Host (one Runtime owner per Home).
    const other = new LocalMcpServer(withCatalog, "runtime", { projectId: project.project_id, databasePath: project.database_path,
      webBaseUrl: origin }, { homeDirectory: home, runtimeContext: { ...context, runtime_id: "stranger" } }, host, origin);
    try { await assert.rejects(other.callTool(aliases.list, {}), { code: "mcp.tool_unknown" }, "a client without grants is not shown the action"); } finally { await other.close(); }
    const management = new LocalMcpServer(withCatalog, "management", { projectId: project.project_id, databasePath: project.database_path,
      webBaseUrl: origin }, { homeDirectory: home, runtimeContext: context }, host, origin);
    try {
      assert.ok(JSON.parse(await management.callTool(aliases.list, {})).goals.some((goal: { goal_id: string }) => goal.goal_id === input.goal_id));
      await assert.rejects(management.callTool(aliases.create, { ...input, database_path: project.database_path, actor_id: "user" }), { code: "actions.input_invalid" });
    } finally { await management.close(); }
  } finally {
    release?.(); await pending?.catch(() => undefined); await sdk.close();
    await new Promise<void>(resolve => server.close(() => resolve())); await host.close(); await rm(home, { recursive: true, force: true });
  }
});
