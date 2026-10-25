import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { symlink } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { LocalMcpServer, createMolisWorkLocalHost, runV1Cli } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LOCAL_PERSON_ACTOR_ID, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { currentCallId } from "@molis-ai/molis-work-kernel";
import { molisWorkActionToolName } from "@molis-ai/molis-work-app-mcp";
import { grantMcpAction, revokeMcpAction, LocalHostHttpClient } from "@molis-ai/molis-work-test-kit/local-host-http";
import type { McpToolResult } from "@molis-ai/molis-work-app-mcp";
import { FORGED_CALL, residentManagement } from "./fixtures/resident-management.js";
import { boardSnapshot } from "./fixtures/goal-application.js";

function oneRecord(host: Awaited<ReturnType<typeof residentManagement>>["host"], project: string, id: unknown, capability: string) {
  assert.equal(typeof id, "string"); assert.notEqual(id, FORGED_CALL);
  const rows = host.callLog!.find(String(id));
  assert.deepEqual(rows.map(row => [row.path ?? "action", row.capability_id, row.actor_id, row.audience, row.project_id]),
    [["action", capability, LOCAL_PERSON_ACTOR_ID, "user", project]]);
}

test("W3-07-7-03 CLI and management MCP reuse the resident project and its actual operation number, including a database alias", async t => {
  const operations: string[] = [];
  const env = await residentManagement(t, { actionAvailability: (_caller, action) => {
    if (action.capability_id === "goals.snapshot.read") operations.push(currentCallId()!);
    return { available: true };
  } });
  const alias = join(env.home, "same-project.db"); await symlink(env.project.database_path, alias);
  const fallbackOpened: string[] = [];
  const fallbackHost = createMolisWorkLocalHost({ onRuntimeOpen: ref => fallbackOpened.push(ref.storage_key) });
  const mcp = new LocalMcpServer(withMolisWorkProjectCatalog, "management", null, { homeDirectory: env.home, runtimeContext: { runtime_id: "management-test", stable_work_context_id: "resident-test", host_declares_stable: true } }, fallbackHost, env.origin);
  t.after(async () => { await mcp.close(); await fallbackHost.close(); });
  const cli = await promisify(execFile)(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../apps/desktop/launchers/cli/main.ts", import.meta.url)),
    "v1", "snapshot", "--db", alias, "--json", JSON.stringify({ project_id: env.project.project_id, call_id: FORGED_CALL })],
    { env: { ...process.env, MOLIS_WORK_HOME: env.home, MOLIS_WORK_WEB_URL: env.origin }, timeout: 10_000 });
  assert.deepEqual(JSON.parse(cli.stdout), await env.host.withProject(env.reference, runtime => boardSnapshot(runtime.store, env.project.project_id)));
  assert.ok(operations.length > 0); const cliId = operations.at(-1)!;
  assert.notEqual(cliId, FORGED_CALL); assert.match(cliId, /^[0-9a-f]{8}-[0-9a-f-]{27}$/);
  assert.deepEqual(env.host.callLog!.find(cliId), [], "a successful snapshot read has no durable invocation row");
  const listed = await mcp.handleMessage({ id: 2, method: "tools/list" }) as { result: { tools: { name: string; inputSchema: { properties?: Record<string, unknown>; required?: string[] } }[] } };
  const initialize = listed.result.tools.find(tool => tool.name === "molis_work_v1_initialize");
  assert.ok(initialize, "management discovery does not require a Runtime gateway grant");
  // PLIB-15 (S8): the tool keeps its name and no longer asks for a title: the project's name is the directory's, not Goals'.
  assert.deepEqual(initialize.inputSchema.required, ["project_id", "idempotency_key"]);
  assert.equal("title" in (initialize.inputSchema.properties ?? {}), false);
  const reply = await mcp.handleMessage({ id: 1, method: "tools/call", params: { name: "molis_work_v1_initialize",
    arguments: { database_path: alias, project_id: env.project.project_id, idempotency_key: `project-catalog-create-${env.project.project_id}` },
    _meta: { call_id: FORGED_CALL, "molis-work/callId": FORGED_CALL } } }) as { result: McpToolResult };
  assert.notEqual(reply.result.isError, true, JSON.stringify(reply.result));
  const replay = JSON.parse(reply.result.content.find(block => block.type === "text")!.text);
  assert.equal(replay.replayed, true, "management replays the Catalog initialization rather than creating a second Board");
  oneRecord(env.host, env.project.project_id, reply.result._meta?.["molis-work/callId"], "goals.board.initialize");
  assert.deepEqual(env.host.callLog!.find(FORGED_CALL), []);
  assert.deepEqual(fallbackOpened, [], "neither entry opens another project executor");
  assert.deepEqual(env.opened, [env.reference.storage_key], "the resident reuses its already-open catalog path");
  const direct = await env.post({ ...env.body({ idempotency_key: `project-catalog-create-${env.project.project_id}` }), database_path: alias });
  assert.equal(direct.status, 200, "the gateway also canonicalizes an alias supplied directly");
});

