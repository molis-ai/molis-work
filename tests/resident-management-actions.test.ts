import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { symlink } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { LocalMcpServer, createMolisWorkLocalHost, runV1Cli } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { currentCallId } from "@molis-ai/molis-work-kernel";
import type { McpToolResult } from "@molis-ai/molis-work-app-mcp";
import { FORGED_CALL, residentManagement } from "./fixtures/resident-management.js";

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
  const before = env.host.callLog!.list(env.project.project_id).length;
  const cli = await promisify(execFile)(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../apps/desktop/launchers/cli/main.ts", import.meta.url)),
    "v1", "snapshot", "--db", alias, "--json", JSON.stringify({ project_id: env.project.project_id, call_id: FORGED_CALL })],
    { env: { ...process.env, MOLIS_WORK_HOME: env.home, MOLIS_WORK_WEB_URL: env.origin }, timeout: 10_000 });
  assert.deepEqual(JSON.parse(cli.stdout), await env.host.withProject(env.reference, runtime => runtime.store.snapshot(env.project.project_id)));
  const cliRows = env.host.callLog!.list(env.project.project_id).slice(0, env.host.callLog!.list(env.project.project_id).length - before);
  assert.equal(cliRows.length, 1); assert.ok(operations.includes(cliRows[0]!.call_id));
  oneRecord(env.host, env.project.project_id, cliRows[0]!.call_id, "goals.snapshot.read");
  const listed = await mcp.handleMessage({ id: 2, method: "tools/list" }) as { result: { tools: { name: string }[] } };
  assert.ok(listed.result.tools.some(tool => tool.name === "molis_work_v1_initialize"), "management discovery does not require a Runtime gateway grant");
  const reply = await mcp.handleMessage({ id: 1, method: "tools/call", params: { name: "molis_work_v1_initialize",
    arguments: { database_path: alias, project_id: env.project.project_id, title: "现行目标库", idempotency_key: "resident-mcp" },
    _meta: { call_id: FORGED_CALL, "molis-work/callId": FORGED_CALL } } }) as { result: McpToolResult };
  assert.notEqual(reply.result.isError, true);
  oneRecord(env.host, env.project.project_id, reply.result._meta?.["molis-work/callId"], "goals.board.initialize");
  assert.deepEqual(env.host.callLog!.find(FORGED_CALL), []);
  assert.deepEqual(fallbackOpened, [], "neither entry opens another project executor");
  assert.deepEqual(env.opened, [env.reference.storage_key], "the resident reuses its already-open catalog path");
  const direct = await env.post({ ...env.body(), database_path: alias });
  assert.equal(direct.status, 200, "the gateway also canonicalizes an alias supplied directly");
});

test("W3-07-7-01 a stopped resident and a standalone database retain the original in-process management path", async t => {
  const env = await residentManagement(t); await env.stop();
  const fallbackOpened: string[] = [];
  const fallbackHost = createMolisWorkLocalHost({ onRuntimeOpen: ref => fallbackOpened.push(ref.storage_key) });
  t.after(() => fallbackHost.close()); t.mock.method(console, "log", () => undefined);
  await runV1Cli(["snapshot", "--db", env.project.database_path, "--json", JSON.stringify({ project_id: env.project.project_id })],
    { homeDirectory: env.home, actionServiceUrl: env.origin, localHost: fallbackHost });
  assert.deepEqual(fallbackOpened, [env.reference.storage_key]);
  const standalone = join(env.home, "standalone.db");
  await runV1Cli(["init", "--db", standalone, "--json", JSON.stringify({ project_id: "standalone", title: "独立项目", idempotency_key: "standalone" })],
    { homeDirectory: env.home, actionServiceUrl: "invalid-address", localHost: fallbackHost });
  assert.deepEqual(fallbackOpened, [env.reference.storage_key, standalone]);
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
