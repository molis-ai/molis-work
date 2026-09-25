import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, LocalMcpServer, MolisWorkCasebookIntegration, molisWorkHostProjectReference, openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
import { PURPOSE, VERSION } from "../apps/local-host/src/casebook/contract.js";
import { createGoalIntentCapability, goalsActions, recordGoalNoteCapability } from "@molis-ai/molis-work-plugin-goals";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { createMcpActionGrant, hostActionToolName } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant, writeMcpToolPreference } from "../apps/local-host/src/mcp-settings-store.js";
import { grantGoalsMcp } from "./fixtures/goals-mcp-grants.js";

test("formal Goals MCP aliases use client grants and shared Host while preserving historical Session authors and receipts", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-mcp-aliases-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Legacy Goals", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path });
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
  const aliases = { create: "molis_work_v1_goal_intent_create", list: "molis_work_v1_goal_list", note: "molis_work_v1_event_note", state: "molis_work_v1_goal_state", events: "molis_work_v1_event_list", event: "molis_work_v1_event_read" };
  const sdk = new Client({ name: "not-the-authorized-client", version: "1" });
  const casebook = new MolisWorkCasebookIntegration({ client: host.client(ref), verifyUserAction: () => true });
  await casebook.setInteractionAuthorization({ project_ref: project.project_id, purpose: PURPOSE, action: "join", actor_ref: "fixture-user",
    user_action_ref: "explicit-fixture-consent", user_confirmed: true, idempotency_key: "join" });
  const authorization = await casebook.readInteractionAuthorization({ project_ref: project.project_id, purpose: PURPOSE }) as { authorization_epoch: string | null };
  assert.ok(authorization.authorization_epoch);
  const facts = async () => (await casebook.readInteractionFacts({ project_ref: project.project_id, schema_version: VERSION,
    authorization_epoch: authorization.authorization_epoch!, after_cursor: 0, limit: 100 })).facts;
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
    // These are real pre-migration records with the old session actor, not new adapter output used as its own oracle.
    const input = { goal_id: "HISTORICAL-GOAL", title: "迁移前目标", outcome: "保留回执", idempotency_key: "historical-create" };
    const createdBefore = await host.client(ref).invoke(createGoalIntentCapability, {
      ...input, board_id: project.board_id, actor_id: auditActor, actor_kind: "runtime", source_kind: "runtime",
    });
    const noteInput = { goal_id: input.goal_id, body: "迁移前便笺", idempotency_key: "historical-note" };
    const noteBefore = await host.client(ref).invoke(recordGoalNoteCapability, {
      ...noteInput, board_id: project.board_id, actor_id: auditActor, actor_kind: "runtime",
    });
    policies.length = 0;
    assert.equal((await facts()).length, 4);
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
    assert.equal((await sdk.callTool({ name: aliases.create, arguments: input })).isError, true, "default legacy switch cannot grant writes");
    await grantGoalsMcp(host, home, project, clientId);
    const tools = (await sdk.listTools()).tools;
    for (const alias of Object.values(aliases)) assert.ok(tools.some(tool => tool.name === alias));
    for (const alias of tools.filter(tool => Object.values(aliases).includes(tool.name))) {
      for (const key of ["database_path", "board_id", "actor_id", "audit_actor_id", "runtime_session_id"])
        assert.equal(Object.hasOwn(alias.inputSchema.properties ?? {}, key), false);
    }
    async function call<T>(name: string, input: Record<string, unknown>): Promise<T> {
      const result = await sdk.callTool({ name, arguments: input });
      assert.notEqual(result.isError, true, JSON.stringify(result));
      const content = result.content as Array<{ type: string; text?: string }>;
      assert.equal(content[0]?.type, "text");
      return JSON.parse(content[0]!.text!) as T;
    }
    const replay = await call<typeof createdBefore & { goal_url: string }>(aliases.create, input);
    assert.deepEqual(replay, { ...createdBefore, replayed: true, goal_url: `${origin}/projects/${project.project_id}/goals/${input.goal_id}` });
    assert.deepEqual(await call(aliases.note, noteInput), { ...noteBefore, replayed: true });
    const newInput = { ...noteInput, body: "迁移后原文", idempotency_key: "after-migration" };
    const note = await call<typeof noteBefore>(aliases.note, newInput);
    assert.equal(note.replayed, false);
    assert.deepEqual(await call(aliases.note, newInput), { ...note, replayed: true });
    const stored = await host.withProject(ref, runtime => runtime.coordinator.goalEvents.readEvent(project.board_id, input.goal_id, note.event_id));
    assert.equal(stored.actor_id, auditActor); assert.equal(stored.actor_kind, "runtime");
    assert.equal((stored.payload as { body: string }).body, newInput.body);
    assert.ok(policies.includes(clientId), "policy receives the grant principal, never the historical author");
    assert.equal(policies.includes(auditActor), false);
    const listed = await call<{ goals: Array<{ goal_id: string; goal_url: string }> }>(aliases.list, {});
    assert.ok(listed.goals.some(goal => goal.goal_id === input.goal_id && goal.goal_url === replay.goal_url));
    const observations = await facts();
    assert.equal(observations.length, 14, "each actual business invocation has one attempt and one resolved result");
    assert.ok(observations.every(fact => fact.channel === "local-host.capability.v1"));
    assert.equal(observations.filter(fact => fact.kind === "result" && fact.capability.endsWith(".note") && fact.saved?.event_refs.length === 1).length, 4);
    const state = await call<{ goal_id: string; goal_url: string; intent: { title: string } }>(aliases.state, { goal_id: input.goal_id });
    assert.equal(state.goal_id, input.goal_id); assert.equal(state.goal_url, replay.goal_url); assert.equal(state.intent.title, input.title);
    const eventPage = await call<{ events: Array<{ event_id: string }>; next_cursor: number | null }>(aliases.events, { goal_id: input.goal_id, limit: 1 });
    assert.equal(eventPage.events.length, 1); assert.ok(eventPage.next_cursor);
    const read = await call<typeof stored>(aliases.event, { goal_id: input.goal_id, event_id: note.event_id });
    assert.deepEqual(read, stored);
    assert.equal((await facts()).length, 20, "three query aliases are each observed exactly once");
    const configuredInput = { goal_id: input.goal_id, expected_version: 0, idempotency_key: "legacy-config", types: [{ type_id: "work", version: 1,
      name: "工作", purpose: "保留原文", fields: [{ field_id: "body", name: "正文", purpose: "历史", format: "text", required: true }] }] };
    const configured = await call<{ event_id: string; replayed: boolean }>("molis_work_v1_event_configure", configuredInput);
    assert.deepEqual(await call("molis_work_v1_event_configure", configuredInput), { ...configured, replayed: true });
    const reportInput = { goal_id: input.goal_id, idempotency_key: "legacy-report", events: [{ type_id: "work", type_version: 1, title: "旧名称报告", fields: { body: "Session 作者保持" } }] };
    const reported = await call<{ events: Array<{ actor_id: string; payload: { body: string } }>; replayed: boolean }>("molis_work_v1_event_report", reportInput);
    assert.equal(reported.events[0]?.actor_id, auditActor); assert.equal(reported.events[0]?.payload.body, "Session 作者保持");
    assert.deepEqual(await call("molis_work_v1_event_report", reportInput), { ...reported, replayed: true });
    assert.equal((await facts()).filter(fact => fact.capability.endsWith(".report")).length, 4);
    const inspect = await openWorkSessionRegistry({ homeDirectory: home });
    try {
      assert.equal(inspect.get(sessionId).current_goal_id, input.goal_id);
      assert.equal(inspect.events(sessionId).filter(event => event.source_id === `${aliases.note}:after-migration`).length, 1);
    } finally { inspect.close(); }
    for (const field of ["actor_id", "audit_actor_id", "runtime_session_id", "database_path", "board_id"]) {
      assert.equal((await sdk.callTool({ name: aliases.note, arguments: { ...newInput, [field]: "forged" } })).isError, true);
    }
    await writeMcpToolPreference(home, { [aliases.note]: false });
    assert.equal((await names()).includes(aliases.note), false);
    assert.equal((await names()).includes(hostActionToolName(goalsActions.note)), true);
    await writeMcpToolPreference(home, {});
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
    const events = await host.withProject(ref, runtime => runtime.coordinator.goalEvents.listEvents(project.board_id, input.goal_id));
    assert.equal(events.events.filter(event => event.kind === "system" && event.payload.operation === "observation_note").length, 2);
    const stateView = (await host.inspectActions(caller, ref)).find(view => view.capability_id === goalsActions.state.capability_id)!;
    await writeMcpActionGrant(home, createMcpActionGrant(clientId, project.project_id, stateView, false));
    const withoutState = await names();
    assert.equal(withoutState.includes(aliases.state), false);
    assert.equal(withoutState.includes(hostActionToolName(goalsActions.state)), false);
    assert.equal((await sdk.callTool({ name: aliases.state, arguments: { goal_id: input.goal_id } })).isError, true);
    assert.equal((await sdk.callTool({ name: hostActionToolName(goalsActions.state), arguments: { goal_id: input.goal_id } })).isError, true);
    assert.ok(withoutState.includes(aliases.event), "revoking state does not revoke a separately granted event query");
    const other = new LocalMcpServer(withCatalog, "runtime", { projectId: project.project_id, databasePath: project.database_path,
      boardId: project.board_id, webBaseUrl: origin }, { homeDirectory: home, runtimeContext: { ...context, runtime_id: "stranger" } }, undefined, origin);
    try { await assert.rejects(other.callTool(aliases.list, {}), { code: "mcp.tool_disabled" }); } finally { await other.close(); }
    const management = new LocalMcpServer(withCatalog, "management", { projectId: project.project_id, databasePath: project.database_path,
      boardId: project.board_id, webBaseUrl: origin }, { homeDirectory: home, runtimeContext: context }, undefined, origin);
    try {
      assert.ok(JSON.parse(await management.callTool(aliases.list, {})).goals.some((goal: { goal_id: string }) => goal.goal_id === input.goal_id));
      await assert.rejects(management.callTool(aliases.create, { ...input, database_path: project.database_path, actor_id: "user" }), { code: "mcp.unexpected_field" });
    } finally { await management.close(); }
  } finally {
    release?.(); await pending?.catch(() => undefined); await sdk.close();
    await new Promise<void>(resolve => server.close(() => resolve())); await host.close(); await rm(home, { recursive: true, force: true });
  }
});