test("W3-07-7-01 a stopped resident and a standalone database retain the original in-process management path", async t => {
  const env = await residentManagement(t); await env.stop();
  const fallbackOpened: string[] = [];
  // The in-process Host of the command line is the Home's: Goals runs in it over the project's library like in the resident.
  const fallbackHost = createMolisWorkLocalHost({ homeDirectory: env.home, completeText: null, onRuntimeOpen: ref => fallbackOpened.push(ref.storage_key) });
  t.mock.method(console, "log", () => undefined);
  // Closed before the fixture removes the Home it runs in (the Home's plugins write their stop records there).
  try {
    await runV1Cli(["snapshot", "--db", env.project.database_path, "--json", JSON.stringify({ project_id: env.project.project_id })],
      { homeDirectory: env.home, actionServiceUrl: env.origin, localHost: fallbackHost });
    assert.deepEqual(fallbackOpened, [env.reference.storage_key]);
    const standalone = join(env.home, "standalone.db");
    await runV1Cli(["init", "--db", standalone, "--json", JSON.stringify({ project_id: "standalone", idempotency_key: "standalone" })],
      { homeDirectory: env.home, actionServiceUrl: "invalid-address", localHost: fallbackHost });
    assert.deepEqual(fallbackOpened, [env.reference.storage_key, standalone]);
  } finally { await fallbackHost.close(); }
});

test("W3-07-7-01 an online refusal preserves its code and details and never opens a fallback project", async t => {
  const env = await residentManagement(t, { actionAvailability: (_caller, action) => action.capability_id === "goals.snapshot.read"
    ? { available: false, code: "goals.test_refused", reason: "常驻入口拒绝" } : { available: true } });
  const opened: string[] = [];
  const fallbackHost = createMolisWorkLocalHost({ onRuntimeOpen: ref => opened.push(ref.storage_key) });
  t.after(() => fallbackHost.close());
  await assert.rejects(runV1Cli(["snapshot", "--db", env.project.database_path, "--json", JSON.stringify({ project_id: env.project.project_id })],
    { homeDirectory: env.home, actionServiceUrl: env.origin, localHost: fallbackHost }), { code: "goals.test_refused", message: "常驻入口拒绝" });
  assert.deepEqual(opened, []);
});

test("W3-07-7-03 an authorized management action tool still executes through the resident Runtime gateway and keeps its grants", async t => {
  const env = await residentManagement(t), actor = "runtime:management-actions";
  const action: ActionDefinition<{ text: string }, { saved: number }> = { capability_id: "unknown.management.save", version: 1, operation: "command", action: {
    title: "Save management note", description: "Persistent routing fixture", kind: "operation", scope: "project", audiences: ["mcp"], permissions: ["notes:write"], subject_kinds: [],
    input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
    output_schema: { type: "object", properties: { saved: { type: "integer" } }, required: ["saved"], additionalProperties: false } } };
  await env.host.withProject(env.reference, runtime => {
    runtime.store.db.exec("CREATE TABLE management_notes (actor TEXT NOT NULL, text TEXT NOT NULL)");
    env.host.actionRegistry(env.reference).registerProvider({ provider: { provider_id: "management-routing", title: "Routing", kind: "plugin", plugin_id: "io.molis.work.example.routing" },
      definitions: [action], handlers: [{ ...action, handle: async (context, input) => {
        await context.beforeEffect?.();
        runtime.store.db.prepare("INSERT INTO management_notes VALUES (?, ?)").run(context.actor_id, (input as { text: string }).text);
        return { saved: Number((runtime.store.db.prepare("SELECT count(*) AS n FROM management_notes").get() as { n: number }).n) };
      } }] });
  });
  const context = { runtime_id: "management-actions", stable_work_context_id: "management-action-session", host_declares_stable: true };
  await env.catalog.bindRuntimeContext({ context, project_id: env.project.project_id, actor_id: "user", user_confirmed: true });
  const web = new LocalHostHttpClient({ origin: env.origin, controlToken: env.token });
  const reference = { capability_id: action.capability_id, version: 1, provider_id: "management-routing" };
  await grantMcpAction(web, { clientId: actor, projectId: env.project.project_id, action: reference });
  const opened: string[] = [], fallbackHost = createMolisWorkLocalHost({ onRuntimeOpen: ref => opened.push(ref.storage_key) });
  const mcp = new LocalMcpServer(withMolisWorkProjectCatalog, "management", { projectId: env.project.project_id,
    databasePath: env.project.database_path, webBaseUrl: env.origin }, { homeDirectory: env.home, runtimeContext: context }, fallbackHost, env.origin);
  t.after(async () => { await mcp.close(); await fallbackHost.close(); });
  const message = { id: 1, method: "tools/call", params: { name: molisWorkActionToolName(action), arguments: { text: "唯一常驻写入" } } };
  const reply = await mcp.handleMessage(message) as { result: McpToolResult };
  assert.notEqual(reply.result.isError, true); assert.deepEqual(reply.result.structuredContent, { saved: 1 });
  const callId = reply.result._meta?.["molis-work/callId"];
  assert.deepEqual(env.host.callLog!.find(String(callId)).map(row => [row.capability_id, row.actor_id, row.audience]), [[action.capability_id, actor, "mcp"]]);
  await revokeMcpAction(web, { clientId: actor, projectId: env.project.project_id, action: reference });
  const refused = await mcp.handleMessage(message) as { result: McpToolResult };
  assert.equal(refused.result.isError, true);
  const rows = await env.host.withProject(env.reference, runtime => runtime.store.db.prepare("SELECT actor, text FROM management_notes").all() as { actor: string; text: string }[]);
  assert.deepEqual(rows.map(row => [row.actor, row.text]), [[actor, "唯一常驻写入"]]);
  assert.deepEqual(opened, [], "management action tools keep the resident execution and never fall back to a second project runtime");
});
